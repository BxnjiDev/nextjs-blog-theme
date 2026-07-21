'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { formatCurrency, formatPercent } from '@/lib/format';
import DataQualityBadge from '../DataQualityBadge';
import type { HoldingView } from '@/lib/domain/portfolio';

/**
 * Split out of the Portfolio page purely so the row entrance can use
 * framer-motion (motion.tr) — a plain <table> mapped in a Server Component
 * can't animate per-row without this client boundary. Formatting helpers
 * are imported directly (not passed as props) since importing a module is
 * fine across the Server/Client boundary; only passing a *function value*
 * as a prop is not.
 */
export default function HoldingsTable({ holdings }: { holdings: HoldingView[] }) {
  if (holdings.length === 0) {
    return <p className="py-8 text-sm text-atlas-text-tertiary">No holdings yet — cash only.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead className="border-b border-atlas-border-subtle text-left text-[11px] uppercase tracking-wide text-atlas-text-tertiary">
        <tr>
          <th className="py-3 pr-4 font-medium">Symbol</th>
          <th className="py-3 pr-4 font-medium">Qty</th>
          <th className="py-3 pr-4 font-medium">Price</th>
          <th className="py-3 pr-4 font-medium">Day</th>
          <th className="py-3 pr-4 font-medium">Market value</th>
          <th className="py-3 pr-4 font-medium">Unrealized P&amp;L</th>
          <th className="py-3 font-medium">Data</th>
        </tr>
      </thead>
      <tbody>
        {holdings.map((h, i) => (
          <motion.tr
            key={h.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
            className="group border-b border-atlas-border-subtle/60 text-atlas-text transition-colors hover:bg-atlas-surface-hover"
          >
            <td className="py-3 pr-4 font-medium">
              <Link href={`/holdings#${h.symbol}`} className="transition-colors group-hover:text-atlas-accent-bright">
                {h.symbol}
              </Link>
            </td>
            <td className="py-3 pr-4 font-mono text-atlas-text-secondary">{h.quantity}</td>
            <td className="py-3 pr-4 font-mono text-atlas-text-secondary">{formatCurrency(h.currentPrice)}</td>
            <td className={`py-3 pr-4 font-mono ${h.changePercent >= 0 ? 'text-risk-low' : 'text-risk-high'}`}>
              {formatPercent(h.changePercent)}
            </td>
            <td className="py-3 pr-4 font-mono">{formatCurrency(h.marketValue)}</td>
            <td className={`py-3 pr-4 font-mono ${h.unrealizedPnl >= 0 ? 'text-risk-low' : 'text-risk-high'}`}>
              {formatCurrency(h.unrealizedPnl)} ({formatPercent(h.unrealizedPnlPercent * 100)})
            </td>
            <td className="py-3">
              <DataQualityBadge quality={h.quoteQuality} asOf={h.quoteAsOf} />
            </td>
          </motion.tr>
        ))}
      </tbody>
    </table>
  );
}
