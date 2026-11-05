/*
 * 현대대수학: a small toolkit for finite groups, shared by the lessons.
 *
 * Elements of a group are the numbers 0 … n−1; `mul(a, b)` is the product ab and `id` the identity.
 * The product of symmetries and permutations is composition, read like functions: ab means
 * "do b first, then a". No imports, so node can run this file directly.
 */

export interface Group {
  name: string;
  n: number;
  mul: (a: number, b: number) => number;
  id: number;
  label: (a: number) => string;
  /** The symbol to show for the operation in tables: '+' for ℤ/n, '·' otherwise. */
  op?: string;
}

export const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
/** Superscript digits: sup(12) = "¹²". */
export const sup = (k: number) => String(k).split('').map((d) => SUP[+d]).join('');

/** Build a group from an explicit list of elements and a product on them (by key). */
function fromElements<T>(name: string, els: T[], key: (x: T) => string, prod: (x: T, y: T) => T, idEl: T, label: (x: T) => string, op?: string): Group {
  const index = new Map(els.map((e, i) => [key(e), i] as [string, number]));
  const n = els.length;
  const tab = new Int16Array(n * n);
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++) {
      const k = index.get(key(prod(els[a], els[b])));
      if (k === undefined) throw new Error(`${name}: product not closed`);
      tab[a * n + b] = k;
    }
  const id = index.get(key(idEl))!;
  return { name, n, id, mul: (a, b) => tab[a * n + b], label: (a) => label(els[a]), op };
}

/* ───────── constructors ───────── */

/** ℤ/n under addition mod n. Element k is the residue k. */
export function cyclic(n: number): Group {
  return { name: `ℤ/${n}`, n, id: 0, mul: (a, b) => (a + b) % n, label: (a) => String(a), op: '+' };
}

/**
 * The dihedral group D_n of a regular n-gon, of order 2n. Elements 0 … n−1 are the rotations r^k,
 * n … 2n−1 the reflections s r^k. r turns by 360°/n counterclockwise, s mirrors across the
 * vertical axis, and r s = s r⁻¹.
 */
export function dihedral(n: number): Group {
  const label = (a: number) => {
    const refl = a >= n;
    const k = a % n;
    const r = k === 0 ? '' : k === 1 ? 'r' : `r${sup(k)}`;
    if (!refl) return k === 0 ? 'e' : r;
    return k === 0 ? 's' : `s${r}`;
  };
  // (s^e1 r^a)(s^e2 r^b) = s^(e1+e2) r^(±a + b), with −a when e2 = 1
  const mul = (x: number, y: number) => {
    const e1 = x >= n ? 1 : 0, a = x % n;
    const e2 = y >= n ? 1 : 0, b = y % n;
    const e = (e1 + e2) % 2;
    const k = (((e2 ? -a : a) + b) % n + n) % n;
    return e * n + k;
  };
  return { name: `D${n}`, n: 2 * n, id: 0, mul, label };
}

/** The 2×2 matrix of element a of D_n acting on the plane: [[m00, m01], [m10, m11]]. */
export function dihedralMatrix(n: number, a: number): [number, number, number, number] {
  const k = a % n;
  const t = (2 * Math.PI * k) / n;
  const c = Math.cos(t), s = Math.sin(t);
  // rotation R = [[c, −s], [s, c]]; reflection S = [[−1, 0], [0, 1]]; s r^k = S·R
  if (a < n) return [c, -s, s, c];
  return [-c, s, s, c];
}

/** Write a permutation (0-based array) in 1-based cycle notation, fixed points omitted. */
export function cycleNotation(p: number[]): string {
  const seen = new Array(p.length).fill(false);
  const out: string[] = [];
  for (let i = 0; i < p.length; i++) {
    if (seen[i] || p[i] === i) {
      seen[i] = true;
      continue;
    }
    const cyc: number[] = [];
    let j = i;
    while (!seen[j]) {
      seen[j] = true;
      cyc.push(j + 1);
      j = p[j];
    }
    out.push(`(${cyc.join(' ')})`);
  }
  return out.length ? out.join('') : 'e';
}

function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  const rec = (pre: number[], rest: number[]) => {
    if (!rest.length) out.push(pre);
    rest.forEach((x, i) => rec([...pre, x], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  rec([], Array.from({ length: n }, (_, i) => i));
  return out;
}

/** The sign of a permutation: +1 even, −1 odd. */
export function sign(p: number[]): number {
  let s = 1;
  const seen = new Array(p.length).fill(false);
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = p[j]) {
      seen[j] = true;
      len++;
    }
    if (len % 2 === 0) s = -s;
  }
  return s;
}

/** Composition of permutations: (p∘q)(i) = p[q[i]], i.e. q first. */
export const compose = (p: number[], q: number[]) => q.map((x) => p[x]);

/** The symmetric group S_n of all permutations of {1, …, n}, in lexicographic order (identity first). */
export function symmetric(n: number): Group & { perm: (a: number) => number[] } {
  const els = permutations(n);
  const g = fromElements(`S${n}`, els, (p) => p.join(','), compose, els[0], cycleNotation);
  return { ...g, perm: (a: number) => els[a] };
}

/** The alternating group A_n: the even permutations of {1, …, n}. */
export function alternating(n: number): Group & { perm: (a: number) => number[] } {
  const els = permutations(n).filter((p) => sign(p) === 1);
  const g = fromElements(`A${n}`, els, (p) => p.join(','), compose, els[0], cycleNotation);
  return { ...g, perm: (a: number) => els[a] };
}

/** (ℤ/n)ˣ: the residues coprime to n under multiplication mod n. */
export function unitsMod(n: number): Group & { value: (a: number) => number } {
  const els = Array.from({ length: n }, (_, k) => k).filter((k) => gcd(k, n) === 1 && (n > 1 || k === 0));
  const g = fromElements(`(ℤ/${n})ˣ`, els, String, (x, y) => (x * y) % n, 1 % n, String);
  return { ...g, value: (a: number) => els[a] };
}

/** The Klein four-group {e, a, b, c}: every element is its own inverse and ab = c. */
export function kleinFour(): Group {
  const names = ['e', 'a', 'b', 'c'];
  return { name: 'V₄', n: 4, id: 0, mul: (x, y) => x ^ y, label: (a) => names[a] };
}

/** The quaternion group Q₈ = {±1, ±i, ±j, ±k} with i² = j² = k² = ijk = −1. */
export function quaternion(): Group {
  // element = 4·(sign bit) + unit, unit 0 = 1, 1 = i, 2 = j, 3 = k
  const U = ['1', 'i', 'j', 'k'];
  // unit products: [result unit, negate?]
  const T: [number, number][][] = [
    [[0, 0], [1, 0], [2, 0], [3, 0]],
    [[1, 0], [0, 1], [3, 0], [2, 1]],
    [[2, 0], [3, 1], [0, 1], [1, 0]],
    [[3, 0], [2, 0], [1, 1], [0, 1]],
  ];
  const mul = (x: number, y: number) => {
    const sx = x >> 2, ux = x & 3, sy = y >> 2, uy = y & 3;
    const [u, neg] = T[ux][uy];
    return (((sx + sy + neg) % 2) << 2) | u;
  };
  return { name: 'Q₈', n: 8, id: 0, mul, label: (a) => (a >> 2 ? '−' : '') + U[a & 3] };
}

/* ───────── helpers ───────── */

export function inverse(G: Group, a: number): number {
  for (let b = 0; b < G.n; b++) if (G.mul(a, b) === G.id) return b;
  throw new Error('no inverse');
}

/** The powers e, a, a², … up to (not including) the first repeat of e. */
export function powers(G: Group, a: number): number[] {
  const out = [G.id];
  let x = a;
  while (x !== G.id) {
    out.push(x);
    x = G.mul(x, a);
    if (out.length > G.n) throw new Error('order exceeds group size');
  }
  return out;
}

/** The order of a: the least k ≥ 1 with a^k = e. */
export const order = (G: Group, a: number) => powers(G, a).length;

export const isAbelian = (G: Group) => {
  for (let a = 0; a < G.n; a++) for (let b = a + 1; b < G.n; b++) if (G.mul(a, b) !== G.mul(b, a)) return false;
  return true;
};

/** The smallest subgroup containing the given elements, sorted. */
export function subgroupGenerated(G: Group, gens: number[]): number[] {
  const inH = new Uint8Array(G.n);
  inH[G.id] = 1;
  const list = [G.id];
  const gs = gens.filter((g) => g !== G.id);
  for (let i = 0; i < list.length; i++)
    for (const g of gs) {
      const x = G.mul(list[i], g);
      if (!inH[x]) {
        inH[x] = 1;
        list.push(x);
      }
    }
  return list.sort((a, b) => a - b);
}

/**
 * Every subgroup of a small group, sorted by size then by elements. Every subgroup is the join of its
 * cyclic subgroups, so we start from the cyclic ones and keep joining pairs until nothing new appears.
 */
export function allSubgroups(G: Group): number[][] {
  const seen = new Map<string, number[]>();
  const add = (h: number[]) => {
    const k = h.join(',');
    if (seen.has(k)) return false;
    seen.set(k, h);
    return true;
  };
  for (let a = 0; a < G.n; a++) add(subgroupGenerated(G, [a]));
  let changed = true;
  while (changed) {
    changed = false;
    const hs = [...seen.values()];
    for (let i = 0; i < hs.length; i++)
      for (let j = i + 1; j < hs.length; j++) if (add(subgroupGenerated(G, [...hs[i], ...hs[j]]))) changed = true;
  }
  return [...seen.values()].sort((x, y) => x.length - y.length || x.join(',').localeCompare(y.join(','), undefined, { numeric: true }));
}

/** Is the subset H closed under the product and inverses, with e in it? */
export function isSubgroup(G: Group, H: number[]): boolean {
  const s = new Set(H);
  if (!s.has(G.id)) return false;
  for (const a of H) {
    if (!s.has(inverse(G, a))) return false;
    for (const b of H) if (!s.has(G.mul(a, b))) return false;
  }
  return true;
}

/**
 * The cosets of H, in the order their first element appears (the coset of e, which is H, first).
 * 'left' gives gH = {gh}, 'right' gives Hg = {hg}. Each coset is sorted.
 */
export function cosets(G: Group, H: number[], side: 'left' | 'right' = 'left'): number[][] {
  const done = new Uint8Array(G.n);
  const out: number[][] = [];
  for (let g = 0; g < G.n; g++) {
    if (done[g]) continue;
    const c = H.map((h) => (side === 'left' ? G.mul(g, h) : G.mul(h, g))).sort((a, b) => a - b);
    for (const x of c) done[x] = 1;
    out.push(c);
  }
  return out;
}

/** H is normal when gHg⁻¹ = H for every g (equivalently gH = Hg). */
export function isNormal(G: Group, H: number[]): boolean {
  const s = new Set(H);
  for (let g = 0; g < G.n; g++) {
    const gi = inverse(G, g);
    for (const h of H) if (!s.has(G.mul(G.mul(g, h), gi))) return false;
  }
  return true;
}

/** The full multiplication table: table(G)[a][b] = ab. */
export function table(G: Group): number[][] {
  return Array.from({ length: G.n }, (_, a) => Array.from({ length: G.n }, (_, b) => G.mul(a, b)));
}

/** How many elements have each order, as [order, count] pairs sorted by order. */
export function orderCounts(G: Group): [number, number][] {
  const m = new Map<number, number>();
  for (let a = 0; a < G.n; a++) {
    const o = order(G, a);
    m.set(o, (m.get(o) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

/** Euler's φ(n): how many of 1 … n are coprime to n. */
export function phi(n: number): number {
  let c = 0;
  for (let k = 1; k <= n; k++) if (gcd(k, n) === 1) c++;
  return c;
}

/** a^e mod m by repeated squaring, for small numbers. */
export function powMod(a: number, e: number, m: number): number {
  let r = 1 % m, b = ((a % m) + m) % m;
  while (e > 0) {
    if (e & 1) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1;
  }
  return r;
}

export const isPrime = (p: number) => {
  if (p < 2) return false;
  for (let d = 2; d * d <= p; d++) if (p % d === 0) return false;
  return true;
};
