import { describe, it, expect } from 'vitest';
import { getMarketStatus } from './marketHours';

// All times below are constructed as UTC instants and checked against known
// America/New_York offsets (EST = UTC-5, EDT = UTC-4) for specific dates.
describe('getMarketStatus', () => {
  it('reports open during regular weekday hours (EST)', () => {
    // Wed Jan 15 2025, 15:00 UTC = 10:00 AM EST
    const status = getMarketStatus(new Date('2025-01-15T15:00:00Z'));
    expect(status.isOpen).toBe(true);
    expect(status.label).toBe('Market open');
  });

  it('reports closed before the open (EST)', () => {
    // Wed Jan 15 2025, 13:00 UTC = 8:00 AM EST
    const status = getMarketStatus(new Date('2025-01-15T13:00:00Z'));
    expect(status.isOpen).toBe(false);
    expect(status.detail).toMatch(/Opens in/);
  });

  it('reports closed after the close (EST)', () => {
    // Wed Jan 15 2025, 22:00 UTC = 5:00 PM EST
    const status = getMarketStatus(new Date('2025-01-15T22:00:00Z'));
    expect(status.isOpen).toBe(false);
  });

  it('reports closed on a weekend', () => {
    // Sat Jan 18 2025, 15:00 UTC = 10:00 AM EST
    const status = getMarketStatus(new Date('2025-01-18T15:00:00Z'));
    expect(status.isOpen).toBe(false);
    expect(status.detail).toMatch(/next weekday/);
  });

  it('reports open during regular weekday hours (EDT, summer)', () => {
    // Wed Jul 16 2025, 14:00 UTC = 10:00 AM EDT
    const status = getMarketStatus(new Date('2025-07-16T14:00:00Z'));
    expect(status.isOpen).toBe(true);
  });
});
