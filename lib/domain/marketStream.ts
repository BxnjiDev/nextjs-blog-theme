import { marketDataProvider } from '@/lib/integrations';
import type { FreshnessStatus, LiveQuote } from '@/lib/marketdata/types';

export interface MarketStreamEvent {
  type: 'quote' | 'stream-status';
  symbol: string;
  quote?: LiveQuote;
  status?: 'stale';
}

type Listener = (event: MarketStreamEvent) => void;

/** Bounds provider load regardless of how many browser tabs/workspaces are
 * open — the brief's "prevent excessive provider subscriptions" control.
 * Symbols beyond this cap simply aren't polled; consumers still get their
 * last-known quote from the historical candle service instead. */
const MAX_CONCURRENT_SYMBOLS = 30;

/** Batched via marketDataProvider.getQuotes (one comma-joined request per
 * tick, not one request per symbol), so this cadence is safe against
 * Twelve Data's free-tier 8 req/min limit even near the symbol cap. */
const POLL_INTERVAL_MS = 15_000;

/** If a symbol hasn't produced a fresh quote in this long, its stream is
 * reported 'stale' to every subscriber rather than silently going quiet. */
const STALE_AFTER_MS = 90_000;

/**
 * The server-side subscription manager the brief asks for: connects to
 * the configured market-data provider (via the same marketDataProvider
 * every other domain service uses — never a second credential path),
 * subscribes only to symbols currently needed, reference-counts
 * consumers so N open workspaces on the same symbol share one upstream
 * poll, detects stale streams, and unsubscribes (stopping that symbol's
 * polling entirely) once the last consumer disconnects.
 *
 * This is a polling implementation, not a WebSocket client — Twelve
 * Data's free tier has no WebSocket entitlement, and this app's dev
 * environment has no market-data API key configured at all (mock mode).
 * The interface (subscribe/unsubscribe, one MarketStreamEvent per update)
 * is deliberately provider-agnostic: swapping in a real WebSocket-capable
 * provider later means replacing this class's internals, never the
 * SSE route or any consumer's subscribe() call.
 *
 * Known scaling limitation: state is in-process (a Map), so this only
 * dedupes subscriptions within a single Node process. A multi-instance
 * deployment would need a shared broker (Redis pub/sub or similar) for
 * the same guarantee across instances — out of scope for this app's
 * current single-instance deployment.
 */
class MarketStreamManager {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly lastQuoteAt = new Map<string, number>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Registers `listener` for `symbol`'s updates and returns an
   * unsubscribe function. Reference-counted via the listener Set's size —
   * the symbol stops being polled the instant its last listener leaves. */
  subscribe(symbol: string, listener: Listener): () => void {
    const sym = symbol.toUpperCase();
    const set = this.listeners.get(sym) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(sym, set);
    this.ensurePolling();
    return () => this.unsubscribe(sym, listener);
  }

  private unsubscribe(sym: string, listener: Listener): void {
    const set = this.listeners.get(sym);
    if (!set) return;
    set.delete(listener);
    if (set.size === 0) {
      this.listeners.delete(sym);
      this.lastQuoteAt.delete(sym);
    }
    if (this.listeners.size === 0) this.stopPolling();
  }

  get activeSymbols(): string[] {
    return Array.from(this.listeners.keys());
  }

  private ensurePolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      this.pollOnce().catch((err) => console.error('Market stream poll failed:', err));
    }, POLL_INTERVAL_MS);
    this.pollOnce().catch((err) => console.error('Market stream initial poll failed:', err));
  }

  private stopPolling(): void {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private emit(symbol: string, event: MarketStreamEvent): void {
    const set = this.listeners.get(symbol);
    if (!set) return;
    for (const listener of set) listener(event);
  }

  private async pollOnce(): Promise<void> {
    const symbols = this.activeSymbols.slice(0, MAX_CONCURRENT_SYMBOLS);
    if (symbols.length === 0) return;

    const now = Date.now();
    try {
      const quotes = await marketDataProvider.getQuotes(symbols);
      for (const q of quotes) {
        this.lastQuoteAt.set(q.symbol, now);
        // This app's real provider is documented as always 'delayed'
        // (Twelve Data's free tier is not guaranteed real-time) — a quote
        // is only ever labeled 'mock' or 'delayed', never 'live', unless a
        // future provider genuinely entitles real-time data.
        const freshness: FreshnessStatus = q.quality === 'mock' ? 'mock' : 'delayed';
        const liveQuote: LiveQuote = {
          symbol: q.symbol,
          price: q.price,
          changePercent: q.changePercent,
          volume: q.volume,
          asOf: q.asOf,
          freshness,
          provider: q.quality === 'mock' ? 'mock' : 'twelvedata',
        };
        this.emit(q.symbol, { type: 'quote', symbol: q.symbol, quote: liveQuote });
      }
    } catch (err) {
      console.error('Market stream batched quote poll failed:', err);
    }

    for (const sym of symbols) {
      const last = this.lastQuoteAt.get(sym);
      if (last !== undefined && now - last > STALE_AFTER_MS) {
        this.emit(sym, { type: 'stream-status', symbol: sym, status: 'stale' });
      }
    }
  }
}

export const marketStreamManager = new MarketStreamManager();
