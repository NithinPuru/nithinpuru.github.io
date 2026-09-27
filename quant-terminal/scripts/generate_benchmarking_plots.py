import numpy as np
import matplotlib.pyplot as plt
import os

os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)
plt.style.use('dark_background')

# 1. Beta Plot
fig, ax = plt.subplots(figsize=(8, 4))
weeks = np.arange(10)
market = np.sin(weeks)
stock_beta2 = 2 * np.sin(weeks)
ax.plot(weeks, market, label='Market (S&P 500)', color='#e3b341', linewidth=2)
ax.plot(weeks, stock_beta2, label='High Beta Stock (β = 2.0)', color='#f85149', linewidth=2, linestyle='--')
ax.set_title('Beta: The Market Amplifier', fontsize=14)
ax.legend()
ax.grid(alpha=0.1)
ax.set_xticks([])
ax.set_yticks([])
plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/beta.png', dpi=150)
plt.close()

# 2. Alpha Plot
fig, ax = plt.subplots(figsize=(8, 4))
months = np.arange(12)
market_return = np.linspace(0, 10, 12)
expected_return = np.linspace(0, 15, 12) # Based on risk
actual_return = np.linspace(0, 25, 12) + np.random.normal(0, 1, 12)
ax.plot(months, expected_return, label='Expected Return (Based on Risk/Beta)', color='gray', linestyle='--')
ax.plot(months, actual_return, label='Actual Return', color='#3fb950', linewidth=2)
ax.fill_between(months, expected_return, actual_return, color='#3fb950', alpha=0.3, label='Alpha (Genuine Skill/Bonus)')
ax.set_title('Alpha: The Skill Bonus', fontsize=14)
ax.legend()
ax.grid(alpha=0.1)
ax.set_xticks([])
ax.set_yticks([])
plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/alpha.png', dpi=150)
plt.close()

# 3. R-Squared Plot
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))
market_r = np.random.normal(0, 1, 100)
# High R2
stock_high_r2 = 1.5 * market_r + np.random.normal(0, 0.2, 100)
ax1.scatter(market_r, stock_high_r2, color='#3fb950', alpha=0.6)
m, b = np.polyfit(market_r, stock_high_r2, 1)
ax1.plot(market_r, m*market_r + b, color='white', linestyle='--')
ax1.set_title('High R² (> 0.8)\n"Puppet of the Market"', fontsize=12)
ax1.set_xlabel('Market Return')
ax1.set_ylabel('Stock Return')
ax1.set_xticks([])
ax1.set_yticks([])
# Low R2
stock_low_r2 = 0.5 * market_r + np.random.normal(0, 2, 100)
ax2.scatter(market_r, stock_low_r2, color='#e3b341', alpha=0.6)
ax2.set_title('Low R² (< 0.4)\n"Independent Story"', fontsize=12)
ax2.set_xlabel('Market Return')
ax2.set_xticks([])
ax2.set_yticks([])
plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/r_squared.png', dpi=150)
plt.close()

# 4. Treynor Plot
fig, ax = plt.subplots(figsize=(8, 4))
categories = ['Sharpe Ratio\n(Punishes ALL Volatility)', 'Treynor Ratio\n(Punishes ONLY Beta Risk)']
values = [1.2, 2.5]
bars = ax.bar(categories, values, color=['#a78bfa', '#3fb950'], alpha=0.8)
ax.set_title('Treynor: Forgiving Company-Specific Volatility', fontsize=14)
ax.set_yticks([])
plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/treynor.png', dpi=150)
plt.close()

# 5. Information Ratio Plot
fig, ax = plt.subplots(figsize=(10, 4))
weeks = np.arange(50)
# Lucky stock: mostly flat but one massive lucky jump
lucky = np.zeros(50)
lucky[25] = 20
# Consistent stock: steadily beats by 0.5 every week
consistent = np.ones(50) * 0.5
ax.bar(weeks, lucky, color='#f85149', alpha=0.6, label='Lucky Stock (High Volatility, Low IR)')
ax.bar(weeks, consistent, color='#3fb950', alpha=0.9, label='Consistent Winner (Low Volatility, High IR)')
ax.set_title('Information Ratio (IR): Rewarding Consistency over Blind Luck', fontsize=14)
ax.legend()
ax.set_xticks([])
ax.set_yticks([])
plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/information_ratio.png', dpi=150)
plt.close()

# 6. Tracking Error Plot
fig, ax = plt.subplots(figsize=(8, 4))
time = np.arange(30)
market_path = np.cumsum(np.random.normal(0, 1, 30))
stock_path = market_path + np.random.normal(0, 2, 30)
ax.plot(time, market_path, color='#e3b341', linewidth=2, label='S&P 500 Path')
ax.plot(time, stock_path, color='#58a6ff', linewidth=2, label='Stock Path')
ax.fill_between(time, market_path, stock_path, color='white', alpha=0.2, label='Tracking Error (Wandering off path)')
ax.set_title('Tracking Error: How far do you wander from the index?', fontsize=14)
ax.legend()
ax.set_xticks([])
ax.set_yticks([])
plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/tracking_error.png', dpi=150)
plt.close()

print("All 6 benchmarking plots generated successfully!")
