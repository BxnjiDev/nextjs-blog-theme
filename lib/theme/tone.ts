/**
 * The single source of truth for "what color does this state mean" across
 * Atlas OS. An audit found seven components (ActionBadge, ConfidenceBadge,
 * DataQualityBadge, TrendBadge, StatusIndicator, FreshnessStrip,
 * RecommendationCard) each re-declaring their own action/status → color
 * map — several disagreeing on shape (pill fill vs. bordered outline) or
 * on the actual color for the same semantic idea (two different ambers
 * both meaning "warning"; two different score-tier boundaries both meaning
 * "is this good or bad"). Every domain enum now maps to one of six tones
 * here, and every tone maps to exactly one visual treatment in
 * `components/ui/Badge.tsx` / `components/ui/Meter.tsx` — the domain files
 * only ever decide *which* tone a value means, never what a tone looks like.
 */
export type Tone = 'positive' | 'warning' | 'negative' | 'neutral' | 'muted' | 'info';

/** Pill fill (Badge). Kept here, not inlined in Badge, so anything that
 * needs the raw class string (e.g. a non-Badge consumer) has one place to
 * import it from rather than re-deriving it. */
export const TONE_FILL: Record<Tone, string> = {
  positive: 'bg-risk-low/10 text-risk-low',
  warning: 'bg-risk-medium/10 text-risk-medium',
  negative: 'bg-risk-high/10 text-risk-high',
  neutral: 'bg-atlas-surface-raised text-atlas-text-secondary',
  muted: 'bg-atlas-surface-raised text-atlas-text-tertiary',
  info: 'bg-atlas-steel/10 text-atlas-steel',
};

/** Bordered/outline treatment (used where a badge sits on a surface that
 * already has its own fill, e.g. inside a card header) — same tone, lighter
 * footprint than the filled pill. */
export const TONE_OUTLINE: Record<Tone, string> = {
  positive: 'border-risk-low/30 text-risk-low',
  warning: 'border-risk-medium/30 text-risk-medium',
  negative: 'border-risk-high/30 text-risk-high',
  neutral: 'border-atlas-border text-atlas-text-secondary',
  muted: 'border-atlas-border text-atlas-text-tertiary',
  info: 'border-atlas-steel/30 text-atlas-steel',
};

/** Bare colored text, no pill/fill at all — for a dense list row where a
 * full badge would outweigh the row itself (e.g. one word of status next
 * to a symbol in a scanning list). Same tone table, text color only. */
export const TONE_TEXT: Record<Tone, string> = {
  positive: 'text-risk-low',
  warning: 'text-risk-medium',
  negative: 'text-risk-high',
  neutral: 'text-atlas-text-secondary',
  muted: 'text-atlas-text-tertiary',
  info: 'text-atlas-steel',
};

/** Solid dot/indicator color (status dots, chart accents) — same tone
 * table, resolved to a bg-only class for small non-text indicators. */
export const TONE_DOT: Record<Tone, string> = {
  positive: 'bg-risk-low',
  warning: 'bg-risk-medium',
  negative: 'bg-risk-high',
  neutral: 'bg-atlas-text-secondary',
  muted: 'bg-atlas-text-tertiary',
  info: 'bg-atlas-steel',
};

/** Canonical 0–100 score-tier boundaries — an audit found three different
 * boundary pairs in use for the same "is this score good/bad" judgment
 * (33/66, 40/70, 45/75). One pair, everywhere: below 40 is the weak tier,
 * below 70 is the middle tier, 70+ is the strong tier. `invert` flips which
 * end is "good" (a risk score where high = bad vs. a confidence/health
 * score where high = good). */
export function scoreTone(score: number, max = 100, invert = false): Tone {
  const pct = (score / max) * 100;
  if (invert) {
    if (pct >= 70) return 'negative';
    if (pct >= 40) return 'warning';
    return 'positive';
  }
  if (pct >= 70) return 'positive';
  if (pct >= 40) return 'warning';
  return 'negative';
}

export const ACTION_TONE: Record<string, Tone> = {
  BUY_MORE: 'positive',
  HOLD: 'neutral',
  REDUCE: 'warning',
  SELL: 'negative',
  WATCH: 'info',
};

export const ACTION_LABEL: Record<string, string> = {
  BUY_MORE: 'Buy more',
  HOLD: 'Hold',
  REDUCE: 'Reduce',
  SELL: 'Sell',
  WATCH: 'Watch closely',
};

/** Quote/data staleness (live quotes, connection freshness, sync recency) —
 * one staleness vocabulary reused by DataQualityBadge, StatusIndicator, and
 * FreshnessStrip, which previously each redeclared it. */
export const STALENESS_TONE: Record<string, Tone> = {
  live: 'positive',
  fresh: 'positive',
  delayed: 'info',
  aging: 'warning',
  mock: 'muted',
  unknown: 'muted',
  stale: 'negative',
};

export const STALENESS_LABEL: Record<string, string> = {
  live: 'Live',
  fresh: 'Fresh',
  delayed: 'Delayed',
  aging: 'Aging',
  mock: 'Mock',
  unknown: 'No data yet',
  stale: 'Stale',
};

/** Scheduler job-run outcome (Connections' "Scheduled jobs" table). */
export const RUN_STATUS_TONE: Record<string, Tone> = {
  SUCCESS: 'positive',
  WARNING: 'warning',
  FAILURE: 'negative',
  RUNNING: 'info',
  SKIPPED: 'muted',
};

/** Manual-execution reconciliation match status (Connections/Executions). */
export const MATCH_STATUS_TONE: Record<string, Tone> = {
  UNMATCHED: 'muted',
  AMOUNT_MISMATCH: 'negative',
  QUANTITY_MISMATCH: 'negative',
  PRICE_MISMATCH: 'negative',
  TIMING_MISMATCH: 'warning',
};

const DEFAULT_STALE_AFTER_HOURS = 24;

/** A quote's quality label degrades to "stale" once it's older than the
 * threshold, regardless of its nominal source quality — used by
 * HoldingsTable's per-row data-quality badge. */
export function quoteQualityLabel(quality: string, asOf: Date, staleAfterHours = DEFAULT_STALE_AFTER_HOURS): { label: string; tone: Tone } {
  const stale = Date.now() - asOf.getTime() > staleAfterHours * 60 * 60 * 1000;
  return stale ? { label: STALENESS_LABEL.stale, tone: 'negative' } : { label: STALENESS_LABEL[quality] ?? quality, tone: STALENESS_TONE[quality] ?? 'muted' };
}

/** Recommendation-generation data-quality gate (PASS/PASS_WITH_WARNINGS/
 * BLOCKED) — a distinct enum from quote staleness above (this is about
 * whether a recommendation was allowed to form at full confidence, not
 * about quote age), kept separate rather than overloading one map. */
export const GATE_STATUS_TONE: Record<string, Tone> = {
  PASS: 'positive',
  PASS_WITH_WARNINGS: 'warning',
  BLOCKED: 'negative',
};

/** Per-check data-quality gate status (Investment Memo's check list) —
 * same three-tier idea as GATE_STATUS_TONE but keyed by the per-check
 * enum (ok/warning/blocking) rather than the aggregate status. */
export const CHECK_STATUS_TONE: Record<string, Tone> = {
  ok: 'positive',
  warning: 'warning',
  blocking: 'negative',
};

export const CONVICTION_TREND_TONE: Record<string, Tone> = {
  IMPROVING: 'positive',
  STABLE: 'neutral',
  WEAKENING: 'negative',
  UNKNOWN: 'muted',
};

export const CONVICTION_TREND_LABEL: Record<string, string> = {
  IMPROVING: '▲ Growing confidence',
  STABLE: '● Stable',
  WEAKENING: '▼ Weakening',
  UNKNOWN: 'Not enough history',
};

/** Portfolio timeline entry types (lib/domain/timeline.ts) — routine
 * events (sync, news) read as quiet/muted dots on the timeline river,
 * while events that represent an actual change in judgment or position
 * (recommendation, transaction, thesis/conviction/risk/health change,
 * earnings) get a brighter, tone-colored dot — the same "significant vs.
 * routine" dot-brightness grammar Home's OrbitRow already uses, so the two
 * pages read as one language rather than two different timeline widgets. */
export const TIMELINE_TYPE_TONE: Record<string, Tone> = {
  sync: 'muted',
  recommendation: 'info',
  transaction: 'positive',
  thesis_change: 'warning',
  conviction_change: 'info',
  risk_change: 'negative',
  health_change: 'positive',
  news: 'muted',
  earnings: 'warning',
};

export const DECISION_TONE: Record<string, Tone> = {
  PENDING: 'muted',
  ACCEPTED: 'positive',
  PARTIALLY_ACCEPTED: 'warning',
  REJECTED: 'negative',
  DEFERRED: 'info',
};

/** Maps a 0-100 score onto the Atlas identity orb's state vocabulary,
 * using the same canonical scoreTone boundaries as everything else — the
 * orb hero on Home (portfolio health), Portfolio (portfolio risk), Risk,
 * and Health pages all resolve their glow color through this one function
 * instead of each inventing its own boundary pair. `null` (no reading yet)
 * maps to `offline` rather than any brand-colored state. */
export function atlasStateForScore(score: number | null, invert = false): 'ready' | 'idle' | 'attention' | 'offline' {
  if (score == null) return 'offline';
  const tone = scoreTone(score, 100, invert);
  if (tone === 'positive') return 'ready';
  if (tone === 'warning') return 'idle';
  return 'attention';
}

/** Intelligence Layer priority tiers (lib/intelligence/) — a distinct
 * vocabulary from every tone map above: those describe whether a *value*
 * is good or bad, this describes how much *attention* an insight deserves
 * regardless of whether its content is good or bad news. A "critical"
 * insight can be good news delivered urgently (a thesis just cleared for
 * a large add) as easily as bad. */
export const INSIGHT_TIER_TONE: Record<string, Tone> = {
  critical: 'negative',
  high: 'warning',
  medium: 'info',
  low: 'muted',
};

export const INSIGHT_TIER_LABEL: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
