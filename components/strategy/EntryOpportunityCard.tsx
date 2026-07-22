import Badge from '@/components/ui/Badge';
import Meter from '@/components/ui/Meter';
import InsightCard from '@/components/intelligence/InsightCard';
import { decisionToInsight } from '@/lib/decision/engine';
import { STRATEGY_TYPE_LABEL, STRATEGY_TYPE_TONE, OPPORTUNITY_TIER_LABEL, OPPORTUNITY_TIER_TONE, type EntryOpportunity } from '@/lib/strategy/types';

/**
 * Renders one Market Monitoring Engine opportunity — the brief's Entry
 * Opportunity shape (strategy type, trade intent, why now/why not, expected
 * holding window, invalidation conditions, profit management guidance)
 * wrapped around the existing InsightCard for the headline/evidence/"show
 * why" interaction every other surface already uses. No reasoning is
 * re-rendered here: InsightCard reads decisionToInsight(opportunity.decision)
 * directly, so this card can never disagree with the symbol's own Decision
 * Workspace page.
 */
export default function EntryOpportunityCard({ opportunity }: { opportunity: EntryOpportunity }) {
  const insight = decisionToInsight(opportunity.decision);

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={OPPORTUNITY_TIER_TONE[opportunity.tier]}>{OPPORTUNITY_TIER_LABEL[opportunity.tier]}</Badge>
        <Badge tone={STRATEGY_TYPE_TONE[opportunity.strategyType]} variant="outline">
          {STRATEGY_TYPE_LABEL[opportunity.strategyType]}
        </Badge>
        <span className="font-mono text-xs text-atlas-text-tertiary">{opportunity.symbol}</span>
        <span className="text-xs text-atlas-text-tertiary">{opportunity.company}</span>
      </div>

      <p className="mt-2 text-sm font-medium text-atlas-text">{opportunity.tradeIntent}</p>

      <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
        <div className="space-y-2 text-xs leading-relaxed text-atlas-text-secondary">
          <p>
            <span className="font-medium text-atlas-text-tertiary">Why now: </span>
            {opportunity.whyNow}
          </p>
          <p>
            <span className="font-medium text-atlas-text-tertiary">Why not: </span>
            {opportunity.whyNot}
          </p>
        </div>
        <Meter label="Confidence" score={opportunity.confidence} />
      </div>

      <div className="mt-3 grid gap-x-4 gap-y-1 text-xs text-atlas-text-tertiary sm:grid-cols-2">
        <p>Expected holding window: {opportunity.expectedHoldingWindow}</p>
        <p>Profit management: {opportunity.profitManagementGuidance}</p>
        {opportunity.reviewDate && <p>Atlas expects to revisit by {opportunity.reviewDate.toLocaleDateString()}.</p>}
      </div>

      {opportunity.invalidationConditions.length > 0 && (
        <div className="mt-3 border-t border-atlas-border-subtle pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-atlas-text-tertiary">Invalidation conditions</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs leading-relaxed text-atlas-text-secondary">
            {opportunity.invalidationConditions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 border-t border-atlas-border-subtle">
        <InsightCard insight={insight} compact />
      </div>
    </div>
  );
}
