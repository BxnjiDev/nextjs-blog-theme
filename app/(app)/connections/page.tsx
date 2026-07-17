import { prisma } from '@/lib/prisma';
import { resolveAnthropicModel } from '@/lib/integrations';
import { getDataFreshnessSnapshot } from '@/lib/domain/dataFreshness';
import { getGlobalStatus } from '@/lib/domain/globalStatus';
import { getSchedulerStatus, JOB_REGISTRY } from '@/lib/domain/scheduler';
import { rerunJob } from './actions';

export const dynamic = 'force-dynamic';

async function checkEdgarReachable(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: {
        'User-Agent': process.env.SEC_EDGAR_USER_AGENT || 'Atlas Portfolio Agent (set SEC_EDGAR_USER_AGENT)',
      },
      cache: 'no-store',
    });
    return { ok: res.ok, detail: res.ok ? 'Reachable' : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        ok ? 'bg-risk-low/10 text-risk-low' : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
      }`}
    >
      {label}
    </span>
  );
}

const STALENESS_LABEL: Record<string, string> = {
  fresh: 'Fresh',
  aging: 'Aging',
  stale: 'Stale',
  unknown: 'No data yet',
};

const RUN_STATUS_STYLES: Record<string, string> = {
  SUCCESS: 'bg-risk-low/10 text-risk-low',
  WARNING: 'bg-risk-medium/10 text-risk-medium',
  FAILURE: 'bg-risk-high/10 text-risk-high',
  RUNNING: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  SKIPPED: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const MATCH_STATUS_STYLES: Record<string, string> = {
  UNMATCHED: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  AMOUNT_MISMATCH: 'bg-risk-high/10 text-risk-high',
  QUANTITY_MISMATCH: 'bg-risk-high/10 text-risk-high',
  PRICE_MISMATCH: 'bg-risk-high/10 text-risk-high',
  TIMING_MISMATCH: 'bg-risk-medium/10 text-risk-medium',
};

/** Renders the shared getDataFreshnessSnapshot() fields for one provider —
 * last updated, staleness, and (once lib/integrations/retry.ts has logged
 * at least one call) reliability/latency. */
function FreshnessLine({ freshness }: { freshness: { lastUpdated: Date | null; staleness: string; reliabilityPct: number | null; avgLatencyMs: number | null } | null }) {
  if (!freshness) return null;
  return (
    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
      Last updated: {freshness.lastUpdated ? freshness.lastUpdated.toLocaleString() : 'never'} · {STALENESS_LABEL[freshness.staleness] ?? freshness.staleness}
      {freshness.reliabilityPct !== null && (
        <>
          {' '}
          · Reliability (last 20 calls): {freshness.reliabilityPct}% · Avg latency: {freshness.avgLatencyMs}ms
        </>
      )}
    </p>
  );
}

function HealthRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 dark:border-gray-800">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">{detail}</span>
        <span className={`h-2 w-2 rounded-full ${ok ? 'bg-risk-low' : 'bg-risk-high'}`} />
      </div>
    </div>
  );
}

export default async function ConnectionsPage() {
  const hasMarketDataKey = Boolean(process.env.MARKET_DATA_API_KEY);
  const hasNewsKey = Boolean(process.env.NEWS_API_KEY);
  const hasFundamentalsKey = Boolean(process.env.FUNDAMENTALS_API_KEY);
  const hasEdgarUserAgent = Boolean(process.env.SEC_EDGAR_USER_AGENT);
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasCronSecret = Boolean(process.env.CRON_SECRET);
  const hasEmailChannel = Boolean(process.env.SMTP_HOST && process.env.ALERT_EMAIL_TO);
  const hasWebhookChannel = Boolean(process.env.ALERT_WEBHOOK_URL);
  const hasSyncSecret = Boolean(process.env.SYNC_SECRET);

  const [
    edgar,
    freshness,
    globalStatus,
    schedulerStatus,
    latestSnapshot,
    latestRecommendation,
    latestBriefing,
    latestRisk,
    latestThesisReview,
    latestHealth,
    latestOutcome,
    latestOpportunityComparison,
    latestEarningsEvent,
    latestAlertDelivery,
    latestScorecard,
    evaluationAccount,
    recentSyncLogs,
    recentBlockedGates,
    unresolvedExecutions,
  ] = await Promise.all([
    checkEdgarReachable(),
    // Single shared source for "when did each real data provider last
    // update, and how reliable/fast has it been" — also used by the
    // Investment Memo page (FreshnessStrip). Deliberately DB-only (no live
    // pings) since this page renders on every request — `npm run
    // providers:check` is the live-authenticated check.
    getDataFreshnessSnapshot(),
    getGlobalStatus(),
    getSchedulerStatus(),
    prisma.performanceSnapshot.findFirst({ orderBy: { date: 'desc' } }),
    prisma.recommendation.findFirst({ orderBy: { generatedAt: 'desc' } }),
    prisma.briefing.findFirst({ orderBy: { date: 'desc' } }),
    prisma.riskAssessment.findFirst({ orderBy: { generatedAt: 'desc' } }),
    prisma.thesis.findFirst({ orderBy: { lastReviewedAt: 'desc' } }),
    prisma.portfolioHealthAssessment.findFirst({ orderBy: { generatedAt: 'desc' } }),
    prisma.recommendationOutcome.findFirst({ orderBy: { lastEvaluatedAt: 'desc' } }),
    prisma.opportunityComparison.findFirst({ orderBy: { generatedAt: 'desc' } }),
    prisma.earningsEvent.findFirst({ orderBy: { updatedAt: 'desc' } }),
    prisma.alertDelivery.findFirst({ orderBy: { createdAt: 'desc' } }),
    prisma.recommendationScorecard.findFirst({ orderBy: { generatedAt: 'desc' } }),
    prisma.account.findFirst({ where: { isEvaluationAccount: true } }),
    prisma.syncLog.findMany({ orderBy: { syncedAt: 'desc' }, take: 10 }),
    prisma.dataQualityGateLog.findMany({ where: { status: 'BLOCKED' }, orderBy: { checkedAt: 'desc' }, take: 15 }),
    prisma.manualExecution.findMany({
      where: { matchStatus: { in: ['UNMATCHED', 'AMOUNT_MISMATCH', 'QUANTITY_MISMATCH', 'PRICE_MISMATCH', 'TIMING_MISMATCH'] } },
      orderBy: { recordedAt: 'desc' },
      take: 20,
    }),
  ]);

  const freshnessByProvider = new Map(freshness.map((f) => [f.provider, f]));
  const marketDataFreshness = freshnessByProvider.get('twelvedata') ?? null;
  const newsFreshness = freshnessByProvider.get('finnhub') ?? null;
  const fundamentalsFreshness = freshnessByProvider.get('financialmodelingprep') ?? null;
  const secFreshness = freshnessByProvider.get('sec-edgar') ?? null;
  const claudeFreshness = freshnessByProvider.get('claude') ?? null;

  const runningJobs = schedulerStatus.filter((s) => s.locked);
  const failedJobs = schedulerStatus.filter((s) => s.lastRun?.status === 'FAILURE');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Connections &amp; Operations</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          What Atlas is connected to, whether each provider is safe to trust right now, and the full status of every
          background job — scheduled, running, or failed.
        </p>
      </div>

      <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-3 font-medium">Operating status</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded border border-gray-100 px-3 py-2 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Operating mode</p>
            <p className={`text-lg font-semibold ${globalStatus.mode === 'live-evaluation' ? 'text-amber-600 dark:text-amber-400' : ''}`}>
              {globalStatus.mode}
            </p>
          </div>
          <div className="rounded border border-gray-100 px-3 py-2 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Last Robinhood sync</p>
            <p className="text-sm font-medium">
              {globalStatus.robinhoodSync.lastSyncedAt
                ? `${globalStatus.robinhoodSync.success ? 'ok' : 'rejected'} · ${globalStatus.robinhoodSync.ageHours!.toFixed(1)}h ago`
                : 'Never synced'}
            </p>
          </div>
          <div className="rounded border border-gray-100 px-3 py-2 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Last complete pipeline run</p>
            <p className="text-sm font-medium">
              {globalStatus.lastFullIntelligenceRunAt ? globalStatus.lastFullIntelligenceRunAt.toLocaleString() : 'Never run'}
            </p>
          </div>
          <div className="rounded border border-gray-100 px-3 py-2 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Running / failed jobs</p>
            <p className="text-sm font-medium">
              <span className={runningJobs.length > 0 ? 'text-blue-600 dark:text-blue-400' : ''}>{runningJobs.length} running</span>
              {' · '}
              <span className={failedJobs.length > 0 ? 'text-risk-high' : ''}>{failedJobs.length} failed</span>
            </p>
          </div>
        </div>
        {globalStatus.mode === 'live-evaluation' && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
            Live-evaluation mode — recommendations are blocked rather than generated from mock market data,
            fundamentals, or a stale account. See &ldquo;Data-quality blocks&rdquo; below for any that were.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Scheduled jobs</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Reruns here are always safe — every job is read/analyze/record only, never able to submit a trade
            (see <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">lib/domain/executionBoundary.test.ts</code>).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <th className="py-1 pr-2">Job</th>
                <th className="py-1 pr-2">Enabled</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 pr-2">Last run</th>
                <th className="py-1 pr-2">Duration</th>
                <th className="py-1 pr-2">Retry attempts</th>
                <th className="py-1 pr-2"></th>
              </tr>
            </thead>
            <tbody>
              {schedulerStatus.map((s) => (
                <tr key={s.jobName} className="border-b border-gray-50 dark:border-gray-900">
                  <td className="py-1.5 pr-2 font-medium">{s.label}</td>
                  <td className="py-1.5 pr-2">{s.enabled ? 'yes' : 'disabled'}</td>
                  <td className="py-1.5 pr-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RUN_STATUS_STYLES[s.locked ? 'RUNNING' : s.lastRun?.status ?? 'SKIPPED']}`}>
                      {s.locked ? 'RUNNING' : (s.lastRun?.status ?? 'never run')}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-xs text-gray-500 dark:text-gray-400">
                    {s.lastRun ? `${s.lastRun.startedAt.toLocaleString()} (${s.lastRun.trigger})` : '—'}
                    {s.lastRun?.error && <p className="text-risk-high">{s.lastRun.error}</p>}
                  </td>
                  <td className="py-1.5 pr-2 text-xs text-gray-500 dark:text-gray-400">{s.lastRun?.durationMs !== null && s.lastRun?.durationMs !== undefined ? `${s.lastRun.durationMs}ms` : '—'}</td>
                  <td className="py-1.5 pr-2 text-xs text-gray-500 dark:text-gray-400">{s.lastRun ? 1 : 0}</td>
                  <td className="py-1.5 pr-2">
                    <form action={rerunJob.bind(null, s.jobName)}>
                      <button type="submit" disabled={s.locked} className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-gray-700">
                        {s.locked ? 'Running…' : 'Rerun'}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          For a full accounting from the terminal (including run-all): <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">npm run scheduler -- status</code>.
          Scheduling itself runs via launchd/cron — see <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">launchd/README.md</code>.
        </p>
        {Object.keys(JOB_REGISTRY).length !== schedulerStatus.length && (
          <p className="mt-1 text-xs text-risk-medium">Job registry / status count mismatch — check lib/domain/scheduler.ts.</p>
        )}
      </section>

      {recentBlockedGates.length > 0 && (
        <section className="rounded-lg border border-risk-high/30 p-4 dark:border-risk-high/40">
          <h2 className="mb-3 font-medium text-risk-high">Data-quality blocks</h2>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Recommendations the data-quality gate (<code className="rounded bg-gray-100 px-1 dark:bg-gray-800">lib/domain/dataQualityGate.ts</code>)
            refused to generate — no fabricated recommendation was created for any of these.
          </p>
          <ul className="space-y-2 text-xs">
            {recentBlockedGates.map((g) => {
              const checks = g.checks as unknown as { name: string; status: string; detail: string }[];
              const blocking = checks.filter((c) => c.status === 'blocking');
              return (
                <li key={g.id} className="rounded border border-gray-100 px-3 py-2 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{g.symbol}</span>
                    <span className="text-gray-500 dark:text-gray-400">{g.checkedAt.toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-gray-600 dark:text-gray-400">{blocking.map((c) => c.detail).join(' ')}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {unresolvedExecutions.length > 0 && (
        <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Unmatched manual executions &amp; reconciliation warnings</h2>
            <a href="/executions" className="text-xs underline">
              Record / view all →
            </a>
          </div>
          <ul className="space-y-2 text-xs">
            {unresolvedExecutions.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 rounded border border-gray-100 px-3 py-2 dark:border-gray-800">
                <div>
                  <span className="font-medium">
                    {e.symbol} · {e.side} · {Number(e.quantity)} sh @ ${Number(e.executionPrice).toFixed(2)}
                  </span>
                  <p className="mt-1 text-gray-600 dark:text-gray-400">{e.reconciliationNote ?? 'Awaiting next sync.'}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${MATCH_STATUS_STYLES[e.matchStatus] ?? ''}`}>
                  {e.matchStatus.replace(/_/g, ' ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-3 font-medium">System health</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <HealthRow
            label="Last portfolio refresh"
            ok={Boolean(latestSnapshot)}
            detail={latestSnapshot ? latestSnapshot.date.toLocaleDateString() : 'Never run'}
          />
          <HealthRow
            label="Last recommendation generated"
            ok={Boolean(latestRecommendation)}
            detail={latestRecommendation ? latestRecommendation.generatedAt.toLocaleString() : 'Never run'}
          />
          <HealthRow
            label="Last briefing"
            ok={Boolean(latestBriefing)}
            detail={latestBriefing ? latestBriefing.date.toLocaleDateString() : 'Never run'}
          />
          <HealthRow
            label="Last SEC filing alert"
            ok={Boolean(secFreshness?.lastUpdated)}
            detail={secFreshness?.lastUpdated ? secFreshness.lastUpdated.toLocaleString() : 'None yet'}
          />
          <HealthRow
            label="Last news item stored"
            ok={Boolean(newsFreshness?.lastUpdated)}
            detail={newsFreshness?.lastUpdated ? newsFreshness.lastUpdated.toLocaleString() : 'Never run'}
          />
          <HealthRow
            label="Last risk assessment"
            ok={Boolean(latestRisk)}
            detail={latestRisk ? latestRisk.generatedAt.toLocaleString() : 'Never run'}
          />
          <HealthRow
            label="Last thesis review"
            ok={Boolean(latestThesisReview)}
            detail={latestThesisReview ? latestThesisReview.lastReviewedAt.toLocaleString() : 'Never run'}
          />
          <HealthRow
            label="Last portfolio health score"
            ok={Boolean(latestHealth)}
            detail={latestHealth ? latestHealth.generatedAt.toLocaleString() : 'Never run'}
          />
          <HealthRow
            label="Last outcome evaluation"
            ok={Boolean(latestOutcome)}
            detail={latestOutcome ? latestOutcome.lastEvaluatedAt.toLocaleString() : 'Never run'}
          />
          <HealthRow
            label="Last opportunity comparison"
            ok={Boolean(latestOpportunityComparison)}
            detail={latestOpportunityComparison ? latestOpportunityComparison.generatedAt.toLocaleString() : 'Never run'}
          />
          <HealthRow
            label="Last fundamentals ingest"
            ok={Boolean(fundamentalsFreshness?.lastUpdated)}
            detail={fundamentalsFreshness?.lastUpdated ? fundamentalsFreshness.lastUpdated.toLocaleString() : 'Never run'}
          />
          <HealthRow
            label="Last earnings-calendar update"
            ok={Boolean(latestEarningsEvent)}
            detail={latestEarningsEvent ? latestEarningsEvent.updatedAt.toLocaleString() : 'Never run'}
          />
          <HealthRow
            label="Last alert delivery attempt"
            ok={Boolean(latestAlertDelivery)}
            detail={latestAlertDelivery ? `${latestAlertDelivery.status} @ ${latestAlertDelivery.createdAt.toLocaleString()}` : 'Never run'}
          />
          <HealthRow
            label="Last scorecard/learning run"
            ok={Boolean(latestScorecard)}
            detail={latestScorecard ? latestScorecard.generatedAt.toLocaleString() : 'Never run'}
          />
        </div>
        {!hasCronSecret && (
          <p className="mt-3 text-xs text-risk-medium">
            CRON_SECRET is not set — the /api/jobs/* routes will refuse every request (including
            Vercel Cron) until it&rsquo;s configured. The local scheduler (<code className="rounded bg-gray-100 px-1 dark:bg-gray-800">npm run scheduler</code>) doesn&rsquo;t need it.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-3 font-medium">Live-evaluation account sync</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <HealthRow label="Evaluation account connected" ok={Boolean(evaluationAccount)} detail={evaluationAccount ? evaluationAccount.externalId : 'Never synced'} />
          <HealthRow
            label="Last sync"
            ok={Boolean(recentSyncLogs[0]?.success)}
            detail={recentSyncLogs[0] ? `${recentSyncLogs[0].success ? 'ok' : 'failed'} · ${recentSyncLogs[0].source} · ${recentSyncLogs[0].syncedAt.toLocaleString()}` : 'Never run'}
          />
        </div>
        {!hasSyncSecret && (
          <p className="mt-3 text-xs text-risk-medium">
            SYNC_SECRET is not set — the /api/sync/account route will refuse every request until it&rsquo;s
            configured. The CLI (<code className="rounded bg-gray-100 px-1 dark:bg-gray-800">npm run sync:account</code>) doesn&rsquo;t need it, since it
            writes to the database directly rather than over HTTP.
          </p>
        )}
        {recentSyncLogs.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-2 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Recent sync log</h3>
            <ul className="space-y-2 text-xs">
              {recentSyncLogs.map((log) => (
                <li key={log.id} className="rounded border border-gray-100 px-3 py-2 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className={log.success ? 'text-risk-low' : 'text-risk-high'}>{log.success ? 'Success' : 'Rejected'}</span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {log.syncedAt.toLocaleString()} · {log.source} · v{log.schemaVersion}
                    </span>
                  </div>
                  <p className="mt-1 text-gray-600 dark:text-gray-400">
                    +{log.recordsAdded} added, {log.recordsUpdated} updated, {log.recordsSkipped} skipped
                  </p>
                  {Array.isArray(log.errors) && log.errors.length > 0 && (
                    <p className="mt-1 text-risk-high">{(log.errors as string[]).join(' · ')}</p>
                  )}
                  {Array.isArray(log.warnings) && log.warnings.length > 0 && (
                    <p className="mt-1 text-risk-medium">{(log.warnings as string[]).join(' · ')}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Robinhood Agentic Trading (brokerage + execution)</h2>
            <StatusPill ok={Boolean(evaluationAccount)} label={evaluationAccount ? 'Evaluation account synced' : 'Not connected in this app'} />
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            This is an MCP connector, not an API key stored by this app. Connect it to the agent
            session driving Atlas with:
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-900">
            claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading
          </pre>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Once connected, the agent can read the account (holdings, cash, transactions, open orders)
            and report it to Atlas via <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">npm run sync:account</code> (local
            CLI) or <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">POST /api/sync/account</code> — see{' '}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">lib/domain/accountSync.ts</code>. Atlas never holds
            Robinhood credentials, session tokens, or MCP secrets, and never submits an order — every
            trade is placed manually. See the banner at the top of every page, and
            &ldquo;Execution boundary&rdquo; in ARCHITECTURE.md.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Market data — Twelve Data (quotes, historical, fundamentals)</h2>
            <StatusPill ok={hasMarketDataKey} label={hasMarketDataKey ? 'Key configured' : 'Mock data'} />
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Set <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">MARKET_DATA_API_KEY</code> with a{' '}
            <a href="https://twelvedata.com" className="underline" target="_blank" rel="noreferrer">
              Twelve Data
            </a>{' '}
            key. Quotes are labeled &ldquo;Delayed&rdquo; (not real-time) even when live. A configured key that
            errors mid-request retries with backoff, then falls back to mock data for that call only —
            every attempt is logged to ProviderCallLog. Run <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">npm run providers:check</code> for a live
            authenticated check (not run automatically on this page, to avoid pinging providers — including billed
            Anthropic calls — on every page load).
          </p>
          <FreshnessLine freshness={marketDataFreshness} />
        </div>

        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">AI reasoning — Claude (recommendation generation)</h2>
            <StatusPill
              ok={hasAnthropicKey}
              label={hasAnthropicKey ? `Claude configured (${resolveAnthropicModel()})` : 'Heuristic fallback'}
            />
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Set <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">ANTHROPIC_API_KEY</code> to generate
            real thesis/bull/bear/risk analysis (structured output). Model is configured via{' '}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">ANTHROPIC_MODEL</code> (default{' '}
            claude-opus-4-8) and validated at startup — an unsupported value fails immediately with a
            clear error rather than a confusing failure deep in a background job. Without a key, the
            recommendation job stores a clearly-labeled data summary instead of fabricated analysis.
          </p>
          <FreshnessLine freshness={claudeFreshness} />
        </div>

        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Financial news — Finnhub (company, sector &amp; market coverage)</h2>
            <StatusPill ok={hasNewsKey} label={hasNewsKey ? 'Key configured' : 'Mock data (empty feed)'} />
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Set <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">NEWS_API_KEY</code> with a{' '}
            <a href="https://finnhub.io" className="underline" target="_blank" rel="noreferrer">
              Finnhub
            </a>{' '}
            key. Sentiment and materiality are computed deterministically from the real fetched text (see{' '}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">lib/integrations/newsScoring.ts</code>) — never
            invented. Sector coverage (AI, semiconductors, defense, aerospace, robotics, data centers, energy,
            cybersecurity) is sourced via representative sector-ETF company news, documented in{' '}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">lib/integrations/news.ts</code>.
          </p>
          <FreshnessLine freshness={newsFreshness} />
        </div>

        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Fundamentals — Financial Modeling Prep (statements, ratios, ownership, earnings)</h2>
            <StatusPill ok={hasFundamentalsKey} label={hasFundamentalsKey ? 'Key configured' : 'Mock data'} />
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Set <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">FUNDAMENTALS_API_KEY</code> with a{' '}
            <a href="https://financialmodelingprep.com" className="underline" target="_blank" rel="noreferrer">
              Financial Modeling Prep
            </a>{' '}
            key. Powers the historical financial-statement/ratio ingestion (
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">lib/jobs/ingestFundamentals.ts</code>) and the forward earnings
            calendar (<code className="rounded bg-gray-100 px-1 dark:bg-gray-800">lib/jobs/ingestEarnings.ts</code>), which together
            populate the revenue-growth and balance-sheet conviction categories that were previously unavailable.
          </p>
          <FreshnessLine freshness={fundamentalsFreshness} />
        </div>

        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Alert delivery — email &amp; webhook</h2>
            <StatusPill
              ok={hasEmailChannel || hasWebhookChannel}
              label={hasEmailChannel || hasWebhookChannel ? 'At least one channel configured' : 'No channel configured'}
            />
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Set <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">SMTP_HOST</code>/<code className="rounded bg-gray-100 px-1 dark:bg-gray-800">ALERT_EMAIL_TO</code> for
            email (any SMTP server) and/or <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">ALERT_WEBHOOK_URL</code> for a
            webhook. Delivery runs through provider interfaces (
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">lib/integrations/notifications.ts</code>) completely separate from
            alert generation — adding Slack/Discord/SMS/push later means adding one provider class, not touching the alert engine.
            Without any channel configured, alerts are still generated and stored, just not delivered anywhere.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">SEC EDGAR filings</h2>
            <StatusPill ok={edgar.ok} label={edgar.ok ? 'Live (public API)' : 'Unreachable'} />
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Already implemented against the real public EDGAR API — no key required, just a
            contact User-Agent.{' '}
            {hasEdgarUserAgent
              ? 'A custom User-Agent is configured.'
              : 'Set SEC_EDGAR_USER_AGENT with a real contact email before relying on this in production.'}
          </p>
          <FreshnessLine freshness={secFreshness} />
        </div>
      </div>
    </div>
  );
}
