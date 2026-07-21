import { prisma } from '@/lib/prisma';
import Meter from '@/components/ui/Meter';
import FadeInView from '@/components/motion/FadeInView';

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
  const opportunities = await prisma.opportunity.findMany({
    where: { dismissedAt: null },
    include: { comparisons: { orderBy: { generatedAt: 'desc' }, take: 1 } },
    orderBy: { identifiedAt: 'desc' },
  });

  return (
    <div className="space-y-8">
      <FadeInView>
        <h1 className="text-xl font-semibold tracking-tight text-atlas-text">Opportunities</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-atlas-text-secondary">
          Candidates not currently held — undervalued names, emerging trends, and improving fundamentals worth a
          closer look.
        </p>
      </FadeInView>

      {opportunities.length === 0 && <p className="text-sm text-atlas-text-tertiary">No opportunities identified yet.</p>}

      <div className="divide-y divide-atlas-border-subtle">
        {opportunities.map((o, i) => (
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
  );
}
