import { prisma } from '@/lib/prisma';
import Meter from '@/components/ui/Meter';
import EmptyState from '@/components/ui/EmptyState';
import SectionHeading from '@/components/ui/SectionHeading';
import AtlasCore from '@/components/atlas-identity/AtlasCore';
import AnimatedNumber from '@/components/motion/AnimatedNumber';
import TrendLineChart from '@/components/charts/TrendLineChart';
import RiskRadar from '@/components/charts/RiskRadar';
import FadeInView from '@/components/motion/FadeInView';
import { atlasStateForScore } from '@/lib/theme/tone';

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

// Short labels for the radar's twelve spokes — the full COMPONENT_LABELS
// names (used in the accessible Meter list below) are too long to sit
// around a circle without overlapping.
const RADAR_LABELS: Record<string, string> = {
  concentrationRisk: 'Concentration',
  sectorRisk: 'Sector',
  volatilityRisk: 'Volatility',
  betaRisk: 'Beta',
  drawdownRisk: 'Drawdown',
  valuationRisk: 'Valuation',
  earningsRisk: 'Earnings',
  regulatoryRisk: 'Regulatory',
  liquidityRisk: 'Liquidity',
  macroRisk: 'Macro',
  newsRisk: 'News',
  stalenessRisk: 'Staleness',
};

export default async function RiskPage() {
  const history = await prisma.riskAssessment.findMany({ orderBy: { generatedAt: 'asc' }, take: 90 });
  const risk = history[history.length - 1];
  const chartData = history.map((r) => ({ label: r.generatedAt.toLocaleDateString(), value: r.overallScore }));
  const explanation = (risk?.explanation ?? {}) as Record<string, string>;
  const delta = risk?.previousScore != null ? risk.overallScore - risk.previousScore : null;

  return (
    <div className="space-y-14">
      <FadeInView>
        <h1 className="sr-only">Portfolio risk</h1>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-atlas-text-tertiary">Risk</p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-atlas-text-secondary">
          Every factor is a deterministic calculation (<code className="rounded bg-atlas-surface-raised px-1">lib/domain/risk.ts</code>),
          scored 0-100, higher meaning riskier — not an AI-generated number. Treat it as one input into a decision,
          not a verdict.
        </p>
      </FadeInView>

      {!risk ? (
        <EmptyState>No risk assessment generated yet.</EmptyState>
      ) : (
        <>
          {/* Same orb + value hero language as Home/Portfolio — the orb's
              color reads risk directly (calm green through to attention
              amber/red) instead of a bare number sitting next to a label. */}
          <FadeInView delay={0.05}>
            <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
              <div className="flex items-center gap-6">
                <AtlasCore state={atlasStateForScore(risk.overallScore, true)} size="xl" className="shrink-0" />
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Overall risk score</p>
                  <div className="mt-1 flex items-baseline gap-1">
                    <AnimatedNumber value={risk.overallScore} format="integer" className="text-5xl font-semibold text-atlas-text" />
                    <span className="text-sm text-atlas-text-tertiary">/100</span>
                  </div>
                  {delta !== null && (
                    <p className="mt-2 text-sm text-atlas-text-secondary">
                      Previous: {risk.previousScore} (
                      <span className={delta <= 0 ? 'text-risk-low' : 'text-risk-high'}>
                        {delta >= 0 ? '+' : ''}
                        {delta}
                      </span>
                      )
                    </p>
                  )}
                  {risk.notes && <p className="mt-2 max-w-sm text-sm leading-relaxed text-atlas-text-secondary">{risk.notes}</p>}
                </div>
              </div>
              <div>
                <SectionHeading className="mb-2">Trend</SectionHeading>
                <TrendLineChart data={chartData} domain={[0, 100]} color="#f0a020" />
              </div>
            </div>
          </FadeInView>

          {/* The risk shape — twelve independent factors read as a
              silhouette instead of a scanned list, so which *kind* of risk
              dominates the portfolio right now is visible at a glance. */}
          <FadeInView delay={0.08}>
            <div className="border-t border-atlas-border-subtle pt-8">
              <SectionHeading className="mb-2">Risk shape</SectionHeading>
              <RiskRadar
                data={Object.entries(RADAR_LABELS).map(([key, label]) => ({
                  label,
                  score: (risk as unknown as Record<string, number>)[key],
                }))}
              />
            </div>
          </FadeInView>

          <FadeInView delay={0.1}>
            <div className="grid gap-x-8 gap-y-6 border-t border-atlas-border-subtle pt-8 md:grid-cols-2">
              {Object.entries(COMPONENT_LABELS).map(([key, label]) => (
                <div key={key}>
                  <Meter label={label} score={(risk as unknown as Record<string, number>)[key]} invert />
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
