import Link from 'next/link';
import Badge from './ui/Badge';
import Meter from './ui/Meter';
import { ACTION_TONE, ACTION_LABEL, GATE_STATUS_TONE } from '@/lib/theme/tone';

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
        <Badge tone={ACTION_TONE[data.action] ?? 'neutral'} variant="outline" className="shrink-0">
          {ACTION_LABEL[data.action] ?? data.action}
        </Badge>
      </div>

      {!compact && <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-atlas-text-secondary">{data.thesis}</p>}

      <Meter score={data.confidenceScore} max={10} label="Confidence" />

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-atlas-text-tertiary">
        {typeof data.convictionScore === 'number' && <span className="font-mono">Conviction {data.convictionScore}/100</span>}
        {data.proposedDollarAmount != null && (
          <span className="font-mono">
            ${Number(data.proposedDollarAmount).toFixed(0)}
            {data.percentageOfPortfolio != null ? ` (${data.percentageOfPortfolio.toFixed(1)}%)` : ''}
          </span>
        )}
        {data.dataQualityStatus && (
          <Badge tone={GATE_STATUS_TONE[data.dataQualityStatus] ?? 'muted'}>{data.dataQualityStatus.replace(/_/g, ' ')}</Badge>
        )}
      </div>
    </Link>
  );
}
