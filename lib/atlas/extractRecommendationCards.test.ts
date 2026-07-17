import { describe, it, expect } from 'vitest';
import { extractRecommendationCards } from './extractRecommendationCards';

describe('extractRecommendationCards', () => {
  it('returns an empty array when there are no tool calls', () => {
    expect(extractRecommendationCards(undefined)).toEqual([]);
    expect(extractRecommendationCards(null)).toEqual([]);
    expect(extractRecommendationCards([])).toEqual([]);
  });

  it('extracts a single recommendation from get_recommendations(id) mode', () => {
    const toolCalls = [
      { toolName: 'get_recommendations', input: { id: 'r1' }, output: { id: 'r1', symbol: 'AAPL', action: 'HOLD', confidenceScore: 6, thesis: 't' } },
    ];
    const cards = extractRecommendationCards(toolCalls);
    expect(cards).toHaveLength(1);
    expect(cards[0].symbol).toBe('AAPL');
  });

  it('extracts multiple recommendations from get_recommendations list mode', () => {
    const toolCalls = [
      {
        toolName: 'get_recommendations',
        input: {},
        output: { recommendations: [
          { id: 'r1', symbol: 'AAPL', action: 'HOLD', confidenceScore: 6, thesis: 't' },
          { id: 'r2', symbol: 'MSFT', action: 'BUY_MORE', confidenceScore: 8, thesis: 't2' },
        ] },
      },
    ];
    const cards = extractRecommendationCards(toolCalls);
    expect(cards.map((c) => c.symbol)).toEqual(['AAPL', 'MSFT']);
  });

  it('ignores tool calls from other tools', () => {
    const toolCalls = [{ toolName: 'get_portfolio', input: {}, output: { totalValue: 100 } }];
    expect(extractRecommendationCards(toolCalls)).toEqual([]);
  });

  it('ignores malformed recommendation-shaped objects missing required fields', () => {
    const toolCalls = [{ toolName: 'get_recommendations', input: {}, output: { symbol: 'AAPL' } }];
    expect(extractRecommendationCards(toolCalls)).toEqual([]);
  });

  it('deduplicates the same recommendation id appearing twice', () => {
    const toolCalls = [
      { toolName: 'get_recommendations', input: {}, output: { id: 'r1', symbol: 'AAPL', action: 'HOLD', confidenceScore: 6 } },
      { toolName: 'get_recommendations', input: {}, output: { recommendations: [{ id: 'r1', symbol: 'AAPL', action: 'HOLD', confidenceScore: 6 }] } },
    ];
    expect(extractRecommendationCards(toolCalls)).toHaveLength(1);
  });
});
