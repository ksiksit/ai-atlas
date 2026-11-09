import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { rng } from '../../../../lib/math';
import type { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { KEY_HINT, arrow, hitPoint, knob, label, lineThrough, plane, snapIn, tGrid, useKeyHandles, useLaColors } from './draw';
import { add, coords, cross, fromCols, nf, norm, scale, tn, type Vec2 } from './la';
import './linear.css';

const parallel = (a: Vec2, b: Vec2) => Math.abs(cross(a, b)) < 0.02 * Math.max(1e-6, norm(a) * norm(b)) || norm(a) < 0.05 || norm(b) < 0.05;
const vs = (v: Vec2) => `(${nf(v[0], 1)}, ${nf(v[1], 1)})`;

/* ─────────────── Figure 1: reach a target with c₁u + c₂v ─────────────── */

const TARGETS: Vec2[] = [
  [3, 4],
  [-4, 1],
  [1, -3.5],
  [4.5, -0.5],
  [-2.5, -3],
  [0.5, 4.5],
];

function CombineFigure() {
  const P = usePalette();
  const [C1, C2] = useLaColors(P);
  const [u, setU] = useState<Vec2>([2, 1]);
  const [v, setV] = useState<Vec2>([-1, 1.5]);
  const [c1, setC1] = useState(1);
  const [c2, setC2] = useState(1);
  const [ti, setTi] = useState(0);
  const [lattice, setLattice] = useState(false);
  const plotRef = useRef<Plot | null>(null);
  const T0 = TARGETS[ti % TARGETS.length];
  const a = scale(u, c1);
  const r = add(a, scale(v, c2));
  const dist = norm([r[0] - T0[0], r[1] - T0[1]]);
  const hit = dist < 0.16;
  const par = parallel(u, v);
  const exact = coords(u, v, T0);
  const reachable = !par || Math.abs(cross(u, T0)) < 0.05 * norm(u) * norm(T0);

  const move = (id: string, p: Vec2) => (id === 'u' ? setU(p) : setV(p));
  const keys = useKeyHandles(['u', 'v'], (id, dx, dy) => {
    const cur = id === 'u' ? u : v;
    move(id, [Math.round((cur[0] + dx) * 10) / 10, Math.round((cur[1] + dy) * 10) / 10]);
  });

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 5.4);
      plotRef.current = plot;
      if (lattice && !par) tGrid(plot, fromCols(u, v), alpha(C2, 0.28), 1, 14);
      if (par && norm(u) > 0.05) lineThrough(plot, u, alpha(P.hl, 0.75), 6);
      // target
      const tx = plot.X(T0[0]);
      const ty = plot.Y(T0[1]);
      ctx.save();
      ctx.strokeStyle = hit ? P.good : P.hl;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tx, ty, 12, 0, Math.PI * 2);
      ctx.moveTo(tx - 17, ty);
      ctx.lineTo(tx + 17, ty);
      ctx.moveTo(tx, ty - 17);
      ctx.lineTo(tx, ty + 17);
      ctx.stroke();
      ctx.restore();
      // the original u, v (faint) and the two scaled pieces laid tip to tail
      arrow(plot, [0, 0], u, alpha(P.neg, 0.35), 2, 9);
      arrow(plot, [0, 0], v, alpha(P.pos, 0.35), 2, 9);
      arrow(plot, [0, 0], a, P.neg, 3, 12);
      arrow(plot, a, r, P.pos, 3, 12);
      arrow(plot, [0, 0], r, C1, 2.5, 12);
      knob(plot, u, P.neg, P, keys.active === 'u');
      knob(plot, v, P.pos, P, keys.active === 'v');
      label(plot, 'u', u, P.neg, P, 10, 14);
      label(plot, 'v', v, P.pos, P, 10, 14);
      label(plot, `${tn(c1, 1)}u + ${tn(c2, 1)}v`, r, C1, P, 12, -14);
    },
    [P, u, v, c1, c2, ti, lattice, keys.active],
    { aspect: 1.15, maxHeight: 500 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => hitPoint(plotRef.current, x, y, [['u', u], ['v', v]]),
    onDrag: (id, x, y) => move(String(id), snapIn(plotRef.current!, x, y)),
  });

  const solveIt = () => {
    if (!exact) return;
    setC1(Math.max(-3, Math.min(3, Math.round(exact[0] * 10) / 10)));
    setC2(Math.max(-3, Math.min(3, Math.round(exact[1] * 10) / 10)));
  };

  let status: { tone: string; text: ReactNode };
  if (hit) status = { tone: 'good', text: <><strong>도착했습니다.</strong> {tn(c1, 1)}u + {tn(c2, 1)}v = {vs(T0)}. 같은 u, v로 다른 목표도 노려 보세요.</> };
  else if (par && !reachable) status = { tone: 'bad', text: <><strong>u와 v가 한 직선 위에 있습니다.</strong> 계수를 어떻게 골라도 결과는 노란 직선을 벗어나지 못하므로 이 목표에는 닿을 수 없습니다. u나 v를 직선 밖으로 끌어내 보세요.</> };
  else if (exact && (Math.abs(exact[0]) > 3 || Math.abs(exact[1]) > 3)) status = { tone: 'hl', text: <>정확한 답은 c₁ = {nf(exact[0], 2)}, c₂ = {nf(exact[1], 2)}입니다. 슬라이더 범위(±3) 밖이니 u나 v를 더 길게 끌어 보세요.</> };
  else status = { tone: '', text: <>목표까지 거리 {nf(dist, 2)}. 두 슬라이더로 u와 v를 몇 배씩 쓸지 정하세요.</> };

  return (
    <Figure
      no={1}
      title="u와 v를 늘이고 더해서 목표에 닿기"
      hint="슬라이더로 계수를 바꾸고, u와 v의 끝을 끌어 보세요"
      caption={<>파란 화살표는 c₁u, 그 끝에 이어 붙인 주황 화살표는 c₂v, 분홍 화살표가 둘을 더한 선형결합 c₁u + c₂v입니다. 흐린 화살표가 원래의 u와 v입니다. "u, v 격자"를 켜면 u와 v의 정수배로 만든 비스듬한 격자가 보이고, 목표가 그 격자의 어느 칸에 있는지가 곧 답입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`좌표평면: u = ${vs(u)}, v = ${vs(v)}, ${tn(c1, 1)}u + ${tn(c2, 1)}v = ${vs(r)}, 목표 ${vs(T0)}. ${hit ? '목표에 도착함.' : `목표까지 거리 ${nf(dist, 2)}.`} ${KEY_HINT}`} {...keys.props} />
        </div>
        <div className="controls">
          <Slider id="vc-c1" label="c₁ (u를 몇 배)" value={c1} min={-3} max={3} step={0.1} onChange={setC1} format={(x) => nf(x, 1)} color="var(--neg)" />
          <Slider id="vc-c2" label="c₂ (v를 몇 배)" value={c2} min={-3} max={3} step={0.1} onChange={setC2} format={(x) => nf(x, 1)} color="var(--pos)" />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="c₁u + c₂v" value={vs(r)} color="var(--c-math-1)" />
            <Readout label="목표" value={vs(T0)} color={hit ? 'var(--good)' : 'var(--hl)'} />
          </div>
          <div className="la-status" data-tone={status.tone} aria-live="polite">
            {status.text}
          </div>
          <div className="btn-row">
            <Button small primary onClick={() => setTi((i) => i + 1)}>
              새 목표
            </Button>
            <Button small onClick={solveIt} disabled={!exact}>
              답 보기
            </Button>
            <Button small onClick={() => setV(scale(u, -0.8))}>
              v를 u와 나란히
            </Button>
          </div>
          <Check label="u, v 격자 보기" checked={lattice} onChange={setLattice} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: span of one, two or three vectors ─────────────── */

const SEEDS = Array.from({ length: 900 }, (_, i) => {
  const r = rng(1000 + i);
  return [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1];
});

function SpanFigure() {
  const P = usePalette();
  const [C1, , C3] = useLaColors(P);
  const [n, setN] = useState<1 | 2 | 3>(2);
  const [vecs, setVecs] = useState<Vec2[]>([
    [1.6, 0.6],
    [0.4, 1.4],
    [-1.2, 0.8],
  ]);
  const [range, setRange] = useState(1.5);
  const plotRef = useRef<Plot | null>(null);
  const ids = ['a', 'b', 'c'].slice(0, n);
  const cols = [P.neg, P.pos, C3];
  const [a, b, c] = vecs;
  const ab = !parallel(a, b);
  const dim = n === 1 ? (norm(a) > 0.05 ? 1 : 0) : ab || (n === 3 && (!parallel(a, c) || !parallel(b, c))) ? 2 : norm(a) + norm(b) + (n === 3 ? norm(c) : 0) > 0.1 ? 1 : 0;
  const dep = n === 3 || (n === 2 && !ab);
  const rel = n === 3 && ab ? coords(a, b, c) : null;

  const setVec = (k: number, p: Vec2) => setVecs((cur) => cur.map((x, i) => (i === k ? p : x)));
  const keys = useKeyHandles(ids, (id, dx, dy) => {
    const k = ids.indexOf(id);
    const cur = vecs[k];
    setVec(k, [Math.round((cur[0] + dx) * 10) / 10, Math.round((cur[1] + dy) * 10) / 10]);
  });

  const pts = useMemo(
    () =>
      SEEDS.map(([s, t, q]) => {
        let p: Vec2 = scale(a, s * range);
        if (n >= 2) p = add(p, scale(b, t * range));
        if (n >= 3) p = add(p, scale(c, q * range));
        return p;
      }),
    [a, b, c, n, range],
  );

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 5);
      plotRef.current = plot;
      if (dim === 1) {
        const dir = norm(a) > 0.05 ? a : norm(b) > 0.05 ? b : c;
        lineThrough(plot, dir, alpha(P.hl, 0.7), 5);
      }
      ctx.save();
      ctx.fillStyle = alpha(C1, 0.4);
      for (const p of pts) {
        if (Math.abs(p[0]) > 6 || Math.abs(p[1]) > 6) continue;
        ctx.beginPath();
        ctx.arc(plot.X(p[0]), plot.Y(p[1]), 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      vecs.slice(0, n).forEach((v, i) => {
        arrow(plot, [0, 0], v, cols[i], 3, 12);
        knob(plot, v, cols[i], P, keys.active === ids[i]);
        label(plot, ids[i], v, cols[i], P, 10, 14);
      });
    },
    [P, vecs, n, pts, dim, keys.active],
    { aspect: 1.15, maxHeight: 480 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => hitPoint(plotRef.current, x, y, ids.map((id, i) => [id, vecs[i]] as [string, Vec2])),
    onDrag: (id, x, y) => setVec(ids.indexOf(String(id)), snapIn(plotRef.current!, x, y)),
  });

  const spanName = dim === 2 ? '평면 전체 (2차원)' : dim === 1 ? '원점을 지나는 직선 (1차원)' : '원점 하나 (0차원)';
  return (
    <Figure
      no={2}
      title="생성 공간: 섞어서 만들 수 있는 모든 점"
      hint="벡터 개수와 계수 범위를 바꾸고 화살표를 끌어 보세요"
      caption={<>분홍 점 하나하나가 계수를 무작위로 고른 선형결합입니다. 계수의 범위를 넓히면 점이 차지하는 영역이 커지는데, 끝없이 넓히면 그 영역이 생성 공간이 됩니다. 두 벡터가 나란하면 아무리 넓혀도 노란 직선 위에만 머뭅니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`벡터 ${n}개 ${ids.map((id, i) => `${id} = ${vs(vecs[i])}`).join(', ')}의 선형결합 점들. 생성 공간은 ${spanName}. ${KEY_HINT}`} {...keys.props} />
        </div>
        <div className="controls">
          <Seg label="벡터 개수" value={n} onChange={setN} options={[1, 2, 3].map((k) => ({ value: k as 1 | 2 | 3, label: `${k}개` }))} />
          <Slider id="sp-range" label="계수 범위 (−r ~ r)" value={range} min={0.2} max={4} step={0.1} onChange={setRange} format={(x) => `r = ${nf(x, 1)}`} />
          <div className="readouts la-readtext" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="생성 공간" value={spanName} color={dim === 2 ? 'var(--good)' : 'var(--hl)'} />
            <Readout label="선형 독립인가" value={dep ? '아니오 (종속)' : '예 (독립)'} color={dep ? 'var(--bad)' : 'var(--good)'} />
          </div>
          <div className="la-note" aria-live="polite">
            {n === 3 && rel ? (
              <>
                평면에 벡터가 셋이면 언제나 종속입니다. 지금은 <span className="mono">c = {nf(rel[0], 2)}a {rel[1] < 0 ? '−' : '+'} {nf(Math.abs(rel[1]), 2)}b</span>라서 c를 더해도 새로 닿는 곳이 없습니다.
              </>
            ) : n === 2 && !ab ? (
              <>a와 b가 같은 직선 위에 있어서 b는 a를 늘인 것에 불과합니다. 벡터는 둘이지만 생성 공간은 1차원입니다.</>
            ) : n === 1 ? (
              <>벡터 하나로는 그 방향의 직선만 만들 수 있습니다.</>
            ) : n === 2 ? (
              <>방향이 다른 두 벡터는 평면 전체를 만듭니다. 범위 r을 키우며 확인해 보세요.</>
            ) : (
              <>a와 b가 나란하니 c가 평면을 채우는 역할을 맡았습니다.</>
            )}
          </div>
          <div className="btn-row">
            <Button small onClick={() => setVec(1, scale(a, -1.3))}>
              b를 a와 나란히
            </Button>
            <Button
              small
              onClick={() =>
                setVecs([
                  [1.6, 0.6],
                  [0.4, 1.4],
                  [-1.2, 0.8],
                ])
              }
            >
              처음 상태
            </Button>
          </div>
          <Legend items={[{ color: 'var(--neg)', label: 'a', shape: 'ln' }, { color: 'var(--pos)', label: 'b', shape: 'ln' }, { color: 'var(--c-math-3)', label: 'c', shape: 'ln' }, { color: 'var(--c-math-1)', label: '선형결합' }]} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: coordinates in a basis ─────────────── */

const BASES: { name: string; b1: Vec2; b2: Vec2 }[] = [
  { name: '표준', b1: [1, 0], b2: [0, 1] },
  { name: '기울어짐', b1: [2, 1], b2: [-1, 1] },
  { name: '길쭉함', b1: [1.5, 0.3], b2: [1.2, 1] },
];

function BasisFigure() {
  const P = usePalette();
  const [C1, C2] = useLaColors(P);
  const [b1, setB1] = useState<Vec2>(BASES[1].b1);
  const [b2, setB2] = useState<Vec2>(BASES[1].b2);
  const [p, setP] = useState<Vec2>([3, 2]);
  const plotRef = useRef<Plot | null>(null);
  const c = coords(b1, b2, p);
  const set = (id: string, q: Vec2) => (id === 'b1' ? setB1(q) : id === 'b2' ? setB2(q) : setP(q));
  const cur = (id: string) => (id === 'b1' ? b1 : id === 'b2' ? b2 : p);
  const keys = useKeyHandles(['p', 'b1', 'b2'], (id, dx, dy) => {
    const q = cur(id);
    set(id, [Math.round((q[0] + dx) * 10) / 10, Math.round((q[1] + dy) * 10) / 10]);
  });

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 5);
      plotRef.current = plot;
      if (c) {
        tGrid(plot, fromCols(b1, b2), alpha(C2, 0.42), 1.1, 16);
        const s1 = scale(b1, c[0]);
        plot.line(0, 0, s1[0], s1[1], alpha(P.neg, 0.8), 4);
        plot.line(s1[0], s1[1], p[0], p[1], alpha(P.pos, 0.8), 4);
      } else lineThrough(plot, norm(b1) > 0.05 ? b1 : b2, alpha(P.bad, 0.6), 4);
      arrow(plot, [0, 0], b1, P.neg, 3, 12);
      arrow(plot, [0, 0], b2, P.pos, 3, 12);
      knob(plot, b1, P.neg, P, keys.active === 'b1');
      knob(plot, b2, P.pos, P, keys.active === 'b2');
      label(plot, 'b₁', b1, P.neg, P, 10, 14);
      label(plot, 'b₂', b2, P.pos, P, 10, 14);
      plot.dot(p[0], p[1], 7, C1, P.surface, 2);
      if (keys.active === 'p') knob(plot, p, C1, P, true);
      label(plot, `p = ${vs(p)}`, p, C1, P, 12, -14);
    },
    [P, b1, b2, p, keys.active],
    { aspect: 1.15, maxHeight: 480 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => hitPoint(plotRef.current, x, y, [['p', p], ['b1', b1], ['b2', b2]]),
    onDrag: (id, x, y) => set(String(id), snapIn(plotRef.current!, x, y)),
  });

  return (
    <Figure
      no={3}
      title="같은 점, 다른 기저, 다른 좌표"
      hint="점 p나 기저 벡터 b₁, b₂의 끝을 끌어 보세요"
      caption={<>뒤의 회색 격자가 표준 기저(가로 1, 세로 1)로 잰 눈금이고, 푸른 격자가 b₁과 b₂로 잰 눈금입니다. 점 p는 그대로인데 어떤 자로 재느냐에 따라 좌표가 달라집니다. 파란 막대(b₁ 방향)와 주황 막대(b₂ 방향)를 이어 붙이면 p에 도착합니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`기저 b₁ = ${vs(b1)}, b₂ = ${vs(b2)}와 점 p = ${vs(p)}. ${c ? `새 기저에서 p의 좌표는 (${nf(c[0], 2)}, ${nf(c[1], 2)}).` : 'b₁과 b₂가 나란해서 기저가 아님.'} ${KEY_HINT}`} {...keys.props} />
        </div>
        <div className="controls">
          <Seg label="기저 고르기" value={BASES.findIndex((B) => B.b1[0] === b1[0] && B.b1[1] === b1[1] && B.b2[0] === b2[0] && B.b2[1] === b2[1])} onChange={(i) => { if (i >= 0) { setB1(BASES[i].b1); setB2(BASES[i].b2); } }} options={BASES.map((B, i) => ({ value: i, label: B.name }))} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="표준 좌표 (x, y)" value={vs(p)} />
            <Readout label="기저 B에서의 좌표 [p]_B" value={c ? `(${nf(c[0], 2)}, ${nf(c[1], 2)})` : '기저가 아님'} color={c ? 'var(--c-math-1)' : 'var(--bad)'} />
          </div>
          <div className="la-tex">
            {c ? <M>{`\\mathbf p = \\textcolor{${P.neg}}{${tn(c[0], 2)}}\\,\\mathbf b_1 ${c[1] < 0 ? '-' : '+'} \\textcolor{${P.pos}}{${tn(Math.abs(c[1]), 2)}}\\,\\mathbf b_2`}</M> : <M>{'\\mathbf b_1 \\parallel \\mathbf b_2'}</M>}
          </div>
          <div className="la-note" aria-live="polite">
            {c ? <>p를 b₁ {nf(c[0], 2)}개와 b₂ {nf(c[1], 2)}개로 만드는 방법은 이것 하나뿐입니다. 기저에서 좌표는 언제나 하나로 정해집니다.</> : <>b₁과 b₂가 한 직선 위에 있으면 직선 밖의 점은 만들 수 없고, 직선 위의 점은 만드는 방법이 무수히 많습니다. 그래서 기저가 될 수 없습니다.</>}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: users as vectors ─────────────── */

const MOVIES = ['다이하드', '매트릭스', '분노의 질주', '노트북', '어바웃 타임'];
const PROTOS: { name: string; v: number[] }[] = [
  { name: '액션형', v: [5, 4.5, 4.5, 1, 1] },
  { name: '로맨스형', v: [1, 1.5, 1, 5, 4.5] },
];
const USERS: { name: string; v: (number | null)[] }[] = [
  { name: '지민', v: [4.5, 4.5, null, 1.5, 1.5] },
  { name: '현우', v: [1.5, null, 1, 4.5, 5] },
  { name: '수아', v: [3, 3, 3, 3.5, null] },
];

function cosKnown(a: (number | null)[], b: number[]) {
  let d = 0;
  let na = 0;
  let nb = 0;
  a.forEach((x, i) => {
    if (x === null) return;
    d += x * b[i];
    na += x * x;
    nb += b[i] * b[i];
  });
  return d / Math.sqrt(na * nb);
}

/** Least-squares weights (α, β) so that α·p₁ + β·p₂ matches the user's known ratings. */
function bestFit(u: (number | null)[]): [number, number] {
  let s11 = 0;
  let s12 = 0;
  let s22 = 0;
  let t1 = 0;
  let t2 = 0;
  u.forEach((x, i) => {
    if (x === null) return;
    const p = PROTOS[0].v[i];
    const q = PROTOS[1].v[i];
    s11 += p * p;
    s12 += p * q;
    s22 += q * q;
    t1 += p * x;
    t2 += q * x;
  });
  const d = s11 * s22 - s12 * s12;
  return [(t1 * s22 - t2 * s12) / d, (s11 * t2 - s12 * t1) / d];
}

function RecommendFigure() {
  const [ui, setUi] = useState(0);
  const [w, setW] = useState<[number, number]>([0.5, 0.5]);
  const user = USERS[ui];
  const pred = MOVIES.map((_, i) => w[0] * PROTOS[0].v[i] + w[1] * PROTOS[1].v[i]);
  const miss = user.v.findIndex((x) => x === null);
  const err = Math.sqrt(user.v.reduce<number>((s, x, i) => (x === null ? s : s + (x - pred[i]) ** 2), 0) / 4);
  const best = bestFit(user.v);
  const sims = PROTOS.map((p) => cosKnown(user.v, p.v));
  const guess = pred[miss];

  return (
    <Figure
      no={4}
      title="사용자 취향을 두 원형의 선형결합으로"
      hint="사용자를 고르고 두 가중치를 바꿔 보세요"
      caption={<>평점 5개를 모은 각 사용자는 5차원 벡터입니다. 두 원형 벡터(액션형, 로맨스형)의 선형결합 α·액션형 + β·로맨스형으로 사용자의 아는 평점 4개를 최대한 비슷하게 만들면, 같은 식이 비어 있는 다섯 번째 평점도 예측해 줍니다. 막대는 예측, 검은 눈금은 실제 평점입니다.</>}
    >
      <div className="controls row">
        <Seg label="사용자" value={ui} onChange={(i) => { setUi(i); setW([0.5, 0.5]); }} options={USERS.map((u, i) => ({ value: i, label: u.name }))} />
      </div>
      <div className="tbl-wrap" style={{ margin: 0 }}>
        <table className="tbl la-rate">
          <thead>
            <tr>
              <th>벡터</th>
              {MOVIES.map((m) => (
                <th key={m} style={{ textAlign: 'right' }}>
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PROTOS.map((p) => (
              <tr key={p.name}>
                <td className="proto">{p.name} (원형)</td>
                {p.v.map((x, i) => (
                  <td key={i} className="num">
                    {x}
                  </td>
                ))}
              </tr>
            ))}
            {USERS.map((u, k) => (
              <tr key={u.name} data-sel={k === ui || undefined}>
                <td>
                  <strong>{u.name}</strong>
                </td>
                {u.v.map((x, i) => (x === null ? <td key={i} className="miss">?</td> : <td key={i} className="num">{x}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fig-split">
        <div className="la-bars" role="img" aria-label={`${user.name}의 실제 평점과 예측 평점 비교. 예측은 ${pred.map((x, i) => `${MOVIES[i]} ${nf(x, 1)}`).join(', ')}.`}>
          {MOVIES.map((m, i) => {
            const real = user.v[i];
            return [
              <span key={m + 'n'} style={i === miss ? { color: 'var(--hl)', fontWeight: 700 } : undefined}>
                {m}
              </span>,
              <div key={m + 't'} className="track">
                <div className="fill" style={{ width: `${(Math.max(0, Math.min(5.5, pred[i])) / 5.5) * 100}%`, background: i === miss ? 'var(--hl)' : undefined }} />
                {real !== null && <div className="mark" style={{ left: `${(real / 5.5) * 100}%` }} />}
              </div>,
              <span key={m + 'v'} className="v">
                {nf(pred[i], 1)}
                {real !== null ? ` / ${real}` : ' / ?'}
              </span>,
            ];
          })}
        </div>
        <div className="controls">
          <Slider id="rc-a" label="α (액션형 가중치)" value={w[0]} min={-0.5} max={1.5} step={0.01} onChange={(x) => setW([x, w[1]])} format={(x) => nf(x, 2)} />
          <Slider id="rc-b" label="β (로맨스형 가중치)" value={w[1]} min={-0.5} max={1.5} step={0.01} onChange={(x) => setW([w[0], x])} format={(x) => nf(x, 2)} />
          <Button small primary onClick={() => setW([Math.round(best[0] * 100) / 100, Math.round(best[1] * 100) / 100])}>
            가장 잘 맞는 α, β 찾기
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="아는 평점 오차 (RMS)" value={nf(err, 2)} color={err < 0.35 ? 'var(--good)' : undefined} />
            <Readout label={`${MOVIES[miss]} 예측`} value={nf(guess, 2)} color="var(--hl)" />
            <Readout label="cos(사용자, 액션형)" value={nf(sims[0], 3)} />
            <Readout label="cos(사용자, 로맨스형)" value={nf(sims[1], 3)} />
          </div>
          <div className="la-note" aria-live="polite">
            {err < 0.35 ? (
              <>
                {user.name} ≈ {nf(w[0], 2)}·액션형 + {nf(w[1], 2)}·로맨스형. 예측 평점 {nf(guess, 1)}점이니 <strong>{MOVIES[miss]}</strong>을(를) {guess >= 3.5 ? '추천합니다' : guess >= 2.5 ? '애매합니다' : '추천하지 않습니다'}.
              </>
            ) : (
              <>아직 아는 평점과 차이가 큽니다. 버튼을 누르거나 가중치를 직접 맞춰 보세요.</>
            )}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Vectors() {
  return (
    <>
      <h2>벡터: 화살표이자 숫자 목록</h2>
      <p>
        <T en="vector">벡터</T>에는 두 얼굴이 있습니다. 물리학에서는 길이와 방향을 가진 화살표이고, 프로그래밍에서는 숫자를 순서대로 늘어놓은 배열입니다. 선형대수는 이 둘이 같은 것이라는 데서 출발합니다. 평면 위의 화살표는 끝점의 좌표 두 개로 적을 수 있고, 숫자 두 개는 원점에서 출발하는 화살표로 그릴 수 있습니다.
      </p>
      <MB note="n개의 실수를 세로로 늘어놓은 것이 n차원 벡터입니다. ℝⁿ(알엔)은 그런 벡터 전체의 집합입니다.">{'\\mathbf v = \\begin{pmatrix} v_1 \\\\ v_2 \\\\ \\vdots \\\\ v_n \\end{pmatrix} \\in \\mathbb R^n'}</MB>
      <p>
        굵은 글씨 <M>{'\\mathbf v'}</M>는 벡터, 아래 첨자가 붙은 <M>{'v_i'}</M>는 그 i번째 성분(숫자 하나)입니다. 숫자 하나는 벡터와 구별해서 <T en="scalar">스칼라</T>라고 부릅니다. 길이, 내적, 코사인 유사도는 <a href={lessonHref('ai-basics', 'vectors')}>기초 인공지능의 벡터와 내적</a>에서 다뤘습니다. 이 장은 그다음 질문, 벡터 몇 개로 무엇을 만들 수 있는가를 다룹니다.
      </p>
      <p>벡터로 하는 기본 연산은 딱 두 가지입니다.</p>
      <ul>
        <li>
          <strong>덧셈</strong>: 같은 자리끼리 더합니다. 화살표로는 하나의 끝에 다른 하나의 시작을 이어 붙인 곳입니다.
        </li>
        <li>
          <strong>스칼라 곱</strong>: 모든 성분에 같은 수를 곱합니다. 화살표로는 같은 직선 위에서 길이를 늘이거나 줄이는 것이고, 음수를 곱하면 방향이 뒤집힙니다.
        </li>
      </ul>
      <MB>{'\\begin{pmatrix} 2 \\\\ 1 \\end{pmatrix} + \\begin{pmatrix} -1 \\\\ 1.5 \\end{pmatrix} = \\begin{pmatrix} 1 \\\\ 2.5 \\end{pmatrix}, \\qquad 3 \\begin{pmatrix} 2 \\\\ 1 \\end{pmatrix} = \\begin{pmatrix} 6 \\\\ 3 \\end{pmatrix}'}</MB>
      <p>
        이 두 연산이 잘 맞물린다는 것(덧셈 순서를 바꿔도 되고, 곱셈이 덧셈에 분배되는 것 등)이 선형대수의 전부라고 해도 지나치지 않습니다. 성분이 둘이든 천 개든 연산 규칙은 똑같아서, 2차원에서 그림으로 본 것은 고차원에서도 그대로 통합니다.
      </p>

      <h2>선형결합: 늘이고 더하기</h2>
      <p>
        두 연산을 함께 쓰면 벡터 몇 개를 각각 몇 배씩 해서 더할 수 있습니다. 이렇게 만든 벡터를 <T en="linear combination">선형결합</T>이라고 하고, 곱하는 수 <M>{'c_1, c_2'}</M>를 <T en="coefficient">계수</T>라고 합니다.
      </p>
      <MB note="u, v는 재료가 되는 벡터, c₁, c₂는 재료를 얼마나 쓸지 정하는 스칼라입니다.">{'c_1 \\mathbf u + c_2 \\mathbf v'}</MB>
      <p>
        요리에 비유하면 u와 v는 재료이고 계수는 분량입니다. 그림 1에서 목표 점을 만드는 분량을 찾아 보세요. 몇 번 해 보면 요령이 생깁니다. u 방향으로 얼마나 가고 v 방향으로 얼마나 갈지를 따로 생각하면 됩니다.
      </p>
      <CombineFigure />
      <p>
        정답을 찾는 일은 사실 방정식을 푸는 일입니다. u = (2, 1), v = (−1, 1.5)로 (3, 4)를 만들려면 가로 성분과 세로 성분이 각각 맞아야 하니 <M>{'2c_1 - c_2 = 3'}</M>, <M>{'c_1 + 1.5c_2 = 4'}</M>를 동시에 만족해야 합니다. 미지수 두 개짜리 연립방정식입니다. 이런 방정식을 체계적으로 푸는 법은 <a href={lessonHref('math-linear-algebra', 'elimination')}>3장 가우스 소거</a>에서 배웁니다.
      </p>
      <p>"v를 u와 나란히" 버튼을 누르면 상황이 완전히 달라집니다. 두 재료가 같은 방향이면 무엇을 섞든 그 직선을 벗어날 수 없습니다. 이것이 다음 개념입니다.</p>

      <h2>생성 공간: 닿을 수 있는 모든 곳</h2>
      <p>
        벡터 몇 개의 선형결합으로 만들 수 있는 모든 점의 집합을 그 벡터들의 <T en="span">생성 공간</T>이라고 합니다. 계수를 어떤 실수로든 고를 수 있으니, 생성 공간은 늘 원점을 지나고 끝없이 펼쳐집니다.
      </p>
      <MB note="{ … | … }는 '조건을 만족하는 것 전체의 집합'이라는 뜻입니다.">{'\\operatorname{span}(\\mathbf u, \\mathbf v) = \\{\\, c_1 \\mathbf u + c_2 \\mathbf v \\mid c_1, c_2 \\in \\mathbb R \\,\\}'}</MB>
      <SpanFigure />
      <p>
        그림 2에서 세 가지를 확인할 수 있습니다. 벡터 하나의 생성 공간은 직선입니다. 방향이 다른 두 벡터는 평면 전체를 만듭니다. 그리고 평면에서는 벡터를 세 개 넣어도 평면보다 커지지 않습니다. 세 번째 벡터는 앞의 두 개로 이미 만들 수 있기 때문입니다. 3차원 공간에서라면 두 벡터의 생성 공간은 원점을 지나는 평면이고, 그 평면 밖을 가리키는 세 번째 벡터가 있어야 공간 전체가 됩니다.
      </p>

      <h2>선형 독립: 쓸모없는 재료가 없는가</h2>
      <p>
        그림 2의 세 번째 벡터처럼 다른 벡터들의 선형결합으로 만들 수 있는 벡터는 생성 공간을 넓혀 주지 못합니다. 그런 군더더기가 하나도 없을 때 벡터들이 <T en="linearly independent">선형 독립</T>이라고 하고, 군더더기가 있으면 <T en="linearly dependent">선형 종속</T>이라고 합니다. 정확한 정의는 이렇습니다.
      </p>
      <MB note="계수를 모두 0으로 고르면 당연히 0벡터가 됩니다. 그 방법밖에 없을 때가 독립입니다.">{'c_1 \\mathbf v_1 + c_2 \\mathbf v_2 + \\cdots + c_k \\mathbf v_k = \\mathbf 0 \\;\\Longrightarrow\\; c_1 = c_2 = \\cdots = c_k = 0'}</MB>
      <p>
        왜 이 식이 "군더더기 없음"과 같은 말일까요? 만약 <M>{'\\mathbf c = 0.8\\mathbf a - 1.2\\mathbf b'}</M>라면 옮겨 적어 <M>{'0.8\\mathbf a - 1.2\\mathbf b - \\mathbf c = \\mathbf 0'}</M>이 되어, 0이 아닌 계수로 0벡터를 만든 셈이 됩니다. 반대로 0이 아닌 계수로 0벡터를 만들 수 있으면, 계수가 0이 아닌 벡터 하나를 나머지로 풀어 쓸 수 있습니다.
      </p>
      <Callout kind="intuition">
        선형 독립은 "정보가 겹치지 않는다"는 뜻입니다. 집 데이터에 "면적(㎡)"과 "면적(평)"을 둘 다 넣으면 두 열은 서로의 상수배라서 종속입니다. 열이 둘이어도 정보는 하나뿐이고, 뒤에서 보겠지만 이런 중복은 회귀 계산을 불안정하게 만듭니다.
      </Callout>

      <h2>기저와 좌표</h2>
      <p>
        공간 전체를 생성하면서 선형 독립인 벡터들의 모임을 <T en="basis">기저</T>라고 합니다. 모자람도 군더더기도 없는 재료 세트입니다. 평면의 기저는 언제나 벡터 두 개이고, 3차원 공간의 기저는 세 개입니다. 이 개수가 공간의 <T en="dimension">차원</T>입니다.
      </p>
      <p>
        기저가 좋은 이유는 공간의 모든 점을 <strong>꼭 한 가지 방법으로</strong> 만들 수 있다는 데 있습니다. 생성하니까 만들 수 있고, 독립이니까 방법이 둘일 수 없습니다(두 방법을 빼면 0이 아닌 계수로 0벡터가 나오니까요). 그래서 기저를 정하면 점마다 계수 목록이 하나씩 정해지고, 그것을 그 기저에서의 <T en="coordinates">좌표</T>라고 부릅니다.
      </p>
      <MB note="[p]_B는 '기저 B로 잰 p의 좌표'라고 읽습니다. 우리가 평소 쓰는 (x, y)는 표준 기저 e₁ = (1, 0), e₂ = (0, 1)로 잰 좌표입니다.">{'\\mathbf p = c_1 \\mathbf b_1 + c_2 \\mathbf b_2 \\quad\\Longleftrightarrow\\quad [\\mathbf p]_B = \\begin{pmatrix} c_1 \\\\ c_2 \\end{pmatrix}'}</MB>
      <BasisFigure />
      <p>
        그림 3에서 기저를 바꿔도 점 p 자체는 움직이지 않는다는 점이 중요합니다. 바뀌는 것은 p를 적는 숫자뿐입니다. 같은 색을 RGB로 적을 수도, HSV로 적을 수도 있는 것과 비슷합니다. 문제에 따라 좋은 기저를 고르면 계산이 극적으로 쉬워지는데, <a href={lessonHref('math-linear-algebra', 'eigen')}>5장 고유벡터</a>와 <a href={lessonHref('math-linear-algebra', 'svd')}>7장 특잇값 분해</a>는 결국 "이 문제에 가장 좋은 기저는 무엇인가"라는 질문입니다.
      </p>
      <Code label="2차원 기저에서 좌표 구하기">{`
// p = c1*b1 + c2*b2 를 만족하는 (c1, c2)를 구한다
function coordsIn(b1, b2, p) {
  // b1, b2가 만드는 평행사변형의 넓이(부호 있음)
  const d = b1[0] * b2[1] - b1[1] * b2[0];
  // d가 0이면 나란하다: 기저가 아님
  if (Math.abs(d) < 1e-12) return null;
  const c1 = (p[0] * b2[1] - p[1] * b2[0]) / d;
  const c2 = (b1[0] * p[1] - b1[1] * p[0]) / d;
  return [c1, c2];
}

coordsIn([2, 1], [-1, 1], [3, 2]); // [5/3, 1/3]
coordsIn([1, 2], [2, 4], [3, 2]);  // null: b2 = 2*b1`}</Code>
      <p>
        코드의 <code>d</code>는 4장에서 만날 <a href={lessonHref('math-linear-algebra', 'determinants')}>행렬식</a>입니다. 두 벡터가 나란하면 둘이 만드는 평행사변형이 납작해져 넓이가 0이 되고, 그때 기저가 깨집니다.
      </p>

      <h2>사용자를 벡터로 보기</h2>
      <p>
        추천 시스템은 사용자 한 명을 영화 평점 목록, 즉 벡터로 봅니다. 영화가 5편이면 5차원 벡터입니다. 이렇게 보면 "취향이 비슷하다"를 벡터 사이 각도(코사인 유사도)로 잴 수 있고, 더 나아가 "이 사람의 취향은 액션 성향 70%에 로맨스 성향 30%"처럼 몇 가지 대표 취향의 선형결합으로 설명할 수 있습니다.
      </p>
      <RecommendFigure />
      <p>
        그림 4에서 "가장 잘 맞는 α, β 찾기"는 아는 평점 4개와의 차이 제곱합이 가장 작아지는 계수를 구합니다. 미지수 2개에 식이 4개라 보통은 정확히 맞출 수 없고, 가장 가까운 답을 고르는 <T en="least squares">최소제곱</T> 문제가 됩니다. 이 생각은 <a href={lessonHref('ai-basics', 'linear-regression')}>선형 회귀</a>와 같은 것입니다. 수아처럼 두 원형이 섞인 사용자도 계수만 다를 뿐 같은 방식으로 설명됩니다.
      </p>
      <Callout kind="note">
        실제 서비스는 원형을 사람이 정하지 않습니다. 수백만 명의 평점 표 전체에서 "가장 많은 사용자를 가장 잘 설명하는 원형 몇 개"를 자동으로 찾는데, 그 도구가 7장의 특잇값 분해입니다. 이렇게 찾은 원형 벡터의 공간이 바로 사용자와 영화의 <a href={lessonHref('ai-basics', 'embeddings')}>임베딩</a> 공간입니다.
      </Callout>

      <Callout kind="key">
        벡터로 하는 일은 늘이기와 더하기뿐이고, 둘을 합친 것이 선형결합입니다. 선형결합으로 닿을 수 있는 모든 곳이 생성 공간, 군더더기 재료가 없는 것이 선형 독립, 둘을 모두 갖춘 재료 세트가 기저입니다. 기저를 정하면 모든 벡터가 계수 목록 하나, 즉 좌표로 적힙니다.
      </Callout>
      <Quiz
        q={<>3차원 공간 ℝ³에서 벡터 <strong>두 개</strong>의 생성 공간이 될 수 <strong>없는</strong> 것은?</>}
        options={['원점 하나', '원점을 지나는 직선', '원점을 지나는 평면', '3차원 공간 전체']}
        answer={3}
        explain={<>두 벡터가 모두 0이면 원점, 나란하면 직선, 방향이 다르면 평면이 됩니다. 공간 전체를 만들려면 독립인 벡터가 세 개 필요합니다. 그림 2의 평면에서 "벡터 하나로는 직선"이었던 것과 같은 이치로, 차원보다 적은 벡터로는 공간 전체를 채울 수 없습니다.</>}
      />
    </>
  );
}
