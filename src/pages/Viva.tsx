import type { ReactNode } from 'react';
import { Card } from '../components/ui';
import { METRICS } from '../engine/classify';
import { fmtInr, fmtPct } from '../format';
import { m as getM, turnover, windowLabel } from '../lib';
import { useStore } from '../state/store';

interface QA { q: string; a: ReactNode; live?: ReactNode }

export function Viva() {
  const { config, analysis: an } = useStore();
  const conf = Math.round(config.confidence * 1000) / 10;
  const alpha = (1 - config.confidence) * 100;
  const thr = config.risk.threshold;
  const primary = config.risk.primary === 'composite' ? 'composite score' : METRICS.find((m) => m.id === config.risk.primary)!.label.toLowerCase();
  const full = an.classification.full, cr = an.classification.crisis, ca = an.classification.calm;
  const ratio = (c: typeof full) => (c?.primary?.ratio != null ? c.primary.ratio.toFixed(2) + '×' : 'n/a');
  const A = getM(an, 'A', config.focusWindow), B = getM(an, 'B', config.focusWindow);
  const cA = getM(an, 'A', 'crisis'), kA = getM(an, 'A', 'calm'), cB = getM(an, 'B', 'crisis'), kB = getM(an, 'B', 'calm');
  const fA = an.frontier.A, fB = an.frontier.B;
  const turn = (f: typeof fA, id: string) => { const p = f?.periods.find((x) => x.windowId === id); return p && p.status === 'optimal' ? fmtPct(turnover(p.weights, f!.currentWeights), 0) : 'infeasible'; };

  const qa: QA[] = [
    { q: 'How did you define risk?', a: <>As a measurable property of the return distribution, not a label. The primary criterion is annualised volatility; downside is checked with VaR and Expected Shortfall, depth of loss with maximum drawdown, and market sensitivity with beta when a benchmark is available.</>, live: <>Current primary: {primary}; A ÷ B over the full history = {ratio(full)}; verdict: {full?.headline ?? 'n/a'}.</> },
    { q: 'Why did you choose that definition?', a: <>Volatility is the quantity every other method here is built on (the covariance matrix, parametric VaR, the optimiser), it is comparable across portfolios on the same dates, and it needs no distributional assumption to compute. Using independent supporting measures guards against relying on one number.</> },
    { q: 'Why is volatility the primary criterion?', a: <>It summarises total variability in one comparable number and is the objective of Markowitz optimisation. The app lets you swap the primary measure (for example to 95% Expected Shortfall) and see whether the conclusion survives.</> },
    { q: 'Why is volatility not a complete measure of risk?', a: <>It penalises upside and downside equally, says nothing about how bad the worst days are, and ignores the path (drawdown). Two portfolios can share a σ and still have very different tail losses; that is why VaR, ES and drawdown are shown alongside.</> },
    { q: 'Why did you choose these 20 stocks?', a: <>Our shortlist needed 20 NSE stocks listed on or before 1 Jan 2008 so that both the 2008 and 2020 stress periods have full price data. Portfolio A holds small/mid-cap cyclicals; Portfolio B large-cap defensives. The sector and size reasoning is only a hypothesis, which this app then tests. Caveat: choosing from today's survivors adds hindsight bias.</> },
    { q: 'What evidence supports the initial portfolio labels?', a: <>Only the measured numbers count. The Risk Definition page compares both portfolios on every measure in each period and returns Supported, Partially supported, Not supported or Reversed according to the rule shown there.</>, live: <>Full history: {full?.headline}. Crisis: {cr?.headline}. Calm: {ca?.headline}. Primary ratios {ratio(full)}, {ratio(cr)}, {ratio(ca)}.</> },
    { q: 'What happens if the risk measures disagree?', a: <>We report it. Volatility, tail loss, drawdown and beta capture different things. The verdict logic needs the primary measure to clear a materiality threshold and at least 75% of supporting measures to agree for “Supported”; otherwise the label is “Partially supported” or worse, and the page flags the disagreement.</>, live: <>Currently {full ? `${full.supportYes} of ${full.supportTotal}` : 'n/a'} supporting measures agree over the full history.</> },
    { q: 'Why did you select the crisis and calm periods?', a: <>Crisis: the COVID-19 sell-off, starting at the pre-crash peak of a 20-stock equal-weight proxy (20 Feb 2020) and running through the 23 Mar trough and the volatile rebound to 30 Apr, so the sample is not made only of down days. Calm: 1 Mar–31 Oct 2016, after the Feb-2016 sell-off and before demonetisation. Both were picked from market events, not from portfolio results, and are editable. Limitation: short windows give noisy tails.</>, live: <>Crisis window: {config.windows.crisis.start} → {config.windows.crisis.end} ({cA?.n ?? '–'} days). Calm: {config.windows.calm.start} → {config.windows.calm.end} ({kA?.n ?? '–'} days).</> },
    { q: 'What does 95% VaR mean?', a: <>On 95% of days the loss should be smaller than VaR; on the worst 5% of days (about one day in 20) it will be at least that large. It is a threshold, not a worst case.</>, live: A ? <>Portfolio {A.portfolio}, {windowLabel(config.focusWindow)}: {conf}% VaR is {fmtPct(A.hist.var)} = {fmtInr(A.hist.var * A.investment)} on {fmtInr(A.investment)}.</> : undefined },
    { q: 'Why can 99% VaR exceed 95% VaR?', a: <>Higher confidence moves the threshold further into the tail, so it can only grow: 99% VaR is the loss exceeded on 1% of days, which is a bigger loss than the one exceeded on 5% of days.</>, live: A ? <>Here: 95% = {fmtPct(A.hist95.var)}, 99% = {fmtPct(A.hist99.var)}.</> : undefined },
    { q: 'What is the difference between VaR and Expected Shortfall?', a: <>VaR is the cut-off of the worst α% of days; ES is the average loss <em>inside</em> that worst α%. ES therefore sees how bad the tail is, is never smaller than VaR, and is “coherent” (rewards diversification) where VaR is not.</>, live: A ? <>Historical: VaR {fmtPct(A.hist.var)}, ES {fmtPct(A.hist.es)}.</> : undefined },
    { q: 'Why did you use three VaR methods?', a: <>Each makes different assumptions: historical uses the actual past with no distribution; parametric assumes normality; Monte Carlo simulates the joint stock returns. Agreement builds confidence; a large gap points to fat tails or a short sample.</>, live: A ? <>Historical {fmtPct(A.hist.var)} · Parametric {fmtPct(A.param.var)} · Monte Carlo {fmtPct(A.mc?.var)}.</> : undefined },
    { q: 'What assumptions does parametric VaR make?', a: <>That portfolio returns are normal with constant mean and volatility. Real returns usually have excess kurtosis and negative skew, so normal VaR tends to be too small at 99%.</>, live: A ? <>Sample skew {A.skew.toFixed(2)}, excess kurtosis {A.exKurt.toFixed(2)}.</> : undefined },
    { q: 'How does Monte Carlo simulation work?', a: <>Estimate each stock's mean and the covariance matrix, factor Σ = LLᵀ (Cholesky), draw independent standard normals z, form r = μ + Lz for all stocks at once, weight them into a portfolio return, repeat, and read VaR and ES from the simulated distribution. A fixed seed makes it reproducible.</>, live: <>{config.nSims.toLocaleString('en-IN')} simulations, seed {config.seed}.</> },
    { q: 'Why must the simulation preserve stock correlations?', a: <>Because portfolio risk depends on how stocks move together. Simulating them independently would understate the chance of several stocks falling at once and so understate VaR. Using L keeps the sample covariance (a test checks this).</> },
    { q: 'What is the difference between portfolio variance and volatility?', a: <>Variance is wᵀΣw, in squared-return units; volatility is its square root, in the same units as returns, which is why we quote it.</>, live: A ? <>Daily variance {(A.sdDaily ** 2).toExponential(3)}; daily σ {fmtPct(A.sdDaily, 3)}; annual σ {fmtPct(A.sigmaAnnual, 1)}.</> : undefined },
    { q: 'How does diversification affect portfolio risk?', a: <>When stocks are less than perfectly correlated, portfolio volatility is below the weighted average of the stocks' volatilities. The diversification ratio (Σwᵢσᵢ ÷ σₚ) quantifies this.</>, live: A && B ? <>Diversification ratio: A {A.diversificationRatio.toFixed(2)}, B {B.diversificationRatio.toFixed(2)}; average correlation A {A.avgCorr.toFixed(2)}, B {B.avgCorr.toFixed(2)}.</> : undefined },
    { q: 'Why might correlations increase during a crisis?', a: <>Common shocks (liquidity withdrawal, forced selling, risk-off flows) dominate stock-specific news, so many stocks fall together and diversification benefit shrinks when it is needed most.</>, live: cA && kA && cB && kB ? <>Avg. correlation calm → crisis: A {kA.avgCorr.toFixed(2)} → {cA.avgCorr.toFixed(2)}; B {kB.avgCorr.toFixed(2)} → {cB.avgCorr.toFixed(2)}.</> : undefined },
    { q: 'What is the Markowitz efficient frontier?', a: <>The set of portfolios giving the lowest variance for each achievable expected return (equivalently, the highest return for each risk). Anything below the frontier is dominated.</> },
    { q: 'Why can optimal stock weights change across periods?', a: <>The optimiser only sees the era's average returns and covariances. If a stock's return, volatility or correlation changes between eras, the cheapest way to hit the same return changes too.</>, live: <>Weight turnover vs current — A: reference {turn(fA, 'reference')}, crisis {turn(fA, 'crisis')}, calm {turn(fA, 'calm')}. B: reference {turn(fB, 'reference')}, crisis {turn(fB, 'crisis')}, calm {turn(fB, 'calm')}.</> },
    { q: 'Why must the target return remain constant in the historical comparison?', a: <>Otherwise we would be comparing different goals. Fixing the target isolates the effect of the era's risk structure on the allocation.</>, live: <>Targets: A {fA ? fmtPct(fA.target, 1) : 'n/a'}, B {fB ? fmtPct(fB.target, 1) : 'n/a'} per year.</> },
    { q: 'What happens when the target return is infeasible?', a: <>With long-only weights the achievable return lies between the lowest and highest stock expected return of that era. Outside that range there is no solution; the app says so and shows the achievable range rather than silently changing the target.</> },
    { q: 'What are the limitations of mean–variance optimisation?', a: <>It treats sample means and covariances as truth, is very sensitive to the expected-return estimates, assumes risk = variance, and tends to concentrate weights. Short windows make all of this worse.</> },
    { q: 'How did you validate the calculations?', a: <>Hand-checked unit tests, synthetic datasets with known answers, brute-force checks of the optimiser, and an independent NumPy/SciPy implementation whose results the app must match on the real data. Interaction tests confirm that changing investment, weights, dates, confidence or target recalculates every dependent output. The full output is on the Methodology page.</> },
    { q: 'What would you improve with better data?', a: <>Verified, corporate-action-adjusted prices from a single exchange source; a Nifty/Sensex benchmark for beta; a stock list fixed in 2008 to remove survivorship bias; longer or multiple crisis episodes for more reliable tails; and a fat-tailed or GARCH-based VaR.</> },
  ];

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head"><div><h1>Viva preparation</h1><p>Likely faculty questions, with answers that quote the live numbers from your current settings (blue boxes). Change an input and the numbers change with it.</p></div></div>
      <Card>
        <div className="stack" style={{ gap: 8 }}>
          {qa.map((x, i) => (
            <details key={i} className="q">
              <summary data-n={i + 1}>{x.q}</summary>
              <div className="ans"><div>{x.a}</div>{x.live && <div className="live">{x.live}</div>}</div>
            </details>
          ))}
        </div>
      </Card>
      <p className="small muted">Settings in force: {conf}% confidence (α = {alpha.toFixed(1)}%), materiality ×{thr.toFixed(2)}, primary measure: {primary}.</p>
    </div>
  );
}
