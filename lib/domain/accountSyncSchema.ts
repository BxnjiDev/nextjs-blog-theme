import { z } from 'zod';

/**
 * Versioned contract for account-sync payloads (Phase 3.5). An agent
 * session with the Robinhood Agentic Trading MCP connector active reads
 * this data directly from Robinhood and reports it here — nothing in this
 * app ever calls Robinhood itself, and nothing in this schema has room for
 * a credential, session token, or MCP secret. Bumping this version is how
 * a future breaking payload-shape change gets rejected with a clear error
 * instead of silently misparsed.
 */
export const ACCOUNT_SYNC_SCHEMA_VERSION = '1.0';

// "Equities only" and "no shorting" are enforced structurally here, not
// just documented: OPTION/CRYPTO can't pass assetClass, and quantity/price
// fields reject negative numbers.
const HoldingSyncSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, 'symbol is required')
    .max(10, 'symbol looks too long to be a real ticker'),
  name: z.string().trim().min(1, 'name is required'),
  assetClass: z.enum(['EQUITY', 'ETF']).default('EQUITY'),
  sector: z.string().trim().min(1).nullable().optional(),
  quantity: z.number().finite().nonnegative('quantity cannot be negative (no shorting)'),
  avgCostBasis: z.number().finite().nonnegative(),
  /** Robinhood-reported market value — used only for reconciliation
   * against Atlas's own live-quoted market value, never stored as truth. */
  marketValue: z.number().finite().nonnegative().optional(),
  unrealizedPnl: z.number().finite().optional(),
  unrealizedPnlPercent: z.number().finite().optional(),
  /** Cumulative realized P&L for this symbol, as reported. */
  realizedPnl: z.number().finite().optional(),
});

const TransactionSyncSchema = z.object({
  /** Brokerage fill/order id — required so repeated syncs are idempotent
   * (unique constraint on Transaction.externalId). */
  externalId: z.string().trim().min(1, 'transaction externalId is required for idempotent sync'),
  symbol: z.string().trim().min(1),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().finite().positive(),
  price: z.number().finite().positive(),
  executedAt: z.string().datetime({ message: 'executedAt must be an ISO-8601 timestamp' }),
});

const OpenOrderSyncSchema = z.object({
  externalId: z.string().trim().min(1, 'open order externalId is required'),
  symbol: z.string().trim().min(1),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().finite().positive(),
  orderType: z.enum(['MARKET', 'LIMIT', 'STOP']),
  limitPrice: z.number().finite().positive().nullable().optional(),
  stopPrice: z.number().finite().positive().nullable().optional(),
  status: z.string().trim().min(1),
  submittedAt: z.string().datetime({ message: 'submittedAt must be an ISO-8601 timestamp' }),
});

export const AccountSyncPayloadSchema = z.object({
  schemaVersion: z.literal(ACCOUNT_SYNC_SCHEMA_VERSION, {
    message: `Unsupported schema version — this Atlas instance expects "${ACCOUNT_SYNC_SCHEMA_VERSION}"`,
  }),
  /** When this snapshot was actually read from Robinhood — the staleness
   * check (lib/domain/accountSync.ts) rejects payloads built from
   * old data. */
  asOf: z.string().datetime({ message: 'asOf must be an ISO-8601 timestamp' }),
  accountExternalId: z.string().trim().min(1, 'accountExternalId is required'),
  /** Marks this as the $500 recommendation-only evaluation account — see
   * lib/domain/evaluationConfig.ts. Defaults true since that's this
   * workflow's only supported use case; set false explicitly to sync a
   * non-evaluation account without tripping the evaluation banner/checks. */
  isEvaluationAccount: z.boolean().default(true),
  cashBalance: z.number().finite().nonnegative(),
  buyingPower: z.number().finite().nonnegative(),
  holdings: z.array(HoldingSyncSchema),
  transactions: z.array(TransactionSyncSchema).default([]),
  openOrders: z.array(OpenOrderSyncSchema).default([]),
});

export type AccountSyncPayload = z.infer<typeof AccountSyncPayloadSchema>;
export type HoldingSync = z.infer<typeof HoldingSyncSchema>;
export type TransactionSync = z.infer<typeof TransactionSyncSchema>;
export type OpenOrderSync = z.infer<typeof OpenOrderSyncSchema>;
