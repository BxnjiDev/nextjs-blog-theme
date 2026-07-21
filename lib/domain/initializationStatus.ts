import { prisma } from '@/lib/prisma';
import { getGlobalStatus, type GlobalStatus } from './globalStatus';
import { getActiveAccountId } from './portfolio';
import type { DataSourceFreshness } from './dataFreshness';

export type ReadinessState = 'ready' | 'degraded' | 'not_configured' | 'stale' | 'unavailable';

export interface InitializationLine {
  label: string;
  state: ReadinessState;
  detail: string;
}

export interface InitializationSummary {
  lines: InitializationLine[];
  /** One or more short, honest sentences — deterministically composed
   * from already-computed status values below, exactly like
   * lib/copy/homeNarrative.ts. Never calls an LLM and never states an
   * investment conclusion; it only reports what is or isn't ready. */
  narrative: string;
}

export function providerState(source: DataSourceFreshness): ReadinessState {
  if (!source.configured) return 'not_configured';
  if (source.staleness === 'stale') return 'stale';
  if (source.staleness === 'unknown') return 'unavailable';
  return 'ready'; // 'fresh' or 'aging' — aging is still within tolerance, not yet stale
}

export function providerDetail(label: string, source: DataSourceFreshness): string {
  if (!source.configured) return `${label} running in mock/development mode.`;
  if (source.staleness === 'stale') return `${label} data is stale.`;
  if (source.staleness === 'unknown') return `${label} freshness could not be determined.`;
  return `${label} is live.`;
}

export function syncState(sync: GlobalStatus['robinhoodSync']): ReadinessState {
  if (!sync.lastSyncedAt) return 'not_configured';
  if (sync.success === false) return 'unavailable';
  if (sync.ageHours !== null && sync.ageHours > 24) return 'stale';
  return 'ready';
}

export function syncDetail(sync: GlobalStatus['robinhoodSync']): string {
  if (!sync.lastSyncedAt) return 'Not synchronized yet.';
  if (sync.success === false) return 'Last synchronization attempt was rejected.';
  if (sync.ageHours !== null && sync.ageHours > 24) return `Last synchronized ${Math.round(sync.ageHours / 24)}d ago — stale.`;
  return 'Recently synchronized.';
}

/**
 * Assembles the honest, deterministic "system readiness" summary shown
 * once per browser session during the post-login initialization
 * sequence (components/init/AtlasInitialization.tsx). Every field here
 * reads an existing signal already used elsewhere in the app (the same
 * GlobalStatus /connections and the top status strip use, plus a couple
 * of cheap existence counts) — this function's only job is composing
 * those into one honest checklist and narrative, not computing anything
 * new. Never blocks on a live provider call (GlobalStatus is DB-only, see
 * its own doc comment) so login is never slowed down waiting on an
 * external API.
 */
export async function getInitializationSummary(): Promise<InitializationSummary> {
  const [status, accountId] = await Promise.all([getGlobalStatus(), getActiveAccountId()]);

  const [thesisCount, riskCount] = await Promise.all([
    accountId ? prisma.thesis.count({ where: { holding: { accountId } } }) : Promise.resolve(0),
    // RiskAssessment has no accountId column (single-account-architecture
    // era schema, like PortfolioHealthAssessment) — existence alone is
    // the honest signal available here, same reasoning as those models
    // elsewhere in the app.
    prisma.riskAssessment.count(),
  ]);

  const aiConfigured = !!process.env.ANTHROPIC_API_KEY;

  const lines: InitializationLine[] = [
    { label: 'Atlas Core', state: 'ready', detail: 'Signed in and verified.' },
    {
      label: 'Portfolio memory',
      state: thesisCount > 0 ? 'ready' : 'not_configured',
      detail: thesisCount > 0 ? `${thesisCount} thesis record${thesisCount === 1 ? '' : 's'} on file.` : 'No thesis established yet.',
    },
    {
      label: 'Risk intelligence',
      state: riskCount > 0 ? 'ready' : 'not_configured',
      detail: riskCount > 0 ? 'Risk assessment on file.' : 'Not yet computed.',
    },
    { label: 'Market-data provider', state: providerState(status.marketData), detail: providerDetail('Market data', status.marketData) },
    { label: 'Robinhood synchronization', state: syncState(status.robinhoodSync), detail: syncDetail(status.robinhoodSync) },
    { label: 'Recommendation safeguards', state: 'ready', detail: 'Recommendation-only boundary active — Atlas never submits an order.' },
    {
      label: 'Conversation interface',
      state: aiConfigured ? 'ready' : 'degraded',
      detail: aiConfigured ? 'Claude reasoning connected.' : 'Heuristic fallback only (no ANTHROPIC_API_KEY configured).',
    },
  ];

  const sentences: string[] = ['Portfolio intelligence ready.', 'Recommendation-only safeguards active.'];
  if (syncState(status.robinhoodSync) === 'not_configured') sentences.push('Robinhood has not been synchronized yet.');
  else if (syncState(status.robinhoodSync) === 'stale') sentences.push('Robinhood synchronization is stale.');
  else if (syncState(status.robinhoodSync) === 'unavailable') sentences.push('The last Robinhood synchronization attempt was rejected.');
  if (!status.marketData.configured) sentences.push('Market intelligence is operating in development mode.');
  if (!aiConfigured) sentences.push('Conversational reasoning is running on heuristic fallback only.');

  return { lines, narrative: sentences.join(' ') };
}
