import Link from 'next/link';
import ConfidenceMeter from './intelligence/ConfidenceMeter';

export interface RecommendationCardData {
  id: string;
  symbol: string;
  action: string;
  confidenceScore: number;
  thesis: string;
  bullCase?: string;
  bearCase?: string;
  proposedDollarAmount?: number | null;
  percentageOfPortfolio?: number | null;
  convictionScore?: number | null;
  dataQualityStatus?: string | null;
}

const DIRECTIVE_STYLES: Record<string, string> = {
  BUY_MORE: 'border-atlas-emerald/30 text-atlas-emerald',
  HOLD: 'border-atlas-border text-atlas-text-secondary',
  REDUCE: 'border-atlas-warning/30 text-atlas-warning',
  SELL: 'border-risk-high/30 text-risk-high',
  WATCH: 'border-atlas-cyan/30 text-atlas-cyan',
};

const DIRECTIVE_LABELS: Record<string, string> = {
  BUY_MORE: 'Buy more',
  HOLD: 'Hold',
  REDUCE: 'Reduce',
  SELL: 'Sell',
  WATCH: 'Watch closely',
};

const DATA_QUALITY_STYLES: Record<string, string> = {
  PASS: 'text-risk-low',
  PASS_WITH_WARNINGS: 'text-risk-medium',
  BLOCKED: 'text-risk-high',
};

/**
 * The recommendation-as-mission-briefing card used on Home, in Atlas Chat
 * (when the assistant surfaces a specific recommendation), and the
 * Recommendations list. Always links through to /recommendations/[id] —
 * the full Investment Memo, evidence, related news, and history live
 * there, not duplicated here.
 */
export default function RecommendationCard({ data, compact = false }: { data: RecommendationCardData; compact?: boolean }) {
  return (
    <Link
      href={`/recommendations/${data.id}`}
      className="atlas-glass atlas-hover-glow block rounded-xl p-4 transition-[border-color,box-shadow,transform] duration-300"
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <span className="text-xl font-semibold tracking-tight text-atlas-text">{data.symbol}</span>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${DIRECTIVE_STYLES[data.action] ?? DIRECTIVE_STYLES.HOLD}`}
        >
          {DIRECTIVE_LABELS[data.action] ?? data.action}
        </span>
      </div>

      {!compact && <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-atlas-text-secondary">{data.thesis}</p>}

      <ConfidenceMeter score={data.confidenceScore} max={10} label="Confidence" />

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-atlas-text-tertiary">
        {typeof data.convictionScore === 'number' && <span className="font-mono">Conviction {data.convictionScore}/100</span>}
        {data.proposedDollarAmount != null && (
          <span className="font-mono">
            ${Number(data.proposedDollarAmount).toFixed(0)}
            {data.percentageOfPortfolio != null ? ` (${data.percentageOfPortfolio.toFixed(1)}%)` : ''}
          </span>
        )}
        {data.dataQualityStatus && (
          <span className={`font-medium ${DATA_QUALITY_STYLES[data.dataQualityStatus] ?? ''}`}>
            {data.dataQualityStatus.replace(/_/g, ' ')}
          </span>
        )}
      </div>
    </Link>
  );
}
