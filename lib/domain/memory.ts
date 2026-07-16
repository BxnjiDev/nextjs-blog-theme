import { prisma } from '@/lib/prisma';

/**
 * Assembles what Atlas already knows about a holding — past
 * recommendations, conviction trend, and alerts — so the thesis job
 * compares fresh evidence against prior conclusions instead of starting
 * from scratch every run ("AI memory").
 */
export async function buildMemoryContext(holdingId: string, symbol: string): Promise<string> {
  const [recentRecommendations, recentConviction, recentAlerts] = await Promise.all([
    prisma.recommendation.findMany({ where: { holdingId }, orderBy: { generatedAt: 'desc' }, take: 5 }),
    prisma.convictionAssessment.findMany({ where: { symbol }, orderBy: { generatedAt: 'desc' }, take: 5 }),
    prisma.alert.findMany({ where: { symbol }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);

  const lines: string[] = [];

  if (recentRecommendations.length > 0) {
    lines.push('Past recommendations (most recent first):');
    for (const r of recentRecommendations) {
      lines.push(`  - ${r.generatedAt.toISOString().slice(0, 10)}: action=${r.action}, confidence=${r.confidenceScore}/10`);
    }
  } else {
    lines.push('Past recommendations: none yet.');
  }

  if (recentConviction.length > 0) {
    lines.push('Conviction score trend (most recent first):');
    for (const c of recentConviction) {
      lines.push(`  - ${c.generatedAt.toISOString().slice(0, 10)}: ${c.overallScore}/100`);
    }
  } else {
    lines.push('Conviction score trend: no prior assessments.');
  }

  if (recentAlerts.length > 0) {
    lines.push('Past alerts:');
    for (const a of recentAlerts) {
      lines.push(`  - ${a.createdAt.toISOString().slice(0, 10)} [${a.type}]: ${a.message}`);
    }
  } else {
    lines.push('Past alerts: none.');
  }

  const calibration = await buildCalibrationSummary();
  if (calibration) lines.push('', calibration);

  return lines.join('\n');
}

/**
 * Closes the confidence-calibration loop ("automatically improve future
 * confidence estimates") honestly: rather than a fabricated auto-adjustment
 * algorithm, the latest calibration run's actual win rate per confidence
 * band is handed to the AI reasoning step as context, so a stated
 * confidence level is informed by how that same band has performed
 * historically — see lib/jobs/computeConfidenceCalibration.ts.
 */
async function buildCalibrationSummary(): Promise<string | null> {
  const latest = await prisma.confidenceCalibration.findFirst({ orderBy: { generatedAt: 'desc' } });
  if (!latest) return null;

  const buckets = Array.isArray(latest.buckets) ? (latest.buckets as Array<Record<string, unknown>>) : [];
  const lines = ['Historical confidence calibration (from past graded recommendations — use this to calibrate your stated confidence):'];
  for (const b of buckets) {
    if (typeof b.sampleSize === 'number' && b.sampleSize > 0) {
      lines.push(
        `  - Confidence band ${b.label}: actual win rate ${typeof b.actualWinRatePct === 'number' ? b.actualWinRatePct.toFixed(0) : 'n/a'}% (n=${b.sampleSize}${b.note ? `, ${b.note}` : ''}).`
      );
    }
  }
  if (lines.length === 1) return null; // no non-empty buckets
  return lines.join('\n');
}
