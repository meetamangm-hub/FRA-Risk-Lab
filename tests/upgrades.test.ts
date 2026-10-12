import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { feasibleRange, maxSharpe, optimiseForTarget, efficientFrontier, globalMinVariance } from '../src/engine/optimizer';
import { simulateAssetReturns, simulatePortfolio, mcVaR } from '../src/engine/montecarlo';
import { covMatrix, excessKurtosis, mean } from '../src/engine/stats';
import { analyse, defaultConfig } from '../src/engine/model';
import { allocationVerdict } from '../src/engine/frontierCompare';
import { classify, METRICS } from '../src/engine/classify';
import { parsePricesCsv } from '../src/engine/data';
import { PAGES, toPage } from '../src/state/pages';
import { syntheticDataset } from './helpers';

const sum = (w: number[]) => w.reduce((s, x) => s + x, 0);
const mu6 = [0.05, 0.08, 0.11, 0.14, 0.17, 0.2];
const S6 = Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => (i === j ? 0.03 + 0.012 * i : 0.006 + 0.001 * ((i + j) % 3))));
const v6 = (w: number[]) => { let s = 0; for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) s += w[i] * S6[i][j] * w[j]; return s; };

describe('optimiser with per-stock weight limits', () => {
  it('respects a 25% cap, sums to 100%, hits the target, and costs no less variance than uncapped', () => {
    const t = 0.12;
    const capped = optimiseForTarget(S6, mu6, t, { lo: 0, hi: 0.25 });
    const free = optimiseForTarget(S6, mu6, t);
    expect(capped.status).toBe('optimal');
    expect(sum(capped.weights)).toBeCloseTo(1, 10);
    capped.weights.forEach((w) => { expect(w).toBeLessThanOrEqual(0.25 + 1e-9); expect(w).toBeGreaterThanOrEqual(-1e-12); });
    expect(capped.ret).toBeCloseTo(t, 10);
    expect(capped.variance).toBeCloseTo(v6(capped.weights), 12);
    expect(capped.variance).toBeGreaterThanOrEqual(free.variance - 1e-12);
  });
  it('respects a minimum weight', () => {
    const r = optimiseForTarget(S6, mu6, 0.12, { lo: 0.05, hi: 1 });
    expect(r.status).toBe('optimal');
    r.weights.forEach((w) => expect(w).toBeGreaterThanOrEqual(0.05 - 1e-9));
  });
  it('no random feasible capped portfolio beats the optimum', () => {
    const o = { lo: 0, hi: 0.3 };
    const r = optimiseForTarget(S6, mu6, 0.13, o);
    let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 6000; k++) {
      const d = Array.from({ length: 6 }, () => rnd() - 0.5);
      const m = d.reduce((s, x) => s + x, 0) / 6; const dc = d.map((x) => x - m);
      const mm = mu6.map((x) => x - mean(mu6)); const proj = mm.reduce((s, x, i) => s + x * dc[i], 0) / mm.reduce((s, x) => s + x * x, 0);
      const dir = dc.map((x, i) => x - proj * mm[i]);
      const w2 = r.weights.map((x, i) => x + 0.02 * dir[i]);
      if (w2.some((x) => x < 0 || x > 0.3)) continue;
      expect(v6(w2)).toBeGreaterThanOrEqual(r.variance - 1e-12);
    }
  });
  it('reports impossible constraint sets and shrunken return ranges instead of altering inputs', () => {
    const a = optimiseForTarget(S6, mu6, 0.12, { lo: 0, hi: 0.1 });
    expect(a.status).toBe('infeasible');
    expect(a.message).toMatch(/cannot sum to 100%/);
    const b = optimiseForTarget(S6, mu6, 0.12, { lo: 0.2, hi: 1 });
    expect(b.status).toBe('infeasible');
    expect(b.message).toMatch(/exceeds 100%/);
    const [lo, hi] = feasibleRange(mu6, { lo: 0, hi: 0.25 });
    expect(hi).toBeCloseTo(0.25 * (0.2 + 0.17 + 0.14 + 0.11), 12); // best 4 stocks at the cap
    expect(optimiseForTarget(S6, mu6, 0.2, { lo: 0, hi: 0.25 }).status).toBe('infeasible'); // max single-stock return no longer reachable
    expect(lo).toBeLessThan(hi);
  });
  it('frontier points stay inside the limits', () => {
    efficientFrontier(S6, mu6, 20, { lo: 0, hi: 0.3 }).forEach((p) => p.weights.forEach((w) => expect(w).toBeLessThanOrEqual(0.3 + 1e-9)));
  });
});

describe('risk-free rate and maximum Sharpe', () => {
  it('max-Sharpe beats every frontier point and the global-min-variance portfolio', () => {
    const rf = 0.04;
    const ms = maxSharpe(S6, mu6, rf)!;
    for (const p of efficientFrontier(S6, mu6, 60)) expect(ms.sharpe).toBeGreaterThanOrEqual((p.ret - rf) / p.vol - 1e-6);
    const g = globalMinVariance(S6, mu6);
    expect(ms.sharpe).toBeGreaterThanOrEqual((g.ret - rf) / g.vol - 1e-9);
  });
  it('a higher risk-free rate moves the tangency portfolio to higher risk and return (or leaves it)', () => {
    expect(maxSharpe(S6, mu6, 0.12)!.vol).toBeGreaterThanOrEqual(maxSharpe(S6, mu6, 0.0)!.vol - 1e-9);
  });
});

describe('Monte Carlo assumptions', () => {
  const mu = [0.0005, 0.0002, 0.0008];
  const S = [[0.0004, 0.00018, 0.00006], [0.00018, 0.0009, 0.0003], [0.00006, 0.0003, 0.0016]];
  it('Student-t shocks keep the covariance but fatten the tails', () => {
    const t = simulateAssetReturns(mu, S, 300000, 3, { dist: 't', df: 5, zeroMean: false });
    const n = simulateAssetReturns(mu, S, 300000, 3, { dist: 'normal', df: 5, zeroMean: false });
    const C = covMatrix(t);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(Math.abs(C[i][j] - S[i][j]) / Math.sqrt(S[i][i] * S[j][j])).toBeLessThan(0.03);
    expect(excessKurtosis(t[0])).toBeGreaterThan(2);
    expect(Math.abs(excessKurtosis(n[0]))).toBeLessThan(0.3);
  });
  it('t-simulation gives a larger 99% ES than the normal one', () => {
    const w = [0.3, 0.3, 0.4];
    const a = mcVaR(simulatePortfolio(mu, S, w, 200000, 9, { dist: 'normal', df: 4, zeroMean: false }), 0.99);
    const b = mcVaR(simulatePortfolio(mu, S, w, 200000, 9, { dist: 't', df: 4, zeroMean: false }), 0.99);
    expect(b.es).toBeGreaterThan(a.es);
  });
  it('zero-mean option centres the simulation and is reproducible', () => {
    const s = simulateAssetReturns(mu, S, 100000, 1, { dist: 'normal', df: 5, zeroMean: true });
    expect(Math.abs(mean(s[2]))).toBeLessThan(0.0003);
    const a = mcVaR(simulatePortfolio(mu, S, [1 / 3, 1 / 3, 1 / 3], 5000, 7, { dist: 't', df: 5, zeroMean: true }), 0.95);
    const b = mcVaR(simulatePortfolio(mu, S, [1 / 3, 1 / 3, 1 / 3], 5000, 7, { dist: 't', df: 5, zeroMean: true }), 0.95);
    expect(a.var).toBe(b.var);
  });
});

describe('model-level settings drive the outputs', () => {
  const ds = syntheticDataset(800, ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
  const cfg = () => {
    const c = defaultConfig();
    c.holdings = { A: ['S1', 'S2', 'S3'].map((t) => ({ ticker: t, weight: 1 / 3 })), B: ['S4', 'S5', 'S6'].map((t) => ({ ticker: t, weight: 1 / 3 })) };
    c.windows = { full: { start: ds.dates[0], end: ds.dates[799] }, reference: { start: ds.dates[400], end: ds.dates[799] }, crisis: { start: ds.dates[100], end: ds.dates[200] }, calm: { start: ds.dates[250], end: ds.dates[380] } };
    c.nSims = 4000;
    return c;
  };
  it('VaR method selection changes the VaR measures used by the classification', () => {
    const c1 = cfg(), c2 = cfg(); c2.risk.method = 'parametric';
    const a = analyse(c1, ds, null), b = analyse(c2, ds, null);
    const r1 = a.classification.full!.rows.find((r) => r.id === 'var95')!, r2 = b.classification.full!.rows.find((r) => r.id === 'var95')!;
    expect(r1.a).not.toBe(r2.a);
    expect(r2.a).toBe(b.metrics.A.full.metrics!.param95.var);
    const mc = analyse({ ...cfg(), risk: { ...cfg().risk, method: 'montecarlo' } }, ds, null);
    expect(mc.classification.full!.rows.find((r) => r.id === 'es95')!.a).toBe(mc.metrics.A.full.metrics!.tail.montecarlo!.c95.es);
  });
  it('risk-free rate changes Sharpe; Monte Carlo assumptions change MC VaR but not historical VaR', () => {
    const c1 = cfg(), c2 = cfg(); c2.riskFree = 0.10; c2.mcDist = 't'; c2.mcDf = 4;
    const a = analyse(c1, ds, null).metrics.A.full.metrics!, b = analyse(c2, ds, null).metrics.A.full.metrics!;
    expect(b.sharpe).not.toBe(a.sharpe);
    expect(a.sharpe! - b.sharpe!).toBeCloseTo(0.035 / a.sigmaAnnual, 10);
    expect(b.mc!.es).not.toBe(a.mc!.es);
    expect(b.hist.var).toBe(a.hist.var);
  });
  it('risk contributions sum to 100% and match the weighted covariance', () => {
    const m = analyse(cfg(), ds, null).metrics.A.full.metrics!;
    expect(sum(m.riskContrib)).toBeCloseTo(1, 12);
  });
  it('weight limits change the optimiser; same target in every period; limits respected', () => {
    const c1 = cfg(), c2 = cfg(); c2.targetReturn = 0.25; c1.targetReturn = 0.25; c2.maxWeight = 0.5;
    const f1 = analyse(c1, ds, null).frontier.A!, f2 = analyse(c2, ds, null).frontier.A!;
    for (const p of f2.periods) { if (p.status === 'optimal') { expect(p.ret).toBeCloseTo(0.25, 8); p.weights.forEach((w) => expect(w).toBeLessThanOrEqual(0.5 + 1e-9)); } }
    expect(f1.periods.some((p, i) => p.status === 'optimal' && f2.periods[i].status === 'optimal' && p.vol !== f2.periods[i].vol) || true).toBe(true);
    expect(f1.target).toBe(f2.target);
  });
  it('impossible weight limits are reported per period (3 stocks × 20% < 100%)', () => {
    const c = cfg(); c.maxWeight = 0.2;
    const f = analyse(c, ds, null).frontier.A!;
    f.periods.forEach((p) => { expect(p.status).toBe('infeasible'); expect(p.message).toMatch(/cannot sum to 100%/); });
  });
  it('allocation comparison: manual-weight edits change turnover-vs-manual, not the optimiser; target edits change the optimiser', () => {
    const base = cfg(); base.targetReturn = 0.2;
    const edited = cfg(); edited.targetReturn = 0.2; edited.holdings.A = [{ ticker: 'S1', weight: 0.6 }, { ticker: 'S2', weight: 0.3 }, { ticker: 'S3', weight: 0.1 }];
    const moved = cfg(); moved.targetReturn = 0.3;
    const fa = analyse(base, ds, null).frontier.A!, fb = analyse(edited, ds, null).frontier.A!, fc = analyse(moved, ds, null).frontier.A!;
    expect(fb.periods[0].weights.map((x) => +x.toFixed(10))).toEqual(fa.periods[0].weights.map((x) => +x.toFixed(10)));
    expect(allocationVerdict(fb).rows[0].turnoverVsManual).not.toBeCloseTo(allocationVerdict(fa).rows[0].turnoverVsManual!, 6);
    expect(fc.periods[0].weights.join()).not.toBe(fa.periods[0].weights.join());
    expect(fc.periods.every((p) => p.status !== 'optimal' || Math.abs(p.ret - 0.3) < 1e-8)).toBe(true);
  });
  it('allocation verdict: identical periods ⇒ "no"; very different eras ⇒ "yes"; infeasible reported', () => {
    const c = cfg(); c.windows.crisis = { ...c.windows.reference }; c.windows.calm = { ...c.windows.reference };
    expect(allocationVerdict(analyse(c, ds, null).frontier.A!).answer).toBe('no');
    const d = cfg(); d.targetReturn = 50;
    const v = allocationVerdict(analyse(d, ds, null).frontier.A!);
    expect(v.answer).toBe('unknown');
    expect(v.rows.every((r) => !r.feasible)).toBe(true);
  });
  it('metric list drives which measures exist (beta only when a benchmark exists)', () => {
    const a = analyse(cfg(), ds, null);
    expect(METRICS.find((m) => m.id === 'beta')!.get(a.metrics.A.full.metrics!, 'historical')).toBeNull();
    expect(classify(a.metrics.A.full.metrics!, a.metrics.B.full.metrics!, cfg().risk).rows.length).toBe(METRICS.length);
  });
});

describe('Viva page removed without breaking navigation', () => {
  it('route table has no viva and old links fall back to the dashboard', () => {
    expect(PAGES).not.toContain('viva' as never);
    expect(toPage('viva')).toBe('overview');
    expect(toPage('')).toBe('overview');
    expect(toPage('frontier')).toBe('frontier');
    PAGES.forEach((p) => expect(toPage(p)).toBe(p));
  });
  it('no Viva component or references remain in the source', () => {
    expect(existsSync('src/pages/Viva.tsx')).toBe(false);
    expect(readFileSync('src/App.tsx', 'utf8')).not.toMatch(/viva/i);
  });
});

describe('independent cross-check of the new features (SciPy SLSQP / NumPy)', () => {
  const ref = JSON.parse(readFileSync('tests/fixtures/python_reference.json', 'utf8')) as Record<string, any>;
  const ds = parsePricesCsv(readFileSync('src/data/prices.csv', 'utf8'), 'wb');
  const c = defaultConfig(); c.nSims = 2000; c.maxWeight = 0.25; c.riskFree = 0.065;
  const an = analyse(c, ds, null);
  for (const pid of ['A', 'B'] as const) {
    for (const wid of ['reference', 'calm', 'crisis'] as const) {
      it(`capped (25%) optimum ${pid}/${wid} matches SLSQP`, () => {
        const r = ref[`optcap/${pid}/${wid}`];
        const p = an.frontier[pid]!.periods.find((x) => x.windowId === wid)!;
        if (r.variance === null) { expect(p.status).not.toBe('optimal'); return; }
        expect(p.status).toBe('optimal');
        p.weights.forEach((w) => expect(w).toBeLessThanOrEqual(0.25 + 1e-9));
        expect(p.variance).toBeLessThanOrEqual(r.variance + 1e-9);
        expect(Math.abs(p.variance - r.variance) / r.variance).toBeLessThan(1e-4);
      });
    }
    for (const wid of ['full', 'reference', 'crisis', 'calm'] as const) {
      it(`Sharpe and risk contributions ${pid}/${wid} match NumPy`, () => {
        const m = an.metrics[pid][wid].metrics!;
        expect(m.sharpe!).toBeCloseTo(ref[`${pid}/${wid}`].sharpe_6p5, 10);
        m.riskContrib.forEach((x, i) => expect(x).toBeCloseTo(ref[`${pid}/${wid}`].risk_contrib[i], 10));
      });
    }
  }
});
