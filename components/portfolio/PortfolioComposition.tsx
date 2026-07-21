'use client';

import { useState } from 'react';
import Link from 'next/link';
import AllocationDonut from '@/components/charts/AllocationDonut';
import HoldingsTable from './HoldingsTable';
import type { HoldingView } from '@/lib/domain/portfolio';

const PALETTE = ['#8b5cf6', '#87828f', '#d946ef', '#a6a1b3', '#4c1d95', '#5c5866', '#c4b5fd', '#3f3c48', '#701a75'];

/**
 * Ties the allocation donut and the holdings table together with one
 * piece of shared state: click a symbol in the legend to filter the table
 * down to that holding, click again (or "Clear filter") to reset. This is
 * the "allocation filtering" interaction — the chart and the table read as
 * one composed view instead of two unrelated widgets on the same page.
 */
export default function PortfolioComposition({ holdings, totalValue, cashBalance }: { holdings: HoldingView[]; totalValue: number; cashBalance: number }) {
  const [selected, setSelected] = useState<string | null>(null);

  const slices = [
    ...holdings.map((h) => ({ label: h.symbol, value: totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0 })),
    ...(cashBalance > 0 ? [{ label: 'Cash', value: totalValue > 0 ? (cashBalance / totalValue) * 100 : 0 }] : []),
  ];

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
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Holdings</h2>
          <p className="text-xs text-atlas-text-tertiary">
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
        <HoldingsTable holdings={holdings} totalValue={totalValue} filterSymbol={selected} onClearFilter={() => setSelected(null)} />
      </div>
    </div>
  );
}
