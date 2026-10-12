/**
 * The single pure function that turns (config, data) into every number the UI shows.
 * Because the UI only renders `Analysis`, changing ANY input recomputes ALL dependent outputs.
 */
import stocksJson from '../data/stocks.json';
import { classify, DEFAULT_RISK, type Classification, type RiskSettings } from './classify';
import { computeMetrics, MIN_OBS_HARD, validatePortfolio, validateWindow } from './analysis';
import { compareFrontiers, type FrontierComparison } from './frontierCompare';
import { DEFAULT_MC, type McOptions } from './montecarlo';
import { LONG_ONLY, SHORTING, type OptOptions } from './optimizer';
import { returnPanel } from './returns';
import { drawdowns } from './risk';
import { portfolioReturns } from './returns';
import { stdev } from './stats';
import { TRADING_DAYS } from './data';
import type {
  Benchmark, Dataset, DateWindow, Holding, PortfolioId, PortfolioMetrics, PortfolioSpec, ValidationIssue, VarMethod, WindowId,
} from './types';

export interface StockInfo {
  ticker: string; name: string; sector: string; cap: string; rationale: string; portfolio: 'A' | 'B';
}
export const STOCKS = stocksJson as StockInfo[];
export const stockInfo = (t: string) => STOCKS.find((s) => s.ticker === t);

export const WINDOW_LABELS: Record<WindowId, string> = {
  full: 'Full history',
  reference: 'Reference',
  crisis: 'Crisis',
  calm: 'Calm',
};

export interface Config {
  investment: Record<PortfolioId, number>;
  holdings: Record<PortfolioId, Holding[]>;
  windows: Record<WindowId, DateWindow>;
  confidence: number;
  nSims: number;
  seed: number;
  /** annual target return as a fraction; null = use the portfolio's own reference-window return */
  targetReturn: number | null;
  longOnly: boolean;
  /** per-stock weight limits for the optimiser (fractions); applied only when long-only */
  minWeight: number;
  maxWeight: number;
  /** annual risk-free rate (an assumption, not data), used for Sharpe ratios and the max-Sharpe portfolio */
  riskFree: number;
  /** VaR/ES estimator used for headline numbers and the classification */
  varMethod: VarMethod;
  /** Monte Carlo assumptions */
  mcDist: 'normal' | 't';
  mcDf: number;
  mcZeroMean: boolean;
  /** show risk as % of portfolio or as ₹ amounts */
  displayUnit: 'pct' | 'inr';
  /** "materially different" allocation threshold (turnover) */
  allocThreshold: number;
  risk: RiskSettings;
  /** window for the Dashboard / VaR Lab */
  focusWindow: WindowId;
  focusPortfolio: PortfolioId;
}

export function equalHoldings(tickers: string[]): Holding[] {
  return tickers.map((t) => ({ ticker: t, weight: 1 / tickers.length }));
}

export function defaultConfig(): Config {
  const a = STOCKS.filter((s) => s.portfolio === 'A').map((s) => s.ticker);
  const b = STOCKS.filter((s) => s.portfolio === 'B').map((s) => s.ticker);
  return {
    investment: { A: 1_500_000, B: 1_500_000 },
    holdings: { A: equalHoldings(a), B: equalHoldings(b) },
    windows: {
      full: { start: '2008-01-01', end: '2026-03-30' },
      reference: { start: '2021-03-30', end: '2026-03-30' },
      crisis: { start: '2020-02-20', end: '2020-04-30' },
      calm: { start: '2016-03-01', end: '2016-10-31' },
    },
    confidence: 0.95,
    nSims: 50_000,
    seed: 42,
    targetReturn: null,
    longOnly: true,
    minWeight: 0,
    maxWeight: 1,
    riskFree: 0.065,
    varMethod: 'historical',
    mcDist: 'normal',
    mcDf: 5,
    mcZeroMean: false,
    displayUnit: 'inr',
    allocThreshold: 0.1,
    risk: JSON.parse(JSON.stringify(DEFAULT_RISK)),
    focusWindow: 'full',
    focusPortfolio: 'A',
  };
}

export const WINDOW_PRESETS: { id: string; label: string; target: WindowId; window: DateWindow; note: string }[] = [
  { id: 'covid', label: 'COVID crash', target: 'crisis', window: { start: '2020-02-20', end: '2020-04-30' }, note: 'From the pre-crash peak of the 20-stock proxy (20 Feb) through the 23 Mar trough and the volatile rebound.' },
  { id: 'gfc', label: '2008 financial crisis', target: 'crisis', window: { start: '2008-01-01', end: '2009-03-09' }, note: 'Jan-2008 start of data through the March-2009 global trough.' },
  { id: 'calm2016', label: '2016 calm stretch', target: 'calm', window: { start: '2016-03-01', end: '2016-10-31' }, note: 'After the Feb-2016 sell-off, before demonetisation (Nov 2016).' },
  { id: 'calm2017', label: '2017 calendar year', target: 'calm', window: { start: '2017-01-02', end: '2017-12-29' }, note: 'Lowest-volatility full calendar year of the proxy outside 2023.' },
  { id: 'ref5', label: 'Last 5 years', target: 'reference', window: { start: '2021-03-30', end: '2026-03-30' }, note: 'Matches the "last 5 years" note in the workbook.' },
  { id: 'ref3', label: 'Last 3 years', target: 'reference', window: { start: '2023-03-30', end: '2026-03-30' }, note: 'More recent, noisier.' },
];

export const mcOptionsOf = (c: Config): McOptions => ({ dist: c.mcDist, df: c.mcDf, zeroMean: c.mcZeroMean });
export const optOptionsOf = (c: Config): OptOptions => (c.longOnly ? { lo: Math.max(0, c.minWeight), hi: Math.min(1, c.maxWeight) } : SHORTING);

export interface WindowResult {
  metrics: PortfolioMetrics | null;
  error: string | null;
}

export interface MarketProxy {
  vol: number;
  mdd: number;
  n: number;
}

export interface Analysis {
  specs: Record<PortfolioId, PortfolioSpec>;
  issues: ValidationIssue[];
  blocking: Record<PortfolioId, boolean>;
  metrics: Record<PortfolioId, Record<WindowId, WindowResult>>;
  classification: Record<WindowId, Classification | null>;
  proxy: Record<WindowId, MarketProxy | null>;
  frontier: Record<PortfolioId, FrontierComparison | null>;
  frontierError: Record<PortfolioId, string | null>;
  overlap: string[];
  compliance: { id: string; label: string; ok: boolean; detail: string }[];
}

const WINDOW_IDS: WindowId[] = ['full', 'reference', 'crisis', 'calm'];

export function buildSpecs(cfg: Config): Record<PortfolioId, PortfolioSpec> {
  return {
    A: { id: 'A', label: 'Portfolio A (High Risk)', investment: cfg.investment.A, holdings: cfg.holdings.A },
    B: { id: 'B', label: 'Portfolio B (Low Risk)', investment: cfg.investment.B, holdings: cfg.holdings.B },
  };
}

export function analyse(cfg: Config, ds: Dataset, benchmark: Benchmark | null, dataKey = 'default'): Analysis {
  const specs = buildSpecs(cfg);
  const issues: ValidationIssue[] = [];
  const overlap = cfg.holdings.A.map((h) => h.ticker).filter((t) => cfg.holdings.B.some((h) => h.ticker === t));
  if (overlap.length) issues.push({ level: 'error', message: `Stock(s) in both portfolios: ${overlap.join(', ')}. The brief forbids repeats.` });

  const blocking: Record<PortfolioId, boolean> = { A: false, B: false };
  if (cfg.longOnly) {
    for (const id of ['A', 'B'] as PortfolioId[]) {
      const out = cfg.holdings[id].filter((h) => h.weight < cfg.minWeight - 1e-9 || h.weight > cfg.maxWeight + 1e-9).map((h) => h.ticker);
      if (out.length) issues.push({ level: 'warning', message: `Portfolio ${id}: ${out.join(', ')} outside the ${(cfg.minWeight * 100).toFixed(0)}–${(cfg.maxWeight * 100).toFixed(0)}% per-stock limit (limits bind the optimiser; your manual weights are used as typed).` });
    }
  }
  for (const id of ['A', 'B'] as PortfolioId[]) {
    const v = validatePortfolio(specs[id], ds);
    issues.push(...v);
    blocking[id] = v.some((x) => x.level === 'error') || overlap.length > 0;
  }
  for (const w of WINDOW_IDS) {
    if (cfg.windows[w].start > cfg.windows[w].end)
      issues.push({ level: 'error', message: `${WINDOW_LABELS[w]}: start date is after end date.` });
  }

  const metrics: Analysis['metrics'] = { A: {} as never, B: {} as never };
  for (const id of ['A', 'B'] as PortfolioId[]) {
    for (const w of WINDOW_IDS) {
      if (blocking[id]) { metrics[id][w] = { metrics: null, error: 'Fix portfolio inputs first.' }; continue; }
      try {
        const wi = validateWindow(ds, specs[id], cfg.windows[w], WINDOW_LABELS[w]);
        issues.push(...wi.filter((x) => x.level === 'warning'));
        const err = wi.find((x) => x.level === 'error');
        if (err) throw new Error(err.message.replace(/^[^:]+: /, ''));
        metrics[id][w] = {
          metrics: computeMetrics(ds, specs[id], cfg.windows[w], {
            confidence: cfg.confidence, nSims: cfg.nSims, seed: cfg.seed, withMonteCarlo: true, benchmark, dataKey,
            mc: mcOptionsOf(cfg), riskFree: cfg.riskFree,
          }),
          error: null,
        };
      } catch (e) {
        metrics[id][w] = { metrics: null, error: (e as Error).message };
        if (!issues.some((x) => x.message.includes(WINDOW_LABELS[w]) && x.message.includes(id)))
          issues.push({ level: 'error', message: `${WINDOW_LABELS[w]} · Portfolio ${id}: ${(e as Error).message}` });
      }
    }
  }

  const classification = {} as Analysis['classification'];
  for (const w of WINDOW_IDS) {
    const a = metrics.A[w].metrics, b = metrics.B[w].metrics;
    classification[w] = a && b ? classify(a, b, cfg.risk) : null;
  }

  // Market-stress context: equal-weight proxy of every stock in the dataset (NOT a benchmark index)
  const proxy = {} as Analysis['proxy'];
  for (const w of WINDOW_IDS) {
    try {
      const panel = returnPanel(ds, ds.tickers, cfg.windows[w]);
      if (panel.dates.length < MIN_OBS_HARD) { proxy[w] = null; continue; }
      const r = portfolioReturns(panel.cols, ds.tickers.map(() => 1 / ds.tickers.length));
      proxy[w] = { vol: stdev(r) * Math.sqrt(TRADING_DAYS), mdd: drawdowns(r).maxDrawdown, n: r.length };
    } catch { proxy[w] = null; }
  }

  const frontier: Analysis['frontier'] = { A: null, B: null };
  const frontierError: Analysis['frontierError'] = { A: null, B: null };
  for (const id of ['A', 'B'] as PortfolioId[]) {
    if (blocking[id]) { frontierError[id] = 'Fix portfolio inputs first.'; continue; }
    try {
      frontier[id] = compareFrontiers(
        ds, specs[id],
        [
          { id: 'reference', label: 'Reference', window: cfg.windows.reference },
          { id: 'crisis', label: 'Crisis', window: cfg.windows.crisis },
          { id: 'calm', label: 'Calm', window: cfg.windows.calm },
        ],
        cfg.windows.reference, cfg.targetReturn, optOptionsOf(cfg), cfg.riskFree,
      );
    } catch (e) { frontierError[id] = (e as Error).message; }
  }

  const wsum = (id: PortfolioId) => cfg.holdings[id].reduce((x, h) => x + h.weight, 0);
  const compliance = [
    { id: 'nA', label: 'Portfolio A has ≥ 10 stocks', ok: cfg.holdings.A.length >= 10, detail: `${cfg.holdings.A.length} stocks` },
    { id: 'nB', label: 'Portfolio B has ≥ 10 stocks', ok: cfg.holdings.B.length >= 10, detail: `${cfg.holdings.B.length} stocks` },
    { id: 'overlap', label: 'No stock in both portfolios', ok: overlap.length === 0, detail: overlap.length ? overlap.join(', ') : 'distinct' },
    { id: 'w', label: 'Weights total 100%', ok: Math.abs(wsum('A') - 1) <= 5e-5 && Math.abs(wsum('B') - 1) <= 5e-5, detail: `A ${(wsum('A') * 100).toFixed(1)}% · B ${(wsum('B') * 100).toFixed(1)}%` },
  ];
  return { specs, issues, blocking, metrics, classification, proxy, frontier, frontierError, overlap, compliance };
}
