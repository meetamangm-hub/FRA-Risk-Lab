import { describe, expect, it } from 'vitest';
import { efficientFrontier, globalMinVariance, optimiseForTarget } from '../src/engine/optimizer';

const sum = (w: number[]) => w.reduce((s, x) => s + x, 0);

// 3-asset example with a real trade-off
const mu = [0.08, 0.12, 0.16];
const S = [
  [0.04, 0.006, 0.002],
  [0.006, 0.09, 0.03],
  [0.002, 0.03, 0.16],
];
const var3 = (w: number[]) => { let v = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) v += w[i] * S[i][j] * w[j]; return v; };

describe('Markowitz optimiser', () => {
  it('two uncorrelated assets: GMV weight is σ₂²/(σ₁²+σ₂²)', () => {
    const r = globalMinVariance([[0.04, 0], [0, 0.09]], [0.05, 0.1]);
    expect(r.weights[0]).toBeCloseTo(0.09 / 0.13, 10);
    expect(r.weights[1]).toBeCloseTo(0.04 / 0.13, 10);
  });
  it('satisfies the budget, long-only, and target-return constraints and reports its own variance', () => {
    const t = 0.11;
    const r = optimiseForTarget(S, mu, t);
    expect(r.status).toBe('optimal');
    expect(sum(r.weights)).toBeCloseTo(1, 10);
    r.weights.forEach((w) => expect(w).toBeGreaterThanOrEqual(0));
    expect(r.ret).toBeCloseTo(t, 10);
    expect(r.variance).toBeCloseTo(var3(r.weights), 12);
    expect(r.vol).toBeCloseTo(Math.sqrt(r.variance), 12);
  });
  it('beats a brute-force search over every feasible 3-asset portfolio', () => {
    for (const t of [0.09, 0.11, 0.13, 0.15]) {
      const r = optimiseForTarget(S, mu, t);
      let best = Infinity;
      for (let w1 = 0; w1 <= 1; w1 += 0.0005) {
        const w2 = (t - mu[2] - w1 * (mu[0] - mu[2])) / (mu[1] - mu[2]);
        const w3 = 1 - w1 - w2;
        if (w2 < 0 || w3 < 0) continue;
        best = Math.min(best, var3([w1, w2, w3]));
      }
      expect(r.variance).toBeLessThanOrEqual(best + 1e-9);
      expect(best - r.variance).toBeLessThan(1e-5); // and the grid gets close, so we are not trivially lower
    }
  });
  it('handles a binding long-only constraint (an asset forced to zero)', () => {
    // asset 3 is dominated (high variance, only slightly higher return) so low targets exclude it
    const r = optimiseForTarget(S, mu, 0.085);
    expect(r.status).toBe('optimal');
    expect(r.weights.some((w) => w === 0)).toBe(true);
    expect(r.ret).toBeCloseTo(0.085, 10);
  });
  it('reports infeasible targets instead of changing them', () => {
    const hi = optimiseForTarget(S, mu, 0.2);
    expect(hi.status).toBe('infeasible');
    expect(hi.message).toMatch(/outside the achievable/);
    const lo = optimiseForTarget(S, mu, 0.01);
    expect(lo.status).toBe('infeasible');
    expect(hi.weights.every(Number.isNaN)).toBe(true);
  });
  it('a target equal to the best asset return gives 100% in that asset', () => {
    const r = optimiseForTarget(S, mu, 0.16);
    expect(r.status).toBe('optimal');
    expect(r.weights[2]).toBeCloseTo(1, 8);
  });
  it('unconstrained mode may short, and then any target is feasible', () => {
    const r = optimiseForTarget(S, mu, 0.25, false);
    expect(r.status).toBe('optimal');
    expect(sum(r.weights)).toBeCloseTo(1, 10);
    expect(r.ret).toBeCloseTo(0.25, 10);
    expect(Math.min(...r.weights)).toBeLessThan(0);
  });
  it('frontier is convex-increasing in volatility with return', () => {
    const f = efficientFrontier(S, mu, 30);
    for (let i = 1; i < f.length; i++) { expect(f[i].ret).toBeGreaterThan(f[i - 1].ret); expect(f[i].vol).toBeGreaterThanOrEqual(f[i - 1].vol - 1e-10); }
  });
  it('10-asset problem: optimum satisfies KKT-style sanity (no random feasible portfolio is better)', () => {
    const n = 10;
    const m = Array.from({ length: n }, (_, i) => 0.05 + 0.015 * i);
    const C = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0.03 + 0.01 * i : 0.004 + 0.0005 * ((i * j) % 4))));
    const t = 0.10;
    const r = optimiseForTarget(C, m, t);
    expect(r.status).toBe('optimal');
    // perturb along feasible directions and confirm variance does not decrease
    const v = (w: number[]) => { let s = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s += w[i] * C[i][j] * w[j]; return s; };
    let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 4000; k++) {
      const d = Array.from({ length: n }, () => rnd() - 0.5);
      const ds = d.reduce((s, x) => s + x, 0) / n; const dc = d.map((x) => x - ds);           // Σd = 0
      const dm = dc.reduce((s, x, i) => s + x * m[i], 0); const mm = m.map((x) => x - m.reduce((s, y) => s + y, 0) / n);
      const proj = mm.reduce((s, x, i) => s + x * dc[i], 0) / mm.reduce((s, x) => s + x * x, 0);
      const dir = dc.map((x, i) => x - proj * mm[i]);                                          // keeps Σd=0 and μ'd=0
      void dm;
      const w2 = r.weights.map((x, i) => x + 0.01 * dir[i]);
      if (w2.some((x) => x < 0)) continue;
      expect(v(w2)).toBeGreaterThanOrEqual(r.variance - 1e-12);
    }
  });
});
