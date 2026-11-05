/* 데이터 병렬과 GPU: pure models behind the lesson's figures. */

/* ── SIMD: how many instructions an n-element vector add takes ── */

/** Instructions needed to add two n-element arrays with `width` lanes per instruction. */
export const simdInstrs = (n: number, width: number) => Math.ceil(n / width);

/* ── warps and branch divergence ── */

export const WARP = 32;

export type CondKind = 'mod' | 'warp';

/** Does thread i take the if-branch? 'mod': i % k < m. 'warp': its warp number is even. */
export function takes(kind: CondKind, i: number, k: number, m: number): boolean {
  return kind === 'mod' ? i % k < m : Math.floor(i / WARP) % 2 === 0;
}

export interface WarpRun {
  /** Per thread: true = if-branch, false = else-branch. */
  lanes: boolean[];
  /** Cycles the warp spends: both branch costs when its threads disagree. */
  cycles: number;
  diverged: boolean;
}

export interface DivergenceResult {
  warps: WarpRun[];
  cycles: number;
  /** Useful lane-cycles over all lane-cycles the warps occupy. */
  utilization: number;
}

/** Run `nWarps` warps of 32 threads through `if (cond) A else B` costing a and b cycles. */
export function divergence(kind: CondKind, k: number, m: number, a: number, b: number, nWarps: number): DivergenceResult {
  const warps: WarpRun[] = [];
  let useful = 0;
  let total = 0;
  for (let w = 0; w < nWarps; w++) {
    const lanes = Array.from({ length: WARP }, (_, j) => takes(kind, w * WARP + j, k, m));
    const nIf = lanes.filter(Boolean).length;
    const cycles = (nIf > 0 ? a : 0) + (nIf < WARP ? b : 0);
    useful += nIf * a + (WARP - nIf) * b;
    total += WARP * cycles;
    warps.push({ lanes, cycles, diverged: nIf > 0 && nIf < WARP });
  }
  return { warps, cycles: warps.reduce((s, w) => s + w.cycles, 0), utilization: total ? useful / total : 1 };
}

/* ── roofline ── */

/** A made-up but realistic GPU: 20 TFLOP/s of float32 math, 1 TB/s of memory bandwidth. */
export const PEAK_TFLOPS = 20;
export const BW_TBS = 1;
export const RIDGE = PEAK_TFLOPS / BW_TBS; // FLOP per byte where the two limits meet

/** Attainable TFLOP/s at arithmetic intensity `ai` (FLOP per byte moved from memory). */
export const attainable = (ai: number) => Math.min(PEAK_TFLOPS, ai * BW_TBS);

export interface Kernel {
  id: string;
  name: string;
  /** FLOP per byte. */
  ai: number;
  note: string;
}

export const KERNELS: Kernel[] = [
  { id: 'add', name: '벡터 더하기', ai: 1 / 12, note: 'c[i] = a[i] + b[i]: 덧셈 1번에 4바이트 둘을 읽고 4바이트 하나를 씁니다.' },
  { id: 'saxpy', name: 'y = a·x + y', ai: 2 / 12, note: '곱셈과 덧셈 2번에 x와 y를 읽고 y를 씁니다.' },
  { id: 'naive', name: '행렬 곱 (타일 없음)', ai: 1 / 4, note: '곱셈·덧셈 한 쌍마다 A와 B에서 4바이트씩 새로 읽습니다.' },
  { id: 'tile16', name: '행렬 곱 (16×16 타일)', ai: 16 / 4, note: '한 번 읽은 값을 공유 메모리에서 16번 다시 씁니다.' },
  { id: 'tile128', name: '행렬 곱 (128×128 타일)', ai: 128 / 4, note: '실제 라이브러리처럼 레지스터와 공유 메모리로 크게 묶은 경우입니다.' },
];

/* ── tiled matrix multiply ── */

export interface TileCount {
  /** Elements read from global memory to compute all of C (N×N). */
  loads: number;
  /** Multiply-add pairs: N³. */
  fmas: number;
  /** FLOP per byte with 4-byte floats: 2N³ / (4 · loads). */
  ai: number;
  /** Shared memory one block needs for one A tile and one B tile, in bytes. */
  sharedBytes: number;
  tiles: number;
  /** How many times each loaded element is used. */
  reuse: number;
}

/** Global-memory reads for C = A·B (N×N) with T×T tiles. T = 1 is the untiled kernel. */
export function tileCount(n: number, t: number): TileCount {
  const loads = (2 * n ** 3) / t;
  return { loads, fmas: n ** 3, ai: (2 * n ** 3) / (4 * loads), sharedBytes: t === 1 ? 0 : 2 * t * t * 4, tiles: (n / t) ** 2, reuse: t };
}
