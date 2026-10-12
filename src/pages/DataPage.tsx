import { useMemo, useRef, useState } from 'react';
import { Plot } from '../components/Plot';
import { Card, Chip, Field, Kpi } from '../components/ui';
import { auditDataset, DataError, parseBenchmarkCsv, parsePricesCsv } from '../engine/data';
import { WINDOW_LABELS } from '../engine/model';
import { downloadText, fmtDate, fmtPct, toCsv } from '../format';
import { WINDOWS } from '../lib';
import { useStore } from '../state/store';

export function DataPage() {
  const { dataset, setDataset, usingBundled, benchmark, setBenchmark, analysis: an, config } = useStore();
  const audit = useMemo(() => auditDataset(dataset), [dataset]);
  const [picked, setPicked] = useState<string[]>(['SUZLON', 'RALLIS', 'TCS', 'HDFCBANK']);
  const [msg, setMsg] = useState<{ tone: 'err' | 'good'; text: string } | null>(null);
  const pRef = useRef<HTMLInputElement>(null), bRef = useRef<HTMLInputElement>(null);

  const traces = useMemo(() => picked.filter((t) => dataset.tickers.includes(t)).map((t) => {
    const p = dataset.prices[dataset.tickers.indexOf(t)];
    const base = p.find((x) => x > 0) ?? 1;
    const step = Math.max(1, Math.floor(dataset.dates.length / 1500));
    const xs: string[] = [], ys: number[] = [];
    for (let i = 0; i < dataset.dates.length; i += step) { xs.push(dataset.dates[i]); ys.push((p[i] / base) * 100); }
    return { type: 'scatter', mode: 'lines', name: t, x: xs, y: ys, line: { width: 1.6 }, hovertemplate: '%{x}<br>%{y:.0f}<extra>' + t + '</extra>' };
  }), [dataset, picked]);

  const bigMoves = audit.perTicker.flatMap((t) => t.largeMoves.map((m) => ({ t: t.ticker, ...m }))).sort((a, b) => Math.abs(b.ret) - Math.abs(a.ret)).slice(0, 14);

  const exportMetrics = () => {
    const rows: (string | number | null)[][] = [['Portfolio', 'Period', 'Start', 'End', 'Observations', 'Annual mean', 'Annual vol', 'Hist VaR (conf)', 'Param VaR', 'MC VaR', 'Hist ES', 'MC ES', 'Max drawdown', 'Avg corr', 'Beta']];
    for (const id of ['A', 'B'] as const) for (const w of WINDOWS) {
      const m = an.metrics[id][w].metrics; if (!m) continue;
      rows.push([id, WINDOW_LABELS[w], config.windows[w].start, config.windows[w].end, m.n, m.muAnnual, m.sigmaAnnual, m.hist.var, m.param.var, m.mc?.var ?? null, m.hist.es, m.mc?.es ?? null, m.maxDrawdown, m.avgCorr, m.beta]);
    }
    downloadText('fra-risk-metrics.csv', toCsv(rows), 'text/csv');
  };
  const exportWeights = () => {
    const rows: (string | number | null)[][] = [['Portfolio', 'Stock', 'Current weight', 'Reference optimal', 'Crisis optimal', 'Calm optimal', 'Target return']];
    for (const id of ['A', 'B'] as const) {
      const f = an.frontier[id]; if (!f) continue;
      f.tickers.forEach((t, i) => rows.push([id, t, f.currentWeights[i], ...f.periods.map((p) => (p.status === 'optimal' ? p.weights[i] : null)), f.target]));
    }
    downloadText('fra-optimal-weights.csv', toCsv(rows), 'text/csv');
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div><h1>Data &amp; audit</h1><p>Prices come from the project workbook and are checked here before use. Nothing is filled, interpolated or silently trimmed.</p></div>
      </div>

      <Card title="Dataset" aside={usingBundled ? 'bundled with the site' : 'imported by you (this session only)'}>
        <div className="grid g4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Kpi small label="Source" value={usingBundled ? 'Workbook' : 'Import'} sub={dataset.source} />
          <Kpi small label="Coverage" value={`${fmtDate(audit.firstDate)} → ${fmtDate(audit.lastDate)}`} sub={`${audit.rows.toLocaleString('en-IN')} trading days`} />
          <Kpi small label="Stocks" value={String(audit.tickers)} sub="daily closing prices" />
          <Kpi small label="Missing / ≤0 / duplicate" value={`${audit.totalMissing} / ${audit.totalNonPositive} / ${audit.duplicateDates}`} sub="must all be zero" />
          <Kpi small label="Moves ≥ 15% in a day" value={String(audit.totalLargeMoves)} sub="listed below, kept as-is" />
          <Kpi small label="Benchmark" value={benchmark ? benchmark.name : 'none'} sub={benchmark ? `${benchmark.dates.length} rows · beta enabled` : 'beta shows “n/a”'} />
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => pRef.current?.click()}>Import price CSV…</button>
          <button className="btn" onClick={() => bRef.current?.click()}>Import benchmark CSV (for beta)…</button>
          {!usingBundled && <button className="btn" onClick={() => { setDataset(null); setMsg({ tone: 'good', text: 'Restored the bundled workbook data.' }); }}>Restore workbook data</button>}
          {benchmark && <button className="btn" onClick={() => setBenchmark(null)}>Remove benchmark</button>}
          <input ref={pRef} hidden type="file" accept=".csv,text/csv" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            try { const d = parsePricesCsv(await f.text(), `Imported: ${f.name}`); setDataset(d); setMsg({ tone: 'good', text: `Imported ${d.tickers.length} stocks × ${d.dates.length} days. Portfolios that reference missing tickers will show errors.` }); }
            catch (err) { setMsg({ tone: 'err', text: err instanceof DataError ? err.message : 'Could not read that file.' }); }
            e.target.value = '';
          }} />
          <input ref={bRef} hidden type="file" accept=".csv,text/csv" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            try { const b = parseBenchmarkCsv(await f.text(), `Benchmark: ${f.name}`); setBenchmark(b); setMsg({ tone: 'good', text: `Benchmark loaded (${b.dates.length} rows). Beta is now calculated on synchronised dates.` }); }
            catch (err) { setMsg({ tone: 'err', text: err instanceof DataError ? err.message : 'Could not read that file.' }); }
            e.target.value = '';
          }} />
        </div>
        {msg && <div className={`banner ${msg.tone === 'err' ? 'err' : 'good'}`} style={{ marginTop: 10 }}>{msg.text}</div>}
        <p className="small muted" style={{ marginTop: 8 }}>CSV format: header <code>Date,TICKER1,TICKER2,…</code> with ISO dates (yyyy-mm-dd) in ascending order and positive prices. Benchmark: <code>Date,Close</code>. Imports are validated first; a bad file is rejected with a reason and the current data stays untouched.</p>
      </Card>

      <div className="grid g2">
        <Card title="What the audit found">
          <ul className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li><strong>Adjustment status is unverified.</strong> The workbook does not say whether prices are adjusted for splits, bonuses and dividends. Their long fractional decimals resemble an adjusted series, but that is an inference, not a verification.</li>
            <li><strong>Deepak Nitrite</strong> history was patched from BSE per the workbook’s “challenges” note; the series may mix exchanges for part of the sample.</li>
            <li><strong>Most large moves are plausible</strong> (≈ ±20% NSE price bands, or market-wide days such as 18 May 2009 and 23 Mar 2020). <strong>Unresolved:</strong> Suzlon has one-day moves beyond ±30% (e.g. 24 Oct 2008, −40%) that may be unadjusted corporate actions. They are kept as supplied; verify them against NSE/BSE records.</li>
            <li><strong>Thinly traded names</strong> show flat days: see the zero-return share column (Suzlon and Deepak Nitrite highest).</li>
            <li><strong>Survivorship / hindsight bias:</strong> all 20 stocks exist today and were chosen with knowledge of the sample, so historical risk is probably understated versus a list picked in 2008.</li>
            <li><strong>No market index</strong> in the workbook, so beta is “n/a” until a benchmark CSV is added. The “market proxy” used on other pages is an equal-weight average of these 20 stocks and is not an index.</li>
          </ul>
        </Card>
        <Card title={`Largest one-day moves (|r| ≥ 15%)`}>
          <div className="scroll-x">
            <table className="t">
              <thead><tr><th>Stock</th><th>Date</th><th className="n">Return</th></tr></thead>
              <tbody>{bigMoves.map((m, i) => <tr key={i}><td>{m.t}</td><td>{fmtDate(m.date)}</td><td className={`n ${m.ret < 0 ? 'diff-down' : 'diff-up'}`}>{fmtPct(m.ret, 1)}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Per-stock quality checks">
        <div className="scroll-x">
          <table className="t">
            <thead><tr><th>Stock</th><th>First</th><th>Last</th><th className="n">Obs</th><th className="n">Missing</th><th className="n">Zero-return days</th><th className="n">Longest flat run</th><th className="n">Biggest move</th><th className="n">Ann. vol</th><th /></tr></thead>
            <tbody>
              {audit.perTicker.map((t) => (
                <tr key={t.ticker}>
                  <td><strong>{t.ticker}</strong></td><td>{t.firstDate}</td><td>{t.lastDate}</td><td className="n">{t.observations}</td>
                  <td className="n">{t.missing}</td><td className="n">{fmtPct(t.zeroReturnShare, 1)}</td><td className="n">{t.longestFlatRun}</td>
                  <td className="n">{fmtPct(t.maxAbsReturn, 1)} <span className="muted small">{t.maxAbsReturnDate}</span></td><td className="n">{fmtPct(t.annualVol, 1)}</td>
                  <td>{t.zeroReturnShare > 0.03 ? <Chip tone="warn">thin</Chip> : <Chip tone="good">ok</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Price history (rebased to 100)" aside="pick stocks">
        <Field label="Stocks to plot">
          <div className="row" style={{ gap: 6 }}>
            {dataset.tickers.map((t) => (
              <button key={t} className="btn sm" aria-pressed={picked.includes(t)} style={picked.includes(t) ? { background: 'var(--ink)', color: '#fff' } : undefined}
                onClick={() => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}>{t}</button>
            ))}
          </div>
        </Field>
        <Plot data={traces} height={340} ariaLabel="Price history" layout={{ yaxis: { type: 'log', title: { text: 'Price index (log scale, start = 100)' } }, hovermode: 'x unified' }} />
      </Card>

      <Card title="Export">
        <div className="row"><button className="btn" onClick={exportMetrics}>Risk metrics (CSV)</button><button className="btn" onClick={exportWeights}>Optimal weights (CSV)</button></div>
      </Card>
    </div>
  );
}
