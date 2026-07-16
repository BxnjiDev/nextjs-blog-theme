import { prisma } from '@/lib/prisma';
import RiskGauge from '@/components/RiskGauge';
import TrendLineChart from '@/components/charts/TrendLineChart';

export const dynamic = 'force-dynamic';

const COMPONENT_LABELS: Record<string, string> = {
  diversificationScore: 'Diversification',
  qualityScore: 'Quality',
  growthScore: 'Growth',
  riskScore: 'Risk (inverted)',
  valuationScore: 'Valuation',
  sectorBalanceScore: 'Sector balance',
  cashAllocationScore: 'Cash allocation',
  concentrationScore: 'Concentration (inverted)',
  macroExposureScore: 'Macro exposure (inverted)',
};

export default async function HealthPage() {
  const history = await prisma.portfolioHealthAssessment.findMany({
    orderBy: { generatedAt: 'asc' },
    take: 90,
  });
  const latest = history[history.length - 1];

  const chartData = history.map((h) => ({ label: h.generatedAt.toLocaleDateString(), value: h.overallScore }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Portfolio Health</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Deterministic composite score (0-100, higher is healthier) across diversification, quality, growth, risk,
          valuation, sector balance, cash allocation, concentration, and macro exposure.
        </p>
      </div>

      {!latest ? (
        <p className="text-sm text-gray-500">No health assessment generated yet.</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Overall health score</p>
              <p className="mt-1 text-4xl font-semibold">{latest.overallScore}/100</p>
              {latest.previousScore !== null && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Previous: {latest.previousScore} ({latest.overallScore - latest.previousScore >= 0 ? '+' : ''}
                  {latest.overallScore - latest.previousScore})
                </p>
              )}
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Generated {latest.generatedAt.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
              <p className="mb-2 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Trend</p>
              <TrendLineChart data={chartData} domain={[0, 100]} color="#16a34a" />
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border border-gray-200 p-5 dark:border-gray-800 md:grid-cols-2">
            {Object.entries(COMPONENT_LABELS).map(([key, label]) => (
              <RiskGauge key={key} label={label} score={(latest as unknown as Record<string, number>)[key]} invert />
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <h2 className="mb-2 font-medium text-risk-low">Top improvements</h2>
              <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                {(latest.topImprovements as string[]).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <h2 className="mb-2 font-medium text-risk-high">Top concerns</h2>
              <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                {(latest.topConcerns as string[]).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
