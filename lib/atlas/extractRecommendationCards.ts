import type { RecommendationCardData } from '@/components/RecommendationCard';

interface StoredToolCall {
  toolName: string;
  input: unknown;
  output: unknown;
}

function toCardData(r: Record<string, unknown>): RecommendationCardData | null {
  if (typeof r.id !== 'string' || typeof r.symbol !== 'string' || typeof r.action !== 'string' || typeof r.confidenceScore !== 'number') {
    return null;
  }
  return {
    id: r.id,
    symbol: r.symbol,
    action: r.action,
    confidenceScore: r.confidenceScore,
    thesis: typeof r.thesis === 'string' ? r.thesis : '',
    proposedDollarAmount: typeof r.proposedDollarAmount === 'number' ? r.proposedDollarAmount : null,
    percentageOfPortfolio: typeof r.percentageOfPortfolio === 'number' ? r.percentageOfPortfolio : null,
    dataQualityStatus: typeof r.dataQualityStatus === 'string' ? r.dataQualityStatus : null,
    convictionScore: typeof r.convictionScore === 'number' ? r.convictionScore : null,
  };
}

/**
 * Atlas Chat's `get_recommendations` tool can return either one
 * recommendation (by id) or a list — this pulls out whichever
 * recommendation-shaped objects are present so the UI can render them as
 * RecommendationCards under the assistant's text, deduplicated by id since
 * the same recommendation could plausibly surface from more than one tool
 * call in a turn.
 */
export function extractRecommendationCards(toolCalls: unknown): RecommendationCardData[] {
  if (!Array.isArray(toolCalls)) return [];
  const cards: RecommendationCardData[] = [];
  const seen = new Set<string>();

  for (const call of toolCalls as StoredToolCall[]) {
    if (call?.toolName !== 'get_recommendations' || !call.output || typeof call.output !== 'object') continue;
    const output = call.output as Record<string, unknown>;

    if (Array.isArray(output.recommendations)) {
      for (const r of output.recommendations) {
        const card = typeof r === 'object' && r !== null ? toCardData(r as Record<string, unknown>) : null;
        if (card && !seen.has(card.id)) {
          seen.add(card.id);
          cards.push(card);
        }
      }
    } else {
      const card = toCardData(output);
      if (card && !seen.has(card.id)) {
        seen.add(card.id);
        cards.push(card);
      }
    }
  }

  return cards;
}
