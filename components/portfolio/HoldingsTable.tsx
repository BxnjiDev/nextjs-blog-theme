'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, Rows3, Rows2 } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/format';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import SegmentedControl from '../ui/SegmentedControl';
import { quoteQualityLabel } from '@/lib/theme/tone';
import { MOTION } from '@/lib/motion/tokens';
import type { HoldingView } from '@/lib/domain/portfolio';

type Density = 'comfortable' | 'compact';

type SortKey = 'symbol' | 'changePercent' | 'marketValue' | 'allocation' | 'unrealizedPnlPercent' | 'convictionScore';
type SortDirection = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'symbol', label: 'Holding' },
  { key: 'changePercent', label: 'Day', align: 'right' },
  { key: 'marketValue', label: 'Value', align: 'right' },
  { key: 'allocation', label: 'Alloc.', align: 'right' },
  { key: 'unrealizedPnlPercent', label: 'Total return', align: 'right' },
  { key: 'convictionScore', label: 'Conviction', align: 'right' },
];

function sortValue(h: HoldingView, totalValue: number, key: SortKey): number | string {
  switch (key) {
    case 'symbol':
      return h.symbol;
    case 'changePercent':
      return h.changePercent;
    case 'marketValue':
      return h.marketValue;
    case 'allocation':
      return totalValue > 0 ? h.marketValue / totalValue : 0;
    case 'unrealizedPnlPercent':
      return h.unrealizedPnlPercent;
    case 'convictionScore':
      return h.convictionScore ?? -1;
  }
}

/**
 * Sortable, expandable holdings — click a header to sort, click a row to
 * reveal cost basis / conviction / thesis-review detail inline rather than
 * navigating away. `filterSymbol` (driven by the allocation legend in
 * components/portfolio/PortfolioComposition.tsx) narrows to one holding at
 * a time; passing it back to `null` clears it. Desktop renders a real
 * <table> with a sticky header; below `sm` it renders as stacked cards
 * instead of a horizontally-scrolling table.
 */
export default function HoldingsTable({
  holdings,
  totalValue,
  filterSymbol,
  onClearFilter,
}: {
  holdings: HoldingView[];
  totalValue: number;
  filterSymbol?: string | null;
  onClearFilter?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'marketValue', direction: 'desc' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>('comfortable');
  const compact = density === 'compact';

  const visible = filterSymbol ? holdings.filter((h) => h.symbol === filterSymbol) : holdings;

  const sorted = useMemo(() => {
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...visible].sort((a, b) => {
      const av = sortValue(a, totalValue, sort.key);
      const bv = sortValue(b, totalValue, sort.key);
      if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * dir;
      return (av - bv) * dir;
    });
  }, [visible, sort, totalValue]);

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'desc' }));
  }

  if (holdings.length === 0) {
    return <EmptyState compact className="py-8">No holdings yet — cash only.</EmptyState>;
  }

  const rowPad = compact ? 'py-2' : 'py-3';

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        {filterSymbol ? (
          <p className="text-xs text-atlas-text-tertiary">
            Showing <span className="font-medium text-atlas-text">{filterSymbol}</span> only ·{' '}
            <button type="button" onClick={onClearFilter} className="underline decoration-atlas-border hover:decoration-atlas-accent-bright">
              Clear filter
            </button>
          </p>
        ) : (
          <p className="text-xs text-atlas-text-tertiary">{holdings.length} holding{holdings.length === 1 ? '' : 's'}</p>
        )}
        <SegmentedControl
          value={density}
          onChange={setDensity}
          options={[
            { value: 'comfortable', label: 'Comfortable', icon: Rows3 },
            { value: 'compact', label: 'Compact', icon: Rows2 },
          ]}
        />
      </div>

      {/* Desktop table */}
      <table className="hidden w-full text-sm sm:table">
        <thead className="sticky top-0 z-10 bg-atlas-canvas text-left text-[11px] uppercase tracking-wide text-atlas-text-tertiary">
          <tr className="border-b border-atlas-border-subtle">
            {COLUMNS.map((col) => {
              const active = sort.key === col.key;
              return (
                <th key={col.key} scope="col" className={`${rowPad} pr-4 font-medium ${col.align === 'right' ? 'text-right' : ''}`} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={`inline-flex items-center gap-1 transition-colors hover:text-atlas-text-secondary ${col.align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-atlas-text-secondary' : ''}`}
                  >
                    {col.label}
                    {active ? (
                      sort.direction === 'asc' ? <ArrowUp size={11} aria-hidden="true" /> : <ArrowDown size={11} aria-hidden="true" />
                    ) : (
                      <ArrowUpDown size={11} className="opacity-40" aria-hidden="true" />
                    )}
                  </button>
                </th>
              );
            })}
            <th scope="col" className={`${rowPad} font-medium`}>
              Data
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h, i) => {
            const expanded = expandedId === h.id;
            const allocation = totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0;
            const quality = quoteQualityLabel(h.quoteQuality, h.quoteAsOf);
            return (
              <Fragment key={h.id}>
                <motion.tr
                  initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: MOTION.duration.panel, delay: reduceMotion ? 0 : i * 0.04, ease: MOTION.ease.standard }}
                  onClick={() => setExpandedId(expanded ? null : h.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setExpandedId(expanded ? null : h.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded}
                  aria-label={`${h.symbol}, ${expanded ? 'collapse' : 'expand'} detail`}
                  className="group cursor-pointer border-b border-atlas-border-subtle/60 text-atlas-text transition-colors hover:bg-atlas-surface-hover focus-visible:bg-atlas-surface-hover"
                >
                  <td className={`${rowPad} pr-4 font-medium`}>
                    <span className="flex items-center gap-1.5">
                      <ChevronRight size={13} className={`shrink-0 text-atlas-text-tertiary transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden="true" />
                      {h.symbol}
                    </span>
                  </td>
                  <td className={`${rowPad} pr-4 text-right font-mono ${h.changePercent >= 0 ? 'text-risk-low' : 'text-risk-high'}`}>{formatPercent(h.changePercent)}</td>
                  <td className={`${rowPad} pr-4 text-right font-mono`}>{formatCurrency(h.marketValue)}</td>
                  <td className={`${rowPad} pr-4 text-right font-mono text-atlas-text-secondary`}>{allocation.toFixed(1)}%</td>
                  <td className={`${rowPad} pr-4 text-right font-mono ${h.unrealizedPnl >= 0 ? 'text-risk-low' : 'text-risk-high'}`}>
                    {formatCurrency(h.unrealizedPnl)} ({formatPercent(h.unrealizedPnlPercent * 100)})
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-atlas-text-secondary">{h.convictionScore != null ? `${h.convictionScore}/100` : '—'}</td>
                  <td className={rowPad}>
                    <Badge tone={quality.tone} title={`As of ${h.quoteAsOf.toLocaleString()}`}>
                      {quality.label}
                    </Badge>
                  </td>
                </motion.tr>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.tr key={`${h.id}-detail`}>
                      <td colSpan={7} className="p-0">
                        <motion.div
                          initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: MOTION.duration.modal, ease: MOTION.ease.standard }}
                          className="overflow-hidden border-b border-atlas-border-subtle bg-atlas-surface-hover/40"
                        >
                          <div className="grid gap-4 px-4 py-4 sm:grid-cols-4">
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Company</p>
                              <p className="mt-1 text-sm text-atlas-text">{h.name}</p>
                              {h.sector && <p className="text-xs text-atlas-text-tertiary">{h.sector}</p>}
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Position</p>
                              <p className="mt-1 font-mono text-sm text-atlas-text">
                                {h.quantity} sh @ {formatCurrency(h.avgCostBasis)}
                              </p>
                              <p className="text-xs text-atlas-text-tertiary">now {formatCurrency(h.currentPrice)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Thesis</p>
                              <p className="mt-1 text-sm text-atlas-text">
                                {h.thesisLastReviewedAt ? `Reviewed ${h.thesisLastReviewedAt.toLocaleDateString()}` : 'Not yet generated'}
                              </p>
                            </div>
                            <div className="flex items-end gap-3 text-xs">
                              <Link href={`/intelligence/${h.symbol}`} className="underline decoration-atlas-border hover:decoration-atlas-accent-bright">
                                Intelligence →
                              </Link>
                              <Link href={`/holdings#${h.symbol}`} className="underline decoration-atlas-border hover:decoration-atlas-accent-bright">
                                Full detail →
                              </Link>
                            </div>
                          </div>
                        </motion.div>
                      </td>
                    </motion.tr>
                  )}
                </AnimatePresence>
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Mobile cards — avoids horizontal scroll on narrow viewports */}
      <div className="space-y-2 sm:hidden">
        {sorted.map((h) => {
          const allocation = totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0;
          const expanded = expandedId === h.id;
          return (
            <div key={h.id} className="rounded-lg border border-atlas-border-subtle">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : h.id)}
                aria-expanded={expanded}
                className="atlas-press flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
              >
                <div>
                  <p className="font-medium text-atlas-text">{h.symbol}</p>
                  <p className="text-xs text-atlas-text-tertiary">{allocation.toFixed(1)}% of portfolio</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-atlas-text">{formatCurrency(h.marketValue)}</p>
                  <p className={`font-mono text-xs ${h.changePercent >= 0 ? 'text-risk-low' : 'text-risk-high'}`}>{formatPercent(h.changePercent)} today</p>
                </div>
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: MOTION.duration.modal, ease: MOTION.ease.standard }}
                    className="overflow-hidden border-t border-atlas-border-subtle"
                  >
                    <div className="space-y-2 px-3 py-3 text-xs text-atlas-text-secondary">
                      <p>{h.name}{h.sector ? ` · ${h.sector}` : ''}</p>
                      <p className="font-mono">
                        {h.quantity} sh @ {formatCurrency(h.avgCostBasis)} · now {formatCurrency(h.currentPrice)}
                      </p>
                      <p className={h.unrealizedPnl >= 0 ? 'text-risk-low' : 'text-risk-high'}>
                        Total return {formatCurrency(h.unrealizedPnl)} ({formatPercent(h.unrealizedPnlPercent * 100)})
                      </p>
                      <p>Conviction {h.convictionScore != null ? `${h.convictionScore}/100` : '—'}</p>
                      <div className="flex gap-3 pt-1">
                        <Link href={`/intelligence/${h.symbol}`} className="underline decoration-atlas-border">
                          Intelligence →
                        </Link>
                        <Link href={`/holdings#${h.symbol}`} className="underline decoration-atlas-border">
                          Full detail →
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
