import { prisma } from '@/lib/prisma';
import ConfidenceBadge from '@/components/ConfidenceBadge';

export const dynamic = 'force-dynamic';

const categoryLabels: Record<string, string> = {
  UNDERVALUED: 'Undervalued',
  EMERGING_TREND: 'Emerging trend',
  HIGH_CONVICTION: 'High conviction',
  IMPROVING_FUNDAMENTALS: 'Improving fundamentals',
  COMPOUNDER: 'Long-term compounder',
};

export default async function OpportunitiesPage() {
  const opportunities = await prisma.opportunity.findMany({
    where: { dismissedAt: null },
    orderBy: { identifiedAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Opportunities</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Candidates not currently held — undervalued names, emerging trends, and improving
          fundamentals worth a closer look.
        </p>
      </div>

      {opportunities.length === 0 && (
        <p className="text-sm text-gray-500">No opportunities identified yet.</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {opportunities.map((o) => (
          <div key={o.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold">
                  {o.symbol} <span className="font-normal text-gray-500">— {o.name}</span>
                </h2>
                <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {categoryLabels[o.category] ?? o.category}
                </span>
              </div>
              <ConfidenceBadge score={o.confidenceScore} />
            </div>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{o.thesis}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
