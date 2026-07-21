import { prisma } from '@/lib/prisma';
import RiskGauge from '@/components/RiskGauge';
import TrendLineChart from '@/components/charts/TrendLineChart';
import FadeInView from '@/components/motion/FadeInView';
import AnimatedNumber from '@/components/motion/AnimatedNumber';

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
    <div className="space-y-12">
      <FadeInView>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-atlas-text-tertiary">Risk</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-atlas-text">Portfolio risk</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-atlas-text-secondary">
          Every factor is a deterministic calculation (<code className="rounded bg-atlas-surface-raised px-1">lib/domain/risk.ts</code>),
          scored 0-100, higher meaning riskier — not an AI-generated number. Treat it as one input into a decision,
          not a verdict.
        </p>
      </FadeInView>

      {!risk ? (
        <p className="text-sm text-atlas-text-tertiary">No risk assessment generated yet.</p>
      ) : (
        <>
          <FadeInView delay={0.05}>
            <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Overall risk score</p>
                <AnimatedNumber value={risk.overallScore} format="integer" className="mt-1 block text-5xl font-semibold text-atlas-text" />
                <p className="mt-1 text-xs text-atlas-text-tertiary">/100</p>
                {risk.previousScore !== null && (
                  <p className="mt-2 text-sm text-atlas-text-secondary">
                    Previous: {risk.previousScore} (
                    <span className={risk.overallScore - risk.previousScore <= 0 ? 'text-risk-low' : 'text-risk-high'}>
                      {risk.overallScore - risk.previousScore >= 0 ? '+' : ''}
                      {risk.overallScore - risk.previousScore}
                    </span>
                    )
                  </p>
                )}
                {risk.notes && <p className="mt-2 text-sm leading-relaxed text-atlas-text-secondary">{risk.notes}</p>}
              </div>
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Trend</p>
                <TrendLineChart data={chartData} domain={[0, 100]} color="#f0a020" />
              </div>
            </div>
          </FadeInView>

          <FadeInView delay={0.1}>
            <div className="grid gap-x-8 gap-y-6 border-t border-atlas-border-subtle pt-8 md:grid-cols-2">
              {Object.entries(COMPONENT_LABELS).map(([key, label]) => (
                <div key={key}>
                  <RiskGauge label={label} score={(risk as unknown as Record<string, number>)[key]} />
                  {explanation[key] && <p className="mt-1 text-xs text-atlas-text-tertiary">{explanation[key]}</p>}
                </div>
              ))}
            </div>
          </FadeInView>

          <p className="text-xs text-atlas-text-tertiary">Generated {risk.generatedAt.toLocaleString()}</p>
        </>
      )}
    </div>
  );
}
