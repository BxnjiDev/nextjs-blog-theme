import { TONE_FILL, TONE_OUTLINE, type Tone } from '@/lib/theme/tone';

/**
 * The one badge/pill component every status, directive, quality, and trend
 * indicator in the app renders through. Replaces seven independently
 * hand-rolled equivalents (ActionBadge, ConfidenceBadge, DataQualityBadge,
 * TrendBadge, StatusIndicator's local Pill, FreshnessStrip's inline pill,
 * RecommendationCard's directive badge) — the *shape* is decided once
 * here; each call site only supplies a `tone` (see lib/theme/tone.ts) and
 * label text.
 *
 * `variant="fill"` (default) is the pill used almost everywhere. `variant
 * ="outline"` is for a badge sitting on a surface that already has its own
 * background (e.g. a card header) where a second filled pill would compete
 * with the card for attention.
 */
export default function Badge({
  tone,
  children,
  variant = 'fill',
  title,
  className = '',
}: {
  tone: Tone;
  children: React.ReactNode;
  variant?: 'fill' | 'outline';
  title?: string;
  className?: string;
}) {
  const toneClass = variant === 'outline' ? `border ${TONE_OUTLINE[tone]}` : TONE_FILL[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${toneClass} ${className}`}
    >
      {children}
    </span>
  );
}
