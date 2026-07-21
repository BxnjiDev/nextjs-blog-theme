import type { RiskResult } from '@/lib/domain/risk';
import { RISK_COMPONENT_LABELS } from '@/lib/domain/risk';
import type { PortfolioHealthResult } from '@/lib/domain/portfolioHealth';
import type { RankedComparisonEntry } from '@/lib/domain/compareOpportunities';
import type { TimelineEntry } from '@/lib/domain/timeline';
import { TIMELINE_TYPE_TONE, type Tone } from '@/lib/theme/tone';
import { finalizeInsight, sortByPriority } from './scoring';
import type { Insight, InsightScores } from './types';

/**
 * Every generator below is a pure function over data a page (or the Atlas
 * chat tool layer) already fetched — none of these query Prisma, call a
 * market-data provider, or call Claude. That's deliberate: the judgment
 * ("risk is elevated because of concentration," "this thesis just
 * changed") already exists in lib/domain/risk.ts, portfolioHealth.ts,
 * compareOpportunities.ts, and timeline.ts as plain-English `explanation`/
 * `detail` text — this module's only job is to score, rank, and merge
 * that existing judgment into one consistent shape, never to invent new
 * analysis or new confidence.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 100 at age zero, halving every `halfLifeDays` — keeps a fact that's
 * still true but no longer new from crowding out what actually just
 * changed, without making old-but-still-relevant context disappear
 * entirely (floors at 5, never 0). */
export function freshnessFromAge(ageMs: number, halfLifeDays: number): number {
  const days = Math.max(0, ageMs / DAY_MS);
  const score = 100 * Math.pow(0.5, days / halfLifeDays);
  return Math.max(5, Math.min(100, Math.round(score)));
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

// ---------------------------------------------------------------------------
// Portfolio health
// ---------------------------------------------------------------------------

export interface HealthAssessmentLike {
  overallScore: number;
  previousScore: number | null;
  topConcerns?: unknown;
  topImprovements?: unknown;
  componentBreakdown?: unknown;
  generatedAt?: Date;
}

export function assessPortfolioHealth(health: HealthAssessmentLike | null): Insight[] {
  if (!health) return [];
  const concerns = asStringArray(health.topConcerns).filter((c) => !c.startsWith('No component'));
  const improvements = asStringArray(health.topImprovements).filter((c) => !c.startsWith('No component'));
  const delta = health.previousScore != null ? health.overallScore - health.previousScore : null;
  const ageMs = health.generatedAt ? Date.now() - health.generatedAt.getTime() : DAY_MS;

  const tone: Tone = health.overallScore >= 70 ? 'positive' : health.overallScore >= 40 ? 'warning' : 'negative';
  const headline =
    health.overallScore >= 70 ? 'Portfolio health is strong.' : health.overallScore >= 40 ? 'Portfolio health is mixed.' : 'Portfolio health is under pressure.';

  const interpretation =
    concerns[0] ??
    (delta !== null && delta !== 0
      ? `Overall score moved ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} points since the last assessment.`
      : 'No component has changed meaningfully since the last assessment.');

  const recommendation =
    health.overallScore < 40
      ? 'Worth reviewing the weakest components before adding new exposure.'
      : delta !== null && delta <= -10
        ? 'A double-digit drop is worth understanding before your next decision.'
        : undefined;

  const breakdown = (health.componentBreakdown ?? {}) as Record<string, { score?: number; explanation?: string }>;
  const evidence = Object.entries(breakdown)
    .filter(([, v]) => typeof v?.explanation === 'string')
    .map(([, v]) => v.explanation as string)
    .slice(0, 3);

  const scores: InsightScores = {
    importance: health.overallScore < 40 ? 80 : health.overallScore < 70 ? 55 : 30,
    confidence: 85,
    urgency: delta !== null && delta <= -10 ? 65 : health.overallScore < 40 ? 55 : 20,
    impact: Math.min(100, 40 + Math.abs(delta ?? 0) * 4),
    freshness: freshnessFromAge(ageMs, 1),
  };

  return [
    finalizeInsight({
      id: 'portfolio-health',
      category: 'portfolio_health',
      tone,
      headline,
      interpretation,
      recommendation,
      scores,
      reasoning: {
        evidence: evidence.length > 0 ? evidence : concerns,
        signals: improvements,
        confidenceReasoning: 'Deterministic composite score recomputed from current holdings, risk, and conviction data — not an AI estimate.',
      },
      href: '/health',
    }),
  ];
}

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------

export interface RiskAssessmentLike {
  overallScore: number;
  previousScore: number | null;
  explanation?: unknown;
  generatedAt?: Date;
  [componentKey: string]: unknown;
}

export function assessRisk(risk: RiskAssessmentLike | null): Insight[] {
  if (!risk) return [];
  const explanation = (risk.explanation ?? {}) as Record<string, string>;
  const delta = risk.previousScore != null ? risk.overallScore - risk.previousScore : null;
  const ageMs = risk.generatedAt ? Date.now() - risk.generatedAt.getTime() : DAY_MS;

  const componentEntries = Object.keys(RISK_COMPONENT_LABELS)
    .map((key) => ({ key, label: RISK_COMPONENT_LABELS[key], score: Number(risk[key] ?? 0), explanation: explanation[key] }))
    .sort((a, b) => b.score - a.score);
  const topFactor = componentEntries[0];

  const tone: Tone = risk.overallScore < 40 ? 'positive' : risk.overallScore < 70 ? 'warning' : 'negative';
  const headline = risk.overallScore < 40 ? 'Portfolio risk is low.' : risk.overallScore < 70 ? 'Portfolio risk is moderate.' : 'Portfolio risk is elevated.';

  const interpretation = topFactor
    ? `Primarily driven by ${topFactor.label.toLowerCase()}${topFactor.explanation ? ` — ${topFactor.explanation}` : ''}`
    : 'No dominant risk factor identified.';

  const recommendation =
    risk.overallScore >= 70
      ? `Consider addressing ${topFactor?.label.toLowerCase() ?? 'the leading factor'} before adding correlated exposure.`
      : delta !== null && delta >= 10
        ? 'Risk rose meaningfully since the last assessment — worth understanding why before acting.'
        : undefined;

  const scores: InsightScores = {
    importance: risk.overallScore >= 70 ? 80 : risk.overallScore >= 40 ? 50 : 25,
    confidence: 85,
    urgency: delta !== null && delta >= 10 ? 70 : risk.overallScore >= 70 ? 55 : 20,
    impact: Math.min(100, 35 + Math.abs(delta ?? 0) * 4),
    freshness: freshnessFromAge(ageMs, 1),
  };

  return [
    finalizeInsight({
      id: 'portfolio-risk',
      category: 'risk',
      tone,
      headline,
      interpretation,
      recommendation,
      scores,
      reasoning: {
        evidence: componentEntries
          .slice(0, 3)
          .filter((c) => c.explanation)
          .map((c) => `${c.label}: ${c.explanation}`),
        riskFactors: componentEntries.filter((c) => c.score >= 60).map((c) => c.label),
        confidenceReasoning: 'Twelve deterministic factors (lib/domain/risk.ts), not an AI-generated number.',
      },
      href: '/risk',
    }),
  ];
}

// ---------------------------------------------------------------------------
// Thesis changes
// ---------------------------------------------------------------------------

export interface ThesisChangeLike {
  symbol: string;
  changeType: string;
  whatChanged: string | null;
  createdAt: Date;
}

const THESIS_CHANGE_RELEVANCE_DAYS = 14;

export function assessThesisChange(change: ThesisChangeLike | null): Insight[] {
  if (!change) return [];
  const ageMs = Date.now() - change.createdAt.getTime();
  const daysAgo = ageMs / DAY_MS;
  if (daysAgo > THESIS_CHANGE_RELEVANCE_DAYS) return [];

  const headline = `${change.symbol}'s thesis changed.`;
  const interpretation = change.whatChanged ?? `${change.changeType.replace(/_/g, ' ').toLowerCase()} recorded ${daysAgo < 1 ? 'today' : `${Math.round(daysAgo)}d ago`}.`;

  const scores: InsightScores = {
    importance: 55,
    confidence: 80,
    urgency: daysAgo < 2 ? 55 : 30,
    impact: 45,
    freshness: freshnessFromAge(ageMs, 3),
  };

  return [
    finalizeInsight({
      id: `thesis-${change.symbol}-${change.createdAt.getTime()}`,
      category: 'thesis_change',
      tone: 'warning',
      headline,
      interpretation,
      scores,
      reasoning: { recentChanges: [interpretation] },
      href: `/intelligence/${change.symbol}`,
      symbol: change.symbol,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

export interface UpcomingEarningsLike {
  symbol: string;
  reportDate: Date;
  fiscalPeriod: string;
  fiscalYear: number;
}

const EARNINGS_LOOKAHEAD_DAYS = 10;

export function assessEarnings(earnings: UpcomingEarningsLike[], weightBySymbol: Record<string, number> = {}): Insight[] {
  const now = Date.now();
  const insights = earnings
    .map((e): Insight | null => {
      const daysAway = (e.reportDate.getTime() - now) / DAY_MS;
      if (daysAway < 0 || daysAway > EARNINGS_LOOKAHEAD_DAYS) return null;
      const weight = weightBySymbol[e.symbol] ?? 0;
      const urgency = Math.max(10, Math.round(100 - daysAway * 9));
      const importance = Math.min(90, 30 + weight * 1.2);
      const scores: InsightScores = {
        importance,
        confidence: 90,
        urgency,
        impact: Math.min(90, weight * 1.5),
        freshness: 70,
      };
      const headline = `${e.symbol} reports ${e.fiscalPeriod} ${e.fiscalYear} earnings ${daysAway < 1 ? 'today' : `in ${Math.round(daysAway)}d`}.`;
      const interpretation = weight > 0 ? `${weight.toFixed(1)}% of portfolio — expect volatility around the print.` : 'Not currently held — for context only.';
      return finalizeInsight({
        id: `earnings-${e.symbol}-${e.reportDate.getTime()}`,
        category: 'earnings',
        tone: 'info',
        headline,
        interpretation,
        recommendation: weight >= 5 ? 'Review the thesis before the print if you plan to act on the reaction.' : undefined,
        scores,
        reasoning: { signals: [`${e.fiscalPeriod} ${e.fiscalYear}`] },
        href: `/intelligence/${e.symbol}`,
        symbol: e.symbol,
      });
    })
    .filter((x): x is Insight => x !== null);
  return insights;
}

// ---------------------------------------------------------------------------
// Market context
// ---------------------------------------------------------------------------

/** Deliberately always low-tier — this is orienting context ("the numbers
 * you're seeing are illustrative"), never a judgment about the portfolio
 * itself, so it should never compete with a real insight for top billing. */
export function assessMarketContext(input: { usingMockData: boolean }): Insight[] {
  if (!input.usingMockData) return [];
  return [
    finalizeInsight({
      id: 'market-context-mock',
      category: 'market_context',
      tone: 'muted',
      headline: 'Running on mock market data.',
      interpretation: 'Scores and prices are illustrative until a real account is synced — treat them as directional, not exact.',
      scores: { importance: 15, confidence: 100, urgency: 5, impact: 10, freshness: 50 },
      reasoning: {},
      href: '/connections',
    }),
  ];
}

// ---------------------------------------------------------------------------
// Comparison (Compare page / watchlist-style ranking)
// ---------------------------------------------------------------------------

export function assessComparison(ranked: Pick<RankedComparisonEntry, 'symbol' | 'overallScore' | 'explanation'>[]): Insight[] {
  if (ranked.length < 2) return [];
  const [first, second] = ranked;
  const gap = first.overallScore - second.overallScore;
  const decisive = gap >= 10;

  const headline = `${first.symbol} ranks highest${decisive ? '' : ', but closely'}.`;
  const interpretation = decisive
    ? `${gap} points clear of ${second.symbol} — a fairly decisive gap.`
    : `Only ${gap} point${gap === 1 ? '' : 's'} ahead of ${second.symbol} — not a clear-cut edge.`;

  const scores: InsightScores = { importance: decisive ? 55 : 35, confidence: 75, urgency: 15, impact: 40, freshness: 90 };

  return [
    finalizeInsight({
      id: 'comparison-summary',
      category: 'comparison',
      tone: decisive ? 'positive' : 'neutral',
      headline,
      interpretation,
      scores,
      reasoning: { evidence: [first.explanation, second.explanation].filter(Boolean) },
      symbol: first.symbol,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Simulation (Simulator page)
// ---------------------------------------------------------------------------

const RISK_KEYS: (keyof Omit<RiskResult, 'overallScore' | 'inputs'>)[] = [
  'concentrationRisk',
  'sectorRisk',
  'volatilityRisk',
  'betaRisk',
  'drawdownRisk',
  'valuationRisk',
  'earningsRisk',
  'regulatoryRisk',
  'liquidityRisk',
  'macroRisk',
  'newsRisk',
  'stalenessRisk',
];

export function assessSimulation(
  baselineRisk: RiskResult,
  hypotheticalRisk: RiskResult,
  baselineHealth: PortfolioHealthResult,
  hypotheticalHealth: PortfolioHealthResult
): Insight[] {
  const riskDelta = hypotheticalRisk.overallScore - baselineRisk.overallScore;
  const healthDelta = hypotheticalHealth.overallScore - baselineHealth.overallScore;
  if (riskDelta === 0 && healthDelta === 0) return [];

  const componentDeltas = RISK_KEYS.map((key) => ({
    label: RISK_COMPONENT_LABELS[key as string],
    delta: hypotheticalRisk[key].score - baselineRisk[key].score,
  })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const topComponent = componentDeltas[0];

  const tone: Tone = riskDelta !== 0 ? (riskDelta < 0 ? 'positive' : 'negative') : healthDelta > 0 ? 'positive' : healthDelta < 0 ? 'negative' : 'neutral';

  const parts: string[] = [];
  if (riskDelta !== 0) parts.push(`risk ${riskDelta > 0 ? 'rises' : 'falls'} ${Math.abs(riskDelta)} points`);
  if (healthDelta !== 0) parts.push(`health ${healthDelta > 0 ? 'improves' : 'declines'} ${Math.abs(healthDelta)} points`);

  const headline = `This reallocation ${parts.join(' and ')}.`;
  const interpretation =
    topComponent && Math.abs(topComponent.delta) >= 5
      ? `Primarily driven by ${topComponent.label.toLowerCase()} (${topComponent.delta > 0 ? '+' : ''}${topComponent.delta}).`
      : 'No single factor dominates the change.';

  const scores: InsightScores = {
    importance: Math.min(90, Math.abs(riskDelta) * 3 + Math.abs(healthDelta) * 3),
    confidence: 90,
    urgency: 10,
    impact: Math.min(90, Math.abs(riskDelta) * 4 + Math.abs(healthDelta) * 4),
    freshness: 100,
  };

  return [
    finalizeInsight({
      id: 'simulation-conclusion',
      category: 'simulation',
      tone,
      headline,
      interpretation,
      scores,
      reasoning: {
        portfolioImpact: `Risk ${baselineRisk.overallScore} → ${hypotheticalRisk.overallScore}/100, health ${baselineHealth.overallScore} → ${hypotheticalHealth.overallScore}/100.`,
        riskFactors: componentDeltas.filter((c) => Math.abs(c.delta) >= 5).map((c) => `${c.label} ${c.delta > 0 ? '+' : ''}${c.delta}`),
      },
    }),
  ];
}

// ---------------------------------------------------------------------------
// Timeline — "notable this period"
// ---------------------------------------------------------------------------

const QUIET_TIMELINE_TYPES = new Set(['sync', 'news']);
const TIMELINE_IMPORTANCE: Record<string, number> = {
  thesis_change: 70,
  risk_change: 65,
  recommendation: 60,
  health_change: 55,
  transaction: 50,
  conviction_change: 45,
  earnings: 40,
  news: 25,
  sync: 10,
};

export function assessTimelineNotable(entries: TimelineEntry[], limit = 3): Insight[] {
  const now = Date.now();
  const insights = entries
    .filter((e) => !QUIET_TIMELINE_TYPES.has(e.type))
    .map((e) => {
      const ageMs = now - e.timestamp.getTime();
      const importance = TIMELINE_IMPORTANCE[e.type] ?? 40;
      const scores: InsightScores = {
        importance,
        confidence: 80,
        urgency: ageMs < DAY_MS ? 50 : 20,
        impact: importance,
        freshness: freshnessFromAge(ageMs, 4),
      };
      return finalizeInsight({
        id: `timeline-${e.id}`,
        category: 'timeline_event',
        tone: TIMELINE_TYPE_TONE[e.type] ?? 'neutral',
        headline: e.title,
        interpretation: e.detail || 'No further detail recorded.',
        scores,
        reasoning: {},
        href: e.href ?? undefined,
        symbol: e.symbol ?? undefined,
      });
    });
  return sortByPriority(insights).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Today's Focus — the Home-page and Atlas-chat merge point
// ---------------------------------------------------------------------------

export interface TodaysFocusInput {
  portfolioHealth: HealthAssessmentLike | null;
  risk: RiskAssessmentLike | null;
  /** The Decision Engine's read (lib/decision/engine.ts's decisionToInsight)
   * on the single highest-priority pending recommendation's symbol —
   * replaces what used to be a shallow, Decision-Engine-unaware
   * "recommendation pending" insight generated here directly, so Home's
   * Today's Focus and the full Decision Workspace can never disagree. */
  decisionInsight?: Insight | null;
  thesisChange: ThesisChangeLike | null;
  earnings: UpcomingEarningsLike[];
  earningsWeightBySymbol?: Record<string, number>;
  usingMockData: boolean;
}

/** The single merge point for "what does Atlas think matters right now" —
 * called directly (with already-fetched data) by the Home page, and via
 * lib/intelligence/todaysFocus.ts's thin fetch-and-call wrapper by the
 * Atlas chat tool layer, so the two surfaces can never quietly diverge. */
export function buildTodaysFocusInsights(input: TodaysFocusInput): Insight[] {
  const insights: Insight[] = [
    ...assessPortfolioHealth(input.portfolioHealth),
    ...assessRisk(input.risk),
    ...(input.decisionInsight ? [input.decisionInsight] : []),
    ...assessThesisChange(input.thesisChange),
    ...assessEarnings(input.earnings, input.earningsWeightBySymbol),
    ...assessMarketContext({ usingMockData: input.usingMockData }),
  ];
  return sortByPriority(insights);
}
