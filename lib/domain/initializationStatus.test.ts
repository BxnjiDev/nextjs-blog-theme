import { describe, it, expect } from 'vitest';
import { providerState, providerDetail, syncState, syncDetail } from './initializationStatus';
import type { DataSourceFreshness } from './dataFreshness';
import type { GlobalStatus } from './globalStatus';

function freshness(overrides: Partial<DataSourceFreshness> = {}): DataSourceFreshness {
  return {
    provider: 'test',
    label: 'Test provider',
    configured: true,
    lastUpdated: new Date(),
    staleness: 'fresh',
    reliabilityPct: null,
    avgLatencyMs: null,
    ...overrides,
  };
}

describe('initializationStatus — provider readiness mapping (post-login init sequence)', () => {
  it('reports not_configured for an unconfigured (mock) provider regardless of staleness', () => {
    expect(providerState(freshness({ configured: false, staleness: 'stale' }))).toBe('not_configured');
    expect(providerDetail('Market data', freshness({ configured: false }))).toMatch(/mock\/development mode/);
  });

  it('reports ready for fresh or aging data on a configured provider', () => {
    expect(providerState(freshness({ staleness: 'fresh' }))).toBe('ready');
    expect(providerState(freshness({ staleness: 'aging' }))).toBe('ready');
  });

  it('reports stale for stale data on a configured provider', () => {
    expect(providerState(freshness({ staleness: 'stale' }))).toBe('stale');
    expect(providerDetail('Market data', freshness({ staleness: 'stale' }))).toMatch(/stale/);
  });

  it('reports unavailable when staleness cannot be determined', () => {
    expect(providerState(freshness({ staleness: 'unknown' }))).toBe('unavailable');
  });
});

describe('initializationStatus — Robinhood sync readiness mapping', () => {
  const base: GlobalStatus['robinhoodSync'] = { lastSyncedAt: null, success: null, ageHours: null };

  it('reports not_configured when never synced', () => {
    expect(syncState(base)).toBe('not_configured');
    expect(syncDetail(base)).toMatch(/not synchronized/i);
  });

  it('reports unavailable when the last sync attempt was rejected', () => {
    const sync = { ...base, lastSyncedAt: new Date(), success: false, ageHours: 1 };
    expect(syncState(sync)).toBe('unavailable');
    expect(syncDetail(sync)).toMatch(/rejected/i);
  });

  it('reports stale when the last successful sync is older than 24h', () => {
    const sync = { ...base, lastSyncedAt: new Date(), success: true, ageHours: 48 };
    expect(syncState(sync)).toBe('stale');
    expect(syncDetail(sync)).toMatch(/stale/i);
  });

  it('reports ready for a recent successful sync', () => {
    const sync = { ...base, lastSyncedAt: new Date(), success: true, ageHours: 2 };
    expect(syncState(sync)).toBe('ready');
    expect(syncDetail(sync)).toMatch(/recently synchronized/i);
  });
});
