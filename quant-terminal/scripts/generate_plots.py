import yfinance as yf
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import scipy.stats as stats
import os

# Create plots directory if it doesn't exist
os.makedirs('/home/nithin/quant-terminal/plots', exist_ok=True)

# Set style for professional quant terminal look
plt.style.use('dark_background')

# Colors
COLOR_PRICE = '#58a6ff'
COLOR_SMA10 = '#3fb950'
COLOR_SMA40 = '#e3b341'
COLOR_BBAND = 'rgba(255, 255, 255, 0.2)'
COLOR_MACD = '#a78bfa'
COLOR_DRAWDOWN = '#f85149'

def get_weekly_data(ticker, start, end):
    df = yf.download(ticker, start=start, end=end, interval='1wk')
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel('Ticker')
    df.dropna(inplace=True)
    return df

# 1. NVDA Price, SMA, Bollinger Bands (2022-2023)
nvda = get_weekly_data('NVDA', '2021-06-01', '2024-01-01')
nvda['SMA10'] = nvda['Close'].rolling(window=10).mean()
nvda['SMA40'] = nvda['Close'].rolling(window=40).mean()
nvda['SMA20'] = nvda['Close'].rolling(window=20).mean()
nvda['STD20'] = nvda['Close'].rolling(window=20).std()
nvda['Upper'] = nvda['SMA20'] + 2 * nvda['STD20']
nvda['Lower'] = nvda['SMA20'] - 2 * nvda['STD20']

plt.figure(figsize=(10, 6))
plt.plot(nvda.index, nvda['Close'], label='Price', color=COLOR_PRICE, linewidth=2)
plt.plot(nvda.index, nvda['SMA10'], label='SMA10', color=COLOR_SMA10, linestyle='--')
plt.plot(nvda.index, nvda['SMA40'], label='SMA40', color=COLOR_SMA40, linestyle='-.')
plt.fill_between(nvda.index, nvda['Lower'], nvda['Upper'], color='white', alpha=0.1, label='Bollinger Bands (20w)')
plt.title('NVDA Weekly Price with SMA & Bollinger Bands (2021-2023)')
plt.legend()
plt.grid(alpha=0.2)
plt.savefig('/home/nithin/quant-terminal/plots/nvda_sma_bb.png', bbox_inches='tight', dpi=150)
plt.close()

# 2. AMD Drawdown (2021-2023)
amd = get_weekly_data('AMD', '2021-01-01', '2024-01-01')
amd['Peak'] = amd['Close'].cummax()
amd['Drawdown'] = (amd['Close'] - amd['Peak']) / amd['Peak'] * 100

plt.figure(figsize=(10, 4))
plt.fill_between(amd.index, amd['Drawdown'], 0, color=COLOR_DRAWDOWN, alpha=0.6)
plt.plot(amd.index, amd['Drawdown'], color=COLOR_DRAWDOWN)
plt.title('AMD Underwater Drawdown (2021-2023)')
plt.ylabel('Drawdown %')
plt.grid(alpha=0.2)
plt.savefig('/home/nithin/quant-terminal/plots/amd_drawdown.png', bbox_inches='tight', dpi=150)
plt.close()

# 3. NVDA Returns Distribution
nvda['Return'] = nvda['Close'].pct_change() * 100
returns = nvda['Return'].dropna()

plt.figure(figsize=(8, 5))
count, bins, ignored = plt.hist(returns, bins=30, density=True, color=COLOR_PRICE, alpha=0.7, label='Actual Returns')
mu, std = stats.norm.fit(returns)
xmin, xmax = plt.xlim()
x = np.linspace(xmin, xmax, 100)
p = stats.norm.pdf(x, mu, std)
plt.plot(x, p, 'w', linewidth=2, label=f'Normal Curve\n(mu={mu:.1f}%, std={std:.1f}%)')
plt.title('NVDA Weekly Returns Distribution vs Normal Curve')
plt.xlabel('Weekly Return %')
plt.ylabel('Density')
plt.legend()
plt.grid(alpha=0.2)
plt.savefig('/home/nithin/quant-terminal/plots/nvda_dist.png', bbox_inches='tight', dpi=150)
plt.close()

# 4. NVDA 26-Week Rolling Volatility
nvda['RollingVol'] = nvda['Return'].rolling(window=26).std() * np.sqrt(52)

plt.figure(figsize=(10, 4))
plt.plot(nvda.index, nvda['RollingVol'], color='#c084fc', linewidth=2)
plt.title('NVDA 26-Week Rolling Annualized Volatility')
plt.ylabel('Annual Volatility %')
plt.grid(alpha=0.2)
plt.savefig('/home/nithin/quant-terminal/plots/nvda_rolling_vol.png', bbox_inches='tight', dpi=150)
plt.close()

print("Plots generated successfully!")
