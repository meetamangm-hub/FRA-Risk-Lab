import { describe, expect, it } from 'vitest';
import { cholesky, simulateAssetReturns, simulatePortfolio, mcVaR } from '../src/engine/montecarlo';
import { covMatrix, corrFromCov, mean } from '../src/engine/stats';
import { parametricVaR } from '../src/engine/risk';

const mu = [0.0005, 0.0002, 0.0008];
const S = [
  [0.0004, 0.00018, 0.00006],
  [0.00018, 0.0009, 0.0003],
  [0.00006, 0.0003, 0.0016],
];

describe('Monte Carlo VaR', () => {
  it('Cholesky reproduces Σ', () => {
    const L = cholesky(S);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      let v = 0; for (let k = 0; k < 3; k++) v += L[i][k] * L[j][k];
      expect(v).toBeCloseTo(S[i][j], 14);
    }
  });
  it('same seed ⇒ identical result; different seed ⇒ different result', () => {
    const w = [0.2, 0.5, 0.3];
    const a = mcVaR(simulatePortfolio(mu, S, w, 20000, 42), 0.95);
    const b = mcVaR(simulatePortfolio(mu, S, w, 20000, 42), 0.95);
    const c = mcVaR(simulatePortfolio(mu, S, w, 20000, 43), 0.95);
    expect(a.var).toBe(b.var);
    expect(a.es).toBe(b.es);
    expect(c.var).not.toBe(a.var);
  });
  it('preserves the dependence structure (simulated covariance ≈ Σ, correlations kept)', () => {
    const sims = simulateAssetReturns(mu, S, 200000, 11);
    const C = covMatrix(sims);
    for (let i = 0; i < 3; i++) {
      expect(mean(sims[i])).toBeCloseTo(mu[i], 3);
      for (let j = 0; j < 3; j++) expect(Math.abs(C[i][j] - S[i][j]) / Math.sqrt(S[i][i] * S[j][j])).toBeLessThan(0.01);
    }
    const target = corrFromCov(S), got = corrFromCov(C);
    expect(got[0][1]).toBeCloseTo(target[0][1], 1);
    expect(got[1][2]).toBeCloseTo(target[1][2], 1);
  });
  it('converges to parametric VaR for a Gaussian model', () => {
    const w = [0.2, 0.5, 0.3];
    const m = w.reduce((s, x, i) => s + x * mu[i], 0);
    let v = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) v += w[i] * S[i][j] * w[j];
    const p = parametricVaR(m, Math.sqrt(v), 0.99);
    const r = mcVaR(simulatePortfolio(mu, S, w, 400000, 5), 0.99);
    expect(Math.abs(r.var - p.var) / p.var).toBeLessThan(0.03);
    expect(Math.abs(r.es - p.es) / p.es).toBeLessThan(0.03);
  });
  it('rejects a non-positive-definite covariance with a clear message', () => {
    expect(() => cholesky([[1, 2], [2, 1]])).toThrow(/positive definite/);
  });
});
