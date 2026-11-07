/**
 * A tiny HTTP router in the shape of Spring MVC's DispatcherServlet + RequestMappingHandlerMapping.
 * A route is a method, a path pattern and a handler whose parameters say where each argument comes
 * from (a path variable, a query parameter or the JSON body). dispatch() reads a request line,
 * finds every route whose pattern and method match, keeps the most specific one, converts the raw
 * strings into the parameter types and calls the handler on a small fixed to-do store.
 */

export type ParamType = 'long' | 'int' | 'Boolean' | 'String' | 'TodoForm';

export interface Param {
  name: string;
  from: 'path' | 'query' | 'body';
  type: ParamType;
  /** For query parameters: false means the argument may be absent (null). */
  required?: boolean;
  /** For query parameters: the value used when it is absent (Spring's defaultValue). */
  def?: string;
  /** For the body: run bean validation (@Valid) after reading the JSON. */
  valid?: boolean;
}

export interface Route {
  method: string;
  pattern: string;
  handler: string;
  params: Param[];
}

/* ─────────────── patterns ─────────────── */

export type PSeg = { kind: 'lit'; text: string } | { kind: 'var'; name: string } | { kind: 'star' } | { kind: 'rest' };

export function parsePattern(p: string): PSeg[] {
  return p
    .replace(/^\//, '')
    .split('/')
    .map((s): PSeg => {
      if (s === '**') return { kind: 'rest' };
      if (s === '*') return { kind: 'star' };
      const m = /^\{(\w+)\}$/.exec(s);
      if (m) return { kind: 'var', name: m[1] };
      return { kind: 'lit', text: s };
    });
}

export type PathMatch = { ok: true; vars: Record<string, string> } | { ok: false; at: number; why: string };

/** Matches already-split path segments against a pattern. */
export function matchPath(pattern: string, segs: string[]): PathMatch {
  const ps = parsePattern(pattern);
  const vars: Record<string, string> = {};
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (p.kind === 'rest') return { ok: true, vars };
    const s = segs[i];
    if (s === undefined) return { ok: false, at: i, why: `${i + 1}번째 칸이 없음` };
    if (p.kind === 'lit') {
      if (s !== p.text) return { ok: false, at: i, why: `${i + 1}번째 칸 "${s}" ≠ "${p.text}"` };
    } else {
      if (s === '') return { ok: false, at: i, why: `${i + 1}번째 칸이 비어 있음` };
      if (p.kind === 'var') vars[p.name] = s;
    }
  }
  if (segs.length > ps.length) return { ok: false, at: ps.length, why: `칸이 ${segs.length - ps.length}개 남음` };
  return { ok: true, vars };
}

export interface Specificity {
  /** Ends in ** and so can swallow any number of segments. Always loses. */
  catchAll: boolean;
  vars: number;
  stars: number;
  /** Pattern length with each {variable} counted as one character. Longer wins a tie. */
  length: number;
}

/** The keys Spring's PathPattern.SPECIFICITY_COMPARATOR uses, in order. */
export function specificity(pattern: string): Specificity {
  const ps = parsePattern(pattern);
  return {
    catchAll: ps.some((p) => p.kind === 'rest'),
    vars: ps.filter((p) => p.kind === 'var').length,
    stars: ps.filter((p) => p.kind === 'star').length,
    length: pattern.replace(/\{\w+\}/g, '#').length,
  };
}

/** The score Spring compares second: each variable costs 1, each * costs 100. Lower is more specific. */
export const score = (s: Specificity) => s.vars + 100 * s.stars;

/** Negative when `a` is more specific than `b`. */
export function compareSpecificity(a: string, b: string): number {
  const sa = specificity(a);
  const sb = specificity(b);
  if (sa.catchAll !== sb.catchAll) return sa.catchAll ? 1 : -1;
  if (score(sa) !== score(sb)) return score(sa) - score(sb);
  return sb.length - sa.length;
}

/* ─────────────── the request ─────────────── */

export interface Request {
  method: string;
  path: string;
  segs: string[];
  query: Record<string, string>;
}

export function parseRequestLine(line: string): Request | { error: string } {
  const m = /^\s*([A-Za-z]+)\s+(\S+)(?:\s+HTTP\/[\d.]+)?\s*$/.exec(line);
  if (!m) return { error: '요청 줄은 "메서드 경로" 모양이어야 합니다 (예: GET /todos/42)' };
  const method = m[1].toUpperCase();
  const target = m[2];
  if (!target.startsWith('/')) return { error: '경로는 /로 시작해야 합니다' };
  const q = target.indexOf('?');
  const path = q >= 0 ? target.slice(0, q) : target;
  const query: Record<string, string> = {};
  if (q >= 0) {
    for (const part of target.slice(q + 1).split('&')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      const k = decode(eq >= 0 ? part.slice(0, eq) : part);
      const v = decode(eq >= 0 ? part.slice(eq + 1) : '');
      if (!(k in query)) query[k] = v;
    }
  }
  return { method, path, segs: path.slice(1).split('/').map(decode), query };
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

/* ─────────────── converting strings into parameter types ─────────────── */

const TRUE = ['true', 'on', 'yes', '1'];
const FALSE = ['false', 'off', 'no', '0'];

export type Converted = { ok: true; value: unknown; shown: string } | { ok: false; error: string };

export function convert(raw: string, type: ParamType): Converted {
  switch (type) {
    case 'String':
      return { ok: true, value: raw, shown: JSON.stringify(raw) };
    case 'long':
    case 'int': {
      if (!/^-?\d+$/.test(raw)) return { ok: false, error: `"${raw}"을(를) ${type}(정수)로 바꿀 수 없습니다` };
      const n = BigInt(raw);
      const lim = type === 'int' ? 2n ** 31n : 2n ** 63n;
      if (n < -lim || n >= lim) return { ok: false, error: `${raw}은(는) ${type}에 담기에 너무 큽니다` };
      return { ok: true, value: Number(n), shown: type === 'long' ? `${n}L` : `${n}` };
    }
    case 'Boolean': {
      const l = raw.toLowerCase();
      if (l === '') return { ok: true, value: null, shown: 'null' };
      if (TRUE.includes(l)) return { ok: true, value: true, shown: 'true' };
      if (FALSE.includes(l)) return { ok: true, value: false, shown: 'false' };
      return { ok: false, error: `"${raw}"을(를) Boolean으로 바꿀 수 없습니다` };
    }
    case 'TodoForm':
      return { ok: false, error: 'TodoForm은 본문에서만 읽습니다' };
  }
}

export interface TodoForm {
  title: string;
  done: boolean;
}

/** Jackson's part (JSON → TodoForm) and, with `valid`, bean validation's part (@NotBlank title). */
export function readBody(body: string, valid: boolean): { ok: true; form: TodoForm; shown: string } | { ok: false; exception: string; error: string } {
  const unreadable = 'HttpMessageNotReadableException';
  if (body.trim() === '') return { ok: false, exception: unreadable, error: '요청 본문이 필요한데 비어 있습니다' };
  let j: unknown;
  try {
    j = JSON.parse(body);
  } catch {
    return { ok: false, exception: unreadable, error: '본문이 올바른 JSON이 아닙니다' };
  }
  if (typeof j !== 'object' || j === null || Array.isArray(j)) return { ok: false, exception: unreadable, error: '본문은 { … } 모양의 JSON 객체여야 합니다' };
  const o = j as Record<string, unknown>;
  if ('title' in o && o.title !== null && typeof o.title !== 'string') return { ok: false, exception: unreadable, error: 'title에는 문자열이 와야 합니다' };
  if ('done' in o && o.done !== null && typeof o.done !== 'boolean') return { ok: false, exception: unreadable, error: 'done에는 true나 false가 와야 합니다' };
  const form: TodoForm = { title: (o.title as string | null | undefined) ?? '', done: (o.done as boolean | null | undefined) ?? false };
  const shown = `TodoForm(title=${JSON.stringify(form.title)}, done=${form.done})`;
  if (valid && form.title.trim() === '') return { ok: false, exception: 'MethodArgumentNotValidException', error: 'title: 비어 있을 수 없습니다 (@NotBlank)' };
  return { ok: true, form, shown };
}

/* ─────────────── the to-do service's handlers ─────────────── */

export const TODAY = '2026-11-07';

interface Todo {
  id: number;
  title: string;
  done: boolean;
  due: string;
  owner: string;
}

const STORE: Todo[] = [
  { id: 7, title: '장보기', done: false, due: '2026-11-07', owner: 'mina' },
  { id: 42, title: '보고서 쓰기', done: true, due: '2026-11-10', owner: 'joon' },
  { id: 43, title: '운동', done: false, due: '2026-11-07', owner: 'mina' },
];

export const ROUTES: Route[] = [
  {
    method: 'GET',
    pattern: '/todos',
    handler: 'listTodos',
    params: [
      { name: 'done', from: 'query', type: 'Boolean', required: false },
      { name: 'limit', from: 'query', type: 'int', def: '20' },
    ],
  },
  { method: 'GET', pattern: '/todos/today', handler: 'todayTodos', params: [] },
  { method: 'GET', pattern: '/todos/{id}', handler: 'getTodo', params: [{ name: 'id', from: 'path', type: 'long' }] },
  { method: 'POST', pattern: '/todos', handler: 'createTodo', params: [{ name: 'form', from: 'body', type: 'TodoForm', valid: true }] },
  {
    method: 'PUT',
    pattern: '/todos/{id}',
    handler: 'updateTodo',
    params: [
      { name: 'id', from: 'path', type: 'long' },
      { name: 'form', from: 'body', type: 'TodoForm', valid: true },
    ],
  },
  { method: 'DELETE', pattern: '/todos/{id}', handler: 'deleteTodo', params: [{ name: 'id', from: 'path', type: 'long' }] },
  { method: 'PATCH', pattern: '/todos/{id}/done', handler: 'markDone', params: [{ name: 'id', from: 'path', type: 'long' }] },
  { method: 'GET', pattern: '/users/{userId}/todos', handler: 'listByUser', params: [{ name: 'userId', from: 'path', type: 'String' }] },
  { method: 'GET', pattern: '/files/**', handler: 'staticFile', params: [] },
];

const json = (v: unknown) => JSON.stringify(v);

interface Reply {
  status: number;
  body: string;
  headers?: Record<string, string>;
  exception?: string;
}

const notFound = (id: number): Reply => ({ status: 404, body: json({ error: `할 일 ${id}번이 없습니다` }), exception: 'TodoNotFoundException' });

function invoke(handler: string, a: Record<string, unknown>): Reply {
  const find = (id: unknown) => STORE.find((t) => t.id === id);
  switch (handler) {
    case 'listTodos': {
      const list = STORE.filter((t) => a.done === null || a.done === undefined || t.done === a.done).slice(0, Math.max(0, a.limit as number));
      return { status: 200, body: json(list.map((t) => ({ id: t.id, title: t.title, done: t.done }))) };
    }
    case 'todayTodos':
      return { status: 200, body: json(STORE.filter((t) => t.due === TODAY).map((t) => ({ id: t.id, title: t.title }))) };
    case 'getTodo': {
      const t = find(a.id);
      return t ? { status: 200, body: json({ id: t.id, title: t.title, done: t.done, due: t.due }) } : notFound(a.id as number);
    }
    case 'createTodo': {
      const f = a.form as TodoForm;
      return { status: 201, body: json({ id: 44, title: f.title, done: f.done }), headers: { Location: '/todos/44' } };
    }
    case 'updateTodo': {
      const t = find(a.id);
      const f = a.form as TodoForm;
      return t ? { status: 200, body: json({ id: t.id, title: f.title, done: f.done }) } : notFound(a.id as number);
    }
    case 'deleteTodo':
      return find(a.id) ? { status: 204, body: '' } : notFound(a.id as number);
    case 'markDone': {
      const t = find(a.id);
      return t ? { status: 200, body: json({ id: t.id, title: t.title, done: true }) } : notFound(a.id as number);
    }
    case 'listByUser':
      return { status: 200, body: json(STORE.filter((t) => t.owner === a.userId).map((t) => ({ id: t.id, title: t.title }))) };
    case 'staticFile': {
      const rest = String(a.rest ?? '');
      return rest.endsWith('.js') || rest.endsWith('.css') || rest.endsWith('.png') ? { status: 200, body: `(파일 ${rest}의 내용)` } : { status: 404, body: '' };
    }
  }
  return { status: 200, body: json({ handler }) };
}

/* ─────────────── dispatch ─────────────── */

export interface RowEval {
  route: Route;
  path: PathMatch;
  methodOk: boolean;
  /** Matched both path and method. */
  full: boolean;
}

export interface Binding {
  param: Param;
  /** Where the raw text came from, as a short label. */
  source: string;
  raw: string | null;
  shown?: string;
  error?: string;
}

export interface Step {
  text: string;
  tone?: 'good' | 'bad' | 'dim';
}

export interface Dispatch {
  error?: string;
  req: Request | null;
  rows: RowEval[];
  /** Routes that matched path and method, most specific first. */
  ranked: Route[];
  chosen: Route | null;
  bindings: Binding[];
  call: string | null;
  status: number;
  exception?: string;
  headers: Record<string, string>;
  body: string;
  steps: Step[];
}

const REASON: Record<number, string> = { 200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 404: 'Not Found', 405: 'Method Not Allowed' };
export const reason = (s: number) => REASON[s] ?? '';

export function dispatch(routes: Route[], line: string, body: string): Dispatch {
  const steps: Step[] = [];
  const parsed = parseRequestLine(line);
  const empty = { rows: [], ranked: [], chosen: null, bindings: [], call: null, headers: {} };
  if ('error' in parsed) {
    steps.push({ text: `요청 줄을 읽지 못함: ${parsed.error}`, tone: 'bad' });
    return { ...empty, error: parsed.error, req: null, status: 400, body: '', steps };
  }
  const req = parsed;
  const qs = Object.keys(req.query).length ? ' ' + Object.entries(req.query).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ') : '';
  steps.push({ text: `요청 읽기: 메서드 ${req.method}, 경로 ${req.path}${qs ? ',' + qs : ''}` });

  const rows: RowEval[] = routes.map((route) => {
    const path = matchPath(route.pattern, req.segs);
    const methodOk = route.method === req.method;
    return { route, path, methodOk, full: path.ok && methodOk };
  });
  const pathHits = rows.filter((r) => r.path.ok);
  steps.push({ text: `매핑 ${routes.length}개 가운데 경로가 맞는 것 ${pathHits.length}개${pathHits.length ? ': ' + pathHits.map((r) => `${r.route.method} ${r.route.pattern}`).join(', ') : ''}`, tone: pathHits.length ? undefined : 'bad' });

  if (pathHits.length === 0) {
    steps.push({ text: '맞는 핸들러가 없음 → 404', tone: 'bad' });
    return { ...empty, req, rows, status: 404, exception: 'NoResourceFoundException', body: json({ error: 'Not Found', path: req.path }), steps };
  }
  const fullHits = rows.filter((r) => r.full);
  if (fullHits.length === 0) {
    const allow = [...new Set(pathHits.map((r) => r.route.method))];
    steps.push({ text: `경로는 맞지만 ${req.method}를 받는 매핑이 없음 → 405, Allow: ${allow.join(', ')}`, tone: 'bad' });
    return { ...empty, req, rows, status: 405, exception: 'HttpRequestMethodNotSupportedException', headers: { Allow: allow.join(', ') }, body: json({ error: 'Method Not Allowed' }), steps };
  }
  const ranked = fullHits.map((r) => r.route).sort((a, b) => compareSpecificity(a.pattern, b.pattern));
  const chosen = ranked[0];
  steps.push({
    text: ranked.length > 1 ? `메서드까지 맞는 것 ${ranked.length}개 → 가장 구체적인 ${chosen.pattern} 선택` : `메서드까지 맞는 것 ${chosen.method} ${chosen.pattern} 하나 → ${chosen.handler} 선택`,
    tone: 'good',
  });

  const vars = (rows.find((r) => r.route === chosen)!.path as { vars: Record<string, string> }).vars;
  const bindings: Binding[] = [];
  const args: Record<string, unknown> = {};
  let fail: { exception: string; error: string } | null = null;
  for (const p of chosen.params) {
    if (p.from === 'body') {
      const r = readBody(body, !!p.valid);
      const raw = body.trim() === '' ? null : body.trim();
      if (r.ok) {
        args[p.name] = r.form;
        bindings.push({ param: p, source: '본문(JSON)', raw, shown: r.shown });
      } else {
        bindings.push({ param: p, source: '본문(JSON)', raw, error: r.error });
        fail = { exception: r.exception, error: r.error };
        break;
      }
      continue;
    }
    const raw = p.from === 'path' ? vars[p.name] ?? null : p.name in req.query ? req.query[p.name] : null;
    const source = p.from === 'path' ? `경로 {${p.name}}` : `쿼리 ?${p.name}`;
    if (raw === null) {
      if (p.def !== undefined) {
        const c = convert(p.def, p.type);
        args[p.name] = c.ok ? c.value : null;
        bindings.push({ param: p, source, raw: null, shown: c.ok ? `${c.shown} (기본값)` : '' });
        continue;
      }
      if (p.required === false) {
        args[p.name] = null;
        bindings.push({ param: p, source, raw: null, shown: 'null (없어도 됨)' });
        continue;
      }
      const error = `필수 파라미터 ${p.name}이(가) 없습니다`;
      bindings.push({ param: p, source, raw: null, error });
      fail = { exception: 'MissingServletRequestParameterException', error };
      break;
    }
    const c = convert(raw, p.type);
    if (c.ok) {
      args[p.name] = c.value;
      bindings.push({ param: p, source, raw, shown: c.shown });
    } else {
      bindings.push({ param: p, source, raw, error: c.error });
      fail = { exception: 'MethodArgumentTypeMismatchException', error: c.error };
      break;
    }
  }
  if (chosen.params.length) {
    steps.push({
      text: fail ? `인자 만들기 실패: ${fail.error} → 400` : `인자 ${chosen.params.length}개 만들기: ${bindings.map((b) => `${b.param.name}=${b.shown}`).join(', ')}`,
      tone: fail ? 'bad' : undefined,
    });
  } else {
    steps.push({ text: '받을 인자 없음', tone: 'dim' });
  }
  if (fail) {
    return { req, rows, ranked, chosen, bindings, call: null, status: 400, exception: fail.exception, headers: {}, body: json({ error: 'Bad Request', detail: fail.error }), steps };
  }

  const call =
    chosen.handler === 'staticFile'
      ? `resourceHandler.handleRequest(${JSON.stringify(req.path)})`
      : `todoController.${chosen.handler}(${bindings.map((b) => (b.shown ?? '').replace(/ \(.*\)$/, '')).join(', ')})`;
  steps.push({ text: `호출: ${call}` });
  const ri = parsePattern(chosen.pattern).findIndex((p) => p.kind === 'rest');
  if (ri >= 0) args.rest = req.segs.slice(ri).join('/');
  const out = invoke(chosen.handler, args);
  steps.push({
    text: out.exception ? `${out.exception}이(가) 던져짐 → 예외 처리기가 ${out.status}로 바꿈` : `반환값을 JSON으로 바꿔 응답 → ${out.status} ${reason(out.status)}`,
    tone: out.status < 400 ? 'good' : 'bad',
  });
  return { req, rows, ranked, chosen, bindings, call, status: out.status, exception: out.exception, headers: out.headers ?? {}, body: out.body, steps };
}
