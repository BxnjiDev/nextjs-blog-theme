import { prisma } from '@/lib/prisma';
import { formatPercent } from '@/lib/format';
import TrendLineChart from '@/components/charts/TrendLineChart';

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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Scorecard, Calibration &amp; Patterns</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Atlas measuring its own effectiveness: a permanent scorecard of every recommendation ever made, whether
          stated confidence has actually been statistically meaningful, and any recurring characteristics of
          successful calls — surfaced only once a pattern clears a minimum sample size. Computed weekly by{' '}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">/api/jobs/learning</code>.
        </p>
      </div>

      {!latest ? (
        <p className="text-sm text-gray-500">No scorecard computed yet — needs at least one recommendation on record.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total recommendations</p>
            <p className="text-2xl font-semibold">{latest.totalRecommendations}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {latest.buyCount} buy · {latest.holdCount} hold · {latest.reduceCount} reduce · {latest.sellCount} sell · {latest.watchCount} watch
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Win rate</p>
            <p className="text-2xl font-semibold">{latest.winRatePct !== null ? `${latest.winRatePct.toFixed(0)}%` : 'No graded calls yet'}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {latest.falsePositives} false positive(s) · {latest.falseNegatives} false negative(s)
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Avg. alpha vs. SPY (90d)</p>
            <p className="text-2xl font-semibold">{latest.alphaVsSpyAvgPct !== null ? formatPercent(latest.alphaVsSpyAvgPct) : 'n/a'}</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Avg. revisit gap (proxy)</p>
            <p className="text-2xl font-semibold">{latest.avgHoldingPeriodDays !== null ? `${latest.avgHoldingPeriodDays.toFixed(0)}d` : 'n/a'}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">No execution layer — see methodology.</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Avg. gain / drawdown (proxy)</p>
            <p className="text-2xl font-semibold">
              <span className="text-risk-low">{latest.avgGainPct !== null ? formatPercent(latest.avgGainPct) : 'n/a'}</span>
              {' / '}
              <span className="text-risk-high">{latest.avgDrawdownPct !== null ? `-${latest.avgDrawdownPct.toFixed(1)}%` : 'n/a'}</span>
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Alpha-based proxy, not a true peak-to-trough measure — see methodology.</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Utilization</p>
            <p className="text-2xl font-semibold">{latest.utilizationPct !== null ? `${latest.utilizationPct.toFixed(0)}%` : 'n/a'}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">% of recommendations with any recorded decision.</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Acceptance rate</p>
            <p className="text-2xl font-semibold">{latest.acceptanceRatePct !== null ? `${latest.acceptanceRatePct.toFixed(0)}%` : 'n/a'}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              % of decided recommendations accepted — see{' '}
              <a href="/recommendations" className="underline">
                history
              </a>
              .
            </p>
          </div>
        </div>
      )}

      {scorecards.length > 1 && (
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="mb-3 font-medium">Win rate trend</h2>
          <TrendLineChart data={winRateTrend} domain={[0, 100]} />
        </div>
      )}

      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-3 font-medium">Confidence calibration</h2>
        {!latestCalibration ? (
          <p className="text-sm text-gray-500">No graded recommendations yet — nothing to calibrate against.</p>
        ) : (
          <>
            <p className="mb-3 text-sm">
              Brier score: <span className="font-semibold">{latestCalibration.overallBrierScore?.toFixed(3) ?? 'n/a'}</span> (lower is better
              calibrated; 0 = perfect, 0.25 = no better than a coin flip) across {latestCalibration.sampleSize} graded recommendation(s).
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {buckets.map((b) => (
                <div key={b.label} className="rounded border border-gray-100 px-3 py-2 dark:border-gray-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{b.label}</p>
                  <p className="text-lg font-semibold">{b.actualWinRatePct !== null ? `${b.actualWinRatePct.toFixed(0)}%` : 'n/a'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">n={b.sampleSize}{b.note ? ` — ${b.note}` : ''}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-3 font-medium">Detected patterns</h2>
        {patterns.length === 0 ? (
          <p className="text-sm text-gray-500">
            No pattern has yet cleared the minimum sample-size threshold — with this few recommendations on record,
            that&rsquo;s the honest result, not a missing feature.
          </p>
        ) : (
          <ul className="space-y-3 text-sm">
            {patterns.map((p) => (
              <li key={p.id} className="border-l-2 border-gray-200 pl-3 dark:border-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {p.generatedAt.toLocaleDateString()} · confidence: {p.confidenceLevel.toLowerCase()} (n={p.sampleSize})
                </p>
                <p className="mt-1 text-gray-700 dark:text-gray-300">{p.description}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
