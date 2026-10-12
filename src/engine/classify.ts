import type { PortfolioMetrics } from './types';

/** Every metric is oriented so that HIGHER = RISKIER (drawdown and losses are positive magnitudes). */
export type MetricId = 'vol' | 'var95' | 'var99' | 'es95' | 'es99' | 'mdd' | 'beta';

export interface MetricDef {
  id: MetricId;
  label: string;
  short: string;
  kind: 'pct' | 'ratio';
  what: string;
  get: (m: PortfolioMetrics) => number | null;
}

export const METRICS: MetricDef[] = [
  { id: 'vol', label: 'Annualised volatility', short: 'Volatility', kind: 'pct', what: 'Total variability of returns (up and down): s·√252.', get: (m) => m.sigmaAnnual },
  { id: 'var95', label: '95% Historical VaR (1-day)', short: 'VaR 95%', kind: 'pct', what: 'Loss exceeded on only 5% of days.', get: (m) => m.hist95.var },
  { id: 'var99', label: '99% Historical VaR (1-day)', short: 'VaR 99%', kind: 'pct', what: 'Loss exceeded on only 1% of days.', get: (m) => m.hist99.var },
  { id: 'es95', label: '95% Expected Shortfall (1-day)', short: 'ES 95%', kind: 'pct', what: 'Average loss on the worst 5% of days.', get: (m) => m.hist95.es },
  { id: 'es99', label: '99% Expected Shortfall (1-day)', short: 'ES 99%', kind: 'pct', what: 'Average loss on the worst 1% of days.', get: (m) => m.hist99.es },
  { id: 'mdd', label: 'Maximum drawdown', short: 'Max drawdown', kind: 'pct', what: 'Deepest fall from a previous peak.', get: (m) => m.maxDrawdown },
  { id: 'beta', label: 'Beta vs benchmark', short: 'Beta', kind: 'ratio', what: 'Sensitivity to the market benchmark.', get: (m) => m.beta },
];

export type PrimaryId = MetricId | 'composite';

export interface RiskSettings {
  primary: PrimaryId;
  supporting: MetricId[];
  /** A is "materially" riskier when ratio ≥ threshold (and B when ratio ≤ 1/threshold). */
  threshold: number;
  compositeWeights: Record<MetricId, number>;
}

export const DEFAULT_RISK: RiskSettings = {
  primary: 'vol',
  supporting: ['es95', 'es99', 'var95', 'mdd'],
  threshold: 1.1,
  compositeWeights: { vol: 3, var95: 1, var99: 1, es95: 2, es99: 2, mdd: 2, beta: 0 },
};

export type Direction = 'A-riskier' | 'similar' | 'B-riskier' | 'n/a';

export interface ClassRow {
  id: MetricId | 'composite';
  label: string;
  kind: 'pct' | 'ratio' | 'score';
  a: number | null;
  b: number | null;
  ratio: number | null;
  direction: Direction;
}

export type Verdict = 'supported' | 'partial' | 'not-supported' | 'reversed' | 'undetermined';

export interface Classification {
  rows: ClassRow[];
  primary: ClassRow | null;
  supportingRows: ClassRow[];
  supportYes: number;
  supportTotal: number;
  verdict: Verdict;
  headline: string;
  detail: string;
  composite: { a: number; b: number; ratio: number } | null;
}

export function directionOf(ratio: number | null, threshold: number): Direction {
  if (ratio === null || !Number.isFinite(ratio)) return 'n/a';
  if (ratio >= threshold) return 'A-riskier';
  if (ratio <= 1 / threshold) return 'B-riskier';
  return 'similar';
}

/**
 * Normalised composite. For each metric k the share s_k,A = m_A / (m_A + m_B) lies in (0,1);
 * 0.5 means equal. Score_A = Σ w_k s_k,A / Σ w_k  and Score_B = 1 − Score_A. Ratio = Score_A / Score_B.
 * Weights are user choices, not a financial standard.
 */
export function compositeScore(a: PortfolioMetrics, b: PortfolioMetrics, weights: Record<MetricId, number>) {
  let num = 0, den = 0;
  for (const def of METRICS) {
    const w = weights[def.id] ?? 0;
    if (w <= 0) continue;
    const va = def.get(a), vb = def.get(b);
    if (va === null || vb === null) continue;
    const sa = Math.max(va, 0), sb = Math.max(vb, 0);
    if (sa + sb <= 0) continue;
    num += w * (sa / (sa + sb));
    den += w;
  }
  if (den === 0) return null;
  const sA = num / den;
  return { a: sA, b: 1 - sA, ratio: sA / (1 - sA) };
}

export function classify(a: PortfolioMetrics, b: PortfolioMetrics, s: RiskSettings): Classification {
  const rows: ClassRow[] = METRICS.map((d) => {
    const va = d.get(a), vb = d.get(b);
    const ratio = va !== null && vb !== null && vb > 0 ? va / vb : null;
    return { id: d.id, label: d.label, kind: d.kind, a: va, b: vb, ratio, direction: directionOf(ratio, s.threshold) };
  });
  const comp = compositeScore(a, b, s.compositeWeights);
  const compRow: ClassRow | null = comp
    ? { id: 'composite', label: 'Optional composite score', kind: 'score', a: comp.a, b: comp.b, ratio: comp.ratio, direction: directionOf(comp.ratio, s.threshold) }
    : null;

  const primary = s.primary === 'composite' ? compRow : rows.find((r) => r.id === s.primary) ?? null;
  const supportingRows = rows.filter((r) => s.supporting.includes(r.id as MetricId) && r.id !== s.primary && r.direction !== 'n/a');
  const supportYes = supportingRows.filter((r) => r.direction === 'A-riskier').length;
  const supportTotal = supportingRows.length;
  const share = supportTotal ? supportYes / supportTotal : null;

  let verdict: Verdict = 'undetermined';
  if (primary && primary.direction !== 'n/a') {
    const pYes = primary.direction === 'A-riskier';
    if (pYes && (share === null || share >= 0.75)) verdict = 'supported';
    else if (pYes) verdict = 'partial';
    else if (primary.direction === 'B-riskier' && (share === null || share < 0.5)) verdict = 'reversed';
    else if (share !== null && share >= 0.5) verdict = 'partial';
    else verdict = 'not-supported';
  }

  const pName = s.primary === 'composite' ? 'the composite score' : METRICS.find((m) => m.id === s.primary)?.short ?? '';
  const fmtR = primary?.ratio != null ? primary.ratio.toFixed(2) : '–';
  const headline = {
    supported: 'Classification supported',
    partial: 'Partially supported',
    'not-supported': 'Not supported',
    reversed: 'Reversed: Portfolio B measures riskier',
    undetermined: 'Cannot be determined',
  }[verdict];
  let detail = '';
  if (primary) {
    detail = `On ${pName}, A/B = ${fmtR}`;
    if (primary.direction === 'A-riskier') detail += ` (A is at least ${((s.threshold - 1) * 100).toFixed(0)}% higher).`;
    else if (primary.direction === 'B-riskier') detail += ` (B is higher).`;
    else detail += ` (within the ±${((s.threshold - 1) * 100).toFixed(0)}% "similar" band).`;
    if (supportTotal) detail += ` ${supportYes} of ${supportTotal} supporting measures also rank A as riskier.`;
  }
  return { rows, primary, supportingRows, supportYes, supportTotal, verdict, headline, detail, composite: comp };
}
