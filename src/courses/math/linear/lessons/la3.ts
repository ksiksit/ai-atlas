/* 선형대수: 3×3 matrices for the 3D room lesson (row-major, math coordinates with z up). */
import { tn } from './la';

export type Vec3 = [number, number, number];
/** Row-major: [a11, a12, a13, a21, a22, a23, a31, a32, a33]. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const I3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const ap3 = (m: Mat3, v: Vec3): Vec3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
export const det3 = (m: Mat3) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
export const lerp3 = (A: Mat3, B: Mat3, t: number): Mat3 => A.map((a, i) => a + (B[i] - a) * t) as Mat3;
export const col3 = (m: Mat3, j: number): Vec3 => [m[j], m[3 + j], m[6 + j]];
export const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit3 = (a: Vec3): Vec3 => {
  const n = norm3(a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/** Real roots of λ³ + bλ² + cλ + d, each listed once (multiple roots included). */
function cubicRoots(b: number, c: number, d: number): number[] {
  const p = (x: number) => ((x + b) * x + c) * x + d;
  const bound = 1 + Math.max(Math.abs(b), Math.abs(c), Math.abs(d));
  // Critical points split the line into monotone pieces; a root sits in a piece where p changes sign,
  // or at a critical point where p is (numerically) zero — that catches double roots.
  const disc = b * b - 3 * c;
  const crit = disc > 0 ? [(-b - Math.sqrt(disc)) / 3, (-b + Math.sqrt(disc)) / 3] : disc === 0 ? [-b / 3] : [];
  const cuts = [-bound, ...crit.filter((x) => x > -bound && x < bound), bound];
  const roots: number[] = [];
  const scale = 1 + Math.abs(b) + Math.abs(c) + Math.abs(d);
  for (const x of crit) if (Math.abs(p(x)) < 1e-9 * scale) roots.push(x);
  for (let i = 0; i < cuts.length - 1; i++) {
    let lo = cuts[i];
    let hi = cuts[i + 1];
    let plo = p(lo);
    const phi = p(hi);
    if (plo === 0) roots.push(lo);
    if (plo * phi >= 0) continue;
    for (let k = 0; k < 200 && hi - lo > 1e-13; k++) {
      const mid = (lo + hi) / 2;
      const pm = p(mid);
      if (pm * plo <= 0) hi = mid;
      else {
        lo = mid;
        plo = pm;
      }
    }
    roots.push((lo + hi) / 2);
  }
  roots.sort((x, y) => x - y);
  const out: number[] = [];
  for (const r of roots) if (!out.length || Math.abs(r - out[out.length - 1]) > 1e-4) out.push(r);
  return out;
}

/** An eigenspace for one real eigenvalue: a line (direction `v`), a plane (normal `n`), or all of space. */
export type EigenSpace = { l: number; kind: 'line'; v: Vec3 } | { l: number; kind: 'plane'; n: Vec3 } | { l: number; kind: 'all' };

/** Real eigenvalues of a 3×3 matrix and their eigenspaces (complex eigenvalues are left out). */
export function eig3(m: Mat3): EigenSpace[] {
  const tr = m[0] + m[4] + m[8];
  const c2 = m[0] * m[4] - m[1] * m[3] + m[0] * m[8] - m[2] * m[6] + m[4] * m[8] - m[5] * m[7];
  const roots = cubicRoots(-tr, c2, -det3(m));
  const scale = Math.max(1, ...m.map(Math.abs));
  return roots.map((l) => {
    const B: Mat3 = [m[0] - l, m[1], m[2], m[3], m[4] - l, m[5], m[6], m[7], m[8] - l];
    const rows: Vec3[] = [
      [B[0], B[1], B[2]],
      [B[3], B[4], B[5]],
      [B[6], B[7], B[8]],
    ];
    const crosses = [cross3(rows[0], rows[1]), cross3(rows[0], rows[2]), cross3(rows[1], rows[2])];
    const bestC = crosses.reduce((a, c) => (norm3(c) > norm3(a) ? c : a));
    if (norm3(bestC) > 1e-3 * scale * scale) return { l, kind: 'line' as const, v: unit3(bestC) };
    const bestR = rows.reduce((a, r) => (norm3(r) > norm3(a) ? r : a));
    if (norm3(bestR) > 1e-3 * scale) return { l, kind: 'plane' as const, n: unit3(bestR) };
    return { l, kind: 'all' as const };
  });
}

/** A 3×3 matrix in TeX; `c` colours the three columns. */
export function texM3(m: Mat3, d = 2, c: (string | undefined)[] = []): string {
  const w = (v: number, j: number) => (c[j] ? `\\textcolor{${c[j]}}{${tn(v, d)}}` : tn(v, d));
  const row = (i: number) => [0, 1, 2].map((j) => w(m[i * 3 + j], j)).join(' & ');
  return `\\begin{pmatrix} ${row(0)} \\\\ ${row(1)} \\\\ ${row(2)} \\end{pmatrix}`;
}

export const rotZ = (th: number): Mat3 => [Math.cos(th), -Math.sin(th), 0, Math.sin(th), Math.cos(th), 0, 0, 0, 1];
