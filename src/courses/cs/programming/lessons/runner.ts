/**
 * Runs reader-written code in a throwaway Web Worker (built from a Blob URL), never on the page's
 * own thread. A run that does not finish within the time limit is stopped with worker.terminate(),
 * so an infinite loop cannot freeze the page. console.log lines and test results stream back as
 * they happen, so even a run that times out shows what it printed first.
 */

export interface TestCase {
  args: unknown[];
  expect: unknown;
  note?: string;
}

export interface TestResult {
  got?: string;
  pass: boolean;
  error?: Friendly;
}

export interface Friendly {
  title: string; // a plain Korean explanation
  detail: string; // the original engine message
  line?: number; // 1-based line in the reader's code, when known
}

export type RunStatus = 'idle' | 'running' | 'done' | 'error' | 'timeout';

export interface RunState {
  status: RunStatus;
  logs: string[];
  logsCut: boolean;
  results: (TestResult | null)[];
  error?: Friendly;
  value?: { text: string; type: string }; // expression mode
  ms?: number;
}

export const MAX_LOGS = 200;

// The worker source is a plain string so the bundler cannot rewrite it.
const WORKER_SRC = String.raw`
const MAX_LOGS = ${MAX_LOGS};
function show(v, d) {
  d = d || 0;
  if (typeof v === 'string') return d === 0 ? v : "'" + v + "'";
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (typeof v === 'function') return '[함수 ' + (v.name || '') + ']';
  if (typeof v === 'symbol') return v.toString();
  if (d > 3) return Array.isArray(v) ? '[…]' : '{…}';
  if (Array.isArray(v)) return '[' + v.map(function (x) { return show(x, d + 1); }).join(', ') + ']';
  if (typeof v === 'object') {
    var e = Object.entries(v);
    return e.length ? '{ ' + e.map(function (p) { return p[0] + ': ' + show(p[1], d + 1); }).join(', ') + ' }' : '{}';
  }
  return String(v);
}
function same(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a === b || (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) < 1e-9;
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every(function (x, i) { return same(x, b[i]); });
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    var ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(function (k) { return same(a[k], b[k]); });
  }
  return false;
}
function err(e) {
  var line;
  var m = e && e.stack ? String(e.stack).match(/<anonymous>:(\d+):\d+/) : null;
  if (m) line = Number(m[1]) - 3;
  return { name: e && e.name ? e.name : 'Error', message: e && e.message ? e.message : String(e), line: line };
}
self.onmessage = function (ev) {
  var job = ev.data;
  var n = 0;
  var con = {
    log: function () {
      n++;
      if (n > MAX_LOGS) { if (n === MAX_LOGS + 1) self.postMessage({ type: 'cut' }); return; }
      self.postMessage({ type: 'log', text: Array.prototype.map.call(arguments, function (x) { return show(x); }).join(' ') });
    },
  };
  con.error = con.log; con.info = con.log; con.warn = con.log;
  var t0 = performance.now();
  if (job.expr) {
    var f0;
    try { f0 = new Function('console', '"use strict";\nreturn (' + job.code + '\n);'); }
    catch (e) { self.postMessage({ type: 'error', phase: 'compile', err: err(e) }); return; }
    try {
      var v = f0(con);
      self.postMessage({ type: 'value', text: show(v, 1), vtype: v === null ? 'null' : Array.isArray(v) ? 'object' : typeof v });
    } catch (e) { self.postMessage({ type: 'error', phase: 'run', err: err(e) }); return; }
    self.postMessage({ type: 'done', ms: performance.now() - t0 });
    return;
  }
  var factory;
  var tail = job.fnName ? '\n;return typeof ' + job.fnName + " === 'function' ? " + job.fnName + ' : null;' : '';
  try { factory = new Function('console', '"use strict";\n' + job.code + tail); }
  catch (e) { self.postMessage({ type: 'error', phase: 'compile', err: err(e) }); return; }
  var fn;
  try { fn = factory(con); }
  catch (e) { self.postMessage({ type: 'error', phase: 'run', err: err(e) }); return; }
  if (job.fnName && typeof fn !== 'function') { self.postMessage({ type: 'nofn' }); return; }
  (job.tests || []).forEach(function (t, i) {
    self.postMessage({ type: 'start', i: i });
    try {
      var got = fn.apply(null, structuredClone(t.args));
      self.postMessage({ type: 'test', i: i, got: show(got, 1), pass: same(got, t.expect) });
    } catch (e) {
      self.postMessage({ type: 'test', i: i, pass: false, err: err(e) });
    }
  });
  self.postMessage({ type: 'done', ms: performance.now() - t0 });
};
`;

let blobUrl: string | null = null;
function workerUrl(): string {
  if (!blobUrl) blobUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
  return blobUrl;
}

/** Turn an engine error into a sentence a beginner can act on. */
export function friendly(name: string, message: string, line?: number): Friendly {
  const m = (re: RegExp) => message.match(re);
  let title = '';
  let x: RegExpMatchArray | null;
  if (name === 'SyntaxError') {
    if (m(/Unexpected end of input/)) title = '코드가 중간에 끝났습니다. 여는 괄호 ( { [ 마다 닫는 괄호가 있는지 확인하세요.';
    else if (m(/missing \) after argument list/)) title = '함수 호출을 닫는 괄호 )가 빠졌거나, 인자 사이에 쉼표가 빠졌습니다.';
    else if ((x = m(/Identifier '(.+)' has already been declared/))) title = `'${x[1]}'를 두 번 선언했습니다. 이미 있는 변수에 새 값을 넣을 때는 let이나 const 없이 대입만 하세요.`;
    else if (m(/Invalid or unexpected token/)) title = '읽을 수 없는 글자가 있습니다. 따옴표가 짝이 맞는지, 한글 따옴표(‘ ’ “ ”)를 쓰지 않았는지 확인하세요.';
    else if (m(/Unexpected string/)) title = '문자열 앞에 + 나 쉼표가 빠진 것 같습니다.';
    else if (m(/Unexpected number/)) title = '숫자 앞에 연산자나 쉼표가 빠진 것 같습니다.';
    else if ((x = m(/Unexpected identifier '?([^']*)'?/))) title = `${x[1] ? `'${x[1]}' ` : ''}이름 앞에 연산자, 쉼표, 세미콜론 같은 것이 빠진 것 같습니다.`;
    else if (m(/Unexpected token '?\}'?/)) title = '닫는 중괄호 }가 너무 많거나, 그 앞의 식이 덜 끝났습니다.';
    else if (m(/Unexpected token '?\)'?/)) title = '닫는 괄호 )가 너무 많거나, 괄호 안이 비어 있습니다.';
    else if ((x = m(/Unexpected token '?([^']+)'?/))) title = `여기에 '${x[1]}'가 올 수 없습니다. 바로 앞의 괄호, 쉼표, 연산자를 확인하세요.`;
    else if (m(/Illegal return/)) title = 'return은 함수 안에서만 쓸 수 있습니다.';
    else title = '문법 오류: 코드를 읽을 수 없습니다. 괄호와 따옴표의 짝을 확인하세요.';
  } else if ((x = m(/^(\S+) is not defined/))) title = `'${x[1]}'라는 이름을 찾을 수 없습니다. 오타가 있거나, 선언하지 않았거나, 다른 함수 안에서만 보이는 변수입니다.`;
  else if ((x = m(/Cannot access '(.+)' before initialization/))) title = `'${x[1]}'를 선언하는 줄보다 먼저 사용했습니다.`;
  else if (m(/Assignment to constant variable/)) title = 'const로 선언한 변수에는 다시 대입할 수 없습니다. 값이 바뀌어야 하면 let으로 선언하세요.';
  else if ((x = m(/Cannot read properties of (undefined|null) \(reading '(.+)'\)/))) title = `${x[1]}에서 '${x[2]}'를 읽으려 했습니다. 배열의 범위를 벗어났거나 아직 값이 없는 변수일 수 있습니다.`;
  else if ((x = m(/Cannot set properties of (undefined|null)/))) title = `${x[1]}에 속성을 넣으려 했습니다. 객체가 만들어졌는지 확인하세요.`;
  else if ((x = m(/^(.+) is not a function/))) title = `'${x[1]}'는 함수가 아니라서 ( )로 부를 수 없습니다. 이름이 맞는지 확인하세요.`;
  else if ((x = m(/^(.+) is not iterable/))) title = `'${x[1]}'는 for...of로 훑을 수 있는 값(배열 등)이 아닙니다.`;
  else if (m(/Maximum call stack size exceeded/)) title = '호출 스택이 넘쳤습니다. 재귀 호출이 너무 깊거나, 기저 사례에 닿지 않아 끝없이 자기 자신을 부릅니다.';
  else if (m(/Invalid array length/)) title = '배열 길이가 잘못되었습니다. 음수나 너무 큰 수를 길이로 썼는지 확인하세요.';
  else title = '실행 중에 오류가 났습니다.';
  return { title, detail: `${name}: ${message}`, line: line !== undefined && line > 0 ? line : undefined };
}

export const TIMEOUT_MSG: Friendly = {
  title: '1초 안에 끝나지 않아 실행을 멈췄습니다. 반복문의 조건이 언젠가 거짓이 되는지, 반복할 때마다 변수가 바뀌는지 확인하세요.',
  detail: '시간 제한 1000ms 초과',
};

export interface Job {
  code: string;
  fnName?: string;
  tests?: TestCase[];
  expr?: boolean;
  timeoutMs?: number;
}

/** Start a run. `on` receives the growing state; returns a function that cancels the run. */
export function run(job: Job, on: (s: RunState) => void): () => void {
  const n = job.tests?.length ?? 0;
  let st: RunState = { status: 'running', logs: [], logsCut: false, results: Array(n).fill(null) };
  const emit = (patch: Partial<RunState>) => {
    st = { ...st, ...patch };
    on(st);
  };
  emit({});
  let w: Worker;
  try {
    w = new Worker(workerUrl());
  } catch {
    emit({ status: 'error', error: { title: '이 브라우저에서는 코드를 실행할 수 없습니다 (Web Worker를 쓸 수 없음).', detail: 'Worker unavailable' } });
    return () => {};
  }
  let finished = false;
  const stop = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    w.terminate();
  };
  const timer = setTimeout(() => {
    if (finished) return;
    stop();
    // the test that was running when time ran out failed with a timeout
    const results = st.results.map((r, i) => (r === null && i === current ? { pass: false, error: TIMEOUT_MSG } : r));
    emit({ status: 'timeout', error: TIMEOUT_MSG, results });
  }, job.timeoutMs ?? 1000);
  let current = -1;
  const logs: string[] = [];
  w.onmessage = (ev: MessageEvent) => {
    const d = ev.data;
    if (finished) return;
    if (d.type === 'log') {
      logs.push(d.text);
      emit({ logs: [...logs] });
    } else if (d.type === 'cut') emit({ logsCut: true });
    else if (d.type === 'start') current = d.i;
    else if (d.type === 'test') {
      const results = st.results.slice();
      results[d.i] = { got: d.got, pass: d.pass, error: d.err ? friendly(d.err.name, d.err.message, d.err.line) : undefined };
      emit({ results });
    } else if (d.type === 'value') emit({ value: { text: d.text, type: d.vtype } });
    else if (d.type === 'error') {
      stop();
      emit({ status: 'error', error: friendly(d.err.name, d.err.message, d.phase === 'run' ? d.err.line : undefined) });
    } else if (d.type === 'nofn') {
      stop();
      emit({ status: 'error', error: { title: `'${job.fnName}'라는 함수를 찾을 수 없습니다. function ${job.fnName}(…) { … } 부분의 이름을 바꾸지 마세요.`, detail: 'function not found' } });
    } else if (d.type === 'done') {
      stop();
      emit({ status: 'done', ms: d.ms });
    }
  };
  w.onerror = (ev) => {
    ev.preventDefault();
    stop();
    emit({ status: 'error', error: friendly('Error', ev.message || '알 수 없는 오류') });
  };
  w.postMessage({ code: job.code, fnName: job.fnName, tests: job.tests, expr: job.expr });
  return stop;
}
