import matplotlib.pyplot as plt
import os

os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)
plt.style.use('dark_background')

# Create a quadrant scatter plot for Capture Ratios
stocks = {
    'NVDA (Volatile)': (1.60, 1.35, '#a78bfa'),
    'TSMC (Ideal)': (1.10, 0.85, '#3fb950'),
    'INTC (Worst)': (0.60, 1.25, '#f85149'),
    'COHR (Defensive)': (0.80, 0.65, '#e3b341')
}

fig, ax = plt.subplots(figsize=(8, 8))

# Draw quadrant lines at 1.0 (100% capture of market)
ax.axhline(y=1.0, color='white', linestyle='--', alpha=0.5)
ax.axvline(x=1.0, color='white', linestyle='--', alpha=0.5)

# Plot points
for name, (up, down, color) in stocks.items():
    ax.scatter(up, down, color=color, s=200, edgecolors='white', zorder=5)
    ax.annotate(name, (up, down), xytext=(10, 10), textcoords='offset points', color='white', fontsize=12)

# Quadrant labels
ax.text(1.35, 1.45, 'Quadrant 1: VOLATILE\n(Wins big, loses big)', color='white', alpha=0.7, ha='center', va='center')
ax.text(1.35, 0.55, 'Quadrant 2: IDEAL\n(Wins big, loses small)', color='#3fb950', fontweight='bold', ha='center', va='center')
ax.text(0.65, 0.55, 'Quadrant 3: DEFENSIVE\n(Wins small, loses small)', color='white', alpha=0.7, ha='center', va='center')
ax.text(0.65, 1.45, 'Quadrant 4: TERRIBLE\n(Wins small, loses big)', color='#f85149', fontweight='bold', ha='center', va='center')

ax.set_xlim(0.4, 1.8)
ax.set_ylim(0.4, 1.8)

# Invert Y axis for Downside Capture because lower is better, so we want the "Good" stuff at the top right?
# Wait, usually Up capture on X (right is better), Down capture on Y (lower is better).
# Let's keep Y normal but add labels to make it clear.
ax.invert_yaxis() # Invert so TOP is LOWER down capture (better)

ax.set_xlabel('Upside Capture (Higher = captures more market gains) →', fontsize=12)
ax.set_ylabel('Downside Capture (Lower = captures less market losses) ↑', fontsize=12)
ax.set_title('Upside vs Downside Capture Ratios', fontsize=16, pad=20)

plt.grid(alpha=0.1)
plt.savefig('/home/nithin/quant-terminal/plots/capture_ratio.png', bbox_inches='tight', dpi=150)
plt.close()

print("Capture ratio plot generated successfully!")
