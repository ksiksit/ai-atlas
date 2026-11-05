/* 래스터화와 깊이 버퍼: pure helpers for the lesson's figures (no DOM, runs under node). */

import { Framebuffer, drawTriangle, edge, type RGB, type RasterStats, type SVert, type Vec2 } from './gfx';

/** Size of the zoomed pixel grid used by the first figures. */
export const GW = 24;
export const GH = 16;

export type Tri2 = [Vec2, Vec2, Vec2];

/** Twice the signed area (screen space, y down). */
export const area2 = (t: Tri2) => edge(t[0][0], t[0][1], t[1][0], t[1][1], t[2][0], t[2][1]);

/** The three edge functions of a triangle at point p, made non-negative inside whatever the winding. */
export function edgeValues(t: Tri2, px: number, py: number): [number, number, number] {
  const s = Math.sign(area2(t)) || 1;
  return [
    s * edge(t[1][0], t[1][1], t[2][0], t[2][1], px, py),
    s * edge(t[2][0], t[2][1], t[0][0], t[0][1], px, py),
    s * edge(t[0][0], t[0][1], t[1][0], t[1][1], px, py),
  ];
}

/** Pixel bounding box of a triangle, clipped to the grid (inclusive bounds). */
export function bbox(t: Tri2, w = GW, h = GH) {
  return {
    x0: Math.max(0, Math.floor(Math.min(t[0][0], t[1][0], t[2][0]))),
    x1: Math.min(w - 1, Math.ceil(Math.max(t[0][0], t[1][0], t[2][0]))),
    y0: Math.max(0, Math.floor(Math.min(t[0][1], t[1][1], t[2][1]))),
    y1: Math.min(h - 1, Math.ceil(Math.max(t[0][1], t[1][1], t[2][1]))),
  };
}

const sv = (p: Vec2, a?: number[]): SVert => ({ x: p[0], y: p[1], z: 0, a });

/** Which pixels of the grid a triangle covers (top-left rule), plus the renderer's counters. */
export function cover(t: Tri2, w = GW, h = GH): { inside: Uint8Array; stats: RasterStats } {
  const fb = new Framebuffer(w, h);
  const inside = new Uint8Array(w * h);
  const stats: RasterStats = { tested: 0, covered: 0, depthRejected: 0 };
  drawTriangle(
    fb,
    sv(t[0]),
    sv(t[1]),
    sv(t[2]),
    (f) => {
      inside[f.y * w + f.x] = 1;
      return [1, 1, 1];
    },
    { depthTest: false },
    stats,
  );
  return { inside, stats };
}

export type EdgeRule = 'top-left' | 'inclusive' | 'exclusive';

/**
 * How many of the given triangles claim each pixel, under a fill rule for pixel centres that fall
 * exactly on an edge: the top-left rule (the renderer's), "on the edge counts" or "on the edge does not count".
 */
export function claims(tris: Tri2[], rule: EdgeRule, w = GW, h = GH): Uint8Array {
  const n = new Uint8Array(w * h);
  for (const t of tris) {
    if (rule === 'top-left') {
      const c = cover(t, w, h).inside;
      for (let i = 0; i < n.length; i++) n[i] += c[i];
      continue;
    }
    const b = bbox(t, w, h);
    for (let y = b.y0; y <= b.y1; y++)
      for (let x = b.x0; x <= b.x1; x++) {
        const e = edgeValues(t, x + 0.5, y + 0.5);
        const ok = rule === 'inclusive' ? e.every((v) => v >= 0) : e.every((v) => v > 0);
        if (ok) n[y * w + x]++;
      }
  }
  return n;
}

/** Barycentric weights of v0, v1, v2 at point p (they sum to 1; all ≥ 0 inside). */
export function bary(t: Tri2, px: number, py: number): [number, number, number] {
  const A = Math.abs(area2(t)) || 1;
  const e = edgeValues(t, px, py);
  return [e[0] / A, e[1] / A, e[2] / A];
}

/* ───────── depth figure ───────── */

export const DW = 48;
export const DH = 30;

/** Two triangles that pass through each other: A tilts in depth, B stands at constant depth. */
export const DEPTH_TRIS: { name: string; v: [number, number, number][] }[] = [
  { name: 'A', v: [[3, 4, -0.8], [44, 9, 0.8], [10, 27, -0.8]] },
  { name: 'B', v: [[38, 3, 0], [42, 27, 0], [6, 17, 0]] },
];

export interface DepthRun {
  fb: Framebuffer;
  stats: RasterStats;
  /** Which triangle (0 = A, 1 = B, −1 = none) ended up in each pixel. */
  owner: Int8Array;
}

/** Draw A and B in the given order, with or without the depth test. */
export function depthRun(order: [number, number], depthTest: boolean, colors: [RGB, RGB], bg: RGB): DepthRun {
  const fb = new Framebuffer(DW, DH);
  fb.clear(bg);
  const owner = new Int8Array(DW * DH).fill(-1);
  const stats: RasterStats = { tested: 0, covered: 0, depthRejected: 0 };
  for (const k of order) {
    const [a, b, c] = DEPTH_TRIS[k].v.map((p) => ({ x: p[0], y: p[1], z: p[2] }));
    drawTriangle(
      fb,
      a,
      b,
      c,
      (f) => {
        owner[f.y * DW + f.x] = k;
        return colors[k];
      },
      { depthTest },
      stats,
    );
  }
  return { fb, stats, owner };
}
