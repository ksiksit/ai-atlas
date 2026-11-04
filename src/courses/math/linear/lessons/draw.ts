/* 선형대수: canvas drawing helpers shared by the lessons (a coordinate plane, transformed grids, the letter F). */
import { useMemo, useState, type KeyboardEvent } from 'react';
import { Plot, drawArrow } from '../../../../lib/plot';
import { alpha, type Palette } from '../../../../lib/theme';
import { ap, type Mat2, type Vec2 } from './la';

/** The three part colours of this course, resolved for canvas drawing (re-read when the theme changes). */
export function useLaColors(P: Palette): [string, string, string] {
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const get = (v: string, fb: string) => cs.getPropertyValue(v).trim() || fb;
    return [get('--c-math-1', P.bad), get('--c-math-2', P.neg), get('--c-math-3', P.hl)];
  }, [P]);
}

/**
 * An equal-scale coordinate plane centred at (cx, cy) that shows at least `half` units each way,
 * with a unit grid, axes and small tick numbers.
 */
export function plane(ctx: CanvasRenderingContext2D, w: number, h: number, P: Palette, half: number, o: { cx?: number; cy?: number; numbers?: boolean; grid?: boolean; step?: number } = {}): Plot {
  const cx = o.cx ?? 0;
  const cy = o.cy ?? 0;
  const plot = new Plot(ctx, w, h, P, { xMin: cx - half, xMax: cx + half, yMin: cy - half, yMax: cy + half, equal: true, pad: { l: 6, r: 6, t: 6, b: 6 } });
  const step = o.step ?? 1;
  if (o.grid !== false) plot.grid({ xStep: step, yStep: step, labels: false });
  if (o.numbers !== false) {
    ctx.save();
    ctx.fillStyle = P.ink3;
    ctx.font = `10px ${P.fontMono}`;
    const every = plot.sx < 22 ? 2 : 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const y0 = Math.min(Math.max(plot.Y(0) + 3, plot.pad.t), plot.h - plot.pad.b - 12);
    const x0 = Math.min(Math.max(plot.X(0) - 4, plot.pad.l + 14), plot.w - plot.pad.r);
    for (let x = Math.ceil(plot.xMin + 0.3); x <= plot.xMax - 0.3; x += step) if (x && Math.round(x / step) % every === 0) ctx.fillText(String(x).replace('-', '−'), plot.X(x), y0);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = Math.ceil(plot.yMin + 0.3); y <= plot.yMax - 0.3; y += step) if (y && Math.round(y / step) % every === 0) ctx.fillText(String(y).replace('-', '−'), x0, plot.Y(y));
    ctx.restore();
  }
  return plot;
}

/** Clip drawing to the plot area; call the returned function to undo. */
export function clipTo(plot: Plot): () => void {
  const c = plot.ctx;
  c.save();
  c.beginPath();
  c.rect(plot.pad.l, plot.pad.t, plot.pw, plot.ph);
  c.clip();
  return () => c.restore();
}

/** The image of the integer grid lines x = k and y = k under m. */
export function tGrid(plot: Plot, m: Mat2, color: string, width = 1, extent = 12, axisColor?: string) {
  const c = plot.ctx;
  const un = clipTo(plot);
  c.lineWidth = width;
  for (let k = -extent; k <= extent; k++) {
    c.strokeStyle = k === 0 && axisColor ? axisColor : color;
    c.lineWidth = k === 0 && axisColor ? width + 1 : width;
    c.beginPath();
    let p = ap(m, [k, -extent]);
    let q = ap(m, [k, extent]);
    c.moveTo(plot.X(p[0]), plot.Y(p[1]));
    c.lineTo(plot.X(q[0]), plot.Y(q[1]));
    p = ap(m, [-extent, k]);
    q = ap(m, [extent, k]);
    c.moveTo(plot.X(p[0]), plot.Y(p[1]));
    c.lineTo(plot.X(q[0]), plot.Y(q[1]));
    c.stroke();
  }
  un();
}

/** The letter F, drawn in the unit square so that flips and turns are easy to see. */
export const F_SHAPE: Vec2[] = [
  [0.22, 0.08],
  [0.42, 0.08],
  [0.42, 0.44],
  [0.7, 0.44],
  [0.7, 0.6],
  [0.42, 0.6],
  [0.42, 0.76],
  [0.82, 0.76],
  [0.82, 0.92],
  [0.22, 0.92],
];

/** Fill and stroke the polygon `pts` after mapping it through m. */
export function poly(plot: Plot, pts: Vec2[], m: Mat2, fill: string | null, stroke: string | null, width = 1.5) {
  const c = plot.ctx;
  const un = clipTo(plot);
  c.beginPath();
  pts.forEach((p, i) => {
    const q = ap(m, p);
    if (i === 0) c.moveTo(plot.X(q[0]), plot.Y(q[1]));
    else c.lineTo(plot.X(q[0]), plot.Y(q[1]));
  });
  c.closePath();
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.lineJoin = 'round';
    c.stroke();
  }
  un();
}

export const UNIT_SQUARE: Vec2[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/** A circle of radius r as a polygon. */
export const circlePts = (r = 1, n = 96): Vec2[] => Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * 2 * Math.PI), r * Math.sin((i / n) * 2 * Math.PI)] as Vec2);

/** Infinite line through the origin along `dir`. */
export function lineThrough(plot: Plot, dir: Vec2, color: string, width = 1.5, dash?: number[], through: Vec2 = [0, 0]) {
  const L = (plot.xMax - plot.xMin + plot.yMax - plot.yMin) * 2;
  const n = Math.hypot(dir[0], dir[1]) || 1;
  const u: Vec2 = [dir[0] / n, dir[1] / n];
  const un = clipTo(plot);
  plot.line(through[0] - u[0] * L, through[1] - u[1] * L, through[0] + u[0] * L, through[1] + u[1] * L, color, width, dash);
  un();
}

/** Arrow from `from` to `to` in world coordinates. */
export function arrow(plot: Plot, from: Vec2, to: Vec2, color: string, width = 2.5, head = 11) {
  drawArrow(plot.ctx, plot.X(from[0]), plot.Y(from[1]), plot.X(to[0]), plot.Y(to[1]), color, width, head);
}

/** A draggable handle: a ring at the tip of a vector. `focus` draws a keyboard focus ring. */
export function knob(plot: Plot, v: Vec2, color: string, P: Palette, focus = false) {
  plot.dot(v[0], v[1], 7, P.surface, color, 2.5);
  if (focus) {
    const c = plot.ctx;
    c.save();
    c.strokeStyle = P.accent;
    c.lineWidth = 2;
    c.setLineDash([3, 3]);
    c.beginPath();
    c.arc(plot.X(v[0]), plot.Y(v[1]), 13, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
}

/** A text label near a world point, on a soft background so it stays readable over grids. */
export function label(plot: Plot, s: string, at: Vec2, color: string, P: Palette, dx = 10, dy = -12, align: CanvasTextAlign = 'left') {
  // keep labels inside the plot
  const c = plot.ctx;
  c.save();
  c.font = `600 13px ${P.fontBody}`;
  const wpx = c.measureText(s).width + 8;
  c.restore();
  let sx = plot.X(at[0]) + dx;
  if (align === 'left') sx = Math.min(sx, plot.w - plot.pad.r - wpx);
  if (align === 'left') sx = Math.max(sx, plot.pad.l + 4);
  const sy = Math.min(Math.max(plot.Y(at[1]) + dy, plot.pad.t + 10), plot.h - plot.pad.b - 10);
  plot.text(s, plot.invX(sx), plot.invY(sy), color, { align, bg: alpha(P.surface, 0.86) });
}

/** Snap a world coordinate to 0.1 and keep it inside the plot. */
export function snapIn(plot: Plot, sx: number, sy: number, margin = 0.25, grid = 0.1): Vec2 {
  const s = (v: number) => Math.round(v / grid) * grid;
  return [s(Math.max(plot.xMin + margin, Math.min(plot.xMax - margin, plot.invX(sx)))), s(Math.max(plot.yMin + margin, Math.min(plot.yMax - margin, plot.invY(sy))))];
}

/** Find which of the named world points lies under the pointer. */
export function hitPoint(plot: Plot | null, x: number, y: number, pts: [string, Vec2][], r = 18): string | null {
  if (!plot) return null;
  let best: string | null = null;
  let bd = r;
  for (const [id, v] of pts) {
    const d = Math.hypot(plot.X(v[0]) - x, plot.Y(v[1]) - y);
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}

/**
 * Keyboard access for draggable handles on a canvas: when the canvas has focus the arrow keys move the
 * current handle by 0.1 (Shift: 0.5), and Space or Enter switches to the next handle.
 */
export function useKeyHandles(ids: string[], move: (id: string, dx: number, dy: number) => void) {
  const [k, setK] = useState(0);
  const [focus, setFocus] = useState(false);
  const cur = ids[Math.min(k, ids.length - 1)];
  const props = {
    tabIndex: 0,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    onKeyDown: (e: KeyboardEvent) => {
      const st = e.shiftKey ? 0.5 : 0.1;
      const d: Record<string, Vec2> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] };
      if (d[e.key]) {
        e.preventDefault();
        move(cur, d[e.key][0], d[e.key][1]);
      } else if ((e.key === ' ' || e.key === 'Enter') && ids.length > 1) {
        e.preventDefault();
        setK((x) => (x + 1) % ids.length);
      }
    },
  };
  return { props, active: focus ? cur : null };
}

export const KEY_HINT = '캔버스를 누르거나 Tab으로 고른 뒤 화살표 키로도 움직일 수 있습니다(Space: 다음 손잡이).';
