# Atlas Architecture

Atlas is a persistent portfolio intelligence system: it remembers why every
holding exists, continuously re-evaluates the thesis against fresh evidence,
learns from its own track record, and explains what changed and why over
time — rather than regenerating a fresh take from scratch every day. It is
**recommendation-only** — nothing in this codebase submits a live trade.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind + Recharts
- PostgreSQL via Prisma (`prisma/schema.prisma`)
- Integration layer behind typed interfaces (`lib/integrations/`)
- Deterministic scoring engines (`lib/domain/risk.ts`, `conviction.ts`,
  `portfolioHealth.ts`, `opportunityComparison.ts`) — every score is
  code-computed from real fetched data; Claude is only used to write
  qualitative narrative (thesis text, change explanations, retrospective
  critique), never to invent a number
- Background jobs (`lib/jobs/`) triggered via authenticated API routes + Vercel Cron

## Data flow

```
Robinhood Agentic Trading (MCP)  --agent reads-->  lib/domain/accountSync.ts (via CLI or /api/sync/account)  -->  Postgres (Account, Holding, Transaction, OpenOrder, SyncLog)
Market data provider (Twelve Data) -->  lib/integrations/marketData.ts             -->  quotes/technicals/fundamentals/history
News provider (Finnhub)            -->  lib/integrations/news.ts                     -->  scored NewsArticle -> monitorNews.ts -> NewsItem (stored, deduped)
Fundamentals provider (Financial Modeling Prep) -> lib/integrations/fundamentals.ts --> statements/ratios/ownership/earnings calendar
SEC EDGAR (public, no key)         -->  lib/integrations/secFilings.ts               -->  recent filings, fetched live
AI reasoning (Claude, model via ANTHROPIC_MODEL) -> lib/integrations/aiReasoning.ts  -->  structured per-holding analysis + thesis narrative + retrospective critique

lib/jobs/refreshPortfolio.ts               -->  PerformanceSnapshot (one row/day, upserted)
lib/jobs/monitorFilings.ts                 -->  Alert (NEW_SEC_FILING, deduped)
lib/jobs/monitorNews.ts                    -->  NewsItem (deduped) + Alert (MAJOR_NEGATIVE_NEWS)
lib/jobs/ingestFundamentals.ts             -->  FundamentalSnapshot (upserted per fiscal period) + ValuationSnapshot/OwnershipSnapshot (freshness-gated time series)
lib/jobs/ingestEarnings.ts                 -->  EarningsEvent (upserted per fiscal period, estimate -> actual) + Alert (UPCOMING_EARNINGS, EARNINGS_SURPRISE, GUIDANCE_CHANGE)
lib/jobs/generateRiskAssessment.ts         -->  RiskAssessment (time series) + Alert (CONCENTRATION_RISK, RISK_SCORE_INCREASE, DRAWDOWN_10PCT, STALE_DATA)
lib/jobs/generateThesis.ts                 -->  Thesis (mutable "current state") + ThesisChangeEvent (append-only history) + ConvictionAssessment (time series) + Alert (THESIS_CHANGE)
lib/jobs/generateRecommendations.ts        -->  Recommendation (per holding, history-linked via previousId, with expectedOutcome/expectedTimeHorizon/explainability)
lib/jobs/generatePortfolioHealth.ts        -->  PortfolioHealthAssessment (time series)
lib/jobs/generateOpportunityComparisons.ts -> OpportunityComparison (evidence-based, vs. a current holding)
lib/jobs/trackRecommendationOutcomes.ts    -->  RecommendationOutcome (30/90/180/365-day return + alpha vs. SPY)
lib/jobs/generateBriefing.ts               -->  Briefing (one row/day, upserted; reads all of the above)
lib/jobs/deliverAlerts.ts                  -->  AlertDelivery (per alert per channel, retried in place)
lib/jobs/evaluateRecommendations.ts        -->  RecommendationOutcome retrospective fields (wasCorrect/thesisCorrect/timingCorrect/lessonsLearned) — written once
lib/jobs/computeConfidenceCalibration.ts   -->  ConfidenceCalibration (time series)
lib/jobs/computeThesisAccuracy.ts          -->  ThesisAccuracyScore (time series, per thesis)
lib/jobs/computeScorecard.ts               -->  RecommendationScorecard (time series)
lib/jobs/detectPatterns.ts                 -->  RecommendationPattern (only when sample size clears a minimum)

Each job is exposed at /api/jobs/{refresh,monitor,news,fundamentals,earnings,
risk,thesis,recommendations,health,opportunities,outcomes,briefing,notify,
learning}, guarded by a CRON_SECRET bearer check, and scheduled in vercel.json.
```

### Why Robinhood isn't a REST client here

Robinhood Agentic Trading (beta, 2026) is not a conventional brokerage API you
integrate with stored OAuth credentials. It's an MCP server:

```
claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading
```

An AI agent session connects to that MCP server directly to read the agentic
account and place orders; Robinhood previews every order with the account
owner before it executes. Atlas's Next.js app never holds brokerage
credentials. Its job is to persist what the connected agent reports:
account/holding/transaction/open-order state goes through
`lib/domain/accountSync.ts` (see "Live-evaluation account sync" below), and
`lib/integrations/robinhood.ts` exposes `recordExecution()` (marks a
`TradeProposal` executed once the agent's MCP session confirms a fill).

### What's real vs. mocked right now

| Source | Status |
| --- | --- |
| SEC EDGAR filings | **Real** — public API, no key, `secFilings.ts` |
| Market data (quotes, historical, fundamentals) | **Real** — Twelve Data, one API key (`MARKET_DATA_API_KEY`), `marketData.ts`. Mock (clearly-fake numbers) when the key is unset, and falls back per-call to mock if a configured key errors or rate-limits. Quotes are labeled `delayed`, never `live`. |
| Financial news | **Real** — Finnhub, one API key (`NEWS_API_KEY`), `news.ts` + `newsScoring.ts`. Sentiment and materiality are computed deterministically from the real fetched text. Empty feed (never fabricated) when unset or on failure. |
| Financial statements, ratios, ownership, earnings calendar | **Real** — Financial Modeling Prep, one API key (`FUNDAMENTALS_API_KEY`), `fundamentals.ts`. Mock (clearly-fake, deterministic-per-symbol) history when unset, falling back per-call on error. Could not be live-tested in this sandbox (egress to `financialmodelingprep.com` is blocked here, same as Twelve Data/SEC EDGAR earlier). |
| AI reasoning (thesis narrative, daily recommendation, retrospective critique) | **Real** — Claude (structured output, model via `ANTHROPIC_MODEL`, default `claude-opus-4-8`) when `ANTHROPIC_API_KEY` is set, `aiReasoning.ts`. Falls back to a deterministic, clearly-labeled data summary (no fabricated thesis) when unset or on failure. |
| Conviction / risk / portfolio health / thesis-accuracy / scorecard scores | **Real, deterministic** — plain TypeScript arithmetic over fetched data (`lib/domain/{risk,conviction,portfolioHealth}.ts`, `lib/jobs/{computeThesisAccuracy,computeScorecard,computeConfidenceCalibration,detectPatterns}.ts`). Claude is never asked for these numbers. |
| Alert delivery | **Real** — SMTP (any provider) via `nodemailer`, and a plain HTTP webhook, `lib/integrations/notifications.ts`. No-ops (alerts still generated and stored) when no channel is configured. |
| Robinhood account/holdings | **Mock seed data**, or a **real synced account** once `npm run sync:account` / `POST /api/sync/account` has run — see "Live-evaluation account sync" below. A synced evaluation account always takes over as "the" active account (`getActiveAccountId()`). |

Swap an implementation by editing the single file behind each interface in
`lib/integrations/`; nothing else needs to change because pages and jobs only
depend on the interfaces in `types.ts`.

### Why the Twelve Data provider design looks the way it does

Twelve Data was chosen over Alpha Vantage (free tier now ~25 req/day) and
Financial Modeling Prep (free tier is now EOD-only with capped fundamentals)
because it covers quotes, historical daily prices, and fundamentals under
one key with a workable free tier (800 req/day, 8/min).
`FallbackMarketDataProvider` wraps the real client with the mock as a
per-call safety net.

### Why Finnhub for news

Finnhub was chosen over Marketaux (native per-entity sentiment, but only
~100 req/day free — too tight for per-holding + market + 8 sector-proxy
queries on a recurring schedule) for its much more generous free tier
(60 req/min). Finnhub's free tier has no per-sector "topic" filter, so
sector coverage (AI, semiconductors, defense, aerospace, robotics, data
centers, energy, cybersecurity) is sourced via a representative sector ETF's
own company-news feed (e.g. semiconductor news via SMH) — real news about
real companies in that sector, documented in `lib/integrations/news.ts`
rather than hidden. Sentiment and materiality are computed with a
deterministic keyword lexicon (`newsScoring.ts`) since the free tier doesn't
reliably expose per-article sentiment — transparent and reproducible, not a
fabricated opinion.

### Why Financial Modeling Prep for fundamentals history

Compared against Finnhub Fundamentals, Polygon, Alpha Vantage, and Tiingo:

- **Alpha Vantage** — free tier is ~25 req/day, impractical for a daily job
  covering statements + ratios + estimates across several holdings.
- **Tiingo** — fundamentals is a thin paid add-on (basic statements only),
  no earnings estimates or ownership data.
- **Polygon** — solid reference/aggregate price data, but its financials
  endpoint is XBRL statements only — no analyst estimates, no estimate
  revisions, no ownership data.
- **Finnhub Fundamentals** — already integrated here for news, which is
  appealing for one-vendor simplicity, but its free-tier fundamentals are
  shallow (basic financials only); ratios, growth metrics, and estimate
  revisions are gated behind paid enterprise tiers.
- **Financial Modeling Prep** — one vendor covering income/balance/cash-flow
  statements, a ratios endpoint, a key-metrics endpoint (ROIC, EV multiples),
  analyst estimates + historical earnings with surprises, and share-count/
  institutional-ownership data. Free tier (250 req/day) comfortably covers
  this app's scale (single account, a handful of holdings, daily-cadence
  jobs); paid tiers scale by request volume/history depth rather than
  gating core statement data behind an enterprise contract.

FMP was chosen because it's the only option that avoids standing up a second
vendor to cover statements + ratios + estimates + ownership. Like Twelve
Data and SEC EDGAR before it, live calls could not be tested in this sandbox
(egress to `financialmodelingprep.com` is blocked) — the real client is
built against FMP's documented v3 API shape with the same real/mock/fallback
pattern as every other provider in this app.

## Data quality labeling

`Quote`, `Technicals`, `CompanyFundamentals`, and `NewsArticle` all carry a
`quality` field (`'live' | 'delayed' | 'mock'`) and a timestamp.
`DataQualityBadge` (`components/DataQualityBadge.tsx`) renders this
consistently across pages and additionally shows **Stale** when the
timestamp is older than 24 hours, regardless of the underlying quality.
`FundamentalSnapshot`/`ValuationSnapshot`/`OwnershipSnapshot` carry the same
`quality`/`source` convention.

## The persistent thesis engine

`Thesis` (one row per holding, mutable) is the "current state" — company
overview, original thesis, growth drivers, competitive advantages, risks,
bull/bear case, catalysts, investment horizon, what would strengthen/weaken
the thesis, sell conditions, and conviction score. It is **not regenerated
from scratch** on every job run:

- `ThesisChangeEvent` is an append-only log — every insert, never an update
  or delete. It records what changed, why, confidence before/after,
  evidence, and sources. This is the permanent thesis timeline, shown on
  the "Why I Own This" page (`/intelligence/{symbol}`).
- Whether something "changed" is decided by a combination of an explicit AI
  judgment (`thesisChanged`, `confidenceChanged`, `riskChanged`,
  `valuationChanged`, `returnExpectationChanged` — Claude reviews the
  evidence and answers each independently) and deterministic thresholds on
  the conviction engine's own numbers (≥15-point conviction swing, ≥20-point
  valuation or risk-category swing). See `determineChangeType` in
  `lib/jobs/generateThesis.ts`.
- On a genuine `THESIS_CHANGED` event, the narrative fields (`bullCase`,
  `bearCase`, `whatWouldStrengthen`, etc.) are rewritten and an `Alert` is
  raised. On a quantitative-only move (conviction/valuation/risk crossed a
  threshold but the core reasoning didn't), only
  `convictionScore`/`lastReviewedAt` update and a `ThesisChangeEvent` is
  still logged — but the narrative is left alone. On no meaningful change at
  all, only `lastReviewedAt` moves and **no** change-event row is written.
- "AI memory" (`lib/domain/memory.ts`) assembles past recommendations, past
  conviction scores, past alerts, and the latest confidence-calibration
  summary for a holding and feeds that into every thesis-review and
  recommendation prompt, so Claude compares fresh evidence against prior
  conclusions — and its own historical accuracy — instead of starting cold.

## The conviction engine

`lib/domain/conviction.ts` scores 13 categories (financial strength,
revenue growth, profitability, balance sheet, competitive moat, AI
positioning, management execution, industry leadership, product innovation,
valuation, execution risk, regulatory risk, macro sensitivity). **Every
category is either a real number derived from fetched data, or `null` when
this app has no data source to score it from — never a guessed number.**

With the Financial Modeling Prep fundamentals history now connected
(`lib/jobs/ingestFundamentals.ts` -> `FundamentalSnapshot`), **8 of the 13
categories are real, code-computed scores**: financial strength (ROE,
debt/equity, cash-vs-debt coverage), revenue growth (YoY, most recent
quarter), profitability (net/gross margin), balance sheet (debt/equity +
current ratio), valuation (P/E vs. a fixed band), execution risk (realized
volatility, elevated near an earnings report from the real calendar),
regulatory risk (sector-keyword proxy), and macro sensitivity (beta vs.
SPY). The remaining **5 categories are permanently null by design**:
competitive moat, AI positioning, management execution, industry
leadership, and product innovation have no deterministic formula from any
data source this app connects (no peer universe, no durable-moat metric, no
management-quality data) — Claude may still write a qualitative *narrative*
about them (stored in `Thesis.competitiveAdvantages` etc.), but that
narrative never becomes a numeric conviction input. The overall score is a
weighted average of only the categories that scored, renormalized — see
`methodology` on every `ConvictionAssessment` row for the full breakdown.

## Forward earnings intelligence

`lib/jobs/ingestEarnings.ts` pulls each holding's earnings calendar (via
Financial Modeling Prep) and upserts one `EarningsEvent` row per fiscal
period — the row transitions from an estimate (`isEstimate: true`) to an
actual as the report lands, and `estimateRevisions` appends an entry every
time a re-fetch finds the street estimate has moved, preserving revision
history even though the row itself is mutable (this is the one place in the
schema where "update in place" is correct — an earnings date is one
real-world event, not a time series). This feeds:

- **Risk assessment** — `earningsRisk` now scores real days-to-next-report
  proximity when a calendar entry exists, falling back to the
  days-since-last-filing proxy only when it doesn't (`lib/domain/risk.ts`).
- **Conviction engine** — `executionRisk` gets a documented +10 modifier
  when a report is due within 14 days.
- **Portfolio health** — inherits the effect via the risk-score composition
  already feeding `riskScore`.
- **Daily briefing** — "Upcoming earnings & events" now shows the real next
  report date, days away, and street EPS estimate per holding, instead of
  "most recent SEC filing" as a proxy.
- **Alerts** — `UPCOMING_EARNINGS` (real date, within 7 days),
  `EARNINGS_SURPRISE` (actual EPS vs. estimate crosses ±10%), and
  `GUIDANCE_CHANGE` (a new non-empty guidance note differs from what was on
  record).

## Alert delivery

Alerts are generated exactly as before (`lib/domain/alerts.ts`,
`createAlertIfNew`) — the alert engine has **no awareness** that delivery
exists. A separate sweep (`lib/jobs/deliverAlerts.ts`) finds `Alert` rows
without a delivery record for each enabled `NotificationChannel` and
attempts delivery through `lib/integrations/notifications.ts`'s
`NotificationProvider` interface:

- **Email** — via SMTP (any provider — Gmail, SES, Mailgun, a self-hosted
  relay — since SMTP is a protocol, not a vendor), using `nodemailer`.
- **Webhook** — a plain HTTP POST with a JSON body to any receiver (a user's
  own endpoint, a Slack/Discord incoming-webhook URL, Zapier, etc.),
  optionally HMAC-SHA256-signed if `ALERT_WEBHOOK_SECRET` is set.

`AlertDelivery` is unique per `(alertId, channelId)`, so the job is
idempotent — a new alert gets exactly one delivery attempt row per channel,
and failed deliveries are retried in place (status/attempts updated on the
same row, capped at 5 attempts) rather than duplicated. Adding a new channel
type (Slack, Discord, SMS, mobile push) later means adding one provider
class and one registry entry in `notifications.ts` — nothing else in the
alert pipeline changes.

## Portfolio risk (deterministic)

`lib/domain/risk.ts` computes, all from real fetched data: position
concentration (top-1/3/5 exposure + inter-holding correlation), sector
concentration (Herfindahl index), realized volatility, beta vs. SPY,
max drawdown (from real `PerformanceSnapshot` history, falling back to
position-weighted holding-level drawdown when that history is still short),
liquidity (position size vs. average daily dollar volume), valuation (P/E
band), an earnings-event risk (real forward calendar when available, else
the days-since-last-filing proxy), a sector-keyword regulatory-exposure
proxy, a beta + sector-cyclicality macro proxy, a news/controversy score
(count of critical/high-materiality negative stored news), and a
data-staleness score (mock vs. real quote quality, age). `RiskAssessment`
stores every component score, the raw `inputs` behind each, a plain-English
`explanation` per component, and a `notes` field describing exactly what
rose or fell vs. the previous assessment.

## Portfolio health (deterministic)

`lib/domain/portfolioHealth.ts` blends the risk assessment (inverted),
per-holding conviction scores, real position-weighted revenue growth (from
ingested fundamentals history — falling back to a technical-momentum proxy
only when no fundamentals history exists yet for any holding), cash
allocation vs. a target band, and holding-count/sector-spread breadth into a
0-100 health score with the same component-history + top-improvements /
top-concerns pattern as risk.

## Opportunity comparisons (lightweight, evidence-based)

`lib/domain/opportunityComparison.ts` compares an `Opportunity` against the
most relevant current holding (same sector if determinable, else the
weakest-conviction holding) on **only the metrics this app can compute for
real**: YoY revenue growth (from ingested fundamentals history), P/E,
realized volatility, beta vs. SPY, dividend yield. Competitive position, AI
exposure, capital efficiency, management quality, and forward catalysts have
no deterministic data source connected and are explicitly marked as such
rather than guessed — see the `unavailableNote` on every comparison. The
narrative is template-generated from these same numbers, so it can never
claim something the metrics don't support; there is deliberately no
"trending" signal anywhere in this comparison.

## Performance attribution

`RecommendationOutcome` anchors a price/SPY snapshot at recommendation time
and fills in 30/90/180/365-day return + alpha vs. SPY as those windows
actually elapse (`lib/jobs/trackRecommendationOutcomes.ts`). There is no way
to backfill a 365-day return before 365 days pass, so unelapsed windows
legitimately show `pending`, not an estimate. Because Atlas never executes
trades, a recommendation's "outcome" and "what happens if you take no
action" are the same realized price path — there's no alternate universe to
compare against, so alpha vs. SPY is the primary value-add signal
(`/performance`).

## Continuous learning (Phase 3B)

Every piece below is deterministic arithmetic over already-stored data;
Claude is used only where noted, and only to write a grounded reflection
from facts it's given — never to invent the facts themselves.

### Recommendation learning + decision journal

`lib/jobs/evaluateRecommendations.ts` grades every `RecommendationOutcome`
once its 90-day window has elapsed (a single retrospective pass, not
re-litigated as later windows fill in):

- `wasCorrect` — graded against **alpha vs. SPY**, not raw return (a rising
  market makes every bullish call look "right" by raw return alone). A
  BUY_MORE/HOLD call is correct if `alpha90d > 0`; a REDUCE/SELL call is
  correct if `alpha90d < 0`. WATCH makes no directional call, so it's never
  graded.
- `thesisCorrect` — whether any `THESIS_CHANGED` event since the
  recommendation represented a genuine conviction drop.
- `timingCorrect` — whether the 30-day and 90-day return moved in the same
  direction (no whipsaw against the thesis shortly after).
- `assumptionsValidated`/`assumptionsFailed`/`missingEvidence` — derived
  from the thesis change timeline and the recommendation's own
  `sourcesMeta` (was fundamentals/filings/news actually available at the
  time).
- `lessonsLearned` — Claude writes a 2-4 sentence reflection grounded in
  the deterministic facts above (`aiReasoningProvider.critiqueRecommendation`)
  — it never re-derives `wasCorrect` etc. itself.

The **decision journal** the spec asks for is implemented as
`Recommendation` (immutable — created, never updated) joined with
`RecommendationOutcome` (return/alpha windows filled in exactly once each,
retrospective fields written exactly once) rather than a separate duplicate
table — both halves are already write-once, so a third copy would only add
redundancy, not additional immutability guarantees.

### Confidence calibration

`lib/jobs/computeConfidenceCalibration.ts` buckets graded recommendations by
their stated `confidenceScore` (1-10, treated as 5 decile bands) and
compares against actual win rate in that band, plus a real **Brier score**
(mean squared error between predicted probability and the binary outcome —
0 is perfect, 0.25 is a coin flip). Buckets under 5 samples are labeled
"too small to be statistically meaningful" rather than presented as
significant. The latest calibration summary is fed back into every
recommendation prompt via `lib/domain/memory.ts`, so a stated confidence
level is informed by how that same band has actually performed historically
— closing the loop honestly, rather than via a fabricated auto-adjustment
formula.

### Thesis accuracy

`lib/jobs/computeThesisAccuracy.ts` retrospectively scores each thesis (once
at least 30 days old) on revenue-growth trend, margin trend, an early
valuation call's alignment with subsequent price direction, and
conviction-trend/price-trend alignment (timing). `catalystsAchievedPct` and
`risksRealizedPct` are left permanently null and documented as such — there
is no deterministic way to match free-text catalysts/risks against
real-world events without NLP this app doesn't have.

### Recommendation scorecard

`lib/jobs/computeScorecard.ts` is a permanent, append-only snapshot: total
recommendations by action, win rate, false positives/negatives, average
alpha vs. SPY, and an explicitly-labeled **proxy** for "holding period"
(Atlas has no execution layer, so there's no real holding period — this is
the average gap between successive recommendations for the same symbol).

### Pattern recognition

`lib/jobs/detectPatterns.ts` groups graded outcomes by sector, margin trend,
and ROIC level, and only ever creates a `RecommendationPattern` row when a
group clears a minimum sample size (5). With this app's actual
recommendation history, most or all runs are expected to find nothing yet —
that's the intended, honest behavior, not a bug. `/scorecard` shows the
result either way.

## "Why I Own This" (`/intelligence/{symbol}`)

The per-holding thesis detail page is Atlas's permanent memory for each
investment: company overview, original vs. current thesis, growth drivers,
competitive advantages, bull/bear case, what would strengthen/weaken the
thesis, sell conditions, recent financials (from ingested fundamentals
history), the conviction category breakdown and its trend chart, the
complete append-only thesis-change timeline, the latest thesis-accuracy
score, the latest recommendation's full explainability breakdown, and the
complete recommendation history with performance attribution per row.

## Explainability

Every `Recommendation` carries an `explainability` JSON blob
(`ExplainabilitySchema` in `lib/integrations/aiReasoning.ts`) answering: why
now, why not (a genuine steelman of the opposite call, not a restatement —
in an evaluation-account context this doubles as "the argument for
waiting"), supporting evidence, contradicting evidence (or an explicit
"none found"), key assumptions, what would invalidate the call, and how the
call compares to the two do-nothing alternatives (`vsCashAndSpy`: holding
cash, or buying SPY with the same dollars) — plus a stated
`expectedOutcome`/`expectedTimeHorizon` that the learning engine later
grades against, and deterministic `proposedDollarAmount`/
`percentageOfPortfolio` position sizing (`lib/domain/positionSizing.ts`,
code-computed from stated confidence and the account's actual cash/total
value — never an AI-invented figure). Rendered on `/holdings` and
`/intelligence/{symbol}`. The underlying separation is structural, not just
cosmetic: verified facts (quote/fundamentals/filings/news, tagged with
`quality`), deterministic calculations (conviction/risk/health/position-
sizing scores, tagged in `methodology`), AI interpretation (thesis text,
explainability fields), and unknowns (anything explicitly marked
unavailable) are never merged into one undifferentiated blob anywhere in
this schema.

## Live-evaluation account sync (Phase 3.5)

Atlas can be pointed at a real, small ($500 max) Robinhood account for
recommendation-only testing — the user places or closes every position
manually; Atlas never submits an order. The `EvaluationBanner`
(`components/EvaluationBanner.tsx`, rendered site-wide from `app/layout.tsx`
whenever an `Account.isEvaluationAccount` row exists) makes this visible on
every page.

### How account data reaches Atlas

An agent session with the Robinhood Agentic Trading MCP connector active
(see "Why Robinhood isn't a REST client here", above) reads real account
state directly from Robinhood and reports it to Atlas as one JSON payload —
this app never calls Robinhood itself, and never stores Robinhood
credentials, session tokens, or MCP authorization secrets anywhere. The
payload contract (`lib/domain/accountSyncSchema.ts`, zod, versioned via
`ACCOUNT_SYNC_SCHEMA_VERSION`) covers account balance, cash, buying power,
holdings (quantity, avg cost, market value, realized/unrealized P&L),
transactions, and open orders. Two entry points share one implementation
(`lib/domain/accountSync.ts` — neither has sync logic of its own):

- **CLI** (`npm run sync:account -- <file>` or `--stdin`,
  `scripts/syncAccount.ts`) — talks to Postgres directly via `DATABASE_URL`,
  no running server or secret required. This is the primary path for local
  use.
- **API** (`POST /api/sync/account`) — for a deployed/running Atlas
  instance, guarded by `SYNC_SECRET` (same fail-closed pattern as
  `CRON_SECRET`, a distinct secret since it's a different trust boundary).

### Validation and rejection

`AccountSyncPayloadSchema.safeParse` rejects malformed/incomplete payloads
with a clear per-field error list. Beyond schema shape, `syncAccount()`
rejects (writes nothing but an audit `SyncLog` row) on: an unsupported
`schemaVersion`; a stale `asOf` (older than `SYNC_STALE_MINUTES`, default
60); and internal duplicates (repeated holding symbols, transaction
`externalId`s, or order `externalId`s within one payload). "Equities only"
and "no shorting" are enforced structurally — `assetClass` can only be
`EQUITY`/`ETF` and `quantity`/`price` reject negative numbers, so an
options/crypto/short position simply cannot pass validation. Margin
(`buyingPower` meaningfully exceeding cash) and exceeding the configured
$500 cap by cost basis (`lib/domain/evaluationConfig.ts`) are **warnings**,
not rejections — Atlas can't control the user's brokerage settings, and
refusing to sync over it would make the account impossible to keep current.

### Idempotency

Holdings are upserted by `(accountId, symbol)`; transactions are
create-and-catch-P2002 by unique `externalId` (the actual idempotency
mechanism — a repeated payload increments `recordsSkipped`, never
duplicates); open orders upsert by `(accountId, externalId)`. A symbol
previously known but absent from a new payload is treated as fully closed
(quantity zeroed, never deleted, so thesis/recommendation history for it
survives).

### Reconciliation

Every check compares Robinhood's reported numbers against something Atlas
can independently derive — never against itself:

| Disagreement | Compared against |
| --- | --- |
| Cash | Prior stored cash + the cash flow implied by this payload's transactions since the last sync |
| Quantity | Prior stored quantity + the share-count delta implied by this payload's transactions |
| Cost basis | Prior stored cost basis, when no transaction for that symbol appears in this payload |
| Market value | Atlas's own live quote (`marketDataProvider.getQuote`) × quantity |
| Transaction history | All transactions ever stored for that symbol, reconstructed into a running quantity |

Mismatches beyond a tolerance become warnings on the sync result and in the
`SyncLog` row — visible on `/connections` — never a silent overwrite.

### Post-sync pipeline

A successful sync runs the same six jobs already documented above
(`lib/domain/accountSyncPipeline.ts`): portfolio refresh → risk assessment
→ thesis review → recommendation generation → portfolio health → daily
briefing, in that dependency order (health needs the fresh risk score and
thesis conviction, so it can't run before them; briefing reads everything,
so it runs last). Best-effort — one step failing doesn't stop the others,
and every step's outcome is reported back to the caller.

### Multi-account resolution

Every job in this app was built assuming exactly one `Account` row exists —
true as long as only the seed script ever created one. Syncing a real
account creates a **second** row, which surfaced a real latent bug during
Phase 3.5 testing: jobs that did `prisma.account.findFirst({orderBy:
{createdAt: 'asc'}})` kept resolving to the old seed account instead of the
newly-synced real one. `lib/domain/portfolio.ts`'s `getActiveAccountId()` is
now the single place this resolution happens — an `isEvaluationAccount`
account always wins over anything else — and every job that used to run its
own `findFirst` (refresh via `getPortfolioOverview`, risk, health, thesis,
recommendations, briefing, fundamentals/earnings ingestion, opportunity
comparisons, outcome tracking) now goes through it. The Phase 3B
continuous-learning aggregates (confidence calibration, thesis accuracy,
scorecard, pattern detection) do **not** yet filter by account — they have
no `accountId` column at all — so with more than one account on record
their numbers blend across accounts; this is a known, documented gap, not
silently swept aside (see "What's not built yet").

## The trade approval gate

`TradeProposal` (see `prisma/schema.prisma`) is the only path to order
placement in this design:

- Every proposal starts at `PENDING_APPROVAL` with `mode: MANUAL_APPROVAL`.
- A proposal carries `reasoning`, `confidenceScore`, and `supportingData`
  (JSON) — this is enforced by the schema, not left to convention.
- `mode: AUTONOMOUS` exists as a future, explicitly-opted-in state per
  account. Nothing in this codebase flips that switch or auto-approves a
  proposal — that logic does not exist yet and should be treated as a
  separate, carefully-reviewed feature when it's actually built, given it
  controls real money.
- Execution itself always happens through the agent's Robinhood MCP session,
  never through a code path in this app that calls Robinhood directly.

## Background jobs

| Job | File | Idempotency |
| --- | --- | --- |
| Portfolio refresh | `refreshPortfolio.ts` | Upserts one `PerformanceSnapshot` per UTC calendar day |
| SEC filings monitor | `monitorFilings.ts` | `Alert.dedupeKey` unique (`sec:{symbol}:{url}`) |
| News monitor | `monitorNews.ts` | `NewsItem.dedupeKey` unique (URL, or normalized headline+day) |
| Fundamentals ingest | `ingestFundamentals.ts` | Statements upserted by `(symbol, periodType, fiscalYear, fiscalPeriod)`; valuation/ownership freshness-gated (20h / 7d) |
| Earnings ingest | `ingestEarnings.ts` | `EarningsEvent` upserted by `(symbol, fiscalYear, fiscalPeriod)`; alerts deduped per-event/day |
| Risk assessment | `generateRiskAssessment.ts` | Always appends (time series); alerts deduped per-day via `dedupeKey` |
| Thesis review | `generateThesis.ts` | Skips a holding reviewed within the last 20h unless `force=true`; narrative only rewritten on a genuine change |
| Recommendation generation | `generateRecommendations.ts` | Skips a holding analyzed within the last 20h unless `force=true` |
| Portfolio health | `generatePortfolioHealth.ts` | Always appends (time series) |
| Opportunity comparisons | `generateOpportunityComparisons.ts` | Skips an opportunity compared within the last 24h |
| Recommendation outcomes | `trackRecommendationOutcomes.ts` | One outcome row per recommendation (unique FK); each return window written exactly once |
| Daily briefing | `generateBriefing.ts` | Upserts on `Briefing.date` (unique) |
| Alert delivery | `deliverAlerts.ts` | `AlertDelivery` unique per `(alertId, channelId)`; failed deliveries retried in place, capped at 5 attempts |
| Recommendation learning | `evaluateRecommendations.ts` | Grades once per outcome (`criticalReviewedAt` gate) |
| Confidence calibration | `computeConfidenceCalibration.ts` | Always appends (time series) |
| Thesis accuracy | `computeThesisAccuracy.ts` | Always appends (time series); skips theses under 30 days old |
| Recommendation scorecard | `computeScorecard.ts` | Always appends (time series) |
| Pattern detection | `detectPatterns.ts` | Always appends (time series); only for groups clearing the sample-size minimum |

Each job is wrapped by a route under `app/api/jobs/*` that requires
`Authorization: Bearer $CRON_SECRET` (503 if unset, 401 if it doesn't
match) — Vercel Cron sends that header automatically once `CRON_SECRET` is
a project env var. The five continuous-learning jobs are grouped under one
route (`/api/jobs/learning`) rather than five separate cron entries, since
they're all low-frequency aggregations that only become meaningful once
real time has elapsed; a failure in one sub-job doesn't stop the others.
Schedule (`vercel.json`), roughly in dependency order:

- `/api/jobs/refresh` — every 30 min, weekday market hours
- `/api/jobs/monitor` (SEC filings) — every 2 hours
- `/api/jobs/news` — every 2 hours (offset 15 min from filings)
- `/api/jobs/fundamentals` — daily, 08:00
- `/api/jobs/earnings` — daily, 08:30
- `/api/jobs/risk` — daily, 10:00
- `/api/jobs/thesis` — daily, 10:20 (after risk, before recommendations)
- `/api/jobs/recommendations` — daily, 11:00
- `/api/jobs/health` — daily, 11:20 (after risk + thesis)
- `/api/jobs/opportunities` — daily, 11:30
- `/api/jobs/outcomes` — daily, 11:40
- `/api/jobs/briefing` — daily, 11:50 (last, so it reads everything fresh)
- `/api/jobs/notify` — every 15 min (alert delivery should be timely)
- `/api/jobs/learning` — weekly, Sunday 09:00

Vercel's Hobby tier only runs cron jobs once a day regardless of a finer
schedule string — sub-daily schedules (refresh, monitor, news, notify) need
a paid plan.

### Why weekly/monthly return isn't backward-reconstructed from prices

The daily briefing's weekly/monthly return (and vs. S&P 500) is computed from
**actual accumulated `PerformanceSnapshot` rows** (`lib/domain/performance.ts`),
not by pulling historical prices and assuming today's share counts were held
constant over the lookback window. Until enough real snapshots exist, the
weekly/monthly metrics honestly report `available: false` with an
explanation instead of a number.

## Alerts

Every alert is deduplicated via `Alert.dedupeKey`'s unique constraint
(`lib/domain/alerts.ts` — `createAlertIfNew`), so re-running a job never
re-raises the same condition:

| Condition | Type | Raised in | Threshold |
| --- | --- | --- | --- |
| Top position ≥30% of portfolio | `CONCENTRATION_RISK` | risk job | keyed per-day |
| Portfolio risk score rose ≥15 points | `RISK_SCORE_INCREASE` | risk job | keyed per-day |
| Portfolio drawdown ≥10% | `DRAWDOWN_10PCT` | risk job | keyed per-day |
| Critical/high-materiality negative news on a held symbol | `MAJOR_NEGATIVE_NEWS` | news job | keyed per-article |
| Data-staleness score ≥70 | `STALE_DATA` | risk job | keyed per-day |
| Earnings report within 7 days (real calendar) | `UPCOMING_EARNINGS` | earnings job | keyed per-symbol/report-date |
| Actual EPS vs. estimate surprise ≥10% | `EARNINGS_SURPRISE` | earnings job | keyed per-symbol/fiscal-period |
| New non-empty guidance note differs from prior | `GUIDANCE_CHANGE` | earnings job | keyed per-symbol/fiscal-period/day |
| Genuine thesis change (narrative-level) | `THESIS_CHANGE` | thesis job | keyed per change-event |
| New SEC filing | `NEW_SEC_FILING` | filings job | keyed per-filing |

Routine price movement never raises an alert — there is no "price moved X%"
alert type at all, deliberately.

## What's not built yet

- Macro/economic context (Fed, CPI, rates, oil, gold, Bitcoin) — no data
  source connected; out of scope for the current pipeline.
- The 5 permanently-null conviction categories (competitive moat, AI
  positioning, management execution, industry leadership, product
  innovation) and the opportunity-comparison metrics they'd also unblock
  (competitive position, AI exposure, capital efficiency, management
  quality) — these need a fundamentally different kind of data source (peer
  benchmarking, management-track-record data) than statement/ratio history,
  not just a deeper fundamentals vendor.
- Insider-ownership percentage and dividend history — Financial Modeling
  Prep's lower tiers don't expose a clean endpoint for these; left `null`
  rather than approximated (see `getOwnership` in `lib/integrations/fundamentals.ts`).
- Additional notification channels (Slack, Discord, SMS, mobile push) — the
  registry in `lib/integrations/notifications.ts` supports adding these
  without touching the alert engine, but only EMAIL/WEBHOOK are implemented.
- Per-account scoping for the Phase 3B continuous-learning aggregates
  (`ConfidenceCalibration`, `ThesisAccuracyScore`, `RecommendationScorecard`,
  `RecommendationPattern`) — none of these models have an `accountId`
  column, so with more than one `Account` row on record (e.g. the seed
  account plus a synced evaluation account) their numbers blend across all
  of them. `getActiveAccountId()` scopes every other job correctly; adding
  `accountId` to these four models is the follow-up.
- Automatic order placement of any kind, for the evaluation account or any
  other — `OpenOrder` is a read-only mirror of what Robinhood reports, and
  `TradeProposal.mode` stays `MANUAL_APPROVAL` throughout.
- The autonomous-trading mode itself (see above).

## Local development

```bash
cp .env.example .env   # set DATABASE_URL to a local Postgres instance
npm install
npm run db:generate
npm run db:migrate     # creates tables
npm run db:seed        # loads clearly-fake sample data
npm run dev
```

To exercise a job locally, set `CRON_SECRET` in `.env` and call it directly:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/jobs/refresh
```

To sync a real (or test) account snapshot without running the server at all:

```bash
npm run sync:account -- ./account-snapshot.json
```

See "Live-evaluation account sync" above for the payload shape and the full
workflow this is meant to support.
