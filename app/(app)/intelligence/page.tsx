import Link from 'next/link';
import { getPortfolioIntelligence } from '@/lib/domain/intelligence';
import ConfidenceMeter from '@/components/intelligence/ConfidenceMeter';
import FadeInView from '@/components/motion/FadeInView';

export const dynamic = 'force-dynamic';

const TREND_LABEL: Record<string, string> = {
  IMPROVING: 'Growing confidence',
  STABLE: 'Stable',
  WEAKENING: 'Weakening',
  UNKNOWN: 'Not enough history',
};

const TREND_COLOR: Record<string, string> = {
  IMPROVING: 'text-atlas-emerald',
  STABLE: 'text-atlas-text-tertiary',
  WEAKENING: 'text-risk-high',
  UNKNOWN: 'text-atlas-text-tertiary',
};

/** Truncates at the last whole word within the limit instead of a raw
 * character slice, so badges never cut off mid-word (e.g. "set ANT..."
 * instead of "set ANTHROPIC_API_KEY"). */
function truncateWords(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

export default async function IntelligencePage() {
  const intelligence = await getPortfolioIntelligence();

  return (
    <div className="space-y-14">
      <FadeInView>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-atlas-text-tertiary">Intelligence</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-atlas-text">What Atlas is thinking</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-atlas-text-secondary">
          A persistent thesis per holding — conviction trend, the latest change, top risks and catalysts, and the
          most material recent news. Updated by the daily thesis-review job, not regenerated from scratch every
          run.
        </p>
      </FadeInView>

      {intelligence.length === 0 && <p className="text-sm text-atlas-text-tertiary">No holdings yet.</p>}

      {/* A reasoning timeline, not a grid of cards — each entry reads like
          a log Atlas kept while thinking about the position. */}
      <div className="relative">
        <div className="absolute bottom-0 left-[3px] top-2 hidden w-px bg-atlas-border-subtle sm:block" />
        <div className="space-y-12">
          {intelligence.map((h, i) => (
            <FadeInView key={h.symbol} delay={Math.min(i * 0.06, 0.3)}>
              <div className="relative sm:pl-8">
                <span className="absolute left-0 top-2 hidden h-[7px] w-[7px] rounded-full bg-atlas-accent-bright shadow-glow-accent sm:block" />

                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <Link href={`/intelligence/${h.symbol}`} className="group">
                    <h2 className="text-2xl font-semibold text-atlas-text transition-colors group-hover:text-atlas-accent-bright">
                      {h.symbol}
                    </h2>
                    <span className="text-sm text-atlas-text-tertiary">{h.name}</span>
                  </Link>
                  {h.currentConviction !== null && h.previousConviction !== null && (
                    <span className={`font-mono text-xs ${TREND_COLOR[h.trend]}`}>
                      {h.previousConviction} → {h.currentConviction} · {TREND_LABEL[h.trend]}
                    </span>
                  )}
                </div>

                {h.thesis ? (
                  <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-atlas-text-secondary">
                    {h.thesis.originalThesis}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-atlas-text-tertiary">
                    No thesis established yet — pending the next thesis-review job run.
                  </p>
                )}

                {h.currentConviction !== null && (
                  <div className="mt-4 max-w-xs">
                    <ConfidenceMeter score={h.currentConviction} label="Conviction" />
                  </div>
                )}

                {h.thesis && (h.thesis.risks || h.thesis.catalysts) && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {h.thesis.risks && (
                      <span className="rounded-full border border-risk-high/20 bg-risk-high/5 px-2.5 py-1 text-xs text-risk-high/90">
                        Risk: {truncateWords(h.thesis.risks, 60)}
                      </span>
                    )}
                    {h.thesis.catalysts && (
                      <span className="rounded-full border border-atlas-emerald/20 bg-atlas-emerald/5 px-2.5 py-1 text-xs text-atlas-emerald/90">
                        Catalyst: {truncateWords(h.thesis.catalysts, 60)}
                      </span>
                    )}
                  </div>
                )}

                {h.latestChangeEvent && (
                  <p className="mt-3 text-xs text-atlas-warning/90">
                    Last change ({h.latestChangeEvent.createdAt.toLocaleDateString()}):{' '}
                    {h.latestChangeEvent.changeType.replace(/_/g, ' ').toLowerCase()}
                  </p>
                )}

                {h.latestNews.length > 0 && (
                  <ul className="mt-4 space-y-1 border-t border-atlas-border-subtle pt-3">
                    {h.latestNews.map((n) => (
                      <li key={n.id} className="text-sm text-atlas-text-tertiary">
                        {n.headline} <span className="text-xs">({n.materialityLevel.toLowerCase()})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </FadeInView>
          ))}
        </div>
      </div>
    </div>
  );
}
