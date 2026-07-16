# Atlas — Portfolio Intelligence Dashboard

Atlas monitors a brokerage portfolio and market/news data, and surfaces
recommendations, a risk dashboard, and a daily briefing. It is
**recommendation-only**: nothing in this codebase submits a live trade. See
[ARCHITECTURE.md](./ARCHITECTURE.md) for the full design, what's real vs.
mocked, and how brokerage execution (via Robinhood Agentic Trading's MCP
connector) is deliberately kept out of the app's own credentials.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · PostgreSQL · Prisma ·
Twelve Data (market data) · Claude (AI reasoning — model configurable via
`ANTHROPIC_MODEL`, defaults to `claude-opus-4-8`)

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

- `/` — portfolio overview (value, day change, vs. S&P 500, holdings table, data-quality badges)
- `/holdings` — per-position thesis, bull/bear case, catalysts, risks, recommended action
- `/opportunities` — candidates not currently held
- `/risk` — portfolio risk dashboard
- `/briefing` — daily briefing (value/performance, largest movers, news, risks, recommended actions)
- `/connections` — live connection-health panel (DB, providers, last job run times)

## Background jobs

Four jobs, each idempotent and exposed as an authenticated API route (see
ARCHITECTURE.md for details), scheduled via `vercel.json`:

| Job | Route | Schedule |
| --- | --- | --- |
| Portfolio refresh | `/api/jobs/refresh` | Every 30 min, weekday market hours |
| SEC filings monitor | `/api/jobs/monitor` | Every 2 hours |
| Recommendation generation | `/api/jobs/recommendations` | Daily |
| Daily briefing | `/api/jobs/briefing` | Daily, after recommendations |

Set `CRON_SECRET` for these routes to work at all — they return 503 if it's
unset, and 401 if the request's bearer token doesn't match.

## Environment variables

All integration keys are optional — the app degrades to mock/heuristic
providers when unset, never fabricating data in their place.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (required) |
| `MARKET_DATA_API_KEY` | Twelve Data key — quotes, historical prices, fundamentals |
| `ANTHROPIC_API_KEY` | Claude API key — real per-holding thesis/bull/bear/risk analysis |
| `ANTHROPIC_MODEL` | Claude model ID (optional, defaults to `claude-opus-4-8`). Validated at startup against the models the installed `@anthropic-ai/sdk` recognizes — an unsupported value fails immediately with a clear error. See `lib/integrations/anthropicModel.ts` for the current supported list. |
| `NEWS_API_KEY` | Not yet wired to a vendor; reserved |
| `SEC_EDGAR_USER_AGENT` | Contact info for SEC's fair-access policy (EDGAR itself needs no key) |
| `CRON_SECRET` | Required for `/api/jobs/*` routes to run |

## Project status

Data model, integration layer, dashboard UI, and the four background jobs
described above are in place. Real vendors are wired for market data
(Twelve Data), SEC filings (public EDGAR API), and AI reasoning (Claude);
financial news and a forward-looking earnings calendar are not yet
connected. See "What's not built yet" in ARCHITECTURE.md for the full list,
including the autonomous-trading mode, which is intentionally not built.

## License

MIT
