import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { getPortfolioOverview } from '@/lib/domain/portfolio';
import { getPerformanceSummary } from '@/lib/domain/performance';
import { prisma } from '@/lib/prisma';
import { formatCurrency, formatPercent, formatRelativeTime } from '@/lib/format';
import AutoRefresh from '@/components/AutoRefresh';
import FadeInView from '@/components/motion/FadeInView';
import AnimatedNumber from '@/components/motion/AnimatedNumber';
import AtlasCore from '@/components/atlas-identity/AtlasCore';
import PerformanceChart from '@/components/portfolio/PerformanceChart';
import PortfolioComposition from '@/components/portfolio/PortfolioComposition';
import { atlasStateForScore } from '@/lib/theme/tone';
import SectionHeading from '@/components/ui/SectionHeading';
import InsightStack from '@/components/intelligence/InsightStack';
import { assessPortfolioHealth, assessRisk } from '@/lib/intelligence/engine';
import { sortByPriority } from '@/lib/intelligence/scoring';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  // Same latest-RiskAssessment read already used on /connections,
  // generateBriefing, and generatePortfolioHealth — reused here, not
  // recomputed, so Portfolio's "Risk" stat and /risk's own score can never
  // drift apart. Full rows (not a narrow select) so the Intelligence
  // Layer's assessRisk/assessPortfolioHealth can reuse the same
  // plain-English per-component explanations /risk and /health show,
  // instead of Portfolio inventing a second, shallower interpretation.
  const [overview, performance, latestRisk, latestHealth] = await Promise.all([
    getPortfolioOverview(),
    getPerformanceSummary(),
    prisma.riskAssessment.findFirst({ orderBy: { generatedAt: 'desc' } }),
    prisma.portfolioHealthAssessment.findFirst({ orderBy: { generatedAt: 'desc' } }),
  ]);

  const portfolioInsights = sortByPriority([...assessPortfolioHealth(latestHealth), ...assessRisk(latestRisk)]);

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
  const dayPositive = overview.dayChangePercent >= 0;

  return (
    <div className="space-y-14">
      <AutoRefresh />

      {/* Hero — same orb + value language as Home, so the two pages read as
          one product, here reading portfolio risk instead of health.
          Everything else here is secondary to this one number. */}
      <FadeInView>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <AtlasCore state={atlasStateForScore(latestRisk?.overallScore ?? null, true)} size="xl" className="shrink-0" />
          <div className="min-w-0">
            <h1 className="sr-only">Portfolio</h1>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-atlas-text-tertiary" aria-hidden="true">Portfolio</p>
            <div className="mt-3 flex flex-wrap items-baseline gap-4">
              <AnimatedNumber
                value={overview.totalValue}
                format="currency0"
                className="text-5xl font-semibold tracking-tight text-atlas-text sm:text-6xl"
                duration={1.1}
              />
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium ${
                  dayPositive ? 'bg-risk-low/10 text-risk-low' : 'bg-risk-high/10 text-risk-high'
                }`}
              >
                {dayPositive ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}
                {formatCurrency(Math.abs(overview.dayChangeValue))} ({formatPercent(overview.dayChangePercent)})
                <span className="ml-1 text-xs opacity-70">today</span>
              </span>
            </div>
            <p className="mt-3 text-sm text-atlas-text-tertiary">
              Last updated {formatRelativeTime(overview.lastSyncedAt)} · mock data unless a real account has been synced — see{' '}
              <Link href="/connections" className="underline decoration-atlas-border hover:decoration-atlas-text-secondary">
                Connections
              </Link>
              .
            </p>
          </div>
        </div>
      </FadeInView>

      {/* Portfolio assessment — the Intelligence Layer's read on health and
          risk together, reusing the exact explanations /health and /risk
          show (assessPortfolioHealth/assessRisk in lib/intelligence/engine.ts)
          rather than Portfolio inventing its own second interpretation of
          the same two scores. */}
      <FadeInView delay={0.03}>
        <SectionHeading className="mb-3">Portfolio assessment</SectionHeading>
        <InsightStack insights={portfolioInsights} variant="list" emptyMessage="No health or risk assessment generated yet." />
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
            <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Concentration</p>
            <p className="mt-1 font-mono text-lg text-atlas-text">
              {overview.largestWinner ? `${overview.largestWinner.symbol} ${concentrationPct.toFixed(1)}%` : <span className="text-atlas-text-tertiary">—</span>}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Portfolio risk</p>
            {latestRisk ? (
              <p className={`mt-1 font-mono text-lg ${latestRisk.overallScore < 40 ? 'text-risk-low' : latestRisk.overallScore < 70 ? 'text-risk-medium' : 'text-risk-high'}`}>
                {latestRisk.overallScore}/100{' '}
                <Link href="/risk" className="text-xs text-atlas-text-tertiary underline decoration-atlas-border hover:decoration-atlas-text-secondary">
                  detail →
                </Link>
              </p>
            ) : (
              <p className="mt-1 font-mono text-lg text-atlas-text-tertiary">No data</p>
            )}
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
