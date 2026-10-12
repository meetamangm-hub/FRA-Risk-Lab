# FRA Risk Lab

Interactive Financial Risk Analytics dashboard for the FRA group project: two ₹15 lakh portfolios of NSE stocks
(A "High Risk", B "Low Risk") tested with Historical / Parametric / Monte Carlo VaR, Expected Shortfall,
drawdown, a crisis-vs-calm stress test and Markowitz efficient frontiers built from different eras.

Everything runs in the browser (React + TypeScript + Vite + Plotly). No server, no API keys.
The risk labels are **tested, not assumed**: the verdict is computed from the data under a risk definition you can change.

## Run locally
```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 62 unit / cross-check tests
npm run build        # type-check + production build into dist/
```

## Publish on GitHub Pages (stable URL)
1. Create a repository (e.g. `FRA-Risk-Lab`) and push this folder to the `main` branch.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) runs the tests, builds and deploys. Your URL is
   `https://<username>.github.io/<repo>/`.
4. Every later `git push` to `main` redeploys to the **same URL**. The build uses relative paths
   (`base: './'`), so renaming the repo never breaks the site.

## Changing things later
| I want to… | Edit |
|---|---|
| Change a stock, weight, date, ₹ amount, confidence, target | Nothing: use the app (⚙ Settings, Portfolio Builder). "Reset to project defaults" restores the originals |
| Change the **default** portfolios/dates/₹ | `src/engine/model.ts` → `defaultConfig()`, `WINDOW_PRESETS`; stock names in `src/data/stocks.json` |
| Update the price data | Replace `src/data/prices.csv` (`Date,TICKER,…`) or import a CSV in the app's Data page for a session |
| Turn on beta | Add `public/data/benchmark.csv` (`Date,Close`), see `public/data/README.md` |
| Fix a formula / add a metric | `src/engine/*` (pure functions, each with tests in `tests/`); metric list for classification in `src/engine/classify.ts` |
| Change a page or chart | `src/pages/*.tsx` |
| Change colours / layout | `src/styles/app.css` |

## Project layout
```
src/engine/    stats · returns · risk (VaR/ES/MDD/beta) · montecarlo · optimizer · classify · frontierCompare · model (config → all results)
src/pages/     Dashboard, Builder, Risk Definition, VaR Lab, Crisis vs Calm, Frontier, Data, Methodology, Viva
src/state/     reactive store (config → deferred → analyse())
tests/         unit tests, Python cross-check, e2e/smoke.mjs (real browser)
scripts/       crosscheck.py (independent NumPy/SciPy implementation), audit-data.py
docs/          DATA_AUDIT.md, TEST_REPORT.txt, brief PDF
data/source/   original workbook (never modified)
```

## Validation
* `npm test`: hand-computed values, synthetic data with known answers, brute-force optimiser checks, interaction tests
  (investment ×2 ⇒ ₹VaR ×2, weight/date/confidence/target changes recalculate everything, invalid input blocked).
* `npm run crosscheck` regenerates `tests/fixtures/python_reference.json` with an independent Python implementation;
  `tests/crosscheck.test.ts` requires the TypeScript engine to match it on the real data.
* `node tests/e2e/smoke.mjs` (after `npm run build && npx vite preview --port 4173`) drives the real UI in Chromium.
* `npm run test:report` refreshes `docs/TEST_REPORT.txt`, which the Methodology page displays.

## Conventions
Daily simple returns · constant-weight, daily-rebalanced portfolios · 252 trading days · 1-day VaR ·
quantile = linear interpolation (Excel `PERCENTILE.INC`) · ES = mean of returns ≤ quantile · long-only optimiser by default.
See `docs/DATA_AUDIT.md` for data limitations (adjustment status unverified, Suzlon extreme days, hindsight bias).
