import { prisma } from '@/lib/prisma';
import Meter from '@/components/ui/Meter';
import FadeInView from '@/components/motion/FadeInView';
import SectionHeading from '@/components/ui/SectionHeading';
import EmptyState from '@/components/ui/EmptyState';
import Panel from '@/components/ui/Panel';
import EntryOpportunityCard from '@/components/strategy/EntryOpportunityCard';
import { getMarketMonitoringSnapshot } from '@/lib/domain/monitoring';

export const dynamic = 'force-dynamic';

const categoryLabels: Record<string, string> = {
  UNDERVALUED: 'Undervalued',
  EMERGING_TREND: 'Emerging trend',
  HIGH_CONVICTION: 'High conviction',
  IMPROVING_FUNDAMENTALS: 'Improving fundamentals',
  COMPOUNDER: 'Long-term compounder',
};

const edgeLabels: Record<string, string> = {
  FAVORS_OPPORTUNITY: 'Favors this opportunity',
  FAVORS_HOLDING: 'Favors your current holding',
  NEUTRAL: 'Evenly matched',
};

const edgeStyles: Record<string, string> = {
  FAVORS_OPPORTUNITY: 'text-risk-low',
  FAVORS_HOLDING: 'text-risk-high',
  NEUTRAL: 'text-atlas-text-tertiary',
};

export default async function OpportunitiesPage() {
  const [snapshot, trackedOpportunities] = await Promise.all([
    getMarketMonitoringSnapshot(),
    prisma.opportunity.findMany({
      where: { dismissedAt: null },
      include: { comparisons: { orderBy: { generatedAt: 'desc' }, take: 1 } },
      orderBy: { identifiedAt: 'desc' },
    }),
  ]);

  const scanErrors = snapshot.entries.filter((e) => e.error !== null);

  return (
    <div className="space-y-10">
      <FadeInView>
        <h1 className="text-xl font-semibold tracking-tight text-atlas-text">Opportunities</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-atlas-text-secondary">
          The Market Monitoring Engine&rsquo;s continuous scan of your watchlist and investment universe — every entry is
          built from the same Decision Engine your Portfolio and Intelligence pages already show, ranked
          strongest-first, never a separate opinion.
        </p>
      </FadeInView>

      <div className="space-y-3">
        <SectionHeading>
          Watchlist monitoring — {snapshot.rankedOpportunities.length} opportunit
          {snapshot.rankedOpportunities.length === 1 ? 'y' : 'ies'} of {snapshot.entries.length} scanned
        </SectionHeading>

        {snapshot.rankedOpportunities.length === 0 ? (
          <EmptyState>
            No qualifying entry opportunities right now — every scanned symbol currently reads as hold, wait, or no
            action.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {snapshot.rankedOpportunities.map((opportunity, i) => (
              <FadeInView key={opportunity.symbol} delay={Math.min(i * 0.04, 0.24)}>
                <Panel variant="flat">
                  <EntryOpportunityCard opportunity={opportunity} />
                </Panel>
              </FadeInView>
            ))}
          </div>
        )}

        {scanErrors.length > 0 && (
          <p className="text-xs text-atlas-text-tertiary">
            Could not scan {scanErrors.length} symbol{scanErrors.length === 1 ? '' : 's'}: {scanErrors.map((e) => e.entry.symbol).join(', ')}.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <SectionHeading>Tracked opportunities</SectionHeading>
        <p className="text-xs text-atlas-text-tertiary">
          Manually curated candidates with a standing thesis and, where available, a direct comparison against a
          current holding.
        </p>

        {trackedOpportunities.length === 0 && <EmptyState compact>No opportunities identified yet.</EmptyState>}

        <div className="divide-y divide-atlas-border-subtle">
          {trackedOpportunities.map((o, i) => (
            <FadeInView key={o.id} delay={Math.min(i * 0.04, 0.24)}>
              <div className="grid gap-4 py-5 sm:grid-cols-[1fr_180px]">
                <div>
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-base font-semibold text-atlas-text">{o.symbol}</h2>
                    <span className="text-sm text-atlas-text-tertiary">{o.name}</span>
                  </div>
                  <span className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">
                    {categoryLabels[o.category] ?? o.category}
                  </span>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-atlas-text-secondary">{o.thesis}</p>

                  {o.comparisons[0] && (
                    <div className="mt-3 border-t border-atlas-border-subtle pt-3">
                      <p className={`text-xs font-medium ${edgeStyles[o.comparisons[0].overallEdge]}`}>
                        vs. {o.comparisons[0].comparedToSymbol}: {edgeLabels[o.comparisons[0].overallEdge]}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-atlas-text-tertiary">
                        {o.comparisons[0].narrative}
                      </p>
                    </div>
                  )}
                </div>
                <div className="sm:pt-1">
                  <Meter score={o.confidenceScore} max={10} label="Confidence" />
                </div>
              </div>
            </FadeInView>
          ))}
        </div>
      </div>
    </div>
  );
}
