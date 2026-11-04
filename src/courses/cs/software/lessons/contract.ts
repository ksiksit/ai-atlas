/* 명세와 계약: binary search under a contract, spec strength by exhaustive checking, a bank account's invariant */

/* ─────────────── Figure 1: find(arr, x) under a contract ─────────────── */

export type FindKind = 'correct' | 'buggy' | 'defensive';

export interface FindRun {
  result?: number;
  thrown?: string;
  probes: number[]; // indices looked at, in order
}

export const isSorted = (a: number[]) => a.every((v, i) => i === 0 || a[i - 1] <= v);

/** Binary search, three ways. All of them assume (or, defensively, check) that arr is sorted. */
export function runFind(kind: FindKind, arr: number[], x: number): FindRun {
  const probes: number[] = [];
  if (kind === 'defensive' && !isSorted(arr)) return { thrown: 'Error: find: arr가 정렬되어 있지 않습니다', probes };
  let lo = 0;
  let hi = arr.length - 1;
  // the buggy version stops one step early: when lo === hi the last candidate is never looked at
  while (kind === 'buggy' ? lo < hi : lo <= hi) {
    const mid = (lo + hi) >> 1;
    probes.push(mid);
    if (arr[mid] === x) return { result: mid, probes };
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid - 1;
  }
  return { result: -1, probes };
}

export interface Verdict {
  pre: boolean;
  post: boolean | null; // null: an exception was thrown
  who: 'ok' | 'caller' | 'implementer' | 'failfast';
}

export function judge(arr: number[], x: number, r: FindRun): Verdict {
  const pre = isSorted(arr);
  let post: boolean | null;
  if (r.thrown) post = null;
  else {
    const present = arr.includes(x);
    post = present ? r.result! >= 0 && r.result! < arr.length && arr[r.result!] === x : r.result === -1;
  }
  let who: Verdict['who'];
  if (!pre) who = r.thrown ? 'failfast' : 'caller';
  else who = post ? 'ok' : 'implementer';
  return { pre, post, who };
}

/* ─────────────── Figure 2: which implementations does a spec allow? ─────────────── */

export interface Impl {
  id: string;
  name: string;
  line: string;
  f: (a: number[], x: number) => number; // may throw
}

export const IMPLS: Impl[] = [
  {
    id: 'first',
    name: '앞에서부터',
    line: 'for (i = 0; i < n; i++) … return -1',
    f: (a, x) => {
      for (let i = 0; i < a.length; i++) if (a[i] === x) return i;
      return -1;
    },
  },
  {
    id: 'throw',
    name: '앞에서부터, 없으면 예외',
    line: '… throw new Error("없음")',
    f: (a, x) => {
      for (let i = 0; i < a.length; i++) if (a[i] === x) return i;
      throw new Error('없음');
    },
  },
  {
    id: 'len',
    name: '앞에서부터, 없으면 n',
    line: '… return arr.length',
    f: (a, x) => {
      for (let i = 0; i < a.length; i++) if (a[i] === x) return i;
      return a.length;
    },
  },
  {
    id: 'last',
    name: '뒤에서부터',
    line: 'for (i = n - 1; i >= 0; i--) …',
    f: (a, x) => {
      for (let i = a.length - 1; i >= 0; i--) if (a[i] === x) return i;
      return -1;
    },
  },
  {
    id: 'mid',
    name: '가운데부터 돌기',
    line: 'i = (n/2 + k) % n',
    f: (a, x) => {
      const n = a.length;
      for (let k = 0; k < n; k++) {
        const i = ((n >> 1) + k) % n;
        if (a[i] === x) return i;
      }
      return -1;
    },
  },
  {
    id: 'once',
    name: '딱 한 번 있을 때만',
    line: 'count === 1 ? idx : -1',
    f: (a, x) => {
      let c = 0;
      let at = -1;
      a.forEach((v, i) => {
        if (v === x) {
          c++;
          at = i;
        }
      });
      return c === 1 ? at : -1;
    },
  },
  {
    id: 'skip',
    name: '1번 칸부터 (버그)',
    line: 'for (i = 1; i < n; i++) …',
    f: (a, x) => {
      for (let i = 1; i < a.length; i++) if (a[i] === x) return i;
      return -1;
    },
  },
];

export interface Spec {
  id: string;
  short: string;
  requires: string;
  effects: string;
  pre: (a: number[], x: number) => boolean;
  post: (a: number[], x: number, r: number) => boolean;
}

const count = (a: number[], x: number) => a.filter((v) => v === x).length;

export const SPECS: Spec[] = [
  {
    id: 's1',
    short: 'A',
    requires: 'x가 arr에 정확히 한 번 있다',
    effects: 'arr[i] === x인 i를 돌려준다',
    pre: (a, x) => count(a, x) === 1,
    post: (a, x, r) => a[r] === x,
  },
  {
    id: 's2',
    short: 'B',
    requires: 'x가 arr에 있다',
    effects: 'arr[i] === x인 i를 돌려준다',
    pre: (a, x) => count(a, x) >= 1,
    post: (a, x, r) => a[r] === x,
  },
  {
    id: 's3',
    short: 'C',
    requires: 'x가 arr에 있다',
    effects: 'arr[i] === x인 가장 작은 i를 돌려준다',
    pre: (a, x) => count(a, x) >= 1,
    post: (a, x, r) => r === a.indexOf(x),
  },
  {
    id: 's4',
    short: 'D',
    requires: '없음',
    effects: 'x가 있으면 arr[i] === x인 가장 작은 i, 없으면 -1을 돌려준다',
    pre: () => true,
    post: (a, x, r) => r === a.indexOf(x),
  },
];

/** Every array of length 0..4 over {1,2,3}, with every x in {1,2,3}: 363 cases. */
export const ALL_CASES: [number[], number][] = (() => {
  const out: [number[], number][] = [];
  const arrs: number[][] = [[]];
  for (let len = 1; len <= 4; len++) {
    const prev = arrs.filter((a) => a.length === len - 1);
    for (const p of prev) for (const v of [1, 2, 3]) arrs.push([...p, v]);
  }
  for (const a of arrs) for (const x of [1, 2, 3]) out.push([a, x]);
  return out;
})();

export interface SpecCheck {
  ok: boolean;
  tried: number; // cases where the precondition held
  counter?: { a: number[]; x: number; got: string; why: string };
}

export function checkSpec(impl: Impl, spec: Spec): SpecCheck {
  let tried = 0;
  for (const [a, x] of ALL_CASES) {
    if (!spec.pre(a, x)) continue;
    tried++;
    let r: number;
    try {
      r = impl.f(a, x);
    } catch (e) {
      return { ok: false, tried, counter: { a, x, got: '예외', why: '명세는 값을 돌려준다고 약속했는데 예외를 던졌습니다' } };
    }
    if (!spec.post(a, x, r)) {
      const want = a.indexOf(x);
      const why = spec.id === 's4' && want === -1 ? '없을 때는 -1이어야 합니다' : spec.id === 's3' || spec.id === 's4' ? `가장 작은 위치는 ${want}입니다` : `arr[${r}]는 ${a[r] ?? 'undefined'}로 x가 아닙니다`;
      return { ok: false, tried, counter: { a, x, got: String(r), why } };
    }
  }
  return { ok: true, tried };
}

/** What each client needs. A client is safe under a spec when the spec promises what it relies on. */
export const CLIENTS = [
  { id: 'c1', text: '중복 없는 학번 목록에서 내 학번의 위치를 찾는다', needs: 's1' },
  { id: 'c2', text: '같은 상품이 여러 번 담긴 장바구니에서 맨 처음 담은 위치를 찾는다', needs: 's3' },
  { id: 'c3', text: '있는지 없는지 모르는 값을 찾고, -1이면 "없음"을 띄운다', needs: 's4' },
];
const ORDER = ['s1', 's2', 's3', 's4'];
export const clientSafe = (needs: string, spec: string) => ORDER.indexOf(spec) >= ORDER.indexOf(needs);

/* ─────────────── Figure 3: a bank account and its invariant ─────────────── */

export type OpId = 'dep' | 'wd' | 'wdBig' | 'extBal' | 'extHist' | 'stmt';

export const OPS: { id: OpId; code: string; external?: boolean }[] = [
  { id: 'dep', code: 'acct.deposit(10000)' },
  { id: 'wd', code: 'acct.withdraw(3000)' },
  { id: 'wdBig', code: 'acct.withdraw(50000)' },
  { id: 'extBal', code: 'acct.balance = -5000', external: true },
  { id: 'extHist', code: 'acct.history().push(1000000)', external: true },
  { id: 'stmt', code: 'acct.statement()' },
];

export interface AcctOpts {
  priv: boolean; // fields are #private
  copy: boolean; // history() returns a copy
  check: boolean; // every method ends with checkRep()
}

export interface AcctRow {
  code: string;
  external: boolean;
  outcome: string; // what the caller saw
  kind: 'ok' | 'refused' | 'noeffect' | 'caught' | 'odd';
  bal: number;
  sum: number;
  inv: boolean; // invariant holds after this row
}

export interface AcctRun {
  rows: AcctRow[];
  brokeAt: number | null; // first row where the invariant stopped holding
  caughtAt: number | null; // row where checkRep threw
}

const won = (v: number) => `${v.toLocaleString('ko-KR')}원`;

export function runAccount(ops: OpId[], o: AcctOpts): AcctRun {
  let bal = 0;
  const hist: number[] = [];
  const rows: AcctRow[] = [];
  let brokeAt: number | null = null;
  let caughtAt: number | null = null;
  const sum = () => hist.reduce((s, v) => s + v, 0);
  const holds = () => bal >= 0 && bal === sum();

  for (const id of ops) {
    if (caughtAt !== null) break;
    const op = OPS.find((p) => p.id === id)!;
    let outcome = '';
    let kind: AcctRow['kind'] = 'ok';
    let method = true;
    if (id === 'dep') {
      hist.push(10000);
      bal += 10000;
      outcome = `잔액 ${won(bal)}`;
    } else if (id === 'wd' || id === 'wdBig') {
      const amt = id === 'wd' ? 3000 : 50000;
      if (amt > bal) {
        outcome = `Error: 잔액 부족 (잔액 ${won(bal)})`;
        kind = 'refused';
      } else {
        hist.push(-amt);
        bal -= amt;
        outcome = `잔액 ${won(bal)}`;
      }
    } else if (id === 'extBal') {
      method = false;
      if (o.priv) {
        outcome = '#balance는 밖에서 보이지 않아 아무 영향 없음';
        kind = 'noeffect';
      } else {
        bal = -5000;
        outcome = '내부 필드가 그대로 바뀜';
        kind = 'odd';
      }
    } else if (id === 'extHist') {
      method = false;
      if (o.copy) {
        outcome = '복사본만 바뀌고 내부 기록은 그대로';
        kind = 'noeffect';
      } else {
        hist.push(1000000);
        outcome = '돌려받은 배열이 내부 기록 그 자체라 함께 바뀜';
        kind = 'odd';
      }
    } else {
      const s = sum();
      outcome = bal === s && bal >= 0 ? `잔액 ${won(bal)}, 거래 합계 ${won(s)}` : `잔액 ${won(bal)}인데 거래 합계는 ${won(s)}?`;
      if (!(bal === s && bal >= 0)) kind = 'odd';
    }
    const inv = holds();
    if (!inv && brokeAt === null) brokeAt = rows.length;
    if (method && o.check && !inv) {
      outcome = 'checkRep 실패: 불변식이 깨졌습니다. 프로그램을 멈춥니다';
      kind = 'caught';
      caughtAt = rows.length;
    }
    rows.push({ code: op.code, external: !!op.external, outcome, kind, bal, sum: sum(), inv });
  }
  return { rows, brokeAt, caughtAt };
}
