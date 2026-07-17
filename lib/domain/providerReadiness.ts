import { prisma } from '@/lib/prisma';
import {
  checkTwelveDataAuth,
  checkFinnhubAuth,
  checkFmpAuth,
  checkClaudeAuth,
  checkSecEdgarReachability,
} from '@/lib/integrations';
import { callStats } from './dataFreshness';
import { getOperatingMode, isLiveEvaluationMode } from './operatingMode';

export interface ProviderReadiness {
  key: string;
  label: string;
  configured: boolean;
  /** null = not applicable / not checked this run (e.g. postgres uses its
   * own dedicated check, robinhood-sync-input has no "auth" concept). */
  authOk: boolean | null;
  authError: string | null;
  latencyMs: number | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  reliabilityPct: number | null;
  retryPolicy: string;
  mockFallbackActive: boolean;
  safeForRecommendations: boolean;
  setupInstructions: string;
}

/** ProviderCallLog rows only exist for providers timedProviderCall() has
 * actually wrapped (see lib/integrations/retry.ts) — the retry policy
 * itself isn't stored per-row (retries are exhausted before one row is
 * logged, by design), so it's reported here as the static, code-level
 * fact it actually is. */
const RETRY_POLICIES: Record<string, string> = {
  twelvedata: '3 attempts, 300ms base backoff (exponential + jitter)',
  finnhub: '3 attempts, 300ms base backoff (exponential + jitter)',
  financialmodelingprep: '3 attempts, 300ms base backoff (exponential + jitter)',
  'sec-edgar': '3 attempts, 300ms base backoff (exponential + jitter)',
  claude: '2 attempts, 300ms base backoff — capped lower than the others since this runs per-holding in a batch job',
};

async function latestCallAt(provider: string, outcome: 'SUCCESS' | 'FAILURE'): Promise<Date | null> {
  const row = await prisma.providerCallLog.findFirst({ where: { provider, outcome }, orderBy: { calledAt: 'desc' }, select: { calledAt: true } });
  return row?.calledAt ?? null;
}

async function mostRecentOutcome(provider: string): Promise<'SUCCESS' | 'FAILURE' | 'FALLBACK' | null> {
  const row = await prisma.providerCallLog.findFirst({ where: { provider }, orderBy: { calledAt: 'desc' }, select: { outcome: true } });
  return row?.outcome ?? null;
}

async function checkMarketData(): Promise<ProviderReadiness> {
  const configured = Boolean(process.env.MARKET_DATA_API_KEY);
  const [auth, lastSuccessAt, lastFailureAt, stats, mostRecent] = await Promise.all([
    configured ? checkTwelveDataAuth() : Promise.resolve(null),
    latestCallAt('twelvedata', 'SUCCESS'),
    latestCallAt('twelvedata', 'FAILURE'),
    callStats('twelvedata'),
    mostRecentOutcome('twelvedata'),
  ]);
  const mockFallbackActive = !configured || mostRecent === 'FALLBACK';
  return {
    key: 'twelvedata',
    label: 'Market data (Twelve Data)',
    configured,
    authOk: auth?.ok ?? null,
    authError: auth?.error ?? null,
    latencyMs: auth?.latencyMs ?? stats.avgLatencyMs,
    lastSuccessAt,
    lastFailureAt,
    reliabilityPct: stats.reliabilityPct,
    retryPolicy: RETRY_POLICIES.twelvedata,
    mockFallbackActive,
    safeForRecommendations: isLiveEvaluationMode() ? configured && (auth?.ok ?? false) && !mockFallbackActive : true,
    setupInstructions: configured
      ? 'Configured.'
      : 'Set MARKET_DATA_API_KEY in .env with a Twelve Data key (https://twelvedata.com) to use real quotes/history/fundamentals instead of mock data.',
  };
}

async function checkNews(): Promise<ProviderReadiness> {
  const configured = Boolean(process.env.NEWS_API_KEY);
  const [auth, lastSuccessAt, lastFailureAt, stats, mostRecent] = await Promise.all([
    configured ? checkFinnhubAuth() : Promise.resolve(null),
    latestCallAt('finnhub', 'SUCCESS'),
    latestCallAt('finnhub', 'FAILURE'),
    callStats('finnhub'),
    mostRecentOutcome('finnhub'),
  ]);
  const mockFallbackActive = !configured || mostRecent === 'FALLBACK';
  return {
    key: 'finnhub',
    label: 'Financial news (Finnhub)',
    configured,
    authOk: auth?.ok ?? null,
    authError: auth?.error ?? null,
    latencyMs: auth?.latencyMs ?? stats.avgLatencyMs,
    lastSuccessAt,
    lastFailureAt,
    reliabilityPct: stats.reliabilityPct,
    retryPolicy: RETRY_POLICIES.finnhub,
    mockFallbackActive,
    // News is never gating (empty news is explicitly acceptable) — always
    // "safe," configured or not, real or mock.
    safeForRecommendations: true,
    setupInstructions: configured
      ? 'Configured.'
      : 'Set NEWS_API_KEY in .env with a Finnhub key (https://finnhub.io) to use real news instead of an always-empty feed. An empty feed is safe to use as-is (never fabricated headlines).',
  };
}

async function checkFundamentals(): Promise<ProviderReadiness> {
  const configured = Boolean(process.env.FUNDAMENTALS_API_KEY);
  const [auth, lastSuccessAt, lastFailureAt, stats, mostRecent] = await Promise.all([
    configured ? checkFmpAuth() : Promise.resolve(null),
    latestCallAt('financialmodelingprep', 'SUCCESS'),
    latestCallAt('financialmodelingprep', 'FAILURE'),
    callStats('financialmodelingprep'),
    mostRecentOutcome('financialmodelingprep'),
  ]);
  const mockFallbackActive = !configured || mostRecent === 'FALLBACK';
  return {
    key: 'financialmodelingprep',
    label: 'Fundamentals (Financial Modeling Prep)',
    configured,
    authOk: auth?.ok ?? null,
    authError: auth?.error ?? null,
    latencyMs: auth?.latencyMs ?? stats.avgLatencyMs,
    lastSuccessAt,
    lastFailureAt,
    reliabilityPct: stats.reliabilityPct,
    retryPolicy: RETRY_POLICIES.financialmodelingprep,
    mockFallbackActive,
    safeForRecommendations: isLiveEvaluationMode() ? configured && (auth?.ok ?? false) && !mockFallbackActive : true,
    setupInstructions: configured
      ? 'Configured.'
      : 'Set FUNDAMENTALS_API_KEY in .env with a Financial Modeling Prep key (https://financialmodelingprep.com) to use real financial statements/ratios/ownership/earnings instead of mock data.',
  };
}

async function checkSecEdgar(): Promise<ProviderReadiness> {
  const [reach, lastSuccessAt, lastFailureAt, stats] = await Promise.all([
    checkSecEdgarReachability(),
    latestCallAt('sec-edgar', 'SUCCESS'),
    latestCallAt('sec-edgar', 'FAILURE'),
    callStats('sec-edgar'),
  ]);
  return {
    key: 'sec-edgar',
    label: 'SEC EDGAR filings',
    configured: true, // no key required
    authOk: reach.ok,
    authError: reach.error ?? null,
    latencyMs: reach.latencyMs,
    lastSuccessAt,
    lastFailureAt,
    reliabilityPct: stats.reliabilityPct,
    retryPolicy: RETRY_POLICIES['sec-edgar'],
    mockFallbackActive: false, // no mock exists for EDGAR — real or unreachable, never mock
    safeForRecommendations: reach.ok,
    setupInstructions: process.env.SEC_EDGAR_USER_AGENT
      ? 'Configured.'
      : 'Set SEC_EDGAR_USER_AGENT in .env with a real contact email — SEC requests fair-access contact info. Filings still work without it (a placeholder User-Agent is used), but set this before relying on it in production.',
  };
}

async function checkClaude(): Promise<ProviderReadiness> {
  const configured = Boolean(process.env.ANTHROPIC_API_KEY);
  const [auth, lastSuccessAt, lastFailureAt, stats, mostRecent] = await Promise.all([
    configured ? checkClaudeAuth() : Promise.resolve(null),
    latestCallAt('claude', 'SUCCESS'),
    latestCallAt('claude', 'FAILURE'),
    callStats('claude'),
    mostRecentOutcome('claude'),
  ]);
  const mockFallbackActive = !configured || mostRecent === 'FALLBACK';
  return {
    key: 'claude',
    label: 'AI reasoning (Anthropic Claude)',
    configured,
    authOk: auth?.ok ?? null,
    authError: auth?.error ?? null,
    latencyMs: auth?.latencyMs ?? stats.avgLatencyMs,
    lastSuccessAt,
    lastFailureAt,
    reliabilityPct: stats.reliabilityPct,
    retryPolicy: RETRY_POLICIES.claude,
    mockFallbackActive,
    // Without Claude, recommendations fall back to a clearly-labeled
    // deterministic data summary rather than fabricated analysis — that's
    // "safe" in the sense of never lying, but not full-strength reasoning,
    // so it's gated in live-evaluation mode same as the data providers.
    safeForRecommendations: isLiveEvaluationMode() ? configured && (auth?.ok ?? false) && !mockFallbackActive : true,
    setupInstructions: configured
      ? 'Configured.'
      : 'Set ANTHROPIC_API_KEY in .env to generate real thesis/bull/bear/risk analysis. Without it, recommendations use a clearly-labeled deterministic data summary instead.',
  };
}

async function checkRobinhoodSyncInput(): Promise<ProviderReadiness> {
  const [latestSyncLog, latestSuccessLog, latestFailureLog] = await Promise.all([
    prisma.syncLog.findFirst({ orderBy: { syncedAt: 'desc' } }),
    prisma.syncLog.findFirst({ where: { success: true }, orderBy: { syncedAt: 'desc' } }),
    prisma.syncLog.findFirst({ where: { success: false }, orderBy: { syncedAt: 'desc' } }),
  ]);
  const hasSyncSecret = Boolean(process.env.SYNC_SECRET);
  const ageHours = latestSuccessLog ? (Date.now() - latestSuccessLog.syncedAt.getTime()) / (1000 * 60 * 60) : null;
  const fresh = ageHours !== null && ageHours < 24;
  return {
    key: 'robinhood-sync',
    label: 'Robinhood sync input (account/holdings/transactions/open orders reported via CLI or API)',
    // "Configured" here means the CLI/API path is usable at all, not that
    // Atlas is connected to Robinhood — it never is (see ARCHITECTURE.md's
    // "Execution boundary"). The CLI (npm run sync:account) works with just
    // DATABASE_URL; SYNC_SECRET only gates the HTTP API path.
    configured: true,
    authOk: latestSyncLog ? latestSyncLog.success : null,
    authError: latestSyncLog && !latestSyncLog.success ? `Most recent sync (${latestSyncLog.syncedAt.toISOString()}) was rejected — see /connections for details.` : null,
    latencyMs: null,
    lastSuccessAt: latestSuccessLog?.syncedAt ?? null,
    lastFailureAt: latestFailureLog?.syncedAt ?? null,
    reliabilityPct: null,
    retryPolicy: 'Not applicable — human/agent-reported input, not a polled network call. Re-run npm run sync:account to retry.',
    mockFallbackActive: false,
    safeForRecommendations: isLiveEvaluationMode() ? fresh : true,
    setupInstructions: hasSyncSecret
      ? 'SYNC_SECRET is set (API path enabled). CLI path (npm run sync:account) never needs it.'
      : 'SYNC_SECRET is not set — POST /api/sync/account will refuse every request. The CLI (npm run sync:account) does not need it, since it writes to Postgres directly.',
  };
}

async function checkPostgres(): Promise<ProviderReadiness> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      key: 'postgresql',
      label: 'PostgreSQL',
      configured: Boolean(process.env.DATABASE_URL),
      authOk: true,
      authError: null,
      latencyMs: Date.now() - start,
      lastSuccessAt: new Date(),
      lastFailureAt: null,
      reliabilityPct: null,
      retryPolicy: 'Managed by Prisma\'s own connection pool — not tracked via ProviderCallLog.',
      mockFallbackActive: false,
      safeForRecommendations: true,
      setupInstructions: 'Connected.',
    };
  } catch (err) {
    return {
      key: 'postgresql',
      label: 'PostgreSQL',
      configured: Boolean(process.env.DATABASE_URL),
      authOk: false,
      authError: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
      lastSuccessAt: null,
      lastFailureAt: new Date(),
      reliabilityPct: null,
      retryPolicy: 'Managed by Prisma\'s own connection pool — not tracked via ProviderCallLog.',
      mockFallbackActive: false,
      safeForRecommendations: false,
      setupInstructions: 'Set DATABASE_URL in .env to a reachable Postgres instance, then run npm run db:migrate.',
    };
  }
}

/**
 * The single readiness check every consumer uses — `npm run
 * providers:check` (scripts/checkProviders.ts) and the /connections
 * operations dashboard both call this, so there's one implementation of
 * "is provider X ready," not two that can drift apart.
 */
export async function checkAllProviders(): Promise<ProviderReadiness[]> {
  return Promise.all([
    checkMarketData(),
    checkNews(),
    checkFundamentals(),
    checkSecEdgar(),
    checkClaude(),
    checkRobinhoodSyncInput(),
    checkPostgres(),
  ]);
}

export { getOperatingMode };
