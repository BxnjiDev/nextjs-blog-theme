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
}

/**
 * Computes the portfolio overview from the account currently on record plus
 * live-ish quotes from the market data provider. Returns null if no account
 * has been synced yet (i.e. nothing to show besides an empty state).
 */
export async function getPortfolioOverview(): Promise<PortfolioOverview | null> {
  const account = await prisma.account.findFirst({
    include: { holdings: true },
    orderBy: { createdAt: 'asc' },
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
  };
}
