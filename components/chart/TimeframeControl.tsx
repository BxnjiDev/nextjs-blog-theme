'use client';

import { useEffect } from 'react';
import SegmentedControl, { type SegmentedOption } from '@/components/ui/SegmentedControl';
import { INTERVALS, type Interval } from '@/lib/marketdata/types';

const LABEL: Record<Interval, string> = { '30m': '30m', '1h': '1h', '4h': '4h', '1D': '1D', '1W': '1W' };
const STORAGE_KEY = 'atlas:lastChartTimeframe';

const OPTIONS: SegmentedOption<Interval>[] = INTERVALS.map((interval) => ({ value: interval, label: LABEL[interval] }));

/**
 * Remembers the user's most recently selected timeframe across chart
 * views via localStorage — a display preference for "which timeframe did
 * I last look at," not an investment preference or portfolio setting, so
 * it deliberately does NOT go through the app's Prisma-backed settings
 * model (lib/domain's account/settings tables). Purely a client-side
 * convenience; if storage is unavailable (private browsing, SSR) it just
 * falls back to the caller's initial value every time.
 */
export function getLastTimeframe(fallback: Interval): Interval {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && (INTERVALS as readonly string[]).includes(stored) ? (stored as Interval) : fallback;
  } catch {
    return fallback;
  }
}

export default function TimeframeControl({ value, onChange, className }: { value: Interval; onChange: (interval: Interval) => void; className?: string }) {
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Private-browsing/storage-disabled — the selection just won't persist across visits.
    }
  }, [value]);

  return <SegmentedControl value={value} onChange={onChange} options={OPTIONS} className={className} />;
}
