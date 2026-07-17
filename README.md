# Atlas — Portfolio Intelligence Engine

Atlas monitors a brokerage portfolio and market/news/fundamentals data, and
builds persistent, evolving investment theses, deterministic conviction/
risk/health scores, a forward earnings calendar, and a continuous-learning
layer that grades its own past recommendations. It is
**recommendation-only**: nothing in this codebase submits a live trade. See
[ARCHITECTURE.md](./ARCHITECTURE.md) for the full design, what's real vs.
mocked, and how brokerage execution (via Robinhood Agentic Trading's MCP
connector) is deliberately kept out of the app's own credentials.

Atlas is not a chatbot — it's built to remember why every investment exists,
track whether the thesis is improving or deteriorating over time, critique
its own past calls with hindsight, and explain every change with evidence
rather than regenerating an opinion from scratch each day.

Atlas can also be pointed at a real, small (max $500) Robinhood account for
recommendation-only live evaluation — see "Live-evaluation account sync"
below. Every trade is placed manually; Atlas never submits an order, and
never stores Robinhood credentials, session tokens, or MCP secrets.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Recharts · PostgreSQL ·
Prisma · Twelve Data (market data) · Finnhub (financial news) · Financial
Modeling Prep (fundamentals, ratios, ownership, earnings calendar) ·
nodemailer + webhooks (alert delivery) · Claude (AI reasoning — model
configurable via `ANTHROPIC_MODEL`, defaults to `claude-opus-4-8`) ·
deterministic scoring engines for conviction, risk, portfolio health, thesis
accuracy, and the recommendation scorecard (plain arithmetic over real
fetched data, never AI-generated numbers)

## Getting started

```bash
cp .env.example .env   # point DATABASE_URL at a local Postgres instance
npm install
npm run db:generate
npm run db:migrate
npm run db:seed          # loads clearly-fake sample data so the UI isn't empty

# Atlas OS is a private, single-user app — set AUTH_SECRET, ATLAS_AUTH_EMAIL,
# ATLAS_AUTH_PASSWORD in .env, then provision the one account:
npm run auth:setup

npm run dev
```

Then open http://localhost:3000 and sign in. Primary navigation:

- `/` — **Home**, the executive-briefing dashboard: greeting, portfolio health, cash, market status, provider status, latest sync, highest-conviction recommendation, recent thesis change, upcoming earnings, today's focus, quick actions
- `/portfolio` — value, day change, vs. S&P 500, allocation donut, holdings table, data-quality badges
- `/intelligence` (+ `/intelligence/[symbol]`) — portfolio intelligence dashboard and per-symbol "Why I Own This": thesis, conviction breakdown/history, recent material news
- `/recommendations` (+ `/recommendations/[id]`) — recommendation cards and history, linking into the full Investment Memo
- `/timeline` — chronological feed of every sync, trade, thesis update, and recommendation
- `/performance` — recommendation outcome tracking (30/90/180/365-day return vs. SPY)
- `/mission` — what Atlas is (and isn't), its operating principles, and the evaluation-account rules
- `/atlas` — **Atlas Chat**, the conversational interface (see "Atlas OS v1" below)
- `/settings` — account, operating mode, links to operational tools

Everything from earlier phases is still reachable from the sidebar's "More"
section: Holdings, Risk, Health, Opportunities, Compare, Simulator,
Scorecard, Daily Briefing, Executions, Connections.

Whenever a synced account is marked as the evaluation account, every page
shows a banner: *"Recommendation-only evaluation mode. Trades are executed
manually by the user."*

## Atlas OS v1

Atlas OS is the application layer on top of Atlas Core (everything described
elsewhere in this README and in ARCHITECTURE.md — the recommendation
engine, thesis engine, learning engine, provider validation, Robinhood sync,
scheduler, trust layer, execution boundary, data-quality gates). Atlas Core
is unchanged by Atlas OS; the frontend orchestrates it, never replaces it.

**Frontend.** Next.js 14 App Router. `app/(app)/layout.tsx` is the shell
(sidebar, evaluation banner, status indicator) wrapping every authenticated
page; `app/layout.tsx` stays thin (fonts, forced dark theme) so `/login` can
render without the shell. Dark-first design system in `tailwind.config.js`'s
`atlas.*` palette. Framer Motion for page transitions, Lucide for icons,
`react-markdown` + `remark-gfm` for chat rendering.

**Authentication.** Hand-rolled, not next-auth or an auth-as-a-service —
this is a single-admin private app, so a stateless signed JWT
(`lib/auth/session.ts`, via `jose`) in an httpOnly/secure/sameSite=lax
cookie is the whole mechanism. `middleware.ts` checks the cookie's
signature+expiry (Edge runtime, no DB call) for every route except
`/login` and the pre-existing `/api/jobs/*`/`/api/sync/*` routes (which
already enforce their own bearer-token auth for external callers).
`lib/auth/currentUser.ts` does the fuller DB-backed check for anything that
needs the actual user record. The one account is provisioned by
`npm run auth:setup` from `ATLAS_AUTH_EMAIL`/`ATLAS_AUTH_PASSWORD`
(bcrypt-hashed before storage, plaintext never persisted).

**Atlas Chat.** `/atlas` (`components/atlas/AtlasChatClient.tsx`) streams
Claude's response over Server-Sent Events from `POST /api/atlas/chat`.
Claude is the reasoning engine; Atlas Core is the intelligence engine —
Claude never answers a portfolio-specific question from its own memory,
only by calling one of ten tools (`lib/atlas/tools.ts`) that each wrap an
existing Atlas Core function (`lib/atlas/toolExecutors.ts`): `get_portfolio`,
`get_briefing`, `get_recommendations`, `get_timeline`, `get_risk`,
`get_thesis`, `get_performance`, `compare`, `simulate`, `recall_memory`.
None of these tools write anything — the tool-calling loop can only ever
read (see `lib/domain/executionBoundary.test.ts`, extended to cover this).

**Conversation flow.** One request round-trips through a loop
(`app/api/atlas/chat/route.ts`): call Claude with the message history and
tool definitions → if it requests a tool, execute it against Atlas Core,
feed the JSON result back → repeat (capped at `ATLAS_CHAT_MAX_TOOL_ROUNDS`,
default 6) → stream text deltas to the browser as they arrive → persist the
full turn (`Conversation`/`ChatMessage` models) including which tools ran
and what they returned, once the turn ends. A failed turn (e.g. no
`ANTHROPIC_API_KEY` configured) still persists an explanatory assistant
message, so the failure survives a reload rather than silently vanishing.
Recommendation-shaped tool results are rendered as `RecommendationCard`s
under the assistant's text (`lib/atlas/extractRecommendationCards.ts`).

**What's new vs. reused.** New: `User`/`Conversation`/`ChatMessage` models
(additive-only — no Atlas Core model touched), the auth layer, the shell,
Home's widgets, the tool-calling layer, Atlas Chat itself. Reused as-is:
every domain function the tools call, `computeRisk`/`computePortfolioHealth`/
`computeSectorWeights` (now also shared by `lib/domain/simulatorMetrics.ts`,
extracted from `components/SimulatorClient.tsx` so the "what if" math has
exactly one implementation instead of two), the evaluation-config rules
shown on `/mission`, `StatCard`/`ActionBadge`/`ConfidenceBadge`/
`FreshnessStrip` (repainted to the new palette, not rebuilt).

## Live-evaluation account sync

Sync a real (small, $500-max) Robinhood account into Atlas for
recommendation-only testing — you place or close every position manually;
Atlas never submits an order. An agent session with the Robinhood Agentic
Trading MCP connector active reads your real account and reports it as one
JSON snapshot (see `lib/domain/accountSyncSchema.ts`):

```bash
# Local — no server needs to be running, writes to Postgres directly:
npm run sync:account -- ./account-snapshot.json

# Or, against a running/deployed Atlas instance:
curl -X POST http://localhost:3000/api/sync/account \
  -H "Authorization: Bearer $SYNC_SECRET" -H "Content-Type: application/json" \
  --data @account-snapshot.json
```

Both validate the payload against a versioned schema (rejecting malformed,
incomplete, duplicated, or stale data with clear errors), sync
idempotently (repeated syncs never duplicate holdings or transactions),
surface reconciliation warnings when Atlas's own numbers disagree with what
was reported, write a permanent audit log (`SyncLog`, visible on
`/connections`), and — on success — trigger the portfolio refresh, risk
assessment, thesis review, recommendation generation, portfolio health, and
daily briefing jobs. See ARCHITECTURE.md's "Live-evaluation account sync"
section for the full contract and the reconciliation rules.

## Background jobs

Eighteen jobs (13 individually-scheduled cron entries, 5 grouped weekly
under `/api/jobs/learning`), each idempotent and exposed as an authenticated
API route (see ARCHITECTURE.md for details), scheduled via `vercel.json`:

| Job | Route | Schedule | Idempotency |
| --- | --- | --- | --- |
| Portfolio refresh | `/api/jobs/refresh` | Every 30 min, weekday market hours | Overwrites latest quote snapshot |
| SEC filings monitor | `/api/jobs/monitor` | Every 2 hours | Unique constraint on filing accession number |
| News monitor | `/api/jobs/news` | Every 2 hours | Unique `dedupeKey` per article |
| Fundamentals ingest | `/api/jobs/fundamentals` | Daily | Statements upserted by fiscal period; valuation/ownership freshness-gated |
| Earnings ingest | `/api/jobs/earnings` | Daily | Upserted by fiscal period; alerts deduped per-event |
| Risk assessment | `/api/jobs/risk` | Daily | Always appends (time series) |
| Thesis review | `/api/jobs/thesis` | Daily | 20h freshness window; change events append-only |
| Recommendation generation | `/api/jobs/recommendations` | Daily | 20h freshness window |
| Portfolio health | `/api/jobs/health` | Daily | Always appends (time series) |
| Opportunity comparisons | `/api/jobs/opportunities` | Daily | 24h freshness window |
| Recommendation outcome tracking | `/api/jobs/outcomes` | Daily | Unique per recommendation; windows fill in only once elapsed |
| Daily briefing | `/api/jobs/briefing` | Daily | Upsert by date |
| Alert delivery | `/api/jobs/notify` | Every 15 min | Unique per (alert, channel); failed deliveries retried in place |
| Recommendation learning, confidence calibration, thesis accuracy, scorecard, pattern detection | `/api/jobs/learning` | Weekly (Sunday) | Each sub-job independently idempotent — see ARCHITECTURE.md |

Set `CRON_SECRET` for these routes to work at all — they return 503 if it's
unset, and 401 if the request's bearer token doesn't match.

## Operations (Phase 3.7)

For the exact step-by-step MacBook workflow — connecting the Robinhood MCP
connector, syncing a real evaluation account, reviewing the first-sync
validation report, running the scheduler, recording manual trades, and
diagnosing failed providers/jobs — see
[docs/OPERATIONS.md](./docs/OPERATIONS.md).

## Environment variables

All integration keys are optional — the app degrades to mock/heuristic
providers when unset, never fabricating data in their place.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (required) |
| `MARKET_DATA_API_KEY` | Twelve Data key — quotes, historical prices, fundamentals |
| `NEWS_API_KEY` | Finnhub key — company news, general market news, sector-proxy coverage. Sentiment and materiality are computed deterministically from the fetched text, never invented |
| `FUNDAMENTALS_API_KEY` | Financial Modeling Prep key — historical financial statements, ratios, ownership, and the forward earnings calendar |
| `ANTHROPIC_API_KEY` | Claude API key — real per-holding thesis/bull/bear/risk narrative generation and retrospective critique |
| `ANTHROPIC_MODEL` | Claude model ID (optional, defaults to `claude-opus-4-8`). Validated at startup against the models the installed `@anthropic-ai/sdk` recognizes — an unsupported value fails immediately with a clear error. See `lib/integrations/anthropicModel.ts` for the current supported list. |
| `SEC_EDGAR_USER_AGENT` | Contact info for SEC's fair-access policy (EDGAR itself needs no key) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `ALERT_EMAIL_TO` | Email alert delivery (any SMTP provider) |
| `ALERT_WEBHOOK_URL` / `ALERT_WEBHOOK_SECRET` | Webhook alert delivery (optional HMAC signing) |
| `CRON_SECRET` | Required for `/api/jobs/*` routes to run |
| `SYNC_SECRET` | Required for `POST /api/sync/account` to run — not needed for the local CLI (`npm run sync:account`), which talks to Postgres directly |
| `SYNC_STALE_MINUTES` | Reject a sync payload whose `asOf` is older than this many minutes (default 60) |
| `EVALUATION_MAX_CAPITAL` | Starting-capital cap for the live-evaluation account, in dollars (default 500) — a sync exceeding it by cost basis gets a warning, not a rejection |
| `AUTH_SECRET` | Required. Long random string signing the Atlas OS session cookie's JWT — generate with `openssl rand -base64 32`. Changing it invalidates every session. |
| `ATLAS_AUTH_EMAIL` / `ATLAS_AUTH_PASSWORD` | The one Atlas OS account's credentials — only read by `npm run auth:setup`, which hashes the password before storing it |
| `ATLAS_CHAT_MAX_TOOL_ROUNDS` | Max Claude↔tool round trips per Atlas Chat turn before it answers with whatever it has (default 6) |

## Project status

Atlas now supports a live-evaluation workflow on top of the persistent
intelligence engine and continuous-learning layer built in Phases 2 and 3: a
real (small, $500-max) Robinhood account can be synced in — validated,
idempotent, reconciled against Atlas's own data, fully audit-logged — and
every recommendation Atlas generates for it includes proposed dollar sizing,
percentage of the experimental portfolio, and an explicit comparison against
holding cash or buying SPY, alongside the existing thesis/risks/expected-
outcome/explainability fields. A visible banner marks every page as
recommendation-only while a synced evaluation account exists. Every score
that drives a decision is still plain code over real fetched data — Claude
is used only for narrative text and grounded retrospective reflection.
Trade execution remains entirely manual: Atlas never submits an order, and
never stores Robinhood credentials, session tokens, or MCP secrets. See
"What's not built yet" in ARCHITECTURE.md for the full list — the 5
permanently-null conviction categories, macro/economic context, additional
notification channels, per-account scoping for the continuous-learning
aggregates (a real gap surfaced by adding a second account in this phase),
and the autonomous-trading mode, which is intentionally not built.

## License

MIT
