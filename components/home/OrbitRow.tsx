'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MOTION } from '@/lib/motion/tokens';

export interface OrbitNode {
  id: string;
  label: string;
  /** Whether this node has something to report right now — a brighter dot
   * versus a dim one, so the row itself hints at where to look before
   * anything is clicked (progressive disclosure, not just a click target). */
  active: boolean;
  content: React.ReactNode;
}

/**
 * Secondary context (today's focus, earnings, decisions, performance) laid
 * out as a horizontal row of nodes on a thin connecting line — the same
 * orbital motif used for Atlas's identity at login — rather than a stack of
 * equally-weighted collapsible sections. Clicking a node expands its detail
 * inline underneath the row; clicking it again (or another node) swaps or
 * closes it.
 */
export default function OrbitRow({ nodes }: { nodes: OrbitNode[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const active = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="border-t border-atlas-border-subtle pt-8">
      <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-[6%] top-[5px] h-px bg-atlas-border" />
        <div className="relative flex justify-between gap-1 sm:gap-2">
          {nodes.map((node) => {
            const isSelected = node.id === selectedId;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedId((prev) => (prev === node.id ? null : node.id))}
                aria-expanded={isSelected}
                className="atlas-press flex min-h-11 flex-1 flex-col items-center justify-start gap-2.5 py-1"
              >
                <span
                  aria-hidden="true"
                  className={`block h-[11px] w-[11px] rounded-full transition-colors ${
                    isSelected
                      ? 'bg-atlas-accent-bright shadow-glow-accent'
                      : node.active
                        ? 'bg-atlas-lavender'
                        : 'bg-atlas-border'
                  }`}
                />
                <span
                  className={`text-center text-[11px] uppercase leading-tight tracking-wide ${
                    isSelected ? 'text-atlas-text' : 'text-atlas-text-tertiary'
                  }`}
                >
                  {node.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {active && (
          <motion.div
            key={active.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: MOTION.duration.modal, ease: MOTION.ease.standard }}
            className="overflow-hidden"
          >
            <div className="pt-7">{active.content}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
