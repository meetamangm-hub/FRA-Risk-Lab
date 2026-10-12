import { mulberry32, makeNormalGenerator } from '../src/engine/stats';
import type { Dataset, PortfolioSpec } from '../src/engine/types';

/** Deterministic synthetic price panel: business-day dates, correlated random walks. */
export function syntheticDataset(nDays = 600, tickers = ['S1', 'S2', 'S3', 'S4'], seed = 7): Dataset {
  const g = makeNormalGenerator(seed);
  const dates: string[] = [];
  const d = new Date(Date.UTC(2020, 0, 1));
  while (dates.length < nDays) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    dates.push(d.toISOString().slice(0, 10));
  }
  const prices = tickers.map(() => new Float64Array(nDays));
  const vols = tickers.map((_, j) => 0.008 + 0.004 * j);
  const mus = tickers.map((_, j) => 0.0002 + 0.0001 * j);
  for (let j = 0; j < tickers.length; j++) prices[j][0] = 100;
  for (let t = 1; t < nDays; t++) {
    const common = g();
    for (let j = 0; j < tickers.length; j++) {
      const r = mus[j] + vols[j] * (0.6 * common + 0.8 * g());
      prices[j][t] = prices[j][t - 1] * (1 + r);
    }
  }
  void mulberry32;
  return { dates, tickers, prices, source: 'synthetic' };
}

export function spec(tickers: string[], weights?: number[], investment = 1_500_000, id: 'A' | 'B' = 'A'): PortfolioSpec {
  const w = weights ?? tickers.map(() => 1 / tickers.length);
  return { id, label: `P${id}`, investment, holdings: tickers.map((t, i) => ({ ticker: t, weight: w[i] })) };
}
