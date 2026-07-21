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

const RADAR_LABELS: Record<string, string> = {
  diversificationScore: 'Diversification',
  qualityScore: 'Quality',
  growthScore: 'Growth',
  riskScore: 'Risk',
  valuationScore: 'Valuation',
  sectorBalanceScore: 'Sector bal.',
  cashAllocationScore: 'Cash',
  concentrationScore: 'Concentration',
  macroExposureScore: 'Macro',
};

export default async function HealthPage() {
  const history = await prisma.portfolioHealthAssessment.findMany({
    orderBy: { generatedAt: 'asc' },
    take: 90,
  });
  const latest = history[history.length - 1];
  const chartData = history.map((h) => ({ label: h.generatedAt.toLocaleDateString(), value: h.overallScore }));
  const delta = latest?.previousScore != null ? latest.overallScore - latest.previousScore : null;

  return (
    <div className="space-y-14">
      <FadeInView>
        <h1 className="sr-only">Portfolio health</h1>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-atlas-text-tertiary">Health</p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-atlas-text-secondary">
          Deterministic composite score (0-100, higher is healthier) across diversification, quality, growth, risk,
          valuation, sector balance, cash allocation, concentration, and macro exposure.
        </p>
      </FadeInView>

      {!latest ? (
        <EmptyState>No health assessment generated yet.</EmptyState>
      ) : (
        <>
          {/* Same orb + value hero language as Home/Portfolio/Risk — the
              orb's color reads health directly instead of a bare number. */}
          <FadeInView delay={0.05}>
            <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
              <div className="flex items-center gap-6">
                <AtlasCore state={atlasStateForScore(latest.overallScore)} size="xl" className="shrink-0" />
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Overall health score</p>
                  <div className="mt-1 flex items-baseline gap-1">
                    <AnimatedNumber value={latest.overallScore} format="integer" className="text-5xl font-semibold text-atlas-text" />
                    <span className="text-sm text-atlas-text-tertiary">/100</span>
                  </div>
                  {delta !== null && (
                    <p className="mt-2 text-sm text-atlas-text-secondary">
                      Previous: {latest.previousScore} (
                      <span className={delta >= 0 ? 'text-risk-low' : 'text-risk-high'}>
                        {delta >= 0 ? '+' : ''}
                        {delta}
                      </span>
                      )
                    </p>
                  )}
                  <p className="mt-2 text-xs text-atlas-text-tertiary">Generated {latest.generatedAt.toLocaleString()}</p>
                </div>
              </div>
              <div>
                <SectionHeading className="mb-2">Trend</SectionHeading>
                <TrendLineChart data={chartData} domain={[0, 100]} color="#34d399" />
              </div>
            </div>
          </FadeInView>

          <FadeInView delay={0.08}>
            <div className="border-t border-atlas-border-subtle pt-8">
              <SectionHeading className="mb-2">Health shape</SectionHeading>
              <RiskRadar
                color="#34d399"
                data={Object.entries(RADAR_LABELS).map(([key, label]) => ({
                  label,
                  score: (latest as unknown as Record<string, number>)[key],
                }))}
              />
            </div>
          </FadeInView>

          <FadeInView delay={0.1}>
            <div className="grid gap-x-8 gap-y-6 border-t border-atlas-border-subtle pt-8 md:grid-cols-2">
              {Object.entries(COMPONENT_LABELS).map(([key, label]) => (
                <Meter key={key} label={label} score={(latest as unknown as Record<string, number>)[key]} />
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
