// Tournament runner for the pump.fun paper sprint (my own evaluation harness).
//
// Loads the kit's full 24h dev dataset (all three parts), builds the full window plus four
// consecutive 6-hour quarters (the final phase is a fresh 6h window, so a strategy that only
// wins on the full 24h but loses 3 of 4 quarters is a fluke), and runs a candidate bot through
// the kit's own replay engine (tools/sim.ts) on each window.
//
//   node runner.ts <candidate.ts> [params-json] [--trips]
//
// A candidate module exports `createBot(params)` returning a Bot { onBatch(state, batch) }.
// Prints net PnL (SOL), fills, distinct mints, round trips, win rate, max drawdown, the share
// of net PnL from the 3 best coins, and the per-quarter nets. Deterministic: no clock, no
// Math.random anywhere; the only randomness is the engine's seeded failed-tx draw.

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { simulate, makeHello, phaseSeed, type Dataset } from '../../u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b-kit/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b-kit/baselines/pilot/momentum/tools/sim.ts';

const KIT =
  '/home/hatch/workspace/makefun/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b-kit/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b-kit';
const SLUG = 'u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b';

interface RawEvent {
  event: string;
  slot: number;
  mint: string;
  [k: string]: unknown;
}

function loadAllEvents(): RawEvent[] {
  const out: RawEvent[] = [];
  for (let i = 0; i <= 2; i++) {
    const raw = gunzipSync(readFileSync(`${KIT}/dataset/events/part-0000${i}.ndjson.gz`)).toString('utf8');
    for (const line of raw.split('\n')) {
      if (line.length > 0) out.push(JSON.parse(line) as RawEvent);
    }
  }
  out.sort((a, b) => a.slot - b.slot);
  return out;
}

function toDataset(events: RawEvent[], endSlot: number, sha: string): Dataset {
  const batches: { slot: number; events: RawEvent[] }[] = [];
  for (const e of events) {
    const tail = batches[batches.length - 1];
    if (tail !== undefined && tail.slot === e.slot) tail.events.push(e as never);
    else batches.push({ slot: e.slot, events: [e as never] });
  }
  return { sha256: sha, events: events as never[], endSlot, batches: batches as never[] };
}

function windowDataset(all: RawEvent[], startSlot: number, endSlot: number, sha: string): Dataset {
  // Fresh-window semantics: only mints created inside the window, only their events inside it.
  const created = new Set<string>();
  for (const e of all) {
    if (e.slot >= startSlot && e.slot < endSlot && e.event === 'CreateEvent') created.add(e.mint);
  }
  const evs = all.filter((e) => e.slot >= startSlot && e.slot < endSlot && created.has(e.mint));
  return toDataset(evs, endSlot, sha);
}

const sol = (x: bigint) => Number(x) / 1e9;

async function main() {
  const candPath = process.argv[2];
  if (candPath === undefined) {
    console.error('usage: node runner.ts <candidate.ts> [params-json] [--trips]');
    process.exit(2);
  }
  const params = process.argv[3] !== undefined && process.argv[3].startsWith('{') ? JSON.parse(process.argv[3]) : {};
  const showTrips = process.argv.includes('--trips');
  const mod = await import(candPath);
  const createBot = mod.createBot as (p: unknown) => { onBatch: (s: never, b: never) => unknown };
  const all = loadAllEvents();
  const sha = createHash('sha256').update(JSON.stringify(all.length)).digest('hex');
  const firstSlot = all[0]!.slot;
  const lastSlot = all[all.length - 1]!.slot;
  const span = lastSlot - firstSlot;
  const q = Math.floor(span / 4);

  const windows: { name: string; ds: Dataset; seedPhase: string }[] = [];
  windows.push({ name: 'FULL24h', ds: windowDataset(all, firstSlot, lastSlot + 1, sha), seedPhase: 'dev' });
  for (let i = 0; i < 4; i++) {
    const s = firstSlot + i * q;
    const e = i === 3 ? lastSlot + 1 : firstSlot + (i + 1) * q;
    windows.push({ name: `Q${i + 1}`, ds: windowDataset(all, s, e, sha), seedPhase: `dev-q${i + 1}` });
  }

  const results: { name: string; net: number; fills: number; mints: number; trips: number; wins: number; dd: number; top3: number }[] = [];
  for (const w of windows) {
    const hello = makeHello(phaseSeed(SLUG, w.seedPhase, sha));
    const bot = createBot(params);
    const r = simulate(w.ds, hello, bot as never);
    const wins = r.trips.filter((t) => t.pnl > 0n).length;
    const sorted = [...r.perMint.values()].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
    const top3 = sorted.slice(0, 3).reduce((a, b) => a + b, 0n);
    const top3share = r.netPnl > 0n ? Number(top3) / Number(r.netPnl) : Number(top3) / 1e9;
    results.push({
      name: w.name,
      net: sol(r.netPnl),
      fills: r.fills,
      mints: r.mints,
      trips: r.trips.length,
      wins,
      dd: r.maxDrawdown,
      top3: top3share,
    });
    console.log(
      `${w.name.padEnd(8)} net ${sol(r.netPnl).toFixed(4).padStart(8)} SOL  fills ${String(r.fills).padStart(4)}  coins ${String(r.mints).padStart(3)}  trips ${String(r.trips.length).padStart(3)}  wins ${wins}  dd ${r.maxDrawdown.toFixed(3)}  top3 ${top3share.toFixed(2)}  rejected ${r.rejected} failed ${r.failed}`,
    );
    if (showTrips && w.name === 'FULL24h') {
      const trips = [...r.trips].sort((a, b) => (a.pnl < b.pnl ? 1 : -1));
      for (const t of trips.slice(0, 10)) console.log(`  trip ${t.mint.slice(0, 8)} pnl ${sol(t.pnl).toFixed(4)}`);
      for (const t of trips.slice(-5)) console.log(`  trip ${t.mint.slice(0, 8)} pnl ${sol(t.pnl).toFixed(4)}`);
    }
  }
  const full = results[0]!;
  const quarters = results.slice(1);
  const qWins = quarters.filter((r) => r.net > 0).length;
  const qMedian = [...quarters].sort((a, b) => a.net - b.net)[1]!.net + ([...quarters].sort((a, b) => a.net - b.net)[2]!.net - [...quarters].sort((a, b) => a.net - b.net)[1]!.net) / 2;
  console.log(
    `SUMMARY full=${full.net.toFixed(4)} quarters=[${quarters.map((r) => r.net.toFixed(3)).join(', ')}] qProfitable=${qWins}/4 qMedian~${qMedian.toFixed(4)} dd=${full.dd.toFixed(3)} coins=${full.mints} trips=${full.trips}`,
  );
}

await main();
