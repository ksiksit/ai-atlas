import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { KINKS, MVT_FNS, WA, WB, expBound, expError, expTaylor, hypotheses, mvtPoints, quotients, steepness, termsFor, weierstrass, type Kink } from './diff';
import './analysis.css';
import './differentiability.css';

const q6 = (v: number) => (Math.abs(v) < 5e-7 ? '0.000000' : v.toFixed(6));
const hLabel = (h: number) => `10^{${Math.round(Math.log10(h))}}`;

/** A proof set apart from the prose, ending with ∎. */
function Proof({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="df-proof">
      <div className="df-proof-head">{title}</div>
      {children}
    </div>
  );
}
const Qed = () => <span className="df-qed">∎</span>;

/** Grid with separate label formats for the x and y axes (Plot.grid uses one format for both). */
function gridXY(p: Plot, xStep: number, yStep: number, fx: (v: number) => string, fy: (v: number) => string) {
  p.grid({ xStep, yStep, labels: false });
  const c = p.ctx;
  c.save();
  c.fillStyle = p.p.ink3;
  c.font = `11px ${p.p.fontMono}`;
  c.textAlign = 'center';
  c.textBaseline = 'top';
  for (let x = Math.ceil(p.xMin / xStep - 1e-9) * xStep; x <= p.xMax + 1e-9; x += xStep) c.fillText(fx(x), p.X(x), p.pad.t + p.ph + 6);
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  for (let y = Math.ceil(p.yMin / yStep - 1e-9) * yStep; y <= p.yMax + 1e-9; y += yStep) c.fillText(fy(y), p.pad.l - 6, p.Y(y));
  c.restore();
}

/* ─────────────── Figure 1: continuous at 0, but the derivative misbehaves ─────────────── */

const KINK_NOTE: Record<Kink['id'], string> = {
  abs: '오른쪽에서 재면 1, 왼쪽에서 재면 −1입니다. 두 한쪽 극한이 달라 미분계수가 없습니다. 아무리 확대해도 꺾인 모서리가 그대로 남습니다.',
  xsin: '차분몫이 sin(1/h)이라 h를 줄여도 −1과 1 사이를 계속 오갑니다. 극한이 없으니 미분 불가능합니다. 그래프는 두 직선 y = ±x 사이에서 점점 빠르게 진동합니다.',
  x2sin: '차분몫이 h sin(1/h)이라 0으로 갑니다. 미분계수 f′(0) = 0이 있습니다. 그런데 아래 도함수 그래프는 0 근처에서 −1과 1 사이를 오가며 0으로 가지 않으므로, f′는 0에서 연속이 아닙니다.',
};

function KinkFigure() {
  const P = usePalette();
  const [id, setId] = useState<Kink['id']>('abs');
  const [zoom, setZoom] = useState(0);
  const k = KINKS.find((x) => x.id === id)!;
  const table = useMemo(() => quotients(k), [k]);
  const w = Math.pow(10, -zoom);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: W, h: H }) => {
      const top = H * 0.62;
      const p = new Plot(ctx, W, top, P, { xMin: -w, xMax: w, yMin: -w, yMax: w, pad: { l: 58, r: 12, t: 12, b: 24 } });
      p.grid({ xStep: w / 2, yStep: w / 2, fmt: (v) => (Math.abs(v) < 1e-12 ? '0' : String(+v.toPrecision(3))) });
      if (id !== 'abs') {
        const env = id === 'xsin' ? (x: number) => Math.abs(x) : (x: number) => x * x;
        p.fn(env, alpha(P.ink3, 0.7), 1, { dash: [4, 4] });
        p.fn((x) => -env(x), alpha(P.ink3, 0.7), 1, { dash: [4, 4] });
      }
      p.fn(k.f, P.accent, 2, { samples: 2400 });
      p.dot(0, 0, 4.5, P.ink, P.surface, 2);
      p.text('f(x)', p.xMin, p.yMax, P.ink3, { dx: 6, dy: 10, font: `600 11px ${P.fontBody}` });
      // the derivative below, for x ≠ 0
      ctx.save();
      ctx.translate(0, top);
      const q = new Plot(ctx, W, H - top, P, { xMin: -w, xMax: w, yMin: -2.2, yMax: 2.2, pad: { l: 58, r: 12, t: 10, b: 22 } });
      q.grid({ xStep: w / 2, yStep: 1, fmt: (v) => (Math.abs(v) < 1e-12 ? '0' : String(+v.toPrecision(3))) });
      q.fn((x) => (x === 0 ? NaN : k.df(x)), P.pos, 1.5, { samples: 2400 });
      q.text("f′(x), x ≠ 0", q.xMin, q.yMax, P.ink3, { dx: 6, dy: 8, font: `600 11px ${P.fontBody}` });
      ctx.restore();
    },
    [P, k, w, id],
    { aspect: 1.15, maxHeight: 520 },
  );

  return (
    <Figure
      no={1}
      title="0에서 연속이지만"
      hint="함수를 고르고 0 쪽으로 확대해 보세요"
      caption={
        <>
          위쪽 파란 곡선이 f, 아래쪽 주황 곡선이 0이 아닌 x에서의 도함수 f′입니다. 위 그래프는 가로와 세로를 같은 배율로 확대하므로, 미분 가능한 점에서는 확대할수록 그래프가 직선처럼 펴집니다. 점선은 x sin(1/x)에서는 y = ±x, x² sin(1/x)에서는 y = ±x²입니다. 표는 원점에서의 차분몫 (f(±h) − f(0)) / (±h)를 컴퓨터로 계산한 값입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={setId} options={KINKS.map((x) => ({ value: x.id, label: <M>{x.tex}</M> }))} />
        <Slider id="df-zoom" label="확대" value={zoom} min={0} max={3} step={0.1} onChange={setZoom} format={(v) => `${Math.round(Math.pow(10, v)).toLocaleString('ko-KR')}배`} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`f(x) = ${k.id === 'abs' ? '|x|' : k.id === 'xsin' ? 'x sin(1/x)' : 'x² sin(1/x)'}를 원점 근처 가로 ±${+w.toPrecision(3)} 범위에서 그렸고, 아래에 도함수를 그렸습니다. ${KINK_NOTE[id]}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="an-col">
          <div className="tbl-wrap">
            <table className="df-table">
              <thead>
                <tr>
                  <th>h</th>
                  <th>오른쪽 차분몫</th>
                  <th>왼쪽 차분몫</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r) => (
                  <tr key={r.h}>
                    <td>
                      <M>{hLabel(r.h)}</M>
                    </td>
                    <td className="mono">{q6(r.right)}</td>
                    <td className="mono">{q6(r.left)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="an-note" aria-live="polite">
            {KINK_NOTE[id]}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the Weierstrass function under a microscope ─────────────── */

const SAMPLES = 1500;

function WeierstrassFigure() {
  const P = usePalette();
  const [x0, setX0] = useState(0.3);
  const [zoom, setZoom] = useState(0);
  const w = 2 / Math.pow(10, zoom);
  const st = useMemo(() => steepness(x0, w, SAMPLES), [x0, w]);
  const terms = termsFor(w, SAMPLES);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: W, h: H }) => {
      const xs: number[] = [];
      const ys: number[] = [];
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i <= SAMPLES; i++) {
        const x = x0 - w / 2 + (w * i) / SAMPLES;
        const y = weierstrass(x, terms);
        xs.push(x);
        ys.push(y);
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
      const m = (hi - lo) * 0.08 || 0.1;
      const p = new Plot(ctx, W, H, P, { xMin: x0 - w / 2, xMax: x0 + w / 2, yMin: lo - m, yMax: hi + m, pad: { l: 58, r: 12, t: 12, b: 26 } });
      p.grid({ fmt: (v) => String(+v.toPrecision(5)) });
      ctx.save();
      p.clip();
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      xs.forEach((x, i) => (i ? ctx.lineTo(p.X(x), p.Y(ys[i])) : ctx.moveTo(p.X(x), p.Y(ys[i]))));
      ctx.stroke();
      ctx.restore();
      p.line(x0, p.yMin, x0, p.yMax, alpha(P.ink3, 0.6), 1, [4, 4]);
    },
    [P, x0, w, terms],
    { aspect: 1.7, maxHeight: 360 },
  );

  return (
    <Figure
      no={2}
      title="바이어슈트라스 함수를 확대하기"
      hint="확대 슬라이더를 끝까지 밀어 보세요"
      caption={
        <>
          <M>{`W(x) = \\sum_{n \\ge 0} (1/2)^n \\cos(13^n \\pi x)`}</M>를 점선의 점을 중심으로 확대합니다. 세로 범위는 창 안의 그래프에 맞춰 자동으로 정합니다. 무한히 많은 항을 더할 수는 없으므로, 그 창에서 파장이 보이는 항까지만 더하고 한 항을 더 붙입니다. 그보다 잘게 떠는 항은 픽셀보다 작습니다. 오른쪽 수는 창 안 그래프의 높이를 창의 너비로 나눈 값으로, 매끄러운 함수라면 확대할수록 그 점의 기울기 크기에 가까워집니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="df-wx" label="중심 x" value={x0} min={0} max={1} step={0.01} onChange={setX0} />
        <Slider id="df-wz" label="확대" value={zoom} min={0} max={4} step={0.1} onChange={setZoom} format={(v) => `${Math.round(Math.pow(10, v)).toLocaleString('ko-KR')}배`} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`바이어슈트라스 함수를 x = ${x0} 근처 너비 ${+w.toPrecision(3)}인 창에서 그렸습니다. 항 ${terms}개를 더했고, 창 안 그래프의 높이를 너비로 나눈 값은 ${st.ratio.toFixed(1)}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label="창의 너비" value={<span className="mono">{+w.toPrecision(3)}</span>} />
        <Readout label="더한 항" value={<span className="mono">{terms}개</span>} />
        <Readout label="높이 ÷ 너비" value={<span className="mono">{st.ratio.toFixed(1)}</span>} color="var(--bad)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: Rolle and the mean value theorem, hypotheses on and off ─────────────── */

const DEFAULTS: Record<string, [number, number]> = { smooth: [-2, 2], corner: [-1, 2], jump: [0, 2] };
const XL = -2.4, XR = 2.4;

function MvtFigure() {
  const P = usePalette();
  const [id, setId] = useState<'smooth' | 'corner' | 'jump'>('smooth');
  const [a, setA] = useState(-2);
  const [b, setB] = useState(2);
  const [showH, setShowH] = useState(true);
  const fn = MVT_FNS.find((f) => f.id === id)!;
  const r = useMemo(() => mvtPoints(fn, a, b), [fn, a, b]);
  const hyp = hypotheses(fn, a, b);
  const plotRef = useRef<Plot | null>(null);
  const pick = (v: 'smooth' | 'corner' | 'jump') => {
    setId(v);
    setA(DEFAULTS[v][0]);
    setB(DEFAULTS[v][1]);
  };
  const tilt = (x: number) => fn.f(x) - (fn.f(a) + r.m * (x - a));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: W, h: H }) => {
      const top = showH ? H * 0.64 : H;
      const p = new Plot(ctx, W, top, P, { xMin: XL, xMax: XR, yMin: -1.6, yMax: 3.2, pad: { l: 40, r: 12, t: 12, b: 24 } });
      plotRef.current = p;
      p.grid({ xStep: 1, yStep: 1 });
      ctx.fillStyle = alpha(P.accent, 0.07);
      ctx.fillRect(p.X(a), p.pad.t, p.X(b) - p.X(a), p.ph);
      if (fn.id === 'jump') {
        p.fn(fn.f, P.ink, 2.5, { from: XL, to: 1 - 1e-9 });
        p.fn(fn.f, P.ink, 2.5, { from: 1, to: XR });
        p.dot(1, 1, 4.5, P.surface, P.ink, 2);
        p.dot(1, -0.5, 4.5, P.ink, P.surface, 1.5);
      } else p.fn(fn.f, P.ink, 2.5);
      // the secant, and tangents parallel to it at every c
      p.line(a, fn.f(a), b, fn.f(b), P.accent, 2.5);
      for (const c of r.cs) {
        const L = 0.7;
        p.line(c - L, fn.f(c) - r.m * L, c + L, fn.f(c) + r.m * L, P.good, 2.5);
        p.dot(c, fn.f(c), 5, P.good, P.surface, 2);
        p.text(`c = ${c.toFixed(3)}`, c, fn.f(c), P.good, { dx: 0, dy: 16, align: 'center', font: `600 11px ${P.fontMono}`, bg: P.surface });
      }
      for (const [x, nm] of [[a, 'a'], [b, 'b']] as [number, string][]) {
        p.dot(x, fn.f(x), 7, P.accent, P.surface, 2);
        p.text(nm, x, p.yMin, P.accent, { dx: 0, dy: -10, align: 'center', font: `700 12px ${P.fontMono}` });
      }
      if (showH) {
        ctx.save();
        ctx.translate(0, top);
        let lo = 0, hi = 0;
        for (let i = 0; i <= 200; i++) {
          const v = tilt(a + ((b - a) * i) / 200);
          if (isFinite(v)) {
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
          }
        }
        const pad = Math.max(0.2, (hi - lo) * 0.15);
        const q = new Plot(ctx, W, H - top, P, { xMin: XL, xMax: XR, yMin: lo - pad, yMax: hi + pad, pad: { l: 40, r: 12, t: 10, b: 22 } });
        q.grid({ xStep: 1, fmt: (v) => String(+v.toPrecision(2)) });
        if (fn.id === 'jump' && a < 1 && b > 1) {
          q.fn(tilt, P.pos, 2, { from: a, to: 1 - 1e-9 });
          q.fn(tilt, P.pos, 2, { from: 1, to: b });
        } else q.fn(tilt, P.pos, 2, { from: a, to: b });
        for (const c of r.cs) q.dot(c, tilt(c), 4.5, P.good, P.surface, 2);
        q.text('h(x) = f(x) − (할선)', q.xMin, q.yMax, P.ink3, { dx: 6, dy: 8, font: `600 11px ${P.fontBody}` });
        ctx.restore();
      }
    },
    [P, fn, a, b, r, showH],
    { aspect: 1.25, maxHeight: 500 },
  );

  useDrag(wrapRef, {
    hit: (x) => {
      const p = plotRef.current;
      if (!p) return null;
      if (Math.abs(x - p.X(a)) < 14) return 'a';
      if (Math.abs(x - p.X(b)) < 14) return 'b';
      return null;
    },
    onDrag: (k, x) => {
      const p = plotRef.current;
      if (!p) return;
      const v = Math.round(p.invX(x) * 20) / 20;
      if (k === 'a') setA(Math.max(XL + 0.2, Math.min(b - 0.2, v)));
      else setB(Math.min(XR - 0.2, Math.max(a + 0.2, v)));
    },
  });

  const conclusion = r.all
    ? `구간 안의 모든 점에서 f′(c) = ${r.m.toFixed(3)}입니다. 정리가 말한 c가 무수히 많습니다.`
    : r.cs.length
      ? `f′(c) = ${r.m.toFixed(3)}인 c가 ${r.cs.length}개 있습니다: ${r.cs.map((c) => c.toFixed(4)).join(', ')}.`
      : `할선의 기울기 ${r.m.toFixed(3)}과 같은 기울기의 접선이 구간 안에 하나도 없습니다.`;
  const ok = r.all || r.cs.length > 0;

  return (
    <Figure
      no={3}
      title="평균값 정리: 가정을 하나씩 빼 보기"
      hint="a와 b를 끌거나 슬라이더로 옮기세요"
      caption={
        <>
          파란 선이 a와 b를 잇는 할선이고, 초록 선은 할선과 기울기가 같은 접선입니다. 아래 주황 곡선은 증명에 쓰는 기울인 함수 h(x) = f(x) − (f(a) + m(x − a))로, 양 끝에서 0이고 그 꼭대기나 바닥이 바로 c입니다. 모서리나 끊긴 곳이 구간 안에 들어오면 정리의 가정이 깨집니다. c는 f′ − m의 부호가 바뀌는 곳을 4,000개 점에서 찾고 이분법으로 다듬어 구합니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={pick} options={MVT_FNS.map((f) => ({ value: f.id, label: f.label }))} />
        <Check label="h(x) 함께 보기" checked={showH} onChange={setShowH} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`${fn.label}을 a = ${a}, b = ${b} 구간에서 봅니다. 할선의 기울기는 ${r.m.toFixed(3)}입니다. ${conclusion}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="df-a" label="a" value={a} min={XL + 0.2} max={b - 0.2} step={0.05} onChange={setA} format={(v) => v.toFixed(2)} color="var(--accent)" />
          <Slider id="df-b" label="b" value={b} min={a + 0.2} max={XR - 0.2} step={0.05} onChange={setB} format={(v) => v.toFixed(2)} color="var(--accent)" />
          <div className="df-checks">
            <div data-ok={hyp.continuous || undefined} data-no={!hyp.continuous || undefined}>
              <i>{hyp.continuous ? '✓' : '✕'}</i>
              <span>[a, b]에서 연속</span>
            </div>
            <div data-ok={hyp.differentiable || undefined} data-no={!hyp.differentiable || undefined}>
              <i>{hyp.differentiable ? '✓' : '✕'}</i>
              <span>(a, b)에서 미분 가능</span>
            </div>
            <div data-ok={ok || undefined} data-no={!ok || undefined}>
              <i>{ok ? '✓' : '✕'}</i>
              <span>f′(c) = 할선의 기울기인 c가 있음</span>
            </div>
          </div>
          <div className="an-note" data-bad={!ok || undefined} aria-live="polite">
            {conclusion}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: Taylor's remainder, actual vs Lagrange's bound ─────────────── */

function TaylorFigure() {
  const P = usePalette();
  const [n, setN] = useState(4);
  const [x, setX] = useState(1);
  const err = expError(x, n);
  const bound = expBound(x, n);
  const LO = -12, HI = 2;
  const lg = (v: number) => (v > 0 ? Math.max(LO - 1, Math.log10(v)) : LO - 1);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -3, xMax: 3, yMin: LO, yMax: HI, pad: { l: 50, r: 12, t: 12, b: 26 } });
      gridXY(p, 1, 2, (v) => String(Math.round(v)), (v) => `1e${Math.round(v)}`);
      p.fn((t) => lg(expBound(t, n)), P.bad, 2, { samples: 600, dash: [6, 4] });
      p.fn((t) => lg(expError(t, n)), P.accent, 2.5, { samples: 600 });
      p.line(x, LO, x, HI, alpha(P.ink3, 0.6), 1, [4, 4]);
      p.dot(x, lg(err), 5, P.accent, P.surface, 2);
      p.dot(x, lg(bound), 5, P.bad, P.surface, 2);
    },
    [P, n, x, err, bound],
    { aspect: 1.7, maxHeight: 340 },
  );

  return (
    <Figure
      no={4}
      title="테일러 나머지: 실제 오차와 라그랑주의 한계"
      hint="차수 n과 x를 바꿔 보세요"
      caption={
        <>
          <M>{'e^x'}</M>를 0 둘레의 n차 테일러 다항식으로 근사했을 때, 파란 곡선은 실제 오차 <M>{'|e^x - T_n(x)|'}</M>, 빨간 점선은 라그랑주 나머지에서 얻은 한계 <M>{'e^{\\max(0,x)} |x|^{n+1}/(n+1)!'}</M>입니다. 세로축은 로그 눈금입니다. 0 근처에서 파란 곡선이 아래로 꺼지는 것은 오차가 거의 0이기 때문입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="df-n" label="차수 n" value={n} min={0} max={12} step={1} onChange={setN} />
        <Slider id="df-x" label="x" value={x} min={-3} max={3} step={0.05} onChange={setX} format={(v) => v.toFixed(2)} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`n = ${n}, x = ${x.toFixed(2)}에서 실제 오차는 ${err.toExponential(3)}, 라그랑주 한계는 ${bound.toExponential(3)}입니다. 한계가 언제나 실제 오차보다 큽니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <Readout label={<M>{'e^x'}</M>} value={<span className="mono">{Math.exp(x).toFixed(6)}</span>} />
        <Readout label={<M>{'T_n(x)'}</M>} value={<span className="mono">{expTaylor(x, n).toFixed(6)}</span>} />
        <Readout label="실제 오차" value={<span className="mono">{err.toExponential(3)}</span>} color="var(--accent)" />
        <Readout label="라그랑주 한계" value={<span className="mono">{bound.toExponential(3)}</span>} color="var(--bad)" />
      </div>
      <Legend
        items={[
          { color: 'var(--accent)', label: '실제 오차', shape: 'ln' },
          { color: 'var(--bad)', label: '라그랑주 나머지의 한계', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Differentiability() {
  return (
    <>
      <h2>미분 가능하면 연속이다</h2>
      <p>
        <a href={lessonHref('math-calculus', 'derivatives')}>미적분학</a>에서는 미분계수를 할선 기울기의 극한으로 정의했습니다. 해석학에서도 정의는 같고, 이제 그 극한을 앞 장들의 ε-δ 언어로 다룹니다.
      </p>
      <MB note="극한이 있을 때 f는 a에서 미분 가능하다고 하고, 그 값을 f′(a)로 씁니다.">{`f'(a) = \\lim_{h \\to 0} \\frac{f(a+h) - f(a)}{h}`}</MB>
      <p>첫 번째 사실은 미분 가능성이 연속성보다 강한 조건이라는 것입니다.</p>
      <Proof title="정리. f가 a에서 미분 가능하면 a에서 연속이다.">
        <p>
          h ≠ 0일 때 <M>{`f(a+h) - f(a) = \\dfrac{f(a+h) - f(a)}{h} \\cdot h`}</M>입니다. h → 0이면 오른쪽의 첫 인수는 f′(a)로, 둘째 인수는 0으로 가므로, 극한의 곱셈 법칙에 의해 곱은 f′(a) · 0 = 0으로 갑니다. 따라서 <M>{`\\lim_{h\\to 0} f(a+h) = f(a)`}</M>이고, 이것이 a에서의 연속입니다. <Qed />
        </p>
      </Proof>
      <p>
        거꾸로는 성립하지 않습니다. 그림 1의 세 함수는 모두 0에서 연속이지만, 미분에 대해서는 셋 다 다르게 행동합니다.
      </p>
      <KinkFigure />
      <p>
        <M>{'|x|'}</M>의 표에서 오른쪽 차분몫은 언제나 1, 왼쪽은 −1입니다. 두 한쪽 극한이 다르니 미분계수가 없습니다. <M>{'x\\sin(1/x)'}</M>는 차분몫이 <M>{'\\sin(1/h)'}</M> 그 자체라 h = 0.1에서 −0.544, 0.001에서 0.827, 10⁻⁶에서 −0.350으로 정해진 값 없이 떠돕니다. 반면 <M>{'x^2\\sin(1/x)'}</M>의 차분몫 <M>{'h\\sin(1/h)'}</M>는 <M>{'|h \\sin(1/h)| \\le |h|'}</M>이므로 0으로 가서 f′(0) = 0입니다.
      </p>
      <p>
        세 번째 함수에는 함정이 하나 더 있습니다. 0이 아닌 x에서 도함수는 <M>{`f'(x) = 2x\\sin(1/x) - \\cos(1/x)`}</M>인데, 앞의 항은 0으로 가지만 <M>{'\\cos(1/x)'}</M>는 −1과 1 사이를 계속 오갑니다. 그래서 f′(0)은 있지만 <M>{`\\lim_{x\\to 0} f'(x)`}</M>는 없습니다. <T en="differentiable">미분 가능</T>한 함수의 도함수가 연속이라는 보장은 없습니다. 도함수까지 연속인 함수를 따로 <T en="continuously differentiable">연속적으로 미분 가능</T>하다고 하고 <M>{'C^1'}</M>로 씁니다.
      </p>

      <h2>어디서도 미분할 수 없는 연속 함수</h2>
      <p>
        모서리 하나, 진동하는 점 하나라면 예외처럼 보입니다. 1872년 바이어슈트라스(Karl Weierstrass)는 <strong>모든 점에서</strong> 연속이지만 <strong>어느 점에서도</strong> 미분 가능하지 않은 함수를 내놓았습니다. 진폭은 절반씩 줄지만 진동수는 13배씩 늘어나는 코사인들의 합입니다.
      </p>
      <MB note={`a = ${WA}, b = ${WB}이면 ab = 6.5가 바이어슈트라스의 원래 조건 ab > 1 + 3π/2 ≈ 5.71을 만족합니다.`}>{`W(x) = \\sum_{n=0}^{\\infty} a^n \\cos(b^n \\pi x)`}</MB>
      <p>
        각 항의 크기가 <M>{'a^n'}</M>이고 <M>{`\\sum a^n`}</M>이 수렴하므로, 다음 장의 바이어슈트라스 M-판정에 의해 급수는 균등 수렴하고 그 극한은 연속입니다. 그런데 미분하려고 하면 n번째 항의 기울기가 <M>{'(ab)^n\\pi'}</M> 크기로 자라서 모아지지 않습니다. 그림 2에서 확인해 보세요.
      </p>
      <WeierstrassFigure />
      <p>
        매끄러운 함수를 확대하면 그래프는 점점 직선이 되고, 창 안 그래프의 높이를 너비로 나눈 값은 그 점의 기울기 크기로 다가갑니다. x = 0.3 근처에서 W를 확대하면 이 값이 1배에서 1.9, 10배에서 10.0, 100배에서 48.0, 1,000배에서 287.0, 10,000배에서 1,148.9로 끝없이 커집니다. 확대할 때마다 새로 보이는 잔물결이 그래프를 다시 거칠게 만들어, 어떤 배율에서도 직선이 되지 않습니다.
      </p>
      <Callout kind="note">
        이 예는 당시 수학자들에게 충격이었습니다. "연속 함수는 몇몇 점을 빼면 미분 가능하다"는 것이 그때까지의 직관이었기 때문입니다. 지금은 연속 함수 대부분이 사실 이런 식이라는 것이 알려져 있습니다. 주가나 브라운 운동의 경로처럼 어디서나 들쭉날쭉한 곡선도 같은 성질을 가집니다.
      </Callout>

      <h2>롤의 정리와 평균값 정리</h2>
      <p>미분이 함수의 모양에 대해 알려 주는 가장 중요한 정리는 평균값 정리이고, 그 바탕은 롤의 정리입니다.</p>
      <MB note="롤의 정리 (Rolle's theorem)">{`f \\in C[a,b],\\ f \\text{가 } (a,b) \\text{에서 미분 가능},\\ f(a) = f(b) \\;\\Longrightarrow\\; \\exists\\, c \\in (a,b):\\ f'(c) = 0`}</MB>
      <MB note="평균값 정리 (mean value theorem)">{`f \\in C[a,b],\\ f \\text{가 } (a,b) \\text{에서 미분 가능} \\;\\Longrightarrow\\; \\exists\\, c \\in (a,b):\\ f'(c) = \\frac{f(b) - f(a)}{b - a}`}</MB>
      <Proof title="증명.">
        <p>
          <strong>롤의 정리.</strong> f가 상수이면 아무 c나 됩니다. 아니면 f는 f(a)보다 큰 값이나 작은 값을 갖습니다. 큰 값을 갖는다고 합시다. <a href={lessonHref('math-analysis', 'continuity')}>최대·최소 정리</a>에 의해 f는 [a, b]의 어떤 점 c에서 최댓값을 가지며, f(c) &gt; f(a) = f(b)이므로 c는 양 끝이 아닙니다. c가 최대이므로 h &gt; 0이면 <M>{`\\frac{f(c+h)-f(c)}{h} \\le 0`}</M>, h &lt; 0이면 <M>{`\\frac{f(c+h)-f(c)}{h} \\ge 0`}</M>입니다. f′(c)는 두 한쪽 극한과 같아야 하므로 0 이하이면서 0 이상, 곧 f′(c) = 0입니다.
        </p>
        <p>
          <strong>평균값 정리.</strong> 할선의 기울기를 m이라 하고 할선을 빼서 기울인 함수 <M>{`h(x) = f(x) - f(a) - m(x - a)`}</M>를 만듭니다. h는 [a, b]에서 연속, (a, b)에서 미분 가능하고, h(a) = 0, h(b) = f(b) − f(a) − m(b − a) = 0입니다. 롤의 정리에 의해 h′(c) = f′(c) − m = 0인 c가 있습니다. <Qed />
        </p>
      </Proof>
      <p>
        그림 3에서 이 증명을 직접 볼 수 있습니다. 기본 함수 <M>{'f(x) = 0.3x^3 - x + 1'}</M>을 [−2, 2]에서 보면 할선의 기울기가 0.2이고, <M>{`f'(c) = 0.9c^2 - 1 = 0.2`}</M>를 푼 c = ±1.1547 두 곳에서 접선이 할선과 나란합니다. 아래 주황 곡선 h의 꼭대기와 바닥이 바로 그 두 점입니다.
      </p>
      <MvtFigure />
      <p>
        <strong>모서리 |x|</strong>를 고르면 처음 구간 [−1, 2]에서 할선의 기울기는 1/3인데, |x|의 기울기는 −1 아니면 1뿐이라 같은 기울기의 접선이 없습니다. 모서리가 구간 안에 있어 "미분 가능" 가정이 깨졌기 때문입니다. a를 0보다 오른쪽으로 옮기면 가정이 다시 성립하고, 모든 점에서 기울기가 1이라 c가 무수히 많아집니다. <strong>끊긴 함수</strong>에서는 [0, 2]의 할선 기울기가 0.25인데 함수의 기울기는 어디서나 1입니다. 연속 가정이 깨지면 h가 양 끝에서 0이어도 꼭대기를 갖지 않을 수 있기 때문입니다. 정리의 가정 중 하나라도 빠지면 결론이 무너진다는 것을 이렇게 하나씩 확인할 수 있습니다.
      </p>
      <Callout kind="key" label="평균값 정리가 하는 일">
        평균값 정리는 미분의 정보를 함수값의 정보로 바꿉니다. 예를 들어 (a, b)에서 f′ = 0이면 임의의 두 점 x &lt; y에 대해 f(y) − f(x) = f′(c)(y − x) = 0이므로 f는 상수입니다. f′ &gt; 0이면 같은 식으로 f는 증가합니다. <a href={lessonHref('math-calculus', 'applications')}>미적분학</a>에서 당연하게 쓰던 증가·감소 판정이 모두 여기서 나옵니다.
      </Callout>

      <h2>테일러 정리와 나머지 항</h2>
      <p>
        평균값 정리는 f를 상수 f(a)로 근사했을 때의 오차가 <M>{"f'(c)(x-a)"}</M>라는 말로 읽을 수도 있습니다. 같은 생각을 n차 다항식까지 밀고 가면 테일러 정리가 됩니다.
      </p>
      <MB note="라그랑주 나머지 (Lagrange remainder). f가 n+1번 미분 가능할 때, a와 x 사이의 어떤 c가 있습니다.">{`f(x) = \\sum_{k=0}^{n} \\frac{f^{(k)}(a)}{k!}(x-a)^k + \\frac{f^{(n+1)}(c)}{(n+1)!}(x-a)^{n+1}`}</MB>
      <p>
        증명은 평균값 정리와 같은 방식입니다. 나머지를 빼서 양 끝에서 값이 맞는 보조 함수를 만들고 롤의 정리를 n+1번 씁니다. c가 정확히 어디인지는 모르지만, <M>{'f^{(n+1)}'}</M>의 크기만 눌러 둘 수 있으면 오차의 한계가 나옵니다. <M>{'e^x'}</M>는 모든 도함수가 <M>{'e^x'}</M>이므로 0과 x 사이에서 <M>{'e^c \\le e^{\\max(0,x)}'}</M>입니다.
      </p>
      <TaylorFigure />
      <p>
        기본 설정 n = 4, x = 1에서 <M>{'T_4(1) = 2.708333'}</M>이고 실제 오차는 0.009948, 라그랑주 한계는 <M>{'e/5! = 0.022652'}</M>입니다. 한계는 실제 오차의 두 배 남짓으로, 넉넉하지만 틀리지 않습니다. 차수를 8로 올리면 오차는 3.06×10⁻⁶, 한계는 7.49×10⁻⁶이 됩니다. x = 3처럼 0에서 멀어지면 n = 4의 한계는 40.7로 쓸모가 없어지고, 그래서 <a href={lessonHref('math-calculus', 'series')}>미적분학의 급수 장</a>에서 본 것처럼 실제 계산에서는 x를 먼저 0 근처로 옮깁니다.
      </p>
      <Callout kind="note" label="로피탈의 규칙">
        평균값 정리를 두 함수에 함께 쓴 코시 평균값 정리에서 <T en="L'Hôpital's rule">로피탈의 규칙</T>이 나옵니다. f(a) = g(a) = 0이고 극한 <M>{"\\lim f'(x)/g'(x)"}</M>가 있으면 <M>{'\\lim f(x)/g(x)'}</M>도 같은 값입니다. 예를 들어 <M>{`\\lim_{x\\to 0} \\frac{\\sin x}{x} = \\lim_{x\\to 0} \\frac{\\cos x}{1} = 1`}</M>입니다. 다만 이 계산은 sin의 도함수가 cos임을 이미 알 때만 쓸 수 있고, 그 사실을 증명할 때 이 극한을 쓰므로 sin x / x에 쓰면 순환 논증이 됩니다.
      </Callout>

      <Callout kind="key">
        미분 가능하면 연속이지만 거꾸로는 아니며, 모든 곳에서 연속이고 어디서도 미분 불가능한 함수도 있습니다. 미분 가능한 함수의 도함수가 연속이라는 보장도 없습니다. 롤의 정리는 최대·최소 정리에서, 평균값 정리는 할선을 빼 기울인 함수에 롤의 정리를 써서 얻으며, 연속과 미분 가능이라는 가정 중 하나만 빠져도 결론이 깨집니다. 같은 방법을 고차로 밀면 테일러 정리와 오차의 한계가 나옵니다.
      </Callout>
      <Quiz
        q="f가 [0, 2]에서 연속, (0, 2)에서 미분 가능하고 f(0) = 1, f(2) = 5이다. 평균값 정리로 반드시 참이라고 할 수 있는 것은?"
        options={['f′(1) = 2이다', '어떤 c ∈ (0, 2)에서 f′(c) = 2이다', '모든 x ∈ (0, 2)에서 f′(x) ≥ 2이다', 'f는 [0, 2]에서 증가한다']}
        answer={1}
        explain={
          <>
            할선의 기울기는 (5 − 1)/(2 − 0) = 2이므로, 평균값 정리는 f′(c) = 2인 c가 <strong>어딘가에</strong> 있다는 것만 보장합니다. c가 1이라는 보장은 없고, 다른 점의 기울기는 2보다 작거나 음수일 수도 있습니다. 예를 들어 f(x) = 1 + 2x + 3sin²(πx)는 조건을 만족하지만 f′(x) = 2 + 3π sin(2πx)가 음수가 되는 곳이 있어 중간에 감소하는 구간이 있습니다.
          </>
        }
      />
    </>
  );
}
