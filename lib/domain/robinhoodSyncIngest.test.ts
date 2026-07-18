import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { runRobinhoodSyncIngest, ROBINHOOD_INBOX_DIR } from './robinhoodSyncIngest';

const TEST_ACCOUNT_EXTERNAL_ID = 'atlas-test-robinhood-ingest-account';
// Schema-rejected payloads (see accountSync.ts) write a SyncLog row with
// accountId: null — rejected before any account is resolved, so it can't
// be scoped to TEST_ACCOUNT_EXTERNAL_ID like the rest of this file's
// cleanup. Sweep those up by time window instead of leaving them as
// permanent orphans that pollute the global "latest sync" status.
const testFileStartedAt = new Date();

function buildPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: '1.0',
    asOf: new Date().toISOString(),
    accountExternalId: TEST_ACCOUNT_EXTERNAL_ID,
    isEvaluationAccount: true,
    cashBalance: 12.34,
    buyingPower: 12.34,
    holdings: [],
    transactions: [],
    openOrders: [],
    ...overrides,
  };
}

async function clearInbox() {
  for (const dir of [ROBINHOOD_INBOX_DIR, path.join(ROBINHOOD_INBOX_DIR, 'processed'), path.join(ROBINHOOD_INBOX_DIR, 'failed')]) {
    await fs.mkdir(dir, { recursive: true });
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile()) await fs.unlink(path.join(dir, e.name));
    }
  }
}

async function cleanupAccount() {
  await prisma.syncLog.deleteMany({ where: { accountId: null, syncedAt: { gte: testFileStartedAt } } });

  const account = await prisma.account.findUnique({ where: { externalId: TEST_ACCOUNT_EXTERNAL_ID } });
  if (!account) return;
  await prisma.syncLog.deleteMany({ where: { accountId: account.id } });
  await prisma.transaction.deleteMany({ where: { accountId: account.id } });
  await prisma.holding.deleteMany({ where: { accountId: account.id } });
  await prisma.account.delete({ where: { id: account.id } });
}

describe('runRobinhoodSyncIngest', () => {
  beforeEach(async () => {
    await clearInbox();
    await cleanupAccount();
  });

  afterAll(async () => {
    await clearInbox();
    await cleanupAccount();
  });

  it('is a no-op when the inbox is empty', async () => {
    const result = await runRobinhoodSyncIngest();
    expect(result).toEqual({ filesFound: 0, synced: 0, rejected: 0, errors: [], pipelineRan: false });
  });

  it('syncs a valid payload and archives it to processed/', async () => {
    const filePath = path.join(ROBINHOOD_INBOX_DIR, 'test-payload.json');
    await fs.writeFile(filePath, JSON.stringify(buildPayload()));

    const result = await runRobinhoodSyncIngest();
    expect(result.filesFound).toBe(1);
    expect(result.synced).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.pipelineRan).toBe(true);

    await expect(fs.access(filePath)).rejects.toThrow();
    const processed = await fs.readdir(path.join(ROBINHOOD_INBOX_DIR, 'processed'));
    expect(processed).toContain('test-payload.json');

    const account = await prisma.account.findUnique({ where: { externalId: TEST_ACCOUNT_EXTERNAL_ID } });
    expect(account).toBeTruthy();
    expect(Number(account?.cashBalance)).toBe(12.34);
  });

  it('rejects an invalid payload and archives it to failed/ with a recorded error', async () => {
    const filePath = path.join(ROBINHOOD_INBOX_DIR, 'bad-payload.json');
    await fs.writeFile(filePath, JSON.stringify(buildPayload({ cashBalance: -5 }))); // negative cash fails schema validation

    const result = await runRobinhoodSyncIngest();
    expect(result.filesFound).toBe(1);
    expect(result.synced).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.errors[0]).toContain('bad-payload.json');
    expect(result.pipelineRan).toBe(false);

    const failed = await fs.readdir(path.join(ROBINHOOD_INBOX_DIR, 'failed'));
    expect(failed).toContain('bad-payload.json');
  });

  it('does not crash on an unparseable file — records it as rejected', async () => {
    const filePath = path.join(ROBINHOOD_INBOX_DIR, 'corrupt.json');
    await fs.writeFile(filePath, 'not valid json {{{');

    const result = await runRobinhoodSyncIngest();
    expect(result.rejected).toBe(1);
    expect(result.errors[0]).toContain('corrupt.json');
  });
});
