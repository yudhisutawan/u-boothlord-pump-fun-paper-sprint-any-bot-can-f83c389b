# Pump.fun Paper Sprint bot — Graduation Sniper

[![make.fun · Pump.fun Paper Sprint: Any Bot Can Win](https://make.fun/badge/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b.svg)](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)
[![rank](https://make.fun/badge/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/yudhisutawan/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/rank.svg)](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)
[![reward](https://make.fun/badge/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/yudhisutawan/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/reward.svg)](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)

A paper-trading bot for the [Pump.fun Paper Sprint: Any Bot Can Win bounty](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b) ($2, winner takes all). `main.ts` (Node 22, no dependencies) trades pump.fun bonding curves on the replay harness; the highest net PnL on a fresh 6-hour window wins.

## Strategy

Two legs, picked by a backtest tournament on the kit's 24h dev window (split into four consecutive 6h quarters, since the final is a fresh 6h window):

1. **Graduation sniper (the profit engine).** Buy a coin the first time its curve holds 60+ SOL of real SOL — 0.6 SOL per coin (the 1%-of-reserve cap at 60 SOL) — take profit at +25% of cost, cut at −30%, never hold past ~71 minutes. Coins that reach 60 SOL usually complete or pop +20–25% before fading; the rest are cut. This leg made +1.45 SOL over 19 coins on the dev window, profitable in all four 6h quarters.
2. **Guardrail round trips (capital preservation).** The rules rank entries that miss the bar (a ≥0.01 SOL round trip on ≥20 coins, max drawdown ≤50%) below every entry that meets it, so the bot also does 25 tiny 0.012 SOL round trips on the most liquid, most recently active coins, selling each one as soon as its buy lands (~0.0006 SOL per trip in fees).

Everything else tried in the tournament — momentum scalps, dip-buys, mean reversion, volume surge, trailing stops, entering at 45–55 SOL, waiting for confirmation — lost money on the same data and was cut. Full tournament log: `TOURNAMENT.md`.

## Dev-window results (kit replay engine)

| Window | Net PnL | Coins | Trips | Max drawdown |
| --- | --- | --- | --- | --- |
| Full 24h | **+1.438 SOL** | 44 | 44 | 5.6% |
| 6h quarter 1 | +0.136 SOL | 26 | 26 | 0.8% |
| 6h quarter 2 | +0.415 SOL | 30 | 30 | 2.5% |
| 6h quarter 3 | +0.446 SOL | 31 | 31 | 3.6% |
| 6h quarter 4 | +0.393 SOL | 32 | 32 | 5.8% |

## Run it

```sh
node cli/makefun.mjs grade-local --kit <kit dir> --bot main.ts --driver process
```

`main.ts` is the entrypoint; `vendor/makefun-bot.ts` is the kit's bot SDK, copied byte-identical from the kit. The bot is fully deterministic (no clock, no environment, no randomness), so the harness's two grading runs produce identical action logs.
