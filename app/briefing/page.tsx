import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatCurrency, formatPercent } from '@/lib/format';
import StatCard from '@/components/StatCard';
import ActionBadge from '@/components/ActionBadge';

export const dynamic = 'force-dynamic';

interface ReturnMetricShape {
  available: boolean;
  returnPercent?: number;
  vsSp500Percent?: number;
  note?: string;
}

interface PortfolioSummaryShape {
  totalValue: number | null;
  dayChangeValue: number | null;
  dayChangePercent: number | null;
  sp500Level: number | null;
  largestWinner: { symbol: string; changePercent: number } | null;
  largestLoser: { symbol: string; changePercent: number } | null;
  performance: { daily: ReturnMetricShape; weekly: ReturnMetricShape; monthly: ReturnMetricShape };
  recommendedActions: Array<{ symbol: string; action: string | null; confidenceScore: number | null }>;
  convictionHighlights: Array<{ symbol: string; convictionScore: number; lastReviewedAt: string }>;
  materialRisks: { overallScore: number; previousScore: number | null; notes: string | null } | null;
  portfolioHealth: { overallScore: number; previousScore: number | null; topConcerns: string[] } | null;
}

interface PortfolioNewsItemShape {
  symbol: string | null;
  headline: string;
  source: string;
  url: string | null;
  publishedAt: string;
  materialityLevel: string;
  whyItMatters: string;
}

interface MarketRecapShape {
  portfolioNews: PortfolioNewsItemShape[];
  upcomingEvents: Array<{
    symbol: string;
    mostRecentFiling: { formType: string; filedAt: string; url: string } | null;
    nextEarnings: { reportDate: string; daysAway: number; epsEstimate: number | null; fiscalPeriod: string; fiscalYear: number } | null;
  }>;
  notes: string[];
}

function ReturnRow({ label, metric }: { label: string; metric: ReturnMetricShape }) {
  if (!metric.available) {
    return (
      <div className="flex justify-between text-sm">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className="text-gray-400 dark:text-gray-500">{metric.note ?? 'Not available'}</span>
      </div>
    );
  }
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <span className={metric.returnPercent! >= 0 ? 'text-risk-low' : 'text-risk-high'}>
        {formatPercent(metric.returnPercent!)} (vs SPY {formatPercent(metric.vsSp500Percent!)})
      </span>
    </div>
  );
}

export default async function BriefingPage() {
  const briefing = await prisma.briefing.findFirst({ orderBy: { date: 'desc' } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Daily Briefing</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Generated each morning from the portfolio snapshot, risk/health assessments, conviction trend, and
          recent material news.
        </p>
      </div>

      {!briefing ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No briefing has been generated yet — run the briefing job (
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">/api/jobs/briefing</code>).
          </p>
        </div>
      ) : (
        (() => {
          const summary = briefing.portfolioSummary as unknown as PortfolioSummaryShape;
          const recap = briefing.marketRecap as unknown as MarketRecapShape;

          return (
            <div className="space-y-6">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {briefing.date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatCard label="Total value" value={summary.totalValue !== null ? formatCurrency(summary.totalValue) : 'n/a'} />
                <StatCard
                  label="Day change"
                  value={summary.dayChangeValue !== null ? formatCurrency(summary.dayChangeValue) : 'n/a'}
                  sublabel={summary.dayChangePercent !== null ? formatPercent(summary.dayChangePercent) : undefined}
                  tone={(summary.dayChangePercent ?? 0) >= 0 ? 'positive' : 'negative'}
                />
                <StatCard
                  label="Largest winner"
                  value={summary.largestWinner?.symbol ?? 'n/a'}
                  sublabel={summary.largestWinner ? formatPercent(summary.largestWinner.changePercent) : undefined}
                  tone="positive"
                />
                <StatCard
                  label="Largest loser"
                  value={summary.largestLoser?.symbol ?? 'n/a'}
                  sublabel={summary.largestLoser ? formatPercent(summary.largestLoser.changePercent) : undefined}
                  tone="negative"
                />
              </div>

              <section className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
                <h2 className="mb-3 font-semibold">Performance vs. SPY</h2>
                <div className="space-y-1">
                  <ReturnRow label="Daily" metric={summary.performance.daily} />
                  <ReturnRow label="Weekly" metric={summary.performance.weekly} />
                  <ReturnRow label="Monthly" metric={summary.performance.monthly} />
                </div>
              </section>

              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
                  <h2 className="mb-2 font-semibold">
                    Material risks{' '}
                    <Link href="/risk" className="text-xs font-normal text-gray-500 underline">
                      view detail
                    </Link>
                  </h2>
                  {summary.materialRisks ? (
                    <>
                      <p className="text-2xl font-semibold">{summary.materialRisks.overallScore}/100</p>
                      {summary.materialRisks.notes && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{summary.materialRisks.notes}</p>}
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">No risk assessment on record yet.</p>
                  )}
                </section>
                <section className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
                  <h2 className="mb-2 font-semibold">
                    Portfolio health{' '}
                    <Link href="/health" className="text-xs font-normal text-gray-500 underline">
                      view detail
                    </Link>
                  </h2>
                  {summary.portfolioHealth ? (
                    <>
                      <p className="text-2xl font-semibold">{summary.portfolioHealth.overallScore}/100</p>
                      {summary.portfolioHealth.topConcerns?.[0] && (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{summary.portfolioHealth.topConcerns[0]}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">No health assessment on record yet.</p>
                  )}
                </section>
              </div>

              <section className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
                <h2 className="mb-3 font-semibold">Recommended actions</h2>
                <div className="space-y-2">
                  {summary.recommendedActions.map((r) => (
                    <div key={r.symbol} className="flex items-center justify-between text-sm">
                      <Link href={`/intelligence/${r.symbol}`} className="font-medium underline">
                        {r.symbol}
                      </Link>
                      {r.action ? <ActionBadge action={r.action} /> : <span className="text-gray-400">No recommendation yet</span>}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
                <h2 className="mb-3 font-semibold">Portfolio news</h2>
                {recap.portfolioNews.length === 0 ? (
                  <p className="text-sm text-gray-500">No meaningful news in the last 48 hours.</p>
                ) : (
                  <ul className="space-y-3">
                    {recap.portfolioNews.map((n, i) => (
                      <li key={i} className="text-sm">
                        <a href={n.url ?? undefined} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                          {n.headline}
                        </a>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {n.source} · {new Date(n.publishedAt).toLocaleDateString()} · {n.materialityLevel.toLowerCase()}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{n.whyItMatters}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
                <h2 className="mb-3 font-semibold">Upcoming earnings &amp; events</h2>
                <div className="space-y-2 text-sm">
                  {recap.upcomingEvents.map((e) => (
                    <div key={e.symbol} className="flex items-center justify-between">
                      <Link href={`/intelligence/${e.symbol}`} className="font-medium underline">
                        {e.symbol}
                      </Link>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {e.nextEarnings
                          ? `Reports ${e.nextEarnings.fiscalPeriod} FY${e.nextEarnings.fiscalYear} in ${e.nextEarnings.daysAway}d (${new Date(e.nextEarnings.reportDate).toLocaleDateString()})${e.nextEarnings.epsEstimate !== null ? `, EPS est. ${e.nextEarnings.epsEstimate.toFixed(2)}` : ''}`
                          : e.mostRecentFiling
                            ? `No earnings-calendar entry — last filing ${e.mostRecentFiling.formType} on ${new Date(e.mostRecentFiling.filedAt).toLocaleDateString()}`
                            : 'No calendar or filing data available.'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
                <h2 className="mb-2 font-semibold">Notes</h2>
                <ul className="list-inside list-disc space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  {recap.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </section>
            </div>
          );
        })()
      )}
    </div>
  );
}
