import type { ReactNode } from 'react';
import { alpha, type Palette } from '../../../../lib/theme';

/* 컴퓨터 구조: small SVG pieces for circuit drawings (gates, wires, lamps) */

export type GateKind = 'and' | 'or' | 'not' | 'xor' | 'nand' | 'nor';

export const GW = 44; // gate body width
export const GH = 36; // gate body height
export const PIN = 9; // inputs sit at cy ± PIN

/** Where the output pin of a gate drawn at (x, cy) is. */
export const outX = (kind: GateKind, x: number) => x + GW + (kind === 'nand' || kind === 'nor' || kind === 'not' ? 8 : 0);

/** A gate symbol. (x, cy) is the middle of its left (input) edge. */
export function Gate({ kind, x, y, P, on, label = true }: { kind: GateKind; x: number; y: number; P: Palette; on: boolean; label?: boolean }) {
  const h = GH / 2;
  const base = kind === 'nand' ? 'and' : kind === 'nor' ? 'or' : kind;
  let d = '';
  if (base === 'and') d = `M${x},${y - h} H${x + GW / 2} A${h},${h} 0 0 1 ${x + GW / 2},${y + h} H${x} Z`;
  else if (base === 'or' || base === 'xor') d = `M${x},${y - h} Q${x + GW * 0.6},${y - h} ${x + GW},${y} Q${x + GW * 0.6},${y + h} ${x},${y + h} Q${x + 10},${y} ${x},${y - h} Z`;
  else d = `M${x},${y - h} L${x + GW},${y} L${x},${y + h} Z`;
  const bubble = kind === 'nand' || kind === 'nor' || kind === 'not';
  const stroke = P.ink;
  return (
    <g>
      <path d={d} fill={on ? alpha(P.pos, 0.16) : P.surface} stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
      {base === 'xor' && <path d={`M${x - 6},${y - h} Q${x + 4},${y} ${x - 6},${y + h}`} fill="none" stroke={stroke} strokeWidth={1.6} />}
      {bubble && <circle cx={x + GW + 4} cy={y} r={4} fill={P.surface} stroke={stroke} strokeWidth={1.6} />}
      {label && (
        <text x={x + (base === 'not' ? GW * 0.32 : GW * 0.42)} y={y + 4} textAnchor="middle" fontFamily={P.fontMono} fontSize={kind.length > 3 ? 9 : 10} fontWeight={600} fill={P.ink2}>
          {kind.toUpperCase()}
        </text>
      )}
    </g>
  );
}

/** A wire: orange and thick when it carries 1. */
export function Wire({ d, on, P, dim }: { d: string; on: boolean; P: Palette; dim?: boolean }) {
  return <path d={d} fill="none" stroke={on ? P.pos : dim ? alpha(P.ink3, 0.45) : P.ink3} strokeWidth={on ? 3 : 1.6} strokeLinejoin="round" strokeLinecap="round" />;
}

/** A junction dot where a wire splits. */
export function Dot({ x, y, on, P }: { x: number; y: number; on: boolean; P: Palette }) {
  return <circle cx={x} cy={y} r={3.2} fill={on ? P.pos : P.ink3} />;
}

/** A round lamp showing a 0/1 value with a name next to it. */
export function Lamp({ x, y, v, P, name, side = 'right', onClick, r = 11 }: { x: number; y: number; v: number; P: Palette; name?: ReactNode; side?: 'left' | 'right' | 'top' | 'bottom'; onClick?: () => void; r?: number }) {
  const tx = side === 'left' ? x - r - 6 : side === 'right' ? x + r + 6 : x;
  const ty = side === 'top' ? y - r - 6 : side === 'bottom' ? y + r + 14 : y + 4.5;
  const anchor = side === 'left' ? 'end' : side === 'right' ? 'start' : 'middle';
  return (
    <g onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <circle cx={x} cy={y} r={r} fill={v ? P.pos : P.surface} stroke={v ? P.pos : P.ink} strokeWidth={1.6} />
      <text x={x} y={y + 4.5} textAnchor="middle" fontFamily={P.fontMono} fontSize={12} fontWeight={700} fill={v ? P.surface : P.ink}>
        {v}
      </text>
      {name !== undefined && (
        <text x={tx} y={ty} textAnchor={anchor} fontFamily={P.fontBody} fontSize={12.5} fontWeight={600} fill={P.ink}>
          {name}
        </text>
      )}
    </g>
  );
}
