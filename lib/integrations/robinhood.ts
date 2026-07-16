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
 * Given that, this module's job is narrow:
 *   1. Define the shape of data Atlas expects to receive FROM an agent
 *      session that has the MCP connector active (`syncFromAgent`).
 *   2. Persist trade proposals/executions the agent reports, through the
 *      TradeProposal model — so there's a durable, queryable log with
 *      reasoning/confidence/supporting data, independent of whatever
 *      chat transcript the trade happened in.
 *
 * Nothing here calls out to Robinhood over HTTP, and nothing here places a
 * live trade. TradeProposal.mode is intentionally MANUAL_APPROVAL by
 * default until a human turns on autonomous mode for a specific account,
 * and even then execution still happens through the agent's MCP session,
 * never through this module.
 */
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export interface AgentReportedHolding {
  symbol: string;
  name: string;
  sector?: string;
  quantity: number;
  avgCostBasis: number;
}

export interface AgentSyncPayload {
  accountExternalId: string;
  cashBalance: number;
  buyingPower: number;
  holdings: AgentReportedHolding[];
}

/**
 * Upserts account + holdings from data an agent session read via the
 * Robinhood MCP connector. Call this after the agent fetches fresh account
 * state — this file does not fetch that state itself.
 */
export async function syncFromAgent(payload: AgentSyncPayload) {
  const account = await prisma.account.upsert({
    where: { externalId: payload.accountExternalId },
    update: {
      cashBalance: payload.cashBalance,
      buyingPower: payload.buyingPower,
      lastSyncedAt: new Date(),
    },
    create: {
      provider: 'robinhood',
      externalId: payload.accountExternalId,
      cashBalance: payload.cashBalance,
      buyingPower: payload.buyingPower,
      lastSyncedAt: new Date(),
    },
  });

  for (const h of payload.holdings) {
    await prisma.holding.upsert({
      where: { accountId_symbol: { accountId: account.id, symbol: h.symbol } },
      update: { quantity: h.quantity, avgCostBasis: h.avgCostBasis, sector: h.sector },
      create: { ...h, accountId: account.id },
    });
  }

  return account;
}

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
