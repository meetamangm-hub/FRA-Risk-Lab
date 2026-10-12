import { useMemo, useState } from 'react';
import { Plot, COLORS, PERIOD_COLORS } from '../components/Plot';
import { Card, Chip, Empty, Field, Formula, How, Issues, Kpi, NumField, Tabs } from '../components/ui';
import { WindowEditor } from '../components/WindowEditor';
import { allocationVerdict } from '../engine/frontierCompare';
import type { PortfolioId } from '../engine/types';
import { fmtPct } from '../format';
import { useStore } from '../state/store';

const pp = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} pp`;

export function Frontier() {
  const { config, setConfig, analysis: an } = useStore();
  const pid = config.focusPortfolio;
  const [pct, setPct] = useState(true);
  const f = an.frontier[pid];
  const auto = config.targetReturn === null;
  const verdict = useMemo(() => (f ? allocationVerdict(f, config.allocThreshold) : null), [f, config.allocThreshold]);
  const pCol = pid === 'A' ? COLORS.A : COLORS.B;

  const frontierTraces = (p: NonNullable<typeof f>['periods'][number], stocks: boolean) => {
    const col = PERIOD_COLORS[p.windowId];
    const t: any[] = [];
    if (p.frontier.length) t.push({ type: 'scatter', mode: 'lines', name: `${p.label} frontier`, x: p.frontier.map((x) => x.vol), y: p.frontier.map((x) => x.ret), line: { color: col, width: 2.5 }, hovertemplate: 'σ %{x:.1%}<br>return %{y:.1%}<extra>' + p.label + '</extra>' });
    if (stocks) t.push({ type: 'scatter', mode: 'markers+text', name: 'Stocks', x: p.assetSigma, y: p.assetMu, text: p.tickers, textposition: 'top center', textfont: { size: 9, color: COLORS.gray }, marker: { size: 6, color: '#c9c3b3' }, hovertemplate: '%{text}<br>σ %{x:.1%}, μ %{y:.1%}<extra></extra>' });
    t.push({ type: 'scatter', mode: 'markers', name: `${p.label}: manual weights`, x: [p.current.vol], y: [p.current.ret], marker: { symbol: 'diamond', size: 11, color: pCol, line: { color: '#fff', width: 1.5 } }, hovertemplate: 'Manual weights<br>σ %{x:.1%}, μ %{y:.1%}<extra></extra>' });
    if (p.maxSharpe) t.push({ type: 'scatter', mode: 'markers', name: `${p.label}: max Sharpe`, x: [p.maxSharpe.vol], y: [p.maxSharpe.ret], marker: { symbol: 'triangle-up', size: 11, color: '#fff', line: { color: col, width: 2 } }, hovertemplate: `Max Sharpe ${p.maxSharpe.sharpe.toFixed(2)}<br>σ %{x:.1%}, μ %{y:.1%}<extra></extra>` });
    if (p.status === 'optimal') t.push({ type: 'scatter', mode: 'markers', name: `${p.label}: optimizer at target`, x: [p.vol], y: [p.ret], marker: { symbol: 'star', size: 16, color: col, line: { color: '#fff', width: 1 } }, hovertemplate: 'Optimizer at target<br>σ %{x:.1%}, μ %{y:.1%}<extra></extra>' });
    return t;
  };
  const targetShape = f ? { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: f.target, y1: f.target, line: { color: COLORS.accent, dash: 'dash', width: 1.5 } } : null;
  const axes = { xaxis: { title: { text: 'Volatility (annual)' }, tickformat: '.0%' }, yaxis: { title: { text: 'Return (annual)' }, tickformat: '.0%' }, hovermode: 'closest' as const };

  const overlay = useMemo(() => (f ? f.periods.flatMap((p) => frontierTraces(p, false)) : []), [f, pid]); // eslint-disable-line
  const weightBars = useMemo(() => {
    if (!f) return [];
    const mk = (name: string, w: number[], color: string, pattern?: string) => ({
      type: 'bar', name, x: f.tickers, y: w.map((x) => (Number.isFinite(x) ? (pct ? x : x * config.investment[pid]) : null)),
      marker: { color, pattern: pattern ? { shape: pattern } : undefined }, hovertemplate: '%{x}<br>' + (pct ? '%{y:.1%}' : '₹%{y:,.0f}') + '<extra>' + name + '</extra>',
    });
    return [mk('Manual (your input)', f.currentWeights, '#9aa0ad', '/'), ...f.periods.map((p) => mk(`Optimizer · ${p.label}`, p.weights, PERIOD_COLORS[p.windowId]))];
  }, [f, pct, config.investment, pid]);
  const riskBars = useMemo(() => {
    if (!f) return [];
    const lab = f.periods.map((p) => p.label);
    return [
      { type: 'bar', name: 'Manual weights', x: lab, y: f.periods.map((p) => p.current.vol), marker: { color: '#9aa0ad', pattern: { shape: '/' } }, hovertemplate: '%{x}<br>%{y:.2%}<extra>Manual</extra>' },
      { type: 'bar', name: 'Optimizer at target', x: lab, y: f.periods.map((p) => (p.status === 'optimal' ? p.vol : null)), marker: { color: f.periods.map((p) => PERIOD_COLORS[p.windowId]) }, hovertemplate: '%{x}<br>%{y:.2%}<extra>Optimizer</extra>' },
    ];
  }, [f]);

  const ref = f?.periods.find((p) => p.windowId === 'reference');
  const limitsOn = config.longOnly;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Requirement 3 · Would the optimizer choose different weights?</h1>
          <p className="muted">Same target return, three data periods. Only the data changes.</p>
        </div>
        <Tabs<PortfolioId> label="Portfolio" value={pid} onChange={(v) => setConfig((c) => ({ ...c, focusPortfolio: v }))} options={[{ id: 'A', label: 'Portfolio A · High' }, { id: 'B', label: 'Portfolio B · Low' }]} />
      </div>
      <div className="legend"><span className="tag edit">Editable assumption</span><span className="tag data">Historical data</span><span className="tag calc">Calculated result</span></div>
      <Issues issues={an.issues.filter((i) => i.level === 'error')} />

      <Card title={<>Inputs <span className="tag edit">editable</span></>}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', alignItems: 'start', gap: 14 }}>
          <Field label="Target return (annual)" hint={auto && f ? `Auto = portfolio's own mean return in the reference period` : 'Typed; identical in every period'}>
            <NumField label="Target annual return percent" unit="%/yr" scale={100} decimals={2} step={0.5} disabled={auto}
              value={auto ? (f?.target ?? 0) : (config.targetReturn as number)} onChange={(v) => setConfig((c) => ({ ...c, targetReturn: v }))} />
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked={auto} onChange={(e) => setConfig((c) => ({ ...c, targetReturn: e.target.checked ? null : (f?.target ?? 0.1) }))} />
              Use portfolio's own return
            </label>
          </Field>
          <Field label="Constraint">
            <Tabs<'long' | 'free'> label="Constraint" value={limitsOn ? 'long' : 'free'} onChange={(v) => setConfig((c) => ({ ...c, longOnly: v === 'long' }))}
              options={[{ id: 'long', label: 'Long-only' }, { id: 'free', label: 'Shorting allowed' }]} />
            <span className="small muted">Weights always sum to 100%.</span>
          </Field>
          <Field label="Min weight per stock"><NumField label="Minimum weight percent" unit="%" scale={100} decimals={1} step={1} min={0} max={100} disabled={!limitsOn} value={config.minWeight} onChange={(v) => setConfig((c) => ({ ...c, minWeight: Math.max(0, Math.min(1, v)) }))} /></Field>
          <Field label="Max weight per stock" hint={limitsOn ? `With ${config.holdings[pid].length} stocks, max must be ≥ ${(100 / Math.max(1, config.holdings[pid].length)).toFixed(1)}%` : undefined}><NumField label="Maximum weight percent" unit="%" scale={100} decimals={1} step={1} min={0} max={100} disabled={!limitsOn} value={config.maxWeight} onChange={(v) => setConfig((c) => ({ ...c, maxWeight: Math.max(0, Math.min(1, v)) }))} /></Field>
          <Field label={`"Different" if turnover ≥ ${(config.allocThreshold * 100).toFixed(0)}%`} hint="Turnover = ½Σ|Δw|">
            <input type="range" aria-label="Materiality threshold for turnover" min={0.02} max={0.4} step={0.01} value={config.allocThreshold} onChange={(e) => setConfig((c) => ({ ...c, allocThreshold: Number(e.target.value) }))} />
          </Field>
          <Field label="Risk-free rate (for max Sharpe)"><span className="small">{fmtPct(config.riskFree, 2)} · set in the bar above</span></Field>
        </div>
        <details style={{ marginTop: 10 }} open><summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Period dates</summary><div style={{ marginTop: 8 }}><WindowEditor ids={['reference', 'crisis', 'calm']} /></div></details>
      </Card>

      {!f || !verdict ? <Empty>{an.frontierError[pid]}</Empty> : (
        <>
          <div className={`banner ${verdict.answer === 'unknown' ? 'warn' : 'info'}`} role="status" style={{ fontSize: '1.02rem' }}>
            <strong>{verdict.headline}</strong>
            {verdict.rows.filter((r) => r.maxChange).map((r) => <span key={r.windowId}>• {r.label}: biggest shift {r.maxChange!.ticker} {r.maxChange!.pp >= 0 ? '+' : ''}{r.maxChange!.pp.toFixed(1)} pp vs reference; {r.nChanged} stock(s) move ≥ 5 pp.</span>)}
          </div>

          <div className="grid g3">
            {f.periods.map((p) => (
              <Card key={p.windowId} title={<span style={{ color: PERIOD_COLORS[p.windowId] }}>{p.label}</span>} aside={`${p.n} days`}>
                {p.status === 'optimal' ? (
                  <div className="stack" style={{ gap: 6 }}>
                    <Kpi label="Risk at target" value={fmtPct(p.vol, 1)} sub={`target ${fmtPct(f.target, 1)} · manual weights ${fmtPct(p.current.vol, 1)}`} />
                    {p.maxSharpe && <span className="small muted">Max-Sharpe ({fmtPct(config.riskFree, 1)} rf): {p.maxSharpe.sharpe.toFixed(2)} at {fmtPct(p.maxSharpe.vol, 1)} vol</span>}
                  </div>
                ) : (
                  <div className="stack" style={{ gap: 6 }}>
                    <Chip tone="warn">Infeasible</Chip>
                    <p className="small" style={{ margin: 0 }}>{p.message ?? 'No solution.'}</p>
                    {Number.isFinite(p.range[0]) && <p className="small muted" style={{ margin: 0 }}>Achievable under your limits: {fmtPct(p.range[0], 1)} to {fmtPct(p.range[1], 1)}. The target was not changed.</p>}
                  </div>
                )}
              </Card>
            ))}
          </div>

          <Card title="Efficient frontiers at one target" aside={<span><span className="tag calc">calculated</span> ★ optimizer · ◆ manual · ▲ max Sharpe · dashed = common target</span>}>
            <Plot data={overlay} height={400} ariaLabel="Overlay of efficient frontiers with common target" layout={{ ...axes, shapes: [targetShape], annotations: [{ xref: 'paper', x: 1, y: f.target, yanchor: 'bottom', xanchor: 'right', text: `common target ${fmtPct(f.target, 1)}`, showarrow: false, font: { size: 11, color: '#9a6200' } }] }} />
            <div className="grid g3" style={{ marginTop: 8 }}>
              {f.periods.map((p) => (
                <Plot key={p.windowId} data={frontierTraces(p, true)} height={260} ariaLabel={`${p.label} frontier`} layout={{ ...axes, showlegend: false, title: { text: p.label, font: { size: 13 } }, shapes: [targetShape], margin: { l: 48, r: 8, t: 30, b: 40 } }} />
              ))}
            </div>
          </Card>

          <div className="grid g2">
            <Card title="Weights: manual vs optimizer" aside={<Tabs<'p' | 'r'> label="Weight unit" value={pct ? 'p' : 'r'} onChange={(v) => setPct(v === 'p')} options={[{ id: 'p', label: '%' }, { id: 'r', label: '₹' }]} />}>
              <Plot data={weightBars} height={340} ariaLabel="Grouped weights by period" layout={{ barmode: 'group', yaxis: { tickformat: pct ? '.0%' : ',.0f', title: { text: pct ? 'Weight' : 'Amount (₹)' } }, xaxis: { tickangle: -35 } }} />
              <p className="small muted">Hatched grey = the weights you typed. Coloured = optimizer output for that period.</p>
            </Card>
            <Card title="Risk at the same target">
              <Plot data={riskBars} height={340} ariaLabel="Volatility at target by period" layout={{ barmode: 'group', yaxis: { tickformat: '.0%', title: { text: 'Annual volatility' } } }} />
              <p className="small muted">Manual weights may earn more or less than the target in a given period, so compare at equal return using the frontier above.</p>
            </Card>
          </div>

          <Card title="Per-stock allocation changes" aside={<span className="tag calc">calculated</span>}>
            <div className="scroll-x">
              <table className="t">
                <thead><tr><th>Stock</th><th className="n">Manual</th>{f.periods.map((p) => <th key={p.windowId} className="n">{p.label}</th>)}{f.periods.filter((p) => p.windowId !== 'reference').map((p) => <th key={'d' + p.windowId} className="n">Δ {p.label} vs ref.</th>)}</tr></thead>
                <tbody>
                  {f.tickers.map((t, i) => (
                    <tr key={t}>
                      <td><strong>{t}</strong></td>
                      <td className="n">{pct ? fmtPct(f.currentWeights[i], 1) : '₹' + Math.round(f.currentWeights[i] * config.investment[pid]).toLocaleString('en-IN')}</td>
                      {f.periods.map((p) => {
                        const d = p.weights[i] - f.currentWeights[i];
                        return <td key={p.windowId} className="n">{p.status === 'optimal' ? <>{pct ? fmtPct(p.weights[i], 1) : '₹' + Math.round(p.weights[i] * config.investment[pid]).toLocaleString('en-IN')}<div className={`small ${d > 0.005 ? 'diff-up' : d < -0.005 ? 'diff-down' : 'muted'}`}>{pp(d)} vs manual</div></> : <span className="muted">infeasible</span>}</td>;
                      })}
                      {f.periods.filter((p) => p.windowId !== 'reference').map((p) => <td key={'d' + p.windowId} className="n">{p.status === 'optimal' && ref?.status === 'optimal' ? pp(p.weights[i] - ref.weights[i]) : '–'}</td>)}
                    </tr>
                  ))}
                  <tr className="total"><td>Total</td><td className="n">{fmtPct(f.currentWeights.reduce((s, x) => s + x, 0), 1)}</td>{f.periods.map((p) => <td key={p.windowId} className="n">{p.status === 'optimal' ? fmtPct(p.weights.reduce((s, x) => s + x, 0), 1) : '–'}</td>)}{f.periods.filter((p) => p.windowId !== 'reference').map((p) => <td key={'d' + p.windowId} />)}</tr>
                </tbody>
              </table>
            </div>
            <div className="scroll-x" style={{ marginTop: 10 }}>
              <table className="t">
                <thead><tr><th>Period</th><th className="n">Turnover vs reference</th><th className="n">Turnover vs manual</th><th className="n">Return range possible</th><th className="n">Min-variance vol.</th></tr></thead>
                <tbody>{verdict.rows.map((r, i) => {
                  const p = f.periods[i];
                  return <tr key={r.windowId}><td>{r.label}</td><td className="n">{r.turnoverVsReference === null ? '–' : fmtPct(r.turnoverVsReference, 0)}</td><td className="n">{r.turnoverVsManual === null ? <Chip tone="warn">infeasible</Chip> : fmtPct(r.turnoverVsManual, 0)}</td><td className="n">{Number.isFinite(p.range[0]) ? `${fmtPct(p.range[0], 0)} to ${fmtPct(p.range[1], 0)}` : 'unbounded'}</td><td className="n">{p.gmv ? `${fmtPct(p.gmv.vol, 1)} at ${fmtPct(p.gmv.ret, 1)}` : '–'}</td></tr>;
                })}</tbody>
              </table>
            </div>
          </Card>

          <How title="Formulation and cautions">
            <Formula tex={String.raw`\min_{w}\; w^{\top}\Sigma w\quad\text{s.t.}\quad w^{\top}\mu=\mu_{\text{target}},\;\; \sum_i w_i=1,\;\; \ell\le w_i\le u`} />
            <p>μ and Σ are re-estimated from each period's own data; the target and limits are identical across periods. An unreachable target (or impossible limits) is reported as infeasible, never silently altered. Mean–variance optimisation is very sensitive to expected-return inputs, and short windows are noisy (crisis returns are weeks scaled ×252). This shows how the <em>inputs</em> shifted between periods; it is not advice.</p>
          </How>
        </>
      )}
    </div>
  );
}
