# Atlas Architecture

Atlas is a portfolio intelligence dashboard: it analyzes a brokerage account and
market/news data, and produces recommendations, risk assessments, and daily
briefings. It is **recommendation-only** — nothing in this codebase submits a
live trade.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- PostgreSQL via Prisma (`prisma/schema.prisma`)
- Integration layer behind typed interfaces (`lib/integrations/`)

## Data flow

```
Robinhood Agentic Trading (MCP)  --agent reports-->  lib/integrations/robinhood.ts  -->  Postgres (Account, Holding, Transaction)
Market data provider              -->  lib/integrations/marketData.ts               -->  computed on read (lib/domain/portfolio.ts)
News provider                     -->  lib/integrations/news.ts                     -->  NewsItem (not yet persisted by a job)
SEC EDGAR (public, no key)         -->  lib/integrations/secFilings.ts               -->  fetched live, not persisted

AI analysis (thesis/risk/briefing generation) -->  Recommendation / RiskAssessment / Briefing rows
                                                     (no generation job wired up yet — see below)
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
| SEC EDGAR filings | **Real** — public API, no key, implemented in `secFilings.ts` |
| Market data (quotes/technicals) | **Mock** — deterministic placeholder numbers, `marketData.ts` |
| Financial news | **Mock** — returns an empty feed rather than invented headlines, `news.ts` |
| Robinhood account/holdings | **Mock seed data** until an agent session syncs a real account |

None of the mocked providers fabricate market-moving claims — the market data
mock is clearly-fake numbers for UI development, and the news mock returns
nothing rather than invented headlines. Swap an implementation by editing the
single file behind each interface in `lib/integrations/`; nothing else needs
to change because pages only depend on the interfaces in `types.ts`.

## The trade approval gate

`TradeProposal` (see `prisma/schema.prisma`) is the only path to order
placement in this design:

- Every proposal starts at `PENDING_APPROVAL` with `mode: MANUAL_APPROVAL`.
- A proposal carries `reasoning`, `confidenceScore`, and `supportingData`
  (JSON) — this is enforced by the schema, not left to convention.
- `mode: AUTONOMOUS` exists as a future, explicitly-opted-in state per
  account. Nothing in this scaffold flips that switch or auto-approves a
  proposal — that logic does not exist yet and should be treated as a
  separate, carefully-reviewed feature when it's actually built, given it
  controls real money.
- Execution itself always happens through the agent's Robinhood MCP session,
  never through a code path in this app that calls Robinhood directly.

## What's not built yet

This is a scaffold, not a finished product. Explicitly out of scope so far:

- A scheduled job that generates `Recommendation` / `RiskAssessment` /
  `Briefing` rows from live data (the AI-analysis loop described in the
  product spec). Pages render whatever's in the database; nothing computes
  a fresh thesis automatically yet.
- Real market-data and news vendor integrations (interfaces exist, mock
  implementations are placeholders).
- Alerting/notification delivery (the `Alert` model exists; nothing writes
  to it or pushes it to the user yet).
- Performance-tracking metrics beyond a single day-change number (Sharpe,
  beta, max drawdown, CAGR) — `PerformanceSnapshot` is modeled but not
  populated.
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
