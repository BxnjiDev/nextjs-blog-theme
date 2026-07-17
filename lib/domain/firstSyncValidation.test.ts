import { describe, it, expect } from 'vitest';
import { computeReadinessStatus } from './firstSyncValidation';
import type { ReconciliationDetail } from './accountSync';

function detail(overrides: Partial<ReconciliationDetail>): ReconciliationDetail {
  return {
    field: 'quantity',
    atlasValue: 10,
    robinhoodValue: 10,
    status: 'MATCH',
    message: 'ok',
    ...overrides,
  };
}

describe('computeReadinessStatus', () => {
  it('is NOT_READY when the sync itself failed', () => {
    const status = computeReadinessStatus({ success: false, errors: ['stale payload'], warnings: [] }, []);
    expect(status).toBe('NOT_READY');
  });

  it('is NOT_READY when a critical field (cashBalance) mismatches', () => {
    const status = computeReadinessStatus(
      { success: true, errors: [], warnings: [] },
      [detail({ field: 'cashBalance', status: 'MISMATCH' })]
    );
    expect(status).toBe('NOT_READY');
  });

  it('is NOT_READY when a critical field (quantity) mismatches even if other fields match', () => {
    const status = computeReadinessStatus(
      { success: true, errors: [], warnings: [] },
      [detail({ field: 'quantity', symbol: 'AAPL', status: 'MISMATCH' }), detail({ field: 'marketValue', symbol: 'AAPL', status: 'MATCH' })]
    );
    expect(status).toBe('NOT_READY');
  });

  it('is READY_WITH_WARNINGS when only a non-critical field mismatches', () => {
    const status = computeReadinessStatus(
      { success: true, errors: [], warnings: [] },
      [detail({ field: 'avgCostBasis', status: 'MISMATCH' }), detail({ field: 'quantity', status: 'MATCH' })]
    );
    expect(status).toBe('READY_WITH_WARNINGS');
  });

  it('is READY_WITH_WARNINGS when there are free-text warnings even with all-matching details', () => {
    const status = computeReadinessStatus(
      { success: true, errors: [], warnings: ['cash drifted slightly'] },
      [detail({ field: 'quantity', status: 'MATCH' })]
    );
    expect(status).toBe('READY_WITH_WARNINGS');
  });

  it('is READY_WITH_WARNINGS when a field is MISSING or only TOLERANCE_MATCH', () => {
    const missing = computeReadinessStatus({ success: true, errors: [], warnings: [] }, [detail({ field: 'realizedPnl', status: 'MISSING_FIELD' })]);
    expect(missing).toBe('READY_WITH_WARNINGS');

    const tolerance = computeReadinessStatus({ success: true, errors: [], warnings: [] }, [detail({ field: 'marketValue', status: 'TOLERANCE_MATCH' })]);
    expect(tolerance).toBe('READY_WITH_WARNINGS');
  });

  it('is READY_FOR_RECOMMENDATION_ONLY_TESTING when everything matches and there are no warnings', () => {
    const status = computeReadinessStatus(
      { success: true, errors: [], warnings: [] },
      [detail({ field: 'quantity', status: 'MATCH' }), detail({ field: 'cashBalance', status: 'MATCH' }), detail({ field: 'buyingPower', status: 'NOT_INDEPENDENTLY_VERIFIABLE' })]
    );
    expect(status).toBe('READY_FOR_RECOMMENDATION_ONLY_TESTING');
  });

  it('NOT_INDEPENDENTLY_VERIFIABLE fields never block readiness by themselves', () => {
    const status = computeReadinessStatus(
      { success: true, errors: [], warnings: [] },
      [detail({ field: 'realizedPnl', status: 'NOT_INDEPENDENTLY_VERIFIABLE' }), detail({ field: 'avgCostBasis', status: 'NOT_INDEPENDENTLY_VERIFIABLE' })]
    );
    expect(status).toBe('READY_FOR_RECOMMENDATION_ONLY_TESTING');
  });
});
