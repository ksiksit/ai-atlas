/* 계산 이론: finite automata and regular expressions, computed in the browser */

import type { DEdge, DNode } from './Diagram';

/* ───────────────────────── DFA ───────────────────────── */

export interface Dfa {
  states: string[]; // display labels, index = state id
  alphabet: string[];
  start: number;
  accept: boolean[];
  delta: number[][]; // delta[state][symbol index] → state
}

export interface DfaStep {
  pos: number; // characters consumed
  state: number;
  edge: [number, number] | null; // (from, symbol index) of the transition just taken
}

export function runDfa(d: Dfa, input: string): DfaStep[] {
  const out: DfaStep[] = [{ pos: 0, state: d.start, edge: null }];
  let q = d.start;
  for (let i = 0; i < input.length; i++) {
    const a = d.alphabet.indexOf(input[i]);
    if (a < 0) break;
    const from = q;
    q = d.delta[q][a];
    out.push({ pos: i + 1, state: q, edge: [from, a] });
  }
  return out;
}

export const acceptsDfa = (d: Dfa, s: string) => {
  const t = runDfa(d, s);
  return t.length === s.length + 1 && d.accept[t[t.length - 1].state];
};

/**
 * Edges of a DFA diagram: transitions with the same (from, to) share one arrow
 * ("0, 1"); a pair of opposite arrows bends apart.
 */
export function dfaEdges(d: Dfa, loopDir: (q: number) => 'up' | 'down' = () => 'up'): { edges: DEdge[]; key: (from: number, sym: number) => number } {
  const map = new Map<string, number>();
  const edges: DEdge[] = [];
  const keyOf: number[][] = d.delta.map(() => []);
  d.delta.forEach((row, q) =>
    row.forEach((to, a) => {
      const k = `${q}>${to}`;
      let e = map.get(k);
      if (e === undefined) {
        e = edges.length;
        map.set(k, e);
        edges.push({ from: q, to, label: d.alphabet[a], loop: q === to ? loopDir(q) : undefined });
      } else edges[e].label += ',' + d.alphabet[a];
      keyOf[q][a] = e;
    }),
  );
  for (const e of edges) if (e.from !== e.to && map.has(`${e.to}>${e.from}`)) e.bend = 16;
  return { edges, key: (from, sym) => keyOf[from]?.[sym] ?? -1 };
}

/* ───────────────────────── Regular expressions ───────────────────────── */

export type Ast =
  | { id: number; type: 'lit'; ch: string }
  | { id: number; type: 'eps' }
  | { id: number; type: 'cat'; parts: Ast[] }
  | { id: number; type: 'alt'; alts: Ast[] }
  | { id: number; type: 'star' | 'plus' | 'opt'; sub: Ast };

export class RegexError extends Error {
  pos: number;
  constructor(msg: string, pos: number) {
    super(msg);
    this.pos = pos;
  }
}

const SPECIAL = new Set(['|', '*', '+', '?', '(', ')']);

/** Recursive-descent parser for literals, concatenation, |, *, +, ? and parentheses. */
export function parseRegex(src: string): Ast {
  let i = 0;
  let id = 0;
  const alt = (): Ast => {
    const alts = [cat()];
    while (src[i] === '|') {
      i++;
      alts.push(cat());
    }
    return alts.length === 1 ? alts[0] : { id: id++, type: 'alt', alts };
  };
  const cat = (): Ast => {
    const parts: Ast[] = [];
    while (i < src.length && src[i] !== '|' && src[i] !== ')') parts.push(rep());
    if (!parts.length) return { id: id++, type: 'eps' };
    return parts.length === 1 ? parts[0] : { id: id++, type: 'cat', parts };
  };
  const rep = (): Ast => {
    let a = atom();
    while (src[i] === '*' || src[i] === '+' || src[i] === '?') {
      const op = src[i++];
      a = { id: id++, type: op === '*' ? 'star' : op === '+' ? 'plus' : 'opt', sub: a };
    }
    return a;
  };
  const atom = (): Ast => {
    const c = src[i];
    if (c === '(') {
      i++;
      const inner = alt();
      if (src[i] !== ')') throw new RegexError('닫는 괄호 )가 없습니다', i);
      i++;
      return inner;
    }
    if (c === '*' || c === '+' || c === '?') throw new RegexError(`${c} 앞에 반복할 것이 없습니다`, i);
    if (!/[a-z0-9]/.test(c)) throw new RegexError(`이 그림은 소문자와 숫자만 글자로 씁니다: ${c}`, i);
    i++;
    return { id: id++, type: 'lit', ch: c };
  };
  const ast = alt();
  if (i < src.length) throw new RegexError(src[i] === ')' ? '여는 괄호 (가 없는 )입니다' : `읽을 수 없는 글자: ${src[i]}`, i);
  // ids in post-order (children before parents) so the construction can be replayed in order
  let k = 0;
  const renumber = (n: Ast) => {
    if (n.type === 'cat') n.parts.forEach(renumber);
    else if (n.type === 'alt') n.alts.forEach(renumber);
    else if (n.type === 'star' || n.type === 'plus' || n.type === 'opt') renumber(n.sub);
    n.id = k++;
  };
  renumber(ast);
  return ast;
}

/** The source text of a sub-expression, with only the parentheses it needs. */
export function regexText(n: Ast): string {
  const wrap = (s: string, need: boolean) => (need ? `(${s})` : s);
  switch (n.type) {
    case 'lit':
      return n.ch;
    case 'eps':
      return 'ε';
    case 'cat':
      return n.parts.map((p) => wrap(regexText(p), p.type === 'alt')).join('');
    case 'alt':
      return n.alts.map((a) => regexText(a)).join('|');
    default: {
      const s = regexText(n.sub);
      const need = n.sub.type === 'cat' || n.sub.type === 'alt';
      return wrap(s, need) + (n.type === 'star' ? '*' : n.type === 'plus' ? '+' : '?');
    }
  }
}

export const isSpecial = (c: string) => SPECIAL.has(c);

/* ── Thompson construction with a layout ── */

export interface NfaEdge extends DEdge {
  sym: string | null; // null = ε
  owner: number; // AST node that created it
}

export interface Nfa {
  nodes: (DNode & { owner: number })[];
  edges: NfaEdge[];
  start: number;
  accept: number;
  width: number;
  height: number;
  order: Ast[]; // AST nodes in construction (post-) order
}

interface Size {
  w: number;
  top: number;
  bottom: number;
}

const ARC = 0.55; // room for a loop-back or bypass arc, in rows

function measure(n: Ast, memo: Map<Ast, Size>): Size {
  let s: Size;
  switch (n.type) {
    case 'lit':
    case 'eps':
      s = { w: 1, top: 0.5, bottom: 0.5 };
      break;
    case 'cat': {
      const ps = n.parts.map((p) => measure(p, memo));
      s = { w: ps.reduce((a, p) => a + p.w, 0), top: Math.max(...ps.map((p) => p.top)), bottom: Math.max(...ps.map((p) => p.bottom)) };
      break;
    }
    case 'alt': {
      const ps = n.alts.map((p) => measure(p, memo));
      const H = ps.reduce((a, p) => a + p.top + p.bottom, 0);
      s = { w: Math.max(...ps.map((p) => p.w)) + 2, top: H / 2, bottom: H / 2 };
      break;
    }
    default: {
      const p = measure(n.sub, memo);
      s = { w: p.w + 2, top: p.top + (n.type === 'opt' ? 0 : ARC), bottom: p.bottom + (n.type === 'plus' ? 0 : ARC) };
    }
  }
  memo.set(n, s);
  return s;
}

export function thompson(ast: Ast, ux = 56, uy = 50, pad = 34): Nfa {
  const memo = new Map<Ast, Size>();
  const total = measure(ast, memo);
  const raw: { x: number; y: number; owner: number }[] = [];
  const edges: NfaEdge[] = [];
  const order: Ast[] = [];
  const node = (x: number, y: number, owner: number) => raw.push({ x, y, owner }) - 1;
  const edge = (from: number, to: number, sym: string | null, owner: number, ctrl?: [number, number]) =>
    edges.push({ from, to, label: sym ?? 'ε', sym, owner, ctrl });

  // place fragment n with its start at column x0 on row yc; returns the end node
  const build = (n: Ast, x0: number, yc: number, startId: number | null): number => {
    const sz = memo.get(n)!;
    const s = startId ?? node(x0, yc, n.id);
    let end: number;
    switch (n.type) {
      case 'lit':
      case 'eps':
        end = node(x0 + 1, yc, n.id);
        edge(s, end, n.type === 'lit' ? n.ch : null, n.id);
        break;
      case 'cat': {
        let cur = s;
        let x = x0;
        for (const p of n.parts) {
          cur = build(p, x, yc, cur);
          x += memo.get(p)!.w;
        }
        end = cur;
        break;
      }
      case 'alt': {
        end = node(x0 + sz.w, yc, n.id);
        let y = yc - sz.top;
        for (const a of n.alts) {
          const as = memo.get(a)!;
          const ay = y + as.top;
          const aStart = node(x0 + 1, ay, n.id);
          edge(s, aStart, null, n.id);
          const aEnd = build(a, x0 + 1, ay, aStart);
          edge(aEnd, end, null, n.id);
          y += as.top + as.bottom;
        }
        break;
      }
      default: {
        const sub = memo.get(n.sub)!;
        const inS = node(x0 + 1, yc, n.id);
        edge(s, inS, null, n.id);
        const inE = build(n.sub, x0 + 1, yc, inS);
        end = node(x0 + sz.w, yc, n.id);
        edge(inE, end, null, n.id);
        // control points in layout units; converted to pixels below
        if (n.type !== 'opt') edge(inE, inS, null, n.id, [x0 + 1 + sub.w / 2, yc - 2 * (sub.top + 0.32)]);
        if (n.type !== 'plus') edge(s, end, null, n.id, [x0 + sz.w / 2, yc + 2 * (sub.bottom + 0.32)]);
      }
    }
    order.push(n);
    return end;
  };
  const end = build(ast, 0, 0, null);
  // the construction order should follow the AST's post-order ids
  order.sort((a, b) => a.id - b.id);

  const X = (x: number) => pad + x * ux;
  const Y = (y: number) => pad + (y + total.top) * uy;
  // number states left to right, top to bottom
  const idx = raw.map((_, i) => i).sort((a, b) => raw[a].x - raw[b].x || raw[a].y - raw[b].y);
  const rename = new Array<number>(raw.length);
  idx.forEach((old, k) => (rename[old] = k));
  const nodes = idx.map((old, k) => ({ id: k, x: X(raw[old].x), y: Y(raw[old].y), label: String(k), owner: raw[old].owner, accept: old === end }));
  for (const e of edges) {
    e.from = rename[e.from];
    e.to = rename[e.to];
    if (e.ctrl) e.ctrl = [X(e.ctrl[0]), Y(e.ctrl[1])];
  }
  return { nodes, edges, start: rename[0], accept: rename[end], width: X(total.w) + pad, height: Y(total.bottom) + pad, order };
}

export function closure(nfa: Nfa, set: Iterable<number>, visit?: (q: number) => void): Set<number> {
  const out = new Set<number>();
  const stack = [...set];
  while (stack.length) {
    const q = stack.pop()!;
    if (out.has(q)) continue;
    out.add(q);
    visit?.(q);
    for (const e of nfa.edges) if (e.from === q && e.sym === null && !out.has(e.to)) stack.push(e.to);
  }
  return out;
}

export interface NfaFrame {
  pos: number;
  set: Set<number>;
  fired: Set<number>; // edge indices used to read the last character
  before: Set<number> | null; // states that read the last character
}

/** Whole-string (anchored) simulation, one frame per character. */
export function simulateNfa(nfa: Nfa, input: string): NfaFrame[] {
  let cur = closure(nfa, [nfa.start]);
  const frames: NfaFrame[] = [{ pos: 0, set: cur, fired: new Set(), before: null }];
  for (let i = 0; i < input.length; i++) {
    const fired = new Set<number>();
    const next: number[] = [];
    nfa.edges.forEach((e, k) => {
      if (cur.has(e.from) && e.sym === input[i]) {
        fired.add(k);
        next.push(e.to);
      }
    });
    const before = cur;
    cur = closure(nfa, next);
    frames.push({ pos: i + 1, set: cur, fired, before });
  }
  return frames;
}

/* ── counting the work of two matchers ── */

/**
 * A backtracking matcher in the style of JavaScript's RegExp, searching for a match
 * anywhere in s (like RegExp.test). Counts character comparisons; gives up past `budget`.
 */
export function backtrackSteps(ast: Ast, s: string, budget = 4e6): { steps: number; matched: boolean; capped: boolean } {
  let steps = 0;
  const STOP = {};
  type K = (i: number) => boolean;
  const m = (n: Ast, i: number, k: K): boolean => {
    switch (n.type) {
      case 'lit':
        if (++steps > budget) throw STOP;
        return s[i] === n.ch && k(i + 1);
      case 'eps':
        return k(i);
      case 'cat': {
        const go = (j: number, at: number): boolean => (j === n.parts.length ? k(at) : m(n.parts[j], at, (t) => go(j + 1, t)));
        return go(0, i);
      }
      case 'alt':
        for (const a of n.alts) if (m(a, i, k)) return true;
        return false;
      case 'opt':
        return m(n.sub, i, k) || k(i);
      default: {
        // greedy: try one more round first; a round that consumes nothing ends the loop
        const loop = (j: number): boolean => m(n.sub, j, (t) => t > j && loop(t)) || k(j);
        return n.type === 'star' ? loop(i) : m(n.sub, i, (t) => loop(t));
      }
    }
  };
  try {
    for (let st = 0; st <= s.length; st++) if (m(ast, st, () => true)) return { steps, matched: true, capped: false };
    return { steps, matched: false, capped: false };
  } catch (e) {
    if (e === STOP) return { steps, matched: false, capped: true };
    throw e;
  }
}

/** State-set simulation searching anywhere in s: one pass, a new thread may start at every position. */
export function nfaSearchSteps(nfa: Nfa, s: string): { steps: number; matched: boolean } {
  let steps = 0;
  const count = () => steps++;
  let cur = closure(nfa, [nfa.start], count);
  if (cur.has(nfa.accept)) return { steps, matched: true };
  for (let i = 0; i < s.length; i++) {
    const next: number[] = [];
    for (const e of nfa.edges) if (cur.has(e.from) && e.sym === s[i]) next.push(e.to);
    next.push(nfa.start);
    cur = closure(nfa, next, count);
    if (cur.has(nfa.accept)) return { steps, matched: true };
  }
  return { steps, matched: false };
}

/** Literal characters used in a regex, in first-seen order. */
export function regexAlphabet(src: string): string[] {
  return [...new Set([...src].filter((c) => !SPECIAL.has(c)))];
}

/** Number of states of the DFA that the subset construction builds from this NFA (the empty set included if reached). */
export function subsetDfaSize(nfa: Nfa, alphabet: string[]): number {
  const keyOf = (s: Set<number>) => [...s].sort((a, b) => a - b).join(',');
  const first = closure(nfa, [nfa.start]);
  const seen = new Set([keyOf(first)]);
  const queue = [first];
  while (queue.length && seen.size < 5000) {
    const cur = queue.shift()!;
    for (const a of alphabet) {
      const next: number[] = [];
      for (const e of nfa.edges) if (cur.has(e.from) && e.sym === a) next.push(e.to);
      const s = closure(nfa, next);
      const k = keyOf(s);
      if (!seen.has(k)) {
        seen.add(k);
        queue.push(s);
      }
    }
  }
  return seen.size;
}
