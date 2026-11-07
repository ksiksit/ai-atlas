/**
 * A tiny build system: a graph of tasks over source files, a real topological sort,
 * and an incremental builder that decides which tasks to rerun either the way make does
 * (compare modification times) or the way Gradle and Bazel do (compare content hashes),
 * with an optional shared build cache keyed by the hash of a task's declared inputs.
 *
 * Outputs are real strings computed from the inputs, so we can always ask whether a
 * built file actually matches what its sources say it should be (a stale build).
 */

/* ───────── hashing ───────── */

/** 32-bit FNV-1a, shown as 8 hex digits. Real tools use SHA-256; the idea is the same. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/* ───────── graph ───────── */

export type Kind = 'compile' | 'concat';

export interface TaskDef {
  id: string;
  /** The file the task writes, shown in the figure. */
  out: string;
  /** Command line, part of the cache key (a different tool version is a different command). */
  cmd: string;
  /** Node ids: source paths or other task ids. */
  inputs: string[];
  /** Seconds the task takes when it really runs. */
  cost: number;
  kind: Kind;
  /** Environment variables the task really reads while running. */
  reads?: string[];
}

export interface Graph {
  sources: string[];
  tasks: TaskDef[];
}

export const isTask = (g: Graph, id: string) => g.tasks.some((t) => t.id === id);
export const taskOf = (g: Graph, id: string) => g.tasks.find((t) => t.id === id)!;

/** Kahn's algorithm. Ties are broken by declaration order so the order is stable. Throws on a cycle. */
export function topoOrder(g: Graph): string[] {
  const indeg = new Map<string, number>();
  for (const t of g.tasks) indeg.set(t.id, t.inputs.filter((i) => isTask(g, i)).length);
  const out: string[] = [];
  const done = new Set<string>();
  while (out.length < g.tasks.length) {
    const next = g.tasks.find((t) => !done.has(t.id) && indeg.get(t.id) === 0);
    if (!next) throw new Error('cycle in build graph');
    out.push(next.id);
    done.add(next.id);
    for (const t of g.tasks) if (t.inputs.includes(next.id)) indeg.set(t.id, indeg.get(t.id)! - 1);
  }
  return out;
}

/** Longest distance from a source: sources are 0, a task is 1 + the deepest of its inputs. */
export function depths(g: Graph): Map<string, number> {
  const d = new Map<string, number>();
  for (const s of g.sources) d.set(s, 0);
  for (const id of topoOrder(g)) d.set(id, 1 + Math.max(...taskOf(g, id).inputs.map((i) => d.get(i)!)));
  return d;
}

/** Every task that depends on any of `ids`, directly or through other tasks. */
export function downstream(g: Graph, ids: string[]): Set<string> {
  const hit = new Set<string>();
  for (const id of topoOrder(g)) if (taskOf(g, id).inputs.some((i) => ids.includes(i) || hit.has(i))) hit.add(id);
  return hit;
}

/* ───────── what a task produces ───────── */

/** Compiling drops comment lines (tsc with removeComments), so a comment-only edit gives the same .js. */
function compile(src: string): string {
  return src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .map((l) => l.replace(/:\s*(string|number|Date|Todo\[\]|Todo|void)\b/g, ''))
    .join('\n');
}

export type Env = Record<string, string>;

function produce(t: TaskDef, inputs: string[], env: Env): string {
  if (t.kind === 'compile') return compile(inputs[0]);
  const vars = (t.reads ?? []).map((k) => `${k}=${env[k] ?? ''}`);
  return [`${t.id}:`, ...inputs.map(hash), ...vars].join(' ');
}

/* ───────── state ───────── */

export interface FileVer {
  content: string;
  /** Modification time in minutes since 00:00. */
  mtime: number;
}

export interface Rec {
  /** Hash of each declared input when the task last ran. */
  inputs: Record<string, string>;
  key: string;
}

export interface State {
  /** Sources by path, outputs by task id. A missing output means it was never built. */
  files: Record<string, FileVer>;
  /** Content-hash bookkeeping from the last build (what Gradle keeps in .gradle, tsc in .tsbuildinfo). */
  record: Record<string, Rec>;
  clock: number;
}

export function freshState(sources: Record<string, FileVer>, clock: number): State {
  return { files: { ...sources }, record: {}, clock };
}

/** Write new content to a source. `mtime` defaults to now, which is what an editor or git does. */
export function writeSource(s: State, path: string, content: string, mtime?: number): State {
  return { ...s, files: { ...s.files, [path]: { content, mtime: mtime ?? s.clock } }, clock: s.clock + 1 };
}

/** `touch`: the content stays, only the modification time becomes now. */
export function touch(s: State, path: string): State {
  return writeSource(s, path, s.files[path].content);
}

export const at = (s: State, minute: number): State => ({ ...s, clock: Math.max(s.clock, minute) });

/** Drop everything but the sources: a clean checkout on another machine. */
export function onlySources(g: Graph, s: State): State {
  const files: Record<string, FileVer> = {};
  for (const p of g.sources) files[p] = s.files[p];
  return { files, record: {}, clock: s.clock };
}

/** A shared build cache: key → output content. */
export type Cache = Map<string, string>;

/* ───────── deciding and running ───────── */

export type Mode = 'mtime' | 'hash';

export type Reason =
  | { kind: 'missing' }
  | { kind: 'newer'; input: string; inTime: number; outTime: number }
  | { kind: 'older'; input: string; inTime: number; outTime: number }
  | { kind: 'changed'; input: string; before: string; after: string }
  | { kind: 'same'; key: string }
  | { kind: 'hit'; key: string }
  | { kind: 'miss'; key: string };

export interface Step {
  task: string;
  action: 'run' | 'skip' | 'hit';
  reason: Reason;
  /** Seconds spent: the task's cost if it ran, a short download if it was a cache hit. */
  secs: number;
}

export interface BuildOpts {
  mode: Mode;
  env?: Env;
  cache?: Cache;
  /** Environment variables the tasks declare as inputs (so they are part of the key). */
  declared?: string[];
}

export const HIT_SECS = 0.5;

function inputContent(s: State, id: string): string {
  return s.files[id]?.content ?? '';
}

export function cacheKey(t: TaskDef, s: State, env: Env, declared: string[]): string {
  const vars = (t.reads ?? []).filter((k) => declared.includes(k)).map((k) => `${k}=${env[k] ?? ''}`);
  return hash([t.cmd, ...t.inputs.map((i) => `${i}#${hash(inputContent(s, i))}`), ...vars].join('|'));
}

export function build(g: Graph, start: State, o: BuildOpts): { state: State; steps: Step[] } {
  const env = o.env ?? {};
  const declared = o.declared ?? [];
  let s: State = { files: { ...start.files }, record: { ...start.record }, clock: start.clock };
  const steps: Step[] = [];

  for (const id of topoOrder(g)) {
    const t = taskOf(g, id);
    const out = s.files[id];
    const ins: Record<string, string> = {};
    for (const i of t.inputs) ins[i] = hash(inputContent(s, i));
    const key = cacheKey(t, s, env, declared);

    let reason: Reason;
    let stale: boolean;
    if (!out) {
      reason = { kind: 'missing' };
      stale = true;
    } else if (o.mode === 'mtime') {
      const newest = t.inputs.reduce((a, b) => (s.files[b].mtime > s.files[a].mtime ? b : a));
      const inTime = s.files[newest].mtime;
      stale = inTime > out.mtime;
      reason = { kind: stale ? 'newer' : 'older', input: newest, inTime, outTime: out.mtime };
    } else {
      const rec = s.record[id];
      const changed = rec ? t.inputs.find((i) => rec.inputs[i] !== ins[i]) : undefined;
      stale = !rec || rec.key !== key;
      reason = !rec ? { kind: 'missing' } : changed ? { kind: 'changed', input: changed, before: rec.inputs[changed], after: ins[changed] } : stale ? { kind: 'changed', input: 'env', before: rec.key, after: key } : { kind: 'same', key };
    }

    if (!stale) {
      steps.push({ task: id, action: 'skip', reason, secs: 0 });
      continue;
    }
    const cached = o.cache?.get(key);
    let content: string;
    let action: Step['action'];
    if (cached !== undefined) {
      content = cached;
      action = 'hit';
      reason = { kind: 'hit', key };
    } else {
      content = produce(
        t,
        t.inputs.map((i) => inputContent(s, i)),
        env,
      );
      action = 'run';
      if (o.cache) {
        reason = { kind: 'miss', key };
        o.cache.set(key, content);
      }
    }
    s = { ...s, files: { ...s.files, [id]: { content, mtime: s.clock } }, record: { ...s.record, [id]: { inputs: ins, key } }, clock: s.clock + 1 };
    steps.push({ task: id, action, reason, secs: action === 'hit' ? HIT_SECS : t.cost });
  }
  return { state: s, steps };
}

/** What every output should contain, computed from the sources alone. */
export function expected(g: Graph, s: State, env: Env = {}): Record<string, string> {
  const want: Record<string, string> = {};
  const get = (id: string) => (isTask(g, id) ? want[id] : s.files[id].content);
  for (const id of topoOrder(g)) {
    const t = taskOf(g, id);
    want[id] = produce(t, t.inputs.map(get), env);
  }
  return want;
}

/** Tasks whose output on disk differs from what the sources say it should be. */
export function staleOutputs(g: Graph, s: State, env: Env = {}): string[] {
  const want = expected(g, s, env);
  return topoOrder(g).filter((id) => s.files[id]?.content !== want[id]);
}

export const totalCost = (g: Graph) => g.tasks.reduce((a, t) => a + t.cost, 0);
export const secsOf = (steps: Step[]) => steps.reduce((a, x) => a + x.secs, 0);

export function clockText(m: number): string {
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/* ───────── the to-do service's front end ───────── */

export const TODO_GRAPH: Graph = {
  sources: ['src/todo.ts', 'src/api.ts', 'src/format.ts', 'src/main.ts', 'package-lock.json', 'styles/app.css', 'README.md'],
  tasks: [
    { id: 'tsc-todo', out: 'todo.js', cmd: 'tsc 5.6 src/todo.ts', inputs: ['src/todo.ts'], cost: 4, kind: 'compile' },
    { id: 'tsc-api', out: 'api.js', cmd: 'tsc 5.6 src/api.ts', inputs: ['src/api.ts'], cost: 4, kind: 'compile' },
    { id: 'tsc-format', out: 'format.js', cmd: 'tsc 5.6 src/format.ts', inputs: ['src/format.ts'], cost: 4, kind: 'compile' },
    { id: 'tsc-main', out: 'main.js', cmd: 'tsc 5.6 src/main.ts', inputs: ['src/main.ts'], cost: 4, kind: 'compile' },
    { id: 'install', out: 'node_modules/', cmd: 'npm ci (npm 10)', inputs: ['package-lock.json'], cost: 20, kind: 'concat' },
    { id: 'css', out: 'app.min.css', cmd: 'lightningcss 1.27 --minify', inputs: ['styles/app.css'], cost: 1, kind: 'concat' },
    { id: 'bundle', out: 'app.js', cmd: 'esbuild 0.24 --bundle', inputs: ['tsc-main', 'tsc-todo', 'tsc-api', 'tsc-format', 'install'], cost: 6, kind: 'concat', reads: ['API_URL'] },
    { id: 'test', out: '테스트 결과', cmd: 'vitest 2.1 run', inputs: ['tsc-todo', 'tsc-format', 'install'], cost: 12, kind: 'concat' },
    { id: 'minify', out: 'app.min.js', cmd: 'terser 5.36', inputs: ['bundle'], cost: 3, kind: 'concat' },
    { id: 'dist', out: 'dist/', cmd: 'copy to dist', inputs: ['minify', 'css'], cost: 1, kind: 'concat' },
  ],
};

export const SRC: Record<string, string> = {
  'src/todo.ts': `// 할 일 하나
export interface Todo { id: number; title: string; due: Date }
export const isLate = (t: Todo, now: Date) => t.due < now;`,
  'src/api.ts': `// 서버의 /todos API를 부른다
export const list = (base: string) => fetch(base + '/todos');`,
  'src/format.ts': `// 날짜를 2026. 11. 7. 형식으로
import { format } from 'datefmt';
export const show = (d: Date) => format(d, 'YYYY. M. D.');`,
  'src/main.ts': `// 화면에 목록을 그린다
import { list } from './api';
list(API_URL).then(render);`,
  'package-lock.json': `{ "datefmt": "1.2.1" }`,
  'styles/app.css': `.todo { padding: 8px; }`,
  'README.md': `# 할 일 서비스`,
};

/** A "real" code change for each source, used when the reader edits a file. */
export const EDITED: Record<string, string> = {
  'src/todo.ts': SRC['src/todo.ts'] + `\nexport const isDone = (t: Todo) => t.title.startsWith('✓');`,
  'src/api.ts': `// 서버의 /todos API를 부른다
export const list = (base: string) => fetch(base + '/todos?limit=50');`,
  'src/format.ts': `// 날짜를 2026. 11. 7. 형식으로
import { format } from 'datefmt';
export const show = (d: Date) => format(d, 'YYYY. M. D. (ddd)');`,
  'src/main.ts': SRC['src/main.ts'] + `\ndocument.title = '할 일';`,
  'package-lock.json': `{ "datefmt": "1.3.0" }`,
  'styles/app.css': `.todo { padding: 8px 12px; }`,
  'README.md': `# 할 일 서비스\n\n실행: npm run dev`,
};

/** The sources as they were at the start of the day, edited between 09:00 and 09:40. */
export function initialSources(): Record<string, FileVer> {
  const out: Record<string, FileVer> = {};
  TODO_GRAPH.sources.forEach((p, i) => (out[p] = { content: SRC[p], mtime: 9 * 60 + 5 * i + 5 }));
  return out;
}

/** The project after one full build at 10:00. */
export function builtAtTen(mode: Mode = 'hash'): State {
  return build(TODO_GRAPH, freshState(initialSources(), 10 * 60), { mode }).state;
}

/* ───────── scenarios for comparing mtime and hash ───────── */

export interface Scenario {
  id: string;
  label: string;
  /** Turns the freshly built project into the state just before the next build. */
  apply: (s: State) => State;
  /** Paths the scenario touches, to show their before/after. */
  paths: string[];
}

const OLD_API = `// 서버의 /todos API를 부른다
export const list = (base: string) => fetch(base + '/api/v0/todos');`;

export const SCENARIOS: Scenario[] = [
  { id: 'code', label: 'format.ts 코드 고치기', paths: ['src/format.ts'], apply: (s) => writeSource(at(s, 11 * 60), 'src/format.ts', EDITED['src/format.ts']) },
  { id: 'comment', label: 'format.ts 주석만 고치기', paths: ['src/format.ts'], apply: (s) => writeSource(at(s, 11 * 60), 'src/format.ts', SRC['src/format.ts'].replace('형식으로', '형식으로 바꾼다')) },
  { id: 'touch', label: 'todo.ts를 touch', paths: ['src/todo.ts'], apply: (s) => touch(at(s, 11 * 60), 'src/todo.ts') },
  {
    id: 'branch',
    label: '브랜치를 바꿨다가 그대로 돌아오기',
    paths: ['src/api.ts', 'src/format.ts'],
    apply: (s) => {
      let x = at(s, 11 * 60);
      x = writeSource(x, 'src/api.ts', EDITED['src/api.ts']);
      x = writeSource(x, 'src/format.ts', EDITED['src/format.ts']);
      x = at(x, 11 * 60 + 20);
      x = writeSource(x, 'src/api.ts', SRC['src/api.ts']);
      return writeSource(x, 'src/format.ts', SRC['src/format.ts']);
    },
  },
  { id: 'restore', label: '백업에서 옛 api.ts 되살리기', paths: ['src/api.ts'], apply: (s) => writeSource(at(s, 11 * 60), 'src/api.ts', OLD_API, 8 * 60 + 30) },
  { id: 'readme', label: 'README.md 고치기', paths: ['README.md'], apply: (s) => writeSource(at(s, 11 * 60), 'README.md', EDITED['README.md']) },
];

/* ───────── a day with a shared build cache ───────── */

export interface Episode {
  who: string;
  what: string;
  /** Start from a clean checkout (true) or from this machine's previous state. */
  fresh: boolean;
  /** Which machine's local state to continue from. */
  machine: string;
  edit: (s: State) => State;
  env: Env;
}

export const PROD = { API_URL: 'https://api.todo.example' };
export const STAGING = { API_URL: 'https://staging.todo.example' };

export const EPISODES: Episode[] = [
  { who: 'CI 서버', what: 'main 첫 빌드', fresh: true, machine: 'ci', edit: (s) => s, env: PROD },
  { who: '내 노트북', what: 'main을 새로 받아 빌드', fresh: true, machine: 'me', edit: (s) => s, env: PROD },
  { who: '내 노트북', what: 'feature: format.ts 고침', fresh: false, machine: 'me', edit: (s) => writeSource(s, 'src/format.ts', EDITED['src/format.ts']), env: PROD },
  { who: '내 노트북', what: 'main으로 돌아옴', fresh: false, machine: 'me', edit: (s) => writeSource(s, 'src/format.ts', SRC['src/format.ts']), env: PROD },
  { who: '스테이징 서버', what: 'main, API_URL=staging', fresh: true, machine: 'stg', edit: (s) => s, env: STAGING },
];

export interface EpisodeResult {
  ep: Episode;
  steps: Step[];
  secs: number;
  /** Outputs that do not match their sources after this build. */
  wrong: string[];
}

/** Play the whole day. With `useCache` off every machine only has its own incremental build. */
export function playDay(useCache: boolean, declareEnv: boolean): EpisodeResult[] {
  const cache: Cache | undefined = useCache ? new Map() : undefined;
  const machines = new Map<string, State>();
  const base = freshState(initialSources(), 10 * 60);
  const out: EpisodeResult[] = [];
  for (const ep of EPISODES) {
    const prev = machines.get(ep.machine);
    let s = ep.fresh || !prev ? onlySources(TODO_GRAPH, base) : prev;
    s = ep.edit(s);
    const r = build(TODO_GRAPH, s, { mode: 'hash', env: ep.env, cache, declared: declareEnv ? ['API_URL'] : [] });
    machines.set(ep.machine, r.state);
    out.push({ ep, steps: r.steps, secs: secsOf(r.steps), wrong: staleOutputs(TODO_GRAPH, r.state, ep.env) });
  }
  return out;
}
