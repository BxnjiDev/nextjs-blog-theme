import type { SecFilingsProvider, SecFiling } from './types';
import { timedProviderCall } from './retry';

/**
 * REAL implementation — SEC EDGAR's submissions API is public and requires
 * no API key, only a descriptive User-Agent (SEC fair-access policy: see
 * https://www.sec.gov/os/webmaster-faq#developers). Unlike market data and
 * news, there's no reason to mock this one.
 *
 * Retries transient failures (via timedProviderCall/withRetry, logging to
 * ProviderCallLog) before failing soft (returns []) on any network/parse
 * error rather than throwing, so a flaky outbound connection degrades the
 * dashboard instead of crashing it — but note this means "no filings" and
 * "fetch failed" currently look the same to the caller. Revisit if that
 * distinction matters later.
 */
class EdgarSecFilingsProvider implements SecFilingsProvider {
  private cikCache = new Map<string, string>();

  private userAgent(): string {
    const configured = process.env.SEC_EDGAR_USER_AGENT;
    if (!configured) {
      console.warn(
        'SEC_EDGAR_USER_AGENT is not set. SEC requests fair-access contact info; set it in .env.'
      );
    }
    return configured || 'Atlas Portfolio Agent (set SEC_EDGAR_USER_AGENT in .env)';
  }

  private async lookupCik(symbol: string): Promise<string | null> {
    const cached = this.cikCache.get(symbol);
    if (cached) return cached;

    const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': this.userAgent() },
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as Record<
      string,
      { cik_str: number; ticker: string; title: string }
    >;
    for (const entry of Object.values(data)) {
      const cik = String(entry.cik_str).padStart(10, '0');
      this.cikCache.set(entry.ticker.toUpperCase(), cik);
    }
    return this.cikCache.get(symbol.toUpperCase()) ?? null;
  }

  async getRecentFilings(symbol: string, limit = 5): Promise<SecFiling[]> {
    try {
      return await timedProviderCall('sec-edgar', 'getRecentFilings', () => this.fetchRecentFilings(symbol, limit));
    } catch (err) {
      console.error(`SEC EDGAR fetch failed for ${symbol}:`, err);
      return [];
    }
  }

  private async fetchRecentFilings(symbol: string, limit: number): Promise<SecFiling[]> {
    const cik = await this.lookupCik(symbol);
    if (!cik) return [];

    const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: { 'User-Agent': this.userAgent() },
      next: { revalidate: 60 * 60 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const recent = data?.filings?.recent;
    if (!recent) return [];

    const count = Math.min(limit, recent.form?.length ?? 0);
    const filings: SecFiling[] = [];
    for (let i = 0; i < count; i++) {
      filings.push({
        symbol,
        formType: recent.form[i],
        filedAt: new Date(recent.filingDate[i]),
        url: `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${recent.accessionNumber[i].replace(/-/g, '')}/${recent.primaryDocument[i]}`,
      });
    }
    return filings;
  }
}

export const secFilingsProvider: SecFilingsProvider = new EdgarSecFilingsProvider();
