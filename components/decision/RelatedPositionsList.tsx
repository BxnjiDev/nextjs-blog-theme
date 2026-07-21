import Link from 'next/link';
import EmptyState from '@/components/ui/EmptyState';
import type { RelatedPosition } from '@/lib/domain/decision';

/** Other current holdings in the same sector as the symbol being viewed —
 * concentration context the Decision Framework asks for ("sector
 * exposure") made concrete instead of just a risk-score number. */
export default function RelatedPositionsList({ positions }: { positions: RelatedPosition[] }) {
  if (positions.length === 0) {
    return <EmptyState compact>No other holdings in this sector.</EmptyState>;
  }
  return (
    <ul className="space-y-2">
      {positions.map((p) => (
        <li key={p.symbol} className="flex items-center justify-between text-sm">
          <Link
            href={`/intelligence/${p.symbol}`}
            className="font-medium text-atlas-text underline decoration-atlas-border hover:decoration-atlas-accent-bright"
          >
            {p.symbol}
          </Link>
          <span className="font-mono text-xs text-atlas-text-tertiary">{p.weightPct.toFixed(1)}% of portfolio</span>
        </li>
      ))}
    </ul>
  );
}
