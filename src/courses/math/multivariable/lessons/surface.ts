/*
 * 다변수 미적분: functions of two variables and the ways the lessons draw them.
 *
 * Shared by several lessons; keep the exports stable (additions are fine).
 *  - presets: a few f(x, y) with exact gradients and Hessians
 *  - contours(): level curves by marching squares
 *  - makeProjector() / drawSurface(): a light 3-D surface on a 2-D canvas, with an orbit view
 *  - mapBox() / drawContours(): a flat contour map
 */

import { alpha, type Palette } from '../../../../lib/theme';

export type V2 = [number, number];
/** Symmetric 2×2 matrix [[fxx, fxy], [fxy, fyy]]. */
export type Hess = [[number, number], [number, number]];

export interface Fn {
  id: string;
  name: string;
  /** TeX for the formula, e.g. "f(x,y)=\\tfrac14(x^2+2y^2)". */
  tex: string;
  f: (x: number, y: number) => number;
  grad: (x: number, y: number) => V2;
  hess: (x: number, y: number) => Hess;
  /** The square of the plane the lessons show, and the z range to draw. */
  box: Box;
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

const BOX2: Omit<Box, 'z0' | 'z1'> = { x0: -2, x1: 2, y0: -2, y1: 2 };

/** h · exp(−((x−a)² + (y−b)²) / s): a round hill centred at (a, b). */
function bump(a: number, b: number, s: number, h: number) {
  const g = (x: number, y: number) => h * Math.exp(-((x - a) ** 2 + (y - b) ** 2) / s);
  return {
    f: g,
    grad: (x: number, y: number): V2 => {
      const v = g(x, y);
      return [(v * -2 * (x - a)) / s, (v * -2 * (y - b)) / s];
    },
    hess: (x: number, y: number): Hess => {
      const v = g(x, y);
      const dx = x - a, dy = y - b;
      const xx = v * ((4 * dx * dx) / (s * s) - 2 / s);
      const yy = v * ((4 * dy * dy) / (s * s) - 2 / s);
      const xy = (v * 4 * dx * dy) / (s * s);
      return [[xx, xy], [xy, yy]];
    },
  };
}

const H1 = bump(0.8, 0.6, 0.9, 1.6);
const H2 = bump(-1.0, -0.7, 0.7, 1.1);

export const presets: Record<'bowl' | 'saddle' | 'hills', Fn> = {
  bowl: {
    id: 'bowl',
    name: '그릇',
    tex: 'f(x,y)=\\tfrac14\\left(x^2+2y^2\\right)',
    f: (x, y) => (x * x + 2 * y * y) / 4,
    grad: (x, y) => [x / 2, y],
    hess: () => [[0.5, 0], [0, 1]],
    box: { ...BOX2, z0: 0, z1: 3 },
  },
  saddle: {
    id: 'saddle',
    name: '말안장',
    tex: 'f(x,y)=\\tfrac14\\left(x^2-y^2\\right)',
    f: (x, y) => (x * x - y * y) / 4,
    grad: (x, y) => [x / 2, -y / 2],
    hess: () => [[0.5, 0], [0, -0.5]],
    box: { ...BOX2, z0: -1, z1: 1 },
  },
  hills: {
    id: 'hills',
    name: '두 봉우리',
    tex: 'f(x,y)=1.6\\,e^{-\\frac{(x-0.8)^2+(y-0.6)^2}{0.9}}+1.1\\,e^{-\\frac{(x+1)^2+(y+0.7)^2}{0.7}}',
    f: (x, y) => H1.f(x, y) + H2.f(x, y),
    grad: (x, y) => {
      const a = H1.grad(x, y), b = H2.grad(x, y);
      return [a[0] + b[0], a[1] + b[1]];
    },
    hess: (x, y) => {
      const a = H1.hess(x, y), b = H2.hess(x, y);
      return [[a[0][0] + b[0][0], a[0][1] + b[0][1]], [a[1][0] + b[1][0], a[1][1] + b[1][1]]];
    },
    box: { ...BOX2, z0: 0, z1: 1.7 },
  },
};

export type PresetId = keyof typeof presets;

/* ───────── level curves (marching squares) ───────── */

export interface Contour {
  level: number;
  /** Line segments in (x, y) coordinates. */
  segs: [V2, V2][];
}

/** Level curves of f at the given levels on an n×n grid over the box. */
export function contours(f: (x: number, y: number) => number, box: Pick<Box, 'x0' | 'x1' | 'y0' | 'y1'>, levels: number[], n = 48): Contour[] {
  const xs = Array.from({ length: n + 1 }, (_, i) => box.x0 + ((box.x1 - box.x0) * i) / n);
  const ys = Array.from({ length: n + 1 }, (_, j) => box.y0 + ((box.y1 - box.y0) * j) / n);
  const z = ys.map((y) => xs.map((x) => f(x, y)));
  return levels.map((lv) => {
    const segs: [V2, V2][] = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        // corners: a (i,j) b (i+1,j) c (i+1,j+1) d (i,j+1)
        const za = z[j][i], zb = z[j][i + 1], zc = z[j + 1][i + 1], zd = z[j + 1][i];
        const pts: V2[] = [];
        const cut = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
          if ((z0 < lv) !== (z1 < lv)) {
            const t = (lv - z0) / (z1 - z0);
            pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
          }
        };
        cut(xs[i], ys[j], za, xs[i + 1], ys[j], zb);
        cut(xs[i + 1], ys[j], zb, xs[i + 1], ys[j + 1], zc);
        cut(xs[i + 1], ys[j + 1], zc, xs[i], ys[j + 1], zd);
        cut(xs[i], ys[j + 1], zd, xs[i], ys[j], za);
        if (pts.length === 2) segs.push([pts[0], pts[1]]);
        else if (pts.length === 4) {
          // saddle cell: pair by the centre value
          const zm = (za + zb + zc + zd) / 4;
          if ((zm < lv) === (za < lv)) {
            segs.push([pts[0], pts[1]], [pts[2], pts[3]]);
          } else {
            segs.push([pts[0], pts[3]], [pts[1], pts[2]]);
          }
        }
      }
    return { level: lv, segs };
  });
}

/** k evenly spaced levels strictly inside the box's z range. */
export function levelsFor(box: Box, k: number): number[] {
  return Array.from({ length: k }, (_, i) => box.z0 + ((box.z1 - box.z0) * (i + 1)) / (k + 1));
}

/* ───────── a flat map of the box ───────── */

export interface MapView {
  /** (x, y) → screen pixels. */
  to: (x: number, y: number) => V2;
  /** Screen pixels → (x, y). */
  from: (sx: number, sy: number) => V2;
  /** Pixels per unit. */
  k: number;
  left: number;
  top: number;
  size: number;
}

/** Fit the box's square into a w×h canvas, y up. */
export function mapBox(box: Pick<Box, 'x0' | 'x1' | 'y0' | 'y1'>, w: number, h: number, pad = 14): MapView {
  const size = Math.min(w, h) - 2 * pad;
  const k = size / Math.max(box.x1 - box.x0, box.y1 - box.y0);
  const left = (w - (box.x1 - box.x0) * k) / 2;
  const top = (h - (box.y1 - box.y0) * k) / 2;
  return {
    k,
    left,
    top,
    size,
    to: (x, y) => [left + (x - box.x0) * k, top + (box.y1 - y) * k],
    from: (sx, sy) => [box.x0 + (sx - left) / k, box.y1 - (sy - top) / k],
  };
}

/** Draw level curves on a canvas through any (x, y) → screen mapping. */
export function drawContours(
  ctx: CanvasRenderingContext2D,
  P: Palette,
  f: (x: number, y: number) => number,
  box: Pick<Box, 'x0' | 'x1' | 'y0' | 'y1'>,
  to: (x: number, y: number) => V2,
  opts: { levels: number[]; n?: number; color?: string; width?: number; highlight?: number } = { levels: [] },
) {
  const cs = contours(f, box, opts.levels, opts.n ?? 48);
  for (const c of cs) {
    const hi = opts.highlight !== undefined && Math.abs(c.level - opts.highlight) < 1e-9;
    ctx.strokeStyle = hi ? P.ink : opts.color ?? alpha(P.ink3, 0.7);
    ctx.lineWidth = hi ? 2 : opts.width ?? 1;
    ctx.beginPath();
    for (const [a, b] of c.segs) {
      const p = to(a[0], a[1]), q = to(b[0], b[1]);
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
    }
    ctx.stroke();
  }
}

/* ───────── a 3-D surface on a 2-D canvas ───────── */

export interface View {
  /** Turn about the vertical axis, radians. */
  yaw: number;
  /** Elevation of the eye: 0 looks from the side, π/2 straight down. */
  pitch: number;
}

export interface Projected {
  sx: number;
  sy: number;
  /** Larger is nearer the viewer. */
  depth: number;
}

export type Projector = (x: number, y: number, z: number) => Projected;

/**
 * Orthographic projection of the box into a w×h canvas. The box's x and y spans map to [−1, 1];
 * z spans to [−zScale, zScale] so tall surfaces stay inside.
 */
export function makeProjector(box: Box, view: View, w: number, h: number, zScale = 0.75): Projector {
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, cz = (box.z0 + box.z1) / 2;
  const hx = (box.x1 - box.x0) / 2, hy = (box.y1 - box.y0) / 2, hz = Math.max(1e-9, (box.z1 - box.z0) / 2);
  const cyaw = Math.cos(view.yaw), syaw = Math.sin(view.yaw);
  const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  // the rotated box fits in a circle of radius √2 horizontally; leave room for z
  const S = Math.min(w / (2 * 1.45), h / (2 * (1.45 * sp + zScale * cp) + 0.1));
  const ox = w / 2, oy = h / 2;
  return (x, y, z) => {
    const X = (x - cx) / hx, Y = (y - cy) / hy, Z = ((z - cz) / hz) * zScale;
    const X1 = X * cyaw - Y * syaw;
    const Y1 = X * syaw + Y * cyaw;
    const up = Z * cp + Y1 * sp;
    const depth = -Y1 * cp + Z * sp;
    return { sx: ox + X1 * S, sy: oy - up * S, depth };
  };
}

export interface SurfaceOpts {
  /** Grid cells per side. */
  n?: number;
  color?: string;
  /** Draw the grid lines over the shaded patches. */
  wire?: boolean;
  /** Fade the surface (e.g. to show something drawn over it). */
  opacity?: number;
  /** Draw the floor outline of the box. */
  floor?: boolean;
}

/**
 * Shaded surface z = f(x, y) over the box, painter's order (far patches first).
 * Returns the projector so callers can draw points, curves and planes on top.
 */
export function drawSurface(ctx: CanvasRenderingContext2D, P: Palette, fn: Pick<Fn, 'f' | 'grad'>, box: Box, view: View, w: number, h: number, opts: SurfaceOpts = {}): Projector {
  const n = opts.n ?? 26;
  const proj = makeProjector(box, view, w, h);
  const color = opts.color ?? P.accent;
  const clampZ = (z: number) => Math.max(box.z0, Math.min(box.z1, z));
  if (opts.floor !== false) {
    const c = [proj(box.x0, box.y0, box.z0), proj(box.x1, box.y0, box.z0), proj(box.x1, box.y1, box.z0), proj(box.x0, box.y1, box.z0)];
    ctx.strokeStyle = P.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    c.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)));
    ctx.closePath();
    ctx.stroke();
  }
  const dx = (box.x1 - box.x0) / n, dy = (box.y1 - box.y0) / n;
  // light from the upper left front, in the box's scaled coordinates
  const L = [-0.45, -0.5, 0.74];
  const zs = ((box.x1 - box.x0) / 2 / ((box.z1 - box.z0) / 2)) * 0.75;
  const quads: { pts: Projected[]; depth: number; b: number }[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x0 = box.x0 + i * dx, y0 = box.y0 + j * dy;
      const pts = [
        proj(x0, y0, clampZ(fn.f(x0, y0))),
        proj(x0 + dx, y0, clampZ(fn.f(x0 + dx, y0))),
        proj(x0 + dx, y0 + dy, clampZ(fn.f(x0 + dx, y0 + dy))),
        proj(x0, y0 + dy, clampZ(fn.f(x0, y0 + dy))),
      ];
      const [gx, gy] = fn.grad(x0 + dx / 2, y0 + dy / 2);
      const nx = -gx * zs, ny = -gy * zs, nz = 1;
      const nl = Math.hypot(nx, ny, nz);
      const b = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / nl);
      quads.push({ pts, depth: (pts[0].depth + pts[1].depth + pts[2].depth + pts[3].depth) / 4, b });
    }
  quads.sort((a, b) => a.depth - b.depth);
  ctx.save();
  ctx.globalAlpha = opts.opacity ?? 1;
  for (const q of quads) {
    ctx.beginPath();
    q.pts.forEach((p, k) => (k ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)));
    ctx.closePath();
    ctx.fillStyle = P.surface;
    ctx.fill();
    ctx.fillStyle = alpha(color, 0.18 + 0.62 * q.b);
    ctx.fill();
    if (opts.wire !== false) {
      ctx.strokeStyle = alpha(P.ink, 0.12);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }
  ctx.restore();
  return proj;
}

/** A polyline through 3-D points. */
export function drawPath3(ctx: CanvasRenderingContext2D, proj: Projector, pts: [number, number, number][], color: string, width = 2, dash?: number[]) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash ?? []);
  ctx.beginPath();
  pts.forEach(([x, y, z], i) => {
    const p = proj(x, y, z);
    if (i) ctx.lineTo(p.sx, p.sy);
    else ctx.moveTo(p.sx, p.sy);
  });
  ctx.stroke();
  ctx.setLineDash([]);
}

/** A filled dot at a 3-D point. */
export function dot3(ctx: CanvasRenderingContext2D, P: Palette, proj: Projector, x: number, y: number, z: number, color: string, r = 5) {
  const p = proj(x, y, z);
  ctx.beginPath();
  ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = P.surface;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** An arrow between two screen points. */
export function arrow2(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width = 2, head = 8) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - Math.cos(a) * Math.min(head * 0.6, len), y1 - Math.sin(a) * Math.min(head * 0.6, len));
  ctx.stroke();
  if (len < 2) return;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(a - 0.4), y1 - head * Math.sin(a - 0.4));
  ctx.lineTo(x1 - head * Math.cos(a + 0.4), y1 - head * Math.sin(a + 0.4));
  ctx.closePath();
  ctx.fill();
}

/** Number with d decimals, trailing zeros dropped, and a real minus sign. */
export function nf(v: number, d = 2): string {
  if (!isFinite(v)) return '∞';
  const s = (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(/\.?0+$/, '');
  return (s === '-0' ? '0' : s).replace('-', '−');
}
