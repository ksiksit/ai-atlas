/* 아끼는 기술: LRU 캐시, 교체 정책 시뮬레이션, 블룸 필터, HyperLogLog. Pure logic, no React. */

import { rng } from '../../../../lib/math';

/* ═══════════════════════ LRU cache, step by step ═══════════════════════ */

export interface CacheOp {
  kind: 'get' | 'put';
  key: string;
  value?: number;
}

export interface CacheEntry {
  key: string;
  value: number;
}

export type LruEvent = 'start' | 'hit' | 'miss' | 'insert' | 'update';

export interface LruFrame {
  /** Most recently used first (head → tail). */
  list: CacheEntry[];
  op: CacheOp | null;
  event: LruEvent;
  /** Key that the op touched (found, inserted or updated). */
  key: string | null;
  /** Index the touched node had before it moved to the head (hit / update). */
  from: number | null;
  evicted: CacheEntry | null;
  hits: number;
  misses: number;
  evictions: number;
  note: string;
}

/**
 * Replay get/put operations on an LRU cache of the given capacity.
 * get: hit → move to the head; miss → nothing changes.
 * put: new key → insert at the head (evict the tail first if full); existing key → update and move to the head.
 * frames[0] is the empty cache, frames[i] the state after ops[i - 1].
 */
export function lruReplay(capacity: number, ops: readonly CacheOp[]): LruFrame[] {
  let list: CacheEntry[] = [];
  let hits = 0;
  let misses = 0;
  let evictions = 0;
  const frames: LruFrame[] = [{ list, op: null, event: 'start', key: null, from: null, evicted: null, hits, misses, evictions, note: `빈 캐시입니다 (용량 ${capacity}). 재생하거나 요청을 직접 보내 보세요.` }];
  for (const op of ops) {
    const at = list.findIndex((e) => e.key === op.key);
    let event: LruEvent;
    let from: number | null = null;
    let evicted: CacheEntry | null = null;
    let note: string;
    if (op.kind === 'get') {
      if (at >= 0) {
        hits++;
        event = 'hit';
        from = at;
        const e = list[at];
        list = [e, ...list.slice(0, at), ...list.slice(at + 1)];
        note =
          at === 0
            ? `get(${op.key}): 적중 → 값 ${e.value}. 맵에서 노드를 바로 찾았고, 이미 맨 앞이라 옮길 필요가 없습니다.`
            : `get(${op.key}): 적중 → 값 ${e.value}. 맵에서 노드를 O(1)에 찾고, 리스트에서 떼어 맨 앞(가장 최근)에 다시 붙입니다.`;
      } else {
        misses++;
        event = 'miss';
        note = `get(${op.key}): 미스. 맵에 키가 없으므로 캐시는 그대로이고, 호출한 쪽이 원본에서 읽어 와야 합니다.`;
      }
    } else {
      const value = op.value ?? 0;
      if (at >= 0) {
        event = 'update';
        from = at;
        list = [{ key: op.key, value }, ...list.slice(0, at), ...list.slice(at + 1)];
        note = `put(${op.key}, ${value}): 이미 있는 키라서 값만 바꾸고 노드를 맨 앞으로 옮깁니다.`;
      } else {
        event = 'insert';
        if (list.length >= capacity) {
          evicted = list[list.length - 1];
          evictions++;
          list = list.slice(0, -1);
        }
        list = [{ key: op.key, value }, ...list];
        note = evicted
          ? `put(${op.key}, ${value}): 캐시가 가득 찼습니다. 맨 뒤(가장 오래 안 쓴) 노드를 리스트와 맵에서 지우고(퇴출: ${evicted.key}), 새 노드를 맨 앞에 붙입니다.`
          : `put(${op.key}, ${value}): 새 노드를 만들어 맨 앞에 붙이고 맵에 등록합니다.`;
      }
    }
    frames.push({ list, op, event, key: op.key, from, evicted, hits, misses, evictions, note });
  }
  return frames;
}

interface DNode<K, V> {
  key: K;
  value: V;
  prev: DNode<K, V> | null;
  next: DNode<K, V> | null;
}

/** The O(1) LRU cache from the lesson: a Map for lookup plus a doubly linked list for recency. */
export class LRUCache<K, V> {
  private map = new Map<K, DNode<K, V>>();
  private head: DNode<K, V> | null = null; // most recent
  private tail: DNode<K, V> | null = null; // least recent
  readonly capacity: number;
  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get size() {
    return this.map.size;
  }
  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;
    this.unlink(node);
    this.pushFront(node);
    return node.value;
  }
  put(key: K, value: V): K | undefined {
    const node = this.map.get(key);
    if (node) {
      node.value = value;
      this.unlink(node);
      this.pushFront(node);
      return undefined;
    }
    let evicted: K | undefined;
    if (this.map.size >= this.capacity && this.tail) {
      evicted = this.tail.key;
      this.map.delete(this.tail.key);
      this.unlink(this.tail);
    }
    const fresh: DNode<K, V> = { key, value, prev: null, next: null };
    this.pushFront(fresh);
    this.map.set(key, fresh);
    return evicted;
  }
  /** Keys from most to least recent. */
  keys(): K[] {
    const out: K[] = [];
    for (let n = this.head; n; n = n.next) out.push(n.key);
    return out;
  }
  private unlink(n: DNode<K, V>) {
    if (n.prev) n.prev.next = n.next;
    else this.head = n.next;
    if (n.next) n.next.prev = n.prev;
    else this.tail = n.prev;
    n.prev = n.next = null;
  }
  private pushFront(n: DNode<K, V>) {
    n.next = this.head;
    if (this.head) this.head.prev = n;
    this.head = n;
    if (!this.tail) this.tail = n;
  }
}

/* ═══════════════════════ request streams and replacement policies ═══════════════════════ */

export type StreamKind = 'zipf' | 'loop' | 'phase';
export type Policy = 'lru' | 'fifo' | 'lfu' | 'random' | 'opt';
export const POLICIES: Policy[] = ['lru', 'fifo', 'lfu', 'random', 'opt'];
export const POLICY_NAMES: Record<Policy, string> = { lru: 'LRU', fifo: 'FIFO', lfu: 'LFU', random: '무작위', opt: '최적 (Belady)' };

export const STREAM_LEN = 30000;
export const ZIPF_KEYS = 1000;
export const LOOP_KEYS = 200;
export const PHASE_SET = 150;
export const PHASES = 3;

/** CDF of a Zipf distribution over ranks 1..n: P(rank r) ∝ 1 / r^s. */
export function zipfCdf(n: number, s: number): Float64Array {
  const cdf = new Float64Array(n);
  let sum = 0;
  for (let r = 1; r <= n; r++) {
    sum += 1 / Math.pow(r, s);
    cdf[r - 1] = sum;
  }
  for (let i = 0; i < n; i++) cdf[i] /= sum;
  return cdf;
}

function sampleCdf(cdf: Float64Array, u: number): number {
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < u) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Popularity skew: key k (0-based rank) requested with probability ∝ 1/(k+1)^s. */
export function zipfStream(nKeys: number, s: number, len: number, seed: number): Int32Array {
  const cdf = zipfCdf(nKeys, s);
  const r = rng(seed);
  const out = new Int32Array(len);
  for (let i = 0; i < len; i++) out[i] = sampleCdf(cdf, r());
  return out;
}

/** A sequential scan 0, 1, …, loop − 1 repeated. */
export function loopStream(loop: number, len: number): Int32Array {
  const out = new Int32Array(len);
  for (let i = 0; i < len; i++) out[i] = i % loop;
  return out;
}

/**
 * Working set that changes: the stream is split into `phases` equal parts; in phase p,
 * 90% of requests go uniformly to keys [p·set, (p+1)·set) and 10% to any key of the universe.
 */
export function phaseStream(set: number, phases: number, universe: number, len: number, seed: number): Int32Array {
  const r = rng(seed);
  const out = new Int32Array(len);
  const per = Math.ceil(len / phases);
  for (let i = 0; i < len; i++) {
    const p = Math.floor(i / per);
    out[i] = r() < 0.9 ? p * set + Math.floor(r() * set) : Math.floor(r() * universe);
  }
  return out;
}

export function makeStream(kind: StreamKind, zipfS: number, seed = 7): Int32Array {
  if (kind === 'zipf') return zipfStream(ZIPF_KEYS, zipfS, STREAM_LEN, seed);
  if (kind === 'loop') return loopStream(LOOP_KEYS, STREAM_LEN);
  return phaseStream(PHASE_SET, PHASES, ZIPF_KEYS, STREAM_LEN, seed);
}

/** Number of hits when `stream` is served by a cache of `cap` items under `policy` (insert on every miss). */
export function simulate(policy: Policy, stream: Int32Array, cap: number, seed = 1): number {
  if (cap <= 0) return 0;
  switch (policy) {
    case 'lru':
      return simLru(stream, cap);
    case 'fifo':
      return simFifo(stream, cap);
    case 'lfu':
      return simLfu(stream, cap);
    case 'random':
      return simRandom(stream, cap, seed);
    case 'opt':
      return simOpt(stream, cap);
  }
}

function simLru(s: Int32Array, cap: number): number {
  // Map keeps insertion order: delete + set moves a key to the "most recent" end
  const m = new Map<number, true>();
  let hits = 0;
  for (let i = 0; i < s.length; i++) {
    const k = s[i];
    if (m.has(k)) {
      hits++;
      m.delete(k);
    } else if (m.size >= cap) {
      m.delete(m.keys().next().value as number);
    }
    m.set(k, true);
  }
  return hits;
}

function simFifo(s: Int32Array, cap: number): number {
  const m = new Set<number>();
  let hits = 0;
  for (let i = 0; i < s.length; i++) {
    const k = s[i];
    if (m.has(k)) {
      hits++;
      continue; // a hit does not change the order
    }
    if (m.size >= cap) m.delete(m.values().next().value as number);
    m.add(k);
  }
  return hits;
}

/** LFU with O(1) frequency buckets; ties are broken by least recently used. Counts reset on eviction. */
function simLfu(s: Int32Array, cap: number): number {
  const freq = new Map<number, number>();
  const buckets = new Map<number, Set<number>>();
  let minF = 0;
  let hits = 0;
  const bump = (k: number, f: number) => {
    const b = buckets.get(f)!;
    b.delete(k);
    if (!b.size) {
      buckets.delete(f);
      if (minF === f) minF = f + 1;
    }
    freq.set(k, f + 1);
    let nb = buckets.get(f + 1);
    if (!nb) buckets.set(f + 1, (nb = new Set()));
    nb.add(k);
  };
  for (let i = 0; i < s.length; i++) {
    const k = s[i];
    const f = freq.get(k);
    if (f !== undefined) {
      hits++;
      bump(k, f);
      continue;
    }
    if (freq.size >= cap) {
      const b = buckets.get(minF)!;
      const victim = b.values().next().value as number;
      b.delete(victim);
      if (!b.size) buckets.delete(minF);
      freq.delete(victim);
    }
    freq.set(k, 1);
    let b1 = buckets.get(1);
    if (!b1) buckets.set(1, (b1 = new Set()));
    b1.add(k);
    minF = 1;
  }
  return hits;
}

function simRandom(s: Int32Array, cap: number, seed: number): number {
  const r = rng(seed);
  const keys: number[] = [];
  const at = new Map<number, number>();
  let hits = 0;
  for (let i = 0; i < s.length; i++) {
    const k = s[i];
    if (at.has(k)) {
      hits++;
      continue;
    }
    if (keys.length >= cap) {
      const j = Math.floor(r() * keys.length);
      const victim = keys[j];
      const last = keys.pop()!;
      at.delete(victim);
      if (j < keys.length) {
        keys[j] = last;
        at.set(last, j);
      }
    }
    at.set(k, keys.length);
    keys.push(k);
  }
  return hits;
}

/** Belady's optimal policy: evict the key whose next request is farthest away (or never). Max-heap with lazy deletion. */
function simOpt(s: Int32Array, cap: number): number {
  const n = s.length;
  const next = new Int32Array(n);
  const seen = new Map<number, number>();
  for (let i = n - 1; i >= 0; i--) {
    next[i] = seen.get(s[i]) ?? n + i; // never again: farther than any real index, distinct per key
    seen.set(s[i], i);
  }
  const cur = new Map<number, number>(); // key → its next-use time
  const hn: number[] = []; // heap of next-use times
  const hk: number[] = []; // matching keys
  const push = (t: number, k: number) => {
    let i = hn.length;
    hn.push(t);
    hk.push(k);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hn[p] >= hn[i]) break;
      [hn[p], hn[i]] = [hn[i], hn[p]];
      [hk[p], hk[i]] = [hk[i], hk[p]];
      i = p;
    }
  };
  const pop = () => {
    const t = hn[0];
    const k = hk[0];
    const lt = hn.pop()!;
    const lk = hk.pop()!;
    if (hn.length) {
      hn[0] = lt;
      hk[0] = lk;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let c = i;
        if (l < hn.length && hn[l] > hn[c]) c = l;
        if (r < hn.length && hn[r] > hn[c]) c = r;
        if (c === i) break;
        [hn[c], hn[i]] = [hn[i], hn[c]];
        [hk[c], hk[i]] = [hk[i], hk[c]];
        i = c;
      }
    }
    return [t, k] as const;
  };
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const k = s[i];
    if (cur.has(k)) {
      hits++;
    } else if (cur.size >= cap) {
      for (;;) {
        const [t, v] = pop();
        if (cur.get(v) === t) {
          cur.delete(v);
          break;
        }
      }
    }
    cur.set(k, next[i]);
    push(next[i], k);
  }
  return hits;
}

/**
 * LRU hit counts for every cache size at once (Mattson's stack algorithm): a request hits in an
 * LRU cache of size C exactly when fewer than C distinct keys were requested since its previous request.
 * Returns hitsAtSize[c] for c = 0..maxCap. A Fenwick tree over time counts the distinct keys in O(log n).
 */
export function lruHitCurve(s: Int32Array, maxCap: number): Float64Array {
  const n = s.length;
  const tree = new Int32Array(n + 1);
  const add = (i: number, d: number) => {
    for (i++; i <= n; i += i & -i) tree[i] += d;
  };
  const sum = (i: number) => {
    let t = 0;
    for (i++; i > 0; i -= i & -i) t += tree[i];
    return t;
  };
  const last = new Map<number, number>();
  const dist = new Int32Array(maxCap + 2); // dist[d]: requests whose stack distance is d (1-based)
  for (let t = 0; t < n; t++) {
    const k = s[t];
    const p = last.get(k);
    if (p !== undefined) {
      // distinct keys whose latest request lies in (p, t), plus the key itself
      const d = sum(t - 1) - sum(p) + 1;
      if (d <= maxCap) dist[d]++;
      add(p, -1);
    }
    add(t, 1);
    last.set(k, t);
  }
  const hits = new Float64Array(maxCap + 1);
  for (let c = 1; c <= maxCap; c++) hits[c] = hits[c - 1] + dist[c];
  return hits;
}

/** Average latency of a cache with hit rate h. */
export const avgLatency = (h: number, tHit: number, tMiss: number) => h * tHit + (1 - h) * tMiss;

/* ═══════════════════════ hashing ═══════════════════════ */

/** 32-bit FNV-1a over UTF-16 code units. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** MurmurHash3's 32-bit finalizer: mixes every input bit into every output bit (a bijection). */
export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Two independent-looking 32-bit hashes of a string; h2 is odd. */
export function hashPair(s: string): [number, number] {
  const a = fnv1a(s);
  return [fmix32(a), fmix32(a ^ 0x9e3779b9) | 1];
}

/** Bit position of the i-th hash function, by double hashing: (h1 + i·h2) mod m. */
export const bloomPos = (h1: number, h2: number, i: number, m: number) => ((h1 + Math.imul(i, h2)) >>> 0) % m;

export function bloomPositions(s: string, k: number, m: number): number[] {
  const [h1, h2] = hashPair(s);
  return Array.from({ length: k }, (_, i) => bloomPos(h1, h2, i, m));
}

/* ═══════════════════════ Bloom filter ═══════════════════════ */

export function bloomBits(words: readonly string[], k: number, m: number): Uint8Array {
  const bits = new Uint8Array(m);
  for (const w of words) for (const p of bloomPositions(w, k, m)) bits[p] = 1;
  return bits;
}

/** Theoretical false-positive rate (1 − e^(−kn/m))^k. */
export const bloomFpr = (k: number, n: number, m: number) => Math.pow(1 - Math.exp((-k * n) / m), k);

/** Bits per item for a target false-positive rate with the optimal k: −ln p / (ln 2)². */
export const bitsForFpr = (p: number) => -Math.log(p) / (Math.LN2 * Math.LN2);

/** Precomputed hash pairs for a set of inserted items and a separate set of non-members. */
export interface FprSample {
  ins: Uint32Array; // h1, h2 interleaved
  qry: Uint32Array;
}

export function fprSample(nIns: number, nQry: number): FprSample {
  const ins = new Uint32Array(nIns * 2);
  const qry = new Uint32Array(nQry * 2);
  for (let i = 0; i < nIns; i++) [ins[2 * i], ins[2 * i + 1]] = hashPair(`user:${i}`);
  for (let i = 0; i < nQry; i++) [qry[2 * i], qry[2 * i + 1]] = hashPair(`guest:${i}`);
  return { ins, qry };
}

/** Measured false-positive rate: insert every item of the sample into m bits with k hashes, then query the non-members. */
export function measureFpr(sm: FprSample, k: number, m: number): number {
  const bits = new Uint8Array(m);
  const n = sm.ins.length / 2;
  for (let j = 0; j < n; j++) {
    const h1 = sm.ins[2 * j];
    const h2 = sm.ins[2 * j + 1];
    for (let i = 0; i < k; i++) bits[bloomPos(h1, h2, i, m)] = 1;
  }
  const q = sm.qry.length / 2;
  let fp = 0;
  for (let j = 0; j < q; j++) {
    const h1 = sm.qry[2 * j];
    const h2 = sm.qry[2 * j + 1];
    let all = true;
    for (let i = 0; i < k && all; i++) if (!bits[bloomPos(h1, h2, i, m)]) all = false;
    if (all) fp++;
  }
  return fp / q;
}

/* ═══════════════════════ HyperLogLog ═══════════════════════ */

export function hllAlpha(m: number): number {
  if (m === 16) return 0.673;
  if (m === 32) return 0.697;
  if (m === 64) return 0.709;
  return 0.7213 / (1 + 1.079 / m);
}

export interface HllEstimate {
  raw: number;
  est: number;
  zeros: number;
  linear: boolean;
}

/** Standard HyperLogLog estimate (Flajolet et al. 2007) with the small-range (linear counting) correction. */
export function hllEstimate(regs: Uint8Array): HllEstimate {
  const m = regs.length;
  let sum = 0;
  let zeros = 0;
  for (let j = 0; j < m; j++) {
    sum += Math.pow(2, -regs[j]);
    if (regs[j] === 0) zeros++;
  }
  const raw = (hllAlpha(m) * m * m) / sum;
  if (raw <= 2.5 * m && zeros > 0) return { raw, est: m * Math.log(m / zeros), zeros, linear: true };
  // large-range correction for a 32-bit hash; never reached at the sizes in this lesson
  if (raw > 2 ** 32 / 30) return { raw, est: -(2 ** 32) * Math.log(1 - raw / 2 ** 32), zeros, linear: false };
  return { raw, est: raw, zeros, linear: false };
}

/** Add a 32-bit hash to the registers: top p bits pick the register, the rest give the rank (leading zeros + 1). */
export function hllAdd(regs: Uint8Array, p: number, h: number) {
  const j = h >>> (32 - p);
  const w = (h << p) >>> 0;
  const rank = w === 0 ? 32 - p + 1 : Math.clz32(w) + 1;
  if (rank > regs[j]) regs[j] = rank;
}

/** Hash of the i-th distinct item of stream `seed` (fmix32 is a bijection, so distinct items get distinct hashes). */
export const itemHash = (i: number, seed: number) => fmix32((Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(seed + 1, 0x85ebca6b)) >>> 0);

/** Checkpoints n = 10^1.0, 10^1.1, …, 10^6.0. */
export const HLL_NS: number[] = Array.from({ length: 51 }, (_, i) => Math.round(Math.pow(10, 1 + i / 10)));

export interface HllRun {
  est: Float64Array; // estimate at each checkpoint
  snaps: Uint8Array[] | null; // registers at each checkpoint (only when asked)
}

/** Stream HLL_NS[last] distinct items of one seed into m registers, recording the estimate at each checkpoint. */
export function hllRun(m: number, seed: number, withSnaps: boolean): HllRun {
  const p = Math.round(Math.log2(m));
  const regs = new Uint8Array(m);
  const est = new Float64Array(HLL_NS.length);
  const snaps: Uint8Array[] | null = withSnaps ? [] : null;
  let i = 0;
  for (let c = 0; c < HLL_NS.length; c++) {
    for (; i < HLL_NS[c]; i++) hllAdd(regs, p, itemHash(i, seed));
    est[c] = hllEstimate(regs).est;
    if (snaps) snaps.push(regs.slice());
  }
  return { est, snaps };
}

/** Root-mean-square relative error over several runs at checkpoint c. */
export function rmsRelError(runs: readonly HllRun[], c: number): number {
  const n = HLL_NS[c];
  let s = 0;
  for (const r of runs) s += ((r.est[c] - n) / n) ** 2;
  return Math.sqrt(s / runs.length);
}
