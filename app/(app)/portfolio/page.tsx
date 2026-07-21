import Link from 'next/link';
import { getPortfolioOverview } from '@/lib/domain/portfolio';
import { getPerformanceSummary } from '@/lib/domain/performance';
import { formatCurrency, formatPercent, formatRelativeTime } from '@/lib/format';
import AutoRefresh from '@/components/AutoRefresh';
import FadeInView from '@/components/motion/FadeInView';
import HeroMetric from '@/components/shared/HeroMetric';
import PerformanceChart from '@/components/portfolio/PerformanceChart';
import PortfolioComposition from '@/components/portfolio/PortfolioComposition';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const [overview, performance] = await Promise.all([getPortfolioOverview(), getPerformanceSummary()]);

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
  const concentrationPct = overview.totalValue > 0 && overview.largestWinner ? (overview.largestWinner.marketValue / overview.totalValue) * 100 : 0;

  return (
    <div className="space-y-14">
      <AutoRefresh />

      {/* Hero — shared composition with Home, so the two pages read as one
          product. Everything else here is secondary to this one number. */}
      <FadeInView>
        <HeroMetric
          eyebrow="Portfolio"
          value={overview.totalValue}
          changeValue={overview.dayChangeValue}
          changePercent={overview.dayChangePercent}
          changeLabel="today"
          meta={
            <>
              Last updated {formatRelativeTime(overview.lastSyncedAt)} · mock data unless a real account has been
              synced — see{' '}
              <Link href="/connections" className="underline decoration-atlas-border hover:decoration-atlas-text-secondary">
                Connections
              </Link>
              .
            </>
          }
        />
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
              <span className="ml-1.5 text-xs text-atlas-text-tertiary" title="S&amp;P 500 index level used for this comparison">
                S&amp;P {overview.sp500Level.toLocaleString()}
              </span>
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Holdings</p>
            <p className="mt-1 font-mono text-lg text-atlas-text">{overview.holdings.length}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Largest position</p>
            <p className="mt-1 font-mono text-lg text-atlas-text">
              {overview.largestWinner ? `${overview.largestWinner.symbol} ${concentrationPct.toFixed(1)}%` : <span className="text-atlas-text-tertiary">—</span>}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Largest mover</p>
            <p className="mt-1 font-mono text-lg text-atlas-text">
              {overview.largestWinner ? (
                <>
                  {overview.largestWinner.symbol} <span className="text-risk-low">{formatPercent(overview.largestWinner.changePercent)}</span>
                </>
              ) : (
                <span className="text-atlas-text-tertiary">—</span>
              )}
              {overview.largestLoser && overview.largestLoser.symbol !== overview.largestWinner?.symbol && (
                <>
                  {' · '}
                  {overview.largestLoser.symbol} <span className="text-risk-high">{formatPercent(overview.largestLoser.changePercent)}</span>
                </>
              )}
            </p>
          </div>
        </div>
      </FadeInView>

      {/* Performance — real Day/Week/Month windows over actual snapshot
          history, integrated into the page rather than boxed in a card. */}
      <FadeInView delay={0.1}>
        <PerformanceChart history={performance.history} />
      </FadeInView>

      {/* Allocation + holdings — one composed view; clicking a legend
          entry filters the table below it. */}
      <FadeInView delay={0.15}>
        <PortfolioComposition holdings={overview.holdings} totalValue={overview.totalValue} cashBalance={overview.cashBalance} />
      </FadeInView>
    </div>
  );
}
