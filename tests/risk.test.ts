import { describe, expect, it } from 'vitest';
import { betaOf, drawdowns, historicalVaR, parametricVaR, quadForm } from '../src/engine/risk';
import { mulberry32 } from '../src/engine/stats';
import { portfolioReturns } from '../src/engine/returns';

const grid = Float64Array.from({ length: 100 }, (_, k) => (k - 50) / 1000); // -5.0% … +4.9%

describe('VaR and Expected Shortfall', () => {
  it('historical VaR95 / ES95 on a known grid', () => {
    const r = historicalVaR(grid, 0.95);
    expect(r.q).toBeCloseTo(-0.04505, 12);
    expect(r.var).toBeCloseTo(0.04505, 12);
    // tail = five worst: -5.0,-4.9,-4.8,-4.7,-4.6 → mean -4.8 %
    expect(r.es).toBeCloseTo(0.048, 12);
  });
  it('ES is never smaller than VaR and 99% ≥ 95%', () => {
    const rnd = mulberry32(3);
    const x = Float64Array.from({ length: 2000 }, () => (rnd() - 0.5) * 0.06);
    const a = historicalVaR(x, 0.95), b = historicalVaR(x, 0.99);
    expect(a.es).toBeGreaterThanOrEqual(a.var);
    expect(b.var).toBeGreaterThanOrEqual(a.var);
    expect(b.es).toBeGreaterThanOrEqual(a.es);
  });
  it('VaR is floored at zero when the quantile is a gain', () => {
    const gains = Float64Array.from({ length: 50 }, (_, k) => 0.01 + k * 0.0001);
    expect(historicalVaR(gains, 0.95).var).toBe(0);
  });
  it('parametric VaR / ES match hand calculation', () => {
    const r = parametricVaR(0.001, 0.02, 0.95);
    expect(r.var).toBeCloseTo(0.0318970725, 8); // −μ − z σ with z=−1.644853627
    expect(r.es).toBeCloseTo(-0.001 + 0.02 * 0.10313564 / 0.05, 6);
    expect(parametricVaR(0.001, 0.02, 0.99).var).toBeGreaterThan(r.var);
  });
  it('rupee VaR scales linearly with investment', () => {
    const r = historicalVaR(grid, 0.95);
    expect(30_00_000 * r.var).toBeCloseTo(2 * (15_00_000 * r.var), 6);
  });
});

describe('drawdown', () => {
  it('maximum drawdown on a hand-built path', () => {
    const d = drawdowns([0.1, -0.2, 0.05, -0.1, 0.3]);
    // W: 1, 1.1, 0.88, 0.924, 0.8316, 1.08108 ; peak 1.1, trough 0.8316
    expect(d.maxDrawdown).toBeCloseTo(1 - 0.8316 / 1.1, 12);
    expect(d.peakIndex).toBe(1);
    expect(d.troughIndex).toBe(4);
    expect(d.wealth[5]).toBeCloseTo(1.08108, 12);
  });
  it('a monotonically rising path has zero drawdown', () => {
    expect(drawdowns([0.01, 0.02, 0.0, 0.03]).maxDrawdown).toBe(0);
  });
});

describe('portfolio identities', () => {
  it('portfolio return is the weighted sum and variance equals wᵀΣw', () => {
    const a = Float64Array.from([0.01, -0.02, 0.03, 0.0, 0.01, 0.02]);
    const b = Float64Array.from([0.02, 0.01, -0.01, 0.03, 0.0, -0.02]);
    const w = [0.3, 0.7];
    const rp = portfolioReturns([a, b], w);
    expect(rp[2]).toBeCloseTo(0.3 * 0.03 + 0.7 * -0.01, 15);
    const mean = (x: ArrayLike<number>) => Array.from(x).reduce((s, v) => s + v, 0) / x.length;
    const cov = (x: ArrayLike<number>, y: ArrayLike<number>) => { const mx = mean(x), my = mean(y); let s = 0; for (let i = 0; i < x.length; i++) s += (x[i] - mx) * (y[i] - my); return s / (x.length - 1); };
    const C = [[cov(a, a), cov(a, b)], [cov(b, a), cov(b, b)]];
    expect(quadForm(w, C)).toBeCloseTo(cov(rp, rp), 15);
  });
  it('beta of a series against 2× itself is 0.5; against itself is 1', () => {
    const x = Float64Array.from([0.01, -0.02, 0.03, 0.0, 0.015]);
    const m = x.map((v) => 2 * v);
    expect(betaOf(x, m)).toBeCloseTo(0.5, 12);
    expect(betaOf(x, x)).toBeCloseTo(1, 12);
  });
});
