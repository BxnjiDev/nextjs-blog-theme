/**
 * NYSE regular-hours status (Atlas OS Home dashboard). Deliberately simple:
 * weekday + 9:30am-4:00pm America/New_York, no market-holiday calendar — a
 * known limitation (documented in README), not something worth a full
 * trading-calendar dependency for a "what deserves my attention right now"
 * glance card.
 */
export interface MarketStatus {
  isOpen: boolean;
  label: string;
  detail: string;
}

const MARKET_OPEN_MINUTES = 9 * 60 + 30;
const MARKET_CLOSE_MINUTES = 16 * 60;

function easternMinutesAndWeekday(date: Date): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { weekday: map.weekday, minutes: (Number(map.hour) % 24) * 60 + Number(map.minute) };
}

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const { weekday, minutes } = easternMinutesAndWeekday(now);
  const isWeekday = !['Sat', 'Sun'].includes(weekday);

  if (isWeekday && minutes >= MARKET_OPEN_MINUTES && minutes < MARKET_CLOSE_MINUTES) {
    return { isOpen: true, label: 'Market open', detail: `Closes in ${formatMinutes(MARKET_CLOSE_MINUTES - minutes)}` };
  }
  if (isWeekday && minutes < MARKET_OPEN_MINUTES) {
    return { isOpen: false, label: 'Market closed', detail: `Opens in ${formatMinutes(MARKET_OPEN_MINUTES - minutes)}` };
  }
  return { isOpen: false, label: 'Market closed', detail: 'Opens next weekday at 9:30 AM ET' };
}
