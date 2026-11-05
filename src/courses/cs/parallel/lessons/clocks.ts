/* 시간과 순서: physical clock drift, last-write-wins, Lamport and vector clocks, and a
   Dynamo-style shopping cart that keeps concurrent versions as siblings. Pure functions only. */

import { rng } from '../../../../lib/math';

/* ─────────────── physical clocks ─────────────── */

/** Offset (ms) of one clock from true time, sampled once a minute over `hours`. */
export function driftSeries(ppm: number, syncEveryMin: number, hours: number, seed: number): number[] {
  const r = rng(seed);
  const out: number[] = [];
  let off = 0;
  let since = 0;
  for (let m = 0; m <= hours * 60; m++) {
    out.push(off);
    off += (ppm * 60_000) / 1e6; // ppm of a minute, in ms
    since++;
    if (syncEveryMin > 0 && since >= syncEveryMin) {
      // NTP sets the clock to the server's time, give or take the network's error
      off = (r() * 2 - 1) * 4;
      since = 0;
    }
  }
  return out;
}

export const maxAbs = (xs: number[]) => xs.reduce((a, b) => Math.max(a, Math.abs(b)), 0);

/** Two writes to the same key; each server stamps its write with its own clock. */
export interface LwwResult {
  real: [number, number];
  stamp: [number, number];
  /** Index of the write that survives (0 = the earlier one, through server A). */
  winner: 0 | 1;
  lost: boolean;
}

export function lww(skewA: number, gap: number): LwwResult {
  const t0 = 1000;
  const real: [number, number] = [t0, t0 + gap];
  const stamp: [number, number] = [t0 + skewA, t0 + gap];
  // equal stamps need a tiebreak; here server A's id wins, so B must be strictly later
  const winner: 0 | 1 = stamp[0] >= stamp[1] ? 0 : 1;
  return { real, stamp, winner, lost: winner === 0 };
}

/* ─────────────── space-time diagram ─────────────── */

export type EvKind = 'local' | 'send' | 'recv';

export interface Ev {
  id: number;
  /** Process index. */
  p: number;
  /** Position along the process line, in abstract time units. */
  x: number;
  kind: EvKind;
  /** For a receive: the id of the matching send. */
  from?: number;
}

export interface Clocked extends Ev {
  /** Short name like "a", "b". */
  name: string;
  lamport: number;
  vec: number[];
}

export const NPROC = 3;

/** Lamport and vector timestamps for every event. Sends always sit left of their receives. */
export function stamp(evs: Ev[]): Clocked[] {
  const order = [...evs].sort((a, b) => a.x - b.x || a.id - b.id);
  const L = Array(NPROC).fill(0);
  const V = Array.from({ length: NPROC }, () => Array(NPROC).fill(0));
  const byId = new Map<number, Clocked>();
  for (const e of order) {
    let l = L[e.p];
    const v = [...V[e.p]];
    if (e.kind === 'recv' && e.from !== undefined) {
      const s = byId.get(e.from);
      if (s) {
        l = Math.max(l, s.lamport);
        for (let k = 0; k < NPROC; k++) v[k] = Math.max(v[k], s.vec[k]);
      }
    }
    l += 1;
    v[e.p] += 1;
    L[e.p] = l;
    V[e.p] = v;
    byId.set(e.id, { ...e, name: '', lamport: l, vec: v });
  }
  // names follow ids, so an event keeps its name when others are added or removed
  for (const e of byId.values()) e.name = eventName(e.id - 1);
  return evs.map((e) => byId.get(e.id)!);
}

export function eventName(i: number): string {
  const al = 'abcdefghijklmnopqrstuvwxyz';
  return i < 26 ? al[i] : al[Math.floor(i / 26) - 1] + al[i % 26];
}

export const vecLeq = (a: number[], b: number[]) => a.every((v, k) => v <= b[k]);
/** a → b (a happened before b). */
export const before = (a: Clocked, b: Clocked) => a.id !== b.id && vecLeq(a.vec, b.vec);
export const concurrent = (a: Clocked, b: Clocked) => a.id !== b.id && !before(a, b) && !before(b, a);

/** A chain of events from a to b, following process order and messages; null when a ↛ b. */
export function chain(evs: Clocked[], a: Clocked, b: Clocked): Clocked[] | null {
  const next = new Map<number, Clocked[]>();
  for (let p = 0; p < NPROC; p++) {
    const line = evs.filter((e) => e.p === p).sort((x, y) => x.x - y.x);
    for (let k = 0; k + 1 < line.length; k++) next.set(line[k].id, [...(next.get(line[k].id) ?? []), line[k + 1]]);
  }
  for (const e of evs) {
    if (e.kind === 'recv' && e.from !== undefined) next.set(e.from, [...(next.get(e.from) ?? []), e]);
  }
  const prev = new Map<number, Clocked | null>([[a.id, null]]);
  const q = [a];
  while (q.length) {
    const u = q.shift()!;
    if (u.id === b.id) break;
    for (const v of next.get(u.id) ?? []) {
      if (prev.has(v.id)) continue;
      prev.set(v.id, u);
      q.push(v);
    }
  }
  if (!prev.has(b.id) || a.id === b.id) return null;
  const path: Clocked[] = [];
  for (let c: Clocked | null | undefined = b; c; c = prev.get(c.id)) path.unshift(c);
  return path;
}

/** Pairs where Lamport says "earlier" but the events are concurrent. */
export function lamportFalseOrders(evs: Clocked[]): [Clocked, Clocked][] {
  const out: [Clocked, Clocked][] = [];
  for (const a of evs) for (const b of evs) if (a.lamport < b.lamport && concurrent(a, b)) out.push([a, b]);
  return out;
}

export function countPairs(evs: Clocked[]) {
  let ordered = 0;
  let conc = 0;
  for (let i = 0; i < evs.length; i++)
    for (let j = i + 1; j < evs.length; j++) {
      if (concurrent(evs[i], evs[j])) conc++;
      else ordered++;
    }
  return { ordered, conc };
}

/** The diagram the figure opens with. Ids run in reading order, so names are a…j. */
export function exampleEvents(): Ev[] {
  return [
    { id: 1, p: 0, x: 1, kind: 'local' }, // a
    { id: 2, p: 0, x: 2, kind: 'send' }, // b → e
    { id: 3, p: 0, x: 8, kind: 'recv', from: 7 }, // c ← g
    { id: 4, p: 1, x: 1.5, kind: 'local' }, // d
    { id: 5, p: 1, x: 3.5, kind: 'recv', from: 2 }, // e
    { id: 6, p: 1, x: 5, kind: 'send' }, // f → i
    { id: 7, p: 1, x: 6, kind: 'send' }, // g → c
    { id: 8, p: 2, x: 2.5, kind: 'local' }, // h
    { id: 9, p: 2, x: 6.5, kind: 'recv', from: 6 }, // i
    { id: 10, p: 2, x: 8, kind: 'local' }, // j
  ];
}

/** Ids of g and j in the example: concurrent, yet Lamport orders them. */
export const EXAMPLE_PICK = [7, 10];

/* ─────────────── shopping cart with versions ─────────────── */

export type CartMode = 'vector' | 'lww';
export type CartAction = { kind: 'add'; at: 0 | 1 } | { kind: 'sync' };

export const ITEMS = ['우유', '빵', '달걀', '사과', '커피', '치즈', '바나나', '김', '두부', '라면'];

export interface Version {
  items: string[];
  /** Vector clock indexed by replica (A, B). */
  vec: [number, number];
  /** Wall-clock order of the write, for last-write-wins. */
  t: number;
}

export interface CartState {
  /** Versions held by replica A and B; more than one means siblings (a conflict). */
  rep: [Version[], Version[]];
  /** Every item any client ever added. */
  added: string[];
  log: string[];
}

const dominates = (a: Version, b: Version) => a.vec[0] >= b.vec[0] && a.vec[1] >= b.vec[1] && (a.vec[0] > b.vec[0] || a.vec[1] > b.vec[1]);
const sameVec = (a: Version, b: Version) => a.vec[0] === b.vec[0] && a.vec[1] === b.vec[1];

/** Keep only versions no other version supersedes. */
function prune(vs: Version[], mode: CartMode): Version[] {
  if (mode === 'lww') return vs.length ? [vs.reduce((a, b) => (b.t > a.t ? b : a))] : [];
  const out: Version[] = [];
  for (const v of vs) {
    if (vs.some((w) => w !== v && dominates(w, v))) continue;
    if (out.some((w) => sameVec(w, v))) continue;
    out.push(v);
  }
  return out;
}

export function runCart(actions: CartAction[], mode: CartMode): CartState[] {
  const states: CartState[] = [{ rep: [[], []], added: [], log: [] }];
  let t = 0;
  for (const a of actions) {
    const s = states[states.length - 1];
    const rep: [Version[], Version[]] = [[...s.rep[0]], [...s.rep[1]]];
    const added = [...s.added];
    let msg: string;
    t++;
    if (a.kind === 'add') {
      const here = rep[a.at];
      // the client reads every sibling, merges them, adds one item and writes back
      const items = [...new Set(here.flatMap((v) => v.items))];
      const vec: [number, number] = [Math.max(0, ...here.map((v) => v.vec[0])), Math.max(0, ...here.map((v) => v.vec[1]))];
      const item = ITEMS[added.length % ITEMS.length];
      added.push(item);
      vec[a.at] += 1;
      const merged = here.length > 1;
      rep[a.at] = prune([...here, { items: [...items, item], vec, t }], mode);
      msg = `${a.at ? 'B' : 'A'}에서 ${item} 담기${merged ? ` (갈래 ${here.length}개를 합친 뒤)` : ''}`;
    } else {
      const all = [...rep[0], ...rep[1]];
      const both = prune(all, mode);
      rep[0] = both;
      rep[1] = [...both];
      msg = both.length > 1 ? `동기화: 동시에 고친 갈래 ${both.length}개가 남음` : '동기화';
    }
    states.push({ rep, added, log: [...s.log, msg] });
  }
  return states;
}

/** Items that were added but appear in no version on either replica. */
export function lostItems(s: CartState): string[] {
  const have = new Set([...s.rep[0], ...s.rep[1]].flatMap((v) => v.items));
  return s.added.filter((x) => !have.has(x));
}

export const EXAMPLE_CART: CartAction[] = [{ kind: 'add', at: 0 }, { kind: 'sync' }, { kind: 'add', at: 0 }, { kind: 'add', at: 1 }, { kind: 'sync' }];
