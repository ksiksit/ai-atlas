/* 다변수 미적분: canvas helpers for the vector-field lessons (a square view of [−R, R]², arrows, handles). */

import { alpha, type Palette } from '../../../../lib/theme';
import { seeded, rk4, type Field, type V2 } from './fields';

export interface View {
  X: (x: number) => number;
  Y: (y: number) => number;
  /** Screen → world. */
  ix: (px: number) => number;
  iy: (py: number) => number;
  /** CSS px per world unit. */
  s: number;
  R: number;
  left: number;
  top: number;
  size: number;
}

/** The largest square that fits, centred, showing [−R, R] × [−R, R] with y pointing up. */
export function makeView(w: number, h: number, R = 3, pad = 6): View {
  const size = Math.min(w, h) - 2 * pad;
  const left = (w - size) / 2;
  const top = (h - size) / 2;
  const s = size / (2 * R);
  return {
    X: (x) => left + (x + R) * s,
    Y: (y) => top + (R - y) * s,
    ix: (px) => (px - left) / s - R,
    iy: (py) => R - (py - top) / s,
    s,
    R,
    left,
    top,
    size,
  };
}

/** Background: surface, faint unit grid and the two axes. */
export function drawFrame(ctx: CanvasRenderingContext2D, v: View, P: Palette) {
  ctx.fillStyle = P.surface;
  ctx.fillRect(v.left, v.top, v.size, v.size);
  ctx.strokeStyle = P.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = -Math.floor(v.R); k <= v.R; k++) {
    ctx.moveTo(v.X(k) + 0.5, v.top);
    ctx.lineTo(v.X(k) + 0.5, v.top + v.size);
    ctx.moveTo(v.left, v.Y(k) + 0.5);
    ctx.lineTo(v.left + v.size, v.Y(k) + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = alpha(P.ink3, 0.6);
  ctx.beginPath();
  ctx.moveTo(v.X(0) + 0.5, v.top);
  ctx.lineTo(v.X(0) + 0.5, v.top + v.size);
  ctx.moveTo(v.left, v.Y(0) + 0.5);
  ctx.lineTo(v.left + v.size, v.Y(0) + 0.5);
  ctx.stroke();
  ctx.strokeStyle = P.line;
  ctx.strokeRect(v.left + 0.5, v.top + 0.5, v.size - 1, v.size - 1);
}

/** A screen-space arrow from (x1, y1) to (x2, y2). */
export function arrowPx(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width = 1.5, head = 6) {
  const dx = x2 - x1, dy = y2 - y1;
  const L = Math.hypot(dx, dy);
  if (L < 0.5) return;
  const ux = dx / L, uy = dy / L;
  const hh = Math.min(head, L * 0.6);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - ux * hh * 0.6, y2 - uy * hh * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * hh - uy * hh * 0.45, y2 - uy * hh + ux * hh * 0.45);
  ctx.lineTo(x2 - ux * hh + uy * hh * 0.45, y2 - uy * hh - ux * hh * 0.45);
  ctx.closePath();
  ctx.fill();
}

/** Largest |F| on an n × n grid of the view, for scaling arrows. */
export function maxMagnitude(f: Field, R: number, n = 15): number {
  let m = 1e-9;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = -R + ((i + 0.5) * 2 * R) / n, y = -R + ((j + 0.5) * 2 * R) / n;
      const [p, q] = f.F(x, y);
      m = Math.max(m, Math.hypot(p, q));
    }
  return m;
}

/** The field as an n × n grid of arrows, scaled so the longest fills most of a cell. */
export function drawArrows(ctx: CanvasRenderingContext2D, v: View, f: Field, color: string, n = 15) {
  const cell = v.size / n;
  const M = maxMagnitude(f, v.R, n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = -v.R + ((i + 0.5) * 2 * v.R) / n, y = -v.R + ((j + 0.5) * 2 * v.R) / n;
      const [p, q] = f.F(x, y);
      const m = Math.hypot(p, q);
      if (m < 1e-6) continue;
      const L = (m / M) * cell * 0.82;
      const cx = v.X(x), cy = v.Y(y);
      const ux = p / m, uy = -q / m;
      arrowPx(ctx, cx - (ux * L) / 2, cy - (uy * L) / 2, cx + (ux * L) / 2, cy + (uy * L) / 2, alpha(color, 0.35 + 0.5 * (m / M)), 1.2, 4 + 2 * (m / M));
    }
}

/** A polyline in world coordinates. */
export function drawPath(ctx: CanvasRenderingContext2D, v: View, path: V2[], color: string, width = 2.5, dash: number[] = []) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  path.forEach(([x, y], i) => (i ? ctx.lineTo(v.X(x), v.Y(y)) : ctx.moveTo(v.X(x), v.Y(y))));
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Arrowheads along a path every `every` samples, showing its direction. */
export function pathArrows(ctx: CanvasRenderingContext2D, v: View, path: V2[], color: string, count = 3) {
  for (let k = 1; k <= count; k++) {
    const i = Math.floor((k * (path.length - 1)) / (count + 1));
    const [x0, y0] = path[Math.max(0, i - 2)], [x1, y1] = path[Math.min(path.length - 1, i + 2)];
    const mx = v.X((x0 + x1) / 2), my = v.Y((y0 + y1) / 2);
    const dx = v.X(x1) - v.X(x0), dy = v.Y(y1) - v.Y(y0);
    const L = Math.hypot(dx, dy) || 1;
    arrowPx(ctx, mx - (dx / L) * 6, my - (dy / L) * 6, mx + (dx / L) * 6, my + (dy / L) * 6, color, 2, 9);
  }
}

/** A draggable round handle with a short label. */
export function handle(ctx: CanvasRenderingContext2D, v: View, P: Palette, p: V2, color: string, label: string, active = false) {
  const x = v.X(p[0]), y = v.Y(p[1]);
  ctx.beginPath();
  ctx.arc(x, y, active ? 9 : 7.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = P.surface;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (active) {
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.strokeStyle = alpha(color, 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (label) {
    ctx.font = `700 12px ${P.fontMono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const tx = x + 11, ty = y - 11;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = alpha(P.surface, 0.85);
    ctx.fillRect(tx - 2, ty - 8, tw + 4, 16);
    ctx.fillStyle = color;
    ctx.fillText(label, tx, ty);
  }
}

/** Which handle (if any) is under the pointer. */
export function hitHandle(v: View | null, px: number, py: number, pts: [string, V2][], r = 16): string | null {
  if (!v) return null;
  let best: string | null = null;
  let bd = r;
  for (const [id, p] of pts) {
    const d = Math.hypot(v.X(p[0]) - px, v.Y(p[1]) - py);
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}

/** Keep a dragged point inside the view, rounded to 0.05. */
export function clampIn(v: View, px: number, py: number, margin = 0.15): V2 {
  const r = v.R - margin;
  const q = (t: number) => Math.round(Math.max(-r, Math.min(r, t)) * 20) / 20;
  return [q(v.ix(px)), q(v.iy(py))];
}

/** A tinted heat map of g over the view (positive → pos colour, negative → neg colour), on a coarse grid. */
export function drawHeat(ctx: CanvasRenderingContext2D, v: View, g: (x: number, y: number) => number, P: Palette, scale: number, n = 48, strength = 0.38) {
  const c = v.size / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = -v.R + ((i + 0.5) * 2 * v.R) / n, y = v.R - ((j + 0.5) * 2 * v.R) / n;
      const val = g(x, y) / scale;
      if (Math.abs(val) < 0.02) continue;
      ctx.fillStyle = alpha(val > 0 ? P.pos : P.neg, Math.min(1, Math.abs(val)) * strength);
      ctx.fillRect(v.left + i * c, v.top + j * c, c + 0.6, c + 0.6);
    }
}

/* ───────── particles carried by the field ───────── */

export interface Particles {
  pts: V2[];
  age: number[];
  rand: () => number;
}

export function makeParticles(count: number, R: number, seed = 7): Particles {
  const rand = seeded(seed);
  const pts: V2[] = [];
  const age: number[] = [];
  for (let i = 0; i < count; i++) {
    pts.push([(rand() * 2 - 1) * R, (rand() * 2 - 1) * R]);
    age.push(rand() * 4);
  }
  return { pts, age, rand };
}

/** Move every particle by dt along the field; respawn those that leave the view or grow old. */
export function stepParticles(ps: Particles, f: Field, dt: number, R: number, life = 4) {
  for (let i = 0; i < ps.pts.length; i++) {
    ps.pts[i] = rk4(f, ps.pts[i], dt);
    ps.age[i] += dt;
    const [x, y] = ps.pts[i];
    if (Math.abs(x) > R || Math.abs(y) > R || ps.age[i] > life || !isFinite(x)) {
      ps.pts[i] = [(ps.rand() * 2 - 1) * R, (ps.rand() * 2 - 1) * R];
      ps.age[i] = 0;
    }
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, v: View, ps: Particles, f: Field, color: string, life = 4) {
  for (let i = 0; i < ps.pts.length; i++) {
    const [x, y] = ps.pts[i];
    const [p, q] = f.F(x, y);
    const fade = Math.min(1, ps.age[i] * 2, (life - ps.age[i]) * 2);
    if (fade <= 0) continue;
    ctx.strokeStyle = alpha(color, 0.75 * fade);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(v.X(x - p * 0.12), v.Y(y - q * 0.12));
    ctx.lineTo(v.X(x), v.Y(y));
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

export const nf = (x: number, d = 2) => {
  const r = Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x;
  return r.toFixed(d).replace('-', '−');
};
