import { NextRequest } from 'next/server';
import { marketStreamManager, type MarketStreamEvent } from '@/lib/domain/marketStream';

export const dynamic = 'force-dynamic';

/** Per-connection cap — the brief's "prevent one browser tab from
 * creating excessive provider subscriptions" control, enforced at the
 * point a browser tab actually opens a connection (the manager's own
 * app-wide MAX_CONCURRENT_SYMBOLS cap guards total load across all
 * tabs/consumers). */
const MAX_SYMBOLS_PER_CONNECTION = 5;

function sseEvent(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/**
 * The safe application-facing delivery mechanism for live-ish market data:
 * Server-Sent Events, gated by the same session-cookie middleware every
 * other page/route in the app already requires (this path isn't in
 * middleware.ts's exclusion list), so it's never reachable without
 * authentication. The provider API key never leaves the server — this
 * route only relays MarketStreamEvent objects the subscription manager
 * already produced from its own provider call.
 *
 * Explicitly labeled `mode: 'polling'` in the initial event — this is a
 * rate-limited polling fallback (see lib/domain/marketStream.ts's own
 * documentation for why), never claimed as true real-time streaming.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requested = (searchParams.get('symbols') ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const symbols = Array.from(new Set(requested)).slice(0, MAX_SYMBOLS_PER_CONNECTION);

  if (symbols.length === 0) {
    return new Response(JSON.stringify({ error: 'Provide at least one symbol via ?symbols=AAPL,MSFT' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(obj)));
        } catch {
          // Controller already closed by the client disconnecting — ignore.
        }
      };

      send({
        type: 'connected',
        symbols,
        mode: 'polling',
        note: 'Delayed polling of the configured market-data provider — not true real-time streaming.',
      });

      const unsubscribers = symbols.map((symbol) =>
        marketStreamManager.subscribe(symbol, (event: MarketStreamEvent) => send(event))
      );

      const heartbeat = setInterval(() => send({ type: 'heartbeat', at: new Date().toISOString() }), 20_000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(heartbeat);
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
