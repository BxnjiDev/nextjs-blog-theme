import { prisma } from '@/lib/prisma';
import ActionBadge from '@/components/ActionBadge';
import ConfidenceBadge from '@/components/ConfidenceBadge';
import { normalizeExplainability } from '@/lib/domain/legacyNormalization';

export const dynamic = 'force-dynamic';

export default async function HoldingsPage() {
  const holdings = await prisma.holding.findMany({
    include: {
      recommendations: {
        orderBy: { generatedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { symbol: 'asc' },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Holdings &amp; Position Analysis</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          One card per position: current thesis, bull/bear case, catalysts, risks, and a
          recommended action with a confidence score.
        </p>
      </div>

      {holdings.length === 0 && (
        <p className="text-sm text-gray-500">No holdings yet. Seed the database or connect an account.</p>
      )}

      <div className="space-y-6">
        {holdings.map((h) => {
          const rec = h.recommendations[0];
          return (
            <section
              key={h.id}
              id={h.symbol}
              className="rounded-lg border border-gray-200 p-5 dark:border-gray-800"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">
                    {h.symbol} <span className="font-normal text-gray-500">— {h.name}</span>
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {h.sector ?? 'Sector unclassified'} · {Number(h.quantity)} shares @ avg cost{' '}
                    {Number(h.avgCostBasis).toFixed(2)}
                  </p>
                </div>
                {rec && (
                  <div className="flex flex-col items-end gap-1">
                    <ActionBadge action={rec.action} />
                    <ConfidenceBadge score={rec.confidenceScore} />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Generated {rec.generatedAt.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {rec ? (
                <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                  <div>
                    <h3 className="font-medium text-gray-700 dark:text-gray-300">Thesis</h3>
                    <p className="mt-1 text-gray-600 dark:text-gray-400">{rec.thesis}</p>
                    {rec.thesisChanged && (
                      <p className="mt-1 text-xs font-medium text-risk-medium">Thesis has changed since last review.</p>
                    )}
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-700 dark:text-gray-300">Catalysts</h3>
                    <p className="mt-1 text-gray-600 dark:text-gray-400">{rec.catalysts}</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-risk-low">Bull case</h3>
                    <p className="mt-1 text-gray-600 dark:text-gray-400">{rec.bullCase}</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-risk-high">Bear case</h3>
                    <p className="mt-1 text-gray-600 dark:text-gray-400">{rec.bearCase}</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-700 dark:text-gray-300">Risks</h3>
                    <p className="mt-1 text-gray-600 dark:text-gray-400">{rec.risks}</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-700 dark:text-gray-300">Technical trend / sentiment</h3>
                    <p className="mt-1 text-gray-600 dark:text-gray-400">
                      {rec.technicalTrend ?? 'Not yet assessed'} · {rec.institutionalSentiment ?? 'Institutional sentiment not yet assessed'}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <h3 className="font-medium text-gray-700 dark:text-gray-300">Expected outcome</h3>
                    <p className="mt-1 text-gray-600 dark:text-gray-400">
                      {rec.expectedOutcome} (horizon: {rec.expectedTimeHorizon})
                    </p>
                  </div>
                  {rec.proposedDollarAmount !== null && (
                    <div className="md:col-span-2 rounded border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                      <h3 className="font-medium text-gray-700 dark:text-gray-300">Evaluation sizing (manual execution only)</h3>
                      <p className="mt-1 text-gray-600 dark:text-gray-400">
                        Proposed ${Number(rec.proposedDollarAmount).toFixed(0)} ({rec.percentageOfPortfolio?.toFixed(1) ?? '0.0'}% of the
                        experimental portfolio). Atlas does not place this order — size and execute it yourself if you agree.
                      </p>
                    </div>
                  )}
                  {rec.explainability && (
                    <div className="md:col-span-2 rounded border border-gray-100 p-3 dark:border-gray-800">
                      <h3 className="font-medium text-gray-700 dark:text-gray-300">Explainability</h3>
                      {(() => {
                        const e = normalizeExplainability(rec.explainability)!;
                        return (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <p><span className="font-medium">Why now:</span> {e.whyNow}</p>
                            <p><span className="font-medium">Argument for waiting:</span> {e.whyNot}</p>
                            <p><span className="font-medium">Supporting:</span> {e.supportingEvidence}</p>
                            <p><span className="font-medium">Contradicting:</span> {e.contradictingEvidence}</p>
                            <p><span className="font-medium">Assumptions:</span> {e.keyAssumptions}</p>
                            <p><span className="font-medium">Would invalidate:</span> {e.invalidationConditions}</p>
                            <p className="sm:col-span-2"><span className="font-medium">Vs. cash / SPY:</span> {e.vsCashAndSpy}</p>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm text-gray-500">
                  No analysis generated yet for this holding.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
