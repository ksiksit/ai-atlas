/**
 * A tree-walking interpreter for 꼬마 언어 (see lang.ts), with environments as explicit objects.
 *
 * With `record: true` it also writes down a snapshot at every interesting moment (a name looked up,
 * an operator applied, a call entered or left), so a figure can replay the run: the node being
 * evaluated, every environment with its parent pointer, which environments are still reachable,
 * and the program's output. Only function calls create environments in this language.
 */

import { LangError, parseProgram, type Block, type Expr, type Node, type Program, type Stmt } from './lang';

export interface Env {
  id: number;
  label: string;
  vars: Map<string, Value>;
  parent: Env | null;
}
export interface Closure {
  kind: 'closure';
  fn: Expr & { k: 'fn' };
  env: Env;
  name?: string;
}
export interface Builtin {
  kind: 'builtin';
  name: string;
  call: (args: Value[], it: Interp) => Value;
}
export type Value = number | string | boolean | undefined | Closure | Builtin;

export interface VarSnap {
  name: string;
  text: string;
  /** a function value: the environment it remembers */
  fnEnv?: number;
  changed: boolean;
}
export type EnvState = 'current' | 'stack' | 'kept' | 'dead';
export interface EnvSnap {
  id: number;
  label: string;
  parent: number | null;
  vars: VarSnap[];
  state: EnvState;
}
export interface Lookup {
  name: string;
  path: number[]; // env ids searched, in order
  found: number | null;
}
export interface Step {
  span: [number, number] | null;
  note: string;
  envs: EnvSnap[];
  lookup?: Lookup;
  out: string[];
  depth: number;
  error?: boolean;
}

class ReturnSignal {
  constructor(public value: Value) {}
}

export function isFn(v: Value): v is Closure | Builtin {
  return typeof v === 'object' && v !== null;
}

function fmtNum(n: number): string {
  if (!isFinite(n)) return Number.isNaN(n) ? 'NaN' : n > 0 ? 'Infinity' : '-Infinity';
  return String(Math.round(n * 1e10) / 1e10);
}

/** How a value is written in figures: strings quoted, functions as ƒ. */
export function showValue(v: Value): string {
  if (typeof v === 'number') return fmtNum(v);
  if (typeof v === 'string') return `"${v}"`;
  if (typeof v === 'boolean') return String(v);
  if (v === undefined) return 'undefined';
  if (v.kind === 'builtin') return `ƒ ${v.name} (내장)`;
  return `ƒ ${v.name ?? ''}(${v.fn.params.map((p) => p.name).join(', ')})`;
}

/** How print shows a value: strings without quotes. */
export function printValue(v: Value): string {
  return typeof v === 'string' ? v : showValue(v);
}

const truthy = (v: Value) => !(v === false || v === 0 || v === '' || v === undefined || (typeof v === 'number' && Number.isNaN(v)));

export interface InterpOpts {
  record?: boolean;
  fuel?: number;
  maxSteps?: number;
  maxDepth?: number;
}

export class Interp {
  global: Env;
  envs: Env[] = [];
  out: string[] = [];
  steps: Step[] = [];
  private stack: Env[] = [];
  private nextEnv = 0;
  private fuel: number;
  private record: boolean;
  private maxSteps: number;
  private maxDepth: number;
  truncated = false;
  private prevVars = new Map<string, string>();

  constructor(opts: InterpOpts = {}) {
    this.record = !!opts.record;
    this.fuel = opts.fuel ?? 200000;
    this.maxSteps = opts.maxSteps ?? 700;
    this.maxDepth = opts.maxDepth ?? 300;
    this.global = this.newEnv('전역', null);
    this.global.vars.set('print', {
      kind: 'builtin',
      name: 'print',
      call: (args, it) => {
        it.out = [...it.out, args.map(printValue).join(' ')];
        return undefined;
      },
    });
    this.stack = [this.global];
  }

  setFuel(n: number) {
    this.fuel = n;
  }

  private newEnv(label: string, parent: Env | null): Env {
    const e: Env = { id: this.nextEnv++, label, vars: new Map(), parent };
    this.envs.push(e);
    return e;
  }

  private get env() {
    return this.stack[this.stack.length - 1];
  }

  /* ───── recording ───── */

  private states(): Map<number, EnvState> {
    const st = new Map<number, EnvState>();
    // what the active environments can still reach through function values and parents
    const seen = new Set<number>();
    const todo: Env[] = [...this.stack];
    while (todo.length) {
      const e = todo.pop()!;
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (e.parent) todo.push(e.parent);
      for (const v of e.vars.values()) if (isFn(v) && v.kind === 'closure') todo.push(v.env);
    }
    for (const e of this.envs) st.set(e.id, e === this.env ? 'current' : this.stack.includes(e) ? 'stack' : seen.has(e.id) ? 'kept' : 'dead');
    return st;
  }

  rec(node: Node | null, note: string, lookup?: Lookup, error?: boolean) {
    if (!this.record) return;
    if (this.steps.length >= this.maxSteps) {
      if (!this.truncated) {
        this.truncated = true;
        this.steps.push({ ...this.snap(node, `단계가 ${this.maxSteps}개를 넘어 여기서 기록을 멈춥니다. 프로그램은 계속 실행됩니다.`), error: false });
      }
      return;
    }
    this.steps.push({ ...this.snap(node, note, lookup), error });
  }

  private snap(node: Node | null, note: string, lookup?: Lookup): Step {
    const st = this.states();
    const envs: EnvSnap[] = this.envs.map((e) => ({
      id: e.id,
      label: e.label,
      parent: e.parent ? e.parent.id : null,
      state: st.get(e.id)!,
      vars: [...e.vars.entries()]
        .filter(([, v]) => !(isFn(v) && v.kind === 'builtin'))
        .map(([name, v]) => {
          const text = showValue(v);
          const k = `${e.id}.${name}`;
          const changed = this.prevVars.get(k) !== text;
          this.prevVars.set(k, text);
          return { name, text, fnEnv: isFn(v) && v.kind === 'closure' ? v.env.id : undefined, changed };
        }),
    }));
    return { span: node ? [node.start, node.end] : null, note, envs, lookup, out: this.out, depth: this.stack.length - 1 };
  }

  /* ───── evaluation ───── */

  private tick(n: Node) {
    if (--this.fuel < 0) throw new LangError('너무 오래 실행되어 멈췄습니다. 끝나지 않는 반복이나 재귀가 있는지 확인하세요.', n.start);
  }

  lookup(name: string, n: Node): { env: Env; value: Value; path: number[] } {
    const path: number[] = [];
    for (let e: Env | null = this.env; e; e = e.parent) {
      path.push(e.id);
      if (e.vars.has(name)) return { env: e, value: e.vars.get(name), path };
    }
    this.rec(n, `${name}을(를) 찾았지만 환경을 끝까지(전역까지) 거슬러 올라가도 없습니다.`, { name, path, found: null }, true);
    throw new LangError(`'${name}'라는 이름을 찾을 수 없습니다.`, n.start);
  }

  private label(e: Env) {
    return e === this.global ? '전역' : `E${e.id}`;
  }

  run(prog: Program): Value {
    this.rec(null, '전역 환경 하나로 시작합니다. print는 언어가 미리 넣어 둔 내장 함수라 그림에는 그리지 않습니다.');
    let last: Value = undefined;
    for (const s of prog.body) {
      const r = this.stmt(s);
      if (r instanceof ReturnSignal) throw new LangError('return은 함수 안에서만 쓸 수 있습니다.', s.start);
      last = s.k === 'expr' ? r : undefined;
    }
    this.rec(null, '프로그램이 끝났습니다.');
    return last;
  }

  /** Statements return a ReturnSignal when a return ran; an expression statement returns its value. */
  private stmt(s: Stmt | Block): Value | ReturnSignal {
    this.tick(s);
    switch (s.k) {
      case 'let': {
        const v = this.expr(s.e);
        this.env.vars.set(s.name, v);
        this.rec(s, `${s.name}을(를) 지금 환경(${this.label(this.env)})에 만들고 ${showValue(v)}을(를) 담습니다.`);
        return undefined;
      }
      case 'assign': {
        const v = this.expr(s.e);
        const { env, path } = this.lookup(s.name, s);
        const old = env.vars.get(s.name);
        env.vars.set(s.name, v);
        this.rec(s, `${s.name}을(를) ${path.length > 1 ? `${path.map((p) => this.label(this.envs[p])).join(' → ')} 순서로 찾아 ` : ''}${this.label(env)}에서 바꿉니다: ${showValue(old)} → ${showValue(v)}.`, { name: s.name, path, found: env.id });
        return undefined;
      }
      case 'expr':
        return this.expr(s.e);
      case 'if': {
        const c = this.expr(s.c);
        const t = truthy(c);
        this.rec(s.c, `조건이 ${showValue(c)}이므로 ${t ? '첫 번째 블록' : s.else ? 'else 블록' : '블록을 건너뛰고 다음 문장'}으로 갑니다.`);
        if (t) return this.stmt(s.then);
        if (s.else) return this.stmt(s.else);
        return undefined;
      }
      case 'while': {
        for (;;) {
          const c = this.expr(s.c);
          const t = truthy(c);
          this.rec(s.c, t ? `조건이 ${showValue(c)}: 몸통을 한 번 더 실행합니다.` : `조건이 ${showValue(c)}: 반복을 끝냅니다.`);
          if (!t) return undefined;
          const r = this.stmt(s.body);
          if (r instanceof ReturnSignal) return r;
        }
      }
      case 'return': {
        const v = s.e ? this.expr(s.e) : undefined;
        this.rec(s, `return: ${showValue(v)}을(를) 들고 함수를 끝냅니다.`);
        return new ReturnSignal(v);
      }
      case 'block': {
        for (const x of s.body) {
          const r = this.stmt(x);
          if (r instanceof ReturnSignal) return r;
        }
        return undefined;
      }
    }
  }

  expr(e: Expr): Value {
    this.tick(e);
    switch (e.k) {
      case 'num':
      case 'str':
      case 'bool':
        return e.v;
      case 'var': {
        const { env, value, path } = this.lookup(e.name, e);
        if (!(isFn(value) && value.kind === 'builtin'))
          this.rec(
            e,
            path.length > 1 ? `${e.name} 찾기: ${path.slice(0, -1).map((p) => this.label(this.envs[p])).join(', ')}에는 없어서 부모를 따라가 ${this.label(env)}에서 찾았습니다. 값은 ${showValue(value)}.` : `${e.name} 찾기: 지금 환경 ${this.label(env)}에 있습니다. 값은 ${showValue(value)}.`,
            { name: e.name, path, found: env.id },
          );
        return value;
      }
      case 'un': {
        const v = this.expr(e.e);
        if (e.op === '!') return !truthy(v);
        if (typeof v !== 'number') throw new LangError(`숫자가 아닌 값 ${showValue(v)}에 -를 붙일 수 없습니다.`, e.start);
        return -v;
      }
      case 'bin': {
        if (e.op === '&&' || e.op === '||') {
          const l = this.expr(e.l);
          if (e.op === '&&' ? !truthy(l) : truthy(l)) return l;
          return this.expr(e.r);
        }
        const l = this.expr(e.l);
        const r = this.expr(e.r);
        const v = binop(e.op, l, r, e.start);
        this.rec(e, `${showValue(l)} ${e.op} ${showValue(r)} = ${showValue(v)}`);
        return v;
      }
      case 'cond': {
        const c = this.expr(e.c);
        const t = truthy(c);
        this.rec(e.c, `조건이 ${showValue(c)}이므로 ${t ? "'?' 뒤의 식" : "':' 뒤의 식"}만 계산합니다.`);
        return this.expr(t ? e.a : e.b);
      }
      case 'fn': {
        const c: Closure = { kind: 'closure', fn: e, env: this.env, name: e.name };
        this.rec(e, `함수 값을 만듭니다. 이 함수는 지금 환경 ${this.label(this.env)}을(를) 기억합니다. 나중에 어디서 불리든 이름은 여기서부터 찾습니다.`);
        return c;
      }
      case 'call': {
        const f = this.expr(e.f);
        const args = e.args.map((a) => this.expr(a));
        return this.call(f, args, e);
      }
    }
  }

  call(f: Value, args: Value[], at: Expr): Value {
    if (!isFn(f)) throw new LangError(`${showValue(f)}은(는) 함수가 아니라서 부를 수 없습니다.`, at.start);
    if (f.kind === 'builtin') {
      const v = f.call(args, this);
      this.rec(at, `내장 함수 ${f.name}이(가) ${args.map(printValue).join(' ')}을(를) 출력합니다.`);
      return v;
    }
    if (this.stack.length > this.maxDepth) throw new LangError(`호출이 ${this.maxDepth}단계보다 깊어져 멈췄습니다. 재귀가 끝나는 조건을 확인하세요.`, at.start);
    const name = f.name ?? '익명 함수';
    const env = this.newEnv(`${name}(${args.map(showValue).join(', ')})`, f.env);
    f.fn.params.forEach((p, i) => env.vars.set(p.name, args[i]));
    this.stack.push(env);
    this.rec(at, `${name}을(를) 부릅니다. 새 환경 E${env.id}을(를) 만들어 ${f.fn.params.length ? f.fn.params.map((p, i) => `${p.name} = ${showValue(args[i])}`).join(', ') : '매개변수 없이'} 담고, 부모는 ${name}이(가) 기억하는 ${this.label(f.env)}로 잇습니다.`);
    let v: Value;
    try {
      if (f.fn.body.k === 'block') {
        const r = this.stmt(f.fn.body);
        v = r instanceof ReturnSignal ? r.value : undefined;
      } else v = this.expr(f.fn.body);
    } finally {
      this.stack.pop();
    }
    this.rec(at, `${name}이(가) ${showValue(v)}을(를) 돌려줍니다. 호출이 끝나 E${env.id}을(를) 떠납니다.`);
    return v;
  }
}

export function binop(op: string, l: Value, r: Value, pos: number): Value {
  if (op === '==') return l === r;
  if (op === '!=') return l !== r;
  if (op === '+' && (typeof l === 'string' || typeof r === 'string')) return printValue(l) + printValue(r);
  if (typeof l === 'string' && typeof r === 'string' && (op === '<' || op === '>' || op === '<=' || op === '>=')) return op === '<' ? l < r : op === '>' ? l > r : op === '<=' ? l <= r : l >= r;
  if (typeof l !== 'number' || typeof r !== 'number') throw new LangError(`${showValue(l)} ${op} ${showValue(r)}: ${op}는 숫자끼리만 계산할 수 있습니다.`, pos);
  switch (op) {
    case '+':
      return l + r;
    case '-':
      return l - r;
    case '*':
      return l * r;
    case '/':
      return l / r;
    case '%':
      return l % r;
    case '<':
      return l < r;
    case '>':
      return l > r;
    case '<=':
      return l <= r;
    case '>=':
      return l >= r;
  }
  throw new LangError(`알 수 없는 연산자 ${op}`, pos);
}

export interface TraceRun {
  steps: Step[];
  error: { msg: string; pos: number } | null;
  parseError: { msg: string; pos: number } | null;
}

/** Run a whole program with recording on. */
export function traceProgram(src: string, maxSteps = 700): TraceRun {
  let prog: Program;
  try {
    prog = parseProgram(src);
  } catch (e) {
    if (e instanceof LangError) return { steps: [], error: null, parseError: { msg: e.message, pos: e.pos } };
    throw e;
  }
  const it = new Interp({ record: true, maxSteps, fuel: 20000 });
  try {
    it.run(prog);
    return { steps: it.steps, error: null, parseError: null };
  } catch (e) {
    if (!(e instanceof LangError)) throw e;
    if (!it.steps[it.steps.length - 1]?.error) it.rec({ start: e.pos, end: e.pos + 1 } as unknown as Node, `오류: ${e.message}`, undefined, true);
    else it.steps[it.steps.length - 1].note += ` 오류: ${e.message}`;
    return { steps: it.steps, error: { msg: e.message, pos: e.pos }, parseError: null };
  }
}
