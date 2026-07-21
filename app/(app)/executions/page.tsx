import { prisma } from '@/lib/prisma';
import { getActiveAccountId } from '@/lib/domain/portfolio';
import FadeInView from '@/components/motion/FadeInView';
import StatusBanner from '@/components/StatusBanner';
import { recordManualExecutionFromForm } from './actions';

export const dynamic = 'force-dynamic';

const MATCH_STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-atlas-surface-raised text-atlas-text-tertiary',
  MATCHED: 'bg-risk-low/10 text-risk-low',
  PARTIALLY_MATCHED: 'bg-risk-medium/10 text-risk-medium',
  UNMATCHED: 'bg-atlas-surface-raised text-atlas-text-tertiary',
  AMOUNT_MISMATCH: 'bg-risk-high/10 text-risk-high',
  QUANTITY_MISMATCH: 'bg-risk-high/10 text-risk-high',
  PRICE_MISMATCH: 'bg-risk-high/10 text-risk-high',
  TIMING_MISMATCH: 'bg-risk-medium/10 text-risk-medium',
};

const inputClass =
  'w-full rounded-lg border border-atlas-border bg-atlas-surface-raised px-3 py-2 text-sm text-atlas-text placeholder:text-atlas-text-tertiary focus:border-atlas-accent/50 focus:outline-none focus:ring-1 focus:ring-atlas-accent/40';

export default async function ExecutionsPage({ searchParams }: { searchParams: { error?: string; recorded?: string } }) {
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
    <div className="space-y-8">
      <FadeInView>
        <h1 className="text-xl font-semibold tracking-tight text-atlas-text">Manual executions</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-atlas-text-secondary">
          Record a trade you already executed yourself in Robinhood — this only creates a record for Atlas to check
          against the next real sync; it never submits, previews, cancels, or modifies anything. Reconciliation runs
          automatically as part of the post-sync pipeline (
          <code className="rounded bg-atlas-surface-raised px-1">lib/domain/executionReconciliation.ts</code>).
        </p>
      </FadeInView>

      {searchParams.recorded === '1' && <StatusBanner variant="success">Execution recorded.</StatusBanner>}
      {searchParams.error && <StatusBanner variant="error">{searchParams.error}</StatusBanner>}

      <form action={recordManualExecutionFromForm} className="atlas-glass grid gap-3 rounded-xl p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="symbol" className="mb-1 block text-xs text-atlas-text-tertiary">Symbol</label>
          <input id="symbol" name="symbol" required type="text" className={inputClass} />
        </div>
        <div>
          <label htmlFor="side" className="mb-1 block text-xs text-atlas-text-tertiary">Side</label>
          <select id="side" name="side" className={inputClass}>
            <option value="BUY">Buy</option>
            <option value="SELL">Sell</option>
          </select>
        </div>
        <div>
          <label htmlFor="executedAt" className="mb-1 block text-xs text-atlas-text-tertiary">Execution time</label>
          <input id="executedAt" name="executedAt" required type="datetime-local" className={inputClass} />
        </div>
        <div>
          <label htmlFor="quantity" className="mb-1 block text-xs text-atlas-text-tertiary">Quantity</label>
          <input id="quantity" name="quantity" required type="number" min="0" step="any" className={inputClass} />
        </div>
        <div>
          <label htmlFor="executionPrice" className="mb-1 block text-xs text-atlas-text-tertiary">Execution price</label>
          <input id="executionPrice" name="executionPrice" required type="number" min="0" step="any" className={inputClass} />
        </div>
        <div>
          <label htmlFor="dollarAmount" className="mb-1 block text-xs text-atlas-text-tertiary">Dollar amount</label>
          <input id="dollarAmount" name="dollarAmount" required type="number" min="0" step="any" className={inputClass} />
        </div>
        <div>
          <label htmlFor="fees" className="mb-1 block text-xs text-atlas-text-tertiary">Fees (optional)</label>
          <input id="fees" name="fees" type="number" min="0" step="any" defaultValue={0} className={inputClass} />
        </div>
        <div>
          <label htmlFor="recommendationId" className="mb-1 block text-xs text-atlas-text-tertiary">Related recommendation (optional)</label>
          <select id="recommendationId" name="recommendationId" className={inputClass}>
            <option value="">None</option>
            {recentRecommendations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.symbol} · {r.action} · {r.generatedAt.toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <label htmlFor="note" className="mb-1 block text-xs text-atlas-text-tertiary">Note (optional)</label>
          <input id="note" name="note" type="text" className={inputClass} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            className="rounded-lg bg-atlas-accent px-4 py-2 text-sm font-medium text-white transition-all hover:bg-atlas-accent-bright hover:shadow-glow-accent active:scale-[0.97]"
          >
            Record execution
          </button>
        </div>
      </form>

      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Execution log</h2>
        {executions.length === 0 ? (
          <p className="text-sm text-atlas-text-tertiary">No manually recorded executions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-atlas-border-subtle text-left text-[11px] uppercase tracking-wide text-atlas-text-tertiary">
                  <th className="py-2 pr-4 font-medium">Recorded</th>
                  <th className="py-2 pr-4 font-medium">Symbol</th>
                  <th className="py-2 pr-4 font-medium">Side</th>
                  <th className="py-2 pr-4 font-medium">Qty</th>
                  <th className="py-2 pr-4 font-medium">Price</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Recommendation</th>
                  <th className="py-2 pr-4 font-medium">Match status</th>
                  <th className="py-2 font-medium">Reconciliation note</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((e) => (
                  <tr key={e.id} className="border-b border-atlas-border-subtle/60 text-atlas-text transition-colors hover:bg-atlas-surface-hover">
                    <td className="py-2 pr-4 font-mono text-xs text-atlas-text-tertiary">{e.recordedAt.toLocaleDateString()}</td>
                    <td className="py-2 pr-4 font-medium">{e.symbol}</td>
                    <td className="py-2 pr-4">{e.side}</td>
                    <td className="py-2 pr-4 font-mono text-atlas-text-secondary">{Number(e.quantity)}</td>
                    <td className="py-2 pr-4 font-mono text-atlas-text-secondary">${Number(e.executionPrice).toFixed(2)}</td>
                    <td className="py-2 pr-4 font-mono text-atlas-text-secondary">${Number(e.dollarAmount).toFixed(2)}</td>
                    <td className="py-2 pr-4 text-xs text-atlas-text-tertiary">{e.recommendation ? `${e.recommendation.symbol} (${e.recommendation.action})` : '—'}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MATCH_STATUS_STYLES[e.matchStatus]}`}>
                        {e.matchStatus.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="max-w-xs py-2 text-xs text-atlas-text-tertiary">{e.reconciliationNote ?? 'Awaiting next sync.'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
