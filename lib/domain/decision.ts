import { prisma } from '@/lib/prisma';
import { getActiveAccountId, getPortfolioOverview, type PortfolioOverview } from './portfolio';
import { getPortfolioIntelligence } from './intelligence';
import { normalizeExplainability } from './legacyNormalization';
import { buildDecision, type BuildDecisionInput } from '@/lib/decision/engine';
import { buildDecisionHistory } from '@/lib/decision/history';
import type { Decision, DecisionHistoryEntry } from '@/lib/decision/types';

export interface RelatedPosition {
  symbol: string;
  name: string;
  weightPct: number;
}

export interface SymbolDecisionResult {
  decision: Decision | null;
  history: DecisionHistoryEntry[];
  relatedPositions: RelatedPosition[];
}

const NOT_YET_ASSESSED = 'Not yet assessed.';

/**
 * The single seam every surface calls through to get "what does Atlas
 * think about this symbol right now" — Home, /recommendations,
 * /intelligence/[symbol], /compare, and the Atlas Chat tool layer all
 * resolve to this one function, so no two pages can ever compute or state
 * a conflicting decision for the same symbol. Everything it reads already
 * exists (Holding, Thesis, ConvictionAssessment, ThesisChangeEvent,
 * Recommendation, RiskAssessment, EarningsEvent, NewsItem) — this function
 * only assembles it and hands it to the pure lib/decision/engine.ts.
 *
 * Pass `portfolioOverview` when the caller already has it (Home,
 * /recommendations) to avoid a second full portfolio fetch; omitted
 * callers (the standalone /intelligence/[symbol] page, the chat tool) get
 * one computed here.
 */
export async function getDecisionForSymbol(rawSymbol: string, options?: { portfolioOverview?: PortfolioOverview | null }): Promise<SymbolDecisionResult> {
  const symbol = rawSymbol.toUpperCase();
  const accountId = await getActiveAccountId();
  if (!accountId) return { decision: null, history: [], relatedPositions: [] };

  const [overview, intelligenceRows, holding, latestConvictionRow, changeEvents, nextEarnings, portfolioRiskRow] = await Promise.all([
    options && 'portfolioOverview' in options ? Promise.resolve(options.portfolioOverview ?? null) : getPortfolioOverview(),
    getPortfolioIntelligence({ symbol }),
    prisma.holding.findFirst({
      where: { symbol, accountId },
      include: { recommendations: { orderBy: { generatedAt: 'desc' }, take: 20, include: { outcome: true } } },
    }),
    prisma.convictionAssessment.findFirst({ where: { symbol }, orderBy: { generatedAt: 'desc' } }),
    prisma.thesisChangeEvent.findMany({ where: { symbol }, orderBy: { createdAt: 'desc' } }),
    prisma.earningsEvent.findFirst({ where: { symbol, isEstimate: true, reportDate: { gte: new Date() } }, orderBy: { reportDate: 'asc' } }),
    prisma.riskAssessment.findFirst({ orderBy: { generatedAt: 'desc' } }),
  ]);

  const summary = intelligenceRows[0] ?? null;
  const recommendations = holding?.recommendations ?? [];
  const latestRecommendation = recommendations[0] ?? null;

  if (!holding && !summary && recommendations.length === 0) {
    return { decision: null, history: [], relatedPositions: [] };
  }

  const holdingView = overview?.holdings.find((h) => h.symbol === symbol) ?? null;
  const isHeld = holdingView !== null || (holding !== null && Number(holding.quantity) > 0);
  const holdingWeightPct = holdingView && overview && overview.totalValue > 0 ? (holdingView.marketValue / overview.totalValue) * 100 : null;
  const sector = holdingView?.sector ?? holding?.sector ?? null;

  const explainability = latestRecommendation ? normalizeExplainability(latestRecommendation.explainability) : null;
  const daysToNextEarnings = nextEarnings ? Math.round((nextEarnings.reportDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
  const latestNews = summary?.latestNews[0] ?? null;

  const decisionInput: BuildDecisionInput = {
    symbol,
    isHeld,
    holdingWeightPct,
    sector,
    recommendation: latestRecommendation
      ? {
          id: latestRecommendation.id,
          action: latestRecommendation.action,
          confidenceScore: latestRecommendation.confidenceScore,
          generatedAt: latestRecommendation.generatedAt,
          dataQualityStatus: latestRecommendation.dataQualityStatus,
          thesis: latestRecommendation.thesis,
          bearCase: latestRecommendation.bearCase,
          catalysts: latestRecommendation.catalysts,
          risks: latestRecommendation.risks,
          technicalTrend: latestRecommendation.technicalTrend,
          explainability: explainability
            ? {
                supportingEvidence: explainability.supportingEvidence,
                invalidationConditions: explainability.invalidationConditions,
              }
            : null,
        }
      : null,
    conviction:
      summary && (summary.currentConviction !== null || summary.thesis)
        ? {
            current: summary.currentConviction,
            previous: summary.previousConviction,
            trend: summary.trend,
            valuationScore: latestConvictionRow?.valuation ?? null,
            latestChangeEvent: summary.latestChangeEvent
              ? { whatChanged: summary.latestChangeEvent.whatChanged, whyChanged: summary.latestChangeEvent.whyChanged }
              : null,
            sellConditions: summary.thesis && summary.thesis.sellConditions !== NOT_YET_ASSESSED ? summary.thesis.sellConditions : null,
          }
        : null,
    portfolioRisk: portfolioRiskRow
      ? { overallScore: portfolioRiskRow.overallScore, concentrationRisk: portfolioRiskRow.concentrationRisk, sectorRisk: portfolioRiskRow.sectorRisk }
      : null,
    daysToNextEarnings,
    latestMaterialNews: latestNews ? { headline: latestNews.headline, materialityLevel: latestNews.materialityLevel, sentiment: latestNews.sentiment } : null,
  };

  const decision = buildDecision(decisionInput);

  const history = buildDecisionHistory(
    recommendations.map((r) => ({
      id: r.id,
      action: r.action,
      confidenceScore: r.confidenceScore,
      generatedAt: r.generatedAt,
      userDecision: r.userDecision,
      outcome: r.outcome ? { wasCorrect: r.outcome.wasCorrect, return30d: r.outcome.return30d, return90d: r.outcome.return90d, alpha90d: r.outcome.alpha90d } : null,
    })),
    changeEvents.map((e) => ({ createdAt: e.createdAt, whatChanged: e.whatChanged, whyChanged: e.whyChanged }))
  );

  const relatedPositions: RelatedPosition[] = sector
    ? (overview?.holdings ?? [])
        .filter((h) => h.symbol !== symbol && h.sector === sector)
        .map((h) => ({ symbol: h.symbol, name: h.name, weightPct: overview!.totalValue > 0 ? (h.marketValue / overview!.totalValue) * 100 : 0 }))
        .sort((a, b) => b.weightPct - a.weightPct)
    : [];

  return { decision, history, relatedPositions };
}
