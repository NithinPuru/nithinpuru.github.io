import yfinance as yf
import pandas as pd
import matplotlib.pyplot as plt
import os

os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)
plt.style.use('dark_background')

# Fetch NVDA data for a period where it oscillated nicely
df = yf.download('NVDA', start='2022-01-01', end='2022-12-31', interval='1wk')
if isinstance(df.columns, pd.MultiIndex):
    df.columns = df.columns.droplevel('Ticker')
df.dropna(inplace=True)

# Calculate 14-week high and low
df['14W_High'] = df['High'].rolling(window=14).max()
df['14W_Low'] = df['Low'].rolling(window=14).min()

# Calculate Stochastic
df['Stoch'] = (df['Close'] - df['14W_Low']) / (df['14W_High'] - df['14W_Low']) * 100

# Drop NaNs to align plots
df = df.dropna()

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8), gridspec_kw={'height_ratios': [2, 1]})

# Plot 1: Price with Floor and Ceiling
ax1.plot(df.index, df['Close'], label='NVDA Price', color='#58a6ff', linewidth=2)
ax1.plot(df.index, df['14W_High'], label='14-Week Ceiling (Highest High)', color='#f85149', linestyle='--')
ax1.plot(df.index, df['14W_Low'], label='14-Week Floor (Lowest Low)', color='#3fb950', linestyle='--')
ax1.fill_between(df.index, df['14W_Low'], df['14W_High'], color='white', alpha=0.05)
ax1.set_title('The Room: Price vs 14-Week Floor & Ceiling')
ax1.legend()
ax1.grid(alpha=0.2)

# Plot 2: Stochastic Oscillator
ax2.plot(df.index, df['Stoch'], color='#a78bfa', linewidth=2)
ax2.axhline(80, color='#f85149', linestyle='--', alpha=0.5, label='80 (Overbought / Too Hot)')
ax2.axhline(20, color='#3fb950', linestyle='--', alpha=0.5, label='20 (Oversold / Too Cold)')
ax2.fill_between(df.index, 80, 100, color='#f85149', alpha=0.1)
ax2.fill_between(df.index, 0, 20, color='#3fb950', alpha=0.1)
ax2.set_ylim(0, 100)
ax2.set_title('Stochastic Score: Where in the room are we? (0 to 100)')
ax2.legend(loc='center left')
ax2.grid(alpha=0.2)

plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/stochastic.png', bbox_inches='tight', dpi=150)
plt.close()

print("Stochastic plot generated successfully!")
