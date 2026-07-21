import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import SectionHeading from '@/components/ui/SectionHeading';
import StatStrip, { Stat } from '@/components/ui/Stat';
import { ACTION_TONE, ACTION_LABEL } from '@/lib/theme/tone';
import RecommendationCard from '@/components/RecommendationCard';
import DecisionPanel from '@/components/recommendations/DecisionPanel';
import FadeInView from '@/components/motion/FadeInView';
import { formatPercent } from '@/lib/format';
import { getActiveAccountId } from '@/lib/domain/portfolio';
import InsightStack from '@/components/intelligence/InsightStack';
import { assessRecommendations } from '@/lib/intelligence/engine';

export const dynamic = 'force-dynamic';

const DECISION_FILTERS = ['ALL', 'PENDING', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'DEFERRED'] as const;

export default async function RecommendationHistoryPage({ searchParams }: { searchParams: { decision?: string } }) {
  const filter = DECISION_FILTERS.includes((searchParams.decision ?? 'ALL') as (typeof DECISION_FILTERS)[number])
    ? (searchParams.decision ?? 'ALL')
    : 'ALL';

  // Scoped to the active account — an unscoped query here showed
  // recommendations from any account in the database (see the identical
  // fix on lib/domain/intelligence.ts and app/(app)/holdings/page.tsx).
  const accountId = await getActiveAccountId();
  const [scorecard, recommendations, pendingRecommendations] = await Promise.all([
    prisma.recommendationScorecard.findFirst({ orderBy: { generatedAt: 'desc' } }),
    accountId
      ? prisma.recommendation.findMany({
          where: {
            holding: { accountId },
            ...(filter === 'ALL' ? {} : { userDecision: filter as 'PENDING' | 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED' | 'DEFERRED' }),
          },
          include: { outcome: true, holding: { include: { thesis: { include: { convictionAssessments: { orderBy: { generatedAt: 'desc' }, take: 1 } } } } } },
          orderBy: { generatedAt: 'desc' },
          take: 100,
        })
      : [],
    // Independent of the `filter` above — the decision-summary insight
    // reflects real pending state regardless of which decision tab is
    // selected, so it doesn't disappear or go stale just because the user
    // is looking at the "rejected" filter.
    accountId
      ? prisma.recommendation.findMany({
          where: { userDecision: 'PENDING', holding: { accountId } },
          orderBy: { confidenceScore: 'desc' },
          take: 10,
          select: { id: true, symbol: true, action: true, confidenceScore: true, dataQualityStatus: true, userDecision: true, generatedAt: true },
        })
      : [],
  ]);

  const decisionSummaryInsights = assessRecommendations(pendingRecommendations);

  return (
    <div className="space-y-14">
      <FadeInView>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-atlas-text-tertiary">Recommendations</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-atlas-text">Decision log</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-atlas-text-secondary">
          Every recommendation Atlas has ever generated, permanently — what you did about it, and how it
          performed.
        </p>
      </FadeInView>

      {/* Decision summary — the single highest-priority pending
          recommendation, surfaced ahead of the scorecard stats and the
          full table below, so "what deserves my attention" doesn't require
          scanning a 100-row table first. */}
      <FadeInView delay={0.02}>
        <InsightStack
          insights={decisionSummaryInsights}
          emptyMessage="No current recommendations require action."
        />
      </FadeInView>

      {scorecard && (
        <FadeInView delay={0.05}>
          <StatStrip>
            <Stat label="Total recommendations" value={scorecard.totalRecommendations} />
            <Stat label="Win rate" value={scorecard.winRatePct !== null ? `${scorecard.winRatePct.toFixed(0)}%` : 'n/a'} />
            <Stat label="Avg alpha (90d)" value={scorecard.alphaVsSpyAvgPct !== null ? formatPercent(scorecard.alphaVsSpyAvgPct) : 'n/a'} />
            <Stat label="Utilization" value={scorecard.utilizationPct !== null ? `${scorecard.utilizationPct.toFixed(0)}%` : 'n/a'} />
            <Stat label="Acceptance rate" value={scorecard.acceptanceRatePct !== null ? `${scorecard.acceptanceRatePct.toFixed(0)}%` : 'n/a'} />
          </StatStrip>
        </FadeInView>
      )}

      {recommendations.length > 0 && (
        <div>
          <SectionHeading className="mb-4">Latest briefings</SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recommendations.slice(0, 4).map((r) => (
              <RecommendationCard
                key={r.id}
                compact
                data={{
                  id: r.id,
                  symbol: r.symbol,
                  action: r.action,
                  confidenceScore: r.confidenceScore,
                  thesis: r.thesis,
                  proposedDollarAmount: r.proposedDollarAmount != null ? Number(r.proposedDollarAmount) : null,
                  percentageOfPortfolio: r.percentageOfPortfolio,
                  dataQualityStatus: r.dataQualityStatus,
                  convictionScore: r.holding.thesis?.convictionAssessments[0]?.overallScore ?? null,
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          {DECISION_FILTERS.map((f) => (
            <Link
              key={f}
              href={f === 'ALL' ? '/recommendations' : `/recommendations?decision=${f}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-atlas-accent text-white'
                  : 'bg-atlas-surface-raised text-atlas-text-tertiary hover:text-atlas-text-secondary'
              }`}
            >
              {f.replace(/_/g, ' ').toLowerCase()}
            </Link>
          ))}
        </div>

        {recommendations.length === 0 ? (
          <EmptyState>No recommendations match this filter.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-atlas-border-subtle text-left text-[11px] uppercase tracking-wide text-atlas-text-tertiary">
                <tr>
                  <th className="py-3 pr-4 font-medium">Date</th>
                  <th className="py-3 pr-4 font-medium">Symbol</th>
                  <th className="py-3 pr-4 font-medium">Action</th>
                  <th className="py-3 pr-4 font-medium">Confidence</th>
                  <th className="py-3 pr-4 font-medium">Conviction</th>
                  <th className="py-3 pr-4 font-medium">1d / 7d / 30d</th>
                  <th className="py-3 font-medium">Decision</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((r) => {
                  const conviction = r.holding.thesis?.convictionAssessments[0]?.overallScore ?? null;
                  return (
                    <tr key={r.id} className="border-b border-atlas-border-subtle/60 text-atlas-text transition-colors hover:bg-atlas-surface-hover">
                      <td className="py-3 pr-4 font-mono text-xs text-atlas-text-tertiary">{r.generatedAt.toLocaleDateString()}</td>
                      <td className="py-3 pr-4 font-medium">
                        <Link href={`/recommendations/${r.id}`} className="hover:text-atlas-accent-bright">
                          {r.symbol}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={ACTION_TONE[r.action] ?? 'neutral'}>{ACTION_LABEL[r.action] ?? r.action}</Badge>
                      </td>
                      <td className="py-3 pr-4 font-mono text-atlas-text-secondary">{r.confidenceScore}/10</td>
                      <td className="py-3 pr-4 font-mono text-atlas-text-secondary">{conviction !== null ? `${conviction}/100` : 'n/a'}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-atlas-text-tertiary">
                        {[r.outcome?.return1d, r.outcome?.return7d, r.outcome?.return30d]
                          .map((v) => (v !== null && v !== undefined ? formatPercent(v) : 'pending'))
                          .join(' / ')}
                      </td>
                      <td className="py-3">
                        <DecisionPanel recommendationId={r.id} currentDecision={r.userDecision} compact />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
