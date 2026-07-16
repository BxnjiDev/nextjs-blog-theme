import Link from 'next/link';
import { getPortfolioOverview } from '@/lib/domain/portfolio';
import { formatCurrency, formatPercent } from '@/lib/format';
import StatCard from '@/components/StatCard';
import DataQualityBadge from '@/components/DataQualityBadge';
import AllocationDonut from '@/components/charts/AllocationDonut';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const overview = await getPortfolioOverview();

  if (!overview) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
        <h1 className="text-lg font-semibold">No account connected yet</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Run <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">npm run db:seed</code> for
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
      <div>
        <h1 className="text-2xl font-semibold">Portfolio Overview</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Mock data unless a real account has been synced — see{' '}
          <Link href="/connections" className="underline">
            Connections
          </Link>
          . Rendered {overview.asOf.toLocaleString()}.
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
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">Largest winner</h2>
          {overview.largestWinner ? (
            <p className="mt-2 text-lg">
              {overview.largestWinner.symbol}{' '}
              <span className="text-risk-low">{formatPercent(overview.largestWinner.changePercent)}</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-500">No holdings.</p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">Largest loser</h2>
          {overview.largestLoser ? (
            <p className="mt-2 text-lg">
              {overview.largestLoser.symbol}{' '}
              <span className="text-risk-high">{formatPercent(overview.largestLoser.changePercent)}</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-500">No holdings.</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">Allocation</h2>
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
            <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
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
        <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
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
        <h2 className="mb-3 text-lg font-semibold">Holdings</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
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
                <tr key={h.id} className="border-t border-gray-100 dark:border-gray-800">
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
