import type { CompanyFundamentals, HistoricalPricePoint } from '@/lib/integrations';
import { annualizedVolatility, computeBeta } from './risk';

export type ComparisonEdgeValue = 'opportunity' | 'holding' | 'neutral';

export interface ComparisonMetric {
  metric: string;
  opportunityValue: string;
  holdingValue: string;
  edge: ComparisonEdgeValue;
  dataAvailable: boolean;
}

export interface ComparisonEntity {
  symbol: string;
  fundamentals: CompanyFundamentals | null;
  history: HistoricalPricePoint[];
}

export interface OpportunityComparisonResult {
  metrics: ComparisonMetric[];
  overallEdge: ComparisonEdgeValue;
  narrative: string;
}

/**
 * Deterministic, evidence-based comparison. Every metric here is computed
 * from real fetched data (fundamentals, price history) — the categories the
 * spec asks for that this app has no data source for (capital efficiency,
 * management quality, forward growth estimates) are marked
 * dataAvailable=false rather than guessed, and excluded from the edge tally.
 * The narrative is template-generated from these same numbers, not
 * separately AI-authored — so it can never say anything the metrics don't
 * support.
 */
export function compareOpportunityToHolding(
  opportunity: ComparisonEntity,
  holding: ComparisonEntity,
  sp500History: HistoricalPricePoint[]
): OpportunityComparisonResult {
  const metrics: ComparisonMetric[] = [];

  // --- Valuation (P/E) ---
  const oppPe = opportunity.fundamentals?.peRatio ?? null;
  const holdPe = holding.fundamentals?.peRatio ?? null;
  if (oppPe !== null && holdPe !== null) {
    metrics.push({
      metric: 'Valuation (P/E)',
      opportunityValue: `${oppPe.toFixed(1)}x`,
      holdingValue: `${holdPe.toFixed(1)}x`,
      edge: oppPe < holdPe ? 'opportunity' : oppPe > holdPe ? 'holding' : 'neutral',
      dataAvailable: true,
    });
  } else {
    metrics.push({ metric: 'Valuation (P/E)', opportunityValue: 'n/a', holdingValue: 'n/a', edge: 'neutral', dataAvailable: false });
  }

  // --- Execution/volatility risk ---
  const oppVol = annualizedVolatility(opportunity.history);
  const holdVol = annualizedVolatility(holding.history);
  if (oppVol !== null && holdVol !== null) {
    metrics.push({
      metric: 'Realized volatility (lower favors stability)',
      opportunityValue: `${(oppVol * 100).toFixed(1)}%`,
      holdingValue: `${(holdVol * 100).toFixed(1)}%`,
      edge: oppVol < holdVol ? 'opportunity' : oppVol > holdVol ? 'holding' : 'neutral',
      dataAvailable: true,
    });
  } else {
    metrics.push({ metric: 'Realized volatility', opportunityValue: 'n/a', holdingValue: 'n/a', edge: 'neutral', dataAvailable: false });
  }

  // --- Macro sensitivity (beta vs SPY) ---
  const oppBeta = computeBeta(opportunity.history, sp500History);
  const holdBeta = computeBeta(holding.history, sp500History);
  if (oppBeta !== null && holdBeta !== null) {
    metrics.push({
      metric: 'Beta vs. SPY (lower = less macro-sensitive)',
      opportunityValue: oppBeta.toFixed(2),
      holdingValue: holdBeta.toFixed(2),
      edge: oppBeta < holdBeta ? 'opportunity' : oppBeta > holdBeta ? 'holding' : 'neutral',
      dataAvailable: true,
    });
  } else {
    metrics.push({ metric: 'Beta vs. SPY', opportunityValue: 'n/a', holdingValue: 'n/a', edge: 'neutral', dataAvailable: false });
  }

  // --- Dividend yield (capital return signal) ---
  const oppDiv = opportunity.fundamentals?.dividendYield ?? null;
  const holdDiv = holding.fundamentals?.dividendYield ?? null;
  if (oppDiv !== null && holdDiv !== null) {
    metrics.push({
      metric: 'Dividend yield',
      opportunityValue: `${(oppDiv * 100).toFixed(2)}%`,
      holdingValue: `${(holdDiv * 100).toFixed(2)}%`,
      edge: oppDiv > holdDiv ? 'opportunity' : oppDiv < holdDiv ? 'holding' : 'neutral',
      dataAvailable: true,
    });
  } else {
    metrics.push({ metric: 'Dividend yield', opportunityValue: 'n/a', holdingValue: 'n/a', edge: 'neutral', dataAvailable: false });
  }

  const unavailableNote =
    'Growth rate, competitive position, AI exposure, financial quality, capital efficiency, management quality, and forward catalysts have no deterministic data source connected in this app and are not scored — avoid treating this comparison as complete on those dimensions.';

  const scored = metrics.filter((m) => m.dataAvailable);
  const opportunityWins = scored.filter((m) => m.edge === 'opportunity').length;
  const holdingWins = scored.filter((m) => m.edge === 'holding').length;
  const overallEdge: ComparisonEdgeValue =
    scored.length === 0 ? 'neutral' : opportunityWins > holdingWins ? 'opportunity' : holdingWins > opportunityWins ? 'holding' : 'neutral';

  const narrativeLines: string[] = [];
  narrativeLines.push(`Comparing ${opportunity.symbol} (opportunity) against ${holding.symbol} (current holding) on ${scored.length} deterministic metric(s):`);
  for (const m of scored) {
    narrativeLines.push(`- ${m.metric}: ${opportunity.symbol} ${m.opportunityValue} vs. ${holding.symbol} ${m.holdingValue} — favors ${m.edge === 'neutral' ? 'neither' : m.edge === 'opportunity' ? opportunity.symbol : holding.symbol}.`);
  }
  narrativeLines.push(
    scored.length > 0
      ? `On these metrics alone, the edge ${overallEdge === 'neutral' ? 'is even' : `favors ${overallEdge === 'opportunity' ? opportunity.symbol : holding.symbol}`}.`
      : 'No deterministic metrics could be computed for either side — insufficient data for a real comparison.'
  );
  narrativeLines.push(unavailableNote);

  return { metrics, overallEdge, narrative: narrativeLines.join('\n') };
}
