import { prisma } from '@/lib/prisma';
import { resolveAnthropicModel } from '@/lib/integrations';
import { getDataFreshnessSnapshot } from '@/lib/domain/dataFreshness';
import { getGlobalStatus } from '@/lib/domain/globalStatus';
import { getActiveAccountId } from '@/lib/domain/portfolio';
import { getSchedulerStatus, JOB_REGISTRY } from '@/lib/domain/scheduler';
import FadeInView from '@/components/motion/FadeInView';
import Badge from '@/components/ui/Badge';
import SectionHeading from '@/components/ui/SectionHeading';
import StatStrip, { Stat } from '@/components/ui/Stat';
import EmptyState from '@/components/ui/EmptyState';
import { STALENESS_LABEL, RUN_STATUS_TONE, MATCH_STATUS_TONE } from '@/lib/theme/tone';
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
  return <Badge tone={ok ? 'positive' : 'muted'}>{label}</Badge>;
}

/** Renders the shared getDataFreshnessSnapshot() fields for one provider —
 * last updated, staleness, and (once lib/integrations/retry.ts has logged
 * at least one call) reliability/latency. */
function FreshnessLine({ freshness }: { freshness: { lastUpdated: Date | null; staleness: string; reliabilityPct: number | null; avgLatencyMs: number | null } | null }) {
  if (!freshness) return null;
  return (
    <p className="mt-2 text-xs text-atlas-text-tertiary">
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
    <div className="flex items-center justify-between border-b border-atlas-border-subtle/60 py-2 text-sm">
      <span className="text-atlas-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-atlas-text-tertiary">{detail}</span>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? 'bg-risk-low' : 'bg-risk-high'}`} />
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

  // Resolved up front (rather than inside the Promise.all below) so the
  // "recent sync log" query can be scoped to it — an unscoped
  // findMany({ orderBy: syncedAt desc }) would show whichever account
  // synced most recently, not necessarily the real active one. Same class
  // of bug as the one fixed on Settings/globalStatus earlier and on
  // /holdings in this same pass.
  const activeAccountId = await getActiveAccountId();

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
    activeAccountId
      ? prisma.syncLog.findMany({ where: { accountId: activeAccountId }, orderBy: { syncedAt: 'desc' }, take: 10 })
      : Promise.resolve([]),
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
    <div className="space-y-10">
      <FadeInView>
        <h1 className="text-xl font-semibold tracking-tight text-atlas-text">Connections &amp; operations</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-atlas-text-secondary">
          What Atlas is connected to, whether each provider is safe to trust right now, and the full status of every
          background job — scheduled, running, or failed.
        </p>
      </FadeInView>

      <FadeInView delay={0.03}>
        <StatStrip>
          <Stat label="Operating mode" value={globalStatus.mode} tone={globalStatus.mode === 'live-evaluation' ? 'warning' : undefined} />
          <Stat
            label="Last Robinhood sync"
            value={
              globalStatus.robinhoodSync.lastSyncedAt
                ? `${globalStatus.robinhoodSync.success ? 'ok' : 'rejected'} · ${globalStatus.robinhoodSync.ageHours!.toFixed(1)}h ago`
                : 'Never synced'
            }
          />
          <Stat
            label="Last complete pipeline run"
            value={globalStatus.lastFullIntelligenceRunAt ? globalStatus.lastFullIntelligenceRunAt.toLocaleString() : 'Never run'}
          />
          <Stat
            label="Running / failed jobs"
            value={
              <>
                <span className={runningJobs.length > 0 ? 'text-atlas-steel' : 'text-atlas-text'}>{runningJobs.length} running</span>
                <span className="text-atlas-text-tertiary"> · </span>
                <span className={failedJobs.length > 0 ? 'text-risk-high' : 'text-atlas-text'}>{failedJobs.length} failed</span>
              </>
            }
          />
        </StatStrip>
        {globalStatus.mode === 'live-evaluation' && (
          <p className="mt-3 text-xs text-atlas-warning">
            Live-evaluation mode — recommendations are blocked rather than generated from mock market data,
            fundamentals, or a stale account. See &ldquo;Data-quality blocks&rdquo; below for any that were.
          </p>
        )}
      </FadeInView>

      <FadeInView delay={0.06}>
        <SectionHeading
          className="mb-3"
          action={
            <p className="text-xs text-atlas-text-tertiary">
              Reruns here are always safe — every job is read/analyze/record only, never able to submit a trade (see{' '}
              <code className="rounded bg-atlas-surface-raised px-1">lib/domain/executionBoundary.test.ts</code>).
            </p>
          }
        >
          Scheduled jobs
        </SectionHeading>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-atlas-border-subtle text-left text-[11px] uppercase tracking-wide text-atlas-text-tertiary">
                <th className="py-2 pr-4 font-medium">Job</th>
                <th className="py-2 pr-4 font-medium">Enabled</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Last run</th>
                <th className="py-2 pr-4 font-medium">Duration</th>
                <th className="py-2 pr-4 font-medium">Retry attempts</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {schedulerStatus.map((s) => (
                <tr key={s.jobName} className="border-b border-atlas-border-subtle/60 text-atlas-text transition-colors hover:bg-atlas-surface-hover">
                  <td className="py-2 pr-4 font-medium">{s.label}</td>
                  <td className="py-2 pr-4 text-xs text-atlas-text-tertiary">{s.enabled ? 'yes' : 'disabled'}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={RUN_STATUS_TONE[s.locked ? 'RUNNING' : (s.lastRun?.status ?? 'SKIPPED')]}>
                      {s.locked ? 'RUNNING' : (s.lastRun?.status ?? 'never run')}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 text-xs text-atlas-text-tertiary">
                    {s.lastRun ? `${s.lastRun.startedAt.toLocaleString()} (${s.lastRun.trigger})` : '—'}
                    {s.lastRun?.error && <p className="text-risk-high">{s.lastRun.error}</p>}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-atlas-text-tertiary">{s.lastRun?.durationMs !== null && s.lastRun?.durationMs !== undefined ? `${s.lastRun.durationMs}ms` : '—'}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-atlas-text-tertiary">{s.lastRun ? 1 : 0}</td>
                  <td className="py-2">
                    <form action={rerunJob.bind(null, s.jobName)}>
                      <button
                        type="submit"
                        disabled={s.locked}
                        className="rounded-lg border border-atlas-border px-2 py-1 text-xs text-atlas-text-secondary transition-all hover:border-atlas-accent/40 hover:text-atlas-text active:scale-[0.95] disabled:opacity-40"
                      >
                        {s.locked ? 'Running…' : 'Rerun'}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-atlas-text-tertiary">
          For a full accounting from the terminal (including run-all): <code className="rounded bg-atlas-surface-raised px-1">npm run scheduler -- status</code>.
          Scheduling itself runs via launchd/cron — see <code className="rounded bg-atlas-surface-raised px-1">launchd/README.md</code>.
        </p>
        {Object.keys(JOB_REGISTRY).length !== schedulerStatus.length && (
          <p className="mt-1 text-xs text-atlas-warning">Job registry / status count mismatch — check lib/domain/scheduler.ts.</p>
        )}
      </FadeInView>

      {recentBlockedGates.length > 0 && (
        <FadeInView delay={0.09}>
          <div className="rounded-xl border border-risk-high/20 bg-risk-high/5 p-4">
            <h2 className="mb-3 text-sm font-medium text-risk-high">Data-quality blocks</h2>
            <p className="mb-3 text-xs text-atlas-text-tertiary">
              Recommendations the data-quality gate (<code className="rounded bg-atlas-surface-raised px-1">lib/domain/dataQualityGate.ts</code>)
              refused to generate — no fabricated recommendation was created for any of these.
            </p>
            <ul className="space-y-2 text-xs">
              {recentBlockedGates.map((g) => {
                const checks = g.checks as unknown as { name: string; status: string; detail: string }[];
                const blocking = checks.filter((c) => c.status === 'blocking');
                return (
                  <li key={g.id} className="border-t border-atlas-border-subtle/60 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-atlas-text">{g.symbol}</span>
                      <span className="text-atlas-text-tertiary">{g.checkedAt.toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-atlas-text-secondary">{blocking.map((c) => c.detail).join(' ')}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </FadeInView>
      )}

      {unresolvedExecutions.length > 0 && (
        <FadeInView delay={0.12}>
          <SectionHeading
            className="mb-3"
            action={
              <a href="/executions" className="text-xs text-atlas-accent-bright underline">
                Record / view all →
              </a>
            }
          >
            Unmatched manual executions &amp; reconciliation warnings
          </SectionHeading>
          <ul className="space-y-2 text-xs">
            {unresolvedExecutions.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 border-b border-atlas-border-subtle/60 pb-2">
                <div>
                  <span className="font-medium text-atlas-text">
                    {e.symbol} · {e.side} · {Number(e.quantity)} sh @ ${Number(e.executionPrice).toFixed(2)}
                  </span>
                  <p className="mt-1 text-atlas-text-tertiary">{e.reconciliationNote ?? 'Awaiting next sync.'}</p>
                </div>
                <Badge tone={MATCH_STATUS_TONE[e.matchStatus] ?? 'muted'} className="shrink-0">
                  {e.matchStatus.replace(/_/g, ' ')}
                </Badge>
              </li>
            ))}
          </ul>
        </FadeInView>
      )}

      <FadeInView delay={0.15}>
        <SectionHeading className="mb-2">System health</SectionHeading>
        <div className="grid gap-x-8 sm:grid-cols-2">
          <HealthRow label="Last portfolio refresh" ok={Boolean(latestSnapshot)} detail={latestSnapshot ? latestSnapshot.date.toLocaleDateString() : 'Never run'} />
          <HealthRow label="Last recommendation generated" ok={Boolean(latestRecommendation)} detail={latestRecommendation ? latestRecommendation.generatedAt.toLocaleString() : 'Never run'} />
          <HealthRow label="Last briefing" ok={Boolean(latestBriefing)} detail={latestBriefing ? latestBriefing.date.toLocaleDateString() : 'Never run'} />
          <HealthRow label="Last SEC filing alert" ok={Boolean(secFreshness?.lastUpdated)} detail={secFreshness?.lastUpdated ? secFreshness.lastUpdated.toLocaleString() : 'None yet'} />
          <HealthRow label="Last news item stored" ok={Boolean(newsFreshness?.lastUpdated)} detail={newsFreshness?.lastUpdated ? newsFreshness.lastUpdated.toLocaleString() : 'Never run'} />
          <HealthRow label="Last risk assessment" ok={Boolean(latestRisk)} detail={latestRisk ? latestRisk.generatedAt.toLocaleString() : 'Never run'} />
          <HealthRow label="Last thesis review" ok={Boolean(latestThesisReview)} detail={latestThesisReview ? latestThesisReview.lastReviewedAt.toLocaleString() : 'Never run'} />
          <HealthRow label="Last portfolio health score" ok={Boolean(latestHealth)} detail={latestHealth ? latestHealth.generatedAt.toLocaleString() : 'Never run'} />
          <HealthRow label="Last outcome evaluation" ok={Boolean(latestOutcome)} detail={latestOutcome ? latestOutcome.lastEvaluatedAt.toLocaleString() : 'Never run'} />
          <HealthRow label="Last opportunity comparison" ok={Boolean(latestOpportunityComparison)} detail={latestOpportunityComparison ? latestOpportunityComparison.generatedAt.toLocaleString() : 'Never run'} />
          <HealthRow label="Last fundamentals ingest" ok={Boolean(fundamentalsFreshness?.lastUpdated)} detail={fundamentalsFreshness?.lastUpdated ? fundamentalsFreshness.lastUpdated.toLocaleString() : 'Never run'} />
          <HealthRow label="Last earnings-calendar update" ok={Boolean(latestEarningsEvent)} detail={latestEarningsEvent ? latestEarningsEvent.updatedAt.toLocaleString() : 'Never run'} />
          <HealthRow label="Last alert delivery attempt" ok={Boolean(latestAlertDelivery)} detail={latestAlertDelivery ? `${latestAlertDelivery.status} @ ${latestAlertDelivery.createdAt.toLocaleString()}` : 'Never run'} />
          <HealthRow label="Last scorecard/learning run" ok={Boolean(latestScorecard)} detail={latestScorecard ? latestScorecard.generatedAt.toLocaleString() : 'Never run'} />
        </div>
        {!hasCronSecret && (
          <p className="mt-3 text-xs text-atlas-warning">
            CRON_SECRET is not set — the /api/jobs/* routes will refuse every request (including Vercel Cron) until
            it&rsquo;s configured. The local scheduler (<code className="rounded bg-atlas-surface-raised px-1">npm run scheduler</code>) doesn&rsquo;t need it.
          </p>
        )}
      </FadeInView>

      <FadeInView delay={0.18}>
        <SectionHeading className="mb-2">Live-evaluation account sync</SectionHeading>
        <div className="grid gap-x-8 sm:grid-cols-2">
          <HealthRow label="Evaluation account connected" ok={Boolean(evaluationAccount)} detail={evaluationAccount ? evaluationAccount.externalId : 'Never synced'} />
          <HealthRow
            label="Last sync"
            ok={Boolean(recentSyncLogs[0]?.success)}
            detail={recentSyncLogs[0] ? `${recentSyncLogs[0].success ? 'ok' : 'failed'} · ${recentSyncLogs[0].source} · ${recentSyncLogs[0].syncedAt.toLocaleString()}` : 'Never run'}
          />
        </div>
        {!hasSyncSecret && (
          <p className="mt-3 text-xs text-atlas-warning">
            SYNC_SECRET is not set — the /api/sync/account route will refuse every request until it&rsquo;s
            configured. The CLI (<code className="rounded bg-atlas-surface-raised px-1">npm run sync:account</code>) doesn&rsquo;t need it, since it
            writes to the database directly rather than over HTTP.
          </p>
        )}
        {recentSyncLogs.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-atlas-text-tertiary">Recent sync log</h3>
            <ul className="space-y-2 text-xs">
              {recentSyncLogs.map((log) => (
                <li key={log.id} className="border-b border-atlas-border-subtle/60 pb-2">
                  <div className="flex items-center justify-between">
                    <span className={log.success ? 'text-risk-low' : 'text-risk-high'}>{log.success ? 'Success' : 'Rejected'}</span>
                    <span className="text-atlas-text-tertiary">
                      {log.syncedAt.toLocaleString()} · {log.source} · v{log.schemaVersion}
                    </span>
                  </div>
                  <p className="mt-1 text-atlas-text-secondary">
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
      </FadeInView>

      <FadeInView delay={0.2}>
        <SectionHeading className="mb-3">Providers</SectionHeading>
        <div className="space-y-4">
          <div className="atlas-glass rounded-xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-atlas-text">Robinhood Agentic Trading (brokerage + execution)</h3>
              <StatusPill ok={Boolean(evaluationAccount)} label={evaluationAccount ? 'Evaluation account synced' : 'Not connected in this app'} />
            </div>
            <p className="mt-2 text-sm text-atlas-text-secondary">
              This is an MCP connector, not an API key stored by this app. Connect it to the agent session driving
              Atlas with:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-atlas-surface-raised p-3 text-xs text-atlas-text-secondary">
              claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading
            </pre>
            <p className="mt-2 text-sm text-atlas-text-secondary">
              Once connected, the agent can read the account (holdings, cash, transactions, open orders) and report
              it to Atlas via <code className="rounded bg-atlas-surface-raised px-1">npm run sync:account</code> (local CLI) or{' '}
              <code className="rounded bg-atlas-surface-raised px-1">POST /api/sync/account</code> — see{' '}
              <code className="rounded bg-atlas-surface-raised px-1">lib/domain/accountSync.ts</code>. Atlas never holds Robinhood
              credentials, session tokens, or MCP secrets, and never submits an order — every trade is placed
              manually. See the banner at the top of every page, and &ldquo;Execution boundary&rdquo; in ARCHITECTURE.md.
            </p>
          </div>

          <div className="atlas-glass rounded-xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-atlas-text">Market data — Twelve Data (quotes, historical, fundamentals)</h3>
              <StatusPill ok={hasMarketDataKey} label={hasMarketDataKey ? 'Key configured' : 'Mock data'} />
            </div>
            <p className="mt-2 text-sm text-atlas-text-secondary">
              Set <code className="rounded bg-atlas-surface-raised px-1">MARKET_DATA_API_KEY</code> with a{' '}
              <a href="https://twelvedata.com" className="text-atlas-accent-bright underline" target="_blank" rel="noreferrer">
                Twelve Data
              </a>{' '}
              key. Quotes are labeled &ldquo;Delayed&rdquo; (not real-time) even when live. A configured key that
              errors mid-request retries with backoff, then falls back to mock data for that call only — every
              attempt is logged to ProviderCallLog. Run <code className="rounded bg-atlas-surface-raised px-1">npm run providers:check</code> for
              a live authenticated check (not run automatically on this page, to avoid pinging providers — including
              billed Anthropic calls — on every page load).
            </p>
            <FreshnessLine freshness={marketDataFreshness} />
          </div>

          <div className="atlas-glass rounded-xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-atlas-text">AI reasoning — Claude (recommendation generation)</h3>
              <StatusPill ok={hasAnthropicKey} label={hasAnthropicKey ? `Claude configured (${resolveAnthropicModel()})` : 'Heuristic fallback'} />
            </div>
            <p className="mt-2 text-sm text-atlas-text-secondary">
              Set <code className="rounded bg-atlas-surface-raised px-1">ANTHROPIC_API_KEY</code> to generate real thesis/bull/bear/risk
              analysis (structured output). Model is configured via{' '}
              <code className="rounded bg-atlas-surface-raised px-1">ANTHROPIC_MODEL</code> (default claude-opus-4-8) and validated at
              startup — an unsupported value fails immediately with a clear error rather than a confusing failure
              deep in a background job. Without a key, the recommendation job stores a clearly-labeled data summary
              instead of fabricated analysis.
            </p>
            <FreshnessLine freshness={claudeFreshness} />
          </div>

          <div className="atlas-glass rounded-xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-atlas-text">Financial news — Finnhub (company, sector &amp; market coverage)</h3>
              <StatusPill ok={hasNewsKey} label={hasNewsKey ? 'Key configured' : 'Mock data (empty feed)'} />
            </div>
            <p className="mt-2 text-sm text-atlas-text-secondary">
              Set <code className="rounded bg-atlas-surface-raised px-1">NEWS_API_KEY</code> with a{' '}
              <a href="https://finnhub.io" className="text-atlas-accent-bright underline" target="_blank" rel="noreferrer">
                Finnhub
              </a>{' '}
              key. Sentiment and materiality are computed deterministically from the real fetched text (see{' '}
              <code className="rounded bg-atlas-surface-raised px-1">lib/integrations/newsScoring.ts</code>) — never invented. Sector
              coverage (AI, semiconductors, defense, aerospace, robotics, data centers, energy, cybersecurity) is
              sourced via representative sector-ETF company news, documented in{' '}
              <code className="rounded bg-atlas-surface-raised px-1">lib/integrations/news.ts</code>.
            </p>
            <FreshnessLine freshness={newsFreshness} />
          </div>

          <div className="atlas-glass rounded-xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-atlas-text">Fundamentals — Financial Modeling Prep (statements, ratios, ownership, earnings)</h3>
              <StatusPill ok={hasFundamentalsKey} label={hasFundamentalsKey ? 'Key configured' : 'Mock data'} />
            </div>
            <p className="mt-2 text-sm text-atlas-text-secondary">
              Set <code className="rounded bg-atlas-surface-raised px-1">FUNDAMENTALS_API_KEY</code> with a{' '}
              <a href="https://financialmodelingprep.com" className="text-atlas-accent-bright underline" target="_blank" rel="noreferrer">
                Financial Modeling Prep
              </a>{' '}
              key. Powers the historical financial-statement/ratio ingestion (
              <code className="rounded bg-atlas-surface-raised px-1">lib/jobs/ingestFundamentals.ts</code>) and the forward earnings calendar
              (<code className="rounded bg-atlas-surface-raised px-1">lib/jobs/ingestEarnings.ts</code>), which together populate the
              revenue-growth and balance-sheet conviction categories that were previously unavailable.
            </p>
            <FreshnessLine freshness={fundamentalsFreshness} />
          </div>

          <div className="atlas-glass rounded-xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-atlas-text">Alert delivery — email &amp; webhook</h3>
              <StatusPill ok={hasEmailChannel || hasWebhookChannel} label={hasEmailChannel || hasWebhookChannel ? 'At least one channel configured' : 'No channel configured'} />
            </div>
            <p className="mt-2 text-sm text-atlas-text-secondary">
              Set <code className="rounded bg-atlas-surface-raised px-1">SMTP_HOST</code>/<code className="rounded bg-atlas-surface-raised px-1">ALERT_EMAIL_TO</code> for
              email (any SMTP server) and/or <code className="rounded bg-atlas-surface-raised px-1">ALERT_WEBHOOK_URL</code> for a webhook.
              Delivery runs through provider interfaces (
              <code className="rounded bg-atlas-surface-raised px-1">lib/integrations/notifications.ts</code>) completely separate from alert
              generation — adding Slack/Discord/SMS/push later means adding one provider class, not touching the
              alert engine. Without any channel configured, alerts are still generated and stored, just not
              delivered anywhere.
            </p>
          </div>

          <div className="atlas-glass rounded-xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-atlas-text">SEC EDGAR filings</h3>
              <StatusPill ok={edgar.ok} label={edgar.ok ? 'Live (public API)' : 'Unreachable'} />
            </div>
            <p className="mt-2 text-sm text-atlas-text-secondary">
              Already implemented against the real public EDGAR API — no key required, just a contact User-Agent.{' '}
              {hasEdgarUserAgent ? 'A custom User-Agent is configured.' : 'Set SEC_EDGAR_USER_AGENT with a real contact email before relying on this in production.'}
            </p>
            <FreshnessLine freshness={secFreshness} />
          </div>
        </div>
      </FadeInView>
    </div>
  );
}
