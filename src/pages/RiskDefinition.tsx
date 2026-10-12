import { useMemo, useState } from 'react';
import { Plot, COLORS } from '../components/Plot';
import { Card, Chip, Empty, Field, Formula, How, Tabs, VerdictChip } from '../components/ui';
import { METRICS, type Direction, type MetricId, type PrimaryId } from '../engine/classify';
import type { WindowId } from '../engine/types';
import { fmtDate, fmtNum, fmtPct } from '../format';
import { windowLabel, WINDOWS } from '../lib';
import { useStore } from '../state/store';

const DIM = [
  { t: 'Total variability', q: 'How much do returns fluctuate?', m: 'Annualised volatility σ', c: 'Counts gains and losses alike.' },
  { t: 'Downside / tail risk', q: 'How bad are the worst days?', m: 'VaR and Expected Shortfall', c: 'Looks only at the lower tail.' },
  { t: 'Drawdown risk', q: 'How far can it fall from a peak?', m: 'Maximum drawdown', c: 'Depends on the path, not just daily size.' },
  { t: 'Market sensitivity', q: 'How much does it move with the market?', m: 'Beta (needs a benchmark file)', c: 'Only systematic risk.' },
  { t: 'Diversification', q: 'Do the stocks fall together?', m: 'Correlation, covariance, wᵀΣw', c: 'Explains why σ_p < average σ_i.' },
];

const dirChip = (d: Direction) =>
  d === 'A-riskier' ? <Chip tone="a">A riskier</Chip> : d === 'B-riskier' ? <Chip tone="b">B riskier</Chip> : d === 'similar' ? <Chip>similar</Chip> : <Chip>n/a</Chip>;

export function RiskDefinition() {
  const { config, setConfig, analysis: an, benchmark } = useStore();
  const [showComp, setShowComp] = useState(config.risk.primary === 'composite');
  const w = config.focusWindow;
  const cls = an.classification[w];
  const r = config.risk;
  const setRisk = (f: (x: typeof r) => typeof r) => setConfig((c) => ({ ...c, risk: f(c.risk) }));
  const fmtV = (kind: string, v: number | null) => (v === null ? 'n/a' : kind === 'pct' ? fmtPct(v, 2) : kind === 'score' ? v.toFixed(3) : fmtNum(v, 2));

  const byPeriod = useMemo(() => {
    const ids: MetricId[] = ['vol', 'var95', 'es95', 'es99', 'mdd'];
    return ids.map((id) => ({
      type: 'bar', name: METRICS.find((x) => x.id === id)!.short,
      x: WINDOWS.map(windowLabel),
      y: WINDOWS.map((wi) => an.classification[wi]?.rows.find((x) => x.id === id)?.ratio ?? null),
      hovertemplate: '%{x}<br>A÷B = %{y:.2f}×<extra>' + METRICS.find((x) => x.id === id)!.short + '</extra>',
    }));
  }, [an]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Defining risk, then testing the labels</h1>
          <p>“Risky” is not a fact about a stock; it is a choice of measurement. Pick the primary measure, the supporting evidence and how large a gap counts as material. The verdict below is computed from the data, never hard-coded.</p>
        </div>
      </div>

      <div className="grid g4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {DIM.map((d) => (
          <Card key={d.t}>
            <h3 style={{ fontSize: '0.95rem' }}>{d.t}</h3>
            <p className="small" style={{ margin: '4px 0' }}>{d.q}</p>
            <p className="small"><strong>{d.m}</strong></p>
            <p className="small muted">{d.c}</p>
          </Card>
        ))}
      </div>

      <div className="grid g-main">
        <div className="stack">
          <Card title="Your risk definition">
            <div className="stack">
              <Field label="Primary measure" hint={r.primary === 'composite' ? 'Composite is optional and uses your weights.' : METRICS.find((m) => m.id === r.primary)?.what}>
                <select className="input" aria-label="Primary risk measure" value={r.primary}
                  onChange={(e) => { const v = e.target.value as PrimaryId; if (v === 'composite') setShowComp(true); setRisk((x) => ({ ...x, primary: v })); }}>
                  {METRICS.map((m) => <option key={m.id} value={m.id} disabled={m.id === 'beta' && !benchmark}>{m.label}{m.id === 'beta' && !benchmark ? ' (needs benchmark)' : ''}</option>)}
                  <option value="composite">Composite score (optional)</option>
                </select>
              </Field>
              <div className="field">
                <label>Supporting measures (independent checks)</label>
                {METRICS.filter((m) => m.id !== r.primary).map((m) => (
                  <label key={m.id} className="row small" style={{ gap: 8, opacity: m.id === 'beta' && !benchmark ? 0.5 : 1 }}>
                    <input type="checkbox" disabled={m.id === 'beta' && !benchmark} checked={r.supporting.includes(m.id)}
                      onChange={(e) => setRisk((x) => ({ ...x, supporting: e.target.checked ? [...x.supporting, m.id] : x.supporting.filter((s) => s !== m.id) }))} />
                    {m.label}
                  </label>
                ))}
              </div>
              <Field label={`Materiality: A is “riskier” if ratio ≥ ${r.threshold.toFixed(2)}×`} hint={`B counts as riskier when ratio ≤ ${(1 / r.threshold).toFixed(2)}×; in between is “similar”.`}>
                <input type="range" min={1.02} max={1.5} step={0.01} value={r.threshold} aria-label="Materiality threshold"
                  onChange={(e) => setRisk((x) => ({ ...x, threshold: Number(e.target.value) }))} />
              </Field>
              <Field label="Observation period">
                <Tabs<WindowId> label="Observation period" value={w} onChange={(v) => setConfig((c) => ({ ...c, focusWindow: v }))}
                  options={WINDOWS.map((id) => ({ id, label: windowLabel(id) }))} />
              </Field>
              <label className="row small" style={{ gap: 8 }}>
                <input type="checkbox" checked={showComp} onChange={(e) => { setShowComp(e.target.checked); if (!e.target.checked && r.primary === 'composite') setRisk((x) => ({ ...x, primary: 'vol' })); }} />
                Show optional composite score
              </label>
            </div>
          </Card>
          {showComp && (
            <Card title="Composite score weights">
              <div className="stack">
                {METRICS.map((m) => (
                  <div key={m.id} className="field">
                    <label>{m.short}: weight {r.compositeWeights[m.id]}</label>
                    <input type="range" min={0} max={5} step={1} disabled={m.id === 'beta' && !benchmark} value={r.compositeWeights[m.id]} aria-label={`${m.short} weight`}
                      onChange={(e) => setRisk((x) => ({ ...x, compositeWeights: { ...x.compositeWeights, [m.id]: Number(e.target.value) } }))} />
                  </div>
                ))}
                <p className="note">Each metric is converted to A's share of the pair, m<sub>A</sub>/(m<sub>A</sub>+m<sub>B</sub>) (0.5 = equal), then weight-averaged. Weights are <em>your</em> judgement, not a market standard, so treat the score as a sensitivity tool, not proof.</p>
              </div>
            </Card>
          )}
        </div>

        <div className="stack">
          <Card title={`Evidence · ${windowLabel(w)}`} aside={`${fmtDate(config.windows[w].start)} → ${fmtDate(config.windows[w].end)}`}>
            {cls ? (
              <>
                <div className="row" style={{ marginBottom: 10 }}>
                  <span className="verdict-big">{cls.headline}</span><VerdictChip v={cls.verdict} />
                </div>
                <p>{cls.detail}</p>
                <div className="scroll-x">
                  <table className="t">
                    <thead><tr><th>Measure</th><th className="n">Portfolio A</th><th className="n">Portfolio B</th><th className="n">A ÷ B</th><th>Reading</th><th>Role</th></tr></thead>
                    <tbody>
                      {[...cls.rows, ...(cls.composite && showComp ? [{ id: 'composite' as const, label: 'Composite score (A share)', kind: 'score' as const, a: cls.composite.a, b: cls.composite.b, ratio: cls.composite.ratio, direction: cls.rows[0] ? (cls.composite.ratio >= r.threshold ? 'A-riskier' : cls.composite.ratio <= 1 / r.threshold ? 'B-riskier' : 'similar') as Direction : 'n/a' as Direction }] : [])].map((row) => {
                        const role = row.id === r.primary ? 'Primary' : r.supporting.includes(row.id as MetricId) ? 'Supporting' : '–';
                        return (
                          <tr key={row.id} style={row.id === r.primary ? { background: '#faf9f5' } : undefined}>
                            <td>{row.label}</td>
                            <td className="n">{fmtV(row.kind, row.a)}</td><td className="n">{fmtV(row.kind, row.b)}</td>
                            <td className="n"><strong>{row.ratio === null ? '–' : row.ratio.toFixed(2) + '×'}</strong></td>
                            <td>{dirChip(row.direction)}</td><td className="small muted">{role}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {cls.rows.some((x) => x.direction === 'A-riskier') && cls.rows.some((x) => x.direction === 'B-riskier') && (
                  <p className="note" style={{ marginTop: 10 }}>The measures disagree. That is a finding, not an error: volatility counts upside and downside, tail measures look only at the worst days, and drawdown depends on the path. Decide which dimension your definition of risk should prioritise.</p>
                )}
                <How title="How the verdict is decided">
                  <p>Ratio = (A's value) ÷ (B's value) for the same dates and weighting convention. With materiality threshold <em>t</em> = {r.threshold.toFixed(2)}:</p>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    <li><strong>Supported</strong>: primary ratio ≥ <em>t</em> and at least 75% of supporting measures agree.</li>
                    <li><strong>Partially supported</strong>: primary ratio ≥ <em>t</em> but fewer supporters, or the primary is “similar” while at least half of the supporters rank A riskier.</li>
                    <li><strong>Reversed</strong>: primary ratio ≤ 1/<em>t</em> (B measures riskier) and under half of the supporters disagree.</li>
                    <li><strong>Not supported</strong>: everything else.</li>
                  </ul>
                  <Formula tex={String.raw`\text{Ratio}=\frac{\sigma_A}{\sigma_B},\qquad \sigma_{\text{annual}}=s_{\text{daily}}\sqrt{252}`} />
                </How>
              </>
            ) : <Empty>Fix the portfolio inputs on the Builder page to see the evidence.</Empty>}
          </Card>

          <Card title="Same test, every period" aside="ratio A ÷ B, 1.0× = equal risk">
            <div className="scroll-x">
              <table className="t">
                <thead><tr><th>Period</th><th>Verdict</th><th className="n">Primary A÷B</th><th className="n">Supporters agreeing</th><th className="n">Avg. corr A</th><th className="n">Avg. corr B</th></tr></thead>
                <tbody>
                  {WINDOWS.map((id) => {
                    const c = an.classification[id];
                    return (
                      <tr key={id}>
                        <td><strong>{windowLabel(id)}</strong></td>
                        <td><VerdictChip v={c?.verdict} /></td>
                        <td className="n">{c?.primary?.ratio != null ? c.primary.ratio.toFixed(2) + '×' : '–'}</td>
                        <td className="n">{c ? `${c.supportYes}/${c.supportTotal}` : '–'}</td>
                        <td className="n">{an.metrics.A[id].metrics?.avgCorr.toFixed(2) ?? '–'}</td>
                        <td className="n">{an.metrics.B[id].metrics?.avgCorr.toFixed(2) ?? '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Plot data={byPeriod} height={290} ariaLabel="Ratio of A to B by measure and period"
              layout={{ barmode: 'group', yaxis: { title: { text: 'A ÷ B' }, rangemode: 'tozero' }, shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 1, y1: 1, line: { color: COLORS.gray, dash: 'dot', width: 1.5 } }], colorway: [COLORS.ink, '#b3261e', COLORS.accent, '#9467bd', '#2a9d8f'] }} />
            <p className="small muted">A bar above the dotted line means Portfolio A measured riskier than B on that measure in that period.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
