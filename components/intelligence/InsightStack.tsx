import EmptyState from '@/components/ui/EmptyState';
import Panel from '@/components/ui/Panel';
import InsightCard from './InsightCard';
import type { Insight } from '@/lib/intelligence/types';

/**
 * Renders a priority-sorted (see lib/intelligence/scoring.ts) list of
 * Insights, or a calm, non-fabricated empty message when there's nothing
 * to show — the "no meaningful changes since your last review" case from
 * the design brief, not a fake "everything is fine" insight card. This is
 * the one place every page (Home, Portfolio, Risk, Recommendations,
 * Timeline, Compare) renders its insights through, so priority ordering
 * and empty-state phrasing conventions can never drift per-page.
 */
export default function InsightStack({
  insights,
  emptyMessage,
  limit,
  variant = 'panels',
  className = '',
}: {
  insights: Insight[];
  emptyMessage: string;
  /** Cap how many surface — callers decide (Home wants 3, a detail page
   * might want just the single top one). Omit to show everything passed in. */
  limit?: number;
  /** `panels` — each insight in its own bordered surface (Home, Portfolio,
   * Risk). `list` — a single shared surface with hairline-divided rows,
   * for a denser page (Timeline, Recommendations, Compare). */
  variant?: 'panels' | 'list';
  className?: string;
}) {
  const shown = typeof limit === 'number' ? insights.slice(0, limit) : insights;

  if (shown.length === 0) {
    return (
      <EmptyState compact className={className}>
        {emptyMessage}
      </EmptyState>
    );
  }

  if (variant === 'list') {
    return (
      <Panel variant="subtle" className={`divide-y divide-atlas-border-subtle px-4 ${className}`}>
        {shown.map((insight) => (
          <InsightCard key={insight.id} insight={insight} compact />
        ))}
      </Panel>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {shown.map((insight) => (
        <Panel key={insight.id} variant="flat">
          <InsightCard insight={insight} />
        </Panel>
      ))}
    </div>
  );
}
