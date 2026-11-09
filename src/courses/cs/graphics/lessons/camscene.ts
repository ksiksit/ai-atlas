/* 카메라 안으로 들어가기: the walkable scene and the course's own renderer pointed at it (no DOM, runs under node). */

import { Framebuffer, applyPoint, cube, dot, drawMesh, lookAt, mul, normalize, perspective, plane, scaling, sphere, translate, type Mat4, type Mesh, type RGB, type Vec3, type Vec4 } from './gfx';

export interface SceneObj {
  name: string;
  mesh: Mesh;
  model: Mat4;
  color: RGB;
}

/** Half-width of the square floor. */
export const FLOOR_HALF = 6;
const TILE = 0.5;

/** The scene: a checker floor, a red box, a blue ball, a gold crate, a green pillar and a row of posts. */
export function buildScene(floorA: RGB, floorB: RGB): SceneObj[] {
  const objs: SceneObj[] = [];
  const tile = plane();
  for (let x = -FLOOR_HALF; x < FLOOR_HALF; x += TILE)
    for (let z = -FLOOR_HALF; z < FLOOR_HALF; z += TILE) {
      const check = (Math.floor(x) + Math.floor(z)) & 1;
      objs.push({ name: 'floor', mesh: tile, model: mul(translate(x + TILE / 2, 0, z + TILE / 2), scaling(TILE, 1, TILE)), color: check ? floorA : floorB });
    }
  const box = cube();
  objs.push({ name: 'box', mesh: box, model: mul(translate(0, 0.8, 0), scaling(1.6)), color: [0.82, 0.27, 0.22] });
  objs.push({ name: 'ball', mesh: sphere(20), model: mul(translate(-2.4, 0.7, -1.2), scaling(0.7)), color: [0.25, 0.45, 0.85] });
  objs.push({ name: 'crate', mesh: box, model: mul(translate(1.8, 0.4, 2.2), scaling(0.8)), color: [0.9, 0.72, 0.2] });
  objs.push({ name: 'pillar', mesh: box, model: mul(translate(-3.5, 1.5, -4.5), scaling(1, 3, 1)), color: [0.3, 0.62, 0.4] });
  for (const z of [3, 1, -1, -3, -5]) objs.push({ name: 'post', mesh: box, model: mul(translate(3.2, 1.2, z), scaling(0.3, 2.4, 0.3)), color: [0.55, 0.56, 0.62] });
  return objs;
}

const LIGHT = normalize([0.45, 0.8, 0.55]);
/** The same simple lighting is used by the course renderer and baked into the walkable 3D view. */
export const shadeK = (n: Vec3) => 0.45 + 0.55 * Math.max(0, dot(n, LIGHT));

/* ───────── the camera ───────── */

export interface Cam {
  eye: Vec3;
  /** Heading: 0 looks toward −z, positive turns left (the same as the walker). */
  yaw: number;
  pitch: number;
  /** Vertical field of view in degrees. */
  fov: number;
  near: number;
  far: number;
}

export const FILM_W = 160;
export const FILM_H = 120;

export const forwardOf = (yaw: number, pitch: number): Vec3 => [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];

export function camMatrices(c: Cam, aspect = FILM_W / FILM_H): { V: Mat4; P: Mat4 } {
  const f = forwardOf(c.yaw, c.pitch);
  const V = lookAt(c.eye, [c.eye[0] + f[0], c.eye[1] + f[1], c.eye[2] + f[2]]);
  const P = perspective((c.fov * Math.PI) / 180, aspect, c.near, c.far);
  return { V, P };
}

export interface FilmStats {
  /** Pixels thrown away because they were nearer than `near` or farther than `far`. */
  clippedNear: number;
  clippedFar: number;
}

/** Take a picture of the scene with the course's software rasterizer. */
export function renderFilm(scene: SceneObj[], c: Cam, bg: RGB, w = FILM_W, h = FILM_H): { fb: Framebuffer; stats: FilmStats } {
  const fb = new Framebuffer(w, h);
  fb.clear(bg);
  const { V, P } = camMatrices(c, w / h);
  const VP = mul(P, V);
  const stats: FilmStats = { clippedNear: 0, clippedFar: 0 };
  for (const o of scene) {
    drawMesh(fb, o.mesh, o.model, VP, (f) => {
      // this renderer clips per pixel: anything outside the near…far slab of NDC depth is dropped
      if (f.z < -1) {
        stats.clippedNear++;
        return null;
      }
      if (f.z > 1) {
        stats.clippedFar++;
        return null;
      }
      const k = shadeK([f.a[3], f.a[4], f.a[5]]);
      return [o.color[0] * k, o.color[1] * k, o.color[2] * k];
    });
  }
  return { fb, stats };
}

export interface PointTrip {
  world: Vec3;
  view: Vec4;
  clip: Vec4;
  ndc: Vec3;
  pixel: [number, number];
  /** Inside the view frustum (and so on the picture)? */
  inside: boolean;
  /** In front of the camera at all? */
  front: boolean;
}

/** Follow a world point through view, clip, NDC and pixel space. */
export function trip(p: Vec3, c: Cam, w = FILM_W, h = FILM_H): PointTrip {
  const { V, P } = camMatrices(c, w / h);
  const view = applyPoint(V, p);
  const clip = applyPoint(mul(P, V), p);
  const ndc: Vec3 = [clip[0] / clip[3], clip[1] / clip[3], clip[2] / clip[3]];
  const front = clip[3] > 0;
  const inside = front && ndc.every((v) => v >= -1 && v <= 1);
  return { world: p, view, clip, ndc, pixel: [((ndc[0] + 1) / 2) * w, ((1 - ndc[1]) / 2) * h], inside, front };
}

/** NDC depth of a point at distance d in front of the camera. */
export const ndcDepth = (d: number, near: number, far: number) => (far + near) / (far - near) - (2 * far * near) / ((far - near) * d);

/** Points the lesson follows through the pipeline. */
export const TRIP_POINTS: { id: string; short: string; label: string; p: Vec3 }[] = [
  { id: 'box', short: '상자 모서리', label: '빨간 상자의 모서리', p: [0.8, 1.6, 0.8] },
  { id: 'ball', short: '공 꼭대기', label: '파란 공의 꼭대기', p: [-2.4, 1.4, -1.2] },
  { id: 'post', short: '먼 기둥', label: '가장 먼 기둥 꼭대기', p: [3.2, 2.4, -5] },
];
