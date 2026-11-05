/* 사람과 컴퓨터의 상호작용 · A/B 테스트: z-tests, sample sizes and the simulations behind the figures. */

import { normalCdf, normalInv, rng } from '../../../../lib/math';

/** Count of successes in n Bernoulli(p) trials, drawn one trial at a time (exact, seeded). */
export function binomial(n: number, p: number, r: () => number): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (r() < p) k++;
  return k;
}

export interface ZTest {
  pA: number;
  pB: number;
  diff: number;
  /** Standard error under the null (pooled), used for the test. */
  se0: number;
  /** Standard error of the difference (unpooled), used for the confidence interval. */
  se: number;
  z: number;
  /** Two-sided p-value. */
  p: number;
  /** 95% confidence interval of pB − pA. */
  lo: number;
  hi: number;
}

/** Two-proportion z-test of B against A. */
export function zTest(xA: number, nA: number, xB: number, nB: number): ZTest {
  const pA = xA / nA, pB = xB / nB;
  const pool = (xA + xB) / (nA + nB);
  const se0 = Math.sqrt(pool * (1 - pool) * (1 / nA + 1 / nB));
  const se = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB);
  const diff = pB - pA;
  const z = se0 > 0 ? diff / se0 : 0;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { pA, pB, diff, se0, se, z, p, lo: diff - 1.96 * se, hi: diff + 1.96 * se };
}

/** One experiment with true rates pA, pB and n users per arm. */
export function runExperiment(pA: number, pB: number, n: number, seed: number) {
  const r = rng(seed);
  const xA = binomial(n, pA, r);
  const xB = binomial(n, pB, r);
  return { xA, xB, ...zTest(xA, n, xB, n) };
}

/** Many repetitions of the same experiment: observed differences and how many reached p < alpha. */
export function repeatExperiment(pA: number, pB: number, n: number, reps: number, seed: number, alpha = 0.05) {
  const r = rng(seed * 7919 + 1);
  const diffs: number[] = [];
  let sig = 0;
  for (let k = 0; k < reps; k++) {
    const xA = binomial(n, pA, r);
    const xB = binomial(n, pB, r);
    const t = zTest(xA, n, xB, n);
    diffs.push(t.diff);
    if (t.p < alpha && t.diff > 0) sig++;
  }
  return { diffs, sig };
}

/**
 * Users needed per arm to detect a change from p1 to p2 with a two-sided test at level alpha
 * and the given power (normal approximation; rounded up).
 */
export function sampleSize(p1: number, p2: number, alpha = 0.05, power = 0.8): number {
  const za = normalInv(1 - alpha / 2);
  const zb = normalInv(power);
  const pbar = (p1 + p2) / 2;
  const num = za * Math.sqrt(2 * pbar * (1 - pbar)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil((num * num) / ((p2 - p1) * (p2 - p1)));
}

/** Power of the test for true rates p1, p2 with n per arm (normal approximation, one tail ignored). */
export function power(p1: number, p2: number, n: number, alpha = 0.05): number {
  const za = normalInv(1 - alpha / 2);
  const pbar = (p1 + p2) / 2;
  const se0 = Math.sqrt((2 * pbar * (1 - pbar)) / n);
  const se1 = Math.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / n);
  return 1 - normalCdf((za * se0 - Math.abs(p2 - p1)) / se1);
}

/* ───────── peeking ───────── */

export interface PeekRun {
  /** z after each look. */
  zs: number[];
  /** Index of the first look with p < alpha, or −1. */
  stop: number;
}

/**
 * A/A tests (both arms have the same true rate p). Users arrive `every` per arm between looks,
 * up to `total` per arm. The experimenter looks after each batch and would stop at the first p < alpha.
 */
export function peekingRuns(p: number, total: number, every: number, runs: number, seed: number, alpha = 0.05): PeekRun[] {
  const r = rng(seed * 104729 + 3);
  const zCrit = normalInv(1 - alpha / 2);
  const out: PeekRun[] = [];
  for (let k = 0; k < runs; k++) {
    let xA = 0, xB = 0, n = 0;
    const zs: number[] = [];
    let stop = -1;
    while (n < total) {
      const b = Math.min(every, total - n);
      xA += binomial(b, p, r);
      xB += binomial(b, p, r);
      n += b;
      const z = zTest(xA, n, xB, n).z;
      zs.push(z);
      if (stop < 0 && Math.abs(z) > zCrit) stop = zs.length - 1;
    }
    out.push({ zs, stop });
  }
  return out;
}

/** Share of runs that a peeking experimenter would have called significant by look k (1-based). */
export function falsePositiveByLook(runs: PeekRun[], looks: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < looks; k++) out.push(runs.filter((r) => r.stop >= 0 && r.stop <= k).length / runs.length);
  return out;
}

/* ───────── many metrics ───────── */

/** p-values of `m` independent A/A comparisons (no metric truly differs). */
export function manyMetrics(m: number, n: number, p: number, seed: number): number[] {
  const r = rng(seed * 31 + 17);
  return Array.from({ length: m }, () => {
    const xA = binomial(n, p, r);
    const xB = binomial(n, p, r);
    return zTest(xA, n, xB, n).p;
  });
}

/** Chance that at least one of m independent true-null tests comes out below alpha. */
export const familywise = (m: number, alpha: number) => 1 - (1 - alpha) ** m;

export const METRICS = [
  '구매 전환율', '장바구니 담기', '첫 화면 이탈', '검색 사용', '리뷰 읽기', '찜하기', '쿠폰 사용', '재방문(7일)', '공유하기', '알림 허용',
  '회원 가입', '상세 화면 스크롤', '추천 상품 클릭', '배송 조회', '고객센터 문의', '결제 수단 저장', '앱 평점 남기기', '필터 사용', '다시 구매', '탈퇴',
];
