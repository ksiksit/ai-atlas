/**
 * A tiny in-browser to-do API. handle(request, store) is a pure function: it never mutates the
 * store it is given, it returns the response and the store as it is after the request.
 *
 *   GET    /todos[?done=true|false]   list
 *   POST   /todos                     create (server picks the id); honours Idempotency-Key
 *   GET    /todos/{id}                read one (with an ETag)
 *   PUT    /todos/{id}                replace the whole to-do, or create it at that id
 *   PATCH  /todos/{id}                change some fields
 *   DELETE /todos/{id}                remove
 *
 * PUT, PATCH and DELETE honour If-Match (412 when the ETag is stale). Error bodies follow the shape
 * of RFC 9457 problem details. Unknown fields in a request body are ignored.
 */

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export interface Todo {
  id: number;
  title: string;
  done: boolean;
  /** Bumped whenever the representation changes; the ETag is built from it. */
  version: number;
}

export interface Res {
  status: number;
  headers: [string, string][];
  body: unknown;
}

interface Saved {
  fingerprint: string;
  res: Res;
}

export interface Store {
  todos: Todo[];
  nextId: number;
  /** Responses remembered per Idempotency-Key. */
  keys: Record<string, Saved>;
}

export interface Req {
  method: Method;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface Outcome {
  res: Res;
  store: Store;
  /** Did the request change the stored to-dos? */
  changed: boolean;
  /** One sentence, in Korean, on why the server answered this way. */
  why: string;
}

export const REASON: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  404: 'Not Found',
  405: 'Method Not Allowed',
  412: 'Precondition Failed',
  422: 'Unprocessable Content',
};

export const INITIAL: Store = {
  todos: [
    { id: 1, title: 'datefmt 1.3으로 올리기', done: false, version: 1 },
    { id: 2, title: 'API 문서 쓰기', done: true, version: 1 },
    { id: 3, title: '마감일 알림 만들기', done: false, version: 1 },
  ],
  nextId: 4,
  keys: {},
};

export const etag = (t: Todo) => `"v${t.version}"`;
const view = (t: Todo) => ({ id: t.id, title: t.title, done: t.done });

function header(req: Req, name: string): string | undefined {
  const h = req.headers ?? {};
  const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase());
  const v = k === undefined ? undefined : h[k].trim();
  return v ? v : undefined;
}

function problem(status: number, detail: string, extra: [string, string][] = []): Res {
  return {
    status,
    headers: [['Content-Type', 'application/problem+json'], ...extra],
    body: { status, title: REASON[status], detail },
  };
}

const json = (status: number, body: unknown, extra: [string, string][] = []): Res => ({
  status,
  headers: [['Content-Type', 'application/json'], ...extra],
  body,
});

type Parsed = { ok: true; value: Record<string, unknown> } | { ok: false; detail: string };

function parseBody(text: string | undefined): Parsed {
  if (!text || !text.trim()) return { ok: false, detail: '본문이 비어 있습니다. JSON 객체를 보내세요.' };
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { ok: false, detail: '본문이 올바른 JSON이 아닙니다.' };
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return { ok: false, detail: '본문은 JSON 객체({ … })여야 합니다.' };
  return { ok: true, value: v as Record<string, unknown> };
}

function checkTitle(v: unknown): string | null {
  if (typeof v !== 'string') return 'title은 문자열이어야 합니다.';
  if (!v.trim()) return 'title이 비어 있습니다.';
  if (v.length > 100) return 'title은 100자를 넘을 수 없습니다.';
  return null;
}

/** Stable JSON for comparing bodies: keys sorted. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return (
      '{' +
      Object.keys(o)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(o[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(v);
}

const clone = (s: Store): Store => ({
  todos: s.todos.map((t) => ({ ...t })),
  nextId: s.nextId,
  keys: { ...s.keys },
});

export function handle(req: Req, store: Store): Outcome {
  const same = (res: Res, why: string): Outcome => ({
    res,
    store,
    changed: false,
    why,
  });
  const [rawPath, query = ''] = req.path.trim().split('?', 2);
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
  const seg = path.split('/').filter(Boolean);

  if (seg[0] !== 'todos' || seg.length > 2) return same(problem(404, `${path || '/'}라는 자원이 없습니다.`), '이 API에는 /todos와 /todos/{id}만 있습니다.');

  /* ── the collection ── */
  if (seg.length === 1) {
    if (req.method === 'GET') {
      const done = new URLSearchParams(query).get('done');
      if (done !== null && done !== 'true' && done !== 'false') return same(problem(400, 'done은 true나 false여야 합니다.'), '쿼리 값이 잘못되었으니 클라이언트의 잘못(4xx)입니다.');
      const list = store.todos.filter((t) => done === null || t.done === (done === 'true')).map(view);
      return same(json(200, list), done === null ? '목록을 읽기만 했습니다. 저장소는 그대로입니다.' : `done=${done}인 것만 골라 돌려줬습니다.`);
    }
    if (req.method !== 'POST') return same(problem(405, `/todos에는 ${req.method}를 쓸 수 없습니다.`, [['Allow', 'GET, POST']]), '목록 전체를 바꾸거나 지우는 기능은 없습니다. 쓸 수 있는 메서드를 Allow 헤더로 알려 줍니다.');

    const key = header(req, 'Idempotency-Key');
    const p = parseBody(req.body);
    const fingerprint = 'POST /todos ' + (p.ok ? canonical(p.value) : String(req.body));
    if (key && store.keys[key]) {
      const saved = store.keys[key];
      if (saved.fingerprint !== fingerprint) return same(problem(422, '같은 Idempotency-Key를 다른 본문으로 보냈습니다.'), '키는 같은데 내용이 다르면 재시도가 아니라 실수이므로 거절합니다.');
      return same(
        {
          ...saved.res,
          headers: [...saved.res.headers, ['Idempotent-Replayed', 'true']],
        },
        `키 ${key}는 이미 처리했습니다. 새로 만들지 않고 그때의 응답을 다시 보냅니다.`,
      );
    }
    if (!p.ok) return same(problem(400, p.detail), '본문을 읽을 수 없어 아무것도 만들지 않았습니다.');
    const bad = checkTitle(p.value.title) ?? (p.value.done !== undefined && typeof p.value.done !== 'boolean' ? 'done은 true나 false여야 합니다.' : null);
    if (bad) return same(problem(400, bad), '입력 검증에 실패했습니다. 저장소는 그대로입니다.');

    const next = clone(store);
    const t: Todo = {
      id: next.nextId++,
      title: (p.value.title as string).trim(),
      done: p.value.done === true,
      version: 1,
    };
    next.todos.push(t);
    const res = json(201, view(t), [
      ['Location', `/todos/${t.id}`],
      ['ETag', etag(t)],
    ]);
    if (key) next.keys[key] = { fingerprint, res };
    return {
      res,
      store: next,
      changed: true,
      why: `새 할 일을 ${t.id}번으로 만들었습니다. 새 자원의 주소는 Location 헤더에 있습니다.`,
    };
  }

  /* ── one to-do ── */
  if (!/^[1-9]\d{0,8}$/.test(seg[1])) return same(problem(404, `${path}라는 자원이 없습니다.`), '할 일 번호는 1 이상의 정수입니다.');
  const id = Number(seg[1]);
  const idx = store.todos.findIndex((t) => t.id === id);
  const cur = idx >= 0 ? store.todos[idx] : null;
  const ifMatch = header(req, 'If-Match');
  const stale = ifMatch !== undefined && ifMatch !== '*' && (!cur || ifMatch !== etag(cur));
  const staleRes = (): Outcome =>
    same(problem(412, cur ? `If-Match ${ifMatch}가 지금 ETag ${etag(cur)}와 다릅니다.` : `${id}번이 없어 If-Match 조건을 만족할 수 없습니다.`), '그사이 누군가 이 할 일을 바꿨습니다. 덮어쓰지 않고 거절해서, 다시 읽고 판단하게 합니다.');

  switch (req.method) {
    case 'GET':
      if (!cur) return same(problem(404, `${id}번 할 일이 없습니다.`), '없는 자원을 읽으려 했습니다.');
      return same(json(200, view(cur), [['ETag', etag(cur)]]), '하나를 읽었습니다. ETag는 이 표현의 버전 표시입니다.');

    case 'POST':
      return same(problem(405, `/todos/${id}에는 POST를 쓸 수 없습니다.`, [['Allow', 'GET, PUT, PATCH, DELETE']]), '새 할 일은 목록(/todos)에 POST합니다.');

    case 'DELETE': {
      if (!cur) return same(problem(404, `${id}번 할 일이 없습니다.`), '이미 없는 것을 지우려 했습니다. 저장소 상태는 지운 뒤와 같습니다.');
      if (stale) return staleRes();
      const next = clone(store);
      next.todos.splice(idx, 1);
      return {
        res: { status: 204, headers: [], body: null },
        store: next,
        changed: true,
        why: `${id}번을 지웠습니다. 돌려줄 내용이 없으니 204입니다.`,
      };
    }

    case 'PUT':
    case 'PATCH': {
      const p = parseBody(req.body);
      if (!p.ok) return same(problem(400, p.detail), '본문을 읽을 수 없습니다.');
      const b = p.value;
      if (req.method === 'PUT') {
        const missing = ['title', 'done'].filter((k) => b[k] === undefined);
        if (missing.length) return same(problem(400, `PUT은 자원 전체를 보냅니다. ${missing.join(', ')}이(가) 빠졌습니다.`), '일부만 바꾸려면 PATCH를 씁니다.');
      } else if (b.title === undefined && b.done === undefined) {
        return same(problem(400, '바꿀 필드(title, done)가 하나도 없습니다.'), 'PATCH 본문에 아는 필드가 없습니다.');
      }
      const bad = (b.title !== undefined ? checkTitle(b.title) : null) ?? (b.done !== undefined && typeof b.done !== 'boolean' ? 'done은 true나 false여야 합니다.' : null);
      if (bad) return same(problem(400, bad), '입력 검증에 실패했습니다. 저장소는 그대로입니다.');
      if (stale) return staleRes();
      if (!cur) {
        if (req.method === 'PATCH') return same(problem(404, `${id}번 할 일이 없습니다.`), '없는 자원의 일부를 바꿀 수는 없습니다.');
        const next = clone(store);
        const t: Todo = {
          id,
          title: (b.title as string).trim(),
          done: b.done as boolean,
          version: 1,
        };
        next.todos.push(t);
        next.todos.sort((x, y) => x.id - y.id);
        next.nextId = Math.max(next.nextId, id + 1);
        return {
          res: json(201, view(t), [
            ['Location', `/todos/${id}`],
            ['ETag', etag(t)],
          ]),
          store: next,
          changed: true,
          why: `${id}번이 없어서 보낸 내용 그대로 그 주소에 만들었습니다.`,
        };
      }
      const title = b.title !== undefined ? (b.title as string).trim() : cur.title;
      const done = b.done !== undefined ? (b.done as boolean) : cur.done;
      if (title === cur.title && done === cur.done) return same(json(200, view(cur), [['ETag', etag(cur)]]), '이미 그 상태입니다. 바뀐 것이 없어 ETag도 그대로입니다.');
      const next = clone(store);
      const t = { ...cur, title, done, version: cur.version + 1 };
      next.todos[idx] = t;
      return {
        res: json(200, view(t), [['ETag', etag(t)]]),
        store: next,
        changed: true,
        why: req.method === 'PUT' ? `${id}번을 보낸 내용으로 통째로 바꿨습니다.` : `${id}번에서 보낸 필드만 바꿨습니다.`,
      };
    }
  }
}

/* ─────────────── showing requests and responses as text ─────────────── */

export const statusClass = (s: number) => (s < 300 ? 'ok' : s < 500 ? 'client' : 'server');

export function formatResponse(res: Res): string {
  const lines = [`HTTP/1.1 ${res.status} ${REASON[res.status] ?? ''}`, ...res.headers.map(([k, v]) => `${k}: ${v}`)];
  if (res.body !== null) lines.push('', JSON.stringify(res.body, null, 2));
  return lines.join('\n');
}

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** The same request as a curl command against a local server. */
export function toCurl(req: Req, base = 'localhost:8080'): string {
  const parts = ['curl -i' + (req.method === 'GET' ? '' : ` -X ${req.method}`) + ' ' + shq(base + req.path.trim())];
  const hasBody = req.method !== 'GET' && req.method !== 'DELETE' && !!req.body?.trim();
  if (hasBody) parts.push(`-H 'Content-Type: application/json'`);
  for (const [k, v] of Object.entries(req.headers ?? {})) if (v.trim()) parts.push(`-H ${shq(`${k}: ${v.trim()}`)}`);
  if (hasBody) parts.push(`-d ${shq(req.body!.replace(/\s*\n\s*/g, ' ').trim())}`);
  return parts.join(' \\\n  ');
}

/* ─────────────── a lost response and a retry ─────────────── */

export type Strategy = 'post' | 'post-key' | 'post-newkey' | 'put';
export type Lost = 'request' | 'response';

export interface Attempt {
  req: Req;
  /** Did the server see this attempt at all? */
  reached: boolean;
  /** What the server answered (null when the request never arrived). */
  res: Res | null;
  /** Did the answer make it back to the client? */
  delivered: boolean;
  why: string;
  /** How many to-dos the server holds after this attempt. */
  count: number;
}

export const RETRY_BODY = '{"title": "우유 사기"}';

export function requestFor(strategy: Strategy, attempt: number, nextId: number): Req {
  const body = RETRY_BODY;
  switch (strategy) {
    case 'post':
      return { method: 'POST', path: '/todos', body };
    case 'post-key':
      return {
        method: 'POST',
        path: '/todos',
        headers: { 'Idempotency-Key': 'add-7f3a' },
        body,
      };
    case 'post-newkey':
      return {
        method: 'POST',
        path: '/todos',
        headers: { 'Idempotency-Key': `add-7f3a-${attempt + 1}` },
        body,
      };
    case 'put':
      return {
        method: 'PUT',
        path: `/todos/${nextId}`,
        body: '{"title": "우유 사기", "done": false}',
      };
  }
}

/**
 * The client sends one request; the first `losses` attempts are lost on the way (the request,
 * or the response), each followed by a timeout and a retry. The last attempt gets through.
 */
export function retryRun(strategy: Strategy, losses: number, lost: Lost, start: Store = INITIAL): { attempts: Attempt[]; store: Store } {
  let store = start;
  const attempts: Attempt[] = [];
  for (let i = 0; i <= losses; i++) {
    const req = requestFor(strategy, i, start.nextId);
    const failed = i < losses;
    if (failed && lost === 'request') {
      attempts.push({
        req,
        reached: false,
        res: null,
        delivered: false,
        why: '요청이 서버에 닿기 전에 사라졌습니다.',
        count: store.todos.length,
      });
      continue;
    }
    const o = handle(req, store);
    store = o.store;
    attempts.push({
      req,
      reached: true,
      res: o.res,
      delivered: !failed,
      why: o.why,
      count: store.todos.length,
    });
  }
  return { attempts, store };
}

/* ─────────────── changing the response shape: what breaks old clients ─────────────── */

export type ShapeChange = 'add-due' | 'rename-done' | 'id-string' | 'drop-title';

export const SHAPE_CHANGES: { id: ShapeChange; label: string }[] = [
  { id: 'add-due', label: '새 필드 due(마감일) 더하기' },
  { id: 'rename-done', label: 'done을 completed로 이름 바꾸기' },
  { id: 'id-string', label: 'id를 숫자에서 문자열로 바꾸기' },
  { id: 'drop-title', label: 'title 빼기 (name으로 대신)' },
];

export function shapeV1(): Record<string, unknown> {
  return { id: 3, title: '마감일 알림 만들기', done: false };
}

export function applyChanges(changes: ShapeChange[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  const v1 = shapeV1();
  o.id = changes.includes('id-string') ? String(v1.id) : v1.id;
  if (changes.includes('drop-title')) o.name = v1.title;
  else o.title = v1.title;
  if (changes.includes('rename-done')) o.completed = v1.done;
  else o.done = v1.done;
  if (changes.includes('add-due')) o.due = '2026-11-20';
  return o;
}

/** What an old client that expects {id: number, title: string, done: boolean} makes of a response. */
export function readAsOldClient(body: Record<string, unknown>, strict: boolean): string[] {
  const errs: string[] = [];
  const want: [string, string][] = [
    ['id', 'number'],
    ['title', 'string'],
    ['done', 'boolean'],
  ];
  for (const [k, type] of want) {
    if (!(k in body)) errs.push(`${k} 필드가 없습니다`);
    else if (typeof body[k] !== type) errs.push(`${k}가 ${type === 'number' ? '숫자' : type === 'string' ? '문자열' : '참/거짓'}이 아닙니다`);
  }
  if (strict) for (const k of Object.keys(body)) if (!want.some(([w]) => w === k)) errs.push(`모르는 필드 ${k}`);
  return errs;
}
