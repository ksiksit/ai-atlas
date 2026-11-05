import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { LV_DEFAULT, integrate, logisticOrbit, logisticPeriod, lorenzTwins, lvConserved, lvEquilibrium, lvField, lvJacobian, lvPeriod, slope, vdpCycle, vdpField } from './chaos';
import './ode.css';
import './chaos.css';

const nf = (v: number, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');
const sci = (v: number) => {
  if (v === 0) return '0';
  const [m, e] = v.toExponential(2).split('e');
  return `${m}×10^${Number(e)}`;
};
const p = LV_DEFAULT;

/* ───────── Figure 1: rabbits and foxes ───────── */

const LV_T = 30;
const LV_BOX = { xMin: 0, xMax: 50, yMin: 0, yMax: 30 };

function PredatorPreyFigure() {
  const P = usePalette();
  const [start, setStart] = useState<[number, number]>([40, 9]);
  const [method, setMethod] = useState<'rk4' | 'euler'>('rk4');
  const [h, setH] = useState(0.01);
  const traj = useMemo(() => integrate(lvField(p), start, LV_T, h, method), [start, h, method]);
  const V0 = lvConserved(p, start[0], start[1]);
  const period = useMemo(() => lvPeriod(p, start[0], start[1]), [start]);
  const drift = traj.reduce((m, q) => (q[0] > 0 && q[1] > 0 ? Math.max(m, Math.abs(lvConserved(p, q[0], q[1]) - V0)) : m), 0);
  const plRef = useRef<Plot | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: H }) => {
      const wide = w >= 600;
      const leftW = wide ? w * 0.5 : w;
      const topH = wide ? H : H * 0.55;
      const pl = new Plot(ctx, w, H, P, { ...LV_BOX, pad: wide ? { l: 34, r: w - leftW + 12, t: 12, b: 30 } : { l: 34, r: 12, t: 12, b: H - topH + 30 } });
      plRef.current = pl;
      pl.grid({ xStep: 10, yStep: 10, labels: true, axes: true, xLabel: '토끼 x', yLabel: '여우 y' });
      // the direction field
      const f = lvField(p);
      for (let i = 1; i < 12; i++)
        for (let j = 1; j < 8; j++) {
          const x = (50 * i) / 12, y = (30 * j) / 8;
          const [vx, vy] = f([x, y]);
          const s = Math.hypot(vx / 50, vy / 30);
          if (s < 1e-9) continue;
          const L = 0.035;
          const ux = (vx / 50 / s) * L * 50, uy = (vy / 30 / s) * L * 30;
          pl.arrow(x - ux / 2, y - uy / 2, x + ux / 2, y + uy / 2, alpha(P.ink3, 0.4), 1.1, 5);
        }
      pl.clip();
      ctx.strokeStyle = method === 'rk4' ? P.neg : P.pos;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      traj.forEach((q, i) => (i ? ctx.lineTo(pl.X(q[0]), pl.Y(q[1])) : ctx.moveTo(pl.X(q[0]), pl.Y(q[1]))));
      ctx.stroke();
      pl.unclip();
      const [ex, ey] = lvEquilibrium(p);
      pl.dot(ex, ey, 5, P.ink, P.surface, 1.5);
      pl.text('평형점 (20, 10)', ex, ey, P.ink2, { dx: 8, dy: 10, align: 'left', font: `10px ${P.fontMono}`, bg: P.surface });
      pl.dot(start[0], start[1], 7, P.accent, P.surface, 2);
      pl.frame();
      // time series
      const tp = new Plot(ctx, w, H, P, { xMin: 0, xMax: LV_T, yMin: 0, yMax: 50, pad: wide ? { l: leftW + 34, r: 10, t: 12, b: 30 } : { l: 34, r: 12, t: topH + 12, b: 30 } });
      tp.grid({ xStep: 5, yStep: 10, labels: true, axes: true, xLabel: '시간' });
      tp.clip();
      const series = (k: number, c: string) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.beginPath();
        traj.forEach((q, i) => {
          const x = tp.X((LV_T * i) / (traj.length - 1)), y = tp.Y(q[k]);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.stroke();
      };
      series(0, P.good);
      series(1, P.bad);
      tp.unclip();
      tp.frame();
    },
    [P, traj, start, method],
    { aspect: 1.8, maxHeight: 400, minHeight: 40 },
  );

  useDrag(wrapRef, {
    hit: (x, y) => {
      const pl = plRef.current;
      if (!pl) return null;
      return Math.hypot(x - pl.X(start[0]), y - pl.Y(start[1])) < 16 ? 's' : null;
    },
    onDrag: (_, x, y) => {
      const pl = plRef.current;
      if (!pl) return;
      setStart([Math.round(Math.max(2, Math.min(48, pl.invX(x)))), Math.round(Math.max(1, Math.min(28, pl.invY(y))))]);
    },
  });

  return (
    <Figure
      no={1}
      title="토끼와 여우"
      hint="출발점을 끌고, 푸는 방법을 바꿔 보세요"
      caption={
        <>
          <M>{"x' = x - 0.1xy,\\ y' = 0.075xy - 1.5y"}</M>를 시간 0부터 30까지 푼 것입니다. 왼쪽은 위상 평면(회색 화살표는 흐름의 방향), 오른쪽은 시간에 따른 토끼(초록)와 여우(빨강)의 수입니다. RK4로 푼 궤적은 파랑, 오일러 방법으로 푼 궤적은 주황으로 그립니다. 마지막 칸의 "보존량의 최대 오차"는 아래 상자의 V가 처음 값에서 가장 많이 벗어난 양입니다.
        </>
      }
    >
      <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`토끼 ${start[0]}마리, 여우 ${start[1]}마리에서 출발한 로트카-볼테라 궤적을 ${method === 'rk4' ? 'RK4' : '오일러 방법'}, 보폭 ${h}로 푼 그림. 보존량의 최대 오차는 ${sci(drift)}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <Seg label="푸는 방법" value={method} onChange={setMethod} options={[{ value: 'rk4', label: 'RK4' }, { value: 'euler', label: '오일러' }]} />
        <Seg label="보폭 h" value={h} onChange={setH} options={[0.05, 0.01, 0.001].map((v) => ({ value: v, label: String(v) }))} />
        <Slider id="ch-x0" label="처음 토끼 x₀" value={start[0]} min={2} max={48} step={1} onChange={(v) => setStart([v, start[1]])} />
        <Slider id="ch-y0" label="처음 여우 y₀" value={start[1]} min={1} max={28} step={1} onChange={(v) => setStart([start[0], v])} />
      </div>
      <div className="readouts">
        <Readout label="처음의 V" value={nf(V0, 4)} />
        <Readout label="보존량의 최대 오차" value={sci(drift)} color={drift > 1e-3 ? 'var(--bad)' : 'var(--good)'} />
        <Readout label="한 바퀴 시간 (RK4)" value={nf(period, 3)} />
      </div>
      <Legend
        items={[
          { color: 'var(--good)', label: '토끼 x(t)', shape: 'ln' },
          { color: 'var(--bad)', label: '여우 y(t)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ───────── Figure 2: zooming in on the equilibrium ───────── */

const OMEGA = Math.sqrt(p.alpha * p.gamma);

function LinearizeFigure() {
  const P = usePalette();
  const [amp, setAmp] = useState(5);
  const [ex, ey] = lvEquilibrium(p);
  const J = lvJacobian(p, ex, ey);
  const J0 = lvJacobian(p, 0, 0);
  const period = useMemo(() => lvPeriod(p, ex + amp, ey), [amp]);
  const orbit = useMemo(() => integrate(lvField(p), [ex + amp, ey], period * 1.02, 0.005), [amp, period]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: 42, yMin: 0, yMax: 26, equal: true, pad: { l: 34, r: 10, t: 12, b: 30 } });
      pl.grid({ xStep: 10, yStep: 10, labels: true, axes: true, xLabel: '토끼 x', yLabel: '여우 y' });
      pl.clip();
      // the linearized solution: u = a cos ωt, v = (aω/β x*)·... written from u′ = −(βγ/δ) v, v′ = (δα/β) u
      ctx.strokeStyle = P.ink2;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const s = (2 * Math.PI * i) / 200;
        const u = amp * Math.cos(s);
        const v = ((amp * OMEGA) / -J[1]) * Math.sin(s);
        if (i) ctx.lineTo(pl.X(ex + u), pl.Y(ey + v));
        else ctx.moveTo(pl.X(ex + u), pl.Y(ey + v));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = P.neg;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      orbit.forEach((q, i) => (i ? ctx.lineTo(pl.X(q[0]), pl.Y(q[1])) : ctx.moveTo(pl.X(q[0]), pl.Y(q[1]))));
      ctx.stroke();
      pl.unclip();
      pl.dot(ex, ey, 5, P.ink, P.surface, 1.5);
      pl.dot(ex + amp, ey, 6, P.accent, P.surface, 2);
      pl.frame();
    },
    [P, amp, orbit],
    { aspect: 1.5, maxHeight: 400, minHeight: 40 },
  );

  return (
    <Figure
      no={2}
      title="평형점 가까이에서는 선형계"
      hint="출발점이 평형점에서 얼마나 떨어졌는지 바꿔 보세요"
      caption={
        <>
          평형점 (20, 10)에서 토끼만 a마리 많게 출발한 궤적(파랑)과, 같은 점에서 출발한 선형화된 계의 궤적(점선 타원)입니다. a가 작을수록 둘이 겹치고, 한 바퀴 도는 시간도 선형화가 예측한 <M>{'2\\pi/\\omega = 2\\pi/\\sqrt{1.5} \\approx 5.130'}</M>에 가까워집니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`평형점에서 토끼 ${amp}마리만큼 벗어나 출발한 궤적과 선형화한 타원. 실제 한 바퀴 시간은 ${nf(period, 3)}, 선형화의 예측은 5.130입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="ch-amp" label="평형점에서 떨어진 정도 a" value={amp} min={1} max={19} step={1} onChange={setAmp} />
          <MB>{`J(20, 10) = \\begin{pmatrix} ${nf(J[0], 0)} & ${nf(J[1], 0)} \\\\ ${nf(J[2], 2)} & ${nf(J[3], 0)} \\end{pmatrix}`}</MB>
          <MB>{`J(0, 0) = \\begin{pmatrix} ${nf(J0[0], 0)} & ${nf(J0[1], 0)} \\\\ ${nf(J0[2], 0)} & ${nf(J0[3], 1)} \\end{pmatrix}`}</MB>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="실제 한 바퀴" value={nf(period, 3)} color="var(--neg)" />
            <Readout label="선형화의 예측" value={nf((2 * Math.PI) / OMEGA, 3)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ───────── Figure 3: a limit cycle ───────── */

const VDP_T = 40;

function LimitCycleFigure() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const [mu, setMu] = useState(1);
  const cycle = useMemo(() => vdpCycle(mu), [mu]);
  const paths = useMemo(() => [integrate(vdpField(mu), [0.1, 0], VDP_T, 0.01), integrate(vdpField(mu), [3.5, 4], VDP_T, 0.01)], [mu]);
  const ymax = useMemo(() => Math.max(4.5, ...paths.flat().map((q) => Math.abs(q[1]))) * 1.08, [paths]);
  const t = useRef(still ? VDP_T : 0);
  const [, setTick] = useState(0);
  useAnimationFrame((dt) => {
    t.current = Math.min(VDP_T, t.current + dt * 6);
    setTick((x) => x + 1);
  }, inView && !still && t.current < VDP_T);
  const k = Math.round((t.current / VDP_T) * (paths[0].length - 1));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: -4, xMax: 4, yMin: -ymax, yMax: ymax, pad: { l: 34, r: 10, t: 12, b: 30 } });
      pl.grid({ xStep: 1, yStep: ymax > 8 ? 4 : 2, labels: true, axes: true, xLabel: 'x', yLabel: "y = x'" });
      pl.clip();
      [P.neg, P.pos].forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        paths[i].slice(0, k + 1).forEach((q, j) => (j ? ctx.lineTo(pl.X(q[0]), pl.Y(q[1])) : ctx.moveTo(pl.X(q[0]), pl.Y(q[1]))));
        ctx.stroke();
        const q = paths[i][k];
        pl.dot(q[0], q[1], 5, c, P.surface, 2);
      });
      pl.unclip();
      pl.dot(0, 0, 4, P.ink, P.surface, 1.5);
      pl.frame();
    },
    [P, paths, k, ymax],
    { aspect: 1.5, maxHeight: 400, minHeight: 40 },
  );

  return (
    <Figure
      no={3}
      title="안에서도 밖에서도 같은 고리로"
      hint="μ를 바꾸고 다시 재생해 보세요"
      caption={
        <>
          판 데르 폴 방정식 <M>{"x'' - \\mu(1 - x^2)x' + x = 0"}</M>을 <M>{"y = x'"}</M>로 놓아 위상 평면에 그린 것입니다. 파랑은 원점 가까이 (0.1, 0)에서, 주황은 바깥 (3.5, 4)에서 출발합니다. 두 궤적 모두 같은 닫힌 고리, 곧 극한 순환으로 다가갑니다. 한 바퀴 시간과 진폭은 충분히 오래 돌린 뒤에 잰 값입니다.
        </>
      }
    >
      <div ref={outer}>
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`μ = ${nf(mu, 1)}인 판 데르 폴 방정식. 안쪽과 바깥쪽에서 출발한 두 궤적이 진폭 ${nf(cycle.amp, 3)}, 한 바퀴 ${nf(cycle.period, 3)}인 극한 순환으로 다가갑니다.`}>
          <canvas ref={canvasRef} />
        </div>
      </div>
      <div className="controls row">
        <Slider id="ch-mu" label="μ" value={mu} min={0.1} max={4} step={0.1} onChange={(v) => { setMu(v); t.current = still ? VDP_T : 0; }} format={(v) => nf(v, 1)} />
        <Button small onClick={() => { t.current = still ? VDP_T : 0; setTick((x) => x + 1); }}>
          다시 재생
        </Button>
      </div>
      <div className="readouts">
        <Readout label="극한 순환의 진폭" value={nf(cycle.amp, 3)} />
        <Readout label="한 바퀴 시간" value={nf(cycle.period, 3)} />
        <Readout label="μ = 0일 때 (조화 진동)" value="2π ≈ 6.283" />
      </div>
    </Figure>
  );
}

/* ───────── Figure 4: the Lorenz butterfly and two nearly equal starts ───────── */

const LZ_T = 40;
const LZ_H = 0.005;

function LorenzFigure() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const twins = useMemo(() => lorenzTwins(LZ_T, LZ_H), []);
  const ts = useMemo(() => twins.logd.map((_, i) => i * LZ_H), [twins]);
  const fit = useMemo(() => slope(ts, twins.logd, 2, 20), [ts, twins]);
  const [yaw, setYaw] = useState(0.15);
  const [playing, setPlaying] = useState(!still);
  const t = useRef(still ? LZ_T : 0);
  const [, setTick] = useState(0);
  useAnimationFrame((dt) => {
    t.current = Math.min(LZ_T, t.current + dt * 2.5);
    if (t.current >= LZ_T) setPlaying(false);
    setTick((x) => x + 1);
  }, inView && playing);
  const k = Math.round(t.current / LZ_H);
  const firstOne = ts.find((_, i) => twins.logd[i] > 0) ?? NaN;
  const dragFrom = useRef<{ x: number; yaw: number } | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const topH = h * 0.66;
      // the butterfly, rotated about the vertical (z) axis and seen slightly from above
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const S = Math.min(w / 58, topH / 54);
      const proj = (q: number[]): [number, number] => {
        const x = q[0] * cy - q[1] * sy;
        const depth = q[0] * sy + q[1] * cy;
        return [w / 2 + x * S, topH - 6 - (q[2] - 2 + depth * 0.18) * S * 0.92];
      };
      const draw = (pts: number[][], c: string, width: number) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let i = 0; i <= k; i += 2) {
          const [X, Y] = proj(pts[i]);
          if (i) ctx.lineTo(X, Y);
          else ctx.moveTo(X, Y);
        }
        ctx.stroke();
      };
      draw(twins.a, alpha(P.neg, 0.75), 1.1);
      draw(twins.b, alpha(P.pos, 0.75), 1.1);
      for (const [pts, c] of [[twins.a, P.neg], [twins.b, P.pos]] as const) {
        const [X, Y] = proj(pts[k]);
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(X, Y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = P.surface;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // log10 of the distance between the twins
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: LZ_T, yMin: -9, yMax: 2, pad: { l: 40, r: 10, t: topH + 8, b: 26 } });
      pl.grid({ xStep: 5, yStep: 2, labels: false, axes: false });
      // tick labels by hand: time below, powers of ten on the left
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let v = 0; v <= LZ_T; v += 10) ctx.fillText(String(v), pl.X(v), pl.Y(-9) + 5);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let v = -8; v <= 2; v += 2) ctx.fillText(`10^${String(v).replace('-', '−')}`, pl.X(0) - 4, pl.Y(v));
      pl.clip();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= k; i += 4) {
        const X = pl.X(ts[i]), Y = pl.Y(twins.logd[i]);
        if (i) ctx.lineTo(X, Y);
        else ctx.moveTo(X, Y);
      }
      ctx.stroke();
      // the fitted line over 2 ≤ t ≤ 20
      const b = twins.logd.reduce((s, v, i) => (ts[i] >= 2 && ts[i] <= 20 ? s + v - fit * ts[i] : s), 0) / ts.filter((x) => x >= 2 && x <= 20).length;
      pl.line(2, b + fit * 2, 20, b + fit * 20, alpha(P.accent, 0.9), 2, [6, 4]);
      pl.unclip();
      pl.text('두 궤적 사이 거리 (로그)', 0, 2, P.ink3, { dx: 4, dy: 9, align: 'left', font: `10px ${P.fontBody}` });
      pl.frame();
    },
    [P, twins, ts, fit, yaw, k],
    { aspect: 1.05, maxHeight: 560, minHeight: 40 },
  );

  useDrag(wrapRef, {
    hit: (_x, y) => (y < (wrapRef.current?.clientHeight ?? 0) * 0.66 ? 'rot' : null),
    onDrag: (_, x) => {
      if (!dragFrom.current) dragFrom.current = { x, yaw };
      setYaw(dragFrom.current.yaw + (x - dragFrom.current.x) * 0.01);
    },
    onEnd: () => (dragFrom.current = null),
  });

  const dNow = 10 ** twins.logd[Math.min(k, twins.logd.length - 1)];
  return (
    <Figure
      no={4}
      title="로렌츠 나비와 거의 같은 두 출발점"
      hint="위쪽 그림을 좌우로 끌어 돌려 보세요"
      caption={
        <>
          로렌츠 계 <M>{"x' = 10(y - x),\\ y' = x(28 - z) - y,\\ z' = xy - \\tfrac{8}{3}z"}</M>를 RK4(보폭 0.005)로 푼 것입니다. 파랑과 주황 궤적은 x 좌표만 <M>{'10^{-8}'}</M> 다르게 출발합니다. 아래 그래프는 두 점 사이 거리를 로그 눈금으로 그린 것이고, 점선은 t = 2부터 20까지에 맞춘 직선입니다.
        </>
      }
    >
      <div ref={outer}>
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`로렌츠 끌개 위의 두 궤적. 시각 ${nf(t.current, 1)}에 두 점 사이 거리는 ${sci(dNow)}입니다. 거리는 처음 10^−8에서 시각 ${nf(firstOne, 1)}쯤 1을 넘습니다.`}>
          <canvas ref={canvasRef} />
        </div>
      </div>
      <div className="controls row">
        <Button small primary onClick={() => { if (t.current >= LZ_T) t.current = 0; setPlaying((v) => !v); }}>
          {playing ? '❚❚ 멈춤' : '▶ 재생'}
        </Button>
        <Button small onClick={() => { t.current = 0; setPlaying(!still); setTick((x) => x + 1); }}>
          처음부터
        </Button>
        <Slider id="ch-yaw" label="돌리기" value={yaw} min={-3.1} max={3.1} step={0.05} onChange={setYaw} format={(v) => `${Math.round((v * 180) / Math.PI)}°`} />
      </div>
      <div className="readouts">
        <Readout label="시각 t" value={nf(t.current, 1)} />
        <Readout label="두 점 사이 거리" value={sci(dNow)} color={dNow > 1 ? 'var(--bad)' : undefined} />
        <Readout label="직선의 기울기 (자릿수/시간)" value={nf(fit, 3)} />
      </div>
    </Figure>
  );
}

/* ───────── Figure 5: the logistic map ───────── */

const R0 = 2.5, R1 = 4;

function LogisticFigure() {
  const P = usePalette();
  const [r, setR] = useState(3.5);
  const period = logisticPeriod(r);
  const orbit = logisticOrbit(r, 16, 2000);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: R0, xMax: R1, yMin: 0, yMax: 1, pad: { l: 34, r: 10, t: 10, b: 30 } });
      pl.grid({ xStep: 0.25, yStep: 0.25, labels: true, axes: false, xLabel: 'r' });
      ctx.fillStyle = alpha(P.ink, 0.35);
      const cols = Math.round(pl.pw);
      for (let c = 0; c < cols; c++) {
        const rr = R0 + ((R1 - R0) * (c + 0.5)) / cols;
        for (const x of logisticOrbit(rr, 120, 300)) ctx.fillRect(pl.X(rr), pl.Y(x), 1, 1);
      }
      pl.line(r, 0, r, 1, alpha(P.accent, 0.8), 1.5);
      for (const x of orbit) pl.dot(r, x, 3.5, P.accent);
      pl.frame();
    },
    [P, r],
    { aspect: 1.7, maxHeight: 380, minHeight: 40 },
  );

  return (
    <Figure
      no={5}
      title="로지스틱 사상의 갈래 그림"
      hint="r을 움직여 주기가 두 배씩 늘어나는 곳을 찾아보세요"
      caption={
        <>
          <M>{'x_{n+1} = r x_n (1 - x_n)'}</M>을 0.5에서 시작해 300번 돌린 뒤, 그다음 120번의 값을 r마다 세로로 찍은 그림입니다. 값이 한 점에 모이면 수렴, 두 점이면 주기 2, 띠처럼 퍼지면 주기가 없는 혼돈입니다. 파란 점은 고른 r에서 5,000번 돌린 뒤의 값들이고, 주기는 그 값들이 몇 번마다 반복되는지(오차 <M>{'10^{-6}'}</M> 안)로 셉니다.
        </>
      }
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`로지스틱 사상의 갈래 그림. r = ${nf(r, 3)}에서 궤도의 주기는 ${period ? period : '없음(혼돈)'}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <Slider id="ch-r" label="r" value={r} min={R0} max={R1} step={0.001} onChange={setR} format={(v) => nf(v, 3)} />
        <div className="btn-row">
          {[2.8, 3.2, 3.5, 3.55, 3.566, 3.7, 3.83].map((v) => (
            <Button key={v} small onClick={() => setR(v)}>
              {v}
            </Button>
          ))}
        </div>
      </div>
      <div className="readouts">
        <Readout label="주기" value={period ? String(period) : '없음 (혼돈)'} color={period ? undefined : 'var(--bad)'} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function NonlinearChaos() {
  return (
    <>
      <h2>토끼와 여우</h2>
      <p>
        <a href={lessonHref('math-differential-equations', 'linear-systems')}>앞 장</a>의 연립계는 변화율이 일차식이었습니다. 실제 세계의 계는 대부분 그렇지 않습니다. 1920년대에 로트카(Alfred Lotka)와 볼테라(Vito Volterra)가 따로 내놓은 포식자-피식자 모형을 봅시다. 토끼 x는 혼자 두면 비율 α로 불어나지만 여우를 만날 때마다 잡아먹히고, 여우 y는 혼자 두면 비율 γ로 줄지만 토끼를 잡아먹을수록 불어납니다. 만나는 횟수는 xy에 비례한다고 놓습니다.
      </p>
      <MB note="이 장의 그림은 α = 1, β = 0.1, δ = 0.075, γ = 1.5입니다.">{"x' = \\alpha x - \\beta xy, \\qquad y' = \\delta xy - \\gamma y"}</MB>
      <p>
        xy 항 때문에 이 계는 <T en="nonlinear">비선형</T>이고, 해를 초등함수로 적을 수 없습니다. 그래도 위상 평면은 많은 것을 알려 줍니다. 두 변화율이 모두 0인 평형점은 (0, 0)과 <M>{'(\\gamma/\\delta, \\alpha/\\beta) = (20, 10)'}</M>입니다. 그림 1에서 출발점을 옮겨 보세요.
      </p>
      <PredatorPreyFigure />
      <p>
        토끼 40마리, 여우 9마리에서 출발하면, 토끼가 먼저 늘고, 먹이가 많아진 여우가 뒤따라 늘고, 토끼가 줄고, 여우가 굶어 줄어든 뒤 다시 처음으로 돌아옵니다. 토끼는 8.1마리에서 40.1마리 사이를, 여우는 3.2마리에서 23.0마리 사이를 오르내리고, 한 바퀴에 시간 5.467이 걸립니다. 궤적은 닫힌 곡선입니다. 그 이유는 이 계에 보존량이 있기 때문입니다.
      </p>
      <div className="ch-proof">
        <div className="ch-proof-head">정리 (로트카-볼테라의 보존량)</div>
        <p>
          <M>{'x, y > 0'}</M>에서 <M>{'V(x, y) = \\delta x - \\gamma\\ln x + \\beta y - \\alpha\\ln y'}</M>는 모든 해를 따라 일정합니다.
        </p>
        <p>
          <b>증명.</b> 연쇄 법칙으로 <M>{"\\frac{d}{dt}V = \\left(\\delta - \\frac{\\gamma}{x}\\right)x' + \\left(\\beta - \\frac{\\alpha}{y}\\right)y'"}</M>입니다. <M>{"x' = x(\\alpha - \\beta y)"}</M>, <M>{"y' = y(\\delta x - \\gamma)"}</M>를 넣으면 첫 항은 <M>{'(\\delta x - \\gamma)(\\alpha - \\beta y)'}</M>, 둘째 항은 <M>{'(\\beta y - \\alpha)(\\delta x - \\gamma)'}</M>가 되어 둘의 합은 0입니다.
          <span className="ch-qed">∎</span>
        </p>
      </div>
      <p>
        V는 평형점 (20, 10)에서 가장 작고 바깥으로 갈수록 커지는 그릇 모양이므로, V가 일정한 곡선은 평형점을 둘러싼 닫힌 고리입니다. 이 보존량은 수치 해법을 시험하기에도 좋습니다. RK4, 보폭 0.01로 풀면 시간 30 동안 V의 최대 오차는 <M>{'6.59\\times10^{-10}'}</M>이라 궤적이 정확히 같은 고리를 돕니다. 같은 보폭의 오일러 방법은 오차가 0.261까지 쌓여, 궤적이 한 바퀴마다 바깥으로 밀려나는 나선이 됩니다. 보폭을 0.001로 줄여도 오일러의 오차는 0.0212입니다. 계가 진짜로 나선을 그리는지, 계산이 나선을 만들어 낸 것인지는 이런 보존량으로 가려낼 수 있습니다.
      </p>

      <h2>평형점 가까이에서 보면</h2>
      <p>
        비선형계도 평형점에 아주 가까이 다가가면 선형계처럼 보입니다. 평형점 <M>{'\\mathbf{x}^*'}</M>에서 조금 벗어난 <M>{'\\mathbf{u} = \\mathbf{x} - \\mathbf{x}^*'}</M>에 대해, 변화율을 <a href={lessonHref('math-multivariable', 'chain-rule-jacobian')}>야코비 행렬</a> J로 일차 근사하면 <M>{"\\mathbf{u}' \\approx J(\\mathbf{x}^*)\\,\\mathbf{u}"}</M>라는 앞 장의 선형계가 됩니다. 이것을 <T en="linearization">선형화</T>라고 합니다.
      </p>
      <MB>{"J(x, y) = \\begin{pmatrix} \\alpha - \\beta y & -\\beta x \\\\ \\delta y & \\delta x - \\gamma \\end{pmatrix}"}</MB>
      <p>
        원점에서는 <M>{'J(0,0)'}</M>의 고윳값이 α = 1과 −γ = −1.5이므로 안장점입니다. 여우가 없으면 토끼는 불어나고, 토끼가 없으면 여우는 사라집니다. (20, 10)에서는 대각합이 0이고 행렬식이 <M>{'\\alpha\\gamma = 1.5'}</M>라 고윳값이 <M>{'\\pm i\\sqrt{1.5}'}</M>, 곧 중심입니다. 선형화는 한 바퀴 시간을 <M>{'2\\pi/\\sqrt{1.5} \\approx 5.130'}</M>으로 예측합니다.
      </p>
      <LinearizeFigure />
      <p>
        토끼를 1마리만 더 두고 출발하면 실제 한 바퀴는 5.131로 예측과 거의 같고, 궤적도 타원과 겹칩니다. 5마리면 5.159, 10마리면 5.232, 19마리면 5.436으로 평형점에서 멀어질수록 차이가 커지고 고리도 타원에서 찌그러집니다. 선형화는 평형점 가까이에서만 믿을 수 있는 근사입니다.
      </p>
      <Callout kind="warn">
        선형화가 중심을 예측할 때는 조심해야 합니다. 고윳값의 실수부가 0이라는 것은 아주 작은 비선형 항이 궤적을 조금씩 안이나 밖으로 밀 수 있다는 뜻이고, 선형화만으로는 실제 궤적이 닫힌 고리인지 느린 나선인지 정할 수 없습니다. 로트카-볼테라에서는 보존량 V가 있어서 닫힌 고리임을 따로 증명할 수 있었습니다. 반대로 안장점, 마디, 나선처럼 고윳값의 실수부가 0이 아니면 평형점 근처의 모양은 선형화와 같다는 것이 하트만-그로브만 정리입니다.
      </Callout>

      <h2>극한 순환</h2>
      <p>
        로트카-볼테라의 고리는 출발점마다 다른 고리입니다. 진공관 회로를 연구하던 판 데르 폴(Balthasar van der Pol)이 1920년대에 다룬 방정식은 다릅니다. 진폭이 작을 때는 음의 감쇠로 진동이 커지고, 클 때는 양의 감쇠로 작아집니다.
      </p>
      <MB>{"x'' - \\mu(1 - x^2)x' + x = 0"}</MB>
      <LimitCycleFigure />
      <p>
        원점 가까이에서 출발한 궤적은 나선을 그리며 커지고, 바깥에서 출발한 궤적은 줄어들어, 둘 다 같은 닫힌 고리에 감깁니다. 이렇게 주변 궤적을 끌어당기는 고립된 닫힌 궤적을 <T en="limit cycle">극한 순환</T>이라고 합니다. μ = 1에서 고리의 진폭은 2.009, 한 바퀴 시간은 6.663입니다. μ가 0.1로 작으면 거의 원 모양이고 한 바퀴가 6.287로 조화 진동의 2π에 가깝습니다. μ = 4로 키우면 진폭은 여전히 2.023이지만 한 바퀴가 10.204로 늘고, 천천히 쌓였다가 갑자기 뒤집히는 모양이 됩니다. 심장 박동이나 시계 회로처럼 출발 상태와 상관없이 같은 리듬으로 돌아오는 계의 모형입니다.
      </p>

      <h2>혼돈: 로렌츠 계</h2>
      <p>
        평면 위의 연립계에서는 궤적이 서로 엇갈릴 수 없으므로, 오래 지나면 평형점이나 닫힌 고리로 가는 것 말고는 할 수 있는 일이 많지 않습니다(푸앵카레-벤딕손 정리). 3차원에서는 사정이 다릅니다. 1963년 기상학자 로렌츠(Edward Lorenz)는 대류를 극단적으로 단순화한 세 변수의 방정식을 컴퓨터로 풀다가, 중간 결과를 소수 셋째 자리에서 반올림해 다시 넣었더니 얼마 뒤 전혀 다른 날씨가 나온다는 것을 발견했습니다.
      </p>
      <LorenzFigure />
      <p>
        궤적은 두 날개를 오가며 영원히 같은 길을 되풀이하지 않고, 그렇다고 멀리 달아나지도 않습니다. 이런 집합을 <T en="strange attractor">이상한 끌개</T>라고 합니다. 두 궤적은 처음에 <M>{'10^{-8}'}</M>만큼 떨어져 있어 그림에서는 하나로 보이지만, 거리가 꾸준히 커져 시각 20.2쯤 1을 넘고, 그 뒤로는 서로 다른 날개에 있게 됩니다. 아래 그래프에서 로그 거리는 대략 직선으로 올라갑니다. 거리가 <M>{'e^{\\lambda t}'}</M>처럼 지수적으로 커진다는 뜻이고, 이 λ를 가장 큰 <T en="Lyapunov exponent">랴푸노프 지수</T>라고 합니다.
      </p>
      <p>
        이 한 쌍에서 t = 2부터 20까지 맞춘 직선의 기울기는 시간당 0.308자리, 자연로그로 바꾸면 0.710입니다. 거리가 늘어나는 빠르기는 끌개의 어느 곳을 지나느냐에 따라 달라지므로, 한 쌍으로 잰 값은 들쭉날쭉합니다. 이웃한 점을 계속 따라가며 거리가 커질 때마다 다시 <M>{'10^{-8}'}</M>로 당겨 놓는 방법으로 시간 400 동안 평균을 내면 λ ≈ 0.898이 나옵니다. 처음 오차가 열 배씩 커지는 데 평균 <M>{'\\ln 10 / 0.898 \\approx 2.6'}</M>의 시간이 걸리므로, 처음 값을 열 배 더 정확하게 재도 예측할 수 있는 시간은 2.6만큼만 늘어납니다. 날씨를 두 주 넘게 내다보기 어려운 것도 이런 성질 때문이라고 설명합니다.
      </p>

      <h2>이산 세계의 혼돈</h2>
      <p>
        혼돈은 미분방정식이 아니어도 나타납니다. 개체 수를 한 해에 한 번 세는 모형 <M>{'x_{n+1} = r x_n(1 - x_n)'}</M>은 식 하나짜리 점화식이지만, r을 키우면 놀라운 일이 일어납니다.
      </p>
      <LogisticFigure />
      <p>
        r = 2.8에서는 값이 한 점으로 수렴합니다. r = 3.2에서는 두 값을 번갈아 가는 주기 2, 3.5에서는 주기 4, 3.55에서는 8, 3.566에서는 16이 됩니다. 주기가 두 배가 되는 r 사이의 간격은 매번 약 4.669분의 1로 줄어들어(파이겐바움 상수), 3.57 근처에서 주기가 무한대가 되고 그 너머 대부분의 r에서는 값이 어떤 주기로도 반복되지 않습니다. 그런데 혼돈 한가운데의 r = 3.83에는 다시 주기 3인 창이 열립니다. 갈래 그림에서 점이 거의 없이 비어 보이는 좁은 세로 띠가 그런 창입니다.
      </p>

      <Callout kind="key">
        비선형계는 평형점 근처에서 야코비 행렬로 선형화해 그 종류를 판정할 수 있지만, 선형화가 중심을 예측하면 보존량 같은 다른 논증이 필요합니다. 로트카-볼테라 계는 보존량 때문에 닫힌 고리를 돌고, 판 데르 폴 방정식은 주변 궤적을 끌어당기는 극한 순환을 가집니다. 3차원 이상의 계는 혼돈을 보일 수 있습니다. 로렌츠 계에서 아주 가까운 두 출발점의 거리는 시간당 평균 약 0.9의 지수로 벌어지므로, 처음 값의 오차가 장기 예측을 막습니다.
      </Callout>
      <Quiz
        q="어떤 비선형계의 평형점에서 야코비 행렬의 고윳값이 ±1.2i로 나왔다. 이것만으로 확실히 말할 수 있는 것은?"
        options={['평형점 주변 궤적은 모두 닫힌 고리다', '평형점은 안장점이다', '선형화만으로는 닫힌 고리인지 느린 나선인지 정할 수 없다', '이 계는 혼돈을 보인다']}
        answer={2}
        explain={<>고윳값의 실수부가 0이면 선형화는 중심을 예측하지만, 무시한 비선형 항이 궤적을 아주 천천히 안쪽이나 바깥쪽으로 밀 수 있습니다. 로트카-볼테라처럼 보존량이 있으면 닫힌 고리임을 증명할 수 있고, 그렇지 않으면 나선일 수도 있습니다. 평면 위의 계는 혼돈을 보일 수 없고, 안장점은 부호가 반대인 실수 고윳값을 가집니다.</>}
      />
    </>
  );
}
