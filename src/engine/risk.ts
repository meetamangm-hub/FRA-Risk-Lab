import {
  covariance, mean, normInv, normPdf, quantileSorted, sortedCopy, variance,
} from './stats';
import { wealthIndex } from './returns';
import type { MethodResult } from './types';

/**
 * Historical VaR / ES.
 * α = 1 − c. q_α is the empirical α-quantile (linear interpolation, Hyndman–Fan type 7).
 * VaR = max(0, −q_α). ES = max(0, −mean{ r : r ≤ q_α }); ties at q_α are all included.
 */
export function historicalVaR(returnsOrSorted: ArrayLike<number>, confidence: number, alreadySorted = false): MethodResult {
  const alpha = 1 - confidence;
  const s = alreadySorted ? returnsOrSorted : sortedCopy(returnsOrSorted);
  const q = quantileSorted(s, alpha);
  let sum = 0, k = 0;
  for (let i = 0; i < s.length && s[i] <= q + 1e-15; i++) { sum += s[i]; k++; }
  const esRet = k ? sum / k : q;
  return { q, var: Math.max(0, -q), es: Math.max(0, -esRet) };
}

/**
 * Parametric (variance–covariance) VaR under normality:
 * q = μ + z_α σ with z_α = Φ⁻¹(α); VaR = max(0, −q). Normal ES = −μ + σ φ(z_α)/α.
 */
export function parametricVaR(mu: number, sigma: number, confidence: number): MethodResult {
  const alpha = 1 - confidence;
  const z = normInv(alpha);
  const q = mu + z * sigma;
  const es = -mu + (sigma * normPdf(z)) / alpha;
  return { q, var: Math.max(0, -q), es: Math.max(0, es) };
}

export interface DrawdownResult {
  maxDrawdown: number; // positive
  peakIndex: number; // index in wealth array (0..n)
  troughIndex: number;
  wealth: Float64Array;
  drawdown: Float64Array; // ≤ 0
}

/** W_t = W_{t-1}(1+r_t); H_t = running max; DD_t = W_t/H_t − 1; MDD = −min DD_t. */
export function drawdowns(r: ArrayLike<number>): DrawdownResult {
  const w = wealthIndex(r);
  const dd = new Float64Array(w.length);
  let peak = w[0], peakIdx = 0, worst = 0, worstPeak = 0, worstTrough = 0;
  for (let t = 0; t < w.length; t++) {
    if (w[t] > peak) { peak = w[t]; peakIdx = t; }
    dd[t] = w[t] / peak - 1;
    if (dd[t] < worst) { worst = dd[t]; worstPeak = peakIdx; worstTrough = t; }
  }
  return { maxDrawdown: worst === 0 ? 0 : -worst, peakIndex: worstPeak, troughIndex: worstTrough, wealth: w, drawdown: dd };
}

/** β = Cov(r_p, r_m) / Var(r_m) on synchronised observations. */
export function betaOf(rp: ArrayLike<number>, rm: ArrayLike<number>): number {
  return covariance(rp, rm) / variance(rm);
}

/** Portfolio variance w'Σw. */
export function quadForm(w: number[], cov: number[][]): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) for (let j = 0; j < w.length; j++) s += w[i] * cov[i][j] * w[j];
  return s;
}

/** Σ w_i σ_i / σ_p: >1 means diversification is reducing risk. */
export function diversificationRatio(w: number[], cov: number[][]): number {
  const sp = Math.sqrt(quadForm(w, cov));
  let num = 0;
  for (let i = 0; i < w.length; i++) num += w[i] * Math.sqrt(cov[i][i]);
  return sp > 0 ? num / sp : NaN;
}

export { mean };
