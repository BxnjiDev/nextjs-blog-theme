import Link from 'next/link';
import { compareOpportunities, CASH_BASELINE_SCORE } from '@/lib/domain/compareOpportunities';
import FadeInView from '@/components/motion/FadeInView';

export const dynamic = 'force-dynamic';

const EXAMPLE_SYMBOLS = 'AMZN, MSFT, NVDA, ORCL, KTOS, RKLB';

function rankStyle(rank: number): string {
  return rank === 1 ? 'border-atlas-emerald/30 bg-atlas-emerald/5' : 'border-atlas-border';
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
    <div className="space-y-8">
      <FadeInView>
        <h1 className="text-xl font-semibold tracking-tight text-atlas-text">Compare opportunities</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-atlas-text-secondary">
          &ldquo;Should I buy {EXAMPLE_SYMBOLS}, or hold cash?&rdquo; — rank any set of symbols (held or not) against
          each other using the same deterministic conviction engine (
          <code className="rounded bg-atlas-surface-raised px-1">lib/domain/conviction.ts</code>) that scores every
          thesis, so results here match what each symbol&rsquo;s Investment Memo would show. No AI narrative is
          generated for this ad-hoc view — it stays fast and free of API cost.
        </p>
      </FadeInView>

      <form className="atlas-glass flex flex-wrap items-end gap-3 rounded-xl p-4">
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="symbols" className="mb-1 block text-xs text-atlas-text-tertiary">
            Symbols (comma-separated)
          </label>
          <input
            id="symbols"
            name="symbols"
            type="text"
            defaultValue={rawSymbols}
            placeholder={EXAMPLE_SYMBOLS}
            className="w-full rounded-lg border border-atlas-border bg-atlas-surface-raised px-3 py-2 text-sm text-atlas-text placeholder:text-atlas-text-tertiary focus:border-atlas-accent/50 focus:outline-none focus:ring-1 focus:ring-atlas-accent/40"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-atlas-text-secondary">
          <input type="checkbox" name="cash" value="1" defaultChecked={includeCash} className="rounded accent-atlas-accent" />
          Include &ldquo;hold cash&rdquo;
        </label>
        <button
          type="submit"
          className="rounded-lg bg-atlas-accent px-4 py-2 text-sm font-medium text-white transition-all hover:bg-atlas-accent-bright hover:shadow-glow-accent active:scale-[0.97]"
        >
          Compare
        </button>
      </form>

      {symbols.length === 0 ? (
        <p className="text-sm text-atlas-text-tertiary">
          Enter symbols above to rank them — for example{' '}
          <Link href={`/compare?symbols=${encodeURIComponent(EXAMPLE_SYMBOLS)}`} className="text-atlas-accent-bright underline">
            {EXAMPLE_SYMBOLS}
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-3">
          {results.map((r, i) => (
            <FadeInView key={r.symbol} delay={Math.min(i * 0.05, 0.25)}>
              <div className={`rounded-xl border p-4 ${rankStyle(r.rank)}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg font-bold text-atlas-text-tertiary">#{r.rank}</span>
                      <h2 className="font-semibold text-atlas-text">
                        {r.symbol}
                        {r.name && !r.isCash && <span className="font-normal text-atlas-text-tertiary"> — {r.name}</span>}
                      </h2>
                      {r.isHeld && (
                        <span className="rounded-full bg-atlas-steel/10 px-2 py-0.5 text-xs font-medium text-atlas-steel">Currently held</span>
                      )}
                      {r.isCash && (
                        <span className="rounded-full bg-atlas-surface-raised px-2 py-0.5 text-xs font-medium text-atlas-text-tertiary">
                          Neutral baseline
                        </span>
                      )}
                    </div>
                    {r.sector && <p className="mt-0.5 text-xs text-atlas-text-tertiary">{r.sector}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-2xl font-semibold text-atlas-text">{r.overallScore}</p>
                    <p className="text-xs text-atlas-text-tertiary">{r.isCash ? '/100 (fixed baseline)' : '/100 conviction'}</p>
                  </div>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-atlas-text-secondary">{r.explanation}</p>

                {r.quote && (
                  <p className="mt-2 font-mono text-xs text-atlas-text-tertiary">
                    ${r.quote.price.toFixed(2)} ({r.quote.changePercent >= 0 ? '+' : ''}
                    {r.quote.changePercent.toFixed(2)}%, {r.quote.quality})
                  </p>
                )}

                {r.conviction && (
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-atlas-border-subtle pt-3 text-xs sm:grid-cols-4">
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
                      <div key={key} className="flex justify-between gap-2 text-atlas-text-tertiary">
                        <span>{label}</span>
                        <span className="font-mono font-medium text-atlas-text-secondary">{r.conviction![key].score ?? 'n/a'}</span>
                      </div>
                    ))}
                  </div>
                )}

                {r.latestRecommendationId && (
                  <Link href={`/recommendations/${r.latestRecommendationId}`} className="mt-3 inline-block text-xs text-atlas-accent-bright underline">
                    View Investment Memo →
                  </Link>
                )}
              </div>
            </FadeInView>
          ))}
          <p className="text-xs text-atlas-text-tertiary">
            Cash is scored at a fixed neutral baseline ({CASH_BASELINE_SCORE}/100) — it isn&rsquo;t analyzed like a
            symbol, it exists so the ranking shows whether each opportunity clears &ldquo;better than doing
            nothing.&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}
