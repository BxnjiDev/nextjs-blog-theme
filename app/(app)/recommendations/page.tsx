import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import ActionBadge from '@/components/ActionBadge';
import ConfidenceBadge from '@/components/ConfidenceBadge';
import StatCard from '@/components/StatCard';
import RecommendationCard from '@/components/RecommendationCard';
import { formatPercent } from '@/lib/format';
import { setRecommendationDecision } from './actions';

export const dynamic = 'force-dynamic';

const DECISION_FILTERS = ['ALL', 'PENDING', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'DEFERRED'] as const;

function DecisionBadge({ decision }: { decision: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    ACCEPTED: 'bg-risk-low/10 text-risk-low',
    PARTIALLY_ACCEPTED: 'bg-risk-medium/10 text-risk-medium',
    REJECTED: 'bg-risk-high/10 text-risk-high',
    DEFERRED: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[decision] ?? styles.PENDING}`}>
      {decision.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}

export default async function RecommendationHistoryPage({ searchParams }: { searchParams: { decision?: string } }) {
  const filter = DECISION_FILTERS.includes((searchParams.decision ?? 'ALL') as (typeof DECISION_FILTERS)[number])
    ? (searchParams.decision ?? 'ALL')
    : 'ALL';

  const [scorecard, recommendations] = await Promise.all([
    prisma.recommendationScorecard.findFirst({ orderBy: { generatedAt: 'desc' } }),
    prisma.recommendation.findMany({
      where: filter === 'ALL' ? undefined : { userDecision: filter as 'PENDING' | 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED' | 'DEFERRED' },
      include: { outcome: true, holding: { include: { thesis: { include: { convictionAssessments: { orderBy: { generatedAt: 'desc' }, take: 1 } } } } } },
      orderBy: { generatedAt: 'desc' },
      take: 100,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Recommendation History</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Every recommendation Atlas has ever generated, permanently — what you did about it, and how it performed.
        </p>
      </div>

      {scorecard && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard label="Total recommendations" value={String(scorecard.totalRecommendations)} />
          <StatCard label="Win rate" value={scorecard.winRatePct !== null ? `${scorecard.winRatePct.toFixed(0)}%` : 'n/a'} />
          <StatCard label="Avg alpha (90d)" value={scorecard.alphaVsSpyAvgPct !== null ? formatPercent(scorecard.alphaVsSpyAvgPct) : 'n/a'} />
          <StatCard label="Utilization" value={scorecard.utilizationPct !== null ? `${scorecard.utilizationPct.toFixed(0)}%` : 'n/a'} />
          <StatCard label="Acceptance rate" value={scorecard.acceptanceRatePct !== null ? `${scorecard.acceptanceRatePct.toFixed(0)}%` : 'n/a'} />
        </div>
      )}

      {recommendations.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-atlas-text-secondary">Latest recommendations</h2>
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

      <div className="flex flex-wrap gap-2 text-sm">
        {DECISION_FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'ALL' ? '/recommendations' : `/recommendations?decision=${f}`}
            className={`rounded-full px-3 py-1 ${filter === f ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}
          >
            {f.replace(/_/g, ' ').toLowerCase()}
          </Link>
        ))}
      </div>

      {recommendations.length === 0 ? (
        <p className="text-sm text-gray-500">No recommendations match this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Symbol</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Confidence</th>
                <th className="px-4 py-2">Conviction</th>
                <th className="px-4 py-2">Decision</th>
                <th className="px-4 py-2">1d / 7d / 30d</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map((r) => {
                const conviction = r.holding.thesis?.convictionAssessments[0]?.overallScore ?? null;
                return (
                  <tr key={r.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-4 py-2 text-xs text-gray-500">{r.generatedAt.toLocaleDateString()}</td>
                    <td className="px-4 py-2 font-medium">
                      <Link href={`/recommendations/${r.id}`} className="hover:underline">
                        {r.symbol}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <ActionBadge action={r.action} />
                    </td>
                    <td className="px-4 py-2">
                      <ConfidenceBadge score={r.confidenceScore} />
                    </td>
                    <td className="px-4 py-2">{conviction !== null ? `${conviction}/100` : 'n/a'}</td>
                    <td className="px-4 py-2">
                      <DecisionBadge decision={r.userDecision} />
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {[r.outcome?.return1d, r.outcome?.return7d, r.outcome?.return30d]
                        .map((v) => (v !== null && v !== undefined ? formatPercent(v) : 'pending'))
                        .join(' / ')}
                    </td>
                    <td className="px-4 py-2">
                      {r.userDecision === 'PENDING' && (
                        <div className="flex gap-2">
                          <form action={setRecommendationDecision.bind(null, r.id, 'REJECTED', '')}>
                            <button type="submit" className="text-xs text-risk-high underline">
                              Reject
                            </button>
                          </form>
                          <form action={setRecommendationDecision.bind(null, r.id, 'DEFERRED', '')}>
                            <button type="submit" className="text-xs text-blue-600 underline dark:text-blue-400">
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
  );
}
