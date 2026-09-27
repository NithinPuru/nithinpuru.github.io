import numpy as np
import matplotlib.pyplot as plt
import os

os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)
plt.style.use('dark_background')

weeks = np.arange(100)
# Both stocks start at 100, drop to 80.
# Stock A recovers immediately.
stock_A = np.ones(100) * 100
stock_A[20:25] = np.linspace(100, 80, 5)
stock_A[25:30] = np.linspace(80, 100, 5)

# Stock B drops and stays down for a long time.
stock_B = np.ones(100) * 100
stock_B[20:25] = np.linspace(100, 80, 5)
stock_B[25:80] = 80 + np.random.normal(0, 1, 55)
stock_B[80:90] = np.linspace(80, 100, 10)

# Calculate drawdowns
dd_A = (stock_A - 100) / 100 * 100
dd_B = (stock_B - 100) / 100 * 100

fig, axes = plt.subplots(2, 1, figsize=(10, 8), sharex=True)

axes[0].plot(weeks, stock_A, color='#3fb950', linewidth=2, label='Stock A')
axes[0].plot(weeks, stock_B, color='#f85149', linewidth=2, label='Stock B')
axes[0].set_title('Price Comparison: Max Drawdown is identical (-20%)', fontsize=14)
axes[0].legend()
axes[0].grid(alpha=0.1)
axes[0].set_ylabel('Stock Price')

axes[1].fill_between(weeks, dd_A, 0, color='#3fb950', alpha=0.3, label='Brief Pain (Low Ulcer Index)')
axes[1].fill_between(weeks, dd_B, 0, color='#f85149', alpha=0.5, label='Chronic Pain (High Ulcer Index)')
axes[1].plot(weeks, dd_A, color='#3fb950', linewidth=2)
axes[1].plot(weeks, dd_B, color='#f85149', linewidth=2)
axes[1].set_title('The Ulcer Index Visualized: Area of Pain (Depth × Duration)', fontsize=14)
axes[1].set_xlabel('Weeks')
axes[1].set_ylabel('Drawdown %')
axes[1].legend()
axes[1].grid(alpha=0.1)

plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/ulcer_index.png', bbox_inches='tight', dpi=150)
plt.close()
print("Ulcer Index plot generated successfully!")
