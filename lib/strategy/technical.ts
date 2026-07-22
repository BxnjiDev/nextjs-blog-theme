import type { HistoricalPricePoint } from '@/lib/integrations';
import type { Tone } from '@/lib/theme/tone';
import type { DecisionFactor } from '@/lib/decision/types';
import type { TechnicalEvidence } from './types';

/**
 * Deterministic technical confirmation computed only from real daily
 * close+volume history (lib/integrations' HistoricalPricePoint — no
 * intrabar open/high/low is ingested by this app). Every sub-factor
 * degrades to `available: false` with a plain-English reason rather than
 * a guessed reading when there isn't enough history to support it — never
 * fabricated, per the brief. Mirrors the same "ascending by date, `close`-
 * only math" approach lib/domain/risk.ts already uses for volatility/beta,
 * so this isn't a second convention for reading price history.
 */

const MIN_SESSIONS_FOR_TREND = 20;
const MIN_SESSIONS_FOR_MOMENTUM = 10;
const MIN_SESSIONS_FOR_STRUCTURE = 30;
const MIN_SESSIONS_FOR_VOLUME = 10;
const MIN_SESSIONS_FOR_RELATIVE_STRENGTH = 20;

function ascendingByDate(history: HistoricalPricePoint[]): HistoricalPricePoint[] {
  return [...history].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function sma(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const slice = values.slice(values.length - window);
  return slice.reduce((s, v) => s + v, 0) / window;
}

function unavailable(key: string, label: string, reason: string): DecisionFactor {
  return { key, label, available: false, tone: 'muted', summary: reason };
}

function trendStructureFactor(closesAsc: number[]): DecisionFactor {
  if (closesAsc.length < MIN_SESSIONS_FOR_TREND) {
    return unavailable('trendStructure', 'Trend structure', `Not enough price history (need ${MIN_SESSIONS_FOR_TREND}+ sessions).`);
  }
  const longWindow = Math.min(50, closesAsc.length);
  const shortWindow = Math.min(20, Math.floor(longWindow / 2));
  const shortMa = sma(closesAsc, shortWindow)!;
  const longMa = sma(closesAsc, longWindow)!;
  const direction = shortMa > longMa * 1.01 ? 'up' : shortMa < longMa * 0.99 ? 'down' : 'sideways';
  const tone: Tone = direction === 'up' ? 'positive' : direction === 'down' ? 'negative' : 'neutral';
  return {
    key: 'trendStructure',
    label: 'Trend structure',
    available: true,
    tone,
    summary: `${shortWindow}-session average is ${direction === 'sideways' ? 'roughly level with' : direction === 'up' ? 'above' : 'below'} the ${longWindow}-session average — ${direction} trend.`,
  };
}

/** A close-price proxy for swing structure, not true intrabar highs/lows —
 * a local extremum in a 5-session window around each point. */
function swingStructureFactor(closesAsc: number[]): DecisionFactor {
  if (closesAsc.length < MIN_SESSIONS_FOR_STRUCTURE) {
    return unavailable('swingStructure', 'Higher highs / higher lows', `Not enough price history (need ${MIN_SESSIONS_FOR_STRUCTURE}+ sessions).`);
  }
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = 2; i < closesAsc.length - 2; i++) {
    const window = closesAsc.slice(i - 2, i + 3);
    const center = closesAsc[i];
    if (center === Math.max(...window)) swingHighs.push(center);
    if (center === Math.min(...window)) swingLows.push(center);
  }
  const recentHighs = swingHighs.slice(-3);
  const recentLows = swingLows.slice(-3);
  if (recentHighs.length < 2 || recentLows.length < 2) {
    return unavailable('swingStructure', 'Higher highs / higher lows', 'Not enough distinct swing points identified in the available history.');
  }
  const rising = (arr: number[]) => arr.every((v, i) => i === 0 || v >= arr[i - 1]);
  const falling = (arr: number[]) => arr.every((v, i) => i === 0 || v <= arr[i - 1]);

  let tone: Tone = 'neutral';
  let summary = 'Mixed swing structure — no clear higher-highs/higher-lows or lower-highs/lower-lows pattern.';
  if (rising(recentHighs) && rising(recentLows)) {
    tone = 'positive';
    summary = 'Higher highs and higher lows (close-price proxy) — constructive swing structure.';
  } else if (falling(recentHighs) && falling(recentLows)) {
    tone = 'negative';
    summary = 'Lower highs and lower lows (close-price proxy) — deteriorating swing structure.';
  }
  return { key: 'swingStructure', label: 'Higher highs / higher lows', available: true, tone, summary };
}

function momentumFactor(closesAsc: number[]): DecisionFactor {
  if (closesAsc.length < MIN_SESSIONS_FOR_MOMENTUM + 1) {
    return unavailable('momentum', 'Momentum', `Not enough price history (need ${MIN_SESSIONS_FOR_MOMENTUM + 1}+ sessions).`);
  }
  const recent = closesAsc[closesAsc.length - 1];
  const prior = closesAsc[closesAsc.length - 1 - MIN_SESSIONS_FOR_MOMENTUM];
  const rocPct = prior > 0 ? ((recent - prior) / prior) * 100 : 0;
  const tone: Tone = rocPct >= 3 ? 'positive' : rocPct <= -3 ? 'negative' : 'neutral';
  return {
    key: 'momentum',
    label: 'Momentum',
    available: true,
    tone,
    summary: `${rocPct >= 0 ? '+' : ''}${rocPct.toFixed(1)}% over the last ${MIN_SESSIONS_FOR_MOMENTUM} sessions.`,
  };
}

function volumeConfirmationFactor(historyAsc: HistoricalPricePoint[], trendTone: Tone): DecisionFactor {
  if (historyAsc.length < MIN_SESSIONS_FOR_VOLUME * 2) {
    return unavailable('volumeConfirmation', 'Volume confirmation', `Not enough volume history (need ${MIN_SESSIONS_FOR_VOLUME * 2}+ sessions).`);
  }
  const recentVols = historyAsc.slice(-MIN_SESSIONS_FOR_VOLUME).map((p) => p.volume);
  const priorVols = historyAsc.slice(-MIN_SESSIONS_FOR_VOLUME * 2, -MIN_SESSIONS_FOR_VOLUME).map((p) => p.volume);
  const recentAvg = recentVols.reduce((a, b) => a + b, 0) / recentVols.length;
  const priorAvg = priorVols.reduce((a, b) => a + b, 0) / priorVols.length;
  if (priorAvg <= 0) return unavailable('volumeConfirmation', 'Volume confirmation', 'No usable volume data.');

  const changePct = ((recentAvg - priorAvg) / priorAvg) * 100;
  const rising = changePct >= 15;
  const falling = changePct <= -15;

  if (rising && (trendTone === 'positive' || trendTone === 'negative')) {
    return {
      key: 'volumeConfirmation',
      label: 'Volume confirmation',
      available: true,
      tone: trendTone,
      summary: `Volume up ${changePct.toFixed(0)}% vs. the prior period, confirming the ${trendTone === 'positive' ? 'up' : 'down'}trend.`,
    };
  }
  if (falling) {
    return {
      key: 'volumeConfirmation',
      label: 'Volume confirmation',
      available: true,
      tone: 'neutral',
      summary: `Volume down ${Math.abs(changePct).toFixed(0)}% vs. the prior period — the move lacks strong participation.`,
    };
  }
  return {
    key: 'volumeConfirmation',
    label: 'Volume confirmation',
    available: true,
    tone: 'neutral',
    summary: `Volume roughly steady (${changePct >= 0 ? '+' : ''}${changePct.toFixed(0)}% vs. the prior period).`,
  };
}

function relativeStrengthFactor(historyAsc: HistoricalPricePoint[], benchmarkAsc: HistoricalPricePoint[]): DecisionFactor {
  const window = Math.min(MIN_SESSIONS_FOR_RELATIVE_STRENGTH, historyAsc.length, benchmarkAsc.length);
  if (historyAsc.length < MIN_SESSIONS_FOR_RELATIVE_STRENGTH || benchmarkAsc.length < MIN_SESSIONS_FOR_RELATIVE_STRENGTH) {
    return unavailable('relativeStrength', 'Relative strength', 'Not enough price history for both the symbol and the S&P 500 benchmark.');
  }
  const startSymbol = historyAsc[historyAsc.length - window].close;
  const startBench = benchmarkAsc[benchmarkAsc.length - window].close;
  if (startSymbol <= 0 || startBench <= 0) return unavailable('relativeStrength', 'Relative strength', 'Invalid benchmark price data.');

  const symbolReturn = (historyAsc[historyAsc.length - 1].close - startSymbol) / startSymbol;
  const benchReturn = (benchmarkAsc[benchmarkAsc.length - 1].close - startBench) / startBench;
  const spread = (symbolReturn - benchReturn) * 100;
  const tone: Tone = spread >= 3 ? 'positive' : spread <= -3 ? 'negative' : 'neutral';
  return {
    key: 'relativeStrength',
    label: 'Relative strength',
    available: true,
    tone,
    summary: `${spread >= 0 ? '+' : ''}${spread.toFixed(1)}pp vs. the S&P 500 over ${window} sessions.`,
  };
}

export function computeTechnicalEvidence(history: HistoricalPricePoint[], benchmarkHistory: HistoricalPricePoint[]): TechnicalEvidence {
  const historyAsc = ascendingByDate(history);
  const benchmarkAsc = ascendingByDate(benchmarkHistory);
  const closesAsc = historyAsc.map((p) => p.close);

  const trend = trendStructureFactor(closesAsc);
  const structure = swingStructureFactor(closesAsc);
  const momentum = momentumFactor(closesAsc);
  const volume = volumeConfirmationFactor(historyAsc, trend.tone);
  const relativeStrength = relativeStrengthFactor(historyAsc, benchmarkAsc);

  const factors = [trend, structure, relativeStrength, momentum, volume];
  const availableFactors = factors.filter((f) => f.available);
  const available = availableFactors.length > 0;

  let overallTone: Tone = 'neutral';
  if (available) {
    const score = availableFactors.reduce((s, f) => s + (f.tone === 'positive' ? 1 : f.tone === 'negative' ? -1 : 0), 0);
    overallTone = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
  }

  return { factors, available, overallTone };
}
