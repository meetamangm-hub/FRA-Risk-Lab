/**
 * Markowitz mean–variance optimisation.
 *
 *   minimise  wᵀΣw   subject to   Σw_i = 1,  μᵀw = μ_target,  (w_i ≥ 0 for long-only)
 *
 * Σ and μ must be on the SAME time basis (we use annualised values everywhere).
 * Long-only is solved with a primal–dual active-set loop checked against the KKT conditions,
 * with an exhaustive support enumeration as a safety net for n ≤ 14.
 */

export type OptStatus = 'optimal' | 'infeasible' | 'singular';

export interface OptResult {
  status: OptStatus;
  weights: number[];
  ret: number;
  variance: number;
  vol: number;
  message?: string;
  /** feasible target range for the chosen constraints */
  range: [number, number];
}

const TOL = 1e-10;

function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

interface EqSolution { w: number[]; lam1: number; lam2: number }

/** Equality-constrained solve on the free set F (others fixed at 0). target=null → budget constraint only. */
function solveEq(sigma: number[][], mu: number[], F: number[], target: number | null): EqSolution | null {
  const m = F.length;
  if (m === 0) return null;
  const n = mu.length;
  const hasRet = target !== null;
  if (m === 1) {
    if (hasRet && Math.abs(mu[F[0]] - (target as number)) > 1e-9 * (1 + Math.abs(target as number))) return null;
    const w = new Array(n).fill(0);
    w[F[0]] = 1;
    return { w, lam1: NaN, lam2: NaN };
  }
  const k = hasRet ? 2 : 1;
  const N = m + k;
  const A: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  const b = new Array(N).fill(0);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) A[i][j] = 2 * sigma[F[i]][F[j]];
    A[i][m] = -1; A[m][i] = 1;
    if (hasRet) { A[i][m + 1] = -mu[F[i]]; A[m + 1][i] = mu[F[i]]; }
  }
  b[m] = 1;
  if (hasRet) b[m + 1] = target as number;
  const x = solveLinear(A, b);
  if (!x) return null;
  const w = new Array(n).fill(0);
  for (let i = 0; i < m; i++) w[F[i]] = x[i];
  return { w, lam1: x[m], lam2: hasRet ? x[m + 1] : 0 };
}

const quad = (w: number[], s: number[][]) => {
  let v = 0;
  for (let i = 0; i < w.length; i++) { if (w[i] === 0) continue; for (let j = 0; j < w.length; j++) v += w[i] * s[i][j] * w[j]; }
  return v;
};
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

function exhaustive(sigma: number[][], mu: number[], target: number | null): number[] | null {
  const n = mu.length;
  let best: number[] | null = null, bestV = Infinity;
  for (let mask = 1; mask < 1 << n; mask++) {
    const F: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) F.push(i);
    const sol = solveEq(sigma, mu, F, target);
    if (!sol) continue;
    if (sol.w.some((x) => x < -1e-9)) continue;
    const v = quad(sol.w, sigma);
    if (v < bestV - 1e-18) { bestV = v; best = sol.w.map((x) => Math.max(0, x)); }
  }
  return best;
}

function longOnly(sigma: number[][], mu: number[], target: number | null): number[] | null {
  const n = mu.length;
  let F = Array.from({ length: n }, (_, i) => i);
  for (let iter = 0; iter < 200; iter++) {
    const sol = solveEq(sigma, mu, F, target);
    if (!sol) break;
    let worst = -1e-12, wi = -1;
    for (const i of F) if (sol.w[i] < worst) { worst = sol.w[i]; wi = i; }
    if (wi >= 0) { F = F.filter((i) => i !== wi); continue; }
    // all free weights ≥ 0 → check multipliers of the weights fixed at zero
    let minG = -1e-9, add = -1;
    const Sw = sigma.map((row) => dot(row, sol.w));
    for (let i = 0; i < n; i++) {
      if (F.includes(i)) continue;
      const g = 2 * Sw[i] - sol.lam1 - (target === null ? 0 : sol.lam2 * mu[i]);
      if (Number.isNaN(g)) continue;
      if (g < minG) { minG = g; add = i; }
    }
    if (add < 0) return sol.w.map((x) => Math.max(0, x));
    F = [...F, add].sort((a, b) => a - b);
  }
  return n <= 14 ? exhaustive(sigma, mu, target) : null;
}

function finish(sigma: number[][], mu: number[], w: number[], range: [number, number]): OptResult {
  const wn = w.map((x) => (Math.abs(x) < 1e-12 ? 0 : x));
  const v = quad(wn, sigma);
  return { status: 'optimal', weights: wn, ret: dot(wn, mu), variance: v, vol: Math.sqrt(Math.max(0, v)), range };
}

export function feasibleRange(mu: number[], longOnlyMode: boolean): [number, number] {
  if (!longOnlyMode) {
    const same = mu.every((x) => Math.abs(x - mu[0]) < 1e-14);
    return same ? [mu[0], mu[0]] : [-Infinity, Infinity];
  }
  return [Math.min(...mu), Math.max(...mu)];
}

/** Minimum-variance portfolio for a fixed target return. Reports infeasibility instead of silently changing it. */
export function optimiseForTarget(sigma: number[][], mu: number[], target: number, longOnlyMode = true): OptResult {
  const range = feasibleRange(mu, longOnlyMode);
  const empty: OptResult = { status: 'infeasible', weights: mu.map(() => NaN), ret: NaN, variance: NaN, vol: NaN, range };
  const slack = 1e-9 * (1 + Math.abs(target));
  if (target < range[0] - slack || target > range[1] + slack) {
    return {
      ...empty,
      message: `Target ${(target * 100).toFixed(2)}% is outside the achievable ${longOnlyMode ? 'long-only ' : ''}range ` +
        `${(range[0] * 100).toFixed(2)}% to ${(range[1] * 100).toFixed(2)}% for this period's expected returns.`,
    };
  }
  const t = Math.min(Math.max(target, range[0]), range[1]); // only to absorb 1e-9 rounding
  const w = longOnlyMode ? longOnly(sigma, mu, t) : solveEq(sigma, mu, mu.map((_, i) => i), t)?.w ?? null;
  if (!w) return { ...empty, status: 'singular', message: 'Covariance matrix is singular for this period; no unique optimum.' };
  return finish(sigma, mu, w, range);
}

/** Global minimum-variance portfolio (budget constraint only). */
export function globalMinVariance(sigma: number[][], mu: number[], longOnlyMode = true): OptResult {
  const n = mu.length;
  const range = feasibleRange(mu, longOnlyMode);
  const w = longOnlyMode ? longOnly(sigma, mu, null) : solveEq(sigma, mu, mu.map((_, i) => i), null)?.w ?? null;
  if (!w || w.length !== n) return { status: 'singular', weights: mu.map(() => NaN), ret: NaN, variance: NaN, vol: NaN, range, message: 'Singular covariance matrix.' };
  return finish(sigma, mu, w, range);
}

export interface FrontierPoint { ret: number; vol: number; weights: number[] }

/** Efficient frontier from the global-minimum-variance return up to the highest-return stock. */
export function efficientFrontier(sigma: number[][], mu: number[], nPoints = 40, longOnlyMode = true): FrontierPoint[] {
  const gmv = globalMinVariance(sigma, mu, longOnlyMode);
  if (gmv.status !== 'optimal') return [];
  const hi = longOnlyMode ? Math.max(...mu) : Math.max(...mu, gmv.ret + 0.5);
  const pts: FrontierPoint[] = [{ ret: gmv.ret, vol: gmv.vol, weights: gmv.weights }];
  for (let k = 1; k < nPoints; k++) {
    const t = gmv.ret + ((hi - gmv.ret) * k) / (nPoints - 1);
    const r = optimiseForTarget(sigma, mu, t, longOnlyMode);
    if (r.status === 'optimal') pts.push({ ret: r.ret, vol: r.vol, weights: r.weights });
  }
  return pts;
}
