import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'node:path';
import { AccountSyncPayloadSchema } from './accountSyncSchema';

/**
 * The sample fixture in fixtures/robinhood-mcp/ is hand-built (no live
 * Robinhood MCP connection was available when it was written — see that
 * directory's README) but it should still always validate against Atlas's
 * real versioned sync schema, so it stays a useful smoke-test artifact
 * instead of silently rotting out of sync with schema changes.
 */
describe('Robinhood MCP sample fixture', () => {
  it('validates against the current AccountSyncPayloadSchema', () => {
    const fixturePath = path.resolve(__dirname, '../../fixtures/robinhood-mcp/assumed-account-sync-payload.sample.json');
    const raw = readFileSync(fixturePath, 'utf-8');
    const data = JSON.parse(raw);
    const result = AccountSyncPayloadSchema.safeParse(data);
    expect(result.success, result.success ? '' : JSON.stringify((result as { error?: unknown }).error, null, 2)).toBe(true);
  });

  it('contains no plausible real identifiers (this is a fixture, not a capture)', () => {
    const fixturePath = path.resolve(__dirname, '../../fixtures/robinhood-mcp/assumed-account-sync-payload.sample.json');
    const raw = readFileSync(fixturePath, 'utf-8');
    expect(raw).toMatch(/SAMPLE-/);
    expect(raw).not.toMatch(/@/); // no email-shaped strings
  });
});
