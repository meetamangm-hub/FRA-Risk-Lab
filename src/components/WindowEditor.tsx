import { WINDOW_LABELS, WINDOW_PRESETS, type Config } from '../engine/model';
import type { WindowId } from '../engine/types';
import { useStore } from '../state/store';
import { Field } from './ui';

export function WindowEditor({ ids = ['crisis', 'calm', 'reference', 'full'] as WindowId[] }: { ids?: WindowId[] }) {
  const { config, setConfig, dataset } = useStore();
  const first = dataset.dates[0], last = dataset.dates[dataset.dates.length - 1];
  const set = (id: WindowId, key: 'start' | 'end', v: string) =>
    v && setConfig((c: Config) => ({ ...c, windows: { ...c.windows, [id]: { ...c.windows[id], [key]: v } } }));
  return (
    <div className="stack">
      {ids.map((id) => {
        const w = config.windows[id];
        const presets = WINDOW_PRESETS.filter((p) => p.target === id);
        return (
          <div key={id} className="stack" style={{ gap: 6 }}>
            <div className="row spread">
              <span className="lab" style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>{WINDOW_LABELS[id]} period</span>
              {presets.length > 0 && (
                <select
                  className="input" style={{ width: 'auto', padding: '3px 8px', fontSize: '0.85rem' }} aria-label={`${WINDOW_LABELS[id]} presets`} value=""
                  onChange={(e) => {
                    const p = WINDOW_PRESETS.find((x) => x.id === e.target.value);
                    if (p) setConfig((c) => ({ ...c, windows: { ...c.windows, [id]: { ...p.window } } }));
                  }}
                >
                  <option value="">Presets…</option>
                  {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              )}
            </div>
            <div className="grid g2" style={{ gap: 8 }}>
              <Field label="Start"><input className="input" type="date" aria-label={`${WINDOW_LABELS[id]} start`} min={first} max={last} value={w.start} onChange={(e) => set(id, 'start', e.target.value)} /></Field>
              <Field label="End"><input className="input" type="date" aria-label={`${WINDOW_LABELS[id]} end`} min={first} max={last} value={w.end} onChange={(e) => set(id, 'end', e.target.value)} /></Field>
            </div>
          </div>
        );
      })}
    </div>
  );
}
