import { TRADING_DAYS } from './data';
import { portfolioReturns, returnPanel } from './returns';
import { covMatrix, mean } from './stats';
import { efficientFrontier, globalMinVariance, LONG_ONLY, maxSharpe, optimiseForTarget, type FrontierPoint, type OptOptions, type OptStatus, type SharpePoint } from './optimizer';
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
  maxSharpe: SharpePoint | null;
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
  ds: Dataset, p: PortfolioSpec, win: DateWindow, windowId: string, label: string, target: number, opts: OptOptions, riskFree: number,
): PeriodOptimisation {
  const tickers = p.holdings.map((h) => h.ticker);
  const w0 = p.holdings.map((h) => h.weight);
  const base: PeriodOptimisation = {
    windowId, label, window: win, n: 0, status: 'error', tickers, weights: tickers.map(() => NaN),
    ret: NaN, vol: NaN, variance: NaN, range: [NaN, NaN], frontier: [], assetMu: [], assetSigma: [], gmv: null, maxSharpe: null,
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
    const res = optimiseForTarget(covA, muA, target, opts);
    const g = globalMinVariance(covA, muA, opts);
    base.range = res.range;
    base.status = res.status;
    base.message = res.message;
    base.weights = res.weights;
    base.ret = res.ret;
    base.vol = res.vol;
    base.variance = res.variance;
    base.frontier = efficientFrontier(covA, muA, 40, opts);
    base.maxSharpe = maxSharpe(covA, muA, riskFree, opts);
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
  referenceWindow: DateWindow, targetOverride: number | null, opts: OptOptions = LONG_ONLY, riskFree = 0,
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
    periods: windows.map((w) => optimiseInWindow(ds, p, w.window, w.id, w.label, target, opts, riskFree)),
  };
}

export interface AllocationVerdict {
  /** pairwise comparison against the reference-period optimum */
  rows: { windowId: string; label: string; feasible: boolean; turnoverVsReference: number | null; turnoverVsManual: number | null; maxChange: { ticker: string; pp: number } | null; nChanged: number }[];
  threshold: number;
  answer: 'yes' | 'no' | 'partial' | 'unknown';
  headline: string;
}

const half = (a: number[], b: number[]) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0) / 2;

/**
 * "Would the optimiser choose different weights?" Turnover = ½Σ|Δw| (share of the portfolio that must be reshuffled).
 * A historical optimum is "materially different" from the reference optimum when turnover ≥ threshold.
 */
export function allocationVerdict(f: FrontierComparison, threshold = 0.1): AllocationVerdict {
  const ref = f.periods.find((p) => p.windowId === 'reference');
  const refOk = ref && ref.status === 'optimal' ? ref : null;
  const rows = f.periods.map((p) => {
    const ok = p.status === 'optimal';
    let maxChange: { ticker: string; pp: number } | null = null;
    let nChanged = 0;
    if (ok && refOk && p !== refOk) {
      p.weights.forEach((w, i) => {
        const d = (w - refOk.weights[i]) * 100;
        if (Math.abs(d) >= 5) nChanged++;
        if (!maxChange || Math.abs(d) > Math.abs(maxChange.pp)) maxChange = { ticker: f.tickers[i], pp: d };
      });
    }
    return {
      windowId: p.windowId, label: p.label, feasible: ok,
      turnoverVsReference: ok && refOk && p !== refOk ? half(p.weights, refOk.weights) : null,
      turnoverVsManual: ok ? half(p.weights, f.currentWeights) : null,
      maxChange, nChanged,
    };
  });
  const hist = rows.filter((r) => r.windowId !== 'reference');
  const feas = hist.filter((r) => r.feasible && r.turnoverVsReference !== null);
  let answer: AllocationVerdict['answer'] = 'unknown';
  let headline = 'Not enough feasible periods to compare.';
  if (refOk && feas.length) {
    const diff = feas.filter((r) => (r.turnoverVsReference as number) >= threshold);
    answer = diff.length === feas.length ? 'yes' : diff.length === 0 ? 'no' : 'partial';
    const t = feas.map((r) => `${r.label} ${((r.turnoverVsReference as number) * 100).toFixed(0)}%`).join(', ');
    headline = (answer === 'yes' ? 'Yes: the optimiser picks materially different weights' : answer === 'no' ? 'No: weights stay close to the reference optimum' : 'Partly: only some periods change the weights materially') + ` (turnover vs reference: ${t}).`;
    const infeasible = hist.filter((r) => !r.feasible).map((r) => r.label);
    if (infeasible.length) headline += ` Target infeasible in: ${infeasible.join(', ')}.`;
  }
  return { rows, threshold, answer, headline };
}
