import { TRADING_DAYS } from './data';
import { portfolioReturns, returnPanel } from './returns';
import { covMatrix, mean } from './stats';
import { efficientFrontier, globalMinVariance, optimiseForTarget, type FrontierPoint, type OptStatus } from './optimizer';
import { quadForm } from './risk';
import type { Dataset, DateWindow, PortfolioSpec } from './types';

export interface PeriodOptimisation {
  windowId: string;
  label: string;
  window: DateWindow;
  n: number;
  status: OptStatus | 'error';
  message?: string;
  tickers: string[];
  weights: number[]; // optimal weights (NaN if none)
  ret: number; // annual
  vol: number;
  variance: number;
  range: [number, number];
  frontier: FrontierPoint[];
  assetMu: number[];
  assetSigma: number[];
  gmv: { ret: number; vol: number; weights: number[] } | null;
  /** The user's CURRENT weights evaluated with this period's μ and Σ. */
  current: { ret: number; vol: number };
}

export interface FrontierComparison {
  target: number;
  targetSource: 'reference-portfolio' | 'user';
  referenceLabel: string;
  tickers: string[];
  currentWeights: number[];
  periods: PeriodOptimisation[];
}

const ann = (x: number) => x * TRADING_DAYS;

export function optimiseInWindow(
  ds: Dataset, p: PortfolioSpec, win: DateWindow, windowId: string, label: string, target: number, longOnly: boolean,
): PeriodOptimisation {
  const tickers = p.holdings.map((h) => h.ticker);
  const w0 = p.holdings.map((h) => h.weight);
  const base: PeriodOptimisation = {
    windowId, label, window: win, n: 0, status: 'error', tickers, weights: tickers.map(() => NaN),
    ret: NaN, vol: NaN, variance: NaN, range: [NaN, NaN], frontier: [], assetMu: [], assetSigma: [], gmv: null,
    current: { ret: NaN, vol: NaN },
  };
  try {
    const panel = returnPanel(ds, tickers, win);
    base.n = panel.dates.length;
    if (base.n < 20) return { ...base, message: `Only ${base.n} observations in ${label}.` };
    const muA = panel.cols.map((c) => ann(mean(c)));
    const covA = covMatrix(panel.cols).map((row) => row.map(ann));
    base.assetMu = muA;
    base.assetSigma = covA.map((row, i) => Math.sqrt(row[i]));
    base.current = { ret: muA.reduce((s, m, i) => s + m * w0[i], 0), vol: Math.sqrt(quadForm(w0, covA)) };
    const res = optimiseForTarget(covA, muA, target, longOnly);
    const g = globalMinVariance(covA, muA, longOnly);
    base.range = res.range;
    base.status = res.status;
    base.message = res.message;
    base.weights = res.weights;
    base.ret = res.ret;
    base.vol = res.vol;
    base.variance = res.variance;
    base.frontier = efficientFrontier(covA, muA, 40, longOnly);
    base.gmv = g.status === 'optimal' ? { ret: g.ret, vol: g.vol, weights: g.weights } : null;
    return base;
  } catch (e) {
    return { ...base, message: (e as Error).message };
  }
}

/**
 * Time-travel test #2. The target return is the portfolio's own annualised mean daily return over the
 * reference window, held CONSTANT; μ and Σ are re-estimated in each window; weights are re-optimised.
 */
export function compareFrontiers(
  ds: Dataset, p: PortfolioSpec, windows: { id: string; label: string; window: DateWindow }[],
  referenceWindow: DateWindow, targetOverride: number | null, longOnly: boolean,
): FrontierComparison {
  const tickers = p.holdings.map((h) => h.ticker);
  const w0 = p.holdings.map((h) => h.weight);
  const refPanel = returnPanel(ds, tickers, referenceWindow);
  const refMu = ann(mean(portfolioReturns(refPanel.cols, w0)));
  const target = targetOverride ?? refMu;
  return {
    target,
    targetSource: targetOverride === null ? 'reference-portfolio' : 'user',
    referenceLabel: `${referenceWindow.start} to ${referenceWindow.end}`,
    tickers,
    currentWeights: w0,
    periods: windows.map((w) => optimiseInWindow(ds, p, w.window, w.id, w.label, target, longOnly)),
  };
}
