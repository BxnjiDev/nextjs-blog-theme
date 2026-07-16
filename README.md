# Atlas — Portfolio Intelligence Dashboard

Atlas monitors a brokerage portfolio and market/news data, and surfaces
recommendations, a risk dashboard, and a daily briefing. It is
**recommendation-only**: nothing in this codebase submits a live trade. See
[ARCHITECTURE.md](./ARCHITECTURE.md) for the full design, what's real vs.
mocked, and how brokerage execution (via Robinhood Agentic Trading's MCP
connector) is deliberately kept out of the app's own credentials.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · PostgreSQL · Prisma

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

- `/` — portfolio overview (value, day change, vs. S&P 500, holdings table)
- `/holdings` — per-position thesis, bull/bear case, catalysts, risks, recommended action
- `/opportunities` — candidates not currently held
- `/risk` — portfolio risk dashboard
- `/briefing` — daily briefing (empty until a generation job is wired up)
- `/connections` — what's actually connected vs. mocked right now

## Project status

This is an early scaffold: data model, integration-layer interfaces, and
dashboard UI are in place against mock/seed data. The scheduled
recommendation/risk/briefing generation job, real market-data and news
vendor integrations, alerting, and the autonomous-trading mode are not built
yet — see the "What's not built yet" section of ARCHITECTURE.md.

## License

MIT
