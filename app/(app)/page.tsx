import Link from 'next/link';
import { MessageSquareText, ClipboardCheck, PlusCircle, Newspaper } from 'lucide-react';
import { getHomeDashboardData } from '@/lib/domain/homeDashboard';
import { getPerformanceSummary } from '@/lib/domain/performance';
import { prisma } from '@/lib/prisma';
import UpcomingEarningsWidget from '@/components/home/UpcomingEarningsWidget';
import ThesisChangeWidget from '@/components/home/ThesisChangeWidget';
import TodaysFocusWidget from '@/components/home/TodaysFocusWidget';
import RecentDecisionsWidget from '@/components/home/RecentDecisionsWidget';
import PerformanceSnapshotWidget from '@/components/home/PerformanceSnapshotWidget';
import RecommendationCard from '@/components/RecommendationCard';
import WidgetCard from '@/components/home/WidgetCard';
import OpenSection from '@/components/home/OpenSection';
import AutoRefresh from '@/components/AutoRefresh';
import FadeInView from '@/components/motion/FadeInView';
import NarrativeSummary from '@/components/home/NarrativeSummary';
import AnimatedNumber from '@/components/motion/AnimatedNumber';
import HeroMetric from '@/components/shared/HeroMetric';
import { buildHomeNarrative } from '@/lib/copy/homeNarrative';
import { formatRelativeTime } from '@/lib/format';

const QUICK_ACTIONS = [
  { href: '/atlas', label: 'Ask Atlas', icon: MessageSquareText },
  { href: '/recommendations', label: 'Review recommendations', icon: ClipboardCheck },
  { href: '/executions', label: 'Record a trade', icon: PlusCircle },
  { href: '/briefing', label: 'Full daily briefing', icon: Newspaper },
];

// Grid-column wrapper: top padding + divider except the first item when
// stacked (mobile), left padding + divider except the first item when
// side-by-side (desktop) — the spacing OpenSection's own divide-x/divide-y
// needs from its children.
const COLUMN_SPACING = 'pt-5 first:pt-0 sm:pt-0 sm:pl-8 sm:first:pl-0';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [data, performance] = await Promise.all([getHomeDashboardData(), getPerformanceSummary()]);

  const highestConvictionThesis = data.highestConviction
    ? await prisma.recommendation.findUnique({
        where: { id: data.highestConviction.id },
        select: {
          id: true,
          symbol: true,
          action: true,
          confidenceScore: true,
          thesis: true,
          proposedDollarAmount: true,
          percentageOfPortfolio: true,
          dataQualityStatus: true,
          holding: { select: { thesis: { select: { convictionAssessments: { orderBy: { generatedAt: 'desc' }, take: 1, select: { overallScore: true } } } } } },
        },
      })
    : null;

  return (
    <div className="space-y-8">
      <AutoRefresh />

      {/* Hero — shared composition with Portfolio, so the two pages read as
          one product. The greeting + narrative frame the number instead of
          competing with it for top billing. */}
      <FadeInView>
        <p className="text-sm text-atlas-text-secondary">{data.greeting}</p>
        {data.portfolio ? (
          <div className="mt-2">
            <HeroMetric
              eyebrow="Total portfolio value"
              value={data.portfolio.totalValue}
              changeValue={data.portfolio.dayChangeValue}
              changePercent={data.portfolio.dayChangePercent}
              changeLabel="today"
            />
          </div>
        ) : (
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-atlas-text">No portfolio connected yet</h1>
        )}
        <div className="mt-4">
          <NarrativeSummary sentences={buildHomeNarrative(data)} />
        </div>
      </FadeInView>

      {/* Thin hairline strip, not four equal boxes — supporting facts
          beneath the hero number rather than competing with it. */}
      <FadeInView delay={0.05}>
        <div className="flex flex-wrap gap-x-10 gap-y-4 border-y border-atlas-border-subtle py-5">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Portfolio health</p>
            {data.portfolioHealth ? (
              <>
                <AnimatedNumber
                  value={data.portfolioHealth.overallScore}
                  format="score100"
                  className={`mt-1 font-mono text-lg ${data.portfolioHealth.overallScore >= 60 ? 'text-risk-low' : 'text-risk-high'}`}
                />
                {data.portfolioHealth.previousScore != null && (
                  <p className="mt-0.5 text-xs text-atlas-text-tertiary">Previously {data.portfolioHealth.previousScore}/100</p>
                )}
              </>
            ) : (
              <p className="mt-1 font-mono text-lg text-atlas-text-tertiary">No data</p>
            )}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Cash available</p>
            {data.portfolio ? (
              <AnimatedNumber value={data.portfolio.cashBalance} format="currency0" className="mt-1 font-mono text-lg text-atlas-text" />
            ) : (
              <p className="mt-1 font-mono text-lg text-atlas-text-tertiary">No data</p>
            )}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Market status</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                {data.market.isOpen && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-risk-low opacity-60" />}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${data.market.isOpen ? 'bg-risk-low' : 'bg-atlas-text-tertiary'}`} />
              </span>
              <p className="font-mono text-lg text-atlas-text">{data.market.label}</p>
            </div>
            <p className="mt-0.5 text-xs text-atlas-text-tertiary">{data.market.detail}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Latest Robinhood sync</p>
            <p className={`mt-1 font-mono text-lg ${data.status.robinhoodSync.success === false ? 'text-risk-high' : 'text-atlas-text'}`}>
              {!data.status.robinhoodSync.lastSyncedAt
                ? 'Never synced'
                : data.status.robinhoodSync.success === false
                  ? 'Last sync rejected'
                  : `Updated ${formatRelativeTime(data.status.robinhoodSync.lastSyncedAt)}`}
            </p>
            <p className="mt-0.5 text-xs text-atlas-text-tertiary">
              {data.status.robinhoodSync.lastSyncedAt ? (
                data.status.robinhoodSync.lastSyncedAt.toLocaleString()
              ) : (
                'Sync the evaluation account to enable live recommendations.'
              )}{' '}
              · <Link href="/connections" className="underline decoration-atlas-border hover:decoration-atlas-accent-bright">Provider details →</Link>
            </p>
          </div>
        </div>
      </FadeInView>

      {/* The single primary focal panel — everything else on Home is
          secondary to this, per the design brief's "one highest-priority
          recommendation" guidance. */}
      <WidgetCard title="Highest-conviction recommendation">
        {highestConvictionThesis ? (
          <RecommendationCard
            data={{
              id: highestConvictionThesis.id,
              symbol: highestConvictionThesis.symbol,
              action: highestConvictionThesis.action,
              confidenceScore: highestConvictionThesis.confidenceScore,
              thesis: highestConvictionThesis.thesis,
              proposedDollarAmount: highestConvictionThesis.proposedDollarAmount != null ? Number(highestConvictionThesis.proposedDollarAmount) : null,
              percentageOfPortfolio: highestConvictionThesis.percentageOfPortfolio,
              dataQualityStatus: highestConvictionThesis.dataQualityStatus,
              convictionScore: highestConvictionThesis.holding.thesis?.convictionAssessments[0]?.overallScore ?? null,
            }}
          />
        ) : (
          <p className="text-sm text-atlas-text-tertiary">No recommendations generated yet — run the recommendation job or ask Atlas.</p>
        )}
      </WidgetCard>

      {/* A lightweight action row, not a boxed "quick actions" card — the
          links already read as buttons on their own. */}
      <div className="flex flex-wrap gap-2.5">
        {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 rounded-lg border border-atlas-border px-3.5 py-2 text-sm text-atlas-text-secondary transition-colors hover:border-atlas-accent-bright/40 hover:bg-atlas-surface-hover hover:text-atlas-text"
          >
            <Icon size={15} strokeWidth={1.75} />
            {label}
          </Link>
        ))}
      </div>

      {/* Everything below is secondary context, grouped into two
          collapsible open sections (hairline dividers, no per-item
          borders) instead of five more equally-weighted boxes —
          expandable in place rather than always occupying scroll space. */}
      <OpenSection title="Today" columns={2}>
        <div className={COLUMN_SPACING}>
          <TodaysFocusWidget focus={data.todaysFocus} avoid={data.todaysAvoid} variant="plain" />
        </div>
        <div className={COLUMN_SPACING}>
          <UpcomingEarningsWidget earnings={data.upcomingEarnings} variant="plain" />
        </div>
      </OpenSection>

      <OpenSection title="Recent activity" columns={3}>
        <div className={COLUMN_SPACING}>
          <ThesisChangeWidget change={data.recentThesisChange} variant="plain" />
        </div>
        <div className={COLUMN_SPACING}>
          <PerformanceSnapshotWidget performance={performance} variant="plain" />
        </div>
        <div className={COLUMN_SPACING}>
          <RecentDecisionsWidget decisions={data.recentDecisions} variant="plain" />
        </div>
      </OpenSection>
    </div>
  );
}
