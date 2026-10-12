import type { VarMethod } from '../engine/types';
import { useStore } from '../state/store';
import { NumField, Tabs } from './ui';

/** Always-visible global controls. Every page recalculates from these. */
export function ScenarioBar() {
  const { config, setConfig } = useStore();
  return (
    <div className="scenario" role="region" aria-label="Scenario controls">
      <div className="scenario-in">
        <label className="sc"><span>Confidence</span>
          <select className="input" aria-label="VaR confidence level" value={config.confidence >= 0.985 ? 0.99 : config.confidence <= 0.955 && config.confidence >= 0.945 ? 0.95 : config.confidence}
            onChange={(e) => setConfig((c) => ({ ...c, confidence: Number(e.target.value) }))}>
            <option value={0.95}>95%</option><option value={0.99}>99%</option>
            {![0.95, 0.99].includes(config.confidence) && <option value={config.confidence}>{(config.confidence * 100).toFixed(1)}% (custom)</option>}
          </select>
        </label>
        <label className="sc"><span>VaR / ES method</span>
          <select className="input" aria-label="VaR method" value={config.risk.method}
            onChange={(e) => setConfig((c) => ({ ...c, varMethod: e.target.value as VarMethod, risk: { ...c.risk, method: e.target.value as VarMethod } }))}>
            <option value="historical">Historical</option><option value="parametric">Parametric (normal)</option><option value="montecarlo">Monte Carlo</option>
          </select>
        </label>
        <div className="sc"><span>Capital A (₹)</span>
          <NumField label="Capital for Portfolio A in rupees" value={config.investment.A} decimals={0} step={50000} min={1} prefix="₹"
            onChange={(v) => v > 0 && setConfig((c) => ({ ...c, investment: { ...c.investment, A: v } }))} /></div>
        <div className="sc"><span>Capital B (₹)</span>
          <NumField label="Capital for Portfolio B in rupees" value={config.investment.B} decimals={0} step={50000} min={1} prefix="₹"
            onChange={(v) => v > 0 && setConfig((c) => ({ ...c, investment: { ...c.investment, B: v } }))} /></div>
        <div className="sc"><span>Risk-free</span>
          <NumField label="Risk-free rate percent per year" value={config.riskFree} scale={100} decimals={2} unit="%" step={0.25} min={0} max={30}
            onChange={(v) => setConfig((c) => ({ ...c, riskFree: Math.max(0, Math.min(0.3, v)) }))} /></div>
        <div className="sc"><span>Show losses in</span>
          <Tabs<'inr' | 'pct'> label="Display unit" value={config.displayUnit} onChange={(v) => setConfig((c) => ({ ...c, displayUnit: v }))}
            options={[{ id: 'inr', label: '₹' }, { id: 'pct', label: '%' }]} /></div>
      </div>
    </div>
  );
}
