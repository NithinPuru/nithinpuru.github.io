import numpy as np
import matplotlib.pyplot as plt
import os

os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)
plt.style.use('dark_background')
np.random.seed(42)

n = 100
# Zero Autocorrelation (Random)
x_zero = np.random.normal(0, 1, n)
y_zero = np.random.normal(0, 1, n)

# Positive Autocorrelation (Momentum)
x_pos = np.random.normal(0, 1, n)
y_pos = 0.7 * x_pos + np.random.normal(0, 0.7, n)

# Negative Autocorrelation (Reversal)
x_neg = np.random.normal(0, 1, n)
y_neg = -0.7 * x_neg + np.random.normal(0, 0.7, n)

fig, axes = plt.subplots(1, 3, figsize=(15, 4))

def plot_scatter(ax, x, y, title, color, desc):
    ax.scatter(x, y, color=color, alpha=0.6)
    # Fit line
    m, b = np.polyfit(x, y, 1)
    ax.plot(x, m*x + b, color='white', linewidth=2, linestyle='--')
    ax.set_title(title, fontsize=12)
    ax.set_xlabel("Last Week's Return %")
    ax.set_ylabel("This Week's Return %")
    ax.axhline(0, color='gray', linewidth=0.5)
    ax.axvline(0, color='gray', linewidth=0.5)
    ax.grid(alpha=0.1)
    ax.text(0.5, 0.95, desc, transform=ax.transAxes, ha='center', va='top', 
            color='white', bbox=dict(facecolor='black', alpha=0.5, edgecolor='none'))

plot_scatter(axes[0], x_pos, y_pos, 'Positive Autocorrelation (> 0)\n"The Trend Follower"', '#3fb950', 'An UP week predicts\nanother UP week')
plot_scatter(axes[1], x_zero, y_zero, 'Zero Autocorrelation (≈ 0)\n"The Coin Flip"', '#e3b341', 'Last week predicts\nABSOLUTELY NOTHING')
plot_scatter(axes[2], x_neg, y_neg, 'Negative Autocorrelation (< 0)\n"The Rubber Band"', '#f85149', 'An UP week predicts\na DOWN week')

plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/autocorrelation.png', bbox_inches='tight', dpi=150)
plt.close()
print("Autocorrelation plot generated successfully!")
