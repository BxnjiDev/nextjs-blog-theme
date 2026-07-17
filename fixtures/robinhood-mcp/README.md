# Robinhood MCP fixtures

`assumed-account-sync-payload.sample.json` in this directory is **not**
captured from a real Robinhood Agentic Trading MCP response — no MCP
connection was available in the session that built Phase 3.7 (it's added
to the user's own agent session on their own machine, not to this app's
runtime; see `ARCHITECTURE.md`'s "Why Robinhood isn't a REST client here").

It's a hand-built example of Atlas's existing versioned sync-payload
contract (`lib/domain/accountSyncSchema.ts`, unchanged from Phase 3.5),
included so there's *something* concrete to look at and to feed through
`npm run robinhood:mcp -- validate-mapping` as a smoke test of the tooling
itself. All values are invented — no real account, balance, or identifier.

**Once a real MCP connection is available**, follow
`npm run robinhood:mcp -- checklist` to capture real tool responses,
sanitize them (`npm run robinhood:mcp -- sanitize`), and replace this file
with an actual sanitized example. Update `docs/ROBINHOOD_MCP_MAPPING.md`
with what's actually confirmed at the same time — don't leave the two out
of sync.
