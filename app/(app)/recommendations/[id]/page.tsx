import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import FreshnessStrip from '@/components/FreshnessStrip';
import Meter from '@/components/ui/Meter';
import Badge from '@/components/ui/Badge';
import StatStrip, { Stat } from '@/components/ui/Stat';
import DecisionPanel from '@/components/recommendations/DecisionPanel';
import FadeInView from '@/components/motion/FadeInView';
import { getDataFreshnessSnapshot } from '@/lib/domain/dataFreshness';
import { normalizeExplainability, normalizeDataQualityChecks } from '@/lib/domain/legacyNormalization';
import { formatPercent } from '@/lib/format';
import { getActiveAccountId } from '@/lib/domain/portfolio';
import { ACTION_TONE, ACTION_LABEL, GATE_STATUS_TONE, CHECK_STATUS_TONE, TONE_TEXT } from '@/lib/theme/tone';

export const dynamic = 'force-dynamic';

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-atlas-text-tertiary">{label}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-atlas-text-secondary">{children}</p>
    </div>
  );
}

export default async function InvestmentMemoPage({ params }: { params: { id: string } }) {
  const recommendation = await prisma.recommendation.findUnique({
    where: { id: params.id },
    include: {
      holding: { include: { thesis: { include: { convictionAssessments: { orderBy: { generatedAt: 'desc' }, take: 1 } } } } },
      outcome: true,
    },
  });
  // A recommendation ID alone doesn't prove it belongs to the active
  // account — without this check, guessing or reusing an ID from another
  // account (e.g. leftover seed data) would render its full Investment
  // Memo. Treat a cross-account match the same as "doesn't exist."
  const activeAccountId = await getActiveAccountId();
  if (!recommendation || recommendation.holding.accountId !== activeAccountId) notFound();

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
    <div className="space-y-12 pb-16">
      <FadeInView>
        <Link href={`/intelligence/${recommendation.symbol}`} className="text-sm text-atlas-text-tertiary hover:text-atlas-text-secondary">
          ← {recommendation.symbol}
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-atlas-text-tertiary">Investment memo</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-atlas-text">
              {recommendation.symbol}
              <span className="ml-3 text-lg font-normal text-atlas-text-tertiary">{recommendation.holding.name}</span>
            </h1>
          </div>
          <Badge tone={ACTION_TONE[recommendation.action] ?? 'neutral'} variant="outline" className="shrink-0">
            {ACTION_LABEL[recommendation.action] ?? recommendation.action}
          </Badge>
        </div>

        <p className="mt-3 text-xs text-atlas-text-tertiary">Generated {recommendation.generatedAt.toLocaleString()}</p>

        <div className="mt-4">
          <DecisionPanel recommendationId={recommendation.id} currentDecision={recommendation.userDecision} />
        </div>
      </FadeInView>

      <FreshnessStrip sources={freshness} />

      {recommendation.dataQualityStatus && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-atlas-text-tertiary">Data quality gate</p>
            <Badge tone={GATE_STATUS_TONE[recommendation.dataQualityStatus] ?? 'muted'}>
              {recommendation.dataQualityStatus.replace(/_/g, ' ')}
            </Badge>
          </div>
          {dataQualityChecks.length > 0 && (
            <ul className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              {dataQualityChecks.map((c) => (
                <li key={c.name} className="flex gap-2">
                  <span className={`font-medium ${TONE_TEXT[CHECK_STATUS_TONE[c.status] ?? 'muted']}`}>{c.name.replace(/_/g, ' ')}:</span>
                  <span className="text-atlas-text-tertiary">{c.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Key figures — a thin strip, not four separate boxed cards. */}
      <StatStrip>
        <Stat label="Overall conviction" value={conviction ? `${conviction.overallScore}/100` : 'No data'} />
        <div className="min-w-[160px]">
          <Meter score={recommendation.confidenceScore} max={10} label="Confidence" />
        </div>
        <Stat
          label="Confidence calibration"
          value={bucket?.actualWinRatePct !== null && bucket?.actualWinRatePct !== undefined ? `${bucket.actualWinRatePct.toFixed(0)}%` : 'No data yet'}
          meta={
            <span className="max-w-xs">
              {bucket
                ? `Historical win rate for confidence band ${bucket.label} (n=${bucket.sampleSize})${bucket.note ? ` — ${bucket.note}` : ''}`
                : 'No graded recommendations in this band yet.'}
            </span>
          }
        />
        <Stat
          label="Proposed size"
          value={recommendation.proposedDollarAmount !== null ? `$${Number(recommendation.proposedDollarAmount).toFixed(0)}` : 'n/a'}
          meta={recommendation.percentageOfPortfolio !== null ? `${recommendation.percentageOfPortfolio.toFixed(1)}% of portfolio` : undefined}
        />
      </StatStrip>

      {/* Bull / base / bear — an editorial left-rule treatment instead of
          three boxed cards, reads like a briefing document's case summary. */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="border-l-2 border-atlas-emerald/40 pl-4">
          <h2 className="text-sm font-medium text-atlas-emerald">Bull case</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-atlas-text-secondary">{recommendation.bullCase}</p>
        </div>
        <div className="border-l-2 border-atlas-border pl-4">
          <h2 className="text-sm font-medium text-atlas-text-secondary">Base case</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-atlas-text-secondary">{explainability?.baseCase ?? 'Not assessed.'}</p>
        </div>
        <div className="border-l-2 border-risk-high/40 pl-4">
          <h2 className="text-sm font-medium text-risk-high">Bear case</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-atlas-text-secondary">{recommendation.bearCase}</p>
        </div>
      </div>

      <div className="grid gap-x-8 gap-y-6 border-t border-atlas-border-subtle pt-8 sm:grid-cols-2">
        <Field label="Primary catalyst">{explainability?.primaryCatalyst ?? 'Not assessed.'}</Field>
        <Field label="Biggest risk">{explainability?.biggestRisk ?? 'Not assessed.'}</Field>
        <Field label="Biggest unknown">{explainability?.biggestUnknown ?? 'Not assessed.'}</Field>
        <Field label="Why confidence isn't higher">{explainability?.whyConfidenceNotHigher ?? 'Not assessed.'}</Field>
      </div>

      <div className="border-t border-atlas-border-subtle pt-8">
        <h2 className="mb-3 text-sm font-medium text-atlas-text">Full thesis</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-atlas-text-secondary">{recommendation.thesis}</p>
        <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Field label="Catalysts">{recommendation.catalysts}</Field>
          <Field label="Risks">{recommendation.risks}</Field>
        </div>
      </div>

      {explainability && (
        <div className="border-t border-atlas-border-subtle pt-8">
          <h2 className="mb-4 text-sm font-medium text-atlas-text">Explainability</h2>
          <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
            <Field label="Why now">{explainability.whyNow}</Field>
            <Field label="Argument for waiting">{explainability.whyNot}</Field>
            <Field label="Supporting evidence">{explainability.supportingEvidence}</Field>
            <Field label="Contradicting evidence">{explainability.contradictingEvidence}</Field>
            <Field label="Key assumptions">{explainability.keyAssumptions}</Field>
            <Field label="Invalidation conditions">{explainability.invalidationConditions}</Field>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-atlas-warning/20 bg-atlas-warning/5 p-5">
        <h2 className="mb-3 text-sm font-medium text-atlas-warning">Portfolio &amp; benchmark comparison</h2>
        <div className="grid gap-3">
          <Field label="Portfolio impact">{explainability?.portfolioImpact ?? 'Not assessed.'}</Field>
          <Field label="Opportunity cost">{explainability?.opportunityCost ?? 'Not assessed.'}</Field>
          <Field label="Vs. holding cash / buying SPY">{explainability?.vsCashAndSpy ?? 'Not assessed.'}</Field>
          <Field label="Vs. current portfolio allocation">{explainability?.vsCurrentAllocation ?? 'Not assessed.'}</Field>
        </div>
        <p className="mt-4 text-xs text-atlas-text-tertiary">
          Expected outcome: {recommendation.expectedOutcome} (horizon: {recommendation.expectedTimeHorizon}). Atlas
          does not place this order — this is manual-execution guidance only.
        </p>
      </div>

      {recommendation.outcome && (
        <div className="border-t border-atlas-border-subtle pt-8">
          <h2 className="mb-4 text-sm font-medium text-atlas-text">Outcome so far</h2>
          <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm">
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
              <Stat
                key={label}
                label={label}
                tone={ret !== null ? (ret >= 0 ? 'positive' : 'negative') : 'muted'}
                value={ret !== null ? formatPercent(ret) : 'pending'}
                meta={alpha !== null ? `α ${formatPercent(alpha)}` : undefined}
              />
            ))}
          </div>
          {recommendation.outcome.lessonsLearned && (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-atlas-text-secondary">
              <span className="font-medium text-atlas-text">Retrospective:</span> {recommendation.outcome.lessonsLearned}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
