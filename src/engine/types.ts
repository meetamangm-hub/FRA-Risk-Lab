export type PortfolioId = 'A' | 'B';

/** Price panel. prices[j][t] is the price of tickers[j] on dates[t]. NaN = missing. */
export interface Dataset {
  dates: string[]; // ISO yyyy-mm-dd, strictly ascending
  tickers: string[];
  prices: Float64Array[];
  source: string; // human-readable label shown in the Data page
}

export interface Benchmark {
  name: string;
  dates: string[];
  closes: Float64Array;
}

export interface DateWindow {
  start: string; // inclusive ISO date
  end: string; // inclusive ISO date
}

export type WindowId = 'full' | 'reference' | 'crisis' | 'calm';

/** Returns for a window, synchronized across the requested tickers. */
export interface ReturnPanel {
  tickers: string[];
  dates: string[]; // date of each return observation
  cols: Float64Array[]; // cols[j][t]
  nPriceRows: number;
  droppedRows: number; // observations dropped because any ticker was missing
}

export interface Holding {
  ticker: string;
  weight: number; // fraction, 0..1
}

export interface PortfolioSpec {
  id: PortfolioId;
  label: string;
  investment: number; // rupees
  holdings: Holding[];
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
}

export type MethodResult = {
  /** positive loss fraction of portfolio value (e.g. 0.031 = 3.1 %) */
  var: number;
  es: number;
  /** return quantile at alpha (negative for a loss) */
  q: number;
};

export interface PortfolioMetrics {
  portfolio: PortfolioId;
  window: DateWindow;
  n: number; // return observations
  tickers: string[];
  weights: number[];
  investment: number;
  returns: Float64Array; // daily portfolio returns
  dates: string[];
  // moments
  meanDaily: number;
  sdDaily: number;
  muAnnual: number; // arithmetic 252*mean
  sigmaAnnual: number; // sqrt(252)*sd
  cumReturn: number; // compounded over the window
  cagr: number;
  skew: number;
  exKurt: number;
  // tail risk @ requested confidence
  confidence: number;
  hist: MethodResult;
  param: MethodResult;
  mc: MethodResult | null;
  hist95: MethodResult;
  hist99: MethodResult;
  param95: MethodResult;
  param99: MethodResult;
  // drawdown
  maxDrawdown: number; // positive fraction
  ddPeakDate: string;
  ddTroughDate: string;
  wealth: Float64Array; // starts at 1, length n+1
  drawdown: Float64Array; // length n+1
  // structure
  avgCorr: number;
  diversificationRatio: number;
  beta: number | null;
  betaNote?: string;
  // stock level
  assetMu: number[]; // annual
  assetSigma: number[]; // annual
  cov: number[][]; // daily
  corr: number[][];
  flags: string[];
}
