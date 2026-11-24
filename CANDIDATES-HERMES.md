# Pump.fun Paper Sprint: Candidate Trading Strategies

## 1. Bonding Curve Momentum Breakout (Velocity Entry)
- **Entry Rules**: Buy when a token's bonding curve progress increases by >5% within a 10-second window, accompanied by a sudden surge in unique buyer count (>3 new wallets in 5s).
- **Exit Rules**: Trailing stop-loss of 15% from local peak, take-profit at +50% gain, or time-based stop if price stagnates for 3 minutes.
- **Why it could win**: Pump.fun tokens rely heavily on rapid momentum toward bonding curve completion; catching early velocity captures the initial FOMO wave before retail exhaustion.

## 2. Smart Money Wallet Copy-Trader / Whale Tracker
- **Entry Rules**: Mirror trades from a pre-compiled list of historically profitable trader wallets (tracked via historical bonding curve fills) that buy within the first 30 seconds of a token launch.
- **Exit Rules**: Sell 50% at 2x, sell remaining 50% when the tracked wallet initiates a full sell or after a 30% trailing drawdown.
- **Why it could win**: Copying successful early-stage participants bypasses noise and leverages proven intuition or insider tracking of high-probability mints.

## 3. Dip-Buying Post-Initial Dump (Rebound Scalper)
- **Entry Rules**: Buy when a newly launched token experiences a sharp 40%-60% drawdown from its initial peak within the first 2 minutes, provided transaction volume remains active (>5 buys in the last 15 seconds).
- **Exit Rules**: Take-profit at +30% bounce or stop-loss if price drops another 20% below entry.
- **Why it could win**: Many pump.fun tokens suffer an immediate sniper dump followed by a secondary retail resurgence; buying the blood captures the oversold bounce.

## 4. Volume Acceleration & Liquidity Surge
- **Entry Rules**: Buy when the ratio of buy volume to sell volume exceeds 4:1 over a rolling 30-second window, and total minute volume crosses 5 SOL.
- **Exit Rules**: Exit when the buy/sell volume ratio drops below 1:1 or after achieving a 40% gain.
- **Why it could win**: Sustained volume imbalance indicates aggressive accumulation and institutional/bot swarm interest driving price higher.

## 5. Graduation Proximity Sniffer (Late Curve Momentum)
- **Entry Rules**: Buy exclusively tokens that have reached 80% to 95% of their bonding curve completion and show accelerating trade frequency.
- **Exit Rules**: Sell immediately upon reaching 100% bonding curve completion (graduation to Raydium) or a strict 10% stop-loss.
- **Why it could win**: The final push to graduation attracts massive speculative capital and guarantees liquidity migration, offering a high-probability short-term squeeze.

## 6. Micro-Cap Mean Reversion (Grid Scalper)
- **Entry Rules**: Buy tokens with stable age (>10 minutes, non-rugged) that oscillate within a tight 10% range, buying at the lower Bollinger Band.
- **Exit Rules**: Sell at the upper Bollinger Band (+10%) or cut losses at -8%.
- **Why it could win**: While most pump.fun tokens crash, surviving mid-life tokens experience range-bound volatility that rewards disciplined high-frequency mean reversion.

## 7. Social / Metadata Keyword Trend-Following
- **Entry Rules**: Buy tokens whose metadata/ticker contains trending keywords or meme themes detected in real-time mempool scraping (e.g., matching top Twitter/Telegram narrative tags), entering within 5 seconds of token creation.
- **Exit Rules**: Take-profit at +100% or stop-loss at -25%.
- **Why it could win**: Narrative momentum dictates speculative inflows in meme coin ecosystems; early alignment with viral themes captures maximum retail attention.

## 8. Anti-Rug Shield Momentum (Graduated Risk Scaler)
- **Entry Rules**: Enter only after a token survives the critical first 3 minutes of life without a top-holder selling >20% of supply, entering on the first 1-minute green candle breakout.
- **Exit Rules**: Trailing stop of 12% with progressive profit targets (+25%, +50%, +100%).
- **Why it could win**: Filtering out immediate rug pulls and bots avoids 90% of worthless tokens, letting the strategy compound gains only on fundamentally resilient launches.
