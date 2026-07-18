/**
 * Continuous processor for the Robinhood sync inbox (data/robinhood-inbox/).
 *
 * Usage:
 *   npm run sync:robinhood:watch
 *   ROBINHOOD_SYNC_INTERVAL_SECONDS=60 npm run sync:robinhood:watch
 *
 * Runs `runJob('robinhoodSyncIngest', 'scheduled')` on an interval
 * (default 300s / 5 min, override via ROBINHOOD_SYNC_INTERVAL_SECONDS) for
 * as long as this process stays running. Leave a terminal tab open with
 * this running (or supervise it with launchd — see launchd/README.md's
 * pattern for other jobs) for the closest thing to "automatic" Robinhood
 * sync possible in this architecture: the moment an agent session drops a
 * payload into the inbox, it's picked up within one interval, with no
 * further action needed and no dev-server restart required (Home/
 * Portfolio/etc. are already `dynamic = 'force-dynamic'`, so they read the
 * freshly-synced data on their very next request).
 *
 * This process never talks to Robinhood — see
 * lib/domain/robinhoodSyncIngest.ts's docstring for why that's not
 * possible from here at all, not just a choice.
 *
 * Duplicate-sync protection is the existing scheduler lock
 * (lib/domain/scheduler.ts) — if a manual `npm run sync:robinhood` or
 * another watch process is already mid-run, this tick is skipped, not
 * queued or duplicated.
 */
import { prisma } from '../lib/prisma';
import { runJob } from '../lib/domain/scheduler';

const INTERVAL_SECONDS = Number(process.env.ROBINHOOD_SYNC_INTERVAL_SECONDS ?? 300);
/** Not a hard cancellation (syncAccount/runPostSyncPipeline don't support
 * aborting mid-flight) — just how long we wait before logging a loud
 * "this tick is taking unusually long" warning, so a genuinely stuck run
 * is visible in the logs rather than silently invisible between ticks. */
const TICK_WARNING_MS = Number(process.env.ROBINHOOD_SYNC_TIMEOUT_MS ?? 120_000);

let shuttingDown = false;
let tickInFlight = false;

function log(level: 'info' | 'warn' | 'error', event: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...extra }));
}

async function tick(): Promise<void> {
  if (tickInFlight) {
    log('warn', 'tick_skipped_previous_still_running');
    return;
  }
  tickInFlight = true;
  const start = Date.now();
  const warnTimer = setTimeout(() => {
    log('warn', 'tick_taking_longer_than_expected', { elapsedMs: Date.now() - start, thresholdMs: TICK_WARNING_MS });
  }, TICK_WARNING_MS);

  try {
    const outcome = await runJob('robinhoodSyncIngest', 'scheduled');
    const run = await prisma.schedulerRun.findUnique({ where: { id: outcome.schedulerRunId! } });
    log(outcome.status === 'FAILURE' ? 'error' : 'info', 'tick_complete', {
      status: outcome.status,
      durationMs: Date.now() - start,
      result: run?.result ?? null,
      error: run?.error ?? null,
    });
  } catch (err) {
    log('error', 'tick_threw', { message: err instanceof Error ? err.message : String(err) });
  } finally {
    clearTimeout(warnTimer);
    tickInFlight = false;
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', 'shutdown_requested', { signal, tickInFlight });

  if (tickInFlight) {
    log('info', 'waiting_for_in_flight_tick');
    const deadline = Date.now() + 30_000;
    while (tickInFlight && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  await prisma.$disconnect();
  log('info', 'shutdown_complete');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

async function main() {
  log('info', 'watch_started', { intervalSeconds: INTERVAL_SECONDS });
  await tick(); // run once immediately rather than waiting a full interval
  const interval = setInterval(() => {
    if (shuttingDown) {
      clearInterval(interval);
      return;
    }
    void tick();
  }, INTERVAL_SECONDS * 1000);
}

main().catch(async (err) => {
  log('error', 'fatal', { message: err instanceof Error ? err.message : String(err) });
  await prisma.$disconnect();
  process.exit(1);
});
