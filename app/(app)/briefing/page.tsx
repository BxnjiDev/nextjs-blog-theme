import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatCurrency, formatPercent } from '@/lib/format';
import ActionBadge from '@/components/ActionBadge';
import FadeInView from '@/components/motion/FadeInView';
import { normalizeBriefingPortfolioSummary, normalizeBriefingMarketRecap, type ReturnMetricShape } from '@/lib/domain/legacyNormalization';

export const dynamic = 'force-dynamic';

function ReturnRow({ label, metric }: { label: string; metric: ReturnMetricShape }) {
  if (!metric.available) {
    // The unavailable note is a full sentence, not a short value — stacked
    // rather than flexed side-by-side with the label, which collided into
    // unreadable run-on text (e.g. "WeeklyNot enough snapshot history…").
    return (
      <div className="text-sm">
        <span className="text-atlas-text-tertiary">{label}</span>
        <p className="mt-0.5 text-xs text-atlas-text-tertiary">{metric.note ?? 'Not available'}</p>
      </div>
    );
  }
  return (
    <div className="flex justify-between text-sm">
      <span className="text-atlas-text-secondary">{label}</span>
      <span className={`font-mono ${metric.returnPercent! >= 0 ? 'text-risk-low' : 'text-risk-high'}`}>
        {formatPercent(metric.returnPercent!)} (vs SPY {formatPercent(metric.vsSp500Percent!)})
      </span>
    </div>
  );
}

export default async function BriefingPage() {
  const briefing = await prisma.briefing.findFirst({ orderBy: { date: 'desc' } });

  return (
    <div className="space-y-12">
      <FadeInView>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-atlas-text-tertiary">Briefing</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-atlas-text">Daily briefing</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-atlas-text-secondary">
          Generated each morning from the portfolio snapshot, risk/health assessments, conviction trend, and recent
          material news. The fuller &ldquo;Atlas Daily&rdquo; experience on{' '}
          <Link href="/mission" className="text-atlas-accent-bright underline">
            Mission
          </Link>{' '}
          will build on this once reminders and a checklist layer exist — this page is the real content behind it
          today.
        </p>
      </FadeInView>

      {!briefing ? (
        <p className="text-sm text-atlas-text-tertiary">
          No briefing has been generated yet — run the briefing job (
          <code className="rounded bg-atlas-surface-raised px-1">/api/jobs/briefing</code>).
        </p>
      ) : (
        (() => {
          const summary = normalizeBriefingPortfolioSummary(briefing.portfolioSummary);
          const recap = normalizeBriefingMarketRecap(briefing.marketRecap);

          return (
            <>
              <FadeInView delay={0.05}>
                <p className="text-xs text-atlas-text-tertiary">
                  {briefing.date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>

                <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4 border-y border-atlas-border-subtle py-5">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Total value</p>
                    <p className="mt-1 font-mono text-lg text-atlas-text">{summary.totalValue !== null ? formatCurrency(summary.totalValue) : 'n/a'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Day change</p>
                    <p className={`mt-1 font-mono text-lg ${(summary.dayChangePercent ?? 0) >= 0 ? 'text-risk-low' : 'text-risk-high'}`}>
                      {summary.dayChangeValue !== null ? formatCurrency(summary.dayChangeValue) : 'n/a'}
                      {summary.dayChangePercent !== null && <span className="ml-1 text-xs">({formatPercent(summary.dayChangePercent)})</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Largest winner</p>
                    <p className="mt-1 font-mono text-lg text-risk-low">
                      {summary.largestWinner?.symbol ?? 'n/a'}
                      {summary.largestWinner && <span className="ml-1 text-xs">{formatPercent(summary.largestWinner.changePercent)}</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Largest loser</p>
                    <p className="mt-1 font-mono text-lg text-risk-high">
                      {summary.largestLoser?.symbol ?? 'n/a'}
                      {summary.largestLoser && <span className="ml-1 text-xs">{formatPercent(summary.largestLoser.changePercent)}</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Cash available</p>
                    <p className="mt-1 font-mono text-lg text-atlas-text">{summary.cashBalance !== null ? formatCurrency(summary.cashBalance) : 'n/a'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Capital deployed</p>
                    <p className="mt-1 font-mono text-lg text-atlas-text">{summary.capitalDeployed !== null ? formatCurrency(summary.capitalDeployed) : 'n/a'}</p>
                  </div>
                  {summary.changesSinceYesterday && (
                    <>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Since yesterday</p>
                        <p className={`mt-1 font-mono text-lg ${(summary.changesSinceYesterday.totalValueDelta ?? 0) >= 0 ? 'text-risk-low' : 'text-risk-high'}`}>
                          {summary.changesSinceYesterday.totalValueDelta !== null ? formatCurrency(summary.changesSinceYesterday.totalValueDelta) : 'n/a'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-atlas-text-tertiary">Health since yesterday</p>
                        <p className={`mt-1 font-mono text-lg ${(summary.changesSinceYesterday.healthScoreDelta ?? 0) >= 0 ? 'text-risk-low' : 'text-risk-high'}`}>
                          {summary.changesSinceYesterday.healthScoreDelta !== null
                            ? `${summary.changesSinceYesterday.healthScoreDelta >= 0 ? '+' : ''}${summary.changesSinceYesterday.healthScoreDelta}`
                            : 'n/a'}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </FadeInView>

              <FadeInView delay={0.08}>
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Performance vs. SPY</h2>
                <div className="max-w-md space-y-1.5">
                  <ReturnRow label="Daily" metric={summary.performance.daily} />
                  <ReturnRow label="Weekly" metric={summary.performance.weekly} />
                  <ReturnRow label="Monthly" metric={summary.performance.monthly} />
                </div>
              </FadeInView>

              <FadeInView delay={0.1}>
                <div className="grid gap-8 border-t border-atlas-border-subtle pt-8 md:grid-cols-2">
                  <div>
                    <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">
                      Material risks{' '}
                      <Link href="/risk" className="normal-case text-atlas-text-tertiary underline">
                        view detail
                      </Link>
                    </h2>
                    {summary.materialRisks ? (
                      <>
                        <p className="font-mono text-2xl text-atlas-text">{summary.materialRisks.overallScore}/100</p>
                        {summary.materialRisks.notes && <p className="mt-1 text-sm text-atlas-text-secondary">{summary.materialRisks.notes}</p>}
                      </>
                    ) : (
                      <p className="text-sm text-atlas-text-tertiary">No risk assessment on record yet.</p>
                    )}
                  </div>
                  <div>
                    <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">
                      Portfolio health{' '}
                      <Link href="/health" className="normal-case text-atlas-text-tertiary underline">
                        view detail
                      </Link>
                    </h2>
                    {summary.portfolioHealth ? (
                      <>
                        <p className="font-mono text-2xl text-atlas-text">{summary.portfolioHealth.overallScore}/100</p>
                        {summary.portfolioHealth.topConcerns?.[0] && <p className="mt-1 text-sm text-atlas-text-secondary">{summary.portfolioHealth.topConcerns[0]}</p>}
                      </>
                    ) : (
                      <p className="text-sm text-atlas-text-tertiary">No health assessment on record yet.</p>
                    )}
                  </div>
                </div>
              </FadeInView>

              <FadeInView delay={0.12}>
                <div className="border-t border-atlas-border-subtle pt-8">
                  <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Recommended actions</h2>
                  {summary.recommendedActions.length === 0 && <p className="text-sm text-atlas-text-tertiary">No holdings to recommend against yet.</p>}
                  <div className="space-y-2">
                    {summary.recommendedActions.map((r) => (
                      <div key={r.symbol} className="flex items-center justify-between text-sm">
                        <Link href={`/intelligence/${r.symbol}`} className="font-medium text-atlas-text hover:text-atlas-accent-bright">
                          {r.symbol}
                        </Link>
                        {r.action ? <ActionBadge action={r.action} /> : <span className="text-atlas-text-tertiary">No recommendation yet</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </FadeInView>

              <FadeInView delay={0.14}>
                <div className="border-t border-atlas-border-subtle pt-8">
                  <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Portfolio news</h2>
                  {recap.portfolioNews.length === 0 ? (
                    <p className="text-sm text-atlas-text-tertiary">No meaningful news in the last 48 hours.</p>
                  ) : (
                    <ul className="space-y-4">
                      {recap.portfolioNews.map((n, i) => (
                        <li key={i} className="text-sm">
                          <a href={n.url ?? undefined} target="_blank" rel="noreferrer" className="font-medium text-atlas-text hover:text-atlas-accent-bright hover:underline">
                            {n.headline}
                          </a>
                          <p className="mt-0.5 text-xs text-atlas-text-tertiary">
                            {n.source} · {new Date(n.publishedAt).toLocaleDateString()} · {n.materialityLevel.toLowerCase()}
                          </p>
                          <p className="mt-0.5 text-xs text-atlas-text-secondary">{n.whyItMatters}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </FadeInView>

              <FadeInView delay={0.16}>
                <div className="border-t border-atlas-border-subtle pt-8">
                  <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Upcoming earnings &amp; events</h2>
                  {recap.upcomingEvents.length === 0 && <p className="text-sm text-atlas-text-tertiary">No holdings to track events for yet.</p>}
                  <div className="space-y-2 text-sm">
                    {recap.upcomingEvents.map((e) => (
                      <div key={e.symbol} className="flex items-center justify-between">
                        <Link href={`/intelligence/${e.symbol}`} className="font-medium text-atlas-text hover:text-atlas-accent-bright">
                          {e.symbol}
                        </Link>
                        <span className="text-xs text-atlas-text-tertiary">
                          {e.nextEarnings
                            ? `Reports ${e.nextEarnings.fiscalPeriod} FY${e.nextEarnings.fiscalYear} in ${e.nextEarnings.daysAway}d (${new Date(e.nextEarnings.reportDate).toLocaleDateString()})${e.nextEarnings.epsEstimate !== null ? `, EPS est. ${e.nextEarnings.epsEstimate.toFixed(2)}` : ''}`
                            : e.mostRecentFiling
                              ? `No earnings-calendar entry — last filing ${e.mostRecentFiling.formType} on ${new Date(e.mostRecentFiling.filedAt).toLocaleDateString()}`
                              : 'No calendar or filing data available.'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </FadeInView>

              <FadeInView delay={0.18}>
                <div className="grid gap-8 border-t border-atlas-border-subtle pt-8 md:grid-cols-2">
                  <div className="border-l-2 border-atlas-emerald/40 pl-4">
                    <h2 className="mb-2 text-sm font-medium text-atlas-emerald">What Atlas would do today</h2>
                    {summary.whatAtlasWouldDoToday.length === 0 ? (
                      <p className="text-sm text-atlas-text-tertiary">Nothing with enough conviction to act on today.</p>
                    ) : (
                      <ul className="list-inside list-disc space-y-1 text-sm text-atlas-text-secondary">
                        {summary.whatAtlasWouldDoToday.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="border-l-2 border-atlas-border pl-4">
                    <h2 className="mb-2 text-sm font-medium text-atlas-text-secondary">What Atlas would avoid today</h2>
                    {summary.whatAtlasWouldAvoidToday.length === 0 ? (
                      <p className="text-sm text-atlas-text-tertiary">No fresh low-conviction calls today.</p>
                    ) : (
                      <ul className="list-inside list-disc space-y-1 text-sm text-atlas-text-secondary">
                        {summary.whatAtlasWouldAvoidToday.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </FadeInView>

              {summary.biggestOpportunities.length > 0 && (
                <FadeInView delay={0.2}>
                  <div className="border-t border-atlas-border-subtle pt-8">
                    <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">
                      Biggest opportunities{' '}
                      <Link href="/opportunities" className="normal-case text-atlas-text-tertiary underline">
                        view all
                      </Link>
                    </h2>
                    <div className="space-y-2 text-sm">
                      {summary.biggestOpportunities.map((o) => (
                        <div key={o.symbol} className="flex items-center justify-between">
                          <span className="font-medium text-atlas-text">
                            {o.symbol} <span className="font-normal text-atlas-text-tertiary">— {o.name}</span>
                          </span>
                          <span className="text-xs text-atlas-text-tertiary">
                            confidence {o.confidenceScore}/10{o.comparedTo ? ` · vs ${o.comparedTo}: ${o.overallEdge?.toLowerCase().replace(/_/g, ' ')}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </FadeInView>
              )}

              {summary.thesisChangesSinceYesterday.length > 0 && (
                <FadeInView delay={0.22}>
                  <div className="border-t border-atlas-border-subtle pt-8">
                    <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Thesis changes since yesterday</h2>
                    <ul className="space-y-3 text-sm">
                      {summary.thesisChangesSinceYesterday.map((c, i) => (
                        <li key={i}>
                          <Link href={`/intelligence/${c.symbol}`} className="font-medium text-atlas-text hover:text-atlas-accent-bright">
                            {c.symbol}
                          </Link>{' '}
                          <span className="text-xs text-atlas-text-tertiary">({c.changeType.replace(/_/g, ' ').toLowerCase()})</span>
                          {c.whatChanged && <p className="mt-0.5 text-xs text-atlas-text-secondary">{c.whatChanged}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </FadeInView>
              )}

              <FadeInView delay={0.24}>
                <div className="border-t border-atlas-border-subtle pt-8">
                  <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-atlas-text-tertiary">Notes</h2>
                  <ul className="list-inside list-disc space-y-1 text-xs text-atlas-text-tertiary">
                    {recap.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              </FadeInView>
            </>
          );
        })()
      )}
    </div>
  );
}
