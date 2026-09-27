import numpy as np
import matplotlib.pyplot as plt
import os

os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)
plt.style.use('dark_background')

# -----------------
# 1. Quant Score
# -----------------
fig, ax = plt.subplots(figsize=(10, 2))
ax.barh(0, 100, color='#30363d', height=0.5)
ax.barh(0, 35, color='#f85149', height=0.5) # Red zone
ax.barh(0, 35, left=35, color='#8b949e', height=0.5) # Grey zone
ax.barh(0, 30, left=70, color='#3fb950', height=0.5) # Green zone

score = 82
ax.plot(score, 0, marker='v', color='white', markersize=15)
ax.text(score, 0.3, f'{score}/100\n(Strong Buy)', color='white', ha='center', fontweight='bold')

ax.text(17.5, -0.3, 'SELL (0-35)', color='#f85149', ha='center', fontweight='bold')
ax.text(52.5, -0.3, 'HOLD (36-69)', color='#8b949e', ha='center', fontweight='bold')
ax.text(85, -0.3, 'BUY (70-100)', color='#3fb950', ha='center', fontweight='bold')

ax.set_xlim(0, 100)
ax.set_ylim(-0.8, 0.8)
ax.axis('off')
ax.set_title('Proprietary Quant Score', fontsize=14)
plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/quant_score.png', dpi=150)
plt.close()

# -----------------
# 2. Sharpe Ratio
# -----------------
fig, ax = plt.subplots(figsize=(8, 4))
weeks = np.arange(52)
stock_A = np.linspace(100, 120, 52) + np.random.normal(0, 0.5, 52)
stock_B = np.linspace(100, 120, 52) + np.random.normal(0, 10, 52)

ax.plot(weeks, stock_B, color='#f85149', label='Stock B (High Stress, Sharpe < 0.5)', alpha=0.8)
ax.plot(weeks, stock_A, color='#3fb950', label='Stock A (Smooth Sailing, Sharpe > 1.5)', linewidth=3)

ax.set_title('Sharpe Ratio: Is the juice worth the squeeze?', fontsize=14)
ax.set_ylabel('Portfolio Value')
ax.legend()
ax.grid(alpha=0.1)
ax.set_xticks([])
plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/sharpe_ratio.png', dpi=150)
plt.close()

# -----------------
# 3. Annual Volatility
# -----------------
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4), sharey=True)
days = np.arange(100)
low_vol = np.cumsum(np.random.normal(0.05, 0.5, 100)) + 100
high_vol = np.cumsum(np.random.normal(0.05, 3.0, 100)) + 100

ax1.plot(days, low_vol, color='#3fb950', linewidth=2)
ax1.fill_between(days, low_vol.min()-5, low_vol.max()+5, color='#3fb950', alpha=0.1)
ax1.set_title('Low Volatility (e.g. 15%)\nSleep well at night', fontsize=12)
ax1.grid(alpha=0.1)
ax1.set_xticks([])

ax2.plot(days, high_vol, color='#f85149', linewidth=2)
ax2.fill_between(days, high_vol.min()-5, high_vol.max()+5, color='#f85149', alpha=0.1)
ax2.set_title('High Volatility (e.g. 60%)\nMassive emotional swings', fontsize=12)
ax2.grid(alpha=0.1)
ax2.set_xticks([])

plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/annual_volatility.png', dpi=150)
plt.close()

# -----------------
# 4. Fibonacci Support
# -----------------
fig, ax = plt.subplots(figsize=(8, 5))
days = np.arange(50)
price = np.concatenate([
    np.linspace(100, 200, 25) + np.random.normal(0, 2, 25), # Swing up
    np.linspace(200, 138, 25) + np.random.normal(0, 2, 25)  # Pullback exactly to 61.8%
])

ax.plot(days, price, color='#58a6ff', linewidth=2)
high = 200
low = 100
diff = high - low

# Fibonacci Levels
levels = {
    '0.0% (High)': high,
    '23.6%': high - diff * 0.236,
    '38.2%': high - diff * 0.382,
    '50.0%': high - diff * 0.5,
    '61.8% (Golden Ratio Support)': high - diff * 0.618,
    '100.0% (Low)': low
}

for name, val in levels.items():
    color = '#e3b341' if '61.8' in name else 'white'
    alpha = 1.0 if '61.8' in name else 0.3
    linewidth = 2 if '61.8' in name else 1
    ax.axhline(val, color=color, alpha=alpha, linestyle='--', linewidth=linewidth)
    ax.text(0, val + 2, name, color=color, alpha=alpha, fontweight='bold' if '61.8' in name else 'normal')

ax.scatter([45], [138], color='#3fb950', s=200, zorder=5) # Highlight the bounce
ax.annotate('Traders expect a bounce here', xy=(45, 138), xytext=(25, 120),
            arrowprops=dict(facecolor='#3fb950', shrink=0.05), color='#3fb950', fontweight='bold')

ax.set_title('Fibonacci Retracement (61.8% Golden Support)', fontsize=14)
ax.axis('off')
plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/fibonacci.png', dpi=150)
plt.close()

# -----------------
# 5. Monte Carlo Scenarios
# -----------------
fig, ax = plt.subplots(figsize=(10, 5))
days = np.arange(126) # ~6 months trading days
n_sims = 50

final_prices = []
for _ in range(n_sims):
    path = 100 * np.exp(np.cumsum(np.random.normal(0.0005, 0.02, 126)))
    final_prices.append(path[-1])
    ax.plot(days, path, color='white', alpha=0.05)

# Calculate percentiles
p10 = np.percentile(final_prices, 10)
p50 = np.percentile(final_prices, 50)
p90 = np.percentile(final_prices, 90)

# Plot representative lines
median_path = 100 * np.exp(np.linspace(0, np.log(p50/100), 126))
bull_path = 100 * np.exp(np.linspace(0, np.log(p90/100), 126))
bear_path = 100 * np.exp(np.linspace(0, np.log(p10/100), 126))

ax.plot(days, bull_path, color='#3fb950', linewidth=3, label=f'Bull 90% (Optimistic)')
ax.plot(days, median_path, color='#58a6ff', linewidth=3, label=f'Median 50% (Most Likely)')
ax.plot(days, bear_path, color='#f85149', linewidth=3, label=f'Bear 10% (Pessimistic)')

# Annotations
ax.text(128, p90, f'Bullish Top 10%\n${p90:.0f}', color='#3fb950', va='center')
ax.text(128, p50, f'Median Prediction\n${p50:.0f}', color='#58a6ff', va='center')
ax.text(128, p10, f'Bearish Bottom 10%\n${p10:.0f}', color='#f85149', va='center')

ax.set_title('Monte Carlo: Simulating 2,000 Potential Futures', fontsize=14)
ax.set_ylabel('Predicted Stock Price')
ax.set_xlabel('Trading Days (6 Months)')
ax.legend(loc='upper left')
ax.set_xlim(0, 145) # Make room for text
ax.grid(alpha=0.1)

plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/monte_carlo.png', dpi=150)
plt.close()

print("All 5 plots for Section 7 generated successfully!")
