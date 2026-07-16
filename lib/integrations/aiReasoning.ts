import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { CompanyFundamentals, NewsArticle, Quote, SecFiling, Technicals } from './types';

const HoldingAnalysisSchema = z.object({
  thesis: z.string().describe('Current investment thesis in 2-4 sentences, grounded only in the data provided.'),
  thesisChanged: z
    .boolean()
    .describe('Whether this thesis differs materially from the previous one provided, if any.'),
  bullCase: z.string(),
  bearCase: z.string(),
  catalysts: z.string(),
  risks: z.string(),
  fairValueOpinion: z
    .string()
    .describe('A brief valuation opinion, or an explicit statement that fair value cannot be assessed with the data given.'),
  technicalTrend: z.string(),
  institutionalSentiment: z
    .string()
    .describe('State explicitly if no institutional-ownership data source is available rather than guessing.'),
  confidenceScore: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe('1-10. Lower when fundamentals, news, or filings data is missing or thin.'),
  action: z.enum(['BUY_MORE', 'HOLD', 'REDUCE', 'SELL', 'WATCH']),
});

export type HoldingAnalysisOutput = z.infer<typeof HoldingAnalysisSchema>;

export interface HoldingAnalysisInput {
  symbol: string;
  name: string;
  quantity: number;
  avgCostBasis: number;
  quote: Quote;
  technicals: Technicals;
  fundamentals: CompanyFundamentals | null;
  filings: SecFiling[];
  news: NewsArticle[];
  previousRecommendation: { thesis: string; action: string; generatedAt: Date } | null;
}

export interface AiReasoningProvider {
  analyzeHolding(input: HoldingAnalysisInput): Promise<HoldingAnalysisOutput>;
}

const SYSTEM_PROMPT = `You are a disciplined equity research analyst helping an individual long-term investor.

Rules you must follow:
- Use ONLY the data given to you in the user message. Do not draw on general knowledge about the company beyond what's provided — if the data doesn't cover something (e.g. no fundamentals, no recent news, no filings), say so explicitly in the relevant field instead of inventing a plausible-sounding fact.
- Clearly separate verified data points (quote, technicals, fundamentals, filings, news) from your own inference or opinion.
- Lower your confidence score when key data is missing or thin (e.g. no fundamentals data, zero news items, zero filings) — do not project high confidence from limited data.
- Never recommend a trade based purely on a price move; ground the recommended action in whether the thesis, valuation, or risk has actually changed.
- Be concise and evidence-driven. No hype.`;

function buildUserPrompt(input: HoldingAnalysisInput): string {
  const lines: string[] = [];
  lines.push(`Symbol: ${input.symbol} (${input.name})`);
  lines.push(`Position: ${input.quantity} shares @ avg cost ${input.avgCostBasis.toFixed(2)}`);
  lines.push(
    `Quote: price ${input.quote.price.toFixed(2)}, day change ${input.quote.changePercent.toFixed(2)}%, ` +
      `as of ${input.quote.asOf.toISOString()} (quality: ${input.quote.quality})`
  );
  lines.push(
    `Technicals: trend ${input.technicals.trend} — ${input.technicals.notes} (quality: ${input.technicals.quality})`
  );

  if (input.fundamentals) {
    const f = input.fundamentals;
    lines.push(
      `Fundamentals (quality: ${f.quality}): sector=${f.sector ?? 'unknown'}, industry=${f.industry ?? 'unknown'}, ` +
        `marketCap=${f.marketCap ?? 'unknown'}, peRatio=${f.peRatio ?? 'unknown'}, eps=${f.eps ?? 'unknown'}, ` +
        `dividendYield=${f.dividendYield ?? 'unknown'}`
    );
  } else {
    lines.push('Fundamentals: NOT AVAILABLE for this symbol.');
  }

  if (input.filings.length > 0) {
    lines.push('Recent SEC filings:');
    for (const f of input.filings) {
      lines.push(`  - ${f.formType} filed ${f.filedAt.toISOString().slice(0, 10)}: ${f.url}`);
    }
  } else {
    lines.push('Recent SEC filings: none found in the lookback window.');
  }

  if (input.news.length > 0) {
    lines.push('Recent news:');
    for (const n of input.news) {
      lines.push(`  - [materiality ${n.materiality}/10] ${n.headline} (${n.source}, ${n.publishedAt.toISOString().slice(0, 10)})`);
    }
  } else {
    lines.push('Recent news: none surfaced (no news provider configured, or nothing material found).');
  }

  if (input.previousRecommendation) {
    lines.push(
      `Previous recommendation (${input.previousRecommendation.generatedAt.toISOString().slice(0, 10)}): ` +
        `action=${input.previousRecommendation.action}. Thesis was: ${input.previousRecommendation.thesis}`
    );
  } else {
    lines.push('Previous recommendation: none — this is the first analysis for this holding.');
  }

  lines.push('\nProduce a structured analysis per the schema, following the rules above.');
  return lines.join('\n');
}

/**
 * REAL implementation — calls Claude (claude-opus-4-8) with structured
 * outputs so the response is guaranteed to match HoldingAnalysisSchema.
 * Adaptive thinking is left on so the model can reason through the
 * synthesis when it judges that useful; effort is capped at "medium" since
 * this runs per-holding in a batch job, not an interactive chat.
 */
class ClaudeAiReasoningProvider implements AiReasoningProvider {
  private client = new Anthropic();

  async analyzeHolding(input: HoldingAnalysisInput): Promise<HoldingAnalysisOutput> {
    const response = await this.client.messages.parse({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(HoldingAnalysisSchema),
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('Claude declined to analyze this holding (refusal).');
    }
    if (!response.parsed_output) {
      throw new Error('Claude response did not include parseable structured output.');
    }
    return response.parsed_output;
  }
}

/**
 * Deterministic fallback used when ANTHROPIC_API_KEY is unset, or as a
 * safety net if the real call fails. It only restates facts already
 * fetched from other providers — no invented thesis, bull/bear case, or
 * valuation opinion, since none of that is derivable without an actual
 * reasoning step. Confidence is pinned low and the action defaults to
 * WATCH, reflecting that no real analysis happened.
 */
class HeuristicAiReasoningProvider implements AiReasoningProvider {
  async analyzeHolding(input: HoldingAnalysisInput): Promise<HoldingAnalysisOutput> {
    const facts = [
      `Price ${input.quote.price.toFixed(2)} (${input.quote.changePercent >= 0 ? '+' : ''}${input.quote.changePercent.toFixed(2)}% day change, ${input.quote.quality} data).`,
      `Technical trend: ${input.technicals.trend} (${input.technicals.notes})`,
      input.fundamentals ? `Fundamentals available (${input.fundamentals.quality}).` : 'No fundamentals data available.',
      `${input.filings.length} recent SEC filing(s).`,
      `${input.news.length} recent news item(s) surfaced.`,
    ].join(' ');

    const unavailableNote = 'Not available — no AI reasoning provider configured (set ANTHROPIC_API_KEY).';

    return {
      thesis: `[Heuristic summary, not investment analysis — no AI reasoning provider configured] ${facts}`,
      thesisChanged: false,
      bullCase: unavailableNote,
      bearCase: unavailableNote,
      catalysts: unavailableNote,
      risks: input.fundamentals
        ? 'Not assessed — configure ANTHROPIC_API_KEY for real risk analysis.'
        : 'Not assessed — fundamentals data is also unavailable.',
      fairValueOpinion: unavailableNote,
      technicalTrend: `${input.technicals.trend}: ${input.technicals.notes}`,
      institutionalSentiment: 'Not available — no institutional-ownership data source configured.',
      confidenceScore: 2,
      action: 'WATCH',
    };
  }
}

/**
 * Falls back to the heuristic provider if the real call throws for any
 * reason (missing key handled by the export below; this also covers rate
 * limits, refusals, and transient API errors at runtime).
 */
class FallbackAiReasoningProvider implements AiReasoningProvider {
  constructor(
    private readonly real: AiReasoningProvider,
    private readonly heuristic: AiReasoningProvider
  ) {}

  async analyzeHolding(input: HoldingAnalysisInput): Promise<HoldingAnalysisOutput> {
    try {
      return await this.real.analyzeHolding(input);
    } catch (err) {
      console.error(`AI reasoning provider failed for ${input.symbol}; falling back to heuristic summary:`, err);
      return this.heuristic.analyzeHolding(input);
    }
  }
}

const heuristicProvider = new HeuristicAiReasoningProvider();

export const aiReasoningProvider: AiReasoningProvider = process.env.ANTHROPIC_API_KEY
  ? new FallbackAiReasoningProvider(new ClaudeAiReasoningProvider(), heuristicProvider)
  : heuristicProvider;
