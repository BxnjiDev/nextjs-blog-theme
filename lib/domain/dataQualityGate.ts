import type { CompanyFundamentals, Quote } from '@/lib/integrations';
import type { OperatingMode } from './operatingMode';

export type DataQualityStatus = 'PASS' | 'PASS_WITH_WARNINGS' | 'BLOCKED';

export interface DataQualityCheck {
  name: string;
  status: 'ok' | 'warning' | 'blocking';
  detail: string;
}

export interface DataQualityResult {
  status: DataQualityStatus;
  checks: DataQualityCheck[];
}

export interface DataQualityGateInput {
  mode: OperatingMode;
  symbol: string;
  quote: Quote | null;
  fundamentals: CompanyFundamentals | null;
  /** Most recently synced Robinhood account's lastSyncedAt, or null if
   * this account has never been synced from a real brokerage at all
   * (e.g. the seed/mock account). */
  accountLastSyncedAt: Date | null;
  newsCount: number;
  filingsCount: number;
  /** null = no forward earnings-calendar data on record for this symbol
   * at all (not merely "none upcoming soon"). */
  daysToNextEarnings: number | null;
  marketDataReliabilityPct: number | null;
  fundamentalsReliabilityPct: number | null;
}

const ACCOUNT_STALE_WARNING_HOURS = 48;
const ACCOUNT_STALE_BLOCKING_HOURS = 24 * 7;
const QUOTE_STALE_WARNING_HOURS = 24;
const RELIABILITY_WARNING_THRESHOLD_PCT = 50;

/** Recommendations generated while PASS_WITH_WARNINGS never get full
 * confidence — this is the "downgrade confidence" half of the spec's
 * "downgrade confidence or block the recommendation." A BLOCKED
 * evaluation skips generation entirely (see generateRecommendations.ts),
 * so there's no confidence to cap there. */
const WARNING_CONFIDENCE_CAP = 7;

export function applyDataQualityConfidenceCap(confidenceScore: number, status: DataQualityStatus): number {
  if (status === 'PASS_WITH_WARNINGS') return Math.min(confidenceScore, WARNING_CONFIDENCE_CAP);
  return confidenceScore;
}

/**
 * Deterministic pre-flight gate, evaluated once per symbol BEFORE
 * generateRecommendations.ts spends an AI call analyzing it (see that
 * file for the call site). BLOCKED means no Recommendation row gets
 * created for this symbol on this run at all — Atlas never manufactures a
 * recommendation just to have an answer; it may instead surface "hold
 * cash" / "no action" reasoning at the portfolio level (the daily
 * briefing), never a fabricated per-symbol thesis. Every evaluation,
 * including blocked ones, is logged to DataQualityGateLog for audit.
 */
export function evaluateDataQuality(input: DataQualityGateInput): DataQualityResult {
  const checks: DataQualityCheck[] = [];
  const isLive = input.mode === 'live-evaluation';

  // --- Quote / market-data freshness ---
  if (!input.quote) {
    checks.push({ name: 'quote', status: 'blocking', detail: 'No quote could be obtained for this symbol.' });
  } else if (input.quote.quality === 'mock') {
    checks.push({
      name: 'quote',
      status: isLive ? 'blocking' : 'ok',
      detail: isLive
        ? 'Live-evaluation mode requires real market data; quote is mock (MARKET_DATA_API_KEY not configured or provider unavailable).'
        : 'Quote is mock — expected and fine in development mode.',
    });
  } else {
    const ageHours = (Date.now() - input.quote.asOf.getTime()) / (1000 * 60 * 60);
    if (ageHours > QUOTE_STALE_WARNING_HOURS) {
      checks.push({ name: 'quote', status: 'warning', detail: `Quote is ${ageHours.toFixed(0)}h old (${input.quote.quality}).` });
    } else {
      checks.push({ name: 'quote', status: 'ok', detail: `Quote is ${input.quote.quality} and ${ageHours.toFixed(1)}h old.` });
    }
  }

  // --- Fundamentals freshness ---
  if (!input.fundamentals) {
    checks.push({ name: 'fundamentals', status: 'warning', detail: 'No fundamentals data available for this symbol — analysis will rely on price/news/technicals only.' });
  } else if (input.fundamentals.quality === 'mock') {
    checks.push({
      name: 'fundamentals',
      status: isLive ? 'blocking' : 'ok',
      detail: isLive
        ? 'Live-evaluation mode requires real fundamentals data; fundamentals are mock (FUNDAMENTALS_API_KEY not configured or provider unavailable).'
        : 'Fundamentals are mock — expected and fine in development mode.',
    });
  } else {
    checks.push({ name: 'fundamentals', status: 'ok', detail: `Fundamentals are ${input.fundamentals.quality}.` });
  }

  // --- Robinhood account freshness (live-evaluation mode only — a
  // dev-mode seed account is never expected to have a real sync) ---
  if (isLive) {
    if (!input.accountLastSyncedAt) {
      checks.push({ name: 'account_freshness', status: 'blocking', detail: 'No Robinhood sync on record for this account — cannot verify cash/holdings state.' });
    } else {
      const ageHours = (Date.now() - input.accountLastSyncedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours > ACCOUNT_STALE_BLOCKING_HOURS) {
        checks.push({ name: 'account_freshness', status: 'blocking', detail: `Account was last synced ${(ageHours / 24).toFixed(1)} days ago — too stale to trust for a live recommendation. Sync before generating recommendations.` });
      } else if (ageHours > ACCOUNT_STALE_WARNING_HOURS) {
        checks.push({ name: 'account_freshness', status: 'warning', detail: `Account was last synced ${ageHours.toFixed(0)}h ago.` });
      } else {
        checks.push({ name: 'account_freshness', status: 'ok', detail: `Account synced ${ageHours.toFixed(1)}h ago.` });
      }
    }
  } else {
    checks.push({ name: 'account_freshness', status: 'ok', detail: 'Not enforced in development mode.' });
  }

  // --- News availability — never blocks; empty is explicitly acceptable. ---
  checks.push({
    name: 'news',
    status: 'ok',
    detail: input.newsCount > 0 ? `${input.newsCount} recent article(s) available.` : 'No recent news — an empty feed is acceptable, not treated as a failure.',
  });

  // --- SEC filings — informational; EDGAR is independently available regardless of mode. ---
  checks.push({
    name: 'sec_filings',
    status: 'ok',
    detail: input.filingsCount > 0 ? `${input.filingsCount} recent filing(s) on record.` : 'No recent filings on record.',
  });

  // --- Earnings-data freshness ---
  checks.push({
    name: 'earnings_data',
    status: input.daysToNextEarnings === null ? 'warning' : 'ok',
    detail: input.daysToNextEarnings === null ? 'No earnings-calendar data on record for this symbol.' : `Next earnings in ${input.daysToNextEarnings} day(s).`,
  });

  // --- Provider reliability ---
  for (const [label, pct] of [
    ['market_data_reliability', input.marketDataReliabilityPct],
    ['fundamentals_reliability', input.fundamentalsReliabilityPct],
  ] as const) {
    if (pct !== null && pct < RELIABILITY_WARNING_THRESHOLD_PCT) {
      checks.push({ name: label, status: 'warning', detail: `Recent reliability degraded (${pct}% of the last 20 calls succeeded).` });
    } else if (pct !== null) {
      checks.push({ name: label, status: 'ok', detail: `Recent reliability ${pct}%.` });
    }
  }

  const hasBlocking = checks.some((c) => c.status === 'blocking');
  const hasWarning = checks.some((c) => c.status === 'warning');
  const status: DataQualityStatus = hasBlocking ? 'BLOCKED' : hasWarning ? 'PASS_WITH_WARNINGS' : 'PASS';

  return { status, checks };
}
