/**
 * A small parser and step-by-step evaluator for JavaScript-like expressions, used to show
 * operator precedence as a tree that is reduced one operator at a time, in the same order a
 * JavaScript engine evaluates it (left operand, right operand, then the operator; && and ||
 * skip their right side when the left side already decides the answer).
 */

import { lit } from './trace';

export type Prim = number | string | boolean | null | undefined;

export type Node =
  | { id: number; k: 'lit'; v: Prim; src: string }
  | { id: number; k: 'var'; name: string }
  | { id: number; k: 'bin'; op: string; l: Node; r: Node }
  | { id: number; k: 'un'; op: string; x: Node }
  | { id: number; k: 'paren'; x: Node };

export const ENV: Record<string, Prim> = { price: 1200, qty: 3, name: '민지', member: true, score: 85 };

const PREC: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '===': 3,
  '!==': 3,
  '==': 3,
  '!=': 3,
  '<': 4,
  '>': 4,
  '<=': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

type Tok = { t: 'num' | 'str' | 'id' | 'op' | '(' | ')'; s: string; at: number };

export class ParseError extends Error {
  constructor(msg: string, readonly at: number) {
    super(msg);
  }
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const ops = ['===', '!==', '<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '!'];
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)/);
      if (!m) throw new ParseError('숫자를 읽을 수 없습니다', i);
      out.push({ t: 'num', s: m[1], at: i });
      i += m[1].length;
      continue;
    }
    if (c === "'" || c === '"') {
      const j = src.indexOf(c, i + 1);
      if (j < 0) throw new ParseError('문자열의 닫는 따옴표가 없습니다', i);
      out.push({ t: 'str', s: src.slice(i + 1, j), at: i });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_가-힣]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-z_가-힣][\w가-힣]*/)!;
      out.push({ t: 'id', s: m[0], at: i });
      i += m[0].length;
      continue;
    }
    if (c === '(' || c === ')') {
      out.push({ t: c, s: c, at: i });
      i++;
      continue;
    }
    const op = ops.find((o) => src.startsWith(o, i));
    if (!op) throw new ParseError(`'${c}'는 이 계산기에서 쓸 수 없는 기호입니다`, i);
    out.push({ t: 'op', s: op, at: i });
    i += op.length;
  }
  return out;
}

export function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  let id = 0;
  const peek = () => toks[p];
  const end = src.length;

  const primary = (): Node => {
    const t = toks[p];
    if (!t) throw new ParseError('식이 중간에 끝났습니다', end);
    if (t.t === 'op' && (t.s === '-' || t.s === '!' || t.s === '+')) {
      p++;
      return { id: id++, k: 'un', op: t.s, x: primary() };
    }
    p++;
    if (t.t === 'num') return { id: id++, k: 'lit', v: Number(t.s), src: t.s };
    if (t.t === 'str') return { id: id++, k: 'lit', v: t.s, src: `'${t.s}'` };
    if (t.t === 'id') {
      if (t.s === 'true' || t.s === 'false') return { id: id++, k: 'lit', v: t.s === 'true', src: t.s };
      if (t.s === 'null') return { id: id++, k: 'lit', v: null, src: 'null' };
      if (t.s === 'undefined') return { id: id++, k: 'lit', v: undefined, src: 'undefined' };
      if (!(t.s in ENV)) throw new ParseError(`'${t.s}'라는 변수는 없습니다 (쓸 수 있는 변수: ${Object.keys(ENV).join(', ')})`, t.at);
      return { id: id++, k: 'var', name: t.s };
    }
    if (t.t === '(') {
      const x = binary(0);
      if (peek()?.t !== ')') throw new ParseError('닫는 괄호 )가 없습니다', peek()?.at ?? end);
      p++;
      return { id: id++, k: 'paren', x };
    }
    throw new ParseError(`여기에 '${t.s}'가 올 수 없습니다`, t.at);
  };

  const binary = (min: number): Node => {
    let l = primary();
    for (;;) {
      const t = peek();
      if (!t || t.t !== 'op' || !(t.s in PREC) || PREC[t.s] < min) break;
      const pr = PREC[t.s];
      p++;
      // left-associative: the right side may only hold operators that bind tighter
      const r = binary(pr + 1);
      l = { id: id++, k: 'bin', op: t.s, l, r };
    }
    return l;
  };

  if (!toks.length) throw new ParseError('식을 입력하세요', 0);
  const root = binary(0);
  if (p < toks.length) throw new ParseError(`'${toks[p].s}' 앞에 연산자가 빠진 것 같습니다`, toks[p].at);
  let count = 0;
  const walk = (n: Node) => {
    count++;
    if (n.k === 'bin') (walk(n.l), walk(n.r));
    else if (n.k === 'un' || n.k === 'paren') walk(n.x);
  };
  walk(root);
  if (count > 31) throw new ParseError('식이 너무 깁니다. 조금 짧게 써 보세요', 0);
  return root;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function apply(op: string, a: any, b: any): Prim {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return a / b;
    case '%':
      return a % b;
    case '<':
      return a < b;
    case '>':
      return a > b;
    case '<=':
      return a <= b;
    case '>=':
      return a >= b;
    case '===':
      return a === b;
    case '!==':
      return a !== b;
    case '==':
      return a == b;
    case '!=':
      return a != b;
  }
  return undefined;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface EvalState {
  vals: Map<number, Prim>;
  skipped: Set<number>;
}

export interface EvalStep {
  target: number; // node reduced in this step
  note: string;
}

export interface Evaluation {
  root: Node;
  states: EvalState[]; // states[0]: nothing computed; states[k]: after step k
  steps: EvalStep[];
  value: Prim;
}

const typeName = (v: Prim) => (typeof v === 'number' ? '숫자' : typeof v === 'string' ? '문자열' : typeof v === 'boolean' ? '참·거짓' : String(v));

export function evaluate(root: Node): Evaluation {
  const vals = new Map<number, Prim>();
  const skipped = new Set<number>();
  const states: EvalState[] = [];
  const steps: EvalStep[] = [];
  const snap = () => states.push({ vals: new Map(vals), skipped: new Set(skipped) });
  const skipAll = (n: Node) => {
    skipped.add(n.id);
    if (n.k === 'bin') (skipAll(n.l), skipAll(n.r));
    else if (n.k === 'un' || n.k === 'paren') skipAll(n.x);
  };
  // literals are values from the start
  const seed = (n: Node) => {
    if (n.k === 'lit') vals.set(n.id, n.v);
    else if (n.k === 'bin') (seed(n.l), seed(n.r));
    else if (n.k === 'un' || n.k === 'paren') seed(n.x);
  };
  seed(root);
  snap();
  const done = (n: Node, v: Prim, note: string) => {
    vals.set(n.id, v);
    steps.push({ target: n.id, note });
    snap();
    return v;
  };
  const ev = (n: Node): Prim => {
    switch (n.k) {
      case 'lit':
        return n.v;
      case 'var':
        return done(n, ENV[n.name], `변수 ${n.name}를 그 안에 담긴 값 ${lit(ENV[n.name])}로 바꿉니다.`);
      case 'paren': {
        const v = ev(n.x);
        vals.set(n.id, v); // parentheses disappear together with their content
        return v;
      }
      case 'un': {
        const x = ev(n.x);
        const v = n.op === '-' ? -(x as number) : n.op === '+' ? +(x as number) : !x;
        return done(n, v, `${n.op}${lit(x)} → ${lit(v)}`);
      }
      case 'bin': {
        const a = ev(n.l);
        if (n.op === '&&' || n.op === '||') {
          const decided = n.op === '&&' ? !a : !!a;
          if (decided) {
            skipAll(n.r);
            return done(n, a, `왼쪽이 ${lit(a)}이므로 ${n.op}의 답은 이미 정해졌습니다. 오른쪽은 계산하지 않고 건너뜁니다 (단락 평가).`);
          }
          const b = ev(n.r);
          return done(n, b, `왼쪽이 ${lit(a)}이므로 답은 오른쪽 값 ${lit(b)}입니다.`);
        }
        const b = ev(n.r);
        const v = apply(n.op, a, b);
        let note = `${lit(a)} ${n.op} ${lit(b)} → ${lit(v)}`;
        if (n.op === '+' && (typeof a === 'string' || typeof b === 'string')) note += ` (한쪽이 문자열이면 +는 글자를 이어 붙입니다)`;
        else if (typeof a !== typeof b && ['-', '*', '/', '%'].includes(n.op)) note += ` (${typeName(a)}와 ${typeName(b)}: 숫자로 바꿔 계산합니다)`;
        return done(n, v, note);
      }
    }
  };
  const value = ev(root);
  return { root, states, steps, value };
}

/** Text of the expression in a given state, split so the node `hl` can be highlighted. */
export interface Seg {
  s: string;
  hl: boolean;
}

export function render(n: Node, st: EvalState, hl: number): Seg[] {
  const out: Seg[] = [];
  const emit = (s: string, on: boolean) => {
    const last = out[out.length - 1];
    if (last && last.hl === on) last.s += s;
    else out.push({ s, hl: on });
  };
  const go = (m: Node, on: boolean) => {
    const here = on || m.id === hl;
    if (st.vals.has(m.id)) return emit(lit(st.vals.get(m.id)), here);
    switch (m.k) {
      case 'lit':
        return emit(m.src, here);
      case 'var':
        return emit(m.name, here);
      case 'paren':
        emit('(', here);
        go(m.x, here);
        return emit(')', here);
      case 'un':
        emit(m.op, here);
        return go(m.x, here);
      case 'bin':
        go(m.l, here);
        emit(` ${m.op} `, here);
        return go(m.r, here);
    }
  };
  go(n, false);
  return out;
}

/** Tree layout without parentheses: x = in-order position, y = depth. */
export interface TreeNode {
  id: number;
  label: string;
  x: number;
  depth: number;
  parent: number;
  kind: Node['k'];
}

export function layout(root: Node): { nodes: TreeNode[]; width: number; depth: number } {
  const nodes: TreeNode[] = [];
  let x = 0;
  let maxD = 0;
  const go = (n: Node, d: number, parent: number) => {
    if (n.k === 'paren') return go(n.x, d, parent); // parentheses only shape the tree
    maxD = Math.max(maxD, d);
    const me: TreeNode = { id: n.id, label: '', x: 0, depth: d, parent, kind: n.k };
    if (n.k === 'bin') {
      go(n.l, d + 1, n.id);
      me.x = x++;
      me.label = n.op;
      nodes.push(me);
      go(n.r, d + 1, n.id);
    } else if (n.k === 'un') {
      me.x = x++;
      me.label = n.op;
      nodes.push(me);
      go(n.x, d + 1, n.id);
    } else {
      me.x = x++;
      me.label = n.k === 'lit' ? n.src : n.name;
      nodes.push(me);
    }
  };
  go(root, 0, -1);
  return { nodes, width: x, depth: maxD };
}

/** The node a tree node's value lives on (a parenthesised child stores its value on the paren too). */
export function childIds(root: Node): Map<number, number[]> {
  const m = new Map<number, number[]>();
  const strip = (n: Node): Node => (n.k === 'paren' ? strip(n.x) : n);
  const go = (n: Node) => {
    if (n.k === 'bin') {
      m.set(n.id, [strip(n.l).id, strip(n.r).id]);
      go(n.l);
      go(n.r);
    } else if (n.k === 'un') {
      m.set(n.id, [strip(n.x).id]);
      go(n.x);
    } else if (n.k === 'paren') go(n.x);
  };
  go(root);
  return m;
}
