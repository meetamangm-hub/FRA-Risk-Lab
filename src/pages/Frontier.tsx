import { useMemo, useState } from 'react';
import { Plot, COLORS, PERIOD_COLORS } from '../components/Plot';
import { Card, Chip, Empty, Field, Formula, How, Issues, Kpi, NumField, Tabs } from '../components/ui';
import { WindowEditor } from '../components/WindowEditor';
import type { PortfolioId } from '../engine/types';
import { fmtPct } from '../format';
import { turnover } from '../lib';
import { useStore } from '../state/store';

type View = 'reference' | 'crisis' | 'calm' | 'all';

export function Frontier() {
  const { config, setConfig, analysis: an } = useStore();
  const pid = config.focusPortfolio;
  const [view, setView] = useState<View>('reference');
  const f = an.frontier[pid];
  const auto = config.targetReturn === null;

  const chart = useMemo(() => {
    if (!f) return [];
    const periods = view === 'all' ? f.periods : f.periods.filter((p) => p.windowId === view);
    const traces: any[] = [];
    for (const p of periods) {
      const col = PERIOD_COLORS[p.windowId];
      if (p.frontier.length) traces.push({ type: 'scatter', mode: 'lines', name: `${p.label} frontier`, x: p.frontier.map((x) => x.vol), y: p.frontier.map((x) => x.ret), line: { color: col, width: 2.5 }, hovertemplate: 'σ %{x:.1%}<br>return %{y:.1%}<extra>' + p.label + '</extra>' });
      if (view !== 'all') traces.push({ type: 'scatter', mode: 'markers+text', name: 'Individual stocks', x: p.assetSigma, y: p.assetMu, text: p.tickers, textposition: 'top center', textfont: { size: 10, color: COLORS.gray }, marker: { size: 7, color: '#c9c3b3', line: { color: COLORS.gray, width: 1 } }, hovertemplate: '%{text}<br>σ %{x:.1%}, μ %{y:.1%}<extra></extra>' });
      traces.push({ type: 'scatter', mode: 'markers', name: view === 'all' ? `${p.label}: your weights` : 'Your current weights (this period)', x: [p.current.vol], y: [p.current.ret], marker: { symbol: 'diamond', size: 12, color: pid === 'A' ? COLORS.A : COLORS.B, line: { color: '#fff', width: 1.5 } }, hovertemplate: 'Your weights<br>σ %{x:.1%}, μ %{y:.1%}<extra></extra>' });
      if (p.status === 'optimal') traces.push({ type: 'scatter', mode: 'markers', name: view === 'all' ? `${p.label}: optimum` : 'Optimal at target', x: [p.vol], y: [p.ret], marker: { symbol: 'star', size: 16, color: col, line: { color: '#fff', width: 1 } }, hovertemplate: 'Optimal<br>σ %{x:.1%}, μ %{y:.1%}<extra></extra>' });
    }
    return traces;
  }, [f, view, pid]);

  const wBars = useMemo(() => {
    if (!f) return [];
    const cols: [string, number[], string][] = [['Your weights', f.currentWeights, COLORS.gray], ...f.periods.map((p) => [p.label, p.weights, PERIOD_COLORS[p.windowId]] as [string, number[], string])];
    return cols.map(([name, w, color]) => ({ type: 'bar', name, x: f.tickers, y: w.map((x) => (Number.isFinite(x) ? x : null)), marker: { color }, hovertemplate: '%{x}<br>%{y:.1%}<extra>' + name + '</extra>' }));
  }, [f]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Time-travel test #2: would the optimiser pick my weights?</h1>
          <p>Take the return the portfolio earns today, hold it fixed, and rebuild the minimum-variance portfolio with each era's expected returns and covariances. Same goal, different history.</p>
        </div>
        <Tabs<PortfolioId> label="Portfolio" value={pid} onChange={(v) => setConfig((c) => ({ ...c, focusPortfolio: v }))} options={[{ id: 'A', label: 'Portfolio A · High' }, { id: 'B', label: 'Portfolio B · Low' }]} />
      </div>
      <Issues issues={an.issues.filter((i) => i.level === 'error')} />

      <Card title="Optimisation set-up">
        <div className="grid g4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', alignItems: 'start' }}>
          <Field label="Target return (annual, arithmetic)" hint={auto && f ? `Auto: this portfolio's own mean return over ${f.referenceLabel}` : 'Typed by you; held constant in every period'}>
            <NumField label="Target annual return percent" unit="%/yr" scale={100} decimals={2} step={0.5} disabled={auto}
              value={auto ? (f?.target ?? 0) : (config.targetReturn as number)} onChange={(v) => setConfig((c) => ({ ...c, targetReturn: v }))} />
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked={auto} onChange={(e) => setConfig((c) => ({ ...c, targetReturn: e.target.checked ? null : (f?.target ?? 0.1) }))} />
              Use today's portfolio return (recommended)
            </label>
          </Field>
          <Field label="Weight constraint">
            <Tabs<'long' | 'free'> label="Constraint" value={config.longOnly ? 'long' : 'free'} onChange={(v) => setConfig((c) => ({ ...c, longOnly: v === 'long' }))}
              options={[{ id: 'long', label: 'Long-only (wᵢ ≥ 0)' }, { id: 'free', label: 'Shorting allowed' }]} />
            <span className="small muted">Always: weights sum to 100%.</span>
          </Field>
          <Field label="Periods used"><span className="small">Reference: {config.windows.reference.start} → {config.windows.reference.end}<br />Crisis: {config.windows.crisis.start} → {config.windows.crisis.end}<br />Calm: {config.windows.calm.start} → {config.windows.calm.end}</span></Field>
          <details><summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Edit periods</summary><div style={{ marginTop: 8 }}><WindowEditor ids={['reference', 'crisis', 'calm']} /></div></details>
        </div>
      </Card>

      {!f ? <Empty>{an.frontierError[pid]}</Empty> : (
        <>
          <div className="grid g3">
            {f.periods.map((p) => (
              <Card key={p.windowId} title={`${p.label} era`} aside={`${p.n} days`}>
                {p.status === 'optimal' ? (
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row spread"><Kpi small label="Optimal volatility" value={fmtPct(p.vol, 1)} sub={`variance ${p.variance.toFixed(4)} · at ${fmtPct(p.ret, 1)} return`} /><Chip tone="good">feasible</Chip></div>
                    <p className="small muted" style={{ margin: 0 }}>Your weights in this era: {fmtPct(p.current.vol, 1)} volatility at {fmtPct(p.current.ret, 1)} return. Weight turnover vs yours: <strong>{fmtPct(turnover(p.weights, f.currentWeights), 0)}</strong>.</p>
                  </div>
                ) : (
                  <div className="stack" style={{ gap: 6 }}>
                    <Chip tone="warn">target not feasible</Chip>
                    <p className="small" style={{ margin: 0 }}>{p.message ?? 'No solution.'}</p>
                    <p className="small muted" style={{ margin: 0 }}>The target is not silently changed. Try a different target or period.</p>
                  </div>
                )}
              </Card>
            ))}
          </div>

          <Card title="Efficient frontier" aside={<Tabs<View> label="Frontier view" value={view} onChange={setView} options={[{ id: 'reference', label: 'Reference' }, { id: 'crisis', label: 'Crisis' }, { id: 'calm', label: 'Calm' }, { id: 'all', label: 'Overlay' }]} />}>
            <Plot data={chart} height={420} ariaLabel="Efficient frontier"
              layout={{
                xaxis: { title: { text: 'Volatility (annualised)' }, tickformat: '.0%' }, yaxis: { title: { text: 'Expected return (annualised)' }, tickformat: '.0%' }, hovermode: 'closest',
                shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: f.target, y1: f.target, line: { color: COLORS.accent, dash: 'dash', width: 1.5 } }],
                annotations: [{ xref: 'paper', x: 1, y: f.target, yanchor: 'bottom', xanchor: 'right', text: `target ${fmtPct(f.target, 1)}`, showarrow: false, font: { size: 11, color: '#9a6200' } }],
              }} />
            <p className="small muted">The frontier traces the lowest volatility available for each return, using only that era's data. ◆ is your weights evaluated with the era's numbers; ★ is the optimiser's answer at the same target. Annualised crisis returns are extreme because a few weeks are scaled to a year (×252).</p>
          </Card>

          <div className="grid g-main" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)' }}>
            <Card title="Optimal allocation by era">
              <div className="scroll-x">
                <table className="t">
                  <thead><tr><th>Stock</th><th className="n">Your weights</th>{f.periods.map((p) => <th key={p.windowId} className="n">{p.label}</th>)}</tr></thead>
                  <tbody>
                    {f.tickers.map((t, i) => (
                      <tr key={t}>
                        <td><strong>{t}</strong></td>
                        <td className="n">{fmtPct(f.currentWeights[i], 1)}</td>
                        {f.periods.map((p) => {
                          const w = p.weights[i];
                          const d = w - f.currentWeights[i];
                          return <td key={p.windowId} className="n">{p.status === 'optimal' ? <>{fmtPct(w, 1)}<div className={`small ${d > 0.005 ? 'diff-up' : d < -0.005 ? 'diff-down' : 'muted'}`}>{d >= 0 ? '+' : ''}{(d * 100).toFixed(1)} pp</div></> : <span className="muted">–</span>}</td>;
                        })}
                      </tr>
                    ))}
                    <tr className="total"><td>Total</td><td className="n">{fmtPct(f.currentWeights.reduce((s, x) => s + x, 0), 1)}</td>{f.periods.map((p) => <td key={p.windowId} className="n">{p.status === 'optimal' ? fmtPct(p.weights.reduce((s, x) => s + x, 0), 1) : '–'}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Allocation comparison">
              <Plot data={wBars} height={340} ariaLabel="Optimal weights by era" layout={{ barmode: 'group', yaxis: { tickformat: '.0%', title: { text: 'Weight' } }, xaxis: { tickangle: -35 } }} />
            </Card>
          </div>

          <Card title="Risk and return at the same target">
            <div className="scroll-x">
              <table className="t">
                <thead><tr><th>Era</th><th className="n">Stock return range (annual)</th><th className="n">Optimal return</th><th className="n">Optimal vol.</th><th className="n">Optimal variance</th><th className="n">Your weights vol.</th><th className="n">Min-variance vol. (any return)</th></tr></thead>
                <tbody>
                  {f.periods.map((p) => (
                    <tr key={p.windowId}>
                      <td>{p.label}</td>
                      <td className="n">{Number.isFinite(p.range[0]) ? `${fmtPct(p.range[0], 0)} to ${fmtPct(p.range[1], 0)}` : 'unbounded'}</td>
                      <td className="n">{p.status === 'optimal' ? fmtPct(p.ret, 2) : <Chip tone="warn">infeasible</Chip>}</td>
                      <td className="n">{p.status === 'optimal' ? fmtPct(p.vol, 2) : '–'}</td>
                      <td className="n">{p.status === 'optimal' ? p.variance.toFixed(5) : '–'}</td>
                      <td className="n">{fmtPct(p.current.vol, 2)}</td>
                      <td className="n">{p.gmv ? `${fmtPct(p.gmv.vol, 2)} at ${fmtPct(p.gmv.ret, 1)}` : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <How title="Formulation, constraints and cautions">
              <Formula tex={String.raw`\min_{w}\; w^{\top}\Sigma w\quad\text{s.t.}\quad w^{\top}\mu=\mu_{\text{target}},\;\; \sum_i w_i=1,\;\; w_i\ge 0`} />
              <p>μ is the annualised mean (252 × mean daily return) and Σ the annualised sample covariance, both re-estimated from each era's data. The same μ<sub>target</sub> is used in every era. If it lies outside [min μ<sub>i</sub>, max μ<sub>i</sub>] for a long-only portfolio, no solution exists and the era is reported as infeasible instead of quietly changing the target.</p>
              <p><strong>Caution:</strong> mean–variance optimisation is very sensitive to the expected-return inputs, and short windows give very noisy μ and Σ. The optimiser's output shows how the <em>inputs</em> shifted between eras; it is not an investment recommendation.</p>
            </How>
          </Card>
        </>
      )}
    </div>
  );
}
