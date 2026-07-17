import { prisma } from '@/lib/prisma';
import { getPortfolioOverview } from '@/lib/domain/portfolio';
import { getPortfolioTimeline } from '@/lib/domain/timeline';
import { getPerformanceSummary } from '@/lib/domain/performance';
import { compareOpportunities } from '@/lib/domain/compareOpportunities';
import { getSimulatorBaseline } from '@/lib/domain/simulator';
import { computeSimulatedMetrics } from '@/lib/domain/simulatorMetrics';
import { buildMemoryContext } from '@/lib/domain/memory';
import { normalizeBriefingPortfolioSummary, normalizeBriefingMarketRecap, normalizeExplainability, normalizeDataQualityChecks } from '@/lib/domain/legacyNormalization';
import { toJsonSafe } from './serialize';

export interface ToolResult {
  toolName: string;
  input: unknown;
  output: unknown;
}

async function getPortfolio() {
  const overview = await getPortfolioOverview();
  if (!overview) return { error: 'No account on record yet — nothing to show.' };
  return overview;
}

async function getBriefing() {
  const briefing = await prisma.briefing.findFirst({ orderBy: { date: 'desc' } });
  if (!briefing) return { error: 'No briefing has been generated yet.' };
  return {
    date: briefing.date,
    summary: normalizeBriefingPortfolioSummary(briefing.portfolioSummary),
    marketRecap: normalizeBriefingMarketRecap(briefing.marketRecap),
  };
}

async function getRecommendations(input: { id?: string; symbol?: string; limit?: number }) {
  if (input.id) {
    const r = await prisma.recommendation.findUnique({
      where: { id: input.id },
      include: { outcome: true, holding: { include: { thesis: { include: { convictionAssessments: { orderBy: { generatedAt: 'desc' }, take: 1 } } } } } },
    });
    if (!r) return { error: `No recommendation found with id ${input.id}.` };
    return {
      ...r,
      explainability: normalizeExplainability(r.explainability),
      dataQualityChecks: normalizeDataQualityChecks(r.dataQualityChecks),
      convictionScore: r.holding.thesis?.convictionAssessments[0]?.overallScore ?? null,
    };
  }

  const recommendations = await prisma.recommendation.findMany({
    where: input.symbol ? { symbol: input.symbol.toUpperCase() } : undefined,
    distinct: ['holdingId'],
    orderBy: [{ holdingId: 'asc' }, { generatedAt: 'desc' }],
    take: Math.min(input.limit ?? 10, 25),
    select: {
      id: true,
      symbol: true,
      action: true,
      confidenceScore: true,
      thesis: true,
      userDecision: true,
      proposedDollarAmount: true,
      percentageOfPortfolio: true,
      dataQualityStatus: true,
      generatedAt: true,
    },
  });
  return { recommendations };
}

async function getTimeline(input: { symbol?: string; limit?: number }) {
  const entries = await getPortfolioTimeline({ symbol: input.symbol, limit: input.limit ?? 20 });
  return { entries };
}

async function getRisk() {
  const risk = await prisma.riskAssessment.findFirst({ orderBy: { generatedAt: 'desc' } });
  if (!risk) return { error: 'No risk assessment has been generated yet.' };
  return risk;
}

async function getThesis(input: { symbol: string }) {
  const symbol = input.symbol.toUpperCase();
  const holding = await prisma.holding.findFirst({
    where: { symbol },
    include: {
      thesis: {
        include: {
          convictionAssessments: { orderBy: { generatedAt: 'desc' }, take: 1 },
          changeEvents: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
      },
    },
  });
  if (!holding?.thesis) return { error: `No thesis on record for ${symbol}.` };
  return {
    symbol,
    thesis: holding.thesis,
    convictionScore: holding.thesis.convictionAssessments[0]?.overallScore ?? null,
    recentChanges: holding.thesis.changeEvents,
  };
}

async function getPerformance() {
  return getPerformanceSummary();
}

async function compare(input: { symbols: string[] }) {
  if (!input.symbols || input.symbols.length < 1) return { error: 'Provide at least one symbol to compare.' };
  const ranked = await compareOpportunities(input.symbols.map((s) => s.toUpperCase()));
  return { comparison: ranked };
}

async function simulate(input: { changes: { symbol: string; quantity: number }[] }) {
  const baseline = await getSimulatorBaseline();
  if (!baseline) return { error: 'No portfolio on record yet — nothing to simulate against.' };

  const hypotheticalShares = Object.fromEntries(baseline.holdings.map((h) => [h.symbol, h.quantity]));
  for (const change of input.changes ?? []) {
    const symbol = change.symbol.toUpperCase();
    if (symbol in hypotheticalShares) hypotheticalShares[symbol] = Math.max(0, change.quantity);
  }

  const unknownSymbols = (input.changes ?? []).map((c) => c.symbol.toUpperCase()).filter((s) => !(s in hypotheticalShares));
  const metrics = computeSimulatedMetrics(baseline, hypotheticalShares);
  return {
    ...metrics,
    unknownSymbols: unknownSymbols.length > 0 ? unknownSymbols : undefined,
    note: 'Hypothetical only — nothing here is saved or executed. Total portfolio value stays fixed; this reallocates existing capital.',
  };
}

async function recallMemory(input: { symbol: string }) {
  const symbol = input.symbol.toUpperCase();
  const holding = await prisma.holding.findFirst({ where: { symbol } });
  if (!holding) return { error: `No holding on record for ${symbol}.` };
  const context = await buildMemoryContext(holding.id, symbol);
  return { symbol, memory: context };
}

const EXECUTORS: Record<string, (input: any) => Promise<unknown>> = {
  get_portfolio: getPortfolio,
  get_briefing: getBriefing,
  get_recommendations: getRecommendations,
  get_timeline: getTimeline,
  get_risk: getRisk,
  get_thesis: getThesis,
  get_performance: getPerformance,
  compare: compare,
  simulate: simulate,
  recall_memory: recallMemory,
};

/** The one place a tool name (as chosen by Claude) turns into an actual
 * Atlas Core call. Unknown tool names return an error payload rather than
 * throwing, so a single bad tool_use block can't crash the whole chat
 * turn. */
export async function executeTool(name: string, input: unknown): Promise<ToolResult> {
  const executor = EXECUTORS[name];
  if (!executor) {
    return { toolName: name, input, output: { error: `Unknown tool "${name}".` } };
  }
  try {
    const output = await executor(input ?? {});
    return { toolName: name, input, output: toJsonSafe(output) };
  } catch (err) {
    return { toolName: name, input, output: { error: err instanceof Error ? err.message : String(err) } };
  }
}
