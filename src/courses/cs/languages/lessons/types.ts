/**
 * Types for 꼬마 언어: a checker that needs annotations (figure 1), Hindley–Milner style inference
 * by constraint generation and unification (figure 2), and generic instantiation (figure 3).
 * All three record their work step by step so the figures can replay it.
 */

import { children, type Expr, type Node, type TypeAnn } from './lang';

export type Ty = { k: 'num' } | { k: 'bool' } | { k: 'str' } | { k: 'fn'; params: Ty[]; ret: Ty } | { k: 'var'; id: number; name?: string } | { k: 'arr'; el: Ty };

export const NUM: Ty = { k: 'num' };
export const BOOL: Ty = { k: 'bool' };
export const STR: Ty = { k: 'str' };
export const fnT = (params: Ty[], ret: Ty): Ty => ({ k: 'fn', params, ret });
export const arrT = (el: Ty): Ty => ({ k: 'arr', el });

export function showTy(t: Ty, names?: Map<number, string>): string {
  switch (t.k) {
    case 'num':
      return 'number';
    case 'bool':
      return 'boolean';
    case 'str':
      return 'string';
    case 'var':
      return names?.get(t.id) ?? t.name ?? `t${t.id}`;
    case 'arr': {
      const s = showTy(t.el, names);
      return t.el.k === 'fn' ? `(${s})[]` : `${s}[]`;
    }
    case 'fn':
      return `(${t.params.map((p) => showTy(p, names)).join(', ')}) => ${showTy(t.ret, names)}`;
  }
}

export function fromAnn(a: TypeAnn): Ty {
  if (a.k === 'base') return a.name === 'number' ? NUM : a.name === 'boolean' ? BOOL : STR;
  return fnT(a.params.map(fromAnn), fromAnn(a.ret));
}

export function sameTy(a: Ty, b: Ty): boolean {
  if (a.k !== b.k) return false;
  if (a.k === 'var' && b.k === 'var') return a.id === b.id;
  if (a.k === 'arr' && b.k === 'arr') return sameTy(a.el, b.el);
  if (a.k === 'fn' && b.k === 'fn') return a.params.length === b.params.length && a.params.every((p, i) => sameTy(p, b.params[i])) && sameTy(a.ret, b.ret);
  return true;
}

const ARITH = new Set(['-', '*', '/', '%']);
const CMP = new Set(['<', '>', '<=', '>=']);
const EQ = new Set(['==', '!=']);
const LOGIC = new Set(['&&', '||']);

/* ─────────────── figure 1: checking with annotations ─────────────── */

export interface CheckStep {
  node: number;
  ty?: Ty;
  rule: string;
  error?: string;
}

export interface CheckRun {
  steps: CheckStep[];
  types: Map<number, Ty>; // final types of the nodes that got one
  ok: boolean;
}

class CheckFail extends Error {}

/** Bottom-up type checking against a starting environment Γ. Stops at the first error. */
export function checkExpr(e: Expr, gamma: Map<string, Ty>): CheckRun {
  const steps: CheckStep[] = [];
  const types = new Map<number, Ty>();
  const give = (n: Node, ty: Ty, rule: string) => {
    types.set(n.id, ty);
    steps.push({ node: n.id, ty, rule });
    return ty;
  };
  const fail = (n: Node, error: string): never => {
    steps.push({ node: n.id, rule: '', error });
    throw new CheckFail();
  };
  const T = (t: Ty) => showTy(t);

  const go = (n: Expr, env: Map<string, Ty>): Ty => {
    switch (n.k) {
      case 'num':
        return give(n, NUM, '숫자 리터럴은 number입니다.');
      case 'str':
        return give(n, STR, '따옴표로 감싼 값은 string입니다.');
      case 'bool':
        return give(n, BOOL, 'true와 false는 boolean입니다.');
      case 'var': {
        const t = env.get(n.name);
        if (!t) return fail(n, `${n.name}은(는) 환경 Γ에 없는 이름입니다.`);
        return give(n, t, `환경 Γ에서 ${n.name}의 타입을 찾았습니다: ${T(t)}.`);
      }
      case 'un': {
        const t = go(n.e, env);
        if (n.op === '!') {
          if (t.k !== 'bool') return fail(n, `!는 boolean에만 쓸 수 있는데 ${T(t)}에 썼습니다.`);
          return give(n, BOOL, '!boolean은 boolean입니다.');
        }
        if (t.k !== 'num') return fail(n, `-는 number에만 쓸 수 있는데 ${T(t)}에 썼습니다.`);
        return give(n, NUM, '-number는 number입니다.');
      }
      case 'bin': {
        const l = go(n.l, env);
        const r = go(n.r, env);
        if (n.op === '+') {
          if (l.k === 'num' && r.k === 'num') return give(n, NUM, 'number + number는 number입니다.');
          if (l.k === 'str' && r.k === 'str') return give(n, STR, 'string + string은 이어 붙인 string입니다.');
          return fail(n, `+의 양쪽은 둘 다 number이거나 둘 다 string이어야 하는데 ${T(l)} + ${T(r)}입니다.`);
        }
        if (ARITH.has(n.op)) {
          if (l.k === 'num' && r.k === 'num') return give(n, NUM, `number ${n.op} number는 number입니다.`);
          return fail(n, `${n.op}의 양쪽은 number여야 하는데 ${T(l)} ${n.op} ${T(r)}입니다.`);
        }
        if (CMP.has(n.op)) {
          if (l.k === 'num' && r.k === 'num') return give(n, BOOL, `number ${n.op} number는 참이나 거짓, 즉 boolean입니다.`);
          return fail(n, `${n.op}로 비교하려면 양쪽이 number여야 하는데 ${T(l)}와(과) ${T(r)}입니다.`);
        }
        if (EQ.has(n.op)) {
          if (sameTy(l, r)) return give(n, BOOL, `같은 타입(${T(l)})끼리 비교한 결과는 boolean입니다.`);
          return fail(n, `${T(l)}와(과) ${T(r)}은(는) 타입이 달라 ${n.op}의 결과가 늘 정해져 있습니다. 실수일 가능성이 큽니다.`);
        }
        if (LOGIC.has(n.op)) {
          if (l.k === 'bool' && r.k === 'bool') return give(n, BOOL, `boolean ${n.op} boolean은 boolean입니다.`);
          return fail(n, `${n.op}의 양쪽은 boolean이어야 하는데 ${T(l)}와(과) ${T(r)}입니다.`);
        }
        return fail(n, `알 수 없는 연산자 ${n.op}`);
      }
      case 'cond': {
        const c = go(n.c, env);
        if (c.k !== 'bool') return fail(n, `조건 자리에는 boolean이 와야 하는데 ${T(c)}이(가) 왔습니다.`);
        const a = go(n.a, env);
        const b = go(n.b, env);
        if (!sameTy(a, b)) return fail(n, `두 갈래의 타입이 다릅니다: ${T(a)}와(과) ${T(b)}. 결과가 어느 쪽일지 실행 전에는 알 수 없습니다.`);
        return give(n, a, `조건이 boolean이고 두 갈래가 모두 ${T(a)}이므로 전체도 ${T(a)}입니다.`);
      }
      case 'fn': {
        const inner = new Map(env);
        const ps: Ty[] = [];
        for (const p of n.params) {
          if (!p.ann) return fail(n, `매개변수 ${p.name}에 타입이 없습니다. (x: number)처럼 적어 주세요. 적지 않아도 되는 추론은 그림 2에서 봅니다.`);
          const t = fromAnn(p.ann);
          inner.set(p.name, t);
          ps.push(t);
        }
        if (n.body.k === 'block') return fail(n, '이 검사기는 { } 몸통을 다루지 않습니다. 화살표 뒤에 식 하나만 써 주세요.');
        const b = go(n.body, inner);
        return give(n, fnT(ps, b), `매개변수가 ${ps.map(T).join(', ') || '없음'}이고 몸통이 ${T(b)}이므로 함수의 타입은 ${T(fnT(ps, b))}입니다.`);
      }
      case 'call': {
        const f = go(n.f, env);
        if (f.k !== 'fn') return fail(n, `${T(f)}은(는) 함수가 아니라서 부를 수 없습니다.`);
        if (f.params.length !== n.args.length) return fail(n, `이 함수는 인자 ${f.params.length}개를 받는데 ${n.args.length}개를 넘겼습니다.`);
        for (let i = 0; i < n.args.length; i++) {
          const a = go(n.args[i], env);
          if (!sameTy(a, f.params[i])) return fail(n.args[i], `${i + 1}번째 인자는 ${T(f.params[i])}이어야 하는데 ${T(a)}을(를) 넘겼습니다.`);
        }
        return give(n, f.ret, `인자 타입이 모두 맞으므로 결과는 함수의 반환 타입 ${T(f.ret)}입니다.`);
      }
    }
  };
  try {
    go(e, gamma);
    return { steps, types, ok: true };
  } catch (x) {
    if (x instanceof CheckFail) return { steps, types, ok: false };
    throw x;
  }
}

/* ─────────────── unification ─────────────── */

export type Subst = Map<number, Ty>;

export function apply(s: Subst, t: Ty): Ty {
  switch (t.k) {
    case 'var': {
      const b = s.get(t.id);
      return b ? apply(s, b) : t;
    }
    case 'fn':
      return fnT(
        t.params.map((p) => apply(s, p)),
        apply(s, t.ret),
      );
    case 'arr':
      return arrT(apply(s, t.el));
    default:
      return t;
  }
}

function occurs(id: number, t: Ty): boolean {
  if (t.k === 'var') return t.id === id;
  if (t.k === 'fn') return t.params.some((p) => occurs(id, p)) || occurs(id, t.ret);
  if (t.k === 'arr') return occurs(id, t.el);
  return false;
}

export interface UnifyResult {
  ok: boolean;
  added: [number, Ty][]; // new bindings, in order
  why: string;
}

/** Unify a and b under s (s is extended in place). */
export function unify(a0: Ty, b0: Ty, s: Subst, names?: Map<number, string>): UnifyResult {
  const added: [number, Ty][] = [];
  const T = (t: Ty) => showTy(apply(s, t), names);
  let decomposed = false;
  const go = (a: Ty, b: Ty): string | null => {
    a = apply(s, a);
    b = apply(s, b);
    if (a.k === 'var' && b.k === 'var' && a.id === b.id) return null;
    if (a.k === 'var' || b.k === 'var') {
      const [v, t] = a.k === 'var' ? [a, b] : [b as Ty & { k: 'var' }, a];
      if (occurs(v.id, t)) return `${showTy(v, names)}을(를) 자기 자신이 들어 있는 ${showTy(t, names)}와(과) 같게 놓을 수 없습니다(무한히 긴 타입이 됩니다).`;
      s.set(v.id, t);
      added.push([v.id, t]);
      return null;
    }
    if (a.k === 'fn' && b.k === 'fn') {
      if (a.params.length !== b.params.length) return `매개변수 개수가 다른 함수 타입 ${showTy(a, names)}와(과) ${showTy(b, names)}은(는) 맞출 수 없습니다.`;
      decomposed = true;
      for (let i = 0; i < a.params.length; i++) {
        const e = go(a.params[i], b.params[i]);
        if (e) return e;
      }
      return go(a.ret, b.ret);
    }
    if (a.k === 'arr' && b.k === 'arr') {
      decomposed = true;
      return go(a.el, b.el);
    }
    if (a.k === b.k) return null;
    return `${showTy(a, names)}와(과) ${showTy(b, names)}은(는) 서로 다른 타입이라 같게 맞출 수 없습니다.`;
  };
  const before = `${T(a0)} = ${T(b0)}`;
  const err = go(a0, b0);
  if (err) return { ok: false, added, why: err };
  let why: string;
  if (!added.length) why = `${before}: 이미 같으므로 새로 알게 된 것이 없습니다.`;
  else why = `${decomposed ? '양쪽이 같은 모양이므로 안쪽끼리 맞춥니다. ' : ''}${added.map(([id, t]) => `${names?.get(id) ?? `t${id}`} := ${showTy(apply(s, t), names)}`).join(', ')}.`;
  return { ok: true, added, why };
}

/* ─────────────── figure 2: inference ─────────────── */

export interface Constraint {
  a: Ty;
  b: Ty;
  node: number; // node that produced it
  why: string;
}

export interface InferStep {
  phase: 'vars' | 'gen' | 'solve' | 'done';
  note: string;
  cur: number; // index of the constraint being solved (-1: none)
  subst: [number, Ty][];
  error?: string;
  newIds?: number[];
}

export interface InferRun {
  nodeVar: Map<number, number>; // node id → its type variable id
  paramVars: { name: string; id: number }[];
  constraints: Constraint[];
  steps: InferStep[];
  ok: boolean;
  result?: string;
  /** substitution after each step, for showing node types */
  substAt: Subst[];
}

export function infer(e: Expr): InferRun {
  let next = 1;
  const nodeVar = new Map<number, number>();
  const paramVars: { name: string; id: number }[] = [];
  const order: Node[] = [];
  const pre = (n: Node) => {
    order.push(n);
    nodeVar.set(n.id, next++);
    for (const c of children(n)) pre(c);
  };
  pre(e);
  const V = (n: Node): Ty => ({ k: 'var', id: nodeVar.get(n.id)! });
  const cs: Constraint[] = [];
  const add = (n: Node, a: Ty, b: Ty, why: string) => cs.push({ a, b, node: n.id, why });
  let genError: string | null = null;

  const gen = (n: Expr, env: Map<string, Ty>) => {
    if (genError) return;
    switch (n.k) {
      case 'num':
        add(n, V(n), NUM, `${n.v}은(는) 숫자`);
        break;
      case 'bool':
        add(n, V(n), BOOL, `${n.v}은(는) 참거짓`);
        break;
      case 'str':
        add(n, V(n), STR, '문자열 리터럴');
        break;
      case 'var': {
        const t = env.get(n.name);
        if (!t) {
          genError = `${n.name}은(는) 어디에서도 정의되지 않은 이름입니다. 이 그림의 식은 매개변수 말고는 이름을 쓸 수 없습니다.`;
          return;
        }
        add(n, V(n), t, `${n.name}은(는) 매개변수 ${n.name}와(과) 같은 타입`);
        break;
      }
      case 'un':
        gen(n.e, env);
        if (n.op === '!') (add(n, V(n.e), BOOL, '!의 피연산자는 boolean'), add(n, V(n), BOOL, '!의 결과는 boolean'));
        else (add(n, V(n.e), NUM, '-의 피연산자는 number'), add(n, V(n), NUM, '-의 결과는 number'));
        break;
      case 'bin': {
        gen(n.l, env);
        gen(n.r, env);
        if (n.op === '+' || ARITH.has(n.op)) {
          add(n, V(n.l), NUM, `${n.op}의 왼쪽은 number`);
          add(n, V(n.r), NUM, `${n.op}의 오른쪽은 number`);
          add(n, V(n), NUM, `${n.op}의 결과는 number`);
        } else if (CMP.has(n.op)) {
          add(n, V(n.l), NUM, `${n.op}의 왼쪽은 number`);
          add(n, V(n.r), NUM, `${n.op}의 오른쪽은 number`);
          add(n, V(n), BOOL, '비교의 결과는 boolean');
        } else if (EQ.has(n.op)) {
          add(n, V(n.l), V(n.r), `${n.op}의 양쪽은 같은 타입`);
          add(n, V(n), BOOL, '비교의 결과는 boolean');
        } else {
          add(n, V(n.l), BOOL, `${n.op}의 왼쪽은 boolean`);
          add(n, V(n.r), BOOL, `${n.op}의 오른쪽은 boolean`);
          add(n, V(n), BOOL, `${n.op}의 결과는 boolean`);
        }
        break;
      }
      case 'cond':
        gen(n.c, env);
        gen(n.a, env);
        gen(n.b, env);
        add(n, V(n.c), BOOL, '조건은 boolean');
        add(n, V(n), V(n.a), '결과는 첫 갈래와 같은 타입');
        add(n, V(n), V(n.b), '결과는 둘째 갈래와 같은 타입');
        break;
      case 'fn': {
        if (n.body.k === 'block') {
          genError = '이 그림은 { } 몸통을 다루지 않습니다. 화살표 뒤에 식 하나만 써 주세요.';
          return;
        }
        const inner = new Map(env);
        const ps: Ty[] = n.params.map((p) => {
          const id = next++;
          paramVars.push({ name: p.name, id });
          const t: Ty = { k: 'var', id };
          inner.set(p.name, p.ann ? fromAnn(p.ann) : t);
          return p.ann ? fromAnn(p.ann) : t;
        });
        gen(n.body, inner);
        add(n, V(n), fnT(ps, V(n.body)), '함수 = (매개변수들) => 몸통');
        break;
      }
      case 'call':
        gen(n.f, env);
        n.args.forEach((a) => gen(a, env));
        add(n, V(n.f), fnT(n.args.map(V), V(n)), '불리는 쪽 = (인자들) => 호출 결과');
        break;
    }
  };
  gen(e, new Map());

  const steps: InferStep[] = [];
  const substAt: Subst[] = [];
  const s: Subst = new Map();
  const push = (st: InferStep) => {
    steps.push(st);
    substAt.push(new Map(s));
  };
  push({ phase: 'vars', note: `모든 노드에 아직 모르는 타입 t1~t${next - 1 - paramVars.length}을, 매개변수마다 새 타입 변수를 하나씩 붙입니다.`, cur: -1, subst: [] });
  if (genError) {
    push({ phase: 'gen', note: genError, cur: -1, subst: [], error: genError });
    return { nodeVar, paramVars, constraints: cs, steps, ok: false, substAt };
  }
  push({ phase: 'gen', note: `노드마다 타입 규칙이 요구하는 등식을 적어 제약 ${cs.length}개를 모읍니다. 아직 아무것도 풀지 않았습니다.`, cur: -1, subst: [] });
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const r = unify(c.a, c.b, s);
    if (!r.ok) {
      push({ phase: 'solve', note: `제약 ${i + 1}: ${r.why}`, cur: i, subst: [...s.entries()], error: r.why, newIds: r.added.map((x) => x[0]) });
      return { nodeVar, paramVars, constraints: cs, steps, ok: false, substAt };
    }
    push({ phase: 'solve', note: `제약 ${i + 1} (${c.why}): ${r.why}`, cur: i, subst: [...s.entries()], newIds: r.added.map((x) => x[0]) });
  }
  const root = apply(s, V(e));
  const names = generalNames(root);
  const free = [...names.values()];
  const result = (free.length ? `<${free.join(', ')}>` : '') + showTy(root, names);
  push({ phase: 'done', note: free.length ? `모든 제약을 풀었습니다. 끝까지 정해지지 않은 타입 변수는 아무 타입이나 될 수 있다는 뜻이므로 ${free.join(', ')}(으)로 이름 붙여 제네릭으로 만듭니다.` : '모든 제약을 풀었습니다. 식 전체의 타입이 정해졌습니다.', cur: -1, subst: [...s.entries()] });
  return { nodeVar, paramVars, constraints: cs, steps, ok: true, result, substAt };
}

/** Name the free type variables of t A, B, C … in order of appearance. */
export function generalNames(t: Ty): Map<number, string> {
  const names = new Map<number, string>();
  const walkT = (x: Ty) => {
    if (x.k === 'var' && !names.has(x.id)) names.set(x.id, String.fromCharCode(65 + names.size));
    if (x.k === 'fn') (x.params.forEach(walkT), walkT(x.ret));
    if (x.k === 'arr') walkT(x.el);
  };
  walkT(t);
  return names;
}

/* ─────────────── figure 3: generic functions ─────────────── */

export interface Generic {
  id: string;
  name: string;
  tparams: string[];
  params: { name: string; ty: Ty }[];
  ret: Ty;
  note: string;
}

const A: Ty = { k: 'var', id: 901, name: 'A' };
const B: Ty = { k: 'var', id: 902, name: 'B' };

export const GENERICS: Generic[] = [
  { id: 'identity', name: 'identity', tparams: ['A'], params: [{ name: 'x', ty: A }], ret: A, note: '받은 값을 그대로 돌려줍니다.' },
  { id: 'first', name: 'first', tparams: ['A'], params: [{ name: 'xs', ty: arrT(A) }], ret: A, note: '배열의 첫 원소를 돌려줍니다.' },
  { id: 'map', name: 'map', tparams: ['A', 'B'], params: [{ name: 'xs', ty: arrT(A) }, { name: 'f', ty: fnT([A], B) }], ret: arrT(B), note: '원소마다 f를 적용한 새 배열을 만듭니다.' },
  { id: 'filter', name: 'filter', tparams: ['A'], params: [{ name: 'xs', ty: arrT(A) }, { name: 'keep', ty: fnT([A], BOOL) }], ret: arrT(A), note: 'keep이 true인 원소만 남깁니다.' },
];

export interface ArgChoice {
  id: string;
  code: string;
  ty: Ty;
}

export const ARGS: ArgChoice[] = [
  { id: 'nums', code: '[3, 1, 4]', ty: arrT(NUM) },
  { id: 'strs', code: '["밥", "국"]', ty: arrT(STR) },
  { id: 'n', code: '42', ty: NUM },
  { id: 's', code: '"안녕"', ty: STR },
  { id: 'dbl', code: '(n: number) => n * 2', ty: fnT([NUM], NUM) },
  { id: 'big', code: '(n: number) => n > 2', ty: fnT([NUM], BOOL) },
  { id: 'len', code: '(s: string) => s.length', ty: fnT([STR], NUM) },
  { id: 'bang', code: '(s: string) => s + "!"', ty: fnT([STR], STR) },
];

export interface InstStep {
  slot: number;
  ok: boolean;
  why: string;
  bound: [string, string][]; // type parameter → type, after this slot
}

export interface InstRun {
  steps: InstStep[];
  ok: boolean;
  ret?: string;
}

/** Match each argument against its parameter, binding A and B along the way. */
export function instantiate(g: Generic, args: ArgChoice[]): InstRun {
  const s: Subst = new Map();
  const names = new Map<number, string>([
    [901, 'A'],
    [902, 'B'],
  ]);
  const steps: InstStep[] = [];
  const bound = () => g.tparams.map((p, i): [string, string] => {
    const id = 901 + i;
    const t = apply(s, { k: 'var', id });
    return [p, t.k === 'var' && t.id === id ? '?' : showTy(t, names)];
  });
  for (let i = 0; i < g.params.length; i++) {
    const p = g.params[i];
    const a = args[i];
    const before = showTy(apply(s, p.ty), names);
    const r = unify(p.ty, a.ty, s, names);
    if (!r.ok) {
      steps.push({ slot: i, ok: false, why: `${p.name}: ${before} 자리에 ${showTy(a.ty)}을(를) 넣을 수 없습니다. ${r.why}`, bound: bound() });
      return { steps, ok: false };
    }
    const learned = r.added.filter(([id]) => id >= 901).map(([id, t]) => `${names.get(id)} = ${showTy(apply(s, t), names)}`);
    steps.push({ slot: i, ok: true, why: `${p.name}: ${before} 자리에 ${showTy(a.ty)}. ${learned.length ? `그러므로 ${learned.join(', ')}.` : '새로 정해지는 타입 매개변수는 없고, 앞에서 정한 것과 맞습니다.'}`, bound: bound() });
  }
  return { steps, ok: true, ret: showTy(apply(s, g.ret), names) };
}

export function showGeneric(g: Generic): string {
  const names = new Map<number, string>([
    [901, 'A'],
    [902, 'B'],
  ]);
  return `${g.name}<${g.tparams.join(', ')}>(${g.params.map((p) => `${p.name}: ${showTy(p.ty, names)}`).join(', ')}): ${showTy(g.ret, names)}`;
}
