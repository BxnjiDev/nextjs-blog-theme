import { prisma } from '@/lib/prisma';
import type { PatternConfidence } from '@prisma/client';

export interface PatternDetectionJobResult {
  patternsFound: number;
  groupsConsidered: number;
}

/** Below this, a group is never surfaced as a pattern — avoids asserting
 * something from a handful of coincidental data points. */
const MIN_SAMPLE_SIZE = 5;

function confidenceForSampleSize(n: number): PatternConfidence {
  if (n >= 20) return 'HIGH';
  if (n >= 10) return 'MEDIUM';
  return 'LOW';
}

interface GroupStat {
  label: string;
  description: string;
  symbols: Set<string>;
  alphaValues: number[];
}

function statsFor(group: GroupStat): { sampleSize: number; winRatePct: number | null; supportingSymbols: string[] } {
  const sampleSize = group.alphaValues.length;
  const winRatePct = sampleSize > 0 ? (group.alphaValues.filter((a) => a > 0).length / sampleSize) * 100 : null;
  return { sampleSize, winRatePct, supportingSymbols: Array.from(group.symbols) };
}

/**
 * Looks for statistically-gated recurring characteristics of successful
 * recommendations (sector, margin trend, ROIC level) — every group below
 * MIN_SAMPLE_SIZE is silently dropped rather than surfaced as a "pattern."
 * This app's actual recommendation history is small, so most or all runs
 * are expected to find nothing meaningful yet; that is the honest,
 * intended behavior, not a bug.
 */
export async function runPatternDetectionJob(): Promise<PatternDetectionJobResult> {
  const outcomes = await prisma.recommendationOutcome.findMany({
    where: { alpha90d: { not: null } },
    include: { recommendation: { include: { holding: true } } },
  });

  const result: PatternDetectionJobResult = { patternsFound: 0, groupsConsidered: 0 };
  if (outcomes.length === 0) return result;

  const symbols = Array.from(new Set(outcomes.map((o) => o.symbol)));
  const latestSnapshots = await prisma.fundamentalSnapshot.findMany({
    where: { symbol: { in: symbols }, periodType: 'QUARTERLY' },
    orderBy: { reportDate: 'desc' },
  });
  const snapshotBySymbol = new Map<string, (typeof latestSnapshots)[number]>();
  for (const s of latestSnapshots) if (!snapshotBySymbol.has(s.symbol)) snapshotBySymbol.set(s.symbol, s);

  const bySector = new Map<string, GroupStat>();
  const marginImproving: GroupStat = { label: 'improving-margins', description: 'Holdings with improving net margin', symbols: new Set(), alphaValues: [] };
  const marginDeclining: GroupStat = { label: 'declining-margins', description: 'Holdings with declining net margin', symbols: new Set(), alphaValues: [] };
  const highRoic: GroupStat = { label: 'high-roic', description: 'Holdings with ROIC >= 15%', symbols: new Set(), alphaValues: [] };

  for (const o of outcomes) {
    const sector = o.recommendation.holding.sector ?? 'Unclassified';
    const sectorGroup = bySector.get(sector) ?? { label: sector, description: `Holdings in ${sector}`, symbols: new Set(), alphaValues: [] };
    sectorGroup.symbols.add(o.symbol);
    sectorGroup.alphaValues.push(o.alpha90d!);
    bySector.set(sector, sectorGroup);

    const snapshot = snapshotBySymbol.get(o.symbol);
    if (snapshot?.roic !== null && snapshot?.roic !== undefined && snapshot.roic >= 0.15) {
      highRoic.symbols.add(o.symbol);
      highRoic.alphaValues.push(o.alpha90d!);
    }
  }

  // Margin trend needs at least 2 snapshots per symbol.
  for (const symbol of symbols) {
    const history = await prisma.fundamentalSnapshot.findMany({
      where: { symbol, periodType: 'QUARTERLY' },
      orderBy: { reportDate: 'asc' },
    });
    const margins = history.map((h) => h.netMargin).filter((v): v is number => v !== null);
    if (margins.length < 2) continue;
    const improving = margins[margins.length - 1] >= margins[0];
    const symbolOutcomes = outcomes.filter((o) => o.symbol === symbol);
    for (const o of symbolOutcomes) {
      const target = improving ? marginImproving : marginDeclining;
      target.symbols.add(symbol);
      target.alphaValues.push(o.alpha90d!);
    }
  }

  const candidates: GroupStat[] = [...bySector.values(), marginImproving, marginDeclining, highRoic];
  result.groupsConsidered = candidates.length;

  for (const group of candidates) {
    const { sampleSize, winRatePct, supportingSymbols } = statsFor(group);
    if (sampleSize < MIN_SAMPLE_SIZE) continue;

    const avgAlpha = group.alphaValues.reduce((a, b) => a + b, 0) / group.alphaValues.length;
    await prisma.recommendationPattern.create({
      data: {
        label: group.label,
        description: `${group.description}: recommendations averaged ${avgAlpha.toFixed(1)}pp alpha vs. SPY at the 90-day mark (n=${sampleSize}, win rate ${winRatePct?.toFixed(0) ?? 'n/a'}%).`,
        sampleSize,
        supportingSymbols,
        winRatePct,
        confidenceLevel: confidenceForSampleSize(sampleSize),
        methodology: {
          groupedBy: group.label,
          minSampleSizeForSurfacing: MIN_SAMPLE_SIZE,
          metric: 'alpha90d (return vs. SPY at the 90-day recommendation-outcome window)',
        },
      },
    });
    result.patternsFound++;
  }

  return result;
}
