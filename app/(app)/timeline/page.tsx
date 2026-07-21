import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getPortfolioTimeline, type TimelineEntryType } from '@/lib/domain/timeline';
import { getActiveAccountId } from '@/lib/domain/portfolio';
import FadeInView from '@/components/motion/FadeInView';

export const dynamic = 'force-dynamic';

const TYPE_STYLES: Record<TimelineEntryType, string> = {
  sync: 'bg-atlas-surface-raised text-atlas-text-tertiary',
  recommendation: 'bg-atlas-accent/10 text-atlas-accent-bright',
  transaction: 'bg-risk-low/10 text-risk-low',
  thesis_change: 'bg-risk-medium/10 text-risk-medium',
  conviction_change: 'bg-atlas-steel/10 text-atlas-steel',
  risk_change: 'bg-risk-high/10 text-risk-high',
  health_change: 'bg-atlas-emerald/10 text-atlas-emerald',
  news: 'bg-atlas-surface-raised text-atlas-text-tertiary',
  earnings: 'bg-atlas-warning/10 text-atlas-warning',
};

export default async function TimelinePage({ searchParams }: { searchParams: { symbol?: string } }) {
  const accountId = await getActiveAccountId();
  const holdings = accountId ? await prisma.holding.findMany({ where: { accountId }, select: { symbol: true }, orderBy: { symbol: 'asc' } }) : [];

  const symbol = searchParams.symbol && searchParams.symbol !== 'ALL' ? searchParams.symbol : undefined;
  const entries = await getPortfolioTimeline({ symbol });

  return (
    <div className="space-y-8">
      <FadeInView>
        <h1 className="text-xl font-semibold tracking-tight text-atlas-text">Portfolio timeline</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-atlas-text-secondary">
          Every sync, recommendation, trade, thesis update, conviction/risk/health change, material news item, and
          earnings event, merged into one chronological feed.
        </p>
      </FadeInView>

      <FadeInView delay={0.05}>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link
            href="/timeline"
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              !symbol ? 'bg-atlas-accent text-white' : 'bg-atlas-surface-raised text-atlas-text-tertiary hover:bg-atlas-surface-hover hover:text-atlas-text-secondary'
            }`}
          >
            All holdings
          </Link>
          {holdings.map((h) => (
            <Link
              key={h.symbol}
              href={`/timeline?symbol=${h.symbol}`}
              className={`rounded-full px-3 py-1 font-medium transition-colors ${
                symbol === h.symbol
                  ? 'bg-atlas-accent text-white'
                  : 'bg-atlas-surface-raised text-atlas-text-tertiary hover:bg-atlas-surface-hover hover:text-atlas-text-secondary'
              }`}
            >
              {h.symbol}
            </Link>
          ))}
        </div>
      </FadeInView>

      {entries.length === 0 ? (
        <p className="text-sm text-atlas-text-tertiary">No timeline events yet.</p>
      ) : (
        <ol className="divide-y divide-atlas-border-subtle">
          {entries.map((e, i) => (
            <FadeInView key={e.id} delay={Math.min(0.08 + i * 0.02, 0.3)}>
              <li className="flex gap-3 py-3.5">
                <span className={`h-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TYPE_STYLES[e.type]}`}>
                  {e.type.replace(/_/g, ' ')}
                </span>
                <div className="min-w-0 flex-1">
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
                  {e.detail && <p className="mt-0.5 text-xs text-atlas-text-secondary">{e.detail}</p>}
                  <p className="mt-0.5 font-mono text-[11px] text-atlas-text-tertiary">{e.timestamp.toLocaleString()}</p>
                </div>
              </li>
            </FadeInView>
          ))}
        </ol>
      )}
    </div>
  );
}
