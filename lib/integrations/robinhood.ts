/**
 * Robinhood Agentic Trading integration notes
 * ============================================
 *
 * This is deliberately NOT a REST client with stored OAuth credentials.
 * Robinhood Agentic Trading (beta, launched 2026) is exposed as an MCP
 * server, not a conventional brokerage API:
 *
 *   claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading
 *
 * That means the AI agent itself (this Claude session, or whichever agent
 * runtime is driving Atlas) connects directly to Robinhood's MCP tools to
 * read the agentic account — Robinhood previews and confirms every order
 * with the account owner directly in that MCP session, entirely outside
 * this app. There is no app-held secret to leak, because the app never
 * holds brokerage credentials at all, and no function in this file (or
 * anywhere else in this codebase) makes an HTTP call to Robinhood, submits
 * an order, previews an order, cancels an order, or modifies an order. See
 * ARCHITECTURE.md's "Execution boundary" section and
 * lib/domain/executionBoundary.test.ts, which asserts exactly that.
 *
 * Given that, this module intentionally has nothing left in it to export.
 * The two things it used to do have both moved to purpose-built, narrower
 * modules:
 *
 * - Account/holding/transaction/open-order sync is
 *   lib/domain/accountSync.ts — a validated, idempotent, reconciled,
 *   audit-logged read of what Robinhood reports, exposed via `npm run
 *   sync:account` (CLI) and `POST /api/sync/account`.
 * - Recording a trade the user already executed themselves is
 *   lib/domain/manualExecution.ts (ManualExecution model) — strictly a
 *   record of what happened, later reconciled against the next real synced
 *   Transaction by lib/domain/executionReconciliation.ts. It never
 *   triggers, previews, or approves anything.
 *
 * An earlier version of this file had a `recordExecution` helper backed by
 * a `TradeProposal` model with a `MANUAL_APPROVAL`/`AUTONOMOUS` mode field
 * and order fields (orderType/limitPrice/stopPrice). Nothing ever created
 * a TradeProposal or read that mode — it was dead code — but Phase 3.7's
 * execution-boundary review removed it anyway: an unused model shaped like
 * an order ticket, with an "AUTONOMOUS" mode sitting right next to it, is
 * exactly the kind of latent risk this phase exists to close off, whether
 * or not anything reachable used it yet.
 */
export {};
