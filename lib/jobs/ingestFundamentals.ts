import { prisma } from '@/lib/prisma';
import { fundamentalsProvider } from '@/lib/integrations';

/** Valuation moves with price so it's refreshed often; ownership/shares data
 * changes far less frequently (roughly quarterly in reality), so it's
 * gated on a much longer freshness window to avoid pointless duplicate rows. */
const VALUATION_REFRESH_HOURS = 20;
const OWNERSHIP_REFRESH_HOURS = 24 * 7;

export interface FundamentalsIngestResult {
  symbolsProcessed: number;
  statementsUpserted: number;
  valuationSnapshotsCreated: number;
  valuationSnapshotsSkipped: number;
  ownershipSnapshotsCreated: number;
  ownershipSnapshotsSkipped: number;
  errors: { symbol: string; error: string }[];
}

/**
 * Pulls historical financial statements, valuation multiples, and ownership
 * data per holding from the fundamentals provider (Financial Modeling Prep,
 * or the mock fallback) and persists them. Statement periods are upserted by
 * their natural key (symbol, periodType, fiscalYear, fiscalPeriod) — a
 * restatement updates the same row rather than duplicating it. Valuation and
 * ownership are genuine time series (append-only) but freshness-gated so a
 * frequent cron firing doesn't spam near-identical rows.
 */
export async function runFundamentalsIngestJob(options?: { force?: boolean }): Promise<FundamentalsIngestResult> {
  const result: FundamentalsIngestResult = {
    symbolsProcessed: 0,
    statementsUpserted: 0,
    valuationSnapshotsCreated: 0,
    valuationSnapshotsSkipped: 0,
    ownershipSnapshotsCreated: 0,
    ownershipSnapshotsSkipped: 0,
    errors: [],
  };

  const account = await prisma.account.findFirst({ include: { holdings: true }, orderBy: { createdAt: 'asc' } });
  if (!account) return result;

  for (const holding of account.holdings) {
    try {
      const statements = await fundamentalsProvider.getFinancialStatements(holding.symbol, 8);
      for (const s of statements) {
        await prisma.fundamentalSnapshot.upsert({
          where: {
            symbol_periodType_fiscalYear_fiscalPeriod: {
              symbol: s.symbol,
              periodType: s.periodType,
              fiscalYear: s.fiscalYear,
              fiscalPeriod: s.fiscalPeriod,
            },
          },
          update: {
            reportDate: s.reportDate,
            income: JSON.parse(JSON.stringify(s.income)),
            balance: JSON.parse(JSON.stringify(s.balance)),
            cashFlow: JSON.parse(JSON.stringify(s.cashFlow)),
            ...s.metrics,
            quality: s.quality,
            source: s.quality === 'mock' ? 'mock' : 'financialmodelingprep',
          },
          create: {
            symbol: s.symbol,
            periodType: s.periodType,
            fiscalYear: s.fiscalYear,
            fiscalPeriod: s.fiscalPeriod,
            reportDate: s.reportDate,
            income: JSON.parse(JSON.stringify(s.income)),
            balance: JSON.parse(JSON.stringify(s.balance)),
            cashFlow: JSON.parse(JSON.stringify(s.cashFlow)),
            ...s.metrics,
            quality: s.quality,
            source: s.quality === 'mock' ? 'mock' : 'financialmodelingprep',
          },
        });
        result.statementsUpserted++;
      }

      const lastValuation = await prisma.valuationSnapshot.findFirst({ where: { symbol: holding.symbol }, orderBy: { asOf: 'desc' } });
      const valuationAgeHours = lastValuation ? (Date.now() - lastValuation.asOf.getTime()) / (1000 * 60 * 60) : Infinity;
      if (options?.force || valuationAgeHours >= VALUATION_REFRESH_HOURS) {
        const valuation = await fundamentalsProvider.getValuationMetrics(holding.symbol);
        if (valuation) {
          await prisma.valuationSnapshot.create({
            data: {
              symbol: valuation.symbol,
              peRatio: valuation.peRatio,
              forwardPe: valuation.forwardPe,
              peg: valuation.peg,
              evToEbitda: valuation.evToEbitda,
              evToSales: valuation.evToSales,
              priceToBook: valuation.priceToBook,
              priceToFcf: valuation.priceToFcf,
              quality: valuation.quality,
              asOf: valuation.asOf,
            },
          });
          result.valuationSnapshotsCreated++;
        }
      } else {
        result.valuationSnapshotsSkipped++;
      }

      const lastOwnership = await prisma.ownershipSnapshot.findFirst({ where: { symbol: holding.symbol }, orderBy: { asOf: 'desc' } });
      const ownershipAgeHours = lastOwnership ? (Date.now() - lastOwnership.asOf.getTime()) / (1000 * 60 * 60) : Infinity;
      if (options?.force || ownershipAgeHours >= OWNERSHIP_REFRESH_HOURS) {
        const ownership = await fundamentalsProvider.getOwnership(holding.symbol);
        if (ownership) {
          await prisma.ownershipSnapshot.create({
            data: {
              symbol: ownership.symbol,
              insiderOwnershipPct: ownership.insiderOwnershipPct,
              institutionalOwnershipPct: ownership.institutionalOwnershipPct,
              sharesOutstanding: ownership.sharesOutstanding,
              sharesOutstandingChangePct: ownership.sharesOutstandingChangePct,
              dividendPerShare: ownership.dividendPerShare,
              dividendYield: ownership.dividendYield,
              quality: ownership.quality,
              asOf: ownership.asOf,
            },
          });
          result.ownershipSnapshotsCreated++;
        }
      } else {
        result.ownershipSnapshotsSkipped++;
      }

      result.symbolsProcessed++;
    } catch (err) {
      result.errors.push({ symbol: holding.symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
