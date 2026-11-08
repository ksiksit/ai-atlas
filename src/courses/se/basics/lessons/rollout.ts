/**
 * Two small deployment models.
 *
 * 1. simulateRollout: a seeded minute-by-minute simulation of releasing a new version of the
 *    to-do service. Every minute REQ_PER_MIN requests arrive; a share of them reaches the new
 *    version (how big depends on the strategy and the minute), and each request fails with the
 *    old or new version's error rate. A monitor watches the error rate over the last few minutes
 *    and, once it crosses the threshold, the release is rolled back.
 *
 * 2. The expand → migrate → contract schema change: a tiny in-memory `todos` table, three app
 *    versions that read and write it, and a checker that runs an app version against a copy of
 *    the table and reports SQL errors or rows it reads wrongly.
 */
import { rng } from '../../../../lib/math';

/* ───────────────────────── 1. rollout simulation ───────────────────────── */

export type Strategy = 'all' | 'rolling' | 'bluegreen' | 'canary';

export const STRATEGY_NAME: Record<Strategy, string> = {
  all: '한꺼번에',
  rolling: '순차(롤링)',
  bluegreen: '블루-그린',
  canary: '카나리',
};

export const MINUTES = 60;
export const REQ_PER_MIN = 1000;
export const BASE_ERR = 0.005; // the old version fails 0.5% of requests
export const SERVERS = 10;
export const ROLL_EVERY = 3; // rolling: one more server every 3 minutes
export const WINDOW = 3; // the monitor looks at the last 3 minutes
export const HUMAN_DELAY = 5; // minutes from the alert until a person starts the rollback
export const REDEPLOY = 6; // minutes to build and push the old version again to every server
export const CANARY_STAGE = 10; // minutes per canary stage

export interface RolloutParams {
  strategy: Strategy;
  /** error rate of the new version, 0..1 */
  errNew: number;
  /** canary share of traffic in the first stage, 0..1 */
  canary: number;
  /** alert threshold on the observed error rate, 0..1 */
  threshold: number;
  seed: number;
}

export interface Minute {
  t: number;
  /** share of traffic on the new version this minute */
  share: number;
  reqNew: number;
  errNew: number;
  reqOld: number;
  errOld: number;
  /** error rate the monitor saw at the end of this minute (window), or null if it saw no traffic */
  watched: number | null;
}

export interface RolloutResult {
  minutes: Minute[];
  /** minute at which the monitor first crossed the threshold, or null */
  detectAt: number | null;
  /** minute at which the rollback started, or null */
  rollbackAt: number | null;
  /** minute at which the new version no longer gets traffic, or null if it stayed */
  doneAt: number | null;
  /** requests served by the new version */
  exposed: number;
  /** requests that failed on the new version */
  failedNew: number;
  /** all failed requests (old + new) */
  failedAll: number;
  /** servers needed at the busiest moment */
  servers: number;
  /** what the monitor watches */
  watches: 'all' | 'new';
  /** who starts the rollback */
  auto: boolean;
}

/** Share of traffic on the new version at minute t if nothing goes wrong. */
export function plannedShare(strategy: Strategy, t: number, canary: number): number {
  switch (strategy) {
    case 'all':
    case 'bluegreen':
      return 1;
    case 'rolling':
      return Math.min(SERVERS, Math.floor(t / ROLL_EVERY) + 1) / SERVERS;
    case 'canary':
      return t < CANARY_STAGE ? canary : t < 2 * CANARY_STAGE ? Math.max(canary, 0.5) : 1;
  }
}

/** Share of traffic on the new version m minutes after the rollback started, from share s. */
function rollbackShare(strategy: Strategy, s: number, m: number): number {
  switch (strategy) {
    case 'all':
      return m < REDEPLOY ? s : 0; // rebuild and push the old version to every server
    case 'rolling': {
      const k = Math.round(s * SERVERS) - (m + 1); // one server back per minute
      return Math.max(0, k) / SERVERS;
    }
    case 'bluegreen':
    case 'canary':
      return 0; // the load balancer points back at the old servers at once
  }
}

/** Binomial sample by direct simulation (n is at most a few thousand). */
function binom(n: number, p: number, r: () => number): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (r() < p) k++;
  return k;
}

export function simulateRollout(p: RolloutParams): RolloutResult {
  const r = rng(p.seed * 7919 + 13);
  const watches: 'all' | 'new' = p.strategy === 'canary' ? 'new' : 'all';
  const auto = p.strategy === 'canary';
  const minutes: Minute[] = [];
  let detectAt: number | null = null;
  let rollbackFrom: number | null = null; // minute the rollback starts
  let shareAtRollback = 0;
  let doneAt: number | null = null;

  for (let t = 0; t < MINUTES; t++) {
    let share: number;
    if (rollbackFrom !== null && t >= rollbackFrom) share = rollbackShare(p.strategy, shareAtRollback, t - rollbackFrom);
    else share = plannedShare(p.strategy, t, p.canary);
    if (share === 0 && doneAt === null && rollbackFrom !== null) doneAt = t;

    const reqNew = Math.round(REQ_PER_MIN * share);
    const reqOld = REQ_PER_MIN - reqNew;
    const m: Minute = { t, share, reqNew, reqOld, errNew: binom(reqNew, p.errNew, r), errOld: binom(reqOld, BASE_ERR, r), watched: null };
    minutes.push(m);

    // the monitor: error rate over the last WINDOW minutes, of everything or of the new version only
    const win = minutes.slice(-WINDOW);
    const req = win.reduce((s, x) => s + (watches === 'all' ? x.reqNew + x.reqOld : x.reqNew), 0);
    const err = win.reduce((s, x) => s + (watches === 'all' ? x.errNew + x.errOld : x.errNew), 0);
    // once the new version gets no traffic there is nothing left for a canary monitor to watch
    m.watched = req > 0 && (watches === 'all' || reqNew > 0) ? err / req : null;

    if (detectAt === null && rollbackFrom === null && share > 0 && m.watched !== null && m.watched > p.threshold) {
      detectAt = t;
      rollbackFrom = t + 1 + (auto ? 0 : HUMAN_DELAY);
      shareAtRollback = share;
    }
    // a person (or the canary controller) keeps the plan going until the rollback starts
    if (rollbackFrom !== null && t + 1 < rollbackFrom) shareAtRollback = plannedShare(p.strategy, t + 1, p.canary);
  }

  const exposed = minutes.reduce((s, x) => s + x.reqNew, 0);
  const failedNew = minutes.reduce((s, x) => s + x.errNew, 0);
  const failedAll = failedNew + minutes.reduce((s, x) => s + x.errOld, 0);
  const servers = p.strategy === 'bluegreen' ? 2 * SERVERS : p.strategy === 'canary' ? SERVERS + 1 : p.strategy === 'rolling' ? SERVERS + 1 : SERVERS;
  return { minutes, detectAt, rollbackAt: rollbackFrom, doneAt, exposed, failedNew, failedAll, servers, watches, auto };
}

/** Expected overall error rate when k of SERVERS servers run a version with error rate e. */
export function dilutedRate(k: number, e: number): number {
  return (BASE_ERR * (SERVERS - k) + e * k) / SERVERS;
}

/* ───────────────────────── 2. expand → migrate → contract ───────────────────────── */

export type Col = 'done' | 'status';
export interface Row {
  id: number;
  title: string;
  done?: boolean | null;
  status?: string | null;
}
export interface Table {
  cols: Col[];
  rows: Row[];
}
/** What really is done, kept beside the table so that wrong reads can be counted. */
export type Truth = Map<number, boolean>;

export type AppVersion = 'v1' | 'v2' | 'v3';
export const APP_DESC: Record<AppVersion, string> = {
  v1: 'done 열만 읽고 씀',
  v2: '두 열 모두 쓰고, status를 먼저 읽음',
  v3: 'status 열만 읽고 씀',
};

export class SqlError extends Error {}

function need(t: Table, c: Col) {
  if (!t.cols.includes(c)) throw new SqlError(`ERROR: column "${c}" does not exist`);
}
function setCols(t: Table, row: Row, vals: Partial<Record<Col, boolean | string>>) {
  for (const c of Object.keys(vals) as Col[]) need(t, c);
  Object.assign(row, vals);
}

/** The three versions of the to-do service, written against the table. */
const APPS: Record<AppVersion, { insert: (t: Table, title: string) => Row; complete: (t: Table, row: Row) => void; read: (t: Table, row: Row) => boolean | null }> = {
  v1: {
    insert: (t, title) => {
      need(t, 'done');
      const row: Row = { id: nextId(t), title, done: false, ...(t.cols.includes('status') ? { status: null } : {}) };
      t.rows.push(row);
      return row;
    },
    complete: (t, row) => setCols(t, row, { done: true }),
    read: (t, row) => (need(t, 'done'), row.done ?? null),
  },
  v2: {
    insert: (t, title) => {
      need(t, 'done');
      need(t, 'status');
      const row: Row = { id: nextId(t), title, done: false, status: 'todo' };
      t.rows.push(row);
      return row;
    },
    complete: (t, row) => setCols(t, row, { done: true, status: 'done' }),
    read: (t, row) => {
      need(t, 'done');
      need(t, 'status');
      return row.status != null ? row.status === 'done' : (row.done ?? null);
    },
  },
  v3: {
    insert: (t, title) => {
      need(t, 'status');
      const row: Row = { id: nextId(t), title, status: 'todo', ...(t.cols.includes('done') ? { done: null } : {}) };
      t.rows.push(row);
      return row;
    },
    complete: (t, row) => setCols(t, row, { status: 'done' }),
    read: (t, row) => (need(t, 'status'), row.status == null ? null : row.status === 'done'),
  },
};

const nextId = (t: Table) => Math.max(0, ...t.rows.map((r) => r.id)) + 1;

export const cloneTable = (t: Table): Table => ({ cols: [...t.cols], rows: t.rows.map((r) => ({ ...r })) });

export type Ddl = 'add-status' | 'backfill' | 'drop-done';
export const DDL_SQL: Record<Ddl, string> = {
  'add-status': 'ALTER TABLE todos ADD COLUMN status TEXT;',
  backfill: "UPDATE todos SET status = CASE WHEN done THEN 'done' ELSE 'todo' END WHERE status IS NULL;",
  'drop-done': 'ALTER TABLE todos DROP COLUMN done;',
};

export function applyDdl(t: Table, d: Ddl): Table {
  const out = cloneTable(t);
  if (d === 'add-status') {
    if (!out.cols.includes('status')) out.cols.push('status');
    for (const r of out.rows) r.status = null;
  } else if (d === 'backfill') {
    need(out, 'status');
    need(out, 'done');
    for (const r of out.rows) if (r.status == null) r.status = r.done ? 'done' : 'todo';
  } else {
    out.cols = out.cols.filter((c) => c !== 'done');
    for (const r of out.rows) delete r.done;
  }
  return out;
}

export interface Verdict {
  /** the SQL error the version hits, if any */
  error: string | null;
  /** rows this version reads differently from the truth */
  misread: number;
}

/** Run one version against a copy of the table: list every to-do and compare with the truth. */
export function readCheck(v: AppVersion, t: Table, truth: Truth): Verdict {
  try {
    let misread = 0;
    for (const row of t.rows) if (APPS[v].read(t, row) !== truth.get(row.id)) misread++;
    return { error: null, misread };
  } catch (e) {
    if (e instanceof SqlError) return { error: e.message, misread: 0 };
    throw e;
  }
}

export interface Check extends Verdict {
  /** after this version has added and finished a to-do, rows that the other versions read wrongly */
  breaksFor: AppVersion[];
}

/** The full check: can v list, add and finish to-dos, and does what it writes still look right to the others? */
export function check(v: AppVersion, t: Table, truth: Truth): Check {
  const first = readCheck(v, t, truth);
  if (first.error) return { ...first, breaksFor: [] };
  const t2 = cloneTable(t);
  const tr = new Map(truth);
  try {
    const row = APPS[v].insert(t2, '새 할 일');
    tr.set(row.id, false);
    APPS[v].complete(t2, row);
    tr.set(row.id, true);
  } catch (e) {
    if (e instanceof SqlError) return { error: e.message, misread: first.misread, breaksFor: [] };
    throw e;
  }
  const breaksFor = (['v1', 'v2', 'v3'] as AppVersion[]).filter((o) => o !== v && readCheck(o, t, truth).error === null && readCheck(o, t2, tr).misread > readCheck(o, t, truth).misread);
  return { ...first, breaksFor };
}

export type MigStep = { kind: 'start'; app: AppVersion } | { kind: 'ddl'; ddl: Ddl[] } | { kind: 'deploy'; app: AppVersion };

export type Plan = 'oneshot' | 'expand';

export const PLANS: Record<Plan, { step: MigStep; label: string; phase?: string }[]> = {
  oneshot: [
    { step: { kind: 'start', app: 'v1' }, label: '시작: 앱 v1, done 열' },
    { step: { kind: 'ddl', ddl: ['add-status', 'backfill', 'drop-done'] }, label: '마이그레이션 한 번에 실행' },
    { step: { kind: 'deploy', app: 'v3' }, label: '앱 v3 배포 완료' },
  ],
  expand: [
    { step: { kind: 'start', app: 'v1' }, label: '시작: 앱 v1, done 열' },
    { step: { kind: 'ddl', ddl: ['add-status'] }, label: 'status 열 추가', phase: '확장' },
    { step: { kind: 'deploy', app: 'v2' }, label: '앱 v2 배포', phase: '확장' },
    { step: { kind: 'ddl', ddl: ['backfill'] }, label: '기존 행 채우기', phase: '이전' },
    { step: { kind: 'deploy', app: 'v3' }, label: '앱 v3 배포', phase: '이전' },
    { step: { kind: 'ddl', ddl: ['drop-done'] }, label: 'done 열 삭제', phase: '축소' },
  ],
};

export const INITIAL: Table = {
  cols: ['done'],
  rows: [
    { id: 1, title: '장보기', done: true },
    { id: 2, title: 'datefmt 2.0 올리기', done: false },
    { id: 3, title: '발표 자료 만들기', done: true },
    { id: 4, title: '청구서 내기', done: false },
  ],
};

/** New to-dos the running version adds while the plan waits at each step. */
const WORK = ['회의록 정리', '테스트 고치기', '릴리스 노트 쓰기', '로그 확인', '휴가 신청', '코드 리뷰'];

export interface StepState {
  table: Table;
  truth: Truth;
  /** the version on the servers after this step */
  app: AppVersion;
  /** SQL error the running version hit right after this step, if any */
  error: string | null;
}

/**
 * Walk a plan. After each step the running version handles a little traffic: it adds a to-do
 * (and every other step it finishes one), so rows written by v1 between steps show up in the data.
 */
export function walkPlan(plan: Plan): StepState[] {
  let table = cloneTable(INITIAL);
  const truth: Truth = new Map(INITIAL.rows.map((r) => [r.id, !!r.done]));
  let app: AppVersion = 'v1';
  const out: StepState[] = [];
  PLANS[plan].forEach(({ step }, i) => {
    if (step.kind === 'start' || step.kind === 'deploy') app = step.app;
    else for (const d of step.ddl) table = applyDdl(table, d);
    let error: string | null = null;
    try {
      const row = APPS[app].insert(table, WORK[i % WORK.length]);
      truth.set(row.id, false);
      if (i % 2 === 1) {
        APPS[app].complete(table, row);
        truth.set(row.id, true);
      }
    } catch (e) {
      if (e instanceof SqlError) error = e.message;
      else throw e;
    }
    out.push({ table: cloneTable(table), truth: new Map(truth), app, error });
  });
  return out;
}
