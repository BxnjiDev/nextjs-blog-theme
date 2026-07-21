import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { getPortfolioOverview } from '@/lib/domain/portfolio';
import { formatCurrency, formatPercent, formatRelativeTime } from '@/lib/format';
import AllocationDonut from '@/components/charts/AllocationDonut';
import AutoRefresh from '@/components/AutoRefresh';
import FadeInView from '@/components/motion/FadeInView';
import AnimatedNumber from '@/components/motion/AnimatedNumber';
import HoldingsTable from '@/components/portfolio/HoldingsTable';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const overview = await getPortfolioOverview();

  if (!overview) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h1 className="text-xl font-semibold text-atlas-text">No account connected yet</h1>
        <p className="mt-3 max-w-sm text-sm text-atlas-text-secondary">
          Run <code className="rounded bg-atlas-surface-raised px-1.5 py-0.5">npm run db:seed</code> for sample
          data, or connect a real brokerage account on the{' '}
          <Link href="/connections" className="text-atlas-accent-bright underline">
            Connections
          </Link>{' '}
          page.
        </p>
      </div>
    );
  }

  const vsSp500 = overview.dayChangePercent; // placeholder until a benchmark daily-change feed exists
  const dayPositive = overview.dayChangePercent >= 0;

  return (
    <div className="space-y-16">
      <AutoRefresh />

      {/* Hero — the analytical read starts with one large number, not a
          grid of equal-weight cards. Everything else is secondary. */}
      <FadeInView>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-atlas-text-tertiary">Portfolio</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-4">
          <AnimatedNumber
            value={overview.totalValue}
            format="currency0"
            className="text-6xl font-semibold tracking-tight text-atlas-text"
            duration={1.1}
          />
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium ${
              dayPositive ? 'bg-risk-low/10 text-risk-low' : 'bg-risk-high/10 text-risk-high'
            }`}
          >
            {dayPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {formatCurrency(Math.abs(overview.dayChangeValue))} ({formatPercent(overview.dayChangePercent)})
          </span>
        </div>
        <p className="mt-3 text-sm text-atlas-text-tertiary">
          Last updated {formatRelativeTime(overview.lastSyncedAt)} · mock data unless a real account has been
          synced — see{' '}
          <Link href="/connections" className="underline decoration-atlas-border hover:decoration-atlas-text-secondary">
            Connections
          </Link>
          .
        </p>
      </FadeInView>

      {/* Thin analytics strip — plain label/value pairs separated by
          hairlines, deliberately not another row of boxed cards. */}
      <FadeInView delay={0.05}>
        <div className="flex flex-wrap gap-x-10 gap-y-4 border-y border-atlas-border-subtle py-5">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Cash balance</p>
            <p className="mt-1 font-mono text-lg text-atlas-text">{formatCurrency(overview.cashBalance)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">vs. S&amp;P 500 (day)</p>
            <p className={`mt-1 font-mono text-lg ${vsSp500 >= 0 ? 'text-risk-low' : 'text-risk-high'}`}>
              {formatPercent(vsSp500)}
              <span className="ml-1.5 text-xs text-atlas-text-tertiary">@ {overview.sp500Level.toLocaleString()}</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Largest winner</p>
            <p className="mt-1 font-mono text-lg text-atlas-text">
              {overview.largestWinner ? (
                <>
                  {overview.largestWinner.symbol}{' '}
                  <span className="text-risk-low">{formatPercent(overview.largestWinner.changePercent)}</span>
                </>
              ) : (
                <span className="text-atlas-text-tertiary">—</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Largest loser</p>
            <p className="mt-1 font-mono text-lg text-atlas-text">
              {overview.largestLoser ? (
                <>
                  {overview.largestLoser.symbol}{' '}
                  <span className="text-risk-high">{formatPercent(overview.largestLoser.changePercent)}</span>
                </>
              ) : (
                <span className="text-atlas-text-tertiary">—</span>
              )}
            </p>
          </div>
        </div>
      </FadeInView>

      {/* Allocation — the one place a contained "card" earns its keep,
          since a chart needs a visual frame; everything around it stays
          open. */}
      <FadeInView delay={0.1}>
        <div className="grid gap-10 lg:grid-cols-[280px_1fr]">
          <div className="atlas-glass rounded-2xl p-5">
            <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Allocation</h2>
            <AllocationDonut
              height={200}
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
            <ul className="mt-2 space-y-1.5 text-xs text-atlas-text-secondary">
              {overview.holdings.map((h) => (
                <li key={h.symbol} className="flex items-center justify-between">
                  <span>{h.symbol}</span>
                  <span className="font-mono text-atlas-text-tertiary">
                    {overview.totalValue > 0 ? ((h.marketValue / overview.totalValue) * 100).toFixed(1) : '0.0'}%
                  </span>
                </li>
              ))}
              {overview.cashBalance > 0 && (
                <li className="flex items-center justify-between">
                  <span>Cash</span>
                  <span className="font-mono text-atlas-text-tertiary">
                    {overview.totalValue > 0 ? ((overview.cashBalance / overview.totalValue) * 100).toFixed(1) : '0.0'}%
                  </span>
                </li>
              )}
            </ul>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Holdings</h2>
              <p className="text-xs text-atlas-text-tertiary">
                Deeper analysis on{' '}
                <Link href="/intelligence" className="underline decoration-atlas-border hover:decoration-atlas-text-secondary">
                  Intelligence
                </Link>{' '}
                and{' '}
                <Link href="/health" className="underline decoration-atlas-border hover:decoration-atlas-text-secondary">
                  Health
                </Link>
              </p>
            </div>
            <HoldingsTable holdings={overview.holdings} />
          </div>
        </div>
      </FadeInView>
    </div>
  );
}
