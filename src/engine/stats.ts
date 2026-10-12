/**
 * Basic statistics used across the engine.
 * Every function here is pure and has no knowledge of portfolios or the UI.
 */

export function sum(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
}

/** Sample mean: (1/T) Σ r_t */
export function mean(a: ArrayLike<number>): number {
  if (a.length === 0) return NaN;
  return sum(a) / a.length;
}

/** Sample variance with the (T-1) denominator. */
export function variance(a: ArrayLike<number>): number {
  const T = a.length;
  if (T < 2) return NaN;
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < T; i++) {
    const d = a[i] - m;
    s += d * d;
  }
  return s / (T - 1);
}

export function stdev(a: ArrayLike<number>): number {
  return Math.sqrt(variance(a));
}

/** Sample covariance of two equal-length series (T-1 denominator). */
export function covariance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const T = a.length;
  if (T < 2 || b.length !== T) return NaN;
  const ma = mean(a);
  const mb = mean(b);
  let s = 0;
  for (let i = 0; i < T; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (T - 1);
}

/** Covariance matrix of asset-major columns: cols[j][t]. */
export function covMatrix(cols: ArrayLike<number>[]): number[][] {
  const n = cols.length;
  const out: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const c = covariance(cols[i], cols[j]);
      out[i][j] = c;
      out[j][i] = c;
    }
  }
  return out;
}

export function corrFromCov(cov: number[][]): number[][] {
  const n = cov.length;
  const out: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const d = Math.sqrt(cov[i][i] * cov[j][j]);
      out[i][j] = d > 0 ? cov[i][j] / d : i === j ? 1 : 0;
    }
  }
  return out;
}

/** Mean of the off-diagonal correlations (a simple "how diversified" gauge). */
export function avgPairwiseCorr(corr: number[][]): number {
  const n = corr.length;
  if (n < 2) return NaN;
  let s = 0;
  let c = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { s += corr[i][j]; c++; }
  return s / c;
}

export function isSymmetric(m: number[][], tol = 1e-12): boolean {
  for (let i = 0; i < m.length; i++)
    for (let j = i + 1; j < m.length; j++)
      if (Math.abs(m[i][j] - m[j][i]) > tol * (1 + Math.abs(m[i][j]))) return false;
  return true;
}

export function skewness(a: ArrayLike<number>): number {
  const T = a.length;
  if (T < 3) return NaN;
  const m = mean(a);
  let m2 = 0, m3 = 0;
  for (let i = 0; i < T; i++) { const d = a[i] - m; m2 += d * d; m3 += d * d * d; }
  m2 /= T; m3 /= T;
  return m3 / Math.pow(m2, 1.5);
}

/** Excess kurtosis (normal = 0). */
export function excessKurtosis(a: ArrayLike<number>): number {
  const T = a.length;
  if (T < 4) return NaN;
  const m = mean(a);
  let m2 = 0, m4 = 0;
  for (let i = 0; i < T; i++) { const d = a[i] - m; const d2 = d * d; m2 += d2; m4 += d2 * d2; }
  m2 /= T; m4 /= T;
  return m4 / (m2 * m2) - 3;
}

/**
 * Empirical quantile, linear interpolation between order statistics
 * (Hyndman–Fan type 7: NumPy default, Excel PERCENTILE.INC).
 * `sorted` must be ascending.
 */
export function quantileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export function sortedCopy(a: ArrayLike<number>): Float64Array {
  const s = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) s[i] = a[i];
  s.sort();
  return s;
}

/** Standard normal pdf. */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Standard normal cdf (Hart / W. J. Cody style via erfc; abs error < 1e-15 in tails). */
export function normCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

function erfc(x: number): number {
  // Numerical Recipes erfcc with Chebyshev fit, ~1.2e-7, then refined by W. Cody-like series for accuracy.
  const z = Math.abs(x);
  let r: number;
  if (z < 3) {
    // Series for erf
    let term = z;
    let s = z;
    for (let n = 1; n < 100; n++) {
      term *= (-z * z) / n;
      const add = term / (2 * n + 1);
      s += add;
      if (Math.abs(add) < 1e-17 * Math.abs(s)) break;
    }
    r = 1 - (2 / Math.sqrt(Math.PI)) * s;
  } else {
    // Continued fraction for erfc
    let f = 0;
    for (let k = 60; k >= 1; k--) f = (k / 2) / (z + f);
    r = (Math.exp(-z * z) / Math.sqrt(Math.PI)) / (z + f);
  }
  return x >= 0 ? r : 2 - r;
}

/**
 * Inverse standard normal cdf (Φ^-1) using Wichura's AS241 (PPND16), ~1e-16 relative accuracy.
 */
export function normInv(p: number): number {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return NaN;
  }
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return (
      (q *
        (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r + 67265.770927008700853) * r +
          45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r +
          133.14166789178437745) * r + 3.387132872796366608)) /
      (((((((r * 5226.495278852545925 + 28729.085735721942674) * r + 39307.89580009271061) * r +
        21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r +
        42.313330701600911252) * r + 1)
    );
  }
  let r = q < 0 ? p : 1 - p;
  r = Math.sqrt(-Math.log(r));
  let val: number;
  if (r <= 5) {
    r -= 1.6;
    val =
      (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r + 0.24178072517745061177) * r +
        1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r +
        4.6303378461565452959) * r + 1.42343711074968357734) /
      (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r +
        0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r +
        2.05319162663775882187) * r + 1);
  } else {
    r -= 5;
    val =
      (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r +
        0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r +
        5.4637849111641143699) * r + 6.6579046435011037772) /
      (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r +
        7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r +
        0.59983220655588793769) * r + 1);
  }
  return q < 0 ? -val : val;
}

/** Seedable PRNG (mulberry32): same seed => same stream on every platform. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal generator (Box–Muller, caches the second variate). */
export function makeNormalGenerator(seed: number): () => number {
  const u = mulberry32(seed);
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let a = 0;
    while (a === 0) a = u();
    const b = u();
    const rad = Math.sqrt(-2 * Math.log(a));
    spare = rad * Math.sin(2 * Math.PI * b);
    return rad * Math.cos(2 * Math.PI * b);
  };
}
