# Atlas Operations Guide (Phase 3.7)

The exact, ordered MacBook workflow for running Atlas against your real
(max $500) Robinhood evaluation account. Atlas is recommendation-only at
every step below: it reads account state, analyzes, and proposes — you place,
reduce, and close every position yourself. Nothing in this repo can submit,
preview, cancel, or modify a brokerage order (see `lib/domain/executionBoundary.test.ts`
and ARCHITECTURE.md's "Execution boundary" section).

## 1. Add environment variables

```bash
cp .env.example .env
```

Fill in at minimum `DATABASE_URL`. For live evaluation, also set:
`MARKET_DATA_API_KEY` (Twelve Data), `FUNDAMENTALS_API_KEY` (Financial
Modeling Prep), `NEWS_API_KEY` (Finnhub), `ANTHROPIC_API_KEY` (Claude),
`SEC_EDGAR_USER_AGENT`. Leave `ATLAS_MODE=development` until step 3 below
confirms every required provider is reachable — see ARCHITECTURE.md's
"Operating modes" section for exactly what `live-evaluation` changes.

## 2. Check provider connectivity

```bash
npm run providers:check
```

Reports, per provider (Twelve Data, Finnhub, FMP, SEC EDGAR, Claude,
Robinhood-sync-input, PostgreSQL): configured/not, last auth success or
failure, latency, reliability over the last 20 logged calls, retry policy,
whether a mock fallback is currently active, and whether it's
`safeForRecommendations`. Never prints a full API key. Fix anything reported
`NOT CONFIGURED` or `AUTH FAILED` before switching to live-evaluation mode.

## 3. Connect the Robinhood Agentic Trading MCP connector to Claude Code

This is a Claude Code / agent-session setting, not something inside this
repo — enable the Robinhood Agentic Trading MCP connector for your agent
session the way you would any other MCP connector. Atlas itself never holds
Robinhood credentials, session tokens, or MCP secrets; it only ever receives
a JSON snapshot an agent session reports to it (steps 5-6 below).

## 4. Inspect available Robinhood MCP tools

```bash
npm run robinhood:mcp
```

Prints the 7-step checklist for inspecting the connector's actual
tools/response schemas once connected (this session had no live MCP
connection to verify against, so `docs/ROBINHOOD_MCP_MAPPING.md`'s field
mapping is explicitly marked "assumed — unverified" until you run this).

## 5. Read the evaluation account

In an agent session with the MCP connector active, ask it to read your real
account balances, holdings, transactions, and open orders. Record the exact
tool names and response shapes per the step-4 checklist — this is what
confirms or corrects `docs/ROBINHOOD_MCP_MAPPING.md`.

## 6. Create the versioned sync payload

Map the real MCP response into the schema Atlas expects
(`lib/domain/accountSyncSchema.ts`, versioned via `ACCOUNT_SYNC_SCHEMA_VERSION`).
`fixtures/robinhood-mcp/assumed-account-sync-payload.sample.json` is a
hand-built, clearly-fake example of the exact shape. Validate your payload
against the mapping and sanitize away identifiers before sharing it anywhere:

```bash
npm run robinhood:mcp -- validate-mapping ./my-payload.json
npm run robinhood:mcp -- sanitize ./my-payload.json ./my-payload.sanitized.json
```

## 7. Synchronize Atlas

```bash
npm run sync:account -- ./my-payload.json
```

Talks to Postgres directly (`DATABASE_URL`) — no server needs to be running.
Validates, syncs idempotently (repeated syncs never duplicate holdings or
transactions), reconciles Atlas's own numbers against what was reported, and
— on success — runs the full post-sync pipeline (recommendation-decision
tracking, manual-execution reconciliation, portfolio refresh, risk, thesis,
recommendations, health, briefing) automatically. A malformed, stale, or
duplicated payload is rejected outright (writes nothing but an audit
`SyncLog` row); numeric disagreements become warnings, never a silent
overwrite.

## 8. Review the validation report

```bash
npm run sync:validate
```

Run this once after your **first** real sync (and any time after you want
to re-confirm reconciliation health). Prints a field-by-field Atlas-vs-
Robinhood comparison (cash, quantities, market values, P&L, avg cost basis,
transaction/open-order counts) with exact matches, tolerance-based matches,
mismatches, and unsupported/missing fields, plus an overall verdict:
`READY_FOR_RECOMMENDATION_ONLY_TESTING`, `READY_WITH_WARNINGS`, or
`NOT_READY`. Don't trust Atlas's recommendations against this account until
this says at least `READY_WITH_WARNINGS`.

## 9. Run the intelligence pipeline

Already triggered automatically at the end of step 7. To re-run it manually
at any time (e.g. after fixing a provider issue):

```bash
npm run scheduler -- run-all
```

## 10. Open the daily briefing

```bash
npm run dev
```

Visit `http://localhost:3000/briefing` — portfolio value/performance,
largest movers, material news, risk/health scores, and recommended actions
generated from the latest pipeline run.

## 11. Review an investment memo

From `/recommendations` (or a symbol link in the briefing/holdings pages),
open `/recommendations/[id]` — full bull/bear case, catalysts, risks,
proposed sizing (capped by the $500 evaluation ceiling), the data-quality
gate's PASS/PASS_WITH_WARNINGS/BLOCKED verdict and exactly which checks
produced it, and the confidence-calibration context for this recommendation's
confidence score.

## 12. Record your decision

On `/recommendations` (or the memo page), mark the recommendation accepted,
partially accepted, rejected, or deferred. This only ever writes
`Recommendation.userDecision` — it never triggers, queues, or approves a
trade.

## 13. Record a trade you manually executed

After you place the trade yourself in Robinhood's own app, go to
`/executions` and record: symbol, buy/sell, execution time, quantity, dollar
amount, execution price, fees (optional), a note (optional), and the
related recommendation (optional). This is a historical fact you're
recording, not an order Atlas places.

## 14. Reconcile that trade on the next sync

Nothing extra to do — the next `npm run sync:account` run automatically
attempts to match every still-`PENDING` manually-recorded execution against
the newly-synced Robinhood transactions (within configurable price/quantity/
timing/amount tolerances — see `lib/domain/evaluationConfig.ts`) and records
the result as Matched, Partially matched, Unmatched, or one of the specific
mismatch reasons. Check `/executions` afterward for anything not cleanly
`MATCHED`.

## 15. Start/stop scheduled jobs

For daily use without keeping a browser tab open, install the launchd
templates in `launchd/` (see `launchd/README.md` for the full setup and why
launchd is preferred over cron — it catches up on a run missed while the
Mac was asleep). Once installed:

```bash
npm run scheduler -- status              # every job's enabled state, lock state, last run
npm run scheduler -- run-all             # run everything right now, manually
npm run scheduler -- run <jobName>       # run one job
npm run scheduler -- disable <jobName>   # scheduled runs are skipped (recorded, not silently dropped)
npm run scheduler -- enable <jobName>
```

To stop entirely: `launchctl unload ~/Library/LaunchAgents/com.atlas.*.plist`.

## 16. Diagnose failed providers or jobs

Open `/connections` — the operations dashboard shows: current operating
mode, last Robinhood sync, last complete pipeline run, every scheduled job's
status/last-run/retry-attempts with a rerun button for any of them (every
job is read/analyze/record-only — see the execution-boundary note at the
top of this doc), provider health, mock-fallback state, recent data-quality
blocks, and unmatched manual executions needing attention. For provider-
specific detail (auth errors, latency, retry policy, setup instructions),
run `npm run providers:check` again.
