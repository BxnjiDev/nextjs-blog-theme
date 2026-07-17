import { prisma } from '@/lib/prisma';
import { marketDataProvider, secFilingsProvider, aiReasoningProvider } from '@/lib/integrations';
import { getStoredNews, toNewsArticle } from '@/lib/domain/news';
import { buildMemoryContext } from '@/lib/domain/memory';
import { getPortfolioOverview, getActiveAccountId } from '@/lib/domain/portfolio';
import { computeProposedPosition } from '@/lib/domain/positionSizing';
import { annualizedVolatility } from '@/lib/domain/risk';
import { computeSectorWeights, computeOpportunityCost, computePortfolioImpact } from '@/lib/domain/investmentMemo';
import { evaluateDataQuality, applyDataQualityConfidenceCap } from '@/lib/domain/dataQualityGate';
import { getOperatingMode } from '@/lib/domain/operatingMode';
import { callStats } from '@/lib/domain/dataFreshness';

/** Idempotency window: re-running the job within this many hours of the last
 * analysis for a holding is a no-op for that holding, so a retried or
 * overlapping cron firing never produces duplicate Recommendation rows. */
const RECOMMENDATION_REFRESH_HOURS = 20;

export interface RecommendationJobResult {
  processed: number;
  skipped: number;
  /** Data-quality gate BLOCKED this symbol — no Recommendation row was
   * created for it this run (see lib/domain/dataQualityGate.ts and
   * DataQualityGateLog for why). */
  blocked: number;
  errors: { symbol: string; error: string }[];
}

export async function runRecommendationJob(options?: { force?: boolean }): Promise<RecommendationJobResult> {
  const result: RecommendationJobResult = { processed: 0, skipped: 0, blocked: 0, errors: [] };

  const accountId = await getActiveAccountId();
  if (!accountId) return result;
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      holdings: {
        include: { recommendations: { orderBy: { generatedAt: 'desc' }, take: 1 } },
      },
    },
  });
  if (!account) return result;

  // Fetched once per job run (not per holding) — cash/total value, SPY's
  // recent behavior, provider reliability, and pending commitments are all
  // portfolio/account-wide facts, not per-symbol ones.
  const mode = getOperatingMode();
  const [overview, sp500History, marketDataStats, fundamentalsStats, pendingManualExecutions, openBuyOrders] = await Promise.all([
    getPortfolioOverview(),
    marketDataProvider.getSp500History(60),
    callStats('twelvedata'),
    callStats('financialmodelingprep'),
    prisma.manualExecution.findMany({ where: { accountId, side: 'BUY', matchStatus: 'PENDING' }, select: { dollarAmount: true } }),
    prisma.openOrder.findMany({ where: { accountId, side: 'BUY' }, select: { quantity: true, limitPrice: true, stopPrice: true } }),
  ]);
  const spyAsc = [...sp500History].sort((a, b) => a.date.getTime() - b.date.getTime());
  const spyRecentReturnPct =
    spyAsc.length >= 2 && spyAsc[0].close > 0 ? ((spyAsc[spyAsc.length - 1].close - spyAsc[0].close) / spyAsc[0].close) * 100 : null;
  // Capital already spoken for but not yet reflected in synced cash/
  // holdings: still-PENDING (unreconciled) manual BUYs, plus open BUY
  // orders priced off their limit/stop (a bare MARKET order with neither
  // has no knowable dollar amount here — excluded rather than guessed).
  const pendingCommittedDollarAmount =
    pendingManualExecutions.reduce((sum, m) => sum + Number(m.dollarAmount), 0) +
    openBuyOrders.reduce((sum, o) => {
      const price = o.limitPrice ?? o.stopPrice;
      return price ? sum + Number(o.quantity) * Number(price) : sum;
    }, 0);
  const spyVolatility = annualizedVolatility(sp500History); // decimal, e.g. 0.18 = 18%
  const spyAnnualizedVolatilityPct = spyVolatility !== null ? spyVolatility * 100 : null;
  const sectorWeightsPct = overview ? computeSectorWeights(overview) : {};
  const latestRisk = await prisma.riskAssessment.findFirst({ orderBy: { generatedAt: 'desc' }, select: { concentrationRisk: true } });

  for (const holding of account.holdings) {
    const previous = holding.recommendations[0];

    if (!options?.force && previous) {
      const ageHours = (Date.now() - previous.generatedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours < RECOMMENDATION_REFRESH_HOURS) {
        result.skipped++;
        continue;
      }
    }

    try {
      const [quote, technicals, fundamentals, filings, storedNews, memoryContext, nextEarnings] = await Promise.all([
        marketDataProvider.getQuote(holding.symbol),
        marketDataProvider.getTechnicals(holding.symbol),
        marketDataProvider.getFundamentals(holding.symbol),
        secFilingsProvider.getRecentFilings(holding.symbol, 5),
        getStoredNews({ symbol: holding.symbol, sinceHours: 24 * 7 }),
        buildMemoryContext(holding.id, holding.symbol),
        prisma.earningsEvent.findFirst({ where: { symbol: holding.symbol, isEstimate: true }, orderBy: { reportDate: 'asc' } }),
      ]);
      const news = storedNews.map(toNewsArticle);
      const daysToNextEarnings = nextEarnings ? Math.round((nextEarnings.reportDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

      // --- Data-quality gate (Phase 3.7): evaluated BEFORE spending an AI
      // call, and logged either way — a BLOCKED verdict means no
      // Recommendation row is created for this symbol on this run at all,
      // never a fabricated one. ---
      const gate = evaluateDataQuality({
        mode,
        symbol: holding.symbol,
        quote,
        fundamentals,
        accountLastSyncedAt: account.lastSyncedAt,
        newsCount: news.length,
        filingsCount: filings.length,
        daysToNextEarnings,
        marketDataReliabilityPct: marketDataStats.reliabilityPct,
        fundamentalsReliabilityPct: fundamentalsStats.reliabilityPct,
      });
      await prisma.dataQualityGateLog.create({
        data: {
          symbol: holding.symbol,
          accountId,
          status: gate.status,
          checks: JSON.parse(JSON.stringify(gate.checks)),
        },
      });
      if (gate.status === 'BLOCKED') {
        result.blocked++;
        continue;
      }

      const analysis = await aiReasoningProvider.analyzeHolding({
        symbol: holding.symbol,
        name: holding.name,
        quantity: Number(holding.quantity),
        avgCostBasis: Number(holding.avgCostBasis),
        quote,
        technicals,
        fundamentals,
        filings,
        news,
        previousRecommendation: previous
          ? { thesis: previous.thesis, action: previous.action, generatedAt: previous.generatedAt }
          : null,
        memoryContext,
        portfolioContext: {
          cashBalance: overview?.cashBalance ?? 0,
          totalPortfolioValue: overview?.totalValue ?? 0,
          spyRecentReturnPct,
          spyAnnualizedVolatilityPct,
          sectorWeightsPct,
          thisSymbolSector: holding.sector,
          thisSymbolCurrentWeightPct: overview?.totalValue
            ? ((overview.holdings.find((h) => h.symbol === holding.symbol)?.marketValue ?? 0) / overview.totalValue) * 100
            : 0,
        },
      });

      // Missing/degraded inputs (PASS_WITH_WARNINGS) cap confidence rather
      // than block outright — the "downgrade confidence" half of the
      // data-quality gate (lib/domain/dataQualityGate.ts). Position sizing
      // scales off confidence, so this also shrinks the proposed size.
      const cappedConfidenceScore = applyDataQualityConfidenceCap(analysis.confidenceScore, gate.status);

      const currentPositionMarketValue = overview?.holdings.find((h) => h.symbol === holding.symbol)?.marketValue ?? Number(holding.quantity) * quote.price;
      const sizing = computeProposedPosition({
        action: analysis.action,
        confidenceScore: cappedConfidenceScore,
        cashBalance: overview?.cashBalance ?? 0,
        totalPortfolioValue: overview?.totalValue ?? 0,
        currentPositionMarketValue,
        isEvaluationAccount: account.isEvaluationAccount,
        pendingCommittedDollarAmount,
      });

      // Deterministic memo fields — computed in code, never by Claude —
      // merged into the same explainability blob the AI-authored fields
      // live in.
      const explainabilityWithDeterministicFields = {
        ...analysis.explainability,
        portfolioImpact: computePortfolioImpact({
          action: analysis.action,
          proposedDollarAmount: sizing.proposedDollarAmount,
          currentPositionMarketValue,
          totalPortfolioValue: overview?.totalValue ?? 0,
          latestConcentrationRisk: latestRisk?.concentrationRisk ?? null,
        }),
        opportunityCost: computeOpportunityCost(sizing.proposedDollarAmount, spyRecentReturnPct),
      };

      await prisma.recommendation.create({
        data: {
          holdingId: holding.id,
          symbol: holding.symbol,
          thesis: analysis.thesis,
          thesisChanged: analysis.thesisChanged,
          bullCase: analysis.bullCase,
          bearCase: analysis.bearCase,
          catalysts: analysis.catalysts,
          risks: analysis.risks,
          fairValueOpinion: analysis.fairValueOpinion,
          technicalTrend: analysis.technicalTrend,
          institutionalSentiment: analysis.institutionalSentiment,
          confidenceScore: cappedConfidenceScore,
          action: analysis.action,
          expectedOutcome: analysis.expectedOutcome,
          expectedTimeHorizon: analysis.expectedTimeHorizon,
          explainability: JSON.parse(JSON.stringify(explainabilityWithDeterministicFields)),
          proposedDollarAmount: sizing.proposedDollarAmount,
          percentageOfPortfolio: sizing.percentageOfPortfolio,
          previousId: previous?.id,
          dataQualityStatus: gate.status,
          dataQualityChecks: JSON.parse(JSON.stringify(gate.checks)),
          sourcesMeta: {
            quoteAsOf: quote.asOf.toISOString(),
            quoteQuality: quote.quality,
            technicalsQuality: technicals.quality,
            fundamentalsAvailable: Boolean(fundamentals),
            fundamentalsQuality: fundamentals?.quality ?? null,
            filingsCount: filings.length,
            newsCount: news.length,
            generatedAt: new Date().toISOString(),
          },
        },
      });

      result.processed++;
    } catch (err) {
      result.errors.push({ symbol: holding.symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
