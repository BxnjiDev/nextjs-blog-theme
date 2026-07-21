import { prisma } from '@/lib/prisma';
import RiskGauge from '@/components/RiskGauge';
import TrendLineChart from '@/components/charts/TrendLineChart';
import FadeInView from '@/components/motion/FadeInView';
import AnimatedNumber from '@/components/motion/AnimatedNumber';

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
    <div className="space-y-12">
      <FadeInView>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-atlas-text-tertiary">Health</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-atlas-text">Portfolio health</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-atlas-text-secondary">
          Deterministic composite score (0-100, higher is healthier) across diversification, quality, growth, risk,
          valuation, sector balance, cash allocation, concentration, and macro exposure.
        </p>
      </FadeInView>

      {!latest ? (
        <p className="text-sm text-atlas-text-tertiary">No health assessment generated yet.</p>
      ) : (
        <>
          <FadeInView delay={0.05}>
            <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Overall health score</p>
                <AnimatedNumber value={latest.overallScore} format="integer" className="mt-1 block text-5xl font-semibold text-atlas-text" />
                <p className="mt-1 text-xs text-atlas-text-tertiary">/100</p>
                {latest.previousScore !== null && (
                  <p className="mt-2 text-sm text-atlas-text-secondary">
                    Previous: {latest.previousScore} (
                    <span className={latest.overallScore - latest.previousScore >= 0 ? 'text-risk-low' : 'text-risk-high'}>
                      {latest.overallScore - latest.previousScore >= 0 ? '+' : ''}
                      {latest.overallScore - latest.previousScore}
                    </span>
                    )
                  </p>
                )}
                <p className="mt-2 text-xs text-atlas-text-tertiary">Generated {latest.generatedAt.toLocaleString()}</p>
              </div>
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Trend</p>
                <TrendLineChart data={chartData} domain={[0, 100]} color="#34d399" />
              </div>
            </div>
          </FadeInView>

          <FadeInView delay={0.1}>
            <div className="grid gap-x-8 gap-y-6 border-t border-atlas-border-subtle pt-8 md:grid-cols-2">
              {Object.entries(COMPONENT_LABELS).map(([key, label]) => (
                <RiskGauge key={key} label={label} score={(latest as unknown as Record<string, number>)[key]} invert />
              ))}
            </div>
          </FadeInView>

          <FadeInView delay={0.15}>
            <div className="grid gap-8 border-t border-atlas-border-subtle pt-8 md:grid-cols-2">
              <div>
                <h2 className="mb-2 text-sm font-medium text-atlas-emerald">Top improvements</h2>
                <ul className="space-y-1.5 text-sm text-atlas-text-secondary">
                  {(latest.topImprovements as string[]).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="mb-2 text-sm font-medium text-risk-high">Top concerns</h2>
                <ul className="space-y-1.5 text-sm text-atlas-text-secondary">
                  {(latest.topConcerns as string[]).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          </FadeInView>
        </>
      )}
    </div>
  );
}
