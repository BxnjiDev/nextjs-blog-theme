/**
 * Configuration for the recommendation-only evaluation account (Phase 3.5).
 * This is a fixed policy, not a per-account DB setting — the constraints
 * describe how the user has chosen to run their $500 experimental
 * Robinhood account, and Atlas checks incoming sync data against them
 * rather than assuming they hold.
 */

/** Maximum capital the evaluation account is meant to hold, in dollars.
 * Overridable via env for testing, but 500 is the spec'd default. */
export const EVALUATION_MAX_CAPITAL = Number(process.env.EVALUATION_MAX_CAPITAL ?? 500);

/** Cash-plus-cost-basis above this multiple of EVALUATION_MAX_CAPITAL
 * triggers a reconciliation warning (not a rejection — gains can legitimately
 * push market value above the cap; this only flags capital *committed*, at
 * cost, materially exceeding what was meant to be deployed). */
export const EVALUATION_CAPITAL_WARNING_MULTIPLE = 1.5;

/** Asset classes allowed in the evaluation account — equities only, no
 * options/crypto. Enforced structurally by the sync payload's zod schema
 * (lib/domain/accountSyncSchema.ts) as well as checked here for clarity. */
export const EVALUATION_ALLOWED_ASSET_CLASSES = ['EQUITY', 'ETF'] as const;

/** Buying power more than this fraction above cash balance is treated as a
 * sign margin may be in use — no margin is allowed for this account. */
export const MARGIN_TOLERANCE_PCT = 0.01;

export const EVALUATION_RULES_SUMMARY = [
  `Maximum starting capital: $${EVALUATION_MAX_CAPITAL}`,
  'Cash is a valid position — no requirement to deploy all available capital',
  'Equities only — no options',
  'No margin, no leverage, no shorting',
  'Manual execution only — Atlas never submits an order',
] as const;

export const EVALUATION_BANNER_TEXT = 'Recommendation-only evaluation mode. Trades are executed manually by the user.';
