import Link from 'next/link';
import ActionBadge from './ActionBadge';
import ConfidenceBadge from './ConfidenceBadge';

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

const DATA_QUALITY_STYLES: Record<string, string> = {
  PASS: 'bg-risk-low/10 text-risk-low',
  PASS_WITH_WARNINGS: 'bg-risk-medium/10 text-risk-medium',
  BLOCKED: 'bg-risk-high/10 text-risk-high',
};

/**
 * The recommendation-as-research-note card used on Home, in Atlas Chat
 * (when the assistant surfaces a specific recommendation), and anywhere
 * else a recommendation needs to look like more than plain text. Always
 * links through to /recommendations/[id] — the full Investment Memo,
 * evidence, related news, and history live there, not duplicated here.
 */
export default function RecommendationCard({ data, compact = false }: { data: RecommendationCardData; compact?: boolean }) {
  return (
    <Link
      href={`/recommendations/${data.id}`}
      className="block rounded-xl border border-atlas-border bg-atlas-surface p-4 transition-colors hover:border-atlas-accent/40 hover:bg-atlas-surface-hover"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-base font-semibold text-atlas-text">{data.symbol}</span>
        <div className="flex items-center gap-1.5">
          <ActionBadge action={data.action} />
          <ConfidenceBadge score={data.confidenceScore} />
        </div>
      </div>

      {!compact && (
        <p className="mb-3 line-clamp-2 text-sm text-atlas-text-secondary">{data.thesis}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-atlas-text-tertiary">
        {typeof data.convictionScore === 'number' && <span>Conviction {data.convictionScore}/100</span>}
        {data.proposedDollarAmount != null && (
          <span>
            Proposed ${Number(data.proposedDollarAmount).toFixed(0)}
            {data.percentageOfPortfolio != null ? ` (${data.percentageOfPortfolio.toFixed(1)}%)` : ''}
          </span>
        )}
        {data.dataQualityStatus && (
          <span className={`rounded-full px-1.5 py-0.5 font-medium ${DATA_QUALITY_STYLES[data.dataQualityStatus] ?? ''}`}>
            {data.dataQualityStatus.replace(/_/g, ' ')}
          </span>
        )}
      </div>
    </Link>
  );
}
