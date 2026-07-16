import type { CompanyFundamentals, HistoricalPricePoint } from '@/lib/integrations';
import { linearRiskScore, annualizedVolatility, computeBeta, sectorOf, matchesAnyKeyword, REGULATED_SECTOR_KEYWORDS } from './risk';

/**
 * Deterministic conviction scoring. Every category is EITHER a real number
 * derived from fetched data, with the derivation shown in `methodology`,
 * OR null when no data source supports scoring it — never a guessed
 * number. Qualitative categories (moat, AI positioning, management
 * execution, industry leadership, product innovation) have no deterministic
 * formula given the data this app has access to (no analyst estimates, no
 * peer universe, no management-quality data source) and are intentionally
 * left null here; Claude may still write a NARRATIVE about them (stored on
 * Thesis.competitiveAdvantages etc.), but the numeric score is not
 * fabricated to fill the gap.
 */

export interface ConvictionCategoryResult {
  score: number | null;
  dataAvailable: boolean;
  explanation: string;
}

export interface ConvictionInput {
  symbol: string;
  fundamentals: CompanyFundamentals | null;
  history: HistoricalPricePoint[]; // ~60 sessions
  sp500History: HistoricalPricePoint[];
  sector: string | null;
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

  // --- Financial strength: crude proxy from profitability + shareholder
  // returns + size, since no debt/cash-flow data source is connected. ---
  let financialStrength: ConvictionCategoryResult;
  if (f) {
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
      explanation: 'Proxy from EPS sign, dividend payment, and market-cap size — no debt/cash-flow data source connected for a fuller balance-sheet read.',
    };
  } else {
    financialStrength = unavailable('No fundamentals data available for this symbol.');
  }

  // --- Revenue growth: no data source connected at all. ---
  const revenueGrowth = unavailable('No revenue-history data source is connected; cannot compute growth deterministically.');

  // --- Profitability: EPS yield (eps / price) as a crude proxy. ---
  let profitability: ConvictionCategoryResult;
  const price = input.history[0]?.close ?? null;
  if (f?.eps !== null && f?.eps !== undefined && price && price > 0) {
    const epsYield = (f.eps / price) * 100;
    const score = linearRiskScore(epsYield, -5, 8); // -5%: unprofitable/expensive, 8%+: strongly profitable per price paid
    profitability = {
      score,
      dataAvailable: true,
      explanation: `EPS yield (trailing EPS / current price) of ${epsYield.toFixed(2)}% — a crude profitability-per-dollar-paid proxy, not a real margin analysis.`,
    };
  } else {
    profitability = unavailable('No EPS or price data available to compute an EPS-yield proxy.');
  }

  // --- Balance sheet: no data source connected. ---
  const balanceSheet = unavailable('No balance-sheet data source (debt, cash, current ratio) is connected.');

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

  // --- Execution risk: realized volatility as an operational-uncertainty proxy. ---
  let executionRisk: ConvictionCategoryResult;
  const vol = annualizedVolatility(input.history);
  if (vol !== null) {
    executionRisk = {
      score: linearRiskScore(vol * 100, 12, 70),
      dataAvailable: true,
      explanation: `Realized annualized volatility of ${(vol * 100).toFixed(1)}% used as an execution/operational-uncertainty proxy.`,
    };
  } else {
    executionRisk = unavailable('Not enough price history to compute realized volatility.');
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
