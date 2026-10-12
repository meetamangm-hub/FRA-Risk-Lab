import { TRADING_DAYS } from './data';
import { benchmarkReturnsOn, portfolioReturns, returnPanel, WindowError } from './returns';
import {
  avgPairwiseCorr, corrFromCov, covMatrix, excessKurtosis, mean, skewness, sortedCopy, stdev,
} from './stats';
import { betaOf, diversificationRatio, drawdowns, historicalVaR, parametricVaR, quadForm } from './risk';
import { mcVaR, simulatePortfolioCached, CovarianceError, DEFAULT_MC, type McOptions } from './montecarlo';
import type {
  Benchmark, Dataset, DateWindow, PortfolioMetrics, PortfolioSpec, TailSet, ValidationIssue,
} from './types';

export interface MetricOptions {
  confidence: number; // e.g. 0.95
  nSims: number;
  seed: number;
  withMonteCarlo: boolean;
  benchmark?: Benchmark | null;
  dataKey?: string; // identifies the dataset in the Monte Carlo cache
  mc?: McOptions;
  riskFree?: number; // annual, e.g. 0.065
}

export const MIN_OBS_WARN = 60;
export const MIN_OBS_HARD = 20;

/** Input validation shown live in the UI; an 'error' blocks calculation (nothing is silently repaired). */
export function validatePortfolio(p: PortfolioSpec, ds: Dataset): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const tot = p.holdings.reduce((s, h) => s + h.weight, 0);
  if (p.holdings.length === 0) out.push({ level: 'error', message: `${p.label}: no stocks selected.` });
  if (Math.abs(tot - 1) > 5e-5)
    out.push({ level: 'error', message: `${p.label}: weights sum to ${(tot * 100).toFixed(2)}%, not 100%.` });
  for (const h of p.holdings) {
    if (h.weight < 0) out.push({ level: 'error', message: `${p.label}: ${h.ticker} has a negative weight; short positions are not allowed (long-only).` });
    if (!Number.isFinite(h.weight)) out.push({ level: 'error', message: `${p.label}: ${h.ticker} weight is not a number.` });
    if (!ds.tickers.includes(h.ticker)) out.push({ level: 'error', message: `${p.label}: no price data for ${h.ticker}.` });
  }
  if (!(p.investment > 0)) out.push({ level: 'error', message: `${p.label}: investment must be greater than zero.` });
  if (p.holdings.length > 0 && p.holdings.length < 10)
    out.push({ level: 'warning', message: `${p.label}: has ${p.holdings.length} stocks; the brief asks for at least 10.` });
  return out;
}

export function validateWindow(ds: Dataset, p: PortfolioSpec, win: DateWindow, name: string): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  try {
    const panel = returnPanel(ds, p.holdings.map((h) => h.ticker), win);
    const n = panel.dates.length;
    if (n < MIN_OBS_HARD) out.push({ level: 'error', message: `${name}: only ${n} return observations for ${p.label}; at least ${MIN_OBS_HARD} are needed.` });
    else if (n < MIN_OBS_WARN) out.push({ level: 'warning', message: `${name}: only ${n} return observations for ${p.label}; covariance and tail estimates are noisy below ${MIN_OBS_WARN}.` });
    if (panel.droppedRows > 0) out.push({ level: 'warning', message: `${name}: ${panel.droppedRows} dates dropped because a stock had no price (not filled).` });
  } catch (e) {
    out.push({ level: 'error', message: `${name}: ${(e as Error).message}` });
  }
  return out;
}

export function computeMetrics(ds: Dataset, p: PortfolioSpec, win: DateWindow, opt: MetricOptions): PortfolioMetrics {
  const tickers = p.holdings.map((h) => h.ticker);
  const weights = p.holdings.map((h) => h.weight);
  const panel = returnPanel(ds, tickers, win);
  const T = panel.dates.length;
  if (T < MIN_OBS_HARD) throw new WindowError(`Only ${T} return observations in this window (need ≥ ${MIN_OBS_HARD}).`);

  const rp = portfolioReturns(panel.cols, weights);
  const m = mean(rp);
  const sd = stdev(rp);
  const sorted = sortedCopy(rp);
  const cov = covMatrix(panel.cols);
  const corr = corrFromCov(cov);
  const muD = panel.cols.map((c) => mean(c));

  const dd = drawdowns(rp);
  const hist = historicalVaR(sorted, opt.confidence, true);
  const hist95 = historicalVaR(sorted, 0.95, true);
  const hist99 = historicalVaR(sorted, 0.99, true);
  // Parametric uses the portfolio's own sample mean and sd (equivalent to wᵀμ and √wᵀΣw)
  const param = parametricVaR(m, sd, opt.confidence);
  const param95 = parametricVaR(m, sd, 0.95);
  const param99 = parametricVaR(m, sd, 0.99);

  let mc = null;
  let mcSet: TailSet | null = null;
  const flags: string[] = [];
  if (opt.withMonteCarlo) {
    try {
      const key = [opt.dataKey ?? 'd', win.start, win.end, tickers.join('|'), weights.map((x) => x.toFixed(10)).join('|'), opt.nSims, opt.seed].join('#');
      const res = simulatePortfolioCached(key, muD, cov, weights, opt.nSims, opt.seed, opt.mc ?? DEFAULT_MC);
      mc = mcVaR(res, opt.confidence);
      mcSet = { c95: mcVaR(res, 0.95), c99: mcVaR(res, 0.99), sel: mc };
    } catch (e) {
      if (e instanceof CovarianceError) flags.push(e.message);
      else throw e;
    }
  }

  let beta: number | null = null;
  let betaNote: string | undefined;
  if (opt.benchmark) {
    const rm = benchmarkReturnsOn(opt.benchmark, ds, panel.dates);
    if (rm) beta = betaOf(rp, rm);
    else betaNote = 'Benchmark does not cover every date in this window.';
  } else betaNote = 'No benchmark loaded';

  const rf = opt.riskFree ?? 0;
  const sigmaAnnual = sd * Math.sqrt(TRADING_DAYS);
  const sharpe = sigmaAnnual > 0 ? (m * TRADING_DAYS - rf) / sigmaAnnual : null;
  const pv = quadForm(weights, cov);
  const riskContrib = weights.map((wi, i) => (pv > 0 ? (wi * cov[i].reduce((s2, c, j) => s2 + c * weights[j], 0)) / pv : 0));
  const tail = {
    historical: { c95: hist95, c99: hist99, sel: hist },
    parametric: { c95: param95, c99: param99, sel: param },
    montecarlo: mcSet,
  };
  const cum = dd.wealth[dd.wealth.length - 1] - 1;
  const years = T / TRADING_DAYS;
  const cagr = Math.pow(1 + cum, 1 / years) - 1;
  if (T < MIN_OBS_WARN) flags.push(`Only ${T} observations: estimates are noisy.`);
  if (panel.droppedRows) flags.push(`${panel.droppedRows} dates dropped for missing prices.`);

  return {
    portfolio: p.id, window: win, n: T, tickers, weights, investment: p.investment,
    returns: rp, dates: panel.dates,
    meanDaily: m, sdDaily: sd, muAnnual: m * TRADING_DAYS, sigmaAnnual: sd * Math.sqrt(TRADING_DAYS),
    cumReturn: cum, cagr, skew: skewness(rp), exKurt: excessKurtosis(rp),
    confidence: opt.confidence, hist, param, mc, hist95, hist99, param95, param99,
    maxDrawdown: dd.maxDrawdown,
    ddPeakDate: dd.peakIndex === 0 ? win.start : panel.dates[dd.peakIndex - 1],
    ddTroughDate: dd.troughIndex === 0 ? win.start : panel.dates[dd.troughIndex - 1],
    wealth: dd.wealth, drawdown: dd.drawdown,
    avgCorr: avgPairwiseCorr(corr),
    diversificationRatio: diversificationRatio(weights, cov),
    beta, betaNote,
    assetMu: muD.map((x) => x * TRADING_DAYS),
    assetSigma: cov.map((row, i) => Math.sqrt(row[i]) * Math.sqrt(TRADING_DAYS)),
    cov, corr, flags, tail, sharpe, riskFree: rf, riskContrib,
  };
}

/** Sanity identity used by tests: portfolio variance from the covariance matrix equals sample variance of r_p. */
export function portfolioVarianceFromCov(m: PortfolioMetrics): number {
  return quadForm(m.weights, m.cov);
}

export const rupees = (frac: number, investment: number) => frac * investment;
