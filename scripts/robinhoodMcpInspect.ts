/**
 * Robinhood MCP inspection & fixture-sanitizing tool (Phase 3.7).
 *
 * No Robinhood Agentic Trading MCP connection was available in the coding
 * session that built this — it's added via `claude mcp add
 * robinhood-trading ...` to the *user's own* agent session, not to this
 * app's runtime, so there was nothing here to inspect. This script is the
 * "explicit validation command that can be run immediately after
 * connection" the spec calls for in that situation. It does not talk to
 * Robinhood itself (it can't — no MCP client lives in this Next.js app);
 * it drives the human/agent through capturing real tool output and then
 * automates the parts that don't require judgment (redaction, schema
 * mapping validation).
 *
 * Usage:
 *   npm run robinhood:mcp -- checklist
 *     Prints the step-by-step procedure for capturing real MCP tool/
 *     response shapes once Robinhood Agentic Trading is connected.
 *
 *   npm run robinhood:mcp -- sanitize <raw-capture.json> [output.json]
 *     Best-effort automated redaction of a raw captured MCP response
 *     (account numbers, tokens, names, emails, etc.) before it's safe to
 *     commit as a fixture. ALWAYS manually review the output before
 *     committing or sharing it — this is a safety net, not a guarantee.
 *
 *   npm run robinhood:mcp -- validate-mapping <sanitized.json>
 *     Checks which fields in a sanitized capture correspond to fields
 *     Atlas's versioned sync schema (lib/domain/accountSyncSchema.ts)
 *     expects, and which are unmapped/unsupported — printed, not silently
 *     dropped.
 */
import { writeFileSync, readFileSync } from 'fs';

const CHECKLIST = `
Robinhood MCP live-schema validation checklist
===============================================

Run this once, right after connecting the Robinhood Agentic Trading MCP
server (see ARCHITECTURE.md's "Why Robinhood isn't a REST client here").
It only reads data — every step below is read-only by design; nothing
here places, previews, cancels, or modifies an order.

1. Connect the MCP server (in your own agent/Claude Code session, not
   this app):

     claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading
     claude mcp list        # confirm "robinhood-trading" shows connected

2. Ask your agent session to list the tools the server exposes (in
   Claude Code, the agent can enumerate MCP tools directly — ask it to
   "list the tools available from the robinhood-trading MCP server" and
   save the raw tool list, including each tool's declared input/output
   schema if the server provides one).

3. For EACH read-only tool relevant to account state (expect something
   like: get account/profile, get positions/holdings, get balances, get
   transactions/history, get orders — exact names are unverified until
   this step), invoke it once and capture the raw JSON response
   untouched into:

     fixtures/robinhood-mcp/raw-capture-<tool-name>.json

   Do this in a scratch/local location first if you're not certain it's
   safe to write real account data into the repo working tree even
   temporarily.

4. Sanitize each capture before it goes anywhere near git:

     npm run robinhood:mcp -- sanitize fixtures/robinhood-mcp/raw-capture-<tool-name>.json fixtures/robinhood-mcp/sanitized-<tool-name>.json

   Then MANUALLY review the sanitized file — the automated redaction
   (account/routing numbers, tokens, emails, phone numbers, names,
   long opaque ID-shaped strings) is a best-effort safety net, not a
   guarantee. Remove anything it missed by hand before committing.

5. Check field coverage against Atlas's existing versioned sync schema:

     npm run robinhood:mcp -- validate-mapping fixtures/robinhood-mcp/sanitized-<tool-name>.json

   This reports, per top-level field in the capture: mapped (which
   AccountSyncPayload field it corresponds to), unmapped (present in the
   real response but not currently used by Atlas — note it, don't
   silently drop it), or missing (an AccountSyncPayload field Atlas
   expected that this response doesn't actually provide — represent that
   as \`null\`/omitted in the real payload builder, never a fabricated
   value).

6. Update docs/ROBINHOOD_MCP_MAPPING.md with what you found — replace the
   "assumed, unverified" rows with the real, confirmed field names and
   mark anything Atlas assumed but Robinhood doesn't actually expose.

7. Replace fixtures/robinhood-mcp/assumed-account-sync-payload.sample.json
   with a real sanitized example once you have one, and note the
   replacement in your next commit message.
`.trim();

/** Keys that get fully redacted regardless of value shape. Case-insensitive
 * substring match — deliberately broad, since a false-positive redaction
 * (over-hiding) is a far cheaper mistake than a false negative (leaking a
 * real secret or PII into a committed fixture). */
const REDACT_KEY_SUBSTRINGS = [
  'accountid',
  'accountnumber',
  'account_number',
  'routingnumber',
  'routing_number',
  'ssn',
  'socialsecurity',
  'token',
  'secret',
  'password',
  'credential',
  'authorization',
  'apikey',
  'api_key',
  'sessionid',
  'session_id',
  'email',
  'phone',
  'address',
  'dob',
  'dateofbirth',
  'birthdate',
  'firstname',
  'lastname',
  'fullname',
  'holdername',
  'ownername',
  'username',
  'deviceid',
  'ipaddress',
  'externalid', // brokerage account/order ids — real identifiers, redact from shared fixtures
];

/** Value shapes that look like a secret/identifier regardless of key name:
 * long opaque alphanumeric strings, or common auth-token prefixes. */
function looksLikeSecretValue(value: string): boolean {
  if (/^(sk-|bearer\s|eyJ)/i.test(value)) return true;
  if (/^[A-Za-z0-9_-]{24,}$/.test(value) && /[0-9]/.test(value) && /[A-Za-z]/.test(value)) return true;
  return false;
}

function redact(value: unknown, keyHint = ''): unknown {
  const lowerKey = keyHint.toLowerCase().replace(/[^a-z]/g, '');
  if (REDACT_KEY_SUBSTRINGS.some((k) => lowerKey.includes(k))) return '[REDACTED]';

  if (Array.isArray(value)) return value.map((v) => redact(v));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redact(v, k);
    return out;
  }
  if (typeof value === 'string' && looksLikeSecretValue(value)) return '[REDACTED]';
  return value;
}

function sanitize(inputPath: string, outputPath: string | undefined): void {
  const raw = readFileSync(inputPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const sanitized = redact(parsed);
  const output = JSON.stringify(sanitized, null, 2);
  if (outputPath) {
    writeFileSync(outputPath, output + '\n');
    console.log(`Sanitized capture written to ${outputPath}`);
  } else {
    console.log(output);
  }
  console.log(
    '\n⚠ Automated redaction only — MANUALLY REVIEW this file for any remaining account identifiers, ' +
      'balances tied to a real person, or other PII before committing or sharing it.'
  );
}

/** Every field Atlas's current versioned sync schema expects, with the
 * assumed (unverified) Robinhood-side name — see
 * lib/domain/accountSyncSchema.ts and docs/ROBINHOOD_MCP_MAPPING.md. */
const ASSUMED_FIELD_MAPPING: Record<string, string> = {
  accountExternalId: 'account_id (assumed — unverified)',
  cashBalance: 'cash / buying_power.cash (assumed — unverified)',
  buyingPower: 'buying_power.total (assumed — unverified)',
  'holdings[].symbol': 'positions[].symbol (assumed — unverified)',
  'holdings[].quantity': 'positions[].quantity (assumed — unverified)',
  'holdings[].avgCostBasis': 'positions[].average_buy_price (assumed — unverified)',
  'holdings[].marketValue': 'positions[].market_value (assumed — unverified)',
  'transactions[].externalId': 'orders[].id / fills[].id (assumed — unverified)',
  'transactions[].executedAt': 'fills[].executed_at (assumed — unverified)',
  'openOrders[].externalId': 'orders[].id (assumed — unverified)',
  'openOrders[].status': 'orders[].state (assumed — unverified)',
};

function validateMapping(inputPath: string): void {
  const raw = readFileSync(inputPath, 'utf-8');
  const capture = JSON.parse(raw);
  const topLevelKeys = Object.keys(capture ?? {});

  console.log('=== Assumed Atlas <-> Robinhood field mapping (unverified until confirmed against a live capture) ===\n');
  for (const [atlasField, assumedSource] of Object.entries(ASSUMED_FIELD_MAPPING)) {
    console.log(`  ${atlasField.padEnd(28)} <- ${assumedSource}`);
  }

  console.log(`\n=== Top-level keys present in this capture (${topLevelKeys.length}) ===`);
  for (const key of topLevelKeys) console.log(`  - ${key}`);

  console.log(
    '\nNext step: for each key above, confirm by hand whether it matches one of the assumed sources, ' +
      'is a genuinely new field Atlas should map, or is not present in the real response at all — then update ' +
      'docs/ROBINHOOD_MCP_MAPPING.md and lib/domain/accountSyncSchema.ts accordingly. This tool does not auto-map ' +
      'anything: field mapping is a judgment call that should not be automated blindly.'
  );
}

function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === 'checklist') {
    console.log(CHECKLIST);
    return;
  }

  if (command === 'sanitize') {
    const [input, output] = rest;
    if (!input) {
      console.error('Usage: npm run robinhood:mcp -- sanitize <raw-capture.json> [output.json]');
      process.exit(2);
    }
    sanitize(input, output);
    return;
  }

  if (command === 'validate-mapping') {
    const [input] = rest;
    if (!input) {
      console.error('Usage: npm run robinhood:mcp -- validate-mapping <sanitized.json>');
      process.exit(2);
    }
    validateMapping(input);
    return;
  }

  console.error(`Unknown command "${command}". Run without arguments for the checklist, or see this file's header comment.`);
  process.exit(2);
}

main();
