/*
 * 복소해석: the shared complex-number toolkit.
 * Arithmetic on C = [re, im], a registry of preset functions, domain colouring,
 * plane axes and images of grid lines. No imports except types, so node can run it.
 */

import type { Palette } from '../../../../lib/theme';

export type C = [number, number];

/* ───────── arithmetic ───────── */

export const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export function div(a: C, b: C): C {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}
export const conj = (a: C): C => [a[0], -a[1]];
export const abs = (a: C) => Math.hypot(a[0], a[1]);
/** Principal argument in (−π, π]. */
export const arg = (a: C) => Math.atan2(a[1], a[0]);
export const scale = (a: C, s: number): C => [a[0] * s, a[1] * s];
export const fromPolar = (r: number, t: number): C => [r * Math.cos(t), r * Math.sin(t)];
export function cexp(a: C): C {
  const e = Math.exp(a[0]);
  return [e * Math.cos(a[1]), e * Math.sin(a[1])];
}
/** Principal logarithm: ln|z| + i Arg z. */
export const clog = (a: C): C => [Math.log(abs(a)), arg(a)];
/** Integer power by repeated multiplication (negative n allowed). */
export function cpow(a: C, n: number): C {
  let r: C = [1, 0];
  const k = Math.abs(Math.round(n));
  for (let i = 0; i < k; i++) r = mul(r, a);
  return n < 0 ? div([1, 0], r) : r;
}
export const csin = (a: C): C => [Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1])];
export const ccos = (a: C): C => [Math.cos(a[0]) * Math.cosh(a[1]), -Math.sin(a[0]) * Math.sinh(a[1])];
/** Principal square root (branch cut along the negative real axis). */
export function csqrt(a: C): C {
  return fromPolar(Math.sqrt(abs(a)), arg(a) / 2);
}

/** "1.20 + 0.50i" with a proper minus sign. */
export function fmtC(z: C, d = 2): string {
  const n = (v: number) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v);
  const re = n(z[0]), im = n(z[1]);
  const s = (v: number) => v.toFixed(d).replace('-', '−');
  if (im === 0) return s(re);
  if (re === 0) return `${s(im)}i`;
  return `${s(re)} ${im < 0 ? '−' : '+'} ${Math.abs(im).toFixed(d)}i`;
}

/* ───────── preset functions ───────── */

export interface Preset {
  name: string;
  tex: string;
  f: (z: C) => C;
  df?: (z: C) => C;
}

export const presets: Record<string, Preset> = {
  z: { name: 'z', tex: 'z', f: (z) => z, df: () => [1, 0] },
  z2: { name: 'z²', tex: 'z^2', f: (z) => mul(z, z), df: (z) => scale(z, 2) },
  z3m1: { name: 'z³ − 1', tex: 'z^3 - 1', f: (z) => sub(cpow(z, 3), [1, 0]), df: (z) => scale(mul(z, z), 3) },
  inv: { name: '1/z', tex: '1/z', f: (z) => div([1, 0], z), df: (z) => scale(div([1, 0], mul(z, z)), -1) },
  mobius: {
    name: '(z² − 1)/(z² + 1)',
    tex: '\\dfrac{z^2-1}{z^2+1}',
    f: (z) => {
      const z2 = mul(z, z);
      return div(sub(z2, [1, 0]), add(z2, [1, 0]));
    },
    // d/dz = 4z / (z² + 1)²
    df: (z) => {
      const q = add(mul(z, z), [1, 0]);
      return div(scale(z, 4), mul(q, q));
    },
  },
  exp: { name: 'eᶻ', tex: 'e^z', f: cexp, df: cexp },
  sin: { name: 'sin z', tex: '\\sin z', f: csin, df: ccos },
  sqrt: { name: '√z', tex: '\\sqrt{z}', f: csqrt, df: (z) => div([0.5, 0], csqrt(z)) },
  essential: {
    name: 'e^(1/z)',
    tex: 'e^{1/z}',
    f: (z) => cexp(div([1, 0], z)),
    df: (z) => scale(div(cexp(div([1, 0], z)), mul(z, z)), -1),
  },
};

/* ───────── domain colouring ───────── */

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** HSL (h in turns, s and l in 0..1) to 0..255 RGB. */
function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Colour of one value: hue from the argument (0 = red, 1/3 turn = green, 2/3 = blue). */
export function colorOf(w: C, opts: { bands?: boolean; hue?: boolean } = {}): [number, number, number] {
  const { bands = true, hue = true } = opts;
  const m = abs(w);
  if (!isFinite(m) || isNaN(m)) return [255, 255, 255];
  const h = ((arg(w) / (2 * Math.PI)) % 1 + 1) % 1;
  // brightness rises within each doubling of |w|: a saw-tooth in log₂|w|
  const t = Math.log2(Math.max(m, 1e-300));
  const frac = t - Math.floor(t);
  const l = bands ? 0.32 + 0.3 * frac : 0.5;
  if (!hue) {
    const g = Math.round(255 * (0.15 + 0.7 * frac));
    return [g, g, g];
  }
  return hsl(h, 0.85, l);
}

/**
 * Domain colouring of f over the box, w × h pixels, as RGBA bytes (row 0 at the top, y1).
 * `grid` draws dark lines where Re f or Im f is a multiple of `gridStep`.
 */
export function domainColor(f: (z: C) => C, box: Box, w: number, h: number, opts: { bands?: boolean; hue?: boolean; grid?: boolean; gridStep?: number } = {}): Uint8ClampedArray {
  const { grid = false, gridStep = 0.5 } = opts;
  const out = new Uint8ClampedArray(w * h * 4);
  const dx = (box.x1 - box.x0) / w, dy = (box.y1 - box.y0) / h;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const z: C = [box.x0 + (i + 0.5) * dx, box.y1 - (j + 0.5) * dy];
      const v = f(z);
      let [r, g, b] = colorOf(v, opts);
      if (grid && isFinite(v[0]) && isFinite(v[1])) {
        // a line where Re or Im crosses a multiple of gridStep within this pixel
        const fr = v[0] / gridStep, fi = v[1] / gridStep;
        const near = (q: number) => Math.abs(q - Math.round(q));
        const scaleU = abs(sub(f([z[0] + dx, z[1]]), v)) / gridStep + 1e-9;
        if (near(fr) < 0.6 * scaleU || near(fi) < 0.6 * scaleU) {
          r *= 0.35;
          g *= 0.35;
          b *= 0.35;
        }
      }
      const k = (j * w + i) * 4;
      out[k] = r;
      out[k + 1] = g;
      out[k + 2] = b;
      out[k + 3] = 255;
    }
  }
  return out;
}

/** Put RGBA bytes onto a canvas at (x, y) scaled to (dw, dh). */
export function blit(ctx: CanvasRenderingContext2D, bytes: Uint8ClampedArray, w: number, h: number, x: number, y: number, dw: number, dh: number) {
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(bytes), w, h), 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, x, y, dw, dh);
}

/* ───────── plane drawing ───────── */

/** A screen rectangle that shows a box with equal scale on both axes (centred). */
export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Mapper {
  X: (x: number) => number;
  Y: (y: number) => number;
  invX: (sx: number) => number;
  invY: (sy: number) => number;
  /** Pixels per unit. */
  k: number;
  /** The rectangle actually used (after keeping 1:1). */
  rect: View;
}

/** Map box → view keeping one unit the same length on both axes. */
export function mapper(box: Box, view: View): Mapper {
  const k = Math.min(view.w / (box.x1 - box.x0), view.h / (box.y1 - box.y0));
  const w = k * (box.x1 - box.x0), h = k * (box.y1 - box.y0);
  const ox = view.x + (view.w - w) / 2, oy = view.y + (view.h - h) / 2;
  return {
    X: (x) => ox + (x - box.x0) * k,
    Y: (y) => oy + (box.y1 - y) * k,
    invX: (sx) => box.x0 + (sx - ox) / k,
    invY: (sy) => box.y1 - (sy - oy) / k,
    k,
    rect: { x: ox, y: oy, w, h },
  };
}

/** Axes, unit ticks and Re/Im labels for a complex plane; returns the mapper. */
export function drawPlane(ctx: CanvasRenderingContext2D, P: Palette, box: Box, view: View, opts: { grid?: boolean; labels?: boolean; step?: number } = {}): Mapper {
  const { grid = true, labels = true, step = 1 } = opts;
  const m = mapper(box, view);
  const { x, y, w, h } = m.rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (grid) {
    ctx.strokeStyle = P.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let v = Math.ceil(box.x0 / step) * step; v <= box.x1 + 1e-9; v += step) {
      ctx.moveTo(Math.round(m.X(v)) + 0.5, y);
      ctx.lineTo(Math.round(m.X(v)) + 0.5, y + h);
    }
    for (let v = Math.ceil(box.y0 / step) * step; v <= box.y1 + 1e-9; v += step) {
      ctx.moveTo(x, Math.round(m.Y(v)) + 0.5);
      ctx.lineTo(x + w, Math.round(m.Y(v)) + 0.5);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = P.lineStrong;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (box.y0 <= 0 && box.y1 >= 0) {
    ctx.moveTo(x, Math.round(m.Y(0)) + 0.5);
    ctx.lineTo(x + w, Math.round(m.Y(0)) + 0.5);
  }
  if (box.x0 <= 0 && box.x1 >= 0) {
    ctx.moveTo(Math.round(m.X(0)) + 0.5, y);
    ctx.lineTo(Math.round(m.X(0)) + 0.5, y + h);
  }
  ctx.stroke();
  ctx.restore();
  if (labels) {
    ctx.fillStyle = P.ink3;
    ctx.font = `10px ${P.fontMono}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    if (box.y0 <= 0 && box.y1 >= 0) ctx.fillText('Re', x + w - 3, m.Y(0) - 3);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    if (box.x0 <= 0 && box.x1 >= 0) ctx.fillText('Im', m.X(0) + 4, y + 3);
  }
  return m;
}

/* ───────── images of grid lines ───────── */

export interface GridLine {
  dir: 'h' | 'v';
  /** The constant coordinate of the line in the source plane. */
  value: number;
  pts: C[];
}

/** Images under f of n horizontal and n vertical lines across the box, `samples` points each. */
export function mapGrid(f: (z: C) => C, box: Box, n: number, samples = 80): GridLine[] {
  const out: GridLine[] = [];
  for (let k = 0; k <= n; k++) {
    const y = box.y0 + ((box.y1 - box.y0) * k) / n;
    const x = box.x0 + ((box.x1 - box.x0) * k) / n;
    const hp: C[] = [], vp: C[] = [];
    for (let s = 0; s <= samples; s++) {
      const t = s / samples;
      hp.push(f([box.x0 + (box.x1 - box.x0) * t, y]));
      vp.push(f([x, box.y0 + (box.y1 - box.y0) * t]));
    }
    out.push({ dir: 'h', value: y, pts: hp }, { dir: 'v', value: x, pts: vp });
  }
  return out;
}

/* ───────── winding ───────── */

/**
 * How many times f(z) winds around 0 as z goes once counter-clockwise around the circle
 * |z − c| = r. By the argument principle this is (zeros − poles) inside, counted with order.
 */
export function windingAround(f: (z: C) => C, c: C, r: number, samples = 720): number {
  let total = 0;
  let prev = arg(f(add(c, [r, 0])));
  for (let s = 1; s <= samples; s++) {
    const a = arg(f(add(c, fromPolar(r, (2 * Math.PI * s) / samples))));
    let d = a - prev;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    total += d;
    prev = a;
  }
  return Math.round(total / (2 * Math.PI)) || 0;
}
