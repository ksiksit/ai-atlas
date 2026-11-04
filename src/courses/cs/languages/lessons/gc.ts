/**
 * Garbage collection models: a small heap graph with mark-and-sweep (figure 1), reference counting
 * next to tracing on a scripted program (figure 2), and a generational heap simulation (figure 3).
 */

import { rng } from '../../../../lib/math';

/* ─────────────── figure 1: heap graph ─────────────── */

export interface Root {
  id: string;
  label: string;
  where: '전역' | '스택';
}
export interface Obj {
  id: string;
  label: string;
  slot: number; // address order (0 … SLOTS-1)
}
export interface Ref {
  from: string; // root id or object id
  to: string;
}
export interface Heap {
  roots: Root[];
  objs: Obj[];
  refs: Ref[];
}

export const HEAP_COLS = 4;
export const HEAP_ROWS = 3;
export const SLOTS = HEAP_COLS * HEAP_ROWS;

export function initialHeap(): Heap {
  const roots: Root[] = [
    { id: 'app', label: 'app', where: '전역' },
    { id: 'user', label: 'user', where: '스택' },
    { id: 'cart', label: 'cart', where: '스택' },
  ];
  const o = (id: string, label: string, slot: number): Obj => ({ id, label, slot });
  const objs = [o('cfg', '설정', 0), o('cache', '캐시', 1), o('img1', '이미지', 2), o('old', '옛 세션', 3), o('prof', '프로필', 4), o('pic', '사진', 5), o('t1', '임시 A', 6), o('t2', '임시 B', 7), o('item', '상품 1', 8), o('price', '가격표', 9), o('item2', '상품 2', 10)];
  const refs: Ref[] = [
    { from: 'app', to: 'cfg' },
    { from: 'cfg', to: 'cache' },
    { from: 'cache', to: 'img1' },
    { from: 'old', to: 'img1' },
    { from: 'user', to: 'prof' },
    { from: 'prof', to: 'pic' },
    { from: 't1', to: 't2' },
    { from: 't2', to: 't1' },
    { from: 'cart', to: 'item' },
    { from: 'item', to: 'price' },
    { from: 'item2', to: 'price' },
  ];
  return { roots, objs, refs };
}

export interface GcFrame {
  phase: 'start' | 'mark' | 'sweep' | 'done';
  marked: Set<string>;
  freed: Set<string>;
  /** object being visited (mark) or swept slot (sweep) */
  at: string | null;
  sweepSlot: number;
  work: string[]; // worklist of objects still to visit
  note: string;
  edge?: Ref;
}

/** Mark from the roots (depth first, using an explicit worklist), then sweep the slots in address order. */
export function markSweep(h: Heap): GcFrame[] {
  const frames: GcFrame[] = [];
  const marked = new Set<string>();
  const freed = new Set<string>();
  const byId = new Map(h.objs.map((o) => [o.id, o]));
  const push = (f: Omit<GcFrame, 'marked' | 'freed'>) => frames.push({ ...f, marked: new Set(marked), freed: new Set(freed) });
  push({ phase: 'start', at: null, sweepSlot: -1, work: [], note: `GC 시작. 프로그램을 멈추고, 루트(${h.roots.map((r) => r.label).join(', ')})에서 출발해 닿는 객체를 모두 표시합니다.` });
  const work: string[] = [];
  for (const r of h.roots) {
    for (const ref of h.refs.filter((x) => x.from === r.id)) {
      if (!marked.has(ref.to)) {
        marked.add(ref.to);
        work.push(ref.to);
        push({ phase: 'mark', at: ref.to, sweepSlot: -1, work: [...work], note: `루트 ${r.label}이(가) 가리키는 ${byId.get(ref.to)!.label}을(를) 표시하고, 나중에 안을 살펴보려고 작업 목록에 넣습니다.`, edge: ref });
      }
    }
  }
  while (work.length) {
    const id = work.pop()!;
    const outs = h.refs.filter((x) => x.from === id);
    const fresh = outs.filter((x) => !marked.has(x.to));
    if (!outs.length) {
      push({ phase: 'mark', at: id, sweepSlot: -1, work: [...work], note: `${byId.get(id)!.label}을(를) 꺼내 봅니다. 다른 객체를 가리키지 않습니다.` });
      continue;
    }
    if (!fresh.length) {
      push({ phase: 'mark', at: id, sweepSlot: -1, work: [...work], note: `${byId.get(id)!.label}을(를) 꺼내 봅니다. 가리키는 ${outs.map((x) => byId.get(x.to)!.label).join(', ')}은(는) 이미 표시되어 있어 다시 가지 않습니다.` });
      continue;
    }
    for (const ref of fresh) {
      marked.add(ref.to);
      work.push(ref.to);
      push({ phase: 'mark', at: ref.to, sweepSlot: -1, work: [...work], note: `${byId.get(id)!.label}이(가) 가리키는 ${byId.get(ref.to)!.label}을(를) 표시합니다.`, edge: ref });
    }
  }
  push({ phase: 'mark', at: null, sweepSlot: -1, work: [], note: `작업 목록이 비었습니다. 표시 단계 끝: 살아 있는 객체 ${marked.size}개. 표시되지 않은 것은 프로그램이 다시는 닿을 수 없는 쓰레기입니다.` });
  const bySlot = [...h.objs].sort((a, b) => a.slot - b.slot);
  for (const o of bySlot) {
    if (marked.has(o.id)) push({ phase: 'sweep', at: o.id, sweepSlot: o.slot, work: [], note: `${o.slot}번 칸 ${o.label}: 표시가 있으니 남기고, 다음 GC를 위해 표시를 지웁니다.` });
    else {
      freed.add(o.id);
      push({ phase: 'sweep', at: o.id, sweepSlot: o.slot, work: [], note: `${o.slot}번 칸 ${o.label}: 표시가 없으니 해제해 빈 칸 목록에 돌려줍니다.` });
    }
  }
  push({ phase: 'done', at: null, sweepSlot: -1, work: [], note: `GC 끝. ${freed.size}개를 해제했습니다${freed.size ? '' : ' (쓰레기가 없었습니다)'}. 이제 프로그램이 다시 달립니다.` });
  return frames;
}

export function reachable(h: Heap): Set<string> {
  const seen = new Set<string>();
  const todo = h.refs.filter((r) => h.roots.some((x) => x.id === r.from)).map((r) => r.to);
  while (todo.length) {
    const id = todo.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const r of h.refs) if (r.from === id) todo.push(r.to);
  }
  return seen;
}

/* ─────────────── figure 2: reference counting vs tracing ─────────────── */

export interface ScriptOp {
  code: string;
  do: (w: World) => void;
}
export interface World {
  vars: Map<string, string | null>; // variable → object id
  fields: Map<string, Map<string, string>>; // object id → field → object id
  objs: string[];
}

export interface RcSnap {
  vars: [string, string | null][];
  edges: [string, string, string][]; // from object, field, to object
  objs: string[];
  /** reference counts (counting variables and fields) */
  rc: Map<string, number>;
  rcFreed: Set<string>;
  /** objects freed in this step by reference counting, in cascade order */
  rcJustFreed: string[];
  trFreed: Set<string>;
  trGarbage: Set<string>;
  gcRan: boolean;
}

export interface Script {
  id: string;
  label: string;
  ops: ScriptOp[];
}

const newObj = (w: World, id: string) => {
  w.objs.push(id);
  w.fields.set(id, new Map());
  return id;
};

export const SCRIPTS: Script[] = [
  {
    id: 'cycle',
    label: '순환 참조',
    ops: [
      { code: 'let a = { 이름: "A" };', do: (w) => w.vars.set('a', newObj(w, 'A')) },
      { code: 'let b = { 이름: "B" };', do: (w) => w.vars.set('b', newObj(w, 'B')) },
      { code: 'a.친구 = b;', do: (w) => w.fields.get('A')!.set('친구', 'B') },
      { code: 'b.친구 = a;', do: (w) => w.fields.get('B')!.set('친구', 'A') },
      { code: 'a = null;', do: (w) => w.vars.set('a', null) },
      { code: 'b = null;', do: (w) => w.vars.set('b', null) },
      { code: '// 메모리가 부족해져 GC가 돕니다', do: () => {} },
    ],
  },
  {
    id: 'chain',
    label: '연쇄 해제',
    ops: [
      { code: 'let list = { 값: 1 };', do: (w) => w.vars.set('list', newObj(w, 'N1')) },
      { code: 'list.다음 = { 값: 2 };', do: (w) => w.fields.get('N1')!.set('다음', newObj(w, 'N2')) },
      { code: 'list.다음.다음 = { 값: 3 };', do: (w) => w.fields.get('N2')!.set('다음', newObj(w, 'N3')) },
      { code: 'let mid = list.다음;', do: (w) => w.vars.set('mid', 'N2') },
      { code: 'list = null;', do: (w) => w.vars.set('list', null) },
      { code: 'mid = null;', do: (w) => w.vars.set('mid', null) },
      { code: '// 메모리가 부족해져 GC가 돕니다', do: () => {} },
    ],
  },
  {
    id: 'tree',
    label: '부모를 가리키는 자식',
    ops: [
      { code: 'let doc = { 태그: "body" };', do: (w) => w.vars.set('doc', newObj(w, 'P')) },
      { code: 'doc.자식 = { 태그: "div" };', do: (w) => w.fields.get('P')!.set('자식', newObj(w, 'C')) },
      { code: 'doc.자식.부모 = doc;', do: (w) => w.fields.get('C')!.set('부모', 'P') },
      { code: 'doc = null;', do: (w) => w.vars.set('doc', null) },
      { code: '// 메모리가 부족해져 GC가 돕니다', do: () => {} },
    ],
  },
];

/** Replay a script, tracking reference counts (with cascading frees) and what a tracing GC would see. */
export function replay(sc: Script): RcSnap[] {
  const w: World = { vars: new Map(), fields: new Map(), objs: [] };
  const rcFreed = new Set<string>();
  const trFreed = new Set<string>();
  const snaps: RcSnap[] = [];
  const counts = () => {
    const rc = new Map<string, number>(w.objs.map((o) => [o, 0]));
    for (const v of w.vars.values()) if (v && !rcFreed.has(v)) rc.set(v, (rc.get(v) ?? 0) + 1);
    for (const [from, fs] of w.fields) if (!rcFreed.has(from)) for (const to of fs.values()) if (!rcFreed.has(to)) rc.set(to, (rc.get(to) ?? 0) + 1);
    return rc;
  };
  const snap = (just: string[], gcRan: boolean): RcSnap => {
    // tracing view: reachable from the variables
    const seen = new Set<string>();
    const todo = [...w.vars.values()].filter((x): x is string => !!x);
    while (todo.length) {
      const id = todo.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const to of w.fields.get(id)?.values() ?? []) todo.push(to);
    }
    const trGarbage = new Set(w.objs.filter((o) => !seen.has(o) && !trFreed.has(o)));
    const edges: [string, string, string][] = [];
    for (const [from, fs] of w.fields) for (const [f, to] of fs) edges.push([from, f, to]);
    return { vars: [...w.vars.entries()], edges, objs: [...w.objs], rc: counts(), rcFreed: new Set(rcFreed), rcJustFreed: just, trFreed: new Set(trFreed), trGarbage, gcRan };
  };
  snaps.push(snap([], false));
  for (const op of sc.ops) {
    op.do(w);
    // reference counting: free everything whose count dropped to zero, cascading through its fields
    const just: string[] = [];
    for (;;) {
      const rc = counts();
      const zero = w.objs.find((o) => !rcFreed.has(o) && (rc.get(o) ?? 0) === 0);
      if (!zero) break;
      rcFreed.add(zero);
      just.push(zero);
    }
    const isGc = op.code.startsWith('//');
    if (isGc) {
      const s = snap(just, true);
      for (const g of s.trGarbage) trFreed.add(g);
    }
    snaps.push(snap(just, isGc));
  }
  return snaps;
}

/* ─────────────── figure 3: generational simulation ─────────────── */

export interface GenParams {
  generational: boolean;
  nursery: number; // slots in the young generation
  longFrac: number; // share of objects that live long
  heap?: number;
  ticks?: number;
  rate?: number;
}

export interface GcEvent {
  t: number;
  kind: 'minor' | 'major' | 'full';
  pause: number; // ms (model)
  freed: number;
  promoted?: number;
}

export interface GenResult {
  events: GcEvent[];
  young: number[]; // occupancy per tick
  old: number[];
  live: number[];
  heap: number;
  nursery: number;
  ticks: number;
}

// cost model (ms): marking touches live objects, sweeping touches every slot, a minor GC copies survivors
export const COST = { mark: 0.012, sweep: 0.003, copy: 0.01, fixed: 0.08 };

interface SimObj {
  dies: number;
  age: number;
}

export function simulateGen(p: GenParams): GenResult {
  const heap = p.heap ?? 1000;
  const ticks = p.ticks ?? 600;
  const rate = p.rate ?? 6;
  const nursery = p.generational ? p.nursery : 0;
  const oldCap = heap - nursery;
  const r = rng(17);
  let young: SimObj[] = [];
  let old: SimObj[] = [];
  const events: GcEvent[] = [];
  const yo: number[] = [];
  const ol: number[] = [];
  const lv: number[] = [];
  const lifetime = () => (r() < p.longFrac ? 150 + r() * 600 : 1 + -Math.log(1 - r()) * 3);

  const fullCollect = (t: number, kind: 'major' | 'full') => {
    const all = [...young, ...old];
    const live = all.filter((o) => o.dies > t);
    const freed = all.length - live.length;
    const pause = COST.fixed + COST.mark * live.length + COST.sweep * heap;
    if (kind === 'full') old = live;
    else {
      old = old.filter((o) => o.dies > t);
      young = young.filter((o) => o.dies > t);
    }
    events.push({ t, kind, pause, freed });
  };

  for (let t = 0; t < ticks; t++) {
    for (let k = 0; k < rate; k++) {
      const o = { dies: t + lifetime(), age: 0 };
      if (!p.generational) {
        if (old.length >= oldCap) fullCollect(t, 'full');
        if (old.length >= oldCap) break; // heap is all live: out of memory (not reached with these settings)
        old.push(o);
        continue;
      }
      if (young.length >= nursery) {
        // minor GC: copy the survivors; objects that survived twice move to the old generation
        const surv = young.filter((x) => x.dies > t);
        const freed = young.length - surv.length;
        surv.forEach((x) => x.age++);
        let promote = surv.filter((x) => x.age >= 2);
        young = surv.filter((x) => x.age < 2);
        if (old.length + promote.length > oldCap) {
          fullCollect(t, 'major');
        }
        const room = Math.max(0, oldCap - old.length);
        if (promote.length > room) {
          young.push(...promote.slice(room));
          promote = promote.slice(0, room);
        }
        old.push(...promote);
        events.push({ t, kind: 'minor', pause: COST.fixed * 0.5 + COST.copy * surv.length, freed, promoted: promote.length });
      }
      young.push(o);
    }
    yo.push(young.length);
    ol.push(old.length);
    lv.push([...young, ...old].filter((o) => o.dies > t).length);
  }
  return { events, young: yo, old: ol, live: lv, heap, nursery, ticks };
}
