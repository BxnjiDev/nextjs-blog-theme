import Link from 'next/link';
import { MessageSquareText, ClipboardCheck, PlusCircle, Newspaper } from 'lucide-react';
import { getHomeDashboardData } from '@/lib/domain/homeDashboard';
import { getPerformanceSummary } from '@/lib/domain/performance';
import { getActiveAccountId } from '@/lib/domain/portfolio';
import { prisma } from '@/lib/prisma';
import UpcomingEarningsWidget from '@/components/home/UpcomingEarningsWidget';
import RecentDecisionsWidget from '@/components/home/RecentDecisionsWidget';
import PerformanceSnapshotWidget from '@/components/home/PerformanceSnapshotWidget';
import AtlasReadout from '@/components/home/AtlasReadout';
import SignalStack from '@/components/home/SignalStack';
import OrbitRow, { type OrbitNode } from '@/components/home/OrbitRow';
import AutoRefresh from '@/components/AutoRefresh';
import FadeInView from '@/components/motion/FadeInView';
import NarrativeSummary from '@/components/home/NarrativeSummary';
import { buildHomeNarrative } from '@/lib/copy/homeNarrative';
import SectionHeading from '@/components/ui/SectionHeading';
import InsightStack from '@/components/intelligence/InsightStack';
import { buildTodaysFocusInsights } from '@/lib/intelligence/engine';

const PRIMARY_ACTION = { href: '/atlas', label: 'Ask Atlas', icon: MessageSquareText };
const SECONDARY_ACTIONS = [
  { href: '/recommendations', label: 'Review recommendations', icon: ClipboardCheck },
  { href: '/executions', label: 'Record a trade', icon: PlusCircle },
  { href: '/briefing', label: 'Full daily briefing', icon: Newspaper },
];

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const accountId = await getActiveAccountId();

  // The risk read and pending-recommendation list aren't part of
  // getHomeDashboardData()'s existing contract (that function already
  // fetches health/status/thesis/earnings/decisions for other widgets) —
  // both are new, singular, indexed reads added specifically so the
  // Intelligence Layer's Today's Focus can reason about risk and pending
  // decisions Home previously had zero visibility into. Mirrors the
  // existing precedent below (highestConvictionThesis) of page.tsx doing
  // its own supplementary Prisma reads alongside the aggregation function.
  const [data, performance, risk, pendingRecommendations] = await Promise.all([
    getHomeDashboardData(),
    getPerformanceSummary(),
    prisma.riskAssessment.findFirst({ orderBy: { generatedAt: 'desc' } }),
    accountId
      ? prisma.recommendation.findMany({
          where: { userDecision: 'PENDING', holding: { accountId } },
          orderBy: { confidenceScore: 'desc' },
          take: 10,
          select: { id: true, symbol: true, action: true, confidenceScore: true, dataQualityStatus: true, userDecision: true, generatedAt: true },
        })
      : Promise.resolve([]),
  ]);

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

  const performanceAvailable = performance.weekly.available || performance.daily.available;

  const earningsWeightBySymbol = Object.fromEntries(
    (data.portfolio?.holdings ?? []).map((h) => [h.symbol, data.portfolio && data.portfolio.totalValue > 0 ? (h.marketValue / data.portfolio.totalValue) * 100 : 0])
  );
  const usingMockData = !data.status.marketData.configured || !data.status.fundamentals.configured;

  const todaysFocusInsights = buildTodaysFocusInsights({
    portfolioHealth: data.portfolioHealth,
    risk,
    recommendations: pendingRecommendations,
    thesisChange: data.recentThesisChange,
    earnings: data.upcomingEarnings,
    earningsWeightBySymbol,
    usingMockData,
  });

  const orbitNodes: OrbitNode[] = [
    {
      id: 'earnings',
      label: 'Earnings',
      active: data.upcomingEarnings.length > 0,
      content: <UpcomingEarningsWidget earnings={data.upcomingEarnings} variant="plain" />,
    },
    {
      id: 'performance',
      label: 'Performance',
      active: performanceAvailable,
      content: <PerformanceSnapshotWidget performance={performance} variant="plain" />,
    },
    {
      id: 'decisions',
      label: 'Decisions',
      active: data.recentDecisions.length > 0,
      content: <RecentDecisionsWidget decisions={data.recentDecisions} variant="plain" />,
    },
  ];

  return (
    <div className="space-y-10">
      <AutoRefresh />

      <FadeInView>
        <h1 className="sr-only">Home</h1>
        <p className="text-sm text-atlas-text-secondary">{data.greeting}</p>
      </FadeInView>

      {/* The Command Deck hero — an asymmetric two-zone layout instead of a
          stacked headline. Left: the Atlas identity orb woven directly into
          the portfolio value, its color/pulse reading as real portfolio
          health. Right: a signal stack whose items resize by how much they
          actually matter right now. */}
      <div className="grid gap-10 lg:grid-cols-[1fr_380px] lg:items-start">
        <FadeInView>
          <AtlasReadout
            totalValue={data.portfolio?.totalValue ?? null}
            dayChangeValue={data.portfolio?.dayChangeValue ?? 0}
            dayChangePercent={data.portfolio?.dayChangePercent ?? 0}
            healthScore={data.portfolioHealth?.overallScore ?? null}
            previousHealthScore={data.portfolioHealth?.previousScore ?? null}
            cashBalance={data.portfolio?.cashBalance ?? null}
            market={data.market}
            syncStatus={data.status.robinhoodSync}
          />
          <div className="mt-6">
            <NarrativeSummary sentences={buildHomeNarrative(data)} />
          </div>
        </FadeInView>

        <FadeInView delay={0.08}>
          <SignalStack
            recommendation={
              highestConvictionThesis
                ? {
                    id: highestConvictionThesis.id,
                    symbol: highestConvictionThesis.symbol,
                    action: highestConvictionThesis.action,
                    confidenceScore: highestConvictionThesis.confidenceScore,
                    thesis: highestConvictionThesis.thesis,
                    proposedDollarAmount:
                      highestConvictionThesis.proposedDollarAmount != null ? Number(highestConvictionThesis.proposedDollarAmount) : null,
                    percentageOfPortfolio: highestConvictionThesis.percentageOfPortfolio,
                    dataQualityStatus: highestConvictionThesis.dataQualityStatus,
                    convictionScore: highestConvictionThesis.holding.thesis?.convictionAssessments[0]?.overallScore ?? null,
                  }
                : null
            }
            thesisChange={data.recentThesisChange}
            topConcerns={data.portfolioHealth?.topConcerns ?? []}
          />
        </FadeInView>
      </div>

      {/* Today's Focus — the Intelligence Layer's cross-domain merge point
          (lib/intelligence/engine.ts's buildTodaysFocusInsights): health,
          risk, the highest-confidence pending recommendation, a recent
          thesis change, near-term earnings, and data-quality context, all
          scored onto one priority ordering and rendered through the same
          InsightCard every other page uses. Replaces the old "Today" orbit
          node, which only echoed the daily briefing's AI narrative text
          with no scoring, ranking, or "why" — that full narrative still
          lives at /briefing; this is the deterministic, explainable view. */}
      <FadeInView delay={0.1}>
        <SectionHeading className="mb-3">Today&rsquo;s focus</SectionHeading>
        <InsightStack
          insights={todaysFocusInsights}
          limit={4}
          variant="list"
          emptyMessage="No meaningful portfolio changes since your last review."
        />
      </FadeInView>

      {/* Persistent console bar — Ask Atlas given top billing (the actual
          interaction model of this product) rather than four equal-weight
          buttons. */}
      <FadeInView delay={0.12}>
        <div className="atlas-glass flex flex-col gap-2 rounded-2xl p-2.5 sm:flex-row sm:items-center sm:gap-0 sm:divide-x sm:divide-atlas-border-subtle">
          <Link
            href={PRIMARY_ACTION.href}
            className="atlas-press flex items-center gap-2.5 rounded-xl bg-atlas-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-atlas-accent-bright hover:shadow-glow-accent sm:mr-2.5"
          >
            <PRIMARY_ACTION.icon size={17} strokeWidth={1.75} />
            {PRIMARY_ACTION.label}
          </Link>
          <div className="flex flex-1 flex-wrap gap-1 sm:pl-2.5">
            {SECONDARY_ACTIONS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="atlas-press flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-atlas-text-secondary transition-colors hover:bg-atlas-surface-hover hover:text-atlas-text"
              >
                <Icon size={15} strokeWidth={1.75} />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </FadeInView>

      {/* Secondary context as orbit nodes on a thin connecting line — the
          same motif as Atlas's login identity — instead of two more
          collapsible sections. Each node's dot brightness previews whether
          there's anything to see before you click it. */}
      <FadeInView delay={0.16}>
        <OrbitRow nodes={orbitNodes} />
      </FadeInView>
    </div>
  );
}
