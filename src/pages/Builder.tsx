import { useMemo } from 'react';
import { Card, Chip, Field, Issues, NumField, PortTag } from '../components/ui';
import { equalHoldings, STOCKS, stockInfo } from '../engine/model';
import type { Holding, PortfolioId } from '../engine/types';
import { fmtInr, fmtLakh, fmtPct } from '../format';
import { useStore } from '../state/store';
import { m as getM } from '../lib';

export function Builder() {
  const { config, setConfig, analysis: an, dataset } = useStore();
  const assigned = new Set([...config.holdings.A, ...config.holdings.B].map((h) => h.ticker));
  const unassigned = dataset.tickers.filter((t) => !assigned.has(t));

  const setHoldings = (id: PortfolioId, f: (h: Holding[]) => Holding[]) =>
    setConfig((c) => ({ ...c, holdings: { ...c.holdings, [id]: f(c.holdings[id]) } }));

  const move = (t: string, from: PortfolioId, to: PortfolioId | 'none') => {
    setConfig((c) => {
      const holdings = { ...c.holdings, [from]: c.holdings[from].filter((h) => h.ticker !== t) };
      if (to !== 'none') holdings[to] = [...holdings[to], { ticker: t, weight: 0 }];
      return { ...c, holdings };
    });
  };

  const issues = useMemo(() => an.issues.filter((i) => /weights|negative|Stock\(s\)|investment|no stocks|at least 10|no price/i.test(i.message)), [an.issues]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Portfolio Builder</h1>
          <p>Set the investment, the weights and the membership of each portfolio. Every other page recalculates from these inputs. Weights must total 100%; the app will not silently adjust them.</p>
        </div>
      </div>
      <Issues issues={issues} />
      <div className="grid g2">
        {(['A', 'B'] as const).map((id) => {
          const hs = config.holdings[id];
          const total = hs.reduce((s, h) => s + h.weight, 0);
          const bad = Math.abs(total - 1) > 5e-5;
          const other: PortfolioId = id === 'A' ? 'B' : 'A';
          const mm = getM(an, id, 'full');
          return (
            <Card key={id} tone={id === 'A' ? 'a' : 'b'} title={<span>Portfolio {id}</span>} aside={<PortTag id={id} />}>
              <div className="grid g2" style={{ marginBottom: 12 }}>
                <Field label="Initial investment" hint={fmtLakh(config.investment[id])}>
                  <NumField label={`Portfolio ${id} investment in rupees`} prefix="₹" value={config.investment[id]} decimals={0} min={0} step={50000}
                    invalid={!(config.investment[id] > 0)} onChange={(v) => setConfig((c) => ({ ...c, investment: { ...c.investment, [id]: v } }))} />
                </Field>
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <button className="btn sm" onClick={() => setHoldings(id, (h) => equalHoldings(h.map((x) => x.ticker)))}>Equal weight</button>
                  <button className="btn sm" disabled={total <= 0}
                    onClick={() => setHoldings(id, (h) => h.map((x) => ({ ...x, weight: x.weight / total })))}>Normalise to 100%</button>
                </div>
              </div>
              <div className="scroll-x">
                <table className="t">
                  <thead><tr><th>Stock</th><th>Sector · cap</th><th className="n">Weight</th><th className="n">Amount</th><th /></tr></thead>
                  <tbody>
                    {hs.map((h) => {
                      const info = stockInfo(h.ticker);
                      return (
                        <tr key={h.ticker}>
                          <td><strong>{h.ticker}</strong><div className="small muted">{info?.name ?? 'Imported stock'}</div></td>
                          <td className="small">{info ? `${info.sector} · ${info.cap}` : '–'}</td>
                          <td style={{ width: 118 }}>
                            <NumField label={`${h.ticker} weight percent`} unit="%" scale={100} decimals={2} step={0.5} value={h.weight} invalid={h.weight < 0}
                              onChange={(v) => setHoldings(id, (list) => list.map((x) => (x.ticker === h.ticker ? { ...x, weight: v } : x)))} />
                          </td>
                          <td className="n">{fmtInr(h.weight * config.investment[id])}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button className="btn sm ghost" title={`Move to Portfolio ${other}`} aria-label={`Move ${h.ticker} to portfolio ${other}`} onClick={() => move(h.ticker, id, other)}>→{other}</button>
                            <button className="btn sm ghost danger" title="Remove" aria-label={`Remove ${h.ticker}`} onClick={() => move(h.ticker, id, 'none')}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="total">
                      <td colSpan={2}>Total ({hs.length} stocks)</td>
                      <td className="n" style={{ color: bad ? 'var(--bad)' : 'var(--good)' }}>{fmtPct(total, 2)}</td>
                      <td className="n">{fmtInr(total * config.investment[id])}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
              {bad && <div className="banner err" style={{ marginTop: 10 }}>Weights sum to {fmtPct(total, 2)}. Adjust them or press “Normalise to 100%”.</div>}
              {mm && <p className="small muted" style={{ marginTop: 10 }}>Full-history volatility {fmtPct(mm.sigmaAnnual, 1)} · diversification ratio {mm.diversificationRatio.toFixed(2)}</p>}
              <div className="row" style={{ marginTop: 6 }}>
                <select className="input" style={{ width: 'auto' }} aria-label={`Add stock to portfolio ${id}`} value=""
                  onChange={(e) => { if (e.target.value) setHoldings(id, (l) => [...l, { ticker: e.target.value, weight: 0 }]); }}>
                  <option value="">+ Add an unassigned stock…</option>
                  {unassigned.map((t) => <option key={t} value={t}>{t}{stockInfo(t) ? ` · ${stockInfo(t)!.name}` : ''}</option>)}
                </select>
              </div>
            </Card>
          );
        })}
      </div>

      <Card title="Why these stocks? Qualitative starting views (to be tested, not assumed)" aside="from your workbook">
        <div className="scroll-x">
          <table className="t">
            <thead><tr><th>Stock</th><th>Portfolio</th><th>Sector</th><th>Cap</th><th>Rationale from the project workbook</th></tr></thead>
            <tbody>
              {STOCKS.map((s) => (
                <tr key={s.ticker}>
                  <td><strong>{s.ticker}</strong></td>
                  <td><Chip tone={s.portfolio === 'A' ? 'a' : 'b'}>{s.portfolio}</Chip></td>
                  <td className="small">{s.sector}</td><td className="small">{s.cap}</td><td className="small">{s.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 10 }}>Market cap, sector and reputation are only hypotheses. The Risk Definition page tests them against measured volatility, tail loss and drawdown.</p>
      </Card>
    </div>
  );
}
