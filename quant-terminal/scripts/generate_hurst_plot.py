import numpy as np
import matplotlib.pyplot as plt
import os

os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)
plt.style.use('dark_background')

np.random.seed(42)
n_steps = 200

# 1. Mean Reverting (H < 0.5) - Ornstein-Uhlenbeck process
theta = 0.5
mu = 0
sigma = 0.5
x_mr = np.zeros(n_steps)
for t in range(1, n_steps):
    x_mr[t] = x_mr[t-1] + theta * (mu - x_mr[t-1]) + sigma * np.random.normal()

# 2. Random Walk (H = 0.5) - Standard Brownian Motion
x_rw = np.cumsum(np.random.normal(0, 0.5, n_steps))

# 3. Trending / Momentum (H > 0.5) - Random Walk with strong momentum/drift
x_tr = np.zeros(n_steps)
momentum = 0
for t in range(1, n_steps):
    momentum = 0.8 * momentum + np.random.normal(0, 0.2)
    x_tr[t] = x_tr[t-1] + momentum + 0.1 # slight upward drift

fig, axes = plt.subplots(1, 3, figsize=(15, 4))

axes[0].plot(x_mr, color='#a78bfa', linewidth=2)
axes[0].axhline(y=0, color='white', linestyle='--', alpha=0.5)
axes[0].set_title('Hurst < 0.5\n"The Rubber Band" (Mean-Reverting)\nConstant bouncing, no long trends')
axes[0].grid(alpha=0.2)
axes[0].set_xticks([])
axes[0].set_yticks([])

axes[1].plot(x_rw, color='#e3b341', linewidth=2)
axes[1].set_title('Hurst = 0.5\n"The Drunkard" (Random Walk)\nPure noise, completely unpredictable')
axes[1].grid(alpha=0.2)
axes[1].set_xticks([])
axes[1].set_yticks([])

axes[2].plot(x_tr, color='#3fb950', linewidth=2)
axes[2].set_title('Hurst > 0.5\n"The Snowball" (Trending)\nStrong momentum, long continuous runs')
axes[2].grid(alpha=0.2)
axes[2].set_xticks([])
axes[2].set_yticks([])

plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/hurst_exponent.png', bbox_inches='tight', dpi=150)
plt.close()

print("Hurst plot generated successfully!")
