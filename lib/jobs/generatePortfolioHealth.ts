import { prisma } from '@/lib/prisma';
import { marketDataProvider } from '@/lib/integrations';
import { getPortfolioOverview } from '@/lib/domain/portfolio';
import { computePortfolioHealth, type HealthHoldingInput } from '@/lib/domain/portfolioHealth';

export interface HealthJobResult {
  skipped: boolean;
  overallScore?: number;
  previousScore?: number | null;
}

const COMPONENT_LABELS: Record<string, string> = {
  diversificationScore: 'Diversification',
  qualityScore: 'Quality',
  growthScore: 'Growth',
  riskScore: 'Risk',
  valuationScore: 'Valuation',
  sectorBalanceScore: 'Sector balance',
  cashAllocationScore: 'Cash allocation',
  concentrationScore: 'Concentration',
  macroExposureScore: 'Macro exposure',
};

/**
 * Recomputes the portfolio health score from current holdings, the latest
 * risk assessment, and the latest per-holding conviction scores. Always
 * appends a new row (a time series for trend), driven by its cron cadence
 * rather than an internal freshness window.
 */
export async function runPortfolioHealthJob(): Promise<HealthJobResult> {
  const overview = await getPortfolioOverview();
  if (!overview) return { skipped: true };

  const [risk, previous] = await Promise.all([
    prisma.riskAssessment.findFirst({ orderBy: { generatedAt: 'desc' } }),
    prisma.portfolioHealthAssessment.findFirst({ orderBy: { generatedAt: 'desc' } }),
  ]);

  const holdings: HealthHoldingInput[] = await Promise.all(
    overview.holdings.map(async (view) => {
      const [technicals, latestConviction] = await Promise.all([
        marketDataProvider.getTechnicals(view.symbol),
        prisma.convictionAssessment.findFirst({ where: { symbol: view.symbol }, orderBy: { generatedAt: 'desc' } }),
      ]);
      return {
        view,
        trend: technicals.trend,
        convictionScore: latestConviction?.overallScore ?? null,
        valuationScore: latestConviction?.valuation ?? null,
      };
    })
  );

  const result = computePortfolioHealth({
    holdings,
    totalValue: overview.totalValue,
    cashBalance: overview.cashBalance,
    risk: risk
      ? {
          overallScore: risk.overallScore,
          concentrationRisk: risk.concentrationRisk,
          sectorRisk: risk.sectorRisk,
          macroRisk: risk.macroRisk,
        }
      : null,
  });

  const componentScores: Record<string, number> = {
    diversificationScore: result.diversificationScore.score,
    qualityScore: result.qualityScore.score,
    growthScore: result.growthScore.score,
    riskScore: result.riskScore.score,
    valuationScore: result.valuationScore.score,
    sectorBalanceScore: result.sectorBalanceScore.score,
    cashAllocationScore: result.cashAllocationScore.score,
    concentrationScore: result.concentrationScore.score,
    macroExposureScore: result.macroExposureScore.score,
  };

  const improvements: string[] = [];
  const concerns: string[] = [];
  for (const [key, label] of Object.entries(COMPONENT_LABELS)) {
    const current = componentScores[key];
    const previousValue = previous ? (previous as unknown as Record<string, number>)[key] : undefined;
    if (previousValue !== undefined) {
      const delta = current - previousValue;
      if (delta >= 5) improvements.push(`${label} improved by ${delta} points (${previousValue} → ${current}).`);
      if (delta <= -5) concerns.push(`${label} declined by ${Math.abs(delta)} points (${previousValue} → ${current}).`);
    }
    if (current < 35) concerns.push(`${label} is low at ${current}/100.`);
  }
  if (improvements.length === 0) improvements.push('No component improved by 5+ points since the last assessment.');
  if (concerns.length === 0) concerns.push('No component is currently a standout concern.');

  await prisma.portfolioHealthAssessment.create({
    data: {
      diversificationScore: result.diversificationScore.score,
      qualityScore: result.qualityScore.score,
      growthScore: result.growthScore.score,
      riskScore: result.riskScore.score,
      valuationScore: result.valuationScore.score,
      sectorBalanceScore: result.sectorBalanceScore.score,
      cashAllocationScore: result.cashAllocationScore.score,
      concentrationScore: result.concentrationScore.score,
      macroExposureScore: result.macroExposureScore.score,
      overallScore: result.overallScore,
      previousScore: previous?.overallScore ?? null,
      componentBreakdown: JSON.parse(
        JSON.stringify({
          diversificationScore: result.diversificationScore,
          qualityScore: result.qualityScore,
          growthScore: result.growthScore,
          riskScore: result.riskScore,
          valuationScore: result.valuationScore,
          sectorBalanceScore: result.sectorBalanceScore,
          cashAllocationScore: result.cashAllocationScore,
          concentrationScore: result.concentrationScore,
          macroExposureScore: result.macroExposureScore,
          ...result.componentBreakdown,
        })
      ),
      topImprovements: improvements,
      topConcerns: concerns,
    },
  });

  return { skipped: false, overallScore: result.overallScore, previousScore: previous?.overallScore ?? null };
}
