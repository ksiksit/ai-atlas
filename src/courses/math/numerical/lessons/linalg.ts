/*
 * 수치해석 · 연립방정식과 조건수: pure numerical helpers (no imports, so node can run them).
 * Matrices are arrays of rows. Everything is plain double precision, on purpose: the lesson is
 * about what double precision does.
 */

export type Mat = number[][];
export type Vec = number[];

export const copyM = (A: Mat): Mat => A.map((r) => r.slice());
export const matVec = (A: Mat, x: Vec): Vec => A.map((r) => r.reduce((s, a, j) => s + a * x[j], 0));
export const normInf = (x: Vec) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
export const matNormInf = (A: Mat) => A.reduce((m, r) => Math.max(m, r.reduce((s, a) => s + Math.abs(a), 0)), 0);

/* ───────── LU ───────── */

export interface LU {
  /** Unit lower-triangular L (multipliers below the diagonal). */
  L: Mat;
  U: Mat;
  /** Row order after pivoting: row k of LU is row perm[k] of A. */
  perm: number[];
  /** Multiply-adds used (one multiply plus one subtract counts as one). */
  ops: number;
  ok: boolean;
}

/** Doolittle LU, with or without partial pivoting. */
export function luFactor(A0: Mat, pivot = true): LU {
  const n = A0.length;
  const U = copyM(A0);
  const L: Mat = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const perm = Array.from({ length: n }, (_, i) => i);
  let ops = 0;
  let ok = true;
  for (let k = 0; k < n; k++) {
    if (pivot) {
      let p = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(U[i][k]) > Math.abs(U[p][k])) p = i;
      if (p !== k) {
        [U[k], U[p]] = [U[p], U[k]];
        [perm[k], perm[p]] = [perm[p], perm[k]];
        for (let j = 0; j < k; j++) [L[k][j], L[p][j]] = [L[p][j], L[k][j]];
      }
    }
    if (U[k][k] === 0) {
      ok = false;
      continue;
    }
    for (let i = k + 1; i < n; i++) {
      const m = U[i][k] / U[k][k];
      L[i][k] = m;
      U[i][k] = 0;
      for (let j = k + 1; j < n; j++) {
        U[i][j] -= m * U[k][j];
        ops++;
      }
    }
  }
  return { L, U, perm, ops, ok };
}

/** Solve LUx = Pb by forward then back substitution; returns the solution and the multiply-adds used. */
export function luSolve(f: LU, b: Vec): { x: Vec; ops: number } {
  const n = b.length;
  const y = f.perm.map((i) => b[i]);
  let ops = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < i; j++) {
      y[i] -= f.L[i][j] * y[j];
      ops++;
    }
  const x = y.slice();
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j < n; j++) {
      x[i] -= f.U[i][j] * x[j];
      ops++;
    }
    x[i] /= f.U[i][i];
  }
  return { x, ops };
}

export const solve = (A: Mat, b: Vec, pivot = true): Vec => luSolve(luFactor(A, pivot), b).x;

/** Exact counts for an n×n system: factorization and one solve (multiply-adds). */
export const factorOps = (n: number) => ((n - 1) * n * (2 * n - 1)) / 6;
export const solveOps = (n: number) => n * (n - 1);

/** A random, well-conditioned (diagonally dominant) n×n matrix from a seeded generator. */
export function randomMatrix(n: number, rand: () => number): Mat {
  const A = Array.from({ length: n }, () => Array.from({ length: n }, () => rand() * 2 - 1));
  for (let i = 0; i < n; i++) A[i][i] += n;
  return A;
}

/* ───────── the tiny pivot ───────── */

/** Solve [[eps, 1], [1, 1]] x = [1, 2] by elimination, with or without swapping rows. Exact answer is ≈ (1, 1). */
export function tinyPivot(eps: number, pivot: boolean): { x: Vec; mult: number; u22: number } {
  if (!pivot) {
    const m = 1 / eps; // the multiplier for row 2
    const u22 = 1 - m * 1;
    const c2 = 2 - m * 1;
    const x2 = c2 / u22;
    const x1 = (1 - x2) / eps;
    return { x: [x1, x2], mult: m, u22 };
  }
  // rows swapped: [[1, 1], [eps, 1]] x = [2, 1]
  const m = eps;
  const u22 = 1 - m;
  const c2 = 1 - m * 2;
  const x2 = c2 / u22;
  const x1 = 2 - x2;
  return { x: [x1, x2], mult: m, u22 };
}

/** The true solution of the tiny-pivot system, computed stably in closed form. */
export const tinyExact = (eps: number): Vec => [1 / (1 - eps), (1 - 2 * eps) / (1 - eps)];

/* ───────── conditioning ───────── */

export const hilbert = (n: number): Mat => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => 1 / (i + j + 1)));

function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/** The exact inverse of the n×n Hilbert matrix (integer entries, exact in doubles up to n ≈ 13). */
export function hilbertInverse(n: number): Mat {
  return Array.from({ length: n }, (_, a) =>
    Array.from({ length: n }, (_, b) => {
      const i = a + 1, j = b + 1;
      const s = (i + j) % 2 === 0 ? 1 : -1;
      return s * (i + j - 1) * binom(n + i - 1, n - j) * binom(n + j - 1, n - i) * binom(i + j - 2, i - 1) ** 2;
    }),
  );
}

export interface HilbertRow {
  n: number;
  /** κ∞ = ‖H‖∞ ‖H⁻¹‖∞ from the exact inverse. */
  kappa: number;
  /** Relative error of the computed x when the true x is all ones. */
  relErr: number;
  /** Correct decimal digits in the computed x: −log10 of the relative error. */
  digits: number;
}

export function hilbertTable(ns: number[]): HilbertRow[] {
  return ns.map((n) => {
    const H = hilbert(n);
    const kappa = matNormInf(H) * matNormInf(hilbertInverse(n));
    const ones = Array(n).fill(1);
    const b = matVec(H, ones);
    const x = solve(H, b, true);
    const relErr = normInf(x.map((v) => v - 1));
    return { n, kappa, relErr, digits: relErr > 0 ? -Math.log10(relErr) : 16 };
  });
}

/**
 * Two lines through (1, 1): x + y = 2 and a second line at angle θ to it.
 * Returns the matrix, the condition number, and the solution when the second right-hand side is nudged by δ.
 */
export function twoLines(thetaDeg: number, delta: number): { A: Mat; kappa: number; x: Vec; moved: number } {
  const th = (thetaDeg * Math.PI) / 180;
  // the first line has normal (1, 1)/√2; the second normal is rotated by θ
  const a1 = [Math.SQRT1_2, Math.SQRT1_2];
  const ang = Math.PI / 4 + th;
  const a2 = [Math.cos(ang), Math.sin(ang)];
  const A: Mat = [a1, a2];
  const b = [a1[0] + a1[1], a2[0] + a2[1] + delta];
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  const inv: Mat = [
    [A[1][1] / det, -A[0][1] / det],
    [-A[1][0] / det, A[0][0] / det],
  ];
  const kappa = matNormInf(A) * matNormInf(inv);
  const x = matVec(inv, b);
  return { A, kappa, x, moved: Math.hypot(x[0] - 1, x[1] - 1) };
}

/* ───────── iterative methods on the 1-D Poisson matrix ───────── */

/** tridiag(−1, 2, −1) of size n, the discrete second derivative, and b for u″ = −1 with zero ends (h = 1/(n+1)). */
export function poisson(n: number): { A: Mat; b: Vec } {
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 2 : Math.abs(i - j) === 1 ? -1 : 0)));
  const h = 1 / (n + 1);
  return { A, b: Array(n).fill(h * h) };
}

const residual = (A: Mat, x: Vec, b: Vec) => normInf(b.map((v, i) => v - A[i].reduce((s, a, j) => s + a * x[j], 0))) / normInf(b);

export type Iter = 'jacobi' | 'gs' | 'cg';

/** Relative residual ‖b − Ax‖∞ / ‖b‖∞ after each iteration, starting from x = 0, until tol or maxIt. */
export function iterate(A: Mat, b: Vec, method: Iter, maxIt: number, tol = 1e-10): number[] {
  const n = b.length;
  const out: number[] = [1];
  let x = Array(n).fill(0);
  if (method === 'cg') {
    let r = b.slice();
    let p = r.slice();
    let rr = r.reduce((s, v) => s + v * v, 0);
    for (let k = 0; k < maxIt; k++) {
      const Ap = matVec(A, p);
      const alpha = rr / p.reduce((s, v, i) => s + v * Ap[i], 0);
      x = x.map((v, i) => v + alpha * p[i]);
      r = r.map((v, i) => v - alpha * Ap[i]);
      const rr2 = r.reduce((s, v) => s + v * v, 0);
      const res = residual(A, x, b);
      out.push(res);
      if (res < tol) break;
      p = r.map((v, i) => v + (rr2 / rr) * p[i]);
      rr = rr2;
    }
    return out;
  }
  for (let k = 0; k < maxIt; k++) {
    if (method === 'jacobi') {
      x = x.map((_, i) => (b[i] - A[i].reduce((s, a, j) => (j === i ? s : s + a * x[j]), 0)) / A[i][i]);
    } else {
      for (let i = 0; i < n; i++) x[i] = (b[i] - A[i].reduce((s, a, j) => (j === i ? s : s + a * x[j]), 0)) / A[i][i];
    }
    const res = residual(A, x, b);
    out.push(res);
    if (res < tol) break;
  }
  return out;
}

/** First iteration at which the residual drops below tol, or null. */
export const itersTo = (hist: number[], tol: number) => {
  const k = hist.findIndex((r) => r < tol);
  return k < 0 ? null : k;
};
