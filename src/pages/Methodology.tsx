import type { ReactNode } from 'react';
import { Card, Formula } from '../components/ui';
import testReport from '../../docs/TEST_REPORT.txt?raw';

const S = ({ n, title, children }: { n: number; title: string; children: ReactNode }) => (
  <Card title={`${n}. ${title}`}><div className="stack">{children}</div></Card>
);

export function Methodology() {
  const lines = testReport.split('\n').filter((l) => /✓|×|Test Files|Tests /.test(l));
  const passed = lines.filter((l) => l.includes('✓')).length;
  const failed = lines.filter((l) => l.includes('×')).length;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head"><div><h1>Methodology</h1><p>Every formula the app uses, the convention chosen where textbooks differ, and what each method cannot do.</p></div></div>

      <S n={1} title="Our definition of risk">
        <p>Risk is measured, not assumed. The <strong>primary criterion</strong> is annualised volatility of the portfolio's daily returns, because it captures total variability and is the input to every other method here. It is then <strong>cross-examined</strong> by tail risk (VaR, Expected Shortfall), drawdown and, if a benchmark is loaded, beta. A portfolio is labelled relatively higher-risk when its primary measure exceeds the other's by a stated margin (default ×1.10) <em>and</em> most supporting measures agree. All of this is editable on the Risk Definition page.</p>
        <Formula tex={String.raw`\sigma_p=\sqrt{\operatorname{Var}(r_p)},\quad \sigma_{\text{annual}}=s_{\text{daily}}\sqrt{252},\quad \text{Ratio}=\sigma_A/\sigma_B`} />
        <p className="note">Volatility treats upside and downside equally; VaR and ES look only at the lower tail; drawdown depends on the path; beta measures only market-related risk. They can disagree, and when they do the app shows the disagreement rather than hiding it.</p>
      </S>

      <S n={2} title="Returns and portfolios">
        <Formula tex={String.raw`r_{i,t}=\frac{P_{i,t}}{P_{i,t-1}}-1\qquad r_{p,t}=\sum_{i=1}^{n}w_i\,r_{i,t}`} />
        <p>Daily <strong>simple</strong> returns throughout (never mixed with log returns). Portfolios are <strong>constant-weight, rebalanced daily</strong>: a hypothetical portfolio, not a buy-and-hold one. Returns are computed only from prices inside the chosen window, so none straddle its boundary. If any selected stock lacks a price on a date, that date is dropped for all stocks; missing values are never filled or set to zero return.</p>
      </S>

      <S n={3} title="Moments, covariance and annualisation">
        <Formula tex={String.raw`\bar r=\tfrac1T\sum r_t,\quad s^2=\tfrac1{T-1}\sum (r_t-\bar r)^2,\quad \operatorname{Cov}(r_i,r_j)=\tfrac1{T-1}\sum (r_{i,t}-\bar r_i)(r_{j,t}-\bar r_j)`} />
        <Formula tex={String.raw`\mu_{\text{annual}}=252\,\bar r_{\text{daily}}\ \ (\text{arithmetic}),\qquad \text{CAGR}=(1+R_{\text{cum}})^{252/T}-1`} />
        <p>Daily VaR is <em>not</em> scaled to annual figures anywhere. Portfolio variance is checked against wᵀΣw in the tests.</p>
      </S>

      <S n={4} title="Value at Risk and Expected Shortfall (α = 1 − confidence)">
        <Formula tex={String.raw`\text{Historical: } \mathrm{VaR}_\alpha=\max(0,-q_\alpha),\quad \mathrm{ES}_\alpha=\max\!\big(0,-\operatorname{avg}\{r_{p,t}\le q_\alpha\}\big)`} />
        <Formula tex={String.raw`\text{Parametric: } \mathrm{VaR}_\alpha=\max(0,-\mu_p-z_\alpha\sigma_p),\ z_\alpha=\Phi^{-1}(\alpha),\quad \mathrm{ES}_\alpha=-\mu_p+\sigma_p\varphi(z_\alpha)/\alpha`} />
        <Formula tex={String.raw`\text{Monte Carlo: } \mathbf r^{(s)}=\boldsymbol\mu+L\mathbf z^{(s)},\ LL^{\top}=\Sigma,\ r_p^{(s)}=\mathbf w^{\top}\mathbf r^{(s)};\ \text{then quantile and tail mean as in the historical case}`} />
        <p><strong>Quantile convention:</strong> linear interpolation between order statistics (Hyndman–Fan type 7, NumPy default, Excel <code>PERCENTILE.INC</code>), so results can be checked in a spreadsheet. <strong>Ties:</strong> every observation ≤ q<sub>α</sub> is in the ES tail. Rupee figures are percentage × investment, so doubling the investment doubles them exactly.</p>
        <p>The Monte Carlo draws use a seeded generator (mulberry32 + Box–Muller), so the same seed and inputs reproduce the same result in any browser. Stocks are simulated jointly through the Cholesky factor of Σ, preserving correlation.</p>
      </S>

      <S n={5} title="Drawdown and beta">
        <Formula tex={String.raw`W_t=W_{t-1}(1+r_{p,t}),\ W_0=1;\quad H_t=\max_{s\le t}W_s;\quad DD_t=\frac{W_t}{H_t}-1;\quad \text{MDD}=-\min_t DD_t`} />
        <Formula tex={String.raw`\beta_p=\frac{\operatorname{Cov}(r_p,r_m)}{\operatorname{Var}(r_m)}`} />
        <p>Beta uses synchronised dates and only runs if a benchmark file is loaded; otherwise it is shown as “n/a”, never estimated from the stocks themselves.</p>
      </S>

      <S n={6} title="Markowitz efficient frontier">
        <Formula tex={String.raw`\min_{w}\ w^{\top}\Sigma w\quad\text{s.t.}\quad w^{\top}\mu=\mu_{\text{target}},\ \ \textstyle\sum_i w_i=1,\ \ w_i\ge 0`} />
        <p>Solved exactly: equality-constrained KKT systems on the active set of stocks, with a multiplier check that reinstates any stock the constraint wrongly excluded (and an exhaustive search over supports as a safety net). The target is the portfolio's own annualised mean return over the reference window and is <strong>held constant</strong> across eras; μ and Σ are re-estimated per era. A target outside the era's achievable range is reported as infeasible. Upper weight caps are not implemented.</p>
        <p className="note">Mean–variance weights are highly sensitive to expected-return estimates; short windows amplify that. Read shifts in allocation as shifts in the <em>inputs</em>, not as advice.</p>
      </S>

      <S n={7} title="Validation">
        <p>Three layers: (1) unit tests against hand-computed values and synthetic data with known answers; (2) an <strong>independent Python re-implementation</strong> (NumPy/SciPy, including SciPy's SLSQP optimiser) whose real-data outputs the TypeScript engine must reproduce to 10⁻¹² (statistics, VaR, ES, drawdown) and to 10⁻⁴ (optimiser variance); (3) interaction tests proving that changing an investment, weight, date range, confidence or target recalculates every dependent figure.</p>
        <div className="row"><span className="chip good">{passed} test groups passed</span>{failed > 0 && <span className="chip bad">{failed} failed</span>}</div>
        <details className="how"><summary>Full test output</summary><pre className="small" style={{ overflow: 'auto', maxHeight: 420, background: '#faf9f5', padding: 12, borderRadius: 8 }}>{testReport}</pre></details>
      </S>

      <S n={8} title="Known limitations">
        <ul className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li>Historical data only; nothing here is real-time or a forecast.</li>
          <li>Price adjustment for corporate actions is unverified (see the Data page); stock selection has survivorship/hindsight bias.</li>
          <li>Short windows (a crisis may have only ~40 days) give noisy 95%/99% tail estimates and covariances.</li>
          <li>Parametric and Monte Carlo VaR assume normal returns; real returns have fat tails.</li>
          <li>Transaction costs, taxes, dividends reinvestment and liquidity are ignored; daily rebalancing is an idealisation.</li>
        </ul>
      </S>
    </div>
  );
}
