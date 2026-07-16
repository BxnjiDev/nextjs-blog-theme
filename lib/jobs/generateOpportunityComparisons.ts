import { prisma } from '@/lib/prisma';
import { marketDataProvider } from '@/lib/integrations';
import { compareOpportunityToHolding } from '@/lib/domain/opportunityComparison';

export interface OpportunityComparisonJobResult {
  processed: number;
  skipped: number;
  errors: { symbol: string; error: string }[];
}

/** Idempotency window — re-comparing within this many hours is a no-op. */
const REFRESH_HOURS = 24;

/**
 * For every active (non-dismissed) Opportunity, picks the most relevant
 * current holding to compare against — same sector if one can be
 * determined, otherwise the holding with the weakest latest conviction
 * score — and runs a deterministic, evidence-based comparison. Never
 * recommends "because it's trending": there is no trend/momentum input to
 * this comparison at all, only valuation/volatility/beta/dividend data.
 */
export async function runOpportunityComparisonJob(): Promise<OpportunityComparisonJobResult> {
  const result: OpportunityComparisonJobResult = { processed: 0, skipped: 0, errors: [] };

  const [opportunities, holdings, sp500History] = await Promise.all([
    prisma.opportunity.findMany({ where: { dismissedAt: null } }),
    prisma.holding.findMany(),
    marketDataProvider.getSp500History(60),
  ]);
  if (opportunities.length === 0 || holdings.length === 0) return result;

  const holdingConvictions = await Promise.all(
    holdings.map(async (h) => ({
      holding: h,
      conviction: await prisma.convictionAssessment.findFirst({ where: { symbol: h.symbol }, orderBy: { generatedAt: 'desc' } }),
    }))
  );

  for (const opportunity of opportunities) {
    const lastComparison = await prisma.opportunityComparison.findFirst({
      where: { opportunityId: opportunity.id },
      orderBy: { generatedAt: 'desc' },
    });
    if (lastComparison) {
      const ageHours = (Date.now() - lastComparison.generatedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours < REFRESH_HOURS) {
        result.skipped++;
        continue;
      }
    }

    try {
      const oppFundamentals = await marketDataProvider.getFundamentals(opportunity.symbol);
      const oppSector = oppFundamentals?.sector ?? null;

      const sameSector = oppSector
        ? holdingConvictions.find((h) => h.holding.sector && h.holding.sector.toLowerCase() === oppSector.toLowerCase())
        : undefined;
      const weakest = [...holdingConvictions].sort((a, b) => (a.conviction?.overallScore ?? 50) - (b.conviction?.overallScore ?? 50))[0];
      const comparisonTarget = sameSector ?? weakest;
      if (!comparisonTarget) continue;

      const [oppHistory, holdHistory, holdFundamentals] = await Promise.all([
        marketDataProvider.getHistoricalDaily(opportunity.symbol, 60),
        marketDataProvider.getHistoricalDaily(comparisonTarget.holding.symbol, 60),
        marketDataProvider.getFundamentals(comparisonTarget.holding.symbol),
      ]);

      const comparison = compareOpportunityToHolding(
        { symbol: opportunity.symbol, fundamentals: oppFundamentals, history: oppHistory },
        { symbol: comparisonTarget.holding.symbol, fundamentals: holdFundamentals, history: holdHistory },
        sp500History
      );

      await prisma.opportunityComparison.create({
        data: {
          opportunityId: opportunity.id,
          comparedToSymbol: comparisonTarget.holding.symbol,
          metrics: JSON.parse(JSON.stringify(comparison.metrics)),
          narrative: comparison.narrative,
          overallEdge:
            comparison.overallEdge === 'opportunity' ? 'FAVORS_OPPORTUNITY' : comparison.overallEdge === 'holding' ? 'FAVORS_HOLDING' : 'NEUTRAL',
        },
      });
      result.processed++;
    } catch (err) {
      result.errors.push({ symbol: opportunity.symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
