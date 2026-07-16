import type { HoldingView } from './portfolio';
import type { Trend } from '@/lib/integrations';
import { linearRiskScore } from './risk';

export interface HealthHoldingInput {
  view: HoldingView;
  trend: Trend | null;
  convictionScore: number | null; // latest ConvictionAssessment.overallScore, if any
  valuationScore: number | null; // latest ConvictionAssessment.valuation, if any
  revenueGrowth: number | null; // latest FundamentalSnapshot.revenueGrowth (YoY, decimal), if ingested
}

export interface RiskSnapshotForHealth {
  overallScore: number;
  concentrationRisk: number;
  sectorRisk: number;
  macroRisk: number;
}

export interface PortfolioHealthInput {
  holdings: HealthHoldingInput[];
  totalValue: number;
  cashBalance: number;
  risk: RiskSnapshotForHealth | null;
}

export interface HealthComponent {
  score: number;
  explanation: string;
}

export interface PortfolioHealthResult {
  diversificationScore: HealthComponent;
  qualityScore: HealthComponent;
  growthScore: HealthComponent;
  riskScore: HealthComponent;
  valuationScore: HealthComponent;
  sectorBalanceScore: HealthComponent;
  cashAllocationScore: HealthComponent;
  concentrationScore: HealthComponent;
  macroExposureScore: HealthComponent;
  overallScore: number;
  componentBreakdown: Record<string, unknown>;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * Deterministic portfolio health scoring. Where a component depends on data
 * this app doesn't have yet (fundamental revenue growth, for instance),
 * that's documented in the explanation and a defensible proxy is used
 * instead of a fabricated number.
 */
export function computePortfolioHealth(input: PortfolioHealthInput): PortfolioHealthResult {
  const componentBreakdown: Record<string, unknown> = {};

  // --- Diversification: breadth of holdings + sector spread. ---
  const holdingCount = input.holdings.length;
  const breadthScore = Math.min(100, holdingCount * 12);
  const sectorInverse = input.risk ? 100 - input.risk.sectorRisk : 50;
  const diversificationScoreValue = clamp(0.6 * breadthScore + 0.4 * sectorInverse);
  componentBreakdown.diversification = { holdingCount, breadthScore, sectorInverse };
  const diversificationScore: HealthComponent = {
    score: diversificationScoreValue,
    explanation: `${holdingCount} distinct holding(s); breadth score ${breadthScore}/100 blended with sector-spread inverse ${sectorInverse}/100.`,
  };

  // --- Quality: position-weighted conviction score. ---
  let qualitySum = 0;
  let qualityWeight = 0;
  for (const h of input.holdings) {
    const weight = input.totalValue > 0 ? h.view.marketValue / input.totalValue : 0;
    if (h.convictionScore !== null) {
      qualitySum += h.convictionScore * weight;
      qualityWeight += weight;
    }
  }
  const qualityScoreValue = qualityWeight > 0 ? clamp(qualitySum / qualityWeight) : 50;
  const qualityScore: HealthComponent = {
    score: qualityScoreValue,
    explanation:
      qualityWeight > 0
        ? `Position-weighted average conviction score across holdings with a conviction assessment on record.`
        : 'No conviction assessments on record yet — neutral default.',
  };

  // --- Growth: real position-weighted revenue growth when ingested, else a technical-momentum proxy. ---
  let revGrowthSum = 0;
  let revGrowthWeightTotal = 0;
  for (const h of input.holdings) {
    const weight = input.totalValue > 0 ? h.view.marketValue / input.totalValue : 0;
    if (h.revenueGrowth !== null) {
      revGrowthSum += linearRiskScore(h.revenueGrowth * 100, -10, 25) * weight;
      revGrowthWeightTotal += weight;
    }
  }
  let growthScore: HealthComponent;
  if (revGrowthWeightTotal > 0) {
    growthScore = {
      score: clamp(revGrowthSum / revGrowthWeightTotal),
      explanation: `Position-weighted YoY revenue growth across holdings with fundamentals-history data ingested (${(revGrowthWeightTotal * 100).toFixed(0)}% of portfolio value covered).`,
    };
  } else {
    let upWeight = 0;
    let trendWeightTotal = 0;
    for (const h of input.holdings) {
      const weight = input.totalValue > 0 ? h.view.marketValue / input.totalValue : 0;
      if (h.trend) {
        trendWeightTotal += weight;
        if (h.trend === 'UP') upWeight += weight;
      }
    }
    growthScore = {
      score: trendWeightTotal > 0 ? clamp((upWeight / trendWeightTotal) * 100) : 50,
      explanation:
        'Technical-momentum proxy: share of portfolio value in holdings currently trending UP. No fundamentals-history data ingested yet for any holding.',
    };
  }

  // --- Risk: inverse of the latest portfolio risk assessment. ---
  const riskScoreValue = input.risk ? clamp(100 - input.risk.overallScore) : 50;
  const riskScore: HealthComponent = {
    score: riskScoreValue,
    explanation: input.risk
      ? `Inverse of the latest portfolio risk score (${input.risk.overallScore}/100).`
      : 'No risk assessment on record yet — neutral default.',
  };

  // --- Valuation: position-weighted valuation-attractiveness (from conviction engine). ---
  let valSum = 0;
  let valWeight = 0;
  for (const h of input.holdings) {
    const weight = input.totalValue > 0 ? h.view.marketValue / input.totalValue : 0;
    if (h.valuationScore !== null) {
      valSum += h.valuationScore * weight;
      valWeight += weight;
    }
  }
  const valuationScoreValue = valWeight > 0 ? clamp(valSum / valWeight) : 50;
  const valuationScore: HealthComponent = {
    score: valuationScoreValue,
    explanation:
      valWeight > 0
        ? 'Position-weighted valuation-attractiveness score from the conviction engine (P/E-based).'
        : 'No valuation data available across holdings — neutral default.',
  };

  // --- Sector balance: inverse of sector concentration risk. ---
  const sectorBalanceScoreValue = input.risk ? clamp(100 - input.risk.sectorRisk) : 50;
  const sectorBalanceScore: HealthComponent = {
    score: sectorBalanceScoreValue,
    explanation: input.risk ? `Inverse of sector concentration risk (${input.risk.sectorRisk}/100).` : 'No risk assessment on record yet.',
  };

  // --- Cash allocation: peak health around ~10% cash; too little or too much both worse. ---
  const cashPct = input.totalValue > 0 ? (input.cashBalance / input.totalValue) * 100 : 0;
  const idealCashPct = 10;
  const cashDeviation = Math.abs(cashPct - idealCashPct);
  const cashAllocationScoreValue = clamp(100 - cashDeviation * 2.5);
  const cashAllocationScore: HealthComponent = {
    score: cashAllocationScoreValue,
    explanation: `Cash is ${cashPct.toFixed(1)}% of the portfolio (target band centered around ${idealCashPct}% for both dry powder and capital deployment).`,
  };

  // --- Concentration: inverse of top-position concentration risk. ---
  const concentrationScoreValue = input.risk ? clamp(100 - input.risk.concentrationRisk) : 50;
  const concentrationScore: HealthComponent = {
    score: concentrationScoreValue,
    explanation: input.risk ? `Inverse of position concentration risk (${input.risk.concentrationRisk}/100).` : 'No risk assessment on record yet.',
  };

  // --- Macro exposure: inverse of portfolio macro risk. ---
  const macroExposureScoreValue = input.risk ? clamp(100 - input.risk.macroRisk) : 50;
  const macroExposureScore: HealthComponent = {
    score: macroExposureScoreValue,
    explanation: input.risk ? `Inverse of macro sensitivity risk (${input.risk.macroRisk}/100).` : 'No risk assessment on record yet.',
  };

  const components = [
    diversificationScore,
    qualityScore,
    growthScore,
    riskScore,
    valuationScore,
    sectorBalanceScore,
    cashAllocationScore,
    concentrationScore,
    macroExposureScore,
  ];
  const overallScore = clamp(components.reduce((s, c) => s + c.score, 0) / components.length);

  return {
    diversificationScore,
    qualityScore,
    growthScore,
    riskScore,
    valuationScore,
    sectorBalanceScore,
    cashAllocationScore,
    concentrationScore,
    macroExposureScore,
    overallScore,
    componentBreakdown,
  };
}
