// Calendar dates ("date only" values such as a soil test date or a GAP log
// date) travel through the app as YYYY-MM-DD strings, the format DatePicker
// reads and writes. The backend sends them back as ISO datetimes, so they are
// normalised here before a form or a picker sees them.

const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ]/;

// The farms, and the business, run on Thai calendar days. The backend stores
// a date-only value at 00:00 or 12:00 UTC of its day, and older weather rows
// at the moment they were recorded; read in Bangkok, each of them is the day
// it was recorded for. Read in the viewer's own zone, a browser west of UTC
// would show the day before, and save that day back on the next edit.
const BUSINESS_TIME_ZONE = 'Asia/Bangkok';

const businessDayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const pad = (n: number) => String(n).padStart(2, '0');

// YYYY-MM-DD of a moment's calendar day in Bangkok.
const businessDay = (date: Date): string => {
  const parts = businessDayFormat.formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

// YYYY-MM-DD of a Date's calendar day in the viewer's time zone.
const localDay = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// 2026-02-30 and 2026-13-01 are not days; the Date constructor would
// silently roll them over into March or the next year.
const isRealDay = (year: number, month: number, day: number): boolean => {
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

/**
 * A date value as YYYY-MM-DD, or '' when it is missing or not a real date.
 *
 * - A plain YYYY-MM-DD passes through unchanged.
 * - An ISO datetime ("2026-09-14T17:00:00.000Z") or a Date becomes its
 *   calendar day in Bangkok, whatever zone the viewer is in: 00:00Z and
 *   12:00Z on the 15th are both the 15th, and 17:00Z on the 14th (midnight
 *   of the 15th in Thailand) is the 15th.
 * - Anything else ("15/09/2026", "garbage", a number) gives ''.
 */
export const toDateOnly = (value: unknown): string => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : businessDay(value);
  }
  if (typeof value !== 'string') return '';
  const text = value.trim();

  const plain = PLAIN_DATE.exec(text);
  if (plain) {
    return isRealDay(Number(plain[1]), Number(plain[2]), Number(plain[3])) ? text : '';
  }

  const datetime = DATETIME.exec(text);
  if (!datetime) return '';
  if (!isRealDay(Number(datetime[1]), Number(datetime[2]), Number(datetime[3]))) return '';
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : businessDay(parsed);
};

/**
 * Today, or `daysBack` days before it, as YYYY-MM-DD in the viewer's time
 * zone: the day the DatePicker's "Today" button picks. Use it for a form's
 * default date and for date filters. Slicing toISOString() gives the UTC
 * day, which in Thailand is still yesterday until 07:00.
 */
export const todayDateOnly = (daysBack = 0, now: Date = new Date()): string =>
  localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack));
