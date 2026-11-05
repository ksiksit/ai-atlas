import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, Legend, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { drawSlopeField, rk4, type Box } from './odecore';
import './ode.css';
import './firstorder.css';

const nf = (v: number, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');
const grp = (v: number) => Math.round(v).toLocaleString('ko-KR');

/* ─────────────── Figure 1: slope fields and solution curves ─────────────── */

interface Preset {
  id: string;
  label: string;
  tex: string;
  g: (t: number, y: number) => number;
  box: Box;
  starts: [number, number][];
}
const PRESETS: Preset[] = [
  { id: 'linear', label: 'y′ = t − y', tex: "y' = t - y", g: (t, y) => t - y, box: { x0: -1, x1: 6, y0: -3, y1: 6 }, starts: [[0, -2], [0, 0], [0, 2], [0, 4]] },
  { id: 'exp', label: 'y′ = 0.5y', tex: "y' = 0.5\\,y", g: (_t, y) => 0.5 * y, box: { x0: -1, x1: 6, y0: -4, y1: 6 }, starts: [[0, -1], [0, 0.5], [0, 1]] },
  { id: 'logistic', label: 'y′ = y(1 − y/4)', tex: "y' = y\\left(1 - \\tfrac{y}{4}\\right)", g: (_t, y) => y * (1 - y / 4), box: { x0: -1, x1: 6, y0: -1, y1: 6 }, starts: [[0, 0.2], [0, 1], [0, 5.5]] },
  { id: 'riccati', label: 'y′ = y² − t', tex: "y' = y^2 - t", g: (t, y) => y * y - t, box: { x0: -2, x1: 6, y0: -3, y1: 3 }, starts: [[0, -2], [0, 0], [0, 0.5], [0, 1]] },
];
const MAX_CURVES = 8;

/** A solution through (t0, y0), integrated forward and backward with RK4 until it leaves the box. */
function solutionThrough(g: Preset['g'], box: Box, t0: number, y0: number): [number, number][] {
  const f = (t: number, y: number[]) => [g(t, y[0])];
  const span = box.y1 - box.y0;
  const keep = (p: { t: number; y: number[] }) => p.y[0] > box.y0 - span && p.y[0] < box.y1 + span;
  const fwd = rk4(f, t0, [y0], 0.01, Math.ceil((box.x1 - t0) / 0.01)).filter(keep);
  const back = rk4(f, t0, [y0], -0.01, Math.ceil((t0 - box.x0) / 0.01)).filter(keep);
  // stop each side at the first point that left the band, so a blow-up does not wrap around
  const cut = (pts: typeof fwd) => {
    const out: [number, number][] = [];
    for (const p of pts) {
      if (!keep(p)) break;
      out.push([p.t, p.y[0]]);
    }
    return out;
  };
  return [...cut(back).reverse(), ...cut(fwd).slice(1)];
}

function SlopeFieldFigure() {
  const P = usePalette();
  const [id, setId] = useState('linear');
  const pre = PRESETS.find((p) => p.id === id)!;
  const [starts, setStarts] = useState<[number, number][]>(pre.starts);
  const [t0, setT0] = useState(0);
  const [y0, setY0] = useState(1);
  const plotRef = useRef<Plot | null>(null);
  const pick = (v: string) => {
    setId(v);
    setStarts(PRESETS.find((p) => p.id === v)!.starts);
  };
  const add = (t: number, y: number) => setStarts((s) => [...s, [t, y] as [number, number]].slice(-MAX_CURVES));
  const curves = useMemo(() => starts.map(([t, y]) => solutionThrough(pre.g, pre.box, t, y)), [starts, pre]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const { box } = pre;
      const pl = new Plot(ctx, w, h, P, { xMin: box.x0, xMax: box.x1, yMin: box.y0, yMax: box.y1, pad: { l: 32, r: 10, t: 10, b: 24 } });
      plotRef.current = pl;
      pl.grid({ xStep: 1, yStep: 1, xLabel: 't', yLabel: 'y' });
      pl.clip();
      drawSlopeField(ctx, P, pre.g, box, pl, { n: Math.max(12, Math.min(22, Math.round(w / 30))) });
      curves.forEach((c, k) => {
        ctx.strokeStyle = k === curves.length - 1 && starts.length > pre.starts.length ? P.bad : P.accent;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        c.forEach(([t, y], i) => (i ? ctx.lineTo(pl.X(t), pl.Y(y)) : ctx.moveTo(pl.X(t), pl.Y(y))));
        ctx.stroke();
      });
      starts.forEach(([t, y]) => pl.dot(t, y, 4, P.ink, P.surface, 1.5));
      pl.unclip();
    },
    [P, pre, curves, starts],
    { aspect: 1.45, maxHeight: 460 },
  );

  useDrag(wrapRef, {
    hit: () => null,
    onDrag: () => {},
    onEmpty: (x, y) => {
      const pl = plotRef.current;
      if (!pl) return;
      const t = pl.invX(x), yy = pl.invY(y);
      const b = pre.box;
      if (t >= b.x0 && t <= b.x1 && yy >= b.y0 && yy <= b.y1) add(t, yy);
    },
  });

  return (
    <Figure
      no={1}
      title="기울기장 위에 해 곡선 그리기"
      hint="그림을 누르면 그 점을 지나는 해가 그려집니다"
      caption={
        <>
          짧은 선분은 그 점에서 방정식이 말하는 기울기입니다. 해 곡선은 지나는 모든 점에서 그곳의 선분에 접합니다. 곡선은 누른 점에서 앞뒤로 룽게-쿠타 방법(6장)으로 풀어 그렸고, 가장 최근에 더한 곡선은 빨간색입니다. 최대 {MAX_CURVES}개까지 남깁니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={pick} options={PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
        <Button small onClick={() => setStarts([])}>
          곡선 지우기
        </Button>
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${pre.label}의 기울기장과 해 곡선 ${starts.length}개.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <MB>{pre.tex}</MB>
          <div className="de-small">키보드로는 출발점을 고른 뒤 버튼을 누르세요.</div>
          <Slider id="fo-t0" label="출발 t" value={t0} min={pre.box.x0} max={pre.box.x1} step={0.1} onChange={setT0} format={(v) => nf(v, 1)} />
          <Slider id="fo-y0" label="출발 y" value={y0} min={pre.box.y0} max={pre.box.y1} step={0.1} onChange={setY0} format={(v) => nf(v, 1)} />
          <Button small primary onClick={() => add(t0, y0)}>
            이 점에서 출발
          </Button>
          <Readout label="그린 해 곡선" value={`${starts.length}개`} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: decay and cooling ─────────────── */

const HALF_LIFE = 5730; // carbon-14, years (approximate)
const K14 = Math.LN2 / HALF_LIFE;
const T_ROOM = 20, T_START = 90, T_TARGET = 60;

function DecayFigure() {
  const P = usePalette();
  const [mode, setMode] = useState<'carbon' | 'coffee'>('carbon');
  const [frac, setFrac] = useState(25);
  const [k, setK] = useState(0.05);
  const age = Math.log(100 / frac) / K14;
  const tCool = Math.log((T_START - T_ROOM) / (T_TARGET - T_ROOM)) / k;
  const at10 = T_ROOM + (T_START - T_ROOM) * Math.exp(-k * 10);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      if (mode === 'carbon') {
        const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: 30000, yMin: 0, yMax: 105, pad: { l: 40, r: 14, t: 12, b: 28 } });
        pl.grid({ xStep: 5730, yStep: 25, fmt: (v) => (v > 105 ? grp(v) : String(Math.round(v))), xLabel: '년', yLabel: '%' });
        // half-life staircase
        for (let n = 1; n <= 5; n++) pl.line(n * HALF_LIFE, 0, n * HALF_LIFE, 100 / 2 ** n, alpha(P.ink3, 0.5), 1, [3, 3]);
        pl.fn((t) => 100 * Math.exp(-K14 * t), P.accent, 2.6);
        pl.line(0, frac, age, frac, P.bad, 1.5, [5, 4]);
        pl.line(age, 0, age, frac, P.bad, 1.5, [5, 4]);
        pl.dot(age, frac, 5.5, P.bad, P.surface);
      } else {
        const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: 60, yMin: 0, yMax: 100, pad: { l: 36, r: 14, t: 12, b: 28 } });
        pl.grid({ xStep: 10, yStep: 20, xLabel: '분', yLabel: '°C' });
        pl.line(0, T_ROOM, 60, T_ROOM, alpha(P.ink3, 0.7), 1.2, [4, 4]);
        pl.text('방 온도 20°C', 59, T_ROOM + 4, P.ink3, { align: 'right' });
        pl.fn((t) => T_ROOM + (T_START - T_ROOM) * Math.exp(-k * t), P.accent, 2.6);
        if (tCool <= 60) {
          pl.line(0, T_TARGET, tCool, T_TARGET, P.bad, 1.5, [5, 4]);
          pl.line(tCool, 0, tCool, T_TARGET, P.bad, 1.5, [5, 4]);
          pl.dot(tCool, T_TARGET, 5.5, P.bad, P.surface);
        }
      }
    },
    [P, mode, frac, age, k, tCool],
    { aspect: 1.7, maxHeight: 340 },
  );

  return (
    <Figure
      no={2}
      title="지수적 감쇠: 탄소 연대 측정과 식어 가는 커피"
      hint="남은 비율이나 식는 속도를 바꿔 보세요"
      caption={
        mode === 'carbon' ? (
          <>탄소-14의 반감기는 약 5,730년으로 잡았습니다. 점선 계단은 반감기마다 양이 절반이 되는 지점입니다. 빨간 점이 지금 남은 비율과 그만큼 줄어드는 데 걸린 시간입니다.</>
        ) : (
          <>90°C 커피가 20°C 방에서 식는 모습입니다. 빨간 점은 마시기 좋은 60°C에 닿는 시각입니다. k가 크면 컵이 얇거나 바람이 부는 경우입니다.</>
        )
      }
    >
      <div className="controls row">
        <Seg value={mode} onChange={setMode} options={[{ value: 'carbon', label: '탄소-14 붕괴' }, { value: 'coffee', label: '뉴턴의 냉각' }]} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={mode === 'carbon' ? `탄소-14가 처음의 ${frac}% 남으려면 약 ${grp(age)}년이 걸립니다.` : `k = ${k}일 때 커피가 60도에 닿는 시각은 ${nf(tCool, 1)}분입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          {mode === 'carbon' ? (
            <>
              <MB>{'N(t) = N_0\\,e^{-kt},\\quad k = \\frac{\\ln 2}{5730}'}</MB>
              <Slider id="fo-frac" label="남은 비율" value={frac} min={1} max={99} step={1} onChange={setFrac} format={(v) => `${v}%`} />
              <Readout label="지난 시간" value={`약 ${grp(age)}년`} color="var(--bad)" />
              <Readout label="반감기로 세면" value={`${nf(age / HALF_LIFE, 2)}번`} />
            </>
          ) : (
            <>
              <MB>{"T' = -k\\,(T - 20)"}</MB>
              <Slider id="fo-k" label="식는 속도 k (1/분)" value={k} min={0.01} max={0.2} step={0.01} onChange={setK} format={(v) => v.toFixed(2)} />
              <Readout label="60°C가 되는 시각" value={tCool <= 60 ? `${nf(tCool, 1)}분` : '60분 넘게'} color="var(--bad)" />
              <Readout label="10분 뒤 온도" value={`${nf(at10, 1)}°C`} />
            </>
          )}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the integrating factor, step by step ─────────────── */

const IF_STEPS: { tex: string; note: string }[] = [
  { tex: "y' + y = t", note: '표준형 y′ + p(t)y = q(t)으로 씁니다. 여기서 p(t) = 1, q(t) = t입니다.' },
  { tex: '\\mu(t) = e^{\\int p\\,dt} = e^{t}', note: '적분 인자 μ를 구합니다. 상수 C는 붙이지 않아도 됩니다.' },
  { tex: "e^{t}y' + e^{t}y = t\\,e^{t}", note: '양변에 μ를 곱합니다.' },
  { tex: '\\left(e^{t}y\\right)\' = t\\,e^{t}', note: '왼쪽이 정확히 곱 eᵗ·y의 미분입니다. μ는 이렇게 되도록 고른 것입니다.' },
  { tex: 'e^{t}y = (t - 1)\\,e^{t} + C', note: '양변을 적분합니다. 오른쪽은 부분적분입니다.' },
  { tex: 'y = t - 1 + C\\,e^{-t}', note: 'eᵗ로 나누면 일반해입니다. C는 처음 값에서 정해집니다.' },
];

function IntegratingFactorFigure() {
  const P = usePalette();
  const s = useStepper(IF_STEPS.length, 1, null, true);
  const [C, setC] = useState(3);
  const y0 = -1 + C;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: 6, yMin: -3, yMax: 6, pad: { l: 30, r: 10, t: 10, b: 24 } });
      pl.grid({ xStep: 1, yStep: 1, xLabel: 't', yLabel: 'y' });
      pl.clip();
      for (let c = -4; c <= 6; c++) if (c !== C) pl.fn((t) => t - 1 + c * Math.exp(-t), alpha(P.ink3, 0.45), 1.2);
      pl.fn((t) => t - 1, P.good, 1.8, { dash: [6, 4] });
      pl.fn((t) => t - 1 + C * Math.exp(-t), P.accent, 2.8);
      pl.dot(0, y0, 5, P.accent, P.surface);
      pl.unclip();
    },
    [P, C, y0],
    { aspect: 1.25, maxHeight: 340 },
  );

  return (
    <Figure
      no={3}
      title="적분 인자로 y′ + y = t 풀기"
      hint="한 줄씩 넘기고, 오른쪽에서 C를 바꿔 보세요"
      caption={
        <>
          회색 곡선은 C가 −4부터 6까지인 해들이고, 파란 곡선이 고른 C입니다. 어느 해든 e<sup>−t</sup> 항이 빠르게 사라져 초록 점선 y = t − 1에 붙습니다. 그림 1에서 y′ = t − y를 골랐을 때 본 것과 같은 방정식입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="de-col">
          <ol className="fo-steps">
            {IF_STEPS.map((st, k) => (
              <li key={k} data-s={k < s.i ? 'done' : k === s.i ? 'now' : 'later'}>
                <MB>{st.tex}</MB>
                {k === s.i && <span className="de-small">{st.note}</span>}
              </li>
            ))}
          </ol>
          <StepControls s={s} id="fo-if-speed" maxSpeed={3} />
        </div>
        <div className="de-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`해 y = t − 1 + ${C}e^(−t)의 그래프. t = 0에서 y = ${nf(y0, 1)}이고 직선 y = t − 1에 다가갑니다.`}>
            <canvas ref={canvasRef} />
          </div>
          <Slider id="fo-c" label="C" value={C} min={-4} max={6} step={1} onChange={setC} />
          <Readout label="처음 값 y(0) = C − 1" value={nf(y0, 0)} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: logistic growth with harvesting ─────────────── */

const R = 1, K = 4;
const harvestG = (y: number, H: number) => R * y * (1 - y / K) - H;
/** Equilibria of y′ = ry(1 − y/K) − H, smallest first (empty when H > rK/4). */
function equilibria(H: number): number[] {
  const d = (K * K) / 4 - (K * H) / R;
  if (d < -1e-12) return [];
  if (Math.abs(d) < 1e-12) return [K / 2];
  return [K / 2 - Math.sqrt(d), K / 2 + Math.sqrt(d)];
}

function HarvestFigure() {
  const P = usePalette();
  const [H, setH] = useState(0.5);
  const [y0, setY0] = useState(1);
  const eq = equilibria(H);
  const path = useMemo(() => {
    const p = rk4((_t, y) => [harvestG(y[0], H)], 0, [y0], 0.01, 2000);
    const out: [number, number][] = [];
    for (const q of p) {
      out.push([q.t, Math.max(0, q.y[0])]);
      if (q.y[0] <= 0) break;
    }
    return out;
  }, [H, y0]);
  const last = path[path.length - 1];
  const died = last[1] <= 0;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const half = w > 560;
      const lw = half ? w * 0.42 : w;
      const lh = half ? h : h * 0.45;
      // phase line: y′ against y
      const pl = new Plot(ctx, lw, lh, P, { xMin: 0, xMax: 5, yMin: -1.6, yMax: 1.4, pad: { l: 34, r: 10, t: 12, b: 26 } });
      pl.grid({ xStep: 1, yStep: 0.5, xLabel: 'y', yLabel: "y′" });
      pl.fn((y) => harvestG(y, H), P.accent, 2.4);
      // arrows on the axis show which way y moves
      for (let y = 0.25; y < 5; y += 0.5) {
        const v = harvestG(y, H);
        if (Math.abs(v) < 0.02) continue;
        pl.arrow(y - 0.14 * Math.sign(v), 0, y + 0.14 * Math.sign(v), 0, v > 0 ? P.good : P.bad, 2, 6);
      }
      eq.forEach((e, i) => {
        const stable = eq.length === 2 ? i === 1 : false;
        pl.dot(e, 0, 6, stable ? P.ink : P.surface, P.ink, 2);
      });
      pl.dot(y0, harvestG(y0, H), 4.5, P.bad, P.surface);
      // time series
      ctx.save();
      ctx.translate(half ? lw : 0, half ? 0 : lh);
      const tl = new Plot(ctx, half ? w - lw : w, half ? h : h - lh, P, { xMin: 0, xMax: 20, yMin: 0, yMax: 5, pad: { l: 34, r: 12, t: 12, b: 26 } });
      tl.grid({ xStep: 5, yStep: 1, xLabel: 't', yLabel: 'y' });
      eq.forEach((e) => tl.line(0, e, 20, e, alpha(P.ink3, 0.8), 1.2, [5, 4]));
      ctx.strokeStyle = P.bad;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      path.forEach(([t, y], i) => (i ? ctx.lineTo(tl.X(t), tl.Y(y)) : ctx.moveTo(tl.X(t), tl.Y(y))));
      ctx.stroke();
      if (died) tl.dot(last[0], 0, 5, P.bad, P.surface);
      ctx.restore();
    },
    [P, H, y0, eq, path, died, last],
    { aspect: 1.9, maxHeight: 360, minHeight: 300 },
  );

  const fate = died ? `t ≈ ${nf(last[0], 2)}에 0 (멸종)` : `${nf(last[1], 3)}에 다가감`;
  return (
    <Figure
      no={4}
      title="물고기를 얼마나 잡아도 될까: 로지스틱 성장과 수확"
      hint="수확량 H를 1 가까이 올려 보세요"
      caption={
        <>
          첫 그래프는 위상선입니다. 곡선이 y′이고, 가로축 위 화살표는 y가 늘어나는지(초록) 줄어드는지(빨강)를 보여 줍니다. 속이 찬 점은 안정한 평형점, 빈 점은 불안정한 평형점입니다. 둘째 그래프는 처음 값 y₀에서 출발한 개체 수입니다. r = 1, 수용력 K = 4로 두었습니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="fo-h" label="수확량 H" value={H} min={0} max={1.3} step={0.05} onChange={setH} format={(v) => v.toFixed(2)} />
        <Slider id="fo-y0h" label="처음 개체 수 y₀" value={y0} min={0.1} max={5} step={0.1} onChange={setY0} format={(v) => v.toFixed(1)} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`수확량 H = ${H.toFixed(2)}. 평형점 ${eq.length ? eq.map((e) => nf(e, 3)).join(', ') : '없음'}. y₀ = ${y0.toFixed(1)}에서 출발한 개체 수는 ${fate}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Readout label="평형점" value={eq.length ? eq.map((e) => nf(e, 3)).join(', ') : '없음'} />
        <Readout label="한계 수확량 rK/4" value="1.00" />
        <Readout label="결과" value={fate} color={died ? 'var(--bad)' : 'var(--good)'} />
      </div>
      <Legend
        items={[
          { color: 'var(--accent)', label: "y′ = y(1 − y/4) − H", shape: 'ln' },
          { color: 'var(--bad)', label: '개체 수 y(t)', shape: 'ln' },
          { color: 'var(--ink-3)', label: '평형점', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function FirstOrder() {
  return (
    <>
      <h2>변화의 규칙에서 미래로</h2>
      <p>
        미적분학에서는 함수가 주어지면 그 변화율을 계산했습니다. 미분방정식은 거꾸로 갑니다. 변화율이 무엇에 따라 정해지는지 규칙만 알 때, 그 규칙을 만족하는 함수를 찾는 것입니다. "인구가 늘어나는 속도는 지금 인구에 비례한다", "커피가 식는 속도는 방과의 온도 차이에 비례한다" 같은 문장이 모두 미분방정식입니다. 미지수가 함수 y(t)이고, 식에 y의 도함수가 들어 있습니다. 도함수가 한 번만 미분한 y′까지만 나오면 <T en="first-order">1계</T> 미분방정식이라고 합니다.
      </p>
      <MB>{"y'(t) = g\\bigl(t,\\ y(t)\\bigr)"}</MB>
      <p>
        이 식은 평면의 모든 점 (t, y)에서 해가 가져야 할 기울기를 정해 줍니다. 그 기울기를 점마다 짧은 선분으로 그린 것이 <T en="slope field">기울기장</T>이고, 해 곡선은 선분들을 따라 흐르는 물줄기처럼 그려집니다. 그림 1에서 아무 곳이나 눌러 보세요.
      </p>
      <SlopeFieldFigure />
      <p>
        y′ = t − y에서는 어디서 출발하든 해들이 한 직선 y = t − 1로 모입니다. y′ = 0.5y에서는 0보다 위에서 출발한 해는 점점 빠르게 커지고 아래는 점점 빠르게 작아지며, y = 0에서 출발하면 영원히 0입니다. y′ = y² − t에서는 t = 0에서 −2, 0, 0.5로 출발한 해들이 모두 y ≈ −√t 근처의 곡선 하나로 모이지만, 1에서 출발한 해는 t ≈ 1.09에 무한대로 치솟아 그림 밖으로 사라집니다. 식은 멀쩡한데 해가 유한한 시간 안에 터지는 것입니다. 같은 1계 방정식이라도 해의 운명이 이렇게 다릅니다. 처음 값 y(t₀) = y₀을 하나 정하면 해 곡선이 하나 정해지는데, 이렇게 처음 값과 함께 주어진 문제를 <T en="initial value problem">초깃값 문제</T>라고 합니다.
      </p>

      <h2>변수 분리: 지수적 성장과 감쇠</h2>
      <p>
        가장 단순하고 가장 자주 나오는 방정식은 y′ = ky입니다. 이런 식은 y가 있는 것을 한쪽으로, t가 있는 것을 다른 쪽으로 모으는 <T en="separation of variables">변수 분리</T>로 풉니다.
      </p>
      <MB>{"\\frac{dy}{y} = k\\,dt \\;\\Longrightarrow\\; \\ln|y| = kt + C \\;\\Longrightarrow\\; y(t) = y_0\\,e^{kt}"}</MB>
      <p>
        k가 양수면 지수적으로 자라고, 음수면 지수적으로 줄어듭니다. 방사성 원소는 매 순간 남은 원자 중 일정한 비율이 붕괴하므로 N′ = −kN을 따르고, 양이 절반이 되는 시간인 반감기는 ln 2 / k로 언제나 같습니다. 살아 있는 생물은 대기와 같은 비율의 탄소-14를 갖다가 죽으면 더 받아들이지 않으므로, 남은 비율을 재면 죽은 지 얼마나 됐는지 알 수 있습니다. 그림 2의 기본값처럼 25%가 남았다면 반감기 두 번, 약 11,460년이 지난 것입니다.
      </p>
      <p>
        뉴턴의 냉각 법칙 T′ = −k(T − T<sub>방</sub>)도 변수만 바꾸면 같은 방정식입니다. 온도 차이 T − 20이 지수적으로 줄어듭니다. 그림 2를 커피로 바꾸면 k = 0.05일 때 90°C 커피가 약 11.2분 뒤에 60°C가 됩니다.
      </p>
      <DecayFigure />
      <p>
        변수 분리는 결국 양변을 적분하는 일이라, 적분할 수 있는 만큼만 풀 수 있습니다. 적분하는 기법은 <a href={lessonHref('math-calculus', 'integration-techniques')}>적분의 기법과 응용</a>에서 다뤘습니다.
      </p>

      <h2>선형 1계 방정식과 적분 인자</h2>
      <p>
        y′ + y = t는 변수가 분리되지 않습니다. 하지만 y와 y′가 1차로만 들어 있는 <T en="linear">선형</T> 방정식이라, 양변에 잘 고른 함수를 곱하면 왼쪽이 곱의 미분이 되도록 만들 수 있습니다. 그 함수를 <T en="integrating factor">적분 인자</T>라고 합니다.
      </p>
      <IntegratingFactorFigure />
      <p>
        일반해 y = t − 1 + Ce<sup>−t</sup>는 두 부분으로 나뉩니다. t − 1은 입력 t를 따라가는 부분이고, Ce<sup>−t</sup>는 처음 값에 따라 달라졌다가 사라지는 부분입니다. 공학에서는 앞의 것을 <T en="steady state">정상 상태</T>, 뒤의 것을 <T en="transient">과도 응답</T>이라고 부릅니다. 다음 장의 진동에서도 같은 구조가 다시 나옵니다.
      </p>

      <h2>평형점과 위상선: 수확하면 무슨 일이 생기나</h2>
      <p>
        y′ = ky는 인구가 한없이 늘어난다고 말하지만, 실제로는 먹이와 공간이 모자라 성장이 느려집니다. <T en="logistic equation">로지스틱 방정식</T> y′ = ry(1 − y/K)는 인구가 수용력 K에 가까워질수록 성장률이 0에 가까워지도록 고친 것입니다. 해는 S자 곡선을 그리며 K에 다가갑니다(그림 1의 세 번째 방정식).
      </p>
      <p>
        이런 식은 풀지 않고도 많은 것을 알 수 있습니다. t가 식에 직접 나오지 않으므로, y′을 y의 함수로 그리면 됩니다. y′ = 0인 곳이 <T en="equilibrium">평형점</T>이고, y′ &gt; 0인 구간에서는 y가 커지고 y′ &lt; 0인 구간에서는 작아집니다. 이렇게 그린 것이 <T en="phase line">위상선</T>입니다. 이제 해마다 일정한 양 H만큼 물고기를 잡는다고 해 봅시다.
      </p>
      <HarvestFigure />
      <p>
        H = 0.5이면 평형점이 0.586과 3.414 두 개입니다. 위쪽은 양옆의 화살표가 모두 자기를 향하는 <T en="stable">안정</T> 평형점이라 y₀ = 1에서 출발한 개체 수가 3.414에 자리 잡습니다. 아래쪽은 화살표가 멀어지는 <T en="unstable">불안정</T> 평형점입니다. y₀을 0.4로 내리면 개체 수가 이 문턱 아래에서 출발해 t ≈ 1.45에 0이 됩니다. H를 올리면 두 평형점이 서로 다가가다 H = rK/4 = 1에서 하나로 합쳐지고, 그보다 크면 평형점이 사라져 어디서 출발하든 멸종합니다. H = 1.2, y₀ = 3이면 t ≈ 8.91에 0이 됩니다. 매개변수가 조금 바뀌었을 뿐인데 해의 운명이 갑자기 바뀌는 이런 현상을 <T en="bifurcation">분기</T>라고 합니다. 어업 정책에서 최대 지속 가능 어획량을 계산하는 생각이 여기서 나옵니다.
      </p>
      <Callout kind="warn" label="해가 하나뿐이라는 보장">
        <p style={{ margin: 0 }}>
          기울기장에서 해 곡선이 서로 만나지 않는 것은 g와 ∂g/∂y가 연속이면 초깃값 문제의 해가 딱 하나 있다는 <T en="existence and uniqueness theorem">존재와 유일성 정리</T> 덕분입니다. 조건이 깨지면 해가 여럿일 수 있습니다. y′ = √y, y(0) = 0에는 y = 0과 y = t²/4라는 두 해가 있습니다. √y의 y에 대한 미분이 y = 0에서 무한대이기 때문입니다.
        </p>
      </Callout>

      <Callout kind="key">
        1계 미분방정식 y′ = g(t, y)는 평면의 모든 점에 기울기를 정해 주고, 해는 그 기울기를 따라가는 곡선입니다. y′ = ky는 변수 분리로 풀려 지수적 성장과 감쇠를 주고, 선형 방정식은 적분 인자를 곱해 왼쪽을 곱의 미분으로 만들어 풉니다. 풀지 않고도 평형점과 그 안정성을 위상선으로 읽을 수 있고, 매개변수가 바뀌면 평형점이 합쳐지고 사라지는 분기가 생깁니다.
      </Callout>
      <Quiz
        q="y′ = y(1 − y/4) − H로 물고기 수를 모델링한다. 지금 H = 0.9로 잡아도 개체 수가 2.63 근처에서 유지된다. H를 1.1로 올리면 어떻게 되나?"
        options={['개체 수가 조금 줄어든 새 평형점(약 2.4)에서 유지된다', '평형점이 사라져 처음 값과 상관없이 결국 멸종한다', '개체 수가 진동하다가 원래 값으로 돌아온다', '수확량이 늘었으니 개체 수가 더 빨리 수용력 4에 다가간다']}
        answer={1}
        explain={<>평형점은 y(1 − y/4) = H의 근인데, 왼쪽의 최댓값이 y = 2에서 1입니다. H가 1보다 크면 근이 없어 y′가 언제나 음수이므로 y는 계속 줄어 0에 닿습니다. H = 0.9일 때의 두 평형점 1.368과 2.632는 H = 1에서 2로 합쳐졌다가 사라집니다.</>}
      />
    </>
  );
}
