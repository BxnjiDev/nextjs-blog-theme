import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function BriefingPage() {
  const briefing = await prisma.briefing.findFirst({ orderBy: { date: 'desc' } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Daily Briefing</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Generated each morning from the portfolio snapshot, overnight market recap, and any
          alerts raised overnight.
        </p>
      </div>

      {!briefing ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No briefing has been generated yet. Briefing generation is not wired up in this
            scaffold — it needs a scheduled job that pulls fresh quotes/news and writes a{' '}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">Briefing</code> row (see
            ARCHITECTURE.md).
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {briefing.date.toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <section className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
            <h2 className="mb-2 font-semibold">Portfolio Summary</h2>
            <pre className="overflow-x-auto text-xs text-gray-600 dark:text-gray-400">
              {JSON.stringify(briefing.portfolioSummary, null, 2)}
            </pre>
          </section>
          <section className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
            <h2 className="mb-2 font-semibold">Overnight Market Recap</h2>
            <pre className="overflow-x-auto text-xs text-gray-600 dark:text-gray-400">
              {JSON.stringify(briefing.marketRecap, null, 2)}
            </pre>
          </section>
          {briefing.opportunitiesNote && (
            <section className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
              <h2 className="mb-2 font-semibold">Opportunities</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{briefing.opportunitiesNote}</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
