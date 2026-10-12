import type { Analysis } from './engine/model';
import { WINDOW_LABELS } from './engine/model';
import type { PortfolioId, PortfolioMetrics, WindowId } from './engine/types';

export const WINDOWS: WindowId[] = ['full', 'reference', 'crisis', 'calm'];
export const windowLabel = (w: WindowId) => WINDOW_LABELS[w];
export const pColor = (id: PortfolioId) => (id === 'A' ? '#d9481f' : '#1f6fb2');

export const m = (an: Analysis, p: PortfolioId, w: WindowId): PortfolioMetrics | null => an.metrics[p][w].metrics;

/** Turnover between two weight vectors: ½ Σ |w1 − w2|. */
export const turnover = (a: number[], b: number[]) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0) / 2;

export const blocked = (an: Analysis) => an.blocking.A || an.blocking.B;

export function dateAxis(m: PortfolioMetrics): string[] {
  return [m.window.start, ...m.dates];
}
