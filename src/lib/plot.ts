import type { Palette } from './theme';
import { alpha } from './theme';

export interface PlotOpts {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pad?: { l: number; r: number; t: number; b: number };
  /** Keep 1 unit in x equal to 1 unit in y (expands the shorter range). */
  equal?: boolean;
}

/**
 * Small 2D plotting helper over a CanvasRenderingContext2D.
 * World coordinates → screen with y pointing up.
 */
export class Plot {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  p: Palette;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pad: { l: number; r: number; t: number; b: number };

  constructor(ctx: CanvasRenderingContext2D, w: number, h: number, palette: Palette, o: PlotOpts) {
    this.ctx = ctx;
    this.w = w;
    this.h = h;
    this.p = palette;
    this.pad = o.pad ?? { l: 36, r: 14, t: 14, b: 28 };
    this.xMin = o.xMin;
    this.xMax = o.xMax;
    this.yMin = o.yMin;
    this.yMax = o.yMax;
    if (o.equal) {
      const pw = this.pw;
      const ph = this.ph;
      const sx = pw / (o.xMax - o.xMin);
      const sy = ph / (o.yMax - o.yMin);
      if (sx > sy) {
        const half = (pw / sy) / 2;
        const cx = (o.xMin + o.xMax) / 2;
        this.xMin = cx - half;
        this.xMax = cx + half;
      } else {
        const half = (ph / sx) / 2;
        const cy = (o.yMin + o.yMax) / 2;
        this.yMin = cy - half;
        this.yMax = cy + half;
      }
    }
  }
  get pw() {
    return this.w - this.pad.l - this.pad.r;
  }
  get ph() {
    return this.h - this.pad.t - this.pad.b;
  }
  X(x: number) {
    return this.pad.l + ((x - this.xMin) / (this.xMax - this.xMin)) * this.pw;
  }
  Y(y: number) {
    return this.pad.t + (1 - (y - this.yMin) / (this.yMax - this.yMin)) * this.ph;
  }
  invX(sx: number) {
    return this.xMin + ((sx - this.pad.l) / this.pw) * (this.xMax - this.xMin);
  }
  invY(sy: number) {
    return this.yMin + (1 - (sy - this.pad.t) / this.ph) * (this.yMax - this.yMin);
  }
  /** pixels per world unit along x */
  get sx() {
    return this.pw / (this.xMax - this.xMin);
  }
  get sy() {
    return this.ph / (this.yMax - this.yMin);
  }

  clip() {
    const c = this.ctx;
    c.save();
    c.beginPath();
    c.rect(this.pad.l, this.pad.t, this.pw, this.ph);
    c.clip();
  }
  unclip() {
    this.ctx.restore();
  }

  /** Grid lines + tick labels. step defaults to a "nice" step. */
  grid(opts: { xStep?: number; yStep?: number; labels?: boolean; axes?: boolean; xLabel?: string; yLabel?: string; fmt?: (v: number) => string } = {}) {
    const c = this.ctx;
    const xStep = opts.xStep ?? niceStep(this.xMax - this.xMin, Math.max(3, Math.round(this.pw / 70)));
    const yStep = opts.yStep ?? niceStep(this.yMax - this.yMin, Math.max(3, Math.round(this.ph / 55)));
    const fmt = opts.fmt ?? fmtTick;
    c.save();
    c.lineWidth = 1;
    c.strokeStyle = this.p.grid;
    c.beginPath();
    for (let x = Math.ceil(this.xMin / xStep) * xStep; x <= this.xMax + 1e-9; x += xStep) {
      const sx = Math.round(this.X(x)) + 0.5;
      c.moveTo(sx, this.pad.t);
      c.lineTo(sx, this.pad.t + this.ph);
    }
    for (let y = Math.ceil(this.yMin / yStep) * yStep; y <= this.yMax + 1e-9; y += yStep) {
      const sy = Math.round(this.Y(y)) + 0.5;
      c.moveTo(this.pad.l, sy);
      c.lineTo(this.pad.l + this.pw, sy);
    }
    c.stroke();

    if (opts.axes !== false) {
      c.strokeStyle = this.p.lineStrong;
      c.beginPath();
      if (this.yMin <= 0 && this.yMax >= 0) {
        const sy = Math.round(this.Y(0)) + 0.5;
        c.moveTo(this.pad.l, sy);
        c.lineTo(this.pad.l + this.pw, sy);
      }
      if (this.xMin <= 0 && this.xMax >= 0) {
        const sx = Math.round(this.X(0)) + 0.5;
        c.moveTo(sx, this.pad.t);
        c.lineTo(sx, this.pad.t + this.ph);
      }
      c.stroke();
    }

    if (opts.labels !== false) {
      c.fillStyle = this.p.ink3;
      c.font = `11px ${this.p.fontMono}`;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      for (let x = Math.ceil(this.xMin / xStep) * xStep; x <= this.xMax + 1e-9; x += xStep) {
        c.fillText(fmt(x), this.X(x), this.pad.t + this.ph + 6);
      }
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      for (let y = Math.ceil(this.yMin / yStep) * yStep; y <= this.yMax + 1e-9; y += yStep) {
        c.fillText(fmt(y), this.pad.l - 6, this.Y(y));
      }
    }
    if (opts.xLabel) {
      c.fillStyle = this.p.ink2;
      c.font = `12px ${this.p.fontBody}`;
      c.textAlign = 'right';
      c.textBaseline = 'bottom';
      c.fillText(opts.xLabel, this.pad.l + this.pw, this.pad.t + this.ph - 4);
    }
    if (opts.yLabel) {
      c.fillStyle = this.p.ink2;
      c.font = `12px ${this.p.fontBody}`;
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.fillText(opts.yLabel, this.pad.l + 6, this.pad.t + 4);
    }
    c.restore();
  }

  /** Plot y = f(x). */
  fn(f: (x: number) => number, color: string, width = 2.5, opts: { dash?: number[]; from?: number; to?: number; samples?: number } = {}) {
    const c = this.ctx;
    const from = opts.from ?? this.xMin;
    const to = opts.to ?? this.xMax;
    const n = opts.samples ?? Math.max(80, Math.round(this.pw));
    c.save();
    this.clipRaw();
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (opts.dash) c.setLineDash(opts.dash);
    c.beginPath();
    let pen = false;
    for (let i = 0; i <= n; i++) {
      const x = from + ((to - from) * i) / n;
      const y = f(x);
      if (!isFinite(y)) {
        pen = false;
        continue;
      }
      const sy = this.Y(y);
      if (sy < -1e4 || sy > 1e4) {
        pen = false;
        continue;
      }
      if (!pen) c.moveTo(this.X(x), sy);
      else c.lineTo(this.X(x), sy);
      pen = true;
    }
    c.stroke();
    c.restore();
  }

  /** Fill area under f between from..to down to y=base. */
  fillUnder(f: (x: number) => number, color: string, from = this.xMin, to = this.xMax, base = 0) {
    const c = this.ctx;
    const n = Math.max(60, Math.round(((to - from) / (this.xMax - this.xMin)) * this.pw));
    c.save();
    this.clipRaw();
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(this.X(from), this.Y(base));
    for (let i = 0; i <= n; i++) {
      const x = from + ((to - from) * i) / n;
      c.lineTo(this.X(x), this.Y(f(x)));
    }
    c.lineTo(this.X(to), this.Y(base));
    c.closePath();
    c.fill();
    c.restore();
  }

  private clipRaw() {
    const c = this.ctx;
    c.beginPath();
    c.rect(this.pad.l, this.pad.t, this.pw, this.ph);
    c.clip();
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 2, dash?: number[]) {
    const c = this.ctx;
    c.save();
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = 'round';
    if (dash) c.setLineDash(dash);
    c.beginPath();
    c.moveTo(this.X(x1), this.Y(y1));
    c.lineTo(this.X(x2), this.Y(y2));
    c.stroke();
    c.restore();
  }

  /** Infinite line through (x0,y0) with slope m, clipped to the plot. */
  slopeLine(x0: number, y0: number, m: number, color: string, width = 2, dash?: number[]) {
    this.ctx.save();
    this.clipRaw();
    this.line(this.xMin, y0 + m * (this.xMin - x0), this.xMax, y0 + m * (this.xMax - x0), color, width, dash);
    this.ctx.restore();
  }

  dot(x: number, y: number, r: number, fill: string, stroke?: string, strokeW = 2) {
    const c = this.ctx;
    c.beginPath();
    c.arc(this.X(x), this.Y(y), r, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.lineWidth = strokeW;
      c.strokeStyle = stroke;
      c.stroke();
    }
  }

  arrow(x1: number, y1: number, x2: number, y2: number, color: string, width = 2.5, head = 10) {
    drawArrow(this.ctx, this.X(x1), this.Y(y1), this.X(x2), this.Y(y2), color, width, head);
  }

  text(s: string, x: number, y: number, color: string, opts: { dx?: number; dy?: number; align?: CanvasTextAlign; base?: CanvasTextBaseline; font?: string; bg?: string } = {}) {
    const c = this.ctx;
    c.save();
    c.font = opts.font ?? `600 13px ${this.p.fontBody}`;
    c.textAlign = opts.align ?? 'left';
    c.textBaseline = opts.base ?? 'middle';
    const sx = this.X(x) + (opts.dx ?? 0);
    const sy = this.Y(y) + (opts.dy ?? 0);
    if (opts.bg) {
      const m = c.measureText(s);
      const w = m.width + 8;
      const h = 18;
      let bx = sx - 4;
      if (c.textAlign === 'center') bx = sx - w / 2;
      if (c.textAlign === 'right') bx = sx - w + 4;
      c.fillStyle = opts.bg;
      c.beginPath();
      c.roundRect(bx, sy - h / 2, w, h, 4);
      c.fill();
    }
    c.fillStyle = color;
    c.fillText(s, sx, sy);
    c.restore();
  }

  /** Fill each cell of the plot area with color(x,y) at a given pixel resolution. */
  heatmap(color: (x: number, y: number) => [number, number, number, number], res = 4) {
    const c = this.ctx;
    const cols = Math.ceil(this.pw / res);
    const rows = Math.ceil(this.ph / res);
    const img = new ImageData(cols, rows);
    for (let j = 0; j < rows; j++) {
      const y = this.invY(this.pad.t + (j + 0.5) * res);
      for (let i = 0; i < cols; i++) {
        const x = this.invX(this.pad.l + (i + 0.5) * res);
        const [r, g, b, a] = color(x, y);
        const k = (j * cols + i) * 4;
        img.data[k] = r;
        img.data[k + 1] = g;
        img.data[k + 2] = b;
        img.data[k + 3] = a;
      }
    }
    const off = document.createElement('canvas');
    off.width = cols;
    off.height = rows;
    off.getContext('2d')!.putImageData(img, 0, 0);
    c.save();
    c.imageSmoothingEnabled = true;
    c.drawImage(off, this.pad.l, this.pad.t, cols * res, rows * res);
    c.restore();
  }

  frame(color = this.p.line) {
    const c = this.ctx;
    c.save();
    c.strokeStyle = color;
    c.lineWidth = 1;
    c.strokeRect(this.pad.l + 0.5, this.pad.t + 0.5, this.pw - 1, this.ph - 1);
    c.restore();
  }

  shade(color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.pad.l, this.pad.t, this.pw, this.ph);
  }

  softAlpha(color: string, a: number) {
    return alpha(color, a);
  }
}

export function drawArrow(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width = 2.5, head = 10) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const ux = dx / len;
  const uy = dy / len;
  const hl = Math.min(head, len * 0.6);
  const bx = x2 - ux * hl;
  const by = y2 - uy * hl;
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(bx + ux * 1, by + uy * 1);
  c.stroke();
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(bx - uy * hl * 0.5, by + ux * hl * 0.5);
  c.lineTo(bx + uy * hl * 0.5, by - ux * hl * 0.5);
  c.closePath();
  c.fill();
  c.restore();
}

export function niceStep(range: number, target: number): number {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const s = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return s * mag;
}

export function fmtTick(v: number): string {
  if (Math.abs(v) < 1e-9) return '0';
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 10) return String(Math.round(v * 10) / 10);
  if (a >= 1) return String(Math.round(v * 100) / 100);
  return String(Math.round(v * 1000) / 1000);
}

/** Format a number for readouts: fixed decimals with a real minus sign. */
export function fmt(v: number, d = 2): string {
  if (!isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : '—';
  const s = v.toFixed(d);
  return s.startsWith('-') ? '−' + s.slice(1) : s;
}
