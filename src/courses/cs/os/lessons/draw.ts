/* 운영체제: small canvas drawing helpers shared by the lessons and the cover. */

import { alpha, type Palette } from '../../../../lib/theme';

export function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** A filled + stroked box. */
export function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, stroke: string, lw = 1.5, dash?: number[]) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (lw > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.setLineDash(dash ?? []);
    ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
    ctx.setLineDash([]);
  }
}

/** Diagonal hatching inside a rectangle. */
export function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, gap = 5, lw = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let k = -h; k < w; k += gap) {
    ctx.moveTo(x + k, y + h);
    ctx.lineTo(x + k + h, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** A round token with a letter, e.g. a process. */
export function token(ctx: CanvasRenderingContext2D, P: Palette, x: number, y: number, r: number, color: string, label: string, faded = false) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = faded ? alpha(color, 0.25) : color;
  ctx.fill();
  ctx.strokeStyle = faded ? color : P.surface;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = faded ? P.ink : P.surface;
  ctx.font = `700 ${Math.round(r * 1.15)}px ${P.fontMono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 0.5);
}

/** Text with a surface-coloured backing so it stays legible over lines. */
export function label(ctx: CanvasRenderingContext2D, P: Palette, text: string, x: number, y: number, color: string, font = `600 11px ${P.fontBody}`, align: CanvasTextAlign = 'center') {
  ctx.font = font;
  const tw = ctx.measureText(text).width;
  const lx = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
  ctx.fillStyle = P.surface;
  ctx.fillRect(lx - 3, y - 8, tw + 6, 16);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, font: string, align: CanvasTextAlign = 'left', base: CanvasTextBaseline = 'middle') {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(s, x, y);
}
