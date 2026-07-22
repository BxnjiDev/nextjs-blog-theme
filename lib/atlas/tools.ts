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
  {
    name: 'get_todays_focus',
    description:
      "Atlas's own prioritized read on what currently matters most: portfolio health, risk, the single highest-confidence pending recommendation, a recent thesis change, near-term earnings, and data-quality context, each scored (importance/confidence/urgency/impact) and ranked. This is the exact same ranking the Home dashboard's \"Today's focus\" shows — use it when asked something like \"what should I pay attention to today\" or \"what's my highest priority\" so the answer matches what the dashboard already says, rather than re-deriving a separate opinion from get_risk/get_recommendations/get_briefing individually.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_decision',
    description:
      "The Decision Engine's structured verdict for one symbol: a recommended action (increase/begin/continue holding/reduce/exit/wait/gather more information/no action), the reasoning behind it across eleven factors (thesis strength, conviction, risk, valuation, concentration, sector exposure, technical context, catalysts, news impact, earnings timing, portfolio objectives), supporting evidence, primary risks, invalidation conditions, and a confidence score that's discounted for stale data, conflicting signals, or missing information — never presented as more certain than the evidence supports. Also returns the full decision history for that symbol (every past recommendation, when its stated action changed and why) and related same-sector portfolio positions. This is the exact same verdict the Investment Memo, Home, and /compare show for this symbol — use this instead of just reading get_recommendations or get_thesis in isolation when asked what Atlas thinks should be done about a specific holding.",
    input_schema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Ticker symbol.' } },
      required: ['symbol'],
    },
  },
  {
    name: 'scan_watchlist',
    description:
      "The Strategy & Market Monitoring Engine's continuous scan of the watchlist (every held position, every actively-tracked Opportunity, plus the curated Magnificent Seven/Technology/Defense/Energy long-term-focus core) — ranked strongest-first. Each result is an Entry Opportunity: strategy classification (long-term core/growth, event-driven swing, tactical swing, risk reduction, rebalance, watch only), trade intent, why now/why not, expected holding window, invalidation conditions, profit-management guidance, and a Potential/Qualified/High-conviction tier — all framed from that symbol's existing Decision (same one get_decision returns for it), never a second scoring path. Use this when asked something like \"what looks interesting right now\" or \"scan the market for setups\" rather than checking symbols one at a time with get_decision.",
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max ranked opportunities to return (default 10).' } },
    },
  },
  {
    name: 'get_symbol_chart_context',
    description:
      "One symbol's candle-backed chart context for a given timeframe: latest price and freshness (live/delayed/end_of_day/cached/stale/unavailable/mock — never presented as more current than it is), how many candles were available, the percent change across the fetched window, and the same demand-zone and liquidity-sweep evidence the interactive chart overlays and the Decision Engine read from lib/domain/candles.ts and lib/strategy — never a separate calculation. Use this when asked something like \"show me the four-hour chart for Amazon,\" \"what's the daily chart look like,\" or \"is price inside the demand zone,\" or to ground any answer that references a specific timeframe's candles.",
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol.' },
        interval: { type: 'string', enum: ['30m', '1h', '4h', '1D', '1W'], description: 'Chart timeframe (default 1D).' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_multi_timeframe_technical',
    description:
      "One symbol's technical structure across all five supported timeframes (30m/1h/4h/1D/1W) plus SPY as a benchmark: each timeframe's available technical evidence, demand zones, and liquidity-sweep events; the composite weighted tone; and any conflicts where a shorter timeframe's tone opposes a longer one (which lowers Decision confidence rather than being ignored). Use this for questions like \"what changes on the daily timeframe\" or \"is there a conflict between the weekly and the 30-minute chart\" — this is the same context lib/domain/multiTimeframe.ts supplies to the Decision Engine when multi-timeframe context is requested, not an independent read.",
    input_schema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Ticker symbol.' } },
      required: ['symbol'],
    },
  },
  {
    name: 'get_entry_opportunity',
    description:
      "One symbol's full Entry Opportunity — the same structure scan_watchlist returns for watchlist symbols, but for any single symbol on demand, whether or not it's currently held or tracked: strategy classification, latest price and freshness, preferred analytical timeframe, potential entry area (a range, not a precise price, when the evidence supports one), distance to that area, invalidation condition, demand-zone and liquidity-sweep context, trend/volume summary, confidence, why now/why not, expected holding window, and next review trigger — all derived from that symbol's own Decision (the same one get_decision returns), never a second scoring path. Use this for \"why is this an entry,\" \"was that a liquidity sweep,\" or \"what would make me consider buying this.\"",
    input_schema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Ticker symbol.' } },
      required: ['symbol'],
    },
  },
];
