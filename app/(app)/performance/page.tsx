import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import ActionBadge from '@/components/ActionBadge';
import FadeInView from '@/components/motion/FadeInView';
import { formatPercent } from '@/lib/format';

export const dynamic = 'force-dynamic';

function ReturnCell({ ret, alpha }: { ret: number | null; alpha: number | null }) {
  if (ret === null) return <span className="text-atlas-text-tertiary">pending</span>;
  return (
    <span className={`font-mono ${ret >= 0 ? 'text-risk-low' : 'text-risk-high'}`}>
      {formatPercent(ret)} {alpha !== null && <span className="text-xs text-atlas-text-tertiary">(α {formatPercent(alpha)})</span>}
    </span>
  );
}

export default async function PerformancePage() {
  const [scorecard, outcomes] = await Promise.all([
    prisma.recommendationScorecard.findFirst({ orderBy: { generatedAt: 'desc' } }),
    prisma.recommendationOutcome.findMany({ orderBy: { recommendedAt: 'desc' }, take: 100 }),
  ]);

  const graded = outcomes.filter((o) => o.wasCorrect !== null);
  const correct = graded.filter((o) => o.wasCorrect === true).length;

  return (
    <div className="space-y-14">
      <FadeInView>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-atlas-text-tertiary">Performance</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-atlas-text">Performance report</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-atlas-text-secondary">
          Tracks whether each recommendation actually added value: realized return vs. SPY (α = alpha) over
          30/90/180/365-day windows. Since Atlas never executes trades, a recommendation&rsquo;s &ldquo;outcome&rdquo;
          and &ldquo;what happens if you take no action&rdquo; are the same realized price path — there&rsquo;s no
          alternate universe to compare against. Windows that haven&rsquo;t elapsed yet show &ldquo;pending&rdquo;,
          not an estimate.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/scorecard" className="text-atlas-accent-bright underline decoration-atlas-border hover:decoration-atlas-accent-bright">
            See confidence calibration and detected patterns →
          </Link>
        </p>
      </FadeInView>

      {scorecard && (
        <FadeInView delay={0.05}>
          <div className="flex flex-wrap gap-x-10 gap-y-4 border-y border-atlas-border-subtle py-5">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Win rate</p>
              <p className="mt-1 font-mono text-lg text-atlas-text">
                {scorecard.winRatePct !== null ? `${scorecard.winRatePct.toFixed(0)}%` : 'n/a'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Avg alpha (90d)</p>
              <p className={`mt-1 font-mono text-lg ${(scorecard.alphaVsSpyAvgPct ?? 0) >= 0 ? 'text-risk-low' : 'text-risk-high'}`}>
                {scorecard.alphaVsSpyAvgPct !== null ? formatPercent(scorecard.alphaVsSpyAvgPct) : 'n/a'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Graded</p>
              <p className="mt-1 font-mono text-lg text-atlas-text">
                {correct}/{graded.length}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Tracked positions</p>
              <p className="mt-1 font-mono text-lg text-atlas-text">{outcomes.length}</p>
            </div>
          </div>
        </FadeInView>
      )}

      <div>
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Position ledger</h2>
        {outcomes.length === 0 ? (
          <p className="text-sm text-atlas-text-tertiary">
            No recommendation outcomes tracked yet — generate a recommendation and run the outcomes job.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-atlas-border-subtle text-left text-[11px] uppercase tracking-wide text-atlas-text-tertiary">
                <tr>
                  <th className="py-3 pr-4 font-medium">Symbol</th>
                  <th className="py-3 pr-4 font-medium">Action</th>
                  <th className="py-3 pr-4 font-medium">Recommended</th>
                  <th className="py-3 pr-4 font-medium">30d</th>
                  <th className="py-3 pr-4 font-medium">90d</th>
                  <th className="py-3 pr-4 font-medium">180d</th>
                  <th className="py-3 pr-4 font-medium">365d</th>
                  <th className="py-3 font-medium">Graded</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr key={o.id} className="border-b border-atlas-border-subtle/60 text-atlas-text transition-colors hover:bg-atlas-surface-hover">
                    <td className="py-3 pr-4 font-medium">{o.symbol}</td>
                    <td className="py-3 pr-4">
                      <ActionBadge action={o.action} />
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-atlas-text-tertiary">{o.recommendedAt.toLocaleDateString()}</td>
                    <td className="py-3 pr-4">
                      <ReturnCell ret={o.return30d} alpha={o.alpha30d} />
                    </td>
                    <td className="py-3 pr-4">
                      <ReturnCell ret={o.return90d} alpha={o.alpha90d} />
                    </td>
                    <td className="py-3 pr-4">
                      <ReturnCell ret={o.return180d} alpha={o.alpha180d} />
                    </td>
                    <td className="py-3 pr-4">
                      <ReturnCell ret={o.return365d} alpha={o.alpha365d} />
                    </td>
                    <td className="py-3 text-xs">
                      {o.wasCorrect === true ? (
                        <span className="text-risk-low">Correct</span>
                      ) : o.wasCorrect === false ? (
                        <span className="text-risk-high">Incorrect</span>
                      ) : (
                        <span className="text-atlas-text-tertiary">Not yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {outcomes.some((o) => o.lessonsLearned) && (
        <div className="border-t border-atlas-border-subtle pt-8">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Self-critique</h2>
          <ul className="space-y-4">
            {outcomes
              .filter((o) => o.lessonsLearned)
              .slice(0, 10)
              .map((o) => (
                <li key={o.id} className="border-l-2 border-atlas-border pl-4">
                  <p className="text-xs text-atlas-text-tertiary">
                    {o.symbol} · {o.recommendedAt.toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-atlas-text-secondary">{o.lessonsLearned}</p>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
