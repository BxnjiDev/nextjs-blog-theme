import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { CompanyFundamentals, NewsArticle, Quote, SecFiling, Technicals } from './types';
import { resolveAnthropicModel, type SupportedAnthropicModel } from './anthropicModel';
import { timedProviderCall } from './retry';

const ExplainabilitySchema = z.object({
  whyNow: z.string().describe('Why this action, at this time — grounded in the data given.'),
  whyNot: z.string().describe('The strongest reason NOT to take this action — steelman the alternative. In an evaluation-account context, this doubles as "the argument for waiting."'),
  supportingEvidence: z.string().describe('The specific data points that support this call.'),
  contradictingEvidence: z.string().describe('The specific data points that cut against this call, if any. Say "None found in the available data" if genuinely none.'),
  keyAssumptions: z.string().describe('What has to remain true for this call to hold up.'),
  invalidationConditions: z.string().describe('What specific, observable event would invalidate this call.'),
  vsCashAndSpy: z
    .string()
    .describe(
      'How this call compares to the two do-nothing alternatives: holding cash, or simply buying SPY with the same dollars. Ground this in the SPY/cash data provided — do not invent a return figure for the recommended action itself.'
    ),
  vsCurrentAllocation: z
    .string()
    .describe(
      'How this call fits the portfolio\'s current sector/position weights given — does it concentrate an already-large exposure, diversify away from one, or is the portfolio context not informative here. Ground this in the sector-weight data provided.'
    ),
  baseCase: z.string().describe('The single most likely outcome — distinct from bullCase (best case) and bearCase (worst case), not just a hedge between them.'),
  primaryCatalyst: z.string().describe('The ONE catalyst most likely to move this thesis, chosen from the fuller catalysts list — a one-line highlight, not a repeat of the full paragraph.'),
  biggestUnknown: z.string().describe('The single most consequential thing that genuinely cannot be known from the data given.'),
  biggestRisk: z.string().describe('The ONE risk that matters most, chosen from the fuller risks list — a one-line highlight, not a repeat of the full paragraph.'),
  whyConfidenceNotHigher: z
    .string()
    .describe('Given the stated confidenceScore, name specifically what is missing or uncertain that keeps it from being higher — never "just because," always a specific gap.'),
});

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
  expectedOutcome: z.string().describe('What Atlas expects to happen if this call is right — a stated, gradeable prediction, not a hedge.'),
  expectedTimeHorizon: z.string().describe('e.g. "3-6 months" — over what horizon the expected outcome should play out.'),
  explainability: ExplainabilitySchema,
});

export type HoldingAnalysisOutput = z.infer<typeof HoldingAnalysisSchema>;
export type ExplainabilityOutput = z.infer<typeof ExplainabilitySchema>;

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
  /** Past recommendations/conviction/alerts for this holding plus the
   * portfolio-wide confidence-calibration summary — see lib/domain/memory.ts. */
  memoryContext: string;
  /** Deterministic grounding for explainability.vsCashAndSpy/
   * vsCurrentAllocation — real numbers the model compares against, never
   * invents. */
  portfolioContext: {
    cashBalance: number;
    totalPortfolioValue: number;
    /** SPY's own realized return/volatility over the same ~60-session
     * lookback used elsewhere in the app (lib/domain/risk.ts helpers). */
    spyRecentReturnPct: number | null;
    spyAnnualizedVolatilityPct: number | null;
    /** Current portfolio weight by sector (0-100), and this symbol's
     * sector + current weight if already held — grounding for
     * vsCurrentAllocation. */
    sectorWeightsPct: Record<string, number>;
    thisSymbolSector: string | null;
    thisSymbolCurrentWeightPct: number;
  };
}

/** Fields computed in code (never by Claude) and merged into the stored
 * `explainability` JSON alongside the AI-authored ExplainabilityOutput —
 * see lib/domain/investmentMemo.ts. Kept as a separate type so it's
 * structurally obvious these never pass through the model. */
export interface DeterministicMemoFields {
  /** Deterministic before/after portfolio risk & health delta if this
   * recommendation's proposed size were executed. */
  portfolioImpact: string;
  /** Deterministic: what the proposed dollar amount would have returned
   * held in SPY instead, over the same recent lookback. */
  opportunityCost: string;
}

const ThesisNarrativeSchema = z.object({
  companyOverview: z.string().describe('2-3 sentences: what the company does, grounded only in the data provided.'),
  originalThesis: z
    .string()
    .describe('The core reason to own this: 2-4 sentences. When updating an existing thesis, restate the ORIGINAL reasoning unchanged unless it has genuinely broken.'),
  growthDrivers: z.string(),
  competitiveAdvantages: z.string(),
  risks: z.string(),
  bullCase: z.string(),
  bearCase: z.string(),
  catalysts: z.string(),
  investmentHorizon: z.string().describe('e.g. "3-5 years" — a horizon estimate, not a prediction of a specific price or date.'),
  whatWouldStrengthen: z.string().describe('What specific, observable evidence would increase conviction in this holding.'),
  whatWouldWeaken: z.string().describe('What specific, observable evidence would decrease conviction in this holding.'),
  sellConditions: z.string().describe('What specific conditions would justify selling — not vague hedging, concrete triggers.'),
  thesisChanged: z
    .boolean()
    .describe('True only if the core reasoning for owning this has materially changed vs. the previous thesis given — not for routine updates.'),
  confidenceChanged: z.boolean(),
  riskChanged: z.boolean(),
  valuationChanged: z.boolean(),
  returnExpectationChanged: z.boolean(),
  whatChanged: z.string().describe('Empty string if nothing changed. Otherwise, precisely what changed.'),
  whyChanged: z.string().describe('Empty string if nothing changed. Otherwise, the evidence that drove the change.'),
});

export type ThesisNarrativeOutput = z.infer<typeof ThesisNarrativeSchema>;

export interface ThesisNarrativeInput {
  symbol: string;
  name: string;
  sector: string | null;
  quote: Quote;
  technicals: Technicals;
  fundamentals: CompanyFundamentals | null;
  filings: SecFiling[];
  news: NewsArticle[];
  convictionScore: number;
  convictionSummary: string;
  previousThesis: {
    companyOverview: string;
    originalThesis: string;
    growthDrivers: string;
    competitiveAdvantages: string;
    risks: string;
    bullCase: string;
    bearCase: string;
    catalysts: string;
    investmentHorizon: string;
    whatWouldStrengthen: string;
    whatWouldWeaken: string;
    sellConditions: string;
    convictionScore: number;
    lastReviewedAt: Date;
  } | null;
  /** Assembled AI-memory context: past recommendations/alerts/conviction
   * trend, so the model compares against prior conclusions instead of
   * starting from scratch every run. */
  memoryContext: string;
}

const CritiqueSchema = z.object({
  lessonsLearned: z
    .string()
    .describe('2-4 sentences reflecting on this recommendation given the deterministic facts provided — what would you do differently, if anything.'),
});

export type CritiqueOutput = z.infer<typeof CritiqueSchema>;

export interface RecommendationCritiqueInput {
  symbol: string;
  action: string;
  confidenceScore: number;
  thesisAtRecommendation: string;
  expectedOutcome: string;
  expectedTimeHorizon: string;
  /** Deterministic facts only — this is a grounding input, never something Claude is asked to invent. */
  wasCorrect: boolean | null;
  thesisCorrect: boolean | null;
  timingCorrect: boolean | null;
  /** Percentage points (e.g. 12.3 = +12.3%), matching RecommendationOutcome's stored units. */
  return90d: number | null;
  alpha90d: number | null;
  thesisChangedSince: string | null;
  missingEvidence: string | null;
}

export interface AiReasoningProvider {
  analyzeHolding(input: HoldingAnalysisInput): Promise<HoldingAnalysisOutput>;
  generateThesisNarrative(input: ThesisNarrativeInput): Promise<ThesisNarrativeOutput>;
  critiqueRecommendation(input: RecommendationCritiqueInput): Promise<CritiqueOutput>;
}

const SYSTEM_PROMPT = `You are a disciplined equity research analyst helping an individual long-term investor.

Rules you must follow:
- Use ONLY the data given to you in the user message. Do not draw on general knowledge about the company beyond what's provided — if the data doesn't cover something (e.g. no fundamentals, no recent news, no filings), say so explicitly in the relevant field instead of inventing a plausible-sounding fact.
- Clearly separate verified data points (quote, technicals, fundamentals, filings, news) from your own inference or opinion.
- Lower your confidence score when key data is missing or thin (e.g. no fundamentals data, zero news items, zero filings) — do not project high confidence from limited data.
- Never recommend a trade based purely on a price move; ground the recommended action in whether the thesis, valuation, or risk has actually changed.
- State an expectedOutcome and expectedTimeHorizon as a real, gradeable prediction — not a hedge like "it depends." This will be checked against what actually happens.
- For explainability: whyNot should genuinely steelman the opposite call, not restate whyNow in different words. contradictingEvidence should name real data points against the call, or explicitly say none were found.
- If historical confidence-calibration data is provided, use it to calibrate your stated confidenceScore — if a similar confidence band has historically over- or under-performed, adjust accordingly rather than ignoring that track record.
- For explainability.vsCashAndSpy: use ONLY the SPY return/volatility figures given to you — never state a specific expected return for the recommended action itself beyond what's already in expectedOutcome.
- For explainability.vsCurrentAllocation: use ONLY the sector-weight figures given to you.
- baseCase must be a genuinely distinct middle scenario, not a paraphrase of bullCase or bearCase. primaryCatalyst and biggestRisk must each be a single highlighted item picked FROM the fuller catalysts/risks text, not new information invented for this field alone.
- whyConfidenceNotHigher must name a specific missing data point or open question — never a generic hedge.
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

  lines.push(`\nAI memory (past recommendations/alerts for this holding, plus historical confidence calibration):\n${input.memoryContext}`);

  const pc = input.portfolioContext;
  lines.push(
    `\nPortfolio context: cash $${pc.cashBalance.toFixed(2)}, total portfolio value $${pc.totalPortfolioValue.toFixed(2)}. ` +
      `SPY over the recent lookback: ${pc.spyRecentReturnPct !== null ? `${pc.spyRecentReturnPct.toFixed(1)}% return` : 'return unavailable'}, ` +
      `${pc.spyAnnualizedVolatilityPct !== null ? `${pc.spyAnnualizedVolatilityPct.toFixed(1)}% annualized volatility` : 'volatility unavailable'}. ` +
      'Use this for explainability.vsCashAndSpy.'
  );
  const sectorEntries = Object.entries(pc.sectorWeightsPct);
  lines.push(
    `\nCurrent sector weights: ${sectorEntries.length > 0 ? sectorEntries.map(([s, w]) => `${s} ${w.toFixed(1)}%`).join(', ') : 'no sector data available'}. ` +
      `${input.symbol}'s sector: ${pc.thisSymbolSector ?? 'unclassified'}, currently ${pc.thisSymbolCurrentWeightPct.toFixed(1)}% of the portfolio. ` +
      'Use this for explainability.vsCurrentAllocation.'
  );

  lines.push('\nProduce a structured analysis per the schema, following the rules above.');
  return lines.join('\n');
}

const THESIS_SYSTEM_PROMPT = `You are an institutional investment research analyst maintaining a PERSISTENT thesis for a long-term individual investor's holding — not writing a fresh daily take.

Rules you must follow:
- Use ONLY the data given to you. Never invent facts not present in the data; explicitly say when something is unknown.
- If a previous thesis is provided, your job is to REVIEW it against new evidence, not rewrite it from scratch. Keep the original reasoning intact unless it has genuinely broken — thesis drift for its own sake is a failure mode.
- Set thesisChanged=true only when the core reason to own this has materially changed (e.g. a competitive threat materialized, a key growth driver stalled, guidance was cut) — not for routine price moves or minor news.
- Judge confidenceChanged/riskChanged/valuationChanged/returnExpectationChanged independently and honestly; several can be true even when thesisChanged is false.
- When nothing changed, still fill in whatChanged/whyChanged as empty strings — do not pad them with restated facts.
- whatWouldStrengthen/whatWouldWeaken/sellConditions must be specific and observable (e.g. "gross margin falls below 40% for two consecutive quarters"), not vague hedges like "if things get worse."
- Be concise and evidence-driven. No hype, no speculation presented as fact.`;

const CRITIQUE_SYSTEM_PROMPT = `You are an institutional investment analyst reviewing your OWN past recommendation with the benefit of hindsight.

Rules you must follow:
- You are given deterministic facts (whether the call was correct, the thesis held up, timing was right, and the realized return/alpha) — treat these as ground truth, do not second-guess or recompute them.
- Write 2-4 sentences of genuine self-critique: what evidence proved out, what didn't, and what you would look for differently next time. Avoid generic hedging ("markets are unpredictable") — be specific to this case.
- If missingEvidence is noted, acknowledge how that gap affected the original call's reliability.
- No hype, no excessive self-flagellation — a plain, honest retrospective.`;

function buildCritiquePrompt(input: RecommendationCritiqueInput): string {
  const lines: string[] = [];
  lines.push(`Symbol: ${input.symbol}. Original recommendation: ${input.action} (confidence ${input.confidenceScore}/10).`);
  lines.push(`Thesis at the time: ${input.thesisAtRecommendation}`);
  lines.push(`Stated expected outcome: ${input.expectedOutcome} (horizon: ${input.expectedTimeHorizon})`);
  lines.push(
    `Deterministic grading — wasCorrect=${input.wasCorrect ?? 'n/a'}, thesisCorrect=${input.thesisCorrect ?? 'n/a'}, ` +
      `timingCorrect=${input.timingCorrect ?? 'n/a'}, 90-day return=${input.return90d !== null ? `${input.return90d.toFixed(1)}%` : 'n/a'}, ` +
      `90-day alpha vs. SPY=${input.alpha90d !== null ? `${input.alpha90d.toFixed(1)}pp` : 'n/a'}.`
  );
  if (input.thesisChangedSince) lines.push(`Thesis changed since this recommendation: ${input.thesisChangedSince}`);
  if (input.missingEvidence) lines.push(`Data that was missing at recommendation time: ${input.missingEvidence}`);
  lines.push('\nProduce a structured critique per the schema, following the rules above.');
  return lines.join('\n');
}

function buildThesisPrompt(input: ThesisNarrativeInput): string {
  const lines: string[] = [];
  lines.push(`Symbol: ${input.symbol} (${input.name}), sector: ${input.sector ?? 'unclassified'}`);
  lines.push(
    `Quote: price ${input.quote.price.toFixed(2)}, day change ${input.quote.changePercent.toFixed(2)}% (quality: ${input.quote.quality})`
  );
  lines.push(`Technicals: ${input.technicals.trend} — ${input.technicals.notes}`);

  if (input.fundamentals) {
    const f = input.fundamentals;
    lines.push(
      `Fundamentals: marketCap=${f.marketCap ?? 'unknown'}, peRatio=${f.peRatio ?? 'unknown'}, eps=${f.eps ?? 'unknown'}, dividendYield=${f.dividendYield ?? 'unknown'}`
    );
  } else {
    lines.push('Fundamentals: NOT AVAILABLE.');
  }

  lines.push(`Deterministic conviction score: ${input.convictionScore}/100. ${input.convictionSummary}`);

  if (input.filings.length > 0) {
    lines.push('Recent SEC filings:');
    for (const f of input.filings) lines.push(`  - ${f.formType} filed ${f.filedAt.toISOString().slice(0, 10)}`);
  } else {
    lines.push('Recent SEC filings: none found.');
  }

  if (input.news.length > 0) {
    lines.push('Recent news:');
    for (const n of input.news) {
      lines.push(
        `  - [${n.materialityLevel}, sentiment ${n.sentiment ?? 'n/a'}] ${n.headline} (${n.source}, ${n.publishedAt.toISOString().slice(0, 10)})`
      );
    }
  } else {
    lines.push('Recent news: none surfaced.');
  }

  lines.push(`\nAI memory (past recommendations, alerts, conviction trend for this holding):\n${input.memoryContext}`);

  if (input.previousThesis) {
    const p = input.previousThesis;
    lines.push(
      `\nPrevious thesis (established review, last reviewed ${p.lastReviewedAt.toISOString().slice(0, 10)}, conviction was ${p.convictionScore}/100):\n` +
        `Original thesis: ${p.originalThesis}\nBull case: ${p.bullCase}\nBear case: ${p.bearCase}\nRisks: ${p.risks}`
    );
  } else {
    lines.push('\nNo previous thesis exists — this is the first review for this holding.');
  }

  lines.push('\nProduce a structured thesis review per the schema, following the rules above.');
  return lines.join('\n');
}

/**
 * REAL implementation — calls Claude (model configured via ANTHROPIC_MODEL,
 * see anthropicModel.ts) with structured outputs so the response is
 * guaranteed to match HoldingAnalysisSchema. Adaptive thinking is left on so
 * the model can reason through the synthesis when it judges that useful;
 * effort is capped at "medium" since this runs per-holding in a batch job,
 * not an interactive chat.
 */
class ClaudeAiReasoningProvider implements AiReasoningProvider {
  private client = new Anthropic();

  constructor(private readonly model: SupportedAnthropicModel) {}

  async analyzeHolding(input: HoldingAnalysisInput): Promise<HoldingAnalysisOutput> {
    const response = await this.client.messages.parse({
      model: this.model,
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

  async generateThesisNarrative(input: ThesisNarrativeInput): Promise<ThesisNarrativeOutput> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(ThesisNarrativeSchema),
      },
      system: THESIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildThesisPrompt(input) }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('Claude declined to review this thesis (refusal).');
    }
    if (!response.parsed_output) {
      throw new Error('Claude response did not include parseable structured output.');
    }
    return response.parsed_output;
  }

  async critiqueRecommendation(input: RecommendationCritiqueInput): Promise<CritiqueOutput> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(CritiqueSchema),
      },
      system: CRITIQUE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildCritiquePrompt(input) }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('Claude declined to critique this recommendation (refusal).');
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
      expectedOutcome: 'Not stated — no AI reasoning provider configured.',
      expectedTimeHorizon: 'Not stated — no AI reasoning provider configured.',
      explainability: {
        whyNow: 'Not assessed — configure ANTHROPIC_API_KEY for real reasoning.',
        whyNot: 'Not assessed.',
        supportingEvidence: 'Not assessed.',
        contradictingEvidence: 'Not assessed.',
        keyAssumptions: 'Not assessed.',
        invalidationConditions: 'Not assessed.',
        vsCashAndSpy:
          input.portfolioContext.spyRecentReturnPct !== null
            ? `SPY returned ${input.portfolioContext.spyRecentReturnPct.toFixed(1)}% over the recent lookback (${input.portfolioContext.spyAnnualizedVolatilityPct !== null ? `${input.portfolioContext.spyAnnualizedVolatilityPct.toFixed(1)}% annualized volatility` : 'volatility unavailable'}) — no AI reasoning provider configured to compare this holding's outlook against it.`
            : 'Not assessed — SPY data and AI reasoning provider both unavailable.',
        vsCurrentAllocation:
          input.portfolioContext.thisSymbolCurrentWeightPct > 0
            ? `Currently ${input.portfolioContext.thisSymbolCurrentWeightPct.toFixed(1)}% of the portfolio — no AI reasoning provider configured to assess allocation fit.`
            : 'Not assessed — no AI reasoning provider configured.',
        baseCase: unavailableNote,
        primaryCatalyst: unavailableNote,
        biggestUnknown: unavailableNote,
        biggestRisk: unavailableNote,
        whyConfidenceNotHigher: 'No AI reasoning provider configured — confidence is pinned low by default, not calibrated.',
      },
    };
  }

  async generateThesisNarrative(input: ThesisNarrativeInput): Promise<ThesisNarrativeOutput> {
    const unavailableNote = 'Not available — no AI reasoning provider configured (set ANTHROPIC_API_KEY).';
    const facts = `Conviction score: ${input.convictionScore}/100. ${input.convictionSummary} Technical trend: ${input.technicals.trend}.`;

    if (input.previousThesis) {
      return {
        companyOverview: input.previousThesis.companyOverview,
        originalThesis: input.previousThesis.originalThesis,
        growthDrivers: input.previousThesis.growthDrivers,
        competitiveAdvantages: input.previousThesis.competitiveAdvantages,
        risks: input.previousThesis.risks,
        bullCase: input.previousThesis.bullCase,
        bearCase: input.previousThesis.bearCase,
        catalysts: input.previousThesis.catalysts,
        investmentHorizon: input.previousThesis.investmentHorizon,
        whatWouldStrengthen: input.previousThesis.whatWouldStrengthen,
        whatWouldWeaken: input.previousThesis.whatWouldWeaken,
        sellConditions: input.previousThesis.sellConditions,
        thesisChanged: false,
        confidenceChanged: false,
        riskChanged: false,
        valuationChanged: false,
        returnExpectationChanged: false,
        whatChanged: '',
        whyChanged: '',
      };
    }

    return {
      companyOverview: `[Heuristic — no AI reasoning provider configured] ${input.name} (${input.symbol}), sector: ${input.sector ?? 'unclassified'}.`,
      originalThesis: `[Heuristic summary, not investment analysis] ${facts}`,
      growthDrivers: unavailableNote,
      competitiveAdvantages: unavailableNote,
      risks: unavailableNote,
      bullCase: unavailableNote,
      bearCase: unavailableNote,
      catalysts: unavailableNote,
      investmentHorizon: 'Unknown — no AI reasoning provider configured.',
      whatWouldStrengthen: unavailableNote,
      whatWouldWeaken: unavailableNote,
      sellConditions: unavailableNote,
      thesisChanged: false,
      confidenceChanged: false,
      riskChanged: false,
      valuationChanged: false,
      returnExpectationChanged: false,
      whatChanged: '',
      whyChanged: '',
    };
  }

  async critiqueRecommendation(input: RecommendationCritiqueInput): Promise<CritiqueOutput> {
    return {
      lessonsLearned: `Not available — no AI reasoning provider configured (set ANTHROPIC_API_KEY). Deterministic grading only: wasCorrect=${input.wasCorrect ?? 'n/a'}, thesisCorrect=${input.thesisCorrect ?? 'n/a'}, timingCorrect=${input.timingCorrect ?? 'n/a'}.`,
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
      // Only 1 retry (2 attempts) for Claude calls — these run inside a
      // per-holding batch job, so a full 3-attempt backoff per holding
      // would multiply badly across a large portfolio.
      return await timedProviderCall('claude', 'analyzeHolding', () => this.real.analyzeHolding(input), { attempts: 2 });
    } catch (err) {
      console.error(`AI reasoning provider failed for ${input.symbol}; falling back to heuristic summary:`, err);
      return timedProviderCall('claude', 'analyzeHolding', () => this.heuristic.analyzeHolding(input), undefined, 'FALLBACK');
    }
  }

  async generateThesisNarrative(input: ThesisNarrativeInput): Promise<ThesisNarrativeOutput> {
    try {
      return await timedProviderCall('claude', 'generateThesisNarrative', () => this.real.generateThesisNarrative(input), { attempts: 2 });
    } catch (err) {
      console.error(`AI reasoning provider failed for ${input.symbol} thesis review; falling back to heuristic summary:`, err);
      return timedProviderCall('claude', 'generateThesisNarrative', () => this.heuristic.generateThesisNarrative(input), undefined, 'FALLBACK');
    }
  }

  async critiqueRecommendation(input: RecommendationCritiqueInput): Promise<CritiqueOutput> {
    try {
      return await timedProviderCall('claude', 'critiqueRecommendation', () => this.real.critiqueRecommendation(input), { attempts: 2 });
    } catch (err) {
      console.error(`AI reasoning provider failed for ${input.symbol} critique; falling back to heuristic summary:`, err);
      return timedProviderCall('claude', 'critiqueRecommendation', () => this.heuristic.critiqueRecommendation(input), undefined, 'FALLBACK');
    }
  }
}

const heuristicProvider = new HeuristicAiReasoningProvider();

/**
 * Resolving the model happens eagerly, at module load, only when Claude is
 * actually going to be used (ANTHROPIC_API_KEY set). An unsupported
 * ANTHROPIC_MODEL throws immediately with an actionable message instead of
 * surfacing as a confusing 404 from Anthropic deep inside a background job.
 * If no key is configured, the model setting is irrelevant — heuristic mode
 * doesn't call Claude at all — so it's intentionally not validated then.
 */
function createAiReasoningProvider(): AiReasoningProvider {
  if (!process.env.ANTHROPIC_API_KEY) return heuristicProvider;

  const model: SupportedAnthropicModel = resolveAnthropicModel();
  return new FallbackAiReasoningProvider(new ClaudeAiReasoningProvider(model), heuristicProvider);
}

export const aiReasoningProvider: AiReasoningProvider = createAiReasoningProvider();

/**
 * A real, minimal (max_tokens: 1, no thinking, no structured output) Claude
 * call to verify the API key and configured model actually work — used
 * only by the provider-readiness check (`npm run providers:check`), never
 * by normal recommendation generation, since a genuine auth/model failure
 * should surface there rather than silently degrade to the heuristic
 * fallback the way every other call site correctly does.
 */
export async function checkClaudeAuth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, latencyMs: 0, error: 'ANTHROPIC_API_KEY is not set' };
  const start = Date.now();
  try {
    const model = resolveAnthropicModel();
    const client = new Anthropic();
    await client.messages.create({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] });
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}
