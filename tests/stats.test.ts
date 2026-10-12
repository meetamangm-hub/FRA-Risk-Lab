import { describe, expect, it } from 'vitest';
import { covariance, covMatrix, mean, normCdf, normInv, quantileSorted, variance, stdev, isSymmetric, corrFromCov } from '../src/engine/stats';

describe('basic statistics', () => {
  it('sample mean / variance / sd use the (T-1) denominator', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(variance([1, 2, 3, 4])).toBeCloseTo(5 / 3, 14);
    expect(stdev([1, 2, 3, 4])).toBeCloseTo(Math.sqrt(5 / 3), 14);
  });
  it('covariance of known series', () => {
    // x = 1..5, y = 2x  => cov = 2 var(x) = 5
    expect(covariance([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(5, 14);
  });
  it('covariance matrix is symmetric with variances on the diagonal', () => {
    const a = Float64Array.from([0.01, -0.02, 0.03, 0.0, 0.01]);
    const b = Float64Array.from([0.02, 0.01, -0.01, 0.03, 0.0]);
    const C = covMatrix([a, b]);
    expect(isSymmetric(C)).toBe(true);
    expect(C[0][0]).toBeCloseTo(variance(a), 15);
    expect(C[0][1]).toBeCloseTo(covariance(a, b), 15);
    const R = corrFromCov(C);
    expect(R[0][0]).toBeCloseTo(1, 14);
    expect(Math.abs(R[0][1])).toBeLessThanOrEqual(1);
  });
  it('normal quantiles match published values', () => {
    expect(normInv(0.05)).toBeCloseTo(-1.6448536269514722, 12);
    expect(normInv(0.01)).toBeCloseTo(-2.3263478740408408, 12);
    expect(normInv(0.5)).toBeCloseTo(0, 14);
    expect(normCdf(1.96)).toBeCloseTo(0.9750021048517795, 12);
    expect(normCdf(normInv(0.123))).toBeCloseTo(0.123, 12);
  });
  it('quantile type 7 interpolates between order statistics', () => {
    const s = Float64Array.from({ length: 100 }, (_, k) => (k - 50) / 1000);
    expect(quantileSorted(s, 0.05)).toBeCloseTo(-0.04505, 12);
  });
});
