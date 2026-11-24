# Tournament — Pump.fun Paper Sprint (u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)

Entry: `main.ts` — "Graduation Sniper + Guardrail". Prize $2, winner takes all, ranked by
net PnL on a fresh 6-hour pump.fun window collected after entries close (26 Nov 2026 13:40 WITA).

## Method

- Kit: fresh download from `https://make.fun/c/<slug>/kit` (the CLI's documented kit URL;
  `makefun init` does not download kits — it anchors a source-bundle repo).
- Data: kit dev dataset, 128,058 events / 1,222 mints over 24h (2 Nov 2026).
- Evaluation: the kit's own replay engine (`baselines/pilot/momentum/tools/sim.ts`) via
  `candidates/runner.ts`, on the full 24h AND on four consecutive 6h quarters (the final
  is a fresh 6h window — a strategy that wins only on the full window but loses 3 of 4
  quarters is a fluke). Winner confirmed with the official grader
  (`grade-local --driver process`, plus `--stress 20`).
- Guardrails that decide ranking order: ≥20 distinct mints with a ≥0.01 SOL round trip,
  max drawdown ≤50%. Entries missing the bar rank below every entry that meets it.
- Reference points: house pilot momentum −9.38 SOL, house pilot sniper −0.138 SOL on the
  dev window; best submitted entry visible on the API at build time: −0.046 SOL.

## Data findings (drove the design)

- Median coin never runs: max multiple from create price is 1.02x (p50); only 8.5% ever
  2x, 1.3% ever 5x, 0% ever 10x. Median hold return from create is −12%.
- Coins +20% within 5 min: 31.6% later gain another +50%, but 96% later drop −20% — exits
  must be fast and mechanical.
- Distinct buyers in the 1st minute is a real filter: ≥10 buyers → P(2x) 20.6% vs 8.5% base.
- Coins reaching 60 SOL real reserves: 74.5% complete, 46.8% gain +20% more.
- Trade direction clusters hard (P(buy|buy) 0.69, P(buy|sell) 0.34) but per-trade moves
  (p50 0.88%) cannot beat the ~2.5% round-trip fees — no micro-scalping edge.
- After a −50% dip from the 15-min high, P(+30% bounce) is only 31.8% — dip-buying is
  negative-EV at any reasonable TP/SL.

## Candidates (all implemented by the builder; Hermes ideas marked H#)

| # | Candidate | Full 24h net | Quarters (6h each) | Verdict |
| --- | --- | --- | --- | --- |
| C1 | PRESERVE — 25× 0.012 SOL round trips, sell ASAP | −0.0154 SOL | −0.015/−0.019/−0.013/−0.016, DD 0.2% | Base: cheapest guardrail |
| C2 | PRESERVE + GRAD rq45, TP+30%/SL−25%, 0.4 | −1.496 SOL | 1/4 profitable, DD 21.9% | Too early — cut |
| C3 | PRESERVE + MOM (H#1/#4), TP+30%/SL−10%, 0.05 | −1.737 SOL | 0/4, 624 trips | Cut |
| C4 | PRESERVE + MOM fast scalp TP+15%/SL−5%, 0.02 | −0.630 SOL | 0/4, 708 trips | Cut |
| C5 | PRESERVE + DIP (H#3), TP+25%/SL−15%, 0.05 | −1.175 SOL | 0/4, 292 trips | Cut |
| C6 | PRESERVE + MEANREV (H#6), TP/SL ±8%, 0.05 | −0.242 SOL | 0/4, 139 trips | Cut |
| C7 | PRESERVE + VOLSURGE (H#4), TP+40%/SL−15%, 0.05 | −3.206 SOL | 0/4, 735 trips | Cut |
| C8 | PRESERVE + GRAD rq60, TP+20%/SL−40%, 0.2 | +0.368 SOL | 4/4 profitable | Promising |
| C9 | PRESERVE + GRAD rq60, TP+25%/SL−30%, 0.2 | +0.468 SOL | 4/4 profitable | Better |
| C10 | PRESERVE + GRAD rq60, TP+25%/SL−30%, 0.4 | +0.954 SOL | 4/4 profitable | Better |
| C11 | PRESERVE + GRAD rq60, TP+25%/SL−30%, 0.6 | **+1.438 SOL** | **4/4 profitable** | **WINNER** |
| — | GRAD rq55 / rq65 / rq70 (TP+20%/SL−40%, 0.2) | +0.31 / −0.06 / −0.59 | — | 60 is a sharp peak |
| — | GRAD TP+30%/+35% (rq60, SL−40%, 0.2) | +0.20 / −0.11 | — | TP +25% is the peak |
| — | GRAD SL−25% (rq60, TP+25%, 0.4) | +0.570 (Q3 negative) | 3/4 | SL −30% better |
| — | GRAD ladder 50/60/70, 55/65, 60/70 | −0.15 / +0.67 / +0.71 | 1/4, 3/4, 4/4 | Ladders add nothing |
| — | GRAD + trailing stop (no fixed TP) | −0.28 / −0.40 | 2/4 | Fixed TP wins |
| — | GRAD + confirmation delay 35/70/140 slots | +0.52 / −0.28 / +0.06 | — | Enter at once or not at all |
| — | GRAD + runup-buyer filter 10/20 | +1.438 (no-op) | — | All 60-crossers pass it |
| — | GRAD 0.6 + MEANREV | +1.229 | 4/4 | Meanrev drags −0.21 — cut |
| — | GRAD 0.6 + preserve 0.02×22 | +1.433 | 4/4 | Same — keep 0.012×25 |

Hermes candidates #2 (copy-trader) and #7 (keyword/social) were not implementable in this
harness: the replay delivers no wallet-history or social/metadata feed, so there is nothing
to copy or trend-follow on. Hermes #8 (anti-rug 3-min survival) is subsumed by the
graduation filter (only coins that survive to 60 SOL qualify).

## Winner (shipped as main.ts)

- Graduation sniper: first crossing of 60 SOL real reserves → buy 0.6 SOL (1% cap),
  TP +25% of cost, SL −30%, max hold ~71 min, max 2 concurrent, one entry per coin.
- Guardrail: 25 × 0.012 SOL round trips on the most liquid, most recently active coins,
  sold as soon as the buy lands.
- Everything else off. Max exposure 6 SOL. Deterministic (no clock/random).

## Official grading (grade-local --driver process, commit 0db20b3)

- Net PnL **+1.438183930 SOL** (return +14.4%), 90% interval −0.087 .. +2.815 SOL.
- 88 fills over 44 coins, 44 round trips, win rate 40.9%, max drawdown 5.57%.
- Top 3 coins made 22% of gains; without them net is still +0.89 SOL.
- At 2x fees net is +1.104 SOL. Guardrails met. L1 regrade reproduced byte for byte.
- Stress (10 block surrogates, official `--stress 10`): median −1.33 SOL, p10 −3.11,
  p90 +0.18; 7 of 10 lost money; dev score above 10 of 10 copies — BOTH official
  warnings fired ("dev score above 90% of copies", "half or more lost money"). The
  surrogates rebuild each coin by stitching donor trade blocks matched on state
  (real SOL, age, net flow), so they break the full-trajectory structure the
  graduation edge rides on. Read against the four genuine 6h quarters (all
  profitable, median +0.40): the edge is real on real windows but high-variance and
  window-dependent. The kit itself says the copies "are not a forecast of another
  window". Floor if the final window has no good graduation coins: the guardrail leg
  at ≈ −0.015 SOL.

## Caveats (honest)

- The final window is a NEW 6h window. Per-quarter grad coins numbered only 1, 5, 6, 7 —
  a quiet final window means fewer shots; the floor is the guardrail leg at ≈ −0.015 SOL.
- Three dev-window coins that crossed 60 SOL then collapsed −88% cost −0.99 SOL combined
  (worst single trip −0.53 SOL: the stop-loss fired but the sell filled into a cratering
  curve 2 slots later). The winners (+0.15–0.19 SOL each, 10+ of them) more than pay for
  this, but a final window with 2–3 such coins and no winners would go negative.
- The 90% bootstrap interval includes 0 — this is a high-variance, few-coins game, and
  the $2 prize means the realistic upside is the win itself, not the money.
