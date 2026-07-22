import { createAlertIfNew, todayKey } from '@/lib/domain/alerts';
import { getMarketMonitoringSnapshot } from '@/lib/domain/monitoring';
import type { Decision } from '@/lib/decision/types';

export interface StrategyMonitoringJobResult {
  scanned: number;
  opportunitiesFound: number;
  errors: { symbol: string; error: string }[];
  alertsCreated: number;
}

const HIGH_CONVICTION_BULLISH_ACTIONS = new Set(['INCREASE', 'INITIATE']);

function isRetestingDemandZone(decision: Decision): boolean {
  const factor = decision.reasoning.find((f) => f.key === 'supplyDemandContext');
  return !!factor?.available && factor.summary.startsWith('Revisiting a demand zone');
}

/**
 * The only alert types this job owns: surfacing a genuinely new,
 * high-quality entry setup (NEW_OPPORTUNITY) and flagging when a demand-
 * zone retest adds supporting evidence to an already-bullish call
 * (BETTER_RISK_REWARD). Risk/concentration/thesis-change alerts stay owned
 * by generateRiskAssessment.ts and generateThesis.ts — this job never
 * raises those, so there is exactly one place that ever fires each alert
 * type. Deduped per-day via dedupeKey (createAlertIfNew), matching every
 * other alert-raising job in the app — no alert fatigue from re-scanning
 * the same still-qualifying setup multiple times a day.
 */
async function raiseStrategyAlerts(entries: { symbol: string; opportunity: import('@/lib/strategy/types').EntryOpportunity }[]): Promise<number> {
  const day = todayKey();
  let created = 0;

  for (const { symbol, opportunity } of entries) {
    if (opportunity.tier === 'HIGH_CONVICTION' && HIGH_CONVICTION_BULLISH_ACTIONS.has(opportunity.decision.action)) {
      const wasCreated = await createAlertIfNew({
        type: 'NEW_OPPORTUNITY',
        severity: opportunity.priority === 'critical' ? 'URGENT' : 'WATCH',
        symbol,
        message: `${symbol}: ${opportunity.headline}`,
        evidence: opportunity.evidence.join('\n'),
        confidenceScore: Math.round(opportunity.confidence / 10),
        dedupeKey: `strategy-opportunity:${symbol}:${day}`,
      });
      if (wasCreated) created++;
    }

    if (isRetestingDemandZone(opportunity.decision) && HIGH_CONVICTION_BULLISH_ACTIONS.has(opportunity.decision.action)) {
      const wasCreated = await createAlertIfNew({
        type: 'BETTER_RISK_REWARD',
        severity: 'INFO',
        symbol,
        message: `${symbol} is revisiting a prior demand zone while the underlying call stays ${opportunity.decision.actionLabel.toLowerCase()}.`,
        confidenceScore: Math.round(opportunity.confidence / 10),
        dedupeKey: `strategy-demand-zone:${symbol}:${day}`,
      });
      if (wasCreated) created++;
    }
  }

  return created;
}

/**
 * The Strategy & Market Monitoring Engine's scheduled entry point: scans
 * the full watchlist + investment universe via lib/domain/monitoring.ts
 * (which itself only reframes lib/domain/decision.ts's existing Decision
 * output — no independent scoring), then raises alerts for the subset of
 * results that clear the brief's "meaningful event" bar. Every other
 * consumer (the /opportunities page, the scan_watchlist chat tool) reads
 * the same getMarketMonitoringSnapshot() this job calls, so nothing here
 * duplicates recommendation logic.
 */
export async function runStrategyMonitoringJob(): Promise<StrategyMonitoringJobResult> {
  const snapshot = await getMarketMonitoringSnapshot();

  const errors = snapshot.entries.filter((e) => e.error !== null).map((e) => ({ symbol: e.entry.symbol, error: e.error as string }));
  const opportunityEntries = snapshot.entries
    .filter((e): e is typeof e & { opportunity: NonNullable<(typeof e)['opportunity']> } => e.opportunity !== null)
    .map((e) => ({ symbol: e.entry.symbol, opportunity: e.opportunity }));

  const alertsCreated = await raiseStrategyAlerts(opportunityEntries);

  return {
    scanned: snapshot.entries.length,
    opportunitiesFound: snapshot.rankedOpportunities.length,
    errors,
    alertsCreated,
  };
}
