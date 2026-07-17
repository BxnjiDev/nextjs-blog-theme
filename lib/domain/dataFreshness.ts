import { prisma } from '@/lib/prisma';

export type Staleness = 'fresh' | 'aging' | 'stale' | 'unknown';

export interface DataSourceFreshness {
  provider: string;
  label: string;
  configured: boolean;
  lastUpdated: Date | null;
  staleness: Staleness;
  /** % of recent logged calls that succeeded (real or fell back cleanly) —
   * null until lib/integrations/retry.ts has logged at least one call. */
  reliabilityPct: number | null;
  avgLatencyMs: number | null;
}

const STALE_AFTER_HOURS = 24;
const AGING_AFTER_HOURS = 6;

function classifyStaleness(lastUpdated: Date | null): Staleness {
  if (!lastUpdated) return 'unknown';
  const ageHours = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);
  if (ageHours >= STALE_AFTER_HOURS) return 'stale';
  if (ageHours >= AGING_AFTER_HOURS) return 'aging';
  return 'fresh';
}

/** Recent-window reliability/latency from ProviderCallLog — the same
 * table lib/integrations/retry.ts writes to on every real provider call.
 * Returns nulls (not zeros) when nothing has been logged yet, so "no data"
 * is never confused with "0% reliable." */
export async function callStats(provider: string): Promise<{ reliabilityPct: number | null; avgLatencyMs: number | null }> {
  const recent = await prisma.providerCallLog.findMany({
    where: { provider },
    orderBy: { calledAt: 'desc' },
    take: 20,
  });
  if (recent.length === 0) return { reliabilityPct: null, avgLatencyMs: null };
  const successCount = recent.filter((r) => r.outcome !== 'FAILURE').length;
  const avgLatencyMs = Math.round(recent.reduce((s, r) => s + r.latencyMs, 0) / recent.length);
  return { reliabilityPct: Math.round((successCount / recent.length) * 100), avgLatencyMs };
}

/**
 * One freshness/health snapshot per real data source Atlas depends on.
 * `lastUpdated` reuses the same "latest row" queries /connections already
 * ran ad hoc — centralized here so both /connections and the Investment
 * Memo page (FreshnessStrip) read one shared implementation instead of
 * duplicating the query logic.
 */
export async function getDataFreshnessSnapshot(): Promise<DataSourceFreshness[]> {
  const [latestQuoteHolding, latestNews, latestFundamentals, latestFiling, latestThesisReview] = await Promise.all([
    prisma.holding.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    prisma.newsItem.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.fundamentalSnapshot.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.alert.findFirst({ where: { type: 'NEW_SEC_FILING' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.thesis.findFirst({ orderBy: { lastReviewedAt: 'desc' }, select: { lastReviewedAt: true } }),
  ]);

  const sources: Array<{ provider: string; label: string; configured: boolean; lastUpdated: Date | null }> = [
    { provider: 'twelvedata', label: 'Market data (Twelve Data)', configured: Boolean(process.env.MARKET_DATA_API_KEY), lastUpdated: latestQuoteHolding?.updatedAt ?? null },
    { provider: 'finnhub', label: 'Financial news (Finnhub)', configured: Boolean(process.env.NEWS_API_KEY), lastUpdated: latestNews?.createdAt ?? null },
    { provider: 'financialmodelingprep', label: 'Fundamentals (Financial Modeling Prep)', configured: Boolean(process.env.FUNDAMENTALS_API_KEY), lastUpdated: latestFundamentals?.createdAt ?? null },
    { provider: 'sec-edgar', label: 'SEC EDGAR filings', configured: true, lastUpdated: latestFiling?.createdAt ?? null },
    { provider: 'claude', label: 'AI reasoning (Claude)', configured: Boolean(process.env.ANTHROPIC_API_KEY), lastUpdated: latestThesisReview?.lastReviewedAt ?? null },
  ];

  return Promise.all(
    sources.map(async (s) => {
      const stats = await callStats(s.provider);
      return {
        provider: s.provider,
        label: s.label,
        configured: s.configured,
        lastUpdated: s.lastUpdated,
        staleness: classifyStaleness(s.lastUpdated),
        ...stats,
      };
    })
  );
}

/** Keeps ProviderCallLog from growing without bound — this table is
 * telemetry, not history worth preserving indefinitely, so it's pruned as
 * one more step in the existing weekly learning job (/api/jobs/learning)
 * rather than getting its own cron entry. */
export async function pruneOldProviderCallLogs(olderThanDays = 14): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await prisma.providerCallLog.deleteMany({ where: { calledAt: { lt: cutoff } } });
  return result.count;
}
