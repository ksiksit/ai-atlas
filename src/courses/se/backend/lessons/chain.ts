/**
 * A servlet-style filter chain. Each filter gets the request and a `next` it may call; code before
 * `next` runs on the way in, code after it on the way out, and a filter that does not call `next`
 * ends the request there (a short circuit). run() pushes one request through the filters in the
 * given order, then the controller, then back out, and records every step so a figure can draw the
 * onion. Time is simulated (fixed costs), so the same order always gives the same numbers.
 */

export type FilterId = 'log' | 'timing' | 'cors' | 'auth' | 'errors';

export const FILTERS: Record<FilterId, { name: string; does: string }> = {
  log: { name: 'LoggingFilter', does: '들어온 요청과 나간 상태 코드를 기록' },
  timing: { name: 'TimingFilter', does: '걸린 시간을 X-Response-Time 헤더로' },
  cors: { name: 'CorsFilter', does: '다른 출처의 브라우저에 응답을 허락' },
  auth: { name: 'AuthFilter', does: '로그인하지 않았으면 401로 끊기' },
  errors: { name: 'ErrorHandler', does: '예외를 잡아 JSON 오류 응답으로' },
};

export type RequestKind = 'ok' | 'anon' | 'missing' | 'crash' | 'preflight';

export interface Req {
  method: string;
  path: string;
  /** The front end lives on another origin, so the browser always sends Origin. */
  origin: string;
  loggedIn: boolean;
  preflight: boolean;
}

export const REQUESTS: Record<RequestKind, { label: string; req: Req; what: string }> = {
  ok: { label: '로그인한 사용자', what: '목록 조회가 정상으로 끝남', req: { method: 'GET', path: '/todos', origin: 'https://app.todo.example', loggedIn: true, preflight: false } },
  anon: { label: '로그인 안 함', what: '세션 쿠키가 없음', req: { method: 'GET', path: '/todos', origin: 'https://app.todo.example', loggedIn: false, preflight: false } },
  missing: { label: '없는 할 일', what: '컨트롤러가 TodoNotFoundException을 던짐', req: { method: 'GET', path: '/todos/99', origin: 'https://app.todo.example', loggedIn: true, preflight: false } },
  crash: { label: '처리기에서 예외', what: '컨트롤러 안의 버그로 NullPointerException', req: { method: 'GET', path: '/todos/7/share', origin: 'https://app.todo.example', loggedIn: true, preflight: false } },
  preflight: { label: 'CORS 사전 요청', what: '브라우저가 DELETE를 보내도 되는지 먼저 묻는 OPTIONS (쿠키 없음)', req: { method: 'OPTIONS', path: '/todos/7', origin: 'https://app.todo.example', loggedIn: false, preflight: true } },
};

export interface Res {
  status: number;
  headers: Record<string, string>;
  type: 'json' | 'html' | 'none';
  body: string;
}

export interface Thrown {
  exception: string;
  message: string;
}

export type Tone = 'in' | 'out' | 'stop' | 'skip' | 'catch' | 'throw';

export interface Line {
  step: number;
  text: string;
  tone: Tone;
  t: number;
}

/** One layer of the onion: a filter, or the controller in the middle. */
export interface Frame {
  id: FilterId | 'controller';
  name: string;
  reached: boolean;
  enter: Line | null;
  exit: Line | null;
}

export interface Run {
  frames: Frame[];
  response: Res;
  /** What the logging filter wrote, in order. */
  log: string[];
  /** The exception that escaped every filter and reached the servlet container, if any. */
  escaped: Thrown | null;
  /** Whether the browser hands the response to the page's JavaScript (CORS). */
  readable: boolean;
  ms: number;
}

const COST: Record<FilterId | 'controller', number> = { log: 1, timing: 0, cors: 0, auth: 2, errors: 0, controller: 14 };

type Out = { res: Res } | { thrown: Thrown };

const jsonRes = (status: number, body: unknown, headers: Record<string, string> = {}): Res => ({ status, headers, type: 'json', body: JSON.stringify(body) });

export function run(order: FilterId[], kind: RequestKind): Run {
  const req = REQUESTS[kind].req;
  const frames: Frame[] = [...order.map((id) => ({ id, name: FILTERS[id].name, reached: false, enter: null, exit: null }) as Frame), { id: 'controller', name: 'TodoController', reached: false, enter: null, exit: null }];
  const log: string[] = [];
  let step = 0;
  let t = 0;
  const line = (text: string, tone: Tone): Line => ({ step: ++step, text, tone, t });

  function call(i: number): Out {
    const f = frames[i];
    f.reached = true;
    t += COST[f.id];

    if (f.id === 'controller') {
      if (kind === 'missing') {
        f.enter = line('getTodo(99) → TodoNotFoundException 던짐', 'throw');
        return { thrown: { exception: 'TodoNotFoundException', message: '할 일 99번이 없습니다' } };
      }
      if (kind === 'crash') {
        f.enter = line('shareTodo(7) → NullPointerException 던짐', 'throw');
        return { thrown: { exception: 'NullPointerException', message: 'Cannot invoke "User.email()" because "owner" is null' } };
      }
      if (req.method === 'OPTIONS') {
        f.enter = line('CORS 설정 없음: 허락 헤더 없이 200', 'stop');
        return { res: { status: 200, headers: { Allow: 'GET, PUT, DELETE' }, type: 'none', body: '' } };
      }
      f.enter = line('listTodos() 실행 → 200, 할 일 3개', 'stop');
      return { res: jsonRes(200, [{ id: 7, title: '장보기' }, { id: 42, title: '보고서 쓰기' }, { id: 43, title: '운동' }]) };
    }

    const down = () => call(i + 1);
    const passUp = (o: Out, what: string): Out => {
      f.exit = line(what, 'skip');
      return o;
    };

    switch (f.id) {
      case 'log': {
        f.enter = line(`→ ${req.method} ${req.path} 기록`, 'in');
        log.push(`→ ${req.method} ${req.path}`);
        const o = down();
        if ('thrown' in o) return passUp(o, `${o.thrown.exception}이(가) 지나감: 뒷부분을 건너뛰어 상태를 기록하지 못함`);
        f.exit = line(`← ${o.res.status} 기록`, 'out');
        log.push(`← ${req.method} ${req.path} ${o.res.status}`);
        return o;
      }
      case 'timing': {
        const start = t;
        f.enter = line(`시작 시각 ${start} ms 적어 둠`, 'in');
        const o = down();
        if ('thrown' in o) return passUp(o, `${o.thrown.exception}이(가) 지나감: 시간 헤더를 못 붙임`);
        o.res.headers['X-Response-Time'] = `${t - start}ms`;
        f.exit = line(`X-Response-Time: ${t - start}ms 붙임`, 'out');
        return o;
      }
      case 'cors': {
        if (req.preflight) {
          f.enter = line('사전 요청: 허락 헤더를 담아 204로 바로 응답', 'stop');
          return {
            res: {
              status: 204,
              headers: { 'Access-Control-Allow-Origin': req.origin, 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE', 'Access-Control-Allow-Credentials': 'true' },
              type: 'none',
              body: '',
            },
          };
        }
        f.enter = line('출처 확인, 다음으로', 'in');
        const o = down();
        if ('thrown' in o) return passUp(o, `${o.thrown.exception}이(가) 지나감: 허락 헤더를 못 붙임`);
        o.res.headers['Access-Control-Allow-Origin'] = req.origin;
        f.exit = line('Access-Control-Allow-Origin 붙임', 'out');
        return o;
      }
      case 'auth': {
        if (!req.loggedIn) {
          f.enter = line(req.preflight ? '쿠키 없음 (사전 요청은 쿠키를 싣지 않음) → 401로 끊음' : '세션 없음 → 401로 끊음', 'stop');
          return { res: jsonRes(401, { error: '로그인이 필요합니다' }) };
        }
        f.enter = line('세션 확인: 사용자 mina', 'in');
        const o = down();
        if ('thrown' in o) return passUp(o, `${o.thrown.exception}이(가) 지나감`);
        f.exit = line('할 일 없음, 그대로 돌려보냄', 'out');
        return o;
      }
      case 'errors': {
        f.enter = line('try { 다음으로 }', 'in');
        const o = down();
        if ('thrown' in o) {
          if (o.thrown.exception === 'TodoNotFoundException') {
            f.exit = line(`catch ${o.thrown.exception} → 404 JSON`, 'catch');
            return { res: jsonRes(404, { error: 'not_found', message: o.thrown.message }) };
          }
          f.exit = line(`catch ${o.thrown.exception} → 500 JSON`, 'catch');
          return { res: jsonRes(500, { error: 'internal', message: '잠시 후 다시 시도해 주세요', traceId: 'a1f3' }) };
        }
        f.exit = line('예외 없음, 그대로 돌려보냄', 'out');
        return o;
      }
    }
  }

  const o = call(0);
  let response: Res;
  let escaped: Thrown | null = null;
  if ('thrown' in o) {
    escaped = o.thrown;
    response = {
      status: 500,
      headers: {},
      type: 'html',
      body: `<h1>HTTP Status 500 – Internal Server Error</h1><p>${o.thrown.exception}: ${o.thrown.message}</p>`,
    };
  } else {
    response = o.res;
  }
  const readable = !!response.headers['Access-Control-Allow-Origin'];
  return { frames, response, log, escaped, readable, ms: t };
}

/** The order most servers end up with: record everything, let CORS answer before auth, catch innermost. */
export const GOOD_ORDER: FilterId[] = ['log', 'timing', 'cors', 'auth', 'errors'];
export const START_ORDER: FilterId[] = ['errors', 'log', 'timing', 'auth', 'cors'];

/** Moves one filter up (-1) or down (+1). */
export function move(order: FilterId[], i: number, dir: -1 | 1): FilterId[] {
  const j = i + dir;
  if (j < 0 || j >= order.length) return order;
  const out = [...order];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** GOOD_ORDER with the error handler placed at `at` (0 = outermost), or removed when at is null. */
export function withErrorsAt(at: number | null): FilterId[] {
  const rest = GOOD_ORDER.filter((f) => f !== 'errors');
  if (at === null) return rest;
  return [...rest.slice(0, at), 'errors', ...rest.slice(at)];
}
