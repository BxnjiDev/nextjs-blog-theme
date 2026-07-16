import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { fundamentalsProvider } from '@/lib/integrations';
import { createAlertIfNew, todayKey } from '@/lib/domain/alerts';

const SURPRISE_ALERT_THRESHOLD_PCT = 10;
const UPCOMING_WINDOW_DAYS = 7;

export interface EarningsIngestResult {
  symbolsProcessed: number;
  eventsUpserted: number;
  surpriseAlerts: number;
  upcomingAlerts: number;
  guidanceAlerts: number;
  errors: { symbol: string; error: string }[];
}

function surprisePct(estimate: number | null, actual: number | null): number | null {
  if (estimate === null || actual === null || estimate === 0) return null;
  return (actual - estimate) / Math.abs(estimate);
}

/**
 * Ingests the forward + historical earnings calendar per holding. Each
 * fiscal-period event is one real-world occurrence, not a time series, so
 * it's upserted in place by (symbol, fiscalYear, fiscalPeriod) — the row
 * transitions from isEstimate=true to false as the actual report lands.
 * Estimate changes observed across runs are appended to `estimateRevisions`
 * so revision history survives even though the row itself is mutable.
 */
export async function runEarningsIngestJob(): Promise<EarningsIngestResult> {
  const result: EarningsIngestResult = {
    symbolsProcessed: 0,
    eventsUpserted: 0,
    surpriseAlerts: 0,
    upcomingAlerts: 0,
    guidanceAlerts: 0,
    errors: [],
  };

  const account = await prisma.account.findFirst({ include: { holdings: true }, orderBy: { createdAt: 'asc' } });
  if (!account) return result;

  const day = todayKey();

  for (const holding of account.holdings) {
    try {
      const events = await fundamentalsProvider.getEarningsCalendar(holding.symbol);

      for (const e of events) {
        const existing = await prisma.earningsEvent.findUnique({
          where: { symbol_fiscalYear_fiscalPeriod: { symbol: e.symbol, fiscalYear: e.fiscalYear, fiscalPeriod: e.fiscalPeriod } },
        });

        const epsSurprisePct = e.isEstimate ? null : surprisePct(e.epsEstimate, e.epsActual);
        const revenueSurprisePct = e.isEstimate ? null : surprisePct(e.revenueEstimate, e.revenueActual);

        const revisions: Array<Record<string, unknown>> = Array.isArray(existing?.estimateRevisions)
          ? (existing!.estimateRevisions as Array<Record<string, unknown>>)
          : [];
        const estimateMoved =
          existing && existing.epsEstimate !== null && e.epsEstimate !== null && Math.abs(existing.epsEstimate - e.epsEstimate) > 1e-9;
        if (estimateMoved) {
          revisions.push({
            observedAt: new Date().toISOString(),
            previousEpsEstimate: existing!.epsEstimate,
            newEpsEstimate: e.epsEstimate,
          });
        }

        await prisma.earningsEvent.upsert({
          where: { symbol_fiscalYear_fiscalPeriod: { symbol: e.symbol, fiscalYear: e.fiscalYear, fiscalPeriod: e.fiscalPeriod } },
          create: {
            symbol: e.symbol,
            fiscalYear: e.fiscalYear,
            fiscalPeriod: e.fiscalPeriod,
            reportDate: e.reportDate,
            isEstimate: e.isEstimate,
            epsEstimate: e.epsEstimate,
            epsActual: e.epsActual,
            epsSurprisePct,
            revenueEstimate: e.revenueEstimate,
            revenueActual: e.revenueActual,
            revenueSurprisePct,
            guidanceNote: e.guidanceNote,
            callDate: e.callDate,
            estimateRevisions: [],
          },
          update: {
            reportDate: e.reportDate,
            isEstimate: e.isEstimate,
            epsEstimate: e.epsEstimate,
            epsActual: e.epsActual,
            epsSurprisePct,
            revenueEstimate: e.revenueEstimate,
            revenueActual: e.revenueActual,
            revenueSurprisePct,
            guidanceNote: e.guidanceNote,
            callDate: e.callDate,
            estimateRevisions: revisions as unknown as Prisma.InputJsonValue,
          },
        });
        result.eventsUpserted++;

        // Earnings surprise: only when the actual just landed this run
        // (existing was still an estimate, new row is not).
        if (existing?.isEstimate && !e.isEstimate && epsSurprisePct !== null && Math.abs(epsSurprisePct * 100) >= SURPRISE_ALERT_THRESHOLD_PCT) {
          const created = await createAlertIfNew({
            type: 'EARNINGS_SURPRISE',
            severity: Math.abs(epsSurprisePct * 100) >= 25 ? 'URGENT' : 'WATCH',
            symbol: e.symbol,
            message: `${e.symbol} reported EPS ${(epsSurprisePct * 100).toFixed(1)}% ${epsSurprisePct > 0 ? 'above' : 'below'} estimate for ${e.fiscalPeriod} FY${e.fiscalYear}.`,
            evidence: `Estimate ${e.epsEstimate ?? 'n/a'}, actual ${e.epsActual ?? 'n/a'}.`,
            confidenceScore: 9,
            dedupeKey: `earnings-surprise:${e.symbol}:${e.fiscalYear}:${e.fiscalPeriod}`,
          });
          if (created) result.surpriseAlerts++;
        }

        // Upcoming earnings: real calendar date, not the days-since-filing proxy.
        if (e.isEstimate) {
          const daysAway = Math.round((e.reportDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (daysAway >= 0 && daysAway <= UPCOMING_WINDOW_DAYS) {
            const created = await createAlertIfNew({
              type: 'UPCOMING_EARNINGS',
              severity: daysAway <= 2 ? 'WATCH' : 'INFO',
              symbol: e.symbol,
              message: `${e.symbol} reports ${e.fiscalPeriod} FY${e.fiscalYear} earnings in ${daysAway} day(s) (${e.reportDate.toISOString().slice(0, 10)}).`,
              evidence: e.epsEstimate !== null ? `Street EPS estimate: ${e.epsEstimate}.` : undefined,
              confidenceScore: 8,
              dedupeKey: `upcoming-earnings:${e.symbol}:${e.reportDate.toISOString().slice(0, 10)}`,
            });
            if (created) result.upcomingAlerts++;
          }
        }

        // Guidance change: only when the note is non-empty and differs from what was on record.
        if (e.guidanceNote && e.guidanceNote !== existing?.guidanceNote) {
          const created = await createAlertIfNew({
            type: 'GUIDANCE_CHANGE',
            severity: 'WATCH',
            symbol: e.symbol,
            message: `${e.symbol} guidance update for ${e.fiscalPeriod} FY${e.fiscalYear}: ${e.guidanceNote}`,
            confidenceScore: 7,
            dedupeKey: `guidance-change:${e.symbol}:${e.fiscalYear}:${e.fiscalPeriod}:${day}`,
          });
          if (created) result.guidanceAlerts++;
        }
      }

      result.symbolsProcessed++;
    } catch (err) {
      result.errors.push({ symbol: holding.symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
