'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Badge from '@/components/ui/Badge';
import { MOTION } from '@/lib/motion/tokens';
import { DECISION_TONE, TONE_OUTLINE } from '@/lib/theme/tone';
import { setRecommendationDecision } from '@/app/(app)/recommendations/actions';

type ManualDecision = 'REJECTED' | 'DEFERRED';

const OPTIONS: { decision: ManualDecision; label: string }[] = [
  { decision: 'REJECTED', label: 'Reject' },
  { decision: 'DEFERRED', label: 'Defer' },
];

/**
 * The signature recommendation-review moment: deciding happens right here
 * on the Investment Memo, in the middle of reading the case, instead of
 * bouncing back to the list to click a plain text link. Acceptance is
 * deliberately not a button here — Atlas only ever infers ACCEPTED from a
 * real matching transaction (lib/domain/recommendationDecisions.ts), never
 * from a click, so offering a fake "accept" action would misrepresent what
 * this panel can actually record. Rejecting or deferring gets a tactile
 * confirmation (a spring-in tone-colored badge) instead of an abrupt page
 * reload, so the decision feels registered before the server round-trips.
 */
export default function DecisionPanel({
  recommendationId,
  currentDecision,
  compact = false,
}: {
  recommendationId: string;
  currentDecision: string;
  /** Omits the "Your decision" label — for use inline in a table cell
   * (Recommendations list) where the column header already says it. */
  compact?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [justDecided, setJustDecided] = useState<ManualDecision | null>(null);

  const settled = justDecided ?? (currentDecision !== 'PENDING' ? currentDecision : null);

  function decide(decision: ManualDecision) {
    setJustDecided(decision);
    startTransition(() => {
      void setRecommendationDecision(recommendationId, decision, '');
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {!compact && <span className="text-[11px] font-medium uppercase tracking-wide text-atlas-text-tertiary">Your decision</span>}
      <AnimatePresence mode="wait">
        {settled ? (
          <motion.div
            key="settled"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', ...MOTION.spring.nav }}
          >
            <Badge tone={DECISION_TONE[settled] ?? 'muted'}>{settled.replace(/_/g, ' ').toLowerCase()}</Badge>
          </motion.div>
        ) : (
          <motion.div key="actions" exit={{ opacity: 0 }} transition={{ duration: MOTION.duration.micro }} className="flex gap-2">
            {OPTIONS.map(({ decision, label }) => (
              <button
                key={decision}
                type="button"
                disabled={isPending}
                onClick={() => decide(decision)}
                className={`atlas-press rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${TONE_OUTLINE[DECISION_TONE[decision]]} hover:bg-atlas-surface-hover`}
              >
                {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
