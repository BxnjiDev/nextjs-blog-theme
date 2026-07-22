import { prisma } from '@/lib/prisma';
import { marketDataProvider } from '@/lib/integrations';
import { getActiveAccountId, getPortfolioOverview, type PortfolioOverview } from './portfolio';
import { getDecisionForSymbol } from './decision';
import { getCandlesForSymbol } from './candles';
import { computeTechnicalEvidence } from '@/lib/strategy/technical';
import { identifyDemandZones } from '@/lib/strategy/supplyDemand';
import { detectLiquidityEvidence } from '@/lib/strategy/liquidity';
import { buildEntryOpportunity, MAGNIFICENT_SEVEN } from '@/lib/strategy/engine';
import type { EntryOpportunity, OpportunityTier } from '@/lib/strategy/types';
import type { Decision } from '@/lib/decision/types';
import { candlesToHistoricalPricePoints, type Interval } from '@/lib/marketdata/types';

/**
 * A small, illustrative Defense/Energy set alongside MAGNIFICENT_SEVEN —
 * the brief's named long-term-focus sectors beyond Technology. Kept
 * intentionally short: this is a bootstrap starting point for continuous
 * monitoring, not full sector coverage, so a scan stays bounded in
 * provider calls even before the user holds or watches anything.
 */
const DEFENSE_ENERGY_UNIVERSE = ['LMT', 'NOC', 'RTX', 'XOM', 'CVX'];
const HISTORY_SESSIONS = 60;
/** Daily candles remain the Market Monitoring Engine's default scan
 * timeframe — the same cadence this scan has always used, now backed by
 * real OHLCV via the candle service instead of close+volume only. Symbol
 * workspaces (the chart, Decision Workspace) let the user pick any of the
 * five supported intervals; the bulk scan stays on one cheap, consistent
 * timeframe so a full watchlist pass doesn't multiply provider calls. */
const DEFAULT_SCAN_INTERVAL: Interval = '1D';

export interface WatchlistEntry {
  symbol: string;
  name: string;
  sector: string | null;
  source: 'holding' | 'opportunity' | 'universe';
}

/**
 * The union the brief calls "watchlist + investment universe": every held
 * position, every actively-tracked Opportunity row, plus the curated
 * long-term-focus core (Magnificent Seven/Technology/Defense/Energy) the
 * Long-Term Investing strategy names explicitly. Deduplicated by symbol —
 * a held/opportunity entry's real name/sector wins over the generic
 * universe entry for the same symbol.
 *
 * Pass `portfolioOverview` when the caller already has it (the Market
 * Monitoring scan below always does) to avoid a second full portfolio
 * fetch; omit it to let this resolve its own.
 */
export async function getWatchlistSymbols(portfolioOverview?: PortfolioOverview | null): Promise<WatchlistEntry[]> {
  const overview = portfolioOverview !== undefined ? portfolioOverview : await getPortfolioOverview();

  const entries = new Map<string, WatchlistEntry>();
  for (const h of overview?.holdings ?? []) {
    entries.set(h.symbol, { symbol: h.symbol, name: h.name, sector: h.sector, source: 'holding' });
  }

  const opportunities = await prisma.opportunity.findMany({
    where: { dismissedAt: null },
    select: { symbol: true, name: true },
  });
  for (const o of opportunities) {
    if (!entries.has(o.symbol)) entries.set(o.symbol, { symbol: o.symbol, name: o.name, sector: null, source: 'opportunity' });
  }

  const coreUniverse = [...MAGNIFICENT_SEVEN, ...DEFENSE_ENERGY_UNIVERSE];
  const missingCore = coreUniverse.filter((s) => !entries.has(s));
  if (missingCore.length > 0) {
    const fundamentals = await Promise.all(missingCore.map((s) => marketDataProvider.getFundamentals(s).catch(() => null)));
    missingCore.forEach((symbol, i) => {
      const f = fundamentals[i];
      entries.set(symbol, { symbol, name: f?.name ?? symbol, sector: f?.sector ?? null, source: 'universe' });
    });
  }

  return Array.from(entries.values());
}

/**
 * Derives "is there a near-term catalyst" purely from factors the Decision
 * Engine already computed (earningsTiming/newsImpact in decision.reasoning)
 * — no separate catalyst detection, so this can never disagree with what
 * the Decision Workspace itself shows for the same symbol.
 */
function hasNearCatalyst(decision: Decision): boolean {
  const earnings = decision.reasoning.find((f) => f.key === 'earningsTiming');
  if (earnings?.available && earnings.tone === 'warning') return true;
  const news = decision.reasoning.find((f) => f.key === 'newsImpact');
  if (news?.available && (news.summary.startsWith('critical') || news.summary.startsWith('high'))) return true;
  return false;
}

export interface WatchlistScanEntry {
  entry: WatchlistEntry;
  opportunity: EntryOpportunity | null;
  /** Set only when this symbol couldn't be scanned (provider failure) —
   * surfaced rather than silently dropped, so a monitoring pass always
   * accounts for every watchlist symbol. */
  error: string | null;
}

async function scanSymbol(entry: WatchlistEntry, overview: PortfolioOverview | null, benchmarkHistory: { date: Date; close: number; volume: number }[]): Promise<WatchlistScanEntry> {
  try {
    const { candles } = await getCandlesForSymbol(entry.symbol, DEFAULT_SCAN_INTERVAL, { limit: HISTORY_SESSIONS });
    const priceHistory = candlesToHistoricalPricePoints(candles);
    const technicalEvidence = computeTechnicalEvidence(priceHistory, benchmarkHistory);
    const demandZones = identifyDemandZones(candles, DEFAULT_SCAN_INTERVAL);
    const liquidityEvidence = detectLiquidityEvidence(candles, DEFAULT_SCAN_INTERVAL);

    const { decision } = await getDecisionForSymbol(entry.symbol, { portfolioOverview: overview, technicalEvidence, demandZones, liquidityEvidence });
    if (!decision) return { entry, opportunity: null, error: null };

    const latestCandle = candles[candles.length - 1] ?? null;
    const opportunity = buildEntryOpportunity(decision, entry.name, entry.sector, hasNearCatalyst(decision), {
      latestPrice: latestCandle?.close ?? null,
      priceFreshness: latestCandle?.freshness ?? 'unavailable',
      priceAsOf: latestCandle?.timestamp ?? null,
      demandZones,
      liquidityEvidence,
    });
    return { entry, opportunity, error: null };
  } catch (err) {
    return { entry, opportunity: null, error: err instanceof Error ? err.message : String(err) };
  }
}

const TIER_RANK: Record<OpportunityTier, number> = { HIGH_CONVICTION: 3, QUALIFIED: 2, POTENTIAL: 1 };
const PRIORITY_RANK: Record<EntryOpportunity['priority'], number> = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Pure ranking step, split out so it's unit-testable without any I/O —
 * strongest opportunities first, exactly as the brief's Watchlist
 * Monitoring section asks: tier, then priority, then confidence.
 */
export function rankOpportunities(opportunities: EntryOpportunity[]): EntryOpportunity[] {
  return [...opportunities].sort((a, b) => {
    if (TIER_RANK[b.tier] !== TIER_RANK[a.tier]) return TIER_RANK[b.tier] - TIER_RANK[a.tier];
    if (PRIORITY_RANK[b.priority] !== PRIORITY_RANK[a.priority]) return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    return b.confidence - a.confidence;
  });
}

export interface MarketMonitoringSnapshot {
  scannedAt: Date;
  entries: WatchlistScanEntry[];
  /** Ranked, actionable opportunities only (NO_ACTION and failed scans
   * excluded) — the surface every consumer (the /opportunities page, the
   * scan_watchlist chat tool, the future alert job) should read from. */
  rankedOpportunities: EntryOpportunity[];
}

/**
 * The Market Monitoring Engine's single entry point: continuously
 * evaluates the watchlist + investment universe and returns every symbol's
 * current opportunity framing, ranked strongest-first. Every opportunity
 * here is built from lib/domain/decision.ts's getDecisionForSymbol — there
 * is no independent scoring path, so a symbol's ranking here always agrees
 * with its own Decision Workspace page.
 */
/**
 * Ad-hoc single-symbol version of the same scan getMarketMonitoringSnapshot
 * runs across the whole watchlist — reuses scanSymbol so a symbol the chat
 * asks about (whether or not it's already on the watchlist) gets exactly
 * the same Entry Opportunity framing get_decision/scan_watchlist would show
 * for it, never a second opportunity-building path. Falls back to a
 * synthetic universe-sourced WatchlistEntry when the symbol isn't already
 * held, tracked, or in the curated core.
 */
export async function getEntryOpportunityForSymbol(rawSymbol: string): Promise<WatchlistScanEntry> {
  const symbol = rawSymbol.toUpperCase();
  const accountId = await getActiveAccountId();
  const overview = accountId ? await getPortfolioOverview() : null;

  const [watchlist, benchmarkHistory] = await Promise.all([getWatchlistSymbols(overview), marketDataProvider.getSp500History(HISTORY_SESSIONS)]);
  let entry = watchlist.find((w) => w.symbol === symbol);
  if (!entry) {
    const fundamentals = await marketDataProvider.getFundamentals(symbol).catch(() => null);
    entry = { symbol, name: fundamentals?.name ?? symbol, sector: fundamentals?.sector ?? null, source: 'universe' };
  }

  return scanSymbol(entry, overview, benchmarkHistory);
}

export async function getMarketMonitoringSnapshot(): Promise<MarketMonitoringSnapshot> {
  const accountId = await getActiveAccountId();
  const overview = accountId ? await getPortfolioOverview() : null;

  const [watchlist, benchmarkHistory] = await Promise.all([getWatchlistSymbols(overview), marketDataProvider.getSp500History(HISTORY_SESSIONS)]);

  const entries = await Promise.all(watchlist.map((w) => scanSymbol(w, overview, benchmarkHistory)));
  const rankedOpportunities = rankOpportunities(
    entries.map((e) => e.opportunity).filter((o): o is EntryOpportunity => o !== null)
  );

  return { scannedAt: new Date(), entries, rankedOpportunities };
}
