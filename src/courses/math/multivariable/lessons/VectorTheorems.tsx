import { useMemo, useRef, useState } from 'react';
import { Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { FIELDS, FIELD_IDS, areaIntegral, capCurlFlux, circle, closedSpline, cubeFlux, edgeFluxes, flux, lineIntegral, segment, signedArea, type Field, type FieldId, type V2 } from './fields';
import { arrowPx, clampIn, drawArrows, drawFrame, drawHeat, drawPath, handle, hitHandle, makeView, nf, pathArrows, type View } from './fielddraw';
import './multivariable.css';
import './theorems.css';

const R = 3;
const fieldOptions = (ids: FieldId[] = FIELD_IDS) => ids.map((id) => ({ value: id, label: FIELDS[id].name }));
const vs = (p: V2) => `(${nf(p[0], 2)}, ${nf(p[1], 2)})`;

/** Largest |g| on a coarse grid of the view, for scaling heat maps. */
function maxAbs(g: (x: number, y: number) => number): number {
  let m = 1e-9;
  for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) m = Math.max(m, Math.abs(g((i / 12) * R, (j / 12) * R)));
  return m;
}

/** The little square of side h at the probe, outlined. */
function drawBox(ctx: CanvasRenderingContext2D, v: View, P: Palette, c: V2, h: number) {
  ctx.fillStyle = alpha(P.surface, 0.55);
  ctx.fillRect(v.X(c[0] - h / 2), v.Y(c[1] + h / 2), h * v.s, h * v.s);
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = 1.8;
  ctx.strokeRect(v.X(c[0] - h / 2), v.Y(c[1] + h / 2), h * v.s, h * v.s);
}

/* ─────────────── Figure 1: divergence as outflow from a little box ─────────────── */

function DivergenceFigure() {
  const P = usePalette();
  const [fid, setFid] = useState<FieldId>('hill');
  const [c, setC] = useState<V2>([1, 0.5]);
  const [h, setH] = useState(1);
  const [heat, setHeat] = useState(true);
  const [active, setActive] = useState(false);
  const f = FIELDS[fid];
  const edges = edgeFluxes(f, c[0], c[1], h); // right, top, left, bottom
  const out = edges.reduce((a, b) => a + b, 0);
  const est = out / (h * h);
  const exact = f.div(c[0], c[1]);
  const scale = useMemo(() => maxAbs(f.div), [f]);
  const viewRef = useRef<View | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: H }) => {
      const v = makeView(w, H, R);
      viewRef.current = v;
      drawFrame(ctx, v, P);
      if (heat) drawHeat(ctx, v, f.div, P, Math.max(scale, 0.5));
      drawArrows(ctx, v, f, P.ink3, 15);
      drawBox(ctx, v, P, c, h);
      // outflow through each edge: an arrow out of the box, or into it when negative
      const normals: V2[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      const big = Math.max(0.05, ...edges.map(Math.abs));
      edges.forEach((q, k) => {
        if (Math.abs(q) < 1e-3) return;
        const n = normals[k];
        const mx = c[0] + (n[0] * h) / 2, my = c[1] + (n[1] * h) / 2;
        const L = 10 + (Math.abs(q) / big) * 26;
        const sx = v.X(mx), sy = v.Y(my);
        const dx = n[0], dy = -n[1];
        const col = q > 0 ? P.pos : P.neg;
        if (q > 0) arrowPx(ctx, sx, sy, sx + dx * L, sy + dy * L, col, 3, 9);
        else arrowPx(ctx, sx + dx * L, sy + dy * L, sx, sy, col, 3, 9);
      });
      handle(ctx, v, P, c, P.ink, '', active);
    },
    [P, f, c, h, heat, edges, active, scale],
    { aspect: 1, maxHeight: 460, minHeight: 200 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      const v = viewRef.current;
      if (!v) return null;
      return Math.abs(v.ix(x) - c[0]) <= Math.max(h / 2, 0.25) && Math.abs(v.iy(y) - c[1]) <= Math.max(h / 2, 0.25) ? 'c' : null;
    },
    onDrag: (_, x, y) => {
      setActive(true);
      setC(clampIn(viewRef.current!, x, y, h / 2 + 0.02));
    },
    onEnd: () => setActive(false),
  });

  const lim = R - h / 2 - 0.02;
  return (
    <Figure
      no={1}
      title="작은 상자에서 빠져나가는 양"
      hint="상자를 끌고, 크기를 줄여 보세요"
      caption={<>상자의 네 변마다 그 변을 통해 빠져나가는 양(그 변 위에서 F의 바깥쪽 성분을 적분한 값)을 화살표로 그렸습니다. 주황은 나가는 쪽, 파랑은 들어오는 쪽이고, 길이는 가장 큰 변을 기준으로 한 상대 크기입니다. 바탕색은 발산의 정확한 값으로, 주황이 양수(샘), 파랑이 음수(빨아들이는 곳)입니다.</>}
    >
      <div className="controls row">
        <Seg label="벡터장" value={fid} onChange={setFid} options={fieldOptions()} />
        <Check label="발산 바탕색" checked={heat} onChange={setHeat} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`${f.name} 벡터장 위에 중심 ${vs(c)}, 한 변 ${nf(h)}인 상자. 상자에서 빠져나가는 양 ${nf(out, 3)}, 넓이로 나눈 값 ${nf(est, 3)}, 그 점의 발산 ${nf(exact, 3)}.`} />
        </div>
        <div className="controls">
          <Slider id="vt-h" label="상자 한 변 h" value={h} min={0.1} max={2} step={0.05} onChange={(x) => { setH(x); setC([Math.max(-R + x / 2, Math.min(R - x / 2, c[0])), Math.max(-R + x / 2, Math.min(R - x / 2, c[1]))]); }} format={(x) => nf(x)} />
          <Slider id="vt-cx" label="상자 중심 x" value={c[0]} min={-lim} max={lim} step={0.05} onChange={(x) => setC([x, c[1]])} format={(x) => nf(x)} />
          <Slider id="vt-cy" label="상자 중심 y" value={c[1]} min={-lim} max={lim} step={0.05} onChange={(y) => setC([c[0], y])} format={(x) => nf(x)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="빠져나가는 양" value={nf(out, 3)} />
            <Readout label="넓이 h²" value={nf(h * h, 3)} />
            <Readout label="나눈 값 (근사)" value={nf(est, 3)} color="var(--accent)" />
            <Readout label="발산 (정확한 값)" value={nf(exact, 3)} color="var(--pos)" />
          </div>
          <div className="vt-tex">
            <M>{`\\nabla\\cdot\\mathbf F = \\frac{\\partial P}{\\partial x} + \\frac{\\partial Q}{\\partial y}`}</M>
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '나가는 쪽 / 발산 > 0', shape: 'sq' },
          { color: 'var(--neg)', label: '들어오는 쪽 / 발산 < 0', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: curl as the spin of a paddle wheel ─────────────── */

/** Circulation along each edge of the square, counter-clockwise: right (up), top (left), left (down), bottom (right). */
function edgeCirculation(f: Field, c: V2, h: number): number[] {
  const a = h / 2;
  const [x, y] = c;
  const corners: V2[] = [[x + a, y - a], [x + a, y + a], [x - a, y + a], [x - a, y - a]];
  return [0, 1, 2, 3].map((k) => lineIntegral(f, segment(corners[k], corners[(k + 1) % 4], 60)));
}

function CurlFigure() {
  const P = usePalette();
  const [fid, setFid] = useState<FieldId>('wave');
  const [c, setC] = useState<V2>([0, 2.2]);
  const [h, setH] = useState(1);
  const [heat, setHeat] = useState(true);
  const [active, setActive] = useState(false);
  const f = FIELDS[fid];
  const ec = edgeCirculation(f, c, h);
  const circ = ec.reduce((a, b) => a + b, 0);
  const est = circ / (h * h);
  const exact = f.curl(c[0], c[1]);
  const scale = useMemo(() => maxAbs(f.curl), [f]);
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const angle = useRef(0);
  const [, setTick] = useState(0);
  const viewRef = useRef<View | null>(null);

  // a small wheel in the flow turns at half the curl (radians per unit time); shown three times faster
  useAnimationFrame((dt) => {
    angle.current += (exact / 2) * 3 * Math.min(dt, 0.05);
    setTick((t) => t + 1);
  }, inView && !still && Math.abs(exact) > 1e-3);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: H }) => {
      const v = makeView(w, H, R);
      viewRef.current = v;
      drawFrame(ctx, v, P);
      if (heat) drawHeat(ctx, v, f.curl, P, Math.max(scale, 0.5));
      drawArrows(ctx, v, f, P.ink3, 15);
      drawBox(ctx, v, P, c, h);
      // the push along each edge, in the counter-clockwise sense
      const a = h / 2;
      const mids: V2[] = [[c[0] + a, c[1]], [c[0], c[1] + a], [c[0] - a, c[1]], [c[0], c[1] - a]];
      const dirs: V2[] = [[0, 1], [-1, 0], [0, -1], [1, 0]];
      const big = Math.max(0.05, ...ec.map(Math.abs));
      ec.forEach((q, k) => {
        if (Math.abs(q) < 1e-3) return;
        const L = 8 + (Math.abs(q) / big) * 22;
        const sx = v.X(mids[k][0]), sy = v.Y(mids[k][1]);
        const sg = Math.sign(q);
        const dx = dirs[k][0] * sg, dy = -dirs[k][1] * sg;
        arrowPx(ctx, sx - (dx * L) / 2, sy - (dy * L) / 2, sx + (dx * L) / 2, sy + (dy * L) / 2, q > 0 ? P.pos : P.neg, 3, 9);
      });
      // the paddle wheel
      const cx = v.X(c[0]), cy = v.Y(c[1]);
      const r = Math.max(10, Math.min(h * v.s * 0.32, 34));
      const th = still ? 0 : angle.current;
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2.5;
      for (let k = 0; k < 4; k++) {
        const t = th + (k * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        // canvas y points down, so a positive (counter-clockwise) angle subtracts
        ctx.lineTo(cx + r * Math.cos(t), cy - r * Math.sin(t));
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + r * Math.cos(t), cy - r * Math.sin(t), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = P.accent;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = active ? P.accent : P.ink;
      ctx.fill();
      if (Math.abs(exact) > 1e-3) {
        // a curved arrow showing which way it turns
        const rr = r + 8;
        const ccw = exact > 0;
        ctx.strokeStyle = alpha(P.accent, 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, -Math.PI * 0.15, -Math.PI * 0.75, true);
        ctx.stroke();
        const endA = ccw ? -Math.PI * 0.75 : -Math.PI * 0.15;
        const ex = cx + rr * Math.cos(endA), ey = cy + rr * Math.sin(endA);
        const tdir = ccw ? endA - Math.PI / 2 : endA + Math.PI / 2;
        arrowPx(ctx, ex - Math.cos(tdir) * 6, ey - Math.sin(tdir) * 6, ex + Math.cos(tdir) * 2, ey + Math.sin(tdir) * 2, alpha(P.accent, 0.9), 2, 8);
      }
    },
    [P, f, c, h, heat, ec, active, scale, angle.current, still, exact],
    { aspect: 1, maxHeight: 460, minHeight: 200 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      const v = viewRef.current;
      if (!v) return null;
      return Math.abs(v.ix(x) - c[0]) <= Math.max(h / 2, 0.25) && Math.abs(v.iy(y) - c[1]) <= Math.max(h / 2, 0.25) ? 'c' : null;
    },
    onDrag: (_, x, y) => {
      setActive(true);
      setC(clampIn(viewRef.current!, x, y, h / 2 + 0.02));
    },
    onEnd: () => setActive(false),
  });

  const lim = R - h / 2 - 0.02;
  const turn = Math.abs(exact) < 1e-3 ? '돌지 않음' : exact > 0 ? '시계 반대 방향' : '시계 방향';
  return (
    <Figure
      no={2}
      title="흐름 속의 작은 바람개비"
      hint="바람개비를 끌고 다니며 도는 방향을 보세요"
      caption={<>상자의 네 변 화살표는 그 변을 시계 반대 방향으로 따라갈 때 F가 미는 양(그 변의 선적분)입니다. 주황은 시계 반대 방향으로, 파랑은 시계 방향으로 밉니다. 네 값을 더한 것이 상자 둘레의 순환이고, 넓이로 나누면 회전에 가까워집니다. 바람개비는 그 점의 회전의 절반인 각속도로 돌도록 그렸고, 보기 쉽게 세 배 빠르게 재생합니다. 바탕색은 회전의 정확한 값입니다.</>}
    >
      <div className="controls row">
        <Seg label="벡터장" value={fid} onChange={setFid} options={fieldOptions()} />
        <Check label="회전 바탕색" checked={heat} onChange={setHeat} />
      </div>
      <div className="fig-split" ref={outer}>
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`${f.name} 벡터장 위의 바람개비, 중심 ${vs(c)}, 상자 한 변 ${nf(h)}. 둘레의 순환 ${nf(circ, 3)}, 넓이로 나눈 값 ${nf(est, 3)}, 그 점의 회전 ${nf(exact, 3)}. 바람개비는 ${turn}으로 돕니다.`} />
        </div>
        <div className="controls">
          <Slider id="vt2-h" label="상자 한 변 h" value={h} min={0.1} max={2} step={0.05} onChange={(x) => { setH(x); setC([Math.max(-R + x / 2, Math.min(R - x / 2, c[0])), Math.max(-R + x / 2, Math.min(R - x / 2, c[1]))]); }} format={(x) => nf(x)} />
          <Slider id="vt2-cx" label="중심 x" value={c[0]} min={-lim} max={lim} step={0.05} onChange={(x) => setC([x, c[1]])} format={(x) => nf(x)} />
          <Slider id="vt2-cy" label="중심 y" value={c[1]} min={-lim} max={lim} step={0.05} onChange={(y) => setC([c[0], y])} format={(x) => nf(x)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="둘레의 순환" value={nf(circ, 3)} />
            <Readout label="넓이 h²" value={nf(h * h, 3)} />
            <Readout label="나눈 값 (근사)" value={nf(est, 3)} color="var(--accent)" />
            <Readout label="회전 (정확한 값)" value={nf(exact, 3)} color="var(--pos)" />
          </div>
          <div className="mv-note" aria-live="polite">
            바람개비가 <strong>{turn}</strong>{Math.abs(exact) < 1e-3 ? '입니다.' : '으로 돕니다.'}
          </div>
          <div className="vt-tex">
            <M>{`\\operatorname{rot}\\mathbf F = \\frac{\\partial Q}{\\partial x} - \\frac{\\partial P}{\\partial y}`}</M>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: Green's theorem on a region you shape ─────────────── */

const START: V2[] = [[-2, -1], [0.5, -2], [2.2, -0.5], [1.5, 1.6], [-1, 1.8]];

function GreenFigure() {
  const P = usePalette();
  const [fid, setFid] = useState<FieldId>('wave');
  const [form, setForm] = useState<'circ' | 'flux'>('circ');
  const [pts, setPts] = useState<V2[]>(START);
  const [active, setActive] = useState<number | null>(null);
  const f = FIELDS[fid];
  const raw = useMemo(() => closedSpline(pts, 60), [pts]);
  const area = signedArea(raw);
  // integrate counter-clockwise whichever way the reader drew it
  const path = useMemo(() => (area >= 0 ? raw : raw.slice().reverse()), [raw, area]);
  const boundary = form === 'circ' ? lineIntegral(f, path) : flux(f, path);
  const g = form === 'circ' ? f.curl : f.div;
  const inner = useMemo(() => areaIntegral(g, path, 0.005, 0.02), [g, path]);
  const scale = useMemo(() => maxAbs(g), [g]);
  const viewRef = useRef<View | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const v = makeView(w, h, R);
      viewRef.current = v;
      drawFrame(ctx, v, P);
      // the integrand, shaded only inside the region
      ctx.save();
      ctx.beginPath();
      path.forEach(([x, y], i) => (i ? ctx.lineTo(v.X(x), v.Y(y)) : ctx.moveTo(v.X(x), v.Y(y))));
      ctx.clip();
      drawHeat(ctx, v, g, P, Math.max(scale, 0.5), 60, 0.55);
      ctx.restore();
      drawArrows(ctx, v, f, P.ink3, 15);
      drawPath(ctx, v, path, P.ink, 2.5);
      if (form === 'circ') pathArrows(ctx, v, path, P.ink, 4);
      else {
        // outward normals at a few points
        for (let k = 0; k < 10; k++) {
          const i = Math.floor((k * (path.length - 1)) / 10);
          const [x0, y0] = path[i], [x1, y1] = path[Math.min(path.length - 1, i + 2)];
          const L = Math.hypot(x1 - x0, y1 - y0) || 1;
          const n: V2 = [(y1 - y0) / L, -(x1 - x0) / L];
          arrowPx(ctx, v.X(x0), v.Y(y0), v.X(x0 + n[0] * 0.35), v.Y(y0 + n[1] * 0.35), P.ink2, 1.6, 6);
        }
      }
      pts.forEach((p, i) => handle(ctx, v, P, p, P.accent, '', active === i));
    },
    [P, f, path, g, form, pts, active, scale],
    { aspect: 1, maxHeight: 460, minHeight: 200 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      const id = hitHandle(viewRef.current, x, y, pts.map((p, i) => [String(i), p] as [string, V2]));
      return id === null ? null : Number(id);
    },
    onDrag: (id, x, y) => {
      const i = Number(id);
      setActive(i);
      const p = clampIn(viewRef.current!, x, y, 0.1);
      setPts(pts.map((q, k) => (k === i ? p : q)));
    },
    onEnd: () => setActive(null),
  });

  const match = Math.abs(boundary - inner) < 0.01 + 0.002 * Math.abs(inner);
  return (
    <Figure
      no={3}
      title="경계를 한 바퀴 도는 양 = 안쪽을 모두 더한 양"
      hint="파란 점을 끌어 영역의 모양을 바꿔 보세요"
      caption={<>영역의 경계는 파란 점 다섯 개를 지나는 매끄러운 닫힌 곡선이고, 언제나 시계 반대 방향으로 돕니다. 순환 형태에서는 안쪽을 회전으로, 유출 형태에서는 발산으로 칠했습니다(주황이 양수, 파랑이 음수). 경계 적분은 곡선을 조각 300개로 나눠, 넓이 적분은 가로줄 0.005 간격으로 나눠 따로 계산했습니다. 곡선이 스스로 교차하게 끌면 영역이 꼬여 두 값이 어긋날 수 있습니다.</>}
    >
      <div className="controls row">
        <Seg label="벡터장" value={fid} onChange={setFid} options={fieldOptions()} />
        <Seg label="형태" value={form} onChange={setForm} options={[{ value: 'circ', label: '순환과 회전' }, { value: 'flux', label: '유출과 발산' }]} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`${f.name} 벡터장 위의 닫힌 영역, 넓이 ${nf(Math.abs(area))}. ${form === 'circ' ? `경계를 도는 순환 ${nf(boundary)}, 안쪽 회전의 적분 ${nf(inner)}.` : `경계를 빠져나가는 양 ${nf(boundary)}, 안쪽 발산의 적분 ${nf(inner)}.`}`} />
        </div>
        <div className="controls">
          <div className="vt-tex">
            {form === 'circ' ? (
              <M>{`\\oint_{\\partial D} \\mathbf F\\cdot d\\mathbf r = \\iint_D \\Big(\\frac{\\partial Q}{\\partial x} - \\frac{\\partial P}{\\partial y}\\Big)\\, dA`}</M>
            ) : (
              <M>{`\\oint_{\\partial D} \\mathbf F\\cdot \\mathbf n\\, ds = \\iint_D \\Big(\\frac{\\partial P}{\\partial x} + \\frac{\\partial Q}{\\partial y}\\Big)\\, dA`}</M>
            )}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label={form === 'circ' ? '경계를 도는 순환 (왼쪽)' : '경계를 빠져나가는 양 (왼쪽)'} value={nf(boundary)} color="var(--accent)" />
            <Readout label={form === 'circ' ? '안쪽 회전의 합 (오른쪽)' : '안쪽 발산의 합 (오른쪽)'} value={nf(inner)} color="var(--pos)" />
            <Readout label="영역의 넓이" value={nf(Math.abs(area))} />
          </div>
          <div className="mv-note" data-good={match || undefined} data-bad={!match || undefined} aria-live="polite">
            {match ? '두 값이 같습니다. 경계만 보고 안쪽의 합을 알 수 있습니다.' : '두 값이 어긋납니다. 곡선이 스스로 교차하지 않는지 확인해 보세요.'}
          </div>
          <button type="button" className="btn small" onClick={() => setPts(START)}>
            처음 모양으로
          </button>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: the same idea in space ─────────────── */

type Pt3 = [number, number, number];

function ThreeDFigure() {
  const P = usePalette();
  const [mode, setMode] = useState<'stokes' | 'div'>('stokes');
  const [t, setT] = useState(1);
  const [a, setA] = useState(1.5);
  const [cx, setCx] = useState(0.5);
  const circ = useMemo(() => lineIntegral(FIELDS.rotation, circle(0, 0, 1, 800)), []);
  const cap = useMemo(() => capCurlFlux(t), [t]);
  const cube = useMemo(() => cubeFlux(a, cx), [a, cx]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const s = Math.min(w / 4.6, h / 3.6);
      const ox = w / 2, oy = h * (mode === 'stokes' ? 0.66 : 0.55);
      // cabinet projection: x to the right, y into the page (up and to the right), z up
      const pr = (p: Pt3): [number, number] => [ox + s * (p[0] + 0.42 * p[1]), oy - s * (p[2] + 0.3 * p[1])];
      const line = (pts: Pt3[], color: string, width = 1, dash: number[] = []) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        pts.forEach((p, i) => {
          const [x, y] = pr(p);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      };
      const arrow3 = (p: Pt3, d: Pt3, color: string, width = 2) => {
        const [x1, y1] = pr(p);
        const [x2, y2] = pr([p[0] + d[0], p[1] + d[1], p[2] + d[2]]);
        arrowPx(ctx, x1, y1, x2, y2, color, width, 8);
      };
      // axes
      line([[-1.9, 0, 0], [1.9, 0, 0]], alpha(P.ink3, 0.5), 1, [3, 4]);
      line([[0, -1.6, 0], [0, 1.6, 0]], alpha(P.ink3, 0.5), 1, [3, 4]);
      if (mode === 'stokes') {
        // the cap z = t(1 − r²): rings and meridians
        for (let i = 1; i <= 5; i++) {
          const r = i / 5;
          const ring: Pt3[] = [];
          for (let k = 0; k <= 72; k++) {
            const th = (2 * Math.PI * k) / 72;
            ring.push([r * Math.cos(th), r * Math.sin(th), t * (1 - r * r)]);
          }
          line(ring, alpha(P.accent, i === 5 ? 0 : 0.45), 1);
        }
        for (let k = 0; k < 12; k++) {
          const th = (2 * Math.PI * k) / 12;
          const mer: Pt3[] = [];
          for (let i = 0; i <= 20; i++) {
            const r = i / 20;
            mer.push([r * Math.cos(th), r * Math.sin(th), t * (1 - r * r)]);
          }
          line(mer, alpha(P.accent, 0.45), 1);
        }
        // curl F = (0, 0, 1) piercing the surface
        for (const [r, th] of [[0, 0], [0.55, 0.3], [0.55, 2.4], [0.55, 4.4]] as [number, number][]) {
          arrow3([r * Math.cos(th), r * Math.sin(th), t * (1 - r * r)], [0, 0, 0.55], P.pos, 2.2);
        }
        // the boundary circle, counter-clockwise seen from above
        const bd: Pt3[] = [];
        for (let k = 0; k <= 120; k++) {
          const th = (2 * Math.PI * k) / 120;
          bd.push([Math.cos(th), Math.sin(th), 0]);
        }
        line(bd, P.ink, 2.6);
        for (const th of [0.4, 2.5, 4.4]) {
          const p: Pt3 = [Math.cos(th), Math.sin(th), 0];
          arrow3(p, [-Math.sin(th) * 0.3, Math.cos(th) * 0.3, 0], P.ink, 2.4);
        }
      } else {
        const hA = a / 2;
        const V = (x: number, y: number, z: number): Pt3 => [cx + x * hA, y * hA, z * hA];
        const E: [Pt3, Pt3][] = [];
        for (const [u, v2] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          E.push([V(-1, u, v2), V(1, u, v2)], [V(u, -1, v2), V(u, 1, v2)], [V(u, v2, -1), V(u, v2, 1)]);
        }
        for (const [p, q] of E) line([p, q], P.ink2, 1.6);
        const centers: Pt3[] = [V(1, 0, 0), V(-1, 0, 0), V(0, 1, 0), V(0, -1, 0), V(0, 0, 1), V(0, 0, -1)];
        const normals: Pt3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        const big = Math.max(0.05, ...cube.faces.map(Math.abs));
        cube.faces.forEach((q, k) => {
          const L = 0.15 + (Math.abs(q) / big) * 0.7;
          const n = normals[k];
          const c0 = centers[k];
          if (Math.abs(q) < 1e-3) return;
          if (q > 0) arrow3(c0, [n[0] * L, n[1] * L, n[2] * L], P.pos, 2.6);
          else arrow3([c0[0] + n[0] * L, c0[1] + n[1] * L, c0[2] + n[2] * L], [-n[0] * L, -n[1] * L, -n[2] * L], P.neg, 2.6);
        });
        // where x = 0 is, to show the cube sliding along x
        const [zx, zy] = pr([0, 0, 0]);
        ctx.fillStyle = P.ink3;
        ctx.font = `10px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.fillText('x = 0', zx, zy + 14);
      }
    },
    [P, mode, t, a, cx, cube],
    { aspect: 1.35, maxHeight: 400, minHeight: 200 },
  );

  return (
    <Figure
      no={4}
      title="공간에서: 스토크스 정리와 발산 정리"
      hint="모양을 바꿔도 두 값이 같이 움직이는지 보세요"
      caption={
        mode === 'stokes' ? (
          <>벡터장은 F = (−y/2, x/2, 0)으로, 회전이 어디서나 위쪽 (0, 0, 1)입니다. 경계는 바닥의 단위원(검정)으로 고정하고, 그 원을 테두리로 하는 곡면 z = t(1 − x² − y²)를 높이 t만큼 부풀립니다. 곡면을 뚫는 회전의 양은 곡면을 작은 삼각형 21,600개로 나눠 더했습니다.</>
        ) : (
          <>벡터장은 F = (x²/2, y/2, z/2)이고 발산은 x + 1입니다. 한 변 a인 정육면체를 x축을 따라 옮길 수 있습니다. 여섯 면마다 그 면을 통해 나가는 양을 화살표로 그렸습니다(주황은 나감, 파랑은 들어옴). 면마다 20 × 20 격자로 적분했습니다.</>
        )
      }
    >
      <div className="controls row">
        <Seg label="정리" value={mode} onChange={setMode} options={[{ value: 'stokes', label: '스토크스 정리' }, { value: 'div', label: '발산 정리' }]} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} role="img" aria-label={mode === 'stokes' ? `단위원을 테두리로 하는 곡면, 높이 ${nf(t)}. 테두리를 도는 순환 ${nf(circ, 3)}, 곡면을 뚫는 회전의 양 ${nf(cap, 3)}.` : `한 변 ${nf(a)}, 중심 x = ${nf(cx)}인 정육면체. 여섯 면으로 나가는 양의 합 ${nf(cube.total, 3)}, 안쪽 발산의 합 ${nf(cube.volume, 3)}.`} />
        </div>
        <div className="controls">
          {mode === 'stokes' ? (
            <>
              <div className="vt-tex">
                <M>{`\\oint_{\\partial S} \\mathbf F\\cdot d\\mathbf r = \\iint_S (\\nabla\\times\\mathbf F)\\cdot \\mathbf n\\, dS`}</M>
              </div>
              <Slider id="vt4-t" label="곡면의 높이 t" value={t} min={0} max={2} step={0.05} onChange={setT} format={(x) => nf(x)} />
              <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
                <Readout label="테두리를 도는 순환" value={nf(circ, 3)} color="var(--accent)" />
                <Readout label="곡면을 뚫는 회전의 양" value={nf(cap, 3)} color="var(--pos)" />
              </div>
            </>
          ) : (
            <>
              <div className="vt-tex">
                <M>{`\\oiint_{\\partial V} \\mathbf F\\cdot \\mathbf n\\, dS = \\iiint_V \\nabla\\cdot\\mathbf F\\, dV`}</M>
              </div>
              <Slider id="vt4-a" label="한 변 a" value={a} min={0.5} max={2} step={0.05} onChange={setA} format={(x) => nf(x)} />
              <Slider id="vt4-c" label="중심 x" value={cx} min={-1} max={1} step={0.05} onChange={setCx} format={(x) => nf(x)} />
              <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
                <Readout label="여섯 면으로 나가는 양의 합" value={nf(cube.total, 2)} color="var(--accent)" />
                <Readout label="안쪽 발산의 합" value={nf(cube.volume, 2)} color="var(--pos)" />
              </div>
              <div className="vt-faces" aria-label="면마다 나가는 양">
                {['+x', '−x', '+y', '−y', '+z', '−z'].map((nm, k) => (
                  <span key={nm}>
                    <b>{nm}</b> {nf(cube.faces[k], 2)}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function VectorTheorems() {
  return (
    <>
      <h2>한 점에서 흐름을 재는 두 가지 방법</h2>
      <p>
        <a href={lessonHref('math-multivariable', 'line-integrals')}>앞 장</a>에서는 길을 따라 벡터장을 더했습니다. 이번에는 거꾸로 아주 작은 영역으로 좁혀 들어가, 한 점에서 흐름이 무엇을 하는지 잽니다. 물이 흐르는 수면 위 한 점에 시선을 고정하면 두 가지를 물을 수 있습니다. 그 점에서 물이 솟아나거나 빨려 들어가는가, 그리고 그 점에서 물이 소용돌이치는가. 앞의 것이 <T en="divergence">발산</T>, 뒤의 것이 <T en="curl">회전</T>입니다.
      </p>

      <h2>작은 상자로 재는 발산</h2>
      <p>
        점 주위에 한 변 h인 작은 정사각형 상자를 놓고, 상자의 네 변을 통해 빠져나가는 양을 더합니다. 들어오는 것보다 나가는 것이 많으면 상자 안 어딘가에서 물이 생겨나고 있다는 뜻입니다. 이 양을 상자의 넓이 h²으로 나누고 h를 0으로 보낸 극한이 그 점의 발산입니다. 계산해 보면 이 극한은 편미분 두 개의 합이 됩니다.
      </p>
      <MB>{'\\nabla\\cdot\\mathbf F = \\lim_{h\\to 0} \\frac{1}{h^2} \\oint_{\\text{상자}} \\mathbf F\\cdot\\mathbf n\\, ds = \\frac{\\partial P}{\\partial x} + \\frac{\\partial Q}{\\partial y}'}</MB>
      <p>
        오른쪽 변과 왼쪽 변을 지나는 양의 차이는 P가 x 방향으로 얼마나 변하는지, 위쪽 변과 아래쪽 변의 차이는 Q가 y 방향으로 얼마나 변하는지를 잽니다. 그림 1에서 확인해 보세요.
      </p>
      <DivergenceFigure />
      <p>
        처음 설정은 언덕의 경사 벡터장에서 중심 (1, 0.5), 한 변 1인 상자입니다. 오른쪽 변으로 0.06이 나가고, 위쪽 변으로 0.68, 왼쪽 변으로 0.74가 들어와서, 빠져나가는 양은 −1.358입니다. 넓이가 1이므로 나눈 값도 −1.358이고, 그 점의 정확한 발산 −2 sin 1 cos 0.5 = −1.477과는 아직 꽤 다릅니다. h를 0.5로 줄이면 −1.446, 0.1로 줄이면 −1.476으로 정확한 값에 다가갑니다. 발산이 음수인 곳은 흐름이 모여드는 곳, 언덕 꼭대기 쪽입니다.
      </p>
      <Callout kind="note">
        샘 벡터장은 발산이 어디서나 1입니다. 원점에서만 물이 나오는 것처럼 보이지만, 화살표가 바깥으로 갈수록 길어지므로 어느 상자를 잡아도 나가는 쪽 변의 화살표가 들어오는 쪽보다 조금 깁니다. 발산은 그 점의 화살표가 바깥을 향하는지가 아니라, 주변에서 화살표가 얼마나 퍼지는지를 잽니다.
      </Callout>

      <h2>작은 바람개비로 재는 회전</h2>
      <p>
        같은 상자의 둘레를 시계 반대 방향으로 한 바퀴 돌며 선적분을 구하면, 흐름이 상자 둘레를 얼마나 돌리는지를 잽니다. 이것을 <T en="circulation">순환</T>이라고 합니다. 순환을 넓이로 나눈 극한이 회전입니다.
      </p>
      <MB>{'\\operatorname{rot}\\mathbf F = \\lim_{h\\to 0} \\frac{1}{h^2} \\oint_{\\text{상자}} \\mathbf F\\cdot d\\mathbf r = \\frac{\\partial Q}{\\partial x} - \\frac{\\partial P}{\\partial y}'}</MB>
      <p>
        앞 장 끝에서 퍼텐셜이 있으려면 0이어야 한다던 바로 그 양입니다. 흐름 위에 작은 바람개비를 띄우면 회전이 양수인 곳에서 시계 반대 방향으로, 음수인 곳에서 시계 방향으로 돕니다. 정확히는 회전의 절반인 각속도로 돕니다.
      </p>
      <CurlFigure />
      <p>
        처음 설정은 물결 흐름에서 중심 (0, 2.2)입니다. 한 변 1인 상자 둘레의 순환은 0.914이고, 그 점의 정확한 회전은 0.6 cos 0 − 0.6 cos 2.2 = 0.953입니다. h를 0.1로 줄이면 근사가 0.953으로 맞습니다. 바람개비를 (−2.2, 0)으로 끌고 가면 회전이 −0.953이 되어 반대로 돕니다.
      </p>
      <p>
        <strong>소용돌이</strong>로 바꿔 보면 의외의 모습이 보입니다. 회전이 어디서나 1이라서, 바람개비를 중심에서 멀리 가져가도 똑같은 빠르기로 돕니다. 흐름 전체가 한 덩어리로 도는 회전목마처럼, 바깥쪽은 빨리 움직이고 안쪽은 천천히 움직여서 어느 자리에서나 바람개비를 같은 세기로 비틉니다. 반대로 욕조 배수구 둘레의 물에 가까운 벡터장 (−y, x)/(x² + y²)는 입자가 원을 그리며 도는데도 원점이 아닌 모든 곳에서 회전이 0입니다. 바깥쪽 물이 안쪽보다 느려서, 바람개비의 양쪽 날개에 걸리는 힘이 맞비기기 때문입니다.
      </p>

      <h2>경계만 보고 안을 안다: 그린 정리</h2>
      <p>
        이제 영역 하나를 작은 정사각형 수천 개로 잘게 나눈다고 생각해 봅시다. 정사각형마다 둘레의 순환은 대략 (회전) × (넓이)입니다. 이것을 모두 더하면 이웃한 두 정사각형이 함께 쓰는 변은 한쪽에서는 위로, 다른 쪽에서는 아래로 지나가므로 서로 지워지고, 영역의 바깥 경계만 남습니다. 그래서 안쪽 회전의 합은 바깥 경계의 순환과 같습니다. 이것이 <T en="Green's theorem">그린 정리</T>입니다.
      </p>
      <MB note="D의 경계는 시계 반대 방향으로 돕니다">{'\\oint_{\\partial D} P\\,dx + Q\\,dy = \\iint_D \\Big(\\frac{\\partial Q}{\\partial x} - \\frac{\\partial P}{\\partial y}\\Big)\\, dA'}</MB>
      <p>
        발산으로 같은 일을 하면 유출 형태가 나옵니다. 안쪽 발산의 합은 경계를 빠져나가는 양과 같습니다. 그림 3에서 영역의 모양을 마음대로 바꾸며 두 값을 따로 계산해 비교해 보세요.
      </p>
      <GreenFigure />
      <p>
        처음 영역의 넓이는 13.62입니다. 물결 흐름에서 경계를 도는 순환은 −0.32이고, 안쪽 회전을 모두 더한 값도 −0.32입니다. 안쪽에 주황(양의 회전)과 파랑(음의 회전)이 섞여 있어 대부분 지워지고 작은 값만 남습니다. 유출 형태로 바꾸면 발산이 어디서나 0.15이므로 안쪽 합은 0.15 × 13.62 = 2.04이고, 경계를 빠져나가는 양도 2.04입니다. 소용돌이를 고르면 회전이 어디서나 1이라서 순환이 넓이 13.62와 같아집니다. 앞 장의 닫힌 길에서 일이 넓이 4와 같았던 것도 같은 이유입니다(그 길은 시계 방향이라 부호가 반대였습니다).
      </p>
      <Callout kind="intuition">
        그린 정리를 거꾸로 쓰면 경계만 따라가서 넓이를 잴 수 있습니다. 회전이 어디서나 1인 벡터장 (−y/2, x/2)를 고르면 순환이 곧 넓이이므로, 넓이 = ½∮(x dy − y dx)입니다. 꼭짓점 좌표로 다각형의 넓이를 구하는 신발끈 공식이 바로 이 식이고, 그림 3의 넓이도 이 방법으로 계산했습니다.
      </Callout>

      <h2>공간으로: 스토크스 정리와 발산 정리</h2>
      <p>
        3차원에서는 회전이 벡터가 됩니다. 바람개비를 어느 방향 축에 꽂느냐에 따라 도는 세기가 다르기 때문입니다. 회전 벡터 ∇ × F의 방향은 바람개비가 가장 세게 도는 축이고, 크기는 그때의 세기입니다. 그린 정리의 평면 영역을 공간의 곡면으로 바꾸면 <T en="Stokes' theorem">스토크스 정리</T>가 됩니다. 곡면을 뚫고 지나가는 회전의 양은 곡면의 테두리를 도는 순환과 같습니다. 놀라운 점은 테두리만 같으면 곡면이 어떤 모양이든 상관없다는 것입니다.
      </p>
      <p>
        유출 형태는 <T en="divergence theorem">발산 정리</T>가 됩니다. 닫힌 곡면으로 둘러싸인 부피 안의 발산을 모두 더한 것은 곡면 전체를 통해 빠져나가는 양과 같습니다. 그림 4에서 두 정리를 확인해 보세요.
      </p>
      <ThreeDFigure />
      <p>
        스토크스 정리 쪽에서 테두리 단위원을 도는 순환은 π = 3.142입니다. 곡면을 평평한 원판(t = 0)으로 두어도, 높이 2까지 부풀려도 곡면을 뚫는 회전의 양은 3.141로 같습니다(작은 차이는 원을 360각형으로 근사한 탓입니다). 회전이 위로 일정하니 곡면이 높이 솟으면 옆으로 기운 부분이 늘지만, 기울어진 만큼 위쪽 성분이 줄어서 합은 바닥의 그림자 넓이 π로 정해집니다. 발산 정리 쪽에서 처음 정육면체(한 변 1.5, 중심 x = 0.5)의 여섯 면으로 나가는 양을 더하면 5.06이고, 발산 x + 1을 부피 안에서 더한 값도 (0.5 + 1) × 1.5³ = 5.06입니다. 정육면체를 x가 −1인 쪽으로 옮기면 발산이 0에 가까워지고, 나가는 양도 함께 줄어듭니다.
      </p>

      <h2>물리와 그래픽스에서</h2>
      <p>
        전자기학의 기본 법칙인 맥스웰 방정식은 이 두 연산자로 적습니다. 전기장의 발산은 그 점의 전하 밀도에 비례하고(가우스 법칙), 전기장의 회전은 자기장이 시간에 따라 변하는 빠르기에 음의 부호를 붙인 것과 같습니다(패러데이 법칙). 발산 정리를 쓰면 가우스 법칙은 "닫힌 곡면을 빠져나가는 전기장의 양은 안에 든 전하량에 비례한다"로 바뀌고, 스토크스 정리를 쓰면 패러데이 법칙은 "도선 고리를 도는 전압은 고리를 뚫는 자기장의 양이 변하는 빠르기와 크기가 같다"로 바뀝니다. 발전기와 변압기가 이 원리로 동작합니다.
      </p>
      <p>
        영화와 게임의 물, 연기, 불 시뮬레이션도 같은 도구를 씁니다. 물처럼 압축되지 않는 유체는 어디서나 발산이 0이어야 합니다. 시뮬레이션은 한 단계마다 속도장을 움직인 뒤 생긴 발산을 계산하고, 그 발산을 없애는 압력을 풀어 속도장을 고칩니다. 연기가 말려 올라가는 모양을 살리려고 회전이 큰 곳을 일부러 더 세게 만들기도 합니다.
      </p>

      <Callout kind="key">
        발산 ∂P/∂x + ∂Q/∂y는 한 점 주위의 작은 상자에서 빠져나가는 양을 넓이로 나눈 극한이고, 회전 ∂Q/∂x − ∂P/∂y는 작은 상자 둘레의 순환을 넓이로 나눈 극한입니다. 영역을 작은 상자로 나눠 더하면 안쪽 경계가 서로 지워져서, 그린 정리(경계의 순환 = 안쪽 회전의 합, 경계의 유출 = 안쪽 발산의 합)가 나옵니다. 공간에서는 같은 생각이 스토크스 정리와 발산 정리가 되고, 테두리만 같으면 곡면의 모양과 상관없이 결과가 같습니다.
      </Callout>
      <Quiz
        q="회전이 어디서나 2인 평면 벡터장이 있다. 넓이 3인 원 모양 영역의 경계를 시계 방향으로 한 바퀴 돌 때의 선적분은?"
        options={['6', '−6', '0', '3']}
        answer={1}
        explain={<>그린 정리에 따르면 시계 반대 방향으로 돌 때의 순환은 안쪽 회전의 합 2 × 3 = 6입니다. 시계 방향으로 돌면 모든 조각의 방향이 뒤집혀 부호가 바뀌므로 −6입니다. 회전이 0이 아니므로 0이 될 수 없고, 넓이만 곱한 3은 회전의 크기를 빠뜨린 값입니다.</>}
      />
    </>
  );
}
