import { useMemo } from 'react';
import { Plot, COLORS } from '../components/Plot';
import { Card, Empty, Field, Formula, How, Issues, Kpi, NumField, Tabs } from '../components/ui';
import { normPdf, normInv } from '../engine/stats';
import type { PortfolioId, PortfolioMetrics, WindowId } from '../engine/types';
import { fmtDate, fmtInr, fmtPct } from '../format';
import { m as getM, windowLabel, WINDOWS } from '../lib';
import { useStore } from '../state/store';

export function VarLab() {
  const { config, setConfig, analysis: an } = useStore();
  const pid = config.focusPortfolio;
  const w = config.focusWindow;
  const m = getM(an, pid, w);
  const conf = config.confidence;
  const confPct = Math.round(conf * 1000) / 10;
  const alpha = 1 - conf;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>VaR &amp; Expected Shortfall Lab</h1>
          <p>Three ways to estimate the same question: <em>how much could this portfolio lose in one day?</em> Change any input and every number, chart and formula below updates.</p>
        </div>
      </div>
      <Issues issues={an.issues.filter((i) => i.level === 'error' || /observations/.test(i.message))} />

      <Card>
        <div className="grid g4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', alignItems: 'end' }}>
          <Field label="Portfolio">
            <Tabs<PortfolioId> label="Portfolio" value={pid} onChange={(v) => setConfig((c) => ({ ...c, focusPortfolio: v }))} options={[{ id: 'A', label: 'A · High' }, { id: 'B', label: 'B · Low' }]} />
          </Field>
          <Field label="Investment">
            <NumField label="Investment in rupees" prefix="₹" value={config.investment[pid]} decimals={0} step={50000} min={1}
              onChange={(v) => setConfig((c) => ({ ...c, investment: { ...c.investment, [pid]: v } }))} />
          </Field>
          <Field label={`Confidence: ${confPct}%`}>
            <input type="range" min={90} max={99.5} step={0.5} value={confPct} aria-label="Confidence level"
              onChange={(e) => setConfig((c) => ({ ...c, confidence: Number(e.target.value) / 100 }))} />
          </Field>
          <Field label="Simulations">
            <select className="input" aria-label="Number of simulations" value={config.nSims} onChange={(e) => setConfig((c) => ({ ...c, nSims: Number(e.target.value) }))}>
              {[5000, 10000, 50000, 100000, 250000].map((n) => <option key={n} value={n}>{n.toLocaleString('en-IN')}</option>)}
            </select>
          </Field>
          <Field label="Seed"><NumField label="Seed" value={config.seed} decimals={0} step={1} onChange={(v) => setConfig((c) => ({ ...c, seed: Math.max(0, Math.round(v)) }))} /></Field>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="lab">Period</span>
          <Tabs<WindowId> label="Period" value={w} onChange={(v) => setConfig((c) => ({ ...c, focusWindow: v }))} options={WINDOWS.map((id) => ({ id, label: windowLabel(id) }))} />
          <span className="small muted">{fmtDate(config.windows[w].start)} → {fmtDate(config.windows[w].end)}</span>
        </div>
      </Card>

      {!m ? <Empty>{an.metrics[pid][w].error ?? 'No result.'}</Empty> : <Body m={m} confPct={confPct} alpha={alpha} mcSims={config.nSims} seed={config.seed} />}
    </div>
  );
}

function Body({ m, confPct, alpha, mcSims, seed }: { m: PortfolioMetrics; confPct: number; alpha: number; mcSims: number; seed: number }) {
  const V = m.investment;
  const z = normInv(alpha);
  const tail = useMemo(() => {
    const s = Array.from(m.returns).sort((a, b) => a - b);
    return s.filter((x) => x <= m.hist.q + 1e-15).length;
  }, [m]);
  const jb = (m.n / 6) * (m.skew ** 2 + (m.exKurt ** 2) / 4);
  const jbP = Math.exp(-jb / 2);

  const chart = useMemo(() => {
    const r = Array.from(m.returns);
    const lo = Math.min(...r), hi = Math.max(...r);
    const size = (hi - lo) / 50;
    const xs = Array.from({ length: 200 }, (_, i) => lo + ((hi - lo) * i) / 199);
    const pdf = xs.map((x) => m.n * size * (normPdf((x - m.meanDaily) / m.sdDaily) / m.sdDaily));
    const maxY = Math.max(...pdf) * 1.9;
    const line = (x: number, color: string, name: string, dash: string) => ({
      type: 'scatter', mode: 'lines', x: [x, x], y: [0, maxY], name, line: { color, width: 2, dash },
      hovertemplate: `${name}: %{x:.2%}<extra></extra>`,
    });
    const col = m.portfolio === 'A' ? COLORS.A : COLORS.B;
    return [
      { type: 'histogram', x: r, xbins: { start: lo, end: hi, size }, name: 'Daily returns', marker: { color: col, opacity: 0.55 }, hovertemplate: 'return %{x:.2%}<br>%{y} days<extra></extra>' },
      { type: 'scatter', mode: 'lines', x: xs, y: pdf, name: 'Normal fit', line: { color: COLORS.ink, width: 1.5 }, hoverinfo: 'skip' },
      line(m.hist.q, COLORS.ink, `Historical VaR ${confPct}%`, 'solid'),
      line(m.param.q, COLORS.gray, 'Parametric VaR', 'dash'),
      ...(m.mc ? [line(m.mc.q, COLORS.accent, 'Monte Carlo VaR', 'dot')] : []),
      line(-m.hist.es, '#b3261e', 'Historical ES', 'dashdot'),
    ];
  }, [m, confPct]);

  const Row = ({ label, pct, es }: { label: string; pct: number; es: number }) => (
    <div className="grid g2" style={{ gap: 12 }}>
      <Kpi label={`${confPct}% VaR`} value={fmtInr(pct * V)} sub={`${fmtPct(pct)} of ${fmtInr(V)}`} />
      <Kpi label={`${confPct}% ES`} value={fmtInr(es * V)} sub={`${fmtPct(es)} · avg loss in worst ${(alpha * 100).toFixed(1)}%`} />
      <span style={{ display: 'none' }}>{label}</span>
    </div>
  );

  return (
    <>
      <div className="grid g3">
        <Card title="Historical simulation" tone={m.portfolio === 'A' ? 'a' : 'b'}>
          <Row label="hist" pct={m.hist.var} es={m.hist.es} />
          <How>
            <Formula tex={String.raw`q_\alpha=\text{empirical }\alpha\text{-quantile of }r_{p,t},\quad \mathrm{VaR}_\alpha=\max(0,-q_\alpha)`} />
            <Formula tex={String.raw`\mathrm{ES}_\alpha=\max\!\big(0,\,-\operatorname{avg}\{r_{p,t}\le q_\alpha\}\big)`} />
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Inputs: {m.n} daily portfolio returns, α = {(alpha * 100).toFixed(1)}%</li>
              <li>Quantile q<sub>α</sub> = {fmtPct(m.hist.q, 3)} (linear interpolation between order statistics, same as Excel PERCENTILE.INC)</li>
              <li>Tail observations ≤ q<sub>α</sub>: {tail} (ties at q included)</li>
              <li>VaR = {fmtPct(m.hist.var, 3)} × {fmtInr(V)} = {fmtInr(m.hist.var * V)}</li>
            </ul>
            <p className="small"><strong>Assumes</strong> the past sample represents the future. <strong>Limit:</strong> the {confPct}% tail rests on only ~{tail} days, so it is noisy, especially in short windows.</p>
          </How>
        </Card>
        <Card title="Parametric (normal)">
          <Row label="param" pct={m.param.var} es={m.param.es} />
          <How>
            <Formula tex={String.raw`\mathrm{VaR}_\alpha=\max(0,\,-\mu_p-z_\alpha\sigma_p),\quad z_\alpha=\Phi^{-1}(\alpha)`} />
            <Formula tex={String.raw`\mathrm{ES}_\alpha=-\mu_p+\sigma_p\,\frac{\varphi(z_\alpha)}{\alpha}`} />
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>μ<sub>p</sub> = {fmtPct(m.meanDaily, 4)} per day, σ<sub>p</sub> = {fmtPct(m.sdDaily, 4)} per day</li>
              <li>z<sub>α</sub> = Φ⁻¹({alpha.toFixed(3)}) = {z.toFixed(4)}</li>
              <li>VaR = −{fmtPct(m.meanDaily, 4)} − ({z.toFixed(4)} × {fmtPct(m.sdDaily, 4)}) = {fmtPct(m.param.var, 3)}</li>
            </ul>
            <p className="small"><strong>Assumes</strong> normally distributed returns. This sample has skewness {m.skew.toFixed(2)} and excess kurtosis {m.exKurt.toFixed(2)} (Jarque–Bera p ≈ {jbP < 0.001 ? '<0.001' : jbP.toFixed(3)}), {jbP < 0.05 ? 'so normality is rejected and the normal tail is likely too thin.' : 'so normality is not rejected here.'}</p>
          </How>
        </Card>
        <Card title="Monte Carlo (multivariate normal)">
          {m.mc ? <Row label="mc" pct={m.mc.var} es={m.mc.es} /> : <Empty>Simulation unavailable: {m.flags.find((f) => /definite/.test(f)) ?? 'covariance problem'}</Empty>}
          <How>
            <Formula tex={String.raw`\mathbf r^{(s)}=\boldsymbol\mu+L\mathbf z^{(s)},\quad LL^{\top}=\Sigma,\quad r_p^{(s)}=\mathbf w^{\top}\mathbf r^{(s)}`} />
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>{mcSims.toLocaleString('en-IN')} draws, seed {seed} (same seed → same answer)</li>
              <li>μ and Σ estimated from the same {m.n} days for all {m.tickers.length} stocks</li>
              <li>Avg. pairwise correlation preserved: {m.avgCorr.toFixed(2)}</li>
              <li>Quantile and tail average taken from the simulated r<sub>p</sub></li>
            </ul>
            <p className="small"><strong>Preserves</strong> cross-stock dependence through the Cholesky factor L. <strong>Still assumes</strong> normal shocks with constant μ and Σ, so it will not reproduce fat tails either; it differs from the parametric number only by sampling error.</p>
          </How>
        </Card>
      </div>

      <div className="grid g-main" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
        <Card title="Where the loss thresholds sit" aside="daily portfolio returns, left tail is the risk">
          <Plot data={chart} height={340} ariaLabel="Return distribution with VaR markers"
            layout={{ xaxis: { title: { text: 'Daily portfolio return' }, tickformat: '.1%' }, yaxis: { title: { text: 'Days' } }, barmode: 'overlay', hovermode: 'closest', legend: { orientation: 'h', y: 1.18 } }} />
        </Card>
        <Card title="Method comparison">
          <table className="t">
            <thead><tr><th>Method</th><th className="n">95% VaR</th><th className="n">99% VaR</th><th className="n">95% ES</th><th className="n">99% ES</th></tr></thead>
            <tbody>
              <tr><td>Historical</td><td className="n">{fmtPct(m.hist95.var)}</td><td className="n">{fmtPct(m.hist99.var)}</td><td className="n">{fmtPct(m.hist95.es)}</td><td className="n">{fmtPct(m.hist99.es)}</td></tr>
              <tr><td>Parametric</td><td className="n">{fmtPct(m.param95.var)}</td><td className="n">{fmtPct(m.param99.var)}</td><td className="n">{fmtPct(m.param95.es)}</td><td className="n">{fmtPct(m.param99.es)}</td></tr>
            </tbody>
          </table>
          <p className="small muted" style={{ marginTop: 8 }}>Monte Carlo at your selected {confPct}%: VaR {m.mc ? fmtPct(m.mc.var) : '–'}, ES {m.mc ? fmtPct(m.mc.es) : '–'}.</p>
          <div className="stack" style={{ marginTop: 8, gap: 6 }}>
            <Kpi small label="Skewness" value={m.skew.toFixed(2)} sub="negative = longer left tail" />
            <Kpi small label="Excess kurtosis" value={m.exKurt.toFixed(2)} sub="0 for a normal distribution" />
            <Kpi small label="Observations" value={String(m.n)} sub={m.n < 60 ? 'few: treat tails with caution' : 'adequate for 95%'} />
          </div>
          {m.flags.length > 0 && <div className="banner warn" style={{ marginTop: 8 }}>{m.flags.map((f, i) => <span key={i}>• {f}</span>)}</div>}
          <p className="note" style={{ marginTop: 10 }}>Reading VaR: on {(alpha * 100).toFixed(1)}% of days (about 1 in {Math.round(1 / alpha)}) the portfolio is expected to lose <em>at least</em> the VaR. ES then asks: on those days, how much on average?</p>
        </Card>
      </div>
    </>
  );
}
