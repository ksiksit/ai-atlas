/* 컴퓨터 그래픽스 · 텍스처와 샘플링: procedural textures, sampling filters, mipmaps, a receding plane. */

import { applyDir, applyPoint, clamp01, cube, cross, Framebuffer, lookAt, mul, normalize, perspective, toScreen, drawTriangle, dot, type Mat4, type Mesh, type RGB, type SVert, type Vec3 } from './gfx';

/** An RGB image with components in 0..1. Texel (i, j) has its centre at uv ((i + 0.5)/w, (j + 0.5)/h); v = 0 is the bottom row. */
export interface Texture {
  w: number;
  h: number;
  data: Float32Array;
}

export function makeTexture(w: number, h: number, f: (i: number, j: number) => RGB): Texture {
  const data = new Float32Array(w * h * 3);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const c = f(i, j);
      const k = (j * w + i) * 3;
      data[k] = c[0];
      data[k + 1] = c[1];
      data[k + 2] = c[2];
    }
  return { w, h, data };
}

export const texel = (t: Texture, i: number, j: number): RGB => {
  const x = ((i % t.w) + t.w) % t.w, y = ((j % t.h) + t.h) % t.h;
  const k = (y * t.w + x) * 3;
  return [t.data[k], t.data[k + 1], t.data[k + 2]];
};

/** A checkerboard of `checks` × `checks` squares. */
export const checker = (size: number, checks: number, a: RGB, b: RGB) => makeTexture(size, size, (i, j) => ((Math.floor((i * checks) / size) + Math.floor((j * checks) / size)) % 2 ? a : b));

/** Running-bond bricks: 4 rows, 2 bricks per row, mortar one texel wide (for size 16). */
export function bricks(size: number, brick: RGB, mortar: RGB, shade: RGB): Texture {
  const rowH = size / 4;
  const brickW = size / 2;
  return makeTexture(size, size, (i, j) => {
    const row = Math.floor(j / rowH);
    const y = j % rowH;
    const x = (i + (row % 2 ? brickW / 2 : 0)) % brickW;
    if (y === rowH - 1 || x === brickW - 1) return mortar;
    // a darker lower edge on each brick gives a little depth
    return y === 0 ? shade : brick;
  });
}

/** Pips on each face of a die, laid out on a 3×3 grid of positions (0..8, row-major from the top-left). */
const PIPS: Record<number, number[]> = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

/** Cross layout of the six cube faces in a 4 × 3 atlas: [column, row from the top]. Order follows gfx.cube(): +z, −z, +x, −x, +y, −y. */
export const ATLAS_CELL: [number, number][] = [
  [1, 1],
  [3, 1],
  [2, 1],
  [0, 1],
  [1, 0],
  [1, 2],
];
/** Die value on each face (opposite faces add up to 7). */
export const FACE_PIPS = [1, 6, 2, 5, 3, 4];
export const FACE_NAME = ['앞 (+z)', '뒤 (−z)', '오른쪽 (+x)', '왼쪽 (−x)', '위 (+y)', '아래 (−y)'];

/** A 4 × 3 atlas of die faces, `cell` texels per face, faces tinted with `tints`. Unused cells get `empty`. */
export function diceAtlas(cell: number, tints: RGB[], pip: RGB, empty: RGB): Texture {
  const w = cell * 4, h = cell * 3;
  return makeTexture(w, h, (i, j) => {
    const col = Math.floor(i / cell);
    const rowTop = 2 - Math.floor(j / cell); // j counts from the bottom; cells count from the top
    const face = ATLAS_CELL.findIndex(([c, r]) => c === col && r === rowTop);
    if (face < 0) return empty;
    const x = (i % cell) + 0.5, y = cell - (j % cell) - 0.5; // y from the top of the cell
    const edge = Math.min(x, y, cell - x, cell - y);
    if (edge < 1) return pip;
    for (const p of PIPS[FACE_PIPS[face]]) {
      const px = ((p % 3) + 1) * (cell / 4), py = (Math.floor(p / 3) + 1) * (cell / 4);
      if (Math.hypot(x - px, y - py) < cell * 0.1) return pip;
    }
    return tints[face];
  });
}

/** gfx.cube() with uvs moved into the dice atlas. */
export function atlasCube(): Mesh {
  const m = cube();
  m.uvs = m.uvs.map(([s, t], k) => {
    const [c, r] = ATLAS_CELL[Math.floor(k / 4)];
    return [(c + s) / 4, (2 - r + t) / 3];
  });
  return m;
}

/* ───────── sampling ───────── */

/** Nearest texel to (u, v), wrapping (repeat). */
export function sampleNearest(t: Texture, u: number, v: number): RGB {
  return texel(t, Math.floor(u * t.w), Math.floor(v * t.h));
}

/** Weighted average of the four texels around (u, v), wrapping. */
export function sampleBilinear(t: Texture, u: number, v: number): RGB {
  const x = u * t.w - 0.5, y = v * t.h - 0.5;
  const i = Math.floor(x), j = Math.floor(y);
  const fx = x - i, fy = y - j;
  const a = texel(t, i, j), b = texel(t, i + 1, j), c = texel(t, i, j + 1), d = texel(t, i + 1, j + 1);
  const out: RGB = [0, 0, 0];
  for (let k = 0; k < 3; k++) out[k] = (a[k] * (1 - fx) + b[k] * fx) * (1 - fy) + (c[k] * (1 - fx) + d[k] * fx) * fy;
  return out;
}

/** Mip pyramid: level 0 is the texture, each next level averages 2×2 texels, down to 1×1. Needs power-of-two sizes. */
export function buildMips(t: Texture): Texture[] {
  const levels = [t];
  let cur = t;
  while (cur.w > 1 || cur.h > 1) {
    const w = Math.max(1, cur.w >> 1), h = Math.max(1, cur.h >> 1);
    const src = cur;
    cur = makeTexture(w, h, (i, j) => {
      const s: RGB = [0, 0, 0];
      for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const c = texel(src, Math.min(src.w - 1, 2 * i + di), Math.min(src.h - 1, 2 * j + dj));
        s[0] += c[0] / 4;
        s[1] += c[1] / 4;
        s[2] += c[2] / 4;
      }
      return s;
    });
    levels.push(cur);
  }
  return levels;
}

/** Total texels in a pyramid relative to the base level (approaches 4/3). */
export const mipOverhead = (mips: Texture[]) => mips.reduce((a, m) => a + m.w * m.h, 0) / (mips[0].w * mips[0].h);

/** Trilinear: bilinear in the two levels around `lod`, blended. */
export function sampleTrilinear(mips: Texture[], u: number, v: number, lod: number): RGB {
  const L = Math.max(0, Math.min(mips.length - 1, lod));
  const l0 = Math.floor(L), l1 = Math.min(mips.length - 1, l0 + 1), f = L - l0;
  const a = sampleBilinear(mips[l0], u, v);
  if (f === 0 || l0 === l1) return a;
  const b = sampleBilinear(mips[l1], u, v);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/* ───────── a 1-D sampling experiment ───────── */

/** The frequency a sine of `f` cycles appears to have when sampled `n` times over the same span. */
export function aliasFrequency(f: number, n: number): number {
  return Math.abs(f - n * Math.round(f / n));
}

/* ───────── a textured floor stretching to the horizon ───────── */

export type FloorMode = 'nearest' | 'super' | 'mip' | 'lod';

export interface FloorCamera {
  eye: Vec3;
  /** Downward tilt of the view in degrees. */
  pitch: number;
  fovY: number;
  /** Texture repeats per world unit. */
  repeat: number;
}

export const FLOOR_CAMERA: FloorCamera = { eye: [0, 0.5, 0], pitch: 14, fovY: 60, repeat: 1 };

/** Ray from the eye through screen point (sx, sy) (pixel units, y down). */
function floorRay(c: FloorCamera, w: number, h: number, sx: number, sy: number): Vec3 {
  const p = (c.pitch * Math.PI) / 180;
  const fwd: Vec3 = [0, -Math.sin(p), -Math.cos(p)];
  const right: Vec3 = [1, 0, 0];
  const up = cross(right, fwd); // (0, cos p, −sin p): up, tilted back with the camera
  const t = Math.tan(((c.fovY / 2) * Math.PI) / 180);
  const nx = ((sx / w) * 2 - 1) * t * (w / h);
  const ny = (1 - (sy / h) * 2) * t;
  return normalize([fwd[0] + right[0] * nx + up[0] * ny, fwd[1] + right[1] * nx + up[1] * ny, fwd[2] + right[2] * nx + up[2] * ny]);
}

/** uv on the floor (y = 0) seen through screen point (sx, sy), or null above the horizon. */
export function floorUV(c: FloorCamera, w: number, h: number, sx: number, sy: number): [number, number] | null {
  const d = floorRay(c, w, h, sx, sy);
  if (d[1] >= -1e-4) return null;
  const t = -c.eye[1] / d[1];
  const x = c.eye[0] + d[0] * t, z = c.eye[2] + d[2] * t;
  return [x * c.repeat, -z * c.repeat];
}

/** Level of detail at a pixel: log2 of how many texels one pixel step covers. */
export function floorLod(c: FloorCamera, w: number, h: number, x: number, y: number, size: number): number {
  const a = floorUV(c, w, h, x + 0.5, y + 0.5);
  const b = floorUV(c, w, h, x + 1.5, y + 0.5);
  const d = floorUV(c, w, h, x + 0.5, y + 1.5);
  if (!a || !b || !d) return 99;
  const du = Math.hypot(b[0] - a[0], b[1] - a[1]) * size;
  const dv = Math.hypot(d[0] - a[0], d[1] - a[1]) * size;
  return Math.log2(Math.max(du, dv, 1e-6));
}

export interface FloorStats {
  /** Texel reads per floor pixel. */
  reads: number;
  floorPixels: number;
}

/**
 * Render the checkered floor into `fb` with one of the strategies. `levelColors` false-colours the
 * mip level chosen at each pixel in 'lod' mode.
 */
export function renderFloor(fb: Framebuffer, mips: Texture[], mode: FloorMode, sky: RGB, levelColors: RGB[], c: FloorCamera = FLOOR_CAMERA, superN = 4): FloorStats {
  const base = mips[0];
  let reads = 0, floorPixels = 0;
  for (let y = 0; y < fb.h; y++)
    for (let x = 0; x < fb.w; x++) {
      const uv = floorUV(c, fb.w, fb.h, x + 0.5, y + 0.5);
      if (!uv) {
        fb.set(x, y, sky);
        continue;
      }
      floorPixels++;
      if (mode === 'nearest') {
        fb.set(x, y, sampleNearest(base, uv[0], uv[1]));
        reads += 1;
      } else if (mode === 'super') {
        const s: RGB = [0, 0, 0];
        let n = 0;
        for (let a = 0; a < superN; a++)
          for (let b = 0; b < superN; b++) {
            const q = floorUV(c, fb.w, fb.h, x + (a + 0.5) / superN, y + (b + 0.5) / superN);
            if (!q) continue; // the part of the pixel above the horizon
            const col = sampleNearest(base, q[0], q[1]);
            s[0] += col[0];
            s[1] += col[1];
            s[2] += col[2];
            n++;
          }
        reads += superN * superN;
        fb.set(x, y, n ? [s[0] / n, s[1] / n, s[2] / n] : sky);
      } else {
        const lod = Math.max(0, floorLod(c, fb.w, fb.h, x, y, base.w));
        if (mode === 'mip') {
          fb.set(x, y, sampleTrilinear(mips, uv[0], uv[1], lod));
          reads += 8;
        } else {
          const lv = Math.min(levelColors.length - 1, Math.round(lod));
          fb.set(x, y, levelColors[lv]);
        }
      }
    }
  return { reads: floorPixels ? reads / floorPixels : 0, floorPixels };
}

/* ───────── the textured cube ───────── */

/**
 * Draw the atlas cube with nearest or bilinear lookups. With `affine`, uvs are interpolated linearly in
 * screen space (no division by w), which bends straight lines on faces seen at an angle.
 * `highlight` (a face index or −1) is drawn tinted.
 */
export function renderCube(fb: Framebuffer, tex: Texture, mesh: Mesh, model: Mat4, eye: Vec3, filter: 'nearest' | 'bilinear', affine: boolean, highlight: number, hl: RGB, bg: RGB) {
  fb.clear(bg);
  const vp = mul(perspective((40 * Math.PI) / 180, fb.w / fb.h, 0.1, 20), lookAt(eye, [0, 0, 0]));
  const mvp = mul(vp, model);
  const verts: SVert[] = mesh.positions.map((p, i) => {
    const s = toScreen(applyPoint(mvp, p), fb.w, fb.h);
    return { x: s.x, y: s.y, z: s.z, invW: affine ? 1 : s.invW, a: [mesh.uvs[i][0], mesh.uvs[i][1]] };
  });
  const light = normalize([0.4, 0.8, 0.6]);
  mesh.tris.forEach(([i, j, k], ti) => {
    const face = Math.floor(ti / 2);
    const nn = normalize(applyDir(model, mesh.normals[i]));
    const lit = 0.72 + 0.28 * Math.max(0, dot(nn, light));
    drawTriangle(
      fb, verts[i], verts[j], verts[k],
      (f) => {
        const c = filter === 'nearest' ? sampleNearest(tex, f.a[0], f.a[1]) : sampleBilinear(tex, f.a[0], f.a[1]);
        const m: RGB = face === highlight ? [c[0] * 0.5 + hl[0] * 0.5, c[1] * 0.5 + hl[1] * 0.5, c[2] * 0.5 + hl[2] * 0.5] : c;
        return [clamp01(m[0] * lit), clamp01(m[1] * lit), clamp01(m[2] * lit)];
      },
      { cullBack: true },
    );
  });
}
