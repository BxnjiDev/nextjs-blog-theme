import { prisma } from '@/lib/prisma';
import { formatPercent } from '@/lib/format';
import TrendLineChart from '@/components/charts/TrendLineChart';
import FadeInView from '@/components/motion/FadeInView';
import EmptyState from '@/components/ui/EmptyState';
import SectionHeading from '@/components/ui/SectionHeading';
import StatStrip, { Stat } from '@/components/ui/Stat';

export const dynamic = 'force-dynamic';

interface CalibrationBucket {
  label: string;
  sampleSize: number;
  avgPredictedConfidence: number | null;
  actualWinRatePct: number | null;
  avgAlpha90d: number | null;
  note: string | null;
}

export default async function ScorecardPage() {
  const [scorecards, latestCalibration, patterns] = await Promise.all([
    prisma.recommendationScorecard.findMany({ orderBy: { generatedAt: 'desc' }, take: 20 }),
    prisma.confidenceCalibration.findFirst({ orderBy: { generatedAt: 'desc' } }),
    prisma.recommendationPattern.findMany({ orderBy: { generatedAt: 'desc' }, take: 20 }),
  ]);

  const latest = scorecards[0] ?? null;
  const winRateTrend = [...scorecards].reverse().map((s) => ({ label: s.generatedAt.toLocaleDateString(), value: s.winRatePct ?? 0 }));
  const buckets = latestCalibration ? (latestCalibration.buckets as unknown as CalibrationBucket[]) : [];

  return (
    <div className="space-y-14">
      <FadeInView>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-atlas-text-tertiary">Scorecard</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-atlas-text">Scorecard, calibration &amp; patterns</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-atlas-text-secondary">
          Atlas measuring its own effectiveness: a permanent scorecard of every recommendation ever made, whether
          stated confidence has actually been statistically meaningful, and any recurring characteristics of
          successful calls — surfaced only once a pattern clears a minimum sample size. Computed weekly by{' '}
          <code className="rounded bg-atlas-surface-raised px-1">/api/jobs/learning</code>.
        </p>
      </FadeInView>

      {!latest ? (
        <EmptyState>No scorecard computed yet — needs at least one recommendation on record.</EmptyState>
      ) : (
        <FadeInView delay={0.05}>
          <StatStrip>
            <Stat
              label="Total recommendations"
              value={latest.totalRecommendations}
              meta={`${latest.buyCount} buy · ${latest.holdCount} hold · ${latest.reduceCount} reduce · ${latest.sellCount} sell · ${latest.watchCount} watch`}
            />
            <Stat
              label="Win rate"
              value={latest.winRatePct !== null ? `${latest.winRatePct.toFixed(0)}%` : 'No graded calls'}
              meta={`${latest.falsePositives} false pos · ${latest.falseNegatives} false neg`}
            />
            <Stat label="Avg. alpha vs. SPY (90d)" value={latest.alphaVsSpyAvgPct !== null ? formatPercent(latest.alphaVsSpyAvgPct) : 'n/a'} />
            <Stat
              label="Avg. revisit gap (proxy)"
              value={latest.avgHoldingPeriodDays !== null ? `${latest.avgHoldingPeriodDays.toFixed(0)}d` : 'n/a'}
              meta="No execution layer — see methodology."
            />
            <Stat
              label="Avg. gain / drawdown (proxy)"
              value={
                <>
                  <span className="text-risk-low">{latest.avgGainPct !== null ? formatPercent(latest.avgGainPct) : 'n/a'}</span>
                  <span className="text-atlas-text-tertiary"> / </span>
                  <span className="text-risk-high">{latest.avgDrawdownPct !== null ? `-${latest.avgDrawdownPct.toFixed(1)}%` : 'n/a'}</span>
                </>
              }
            />
            <Stat
              label="Utilization"
              value={latest.utilizationPct !== null ? `${latest.utilizationPct.toFixed(0)}%` : 'n/a'}
              meta="% with any recorded decision"
            />
            <Stat
              label="Acceptance rate"
              value={latest.acceptanceRatePct !== null ? `${latest.acceptanceRatePct.toFixed(0)}%` : 'n/a'}
              meta={
                <>
                  of decided recs accepted — see{' '}
                  <a href="/recommendations" className="text-atlas-accent-bright underline">
                    history
                  </a>
                </>
              }
            />
          </StatStrip>
        </FadeInView>
      )}

      {scorecards.length > 1 && (
        <FadeInView delay={0.1}>
          <SectionHeading className="mb-3">Win rate trend</SectionHeading>
          <TrendLineChart data={winRateTrend} domain={[0, 100]} />
        </FadeInView>
      )}

      <FadeInView delay={0.15}>
        <div className="border-t border-atlas-border-subtle pt-8">
          <SectionHeading className="mb-3">Confidence calibration</SectionHeading>
          {!latestCalibration ? (
            <EmptyState>No graded recommendations yet — nothing to calibrate against.</EmptyState>
          ) : (
            <>
              <p className="mb-4 text-sm text-atlas-text-secondary">
                Brier score:{' '}
                <span className="font-mono font-semibold text-atlas-text">{latestCalibration.overallBrierScore?.toFixed(3) ?? 'n/a'}</span>{' '}
                (lower is better calibrated; 0 = perfect, 0.25 = no better than a coin flip) across{' '}
                {latestCalibration.sampleSize} graded recommendation(s).
              </p>
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
                {buckets.map((b) => (
                  <Stat
                    key={b.label}
                    label={b.label}
                    value={b.actualWinRatePct !== null ? `${b.actualWinRatePct.toFixed(0)}%` : 'n/a'}
                    meta={`n=${b.sampleSize}${b.note ? ` — ${b.note}` : ''}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </FadeInView>

      <FadeInView delay={0.2}>
        <div className="border-t border-atlas-border-subtle pt-8">
          <SectionHeading className="mb-3">Detected patterns</SectionHeading>
          {patterns.length === 0 ? (
            <EmptyState>
              No pattern has yet cleared the minimum sample-size threshold — with this few recommendations on
              record, that&rsquo;s the honest result, not a missing feature.
            </EmptyState>
          ) : (
            <ul className="space-y-4">
              {patterns.map((p) => (
                <li key={p.id} className="border-l-2 border-atlas-border pl-4">
                  <p className="text-xs text-atlas-text-tertiary">
                    {p.generatedAt.toLocaleDateString()} · confidence: {p.confidenceLevel.toLowerCase()} (n={p.sampleSize})
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-atlas-text-secondary">{p.description}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </FadeInView>
    </div>
  );
}
