import type { CompanyFundamentals, HistoricalPricePoint } from '@/lib/integrations';
import { linearRiskScore, annualizedVolatility, computeBeta, sectorOf, matchesAnyKeyword, REGULATED_SECTOR_KEYWORDS } from './risk';

/**
 * Deterministic conviction scoring. Every category is EITHER a real number
 * derived from fetched data, with the derivation shown in `methodology`,
 * OR null when no data source supports scoring it — never a guessed
 * number. Qualitative categories (moat, AI positioning, management
 * execution, industry leadership, product innovation) have no deterministic
 * formula given the data this app has access to (no peer universe, no
 * management-quality data source, no durable-moat metric) and are
 * intentionally left null here; Claude may still write a NARRATIVE about
 * them (stored on Thesis.competitiveAdvantages etc.), but the numeric score
 * is not fabricated to fill the gap. financialStrength, revenueGrowth,
 * profitability, and balanceSheet are scored from real fundamentals-history
 * data (Financial Modeling Prep, via lib/jobs/ingestFundamentals.ts) when
 * available, falling back to a cruder proxy from the market-data provider's
 * point-in-time fundamentals when the richer history hasn't been ingested
 * yet — never estimated beyond what one of those two sources supports.
 */

export interface ConvictionCategoryResult {
  score: number | null;
  dataAvailable: boolean;
  explanation: string;
}

/** Newest-first slice of FundamentalSnapshot rows for one symbol. */
export interface FundamentalHistoryPoint {
  fiscalYear: number;
  fiscalPeriod: string;
  reportDate: Date;
  revenue: number | null;
  revenueGrowth: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  freeCashFlow: number | null;
  eps: number | null;
  epsGrowth: number | null;
  roe: number | null;
  roic: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  cash: number | null;
  totalDebt: number | null;
}

export interface ConvictionInput {
  symbol: string;
  fundamentals: CompanyFundamentals | null;
  /** Newest-first quarterly fundamentals history, if ingested. Empty array
   * when the fundamentals-ingestion job hasn't run for this symbol yet. */
  fundamentalHistory: FundamentalHistoryPoint[];
  history: HistoricalPricePoint[]; // ~60 sessions
  sp500History: HistoricalPricePoint[];
  sector: string | null;
  /** From the real earnings calendar, when available — folded into
   * executionRisk as a near-term-uncertainty modifier (there's no separate
   * "earnings risk" category among the 13, so it's not double-counted
   * elsewhere in this engine). */
  daysToNextEarnings: number | null;
}

export interface ConvictionResult {
  financialStrength: ConvictionCategoryResult;
  revenueGrowth: ConvictionCategoryResult;
  profitability: ConvictionCategoryResult;
  balanceSheet: ConvictionCategoryResult;
  competitiveMoat: ConvictionCategoryResult;
  aiPositioning: ConvictionCategoryResult;
  managementExecution: ConvictionCategoryResult;
  industryLeadership: ConvictionCategoryResult;
  productInnovation: ConvictionCategoryResult;
  valuation: ConvictionCategoryResult;
  executionRisk: ConvictionCategoryResult;
  regulatoryRisk: ConvictionCategoryResult;
  macroSensitivity: ConvictionCategoryResult;
  overallScore: number;
  methodology: Record<string, unknown>;
}

/** Categories where a HIGHER raw score means MORE risk, so their
 * contribution to overall conviction is inverted (100 - score). */
const INVERTED_CATEGORIES = new Set(['executionRisk', 'regulatoryRisk', 'macroSensitivity']);

/** Weights sum to 100; only categories with real data contribute, and the
 * remaining weights are renormalized (see computeConviction). */
const WEIGHTS: Record<keyof Omit<ConvictionResult, 'overallScore' | 'methodology'>, number> = {
  financialStrength: 10,
  revenueGrowth: 10,
  profitability: 10,
  balanceSheet: 8,
  competitiveMoat: 10,
  aiPositioning: 6,
  managementExecution: 8,
  industryLeadership: 6,
  productInnovation: 6,
  valuation: 10,
  executionRisk: 8,
  regulatoryRisk: 4,
  macroSensitivity: 4,
};

const unavailable = (why: string): ConvictionCategoryResult => ({ score: null, dataAvailable: false, explanation: why });

export function computeConviction(input: ConvictionInput): ConvictionResult {
  const f = input.fundamentals;
  const latest = input.fundamentalHistory[0] ?? null;

  // --- Financial strength: real if fundamentals history is available
  // (ROE, debt/equity, cash vs. debt), else the old crude proxy. ---
  let financialStrength: ConvictionCategoryResult;
  if (latest && (latest.roe !== null || latest.debtToEquity !== null || latest.cash !== null)) {
    const roeScore = latest.roe !== null ? linearRiskScore(latest.roe * 100, -5, 30) : null;
    const leverageScore = latest.debtToEquity !== null ? 100 - linearRiskScore(latest.debtToEquity, 0, 2) : null;
    const cashVsDebtScore =
      latest.cash !== null && latest.totalDebt !== null && latest.totalDebt > 0
        ? linearRiskScore(latest.cash / latest.totalDebt, 0, 1.5)
        : null;
    const parts = [roeScore, leverageScore, cashVsDebtScore].filter((v): v is number => v !== null);
    const score = parts.length > 0 ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 50;
    financialStrength = {
      score,
      dataAvailable: true,
      explanation:
        `Blend of ROE (${latest.roe !== null ? `${(latest.roe * 100).toFixed(1)}%` : 'n/a'}), debt/equity ` +
        `(${latest.debtToEquity !== null ? latest.debtToEquity.toFixed(2) : 'n/a'}), and cash-vs-debt coverage ` +
        `(${latest.cash !== null && latest.totalDebt ? (latest.cash / latest.totalDebt).toFixed(2) : 'n/a'}x) from the latest reported quarter.`,
    };
  } else if (f) {
    let score = 50;
    if (f.eps !== null) score += f.eps > 0 ? 15 : -15;
    if (f.dividendYield !== null && f.dividendYield > 0) score += 10;
    if (f.marketCap !== null) {
      if (f.marketCap >= 200_000_000_000) score += 10;
      else if (f.marketCap < 10_000_000_000) score -= 10;
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
    financialStrength = {
      score,
      dataAvailable: true,
      explanation: 'Proxy from EPS sign, dividend payment, and market-cap size — fundamentals-history data (ROE/debt/cash) has not been ingested yet for this symbol.',
    };
  } else {
    financialStrength = unavailable('No fundamentals data available for this symbol.');
  }

  // --- Revenue growth: from ingested fundamentals history (YoY, most recent quarter). ---
  let revenueGrowth: ConvictionCategoryResult;
  if (latest?.revenueGrowth !== null && latest?.revenueGrowth !== undefined) {
    revenueGrowth = {
      score: linearRiskScore(latest.revenueGrowth * 100, -10, 25),
      dataAvailable: true,
      explanation: `Most recent quarter's YoY revenue growth was ${(latest.revenueGrowth * 100).toFixed(1)}% (fiscal ${latest.fiscalYear} ${latest.fiscalPeriod}).`,
    };
  } else {
    revenueGrowth = unavailable(
      input.fundamentalHistory.length > 0
        ? 'Fundamentals history exists but revenue growth could not be computed (needs a matching quarter 4 periods back).'
        : 'No fundamentals-history data ingested yet for this symbol; cannot compute growth deterministically.'
    );
  }

  // --- Profitability: real margins if available, else EPS-yield proxy. ---
  let profitability: ConvictionCategoryResult;
  const price = input.history[0]?.close ?? null;
  if (latest?.netMargin !== null && latest?.netMargin !== undefined) {
    profitability = {
      score: linearRiskScore(latest.netMargin * 100, -5, 25),
      dataAvailable: true,
      explanation: `Net margin of ${(latest.netMargin * 100).toFixed(1)}% (fiscal ${latest.fiscalYear} ${latest.fiscalPeriod}), gross margin ${latest.grossMargin !== null ? `${(latest.grossMargin * 100).toFixed(1)}%` : 'n/a'}.`,
    };
  } else if (f?.eps !== null && f?.eps !== undefined && price && price > 0) {
    const epsYield = (f.eps / price) * 100;
    const score = linearRiskScore(epsYield, -5, 8); // -5%: unprofitable/expensive, 8%+: strongly profitable per price paid
    profitability = {
      score,
      dataAvailable: true,
      explanation: `EPS yield (trailing EPS / current price) of ${epsYield.toFixed(2)}% — a crude profitability-per-dollar-paid proxy; real margin data not yet ingested for this symbol.`,
    };
  } else {
    profitability = unavailable('No margin data or EPS/price data available to score profitability.');
  }

  // --- Balance sheet: debt/equity + current ratio from fundamentals history. ---
  let balanceSheet: ConvictionCategoryResult;
  if (latest && (latest.debtToEquity !== null || latest.currentRatio !== null)) {
    const deScore = latest.debtToEquity !== null ? 100 - linearRiskScore(latest.debtToEquity, 0, 2) : null;
    const crScore = latest.currentRatio !== null ? linearRiskScore(latest.currentRatio, 0.5, 2.5) : null;
    const parts = [deScore, crScore].filter((v): v is number => v !== null);
    const score = parts.length > 0 ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 50;
    balanceSheet = {
      score,
      dataAvailable: true,
      explanation: `Debt/equity ${latest.debtToEquity !== null ? latest.debtToEquity.toFixed(2) : 'n/a'}, current ratio ${latest.currentRatio !== null ? latest.currentRatio.toFixed(2) : 'n/a'} (fiscal ${latest.fiscalYear} ${latest.fiscalPeriod}).`,
    };
  } else {
    balanceSheet = unavailable('No fundamentals-history data (debt/equity, current ratio) ingested yet for this symbol.');
  }

  // --- Qualitative categories: no deterministic formula available. ---
  const competitiveMoat = unavailable('Competitive moat has no deterministic formula from available data — narrative only, from AI reasoning.');
  const aiPositioning = unavailable('AI positioning has no deterministic formula from available data — narrative only, from AI reasoning.');
  const managementExecution = unavailable('Management execution has no deterministic formula from available data — narrative only, from AI reasoning.');
  const industryLeadership = unavailable('Industry leadership has no deterministic formula from available data — narrative only, from AI reasoning.');
  const productInnovation = unavailable('Product innovation has no deterministic formula from available data — narrative only, from AI reasoning.');

  // --- Valuation: P/E vs. a fixed reference band; higher score = more attractively valued. ---
  let valuation: ConvictionCategoryResult;
  if (f?.peRatio !== null && f?.peRatio !== undefined && f.peRatio > 0) {
    const score = 100 - linearRiskScore(f.peRatio, 15, 60);
    valuation = {
      score,
      dataAvailable: true,
      explanation: `P/E of ${f.peRatio.toFixed(1)}x scored against a 15-60x reference band (simplified — not sector/growth-adjusted).`,
    };
  } else {
    valuation = unavailable('No P/E data available for this symbol.');
  }

  // --- Execution risk: realized volatility, with a near-term earnings-proximity modifier. ---
  let executionRisk: ConvictionCategoryResult;
  const vol = annualizedVolatility(input.history);
  const earningsImminent = input.daysToNextEarnings !== null && input.daysToNextEarnings >= 0 && input.daysToNextEarnings <= 14;
  if (vol !== null) {
    const baseScore = linearRiskScore(vol * 100, 12, 70);
    const score = earningsImminent ? Math.min(100, baseScore + 10) : baseScore;
    executionRisk = {
      score,
      dataAvailable: true,
      explanation:
        `Realized annualized volatility of ${(vol * 100).toFixed(1)}% used as an execution/operational-uncertainty proxy.` +
        (earningsImminent ? ` Elevated +10 for an earnings report in the next ${input.daysToNextEarnings} day(s).` : ''),
    };
  } else if (earningsImminent) {
    executionRisk = {
      score: 60,
      dataAvailable: true,
      explanation: `Not enough price history for realized volatility, but an earnings report is due in ${input.daysToNextEarnings} day(s) — scored as elevated near-term uncertainty.`,
    };
  } else {
    executionRisk = unavailable('Not enough price history to compute realized volatility, and no near-term earnings date on record.');
  }

  // --- Regulatory risk: sector-keyword proxy, same as the portfolio risk engine. ---
  const sector = sectorOf(input.sector);
  const regulated = matchesAnyKeyword(sector, REGULATED_SECTOR_KEYWORDS);
  const regulatoryRisk: ConvictionCategoryResult = {
    score: regulated ? 65 : 30,
    dataAvailable: true,
    explanation: `Sector "${sector}" ${regulated ? 'matches' : 'does not match'} elevated-regulatory-exposure keywords (defense, energy, semiconductors, cyber, aerospace, financials, pharma) — a coarse proxy, not case-by-case analysis.`,
  };

  // --- Macro sensitivity: beta vs. SPY. ---
  let macroSensitivity: ConvictionCategoryResult;
  const beta = computeBeta(input.history, input.sp500History);
  if (beta !== null) {
    macroSensitivity = {
      score: linearRiskScore(beta, 0.5, 2.0),
      dataAvailable: true,
      explanation: `Beta vs. SPY of ${beta.toFixed(2)}.`,
    };
  } else {
    macroSensitivity = unavailable('Not enough overlapping history vs. SPY to compute beta.');
  }

  const categories: Record<string, ConvictionCategoryResult> = {
    financialStrength,
    revenueGrowth,
    profitability,
    balanceSheet,
    competitiveMoat,
    aiPositioning,
    managementExecution,
    industryLeadership,
    productInnovation,
    valuation,
    executionRisk,
    regulatoryRisk,
    macroSensitivity,
  };

  let weightedSum = 0;
  let weightTotal = 0;
  const methodology: Record<string, unknown> = {};
  for (const [key, result] of Object.entries(categories)) {
    const weight = WEIGHTS[key as keyof typeof WEIGHTS];
    methodology[key] = { ...result, weight, inverted: INVERTED_CATEGORIES.has(key) };
    if (result.score === null) continue;
    const contribution = INVERTED_CATEGORIES.has(key) ? 100 - result.score : result.score;
    weightedSum += contribution * weight;
    weightTotal += weight;
  }

  const overallScore = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 50;
  methodology._effectiveWeightUsed = weightTotal;
  methodology._totalPossibleWeight = 100;

  return {
    financialStrength,
    revenueGrowth,
    profitability,
    balanceSheet,
    competitiveMoat,
    aiPositioning,
    managementExecution,
    industryLeadership,
    productInnovation,
    valuation,
    executionRisk,
    regulatoryRisk,
    macroSensitivity,
    overallScore,
    methodology,
  };
}
