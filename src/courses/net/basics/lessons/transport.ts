/* 믿을 수 있는 전달: pure models behind the TCP and congestion-control lessons. */
import { rng } from '../../../../lib/math';

/* ─────────────── TCP connection: a fixed ladder of messages ─────────────── */

export type Side = 'c' | 's';

export interface LadderMsg {
  from: Side;
  /** Send time, in one-way delays. The message arrives one delay later. */
  t: number;
  flags: string;
  seq: number;
  /** Acknowledgement number, if the ACK flag is set. */
  ack?: number;
  /** Payload bytes. */
  len: number;
  /** States after this message has arrived. */
  cState: string;
  sState: string;
  note: string;
}

/** Initial sequence numbers. Real ones are random 32-bit numbers; these are small for reading. */
export const ISN_C = 3000;
export const ISN_S = 7000;

export const LADDER: LadderMsg[] = [
  { from: 'c', t: 0, flags: 'SYN', seq: ISN_C, len: 0, cState: 'SYN_SENT', sState: 'SYN_RCVD', note: `클라이언트가 SYN을 보냅니다. "연결하고 싶습니다. 제 바이트 번호는 ${ISN_C}에서 시작합니다." SYN 자체가 번호 하나를 차지하므로, 첫 데이터 바이트는 ${ISN_C + 1}번이 됩니다.` },
  { from: 's', t: 1, flags: 'SYN ACK', seq: ISN_S, ack: ISN_C + 1, len: 0, cState: 'ESTABLISHED', sState: 'SYN_RCVD', note: `서버가 SYN과 ACK를 한 세그먼트에 담아 답합니다. ack=${ISN_C + 1}은 "${ISN_C}번까지 받았으니 다음엔 ${ISN_C + 1}번을 주세요"라는 뜻이고, 서버도 자기 번호를 ${ISN_S}부터 시작한다고 알립니다.` },
  { from: 'c', t: 2, flags: 'ACK', seq: ISN_C + 1, ack: ISN_S + 1, len: 0, cState: 'ESTABLISHED', sState: 'ESTABLISHED', note: `클라이언트가 서버의 SYN을 확인합니다. 세 번의 메시지로 양쪽이 서로의 시작 번호를 확인했고, 이제 연결이 열렸습니다. 여기까지 1.5 왕복이 걸렸습니다.` },
  { from: 'c', t: 2.4, flags: 'PSH ACK', seq: ISN_C + 1, ack: ISN_S + 1, len: 100, cState: 'ESTABLISHED', sState: 'ESTABLISHED', note: `클라이언트가 요청 100바이트(${ISN_C + 1}~${ISN_C + 100}번)를 보냅니다. 세 번째 ACK를 보내자마자 바로 데이터를 보낼 수 있으므로, 요청이 서버에 닿기까지는 연결 시작부터 1.5 왕복입니다.` },
  { from: 's', t: 3.4, flags: 'ACK', seq: ISN_S + 1, ack: ISN_C + 101, len: 1000, cState: 'ESTABLISHED', sState: 'ESTABLISHED', note: `서버가 응답의 앞 1,000바이트(${ISN_S + 1}~${ISN_S + 1000}번)를 보내면서, ack=${ISN_C + 101}로 요청을 다 받았다는 확인도 함께 실어 보냅니다(피기배킹).` },
  { from: 's', t: 3.8, flags: 'ACK', seq: ISN_S + 1001, ack: ISN_C + 101, len: 1000, cState: 'ESTABLISHED', sState: 'ESTABLISHED', note: `ACK를 기다리지 않고 다음 1,000바이트(${ISN_S + 1001}~${ISN_S + 2000}번)를 이어서 보냅니다. 확인을 기다리지 않고 여러 세그먼트를 띄워 보내는 것이 뒤에서 볼 슬라이딩 윈도입니다.` },
  { from: 'c', t: 4.8, flags: 'ACK', seq: ISN_C + 101, ack: ISN_S + 2001, len: 0, cState: 'ESTABLISHED', sState: 'ESTABLISHED', note: `클라이언트가 ack=${ISN_S + 2001} 하나로 두 세그먼트를 한꺼번에 확인합니다. ACK 번호는 "여기 앞까지는 빠짐없이 받았다"는 누적 확인이기 때문입니다.` },
  { from: 'c', t: 5.2, flags: 'FIN ACK', seq: ISN_C + 101, ack: ISN_S + 2001, len: 0, cState: 'FIN_WAIT_1', sState: 'CLOSE_WAIT', note: `클라이언트는 더 보낼 것이 없어 FIN을 보냅니다. "제 쪽 방향은 끝났습니다." FIN도 SYN처럼 번호 하나를 차지합니다.` },
  { from: 's', t: 6.2, flags: 'ACK', seq: ISN_S + 2001, ack: ISN_C + 102, len: 0, cState: 'FIN_WAIT_2', sState: 'CLOSE_WAIT', note: `서버가 FIN을 확인합니다. 클라이언트→서버 방향은 닫혔지만, 서버→클라이언트 방향은 아직 열려 있어 서버는 남은 데이터를 더 보낼 수 있습니다.` },
  { from: 's', t: 6.6, flags: 'FIN ACK', seq: ISN_S + 2001, ack: ISN_C + 102, len: 0, cState: 'TIME_WAIT', sState: 'LAST_ACK', note: `서버도 다 보냈으므로 자기 FIN을 보냅니다.` },
  { from: 'c', t: 7.6, flags: 'ACK', seq: ISN_C + 102, ack: ISN_S + 2002, len: 0, cState: 'TIME_WAIT', sState: 'CLOSED', note: `클라이언트가 마지막 ACK를 보내면 서버는 연결을 닫습니다. 클라이언트는 이 ACK가 사라졌을 경우를 대비해 TIME_WAIT 상태로 한동안(세그먼트 최대 수명의 두 배) 기다린 뒤 닫습니다.` },
];

/* ─────────────── Sliding window on a lossy link ─────────────── */

export const SW_SEGS = 16;
export const SW_DELAY = 5; // one-way delay in ticks; one tick = time to put one segment on the wire
export const SW_RTO = 18; // retransmission timeout in ticks (a bit more than one RTT of 10)

export interface Flight {
  kind: 'data' | 'ack';
  /** Data: segment number. ACK: next segment expected (cumulative). */
  n: number;
  sent: number;
  lost: boolean;
  retx: boolean;
  dup: boolean;
}

export interface SwFrame {
  t: number;
  base: number; // oldest unacknowledged segment
  next: number; // next new segment to send
  received: boolean[];
  expected: number; // receiver's next in-order segment
  flights: Flight[]; // in the air (or lost within the last few ticks)
  sentOnce: boolean[];
  sent: number;
  retx: number;
  fast: number;
  timeouts: number;
  dupAcks: number;
  done: boolean;
  note: string;
}

/**
 * Tick-by-tick simulation of a TCP-like sender with a fixed window of `w` segments:
 * cumulative ACKs, a receiver that buffers out-of-order segments, fast retransmit on the
 * third duplicate ACK and a single retransmission timer. Only data segments get lost:
 * the first transmission of each segment in `drops`, and every transmission with probability `p`.
 */
export function slidingWindow(w: number, p: number, drops: Set<number>, seed: number): SwFrame[] {
  const r = rng(seed);
  const received = Array(SW_SEGS).fill(false);
  const sentOnce = Array(SW_SEGS).fill(false);
  let base = 0;
  let next = 0;
  let expected = 0;
  let dup = 0;
  let fastDone = -1; // base value for which fast retransmit already fired
  let timer = -1; // start tick of the retransmission timer, -1 when stopped
  let pendingRetx = -1;
  let sent = 0;
  let retx = 0;
  let fast = 0;
  let timeouts = 0;
  let dupAcks = 0;
  const air: Flight[] = [];
  const frames: SwFrame[] = [];
  const snap = (t: number, note: string, done = false) =>
    frames.push({
      t,
      base,
      next,
      received: [...received],
      expected,
      flights: air.filter((f) => t - f.sent <= SW_DELAY + (f.lost ? 1 : 0)).map((f) => ({ ...f })),
      sentOnce: [...sentOnce],
      sent,
      retx,
      fast,
      timeouts,
      dupAcks,
      done,
      note,
    });

  snap(0, `보낼 세그먼트 ${SW_SEGS}개. 창 크기는 ${w}개입니다.`);
  for (let t = 1; t < 400; t++) {
    const notes: string[] = [];
    // 1. data reaching the receiver
    for (const f of air) {
      if (f.kind !== 'data' || f.lost || f.sent + SW_DELAY !== t) continue;
      const wasNew = !received[f.n];
      received[f.n] = true;
      const before = expected;
      while (expected < SW_SEGS && received[expected]) expected++;
      const isDup = expected === before;
      air.push({ kind: 'ack', n: expected, sent: t, lost: false, retx: false, dup: isDup });
      if (!wasNew) notes.push(`받는 쪽: ${f.n}번은 이미 받았습니다. 같은 ACK를 다시 보냅니다(ACK ${expected}).`);
      else if (isDup) notes.push(`받는 쪽: ${f.n}번이 순서를 앞질러 왔습니다. 보관해 두고, 아직 ${expected}번을 기다린다는 뜻으로 같은 ACK를 또 보냅니다(ACK ${expected}).`);
      else if (expected - before > 1) notes.push(`받는 쪽: ${f.n}번이 빈자리를 채워, 보관해 둔 것까지 ${before}~${expected - 1}번을 한꺼번에 넘깁니다. ACK ${expected}.`);
      else notes.push(`받는 쪽: ${f.n}번 도착, ACK ${expected}.`);
    }
    // 2. ACKs reaching the sender
    for (const f of air) {
      if (f.kind !== 'ack' || f.sent + SW_DELAY !== t) continue;
      if (f.n > base) {
        notes.push(`보내는 쪽: ACK ${f.n} 도착. ${f.n - 1}번까지 확인되어 창이 ${f.n}~${Math.min(f.n + w, SW_SEGS) - 1}번으로 밀립니다.`);
        base = f.n;
        dup = 0;
        timer = base < next ? t : -1;
        if (pendingRetx >= 0 && pendingRetx < base) pendingRetx = -1;
      } else if (f.n === base && base < next) {
        dup++;
        dupAcks++;
        if (dup < 3) notes.push(`보내는 쪽: ${dup === 1 ? "첫" : "두"} 번째 중복 ACK(ACK ${base}).`);
        if (dup === 3 && fastDone !== base) {
          fastDone = base;
          pendingRetx = base;
          fast++;
          notes.push(`보내는 쪽: 중복 ACK가 세 번째로 왔습니다(ACK ${base}). ${base}번이 사라졌다고 보고 타이머를 기다리지 않고 다시 보냅니다. 빠른 재전송입니다.`);
        }
      }
    }
    if (base >= SW_SEGS) {
      snap(t, `모든 세그먼트가 확인되었습니다. 걸린 시간 ${t}틱.`, true);
      break;
    }
    // 3. retransmission timer
    if (timer >= 0 && t - timer >= SW_RTO && pendingRetx < 0) {
      pendingRetx = base;
      timeouts++;
      dup = 0;
      timer = t;
      notes.push(`보내는 쪽: ${base}번의 ACK가 ${SW_RTO}틱 동안 오지 않았습니다. 시간 초과로 ${base}번을 다시 보냅니다.`);
    }
    // 4. send at most one segment this tick
    let n = -1;
    let isRetx = false;
    if (pendingRetx >= 0) {
      n = pendingRetx;
      isRetx = true;
      pendingRetx = -1;
    } else if (next < Math.min(base + w, SW_SEGS)) {
      n = next++;
    }
    if (n >= 0) {
      const first = !sentOnce[n];
      sentOnce[n] = true;
      const lost = (first && drops.has(n)) || r() < p;
      air.push({ kind: 'data', n, sent: t, lost, retx: isRetx, dup: false });
      sent++;
      if (isRetx) retx++;
      if (timer < 0 || isRetx) timer = t; // a retransmission restarts the timer
      if (!isRetx) notes.push(`${n}번을 보냅니다.`);
      if (lost) notes.push(`${n}번 세그먼트가 도중에 사라집니다.`);
    } else if (!notes.length && next >= base + w && next < SW_SEGS) {
      notes.push(`보내는 쪽: 창이 꽉 찼습니다(${base}~${base + w - 1}번이 모두 확인 대기 중). ACK가 와야 더 보낼 수 있습니다.`);
    }
    snap(t, notes.join(' ') || '패킷이 오가는 중입니다.');
  }
  return frames;
}

/* ─────────────── Throughput vs window ─────────────── */

export const MSS = 1460;

/** Bits per second a window of `wBytes` allows over `rttMs`, capped by the link rate. */
export const windowThroughput = (wBytes: number, rttMs: number, linkBps: number) => Math.min((wBytes * 8) / (rttMs / 1000), linkBps);

/* ─────────────── Congestion window (per-RTT model) ─────────────── */

export type LossReact = 'reno' | 'tahoe';

export interface CwndRound {
  cwnd: number;
  ssthresh: number;
  slowStart: boolean;
  loss: boolean;
  /** Packets waiting in the bottleneck buffer during this round. */
  queue: number;
  /** Round-trip time in units of the base RTT. */
  rtt: number;
  /** Fraction of the link used. */
  util: number;
}

/**
 * One flow through a bottleneck that carries `cap` packets per base RTT and buffers `buf` more.
 * A round sends cwnd packets; if they exceed cap + buf, some are dropped and the flow reacts once:
 * Reno halves cwnd, Tahoe (a timeout) restarts from 1 with ssthresh at half.
 * Slow start doubles cwnd each round up to ssthresh, then congestion avoidance adds 1 per round.
 */
export function cwndTrace(cap: number, buf: number, react: LossReact, rounds: number, iw = 1): CwndRound[] {
  const out: CwndRound[] = [];
  let cwnd = iw;
  let ssthresh = Infinity;
  for (let i = 0; i < rounds; i++) {
    const slowStart = cwnd < ssthresh;
    const inFlight = Math.min(cwnd, cap + buf);
    const queue = Math.max(0, inFlight - cap);
    const loss = cwnd > cap + buf;
    out.push({ cwnd, ssthresh, slowStart, loss, queue, rtt: 1 + queue / cap, util: Math.min(1, cwnd / cap) });
    if (loss) {
      ssthresh = Math.max(2, Math.floor(cwnd / 2));
      cwnd = react === 'reno' ? ssthresh : 1;
    } else if (slowStart) {
      cwnd = Math.min(cwnd * 2, ssthresh === Infinity ? cwnd * 2 : Math.max(ssthresh, cwnd + 1));
    } else {
      cwnd += 1;
    }
  }
  return out;
}

/** Long-run averages of a Reno flow, skipping the start-up. */
export function steadyState(cap: number, buf: number, rounds = 1200, skip = 200) {
  const tr = cwndTrace(cap, buf, 'reno', rounds).slice(skip);
  const n = tr.length;
  const util = tr.reduce((a, r) => a + r.util, 0) / n;
  const rtt = tr.reduce((a, r) => a + r.rtt, 0) / n;
  const losses = tr.filter((r) => r.loss).length;
  return { util, rtt, lossRounds: losses / n };
}

/* ─────────────── Two flows: Chiu–Jain phase plot ─────────────── */

export type Rule = 'aimd' | 'aiad' | 'mimd' | 'miad';
export const RULE_NAMES: Record<Rule, string> = { aimd: 'AIMD', aiad: 'AIAD', mimd: 'MIMD', miad: 'MIAD' };

const ADD = 0.04; // additive step, as a fraction of the link
const MUL_UP = 1.12;
const MUL_DOWN = 0.5;

/**
 * Two flows sharing a link of capacity 1. Every round both see the same signal:
 * over capacity → both decrease, otherwise both increase, by the chosen rule.
 */
export function phaseTrace(rule: Rule, x1: number, x2: number, steps: number): [number, number][] {
  const pts: [number, number][] = [[x1, x2]];
  for (let i = 0; i < steps; i++) {
    const over = x1 + x2 > 1;
    const up = (x: number) => (rule === 'aimd' || rule === 'aiad' ? x + ADD : x * MUL_UP);
    const down = (x: number) => (rule === 'aimd' || rule === 'mimd' ? x * MUL_DOWN : x - ADD);
    x1 = Math.max(0.001, over ? down(x1) : up(x1));
    x2 = Math.max(0.001, over ? down(x2) : up(x2));
    pts.push([x1, x2]);
  }
  return pts;
}

/** Jain's fairness index for two flows: 1 when equal, 0.5 when one gets everything. */
export const jain = (a: number, b: number) => ((a + b) * (a + b)) / (2 * (a * a + b * b));

/* ─────────────── formatting ─────────────── */

export function fmtBytes(b: number): string {
  if (b < 1000) return `${Math.round(b)}B`;
  if (b < 1e6) return `${(b / 1e3).toFixed(b < 1e5 ? 1 : 0)}KB`;
  if (b < 1e9) return `${(b / 1e6).toFixed(b < 1e8 ? 1 : 0)}MB`;
  return `${(b / 1e9).toFixed(1)}GB`;
}

export function fmtBps(v: number): string {
  if (v < 1e3) return `${Math.round(v)}bps`;
  if (v < 1e6) return `${(v / 1e3).toFixed(v < 1e4 ? 1 : 0)}kbps`;
  if (v < 1e9) return `${(v / 1e6).toFixed(v < 1e7 ? 2 : v < 1e8 ? 1 : 0)}Mbps`;
  return `${(v / 1e9).toFixed(v < 1e10 ? 2 : 1)}Gbps`;
}
