"""Regenerates docs/DATA_AUDIT.md from the source workbook. Run: python3 scripts/audit-data.py"""
import pandas as pd, numpy as np
src = 'data/source/fra_group_project.xlsx'
df = pd.read_excel(src, sheet_name='02_Historical_Data').rename(columns={'MnM': 'M&M'}).set_index('Date')
r = df.pct_change().dropna()
L = []
L.append('# Data audit\n')
L.append(f'Source: `{src}` sheet `02_Historical_Data` (read directly, not the app copy).\n')
L.append(f'- Rows: **{len(df)}**, from **{df.index.min().date()}** to **{df.index.max().date()}**; stocks: **{df.shape[1]}**')
L.append(f'- Duplicate dates: **{int(df.index.duplicated().sum())}**; missing values: **{int(df.isna().sum().sum())}**; zero/negative prices: **{int((df <= 0).sum().sum())}**; non-finite: **{int((~np.isfinite(df.values)).sum())}**')
gaps = df.index.to_series().diff().dt.days
L.append(f'- Calendar gaps > 7 days: **{int((gaps > 7).sum())}**')
L.append(f'- Daily moves with |r| ≥ 15%: **{int((r.abs() >= 0.15).sum().sum())}** (all kept; see below)\n')
L.append('## Per stock\n')
L.append('| Stock | Zero-return days | Longest flat run | Largest |move| | Date |\n|---|---|---|---|---|')
for c in df.columns:
    z = (r[c] == 0); run = z.groupby((~z).cumsum()).sum().max()
    m = r[c].abs().idxmax()
    L.append(f'| {c} | {z.mean():.1%} | {int(run)} | {r[c][m]:+.1%} | {m.date()} |')
L.append('\n## Large moves (|r| ≥ 15%)\n')
big = r.stack(); big = big[big.abs() >= 0.15].sort_values(key=abs, ascending=False)
for (d, c), v in big.items(): L.append(f'- {c} {d.date()} {v:+.1%}')
L.append('''
## Findings and limitations

1. **Adjusted vs raw prices cannot be verified from the file.** The sheet does not name a source or say whether prices are adjusted for splits, bonuses, rights issues or dividends. Long fractional decimals resemble an adjusted series, but this is an inference.
   Most large moves (|r| up to ~±25%) are consistent with NSE price bands or market-wide events (18 May 2009 election rally, 23 Mar 2020). **Exception, unresolved: Suzlon** has single-day moves beyond ±30% (2008-10-24 -40.3%, 2013-02-28 -34.0%) that exceed normal NSE bands and may be unadjusted corporate actions (e.g. rights issues) or exchange-patching artefacts. They are kept (nothing is deleted silently); please verify against NSE/BSE corporate-action records. Sensitivity below.
2. **Deepak Nitrite**: the `challenges` sheet says missing data were taken from BSE, so the series may mix exchanges for part of the sample. It shows a higher zero-return share than most stocks.
3. **Thin trading**: Suzlon (and to a lesser extent Deepak Nitrite) has many flat days, which slightly understates daily volatility and correlations.
4. **No benchmark index** is included, so beta is unavailable unless `public/data/benchmark.csv` is supplied.
5. **Survivorship / hindsight bias**: all 20 stocks exist today and were selected with knowledge of the sample.
6. The `03_Statistics` sheet in the workbook is empty; nothing was taken from it.
7. Nothing was filled, interpolated or removed. Returns are computed only between consecutive price rows inside each analysis window.
''')
A = ['SUZLON','RALLIS','DEEPAKNTR','KEI','RADICO','ESCORTS','ASTRAMICRO','FINCABLES','GRANULES','CENTURYPLY']
ra = r[A].mean(axis=1)
sz = r['SUZLON'].abs() > 0.30
L.append('## Sensitivity: Suzlon moves beyond ±30%\n')
L.append(f'Equal-weight Portfolio A, full history: annualised volatility **{ra.std()*252**.5:.2%}**; with the {int(sz.sum())} Suzlon days beyond ±30% removed: **{ra[~sz].std()*252**.5:.2%}**. (For information only; the app uses the data as supplied.)\n')
open('docs/DATA_AUDIT.md', 'w').write('\n'.join(L))
print('wrote docs/DATA_AUDIT.md')
