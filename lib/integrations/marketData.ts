import type { MarketDataProvider, Quote, Technicals } from './types';

/**
 * MOCK implementation. Returns deterministic placeholder numbers so the UI
 * is exercisable, but these are NOT real prices — do not use for anything
 * beyond local development of this app.
 *
 * To go live: implement this interface against a real vendor (e.g. Polygon,
 * IEX Cloud, Alpaca Market Data, Tiingo) keyed by MARKET_DATA_API_KEY, and
 * swap the export in `lib/integrations/index.ts`.
 */
class MockMarketDataProvider implements MarketDataProvider {
  async getQuote(symbol: string): Promise<Quote> {
    const seed = hashSymbol(symbol);
    return {
      symbol,
      price: 50 + (seed % 400),
      changePercent: (((seed % 21) - 10) / 10) * 2,
      volume: 1_000_000 + seed * 1000,
      asOf: new Date(),
    };
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    return Promise.all(symbols.map((s) => this.getQuote(s)));
  }

  async getTechnicals(symbol: string): Promise<Technicals> {
    const seed = hashSymbol(symbol);
    const trend = seed % 3 === 0 ? 'UP' : seed % 3 === 1 ? 'DOWN' : 'SIDEWAYS';
    return {
      symbol,
      trend,
      notes: 'Mock technicals — not derived from real price history.',
    };
  }

  async getSp500Level(): Promise<number> {
    return 5600;
  }
}

function hashSymbol(symbol: string): number {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return h;
}

export const marketDataProvider: MarketDataProvider = new MockMarketDataProvider();
