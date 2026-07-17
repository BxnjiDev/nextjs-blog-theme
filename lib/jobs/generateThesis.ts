import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { marketDataProvider, secFilingsProvider, aiReasoningProvider } from '@/lib/integrations';
import { getStoredNews, toNewsArticle } from '@/lib/domain/news';
import { computeConviction, type ConvictionResult } from '@/lib/domain/conviction';
import { getFundamentalHistory } from '@/lib/domain/fundamentalsHistory';
import { buildMemoryContext } from '@/lib/domain/memory';
import { createAlertIfNew } from '@/lib/domain/alerts';
import { getActiveAccountId } from '@/lib/domain/portfolio';

/** Idempotency window, same pattern as the recommendation job. */
const THESIS_REFRESH_HOURS = 20;

const RISK_CATEGORY_KEYS = ['executionRisk', 'regulatoryRisk', 'macroSensitivity'] as const;

export interface ThesisJobResult {
  processed: number;
  skipped: number;
  changed: number;
  errors: { symbol: string; error: string }[];
}

function summarizeConviction(conviction: ConvictionResult): string {
  const scored = Object.entries(conviction).filter(
    ([key, value]) => key !== 'overallScore' && key !== 'methodology' && (value as { score: number | null }).score !== null
  );
  if (scored.length === 0) return 'No conviction categories could be scored from available data.';
  return `Scored categories: ${scored.map(([key, value]) => `${key}=${(value as { score: number }).score}`).join(', ')}.`;
}

function deterministicChangeDescription(
  changeType: string,
  conviction: ConvictionResult,
  previousConvictionScore: number | null
): string {
  switch (changeType) {
    case 'CONVICTION_CHANGED':
      return `Overall conviction score moved from ${previousConvictionScore ?? 'n/a'} to ${conviction.overallScore}.`;
    case 'VALUATION_CHANGED':
      return `Valuation score is now ${conviction.valuation.score ?? 'n/a'}/100. ${conviction.valuation.explanation}`;
    case 'RISK_CHANGED':
      return `A risk-related conviction category moved materially: execution=${conviction.executionRisk.score ?? 'n/a'}, regulatory=${conviction.regulatoryRisk.score ?? 'n/a'}, macro=${conviction.macroSensitivity.score ?? 'n/a'}.`;
    default:
      return '';
  }
}

/**
 * Creates or evolves the persistent Thesis for every holding. Unlike the
 * daily recommendation job, this does NOT regenerate the thesis from
 * scratch each run: an existing thesis's narrative fields only change when
 * either the AI review judges the core reasoning has genuinely broken
 * (thesisChanged) or this is the first review (INITIAL). Purely
 * quantitative moves (conviction/valuation/risk deltas past a threshold)
 * update the conviction score and log a ThesisChangeEvent, but leave the
 * qualitative narrative untouched — "keep the thesis unchanged" unless
 * something actually changed.
 */
export async function runThesisJob(options?: { force?: boolean }): Promise<ThesisJobResult> {
  const result: ThesisJobResult = { processed: 0, skipped: 0, changed: 0, errors: [] };

  const accountId = await getActiveAccountId();
  if (!accountId) return result;
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { holdings: { include: { thesis: true } } },
  });
  if (!account) return result;

  for (const holding of account.holdings) {
    const existingThesis = holding.thesis;

    if (!options?.force && existingThesis) {
      const ageHours = (Date.now() - existingThesis.lastReviewedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours < THESIS_REFRESH_HOURS) {
        result.skipped++;
        continue;
      }
    }

    try {
      const [quote, technicals, fundamentals, filings, storedNews, history, sp500History, previousConviction, fundamentalHistory, nextEarnings] =
        await Promise.all([
          marketDataProvider.getQuote(holding.symbol),
          marketDataProvider.getTechnicals(holding.symbol),
          marketDataProvider.getFundamentals(holding.symbol),
          secFilingsProvider.getRecentFilings(holding.symbol, 5),
          getStoredNews({ symbol: holding.symbol, sinceHours: 24 * 14 }),
          marketDataProvider.getHistoricalDaily(holding.symbol, 60),
          marketDataProvider.getSp500History(60),
          prisma.convictionAssessment.findFirst({ where: { symbol: holding.symbol }, orderBy: { generatedAt: 'desc' } }),
          getFundamentalHistory(holding.symbol),
          prisma.earningsEvent.findFirst({ where: { symbol: holding.symbol, isEstimate: true }, orderBy: { reportDate: 'asc' } }),
        ]);
      const news = storedNews.map(toNewsArticle);
      const daysToNextEarnings = nextEarnings ? Math.round((nextEarnings.reportDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

      const conviction = computeConviction({
        symbol: holding.symbol,
        fundamentals,
        fundamentalHistory,
        history,
        sp500History,
        sector: holding.sector,
        daysToNextEarnings,
      });

      const memoryContext = await buildMemoryContext(holding.id, holding.symbol);

      const narrative = await aiReasoningProvider.generateThesisNarrative({
        symbol: holding.symbol,
        name: holding.name,
        sector: holding.sector,
        quote,
        technicals,
        fundamentals,
        filings,
        news,
        convictionScore: conviction.overallScore,
        convictionSummary: summarizeConviction(conviction),
        previousThesis: existingThesis
          ? {
              companyOverview: existingThesis.companyOverview,
              originalThesis: existingThesis.originalThesis,
              growthDrivers: existingThesis.growthDrivers,
              competitiveAdvantages: existingThesis.competitiveAdvantages,
              risks: existingThesis.risks,
              bullCase: existingThesis.bullCase,
              bearCase: existingThesis.bearCase,
              catalysts: existingThesis.catalysts,
              investmentHorizon: existingThesis.investmentHorizon,
              whatWouldStrengthen: existingThesis.whatWouldStrengthen,
              whatWouldWeaken: existingThesis.whatWouldWeaken,
              sellConditions: existingThesis.sellConditions,
              convictionScore: existingThesis.convictionScore,
              lastReviewedAt: existingThesis.lastReviewedAt,
            }
          : null,
        memoryContext,
      });

      // --- Determine change type: AI narrative judgment first, then deterministic deltas. ---
      let changeType:
        | 'INITIAL'
        | 'THESIS_CHANGED'
        | 'CONVICTION_CHANGED'
        | 'RISK_CHANGED'
        | 'VALUATION_CHANGED'
        | 'RETURN_EXPECTATION_CHANGED'
        | 'ROUTINE_REVIEW_NO_CHANGE';

      if (!existingThesis) {
        changeType = 'INITIAL';
      } else if (narrative.thesisChanged) {
        changeType = 'THESIS_CHANGED';
      } else {
        const valuationDelta =
          previousConviction?.valuation !== null && previousConviction?.valuation !== undefined && conviction.valuation.score !== null
            ? Math.abs(conviction.valuation.score - previousConviction.valuation)
            : null;

        let maxRiskDelta = 0;
        for (const key of RISK_CATEGORY_KEYS) {
          const prevVal = previousConviction?.[key] ?? null;
          const currVal = conviction[key].score;
          if (prevVal !== null && currVal !== null) maxRiskDelta = Math.max(maxRiskDelta, Math.abs(currVal - prevVal));
        }

        const convictionDelta = Math.abs(conviction.overallScore - existingThesis.convictionScore);

        if (valuationDelta !== null && valuationDelta >= 20) changeType = 'VALUATION_CHANGED';
        else if (maxRiskDelta >= 20) changeType = 'RISK_CHANGED';
        else if (convictionDelta >= 15) changeType = 'CONVICTION_CHANGED';
        else if (narrative.returnExpectationChanged) changeType = 'RETURN_EXPECTATION_CHANGED';
        else changeType = 'ROUTINE_REVIEW_NO_CHANGE';
      }

      const previousConvictionScoreForNote = existingThesis?.convictionScore ?? null;
      const whatChanged = narrative.whatChanged || deterministicChangeDescription(changeType, conviction, previousConvictionScoreForNote);
      const whyChanged = narrative.whyChanged || (changeType !== 'ROUTINE_REVIEW_NO_CHANGE' ? 'See evidence/sources for this review cycle.' : '');

      const evidence: Prisma.InputJsonValue = JSON.parse(
        JSON.stringify({
          convictionMethodology: conviction.methodology,
          quote: { price: quote.price, changePercent: quote.changePercent, asOf: quote.asOf, quality: quote.quality },
          filingsCount: filings.length,
          newsCount: news.length,
        })
      );
      const sources: Prisma.InputJsonValue = JSON.parse(
        JSON.stringify([
          ...filings.map((f) => ({ type: 'filing', ref: f.formType, url: f.url })),
          ...news.slice(0, 5).map((n) => ({ type: 'news', ref: n.headline, url: n.url })),
          { type: 'fundamentals', ref: fundamentals ? 'available' : 'unavailable' },
        ])
      );

      let thesisId: string;

      if (changeType === 'INITIAL') {
        const created = await prisma.thesis.create({
          data: {
            holdingId: holding.id,
            symbol: holding.symbol,
            companyOverview: narrative.companyOverview,
            originalThesis: narrative.originalThesis,
            growthDrivers: narrative.growthDrivers,
            competitiveAdvantages: narrative.competitiveAdvantages,
            risks: narrative.risks,
            bullCase: narrative.bullCase,
            bearCase: narrative.bearCase,
            catalysts: narrative.catalysts,
            investmentHorizon: narrative.investmentHorizon,
            whatWouldStrengthen: narrative.whatWouldStrengthen,
            whatWouldWeaken: narrative.whatWouldWeaken,
            sellConditions: narrative.sellConditions,
            convictionScore: conviction.overallScore,
          },
        });
        thesisId = created.id;
      } else if (changeType === 'THESIS_CHANGED') {
        const updated = await prisma.thesis.update({
          where: { id: existingThesis!.id },
          data: {
            companyOverview: narrative.companyOverview,
            originalThesis: narrative.originalThesis,
            growthDrivers: narrative.growthDrivers,
            competitiveAdvantages: narrative.competitiveAdvantages,
            risks: narrative.risks,
            bullCase: narrative.bullCase,
            bearCase: narrative.bearCase,
            catalysts: narrative.catalysts,
            investmentHorizon: narrative.investmentHorizon,
            whatWouldStrengthen: narrative.whatWouldStrengthen,
            whatWouldWeaken: narrative.whatWouldWeaken,
            sellConditions: narrative.sellConditions,
            convictionScore: conviction.overallScore,
            lastReviewedAt: new Date(),
          },
        });
        thesisId = updated.id;
      } else {
        // Quantitative-only move, or no change at all: mirror the latest
        // conviction score and reviewed timestamp, but never touch the
        // qualitative narrative fields.
        const updated = await prisma.thesis.update({
          where: { id: existingThesis!.id },
          data: { convictionScore: conviction.overallScore, lastReviewedAt: new Date() },
        });
        thesisId = updated.id;
      }

      if (changeType !== 'ROUTINE_REVIEW_NO_CHANGE') {
        const changeEvent = await prisma.thesisChangeEvent.create({
          data: {
            thesisId,
            symbol: holding.symbol,
            changeType,
            whatChanged: whatChanged || null,
            whyChanged: whyChanged || null,
            confidenceBefore: previousConvictionScoreForNote,
            confidenceAfter: conviction.overallScore,
            evidence,
            sources,
          },
        });
        result.changed++;

        // Only a genuine narrative-level thesis break is alert-worthy — a
        // quantitative-only drift (conviction/valuation/risk) is tracked in
        // the timeline but doesn't page anyone. Deduped per change event.
        if (changeType === 'THESIS_CHANGED') {
          await createAlertIfNew({
            type: 'THESIS_CHANGE',
            severity: 'WATCH',
            symbol: holding.symbol,
            message: `${holding.symbol} thesis changed: ${whatChanged || 'see thesis timeline for details.'}`,
            evidence: whyChanged || undefined,
            confidenceScore: 7,
            dedupeKey: `thesis-change:${changeEvent.id}`,
          });
        }
      }

      await prisma.convictionAssessment.create({
        data: {
          thesisId,
          symbol: holding.symbol,
          financialStrength: conviction.financialStrength.score,
          revenueGrowth: conviction.revenueGrowth.score,
          profitability: conviction.profitability.score,
          balanceSheet: conviction.balanceSheet.score,
          competitiveMoat: conviction.competitiveMoat.score,
          aiPositioning: conviction.aiPositioning.score,
          managementExecution: conviction.managementExecution.score,
          industryLeadership: conviction.industryLeadership.score,
          productInnovation: conviction.productInnovation.score,
          valuation: conviction.valuation.score,
          executionRisk: conviction.executionRisk.score,
          regulatoryRisk: conviction.regulatoryRisk.score,
          macroSensitivity: conviction.macroSensitivity.score,
          overallScore: conviction.overallScore,
          previousScore: previousConviction?.overallScore ?? null,
          methodology: JSON.parse(JSON.stringify(conviction.methodology)),
        },
      });

      result.processed++;
    } catch (err) {
      result.errors.push({ symbol: holding.symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
