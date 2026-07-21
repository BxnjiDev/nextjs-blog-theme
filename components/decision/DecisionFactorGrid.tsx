import type { DecisionFactor } from '@/lib/decision/types';
import { TONE_TEXT } from '@/lib/theme/tone';

/**
 * The Decision Framework's per-factor read (thesis strength, conviction,
 * risk, valuation, concentration, sector exposure, technical context,
 * catalysts, news impact, earnings timing, portfolio objectives) as a
 * scannable tile grid — one reusable component instead of every page that
 * shows a Decision re-laying out its own factor list. An unavailable
 * factor renders in muted text with its "why not available" note, exactly
 * as available — never hidden, never guessed.
 */
export default function DecisionFactorGrid({ factors }: { factors: DecisionFactor[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {factors.map((f) => (
        <div key={f.key} className="rounded-lg border border-atlas-border-subtle bg-atlas-surface-raised px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-atlas-text-tertiary">{f.label}</p>
          <p className={`mt-1 text-sm leading-snug ${f.available ? TONE_TEXT[f.tone] : 'text-atlas-text-tertiary'}`}>{f.summary}</p>
        </div>
      ))}
    </div>
  );
}
