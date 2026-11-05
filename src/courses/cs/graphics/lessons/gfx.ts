/*
 * 컴퓨터 그래픽스: the small software renderer the whole course builds on.
 * No WebGL: every pixel is computed here, so each lesson can show and change any step.
 *
 * Conventions
 *  - Vectors are plain tuples. Matrices are 4×4, row-major, in a flat array of 16:
 *    m[r * 4 + c]. Points are column vectors, so M·p and A·B·p applies B first.
 *  - World space is right-handed, y up; the camera looks down −z (as in OpenGL).
 *  - Screen space has (0, 0) at the top-left pixel corner, x right, y down. Pixel (i, j)
 *    is sampled at its centre (i + 0.5, j + 0.5).
 *  - Depth after the perspective divide is NDC z in [−1, 1]; smaller is nearer.
 *  - Colors are [r, g, b] with components in 0..1.
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
export type Mat4 = number[];
export type RGB = [number, number, number];

/* ───────── vectors ───────── */

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const mulv = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Mirror direction d about the unit normal n (d points toward the surface). */
export const reflect = (d: Vec3, n: Vec3): Vec3 => sub(d, scale(n, 2 * dot(d, n)));
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ───────── 4×4 matrices ───────── */

export const identity = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
  return o;
}
/** Product of several matrices, left to right: chain(A, B, C) = A·B·C. */
export const chain = (...ms: Mat4[]) => ms.reduce((acc, m) => mul(acc, m), identity());

export const translate = (x: number, y: number, z: number): Mat4 => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
export const scaling = (x: number, y = x, z = x): Mat4 => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
export function rotateX(a: number): Mat4 {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
}
export function rotateY(a: number): Mat4 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
}
export function rotateZ(a: number): Mat4 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** OpenGL-style perspective projection. fovY in radians, aspect = width / height. */
export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), (2 * far * near) / (near - far), 0, 0, -1, 0];
}

/** Orthographic projection of the box [l, r] × [b, t] × [−near, −far] to NDC. */
export function orthographic(l: number, r: number, b: number, t: number, near: number, far: number): Mat4 {
  return [2 / (r - l), 0, 0, -(r + l) / (r - l), 0, 2 / (t - b), 0, -(t + b) / (t - b), 0, 0, -2 / (far - near), -(far + near) / (far - near), 0, 0, 0, 1];
}

/** View matrix of a camera at `eye` looking at `target`. */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Mat4 {
  const z = normalize(sub(eye, target));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return [x[0], x[1], x[2], -dot(x, eye), y[0], y[1], y[2], -dot(y, eye), z[0], z[1], z[2], -dot(z, eye), 0, 0, 0, 1];
}

export const apply4 = (m: Mat4, p: Vec4): Vec4 => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3] * p[3],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7] * p[3],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11] * p[3],
  m[12] * p[0] + m[13] * p[1] + m[14] * p[2] + m[15] * p[3],
];
/** Transform a point (w = 1), without dividing by w. */
export const applyPoint = (m: Mat4, p: Vec3): Vec4 => apply4(m, [p[0], p[1], p[2], 1]);
/** Transform a direction (w = 0): rotation and scale only. */
export const applyDir = (m: Mat4, d: Vec3): Vec3 => {
  const r = apply4(m, [d[0], d[1], d[2], 0]);
  return [r[0], r[1], r[2]];
};

/** Clip-space point → screen pixel coordinates plus NDC depth and 1/w (for perspective-correct interpolation). */
export function toScreen(clip: Vec4, w: number, h: number): { x: number; y: number; z: number; invW: number } {
  const iw = 1 / clip[3];
  const nx = clip[0] * iw, ny = clip[1] * iw, nz = clip[2] * iw;
  return { x: (nx + 1) * 0.5 * w, y: (1 - ny) * 0.5 * h, z: nz, invW: iw };
}

/* ───────── framebuffer ───────── */

export class Framebuffer {
  readonly color: Uint8ClampedArray;
  readonly depth: Float32Array;
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.color = new Uint8ClampedArray(w * h * 4);
    this.depth = new Float32Array(w * h);
    this.clear([0, 0, 0]);
  }
  clear(c: RGB, depth = Infinity) {
    const r = Math.round(clamp01(c[0]) * 255), g = Math.round(clamp01(c[1]) * 255), b = Math.round(clamp01(c[2]) * 255);
    for (let i = 0; i < this.w * this.h; i++) {
      this.color[i * 4] = r;
      this.color[i * 4 + 1] = g;
      this.color[i * 4 + 2] = b;
      this.color[i * 4 + 3] = 255;
      this.depth[i] = depth;
    }
  }
  set(x: number, y: number, c: RGB) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.color[i] = clamp01(c[0]) * 255;
    this.color[i + 1] = clamp01(c[1]) * 255;
    this.color[i + 2] = clamp01(c[2]) * 255;
    this.color[i + 3] = 255;
  }
  get(x: number, y: number): RGB {
    const i = (y * this.w + x) * 4;
    return [this.color[i] / 255, this.color[i + 1] / 255, this.color[i + 2] / 255];
  }
}

/* ───────── triangle rasterization ───────── */

/** A vertex already in screen space. `a` holds any attributes to interpolate (color, normal, uv …). */
export interface SVert {
  x: number;
  y: number;
  z: number;
  /** 1/w from the projection; 1 for 2-D drawings. Used for perspective-correct interpolation. */
  invW?: number;
  a?: number[];
}

/** Twice the signed area of triangle (a, b, p): positive when p is to the left of a→b in screen space (y down). */
export const edge = (ax: number, ay: number, bx: number, by: number, px: number, py: number) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);

/** Top-left rule: an edge owns the pixels exactly on it only if it is a top or a left edge. */
function ownsEdge(ax: number, ay: number, bx: number, by: number, area: number): boolean {
  // normalise to clockwise-on-screen (area > 0 with y down) orientation
  const dx = (bx - ax) * Math.sign(area);
  const dy = (by - ay) * Math.sign(area);
  return (dy === 0 && dx > 0) || dy < 0;
}

export interface Fragment {
  x: number;
  y: number;
  z: number;
  /** Barycentric weights of v0, v1, v2 at the pixel centre (screen-space, not perspective-corrected). */
  b: [number, number, number];
  /** Interpolated attributes, perspective-corrected when the vertices carry invW. */
  a: number[];
}

export interface RasterStats {
  tested: number;
  covered: number;
  depthRejected: number;
}

/**
 * Fill a triangle. For every pixel centre inside it (top-left fill rule), interpolate depth and
 * attributes, run the depth test (if `depthTest`), and write `shade(fragment)` to the framebuffer.
 * Returning null from `shade` discards the fragment. Works with either winding order.
 */
export function drawTriangle(fb: Framebuffer, v0: SVert, v1: SVert, v2: SVert, shade: (f: Fragment) => RGB | null, opts: { depthTest?: boolean; depthWrite?: boolean; cullBack?: boolean } = {}, stats?: RasterStats) {
  const { depthTest = true, depthWrite = true, cullBack = false } = opts;
  const area = edge(v0.x, v0.y, v1.x, v1.y, v2.x, v2.y);
  if (area === 0) return;
  // with y down, counter-clockwise in world (front-facing) becomes negative area on screen
  if (cullBack && area > 0) return;
  const minX = Math.max(0, Math.floor(Math.min(v0.x, v1.x, v2.x)));
  const maxX = Math.min(fb.w - 1, Math.ceil(Math.max(v0.x, v1.x, v2.x)));
  const minY = Math.max(0, Math.floor(Math.min(v0.y, v1.y, v2.y)));
  const maxY = Math.min(fb.h - 1, Math.ceil(Math.max(v0.y, v1.y, v2.y)));
  const o0 = ownsEdge(v1.x, v1.y, v2.x, v2.y, area);
  const o1 = ownsEdge(v2.x, v2.y, v0.x, v0.y, area);
  const o2 = ownsEdge(v0.x, v0.y, v1.x, v1.y, area);
  const w0i = v0.invW ?? 1, w1i = v1.invW ?? 1, w2i = v2.invW ?? 1;
  const a0 = v0.a ?? [], a1 = v1.a ?? [], a2 = v2.a ?? [];
  const na = Math.min(a0.length, a1.length, a2.length);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      if (stats) stats.tested++;
      let e0 = edge(v1.x, v1.y, v2.x, v2.y, px, py);
      let e1 = edge(v2.x, v2.y, v0.x, v0.y, px, py);
      let e2 = edge(v0.x, v0.y, v1.x, v1.y, px, py);
      if (area < 0) {
        e0 = -e0;
        e1 = -e1;
        e2 = -e2;
      }
      if (e0 < 0 || e1 < 0 || e2 < 0) continue;
      if ((e0 === 0 && !o0) || (e1 === 0 && !o1) || (e2 === 0 && !o2)) continue;
      const A = Math.abs(area);
      const b0 = e0 / A, b1 = e1 / A, b2 = e2 / A;
      const z = b0 * v0.z + b1 * v1.z + b2 * v2.z;
      if (stats) stats.covered++;
      const di = y * fb.w + x;
      if (depthTest && z >= fb.depth[di]) {
        if (stats) stats.depthRejected++;
        continue;
      }
      // perspective-correct: interpolate a/w and 1/w linearly in screen space, then divide
      const p0 = b0 * w0i, p1 = b1 * w1i, p2 = b2 * w2i;
      const ps = p0 + p1 + p2;
      const a = new Array(na);
      for (let k = 0; k < na; k++) a[k] = (p0 * a0[k] + p1 * a1[k] + p2 * a2[k]) / ps;
      const c = shade({ x, y, z, b: [b0, b1, b2], a });
      if (!c) continue;
      if (depthWrite) fb.depth[di] = z;
      fb.set(x, y, c);
    }
  }
}

/* ───────── meshes ───────── */

export interface Mesh {
  positions: Vec3[];
  normals: Vec3[];
  uvs: Vec2[];
  /** Triangles as vertex index triples, counter-clockwise seen from outside. */
  tris: [number, number, number][];
}

/** Unit cube centred at the origin (side 1), 24 vertices so each face has its own normal and uv. */
export function cube(): Mesh {
  const m: Mesh = { positions: [], normals: [], uvs: [], tris: [] };
  const faces: { n: Vec3; u: Vec3; v: Vec3 }[] = [
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  ];
  for (const f of faces) {
    const base = m.positions.length;
    for (const [s, t] of [[0, 0], [1, 0], [1, 1], [0, 1]] as Vec2[]) {
      const p = add(scale(f.n, 0.5), add(scale(f.u, s - 0.5), scale(f.v, t - 0.5)));
      m.positions.push(p);
      m.normals.push(f.n);
      m.uvs.push([s, t]);
    }
    m.tris.push([base, base + 1, base + 2], [base, base + 2, base + 3]);
  }
  return m;
}

/** UV sphere of radius 1 with `seg` slices around and seg/2 stacks. */
export function sphere(seg = 24): Mesh {
  const m: Mesh = { positions: [], normals: [], uvs: [], tris: [] };
  const stacks = Math.max(2, Math.round(seg / 2));
  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks;
    const th = v * Math.PI;
    for (let j = 0; j <= seg; j++) {
      const u = j / seg;
      const ph = u * Math.PI * 2;
      const p: Vec3 = [Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)];
      m.positions.push(p);
      m.normals.push(p);
      m.uvs.push([u, 1 - v]);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < stacks; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * row + j, b = a + row;
      if (i > 0) m.tris.push([a, b, a + 1]);
      if (i < stacks - 1) m.tris.push([a + 1, b, b + 1]);
    }
  return m;
}

/** Square of side 1 in the xz-plane facing +y, with uvs repeated `repeat` times. */
export function plane(repeat = 1): Mesh {
  return {
    positions: [[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5], [-0.5, 0, -0.5]],
    normals: [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]],
    uvs: [[0, 0], [repeat, 0], [repeat, repeat], [0, repeat]],
    tris: [[0, 1, 2], [0, 2, 3]],
  };
}

/* ───────── showing the framebuffer ───────── */

/**
 * Draw the framebuffer onto a 2-D canvas context at (x, y), each pixel `px` CSS pixels wide,
 * with no smoothing, so individual pixels stay visible when px > 1.
 */
export function present(ctx: CanvasRenderingContext2D, fb: Framebuffer, x: number, y: number, px: number) {
  const img = new ImageData(new Uint8ClampedArray(fb.color), fb.w, fb.h);
  const tmp = document.createElement('canvas');
  tmp.width = fb.w;
  tmp.height = fb.h;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, x, y, fb.w * px, fb.h * px);
  ctx.imageSmoothingEnabled = prev;
}

/** Parse a CSS color as the palette gives it (#rgb, #rrggbb, rgb(…), rgba(…)) into 0..1 RGB. */
export function cssToRgb(css: string): RGB {
  const s = css.trim();
  if (s.startsWith('#')) {
    const h = s.length === 4 ? s.slice(1).split('').map((c) => c + c).join('') : s.slice(1, 7);
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }
  const m = s.match(/[\d.]+/g);
  if (m && m.length >= 3) return [+m[0] / 255, +m[1] / 255, +m[2] / 255];
  return [0.5, 0.5, 0.5];
}

export const rgbCss = (c: RGB) => `rgb(${Math.round(clamp01(c[0]) * 255)}, ${Math.round(clamp01(c[1]) * 255)}, ${Math.round(clamp01(c[2]) * 255)})`;

/**
 * Render a mesh with a model matrix and a camera (view·projection) into `fb`.
 * The vertex attributes passed to `shade` are: world position (3), world normal (3), uv (2).
 */
export function drawMesh(fb: Framebuffer, mesh: Mesh, model: Mat4, viewProj: Mat4, shade: (f: Fragment) => RGB | null, opts: { depthTest?: boolean; cullBack?: boolean } = {}, stats?: RasterStats) {
  const mvp = mul(viewProj, model);
  const verts: SVert[] = mesh.positions.map((p, i) => {
    const clip = applyPoint(mvp, p);
    const s = toScreen(clip, fb.w, fb.h);
    const wp = applyPoint(model, p);
    const wn = normalize(applyDir(model, mesh.normals[i]));
    const uv = mesh.uvs[i] ?? [0, 0];
    return { x: s.x, y: s.y, z: s.z, invW: s.invW, a: [wp[0], wp[1], wp[2], wn[0], wn[1], wn[2], uv[0], uv[1]], _w: clip[3] } as SVert & { _w: number };
  });
  for (const [i, j, k] of mesh.tris) {
    const a = verts[i] as SVert & { _w: number }, b = verts[j] as SVert & { _w: number }, c = verts[k] as SVert & { _w: number };
    // the course's scenes keep every vertex in front of the camera; skip any that is not
    if (a._w <= 0 || b._w <= 0 || c._w <= 0) continue;
    drawTriangle(fb, a, b, c, shade, opts, stats);
  }
}
