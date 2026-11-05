/*
 * 위상수학 · 곡면의 분류: gluing words, Euler characteristic, meshes, and walking across glued edges.
 * No imports, so node can run it directly.
 */

/* ───────── gluing words ───────── */

/** One edge of a polygon read counterclockwise: a letter and whether it is traversed forwards (+1) or backwards (−1). */
export interface Edge {
  l: string;
  s: 1 | -1;
}

/** Parse "a b a' b'" style words: a trailing ' means the inverse. */
export function parseWord(w: string): Edge[] {
  return w
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => (t.endsWith("'") ? { l: t.slice(0, -1), s: -1 as const } : { l: t, s: 1 as const }));
}

export const wordTex = (es: Edge[]) => es.map((e) => (e.s === 1 ? e.l : `${e.l}^{-1}`)).join('');

export interface GluingInfo {
  V: number;
  E: number;
  F: number;
  chi: number;
  /** Edges whose letter appears once stay free: they form the boundary. */
  boundaryEdges: number;
  orientable: boolean;
  /** Vertex class of each polygon corner (corner k starts edge k). */
  cornerClass: number[];
}

/**
 * Cell structure of the polygon after gluing: one face, one edge per letter, and vertices as classes of
 * corners. Edge k runs from corner k to corner k+1 when s = +1 and the other way when s = −1; two edges
 * with the same letter are glued start to start and end to end.
 */
export function analyse(es: Edge[]): GluingInfo {
  const n = es.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const ends = (k: number): [number, number] => (es[k].s === 1 ? [k, (k + 1) % n] : [(k + 1) % n, k]);
  const seen = new Map<string, number>();
  es.forEach((e, k) => {
    const j = seen.get(e.l);
    if (j === undefined) {
      seen.set(e.l, k);
      return;
    }
    const [a0, a1] = ends(j);
    const [b0, b1] = ends(k);
    union(a0, b0);
    union(a1, b1);
  });
  const roots = new Map<number, number>();
  const cornerClass = Array.from({ length: n }, (_, i) => {
    const r = find(i);
    if (!roots.has(r)) roots.set(r, roots.size);
    return roots.get(r)!;
  });
  const counts = new Map<string, Edge[]>();
  es.forEach((e) => counts.set(e.l, [...(counts.get(e.l) ?? []), e]));
  let orientable = true;
  let boundaryEdges = 0;
  counts.forEach((list) => {
    if (list.length === 1) boundaryEdges++;
    // a letter met twice in the same direction reverses the orientation of whatever crosses it
    if (list.length === 2 && list[0].s === list[1].s) orientable = false;
  });
  const V = roots.size;
  const E = counts.size;
  return { V, E, F: 1, chi: V - E + 1, boundaryEdges, orientable, cornerClass };
}

/* ───────── the square presets ───────── */

export type SquareId = 'sphere' | 'cylinder' | 'mobius' | 'torus' | 'klein' | 'projective';

/** Square edges counterclockwise: bottom (→), right (↑), top (←), left (↓). */
export const SQUARES: { id: SquareId; name: string; word: string; note: string }[] = [
  { id: 'sphere', name: '구', word: "a a' b b'", note: '이웃한 변끼리 접어 붙입니다. 봉투를 닫듯 접으면 공 모양이 됩니다.' },
  { id: 'cylinder', name: '원기둥', word: "c a d a'", note: '왼쪽과 오른쪽 변을 같은 방향으로 붙입니다. 위아래 변은 그대로 둡니다.' },
  { id: 'mobius', name: '뫼비우스 띠', word: 'c a d a', note: '왼쪽과 오른쪽 변을 한 번 뒤집어 붙입니다.' },
  { id: 'torus', name: '토러스', word: "a b a' b'", note: '두 쌍 모두 같은 방향으로 붙입니다. 도넛 표면입니다.' },
  { id: 'klein', name: '클라인 병', word: "a b a b'", note: '왼쪽과 오른쪽은 그대로, 위와 아래는 뒤집어 붙입니다.' },
  { id: 'projective', name: '사영 평면', word: 'a b a b', note: '두 쌍 모두 뒤집어 붙입니다.' },
];

/**
 * How each pair of opposite sides of the square is glued, for walking across it:
 * 'free' (a boundary), 'same' (translate) or 'flip' (translate and mirror).
 */
export function opposite(id: SquareId): { lr: 'free' | 'same' | 'flip'; tb: 'free' | 'same' | 'flip' } | null {
  if (id === 'sphere') return null;
  const es = parseWord(SQUARES.find((s) => s.id === id)!.word);
  // bottom = 0 (→ when +), right = 1 (↑), top = 2 (← when +), left = 3 (↓ when +)
  const pair = (i: number, j: number) => {
    if (es[i].l !== es[j].l) return 'free' as const;
    // directions along the shared axis: bottom → is +x, top ← is −x; right ↑ is +y, left ↓ is −y
    return es[i].s === -es[j].s ? ('same' as const) : ('flip' as const);
  };
  return { lr: pair(1, 3), tb: pair(0, 2) };
}

/* ───────── walking across the glued edges ───────── */

export interface Walker {
  x: number;
  y: number;
  /** heading in radians, measured from +x counterclockwise (y up) */
  dir: number;
  /** +1 while the little hand-marker is as it started, −1 when it has been mirrored */
  hand: 1 | -1;
  /** crossings so far, and whether the walker has hit a free (boundary) edge */
  crossings: number;
  stopped: boolean;
}

export const startWalker = (): Walker => ({ x: 0.3, y: 0.35, dir: 0.32, hand: 1, crossings: 0, stopped: false });

/** Advance by ds in the unit square, re-entering through glued edges. */
export function walk(w: Walker, ds: number, glue: { lr: 'free' | 'same' | 'flip'; tb: 'free' | 'same' | 'flip' }): Walker {
  if (w.stopped) return w;
  let { x, y, dir, hand, crossings } = w;
  x += Math.cos(dir) * ds;
  y += Math.sin(dir) * ds;
  if (x > 1 || x < 0) {
    if (glue.lr === 'free') return { ...w, x: Math.max(0, Math.min(1, x)), y, stopped: true };
    x = x > 1 ? x - 1 : x + 1;
    crossings++;
    if (glue.lr === 'flip') {
      y = 1 - y;
      dir = -dir;
      hand = -hand as 1 | -1;
    }
  }
  if (y > 1 || y < 0) {
    if (glue.tb === 'free') return { ...w, x, y: Math.max(0, Math.min(1, y)), stopped: true };
    y = y > 1 ? y - 1 : y + 1;
    crossings++;
    if (glue.tb === 'flip') {
      x = 1 - x;
      dir = Math.PI - dir;
      hand = -hand as 1 | -1;
    }
  }
  return { x, y, dir, hand, crossings, stopped: false };
}

/* ───────── meshes for V − E + F ───────── */

export type MeshId = 'cube' | 'torus' | 'double';

export interface Mesh {
  /** 3-D vertex positions */
  pts: [number, number, number][];
  edges: [number, number][];
  faces: number;
  V: number;
  E: number;
  F: number;
}

/** Collect a mesh from quads given by four 3-D points; vertices are merged by position, edges by endpoint pair. */
function fromQuads(quads: [number, number, number][][], tri: boolean): Mesh {
  const key = (p: [number, number, number]) => p.map((v) => Math.round(v * 1e6)).join(',');
  const idx = new Map<string, number>();
  const pts: [number, number, number][] = [];
  const id = (p: [number, number, number]) => {
    const k = key(p);
    if (!idx.has(k)) {
      idx.set(k, pts.length);
      pts.push(p);
    }
    return idx.get(k)!;
  };
  const edgeSet = new Map<string, [number, number]>();
  const addEdge = (a: number, b: number) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!edgeSet.has(k)) edgeSet.set(k, [a, b]);
  };
  let faces = 0;
  for (const q of quads) {
    const v = q.map(id);
    for (let i = 0; i < 4; i++) addEdge(v[i], v[(i + 1) % 4]);
    if (tri) {
      addEdge(v[0], v[2]);
      faces += 2;
    } else faces += 1;
  }
  const edges = [...edgeSet.values()];
  return { pts, edges, faces, V: pts.length, E: edges.length, F: faces };
}

/** Cube surface with each face cut into n×n squares (optionally each square into two triangles). */
export function cubeMesh(n: number, tri: boolean): Mesh {
  const quads: [number, number, number][][] = [];
  const faces: { o: [number, number, number]; u: [number, number, number]; v: [number, number, number] }[] = [
    { o: [-1, -1, 1], u: [2, 0, 0], v: [0, 2, 0] },
    { o: [1, -1, -1], u: [-2, 0, 0], v: [0, 2, 0] },
    { o: [1, -1, 1], u: [0, 0, -2], v: [0, 2, 0] },
    { o: [-1, -1, -1], u: [0, 0, 2], v: [0, 2, 0] },
    { o: [-1, 1, 1], u: [2, 0, 0], v: [0, 0, -2] },
    { o: [-1, -1, -1], u: [2, 0, 0], v: [0, 0, 2] },
  ];
  const at = (f: (typeof faces)[number], s: number, t: number): [number, number, number] => [0, 1, 2].map((k) => f.o[k] + f.u[k] * s + f.v[k] * t) as [number, number, number];
  for (const f of faces)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) quads.push([at(f, i / n, j / n), at(f, (i + 1) / n, j / n), at(f, (i + 1) / n, (j + 1) / n), at(f, i / n, (j + 1) / n)]);
  return fromQuads(quads, tri);
}

/** Torus with m segments around the tube's long way and k around its cross-section. */
export function torusMesh(m: number, k: number, tri: boolean): Mesh {
  const R = 1, r = 0.42;
  const at = (i: number, j: number): [number, number, number] => {
    const u = ((i % m) / m) * Math.PI * 2, v = ((j % k) / k) * Math.PI * 2;
    return [(R + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v), (R + r * Math.cos(v)) * Math.sin(u)];
  };
  const quads: [number, number, number][][] = [];
  for (let i = 0; i < m; i++) for (let j = 0; j < k; j++) quads.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
  return fromQuads(quads, tri);
}

/** Two tori joined: a genus-2 surface built as two torus meshes with one square face removed from each and the holes connected by a short tube. */
export function doubleTorusMesh(m: number, k: number, tri: boolean): Mesh {
  const R = 1, r = 0.42;
  const at = (cx: number, i: number, j: number): [number, number, number] => {
    const u = ((i % m) / m) * Math.PI * 2, v = ((j % k) / k) * Math.PI * 2;
    return [cx + (R + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v), (R + r * Math.cos(v)) * Math.sin(u)];
  };
  const quads: [number, number, number][][] = [];
  // the removed squares face each other: on the left torus the one at u = 0 on the outside, on the right at u = π
  const holeL = { i: 0, j: 0 }, holeR = { i: Math.floor(m / 2), j: 0 };
  for (let i = 0; i < m; i++)
    for (let j = 0; j < k; j++) {
      if (!(i === holeL.i && j === holeL.j)) quads.push([at(-1.45, i, j), at(-1.45, i + 1, j), at(-1.45, i + 1, j + 1), at(-1.45, i, j + 1)]);
      if (!(i === holeR.i && j === holeR.j)) quads.push([at(1.45, i, j), at(1.45, i + 1, j), at(1.45, i + 1, j + 1), at(1.45, i, j + 1)]);
    }
  // the tube: four quads joining the two square holes corner to corner
  const L = [at(-1.45, holeL.i, holeL.j), at(-1.45, holeL.i + 1, holeL.j), at(-1.45, holeL.i + 1, holeL.j + 1), at(-1.45, holeL.i, holeL.j + 1)];
  const Rr = [at(1.45, holeR.i + 1, holeR.j), at(1.45, holeR.i, holeR.j), at(1.45, holeR.i, holeR.j + 1), at(1.45, holeR.i + 1, holeR.j + 1)];
  for (let s = 0; s < 4; s++) quads.push([L[s], L[(s + 1) % 4], Rr[(s + 1) % 4], Rr[s]]);
  return fromQuads(quads, tri);
}

export function meshFor(id: MeshId, n: number, tri: boolean): Mesh {
  if (id === 'cube') return cubeMesh(n, tri);
  if (id === 'torus') return torusMesh(4 * n + 4, 2 * n + 2, tri);
  return doubleTorusMesh(4 * n + 4, 2 * n + 2, tri);
}

/** The five Platonic solids: V, E, F. */
export const PLATONIC = [
  { name: '정사면체', V: 4, E: 6, F: 4 },
  { name: '정육면체', V: 8, E: 12, F: 6 },
  { name: '정팔면체', V: 6, E: 12, F: 8 },
  { name: '정십이면체', V: 20, E: 30, F: 12 },
  { name: '정이십면체', V: 12, E: 30, F: 20 },
];

/* ───────── connected sums: the standard words ───────── */

/** Word of the connected sum of g tori and k projective planes (the sphere if both are 0). */
export function standardWord(g: number, k: number): Edge[] {
  if (g === 0 && k === 0) return parseWord("a a'");
  const out: Edge[] = [];
  for (let i = 1; i <= g; i++) out.push({ l: `a${i}`, s: 1 }, { l: `b${i}`, s: 1 }, { l: `a${i}`, s: -1 }, { l: `b${i}`, s: -1 });
  for (let i = 1; i <= k; i++) out.push({ l: `c${i}`, s: 1 }, { l: `c${i}`, s: 1 });
  return out;
}

export function standardTex(g: number, k: number): string {
  if (g === 0 && k === 0) return 'aa^{-1}';
  const parts: string[] = [];
  for (let i = 1; i <= g; i++) parts.push(`a_{${i}}b_{${i}}a_{${i}}^{-1}b_{${i}}^{-1}`);
  for (let i = 1; i <= k; i++) parts.push(`c_{${i}}c_{${i}}`);
  return parts.join('\\,');
}

/** Name of the closed surface with g tori and k projective planes summed. */
export function surfaceName(g: number, k: number): string {
  if (k === 0) return g === 0 ? '구' : g === 1 ? '토러스' : `구멍 ${g}개짜리 곡면`;
  const total = 2 * g + k; // T # P = P # P # P
  if (total === 1) return '사영 평면';
  if (total === 2) return '클라인 병';
  return `사영 평면 ${total}개의 연결합`;
}
