import type Anthropic from '@anthropic-ai/sdk';

/**
 * Every tool Atlas Chat can call — one per Atlas Core service area named in
 * the Atlas OS v1 brief (Portfolio, Briefings, Recommendations, Timeline,
 * Risk, Thesis, Performance, Comparison, Simulation, Memory). Each tool's
 * executor (toolExecutors.ts) calls the exact existing lib/domain function
 * other pages/jobs already use — nothing here recomputes anything. Claude
 * only ever reads through these; there is no tool that writes, and none
 * that could reach a brokerage (see lib/domain/executionBoundary.test.ts,
 * which would fail if one ever did).
 */
export const ATLAS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_portfolio',
    description: 'Current portfolio overview: total value, cash balance, day change, S&P 500 level, and every holding (symbol, quantity, cost basis, market value, unrealized P&L).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_briefing',
    description: "The most recent daily briefing: portfolio summary, performance vs SPY, material risks/health, recommended actions, portfolio news, upcoming earnings, and what Atlas would do/avoid today.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_recommendations',
    description: 'Recommendations Atlas has generated. Pass an id for one specific recommendation with full detail (bull/bear case, explainability, data-quality gate result), or symbol/limit to list recent ones.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Fetch one specific recommendation by id, with full detail.' },
        symbol: { type: 'string', description: 'Filter the list to one ticker symbol.' },
        limit: { type: 'number', description: 'Max recommendations to return when listing (default 10).' },
      },
    },
  },
  {
    name: 'get_timeline',
    description: 'Chronological portfolio timeline: transactions, thesis changes, recommendations, and alerts, most recent first.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Filter to one ticker symbol.' },
        limit: { type: 'number', description: 'Max entries to return (default 20).' },
      },
    },
  },
  {
    name: 'get_risk',
    description: 'The latest portfolio risk assessment: overall score and 12 components (concentration, sector, volatility, beta, drawdown, valuation, earnings, regulatory, liquidity, macro, news, staleness) with plain-English explanations.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_thesis',
    description: "One holding's investment thesis: overview, bull/bear case, growth drivers, risks, conviction score breakdown, and its history of changes over time.",
    input_schema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Ticker symbol.' } },
      required: ['symbol'],
    },
  },
  {
    name: 'get_performance',
    description: 'Portfolio performance vs the S&P 500 over the last day, week, and month, computed from actual recorded snapshots.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'compare',
    description: 'Evidence-based comparison of two or more symbols (can include symbols not currently held) across growth, valuation, quality, momentum, and conviction — e.g. "compare Amazon vs Microsoft."',
    input_schema: {
      type: 'object',
      properties: {
        symbols: { type: 'array', items: { type: 'string' }, description: '2 or more ticker symbols to compare.' },
      },
      required: ['symbols'],
    },
  },
  {
    name: 'simulate',
    description: "Hypothetical 'what if' portfolio reallocation: given proposed share-count changes for one or more current holdings, recomputes the portfolio's risk score, health score, and sector weights as if that reallocation had happened. Total portfolio value stays fixed — this only reallocates existing capital, and nothing is saved or executed.",
    input_schema: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              symbol: { type: 'string' },
              quantity: { type: 'number', description: 'The new HYPOTHETICAL total share count for this symbol (not a delta).' },
            },
            required: ['symbol', 'quantity'],
          },
        },
      },
      required: ['changes'],
    },
  },
  {
    name: 'recall_memory',
    description: "Atlas's accumulated memory for one holding: its recent recommendation history, conviction-score trend, and recent alerts — what Atlas already concluded about it before.",
    input_schema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Ticker symbol.' } },
      required: ['symbol'],
    },
  },
];
