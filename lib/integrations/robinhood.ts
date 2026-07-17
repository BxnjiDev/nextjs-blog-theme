/**
 * Robinhood Agentic Trading integration notes
 * ============================================
 *
 * This is deliberately NOT a REST client with stored OAuth credentials.
 * Robinhood Agentic Trading (beta, launched 2026) is exposed as an MCP
 * server, not a conventional brokerage API:
 *
 *   claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading
 *
 * That means the AI agent itself (this Claude session, or whichever agent
 * runtime is driving Atlas) connects directly to Robinhood's MCP tools to
 * read the agentic account and place orders — Robinhood previews every
 * order with the account owner before it executes. There is no app-held
 * secret to leak, because the app never holds brokerage credentials at
 * all; the connection lives in the agent's own MCP configuration.
 *
 * Given that, this module's remaining job is narrow: persist trade
 * proposals/executions the agent reports, through the TradeProposal
 * model — so there's a durable, queryable log with reasoning/confidence/
 * supporting data, independent of whatever chat transcript the trade
 * happened in.
 *
 * Account/holding/transaction/open-order sync (what used to be a minimal
 * `syncFromAgent` stub here) now lives in lib/domain/accountSync.ts — a
 * validated, idempotent, reconciled, audit-logged version of the same
 * idea, exposed via `npm run sync:account` (CLI) and `POST
 * /api/sync/account`. See ARCHITECTURE.md's "Live-evaluation account sync"
 * section.
 *
 * Nothing here calls out to Robinhood over HTTP, and nothing here places a
 * live trade. TradeProposal.mode is intentionally MANUAL_APPROVAL by
 * default until a human turns on autonomous mode for a specific account,
 * and even then execution still happens through the agent's MCP session,
 * never through this module.
 */
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export interface RecordExecutionInput {
  tradeProposalId: string;
  robinhoodOrderId: string;
  executedAt: Date;
}

/** Marks a previously-approved TradeProposal as executed, once the agent's
 * MCP session confirms the order filled on Robinhood's side. */
export async function recordExecution(input: RecordExecutionInput) {
  return prisma.tradeProposal.update({
    where: { id: input.tradeProposalId },
    data: {
      status: 'EXECUTED',
      robinhoodOrderId: input.robinhoodOrderId,
      executedAt: input.executedAt,
    },
  });
}

export type { Prisma };
