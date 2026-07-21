'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import { MOTION } from '@/lib/motion/tokens';
import { ICON_SIZE, ICON_STROKE } from '@/lib/ui/iconSize';
import { INSIGHT_TIER_TONE, INSIGHT_TIER_LABEL, TONE_DOT } from '@/lib/theme/tone';
import type { Insight, InsightReasoning } from '@/lib/intelligence/types';

const LIST_SECTIONS: { key: keyof InsightReasoning; label: string }[] = [
  { key: 'evidence', label: 'Evidence' },
  { key: 'signals', label: 'Signals' },
  { key: 'supportingData', label: 'Supporting data' },
  { key: 'riskFactors', label: 'Risk factors' },
  { key: 'recentChanges', label: 'Recent changes' },
];

function hasReasoning(reasoning: InsightReasoning): boolean {
  return (
    LIST_SECTIONS.some(({ key }) => ((reasoning[key] as string[] | undefined)?.length ?? 0) > 0) ||
    Boolean(reasoning.portfolioImpact) ||
    Boolean(reasoning.confidenceReasoning)
  );
}

/**
 * The one card every Insight in the app renders through — headline (what
 * happened), interpretation (why it matters), an optional recommendation
 * (what Atlas suggests), and a tier badge that reads at a glance without
 * requiring the reader to parse a raw score. Complexity is opt-in: the
 * five reasoning fields (evidence/signals/supportingData/riskFactors/
 * recentChanges) plus portfolio-impact and confidence-reasoning text only
 * appear behind "Show why," collapsed by default, and the toggle itself
 * only renders when there's something to show — never a dead-end button.
 */
export default function InsightCard({ insight, compact = false }: { insight: Insight; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const panelId = useId();
  const showWhy = hasReasoning(insight.reasoning);

  return (
    <div className={compact ? 'py-3' : 'p-4'}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={INSIGHT_TIER_TONE[insight.tier]}>{INSIGHT_TIER_LABEL[insight.tier]}</Badge>
            {insight.symbol && <span className="font-mono text-xs text-atlas-text-tertiary">{insight.symbol}</span>}
          </div>
          <p className="mt-2 text-sm font-medium text-atlas-text">{insight.headline}</p>
          <p className="mt-1 text-sm leading-relaxed text-atlas-text-secondary">{insight.interpretation}</p>
          {insight.recommendation && <p className="mt-2 text-sm font-medium text-atlas-accent-bright">→ {insight.recommendation}</p>}
        </div>
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[insight.tone]}`} aria-hidden="true" />
      </div>

      {(insight.href || showWhy) && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {insight.href && (
            <Link
              href={insight.href}
              className="text-xs font-medium text-atlas-accent-bright underline decoration-atlas-border hover:decoration-atlas-accent-bright"
            >
              View detail →
            </Link>
          )}
          {showWhy && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={panelId}
              className="atlas-press flex items-center gap-1 text-xs font-medium text-atlas-text-tertiary transition-colors hover:text-atlas-text-secondary"
            >
              Show why
              <ChevronDown
                size={ICON_SIZE.sm}
                strokeWidth={ICON_STROKE}
                className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && showWhy && (
          <motion.div
            id={panelId}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: MOTION.duration.modal, ease: MOTION.ease.standard }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2.5 border-t border-atlas-border-subtle pt-3 text-xs">
              {LIST_SECTIONS.map(({ key, label }) => {
                const value = insight.reasoning[key] as string[] | undefined;
                if (!value || value.length === 0) return null;
                return (
                  <div key={key}>
                    <p className="font-medium uppercase tracking-wide text-atlas-text-tertiary">{label}</p>
                    <ul className="mt-1 space-y-0.5 text-atlas-text-secondary">
                      {value.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {insight.reasoning.portfolioImpact && (
                <div>
                  <p className="font-medium uppercase tracking-wide text-atlas-text-tertiary">Portfolio impact</p>
                  <p className="mt-1 text-atlas-text-secondary">{insight.reasoning.portfolioImpact}</p>
                </div>
              )}
              {insight.reasoning.confidenceReasoning && (
                <div>
                  <p className="font-medium uppercase tracking-wide text-atlas-text-tertiary">Confidence</p>
                  <p className="mt-1 text-atlas-text-secondary">{insight.reasoning.confidenceReasoning}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
