import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import ActionBadge from '@/components/ActionBadge';
import RecommendationCard from '@/components/RecommendationCard';
import FadeInView from '@/components/motion/FadeInView';
import { formatPercent } from '@/lib/format';
import { getActiveAccountId } from '@/lib/domain/portfolio';
import { setRecommendationDecision } from './actions';

export const dynamic = 'force-dynamic';

const DECISION_FILTERS = ['ALL', 'PENDING', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'DEFERRED'] as const;

const DECISION_STYLES: Record<string, string> = {
  PENDING: 'text-atlas-text-tertiary',
  ACCEPTED: 'text-risk-low',
  PARTIALLY_ACCEPTED: 'text-atlas-warning',
  REJECTED: 'text-risk-high',
  DEFERRED: 'text-atlas-steel',
};

export default async function RecommendationHistoryPage({ searchParams }: { searchParams: { decision?: string } }) {
  const filter = DECISION_FILTERS.includes((searchParams.decision ?? 'ALL') as (typeof DECISION_FILTERS)[number])
    ? (searchParams.decision ?? 'ALL')
    : 'ALL';

  // Scoped to the active account — an unscoped query here showed
  // recommendations from any account in the database (see the identical
  // fix on lib/domain/intelligence.ts and app/(app)/holdings/page.tsx).
  const accountId = await getActiveAccountId();
  const [scorecard, recommendations] = await Promise.all([
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
  ]);

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

      {scorecard && (
        <FadeInView delay={0.05}>
          <div className="flex flex-wrap gap-x-10 gap-y-4 border-y border-atlas-border-subtle py-5">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Total recommendations</p>
              <p className="mt-1 font-mono text-lg text-atlas-text">{scorecard.totalRecommendations}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Win rate</p>
              <p className="mt-1 font-mono text-lg text-atlas-text">
                {scorecard.winRatePct !== null ? `${scorecard.winRatePct.toFixed(0)}%` : 'n/a'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Avg alpha (90d)</p>
              <p className="mt-1 font-mono text-lg text-atlas-text">
                {scorecard.alphaVsSpyAvgPct !== null ? formatPercent(scorecard.alphaVsSpyAvgPct) : 'n/a'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Utilization</p>
              <p className="mt-1 font-mono text-lg text-atlas-text">
                {scorecard.utilizationPct !== null ? `${scorecard.utilizationPct.toFixed(0)}%` : 'n/a'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Acceptance rate</p>
              <p className="mt-1 font-mono text-lg text-atlas-text">
                {scorecard.acceptanceRatePct !== null ? `${scorecard.acceptanceRatePct.toFixed(0)}%` : 'n/a'}
              </p>
            </div>
          </div>
        </FadeInView>
      )}

      {recommendations.length > 0 && (
        <div>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Latest briefings</h2>
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
          <p className="text-sm text-atlas-text-tertiary">No recommendations match this filter.</p>
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
                  <th className="py-3 pr-4 font-medium">Decision</th>
                  <th className="py-3 pr-4 font-medium">1d / 7d / 30d</th>
                  <th className="py-3 font-medium"></th>
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
                        <ActionBadge action={r.action} />
                      </td>
                      <td className="py-3 pr-4 font-mono text-atlas-text-secondary">{r.confidenceScore}/10</td>
                      <td className="py-3 pr-4 font-mono text-atlas-text-secondary">{conviction !== null ? `${conviction}/100` : 'n/a'}</td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs font-medium ${DECISION_STYLES[r.userDecision] ?? DECISION_STYLES.PENDING}`}>
                          {r.userDecision.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-atlas-text-tertiary">
                        {[r.outcome?.return1d, r.outcome?.return7d, r.outcome?.return30d]
                          .map((v) => (v !== null && v !== undefined ? formatPercent(v) : 'pending'))
                          .join(' / ')}
                      </td>
                      <td className="py-3">
                        {r.userDecision === 'PENDING' && (
                          <div className="flex gap-3">
                            <form action={setRecommendationDecision.bind(null, r.id, 'REJECTED', '')}>
                              <button type="submit" className="text-xs text-risk-high underline decoration-dotted transition-opacity hover:text-risk-high/80 active:opacity-60">
                                Reject
                              </button>
                            </form>
                            <form action={setRecommendationDecision.bind(null, r.id, 'DEFERRED', '')}>
                              <button type="submit" className="text-xs text-atlas-steel underline decoration-dotted transition-opacity hover:text-atlas-steel/80 active:opacity-60">
                                Defer
                              </button>
                            </form>
                          </div>
                        )}
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
