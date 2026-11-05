/*
 * 컴퓨터 그래픽스 · 레이 트레이싱: pure logic for the lesson's figures.
 *  1. a 2-D top-down scene (circles stand in for spheres) traced ray by ray
 *  2. a small 3-D ray tracer that renders rows into the course's Framebuffer
 *  3. a 2-D bounding-volume hierarchy over many circles, with exact test counts
 * No DOM here, so node can run it directly.
 */

import { Framebuffer, add, cross, dot, mix, mulv, normalize, reflect, scale, sub, type RGB, type Vec3 } from './gfx';
import { rng } from '../../../../lib/math';

/* ───────── shared: ray–circle (2-D) and ray–sphere (3-D) are the same quadratic ───────── */

export type P2 = [number, number];

export interface Quadratic {
  a: number;
  b: number;
  c: number;
  disc: number;
  /** Nearest root with t > eps, or null when the ray misses (disc < 0) or the sphere is behind. */
  t: number | null;
}

/**
 * Ray o + t·d against a circle/sphere with centre ce and radius r: substitute into |p − ce|² = r²
 * and get a·t² + b·t + c = 0 with a = d·d, b = 2 d·(o − ce), c = |o − ce|² − r².
 */
export function solveHit(o: number[], d: number[], ce: number[], r: number, eps = 1e-6): Quadratic {
  let a = 0, b = 0, c = -r * r;
  for (let k = 0; k < o.length; k++) {
    const oc = o[k] - ce[k];
    a += d[k] * d[k];
    b += 2 * d[k] * oc;
    c += oc * oc;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return { a, b, c, disc, t: null };
  const s = Math.sqrt(disc);
  const t0 = (-b - s) / (2 * a);
  const t1 = (-b + s) / (2 * a);
  const t = t0 > eps ? t0 : t1 > eps ? t1 : null;
  return { a, b, c, disc, t };
}

/* ───────── 1. the 2-D scene ───────── */

export interface Circle2 {
  c: P2;
  r: number;
  mirror: boolean;
  name: string;
}

/** World box of the top-down view: x across, y away from the eye. */
export const WORLD = { w: 10, h: 7 };
export const WALL_Y = 6.6;
export const EYE: P2 = [5, 0.5];
/** Image plane: the segment y = PLANE_Y between PLANE_X[0] and PLANE_X[1]. */
export const PLANE_Y = 1.5;
export const PLANE_X: [number, number] = [4.2, 5.8];

export const CIRCLES: Circle2[] = [
  { c: [3.1, 4.1], r: 0.85, mirror: false, name: 'A' },
  { c: [6.5, 3.4], r: 0.8, mirror: true, name: 'B' },
  { c: [5.1, 5.2], r: 0.6, mirror: false, name: 'C' },
];

export const DEFAULT_LIGHT: P2 = [8.9, 5.6];

export type Hit2 = { t: number; p: P2; n: P2; obj: number } | null;

/** Nearest hit among the circles and the back wall (obj −1). */
export function hit2(o: P2, d: P2, circles = CIRCLES): Hit2 {
  let best: Hit2 = null;
  circles.forEach((ci, k) => {
    const q = solveHit(o, d, ci.c, ci.r, 1e-4);
    if (q.t !== null && (!best || q.t < best.t)) {
      const p: P2 = [o[0] + d[0] * q.t, o[1] + d[1] * q.t];
      const n: P2 = [(p[0] - ci.c[0]) / ci.r, (p[1] - ci.c[1]) / ci.r];
      best = { t: q.t, p, n, obj: k };
    }
  });
  // the room: back wall y = WALL_Y and side walls x = 0 and x = WORLD.w (obj −1); the near side is open
  const walls: [number, number, P2][] = [];
  if (d[1] > 1e-9) walls.push([(WALL_Y - o[1]) / d[1], 1, [0, -1]]);
  if (d[0] < -1e-9) walls.push([(0 - o[0]) / d[0], 0, [1, 0]]);
  if (d[0] > 1e-9) walls.push([(WORLD.w - o[0]) / d[0], 0, [-1, 0]]);
  for (const [t, , n] of walls) {
    if (t <= 1e-4 || (best && t >= (best as { t: number }).t)) continue;
    const p: P2 = [o[0] + d[0] * t, o[1] + d[1] * t];
    if (p[0] < -1e-6 || p[0] > WORLD.w + 1e-6 || p[1] < 0 || p[1] > WALL_Y + 1e-6) continue;
    best = { t, p, n, obj: -1 };
  }
  return best;
}

export interface Segment2 {
  from: P2;
  to: P2;
  kind: 'primary' | 'shadow-lit' | 'shadow-blocked' | 'reflect' | 'miss';
}

export interface Trace2 {
  pixel: number;
  dir: P2;
  segments: Segment2[];
  /** What the eye finally sees through this pixel. */
  sees: string;
  lit: boolean;
}

const norm2 = (v: P2): P2 => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

function shade2(h: NonNullable<Hit2>, light: P2, segs: Segment2[], circles: Circle2[]): boolean {
  const toL: P2 = [light[0] - h.p[0], light[1] - h.p[1]];
  const dist = Math.hypot(toL[0], toL[1]);
  const dl = norm2(toL);
  // light behind the surface: unlit, no shadow ray needed
  if (dl[0] * h.n[0] + dl[1] * h.n[1] <= 0) return false;
  const start: P2 = [h.p[0] + h.n[0] * 1e-3, h.p[1] + h.n[1] * 1e-3];
  const block = hit2(start, dl, circles);
  const blocked = !!block && block.obj >= 0 && block.t < dist;
  segs.push({ from: h.p, to: blocked ? block!.p : light, kind: blocked ? 'shadow-blocked' : 'shadow-lit' });
  return !blocked;
}

/** Trace the ray through pixel k of n: primary ray, shadow ray, and one bounce off a mirror. */
export function trace2(k: number, n: number, light: P2, circles = CIRCLES): Trace2 {
  const x = PLANE_X[0] + ((k + 0.5) / n) * (PLANE_X[1] - PLANE_X[0]);
  const dir = norm2([x - EYE[0], PLANE_Y - EYE[1]]);
  const segs: Segment2[] = [];
  const h = hit2(EYE, dir, circles);
  if (!h) {
    segs.push({ from: EYE, to: [EYE[0] + dir[0] * 12, EYE[1] + dir[1] * 12], kind: 'miss' });
    return { pixel: k, dir, segments: segs, sees: '아무것도 없음', lit: false };
  }
  segs.push({ from: EYE, to: h.p, kind: 'primary' });
  const name = h.obj < 0 ? '벽' : circles[h.obj].name;
  if (h.obj >= 0 && circles[h.obj].mirror) {
    const dd = dir[0] * h.n[0] + dir[1] * h.n[1];
    const rd: P2 = [dir[0] - 2 * dd * h.n[0], dir[1] - 2 * dd * h.n[1]];
    const start: P2 = [h.p[0] + h.n[0] * 1e-3, h.p[1] + h.n[1] * 1e-3];
    const h2 = hit2(start, rd, circles);
    if (!h2) {
      segs.push({ from: h.p, to: [h.p[0] + rd[0] * 12, h.p[1] + rd[1] * 12], kind: 'miss' });
      return { pixel: k, dir, segments: segs, sees: `${name}에 비친 바깥`, lit: false };
    }
    segs.push({ from: h.p, to: h2.p, kind: 'reflect' });
    const lit = shade2(h2, light, segs, circles);
    return { pixel: k, dir, segments: segs, sees: `${name}에 비친 ${h2.obj < 0 ? '벽' : circles[h2.obj].name}`, lit };
  }
  const lit = shade2(h, light, segs, circles);
  return { pixel: k, dir, segments: segs, sees: name, lit };
}

/* ───────── 2. the 3-D ray tracer ───────── */

export interface Sphere3 {
  c: Vec3;
  r: number;
  color: RGB;
  /** Fraction of light that comes from the mirror direction. */
  refl: number;
  spec: number;
}

export const SPHERES: Sphere3[] = [
  { c: [-1.35, 0.55, 0.3], r: 0.55, color: [0.85, 0.25, 0.2], refl: 0.05, spec: 0.4 },
  { c: [0.15, 0.8, -0.5], r: 0.8, color: [0.9, 0.9, 0.92], refl: 0.85, spec: 0.9 },
  { c: [1.45, 0.42, 0.55], r: 0.42, color: [0.25, 0.45, 0.85], refl: 0.05, spec: 0.4 },
  { c: [-0.2, 0.28, 1.15], r: 0.28, color: [0.85, 0.85, 0.88], refl: 0.8, spec: 0.9 },
];
/** The floor y = 0 is a checkerboard that also reflects a little. */
export const FLOOR_REFL = 0.2;
export const LIGHT3: Vec3 = [-2.5, 4.5, 3];
export const CAM = { eye: [0.2, 1.35, 4.6] as Vec3, target: [0, 0.55, 0] as Vec3, fovY: (40 * Math.PI) / 180 };
const AMBIENT = 0.14;

export interface RayCounts {
  primary: number;
  shadow: number;
  reflect: number;
}

type Hit3 = { t: number; p: Vec3; n: Vec3; color: RGB; refl: number; spec: number } | null;

function hit3(o: Vec3, d: Vec3): Hit3 {
  let best: Hit3 = null;
  for (const s of SPHERES) {
    const q = solveHit(o, d, s.c, s.r, 1e-4);
    if (q.t !== null && (!best || q.t < best.t)) {
      const p = add(o, scale(d, q.t));
      best = { t: q.t, p, n: scale(sub(p, s.c), 1 / s.r), color: s.color, refl: s.refl, spec: s.spec };
    }
  }
  if (d[1] < -1e-9) {
    const t = -o[1] / d[1];
    if (t > 1e-4 && t < 60 && (!best || t < best.t)) {
      const p = add(o, scale(d, t));
      const check = (Math.floor(p[0] * 1.25) + Math.floor(p[2] * 1.25)) & 1;
      const color: RGB = check ? [0.8, 0.78, 0.72] : [0.58, 0.57, 0.55];
      best = { t, p, n: [0, 1, 0], color, refl: FLOOR_REFL, spec: 0 };
    }
  }
  return best;
}

function sky(d: Vec3): RGB {
  const t = Math.max(0, Math.min(1, d[1] * 1.6 + 0.35));
  return mix([0.86, 0.88, 0.9], [0.42, 0.6, 0.86], t);
}

function radiance(o: Vec3, d: Vec3, depth: number, maxDepth: number, cnt: RayCounts, shadows: boolean): RGB {
  const h = hit3(o, d);
  if (!h) return sky(d);
  const toL = sub(LIGHT3, h.p);
  const dist = Math.hypot(toL[0], toL[1], toL[2]);
  const l = scale(toL, 1 / dist);
  const ndl = dot(h.n, l);
  let lit = ndl > 0;
  const start = add(h.p, scale(h.n, 1e-4));
  if (lit && shadows) {
    cnt.shadow++;
    const b = hit3(start, l);
    if (b && b.t < dist) lit = false;
  }
  const diffuse = lit ? ndl : 0;
  let c: RGB = scale(h.color, AMBIENT + (1 - AMBIENT) * diffuse) as RGB;
  if (lit && h.spec > 0) {
    const r = reflect(scale(l, -1), h.n);
    const s = Math.pow(Math.max(0, -dot(r, d)), 48) * h.spec;
    c = add(c, [s, s, s]) as RGB;
  }
  if (h.refl > 0 && depth < maxDepth) {
    cnt.reflect++;
    const rd = normalize(reflect(d, h.n));
    const rc = radiance(start, rd, depth + 1, maxDepth, cnt, shadows);
    c = add(scale(c, 1 - h.refl), mulv(scale(rc, h.refl), mix([1, 1, 1], h.color, h.refl > 0.5 ? 0.15 : 0.6))) as RGB;
  } else if (h.refl > 0) {
    // out of bounces: the mirror shows only its own dark base colour
    c = scale(c, 1 - h.refl) as RGB;
  }
  return c;
}

/** Camera basis for primary rays. */
function camBasis(w: number, h: number) {
  const fwd = normalize(sub(CAM.target, CAM.eye));
  const right = normalize(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const th = Math.tan(CAM.fovY / 2);
  return { fwd, right, up, th, aspect: w / h };
}

/** Render rows [y0, y1) of the image into fb. Returns the rays spent. */
export function renderRows(fb: Framebuffer, y0: number, y1: number, maxDepth: number, shadows = true): RayCounts {
  const cnt: RayCounts = { primary: 0, shadow: 0, reflect: 0 };
  const B = camBasis(fb.w, fb.h);
  for (let y = y0; y < Math.min(y1, fb.h); y++)
    for (let x = 0; x < fb.w; x++) {
      const sx = ((x + 0.5) / fb.w) * 2 - 1;
      const sy = 1 - ((y + 0.5) / fb.h) * 2;
      const d = normalize(add(B.fwd, add(scale(B.right, sx * B.th * B.aspect), scale(B.up, sy * B.th))));
      cnt.primary++;
      fb.set(x, y, gamma(radiance(CAM.eye, d, 0, maxDepth, cnt, shadows)));
    }
  return cnt;
}

const gamma = (c: RGB): RGB => [Math.pow(Math.min(1, c[0]), 1 / 2.2), Math.pow(Math.min(1, c[1]), 1 / 2.2), Math.pow(Math.min(1, c[2]), 1 / 2.2)];

/** Whole-image ray counts for a given bounce limit (used by the prose and tests). */
export function countRays(w: number, h: number, maxDepth: number, shadows = true): RayCounts {
  const fb = new Framebuffer(w, h);
  return renderRows(fb, 0, h, maxDepth, shadows);
}

/* ───────── 3. bounding-volume hierarchy in 2-D ───────── */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BvhNode {
  box: Box;
  depth: number;
  /** Circle indices for a leaf, empty for an inner node. */
  items: number[];
  kids: BvhNode[];
}

export interface Disc {
  c: P2;
  r: number;
}

export const BVH_W = 16;
export const BVH_H = 10;

/** n random non-huge discs in the BVH figure's box. */
export function randomDiscs(n: number, seed = 5): Disc[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const rad = 0.06 + r() * 0.16;
    return { c: [0.8 + r() * (BVH_W - 1.6), 0.4 + r() * (BVH_H - 0.8)] as P2, r: rad };
  });
}

const discBox = (d: Disc): Box => ({ x0: d.c[0] - d.r, y0: d.c[1] - d.r, x1: d.c[0] + d.r, y1: d.c[1] + d.r });
const union = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

/** Build by splitting at the median centre along the box's longer side, down to `leaf` discs. */
export function buildBvh(discs: Disc[], leaf = 2): BvhNode {
  const go = (ids: number[], depth: number): BvhNode => {
    const box = ids.map((i) => discBox(discs[i])).reduce(union);
    if (ids.length <= leaf) return { box, depth, items: ids, kids: [] };
    const axis = box.x1 - box.x0 >= box.y1 - box.y0 ? 0 : 1;
    const sorted = [...ids].sort((a, b) => discs[a].c[axis] - discs[b].c[axis]);
    const mid = Math.floor(sorted.length / 2);
    return { box, depth, items: [], kids: [go(sorted.slice(0, mid), depth + 1), go(sorted.slice(mid), depth + 1)] };
  };
  return go(discs.map((_, i) => i), 0);
}

export function bvhDepth(n: BvhNode): number {
  return n.kids.length ? 1 + Math.max(...n.kids.map(bvhDepth)) : 0;
}

/** Slab test: entry distance of the ray into the box, or null if it misses (or enters beyond tMax). */
export function rayBox(o: P2, d: P2, b: Box, tMax = Infinity): number | null {
  let t0 = 0, t1 = tMax;
  for (let k = 0; k < 2; k++) {
    const lo = k ? b.y0 : b.x0, hi = k ? b.y1 : b.x1;
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < lo || o[k] > hi) return null;
      continue;
    }
    let a = (lo - o[k]) / d[k], c = (hi - o[k]) / d[k];
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0;
}

export interface BvhTrace {
  hit: number | null;
  t: number;
  boxTests: number;
  discTests: number;
  /**
   * Boxes the ray was tested against: 'entered' (looked inside), 'missed' (the ray does not
   * touch the box) or 'skipped' (touched, but a nearer hit was already known).
   */
  visited: { node: BvhNode; status: 'entered' | 'missed' | 'skipped' }[];
  tested: number[];
}

/** Brute force: test every disc. */
export function traceBrute(o: P2, d: P2, discs: Disc[]): { hit: number | null; t: number; tests: number } {
  let hit: number | null = null, t = Infinity;
  discs.forEach((ds, i) => {
    const q = solveHit(o, d, ds.c, ds.r);
    if (q.t !== null && q.t < t) {
      t = q.t;
      hit = i;
    }
  });
  return { hit, t, tests: discs.length };
}

/** Front-to-back BVH traversal with an early out once a nearer hit is known. */
export function traceBvh(o: P2, d: P2, discs: Disc[], root: BvhNode): BvhTrace {
  const out: BvhTrace = { hit: null, t: Infinity, boxTests: 0, discTests: 0, visited: [], tested: [] };
  const seen: { node: BvhNode; hit: boolean }[] = [];
  const inside = new Set<BvhNode>();
  const visit = (n: BvhNode, tEnter: number) => {
    if (tEnter > out.t) return;
    inside.add(n);
    if (n.kids.length === 0) {
      for (const i of n.items) {
        out.discTests++;
        out.tested.push(i);
        const q = solveHit(o, d, discs[i].c, discs[i].r);
        if (q.t !== null && q.t < out.t) {
          out.t = q.t;
          out.hit = i;
        }
      }
      return;
    }
    const ent = n.kids.map((k) => {
      out.boxTests++;
      const t = rayBox(o, d, k.box, out.t);
      seen.push({ node: k, hit: t !== null });
      return { k, t };
    });
    ent.sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity));
    for (const e of ent) if (e.t !== null) visit(e.k, e.t);
  };
  out.boxTests++;
  const t0 = rayBox(o, d, root.box);
  seen.push({ node: root, hit: t0 !== null });
  if (t0 !== null) visit(root, t0);
  out.visited = seen.map((v) => ({ node: v.node, status: !v.hit ? 'missed' : inside.has(v.node) ? 'entered' : 'skipped' }));
  return out;
}

/** Ray of the BVH figure: from the left edge at height y0, at angle deg (0 = straight right). */
export function bvhRay(y0: number, deg: number): { o: P2; d: P2 } {
  const a = (deg * Math.PI) / 180;
  return { o: [0, y0], d: [Math.cos(a), Math.sin(a)] };
}
