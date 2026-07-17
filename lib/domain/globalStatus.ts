import { prisma } from '@/lib/prisma';
import { getDataFreshnessSnapshot, type DataSourceFreshness } from './dataFreshness';
import { getOperatingMode, type OperatingMode } from './operatingMode';

export interface GlobalStatus {
  mode: OperatingMode;
  marketData: DataSourceFreshness;
  fundamentals: DataSourceFreshness;
  news: DataSourceFreshness;
  robinhoodSync: { lastSyncedAt: Date | null; success: boolean | null; ageHours: number | null };
  /** Proxy for "last successful full intelligence run": the daily
   * briefing is deliberately generated last in the post-sync pipeline's
   * dependency order (see accountSyncPipeline.ts) — a briefing existing
   * means everything upstream of it completed. Once the scheduler
   * (lib/domain/scheduler.ts) has run history, /connections' ops
   * dashboard shows a more precise per-job view than this single-number
   * proxy. */
  lastFullIntelligenceRunAt: Date | null;
}

export async function getGlobalStatus(): Promise<GlobalStatus> {
  const [freshness, latestSyncLog, latestBriefing] = await Promise.all([
    getDataFreshnessSnapshot(),
    prisma.syncLog.findFirst({ orderBy: { syncedAt: 'desc' } }),
    prisma.briefing.findFirst({ orderBy: { generatedAt: 'desc' } }),
  ]);

  const byProvider = new Map(freshness.map((f) => [f.provider, f]));
  const ageHours = latestSyncLog ? (Date.now() - latestSyncLog.syncedAt.getTime()) / (1000 * 60 * 60) : null;

  return {
    mode: getOperatingMode(),
    marketData: byProvider.get('twelvedata')!,
    fundamentals: byProvider.get('financialmodelingprep')!,
    news: byProvider.get('finnhub')!,
    robinhoodSync: {
      lastSyncedAt: latestSyncLog?.syncedAt ?? null,
      success: latestSyncLog?.success ?? null,
      ageHours,
    },
    lastFullIntelligenceRunAt: latestBriefing?.generatedAt ?? null,
  };
}
