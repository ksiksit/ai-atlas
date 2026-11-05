/**
 * 병렬·분산 컴퓨팅, 복제와 합의: a small, deterministic Raft simulator.
 *
 * Event driven: time is in milliseconds and the simulator jumps from one event to the next
 * (a message arriving, an election timer running out, a leader's heartbeat). Everything random
 * (election timeouts, message delays) comes from a seeded PRNG, so a seed and the same actions
 * at the same times always give the same run.
 *
 * Follows the Raft paper (Ongaro & Ousterhout, 2014): terms, votedFor, the up-to-date check on
 * votes, AppendEntries with the prevIndex/prevTerm consistency check, followers truncating
 * conflicting entries, the leader backing up nextIndex one step on a rejection, and commitIndex
 * advanced only by counting replicas of an entry from the leader's current term.
 * Like etcd, the commit index is kept across a restart along with term, vote and log.
 *
 * No imports, so the safety test can run it directly with node --experimental-strip-types.
 */

export type Role = 'follower' | 'candidate' | 'leader';

export interface Entry {
  term: number;
  cmd: string;
}

export interface Server {
  id: number;
  alive: boolean;
  role: Role;
  term: number;
  votedFor: number | null;
  log: Entry[];
  /** Number of log entries known to be committed (Raft's commitIndex, 1-based). */
  commit: number;
  /** Election timer: absolute time it runs out, and its full length (for drawing the ring). */
  deadline: number;
  timeoutLen: number;
  /** Leader only: time of the next heartbeat. */
  hbAt: number;
  votes: number[];
  nextIndex: number[];
  matchIndex: number[];
  /** Leader this server last heard from in its current term. */
  leader: number | null;
}

export type MsgKind = 'vote' | 'vote-ok' | 'append' | 'append-ok';

export interface Msg {
  id: number;
  kind: MsgKind;
  from: number;
  to: number;
  sent: number;
  arrive: number;
  term: number;
  /** Sent across a partition: it dies halfway. */
  lost: boolean;
  lastIndex?: number;
  lastTerm?: number;
  granted?: boolean;
  prevIndex?: number;
  prevTerm?: number;
  entries?: Entry[];
  leaderCommit?: number;
  success?: boolean;
  match?: number;
}

export type EvKind = 'timeout' | 'leader' | 'stepdown' | 'client' | 'commit' | 'overwrite' | 'reject' | 'crash' | 'restart' | 'partition' | 'heal' | 'noleader';

export interface Ev {
  t: number;
  kind: EvKind;
  s: number;
  text: string;
}

export interface Cfg {
  n: number;
  timeoutMin: number;
  timeoutSpread: number;
  heartbeat: number;
  latMin: number;
  latJitter: number;
}

export const DEFAULT_CFG: Cfg = { n: 5, timeoutMin: 150, timeoutSpread: 150, heartbeat: 50, latMin: 12, latJitter: 10 };

export interface Sim {
  cfg: Cfg;
  t: number;
  servers: Server[];
  msgs: Msg[];
  /** Network group of each server; messages only travel within a group. */
  group: number[];
  events: Ev[];
  /** Total number of events ever logged (events keeps only the latest ones). */
  evCount: number;
  rand: () => number;
  nextId: number;
  cmdNo: number;
  /** Entries known committed anywhere, by index: the state machine's history. */
  committed: Entry[];
  /** Leader of each term, to check election safety. */
  leaders: Record<number, number>;
  /** Timeouts and elections, for the election timeline. */
  trace: { t: number; s: number; kind: 'timeout' | 'leader'; term: number }[];
  violations: string[];
}

export const sname = (i: number) => `S${i + 1}`;

/** Whether a number, read aloud in Korean (일, 이, 삼 …, 십), ends in a final consonant. */
function batchim(n: number): boolean {
  const d = Math.abs(n) % 10;
  return d === 0 ? true : [true, true, false, true, false, false, true, true, true, false][d];
}
/** Particle after a number: 이/가, 을/를, 은/는, 과/와. */
export const josa = (n: number, withB: string, without: string) => (batchim(n) ? withB : without);
/** 으로/로 after a number: 로 after a vowel or ㄹ (일, 칠, 팔). */
export const ro = (n: number) => ([1, 7, 8].includes(Math.abs(n) % 10) || !batchim(n) ? '로' : '으로');
/** Server name with 이/가, e.g. "S1이", "S2가". */
export const sga = (i: number) => sname(i) + josa(i + 1, '이', '가');
const cmdReul = (c: string) => ('lmnr'.includes(c) ? '을' : '를');
export const majority = (n: number) => Math.floor(n / 2) + 1;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_EVENTS = 300;

function log(sim: Sim, kind: EvKind, s: number, text: string) {
  sim.events.push({ t: sim.t, kind, s, text });
  sim.evCount++;
  if (sim.events.length > MAX_EVENTS) sim.events.splice(0, sim.events.length - MAX_EVENTS);
}

function resetTimer(sim: Sim, s: Server) {
  s.timeoutLen = sim.cfg.timeoutMin + (sim.cfg.timeoutSpread > 0 ? sim.rand() * sim.cfg.timeoutSpread : 0);
  s.deadline = sim.t + s.timeoutLen;
}

export function createSim(cfg: Cfg = DEFAULT_CFG, seed = 1): Sim {
  const sim: Sim = {
    cfg,
    t: 0,
    servers: [],
    msgs: [],
    group: Array(cfg.n).fill(0),
    events: [],
    evCount: 0,
    rand: mulberry(seed),
    nextId: 1,
    cmdNo: 0,
    committed: [],
    leaders: {},
    trace: [],
    violations: [],
  };
  for (let i = 0; i < cfg.n; i++) {
    const s: Server = { id: i, alive: true, role: 'follower', term: 0, votedFor: null, log: [], commit: 0, deadline: 0, timeoutLen: 0, hbAt: 0, votes: [], nextIndex: [], matchIndex: [], leader: null };
    resetTimer(sim, s);
    sim.servers.push(s);
  }
  return sim;
}

const lastTerm = (s: Server) => (s.log.length ? s.log[s.log.length - 1].term : 0);

function send(sim: Sim, m: Omit<Msg, 'id' | 'sent' | 'arrive' | 'lost'>) {
  const lat = sim.cfg.latMin + sim.rand() * sim.cfg.latJitter;
  const lost = sim.group[m.from] !== sim.group[m.to];
  sim.msgs.push({ ...m, id: sim.nextId++, sent: sim.t, arrive: sim.t + (lost ? lat * 0.5 : lat), lost });
}

function sendAppend(sim: Sim, l: Server, to: number) {
  const prevIndex = l.nextIndex[to] - 1;
  send(sim, {
    kind: 'append',
    from: l.id,
    to,
    term: l.term,
    prevIndex,
    prevTerm: prevIndex > 0 ? l.log[prevIndex - 1].term : 0,
    entries: l.log.slice(prevIndex).map((e) => ({ ...e })),
    leaderCommit: l.commit,
  });
}

function broadcastAppend(sim: Sim, l: Server) {
  for (let j = 0; j < sim.cfg.n; j++) if (j !== l.id) sendAppend(sim, l, j);
}

/** Record newly committed entries of server s and check them against the history. */
function recordCommit(sim: Sim, s: Server, from: number) {
  for (let i = from + 1; i <= s.commit; i++) {
    const e = s.log[i - 1];
    const c = sim.committed[i - 1];
    if (c && (c.term !== e.term || c.cmd !== e.cmd)) sim.violations.push(`t=${sim.t}: ${sname(s.id)} committed index ${i} = (${e.term},${e.cmd}) but (${c.term},${c.cmd}) was committed before`);
    else if (!c) sim.committed[i - 1] = { ...e };
  }
}

function becomeLeader(sim: Sim, s: Server) {
  s.role = 'leader';
  s.leader = s.id;
  const prev = sim.leaders[s.term];
  if (prev !== undefined && prev !== s.id) sim.violations.push(`t=${sim.t}: two leaders in term ${s.term}: ${sname(prev)} and ${sname(s.id)}`);
  sim.leaders[s.term] = s.id;
  // leader completeness: every committed entry must already be in the new leader's log
  sim.committed.forEach((c, i) => {
    const e = s.log[i];
    if (!e || e.term !== c.term || e.cmd !== c.cmd) sim.violations.push(`t=${sim.t}: leader ${sname(s.id)} of term ${s.term} lacks committed index ${i + 1}`);
  });
  s.nextIndex = Array(sim.cfg.n).fill(s.log.length + 1);
  s.matchIndex = Array(sim.cfg.n).fill(0);
  s.matchIndex[s.id] = s.log.length;
  log(sim, 'leader', s.id, `${sga(s.id)} ${s.votes.length}표로 과반을 얻어 임기 ${s.term}의 리더가 되었습니다. 곧바로 모두에게 하트비트를 보냅니다.`);
  sim.trace.push({ t: sim.t, s: s.id, kind: 'leader', term: s.term });
  broadcastAppend(sim, s);
  s.hbAt = sim.t + sim.cfg.heartbeat;
}

function startElection(sim: Sim, s: Server) {
  s.role = 'candidate';
  s.term++;
  s.votedFor = s.id;
  s.votes = [s.id];
  s.leader = null;
  resetTimer(sim, s);
  log(sim, 'timeout', s.id, `${sname(s.id)}의 선거 타이머가 끝났습니다. 임기를 ${s.term}${ro(s.term)} 올리고 자기에게 투표한 뒤 모두에게 표를 달라고 요청합니다.`);
  sim.trace.push({ t: sim.t, s: s.id, kind: 'timeout', term: s.term });
  for (let j = 0; j < sim.cfg.n; j++) if (j !== s.id) send(sim, { kind: 'vote', from: s.id, to: j, term: s.term, lastIndex: s.log.length, lastTerm: lastTerm(s) });
}

function advanceCommit(sim: Sim, l: Server) {
  const maj = majority(sim.cfg.n);
  for (let N = l.log.length; N > l.commit; N--) {
    // only an entry from the leader's own term is committed by counting replicas
    if (l.log[N - 1].term !== l.term) break;
    let count = 0;
    for (let j = 0; j < sim.cfg.n; j++) if ((j === l.id ? l.log.length : l.matchIndex[j]) >= N) count++;
    if (count >= maj) {
      const old = l.commit;
      l.commit = N;
      recordCommit(sim, l, old);
      log(sim, 'commit', l.id, `${sname(l.id)}의 항목 ${N}${josa(N, '이', '가')} ${sim.cfg.n}대 중 ${count}대에 복제되어 커밋되었습니다${N - old > 1 ? ` (항목 ${old + 1}부터 ${N}까지 함께)` : ''}. 이제 이 항목은 없어지지 않습니다.`);
      return;
    }
  }
}

function deliver(sim: Sim, m: Msg) {
  const s = sim.servers[m.to];
  if (m.lost || !s.alive || sim.group[m.from] !== sim.group[m.to]) return;
  if (m.term > s.term) {
    const was = s.role;
    s.term = m.term;
    s.votedFor = null;
    s.leader = null;
    if (was !== 'follower') {
      s.role = 'follower';
      if (was === 'leader') {
        resetTimer(sim, s);
        log(sim, 'stepdown', s.id, `${sga(s.id)} 더 높은 임기 ${m.term}의 메시지를 받고 리더에서 물러나 팔로워가 되었습니다.`);
      }
    }
  }
  if (m.kind === 'vote') {
    const upToDate = m.lastTerm! > lastTerm(s) || (m.lastTerm === lastTerm(s) && m.lastIndex! >= s.log.length);
    const granted = m.term === s.term && (s.votedFor === null || s.votedFor === m.from) && upToDate;
    if (granted) {
      s.votedFor = m.from;
      resetTimer(sim, s);
    }
    send(sim, { kind: 'vote-ok', from: s.id, to: m.from, term: s.term, granted });
  } else if (m.kind === 'vote-ok') {
    if (s.role === 'candidate' && m.term === s.term && m.granted && !s.votes.includes(m.from)) {
      s.votes.push(m.from);
      if (s.votes.length >= majority(sim.cfg.n)) becomeLeader(sim, s);
    }
  } else if (m.kind === 'append') {
    if (m.term < s.term) {
      send(sim, { kind: 'append-ok', from: s.id, to: m.from, term: s.term, success: false, prevIndex: m.prevIndex, match: 0 });
      return;
    }
    if (s.role === 'candidate') s.role = 'follower';
    s.leader = m.from;
    resetTimer(sim, s);
    const pi = m.prevIndex!;
    const ok = pi === 0 || (pi <= s.log.length && s.log[pi - 1].term === m.prevTerm);
    if (!ok) {
      send(sim, { kind: 'append-ok', from: s.id, to: m.from, term: s.term, success: false, prevIndex: pi, match: 0 });
      return;
    }
    let idx = pi;
    let cut = 0;
    for (const e of m.entries!) {
      idx++;
      if (idx <= s.log.length) {
        if (s.log[idx - 1].term !== e.term) {
          if (idx <= s.commit) sim.violations.push(`t=${sim.t}: ${sname(s.id)} overwrote committed index ${idx}`);
          cut += s.log.length - idx + 1;
          s.log.length = idx - 1;
          s.log.push({ ...e });
        }
      } else s.log.push({ ...e });
    }
    if (cut) log(sim, 'overwrite', s.id, `${sname(s.id)}의 로그가 리더 ${sname(m.from)}의 로그와 달라서, 커밋되지 않은 항목 ${cut}개를 지우고 리더의 항목으로 덮어썼습니다.`);
    const lastNew = pi + m.entries!.length;
    if (m.leaderCommit! > s.commit) {
      const nc = Math.min(m.leaderCommit!, lastNew);
      if (nc > s.commit) {
        const old = s.commit;
        s.commit = nc;
        recordCommit(sim, s, old);
      }
    }
    send(sim, { kind: 'append-ok', from: s.id, to: m.from, term: s.term, success: true, match: lastNew });
  } else {
    if (s.role !== 'leader' || m.term !== s.term) return;
    if (m.success) {
      s.matchIndex[m.from] = Math.max(s.matchIndex[m.from], m.match!);
      s.nextIndex[m.from] = Math.max(s.nextIndex[m.from], s.matchIndex[m.from] + 1);
      advanceCommit(sim, s);
    } else if (m.prevIndex === s.nextIndex[m.from] - 1 && s.nextIndex[m.from] > 1) {
      s.nextIndex[m.from]--;
      log(sim, 'reject', m.from, `${sga(m.from)} 항목 ${m.prevIndex}에서 로그가 맞지 않는다고 거절했습니다. 리더 ${sname(s.id)}${josa(s.id + 1, '은', '는')} 한 칸 앞(항목 ${s.nextIndex[m.from] - 1})부터 다시 보냅니다.`);
      sendAppend(sim, s, m.from);
    }
  }
}

/** Time of the next thing that happens, or Infinity. */
export function nextTime(sim: Sim): number {
  let te = Infinity;
  for (const m of sim.msgs) if (m.arrive < te) te = m.arrive;
  for (const s of sim.servers) {
    if (!s.alive) continue;
    const d = s.role === 'leader' ? s.hbAt : s.deadline;
    if (d < te) te = d;
  }
  return te;
}

/** Process the single earliest event if it happens no later than `limit`. Returns false otherwise. */
export function stepOnce(sim: Sim, limit: number): boolean {
  let mi = -1;
  for (let i = 0; i < sim.msgs.length; i++) {
    const m = sim.msgs[i];
    if (mi < 0 || m.arrive < sim.msgs[mi].arrive || (m.arrive === sim.msgs[mi].arrive && m.id < sim.msgs[mi].id)) mi = i;
  }
  let si = -1;
  let st = Infinity;
  for (const s of sim.servers) {
    if (!s.alive) continue;
    const d = s.role === 'leader' ? s.hbAt : s.deadline;
    if (d < st) {
      st = d;
      si = s.id;
    }
  }
  const mt = mi >= 0 ? sim.msgs[mi].arrive : Infinity;
  const te = Math.min(mt, st);
  if (te > limit || te === Infinity) return false;
  sim.t = Math.max(sim.t, te);
  if (mt <= st) {
    const [m] = sim.msgs.splice(mi, 1);
    deliver(sim, m);
  } else {
    const s = sim.servers[si];
    if (s.role === 'leader') {
      broadcastAppend(sim, s);
      s.hbAt += sim.cfg.heartbeat;
    } else startElection(sim, s);
  }
  return true;
}

/** Run until time `until`. */
export function advance(sim: Sim, until: number) {
  let guard = 0;
  while (stepOnce(sim, until) && guard++ < 200000);
  sim.t = Math.max(sim.t, until);
}

/** Run until the next logged event, at most `maxDt` ms. Returns true if one happened. */
export function advanceToEvent(sim: Sim, maxDt = 3000): boolean {
  const k = sim.evCount;
  const limit = sim.t + maxDt;
  let guard = 0;
  while (sim.evCount === k && guard++ < 200000) {
    if (!stepOnce(sim, limit)) {
      sim.t = limit;
      return false;
    }
  }
  return sim.evCount > k;
}

/* ─────────────── actions the reader can take ─────────────── */

/** The leader a client would talk to: the alive leader with the highest term. */
export function currentLeader(sim: Sim): Server | null {
  let best: Server | null = null;
  for (const s of sim.servers) if (s.alive && s.role === 'leader' && (!best || s.term > best.term)) best = s;
  return best;
}

/** A client sends a command. To `target` if given, else to the current leader. */
export function clientRequest(sim: Sim, target?: number): boolean {
  const l = target !== undefined ? sim.servers[target] : currentLeader(sim);
  if (!l || !l.alive || l.role !== 'leader') {
    log(sim, 'noleader', -1, '지금은 리더가 없어서 명령을 받아 줄 서버가 없습니다. 클라이언트는 잠시 뒤 다시 시도해야 합니다.');
    return false;
  }
  sim.cmdNo++;
  const cmd = String.fromCharCode(97 + ((sim.cmdNo - 1) % 26));
  l.log.push({ term: l.term, cmd });
  l.matchIndex[l.id] = l.log.length;
  log(sim, 'client', l.id, `클라이언트가 명령 ${cmd}${cmdReul(cmd)} 보냈습니다. 리더 ${sga(l.id)} 로그의 항목 ${l.log.length}(임기 ${l.term})에 적고 팔로워들에게 복제를 요청합니다. 아직 커밋되지 않았습니다.`);
  broadcastAppend(sim, l);
  return true;
}

export function crash(sim: Sim, i: number) {
  const s = sim.servers[i];
  if (!s.alive) return;
  s.alive = false;
  s.votes = [];
  log(sim, 'crash', i, `${s.role === 'leader' ? `리더 ${sga(i)}` : sga(i)} 꺼졌습니다. 임기, 투표, 로그는 디스크에 남아 있습니다.`);
}

export function restart(sim: Sim, i: number) {
  const s = sim.servers[i];
  if (s.alive) return;
  s.alive = true;
  s.role = 'follower';
  s.votes = [];
  s.leader = null;
  resetTimer(sim, s);
  log(sim, 'restart', i, `${sga(i)} 다시 켜졌습니다. 디스크의 로그를 읽고 팔로워로 시작합니다.`);
}

/** Split the network: `side` lists the servers on one side, everyone else is on the other. */
export function partition(sim: Sim, side: number[]) {
  sim.group = sim.servers.map((s) => (side.includes(s.id) ? 1 : 0));
  const rest = sim.servers.filter((s) => !side.includes(s.id)).map((s) => s.id);
  const list = (ids: number[]) => ids.map(sname).join(', ');
  const last = rest.length ? rest[rest.length - 1] : side[side.length - 1];
  log(sim, 'partition', -1, `네트워크가 끊겼습니다. 한쪽에는 ${list(side)}, 다른 쪽에는 ${list(rest)}${josa(last + 1, '이', '가')} 있고, 두 무리 사이의 메시지는 모두 사라집니다.`);
}

export function heal(sim: Sim) {
  if (sim.group.every((g) => g === 0)) return;
  sim.group = sim.servers.map(() => 0);
  log(sim, 'heal', -1, '네트워크가 다시 이어졌습니다.');
}

export const partitioned = (sim: Sim) => sim.group.some((g) => g !== sim.group[0]);

/* ─────────────── measurements ─────────────── */

/** One election from a cold start: when the first leader appears and how many terms it took. */
export function electionTrial(cfg: Cfg, seed: number, maxT = 4000): { time: number | null; terms: number; sim: Sim } {
  const sim = createSim(cfg, seed);
  let guard = 0;
  while (!sim.servers.some((s) => s.role === 'leader') && guard++ < 200000) {
    if (!stepOnce(sim, maxT)) break;
  }
  const l = sim.servers.find((s) => s.role === 'leader');
  return { time: l ? sim.t : null, terms: Math.max(...sim.servers.map((s) => s.term)), sim };
}

export interface ElectionStats {
  mean: number | null;
  p95: number | null;
  failed: number;
  /** Trials that needed more than one term (a split vote happened). */
  split: number;
  runs: number;
  times: number[];
}

export function electionStats(cfg: Cfg, runs: number, seed0 = 1000, maxT = 4000): ElectionStats {
  const times: number[] = [];
  let failed = 0;
  let split = 0;
  for (let k = 0; k < runs; k++) {
    const r = electionTrial(cfg, seed0 + k, maxT);
    if (r.time === null) failed++;
    else {
      times.push(r.time);
      if (r.terms > 1) split++;
    }
  }
  const sorted = [...times].sort((a, b) => a - b);
  return {
    mean: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    p95: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : null,
    failed,
    split,
    runs,
    times,
  };
}

/* ─────────────── snapshots for scripted scenarios ─────────────── */

export interface Snap {
  t: number;
  servers: { alive: boolean; role: Role; term: number; log: Entry[]; commit: number }[];
  group: number[];
  note: string;
  kind: EvKind | 'start';
}

export function snap(sim: Sim, note: string, kind: Snap['kind']): Snap {
  return {
    t: sim.t,
    servers: sim.servers.map((s) => ({ alive: s.alive, role: s.role, term: s.term, log: s.log.map((e) => ({ ...e })), commit: s.commit })),
    group: [...sim.group],
    note,
    kind,
  };
}

/**
 * The partition story of figure 3: a leader ends up on the minority side, keeps taking commands
 * it can never commit, the majority elects a new leader and commits, and healing the network
 * overwrites the old leader's entries. Returns one snapshot per logged event.
 */
export function partitionStory(seed = 5): Snap[] {
  const sim = createSim(DEFAULT_CFG, seed);
  const out: Snap[] = [snap(sim, '다섯 대가 모두 팔로워로 시작합니다. 로그는 비어 있습니다.', 'start')];
  let seen = 0;
  // one snapshot per step; events logged by the same step share it
  const flush = () => {
    const fresh = sim.events.slice(sim.events.length - (sim.evCount - seen));
    seen = sim.evCount;
    if (fresh.length) out.push(snap(sim, fresh.map((e) => e.text).join(' '), fresh[fresh.length - 1].kind));
  };
  const runUntil = (pred: () => boolean, maxDt = 3000) => {
    const limit = sim.t + maxDt;
    let guard = 0;
    while (!pred() && guard++ < 200000) {
      const k = sim.evCount;
      if (!stepOnce(sim, limit)) break;
      if (sim.evCount > k) flush();
    }
  };
  const settle = (dt: number) => {
    const limit = sim.t + dt;
    let guard = 0;
    while (guard++ < 200000) {
      const k = sim.evCount;
      if (!stepOnce(sim, limit)) break;
      if (sim.evCount > k) flush();
    }
    sim.t = limit;
  };
  runUntil(() => currentLeader(sim) !== null);
  settle(30);
  const l1 = currentLeader(sim)!.id;
  clientRequest(sim);
  flush();
  settle(60);
  clientRequest(sim);
  flush();
  settle(80);
  // old leader and one follower on the small side
  const other = (l1 + 1) % 5;
  partition(sim, [l1, other]);
  flush();
  settle(20);
  clientRequest(sim, l1);
  flush();
  settle(40);
  clientRequest(sim, l1);
  flush();
  // the majority side times out and elects someone
  runUntil(() => sim.servers.some((s) => s.role === 'leader' && s.id !== l1 && s.term > sim.servers[l1].term));
  settle(30);
  const l2 = sim.servers.find((s) => s.role === 'leader' && s.id !== l1 && s.term > sim.servers[l1].term)!.id;
  clientRequest(sim, l2);
  flush();
  settle(50);
  clientRequest(sim, l2);
  flush();
  settle(80);
  heal(sim);
  flush();
  settle(200);
  out.push(snap(sim, `모든 서버의 로그가 같아졌습니다. 소수 쪽에서 받은 명령은 커밋된 적이 없으므로 지워져도 약속을 어긴 것이 아닙니다. 그 클라이언트는 응답을 받지 못했으니 다시 보내야 합니다.`, 'start'));
  return out;
}
