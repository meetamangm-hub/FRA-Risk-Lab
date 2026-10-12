# Data audit

Source: `data/source/fra_group_project.xlsx` sheet `02_Historical_Data` (read directly, not the app copy).

- Rows: **4493**, from **2008-01-01** to **2026-03-30**; stocks: **20**
- Duplicate dates: **0**; missing values: **0**; zero/negative prices: **0**; non-finite: **0**
- Calendar gaps > 7 days: **0**
- Daily moves with |r| ≥ 15%: **121** (all kept; see below)

## Per stock

| Stock | Zero-return days | Longest flat run | Largest |move| | Date |
|---|---|---|---|---|
| ASTRAMICRO | 1.2% | 2 | +20.0% | 2008-07-04 |
| CENTURYPLY | 1.4% | 2 | +18.0% | 2009-08-31 |
| DEEPAKNTR | 4.3% | 8 | +20.0% | 2010-01-13 |
| ESCORTS | 0.4% | 1 | -20.7% | 2008-01-21 |
| FINCABLES | 1.1% | 2 | +20.0% | 2009-05-20 |
| GRANULES | 1.2% | 2 | +20.1% | 2009-08-26 |
| KEI | 2.6% | 6 | -21.0% | 2025-02-27 |
| RADICO | 0.7% | 1 | -19.9% | 2020-03-23 |
| RALLIS | 0.4% | 1 | -20.0% | 2020-03-23 |
| SUZLON | 6.0% | 4 | -40.3% | 2008-10-24 |
| HDFCBANK | 0.2% | 1 | +16.3% | 2009-05-18 |
| BHARTIARTL | 0.2% | 1 | +25.4% | 2009-05-18 |
| HINDUNILVR | 0.3% | 1 | +17.4% | 2013-04-30 |
| ITC | 0.5% | 1 | -12.8% | 2015-03-02 |
| M&M | 0.2% | 1 | +24.0% | 2008-10-31 |
| NTPC | 1.3% | 2 | -15.5% | 2024-06-04 |
| POWERGRID | 1.2% | 1 | -17.0% | 2008-01-21 |
| RELIANCE | 0.1% | 1 | +21.4% | 2009-05-18 |
| SUNPHARMA | 0.2% | 1 | +22.1% | 2009-05-18 |
| TCS | 0.1% | 1 | +15.5% | 2009-05-18 |

## Large moves (|r| ≥ 15%)

- SUZLON 2008-10-24 -40.3%
- SUZLON 2013-02-28 -34.0%
- SUZLON 2019-02-22 +29.2%
- BHARTIARTL 2009-05-18 +25.4%
- SUZLON 2019-03-05 +25.2%
- SUZLON 2019-02-05 -24.2%
- M&M 2008-10-31 +24.0%
- M&M 2009-05-18 +23.9%
- SUZLON 2009-01-07 -22.6%
- SUZLON 2019-06-20 +22.4%
- SUNPHARMA 2009-05-18 +22.1%
- SUZLON 2009-05-18 +21.8%
- RELIANCE 2009-05-18 +21.4%
- KEI 2025-02-27 -21.0%
- SUZLON 2008-11-04 +21.0%
- ESCORTS 2008-01-21 -20.7%
- KEI 2008-01-07 +20.6%
- M&M 2008-10-29 +20.4%
- SUZLON 2019-02-21 +20.3%
- GRANULES 2009-08-26 +20.1%
- FINCABLES 2009-05-20 +20.0%
- ASTRAMICRO 2008-07-04 +20.0%
- ASTRAMICRO 2009-05-22 +20.0%
- SUZLON 2020-01-03 +20.0%
- ESCORTS 2013-08-14 +20.0%
- RALLIS 2020-03-23 -20.0%
- ASTRAMICRO 2014-05-30 +20.0%
- DEEPAKNTR 2010-01-13 +20.0%
- KEI 2014-04-09 +19.9%
- RADICO 2020-03-23 -19.9%
- KEI 2014-11-07 +19.9%
- SUZLON 2022-09-05 +19.9%
- SUZLON 2014-05-19 +19.9%
- KEI 2008-01-09 +19.8%
- SUZLON 2015-02-16 +19.8%
- KEI 2012-01-11 +19.7%
- KEI 2008-12-15 +19.7%
- KEI 2013-12-26 +19.6%
- KEI 2014-05-21 +19.4%
- SUZLON 2022-10-19 +19.4%
- ASTRAMICRO 2009-09-04 +19.3%
- KEI 2021-10-26 +19.1%
- KEI 2015-04-07 +19.0%
- GRANULES 2014-09-19 +18.8%
- ASTRAMICRO 2009-05-21 +18.8%
- ESCORTS 2015-08-27 +18.6%
- DEEPAKNTR 2009-04-13 +18.6%
- SUZLON 2020-01-06 +18.5%
- ASTRAMICRO 2008-02-19 +18.5%
- RALLIS 2009-06-26 +18.5%
- SUZLON 2009-04-16 -18.5%
- SUZLON 2023-06-07 +18.4%
- SUZLON 2013-03-01 +18.4%
- KEI 2017-09-11 +18.4%
- ESCORTS 2020-03-23 -18.4%
- SUZLON 2020-01-02 +18.4%
- KEI 2013-10-10 +18.3%
- CENTURYPLY 2009-08-31 +18.0%
- ASTRAMICRO 2020-06-05 +18.0%
- ASTRAMICRO 2008-12-03 +17.7%
- ESCORTS 2020-03-20 +17.7%
- GRANULES 2014-02-04 +17.7%
- SUZLON 2008-10-10 -17.7%
- GRANULES 2008-10-24 -17.6%
- ESCORTS 2008-12-10 +17.5%
- ASTRAMICRO 2020-03-23 -17.5%
- HINDUNILVR 2013-04-30 +17.4%
- SUZLON 2008-11-07 +17.4%
- KEI 2009-04-30 +17.4%
- GRANULES 2008-11-06 +17.4%
- ESCORTS 2016-08-11 +17.3%
- ASTRAMICRO 2008-03-17 -17.3%
- RALLIS 2009-05-18 +17.2%
- KEI 2017-02-03 +17.1%
- POWERGRID 2008-01-21 -17.0%
- GRANULES 2013-07-04 +17.0%
- KEI 2012-02-06 +17.0%
- ASTRAMICRO 2024-06-04 -17.0%
- ASTRAMICRO 2015-10-12 +17.0%
- SUZLON 2013-01-25 +16.9%
- M&M 2020-04-09 +16.9%
- CENTURYPLY 2014-01-21 +16.6%
- KEI 2008-11-24 -16.6%
- GRANULES 2024-09-12 -16.5%
- ASTRAMICRO 2015-02-18 +16.5%
- ESCORTS 2008-08-01 +16.4%
- RADICO 2008-01-23 +16.4%
- SUZLON 2015-02-18 +16.3%
- HDFCBANK 2009-05-18 +16.3%
- RELIANCE 2008-10-24 -16.3%
- ESCORTS 2008-01-22 -16.3%
- FINCABLES 2008-01-21 -16.3%
- RALLIS 2008-10-29 +16.2%
- SUZLON 2009-06-01 +16.2%
- DEEPAKNTR 2020-08-24 +16.0%
- POWERGRID 2009-05-18 +15.9%
- ASTRAMICRO 2009-08-21 +15.9%
- FINCABLES 2012-11-08 +15.8%
- CENTURYPLY 2018-10-16 +15.8%
- SUZLON 2013-01-31 +15.8%
- GRANULES 2020-03-23 -15.7%
- ASTRAMICRO 2009-07-15 +15.7%
- M&M 2008-10-24 -15.6%
- DEEPAKNTR 2014-04-28 +15.5%
- TCS 2009-05-18 +15.5%
- ESCORTS 2009-03-12 +15.5%
- NTPC 2024-06-04 -15.5%
- TCS 2009-07-20 +15.3%
- ASTRAMICRO 2008-03-25 +15.3%
- SUZLON 2008-10-13 +15.2%
- CENTURYPLY 2013-09-13 +15.2%
- KEI 2015-07-13 +15.2%
- DEEPAKNTR 2025-02-14 -15.1%
- RADICO 2009-08-27 +15.1%
- ESCORTS 2020-03-24 +15.1%
- SUNPHARMA 2015-07-21 -15.1%
- RADICO 2017-10-16 +15.1%
- CENTURYPLY 2014-05-20 +15.0%
- GRANULES 2012-09-10 +15.0%
- RADICO 2017-11-16 +15.0%
- SUZLON 2019-07-26 +15.0%

## Findings and limitations

1. **Adjusted vs raw prices cannot be verified from the file.** The sheet does not name a source or say whether prices are adjusted for splits, bonuses, rights issues or dividends. Long fractional decimals resemble an adjusted series, but this is an inference.
   Most large moves (|r| up to ~±25%) are consistent with NSE price bands or market-wide events (18 May 2009 election rally, 23 Mar 2020). **Exception, unresolved: Suzlon** has single-day moves beyond ±30% (2008-10-24 -40.3%, 2013-02-28 -34.0%) that exceed normal NSE bands and may be unadjusted corporate actions (e.g. rights issues) or exchange-patching artefacts. They are kept (nothing is deleted silently); please verify against NSE/BSE corporate-action records. Sensitivity below.
2. **Deepak Nitrite**: the `challenges` sheet says missing data were taken from BSE, so the series may mix exchanges for part of the sample. It shows a higher zero-return share than most stocks.
3. **Thin trading**: Suzlon (and to a lesser extent Deepak Nitrite) has many flat days, which slightly understates daily volatility and correlations.
4. **No benchmark index** is included, so beta is unavailable unless `public/data/benchmark.csv` is supplied.
5. **Survivorship / hindsight bias**: all 20 stocks exist today and were selected with knowledge of the sample.
6. The `03_Statistics` sheet in the workbook is empty; nothing was taken from it.
7. Nothing was filled, interpolated or removed. Returns are computed only between consecutive price rows inside each analysis window.

## Sensitivity: Suzlon moves beyond ±30%

Equal-weight Portfolio A, full history: annualised volatility **25.41%**; with the 2 Suzlon days beyond ±30% removed: **25.26%**. (For information only; the app uses the data as supplied.)
