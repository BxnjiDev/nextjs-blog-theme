import { prisma } from '@/lib/prisma';
import ActionBadge from '@/components/ActionBadge';
import { formatPercent } from '@/lib/format';

export const dynamic = 'force-dynamic';

function ReturnCell({ ret, alpha }: { ret: number | null; alpha: number | null }) {
  if (ret === null) return <span className="text-gray-400 dark:text-gray-500">pending</span>;
  return (
    <span className={ret >= 0 ? 'text-risk-low' : 'text-risk-high'}>
      {formatPercent(ret)} {alpha !== null && <span className="text-xs text-gray-500">(α {formatPercent(alpha)})</span>}
    </span>
  );
}

export default async function PerformancePage() {
  const outcomes = await prisma.recommendationOutcome.findMany({
    orderBy: { recommendedAt: 'desc' },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Performance Attribution</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Tracks whether each recommendation actually added value: realized return vs. SPY (α = alpha) over
          30/90/180/365-day windows. Since Atlas never executes trades, a recommendation&rsquo;s &ldquo;outcome&rdquo;
          and &ldquo;what happens if you take no action&rdquo; are the same realized price path — there&rsquo;s no
          alternate universe to compare against. Windows that haven&rsquo;t elapsed yet show &ldquo;pending&rdquo;,
          not an estimate.
        </p>
      </div>

      {outcomes.length === 0 ? (
        <p className="text-sm text-gray-500">
          No recommendation outcomes tracked yet — generate a recommendation and run the outcomes job.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2">Symbol</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Recommended</th>
                <th className="px-4 py-2">30d</th>
                <th className="px-4 py-2">90d</th>
                <th className="px-4 py-2">180d</th>
                <th className="px-4 py-2">365d</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map((o) => (
                <tr key={o.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-2 font-medium">{o.symbol}</td>
                  <td className="px-4 py-2">
                    <ActionBadge action={o.action} />
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{o.recommendedAt.toLocaleDateString()}</td>
                  <td className="px-4 py-2">
                    <ReturnCell ret={o.return30d} alpha={o.alpha30d} />
                  </td>
                  <td className="px-4 py-2">
                    <ReturnCell ret={o.return90d} alpha={o.alpha90d} />
                  </td>
                  <td className="px-4 py-2">
                    <ReturnCell ret={o.return180d} alpha={o.alpha180d} />
                  </td>
                  <td className="px-4 py-2">
                    <ReturnCell ret={o.return365d} alpha={o.alpha365d} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
