import { children, nodeLabel, type Node } from './lang';

/** on: being worked on · done: finished · bad: error · dim: not reached · new: just changed · hide: not drawn */
export type TMark = 'on' | 'done' | 'bad' | 'dim' | 'new' | 'hide' | undefined;

export interface TNode {
  key: number | string;
  label: string;
  /** a second line under the box, e.g. the node's type or value */
  sub?: string;
  subTone?: 'ok' | 'bad' | 'soft' | 'var';
  mark?: TMark;
  kids: TNode[];
}

/** Turn an AST into a TNode tree; `deco` adds marks and sub-labels per node. */
export function astTree(n: Node, deco?: (n: Node) => Partial<TNode>): TNode {
  return { key: n.id, label: nodeLabel(n), kids: children(n).map((c) => astTree(c, deco)), ...deco?.(n) };
}

const charW = (s: string, px: number) => [...s].reduce((a, c) => a + (/[ㄱ-힝]/.test(c) ? 1.65 : 1), 0) * px;

interface Placed {
  n: TNode;
  x: number;
  y: number;
  w: number;
}

function layout(root: TNode, hasSub: boolean) {
  const GAP = 10;
  const LEVEL = hasSub ? 64 : 48;
  const width = new Map<TNode, number>();
  const own = (n: TNode) => Math.max(30, charW(n.label, 7.5) + 16, n.sub ? charW(n.sub, 6.6) + 8 : 0);
  const measure = (n: TNode): number => {
    const kids = n.kids.filter((k) => k.mark !== 'hide');
    const kw = kids.reduce((a, k) => a + measure(k), 0) + GAP * Math.max(0, kids.length - 1);
    const w = Math.max(own(n), kw);
    width.set(n, w);
    return w;
  };
  const total = measure(root);
  const placed: Placed[] = [];
  const edges: { a: Placed; b: Placed }[] = [];
  let depth = 0;
  const place = (n: TNode, left: number, d: number): Placed => {
    depth = Math.max(depth, d);
    const w = width.get(n)!;
    const p: Placed = { n, x: left + w / 2, y: 6 + d * LEVEL, w: own(n) };
    placed.push(p);
    const kids = n.kids.filter((k) => k.mark !== 'hide');
    const kw = kids.reduce((a, k) => a + width.get(k)!, 0) + GAP * Math.max(0, kids.length - 1);
    let x = left + (w - kw) / 2;
    for (const k of kids) {
      const c = place(k, x, d + 1);
      edges.push({ a: p, b: c });
      x += width.get(k)! + GAP;
    }
    return p;
  };
  place(root, 4, 0);
  return { placed, edges, W: total + 8, H: 6 + depth * LEVEL + (hasSub ? 50 : 34) };
}

const BOX_H = 26;

export function TreeView({ root, label, shrink = 0.72 }: { root: TNode; label: string; shrink?: number }) {
  const hasSub = (function any(n: TNode): boolean {
    return !!n.sub || n.kids.some(any);
  })(root);
  const { placed, edges, W, H } = layout(root, hasSub);
  return (
    <div className="pl-tree">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: Math.min(W, W * shrink + 40), maxWidth: W * 1.12 }} role="img" aria-label={label}>
        {edges.map(({ a, b }, i) => (
          <line key={i} className="pl-tedge" data-m={b.n.mark} x1={a.x} y1={a.y + BOX_H + (a.n.sub ? 18 : 0)} x2={b.x} y2={b.y} />
        ))}
        {placed.map((p) => (
          <g key={p.n.key} className="pl-tnode" data-m={p.n.mark}>
            <rect x={p.x - p.w / 2} y={p.y} width={p.w} height={BOX_H} rx={3} />
            <text className="pl-tlabel" x={p.x} y={p.y + BOX_H / 2 + 1}>
              {p.n.label}
            </text>
            {p.n.sub && (
              <text className="pl-tsub" data-tone={p.n.subTone} x={p.x} y={p.y + BOX_H + 14}>
                {p.n.sub}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Source code with one span highlighted (and an optional error position). */
export function SpanCode({ src, span, err, tone = 'on', label }: { src: string; span: [number, number] | null; err?: number | null; tone?: 'on' | 'bad'; label?: string }) {
  const parts: { t: string; m?: 'on' | 'bad' }[] = [];
  if (span && span[1] > span[0]) {
    parts.push({ t: src.slice(0, span[0]) }, { t: src.slice(span[0], span[1]), m: tone }, { t: src.slice(span[1]) });
  } else if (err !== undefined && err !== null) {
    parts.push({ t: src.slice(0, err) }, { t: src.slice(err, err + 1) || ' ', m: 'bad' }, { t: src.slice(err + 1) });
  } else parts.push({ t: src });
  return (
    <pre className="pl-src" aria-label={label ?? '코드'}>
      {parts.map((p, i) =>
        p.m ? (
          <mark key={i} data-m={p.m}>
            {p.t}
          </mark>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </pre>
  );
}
