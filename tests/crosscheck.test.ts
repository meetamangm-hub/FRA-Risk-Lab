/**
 * Independent verification: every number below was produced by scripts/crosscheck.py
 * (numpy / scipy, a different implementation) on the real workbook data, and the TypeScript engine
 * must reproduce it. Regenerate with `npm run crosscheck`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePricesCsv } from '../src/engine/data';
import { analyse, defaultConfig } from '../src/engine/model';

const ref = JSON.parse(readFileSync('tests/fixtures/python_reference.json', 'utf8')) as Record<string, any>;
const ds = parsePricesCsv(readFileSync('src/data/prices.csv', 'utf8'), 'workbook');
const cfg = defaultConfig();
cfg.nSims = 2000;
const an = analyse(cfg, ds, null);

describe('TypeScript engine vs independent Python implementation (real data)', () => {
  for (const pid of ['A', 'B'] as const) for (const wid of ['full', 'reference', 'crisis', 'calm'] as const) {
    it(`${pid}/${wid}: moments, VaR, ES, drawdown, correlation`, () => {
      const r = ref[`${pid}/${wid}`];
      const m = an.metrics[pid][wid].metrics!;
      expect(m.n).toBe(r.n);
      expect(m.meanDaily).toBeCloseTo(r.mean_daily, 12);
      expect(m.sdDaily).toBeCloseTo(r.sd_daily, 12);
      expect(m.sigmaAnnual).toBeCloseTo(r.sigma_annual, 12);
      expect(m.hist95.var).toBeCloseTo(r.hist_var_95, 12);
      expect(m.hist99.var).toBeCloseTo(r.hist_var_99, 12);
      expect(m.hist95.es).toBeCloseTo(r.hist_es_95, 12);
      expect(m.hist99.es).toBeCloseTo(r.hist_es_99, 12);
      expect(m.param95.var).toBeCloseTo(r.param_var_95, 10);
      expect(m.param99.var).toBeCloseTo(r.param_var_99, 10);
      expect(m.maxDrawdown).toBeCloseTo(r.mdd, 12);
      expect(m.avgCorr).toBeCloseTo(r.avg_corr, 12);
      // w'Σw (daily) equals the sample variance of the portfolio return series
      expect(m.sdDaily ** 2).toBeCloseTo(r.port_var_wcw, 14);
    });
  }
  for (const pid of ['A', 'B'] as const) for (const wid of ['reference', 'crisis', 'calm'] as const) {
    it(`optimiser ${pid}/${wid}: feasibility and minimum variance match SciPy SLSQP`, () => {
      const r = ref[`opt/${pid}/${wid}`];
      const p = an.frontier[pid]!.periods.find((x) => x.windowId === wid)!;
      expect(an.frontier[pid]!.target).toBeCloseTo(r.target, 12);
      expect(p.status === 'optimal').toBe(r.feasible);
      if (r.feasible && r.variance !== null) {
        expect(p.variance).toBeLessThanOrEqual(r.variance + 1e-9);          // never worse than SLSQP
        expect(Math.abs(p.variance - r.variance) / r.variance).toBeLessThan(1e-4); // and agrees with it
        expect(p.weights.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
        p.weights.forEach((w) => expect(w).toBeGreaterThanOrEqual(0));
      }
    });
  }
});
