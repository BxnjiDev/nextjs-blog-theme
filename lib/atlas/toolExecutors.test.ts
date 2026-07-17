import { describe, it, expect } from 'vitest';
import { executeTool } from './toolExecutors';

describe('executeTool (Atlas Chat tool-calling dispatch)', () => {
  it('returns a graceful error for an unknown tool name rather than throwing', async () => {
    const result = await executeTool('not_a_real_tool', {});
    expect(result.toolName).toBe('not_a_real_tool');
    expect(result.output).toMatchObject({ error: expect.stringContaining('Unknown tool') });
  });

  it('get_portfolio returns a JSON-safe portfolio overview (or a graceful "no account" error)', async () => {
    const result = await executeTool('get_portfolio', {});
    expect(result.toolName).toBe('get_portfolio');
    // Either a real overview (has totalValue) or an explicit no-data error —
    // never throws, never silently returns undefined.
    const output = result.output as Record<string, unknown>;
    expect('totalValue' in output || 'error' in output).toBe(true);
  });

  it('get_recommendations with an unknown id returns an error rather than throwing', async () => {
    const result = await executeTool('get_recommendations', { id: 'not-a-real-id' });
    expect(result.output).toMatchObject({ error: expect.stringContaining('not-a-real-id') });
  });

  it('get_thesis for a symbol with no thesis on record returns a graceful error', async () => {
    const result = await executeTool('get_thesis', { symbol: 'ZZZNOTREAL' });
    expect(result.output).toMatchObject({ error: expect.stringContaining('ZZZNOTREAL') });
  });

  it('compare with an empty symbol list returns an error instead of throwing', async () => {
    const result = await executeTool('compare', { symbols: [] });
    expect(result.output).toMatchObject({ error: expect.any(String) });
  });

  it('recall_memory for a symbol with no holding returns a graceful error', async () => {
    const result = await executeTool('recall_memory', { symbol: 'ZZZNOTREAL' });
    expect(result.output).toMatchObject({ error: expect.stringContaining('ZZZNOTREAL') });
  });

  it('an executor that throws is caught and reported as an error output', async () => {
    // get_thesis with a missing symbol argument exercises the catch path
    // (symbol.toUpperCase() on undefined throws) without needing a mock.
    const result = await executeTool('get_thesis', {});
    expect(result.output).toMatchObject({ error: expect.any(String) });
  });
});
