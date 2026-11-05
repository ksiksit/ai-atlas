/* 일관성과 CAP: quorum reads and writes over replicas with random delays, a network partition
   handled the CP way or the AP way, and session guarantees over a lagging replica. Pure functions. */

import { rng } from '../../../../lib/math';

/* ─────────────── quorum simulation ─────────────── */

export const MAX_N = 7;
const WRITES = 200;
const WRITE_GAP = 50; // ms between successive writes from the single writer
const READS = 1000;

/** One-way network delay in ms: usually a few ms, sometimes a slow straggler. */
function delay(r: () => number): number {
  const base = 1 + -Math.log(1 - r()) * 12;
  return r() < 0.05 ? base + 80 + r() * 120 : base;
}

interface Delays {
  /** write k reaches replica j at WRITE_GAP*(k+1) + arrive[k][j]; its ack returns after back[k][j] more */
  arrive: number[][];
  back: number[][];
  reads: { t: number; order: number[]; q: number[]; r: number[] }[];
}

function makeDelays(seed: number): Delays {
  const r = rng(seed);
  const arrive: number[][] = [];
  const back: number[][] = [];
  for (let k = 0; k < WRITES; k++) {
    arrive.push(Array.from({ length: MAX_N }, () => delay(r)));
    back.push(Array.from({ length: MAX_N }, () => delay(r)));
  }
  const reads = Array.from({ length: READS }, () => {
    const t = 150 + r() * (WRITES * WRITE_GAP - 150);
    const order = Array.from({ length: MAX_N }, (_, j) => j);
    for (let j = MAX_N - 1; j > 0; j--) {
      const s = Math.floor(r() * (j + 1));
      [order[j], order[s]] = [order[s], order[j]];
    }
    return { t, order, q: Array.from({ length: MAX_N }, () => delay(r)), r: Array.from({ length: MAX_N }, () => delay(r)) };
  });
  return { arrive, back, reads };
}

const cache = new Map<number, Delays>();
const delaysFor = (seed: number) => {
  let d = cache.get(seed);
  if (!d) cache.set(seed, (d = makeDelays(seed)));
  return d;
};

const kth = (xs: number[], k: number) => [...xs].sort((a, b) => a - b)[k - 1];

export interface QuorumStats {
  n: number;
  w: number;
  r: number;
  reads: number;
  stale: number;
  /** Mean time until the writer hears W acks. */
  writeMs: number;
  /** Mean time until the reader hears R replies. */
  readMs: number;
}

export function runQuorum(n: number, w: number, rr: number, seed: number): QuorumStats {
  const D = delaysFor(seed);
  const wt = (k: number) => WRITE_GAP * (k + 1);
  // commit time of each write: when the W-th ack comes back
  const commit = D.arrive.map((a, k) => wt(k) + kth(a.slice(0, n).map((d, j) => d + D.back[k][j]), w));
  const writeMs = commit.reduce((s, c, k) => s + c - wt(k), 0) / WRITES;
  // version held by replica j at time T: the newest write that has reached it
  const versionAt = (j: number, T: number) => {
    let k = Math.min(WRITES - 1, Math.floor(T / WRITE_GAP) - 1);
    let best = -1;
    // a write older than 400 ms has surely arrived (delays are capped near 300 ms)
    for (; k >= 0 && wt(k) > T - 400; k--) if (wt(k) + D.arrive[k][j] <= T) best = Math.max(best, k);
    if (best < 0 && k >= 0) best = k;
    return best;
  };
  let stale = 0;
  let readSum = 0;
  for (const rd of D.reads) {
    const chosen = rd.order.filter((j) => j < n).slice(0, rr);
    const got = chosen.map((j) => versionAt(j, rd.t + rd.q[j]));
    const result = Math.max(...got);
    readSum += kth(
      chosen.map((j) => rd.q[j] + rd.r[j]),
      rr,
    );
    // newest write the system had already confirmed to the writer when the read began
    let committed = -1;
    for (let k = 0; k < WRITES && wt(k) <= rd.t; k++) if (commit[k] <= rd.t) committed = k;
    if (result < committed) stale++;
  }
  return { n, w, r: rr, reads: READS, stale, writeMs, readMs: readSum / READS };
}

/* ─────────────── partition: CP or AP ─────────────── */

export type CapMode = 'cp' | 'ap';
export type OpResult = 'ok' | 'rejected' | 'stale';
export interface Op {
  side: 0 | 1;
  kind: 'read' | 'write';
  result: OpResult;
  /** Version written or returned. */
  v: number;
}
export interface PartFrame {
  tick: number;
  cut: boolean;
  ops: Op[];
  /** Version held by the left pair {A, B} and the right trio {C, D, E}. */
  val: [number, number];
  served: number;
  rejected: number;
  stale: number;
  lost: number;
  note: string;
}

export const TICKS = 40;
export const CUT_FROM = 10;
export const CUT_TO = 30; // the network heals at this tick

export function runPartition(mode: CapMode, cutOn: boolean, seed: number): PartFrame[] {
  const r = rng(seed);
  // decide every client action up front so CP and AP see the same workload
  const plan = Array.from({ length: TICKS }, () => [0, 1].map(() => (r() < 0.35 ? 'write' : 'read')) as ('read' | 'write')[]);
  let val: [number, number] = [0, 0];
  let latest = 0; // newest version written anywhere, by real time
  let next = 1;
  let served = 0;
  let rejected = 0;
  let stale = 0;
  let lost = 0;
  const wroteDuring: [number[], number[]] = [[], []];
  const frames: PartFrame[] = [];
  for (let t = 0; t < TICKS; t++) {
    const cut = cutOn && t >= CUT_FROM && t < CUT_TO;
    let note = '';
    if (cutOn && t === CUT_TO) {
      // heal: the sides exchange what they have
      if (val[0] !== val[1]) {
        const keep = Math.max(val[0], val[1]);
        const loser = val[0] === keep ? 1 : 0;
        const gone = wroteDuring[loser].length;
        lost += gone;
        note = gone ? `네트워크가 다시 이어졌습니다. 두 쪽 값이 달라서 늦게 쓴 v${keep}을 남기고, ${loser ? '오른쪽' : '왼쪽'}이 끊긴 동안 쓴 ${gone}개는 버렸습니다.` : '네트워크가 다시 이어졌습니다. 늦게 쓴 값으로 두 쪽을 맞춥니다.';
        val = [keep, keep];
      } else note = '네트워크가 다시 이어졌습니다. 두 쪽 값이 같아서 맞출 것이 없습니다.';
    } else if (cutOn && t === CUT_FROM) note = `네트워크가 끊겼습니다. 왼쪽 A, B(2대)와 오른쪽 C, D, E(3대)가 서로 연락할 수 없습니다.`;
    const ops: Op[] = [];
    for (const side of [0, 1] as const) {
      const kind = plan[t][side];
      // CP: only the side that still holds a majority (3 of 5) may answer
      if (cut && mode === 'cp' && side === 0) {
        rejected++;
        ops.push({ side, kind, result: 'rejected', v: val[side] });
        continue;
      }
      served++;
      if (kind === 'write') {
        const v = next++;
        latest = v;
        if (cut) {
          val[side] = v;
          wroteDuring[side].push(v);
        } else val = [v, v];
        ops.push({ side, kind, result: 'ok', v });
      } else {
        const v = val[side];
        const isStale = v < latest;
        if (isStale) stale++;
        ops.push({ side, kind, result: isStale ? 'stale' : 'ok', v });
      }
    }
    frames.push({ tick: t, cut, ops, val: [...val] as [number, number], served, rejected, stale, lost, note });
  }
  return frames;
}

/* ─────────────── session guarantees over a lagging replica ─────────────── */

export type Routing = 'any' | 'sticky' | 'version';
export interface SessionRead {
  t: number;
  /** Replica asked, 0-based (R1 = 0). */
  rep: number;
  /** When the answer came back (later than t if the client had to wait). */
  done: number;
  fresh: boolean;
  /** Missed the client's own write. */
  ryw: boolean;
  /** Older than something the client had already seen. */
  backwards: boolean;
}

export const READ_TIMES = [60, 120, 180, 240, 300];
const ANY_ROUTE = [1, 0, 2, 1, 2];

/** The new value reaches replica 0 at time 0, replica 1 after `lag`, replica 2 after 2·lag. */
export const arrival = (rep: number, lag: number) => rep * lag;

export function runSession(lag: number, routing: Routing): SessionRead[] {
  let seen = 0; // 0 = old photo only, 1 = has seen the new one
  return READ_TIMES.map((t, i) => {
    const rep = routing === 'sticky' ? 0 : ANY_ROUTE[i];
    const ready = arrival(rep, lag);
    // with version checks the replica holds the answer until it has caught up with the client's write
    const done = routing === 'version' ? Math.max(t, ready) : t;
    const fresh = done >= ready;
    const out = { t, rep, done, fresh, ryw: !fresh, backwards: !fresh && seen > 0 };
    if (fresh) seen = 1;
    return out;
  });
}
