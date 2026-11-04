/* 계산 이론: SVG drawings of state diagrams and trees. Colours come from CSS classes in computation.css. */

export interface DNode {
  id: number;
  x: number;
  y: number;
  label: string;
  accept?: boolean;
  /** small caption under the circle */
  sub?: string;
}

export interface DEdge {
  from: number;
  to: number;
  label: string;
  /** sideways offset of the curve's middle, in px (positive = left of the direction of travel) */
  bend?: number;
  /** explicit quadratic control point, in px */
  ctrl?: [number, number];
  /** side of a self-loop */
  loop?: 'up' | 'down';
}

/** on: active state · hot: transition just taken · new: just built · dim: faded · hide: not drawn */
export type Mark = 'on' | 'hot' | 'new' | 'dim' | 'hide' | 'bad' | undefined;

interface Geo {
  d: string;
  tip: [number, number];
  dir: [number, number]; // unit tangent at the tip
  lx: number;
  ly: number;
}

const unit = (x: number, y: number): [number, number] => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

function geometry(a: DNode, b: DNode, e: DEdge, r: number): Geo {
  if (a.id === b.id) {
    const s = e.loop === 'down' ? 1 : -1;
    const a1 = (s * Math.PI) / 2 - 0.55;
    const a2 = (s * Math.PI) / 2 + 0.55;
    const p0: [number, number] = [a.x + r * Math.cos(a1), a.y + r * Math.sin(a1)];
    const p3: [number, number] = [a.x + r * Math.cos(a2), a.y + r * Math.sin(a2)];
    const c1: [number, number] = [a.x + 2.9 * r * Math.cos(a1 - 0.35), a.y + 2.9 * r * Math.sin(a1 - 0.35)];
    const c2: [number, number] = [a.x + 2.9 * r * Math.cos(a2 + 0.35), a.y + 2.9 * r * Math.sin(a2 + 0.35)];
    return { d: `M${p0[0]},${p0[1]} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p3[0]},${p3[1]}`, tip: p3, dir: unit(p3[0] - c2[0], p3[1] - c2[1]), lx: a.x, ly: a.y + s * (r * 2.2 + 8) };
  }
  const [ux, uy] = unit(b.x - a.x, b.y - a.y);
  const nx = uy;
  const ny = -ux; // left of travel (up for left → right)
  let ctrl = e.ctrl;
  if (!ctrl && e.bend) ctrl = [(a.x + b.x) / 2 + nx * 2 * e.bend, (a.y + b.y) / 2 + ny * 2 * e.bend];
  if (ctrl) {
    const [sx, sy] = unit(ctrl[0] - a.x, ctrl[1] - a.y);
    const [tx, ty] = unit(ctrl[0] - b.x, ctrl[1] - b.y);
    const p0: [number, number] = [a.x + sx * r, a.y + sy * r];
    const p2: [number, number] = [b.x + tx * r, b.y + ty * r];
    const mx = (p0[0] + 2 * ctrl[0] + p2[0]) / 4;
    const my = (p0[1] + 2 * ctrl[1] + p2[1]) / 4;
    // push the label away from the chord, on the side the curve bulges to
    const [ox, oy] = unit(mx - (p0[0] + p2[0]) / 2, my - (p0[1] + p2[1]) / 2);
    return { d: `M${p0[0]},${p0[1]} Q${ctrl[0]},${ctrl[1]} ${p2[0]},${p2[1]}`, tip: p2, dir: unit(p2[0] - ctrl[0], p2[1] - ctrl[1]), lx: mx + ox * 9, ly: my + oy * 9 };
  }
  const p0: [number, number] = [a.x + ux * r, a.y + uy * r];
  const p1: [number, number] = [b.x - ux * r, b.y - uy * r];
  const flat = Math.abs(uy) < 0.3;
  return { d: `M${p0[0]},${p0[1]} L${p1[0]},${p1[1]}`, tip: p1, dir: [ux, uy], lx: (p0[0] + p1[0]) / 2 + (flat ? 0 : nx * 9), ly: (p0[1] + p1[1]) / 2 + (flat ? -9 : ny * 9) };
}

function arrowHead(g: Geo, size = 7.5): string {
  const [dx, dy] = g.dir;
  const bx = g.tip[0] - dx * size;
  const by = g.tip[1] - dy * size;
  return `${g.tip[0]},${g.tip[1]} ${bx - dy * size * 0.5},${by + dx * size * 0.5} ${bx + dy * size * 0.5},${by - dx * size * 0.5}`;
}

export function StateDiagram({
  nodes,
  edges,
  start,
  width,
  height,
  r = 18,
  nodeMark,
  edgeMark,
  label,
  minWidth,
  startFrom = 'left',
}: {
  nodes: DNode[];
  edges: DEdge[];
  start: number | null;
  width: number;
  height: number;
  r?: number;
  nodeMark?: (id: number) => Mark;
  edgeMark?: (i: number) => Mark;
  label: string;
  minWidth?: number;
  startFrom?: 'left' | 'top';
}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const s = start !== null ? byId.get(start) : undefined;
  const sMark = s ? nodeMark?.(s.id) : undefined;
  const order = edges.map((_, i) => i).sort((i, j) => rank(edgeMark?.(i)) - rank(edgeMark?.(j)));
  return (
    <div className="sd-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: minWidth ?? Math.min(width, 340), maxWidth: width * 1.3, margin: '0 auto' }} role="img" aria-label={label}>
        {s && sMark !== 'hide' && (
          <g className="sd-edge sd-start" data-s={sMark === 'dim' ? 'dim' : undefined}>
            {startFrom === 'left' ? (
              <>
                <path d={`M${s.x - r - 26},${s.y} L${s.x - r - 7},${s.y}`} />
                <polygon points={`${s.x - r},${s.y} ${s.x - r - 8},${s.y - 4.5} ${s.x - r - 8},${s.y + 4.5}`} />
              </>
            ) : (
              <>
                <path d={`M${s.x},${s.y - r - 24} L${s.x},${s.y - r - 7}`} />
                <polygon points={`${s.x},${s.y - r} ${s.x - 4.5},${s.y - r - 8} ${s.x + 4.5},${s.y - r - 8}`} />
              </>
            )}
          </g>
        )}
        {order.map((i) => {
          const e = edges[i];
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          const m = edgeMark?.(i);
          if (!a || !b || m === 'hide') return null;
          const g = geometry(a, b, e, r);
          return (
            <g key={i} className={'sd-edge' + (e.label === 'ε' ? ' eps' : '')} data-s={m}>
              <path d={g.d} />
              <polygon points={arrowHead(g)} />
              <text className="sd-elabel" x={g.lx} y={g.ly}>
                {e.label}
              </text>
            </g>
          );
        })}
        {nodes.map((n) => {
          const m = nodeMark?.(n.id);
          if (m === 'hide') return null;
          return (
            <g key={n.id} className="sd-node" data-s={m}>
              <circle cx={n.x} cy={n.y} r={r} />
              {n.accept && <circle className="inner" cx={n.x} cy={n.y} r={r - 4} />}
              <text x={n.x} y={n.y}>
                {n.label}
              </text>
              {n.sub && (
                <text className="sd-sub" x={n.x} y={n.y + r + 12}>
                  {n.sub}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const rank = (m: Mark) => (m === 'dim' ? 0 : m === undefined ? 1 : 2);

/* ───────────────────────── Trees ───────────────────────── */

export interface TNode {
  id: number;
  label: string;
  children: number[];
  /** nt: nonterminal · t: token · op: operator · num: number */
  kind: 'nt' | 't' | 'op' | 'num';
  value?: number;
}

export interface TreeLayout {
  pos: Map<number, { x: number; y: number }>;
  width: number;
  height: number;
}

/** Leaves on consecutive columns in order, each parent centred over its children. */
export function layoutTree(nodes: Map<number, TNode>, root: number, ux = 46, uy = 50, pad = 24): TreeLayout {
  const pos = new Map<number, { x: number; y: number }>();
  let leaf = 0;
  let depth = 0;
  const place = (id: number, d: number): number => {
    depth = Math.max(depth, d);
    const n = nodes.get(id)!;
    let x: number;
    if (!n.children.length) x = leaf++;
    else {
      const xs = n.children.map((c) => place(c, d + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    pos.set(id, { x, y: d });
    return x;
  };
  place(root, 0);
  for (const p of pos.values()) {
    p.x = pad + 14 + p.x * ux;
    p.y = pad + p.y * uy;
  }
  return { pos, width: 2 * pad + 28 + Math.max(0, leaf - 1) * ux, height: 2 * pad + depth * uy + 14 };
}

export function TreeDiagram({
  nodes,
  root,
  layout,
  mark,
  showValues,
  label,
  minWidth,
}: {
  nodes: Map<number, TNode>;
  root: number;
  layout: TreeLayout;
  mark?: (id: number) => Mark;
  showValues?: (id: number) => boolean;
  label: string;
  minWidth?: number;
}) {
  const ids: number[] = [];
  const walk = (id: number) => {
    ids.push(id);
    nodes.get(id)!.children.forEach(walk);
  };
  walk(root);
  return (
    <div className="sd-wrap">
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ minWidth: minWidth ?? Math.min(layout.width, 340), maxWidth: layout.width * 1.25, margin: '0 auto', display: 'block' }} role="img" aria-label={label}>
        {ids.map((id) => {
          const p = layout.pos.get(id)!;
          return nodes.get(id)!.children.map((c) => {
            const q = layout.pos.get(c)!;
            const m = mark?.(c);
            if (m === 'hide') return null;
            return <line key={`${id}-${c}`} className="tr-link" data-s={m} x1={p.x} y1={p.y + 11} x2={q.x} y2={q.y - 11} />;
          });
        })}
        {ids.map((id) => {
          const n = nodes.get(id)!;
          const p = layout.pos.get(id)!;
          const m = mark?.(id);
          if (m === 'hide') return null;
          const w = Math.max(24, n.label.length * 8 + 12);
          const v = showValues?.(id) && n.value !== undefined && n.kind !== 'num' && n.kind !== 't';
          return (
            <g key={id} className="tr-node" data-kind={n.kind} data-s={m}>
              <rect x={p.x - w / 2} y={p.y - 11} width={w} height={22} rx={n.kind === 'nt' ? 11 : 3} />
              <text x={p.x} y={p.y}>
                {n.label}
              </text>
              {v && (
                <text className="tr-val" x={p.x + w / 2 - 3} y={p.y - 14}>
                  {fmtNum(n.value!)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : v > 0 ? '∞' : v < 0 ? '−∞' : 'NaN');
