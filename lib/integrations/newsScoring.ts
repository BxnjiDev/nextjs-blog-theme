import type { MaterialityLevel } from './types';

/**
 * Deterministic keyword lexicons for sentiment and materiality. These are
 * intentionally simple and transparent — a reproducible calculation over
 * real fetched text, not an invented opinion. They will miss nuance a real
 * NLP model would catch; that's an accepted tradeoff for "never fabricate."
 */
const POSITIVE_WORDS = [
  'beat',
  'beats',
  'beating',
  'surge',
  'surges',
  'surging',
  'soar',
  'soars',
  'soaring',
  'record',
  'upgrade',
  'upgraded',
  'outperform',
  'strong',
  'profit',
  'profits',
  'profitable',
  'rally',
  'rallies',
  'gain',
  'gains',
  'expand',
  'expansion',
  'win',
  'wins',
  'award',
  'awarded',
  'approval',
  'approved',
  'partnership',
  'breakthrough',
  'bullish',
  'raise',
  'raised',
  'raises',
  'exceed',
  'exceeds',
  'exceeded',
  'growth',
];

const NEGATIVE_WORDS = [
  'miss',
  'misses',
  'missed',
  'plunge',
  'plunges',
  'plunging',
  'crash',
  'crashes',
  'downgrade',
  'downgraded',
  'underperform',
  'weak',
  'weakness',
  'loss',
  'losses',
  'lawsuit',
  'sued',
  'sues',
  'recall',
  'recalls',
  'investigation',
  'investigated',
  'probe',
  'fraud',
  'decline',
  'declines',
  'declining',
  'cut',
  'cuts',
  'layoff',
  'layoffs',
  'bearish',
  'warning',
  'warns',
  'delay',
  'delayed',
  'fine',
  'fined',
  'breach',
  'hack',
  'hacked',
  'default',
  'bankruptcy',
];

const HIGH_SEVERITY_WORDS = [
  'bankruptcy',
  'fraud',
  'investigation',
  'investigated',
  'probe',
  'recall',
  'lawsuit',
  'sued',
  'hack',
  'hacked',
  'breach',
  'delisted',
  'resign',
  'resigns',
  'resignation',
  'fired',
  'default',
  'restatement',
  'sec charges',
  'indicted',
];

const MEDIUM_SEVERITY_WORDS = [
  'downgrade',
  'downgraded',
  'guidance cut',
  'layoff',
  'layoffs',
  'miss',
  'misses',
  'missed',
  'warning',
  'warns',
  'delay',
  'delayed',
  'antitrust',
  'tariff',
  'tariffs',
  'export restriction',
  'ban',
  'banned',
  'recall',
];

function countMatches(text: string, words: string[]): number {
  let count = 0;
  for (const word of words) {
    if (text.includes(word)) count++;
  }
  return count;
}

/** Returns null when no lexicon term matched — "no signal detected" is more
 * honest than a fabricated neutral 0. */
export function computeSentiment(text: string): number | null {
  const lower = text.toLowerCase();
  const positive = countMatches(lower, POSITIVE_WORDS);
  const negative = countMatches(lower, NEGATIVE_WORDS);
  const total = positive + negative;
  if (total === 0) return null;
  return Math.round(((positive - negative) / total) * 100) / 100;
}

export function computeMateriality(
  text: string,
  relevanceScore: number
): { materiality: number; materialityLevel: MaterialityLevel } {
  const lower = text.toLowerCase();
  const highHits = countMatches(lower, HIGH_SEVERITY_WORDS);
  const mediumHits = countMatches(lower, MEDIUM_SEVERITY_WORDS);

  let score = 3; // routine business news baseline
  if (highHits > 0) score += 4;
  else if (mediumHits > 0) score += 2;

  if (relevanceScore >= 70) score += 2;
  else if (relevanceScore >= 40) score += 1;

  score = Math.max(1, Math.min(10, score));

  const materialityLevel: MaterialityLevel = score >= 9 ? 'critical' : score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low';

  return { materiality: score, materialityLevel };
}

/** Stable dedupe key: prefer the real URL (syndicated copies usually share
 * one canonical URL per publisher, but different publishers get different
 * keys — acceptable, since the point is avoiding duplicate storage from
 * repeated fetches of the SAME story, not full cross-publisher clustering).
 * Falls back to a normalized headline + day when no URL is available. */
export function computeDedupeKey(headline: string, url: string | undefined, publishedAt: Date): string {
  if (url) return `news:${url}`;
  const normalized = headline
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return `news:${normalized}:${publishedAt.toISOString().slice(0, 10)}`;
}
