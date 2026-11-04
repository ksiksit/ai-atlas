/* 데이터베이스: a tiny in-browser relational engine for the figures (no SQL parser, queries are built as objects) */

export type Value = string | number | null;
export type Row = Record<string, Value>;

export interface Column {
  name: string;
  type: 'int' | 'real' | 'text';
  /** Korean gloss shown under the header */
  label: string;
}

/* ─────────────── sample tables ─────────────── */

export const STUDENT_COLS: Column[] = [
  { name: 'id', type: 'int', label: '학번' },
  { name: 'name', type: 'text', label: '이름' },
  { name: 'dept', type: 'text', label: '학과' },
  { name: 'year', type: 'int', label: '학년' },
  { name: 'gpa', type: 'real', label: '평점' },
];

const S = (id: number, name: string, dept: string, year: number, gpa: number | null): Row => ({ id, name, dept, year, gpa });

/** 정하준 is a freshman in the first semester: no grade yet, so gpa is NULL. */
export const STUDENTS: Row[] = [
  S(2021001, '김민준', '컴퓨터공학', 4, 3.8),
  S(2022014, '이서연', '경영', 3, 3.2),
  S(2023007, '박지호', '컴퓨터공학', 2, 2.9),
  S(2021033, '최유나', '수학', 4, 3.5),
  S(2024002, '정하준', '경영', 1, null),
  S(2022021, '강수아', '컴퓨터공학', 3, 4.1),
  S(2023015, '윤도윤', '수학', 2, 2.6),
  S(2022030, '장서윤', '경영', 3, 3.9),
  S(2024011, '임지안', '컴퓨터공학', 1, 3.4),
  S(2021040, '한예준', '수학', 4, 3.0),
];
export const DEPTS = ['컴퓨터공학', '경영', '수학'];

export const CUSTOMER_COLS: Column[] = [
  { name: 'id', type: 'int', label: '고객 번호' },
  { name: 'name', type: 'text', label: '이름' },
  { name: 'city', type: 'text', label: '도시' },
];
export const CUSTOMERS: Row[] = [
  { id: 1, name: '김민준', city: '서울' },
  { id: 2, name: '이서연', city: '부산' },
  { id: 3, name: '박지호', city: '서울' },
  { id: 4, name: '최유나', city: '대구' },
];

export const ORDER_COLS: Column[] = [
  { name: 'id', type: 'int', label: '주문 번호' },
  { name: 'customer_id', type: 'int', label: '고객 번호' },
  { name: 'item', type: 'text', label: '상품' },
  { name: 'amount', type: 'int', label: '금액' },
];
/** Order 105 belongs to customer 5, who has since left (no row in customers). */
export const ORDERS: Row[] = [
  { id: 101, customer_id: 1, item: '키보드', amount: 45000 },
  { id: 102, customer_id: 3, item: '모니터', amount: 230000 },
  { id: 103, customer_id: 1, item: '마우스', amount: 18000 },
  { id: 104, customer_id: 2, item: '노트북', amount: 1290000 },
  { id: 105, customer_id: 5, item: 'USB 허브', amount: 25000 },
  { id: 106, customer_id: 3, item: '웹캠', amount: 60000 },
];

/* ─────────────── values and three-valued logic ─────────────── */

export type Op = '=' | '<>' | '>' | '>=' | '<' | '<=';
export const OPS: Op[] = ['=', '<>', '>', '>=', '<', '<='];
/** SQL's three truth values: true, false, and unknown (null). */
export type Tri = boolean | null;

/** Order of two non-NULL values. Strings compare by code point, which for Hangul is 가나다 order. */
export function order(a: Value, b: Value): number {
  if (a === null && b === null) return 0;
  // NULL sorts after every value (PostgreSQL's default for ASC)
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** `a op b`. Any comparison with NULL is unknown. */
export function compare(a: Value, op: Op, b: Value): Tri {
  if (a === null || b === null) return null;
  const c = order(a, b);
  switch (op) {
    case '=':
      return c === 0;
    case '<>':
      return c !== 0;
    case '>':
      return c > 0;
    case '>=':
      return c >= 0;
    case '<':
      return c < 0;
    case '<=':
      return c <= 0;
  }
}

/** AND in three-valued logic: false wins, then unknown. */
export function and3(xs: Tri[]): Tri {
  if (xs.some((x) => x === false)) return false;
  if (xs.some((x) => x === null)) return null;
  return true;
}

export const sqlLit = (v: Value) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v}'`);
/** Cell text for display: numbers with thousands separators except ids and years. */
export function cellText(v: Value, col = ''): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number') {
    if (/id$|^year$|^id$/.test(col)) return String(v);
    // 3.8 stays "3.8", an average like 3.4667 becomes "3.47"
    if (/gpa/.test(col)) return v.toFixed(2).replace(/0$/, '');
    if (!Number.isInteger(v)) return v.toFixed(2).replace(/0$/, '');
    return v.toLocaleString('ko-KR');
  }
  return v;
}

/* ─────────────── a query as an object ─────────────── */

export interface Cond {
  col: string;
  op: Op;
  val: Value;
}
export type AggFn = 'COUNT(*)' | 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
export interface Agg {
  fn: AggFn;
  col: string;
}
export interface Query {
  table: string;
  cols: string[];
  where: Cond[];
  groupBy: string | null;
  agg: Agg | null;
  having: { op: Op; val: number } | null;
  orderBy: { col: string; desc: boolean } | null;
  limit: number | null;
}

export const aggName = (a: Agg) => (a.fn === 'COUNT(*)' ? 'COUNT(*)' : `${a.fn}(${a.col})`);

/** Aggregate over rows. COUNT(*) counts rows; the others skip NULLs, and give NULL on no values (except COUNT). */
export function aggregate(rows: Row[], a: Agg): Value {
  if (a.fn === 'COUNT(*)') return rows.length;
  const vals = rows.map((r) => r[a.col]).filter((v): v is number | string => v !== null);
  if (a.fn === 'COUNT') return vals.length;
  if (!vals.length) return null;
  if (a.fn === 'MIN') return vals.reduce((m, v) => (order(v, m) < 0 ? v : m));
  if (a.fn === 'MAX') return vals.reduce((m, v) => (order(v, m) > 0 ? v : m));
  const nums = vals.map(Number);
  const sum = nums.reduce((s, v) => s + v, 0);
  if (a.fn === 'SUM') return Math.round(sum * 100) / 100;
  return Math.round((sum / nums.length) * 100) / 100;
}

export function whereText(where: Cond[]): string {
  // gpa is numeric(2,1): write 3.0, not 3
  return where.map((c) => `${c.col} ${c.op} ${c.col === 'gpa' && typeof c.val === 'number' ? c.val.toFixed(1) : sqlLit(c.val)}`).join(' AND ');
}

export function sqlText(q: Query): string {
  const out = q.groupBy && q.agg ? [q.groupBy, aggName(q.agg)] : q.cols;
  const lines = [`SELECT ${out.length ? out.join(', ') : '*'}`, `FROM ${q.table}`];
  if (q.where.length) lines.push(`WHERE ${whereText(q.where)}`);
  if (q.groupBy) lines.push(`GROUP BY ${q.groupBy}`);
  if (q.groupBy && q.agg && q.having) lines.push(`HAVING ${aggName(q.agg)} ${q.having.op} ${q.having.val}`);
  if (q.orderBy) lines.push(`ORDER BY ${q.orderBy.col}${q.orderBy.desc ? ' DESC' : ''}`);
  if (q.limit !== null) lines.push(`LIMIT ${q.limit}`);
  return lines.join('\n') + ';';
}

export type StageKey = 'from' | 'where' | 'group' | 'having' | 'select' | 'order' | 'limit';
export type Mark = 'keep' | 'false' | 'unknown';

export interface Stage {
  key: StageKey;
  clause: string;
  /** columns to show */
  cols: string[];
  rows: Row[];
  /** WHERE / HAVING: what each row's condition evaluated to */
  marks?: Mark[];
  /** GROUP BY: group number of each row */
  groups?: number[];
  /** LIMIT: rows from this index on are cut */
  cut?: number;
  note: string;
}

const triMark = (t: Tri): Mark => (t === true ? 'keep' : t === false ? 'false' : 'unknown');

/** Run a query and keep every intermediate table, in SQL's logical order. */
export function runStages(q: Query, table: Row[], allCols: string[]): Stage[] {
  const st: Stage[] = [];
  st.push({ key: 'from', clause: `FROM ${q.table}`, cols: allCols, rows: table, note: `${q.table} 표의 모든 행(${table.length}개)을 가져옵니다.` });

  let rows = table;
  if (q.where.length) {
    const marks = table.map((r) => triMark(and3(q.where.map((c) => compare(r[c.col], c.op, c.val)))));
    const unk = marks.filter((m) => m === 'unknown').length;
    rows = table.filter((_, i) => marks[i] === 'keep');
    st.push({
      key: 'where',
      clause: `WHERE ${whereText(q.where)}`,
      cols: allCols,
      rows: table,
      marks,
      note: `조건이 참인 ${rows.length}행만 남습니다.` + (unk ? ` NULL과 비교한 ${unk}행은 참도 거짓도 아닌 '알 수 없음'이라 함께 빠집니다.` : ''),
    });
  }

  let outCols = q.cols.length ? q.cols : allCols;
  let grouped = false;
  if (q.groupBy && q.agg) {
    grouped = true;
    const g = q.groupBy;
    const keys: Value[] = [];
    for (const r of rows) if (!keys.some((k) => order(k, r[g]) === 0)) keys.push(r[g]);
    keys.sort(order);
    const sorted = [...rows].sort((a, b) => order(a[g], b[g]));
    st.push({
      key: 'group',
      clause: `GROUP BY ${g}`,
      cols: allCols,
      rows: sorted,
      groups: sorted.map((r) => keys.findIndex((k) => order(k, r[g]) === 0)),
      note: `${g} 값이 같은 행끼리 ${keys.length}개의 묶음으로 나눕니다. 이 뒤로는 묶음 하나가 한 행이 됩니다.`,
    });
    const an = aggName(q.agg);
    let agg: Row[] = keys.map((k) => ({ [g]: k, [an]: aggregate(sorted.filter((r) => order(r[g], k) === 0), q.agg!) }));
    if (q.having) {
      const h = q.having;
      const marks = agg.map((r) => triMark(compare(r[an], h.op, h.val)));
      st.push({ key: 'having', clause: `HAVING ${an} ${h.op} ${h.val}`, cols: [g, an], rows: agg, marks, note: `묶음마다 계산한 ${an}로 묶음을 거릅니다. WHERE는 행을, HAVING은 묶음을 거릅니다.` });
      agg = agg.filter((_, i) => marks[i] === 'keep');
    }
    rows = agg;
    outCols = [g, an];
    st.push({ key: 'select', clause: `SELECT ${outCols.join(', ')}`, cols: outCols, rows, note: `묶음마다 ${an}를 계산해 한 행으로 만듭니다.` });
  } else {
    st.push({ key: 'select', clause: `SELECT ${q.cols.length ? q.cols.join(', ') : '*'}`, cols: outCols, rows, note: q.cols.length ? `열 ${outCols.length}개만 남깁니다. 행의 수는 그대로입니다.` : '모든 열을 남깁니다.' });
  }

  if (q.orderBy) {
    const { col, desc } = q.orderBy;
    // NULL stays last in ASC and first in DESC, like PostgreSQL
    rows = [...rows].sort((a, b) => (desc ? -order(a[col], b[col]) : order(a[col], b[col])));
    st.push({ key: 'order', clause: `ORDER BY ${col}${desc ? ' DESC' : ''}`, cols: outCols, rows, note: `${col} 기준으로 ${desc ? '큰 값부터' : '작은 값부터'} 줄 세웁니다.` + (!grouped && !outCols.includes(col) ? ' SELECT에 없는 열로도 정렬할 수 있습니다.' : '') });
  }
  if (q.limit !== null) {
    st.push({ key: 'limit', clause: `LIMIT ${q.limit}`, cols: outCols, rows, cut: q.limit, note: `앞에서 ${Math.min(q.limit, rows.length)}행만 돌려줍니다.` + (!q.orderBy ? ' ORDER BY가 없으면 어떤 행이 앞에 올지는 정해져 있지 않습니다.' : '') });
  }
  return st;
}

/* ─────────────── joins ─────────────── */

export type JoinType = 'inner' | 'left' | 'right' | 'full';
export interface Pair {
  l: number | null;
  r: number | null;
}

/** Index pairs of a join on L[lk] = R[rk]. Unmatched rows of the kept side get a null partner. */
export function joinPairs(L: Row[], R: Row[], lk: string, rk: string, type: JoinType): Pair[] {
  const out: Pair[] = [];
  const usedR = new Set<number>();
  L.forEach((l, i) => {
    let any = false;
    R.forEach((r, j) => {
      if (compare(l[lk], '=', r[rk]) === true) {
        out.push({ l: i, r: j });
        usedR.add(j);
        any = true;
      }
    });
    if (!any && (type === 'left' || type === 'full')) out.push({ l: i, r: null });
  });
  if (type === 'right' || type === 'full') R.forEach((_, j) => !usedR.has(j) && out.push({ l: null, r: j }));
  if (type === 'right') {
    // a right join lists rows in the right table's order
    out.sort((a, b) => (a.r ?? 0) - (b.r ?? 0));
  }
  return out;
}

/* ─────────────── join algorithms, one key comparison per frame ─────────────── */

export type JoinAlg = 'nested' | 'hash' | 'merge';
export const JOIN_ALG_NAMES: Record<JoinAlg, string> = { nested: '중첩 루프 조인', hash: '해시 조인', merge: '정렬 병합 조인' };
export const BUCKETS = 4;

export interface JFrame {
  /** n×m: 0 untouched, 1 compared, 2 compared and matched (indexed by original positions) */
  cells: Uint8Array;
  cur: [number, number] | null;
  /** display order of R rows and S columns (original indices) */
  rowOrder: number[];
  colOrder: number[];
  /** hash join: R rows in each bucket so far; the bucket being probed */
  buckets: number[][] | null;
  probe: number | null;
  /** merge join: pointers in display order */
  ptr: [number, number] | null;
  cmp: number;
  hash: number;
  sort: number;
  matches: number;
  note: string;
}

/** Merge sort of positions by key, counting key comparisons. */
function countingSort(keys: number[]): { order: number[]; cmp: number } {
  let cmp = 0;
  const sort = (a: number[]): number[] => {
    if (a.length <= 1) return a;
    const l = sort(a.slice(0, a.length >> 1));
    const r = sort(a.slice(a.length >> 1));
    const out: number[] = [];
    let i = 0;
    let j = 0;
    while (i < l.length && j < r.length) {
      cmp++;
      out.push(keys[l[i]] <= keys[r[j]] ? l[i++] : r[j++]);
    }
    return out.concat(l.slice(i), r.slice(j));
  };
  const order = sort(keys.map((_, i) => i));
  return { order, cmp };
}

export function joinFrames(alg: JoinAlg, R: number[], Sk: number[]): JFrame[] {
  const n = R.length;
  const m = Sk.length;
  const frames: JFrame[] = [];
  const cells = new Uint8Array(n * m);
  let rowOrder = R.map((_, i) => i);
  let colOrder = Sk.map((_, j) => j);
  let buckets: number[][] | null = null;
  let cmp = 0;
  let hash = 0;
  let sort = 0;
  let matches = 0;
  const push = (cur: [number, number] | null, note: string, extra: Partial<JFrame> = {}) =>
    frames.push({ cells: cells.slice(), cur, rowOrder, colOrder, buckets: buckets && buckets.map((b) => [...b]), probe: null, ptr: null, cmp, hash, sort, matches, note, ...extra });

  push(null, alg === 'nested' ? 'R의 행마다 S를 처음부터 끝까지 훑습니다.' : alg === 'hash' ? '먼저 작은 표 R로 해시 테이블을 만듭니다(빌드 단계).' : '먼저 두 표를 키 순서로 정렬합니다.');

  if (alg === 'nested') {
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++) {
        cmp++;
        const eq = R[i] === Sk[j];
        cells[i * m + j] = eq ? 2 : 1;
        if (eq) matches++;
        push([i, j], `R[${i + 1}] = ${R[i]} 과 S[${j + 1}] = ${Sk[j]} 비교 → ${eq ? '같음, 결과에 추가' : '다름'}`);
      }
  } else if (alg === 'hash') {
    buckets = Array.from({ length: BUCKETS }, () => []);
    for (let i = 0; i < n; i++) {
      hash++;
      buckets[R[i] % BUCKETS].push(i);
      push(null, `R[${i + 1}] = ${R[i]}: 해시 ${R[i]} mod ${BUCKETS} = ${R[i] % BUCKETS} → 버킷 ${R[i] % BUCKETS}에 넣기`);
    }
    // show R grouped by bucket so each probe touches one contiguous block
    rowOrder = buckets.flat();
    push(null, `빌드 끝. 이제 S를 한 번 훑으며 행마다 해시를 계산해 그 버킷만 봅니다(프로브 단계).`);
    for (let j = 0; j < m; j++) {
      hash++;
      const b = Sk[j] % BUCKETS;
      if (!buckets[b].length) {
        push(null, `S[${j + 1}] = ${Sk[j]}: 버킷 ${b}가 비어 있으므로 비교 없이 넘어갑니다.`, { probe: b });
        continue;
      }
      for (const i of buckets[b]) {
        cmp++;
        const eq = R[i] === Sk[j];
        cells[i * m + j] = eq ? 2 : 1;
        if (eq) matches++;
        push([i, j], `S[${j + 1}] = ${Sk[j]}: 버킷 ${b}의 ${R[i]}와 비교 → ${eq ? '같음, 결과에 추가' : '다름(해시만 같음)'}`, { probe: b });
      }
    }
  } else {
    const sr = countingSort(R);
    sort += sr.cmp;
    rowOrder = sr.order;
    push(null, `R을 정렬했습니다(비교 ${sr.cmp}번).`);
    const ss = countingSort(Sk);
    sort += ss.cmp;
    colOrder = ss.order;
    push(null, `S를 정렬했습니다(비교 ${ss.cmp}번). 이제 두 줄을 앞에서부터 나란히 훑습니다.`, { ptr: [0, 0] });
    let p = 0;
    let q = 0;
    while (p < n && q < m) {
      const i = rowOrder[p];
      const j = colOrder[q];
      cmp++;
      const a = R[i];
      const b = Sk[j];
      cells[i * m + j] = a === b ? 2 : 1;
      if (a === b) {
        matches++;
        push([i, j], `${a} = ${b} → 결과에 추가. R의 키는 겹치지 않으므로 S만 한 칸 전진`, { ptr: [p, q] });
        q++;
      } else if (a < b) {
        push([i, j], `${a} < ${b} → 작은 쪽인 R을 한 칸 전진`, { ptr: [p, q] });
        p++;
      } else {
        push([i, j], `${a} > ${b} → 작은 쪽인 S를 한 칸 전진`, { ptr: [p, q] });
        q++;
      }
    }
  }
  push(null, `끝. 결과 ${matches}행, 키 비교 ${cmp}번` + (hash ? `, 해시 계산 ${hash}번` : '') + (sort ? `, 정렬 비교 ${sort}번` : '') + '.');
  return frames;
}

/** Rough count of basic steps for joining n rows with m rows (one key per row). */
export function joinCost(alg: JoinAlg | 'index', n: number, m: number): number {
  const lg = (x: number) => Math.max(1, Math.log2(x));
  switch (alg) {
    case 'nested':
      return n * m;
    case 'index':
      return n * lg(m);
    case 'hash':
      return n + 2 * m;
    case 'merge':
      return n * lg(n) + m * lg(m) + n + m;
  }
}
