import numpy as np
import matplotlib.pyplot as plt
import os
import scipy.stats as stats

os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)
plt.style.use('dark_background')

# Helper to save
def save_plot(name):
    plt.tight_layout()
    plt.savefig(f'/home/nithin/quant-terminal/plots/{name}', dpi=150)
    plt.close()

# --- Section 8 Plots ---

# 1. Chart 2: Underwater Drawdown
fig, ax = plt.subplots(figsize=(8, 4))
days = np.arange(100)
price = np.cumsum(np.random.normal(0, 1, 100)) + 100
peaks = np.maximum.accumulate(price)
drawdown = (price - peaks) / peaks * 100
ax.fill_between(days, drawdown, 0, color='#f85149', alpha=0.8)
ax.set_title('Chart 2: Underwater Drawdown\n"How deep is the water?"', fontsize=14)
ax.set_ylabel('Drawdown %')
ax.grid(alpha=0.1)
save_plot('chart2_drawdown.png')

# 2. Chart 3: Weekly Returns Dist
fig, ax = plt.subplots(figsize=(8, 4))
returns = np.random.laplace(0, 2, 1000) # Fat tails
n, bins, patches = ax.hist(returns, bins=50, density=True, color='#58a6ff', alpha=0.6, label='Actual Returns')
x = np.linspace(-10, 10, 100)
ax.plot(x, stats.norm.pdf(x, 0, np.std(returns)), color='#e3b341', linewidth=2, label='Perfect Bell Curve')
ax.set_title('Chart 3: Returns Distribution\n"Spotting the Fat Tails"', fontsize=14)
ax.legend()
save_plot('chart3_dist.png')

# 3. Chart 4: Rolling Volatility
fig, ax = plt.subplots(figsize=(8, 4))
vol = np.sin(np.linspace(0, 10, 100)) * 20 + 40
ax.plot(vol, color='#f85149', linewidth=2)
ax.axhline(np.mean(vol), color='white', linestyle='--', label='Average Vol')
ax.set_title('Chart 4: 26-Week Rolling Volatility\n"When do things get crazy?"', fontsize=14)
save_plot('chart4_rollvol.png')

# 4. Chart 5: Rolling Beta
fig, ax = plt.subplots(figsize=(8, 4))
beta = np.cos(np.linspace(0, 10, 100)) * 0.5 + 1.2
ax.plot(beta, color='#3fb950', linewidth=2)
ax.axhline(1.0, color='gray', linestyle='--', label='Market Beta (1.0)')
ax.set_title('Chart 5: 26-Week Rolling Beta\n"Beta is not constant!"', fontsize=14)
save_plot('chart5_rollbeta.png')

# 5. Chart 6: Rolling Sharpe
fig, ax = plt.subplots(figsize=(8, 4))
sharpe = np.sin(np.linspace(0, 5, 100)) + 1
ax.plot(sharpe, color='#a78bfa', linewidth=2)
ax.axhline(1.0, color='white', linestyle='--', label='Good Sharpe (>1.0)')
ax.set_title('Chart 6: 26-Week Rolling Sharpe Ratio\n"When was the juice worth the squeeze?"', fontsize=14)
save_plot('chart6_rollsharpe.png')

# 6. Chart 7: Merton MC
fig, ax = plt.subplots(figsize=(8, 4))
for _ in range(15):
    ax.plot(np.cumsum(np.random.normal(0, 1, 50)) + 100, color='white', alpha=0.3)
ax.set_title('Chart 7: 15 Future Price Paths\n"Doctor Strange Simulator"', fontsize=14)
save_plot('chart7_merton.png')

# 7. Chart 8: Rolling Correlation
fig, ax = plt.subplots(figsize=(8, 4))
corr = 1 - np.exp(-np.linspace(0, 5, 100))
ax.plot(corr, color='#e3b341', linewidth=2)
ax.set_title('Chart 8: Rolling Correlation vs SPY\n"Correlations go to 1 during crashes"', fontsize=14)
save_plot('chart8_rollcorr.png')

# 8. Chart 9: VaR Stress Test
fig, ax = plt.subplots(figsize=(8, 4))
methods = ['Parametric', 'Historical', 'Monte Carlo', 'Cornish-Fisher', 'Extreme Value']
var = [-5, -6, -5.5, -8, -12]
colors = ['#58a6ff', '#58a6ff', '#58a6ff', '#e3b341', '#f85149']
ax.bar(methods, var, color=colors)
ax.set_title('Chart 9: VaR Stress Test\n"Different Math = Different Danger"', fontsize=14)
save_plot('chart9_varstress.png')


# --- Section 9 Plots ---

# 9.1 Calmar Ratio
fig, ax = plt.subplots(figsize=(8, 4))
ax.bar(['Annual Return (Reward)', 'Max Drawdown (Pain)'], [25, -50], color=['#3fb950', '#f85149'])
ax.set_title('Calmar Ratio = Reward ÷ Max Pain', fontsize=14)
save_plot('calmar_ratio.png')

# 9.2 ATR
fig, ax = plt.subplots(figsize=(8, 4))
candles = np.random.uniform(5, 15, 20)
ax.bar(np.arange(20), candles, color='#a78bfa')
ax.axhline(10, color='white', linestyle='--', label='Average Swing (ATR)')
ax.set_title('ATR %: The Average Weekly Swing Size', fontsize=14)
save_plot('atr_percent.png')

# 9.4 Kelly
fig, ax = plt.subplots(figsize=(8, 4))
win_rates = np.linspace(0.4, 0.8, 100)
kelly = win_rates - ((1-win_rates)/2)
ax.plot(win_rates, kelly*100, color='#3fb950', linewidth=2)
ax.set_title('Kelly Criterion\n"How much of your portfolio should you bet?"', fontsize=14)
ax.set_xlabel('Win Rate')
ax.set_ylabel('Recommended Bet Size %')
save_plot('kelly_criterion.png')

# 9.6 Gain to Pain
fig, ax = plt.subplots(figsize=(8, 4))
ax.bar(['Total Gain Pile', 'Total Pain Pile'], [150, 50], color=['#3fb950', '#f85149'])
ax.set_title('Gain-to-Pain Ratio: 3.0', fontsize=14)
save_plot('gain_pain.png')

# 9.8 Recovery Factor
fig, ax = plt.subplots(figsize=(8, 4))
ax.bar(['Total Return Made', 'Deepest Crash Endured'], [300, -40], color=['#3fb950', '#f85149'])
ax.set_title('Recovery Factor: Did the long-term gains justify the crash?', fontsize=14)
save_plot('recovery_factor.png')

# 9.10 Momentum
fig, ax = plt.subplots(figsize=(8, 4))
months = np.arange(12)
price = np.cumsum(np.random.normal(1, 1, 12)) + 10
ax.plot(months, price, color='white', marker='o')
ax.axvspan(0, 10, color='#3fb950', alpha=0.2, label='11 Months of Trend')
ax.axvspan(10, 11, color='#f85149', alpha=0.2, label='Skip Last Month (Noise)')
ax.set_title('Fama-French 12-1 Momentum', fontsize=14)
ax.legend()
save_plot('momentum_factor.png')

# 9.12 Duration
fig, ax = plt.subplots(figsize=(8, 4))
time = np.arange(50)
p = np.ones(50)*100
p[10:40] = 80
ax.plot(time, p, color='white')
ax.axvspan(10, 40, color='#f85149', alpha=0.3)
ax.set_title('Drawdown DURATION\n"How long was your money trapped underwater?"', fontsize=14)
save_plot('drawdown_duration.png')

# 9.13 Hist VaR
fig, ax = plt.subplots(figsize=(8, 4))
x = [-5, -8, -15]
ax.bar(['90% Safe', '95% Safe', '99% Safe'], x, color=['#e3b341', '#f85149', '#8b0000'])
ax.set_title('Historical VaR: Real Crashes from History', fontsize=14)
save_plot('historical_var.png')

print("All 16 plots for Sections 8 and 9 generated successfully!")
