import type { Benchmark, Dataset } from './types';

export const TRADING_DAYS = 252;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export class DataError extends Error {}

function splitCsvLine(line: string): string[] {
  return line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
}

/** Normalise the workbook's "MnM" header to the real ticker "M&M". */
export function normaliseTicker(t: string): string {
  const u = t.trim();
  if (u.toUpperCase() === 'MNM') return 'M&M';
  return u.toUpperCase();
}

function toIso(s: string): string | null {
  const t = s.trim();
  if (ISO.test(t)) return t;
  // dd-mm-yyyy or dd/mm/yyyy
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/**
 * Parse and validate a price CSV: header `Date,TICKER1,TICKER2,...`.
 * Throws DataError with a human-readable reason; never returns a half-valid dataset.
 */
export function parsePricesCsv(text: string, source: string): Dataset {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 3) throw new DataError('File needs a header row and at least two data rows.');
  const header = splitCsvLine(lines[0]);
  if (header[0].toLowerCase() !== 'date') throw new DataError('First column header must be "Date".');
  const tickers = header.slice(1).map(normaliseTicker);
  if (tickers.length < 2) throw new DataError('At least two price columns are required.');
  if (new Set(tickers).size !== tickers.length) throw new DataError('Duplicate ticker columns in header.');

  const dates: string[] = [];
  const cols = tickers.map(() => new Float64Array(lines.length - 1));
  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r]);
    if (cells.length !== header.length)
      throw new DataError(`Row ${r + 1}: expected ${header.length} columns, found ${cells.length}.`);
    const iso = toIso(cells[0]);
    if (!iso) throw new DataError(`Row ${r + 1}: cannot read date "${cells[0]}".`);
    if (dates.length && iso <= dates[dates.length - 1])
      throw new DataError(`Row ${r + 1}: dates must be strictly increasing (${iso} follows ${dates[dates.length - 1]}).`);
    const idx = dates.length;
    dates.push(iso);
    for (let j = 0; j < tickers.length; j++) {
      const raw = cells[j + 1];
      if (raw === '' || raw.toLowerCase() === 'nan' || raw.toLowerCase() === 'na') {
        cols[j][idx] = NaN;
        continue;
      }
      const v = Number(raw);
      if (!Number.isFinite(v)) throw new DataError(`Row ${r + 1}, ${tickers[j]}: "${raw}" is not a number.`);
      if (v <= 0) throw new DataError(`Row ${r + 1}, ${tickers[j]}: price must be positive (got ${raw}).`);
      cols[j][idx] = v;
    }
  }
  return { dates, tickers, prices: cols.map((c) => c.slice(0, dates.length)), source };
}

/** Benchmark CSV: `Date,Close` (extra columns ignored; "Adj Close" accepted). */
export function parseBenchmarkCsv(text: string, name: string): Benchmark {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 30) throw new DataError('Benchmark file needs at least 30 rows.');
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  if (header[0] !== 'date') throw new DataError('Benchmark first column must be "Date".');
  let ci = header.indexOf('close');
  if (ci < 0) ci = header.indexOf('adj close');
  if (ci < 0) ci = 1;
  const dates: string[] = [];
  const closes: number[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r]);
    const iso = toIso(cells[0] ?? '');
    const v = Number((cells[ci] ?? '').replace(/,/g, ''));
    if (!iso) throw new DataError(`Benchmark row ${r + 1}: bad date "${cells[0]}".`);
    if (!Number.isFinite(v) || v <= 0) {
      continue; // blank/holiday rows are skipped, never filled
    }
    if (dates.length && iso <= dates[dates.length - 1])
      throw new DataError(`Benchmark row ${r + 1}: dates must be strictly increasing.`);
    dates.push(iso);
    closes.push(v);
  }
  if (dates.length < 30) throw new DataError('Benchmark has too few valid rows.');
  return { name, dates, closes: Float64Array.from(closes) };
}

/** Index of the first date >= start and last date <= end. Returns null if none. */
export function windowRange(dates: string[], start: string, end: string): [number, number] | null {
  let lo = 0, hi = dates.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m] < start) lo = m + 1; else hi = m; }
  const i0 = lo;
  lo = 0; hi = dates.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m] <= end) lo = m + 1; else hi = m; }
  const i1 = lo - 1;
  if (i0 > i1 || i0 >= dates.length || i1 < 0) return null;
  return [i0, i1];
}

// ---------------------------------------------------------------- audit

export interface TickerAudit {
  ticker: string;
  firstDate: string | null;
  lastDate: string | null;
  observations: number;
  missing: number;
  nonPositive: number;
  zeroReturnShare: number;
  longestFlatRun: number;
  maxAbsReturn: number;
  maxAbsReturnDate: string;
  largeMoves: { date: string; ret: number }[]; // |r| >= 15 %
  annualVol: number;
}

export interface DatasetAudit {
  rows: number;
  firstDate: string;
  lastDate: string;
  tickers: number;
  duplicateDates: number;
  calendarGapsOver7: { from: string; to: string; days: number }[];
  perTicker: TickerAudit[];
  totalMissing: number;
  totalNonPositive: number;
  totalLargeMoves: number;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function auditDataset(ds: Dataset): DatasetAudit {
  const rows = ds.dates.length;
  const gaps: DatasetAudit['calendarGapsOver7'] = [];
  let dup = 0;
  for (let t = 1; t < rows; t++) {
    const d = dayDiff(ds.dates[t - 1], ds.dates[t]);
    if (d === 0) dup++;
    if (d > 7) gaps.push({ from: ds.dates[t - 1], to: ds.dates[t], days: d });
  }
  const perTicker: TickerAudit[] = ds.tickers.map((tk, j) => {
    const p = ds.prices[j];
    let first: string | null = null, last: string | null = null;
    let obs = 0, miss = 0, nonpos = 0, zero = 0, nRet = 0, run = 0, longest = 0;
    let maxAbs = 0, maxAbsDate = '';
    const large: { date: string; ret: number }[] = [];
    let s = 0, s2 = 0;
    for (let t = 0; t < rows; t++) {
      const v = p[t];
      if (Number.isNaN(v)) { miss++; continue; }
      if (v <= 0) nonpos++;
      obs++;
      if (first === null) first = ds.dates[t];
      last = ds.dates[t];
      if (t > 0 && !Number.isNaN(p[t - 1]) && p[t - 1] > 0) {
        const r = v / p[t - 1] - 1;
        nRet++;
        s += r; s2 += r * r;
        if (r === 0) { zero++; run++; if (run > longest) longest = run; } else run = 0;
        if (Math.abs(r) > maxAbs) { maxAbs = Math.abs(r); maxAbsDate = ds.dates[t]; }
        if (Math.abs(r) >= 0.15) large.push({ date: ds.dates[t], ret: r });
      }
    }
    const m = nRet ? s / nRet : 0;
    const sd = nRet > 1 ? Math.sqrt(Math.max(0, (s2 - nRet * m * m) / (nRet - 1))) : 0;
    return {
      ticker: tk, firstDate: first, lastDate: last, observations: obs, missing: miss, nonPositive: nonpos,
      zeroReturnShare: nRet ? zero / nRet : 0, longestFlatRun: longest, maxAbsReturn: maxAbs,
      maxAbsReturnDate: maxAbsDate, largeMoves: large, annualVol: sd * Math.sqrt(TRADING_DAYS),
    };
  });
  return {
    rows, firstDate: ds.dates[0], lastDate: ds.dates[rows - 1], tickers: ds.tickers.length,
    duplicateDates: dup, calendarGapsOver7: gaps, perTicker,
    totalMissing: perTicker.reduce((a, b) => a + b.missing, 0),
    totalNonPositive: perTicker.reduce((a, b) => a + b.nonPositive, 0),
    totalLargeMoves: perTicker.reduce((a, b) => a + b.largeMoves.length, 0),
  };
}
