/**
 * A tiny execution recorder for the code tracer figures.
 *
 * Each preset program is written twice: once as the source text the reader sees, and once as
 * real TypeScript that does the same work and calls the recorder (`t.step`, `t.def`, `t.enter` …)
 * as it goes. The trace is therefore computed by actually running the program, not typed by hand.
 *
 * A source line can carry a marker `@@name` at its end; it is stripped for display and lets the
 * recorder refer to lines by name (`t.step('loop', …)`) so the two copies cannot drift apart.
 */

export type Val = { t: 'num' | 'str' | 'bool' | 'undef' | 'null' | 'fn'; s: string } | { t: 'ref'; id: number };

export interface VarRow {
  name: string;
  v: Val;
  changed: boolean;
}

export interface FrameSnap {
  key: string;
  title: string;
  vars: VarRow[];
  ret?: Val;
}

export interface HeapCell {
  key: string;
  v: Val;
  changed: boolean;
}

export interface HeapSnap {
  id: number;
  kind: 'array' | 'object';
  cells: HeapCell[];
  depth: number; // 1 = held by a variable, 2 = held by an object held by a variable …
  fresh: boolean; // created in this step
}

export interface Snap {
  line: number; // 0-based line index of the line that just ran (-1: nothing yet)
  note: string;
  ann?: string; // short annotation shown at the end of the current line, e.g. "→ true"
  frames: FrameSnap[]; // frames[0] is the global frame, the last one is running
  heap: HeapSnap[];
  out: string[];
}

export interface Program {
  lines: string[];
  snaps: Snap[];
  maxFrames: number;
  hasHeap: boolean;
}

interface LiveFrame {
  key: string;
  title: string;
  vars: Map<string, unknown>;
  ret?: unknown;
  hasRet: boolean;
}

const MARK = /\s*@@([\w-]+)\s*$/;

/** Split source into display lines and a map from marker name to line index. */
export function parseSource(src: string): { lines: string[]; marks: Map<string, number> } {
  const raw = src.replace(/^\n+|\s+$/g, '').split('\n');
  const marks = new Map<string, number>();
  const lines = raw.map((l, i) => {
    const m = l.match(MARK);
    if (m) {
      marks.set(m[1], i);
      return l.replace(MARK, '');
    }
    return l;
  });
  return { lines, marks };
}

/** How JavaScript's console would show a value nested inside an array or object. */
export function show(v: unknown, depth = 0): string {
  if (typeof v === 'string') return depth === 0 ? v : `'${v}'`;
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (typeof v === 'function') return `[함수 ${v.name || ''}]`;
  if (depth > 3) return Array.isArray(v) ? '[…]' : '{…}';
  if (Array.isArray(v)) return '[' + v.map((x) => show(x, depth + 1)).join(', ') + ']';
  if (typeof v === 'object') {
    const e = Object.entries(v as Record<string, unknown>);
    return e.length ? '{ ' + e.map(([k, x]) => `${k}: ${show(x, depth + 1)}`).join(', ') + ' }' : '{}';
  }
  return String(v);
}

/** A literal as it would be written in code: strings get quotes. */
export function lit(v: unknown): string {
  return show(v, 1);
}

const valKey = (v: Val) => (v.t === 'ref' ? `#${v.id}` : `${v.t}:${v.s}`);

export class Tracer {
  readonly lines: string[];
  private marks: Map<string, number>;
  private stack: LiveFrame[] = [{ key: 'g', title: '전역', vars: new Map(), hasRet: false }];
  private ids = new WeakMap<object, number>();
  private nextId = 1;
  private calls = 0;
  private out: string[] = [];
  private prev: Snap | null = null;
  readonly snaps: Snap[] = [];
  private maxFrames = 1;
  private sawHeap = false;
  /** Upper bound on recorded steps, so a mistake in a preset cannot hang the page. */
  limit = 600;

  constructor(src: string) {
    const p = parseSource(src);
    this.lines = p.lines;
    this.marks = p.marks;
  }

  private top() {
    return this.stack[this.stack.length - 1];
  }

  /** Declare a variable in the running frame (let / const / parameter). */
  def(name: string, v: unknown) {
    this.top().vars.set(name, v);
    return v;
  }

  /** Assign to an existing variable: the running frame first, then the global frame. */
  set(name: string, v: unknown) {
    const f = this.top().vars.has(name) ? this.top() : this.stack[0];
    f.vars.set(name, v);
    return v;
  }

  /** Remove a block-scoped variable when its block ends (e.g. the `i` of a for loop). */
  drop(name: string) {
    this.top().vars.delete(name);
  }

  enter(title: string, args: Record<string, unknown> = {}) {
    this.calls++;
    this.stack.push({ key: `${title}#${this.calls}`, title, vars: new Map(Object.entries(args)), hasRet: false });
    this.maxFrames = Math.max(this.maxFrames, this.stack.length);
  }

  /** Mark the value the running call is about to return (shown in its frame). */
  ret<T>(v: T): T {
    const f = this.top();
    f.ret = v;
    f.hasRet = true;
    return v;
  }

  leave() {
    if (this.stack.length > 1) this.stack.pop();
  }

  log(...vals: unknown[]) {
    this.out = [...this.out, vals.map((v) => show(v)).join(' ')];
  }

  get depth() {
    return this.stack.length;
  }

  /** Record a snapshot: `line` just ran (index or `@@marker` name). */
  step(line: number | string, note: string, ann?: string) {
    if (this.snaps.length >= this.limit) throw new Error('trace limit');
    const li = typeof line === 'number' ? line : this.marks.get(line);
    if (li === undefined) throw new Error(`unknown line marker ${line}`);
    const snap = this.snapshot(li, note, ann);
    this.snaps.push(snap);
    this.prev = snap;
  }

  private val(v: unknown): Val {
    if (v !== null && typeof v === 'object') {
      let id = this.ids.get(v);
      if (id === undefined) {
        id = this.nextId++;
        this.ids.set(v, id);
      }
      return { t: 'ref', id };
    }
    if (typeof v === 'number') return { t: 'num', s: show(v) };
    if (typeof v === 'string') return { t: 'str', s: `'${v}'` };
    if (typeof v === 'boolean') return { t: 'bool', s: String(v) };
    if (v === null) return { t: 'null', s: 'null' };
    if (typeof v === 'function') return { t: 'fn', s: `ƒ ${v.name}` };
    return { t: 'undef', s: 'undefined' };
  }

  private snapshot(line: number, note: string, ann?: string): Snap {
    const prevVars = new Map<string, string>();
    const prevHeap = new Map<string, string>();
    const prevIds = new Set<number>();
    if (this.prev) {
      for (const f of this.prev.frames) for (const r of f.vars) prevVars.set(`${f.key}.${r.name}`, valKey(r.v));
      for (const h of this.prev.heap) {
        prevIds.add(h.id);
        for (const c of h.cells) prevHeap.set(`${h.id}.${c.key}`, valKey(c.v));
      }
    }
    const frames: FrameSnap[] = this.stack.map((f) => {
      const vars = [...f.vars.entries()].map(([name, raw]) => {
        const v = this.val(raw);
        const k = `${f.key}.${name}`;
        return { name, v, changed: this.prev !== null && prevVars.get(k) !== valKey(v) };
      });
      return { key: f.key, title: f.title, vars, ret: f.hasRet ? this.val(f.ret) : undefined };
    });

    // walk the objects reachable from variables, breadth first, so depth = distance from a variable
    const heap: HeapSnap[] = [];
    const seen = new Set<object>();
    let level: object[] = [];
    for (const f of this.stack) {
      for (const raw of f.vars.values()) if (raw !== null && typeof raw === 'object' && !seen.has(raw)) (seen.add(raw), level.push(raw));
      if (f.hasRet && f.ret !== null && typeof f.ret === 'object' && !seen.has(f.ret)) (seen.add(f.ret), level.push(f.ret));
    }
    let depth = 1;
    while (level.length) {
      const next: object[] = [];
      for (const o of level) {
        const id = (this.val(o) as { id: number }).id;
        const isArr = Array.isArray(o);
        const entries: [string, unknown][] = isArr ? (o as unknown[]).map((x, i) => [String(i), x]) : Object.entries(o);
        const cells = entries.map(([key, raw]) => {
          const v = this.val(raw);
          if (raw !== null && typeof raw === 'object' && !seen.has(raw)) {
            seen.add(raw);
            next.push(raw);
          }
          const pk = prevHeap.get(`${id}.${key}`);
          return { key, v, changed: this.prev !== null && prevIds.has(id) && pk !== valKey(v) };
        });
        heap.push({ id, kind: isArr ? 'array' : 'object', cells, depth, fresh: this.prev !== null && !prevIds.has(id) });
      }
      level = next;
      depth++;
    }
    if (heap.length) this.sawHeap = true;
    return { line, note, ann, frames, heap, out: this.out };
  }

  done(): Program {
    return { lines: this.lines, snaps: this.snaps, maxFrames: this.maxFrames, hasHeap: this.sawHeap };
  }
}

/** Run a recorder function against a source text and return the finished program. */
export function trace(src: string, run: (t: Tracer) => void): Program {
  const t = new Tracer(src);
  t.step(-1, '아직 아무 줄도 실행하지 않았습니다. ▶을 눌러 한 줄씩 진행하세요.');
  try {
    run(t);
  } catch (e) {
    if (!(e instanceof Error && e.message === 'trace limit')) throw e;
  }
  return t.done();
}

/** A stand-in function value with a fixed name (so a minifier cannot rename it), shown as "ƒ name". */
export function fnv(name: string): () => void {
  return Object.defineProperty(function () {}, 'name', { value: name });
}
