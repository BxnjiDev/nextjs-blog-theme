import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Badge from '@/components/ui/Badge';
import { ACTION_TONE, ACTION_LABEL, scoreTone } from '@/lib/theme/tone';
import ConvictionScrubber from '@/components/intelligence/ConvictionScrubber';
import EmptyState from '@/components/ui/EmptyState';
import { getActiveAccountId } from '@/lib/domain/portfolio';
import FadeInView from '@/components/motion/FadeInView';

interface ExplainabilityShape {
  whyNow: string;
  whyNot: string;
  supportingEvidence: string;
  contradictingEvidence: string;
  keyAssumptions: string;
  invalidationConditions: string;
  vsCashAndSpy: string;
}

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<string, string> = {
  financialStrength: 'Financial strength',
  revenueGrowth: 'Revenue growth',
  profitability: 'Profitability',
  balanceSheet: 'Balance sheet',
  competitiveMoat: 'Competitive moat',
  aiPositioning: 'AI positioning',
  managementExecution: 'Management execution',
  industryLeadership: 'Industry leadership',
  productInnovation: 'Product innovation',
  valuation: 'Valuation',
  executionRisk: 'Execution risk',
  regulatoryRisk: 'Regulatory risk',
  macroSensitivity: 'Macro sensitivity',
};

export default async function ThesisDetailPage({ params }: { params: { symbol: string } }) {
  const symbol = params.symbol.toUpperCase();

  // Scoped to the active account for the same reason as every other page
  // resolving "the" portfolio (see lib/domain/portfolio.ts) — an unscoped
  // lookup here could match another account's same-symbol holding (e.g.
  // leftover seed data) instead of notFound()-ing correctly.
  const accountId = await getActiveAccountId();
  const holding = accountId
    ? await prisma.holding.findFirst({
        where: { symbol, accountId },
        include: {
          thesis: {
            include: {
              changeEvents: { orderBy: { createdAt: 'desc' } },
              convictionAssessments: { orderBy: { generatedAt: 'asc' } },
              accuracyScores: { orderBy: { generatedAt: 'desc' }, take: 1 },
            },
          },
          recommendations: {
            orderBy: { generatedAt: 'desc' },
            take: 10,
            include: { outcome: true },
          },
        },
      })
    : null;

  if (!holding) notFound();

  const thesis = holding.thesis;
  const convictions = thesis?.convictionAssessments ?? [];
  const latestConviction = convictions[convictions.length - 1] ?? null;
  const latestAccuracy = thesis?.accuracyScores[0] ?? null;
  const recommendations = holding.recommendations;
  const latestRecommendation = recommendations[0] ?? null;
  const explainability = (latestRecommendation?.explainability ?? null) as ExplainabilityShape | null;

  const recentFundamentals = await prisma.fundamentalSnapshot.findMany({
    where: { symbol: holding.symbol, periodType: 'QUARTERLY' },
    orderBy: { reportDate: 'desc' },
    take: 4,
  });

  return (
    <div className="space-y-8">
      <FadeInView>
        <Link href="/intelligence" className="text-sm text-atlas-text-tertiary hover:text-atlas-text-secondary">
          ← Portfolio Intelligence
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-atlas-text">
          {holding.symbol} <span className="font-normal text-atlas-text-tertiary">— {holding.name}</span>
        </h1>
      </FadeInView>

      {!thesis ? (
        <EmptyState>No thesis established yet — pending the next thesis-review job run.</EmptyState>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="atlas-glass rounded-xl p-4 md:col-span-2">
              <h2 className="mb-2 font-medium">Company overview</h2>
              <p className="text-sm text-atlas-text-secondary">{thesis.companyOverview}</p>
              <h2 className="mb-2 mt-4 font-medium">Original thesis</h2>
              <p className="text-sm text-atlas-text-secondary">{thesis.originalThesis}</p>
              <p className="mt-3 text-xs text-atlas-text-tertiary">
                Established {thesis.establishedAt.toLocaleDateString()} · Last reviewed {thesis.lastReviewedAt.toLocaleString()} · Horizon:{' '}
                {thesis.investmentHorizon}
              </p>
            </div>
            <div className="atlas-glass rounded-xl p-4">
              <h2 className="mb-2 font-medium">Conviction</h2>
              <p className="text-3xl font-semibold">{thesis.convictionScore}/100</p>
              <Badge tone={scoreTone(thesis.convictionScore, 100)}>Confidence {Math.round(thesis.convictionScore / 10)}/10</Badge>
              <div className="mt-4">
                <ConvictionScrubber assessments={convictions} changes={thesis.changeEvents} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="atlas-glass rounded-xl p-4">
              <h2 className="font-medium text-atlas-text">Growth drivers</h2>
              <p className="mt-1 text-sm text-atlas-text-secondary">{thesis.growthDrivers}</p>
            </div>
            <div className="atlas-glass rounded-xl p-4">
              <h2 className="font-medium text-atlas-text">Competitive advantages</h2>
              <p className="mt-1 text-sm text-atlas-text-secondary">{thesis.competitiveAdvantages}</p>
            </div>
            <div className="atlas-glass rounded-xl p-4">
              <h2 className="font-medium text-risk-low">Bull case</h2>
              <p className="mt-1 text-sm text-atlas-text-secondary">{thesis.bullCase}</p>
            </div>
            <div className="atlas-glass rounded-xl p-4">
              <h2 className="font-medium text-risk-high">Bear case</h2>
              <p className="mt-1 text-sm text-atlas-text-secondary">{thesis.bearCase}</p>
            </div>
            <div className="atlas-glass rounded-xl p-4">
              <h2 className="font-medium text-atlas-text">Risks</h2>
              <p className="mt-1 text-sm text-atlas-text-secondary">{thesis.risks}</p>
            </div>
            <div className="atlas-glass rounded-xl p-4">
              <h2 className="font-medium text-atlas-text">Catalysts</h2>
              <p className="mt-1 text-sm text-atlas-text-secondary">{thesis.catalysts}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="atlas-glass rounded-xl p-4">
              <h2 className="font-medium text-risk-low">What would strengthen this</h2>
              <p className="mt-1 text-sm text-atlas-text-secondary">{thesis.whatWouldStrengthen}</p>
            </div>
            <div className="atlas-glass rounded-xl p-4">
              <h2 className="font-medium text-risk-high">What would weaken this</h2>
              <p className="mt-1 text-sm text-atlas-text-secondary">{thesis.whatWouldWeaken}</p>
            </div>
            <div className="atlas-glass rounded-xl p-4">
              <h2 className="font-medium text-atlas-text">Sell conditions</h2>
              <p className="mt-1 text-sm text-atlas-text-secondary">{thesis.sellConditions}</p>
            </div>
          </div>

          {recentFundamentals.length > 0 && (
            <div className="atlas-glass rounded-xl p-4">
              <h2 className="mb-3 font-medium">Recent financials</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="text-xs text-atlas-text-tertiary">
                      <th className="pb-2 pr-4">Period</th>
                      <th className="pb-2 pr-4">Revenue</th>
                      <th className="pb-2 pr-4">YoY growth</th>
                      <th className="pb-2 pr-4">Net margin</th>
                      <th className="pb-2">EPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentFundamentals.map((f) => (
                      <tr key={f.id} className="border-t border-atlas-border-subtle">
                        <td className="py-2 pr-4">
                          {f.fiscalPeriod} FY{f.fiscalYear}
                        </td>
                        <td className="py-2 pr-4">{f.revenue !== null ? `$${(f.revenue / 1_000_000).toFixed(0)}M` : 'n/a'}</td>
                        <td className="py-2 pr-4">{f.revenueGrowth !== null ? `${(f.revenueGrowth * 100).toFixed(1)}%` : 'n/a'}</td>
                        <td className="py-2 pr-4">{f.netMargin !== null ? `${(f.netMargin * 100).toFixed(1)}%` : 'n/a'}</td>
                        <td className="py-2">{f.eps !== null ? f.eps.toFixed(2) : 'n/a'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-atlas-text-tertiary">
                Source: {recentFundamentals[0].source} ({recentFundamentals[0].quality}).
              </p>
            </div>
          )}

          {latestConviction && (
            <div className="atlas-glass rounded-xl p-4">
              <h2 className="mb-3 font-medium">Conviction category breakdown</h2>
              <p className="mb-3 text-xs text-atlas-text-tertiary">
                Deterministic, code-computed scores. A category shows &ldquo;no data&rdquo; when this app has no
                data source to score it from — never a guessed number.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
                  const score = (latestConviction as unknown as Record<string, number | null>)[key];
                  return (
                    <div key={key} className="rounded-lg border border-atlas-border-subtle bg-atlas-surface-raised px-3 py-2">
                      <p className="text-xs text-atlas-text-tertiary">{label}</p>
                      <p className="text-lg font-semibold">{score !== null ? `${score}/100` : 'No data'}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="atlas-glass rounded-xl p-4">
            <h2 className="mb-3 font-medium">Thesis timeline</h2>
            {thesis.changeEvents.length === 0 ? (
              <EmptyState compact>No changes recorded yet.</EmptyState>
            ) : (
              <ol className="space-y-4">
                {thesis.changeEvents.map((event) => (
                  <li key={event.id} className="border-l-2 border-atlas-border pl-4">
                    <p className="text-xs text-atlas-text-tertiary">
                      {event.createdAt.toLocaleString()} · {event.changeType.replace(/_/g, ' ').toLowerCase()}
                    </p>
                    {event.whatChanged && <p className="mt-1 text-sm font-medium">{event.whatChanged}</p>}
                    {event.whyChanged && <p className="mt-1 text-sm text-atlas-text-secondary">{event.whyChanged}</p>}
                    {(event.confidenceBefore !== null || event.confidenceAfter !== null) && (
                      <p className="mt-1 text-xs text-atlas-text-tertiary">
                        Confidence: {event.confidenceBefore ?? 'n/a'} → {event.confidenceAfter ?? 'n/a'}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {latestAccuracy && (
            <div className="atlas-glass rounded-xl p-4">
              <h2 className="mb-1 font-medium">Thesis accuracy (retrospective)</h2>
              <p className="text-3xl font-semibold">{latestAccuracy.overallScore}/100</p>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <p>Revenue: {latestAccuracy.revenueAccuracy !== null ? `${latestAccuracy.revenueAccuracy}/100` : 'No data'}</p>
                <p>Margins: {latestAccuracy.marginAccuracy !== null ? `${latestAccuracy.marginAccuracy}/100` : 'No data'}</p>
                <p>Valuation: {latestAccuracy.valuationAccuracy !== null ? `${latestAccuracy.valuationAccuracy}/100` : 'No data'}</p>
                <p>Timing: {latestAccuracy.timingAccuracy !== null ? `${latestAccuracy.timingAccuracy}/100` : 'No data'}</p>
                <p>Catalysts achieved: No deterministic measure available.</p>
                <p>Risks realized: No deterministic measure available.</p>
              </div>
              <p className="mt-2 text-xs text-atlas-text-tertiary">
                Computed {latestAccuracy.generatedAt.toLocaleDateString()} — see lib/jobs/computeThesisAccuracy.ts for methodology.
              </p>
            </div>
          )}

          {latestRecommendation && latestRecommendation.proposedDollarAmount !== null && (
            <div className="rounded-xl border border-atlas-warning/20 bg-atlas-warning/5 p-4">
              <h2 className="mb-1 font-medium">Evaluation sizing (manual execution only)</h2>
              <p className="text-sm text-atlas-text-secondary">
                Proposed ${Number(latestRecommendation.proposedDollarAmount).toFixed(0)} (
                {latestRecommendation.percentageOfPortfolio?.toFixed(1) ?? '0.0'}% of the experimental portfolio). Atlas does not place
                this order — size and execute it yourself if you agree.
              </p>
            </div>
          )}

          {latestRecommendation && explainability && (
            <div className="atlas-glass rounded-xl p-4">
              <h2 className="mb-3 font-medium">Explainability (latest recommendation)</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <p className="text-sm"><span className="font-medium">Why now:</span> {explainability.whyNow}</p>
                <p className="text-sm"><span className="font-medium">Argument for waiting:</span> {explainability.whyNot}</p>
                <p className="text-sm"><span className="font-medium">Supporting evidence:</span> {explainability.supportingEvidence}</p>
                <p className="text-sm"><span className="font-medium">Contradicting evidence:</span> {explainability.contradictingEvidence}</p>
                <p className="text-sm"><span className="font-medium">Key assumptions:</span> {explainability.keyAssumptions}</p>
                <p className="text-sm"><span className="font-medium">What would invalidate this:</span> {explainability.invalidationConditions}</p>
                <p className="text-sm md:col-span-2"><span className="font-medium">Vs. holding cash / buying SPY:</span> {explainability.vsCashAndSpy}</p>
              </div>
              <p className="mt-3 text-xs text-atlas-text-tertiary">
                Expected outcome: {latestRecommendation.expectedOutcome} (horizon: {latestRecommendation.expectedTimeHorizon})
              </p>
            </div>
          )}

          <div className="atlas-glass rounded-xl p-4">
            <h2 className="mb-3 font-medium">Recommendation history &amp; performance attribution</h2>
            {recommendations.length === 0 ? (
              <EmptyState compact>No recommendations generated yet.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="text-xs text-atlas-text-tertiary">
                      <th className="pb-2 pr-4">Date</th>
                      <th className="pb-2 pr-4">Action</th>
                      <th className="pb-2 pr-4">Confidence</th>
                      <th className="pb-2 pr-4">30d</th>
                      <th className="pb-2 pr-4">90d</th>
                      <th className="pb-2 pr-4">Alpha 90d</th>
                      <th className="pb-2">Graded?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recommendations.map((r) => (
                      <tr key={r.id} className="border-t border-atlas-border-subtle">
                        <td className="py-2 pr-4">{r.generatedAt.toLocaleDateString()}</td>
                        <td className="py-2 pr-4">
                          <Badge tone={ACTION_TONE[r.action] ?? 'neutral'}>{ACTION_LABEL[r.action] ?? r.action}</Badge>
                        </td>
                        <td className="py-2 pr-4">{r.confidenceScore}/10</td>
                        <td className="py-2 pr-4">{r.outcome?.return30d !== null && r.outcome?.return30d !== undefined ? `${r.outcome.return30d.toFixed(1)}%` : 'Pending'}</td>
                        <td className="py-2 pr-4">{r.outcome?.return90d !== null && r.outcome?.return90d !== undefined ? `${r.outcome.return90d.toFixed(1)}%` : 'Pending'}</td>
                        <td className="py-2 pr-4">{r.outcome?.alpha90d !== null && r.outcome?.alpha90d !== undefined ? `${r.outcome.alpha90d.toFixed(1)}pp` : 'Pending'}</td>
                        <td className="py-2">
                          {r.outcome?.wasCorrect === true ? 'Correct' : r.outcome?.wasCorrect === false ? 'Incorrect' : 'Not yet graded'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-atlas-text-tertiary">
              Atlas has no execution layer — every outcome above tracks what would have happened had this holding simply
              been held, benchmarked against SPY. Grading (correct/incorrect) happens once, at the 90-day mark; see{' '}
              <code className="rounded bg-atlas-surface-raised px-1">lib/jobs/evaluateRecommendations.ts</code>.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
