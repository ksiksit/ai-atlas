import { useMemo } from 'react';
import { Button } from '../../../../components/ui';
import type { Plot } from '../../../../lib/plot';
import type { Palette } from '../../../../lib/theme';

/** The three part colours of this course, resolved for canvas drawing (re-read when the theme changes). */
export function useMathColors(P: Palette): [string, string, string] {
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const get = (v: string, fb: string) => cs.getPropertyValue(v).trim() || fb;
    return [get('--c-math-1', P.bad), get('--c-math-2', P.neg), get('--c-math-3', P.hl)];
  }, [P]);
}

/** The "다시 굴리기" button every random figure has: a new seed, a new run. */
export function Reroll({ onClick, label = '다시 굴리기' }: { onClick: () => void; label?: string }) {
  return (
    <Button small onClick={onClick} title="난수 씨앗을 바꿔 새로 뽑습니다">
      ↻ {label}
    </Button>
  );
}

/** Vertical bars at integer x = x0, x0+1, … with the given heights (in plot units). */
export function bars(plot: Plot, ys: number[], color: string, opts: { x0?: number; width?: number; stroke?: string } = {}) {
  const { x0 = 0, width = 0.8, stroke } = opts;
  const c = plot.ctx;
  c.save();
  for (let i = 0; i < ys.length; i++) {
    const x = x0 + i;
    if (x < plot.xMin - 1 || x > plot.xMax + 1) continue;
    const y = Math.min(ys[i], plot.yMax);
    if (!(y > 0)) continue;
    const l = plot.X(x - width / 2);
    const r = plot.X(x + width / 2);
    const top = plot.Y(y);
    const base = plot.Y(Math.max(0, plot.yMin));
    c.fillStyle = color;
    c.fillRect(l, top, Math.max(1, r - l), base - top);
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 1;
      c.strokeRect(l + 0.5, top + 0.5, Math.max(1, r - l) - 1, base - top - 1);
    }
  }
  c.restore();
}

/** Dots (with thin stems) for an exact PMF drawn over sampled bars. */
export function pmfDots(plot: Plot, ys: number[], color: string, bg: string, x0 = 0) {
  for (let i = 0; i < ys.length; i++) {
    const x = x0 + i;
    if (x < plot.xMin || x > plot.xMax || !(ys[i] > 1e-6)) continue;
    plot.line(x, 0, x, Math.min(ys[i], plot.yMax), color, 1.2);
    plot.dot(x, Math.min(ys[i], plot.yMax), 3.6, color, bg, 1.4);
  }
}

/** Polyline through (xs[i], ys[i]). */
export function polyline(plot: Plot, xs: number[], ys: number[], color: string, width = 2, dash?: number[]) {
  const c = plot.ctx;
  c.save();
  c.beginPath();
  c.rect(plot.pad.l, plot.pad.t, plot.pw, plot.ph);
  c.clip();
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineJoin = 'round';
  if (dash) c.setLineDash(dash);
  c.beginPath();
  let pen = false;
  for (let i = 0; i < xs.length; i++) {
    if (!isFinite(ys[i])) {
      pen = false;
      continue;
    }
    const X = plot.X(xs[i]);
    const Y = plot.Y(ys[i]);
    if (!pen) c.moveTo(X, Y);
    else c.lineTo(X, Y);
    pen = true;
  }
  c.stroke();
  c.restore();
}

/** Small text label inside a canvas at screen coordinates. */
export function label(ctx: CanvasRenderingContext2D, P: Palette, s: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left', base: CanvasTextBaseline = 'middle', size = 12, weight = 600) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${P.fontBody}`;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** Tick labels with separate formats per axis (Plot.grid uses one format for both). */
export function ticks(plot: Plot, P: Palette, xs: [number, string][], ys: [number, string][]) {
  const c = plot.ctx;
  c.save();
  c.fillStyle = P.ink3;
  c.font = `11px ${P.fontMono}`;
  c.textAlign = 'center';
  c.textBaseline = 'top';
  for (const [v, s] of xs) c.fillText(s, plot.X(v), plot.pad.t + plot.ph + 6);
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  for (const [v, s] of ys) c.fillText(s, plot.pad.l - 6, plot.Y(v));
  c.restore();
}
