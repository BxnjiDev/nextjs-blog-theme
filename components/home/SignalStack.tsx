import Link from 'next/link';
import RecommendationCard, { type RecommendationCardData } from '@/components/RecommendationCard';
import type { RecentThesisChange } from '@/lib/domain/homeDashboard';

/**
 * The Command Deck's right hero zone — a vertical stack whose items don't
 * share a fixed size. A real recommendation renders at full size and takes
 * top billing; a thesis change is a medium note; portfolio-health concerns
 * are a small flagged strip. Whenever a given signal has nothing to report,
 * it collapses to a single quiet line instead of an empty-state card, so
 * the stack's overall height (and how much attention it commands) tracks
 * how much is actually happening right now.
 */
export default function SignalStack({
  recommendation,
  thesisChange,
  topConcerns,
}: {
  recommendation: RecommendationCardData | null;
  thesisChange: RecentThesisChange | null;
  topConcerns: string[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {recommendation ? (
        <RecommendationCard data={recommendation} />
      ) : (
        <p className="rounded-xl border border-atlas-border-subtle px-4 py-3 text-sm text-atlas-text-tertiary">
          No recommendations generated yet —{' '}
          <Link href="/atlas" className="underline decoration-atlas-border hover:decoration-atlas-text-secondary">
            ask Atlas
          </Link>
          .
        </p>
      )}

      {thesisChange ? (
        <div className="rounded-xl border border-atlas-border-subtle px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/intelligence/${thesisChange.symbol}`}
              className="text-sm font-medium text-atlas-text underline decoration-atlas-border underline-offset-2 hover:decoration-atlas-text-secondary"
            >
              {thesisChange.symbol}
            </Link>
            <span className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">
              {thesisChange.changeType.replace(/_/g, ' ').toLowerCase()}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-atlas-text-secondary">{thesisChange.whatChanged ?? 'No details recorded.'}</p>
        </div>
      ) : (
        <p className="px-1 text-xs text-atlas-text-tertiary">No thesis changes recorded yet.</p>
      )}

      {topConcerns.length > 0 ? (
        <div className="rounded-xl border border-atlas-warning/25 bg-atlas-warning/5 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-atlas-warning">Flagged</p>
          <ul className="mt-1.5 space-y-1 text-sm text-atlas-text-secondary">
            {topConcerns.slice(0, 3).map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-atlas-warning">·</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="px-1 text-xs text-atlas-text-tertiary">No concerns flagged.</p>
      )}
    </div>
  );
}
