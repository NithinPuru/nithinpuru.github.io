import numpy as np
import matplotlib.pyplot as plt
import scipy.stats as stats
import os

os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)
plt.style.use('dark_background')

fig, axes = plt.subplots(1, 3, figsize=(15, 4))
np.random.seed(42)

# 1. Normal (JB ~ 0)
data1 = np.random.normal(0, 1, 1000)
axes[0].hist(data1, bins=30, density=True, color='#3fb950', alpha=0.7)
x = np.linspace(-5, 5, 100)
axes[0].plot(x, stats.norm.pdf(x, 0, 1), 'w', lw=2)
axes[0].set_title('JB < 5\n"The Perfect Bell Curve"\n(Standard Risk Models Work)')
axes[0].set_xlim(-5, 5)
axes[0].grid(alpha=0.2)

# 2. Mild non-normal (JB ~ 15)
# Use a slightly skewed distribution (e.g. skewnorm)
data2 = stats.skewnorm.rvs(a=-3, loc=1, scale=1.5, size=1000)
axes[1].hist(data2, bins=30, density=True, color='#e3b341', alpha=0.7)
axes[1].plot(x, stats.norm.pdf(x, np.mean(data2), np.std(data2)), 'w', lw=2)
axes[1].set_title('JB 5 - 20\n"The Leaning Tower"\n(Use CF mVaR)')
axes[1].set_xlim(-5, 5)
axes[1].grid(alpha=0.2)

# 3. Extreme non-normal (JB > 100)
# Use a t-distribution with very low degrees of freedom for massive fat tails
data3 = stats.t.rvs(df=2.5, size=1000)
# Clip data just for visualization purposes so it doesn't squish the middle too much
data3_clipped = np.clip(data3, -8, 8)
axes[2].hist(data3_clipped, bins=40, density=True, color='#f85149', alpha=0.7)
axes[2].plot(np.linspace(-8, 8, 100), stats.norm.pdf(np.linspace(-8, 8, 100), np.mean(data3_clipped), np.std(data3_clipped)), 'w', lw=2)
axes[2].set_title('JB > 100\n"Massive Fat Tails"\n(Standard VaR is Dangerously Wrong)')
axes[2].set_xlim(-8, 8)
axes[2].grid(alpha=0.2)

plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/jb_comparison.png', bbox_inches='tight', dpi=150)
plt.close()

print("JB plot generated successfully!")
