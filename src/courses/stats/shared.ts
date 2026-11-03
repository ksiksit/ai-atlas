import type { Palette } from '../../lib/theme';
import { quantileSorted } from '../../lib/math';

/**
 * Dot-plot stacking: given screen x positions, return a level (0, 1, 2, …) for each dot
 * so that dots closer than `gap` pixels stack upward instead of overlapping.
 */
export function stackLevels(xs: number[], gap: number): number[] {
  const order = xs.map((x, i) => i).sort((a, b) => xs[a] - xs[b]);
  const levels = new Array(xs.length).fill(0);
  const placed: { x: number; level: number }[] = [];
  for (const i of order) {
    let level = 0;
    while (placed.some((p) => p.level === level && Math.abs(p.x - xs[i]) < gap)) level++;
    levels[i] = level;
    placed.push({ x: xs[i], level });
  }
  return levels;
}

export interface FiveNumber {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  /** Whisker ends: the most extreme values within 1.5 × IQR of the box. */
  lo: number;
  hi: number;
  outliers: number[];
}

export function fiveNumber(values: number[]): FiveNumber {
  const s = [...values].sort((a, b) => a - b);
  const q1 = quantileSorted(s, 0.25);
  const q3 = quantileSorted(s, 0.75);
  const iqr = q3 - q1;
  const inside = s.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
  return {
    min: s[0],
    q1,
    median: quantileSorted(s, 0.5),
    q3,
    max: s[s.length - 1],
    lo: inside[0] ?? s[0],
    hi: inside[inside.length - 1] ?? s[s.length - 1],
    outliers: s.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr),
  };
}

/** A small filled label box with text, centered at (x, y). */
export function tag(ctx: CanvasRenderingContext2D, P: Palette, text: string, x: number, y: number, color: string) {
  ctx.save();
  ctx.font = `600 11px ${P.fontMono}`;
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 9, w, 18, 3);
  ctx.fill();
  ctx.fillStyle = P.surface;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

/** Horizontal baseline with ticks every `step` units, labels below. */
export function axisLine(ctx: CanvasRenderingContext2D, P: Palette, X: (v: number) => number, y: number, from: number, to: number, step: number, label?: string, fmtTick: (v: number) => string = String) {
  ctx.save();
  ctx.strokeStyle = P.lineStrong;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(X(from), y + 0.5);
  ctx.lineTo(X(to), y + 0.5);
  for (let v = Math.ceil(from / step) * step; v <= to + 1e-9; v += step) {
    const x = Math.round(X(v)) + 0.5;
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 5);
  }
  ctx.stroke();
  ctx.fillStyle = P.ink3;
  ctx.font = `11px ${P.fontMono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let v = Math.ceil(from / step) * step; v <= to + 1e-9; v += step) ctx.fillText(fmtTick(Math.round(v * 1000) / 1000), X(v), y + 8);
  if (label) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.font = `11px ${P.fontBody}`;
    // a paper-colored backing keeps the axis name readable when bars reach the corner
    const lw = ctx.measureText(label).width;
    ctx.fillStyle = P.surface;
    ctx.fillRect(X(to) - lw - 4, y - 18, lw + 6, 15);
    ctx.fillStyle = P.ink3;
    ctx.fillText(label, X(to), y - 4);
  }
  ctx.restore();
}
