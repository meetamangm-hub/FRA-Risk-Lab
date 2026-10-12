import { useState, type ReactNode } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { Verdict } from '../engine/classify';

export function Card({ title, aside, children, tone, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; tone?: 'a' | 'b'; className?: string }) {
  return (
    <section className={`card ${tone ?? ''} ${className}`}>
      {(title || aside) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {aside && <div className="small muted">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, small }: { label: string; value: ReactNode; sub?: ReactNode; small?: boolean }) {
  return (
    <div className={`kpi ${small ? 'sm' : ''}`}>
      <span className="lab">{label}</span>
      <span className="val">{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

export function Chip({ tone = 'neutral', children }: { tone?: 'good' | 'warn' | 'bad' | 'a' | 'b' | 'neutral'; children: ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export const PortTag = ({ id }: { id: 'A' | 'B' }) => (
  <span className={`chip ${id === 'A' ? 'a' : 'b'}`}>{id === 'A' ? 'A · High Risk label' : 'B · Low Risk label'}</span>
);

export function VerdictChip({ v }: { v: Verdict | null | undefined }) {
  if (!v) return <Chip>n/a</Chip>;
  const map: Record<Verdict, ['good' | 'warn' | 'bad' | 'neutral', string]> = {
    supported: ['good', 'Supported'], partial: ['warn', 'Partially supported'],
    'not-supported': ['bad', 'Not supported'], reversed: ['bad', 'Reversed'], undetermined: ['neutral', 'Undetermined'],
  };
  const [tone, label] = map[v];
  return <Chip tone={tone}>{label}</Chip>;
}

/** Numeric input that edits freely while focused and only re-formats on blur. `scale` converts stored↔shown units. */
export function NumField(props: {
  value: number; onChange: (v: number) => void; scale?: number; decimals?: number; unit?: string; prefix?: string;
  min?: number; max?: number; step?: number | string; invalid?: boolean; label: string; id?: string; disabled?: boolean;
}) {
  const { value, onChange, scale = 1, decimals = 2, unit, prefix, min, max, step, invalid, label, id, disabled } = props;
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (Number.isFinite(value) ? String(+(value * scale).toFixed(decimals)) : '');
  return (
    <div className="input-unit" style={invalid ? { borderColor: 'var(--bad)', background: 'var(--bad-soft)' } : undefined}>
      {prefix && <span>{prefix}</span>}
      <input
        id={id} aria-label={label} type="number" inputMode="decimal" min={min} max={max} step={step} value={shown} disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v / scale);
        }}
        onBlur={() => setText(null)}
      />
      {unit && <span>{unit}</span>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="pill-tabs" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Formula({ tex, inline }: { tex: string; inline?: boolean }) {
  const html = katex.renderToString(tex, { displayMode: !inline, throwOnError: false, output: 'html' });
  return <div className={inline ? undefined : 'formula'} style={inline ? { display: 'inline' } : undefined} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function How({ title = 'How is this calculated?', children }: { title?: string; children: ReactNode }) {
  return (
    <details className="how">
      <summary>{title}</summary>
      <div className="body">{children}</div>
    </details>
  );
}

export function Issues({ issues }: { issues: { level: 'error' | 'warning'; message: string }[] }) {
  if (!issues.length) return null;
  const errs = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warning');
  return (
    <div className="stack" role="status">
      {errs.length > 0 && (
        <div className="banner err"><strong>Fix before results can be shown</strong>{errs.map((e, i) => <span key={i}>• {e.message}</span>)}</div>
      )}
      {warns.length > 0 && (
        <div className="banner warn"><strong>Heads-up</strong>{warns.slice(0, 6).map((e, i) => <span key={i}>• {e.message}</span>)}</div>
      )}
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="banner info">{children}</div>;
