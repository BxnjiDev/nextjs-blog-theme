/**
 * Read-boundary normalization for JSON columns whose shape has grown across
 * phases (Phase 3.6's "Investment Memo" fields on Recommendation.explainability,
 * Phase 3.6's briefing summary fields, Phase 3.7's data-quality checks).
 * `JSON.stringify` drops `undefined` keys entirely, so an older row simply
 * doesn't have a key at all — not `null`, absent. Every function here takes
 * whatever Prisma hands back for a Json/Json? column (which could be `null`,
 * `undefined`, an empty object, a partial object missing newer keys, or in
 * principle anything since Json columns aren't statically typed) and returns
 * a fully-populated shape so call sites never need defensive `?.`/`??`
 * scattered through JSX. Pure functions — no I/O — so they're unit-testable
 * without a database.
 */

export interface ReturnMetricShape {
  available: boolean;
  returnPercent?: number;
  vsSp500Percent?: number;
  note?: string;
}

export interface PortfolioSummaryShape {
  totalValue: number | null;
  cashBalance: number | null;
  capitalDeployed: number | null;
  dayChangeValue: number | null;
  dayChangePercent: number | null;
  sp500Level: number | null;
  largestWinner: { symbol: string; changePercent: number } | null;
  largestLoser: { symbol: string; changePercent: number } | null;
  performance: { daily: ReturnMetricShape; weekly: ReturnMetricShape; monthly: ReturnMetricShape };
  recommendedActions: Array<{ symbol: string; action: string | null; confidenceScore: number | null }>;
  convictionHighlights: Array<{ symbol: string; convictionScore: number; lastReviewedAt: string }>;
  materialRisks: { overallScore: number; previousScore: number | null; notes: string | null } | null;
  portfolioHealth: { overallScore: number; previousScore: number | null; topConcerns: string[] } | null;
  biggestOpportunities: Array<{ symbol: string; name: string; category: string; confidenceScore: number; comparedTo: string | null; overallEdge: string | null }>;
  thesisChangesSinceYesterday: Array<{ symbol: string; changeType: string; whatChanged: string | null; createdAt: string }>;
  changesSinceYesterday: { previousDate: string; totalValueDelta: number | null; healthScoreDelta: number | null; riskScoreDelta: number | null; newThesisChanges: number } | null;
  whatAtlasWouldDoToday: string[];
  whatAtlasWouldAvoidToday: string[];
}

/** Briefings generated before Phase 3.6 don't have these fields in their
 * stored JSON at all. Defaulted here, once, rather than optional-chaining
 * every call site, so an old row renders instead of crashing on
 * `undefined.length` / `formatCurrency(undefined)`. */
export function normalizeBriefingPortfolioSummary(raw: unknown): PortfolioSummaryShape {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<PortfolioSummaryShape>;
  return {
    totalValue: r.totalValue ?? null,
    cashBalance: r.cashBalance ?? null,
    capitalDeployed: r.capitalDeployed ?? null,
    dayChangeValue: r.dayChangeValue ?? null,
    dayChangePercent: r.dayChangePercent ?? null,
    sp500Level: r.sp500Level ?? null,
    largestWinner: r.largestWinner ?? null,
    largestLoser: r.largestLoser ?? null,
    performance: r.performance ?? {
      daily: { available: false },
      weekly: { available: false },
      monthly: { available: false },
    },
    recommendedActions: r.recommendedActions ?? [],
    convictionHighlights: r.convictionHighlights ?? [],
    materialRisks: r.materialRisks ?? null,
    portfolioHealth: r.portfolioHealth ?? null,
    biggestOpportunities: r.biggestOpportunities ?? [],
    thesisChangesSinceYesterday: r.thesisChangesSinceYesterday ?? [],
    changesSinceYesterday: r.changesSinceYesterday ?? null,
    whatAtlasWouldDoToday: r.whatAtlasWouldDoToday ?? [],
    whatAtlasWouldAvoidToday: r.whatAtlasWouldAvoidToday ?? [],
  };
}

export interface PortfolioNewsItemShape {
  symbol: string | null;
  headline: string;
  source: string;
  url: string | null;
  publishedAt: string;
  materialityLevel: string;
  whyItMatters: string;
}

export interface MarketRecapShape {
  portfolioNews: PortfolioNewsItemShape[];
  upcomingEvents: Array<{
    symbol: string;
    mostRecentFiling: { formType: string; filedAt: string; url: string } | null;
    nextEarnings: { reportDate: string; daysAway: number; epsEstimate: number | null; fiscalPeriod: string; fiscalYear: number } | null;
  }>;
  notes: string[];
}

/** Same reasoning as normalizeBriefingPortfolioSummary — marketRecap's shape
 * has been stable since Phase 2, but a briefing row from a partial/failed
 * job run, or a hand-edited seed, could still be missing a key here. */
export function normalizeBriefingMarketRecap(raw: unknown): MarketRecapShape {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<MarketRecapShape>;
  return {
    portfolioNews: Array.isArray(r.portfolioNews) ? r.portfolioNews : [],
    upcomingEvents: Array.isArray(r.upcomingEvents) ? r.upcomingEvents : [],
    notes: Array.isArray(r.notes) ? r.notes : [],
  };
}

export interface ExplainabilityShape {
  whyNow: string;
  whyNot: string;
  supportingEvidence: string;
  contradictingEvidence: string;
  keyAssumptions: string;
  invalidationConditions: string;
  vsCashAndSpy: string;
  vsCurrentAllocation: string;
  baseCase: string;
  primaryCatalyst: string;
  biggestUnknown: string;
  biggestRisk: string;
  whyConfidenceNotHigher: string;
  portfolioImpact: string;
  opportunityCost: string;
}

const EXPLAINABILITY_NOT_ASSESSED = 'Not assessed.';

/** Recommendation.explainability grew from a 7-field shape (Phase 3) to a
 * 15-field one (Phase 3.6's Investment Memo). A pre-3.6 row has the object
 * but only the original 7 keys — every newer key defaults to a labeled
 * placeholder rather than rendering blank or `undefined`. Returns `null`
 * only when there's no explainability at all (never generated for this
 * recommendation), which callers should treat as "not available" rather
 * than rendering an empty card. */
export function normalizeExplainability(raw: unknown): ExplainabilityShape | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ExplainabilityShape>;
  return {
    whyNow: r.whyNow ?? EXPLAINABILITY_NOT_ASSESSED,
    whyNot: r.whyNot ?? EXPLAINABILITY_NOT_ASSESSED,
    supportingEvidence: r.supportingEvidence ?? EXPLAINABILITY_NOT_ASSESSED,
    contradictingEvidence: r.contradictingEvidence ?? EXPLAINABILITY_NOT_ASSESSED,
    keyAssumptions: r.keyAssumptions ?? EXPLAINABILITY_NOT_ASSESSED,
    invalidationConditions: r.invalidationConditions ?? EXPLAINABILITY_NOT_ASSESSED,
    vsCashAndSpy: r.vsCashAndSpy ?? EXPLAINABILITY_NOT_ASSESSED,
    vsCurrentAllocation: r.vsCurrentAllocation ?? EXPLAINABILITY_NOT_ASSESSED,
    baseCase: r.baseCase ?? EXPLAINABILITY_NOT_ASSESSED,
    primaryCatalyst: r.primaryCatalyst ?? EXPLAINABILITY_NOT_ASSESSED,
    biggestUnknown: r.biggestUnknown ?? EXPLAINABILITY_NOT_ASSESSED,
    biggestRisk: r.biggestRisk ?? EXPLAINABILITY_NOT_ASSESSED,
    whyConfidenceNotHigher: r.whyConfidenceNotHigher ?? EXPLAINABILITY_NOT_ASSESSED,
    portfolioImpact: r.portfolioImpact ?? EXPLAINABILITY_NOT_ASSESSED,
    opportunityCost: r.opportunityCost ?? EXPLAINABILITY_NOT_ASSESSED,
  };
}

export interface DataQualityCheckShape {
  name: string;
  status: 'ok' | 'warning' | 'blocking';
  detail: string;
}

/** Recommendation.dataQualityChecks is a Phase 3.7 field — every row
 * generated before this phase has it as `null`/absent, never an array with
 * missing entries, but this stays defensive against any malformed value
 * rather than assuming the array (or its entries) are well-formed. */
export function normalizeDataQualityChecks(raw: unknown): DataQualityCheckShape[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      name: typeof c.name === 'string' ? c.name : 'unknown',
      status: c.status === 'ok' || c.status === 'warning' || c.status === 'blocking' ? c.status : 'warning',
      detail: typeof c.detail === 'string' ? c.detail : '',
    }));
}
