import { useMemo } from 'react';
import { Plot, COLORS } from '../components/Plot';
import { Card, Chip, Issues, Kpi, PortTag, Tabs, VerdictChip, Empty } from '../components/ui';
import { METRICS, tailOf } from '../engine/classify';
import { stockInfo } from '../engine/model';
import type { WindowId } from '../engine/types';
import { fmtDate, fmtInr, fmtLakh, fmtPct } from '../format';
import { dateAxis, m as getM, showLoss, turnover, windowLabel, WINDOWS } from '../lib';
import { allocationVerdict } from '../engine/frontierCompare';
import { useStore } from '../state/store';

export function Overview() {
  const { config, setConfig, analysis: an, setPage, setSettingsOpen, resetAll } = useStore();
  const w = config.focusWindow;
  const A = getM(an, 'A', w), B = getM(an, 'B', w);
  const cls = an.classification[w];
  const conf = Math.round(config.confidence * 1000) / 10;
  const primaryName = config.risk.primary === 'composite' ? 'Composite score' : METRICS.find((x) => x.id === config.risk.primary)!.short;

  const growth = useMemo(() => {
    if (!A || !B) return [];
    return [A, B].map((x) => ({
      x: dateAxis(x), y: Array.from(x.wealth, (v) => v * x.investment), type: 'scatter', mode: 'lines',
      name: `Portfolio ${x.portfolio}`, line: { color: x.portfolio === 'A' ? COLORS.A : COLORS.B, width: 2 },
      hovertemplate: '%{x}<br>₹%{y:,.0f}<extra>' + `Portfolio ${x.portfolio}` + '</extra>',
    }));
  }, [A, B]);

  const methodBars = useMemo(() => {
    if (!A || !B) return [];
    const rows: [string, (p: NonNullable<typeof A>) => number | undefined][] = [
      ['Historical VaR', (p) => p.hist.var], ['Parametric VaR', (p) => p.param.var], ['Monte Carlo VaR', (p) => p.mc?.var],
      ['Historical ES', (p) => p.hist.es], ['Monte Carlo ES', (p) => p.mc?.es],
    ];
    return [A, B].map((p) => ({
      type: 'bar', name: `Portfolio ${p.portfolio}`, marker: { color: p.portfolio === 'A' ? COLORS.A : COLORS.B },
      x: rows.map((r) => r[0]), y: rows.map((r) => (r[1](p) ?? 0) * p.investment),
      hovertemplate: '%{x}<br>₹%{y:,.0f}<extra>' + `Portfolio ${p.portfolio}` + '</extra>',
    }));
  }, [A, B]);

  const findings = useMemo(() => {
    const out: string[] = [];
    const wl = (id: 'crisis' | 'calm' | 'reference' | 'full') => windowLabel(id).toLowerCase();
    for (const id of ['full', 'crisis', 'calm'] as const) {
      const c = an.classification[id];
      if (c?.primary) out.push(`${windowLabel(id)}: ${c.headline.toLowerCase()}. ${c.detail}`);
    }
    const cA = getM(an, 'A', 'crisis'), cB = getM(an, 'B', 'crisis'), kA = getM(an, 'A', 'calm'), kB = getM(an, 'B', 'calm');
    if (cA && cB && kA && kB) {
      const mth = config.risk.method;
      const r = (a: typeof cA, b: typeof cA) => tailOf(a, mth)!.c95.es / tailOf(b, mth)!.c95.es;
      out.push(`Crisis vs calm: A's 95% ES rose ${(tailOf(cA, mth)!.c95.es / tailOf(kA, mth)!.c95.es).toFixed(1)}× and B's ${(tailOf(cB, mth)!.c95.es / tailOf(kB, mth)!.c95.es).toFixed(1)}×. A÷B ES moved ${r(kA, kB).toFixed(2)}× (calm) → ${r(cA, cB).toFixed(2)}× (${wl('crisis')}).`);
    }
    for (const id of ['A', 'B'] as const) {
      const f = an.frontier[id];
      if (f) { const v = allocationVerdict(f, config.allocThreshold); out.push(`Portfolio ${id} allocation: ${v.headline}`); }
    }
    return out;
  }, [an, config.risk.method, config.allocThreshold]);

  const shift = (id: 'A' | 'B') => {
    const f = an.frontier[id];
    if (!f) return null;
    return f.periods.map((p) => ({ id: p.windowId, label: p.label, status: p.status, turn: p.status === 'optimal' ? turnover(p.weights, f.currentWeights) : null, vol: p.vol, curVol: p.current.vol }));
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="hero">
        <div>
          <h1>Is “high risk” really high risk?</h1>
          <p>
            Two {fmtLakh(config.investment.A)} / {fmtLakh(config.investment.B)} portfolios of Indian stocks, tested with VaR, Expected Shortfall and Markowitz
            optimisation through a crisis and a calm market. Every figure recalculates when you change an input.
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setPage('builder')}>Edit portfolios</button>
          <button className="btn" onClick={() => setSettingsOpen(true)}>Settings</button>
          <button className="btn" onClick={() => { if (confirm('Reset everything to the project defaults?')) resetAll(); }}>Reset to defaults</button>
        </div>
      </div>

      <Issues issues={an.issues} />

      <Card title="Auto-generated findings" aside={<span className="tag calc">calculated</span>}>
        <div className="stack" style={{ gap: 8 }}>
          {findings.map((t, i) => <p key={i} className="finding">{t}</p>)}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          {an.compliance.map((c) => <span key={c.id} className={`chip ${c.ok ? 'good' : 'bad'}`} title={c.detail}>{c.ok ? '✓' : '✗'} {c.label}</span>)}
        </div>
      </Card>

      <div className="row spread">
        <div className="row">
          <span className="lab">Period shown</span>
          <Tabs<WindowId> label="Period" value={w} onChange={(v) => setConfig((c) => ({ ...c, focusWindow: v }))}
            options={WINDOWS.map((id) => ({ id, label: windowLabel(id) }))} />
        </div>
        <span className="small muted">{fmtDate(config.windows[w].start)} → {fmtDate(config.windows[w].end)}{A ? ` · ${A.n} daily returns` : ''}</span>
      </div>

      <div className="grid g2">
        {(['A', 'B'] as const).map((id) => {
          const x = id === 'A' ? A : B;
          const holdings = config.holdings[id];
          return (
            <Card key={id} tone={id === 'A' ? 'a' : 'b'} title={<span>Portfolio {id} <span className="muted" style={{ fontWeight: 500 }}>· {id === 'A' ? 'labelled High Risk' : 'labelled Low Risk'}</span></span>}
              aside={`${fmtInr(config.investment[id])} · ${holdings.length} stocks`}>
              {x ? (
                <div className="grid g3" style={{ gap: 12 }}>
                  <Kpi label="Annual volatility" value={fmtPct(x.sigmaAnnual, 1)} sub={`mean return ${fmtPct(x.muAnnual, 1)}/yr`} />
                  <Kpi label={`${conf}% 1-day VaR`} value={showLoss(config.displayUnit, tailOf(x, config.risk.method)?.sel.var, x.investment)} sub={`${config.risk.method} method`} />
                  <Kpi label={`${conf}% 1-day ES`} value={showLoss(config.displayUnit, tailOf(x, config.risk.method)?.sel.es, x.investment)} sub="avg loss beyond VaR" />
                  <Kpi small label="Max drawdown" value={fmtPct(x.maxDrawdown, 1)} sub={`${fmtDate(x.ddPeakDate)} → ${fmtDate(x.ddTroughDate)}`} />
                  <Kpi small label="Avg. stock correlation" value={x.avgCorr.toFixed(2)} sub="lower = more diversified" />
                  <Kpi small label="Beta" value={x.beta === null ? 'n/a' : x.beta.toFixed(2)} sub={x.beta === null ? 'needs benchmark file' : 'vs benchmark'} />
                </div>
              ) : <Empty>{an.metrics[id][w].error}</Empty>}
              <div className="row" style={{ marginTop: 12, gap: 6 }}>
                {holdings.map((h) => <span key={h.ticker} className="chip neutral" title={stockInfo(h.ticker)?.name}>{h.ticker} {(h.weight * 100).toFixed(0)}%</span>)}
              </div>
            </Card>
          );
        })}
      </div>

      <Card title="Does the risk label hold up?" aside={<span>Primary measure: <strong>{primaryName}</strong> · <button className="btn sm ghost" onClick={() => setPage('risk')}>change definition →</button></span>}>
        <div className="scroll-x">
          <table className="t">
            <thead><tr><th>Period</th><th className="n">Days</th><th className="n">Vol. A</th><th className="n">Vol. B</th><th className="n">A ÷ B ({primaryName})</th><th>Verdict computed from data</th><th>Supporting measures</th></tr></thead>
            <tbody>
              {WINDOWS.map((id) => {
                const c = an.classification[id];
                const a = getM(an, 'A', id), b = getM(an, 'B', id);
                return (
                  <tr key={id}>
                    <td><strong>{windowLabel(id)}</strong><div className="small muted">{fmtDate(config.windows[id].start)} → {fmtDate(config.windows[id].end)}</div></td>
                    <td className="n">{a?.n ?? '–'}</td>
                    <td className="n">{fmtPct(a?.sigmaAnnual, 1)}</td>
                    <td className="n">{fmtPct(b?.sigmaAnnual, 1)}</td>
                    <td className="n"><strong>{c?.primary?.ratio != null ? c.primary.ratio.toFixed(2) + '×' : '–'}</strong></td>
                    <td><VerdictChip v={c?.verdict} /></td>
                    <td className="small">{c ? `${c.supportYes} of ${c.supportTotal} agree` : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {cls && <p className="small" style={{ marginTop: 10 }}><strong>{windowLabel(w)}:</strong> {cls.detail}</p>}
      </Card>

      {A && B ? (
        <div className="grid g2">
          <Card title="Growth of the investment" aside={`${windowLabel(w)} · daily-rebalanced`}>
            <Plot data={growth} height={300} ariaLabel="Portfolio value over time"
              layout={{ yaxis: { title: { text: 'Portfolio value (₹)' }, tickformat: ',.0f' }, hovermode: 'x unified' }} />
          </Card>
          <Card title={`Worst-day loss by method (${conf}%, 1 day)`} aside="₹ on the invested amount">
            <Plot data={methodBars} height={300} ariaLabel="VaR and ES by method"
              layout={{ barmode: 'group', yaxis: { title: { text: 'Loss (₹)' }, tickformat: ',.0f' } }} />
          </Card>
        </div>
      ) : <Empty>Charts appear once both portfolios have valid inputs.</Empty>}

      <Card title="Would the optimiser still pick my weights?" aside={<button className="btn sm ghost" onClick={() => setPage('frontier')}>open frontier →</button>}>
        <p className="small muted">Weight turnover between today's portfolio and the minimum-variance portfolio at the <em>same target return</em>, re-estimated with each period's data (0% = same weights, 100% = completely different).</p>
        <div className="grid g2">
          {(['A', 'B'] as const).map((id) => {
            const s = shift(id);
            return (
              <div key={id} className="stack" style={{ gap: 8 }}>
                <div className="row spread"><PortTag id={id} /><span className="small muted">target {an.frontier[id] ? fmtPct(an.frontier[id]!.target, 1) : '–'}/yr</span></div>
                {s ? s.map((r) => (
                  <div key={r.id}>
                    <div className="row spread small"><span>{r.label}</span>{r.status === 'optimal' ? <strong>{fmtPct(r.turn, 0)} turnover</strong> : <Chip tone="warn">target not feasible</Chip>}</div>
                    <div className="bar"><i style={{ width: `${Math.min(100, (r.turn ?? 0) * 100)}%`, background: id === 'A' ? COLORS.A : COLORS.B }} /></div>
                  </div>
                )) : <Empty>{an.frontierError[id]}</Empty>}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
