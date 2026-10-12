export const fmtPct = (x: number | null | undefined, d = 2): string =>
  x === null || x === undefined || !Number.isFinite(x) ? '–' : `${(x * 100).toFixed(d)}%`;

export const fmtNum = (x: number | null | undefined, d = 2): string =>
  x === null || x === undefined || !Number.isFinite(x) ? '–' : x.toFixed(d);

/** Indian digit grouping, e.g. ₹15,00,000 */
export const fmtInr = (x: number | null | undefined): string =>
  x === null || x === undefined || !Number.isFinite(x) ? '–' : `₹${Math.round(x).toLocaleString('en-IN')}`;

export const fmtLakh = (x: number): string => `₹${(x / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} lakh`;

export const fmtDate = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export const downloadText = (name: string, text: string, mime = 'text/plain') => {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const toCsv = (rows: (string | number | null)[][]): string =>
  rows.map((r) => r.map((c) => (c === null ? '' : typeof c === 'string' && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : String(c))).join(',')).join('\n');
