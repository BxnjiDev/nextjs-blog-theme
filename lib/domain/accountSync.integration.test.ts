import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { syncAccount, ACCOUNT_SYNC_SCHEMA_VERSION } from './accountSync';
import type { AccountSyncPayload } from './accountSyncSchema';

/**
 * Real integration test against the dev Postgres database (DATABASE_URL) —
 * exercises the actual $transaction/upsert/unique-constraint idempotency
 * path in lib/domain/accountSync.ts rather than mocking Prisma, since that
 * path (P2002 catch → recordsSkipped) is exactly the behavior worth
 * verifying against a real database. Uses a distinctive externalId so it
 * never collides with real data, and cleans up everything it wrote.
 */
const TEST_ACCOUNT_EXTERNAL_ID = 'atlas-test-idempotency-account';

function buildPayload(): AccountSyncPayload {
  const asOf = new Date().toISOString();
  return {
    schemaVersion: ACCOUNT_SYNC_SCHEMA_VERSION as '1.0',
    asOf,
    accountExternalId: TEST_ACCOUNT_EXTERNAL_ID,
    isEvaluationAccount: true,
    cashBalance: 1000,
    buyingPower: 1000,
    holdings: [
      {
        symbol: 'ZZZTEST',
        name: 'Test Idempotency Corp',
        assetClass: 'EQUITY',
        sector: 'Technology',
        quantity: 10,
        avgCostBasis: 50,
      },
    ],
    transactions: [
      {
        externalId: 'atlas-test-txn-1',
        symbol: 'ZZZTEST',
        side: 'BUY',
        quantity: 10,
        price: 50,
        executedAt: new Date(Date.now() - 60_000).toISOString(),
      },
    ],
    openOrders: [],
  };
}

afterAll(async () => {
  const account = await prisma.account.findUnique({ where: { externalId: TEST_ACCOUNT_EXTERNAL_ID } });
  if (!account) return;
  await prisma.syncLog.deleteMany({ where: { accountId: account.id } });
  await prisma.transaction.deleteMany({ where: { accountId: account.id } });
  await prisma.holding.deleteMany({ where: { accountId: account.id } });
  await prisma.account.delete({ where: { id: account.id } });
});

describe('syncAccount idempotency', () => {
  it('creates the account/holding/transaction on the first sync', async () => {
    const result = await syncAccount(buildPayload(), 'test');
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.recordsAdded).toBeGreaterThanOrEqual(3); // account + holding + transaction
    expect(result.recordsSkipped).toBe(0);

    const txnCount = await prisma.transaction.count({ where: { externalId: 'atlas-test-txn-1' } });
    expect(txnCount).toBe(1);

    // Structured reconciliation detail (Phase 3.7) — same underlying
    // comparisons as `warnings`, machine-readable for validateFirstSync.ts.
    expect(result.reconciliationDetails.length).toBeGreaterThan(0);
    const txnDetail = result.reconciliationDetails.find((d) => d.field === 'transactions');
    expect(txnDetail).toBeDefined();
    expect(txnDetail?.status).toBe('MATCH');
  });

  it('re-syncing the identical payload skips the already-recorded transaction instead of erroring or duplicating it', async () => {
    const payload = buildPayload();
    await syncAccount(payload, 'test');
    const result = await syncAccount(payload, 'test');

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.recordsSkipped).toBeGreaterThanOrEqual(1);

    const txnCount = await prisma.transaction.count({ where: { externalId: 'atlas-test-txn-1' } });
    expect(txnCount).toBe(1);
  });

  it('upserts the account and holding rather than duplicating them across syncs', async () => {
    const payload = buildPayload();
    await syncAccount(payload, 'test');
    await syncAccount(payload, 'test');
    await syncAccount(payload, 'test');

    const accountCount = await prisma.account.count({ where: { externalId: TEST_ACCOUNT_EXTERNAL_ID } });
    expect(accountCount).toBe(1);

    const account = await prisma.account.findUniqueOrThrow({ where: { externalId: TEST_ACCOUNT_EXTERNAL_ID } });
    const holdingCount = await prisma.holding.count({ where: { accountId: account.id, symbol: 'ZZZTEST' } });
    expect(holdingCount).toBe(1);
  });
});
