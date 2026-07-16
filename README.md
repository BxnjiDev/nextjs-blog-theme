# Atlas — Portfolio Intelligence Engine

Atlas monitors a brokerage portfolio and market/news data, and builds
persistent, evolving investment theses, deterministic conviction and risk
scores, a portfolio health score, and daily briefings. It is
**recommendation-only**: nothing in this codebase submits a live trade. See
[ARCHITECTURE.md](./ARCHITECTURE.md) for the full design, what's real vs.
mocked, and how brokerage execution (via Robinhood Agentic Trading's MCP
connector) is deliberately kept out of the app's own credentials.

Atlas is not a chatbot — it's built to remember why every investment exists,
track whether the thesis is improving or deteriorating over time, and
explain every change with evidence rather than regenerating an opinion from
scratch each day.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Recharts · PostgreSQL ·
Prisma · Twelve Data (market data) · Finnhub (financial news) · Claude (AI
reasoning — model configurable via `ANTHROPIC_MODEL`, defaults to
`claude-opus-4-8`) · deterministic scoring engines for conviction, risk, and
portfolio health (plain arithmetic over real fetched data, never
AI-generated numbers)

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
- `/holdings` — per-position thesis, bull/bear case, catalysts, risks, recommended action
- `/intelligence` — portfolio intelligence dashboard: current vs. previous conviction, color-coded trend, latest thesis update, top risks/catalysts, latest material news per holding
- `/intelligence/[symbol]` — full thesis detail: company overview, growth drivers, competitive advantages, bull/bear case, conviction category breakdown, conviction history chart, complete thesis change-event timeline
- `/opportunities` — candidates not currently held, each with an evidence-based comparison against a current holding
- `/risk` — portfolio risk dashboard (12 components, trend chart, previous-vs-current delta)
- `/health` — portfolio health score (9 components, trend chart, top improvements/concerns)
- `/performance` — recommendation outcome tracking (30/90/180/365-day return vs. SPY and vs. no-action baseline)
- `/briefing` — daily briefing (value/performance, largest movers, news, risks, portfolio health, recommended actions)
- `/connections` — live connection-health panel (DB, providers, last job run times for all 10 jobs)

## Background jobs

Ten jobs, each idempotent and exposed as an authenticated API route (see
ARCHITECTURE.md for details), scheduled via `vercel.json`:

| Job | Route | Schedule | Idempotency |
| --- | --- | --- | --- |
| Portfolio refresh | `/api/jobs/refresh` | Every 30 min, weekday market hours | Overwrites latest quote snapshot |
| SEC filings monitor | `/api/jobs/monitor` | Every 2 hours | Unique constraint on filing accession number |
| News monitor | `/api/jobs/news` | Every 2 hours | Unique `dedupeKey` per article |
| Risk assessment | `/api/jobs/risk` | Every 4 hours | Always appends (time series) |
| Thesis review | `/api/jobs/thesis` | Daily | 20h freshness window; change events append-only |
| Portfolio health | `/api/jobs/health` | Daily | Always appends (time series) |
| Opportunity comparisons | `/api/jobs/opportunities` | Daily | 24h freshness window |
| Recommendation generation | `/api/jobs/recommendations` | Daily | 20h freshness window |
| Recommendation outcome tracking | `/api/jobs/outcomes` | Daily | Unique per recommendation; windows fill in only once elapsed |
| Daily briefing | `/api/jobs/briefing` | Daily, after recommendations | Upsert by date |

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
| `ANTHROPIC_API_KEY` | Claude API key — real per-holding thesis/bull/bear/risk narrative generation |
| `ANTHROPIC_MODEL` | Claude model ID (optional, defaults to `claude-opus-4-8`). Validated at startup against the models the installed `@anthropic-ai/sdk` recognizes — an unsupported value fails immediately with a clear error. See `lib/integrations/anthropicModel.ts` for the current supported list. |
| `SEC_EDGAR_USER_AGENT` | Contact info for SEC's fair-access policy (EDGAR itself needs no key) |
| `CRON_SECRET` | Required for `/api/jobs/*` routes to run |

## Project status

Atlas now has a persistent intelligence layer on top of the Phase 1
dashboard: a thesis engine that evolves holdings over time instead of
regenerating them daily, a deterministic conviction model, a deterministic
portfolio health score, an evidence-based opportunity comparison engine, and
recommendation-outcome tracking. Real vendors are wired for market data
(Twelve Data), financial news (Finnhub), SEC filings (public EDGAR API), and
AI reasoning (Claude); every score that drives a decision (conviction, risk,
health) is computed by plain code from real fetched data, with Claude used
only for qualitative narrative text. See "What's not built yet" in
ARCHITECTURE.md for the full list — richer fundamentals data (to unblock the
remaining conviction categories and opportunity-comparison metrics), a
forward earnings calendar, alert delivery/notification, and the
autonomous-trading mode, which is intentionally not built.

## License

MIT
