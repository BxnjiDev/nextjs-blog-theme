import type { SessionType } from './types';

/**
 * NYSE/Nasdaq exchange calendar handling — the one place session
 * boundaries, timezone conversion, and the US market holiday schedule are
 * computed, so 4h/1W aggregation (lib/marketdata/aggregate.ts) and session
 * classification never independently re-derive (and potentially
 * disagree on) "is the market open right now."
 *
 * Known, documented limitation: early closes (day before Thanksgiving, and
 * Dec 24 when it falls on a weekday) are NOT modeled — this calendar
 * treats those days as full regular sessions. That only affects how much
 * data *exists* late in those sessions (a provider simply won't have
 * candles after the real early close), never data correctness: this app
 * never fabricates a candle, so a short session just yields fewer real
 * candles, which every caller already handles as "less history than
 * requested" rather than a gap to fill.
 */
export const EXCHANGE_TIMEZONE = 'America/New_York';

const REGULAR_OPEN = { hour: 9, minute: 30 };
const REGULAR_CLOSE = { hour: 16, minute: 0 };
const PRE_MARKET_OPEN = { hour: 4, minute: 0 };
const AFTER_HOURS_CLOSE = { hour: 20, minute: 0 };

export interface ExchangeLocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday .. 6 = Saturday, matching Date#getUTCDay(). */
  weekday: number;
}

/**
 * The UTC offset (ms) the given IANA timezone was at for this instant —
 * e.g. -4h in ms during EDT. Standard "round-trip through Intl" technique:
 * format the instant as if it were UTC wall-clock in the target zone, then
 * diff against the real UTC instant.
 */
function timeZoneOffsetMs(utcInstant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(utcInstant)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - utcInstant.getTime();
}

/** Exchange-local calendar date/time + weekday for a UTC instant. */
export function getExchangeLocalParts(instant: Date, timeZone: string = EXCHANGE_TIMEZONE): ExchangeLocalParts {
  const offset = timeZoneOffsetMs(instant, timeZone);
  const local = new Date(instant.getTime() + offset);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
    weekday: local.getUTCDay(),
  };
}

/**
 * The inverse of getExchangeLocalParts: the UTC instant corresponding to a
 * given exchange-local wall-clock time. One-iteration approximation (fine
 * except within the DST-transition hour itself, which never falls inside
 * the trading session hours this app cares about).
 */
export function exchangeLocalToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string = EXCHANGE_TIMEZONE): Date {
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = timeZoneOffsetMs(new Date(wallClockAsUtc), timeZone);
  return new Date(wallClockAsUtc - offset);
}

function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): { year: number; month: number; day: number } {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = first.getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return { year, month, day };
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): { year: number; month: number; day: number } {
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month - 1, lastDayOfMonth));
  const lastWeekday = last.getUTCDay();
  const back = (lastWeekday - weekday + 7) % 7;
  return { year, month, day: lastDayOfMonth - back };
}

/** Anonymous Gregorian algorithm — Easter Sunday for a given year. */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Shifts a fixed-date holiday landing on a weekend to the NYSE-observed
 * weekday (Saturday -> preceding Friday, Sunday -> following Monday). */
function observedDate(year: number, month: number, day: number): { year: number; month: number; day: number } {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 6) return { year, month, day: day - 1 };
  if (weekday === 0) return { year, month, day: day + 1 };
  return { year, month, day };
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const holidayCache = new Map<number, Set<string>>();

/** Full-day NYSE holidays for a given year — computed deterministically
 * (no hardcoded per-year table beyond the rules themselves), so this
 * stays correct indefinitely without an annual maintenance chore. */
export function computeUSMarketHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const dates: { year: number; month: number; day: number }[] = [
    observedDate(year, 1, 1), // New Year's Day
    nthWeekdayOfMonth(year, 1, 1, 3), // MLK Day — 3rd Monday of January
    nthWeekdayOfMonth(year, 2, 1, 3), // Washington's Birthday — 3rd Monday of February
    (() => {
      const easter = easterSunday(year);
      const easterUtc = Date.UTC(year, easter.month - 1, easter.day);
      const goodFriday = new Date(easterUtc - 2 * 24 * 60 * 60 * 1000);
      return { year: goodFriday.getUTCFullYear(), month: goodFriday.getUTCMonth() + 1, day: goodFriday.getUTCDate() };
    })(),
    lastWeekdayOfMonth(year, 5, 1), // Memorial Day — last Monday of May
    ...(year >= 2022 ? [observedDate(year, 6, 19)] : []), // Juneteenth (federal holiday since 2021, NYSE-observed from 2022)
    observedDate(year, 7, 4), // Independence Day
    nthWeekdayOfMonth(year, 9, 1, 1), // Labor Day — 1st Monday of September
    nthWeekdayOfMonth(year, 11, 4, 4), // Thanksgiving — 4th Thursday of November
    observedDate(year, 12, 25), // Christmas Day
  ];

  const set = new Set(dates.map((d) => dateKey(d.year, d.month, d.day)));
  holidayCache.set(year, set);
  return set;
}

export function isUSMarketHoliday(year: number, month: number, day: number): boolean {
  return computeUSMarketHolidays(year).has(dateKey(year, month, day));
}

/** Whether the exchange-local calendar date for `instant` is a trading day
 * at all (not a weekend or holiday) — says nothing about time-of-day. */
export function isTradingDay(instant: Date): boolean {
  const parts = getExchangeLocalParts(instant);
  return !isWeekend(parts.weekday) && !isUSMarketHoliday(parts.year, parts.month, parts.day);
}

function minutesSinceMidnight(parts: ExchangeLocalParts): number {
  return parts.hour * 60 + parts.minute;
}

/** Classifies an instant into the trading-day segment it falls in, exchange-
 * local. Never guesses "regular" just because a candle exists for that
 * timestamp — always derived from the actual calendar/clock. */
export function classifySessionType(instant: Date): SessionType {
  const parts = getExchangeLocalParts(instant);
  if (isWeekend(parts.weekday) || isUSMarketHoliday(parts.year, parts.month, parts.day)) return 'closed';

  const mins = minutesSinceMidnight(parts);
  const regularOpen = REGULAR_OPEN.hour * 60 + REGULAR_OPEN.minute;
  const regularClose = REGULAR_CLOSE.hour * 60 + REGULAR_CLOSE.minute;
  const preMarketOpen = PRE_MARKET_OPEN.hour * 60 + PRE_MARKET_OPEN.minute;
  const afterHoursClose = AFTER_HOURS_CLOSE.hour * 60 + AFTER_HOURS_CLOSE.minute;

  if (mins >= regularOpen && mins < regularClose) return 'regular';
  if (mins >= preMarketOpen && mins < regularOpen) return 'pre_market';
  if (mins >= regularClose && mins < afterHoursClose) return 'after_hours';
  return 'closed';
}

export function isMarketOpen(instant: Date): boolean {
  return classifySessionType(instant) === 'regular';
}

/** Regular-session open/close as UTC instants for the given exchange-local
 * calendar date, or null when that date isn't a trading day at all. This
 * is the session anchor lib/marketdata/aggregate.ts uses to bucket 4h
 * candles from session open rather than blind clock-hour boundaries. */
export function getRegularSessionBoundsUtc(year: number, month: number, day: number): { open: Date; close: Date } | null {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (isWeekend(weekday) || isUSMarketHoliday(year, month, day)) return null;
  return {
    open: exchangeLocalToUtc(year, month, day, REGULAR_OPEN.hour, REGULAR_OPEN.minute),
    close: exchangeLocalToUtc(year, month, day, REGULAR_CLOSE.hour, REGULAR_CLOSE.minute),
  };
}
