// C1 PRESERVE — capital preservation + guardrail bot (my own design).
//
// Observation from the dev data: on this window almost every pump.fun coin loses money
// (median hold return from create is -12%, only ~8% ever 2x, 96% of coins that pop +20%
// later drop -20%). Most submitted bots are deep in the red. So the highest-EV base is to
// lose as little as possible while meeting the guardrails, then add only selective bets.
//
// This bot does the minimum the rules require, as cheaply as possible: N tiny round trips
// (buy stakeSol, sell everything as soon as the buy lands) on the most liquid, most recently
// active coins, then stops and holds cash. A round trip costs the curve fees (95+30 bps each
// way) plus two tx fees — about 4.6% of a 0.012 SOL stake, ~0.00055 SOL per trip.
//
// Deterministic: no clock, no Math.random, iteration over insertion-ordered maps only.

import type {
  Batch,
  Bot,
  BotState,
  OrderInput,
  Pubkey,
} from '../../u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b-kit/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b-kit/sdk/ts/makefun-bot.ts';

export interface Params {
  /** SOL per guardrail round trip (must stay >= 0.01 after fees). */
  stakeSol: number;
  /** How many distinct coins to round-trip (guardrail needs >= 20). */
  targetCoins: number;
  /** Minimum real SOL reserve to buy into (1% cap must cover the stake). */
  minRealSol: number;
  /** Most preserve buys decided in one batch. */
  maxBuysPerBatch: number;
  /** Only buy a coin whose latest recorded trade was a buy (tiny stability filter). */
  buyOnlyAfterBuy: boolean;
}

export const DEFAULT_PARAMS: Params = {
  stakeSol: 0.012,
  targetCoins: 25,
  minRealSol: 1.2,
  maxBuysPerBatch: 2,
  buyOnlyAfterBuy: true,
};

const LAMPORTS = 1e9;

interface Coin {
  lastTradeBuy: boolean;
  lastSlot: number;
  trades: number;
}

export function createBot(p: Partial<Params> = {}): Bot {
  const params: Params = { ...DEFAULT_PARAMS, ...p };
  const coins = new Map<Pubkey, Coin>();
  const tripped = new Set<Pubkey>();
  const buying = new Set<Pubkey>();
  const selling = new Set<Pubkey>();
  let tripsDone = 0;

  return {
    onBatch(state: BotState, batch: Batch): OrderInput[] {
      const orders: OrderInput[] = [];
      const cap = state.hello.caps.max_orders_per_batch;
      const tx = Number(state.txFeeLamports()) / LAMPORTS;

      for (const f of batch.fills) {
        if (f.status !== 'filled') {
          if (f.side === 'buy') buying.delete(f.mint);
          if (f.side === 'sell') selling.delete(f.mint);
          continue;
        }
        if (f.side === 'buy') {
          buying.delete(f.mint);
        } else {
          selling.delete(f.mint);
          if (!tripped.has(f.mint)) {
            tripped.add(f.mint);
            tripsDone++;
          }
        }
      }
      // Harness closes (complete/flatten) also finish a trip.
      for (const f of batch.fills) {
        if (f.client_id.startsWith('_') && f.status === 'filled' && !tripped.has(f.mint)) {
          tripped.add(f.mint);
          tripsDone++;
        }
      }

      for (const e of batch.events) {
        if (e.event === 'TradeEvent') {
          const c = coins.get(e.mint) ?? { lastTradeBuy: false, lastSlot: 0, trades: 0 };
          c.lastTradeBuy = e.is_buy;
          c.lastSlot = e.slot;
          c.trades++;
          coins.set(e.mint, c);
        }
      }

      // Sells first: dump every preserve position as soon as its buy has landed.
      const pendingSell = new Set<Pubkey>();
      for (const po of state.pending.values()) {
        if (po.order.side === 'sell') pendingSell.add(po.order.mint);
      }
      for (const [mint, pos] of state.positions) {
        if (selling.has(mint) || pendingSell.has(mint)) continue;
        if (tripped.has(mint)) continue;
        if (orders.length >= cap) break;
        orders.push({ side: 'sell', mint, token_amount: pos.token_amount, max_slippage_bps: 10_000 });
        selling.add(mint);
      }

      // Then buys: most liquid + most recently active coins first.
      if (tripsDone + buying.size + selling.size < params.targetCoins) {
        let free = Number(state.freeCashLamports()) / LAMPORTS;
        const slotsLeft = state.hello.caps.max_open_positions - state.committedPositionCount();
        if (slotsLeft > 0) {
          const ranked: { mint: Pubkey; rq: number; slot: number }[] = [];
          for (const [mint, curve] of state.curves) {
            if (curve.complete) continue;
            if (tripped.has(mint) || buying.has(mint) || selling.has(mint)) continue;
            if (state.positions.has(mint)) continue;
            const c = coins.get(mint);
            if (c === undefined) continue;
            if (params.buyOnlyAfterBuy && !c.lastTradeBuy) continue;
            const rq = Number(curve.real_quote_reserves) / LAMPORTS;
            if (rq < params.minRealSol) continue;
            ranked.push({ mint, rq, slot: c.lastSlot });
          }
          // Most recently traded first (fresh liquidity), break ties by bigger reserve.
          ranked.sort((a, b) => b.slot - a.slot || b.rq - a.rq);
          let buys = 0;
          for (const r of ranked) {
            if (buys >= params.maxBuysPerBatch) break;
            if (orders.length >= cap) break;
            if (tripsDone + buying.size + selling.size >= params.targetCoins) break;
            const capLamports = state.maxBuyLamports(r.mint);
            const want = BigInt(Math.floor(params.stakeSol * LAMPORTS));
            if (capLamports < want) continue;
            if (free < params.stakeSol + 2 * tx) break;
            orders.push({ side: 'buy', mint: r.mint, quote_lamports: want, max_slippage_bps: 10_000 });
            buying.add(r.mint);
            free -= params.stakeSol + tx;
            buys++;
          }
        }
      }
      return orders;
    },
  };
}
