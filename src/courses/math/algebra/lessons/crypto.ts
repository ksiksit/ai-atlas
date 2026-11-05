/*
 * 현대대수학 · 응용: Reed–Solomon codes over GF(p), discrete logarithms, Diffie–Hellman,
 * and elliptic curves over the reals and over GF(p). Toy sizes only. No imports.
 */

export const mod = (a: number, n: number) => ((a % n) + n) % n;

function inv(a: number, p: number): number {
  // Fermat: a^(p-2) for prime p
  return powMod(mod(a, p), p - 2, p);
}

/** a^e mod m with square-and-multiply; also reports how many multiplications it took. */
export function powModCount(a: number, e: number, m: number): { value: number; mults: number } {
  let r = 1 % m;
  let b = mod(a, m);
  let mults = 0;
  let x = e;
  while (x > 0) {
    if (x & 1) {
      r = Number((BigInt(r) * BigInt(b)) % BigInt(m));
      mults++;
    }
    x = Math.floor(x / 2);
    if (x > 0) {
      b = Number((BigInt(b) * BigInt(b)) % BigInt(m));
      mults++;
    }
  }
  return { value: r, mults };
}
export const powMod = (a: number, e: number, m: number) => powModCount(a, e, m).value;

/* ───────── Reed–Solomon over GF(p) ───────── */

/** Evaluate the polynomial with coefficients c (constant first) at x, mod p. */
export function evalPoly(c: number[], x: number, p: number): number {
  let r = 0;
  for (let i = c.length - 1; i >= 0; i--) r = mod(r * x + c[i], p);
  return r;
}

/** Encode: the message symbols are the coefficients; send the values at x = 1..n. */
export function rsEncode(msg: number[], n: number, p: number): number[] {
  return Array.from({ length: n }, (_, i) => evalPoly(msg, i + 1, p));
}

/** Coefficients of the unique polynomial of degree < k through the k points (Lagrange). */
export function interpolate(xs: number[], ys: number[], p: number): number[] {
  const k = xs.length;
  const out = new Array(k).fill(0);
  for (let i = 0; i < k; i++) {
    // basis polynomial ℓ_i(x) = Π_{j≠i} (x - x_j) / (x_i - x_j)
    let basis = [1];
    let denom = 1;
    for (let j = 0; j < k; j++) {
      if (j === i) continue;
      const next = new Array(basis.length + 1).fill(0);
      for (let t = 0; t < basis.length; t++) {
        next[t] = mod(next[t] - xs[j] * basis[t], p);
        next[t + 1] = mod(next[t + 1] + basis[t], p);
      }
      basis = next;
      denom = mod(denom * (xs[i] - xs[j]), p);
    }
    const s = mod(ys[i] * inv(denom, p), p);
    for (let t = 0; t < k; t++) out[t] = mod(out[t] + s * basis[t], p);
  }
  return out;
}

export type SymbolState = 'ok' | 'erased' | 'wrong';

export interface RsDecode {
  /** Decoded message, or null if no polynomial is close enough. */
  msg: number[] | null;
  /** Positions the decoder believes were wrong. */
  flagged: number[];
  erasures: number;
  /** Errors the decoder had to correct (disagreements with the chosen polynomial). */
  corrected: number;
  /** Is the result guaranteed unique: 2·errors + erasures ≤ n − k? */
  withinBound: boolean;
  /** How many k-subsets were tried. */
  tried: number;
}

/**
 * Decode by brute force: for every k of the received (non-erased) positions, interpolate and
 * count disagreements; keep the polynomial with the fewest. Fine for n ≤ 12. Real decoders
 * (Berlekamp–Welch, Berlekamp–Massey) get the same answer without trying subsets.
 */
export function rsDecode(received: (number | null)[], k: number, p: number): RsDecode {
  const n = received.length;
  const known = received.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
  const erasures = n - known.length;
  if (known.length < k) return { msg: null, flagged: [], erasures, corrected: 0, withinBound: false, tried: 0 };
  let best: { msg: number[]; bad: number[] } | null = null;
  let tried = 0;
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    tried++;
    const xs = idx.map((i) => known[i] + 1);
    const ys = idx.map((i) => received[known[i]] as number);
    const c = interpolate(xs, ys, p);
    const bad = known.filter((i) => evalPoly(c, i + 1, p) !== received[i]);
    if (!best || bad.length < best.bad.length) best = { msg: c, bad };
    // next combination
    let t = k - 1;
    while (t >= 0 && idx[t] === known.length - k + t) t--;
    if (t < 0) break;
    idx[t]++;
    for (let u = t + 1; u < k; u++) idx[u] = idx[u - 1] + 1;
  }
  const corrected = best!.bad.length;
  const withinBound = 2 * corrected + erasures <= n - k;
  return { msg: withinBound ? best!.msg : null, flagged: best!.bad, erasures, corrected, withinBound, tried };
}

/* ───────── discrete logarithm ───────── */

/** Smallest generator of (ℤ/p)ˣ for prime p. */
export function generator(p: number): number {
  const phi = p - 1;
  const fs: number[] = [];
  let m = phi;
  for (let d = 2; d * d <= m; d++)
    if (m % d === 0) {
      fs.push(d);
      while (m % d === 0) m /= d;
    }
  if (m > 1) fs.push(m);
  for (let g = 2; g < p; g++) if (fs.every((q) => powMod(g, phi / q, p) !== 1)) return g;
  return -1;
}

/** Brute-force discrete log: try x = 0, 1, 2, … until g^x = h. Returns x and the steps taken. */
export function bruteLog(g: number, h: number, p: number): { x: number; steps: number } {
  let v = 1;
  for (let x = 0; x < p; x++) {
    if (v === h) return { x, steps: x + 1 };
    v = (v * g) % p;
  }
  return { x: -1, steps: p };
}

/* ───────── elliptic curves ───────── */

export type ECPoint = { x: number; y: number } | null; // null is the point at infinity O

export interface Curve {
  a: number;
  b: number;
  p: number;
}

export function onCurve(C: Curve, P: ECPoint): boolean {
  if (!P) return true;
  return mod(P.y * P.y - (P.x * P.x * P.x + C.a * P.x + C.b), C.p) === 0;
}

export function ecPoints(C: Curve): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let x = 0; x < C.p; x++) for (let y = 0; y < C.p; y++) if (onCurve(C, { x, y })) out.push({ x, y });
  return out;
}

export function ecAdd(C: Curve, P: ECPoint, Q: ECPoint): ECPoint {
  if (!P) return Q;
  if (!Q) return P;
  const p = C.p;
  if (P.x === Q.x && mod(P.y + Q.y, p) === 0) return null;
  const m = P.x === Q.x && P.y === Q.y ? mod((3 * P.x * P.x + C.a) * inv(2 * P.y, p), p) : mod((Q.y - P.y) * inv(Q.x - P.x, p), p);
  const x = mod(m * m - P.x - Q.x, p);
  const y = mod(m * (P.x - x) - P.y, p);
  return { x, y };
}

/** P, 2P, 3P, … up to and including the first O. */
export function multiples(C: Curve, P: ECPoint): ECPoint[] {
  const out: ECPoint[] = [];
  let R: ECPoint = P;
  for (let i = 1; i <= 4 * C.p; i++) {
    out.push(R);
    if (!R) break;
    R = ecAdd(C, R, P);
  }
  return out;
}

export const ptStr = (P: ECPoint) => (P ? `(${P.x}, ${P.y})` : 'O');

/* real curve y² = x³ + a x + b, for the chord-and-tangent picture */

export interface RealPt {
  x: number;
  y: number;
}

/** Point on the real curve with the given x, on the upper or lower half; null if x³+ax+b < 0. */
export function realPoint(a: number, b: number, x: number, upper: boolean): RealPt | null {
  const r = x * x * x + a * x + b;
  if (r < 0) return null;
  const y = Math.sqrt(r);
  return { x, y: upper ? y : -y };
}

/** Chord-and-tangent addition on the real curve. Returns the third intersection too. */
export function realAdd(a: number, P: RealPt, Q: RealPt): { m: number | null; third: RealPt | null; sum: RealPt | null } {
  const same = Math.abs(P.x - Q.x) < 1e-12 && Math.abs(P.y - Q.y) < 1e-12;
  if (!same && Math.abs(P.x - Q.x) < 1e-12) return { m: null, third: null, sum: null };
  if (same && Math.abs(P.y) < 1e-12) return { m: null, third: null, sum: null };
  const m = same ? (3 * P.x * P.x + a) / (2 * P.y) : (Q.y - P.y) / (Q.x - P.x);
  const x = m * m - P.x - Q.x;
  const y3 = P.y + m * (x - P.x);
  return { m, third: { x, y: y3 }, sum: { x, y: -y3 } };
}
