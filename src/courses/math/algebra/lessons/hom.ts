/*
 * 현대대수학 · 준동형과 몫군: checking homomorphisms, collapsing a group into its quotient,
 * and searching for isomorphisms between small groups. Builds on the shared group.ts.
 */

import { cosets, cyclic, dihedral, isAbelian, isNormal, kleinFour, orderCounts, quaternion, symmetric, unitsMod, type Group } from './group';

/** The direct product G × H, elements (g, h) numbered g·|H| + h. */
export function product(G: Group, H: Group, name?: string): Group {
  const n = G.n * H.n;
  return {
    name: name ?? `${G.name}×${H.name}`,
    n,
    id: G.id * H.n + H.id,
    mul: (a, b) => G.mul(Math.floor(a / H.n), Math.floor(b / H.n)) * H.n + H.mul(a % H.n, b % H.n),
    label: (a) => `(${G.label(Math.floor(a / H.n))}, ${H.label(a % H.n)})`,
    op: G.op === '+' && H.op === '+' ? '+' : undefined,
  };
}

/* ───────── is a map a homomorphism? ───────── */

export interface HomCheck {
  /** The images: f[a] is φ(a). */
  f: number[];
  /** Pairs (a, b) with φ(ab) ≠ φ(a)φ(b). */
  failures: [number, number][];
  pairs: number;
  kernel: number[];
  image: number[];
}

export function checkHom(G: Group, H: Group, f: number[]): HomCheck {
  const failures: [number, number][] = [];
  for (let a = 0; a < G.n; a++) for (let b = 0; b < G.n; b++) if (f[G.mul(a, b)] !== H.mul(f[a], f[b])) failures.push([a, b]);
  const kernel = f.map((v, a) => (v === H.id ? a : -1)).filter((a) => a >= 0);
  const image = [...new Set(f)].sort((x, y) => x - y);
  return { f, failures, pairs: G.n * G.n, kernel, image };
}

/** ℤ/n → ℤ/m sending the residue x (taken as 0 … n−1) to a·x mod m. A homomorphism iff m divides n·a. */
export const cyclicMap = (n: number, m: number, a: number) => Array.from({ length: n }, (_, x) => (a * x) % m);

/** D_n → ℤ/m sending s^e r^k (element e·n + k of dihedral(n)) to e·b + k·a mod m, where φ(r) = a and φ(s) = b. */
export const dihedralMap = (n: number, m: number, a: number, b: number) => Array.from({ length: 2 * n }, (_, x) => ((x >= n ? b : 0) + (x % n) * a) % m);

/* ───────── collapsing the table into cosets ───────── */

export interface Quotient {
  /** Left cosets, the subgroup first. */
  blocks: number[][];
  /** Which block each element is in. */
  blockOf: number[];
  /** The elements in table order: block by block. */
  order: number[];
  /** For each pair of blocks (i, j), the blocks that products a·b with a ∈ block i, b ∈ block j land in. */
  products: number[][][];
  /** True when every pair of blocks multiplies into a single block: then the blocks form the group G/N. */
  wellDefined: boolean;
  /** How many block pairs (i, j) land in more than one block. */
  bad: number;
  normal: boolean;
}

export function quotient(G: Group, N: number[]): Quotient {
  const blocks = cosets(G, N, 'left');
  const blockOf = new Array(G.n);
  blocks.forEach((b, i) => b.forEach((x) => (blockOf[x] = i)));
  const products = blocks.map((A) => blocks.map((B) => [...new Set(A.flatMap((a) => B.map((b) => blockOf[G.mul(a, b)])))].sort((x, y) => x - y)));
  const bad = products.flat().filter((s) => s.length > 1).length;
  return { blocks, blockOf, order: blocks.flat(), products, wellDefined: bad === 0, bad, normal: isNormal(G, N) };
}

/** The quotient G/N as a Group of its own (only when well-defined); element i is the i-th coset. */
export function quotientGroup(G: Group, N: number[], label?: (i: number) => string): Group | null {
  const q = quotient(G, N);
  if (!q.wellDefined) return null;
  return { name: `${G.name}/N`, n: q.blocks.length, id: q.blockOf[G.id], mul: (i, j) => q.products[i][j][0], label: label ?? ((i) => `${G.label(q.blocks[i][0])}N`), op: G.op };
}

/* ───────── isomorphisms between small groups ───────── */

/** A small generating set, picked greedily: add elements of largest order until they generate G. */
export function generators(G: Group): number[] {
  const byOrder = Array.from({ length: G.n }, (_, a) => a).sort((a, b) => orderOf(G, b) - orderOf(G, a) || a - b);
  const gens: number[] = [];
  let have = closure(G, gens);
  for (const g of byOrder) {
    if (have.size === G.n) break;
    if (have.has(g)) continue;
    gens.push(g);
    have = closure(G, gens);
  }
  return gens;
}

function orderOf(G: Group, a: number): number {
  let k = 1, x = a;
  while (x !== G.id) {
    x = G.mul(x, a);
    k++;
  }
  return k;
}

function closure(G: Group, gens: number[]): Set<number> {
  const s = new Set([G.id]);
  const list = [G.id];
  for (let i = 0; i < list.length; i++)
    for (const g of gens) {
      const x = G.mul(list[i], g);
      if (!s.has(x)) {
        s.add(x);
        list.push(x);
      }
    }
  return s;
}

/**
 * Look for an isomorphism G → H: try every assignment of the generators of G to elements of H of the
 * same order, extend it along words in the generators, and keep the first that is a bijective
 * homomorphism. Returns the map (f[a] = φ(a)) or null. Fine for the groups of order ≤ 16 used here.
 */
export function findIsomorphism(G: Group, H: Group): number[] | null {
  if (G.n !== H.n) return null;
  const gens = generators(G);
  const cand = gens.map((g) => Array.from({ length: H.n }, (_, h) => h).filter((h) => orderOf(H, h) === orderOf(G, g)));
  const pick = new Array(gens.length).fill(0);
  const tryIt = (): number[] | null => {
    const f = new Array(G.n).fill(-1);
    f[G.id] = H.id;
    const list = [G.id];
    for (let i = 0; i < list.length; i++)
      for (let k = 0; k < gens.length; k++) {
        const x = G.mul(list[i], gens[k]);
        const y = H.mul(f[list[i]], cand[k][pick[k]]);
        if (f[x] === -1) {
          f[x] = y;
          list.push(x);
        } else if (f[x] !== y) return null;
      }
    if (new Set(f).size !== G.n) return null;
    for (let a = 0; a < G.n; a++) for (let b = 0; b < G.n; b++) if (f[G.mul(a, b)] !== H.mul(f[a], f[b])) return null;
    return f;
  };
  const rec = (k: number): number[] | null => {
    if (k === gens.length) return tryIt();
    for (let i = 0; i < cand[k].length; i++) {
      pick[k] = i;
      const r = rec(k + 1);
      if (r) return r;
    }
    return null;
  };
  if (cand.some((c) => !c.length)) return null;
  return rec(0);
}

/** "1개 · 2:3개 · 4:4개": the element-order profile as text. */
export const profileText = (G: Group) => orderCounts(G).map(([o, c]) => `위수 ${o}: ${c}`).join(', ');
export const sameProfile = (G: Group, H: Group) => JSON.stringify(orderCounts(G)) === JSON.stringify(orderCounts(H));

/* ───────── the catalogue of small groups for the comparison figure ───────── */

export interface Entry {
  id: string;
  tex: string;
  make: () => Group;
}

export const CATALOGUE: Entry[] = [
  { id: 'z4', tex: '\\mathbb{Z}/4', make: () => cyclic(4) },
  { id: 'v4', tex: 'V_4', make: () => kleinFour() },
  { id: 'u5', tex: '(\\mathbb{Z}/5)^\\times', make: () => unitsMod(5) },
  { id: 'u8', tex: '(\\mathbb{Z}/8)^\\times', make: () => unitsMod(8) },
  { id: 'z6', tex: '\\mathbb{Z}/6', make: () => cyclic(6) },
  { id: 'z2z3', tex: '\\mathbb{Z}/2\\times\\mathbb{Z}/3', make: () => product(cyclic(2), cyclic(3)) },
  { id: 's3', tex: 'S_3', make: () => symmetric(3) },
  { id: 'd3', tex: 'D_3', make: () => dihedral(3) },
  { id: 'z8', tex: '\\mathbb{Z}/8', make: () => cyclic(8) },
  { id: 'z4z2', tex: '\\mathbb{Z}/4\\times\\mathbb{Z}/2', make: () => product(cyclic(4), cyclic(2)) },
  { id: 'z2cube', tex: '(\\mathbb{Z}/2)^3', make: () => product(product(cyclic(2), cyclic(2)), cyclic(2), 'ℤ/2×ℤ/2×ℤ/2') },
  { id: 'u15', tex: '(\\mathbb{Z}/15)^\\times', make: () => unitsMod(15) },
  { id: 'd4', tex: 'D_4', make: () => dihedral(4) },
  { id: 'q8', tex: 'Q_8', make: () => quaternion() },
  { id: 'z4z4', tex: '\\mathbb{Z}/4\\times\\mathbb{Z}/4', make: () => product(cyclic(4), cyclic(4)) },
  { id: 'q8z2', tex: 'Q_8\\times\\mathbb{Z}/2', make: () => product(quaternion(), cyclic(2)) },
];

export function compare(a: Entry, b: Entry): { G: Group; H: Group; same: boolean; iso: number[] | null; abelianG: boolean; abelianH: boolean } {
  const G = a.make(), H = b.make();
  const iso = findIsomorphism(G, H);
  return { G, H, same: G.n === H.n && sameProfile(G, H), iso, abelianG: isAbelian(G), abelianH: isAbelian(H) };
}
