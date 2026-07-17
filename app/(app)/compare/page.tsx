import Link from 'next/link';
import { compareOpportunities, CASH_BASELINE_SCORE } from '@/lib/domain/compareOpportunities';

export const dynamic = 'force-dynamic';

const EXAMPLE_SYMBOLS = 'AMZN, MSFT, NVDA, ORCL, KTOS, RKLB';

function rankColor(rank: number): string {
  if (rank === 1) return 'border-risk-low/40 bg-risk-low/5';
  return 'border-gray-200 dark:border-gray-800';
}

export default async function ComparePage({ searchParams }: { searchParams: { symbols?: string; cash?: string } }) {
  const rawSymbols = searchParams.symbols ?? '';
  const symbols = rawSymbols
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const includeCash = searchParams.cash !== '0';

  const results = symbols.length > 0 ? await compareOpportunities(symbols, includeCash) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Compare Opportunities</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          &ldquo;Should I buy {EXAMPLE_SYMBOLS}, or hold cash?&rdquo; — rank any set of symbols (held or not)
          against each other using the same deterministic conviction engine (
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">lib/domain/conviction.ts</code>) that
          scores every thesis, so results here match what each symbol&rsquo;s Investment Memo would show.
          No AI narrative is generated for this ad-hoc view — it stays fast and free of API cost.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <div className="flex-1 min-w-[16rem]">
          <label htmlFor="symbols" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
            Symbols (comma-separated)
          </label>
          <input
            id="symbols"
            name="symbols"
            type="text"
            defaultValue={rawSymbols}
            placeholder={EXAMPLE_SYMBOLS}
            className="w-full rounded border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-gray-600 dark:text-gray-400">
          <input type="checkbox" name="cash" value="1" defaultChecked={includeCash} className="rounded" />
          Include &ldquo;hold cash&rdquo;
        </label>
        <button
          type="submit"
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white dark:bg-gray-100 dark:text-gray-900"
        >
          Compare
        </button>
      </form>

      {symbols.length === 0 ? (
        <p className="text-sm text-gray-500">
          Enter symbols above to rank them — for example{' '}
          <Link href={`/compare?symbols=${encodeURIComponent(EXAMPLE_SYMBOLS)}`} className="underline">
            {EXAMPLE_SYMBOLS}
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-3">
          {results.map((r) => (
            <div key={r.symbol} className={`rounded-lg border p-4 ${rankColor(r.rank)}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-400 dark:text-gray-600">#{r.rank}</span>
                    <h2 className="font-semibold">
                      {r.symbol}
                      {r.name && !r.isCash && <span className="font-normal text-gray-500"> — {r.name}</span>}
                    </h2>
                    {r.isHeld && (
                      <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                        Currently held
                      </span>
                    )}
                    {r.isCash && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        Neutral baseline
                      </span>
                    )}
                  </div>
                  {r.sector && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{r.sector}</p>}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold">{r.overallScore}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {r.isCash ? `/100 (fixed baseline)` : '/100 conviction'}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{r.explanation}</p>

              {r.quote && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  ${r.quote.price.toFixed(2)} ({r.quote.changePercent >= 0 ? '+' : ''}
                  {r.quote.changePercent.toFixed(2)}%, {r.quote.quality})
                </p>
              )}

              {r.conviction && (
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-xs dark:border-gray-800 sm:grid-cols-4">
                  {(
                    [
                      ['financialStrength', 'Financial strength'],
                      ['revenueGrowth', 'Revenue growth'],
                      ['profitability', 'Profitability'],
                      ['valuation', 'Valuation'],
                      ['competitiveMoat', 'Competitive moat'],
                      ['executionRisk', 'Execution risk'],
                      ['regulatoryRisk', 'Regulatory risk'],
                      ['macroSensitivity', 'Macro sensitivity'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="flex justify-between gap-2 text-gray-500 dark:text-gray-400">
                      <span>{label}</span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {r.conviction![key].score ?? 'n/a'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {r.latestRecommendationId && (
                <Link href={`/recommendations/${r.latestRecommendationId}`} className="mt-3 inline-block text-xs underline">
                  View Investment Memo →
                </Link>
              )}
            </div>
          ))}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Cash is scored at a fixed neutral baseline ({CASH_BASELINE_SCORE}/100) — it isn&rsquo;t analyzed like a
            symbol, it exists so the ranking shows whether each opportunity clears &ldquo;better than doing
            nothing.&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}
