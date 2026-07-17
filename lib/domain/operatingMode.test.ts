import { describe, it, expect, afterEach } from 'vitest';
import { getOperatingMode, isLiveEvaluationMode } from './operatingMode';

const original = process.env.ATLAS_MODE;

afterEach(() => {
  if (original === undefined) delete process.env.ATLAS_MODE;
  else process.env.ATLAS_MODE = original;
});

describe('getOperatingMode', () => {
  it('defaults to development when ATLAS_MODE is unset', () => {
    delete process.env.ATLAS_MODE;
    expect(getOperatingMode()).toBe('development');
    expect(isLiveEvaluationMode()).toBe(false);
  });

  it('recognizes live-evaluation', () => {
    process.env.ATLAS_MODE = 'live-evaluation';
    expect(getOperatingMode()).toBe('live-evaluation');
    expect(isLiveEvaluationMode()).toBe(true);
  });

  it('is case-insensitive', () => {
    process.env.ATLAS_MODE = 'LIVE-EVALUATION';
    expect(getOperatingMode()).toBe('live-evaluation');
  });

  it('falls back to development for an unrecognized value rather than throwing', () => {
    process.env.ATLAS_MODE = 'production';
    expect(getOperatingMode()).toBe('development');
  });
});
