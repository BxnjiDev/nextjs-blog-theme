'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { formatCurrency, formatPercent } from '@/lib/format';
import { MOTION } from '@/lib/motion/tokens';
import type { HoldingView } from '@/lib/domain/portfolio';

const GOLDEN_ANGLE_RAD = 137.50776405 * (Math.PI / 180);
const MIN_NODE_PX = 44;
const MAX_NODE_PX = 68;
// Tuned (not just "looks about right") against several representative
// holding-value distributions so that the largest nodes — which land
// closest to the spiral's center, where consecutive indices are also
// closest together radially — clear each other rather than overlapping,
// while the outermost node still clears the container edge.
const SPIRAL_EXTENT_PCT = 44;

interface PlacedNode {
  holding: HoldingView;
  xPct: number;
  yPct: number;
  sizePx: number;
}

/**
 * Deterministic golden-angle (phyllotaxis) spiral — the same packing pattern
 * a sunflower head uses — rather than a physics/collision-detection layout.
 * Holdings are sorted largest-first so the biggest positions sit nearest
 * the center; node diameter scales with sqrt(marketValue) (the standard
 * area-proportional bubble-chart convention) so visual area, not radius,
 * tracks dollar value.
 */
function layoutConstellation(holdings: HoldingView[]): PlacedNode[] {
  if (holdings.length === 0) return [];
  const sorted = [...holdings].sort((a, b) => b.marketValue - a.marketValue);

  const values = sorted.map((h) => h.marketValue);
  const sqrtMax = Math.sqrt(Math.max(...values, 1));
  const sqrtMin = Math.sqrt(Math.max(Math.min(...values), 0));

  function sizeFor(value: number): number {
    if (sqrtMax === sqrtMin) return (MIN_NODE_PX + MAX_NODE_PX) / 2;
    const t = (Math.sqrt(value) - sqrtMin) / (sqrtMax - sqrtMin);
    return MIN_NODE_PX + t * (MAX_NODE_PX - MIN_NODE_PX);
  }

  const n = sorted.length;
  const maxRadiusUnits = Math.sqrt(n) || 1;

  return sorted.map((holding, i) => {
    const radiusUnits = Math.sqrt(i + 0.5) / maxRadiusUnits;
    const angle = i * GOLDEN_ANGLE_RAD;
    const r = radiusUnits * SPIRAL_EXTENT_PCT;
    return {
      holding,
      xPct: 50 + r * Math.cos(angle),
      yPct: 50 + r * Math.sin(angle),
      sizePx: sizeFor(holding.marketValue),
    };
  });
}

export default function HoldingsConstellation({ holdings, totalValue }: { holdings: HoldingView[]; totalValue: number }) {
  const reduceMotion = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const nodes = useMemo(() => layoutConstellation(holdings), [holdings]);
  const selected = nodes.find((n) => n.holding.id === selectedId) ?? null;

  if (holdings.length === 0) {
    return <p className="py-8 text-sm text-atlas-text-tertiary">No holdings yet — cash only.</p>;
  }

  return (
    <div>
      <div className="relative h-[380px] w-full sm:h-[440px]">
        {nodes.map(({ holding: h, xPct, yPct, sizePx }, i) => {
          const positive = h.changePercent >= 0;
          const isSelected = selectedId === h.id;
          const convictionAlpha = h.convictionScore != null ? Math.max(0.15, h.convictionScore / 100) : 0.08;
          const allocation = totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0;
          const showLabel = sizePx >= 56;

          return (
            <motion.button
              key={h.id}
              type="button"
              onClick={() => setSelectedId((prev) => (prev === h.id ? null : h.id))}
              aria-expanded={isSelected}
              aria-label={`${h.symbol}, ${formatCurrency(h.marketValue)}, ${allocation.toFixed(1)} percent of portfolio, ${formatPercent(h.changePercent)} today${
                h.convictionScore != null ? `, conviction ${h.convictionScore} of 100` : ''
              }`}
              className={`atlas-press absolute flex flex-col items-center justify-center rounded-full text-center transition-shadow ${
                positive ? 'bg-risk-low/15 hover:bg-risk-low/25' : 'bg-risk-high/15 hover:bg-risk-high/25'
              } ${isSelected ? 'z-20' : 'z-10'}`}
              style={{
                left: `${xPct}%`,
                top: `${yPct}%`,
                width: sizePx,
                height: sizePx,
                transform: 'translate(-50%, -50%)',
                boxShadow: `0 0 0 ${isSelected ? 2.5 : 1.5}px rgba(196,181,253,${isSelected ? 0.9 : convictionAlpha})`,
              }}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: MOTION.duration.panel, delay: reduceMotion ? 0 : Math.min(i * 0.025, 0.6), ease: MOTION.ease.standard }}
            >
              <span className={`font-medium leading-none text-atlas-text ${sizePx >= 72 ? 'text-sm' : 'text-xs'}`}>{h.symbol}</span>
              {showLabel && (
                <span className={`mt-0.5 font-mono text-[10px] leading-none ${positive ? 'text-risk-low' : 'text-risk-high'}`}>
                  {formatPercent(h.changePercent)}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {selected && (
          <motion.div
            key={selected.holding.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: MOTION.duration.modal, ease: MOTION.ease.standard }}
            className="overflow-hidden"
          >
            <div className="mt-2 grid gap-4 rounded-xl border border-atlas-border-subtle bg-atlas-surface-hover/40 p-4 sm:grid-cols-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Company</p>
                <p className="mt-1 text-sm text-atlas-text">{selected.holding.name}</p>
                {selected.holding.sector && <p className="text-xs text-atlas-text-tertiary">{selected.holding.sector}</p>}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Position</p>
                <p className="mt-1 font-mono text-sm text-atlas-text">
                  {selected.holding.quantity} sh @ {formatCurrency(selected.holding.avgCostBasis)}
                </p>
                <p className="text-xs text-atlas-text-tertiary">now {formatCurrency(selected.holding.currentPrice)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Conviction</p>
                <p className="mt-1 font-mono text-sm text-atlas-text">
                  {selected.holding.convictionScore != null ? `${selected.holding.convictionScore}/100` : '—'}
                </p>
                <p className="text-xs text-atlas-text-tertiary">
                  {selected.holding.thesisLastReviewedAt ? `Reviewed ${selected.holding.thesisLastReviewedAt.toLocaleDateString()}` : 'Not yet generated'}
                </p>
              </div>
              <div className="flex items-end gap-3 text-xs">
                <Link href={`/intelligence/${selected.holding.symbol}`} className="underline decoration-atlas-border hover:decoration-atlas-accent-bright">
                  Intelligence →
                </Link>
                <Link href={`/holdings#${selected.holding.symbol}`} className="underline decoration-atlas-border hover:decoration-atlas-accent-bright">
                  Full detail →
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
