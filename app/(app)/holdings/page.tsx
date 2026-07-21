import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import ActionBadge from '@/components/ActionBadge';
import ConfidenceBadge from '@/components/ConfidenceBadge';
import FadeInView from '@/components/motion/FadeInView';
import { getActiveAccountId } from '@/lib/domain/portfolio';

export const dynamic = 'force-dynamic';

export default async function HoldingsPage() {
  // Found during this redesign pass: this query had no accountId filter at
  // all, so it showed every Holding row in the database — including
  // leftover seed/mock accounts — rather than just the real active
  // account's positions. Scoped the same way every other page resolves
  // "the" portfolio (see lib/domain/portfolio.ts's getActiveAccountId doc).
  const accountId = await getActiveAccountId();
  const holdings = accountId
    ? await prisma.holding.findMany({
        where: { accountId },
        include: {
          recommendations: {
            orderBy: { generatedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { symbol: 'asc' },
      })
    : [];

  return (
    <div className="space-y-8">
      <FadeInView>
        <h1 className="text-xl font-semibold tracking-tight text-atlas-text">Holdings index</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-atlas-text-secondary">
          One row per position, at a glance. The full thesis — bull/bear case, catalysts, risks, explainability — is
          on each holding&rsquo;s{' '}
          <span className="text-atlas-text-tertiary">Investment Memo</span>, not repeated here; this page is for
          scanning the whole book quickly, not reading.
        </p>
      </FadeInView>

      {holdings.length === 0 && <p className="text-sm text-atlas-text-tertiary">No holdings yet. Seed the database or connect an account.</p>}

      <div className="divide-y divide-atlas-border-subtle">
        {holdings.map((h, i) => {
          const rec = h.recommendations[0];
          return (
            <FadeInView key={h.id} delay={Math.min(i * 0.03, 0.2)}>
              <div id={h.symbol} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-base font-semibold text-atlas-text">{h.symbol}</span>
                    <span className="text-sm text-atlas-text-tertiary">{h.name}</span>
                    {rec?.thesisChanged && <span className="text-xs font-medium text-atlas-warning">Thesis changed</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-atlas-text-tertiary">
                    {h.sector ?? 'Sector unclassified'} · {Number(h.quantity)} sh @ avg cost {Number(h.avgCostBasis).toFixed(2)}
                  </p>
                  {rec ? (
                    <p className="mt-1.5 max-w-xl truncate text-sm text-atlas-text-secondary">{rec.thesis}</p>
                  ) : (
                    <p className="mt-1.5 text-sm text-atlas-text-tertiary">No analysis generated yet for this holding.</p>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                  {rec && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <ActionBadge action={rec.action} />
                        <ConfidenceBadge score={rec.confidenceScore} />
                      </div>
                      <Link
                        href={`/recommendations/${rec.id}`}
                        className="text-xs text-atlas-accent-bright underline decoration-atlas-border hover:decoration-atlas-accent-bright"
                      >
                        Full Investment Memo →
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </FadeInView>
          );
        })}
      </div>
    </div>
  );
}
