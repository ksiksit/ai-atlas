import { useMemo, useRef, useState } from 'react';
import { Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { PRESETS, chainNudge, diffQuot, floatTable, productPieces } from './deriv';
import './calculus.css';
import './derivatives.css';

const n6 = (v: number) => String(+v.toFixed(6));

/* ─────────────── Figure 1: secant to tangent ─────────────── */

const SQ = (x: number) => x * x;
const A = 1;
const H_MAX = 1.5;
const H_MIN = 0.001;
/** Slider position t ∈ [0, 1] → h on a log scale from 1.5 down to 0.001. */
const hOf = (t: number) => H_MAX * Math.pow(H_MIN / H_MAX, t);
const tOf = (h: number) => Math.log(Math.max(H_MIN, Math.min(H_MAX, h)) / H_MAX) / Math.log(H_MIN / H_MAX);
const TABLE_H = [1, 0.5, 0.1, 0.01, 0.001];

function SecantFigure() {
  const P = usePalette();
  const [t, setT] = useState(() => tOf(1));
  const [side, setSide] = useState<1 | -1>(1);
  const [tangent, setTangent] = useState(true);
  const plotRef = useRef<Plot | null>(null);
  const h = side * hOf(t);
  const q = diffQuot(SQ, A, h);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: ch }) => {
      const p = new Plot(ctx, w, ch, P, { xMin: -0.8, xMax: 2.9, yMin: -0.8, yMax: 6.4, pad: { l: 36, r: 14, t: 14, b: 28 } });
      plotRef.current = p;
      p.grid();
      p.fn(SQ, P.accent, 2.5);
      if (tangent) p.slopeLine(A, 1, 2, alpha(P.good, 0.9), 2, [6, 4]);
      p.slopeLine(A, 1, q, P.bad, 2);
      // rise over run
      const x2 = A + h, y2 = SQ(x2);
      p.line(A, 1, x2, 1, alpha(P.ink3, 0.9), 1.5);
      p.line(x2, 1, x2, y2, alpha(P.ink3, 0.9), 1.5);
      if (Math.abs(h) > 0.12) {
        p.text(`h = ${n6(h)}`, (A + x2) / 2, 1, P.ink2, { dy: h > 0 ? 12 : -12, align: 'center', font: `600 11px ${P.fontMono}`, bg: P.surface });
        p.text(`Δy = ${n6(y2 - 1)}`, x2, (1 + y2) / 2, P.ink2, { dx: h > 0 ? 8 : -8, align: h > 0 ? 'left' : 'right', font: `600 11px ${P.fontMono}`, bg: P.surface });
      }
      p.dot(A, 1, 6, P.ink, P.surface, 2);
      p.dot(x2, y2, 8, P.bad, P.surface, 2.5);
      p.text('P', A, 1, P.ink, { dx: -10, dy: -10, align: 'right' });
      p.text('Q', x2, y2, P.bad, { dx: 10, dy: -10 });
    },
    [P, h, q, tangent],
    { aspect: 1.45, maxHeight: 400 },
  );

  useDrag(wrapRef, {
    hit: (x, y) => {
      const p = plotRef.current;
      if (!p) return null;
      return Math.hypot(x - p.X(A + h), y - p.Y(SQ(A + h))) < 22 ? 'q' : null;
    },
    onDrag: (_id, x) => {
      const p = plotRef.current;
      if (!p) return;
      const nh = p.invX(x) - A;
      if (Math.abs(nh) < 1e-9) return;
      setSide(nh > 0 ? 1 : -1);
      setT(tOf(Math.abs(nh)));
    },
  });

  return (
    <Figure
      no={1}
      title="할선이 접선이 되는 순간"
      hint="점 Q를 P 쪽으로 끌거나 h 슬라이더를 오른쪽으로 옮기세요"
      caption={
        <>
          파란 곡선은 y = x²이고, P는 x = 1인 점입니다. 빨간 직선은 P와 Q를 잇는 할선, 초록 점선은 P에서의 접선(기울기 2)입니다. 할선의 기울기는 <M>{'\\Delta y / h = ((1+h)^2-1)/h = 2+h'}</M>라서, h가 0에 가까워질수록 2에 가까워집니다. h 슬라이더는 1.5에서 0.001까지 로그 눈금입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`h = ${n6(h)}일 때 할선의 기울기는 ${n6(q)}입니다. 접선의 기울기는 2입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg
            value={side}
            onChange={setSide}
            options={[
              { value: 1, label: '오른쪽에서 (h > 0)' },
              { value: -1, label: '왼쪽에서 (h < 0)' },
            ]}
          />
          <Slider id="dv-h" label="|h| (오른쪽일수록 작게)" value={t} min={0} max={1} step={0.005} onChange={setT} format={() => n6(Math.abs(h))} color="var(--bad)" />
          <Check label="접선 보기" checked={tangent} onChange={setTangent} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="할선의 기울기" value={n6(q)} color="var(--bad)" />
            <Readout label="2와의 차이" value={n6(q - 2)} />
          </div>
          <div className="tbl-wrap">
            <table className="dv-table">
              <thead>
                <tr>
                  <th>h</th>
                  <th>(f(1+h) − f(1)) / h</th>
                </tr>
              </thead>
              <tbody>
                {TABLE_H.map((hv) => (
                  <tr key={hv} data-on={Math.abs(Math.abs(h) - hv) < hv * 0.03 || undefined}>
                    <td className="mono">{side * hv}</td>
                    <td className="mono">{n6(diffQuot(SQ, A, side * hv))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: making h too small on a computer ─────────────── */

const FT = floatTable(16);
const BEST = FT.reduce((b, r) => (r.err < b.err ? r : b), FT[0]);

function FloatFigure() {
  const P = usePalette();
  const [k, setK] = useState(4);
  const row = FT[k - 1];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -16.5, xMax: -0.5, yMin: -9.5, yMax: 1, pad: { l: 52, r: 14, t: 14, b: 34 } });
      p.grid({ xStep: 1, yStep: 1, fmt: (v) => (Math.round(v) === v ? `10^${v}` : '') });
      const lg = (v: number) => Math.log10(Math.max(v, 1e-300));
      // the two error sources: truncation ≈ (e/2)·h, rounding ≈ e·ε/h with ε = 2^-52
      const EPS = Math.pow(2, -52);
      p.fn((x) => lg((Math.E / 2) * Math.pow(10, x)), alpha(P.good, 0.75), 1.5, { dash: [5, 4] });
      p.fn((x) => lg((Math.E * EPS) / Math.pow(10, x)), alpha(P.bad, 0.75), 1.5, { dash: [5, 4] });
      const pts = FT.map((r) => [-r.k, lg(r.err)] as const);
      ctx.save();
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(p.X(x), p.Y(y)) : ctx.moveTo(p.X(x), p.Y(y))));
      ctx.stroke();
      ctx.restore();
      pts.forEach(([x, y], i) => p.dot(x, y, i + 1 === k ? 7 : 4, i + 1 === k ? P.hl : P.accent, P.surface, 1.5));
      p.text('← h가 작을수록 왼쪽', p.xMin, p.yMin, P.ink3, { dy: 26, font: `500 11px ${P.fontBody}` });
      p.text(`가장 작은 오차: h = 10^-${BEST.k}`, -BEST.k, lg(BEST.err), P.ink2, { dy: 16, align: 'center', font: `600 11px ${P.fontBody}`, bg: P.surface });
    },
    [P, k],
    { aspect: 1.9, maxHeight: 340 },
  );

  return (
    <Figure
      no={2}
      title="컴퓨터에서 h를 너무 줄이면"
      hint="슬라이더로 h = 10의 −k 제곱을 고르세요"
      caption={
        <>
          <M>{'f(x)=e^x'}</M>의 x = 1에서의 차분 몫을 이 브라우저의 64비트 부동소수점으로 계산해 참값 e = 2.718281828…과 비교했습니다. 가로축은 h, 세로축은 오차이고 둘 다 로그 눈금입니다. 초록 점선은 h가 커서 생기는 오차, 빨간 점선은 반올림 때문에 생기는 오차의 어림값입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="dv-k" label="h = 10^−k 의 k" value={k} min={1} max={16} step={1} onChange={setK} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`h = 10^-${k}일 때 차분 몫은 ${row.q}이고 오차는 ${row.err.toExponential(2)}입니다. 오차는 h = 10^-${BEST.k}에서 가장 작습니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts">
        <Readout label="h" value={`10^-${k}`} />
        <Readout label="(e^(1+h) − e) / h" value={row.q.toPrecision(12)} />
        <Readout label="참값과의 오차" value={row.err.toExponential(2)} color={k === BEST.k ? 'var(--good)' : k > 12 ? 'var(--bad)' : undefined} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the derivative as a function ─────────────── */

function DerivativeFigure() {
  const P = usePalette();
  const [id, setId] = useState('cubic');
  const pre = PRESETS.find((p) => p.id === id)!;
  const [x0s, setX0s] = useState<Record<string, number>>({});
  const x0 = x0s[id] ?? pre.x0;
  const setX0 = (v: number) => setX0s((m) => ({ ...m, [id]: v }));
  const topRef = useRef<Plot | null>(null);
  const corner = id === 'abs' && Math.abs(x0) < 0.02;
  const slope = corner ? NaN : pre.df(x0);
  const lo = id === 'ln' ? 0.1 : pre.xLo + 0.1;
  const hi = pre.xHi - 0.1;
  const dRange = useMemo(() => {
    let a = Infinity, b = -Infinity;
    for (let i = 0; i <= 200; i++) {
      const v = pre.df(pre.xLo + ((pre.xHi - pre.xLo) * i) / 200);
      if (isFinite(v)) {
        a = Math.min(a, v);
        b = Math.max(b, v);
      }
    }
    const lo2 = Math.max(a, -6), hi2 = Math.min(b, 8);
    const pad = Math.max(0.5, (hi2 - lo2) * 0.12);
    return [Math.min(lo2 - pad, -0.5), Math.max(hi2 + pad, 0.5)];
  }, [pre]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const half = h / 2;
      const top = new Plot(ctx, w, half, P, { xMin: pre.xLo, xMax: pre.xHi, yMin: pre.yLo, yMax: pre.yHi, pad: { l: 40, r: 14, t: 18, b: 26 } });
      topRef.current = top;
      top.grid({ labels: true });
      top.fn(pre.f, P.accent, 2.5);
      if (!corner && isFinite(slope)) top.slopeLine(x0, pre.f(x0), slope, P.bad, 2);
      top.dot(x0, pre.f(x0), 7, P.bad, P.surface, 2.5);
      top.text('f', pre.xLo, pre.yHi, P.accent, { dx: 6, dy: 4, font: `700 13px ${P.fontMono}` });
      ctx.save();
      ctx.translate(0, half);
      const bot = new Plot(ctx, w, half, P, { xMin: pre.xLo, xMax: pre.xHi, yMin: dRange[0], yMax: dRange[1], pad: { l: 40, r: 14, t: 18, b: 24 } });
      bot.grid();
      if (id === 'abs') {
        bot.fn(pre.df, P.good, 2.5, { to: -1e-9 });
        bot.fn(pre.df, P.good, 2.5, { from: 1e-9 });
      } else bot.fn(pre.df, P.good, 2.5);
      if (id === 'exp') bot.fn(pre.f, alpha(P.accent, 0.5), 5, { dash: [2, 6] });
      if (!corner && isFinite(slope)) {
        bot.line(x0, 0, x0, slope, alpha(P.bad, 0.6), 1.5, [4, 3]);
        bot.dot(x0, slope, 7, P.bad, P.surface, 2.5);
      }
      bot.text("f′", pre.xLo, dRange[1], P.good, { dx: 6, dy: 6, font: `700 13px ${P.fontMono}` });
      ctx.restore();
      ctx.strokeStyle = P.line;
      ctx.beginPath();
      ctx.moveTo(0, half + 0.5);
      ctx.lineTo(w, half + 0.5);
      ctx.stroke();
      // the guide joining the two plots
      ctx.strokeStyle = alpha(P.bad, 0.35);
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(top.X(x0), top.Y(pre.f(x0)));
      ctx.lineTo(top.X(x0), h - 24);
      ctx.stroke();
      ctx.setLineDash([]);
    },
    [P, pre, x0, slope, corner, dRange, id],
    { aspect: 1.05, maxHeight: 560 },
  );

  useDrag(wrapRef, {
    hit: (x, y) => {
      const p = topRef.current;
      if (!p) return null;
      return Math.abs(x - p.X(x0)) < 24 && y < p.h ? 'x0' : null;
    },
    onDrag: (_id, x) => {
      const p = topRef.current;
      if (!p) return;
      setX0(Math.max(lo, Math.min(hi, Math.round(p.invX(x) * 100) / 100)));
    },
    onEmpty: (x, y) => {
      const p = topRef.current;
      if (!p || y > p.h) return;
      setX0(Math.max(lo, Math.min(hi, Math.round(p.invX(x) * 100) / 100)));
    },
  });

  return (
    <Figure
      no={3}
      title="도함수: 기울기를 모아 그린 함수"
      hint="위 그래프를 눌러 접점을 옮기세요"
      caption={
        <>
          위는 함수 f(파랑)와 고른 점에서의 접선(빨강), 아래는 그 접선의 기울기를 x마다 찍어 이은 도함수 f′(초록)입니다. 접선이 오르막이면 f′ &gt; 0, 내리막이면 f′ &lt; 0, 꼭대기나 바닥에서 수평이면 f′ = 0입니다.{id === 'exp' ? ' eˣ에서는 아래 그림에 f를 흐린 점선으로 겹쳐 그렸습니다. 두 곡선이 정확히 겹칩니다.' : ''}
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={setId} options={PRESETS.map((p) => ({ value: p.id, label: p.name }))} />
        <Slider id="dv-x0" label="접점 x" value={x0} min={lo} max={hi} step={0.01} onChange={setX0} format={(v) => v.toFixed(2)} />
      </div>
      <div className="dv-formula">
        <MB>{`f(x) = ${pre.tex} \\qquad f'(x) = ${pre.dtex}`}</MB>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`f(x) = ${pre.name}. x = ${x0.toFixed(2)}에서 ${corner ? '꺾인 점이라 미분할 수 없습니다' : `접선의 기울기 f′ = ${slope.toFixed(3)}`}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts">
        <Readout label="x" value={x0.toFixed(2)} />
        <Readout label="f(x)" value={pre.f(x0).toFixed(3)} color="var(--accent)" />
        <Readout label="f′(x) = 접선의 기울기" value={corner ? '없음 (꺾인 점)' : slope.toFixed(3)} color={corner ? 'var(--bad)' : 'var(--good)'} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: product and chain rules ─────────────── */

const U = 3;
const V = 2;

function ProductCanvas({ du, dv }: { du: number; dv: number }) {
  const P = usePalette();
  const pc = productPieces(U, V, du, dv);
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const s = Math.min((w - 70) / (U + 1), (h - 50) / (V + 1));
      const x0 = 46, y0 = h - 30;
      const R = (x: number, y: number, ww: number, hh: number, fill: string) => {
        ctx.fillStyle = fill;
        ctx.fillRect(x0 + x * s, y0 - (y + hh) * s, ww * s, hh * s);
        ctx.strokeStyle = P.surface;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x0 + x * s, y0 - (y + hh) * s, ww * s, hh * s);
      };
      R(0, 0, U, V, alpha(P.accent, 0.35));
      R(U, 0, du, V, alpha(P.neg, 0.55));
      R(0, V, U, dv, alpha(P.pos, 0.55));
      R(U, V, du, dv, alpha(P.hl, 0.95));
      ctx.fillStyle = P.ink;
      ctx.font = `600 13px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`u·v = ${pc.before}`, x0 + (U / 2) * s, y0 - (V / 2) * s);
      if (du * s > 30) ctx.fillText(`v·Δu`, x0 + (U + du / 2) * s, y0 - (V / 2) * s);
      if (dv * s > 18) ctx.fillText(`u·Δv`, x0 + (U / 2) * s, y0 - (V + dv / 2) * s);
      ctx.font = `500 11px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.fillText(`u = ${U}`, x0 + (U / 2) * s, y0 + 14);
      ctx.fillText(`Δu`, x0 + (U + du / 2) * s, y0 + 14);
      ctx.save();
      ctx.translate(x0 - 16, y0 - (V / 2) * s);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`v = ${V}`, 0, 0);
      ctx.restore();
    },
    [P, du, dv],
    { aspect: 1.5, maxHeight: 300 },
  );
  return (
    <>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`가로 ${U}, 세로 ${V}인 직사각형을 가로 ${du}, 세로 ${dv}만큼 늘렸습니다. 늘어난 넓이 ${pc.change.toFixed(3)}는 v·Δu = ${pc.vDu.toFixed(3)}, u·Δv = ${pc.uDv.toFixed(3)}, 귀퉁이 Δu·Δv = ${pc.duDv.toFixed(3)}의 합입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts">
        <Readout label="늘어난 넓이" value={pc.change.toFixed(3)} />
        <Readout label="v·Δu" value={pc.vDu.toFixed(3)} color="var(--neg)" />
        <Readout label="u·Δv" value={pc.uDv.toFixed(3)} color="var(--pos)" />
        <Readout label="귀퉁이 Δu·Δv" value={pc.duDv.toFixed(3)} />
      </div>
    </>
  );
}

function ChainCanvas({ x, dx }: { x: number; dx: number }) {
  const P = usePalette();
  const c = chainNudge(x, dx);
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const L0 = Math.min(90, w * 0.16);
      const rows = [
        { name: 'x', val: x, d: dx, color: P.ink },
        { name: 'u = x²', val: c.u, d: c.du, color: P.neg },
        { name: 'y = sin u', val: c.y, d: c.dy, color: P.pos },
      ];
      const cx = w * 0.42;
      rows.forEach((r, i) => {
        const y = 30 + i * ((h - 50) / 2);
        ctx.strokeStyle = P.lineStrong;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(110, y);
        ctx.lineTo(w - 12, y);
        ctx.stroke();
        ctx.fillStyle = r.color;
        ctx.font = `600 12px ${P.fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(r.name, 4, y);
        // the nudge, drawn at a scale where Δx is L0 pixels long
        const len = (L0 * r.d) / dx;
        ctx.fillStyle = alpha(r.color, 0.25);
        ctx.fillRect(cx, y - 9, len, 18);
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx, y - 9, len, 18);
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.arc(cx, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = P.ink2;
        ctx.font = `500 11px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.fillText(r.val.toFixed(3), cx, y + 20);
        ctx.textAlign = 'left';
        ctx.fillText(`Δ = ${r.d.toFixed(4)}`, cx + Math.max(len, 0) + 8, y);
        if (i > 0) {
          const ratio = r.d / rows[i - 1].d;
          ctx.fillStyle = P.ink3;
          ctx.textAlign = 'left';
          ctx.fillText(`× ${ratio.toFixed(3)}`, 110, y - (h - 50) / 4);
        }
      });
    },
    [P, x, dx, c],
    { aspect: 2.2, maxHeight: 260 },
  );
  return (
    <>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`x = ${x}을 ${dx}만큼 움직이면 u = x²은 ${c.du.toFixed(4)}, y = sin u는 ${c.dy.toFixed(4)}만큼 움직입니다. 비율은 ${(c.du / dx).toFixed(3)}와 ${(c.dy / c.du).toFixed(3)}이고 곱은 ${(c.dy / dx).toFixed(3)}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts">
        <Readout label="Δu / Δx" value={(c.du / dx).toFixed(3)} color="var(--neg)" />
        <Readout label="Δy / Δu" value={(c.dy / c.du).toFixed(3)} color="var(--pos)" />
        <Readout label="Δy / Δx" value={(c.dy / dx).toFixed(3)} />
        <Readout label="극한: cos(x²)·2x" value={c.dydx.toFixed(3)} color="var(--good)" />
      </div>
    </>
  );
}

function RulesFigure() {
  const [mode, setMode] = useState<'product' | 'chain'>('product');
  const [du, setDu] = useState(0.5);
  const [dv, setDv] = useState(0.4);
  const [x, setX] = useState(1);
  const [dx, setDx] = useState(0.1);
  return (
    <Figure
      no={4}
      title={mode === 'product' ? '곱의 법칙: 늘어나는 직사각형' : '연쇄 법칙: 변화율이 곱해진다'}
      hint="Δ를 작게 만들어 보세요"
      caption={
        mode === 'product' ? (
          <>
            넓이 u·v인 직사각형의 두 변이 Δu, Δv만큼 늘어나면 넓이는 세 조각만큼 늘어납니다. 오른쪽 띠 v·Δu, 위쪽 띠 u·Δv, 그리고 노란 귀퉁이 Δu·Δv입니다. Δ가 작아지면 귀퉁이는 Δ의 제곱으로 줄어서 나머지 둘에 비해 사라집니다.
          </>
        ) : (
          <>
            세 수직선은 x, u = x², y = sin u입니다. x를 Δx만큼 움직이면 u와 y가 얼마나 움직이는지 같은 배율로 그렸습니다. 왼쪽의 ×는 한 줄에서 다음 줄로 넘어갈 때 늘어나는 비율입니다. Δx를 줄이면 두 비율이 각각 u′ = 2x와 dy/du = cos u로 다가가고, 전체 비율은 그 곱으로 다가갑니다.
          </>
        )
      }
    >
      <div className="controls row">
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { value: 'product', label: '곱의 법칙' },
            { value: 'chain', label: '연쇄 법칙' },
          ]}
        />
        {mode === 'product' ? (
          <>
            <Slider id="dv-du" label="Δu" value={du} min={0.01} max={1} step={0.01} onChange={setDu} color="var(--neg)" />
            <Slider id="dv-dv" label="Δv" value={dv} min={0.01} max={1} step={0.01} onChange={setDv} color="var(--pos)" />
          </>
        ) : (
          <>
            <Slider id="dv-x" label="x" value={x} min={0.2} max={2} step={0.05} onChange={setX} format={(v) => v.toFixed(2)} />
            <Slider id="dv-dx" label="Δx" value={dx} min={0.005} max={0.3} step={0.005} onChange={setDx} format={(v) => v.toFixed(3)} />
          </>
        )}
      </div>
      {mode === 'product' ? <ProductCanvas du={du} dv={dv} /> : <ChainCanvas x={x} dx={dx} />}
      <Legend
        items={
          mode === 'product'
            ? [
                { color: 'var(--neg)', label: 'v·Δu', shape: 'sq' },
                { color: 'var(--pos)', label: 'u·Δv', shape: 'sq' },
                { color: 'var(--hl)', label: 'Δu·Δv', shape: 'sq' },
              ]
            : [
                { color: 'var(--neg)', label: 'u = x²', shape: 'sq' },
                { color: 'var(--pos)', label: 'y = sin u', shape: 'sq' },
              ]
        }
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Derivatives() {
  return (
    <>
      <h2>순간의 기울기</h2>
      <p>
        자동차가 2시간에 160km를 갔다면 평균 속도는 시속 80km입니다. 그런데 속도계가 가리키는 "지금 이 순간의 속도"는 무엇일까요? 한 순간에는 움직인 거리도 0, 걸린 시간도 0이라서 0 ÷ 0이 됩니다. <a href={lessonHref('math-calculus', 'limits')}>앞 장</a>의 극한이 바로 이 문제를 풉니다. 시간 간격 h를 0이 아닌 수로 두고 평균 속도를 계산한 뒤, h를 0으로 보내는 것입니다.
      </p>
      <p>
        그래프로 보면 평균 변화율은 두 점 P, Q를 잇는 <T en="secant line">할선</T>의 기울기이고, 순간 변화율은 P에서 곡선에 닿는 <T en="tangent line">접선</T>의 기울기입니다. 그림 1에서 Q를 P 쪽으로 끌어 보세요.
      </p>
      <SecantFigure />
      <p>
        h = 1이면 할선의 기울기는 3, h = 0.1이면 2.1, h = 0.001이면 2.001입니다. 왼쪽에서 다가가도(h &lt; 0) 1.9, 1.99, 1.999로 같은 2에 모입니다. 이 극한값을 f의 a에서의 <T en="derivative">미분계수</T>라고 하고 f′(a)로 씁니다.
      </p>
      <MB note="h는 0이 아니므로 나눗셈이 가능하고, 극한은 그 결과가 어디로 가는지를 묻습니다">{"f'(a) = \\lim_{h\\to 0} \\frac{f(a+h)-f(a)}{h}"}</MB>
      <p>
        y = x²이면 분자가 <M>{'(a+h)^2 - a^2 = 2ah + h^2'}</M>이므로 몫은 2a + h이고, h → 0이면 2a입니다. a = 1이면 2로, 그림과 같습니다.
      </p>

      <h2>컴퓨터로 h를 줄이면</h2>
      <p>
        극한을 컴퓨터로 흉내 내려면 h에 아주 작은 수를 넣으면 될 것 같습니다. 그림 2는 eˣ의 x = 1에서의 차분 몫을 h = 0.1부터 10<sup>−16</sup>까지 실제로 계산한 것입니다. h를 10배 줄일 때마다 오차도 10배씩 줄다가(h = 0.1에서 0.14, h = 10<sup>−7</sup>에서 0.00000014), h = 10<sup>−8</sup>에서 6.6 × 10<sup>−9</sup>으로 가장 작아진 뒤 다시 커집니다. h = 10<sup>−15</sup>에서는 0.39나 틀리고, 10<sup>−16</sup>에서는 몫이 0이 됩니다.
      </p>
      <FloatFigure />
      <p>
        이유는 <a href={lessonHref('cs-architecture', 'binary')}>부동소수점</a>에 있습니다. 64비트 실수는 유효숫자가 16자리쯤이라, 1 + 10<sup>−16</sup>은 1과 구별되지 않습니다. 그래서 f(1 + h) − f(1)에서 거의 같은 두 수를 빼면 앞자리가 모두 지워지고 반올림 찌꺼기만 남는데(이것을 <T en="catastrophic cancellation">자릿수 상실</T>이라고 합니다), 그것을 작은 h로 나누니 찌꺼기가 크게 불어납니다. h가 크면 극한에서 멀어서 틀리고, h가 너무 작으면 반올림 때문에 틀립니다. 두 오차가 비슷해지는 h ≈ 10<sup>−8</sup>, 유효숫자의 절반쯤 되는 곳이 가장 좋습니다.
      </p>
      <Callout kind="note">
        그래서 신경망을 학습시킬 때는 차분 몫으로 기울기를 구하지 않습니다. 이 장에서 볼 미분 규칙을 기계적으로 적용하는 자동 미분으로 정확한 도함수를 계산하고, 차분 몫은 그 구현이 맞는지 확인하는 데만 씁니다. <a href={lessonHref('ai-basics', 'derivatives')}>기초 인공지능의 미분 장</a>과 <a href={lessonHref('ai-basics', 'backprop')}>역전파</a> 장에서 이어집니다.
      </Callout>

      <h2>도함수: 기울기를 함수로</h2>
      <p>
        미분계수는 점마다 하나씩 있으므로, x에 그 점의 기울기를 대응시키면 새 함수가 생깁니다. 이것이 <T en="derivative function">도함수</T> f′입니다. 그림 3에서 x³ − 3x를 고르고 접점을 왼쪽에서 오른쪽으로 옮겨 보세요. 접선이 오르막인 동안 아래 초록 곡선은 0보다 위에 있고, x = −1과 x = 1에서 접선이 수평이 되며 f′ = 0을 지납니다. 위 그래프의 봉우리와 골짜기가 정확히 그 자리에 있습니다.
      </p>
      <DerivativeFigure />
      <p>
        다른 함수들도 바꿔 보세요. 몇 가지는 꼭 기억할 만합니다.
      </p>
      <ul>
        <li>
          <strong>거듭제곱</strong>: <M>{"(x^n)' = n x^{n-1}"}</M>. x² → 2x, x³ → 3x²입니다.
        </li>
        <li>
          <strong>지수 함수</strong>: <M>{"(e^x)' = e^x"}</M>. eˣ를 고르면 아래 그림에서 f′가 f와 정확히 겹칩니다. 어디서든 기울기가 높이와 같은 함수이고, e = 2.71828…은 이 성질이 성립하도록 정한 밑입니다. 그래서 자라는 속도가 지금의 크기에 비례하는 인구, 이자, 방사능 붕괴가 모두 e로 표현됩니다.
        </li>
        <li>
          <strong>로그 함수</strong>: <M>{"(\\ln x)' = 1/x"}</M>. 로그는 x가 커질수록 점점 느리게 자라고, 그 기울기는 x에 반비례합니다.
        </li>
        <li>
          <strong>삼각 함수</strong>: <M>{"(\\sin x)' = \\cos x,\\ (\\cos x)' = -\\sin x"}</M>. 단위원 위를 일정한 빠르기로 도는 점의 높이가 sin x이면, 그 높이가 변하는 빠르기는 점의 속도 중 세로 성분인 cos x입니다. 꼭대기(x = π/2)에서는 잠깐 수평으로 움직이므로 cos(π/2) = 0입니다.
        </li>
        <li>
          <strong>꺾인 점</strong>: |x|는 x = 0에서 왼쪽 기울기 −1과 오른쪽 기울기 1이 달라 극한이 없으므로 미분할 수 없습니다. 연속이라도 미분 가능하지 않을 수 있습니다.
        </li>
      </ul>

      <h2>곱의 법칙과 연쇄 법칙</h2>
      <p>
        복잡한 함수를 매번 극한으로 미분할 필요는 없습니다. 몇 가지 규칙으로 단순한 함수의 도함수를 조립하면 됩니다. 더하기는 쉽습니다. (f + g)′ = f′ + g′입니다. 곱은 조금 다릅니다. 그림 4의 직사각형에서 가로 u = 3, 세로 v = 2를 각각 Δu = 0.5, Δv = 0.4만큼 늘리면 넓이는 6에서 8.4로 2.4 늘어납니다. 그중 v·Δu = 1, u·Δv = 1.2이고 귀퉁이 Δu·Δv = 0.2입니다. 두 Δ를 0.1과 0.08로 줄이면 늘어난 넓이 0.448 중 귀퉁이는 0.008뿐입니다. Δ를 0으로 보내면 귀퉁이는 사라지고 곱의 법칙이 남습니다.
      </p>
      <MB>{"(uv)' = u'v + uv'"}</MB>
      <RulesFigure />
      <p>
        "연쇄 법칙"을 고르면 함수를 함수에 넣은 합성 함수 y = sin(x²)을 봅니다. x = 1에서 x를 0.1 움직이면 u = x²은 0.21 움직이고(2.1배), y = sin u는 0.0941 움직입니다(u의 변화의 0.448배). 전체 배율은 두 배율의 곱 0.941입니다. Δx를 0.01로 줄이면 1.069가 되고, 0으로 보내면 u′ = 2x = 2와 dy/du = cos 1 = 0.540의 곱 1.081로 다가갑니다. 톱니바퀴 두 개를 맞물려 놓은 것과 같아서, 변화율은 단계마다 곱해집니다.
      </p>
      <MB note="겉함수의 미분에 속함수의 값을 넣고, 속함수의 미분을 곱한다">{"\\frac{dy}{dx} = \\frac{dy}{du}\\cdot\\frac{du}{dx}, \\qquad (f(g(x)))' = f'(g(x))\\, g'(x)"}</MB>
      <p>
        몫의 법칙 <M>{"(u/v)' = (u'v - uv')/v^2"}</M>은 u · (1/v)에 곱의 법칙과 연쇄 법칙을 적용하면 나옵니다. 신경망의 역전파는 연쇄 법칙을 수백만 번 이어 적용한 것입니다. 층이 함수의 합성이므로, 출력에서 입력 쪽으로 단계마다 변화율을 곱해 나가면 모든 가중치의 기울기가 나옵니다.
      </p>

      <Callout kind="key">
        미분계수는 할선 기울기 (f(a + h) − f(a))/h의 h → 0 극한이고, 그래프에서는 접선의 기울기입니다. 점마다 기울기를 모으면 도함수 f′가 되어, f가 오르는 곳에서 양수, 내리는 곳에서 음수, 꼭대기와 바닥에서 0입니다. 컴퓨터로 h를 너무 줄이면 반올림 오차 때문에 오히려 틀어집니다. 거듭제곱, eˣ, ln x, sin x의 도함수와 곱의 법칙, 연쇄 법칙만 있으면 대부분의 함수를 미분할 수 있고, 연쇄 법칙은 변화율이 단계마다 곱해진다는 뜻입니다.
      </Callout>
      <Quiz
        q={
          <>
            <M>{'y = e^{3x}'}</M>의 x = 0에서의 기울기는?
          </>
        }
        options={['1', '3', 'e³', '3e']}
        answer={1}
        explain={
          <>
            u = 3x로 두면 y = eᵘ입니다. 연쇄 법칙으로 dy/dx = eᵘ · 3 = 3e³ˣ이고, x = 0에서 3 · e⁰ = 3입니다. 겉함수 eᵘ의 미분은 그대로 eᵘ이지만, 속함수 3x가 x보다 3배 빨리 변하므로 기울기도 3배가 됩니다.
          </>
        }
      />
    </>
  );
}
