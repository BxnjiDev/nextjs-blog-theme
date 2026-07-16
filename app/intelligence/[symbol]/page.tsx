import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import ConfidenceBadge from '@/components/ConfidenceBadge';
import TrendLineChart from '@/components/charts/TrendLineChart';

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<string, string> = {
  financialStrength: 'Financial strength',
  revenueGrowth: 'Revenue growth',
  profitability: 'Profitability',
  balanceSheet: 'Balance sheet',
  competitiveMoat: 'Competitive moat',
  aiPositioning: 'AI positioning',
  managementExecution: 'Management execution',
  industryLeadership: 'Industry leadership',
  productInnovation: 'Product innovation',
  valuation: 'Valuation',
  executionRisk: 'Execution risk',
  regulatoryRisk: 'Regulatory risk',
  macroSensitivity: 'Macro sensitivity',
};

export default async function ThesisDetailPage({ params }: { params: { symbol: string } }) {
  const symbol = params.symbol.toUpperCase();

  const holding = await prisma.holding.findFirst({
    where: { symbol },
    include: {
      thesis: {
        include: {
          changeEvents: { orderBy: { createdAt: 'desc' } },
          convictionAssessments: { orderBy: { generatedAt: 'asc' } },
        },
      },
    },
  });

  if (!holding) notFound();

  const thesis = holding.thesis;
  const convictions = thesis?.convictionAssessments ?? [];
  const latestConviction = convictions[convictions.length - 1] ?? null;
  const chartData = convictions.map((c) => ({ label: c.generatedAt.toLocaleDateString(), value: c.overallScore }));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/intelligence" className="text-sm text-gray-500 hover:underline">
          ← Portfolio Intelligence
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {holding.symbol} <span className="font-normal text-gray-500">— {holding.name}</span>
        </h1>
      </div>

      {!thesis ? (
        <p className="text-sm text-gray-500">No thesis established yet — pending the next thesis-review job run.</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800 md:col-span-2">
              <h2 className="mb-2 font-medium">Company overview</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{thesis.companyOverview}</p>
              <h2 className="mb-2 mt-4 font-medium">Original thesis</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{thesis.originalThesis}</p>
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Established {thesis.establishedAt.toLocaleDateString()} · Last reviewed {thesis.lastReviewedAt.toLocaleString()} · Horizon:{' '}
                {thesis.investmentHorizon}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <h2 className="mb-2 font-medium">Conviction</h2>
              <p className="text-3xl font-semibold">{thesis.convictionScore}/100</p>
              <ConfidenceBadge score={Math.round(thesis.convictionScore / 10)} />
              <div className="mt-4">
                <TrendLineChart data={chartData} domain={[0, 100]} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <h2 className="font-medium text-gray-700 dark:text-gray-300">Growth drivers</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{thesis.growthDrivers}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <h2 className="font-medium text-gray-700 dark:text-gray-300">Competitive advantages</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{thesis.competitiveAdvantages}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <h2 className="font-medium text-risk-low">Bull case</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{thesis.bullCase}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <h2 className="font-medium text-risk-high">Bear case</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{thesis.bearCase}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <h2 className="font-medium text-gray-700 dark:text-gray-300">Risks</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{thesis.risks}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <h2 className="font-medium text-gray-700 dark:text-gray-300">Catalysts</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{thesis.catalysts}</p>
            </div>
          </div>

          {latestConviction && (
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <h2 className="mb-3 font-medium">Conviction category breakdown</h2>
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                Deterministic, code-computed scores. A category shows &ldquo;no data&rdquo; when this app has no
                data source to score it from — never a guessed number.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
                  const score = (latestConviction as unknown as Record<string, number | null>)[key];
                  return (
                    <div key={key} className="rounded border border-gray-100 px-3 py-2 dark:border-gray-800">
                      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                      <p className="text-lg font-semibold">{score !== null ? `${score}/100` : 'No data'}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <h2 className="mb-3 font-medium">Thesis timeline</h2>
            {thesis.changeEvents.length === 0 ? (
              <p className="text-sm text-gray-500">No changes recorded yet.</p>
            ) : (
              <ol className="space-y-4">
                {thesis.changeEvents.map((event) => (
                  <li key={event.id} className="border-l-2 border-gray-200 pl-4 dark:border-gray-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {event.createdAt.toLocaleString()} · {event.changeType.replace(/_/g, ' ').toLowerCase()}
                    </p>
                    {event.whatChanged && <p className="mt-1 text-sm font-medium">{event.whatChanged}</p>}
                    {event.whyChanged && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{event.whyChanged}</p>}
                    {(event.confidenceBefore !== null || event.confidenceAfter !== null) && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Confidence: {event.confidenceBefore ?? 'n/a'} → {event.confidenceAfter ?? 'n/a'}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}
