import { prisma } from '@/lib/prisma';
import RiskGauge from '@/components/RiskGauge';

export const dynamic = 'force-dynamic';

export default async function RiskPage() {
  const risk = await prisma.riskAssessment.findFirst({ orderBy: { generatedAt: 'desc' } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Risk Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Every factor is scored 1-100, higher meaning riskier. This is a model estimate, not a
          guarantee — treat it as one input into a decision, not a verdict.
        </p>
      </div>

      {!risk ? (
        <p className="text-sm text-gray-500">No risk assessment generated yet.</p>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Overall portfolio risk score
            </p>
            <p className="mt-1 text-4xl font-semibold">{risk.overallScore}/100</p>
            {risk.notes && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{risk.notes}</p>}
          </div>

          <div className="grid gap-4 rounded-lg border border-gray-200 p-5 dark:border-gray-800 md:grid-cols-2">
            <RiskGauge label="Concentration risk" score={risk.concentrationRisk} />
            <RiskGauge label="Sector risk" score={risk.sectorRisk} />
            <RiskGauge label="Valuation risk" score={risk.valuationRisk} />
            <RiskGauge label="Earnings risk" score={risk.earningsRisk} />
            <RiskGauge label="Regulatory risk" score={risk.regulatoryRisk} />
            <RiskGauge label="Liquidity risk" score={risk.liquidityRisk} />
            <RiskGauge label="Macroeconomic risk" score={risk.macroRisk} />
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Generated {risk.generatedAt.toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}
