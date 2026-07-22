import { createAlertIfNew, todayKey } from '@/lib/domain/alerts';
import { getMarketMonitoringSnapshot } from '@/lib/domain/monitoring';
import type { EntryOpportunity } from '@/lib/strategy/types';

export interface StrategyMonitoringJobResult {
  scanned: number;
  opportunitiesFound: number;
  errors: { symbol: string; error: string }[];
  alertsCreated: number;
}

const HIGH_CONVICTION_BULLISH_ACTIONS = new Set(['INCREASE', 'INITIATE']);
const WORKSPACE_LINK_NOTE = (symbol: string) => `See /intelligence/${symbol} for the full Decision Workspace and chart.`;

/**
 * The alert types this job owns:
 *  - NEW_OPPORTUNITY: a genuinely new, high-quality entry setup.
 *  - BETTER_RISK_REWARD: a demand-zone retest or a confirmed liquidity
 *    sweep-and-reclaim reinforcing an already-bullish call.
 *  - STALE_DATA: live/latest price data has gone stale or unavailable for
 *    one or more watchlist symbols with an active opportunity.
 *
 * Risk/concentration/thesis-change alerts stay owned by
 * generateRiskAssessment.ts and generateThesis.ts — this job never raises
 * those, so there is exactly one place that ever fires each alert type.
 *
 * Dedup strategy matters here: NEW_OPPORTUNITY and STALE_DATA are rolling
 * conditions ("is this still true today"), so they stay day-scoped like
 * every other alert-raising job. BETTER_RISK_REWARD, though, is keyed to a
 * specific demand-zone or liquidity-sweep EVENT (its formation/candle
 * timestamp and price level) rather than the calendar day — so Atlas never
 * repeats that alert while price simply sits inside the same unchanged
 * zone, but does raise a new one the moment a materially different
 * zone/sweep appears, exactly as the brief requires ("deduplicate by event
 * identity and material state change, not merely by calendar day").
 */
async function raiseStrategyAlerts(entries: { symbol: string; opportunity: EntryOpportunity }[]): Promise<number> {
  const day = todayKey();
  let created = 0;

  for (const { symbol, opportunity } of entries) {
    if (opportunity.tier === 'HIGH_CONVICTION' && HIGH_CONVICTION_BULLISH_ACTIONS.has(opportunity.decision.action)) {
      const wasCreated = await createAlertIfNew({
        type: 'NEW_OPPORTUNITY',
        severity: opportunity.priority === 'critical' ? 'URGENT' : 'WATCH',
        symbol,
        message: `${symbol}: ${opportunity.headline} ${WORKSPACE_LINK_NOTE(symbol)}`,
        evidence: opportunity.evidence.join('\n'),
        confidenceScore: Math.round(opportunity.confidence / 10),
        dedupeKey: `strategy-opportunity:${symbol}:${day}`,
      });
      if (wasCreated) created++;
    }

    const zone = opportunity.demandZoneContext;
    if (zone?.recentlyRetested && HIGH_CONVICTION_BULLISH_ACTIONS.has(opportunity.decision.action)) {
      const zoneEventKey = `${symbol}:${zone.formedAt.getTime()}:${zone.priceLevel.toFixed(2)}`;
      const wasCreated = await createAlertIfNew({
        type: 'BETTER_RISK_REWARD',
        severity: 'INFO',
        symbol,
        message: `${symbol} is revisiting a demand zone ($${zone.priceLevel.toFixed(2)}-$${zone.priceHigh.toFixed(2)}) while the underlying call stays ${opportunity.decision.actionLabel.toLowerCase()}. ${WORKSPACE_LINK_NOTE(symbol)}`,
        evidence: zone.description,
        confidenceScore: Math.round(opportunity.confidence / 10),
        dedupeKey: `strategy-demand-zone:${zoneEventKey}`,
      });
      if (wasCreated) created++;
    }

    const sweep = opportunity.liquidityContext;
    if (sweep?.classification === 'confirmed_sweep_reclaim') {
      const sweepSupportsBullish = sweep.direction === 'sell_side' && HIGH_CONVICTION_BULLISH_ACTIONS.has(opportunity.decision.action);
      const sweepSupportsBearish = sweep.direction === 'buy_side' && (opportunity.decision.action === 'REDUCE' || opportunity.decision.action === 'EXIT');
      if (sweepSupportsBullish || sweepSupportsBearish) {
        const sweepEventKey = `${symbol}:${sweep.sweepCandleTime.getTime()}:${sweep.classification}`;
        const wasCreated = await createAlertIfNew({
          type: 'BETTER_RISK_REWARD',
          severity: 'WATCH',
          symbol,
          message: `${symbol}: confirmed liquidity sweep-and-reclaim near $${sweep.sweptLevel.toFixed(2)} on the ${sweep.timeframe} timeframe. ${WORKSPACE_LINK_NOTE(symbol)}`,
          evidence: sweep.description,
          confidenceScore: Math.round(opportunity.confidence / 10),
          dedupeKey: `strategy-sweep:${sweepEventKey}`,
        });
        if (wasCreated) created++;
      }
    }
  }

  const staleSymbols = entries.filter((e) => e.opportunity.price.freshness === 'stale' || e.opportunity.price.freshness === 'unavailable').map((e) => e.symbol);
  if (staleSymbols.length > 0) {
    const wasCreated = await createAlertIfNew({
      type: 'STALE_DATA',
      severity: 'WATCH',
      message: `Live/latest price data is stale or unavailable for ${staleSymbols.length} watchlist symbol${staleSymbols.length === 1 ? '' : 's'}: ${staleSymbols.slice(0, 10).join(', ')}${staleSymbols.length > 10 ? '…' : ''}.`,
      confidenceScore: 6,
      dedupeKey: `strategy-stale-data:${day}`,
    });
    if (wasCreated) created++;
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
