/* 계산 이론: Turing machines, a census of tiny machines, Collatz, subset sum and the diagonal */

import { rng } from '../../../../lib/math';

/* ───────────────────────── Turing machines ───────────────────────── */

export type Move = 'L' | 'R' | 'S';
export type Rule = [write: string, move: Move, next: string];

export interface Tm {
  states: string[]; // working states, in table order
  symbols: string[]; // tape symbols, in table order (blank included)
  blank: string;
  start: string;
  rules: Record<string, Rule>; // key: `${state} ${symbol}`
  halts: Record<string, 'acc' | 'rej' | 'halt'>;
}

export const ruleKey = (q: string, s: string) => `${q} ${s}`;

/** Build a rule table from compact lines like "A 0 1RB". */
function table(lines: string[]): Record<string, Rule> {
  const out: Record<string, Rule> = {};
  for (const l of lines) {
    const [q, s, act] = l.split(' ');
    out[ruleKey(q, s)] = [act[0], act[1] as Move, act.slice(2)];
  }
  return out;
}

export interface TmPreset {
  value: string;
  label: string;
  tm: Tm;
  input: string;
  inputAlphabet: string;
  about: string;
}

export const TM_PRESETS: TmPreset[] = [
  {
    value: 'inc',
    label: '이진수 +1',
    input: '1011',
    inputAlphabet: '01',
    about: '오른쪽 끝까지 간 다음, 1은 0으로 바꾸며 왼쪽으로 받아올림을 옮기고, 처음 만난 0이나 빈칸을 1로 바꾸고 멈춥니다.',
    tm: {
      states: ['right', 'carry'],
      symbols: ['0', '1', '_'],
      blank: '_',
      start: 'right',
      rules: table(['right 0 0Rright', 'right 1 1Rright', 'right _ _Lcarry', 'carry 1 0Lcarry', 'carry 0 1Sdone', 'carry _ 1Sdone']),
      halts: { done: 'halt' },
    },
  },
  {
    value: 'add',
    label: '단항 덧셈',
    input: '111+11',
    inputAlphabet: '1+',
    about: '수 n을 1을 n개 늘어놓아 적습니다. +를 1로 바꿔 두 수를 붙이고, 맨 끝의 1 하나를 지우면 합이 남습니다.',
    tm: {
      states: ['q0', 'q1', 'q2'],
      symbols: ['1', '+', '_'],
      blank: '_',
      start: 'q0',
      rules: table(['q0 1 1Rq0', 'q0 + 1Rq1', 'q1 1 1Rq1', 'q1 _ _Lq2', 'q2 1 _Sdone']),
      halts: { done: 'halt' },
    },
  },
  {
    value: 'pal',
    label: '회문 검사',
    input: 'abba',
    inputAlphabet: 'ab',
    about: '맨 앞 글자를 지우고 상태로 기억한 채 오른쪽 끝까지 가서, 맨 뒤 글자와 같으면 지우고 돌아옵니다. 다르면 거부합니다.',
    tm: {
      states: ['q0', 'ra', 'rb', 'ca', 'cb', 'back'],
      symbols: ['a', 'b', '_'],
      blank: '_',
      start: 'q0',
      rules: table([
        'q0 a _Rra',
        'q0 b _Rrb',
        'q0 _ _Sacc',
        'ra a aRra',
        'ra b bRra',
        'ra _ _Lca',
        'rb a aRrb',
        'rb b bRrb',
        'rb _ _Lcb',
        'ca a _Lback',
        'ca b bSrej',
        'ca _ _Sacc',
        'cb b _Lback',
        'cb a aSrej',
        'cb _ _Sacc',
        'back a aLback',
        'back b bLback',
        'back _ _Rq0',
      ]),
      halts: { acc: 'acc', rej: 'rej' },
    },
  },
  {
    value: 'bb4',
    label: '바쁜 비버 (상태 4개)',
    input: '',
    inputAlphabet: '',
    about: '빈 테이프에서 출발해 멈추기 전까지 1을 가장 많이 쓰는 상태 4개짜리 기계입니다. 107번 움직이고 1을 13개 남깁니다.',
    tm: {
      states: ['A', 'B', 'C', 'D'],
      symbols: ['0', '1'],
      blank: '0',
      start: 'A',
      rules: table(['A 0 1RB', 'A 1 1LB', 'B 0 1LA', 'B 1 0LC', 'C 0 1RH', 'C 1 1LD', 'D 0 1RD', 'D 1 0RA']),
      halts: { H: 'halt' },
    },
  },
];

export interface TmFrame {
  tape: Map<number, string>;
  head: number;
  state: string;
  step: number;
  rule: string | null; // the rule about to be applied (null once halted)
  wrote: number | null; // cell written by the previous step
}

export interface TmRun {
  frames: TmFrame[];
  lo: number;
  hi: number;
  halted: boolean;
}

export function runTm(tm: Tm, input: string, maxSteps = 600): TmRun {
  const tape = new Map<number, string>();
  [...input].forEach((c, i) => tape.set(i, c));
  let head = 0;
  let state = tm.start;
  let lo = 0;
  let hi = Math.max(0, input.length - 1);
  let wrote: number | null = null;
  const frames: TmFrame[] = [];
  for (let step = 0; ; step++) {
    const sym = tape.get(head) ?? tm.blank;
    const halted = state in tm.halts;
    const key = ruleKey(state, sym);
    const rule = halted ? null : tm.rules[key] ? key : null;
    frames.push({ tape: new Map(tape), head, state, step, rule, wrote });
    if (halted || !rule || step >= maxSteps) return { frames, lo, hi, halted: halted || !rule };
    const [w, mv, next] = tm.rules[key];
    if (w === tm.blank) tape.delete(head);
    else tape.set(head, w);
    wrote = head;
    head += mv === 'L' ? -1 : mv === 'R' ? 1 : 0;
    state = next;
    lo = Math.min(lo, head);
    hi = Math.max(hi, head);
  }
}

/** Steps the palindrome machine takes on a palindrome of length n (its worst case). */
export function palindromeSteps(n: number): number {
  const half = Array.from({ length: Math.ceil(n / 2) }, (_, i) => (i % 2 ? 'b' : 'a'));
  const s = [...half, ...half.slice(0, Math.floor(n / 2)).reverse()].join('');
  const run = runTm(TM_PRESETS[2].tm, s, 1e6);
  return run.frames.length - 1;
}

/* ── every 2-state, 2-symbol machine, started on a blank tape ── */

export interface Census {
  total: number;
  haltAt: Int32Array; // step on which each machine halted, or -1 if not within the limit
  ones: Int32Array;
  limit: number;
  champSteps: number; // index of the machine that ran longest before halting
  champOnes: number;
}

/** Decode machine m into rules: entry e = (state, read) → (write, move, next ∈ {A, B, H}). */
export function decode2(m: number): { write: number; move: 1 | -1; next: number }[] {
  const out = [];
  for (let e = 0; e < 4; e++) {
    const d = m % 12;
    m = Math.floor(m / 12);
    out.push({ write: d % 2, move: (Math.floor(d / 2) % 2 ? 1 : -1) as 1 | -1, next: Math.floor(d / 4) }); // next 2 = halt
  }
  return out;
}

export function census2(limit = 60): Census {
  const total = 12 ** 4;
  const haltAt = new Int32Array(total);
  const ones = new Int32Array(total);
  const size = 2 * limit + 3;
  const tape = new Uint8Array(size);
  let champSteps = -1;
  let champOnes = -1;
  for (let m = 0; m < total; m++) {
    const r = decode2(m);
    tape.fill(0);
    let head = limit + 1;
    let q = 0;
    let t = 0;
    let result = -1;
    while (t < limit) {
      const e = r[q * 2 + tape[head]];
      tape[head] = e.write;
      head += e.move;
      t++;
      if (e.next === 2) {
        result = t;
        break;
      }
      q = e.next;
    }
    haltAt[m] = result;
    if (result > 0) {
      let c = 0;
      for (let i = 0; i < size; i++) c += tape[i];
      ones[m] = c;
      if (champSteps < 0 || result > haltAt[champSteps] || (result === haltAt[champSteps] && c > ones[champSteps])) champSteps = m;
      if (champOnes < 0 || c > ones[champOnes]) champOnes = m;
    }
  }
  return { total, haltAt, ones, limit, champSteps, champOnes };
}

/* ───────────────────────── Collatz ───────────────────────── */

export function collatz(n: number, cap = 2000): number[] {
  const out = [n];
  while (n !== 1 && out.length < cap) {
    n = n % 2 ? 3 * n + 1 : n / 2;
    out.push(n);
  }
  return out;
}

/* ───────────────────────── Subset sum ───────────────────────── */

export function subsetInstance(n: number, seed: number): { nums: number[]; target: number; hidden: boolean[] } {
  const r = rng(seed * 1009 + n);
  const nums = Array.from({ length: n }, () => 10000 + Math.floor(r() * 90000));
  let hidden = nums.map(() => r() < 0.4);
  if (!hidden.some(Boolean)) hidden = nums.map((_, i) => i < 2);
  const target = nums.reduce((a, v, i) => a + (hidden[i] ? v : 0), 0);
  return { nums, target, hidden };
}

/**
 * Try every subset in Gray-code order (each candidate differs from the last by one number,
 * so its sum costs one addition). Returns how many candidates were looked at before the
 * first hit, and that subset.
 */
export function bruteSubset(nums: number[], target: number): { tried: number; found: boolean[] | null } {
  const n = nums.length;
  const inSet = new Array<boolean>(n).fill(false);
  let sum = 0;
  if (target === 0) return { tried: 1, found: [...inSet] };
  const total = 2 ** n;
  for (let k = 1; k < total; k++) {
    // the bit that flips between Gray codes k-1 and k is the lowest set bit of k
    let b = 0;
    while (((k >> b) & 1) === 0) b++;
    inSet[b] = !inSet[b];
    sum += inSet[b] ? nums[b] : -nums[b];
    if (sum === target) return { tried: k + 1, found: [...inSet] };
  }
  return { tried: total, found: null };
}

/* ───────────────────────── The diagonal ───────────────────────── */

export interface Prog {
  name: string;
  src: string;
  halts: (input: string) => boolean;
}

export const PROGS: Prog[] = [
  { name: 'p1', src: 'function p1(x) { return x.length; }', halts: () => true },
  { name: 'p2', src: 'function p2(x) { while (true) {} }', halts: () => false },
  { name: 'p3', src: 'function p3(x) { while (x.length % 2) {} }', halts: (x) => x.length % 2 === 0 },
  { name: 'p4', src: "function p4(x) { if (x.includes('while')) while (true) {} }", halts: (x) => !x.includes('while') },
  { name: 'p5', src: "function p5(x) { while (!x.includes('{}')) {} }", halts: (x) => x.includes('{}') },
];

export const D_SRC = 'function D(x) { if (halts(x, x)) while (true) {} }';
