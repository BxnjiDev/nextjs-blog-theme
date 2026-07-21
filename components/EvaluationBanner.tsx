import { ShieldAlert } from 'lucide-react';
import { EVALUATION_BANNER_TEXT, EVALUATION_MAX_CAPITAL } from '@/lib/domain/evaluationConfig';

/**
 * A thin persistent status strip, not a dominant warning block — the
 * safety disclosure (recommendation-only, experimental balance) stays
 * exactly as legible and exactly as permanent as before; only its visual
 * weight changed (smaller text, tighter padding, an icon anchor instead of
 * a large centered banner) so it reads as "one status line among several"
 * rather than the loudest thing on the page.
 */
export default function EvaluationBanner() {
  return (
    <div className="flex items-center justify-center gap-1.5 border-b border-atlas-warning/25 bg-atlas-warning/10 px-6 py-1.5 text-xs font-medium text-atlas-warning">
      <ShieldAlert size={13} strokeWidth={2} className="shrink-0" aria-hidden="true" />
      <span>
        {EVALUATION_BANNER_TEXT} (${EVALUATION_MAX_CAPITAL} experimental balance.)
      </span>
    </div>
  );
}
