/* 계산 이론: a tokenizer, a traced recursive-descent parser and parse-tree enumeration */

import type { TNode } from './Diagram';

export interface Token {
  type: 'num' | 'op' | 'lp' | 'rp';
  text: string;
  pos: number;
}

export class ParseError extends Error {
  pos: number; // character position in the source
  constructor(msg: string, pos: number) {
    super(msg);
    this.pos = pos;
  }
}

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') {
      i++;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9]/.test(src[j])) j++;
      out.push({ type: 'num', text: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if ('+-*/'.includes(c)) out.push({ type: 'op', text: c, pos: i });
    else if (c === '(') out.push({ type: 'lp', text: c, pos: i });
    else if (c === ')') out.push({ type: 'rp', text: c, pos: i });
    else throw new ParseError(`알 수 없는 글자 ${c}`, i);
    i++;
  }
  return out;
}

const apply = (op: string, a: number, b: number) => (op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b);

/* ── recursive descent with a trace ── */

export interface ParseFrame {
  stack: { fn: string; node: number }[];
  next: number; // index of the next unread token
  created: number; // nodes with id < created exist
  finished: number; // finishOrder.slice(0, finished) have values
  active: number;
  note: string;
}

export interface ParseRun {
  tokens: Token[];
  nodes: Map<number, TNode>;
  root: number;
  frames: ParseFrame[];
  finishOrder: number[];
  value: number;
  calls: number;
  ast: { nodes: Map<number, TNode>; root: number };
}

const OP_NAME: Record<string, string> = { '+': '덧셈', '-': '뺄셈', '*': '곱셈', '/': '나눗셈' };

export function parseTraced(src: string): ParseRun {
  const tokens = tokenize(src);
  if (!tokens.length) throw new ParseError('식이 비어 있습니다', 0);
  const nodes = new Map<number, TNode>();
  const frames: ParseFrame[] = [];
  const finishOrder: number[] = [];
  const stack: { fn: string; node: number }[] = [];
  let next = 0;
  let calls = 0;
  const peek = () => tokens[next];
  const mk = (label: string, kind: TNode['kind']) => {
    const id = nodes.size;
    nodes.set(id, { id, label, children: [], kind });
    return id;
  };
  const snap = (active: number, note: string) => frames.push({ stack: stack.map((s) => ({ ...s })), next, created: nodes.size, finished: finishOrder.length, active, note });
  const finish = (id: number, v: number) => {
    nodes.get(id)!.value = v;
    finishOrder.push(id);
  };
  const eat = (parent: number, note: string) => {
    const t = tokens[next++];
    const id = mk(t.text, t.type === 'num' ? 'num' : 't');
    nodes.get(parent)!.children.push(id);
    if (t.type === 'num') finish(id, Number(t.text));
    snap(id, note);
    return t;
  };
  const where = () => (peek() ? peek().pos : src.length);
  const found = () => (peek() ? `다음 토큰이 ${peek().text} 입니다` : '식이 끝났습니다');

  const call = (fn: string, parent: number | null, body: (id: number) => number): number => {
    const id = mk(fn, 'nt');
    if (parent !== null) nodes.get(parent)!.children.push(id);
    stack.push({ fn, node: id });
    calls++;
    const v = body(id);
    finish(id, v);
    snap(id, `${fn}() 끝: 값 ${fmt(v)}을 돌려줍니다.`);
    stack.pop();
    return id;
  };
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : String(v));

  // the loops of expr and term are the same shape, one precedence level apart
  const level = (fn: 'expr' | 'term', ops: string, sub: () => (parent: number) => number, subName: string, josa: string) => (parent: number | null) =>
    call(fn, parent, (id) => {
      snap(id, `${fn}(): ${subName}부터 읽습니다.`);
      let v = nodes.get(sub()(id))!.value!;
      while (peek() && peek().type === 'op' && ops.includes(peek().text)) {
        const op = peek().text;
        eat(id, `다음 토큰이 ${op}이므로 ${OP_NAME[op]} 기호를 먹고, ${subName}${josa} 하나 더 읽습니다.`);
        const r = nodes.get(sub()(id))!.value!;
        v = apply(op, v, r);
      }
      return v;
    });
  const expr: (parent: number | null) => number = level('expr', '+-', () => term, 'term', '을');
  const term: (parent: number | null) => number = level('term', '*/', () => factor, 'factor', '를');
  const factor = (parent: number | null): number =>
    call('factor', parent, (id) => {
      const t = peek();
      if (t && t.type === 'num') {
        snap(id, `factor(): 다음 토큰이 숫자입니다.`);
        eat(id, `숫자 ${t.text}을 먹습니다.`);
        return Number(t.text);
      }
      if (t && t.type === 'lp') {
        eat(id, `factor(): ( 를 먹고, 괄호 안의 식을 읽으려고 expr()을 다시 부릅니다. 재귀입니다.`);
        const inner = expr(id);
        if (!peek() || peek().type !== 'rp') throw new ParseError(`닫는 괄호 )가 와야 하는데 ${found()}`, where());
        eat(id, `괄호 안의 식이 끝났으니 ) 를 먹습니다.`);
        return nodes.get(inner)!.value!;
      }
      throw new ParseError(`숫자나 ( 가 와야 하는데 ${found()}`, where());
    });

  const root = expr(null);
  if (next < tokens.length) throw new ParseError(`식이 끝나야 하는데 ${tokens[next].text} 부터 읽지 못하고 남았습니다`, tokens[next].pos);
  return { tokens, nodes, root, frames, finishOrder, value: nodes.get(root)!.value!, calls, ast: toAst(nodes, root) };
}

/** Collapse the parse tree into an abstract syntax tree: operators with their operands. */
function toAst(pt: Map<number, TNode>, root: number): { nodes: Map<number, TNode>; root: number } {
  const nodes = new Map<number, TNode>();
  const mk = (label: string, kind: TNode['kind'], children: number[], value: number) => {
    const id = nodes.size;
    nodes.set(id, { id, label, kind, children, value });
    return id;
  };
  const go = (id: number): number => {
    const n = pt.get(id)!;
    if (n.kind === 'num') return mk(n.label, 'num', [], n.value!);
    if (n.label === 'factor') {
      const kids = n.children.map((c) => pt.get(c)!);
      const inner = kids.find((k) => k.kind === 'nt' || k.kind === 'num')!;
      return go(inner.id);
    }
    // expr / term: operand (op operand)*, folded to the left
    let left = go(n.children[0]);
    for (let i = 1; i + 1 < n.children.length; i += 2) {
      const op = pt.get(n.children[i])!.label;
      const right = go(n.children[i + 1]);
      left = mk(op, 'op', [left, right], apply(op, nodes.get(left)!.value!, nodes.get(right)!.value!));
    }
    return left;
  };
  const r = go(root);
  return { nodes, root: r };
}

/* ── every parse tree of the ambiguous grammar  E → E op E | number ── */

type Shape = number | [Shape, Shape]; // operand index, or (left, right) joined by the operator between them

function shapes(i: number, j: number): Shape[] {
  if (i === j) return [i];
  const out: Shape[] = [];
  for (let k = i; k < j; k++) for (const l of shapes(i, k)) for (const r of shapes(k + 1, j)) out.push([l, r]);
  return out;
}

export interface AmbTree {
  nodes: Map<number, TNode>;
  root: number;
  value: number;
  key: string;
}

export function allTrees(nums: number[], ops: string[]): AmbTree[] {
  return shapes(0, nums.length - 1).map((sh) => {
    const nodes = new Map<number, TNode>();
    const build = (s: Shape): number => {
      if (typeof s === 'number') {
        const id = nodes.size;
        nodes.set(id, { id, label: String(nums[s]), kind: 'num', children: [], value: nums[s] });
        return id;
      }
      // the operator joining the two halves sits right after the left half's last operand
      const opIndex = lastOperand(s[0]);
      const l = build(s[0]);
      const r = build(s[1]);
      const id = nodes.size;
      nodes.set(id, { id, label: ops[opIndex], kind: 'op', children: [l, r], value: apply(ops[opIndex], nodes.get(l)!.value!, nodes.get(r)!.value!) });
      return id;
    };
    const root = build(sh);
    return { nodes, root, value: nodes.get(root)!.value!, key: keyOf(sh) };
  });
}

const lastOperand = (s: Shape): number => (typeof s === 'number' ? s : lastOperand(s[1]));
const keyOf = (s: Shape): string => (typeof s === 'number' ? String(s) : `(${keyOf(s[0])} ${keyOf(s[1])})`);

/** The shape our layered grammar picks: * and / bind tighter, and equal operators group to the left. */
export function standardKey(ops: string[]): string {
  const prec = (o: string) => (o === '*' || o === '/' ? 2 : 1);
  const vals: string[] = ['0'];
  const st: string[] = [];
  const reduce = () => {
    st.pop();
    const r = vals.pop()!;
    const l = vals.pop()!;
    vals.push(`(${l} ${r})`);
  };
  ops.forEach((o, i) => {
    while (st.length && prec(st[st.length - 1]) >= prec(o)) reduce();
    st.push(o);
    vals.push(String(i + 1));
  });
  while (st.length) reduce();
  return vals[0];
}
