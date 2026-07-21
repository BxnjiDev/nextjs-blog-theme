'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Orbit, Table2 } from 'lucide-react';
import AllocationDonut from '@/components/charts/AllocationDonut';
import HoldingsTable from './HoldingsTable';
import HoldingsConstellation from './HoldingsConstellation';
import type { HoldingView } from '@/lib/domain/portfolio';

const PALETTE = ['#8b5cf6', '#87828f', '#d946ef', '#a6a1b3', '#4c1d95', '#5c5866', '#c4b5fd', '#3f3c48', '#701a75'];

type View = 'constellation' | 'table';

/**
 * Ties the allocation donut and the holdings view together with one piece
 * of shared state: click a symbol in the legend to filter down to that
 * holding, click again (or "Clear filter") to reset. The holdings
 * centerpiece itself is a view toggle — a golden-angle "constellation"
 * scatter (each holding is a node you look into, sized by position value,
 * ringed by conviction) as the default, with the original sortable table
 * fully preserved as a switchable alternative for anyone who wants rows and
 * columns instead. Below `sm`, the constellation doesn't translate to a
 * 390px screen, so the table's own mobile card view is always used there
 * regardless of which view is selected.
 */
export default function PortfolioComposition({ holdings, totalValue, cashBalance }: { holdings: HoldingView[]; totalValue: number; cashBalance: number }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>('constellation');

  const slices = [
    ...holdings.map((h) => ({ label: h.symbol, value: totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0 })),
    ...(cashBalance > 0 ? [{ label: 'Cash', value: totalValue > 0 ? (cashBalance / totalValue) * 100 : 0 }] : []),
  ];

  const visibleHoldings = selected ? holdings.filter((h) => h.symbol === selected) : holdings;

  function toggle(symbol: string) {
    setSelected((prev) => (prev === symbol ? null : symbol));
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[280px_1fr]">
      <div className="atlas-glass rounded-2xl p-5">
        <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Allocation</h2>
        <AllocationDonut height={200} data={slices} />
        <ul className="mt-2 space-y-1">
          {slices.map((s, i) => {
            const isHolding = s.label !== 'Cash';
            const active = selected === s.label;
            return (
              <li key={s.label}>
                <button
                  type="button"
                  disabled={!isHolding}
                  onClick={() => isHolding && toggle(s.label)}
                  aria-pressed={active}
                  className={`atlas-press flex w-full items-center justify-between rounded-md px-1.5 py-1 text-xs transition-colors ${
                    isHolding ? 'cursor-pointer hover:bg-atlas-surface-hover' : 'cursor-default'
                  } ${active ? 'bg-atlas-surface-raised text-atlas-text' : 'text-atlas-text-secondary'}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: isHolding ? PALETTE[i % PALETTE.length] : '#5c5866' }} aria-hidden="true" />
                    {s.label}
                  </span>
                  <span className="font-mono text-atlas-text-tertiary">{s.value.toFixed(1)}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Holdings</h2>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-atlas-border p-0.5">
              <button
                type="button"
                onClick={() => setView('constellation')}
                aria-pressed={view === 'constellation'}
                className={`atlas-press hidden items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors sm:flex ${
                  view === 'constellation' ? 'bg-atlas-surface-raised text-atlas-text' : 'text-atlas-text-tertiary hover:text-atlas-text-secondary'
                }`}
              >
                <Orbit size={13} strokeWidth={1.75} aria-hidden="true" />
                Constellation
              </button>
              <button
                type="button"
                onClick={() => setView('table')}
                aria-pressed={view === 'table'}
                className={`atlas-press flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  view === 'table' ? 'bg-atlas-surface-raised text-atlas-text' : 'text-atlas-text-tertiary hover:text-atlas-text-secondary'
                }`}
              >
                <Table2 size={13} strokeWidth={1.75} aria-hidden="true" />
                Table
              </button>
            </div>
            <p className="hidden text-xs text-atlas-text-tertiary lg:block">
              Deeper analysis on{' '}
              <Link href="/intelligence" className="underline decoration-atlas-border hover:decoration-atlas-text-secondary">
                Intelligence
              </Link>{' '}
              and{' '}
              <Link href="/health" className="underline decoration-atlas-border hover:decoration-atlas-text-secondary">
                Health
              </Link>
            </p>
          </div>
        </div>

        {view === 'constellation' && selected && (
          <p className="mb-3 text-xs text-atlas-text-tertiary sm:block">
            Showing <span className="font-medium text-atlas-text">{selected}</span> only ·{' '}
            <button type="button" onClick={() => setSelected(null)} className="underline decoration-atlas-border hover:decoration-atlas-accent-bright">
              Clear filter
            </button>
          </p>
        )}

        {view === 'constellation' && (
          <div className="hidden sm:block">
            <HoldingsConstellation holdings={visibleHoldings} totalValue={totalValue} />
          </div>
        )}

        <div className={view === 'constellation' ? 'sm:hidden' : ''}>
          <HoldingsTable holdings={holdings} totalValue={totalValue} filterSymbol={selected} onClearFilter={() => setSelected(null)} />
        </div>
      </div>
    </div>
  );
}
