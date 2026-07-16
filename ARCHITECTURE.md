# Atlas Architecture

Atlas is a portfolio intelligence dashboard: it analyzes a brokerage account and
market/news data, and produces recommendations, risk assessments, and daily
briefings. It is **recommendation-only** — nothing in this codebase submits a
live trade.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- PostgreSQL via Prisma (`prisma/schema.prisma`)
- Integration layer behind typed interfaces (`lib/integrations/`)
- Background jobs (`lib/jobs/`) triggered via authenticated API routes + Vercel Cron

## Data flow

```
Robinhood Agentic Trading (MCP)  --agent reports-->  lib/integrations/robinhood.ts  -->  Postgres (Account, Holding, Transaction)
Market data provider (Twelve Data) -->  lib/integrations/marketData.ts             -->  quotes/technicals/fundamentals/history
News provider                     -->  lib/integrations/news.ts                     -->  NewsArticle (mock: empty feed, not fabricated)
SEC EDGAR (public, no key)         -->  lib/integrations/secFilings.ts               -->  recent filings, fetched live
AI reasoning (Claude, claude-opus-4-8) -> lib/integrations/aiReasoning.ts            -->  structured per-holding analysis

lib/jobs/refreshPortfolio.ts        -->  PerformanceSnapshot (one row/day, upserted)
lib/jobs/monitorFilings.ts          -->  Alert (NEW_SEC_FILING, deduped by dedupeKey)
lib/jobs/generateRecommendations.ts -->  Recommendation (per holding, history-linked via previousId)
lib/jobs/generateBriefing.ts        -->  Briefing (one row/day, upserted)

Each job is exposed at /api/jobs/{refresh,monitor,recommendations,briefing},
guarded by a CRON_SECRET bearer check, and scheduled in vercel.json.
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
| Market data (quotes, historical, fundamentals) | **Real** — Twelve Data, one API key (`MARKET_DATA_API_KEY`), `marketData.ts`. Mock (clearly-fake numbers) when the key is unset, and falls back per-call to mock if a configured key errors or rate-limits. Quotes are labeled `delayed`, never `live` — the free tier isn't guaranteed real-time. |
| AI reasoning (thesis/bull/bear/risk) | **Real** — Claude (`claude-opus-4-8`, structured output) when `ANTHROPIC_API_KEY` is set, `aiReasoning.ts`. Falls back to a deterministic, clearly-labeled data summary (no fabricated thesis) when unset or on failure. |
| Financial news | **Mock** — returns an empty feed rather than invented headlines, `news.ts` |
| Robinhood account/holdings | **Mock seed data** until an agent session syncs a real account |

Swap an implementation by editing the single file behind each interface in
`lib/integrations/`; nothing else needs to change because pages and jobs only
depend on the interfaces in `types.ts`.

### Why the Twelve Data provider design looks the way it does

Twelve Data was chosen over Alpha Vantage (free tier now ~25 req/day — too
tight even for a small portfolio) and Financial Modeling Prep (free tier is
now EOD-only with capped fundamentals) because it covers quotes, historical
daily prices, and fundamentals under one key with a workable free tier
(800 req/day, 8/min). `FallbackMarketDataProvider` wraps the real client with
the mock as a per-call safety net — a rate limit or parse error on one call
degrades that call to mock data rather than crashing the page.

## Data quality labeling

`Quote`, `Technicals`, and `CompanyFundamentals` all carry a `quality` field
(`'live' | 'delayed' | 'mock'`) and an `asOf` timestamp. `DataQualityBadge`
(`components/DataQualityBadge.tsx`) renders this consistently across pages
and additionally shows **Stale** when `asOf` is older than 24 hours,
regardless of the underlying quality — so a Twelve Data outage that leaves
old data on screen is visible, not silently presented as current.

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
| Portfolio refresh | `lib/jobs/refreshPortfolio.ts` | Upserts one `PerformanceSnapshot` per UTC calendar day |
| SEC filings monitor | `lib/jobs/monitorFilings.ts` | `Alert.dedupeKey` is unique (`sec:{symbol}:{url}`); re-seeing a filing hits a constraint violation, treated as "already alerted" |
| Recommendation generation | `lib/jobs/generateRecommendations.ts` | Skips a holding whose latest `Recommendation` is younger than 20 hours, unless `force=true` |
| Daily briefing | `lib/jobs/generateBriefing.ts` | Upserts on `Briefing.date` (unique) |

Each job is wrapped by a route under `app/api/jobs/*` that requires
`Authorization: Bearer $CRON_SECRET` (returns 503 if `CRON_SECRET` isn't
configured, 401 if the header doesn't match) — Vercel Cron sends that header
automatically once `CRON_SECRET` is set as a project env var, so no extra
wiring is needed there. Schedule is defined in `vercel.json`:

- `/api/jobs/refresh` — every 30 min, weekday market hours
- `/api/jobs/monitor` — every 2 hours
- `/api/jobs/recommendations` — daily
- `/api/jobs/briefing` — daily, shortly after recommendations

Vercel's Hobby tier only runs cron jobs once a day regardless of a finer
schedule string — sub-daily schedules (refresh, monitor) need a paid plan.

### Why weekly/monthly return isn't backward-reconstructed from prices

The daily briefing's weekly/monthly return (and vs. S&P 500) is computed from
**actual accumulated `PerformanceSnapshot` rows** (`lib/domain/performance.ts`),
not by pulling historical prices and assuming today's share counts were held
constant over the lookback window. That reconstruction would silently ignore
any trades that happened in between and could misstate real performance.
Until enough real snapshots exist (the refresh job writes one per day), the
weekly/monthly metrics honestly report `available: false` with an explanation
instead of a number.

## What's not built yet

- Real financial news vendor integration (interface exists, mock returns an
  empty feed).
- Forward-looking earnings calendar (no data source connected — the daily
  briefing shows the most recent SEC filing per holding as the closest
  available signal instead of guessing).
- Macro/economic context (Fed, CPI, rates, oil, gold, Bitcoin) — no data
  source connected; out of scope for the current pipeline.
- Alert delivery/notification (push, email, Slack) — `Alert` rows are
  created by the SEC monitor job, but nothing pushes them to the user yet.
- Performance-tracking metrics beyond return-vs-SPY (Sharpe, beta, max
  drawdown, CAGR, win/loss ratio).
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
