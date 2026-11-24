// FLEX — parameterized multi-component paper-trading bot (my own design).
//
// One strategy file whose components can be switched on/off by params, so the tournament can
// measure each idea's marginal contribution on the same engine. Components:
//
//   preserve : tiny round trips (stakeSol, targetCoins) on the most liquid coins — the
//              capital-preservation base that meets the 20-coin guardrail at minimum cost.
//   grad     : graduation proximity (Hermes #5) — buy when a curve's real SOL first crosses
//              gradRq, ride toward completion, TP/SL/timeout.
//   mom      : filtered momentum (Hermes #1/#4) — broad early buyers + price up + net inflow,
//              fast TP/SL.
//   dip      : dip-buy (Hermes #3) — buy a deep pullback from the 15-min high once the tape
//              stabilises, quick TP/SL.
//   meanrev  : mean reversion (Hermes #6) — mature range-bound coins, buy the lower quintile
//              of the 30-min range, small TP/SL.
//   vol      : volume surge (Hermes #4) — net buy SOL over 30 slots above a bar with a high
//              buy share, TP/SL.
//
// Every exit is judged on position VALUE vs COST (mark-to-market at current reserves, curve
// fee and tx fee deducted), never on the decision price alone. Deterministic: no clock, no
// Math.random, insertion-ordered maps only.

import type {
  Batch,
  Bot,
  BotState,
  OrderInput,
  Pubkey,
} from '../../u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b-kit/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b-kit/sdk/ts/makefun-bot.ts';

export interface Params {
  preserveOn: boolean;
  preserveStakeSol: number;
  preserveTargetCoins: number;
  preserveMinRealSol: number;
  gradOn: boolean;
  gradRq: number;
  gradStakeSol: number;
  gradTp: number;
  gradSl: number;
  gradMaxHold: number;
  gradMaxConcurrent: number;
  gradMinBuyers: number;
  /** Ladder: buy tier 2 when real SOL first crosses this (0 = off), tier 3 likewise. */
  gradTier2Rq: number;
  gradTier2StakeSol: number;
  gradTier3Rq: number;
  gradTier3StakeSol: number;
  /** Wait this many slots after first crossing gradRq before entering (0 = enter at once). */
  gradConfirmSlots: number;
  /** At entry, current real SOL must still be at least this (0 = no re-check). */
  gradConfirmRq: number;
  /** Distinct buyers while real SOL climbed 25..gradRq, at least this many (0 = off). */
  gradMinRunupBuyers: number;
  momOn: boolean;
  momMinBuyers: number;
  momMinUp: number;
  momWindow: number;
  momMinNetSol: number;
  momNearHigh: number;
  momMaxAge: number;
  momStakeSol: number;
  momTp: number;
  momSl: number;
  momMaxHold: number;
  momMaxConcurrent: number;
  dipOn: boolean;
  dipFrac: number;
  dipMinBuys: number;
  dipStakeSol: number;
  dipTp: number;
  dipSl: number;
  dipMaxHold: number;
  dipMaxConcurrent: number;
  meanrevOn: boolean;
  meanrevMinAge: number;
  meanrevMinTrades: number;
  meanrevStakeSol: number;
  meanrevTp: number;
  meanrevSl: number;
  meanrevMaxHold: number;
  meanrevMaxConcurrent: number;
  volOn: boolean;
  volMinNetSol: number;
  volMinBuyShare: number;
  volStakeSol: number;
  volTp: number;
  volSl: number;
  volMaxHold: number;
  volMaxConcurrent: number;
  trailArm: number;
  trail: number;
  maxExposureSol: number;
}

export const DEFAULT_PARAMS: Params = {
  preserveOn: true,
  preserveStakeSol: 0.012,
  preserveTargetCoins: 25,
  preserveMinRealSol: 1.2,
  gradOn: false,
  gradRq: 45,
  gradStakeSol: 0.4,
  gradTp: 0.3,
  gradSl: 0.25,
  gradMaxHold: 20000,
  gradMaxConcurrent: 2,
  gradMinBuyers: 0,
  gradTier2Rq: 0,
  gradTier2StakeSol: 0,
  gradTier3Rq: 0,
  gradTier3StakeSol: 0,
  gradConfirmSlots: 0,
  gradConfirmRq: 0,
  gradMinRunupBuyers: 0,
  momOn: false,
  momMinBuyers: 8,
  momMinUp: 0.15,
  momWindow: 1400,
  momMinNetSol: 0.5,
  momNearHigh: 0.9,
  momMaxAge: 4200,
  momStakeSol: 0.05,
  momTp: 0.3,
  momSl: 0.1,
  momMaxHold: 4200,
  momMaxConcurrent: 3,
  dipOn: false,
  dipFrac: 0.55,
  dipMinBuys: 3,
  dipStakeSol: 0.05,
  dipTp: 0.25,
  dipSl: 0.15,
  dipMaxHold: 4200,
  dipMaxConcurrent: 2,
  meanrevOn: false,
  meanrevMinAge: 2800,
  meanrevMinTrades: 50,
  meanrevStakeSol: 0.05,
  meanrevTp: 0.08,
  meanrevSl: 0.08,
  meanrevMaxHold: 8400,
  meanrevMaxConcurrent: 2,
  volOn: false,
  volMinNetSol: 2,
  volMinBuyShare: 0.75,
  volStakeSol: 0.05,
  volTp: 0.4,
  volSl: 0.15,
  volMaxHold: 4200,
  volMaxConcurrent: 2,
  trailArm: 1000,
  trail: 0.3,
  maxExposureSol: 6,
};

const LAMPORTS = 1e9;
const CURVE_FEE = 0.0125;

interface Trade {
  slot: number;
  price: number;
  buy: boolean;
  sol: number;
  user: string;
}

interface Tape {
  created: number | null;
  firstPrice: number;
  trades: Trade[];
  peakPrice: number;
  peakRq: number;
  entries: number;
  lastExit: number;
  gradTriggered: boolean;
  gradTier: number;
  crossSlot: number;
  runupBuyers: Set<string>;
}

type Component = 'preserve' | 'grad' | 'mom' | 'dip' | 'meanrev' | 'vol';

interface Held {
  comp: Component;
  opened: number;
  invested: number;
  peakValue: number;
  exiting: boolean;
  filled: boolean;
}

export function createBot(p: Partial<Params> = {}): Bot {
  const params: Params = { ...DEFAULT_PARAMS, ...p };
  const tapes = new Map<Pubkey, Tape>();
  const held = new Map<Pubkey, Held>();
  const tripped = new Set<Pubkey>();
  const buying = new Set<Pubkey>();
  const selling = new Set<Pubkey>();
  let tripsDone = 0;
  const keep = 9000;

  const tapeOf = (mint: Pubkey): Tape => {
    let t = tapes.get(mint);
    if (t === undefined) {
      t = { created: null, firstPrice: 0, trades: [], peakPrice: 0, peakRq: 0, entries: 0, lastExit: -1e12, gradTriggered: false, gradTier: 0, crossSlot: -1, runupBuyers: new Set<string>() };
      tapes.set(mint, t);
    }
    return t;
  };

  const countFor = (comp: Component): number => {
    let n = 0;
    for (const h of held.values()) if (h.comp === comp) n++;
    return n;
  };

  return {
    onBatch(state: BotState, batch: Batch): OrderInput[] {
      const now = batch.slot;
      const orders: OrderInput[] = [];
      const cap = state.hello.caps.max_orders_per_batch;
      const tx = Number(state.txFeeLamports()) / LAMPORTS;

      for (const f of batch.fills) {
        if (f.status === 'filled') {
          if (f.side === 'buy') buying.delete(f.mint);
          else {
            selling.delete(f.mint);
            if (!tripped.has(f.mint) && held.get(f.mint)?.comp === 'preserve') {
              tripped.add(f.mint);
              tripsDone++;
            }
          }
        } else {
          if (f.side === 'buy') buying.delete(f.mint);
          if (f.side === 'sell') selling.delete(f.mint);
        }
      }
      for (const f of batch.fills) {
        if (f.client_id.startsWith('_') && f.status === 'filled') {
          const h = held.get(f.mint);
          if (h !== undefined && h.comp === 'preserve' && !tripped.has(f.mint)) {
            tripped.add(f.mint);
            tripsDone++;
          }
        }
      }

      const traded = new Set<Pubkey>();
      for (const e of batch.events) {
        if (e.event === 'CreateEvent') {
          tapeOf(e.mint).created = e.slot;
        } else if (e.event === 'TradeEvent') {
          const t = tapeOf(e.mint);
          const price = Number(e.virtual_quote_reserves) / Number(e.virtual_token_reserves);
          if (t.firstPrice === 0) t.firstPrice = price;
          if (price > t.peakPrice) t.peakPrice = price;
          const rq = Number(e.real_quote_reserves) / LAMPORTS;
          if (rq > t.peakRq) t.peakRq = rq;
          if (t.crossSlot < 0 && rq >= params.gradRq) t.crossSlot = e.slot;
          if (e.is_buy && rq >= 25 && rq < params.gradRq) t.runupBuyers.add(e.user);
          t.trades.push({ slot: e.slot, price, buy: e.is_buy, sol: Number(e.sol_amount) / LAMPORTS, user: e.user });
          traded.add(e.mint);
        }
      }
      for (const mint of traded) {
        const t = tapes.get(mint)!;
        let cut = 0;
        while (cut < t.trades.length && t.trades[cut]!.slot <= now - keep) cut++;
        if (cut > 0) t.trades.splice(0, cut);
      }

      const marks = new Map(batch.marks.map((m) => [m.mint, m] as const));
      const pendingByMint = new Map<Pubkey, number>();
      const pendingSell = new Set<Pubkey>();
      for (const po of state.pending.values()) {
        pendingByMint.set(po.order.mint, (pendingByMint.get(po.order.mint) ?? 0) + 1);
        if (po.order.side === 'sell') pendingSell.add(po.order.mint);
      }

      const valueOf = (mint: Pubkey): { value: number; cost: number } | null => {
        const pos = state.positions.get(mint);
        const curve = state.curves.get(mint);
        if (pos === undefined || curve === undefined) return null;
        const mk = marks.get(mint);
        const vq = mk ? Number(mk.virtual_quote_reserves) : Number(curve.virtual_quote_reserves);
        const vt = mk ? Number(mk.virtual_token_reserves) : Number(curve.virtual_token_reserves);
        const tokens = Number(pos.token_amount);
        const value = ((tokens * vq) / (vt + tokens) / LAMPORTS) * (1 - CURVE_FEE) - tx;
        return { value, cost: Number(pos.cost_lamports) / LAMPORTS };
      };

      // ---- exits for selective positions (preserve sells ASAP below) ----
      const exitCfg: Record<string, { tp: number; sl: number; maxHold: number }> = {
        grad: { tp: params.gradTp, sl: params.gradSl, maxHold: params.gradMaxHold },
        mom: { tp: params.momTp, sl: params.momSl, maxHold: params.momMaxHold },
        dip: { tp: params.dipTp, sl: params.dipSl, maxHold: params.dipMaxHold },
        meanrev: { tp: params.meanrevTp, sl: params.meanrevSl, maxHold: params.meanrevMaxHold },
        vol: { tp: params.volTp, sl: params.volSl, maxHold: params.volMaxHold },
      };
      for (const [mint, h] of held) {
        const pos = state.positions.get(mint);
        const curve = state.curves.get(mint);
        if (pos === undefined) {
          if (!pendingByMint.has(mint)) {
            held.delete(mint);
            const t = tapeOf(mint);
            if (h.filled) t.lastExit = now;
            else t.entries--;
          }
          continue;
        }
        h.filled = true;
        if (curve === undefined || curve.complete) continue;
        const v = valueOf(mint);
        if (v === null) continue;
        if (v.value > h.peakValue) h.peakValue = v.value;
        if (h.comp === 'preserve') {
          // Preserve sells immediately (handled below); no TP/SL logic.
          continue;
        }
        const cfg = exitCfg[h.comp]!;
        let exit = h.exiting;
        if (!exit && v.value >= v.cost * (1 + cfg.tp)) exit = true;
        if (!exit && v.value <= v.cost * (1 - cfg.sl)) exit = true;
        if (!exit && v.value >= v.cost * (1 + params.trailArm) && v.value < h.peakValue * (1 - params.trail)) exit = true;
        if (!exit && now - h.opened > cfg.maxHold) exit = true;
        if (!exit) continue;
        h.exiting = true;
        if (pendingSell.has(mint)) continue;
        if (orders.length >= cap) break;
        orders.push({ side: 'sell', mint, token_amount: pos.token_amount, max_slippage_bps: 10_000 });
        selling.add(mint);
      }

      // ---- preserve sells: dump everything as soon as the buy lands ----
      if (params.preserveOn) {
        for (const [mint, h] of held) {
          if (h.comp !== 'preserve') continue;
          const pos = state.positions.get(mint);
          if (pos === undefined) continue;
          if (selling.has(mint) || pendingSell.has(mint)) continue;
          if (orders.length >= cap) break;
          orders.push({ side: 'sell', mint, token_amount: pos.token_amount, max_slippage_bps: 10_000 });
          selling.add(mint);
        }
      }

      // ---- entries ----
      let free = Number(state.freeCashLamports()) / LAMPORTS;
      let slotsLeft = state.hello.caps.max_open_positions - state.committedPositionCount();
      let exposure = 0;
      for (const [mint, h] of held) {
        exposure += Math.max(h.invested, Number(state.positions.get(mint)?.cost_lamports ?? 0n) / LAMPORTS);
      }

      const tryBuy = (mint: Pubkey, comp: Component, stake: number): boolean => {
        if (orders.length >= cap) return false;
        if (pendingByMint.has(mint) || buying.has(mint) || selling.has(mint)) return false;
        const existing = held.get(mint);
        const isAdd = existing !== undefined && existing.comp === comp && !existing.exiting;
        if (existing !== undefined && !isAdd) return false;
        if (!isAdd && slotsLeft <= 0) return false;
        const curve = state.curves.get(mint);
        if (curve === undefined || curve.complete) return false;
        const capSol = Number(state.maxBuyLamports(mint)) / LAMPORTS;
        let amount = Math.min(capSol, stake, params.maxExposureSol - exposure);
        if (amount > free - tx) amount = free - tx;
        if (amount < 0.005) return false;
        const lamports = BigInt(Math.floor(amount * LAMPORTS));
        if (lamports < 5_000_000n) return false;
        orders.push({ side: 'buy', mint, quote_lamports: lamports, max_slippage_bps: 10_000 });
        buying.add(mint);
        free -= amount + tx;
        exposure += amount;
        const t = tapeOf(mint);
        if (isAdd) {
          existing.invested += amount;
        } else {
          slotsLeft--;
          if (comp !== 'preserve') t.entries++;
          held.set(mint, { comp, opened: now, invested: amount, peakValue: 0, exiting: false, filled: false });
        }
        return true;
      };

      // Preserve entries: most recently traded liquid coins first.
      if (params.preserveOn && tripsDone + buying.size + selling.size < params.preserveTargetCoins && slotsLeft > 0) {
        const ranked: { mint: Pubkey; rq: number; slot: number }[] = [];
        for (const [mint, curve] of state.curves) {
          if (curve.complete) continue;
          if (tripped.has(mint) || buying.has(mint) || selling.has(mint) || held.has(mint)) continue;
          if (state.positions.has(mint)) continue;
          const c = coinsLastTrade(mint);
          if (c === null || !c.buy) continue;
          const rq = Number(curve.real_quote_reserves) / LAMPORTS;
          if (rq < params.preserveMinRealSol) continue;
          ranked.push({ mint, rq, slot: c.slot });
        }
        ranked.sort((a, b) => b.slot - a.slot || b.rq - a.rq);
        let buys = 0;
        for (const r of ranked) {
          if (buys >= 2) break;
          if (tripsDone + buying.size + selling.size >= params.preserveTargetCoins) break;
          const capLamports = state.maxBuyLamports(r.mint);
          if (capLamports < BigInt(Math.floor(params.preserveStakeSol * LAMPORTS))) continue;
          if (free < params.preserveStakeSol + 2 * tx) break;
          if (tryBuy(r.mint, 'preserve', params.preserveStakeSol)) buys++;
        }
      }

      // Selective entries, only on coins that traded this batch.
      for (const mint of traded) {
        if (orders.length >= cap) break;
        if (slotsLeft <= 0) break;
        const curve = state.curves.get(mint);
        if (curve === undefined || curve.complete) continue;
        if (held.has(mint) || buying.has(mint) || selling.has(mint) || pendingByMint.has(mint)) continue;
        const t = tapes.get(mint)!;
        const price = Number(curve.virtual_quote_reserves) / Number(curve.virtual_token_reserves);
        const rq = Number(curve.real_quote_reserves) / LAMPORTS;
        if (t.created === null) continue;
        const age = now - t.created;

        // Graduation proximity ladder: buy tier 1 when real SOL first crosses gradRq,
        // then add tier 2 / tier 3 as the curve keeps climbing (only while the position
        // is still healthy, so losers never get averaged down).
        if (params.gradOn) {
          const tiers = [params.gradRq, params.gradTier2Rq, params.gradTier3Rq];
          const stakes = [params.gradStakeSol, params.gradTier2StakeSol, params.gradTier3StakeSol];
          const tier = t.gradTier;
          const existing = held.get(mint);
          const isNew = existing === undefined || existing.comp !== 'grad';
          if (tier < tiers.length && tiers[tier]! > 0 && t.peakRq >= tiers[tier]! && (isNew ? countFor('grad') < params.gradMaxConcurrent : true)) {
            let ok = true;
            if (tier === 0) {
              const buyers = new Set<string>();
              for (const tr of t.trades) if (tr.buy) buyers.add(tr.user);
              if (buyers.size < params.gradMinBuyers) ok = false;
              if (params.gradMinRunupBuyers > 0 && t.runupBuyers.size < params.gradMinRunupBuyers) ok = false;
              if (params.gradConfirmSlots > 0 && (t.crossSlot < 0 || now - t.crossSlot < params.gradConfirmSlots)) ok = false;
              if (params.gradConfirmRq > 0 && rq < params.gradConfirmRq) ok = false;
            } else {
              const v = valueOf(mint);
              if (v === null || v.value < v.cost * 0.95) ok = false;
            }
            if (ok && tryBuy(mint, 'grad', stakes[tier]!)) {
              t.gradTier++;
              continue;
            }
          }
        }

        // Momentum: broad early buyers, price up, net inflow, near window high.
        if (params.momOn && age <= params.momMaxAge && t.entries < 2 && countFor('mom') < params.momMaxConcurrent) {
          const from = now - params.momWindow;
          let buySol = 0;
          let sellSol = 0;
          let buys = 0;
          let high = 0;
          let startPrice = -1;
          const buyers = new Set<string>();
          for (const tr of t.trades) {
            if (tr.slot <= from) {
              startPrice = tr.price;
              continue;
            }
            if (startPrice < 0) startPrice = tr.price;
            if (tr.buy) {
              buySol += tr.sol;
              buys++;
              buyers.add(tr.user);
            } else sellSol += tr.sol;
            if (tr.price > high) high = tr.price;
          }
          const net = buySol - sellSol;
          if (
            buys >= 3 &&
            buyers.size >= params.momMinBuyers &&
            net >= params.momMinNetSol &&
            startPrice > 0 &&
            price >= startPrice * (1 + params.momMinUp) &&
            price >= high * params.momNearHigh
          ) {
            if (tryBuy(mint, 'mom', params.momStakeSol)) continue;
          }
        }

        // Dip-buy: deep pullback from 15-min high, tape stabilising (recent buys present).
        if (params.dipOn && t.entries < 2 && countFor('dip') < params.dipMaxConcurrent) {
          let high15 = 0;
          let recentBuys = 0;
          let lowRecent = Infinity;
          for (const tr of t.trades) {
            if (tr.slot > now - 4200 && tr.price > high15) high15 = tr.price;
            if (tr.slot > now - 60) {
              if (tr.buy) recentBuys++;
              if (tr.price < lowRecent) lowRecent = tr.price;
            }
          }
          if (high15 > 0 && price <= high15 * params.dipFrac && recentBuys >= params.dipMinBuys && price >= lowRecent * 0.995) {
            if (tryBuy(mint, 'dip', params.dipStakeSol)) continue;
          }
        }

        // Mean reversion: mature coin in the lower quintile of its 30-min range.
        if (params.meanrevOn && age >= params.meanrevMinAge && t.trades.length >= params.meanrevMinTrades && t.entries < 2 && countFor('meanrev') < params.meanrevMaxConcurrent) {
          let high = 0;
          let low = Infinity;
          for (const tr of t.trades) {
            if (tr.slot > now - 8400) {
              if (tr.price > high) high = tr.price;
              if (tr.price < low) low = tr.price;
            }
          }
          if (high > 0 && low < Infinity && price <= low + 0.2 * (high - low)) {
            if (tryBuy(mint, 'meanrev', params.meanrevStakeSol)) continue;
          }
        }

        // Volume surge: heavy net buying over the last 30 slots with a high buy share.
        if (params.volOn && t.entries < 2 && countFor('vol') < params.volMaxConcurrent) {
          let buySol = 0;
          let sellSol = 0;
          for (const tr of t.trades) {
            if (tr.slot > now - 30) {
              if (tr.buy) buySol += tr.sol;
              else sellSol += tr.sol;
            }
          }
          const total = buySol + sellSol;
          if (buySol - sellSol >= params.volMinNetSol && total > 0 && buySol / total >= params.volMinBuyShare) {
            if (tryBuy(mint, 'vol', params.volStakeSol)) continue;
          }
        }
      }
      return orders;
    },
  };

  function coinsLastTrade(mint: Pubkey): { buy: boolean; slot: number } | null {
    const t = tapes.get(mint);
    if (t === undefined || t.trades.length === 0) return null;
    const last = t.trades[t.trades.length - 1]!;
    return { buy: last.buy, slot: last.slot };
  }
}
