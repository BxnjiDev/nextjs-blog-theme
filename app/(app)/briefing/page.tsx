import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatCurrency, formatPercent } from '@/lib/format';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import SectionHeading from '@/components/ui/SectionHeading';
import StatStrip, { Stat } from '@/components/ui/Stat';
import { ACTION_TONE, ACTION_LABEL } from '@/lib/theme/tone';
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
    <div className="space-y-14">
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
        <EmptyState>
          No briefing has been generated yet — run the briefing job (
          <code className="rounded bg-atlas-surface-raised px-1">/api/jobs/briefing</code>).
        </EmptyState>
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

                <div className="mt-4">
                  <StatStrip>
                    <Stat label="Total value" value={summary.totalValue !== null ? formatCurrency(summary.totalValue) : 'n/a'} />
                    <Stat
                      label="Day change"
                      tone={(summary.dayChangePercent ?? 0) >= 0 ? 'positive' : 'negative'}
                      value={
                        <>
                          {summary.dayChangeValue !== null ? formatCurrency(summary.dayChangeValue) : 'n/a'}
                          {summary.dayChangePercent !== null && <span className="ml-1 text-xs">({formatPercent(summary.dayChangePercent)})</span>}
                        </>
                      }
                    />
                    <Stat
                      label="Largest winner"
                      tone="positive"
                      value={
                        <>
                          {summary.largestWinner?.symbol ?? 'n/a'}
                          {summary.largestWinner && <span className="ml-1 text-xs">{formatPercent(summary.largestWinner.changePercent)}</span>}
                        </>
                      }
                    />
                    <Stat
                      label="Largest loser"
                      tone="negative"
                      value={
                        <>
                          {summary.largestLoser?.symbol ?? 'n/a'}
                          {summary.largestLoser && <span className="ml-1 text-xs">{formatPercent(summary.largestLoser.changePercent)}</span>}
                        </>
                      }
                    />
                    <Stat label="Cash available" value={summary.cashBalance !== null ? formatCurrency(summary.cashBalance) : 'n/a'} />
                    <Stat label="Capital deployed" value={summary.capitalDeployed !== null ? formatCurrency(summary.capitalDeployed) : 'n/a'} />
                    {summary.changesSinceYesterday && (
                      <>
                        <Stat
                          label="Since yesterday"
                          tone={(summary.changesSinceYesterday.totalValueDelta ?? 0) >= 0 ? 'positive' : 'negative'}
                          value={
                            summary.changesSinceYesterday.totalValueDelta !== null
                              ? formatCurrency(summary.changesSinceYesterday.totalValueDelta)
                              : 'n/a'
                          }
                        />
                        <Stat
                          label="Health since yesterday"
                          tone={(summary.changesSinceYesterday.healthScoreDelta ?? 0) >= 0 ? 'positive' : 'negative'}
                          value={
                            summary.changesSinceYesterday.healthScoreDelta !== null
                              ? `${summary.changesSinceYesterday.healthScoreDelta >= 0 ? '+' : ''}${summary.changesSinceYesterday.healthScoreDelta}`
                              : 'n/a'
                          }
                        />
                      </>
                    )}
                  </StatStrip>
                </div>
              </FadeInView>

              <FadeInView delay={0.08}>
                <SectionHeading className="mb-3">Performance vs. SPY</SectionHeading>
                <div className="max-w-md space-y-1.5">
                  <ReturnRow label="Daily" metric={summary.performance.daily} />
                  <ReturnRow label="Weekly" metric={summary.performance.weekly} />
                  <ReturnRow label="Monthly" metric={summary.performance.monthly} />
                </div>
              </FadeInView>

              <FadeInView delay={0.1}>
                <div className="grid gap-8 border-t border-atlas-border-subtle pt-8 md:grid-cols-2">
                  <div>
                    <SectionHeading
                      className="mb-2"
                      action={
                        <Link href="/risk" className="text-xs normal-case text-atlas-text-tertiary underline">
                          view detail
                        </Link>
                      }
                    >
                      Material risks
                    </SectionHeading>
                    {summary.materialRisks ? (
                      <>
                        <p className="font-mono text-2xl text-atlas-text">{summary.materialRisks.overallScore}/100</p>
                        {summary.materialRisks.notes && <p className="mt-1 text-sm text-atlas-text-secondary">{summary.materialRisks.notes}</p>}
                      </>
                    ) : (
                      <EmptyState compact>No risk assessment on record yet.</EmptyState>
                    )}
                  </div>
                  <div>
                    <SectionHeading
                      className="mb-2"
                      action={
                        <Link href="/health" className="text-xs normal-case text-atlas-text-tertiary underline">
                          view detail
                        </Link>
                      }
                    >
                      Portfolio health
                    </SectionHeading>
                    {summary.portfolioHealth ? (
                      <>
                        <p className="font-mono text-2xl text-atlas-text">{summary.portfolioHealth.overallScore}/100</p>
                        {summary.portfolioHealth.topConcerns?.[0] && <p className="mt-1 text-sm text-atlas-text-secondary">{summary.portfolioHealth.topConcerns[0]}</p>}
                      </>
                    ) : (
                      <EmptyState compact>No health assessment on record yet.</EmptyState>
                    )}
                  </div>
                </div>
              </FadeInView>

              <FadeInView delay={0.12}>
                <div className="border-t border-atlas-border-subtle pt-8">
                  <SectionHeading className="mb-3">Recommended actions</SectionHeading>
                  {summary.recommendedActions.length === 0 && <EmptyState compact>No holdings to recommend against yet.</EmptyState>}
                  <div className="space-y-2">
                    {summary.recommendedActions.map((r) => (
                      <div key={r.symbol} className="flex items-center justify-between text-sm">
                        <Link href={`/intelligence/${r.symbol}`} className="font-medium text-atlas-text hover:text-atlas-accent-bright">
                          {r.symbol}
                        </Link>
                        {r.action ? (
                          <Badge tone={ACTION_TONE[r.action] ?? 'neutral'}>{ACTION_LABEL[r.action] ?? r.action}</Badge>
                        ) : (
                          <span className="text-atlas-text-tertiary">No recommendation yet</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </FadeInView>

              <FadeInView delay={0.14}>
                <div className="border-t border-atlas-border-subtle pt-8">
                  <SectionHeading className="mb-3">Portfolio news</SectionHeading>
                  {recap.portfolioNews.length === 0 ? (
                    <EmptyState compact>No meaningful news in the last 48 hours.</EmptyState>
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
                  <SectionHeading className="mb-3">Upcoming earnings &amp; events</SectionHeading>
                  {recap.upcomingEvents.length === 0 && <EmptyState compact>No holdings to track events for yet.</EmptyState>}
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
                      <EmptyState compact>Nothing with enough conviction to act on today.</EmptyState>
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
                      <EmptyState compact>No fresh low-conviction calls today.</EmptyState>
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
                    <SectionHeading
                      className="mb-3"
                      action={
                        <Link href="/opportunities" className="text-xs normal-case text-atlas-text-tertiary underline">
                          view all
                        </Link>
                      }
                    >
                      Biggest opportunities
                    </SectionHeading>
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
                    <SectionHeading className="mb-3">Thesis changes since yesterday</SectionHeading>
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
                  <SectionHeading className="mb-2">Notes</SectionHeading>
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
