const SUGGESTIONS = [
  'Morning Brief',
  'Review Portfolio',
  'Highest Conviction Opportunity',
  'What Changed Overnight?',
  'Compare Amazon vs Microsoft',
  "Explain Today's Recommendation",
];

export default function SuggestedPrompts({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect(s)}
          className="rounded-lg border border-atlas-border bg-atlas-surface px-3 py-2.5 text-left text-sm text-atlas-text-secondary transition-colors hover:border-atlas-accent/40 hover:bg-atlas-surface-hover hover:text-atlas-text"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
