import numpy as np
import matplotlib.pyplot as plt
import os

os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)
plt.style.use('dark_background')

# -----------------
# 10. Risk Map
# -----------------
fig, ax = plt.subplots(figsize=(8, 6))
# Volatility (X), Return (Y), Size (Market Cap)
vol = [20, 35, 60, 45, 15, 80]
ret = [10, 25, 80, -20, 5, -40]
size = [1000, 500, 800, 300, 1500, 200]
labels = ['AAPL', 'MSFT', 'NVDA', 'INTC', 'JNJ', 'COIN']
colors = ['#3fb950', '#3fb950', '#3fb950', '#f85149', '#3fb950', '#f85149']

ax.scatter(vol, ret, s=size, c=colors, alpha=0.6, edgecolors='white')
for i, txt in enumerate(labels):
    ax.annotate(txt, (vol[i], ret[i]), ha='center', va='center', fontweight='bold')

ax.axhline(0, color='white', linestyle='--', alpha=0.5)
ax.axvline(30, color='white', linestyle='--', alpha=0.5)

ax.set_title('Universe Risk Map\n"Where does your portfolio live?"', fontsize=14)
ax.set_xlabel('Annual Volatility (Risk / Bounciness %)')
ax.set_ylabel('1-Year Return (Reward %)')

# Quadrant labels
ax.text(10, 60, 'High Reward\nLow Risk\n(The Dream)', color='#3fb950', alpha=0.5)
ax.text(70, 60, 'High Reward\nHigh Risk\n(The Casino)', color='#e3b341', alpha=0.5)
ax.text(10, -30, 'Low Reward\nLow Risk\n(Boring)', color='white', alpha=0.5)
ax.text(70, -30, 'Low Reward\nHigh Risk\n(The Nightmare)', color='#f85149', alpha=0.5)

plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/risk_map.png', dpi=150)
plt.close()

# -----------------
# 11. Correlation Heatmap
# -----------------
fig, ax = plt.subplots(figsize=(6, 5))
data = np.array([
    [1.00, 0.85, 0.70, 0.10],
    [0.85, 1.00, 0.65, 0.15],
    [0.70, 0.65, 1.00, -0.05],
    [0.10, 0.15, -0.05, 1.00]
])
labels = ['NVDA', 'AMD', 'MSFT', 'GOLD']
cax = ax.matshow(data, cmap='Blues')
for i in range(4):
    for j in range(4):
        ax.text(j, i, f'{data[i, j]:.2f}', ha='center', va='center', color='black' if data[i,j] < 0.5 else 'white')
ax.set_xticks(np.arange(4))
ax.set_yticks(np.arange(4))
ax.set_xticklabels(labels)
ax.set_yticklabels(labels)
ax.set_title('Correlation Heatmap\n"If one crashes, do the others?"', fontsize=14, pad=20)
plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/correlation_heatmap.png', dpi=150)
plt.close()

# -----------------
# 12. Merton Jump Diffusion
# -----------------
fig, ax = plt.subplots(figsize=(10, 5))
days = np.arange(100)
# Standard diffusion (smooth random walk)
path = 100 * np.exp(np.cumsum(np.random.normal(0.001, 0.01, 100)))
# Add jumps
path[30:] = path[30:] * 0.85 # Massive 15% crash at day 30 (earnings miss)
path[70:] = path[70:] * 1.10 # Massive 10% jump at day 70 (good news)

ax.plot(days, path, color='#58a6ff', linewidth=2)
ax.scatter([30], [path[30]], color='#f85149', s=100, zorder=5)
ax.annotate('The "Jump"\n(Sudden 15% Earnings Crash)', xy=(30, path[30]), xytext=(10, path[30]-15),
            arrowprops=dict(facecolor='#f85149', shrink=0.05), color='#f85149', fontweight='bold')

ax.scatter([70], [path[70]], color='#3fb950', s=100, zorder=5)
ax.annotate('The "Jump"\n(Sudden 10% Surprise)', xy=(70, path[70]), xytext=(45, path[70]+15),
            arrowprops=dict(facecolor='#3fb950', shrink=0.05), color='#3fb950', fontweight='bold')

ax.text(10, 105, 'Normal "Diffusion"\n(Standard daily bouncing)', color='white')

ax.set_title('Merton Jump-Diffusion Model\n"Because markets don\'t only move smoothly"', fontsize=14)
ax.grid(alpha=0.1)
ax.set_xticks([])

plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/merton_jump.png', dpi=150)
plt.close()

print("Plots for Sections 10, 11, and 12 generated successfully!")
