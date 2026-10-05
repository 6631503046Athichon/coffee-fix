// Number formatting utilities

/** Derives a stable ROA-XXXX display ID from a UUID (deterministic, no DB field needed). */
export function toRoaId(uuid: string): string {
  const num = parseInt(uuid.replace(/-/g, '').substring(0, 8), 16) % 10000;
  return 'ROA-' + num.toString().padStart(4, '0');
}

/** Derives a stable four-digit roast batch display ID from a UUID. */
export function toRoastBatchId(uuid: string): string {
  const num = parseInt(uuid.replace(/-/g, '').substring(0, 8), 16) % 10000;
  return 'RB-' + num.toString().padStart(4, '0');
}

export function toFixed2(value: number): number {
  return +Number(value).toFixed(2);
}

export function formatDecimal(value: number, decimals: number = 2): string {
  return Number(value).toFixed(decimals);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatPercentage(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatCurrency(value: number, currency: string = 'THB'): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: currency,
  }).format(value);
}

export function formatNumber(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function parseNumber(value: string): number {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

// Date formatting utilities

/**
 * The locale every page shows its dates in. The UI is English, and the
 * browser's own locale must not leak in: a Thai browser would otherwise show
 * "15 ก.ย. 2569" (Buddhist era) on an English page.
 */
export const DATE_DISPLAY_LOCALE = 'en-GB';

/**
 * A date as the pages show it: "5 Oct 2026" by default, Gregorian years
 * whatever the browser's locale. A plain YYYY-MM-DD is that calendar day.
 * Pass `locale` only where a page deliberately needs another format.
 */
export function formatDateDisplay(
  date?: string | Date | null,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
  fallback: string = '',
  locale: string = DATE_DISPLAY_LOCALE,
): string {
  if (date == null || date === '') {
    return fallback;
  }

  // A plain YYYY-MM-DD is a calendar day: read it as local midnight.
  // new Date('2026-09-15') is UTC midnight, which west of UTC is still the
  // 14th.
  const plainDay = typeof date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
  const parsed = date instanceof Date
    ? date
    : plainDay
      ? new Date(Number(plainDay[1]), Number(plainDay[2]) - 1, Number(plainDay[3]))
      : new Date(date);
  const rolledOver = !!plainDay
    && (parsed.getMonth() !== Number(plainDay[2]) - 1 || parsed.getDate() !== Number(plainDay[3]));
  if (Number.isNaN(parsed.getTime()) || rolledOver) {
    return fallback;
  }

  const format = new Intl.DateTimeFormat(locale, { calendar: 'gregory', ...options });
  if (locale !== DATE_DISPLAY_LOCALE || options.month !== 'short') {
    return format.format(parsed);
  }
  // Newer browsers spell September "Sept" in en-GB; every other page (sales,
  // purchased lots, the date picker) writes the three letters "Sep".
  return format
    .formatToParts(parsed)
    .map((part) => (part.type === 'month' && part.value === 'Sept' ? 'Sep' : part.value))
    .join('');
}
