import Link from 'next/link';
import { getPortfolioIntelligence } from '@/lib/domain/intelligence';
import ConfidenceBadge from '@/components/ConfidenceBadge';
import TrendBadge from '@/components/TrendBadge';

export const dynamic = 'force-dynamic';

export default async function IntelligencePage() {
  const intelligence = await getPortfolioIntelligence();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Portfolio Intelligence</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          A persistent thesis per holding — conviction trend, latest change, top risks/catalysts, and the most
          material recent news. Updated by the daily thesis-review job, not regenerated from scratch every run.
        </p>
      </div>

      {intelligence.length === 0 && <p className="text-sm text-gray-500">No holdings yet.</p>}

      <div className="space-y-4">
        {intelligence.map((h) => (
          <Link
            key={h.symbol}
            href={`/intelligence/${h.symbol}`}
            className="block rounded-lg border border-gray-200 p-5 transition hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {h.symbol} <span className="font-normal text-gray-500">— {h.name}</span>
                </h2>
                {h.thesis ? (
                  <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">{h.thesis.originalThesis}</p>
                ) : (
                  <p className="mt-1 text-sm text-gray-500">No thesis established yet — pending the next thesis-review job run.</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                {h.currentConviction !== null && <ConfidenceBadge score={Math.round(h.currentConviction / 10)} />}
                <TrendBadge trend={h.trend} />
                {h.previousConviction !== null && h.currentConviction !== null && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {h.previousConviction} → {h.currentConviction}
                  </span>
                )}
              </div>
            </div>

            {h.thesis && (
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <h3 className="font-medium text-gray-700 dark:text-gray-300">Top risks</h3>
                  <p className="mt-1 line-clamp-2 text-gray-600 dark:text-gray-400">{h.thesis.risks}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-700 dark:text-gray-300">Top catalysts</h3>
                  <p className="mt-1 line-clamp-2 text-gray-600 dark:text-gray-400">{h.thesis.catalysts}</p>
                </div>
              </div>
            )}

            {h.latestChangeEvent && (
              <p className="mt-3 text-xs font-medium text-risk-medium">
                Last change ({h.latestChangeEvent.createdAt.toLocaleDateString()}): {h.latestChangeEvent.changeType.replace(/_/g, ' ').toLowerCase()}
              </p>
            )}

            {h.latestNews.length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Latest material news</h3>
                <ul className="mt-1 space-y-1">
                  {h.latestNews.map((n) => (
                    <li key={n.id} className="text-sm text-gray-600 dark:text-gray-400">
                      {n.headline} <span className="text-xs text-gray-400">({n.materialityLevel.toLowerCase()})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
