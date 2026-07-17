import { computeRisk, type RiskHoldingInput, type RiskResult } from './risk';
import { computePortfolioHealth, type HealthHoldingInput, type PortfolioHealthResult } from './portfolioHealth';
import { computeSectorWeights } from './investmentMemo';
import type { HoldingView, PortfolioOverview } from './portfolio';
import type { HoldingBaseline, SimulatorBaseline } from './simulator';

/**
 * Pure recompute of risk/health/sector-weight/cash for a hypothetical
 * reallocation of the real portfolio (total value stays fixed — this
 * reallocates existing capital, never adds new money). Split into its own
 * module, separate from lib/domain/simulator.ts's getSimulatorBaseline(),
 * specifically so components/SimulatorClient.tsx (a 'use client' component)
 * can import this function's pure math without pulling Prisma/market-data/
 * Anthropic (getSimulatorBaseline's dependencies) into the browser bundle —
 * everything imported here is type-only or itself dependency-free. Used by
 * both SimulatorClient.tsx (interactive, browser-side) and Atlas Chat's
 * `simulate` tool (lib/atlas/toolExecutors.ts), so the "what if" math lives
 * in exactly one place — both just call computeRisk/computePortfolioHealth/
 * computeSectorWeights, the same engines behind /risk, /health, /simulator.
 */
export interface SimulatedMetrics {
  risk: RiskResult;
  health: PortfolioHealthResult;
  sectorWeights: Record<string, number>;
  hypotheticalCash: number;
  largestPosition: HoldingView | null;
}

function buildHypotheticalView(h: HoldingBaseline, quantity: number): HoldingView {
  const marketValue = quantity * h.currentPrice;
  const costBasisTotal = quantity * h.avgCostBasis;
  const unrealizedPnl = marketValue - costBasisTotal;
  return {
    id: h.symbol,
    symbol: h.symbol,
    name: h.name,
    sector: h.sector,
    quantity,
    avgCostBasis: h.avgCostBasis,
    currentPrice: h.currentPrice,
    changePercent: 0,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPercent: costBasisTotal > 0 ? (unrealizedPnl / costBasisTotal) * 100 : 0,
    quoteAsOf: h.quoteAsOf,
    quoteQuality: h.quoteQuality,
  };
}

export function computeSimulatedMetrics(baseline: SimulatorBaseline, hypotheticalShares: Record<string, number>): SimulatedMetrics {
  const views = baseline.holdings.map((h) => buildHypotheticalView(h, hypotheticalShares[h.symbol] ?? h.quantity));
  const sumMarketValue = views.reduce((s, v) => s + v.marketValue, 0);
  const hypotheticalCash = baseline.totalValue - sumMarketValue;

  const riskHoldings: RiskHoldingInput[] = baseline.holdings.map((h, i) => ({
    view: views[i],
    history: h.history,
    fundamentals: h.fundamentals,
    daysSinceLastFiling: h.daysSinceLastFiling,
    daysToNextEarnings: h.daysToNextEarnings,
    negativeNewsCritical: h.negativeNewsCritical,
    negativeNewsHigh: h.negativeNewsHigh,
  }));
  const risk = computeRisk({
    holdings: riskHoldings,
    totalValue: baseline.totalValue,
    cashBalance: hypotheticalCash,
    sp500History: baseline.sp500History,
    portfolioHistory: baseline.portfolioHistory,
    quoteQualities: baseline.holdings.map((h) => h.quoteQuality),
  });

  const healthHoldings: HealthHoldingInput[] = baseline.holdings.map((h, i) => ({
    view: views[i],
    trend: h.trend,
    convictionScore: h.convictionScore,
    valuationScore: h.valuationScore,
    revenueGrowth: h.revenueGrowth,
  }));
  const health = computePortfolioHealth({
    holdings: healthHoldings,
    totalValue: baseline.totalValue,
    cashBalance: hypotheticalCash,
    risk: { overallScore: risk.overallScore, concentrationRisk: risk.concentrationRisk.score, sectorRisk: risk.sectorRisk.score, macroRisk: risk.macroRisk.score },
  });

  const syntheticOverview: PortfolioOverview = {
    totalValue: baseline.totalValue,
    cashBalance: hypotheticalCash,
    dayChangeValue: 0,
    dayChangePercent: 0,
    sp500Level: 0,
    holdings: views,
    largestWinner: null,
    largestLoser: null,
    asOf: new Date(),
  };
  const sectorWeights = computeSectorWeights(syntheticOverview);
  const largestPosition = [...views].sort((a, b) => b.marketValue - a.marketValue)[0] ?? null;

  return { risk, health, sectorWeights, hypotheticalCash, largestPosition };
}
