import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getPortfolioTimeline, type TimelineEntryType } from '@/lib/domain/timeline';
import { getActiveAccountId } from '@/lib/domain/portfolio';

export const dynamic = 'force-dynamic';

const TYPE_STYLES: Record<TimelineEntryType, string> = {
  sync: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  recommendation: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  transaction: 'bg-risk-low/10 text-risk-low',
  thesis_change: 'bg-risk-medium/10 text-risk-medium',
  conviction_change: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  risk_change: 'bg-risk-high/10 text-risk-high',
  health_change: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  news: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  earnings: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

export default async function TimelinePage({ searchParams }: { searchParams: { symbol?: string } }) {
  const accountId = await getActiveAccountId();
  const holdings = accountId ? await prisma.holding.findMany({ where: { accountId }, select: { symbol: true }, orderBy: { symbol: 'asc' } }) : [];

  const symbol = searchParams.symbol && searchParams.symbol !== 'ALL' ? searchParams.symbol : undefined;
  const entries = await getPortfolioTimeline({ symbol });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Portfolio Timeline</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Every sync, recommendation, trade, thesis update, conviction/risk/health change, material news item, and
          earnings event, merged into one chronological feed.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/timeline"
          className={`rounded-full px-3 py-1 ${!symbol ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}
        >
          All holdings
        </Link>
        {holdings.map((h) => (
          <Link
            key={h.symbol}
            href={`/timeline?symbol=${h.symbol}`}
            className={`rounded-full px-3 py-1 ${symbol === h.symbol ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}
          >
            {h.symbol}
          </Link>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">No timeline events yet.</p>
      ) : (
        <ol className="space-y-3">
          {entries.map((e) => (
            <li key={e.id} className="flex gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <span className={`h-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[e.type]}`}>
                {e.type.replace(/_/g, ' ')}
              </span>
              <div className="min-w-0 flex-1">
                {e.href ? (
                  <Link href={e.href} className="text-sm font-medium hover:underline" target={e.href.startsWith('http') ? '_blank' : undefined} rel={e.href.startsWith('http') ? 'noreferrer' : undefined}>
                    {e.title}
                  </Link>
                ) : (
                  <p className="text-sm font-medium">{e.title}</p>
                )}
                {e.detail && <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{e.detail}</p>}
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{e.timestamp.toLocaleString()}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
