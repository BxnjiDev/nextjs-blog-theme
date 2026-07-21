import type { CompanyFundamentals, HistoricalPricePoint, DataQuality } from '@/lib/integrations';
import type { HoldingView } from './portfolio';

/** Linearly maps a value to a 0-100 risk score: at or below `low` → 0, at
 * or above `high` → 100, clamped. The single scoring primitive every
 * component below is built from, so every threshold is visible in one place. */
export function linearRiskScore(value: number, low: number, high: number): number {
  if (high === low) return 50;
  const pct = ((value - low) / (high - low)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

const NEUTRAL_UNKNOWN_SCORE = 50;

export interface RiskHoldingInput {
  view: HoldingView;
  history: HistoricalPricePoint[]; // ~60 sessions, newest-first
  fundamentals: CompanyFundamentals | null;
  daysSinceLastFiling: number | null;
  /** From the real earnings calendar (lib/jobs/ingestEarnings.ts), when
   * available — takes priority over the days-since-last-filing proxy. */
  daysToNextEarnings: number | null;
  negativeNewsCritical: number;
  negativeNewsHigh: number;
}

export interface PortfolioSnapshotForRisk {
  date: Date;
  portfolioValue: number;
}

export interface RiskCalculationInput {
  holdings: RiskHoldingInput[];
  totalValue: number;
  cashBalance: number;
  sp500History: HistoricalPricePoint[]; // ~60 sessions, newest-first
  portfolioHistory: PortfolioSnapshotForRisk[]; // ascending by date
  quoteQualities: DataQuality[];
}

export interface ComponentResult {
  score: number;
  explanation: string;
}

export interface RiskResult {
  concentrationRisk: ComponentResult;
  sectorRisk: ComponentResult;
  volatilityRisk: ComponentResult;
  betaRisk: ComponentResult;
  drawdownRisk: ComponentResult;
  valuationRisk: ComponentResult;
  earningsRisk: ComponentResult;
  regulatoryRisk: ComponentResult;
  liquidityRisk: ComponentResult;
  macroRisk: ComponentResult;
  newsRisk: ComponentResult;
  stalenessRisk: ComponentResult;
  overallScore: number;
  inputs: Record<string, unknown>;
}

/** The twelve component keys' display labels — one copy, imported by
 * /risk, the Simulator, and lib/intelligence/engine.ts, which previously
 * each declared their own identical (or near-identical) copy of this map. */
export const RISK_COMPONENT_LABELS: Record<string, string> = {
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

const CYCLICAL_SECTOR_KEYWORDS = ['semiconductor', 'energy', 'defense', 'aerospace', 'materials', 'industrial'];
export const REGULATED_SECTOR_KEYWORDS = ['defense', 'energy', 'semiconductor', 'cyber', 'aerospace', 'pharma', 'bank', 'financial'];

function dailyReturns(history: HistoricalPricePoint[]): number[] {
  // history is newest-first; walk oldest->newest for return sequence.
  const asc = [...history].sort((a, b) => a.date.getTime() - b.date.getTime());
  const returns: number[] = [];
  for (let i = 1; i < asc.length; i++) {
    const prev = asc[i - 1].close;
    const curr = asc[i].close;
    if (prev > 0) returns.push((curr - prev) / prev);
  }
  return returns;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function annualizedVolatility(history: HistoricalPricePoint[]): number | null {
  const returns = dailyReturns(history);
  if (returns.length < 10) return null;
  return stdev(returns) * Math.sqrt(252);
}

/** Beta of `history` vs `benchmark`, aligned by calendar date. */
export function computeBeta(history: HistoricalPricePoint[], benchmark: HistoricalPricePoint[]): number | null {
  const byDate = new Map(benchmark.map((p) => [p.date.toISOString().slice(0, 10), p]));
  const asc = [...history].sort((a, b) => a.date.getTime() - b.date.getTime());
  const pairs: Array<{ h: number; b: number }> = [];
  for (let i = 1; i < asc.length; i++) {
    const prevKey = asc[i - 1].date.toISOString().slice(0, 10);
    const currKey = asc[i].date.toISOString().slice(0, 10);
    const prevB = byDate.get(prevKey);
    const currB = byDate.get(currKey);
    if (!prevB || !currB || asc[i - 1].close <= 0 || prevB.close <= 0) continue;
    pairs.push({
      h: (asc[i].close - asc[i - 1].close) / asc[i - 1].close,
      b: (currB.close - prevB.close) / prevB.close,
    });
  }
  if (pairs.length < 10) return null;
  const meanH = pairs.reduce((s, p) => s + p.h, 0) / pairs.length;
  const meanB = pairs.reduce((s, p) => s + p.b, 0) / pairs.length;
  let cov = 0;
  let varB = 0;
  for (const p of pairs) {
    cov += (p.h - meanH) * (p.b - meanB);
    varB += (p.b - meanB) ** 2;
  }
  if (varB === 0) return null;
  return cov / varB;
}

/** Pearson correlation between two return series aligned by date. */
function pairwiseCorrelation(a: HistoricalPricePoint[], b: HistoricalPricePoint[]): number | null {
  const byDate = new Map(b.map((p) => [p.date.toISOString().slice(0, 10), p]));
  const ascA = [...a].sort((x, y) => x.date.getTime() - y.date.getTime());
  const pairs: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < ascA.length; i++) {
    const prevKey = ascA[i - 1].date.toISOString().slice(0, 10);
    const currKey = ascA[i].date.toISOString().slice(0, 10);
    const prevB = byDate.get(prevKey);
    const currB = byDate.get(currKey);
    if (!prevB || !currB || ascA[i - 1].close <= 0 || prevB.close <= 0) continue;
    pairs.push({
      x: (ascA[i].close - ascA[i - 1].close) / ascA[i - 1].close,
      y: (currB.close - prevB.close) / prevB.close,
    });
  }
  if (pairs.length < 10) return null;
  const meanX = pairs.reduce((s, p) => s + p.x, 0) / pairs.length;
  const meanY = pairs.reduce((s, p) => s + p.y, 0) / pairs.length;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (const p of pairs) {
    cov += (p.x - meanX) * (p.y - meanY);
    varX += (p.x - meanX) ** 2;
    varY += (p.y - meanY) ** 2;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

function maxDrawdownPct(values: number[]): number | null {
  if (values.length < 2) return null;
  let peak = values[0];
  let maxDd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

export function sectorOf(sector: string | null): string {
  return sector && sector.trim() ? sector : 'Unclassified';
}

export function matchesAnyKeyword(sector: string, keywords: string[]): boolean {
  const s = sector.toLowerCase();
  return keywords.some((k) => s.includes(k));
}

export function computeRisk(input: RiskCalculationInput): RiskResult {
  const inputs: Record<string, unknown> = {};

  // --- Concentration: top-1 / top-3 / top-5 exposure + correlation modifier ---
  const weights = input.holdings
    .map((h) => ({ symbol: h.view.symbol, weight: input.totalValue > 0 ? h.view.marketValue / input.totalValue : 0 }))
    .sort((a, b) => b.weight - a.weight);
  const top1Pct = (weights[0]?.weight ?? 0) * 100;
  const top3Pct = weights.slice(0, 3).reduce((s, w) => s + w.weight, 0) * 100;
  const top5Pct = weights.slice(0, 5).reduce((s, w) => s + w.weight, 0) * 100;

  const correlations: number[] = [];
  for (let i = 0; i < input.holdings.length; i++) {
    for (let j = i + 1; j < input.holdings.length; j++) {
      const c = pairwiseCorrelation(input.holdings[i].history, input.holdings[j].history);
      if (c !== null) correlations.push(c);
    }
  }
  const avgCorrelation = correlations.length > 0 ? correlations.reduce((a, b) => a + b, 0) / correlations.length : null;

  const top1Risk = linearRiskScore(top1Pct, 5, 40);
  const top3Risk = linearRiskScore(top3Pct, 20, 70);
  const top5Risk = linearRiskScore(top5Pct, 35, 90);
  const correlationModifier = avgCorrelation !== null && avgCorrelation > 0.6 ? Math.round((avgCorrelation - 0.6) * 50) : 0;
  const concentrationScore = Math.max(
    0,
    Math.min(100, Math.round(0.5 * top1Risk + 0.3 * top3Risk + 0.2 * top5Risk) + correlationModifier)
  );
  inputs.concentration = { top1Pct, top3Pct, top5Pct, avgCorrelation, correlationModifier };
  const concentrationRisk: ComponentResult = {
    score: concentrationScore,
    explanation:
      `Largest position is ${top1Pct.toFixed(1)}% of the portfolio, top 3 = ${top3Pct.toFixed(1)}%, top 5 = ${top5Pct.toFixed(1)}%.` +
      (avgCorrelation !== null
        ? ` Average pairwise correlation between holdings is ${avgCorrelation.toFixed(2)}${correlationModifier > 0 ? ' (holdings move together, amplifying concentration).' : '.'}`
        : ' Not enough overlapping price history to assess correlation between holdings.'),
  };

  // --- Sector concentration (HHI) ---
  const sectorWeights = new Map<string, number>();
  for (const h of input.holdings) {
    const s = sectorOf(h.view.sector);
    const w = input.totalValue > 0 ? h.view.marketValue / input.totalValue : 0;
    sectorWeights.set(s, (sectorWeights.get(s) ?? 0) + w);
  }
  const hhi = Array.from(sectorWeights.values()).reduce((sum, w) => sum + w * w, 0);
  const sectorScore = Math.round(hhi * 100);
  inputs.sector = { weights: Object.fromEntries(sectorWeights), hhi };
  const topSector = Array.from(sectorWeights.entries()).sort((a, b) => b[1] - a[1])[0];
  const sectorRisk: ComponentResult = {
    score: sectorScore,
    explanation: topSector
      ? `${topSector[0]} makes up ${(topSector[1] * 100).toFixed(1)}% of the portfolio (Herfindahl index ${hhi.toFixed(2)}).`
      : 'No sector data available.',
  };

  // --- Volatility (position-weighted annualized) ---
  let volSum = 0;
  let volWeightTotal = 0;
  const perHoldingVol: Record<string, number | null> = {};
  for (const h of input.holdings) {
    const vol = annualizedVolatility(h.history);
    perHoldingVol[h.view.symbol] = vol;
    const weight = input.totalValue > 0 ? h.view.marketValue / input.totalValue : 0;
    if (vol !== null) {
      volSum += vol * weight;
      volWeightTotal += weight;
    }
  }
  const portfolioVol = volWeightTotal > 0 ? volSum / volWeightTotal : null;
  inputs.volatility = { perHoldingAnnualizedVol: perHoldingVol, portfolioWeightedAnnualizedVol: portfolioVol };
  const volatilityRisk: ComponentResult = portfolioVol !== null
    ? {
        score: linearRiskScore(portfolioVol * 100, 12, 70),
        explanation: `Position-weighted realized annualized volatility is ${(portfolioVol * 100).toFixed(1)}%.`,
      }
    : { score: NEUTRAL_UNKNOWN_SCORE, explanation: 'Not enough price history to compute realized volatility.' };

  // --- Beta vs SPY (position-weighted) ---
  let betaSum = 0;
  let betaWeightTotal = 0;
  const perHoldingBeta: Record<string, number | null> = {};
  for (const h of input.holdings) {
    const beta = computeBeta(h.history, input.sp500History);
    perHoldingBeta[h.view.symbol] = beta;
    const weight = input.totalValue > 0 ? h.view.marketValue / input.totalValue : 0;
    if (beta !== null) {
      betaSum += beta * weight;
      betaWeightTotal += weight;
    }
  }
  const portfolioBeta = betaWeightTotal > 0 ? betaSum / betaWeightTotal : null;
  inputs.beta = { perHoldingBeta, portfolioWeightedBeta: portfolioBeta };
  const betaRisk: ComponentResult = portfolioBeta !== null
    ? {
        score: linearRiskScore(portfolioBeta, 0.5, 2.0),
        explanation: `Position-weighted beta vs. SPY is ${portfolioBeta.toFixed(2)}.`,
      }
    : { score: NEUTRAL_UNKNOWN_SCORE, explanation: 'Not enough overlapping history vs. SPY to compute beta.' };

  // --- Drawdown (real PerformanceSnapshot history; holding-level fallback) ---
  let drawdown: number | null = null;
  let drawdownSource = 'none';
  if (input.portfolioHistory.length >= 5) {
    drawdown = maxDrawdownPct(input.portfolioHistory.map((p) => p.portfolioValue));
    drawdownSource = 'PerformanceSnapshot history';
  } else {
    const holdingDrawdowns: number[] = [];
    for (const h of input.holdings) {
      const asc = [...h.history].sort((a, b) => a.date.getTime() - b.date.getTime());
      const dd = maxDrawdownPct(asc.map((p) => p.close));
      const weight = input.totalValue > 0 ? h.view.marketValue / input.totalValue : 0;
      if (dd !== null) holdingDrawdowns.push(dd * weight);
    }
    if (holdingDrawdowns.length > 0) {
      drawdown = holdingDrawdowns.reduce((a, b) => a + b, 0);
      drawdownSource = 'position-weighted holding price history (portfolio snapshot history too short)';
    }
  }
  inputs.drawdown = { maxDrawdownPct: drawdown, source: drawdownSource };
  const drawdownRisk: ComponentResult = drawdown !== null
    ? { score: linearRiskScore(drawdown * 100, 5, 40), explanation: `Max drawdown of ${(drawdown * 100).toFixed(1)}% (${drawdownSource}).` }
    : { score: NEUTRAL_UNKNOWN_SCORE, explanation: 'Not enough history yet to compute drawdown.' };

  // --- Valuation (position-weighted P/E vs. a fixed reference band) ---
  let valSum = 0;
  let valWeightTotal = 0;
  const perHoldingPe: Record<string, number | null> = {};
  for (const h of input.holdings) {
    const pe = h.fundamentals?.peRatio ?? null;
    perHoldingPe[h.view.symbol] = pe;
    const weight = input.totalValue > 0 ? h.view.marketValue / input.totalValue : 0;
    if (pe !== null && pe > 0) {
      valSum += linearRiskScore(pe, 15, 60) * weight;
      valWeightTotal += weight;
    }
  }
  const valuationRisk: ComponentResult = valWeightTotal > 0
    ? {
        score: Math.round(valSum / valWeightTotal),
        explanation: `Position-weighted P/E vs. a 15-60x reference band (simplified — not sector/growth-adjusted).`,
      }
    : { score: NEUTRAL_UNKNOWN_SCORE, explanation: 'No P/E data available for any holding.' };
  inputs.valuation = { perHoldingPe };

  // --- Earnings-event risk: real forward calendar when available (closer
  // report date = higher near-term uncertainty), falling back to the
  // days-since-last-filing proxy only for holdings with no calendar entry. ---
  let earnSum = 0;
  let earnWeightTotal = 0;
  let usedRealCalendarCount = 0;
  const perHoldingDays: Record<string, number | null> = {};
  const perHoldingDaysToEarnings: Record<string, number | null> = {};
  for (const h of input.holdings) {
    perHoldingDays[h.view.symbol] = h.daysSinceLastFiling;
    perHoldingDaysToEarnings[h.view.symbol] = h.daysToNextEarnings;
    const weight = input.totalValue > 0 ? h.view.marketValue / input.totalValue : 0;
    if (h.daysToNextEarnings !== null) {
      // Closer to the report date = more near-term uncertainty: score peaks
      // inside a 2-week window and falls off further out.
      earnSum += linearRiskScore(14 - Math.min(14, h.daysToNextEarnings), 0, 14) * weight;
      earnWeightTotal += weight;
      usedRealCalendarCount++;
    } else if (h.daysSinceLastFiling !== null) {
      earnSum += linearRiskScore(h.daysSinceLastFiling, 60, 95) * weight;
      earnWeightTotal += weight;
    }
  }
  const earningsRisk: ComponentResult = earnWeightTotal > 0
    ? {
        score: Math.round(earnSum / earnWeightTotal),
        explanation:
          usedRealCalendarCount > 0
            ? `${usedRealCalendarCount} of ${input.holdings.length} holding(s) scored from the real forward earnings calendar (proximity to next report date); remainder from the days-since-last-filing proxy.`
            : 'Proxy based on days since each holding’s last SEC filing vs. a ~90-day quarterly cadence (no forward earnings calendar entry for any holding).',
      }
    : { score: NEUTRAL_UNKNOWN_SCORE, explanation: 'No filing-date or earnings-calendar data available to gauge proximity to the next earnings report.' };
  inputs.earnings = { perHoldingDaysSinceLastFiling: perHoldingDays, perHoldingDaysToNextEarnings: perHoldingDaysToEarnings };

  // --- Regulatory (sector-keyword proxy) ---
  const regulatedWeight = input.holdings.reduce((sum, h) => {
    const weight = input.totalValue > 0 ? h.view.marketValue / input.totalValue : 0;
    return matchesAnyKeyword(sectorOf(h.view.sector), REGULATED_SECTOR_KEYWORDS) ? sum + weight : sum;
  }, 0);
  const regulatoryRisk: ComponentResult = {
    score: Math.round(30 + regulatedWeight * 60),
    explanation: `${(regulatedWeight * 100).toFixed(1)}% of the portfolio is in sectors with elevated regulatory/export exposure (defense, energy, semiconductors, cyber, aerospace, financials, pharma) — a coarse sector proxy, not case-by-case regulatory analysis.`,
  };
  inputs.regulatory = { regulatedSectorWeight: regulatedWeight };

  // --- Liquidity (position size vs. average daily dollar volume) ---
  let liqWorst = 0;
  const perHoldingLiquidity: Record<string, number | null> = {};
  for (const h of input.holdings) {
    const avgVolume = h.history.length > 0 ? h.history.reduce((s, p) => s + p.volume, 0) / h.history.length : 0;
    const price = h.view.currentPrice;
    const avgDollarVolume = avgVolume * price;
    const ratio = avgDollarVolume > 0 ? h.view.marketValue / avgDollarVolume : null;
    perHoldingLiquidity[h.view.symbol] = ratio;
    if (ratio !== null) liqWorst = Math.max(liqWorst, ratio);
  }
  const liquidityRisk: ComponentResult = liqWorst > 0
    ? {
        score: linearRiskScore(liqWorst, 0.02, 1.0),
        explanation: `Worst-case position is ${liqWorst.toFixed(3)}x the symbol's average daily dollar volume (higher = harder to exit without moving the price).`,
      }
    : { score: NEUTRAL_UNKNOWN_SCORE, explanation: 'No volume data available to assess liquidity.' };
  inputs.liquidity = { perHoldingPositionToAvgDailyDollarVolume: perHoldingLiquidity };

  // --- Macro (beta blended with cyclical-sector exposure) ---
  const cyclicalWeight = input.holdings.reduce((sum, h) => {
    const weight = input.totalValue > 0 ? h.view.marketValue / input.totalValue : 0;
    return matchesAnyKeyword(sectorOf(h.view.sector), CYCLICAL_SECTOR_KEYWORDS) ? sum + weight : sum;
  }, 0);
  const cyclicalScore = Math.round(cyclicalWeight * 100);
  const macroRisk: ComponentResult = {
    score: Math.round(0.6 * betaRisk.score + 0.4 * cyclicalScore),
    explanation: `Blends beta risk (${betaRisk.score}/100) with ${(cyclicalWeight * 100).toFixed(1)}% exposure to macro/cycle-sensitive sectors.`,
  };
  inputs.macro = { cyclicalSectorWeight: cyclicalWeight };

  // --- News / controversy ---
  const totalCritical = input.holdings.reduce((s, h) => s + h.negativeNewsCritical, 0);
  const totalHigh = input.holdings.reduce((s, h) => s + h.negativeNewsHigh, 0);
  const hasNewsData = input.quoteQualities.length > 0; // placeholder gate; refined below by caller
  const newsScore = Math.max(0, Math.min(100, 20 + totalCritical * 15 + totalHigh * 8));
  const newsRisk: ComponentResult = {
    score: newsScore,
    explanation:
      totalCritical + totalHigh > 0
        ? `${totalCritical} critical and ${totalHigh} high-materiality negative news item(s) in the recent window.`
        : hasNewsData
          ? 'No critical/high-materiality negative news found in the recent window.'
          : 'No news data source configured — baseline score only.',
  };
  inputs.news = { negativeCritical: totalCritical, negativeHigh: totalHigh };

  // --- Data staleness ---
  const mockCount = input.quoteQualities.filter((q) => q === 'mock').length;
  const stalenessScore = mockCount > 0
    ? Math.min(100, 40 + Math.round((mockCount / Math.max(1, input.quoteQualities.length)) * 40))
    : 10;
  const stalenessRisk: ComponentResult = {
    score: stalenessScore,
    explanation:
      mockCount > 0
        ? `${mockCount} of ${input.quoteQualities.length} holdings are priced with mock data (no real market-data key configured).`
        : 'All holdings are priced from a real market-data feed.',
  };
  inputs.staleness = { mockQuoteCount: mockCount, totalHoldings: input.quoteQualities.length };

  const components = [
    concentrationRisk,
    sectorRisk,
    volatilityRisk,
    betaRisk,
    drawdownRisk,
    valuationRisk,
    earningsRisk,
    regulatoryRisk,
    liquidityRisk,
    macroRisk,
    newsRisk,
    stalenessRisk,
  ];
  const overallScore = Math.round(components.reduce((s, c) => s + c.score, 0) / components.length);

  return {
    concentrationRisk,
    sectorRisk,
    volatilityRisk,
    betaRisk,
    drawdownRisk,
    valuationRisk,
    earningsRisk,
    regulatoryRisk,
    liquidityRisk,
    macroRisk,
    newsRisk,
    stalenessRisk,
    overallScore,
    inputs,
  };
}
