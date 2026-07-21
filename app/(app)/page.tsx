import Link from 'next/link';
import { getHomeDashboardData } from '@/lib/domain/homeDashboard';
import { getPerformanceSummary } from '@/lib/domain/performance';
import { prisma } from '@/lib/prisma';
import UpcomingEarningsWidget from '@/components/home/UpcomingEarningsWidget';
import ThesisChangeWidget from '@/components/home/ThesisChangeWidget';
import TodaysFocusWidget from '@/components/home/TodaysFocusWidget';
import QuickActionsWidget from '@/components/home/QuickActionsWidget';
import RecentDecisionsWidget from '@/components/home/RecentDecisionsWidget';
import PerformanceSnapshotWidget from '@/components/home/PerformanceSnapshotWidget';
import RecommendationCard from '@/components/RecommendationCard';
import WidgetCard from '@/components/home/WidgetCard';
import AutoRefresh from '@/components/AutoRefresh';
import FadeInView from '@/components/motion/FadeInView';
import NarrativeSummary from '@/components/home/NarrativeSummary';
import AnimatedNumber from '@/components/motion/AnimatedNumber';
import { buildHomeNarrative } from '@/lib/copy/homeNarrative';
import { formatRelativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

function formatCurrency(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

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
      <FadeInView>
        <h1 className="text-3xl font-semibold tracking-tight text-atlas-text">{data.greeting}</h1>
        <div className="mt-3">
          <NarrativeSummary sentences={buildHomeNarrative(data)} />
        </div>
      </FadeInView>

      {/* Thin hairline strip, not four equal boxes — the same composition
          used on Portfolio/Risk/Health, so the four numbers that matter
          most read as one instrument panel instead of a fourth of a
          generic admin-dashboard grid. */}
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
              <>
                <AnimatedNumber value={data.portfolio.cashBalance} format="currency0" className="mt-1 font-mono text-lg text-atlas-text" />
                <p className="mt-0.5 text-xs text-atlas-text-tertiary">of {formatCurrency(data.portfolio.totalValue)} total</p>
              </>
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

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
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
        </div>
        <ThesisChangeWidget change={data.recentThesisChange} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TodaysFocusWidget focus={data.todaysFocus} avoid={data.todaysAvoid} />
        <UpcomingEarningsWidget earnings={data.upcomingEarnings} />
        <QuickActionsWidget />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PerformanceSnapshotWidget performance={performance} />
        <RecentDecisionsWidget decisions={data.recentDecisions} />
      </div>
    </div>
  );
}
