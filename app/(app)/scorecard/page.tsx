import { prisma } from '@/lib/prisma';
import { formatPercent } from '@/lib/format';
import TrendLineChart from '@/components/charts/TrendLineChart';
import FadeInView from '@/components/motion/FadeInView';

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
    <div className="space-y-12">
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
        <p className="text-sm text-atlas-text-tertiary">No scorecard computed yet — needs at least one recommendation on record.</p>
      ) : (
        <FadeInView delay={0.05}>
          <div className="flex flex-wrap gap-x-10 gap-y-4 border-y border-atlas-border-subtle py-5">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Total recommendations</p>
              <p className="mt-1 font-mono text-lg text-atlas-text">{latest.totalRecommendations}</p>
              <p className="mt-0.5 text-xs text-atlas-text-tertiary">
                {latest.buyCount} buy · {latest.holdCount} hold · {latest.reduceCount} reduce · {latest.sellCount} sell · {latest.watchCount} watch
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Win rate</p>
              <p className="mt-1 font-mono text-lg text-atlas-text">{latest.winRatePct !== null ? `${latest.winRatePct.toFixed(0)}%` : 'No graded calls'}</p>
              <p className="mt-0.5 text-xs text-atlas-text-tertiary">
                {latest.falsePositives} false pos · {latest.falseNegatives} false neg
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Avg. alpha vs. SPY (90d)</p>
              <p className="mt-1 font-mono text-lg text-atlas-text">{latest.alphaVsSpyAvgPct !== null ? formatPercent(latest.alphaVsSpyAvgPct) : 'n/a'}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Avg. revisit gap (proxy)</p>
              <p className="mt-1 font-mono text-lg text-atlas-text">{latest.avgHoldingPeriodDays !== null ? `${latest.avgHoldingPeriodDays.toFixed(0)}d` : 'n/a'}</p>
              <p className="mt-0.5 text-xs text-atlas-text-tertiary">No execution layer — see methodology.</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Avg. gain / drawdown (proxy)</p>
              <p className="mt-1 font-mono text-lg">
                <span className="text-risk-low">{latest.avgGainPct !== null ? formatPercent(latest.avgGainPct) : 'n/a'}</span>
                <span className="text-atlas-text-tertiary"> / </span>
                <span className="text-risk-high">{latest.avgDrawdownPct !== null ? `-${latest.avgDrawdownPct.toFixed(1)}%` : 'n/a'}</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Utilization</p>
              <p className="mt-1 font-mono text-lg text-atlas-text">{latest.utilizationPct !== null ? `${latest.utilizationPct.toFixed(0)}%` : 'n/a'}</p>
              <p className="mt-0.5 text-xs text-atlas-text-tertiary">% with any recorded decision</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Acceptance rate</p>
              <p className="mt-1 font-mono text-lg text-atlas-text">{latest.acceptanceRatePct !== null ? `${latest.acceptanceRatePct.toFixed(0)}%` : 'n/a'}</p>
              <p className="mt-0.5 text-xs text-atlas-text-tertiary">
                of decided recs accepted — see{' '}
                <a href="/recommendations" className="text-atlas-accent-bright underline">
                  history
                </a>
              </p>
            </div>
          </div>
        </FadeInView>
      )}

      {scorecards.length > 1 && (
        <FadeInView delay={0.1}>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Win rate trend</h2>
          <TrendLineChart data={winRateTrend} domain={[0, 100]} />
        </FadeInView>
      )}

      <FadeInView delay={0.15}>
        <div className="border-t border-atlas-border-subtle pt-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Confidence calibration</h2>
          {!latestCalibration ? (
            <p className="text-sm text-atlas-text-tertiary">No graded recommendations yet — nothing to calibrate against.</p>
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
                  <div key={b.label}>
                    <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">{b.label}</p>
                    <p className="mt-1 font-mono text-lg text-atlas-text">{b.actualWinRatePct !== null ? `${b.actualWinRatePct.toFixed(0)}%` : 'n/a'}</p>
                    <p className="mt-0.5 text-xs text-atlas-text-tertiary">
                      n={b.sampleSize}
                      {b.note ? ` — ${b.note}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </FadeInView>

      <FadeInView delay={0.2}>
        <div className="border-t border-atlas-border-subtle pt-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Detected patterns</h2>
          {patterns.length === 0 ? (
            <p className="text-sm text-atlas-text-tertiary">
              No pattern has yet cleared the minimum sample-size threshold — with this few recommendations on
              record, that&rsquo;s the honest result, not a missing feature.
            </p>
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
