import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { localPoint, prefersReducedMotion, useCanvas2D } from '../../../../lib/canvas';
import { drawArrow } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { StepControls, useStepper } from '../../shared';
import { LETTERS, cutClusters, edgeName, kruskalFrames, makeBlobs, makeWGraph, mstOfPoints, primFrames, ufFrames, ufGroups, ufHeight, ufReplay, ufRoot, type UFOp, type WEdge } from './graphs';
import '../../algorithms/lessons/algorithms.css';
import './graphs.css';

/** Colours for groups / clusters, all readable with surface-coloured text on top. */
const groupColors = (P: Palette) => [P.pos, P.neg, P.good, P.stats2, P.stats1, P.dl];
const GROUP_VARS = ['var(--pos)', 'var(--neg)', 'var(--good)', 'var(--c-stats-2)', 'var(--c-stats-1)', 'var(--c-dl)'];

function label(ctx: CanvasRenderingContext2D, P: Palette, text: string, x: number, y: number, bold = false) {
  ctx.font = `${bold ? 700 : 500} 11px ${P.fontMono}`;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = P.surface;
  ctx.fillRect(x - tw / 2 - 3, y - 7, tw + 6, 14);
  ctx.fillStyle = bold ? P.ink : P.ink2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

function node(ctx: CanvasRenderingContext2D, P: Palette, x: number, y: number, r: number, text: string, fill: string, ink: string, ring = 1.5) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = ring;
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.font = `700 ${Math.round(r * 0.85)}px ${P.fontMono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
}

/* ─────────────── Figure 1: union-find forest ─────────────── */

const UF_N = 10;
const WORST: UFOp[] = Array.from({ length: UF_N - 1 }, (_, i) => ({ kind: 'union', a: i, b: i + 1 }));

/** x in "slots" (one per leaf, small gaps between trees) and depth for every node of the forest. */
function forestLayout(parent: readonly number[]) {
  const kids: number[][] = parent.map(() => []);
  parent.forEach((p, i) => p !== i && kids[p].push(i));
  const x = parent.map(() => 0);
  const depth = parent.map(() => 0);
  let slot = 0;
  const place = (v: number, d: number) => {
    depth[v] = d;
    if (!kids[v].length) {
      x[v] = slot++;
      return;
    }
    for (const c of kids[v]) place(c, d + 1);
    x[v] = (x[kids[v][0]] + x[kids[v][kids[v].length - 1]]) / 2;
  };
  parent.forEach((p, i) => {
    if (p !== i) return;
    if (slot) slot += 0.35;
    place(i, 0);
  });
  return { x, depth, slots: slot };
}

function UnionFindFigure() {
  const P = usePalette();
  const [still] = useState(prefersReducedMotion);
  const [ops, setOps] = useState<UFOp[]>([]);
  const [compress, setCompress] = useState(false);
  const [bySize, setBySize] = useState(false);
  const [a, setA] = useState(2);
  const [b, setB] = useState(7);
  const [x, setX] = useState(0);
  const [frame, setFrame] = useState<number | null>(null); // null: show the state after the last op
  const r = useRef(rng(11));
  const pos = useRef<[number, number, number][]>([]);

  const st = useMemo(() => ufReplay(UF_N, ops, { compress, bySize }), [ops, compress, bySize]);
  const frames = useMemo(() => ufFrames(st), [st]);
  const f = frames[frame === null ? frames.length - 1 : Math.min(frame, frames.length - 1)];
  const depthMax = Math.max(1, ...frames.map((fr) => ufHeight(fr.parent)));

  // walk the find path one pointer at a time
  useEffect(() => {
    if (frame === null) return;
    const t = setTimeout(() => setFrame((k) => (k === null || k >= frames.length - 2 ? null : k + 1)), 320);
    return () => clearTimeout(t);
  }, [frame, frames.length]);

  const run = (next: UFOp[]) => {
    setOps(next);
    setFrame(still ? null : 0);
  };
  const doOp = (op: UFOp) => run([...ops, op]);
  const randomUnion = () => {
    const roots = st.parent.map((_, i) => ufRoot(st.parent, i));
    const u = Math.floor(r.current() * UF_N);
    const others = roots.flatMap((rt, i) => (rt !== roots[u] ? [i] : []));
    if (others.length) doOp({ kind: 'union', a: u, b: others[Math.floor(r.current() * others.length)] });
  };
  const groups = ufGroups(st.parent);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const L = forestLayout(f.parent);
      const padX = 18;
      const top = 30;
      const dy = Math.min(56, (h - top - 22) / Math.max(1, depthMax));
      const sw = (w - 2 * padX) / Math.max(1, L.slots);
      const rad = Math.max(10, Math.min(16, sw * 0.38, dy * 0.32));
      const xy = (v: number): [number, number] => [padX + (L.x[v] + 0.5) * sw, top + L.depth[v] * dy];
      pos.current = f.parent.map((_, v) => [...xy(v), rad]);
      const hot = new Set(f.hot);
      // parent pointers: child → parent
      f.parent.forEach((p, v) => {
        if (p === v) return;
        const [x1, y1] = xy(v);
        const [x2, y2] = xy(p);
        const len = Math.hypot(x2 - x1, y2 - y1);
        const ux = (x2 - x1) / len;
        const uy = (y2 - y1) / len;
        const on = hot.has(v) && hot.has(p);
        drawArrow(ctx, x1 + ux * rad, y1 + uy * rad, x2 - ux * (rad + 1), y2 - uy * (rad + 1), on ? P.ink : P.ink3, on ? 2.6 : 1.4, 8);
      });
      f.parent.forEach((p, v) => {
        const [cx, cy] = xy(v);
        const isRoot = p === v;
        const reached = f.root === v;
        const fill = reached ? P.pos : hot.has(v) ? P.hl : P.surface;
        const ink = reached ? P.surface : hot.has(v) ? '#1a1a1a' : P.ink;
        node(ctx, P, cx, cy, rad, String(v), fill, ink, isRoot ? 2.6 : 1.4);
        if (isRoot) {
          const size = f.parent.filter((_, i) => ufRoot(f.parent, i) === v).length;
          if (size > 1) {
            ctx.fillStyle = P.ink3;
            ctx.font = `11px ${P.fontMono}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`크기 ${size}`, cx, cy - rad - 3);
          }
        }
      });
    },
    [P, f, depthMax],
    { height: Math.round(Math.max(150, Math.min(420, 70 + depthMax * 40))) },
  );

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = localPoint(e, e.currentTarget);
    const hit = pos.current.findIndex(([cx, cy, rad]) => Math.hypot(p.x - cx, p.y - cy) <= rad + 4);
    if (hit >= 0) {
      setX(hit);
      doOp({ kind: 'find', x: hit });
    }
  };

  const opts = Array.from({ length: UF_N }, (_, i) => i);
  const pick = (id: string, value: number, set: (v: number) => void, name: string) => (
    <select id={id} className="select" value={value} onChange={(e) => set(Number(e.target.value))} aria-label={name}>
      {opts.map((i) => (
        <option key={i} value={i}>
          {i}
        </option>
      ))}
    </select>
  );

  return (
    <Figure
      no={1}
      title="유니온 파인드: 그룹마다 트리 하나"
      hint="두 원소를 합치거나, 노드를 눌러 find를 해 보세요"
      caption={<>원소 0~9가 각자 자기 부모를 가리킵니다(화살표는 자식 → 부모). 굵은 테두리가 루트, 곧 그룹의 대표입니다. find는 노란색으로 부모를 따라 올라가 주황색 루트에 닿습니다. 두 설정을 바꾸면 지금까지 한 연산을 처음부터 다시 실행해, 같은 연산이 어떤 트리를 만드는지 보여 줍니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`유니온 파인드 숲: parent 배열 ${f.parent.join(', ')}`}>
            <canvas ref={canvasRef} onClick={onCanvasClick} style={{ cursor: 'pointer' }} />
          </div>
          <div className="uf-arr" aria-hidden="true">
            <span className="ds-label">parent 배열 (작은 숫자가 인덱스)</span>
            {f.parent.map((p, i) => (
              <span key={i} className="uf-slot" data-root={p === i || undefined} data-hot={f.hot.includes(i) || undefined}>
                <span className="ds-cell">{p}</span>
                <span className="uf-idx">{i}</span>
              </span>
            ))}
          </div>
          <div className="step-note" aria-live="polite">
            {f.note}
          </div>
        </div>
        <div className="controls">
          <div className="uf-ops">
            <span>union</span>
            <span style={{ display: 'flex', gap: 4 }}>
              {pick('uf-a', a, setA, '합칠 원소 a')}
              {pick('uf-b', b, setB, '합칠 원소 b')}
            </span>
            <Button small primary onClick={() => doOp({ kind: 'union', a, b })}>
              합치기
            </Button>
            <span>find</span>
            {pick('uf-x', x, setX, 'find할 원소')}
            <Button small onClick={() => doOp({ kind: 'find', x })}>
              찾기
            </Button>
          </div>
          <div className="btn-row">
            <Button small onClick={randomUnion} disabled={groups === 1}>
              무작위로 합치기
            </Button>
            <Button small onClick={() => run(WORST)}>
              최악의 순서로 합치기
            </Button>
            <Button small onClick={() => run([])}>
              처음부터
            </Button>
          </div>
          <div className="ctl">
            <Check label="크기 기준 합치기" checked={bySize} onChange={setBySize} />
            <Check label="경로 압축" checked={compress} onChange={setCompress} />
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="그룹 수" value={`${groups}개`} />
            <Readout label="트리 높이" value={`${ufHeight(st.parent)}`} color="var(--neg)" />
            <Readout label="이번 포인터 이동" value={st.last ? `${st.last.steps}번` : '—'} color="var(--pos)" />
            <Readout label="누적 포인터 이동" value={`${st.hops}번`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: Kruskal and Prim on the same graph ─────────────── */

type Alg = 'kruskal' | 'prim';
const MST_N = 10;

function MSTFigure() {
  const P = usePalette();
  const [seed, setSeed] = useState(4);
  const [alg, setAlg] = useState<Alg>('kruskal');
  const [start, setStart] = useState(0);
  const g = useMemo(() => makeWGraph(seed, MST_N), [seed]);
  const kr = useMemo(() => kruskalFrames(MST_N, g.edges), [g]);
  const pr = useMemo(() => primFrames(MST_N, g.edges, start), [g, start]);
  const total = alg === 'kruskal' ? kr.frames.length : pr.length;
  const s = useStepper(total, 2, `${alg}|${seed}|${start}`);
  const kf = kr.frames[Math.min(s.i, kr.frames.length - 1)];
  const pf = pr[Math.min(s.i, pr.length - 1)];
  const geom = useRef<{ ox: number; oy: number; k: number; rad: number } | null>(null);
  const finalTotal = kr.frames[kr.frames.length - 1].total;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = 18;
      const k = Math.min((w - 2 * pad) / g.W, (h - 2 * pad) / g.H);
      const ox = (w - g.W * k) / 2;
      const oy = (h - g.H * k) / 2;
      const rad = Math.max(10, Math.min(15, w / 32));
      geom.current = { ox, oy, k, rad };
      const xy = (v: number): [number, number] => [ox + g.pts[v][0] * k, oy + g.pts[v][1] * k];
      const cols = groupColors(P);

      // edge id → how to draw it
      type Look = 'plain' | 'take' | 'skip' | 'cand' | 'cur' | 'faint';
      const look: Look[] = g.edges.map(() => 'plain');
      const edgeColor: string[] = g.edges.map(() => P.lineStrong);
      if (alg === 'kruskal') {
        kr.order.forEach((id, pos) => {
          const st = kf.status[pos];
          look[id] = st === 'take' ? 'take' : st === 'skip' ? 'skip' : st === 'unused' ? 'faint' : 'plain';
          if (st === 'take') edgeColor[id] = cols[kf.color[g.edges[id].u]] ?? P.ink;
        });
        if (kf.cur >= 0) look[kr.order[kf.cur]] = kf.status[kf.cur] === 'take' ? 'take' : 'skip';
      } else {
        for (const id of pf.heap) look[id] = 'cand';
        for (const id of pf.tree) {
          look[id] = 'take';
          edgeColor[id] = P.pos;
        }
        if (pf.cur >= 0 && !pf.curTake) look[pf.cur] = 'skip';
      }
      const curId = alg === 'kruskal' ? (kf.cur >= 0 ? kr.order[kf.cur] : -1) : pf.cur;

      g.edges.forEach((e, id) => {
        const [x1, y1] = xy(e.u);
        const [x2, y2] = xy(e.v);
        if (id === curId) {
          ctx.strokeStyle = alpha(P.hl, 0.75);
          ctx.lineWidth = 11;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        const lk = look[id];
        ctx.setLineDash(lk === 'skip' ? [5, 4] : []);
        ctx.strokeStyle = lk === 'take' ? edgeColor[id] : lk === 'skip' ? P.bad : lk === 'cand' ? P.ink2 : lk === 'faint' ? alpha(P.lineStrong, 0.5) : P.lineStrong;
        ctx.lineWidth = lk === 'take' ? 4 : lk === 'cand' ? 2 : 1.4;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      });
      g.edges.forEach((e, id) => {
        const [x1, y1] = xy(e.u);
        const [x2, y2] = xy(e.v);
        label(ctx, P, String(e.w), (x1 + x2) / 2, (y1 + y2) / 2, look[id] === 'take' || id === curId);
      });
      for (let v = 0; v < MST_N; v++) {
        const [cx, cy] = xy(v);
        let fill = P.surface;
        let ink = P.ink;
        if (alg === 'kruskal' && kf.color[v] >= 0) {
          fill = cols[kf.color[v]];
          ink = P.surface;
        }
        if (alg === 'prim' && pf.inTree[v]) {
          fill = P.pos;
          ink = P.surface;
        }
        node(ctx, P, cx, cy, rad, LETTERS[v], fill, ink, alg === 'prim' && v === start ? 3 : 1.5);
      }
    },
    [P, g, alg, kf, pf, start],
    { aspect: 100 / 56, maxHeight: 360, minHeight: 210 },
  );

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const gm = geom.current;
    if (alg !== 'prim' || !gm) return;
    const p = localPoint(e, e.currentTarget);
    const hit = g.pts.findIndex(([px, py]) => Math.hypot(p.x - (gm.ox + px * gm.k), p.y - (gm.oy + py * gm.k)) <= gm.rad + 4);
    if (hit >= 0) setStart(hit);
  };

  const chip = (e: WEdge, st: string, key: number) => (
    <span key={key} className="edge-chip" data-s={st}>
      {edgeName(e)} <b>{e.w}</b>
    </span>
  );
  const taken = alg === 'kruskal' ? kf.taken : pf.taken;
  const sum = alg === 'kruskal' ? kf.total : pf.total;
  const done = s.i === total - 1;

  return (
    <Figure
      no={2}
      title="최소 신장 트리: 크루스칼과 프림"
      hint="한 단계씩 진행하며 두 방법을 비교해 보세요"
      caption={
        alg === 'kruskal' ? (
          <>크루스칼은 간선을 가벼운 것부터 봅니다. 양 끝이 다른 그룹이면 고르고(굵은 선, 색은 그룹), 같은 그룹이면 순환이 생기므로 버립니다(빨간 점선). 노란 띠는 지금 보는 간선입니다. 처음에는 모든 노드가 외톨이 그룹이고, 간선을 고를 때마다 두 그룹이 하나로 합쳐집니다.</>
        ) : (
          <>프림은 시작 노드(굵은 테두리) 하나에서 트리를 키웁니다. 트리(주황)에 닿은 간선이 모두 후보 힙에 들어 있고(진한 회색), 매번 그중 가장 싼 것을 꺼냅니다. 꺼낸 간선의 양 끝이 이미 트리 안이면 버립니다. 노드를 눌러 시작점을 바꿔 보세요.</>
        )
      }
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`노드 ${MST_N}개, 간선 ${g.edges.length}개인 가중 그래프. 지금까지 고른 간선 ${taken}개, 가중치 합 ${sum}`}>
            <canvas ref={canvasRef} onClick={onCanvasClick} style={alg === 'prim' ? { cursor: 'pointer' } : undefined} />
          </div>
          {alg === 'kruskal' ? (
            <div className="edge-list" aria-hidden="true">
              <span className="ds-label">가중치 순으로 정렬한 간선</span>
              {kr.order.map((id, pos) => chip(g.edges[id], kf.cur === pos ? 'cur' : kf.status[pos], pos))}
            </div>
          ) : (
            <div className="edge-list" aria-hidden="true">
              <span className="ds-label">후보 힙 (가장 싼 것부터)</span>
              {pf.cur >= 0 && chip(g.edges[pf.cur], 'cur', -1)}
              {pf.heap.length ? pf.heap.map((id) => chip(g.edges[id], 'wait', id)) : <span className="ds-empty">비어 있음</span>}
            </div>
          )}
          <div className="step-note" aria-live="polite">
            {alg === 'kruskal' ? kf.note : pf.note}
          </div>
        </div>
        <div className="controls">
          <Seg
            label="알고리즘"
            value={alg}
            onChange={setAlg}
            options={[
              { value: 'kruskal', label: '크루스칼' },
              { value: 'prim', label: '프림' },
            ]}
          />
          {alg === 'prim' && (
            <div className="ctl">
              <label className="ctl-label" htmlFor="mst-start">
                <span>시작 노드</span>
              </label>
              <select id="mst-start" className="select" value={start} onChange={(e) => setStart(Number(e.target.value))}>
                {Array.from({ length: MST_N }, (_, v) => (
                  <option key={v} value={v}>
                    {LETTERS[v]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <StepControls s={s} id="mst-speed" maxSpeed={8} />
          <div className="btn-row">
            <Button small onClick={() => setSeed((k) => k + 1)}>
              새 그래프
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="고른 간선 (목표 V − 1)" value={`${taken} / ${MST_N - 1}`} />
            <Readout label="가중치 합" value={done ? `${sum} ✓` : String(sum)} color="var(--pos)" />
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>이 그래프의 최소 신장 트리 가중치: {finalTotal}</div>
        </div>
      </div>
      <Legend
        items={
          alg === 'kruskal'
            ? [
                { color: 'var(--hl)', label: '지금 보는 간선', shape: 'ln' },
                { color: 'var(--pos)', label: '고른 간선 (색 = 그룹)', shape: 'ln' },
                { color: 'var(--bad)', label: '버린 간선', shape: 'ln' },
              ]
            : [
                { color: 'var(--hl)', label: '방금 꺼낸 간선', shape: 'ln' },
                { color: 'var(--pos)', label: '트리', shape: 'ln' },
                { color: 'var(--ink-2)', label: '후보 힙에 있는 간선', shape: 'ln' },
                { color: 'var(--bad)', label: '버린 간선', shape: 'ln' },
              ]
        }
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: clustering by cutting the longest MST edges ─────────────── */

function ClusterFigure() {
  const P = usePalette();
  const [seed, setSeed] = useState(1);
  const [k, setK] = useState(1);
  const pts = useMemo(() => makeBlobs(seed), [seed]);
  const mst = useMemo(() => mstOfPoints(pts), [pts]);
  const c = useMemo(() => cutClusters(pts.length, mst, k), [pts, mst, k]);
  const W = 100;
  const H = 56;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = 12;
      const s = Math.min((w - 2 * pad) / W, (h - 2 * pad) / H);
      const ox = (w - W * s) / 2;
      const oy = (h - H * s) / 2;
      const xy = (v: number): [number, number] => [ox + pts[v][0] * s, oy + pts[v][1] * s];
      const cols = groupColors(P);
      for (const e of c.keep) {
        const [x1, y1] = xy(e.u);
        const [x2, y2] = xy(e.v);
        ctx.strokeStyle = alpha(cols[c.label[e.u] % cols.length], 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      for (const e of c.cut) {
        const [x1, y1] = xy(e.u);
        const [x2, y2] = xy(e.v);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = P.ink3;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        label(ctx, P, e.w.toFixed(1), (x1 + x2) / 2, (y1 + y2) / 2);
      }
      const rad = Math.max(3.5, Math.min(5.5, w / 110));
      pts.forEach((_, v) => {
        const [cx, cy] = xy(v);
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fillStyle = cols[c.label[v] % cols.length];
        ctx.fill();
        ctx.strokeStyle = P.surface;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });
    },
    [P, pts, c],
    { aspect: W / H, maxHeight: 340, minHeight: 190 },
  );

  return (
    <Figure
      no={3}
      title="최소 신장 트리로 군집 나누기"
      hint="군집 수를 바꿔 보세요"
      caption={<>점 {pts.length}개의 최소 신장 트리에서 가장 긴 간선부터 k − 1개를 끊었습니다(회색 점선, 숫자는 길이). 남은 조각 하나하나가 군집이고, 색이 군집을 나타냅니다. 끊은 간선 중 가장 짧은 것의 길이가 곧 서로 다른 군집에 속한 두 점 사이의 최소 거리입니다.</>}
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`점 ${pts.length}개를 군집 ${k}개로 나눈 그림`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="fig-cols">
        <div className="controls">
          <Slider id="cl-k" label="군집 수 k" value={k} min={1} max={6} step={1} onChange={setK} />
          <div className="btn-row">
            <Button small onClick={() => setSeed((x) => x + 1)}>
              새 점
            </Button>
          </div>
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr', alignSelf: 'start' }}>
          <Readout label="끊은 간선" value={`${c.cut.length}개`} />
          <Readout label="군집 사이 최소 거리" value={c.cut.length ? c.spacing.toFixed(1) : '—'} color="var(--pos)" />
        </div>
      </div>
      <Legend items={GROUP_VARS.slice(0, k).map((col, i) => ({ color: col, label: `군집 ${i + 1}`, shape: 'dot' as const }))} />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function UnionFindMST() {
  return (
    <>
      <h2>"이 둘은 같은 그룹인가?"</h2>
      <p>
        SNS에서 친구의 친구의 친구까지를 하나의 무리로 묶는다고 해 봅시다. 새 친구 관계는 계속 생기고, 그 사이사이에 "이 두 사람은 같은 무리인가?"라는 질문이 들어옵니다. 컴퓨터를 케이블로 하나씩 이으면서 "이 두 대가 서로 통신할 수 있나?"를 묻는 것, 그림판의 채우기 도구처럼 이미지에서 같은 색으로 이어진 영역을 찾는 것도 같은 모양의 문제입니다.
      </p>
      <p>필요한 연산은 두 가지뿐입니다.</p>
      <ul>
        <li>
          <code>union(a, b)</code>: a가 속한 그룹과 b가 속한 그룹을 하나로 합칩니다.
        </li>
        <li>
          <code>find(x)</code>: x가 속한 그룹의 대표 원소를 돌려줍니다. 두 원소가 같은 그룹인지는 <code>find(a) === find(b)</code>로 확인합니다.
        </li>
      </ul>
      <p>이 두 연산을 지원하는 자료구조를 <T en="union-find, disjoint set">유니온 파인드</T>(서로소 집합)라고 합니다. 먼저 쉽게 떠오르는 두 방법을 보겠습니다.</p>
      <ul>
        <li>
          관계를 그래프로 저장해 두고, 질문이 올 때마다 <a href="#cs-algorithms/graph-search">BFS나 DFS</a>로 두 원소가 이어져 있는지 찾습니다. 합치기는 간선 하나 추가로 끝나지만, 질문 하나에 <M>{'O(V + E)'}</M>가 듭니다.
        </li>
        <li>
          원소마다 그룹 번호를 적은 배열 <code>group</code>을 둡니다. 같은 그룹인지는 번호 비교 한 번이면 되지만, 합칠 때 한쪽 그룹의 번호를 모두 고쳐 써야 하므로 배열 전체를 훑어야 합니다. 합치기 한 번이 <M>{'O(n)'}</M>이고, 원소 n개를 하나로 모으는 데 <M>{'O(n^2)'}</M>이 듭니다.
        </li>
      </ul>
      <p>원소가 수백만 개이고 합치기와 질문이 뒤섞여 쏟아진다면 둘 다 느립니다. 유니온 파인드는 두 연산을 모두 거의 상수 시간에 해냅니다.</p>

      <h2>그룹을 트리로 표현하기</h2>
      <p>
        아이디어는 그룹 하나를 트리 하나로 나타내는 것입니다. 각 원소는 자기 <strong>부모</strong> 하나만 기억합니다(<code>parent[x]</code>). 루트는 자기 자신을 부모로 삼고, 루트가 곧 그룹의 대표입니다.
      </p>
      <ul>
        <li>
          <code>find(x)</code>는 부모를 따라 루트까지 올라갑니다.
        </li>
        <li>
          <code>union(a, b)</code>는 두 원소의 루트를 찾아, 한쪽 루트의 부모를 다른 쪽 루트로 바꿉니다. 포인터 하나만 고치면 그룹 전체가 합쳐집니다.
        </li>
      </ul>
      <Code label="가장 단순한 유니온 파인드">{`
const parent = Array.from({ length: n }, (_, i) => i); // 처음엔 모두 자기 자신이 루트

function find(x) {
  while (parent[x] !== x) x = parent[x]; // 루트까지 올라간다
  return x;
}

function union(a, b) {
  const ra = find(a), rb = find(b);
  if (ra !== rb) parent[ra] = rb; // a의 루트를 b의 루트 아래에 붙인다
}`}</Code>
      <UnionFindFigure />
      <p>
        합치기는 이제 포인터 하나를 바꾸는 일이 되었지만, find가 얼마나 빠른지는 트리의 높이에 달려 있습니다. 두 설정을 모두 끈 채 "최악의 순서로 합치기"를 눌러 보세요. <code>union(0, 1)</code>, <code>union(1, 2)</code>, …, <code>union(8, 9)</code>를 차례로 하면 트리가 한 줄로 늘어서 높이가 9가 됩니다. 이 상태에서 노드 0을 누르면 find가 포인터를 9번 따라가야 합니다. 원소가 n개면 find 한 번이 <M>{'O(n)'}</M>으로, 그룹 번호 배열보다 나을 게 없습니다.
      </p>

      <h2>두 가지 요령: 크기 기준 합치기와 경로 압축</h2>
      <p>
        <T en="union by size">크기 기준 합치기</T>는 합칠 때 <strong>작은 트리를 큰 트리의 루트 아래에</strong> 붙이는 것입니다. 이 설정을 켜고 다시 "최악의 순서로 합치기"를 누르면 높이가 1인 트리가 됩니다. 어떤 노드의 깊이가 1 늘어나는 것은 그 노드가 속한 트리가 자기보다 크거나 같은 트리 아래로 들어갈 때뿐이고, 그때마다 그 노드가 속한 트리의 크기는 적어도 두 배가 됩니다. 크기는 n을 넘을 수 없으니 두 배가 되는 일은 많아야 <M>{'\\log_2 n'}</M>번이고, 따라서 높이도 <M>{'\\log_2 n'}</M>을 넘지 않습니다. 원소 10개라면 어떤 순서로 합쳐도 높이가 3 이하입니다.
      </p>
      <p>
        <T en="path compression">경로 압축</T>은 find가 루트를 찾고 나면 <strong>지나온 노드가 모두 루트를 바로 가리키도록</strong> 고치는 것입니다. 어차피 올라간 길이니 덤으로 지름길을 깔아 두는 셈입니다. 크기 기준 합치기는 끄고 경로 압축만 켠 채 "최악의 순서로 합치기"를 누른 다음, 노드 0을 두 번 눌러 보세요. 처음에는 포인터를 9번 따라가지만, 그 길에 있던 노드가 모두 루트에 바로 붙으므로 두 번째는 1번이면 됩니다.
      </p>
      <Code label="유니온 파인드: 경로 압축 + 크기 기준 합치기">{`
class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.size = Array(n).fill(1); // 루트에서만 의미가 있다
  }

  find(x) {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // 경로 압축
    }
    return this.parent[x];
  }

  union(a, b) {
    let ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false;                     // 이미 같은 그룹
    if (this.size[ra] < this.size[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;                            // 작은 트리를 큰 트리 아래로
    this.size[ra] += this.size[rb];
    return true;
  }
}`}</Code>
      <p>
        두 요령을 함께 쓰면, 연산 m번에 드는 전체 시간이 <M>{'O(m\\,\\alpha(n))'}</M>이라는 것이 증명되어 있습니다. 연산 하나하나가 아니라 여러 번을 합친 평균(분할 상환)으로 본 비용입니다. <M>{'\\alpha'}</M>는 <T en="inverse Ackermann function">역아커만 함수</T>로, 상상하기 어려울 만큼 느리게 자랍니다. n이 우주의 원자 수(약 <M>{'10^{80}'}</M>)보다 커도 <M>{'\\alpha(n)'}</M>은 4를 넘지 않습니다. 그래서 실무에서는 연산 한 번을 사실상 상수 시간으로 봅니다.
      </p>
      <Callout kind="note">
        크기 대신 트리 높이의 상한인 랭크를 기준으로 합치는 <T en="union by rank">랭크 기준 합치기</T>도 많이 씁니다. 보장하는 성능은 같습니다. 위 코드의 <code>find</code>는 재귀로 경로를 압축하므로 트리가 아주 깊으면 호출 스택이 깊어질 수 있지만, 크기 기준 합치기를 함께 쓰면 깊이가 <M>{'\\log_2 n'}</M> 이하라 문제가 되지 않습니다.
      </Callout>

      <h2>최소 신장 트리</h2>
      <p>
        이제 유니온 파인드가 빛나는 문제를 보겠습니다. 마을 10곳을 전선으로 이어야 하는데, 마을 쌍마다 전선을 놓는 비용이 다릅니다. 모든 마을이 직접이든 다른 마을을 거쳐서든 서로 연결되도록 하면서 비용의 합을 가장 작게 하려면 어느 구간에 전선을 놓아야 할까요?
      </p>
      <p>
        답에는 순환이 없어야 합니다. 순환이 있다면 그중 아무 간선 하나를 빼도 모든 마을이 여전히 연결되고 비용만 줄어들기 때문입니다. 순환 없이 모든 노드를 잇는 그래프는 트리이고, 노드가 V개면 간선이 정확히 V − 1개입니다. 그래프의 모든 노드를 잇는 트리를 <T en="spanning tree">신장 트리</T>, 그중 간선 가중치의 합이 가장 작은 것을 <T en="minimum spanning tree, MST">최소 신장 트리</T>라고 합니다.
      </p>

      <h2>크루스칼: 싼 간선부터, 순환만 피해서</h2>
      <p>
        <T en="Kruskal's algorithm">크루스칼 알고리즘</T>은 놀랄 만큼 단순합니다. 간선을 가중치 순으로 정렬하고, 가장 싼 것부터 차례로 보면서 <strong>순환을 만들지 않으면 고르고, 만들면 버립니다</strong>. 간선 V − 1개를 고르면 끝입니다. 매 순간 당장 가장 싼 간선을 고르므로 <a href="#cs-algorithm-design/greedy">앞 장</a>에서 본 탐욕 알고리즘입니다.
      </p>
      <p>
        "이 간선을 고르면 순환이 생기는가?"는 "두 끝이 이미 연결되어 있는가?"와 같은 질문이고, 이것이 바로 유니온 파인드가 답하는 질문입니다. 처음에는 노드마다 외톨이 그룹이고, 간선을 고를 때마다 두 끝의 그룹을 <code>union</code>합니다. 간선의 두 끝이 <code>find</code>로 같은 루트를 가리키면 이미 다른 길로 이어져 있으므로 버립니다.
      </p>
      <MSTFigure />
      <p>
        탐욕 알고리즘은 틀릴 때가 많은데, 크루스칼은 언제나 최소 신장 트리를 찾습니다. 근거는 <T en="cut property">자르기 속성</T>입니다. 노드를 아무렇게나 두 무리로 나누었을 때, 두 무리를 잇는 간선 중 가장 싼 간선은 어떤 최소 신장 트리에 반드시 들어 있습니다. 그 간선을 빼고 다른 건너는 간선을 쓴 신장 트리가 있다면, 둘을 바꿔 넣어 비용을 줄이거나 같게 할 수 있기 때문입니다. 크루스칼이 간선을 고르는 순간, 그 간선은 "한쪽 끝의 그룹"과 "나머지 전부"를 잇는 간선 중 가장 쌉니다. 더 싼 간선은 이미 다 봤고, 그중 이 경계를 건너는 것은 없었기 때문입니다.
      </p>
      <Code label="크루스칼: edges는 [u, v, w]의 배열">{`
function kruskal(n, edges) {
  const uf = new UnionFind(n);
  const sorted = [...edges].sort((a, b) => a[2] - b[2]); // 가중치 순
  const tree = [];
  let total = 0;
  for (const [u, v, w] of sorted) {
    if (uf.union(u, v)) {        // 다른 그룹일 때만 합쳐지고 true
      tree.push([u, v, w]);
      total += w;
      if (tree.length === n - 1) break;
    }
  }
  return { tree, total };        // tree.length < n - 1이면 그래프가 끊어져 있다
}`}</Code>
      <p>
        시간은 대부분 정렬에 듭니다. 간선이 E개면 정렬이 <M>{'O(E \\log E)'}</M>이고, 유니온 파인드 연산은 간선마다 거의 상수 시간이므로 전체가 <M>{'O(E \\log E)'}</M>입니다.
      </p>

      <h2>프림: 한 점에서 트리를 키우기</h2>
      <p>
        그림 2에서 알고리즘을 프림으로 바꿔 보세요. <T en="Prim's algorithm">프림 알고리즘</T>은 시작 노드 하나에서 출발해, <strong>지금 트리에 닿아 있는 간선 중 가장 싼 것</strong>으로 트리를 한 노드씩 넓힙니다. 이것도 탐욕 알고리즘이고, 트리와 나머지를 가르는 경계에서 가장 싼 간선을 고르므로 자르기 속성으로 정당성이 보장됩니다.
      </p>
      <p>
        "가장 싼 후보 간선"을 매번 꺼내야 하므로 <a href="#cs-algorithms/stack-queue-heap">우선순위 큐(힙)</a>를 씁니다. 새 노드가 트리에 들어오면 그 노드의 간선을 힙에 넣고, 꺼낸 간선의 양 끝이 이미 트리 안이면 버립니다. 다익스트라 알고리즘과 모양이 거의 같은데, 다익스트라는 "출발점부터의 거리"로, 프림은 "간선 하나의 가중치"로 순서를 정한다는 점만 다릅니다. 시간은 <M>{'O(E \\log V)'}</M>입니다.
      </p>
      <p>
        시작 노드를 바꾸든 알고리즘을 바꾸든, 끝났을 때의 가중치 합은 같습니다. 이 그림의 그래프는 간선 가중치가 모두 다르게 만들어져 있는데, 이때는 최소 신장 트리가 단 하나뿐이라 고르는 간선까지 똑같습니다. 가중치가 같은 간선이 있으면 합은 같아도 고른 간선은 다를 수 있습니다.
      </p>
      <Callout kind="intuition">
        크루스칼은 그래프 곳곳에 작은 숲을 여러 개 키우다가 하나로 잇고, 프림은 덩어리 하나를 처음부터 끝까지 키웁니다. 간선이 적은 그래프에서는 정렬만 하면 되는 크루스칼이 간단하고, 간선이 아주 많은 그래프에서는 프림이 유리할 때가 많습니다.
      </Callout>

      <h2>어디에 쓰이나</h2>
      <p>
        최소 신장 트리 문제는 1926년 체코의 수학자 보루프카가 모라비아 지방의 전력망을 가장 싸게 까는 방법을 찾으면서 처음 풀었습니다. 지금도 통신망, 전력망, 배관처럼 모든 지점을 최소 비용으로 이어야 하는 설계의 출발점입니다.
      </p>
      <p>
        <T en="clustering">군집화</T>에도 쓸 수 있습니다. 점들의 최소 신장 트리를 만든 다음 가장 긴 간선 k − 1개를 끊으면 트리가 k조각으로 나뉘고, 각 조각이 하나의 군집이 됩니다. 크루스칼을 간선 V − k개에서 멈춘 것과 같습니다.
      </p>
      <ClusterFigure />
      <p>
        이렇게 나눈 군집에는 좋은 성질이 있습니다. 점들을 k개 군집으로 나누는 모든 방법 가운데, "서로 다른 군집에 속한 두 점 사이의 최소 거리"가 가장 큰 방법이 바로 이것입니다. 덩어리끼리 가장 멀리 떨어지도록 나눈다는 뜻입니다. 그림 3의 처음 점들에서 k를 덩어리 수인 4로 두면, 끊은 간선 중 가장 짧은 것(17.8)이 남은 간선 중 가장 긴 것(8.5)보다 두 배 넘게 깁니다. 다만 실제 데이터에서 두 덩어리 사이에 점이 띄엄띄엄 이어져 있으면, 그 사슬을 따라 두 덩어리가 한 군집으로 묶이는 약점이 있습니다.
      </p>
      <p>
        <strong>미로 만들기</strong>도 같은 원리입니다. 격자의 칸을 노드, 이웃한 칸 사이의 벽을 간선으로 보고 간선에 무작위 가중치를 준 뒤 크루스칼을 돌리면, 고른 간선 자리의 벽을 허물어 만든 미로는 어느 두 칸 사이에도 길이 정확히 하나뿐입니다. 신장 트리이므로 모든 칸이 연결되고, 순환이 없으므로 길이 둘일 수 없습니다.
      </p>

      <Callout kind="key">
        유니온 파인드는 그룹을 부모 포인터의 트리로 저장하고, 크기 기준 합치기와 경로 압축으로 트리를 낮게 유지해 union과 find를 사실상 상수 시간에 처리합니다. 크루스칼은 간선을 싼 것부터 보면서 유니온 파인드로 순환을 피해 최소 신장 트리를 만들고(<M>{'O(E \\log E)'}</M>), 프림은 힙으로 한 점에서 트리를 키웁니다(<M>{'O(E \\log V)'}</M>). 둘 다 자르기 속성 덕분에 탐욕적으로 골라도 최적입니다.
      </Callout>
      <Quiz
        q="간선 가중치가 모두 다른 연결 그래프가 있다. 가장 무거운 간선이 최소 신장 트리에 들어가는 것은 언제인가?"
        options={['절대 들어가지 않는다', '그 간선을 빼면 그래프가 두 조각으로 끊어질 때', '노드 수가 짝수일 때', '크루스칼로는 들어가지 않지만 프림으로는 들어갈 수 있다']}
        answer={1}
        explain={<>크루스칼은 가장 무거운 간선을 맨 마지막에 봅니다. 그때까지 양 끝이 다른 그룹으로 남아 있다는 것은, 나머지 간선을 모두 써도 두 끝을 이을 수 없다는 뜻입니다. 곧 그 간선을 빼면 그래프가 끊어지는 경우입니다. 다른 길이 하나라도 있으면 그 길의 간선이 모두 더 가벼우므로 먼저 골라져 두 끝이 같은 그룹이 되고, 가장 무거운 간선은 버려집니다. 최소 신장 트리는 하나뿐이므로 프림도 같은 결과를 냅니다.</>}
      />
    </>
  );
}
