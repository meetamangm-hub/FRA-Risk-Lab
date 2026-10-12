import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyse, defaultConfig, STOCKS } from '../src/engine/model';
import { auditDataset, parsePricesCsv, DataError, normaliseTicker, parseBenchmarkCsv } from '../src/engine/data';
import { returnPanel } from '../src/engine/returns';
import { classify, DEFAULT_RISK, directionOf } from '../src/engine/classify';
import { computeMetrics } from '../src/engine/analysis';
import { syntheticDataset, spec } from './helpers';

const real = parsePricesCsv(readFileSync('src/data/prices.csv', 'utf8'), 'workbook');

describe('real workbook data', () => {
  it('has the audited shape', () => {
    expect(real.dates.length).toBe(4493);
    expect(real.dates[0]).toBe('2008-01-01');
    expect(real.dates[real.dates.length - 1]).toBe('2026-03-30');
    expect(real.tickers.length).toBe(20);
    expect(real.tickers).toContain('M&M');
    expect(real.tickers).not.toContain('MNM');
    const a = auditDataset(real);
    expect(a.totalMissing).toBe(0);
    expect(a.totalNonPositive).toBe(0);
    expect(a.duplicateDates).toBe(0);
  });
  it('default configuration matches the brief: 10+10 distinct stocks, ₹15 lakh each, equal weights', () => {
    const c = defaultConfig();
    expect(c.holdings.A.length).toBe(10);
    expect(c.holdings.B.length).toBe(10);
    const all = [...c.holdings.A, ...c.holdings.B].map((h) => h.ticker);
    expect(new Set(all).size).toBe(20);
    expect(c.investment.A).toBe(1_500_000);
    expect(c.investment.B).toBe(1_500_000);
    c.holdings.A.forEach((h) => expect(h.weight).toBeCloseTo(0.1, 12));
    expect(STOCKS.length).toBe(20);
    all.forEach((t) => expect(real.tickers).toContain(t));
  });
  it('full pipeline runs on real data for all windows and both portfolios', () => {
    const an = analyse(defaultConfig(), real, null);
    expect(an.issues.filter((i) => i.level === 'error')).toEqual([]);
    for (const id of ['A', 'B'] as const) for (const w of ['full', 'reference', 'crisis', 'calm'] as const) {
      const m = an.metrics[id][w].metrics!;
      expect(m, `${id}/${w}: ${an.metrics[id][w].error}`).not.toBeNull();
      expect(m.hist95.var).toBeGreaterThan(0);
      expect(m.hist99.es).toBeGreaterThanOrEqual(m.hist95.es);
      expect(m.mc).not.toBeNull();
      expect(m.beta).toBeNull(); // no benchmark loaded → never invented
    }
    expect(an.frontier.A).not.toBeNull();
    expect(an.classification.crisis).not.toBeNull();
  });
  it('crisis window selects exactly the expected return observations', () => {
    const p = returnPanel(real, ['TCS', 'ITC'], { start: '2020-02-20', end: '2020-03-23' });
    const first = real.dates.indexOf('2020-02-20'), last = real.dates.indexOf('2020-03-23');
    expect(p.dates.length).toBe(last - first);
    expect(p.dates[0]).toBe(real.dates[first + 1]);
    expect(p.dates[p.dates.length - 1]).toBe('2020-03-23');
  });
});

describe('automatic recalculation', () => {
  const ds = syntheticDataset(800, ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
  const base = () => {
    const c = defaultConfig();
    c.holdings = { A: ['S1', 'S2', 'S3'].map((t) => ({ ticker: t, weight: 1 / 3 })), B: ['S4', 'S5', 'S6'].map((t) => ({ ticker: t, weight: 1 / 3 })) };
    c.windows = {
      full: { start: ds.dates[0], end: ds.dates[799] }, reference: { start: ds.dates[400], end: ds.dates[799] },
      crisis: { start: ds.dates[100], end: ds.dates[160] }, calm: { start: ds.dates[200], end: ds.dates[330] },
    };
    c.nSims = 5000;
    return c;
  };
  it('doubling the investment doubles rupee VaR/ES and leaves percentages unchanged', () => {
    const c1 = base(), c2 = base();
    c2.investment.A = 2 * c1.investment.A;
    const m1 = analyse(c1, ds, null).metrics.A.full.metrics!, m2 = analyse(c2, ds, null).metrics.A.full.metrics!;
    expect(m2.hist.var).toBe(m1.hist.var);
    expect(m2.investment * m2.hist.var).toBeCloseTo(2 * m1.investment * m1.hist.var, 6);
    expect(m2.investment * m2.hist.es).toBeCloseTo(2 * m1.investment * m1.hist.es, 6);
    expect(m2.investment * m2.mc!.var).toBeCloseTo(2 * m1.investment * m1.mc!.var, 6);
  });
  it('changing a weight recalculates returns, volatility, VaR, ES, drawdown and the verdict inputs', () => {
    const c1 = base(), c2 = base();
    c2.holdings.A = [{ ticker: 'S1', weight: 0.7 }, { ticker: 'S2', weight: 0.2 }, { ticker: 'S3', weight: 0.1 }];
    const a = analyse(c1, ds, null).metrics.A.full.metrics!, b = analyse(c2, ds, null).metrics.A.full.metrics!;
    expect(b.sigmaAnnual).not.toBeCloseTo(a.sigmaAnnual, 6);
    expect(b.hist.var).not.toBe(a.hist.var);
    expect(b.hist.es).not.toBe(a.hist.es);
    expect(b.param.var).not.toBe(a.param.var);
    expect(b.mc!.var).not.toBe(a.mc!.var);
    expect(b.maxDrawdown).not.toBe(a.maxDrawdown);
    // untouched portfolio is unchanged
    const bb1 = analyse(c1, ds, null).metrics.B.full.metrics!, bb2 = analyse(c2, ds, null).metrics.B.full.metrics!;
    expect(bb2.sigmaAnnual).toBe(bb1.sigmaAnnual);
  });
  it('changing the date range changes the observation count and the statistics', () => {
    const c1 = base(), c2 = base();
    c2.windows.full = { start: ds.dates[0], end: ds.dates[399] };
    const a = analyse(c1, ds, null).metrics.A.full.metrics!, b = analyse(c2, ds, null).metrics.A.full.metrics!;
    expect(a.n).toBe(799);
    expect(b.n).toBe(399);
    expect(b.sigmaAnnual).not.toBe(a.sigmaAnnual);
  });
  it('changing the confidence level changes VaR/ES, and 99% VaR ≥ 95% VaR', () => {
    const c1 = base(), c2 = base();
    c2.confidence = 0.99;
    const a = analyse(c1, ds, null).metrics.A.full.metrics!, b = analyse(c2, ds, null).metrics.A.full.metrics!;
    expect(b.hist.var).toBeGreaterThanOrEqual(a.hist.var);
    expect(b.hist.var).toBe(b.hist99.var);
    expect(a.hist.var).toBe(a.hist95.var);
  });
  it('changing the target return changes the optimisation; changing the window changes weights', () => {
    const c1 = base(), c2 = base();
    c2.targetReturn = (analyse(c1, ds, null).frontier.A!.target) * 0.5;
    const f1 = analyse(c1, ds, null).frontier.A!, f2 = analyse(c2, ds, null).frontier.A!;
    expect(f2.targetSource).toBe('user');
    expect(f1.periods[0].weights.join()).not.toBe(f2.periods[0].weights.join());
  });
  it('the same target return is used in every period', () => {
    const f = analyse(base(), ds, null).frontier.A!;
    for (const p of f.periods) if (p.status === 'optimal') expect(p.ret).toBeCloseTo(f.target, 8);
  });
  it('invalid weights produce an explicit error and block calculation (no silent repair)', () => {
    const c = base();
    c.holdings.A = [{ ticker: 'S1', weight: 0.5 }, { ticker: 'S2', weight: 0.2 }, { ticker: 'S3', weight: 0.1 }];
    const an = analyse(c, ds, null);
    expect(an.issues.some((i) => i.level === 'error' && /sum to 80\.00%/.test(i.message))).toBe(true);
    expect(an.metrics.A.full.metrics).toBeNull();
    expect(an.metrics.B.full.metrics).not.toBeNull();
    expect(an.frontier.A).toBeNull();
  });
  it('negative weights, duplicate stocks across portfolios and short windows are flagged', () => {
    const c = base();
    c.holdings.A = [{ ticker: 'S1', weight: 1.2 }, { ticker: 'S2', weight: -0.2 }, { ticker: 'S3', weight: 0 }];
    expect(analyse(c, ds, null).issues.some((i) => /negative weight/.test(i.message))).toBe(true);
    const d = base(); d.holdings.B[0] = { ticker: 'S1', weight: 1 / 3 };
    expect(analyse(d, ds, null).overlap).toEqual(['S1']);
    const e = base(); e.windows.crisis = { start: ds.dates[10], end: ds.dates[14] };
    expect(analyse(e, ds, null).metrics.A.crisis.error).toMatch(/observations/);
  });
});

describe('data validation', () => {
  it('rejects malformed uploads with a clear reason', () => {
    expect(() => parsePricesCsv('Date,A\n2020-01-01,1', 'x')).toThrow(DataError);
    expect(() => parsePricesCsv('Date,A,B\n2020-01-02,1,2\n2020-01-01,1,2\n2020-01-03,1,2', 'x')).toThrow(/strictly increasing/);
    expect(() => parsePricesCsv('Date,A,B\n2020-01-01,1,-2\n2020-01-02,1,2\n2020-01-03,1,2', 'x')).toThrow(/positive/);
    expect(() => parsePricesCsv('Date,A,B\n2020-01-01,1,abc\n2020-01-02,1,2\n2020-01-03,1,2', 'x')).toThrow(/not a number/);
    expect(() => parsePricesCsv('Day,A,B\n2020-01-01,1,2\n2020-01-02,1,2\n2020-01-03,1,2', 'x')).toThrow(/"Date"/);
  });
  it('MnM header is normalised to M&M', () => { expect(normaliseTicker('MnM')).toBe('M&M'); });
  it('missing prices are never filled with zero returns: the date is dropped for all stocks', () => {
    const ds = parsePricesCsv('Date,A,B\n2020-01-01,100,50\n2020-01-02,101,\n2020-01-03,102,51\n2020-01-06,103,52\n2020-01-07,104,53', 'x');
    const p = returnPanel(ds, ['A', 'B'], { start: '2020-01-01', end: '2020-01-07' });
    expect(p.dates).toEqual(['2020-01-06', '2020-01-07']);
    expect(p.droppedRows).toBe(2);
  });
  it('benchmark parser accepts Date,Close and rejects junk', () => {
    const rows = ['Date,Close', ...Array.from({ length: 40 }, (_, i) => `2020-02-${String((i % 28) + 1).padStart(2, '0')},${100 + i}`)].join('\n');
    expect(() => parseBenchmarkCsv(rows, 'x')).toThrow(); // dates repeat → not increasing
    const ok = ['Date,Close', ...Array.from({ length: 40 }, (_, i) => `${new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10)},${100 + i}`)].join('\n');
    expect(parseBenchmarkCsv(ok, 'Nifty').closes.length).toBe(40);
  });
});

describe('beta with a benchmark', () => {
  it('equals 1 when the benchmark is the portfolio, and 2 when the portfolio moves twice as much', () => {
    const ds = syntheticDataset(300, ['S1', 'S2']);
    const p = spec(['S1'], [1]);
    const closes = new Float64Array(300);
    closes[0] = 1000;
    for (let t = 1; t < 300; t++) closes[t] = closes[t - 1] * (1 + (ds.prices[0][t] / ds.prices[0][t - 1] - 1) / 2);
    const m = computeMetrics(ds, p, { start: ds.dates[0], end: ds.dates[299] }, { confidence: 0.95, nSims: 1000, seed: 1, withMonteCarlo: false, benchmark: { name: 'half', dates: ds.dates, closes } });
    expect(m.beta!).toBeGreaterThan(1.9);
    expect(m.beta!).toBeLessThan(2.1);
  });
});

describe('risk classification', () => {
  const ds = syntheticDataset(800, ['S1', 'S2', 'S3', 'S4']);
  const win = { start: ds.dates[0], end: ds.dates[799] };
  const o = { confidence: 0.95, nSims: 2000, seed: 1, withMonteCarlo: false };
  it('derives the verdict from the data and flips when the portfolios are swapped', () => {
    const calm = computeMetrics(ds, spec(['S1', 'S2'], undefined, 1e6, 'B'), win, o);
    const wild = computeMetrics(ds, spec(['S3', 'S4'], undefined, 1e6, 'A'), win, o);
    const fwd = classify(wild, calm, DEFAULT_RISK), rev = classify(calm, wild, DEFAULT_RISK);
    expect(fwd.verdict).toBe('supported');
    expect(rev.verdict).toBe('reversed');
  });
  it('threshold bands', () => {
    expect(directionOf(1.2, 1.1)).toBe('A-riskier');
    expect(directionOf(1.05, 1.1)).toBe('similar');
    expect(directionOf(0.8, 1.1)).toBe('B-riskier');
    expect(directionOf(null, 1.1)).toBe('n/a');
  });
  it('same portfolio on both sides is "similar" and not supported', () => {
    const m = computeMetrics(ds, spec(['S1', 'S2']), win, o);
    expect(classify(m, m, DEFAULT_RISK).verdict).toBe('not-supported');
  });
});
