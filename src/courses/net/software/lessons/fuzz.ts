/*
 * 소프트웨어 보안 · 퍼징: a toy file-format parser with three planted bugs, three fuzzers that
 * run against it with a seeded RNG, and delta debugging to shrink a crashing input.
 *
 * The format ("ATL 이미지 머리말"):
 *   byte 0..1  magic 'A' 'T'
 *   byte 2     version 1 or 2
 *   then records until the end: type (1 byte), length L (1 byte), L value bytes
 *     'W' width, 'H' height   L must be 2
 *     'C' comment             L bytes of text           ← bug 1: no bounds check (out-of-bounds read)
 *     'P' palette (v2 only)   L must be a multiple of 3
 *     'Z' tag                 if the value starts "FUZZ" → bug 2: an assertion the author thought unreachable
 *     'S' skip                2-byte length N, next record at i + N  ← bug 3: N = 0 never advances (hang)
 *     anything else           skipped by L
 *   the file is accepted only if both W and H were seen.
 *
 * Every condition in the parser reports a branch id, the way compiled code is instrumented for
 * coverage-guided fuzzing. The magic comparisons are split one byte per branch (as the
 * "laf-intel" compiler pass does), so a coverage-guided fuzzer can solve them one byte at a time.
 */

import { rng } from '../../../../lib/math';

export type Bug = 'oob' | 'magic' | 'hang';
export type Status = 'ok' | 'reject' | 'crash' | 'hang';

export const BUG_KO: Record<Bug, string> = {
  oob: '범위 밖 읽기 (설명 C의 길이)',
  magic: '도달 못 한다고 믿은 단언 (태그 Z = FUZZ)',
  hang: '무한 반복 (건너뛰기 S의 길이 0)',
};
export const BUG_SHORT: Record<Bug, string> = { oob: '범위 밖 읽기', magic: 'FUZZ 단언', hang: '무한 반복' };
export const BUGS: Bug[] = ['oob', 'magic', 'hang'];

/** Branch labels, indexed by id. */
export const BRANCHES: string[] = [
  /* 0 */ '4바이트 미만이라 거절',
  /* 1 */ '첫 바이트가 A',
  /* 2 */ '첫 바이트가 A가 아니라 거절',
  /* 3 */ '둘째 바이트가 T',
  /* 4 */ '둘째 바이트가 T가 아니라 거절',
  /* 5 */ '버전 1',
  /* 6 */ '버전 2',
  /* 7 */ '모르는 버전이라 거절',
  /* 8 */ '레코드를 하나 읽기 시작',
  /* 9 */ '레코드 머리가 잘려 거절',
  /* 10 */ '너비 W',
  /* 11 */ '높이 H',
  /* 12 */ 'W나 H의 길이가 2가 아니라 거절',
  /* 13 */ '설명 C를 길이만큼 읽음',
  /* 14 */ '팔레트 P (버전 2)',
  /* 15 */ '버전 1에 팔레트가 있어 거절',
  /* 16 */ '팔레트 길이가 3의 배수가 아니라 거절',
  /* 17 */ '건너뛰기 S',
  /* 18 */ '건너뛰기 길이 바이트가 잘려 거절',
  /* 19 */ '태그 Z',
  /* 20 */ '태그 값이 4바이트 이상',
  /* 21 */ '태그 값 1번째 = F',
  /* 22 */ '태그 값 2번째 = U',
  /* 23 */ '태그 값 3번째 = Z',
  /* 24 */ '태그 값 4번째 = Z',
  /* 25 */ '모르는 레코드를 건너뜀',
  /* 26 */ '레코드 값이 잘려 거절',
  /* 27 */ '끝까지 읽었지만 W나 H가 없어 거절',
  /* 28 */ '끝까지 읽고 크기를 계산해 성공',
];
export const N_BRANCH = BRANCHES.length;

export interface RunResult {
  status: Status;
  bug?: Bug;
  /** Branch ids in the order they were hit (repeats removed). */
  branches: number[];
  /** An out-of-bounds read happened but nothing stopped the program (sanitizer off). */
  silentOob: boolean;
  /** One line about what ended the run. */
  note: string;
}

const CH = (s: string) => s.charCodeAt(0);
const STEP_LIMIT = 200; // record iterations before we call it a hang

/** Run the parser on one input. With `sanitizer`, an out-of-bounds read stops the program (like ASan). */
export function parse(b: ArrayLike<number>, sanitizer = true): RunResult {
  const n = b.length;
  const seen = new Set<number>();
  const order: number[] = [];
  const hit = (id: number) => {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  };
  let silentOob = false;
  const done = (status: Status, note: string, bug?: Bug): RunResult => ({ status, bug, branches: order, silentOob, note });

  if (n < 4) {
    hit(0);
    return done('reject', '입력이 너무 짧습니다.');
  }
  if (b[0] === CH('A')) hit(1);
  else {
    hit(2);
    return done('reject', '매직 바이트가 맞지 않습니다.');
  }
  if (b[1] === CH('T')) hit(3);
  else {
    hit(4);
    return done('reject', '매직 바이트가 맞지 않습니다.');
  }
  const ver = b[2];
  if (ver === 1) hit(5);
  else if (ver === 2) hit(6);
  else {
    hit(7);
    return done('reject', `버전 ${ver}은 모르는 버전입니다.`);
  }

  let i = 3;
  let w = -1, h = -1;
  let steps = 0;
  while (i < n) {
    if (++steps > STEP_LIMIT) return done('hang', `레코드를 ${STEP_LIMIT}번 넘게 읽어도 끝나지 않습니다. 같은 자리를 계속 읽고 있습니다.`, 'hang');
    hit(8);
    const t = b[i];
    if (t === CH('S')) {
      hit(17);
      if (i + 2 >= n) {
        hit(18);
        return done('reject', '건너뛰기 레코드가 잘렸습니다.');
      }
      const skip = (b[i + 1] << 8) | b[i + 2];
      i += skip; // the bug: should be i + 3 + skip
      continue;
    }
    if (i + 1 >= n) {
      hit(9);
      return done('reject', '레코드 머리가 잘렸습니다.');
    }
    const len = b[i + 1];
    const v = i + 2;
    if (t === CH('C')) {
      hit(13);
      // the bug: copies len bytes without checking that they are there
      for (let k = 0; k < len; k++) {
        if (v + k >= n) {
          if (sanitizer) return done('crash', `설명 C가 ${len}바이트라고 했지만 파일에는 ${n - v}바이트뿐입니다. ${v + k}번 바이트를 읽으려는 순간 새니타이저가 멈췄습니다.`, 'oob');
          silentOob = true;
          break;
        }
      }
      i = v + len;
      continue;
    }
    if (v + len > n) {
      hit(26);
      return done('reject', '레코드 값이 잘렸습니다.');
    }
    if (t === CH('W') || t === CH('H')) {
      if (len !== 2) {
        hit(12);
        return done('reject', 'W나 H는 2바이트여야 합니다.');
      }
      const val = (b[v] << 8) | b[v + 1];
      if (t === CH('W')) {
        hit(10);
        w = val;
      } else {
        hit(11);
        h = val;
      }
    } else if (t === CH('P')) {
      if (ver !== 2) {
        hit(15);
        return done('reject', '팔레트는 버전 2에만 있습니다.');
      }
      if (len % 3 !== 0) {
        hit(16);
        return done('reject', '팔레트 길이가 3의 배수가 아닙니다.');
      }
      hit(14);
    } else if (t === CH('Z')) {
      hit(19);
      if (len >= 4) {
        hit(20);
        if (b[v] === CH('F')) {
          hit(21);
          if (b[v + 1] === CH('U')) {
            hit(22);
            if (b[v + 2] === CH('Z')) {
              hit(23);
              if (b[v + 3] === CH('Z')) {
                hit(24);
                return done('crash', '태그 값이 FUZZ입니다. 작성자가 "여기는 올 리 없다"고 적어 둔 단언이 터졌습니다.', 'magic');
              }
            }
          }
        }
      }
    } else {
      hit(25);
    }
    i = v + len;
  }
  if (w < 0 || h < 0) {
    hit(27);
    return done('reject', '너비나 높이가 없습니다.');
  }
  hit(28);
  return done('ok', `${w}×${h} 이미지로 읽었습니다.${silentOob ? ' (하지만 그 사이에 파일 밖의 메모리를 읽었습니다.)' : ''}`);
}

/* ───────── inputs as text ───────── */

/** Bytes as "41 54 01 …" hex. */
export const toHex = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');

/** One byte as a printable character, or · for anything else. */
export const glyph = (x: number) => (x >= 0x21 && x <= 0x7e ? String.fromCharCode(x) : '·');

/** Parse hex like "41 54 1" or "4154" back to bytes; null if anything is not hex. */
export function fromHex(s: string): number[] | null {
  const parts = s.trim().split(/[\s,]+/).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    if (!/^[0-9a-fA-F]+$/.test(p)) return null;
    if (p.length <= 2) out.push(parseInt(p, 16));
    else {
      if (p.length % 2) return null;
      for (let k = 0; k < p.length; k += 2) out.push(parseInt(p.slice(k, k + 2), 16));
    }
  }
  return out.length > 256 ? out.slice(0, 256) : out;
}

const bytes = (...xs: (number | string)[]) => xs.flatMap((x) => (typeof x === 'string' ? Array.from(x, (c) => c.charCodeAt(0)) : [x]));

/** Example inputs for the hand-run figure. */
export const SAMPLES: { id: string; label: string; bytes: number[] }[] = [
  { id: 'ok', label: '올바른 파일', bytes: bytes('AT', 1, 'W', 2, 0, 64, 'H', 2, 0, 48, 'C', 3, 'hi!') },
  { id: 'v2', label: '버전 2와 팔레트', bytes: bytes('AT', 2, 'W', 2, 0, 8, 'H', 2, 0, 8, 'P', 6, 255, 0, 0, 0, 0, 255) },
  { id: 'oob', label: '설명 길이 부풀리기', bytes: bytes('AT', 1, 'W', 2, 0, 64, 'H', 2, 0, 48, 'C', 200, 'hi!') },
  { id: 'magic', label: '태그 FUZZ', bytes: bytes('AT', 1, 'Z', 4, 'FUZZ') },
  { id: 'hang', label: '건너뛰기 길이 0', bytes: bytes('AT', 1, 'S', 0, 0, 'W', 2, 0, 1) },
  { id: 'junk', label: '아무 바이트', bytes: [0x13, 0x9f, 0x00, 0x42, 0x7a] },
];

/** The seed corpus the mutation-based fuzzers start from: two valid files. */
export const SEEDS: number[][] = [SAMPLES[0].bytes, SAMPLES[1].bytes];

/* ───────── fuzzers ───────── */

export type FuzzerKind = 'random' | 'mutate' | 'coverage';
export const FUZZER_KO: Record<FuzzerKind, string> = { random: '무작위 바이트', mutate: '변이 (씨앗 고정)', coverage: '커버리지 기반' };
export const FUZZERS: FuzzerKind[] = ['random', 'mutate', 'coverage'];

const INTERESTING = [0, 1, 2, 0x7f, 0x80, 0xff];
const MAX_LEN = 64;

/** Apply one edit (60% of the time) or 2–4 random edits (bit flip, byte set, interesting value, insert, delete) to a copy. */
export function mutate(src: number[], r: () => number): number[] {
  const out = src.slice();
  const n = r() < 0.6 ? 1 : 2 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const op = Math.floor(r() * 5);
    const pos = Math.floor(r() * Math.max(1, out.length));
    if (op === 0 && out.length) out[pos] ^= 1 << Math.floor(r() * 8);
    else if (op === 1 && out.length) out[pos] = Math.floor(r() * 256);
    else if (op === 2 && out.length) out[pos] = INTERESTING[Math.floor(r() * INTERESTING.length)];
    else if (op === 3 && out.length < MAX_LEN) out.splice(pos, 0, Math.floor(r() * 256));
    else if (op === 4 && out.length > 1) out.splice(pos, 1);
  }
  return out;
}

export interface Found {
  bug: Bug;
  input: number[];
  /** Execution count when first found. */
  at: number;
}

export interface FuzzState {
  kind: FuzzerKind;
  execs: number;
  covered: Set<number>;
  corpus: number[][];
  found: Found[];
  /** (execs, branches covered) every time coverage grows, plus the start. */
  history: [number, number][];
  /** Inputs that were rejected, accepted, crashed, hung. */
  counts: Record<Status, number>;
  /** Inputs that read past the end without anything noticing (only when the sanitizer is off). */
  silent: number;
  r: () => number;
  sanitizer: boolean;
}

export function newFuzzer(kind: FuzzerKind, seed: number, sanitizer = true): FuzzState {
  // each fuzzer gets its own stream so that their runs do not depend on one another
  const r = rng(seed * 7919 + FUZZERS.indexOf(kind) * 104729 + 1);
  const st: FuzzState = { kind, execs: 0, covered: new Set(), corpus: kind === 'random' ? [] : SEEDS.map((s) => s.slice()), found: [], history: [[0, 0]], counts: { ok: 0, reject: 0, crash: 0, hang: 0 }, silent: 0, r, sanitizer };
  // the coverage-guided fuzzer first runs its seeds to learn what they cover (not counted as fuzzing)
  if (kind !== 'random') for (const s of SEEDS) for (const id of parse(s, sanitizer).branches) st.covered.add(id);
  st.history = [[0, st.covered.size]];
  return st;
}

/** Run `k` more executions. Mutates and returns the state. */
export function fuzzSteps(st: FuzzState, k: number): FuzzState {
  const r = st.r;
  for (let j = 0; j < k; j++) {
    let input: number[];
    if (st.kind === 'random') {
      const len = 1 + Math.floor(r() * 32);
      input = Array.from({ length: len }, () => Math.floor(r() * 256));
    } else {
      // like AFL, spend more effort on the newest finds: half the time mutate the latest corpus entry
      const pick = st.kind === 'coverage' && r() < 0.5 ? st.corpus.length - 1 : Math.floor(r() * st.corpus.length);
      input = mutate(st.corpus[pick], r);
    }
    const res = parse(input, st.sanitizer);
    st.execs++;
    st.counts[res.status]++;
    if (res.silentOob) st.silent++;
    let grew = false;
    for (const id of res.branches)
      if (!st.covered.has(id)) {
        st.covered.add(id);
        grew = true;
      }
    if (grew) {
      st.history.push([st.execs, st.covered.size]);
      if (st.kind === 'coverage' && res.status !== 'crash' && res.status !== 'hang') st.corpus.push(input);
    }
    if (res.bug && !st.found.some((f) => f.bug === res.bug)) st.found.push({ bug: res.bug, input, at: st.execs });
  }
  return st;
}

/** Run a whole campaign at once (for prose numbers and tests). */
export function campaign(kind: FuzzerKind, seed: number, budget: number, sanitizer = true): FuzzState {
  return fuzzSteps(newFuzzer(kind, seed, sanitizer), budget);
}

/* ───────── delta debugging ───────── */

export interface DdStep {
  input: number[];
  /** The candidate that was just tried, and whether it still crashed the same way. */
  tried: number[];
  kept: boolean;
  note: string;
}

/**
 * Zeller's ddmin on bytes: try removing chunks (and keeping only one chunk); keep any smaller input
 * that still fails with the same bug; split finer when nothing works. Returns every test made.
 */
export function ddmin(input: number[], bug: Bug, sanitizer = true): DdStep[] {
  const fails = (x: number[]) => parse(x, sanitizer).bug === bug;
  const steps: DdStep[] = [];
  let cur = input.slice();
  let n = 2;
  while (cur.length >= 2) {
    const size = Math.ceil(cur.length / n);
    const chunks: [number, number][] = [];
    for (let s = 0; s < cur.length; s += size) chunks.push([s, Math.min(cur.length, s + size)]);
    let reduced = false;
    // try each chunk alone
    for (const [a, b] of chunks) {
      const cand = cur.slice(a, b);
      const ok = cand.length < cur.length && fails(cand);
      steps.push({ input: cur, tried: cand, kept: ok, note: `${a}~${b - 1}번 바이트만 남겨 보기` });
      if (ok) {
        cur = cand;
        n = 2;
        reduced = true;
        break;
      }
    }
    if (!reduced)
      // try each complement (remove one chunk)
      for (const [a, b] of chunks) {
        const cand = cur.slice(0, a).concat(cur.slice(b));
        const ok = cand.length > 0 && fails(cand);
        steps.push({ input: cur, tried: cand, kept: ok, note: `${a}~${b - 1}번 바이트를 지워 보기` });
        if (ok) {
          cur = cand;
          n = Math.max(n - 1, 2);
          reduced = true;
          break;
        }
      }
    if (!reduced) {
      if (n >= cur.length) break;
      n = Math.min(cur.length, n * 2);
    }
  }
  steps.push({ input: cur, tried: cur, kept: true, note: '더 지울 바이트가 없습니다. 이것이 최소 입력입니다.' });
  return steps;
}
