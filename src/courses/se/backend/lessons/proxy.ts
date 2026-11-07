/**
 * A tiny AOP runtime. A real target object (TodoService) is wrapped in a real JavaScript Proxy.
 * The proxy's get trap hands out a wrapper for every method; the wrapper finds the aspects whose
 * pointcut matches that method, runs them as a chain of "around" interceptors, and at the end of
 * the chain calls the target method with `this` bound to the raw target — exactly what Spring's
 * JDK and CGLIB proxies do. That last detail is why `this.add()` inside addAll() skips the advice.
 *
 * Everything that happens is written to a Recorder as events, each carrying a snapshot of the
 * call stack, so a figure can step through a call one event at a time.
 */

/* ─────────────── pointcut expressions ─────────────── */

/** A method that advice could be attached to (a join point, in AOP words). */
export interface JoinPoint {
  cls: string;
  method: string;
  /** Java return type, e.g. "long", "void", "List". */
  ret: string;
  /** Java parameter types. */
  params: string[];
  /** Annotation names on the method, without the @ (e.g. "Transactional"). */
  annotations: string[];
}

type PcNode =
  | { k: 'exec'; ret: string; cls: string; method: string; params: string[] | null }
  | { k: 'within'; cls: string }
  | { k: 'anno'; name: string }
  | { k: 'not'; a: PcNode }
  | { k: 'and' | 'or'; a: PcNode; b: PcNode };

export type Pointcut = { ok: true; node: PcNode; text: string } | { ok: false; error: string };

/** Glob with * only, e.g. "add*" or "*Service". */
export function glob(pattern: string, s: string): boolean {
  const re = new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(s);
}

function paramsMatch(pat: string[] | null, params: string[]): boolean {
  if (pat === null) return true; // (..)
  // "..": any number of params; "*": exactly one param of any type
  const go = (i: number, j: number): boolean => {
    if (i === pat.length) return j === params.length;
    if (pat[i] === '..') return go(i + 1, j) || (j < params.length && go(i, j + 1));
    if (j === params.length) return false;
    return glob(pat[i], params[j]) && go(i + 1, j + 1);
  };
  return go(0, 0);
}

/**
 * Parses a subset of AspectJ's pointcut language:
 *   execution(<ret> <Class>.<method>(<params>))   e.g. execution(* TodoService.add*(..))
 *   within(<Class>)   @annotation(<Name>)   and the operators &&, ||, ! and parentheses.
 * Names may use * as a wildcard. Parameters are "..", "*", or type names separated by commas.
 */
export function parsePointcut(text: string): Pointcut {
  const src = text.trim();
  let i = 0;
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const fail = (msg: string): never => {
    throw new Error(msg);
  };
  const word = () => {
    ws();
    const m = /^[A-Za-z_*][\w*.]*/.exec(src.slice(i));
    if (!m) fail(`${i + 1}번째 글자 근처에서 이름이 필요합니다`);
    i += m![0].length;
    return m![0];
  };
  const eat = (s: string) => {
    ws();
    if (!src.startsWith(s, i)) fail(`${i + 1}번째 글자 근처에 '${s}'가 필요합니다`);
    i += s.length;
  };
  const peek = (s: string) => {
    ws();
    return src.startsWith(s, i);
  };

  function primary(): PcNode {
    if (peek('!')) {
      eat('!');
      return { k: 'not', a: primary() };
    }
    if (peek('(')) {
      eat('(');
      const n = or();
      eat(')');
      return n;
    }
    if (peek('@annotation')) {
      eat('@annotation');
      eat('(');
      const name = word().split('.').pop()!;
      eat(')');
      return { k: 'anno', name };
    }
    const kw = word();
    if (kw === 'within') {
      eat('(');
      const cls = word();
      eat(')');
      return { k: 'within', cls };
    }
    if (kw === 'execution') {
      eat('(');
      const ret = word();
      const full = word();
      const dot = full.lastIndexOf('.');
      const cls = dot >= 0 ? full.slice(0, dot) : '*';
      const method = dot >= 0 ? full.slice(dot + 1) : full;
      if (!method) fail('메서드 이름이 비어 있습니다');
      eat('(');
      let params: string[] | null = [];
      ws();
      if (src.startsWith('..', i) && src.slice(i + 2).trimStart().startsWith(')')) {
        i += 2;
        params = null;
      } else if (!peek(')')) {
        for (;;) {
          ws();
          if (src.startsWith('..', i)) {
            i += 2;
            params.push('..');
          } else params.push(word());
          if (peek(',')) eat(',');
          else break;
        }
      }
      eat(')');
      eat(')');
      return { k: 'exec', ret, cls, method, params };
    }
    return fail(`'${kw}'은(는) 이 모형이 모르는 지시자입니다. execution, within, @annotation만 씁니다`);
  }
  function and(): PcNode {
    let a = primary();
    while (peek('&&')) {
      eat('&&');
      a = { k: 'and', a, b: primary() };
    }
    return a;
  }
  function or(): PcNode {
    let a = and();
    while (peek('||')) {
      eat('||');
      a = { k: 'or', a, b: and() };
    }
    return a;
  }

  try {
    if (!src) fail('포인트컷이 비어 있습니다');
    const node = or();
    ws();
    if (i < src.length) fail(`${i + 1}번째 글자부터 읽을 수 없습니다`);
    return { ok: true, node, text: src };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function matches(pc: Pointcut, jp: JoinPoint): boolean {
  if (!pc.ok) return false;
  const ev = (n: PcNode): boolean => {
    switch (n.k) {
      case 'exec':
        return glob(n.ret, jp.ret) && glob(n.cls, jp.cls) && glob(n.method, jp.method) && paramsMatch(n.params, jp.params);
      case 'within':
        return glob(n.cls, jp.cls);
      case 'anno':
        return jp.annotations.includes(n.name);
      case 'not':
        return !ev(n.a);
      case 'and':
        return ev(n.a) && ev(n.b);
      case 'or':
        return ev(n.a) || ev(n.b);
    }
  };
  return ev(pc.node);
}

/** Every method of the small to-do service that a pointcut could pick out. */
export const JOIN_POINTS: JoinPoint[] = [
  { cls: 'TodoController', method: 'create', ret: 'ResponseEntity', params: ['TodoRequest'], annotations: ['PostMapping'] },
  { cls: 'TodoService', method: 'add', ret: 'long', params: ['String'], annotations: ['Transactional'] },
  { cls: 'TodoService', method: 'complete', ret: 'void', params: ['long'], annotations: ['Transactional'] },
  { cls: 'TodoService', method: 'addAll', ret: 'List', params: ['List'], annotations: ['Transactional'] },
  { cls: 'TodoService', method: 'findAll', ret: 'List', params: [], annotations: ['Transactional'] },
  { cls: 'TodoImporter', method: 'importAll', ret: 'int', params: ['List'], annotations: [] },
  { cls: 'JdbcTodoRepository', method: 'save', ret: 'long', params: ['Todo'], annotations: [] },
];

/* ─────────────── recorder: what happened, with the call stack at each moment ─────────────── */

/** Who an event or stack frame belongs to: an aspect id, or one of the fixed roles. */
export type Who = 'caller' | 'proxy' | 'target' | 'db' | 'log' | 'time' | 'tx';

export interface Frame {
  label: string;
  who: Who;
}

export type EvKind = 'call' | 'enter' | 'before' | 'after' | 'return' | 'throw' | 'db' | 'skip';

export interface Ev {
  kind: EvKind;
  who: Who;
  text: string;
  /** Call stack right after this event, outermost first. */
  stack: Frame[];
  /** Database rows right after this event (committed rows plus uncommitted ones inside a transaction). */
  rows: Row[];
  /** True while a transaction is open. */
  inTx: boolean;
}

export interface Row {
  id: number;
  title: string;
  done: boolean;
  /** Written inside a transaction that has not committed yet. */
  pending?: boolean;
}

export class Recorder {
  events: Ev[] = [];
  stack: Frame[] = [];
  constructor(private db: Db) {}
  push(f: Frame) {
    this.stack.push(f);
  }
  pop() {
    this.stack.pop();
  }
  ev(kind: EvKind, who: Who, text: string) {
    this.events.push({ kind, who, text, stack: this.stack.map((f) => ({ ...f })), rows: this.db.view(), inTx: this.db.inTx });
  }
}

/* ─────────────── a database with one table and transactions ─────────────── */

export class Db {
  rows: Row[];
  nextId: number;
  inTx = false;
  private snapshot: { rows: Row[]; nextId: number } | null = null;
  /** Ids written inside the open transaction. */
  private dirty = new Set<number>();
  constructor(rows: Row[]) {
    this.rows = rows.map((r) => ({ ...r }));
    this.nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;
  }
  view(): Row[] {
    return this.rows.map((r) => ({ ...r, pending: this.dirty.has(r.id) || undefined }));
  }
  begin() {
    this.inTx = true;
    this.snapshot = { rows: this.rows.map((r) => ({ ...r })), nextId: this.nextId };
  }
  commit() {
    this.inTx = false;
    this.snapshot = null;
    this.dirty.clear();
  }
  rollback() {
    if (this.snapshot) {
      this.rows = this.snapshot.rows;
      this.nextId = this.snapshot.nextId;
    }
    this.inTx = false;
    this.snapshot = null;
    this.dirty.clear();
  }
  insert(title: string): number {
    const id = this.nextId++;
    this.rows.push({ id, title, done: false });
    if (this.inTx) this.dirty.add(id);
    return id;
  }
  markDone(id: number): boolean {
    const r = this.rows.find((x) => x.id === id);
    if (!r) return false;
    r.done = true;
    if (this.inTx) this.dirty.add(id);
    return true;
  }
}

/** A Java-style exception thrown by the model's methods. */
export class AppError extends Error {
  constructor(
    public type: string,
    msg: string,
  ) {
    super(msg);
  }
}

/* ─────────────── the target: a plain TodoService that knows nothing about aspects ─────────────── */

export type SelfCall = 'this' | 'self';

export interface TodoApi {
  add(title: string): number;
  complete(id: number): void;
  addAll(titles: string[]): number[];
}

const show = (v: unknown): string => (typeof v === 'string' ? `"${v}"` : Array.isArray(v) ? `[${v.map(show).join(', ')}]` : String(v));
const argList = (args: unknown[]) => args.map(show).join(', ');

export class TodoService implements TodoApi {
  /** Set to the proxy when the service is given a reference to itself (self-injection). */
  self: TodoApi | null = null;
  constructor(
    private db: Db,
    private rec: Recorder,
    private selfCall: SelfCall = 'this',
  ) {}

  /** Records entering and leaving a method body; the body itself is plain code. */
  private body<R>(name: string, args: unknown[], f: () => R): R {
    this.rec.push({ label: `TodoService.${name}`, who: 'target' });
    this.rec.ev('enter', 'target', `TodoService.${name}(${argList(args)}) 본문 실행`);
    try {
      const r = f();
      this.rec.pop();
      this.rec.ev('return', 'target', `TodoService.${name} 반환${r === undefined ? '' : ': ' + show(r)}`);
      return r;
    } catch (e) {
      this.rec.pop();
      this.rec.ev('throw', 'target', `TodoService.${name}에서 ${(e as AppError).type} 발생`);
      throw e;
    }
  }

  add(title: string): number {
    return this.body('add', [title], () => {
      if (!title.trim()) throw new AppError('IllegalArgumentException', '제목이 비어 있습니다');
      const id = this.db.insert(title);
      this.rec.ev('db', 'db', `INSERT INTO todo (id, title) VALUES (${id}, '${title}')`);
      return id;
    });
  }

  complete(id: number): void {
    return this.body('complete', [id], () => {
      if (!this.db.markDone(id)) throw new AppError('TodoNotFoundException', `${id}번 할 일이 없습니다`);
      this.rec.ev('db', 'db', `UPDATE todo SET done = true WHERE id = ${id}`);
    });
  }

  addAll(titles: string[]): number[] {
    return this.body('addAll', [titles], () => {
      const ids: number[] = [];
      for (const t of titles) {
        if (this.selfCall === 'self' && this.self) {
          this.rec.ev('call', 'target', `self.add(${show(t)}): 주입받은 프록시를 통해 부름`);
          ids.push(this.self.add(t));
        } else {
          this.rec.ev('skip', 'target', `this.add(${show(t)}): 자기 자신을 직접 부름, 프록시를 거치지 않음`);
          ids.push(this.add(t));
        }
      }
      return ids;
    });
  }
}

/** Another bean that calls the service from outside, through the proxy it was given. */
export class TodoImporter {
  constructor(
    private service: TodoApi,
    private rec: Recorder,
  ) {}
  importAll(titles: string[]): number {
    this.rec.push({ label: 'TodoImporter.importAll', who: 'caller' });
    this.rec.ev('enter', 'caller', `TodoImporter.importAll(${argList([titles])}) 본문 실행`);
    try {
      for (const t of titles) {
        this.rec.ev('call', 'caller', `todoService.add(${show(t)}): 다른 빈에서 프록시를 통해 부름`);
        this.service.add(t);
      }
      this.rec.pop();
      this.rec.ev('return', 'caller', `TodoImporter.importAll 반환: ${titles.length}`);
      return titles.length;
    } catch (e) {
      this.rec.pop();
      this.rec.ev('throw', 'caller', `TodoImporter.importAll에서 ${(e as AppError).type} 전파`);
      throw e;
    }
  }
}

/* ─────────────── aspects: around advice as interceptors ─────────────── */

export interface Invocation {
  method: string;
  args: unknown[];
  /** Runs the next interceptor in the chain, or the target method at the end. */
  proceed(): unknown;
}

export interface Ctx {
  rec: Recorder;
  db: Db;
  /** A fake clock in milliseconds; each database statement takes 3 ms, each method body 1 ms. */
  clock: { now: number };
}

export type AspectId = 'log' | 'time' | 'tx';

export interface Aspect {
  id: AspectId;
  /** Class name the reader sees, e.g. "LoggingAspect". */
  name: string;
  pointcut: Pointcut;
  /** Lower runs further outside, like Spring's @Order. */
  order: number;
  around(inv: Invocation, ctx: Ctx): unknown;
}

const frame = (ctx: Ctx, label: string, who: Who) => ctx.rec.push({ label, who });

export function loggingAspect(pointcut: string, order = 1): Aspect {
  return {
    id: 'log',
    name: 'LoggingAspect',
    pointcut: parsePointcut(pointcut),
    order,
    around(inv, ctx) {
      frame(ctx, 'LoggingAspect.log', 'log');
      ctx.rec.ev('before', 'log', `[로그] → ${inv.method}(${argList(inv.args)}) 시작`);
      try {
        const r = inv.proceed();
        ctx.rec.ev('after', 'log', `[로그] ← ${inv.method} 정상 종료${r === undefined ? '' : ', 반환 ' + show(r)}`);
        return r;
      } catch (e) {
        ctx.rec.ev('after', 'log', `[로그] ✗ ${inv.method}에서 ${(e as AppError).type}: ${(e as AppError).message}`);
        throw e;
      } finally {
        ctx.rec.pop();
      }
    },
  };
}

export function timingAspect(pointcut: string, order = 2): Aspect {
  return {
    id: 'time',
    name: 'TimingAspect',
    pointcut: parsePointcut(pointcut),
    order,
    around(inv, ctx) {
      frame(ctx, 'TimingAspect.time', 'time');
      const t0 = ctx.clock.now;
      ctx.rec.ev('before', 'time', `[시간] ${inv.method} 시작 시각 ${t0} ms 기록`);
      try {
        return inv.proceed();
      } finally {
        ctx.rec.ev('after', 'time', `[시간] ${inv.method} 걸린 시간 ${ctx.clock.now - t0} ms`);
        ctx.rec.pop();
      }
    },
  };
}

/** Like Spring's TransactionInterceptor with propagation REQUIRED: join an open transaction, or start one. */
export function transactionAspect(pointcut: string, order = 3): Aspect {
  return {
    id: 'tx',
    name: 'TransactionInterceptor',
    pointcut: parsePointcut(pointcut),
    order,
    around(inv, ctx) {
      frame(ctx, 'TransactionInterceptor.invoke', 'tx');
      if (ctx.db.inTx) {
        ctx.rec.ev('before', 'tx', `[트랜잭션] 이미 열린 트랜잭션에 참여 (${inv.method})`);
        try {
          return inv.proceed();
        } finally {
          ctx.rec.pop();
        }
      }
      ctx.db.begin();
      ctx.rec.ev('before', 'tx', `[트랜잭션] BEGIN (${inv.method})`);
      try {
        const r = inv.proceed();
        ctx.db.commit();
        ctx.rec.ev('after', 'tx', `[트랜잭션] COMMIT (${inv.method})`);
        return r;
      } catch (e) {
        ctx.db.rollback();
        ctx.rec.ev('after', 'tx', `[트랜잭션] ROLLBACK: ${(e as AppError).type} 때문에 되돌림`);
        throw e;
      } finally {
        ctx.rec.pop();
      }
    },
  };
}

/* ─────────────── the proxy ─────────────── */

/**
 * Wraps `target` in a JavaScript Proxy that applies the aspects whose pointcut matches each method.
 * `jps` describes the target's methods (return type, parameters, annotations) for pointcut matching.
 */
export function createProxy<T extends object>(target: T, cls: string, jps: JoinPoint[], aspects: Aspect[], ctx: Ctx): T {
  const sorted = [...aspects].sort((a, b) => a.order - b.order);
  return new Proxy(target, {
    get(t, prop, receiver) {
      const v = Reflect.get(t, prop, receiver);
      if (typeof v !== 'function' || typeof prop !== 'string') return v;
      const jp = jps.find((j) => j.cls === cls && j.method === prop);
      if (!jp) return v;
      const chain = sorted.filter((a) => matches(a.pointcut, jp));
      return (...args: unknown[]) => {
        ctx.rec.push({ label: `${cls}$$Proxy.${prop}`, who: 'proxy' });
        ctx.rec.ev('call', 'proxy', chain.length ? `프록시가 ${prop}(${argList(args)}) 호출을 가로챔: ${chain.map((a) => a.name).join(' → ')}` : `프록시가 ${prop}(${argList(args)}) 호출을 받음: 맞는 어드바이스 없음, 그대로 전달`);
        let k = 0;
        const inv: Invocation = {
          method: prop,
          args,
          proceed() {
            if (k < chain.length) return chain[k++].around(inv, ctx);
            ctx.clock.now += 1;
            // the end of the chain: call the real method on the raw target, so `this` inside it is not the proxy
            return (v as (...a: unknown[]) => unknown).apply(t, args);
          },
        };
        try {
          return inv.proceed();
        } finally {
          ctx.rec.pop();
        }
      };
    },
  });
}

/* ─────────────── one complete run, as a figure needs it ─────────────── */

export interface RunSpec {
  /** Which aspects are switched on, with their pointcuts. */
  aspects: { id: AspectId; pointcut: string; order?: number }[];
  /** What the caller does. */
  call: { via: 'service'; method: 'add' | 'complete' | 'addAll'; arg: string | number | string[] } | { via: 'importer'; arg: string[] };
  /** How addAll reaches add. */
  selfCall?: SelfCall;
  /** Annotations on TodoService's methods; defaults to JOIN_POINTS. */
  joinPoints?: JoinPoint[];
}

export interface RunResult {
  events: Ev[];
  /** "반환: …" or the exception that reached the caller. */
  outcome: { ok: true; value: string } | { ok: false; type: string; message: string };
  rows: Row[];
  /** How many times each aspect's advice ran, per method name. */
  adviceRuns: Record<AspectId, Record<string, number>>;
}

export const INITIAL_ROWS: Row[] = [{ id: 1, title: '보고서 쓰기', done: false }];

export function run(spec: RunSpec): RunResult {
  const db = new Db(INITIAL_ROWS);
  const rec = new Recorder(db);
  const clock = { now: 0 };
  const ctx: Ctx = { rec, db, clock };
  const make = { log: loggingAspect, time: timingAspect, tx: transactionAspect };
  const adviceRuns: RunResult['adviceRuns'] = { log: {}, time: {}, tx: {} };
  const aspects = spec.aspects.map((a) => {
    const base = make[a.id](a.pointcut, a.order);
    const around = base.around;
    // count each time the advice runs
    base.around = (inv, c) => {
      adviceRuns[a.id][inv.method] = (adviceRuns[a.id][inv.method] ?? 0) + 1;
      return around(inv, c);
    };
    return base;
  });
  // database statements cost time on the fake clock
  const ins = db.insert.bind(db);
  db.insert = (t) => {
    clock.now += 3;
    return ins(t);
  };
  const upd = db.markDone.bind(db);
  db.markDone = (id) => {
    clock.now += 3;
    return upd(id);
  };

  const target = new TodoService(db, rec, spec.selfCall ?? 'this');
  const proxy = createProxy<TodoApi>(target, 'TodoService', spec.joinPoints ?? JOIN_POINTS, aspects, ctx);
  target.self = proxy;

  const c = spec.call;
  const callText = c.via === 'importer' ? `todoImporter.importAll(${show(c.arg)})` : `todoService.${c.method}(${show(c.arg)})`;
  rec.push({ label: 'TodoController.create', who: 'caller' });
  rec.ev('call', 'caller', `호출: ${callText}`);
  let outcome: RunResult['outcome'];
  try {
    let v: unknown;
    if (c.via === 'importer') v = new TodoImporter(proxy, rec).importAll(c.arg);
    else if (c.method === 'add') v = proxy.add(c.arg as string);
    else if (c.method === 'complete') v = proxy.complete(c.arg as number);
    else v = proxy.addAll(c.arg as string[]);
    outcome = { ok: true, value: v === undefined ? '(void)' : show(v) };
    rec.ev('return', 'caller', `호출한 쪽이 결과를 받음: ${outcome.value}`);
  } catch (e) {
    const err = e as AppError;
    outcome = { ok: false, type: err.type, message: err.message };
    rec.ev('throw', 'caller', `호출한 쪽이 예외를 받음: ${err.type}`);
  }
  rec.pop();
  return { events: rec.events, outcome, rows: db.view(), adviceRuns };
}

/** Total advice runs of one aspect for one method name. */
export const runsOf = (r: RunResult, id: AspectId, method: string) => r.adviceRuns[id][method] ?? 0;
