import { prisma } from '@/lib/prisma';
import RiskGauge from '@/components/RiskGauge';
import TrendLineChart from '@/components/charts/TrendLineChart';

export const dynamic = 'force-dynamic';

const COMPONENT_LABELS: Record<string, string> = {
  concentrationRisk: 'Concentration',
  sectorRisk: 'Sector concentration',
  volatilityRisk: 'Volatility',
  betaRisk: 'Beta vs. SPY',
  drawdownRisk: 'Drawdown',
  valuationRisk: 'Valuation',
  earningsRisk: 'Earnings-event proxy',
  regulatoryRisk: 'Regulatory exposure',
  liquidityRisk: 'Liquidity',
  macroRisk: 'Macro sensitivity',
  newsRisk: 'News/controversy',
  stalenessRisk: 'Data staleness',
};

export default async function RiskPage() {
  const history = await prisma.riskAssessment.findMany({ orderBy: { generatedAt: 'asc' }, take: 90 });
  const risk = history[history.length - 1];
  const chartData = history.map((r) => ({ label: r.generatedAt.toLocaleDateString(), value: r.overallScore }));
  const explanation = (risk?.explanation ?? {}) as Record<string, string>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Risk Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Every factor is a deterministic calculation (see lib/domain/risk.ts), scored 0-100, higher meaning
          riskier — not an AI-generated number. Treat it as one input into a decision, not a verdict.
        </p>
      </div>

      {!risk ? (
        <p className="text-sm text-gray-500">No risk assessment generated yet.</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Overall portfolio risk score
              </p>
              <p className="mt-1 text-4xl font-semibold">{risk.overallScore}/100</p>
              {risk.previousScore !== null && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Previous: {risk.previousScore} ({risk.overallScore - risk.previousScore >= 0 ? '+' : ''}
                  {risk.overallScore - risk.previousScore})
                </p>
              )}
              {risk.notes && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{risk.notes}</p>}
            </div>
            <div className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
              <p className="mb-2 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Trend</p>
              <TrendLineChart data={chartData} domain={[0, 100]} color="#dc2626" />
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border border-gray-200 p-5 dark:border-gray-800 md:grid-cols-2">
            {Object.entries(COMPONENT_LABELS).map(([key, label]) => (
              <div key={key}>
                <RiskGauge label={label} score={(risk as unknown as Record<string, number>)[key]} />
                {explanation[key] && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{explanation[key]}</p>}
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">Generated {risk.generatedAt.toLocaleString()}</p>
        </>
      )}
    </div>
  );
}
