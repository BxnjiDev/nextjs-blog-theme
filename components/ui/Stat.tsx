import { TONE_TEXT, type Tone } from '@/lib/theme/tone';

/**
 * One label/value tile — the "hairline stat strip" pattern that was
 * hand-rolled independently in Recommendations, Scorecard, Briefing (twice),
 * Connections (twice), and the pre-redesign Portfolio/Home pages, each
 * retyping the same `text-[11px] uppercase tracking-wide text-atlas-text-
 * tertiary` label + `font-mono text-lg` value markup. `<StatStrip>` is the
 * row wrapper (the hairline border + spacing), `<Stat>` is one tile inside
 * it — together they're the one way this app shows "a handful of related
 * numbers side by side."
 */
export function Stat({
  label,
  value,
  tone,
  meta,
}: {
  label: string;
  value: React.ReactNode;
  /** Omit for a neutral/primary value (`text-atlas-text`); pass a tone to
   * color the value semantically (a positive/negative change, a warning). */
  tone?: Tone;
  meta?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-atlas-text-tertiary">{label}</p>
      <p className={`mt-1 font-mono text-lg ${tone ? TONE_TEXT[tone] : 'text-atlas-text'}`}>{value}</p>
      {meta && <p className="mt-0.5 text-xs text-atlas-text-tertiary">{meta}</p>}
    </div>
  );
}

export default function StatStrip({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-wrap gap-x-10 gap-y-4 border-y border-atlas-border-subtle py-5 ${className}`}>{children}</div>;
}
