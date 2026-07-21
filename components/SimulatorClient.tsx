'use client';

import { useMemo, useState } from 'react';
import { computeSimulatedMetrics } from '@/lib/domain/simulatorMetrics';
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

export default function SimulatorClient({ baseline }: { baseline: SimulatorBaseline }) {
  const [shares, setShares] = useState<Record<string, number>>(
    () => Object.fromEntries(baseline.holdings.map((h) => [h.symbol, h.quantity]))
  );

  const isDirty = baseline.holdings.some((h) => shares[h.symbol] !== h.quantity);

  const { risk, health, sectorWeights, hypotheticalCash, largestPosition } = useMemo(
    () => computeSimulatedMetrics(baseline, shares),
    [baseline, shares]
  );

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
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-atlas-text">Hypothetical allocation</h2>
          {isDirty && (
            <button
              onClick={reset}
              className="rounded-lg border border-atlas-border px-3 py-1 text-xs text-atlas-text-secondary transition-colors hover:border-atlas-accent/40 hover:text-atlas-text active:scale-[0.97]"
            >
              Reset to current
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-atlas-border-subtle text-left text-[11px] uppercase tracking-wide text-atlas-text-tertiary">
                <th className="py-2 pr-4 font-medium">Symbol</th>
                <th className="py-2 pr-4 font-medium">Current shares</th>
                <th className="py-2 pr-4 font-medium">Hypothetical shares</th>
                <th className="py-2 pr-4 font-medium">Market value</th>
                <th className="py-2 pr-4 font-medium">Weight</th>
              </tr>
            </thead>
            <tbody>
              {baseline.holdings.map((h) => {
                const qty = shares[h.symbol] ?? h.quantity;
                const marketValue = qty * h.currentPrice;
                const weight = baseline.totalValue > 0 ? (marketValue / baseline.totalValue) * 100 : 0;
                const changed = qty !== h.quantity;
                return (
                  <tr key={h.symbol} className="border-b border-atlas-border-subtle/60">
                    <td className="py-2 pr-4 font-medium text-atlas-text">{h.symbol}</td>
                    <td className="py-2 pr-4 font-mono text-atlas-text-tertiary">{h.quantity}</td>
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={qty}
                        onChange={(e) => updateShares(h.symbol, Number(e.target.value))}
                        className={`w-24 rounded-lg border bg-atlas-surface-raised px-2 py-1 text-sm text-atlas-text focus:outline-none focus:ring-1 focus:ring-atlas-accent/40 ${
                          changed ? 'border-atlas-accent/50' : 'border-atlas-border'
                        }`}
                      />
                    </td>
                    <td className="py-2 pr-4 font-mono text-atlas-text-secondary">
                      ${marketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 pr-4 font-mono text-atlas-text-secondary">{weight.toFixed(1)}%</td>
                  </tr>
                );
              })}
              <tr>
                <td className="py-2 pr-4 font-medium text-atlas-text">Cash</td>
                <td className="py-2 pr-4 font-mono text-atlas-text-tertiary">
                  ${baseline.cashBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td />
                <td className={`py-2 pr-4 font-mono font-medium ${overAllocated ? 'text-risk-high' : 'text-atlas-text'}`}>
                  ${hypotheticalCash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td className="py-2 pr-4 font-mono text-atlas-text-secondary">
                  {baseline.totalValue > 0 ? ((hypotheticalCash / baseline.totalValue) * 100).toFixed(1) : '0.0'}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {overAllocated && (
          <p className="mt-3 text-xs text-risk-high">
            This allocation spends ${Math.abs(hypotheticalCash).toLocaleString(undefined, { maximumFractionDigits: 0 })} more
            than the portfolio&rsquo;s total value (${baseline.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}) —
            not achievable without margin.
          </p>
        )}
        <p className="mt-3 text-xs text-atlas-text-tertiary">
          Total portfolio value stays fixed at ${baseline.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} —
          this simulates reallocating existing capital, not adding new money. Nothing here is saved or sent anywhere;
          it recomputes live in your browser from{' '}
          <code className="rounded bg-atlas-surface-raised px-1">lib/domain/risk.ts</code> and{' '}
          <code className="rounded bg-atlas-surface-raised px-1">lib/domain/portfolioHealth.ts</code>, the same
          engines behind /risk and /health.
        </p>
      </div>

      <div className="flex flex-wrap gap-x-10 gap-y-4 border-y border-atlas-border-subtle py-5">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Portfolio risk score</p>
          <p className="mt-1 font-mono text-lg text-atlas-text">{risk.overallScore}/100</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Portfolio health score</p>
          <p className="mt-1 font-mono text-lg text-atlas-text">{health.overallScore}/100</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Largest position</p>
          <p className="mt-1 font-mono text-lg text-atlas-text">{largestPosition?.symbol ?? 'n/a'}</p>
          <p className="mt-0.5 text-xs text-atlas-text-tertiary">
            {largestPosition && baseline.totalValue > 0 ? `${((largestPosition.marketValue / baseline.totalValue) * 100).toFixed(1)}% of portfolio` : ''}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Largest risk factor</p>
          <p className="mt-1 font-mono text-lg text-atlas-text">{largestRiskEntry?.score ?? 'n/a'}/100</p>
          <p className="mt-0.5 text-xs text-atlas-text-tertiary">{largestRiskEntry?.label ?? ''}</p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-atlas-text">Sector exposure</h2>
        <div className="space-y-2.5">
          {Object.entries(sectorWeights)
            .sort((a, b) => b[1] - a[1])
            .map(([sector, pct]) => (
              <div key={sector} className="flex items-center gap-2 text-sm">
                <span className="w-40 shrink-0 truncate text-atlas-text-secondary">{sector}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-atlas-border">
                  <div
                    className="h-full rounded-full bg-atlas-accent-bright transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right font-mono text-atlas-text-tertiary">{pct.toFixed(1)}%</span>
              </div>
            ))}
          {Object.keys(sectorWeights).length === 0 && <p className="text-sm text-atlas-text-tertiary">No sector data available.</p>}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-atlas-text">Risk breakdown</h2>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(RISK_LABELS).map(([key, label]) => {
            const component = (risk as unknown as Record<string, { score: number; explanation: string }>)[key];
            return (
              <div key={key} className="flex items-center justify-between border-b border-atlas-border-subtle/60 pb-2 text-xs">
                <span className="text-atlas-text-tertiary">{label}</span>
                <span className="font-mono font-medium text-atlas-text-secondary">{component.score}</span>
              </div>
            );
          })}
        </div>
      </div>

      {isDirty && (
        <div className="border-t border-atlas-border-subtle pt-6">
          <h2 className="mb-3 text-sm font-medium text-atlas-text">Allocation changes vs. current portfolio</h2>
          <ul className="space-y-1.5 text-sm">
            {baseline.holdings
              .filter((h) => (shares[h.symbol] ?? h.quantity) !== h.quantity)
              .map((h) => {
                const newQty = shares[h.symbol] ?? h.quantity;
                const deltaQty = newQty - h.quantity;
                const deltaValue = deltaQty * h.currentPrice;
                return (
                  <li key={h.symbol} className="flex items-center justify-between">
                    <span className="text-atlas-text-secondary">
                      {h.symbol}: {h.quantity} → {newQty} shares
                    </span>
                    <span className={`font-mono ${deltaValue >= 0 ? 'text-risk-high' : 'text-risk-low'}`}>
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
