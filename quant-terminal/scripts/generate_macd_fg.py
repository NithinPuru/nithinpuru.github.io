import yfinance as yf
import pandas as pd
import matplotlib.pyplot as plt
import os

os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)
plt.style.use('dark_background')

# Fetch NVDA data
df = yf.download('NVDA', start='2023-01-01', end='2023-06-30', interval='1d')
if isinstance(df.columns, pd.MultiIndex):
    df.columns = df.columns.droplevel('Ticker')
df.dropna(inplace=True)

# Calculate EMAs and MACD
df['EMA12'] = df['Close'].ewm(span=12, adjust=False).mean()
df['EMA26'] = df['Close'].ewm(span=26, adjust=False).mean()
df['MACD'] = df['EMA12'] - df['EMA26']
df['Signal'] = df['MACD'].ewm(span=9, adjust=False).mean()
df['Histogram'] = df['MACD'] - df['Signal']

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8), gridspec_kw={'height_ratios': [2, 1]})

# Top plot: EMAs
ax1.plot(df.index, df['Close'], label='Price', color='gray', alpha=0.5)
ax1.plot(df.index, df['EMA12'], label='Fast Runner (12-EMA)', color='#3fb950', linewidth=2)
ax1.plot(df.index, df['EMA26'], label='Slow Runner (26-EMA)', color='#f85149', linewidth=2)
ax1.set_title('MACD Visualized: The Two Runners', fontsize=14)
ax1.legend()
ax1.grid(alpha=0.1)

# Bottom plot: MACD and Histogram
ax2.plot(df.index, df['MACD'], label='MACD Line (Distance between runners)', color='#58a6ff', linewidth=2)
ax2.plot(df.index, df['Signal'], label='Signal Line (Average distance)', color='#e3b341', linewidth=2, linestyle='--')

colors = ['#3fb950' if val > 0 else '#f85149' for val in df['Histogram']]
ax2.bar(df.index, df['Histogram'], color=colors, alpha=0.7, label='Histogram (Momentum surging or fading)')
ax2.axhline(0, color='white', linewidth=1, alpha=0.5)
ax2.set_title('The Rubber Band & Histogram', fontsize=12)
ax2.legend(loc='upper left', fontsize=8)
ax2.grid(alpha=0.1)

plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/macd.png', bbox_inches='tight', dpi=150)
plt.close()

# -----------------
# Fear & Greed Plot
# -----------------
fig, ax = plt.subplots(figsize=(8, 4))
categories = ['RSI\n(The Fatigue Meter)', 'Stochastic\n(The Room Meter)', 'VolScore\n(The Panic Meter)', 'FINAL FEAR & GREED\n(The Crowd)']
values = [15, 10, 20, 15] # Example: Extreme Fear Scenario

bars = ax.barh(categories, values, color=['#58a6ff', '#58a6ff', '#58a6ff', '#f85149'])

# Add text labels inside bars
for bar in bars:
    ax.text(bar.get_width() + 2, bar.get_y() + bar.get_height()/2, 
            f'{int(bar.get_width())}/100', 
            va='center', color='white', fontweight='bold')

ax.set_xlim(0, 100)
ax.axvline(20, color='#f85149', linestyle='--', alpha=0.5)
ax.axvline(80, color='#3fb950', linestyle='--', alpha=0.5)

ax.text(10, 3.5, 'EXTREME FEAR (Buy Zone)', color='#f85149', ha='center', fontsize=10, fontweight='bold')
ax.text(90, 3.5, 'EXTREME GREED (Sell Zone)', color='#3fb950', ha='center', fontsize=10, fontweight='bold')

ax.set_title('Fear & Greed Index: The 3 Ingredients', fontsize=16, pad=20)
ax.invert_yaxis()  # Put final score at the bottom
plt.tight_layout()
plt.savefig('/home/nithin/quant-terminal/plots/fear_greed.png', bbox_inches='tight', dpi=150)
plt.close()

print("MACD and Fear & Greed plots generated successfully!")
