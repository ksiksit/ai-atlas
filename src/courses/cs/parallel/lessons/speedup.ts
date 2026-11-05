/* 병렬·분산 컴퓨팅, 1장: speedup models (Amdahl, Gustafson, overhead) and a real Web Worker benchmark. */

import { rng } from '../../../../lib/math';

/* ───────── models ───────── */

/** Amdahl: f is the fraction of the one-core run time that can be split, p the number of cores. */
export const amdahl = (f: number, p: number) => 1 / (1 - f + f / p);

/** The limit of amdahl(f, p) as p grows without bound. */
export const ceiling = (f: number) => 1 / (1 - f);

/**
 * Gustafson: s is the serial fraction of the run time measured on p cores, with the problem
 * grown so that every core stays busy. The same run on one core would take s + (1 − s)·p.
 */
export const gustafson = (s: number, p: number) => s + (1 - s) * p;

/** One segment of a core's time line, in units of the one-core run time. */
export interface Seg {
  kind: 'serial' | 'parallel' | 'overhead' | 'idle';
  t0: number;
  t1: number;
}

export interface Plan {
  lanes: Seg[][];
  /** Wall time in units of the one-core run time. */
  total: number;
  speedup: number;
}

/**
 * Time lines of p cores for a job whose one-core run time is 1: core 0 runs the serial part
 * (1 − f), then the parallel part f is cut into p chunks. `overhead` is the extra time each
 * additional core costs (starting it, sending it its chunk, collecting its result), paid by
 * core 0 before the parallel phase. With `uneven`, chunk sizes vary (seeded) instead of f/p each.
 */
export function plan(f: number, p: number, overhead = 0, uneven = false, seed = 5): Plan {
  const serial = 1 - f;
  const oh = overhead * (p - 1);
  let sizes = Array(p).fill(f / p) as number[];
  if (uneven && p > 1) {
    const r = rng(seed + p);
    const raw = sizes.map(() => 0.4 + 1.2 * r());
    const sum = raw.reduce((a, b) => a + b, 0);
    sizes = raw.map((x) => (x / sum) * f);
  }
  const start = serial + oh;
  const lanes: Seg[][] = [];
  for (let c = 0; c < p; c++) {
    const lane: Seg[] = [];
    if (c === 0) {
      if (serial > 0) lane.push({ kind: 'serial', t0: 0, t1: serial });
      if (oh > 0) lane.push({ kind: 'overhead', t0: serial, t1: start });
    } else lane.push({ kind: 'idle', t0: 0, t1: start });
    lane.push({ kind: 'parallel', t0: start, t1: start + sizes[c] });
    lanes.push(lane);
  }
  const total = start + Math.max(...sizes);
  for (const lane of lanes) {
    const end = lane[lane.length - 1].t1;
    if (end < total - 1e-12) lane.push({ kind: 'idle', t0: end, t1: total });
  }
  return { lanes, total, speedup: 1 / total };
}

/** The p (1..maxP) with the highest speedup under plan(), and that speedup. */
export function bestCores(f: number, overhead: number, uneven: boolean, maxP = 64): { p: number; speedup: number } {
  let best = { p: 1, speedup: 1 };
  for (let p = 1; p <= maxP; p++) {
    const s = plan(f, p, overhead, uneven).speedup;
    if (s > best.speedup + 1e-12) best = { p, speedup: s };
  }
  return best;
}

/* ───────── a real measurement with Web Workers ───────── */

/** CPU-bound busy work: n rounds of xorshift. Returns the state so the loop can't be optimised away. */
const WORKER_SRC = `
onmessage = (e) => {
  const n = e.data.n;
  let x = e.data.seed | 0 || 1;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; }
  postMessage({ x, ms: performance.now() - t0 });
};
`;

let blobUrl: string | null = null;
function workerUrl(): string {
  if (!blobUrl) blobUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
  return blobUrl;
}

export function workersAvailable(): boolean {
  return typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
}

/** Logical cores the browser reports (it may round down for privacy). */
export function reportedCores(): number {
  const n = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0;
  return n && n > 0 ? n : 1;
}

export interface Measure {
  p: number;
  ms: number;
  speedup: number;
}

export interface BenchOpts {
  /** Parallel fraction of the one-worker run. */
  f: number;
  /** Largest number of workers to try. */
  maxP: number;
  /** Target one-worker run time in ms. */
  targetMs?: number;
  /** Runs per p; the fastest is kept. */
  repeats?: number;
  onProgress?: (done: Measure[]) => void;
  /** Return true to stop early. */
  cancelled?: () => boolean;
}

function call(w: Worker, n: number, seed: number): Promise<number> {
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent) => resolve(e.data.ms as number);
    w.onerror = (e) => {
      e.preventDefault();
      reject(new Error(e.message || 'worker error'));
    };
    w.postMessage({ n, seed });
  });
}

/**
 * Times the same job on 1..maxP workers. The serial part runs on worker 0 alone, then the
 * parallel part is split evenly. The workers are started and warmed up before timing, so the
 * cost of creating them is not counted.
 */
export async function bench(o: BenchOpts): Promise<Measure[]> {
  const repeats = o.repeats ?? 3;
  const target = o.targetMs ?? 400;
  const pool: Worker[] = [];
  try {
    for (let i = 0; i < o.maxP; i++) pool.push(new Worker(workerUrl()));
    // warm up every worker (JIT) and calibrate the speed of one
    await Promise.all(pool.map((w, i) => call(w, 2e6, i + 1)));
    let probe = 4e6;
    let ms = await call(pool[0], probe, 7);
    while (ms < 20 && probe < 1e9) {
      probe *= 4;
      ms = await call(pool[0], probe, 7);
    }
    const total = Math.round((probe / ms) * target);
    const nSerial = Math.round(total * (1 - o.f));
    const nPar = total - nSerial;
    const out: Measure[] = [];
    for (let p = 1; p <= o.maxP; p++) {
      let best = Infinity;
      for (let k = 0; k < repeats; k++) {
        if (o.cancelled?.()) return out;
        const t0 = performance.now();
        if (nSerial > 0) await call(pool[0], nSerial, 11 + k);
        const chunk = Math.ceil(nPar / p);
        await Promise.all(pool.slice(0, p).map((w, i) => call(w, Math.max(0, Math.min(chunk, nPar - chunk * i)), 13 + i + k)));
        best = Math.min(best, performance.now() - t0);
      }
      out.push({ p, ms: best, speedup: out.length ? out[0].ms / best : 1 });
      o.onProgress?.([...out]);
    }
    return out;
  } finally {
    pool.forEach((w) => w.terminate());
  }
}
