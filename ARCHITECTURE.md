# Atlas Architecture

Atlas is a persistent portfolio intelligence system: it remembers why every
holding exists, continuously re-evaluates the thesis against fresh evidence,
and explains what changed and why over time — rather than regenerating a
fresh take from scratch every day. It is **recommendation-only** — nothing
in this codebase submits a live trade.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind + Recharts
- PostgreSQL via Prisma (`prisma/schema.prisma`)
- Integration layer behind typed interfaces (`lib/integrations/`)
- Deterministic scoring engines (`lib/domain/risk.ts`, `conviction.ts`,
  `portfolioHealth.ts`, `opportunityComparison.ts`) — every score is
  code-computed from real fetched data; Claude is only used to write
  qualitative narrative (thesis text, change explanations), never to invent
  a number
- Background jobs (`lib/jobs/`) triggered via authenticated API routes + Vercel Cron

## Data flow

```
Robinhood Agentic Trading (MCP)  --agent reports-->  lib/integrations/robinhood.ts  -->  Postgres (Account, Holding, Transaction)
Market data provider (Twelve Data) -->  lib/integrations/marketData.ts             -->  quotes/technicals/fundamentals/history
News provider (Finnhub)            -->  lib/integrations/news.ts                     -->  scored NewsArticle -> monitorNews.ts -> NewsItem (stored, deduped)
SEC EDGAR (public, no key)         -->  lib/integrations/secFilings.ts               -->  recent filings, fetched live
AI reasoning (Claude, model via ANTHROPIC_MODEL) -> lib/integrations/aiReasoning.ts  -->  structured per-holding analysis + thesis narrative

lib/jobs/refreshPortfolio.ts             -->  PerformanceSnapshot (one row/day, upserted)
lib/jobs/monitorFilings.ts               -->  Alert (NEW_SEC_FILING, deduped)
lib/jobs/monitorNews.ts                  -->  NewsItem (deduped) + Alert (MAJOR_NEGATIVE_NEWS)
lib/jobs/generateRiskAssessment.ts       -->  RiskAssessment (time series) + Alert (CONCENTRATION_RISK, RISK_SCORE_INCREASE, DRAWDOWN_10PCT, STALE_DATA, UPCOMING_EARNINGS)
lib/jobs/generateThesis.ts               -->  Thesis (mutable "current state") + ThesisChangeEvent (append-only history) + ConvictionAssessment (time series) + Alert (THESIS_CHANGE)
lib/jobs/generateRecommendations.ts      -->  Recommendation (per holding, history-linked via previousId)
lib/jobs/generatePortfolioHealth.ts      -->  PortfolioHealthAssessment (time series)
lib/jobs/generateOpportunityComparisons.ts -> OpportunityComparison (evidence-based, vs. a current holding)
lib/jobs/trackRecommendationOutcomes.ts  -->  RecommendationOutcome (30/90/180/365-day return + alpha vs. SPY)
lib/jobs/generateBriefing.ts             -->  Briefing (one row/day, upserted; reads all of the above)

Each job is exposed at /api/jobs/{refresh,monitor,news,risk,thesis,
recommendations,health,opportunities,outcomes,briefing}, guarded by a
CRON_SECRET bearer check, and scheduled in vercel.json.
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
`lib/integrations/robinhood.ts` exposes `syncFromAgent()` (holdings/cash/
buying-power) and `recordExecution()` (marks a `TradeProposal` executed once
the agent's MCP session confirms a fill).

### What's real vs. mocked right now

| Source | Status |
| --- | --- |
| SEC EDGAR filings | **Real** — public API, no key, `secFilings.ts` |
| Market data (quotes, historical, fundamentals) | **Real** — Twelve Data, one API key (`MARKET_DATA_API_KEY`), `marketData.ts`. Mock (clearly-fake numbers) when the key is unset, and falls back per-call to mock if a configured key errors or rate-limits. Quotes are labeled `delayed`, never `live`. |
| Financial news | **Real** — Finnhub, one API key (`NEWS_API_KEY`), `news.ts` + `newsScoring.ts`. Sentiment and materiality are computed deterministically from the real fetched text. Empty feed (never fabricated) when unset or on failure. |
| AI reasoning (thesis narrative, daily recommendation) | **Real** — Claude (structured output, model via `ANTHROPIC_MODEL`, default `claude-opus-4-8`) when `ANTHROPIC_API_KEY` is set, `aiReasoning.ts`. Falls back to a deterministic, clearly-labeled data summary (no fabricated thesis) when unset or on failure. |
| Conviction / risk / portfolio health scores | **Real, deterministic** — plain TypeScript arithmetic over fetched data (`lib/domain/{risk,conviction,portfolioHealth}.ts`). Claude is never asked for these numbers. |
| Robinhood account/holdings | **Mock seed data** until an agent session syncs a real account |

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

## Data quality labeling

`Quote`, `Technicals`, `CompanyFundamentals`, and `NewsArticle` all carry a
`quality` field (`'live' | 'delayed' | 'mock'`) and a timestamp.
`DataQualityBadge` (`components/DataQualityBadge.tsx`) renders this
consistently across pages and additionally shows **Stale** when the
timestamp is older than 24 hours, regardless of the underlying quality.

## The persistent thesis engine

`Thesis` (one row per holding, mutable) is the "current state" — company
overview, original thesis, growth drivers, competitive advantages, risks,
bull/bear case, catalysts, investment horizon, and conviction score. It is
**not regenerated from scratch** on every job run:

- `ThesisChangeEvent` is an append-only log — every insert, never an update
  or delete. It records what changed, why, confidence before/after,
  evidence, and sources. This is the permanent thesis timeline
  (`/intelligence/{symbol}`).
- Whether something "changed" is decided by a combination of an explicit AI
  judgment (`thesisChanged`, `confidenceChanged`, `riskChanged`,
  `valuationChanged`, `returnExpectationChanged` — Claude reviews the
  evidence and answers each independently) and deterministic thresholds on
  the conviction engine's own numbers (≥15-point conviction swing, ≥20-point
  valuation or risk-category swing). See `determineChangeType` in
  `lib/jobs/generateThesis.ts`.
- On a genuine `THESIS_CHANGED` event, the narrative fields (`bullCase`,
  `bearCase`, etc.) are rewritten and an `Alert` is raised. On a
  quantitative-only move (conviction/valuation/risk crossed a threshold but
  the core reasoning didn't), only `convictionScore`/`lastReviewedAt` update
  and a `ThesisChangeEvent` is still logged — but the narrative is left
  alone. On no meaningful change at all, only `lastReviewedAt` moves and
  **no** change-event row is written.
- "AI memory" (`lib/domain/memory.ts`) assembles past recommendations, past
  conviction scores, and past alerts for a holding and feeds that into every
  thesis-review prompt, so Claude compares fresh evidence against prior
  conclusions instead of starting cold.

## The conviction engine

`lib/domain/conviction.ts` scores 13 categories (financial strength,
revenue growth, profitability, balance sheet, competitive moat, AI
positioning, management execution, industry leadership, product innovation,
valuation, execution risk, regulatory risk, macro sensitivity). **Every
category is either a real number derived from fetched data, or `null` when
this app has no data source to score it from — never a guessed number.**

Given the data actually available (Twelve Data fundamentals: market cap,
P/E, EPS, dividend yield — no revenue history, no balance-sheet detail, no
peer universe, no management-quality or moat data source), the honest
result is that **5 of the 13 categories are permanently null** in this
build: revenue growth, balance sheet, competitive moat, AI positioning,
management execution, industry leadership, and product innovation have no
deterministic formula from what's connected. Financial strength and
profitability use crude EPS-based proxies; valuation uses P/E vs. a fixed
band; execution risk uses realized volatility; regulatory risk and macro
sensitivity use sector-keyword and beta proxies. The overall score is a
weighted average of only the categories that scored, renormalized — see
`methodology` on every `ConvictionAssessment` row for the full breakdown of
what was scored, what wasn't, and why. Claude may still write a qualitative
*narrative* about moat/AI positioning/management (stored in
`Thesis.competitiveAdvantages` etc.) — but that narrative never becomes a
numeric conviction input.

## Portfolio risk (deterministic)

`lib/domain/risk.ts` computes, all from real fetched data: position
concentration (top-1/3/5 exposure + inter-holding correlation), sector
concentration (Herfindahl index), realized volatility, beta vs. SPY,
max drawdown (from real `PerformanceSnapshot` history, falling back to
position-weighted holding-level drawdown when that history is still short),
liquidity (position size vs. average daily dollar volume), valuation (P/E
band), an earnings-event proxy (days since last SEC filing vs. a ~90-day
cadence — there's no forward earnings calendar connected), a sector-keyword
regulatory-exposure proxy, a beta + sector-cyclicality macro proxy, a
news/controversy score (count of critical/high-materiality negative stored
news), and a data-staleness score (mock vs. real quote quality, age).
`RiskAssessment` stores every component score, the raw `inputs` behind each,
a plain-English `explanation` per component, and a `notes` field describing
exactly what rose or fell vs. the previous assessment.

## Portfolio health (deterministic)

`lib/domain/portfolioHealth.ts` blends the risk assessment (inverted),
per-holding conviction scores, technical-momentum as a growth proxy, cash
allocation vs. a target band, and holding-count/sector-spread breadth into
a 0-100 health score with the same component-history + top-improvements /
top-concerns pattern as risk.

## Opportunity comparisons (lightweight, evidence-based)

`lib/domain/opportunityComparison.ts` compares an `Opportunity` against the
most relevant current holding (same sector if determinable, else the
weakest-conviction holding) on **only the metrics this app can compute for
real**: P/E, realized volatility, beta vs. SPY, dividend yield. Growth rate,
competitive position, AI exposure, financial quality, capital efficiency,
management quality, and forward catalysts have no deterministic data source
connected and are explicitly marked as such rather than guessed — see the
`unavailableNote` on every comparison. The narrative is template-generated
from these same numbers, so it can never claim something the metrics don't
support; there is deliberately no "trending" signal anywhere in this
comparison.

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
| Risk assessment | `generateRiskAssessment.ts` | Always appends (time series); alerts deduped per-day via `dedupeKey` |
| Thesis review | `generateThesis.ts` | Skips a holding reviewed within the last 20h unless `force=true`; narrative only rewritten on a genuine change |
| Recommendation generation | `generateRecommendations.ts` | Skips a holding analyzed within the last 20h unless `force=true` |
| Portfolio health | `generatePortfolioHealth.ts` | Always appends (time series) |
| Opportunity comparisons | `generateOpportunityComparisons.ts` | Skips an opportunity compared within the last 24h |
| Recommendation outcomes | `trackRecommendationOutcomes.ts` | One outcome row per recommendation (unique FK); each return window written exactly once |
| Daily briefing | `generateBriefing.ts` | Upserts on `Briefing.date` (unique) |

Each job is wrapped by a route under `app/api/jobs/*` that requires
`Authorization: Bearer $CRON_SECRET` (503 if unset, 401 if it doesn't
match) — Vercel Cron sends that header automatically once `CRON_SECRET` is
a project env var. Schedule (`vercel.json`), roughly in dependency order:

- `/api/jobs/refresh` — every 30 min, weekday market hours
- `/api/jobs/monitor` (SEC filings) — every 2 hours
- `/api/jobs/news` — every 2 hours (offset 15 min from filings)
- `/api/jobs/risk` — daily, 10:00
- `/api/jobs/thesis` — daily, 10:20 (after risk, before recommendations)
- `/api/jobs/recommendations` — daily, 11:00
- `/api/jobs/health` — daily, 11:20 (after risk + thesis)
- `/api/jobs/opportunities` — daily, 11:30
- `/api/jobs/outcomes` — daily, 11:40
- `/api/jobs/briefing` — daily, 11:50 (last, so it reads everything fresh)

Vercel's Hobby tier only runs cron jobs once a day regardless of a finer
schedule string — sub-daily schedules (refresh, monitor, news) need a paid
plan.

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
| Major holding (≥15%) ~85+ days past its last filing | `UPCOMING_EARNINGS` | risk job | keyed per-symbol/day |
| Genuine thesis change (narrative-level) | `THESIS_CHANGE` | thesis job | keyed per change-event |
| New SEC filing | `NEW_SEC_FILING` | filings job | keyed per-filing |

Routine price movement never raises an alert — there is no "price moved X%"
alert type at all, deliberately.

## What's not built yet

- Forward-looking earnings calendar (no data source connected — proxied by
  days-since-last-filing).
- Macro/economic context (Fed, CPI, rates, oil, gold, Bitcoin) — no data
  source connected; out of scope for the current pipeline.
- Alert delivery/notification (push, email, Slack) — `Alert` rows are
  created but nothing pushes them to the user yet.
- Richer fundamentals (revenue history, margins, debt/balance-sheet detail,
  peer universe) — this is what's actually blocking 5 of 13 conviction
  categories and most of the opportunity-comparison metrics the product
  spec asks for (growth rate, capital efficiency, management quality).
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
