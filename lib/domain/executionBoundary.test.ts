import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Phase 3.7 execution-boundary tests. The premise these assert is
 * structural, not behavioral: Atlas has no brokerage client to call, no
 * order-placement function to invoke, and no dependency capable of either
 * — so the only meaningful way to test "no code path can submit, preview,
 * cancel, or modify a Robinhood order" is to scan the actual source tree
 * for the shape such a capability would necessarily have (a fetch() to
 * Robinhood, an order-verb function, a brokerage SDK dependency) and
 * assert none of it exists. A regression here means someone introduced
 * exactly the kind of capability this phase exists to keep out — see
 * ARCHITECTURE.md's "Execution boundary" section.
 */

const ROOT = path.resolve(__dirname, '../..');
const SCAN_DIRS = ['app', 'lib', 'scripts', 'components'];
const EXCLUDED_DIR_NAMES = new Set(['node_modules', '.next', '.git']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    if (EXCLUDED_DIR_NAMES.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry)) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      files.push(full);
    }
  }
  return files;
}

const sourceFiles = SCAN_DIRS.flatMap((dir) => listSourceFiles(path.join(ROOT, dir)));

function readAll(files: string[]): Array<{ file: string; content: string }> {
  return files.map((file) => ({ file, content: readFileSync(file, 'utf8') }));
}

const files = readAll(sourceFiles);

describe('execution boundary: no brokerage order-placement capability exists', () => {
  it('scanned a non-trivial number of source files (sanity check the scan itself works)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no source file calls out to Robinhood over the network', () => {
    // The only legitimate mentions of "robinhood" in source are prose
    // (comments/strings) about the MCP connector — e.g. the `claude mcp
    // add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading`
    // instruction, or documentation referencing the account-sync workflow.
    // None of those are a fetch()/axios/http call this app itself makes.
    const offenders = files.filter(({ content }) => {
      if (!/robinhood/i.test(content)) return false;
      // Flag only lines that both mention robinhood AND look like an
      // outbound call (fetch/axios/http.request/XMLHttpRequest), so
      // documentation prose doesn't trip this.
      return content
        .split('\n')
        .some((line) => /robinhood/i.test(line) && /\b(fetch|axios|http\.request|https\.request|XMLHttpRequest)\s*\(/.test(line));
    });
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  it('no source file defines or calls an order-placement-shaped function', () => {
    // Invocation/definition shape only (identifier immediately followed by
    // `(`), so prose like "never submits an order" in a comment doesn't
    // match — this only catches an actual placeOrder(...)/submitOrder(...)
    // style call or function declaration.
    const bannedCallPatterns = [
      /\bplaceOrder\s*\(/,
      /\bsubmitOrder\s*\(/,
      /\bpreviewOrder\s*\(/,
      /\bcancelOrder\s*\(/,
      /\bmodifyOrder\s*\(/,
      /\bexecuteOrder\s*\(/,
      /\bplaceTrade\s*\(/,
      /\bsubmitTrade\s*\(/,
    ];
    const offenders = files.filter(({ content }) => bannedCallPatterns.some((re) => re.test(content)));
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  it('no brokerage/trading SDK is installed as a dependency', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const bannedDepSubstrings = ['robinhood', 'ccxt', 'alpaca', 'ib_insync', 'ibkr', 'interactive-brokers', 'td-ameritrade', 'tradier'];
    const offenders = allDeps.filter((dep) => bannedDepSubstrings.some((banned) => dep.toLowerCase().includes(banned)));
    expect(offenders).toEqual([]);
  });

  it('OpenOrder rows are only ever written from the account-sync ingest path, never constructed by Atlas', () => {
    // OpenOrder mirrors what Robinhood reports (read-only from Atlas's
    // side) — if any other file writes to it, that file is synthesizing
    // order state instead of just reflecting it.
    const writers = files.filter(
      ({ file, content }) =>
        /prisma\.openOrder\.(create|upsert|update|createMany|updateMany)\s*\(/.test(content) &&
        !file.endsWith(path.join('lib', 'domain', 'accountSync.ts'))
    );
    expect(writers.map((w) => w.file)).toEqual([]);
  });

  it('no Server Action or API route accepts a payload shaped like an order ticket (side + orderType + limitPrice together)', () => {
    // A loose heuristic, deliberately: this looks for the co-occurrence of
    // order-ticket vocabulary in the same file as a mutation entry point
    // (`'use server'` or a route.ts HTTP handler), which is what an order-
    // submission endpoint would look like if one were ever added.
    const actionFiles = files.filter(
      ({ file, content }) => content.includes("'use server'") || file.endsWith(path.join('route.ts'))
    );
    const looksLikeOrderTicket = actionFiles.filter(
      ({ content }) => /orderType/i.test(content) && /limitPrice/i.test(content) && /\bside\b/i.test(content)
    );
    expect(looksLikeOrderTicket.map((f) => f.file)).toEqual([]);
  });

  it('the Prisma schema has no order-placement-lifecycle model or autonomous trade mode', () => {
    const schema = readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
    expect(schema).not.toMatch(/model\s+TradeProposal\b/);
    expect(schema).not.toMatch(/enum\s+TradeMode\b/);
    expect(schema).not.toMatch(/enum\s+TradeProposalStatus\b/);
    // AUTONOMOUS still exists as an unused TransactionSource enum value
    // (documented, inert — see ARCHITECTURE.md); this only guards against
    // a NEW autonomous-mode concept being reintroduced elsewhere.
    expect(schema).not.toMatch(/enum\s+\w*Mode\b[\s\S]{0,80}AUTONOMOUS/);
  });
});
