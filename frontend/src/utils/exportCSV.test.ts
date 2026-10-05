import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOTHING_TO_EXPORT_MESSAGE,
  csvDate,
  csvDateTime,
  csvFilename,
  csvFixed,
  downloadCsv,
  localDateStamp,
  toCsv,
} from './exportCSV';
import { APP_TOAST_EVENT, type AppToast } from './appToast';

describe('toCsv', () => {
  it('quotes every cell, doubles embedded quotes and ends rows with CRLF', () => {
    const csv = toCsv(['Name', 'Note'], [
      ['Lot "A"', 'one, two'],
      ['multi\nline', 'plain'],
    ]);
    expect(csv).toBe(
      '"Name","Note"\r\n"Lot ""A""","one, two"\r\n"multi\nline","plain"',
    );
  });

  it('writes numbers as they are and leaves null or undefined cells empty', () => {
    expect(toCsv(['a', 'b', 'c', 'd', 'e'], [[8.5, -2, 0, null, undefined]])).toBe(
      '"a","b","c","d","e"\r\n"8.5","-2","0","",""',
    );
    expect(toCsv(['n'], [[Number.NaN], [Infinity]])).toBe('"n"\r\n""\r\n""');
  });

  it('defuses text that a spreadsheet would run as a formula', () => {
    const csv = toCsv(['v'], [
      ['=HYPERLINK("http://x")'],
      ['+1+2'],
      ['-2+3'],
      ['@SUM(A1)'],
      ['\t=1'],
      ['\r=1'],
      ['a=1'],
    ]);
    expect(csv.split('\r\n').slice(1)).toEqual([
      '"\'=HYPERLINK(""http://x"")"',
      '"\'+1+2"',
      '"\'-2+3"',
      '"\'@SUM(A1)"',
      '"\'\t=1"',
      '"\'\r=1"',
      '"a=1"',
    ]);
  });

  it('never alters genuine negative numbers, as numbers or as fixed-decimal text', () => {
    expect(toCsv(['kg', 'text'], [[-1.5, '-1.50']])).toBe('"kg","text"\r\n"-1.5","-1.50"');
  });

  it('keeps Thai text intact', () => {
    expect(toCsv(['หมายเหตุ'], [['ฝนตกหนัก, ลมแรง']])).toBe('"หมายเหตุ"\r\n"ฝนตกหนัก, ลมแรง"');
  });
});

describe('downloadCsv', () => {
  const OriginalBlob = globalThis.Blob;
  const { createObjectURL: originalCreate, revokeObjectURL: originalRevoke } = URL;
  let blobs: { parts: BlobPart[]; options?: BlobPropertyBag }[];
  let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;
  let click: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    blobs = [];
    class RecordingBlob extends OriginalBlob {
      constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
        super(parts, options);
        blobs.push({ parts, options });
      }
    }
    vi.stubGlobal('Blob', RecordingBlob);
    revokeObjectURL = vi.fn<(url: string) => void>();
    // jsdom has no object URLs.
    URL.createObjectURL = vi.fn(() => 'blob:csv');
    URL.revokeObjectURL = revokeObjectURL;
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    click.mockRestore();
  });

  it('starts with a UTF-8 BOM so Excel reads Thai, and downloads under the given name', () => {
    let downloadName = '';
    click.mockImplementation(function (this: HTMLAnchorElement) {
      downloadName = this.download;
      expect(this.href).toBe('blob:csv');
      expect(document.body.contains(this)).toBe(true);
    });

    downloadCsv('weather_ฟาร์ม_2026-09-23.csv', ['วันที่'], [['2026-09-23']]);

    expect(blobs).toHaveLength(1);
    expect(blobs[0].parts.join('')).toBe('\uFEFF"วันที่"\r\n"2026-09-23"');
    expect(blobs[0].options?.type).toBe('text/csv;charset=utf-8');
    expect(click).toHaveBeenCalledTimes(1);
    expect(downloadName).toBe('weather_ฟาร์ม_2026-09-23.csv');
    expect(document.querySelector('a[download]')).toBeNull();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv');
  });

  it('returns true once the file is handed to the browser', () => {
    expect(downloadCsv('lots.csv', ['Lot'], [['GBL-1']])).toBe(true);
  });

  it('with no rows downloads nothing and says why in a toast', () => {
    const toasts: AppToast[] = [];
    const listen = (event: Event) => toasts.push((event as CustomEvent<AppToast>).detail);
    window.addEventListener(APP_TOAST_EVENT, listen);
    try {
      expect(downloadCsv('gap-log_2026-09-23.csv', ['Date', 'Farm'], [])).toBe(false);
    } finally {
      window.removeEventListener(APP_TOAST_EVENT, listen);
    }

    expect(blobs).toHaveLength(0);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(toasts).toEqual([{ type: 'info', message: NOTHING_TO_EXPORT_MESSAGE }]);
    expect(NOTHING_TO_EXPORT_MESSAGE).toBe('Nothing to export - no rows match the current filters');
  });
});

describe('csvFilename', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 23, 23, 30));
  });
  afterEach(() => vi.useRealTimers());

  it('adds slugged filter parts and the local date', () => {
    expect(csvFilename('roast-log', ['Natural', 'Grade A'])).toBe(
      'roast-log_natural_grade-a_2026-09-23.csv',
    );
  });

  it('skips empty parts and works without filters', () => {
    expect(csvFilename('harvest-lots', [null, undefined, false, '', ' / '])).toBe(
      'harvest-lots_2026-09-23.csv',
    );
    expect(csvFilename('harvest-lots')).toBe('harvest-lots_2026-09-23.csv');
  });

  it('keeps Thai letters with their vowel and tone marks', () => {
    expect(csvFilename('gap-log', ['ไร่ดอยช้าง • แปลง 2', 'ใส่ปุ๋ย'])).toBe(
      'gap-log_ไร่ดอยช้าง-แปลง-2_ใส่ปุ๋ย_2026-09-23.csv',
    );
  });

  it('drops characters that are unsafe in file names and caps long parts', () => {
    const name = csvFilename('parchment-stock', ['a/b\\c:d*e?"<>|', 'x'.repeat(200)]);
    expect(name).toMatch(/^parchment-stock_a-b-c-d-e_x+_2026-09-23\.csv$/);
    expect(name.length).toBeLessThanOrEqual(160);
  });
});

describe('dates and numbers', () => {
  it('stamps the local calendar date, not the UTC one', () => {
    // 00:30 local on 1 Jan is still 31 Dec in UTC for zones east of Greenwich.
    expect(localDateStamp(new Date(2027, 0, 1, 0, 30))).toBe('2027-01-01');
    expect(localDateStamp(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('formats dates and timestamps for cells', () => {
    expect(csvDate('2026-09-16')).toBe('2026-09-16');
    expect(csvDate(new Date(2026, 8, 16, 22, 0).toISOString())).toBe('2026-09-16');
    expect(csvDate('')).toBe('');
    expect(csvDate(undefined)).toBe('');
    expect(csvDateTime(new Date(2026, 8, 16, 7, 5).toISOString())).toBe('2026-09-16 07:05');
  });

  it('fixes decimals and leaves missing numbers empty', () => {
    expect(csvFixed(8.5)).toBe('8.50');
    expect(csvFixed(85, 1)).toBe('85.0');
    expect(csvFixed(undefined)).toBe('');
    expect(csvFixed(Number.NaN)).toBe('');
  });
});
