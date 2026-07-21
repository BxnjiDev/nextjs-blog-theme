'use client';

import { StaggerGroup, StaggerItem } from '@/components/motion/Stagger';

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
    <StaggerGroup className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {SUGGESTIONS.map((s) => (
        <StaggerItem key={s}>
          <button
            type="button"
            onClick={() => onSelect(s)}
            className="atlas-hover-glow w-full rounded-lg border border-atlas-border bg-atlas-surface px-3 py-2.5 text-left text-sm text-atlas-text-secondary transition-[border-color,box-shadow,transform,color] duration-300 hover:text-atlas-text"
          >
            {s}
          </button>
        </StaggerItem>
      ))}
    </StaggerGroup>
  );
}
