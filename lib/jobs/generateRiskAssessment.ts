import { prisma } from '@/lib/prisma';
import { marketDataProvider, secFilingsProvider } from '@/lib/integrations';
import { getPortfolioOverview } from '@/lib/domain/portfolio';
import { getStoredNews } from '@/lib/domain/news';
import { computeRisk, type RiskHoldingInput, type RiskResult } from '@/lib/domain/risk';
import { createAlertIfNew, todayKey } from '@/lib/domain/alerts';

export interface RiskJobResult {
  skipped: boolean;
  overallScore?: number;
  previousScore?: number | null;
}

const COMPONENT_LABELS: Record<string, string> = {
  concentrationRisk: 'Concentration',
  sectorRisk: 'Sector concentration',
  volatilityRisk: 'Volatility',
  betaRisk: 'Beta vs. SPY',
  drawdownRisk: 'Drawdown',
  valuationRisk: 'Valuation',
  earningsRisk: 'Earnings-event proxy',
  regulatoryRisk: 'Regulatory exposure',
  liquidityRisk: 'Liquidity',
  macroRisk: 'Macro sensitivity',
  newsRisk: 'News/controversy',
  stalenessRisk: 'Data staleness',
};

function buildChangeNotes(current: RiskResult, previous: Record<string, number> | null): string {
  if (!previous) return 'First risk assessment on record — no prior score to compare against.';

  const deltas: Array<{ label: string; delta: number }> = [];
  for (const key of Object.keys(COMPONENT_LABELS)) {
    const currentScore = (current as unknown as Record<string, { score: number }>)[key].score;
    const previousScore = previous[key];
    if (previousScore === undefined) continue;
    const delta = currentScore - previousScore;
    if (Math.abs(delta) >= 5) deltas.push({ label: COMPONENT_LABELS[key], delta });
  }

  if (deltas.length === 0) return 'No component moved more than 5 points since the last assessment.';

  const rose = deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta);
  const fell = deltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta);

  const parts: string[] = [];
  if (rose.length > 0) {
    parts.push(`Increased: ${rose.map((d) => `${d.label} (+${d.delta})`).join(', ')}.`);
  }
  if (fell.length > 0) {
    parts.push(`Decreased: ${fell.map((d) => `${d.label} (${d.delta})`).join(', ')}.`);
  }
  return parts.join(' ');
}

/**
 * Recomputes portfolio risk from current holdings and available market
 * data using deterministic calculations (lib/domain/risk.ts) — no
 * AI-generated numbers. Always writes a new row (risk assessments are a
 * time series, not upserted) so `/risk` can show trend over time; the job
 * itself is naturally rate-limited by its cron schedule rather than an
 * artificial freshness window.
 */
export async function runRiskAssessmentJob(): Promise<RiskJobResult> {
  const overview = await getPortfolioOverview();
  if (!overview) return { skipped: true };

  const [sp500History, portfolioHistoryRaw, previous] = await Promise.all([
    marketDataProvider.getSp500History(60),
    prisma.performanceSnapshot.findMany({ orderBy: { date: 'asc' }, take: 90 }),
    prisma.riskAssessment.findFirst({ orderBy: { generatedAt: 'desc' } }),
  ]);
  const portfolioHistory = portfolioHistoryRaw.map((p) => ({ date: p.date, portfolioValue: Number(p.portfolioValue) }));

  const holdings: RiskHoldingInput[] = await Promise.all(
    overview.holdings.map(async (view) => {
      const [history, fundamentals, filings, negativeNews, nextEarnings] = await Promise.all([
        marketDataProvider.getHistoricalDaily(view.symbol, 60),
        marketDataProvider.getFundamentals(view.symbol),
        secFilingsProvider.getRecentFilings(view.symbol, 1),
        getStoredNews({ symbol: view.symbol, sinceHours: 24 * 7 }),
        prisma.earningsEvent.findFirst({ where: { symbol: view.symbol, isEstimate: true }, orderBy: { reportDate: 'asc' } }),
      ]);

      const daysSinceLastFiling = filings[0]
        ? Math.round((Date.now() - filings[0].filedAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const daysToNextEarnings = nextEarnings
        ? Math.round((nextEarnings.reportDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

      const negativeNewsCritical = negativeNews.filter(
        (n) => n.materialityLevel === 'CRITICAL' && n.sentiment !== null && n.sentiment < 0
      ).length;
      const negativeNewsHigh = negativeNews.filter(
        (n) => n.materialityLevel === 'HIGH' && n.sentiment !== null && n.sentiment < 0
      ).length;

      return { view, history, fundamentals, daysSinceLastFiling, daysToNextEarnings, negativeNewsCritical, negativeNewsHigh };
    })
  );

  const result = computeRisk({
    holdings,
    totalValue: overview.totalValue,
    cashBalance: overview.cashBalance,
    sp500History,
    portfolioHistory,
    quoteQualities: overview.holdings.map((h) => h.quoteQuality),
  });

  const previousComponents = previous
    ? {
        concentrationRisk: previous.concentrationRisk,
        sectorRisk: previous.sectorRisk,
        volatilityRisk: previous.volatilityRisk,
        betaRisk: previous.betaRisk,
        drawdownRisk: previous.drawdownRisk,
        valuationRisk: previous.valuationRisk,
        earningsRisk: previous.earningsRisk,
        regulatoryRisk: previous.regulatoryRisk,
        liquidityRisk: previous.liquidityRisk,
        macroRisk: previous.macroRisk,
        newsRisk: previous.newsRisk,
        stalenessRisk: previous.stalenessRisk,
      }
    : null;

  const notes = buildChangeNotes(result, previousComponents);

  const explanation = {
    concentrationRisk: result.concentrationRisk.explanation,
    sectorRisk: result.sectorRisk.explanation,
    volatilityRisk: result.volatilityRisk.explanation,
    betaRisk: result.betaRisk.explanation,
    drawdownRisk: result.drawdownRisk.explanation,
    valuationRisk: result.valuationRisk.explanation,
    earningsRisk: result.earningsRisk.explanation,
    regulatoryRisk: result.regulatoryRisk.explanation,
    liquidityRisk: result.liquidityRisk.explanation,
    macroRisk: result.macroRisk.explanation,
    newsRisk: result.newsRisk.explanation,
    stalenessRisk: result.stalenessRisk.explanation,
  };

  const dataSourcesMeta = {
    quoteQualities: overview.holdings.map((h) => ({ symbol: h.symbol, quality: h.quoteQuality, asOf: h.quoteAsOf.toISOString() })),
    sp500HistoryPoints: sp500History.length,
    portfolioSnapshotPoints: portfolioHistory.length,
    generatedAt: new Date().toISOString(),
  };

  await prisma.riskAssessment.create({
    data: {
      concentrationRisk: result.concentrationRisk.score,
      sectorRisk: result.sectorRisk.score,
      volatilityRisk: result.volatilityRisk.score,
      betaRisk: result.betaRisk.score,
      drawdownRisk: result.drawdownRisk.score,
      valuationRisk: result.valuationRisk.score,
      earningsRisk: result.earningsRisk.score,
      regulatoryRisk: result.regulatoryRisk.score,
      liquidityRisk: result.liquidityRisk.score,
      macroRisk: result.macroRisk.score,
      newsRisk: result.newsRisk.score,
      stalenessRisk: result.stalenessRisk.score,
      overallScore: result.overallScore,
      previousScore: previous?.overallScore ?? null,
      inputs: JSON.parse(JSON.stringify(result.inputs)),
      explanation,
      dataSourcesMeta,
      notes,
    },
  });

  await raiseRiskAlerts(result, previous?.overallScore ?? null);

  return { skipped: false, overallScore: result.overallScore, previousScore: previous?.overallScore ?? null };
}

/** No noise on routine price moves — every alert here is gated on a
 * deliberately conservative threshold, and deduped per-day via dedupeKey. */
async function raiseRiskAlerts(result: RiskResult, previousOverallScore: number | null): Promise<void> {
  const day = todayKey();
  const concentration = result.inputs.concentration as { top1Pct: number } | undefined;
  const drawdown = result.inputs.drawdown as { maxDrawdownPct: number | null } | undefined;

  if (concentration && concentration.top1Pct >= 30) {
    await createAlertIfNew({
      type: 'CONCENTRATION_RISK',
      severity: concentration.top1Pct >= 45 ? 'URGENT' : 'WATCH',
      message: `Largest position is ${concentration.top1Pct.toFixed(1)}% of the portfolio.`,
      confidenceScore: 9,
      dedupeKey: `concentration:${day}`,
    });
  }

  if (previousOverallScore !== null && result.overallScore - previousOverallScore >= 15) {
    await createAlertIfNew({
      type: 'RISK_SCORE_INCREASE',
      severity: 'WATCH',
      message: `Portfolio risk score rose from ${previousOverallScore} to ${result.overallScore}.`,
      evidence: result.overallScore >= previousOverallScore ? buildRiseEvidence(result) : undefined,
      confidenceScore: 8,
      dedupeKey: `risk-increase:${day}`,
    });
  }

  if (drawdown?.maxDrawdownPct !== null && drawdown?.maxDrawdownPct !== undefined && drawdown.maxDrawdownPct >= 0.1) {
    await createAlertIfNew({
      type: 'DRAWDOWN_10PCT',
      severity: drawdown.maxDrawdownPct >= 0.2 ? 'URGENT' : 'WATCH',
      message: `Portfolio drawdown of ${(drawdown.maxDrawdownPct * 100).toFixed(1)}%.`,
      confidenceScore: 8,
      dedupeKey: `drawdown:${day}`,
    });
  }

  if (result.stalenessRisk.score >= 70) {
    await createAlertIfNew({
      type: 'STALE_DATA',
      severity: 'WATCH',
      message: result.stalenessRisk.explanation,
      confidenceScore: 7,
      dedupeKey: `stale-data:${day}`,
    });
  }

  // UPCOMING_EARNINGS is raised from the real forward calendar in
  // lib/jobs/ingestEarnings.ts (a specific report date, not a filing-cadence
  // proxy) — not duplicated here.
}

function buildRiseEvidence(result: RiskResult): string {
  return JSON.stringify(
    Object.entries(result).filter(([k]) => k.endsWith('Risk')).map(([k, v]) => ({ [k]: (v as { score: number }).score }))
  );
}
