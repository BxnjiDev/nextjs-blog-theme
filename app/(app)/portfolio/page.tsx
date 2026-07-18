import Link from 'next/link';
import { getPortfolioOverview } from '@/lib/domain/portfolio';
import { formatCurrency, formatPercent, formatRelativeTime } from '@/lib/format';
import StatCard from '@/components/StatCard';
import DataQualityBadge from '@/components/DataQualityBadge';
import AllocationDonut from '@/components/charts/AllocationDonut';
import AutoRefresh from '@/components/AutoRefresh';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const overview = await getPortfolioOverview();

  if (!overview) {
    return (
      <div className="rounded-lg border border-dashed border-atlas-border p-8 text-center">
        <h1 className="text-lg font-semibold text-atlas-text">No account connected yet</h1>
        <p className="mt-2 text-sm text-atlas-text-secondary">
          Run <code className="rounded bg-atlas-surface-raised px-1">npm run db:seed</code> for
          sample data, or connect a real brokerage account on the{' '}
          <Link href="/connections" className="underline">
            Connections
          </Link>{' '}
          page.
        </p>
      </div>
    );
  }

  const vsSp500 = overview.dayChangePercent; // placeholder until a benchmark daily-change feed exists

  return (
    <div className="space-y-8">
      <AutoRefresh />
      <div>
        <h1 className="text-2xl font-semibold text-atlas-text">Portfolio Overview</h1>
        <p className="mt-1 text-sm text-atlas-text-secondary">
          Mock data unless a real account has been synced — see{' '}
          <Link href="/connections" className="underline">
            Connections
          </Link>
          . Last updated {formatRelativeTime(overview.lastSyncedAt)}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total value" value={formatCurrency(overview.totalValue)} />
        <StatCard
          label="Day change"
          value={formatCurrency(overview.dayChangeValue)}
          sublabel={formatPercent(overview.dayChangePercent)}
          tone={overview.dayChangePercent >= 0 ? 'positive' : 'negative'}
        />
        <StatCard label="Cash balance" value={formatCurrency(overview.cashBalance)} />
        <StatCard
          label="vs. S&P 500 (day)"
          value={formatPercent(vsSp500)}
          sublabel={`S&P 500 @ ${overview.sp500Level.toLocaleString()}`}
          tone={vsSp500 >= 0 ? 'positive' : 'negative'}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-atlas-border bg-atlas-surface p-4">
          <h2 className="text-sm font-medium text-atlas-text-tertiary">Largest winner</h2>
          {overview.largestWinner ? (
            <p className="mt-2 text-lg text-atlas-text">
              {overview.largestWinner.symbol}{' '}
              <span className="text-risk-low">{formatPercent(overview.largestWinner.changePercent)}</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-atlas-text-tertiary">No holdings.</p>
          )}
        </div>
        <div className="rounded-lg border border-atlas-border bg-atlas-surface p-4">
          <h2 className="text-sm font-medium text-atlas-text-tertiary">Largest loser</h2>
          {overview.largestLoser ? (
            <p className="mt-2 text-lg text-atlas-text">
              {overview.largestLoser.symbol}{' '}
              <span className="text-risk-high">{formatPercent(overview.largestLoser.changePercent)}</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-atlas-text-tertiary">No holdings.</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-atlas-border bg-atlas-surface p-4">
          <h2 className="mb-2 text-sm font-medium text-atlas-text-tertiary">Allocation</h2>
          <div className="flex items-center gap-4">
            <div className="w-full max-w-[220px]">
              <AllocationDonut
                data={[
                  ...overview.holdings.map((h) => ({
                    label: h.symbol,
                    value: overview.totalValue > 0 ? (h.marketValue / overview.totalValue) * 100 : 0,
                  })),
                  ...(overview.cashBalance > 0
                    ? [{ label: 'Cash', value: (overview.cashBalance / overview.totalValue) * 100 }]
                    : []),
                ]}
              />
            </div>
            <ul className="space-y-1 text-xs text-atlas-text-secondary">
              {overview.holdings.map((h) => (
                <li key={h.symbol}>
                  {h.symbol}: {overview.totalValue > 0 ? ((h.marketValue / overview.totalValue) * 100).toFixed(1) : '0.0'}%
                </li>
              ))}
              {overview.cashBalance > 0 && (
                <li>Cash: {overview.totalValue > 0 ? ((overview.cashBalance / overview.totalValue) * 100).toFixed(1) : '0.0'}%</li>
              )}
            </ul>
          </div>
        </div>
        <div className="rounded-lg border border-dashed border-atlas-border p-4 text-sm text-atlas-text-secondary">
          Deeper analysis lives on the{' '}
          <Link href="/intelligence" className="underline">
            Intelligence
          </Link>{' '}
          and{' '}
          <Link href="/health" className="underline">
            Health
          </Link>{' '}
          pages — per-holding conviction trend, thesis history, and a full portfolio health breakdown.
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-atlas-text">Holdings</h2>
        <div className="overflow-x-auto rounded-lg border border-atlas-border">
          <table className="w-full text-sm">
            <thead className="bg-atlas-surface-raised text-left text-xs uppercase text-atlas-text-tertiary">
              <tr>
                <th className="px-4 py-2">Symbol</th>
                <th className="px-4 py-2">Qty</th>
                <th className="px-4 py-2">Price</th>
                <th className="px-4 py-2">Day %</th>
                <th className="px-4 py-2">Market value</th>
                <th className="px-4 py-2">Unrealized P&L</th>
                <th className="px-4 py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {overview.holdings.map((h) => (
                <tr key={h.id} className="border-t border-atlas-border-subtle text-atlas-text">
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/holdings#${h.symbol}`}>{h.symbol}</Link>
                  </td>
                  <td className="px-4 py-2">{h.quantity}</td>
                  <td className="px-4 py-2">{formatCurrency(h.currentPrice)}</td>
                  <td className={`px-4 py-2 ${h.changePercent >= 0 ? 'text-risk-low' : 'text-risk-high'}`}>
                    {formatPercent(h.changePercent)}
                  </td>
                  <td className="px-4 py-2">{formatCurrency(h.marketValue)}</td>
                  <td className={`px-4 py-2 ${h.unrealizedPnl >= 0 ? 'text-risk-low' : 'text-risk-high'}`}>
                    {formatCurrency(h.unrealizedPnl)} ({formatPercent(h.unrealizedPnlPercent * 100)})
                  </td>
                  <td className="px-4 py-2">
                    <DataQualityBadge quality={h.quoteQuality} asOf={h.quoteAsOf} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
