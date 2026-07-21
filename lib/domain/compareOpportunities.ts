import { prisma } from '@/lib/prisma';
import { marketDataProvider, type Quote } from '@/lib/integrations';
import { computeConviction, type ConvictionResult } from './conviction';
import { getFundamentalHistory } from './fundamentalsHistory';
import { getActiveAccountId } from './portfolio';

/** Cash has no growth/risk profile to score against the 13 conviction
 * categories, so it isn't run through computeConviction at all — it's
 * pinned to this fixed, documented neutral baseline. This is NOT a
 * conviction score; it exists purely so the ranking shows whether each
 * opportunity clears "better than doing nothing," never to imply cash
 * itself scored 50/100 on some analysis. */
const CASH_BASELINE_SCORE = 50;

const CATEGORY_KEYS = [
  'financialStrength',
  'revenueGrowth',
  'profitability',
  'balanceSheet',
  'competitiveMoat',
  'aiPositioning',
  'managementExecution',
  'industryLeadership',
  'productInnovation',
  'valuation',
  'executionRisk',
  'regulatoryRisk',
  'macroSensitivity',
] as const;
type CategoryKey = (typeof CATEGORY_KEYS)[number];

/** Categories where a HIGHER raw score means MORE risk (mirrors
 * lib/domain/conviction.ts's INVERTED_CATEGORIES) — flipped here so every
 * category in this module's comparisons reads as "higher is better." */
const INVERTED = new Set<CategoryKey>(['executionRisk', 'regulatoryRisk', 'macroSensitivity']);

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  financialStrength: 'financial strength',
  revenueGrowth: 'revenue growth',
  profitability: 'profitability',
  balanceSheet: 'balance sheet',
  competitiveMoat: 'competitive moat',
  aiPositioning: 'AI positioning',
  managementExecution: 'management execution',
  industryLeadership: 'industry leadership',
  productInnovation: 'product innovation',
  valuation: 'valuation',
  executionRisk: 'execution risk',
  regulatoryRisk: 'regulatory risk',
  macroSensitivity: 'macro sensitivity',
};

export interface ComparisonEntry {
  symbol: string;
  isCash: boolean;
  name: string | null;
  sector: string | null;
  isHeld: boolean;
  overallScore: number;
  conviction: ConvictionResult | null;
  quote: Quote | null;
  latestRecommendationId: string | null;
  error: string | null;
}

export interface RankedComparisonEntry extends ComparisonEntry {
  rank: number;
  explanation: string;
}

function displayScore(conviction: ConvictionResult, key: CategoryKey): number | null {
  const score = conviction[key].score;
  if (score === null) return null;
  return INVERTED.has(key) ? 100 - score : score;
}

async function analyzeSymbol(symbol: string, heldSymbols: Set<string>, accountId: string | null): Promise<ComparisonEntry> {
  try {
    const [quote, fundamentals, history, sp500History, fundamentalHistory, nextEarnings, latestRec] = await Promise.all([
      marketDataProvider.getQuote(symbol),
      marketDataProvider.getFundamentals(symbol),
      marketDataProvider.getHistoricalDaily(symbol, 60),
      marketDataProvider.getSp500History(60),
      getFundamentalHistory(symbol),
      prisma.earningsEvent.findFirst({ where: { symbol, isEstimate: true }, orderBy: { reportDate: 'asc' } }),
      accountId
        ? prisma.recommendation.findFirst({ where: { symbol, holding: { accountId } }, orderBy: { generatedAt: 'desc' } })
        : Promise.resolve(null),
    ]);
    const daysToNextEarnings = nextEarnings
      ? Math.round((nextEarnings.reportDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    const conviction = computeConviction({
      symbol,
      fundamentals,
      fundamentalHistory,
      history,
      sp500History,
      sector: fundamentals?.sector ?? null,
      daysToNextEarnings,
    });

    return {
      symbol,
      isCash: false,
      name: fundamentals?.name ?? null,
      sector: fundamentals?.sector ?? null,
      isHeld: heldSymbols.has(symbol),
      overallScore: conviction.overallScore,
      conviction,
      quote,
      latestRecommendationId: latestRec?.id ?? null,
      error: null,
    };
  } catch (err) {
    return {
      symbol,
      isCash: false,
      name: null,
      sector: null,
      isHeld: heldSymbols.has(symbol),
      overallScore: 0,
      conviction: null,
      quote: null,
      latestRecommendationId: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function topCategories(conviction: ConvictionResult, n: number): string {
  const scored = CATEGORY_KEYS.map((key) => ({ key, value: displayScore(conviction, key) })).filter(
    (c): c is { key: CategoryKey; value: number } => c.value !== null
  );
  scored.sort((a, b) => b.value - a.value);
  if (scored.length === 0) return 'no categories could be scored from available data';
  return scored
    .slice(0, n)
    .map((c) => `${CATEGORY_LABELS[c.key]} (${c.value})`)
    .join(' and ');
}

function biggestGaps(entry: ConvictionResult, top: ConvictionResult, n: number): string {
  const gaps = CATEGORY_KEYS.map((key) => {
    const e = displayScore(entry, key);
    const t = displayScore(top, key);
    if (e === null || t === null) return null;
    return { key, gap: t - e, e, t };
  }).filter((g): g is { key: CategoryKey; gap: number; e: number; t: number } => g !== null && g.gap > 0);
  gaps.sort((a, b) => b.gap - a.gap);
  return gaps
    .slice(0, n)
    .map((g) => `${CATEGORY_LABELS[g.key]} (${g.e} vs ${g.t})`)
    .join(' and ');
}

function explain(entry: ComparisonEntry, top: ComparisonEntry | null, isTop: boolean): string {
  if (entry.error) return `Could not be analyzed: ${entry.error}`;

  if (isTop) {
    if (entry.isCash) {
      return `No opportunity in this comparison cleared the neutral cash baseline (${CASH_BASELINE_SCORE}/100) — holding cash ranked highest by elimination, not because cash itself scored well on anything.`;
    }
    if (!entry.conviction) return 'Highest overall conviction score in this comparison.';
    return `Highest overall conviction (${entry.overallScore}/100) in this comparison, led by ${topCategories(entry.conviction, 2)}.`;
  }

  if (entry.isCash) {
    if (!top) return 'Ranked below the top pick.';
    const delta = top.overallScore - CASH_BASELINE_SCORE;
    if (delta <= 0) {
      return `${top.symbol}'s overall conviction (${top.overallScore}/100) doesn't clear the neutral cash baseline (${CASH_BASELINE_SCORE}/100) by a meaningful margin, but ranked ahead of cash on tie-breaking order.`;
    }
    return `${top.symbol}'s overall conviction (${top.overallScore}/100) clears the neutral cash baseline (${CASH_BASELINE_SCORE}/100) by ${delta} points, so cash ranks below it here.`;
  }

  if (!top || top.isCash || !top.conviction || !entry.conviction) {
    return `Overall conviction ${entry.overallScore}/100, below ${top?.isCash ? 'the neutral cash baseline' : (top?.symbol ?? 'the top pick')} (${top?.overallScore ?? CASH_BASELINE_SCORE}/100).`;
  }

  const gaps = biggestGaps(entry.conviction, top.conviction, 2);
  if (!gaps) {
    return `Overall conviction ${entry.overallScore}/100, below ${top.symbol}'s ${top.overallScore}/100 on balance across categories rather than any single weak spot.`;
  }
  return `Ranks below ${top.symbol} (${top.overallScore}/100 vs. ${entry.overallScore}/100) primarily on ${gaps}.`;
}

/**
 * Ad-hoc, fully deterministic ranking of arbitrary symbols (held or not) —
 * "should I buy AMZN, MSFT, NVDA, ORCL, KTOS, RKLB, or hold cash?" Reuses
 * computeConviction (lib/domain/conviction.ts) exactly as the thesis job
 * does, so a symbol's score here matches what its Thesis/Recommendation
 * would show — no separate scoring logic. Deliberately skips the AI
 * reasoning layer (no bull/bear narrative): with up to several symbols
 * compared interactively, this stays fast and free of API cost, and links
 * to each symbol's Investment Memo (if one has been generated) for the
 * fuller narrative instead of duplicating it.
 */
/** Pure ranking step, split out from compareOpportunities() so it's unit-
 * testable without any I/O: sorts by overallScore descending and attaches
 * a rank + deterministic explanation to each entry. */
export function rankEntries(entries: ComparisonEntry[]): RankedComparisonEntry[] {
  const ranked = [...entries].sort((a, b) => b.overallScore - a.overallScore);
  const top = ranked[0] ?? null;

  return ranked.map((entry, i) => ({
    ...entry,
    rank: i + 1,
    explanation: explain(entry, top, i === 0),
  }));
}

export async function compareOpportunities(symbols: string[], includeCash = true): Promise<RankedComparisonEntry[]> {
  const uniqueSymbols = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));

  const accountId = await getActiveAccountId();
  const holdings = accountId
    ? await prisma.holding.findMany({ where: { accountId, quantity: { gt: 0 } }, select: { symbol: true } })
    : [];
  const heldSymbols = new Set(holdings.map((h) => h.symbol));

  const entries: ComparisonEntry[] = await Promise.all(uniqueSymbols.map((s) => analyzeSymbol(s, heldSymbols, accountId)));

  if (includeCash) {
    entries.push({
      symbol: 'CASH',
      isCash: true,
      name: 'Hold cash',
      sector: null,
      isHeld: false,
      overallScore: CASH_BASELINE_SCORE,
      conviction: null,
      quote: null,
      latestRecommendationId: null,
      error: null,
    });
  }

  return rankEntries(entries);
}

export { CASH_BASELINE_SCORE, CATEGORY_KEYS, CATEGORY_LABELS };
