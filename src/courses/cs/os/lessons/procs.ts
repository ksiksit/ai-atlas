/* 운영체제: process life cycle, CPU scheduling and MLFQ simulations (tick based, deterministic). */

import type { Palette } from '../../../../lib/theme';

/* ───────── colours shared by every figure that shows processes ───────── */

export const PROC_CSS = ['var(--neg)', 'var(--pos)', 'var(--good)', 'var(--c-stats-2)', 'var(--bad)', 'var(--c-stats-1)'];
export const procColor = (P: Palette, i: number) => [P.neg, P.pos, P.good, P.stats2, P.bad, P.stats1][i % 6];
export const PROC_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];

/* ───────── 1. process states ───────── */

export type PState = 'new' | 'ready' | 'running' | 'waiting' | 'done';
export const STATE_KO: Record<PState, string> = { new: '생성', ready: '준비', running: '실행', waiting: '대기', done: '종료' };

/** `bursts` alternates CPU and I/O work, starting and ending with CPU: [cpu, io, cpu, io, cpu]. */
export interface ProcSpec {
  name: string;
  arrive: number;
  bursts: number[];
}
export interface Trans {
  p: number;
  from: PState;
  to: PState;
}
export interface ProcFrame {
  t: number;
  /** state during tick t (null: not created yet) */
  states: (PState | null)[];
  /** process on the CPU during tick t, -1 when idle */
  running: number;
  ready: number[];
  /** transitions at the boundary just before tick t */
  trans: Trans[];
  /** CPU-busy ticks so far, including this one */
  busy: number;
  /** time left in each process's current burst, before tick t runs */
  left: number[];
}

/**
 * One CPU, round robin with `quantum`. With `multiprog` off the CPU belongs to one process
 * until it ends, even while that process waits for I/O (an old batch system).
 */
export function runProcs(specs: ProcSpec[], quantum: number, multiprog: boolean, maxT = 400): ProcFrame[] {
  const n = specs.length;
  const st: (PState | null)[] = Array(n).fill(null);
  const bi = Array(n).fill(0);
  const left = specs.map((s) => s.bursts[0]);
  const queue: number[] = [];
  let run = -1;
  let slice = 0;
  let owner = -1;
  let busy = 0;
  const frames: ProcFrame[] = [];
  for (let t = 0; t < maxT; t++) {
    const trans: Trans[] = [];
    const move = (p: number, to: PState) => {
      trans.push({ p, from: st[p] as PState, to });
      st[p] = to;
    };
    // I/O finished during the last tick
    for (let p = 0; p < n; p++) {
      if (st[p] === 'waiting' && left[p] === 0) {
        bi[p]++;
        left[p] = specs[p].bursts[bi[p]];
        move(p, 'ready');
        queue.push(p);
      }
    }
    // admitted after one tick in "new"
    for (let p = 0; p < n; p++) {
      if (st[p] === 'new') {
        move(p, 'ready');
        queue.push(p);
      }
    }
    for (let p = 0; p < n; p++) if (st[p] === null && specs[p].arrive === t) st[p] = 'new';
    // the running process: burst over, or time slice used up
    if (run >= 0) {
      if (left[run] === 0) {
        bi[run]++;
        if (bi[run] >= specs[run].bursts.length) {
          move(run, 'done');
          if (owner === run) owner = -1;
        } else {
          left[run] = specs[run].bursts[bi[run]];
          move(run, 'waiting');
        }
        run = -1;
      } else if (multiprog && slice >= quantum) {
        if (queue.length) {
          move(run, 'ready');
          queue.push(run);
          run = -1;
        } else slice = 0; // nobody else wants the CPU: a fresh slice
      }
    }
    if (run < 0) {
      let pick = -1;
      if (multiprog) pick = queue.length ? queue[0] : -1;
      else if (owner >= 0) pick = queue.includes(owner) ? owner : -1;
      else pick = queue.length ? queue[0] : -1;
      if (pick >= 0) {
        queue.splice(queue.indexOf(pick), 1);
        run = pick;
        if (!multiprog) owner = pick;
        move(run, 'running');
        slice = 0;
      }
    }
    const before = [...left];
    if (run >= 0) {
      left[run]--;
      slice++;
      busy++;
    }
    for (let p = 0; p < n; p++) if (st[p] === 'waiting') left[p]--;
    frames.push({ t, states: [...st], running: run, ready: [...queue], trans, busy, left: before });
    if (st.every((s) => s === 'done')) break;
  }
  return frames;
}

/* ───────── 2. classic CPU schedulers ───────── */

export interface Job {
  arrive: number;
  burst: number;
}
export type Algo = 'fcfs' | 'sjf' | 'srtf' | 'rr';
export const ALGO_NAMES: Record<Algo, string> = { fcfs: 'FCFS', sjf: 'SJF', srtf: 'SRTF', rr: '라운드 로빈' };
export interface Slice {
  job: number; // -1: idle
  start: number;
  end: number;
}
export interface SchedResult {
  slices: Slice[];
  finish: number[];
  firstRun: number[];
  switches: number;
  end: number;
  /** jobs waiting in the ready queue during each tick (not the one running) */
  queues: number[][];
}

export function schedule(jobs: Job[], algo: Algo, quantum = 2): SchedResult {
  const n = jobs.length;
  const rem = jobs.map((j) => j.burst);
  const finish = Array(n).fill(-1);
  const firstRun = Array(n).fill(-1);
  const arrived = Array(n).fill(false);
  const queue: number[] = []; // arrival order (FCFS, RR)
  const ticks: number[] = [];
  const queues: number[][] = [];
  let run = -1;
  let slice = 0;
  let done = 0;
  // jobs that arrive at the same tick join in table order
  const order = jobs.map((_, i) => i).sort((a, b) => jobs[a].arrive - jobs[b].arrive || a - b);
  for (let t = 0; done < n && t < 2000; t++) {
    for (const i of order) {
      if (!arrived[i] && jobs[i].arrive <= t) {
        arrived[i] = true;
        if (jobs[i].burst === 0) {
          finish[i] = firstRun[i] = t;
          done++;
        } else queue.push(i);
      }
    }
    if (run >= 0 && rem[run] === 0) {
      finish[run] = t;
      done++;
      run = -1;
    }
    if (done >= n) break;
    if (algo === 'rr' && run >= 0 && slice >= quantum && queue.length) {
      queue.push(run);
      run = -1;
    }
    if (algo === 'srtf' && run >= 0) {
      // preempt when someone waiting needs strictly less time
      const best = queue.reduce((b, i) => (b < 0 || rem[i] < rem[b] ? i : b), -1);
      if (best >= 0 && rem[best] < rem[run]) {
        queue.push(run);
        run = -1;
      }
    }
    if (run < 0 && queue.length) {
      let k = 0;
      if (algo === 'sjf' || algo === 'srtf') {
        const key = (i: number) => (algo === 'sjf' ? jobs[i].burst : rem[i]);
        for (let q = 1; q < queue.length; q++) {
          const a = queue[q];
          const b = queue[k];
          if (key(a) < key(b) || (key(a) === key(b) && (jobs[a].arrive < jobs[b].arrive || (jobs[a].arrive === jobs[b].arrive && a < b)))) k = q;
        }
      }
      run = queue.splice(k, 1)[0];
      slice = 0;
      if (firstRun[run] < 0) firstRun[run] = t;
    }
    ticks.push(run);
    queues.push([...queue]);
    if (run >= 0) {
      rem[run]--;
      slice++;
    }
  }
  const slices: Slice[] = [];
  ticks.forEach((j, t) => {
    const last = slices[slices.length - 1];
    if (last && last.job === j) last.end = t + 1;
    else slices.push({ job: j, start: t, end: t + 1 });
  });
  let switches = 0;
  let prev = -1;
  for (const s of slices) {
    if (s.job < 0) continue;
    if (prev >= 0 && s.job !== prev) switches++;
    prev = s.job;
  }
  return { slices, finish, firstRun, switches, end: ticks.length, queues };
}

export interface Metrics {
  wait: number[];
  turnaround: number[];
  response: number[];
  avgWait: number;
  avgTurn: number;
  avgResp: number;
}
export function metrics(jobs: Job[], r: SchedResult): Metrics {
  const turnaround = jobs.map((j, i) => r.finish[i] - j.arrive);
  const wait = jobs.map((j, i) => turnaround[i] - j.burst);
  const response = jobs.map((j, i) => r.firstRun[i] - j.arrive);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  return { wait, turnaround, response, avgWait: avg(wait), avgTurn: avg(turnaround), avgResp: avg(response) };
}

/* ───────── 3. multi-level feedback queue ───────── */

export interface MlfqJob {
  name: string;
  arrive: number;
  /** cpu, io, cpu, io, …, cpu */
  bursts: number[];
}
export interface MlfqOpts {
  quanta: number[];
  /** move every job back to the top queue every `boost` ticks (0: never) */
  boost: number;
  /** count the CPU a job used at a level over many turns, so giving up the CPU early does not reset it */
  allotment: boolean;
}
export interface MlfqFrame {
  t: number;
  running: number;
  /** queue level of each job during tick t */
  level: number[];
  queues: number[][];
  state: ('none' | 'ready' | 'running' | 'waiting' | 'done')[];
  /** CPU ticks each job received so far, including this one */
  got: number[];
  event: string;
  boosted: boolean;
}

export function runMlfq(jobs: MlfqJob[], o: MlfqOpts, maxT: number): MlfqFrame[] {
  const n = jobs.length;
  const L = o.quanta.length;
  const allot = o.quanta.map((q) => q * 2); // with allotment: CPU a job may use at a level, over all its turns
  const level = Array(n).fill(0);
  const slice = Array(n).fill(0); // CPU used of the current time slice (kept across preemption)
  const atLevel = Array(n).fill(0); // CPU used since the job reached its level
  const bi = Array(n).fill(0);
  const left = jobs.map((j) => j.bursts[0]);
  const state: MlfqFrame['state'] = Array(n).fill('none');
  const got = Array(n).fill(0);
  const queues: number[][] = Array.from({ length: L }, () => []);
  let run = -1;
  const frames: MlfqFrame[] = [];
  const name = (i: number) => jobs[i].name;
  const demote = (i: number, why: string, ev: string[]) => {
    if (level[i] >= L - 1) return false;
    level[i]++;
    atLevel[i] = 0;
    ev.push(`${name(i)} ${why} → Q${level[i]}`);
    return true;
  };
  for (let t = 0; t < maxT; t++) {
    const ev: string[] = [];
    let boosted = false;
    for (let i = 0; i < n; i++) {
      if (state[i] === 'waiting' && left[i] === 0) {
        bi[i]++;
        left[i] = jobs[i].bursts[bi[i]];
        state[i] = 'ready';
        queues[level[i]].push(i);
      }
      if (state[i] === 'none' && jobs[i].arrive === t) {
        state[i] = 'ready';
        queues[0].push(i);
        ev.push(`${name(i)} 도착 → Q0`);
      }
    }
    if (run >= 0) {
      const r = run;
      if (left[r] === 0) {
        bi[r]++;
        if (bi[r] >= jobs[r].bursts.length) {
          state[r] = 'done';
          ev.push(`${name(r)} 끝`);
        } else {
          left[r] = jobs[r].bursts[bi[r]];
          state[r] = 'waiting';
          slice[r] = 0;
          // giving up the CPU early keeps the level, unless the allotment has run out
          if (!(o.allotment && atLevel[r] >= allot[level[r]] && demote(r, '할당량 소진', ev))) ev.push(`${name(r)} 입출력 대기 (Q${level[r]} 유지)`);
        }
        run = -1;
      } else if (slice[r] >= o.quanta[level[r]]) {
        if (!o.allotment || atLevel[r] >= allot[level[r]]) demote(r, o.allotment ? '할당량 소진' : '타임 슬라이스 다 씀', ev);
        slice[r] = 0;
        state[r] = 'ready';
        queues[level[r]].push(r);
        run = -1;
      }
    }
    if (o.boost > 0 && t > 0 && t % o.boost === 0) {
      boosted = true;
      for (let i = 0; i < n; i++) {
        level[i] = 0;
        atLevel[i] = 0;
        slice[i] = 0;
      }
      const all = queues.flat();
      queues.forEach((q) => (q.length = 0));
      queues[0].push(...all);
      if (run >= 0) {
        state[run] = 'ready';
        queues[0].push(run);
        run = -1;
      }
      ev.push('우선순위 올리기: 모두 Q0');
    }
    // a job waiting in a higher queue preempts the running one
    const top = queues.findIndex((q) => q.length > 0);
    if (run >= 0 && top >= 0 && top < level[run]) {
      state[run] = 'ready';
      queues[level[run]].unshift(run);
      ev.push(`${name(queues[top][0])}(Q${top})가 ${name(run)}(Q${level[run]})를 밀어냄`);
      run = -1;
    }
    if (run < 0) {
      const q = queues.findIndex((qq) => qq.length > 0);
      if (q >= 0) {
        // a job that was preempted keeps what it already used of its slice
        run = queues[q].shift()!;
        state[run] = 'running';
      }
    }
    if (run >= 0) {
      left[run]--;
      slice[run]++;
      atLevel[run]++;
      got[run]++;
    }
    for (let i = 0; i < n; i++) if (state[i] === 'waiting') left[i]--;
    frames.push({ t, running: run, level: [...level], queues: queues.map((q) => [...q]), state: [...state], got: [...got], event: ev.join(' · '), boosted });
    if (state.every((s) => s === 'done')) break;
  }
  return frames;
}
