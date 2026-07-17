import { prisma } from '@/lib/prisma';
import { getActiveAccountId } from '@/lib/domain/portfolio';
import { recordManualExecutionFromForm } from './actions';

export const dynamic = 'force-dynamic';

const MATCH_STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  MATCHED: 'bg-risk-low/10 text-risk-low',
  PARTIALLY_MATCHED: 'bg-risk-medium/10 text-risk-medium',
  UNMATCHED: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  AMOUNT_MISMATCH: 'bg-risk-high/10 text-risk-high',
  QUANTITY_MISMATCH: 'bg-risk-high/10 text-risk-high',
  PRICE_MISMATCH: 'bg-risk-high/10 text-risk-high',
  TIMING_MISMATCH: 'bg-risk-medium/10 text-risk-medium',
};

export default async function ExecutionsPage() {
  const accountId = await getActiveAccountId();

  const [executions, recentRecommendations] = await Promise.all([
    accountId
      ? prisma.manualExecution.findMany({
          where: { accountId },
          include: { recommendation: { select: { id: true, symbol: true, action: true } }, matchedTransaction: { select: { id: true, executedAt: true, quantity: true, price: true } } },
          orderBy: { recordedAt: 'desc' },
          take: 100,
        })
      : [],
    accountId
      ? prisma.recommendation.findMany({
          where: { holding: { accountId }, generatedAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } },
          select: { id: true, symbol: true, action: true, generatedAt: true },
          orderBy: { generatedAt: 'desc' },
          take: 50,
        })
      : [],
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Manual Executions</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Record a trade you already executed yourself in Robinhood — this only creates a record for Atlas to check
          against the next real sync; it never submits, previews, cancels, or modifies anything. Reconciliation runs
          automatically as part of the post-sync pipeline (<code className="rounded bg-gray-100 px-1 dark:bg-gray-800">lib/domain/executionReconciliation.ts</code>).
        </p>
      </div>

      <form action={recordManualExecutionFromForm} className="grid gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="symbol" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Symbol</label>
          <input id="symbol" name="symbol" required type="text" className="w-full rounded border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700" />
        </div>
        <div>
          <label htmlFor="side" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Side</label>
          <select id="side" name="side" className="w-full rounded border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700">
            <option value="BUY">Buy</option>
            <option value="SELL">Sell</option>
          </select>
        </div>
        <div>
          <label htmlFor="executedAt" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Execution time</label>
          <input id="executedAt" name="executedAt" required type="datetime-local" className="w-full rounded border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700" />
        </div>
        <div>
          <label htmlFor="quantity" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Quantity</label>
          <input id="quantity" name="quantity" required type="number" min="0" step="any" className="w-full rounded border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700" />
        </div>
        <div>
          <label htmlFor="executionPrice" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Execution price</label>
          <input id="executionPrice" name="executionPrice" required type="number" min="0" step="any" className="w-full rounded border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700" />
        </div>
        <div>
          <label htmlFor="dollarAmount" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Dollar amount</label>
          <input id="dollarAmount" name="dollarAmount" required type="number" min="0" step="any" className="w-full rounded border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700" />
        </div>
        <div>
          <label htmlFor="fees" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Fees (optional)</label>
          <input id="fees" name="fees" type="number" min="0" step="any" defaultValue={0} className="w-full rounded border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700" />
        </div>
        <div>
          <label htmlFor="recommendationId" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Related recommendation (optional)</label>
          <select id="recommendationId" name="recommendationId" className="w-full rounded border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700">
            <option value="">None</option>
            {recentRecommendations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.symbol} · {r.action} · {r.generatedAt.toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <label htmlFor="note" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Note (optional)</label>
          <input id="note" name="note" type="text" className="w-full rounded border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700" />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <button type="submit" className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white dark:bg-gray-100 dark:text-gray-900">
            Record execution
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <th className="px-3 py-2">Recorded</th>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Side</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Recommendation</th>
              <th className="px-3 py-2">Match status</th>
              <th className="px-3 py-2">Reconciliation note</th>
            </tr>
          </thead>
          <tbody>
            {executions.map((e) => (
              <tr key={e.id} className="border-b border-gray-50 dark:border-gray-900">
                <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{e.recordedAt.toLocaleDateString()}</td>
                <td className="px-3 py-2 font-medium">{e.symbol}</td>
                <td className="px-3 py-2">{e.side}</td>
                <td className="px-3 py-2">{Number(e.quantity)}</td>
                <td className="px-3 py-2">${Number(e.executionPrice).toFixed(2)}</td>
                <td className="px-3 py-2">${Number(e.dollarAmount).toFixed(2)}</td>
                <td className="px-3 py-2 text-xs">{e.recommendation ? `${e.recommendation.symbol} (${e.recommendation.action})` : '—'}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MATCH_STATUS_STYLES[e.matchStatus]}`}>
                    {e.matchStatus.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 max-w-xs text-xs text-gray-500 dark:text-gray-400">{e.reconciliationNote ?? 'Awaiting next sync.'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {executions.length === 0 && <p className="p-4 text-sm text-gray-500">No manually recorded executions yet.</p>}
      </div>
    </div>
  );
}
