export const dynamic = 'force-dynamic';

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        ok ? 'bg-risk-low/10 text-risk-low' : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
      }`}
    >
      {label}
    </span>
  );
}

export default function ConnectionsPage() {
  const hasMarketDataKey = Boolean(process.env.MARKET_DATA_API_KEY);
  const hasNewsKey = Boolean(process.env.NEWS_API_KEY);
  const hasEdgarUserAgent = Boolean(process.env.SEC_EDGAR_USER_AGENT);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Connections</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          What Atlas is actually reading data from right now, versus placeholders.
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Robinhood Agentic Trading (brokerage + execution)</h2>
            <StatusPill ok={false} label="Not connected in this app" />
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            This is an MCP connector, not an API key stored by this app. Connect it to the agent
            session driving Atlas with:
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-900">
            claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading
          </pre>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Once connected, the agent can read the account and preview/place orders; this
            app&rsquo;s role is to persist what the agent reports via{' '}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">lib/integrations/robinhood.ts</code>.
            All order placement stays MANUAL_APPROVAL until explicitly changed per account.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Market data (quotes, technicals)</h2>
            <StatusPill ok={hasMarketDataKey} label={hasMarketDataKey ? 'Key configured' : 'Mock data'} />
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Set <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">MARKET_DATA_API_KEY</code> and
            implement a real provider in{' '}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">lib/integrations/marketData.ts</code>.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Financial news</h2>
            <StatusPill ok={hasNewsKey} label={hasNewsKey ? 'Key configured' : 'Mock data (empty feed)'} />
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Set <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">NEWS_API_KEY</code> and implement a
            real provider in <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">lib/integrations/news.ts</code>.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">SEC EDGAR filings</h2>
            <StatusPill ok={true} label="Live (public API)" />
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Already implemented against the real public EDGAR API — no key required, just a
            contact User-Agent.{' '}
            {hasEdgarUserAgent ? 'A custom User-Agent is configured.' : 'Set SEC_EDGAR_USER_AGENT with a real contact email before relying on this in production.'}
          </p>
        </div>
      </div>
    </div>
  );
}
