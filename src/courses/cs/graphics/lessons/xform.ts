/* 변환과 카메라: pure helpers for the lesson's figures (no DOM, runs under node). */

import { Framebuffer, applyPoint, cube, drawMesh, drawTriangle, dot, lookAt, mul, normalize, orthographic, perspective, rotateY, toScreen, type Mat4, type RGB, type SVert, type Vec3, type Vec4 } from './gfx';

/* ───────── 2-D homogeneous transforms (3×3, row-major) ───────── */

export type Mat3 = [number, number, number, number, number, number, number, number, number];
export const rot2 = (deg: number): Mat3 => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
export const trans2 = (x: number, y: number): Mat3 => [1, 0, x, 0, 1, y, 0, 0, 1];
export function mul3(a: Mat3, b: Mat3): Mat3 {
  const o = new Array(9).fill(0) as Mat3;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
}
export const ap3 = (m: Mat3, p: [number, number]): [number, number] => [m[0] * p[0] + m[1] * p[1] + m[2], m[3] * p[0] + m[4] * p[1] + m[5]];

/** An "F" made of points, so that rotation and mirroring are both visible. */
export const F_SHAPE: [number, number][] = [
  [0, 0], [0.5, 0], [0.5, 1], [1.2, 1], [1.2, 1.4], [0.5, 1.4], [0.5, 1.9], [1.5, 1.9], [1.5, 2.3], [0, 2.3],
];

/* ───────── the 3-D camera figure ───────── */

export interface CamState {
  /** Model rotation about y, degrees. */
  spin: number;
  /** Camera orbit around the origin, degrees. */
  yaw: number;
  pitch: number;
  dist: number;
  /** Vertical field of view, degrees. */
  fov: number;
  ortho: boolean;
}

export const FW = 160;
export const FH = 120;

export function eyeOf(s: CamState): Vec3 {
  const y = (s.yaw * Math.PI) / 180, p = (s.pitch * Math.PI) / 180;
  return [s.dist * Math.cos(p) * Math.sin(y), s.dist * Math.sin(p), s.dist * Math.cos(p) * Math.cos(y)];
}

export function matrices(s: CamState, aspect = FW / FH): { M: Mat4; V: Mat4; P: Mat4 } {
  const M = rotateY((s.spin * Math.PI) / 180);
  const V = lookAt(eyeOf(s), [0, 0, 0]);
  const fov = (s.fov * Math.PI) / 180;
  let P: Mat4;
  if (s.ortho) {
    // same apparent size as the perspective view at the cube's distance
    const hh = s.dist * Math.tan(fov / 2);
    P = orthographic(-hh * aspect, hh * aspect, -hh, hh, 0.1, 20);
  } else P = perspective(fov, aspect, 0.1, 20);
  return { M, V, P };
}

export interface Journey {
  model: Vec4;
  world: Vec4;
  view: Vec4;
  clip: Vec4;
  ndc: Vec3;
  screen: [number, number];
}

/** Follow one model-space point through every space of the pipeline. */
export function journey(p: Vec3, m: { M: Mat4; V: Mat4; P: Mat4 }, w = FW, h = FH): Journey {
  const world = applyPoint(m.M, p);
  const view = applyPoint(mul(m.V, m.M), p);
  const clip = applyPoint(mul(m.P, mul(m.V, m.M)), p);
  const s = toScreen(clip, w, h);
  return { model: [p[0], p[1], p[2], 1], world, view, clip, ndc: [clip[0] / clip[3], clip[1] / clip[3], clip[2] / clip[3]], screen: [s.x, s.y] };
}

const LIGHT = normalize([0.45, 0.8, 0.55]);

/** The cube, lit by one fixed light, with each face tinted a little by its direction. */
export function renderCube(s: CamState, base: RGB, bg: RGB, w = FW, h = FH): Framebuffer {
  const fb = new Framebuffer(w, h);
  fb.clear(bg);
  const { M, V, P } = matrices(s, w / h);
  drawMesh(
    fb,
    cube(),
    M,
    mul(P, V),
    (f) => {
      const n: Vec3 = [f.a[3], f.a[4], f.a[5]];
      const k = 0.32 + 0.68 * Math.max(0, dot(n, LIGHT));
      return [base[0] * k, base[1] * k, base[2] * k];
    },
    { cullBack: true },
  );
  return fb;
}

/* ───────── the projection side view ───────── */

/** Height on screen, as a fraction of the screen height, of a post 1 unit tall at distance d. */
export function postHeight(d: number, fovDeg: number, ortho: boolean, refDist = 4): number {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  // perspective: the view at distance d is 2·d·tan(fov/2) tall; orthographic: as tall as at refDist
  return 1 / (2 * (ortho ? refDist : d) * t);
}

/* ───────── affine vs perspective-correct texture ───────── */

export const TW = 160;
export const TH = 100;

/** A floor quad x ∈ [−2, 2], z ∈ [−1, −7], uv in units of one checker square (4 × 6 squares). */
const FLOOR: { p: Vec3; uv: [number, number] }[] = [
  { p: [-2, 0, -1], uv: [0, 0] },
  { p: [2, 0, -1], uv: [4, 0] },
  { p: [2, 0, -7], uv: [4, 6] },
  { p: [-2, 0, -7], uv: [0, 6] },
];

export const checker = (u: number, v: number) => (Math.floor(u) + Math.floor(v)) % 2 === 0;

/**
 * Render the floor seen from height `camH`, with perspective-correct or affine (screen-linear) uv.
 * Also returns the share of floor pixels whose checker colour differs from the correct render.
 */
/** The floor's four corners on screen (with 1/w and uv), seen from height camH. */
export function floorVerts(camH: number, w = TW, h = TH): SVert[] {
  const V = lookAt([0, camH, 0.6], [0, 0, -4]);
  const P = perspective((55 * Math.PI) / 180, w / h, 0.1, 40);
  const VP = mul(P, V);
  return FLOOR.map(({ p, uv }) => {
    const c = applyPoint(VP, p);
    const s = toScreen(c, w, h);
    return { x: s.x, y: s.y, z: s.z, invW: s.invW, a: uv };
  });
}

export function renderFloor(camH: number, correct: boolean, a: RGB, b: RGB, bg: RGB, w = TW, h = TH): { fb: Framebuffer; wrong: number; floor: number } {
  const verts = floorVerts(camH, w, h);
  const run = (persp: boolean) => {
    const fb = new Framebuffer(w, h);
    fb.clear(bg);
    const sq = new Int8Array(w * h).fill(-1);
    const vs: SVert[] = verts.map((v) => (persp ? v : { ...v, invW: 1 }));
    for (const [i, j, k] of [[0, 1, 2], [0, 2, 3]])
      drawTriangle(fb, vs[i], vs[j], vs[k], (f) => {
        const on = checker(f.a[0], f.a[1]);
        sq[f.y * w + f.x] = on ? 1 : 0;
        return on ? a : b;
      });
    return { fb, sq };
  };
  const ref = run(true);
  const got = correct ? ref : run(false);
  let wrong = 0, floor = 0;
  for (let i = 0; i < w * h; i++) {
    if (ref.sq[i] < 0) continue;
    floor++;
    if (got.sq[i] !== ref.sq[i]) wrong++;
  }
  return { fb: got.fb, wrong, floor };
}
