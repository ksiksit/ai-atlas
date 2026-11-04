/* 데이터베이스 · 트랜잭션: two transactions on one account balance, and a write-ahead log */

export type Mode = 'ru' | 'rc' | 'rr' | 'ser';
export const MODE_NAMES: Record<Mode, string> = { ru: 'READ UNCOMMITTED', rc: 'READ COMMITTED', rr: 'REPEATABLE READ', ser: 'SERIALIZABLE' };
export const MODE_HOW: Record<Mode, string> = {
  ru: '읽기는 락 없이 가장 최근 값(커밋 전 값 포함)을 봅니다. 쓰기는 커밋할 때까지 배타 락을 쥡니다.',
  rc: '읽기는 그 순간 커밋된 최신 값을 봅니다. 쓰기는 커밋할 때까지 배타 락을 쥡니다.',
  rr: 'MVCC 스냅숏: 트랜잭션이 시작할 때 커밋되어 있던 값만 봅니다. 그 뒤에 남이 커밋한 행을 고치려 하면 오류로 중단됩니다(PostgreSQL 방식).',
  ser: '엄격한 2단계 락: 읽을 때 공유 락, 쓸 때 배타 락을 얻고, 모든 락을 커밋할 때 한꺼번에 풉니다. 서로를 기다리면 교착 상태로 한쪽을 중단합니다.',
};

export type TxId = 1 | 2;
export interface Op {
  kind: 'R' | 'W' | 'C' | 'A';
  /** W: new value = last value read + delta */
  delta?: number;
}
export type ScenarioId = 'lost' | 'dirty' | 'nonrep';
export interface Scenario {
  id: ScenarioId;
  name: string;
  init: number;
  ops: Record<TxId, Op[]>;
  /** the interleaving that shows the problem */
  order: TxId[];
  story: Record<TxId, string>;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'lost',
    name: '갱신 손실',
    init: 100_000,
    ops: { 1: [{ kind: 'R' }, { kind: 'W', delta: -30_000 }, { kind: 'C' }], 2: [{ kind: 'R' }, { kind: 'W', delta: -50_000 }, { kind: 'C' }] },
    order: [1, 2, 1, 1, 2, 2],
    story: { 1: 'ATM에서 3만 원 출금', 2: '앱에서 5만 원 이체' },
  },
  {
    id: 'dirty',
    name: '더티 읽기',
    init: 100_000,
    ops: { 1: [{ kind: 'R' }, { kind: 'W', delta: -30_000 }, { kind: 'A' }], 2: [{ kind: 'R' }, { kind: 'C' }] },
    order: [1, 1, 2, 2, 1],
    story: { 1: '3만 원 이체 (상대 계좌 오류로 취소)', 2: '잔액 조회' },
  },
  {
    id: 'nonrep',
    name: '반복 불가능 읽기',
    init: 100_000,
    ops: { 1: [{ kind: 'R' }, { kind: 'R' }, { kind: 'C' }], 2: [{ kind: 'R' }, { kind: 'W', delta: -30_000 }, { kind: 'C' }] },
    order: [1, 2, 2, 2, 1, 1],
    story: { 1: '월말 보고서: 잔액을 두 번 읽음', 2: '3만 원 출금' },
  },
];

export const won = (v: number) => `${v.toLocaleString('ko-KR')}원`;
export const opText = (op: Op) => (op.kind === 'R' ? 'READ 잔액' : op.kind === 'W' ? `WRITE 잔액 ${op.delta! < 0 ? '−' : '+'} ${Math.abs(op.delta!).toLocaleString('ko-KR')}` : op.kind === 'C' ? 'COMMIT' : 'ROLLBACK');

export type TxStatus = 'active' | 'waiting' | 'committed' | 'aborted';
export interface TxState {
  pc: number;
  status: TxStatus;
  snap: number | null;
  last: number | null;
  reads: { val: number; dirty: boolean }[];
}
export interface Version {
  val: number;
  by: TxId | 0;
  ts: number;
}
export type EvKind = 'read' | 'write' | 'commit' | 'abort' | 'wait' | 'error';
export interface Ev {
  t: TxId;
  kind: EvKind;
  text: string;
  /** committed balance after this event */
  committed: number;
}
export interface Sim {
  versions: Version[];
  pending: Partial<Record<TxId, number>>;
  S: TxId[];
  X: TxId | null;
  tx: Record<TxId, TxState>;
  clock: number;
  log: Ev[];
}

const other = (t: TxId): TxId => (t === 1 ? 2 : 1);
/** "T1이", "T2가": 일(1) ends in a consonant, 이(2) in a vowel */
const subj = (t: TxId) => `T${t}${t === 1 ? '이' : '가'}`;
const obj = (t: TxId) => `T${t}${t === 1 ? '을' : '를'}`;
const topic = (t: TxId) => `T${t}${t === 1 ? '은' : '는'}`;
const latest = (s: Sim) => s.versions[s.versions.length - 1];
const finished = (x: TxState) => x.status === 'committed' || x.status === 'aborted';

export function initSim(sc: Scenario): Sim {
  const tx = (): TxState => ({ pc: 0, status: 'active', snap: null, last: null, reads: [] });
  return { versions: [{ val: sc.init, by: 0, ts: 0 }], pending: {}, S: [], X: null, tx: { 1: tx(), 2: tx() }, clock: 0, log: [] };
}

function release(s: Sim, t: TxId) {
  s.S = s.S.filter((x) => x !== t);
  if (s.X === t) s.X = null;
  delete s.pending[t];
}

function push(s: Sim, t: TxId, kind: EvKind, text: string) {
  s.log.push({ t, kind, text, committed: latest(s).val });
}

function abort(s: Sim, t: TxId, text: string) {
  release(s, t);
  s.tx[t].status = 'aborted';
  push(s, t, 'error', text);
}

type Try = 'done' | 'blocked' | 'aborted';

/** Try the next operation of t. Mutates s. */
function tryOp(s: Sim, sc: Scenario, mode: Mode, t: TxId): Try {
  const me = s.tx[t];
  const op = sc.ops[t][me.pc];
  const o = other(t);
  const blocked = (why: string): Try => {
    if (s.tx[o].status === 'waiting') {
      // each waits for the other: a deadlock. The database picks a victim (here: the one that closed the cycle)
      abort(s, t, `교착 상태 감지: T${o}도 ${obj(t)} 기다리고 있어 ${obj(t)} 중단(롤백)`);
      return 'aborted';
    }
    if (me.status !== 'waiting') push(s, t, 'wait', `대기: ${why}`);
    me.status = 'waiting';
    return 'blocked';
  };
  if (me.snap === null) me.snap = s.clock;

  if (op.kind === 'R') {
    if (mode === 'ser' && s.X !== null && s.X !== t) return blocked(`${subj(o)} 쓰기 락(X)을 쥐고 있음`);
    if (mode === 'ser' && !s.S.includes(t)) s.S.push(t);
    let val: number;
    let dirty = false;
    if (s.pending[t] !== undefined) val = s.pending[t]!;
    else if (mode === 'ru' && s.pending[o] !== undefined) {
      val = s.pending[o]!;
      dirty = true;
    } else if (mode === 'rr') val = [...s.versions].reverse().find((v) => v.ts <= me.snap!)!.val;
    else val = latest(s).val;
    me.last = val;
    me.reads.push({ val, dirty });
    me.status = 'active';
    push(s, t, 'read', `READ → ${won(val)}` + (dirty ? ` (T${o}의 커밋 전 값)` : mode === 'rr' && val !== latest(s).val ? ' (스냅숏)' : ''));
    return 'done';
  }
  if (op.kind === 'W') {
    if (s.X !== null && s.X !== t) return blocked(`${subj(o)} 쓰기 락(X)을 쥐고 있음`);
    if (mode === 'ser' && s.S.some((x) => x !== t)) return blocked(`${subj(o)} 읽기 락(S)을 쥐고 있음`);
    if (mode === 'rr' && latest(s).ts > me.snap!) {
      abort(s, t, `ERROR: could not serialize access due to concurrent update → T${t} 롤백`);
      return 'aborted';
    }
    const base = me.last ?? latest(s).val;
    const val = base + op.delta!;
    s.X = t;
    s.pending[t] = val;
    me.status = 'active';
    push(s, t, 'write', `WRITE ${won(base)} ${op.delta! < 0 ? '−' : '+'} ${Math.abs(op.delta!).toLocaleString('ko-KR')} = ${won(val)} (커밋 전)`);
    return 'done';
  }
  if (op.kind === 'C') {
    if (s.pending[t] !== undefined) s.versions.push({ val: s.pending[t]!, by: t, ts: ++s.clock });
    release(s, t);
    me.status = 'committed';
    push(s, t, 'commit', 'COMMIT');
    return 'done';
  }
  release(s, t);
  me.status = 'aborted';
  push(s, t, 'abort', 'ROLLBACK (쓴 값을 버림)');
  return 'done';
}

/** Advance t by one operation, then let a waiting partner retry. */
function advance(s: Sim, sc: Scenario, mode: Mode, t: TxId) {
  const r = tryOp(s, sc, mode, t);
  if (r === 'done') s.tx[t].pc++;
  const o = other(t);
  if ((r === 'aborted' || finished(s.tx[t])) && s.tx[o].status === 'waiting') {
    if (tryOp(s, sc, mode, o) === 'done') s.tx[o].pc++;
  }
}

export const runnable = (s: Sim, sc: Scenario, t: TxId) => s.tx[t].status === 'active' && s.tx[t].pc < sc.ops[t].length;

/**
 * Replay a schedule. Each entry says which transaction should go next; if it is waiting for a lock,
 * the next entry of the other transaction runs instead (a real scheduler would do the same).
 */
export function replay(sc: Scenario, mode: Mode, schedule: TxId[]): Sim {
  const s = initSim(sc);
  let q = [...schedule];
  for (;;) {
    // entries of transactions that have finished are dropped
    q = q.filter((t) => runnable(s, sc, t) || s.tx[t].status === 'waiting');
    const k = q.findIndex((t) => runnable(s, sc, t));
    if (k < 0) break;
    const [t] = q.splice(k, 1);
    advance(s, sc, mode, t);
  }
  return s;
}

export interface Verdict {
  done: boolean;
  bad: boolean;
  text: string;
}

export function verdict(sc: Scenario, s: Sim): Verdict {
  const done = finished(s.tx[1]) && finished(s.tx[2]);
  if (!done) return { done, bad: false, text: '아직 진행 중입니다.' };
  const final = latest(s).val;
  const aborted = ([1, 2] as TxId[]).filter((t) => s.tx[t].status === 'aborted' && sc.ops[t].every((o) => o.kind !== 'A'));
  const retry = aborted.length ? ` ${topic(aborted[0])} 중단되었으므로 애플리케이션이 다시 실행하면 됩니다.` : '';
  if (sc.id === 'lost') {
    const expect = sc.init + ([1, 2] as TxId[]).filter((t) => s.tx[t].status === 'committed').reduce((a, t) => a + sc.ops[t][1].delta!, 0);
    if (final !== expect) return { done, bad: true, text: `갱신 손실: 두 출금이 모두 커밋되었는데 잔액은 ${won(final)}입니다. 맞는 값은 ${won(expect)}. T1의 쓰기를 T2가 덮어썼습니다.` };
    return { done, bad: false, text: `잔액 ${won(final)}: 커밋된 출금만큼 정확히 줄었습니다.` + retry };
  }
  if (sc.id === 'dirty') {
    const r = s.tx[2].reads[0];
    if (r && r.dirty) return { done, bad: true, text: `더티 읽기: T2가 ${won(r.val)}을 읽고 보고했지만, T1이 롤백해서 그 값은 한 번도 확정된 적이 없습니다.` };
    return { done, bad: false, text: `T2는 확정된 값 ${won(r ? r.val : final)}만 보았습니다.` + retry };
  }
  const rs = s.tx[1].reads;
  if (rs.length === 2 && rs[0].val !== rs[1].val) return { done, bad: true, text: `반복 불가능 읽기: 한 트랜잭션 안에서 같은 잔액을 두 번 읽었는데 ${won(rs[0].val)}과 ${won(rs[1].val)}으로 다릅니다.` };
  return { done, bad: false, text: `T1은 두 번 모두 ${won(rs[0]?.val ?? final)}을 읽었습니다.` + retry };
}

/* ─────────────── write-ahead log and crash recovery ─────────────── */

export type Page = 'A' | 'B' | 'C';
export const PAGES: Page[] = ['A', 'B', 'C'];
export const INIT: Record<Page, number> = { A: 100_000, B: 20_000, C: 50_000 };
export const TOTAL = INIT.A + INIT.B + INIT.C;

export interface LogRec {
  lsn: number;
  t: TxId;
  kind: 'BEGIN' | 'UPDATE' | 'COMMIT';
  page?: Page;
  old?: number;
  val?: number;
}
export interface WalState {
  disk: Record<Page, number>;
  buf: Partial<Record<Page, { val: number; dirty: boolean }>>;
  logBuf: LogRec[];
  logDisk: LogRec[];
  committed: TxId[];
  note: string;
}

type Step = { label: string; run: (s: WalState) => void };

const val = (s: WalState, p: Page) => s.buf[p]?.val ?? s.disk[p];
function update(s: WalState, t: TxId, p: Page, delta: number, wal: boolean) {
  const old = val(s, p);
  const nv = old + delta;
  if (wal) s.logBuf.push({ lsn: s.logBuf.length + s.logDisk.length + 1, t, kind: 'UPDATE', page: p, old, val: nv });
  s.buf[p] = { val: nv, dirty: true };
}
const flushLog = (s: WalState) => {
  s.logDisk.push(...s.logBuf);
  s.logBuf = [];
};
const writePage = (s: WalState, p: Page) => {
  const b = s.buf[p];
  if (!b) return;
  s.disk[p] = b.val;
  s.buf[p] = { val: b.val, dirty: false };
};
const begin = (s: WalState, t: TxId, wal: boolean) => wal && s.logBuf.push({ lsn: s.logBuf.length + s.logDisk.length + 1, t, kind: 'BEGIN' });

export function walSteps(wal: boolean): Step[] {
  const fmt = (d: number) => `${d < 0 ? '−' : '+'}${Math.abs(d / 10_000)}만`;
  const steps: Step[] = [
    { label: '시작', run: (s) => (s.note = '디스크에 계좌 A, B, C의 잔액이 있습니다. 합계는 17만 원입니다.') },
    { label: 'T1 BEGIN', run: (s) => (begin(s, 1, wal), (s.note = 'T1: A에서 B로 3만 원 이체를 시작합니다.')) },
    { label: `T1: A ${fmt(-30_000)}`, run: (s) => (update(s, 1, 'A', -30_000, wal), (s.note = wal ? '페이지 A를 메모리(버퍼 풀)에서 고치고, 바뀐 내용을 로그 버퍼에 적습니다. 디스크는 아직 그대로입니다.' : '페이지 A를 메모리에서 고쳤습니다. 디스크는 아직 그대로입니다.')) },
    { label: 'T2 BEGIN', run: (s) => (begin(s, 2, wal), (s.note = 'T2: C에서 A로 1만 원 이체를 시작합니다.')) },
    { label: `T2: C ${fmt(-10_000)}`, run: (s) => (update(s, 2, 'C', -10_000, wal), (s.note = '페이지 C를 메모리에서 고쳤습니다.')) },
    {
      label: '버퍼: C를 디스크로',
      run: (s) => {
        if (wal) flushLog(s);
        writePage(s, 'C');
        s.note = wal ? '버퍼 풀에 자리가 필요해 커밋 전인 페이지 C를 디스크로 내보냅니다. WAL 규칙에 따라 그 변경을 적은 로그를 먼저 디스크에 씁니다.' : '버퍼 풀에 자리가 필요해 커밋 전인 페이지 C를 디스크로 내보냅니다.';
      },
    },
    { label: `T1: B ${fmt(30_000)}`, run: (s) => (update(s, 1, 'B', 30_000, wal), (s.note = '페이지 B를 메모리에서 고쳤습니다. 이체의 두 번째 절반입니다.')) },
  ];
  if (wal) {
    steps.push({
      label: 'T1 COMMIT',
      run: (s) => {
        s.logBuf.push({ lsn: s.logBuf.length + s.logDisk.length + 1, t: 1, kind: 'COMMIT' });
        flushLog(s);
        s.committed.push(1);
        s.note = 'COMMIT 기록까지 로그를 디스크에 쓰고(fsync) 나서야 "커밋 완료"라고 답합니다. 데이터 페이지 A와 B는 아직 메모리에만 있어도 됩니다.';
      },
    });
  } else {
    steps.push(
      { label: 'T1 COMMIT: A 쓰기', run: (s) => (writePage(s, 'A'), (s.note = '로그가 없으니 커밋하려면 T1이 고친 페이지를 모두 디스크에 써야 합니다. 먼저 A를 썼습니다.')) },
      { label: 'T1 COMMIT: B 쓰기', run: (s) => (writePage(s, 'B'), s.committed.push(1), (s.note = '이어서 B를 썼습니다. 이제야 "커밋 완료"라고 답합니다.')) },
    );
  }
  steps.push({ label: `T2: A ${fmt(10_000)}`, run: (s) => (update(s, 2, 'A', 10_000, wal), (s.note = 'T2가 페이지 A를 메모리에서 고칩니다.')) });
  if (wal) {
    steps.push(
      {
        label: '체크포인트',
        run: (s) => {
          flushLog(s);
          PAGES.forEach((p) => s.buf[p]?.dirty && writePage(s, p));
          s.note = '체크포인트: 로그를 먼저 쓰고, 메모리의 고친 페이지를 모두 디스크에 씁니다. 커밋 전인 T2의 A 변경도 함께 디스크로 갑니다.';
        },
      },
      {
        label: 'T2 COMMIT',
        run: (s) => {
          s.logBuf.push({ lsn: s.logBuf.length + s.logDisk.length + 1, t: 2, kind: 'COMMIT' });
          flushLog(s);
          s.committed.push(2);
          s.note = 'T2의 COMMIT 기록을 디스크에 썼습니다. 두 이체가 모두 끝났습니다.';
        },
      },
    );
  } else {
    steps.push({ label: 'T2 COMMIT: A, C 쓰기', run: (s) => (writePage(s, 'A'), writePage(s, 'C'), s.committed.push(2), (s.note = 'T2가 고친 A와 C를 디스크에 쓰고 커밋을 마칩니다.')) });
  }
  return steps;
}

export function walState(wal: boolean, upto: number): WalState {
  const s: WalState = { disk: { ...INIT }, buf: {}, logBuf: [], logDisk: [], committed: [], note: '' };
  walSteps(wal).slice(0, upto + 1).forEach((st) => st.run(s));
  return s;
}

/** The balances that should survive: the initial ones plus every committed transfer. */
export function expected(committed: TxId[]): Record<Page, number> {
  const out = { ...INIT };
  if (committed.includes(1)) {
    out.A -= 30_000;
    out.B += 30_000;
  }
  if (committed.includes(2)) {
    out.C -= 10_000;
    out.A += 10_000;
  }
  return out;
}

export interface Recovery {
  lines: { kind: 'redo' | 'undo' | 'info'; text: string }[];
  disk: Record<Page, number>;
}

/** ARIES in miniature: repeat history from the log on disk, then undo transactions without a COMMIT record. */
export function recover(s: WalState, wal: boolean): Recovery {
  const disk = { ...s.disk };
  if (!wal) return { lines: [{ kind: 'info', text: '로그가 없으므로 어떤 페이지가 어느 트랜잭션의 것인지, 커밋되었는지 알 길이 없습니다. 디스크를 그대로 쓸 수밖에 없습니다.' }], disk };
  const lines: Recovery['lines'] = [];
  const recs = s.logDisk;
  if (!recs.length) lines.push({ kind: 'info', text: '디스크의 로그가 비어 있습니다. 할 일이 없습니다.' });
  for (const r of recs) {
    if (r.kind !== 'UPDATE') continue;
    lines.push({ kind: 'redo', text: `REDO #${r.lsn} T${r.t}: ${r.page} ← ${won(r.val!)}` });
    disk[r.page!] = r.val!;
  }
  const winners = new Set(recs.filter((r) => r.kind === 'COMMIT').map((r) => r.t));
  const losers = [...new Set(recs.filter((r) => r.kind === 'BEGIN').map((r) => r.t))].filter((t) => !winners.has(t));
  for (const r of [...recs].reverse()) {
    if (r.kind !== 'UPDATE' || !losers.includes(r.t)) continue;
    lines.push({ kind: 'undo', text: `UNDO #${r.lsn} T${r.t}: ${r.page} ← ${won(r.old!)} (커밋 기록 없음)` });
    disk[r.page!] = r.old!;
  }
  if (recs.length) lines.push({ kind: 'info', text: `커밋된 트랜잭션: ${[...winners].map((t) => 'T' + t).join(', ') || '없음'} · 되돌린 트랜잭션: ${losers.map((t) => 'T' + t).join(', ') || '없음'}` });
  return { lines, disk };
}
