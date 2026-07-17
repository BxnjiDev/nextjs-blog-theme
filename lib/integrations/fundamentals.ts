import type {
  FundamentalsProvider,
  FinancialStatementData,
  ValuationMetrics,
  OwnershipData,
  EarningsEventData,
  StatementPeriod,
  DataQuality,
} from './types';
import { timedProviderCall } from './retry';

const FMP_BASE = 'https://financialmodelingprep.com/api';

function hashSymbol(symbol: string): number {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return h;
}

function fiscalPeriodLabel(quarter: number): string {
  return `Q${quarter}`;
}

/**
 * MOCK implementation. Produces a deterministic, clearly-fake multi-quarter
 * history so the fundamentals-dependent UI (conviction category breakdown,
 * financial-trend charts) is exercisable without a vendor key. Every row is
 * tagged `quality: 'mock'` / `source: 'mock'`.
 */
class MockFundamentalsProvider implements FundamentalsProvider {
  async getFinancialStatements(symbol: string, periods = 8): Promise<FinancialStatementData[]> {
    const seed = hashSymbol(symbol);
    const baseRevenue = 500_000_000 + (seed % 20) * 250_000_000;
    const out: FinancialStatementData[] = [];
    const now = new Date();
    for (let i = 0; i < periods; i++) {
      const quarter = ((now.getMonth() / 3) | 0) - i;
      const yearOffset = Math.floor(quarter / 4);
      const q = ((quarter % 4) + 4) % 4;
      const fiscalYear = now.getFullYear() + (quarter < 0 ? yearOffset - (q === 0 ? 0 : 1) : yearOffset);
      const growthWobble = Math.sin((seed + i) / 4) * 0.08;
      const revenue = baseRevenue * (1 + growthWobble) * (1 + (periods - i) * 0.015);
      const grossMargin = 0.45 + ((seed % 30) / 100);
      const netMargin = 0.12 + ((seed % 15) / 100);
      const reportDate = new Date(now);
      reportDate.setMonth(reportDate.getMonth() - i * 3);

      out.push({
        symbol,
        periodType: 'QUARTERLY',
        fiscalYear,
        fiscalPeriod: fiscalPeriodLabel(q + 1),
        reportDate,
        income: { revenue, grossProfit: revenue * grossMargin, netIncome: revenue * netMargin },
        balance: { totalDebt: revenue * 0.6, cash: revenue * 0.35, totalStockholdersEquity: revenue * 1.8 },
        cashFlow: { operatingCashFlow: revenue * 0.25, freeCashFlow: revenue * 0.18 },
        metrics: {
          revenue,
          revenueGrowth: i < periods - 1 ? growthWobble + 0.06 : null,
          grossMargin,
          operatingMargin: grossMargin - 0.15,
          netMargin,
          freeCashFlow: revenue * 0.18,
          eps: 1 + ((seed + i) % 20) / 10,
          epsGrowth: growthWobble + 0.05,
          roe: 0.15 + ((seed % 10) / 100),
          roic: 0.12 + ((seed % 8) / 100),
          debtToEquity: 0.3 + ((seed % 10) / 20),
          currentRatio: 1.2 + ((seed % 10) / 10),
          cash: revenue * 0.35,
          totalDebt: revenue * 0.6,
        },
        quality: 'mock',
      });
    }
    return out;
  }

  async getValuationMetrics(symbol: string): Promise<ValuationMetrics | null> {
    const seed = hashSymbol(symbol);
    return {
      symbol,
      peRatio: 10 + (seed % 40),
      forwardPe: 9 + (seed % 35),
      peg: 1 + (seed % 20) / 10,
      evToEbitda: 8 + (seed % 20),
      evToSales: 2 + (seed % 10),
      priceToBook: 2 + (seed % 15) / 2,
      priceToFcf: 15 + (seed % 25),
      asOf: new Date(),
      quality: 'mock',
    };
  }

  async getOwnership(symbol: string): Promise<OwnershipData | null> {
    const seed = hashSymbol(symbol);
    return {
      symbol,
      insiderOwnershipPct: (seed % 15) / 10,
      institutionalOwnershipPct: 50 + (seed % 40),
      sharesOutstanding: 1_000_000_000 + seed * 1000,
      sharesOutstandingChangePct: ((seed % 21) - 10) / 100, // -10%..+10%, negative = buybacks
      dividendPerShare: (seed % 3) / 2,
      dividendYield: (seed % 3) / 100,
      asOf: new Date(),
      quality: 'mock',
    };
  }

  async getEarningsCalendar(symbol: string): Promise<EarningsEventData[]> {
    const seed = hashSymbol(symbol);
    const now = new Date();
    const events: EarningsEventData[] = [];
    // One upcoming estimate, ~ (seed % 80) days out.
    const nextReport = new Date(now);
    nextReport.setDate(nextReport.getDate() + (10 + (seed % 80)));
    events.push({
      symbol,
      fiscalYear: nextReport.getFullYear(),
      fiscalPeriod: fiscalPeriodLabel((((nextReport.getMonth() / 3) | 0) % 4) + 1),
      reportDate: nextReport,
      isEstimate: true,
      epsEstimate: 1 + (seed % 20) / 10,
      epsActual: null,
      revenueEstimate: 500_000_000 + (seed % 20) * 250_000_000,
      revenueActual: null,
      guidanceNote: null,
      callDate: nextReport,
    });
    // A couple of historical actuals.
    for (let i = 1; i <= 2; i++) {
      const past = new Date(now);
      past.setDate(past.getDate() - i * 90);
      const epsEstimate = 1 + ((seed + i) % 20) / 10;
      const surprise = Math.sin(seed + i) * 0.1;
      events.push({
        symbol,
        fiscalYear: past.getFullYear(),
        fiscalPeriod: fiscalPeriodLabel((((past.getMonth() / 3) | 0) % 4) + 1),
        reportDate: past,
        isEstimate: false,
        epsEstimate,
        epsActual: epsEstimate * (1 + surprise),
        revenueEstimate: 480_000_000 + ((seed + i) % 20) * 250_000_000,
        revenueActual: 480_000_000 + ((seed + i) % 20) * 250_000_000 * (1 + surprise),
        guidanceNote: null,
        callDate: past,
      });
    }
    return events;
  }
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function ratioOrNull(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function fmpPeriodToLabel(period: unknown): { periodType: StatementPeriod; fiscalPeriod: string } {
  const p = String(period ?? '').toUpperCase();
  if (p === 'FY' || p === 'ANNUAL') return { periodType: 'ANNUAL', fiscalPeriod: 'FY' };
  return { periodType: 'QUARTERLY', fiscalPeriod: p || 'Q1' };
}

/**
 * REAL implementation backed by Financial Modeling Prep
 * (https://financialmodelingprep.com). Every field is independently
 * null-checked — FMP's field availability varies by plan/symbol, and a
 * missing metric is left null rather than estimated. See ARCHITECTURE.md
 * for why FMP was chosen over Finnhub/Polygon/Alpha Vantage/Tiingo.
 */
class FinancialModelingPrepProvider implements FundamentalsProvider {
  constructor(private readonly apiKey: string) {}

  private async request<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${FMP_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('apikey', this.apiKey);

    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`FMP error at ${path}: ${res.statusText}`);
    }
    return data as T;
  }

  async getFinancialStatements(symbol: string, periods = 8): Promise<FinancialStatementData[]> {
    const params = { period: 'quarter', limit: String(periods) };
    const [income, balance, cashFlow, ratios, keyMetrics] = await Promise.all([
      this.request<Array<Record<string, unknown>>>(`/v3/income-statement/${symbol}`, params).catch(() => []),
      this.request<Array<Record<string, unknown>>>(`/v3/balance-sheet-statement/${symbol}`, params).catch(() => []),
      this.request<Array<Record<string, unknown>>>(`/v3/cash-flow-statement/${symbol}`, params).catch(() => []),
      this.request<Array<Record<string, unknown>>>(`/v3/ratios/${symbol}`, params).catch(() => []),
      this.request<Array<Record<string, unknown>>>(`/v3/key-metrics/${symbol}`, params).catch(() => []),
    ]);

    const byDate = <T extends Record<string, unknown>>(rows: T[]) => new Map(rows.map((r) => [String(r.date), r]));
    const balanceByDate = byDate(balance);
    const cashFlowByDate = byDate(cashFlow);
    const ratiosByDate = byDate(ratios);
    const metricsByDate = byDate(keyMetrics);

    return income.map((inc, i): FinancialStatementData => {
      const date = String(inc.date);
      const bal = balanceByDate.get(date) ?? {};
      const cf = cashFlowByDate.get(date) ?? {};
      const rat = ratiosByDate.get(date) ?? {};
      const km = metricsByDate.get(date) ?? {};
      const { periodType, fiscalPeriod } = fmpPeriodToLabel(inc.period);

      const revenue = numberOrNull(inc.revenue);
      const prevRevenue = numberOrNull(income[i + 4]?.revenue); // 4 quarters back = YoY
      const eps = numberOrNull(inc.epsdiluted ?? inc.eps);
      const prevEps = numberOrNull(income[i + 4]?.epsdiluted ?? income[i + 4]?.eps);
      const freeCashFlow = numberOrNull(cf.freeCashFlow);

      return {
        symbol,
        periodType,
        fiscalYear: Number(inc.calendarYear ?? new Date(date).getFullYear()),
        fiscalPeriod,
        reportDate: new Date(date),
        income: {
          revenue,
          grossProfit: numberOrNull(inc.grossProfit),
          operatingIncome: numberOrNull(inc.operatingIncome),
          netIncome: numberOrNull(inc.netIncome),
        },
        balance: {
          totalDebt: numberOrNull(bal.totalDebt),
          cash: numberOrNull(bal.cashAndCashEquivalents),
          totalCurrentAssets: numberOrNull(bal.totalCurrentAssets),
          totalCurrentLiabilities: numberOrNull(bal.totalCurrentLiabilities),
          totalStockholdersEquity: numberOrNull(bal.totalStockholdersEquity),
        },
        cashFlow: {
          operatingCashFlow: numberOrNull(cf.operatingCashFlow),
          capitalExpenditure: numberOrNull(cf.capitalExpenditure),
          freeCashFlow,
        },
        metrics: {
          revenue,
          revenueGrowth: revenue !== null ? ratioOrNull(revenue - (prevRevenue ?? revenue), prevRevenue) : null,
          grossMargin: numberOrNull(inc.grossProfitRatio),
          operatingMargin: numberOrNull(inc.operatingIncomeRatio),
          netMargin: numberOrNull(inc.netIncomeRatio),
          freeCashFlow,
          eps,
          epsGrowth: eps !== null ? ratioOrNull(eps - (prevEps ?? eps), prevEps) : null,
          roe: numberOrNull(rat.returnOnEquity),
          roic: numberOrNull(km.roic),
          debtToEquity: numberOrNull(rat.debtEquityRatio),
          currentRatio: numberOrNull(rat.currentRatio),
          cash: numberOrNull(bal.cashAndCashEquivalents),
          totalDebt: numberOrNull(bal.totalDebt),
        },
        quality: 'delayed',
      };
    });
  }

  async getValuationMetrics(symbol: string): Promise<ValuationMetrics | null> {
    try {
      const [ratios, keyMetrics] = await Promise.all([
        this.request<Array<Record<string, unknown>>>(`/v3/ratios-ttm/${symbol}`).catch(() => []),
        this.request<Array<Record<string, unknown>>>(`/v3/key-metrics-ttm/${symbol}`).catch(() => []),
      ]);
      const r = ratios[0] ?? {};
      const km = keyMetrics[0] ?? {};
      if (!ratios.length && !keyMetrics.length) return null;

      return {
        symbol,
        peRatio: numberOrNull(r.peRatioTTM),
        forwardPe: null, // FMP doesn't expose a clean forward-P/E on this tier; left null rather than approximated from trailing.
        peg: numberOrNull(r.pegRatioTTM),
        evToEbitda: numberOrNull(km.enterpriseValueOverEBITDATTM),
        evToSales: numberOrNull(km.evToSalesTTM),
        priceToBook: numberOrNull(r.priceToBookRatioTTM),
        priceToFcf: numberOrNull(r.priceToFreeCashFlowsRatioTTM),
        asOf: new Date(),
        quality: 'delayed',
      };
    } catch (err) {
      console.error(`FMP valuation metrics failed for ${symbol}:`, err);
      return null;
    }
  }

  async getOwnership(symbol: string): Promise<OwnershipData | null> {
    try {
      const [enterpriseValues, institutionalOwnership] = await Promise.all([
        this.request<Array<Record<string, unknown>>>(`/v3/enterprise-values/${symbol}`, { period: 'quarter', limit: '2' }).catch(() => []),
        this.request<Array<Record<string, unknown>>>(`/v4/institutional-ownership/symbol-ownership`, { symbol, includeCurrentQuarter: 'false' }).catch(() => []),
      ]);
      if (!enterpriseValues.length && !institutionalOwnership.length) return null;

      const shares = numberOrNull(enterpriseValues[0]?.numberOfShares);
      const prevShares = numberOrNull(enterpriseValues[1]?.numberOfShares);
      const io = institutionalOwnership[0] ?? {};

      return {
        symbol,
        // FMP's free/lower tiers don't expose a clean insider-ownership %
        // endpoint — left null (never guessed) rather than approximated.
        insiderOwnershipPct: null,
        institutionalOwnershipPct: numberOrNull(io.ownershipPercent),
        sharesOutstanding: shares,
        sharesOutstandingChangePct: shares !== null ? ratioOrNull(shares - (prevShares ?? shares), prevShares) : null,
        dividendPerShare: null,
        dividendYield: null,
        asOf: new Date(),
        quality: 'delayed',
      };
    } catch (err) {
      console.error(`FMP ownership data failed for ${symbol}:`, err);
      return null;
    }
  }

  async getEarningsCalendar(symbol: string): Promise<EarningsEventData[]> {
    try {
      const rows = await this.request<Array<Record<string, unknown>>>(`/v3/historical/earning_calendar/${symbol}`);
      const now = Date.now();
      return rows.map((row): EarningsEventData => {
        const reportDate = new Date(String(row.date));
        const isEstimate = reportDate.getTime() > now || row.eps === null || row.eps === undefined;
        const q = Math.floor(reportDate.getMonth() / 3) + 1;
        return {
          symbol,
          fiscalYear: reportDate.getFullYear(),
          fiscalPeriod: `Q${q}`,
          reportDate,
          isEstimate,
          epsEstimate: numberOrNull(row.epsEstimated),
          epsActual: isEstimate ? null : numberOrNull(row.eps),
          revenueEstimate: numberOrNull(row.revenueEstimated),
          revenueActual: isEstimate ? null : numberOrNull(row.revenue),
          guidanceNote: null,
          callDate: reportDate,
        };
      });
    } catch (err) {
      console.error(`FMP earnings calendar failed for ${symbol}:`, err);
      return [];
    }
  }
}

/** Per-call fallback to mock data, same pattern as marketData.ts. */
class FallbackFundamentalsProvider implements FundamentalsProvider {
  constructor(
    private readonly real: FundamentalsProvider,
    private readonly mock: FundamentalsProvider
  ) {}

  private async attempt<T>(operation: string, real: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await timedProviderCall('financialmodelingprep', operation, real);
    } catch (err) {
      console.error(`Fundamentals provider call failed (${operation}); falling back to mock data:`, err);
      return timedProviderCall('financialmodelingprep', operation, fallback, undefined, 'FALLBACK');
    }
  }

  getFinancialStatements(symbol: string, periods?: number) {
    return this.attempt(
      'getFinancialStatements',
      () => this.real.getFinancialStatements(symbol, periods),
      () => this.mock.getFinancialStatements(symbol, periods)
    );
  }
  getValuationMetrics(symbol: string) {
    return this.attempt('getValuationMetrics', () => this.real.getValuationMetrics(symbol), () => this.mock.getValuationMetrics(symbol));
  }
  getOwnership(symbol: string) {
    return this.attempt('getOwnership', () => this.real.getOwnership(symbol), () => this.mock.getOwnership(symbol));
  }
  getEarningsCalendar(symbol: string) {
    return this.attempt('getEarningsCalendar', () => this.real.getEarningsCalendar(symbol), () => this.mock.getEarningsCalendar(symbol));
  }
}

const mockFundamentalsProvider = new MockFundamentalsProvider();

export const fundamentalsProvider: FundamentalsProvider = process.env.FUNDAMENTALS_API_KEY
  ? new FallbackFundamentalsProvider(new FinancialModelingPrepProvider(process.env.FUNDAMENTALS_API_KEY), mockFundamentalsProvider)
  : mockFundamentalsProvider;

/** Bypasses the Fallback wrapper for a real auth check — see
 * checkTwelveDataAuth in marketData.ts for why. */
export async function checkFmpAuth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const apiKey = process.env.FUNDAMENTALS_API_KEY;
  if (!apiKey) return { ok: false, latencyMs: 0, error: 'FUNDAMENTALS_API_KEY is not set' };
  const start = Date.now();
  try {
    await new FinancialModelingPrepProvider(apiKey).getValuationMetrics('AAPL');
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

export type { DataQuality };
