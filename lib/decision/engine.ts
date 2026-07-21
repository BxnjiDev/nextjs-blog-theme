import type { Tone } from '@/lib/theme/tone';
import { ACTION_LABEL, scoreTone } from '@/lib/theme/tone';
import { freshnessFromAge } from '@/lib/intelligence/engine';
import { computePriorityScore, computeTier } from '@/lib/intelligence/scoring';
import type { Insight, InsightScores } from '@/lib/intelligence/types';
import { DECISION_ACTION_LABEL, DECISION_ACTION_TONE, type Decision, type DecisionAction, type DecisionFactor } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_DAYS = 30;
const CONCENTRATION_THRESHOLD_PCT = 20;
const EARNINGS_SOON_DAYS = 7;
const NOT_ASSESSED = 'Not assessed.';

export type ConvictionTrend = 'IMPROVING' | 'STABLE' | 'WEAKENING' | 'UNKNOWN';

export interface DecisionRecommendationInput {
  id: string;
  action: string; // RecommendedAction
  confidenceScore: number; // 1-10
  generatedAt: Date;
  dataQualityStatus: string | null;
  thesis: string;
  bearCase: string;
  catalysts: string;
  risks: string;
  technicalTrend: string | null;
  explainability: {
    supportingEvidence: string;
    invalidationConditions: string;
  } | null;
}

export interface DecisionConvictionInput {
  current: number | null;
  previous: number | null;
  trend: ConvictionTrend;
  valuationScore: number | null;
  latestChangeEvent: { whatChanged: string | null; whyChanged: string | null } | null;
  sellConditions: string | null;
}

export interface DecisionNewsInput {
  headline: string;
  materialityLevel: string;
  sentiment: number | null;
}

export interface BuildDecisionInput {
  symbol: string;
  isHeld: boolean;
  holdingWeightPct: number | null;
  sector: string | null;
  recommendation: DecisionRecommendationInput | null;
  conviction: DecisionConvictionInput | null;
  portfolioRisk: { overallScore: number; concentrationRisk: number; sectorRisk: number } | null;
  daysToNextEarnings: number | null;
  latestMaterialNews: DecisionNewsInput | null;
  now?: Date;
}

function baseActionFor(recommendationAction: string, isHeld: boolean): DecisionAction {
  switch (recommendationAction) {
    case 'BUY_MORE':
      return isHeld ? 'INCREASE' : 'INITIATE';
    case 'HOLD':
      return 'HOLD';
    case 'REDUCE':
      return 'REDUCE';
    case 'SELL':
      return 'EXIT';
    case 'WATCH':
      return 'WAIT';
    default:
      return 'HOLD';
  }
}

const BULLISH_ACTIONS = new Set<DecisionAction>(['INCREASE', 'INITIATE']);

/**
 * The Decision Engine's core synthesis step: takes the latest AI-authored
 * Recommendation (a static, point-in-time opinion) and re-evaluates it
 * against everything that may have changed since — conviction trend, data
 * quality, staleness, and portfolio concentration — rather than presenting
 * that stale opinion at face value. Every override is cited in
 * `confidenceReasoning`, so a downgraded call always says why. Pure and
 * synchronous: every field of `input` must already be fetched by the
 * caller (lib/domain/decision.ts) — nothing here touches Prisma, a
 * provider, or an LLM.
 */
export function buildDecision(input: BuildDecisionInput): Decision {
  const now = input.now ?? new Date();
  const { symbol, isHeld, holdingWeightPct, sector, recommendation, conviction, portfolioRisk, daysToNextEarnings, latestMaterialNews } = input;

  const overrideReasons: string[] = [];
  let action: DecisionAction;

  if (recommendation) {
    action = baseActionFor(recommendation.action, isHeld);
  } else if (isHeld && conviction) {
    action = 'GATHER_INFO';
    overrideReasons.push('No recommendation has been generated for this holding yet — the read below is based on thesis/conviction data alone.');
  } else if (isHeld) {
    action = 'HOLD';
    overrideReasons.push('No thesis or recommendation exists yet for this holding.');
  } else {
    action = 'NO_ACTION';
  }

  const ageDays = recommendation ? (now.getTime() - recommendation.generatedAt.getTime()) / DAY_MS : null;
  const isStale = ageDays !== null && ageDays > STALE_AFTER_DAYS;
  const isWeakening = conviction?.trend === 'WEAKENING';
  const isBlocked = recommendation?.dataQualityStatus === 'BLOCKED';
  const isOverConcentrated = holdingWeightPct !== null && holdingWeightPct >= CONCENTRATION_THRESHOLD_PCT;

  if (isBlocked) {
    action = 'GATHER_INFO';
    overrideReasons.push('The data-quality gate blocked this recommendation from full confidence — treat the stated action as unverified.');
  } else if (BULLISH_ACTIONS.has(action) && isWeakening) {
    action = 'WAIT';
    overrideReasons.push(
      isStale
        ? `Conviction has weakened since this ${Math.round(ageDays!)}-day-old recommendation was generated.`
        : 'Conviction has been trending down since this recommendation was generated.'
    );
  } else if (action === 'INCREASE' && isOverConcentrated) {
    action = 'HOLD';
    overrideReasons.push(`This position is already ${holdingWeightPct!.toFixed(1)}% of the portfolio — adding more would concentrate risk further.`);
  }

  // --- Confidence ---
  let confidence = recommendation ? recommendation.confidenceScore * 10 : conviction ? 50 : 30;
  const confidenceReasoning: string[] = [];

  if (isStale) {
    const penalty = Math.min(25, Math.round(((ageDays as number) - STALE_AFTER_DAYS) / 30) * 5 + 5);
    confidence -= penalty;
    confidenceReasoning.push(`This recommendation is ${Math.round(ageDays as number)} days old — confidence is discounted for staleness.`);
  }
  if (recommendation?.dataQualityStatus === 'PASS_WITH_WARNINGS') {
    confidence -= 10;
    confidenceReasoning.push('Generated with data-quality warnings.');
  } else if (isBlocked) {
    confidence -= 25;
  }
  if (isWeakening) {
    confidence -= 12;
    confidenceReasoning.push('Conviction trend is weakening.');
  }
  if (conviction && conviction.valuationScore === null) {
    confidence -= 5;
    confidenceReasoning.push('No valuation data available for this symbol.');
  }
  if (isOverConcentrated && action === 'HOLD') {
    confidence -= 10;
  }
  if (!recommendation) {
    confidence -= 15;
    confidenceReasoning.push('No generated recommendation exists — this read is inferred from thesis/conviction data alone.');
  }
  if (overrideReasons.length === 0 && confidenceReasoning.length === 0) {
    confidenceReasoning.push('No conflicting signals or missing data detected — confidence reflects the underlying recommendation as generated.');
  }
  confidence = Math.max(5, Math.min(95, Math.round(confidence)));

  // --- Structured factor reasoning (Decision Framework from the brief) ---
  const reasoning: DecisionFactor[] = [];

  reasoning.push(
    recommendation
      ? {
          key: 'thesisStrength',
          label: 'Thesis strength',
          available: true,
          tone: DECISION_ACTION_TONE[baseActionFor(recommendation.action, isHeld)],
          summary: `Latest call: ${ACTION_LABEL[recommendation.action] ?? recommendation.action} at ${recommendation.confidenceScore}/10 confidence.`,
        }
      : { key: 'thesisStrength', label: 'Thesis strength', available: false, tone: 'muted', summary: 'No recommendation generated yet.' }
  );

  reasoning.push(
    conviction && conviction.current !== null
      ? {
          key: 'conviction',
          label: 'Conviction',
          available: true,
          tone: scoreTone(conviction.current, 100),
          summary: `${conviction.current}/100${conviction.trend !== 'UNKNOWN' ? `, ${conviction.trend.toLowerCase()}` : ''}.`,
        }
      : { key: 'conviction', label: 'Conviction', available: false, tone: 'muted', summary: 'No conviction assessment on record yet.' }
  );

  reasoning.push(
    portfolioRisk
      ? {
          key: 'risk',
          label: 'Portfolio risk',
          available: true,
          tone: scoreTone(portfolioRisk.overallScore, 100, true),
          summary: `Overall portfolio risk ${portfolioRisk.overallScore}/100.`,
        }
      : { key: 'risk', label: 'Portfolio risk', available: false, tone: 'muted', summary: 'No risk assessment on record yet.' }
  );

  reasoning.push(
    conviction && conviction.valuationScore !== null
      ? {
          key: 'valuation',
          label: 'Valuation',
          available: true,
          tone: scoreTone(conviction.valuationScore, 100),
          summary: `Valuation score ${conviction.valuationScore}/100 (higher = more attractive).`,
        }
      : { key: 'valuation', label: 'Valuation', available: false, tone: 'muted', summary: 'No valuation data source configured for this symbol.' }
  );

  reasoning.push(
    holdingWeightPct !== null
      ? {
          key: 'concentration',
          label: 'Portfolio concentration',
          available: true,
          tone: holdingWeightPct >= CONCENTRATION_THRESHOLD_PCT ? 'warning' : 'positive',
          summary: `${holdingWeightPct.toFixed(1)}% of the portfolio.`,
        }
      : { key: 'concentration', label: 'Portfolio concentration', available: false, tone: 'muted', summary: 'Not currently held.' }
  );

  reasoning.push(
    sector
      ? {
          key: 'sectorExposure',
          label: 'Sector exposure',
          available: true,
          tone: portfolioRisk ? scoreTone(portfolioRisk.sectorRisk, 100, true) : 'neutral',
          summary: portfolioRisk ? `${sector} — portfolio sector-concentration risk ${portfolioRisk.sectorRisk}/100.` : sector,
        }
      : { key: 'sectorExposure', label: 'Sector exposure', available: false, tone: 'muted', summary: 'Sector not classified.' }
  );

  reasoning.push(
    recommendation?.technicalTrend
      ? { key: 'technical', label: 'Technical context', available: true, tone: 'info', summary: recommendation.technicalTrend }
      : { key: 'technical', label: 'Technical context', available: false, tone: 'muted', summary: 'No technical trend data available.' }
  );

  reasoning.push(
    recommendation?.catalysts
      ? { key: 'catalysts', label: 'Catalysts', available: true, tone: 'info', summary: recommendation.catalysts }
      : { key: 'catalysts', label: 'Catalysts', available: false, tone: 'muted', summary: 'No catalysts on record.' }
  );

  reasoning.push(
    latestMaterialNews
      ? {
          key: 'newsImpact',
          label: 'Recent news impact',
          available: true,
          tone: latestMaterialNews.sentiment !== null ? (latestMaterialNews.sentiment >= 0.15 ? 'positive' : latestMaterialNews.sentiment <= -0.15 ? 'negative' : 'neutral') : 'neutral',
          summary: `${latestMaterialNews.materialityLevel.toLowerCase()} materiality — "${latestMaterialNews.headline}"`,
        }
      : { key: 'newsImpact', label: 'Recent news impact', available: false, tone: 'muted', summary: 'No material news recently.' }
  );

  reasoning.push(
    daysToNextEarnings !== null
      ? {
          key: 'earningsTiming',
          label: 'Earnings timing',
          available: true,
          tone: daysToNextEarnings <= EARNINGS_SOON_DAYS ? 'warning' : 'info',
          summary: `Reports in ${daysToNextEarnings}d.`,
        }
      : { key: 'earningsTiming', label: 'Earnings timing', available: false, tone: 'muted', summary: 'No upcoming earnings date on record.' }
  );

  reasoning.push({
    key: 'portfolioObjectives',
    label: 'Portfolio objectives',
    available: false,
    tone: 'muted',
    summary: 'Atlas does not yet track explicit portfolio objectives or target allocations — this factor is a known gap, not a signal.',
  });

  // --- Evidence, risks, invalidation ---
  const evidence: string[] = [];
  if (recommendation?.explainability?.supportingEvidence && recommendation.explainability.supportingEvidence !== NOT_ASSESSED) {
    evidence.push(recommendation.explainability.supportingEvidence);
  }
  if (conviction?.latestChangeEvent?.whatChanged) evidence.push(conviction.latestChangeEvent.whatChanged);
  if (latestMaterialNews) evidence.push(`${latestMaterialNews.materialityLevel} news: "${latestMaterialNews.headline}"`);

  const primaryRisks: string[] = [];
  if (recommendation?.risks) primaryRisks.push(recommendation.risks);
  if (recommendation?.bearCase) primaryRisks.push(recommendation.bearCase);
  if (isOverConcentrated) primaryRisks.push(`Concentration: this position is ${holdingWeightPct!.toFixed(1)}% of the portfolio.`);

  const invalidationConditions: string[] = [];
  if (recommendation?.explainability?.invalidationConditions && recommendation.explainability.invalidationConditions !== NOT_ASSESSED) {
    invalidationConditions.push(recommendation.explainability.invalidationConditions);
  }
  if (conviction?.sellConditions && conviction.sellConditions !== 'Not yet assessed.') {
    invalidationConditions.push(conviction.sellConditions);
  }
  if (conviction?.current !== null && conviction?.current !== undefined) {
    invalidationConditions.push(`If conviction falls below 40/100 (currently ${conviction.current}).`);
  }
  if (isHeld && holdingWeightPct !== null && holdingWeightPct < CONCENTRATION_THRESHOLD_PCT) {
    invalidationConditions.push(`If this position grows beyond ${CONCENTRATION_THRESHOLD_PCT}% of the portfolio.`);
  }

  // --- Scores → priority tier (same scoring vocabulary as the Intelligence Layer) ---
  const importanceByAction: Record<DecisionAction, number> = {
    INCREASE: 70,
    INITIATE: 70,
    REDUCE: 75,
    EXIT: 80,
    HOLD: 35,
    WAIT: 45,
    GATHER_INFO: 55,
    NO_ACTION: 10,
  };
  const scores: InsightScores = {
    importance: importanceByAction[action],
    confidence,
    urgency: Math.min(
      100,
      30 + (daysToNextEarnings !== null && daysToNextEarnings <= EARNINGS_SOON_DAYS ? 40 : 0) + (isWeakening ? 20 : 0) + (action === 'EXIT' || action === 'REDUCE' ? 15 : 0)
    ),
    impact: holdingWeightPct !== null ? Math.min(90, 20 + holdingWeightPct * 2) : action === 'INITIATE' ? 40 : 20,
    freshness: recommendation ? freshnessFromAge(now.getTime() - recommendation.generatedAt.getTime(), 14) : 50,
  };
  const priorityScore = computePriorityScore(scores);
  const priority = computeTier(scores, priorityScore);

  // --- Review date ---
  const activeCallDays = BULLISH_ACTIONS.has(action) || action === 'REDUCE' || action === 'EXIT' ? 14 : 30;
  let expectedReviewDate: Date | null = action === 'NO_ACTION' ? null : new Date(now.getTime() + activeCallDays * DAY_MS);
  if (expectedReviewDate && daysToNextEarnings !== null) {
    const earningsDate = new Date(now.getTime() + daysToNextEarnings * DAY_MS);
    if (earningsDate < expectedReviewDate) expectedReviewDate = earningsDate;
  }

  // --- Headline / summary ---
  const actionLabel = DECISION_ACTION_LABEL[action];
  const headline =
    action === 'NO_ACTION'
      ? `No action needed on ${symbol}.`
      : action === 'GATHER_INFO'
        ? `Atlas needs more information on ${symbol} before deciding.`
        : `Atlas suggests: ${actionLabel.toLowerCase()} — ${symbol}.`;

  const summary =
    overrideReasons.length > 0
      ? `${overrideReasons.join(' ')} (${confidence}% confidence.)`
      : recommendation
        ? `${actionLabel} at ${confidence}% confidence, based on the latest recommendation and current thesis data.`
        : conviction
          ? `Based on thesis/conviction data alone — no recommendation has been generated for this symbol yet.`
          : `Atlas has no thesis, conviction data, or recommendation on record for ${symbol}.`;

  return {
    symbol,
    isHeld,
    headline,
    summary,
    action,
    actionLabel,
    tone: DECISION_ACTION_TONE[action],
    reasoning,
    evidence,
    primaryRisks,
    invalidationConditions,
    confidence,
    confidenceReasoning,
    scores,
    priority,
    expectedReviewDate,
    basedOnRecommendationId: recommendation?.id ?? null,
    generatedAt: now,
  };
}

/**
 * A lightweight action read from a conviction/overall score alone, with no
 * portfolio, thesis, or staleness context — for surfaces (like /compare)
 * evaluating symbols where the full Decision Engine's per-symbol fetch
 * would be unnecessary computation (comparison symbols are often not held
 * and have no thesis on record at all). Not a substitute for
 * buildDecision(): it carries none of that function's overrides,
 * evidence, or confidence discounting, and should never be labeled as if
 * it were a full Decision.
 */
export function quickActionForScore(score: number, isHeld: boolean): DecisionAction {
  if (score >= 70) return isHeld ? 'INCREASE' : 'INITIATE';
  if (score >= 40) return isHeld ? 'HOLD' : 'WAIT';
  return isHeld ? 'REDUCE' : 'NO_ACTION';
}

/**
 * Adapts a Decision into the Intelligence Layer's Insight shape so it can
 * render through the exact same InsightCard/InsightStack every other
 * surface already uses — no second "decision card" component, no second
 * "show why" interaction to build or maintain.
 */
export function decisionToInsight(decision: Decision): Insight {
  return {
    id: `decision-${decision.symbol}`,
    category: 'recommendation',
    tier: decision.priority,
    priorityScore: computePriorityScore(decision.scores),
    tone: decision.tone,
    headline: decision.headline,
    interpretation: decision.summary,
    recommendation: decision.action !== 'NO_ACTION' ? decision.actionLabel : undefined,
    scores: decision.scores,
    reasoning: {
      evidence: decision.evidence,
      signals: decision.reasoning.filter((f) => f.available).map((f) => `${f.label}: ${f.summary}`),
      riskFactors: decision.primaryRisks,
      confidenceReasoning: decision.confidenceReasoning.join(' '),
    },
    href: `/intelligence/${decision.symbol}`,
    symbol: decision.symbol,
  };
}
