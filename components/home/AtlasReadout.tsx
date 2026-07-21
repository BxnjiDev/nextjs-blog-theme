'use client';

import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import AtlasCore from '@/components/atlas-identity/AtlasCore';
import AnimatedNumber from '@/components/motion/AnimatedNumber';
import { formatCurrency, formatPercent, formatRelativeTime } from '@/lib/format';
import { atlasStateForScore } from '@/lib/theme/tone';
import type { MarketStatus } from '@/lib/domain/marketHours';

/**
 * The Command Deck's left hero zone — one unified HUD-style reading rather
 * than a boxed metric next to an icon. The Atlas core orb's color/pulse
 * reflects real portfolio health; the value, day change, and the
 * cash/market/sync facts that used to live in a separate four-item stat
 * strip are woven into one compact readout beneath it.
 */
export default function AtlasReadout({
  totalValue,
  dayChangeValue,
  dayChangePercent,
  healthScore,
  previousHealthScore,
  cashBalance,
  market,
  syncStatus,
}: {
  totalValue: number | null;
  dayChangeValue: number;
  dayChangePercent: number;
  healthScore: number | null;
  previousHealthScore: number | null;
  cashBalance: number | null;
  market: MarketStatus;
  syncStatus: { lastSyncedAt: Date | null; success: boolean | null };
}) {
  const positive = dayChangePercent >= 0;
  const state = atlasStateForScore(healthScore);

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <AtlasCore state={state} size="xxl" className="shrink-0" />

      <div className="min-w-0">
        {totalValue == null ? (
          <h1 className="text-3xl font-semibold tracking-tight text-atlas-text">No portfolio connected yet</h1>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-4">
              <AnimatedNumber
                value={totalValue}
                format="currency0"
                className="text-5xl font-semibold tracking-tight text-atlas-text sm:text-6xl"
                duration={1.1}
              />
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium ${
                  positive ? 'bg-risk-low/10 text-risk-low' : 'bg-risk-high/10 text-risk-high'
                }`}
              >
                {positive ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}
                {formatCurrency(Math.abs(dayChangeValue))} ({formatPercent(dayChangePercent)})
                <span className="ml-1 text-xs opacity-70">today</span>
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-atlas-text-tertiary">
              <span className="font-mono">
                Health {healthScore != null ? `${Math.round(healthScore)}/100` : '—'}
                {previousHealthScore != null && <span className="opacity-70"> · was {previousHealthScore}</span>}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  {market.isOpen && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-risk-low opacity-60" />
                  )}
                  <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${market.isOpen ? 'bg-risk-low' : 'bg-atlas-text-tertiary'}`} />
                </span>
                {market.label}
              </span>
              {cashBalance != null && <span className="font-mono">{formatCurrency(cashBalance)} cash</span>}
              <Link href="/connections" className="underline decoration-atlas-border hover:decoration-atlas-accent-bright">
                {!syncStatus.lastSyncedAt
                  ? 'Never synced'
                  : syncStatus.success === false
                    ? 'Last sync rejected'
                    : `Synced ${formatRelativeTime(syncStatus.lastSyncedAt)}`}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
