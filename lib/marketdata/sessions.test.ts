import { describe, it, expect } from 'vitest';
import {
  classifySessionType,
  isMarketOpen,
  isTradingDay,
  isUSMarketHoliday,
  getRegularSessionBoundsUtc,
  exchangeLocalToUtc,
} from './sessions';

describe('classifySessionType', () => {
  it('classifies regular session hours on a weekday (EST)', () => {
    // Wed Jan 15 2025, 15:00 UTC = 10:00 AM EST
    expect(classifySessionType(new Date('2025-01-15T15:00:00Z'))).toBe('regular');
  });

  it('classifies pre-market hours', () => {
    // Wed Jan 15 2025, 12:00 UTC = 7:00 AM EST
    expect(classifySessionType(new Date('2025-01-15T12:00:00Z'))).toBe('pre_market');
  });

  it('classifies after-hours', () => {
    // Wed Jan 15 2025, 22:00 UTC = 5:00 PM EST
    expect(classifySessionType(new Date('2025-01-15T22:00:00Z'))).toBe('after_hours');
  });

  it('classifies overnight hours as closed', () => {
    // Wed Jan 15 2025, 05:00 UTC = midnight EST
    expect(classifySessionType(new Date('2025-01-15T05:00:00Z'))).toBe('closed');
  });

  it('classifies a weekend as closed even during regular-session clock hours', () => {
    // Sat Jan 18 2025, 15:00 UTC = 10:00 AM EST
    expect(classifySessionType(new Date('2025-01-18T15:00:00Z'))).toBe('closed');
  });

  it('classifies a market holiday as closed even during regular-session clock hours', () => {
    // Independence Day (observed) 2025-07-04, 15:00 UTC = 11:00 AM EDT
    expect(classifySessionType(new Date('2025-07-04T15:00:00Z'))).toBe('closed');
  });
});

describe('isMarketOpen', () => {
  it('is true only for the regular session', () => {
    expect(isMarketOpen(new Date('2025-01-15T15:00:00Z'))).toBe(true);
    expect(isMarketOpen(new Date('2025-01-15T12:00:00Z'))).toBe(false);
  });
});

describe('isUSMarketHoliday', () => {
  it('recognizes New Year\'s Day', () => {
    expect(isUSMarketHoliday(2025, 1, 1)).toBe(true);
  });

  it('recognizes Independence Day', () => {
    expect(isUSMarketHoliday(2025, 7, 4)).toBe(true);
  });

  it('recognizes Thanksgiving (4th Thursday of November)', () => {
    expect(isUSMarketHoliday(2025, 11, 27)).toBe(true);
  });

  it('recognizes Good Friday (computed from Easter)', () => {
    // Easter 2025 is April 20 -> Good Friday is April 18
    expect(isUSMarketHoliday(2025, 4, 18)).toBe(true);
  });

  it('shifts a weekend-observed fixed holiday to the nearest weekday', () => {
    // July 4, 2026 falls on a Saturday -> observed Friday July 3
    expect(isUSMarketHoliday(2026, 7, 3)).toBe(true);
    expect(isUSMarketHoliday(2026, 7, 4)).toBe(false);
  });

  it('does not flag an ordinary trading day', () => {
    expect(isUSMarketHoliday(2025, 1, 15)).toBe(false);
  });

  it('recognizes Juneteenth only from 2022 onward', () => {
    expect(isUSMarketHoliday(2022, 6, 20)).toBe(true); // observed Monday (June 19 is a Sunday)
    expect(isUSMarketHoliday(2021, 6, 19)).toBe(false);
  });
});

describe('isTradingDay', () => {
  it('is true on an ordinary weekday', () => {
    expect(isTradingDay(new Date('2025-01-15T15:00:00Z'))).toBe(true);
  });

  it('is false on a weekend', () => {
    expect(isTradingDay(new Date('2025-01-18T15:00:00Z'))).toBe(false);
  });

  it('is false on a market holiday', () => {
    expect(isTradingDay(new Date('2025-01-01T15:00:00Z'))).toBe(false);
  });
});

describe('getRegularSessionBoundsUtc', () => {
  it('returns null for a weekend date', () => {
    expect(getRegularSessionBoundsUtc(2025, 1, 18)).toBeNull();
  });

  it('returns null for a holiday date', () => {
    expect(getRegularSessionBoundsUtc(2025, 1, 1)).toBeNull();
  });

  it('returns the 9:30-16:00 ET session bounds (as UTC) for a trading day', () => {
    const bounds = getRegularSessionBoundsUtc(2025, 1, 15);
    expect(bounds).not.toBeNull();
    expect(bounds!.open.toISOString()).toBe(exchangeLocalToUtc(2025, 1, 15, 9, 30).toISOString());
    expect(bounds!.close.toISOString()).toBe(exchangeLocalToUtc(2025, 1, 15, 16, 0).toISOString());
    expect(bounds!.close.getTime() - bounds!.open.getTime()).toBe(6.5 * 60 * 60 * 1000);
  });
});
