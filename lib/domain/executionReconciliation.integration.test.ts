import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { reconcileManualExecutions } from './executionReconciliation';

/**
 * Real integration test against the dev Postgres database — exercises the
 * actual read-ManualExecution/read-Transaction/write-matchStatus path
 * rather than mocking Prisma, since that's exactly the behavior worth
 * verifying end to end. Uses a distinctive account so it never collides
 * with real data or other tests, and cleans up everything it wrote.
 * Passes an explicit accountId (rather than relying on
 * getActiveAccountId()'s "most-recently-synced evaluation account"
 * resolution) so this test can't race with other integration tests that
 * also create evaluation accounts.
 */
const TEST_ACCOUNT_EXTERNAL_ID = 'atlas-test-execution-reconciliation-account';

async function setupAccount() {
  return prisma.account.create({
    data: {
      provider: 'robinhood',
      externalId: TEST_ACCOUNT_EXTERNAL_ID,
      cashBalance: 1000,
      buyingPower: 1000,
      isEvaluationAccount: true,
    },
  });
}

afterAll(async () => {
  const account = await prisma.account.findUnique({ where: { externalId: TEST_ACCOUNT_EXTERNAL_ID } });
  if (!account) return;
  await prisma.manualExecution.deleteMany({ where: { accountId: account.id } });
  await prisma.transaction.deleteMany({ where: { accountId: account.id } });
  await prisma.account.delete({ where: { id: account.id } });
});

describe('reconcileManualExecutions (integration)', () => {
  it('matches a manual execution against a real synced transaction', async () => {
    const account = await setupAccount();
    const executedAt = new Date('2026-07-01T15:30:00Z');

    await prisma.transaction.create({
      data: {
        accountId: account.id,
        symbol: 'ZZZRECON',
        side: 'BUY',
        quantity: 5,
        price: 200,
        source: 'MANUAL',
        externalId: 'atlas-test-recon-txn-1',
        executedAt,
      },
    });

    const manual = await prisma.manualExecution.create({
      data: {
        accountId: account.id,
        symbol: 'ZZZRECON',
        side: 'BUY',
        executedAt,
        quantity: 5,
        dollarAmount: 1000,
        executionPrice: 200,
        fees: 0,
      },
    });

    const result = await reconcileManualExecutions(account.id);
    expect(result.checked).toBe(1);
    expect(result.matched).toBe(1);

    const updated = await prisma.manualExecution.findUniqueOrThrow({ where: { id: manual.id } });
    expect(updated.matchStatus).toBe('MATCHED');
    expect(updated.matchedTransactionId).not.toBeNull();
    expect(updated.reconciledAt).not.toBeNull();
  });

  it('marks a manual execution UNMATCHED when no corresponding transaction has synced yet', async () => {
    const account = await prisma.account.findUniqueOrThrow({ where: { externalId: TEST_ACCOUNT_EXTERNAL_ID } });

    const manual = await prisma.manualExecution.create({
      data: {
        accountId: account.id,
        symbol: 'ZZZNOSYNC',
        side: 'BUY',
        executedAt: new Date(),
        quantity: 3,
        dollarAmount: 300,
        executionPrice: 100,
        fees: 0,
      },
    });

    const result = await reconcileManualExecutions(account.id);
    expect(result.unmatched).toBeGreaterThanOrEqual(1);

    const updated = await prisma.manualExecution.findUniqueOrThrow({ where: { id: manual.id } });
    expect(updated.matchStatus).toBe('UNMATCHED');
    expect(updated.matchedTransactionId).toBeNull();
  });

  it('never matches the same transaction to two different manual executions', async () => {
    const account = await prisma.account.findUniqueOrThrow({ where: { externalId: TEST_ACCOUNT_EXTERNAL_ID } });
    const executedAt = new Date('2026-07-02T10:00:00Z');

    await prisma.transaction.create({
      data: {
        accountId: account.id,
        symbol: 'ZZZSHARED',
        side: 'BUY',
        quantity: 2,
        price: 50,
        source: 'MANUAL',
        externalId: 'atlas-test-recon-txn-shared',
        executedAt,
      },
    });

    const first = await prisma.manualExecution.create({
      data: { accountId: account.id, symbol: 'ZZZSHARED', side: 'BUY', executedAt, quantity: 2, dollarAmount: 100, executionPrice: 50, fees: 0 },
    });
    await reconcileManualExecutions(account.id);
    const firstUpdated = await prisma.manualExecution.findUniqueOrThrow({ where: { id: first.id } });
    expect(firstUpdated.matchStatus).toBe('MATCHED');

    const second = await prisma.manualExecution.create({
      data: { accountId: account.id, symbol: 'ZZZSHARED', side: 'BUY', executedAt, quantity: 2, dollarAmount: 100, executionPrice: 50, fees: 0 },
    });
    const result = await reconcileManualExecutions(account.id);
    expect(result.checked).toBe(1); // only the second one is still PENDING

    const secondUpdated = await prisma.manualExecution.findUniqueOrThrow({ where: { id: second.id } });
    expect(secondUpdated.matchStatus).toBe('UNMATCHED'); // the one real transaction is already claimed
  });
});
