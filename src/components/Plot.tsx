import { useEffect, useRef } from 'react';

export const COLORS = { A: '#d9481f', B: '#1f6fb2', ink: '#14213d', grid: '#e9e5da', accent: '#f2a541', gray: '#7b8499', good: '#1d7a4d' };
export const PERIOD_COLORS: Record<string, string> = { reference: '#14213d', crisis: '#b3261e', calm: '#1d7a4d', full: '#7b8499' };

type Any = any; // Plotly's trace/layout objects are open-ended

interface Props { data: Any[]; layout?: Any; height?: number; ariaLabel?: string }

/** Thin wrapper: lazy-loads Plotly (cartesian bundle), re-renders on data change, resizes with its container. */
export function Plot({ data, layout, height = 320, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const plotly = useRef<Any>(null);

  useEffect(() => {
    let alive = true;
    import('plotly.js-cartesian-dist-min').then((m) => {
      if (!alive || !ref.current) return;
      const P = m.default ?? m;
      plotly.current = P;
      const base = {
        height,
        margin: { l: 56, r: 16, t: 28, b: 44 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: 'Inter, ui-sans-serif, system-ui, sans-serif', size: 12, color: COLORS.ink },
        legend: { orientation: 'h', y: 1.12, x: 0 },
        xaxis: { gridcolor: COLORS.grid, zerolinecolor: COLORS.grid, automargin: true },
        yaxis: { gridcolor: COLORS.grid, zerolinecolor: COLORS.grid, automargin: true },
        hoverlabel: { font: { family: 'Inter, ui-sans-serif, system-ui, sans-serif' } },
      };
      const merged = {
        ...base, ...layout,
        xaxis: { ...base.xaxis, ...(layout?.xaxis ?? {}) },
        yaxis: { ...base.yaxis, ...(layout?.yaxis ?? {}) },
      };
      P.react(ref.current, data, merged, { displayModeBar: false, responsive: true });
    });
    return () => { alive = false; };
  }, [data, layout, height]);

  useEffect(() => () => { if (plotly.current && ref.current) plotly.current.purge(ref.current); }, []);
  return <div ref={ref} className="plot" role="img" aria-label={ariaLabel} style={{ minHeight: height }} />;
}
