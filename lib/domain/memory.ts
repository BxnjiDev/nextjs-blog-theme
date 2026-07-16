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

  return lines.join('\n');
}
