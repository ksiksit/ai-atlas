import { useRef, useState, type RefObject } from 'react';
import { Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { arrow2, dot3, drawContours, drawPath3, drawSurface, levelsFor, mapBox, nf, presets, type PresetId, type V2, type View } from './surface';
import './multivariable.css';
import './partials.css';

const PRESET_OPTS: { value: PresetId; label: string }[] = [
  { value: 'bowl', label: '그릇' },
  { value: 'saddle', label: '말안장' },
  { value: 'hills', label: '두 봉우리' },
];
const DEG = Math.PI / 180;
const clampBox = (v: number) => Math.max(-1.9, Math.min(1.9, v));

/** Drag anywhere on the canvas to turn the view. */
function useOrbit(ref: RefObject<HTMLDivElement>, view: View, setView: (v: View) => void) {
  const last = useRef<V2 | null>(null);
  useDrag(ref, {
    hit: () => 'orbit',
    onDrag: (_id, x, y) => {
      if (last.current) {
        const dx = x - last.current[0], dy = y - last.current[1];
        setView({ yaw: view.yaw - dx * 0.01, pitch: Math.max(0.15, Math.min(1.45, view.pitch + dy * 0.008)) });
      }
      last.current = [x, y];
    },
    onEnd: () => {
      last.current = null;
    },
  });
}

/* ─────────────── Figure 1: slicing the surface ─────────────── */

function SliceFigure() {
  const P = usePalette();
  const [pid, setPid] = useState<PresetId>('bowl');
  const [a, setA] = useState(1);
  const [b, setB] = useState(1);
  const [dir, setDir] = useState<'x' | 'y'>('x');
  const [view, setView] = useState<View>({ yaw: 0.55, pitch: 0.62 });
  const fn = presets[pid];
  const box = fn.box;
  const z = fn.f(a, b);
  const [fx, fy] = fn.grad(a, b);
  const slope = dir === 'x' ? fx : fy;
  const C = dir === 'x' ? P.neg : P.pos;

  // the slice through (a, b): vary x with y = b, or vary y with x = a
  const along = (t: number): [number, number, number] => (dir === 'x' ? [t, b, fn.f(t, b)] : [a, t, fn.f(a, t)]);
  const ts = Array.from({ length: 81 }, (_, i) => box.x0 + ((box.x1 - box.x0) * i) / 80);
  const t0 = dir === 'x' ? a : b;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const proj = drawSurface(ctx, P, fn, box, view, w, h, { n: 24 });
      // the cutting plane's outline on the floor and the slice curve on the surface
      const ends = dir === 'x' ? [[box.x0, b], [box.x1, b]] : [[a, box.y0], [a, box.y1]];
      drawPath3(ctx, proj, [[ends[0][0], ends[0][1], box.z0], [ends[1][0], ends[1][1], box.z0]], alpha(C, 0.6), 1.5, [5, 4]);
      drawPath3(ctx, proj, ts.map(along).map(([x, y, zz]) => [x, y, Math.max(box.z0, Math.min(box.z1, zz))]), C, 3);
      // the tangent line along the slice
      const L = 0.6;
      const p0 = dir === 'x' ? [a - L, b, z - L * slope] : [a, b - L, z - L * slope];
      const p1 = dir === 'x' ? [a + L, b, z + L * slope] : [a, b + L, z + L * slope];
      drawPath3(ctx, proj, [p0 as [number, number, number], p1 as [number, number, number]], P.ink, 2);
      dot3(ctx, P, proj, a, b, z, P.hl, 6);
    },
    [P, fn, box, view, a, b, dir, z, slope],
    { aspect: 1.15, maxHeight: 400 },
  );
  useOrbit(wrapRef, view, setView);

  const { wrapRef: w2, canvasRef: c2 } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: box.x0, xMax: box.x1, yMin: box.z0, yMax: box.z1, pad: { l: 36, r: 12, t: 12, b: 30 } });
      plot.grid({ xStep: 1, yStep: (box.z1 - box.z0) / 4, labels: true, axes: true, xLabel: dir === 'x' ? 'x' : 'y', fmt: (v) => nf(v, 2) });
      plot.clip();
      plot.fn((t) => along(t)[2], C, 2.5);
      plot.slopeLine(t0, z, slope, P.ink, 1.8);
      plot.unclip();
      plot.dot(t0, z, 5, P.hl, P.surface);
      plot.text(`기울기 ${nf(slope, 3)}`, t0, z, P.ink, { dx: 10, dy: -14, bg: P.surface });
    },
    [P, fn, box, dir, a, b, z, slope],
    { aspect: 1.25, maxHeight: 300 },
  );

  return (
    <Figure
      no={1}
      title="곡면을 한 방향으로 자르면"
      hint="곡면을 끌어 돌려 보세요"
      caption={
        <>
          왼쪽은 곡면 <M>{fn.tex}</M>입니다. 노란 점 <M>{`(a, b)`}</M>를 지나며 {dir === 'x' ? <>y를 <M>b</M>로 고정한</> : <>x를 <M>a</M>로 고정한</>} 평면(바닥의 점선)으로 곡면을 자르면 {dir === 'x' ? '파란' : '주황'} 곡선이 나옵니다. 오른쪽은 그 곡선만 따로 그린 것이고, 검은 직선이 노란 점에서의 접선입니다. 그 기울기가 편미분 <M>{dir === 'x' ? '\\partial f/\\partial x' : '\\partial f/\\partial y'}</M>입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={pid} onChange={setPid} options={PRESET_OPTS} label="곡면" />
        <Seg value={dir} onChange={setDir} options={[{ value: 'x', label: 'y 고정, x만 움직이기' }, { value: 'y', label: 'x 고정, y만 움직이기' }]} label="자르는 방향" />
      </div>
      <div className="pd-pair">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`곡면 ${fn.name}을 점 (${nf(a)}, ${nf(b)})를 지나는 ${dir === 'x' ? 'y 고정' : 'x 고정'} 평면으로 자른 그림. 그 점의 높이는 ${nf(z, 3)}이고 자른 곡선의 기울기는 ${nf(slope, 3)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div ref={w2} className="canvas-box" role="img" aria-label={`자른 곡선의 그래프와 접선. 기울기 ${nf(slope, 3)}.`}>
          <canvas ref={c2} />
        </div>
      </div>
      <div className="controls row">
        <Slider id="pd1-a" label={<>점의 x 좌표 <M>a</M></>} value={a} min={-1.9} max={1.9} step={0.1} onChange={setA} format={(v) => nf(v, 1)} />
        <Slider id="pd1-b" label={<>점의 y 좌표 <M>b</M></>} value={b} min={-1.9} max={1.9} step={0.1} onChange={setB} format={(v) => nf(v, 1)} />
      </div>
      <div className="readouts">
        <Readout label={<M>f(a,b)</M>} value={nf(z, 3)} />
        <Readout label={<M>{'\\partial f/\\partial x'}</M>} value={nf(fx, 3)} color="var(--neg)" />
        <Readout label={<M>{'\\partial f/\\partial y'}</M>} value={nf(fy, 3)} color="var(--pos)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the gradient and every direction ─────────────── */

function GradientFigure() {
  const P = usePalette();
  const [pid, setPid] = useState<PresetId>('bowl');
  const [p, setP] = useState<V2>([1, 1]);
  const [theta, setTheta] = useState(0);
  const [field, setField] = useState(true);
  const fn = presets[pid];
  const box = fn.box;
  const g = fn.grad(p[0], p[1]);
  const gl = Math.hypot(g[0], g[1]);
  const gAng = ((Math.atan2(g[1], g[0]) / DEG) + 360) % 360;
  const u: V2 = [Math.cos(theta * DEG), Math.sin(theta * DEG)];
  const du = g[0] * u[0] + g[1] * u[1];
  const level = fn.f(p[0], p[1]);
  const levels = levelsFor(box, 9);
  const mapRef = useRef<ReturnType<typeof mapBox> | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const m = mapBox(box, w, h, 10);
      mapRef.current = m;
      ctx.fillStyle = P.surface2;
      ctx.fillRect(m.left, m.top, (box.x1 - box.x0) * m.k, (box.y1 - box.y0) * m.k);
      drawContours(ctx, P, fn.f, box, m.to, { levels });
      drawContours(ctx, P, fn.f, box, m.to, { levels: [level], color: P.ink, width: 2 });
      if (field) {
        // gradient arrows on a coarse grid, scaled down so they never overlap
        let gmax = 1e-9;
        const pts: [number, number, V2][] = [];
        for (let i = 0; i <= 8; i++)
          for (let j = 0; j <= 8; j++) {
            const x = box.x0 + 0.25 + (i * (box.x1 - box.x0 - 0.5)) / 8;
            const y = box.y0 + 0.25 + (j * (box.y1 - box.y0 - 0.5)) / 8;
            const gg = fn.grad(x, y);
            gmax = Math.max(gmax, Math.hypot(gg[0], gg[1]));
            pts.push([x, y, gg]);
          }
        const L = (0.42 * m.k) / gmax;
        for (const [x, y, gg] of pts) {
          const s = m.to(x, y);
          arrow2(ctx, s[0], s[1], s[0] + gg[0] * L, s[1] - gg[1] * L, alpha(P.good, 0.75), 1.4, 6);
        }
      }
      const s = m.to(p[0], p[1]);
      // the contour's direction through p: perpendicular to the gradient
      if (gl > 1e-6) {
        const tx = -g[1] / gl, ty = g[0] / gl, R = 0.7 * m.k;
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = P.ink2;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(s[0] - tx * R, s[1] + ty * R);
        ctx.lineTo(s[0] + tx * R, s[1] - ty * R);
        ctx.stroke();
        ctx.setLineDash([]);
        const G = (0.55 * m.k) / Math.max(gl, 0.5);
        arrow2(ctx, s[0], s[1], s[0] + g[0] * G, s[1] - g[1] * G, P.good, 3, 10);
      }
      arrow2(ctx, s[0], s[1], s[0] + u[0] * 0.55 * m.k, s[1] - u[1] * 0.55 * m.k, P.neg, 2.5, 9);
      ctx.beginPath();
      ctx.arc(s[0], s[1], 6, 0, Math.PI * 2);
      ctx.fillStyle = P.hl;
      ctx.fill();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    },
    [P, fn, box, p, theta, field, level],
    { aspect: 1, maxHeight: 420 },
  );
  useDrag(wrapRef, {
    hit: () => 'p',
    onDrag: (_id, x, y) => {
      const m = mapRef.current;
      if (!m) return;
      const q = m.from(x, y);
      setP([Math.round(clampBox(q[0]) * 10) / 10, Math.round(clampBox(q[1]) * 10) / 10]);
    },
  });

  const { wrapRef: w2, canvasRef: c2 } = useCanvas2D(
    (ctx, { w, h }) => {
      const top = Math.max(0.5, Math.ceil(gl * 2) / 2);
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: 360, yMin: -top, yMax: top, pad: { l: 34, r: 12, t: 12, b: 30 } });
      plot.grid({ xStep: 90, yStep: top / 2, labels: true, axes: true, xLabel: '방향 θ (도)', fmt: (v) => nf(v, 2) });
      plot.fn((t) => g[0] * Math.cos(t * DEG) + g[1] * Math.sin(t * DEG), P.neg, 2.2);
      plot.line(gAng, -top, gAng, top, alpha(P.good, 0.8), 1.5, [4, 3]);
      plot.dot(theta, du, 5, P.neg, P.surface);
      plot.text('경사 방향', gAng, top, P.good, { dx: 4, dy: 10, align: 'left', bg: P.surface });
    },
    [P, g[0], g[1], gl, gAng, theta, du],
    { aspect: 1.6, maxHeight: 220 },
  );

  return (
    <Figure
      no={2}
      title="경사 벡터와 방향 도함수"
      hint="지도를 눌러 점을 옮기고, 방향을 돌려 보세요"
      caption={
        <>
          등고선 지도입니다. 굵은 검은 곡선은 점을 지나는 등고선이고, 초록 화살표가 경사 벡터 <M>{'\\nabla f'}</M>, 파란 화살표가 고른 방향의 단위 벡터 <M>{'\\mathbf u'}</M>입니다. 점선은 등고선의 접선 방향입니다. 아래 그래프는 방향을 한 바퀴 돌릴 때 그 방향의 기울기 <M>{'D_{\\mathbf u}f = \\nabla f\\cdot\\mathbf u'}</M>가 어떻게 바뀌는지 보여 줍니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={pid} onChange={setPid} options={PRESET_OPTS} label="곡면" />
        <Check label="경사 벡터장 보이기" checked={field} onChange={setField} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`${fn.name} 곡면의 등고선 지도. 점 (${nf(p[0], 1)}, ${nf(p[1], 1)})에서 경사 벡터는 (${nf(g[0], 3)}, ${nf(g[1], 3)})이고 방향 ${theta}도의 기울기는 ${nf(du, 3)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="pd2-t" label={<>방향 θ</>} value={theta} min={0} max={359} step={1} onChange={setTheta} format={(v) => `${v}°`} />
          <Slider id="pd2-x" label="점의 x" value={p[0]} min={-1.9} max={1.9} step={0.1} onChange={(v) => setP([v, p[1]])} format={(v) => nf(v, 1)} />
          <Slider id="pd2-y" label="점의 y" value={p[1]} min={-1.9} max={1.9} step={0.1} onChange={(v) => setP([p[0], v])} format={(v) => nf(v, 1)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label={<M>{'\\nabla f'}</M>} value={`(${nf(g[0], 2)}, ${nf(g[1], 2)})`} color="var(--good)" />
            <Readout label={<M>{'\\lVert\\nabla f\\rVert'}</M>} value={nf(gl, 3)} color="var(--good)" />
            <Readout label="경사 방향" value={`${nf(gAng, 1)}°`} />
            <Readout label={<M>{'D_{\\mathbf u}f'}</M>} value={nf(du, 3)} color="var(--neg)" />
          </div>
          <div ref={w2} className="canvas-box" role="img" aria-label={`방향에 따른 기울기 그래프. 최댓값 ${nf(gl, 3)}은 ${nf(gAng, 1)}도에서 나옵니다.`}>
            <canvas ref={c2} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--good)', label: '경사 벡터 ∇f', shape: 'ln' },
          { color: 'var(--neg)', label: '고른 방향 u', shape: 'ln' },
          { color: 'var(--ink-2)', label: '등고선의 접선', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: the tangent plane ─────────────── */

function TangentPlaneFigure() {
  const P = usePalette();
  const [pid, setPid] = useState<PresetId>('bowl');
  const [a, setA] = useState(1);
  const [b, setB] = useState(1);
  const [size, setSize] = useState(0.8);
  const [view, setView] = useState<View>({ yaw: 0.9, pitch: 0.55 });
  const fn = presets[pid];
  const box = fn.box;
  const z = fn.f(a, b);
  const [fx, fy] = fn.grad(a, b);
  const L = (x: number, y: number) => z + fx * (x - a) + fy * (y - b);
  const H = [0.5, 0.1, 0.01];
  const errs = H.map((h) => fn.f(a + h, b + h) - L(a + h, b + h));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const proj = drawSurface(ctx, P, fn, box, view, w, h, { n: 24 });
      // the tangent plane as a small square patch around (a, b), drawn as a grid
      const s = size;
      const pts: [number, number][] = [
        [a - s, b - s],
        [a + s, b - s],
        [a + s, b + s],
        [a - s, b + s],
      ];
      const q = pts.map(([x, y]) => proj(x, y, L(x, y)));
      ctx.beginPath();
      q.forEach((pp, i) => (i ? ctx.lineTo(pp.sx, pp.sy) : ctx.moveTo(pp.sx, pp.sy)));
      ctx.closePath();
      ctx.fillStyle = alpha(P.hl, 0.35);
      ctx.fill();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      for (let k = 1; k < 4; k++) {
        const t = -s + (2 * s * k) / 4;
        drawPath3(ctx, proj, [[a + t, b - s, L(a + t, b - s)], [a + t, b + s, L(a + t, b + s)]], alpha(P.ink, 0.35), 1);
        drawPath3(ctx, proj, [[a - s, b + t, L(a - s, b + t)], [a + s, b + t, L(a + s, b + t)]], alpha(P.ink, 0.35), 1);
      }
      dot3(ctx, P, proj, a, b, z, P.ink, 5);
    },
    [P, fn, box, view, a, b, size, z, fx, fy],
    { aspect: 1.35, maxHeight: 420 },
  );
  useOrbit(wrapRef, view, setView);

  return (
    <Figure
      no={3}
      title="접평면: 곡면을 가장 잘 흉내 내는 평면"
      hint="곡면을 끌어 돌려 보세요"
      caption={
        <>
          노란 판이 점 <M>{'(a, b)'}</M>에서의 접평면 <M>{'L(x,y)=f(a,b)+f_x(a,b)(x-a)+f_y(a,b)(y-b)'}</M>입니다. 표는 점에서 대각선 방향으로 <M>h</M>만큼 떨어진 곳에서 곡면과 접평면의 높이 차이 <M>{'f-L'}</M>입니다. 판을 작게 하면 곡면과 거의 구별되지 않습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={pid} onChange={setPid} options={PRESET_OPTS} label="곡면" />
        <Slider id="pd3-s" label="판의 크기" value={size} min={0.2} max={1.4} step={0.1} onChange={setSize} format={(v) => nf(v, 1)} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`${fn.name} 곡면과 점 (${nf(a)}, ${nf(b)})에서의 접평면. 접평면은 z = ${nf(z, 3)} + ${nf(fx, 3)}(x − ${nf(a)}) + ${nf(fy, 3)}(y − ${nf(b)})입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="pd3-a" label={<>점의 x 좌표 <M>a</M></>} value={a} min={-1.5} max={1.5} step={0.1} onChange={setA} format={(v) => nf(v, 1)} />
          <Slider id="pd3-b" label={<>점의 y 좌표 <M>b</M></>} value={b} min={-1.5} max={1.5} step={0.1} onChange={setB} format={(v) => nf(v, 1)} />
          <div className="pd-plane">
            <M>{`L = ${nf(z, 3)} ${fx < 0 ? '-' : '+'} ${nf(Math.abs(fx), 3)}(x ${a < 0 ? '+' : '-'} ${nf(Math.abs(a), 1)}) ${fy < 0 ? '-' : '+'} ${nf(Math.abs(fy), 3)}(y ${b < 0 ? '+' : '-'} ${nf(Math.abs(b), 1)})`.replace(/−/g, '-')}</M>
          </div>
          <table className="pd-err">
            <thead>
              <tr>
                <th>
                  <M>h</M>
                </th>
                <th>
                  <M>{'f - L'}</M>
                </th>
                <th>
                  <M>{'(f-L)/h^2'}</M>
                </th>
              </tr>
            </thead>
            <tbody>
              {H.map((hh, i) => (
                <tr key={hh}>
                  <td className="mono">{hh}</td>
                  <td className="mono">{errs[i].toExponential(2).replace('-', '−')}</td>
                  <td className="mono">{nf(errs[i] / (hh * hh), 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Partials() {
  return (
    <>
      <h2>산의 지형을 함수로</h2>
      <p>
        지도 위의 위치 <M>(x, y)</M>마다 높이 하나가 정해진다고 해 봅시다. 높이는 두 수를 받아 수 하나를 돌려주는 함수 <M>z = f(x, y)</M>이고, 모든 점의 높이를 세우면 산의 지형 같은 <T en="surface">곡면</T>이 됩니다. 같은 높이의 점들을 이은 곡선이 지도의 <T en="contour line, level curve">등고선</T>입니다. <a href={lessonHref('math-calculus', 'derivatives')}>미적분학의 미분</a>은 곡선 위에서 "한 걸음 갈 때 얼마나 오르는가"를 물었습니다. 곡면에서는 같은 질문에 답이 하나가 아닙니다. 동쪽으로 걸을 때와 북쪽으로 걸을 때 오르는 정도가 다르기 때문입니다.
      </p>
      <p>
        이 장의 그림은 세 곡면을 씁니다. 기본은 <M>{presets.bowl.tex}</M>인 길쭉한 그릇입니다. x 방향보다 y 방향이 두 배 가파르게 올라갑니다. 말안장은 한 방향으로는 오르고 다른 방향으로는 내려가는 곡면이고, 두 봉우리는 높이가 다른 언덕 두 개를 겹친 것입니다.
      </p>

      <h2>한 방향만 움직이기: 편미분</h2>
      <p>
        가장 쉬운 방법은 한 변수만 움직이고 나머지는 고정하는 것입니다. y를 <M>b</M>로 고정하면 <M>{'f(x, b)'}</M>는 x 하나의 함수가 되고, 보통의 미분을 할 수 있습니다. 이것을 x에 대한 <T en="partial derivative">편미분</T>이라 하고 <M>{'\\partial f/\\partial x'}</M> 또는 <M>{'f_x'}</M>로 씁니다.
      </p>
      <MB note="다른 변수는 상수처럼 두고 한 변수로만 미분합니다">{'\\frac{\\partial f}{\\partial x}(a,b)=\\lim_{h\\to0}\\frac{f(a+h,\\,b)-f(a,\\,b)}{h},\\qquad \\frac{\\partial f}{\\partial y}(a,b)=\\lim_{h\\to0}\\frac{f(a,\\,b+h)-f(a,\\,b)}{h}'}</MB>
      <p>
        그림으로는 곡면을 세로 평면으로 자르는 일입니다. 그림 1에서 y를 고정한 평면으로 자르면 파란 곡선이 나오고, 그 곡선의 접선 기울기가 <M>{'f_x'}</M>입니다.
      </p>
      <SliceFigure />
      <p>
        그릇 <M>{'f=\\tfrac14(x^2+2y^2)'}</M>에서 y를 상수로 보고 x로 미분하면 <M>{'f_x = x/2'}</M>, x를 상수로 보고 y로 미분하면 <M>{'f_y = y'}</M>입니다. 기본 점 <M>(1, 1)</M>에서 높이는 0.75이고, <M>{'f_x = 0.5'}</M>, <M>{'f_y = 1'}</M>입니다. 자르는 방향을 바꾸면 같은 점인데도 접선 기울기가 0.5에서 1로 바뀌는 것을 볼 수 있습니다. 말안장으로 바꾸면 같은 점에서 <M>{'f_x = 0.5'}</M>, <M>{'f_y = -0.5'}</M>로, 한 방향으로는 오르막이고 다른 방향으로는 내리막입니다.
      </p>

      <h2>모든 방향의 기울기: 경사 벡터</h2>
      <p>
        동쪽과 북쪽 말고 북동쪽으로 걸으면 어떨까요? 방향을 단위 벡터 <M>{'\\mathbf u = (\\cos\\theta, \\sin\\theta)'}</M>로 정하고 그 방향으로 <M>h</M>만큼 걸었을 때의 기울기를 <T en="directional derivative">방향 도함수</T> <M>{'D_{\\mathbf u}f'}</M>라고 합니다. 곡면이 매끄러우면 아주 가까이에서는 평평한 판처럼 보이므로, 대각선 방향의 오르막은 동쪽 성분과 북쪽 성분의 오르막을 더한 것이 됩니다.
      </p>
      <MB note="두 편미분을 모은 벡터가 경사 벡터입니다">{'D_{\\mathbf u}f = f_x\\cos\\theta + f_y\\sin\\theta = \\nabla f\\cdot\\mathbf u,\\qquad \\nabla f = \\left(f_x,\\; f_y\\right)'}</MB>
      <p>
        두 편미분을 묶은 <M>{'\\nabla f'}</M>를 <T en="gradient">경사 벡터</T>(그래디언트)라고 합니다. 방향 도함수는 경사 벡터와 방향 벡터의 내적이므로, <M>{'\\lVert\\nabla f\\rVert\\cos\\varphi'}</M>(<M>{'\\varphi'}</M>는 두 벡터 사이의 각)입니다. 그림 2에서 방향을 한 바퀴 돌려 보세요.
      </p>
      <GradientFigure />
      <p>
        점 <M>(1, 1)</M>에서 경사 벡터는 <M>(0.5, 1)</M>이고 길이는 <M>{'\\sqrt{1.25}\\approx1.118'}</M>, 방향은 약 63.4°입니다. 방향 0°(동쪽)의 기울기는 <M>{'f_x = 0.5'}</M>, 90°(북쪽)는 <M>{'f_y = 1'}</M>이고, 아래 그래프는 63.4°에서 가장 큰 1.118, 정반대인 243.4°에서 가장 작은 −1.118이 됩니다. 이것이 경사 벡터의 두 가지 뜻입니다.
      </p>
      <ol>
        <li>경사 벡터는 <strong>가장 가파르게 오르는 방향</strong>을 가리키고, 그 길이가 그 방향의 기울기입니다.</li>
        <li>
          경사 벡터에 수직인 방향(그래프가 0을 지나는 153.4°와 333.4°)으로는 기울기가 0이므로 높이가 변하지 않습니다. 그 방향이 바로 등고선이 지나가는 방향입니다. 그래서 <strong>경사 벡터는 언제나 등고선에 수직</strong>입니다.
        </li>
      </ol>
      <p>
        "경사 벡터장 보이기"를 켜면 지도 곳곳의 초록 화살표가 모두 등고선을 직각으로 가로지르고, 등고선이 촘촘한 곳일수록 화살표가 깁니다. 등고선이 촘촘하다는 것은 조금만 가도 높이가 크게 바뀐다는 뜻이기 때문입니다. 그릇에서는 화살표가 그릇 바닥 반대쪽을 향하지만 정확히 원점의 반대 방향은 아닙니다. y 방향이 더 가파르므로 화살표가 y 쪽으로 기울어 있습니다.
      </p>
      <Callout kind="note">
        <a href={lessonHref('ai-basics', 'gradients')}>기초 인공지능의 편미분과 그래디언트</a> 장에서 본 경사하강법은 이 사실을 거꾸로 씁니다. 손실 함수의 경사 벡터가 가장 가파른 오르막이므로, 그 반대 방향 <M>{'-\\nabla f'}</M>로 조금씩 움직이면 가장 빨리 내려갑니다. 신경망의 변수는 수백만 개지만 원리는 그림 2의 두 변수와 같습니다.
      </Callout>

      <h2>접평면: 가까이서 보면 평평하다</h2>
      <p>
        곡선을 확대하면 직선(접선)처럼 보이듯, 매끄러운 곡면을 확대하면 평면처럼 보입니다. 점 <M>(a, b)</M>에서 그 평면은 x 방향 기울기가 <M>{'f_x'}</M>, y 방향 기울기가 <M>{'f_y'}</M>인 평면입니다.
      </p>
      <MB note="일변수의 접선 f(a) + f′(a)(x − a)를 두 변수로 넓힌 것입니다">{'L(x,y) = f(a,b) + f_x(a,b)\\,(x-a) + f_y(a,b)\\,(y-b)'}</MB>
      <TangentPlaneFigure />
      <p>
        그릇의 점 <M>(1, 1)</M>에서 접평면은 <M>{'L = 0.75 + 0.5(x-1) + (y-1)'}</M>입니다. 대각선으로 <M>h</M>만큼 떨어진 점에서의 차이는 <M>{'f - L = 0.75h^2'}</M>이라서, <M>h</M>가 0.5, 0.1, 0.01일 때 각각 0.1875, 0.0075, 0.000075입니다. <M>h</M>를 10분의 1로 줄이면 차이는 100분의 1로 줄어듭니다. 차이가 <M>h</M>보다 훨씬 빨리 0으로 가는 것이 "가까이서 보면 평평하다"의 정확한 뜻이고, 이렇게 접평면으로 잘 근사되는 함수를 <T en="differentiable">미분 가능</T>하다고 합니다.
      </p>
      <Callout kind="warn">
        편미분 두 개가 있다고 해서 늘 접평면이 있는 것은 아닙니다. <M>{'f(x,y) = xy/(x^2+y^2)'}</M>(원점에서는 0)은 x축과 y축 위에서 늘 0이라 원점의 두 편미분이 모두 0이지만, 직선 <M>y = x</M>를 따라오면 값이 1/2이라 원점에서 연속조차 아닙니다. 편미분은 두 방향만 보기 때문입니다. 편미분이 연속이면 이런 일이 없고, 이 과목의 곡면은 모두 그런 매끄러운 함수입니다.
      </Callout>

      <Callout kind="key">
        두 변수 함수의 편미분 <M>{'f_x'}</M>, <M>{'f_y'}</M>는 곡면을 x나 y 방향으로 잘라 얻은 곡선의 기울기입니다. 둘을 모은 경사 벡터 <M>{'\\nabla f'}</M>로 어느 방향의 기울기든 <M>{'D_{\\mathbf u}f=\\nabla f\\cdot\\mathbf u'}</M>로 구할 수 있고, 경사 벡터는 가장 가파른 오르막을 가리키며 등고선에 수직입니다. 매끄러운 곡면은 가까이서 접평면 <M>{'f(a,b)+f_x(x-a)+f_y(y-b)'}</M>과 거의 같습니다.
      </Callout>
      <Quiz
        q={<>어떤 점에서 경사 벡터가 <M>{'\\nabla f = (3, 4)'}</M>이다. 이 점에서 기울기가 가장 큰 방향과 그 기울기, 그리고 높이가 변하지 않는 방향으로 알맞은 것은?</>}
        options={[
          <>방향 (3, 4)로 기울기 7, 등고선 방향은 (1, 1)</>,
          <>방향 (0.6, 0.8)로 기울기 5, 등고선 방향은 (−0.8, 0.6)</>,
          <>방향 (0, 1)로 기울기 4, 등고선 방향은 (1, 0)</>,
          <>방향 (0.6, 0.8)로 기울기 1, 등고선 방향은 (0.8, 0.6)</>,
        ]}
        answer={1}
        explain={<>가장 가파른 방향은 경사 벡터 방향의 단위 벡터 (3, 4)/5 = (0.6, 0.8)이고, 그 방향의 기울기는 경사 벡터의 길이 √(9 + 16) = 5입니다. 높이가 변하지 않는 방향은 경사 벡터와 내적이 0인 방향이므로 (−0.8, 0.6)입니다. 실제로 3·(−0.8) + 4·0.6 = 0입니다.</>}
      />
    </>
  );
}
