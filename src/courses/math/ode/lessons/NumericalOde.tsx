import { useMemo, useState } from 'react';
import { Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { COST, METHOD_KO, PULSE_T, amplification, energy, errorTable, fixedPulseError, observedOrder, orbit, pulseF, rk45, rk4Stages, solve, stiffRun, stiffSlow, testExact, type Method, type OrbitMethod } from './steppers';
import './ode.css';
import './numode.css';

const nf = (v: number, d = 4) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');
const sci = (v: number, d = 2) => {
  if (!isFinite(v)) return '∞';
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e <= 3) return nf(v, Math.max(0, 3 - e));
  const m = v / 10 ** e;
  return `${m.toFixed(d).replace('-', '−')}×10${String(e).replace('-', '⁻').replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c])}`;
};
const METHOD_CSS: Record<Method, string> = { euler: 'var(--pos)', heun: 'var(--good)', rk4: 'var(--accent)' };

/** Log-axis plot frame: ticks at powers of ten on both axes, labels drawn by hand. */
function logFrame(pl: Plot, P: ReturnType<typeof usePalette>, xLabel: string, yLabel: string, xs: number[], ys: number[]) {
  const c = pl.ctx;
  c.save();
  c.strokeStyle = P.grid;
  c.lineWidth = 1;
  c.fillStyle = P.ink3;
  c.font = `10px ${P.fontMono}`;
  for (const e of xs) {
    const x = Math.round(pl.X(e)) + 0.5;
    c.beginPath();
    c.moveTo(x, pl.pad.t);
    c.lineTo(x, pl.pad.t + pl.ph);
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.fillText(`10${String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d])}`, x, pl.pad.t + pl.ph + 5);
  }
  for (const e of ys) {
    const y = Math.round(pl.Y(e)) + 0.5;
    c.beginPath();
    c.moveTo(pl.pad.l, y);
    c.lineTo(pl.pad.l + pl.pw, y);
    c.stroke();
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    c.fillText(`10${String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d])}`, pl.pad.l - 5, y);
  }
  c.fillStyle = P.ink2;
  c.font = `12px ${P.fontBody}`;
  c.textAlign = 'right';
  c.textBaseline = 'bottom';
  c.fillText(xLabel, pl.pad.l + pl.pw, pl.pad.t + pl.ph - 4);
  c.textAlign = 'left';
  c.textBaseline = 'top';
  c.fillText(yLabel, pl.pad.l + 6, pl.pad.t + 4);
  c.restore();
}

/* ─────────────── Figure 1: going round a circle ─────────────── */

const PERIODS = [1, 10, 100, 1000];

function OrbitFigure() {
  const P = usePalette();
  const [m, setM] = useState<OrbitMethod>('euler');
  const [h, setH] = useState(0.1);
  const [per, setPer] = useState(1);
  const o = useMemo(() => orbit(m, h, per), [m, h, per]);
  const E = useMemo(() => {
    const es = o.x.map((x, i) => energy(x, o.v[i]) / 0.5);
    let lo = Infinity, hi = -Infinity;
    for (const e of es) {
      lo = Math.min(lo, e);
      hi = Math.max(hi, e);
    }
    return { es, lo, hi, end: es[es.length - 1] };
  }, [o]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: H }) => {
      const narrow = w < 520;
      const pw = narrow ? w : Math.round(w * 0.55);
      const ph = narrow ? Math.round(H * 0.62) : H;
      const pl = new Plot(ctx, pw, ph, P, { xMin: -2.2, xMax: 2.2, yMin: -2.2, yMax: 2.2, pad: { l: 30, r: 10, t: 12, b: 24 }, equal: true });
      pl.grid({ xStep: 1, yStep: 1, xLabel: 'x (위치)', yLabel: 'v (속도)' });
      // the exact orbit: the unit circle
      ctx.strokeStyle = alpha(P.ink3, 0.8);
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pl.X(0), pl.Y(0), pl.sx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      pl.clip();
      const n = o.x.length;
      const stride = Math.max(1, Math.floor(n / 6000));
      ctx.strokeStyle = m === 'euler' ? P.pos : m === 'rk4' ? P.accent : P.good;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < n; i += stride) {
        const x = Math.max(-50, Math.min(50, o.x[i])), v = Math.max(-50, Math.min(50, o.v[i]));
        if (i) ctx.lineTo(pl.X(x), pl.Y(v));
        else ctx.moveTo(pl.X(x), pl.Y(v));
      }
      ctx.stroke();
      pl.unclip();
      pl.dot(1, 0, 5, P.ink, P.surface, 2);

      // energy against time, log scale
      ctx.save();
      if (narrow) ctx.translate(0, ph);
      else ctx.translate(pw, 0);
      const ew = narrow ? w : w - pw, eh = narrow ? H - ph : H;
      const lo = -1.3, hi = 1.3; // log10 range: 0.05 … 20
      const ep = new Plot(ctx, ew, eh, P, { xMin: 0, xMax: per, yMin: lo, yMax: hi, pad: { l: 40, r: 10, t: 12, b: 24 } });
      ep.grid({ xStep: per / 4, yStep: 1, labels: false, axes: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const [v, s] of [[-1, '0.1'], [0, '1'], [1, '10']] as const) ctx.fillText(s, ep.pad.l - 5, ep.Y(v));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let k = 0; k <= 4; k++) ctx.fillText(String((per * k) / 4), ep.X((per * k) / 4), ep.pad.t + ep.ph + 5);
      ep.line(0, 0, per, 0, alpha(P.ink3, 0.8), 1, [4, 4]);
      ep.clip();
      ctx.strokeStyle = m === 'euler' ? P.pos : m === 'rk4' ? P.accent : P.good;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const steps = E.es.length;
      const st2 = Math.max(1, Math.floor(steps / 3000));
      for (let i = 0; i < steps; i += st2) {
        const tt = (i * h) / (2 * Math.PI);
        const y = Math.max(lo - 1, Math.min(hi + 1, Math.log10(E.es[i])));
        if (i) ctx.lineTo(ep.X(tt), ep.Y(y));
        else ctx.moveTo(ep.X(tt), ep.Y(y));
      }
      ctx.stroke();
      ep.unclip();
      ep.text('에너지 / 처음 에너지 (로그)', 0, hi, P.ink2, { dx: 4, dy: 8, font: `600 11px ${P.fontBody}`, bg: P.surface });
      ep.text('바퀴 수', per, lo, P.ink3, { align: 'right', dy: -8, font: `500 11px ${P.fontBody}` });
      ctx.restore();
    },
    [P, o, E, m, h, per],
    { height: 380, minHeight: 40 },
  );

  return (
    <Figure
      no={1}
      title="원을 따라 돌기"
      hint="방법, 보폭 h, 바퀴 수를 바꿔 보세요"
      caption={
        <>
          <M>{"x'' = -x"}</M>를 <M>{"x' = v,\\; v' = -x"}</M>로 바꿔 (x, v) 평면에 그렸습니다. 정확한 해는 점선 원을 영원히 돕니다. 오른쪽(좁은 화면에서는 아래)은 에너지 <M>{'(x^2+v^2)/2'}</M>가 처음의 몇 배인지를 로그 눈금으로 그린 것입니다. 1000바퀴에 h = 0.05면 12만 걸음이 넘으므로 그리는 점은 솎아 냈고, 계산은 모든 걸음을 다 합니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="de-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${m === 'euler' ? '오일러' : m === 'rk4' ? 'RK4' : '립프로그'} 방법, 보폭 ${h.toFixed(2)}, ${per}바퀴. 끝의 에너지는 처음의 ${sci(E.end, 3)}배이고, 도는 동안 ${nf(E.lo, 4)}배에서 ${sci(E.hi, 3)}배 사이였습니다.`}>
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Seg label="방법" value={m} onChange={setM} options={[{ value: 'euler', label: '오일러' }, { value: 'rk4', label: 'RK4' }, { value: 'leapfrog', label: '립프로그' }]} />
          <Slider id="no-orbit-h" label="보폭 h" value={h} min={0.05} max={0.5} step={0.05} onChange={setH} format={(v) => v.toFixed(2)} />
          <Seg label="바퀴 수" value={per} onChange={setPer} options={PERIODS.map((p) => ({ value: p, label: String(p) }))} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="끝의 에너지 / 처음" value={sci(E.end, 3)} color={Math.abs(E.end - 1) > 0.05 ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="도는 동안의 범위" value={`${nf(E.lo, 4)} ~ ${sci(E.hi, 3)}`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: one RK4 step in slow motion ─────────────── */

const STAGE_NOTE = [
  '① 지금 점에서 기울기 k₁을 잽니다. 오일러 방법은 이것 하나로 끝까지 갑니다.',
  '② k₁을 따라 반 걸음 간 점에서 기울기 k₂를 다시 잽니다.',
  '③ 이번에는 k₂를 따라 반 걸음 간 점에서 k₃을 잽니다.',
  '④ k₃을 따라 한 걸음 끝까지 간 점에서 k₄를 잽니다.',
  '⑤ 네 기울기를 1 : 2 : 2 : 1로 평균 내어 한 걸음을 갑니다.',
];
const STAGE_CSS = ['var(--pos)', 'var(--good)', 'var(--neg)', 'var(--c-math-3)'];

function StagesFigure() {
  const P = usePalette();
  const [h, setH] = useState(0.5);
  const f = (t: number, y: number) => t - y;
  const r = useMemo(() => rk4Stages(f, 0, 1, h), [h]);
  const st = useStepper(5, 0.8, h, true);
  const k = st.i;
  const exact = testExact(h);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: H }) => {
      const pl = new Plot(ctx, w, H, P, { xMin: -0.05, xMax: 1.1, yMin: -0.05, yMax: 1.15, pad: { l: 34, r: 12, t: 12, b: 24 } });
      pl.grid({ xStep: 0.25, yStep: 0.25, xLabel: 't' });
      // slope field of y′ = t − y
      ctx.strokeStyle = alpha(P.ink3, 0.45);
      ctx.lineWidth = 1;
      for (let i = 0; i <= 11; i++)
        for (let j = 0; j <= 12; j++) {
          const t = i * 0.1, y = j * 0.1 - 0.05;
          const s = f(t, y);
          const L = 0.035 / Math.hypot(1, s);
          ctx.beginPath();
          ctx.moveTo(pl.X(t - L), pl.Y(y - s * L));
          ctx.lineTo(pl.X(t + L), pl.Y(y + s * L));
          ctx.stroke();
        }
      pl.fn(testExact, P.ink, 2, { from: 0, to: 1.1 });
      pl.line(h, -0.05, h, 1.15, alpha(P.ink3, 0.6), 1, [3, 3]);
      const colors = [P.pos, P.good, P.neg, P.math];
      const shown = Math.min(4, k + 1);
      for (let s = 0; s < shown; s++) {
        const g = r.stages[s];
        // the trip from the start that found this sample point
        if (s > 0) pl.line(0, 1, g.t, g.y, alpha(colors[s - 1], 0.6), 1.5, [4, 3]);
        // the slope measured there
        const L = 0.12 / Math.hypot(1, g.k);
        pl.line(g.t - L, g.y - g.k * L, g.t + L, g.y + g.k * L, colors[s], 3);
        pl.dot(g.t, g.y, 4.5, colors[s], P.surface, 1.5);
        pl.text(`k${'₁₂₃₄'[s]}`, g.t, g.y, colors[s], { dx: 8, dy: -10, font: `700 12px ${P.fontMono}`, bg: P.surface });
      }
      if (k >= 1) {
        // Euler's answer, for comparison
        pl.line(0, 1, h, r.euler, alpha(P.pos, 0.5), 1.5);
        pl.dot(h, r.euler, 4, P.surface, P.pos, 2);
      }
      if (k >= 4) {
        pl.line(0, 1, h, r.next, P.accent, 2.5);
        pl.dot(h, r.next, 6, P.accent, P.surface, 2);
      }
      pl.dot(0, 1, 5, P.ink, P.surface, 2);
      pl.dot(h, exact, 3.5, P.ink, P.surface, 1.5);
    },
    [P, r, k, h, exact],
    { height: 330, minHeight: 40 },
  );

  return (
    <Figure
      no={2}
      title="RK4의 한 걸음을 느리게"
      hint="▶ 재생 또는 한 단계씩, h도 바꿔 보세요"
      caption={
        <>
          <M>{"y' = t - y,\\; y(0) = 1"}</M>의 기울기장(회색 짧은 선)과 정확한 해 <M>{'y = t - 1 + 2e^{-t}'}</M>(검은 선, 어두운 테마에서는 흰 선) 위에서 RK4가 한 걸음 동안 기울기를 네 번 재는 모습입니다. 점선은 각 기울기를 잰 점까지 어떻게 갔는지를, 속이 빈 주황 점은 같은 보폭의 오일러 방법이 닿는 곳을 보여 줍니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="de-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`보폭 ${h.toFixed(2)}의 RK4 한 걸음, ${k + 1}단계. 기울기 k₁=${nf(r.stages[0].k, 3)}, k₂=${nf(r.stages[1].k, 3)}, k₃=${nf(r.stages[2].k, 3)}, k₄=${nf(r.stages[3].k, 3)}. RK4의 답 ${nf(r.next, 6)}, 정확한 값 ${nf(exact, 6)}, 오일러 ${nf(r.euler, 4)}.`}>
            <canvas ref={canvasRef} />
          </div>
          <p className="de-note" aria-live="polite">
            {STAGE_NOTE[k]}
          </p>
        </div>
        <div className="controls">
          <StepControls s={st} id="no-rk4-speed" maxSpeed={4} />
          <Slider id="no-rk4-h" label="보폭 h" value={h} min={0.2} max={1} step={0.05} onChange={setH} format={(v) => v.toFixed(2)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {r.stages.map((g, i) => (
              <Readout key={i} label={`k${'₁₂₃₄'[i]}`} value={i <= k ? nf(g.k, 4) : '…'} color={STAGE_CSS[i]} />
            ))}
            <Readout label="RK4의 답" value={k >= 4 ? nf(r.next, 6) : '…'} color="var(--accent)" />
            <Readout label="정확한 값" value={nf(exact, 6)} />
            <Readout label="RK4 오차" value={k >= 4 ? sci(Math.abs(r.next - exact), 2) : '…'} />
            <Readout label="오일러 오차" value={sci(Math.abs(r.euler - exact), 2)} color="var(--pos)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: error against step size ─────────────── */

const HS = [0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625];

function OrderFigure() {
  const P = usePalette();
  const rows = useMemo(() => errorTable(HS), []);
  const orders = useMemo(() => {
    const o = {} as Record<Method, number>;
    for (const m of ['euler', 'heun', 'rk4'] as Method[]) o[m] = observedOrder(rows.map((r) => ({ h: r.h, e: r.err[m] })));
    return o;
  }, [rows]);
  const [hi, setHi] = useState(2);
  const pick = rows[hi];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: Math.log10(0.012), xMax: Math.log10(0.6), yMin: -10.5, yMax: 0, pad: { l: 44, r: 12, t: 12, b: 26 } });
      logFrame(pl, P, '보폭 h', 't = 2에서의 오차', [-1], [-10, -8, -6, -4, -2, 0]);
      // minor x ticks for the step sizes used
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const hh of [0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625]) {
        if (hh === 0.125 || hh === 0.5 || hh === 0.03125) ctx.fillText(hh === 0.5 ? '½' : hh === 0.125 ? '⅛' : '1/32', pl.X(Math.log10(hh)), pl.pad.t + pl.ph + 5);
      }
      pl.line(Math.log10(pick.h), -10.5, Math.log10(pick.h), 0, alpha(P.ink3, 0.6), 1, [3, 3]);
      const cols: Record<Method, string> = { euler: P.pos, heun: P.good, rk4: P.accent };
      for (const m of ['euler', 'heun', 'rk4'] as Method[]) {
        ctx.strokeStyle = cols[m];
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        rows.forEach((r, i) => {
          const x = pl.X(Math.log10(r.h)), y = pl.Y(Math.log10(r.err[m]));
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.stroke();
        for (const r of rows) pl.dot(Math.log10(r.h), Math.log10(r.err[m]), r === pick ? 5.5 : 3.5, cols[m], P.surface, 1.5);
        const last = rows[rows.length - 1];
        pl.text(`${METHOD_KO[m].split('(')[0]} · 기울기 ${orders[m].toFixed(2)}`, Math.log10(last.h), Math.log10(last.err[m]), cols[m], { dx: 8, align: 'left', font: `600 11px ${P.fontBody}`, bg: P.surface });
      }
    },
    [P, rows, orders, pick],
    { height: 340, minHeight: 40 },
  );

  return (
    <Figure
      no={3}
      title="보폭을 반으로 줄이면 오차는 몇 분의 일이 될까"
      hint="표시할 보폭을 고르세요"
      caption={
        <>
          <M>{"y' = t - y,\\; y(0)=1"}</M>을 t = 2까지 풀고, 정확한 값 <M>{'1 + 2e^{-2}'}</M>와의 차이를 보폭마다 쟀습니다. 두 축이 모두 로그 눈금이라 <M>{'\\text{오차} \\approx C h^p'}</M>는 기울기 p인 직선이 됩니다. 이름 옆의 수는 여섯 점에 맞춘 직선의 기울기입니다. 직선 왼쪽 끝이 RK4에서 조금 휘는 것은 오차가 이미 10⁻¹⁰ 근처라 다른 오차가 섞이기 시작하기 때문입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`보폭에 따른 오차의 로그-로그 그래프. 맞춘 기울기는 오일러 ${orders.euler.toFixed(2)}, 호인 ${orders.heun.toFixed(2)}, RK4 ${orders.rk4.toFixed(2)}입니다. 보폭 ${pick.h}에서 오차는 각각 ${sci(pick.err.euler)}, ${sci(pick.err.heun)}, ${sci(pick.err.rk4)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="no-order-h" label="보폭" value={hi} min={0} max={HS.length - 1} step={1} onChange={setHi} format={(i) => `1/${Math.round(1 / HS[i])}`} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            {(['euler', 'heun', 'rk4'] as Method[]).map((m) => (
              <Readout key={m} label={`${METHOD_KO[m]} · 걸음당 f ${COST[m]}번`} value={sci(pick.err[m])} color={METHOD_CSS[m]} />
            ))}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: adaptive step size ─────────────── */

const TOLS = [1e-3, 1e-4, 1e-5, 1e-6, 1e-7];

function AdaptiveFigure() {
  const P = usePalette();
  const [ti, setTi] = useState(2);
  const tol = TOLS[ti];
  const ref = useMemo(() => solve('rk4', (t, y) => [pulseF(t, y[0])], [1], PULSE_T, 0.001), []);
  const yEnd = ref.y[ref.y.length - 1][0];
  const run = useMemo(() => rk45(pulseF, 1, PULSE_T, tol), [tol]);
  const err = Math.abs(run.y[run.y.length - 1] - yEnd);
  const fixed = useMemo(() => fixedPulseError(0.1, PULSE_T, yEnd), [yEnd]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const topH = Math.round(h * 0.62);
      const pl = new Plot(ctx, w, topH, P, { xMin: 0, xMax: PULSE_T, yMin: -0.2, yMax: 3.6, pad: { l: 34, r: 12, t: 12, b: 22 } });
      pl.grid({ xStep: 1, yStep: 1, xLabel: 't' });
      ctx.strokeStyle = alpha(P.ink3, 0.8);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ref.t.forEach((t, i) => (i % 4 ? 0 : i ? ctx.lineTo(pl.X(t), pl.Y(ref.y[i][0])) : ctx.moveTo(pl.X(t), pl.Y(ref.y[i][0]))));
      ctx.stroke();
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      run.t.forEach((t, i) => (i ? ctx.lineTo(pl.X(t), pl.Y(run.y[i])) : ctx.moveTo(pl.X(t), pl.Y(run.y[i]))));
      ctx.stroke();
      run.t.forEach((t, i) => pl.dot(t, run.y[i], 3, P.accent, P.surface, 1));
      for (const t of run.rejected) {
        const x = pl.X(t), y = pl.Y(-0.05);
        ctx.strokeStyle = P.bad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 4);
        ctx.lineTo(x + 4, y + 4);
        ctx.moveTo(x + 4, y - 4);
        ctx.lineTo(x - 4, y + 4);
        ctx.stroke();
      }

      // step sizes, log scale
      ctx.save();
      ctx.translate(0, topH);
      const sp = new Plot(ctx, w, h - topH, P, { xMin: 0, xMax: PULSE_T, yMin: -2.3, yMax: 0.5, pad: { l: 34, r: 12, t: 10, b: 22 } });
      sp.grid({ xStep: 1, labels: false, axes: false, yStep: 1 });
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const [v, s] of [[-2, '0.01'], [-1, '0.1'], [0, '1']] as const) ctx.fillText(s, sp.pad.l - 4, sp.Y(v));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let t = 0; t <= PULSE_T; t += 2) ctx.fillText(String(t), sp.X(t), sp.pad.t + sp.ph + 5);
      ctx.fillStyle = alpha(P.accent, 0.55);
      run.hs.forEach((hh, i) => {
        const x0 = sp.X(run.t[i]), x1 = sp.X(run.t[i + 1]);
        const y = sp.Y(Math.log10(hh));
        ctx.fillRect(x0 + 0.5, y, Math.max(1, x1 - x0 - 1), sp.pad.t + sp.ph - y);
      });
      sp.text('보폭 h (로그)', 0, 0.5, P.ink2, { dx: 4, dy: 8, font: `600 11px ${P.fontBody}`, bg: P.surface });
      ctx.restore();
    },
    [P, ref, run],
    { height: 360, minHeight: 40 },
  );

  return (
    <Figure
      no={4}
      title="보폭을 스스로 고르는 RK45"
      hint="허용 오차를 바꿔 보세요"
      caption={
        <>
          <M>{"y' = -y + 40\\,e^{-((t-3)/0.05)^2}"}</M>는 대부분 천천히 줄어들다가 t = 3 근처의 아주 짧은 순간에 세게 밀립니다. 회색 선은 보폭 0.001의 RK4로 구한 기준 해, 파란 점은 RK45(도르망-프린스 방법)가 받아들인 걸음의 끝, 빨간 ×는 오차 추정이 허용치를 넘어 다시 시도한 걸음입니다. 아래 막대의 높이가 걸음마다 쓴 보폭입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`허용 오차 ${sci(tol, 0)}의 RK45. 받아들인 걸음 ${run.hs.length}개, 다시 시도한 걸음 ${run.rejected.length}개, f 계산 ${run.evals}번, t = 8에서의 오차 ${sci(err)}. 보폭은 ${nf(Math.min(...run.hs), 4)}에서 ${nf(Math.max(...run.hs), 3)} 사이입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="허용 오차" value={ti} onChange={setTi} options={TOLS.map((t, i) => ({ value: i, label: `10${String(Math.log10(t)).replace('-', '⁻').replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c])}` }))} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="받아들인 걸음" value={run.hs.length} color="var(--accent)" />
            <Readout label="다시 시도" value={run.rejected.length} color="var(--bad)" />
            <Readout label="f 계산 횟수" value={run.evals} />
            <Readout label="t = 8의 오차" value={sci(err)} />
            <Readout label="가장 작은 보폭" value={nf(Math.min(...run.hs), 4)} />
            <Readout label="가장 큰 보폭" value={nf(Math.max(...run.hs), 3)} />
          </div>
          <p className="de-small">비교: 보폭 0.1로 고정한 RK4는 f를 320번 계산하고 오차 {sci(fixed)}입니다.</p>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 5: a stiff equation ─────────────── */

/** A palette colour as 0–255 RGB, by letting the canvas normalise it. */
function rgbOf(css: string): [number, number, number] {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return [80, 160, 100];
  ctx.fillStyle = css;
  const v = String(ctx.fillStyle);
  if (v.startsWith('#') && v.length === 7) return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
  const m = v.match(/[\d.]+/g);
  return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [80, 160, 100];
}

type Region = 'euler' | 'rk4' | 'implicit';

function StiffFigure() {
  const P = usePalette();
  const [h, setH] = useState(0.03);
  const [reg, setReg] = useState<Region>('euler');
  const T = 3;
  const run = useMemo(() => stiffRun(h, T), [h]);
  const z = -50 * h;
  const exEnd = run.explicit[run.explicit.length - 1], imEnd = run.implicit[run.implicit.length - 1];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: H }) => {
      const narrow = w < 560;
      const lw = narrow ? w : Math.round(w * 0.56);
      const lh = narrow ? Math.round(H * 0.55) : H;
      const pl = new Plot(ctx, lw, lh, P, { xMin: 0, xMax: T, yMin: -1.6, yMax: 1.6, pad: { l: 34, r: 10, t: 12, b: 24 } });
      pl.grid({ xStep: 0.5, yStep: 0.5, xLabel: 't' });
      pl.fn(stiffSlow, alpha(P.ink3, 0.9), 1.5, { dash: [5, 4] });
      pl.clip();
      const curve = (ys: number[], color: string, width: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        run.t.forEach((t, i) => {
          const y = Math.max(-50, Math.min(50, ys[i]));
          if (i) ctx.lineTo(pl.X(t), pl.Y(y));
          else ctx.moveTo(pl.X(t), pl.Y(y));
        });
        ctx.stroke();
      };
      curve(run.implicit, P.accent, 2.5);
      curve(run.explicit, P.pos, 1.5);
      pl.unclip();

      // the hλ-plane with the chosen method's stability region
      ctx.save();
      if (narrow) ctx.translate(0, lh);
      else ctx.translate(lw, 0);
      const rw = narrow ? w : w - lw, rh = narrow ? H - lh : H;
      const zp = new Plot(ctx, rw, rh, P, { xMin: -5.5, xMax: 2.5, yMin: -3.5, yMax: 3.5, pad: { l: 26, r: 10, t: 12, b: 24 }, equal: true });
      const [fr, fg, fb] = rgbOf(P.good);
      zp.heatmap((x, y) => (amplification(reg, x, y) <= 1 ? [fr, fg, fb, 70] : [0, 0, 0, 0]), 3);
      zp.grid({ xStep: 1, yStep: 1, xLabel: 'Re hλ', yLabel: 'Im hλ' });
      const zx = Math.max(-5.4, z);
      const inside = amplification(reg, z, 0) <= 1;
      zp.dot(zx, 0, 6, inside ? P.good : P.bad, P.surface, 2);
      zp.text(`hλ = ${nf(z, 2)}`, zx, 0, inside ? P.good : P.bad, { dy: -16, align: 'center', font: `700 11px ${P.fontMono}`, bg: P.surface });
      ctx.restore();
    },
    [P, run, z, reg],
    { height: 360, minHeight: 40 },
  );

  return (
    <Figure
      no={5}
      title="뻣뻣한 방정식: 보폭 하나 차이로 터진다"
      hint="보폭 h를 0.04 근처에서 움직여 보세요"
      caption={
        <>
          왼쪽(좁은 화면에서는 위): <M>{"y' = -50\\,(y - \\cos t),\\; y(0) = 0"}</M>을 명시적 오일러(주황)와 암시적 오일러(파랑)로 푼 결과입니다. 점선은 짧은 처음 구간이 지난 뒤 해가 따라가는 느린 곡선입니다. 오른쪽: 시험 방정식 <M>{"y' = \\lambda y"}</M>에서 한 걸음의 증폭률이 1 이하가 되는 <M>{'h\\lambda'}</M>의 영역(연한 초록)과, 이 문제의 <M>{'h\\lambda = -50h'}</M>(점)입니다. 점이 영역 밖으로 나가면 그 방법의 오차가 걸음마다 커집니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="de-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`보폭 ${h.toFixed(3)}, hλ = ${nf(z, 2)}. t = 3에서 명시적 오일러 ${sci(exEnd, 3)}, 암시적 오일러 ${nf(imEnd, 4)}, 느린 해 ${nf(stiffSlow(run.t[run.t.length - 1]), 4)}.`}>
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Slider id="no-stiff-h" label="보폭 h" value={h} min={0.005} max={0.1} step={0.001} onChange={setH} format={(v) => v.toFixed(3)} />
          <Seg label="안정 영역" value={reg} onChange={setReg} options={[{ value: 'euler', label: '명시적 오일러' }, { value: 'rk4', label: 'RK4' }, { value: 'implicit', label: '암시적 오일러' }]} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="hλ" value={nf(z, 3)} />
            <Readout label="|1 + hλ|" value={nf(Math.abs(1 + z), 3)} color={Math.abs(1 + z) > 1 ? 'var(--bad)' : undefined} />
            <Readout label="명시적, t = 3" value={sci(exEnd, 3)} color="var(--pos)" />
            <Readout label="암시적, t = 3" value={nf(imEnd, 4)} color="var(--accent)" />
          </div>
          <Legend
            items={[
              { color: 'var(--pos)', label: '명시적 오일러', shape: 'ln' },
              { color: 'var(--accent)', label: '암시적 오일러', shape: 'ln' },
              { color: 'var(--good)', label: '안정 영역', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function NumericalOde() {
  return (
    <>
      <h2>기울기를 따라 한 걸음씩</h2>
      <p>
        앞 장들에서 푼 방정식은 공식으로 답이 나오는 운 좋은 경우였습니다. 진자의 진폭이 크거나, 행성이 셋이거나, 날씨처럼 변수가 수백만 개면 공식은 없습니다. 그래도 미분방정식 <M>{"y' = f(t, y)"}</M>은 지금 어디에 있는지만 알면 어느 쪽으로 움직이는지를 알려 줍니다. 그 방향으로 조금 가고, 거기서 다시 방향을 묻는 것을 되풀이하면 해를 따라갈 수 있습니다. 이것이 <T en="Euler's method">오일러 방법</T>입니다.
      </p>
      <MB note="h는 한 걸음의 시간 간격(보폭)입니다.">{'y_{n+1} = y_n + h\\, f(t_n, y_n)'}</MB>
      <p>
        <a href={lessonHref('math-calculus', 'applications')}>미적분학의 선형 근사</a>를 걸음마다 쓰는 셈입니다. <M>{"y' = -y,\\; y(0)=1"}</M>에 h = 0.5로 쓰면 걸음마다 <M>{'y_{n+1} = (1-h)\\,y_n = 0.5\\,y_n'}</M>이라 t = 2(네 걸음)에서 0.0625가 나오는데, 정확한 값 <M>{'e^{-2} = 0.1353'}</M>의 절반도 안 됩니다. 보폭을 줄이면 나아지지만, 얼마나 줄여야 할까요? 그리고 오차는 그냥 쌓이기만 할까요? 그림 1에서 원을 따라 도는 운동으로 확인해 봅시다.
      </p>
      <OrbitFigure />
      <p>
        기본값(오일러, h = 0.1)에서 한 바퀴를 돌면 에너지가 처음의 1.87배가 되어 궤적이 바깥으로 소용돌이칩니다. 이유는 한 줄로 계산됩니다. 오일러의 한 걸음은 <M>{'(x, v)'}</M>에 행렬 <M>{'\\begin{pmatrix}1 & h\\\\ -h & 1\\end{pmatrix}'}</M>을 곱하는 일인데, 이 행렬은 회전에 더해 길이를 <M>{'\\sqrt{1+h^2}'}</M>배 늘립니다. 에너지는 걸음마다 <M>{'1+h^2'}</M>배, 한 바퀴(63걸음)면 <M>{'1.01^{63} \\approx 1.87'}</M>배입니다. 보폭을 0.05로 줄여도 한 바퀴에 1.37배이고, 1000바퀴를 돌리면 수가 터집니다. 같은 h = 0.1에서 RK4로 바꾸면 한 바퀴 뒤의 에너지는 0.999999배로, 눈으로는 원과 구별되지 않습니다.
      </p>

      <h2>기울기를 여러 번 재기: 호인과 RK4</h2>
      <p>
        오일러 방법은 한 걸음 내내 출발점의 기울기를 씁니다. 그 사이에 기울기가 바뀌면 그만큼 틀립니다. 더 나은 방법은 한 걸음 안에서 기울기를 몇 번 더 재 보고 평균을 내는 것입니다. 끝점의 기울기까지 재어 두 기울기를 평균 내는 <T en="Heun's method">호인 방법</T>이 가장 간단하고, 가장 널리 쓰이는 것은 기울기를 네 번 재는 <T en="Runge–Kutta method">룽게-쿠타 방법</T>(RK4)입니다.
      </p>
      <MB>{'\\begin{aligned} k_1 &= f(t_n, y_n), & k_2 &= f\\bigl(t_n + \\tfrac h2,\\, y_n + \\tfrac h2 k_1\\bigr),\\\\ k_3 &= f\\bigl(t_n + \\tfrac h2,\\, y_n + \\tfrac h2 k_2\\bigr), & k_4 &= f(t_n + h,\\, y_n + h k_3),\\\\ y_{n+1} &= y_n + \\tfrac h6\\,(k_1 + 2k_2 + 2k_3 + k_4) \\end{aligned}'}</MB>
      <StagesFigure />
      <p>
        h = 0.5에서 네 기울기는 −1, −0.5, −0.625, −0.1875이고, 이것으로 간 RK4의 답 0.713542는 정확한 값 0.713061과 0.00048밖에 차이 나지 않습니다. 같은 보폭의 오일러는 0.5로, 0.21이나 틀립니다. 1 : 2 : 2 : 1의 가중치는 아무렇게나 고른 것이 아닙니다. 이 값을 테일러 전개하면 <M>{'h^4'}</M> 항까지 정확한 해의 전개와 맞도록 고른 것이고, 넓이를 재는 심프슨 공식과 같은 가중치입니다.
      </p>

      <h2>오차의 차수</h2>
      <p>
        방법의 정확도는 <T en="order">차수</T>로 잽니다. 정해진 시각까지 풀었을 때 오차가 <M>{'Ch^p'}</M>처럼 줄면 p차 방법입니다. 보폭을 반으로 줄이면 오차가 1차 방법은 1/2로, 2차는 1/4로, 4차는 1/16로 줍니다. 그림 3에서 직접 재 보세요.
      </p>
      <OrderFigure />
      <p>
        맞춘 기울기는 오일러 1.02, 호인 2.11, RK4 4.11로 이론값 1, 2, 4에 가깝습니다. 차이를 실감하려면 같은 정확도를 얻는 데 드는 계산을 세 보면 됩니다. t = 2에서 오차를 10⁻⁶ 아래로 낮추려면, 보폭을 1에서 시작해 반씩 줄였을 때 오일러는 걸음 1,048,576개(f 계산 1,048,576번)가, 호인은 1,024걸음(2,048번)이, RK4는 32걸음(128번)이 필요합니다. 한 걸음이 비싸도 차수가 높은 방법이 압도적으로 쌉니다.
      </p>
      <Callout kind="note">
        보폭을 끝없이 줄인다고 오차가 끝없이 줄지는 않습니다. 걸음 수가 늘면 걸음마다 섞이는 반올림 오차가 쌓이기 때문입니다. 그림 3에서 RK4의 왼쪽 끝이 10⁻¹⁰ 근처에서 기울기가 살짝 꺾이는 것이 그 시작입니다. 컴퓨터가 수를 담는 방식과 반올림 오차는 <a href={lessonHref('math-numerical-analysis', 'floating-point')}>수치해석</a>에서 자세히 다룹니다.
      </Callout>

      <h2>보폭을 스스로 고르기</h2>
      <p>
        해가 거의 변하지 않는 구간에서는 큰 보폭으로도 충분하고, 갑자기 변하는 곳에서만 촘촘히 가면 됩니다. <T en="adaptive step size">적응적 보폭</T> 방법은 걸음마다 오차를 추정해 보폭을 스스로 고릅니다. 같은 기울기 계산으로 4차와 5차 답을 동시에 만들어 그 차이를 오차의 추정값으로 쓰는 <T en="Runge–Kutta–Fehlberg / Dormand–Prince">RK45</T>가 대표적입니다. 추정 오차가 허용치보다 크면 그 걸음을 버리고 보폭을 줄여 다시 하고, 작으면 받아들이고 다음 보폭을 늘립니다.
      </p>
      <AdaptiveFigure />
      <p>
        허용 오차 10⁻⁵에서 RK45는 32걸음을 받아들이고 12걸음을 다시 시도해, f를 308번 계산하고 t = 8에서 1.39×10⁻⁶의 오차를 냅니다. 보폭은 밀리는 순간 근처에서 0.024까지 줄었다가 평온한 곳에서는 0.571까지 늘어납니다. 비슷한 계산량(320번)으로 보폭 0.1을 고정한 RK4는 1.34×10⁻³을 틀려, 오차가 약 천 배 큽니다. 고정 보폭은 아무 일도 없는 구간에서도 짧은 순간에 맞춘 보폭을 써야 하기 때문입니다.
      </p>
      <Callout kind="warn">
        허용 오차를 10⁻³으로 느슨하게 하면 RK45는 7걸음 만에 끝나는데, 걸음 하나가 t = 3의 순간을 통째로 건너뛰어 밀림이 없었던 것처럼 답합니다. 오차 추정은 걸음 안에서 샘플링한 점들로만 하므로, 그 점들 사이에 숨은 사건은 볼 수 없습니다. 짧은 충격이 있는 문제에서는 그 시각을 알려 주거나 최대 보폭을 제한해야 합니다.
      </Callout>

      <h2>뻣뻣한 방정식</h2>
      <p>
        어떤 방정식은 해가 매끄러운데도 큰 보폭을 허락하지 않습니다. <M>{"y' = -50\\,(y - \\cos t)"}</M>의 해는 처음 0.1초쯤 사이에 <M>{'\\cos t'}</M> 근처로 빠르게 끌려간 뒤, 그 뒤로는 느린 곡선을 따라갑니다. 해만 보면 보폭 0.1로도 충분해 보이지만, 명시적 오일러로 그렇게 하면 수가 터집니다. 이처럼 아주 빠른 변화와 느린 변화가 함께 있는 방정식을 <T en="stiff">뻣뻣하다</T>고 합니다. 화학 반응, 전기 회로, 열 전도 시뮬레이션에서 흔합니다.
      </p>
      <StiffFigure />
      <p>
        원인은 시험 방정식 <M>{"y' = \\lambda y"}</M>로 볼 수 있습니다. 명시적 오일러의 한 걸음은 오차를 <M>{'1 + h\\lambda'}</M>배 하므로 <M>{'|1 + h\\lambda| \\le 1'}</M>이어야 오차가 자라지 않습니다. λ = −50이면 <M>{'h \\le 2/50 = 0.04'}</M>입니다. 그림에서 h = 0.039일 때 t = 3의 값은 −0.968로 느린 해를 따라가지만, 0.041로 겨우 0.002 늘리면 34.2가 되고, 0.05면 −3.7×10¹⁰입니다. RK4도 실수축에서 −2.785까지만 버텨서 크게 낫지 않습니다. 반면 다음 점의 기울기로 걸음을 정하는 <T en="implicit Euler">암시적 오일러</T> <M>{'y_{n+1} = y_n + h f(t_{n+1}, y_{n+1})'}</M>은 증폭률이 <M>{'1/|1 - h\\lambda|'}</M>라 왼쪽 반평면 전체가 안정 영역이고, 어떤 보폭에서도 터지지 않습니다. 대신 걸음마다 <M>{'y_{n+1}'}</M>에 대한 방정식을 풀어야 해서 한 걸음이 비쌉니다.
      </p>

      <h2>오래 돌릴 때: 에너지를 지키는 방법</h2>
      <p>
        행성의 궤도나 분자의 운동처럼 아주 오래 돌려야 하는 계산에서는 정확도보다 성질을 지키는 것이 중요할 때가 있습니다. 그림 1로 돌아가 h = 0.5, 1000바퀴로 두고 RK4와 <T en="leapfrog / velocity Verlet">립프로그</T>를 비교해 보세요. RK4의 에너지는 한 바퀴마다 아주 조금씩 줄어 1000바퀴 뒤에는 처음의 0.071배, 궤적이 원점 쪽으로 말려 들어갑니다. 립프로그는 걸음 하나하나는 2차 방법이라 RK4보다 덜 정확하지만, 에너지가 0.9375배와 1배 사이를 오갈 뿐 1000바퀴 뒤에도 0.946배로 그 띠를 벗어나지 않습니다.
      </p>
      <MB note="속도를 반 걸음, 위치를 한 걸음, 다시 속도를 반 걸음 갱신합니다.">{'v_{n+\\frac12} = v_n - \\tfrac h2 x_n,\\quad x_{n+1} = x_n + h\\, v_{n+\\frac12},\\quad v_{n+1} = v_{n+\\frac12} - \\tfrac h2 x_{n+1}'}</MB>
      <p>
        립프로그의 한 걸음은 (x, v) 평면의 넓이를 정확히 보존하는 변환이고, 이런 방법을 <T en="symplectic integrator">심플렉틱 적분법</T>이라고 합니다. 넓이를 지키므로 궤적이 안으로 말려 들어가거나 밖으로 퍼질 수 없습니다. 그래서 천체 역학과 분자 동역학 시뮬레이션은 오랫동안 이 계열의 방법을 써 왔습니다.
      </p>

      <Callout kind="key">
        수치 해법은 기울기를 따라 한 걸음씩 가며, 오차는 보폭의 거듭제곱 <M>{'h^p'}</M>으로 줄어듭니다. 오일러는 1차, 기울기를 네 번 재는 RK4는 4차라, 같은 정확도에 드는 계산이 수천 배 차이 납니다. 적응적 방법은 걸음마다 오차를 추정해 보폭을 스스로 고르지만 걸음 사이의 짧은 사건은 놓칠 수 있습니다. 뻣뻣한 방정식에서는 정확도가 아니라 안정성이 보폭을 묶으므로 암시적 방법을 쓰고, 오래 돌리는 보존계에서는 에너지를 지키는 심플렉틱 방법을 씁니다.
      </Callout>
      <Quiz
        q="y′ = −200y 꼴의 빠른 감쇠 항이 있는 방정식을 명시적 오일러로 풀려고 한다. 해 자체는 매끄럽다. 터지지 않으려면 보폭 h가 대략 어떤 조건을 지켜야 하는가?"
        options={['h ≤ 0.1', 'h ≤ 0.01', 'h ≤ 0.001', '해가 매끄러우니 보폭과 상관없다']}
        answer={1}
        explain={
          <>
            명시적 오일러는 <M>{'|1 + h\\lambda| \\le 1'}</M>일 때만 오차가 자라지 않습니다. λ = −200이면 <M>{'-2 \\le -200h \\le 0'}</M>, 곧 <M>{'h \\le 2/200 = 0.01'}</M>입니다. 해가 매끄러운 것과 상관없이 빠른 감쇠 항이 보폭을 묶는 것이 뻣뻣함입니다. 이보다 큰 보폭을 쓰고 싶다면 암시적 방법을 써야 합니다.
          </>
        }
      />
    </>
  );
}
