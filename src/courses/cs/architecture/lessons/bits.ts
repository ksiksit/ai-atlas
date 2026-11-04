/* 컴퓨터 구조: pure helpers for bits, floating point, gates and adders (no React) */

/* ───────── integers ───────── */

/** Bits of an unsigned value, most significant first. Works for n ≤ 32. */
export function bitsOf(u: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.floor(u / 2 ** (n - 1 - i)) % 2);
}

export function fromBits(bits: number[]): number {
  return bits.reduce((acc, b) => acc * 2 + b, 0);
}

/** Largest unsigned value + 1 for n bits (2ⁿ). */
export const span = (n: number) => 2 ** n;

/** Read an n-bit pattern as a two's complement integer. */
export const toSigned = (u: number, n: number) => (u >= 2 ** (n - 1) ? u - 2 ** n : u);

/** Wrap any integer into n bits (what the hardware keeps). */
export const wrap = (v: number, n: number) => ((v % 2 ** n) + 2 ** n) % 2 ** n;

export const hexStr = (u: number, n: number) => u.toString(16).toUpperCase().padStart(Math.ceil(n / 4), '0');
export const binStr = (u: number, n: number) => u.toString(2).padStart(n, '0');

/** "0110 1100" style: groups of four bits. */
export const binGroups = (u: number, n: number) => binStr(u, n).replace(/(.{4})(?=.)/g, '$1 ');

/* ───────── floating point, exactly ───────── */

const view = new DataView(new ArrayBuffer(8));

export function f32ToBits(x: number): number {
  view.setFloat32(0, x);
  return view.getUint32(0);
}
export function bitsToF32(u: number): number {
  view.setUint32(0, u >>> 0);
  return view.getFloat32(0);
}

/** A dyadic rational m · 2^e with a signed BigInt mantissa: every finite float is one. */
export interface Dyadic {
  m: bigint;
  e: number;
}

/** Exact value of a float32 bit pattern, or null for Infinity / NaN. */
export function f32Dyadic(u: number): Dyadic | null {
  const sign = u >>> 31;
  const exp = (u >>> 23) & 0xff;
  const frac = u & 0x7fffff;
  if (exp === 0xff) return null;
  const m = BigInt(exp === 0 ? frac : frac | 0x800000);
  return { m: sign ? -m : m, e: exp === 0 ? -149 : exp - 150 };
}

/** Exact value of a JavaScript number (float64), or null for Infinity / NaN. */
export function f64Dyadic(x: number): Dyadic | null {
  if (!isFinite(x)) return null;
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const sign = hi >>> 31;
  const exp = (hi >>> 20) & 0x7ff;
  const frac = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  const m = exp === 0 ? frac : frac | (1n << 52n);
  return { m: sign ? -m : m, e: exp === 0 ? -1074 : exp - 1075 };
}

export function addD(a: Dyadic, b: Dyadic): Dyadic {
  const e = Math.min(a.e, b.e);
  return { m: (a.m << BigInt(a.e - e)) + (b.m << BigInt(b.e - e)), e };
}
export function mulD(a: Dyadic, b: Dyadic): Dyadic {
  return { m: a.m * b.m, e: a.e + b.e };
}
export function subD(a: Dyadic, b: Dyadic): Dyadic {
  return addD(a, { m: -b.m, e: b.e });
}

/** Every digit of a dyadic rational in decimal. 2^-k always ends after k decimal places. */
export function dyadicToDecimal(d: Dyadic): string {
  const neg = d.m < 0n;
  const m = neg ? -d.m : d.m;
  let s: string;
  if (m === 0n) s = '0';
  else if (d.e >= 0) s = (m << BigInt(d.e)).toString();
  else {
    const k = -d.e;
    const digits = (m * 5n ** BigInt(k)).toString().padStart(k + 1, '0');
    const int = digits.slice(0, digits.length - k);
    const frac = digits.slice(digits.length - k).replace(/0+$/, '');
    s = frac ? `${int}.${frac}` : int;
  }
  return (neg ? '-' : '') + s;
}

/** Split a float32 bit pattern into its three fields. */
export function f32Fields(u: number) {
  return { sign: u >>> 31, exp: (u >>> 23) & 0xff, frac: u & 0x7fffff };
}

/* ───────── gates ───────── */

export type GateId = 'and' | 'or' | 'not' | 'xor' | 'nand' | 'nor';

export const GATES: Record<GateId, { name: string; en: string; f: (a: number, b: number) => number; unary?: boolean; js: string; says: string }> = {
  and: { name: 'AND', en: 'AND', f: (a, b) => a & b, js: 'a & b', says: '둘 다 1일 때만 1' },
  or: { name: 'OR', en: 'OR', f: (a, b) => a | b, js: 'a | b', says: '하나라도 1이면 1' },
  not: { name: 'NOT', en: 'NOT', f: (a) => 1 - a, unary: true, js: '1 - a (또는 a ^ 1)', says: '입력을 뒤집음' },
  xor: { name: 'XOR', en: 'exclusive OR', f: (a, b) => a ^ b, js: 'a ^ b', says: '두 입력이 다를 때만 1' },
  nand: { name: 'NAND', en: 'NOT AND', f: (a, b) => 1 - (a & b), js: '1 - (a & b)', says: 'AND를 뒤집음: 둘 다 1일 때만 0' },
  nor: { name: 'NOR', en: 'NOT OR', f: (a, b) => 1 - (a | b), js: '1 - (a | b)', says: 'OR를 뒤집음: 둘 다 0일 때만 1' },
};

/** Full adder in gate form: the same five gates drawn in the lesson. */
export function fullAdder(a: number, b: number, cin: number) {
  const x = a ^ b;
  const g = a & b;
  const p = x & cin;
  return { x, g, p, s: x ^ cin, cout: g | p };
}

/* ───────── ripple-carry adder with unit gate delays ───────── */

/** Every wire of an n-bit ripple-carry adder. c[0] is the constant carry-in 0, c[n] the carry-out. */
export interface AdderNets {
  x: number[]; // a XOR b
  g: number[]; // a AND b (generate)
  p: number[]; // x AND carry-in (propagate the carry)
  s: number[]; // sum bit
  c: number[]; // carries, length n + 1
}

function settle(a: number, b: number, n: number): AdderNets {
  const nets: AdderNets = { x: [], g: [], p: [], s: [], c: [0] };
  for (let i = 0; i < n; i++) {
    const fa = fullAdder((a >> i) & 1, (b >> i) & 1, nets.c[i]);
    nets.x.push(fa.x);
    nets.g.push(fa.g);
    nets.p.push(fa.p);
    nets.s.push(fa.s);
    nets.c.push(fa.cout);
  }
  return nets;
}

export interface AdderFrame {
  t: number; // gate delays since the inputs changed
  nets: AdderNets;
  value: number; // what the sum outputs read right now
}

/**
 * Gate-level simulation: every gate output at time t is its function of the wires at t − 1.
 * Starts settled on (a0, b0); at t = 0 the inputs switch to (a, b). Ends when nothing changes.
 */
export function rippleTrace(a0: number, b0: number, a: number, b: number, n: number): { frames: AdderFrame[]; settledAt: number[] } {
  let cur = settle(a0, b0, n);
  const read = (nets: AdderNets) => nets.s.reduce((acc, bit, i) => acc + bit * 2 ** i, 0) + nets.c[n] * 2 ** n;
  const frames: AdderFrame[] = [{ t: 0, nets: cur, value: read(cur) }];
  const settledAt = new Array(n + 1).fill(0); // last time each sum bit (and the carry-out at index n) changed
  for (let t = 1; t < 4 * n + 8; t++) {
    const nx: AdderNets = { x: [], g: [], p: [], s: [], c: [0] };
    for (let i = 0; i < n; i++) {
      const ai = (a >> i) & 1;
      const bi = (b >> i) & 1;
      nx.x.push(ai ^ bi);
      nx.g.push(ai & bi);
      nx.p.push(cur.x[i] & cur.c[i]);
      nx.s.push(cur.x[i] ^ cur.c[i]);
      nx.c.push(cur.g[i] | cur.p[i]);
    }
    const same = (['x', 'g', 'p', 's', 'c'] as const).every((k) => nx[k].every((v, i) => v === cur[k][i]));
    if (same) break;
    for (let i = 0; i < n; i++) if (nx.s[i] !== cur.s[i]) settledAt[i] = t;
    if (nx.c[n] !== cur.c[n]) settledAt[n] = t;
    cur = nx;
    frames.push({ t, nets: cur, value: read(cur) });
  }
  return { frames, settledAt };
}
