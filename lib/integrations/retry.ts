import { prisma } from '@/lib/prisma';
import type { ProviderCallOutcome } from '@prisma/client';

export interface RetryOptions {
  /** Max attempts including the first try. Default 3. */
  attempts?: number;
  /** Base delay for exponential backoff (doubles each retry, plus jitter). Default 300ms. */
  baseDelayMs?: number;
  /** Return false to stop retrying immediately (e.g. a 401/403 that a retry can't fix). Default: always retryable. */
  isRetryable?: (err: unknown) => boolean;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generic retry-with-exponential-backoff for a single outbound call.
 * Retries transient failures (network blips, rate limits, timeouts) with
 * jittered exponential backoff, then rethrows the last error once attempts
 * are exhausted. Pure retry logic only — no logging here, since callers
 * (the per-provider Fallback wrappers, via `timedProviderCall` below) own
 * logging so exactly one ProviderCallLog row is written per logical data
 * fetch, not one per retry attempt.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (opts.isRetryable && !opts.isRetryable(err)) throw err;
      if (i < attempts - 1) {
        const jitter = Math.random() * baseDelayMs * 0.5;
        await sleep(baseDelayMs * 2 ** i + jitter);
      }
    }
  }
  throw lastErr;
}

/**
 * Writes one ProviderCallLog row for a completed logical call. Never
 * throws — a logging failure must not break the data fetch it's
 * describing. This is the substrate `getDataFreshnessSnapshot()`
 * (lib/domain/dataFreshness.ts) reads to compute reliabilityPct/avgLatencyMs
 * per source, and is also the general audit trail for "never silently
 * fail": every attempted outbound call leaves a row, success or failure.
 */
export async function logProviderCall(
  provider: string,
  operation: string,
  outcome: ProviderCallOutcome,
  latencyMs: number,
  error?: string
): Promise<void> {
  try {
    await prisma.providerCallLog.create({
      data: { provider, operation, outcome, latencyMs, error: error ?? null },
    });
  } catch (err) {
    console.error(`Failed to write ProviderCallLog for ${provider}.${operation}:`, err);
  }
}

/**
 * Times and logs a single logical provider call, retrying transient
 * failures via `withRetry` first. On success, logs `outcomeOnSuccess`
 * (SUCCESS for a real-provider call, or pass 'FALLBACK' when this call IS
 * the fallback path — e.g. mock data returned after the real provider
 * exhausted its retries). On failure (all retries exhausted), logs FAILURE
 * with the error message and rethrows, so the caller's own fallback logic
 * still runs.
 */
export async function timedProviderCall<T>(
  provider: string,
  operation: string,
  fn: () => Promise<T>,
  retryOpts?: RetryOptions,
  outcomeOnSuccess: ProviderCallOutcome = 'SUCCESS'
): Promise<T> {
  const start = Date.now();
  try {
    const result = await withRetry(fn, retryOpts);
    await logProviderCall(provider, operation, outcomeOnSuccess, Date.now() - start);
    return result;
  } catch (err) {
    await logProviderCall(provider, operation, 'FAILURE', Date.now() - start, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
