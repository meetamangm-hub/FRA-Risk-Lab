import { useMemo, useState } from 'react';
import { Plot, COLORS } from '../components/Plot';
import { Card, Chip, Empty, Issues, Tabs, VerdictChip } from '../components/ui';
import { WindowEditor } from '../components/WindowEditor';
import { WINDOW_PRESETS } from '../engine/model';
import type { PortfolioMetrics, WindowId } from '../engine/types';
import { fmtDate, fmtInr, fmtPct } from '../format';
import { dateAxis, m as getM, windowLabel, WINDOWS } from '../lib';
import { useStore } from '../state/store';

export function Stress() {
  const { config, analysis: an } = useStore();
  const [heatW, setHeatW] = useState<WindowId>('crisis');
  const [ddW, setDdW] = useState<WindowId>('crisis');
  const conf = Math.round(config.confidence * 1000) / 10;
  const cA = getM(an, 'A', 'crisis'), cB = getM(an, 'B', 'crisis'), kA = getM(an, 'A', 'calm'), kB = getM(an, 'B', 'calm');
  const clsC = an.classification.crisis, clsK = an.classification.calm;

  const rows: { label: string; f: (m: PortfolioMetrics) => string }[] = [
    { label: 'Return observations', f: (m) => String(m.n) },
    { label: 'Cumulative return', f: (m) => fmtPct(m.cumReturn, 1) },
    { label: 'Annualised volatility', f: (m) => fmtPct(m.sigmaAnnual, 1) },
    { label: `Historical VaR ${conf}%`, f: (m) => `${fmtPct(m.hist.var)} · ${fmtInr(m.hist.var * m.investment)}` },
    { label: `Parametric VaR ${conf}%`, f: (m) => `${fmtPct(m.param.var)} · ${fmtInr(m.param.var * m.investment)}` },
    { label: `Monte Carlo VaR ${conf}%`, f: (m) => (m.mc ? `${fmtPct(m.mc.var)} · ${fmtInr(m.mc.var * m.investment)}` : '–') },
    { label: `Historical ES ${conf}%`, f: (m) => `${fmtPct(m.hist.es)} · ${fmtInr(m.hist.es * m.investment)}` },
    { label: `Monte Carlo ES ${conf}%`, f: (m) => (m.mc ? `${fmtPct(m.mc.es)} · ${fmtInr(m.mc.es * m.investment)}` : '–') },
    { label: 'Maximum drawdown', f: (m) => fmtPct(m.maxDrawdown, 1) },
    { label: 'Average stock correlation', f: (m) => m.avgCorr.toFixed(2) },
    { label: 'Beta', f: (m) => (m.beta === null ? 'n/a' : m.beta.toFixed(2)) },
  ];

  const answers = useMemo(() => {
    if (!cA || !cB || !kA || !kB || !clsC || !clsK) return null;
    const rc = clsC.rows.find((x) => x.id === 'vol')!.ratio!, rk = clsK.rows.find((x) => x.id === 'vol')!.ratio!;
    const ec = clsC.rows.find((x) => x.id === 'es95')!.ratio!, ek = clsK.rows.find((x) => x.id === 'es95')!.ratio!;
    const rank = (r: number) => (r >= config.risk.threshold ? 'A riskier' : r <= 1 / config.risk.threshold ? 'B riskier' : 'similar');
    return [
      { q: 'Did the classification hold in the crisis?', v: clsC.verdict, a: clsC.detail },
      { q: 'Did it hold in the calm period?', v: clsK.verdict, a: clsK.detail },
      { q: 'Did the volatility gap change?', v: null, a: `A÷B volatility was ${rk.toFixed(2)}× in calm and ${rc.toFixed(2)}× in the crisis (${rc > rk ? 'the gap widened' : rc < rk ? 'the gap narrowed' : 'unchanged'}). Volatility rose ${(cA.sigmaAnnual / kA.sigmaAnnual).toFixed(1)}× for A and ${(cB.sigmaAnnual / kB.sigmaAnnual).toFixed(1)}× for B.` },
      { q: 'Did downside risk change?', v: null, a: `95% ES (A÷B) moved from ${ek.toFixed(2)}× to ${ec.toFixed(2)}×. In rupees, A's ${conf}% historical ES went from ${fmtInr(kA.hist.es * kA.investment)} to ${fmtInr(cA.hist.es * cA.investment)}; B's from ${fmtInr(kB.hist.es * kB.investment)} to ${fmtInr(cB.hist.es * cB.investment)}.` },
      { q: 'Did correlations increase?', v: null, a: `Average pairwise correlation: A ${kA.avgCorr.toFixed(2)} → ${cA.avgCorr.toFixed(2)}, B ${kB.avgCorr.toFixed(2)} → ${cB.avgCorr.toFixed(2)} (calm → crisis). ${cA.avgCorr > kA.avgCorr && cB.avgCorr > kB.avgCorr ? 'Both rose, so diversification helped less when it was needed most.' : 'They did not both rise in these windows.'}` },
      { q: 'Did the ranking change?', v: null, a: `On volatility, ${rank(rk)} in calm and ${rank(rc)} in the crisis. On 95% ES: ${rank(ek)} in calm and ${rank(ec)} in the crisis. ${rank(rk) === rank(rc) && rank(ek) === rank(ec) ? 'The ranking is unchanged.' : 'The ranking changed between regimes.'}` },
    ];
  }, [an, config.risk.threshold, conf]);

  const wealth = useMemo(() => {
    const out = [];
    for (const id of ['A', 'B'] as const) {
      const m = getM(an, id, ddW);
      if (m) out.push({ x: dateAxis(m), y: Array.from(m.drawdown, (v) => v), type: 'scatter', mode: 'lines', name: `Portfolio ${id}`, line: { color: id === 'A' ? COLORS.A : COLORS.B, width: 2 }, fill: 'tozeroy', fillcolor: id === 'A' ? 'rgba(217,72,31,0.10)' : 'rgba(31,111,178,0.10)', hovertemplate: '%{x}<br>%{y:.1%}<extra>' + id + '</extra>' });
    }
    return out;
  }, [an, ddW]);

  const volBars = useMemo(() => (['A', 'B'] as const).map((id) => ({
    type: 'bar', name: `Portfolio ${id}`, marker: { color: id === 'A' ? COLORS.A : COLORS.B },
    x: WINDOWS.map(windowLabel), y: WINDOWS.map((w) => getM(an, id, w)?.sigmaAnnual ?? null),
    hovertemplate: '%{x}<br>%{y:.1%}<extra>' + id + '</extra>',
  })).concat([{
    type: 'bar', name: 'Market proxy (20-stock equal weight)', marker: { color: '#c9c3b3' }, x: WINDOWS.map(windowLabel),
    y: WINDOWS.map((w) => an.proxy[w]?.vol ?? null), hovertemplate: '%{x}<br>%{y:.1%}<extra>proxy</extra>',
  } as never]), [an]);

  const heat = (id: 'A' | 'B') => {
    const m = getM(an, id, heatW);
    if (!m) return null;
    return (
      <Plot key={id} height={330} ariaLabel={`Correlation heatmap portfolio ${id}`}
        data={[{ type: 'heatmap', z: m.corr, x: m.tickers, y: m.tickers, zmin: -1, zmax: 1, colorscale: [[0, '#2b6cb0'], [0.5, '#ffffff'], [1, '#c0392b']],
          hovertemplate: '%{y} × %{x}<br>ρ = %{z:.2f}<extra></extra>', colorbar: { thickness: 10, len: 0.8 } }]}
        layout={{ title: { text: `Portfolio ${id} · avg ρ ${m.avgCorr.toFixed(2)}`, font: { size: 13 }, x: 0.02 }, margin: { l: 90, r: 10, t: 34, b: 80 }, yaxis: { autorange: 'reversed' }, xaxis: { tickangle: -45 } }} />
    );
  };

  const presetNote = (id: 'crisis' | 'calm') => {
    const w = config.windows[id];
    const p = WINDOW_PRESETS.find((x) => x.target === id && x.window.start === w.start && x.window.end === w.end);
    return p ? `${p.label}: ${p.note}` : 'Custom window: be ready to justify the dates (event, volatility evidence, enough observations).';
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Time-travel test #1: crisis vs calm</h1>
          <p>Same methodology, same weights, two market regimes. Did the “high-risk” portfolio behave like high risk, and did “low-risk” hold up?</p>
        </div>
      </div>
      <Issues issues={an.issues.filter((i) => i.level === 'error' || /observations|dropped/.test(i.message))} />

      <div className="grid g2">
        <Card title="Choose and justify the periods" aside="edit dates or pick presets">
          <WindowEditor ids={['crisis', 'calm', 'reference']} />
        </Card>
        <Card title="Why these windows (evidence)" aside="equal-weight proxy of all 20 stocks, not an index">
          <table className="t">
            <thead><tr><th>Period</th><th className="n">Days</th><th className="n">Proxy vol</th><th className="n">Proxy max DD</th></tr></thead>
            <tbody>
              {WINDOWS.map((w) => (
                <tr key={w}><td>{windowLabel(w)}</td><td className="n">{an.proxy[w]?.n ?? '–'}</td><td className="n">{fmtPct(an.proxy[w]?.vol, 1)}</td><td className="n">{fmtPct(an.proxy[w]?.mdd, 1)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="stack" style={{ marginTop: 10, gap: 6 }}>
            <p className="small"><Chip tone="bad">Crisis</Chip> {presetNote('crisis')}</p>
            <p className="small"><Chip tone="good">Calm</Chip> {presetNote('calm')}</p>
            <p className="small muted">The calm window was chosen from market events before looking at either portfolio's results; the proxy volatility above checks that it really is quieter than the full-history level. Limitation: a short window gives noisy tail estimates.</p>
          </div>
        </Card>
      </div>

      {answers ? (
        <Card title="The six questions, answered from the calculations">
          <div className="grid g2">
            {answers.map((a) => (
              <div key={a.q} className="stack" style={{ gap: 4 }}>
                <div className="row"><strong>{a.q}</strong>{a.v && <VerdictChip v={a.v} />}</div>
                <p className="small" style={{ margin: 0 }}>{a.a}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : <Empty>Answers appear when both portfolios are valid in both periods.</Empty>}

      <Card title={`Side by side · ${conf}% confidence, 1-day`}>
        <div className="scroll-x">
          <table className="t">
            <thead>
              <tr><th rowSpan={2}>Measure</th><th colSpan={2} style={{ textAlign: 'center', color: 'var(--bad)' }}>Crisis · {fmtDate(config.windows.crisis.start)} → {fmtDate(config.windows.crisis.end)}</th><th colSpan={2} style={{ textAlign: 'center', color: 'var(--good)' }}>Calm · {fmtDate(config.windows.calm.start)} → {fmtDate(config.windows.calm.end)}</th></tr>
              <tr><th><span className="dot a" /> A</th><th><span className="dot b" /> B</th><th><span className="dot a" /> A</th><th><span className="dot b" /> B</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  {[cA, cB, kA, kB].map((m, i) => <td key={i} className="mono">{m ? r.f(m) : '–'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid g2">
        <Card title="Drawdown from previous peak" aside={<Tabs<WindowId> label="Drawdown period" value={ddW} onChange={setDdW} options={(['crisis', 'calm', 'reference', 'full'] as WindowId[]).map((id) => ({ id, label: windowLabel(id) }))} />}>
          <Plot data={wealth} height={300} ariaLabel="Drawdown chart" layout={{ yaxis: { tickformat: '.0%', title: { text: 'Drawdown' } }, hovermode: 'x unified' }} />
        </Card>
        <Card title="Volatility by period" aside="annualised">
          <Plot data={volBars} height={300} ariaLabel="Volatility by period" layout={{ barmode: 'group', yaxis: { tickformat: '.0%', title: { text: 'Annualised volatility' } } }} />
        </Card>
      </div>

      <Card title="Do correlations rise in a crisis?" aside={<Tabs<WindowId> label="Heatmap period" value={heatW} onChange={setHeatW} options={WINDOWS.map((id) => ({ id, label: windowLabel(id) }))} />}>
        <div className="grid g2">{heat('A')}{heat('B')}</div>
      </Card>
    </div>
  );
}
