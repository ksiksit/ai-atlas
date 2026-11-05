import { useMemo, useRef, useState } from 'react';
import { Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { MAPS, area, cornerGap, det, fg, g as G1, imageOfSquare, Jf, Jg, mul, numericJ, predicted, type M2, type MapId, type PlaneMap, type V2 } from './jacobian';
import { nf } from './surface';
import './multivariable.css';
import './jacobian.css';

const MAP_OPTS: { value: MapId; label: string }[] = [
  { value: 'polar', label: '극좌표' },
  { value: 'twist', label: '휘고 밀기' },
  { value: 'square', label: '복소수 제곱' },
];

const texM = (m: M2, d = 2) => `\\begin{pmatrix}${nf(m[0][0], d)} & ${nf(m[0][1], d)}\\\\ ${nf(m[1][0], d)} & ${nf(m[1][1], d)}\\end{pmatrix}`.replace(/−/g, '-');

/** Plot range that holds the image of the map's whole input rectangle. */
function outRange(m: PlaneMap) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const { u0, u1, v0, v1 } = m.dom;
  for (let i = 0; i <= 30; i++)
    for (let j = 0; j <= 30; j++) {
      const q = m.f([u0 + ((u1 - u0) * i) / 30, v0 + ((v1 - v0) * j) / 30]);
      x0 = Math.min(x0, q[0]);
      x1 = Math.max(x1, q[0]);
      y0 = Math.min(y0, q[1]);
      y1 = Math.max(y1, q[1]);
    }
  const px = (x1 - x0) * 0.08, py = (y1 - y0) * 0.08;
  return { xMin: x0 - px, xMax: x1 + px, yMin: y0 - py, yMax: y1 + py };
}

function polyPath(plot: Plot, pts: V2[]) {
  const c = plot.ctx;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(plot.X(x), plot.Y(y)) : c.moveTo(plot.X(x), plot.Y(y))));
  c.closePath();
}

/** The map's grid lines, drawn either in the input plane (identity) or after the map. */
function drawGrid(plot: Plot, P: Palette, m: PlaneMap, through: (p: V2) => V2) {
  const { u0, u1, v0, v1 } = m.dom;
  const c = plot.ctx;
  for (let k = 0; k <= m.lines; k++) {
    const u = u0 + ((u1 - u0) * k) / m.lines;
    const v = v0 + ((v1 - v0) * k) / m.lines;
    c.strokeStyle = alpha(P.neg, 0.45);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i <= 60; i++) {
      const q = through([u, v0 + ((v1 - v0) * i) / 60]);
      if (i) c.lineTo(plot.X(q[0]), plot.Y(q[1]));
      else c.moveTo(plot.X(q[0]), plot.Y(q[1]));
    }
    c.stroke();
    c.strokeStyle = alpha(P.pos, 0.45);
    c.beginPath();
    for (let i = 0; i <= 60; i++) {
      const q = through([u0 + ((u1 - u0) * i) / 60, v]);
      if (i) c.lineTo(plot.X(q[0]), plot.Y(q[1]));
      else c.moveTo(plot.X(q[0]), plot.Y(q[1]));
    }
    c.stroke();
  }
}

/* ─────────────── Figure 1: a map bends the grid ─────────────── */

function DeformFigure() {
  const P = usePalette();
  const [id, setId] = useState<MapId>('polar');
  const m = MAPS[id];
  const [p, setP] = useState<V2>(m.p0);
  const [h, setH] = useState(0.3);
  const pick = (v: MapId) => {
    setId(v);
    setP(MAPS[v].p0);
  };
  const J = m.J(p);
  const d = det(J);
  const img = useMemo(() => imageOfSquare(m.f, p, h, 64), [m, p, h]);
  const ratio = area(img) / (h * h);
  const range = useMemo(() => outRange(m), [m]);
  const inPlot = useRef<Plot | null>(null);
  const { u0, u1, v0, v1 } = m.dom;
  const clampP = (q: V2): V2 => [Math.max(u0, Math.min(u1 - h, q[0])), Math.max(v0, Math.min(v1 - h, q[1]))];

  const left = useCanvas2D(
    (ctx, { w, h: ch }) => {
      const plot = new Plot(ctx, w, ch, P, { xMin: u0, xMax: u1, yMin: v0, yMax: v1, pad: { l: 30, r: 10, t: 10, b: 26 } });
      inPlot.current = plot;
      plot.grid({ labels: true, axes: false, xStep: (u1 - u0) / 3, yStep: (v1 - v0) / 3, xLabel: m.inNames[0], yLabel: m.inNames[1], fmt: (v) => nf(v, 1) });
      drawGrid(plot, P, m, (q) => q);
      polyPath(plot, [p, [p[0] + h, p[1]], [p[0] + h, p[1] + h], [p[0], p[1] + h]]);
      ctx.fillStyle = alpha(P.hl, 0.55);
      ctx.fill();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      plot.dot(p[0], p[1], 5, P.ink, P.surface);
    },
    [P, m, p, h],
    { aspect: 1.1, maxHeight: 340 },
  );
  useDrag(left.wrapRef, {
    hit: () => 'p',
    onDrag: (_i, x, y) => {
      const pl = inPlot.current;
      if (!pl) return;
      setP(clampP([Math.round(pl.invX(x) * 20) / 20, Math.round(pl.invY(y) * 20) / 20]));
    },
  });

  const right = useCanvas2D(
    (ctx, { w, h: ch }) => {
      const plot = new Plot(ctx, w, ch, P, { ...range, equal: true, pad: { l: 30, r: 10, t: 10, b: 26 } });
      plot.grid({ labels: true, axes: true, xStep: 1, yStep: 1, xLabel: 'x', yLabel: 'y', fmt: (v) => nf(v, 0) });
      drawGrid(plot, P, m, m.f);
      polyPath(plot, img);
      ctx.fillStyle = alpha(P.hl, 0.55);
      ctx.fill();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      polyPath(plot, predicted(m.f, J, p, h));
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = P.good;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      const o = m.f(p);
      plot.arrow(o[0], o[1], o[0] + J[0][0] * h, o[1] + J[1][0] * h, P.neg, 2, 8);
      plot.arrow(o[0], o[1], o[0] + J[0][1] * h, o[1] + J[1][1] * h, P.pos, 2, 8);
      plot.dot(o[0], o[1], 5, P.ink, P.surface);
    },
    [P, m, p, h, img, range, J[0][0], J[0][1], J[1][0], J[1][1]],
    { aspect: 1.1, maxHeight: 340 },
  );

  return (
    <Figure
      no={1}
      title="곧은 격자가 휘어지는 모습"
      hint="왼쪽 평면을 눌러 작은 정사각형을 옮겨 보세요"
      caption={
        <>
          왼쪽은 입력 평면, 오른쪽은 함수 <M>{m.tex}</M>로 옮긴 결과입니다. 파란 선은 첫째 좌표({m.inNames[0]})가 일정한 선, 주황 선은 둘째 좌표({m.inNames[1]})가 일정한 선입니다. 노란 정사각형(한 변 <M>h</M>)은 오른쪽에서 휘어진 노란 조각이 되고, 초록 점선은 야코비 행렬의 두 열을 <M>h</M>배 해서 만든 평행사변형입니다. 파란 화살표가 첫째 열, 주황 화살표가 둘째 열입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={pick} options={MAP_OPTS} label="함수" />
        <Slider id="jc1-h" label={<>정사각형의 한 변 <M>h</M></>} value={h} min={0.05} max={0.6} step={0.05} onChange={(v) => { setH(v); setP((q) => clampP(q)); }} format={(v) => nf(v, 2)} />
      </div>
      <div className="jc-pair">
        <div ref={left.wrapRef} className="canvas-box grab" role="img" aria-label={`입력 평면의 격자와 점 (${nf(p[0], 2)}, ${nf(p[1], 2)})에 놓인 한 변 ${nf(h, 2)}인 정사각형.`}>
          <canvas ref={left.canvasRef} />
        </div>
        <div ref={right.wrapRef} className="canvas-box" role="img" aria-label={`${m.name} 함수로 옮긴 격자. 정사각형의 넓이가 ${nf(ratio, 3)}배가 되었고 야코비 행렬식은 ${nf(d, 3)}입니다.`}>
          <canvas ref={right.canvasRef} />
        </div>
      </div>
      <div className="controls row">
        <Slider id="jc1-u" label={`점의 ${m.inNames[0]}`} value={p[0]} min={u0} max={u1 - h} step={0.05} onChange={(v) => setP([v, p[1]])} format={(v) => nf(v, 2)} />
        <Slider id="jc1-v" label={`점의 ${m.inNames[1]}`} value={p[1]} min={v0} max={v1 - h} step={0.05} onChange={(v) => setP([p[0], v])} format={(v) => nf(v, 2)} />
      </div>
      <div className="jc-math">
        <MB>{`${m.jtex} = ${texM(J)}`}</MB>
      </div>
      <div className="readouts">
        <Readout label={<M>{m.dtex}</M>} value={nf(d, 3)} color="var(--good)" />
        <Readout label="실제 넓이 / h²" value={nf(ratio, 3)} />
        <Readout label="차이" value={nf(ratio - d, 3)} />
      </div>
      <Legend
        items={[
          { color: 'var(--hl)', label: '정사각형과 그 상', shape: 'sq' },
          { color: 'var(--good)', label: '야코비 행렬이 예측한 평행사변형', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: zooming in ─────────────── */

const H_STEPS = [0.6, 0.4, 0.3, 0.2, 0.1, 0.05, 0.02, 0.01];

function ZoomFigure() {
  const P = usePalette();
  const [id, setId] = useState<MapId>('square');
  const [k, setK] = useState(2);
  const m = MAPS[id];
  const p = m.p0;
  const h = H_STEPS[k];
  const J = m.J(p);
  const img = useMemo(() => imageOfSquare(m.f, p, h, 64), [m, p, h]);
  const par = predicted(m.f, J, p, h);
  const gap = cornerGap(m.f, J, p, h);
  const ratio = area(img) / (h * h);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: ch }) => {
      // a window around f(p) whose size follows h, so the picture keeps the same size
      const o = m.f(p);
      const all = [...img, ...par];
      const R = Math.max(...all.map((q) => Math.max(Math.abs(q[0] - o[0]), Math.abs(q[1] - o[1])))) * 1.15;
      const plot = new Plot(ctx, w, ch, P, { xMin: o[0] - R * 0.35, xMax: o[0] + R, yMin: o[1] - R * 0.35, yMax: o[1] + R, equal: true, pad: { l: 10, r: 10, t: 10, b: 10 } });
      polyPath(plot, img);
      ctx.fillStyle = alpha(P.hl, 0.55);
      ctx.fill();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      polyPath(plot, par);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = P.good;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.setLineDash([]);
      plot.dot(o[0], o[1], 4, P.ink, P.surface);
      // a scale bar
      const bar = 0.25 * (plot.xMax - plot.xMin);
      const mag = Math.pow(10, Math.floor(Math.log10(bar)));
      const len = Math.floor(bar / mag) * mag;
      const y = plot.yMin + 0.05 * (plot.yMax - plot.yMin);
      const x = plot.xMax - 0.05 * (plot.xMax - plot.xMin) - len;
      plot.line(x, y, x + len, y, P.ink2, 2);
      plot.text(`${len < 0.01 ? len.toExponential(0) : nf(len, 3)}`, x + len / 2, y, P.ink2, { dy: -10, align: 'center' });
    },
    [P, m, p, h, img, par],
    { aspect: 1.2, maxHeight: 360 },
  );

  return (
    <Figure
      no={2}
      title="확대하면 휘어진 조각이 평행사변형이 된다"
      hint="정사각형을 줄여 보세요"
      caption={
        <>
          그림 1의 오른쪽에서 노란 조각만 확대해 보여 줍니다. 정사각형을 줄일 때마다 같은 크기로 보이도록 확대 배율을 키웠습니다(오른쪽 아래 막대가 실제 길이). 정사각형이 작아질수록 휘어진 조각과 초록 평행사변형의 차이가 사라집니다. 표의 "모서리 어긋남 / h"는 네 모서리가 예측에서 벗어난 최대 거리를 정사각형 크기로 나눈 값입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={setId} options={MAP_OPTS} label="함수" />
        <Slider id="jc2-h" label={<>정사각형의 한 변 <M>h</M></>} value={k} min={0} max={H_STEPS.length - 1} step={1} onChange={setK} format={(v) => String(H_STEPS[v])} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`한 변 ${h}인 정사각형의 상을 확대한 그림. 모서리 어긋남은 h의 ${nf(gap / h, 3)}배이고 넓이 비는 ${nf(ratio, 3)}, 야코비 행렬식은 ${nf(det(J), 3)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="점" value={`(${nf(p[0], 2)}, ${nf(p[1], 2)})`} />
            <Readout label={<M>{'\\det J'}</M>} value={nf(det(J), 3)} color="var(--good)" />
            <Readout label="넓이 / h²" value={nf(ratio, 4)} />
            <Readout label="모서리 어긋남 / h" value={nf(gap / h, 4)} />
          </div>
          <p className="mv-small">
            <M>h</M>를 10분의 1로 줄이면 어긋남/h도 거의 10분의 1이 됩니다. 어긋남이 <M>h</M>보다 한 단계 빨리 사라진다는 뜻이고, 이것이 야코비 행렬이 "가장 좋은 선형 근사"라는 말의 내용입니다.
          </p>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the chain rule as a matrix product ─────────────── */

function ChainFigure() {
  const P = usePalette();
  const [x, setX] = useState(1);
  const [y, setY] = useState(2);
  const p: V2 = [x, y];
  const q = G1(p);
  const A = Jf(q);
  const B = Jg(p);
  const prod = mul(A, B);
  const num = numericJ(fg, p);
  const err = Math.max(...[0, 1].flatMap((i) => [0, 1].map((j) => Math.abs(prod[i][j] - num[i][j]))));

  // three small views: a tiny square at p, its image after g, and after f∘g
  const h = 0.06;
  const stages: { pts: V2[]; o: V2; name: string; M?: M2 }[] = [
    { pts: imageOfSquare((s) => s, p, h, 8), o: p, name: '입력 (x, y)' },
    { pts: imageOfSquare(G1, p, h, 8), o: q, name: 'g를 거친 뒤 (u, v)', M: B },
    { pts: imageOfSquare(fg, p, h, 8), o: fg(p), name: 'f까지 거친 뒤', M: prod },
  ];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: ch }) => {
      const cw = w / 3;
      stages.forEach((st, i) => {
        const R = Math.max(...st.pts.map((s) => Math.max(Math.abs(s[0] - st.o[0]), Math.abs(s[1] - st.o[1])))) * 1.25;
        ctx.save();
        ctx.translate(i * cw, 0);
        const plot = new Plot(ctx, cw, ch, P, { xMin: st.o[0] - R, xMax: st.o[0] + R, yMin: st.o[1] - R, yMax: st.o[1] + R, equal: true, pad: { l: 8, r: 8, t: 26, b: 8 } });
        ctx.fillStyle = P.surface2;
        ctx.fillRect(plot.pad.l, plot.pad.t, plot.pw, plot.ph);
        polyPath(plot, st.pts);
        ctx.fillStyle = alpha(i === 0 ? P.hl : i === 1 ? P.pos : P.neg, 0.5);
        ctx.fill();
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        plot.dot(st.o[0], st.o[1], 3.5, P.ink, P.surface);
        ctx.fillStyle = P.ink2;
        ctx.font = `600 11px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(st.name, cw / 2, 6);
        ctx.restore();
        if (i < 2) {
          ctx.fillStyle = P.ink3;
          ctx.font = `700 14px ${P.fontMono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('→', (i + 1) * cw, ch / 2 + 8);
        }
      });
    },
    [P, x, y],
    { aspect: 2.8, maxHeight: 220 },
  );

  return (
    <Figure
      no={3}
      title="연쇄 법칙: 단계마다 행렬을 곱한다"
      hint="점을 옮겨 보세요"
      caption={
        <>
          <M>{'g(x,y) = (x+y,\\; xy)'}</M>로 옮긴 뒤 <M>{'f(u,v) = (uv,\\; u - v^2)'}</M>로 한 번 더 옮깁니다. 위 그림은 점 근처의 아주 작은 정사각형이 단계마다 어떤 평행사변형이 되는지 보여 줍니다(단계마다 확대 배율은 다릅니다). 아래 식의 마지막 행렬은 합성 함수를 직접 수치 미분한 값입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="jc3-x" label="x" value={x} min={-2} max={2} step={0.5} onChange={setX} format={(v) => nf(v, 1)} />
        <Slider id="jc3-y" label="y" value={y} min={-2} max={2} step={0.5} onChange={setY} format={(v) => nf(v, 1)} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`점 (${nf(x, 1)}, ${nf(y, 1)}) 근처의 작은 정사각형이 g를 거쳐 (${nf(q[0], 2)}, ${nf(q[1], 2)}) 근처의 평행사변형이 되고, f를 거쳐 다시 다른 평행사변형이 되는 세 단계 그림.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="jc-math">
        <MB>{`J_f\\big(g(${nf(x, 1)}, ${nf(y, 1)})\\big)\\,J_g(${nf(x, 1)}, ${nf(y, 1)}) = ${texM(A)}${texM(B)} = ${texM(prod)}`.replace(/−/g, '-')}</MB>
        <MB note={`두 결과의 가장 큰 차이 ${err.toExponential(1).replace('-', '−')}`}>{`J_{f\\circ g}\\ \\text{(수치 미분)} \\approx ${texM(num, 4)}`}</MB>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Jacobian() {
  return (
    <>
      <h2>미분은 수가 아니라 행렬이다</h2>
      <p>
        <a href={lessonHref('math-multivariable', 'partial-derivatives')}>앞 장</a>의 함수는 두 수를 받아 수 하나(높이)를 돌려주었습니다. 이번에는 두 수를 받아 두 수를 돌려주는 함수, 즉 평면의 점을 평면의 다른 점으로 옮기는 함수를 봅니다. 극좌표 <M>(r, \theta)</M>를 직교좌표 <M>(x, y)</M>로 바꾸는 것, 지도를 그리는 투영, 이미지를 휘는 필터가 모두 이런 함수입니다.
      </p>
      <p>
        <a href={lessonHref('math-linear-algebra', 'matrices')}>선형대수의 행렬과 선형변환</a>에서는 행렬이 격자를 곧은 평행선 격자로 옮겼습니다. 일반 함수는 격자를 휘어 버립니다. 그림 1에서 함수를 바꿔 가며 격자가 어떻게 휘는지 보세요.
      </p>
      <DeformFigure />
      <p>
        전체 격자는 휘었지만, 노란 정사각형 하나만 보면 약간 휜 평행사변형에 가깝습니다. 아주 좁은 범위에서는 어떤 매끄러운 함수도 선형변환처럼 행동하기 때문입니다. 그 선형변환을 나타내는 행렬이 <T en="Jacobian matrix">야코비 행렬</T>이고, 각 출력 성분을 각 입력 변수로 편미분한 값을 늘어놓은 것입니다.
      </p>
      <MB note="i번째 행은 i번째 출력의 경사 벡터, j번째 열은 j번째 입력만 조금 움직였을 때 출력이 움직이는 방향입니다">{'\\mathbf F(u,v) = \\big(F_1(u,v),\\, F_2(u,v)\\big),\\qquad J = \\begin{pmatrix}\\partial F_1/\\partial u & \\partial F_1/\\partial v\\\\ \\partial F_2/\\partial u & \\partial F_2/\\partial v\\end{pmatrix},\\qquad \\mathbf F(\\mathbf p + \\mathbf h) \\approx \\mathbf F(\\mathbf p) + J\\,\\mathbf h'}</MB>
      <p>
        그림 1의 파란 화살표는 첫째 입력만 <M>h</M> 늘렸을 때 출력이 가는 곳(첫째 열), 주황 화살표는 둘째 입력만 늘렸을 때 가는 곳(둘째 열)이고, 두 화살표가 만드는 초록 평행사변형이 야코비 행렬의 예측입니다. 하나의 변수 함수에서 도함수가 "접선의 기울기"였다면, 여러 변수에서는 야코비 행렬이 "그 점에서 가장 비슷한 선형변환"입니다.
      </p>

      <h2>행렬식: 넓이가 늘어나는 비율</h2>
      <p>
        <a href={lessonHref('math-linear-algebra', 'determinants')}>선형대수의 행렬식</a> 장에서 행렬식은 선형변환이 넓이를 몇 배로 바꾸는지였습니다. 그래서 야코비 행렬의 행렬식은 함수가 그 점 근처의 작은 넓이를 몇 배로 바꾸는지를 알려 줍니다. 극좌표에서는
      </p>
      <MB note="r이 클수록 같은 각도 조각이 더 넓은 부채꼴이 됩니다">{'\\det J = \\cos\\theta\\cdot r\\cos\\theta - (-r\\sin\\theta)\\cdot\\sin\\theta = r(\\cos^2\\theta + \\sin^2\\theta) = r'}</MB>
      <p>
        입니다. 그림 1의 기본 설정(점 <M>r = 1.5,\ \theta = 0.6</M>, 한 변 0.3)에서 노란 조각의 실제 넓이는 정사각형의 1.65배이고 행렬식은 1.5입니다. 이 경우 실제 비율은 정확히 <M>{'r + h/2'}</M>라서, 한 변을 0.5, 0.3, 0.1, 0.01로 줄이면 1.75, 1.65, 1.55, 1.505로 행렬식 1.5에 다가갑니다. 극좌표로 넓이를 적분할 때 <M>{'dx\\,dy'}</M> 대신 <M>{'r\\,dr\\,d\\theta'}</M>를 쓰는 이유가 이 <M>r</M>입니다. 이 사실은 <a href={lessonHref('math-multivariable', 'multiple-integrals')}>다중 적분</a> 장에서 다시 씁니다.
      </p>
      <p>
        "휘고 밀기"의 기본 점 <M>(0.4, 1)</M>에서는 행렬식이 약 0.703으로, 넓이가 줄어듭니다. "복소수 제곱"은 복소수 <M>z = x + iy</M>를 <M>z^2</M>으로 보내는 함수입니다. 이 함수의 야코비 행렬은 회전과 확대를 합친 모양 <M>{'\\begin{pmatrix}a&-b\\\\b&a\\end{pmatrix}'}</M>이라서, 작은 정사각형이 찌그러지지 않고 돌아가며 커지기만 합니다. 오른쪽 그림에서 파란 선과 주황 선이 늘 직각으로 만나는 것을 확인해 보세요. 이렇게 각을 지키는 함수는 <a href={lessonHref('math-multivariable', 'vector-theorems')}>이 과목의 마지막 장</a>과 복소해석에서 다시 나옵니다.
      </p>

      <h2>얼마나 가까이 봐야 할까</h2>
      <p>
        "가까이서 보면 선형"이라는 말이 정확히 무엇인지 그림 2에서 확인해 봅니다. 정사각형을 줄일 때마다 화면에 같은 크기로 보이도록 확대합니다.
      </p>
      <ZoomFigure />
      <p>
        복소수 제곱의 점 <M>(1, 0.5)</M>에서 야코비 행렬식은 <M>{'4(1^2+0.5^2) = 5'}</M>입니다. 한 변이 0.3일 때 실제 넓이 비는 7.04로 5와 꽤 다르고 휘어진 모양이 눈에 띄지만, 0.1이면 5.63, 0.01이면 5.06이 되고 모양도 평행사변형과 구별되지 않습니다. 모서리가 예측에서 벗어난 거리를 정사각형 크기로 나눈 값은 0.6, 0.2, 0.02로 <M>h</M>에 비례해 줄어듭니다. 곧 어긋남 자체는 <M>h^2</M>처럼 줄어듭니다. 앞 장 접평면의 오차가 <M>h^2</M>처럼 줄어든 것과 같은 현상입니다.
      </p>

      <h2>연쇄 법칙: 미분을 곱한다</h2>
      <p>
        함수를 두 번 연달아 적용하면 어떻게 될까요? 일변수에서는 <M>{"(f\\circ g)'(x) = f'(g(x))\\,g'(x)"}</M>였습니다. 각 단계가 작은 변화를 몇 배로 늘리는지를 곱한 것입니다. 여러 변수에서도 같은 말이 성립하는데, "몇 배"가 행렬이므로 곱셈이 행렬 곱이 됩니다.
      </p>
      <MB note="오른쪽에 있는 행렬(먼저 적용한 g)이 먼저 작용합니다">{'J_{f\\circ g}(\\mathbf p) = J_f\\big(g(\\mathbf p)\\big)\\; J_g(\\mathbf p)'}</MB>
      <p>
        먼저 <M>g</M>가 작은 정사각형을 평행사변형 <M>{'J_g'}</M>로 바꾸고, 그것을 <M>f</M>가 다시 <M>{'J_f'}</M>로 바꾸므로, 두 선형변환을 이어 붙인 행렬 곱이 전체의 선형 근사입니다. 주의할 점은 <M>{'J_f'}</M>를 원래 점 <M>{'\\mathbf p'}</M>가 아니라 <M>g</M>가 옮겨 놓은 점 <M>{'g(\\mathbf p)'}</M>에서 계산해야 한다는 것입니다.
      </p>
      <ChainFigure />
      <p>
        기본 점 <M>(1, 2)</M>에서 <M>g</M>는 점을 <M>(3, 2)</M>로 보내고, <M>{'J_g = \\begin{pmatrix}1&1\\\\2&1\\end{pmatrix}'}</M>, <M>{'J_f(3,2) = \\begin{pmatrix}2&3\\\\1&-4\\end{pmatrix}'}</M>입니다. 곱은 <M>{'\\begin{pmatrix}8&5\\\\-7&-3\\end{pmatrix}'}</M>입니다. 합성 함수 <M>{'(x^2y + xy^2,\\; x + y - x^2y^2)'}</M>를 직접 미분해도 같은 결과가 나오고, 그림의 수치 미분도 소수 여러 자리까지 일치합니다. 직접 미분은 합성 함수를 전개해야 하지만, 연쇄 법칙은 단계마다의 작은 행렬만 알면 됩니다.
      </p>
      <Callout kind="intuition">
        <M>{'J_{f\\circ g}'}</M>의 첫째 행 <M>(8, 5)</M>는 첫째 출력 <M>{'x^2y + xy^2'}</M>의 경사 벡터입니다. 출력이 하나뿐인 손실 함수의 경사를 원할 때는 행렬 전체를 곱할 필요 없이, 마지막 단계의 행 벡터에서 시작해 오른쪽으로 행렬을 하나씩 곱해 나가면 됩니다. <a href={lessonHref('ai-basics', 'backprop')}>기초 인공지능의 역전파</a>가 바로 이 계산입니다. 신경망은 층마다 하나의 함수이고, 역전파는 출력 쪽에서 입력 쪽으로 연쇄 법칙의 행렬 곱을 차례로 계산하는 방법입니다.
      </Callout>

      <Callout kind="key">
        평면을 평면으로 옮기는 함수는 한 점 근처에서 선형변환처럼 행동하고, 그 행렬이 편미분을 늘어놓은 야코비 행렬 <M>J</M>입니다. <M>J</M>의 열은 각 입력만 움직였을 때 출력이 가는 방향이고, <M>{'\\lvert\\det J\\rvert'}</M>는 작은 넓이가 늘어나는 비율입니다(극좌표에서는 <M>r</M>). 함수를 이어 붙이면 미분은 행렬 곱 <M>{'J_{f\\circ g}=J_f(g(\\mathbf p))\\,J_g(\\mathbf p)'}</M>이 되고, 역전파는 이 곱을 출력 쪽에서부터 계산하는 것입니다.
      </Callout>
      <Quiz
        q={<>극좌표 변환에서 점 <M>{'r = 2,\\ \\theta = 0.3'}</M> 근처의 아주 작은 직사각형 <M>{'\\Delta r \\times \\Delta\\theta = 0.01 \\times 0.01'}</M>은 직교좌표 평면에서 넓이가 대략 얼마인 조각이 될까?</>}
        options={[<>0.0001</>, <>0.0002</>, <>0.0004</>, <>0.02</>]}
        answer={1}
        explain={<>극좌표의 야코비 행렬식은 <M>r</M>이므로 이 점에서 넓이는 2배가 됩니다. 원래 넓이 0.0001에 2를 곱한 0.0002입니다. 반지름 2인 원에서 각도 0.01만큼의 호 길이가 2 × 0.01 = 0.02이고, 반지름 방향 두께가 0.01이니 0.02 × 0.01 = 0.0002라고 셈해도 같습니다.</>}
      />
    </>
  );
}
