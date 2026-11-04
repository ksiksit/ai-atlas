/* Propositional formulas over p, q, r: a tiny parser, evaluator and truth-table builder. */

export type Var = 'p' | 'q' | 'r';
export const VARS: Var[] = ['p', 'q', 'r'];

export type Node =
  | { k: 'var'; v: Var }
  | { k: 'const'; v: boolean }
  | { k: 'not'; a: Node }
  | { k: 'and' | 'or' | 'imp' | 'iff' | 'xor'; a: Node; b: Node };

export type Parsed = { ok: true; node: Node } | { ok: false; error: string; at: number };

type Tok = { t: string; at: number };

const SYMBOLS: [string, string][] = [
  ['<->', 'iff'],
  ['<=>', 'iff'],
  ['↔', 'iff'],
  ['->', 'imp'],
  ['=>', 'imp'],
  ['→', 'imp'],
  ['&&', 'and'],
  ['&', 'and'],
  ['∧', 'and'],
  ['||', 'or'],
  ['|', 'or'],
  ['∨', 'or'],
  ['⊕', 'xor'],
  ['^', 'xor'],
  ['!', 'not'],
  ['~', 'not'],
  ['¬', 'not'],
  ['(', '('],
  [')', ')'],
  ['⊤', 'T'],
  ['⊥', 'F'],
];

function lex(src: string): Tok[] | { error: string; at: number } {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const sym = SYMBOLS.find(([s]) => src.startsWith(s, i));
    if (sym) {
      out.push({ t: sym[1], at: i });
      i += sym[0].length;
      continue;
    }
    const lower = ch.toLowerCase();
    if (lower === 'p' || lower === 'q' || lower === 'r') {
      out.push({ t: lower, at: i });
      i++;
      continue;
    }
    if (ch === 'T' || ch === '1') {
      out.push({ t: 'T', at: i });
      i++;
      continue;
    }
    if (ch === 'F' || ch === '0') {
      out.push({ t: 'F', at: i });
      i++;
      continue;
    }
    return { error: `알 수 없는 글자 "${ch}"`, at: i };
  }
  return out;
}

/** Precedence, loosest first: ↔, →, ⊕, ∨, ∧, ¬. → groups to the right. */
export function parse(src: string): Parsed {
  const toks = lex(src);
  if (!Array.isArray(toks)) return { ok: false, ...toks };
  if (!toks.length) return { ok: false, error: '식이 비어 있습니다', at: 0 };
  let i = 0;
  const peek = () => toks[i]?.t;
  const fail = (msg: string): never => {
    throw { error: msg, at: toks[i]?.at ?? src.length };
  };

  const iff = (): Node => {
    let a = imp();
    while (peek() === 'iff') {
      i++;
      a = { k: 'iff', a, b: imp() };
    }
    return a;
  };
  const imp = (): Node => {
    const a = xor();
    if (peek() === 'imp') {
      i++;
      return { k: 'imp', a, b: imp() };
    }
    return a;
  };
  const xor = (): Node => {
    let a = or();
    while (peek() === 'xor') {
      i++;
      a = { k: 'xor', a, b: or() };
    }
    return a;
  };
  const or = (): Node => {
    let a = and();
    while (peek() === 'or') {
      i++;
      a = { k: 'or', a, b: and() };
    }
    return a;
  };
  const and = (): Node => {
    let a = not();
    while (peek() === 'and') {
      i++;
      a = { k: 'and', a, b: not() };
    }
    return a;
  };
  const not = (): Node => {
    if (peek() === 'not') {
      i++;
      return { k: 'not', a: not() };
    }
    return atom();
  };
  const atom = (): Node => {
    const t = peek();
    if (t === undefined) return fail('식이 중간에 끝났습니다');
    if (t === 'p' || t === 'q' || t === 'r') {
      i++;
      return { k: 'var', v: t };
    }
    if (t === 'T' || t === 'F') {
      i++;
      return { k: 'const', v: t === 'T' };
    }
    if (t === '(') {
      i++;
      const n = iff();
      if (peek() !== ')') fail('닫는 괄호 ")"가 없습니다');
      i++;
      return n;
    }
    return fail('여기에 명제(p, q, r)나 "("가 와야 합니다');
  };

  try {
    const node = iff();
    if (i < toks.length) fail('식이 끝나야 할 자리에 글자가 더 있습니다');
    return { ok: true, node };
  } catch (e) {
    const err = e as { error: string; at: number };
    return { ok: false, error: err.error, at: err.at };
  }
}

export type Env = Record<Var, boolean>;

export function evaluate(n: Node, env: Env): boolean {
  switch (n.k) {
    case 'var':
      return env[n.v];
    case 'const':
      return n.v;
    case 'not':
      return !evaluate(n.a, env);
    case 'and':
      return evaluate(n.a, env) && evaluate(n.b, env);
    case 'or':
      return evaluate(n.a, env) || evaluate(n.b, env);
    case 'xor':
      return evaluate(n.a, env) !== evaluate(n.b, env);
    case 'imp':
      return !evaluate(n.a, env) || evaluate(n.b, env);
    case 'iff':
      return evaluate(n.a, env) === evaluate(n.b, env);
  }
}

const OP: Record<string, string> = { and: '∧', or: '∨', imp: '→', iff: '↔', xor: '⊕' };
const PREC: Record<Node['k'], number> = { iff: 1, imp: 2, xor: 3, or: 4, and: 5, not: 6, var: 7, const: 7 };

/** Pretty-print with the usual symbols and only the parentheses that are needed. */
export function show(n: Node): string {
  switch (n.k) {
    case 'var':
      return n.v;
    case 'const':
      return n.v ? '⊤' : '⊥';
    case 'not': {
      const s = show(n.a);
      return '¬' + (PREC[n.a.k] < PREC.not ? `(${s})` : s);
    }
    default: {
      const p = PREC[n.k];
      // → is right-associative: a left operand of the same kind needs parentheses
      const wrapL = PREC[n.a.k] < p || (n.k === 'imp' && n.a.k === 'imp');
      const wrapR = PREC[n.b.k] < p || (n.k !== 'imp' && PREC[n.b.k] === p && n.b.k !== n.k);
      const l = show(n.a);
      const r = show(n.b);
      return `${wrapL ? `(${l})` : l} ${OP[n.k]} ${wrapR ? `(${r})` : r}`;
    }
  }
}

export function varsOf(n: Node, acc = new Set<Var>()): Set<Var> {
  if (n.k === 'var') acc.add(n.v);
  else if (n.k === 'not') varsOf(n.a, acc);
  else if (n.k !== 'const') {
    varsOf(n.a, acc);
    varsOf(n.b, acc);
  }
  return acc;
}

/** Compound subformulas, innermost first, without repeats (by printed form). */
export function subformulas(n: Node): Node[] {
  const out: Node[] = [];
  const seen = new Set<string>();
  const walk = (m: Node) => {
    if (m.k === 'var' || m.k === 'const') return;
    walk(m.a);
    if (m.k !== 'not') walk(m.b);
    const s = show(m);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(m);
    }
  };
  walk(n);
  return out;
}

/** All assignments to the given variables, textbook order: T before F, first variable slowest. */
export function rows(vars: Var[]): Env[] {
  const out: Env[] = [];
  const n = vars.length;
  for (let m = 0; m < 1 << n; m++) {
    const env: Env = { p: false, q: false, r: false };
    vars.forEach((v, j) => {
      env[v] = ((m >> (n - 1 - j)) & 1) === 0;
    });
    out.push(env);
  }
  return out;
}
