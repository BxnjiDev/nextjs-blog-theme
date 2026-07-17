# Robinhood MCP field mapping

**Status: unverified.** No Robinhood Agentic Trading MCP connection was
available in the session that wrote this (Phase 3.7) — the connector is
added to a user's own agent session on their own machine
(`claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading`),
not to this app's runtime, so there was nothing to inspect here. Every row
below is the *assumed* shape Atlas's existing versioned sync schema
(`lib/domain/accountSyncSchema.ts`, unchanged since Phase 3.5) was designed
against — informed by how brokerage account data is conventionally shaped,
not by an actual Robinhood response. Do not treat any "assumed" row as
confirmed.

## How to confirm this for real

Run `npm run robinhood:mcp -- checklist` for the full step-by-step
procedure. Short version: connect the MCP server in your own agent
session, capture each read-only tool's real response, sanitize it
(`npm run robinhood:mcp -- sanitize`), then check it against this mapping
(`npm run robinhood:mcp -- validate-mapping`) and update the table below
with what's actually true.

## Assumed field mapping

| Atlas field (`AccountSyncPayload`) | Assumed Robinhood MCP source | Status |
| --- | --- | --- |
| `accountExternalId` | account/profile id | assumed — unverified |
| `cashBalance` | cash balance / buying power's cash component | assumed — unverified |
| `buyingPower` | buying power (total, including any margin) | assumed — unverified |
| `isEvaluationAccount` | *(no Robinhood equivalent — this is an Atlas-side flag the human sets when syncing, not read from Robinhood)* | n/a, by design |
| `holdings[].symbol` | position ticker symbol | assumed — unverified |
| `holdings[].name` | position/instrument display name | assumed — unverified |
| `holdings[].assetClass` | instrument type (mapped to `EQUITY`/`ETF` — anything else should be rejected, not coerced) | assumed — unverified |
| `holdings[].sector` | instrument sector/industry classification, if Robinhood exposes one at all | assumed — unverified, may not exist |
| `holdings[].quantity` | position share count | assumed — unverified |
| `holdings[].avgCostBasis` | position average cost / average buy price | assumed — unverified |
| `holdings[].marketValue` | position market value (reconciliation-only — never stored as truth, see `lib/domain/accountSync.ts`'s `reconcile()`) | assumed — unverified |
| `holdings[].unrealizedPnl` / `unrealizedPnlPercent` | position unrealized gain/loss | assumed — unverified |
| `holdings[].realizedPnl` | position realized gain/loss (cumulative) | assumed — unverified, may not be exposed per-position |
| `transactions[].externalId` | fill/order id | assumed — unverified |
| `transactions[].symbol` / `side` / `quantity` / `price` | fill details | assumed — unverified |
| `transactions[].executedAt` | fill timestamp | assumed — unverified |
| `openOrders[].externalId` | order id | assumed — unverified |
| `openOrders[].symbol` / `side` / `quantity` / `orderType` / `limitPrice` / `stopPrice` | order details | assumed — unverified |
| `openOrders[].status` | order state, taken as Robinhood's own vocabulary (not normalized into an enum — see the model comment in `schema.prisma`) | assumed — unverified |
| `openOrders[].submittedAt` | order submission timestamp | assumed — unverified |

## Known gaps to check for specifically

- **Realized P&L per position** — Robinhood may only expose this
  account-wide (tax-lot-level realized gains), not per current position.
  If so, `holdings[].realizedPnl` should be sent as `undefined`/omitted for
  positions where it's genuinely unavailable, never `0` (zero is a real,
  different value — "no realized gains" — from "unknown").
- **Sector/industry classification** — brokerages don't always expose
  this on a position object; Atlas already tolerates `sector: null`.
- **Options/crypto/futures positions** — Atlas's schema structurally
  rejects anything but `EQUITY`/`ETF` (see `evaluationConfig.ts`'s
  equities-only rule). If the real account holds anything else, the human
  building the sync payload must exclude it, not attempt to force-fit it.
- **Order status vocabulary** — `openOrders[].status` is stored as
  Robinhood's raw string on purpose (not normalized) since the exact set
  of values is unverified; don't invent a normalized enum for this until
  the real vocabulary is known.

## Unsupported Robinhood fields (fill in once verified)

*(To be filled in once a live capture is available — this is where fields
Robinhood exposes that Atlas doesn't currently use should be listed, so
they're documented as a known gap rather than silently dropped.)*
