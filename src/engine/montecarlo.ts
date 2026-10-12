import { makeNormalGenerator, sortedCopy } from './stats';
import { historicalVaR } from './risk';
import type { MethodResult } from './types';

export class CovarianceError extends Error {}

/** Cholesky factor L (lower) with L Lᵀ = Σ. A tiny diagonal jitter is tried once if Σ is only PSD. */
export function cholesky(sigma: number[][]): number[][] {
  const n = sigma.length;
  const attempt = (jitter: number): number[][] | null => {
    const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = sigma[i][j] + (i === j ? jitter : 0);
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) {
          if (s <= 0) return null;
          L[i][i] = Math.sqrt(s);
        } else L[i][j] = s / L[j][j];
      }
    }
    return L;
  };
  const scale = sigma.reduce((a, row, i) => a + row[i], 0) / n || 1;
  const L = attempt(0) ?? attempt(1e-10 * scale);
  if (!L) throw new CovarianceError('Covariance matrix is not positive definite (too few observations or perfectly collinear stocks).');
  return L;
}

/**
 * Simulate joint daily stock returns r = μ + L z, z ~ N(0, I). Returns asset-major matrix sims[j][s].
 * Cross-stock dependence is preserved because every simulated vector shares the same L.
 */
export interface McOptions {
  /** shock distribution: multivariate normal, or multivariate Student-t (fat tails) rescaled to the same covariance */
  dist: 'normal' | 't';
  /** integer degrees of freedom for the t distribution (3–30) */
  df: number;
  /** if true, simulate with zero mean instead of the sample mean */
  zeroMean: boolean;
}
export const DEFAULT_MC: McOptions = { dist: 'normal', df: 5, zeroMean: false };

export function simulateAssetReturns(mu0: number[], sigma: number[][], nSims: number, seed: number, opt: McOptions = DEFAULT_MC): Float64Array[] {
  const mu = opt.zeroMean ? mu0.map(() => 0) : mu0;
  const n = mu.length;
  const df = Math.max(3, Math.min(30, Math.round(opt.df)));
  const L = cholesky(sigma);
  const gauss = makeNormalGenerator(seed);
  const out = Array.from({ length: n }, () => new Float64Array(nSims));
  const z = new Float64Array(n);
  for (let s = 0; s < nSims; s++) {
    for (let k = 0; k < n; k++) z[k] = gauss();
    let scale = 1;
    if (opt.dist === 't') {
      // t = z·sqrt(df/χ²_df); dividing by sd sqrt(df/(df−2)) keeps Cov = Σ exactly
      let chi = 0;
      for (let k = 0; k < df; k++) { const g = gauss(); chi += g * g; }
      scale = Math.sqrt((df - 2) / chi);
    }
    for (let i = 0; i < n; i++) {
      let v = 0;
      const Li = L[i];
      for (let k = 0; k <= i; k++) v += Li[k] * z[k];
      out[i][s] = mu[i] + scale * v;
    }
  }
  return out;
}

export interface McResult {
  sortedPortfolio: Float64Array;
  nSims: number;
}

/** Simulate portfolio returns r_p = wᵀ r and return them sorted (so VaR at any confidence is a lookup). */
export function simulatePortfolio(mu: number[], sigma: number[][], w: number[], nSims: number, seed: number, opt: McOptions = DEFAULT_MC): McResult {
  const sims = simulateAssetReturns(mu, sigma, nSims, seed, opt);
  const rp = new Float64Array(nSims);
  for (let j = 0; j < w.length; j++) {
    const c = sims[j];
    const wj = w[j];
    for (let s = 0; s < nSims; s++) rp[s] += wj * c[s];
  }
  return { sortedPortfolio: sortedCopy(rp), nSims };
}

export function mcVaR(res: McResult, confidence: number): MethodResult {
  return historicalVaR(res.sortedPortfolio, confidence, true);
}

// Small cache keyed by inputs so confidence/investment edits don't re-simulate.
const cache = new Map<string, McResult>();
export function simulatePortfolioCached(key: string, mu: number[], sigma: number[][], w: number[], nSims: number, seed: number, opt: McOptions = DEFAULT_MC): McResult {
  const full = `${key}#${opt.dist}${opt.df}${opt.zeroMean ? 'z' : 'm'}`;
  const hit = cache.get(full);
  if (hit) return hit;
  const res = simulatePortfolio(mu, sigma, w, nSims, seed, opt);
  cache.set(full, res);
  if (cache.size > 24) cache.delete(cache.keys().next().value as string);
  return res;
}
