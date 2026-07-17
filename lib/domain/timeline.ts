import { prisma } from '@/lib/prisma';
import { getActiveAccountId } from './portfolio';

export type TimelineEntryType =
  | 'sync'
  | 'recommendation'
  | 'transaction'
  | 'thesis_change'
  | 'conviction_change'
  | 'risk_change'
  | 'health_change'
  | 'news'
  | 'earnings';

export interface TimelineEntry {
  id: string;
  type: TimelineEntryType;
  symbol: string | null;
  timestamp: Date;
  title: string;
  detail: string;
  href: string | null;
}

const PER_SOURCE_LIMIT = 50;

/**
 * Merges nine already-existing tables (SyncLog, Recommendation,
 * Transaction, ThesisChangeEvent, ConvictionAssessment, RiskAssessment,
 * PortfolioHealthAssessment, NewsItem, EarningsEvent) into one
 * chronological feed. No new job or model — purely a read-side
 * aggregation over data every other Phase 2/3 job already produces.
 * Portfolio-level rows (sync, risk, health) are only included when no
 * symbol filter is active, since they don't belong to one symbol.
 */
export async function getPortfolioTimeline(options?: { symbol?: string; limit?: number }): Promise<TimelineEntry[]> {
  const limit = options?.limit ?? 150;
  const accountId = await getActiveAccountId();
  if (!accountId) return [];

  const holdings = await prisma.holding.findMany({ where: { accountId }, select: { symbol: true } });
  const heldSymbols = holdings.map((h) => h.symbol);
  const symbolFilter = options?.symbol ? [options.symbol] : heldSymbols;
  if (symbolFilter.length === 0) return [];

  const entries: TimelineEntry[] = [];

  const [recommendations, transactions, thesisChanges, convictionAssessments, news, earnings] = await Promise.all([
    prisma.recommendation.findMany({
      where: { symbol: { in: symbolFilter }, holding: { accountId } },
      orderBy: { generatedAt: 'desc' },
      take: PER_SOURCE_LIMIT,
    }),
    prisma.transaction.findMany({
      where: { symbol: { in: symbolFilter }, accountId },
      orderBy: { executedAt: 'desc' },
      take: PER_SOURCE_LIMIT,
    }),
    prisma.thesisChangeEvent.findMany({
      where: { symbol: { in: symbolFilter } },
      orderBy: { createdAt: 'desc' },
      take: PER_SOURCE_LIMIT,
    }),
    prisma.convictionAssessment.findMany({
      where: { symbol: { in: symbolFilter } },
      orderBy: { generatedAt: 'desc' },
      take: PER_SOURCE_LIMIT,
    }),
    prisma.newsItem.findMany({
      where: { symbol: { in: symbolFilter }, materialityLevel: { in: ['CRITICAL', 'HIGH', 'MEDIUM'] } },
      orderBy: { publishedAt: 'desc' },
      take: PER_SOURCE_LIMIT,
    }),
    prisma.earningsEvent.findMany({
      where: { symbol: { in: symbolFilter } },
      orderBy: { updatedAt: 'desc' },
      take: PER_SOURCE_LIMIT,
    }),
  ]);

  for (const r of recommendations) {
    entries.push({
      id: `rec-${r.id}`,
      type: 'recommendation',
      symbol: r.symbol,
      timestamp: r.generatedAt,
      title: `${r.symbol}: recommended ${r.action.replace(/_/g, ' ').toLowerCase()}`,
      detail: `Confidence ${r.confidenceScore}/10 · decision: ${r.userDecision.replace(/_/g, ' ').toLowerCase()}`,
      href: `/recommendations/${r.id}`,
    });
  }
  for (const t of transactions) {
    entries.push({
      id: `txn-${t.id}`,
      type: 'transaction',
      symbol: t.symbol,
      timestamp: t.executedAt,
      title: `${t.symbol}: ${t.side.toLowerCase()} ${Number(t.quantity)} @ $${Number(t.price).toFixed(2)}`,
      detail: `Source: ${t.source.toLowerCase()}`,
      href: `/intelligence/${t.symbol}`,
    });
  }
  for (const c of thesisChanges) {
    entries.push({
      id: `thesis-${c.id}`,
      type: 'thesis_change',
      symbol: c.symbol,
      timestamp: c.createdAt,
      title: `${c.symbol}: ${c.changeType.replace(/_/g, ' ').toLowerCase()}`,
      detail: c.whatChanged ?? 'No change detail recorded.',
      href: `/intelligence/${c.symbol}`,
    });
  }
  // Conviction is a daily-ish time series — only surface entries that
  // actually moved vs. the previous score, to keep the timeline signal-y.
  for (let i = 0; i < convictionAssessments.length - 1; i++) {
    const curr = convictionAssessments[i];
    const prev = convictionAssessments[i + 1];
    if (Math.abs(curr.overallScore - prev.overallScore) < 5) continue;
    entries.push({
      id: `conviction-${curr.id}`,
      type: 'conviction_change',
      symbol: curr.symbol,
      timestamp: curr.generatedAt,
      title: `${curr.symbol}: conviction ${prev.overallScore} → ${curr.overallScore}`,
      detail: curr.overallScore > prev.overallScore ? 'Conviction improved.' : 'Conviction weakened.',
      href: `/intelligence/${curr.symbol}`,
    });
  }
  for (const n of news) {
    entries.push({
      id: `news-${n.id}`,
      type: 'news',
      symbol: n.symbol,
      timestamp: n.publishedAt,
      title: n.headline,
      detail: `${n.source} · materiality ${n.materialityLevel.toLowerCase()}`,
      href: n.url,
    });
  }
  for (const e of earnings) {
    entries.push({
      id: `earnings-${e.id}`,
      type: 'earnings',
      symbol: e.symbol,
      timestamp: e.updatedAt,
      title: `${e.symbol}: ${e.isEstimate ? 'upcoming' : 'reported'} ${e.fiscalPeriod} FY${e.fiscalYear} earnings`,
      detail: e.isEstimate
        ? `Est. EPS ${e.epsEstimate ?? 'n/a'}, reports ${e.reportDate.toLocaleDateString()}`
        : `EPS ${e.epsActual ?? 'n/a'} vs. est. ${e.epsEstimate ?? 'n/a'}${e.epsSurprisePct !== null ? ` (${(e.epsSurprisePct * 100).toFixed(1)}% surprise)` : ''}`,
      href: `/intelligence/${e.symbol}`,
    });
  }

  if (!options?.symbol) {
    const [syncs, riskHistory, healthHistory] = await Promise.all([
      prisma.syncLog.findMany({ where: { accountId }, orderBy: { syncedAt: 'desc' }, take: PER_SOURCE_LIMIT }),
      prisma.riskAssessment.findMany({ orderBy: { generatedAt: 'desc' }, take: PER_SOURCE_LIMIT }),
      prisma.portfolioHealthAssessment.findMany({ orderBy: { generatedAt: 'desc' }, take: PER_SOURCE_LIMIT }),
    ]);

    for (const s of syncs) {
      entries.push({
        id: `sync-${s.id}`,
        type: 'sync',
        symbol: null,
        timestamp: s.syncedAt,
        title: s.success ? `Account synced (${s.source})` : `Sync rejected (${s.source})`,
        detail: s.success
          ? `+${s.recordsAdded} added, ${s.recordsUpdated} updated, ${s.recordsSkipped} skipped`
          : Array.isArray(s.errors) && s.errors.length > 0
            ? String((s.errors as string[])[0])
            : 'See /connections for details.',
        href: '/connections',
      });
    }
    for (let i = 0; i < riskHistory.length - 1; i++) {
      const curr = riskHistory[i];
      const prev = riskHistory[i + 1];
      if (Math.abs(curr.overallScore - prev.overallScore) < 5) continue;
      entries.push({
        id: `risk-${curr.id}`,
        type: 'risk_change',
        symbol: null,
        timestamp: curr.generatedAt,
        title: `Portfolio risk ${prev.overallScore} → ${curr.overallScore}`,
        detail: curr.notes ?? '',
        href: '/risk',
      });
    }
    for (let i = 0; i < healthHistory.length - 1; i++) {
      const curr = healthHistory[i];
      const prev = healthHistory[i + 1];
      if (Math.abs(curr.overallScore - prev.overallScore) < 5) continue;
      entries.push({
        id: `health-${curr.id}`,
        type: 'health_change',
        symbol: null,
        timestamp: curr.generatedAt,
        title: `Portfolio health ${prev.overallScore} → ${curr.overallScore}`,
        detail: (curr.topConcerns as string[] | null)?.[0] ?? '',
        href: '/health',
      });
    }
  }

  entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return entries.slice(0, limit);
}
