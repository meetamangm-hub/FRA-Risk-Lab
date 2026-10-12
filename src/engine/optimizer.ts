/**
 * Markowitz mean–variance optimisation.
 *
 *   minimise  wᵀΣw   subject to   Σw_i = 1,  μᵀw = μ_target,  lo ≤ w_i ≤ hi
 *
 * Σ and μ must be on the SAME time basis (we use annualised values everywhere).
 * Bounds are solved with a primal–dual active-set loop verified against the KKT conditions
 * (sign of every bound multiplier), with an exhaustive search over bound states as a safety
 * net for n ≤ 10. lo = −∞ and hi = +∞ means "shorting allowed" (closed-form, no bounds).
 */

export type OptStatus = 'optimal' | 'infeasible' | 'singular';

export interface OptOptions {
  /** minimum weight per stock (default 0 = long-only; −Infinity = shorting allowed) */
  lo: number;
  /** maximum weight per stock (default 1; Infinity = unbounded) */
  hi: number;
}
export const LONG_ONLY: OptOptions = { lo: 0, hi: 1 };
export const SHORTING: OptOptions = { lo: -Infinity, hi: Infinity };

export interface OptResult {
  status: OptStatus;
  weights: number[];
  ret: number;
  variance: number;
  vol: number;
  message?: string;
  /** achievable return range for the chosen constraints */
  range: [number, number];
}

const normOpts = (o?: OptOptions | boolean): OptOptions =>
  o === undefined || o === true ? LONG_ONLY : o === false ? SHORTING : o;

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

const quad = (w: number[], s: number[][]) => {
  let v = 0;
  for (let i = 0; i < w.length; i++) { if (w[i] === 0) continue; for (let j = 0; j < w.length; j++) v += w[i] * s[i][j] * w[j]; }
  return v;
};
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

type State = 0 | 1 | 2; // 0 free, 1 at lower bound, 2 at upper bound
interface Sol { w: number[]; lam1: number; lam2: number }

/** Equality-constrained solve with some weights fixed at their bounds (state ≠ 0). */
function solveState(sigma: number[][], mu: number[], st: State[], lo: number, hi: number, target: number | null): Sol | null {
  const n = mu.length;
  const x = st.map((s) => (s === 1 ? lo : s === 2 ? hi : 0));
  const F: number[] = [];
  st.forEach((s, i) => { if (s === 0) F.push(i); });
  const m = F.length;
  let budget = 1, ret = target ?? 0;
  for (let i = 0; i < n; i++) if (st[i] !== 0) { budget -= x[i]; ret -= mu[i] * x[i]; }
  const hasRet = target !== null;
  const w = x.slice();
  if (m === 0) {
    if (Math.abs(budget) > 1e-10 || (hasRet && Math.abs(ret) > 1e-9 * (1 + Math.abs(target as number)))) return null;
    return { w, lam1: NaN, lam2: NaN };
  }
  if (m === 1 && !hasRet) { w[F[0]] = budget; return { w, lam1: NaN, lam2: NaN }; }
  if (m === 1 && hasRet) {
    const i = F[0];
    if (Math.abs(budget * mu[i] - ret) > 1e-9 * (1 + Math.abs(ret))) return null;
    w[i] = budget;
    return { w, lam1: NaN, lam2: NaN };
  }
  const k = hasRet ? 2 : 1;
  const N = m + k;
  const A: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  const b = new Array(N).fill(0);
  for (let a = 0; a < m; a++) {
    for (let c = 0; c < m; c++) A[a][c] = 2 * sigma[F[a]][F[c]];
    A[a][m] = -1; A[m][a] = 1;
    if (hasRet) { A[a][m + 1] = -mu[F[a]]; A[m + 1][a] = mu[F[a]]; }
    let r = 0;
    for (let i = 0; i < n; i++) if (st[i] !== 0) r += 2 * sigma[F[a]][i] * x[i];
    b[a] = -r;
  }
  b[m] = budget;
  if (hasRet) b[m + 1] = ret;
  const sol = solveLinear(A, b);
  if (!sol) return null;
  for (let a = 0; a < m; a++) w[F[a]] = sol[a];
  return { w, lam1: sol[m], lam2: hasRet ? sol[m + 1] : 0 };
}

function bounded(sigma: number[][], mu: number[], target: number | null, lo: number, hi: number): number[] | null {
  const n = mu.length;
  const st: State[] = new Array(n).fill(0);
  const seen = new Set<string>();
  for (let iter = 0; iter < 600; iter++) {
    const key = st.join('');
    if (seen.has(key)) break; // cycling → fall back
    seen.add(key);
    const sol = solveState(sigma, mu, st, lo, hi, target);
    if (!sol) break;
    // primal feasibility of free weights
    let worst = 1e-12, wi = -1, to: State = 1;
    for (let i = 0; i < n; i++) {
      if (st[i] !== 0) continue;
      if (lo - sol.w[i] > worst) { worst = lo - sol.w[i]; wi = i; to = 1; }
      if (sol.w[i] - hi > worst) { worst = sol.w[i] - hi; wi = i; to = 2; }
    }
    if (wi >= 0) { st[wi] = to; continue; }
    // dual feasibility of bound multipliers
    const Sw = sigma.map((row) => dot(row, sol.w));
    let bestV = 1e-9, free = -1;
    for (let i = 0; i < n; i++) {
      if (st[i] === 0) continue;
      const g = 2 * Sw[i] - sol.lam1 - (target === null ? 0 : sol.lam2 * mu[i]);
      if (Number.isNaN(g)) continue;
      const viol = st[i] === 1 ? -g : g; // lower needs g ≥ 0, upper needs g ≤ 0
      if (viol > bestV) { bestV = viol; free = i; }
    }
    if (free < 0) return sol.w.map((v) => Math.min(hi, Math.max(lo, v)));
    st[free] = 0;
  }
  return n <= 10 ? exhaustive(sigma, mu, target, lo, hi) : null;
}

function exhaustive(sigma: number[][], mu: number[], target: number | null, lo: number, hi: number): number[] | null {
  const n = mu.length;
  let best: number[] | null = null, bestV = Infinity;
  const total = 3 ** n;
  for (let code = 0; code < total; code++) {
    const st: State[] = [];
    let c = code;
    for (let i = 0; i < n; i++) { st.push((c % 3) as State); c = Math.floor(c / 3); }
    const sol = solveState(sigma, mu, st, lo, hi, target);
    if (!sol) continue;
    if (sol.w.some((v) => v < lo - 1e-9 || v > hi + 1e-9)) continue;
    const v = quad(sol.w, sigma);
    if (v < bestV - 1e-18) { bestV = v; best = sol.w.map((x) => Math.min(hi, Math.max(lo, x))); }
  }
  return best;
}

function unconstrained(sigma: number[][], mu: number[], target: number | null): number[] | null {
  const st: State[] = new Array(mu.length).fill(0);
  return solveState(sigma, mu, st, 0, 1, target)?.w ?? null;
}

function finish(sigma: number[][], mu: number[], w: number[], range: [number, number]): OptResult {
  const wn = w.map((x) => (Math.abs(x) < 1e-12 ? 0 : x));
  const v = quad(wn, sigma);
  return { status: 'optimal', weights: wn, ret: dot(wn, mu), variance: v, vol: Math.sqrt(Math.max(0, v)), range };
}

/** Highest / lowest return achievable with Σw=1 and lo ≤ w ≤ hi (greedy; exact for a linear objective). */
export function feasibleRange(mu: number[], o: OptOptions | boolean = true): [number, number] {
  const { lo, hi } = normOpts(o);
  const n = mu.length;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    const same = mu.every((x) => Math.abs(x - mu[0]) < 1e-14);
    return same ? [mu[0], mu[0]] : [-Infinity, Infinity];
  }
  if (n * lo > 1 + 1e-12 || n * hi < 1 - 1e-12) return [NaN, NaN];
  const ext = (desc: boolean) => {
    const idx = mu.map((_, i) => i).sort((a, b) => (desc ? mu[b] - mu[a] : mu[a] - mu[b]));
    let left = 1 - n * lo, r = lo * mu.reduce((s, x) => s + x, 0);
    for (const i of idx) { const add = Math.min(hi - lo, left); r += add * mu[i]; left -= add; if (left <= 1e-15) break; }
    return r;
  };
  return [ext(false), ext(true)];
}

/** Why the constraint set itself can be impossible. */
export function constraintProblem(n: number, o: OptOptions | boolean): string | null {
  const { lo, hi } = normOpts(o);
  if (Number.isFinite(lo) && n * lo > 1 + 1e-12) return `Minimum weight ${(lo * 100).toFixed(1)}% × ${n} stocks exceeds 100%.`;
  if (Number.isFinite(hi) && n * hi < 1 - 1e-12) return `Maximum weight ${(hi * 100).toFixed(1)}% × ${n} stocks is below 100%, so the weights cannot sum to 100%.`;
  if (Number.isFinite(lo) && Number.isFinite(hi) && lo > hi) return 'Minimum weight is above the maximum weight.';
  return null;
}

/** Minimum-variance portfolio for a fixed target return. Reports infeasibility instead of silently changing it. */
export function optimiseForTarget(sigma: number[][], mu: number[], target: number, options?: OptOptions | boolean): OptResult {
  const o = normOpts(options);
  const n = mu.length;
  const bad = constraintProblem(n, o);
  const range = feasibleRange(mu, o);
  const empty: OptResult = { status: 'infeasible', weights: mu.map(() => NaN), ret: NaN, variance: NaN, vol: NaN, range };
  if (bad) return { ...empty, message: bad };
  const slack = 1e-9 * (1 + Math.abs(target));
  if (target < range[0] - slack || target > range[1] + slack) {
    const tag = Number.isFinite(o.lo) ? (o.lo > 0 || o.hi < 1 ? 'constrained ' : 'long-only ') : '';
    return {
      ...empty,
      message: `Target ${(target * 100).toFixed(2)}% is outside the achievable ${tag}range ` +
        `${(range[0] * 100).toFixed(2)}% to ${(range[1] * 100).toFixed(2)}% for this period's expected returns.`,
    };
  }
  const t = Number.isFinite(range[0]) ? Math.min(Math.max(target, range[0]), range[1]) : target; // absorbs 1e-9 rounding only
  const w = Number.isFinite(o.lo) && Number.isFinite(o.hi) ? bounded(sigma, mu, t, o.lo, o.hi) : unconstrained(sigma, mu, t);
  if (!w) return { ...empty, status: 'singular', message: 'No unique optimum for this period (singular covariance or solver did not converge).' };
  return finish(sigma, mu, w, range);
}

/** Global minimum-variance portfolio (budget and bound constraints only). */
export function globalMinVariance(sigma: number[][], mu: number[], options?: OptOptions | boolean): OptResult {
  const o = normOpts(options);
  const n = mu.length;
  const range = feasibleRange(mu, o);
  const fail = (message: string): OptResult => ({ status: 'singular', weights: mu.map(() => NaN), ret: NaN, variance: NaN, vol: NaN, range, message });
  const bad = constraintProblem(n, o);
  if (bad) return { ...fail(bad), status: 'infeasible' };
  const w = Number.isFinite(o.lo) && Number.isFinite(o.hi) ? bounded(sigma, mu, null, o.lo, o.hi) : unconstrained(sigma, mu, null);
  if (!w || w.length !== n) return fail('Singular covariance matrix.');
  return finish(sigma, mu, w, range);
}

export interface FrontierPoint { ret: number; vol: number; weights: number[] }

/** Efficient frontier from the global-minimum-variance return up to the highest achievable return. */
export function efficientFrontier(sigma: number[][], mu: number[], nPoints = 40, options?: OptOptions | boolean): FrontierPoint[] {
  const o = normOpts(options);
  const gmv = globalMinVariance(sigma, mu, o);
  if (gmv.status !== 'optimal') return [];
  const hi = Number.isFinite(gmv.range[1]) ? gmv.range[1] : Math.max(...mu, gmv.ret + 0.5);
  const pts: FrontierPoint[] = [{ ret: gmv.ret, vol: gmv.vol, weights: gmv.weights }];
  for (let k = 1; k < nPoints; k++) {
    const t = gmv.ret + ((hi - gmv.ret) * k) / (nPoints - 1);
    const r = optimiseForTarget(sigma, mu, t, o);
    if (r.status === 'optimal') pts.push({ ret: r.ret, vol: r.vol, weights: r.weights });
  }
  return pts;
}

export interface SharpePoint extends FrontierPoint { sharpe: number }

/** Maximum-Sharpe portfolio on the efficient frontier: argmax (μ_p − r_f)/σ_p via golden-section search. */
export function maxSharpe(sigma: number[][], mu: number[], rf: number, options?: OptOptions | boolean): SharpePoint | null {
  const o = normOpts(options);
  const gmv = globalMinVariance(sigma, mu, o);
  if (gmv.status !== 'optimal') return null;
  const hi = Number.isFinite(gmv.range[1]) ? gmv.range[1] : Math.max(...mu) + 0.5;
  const f = (t: number) => {
    const r = optimiseForTarget(sigma, mu, t, o);
    return r.status === 'optimal' && r.vol > 0 ? { r, s: (r.ret - rf) / r.vol } : null;
  };
  let a = gmv.ret, b = hi;
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = b - phi * (b - a), d = a + phi * (b - a);
  let fc = f(c), fd = f(d);
  for (let i = 0; i < 60; i++) {
    if ((fc?.s ?? -Infinity) > (fd?.s ?? -Infinity)) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = f(d); }
  }
  const cands = [f(gmv.ret), f(hi), fc, fd].filter(Boolean) as { r: OptResult; s: number }[];
  if (!cands.length) return null;
  const best = cands.reduce((x, y) => (y.s > x.s ? y : x));
  return { ret: best.r.ret, vol: best.r.vol, weights: best.r.weights, sharpe: best.s };
}
