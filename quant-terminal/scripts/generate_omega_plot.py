import numpy as np
import matplotlib.pyplot as plt
import os

os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)
plt.style.use('dark_background')

np.random.seed(42)
# Generate random normal returns
returns = np.random.normal(0.005, 0.04, 200)

plt.figure(figsize=(10, 5))

# Plot positive returns as green bars, negative as red bars
pos_returns = returns[returns > 0]
neg_returns = returns[returns < 0]

plt.hist([pos_returns, neg_returns], bins=30, stacked=True, 
         color=['#3fb950', '#f85149'], label=['Winning Weeks (The Gains)', 'Losing Weeks (The Pain)'])

plt.axvline(x=0, color='white', linestyle='--', linewidth=2, label='Threshold (0%)')

plt.title('The Omega Ratio Visualized: Total Area of Gains vs Total Area of Pain', pad=20)
plt.xlabel('Weekly Return %')
plt.ylabel('Frequency (Number of Weeks)')

# Add text boxes to explain the ratio
plt.text(0.05, plt.ylim()[1]*0.8, 'Sum of all GREEN\n(Total Money Made)', color='#3fb950', fontsize=12, fontweight='bold')
plt.text(-0.15, plt.ylim()[1]*0.8, 'Sum of all RED\n(Total Money Lost)', color='#f85149', fontsize=12, fontweight='bold')

plt.legend()
plt.grid(alpha=0.2)

plt.savefig('/home/nithin/quant-terminal/plots/omega_ratio.png', bbox_inches='tight', dpi=150)
plt.close()

print("Omega ratio plot generated successfully!")
