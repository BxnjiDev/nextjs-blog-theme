import { describe, it, expect, afterEach } from 'vitest';
import { checkAllProviders } from './providerReadiness';

const originalMode = process.env.ATLAS_MODE;

afterEach(() => {
  if (originalMode === undefined) delete process.env.ATLAS_MODE;
  else process.env.ATLAS_MODE = originalMode;
});

describe('checkAllProviders', () => {
  it('reports one entry per known provider, in a stable set of keys', async () => {
    const results = await checkAllProviders();
    const keys = results.map((r) => r.key).sort();
    expect(keys).toEqual(['claude', 'financialmodelingprep', 'finnhub', 'postgresql', 'robinhood-sync', 'sec-edgar', 'twelvedata'].sort());
  });

  it('never reports authOk/authError derived from a raw secret value (only masked/boolean signals)', async () => {
    const results = await checkAllProviders();
    for (const r of results) {
      if (r.authError) {
        // A real key is at minimum ~20 opaque chars; if one leaked whole
        // into the error string this would catch the common shapes.
        expect(r.authError).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
      }
    }
  });

  it('unconfigured providers report configured:false and a non-empty setup instruction', async () => {
    const results = await checkAllProviders();
    for (const r of results) {
      if (!r.configured) {
        expect(r.setupInstructions.length).toBeGreaterThan(0);
      }
    }
  });

  it('in development mode, no provider blocks recommendations regardless of configuration', async () => {
    process.env.ATLAS_MODE = 'development';
    const results = await checkAllProviders();
    const gateable = results.filter((r) => ['twelvedata', 'financialmodelingprep', 'claude', 'finnhub'].includes(r.key));
    expect(gateable.every((r) => r.safeForRecommendations)).toBe(true);
  });

  it('in live-evaluation mode, an unconfigured market-data provider is not safe for recommendations', async () => {
    process.env.ATLAS_MODE = 'live-evaluation';
    const results = await checkAllProviders();
    const marketData = results.find((r) => r.key === 'twelvedata')!;
    if (!marketData.configured) {
      expect(marketData.safeForRecommendations).toBe(false);
    }
  });
});
