import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getPortfolioTimeline } from '@/lib/domain/timeline';
import { getActiveAccountId } from '@/lib/domain/portfolio';
import FadeInView from '@/components/motion/FadeInView';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import SectionHeading from '@/components/ui/SectionHeading';
import InsightStack from '@/components/intelligence/InsightStack';
import { assessTimelineNotable } from '@/lib/intelligence/engine';
import { TIMELINE_TYPE_TONE, TONE_DOT } from '@/lib/theme/tone';

export const dynamic = 'force-dynamic';

// Routine, high-frequency event types read as quiet dots on the river;
// everything else — a real change in position or judgment — gets the
// brighter treatment. Same "does this matter right now" grammar as Home's
// OrbitRow dots, so the two pages read as one timeline language.
const QUIET_TYPES = new Set(['sync', 'news']);

export default async function TimelinePage({ searchParams }: { searchParams: { symbol?: string } }) {
  const accountId = await getActiveAccountId();
  const holdings = accountId ? await prisma.holding.findMany({ where: { accountId }, select: { symbol: true }, orderBy: { symbol: 'asc' } }) : [];

  const symbol = searchParams.symbol && searchParams.symbol !== 'ALL' ? searchParams.symbol : undefined;
  const entries = await getPortfolioTimeline({ symbol });
  // Reuses the same `entries` this page already fetched — no second query —
  // to rank the handful of events that actually represent a change in
  // judgment or position, ahead of scrolling the full river to find them.
  const notableInsights = assessTimelineNotable(entries);

  return (
    <div className="space-y-10">
      <FadeInView>
        <h1 className="text-xl font-semibold tracking-tight text-atlas-text">Portfolio timeline</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-atlas-text-secondary">
          Every sync, recommendation, trade, thesis update, conviction/risk/health change, material news item, and
          earnings event, merged into one chronological river.
        </p>
      </FadeInView>

      <FadeInView delay={0.03}>
        <SectionHeading className="mb-3">Notable this period</SectionHeading>
        <InsightStack insights={notableInsights} variant="list" emptyMessage="No standout events since your last review — mostly routine activity." />
      </FadeInView>

      <FadeInView delay={0.05}>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link
            href="/timeline"
            className={`atlas-press rounded-full px-3 py-1 font-medium transition-colors ${
              !symbol
                ? 'bg-atlas-accent text-white hover:shadow-glow-accent'
                : 'bg-atlas-surface-raised text-atlas-text-tertiary hover:bg-atlas-surface-hover hover:text-atlas-text-secondary'
            }`}
          >
            All holdings
          </Link>
          {holdings.map((h) => (
            <Link
              key={h.symbol}
              href={`/timeline?symbol=${h.symbol}`}
              className={`atlas-press rounded-full px-3 py-1 font-medium transition-colors ${
                symbol === h.symbol
                  ? 'bg-atlas-accent text-white hover:shadow-glow-accent'
                  : 'bg-atlas-surface-raised text-atlas-text-tertiary hover:bg-atlas-surface-hover hover:text-atlas-text-secondary'
              }`}
            >
              {h.symbol}
            </Link>
          ))}
        </div>
      </FadeInView>

      {entries.length === 0 ? (
        <EmptyState>No timeline events yet.</EmptyState>
      ) : (
        <div className="relative">
          {/* The river — a continuous spine behind every node, so the feed
              reads as one connected current of portfolio history rather
              than a stack of unrelated rows. */}
          <div aria-hidden="true" className="pointer-events-none absolute bottom-2 left-[7px] top-2 w-px bg-atlas-border" />
          <ol className="space-y-0.5">
            {entries.map((e, i) => {
              const tone = TIMELINE_TYPE_TONE[e.type] ?? 'muted';
              const quiet = QUIET_TYPES.has(e.type);
              return (
                <FadeInView key={e.id} delay={Math.min(0.08 + i * 0.02, 0.3)}>
                  <li className="relative flex gap-4 py-3">
                    <span className="relative z-10 mt-1.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                      <span
                        className={`rounded-full ${TONE_DOT[tone]} ${quiet ? 'h-1.5 w-1.5 opacity-60' : 'h-2.5 w-2.5'}`}
                        aria-hidden="true"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={tone}>{e.type.replace(/_/g, ' ')}</Badge>
                        {e.href ? (
                          <Link
                            href={e.href}
                            className="text-sm font-medium text-atlas-text underline decoration-atlas-border hover:decoration-atlas-accent-bright"
                            target={e.href.startsWith('http') ? '_blank' : undefined}
                            rel={e.href.startsWith('http') ? 'noreferrer' : undefined}
                          >
                            {e.title}
                          </Link>
                        ) : (
                          <p className="text-sm font-medium text-atlas-text">{e.title}</p>
                        )}
                      </div>
                      {e.detail && <p className="mt-1 text-xs text-atlas-text-secondary">{e.detail}</p>}
                      <p className="mt-1 font-mono text-[11px] text-atlas-text-tertiary">{e.timestamp.toLocaleString()}</p>
                    </div>
                  </li>
                </FadeInView>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
