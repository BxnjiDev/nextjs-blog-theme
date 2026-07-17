import { describe, it, expect } from 'vitest';
import { matchExecution, type ManualExecutionForMatching, type CandidateTransaction } from './executionReconciliation';

function manual(overrides: Partial<ManualExecutionForMatching> = {}): ManualExecutionForMatching {
  return {
    symbol: 'AAPL',
    side: 'BUY',
    executedAt: new Date('2026-07-01T15:30:00Z'),
    quantity: 10,
    dollarAmount: 1000,
    executionPrice: 100,
    ...overrides,
  };
}

function candidate(overrides: Partial<CandidateTransaction> = {}): CandidateTransaction {
  return {
    id: 'txn-1',
    quantity: 10,
    price: 100,
    executedAt: new Date('2026-07-01T15:30:00Z'),
    ...overrides,
  };
}

describe('matchExecution', () => {
  it('reports UNMATCHED with no candidates', () => {
    const result = matchExecution(manual(), []);
    expect(result.matchStatus).toBe('UNMATCHED');
    expect(result.matchedTransactionId).toBeNull();
  });

  it('reports MATCHED for an exact match', () => {
    const result = matchExecution(manual(), [candidate()]);
    expect(result.matchStatus).toBe('MATCHED');
    expect(result.matchedTransactionId).toBe('txn-1');
  });

  it('reports MATCHED within configured tolerances (small price/timing drift)', () => {
    const result = matchExecution(
      manual(),
      [candidate({ price: 100.5, executedAt: new Date('2026-07-01T20:00:00Z') })] // ~0.5% price, ~4.5h timing
    );
    expect(result.matchStatus).toBe('MATCHED');
  });

  it('reports PRICE_MISMATCH when price is far off but quantity/amount/timing are within tolerance', () => {
    // Note: amount = quantity * price, so a big price change also changes
    // amount — construct a case where only price diverges by adjusting
    // amount expectations accordingly isn't realistic; instead use a case
    // where the reported dollarAmount already reflects the mismatched price
    // (a data-entry error in executionPrice alone, amount computed correctly
    // off the real fill).
    const result = matchExecution(
      manual({ dollarAmount: 10 * 130, executionPrice: 100 }), // amount matches candidate's true value, execution price field alone is wrong
      [candidate({ price: 130 })]
    );
    expect(result.matchStatus).toBe('PRICE_MISMATCH');
  });

  it('reports QUANTITY_MISMATCH when quantity is off by more than tolerance and not a plausible partial fill', () => {
    const result = matchExecution(
      manual({ quantity: 10, dollarAmount: 1000, executionPrice: 100 }),
      [candidate({ quantity: 15, price: 100 })] // executed MORE than reported — not a "partial"
    );
    expect(result.matchStatus).toBe('QUANTITY_MISMATCH');
  });

  it('reports PARTIALLY_MATCHED when a plausible partial fill is found', () => {
    const result = matchExecution(
      manual({ quantity: 10, dollarAmount: 1000, executionPrice: 100 }),
      [candidate({ quantity: 6, price: 100 })] // 60% filled, price/timing otherwise fine
    );
    expect(result.matchStatus).toBe('PARTIALLY_MATCHED');
  });

  it('reports TIMING_MISMATCH when timing is far outside tolerance even if amounts match', () => {
    const result = matchExecution(manual(), [candidate({ executedAt: new Date('2026-07-05T15:30:00Z') })]); // 4 days later
    expect(result.matchStatus).toBe('TIMING_MISMATCH');
  });

  it('reports AMOUNT_MISMATCH when the dollar total is off but quantity/price/timing individually look close', () => {
    // Constructed so neither quantity nor price alone crosses their
    // tolerance, but the combined amount does (e.g. a fee or rounding
    // difference baked into the reported dollarAmount).
    const result = matchExecution(
      manual({ quantity: 10, executionPrice: 100, dollarAmount: 1050 }), // reported amount inflated vs. qty*price
      [candidate({ quantity: 10, price: 100 })]
    );
    expect(result.matchStatus).toBe('AMOUNT_MISMATCH');
  });

  it('picks the closest-matching candidate by dollar amount when multiple exist', () => {
    const result = matchExecution(manual({ dollarAmount: 1000 }), [
      candidate({ id: 'far', quantity: 20, price: 100 }), // $2000
      candidate({ id: 'close', quantity: 10, price: 100 }), // $1000
    ]);
    expect(result.matchedTransactionId).toBe('close');
    expect(result.matchStatus).toBe('MATCHED');
  });

  it('never returns a matchedTransactionId for UNMATCHED', () => {
    const result = matchExecution(manual(), []);
    expect(result.matchedTransactionId).toBeNull();
  });
});
