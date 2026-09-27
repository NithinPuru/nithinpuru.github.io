import numpy as np
import matplotlib.pyplot as plt
import os

os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)
plt.style.use('dark_background')

# Generate some weekly returns with massive upside (tech stock profile)
np.random.seed(10)
returns = np.random.normal(0, 3, 50)
# Add some massive positive jumps
returns[10] = 12
returns[25] = 15
returns[40] = 10
# Add some standard crashes
returns[15] = -6
returns[30] = -8
returns[45] = -5

fig, ax = plt.subplots(figsize=(12, 5))

weeks = np.arange(len(returns))

# Create masks for positive and negative returns
pos_mask = returns >= 0
neg_mask = returns < 0

# Plot the bars
ax.bar(weeks[pos_mask], returns[pos_mask], color='#3fb950', alpha=0.7, label='"Good Bounciness"\n(Sharpe punishes this. Sortino IGNORES it)')
ax.bar(weeks[neg_mask], returns[neg_mask], color='#f85149', alpha=0.9, label='"Bad Bounciness"\n(Sortino squares these and puts them in the Penalty Pile)')

# Add a zero line
ax.axhline(0, color='white', linewidth=1.5, linestyle='-')

ax.set_title('Sortino Ratio: How it treats volatility', fontsize=16, pad=20)
ax.set_xlabel('Weeks')
ax.set_ylabel('Weekly Return %')

# Add some text annotations to extreme points
ax.annotate('Huge Earnings Jump!\n(Sortino loves this)', xy=(25, 15), xytext=(25, 12),
            arrowprops=dict(facecolor='white', shrink=0.05, width=1, headwidth=6),
            color='white', ha='center', fontsize=10)

ax.annotate('Market Crash\n(Sortino punishes this heavily)', xy=(30, -8), xytext=(30, -5),
            arrowprops=dict(facecolor='#f85149', shrink=0.05, width=1, headwidth=6),
            color='#f85149', ha='center', fontsize=10)

ax.legend(loc='upper left')
ax.grid(alpha=0.1)
ax.set_xlim(-1, 51)

plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/sortino_ratio.png', bbox_inches='tight', dpi=150)
plt.close()

print("Sortino ratio plot generated successfully!")
