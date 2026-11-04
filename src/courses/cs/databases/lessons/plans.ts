/* 데이터베이스 · 인덱스: a toy cost model in the spirit of PostgreSQL's planner */

import { rng } from '../../../../lib/math';

export const N_ROWS = 20_000;
export const RPP = 100; // rows per table page
export const PAGES = N_ROWS / RPP; // 200
export const KEYS_PER_LEAF = 200;
export const HEIGHT = 2; // root + first leaf
export const SEQ_PAGE = 1; // seq_page_cost
export const RAND_PAGE = 4; // random_page_cost
export const CPU_TUPLE = 0.01; // cpu_tuple_cost
export const BITMAP_SETUP = 5;

export type PlanKind = 'seq' | 'index' | 'bitmap';
export const PLAN_NAMES: Record<PlanKind, string> = { seq: '전체 스캔', index: '인덱스 스캔', bitmap: '비트맵 스캔' };
export const PLAN_EN: Record<PlanKind, string> = { seq: 'Seq Scan', index: 'Index Scan', bitmap: 'Bitmap Heap Scan' };
export const PLANS: PlanKind[] = ['index', 'bitmap', 'seq'];

/** Index pages touched to find k entries: walk down, then follow leaves to the right. */
export const indexPages = (k: number) => HEIGHT + Math.max(0, Math.ceil(k / KEYS_PER_LEAF) - 1);

/** Expected number of distinct table pages that hold k matching rows. */
export function distinctPages(k: number, clustered: boolean): number {
  if (clustered) return Math.ceil(k / RPP);
  return PAGES * (1 - Math.pow(1 - 1 / PAGES, k));
}

/** PostgreSQL's bitmap heap scan: pages are read in physical order, so each costs between random and sequential. */
const bitmapPageCost = (d: number) => RAND_PAGE - (RAND_PAGE - SEQ_PAGE) * Math.sqrt(Math.min(1, d / PAGES));

export interface Cost {
  total: number;
  /** pages of the index and of the table that the plan reads */
  idx: number;
  heap: number;
}

export function planCost(kind: PlanKind, k: number, clustered: boolean, d = distinctPages(k, clustered)): Cost {
  if (kind === 'seq') return { total: PAGES * SEQ_PAGE + N_ROWS * CPU_TUPLE, idx: 0, heap: PAGES };
  const idx = indexPages(k);
  if (kind === 'index') {
    // clustered: the first table page is a random read, the rest follow in order
    const heap = clustered ? Math.ceil(k / RPP) : k;
    const heapCost = clustered ? RAND_PAGE + (heap - 1) * SEQ_PAGE : heap * RAND_PAGE;
    return { total: idx * RAND_PAGE + heapCost + k * CPU_TUPLE, idx, heap };
  }
  return { total: idx * RAND_PAGE + d * bitmapPageCost(d) + k * CPU_TUPLE + BITMAP_SETUP, idx, heap: Math.round(d) };
}

export function cheapest(k: number, clustered: boolean, d?: number): PlanKind {
  return PLANS.reduce((a, b) => (planCost(b, k, clustered, d).total < planCost(a, k, clustered, d).total ? b : a));
}

/** Smallest k at which `cheapest` changes, scanning k = 1..N. */
export function switchPoints(clustered: boolean): { k: number; to: PlanKind }[] {
  const out: { k: number; to: PlanKind }[] = [];
  let prev = cheapest(1, clustered);
  for (let k = 2; k <= N_ROWS; k++) {
    const c = cheapest(k, clustered);
    if (c !== prev) out.push({ k, to: c });
    prev = c;
  }
  return out;
}

/** Table slots in index-key order: slot s lives on page floor(s / RPP). */
const PERM = (() => {
  const r = rng(2024);
  const a = Array.from({ length: N_ROWS }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
})();
const CLUSTER_START = 7_000;

/** Table pages holding the k matching rows, in index (key) order. */
export function matchPages(k: number, clustered: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    const slot = clustered ? (CLUSTER_START + i) % N_ROWS : PERM[i];
    out.push(Math.floor(slot / RPP));
  }
  return out;
}

/** The table pages a plan reads, in the order it reads them. */
export function readSequence(kind: PlanKind, pages: number[]): number[] {
  if (kind === 'seq') return Array.from({ length: PAGES }, (_, i) => i);
  if (kind === 'index') {
    // consecutive rows on the same page are read once (the page is still in hand)
    return pages.filter((p, i) => i === 0 || pages[i - 1] !== p);
  }
  return [...new Set(pages)].sort((a, b) => a - b);
}

/* ─────────────── composite index (a, b) ─────────────── */

export const C_DEPTS = ['경영', '물리', '수학', '컴공'];
export interface Entry {
  dept: string;
  year: number;
  id: number;
}
export const ENTRIES: Entry[] = (() => {
  const out: Entry[] = [];
  let id = 1;
  for (const dept of C_DEPTS) for (let year = 1; year <= 4; year++) for (let k = 0; k < 2; k++) out.push({ dept, year, id: id++ });
  return out;
})();

export type ICol = 'dept' | 'year';
export interface CCond {
  col: ICol;
  op: '=' | '>=';
  val: string | number;
}
export interface CQuery {
  id: string;
  label: string;
  where: CCond[];
  /** ORDER BY dept, year LIMIT n */
  orderLimit?: number;
}
export const CQUERIES: CQuery[] = [
  { id: 'd', label: "dept = '수학'", where: [{ col: 'dept', op: '=', val: '수학' }] },
  { id: 'dy', label: "dept = '수학' AND year = 3", where: [{ col: 'dept', op: '=', val: '수학' }, { col: 'year', op: '=', val: 3 }] },
  { id: 'y', label: 'year = 3', where: [{ col: 'year', op: '=', val: 3 }] },
  { id: 'dyr', label: "dept = '수학' AND year >= 3", where: [{ col: 'dept', op: '=', val: '수학' }, { col: 'year', op: '>=', val: 3 }] },
  { id: 'dry', label: "dept >= '수학' AND year = 3", where: [{ col: 'dept', op: '>=', val: '수학' }, { col: 'year', op: '=', val: 3 }] },
  { id: 'ord', label: 'ORDER BY dept, year LIMIT 5', where: [], orderLimit: 5 },
];

const holds = (e: Entry, c: CCond) => (c.op === '=' ? e[c.col] === c.val : e[c.col] >= c.val);

export interface CResult {
  sorted: Entry[];
  /** index positions read */
  scanned: Set<number>;
  matched: Set<number>;
  mode: 'range' | 'full' | 'order' | 'sort';
  /** index columns used to narrow the range */
  bound: ICol[];
}

export function runComposite(cols: [ICol, ICol], q: CQuery): CResult {
  const sorted = [...ENTRIES].sort((a, b) => {
    for (const c of cols) {
      if (a[c] < b[c]) return -1;
      if (a[c] > b[c]) return 1;
    }
    return a.id - b.id;
  });
  const all = new Set(sorted.map((_, i) => i));
  if (q.orderLimit) {
    if (cols[0] === 'dept') {
      const s = new Set(sorted.slice(0, q.orderLimit).map((_, i) => i));
      return { sorted, scanned: s, matched: s, mode: 'order', bound: [] };
    }
    // the index is in (year, dept) order: every entry must be read and sorted again
    const byDept = sorted.map((e, i) => ({ e, i })).sort((a, b) => (a.e.dept < b.e.dept ? -1 : a.e.dept > b.e.dept ? 1 : a.e.year - b.e.year || a.e.id - b.e.id));
    return { sorted, scanned: all, matched: new Set(byDept.slice(0, q.orderLimit).map((x) => x.i)), mode: 'sort', bound: [] };
  }
  // equality on a prefix of the index columns, then at most one range column
  const bound: ICol[] = [];
  for (const c of cols) {
    const cond = q.where.find((w) => w.col === c);
    if (!cond) break;
    bound.push(c);
    if (cond.op !== '=') break;
  }
  const boundConds = q.where.filter((w) => bound.includes(w.col));
  const scanned = new Set<number>();
  const matched = new Set<number>();
  sorted.forEach((e, i) => {
    if (!bound.length || boundConds.every((c) => holds(e, c))) scanned.add(i);
    if (q.where.every((c) => holds(e, c))) matched.add(i);
  });
  return { sorted, scanned, matched, mode: bound.length ? 'range' : 'full', bound };
}

/* ─────────────── statistics ─────────────── */

export const STATUSES = ['done', 'shipped', 'pending', 'error'] as const;
export type Status = (typeof STATUSES)[number];
/** what is in the table now (an outage has just produced many 'error' rows) */
export const ACTUAL: Record<Status, number> = { done: 0.7, shipped: 0.045, pending: 0.005, error: 0.25 };
/** what ANALYZE saw last month, before the outage */
export const STALE: Record<Status, number> = { done: 0.94, shipped: 0.045, pending: 0.0148, error: 0.0002 };
/** PostgreSQL's guess for "col = constant" with no statistics at all */
export const DEFAULT_EQ_SEL = 0.005;
