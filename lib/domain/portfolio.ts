import { prisma } from '@/lib/prisma';
import { marketDataProvider } from '@/lib/integrations';
import type { DataQuality } from '@/lib/integrations';

export interface HoldingView {
  id: string;
  symbol: string;
  name: string;
  sector: string | null;
  quantity: number;
  avgCostBasis: number;
  currentPrice: number;
  changePercent: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  quoteAsOf: Date;
  quoteQuality: DataQuality;
  /** From the existing Holding -> Thesis 1:1 relation — null when no
   * thesis has been generated yet for this holding (e.g. right after a
   * fresh sync, before the daily thesis job has run). Mirrors the latest
   * ConvictionAssessment.overallScore; never recomputed here. */
  convictionScore: number | null;
  thesisLastReviewedAt: Date | null;
}

export interface PortfolioOverview {
  totalValue: number;
  cashBalance: number;
  dayChangeValue: number;
  dayChangePercent: number;
  sp500Level: number;
  holdings: HoldingView[];
  largestWinner: HoldingView | null;
  largestLoser: HoldingView | null;
  asOf: Date;
  lastSyncedAt: Date | null;
}

/**
 * Resolves which Account every job and page treats as "the" portfolio.
 * Atlas is architecturally single-account (all jobs pull "the" account, not
 * a list) — this is the one place that decision is made, so it's made
 * consistently everywhere. A synced evaluation account (isEvaluationAccount,
 * see lib/domain/accountSync.ts) always wins over anything else, including
 * older seed/demo accounts: once a real Robinhood account has been synced,
 * every job should be analyzing that account, not leftover seed data. Falls
 * back to the oldest account on record when no evaluation account exists,
 * preserving pre-Phase-3.5 behavior.
 */
export async function getActiveAccountId(): Promise<string | null> {
  const evaluationAccount = await prisma.account.findFirst({
    where: { isEvaluationAccount: true },
    orderBy: { lastSyncedAt: 'desc' },
  });
  if (evaluationAccount) return evaluationAccount.id;

  const fallback = await prisma.account.findFirst({ orderBy: { createdAt: 'asc' } });
  return fallback?.id ?? null;
}

/**
 * Computes the portfolio overview from the active account plus live-ish
 * quotes from the market data provider. Returns null if no account has
 * been synced yet (i.e. nothing to show besides an empty state).
 */
export async function getPortfolioOverview(): Promise<PortfolioOverview | null> {
  const accountId = await getActiveAccountId();
  if (!accountId) return null;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { holdings: { include: { thesis: { select: { convictionScore: true, lastReviewedAt: true } } } } },
  });
  if (!account) return null;

  const quotes = await marketDataProvider.getQuotes(account.holdings.map((h) => h.symbol));
  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]));

  const holdings: HoldingView[] = account.holdings.map((h) => {
    const quote = quoteBySymbol.get(h.symbol);
    const quantity = Number(h.quantity);
    const avgCostBasis = Number(h.avgCostBasis);
    const currentPrice = quote?.price ?? avgCostBasis;
    const marketValue = quantity * currentPrice;
    const costBasisValue = quantity * avgCostBasis;

    return {
      id: h.id,
      symbol: h.symbol,
      name: h.name,
      sector: h.sector,
      quantity,
      avgCostBasis,
      currentPrice,
      changePercent: quote?.changePercent ?? 0,
      marketValue,
      unrealizedPnl: marketValue - costBasisValue,
      unrealizedPnlPercent: costBasisValue === 0 ? 0 : (marketValue - costBasisValue) / costBasisValue,
      quoteAsOf: quote?.asOf ?? h.updatedAt,
      quoteQuality: quote?.quality ?? 'mock',
      convictionScore: h.thesis?.convictionScore ?? null,
      thesisLastReviewedAt: h.thesis?.lastReviewedAt ?? null,
    };
  });

  const holdingsValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  const cashBalance = Number(account.cashBalance);
  const totalValue = holdingsValue + cashBalance;

  const dayChangeValue = holdings.reduce(
    (sum, h) => sum + (h.marketValue * h.changePercent) / 100,
    0
  );

  const sorted = [...holdings].sort((a, b) => b.changePercent - a.changePercent);
  const sp500Level = await marketDataProvider.getSp500Level();

  return {
    totalValue,
    cashBalance,
    dayChangeValue,
    dayChangePercent: totalValue === 0 ? 0 : (dayChangeValue / totalValue) * 100,
    sp500Level,
    holdings,
    largestWinner: sorted[0] ?? null,
    largestLoser: sorted[sorted.length - 1] ?? null,
    asOf: new Date(),
    lastSyncedAt: account.lastSyncedAt,
  };
}
