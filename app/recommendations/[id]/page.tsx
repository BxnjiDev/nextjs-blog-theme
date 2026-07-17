import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import ActionBadge from '@/components/ActionBadge';
import ConfidenceBadge from '@/components/ConfidenceBadge';
import FreshnessStrip from '@/components/FreshnessStrip';
import { getDataFreshnessSnapshot } from '@/lib/domain/dataFreshness';
import { normalizeExplainability, normalizeDataQualityChecks } from '@/lib/domain/legacyNormalization';
import { formatPercent } from '@/lib/format';

export const dynamic = 'force-dynamic';

const DATA_QUALITY_STYLES: Record<string, string> = {
  PASS: 'bg-risk-low/10 text-risk-low',
  PASS_WITH_WARNINGS: 'bg-risk-medium/10 text-risk-medium',
  BLOCKED: 'bg-risk-high/10 text-risk-high',
};

const CHECK_STATUS_STYLES: Record<string, string> = {
  ok: 'text-risk-low',
  warning: 'text-risk-medium',
  blocking: 'text-risk-high',
};

interface CalibrationBucket {
  label: string;
  sampleSize: number;
  avgPredictedConfidence: number | null;
  actualWinRatePct: number | null;
  note: string | null;
}

function findCalibrationBucket(buckets: CalibrationBucket[], confidenceScore: number): CalibrationBucket | null {
  const index = Math.min(4, Math.floor((confidenceScore - 1) / 2)); // 1-2,3-4,5-6,7-8,9-10 -> 0..4
  return buckets[index] ?? null;
}

export default async function InvestmentMemoPage({ params }: { params: { id: string } }) {
  const recommendation = await prisma.recommendation.findUnique({
    where: { id: params.id },
    include: {
      holding: { include: { thesis: { include: { convictionAssessments: { orderBy: { generatedAt: 'desc' }, take: 1 } } } } },
      outcome: true,
    },
  });
  if (!recommendation) notFound();

  const [latestCalibration, freshness] = await Promise.all([
    prisma.confidenceCalibration.findFirst({ orderBy: { generatedAt: 'desc' } }),
    getDataFreshnessSnapshot(),
  ]);

  const explainability = normalizeExplainability(recommendation.explainability);
  const dataQualityChecks = normalizeDataQualityChecks(recommendation.dataQualityChecks);
  const conviction = recommendation.holding.thesis?.convictionAssessments[0] ?? null;
  const buckets = latestCalibration ? (latestCalibration.buckets as unknown as CalibrationBucket[]) : [];
  const bucket = findCalibrationBucket(buckets, recommendation.confidenceScore);

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/intelligence/${recommendation.symbol}`} className="text-sm text-gray-500 hover:underline">
          ← {recommendation.symbol}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">
            Investment Memo — {recommendation.symbol} <span className="font-normal text-gray-500">— {recommendation.holding.name}</span>
          </h1>
          <div className="flex items-center gap-2">
            <ActionBadge action={recommendation.action} />
            <ConfidenceBadge score={recommendation.confidenceScore} />
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Generated {recommendation.generatedAt.toLocaleString()} · decision: {recommendation.userDecision.replace(/_/g, ' ').toLowerCase()}
        </p>
      </div>

      <FreshnessStrip sources={freshness} />

      {recommendation.dataQualityStatus && (
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Data quality gate</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DATA_QUALITY_STYLES[recommendation.dataQualityStatus]}`}>
              {recommendation.dataQualityStatus.replace(/_/g, ' ')}
            </span>
          </div>
          {dataQualityChecks.length > 0 && (
            <ul className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              {dataQualityChecks.map((c) => (
                <li key={c.name} className="flex gap-2">
                  <span className={`font-medium ${CHECK_STATUS_STYLES[c.status]}`}>{c.name.replace(/_/g, ' ')}:</span>
                  <span className="text-gray-600 dark:text-gray-400">{c.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Overall conviction</p>
          <p className="text-2xl font-semibold">{conviction ? `${conviction.overallScore}/100` : 'No data'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Confidence</p>
          <p className="text-2xl font-semibold">{recommendation.confidenceScore}/10</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Confidence calibration</p>
          <p className="text-2xl font-semibold">{bucket?.actualWinRatePct !== null && bucket?.actualWinRatePct !== undefined ? `${bucket.actualWinRatePct.toFixed(0)}%` : 'No data yet'}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {bucket ? `Historical win rate for confidence band ${bucket.label} (n=${bucket.sampleSize})${bucket.note ? ` — ${bucket.note}` : ''}` : 'No graded recommendations in this band yet.'}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Proposed size</p>
          <p className="text-2xl font-semibold">
            {recommendation.proposedDollarAmount !== null ? `$${Number(recommendation.proposedDollarAmount).toFixed(0)}` : 'n/a'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {recommendation.percentageOfPortfolio !== null ? `${recommendation.percentageOfPortfolio.toFixed(1)}% of portfolio` : ''}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="font-medium text-risk-low">Bull case</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{recommendation.bullCase}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="font-medium text-gray-700 dark:text-gray-300">Base case</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{explainability?.baseCase ?? 'Not assessed.'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="font-medium text-risk-high">Bear case</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{recommendation.bearCase}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="font-medium text-gray-700 dark:text-gray-300">Primary catalyst</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{explainability?.primaryCatalyst ?? 'Not assessed.'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="font-medium text-gray-700 dark:text-gray-300">Biggest risk</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{explainability?.biggestRisk ?? 'Not assessed.'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="font-medium text-gray-700 dark:text-gray-300">Biggest unknown</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{explainability?.biggestUnknown ?? 'Not assessed.'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="font-medium text-gray-700 dark:text-gray-300">Why confidence isn&rsquo;t higher</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{explainability?.whyConfidenceNotHigher ?? 'Not assessed.'}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-3 font-medium">Full thesis</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">{recommendation.thesis}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Catalysts</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{recommendation.catalysts}</p>
          </div>
          <div>
            <h3 className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Risks</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{recommendation.risks}</p>
          </div>
        </div>
      </div>

      {explainability && (
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="mb-3 font-medium">Explainability</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <p className="text-sm"><span className="font-medium">Why now:</span> {explainability.whyNow}</p>
            <p className="text-sm"><span className="font-medium">Argument for waiting:</span> {explainability.whyNot}</p>
            <p className="text-sm"><span className="font-medium">Supporting evidence:</span> {explainability.supportingEvidence}</p>
            <p className="text-sm"><span className="font-medium">Contradicting evidence:</span> {explainability.contradictingEvidence}</p>
            <p className="text-sm"><span className="font-medium">Key assumptions:</span> {explainability.keyAssumptions}</p>
            <p className="text-sm"><span className="font-medium">Invalidation conditions:</span> {explainability.invalidationConditions}</p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
        <h2 className="mb-3 font-medium">Portfolio &amp; benchmark comparison</h2>
        <div className="grid gap-3">
          <p className="text-sm"><span className="font-medium">Portfolio impact:</span> {explainability?.portfolioImpact ?? 'Not assessed.'}</p>
          <p className="text-sm"><span className="font-medium">Opportunity cost:</span> {explainability?.opportunityCost ?? 'Not assessed.'}</p>
          <p className="text-sm"><span className="font-medium">Vs. holding cash / buying SPY:</span> {explainability?.vsCashAndSpy ?? 'Not assessed.'}</p>
          <p className="text-sm"><span className="font-medium">Vs. current portfolio allocation:</span> {explainability?.vsCurrentAllocation ?? 'Not assessed.'}</p>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Expected outcome: {recommendation.expectedOutcome} (horizon: {recommendation.expectedTimeHorizon}). Atlas does not place this
          order — this is manual-execution guidance only.
        </p>
      </div>

      {recommendation.outcome && (
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="mb-3 font-medium">Outcome so far</h2>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ['1d', recommendation.outcome.return1d, recommendation.outcome.alpha1d],
                ['7d', recommendation.outcome.return7d, recommendation.outcome.alpha7d],
                ['30d', recommendation.outcome.return30d, recommendation.outcome.alpha30d],
                ['90d', recommendation.outcome.return90d, recommendation.outcome.alpha90d],
                ['180d', recommendation.outcome.return180d, recommendation.outcome.alpha180d],
                ['365d', recommendation.outcome.return365d, recommendation.outcome.alpha365d],
              ] as const
            ).map(([label, ret, alpha]) => (
              <div key={label} className="rounded border border-gray-100 px-3 py-2 dark:border-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                <p className={ret !== null ? (ret >= 0 ? 'text-risk-low' : 'text-risk-high') : 'text-gray-400'}>
                  {ret !== null ? formatPercent(ret) : 'pending'}
                </p>
                {alpha !== null && <p className="text-xs text-gray-500 dark:text-gray-400">α {formatPercent(alpha)}</p>}
              </div>
            ))}
          </div>
          {recommendation.outcome.lessonsLearned && (
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">Retrospective:</span> {recommendation.outcome.lessonsLearned}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
