import { windowRange } from './data';
import type { Benchmark, Dataset, DateWindow, ReturnPanel } from './types';

export class WindowError extends Error {}

/**
 * Daily SIMPLE returns r_t = P_t / P_{t-1} - 1 computed ONLY from prices inside the window.
 * The first price row in the window is the base price; the first return is dated the next row.
 * A return needs both prices present, so a missing price never produces a return across a gap.
 * Rows where ANY requested ticker lacks a return are dropped for ALL tickers (synchronised panel).
 */
export function returnPanel(ds: Dataset, tickers: string[], win: DateWindow): ReturnPanel {
  const idx = tickers.map((t) => ds.tickers.indexOf(t));
  const bad = tickers.filter((_, i) => idx[i] < 0);
  if (bad.length) throw new WindowError(`No price data for: ${bad.join(', ')}.`);
  if (win.start > win.end) throw new WindowError('Start date is after end date.');
  const range = windowRange(ds.dates, win.start, win.end);
  if (!range) throw new WindowError('No price rows fall inside the selected dates.');
  const [i0, i1] = range;
  const nRows = i1 - i0 + 1;
  const keep: number[] = [];
  for (let t = i0 + 1; t <= i1; t++) {
    let ok = true;
    for (let j = 0; j < idx.length; j++) {
      const a = ds.prices[idx[j]][t - 1];
      const b = ds.prices[idx[j]][t];
      if (!(a > 0) || !(b > 0)) { ok = false; break; }
    }
    if (ok) keep.push(t);
  }
  const cols = idx.map((k) => {
    const out = new Float64Array(keep.length);
    for (let m = 0; m < keep.length; m++) {
      const t = keep[m];
      out[m] = ds.prices[k][t] / ds.prices[k][t - 1] - 1;
    }
    return out;
  });
  return {
    tickers: tickers.slice(),
    dates: keep.map((t) => ds.dates[t]),
    cols,
    nPriceRows: nRows,
    droppedRows: Math.max(0, nRows - 1 - keep.length),
  };
}

/** Constant-weight (daily-rebalanced) portfolio returns: r_p,t = Σ w_i r_i,t */
export function portfolioReturns(cols: Float64Array[], weights: number[]): Float64Array {
  const T = cols.length ? cols[0].length : 0;
  const out = new Float64Array(T);
  for (let j = 0; j < cols.length; j++) {
    const w = weights[j];
    const c = cols[j];
    for (let t = 0; t < T; t++) out[t] += w * c[t];
  }
  return out;
}

/**
 * Benchmark returns on exactly the given return dates (so beta uses synchronised observations).
 * Returns null if a return date or its previous benchmark close is not available.
 */
export function benchmarkReturnsOn(bm: Benchmark, ds: Dataset, retDates: string[]): Float64Array | null {
  const pos = new Map<string, number>();
  bm.dates.forEach((d, i) => pos.set(d, i));
  const out = new Float64Array(retDates.length);
  const dsPos = new Map<string, number>();
  ds.dates.forEach((d, i) => dsPos.set(d, i));
  for (let m = 0; m < retDates.length; m++) {
    const d = retDates[m];
    const t = dsPos.get(d);
    if (t === undefined || t === 0) return null;
    const prevDate = ds.dates[t - 1];
    const a = pos.get(prevDate);
    const b = pos.get(d);
    if (a === undefined || b === undefined) return null;
    out[m] = bm.closes[b] / bm.closes[a] - 1;
  }
  return out;
}

/** Compounded growth of 1 rupee: W_0 = 1, W_t = W_{t-1} (1 + r_t). */
export function wealthIndex(r: ArrayLike<number>): Float64Array {
  const w = new Float64Array(r.length + 1);
  w[0] = 1;
  for (let t = 0; t < r.length; t++) w[t + 1] = w[t] * (1 + r[t]);
  return w;
}
