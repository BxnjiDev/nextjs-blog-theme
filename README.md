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
npm run db:seed        # loads clearly-fake sample data so the UI isn't empty
npm run dev
```

Then open http://localhost:3000. Pages:

- `/` — portfolio overview (value, day change, vs. S&P 500, allocation donut, holdings table, data-quality badges)
- `/holdings` — per-position thesis, bull/bear case, catalysts, risks, recommended action, expected outcome, full explainability breakdown
- `/intelligence` — portfolio intelligence dashboard: current vs. previous conviction, color-coded trend, latest thesis update, top risks/catalysts, latest material news per holding
- `/intelligence/[symbol]` — "Why I Own This": company overview, original vs. current thesis, growth drivers, competitive advantages, bull/bear case, what would strengthen/weaken the thesis, sell conditions, recent financials, conviction category breakdown + history chart, complete thesis change-event timeline, thesis-accuracy score, recommendation history with performance attribution
- `/opportunities` — candidates not currently held, each with an evidence-based comparison against a current holding (now including real revenue-growth data)
- `/risk` — portfolio risk dashboard (12 components, trend chart, previous-vs-current delta, real earnings-proximity risk)
- `/health` — portfolio health score (9 components, trend chart, top improvements/concerns)
- `/performance` — recommendation outcome tracking (30/90/180/365-day return vs. SPY), graded correct/incorrect, self-critique lessons learned
- `/scorecard` — permanent recommendation scorecard, confidence calibration (Brier score + win rate by confidence band), detected patterns
- `/briefing` — daily briefing (value/performance, largest movers, news, risks, portfolio health, recommended actions, real upcoming earnings)
- `/connections` — live connection-health panel (DB, providers, last job run times for all 18 jobs)

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

## Project status

Atlas now has a continuous-learning layer on top of the persistent
intelligence engine from Phase 2: a fundamentals vendor (Financial Modeling
Prep) populating the conviction categories that were previously blocked
(revenue growth, balance sheet), a real forward earnings calendar feeding
risk/conviction/briefing/alerts, provider-agnostic alert delivery
(email + webhook), and a full self-grading loop — every recommendation is
retrospectively graded against alpha vs. SPY, confidence is calibrated
against actual win rate (with a real Brier score), theses get a
retrospective accuracy score, and a permanent scorecard + statistically-
gated pattern detector measure Atlas's own effectiveness over time. Every
score that drives a decision is still plain code over real fetched data —
Claude is used only for narrative text and grounded retrospective
reflection. See "What's not built yet" in ARCHITECTURE.md for the full
list — the 5 permanently-null conviction categories (moat, AI positioning,
management execution, industry leadership, product innovation, which need a
different kind of data source than fundamentals history), macro/economic
context, additional notification channels, and the autonomous-trading mode,
which is intentionally not built.

## License

MIT
