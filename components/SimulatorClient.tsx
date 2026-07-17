'use client';

import { useMemo, useState } from 'react';
import type { DataQuality } from '@/lib/integrations';
import { computeRisk, type RiskHoldingInput } from '@/lib/domain/risk';
import { computePortfolioHealth, type HealthHoldingInput } from '@/lib/domain/portfolioHealth';
import { computeSectorWeights } from '@/lib/domain/investmentMemo';
import type { HoldingView, PortfolioOverview } from '@/lib/domain/portfolio';
import type { SimulatorBaseline } from '@/lib/domain/simulator';

const RISK_LABELS: Record<string, string> = {
  concentrationRisk: 'Concentration',
  sectorRisk: 'Sector concentration',
  volatilityRisk: 'Volatility',
  betaRisk: 'Beta vs. SPY',
  drawdownRisk: 'Drawdown',
  valuationRisk: 'Valuation',
  earningsRisk: 'Earnings-event proxy',
  regulatoryRisk: 'Regulatory exposure',
  liquidityRisk: 'Liquidity',
  macroRisk: 'Macro sensitivity',
  newsRisk: 'News/controversy',
  stalenessRisk: 'Data staleness',
};

function buildView(symbol: string, name: string, sector: string | null, qty: number, price: number, avgCostBasis: number, asOf: Date, quality: DataQuality): HoldingView {
  const marketValue = qty * price;
  const costBasisTotal = qty * avgCostBasis;
  const unrealizedPnl = marketValue - costBasisTotal;
  return {
    id: symbol,
    symbol,
    name,
    sector,
    quantity: qty,
    avgCostBasis,
    currentPrice: price,
    changePercent: 0,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPercent: costBasisTotal > 0 ? (unrealizedPnl / costBasisTotal) * 100 : 0,
    quoteAsOf: asOf,
    quoteQuality: quality,
  };
}

export default function SimulatorClient({ baseline }: { baseline: SimulatorBaseline }) {
  const [shares, setShares] = useState<Record<string, number>>(
    () => Object.fromEntries(baseline.holdings.map((h) => [h.symbol, h.quantity]))
  );

  const isDirty = baseline.holdings.some((h) => shares[h.symbol] !== h.quantity);

  const { risk, health, sectorWeights, hypotheticalCash, largestPosition } = useMemo(() => {
    const views = baseline.holdings.map((h) =>
      buildView(h.symbol, h.name, h.sector, shares[h.symbol] ?? h.quantity, h.currentPrice, h.avgCostBasis, h.quoteAsOf, h.quoteQuality)
    );
    const sumMarketValue = views.reduce((s, v) => s + v.marketValue, 0);
    // Total portfolio value stays fixed (this is a reallocation, not new
    // capital) — cash is the residual after hypothetical position sizes.
    const hypotheticalCash = baseline.totalValue - sumMarketValue;

    const riskHoldings: RiskHoldingInput[] = baseline.holdings.map((h, i) => ({
      view: views[i],
      history: h.history,
      fundamentals: h.fundamentals,
      daysSinceLastFiling: h.daysSinceLastFiling,
      daysToNextEarnings: h.daysToNextEarnings,
      negativeNewsCritical: h.negativeNewsCritical,
      negativeNewsHigh: h.negativeNewsHigh,
    }));
    const risk = computeRisk({
      holdings: riskHoldings,
      totalValue: baseline.totalValue,
      cashBalance: hypotheticalCash,
      sp500History: baseline.sp500History,
      portfolioHistory: baseline.portfolioHistory,
      quoteQualities: baseline.holdings.map((h) => h.quoteQuality),
    });

    const healthHoldings: HealthHoldingInput[] = baseline.holdings.map((h, i) => ({
      view: views[i],
      trend: h.trend,
      convictionScore: h.convictionScore,
      valuationScore: h.valuationScore,
      revenueGrowth: h.revenueGrowth,
    }));
    const health = computePortfolioHealth({
      holdings: healthHoldings,
      totalValue: baseline.totalValue,
      cashBalance: hypotheticalCash,
      risk: { overallScore: risk.overallScore, concentrationRisk: risk.concentrationRisk.score, sectorRisk: risk.sectorRisk.score, macroRisk: risk.macroRisk.score },
    });

    const syntheticOverview: PortfolioOverview = {
      totalValue: baseline.totalValue,
      cashBalance: hypotheticalCash,
      dayChangeValue: 0,
      dayChangePercent: 0,
      sp500Level: 0,
      holdings: views,
      largestWinner: null,
      largestLoser: null,
      asOf: new Date(),
    };
    const sectorWeights = computeSectorWeights(syntheticOverview);

    const largestPosition = [...views].sort((a, b) => b.marketValue - a.marketValue)[0] ?? null;

    return { risk, health, sectorWeights, hypotheticalCash, largestPosition };
  }, [baseline, shares]);

  const largestRiskEntry = Object.entries(RISK_LABELS)
    .map(([key, label]) => ({ key, label, score: (risk as unknown as Record<string, { score: number }>)[key].score }))
    .sort((a, b) => b.score - a.score)[0];

  const overAllocated = hypotheticalCash < 0;

  function updateShares(symbol: string, qty: number) {
    setShares((prev) => ({ ...prev, [symbol]: Math.max(0, qty) }));
  }

  function reset() {
    setShares(Object.fromEntries(baseline.holdings.map((h) => [h.symbol, h.quantity])));
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Hypothetical allocation</h2>
          {isDirty && (
            <button onClick={reset} className="rounded border border-gray-300 px-3 py-1 text-xs dark:border-gray-700">
              Reset to current
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <th className="py-1 pr-2">Symbol</th>
                <th className="py-1 pr-2">Current shares</th>
                <th className="py-1 pr-2">Hypothetical shares</th>
                <th className="py-1 pr-2">Market value</th>
                <th className="py-1 pr-2">Weight</th>
              </tr>
            </thead>
            <tbody>
              {baseline.holdings.map((h) => {
                const qty = shares[h.symbol] ?? h.quantity;
                const marketValue = qty * h.currentPrice;
                const weight = baseline.totalValue > 0 ? (marketValue / baseline.totalValue) * 100 : 0;
                const changed = qty !== h.quantity;
                return (
                  <tr key={h.symbol} className="border-b border-gray-50 dark:border-gray-900">
                    <td className="py-1.5 pr-2 font-medium">{h.symbol}</td>
                    <td className="py-1.5 pr-2 text-gray-500 dark:text-gray-400">{h.quantity}</td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={qty}
                        onChange={(e) => updateShares(h.symbol, Number(e.target.value))}
                        className={`w-24 rounded border px-2 py-1 text-sm dark:bg-transparent ${changed ? 'border-blue-400' : 'border-gray-300 dark:border-gray-700'}`}
                      />
                    </td>
                    <td className="py-1.5 pr-2">${marketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="py-1.5 pr-2">{weight.toFixed(1)}%</td>
                  </tr>
                );
              })}
              <tr>
                <td className="py-1.5 pr-2 font-medium">Cash</td>
                <td className="py-1.5 pr-2 text-gray-500 dark:text-gray-400">
                  ${baseline.cashBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td colSpan={1} />
                <td className={`py-1.5 pr-2 font-medium ${overAllocated ? 'text-risk-high' : ''}`}>
                  ${hypotheticalCash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td className="py-1.5 pr-2">{baseline.totalValue > 0 ? ((hypotheticalCash / baseline.totalValue) * 100).toFixed(1) : '0.0'}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        {overAllocated && (
          <p className="mt-2 text-xs text-risk-high">
            This allocation spends ${Math.abs(hypotheticalCash).toLocaleString(undefined, { maximumFractionDigits: 0 })} more
            than the portfolio&rsquo;s total value (${baseline.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}) —
            not achievable without margin.
          </p>
        )}
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Total portfolio value stays fixed at ${baseline.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} —
          this simulates reallocating existing capital, not adding new money. Nothing here is saved or sent anywhere;
          it recomputes live in your browser from{' '}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">lib/domain/risk.ts</code> and{' '}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">lib/domain/portfolioHealth.ts</code>, the same
          engines behind /risk and /health.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Portfolio risk score</p>
          <p className="text-2xl font-semibold">{risk.overallScore}/100</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Portfolio health score</p>
          <p className="text-2xl font-semibold">{health.overallScore}/100</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Largest position</p>
          <p className="text-2xl font-semibold">{largestPosition?.symbol ?? 'n/a'}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {largestPosition && baseline.totalValue > 0 ? `${((largestPosition.marketValue / baseline.totalValue) * 100).toFixed(1)}% of portfolio` : ''}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Largest risk factor</p>
          <p className="text-2xl font-semibold">{largestRiskEntry?.score ?? 'n/a'}/100</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{largestRiskEntry?.label ?? ''}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-3 font-medium">Sector exposure</h2>
        <div className="space-y-2">
          {Object.entries(sectorWeights)
            .sort((a, b) => b[1] - a[1])
            .map(([sector, pct]) => (
              <div key={sector} className="flex items-center gap-2 text-sm">
                <span className="w-40 shrink-0 truncate text-gray-600 dark:text-gray-400">{sector}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div className="h-full bg-blue-500" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <span className="w-14 shrink-0 text-right text-gray-500 dark:text-gray-400">{pct.toFixed(1)}%</span>
              </div>
            ))}
          {Object.keys(sectorWeights).length === 0 && <p className="text-sm text-gray-500">No sector data available.</p>}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-3 font-medium">Risk breakdown</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(RISK_LABELS).map(([key, label]) => {
            const component = (risk as unknown as Record<string, { score: number; explanation: string }>)[key];
            return (
              <div key={key} className="rounded border border-gray-100 px-3 py-2 text-xs dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{label}</span>
                  <span className="font-medium">{component.score}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isDirty && (
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="mb-3 font-medium">Allocation changes vs. current portfolio</h2>
          <ul className="space-y-1 text-sm">
            {baseline.holdings
              .filter((h) => (shares[h.symbol] ?? h.quantity) !== h.quantity)
              .map((h) => {
                const newQty = shares[h.symbol] ?? h.quantity;
                const deltaQty = newQty - h.quantity;
                const deltaValue = deltaQty * h.currentPrice;
                return (
                  <li key={h.symbol} className="flex items-center justify-between">
                    <span>
                      {h.symbol}: {h.quantity} → {newQty} shares
                    </span>
                    <span className={deltaValue >= 0 ? 'text-risk-high' : 'text-risk-low'}>
                      {deltaValue >= 0 ? '+' : '-'}${Math.abs(deltaValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}
