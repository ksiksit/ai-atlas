/**
 * A small compiler for the function-free part of 꼬마 언어: optimisation passes on the AST,
 * code generation for a stack machine, the stack machine itself (recording every step),
 * and a translator to JavaScript source so the browser's own JIT can run the same program.
 */

import { LangError, children, parseProgram, walk, type Block, type Expr, type Node, type Program, type Stmt } from './lang';

/* ─────────────── optimisation ─────────────── */

export interface OptFlags {
  fold: boolean;
  prop: boolean;
  dce: boolean;
}

type Lit = number | boolean | string;
const isLit = (e: Expr): e is Expr & { v: Lit } => e.k === 'num' || e.k === 'bool' || e.k === 'str';

function lit(v: Lit, from: Node): Expr {
  const base = { id: from.id, start: from.start, end: from.end };
  if (typeof v === 'number') return { ...base, k: 'num', v };
  if (typeof v === 'boolean') return { ...base, k: 'bool', v };
  return { ...base, k: 'str', v };
}

function evalBin(op: string, l: Lit, r: Lit): Lit | null {
  if (op === '==') return l === r;
  if (op === '!=') return l !== r;
  if (op === '+' && (typeof l === 'string' || typeof r === 'string')) return String(l) + String(r);
  if (typeof l !== 'number' || typeof r !== 'number') return null;
  switch (op) {
    case '+':
      return l + r;
    case '-':
      return l - r;
    case '*':
      return l * r;
    case '/':
      return r === 0 ? null : l / r;
    case '%':
      return r === 0 ? null : l % r;
    case '<':
      return l < r;
    case '>':
      return l > r;
    case '<=':
      return l <= r;
    case '>=':
      return l >= r;
  }
  return null;
}

/** Names assigned anywhere after their let (those cannot be propagated). */
function reassigned(p: Program): Set<string> {
  const s = new Set<string>();
  walk(p, (n) => {
    if (n.k === 'assign') s.add(n.name);
  });
  return s;
}

function hasEffect(e: Expr): boolean {
  let eff = false;
  walk(e, (n) => {
    if (n.k === 'call') eff = true;
  });
  return eff;
}

export interface OptReport {
  folded: number;
  propagated: number;
  removed: number;
  notes: string[];
}

export function optimize(p: Program, f: OptFlags): { prog: Program; report: OptReport } {
  const report: OptReport = { folded: 0, propagated: 0, removed: 0, notes: [] };
  const mutable = reassigned(p);
  const consts = new Map<string, Lit>();

  const ex = (e: Expr): Expr => {
    switch (e.k) {
      case 'var':
        if (f.prop && consts.has(e.name)) {
          report.propagated++;
          return lit(consts.get(e.name)!, e);
        }
        return e;
      case 'un': {
        const x = ex(e.e);
        if (f.fold && isLit(x)) {
          report.folded++;
          if (e.op === '!') return lit(!x.v, e);
          if (typeof x.v === 'number') return lit(-x.v, e);
        }
        return { ...e, e: x };
      }
      case 'bin': {
        const l = ex(e.l);
        const r = ex(e.r);
        if (f.fold && isLit(l) && isLit(r)) {
          const v = evalBin(e.op, l.v, r.v);
          if (v !== null) {
            report.folded++;
            report.notes.push(`${show(l)} ${e.op} ${show(r)} → ${show(lit(v, e))}`);
            return lit(v, e);
          }
        }
        return { ...e, l, r };
      }
      case 'cond': {
        const c = ex(e.c);
        if (f.dce && isLit(c)) {
          report.removed++;
          return ex(c.v ? e.a : e.b);
        }
        return { ...e, c, a: ex(e.a), b: ex(e.b) };
      }
      case 'call':
        return { ...e, f: ex(e.f), args: e.args.map(ex) };
      default:
        return e;
    }
  };

  const blk = (b: Block): Block => ({ ...b, body: stmts(b.body) });
  const stmts = (list: Stmt[]): Stmt[] => {
    const out: Stmt[] = [];
    for (const s of list) {
      switch (s.k) {
        case 'let': {
          const e = ex(s.e);
          if (f.prop && isLit(e) && !mutable.has(s.name)) consts.set(s.name, e.v);
          else consts.delete(s.name);
          out.push({ ...s, e });
          break;
        }
        case 'assign':
          out.push({ ...s, e: ex(s.e) });
          break;
        case 'expr':
          out.push({ ...s, e: ex(s.e) });
          break;
        case 'if': {
          const c = ex(s.c);
          if (f.dce && isLit(c)) {
            report.removed++;
            report.notes.push(`if (${show(c)}): ${c.v ? 'else 쪽' : '참일 때 쪽'}은 절대 실행되지 않으므로 지웁니다`);
            const keep = c.v ? s.then : s.else;
            if (keep) out.push(...blk(keep).body);
            break;
          }
          out.push({ ...s, c, then: blk(s.then), else: s.else ? blk(s.else) : undefined });
          break;
        }
        case 'while': {
          const c = ex(s.c);
          if (f.dce && isLit(c) && !c.v) {
            report.removed++;
            report.notes.push('while (false): 한 번도 돌지 않으므로 지웁니다');
            break;
          }
          out.push({ ...s, c, body: blk(s.body) });
          break;
        }
        default:
          out.push(s);
      }
    }
    return out;
  };

  let body = stmts(p.body);
  if (f.dce) {
    // a let whose variable is never read again (and whose value has no side effect) is dead
    for (let pass = 0; pass < 4; pass++) {
      const used = new Set<string>();
      for (const s of body) walk(s, (n) => n.k === 'var' && used.add(n.name));
      const before = body.length;
      body = body.filter((s) => {
        if (s.k === 'let' && !used.has(s.name) && !hasEffect(s.e) && !mutable.has(s.name)) {
          report.notes.push(`let ${s.name}: 아무도 읽지 않으므로 지웁니다`);
          return false;
        }
        return true;
      });
      report.removed += before - body.length;
      if (body.length === before) break;
    }
  }
  return { prog: { ...p, body }, report };
}

function show(e: Expr): string {
  if (e.k === 'str') return `"${e.v}"`;
  if (e.k === 'num' || e.k === 'bool') return String(e.v);
  return '…';
}

/* ─────────────── code generation ─────────────── */

export type Op = 'PUSH' | 'LOAD' | 'STORE' | 'ADD' | 'SUB' | 'MUL' | 'DIV' | 'MOD' | 'LT' | 'GT' | 'LE' | 'GE' | 'EQ' | 'NE' | 'NOT' | 'NEG' | 'JMP' | 'JZ' | 'JNZ' | 'PRINT' | 'POP' | 'DUP' | 'HALT';
export interface Instr {
  op: Op;
  arg?: number | string | boolean;
  /** source span this instruction came from */
  span: [number, number];
}

const BIN_OP: Record<string, Op> = { '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD', '<': 'LT', '>': 'GT', '<=': 'LE', '>=': 'GE', '==': 'EQ', '!=': 'NE' };

export const OP_NOTE: Record<Op, string> = {
  PUSH: '값을 스택에 올린다',
  LOAD: '변수 값을 스택에 올린다',
  STORE: '스택 맨 위를 꺼내 변수에 저장',
  ADD: '두 값을 꺼내 더한 값을 올린다',
  SUB: '두 값을 꺼내 뺀 값을 올린다',
  MUL: '두 값을 꺼내 곱한 값을 올린다',
  DIV: '두 값을 꺼내 나눈 값을 올린다',
  MOD: '두 값을 꺼내 나머지를 올린다',
  LT: '두 값을 꺼내 < 비교 결과를 올린다',
  GT: '두 값을 꺼내 > 비교 결과를 올린다',
  LE: '두 값을 꺼내 <= 비교 결과를 올린다',
  GE: '두 값을 꺼내 >= 비교 결과를 올린다',
  EQ: '두 값을 꺼내 같은지 올린다',
  NE: '두 값을 꺼내 다른지 올린다',
  NOT: '꺼내서 참거짓을 뒤집어 올린다',
  NEG: '꺼내서 부호를 바꿔 올린다',
  JMP: '무조건 그 번지로 간다',
  JZ: '꺼낸 값이 거짓이면 그 번지로 간다',
  JNZ: '꺼낸 값이 참이면 그 번지로 간다',
  PRINT: '꺼내서 출력한다',
  POP: '꺼내서 버린다',
  DUP: '맨 위 값을 하나 더 올린다',
  HALT: '프로그램 끝',
};

export class CompileError extends LangError {}

export function codegen(p: Program): Instr[] {
  const code: Instr[] = [];
  const emit = (op: Op, n: Node, arg?: number | string | boolean) => {
    code.push({ op, arg, span: [n.start, n.end] });
    return code.length - 1;
  };
  const patch = (at: number) => {
    code[at].arg = code.length;
  };
  const ex = (e: Expr) => {
    switch (e.k) {
      case 'num':
      case 'bool':
      case 'str':
        emit('PUSH', e, e.v);
        return;
      case 'var':
        emit('LOAD', e, e.name);
        return;
      case 'un':
        ex(e.e);
        emit(e.op === '!' ? 'NOT' : 'NEG', e);
        return;
      case 'bin':
        if (e.op === '&&' || e.op === '||') {
          ex(e.l);
          emit('DUP', e);
          const j = emit(e.op === '&&' ? 'JZ' : 'JNZ', e, 0);
          emit('POP', e);
          ex(e.r);
          patch(j);
          return;
        }
        ex(e.l);
        ex(e.r);
        emit(BIN_OP[e.op], e);
        return;
      case 'cond': {
        ex(e.c);
        const jz = emit('JZ', e, 0);
        ex(e.a);
        const jmp = emit('JMP', e, 0);
        patch(jz);
        ex(e.b);
        patch(jmp);
        return;
      }
      case 'call':
        if (e.f.k === 'var' && e.f.name === 'print' && e.args.length === 1) {
          ex(e.args[0]);
          emit('PRINT', e);
          emit('PUSH', e, 0); // print's value, so an expression statement can POP it
          return;
        }
        throw new CompileError('이 컴파일러는 print(값) 말고는 함수 호출을 다루지 않습니다.', e.start);
      case 'fn':
        throw new CompileError('이 컴파일러는 함수를 다루지 않습니다. 인터프리터 장에서 함수를 봅니다.', e.start);
    }
  };
  const st = (s: Stmt | Block) => {
    switch (s.k) {
      case 'let':
      case 'assign':
        ex(s.e);
        emit('STORE', s, s.name);
        return;
      case 'expr':
        if (s.e.k === 'call' && s.e.f.k === 'var' && s.e.f.name === 'print' && s.e.args.length === 1) {
          ex(s.e.args[0]);
          emit('PRINT', s);
          return;
        }
        ex(s.e);
        emit('POP', s);
        return;
      case 'if': {
        ex(s.c);
        const jz = emit('JZ', s.c, 0);
        st(s.then);
        if (s.else) {
          const jmp = emit('JMP', s, 0);
          patch(jz);
          st(s.else);
          patch(jmp);
        } else patch(jz);
        return;
      }
      case 'while': {
        const top = code.length;
        ex(s.c);
        const jz = emit('JZ', s.c, 0);
        st(s.body);
        emit('JMP', s, top);
        patch(jz);
        return;
      }
      case 'return':
        throw new CompileError('return은 함수 안에서만 씁니다. 이 컴파일러는 함수를 다루지 않습니다.', s.start);
      case 'block':
        s.body.forEach(st);
        return;
    }
  };
  p.body.forEach(st);
  code.push({ op: 'HALT', span: [p.end, p.end] });
  return code;
}

export function showInstr(i: Instr): string {
  if (i.arg === undefined) return i.op;
  return `${i.op} ${typeof i.arg === 'string' && i.op === 'PUSH' ? `"${i.arg}"` : String(i.arg)}`;
}

/* ─────────────── the stack machine ─────────────── */

type V = number | boolean | string;
export interface VmSnap {
  pc: number;
  stack: V[];
  vars: [string, V][];
  out: string[];
  note: string;
  changed?: string;
  error?: string;
}

const fmt = (v: V) => (typeof v === 'number' ? String(Math.round(v * 1e10) / 1e10) : typeof v === 'string' ? `"${v}"` : String(v));
const truth = (v: V) => !(v === false || v === 0 || v === '');

/** Run bytecode, recording up to `maxSnaps` steps; counts every executed instruction. */
export function runVm(code: Instr[], maxSnaps = 400, maxSteps = 200000): { snaps: VmSnap[]; executed: number; out: string[]; error?: string; cut: boolean } {
  const stack: V[] = [];
  const vars = new Map<string, V>();
  let out: string[] = [];
  const snaps: VmSnap[] = [{ pc: 0, stack: [], vars: [], out: [], note: '시작: 스택이 비어 있고 pc(다음에 실행할 번지)는 0입니다.' }];
  let pc = 0;
  let executed = 0;
  const pop = (): V => {
    if (!stack.length) throw new Error('스택이 비었습니다.');
    return stack.pop()!;
  };
  try {
    while (executed < maxSteps) {
      const ins = code[pc];
      if (!ins) throw new Error('코드 밖으로 벗어났습니다.');
      executed++;
      let next = pc + 1;
      let note = '';
      let changed: string | undefined;
      switch (ins.op) {
        case 'PUSH':
          stack.push(ins.arg as V);
          note = `${fmt(ins.arg as V)}을(를) 스택에 올립니다.`;
          break;
        case 'LOAD': {
          const name = ins.arg as string;
          if (!vars.has(name)) throw new Error(`변수 ${name}에 아직 값이 없습니다.`);
          stack.push(vars.get(name)!);
          note = `변수 ${name}의 값 ${fmt(vars.get(name)!)}을(를) 올립니다.`;
          break;
        }
        case 'STORE': {
          const v = pop();
          vars.set(ins.arg as string, v);
          changed = ins.arg as string;
          note = `맨 위 값 ${fmt(v)}을(를) 꺼내 ${ins.arg}에 저장합니다.`;
          break;
        }
        case 'NOT': {
          const v = pop();
          stack.push(!truth(v));
          note = `${fmt(v)}을(를) 뒤집어 ${!truth(v)}.`;
          break;
        }
        case 'NEG': {
          const v = pop();
          if (typeof v !== 'number') throw new Error('숫자가 아닌 값의 부호를 바꿀 수 없습니다.');
          stack.push(-v);
          note = `부호를 바꿔 ${fmt(-v)}.`;
          break;
        }
        case 'JMP':
          next = ins.arg as number;
          note = `${next}번지로 갑니다.`;
          break;
        case 'JZ': {
          const v = pop();
          if (!truth(v)) next = ins.arg as number;
          note = truth(v) ? `${fmt(v)}: 참이므로 그대로 다음 번지로.` : `${fmt(v)}: 거짓이므로 ${next}번지로 건너뜁니다.`;
          break;
        }
        case 'JNZ': {
          const v = pop();
          if (truth(v)) next = ins.arg as number;
          note = truth(v) ? `${fmt(v)}: 참이므로 ${next}번지로 건너뜁니다.` : `${fmt(v)}: 거짓이므로 그대로 다음 번지로.`;
          break;
        }
        case 'DUP':
          stack.push(stack[stack.length - 1]);
          note = '맨 위 값을 하나 더 올립니다.';
          break;
        case 'POP':
          note = `${fmt(pop())}을(를) 꺼내 버립니다.`;
          break;
        case 'PRINT': {
          const v = pop();
          out = [...out, typeof v === 'string' ? v : fmt(v)];
          note = `${fmt(v)}을(를) 꺼내 출력합니다.`;
          break;
        }
        case 'HALT':
          note = '끝.';
          break;
        default: {
          const r = pop();
          const l = pop();
          const v = vmBin(ins.op, l, r);
          stack.push(v);
          note = `${fmt(l)}와(과) ${fmt(r)}을(를) 꺼내 ${ins.op} → ${fmt(v)}을(를) 올립니다.`;
        }
      }
      if (snaps.length < maxSnaps) snaps.push({ pc, stack: [...stack], vars: [...vars.entries()], out, note, changed });
      if (ins.op === 'HALT') return { snaps, executed, out, cut: snaps.length >= maxSnaps };
      pc = next;
    }
    return { snaps, executed, out, cut: true, error: `${maxSteps.toLocaleString('ko-KR')}개 넘게 실행해서 멈췄습니다. 끝나지 않는 반복이 있는지 확인하세요.` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (snaps.length < maxSnaps) snaps.push({ pc, stack: [...stack], vars: [...vars.entries()], out, note: `오류: ${msg}`, error: msg });
    return { snaps, executed, out, error: msg, cut: false };
  }
}

function vmBin(op: Op, l: V, r: V): V {
  if (op === 'EQ') return l === r;
  if (op === 'NE') return l !== r;
  if (op === 'ADD' && (typeof l === 'string' || typeof r === 'string')) return String(l) + String(r);
  if (typeof l !== 'number' || typeof r !== 'number') throw new Error(`숫자가 아닌 값으로 ${op}를 할 수 없습니다.`);
  switch (op) {
    case 'ADD':
      return l + r;
    case 'SUB':
      return l - r;
    case 'MUL':
      return l * r;
    case 'DIV':
      return l / r;
    case 'MOD':
      return l % r;
    case 'LT':
      return l < r;
    case 'GT':
      return l > r;
    case 'LE':
      return l <= r;
    case 'GE':
      return l >= r;
  }
  throw new Error(`알 수 없는 명령어 ${op}`);
}

/* ─────────────── the whole pipeline ─────────────── */

export interface Compiled {
  prog: Program;
  opt: Program;
  report: OptReport;
  code: Instr[];
  plain: Instr[]; // without optimisation, for comparison
}

export function compileSource(src: string, flags: OptFlags): { ok: true; c: Compiled } | { ok: false; msg: string; pos: number } {
  try {
    const prog = parseProgram(src);
    const plain = codegen(prog);
    const { prog: opt, report } = optimize(prog, flags);
    return { ok: true, c: { prog, opt, report, code: codegen(opt), plain } };
  } catch (e) {
    if (e instanceof LangError) return { ok: false, msg: e.message, pos: e.pos };
    throw e;
  }
}

/** Count AST nodes (for the "smaller tree" readout). */
export function countNodes(n: Node): number {
  let c = 0;
  walk(n, () => c++);
  return c;
}

/* ─────────────── translation to JavaScript ─────────────── */

export function toJs(p: Program): string {
  const ex = (e: Expr): string => {
    switch (e.k) {
      case 'num':
        return String(e.v);
      case 'bool':
        return String(e.v);
      case 'str':
        return JSON.stringify(e.v);
      case 'var':
        return `v_${e.name}`;
      case 'un':
        return `(${e.op}${ex(e.e)})`;
      case 'bin':
        return `(${ex(e.l)} ${e.op === '==' ? '===' : e.op === '!=' ? '!==' : e.op} ${ex(e.r)})`;
      case 'cond':
        return `(${ex(e.c)} ? ${ex(e.a)} : ${ex(e.b)})`;
      case 'call':
        if (e.f.k === 'var' && e.f.name === 'print') return `out.push(String(${e.args.map(ex).join(', ')}))`;
        throw new CompileError('print 말고는 호출할 수 없습니다.', e.start);
      case 'fn':
        throw new CompileError('함수는 옮기지 않습니다.', e.start);
    }
  };
  const st = (s: Stmt | Block, ind: string): string => {
    switch (s.k) {
      case 'let':
        return `${ind}let v_${s.name} = ${ex(s.e)};`;
      case 'assign':
        return `${ind}v_${s.name} = ${ex(s.e)};`;
      case 'expr':
        return `${ind}${ex(s.e)};`;
      case 'if':
        return `${ind}if (${ex(s.c)}) {\n${st(s.then, ind + '  ')}\n${ind}}${s.else ? ` else {\n${st(s.else, ind + '  ')}\n${ind}}` : ''}`;
      case 'while':
        return `${ind}while (${ex(s.c)}) {\n${st(s.body, ind + '  ')}\n${ind}}`;
      case 'block':
        return s.body.map((x) => st(x, ind)).join('\n');
      case 'return':
        throw new CompileError('return은 옮기지 않습니다.', s.start);
    }
  };
  return p.body.map((s) => st(s, '')).join('\n');
}

export { children };

/* ─────────────── a faster loop for timing ─────────────── */

/**
 * The same machine without any recording: opcodes become small integers and variable names
 * become slot numbers before the run, as real bytecode interpreters do.
 */
export function fastVm(code: Instr[]): string[] {
  const OPS: Op[] = ['PUSH', 'LOAD', 'STORE', 'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'LT', 'GT', 'LE', 'GE', 'EQ', 'NE', 'NOT', 'NEG', 'JMP', 'JZ', 'JNZ', 'PRINT', 'POP', 'DUP', 'HALT'];
  const slots = new Map<string, number>();
  const ops = new Int32Array(code.length);
  const args: (number | string | boolean)[] = [];
  code.forEach((ins, k) => {
    ops[k] = OPS.indexOf(ins.op);
    if (ins.op === 'LOAD' || ins.op === 'STORE') {
      if (!slots.has(ins.arg as string)) slots.set(ins.arg as string, slots.size);
      args[k] = slots.get(ins.arg as string)!;
    } else args[k] = ins.arg ?? 0;
  });
  const vars: (number | string | boolean)[] = new Array(slots.size).fill(0);
  const st: (number | string | boolean)[] = new Array(256);
  const out: string[] = [];
  let sp = 0;
  let pc = 0;
  for (;;) {
    const a = args[pc];
    switch (ops[pc++]) {
      case 0: st[sp++] = a; break;
      case 1: st[sp++] = vars[a as number]; break;
      case 2: vars[a as number] = st[--sp]; break;
      case 3: { const r = st[--sp]; const l = st[sp - 1]; st[sp - 1] = typeof l === 'number' && typeof r === 'number' ? l + r : String(l) + String(r); break; }
      case 4: { const r = st[--sp] as number; st[sp - 1] = (st[sp - 1] as number) - r; break; }
      case 5: { const r = st[--sp] as number; st[sp - 1] = (st[sp - 1] as number) * r; break; }
      case 6: { const r = st[--sp] as number; st[sp - 1] = (st[sp - 1] as number) / r; break; }
      case 7: { const r = st[--sp] as number; st[sp - 1] = (st[sp - 1] as number) % r; break; }
      case 8: { const r = st[--sp]; st[sp - 1] = st[sp - 1] < r; break; }
      case 9: { const r = st[--sp]; st[sp - 1] = st[sp - 1] > r; break; }
      case 10: { const r = st[--sp]; st[sp - 1] = st[sp - 1] <= r; break; }
      case 11: { const r = st[--sp]; st[sp - 1] = st[sp - 1] >= r; break; }
      case 12: { const r = st[--sp]; st[sp - 1] = st[sp - 1] === r; break; }
      case 13: { const r = st[--sp]; st[sp - 1] = st[sp - 1] !== r; break; }
      case 14: st[sp - 1] = !truth(st[sp - 1]); break;
      case 15: st[sp - 1] = -(st[sp - 1] as number); break;
      case 16: pc = a as number; break;
      case 17: if (!truth(st[--sp])) pc = a as number; break;
      case 18: if (truth(st[--sp])) pc = a as number; break;
      case 19: { const v = st[--sp]; out.push(typeof v === 'string' ? v : fmt(v)); break; }
      case 20: sp--; break;
      case 21: st[sp] = st[sp - 1]; sp++; break;
      default: return out;
    }
  }
}
