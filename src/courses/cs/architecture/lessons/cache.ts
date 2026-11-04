/* 컴퓨터 구조: a small set-associative CPU cache fed by 2D array traversals */

export const ROWS = 16;
export const COLS = 16;
export const ELEM = 4; // bytes per element (an int32)
export const LINE = 32; // bytes per cache line
export const PER_LINE = LINE / ELEM; // elements per line
export const LINES_PER_ROW = COLS / PER_LINE;
export const TOTAL_LINES = (ROWS * COLS) / PER_LINE;

export type Order = 'row' | 'col';

/** Element indices in the order a nested loop visits them. */
export function traversal(order: Order): number[] {
  const out: number[] = [];
  for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) out.push(order === 'row' ? i * COLS + j : j * COLS + i);
  return out;
}

export interface CacheFrame {
  k: number; // accesses done
  idx: number; // element just accessed (-1 before the first)
  line: number;
  set: number;
  hit: boolean;
  evicted: number | null; // memory line thrown out
  /** sets × ways: memory line held, or -1; ways ordered most recent first */
  sets: number[][];
  hits: number;
  misses: number;
}

/**
 * Simulate `lines` cache lines arranged as `lines / ways` sets of `ways` lines each, with LRU inside a set.
 * A memory line can only go into set (line mod sets); its tag is line / sets.
 */
export function simulateCache(order: Order, lines: number, ways: number): CacheFrame[] {
  const nSets = lines / ways;
  const sets: number[][] = Array.from({ length: nSets }, () => []);
  const frames: CacheFrame[] = [];
  const snap = () => sets.map((s) => [...s, ...new Array(ways - s.length).fill(-1)]);
  let hits = 0;
  let misses = 0;
  frames.push({ k: 0, idx: -1, line: -1, set: -1, hit: false, evicted: null, sets: snap(), hits, misses });
  traversal(order).forEach((idx, k) => {
    const line = Math.floor(idx / PER_LINE);
    const set = line % nSets;
    const s = sets[set];
    const at = s.indexOf(line);
    let evicted: number | null = null;
    const hit = at >= 0;
    if (hit) {
      s.splice(at, 1);
      hits++;
    } else {
      misses++;
      if (s.length >= ways) evicted = s.pop()!;
    }
    s.unshift(line);
    frames.push({ k: k + 1, idx, line, set, hit, evicted, sets: snap(), hits, misses });
  });
  return frames;
}

/** Address of an element in bytes from the start of the array (row-major layout). */
export const addrOf = (idx: number) => idx * ELEM;

/* ───────── latency ladder ───────── */

export interface Tier {
  name: string;
  ns: number;
  size: string;
  note: string;
}

/** Rough, commonly quoted orders of magnitude. Real values depend on the machine. */
export const TIERS: Tier[] = [
  { name: '레지스터', ns: 0.3, size: '수백 바이트', note: 'CPU 안, 한 클록 안에 읽음' },
  { name: 'L1 캐시', ns: 1, size: '32–64KB', note: '코어마다 하나, 약 4클록' },
  { name: 'L2 캐시', ns: 4, size: '256KB–2MB', note: '코어마다 하나, 약 12클록' },
  { name: 'L3 캐시', ns: 15, size: '8–64MB', note: '여러 코어가 나눠 씀' },
  { name: '메인 메모리', ns: 100, size: '8–64GB', note: 'DRAM, CPU 칩 바깥' },
  { name: 'SSD 읽기', ns: 80_000, size: '0.5–4TB', note: 'NVMe, 4KB 무작위 읽기' },
  { name: 'HDD 읽기', ns: 5_000_000, size: '수 TB', note: '헤드가 움직여 찾는 시간' },
  { name: '다른 대륙 서버', ns: 150_000_000, size: '—', note: '한국↔미국 동부 왕복' },
];
