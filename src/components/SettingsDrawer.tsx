import { useRef, useState } from 'react';
import { defaultConfig } from '../engine/model';
import { downloadText } from '../format';
import { useStore } from '../state/store';
import { Card, Field, NumField } from './ui';
import { WindowEditor } from './WindowEditor';

export function SettingsDrawer() {
  const { config, setConfig, resetAll, loadConfig, settingsOpen, setSettingsOpen } = useStore();
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!settingsOpen) return null;
  return (
    <>
      <div className="drawer-back" onClick={() => setSettingsOpen(false)} />
      <aside className="drawer" role="dialog" aria-label="Analysis settings">
        <div className="row spread">
          <h2>Analysis settings</h2>
          <button className="btn sm" onClick={() => setSettingsOpen(false)} aria-label="Close settings">Close</button>
        </div>

        <Card title="Tail-risk assumptions">
          <div className="stack">
            <Field label="VaR / ES confidence level" hint="95% means the loss is exceeded on 5% of days.">
              <NumField label="Confidence level percent" value={config.confidence} scale={100} decimals={2} unit="%" min={80} max={99.9} step={0.5}
                onChange={(v) => setConfig((c) => ({ ...c, confidence: Math.min(0.999, Math.max(0.8, v)) }))} />
            </Field>
            <Field label="Monte Carlo simulations">
              <select className="input" aria-label="Monte Carlo simulations" value={config.nSims} onChange={(e) => setConfig((c) => ({ ...c, nSims: Number(e.target.value) }))}>
                {[5000, 10000, 50000, 100000, 250000].map((n) => <option key={n} value={n}>{n.toLocaleString('en-IN')}</option>)}
              </select>
            </Field>
            <Field label="Monte Carlo shocks" hint="Student-t keeps the same covariance but has fatter tails.">
              <select className="input" aria-label="Monte Carlo distribution" value={config.mcDist} onChange={(e) => setConfig((c) => ({ ...c, mcDist: e.target.value as 'normal' | 't' }))}>
                <option value="normal">Normal</option><option value="t">Student-t</option>
              </select>
            </Field>
            {config.mcDist === 't' && (
              <Field label="t degrees of freedom (3–30)">
                <NumField label="Student t degrees of freedom" value={config.mcDf} decimals={0} step={1} min={3} max={30} onChange={(v) => setConfig((c) => ({ ...c, mcDf: Math.max(3, Math.min(30, Math.round(v))) }))} />
              </Field>
            )}
            <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={config.mcZeroMean} onChange={(e) => setConfig((c) => ({ ...c, mcZeroMean: e.target.checked }))} /> Simulate with zero mean return</label>
            <Field label="Random seed" hint="Same seed + same inputs = identical simulation.">
              <NumField label="Random seed" value={config.seed} decimals={0} step={1} onChange={(v) => setConfig((c) => ({ ...c, seed: Math.max(0, Math.round(v)) }))} />
            </Field>
          </div>
        </Card>

        <Card title="Historical periods"><WindowEditor /></Card>

        <Card title="Saved configuration">
          <div className="stack">
            <div className="row">
              <button className="btn" onClick={() => downloadText('fra-config.json', JSON.stringify(config, null, 2), 'application/json')}>Download config</button>
              <button className="btn" onClick={() => fileRef.current?.click()}>Load config</button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  try { setMsg(loadConfig(JSON.parse(await f.text()))); } catch { setMsg('Could not read that file as JSON.'); }
                  e.target.value = '';
                }} />
            </div>
            <button className="btn danger" onClick={() => { if (confirm('Restore the original 20 stocks, ₹15 lakh each, default periods and assumptions?')) { resetAll(); setMsg(null); } }}>
              Reset to project defaults
            </button>
            {msg && <div className="banner err">{msg}</div>}
            <p className="small muted">Your settings are saved in this browser automatically. Resetting never touches the source price data.</p>
          </div>
        </Card>
        <p className="small muted">Conventions: daily simple returns · constant-weight (daily-rebalanced) portfolios · 252 trading days per year · 1-day VaR. Default start values: {defaultConfig().confidence * 100}% confidence, {defaultConfig().nSims.toLocaleString('en-IN')} simulations.</p>
      </aside>
    </>
  );
}
