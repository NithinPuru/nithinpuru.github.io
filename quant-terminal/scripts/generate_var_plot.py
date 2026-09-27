import numpy as np
import matplotlib.pyplot as plt
import scipy.stats as stats
import os

os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)
plt.style.use('dark_background')

# Parameters for normal distribution (mean=0, std=3)
mu = 0
sigma = 3
x = np.linspace(mu - 4*sigma, mu + 4*sigma, 1000)
y = stats.norm.pdf(x, mu, sigma)

fig, ax = plt.subplots(figsize=(10, 5))

# Plot the full bell curve
ax.plot(x, y, color='white', linewidth=2)

# Calculate VaR 95% cutoff (z-score = -1.645)
cutoff = stats.norm.ppf(0.05, mu, sigma)

# Shade the "Safe Zone" (95%)
x_safe = np.linspace(cutoff, mu + 4*sigma, 800)
y_safe = stats.norm.pdf(x_safe, mu, sigma)
ax.fill_between(x_safe, y_safe, color='#3fb950', alpha=0.5, label='95% Safe Zone (Normal Weeks)')

# Shade the "Danger Zone" (Worst 5%)
x_danger = np.linspace(mu - 4*sigma, cutoff, 200)
y_danger = stats.norm.pdf(x_danger, mu, sigma)
ax.fill_between(x_danger, y_danger, color='#f85149', alpha=0.8, label='Worst 5% of Weeks')

# Add the VaR line
ax.axvline(cutoff, color='white', linestyle='--', linewidth=2)

ax.set_title('Value at Risk (VaR 95%) Visualized on a Bell Curve', fontsize=16, pad=20)
ax.set_xlabel('Weekly Return %')
ax.set_ylabel('Probability')

# Add annotations
ax.annotate('VaR 95% Cutoff\n(e.g., -8%)', xy=(cutoff, 0.02), xytext=(cutoff-6, 0.05),
            arrowprops=dict(facecolor='white', shrink=0.05, width=1, headwidth=6),
            color='white', ha='center', fontsize=12, fontweight='bold')

ax.annotate('The "Fat Tail" Danger:\nStandard VaR assumes this red\narea shrinks to zero. In reality,\nmajor crashes happen way over here!', 
            xy=(cutoff-3, 0.005), xytext=(cutoff-5, 0.08),
            arrowprops=dict(facecolor='#f85149', shrink=0.05, width=1, headwidth=6),
            color='#f85149', ha='center', fontsize=10)

ax.set_yticks([])
ax.legend(loc='upper right')
ax.grid(alpha=0.1)

plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/var_95.png', bbox_inches='tight', dpi=150)
plt.close()

print("VaR 95% plot generated successfully!")
