# Career Semi Quant Terminal

> A zero-server, fully client-side quantitative stock analytics dashboard for the global semiconductor industry.
>
> **Live: [nithinpuru.github.io/quant-terminal](https://nithinpuru.github.io/quant-terminal/)**
>
> Source of truth: [chennakeshavadasa/career-semi-quant](https://github.com/chennakeshavadasa/career-semi-quant). The portfolio site mirrors this folder and `public/quant-terminal/` from it automatically, and only syncs commits that pass the test suite. See that repo's README for the sync design.

![Status](https://img.shields.io/badge/Status-Live-brightgreen)
![Architecture](https://img.shields.io/badge/Architecture-100%25_Client--Side-blue)
![Companies](https://img.shields.io/badge/Companies-40+-purple)
![Cost](https://img.shields.io/badge/Cost-Free-green)

---

## Purpose

When evaluating a job offer in the semiconductor industry, one of the most consequential unknowns is the equity component — RSUs, stock options, or ESPPs. Glassdoor does not provide this analysis. LinkedIn does not provide this analysis. A Bloomberg Terminal costs approximately $24,000 per year.

**Career Semi Quant Terminal** was built to solve this gap for semiconductor professionals. It gives engineers across analog, ASIC, digital, verification, and layout disciplines a single dashboard where they can:

1. **Discover** publicly tracked companies across their specific sub-field (SerDes IP, Optical Rx/Tx, Mixed-Signal, AI Accelerators, Foundry, EDA)
2. **Analyze** each company's stock trajectory using the same quantitative models institutional funds use, computed live in the browser
3. **Evaluate** whether a prospective employer's equity is trending upward, collapsing, or stagnating — before accepting an offer

No login required. No account required. No API key required for the primary data source. Open the page and the analysis runs.

---

## Institutional Tools

All tools run on the full 10-year weekly history in the data file and use the companies currently visible on the dashboard, so filter or search first to focus on a group.

| Tool | Model | What it answers |
|---|---|---|
| **Factor Model** | Barra-style 5-factor regression: MKT (SPY), SEMI (SOXX − SPY), MOM (12-1 month), LOWVOL (26-week vol), SIZE (USD market cap). Long-short tercile factor portfolios built from the universe, with variance attribution `β'Σ_fβ + σ²_ε`. | What drives this stock? How much of its risk is market, sector or style, and how much is stock-specific? |
| **Factor scores** | Cross-sectional z-scores (winsorized ±3): momentum, low-vol, value (earnings yield), quality, size, and an equal-weight composite. | Which names rank best on classic factors today? |
| **Quality (QMJ)** | Asness-Frazzini-Pedersen "Quality Minus Junk" style: profitability (ROE, ROA, gross/operating/FCF margins), growth (revenue, earnings), safety (debt/equity, current ratio, beta, volatility). Rank-based z-scores so single outliers can't dominate. Only single-currency ratios are used (for ADRs Yahoo mixes currencies across cash/debt vs market cap). | Which businesses are genuinely high quality, not just strong stocks? |
| **Regimes** | Gaussian hidden Markov model (Baum-Welch EM, Viterbi path), 2 or 3 states, fitted on SOXX/SPY and on each stock. | Is the market calm or turbulent? How persistent is the current state? |
| **Rotation (RRG)** | Open reconstruction of the proprietary JdK RS-Ratio / RS-Momentum: rolling z-score of relative strength, momentum = z-score of its rate of change, light EMA smoothing. Stocks or equal-weight sector indices; 10/14/26-week windows; heading and strength table. Unit-tested to rotate clockwise and to have momentum lead ratio, as the real indicator does. | Who is gaining or losing leadership relative to the sector? |
| **Pairs** | Engle-Granger cointegration with MacKinnon p-values (identical to `statsmodels.coint`), Benjamini-Hochberg false-discovery-rate q-values across all pairs tested, and a split-sample check (cointegrated in both halves, stable positive hedge ratio, half-life 1–26 weeks). Trade signals only for pairs passing everything. | Which pairs genuinely mean-revert, rather than looking related by chance? |
| **Optimizer** | Exact long-only mean-variance frontier (projected gradient + simplex projection), max Sharpe, min variance, equal-risk-contribution risk parity, hierarchical risk parity (López de Prado), Black-Litterman with user views (Idzorek-style confidence). Shrunk expected returns and covariance. | How should capital be split, under different philosophies? |
| **Risk & Stress** | Parametric and historical VaR/ES, component VaR and marginal risk, diversification ratio, betas; replays of real crises (Q4 2018, COVID, 2022, Aug 2024, DeepSeek, 2025 tariffs) and custom SPY/SOXX shocks via two-factor betas. | Where does portfolio risk come from, and what happens in a crash? |
| **Backtest** | Walk-forward optimization: pick parameters on a training window, trade them blind on the next test window, roll forward. Transaction costs, turnover, exposure. Strategies: RSI, MACD, trend, absolute momentum, cross-sectional momentum rotation. | Does a rule work out-of-sample, after costs? |
| **Screener** | Sortable table of every metric (Cards / Table switch). | Quick cross-sectional comparison. |
| **Earnings** | Market-model event study on ~3,000 past reports (Yahoo EPS estimate vs actual): abnormal returns vs a beta-adjusted benchmark (estimation window excludes other earnings weeks), earnings-week move multiple, beat rate, and post-earnings drift after beats vs misses with t-stats. | How much risk does the next report carry, and does the stock keep drifting after surprises? |
| **Drawdown forecast** | Regime-switching Monte Carlo: HMM transition matrix from today's regime probabilities, regime-conditional bootstrap of historical returns, 5,000 paths; zero-drift option; compared with an i.i.d. bootstrap. | How deep could the portfolio's worst fall be over the next 6–24 months? |
| **Volatility targeting** | RiskMetrics EWMA vol forecasts; inverse-vol tilt plus book-level scaling to a target vol with a leverage cap, dollar position sizes; backtest of the volatility-managed portfolio (Moreira & Muir 2017). | How big should each position be for a given risk budget? |
| **Attribution** | Weekly Brinson-Fachler by sector (allocation, selection, interaction) vs a cap- or equal-weighted universe, Carino-linked to the compounded excess return; factor attribution (β × factor return + alpha + residual). | Why did the portfolio beat or trail its benchmark? |
| **Correlation dynamics** | Rolling and EWMA average pairwise correlation, correlation matrices in calm vs turbulent SOXX regimes, diversification ratio by regime, pairs whose correlation jumps most in stress. | Does diversification hold up when markets fall? |
| **Timeline replay & IC** | Point-in-time recomputation of the dashboard's quant score for any past week, with forward 4/13/26-week returns; information-coefficient research: IC time series, t-stat on non-overlapping dates, quintile spreads, signal decay by horizon. Notes survivorship bias. | What did the model say then, and has it actually predicted returns? |

The quant library has unit tests against known answers (`quant-terminal/tests/quant-lib.test.mjs`). For example, the HMM must recover planted regimes, the factor engine must not use future data, and the quality score must rank strong businesses above weak ones without being swayed by outliers. The ADF test, Engle-Granger cointegration test and Benjamini-Hochberg correction are checked against reference values from **statsmodels** (`tests/fixtures/statsmodels.json`, regenerate with `tests/gen_fixtures.py`).

## Architecture Overview

The entire application is a single `index.html` file. There is no backend, no build step, no database, and no server. All quantitative computation runs natively in the browser's JavaScript engine the moment price data is received.

### Data Pipeline

Browsers can no longer call Yahoo Finance directly: it blocks cross-origin requests and rate-limits (HTTP 429) non-browser clients, and the free public CORS proxies are gone. So prices are fetched server-side on a schedule and published as a static file:

```
GitHub Action (.github/workflows/quant-terminal-data.yml)
  runs quant-terminal/update_data.py  — 21:30 UTC Mon–Fri + 09:00 UTC daily
      |  yfinance (latest) → 10 years of weekly closes + fundamentals for every ticker in index.html
      |  - failed tickers keep their previous data (flagged stale)
      |  - illiquid / flat series are flagged in the log
      |  - if < 60% of tickers succeed, the run fails and nothing is written
      v
public/quant-terminal/market_data.json  (committed; deploy.yml redeploys the site when the run finishes)
      |
      v
index.html  — loads the file once, computes every metric in the browser
      |
      |  ticker missing from the file?
      v
Optional user API keys: Polygon.io → Alpha Vantage → Finnhub
      |
      v
Clear "no data" card. No synthetic or simulated data is ever shown.
```

The ticker universe is read straight from the `COS` list in `public/quant-terminal/index.html`, so adding a company there is all it takes. The next workflow run (or a manual **Run workflow**) fetches it. International listings (Samsung `005930.KS`, SK Hynix `000660.KS`, Tokyo Electron `8035.T`, etc.) are shown in their home currency.

The **Range** selector (3M–10Y) sets the look-back window for every metric. Benchmarks (SPY, SOXX) are aligned to each stock by date, so beta, alpha and the factor model compare the same weeks.

### Why No Simulated Fallback Data?

An earlier prototype included a Geometric Brownian Motion fallback that generated synthetic prices when all APIs failed. That feature was removed. Every number displayed on this dashboard is derived from a verified market data source. Displaying synthetic data to professionals making career decisions is unacceptable.

### Why Client-Side Only?

- **Privacy**: API keys are stored in `localStorage` and never transmitted to any server.
- **Cost**: Hosted on GitHub Pages at zero cost with no backend infrastructure.
- **Speed**: Eliminates any server round-trip. Computation runs directly in the browser.
- **Portability**: Works on any device with a modern browser.

---

## Dashboard — Company Card View

Each company is rendered as a card that loads in parallel. The dashboard supports sorting, filtering, and search.

### Card-Level Metrics

Every card computes and displays the following from raw weekly close prices:

| Metric | Computation |
|---|---|
| **Current Price** | Most recent weekly close |
| **6M / 1Y Return** | Percentage change from 26-week and 52-week lookback |
| **RSI (14-period)** | Relative Strength Index. Values above 70 indicate overbought conditions; below 30 indicate oversold. |
| **Stochastic Oscillator** | Position of current price within the 14-week high/low range. |
| **MACD Histogram** | Difference between 12-week and 26-week exponential moving averages, smoothed by a 9-week signal line. Positive histogram = bullish momentum; negative = bearish. |
| **10 / 40 SMA Cross** | Bull Cross when the 10-week SMA crosses above the 40-week SMA; Death Cross when it crosses below. |
| **Bollinger Band Position** | Classifies the price relative to the 2-standard-deviation band around the 20-week SMA. |
| **Annualized Volatility** | Standard deviation of weekly log-returns scaled by sqrt(52). |
| **Sharpe Ratio** | Annualized excess return over the risk-free rate (4.5%) divided by annualized volatility. |
| **Sortino Ratio** | Like Sharpe, but the denominator uses only downside deviation — weeks with negative returns. |
| **Value at Risk (95%)** | The 5th-percentile weekly return from the empirical return distribution. Represents the threshold below which losses occur with 5% probability. |
| **Max Drawdown** | The largest peak-to-trough percentage decline observed across the trailing 52 weeks. |
| **Beta (vs SPY)** | Covariance of weekly stock returns with SPY returns, divided by the variance of SPY returns. Measures systemic market sensitivity. |
| **Annual Alpha** | Excess annualized return beyond what CAPM predicts, given the stock's beta and the market's return. |
| **Monte Carlo 6M Median / Bull / Bear** | Summary statistics from a 2,000-path Geometric Brownian Motion simulation projecting 26 weeks forward (see detail below). |
| **Fibonacci 61.8% Support** | Retracement level computed from the 52-week high and low. Used as a structural support reference. |
| **Distance from 52W High** | Percentage gap between the current price and the 52-week high. |
| **Half-Kelly Position Size** | Kelly Criterion applied to the weekly win/loss ratio, halved for practical risk management. Returns the recommended portfolio allocation percentage. |
| **Fear and Greed Index** | A composite of RSI, Stochastic, and inverted Volatility, producing a 0–100 score classified as: Extreme Fear, Fear, Neutral, Greed, Extreme Greed. |
| **Composite Quant Score (0–100)** | A weighted heuristic aggregating momentum, risk-adjusted return, trend state, alpha, and sentiment signals into a single actionable ranking. |

### Quant Score Interpretation

| Score Range | Classification |
|---|---|
| >= 70 | Strong momentum — card highlighted in green |
| 40 – 69 | Neutral — no highlight |
| < 40 | Weak or deteriorating — card highlighted in red |

### Dashboard Controls

- **Filter buttons**: ALL, TIER-A, TIER-B, STRONG BUYS (>=70), EXTREME FEAR
- **Sort dropdown**: Quant Score, RSI, 6M Return, 1Y Return, Volatility (ascending/descending)
- **Search**: Live-filtering by company name or ticker symbol
- **Sparklines**: Gradient-filled SVG area charts rendering the trailing 52-week price trajectory
- **Progress bar**: Real-time loading indicator as tickers fetch in parallel
- **Data source tag**: Each card shows which API provider returned the data (Yahoo, Polygon, etc.)

---

## Detail Modal — Institutional Tear Sheet

Clicking any company card opens a full-screen detail modal containing seven interactive quantitative charts and an extended set of computed metrics. This is where the deeper institutional-grade analysis lives.

### Interactive Chart 1 — Price Action with Trend Overlays

Displays the trailing 52-week weekly closing price alongside two overlay series:

- **40-Week Simple Moving Average (SMA)**: The primary long-term trend baseline. Price consistently above SMA indicates an established uptrend.
- **Bollinger Bands (20-week, 2-sigma)**: The shaded region between the upper and lower band represents the statistical range within which price is expected to trade 95% of the time under a normal distribution assumption. Band expansion signals increasing volatility regimes; band contraction (squeeze) often precedes a large directional move.

Hovering over the chart displays the exact close price, SMA value, and both Bollinger levels at that specific week.

### Interactive Chart 2 — Underwater Drawdown

The drawdown curve tracks the percentage decline from the rolling peak price at every point in time. When the line is at 0%, the stock is at an all-time high for the displayed period. When it is at -30%, the stock is 30% below its most recent peak.

The area under the curve (filled in red) represents the total "pain" a holder of the stock experienced over the year. This is the visual representation of Max Drawdown and is standard in institutional performance attribution reports.

### Interactive Chart 3 — Weekly Returns Distribution with Normal PDF Overlay

A histogram of all observed weekly returns over the trailing 52 weeks, binned in 2-percentage-point intervals from -20% to +20%. A theoretical Normal Distribution PDF curve (white line) is overlaid using the stock's computed mean weekly return and weekly standard deviation.

The visual gap between the empirical histogram bars and the theoretical curve reveals **fat tails** and **skewness** — the degree to which the stock's return distribution departs from what standard models assume. Stocks with large bars in the extreme left tail carry significantly more tail risk than their Sharpe Ratio alone would suggest.

### Interactive Chart 4 — 26-Week Rolling Volatility (Annualized)

Volatility is not a static number. This chart computes a sliding 26-week window of annualized volatility at every weekly point in the 52-week display period. The result is a time series showing how the stock's risk regime has evolved.

Volatility compression (the line declining toward a low) is often observed before major price breakouts. Volatility expansion (sudden spikes) indicates a shift to a high-risk regime, typically following earnings surprises, macro shocks, or sector-wide rotation events.

### Interactive Chart 5 — 26-Week Rolling Beta (vs SPY)

Beta is typically reported as a single number, but it changes over time. This chart computes the covariance of the stock's weekly returns with SPY's weekly returns inside a 26-week rolling window, producing a time series of beta values.

**Decoupling events** — periods where the rolling beta drops sharply — indicate the stock is temporarily disconnecting from broad market movements and trading on its own idiosyncratic fundamentals (earnings, product cycles, analyst upgrades). These are the periods of greatest alpha opportunity for sector-specific analysis.

### Interactive Chart 6 — 26-Week Rolling Sharpe Ratio

The rolling Sharpe Ratio shows whether the stock has been compensating investors for the risk they are taking, and whether that compensation has been consistent or eroding. A declining Sharpe over the trailing six months, even if the annual Sharpe remains positive, is an early warning signal that the risk/return tradeoff is deteriorating.

A sustained Sharpe above 1.0 in the rolling window indicates the stock has been generating meaningful risk-adjusted outperformance in the recent period.

### Interactive Chart 7 — Monte Carlo Simulation (Geometric Brownian Motion)

Fifteen independent price path simulations are generated forward over 26 weeks (6 months) using **Geometric Brownian Motion (GBM)**, the same stochastic process used in the Black-Scholes option pricing model. Each path is computed as:

```
S(t+1) = S(t) * exp( (mu - sigma^2 / 2) * dt + sigma * sqrt(dt) * Z )
```

Where:
- `mu` is the mean weekly log-return derived from historical data (converted to decimal form)
- `sigma` is the weekly volatility (annualized volatility divided by sqrt(52))
- `Z` is a standard normal random variable generated via the Box-Muller transform
- `dt` is one week (1/52 of a year)

The 15 simulated paths form a **probability cone** — a visual representation of the distribution of plausible futures given the stock's historical behavior. The cone is not a forecast. It is a model of uncertainty. Wider cones indicate higher-volatility stocks with more dispersed outcomes. Narrower cones indicate lower-volatility stocks with tighter projected ranges.

Hovering anywhere within the cone snaps the tooltip to the nearest simulated path and displays the projected price at that specific week.

The primary Monte Carlo engine used for the card-level summary statistics runs 2,000 iterations and returns the 10th percentile (Bear Case), 50th percentile (Base Case / Median), and 90th percentile (Bull Case) terminal prices.

### Extended Quant Metrics Grid (Detail Modal)

In addition to the seven charts, the detail modal displays:

| Metric | Description |
|---|---|
| **Treynor Ratio** | Annualized excess return per unit of market (systematic) risk. Complements Sharpe by isolating the contribution of beta to returns. |
| **Information Ratio** | Annualized excess return over SPY divided by the annualized tracking error. Measures the consistency and skill of outperformance. |
| **R-Squared** | The proportion of the stock's variance that is explained by SPY's variance. High R-squared stocks move almost entirely with the market; low R-squared stocks have significant idiosyncratic return components. |
| **CVaR (95%)** | Conditional Value at Risk — the expected loss in the worst 5% of weeks. Unlike VaR, which only gives a threshold, CVaR gives the average severity of tail losses. |
| **10-Week SMA** | Current 10-week simple moving average. Used alongside the 40-week for trend cross detection. |
| **40-Week SMA** | Current 40-week simple moving average. The primary long-term trend baseline overlaid on the price chart. |
| **Half-Kelly Size** | Mathematically optimal portfolio allocation percentage based on the stock's historical weekly win rate and win/loss magnitude ratio. |
| **Annual Alpha** | Jensen's Alpha — the return attributable to manager/stock-specific skill rather than passive market exposure. |

---

## Advanced Factor & Volatility Analytics

A second analytics layer extends the tear sheet with the volatility-modeling and factor-decomposition tools used on institutional quant desks. A **second benchmark, SOXX** (the PHLX/iShares Semiconductor index), is fetched alongside SPY so every stock can be decomposed against both the broad market *and* its own sector.

### New Detail-Modal Charts

| Chart | Description |
|---|---|
| **GARCH(1,1) Conditional Volatility + 12-Week Forecast** | A GARCH(1,1) model is fit by grid-search maximum likelihood over the return series. The chart plots the realized conditional volatility path, the forward 12-week variance forecast (which mean-reverts toward the long-run level at rate α+β), and the unconditional long-run σ. Volatility *persistence* (α+β near 1) indicates shocks decay slowly. |
| **Growth of $1 — Stock vs SPY vs SOXX** | All three series are rebased to 1.0 at the start of the trailing year, showing relative wealth creation. Reveals whether a stock is leading or lagging both the market and the semiconductor sector. |
| **Normal Q–Q Plot** | Standardized empirical return quantiles plotted against theoretical normal quantiles. Points bending below the reference line in the left tail and above it in the right tail are the signature of fat tails — quantifying the tail risk that a single volatility number hides. |
| **Monthly Return Seasonality** | A 12-cell heatmap of average weekly return bucketed by calendar month, color-graded green/red by sign and intensity. Surfaces recurring seasonal patterns in the price series. |

### New Metrics

| Metric | Description |
|---|---|
| **CAGR (1Y)** | Compound annual growth rate over the displayed window. |
| **EWMA Volatility (λ=0.94)** | Exponentially-weighted volatility per the JP Morgan RiskMetrics methodology — weights recent observations more heavily than equal-weight historical vol. |
| **GARCH Vol (now)** | Current one-step-ahead conditional volatility from the fitted GARCH(1,1) model. |
| **GARCH Persistence** | α+β. Values near 1.0 mean volatility shocks are highly persistent; flagged when above 0.95. |
| **Probabilistic Sharpe Ratio** | The probability (per López de Prado) that the *true* Sharpe ratio exceeds zero, correcting the point estimate for skewness, kurtosis, and sample length. A high raw Sharpe on short, fat-tailed data can still have a low PSR. |
| **Parametric VaR (95% / 99%)** | Variance-covariance (Gaussian) Value at Risk, complementing the historical and Cornish-Fisher VaR already computed. |
| **Sector β (SOXX)** | Single-factor beta against the semiconductor sector index. |
| **Pure Market β / Pure Sector β** | Coefficients from a two-factor OLS regression on SPY and SOXX jointly — isolating broad-market exposure from incremental sector exposure. |
| **Idiosyncratic Volatility** | Annualized standard deviation of the two-factor regression residual — the stock-specific risk not explained by market or sector factors. |
| **2-Factor R²** | Share of return variance explained jointly by the market and sector factors. |
| **Bull Beta / Bear Beta** | Asymmetric beta estimated separately on up-market and down-market weeks. A bear beta materially above the bull beta indicates the stock participates more in market declines than in rallies. |
| **β Asymmetry** | Bear β minus Bull β — a single measure of downside-capture skew. |

---

## Portfolio Optimizer — Markowitz Efficient Frontier

A universe-level tool (**⚖ OPTIMIZER**) that runs mean–variance optimization across the loaded tickers entirely in the browser. It samples **12,000 random long-only portfolios** on the return/risk simplex (Dirichlet sampling via exponential variates), annualizes returns and the covariance matrix from weekly data, and plots the resulting efficient-frontier cloud. Four reference portfolios are computed and highlighted on the frontier with full weight breakdowns:

| Portfolio | Definition |
|---|---|
| **Max Sharpe (Tangency)** | Highest risk-adjusted return — the tangency portfolio against the 4.5% risk-free rate. |
| **Min Variance** | Lowest achievable portfolio volatility. |
| **Risk Parity (Inverse-Vol)** | Weights proportional to inverse asset volatility, equalizing each asset's standalone risk contribution. |
| **Equal Weight (1/N)** | The naïve diversification benchmark. |

The optimization universe can be filtered to the full set, Tier-A only, or specific sectors (Analog, SerDes, AI/GPU, Equipment). Individual assets are overlaid as points so you can see which names sit on or inside the frontier. As with every other module, this is research tooling only — historical covariance is not a forecast of future co-movement.

---

## Covered Companies

All companies in the dashboard are publicly traded. The private/pre-IPO section present in earlier versions has been removed.

| Sector | Companies |
|---|---|
| **Foundry** | TSMC, GlobalFoundries |
| **EDA and Design IP** | Synopsys, Cadence, ARM |
| **Fab Equipment** | ASML, Applied Materials, Lam Research, KLA, Tokyo Electron |
| **Memory** | Micron, Western Digital, Samsung Electronics |
| **AI / GPU** | NVIDIA, AMD, Super Micro Computer |
| **High-Speed SerDes** | Broadcom, Marvell, Credo, Astera Labs, Rambus, MaxLinear, Parade Technologies |
| **Optical Rx/Tx** | Coherent Corp, Lumentum, MACOM |
| **Analog and Mixed-Signal** | Texas Instruments, Analog Devices, Monolithic Power, Cirrus Logic, Microchip Technology, Silicon Laboratories, onsemi, Synaptics, STMicroelectronics |
| **RF and Wireless** | Qualcomm, Skyworks Solutions, Qorvo |
| **MCU / DSP / Embedded** | NXP Semiconductors, Renesas Electronics, CEVA |
| **Power and Connectivity** | Intel, Semtech, Infineon Technologies |

---

## Setup and Deployment

### Use the live version

Visit **[nithinpuru.github.io/quant-terminal](https://nithinpuru.github.io/quant-terminal/)**. No setup required.

### Run locally

```bash
git clone https://github.com/chennakeshavadasa/career-semi-quant.git
cd career-semi-quant
npm install && npm test        # unit + browser tests
npm run serve                  # open http://localhost:8000/quant-terminal/
```

### Refresh the data manually

```bash
pip install -U -r quant-terminal/requirements.txt
python quant-terminal/update_data.py      # writes public/quant-terminal/market_data.json
```

On GitHub: **Actions → Update quant terminal data → Run workflow**.

### Optional API Keys

The dashboard needs no API keys: prices come from `market_data.json`. Optional keys (⚙ in the header) are only used for a ticker that's missing from that file:

- [Polygon.io](https://polygon.io/) — Best coverage for US equities with a generous free tier
- [Alpha Vantage](https://www.alphavantage.co/) — Strong international coverage
- [Finnhub](https://finnhub.io/) — Reliable free tier with broad ticker support

API keys are stored exclusively in the browser's `localStorage` and are never transmitted to any external service.

---

## Limitations and Disclaimers

This tool is for educational and informational purposes only. It is not financial advice.

- The Monte Carlo Simulation generates probabilistic outcomes based solely on historical price behavior. It cannot account for earnings surprises, macroeconomic shocks, regulatory changes, or structural breaks in the time series.
- The Composite Quant Score is a heuristic signal, not a trading recommendation. It is designed to surface stocks worth deeper investigation, not to direct buy or sell decisions.
- All computation uses weekly closing prices. Intraday volatility, options market data, and fundamental metrics (P/E, DCF, revenue growth) are outside the scope of this tool.
- Prices are weekly closes refreshed twice a day, not real-time quotes. The header shows how fresh the data is, and a banner warns if the scheduled sync has stopped.
- Past volatility and past returns are not reliable predictors of future performance.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Application structure** | Single `index.html` file — zero build step, zero dependencies to install |
| **Styling** | `public/quant-terminal/css/terminal.css`: one design system using nithinpuru.github.io's tokens (paper / ink / rule / accent) with light and dark themes. The theme choice is shared with the portfolio site via `localStorage.theme`. |
| **Typography** | Computer Modern (LaTeX), bundled in `public/quant-terminal/fonts/`: KaTeX_Main for text and KaTeX_Typewriter for numbers and labels, the same faces as the portfolio. |
| **Quantitative math engine** | Pure JavaScript — RSI, Stochastic, MACD, Bollinger Bands, Sharpe, Sortino, Calmar, VaR, CVaR, Parametric & Cornish-Fisher VaR, Max Drawdown, Beta, Alpha, R-Squared, Treynor, Information Ratio, Kelly Criterion, Fibonacci, GBM Monte Carlo, EWMA & GARCH(1,1) volatility, Probabilistic Sharpe, two-factor (SPY+SOXX) regression, asymmetric beta, Markowitz frontier optimization |
| **Dashboard sparklines** | Inline SVG with gradient fills and area charts |
| **Detail modal charts** | [Chart.js](https://www.chartjs.org/) — 7 interactive canvas-based plots with custom tooltips |
| **Data sources** | Yahoo Finance via `yfinance` in a scheduled GitHub Action → `market_data.json`; optional Polygon.io, Alpha Vantage and Finnhub keys as fallbacks |
| **Hosting** | GitHub Pages |

---

## Repository Structure

While the main application is entirely contained within `index.html`, this repository also includes a comprehensive mathematical documentation suite:

- `index.html`: The core application and all quantitative logic.
- `DOCUMENTATION.md`: A highly visual, beginner-friendly masterclass explaining the math behind the terminal.
- `scripts/`: Python scripts that generate the intuitive data visualizations used in the documentation.
- `plots/`: The output PNG files generated by the scripts.

## Contributing

Test the app locally (see *Run locally* above) before pushing.

When contributing to the **documentation**:
1. Run the scripts in the `scripts/` folder using Python 3 and matplotlib (`python3 scripts/generate_*.py`).
2. Update the markdown in `DOCUMENTATION.md`.

When contributing to the **application**:
1. All core logic changes happen in `public/quant-terminal/index.html`.

When adding companies, use the `COS` array in the data section of `public/quant-terminal/index.html`. All entries require a valid public ticker symbol. Private or pre-IPO companies should not be added as the system requires real market price data.

When modifying quantitative indicators, ensure that changes to calculation functions are reflected consistently across both the card-level summary and the detail modal chart logic.

---

## License

This project is licensed under the **MIT License**.

Copyright (c) 2025 Nithin P

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

See the full license text in [LICENSE](./LICENSE).
