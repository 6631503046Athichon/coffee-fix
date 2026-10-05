// CSV export helpers shared by every "Export CSV" button.
//
// Callers pass the rows the page is showing after its filters and search are
// applied (every page of them, not only the visible one); these helpers only
// turn those rows into a file Excel and Google Sheets open correctly. With no
// rows, downloadCsv says so instead of downloading a file with only headers.

import { showAppToast } from './appToast';

/** What an export says when the filters leave no rows. */
export const NOTHING_TO_EXPORT_MESSAGE = 'Nothing to export - no rows match the current filters';

export type CsvCell = string | number | null | undefined;

/**
 * A text cell starting with one of these can run as a formula when the file
 * is opened in a spreadsheet (CSV injection), so it gets a leading quote.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/** "-1.50" is a plain negative number, not a formula, and stays as it is. */
const PLAIN_NEGATIVE_NUMBER = /^-\d+(\.\d+)?$/;

const formatCell = (cell: CsvCell): string => {
  let text: string;
  if (cell === null || cell === undefined) {
    text = '';
  } else if (typeof cell === 'number') {
    // Numbers are written as they are; the caller decides on decimals.
    text = Number.isFinite(cell) ? String(cell) : '';
  } else {
    text = String(cell);
    if (FORMULA_START.test(text) && !PLAIN_NEGATIVE_NUMBER.test(text)) {
      text = `'${text}`;
    }
  }
  return `"${text.replace(/"/g, '""')}"`;
};

/** Builds CSV text: every cell quoted, embedded quotes doubled, CRLF between rows. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((row) => row.map(formatCell).join(',')).join('\r\n');
}

/**
 * Downloads the rows as a CSV file. The UTF-8 byte order mark makes Excel
 * read Thai (and any other non-ASCII) text correctly.
 *
 * With no rows nothing is downloaded: the app shows NOTHING_TO_EXPORT_MESSAGE
 * as a toast instead of the button silently doing nothing, and this returns
 * false (true when the file was handed to the browser).
 */
export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]): boolean {
  if (rows.length === 0) {
    showAppToast({ type: 'info', message: NOTHING_TO_EXPORT_MESSAGE });
    return false;
  }
  const blob = new Blob([`\uFEFF${toCsv(headers, rows)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Revoked on the next tick: some browsers start reading the file only
    // after the click handler returns.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return true;
}

/** Today's (or the given) date as YYYY-MM-DD in the viewer's own time zone. */
export function localDateStamp(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MAX_PART_LENGTH = 40;
const MAX_FILTER_LENGTH = 100;

/** Keeps letters (Thai included, with their vowel and tone marks) and digits; anything else becomes '-'. */
const slugify = (text: string, maxLength: number): string => {
  const slug = text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return Array.from(slug).slice(0, maxLength).join('').replace(/-+$/, '');
};

/**
 * '<base>[_<filters>]_<YYYY-MM-DD>.csv', for example
 * csvFilename('roast-log', ['Natural', 'Grade A']) -> 'roast-log_natural_grade-a_2026-09-23.csv'.
 * Leave out filters that are not narrowing anything ('All …', empty) before calling.
 */
export function csvFilename(
  base: string,
  filterParts: (string | null | undefined | false)[] = [],
): string {
  const parts = filterParts
    .filter((part): part is string => typeof part === 'string')
    .map((part) => slugify(part, MAX_PART_LENGTH))
    .filter(Boolean);
  const filters = Array.from(parts.join('_'))
    .slice(0, MAX_FILTER_LENGTH)
    .join('')
    .replace(/[-_]+$/, '');
  const name = slugify(base, MAX_PART_LENGTH) || 'export';
  return `${[name, filters, localDateStamp()].filter(Boolean).join('_')}.csv`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date for a CSV cell as YYYY-MM-DD. Plain dates pass through untouched;
 * timestamps become the calendar day in the viewer's time zone, the same day
 * the page shows for them.
 */
export function csvDate(value?: string | Date | null): string {
  if (!value) return '';
  if (typeof value === 'string' && DATE_ONLY.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '';
  return localDateStamp(date);
}

/** A timestamp for a CSV cell as 'YYYY-MM-DD HH:mm' in the viewer's time zone. */
export function csvDateTime(value?: string | Date | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${localDateStamp(date)} ${hours}:${minutes}`;
}

/** A number with fixed decimals ('8.50'), or an empty cell when there is no number. */
export function csvFixed(value: number | null | undefined, decimals = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(decimals) : '';
}
