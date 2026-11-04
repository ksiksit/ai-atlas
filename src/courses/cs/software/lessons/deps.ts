/* 모듈과 추상화: one cart behind three representations, grouping functions into modules, a dependency graph */

/* ─────────────── Figure 1: information hiding ─────────────── */

export type Rep = 'array' | 'map' | 'object';
export const REP_NAME: Record<Rep, string> = { array: '배열', map: 'Map', object: '객체' };

export const REP_SRC: Record<Rep, string> = {
  array: `// 내부 표현: { id, qty }의 배열
const items = [];
export function add(id, qty) {
  const it = items.find((x) => x.id === id);
  if (it) it.qty += qty;
  else items.push({ id, qty });
}
export const qtyOf = (id) => items.find((x) => x.id === id)?.qty ?? 0;
export const count = () => items.length;
export const entries = () => items.map((x) => [x.id, x.qty]);`,
  map: `// 내부 표현: id → qty 인 Map
const items = new Map();
export function add(id, qty) {
  items.set(id, (items.get(id) ?? 0) + qty);
}
export const qtyOf = (id) => items.get(id) ?? 0;
export const count = () => items.size;
export const entries = () => [...items];`,
  object: `// 내부 표현: { [id]: qty } 객체
const items = {};
export function add(id, qty) {
  items[id] = (items[id] ?? 0) + qty;
}
export const qtyOf = (id) => items[id] ?? 0;
export const count = () => Object.keys(items).length;
export const entries = () => Object.entries(items);`,
};

interface CartModule {
  items: unknown; // exposed only so the "reaches inside" clients can misuse it
  add: (id: string, qty: number) => void;
  qtyOf: (id: string) => number;
  count: () => number;
  entries: () => [string, number][];
}

export function makeCart(rep: Rep): CartModule {
  if (rep === 'array') {
    const items: { id: string; qty: number }[] = [];
    return {
      items,
      add(id, qty) {
        const it = items.find((x) => x.id === id);
        if (it) it.qty += qty;
        else items.push({ id, qty });
      },
      qtyOf: (id) => items.find((x) => x.id === id)?.qty ?? 0,
      count: () => items.length,
      entries: () => items.map((x) => [x.id, x.qty]),
    };
  }
  if (rep === 'map') {
    const items = new Map<string, number>();
    return {
      items,
      add(id, qty) {
        items.set(id, (items.get(id) ?? 0) + qty);
      },
      qtyOf: (id) => items.get(id) ?? 0,
      count: () => items.size,
      entries: () => [...items],
    };
  }
  const items: Record<string, number> = {};
  return {
    items,
    add(id, qty) {
      items[id] = (items[id] ?? 0) + qty;
    },
    qtyOf: (id) => items[id] ?? 0,
    count: () => Object.keys(items).length,
    entries: () => Object.entries(items),
  };
}

const PRICE: Record<string, number> = { apple: 1200, milk: 2500, bread: 3200 };

export interface Client {
  id: string;
  name: string;
  direct: string;
  viaApi: string;
  expect: string;
  runDirect: (c: CartModule) => string;
  runApi: (c: CartModule) => string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const CLIENTS: Client[] = [
  {
    id: 'badge',
    name: '장바구니 아이콘의 숫자',
    direct: 'cart.items.length',
    viaApi: 'cart.count()',
    expect: '3',
    runDirect: (c) => String((c.items as any).length),
    runApi: (c) => String(c.count()),
  },
  {
    id: 'detail',
    name: '상품 화면의 담은 수량',
    direct: "cart.items.find((x) => x.id === 'apple').qty",
    viaApi: "cart.qtyOf('apple')",
    expect: '2',
    runDirect: (c) => String((c.items as any).find((x: any) => x.id === 'apple').qty),
    runApi: (c) => String(c.qtyOf('apple')),
  },
  {
    id: 'checkout',
    name: '결제 화면의 합계',
    direct: 'for (const it of cart.items) sum += PRICE[it.id] * it.qty',
    viaApi: 'for (const [id, qty] of cart.entries()) sum += PRICE[id] * qty',
    expect: '8100',
    runDirect: (c) => {
      let sum = 0;
      for (const it of c.items as any) sum += PRICE[it.id] * it.qty;
      return String(sum);
    },
    runApi: (c) => {
      let sum = 0;
      for (const [id, qty] of c.entries()) sum += PRICE[id] * qty;
      return String(sum);
    },
  },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ClientResult {
  out: string;
  status: 'ok' | 'wrong' | 'crash';
}

export function runClient(rep: Rep, cl: Client, direct: boolean): ClientResult {
  const c = makeCart(rep);
  c.add('apple', 2);
  c.add('milk', 1);
  c.add('bread', 1);
  try {
    const out = direct ? cl.runDirect(c) : cl.runApi(c);
    return { out, status: out === cl.expect ? 'ok' : 'wrong' };
  } catch (e) {
    // the engine names the expression it choked on; show it as the reader's code spells it
    const msg = (e as Error).message.replace(/\b\w+\.items\b/g, 'cart.items');
    return { out: `${(e as Error).name}: ${msg}`, status: 'crash' };
  }
}

/* ─────────────── Figure 2: cohesion and coupling ─────────────── */

export const FUNCS = ['readCsv', 'parseRow', 'validateRow', 'sumByMonth', 'average', 'topN', 'renderTable', 'drawChart', 'formatWon'];
/** caller → callee */
export const CALLS: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 2],
  [3, 4],
  [5, 3],
  [5, 4],
  [6, 8],
  [7, 8],
  [6, 7],
  [3, 1], // sumByMonth reads parsed rows
  [6, 5], // renderTable shows the top N
  [7, 3], // drawChart plots the monthly sums
];
export const MIXED = [0, 1, 2, 0, 1, 2, 0, 1, 2];
export const BY_ROLE = [0, 0, 0, 1, 1, 1, 2, 2, 2];

export function grouping(assign: number[]) {
  let inside = 0;
  let across = 0;
  const per = [0, 1, 2].map(() => ({ inside: 0, touching: 0, size: 0 }));
  assign.forEach((m) => per[m].size++);
  for (const [a, b] of CALLS) {
    if (assign[a] === assign[b]) {
      inside++;
      per[assign[a]].inside++;
      per[assign[a]].touching++;
    } else {
      across++;
      per[assign[a]].touching++;
      per[assign[b]].touching++;
    }
  }
  return { inside, across, per };
}

/* ─────────────── Figure 3: the dependency graph ─────────────── */

export interface GNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

export const NODES: GNode[] = [
  { id: 'cartPage', label: 'cartPage', x: 110, y: 26 },
  { id: 'checkoutPage', label: 'checkoutPage', x: 340, y: 26 },
  { id: 'cart', label: 'cart', x: 110, y: 106 },
  { id: 'checkout', label: 'checkout', x: 340, y: 106 },
  { id: 'pricing', label: 'pricing', x: 160, y: 186 },
  { id: 'inventory', label: 'inventory', x: 280, y: 186 },
  { id: 'payment', label: 'payment', x: 405, y: 186 },
  { id: 'db', label: 'db', x: 70, y: 266 },
  { id: 'logger', label: 'logger', x: 250, y: 266 },
  { id: 'http', label: 'http', x: 405, y: 266 },
];
export const NODE_W = 92;
export const NODE_H = 28;

export interface GEdge {
  from: string;
  to: string;
  opt?: string; // id of the toggle that adds it
}

export const BASE_EDGES: GEdge[] = [
  { from: 'cartPage', to: 'cart' },
  { from: 'checkoutPage', to: 'checkout' },
  { from: 'checkout', to: 'cart' },
  { from: 'checkout', to: 'pricing' },
  { from: 'checkout', to: 'inventory' },
  { from: 'checkout', to: 'payment' },
  { from: 'cart', to: 'pricing' },
  { from: 'cart', to: 'db' },
  { from: 'inventory', to: 'db' },
  { from: 'inventory', to: 'logger' },
  { from: 'payment', to: 'http' },
  { from: 'payment', to: 'logger' },
];

export const OPTIONS: { id: string; label: string; edge: GEdge }[] = [
  { id: 'o1', label: 'cartPage가 db를 직접 읽음', edge: { from: 'cartPage', to: 'db', opt: 'o1' } },
  { id: 'o2', label: 'pricing이 cart를 import (수량 할인)', edge: { from: 'pricing', to: 'cart', opt: 'o2' } },
  { id: 'o3', label: 'inventory가 checkout을 호출 (품절 시 주문 취소)', edge: { from: 'inventory', to: 'checkout', opt: 'o3' } },
  { id: 'o4', label: 'logger가 http로 로그 전송', edge: { from: 'logger', to: 'http', opt: 'o4' } },
];

/** Every module that (directly or transitively) imports `id`: what must be rechecked when id changes. */
export function dependents(edges: GEdge[], id: string): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const t = stack.pop()!;
    for (const e of edges) if (e.to === t && !out.has(e.from) && e.from !== id) {
      out.add(e.from);
      stack.push(e.from);
    }
  }
  return out;
}

/** Strongly connected components with more than one node (Tarjan). */
export function cycles(edges: GEdge[]): string[][] {
  const ids = NODES.map((n) => n.id);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const on = new Set<string>();
  const st: string[] = [];
  const out: string[][] = [];
  let k = 0;
  const visit = (v: string) => {
    index.set(v, k);
    low.set(v, k);
    k++;
    st.push(v);
    on.add(v);
    for (const e of edges) {
      if (e.from !== v) continue;
      const w = e.to;
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = st.pop()!;
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) out.push(comp);
    }
  };
  for (const v of ids) if (!index.has(v)) visit(v);
  return out;
}

/** A build/test order: dependencies first (reverse topological order). Null when there is a cycle. */
export function buildOrder(edges: GEdge[]): string[] | null {
  const ids = NODES.map((n) => n.id);
  const outdeg = new Map(ids.map((i) => [i, 0]));
  for (const e of edges) outdeg.set(e.from, outdeg.get(e.from)! + 1);
  const ready = ids.filter((i) => outdeg.get(i) === 0);
  const order: string[] = [];
  while (ready.length) {
    const v = ready.shift()!;
    order.push(v);
    for (const e of edges)
      if (e.to === v) {
        outdeg.set(e.from, outdeg.get(e.from)! - 1);
        if (outdeg.get(e.from) === 0) ready.push(e.from);
      }
  }
  return order.length === ids.length ? order : null;
}
