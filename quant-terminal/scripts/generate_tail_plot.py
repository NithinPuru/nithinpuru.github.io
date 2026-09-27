import numpy as np
import matplotlib.pyplot as plt
import scipy.stats as stats
import os

os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)
plt.style.use('dark_background')

# Generate a slightly skewed distribution (like a tech stock with massive upside)
np.random.seed(42)
data = stats.skewnorm.rvs(a=2, loc=-1, scale=4, size=10000)

p5 = np.percentile(data, 5)   # 5th percentile (Worst 5%)
p95 = np.percentile(data, 95) # 95th percentile (Best 5%)

fig, ax = plt.subplots(figsize=(10, 5))

# Plot the histogram
n, bins, patches = ax.hist(data, bins=60, density=True, color='white', alpha=0.3)

# Color the tails
for i in range(len(patches)):
    if bins[i] < p5:
        patches[i].set_facecolor('#f85149')
        patches[i].set_alpha(0.8)
    elif bins[i] > p95:
        patches[i].set_facecolor('#3fb950')
        patches[i].set_alpha(0.8)

# Add vertical lines for the percentiles
ax.axvline(p5, color='#f85149', linestyle='--', linewidth=2)
ax.axvline(p95, color='#3fb950', linestyle='--', linewidth=2)

# Calculate ratio for the title
ratio = abs(p95) / abs(p5)

ax.set_title(f'Tail Ratio Visualized (Ratio = {ratio:.2f})', fontsize=16, pad=20)
ax.set_xlabel('Weekly Return %')
ax.set_ylabel('Frequency')

# Annotations
ax.annotate(f'Worst 5%\n(Average Crash: {p5:.1f}%)', xy=(p5, 0.02), xytext=(p5-4, 0.05),
            arrowprops=dict(facecolor='#f85149', shrink=0.05, width=1, headwidth=6),
            color='#f85149', ha='center', fontsize=10, fontweight='bold')

ax.annotate(f'Best 5%\n(Average Jump: {p95:.1f}%)', xy=(p95, 0.02), xytext=(p95+4, 0.05),
            arrowprops=dict(facecolor='#3fb950', shrink=0.05, width=1, headwidth=6),
            color='#3fb950', ha='center', fontsize=10, fontweight='bold')

# Middle text
ax.text(np.mean(data), max(n)*0.8, 'Are the extreme winning weeks\nBIGGER than the extreme losing weeks?', 
        ha='center', va='center', color='white', fontsize=12, bbox=dict(facecolor='black', alpha=0.5, edgecolor='none'))

ax.set_yticks([])
ax.grid(alpha=0.1)

plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/tail_ratio.png', bbox_inches='tight', dpi=150)
plt.close()

print("Tail ratio plot generated successfully!")
