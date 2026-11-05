import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { PAIRS, convolve, exampleExact, hDefault, inputFn, laplaceNumeric, secondOrderRK4, stepResponse, stepStats, type InputKind, type Poles } from './laplace';
import './ode.css';
import './laplace.css';

const nf = (v: number, d = 3) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');

/* ─────────────── Figure 1: the transform as an area ─────────────── */

function DefinitionFigure() {
  const P = usePalette();
  const [id, setId] = useState('sin');
  const [s, setS] = useState(1);
  const pair = PAIRS.find((p) => p.id === id)!;
  const num = useMemo(() => laplaceNumeric(pair.f, s), [pair, s]);
  const exact = pair.F(s);
  const T = 8;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const topH = Math.round(h * 0.64);
      // y range from f on [0, T], so every pair stays in view
      let lo = 0, hi = 1;
      for (let i = 0; i <= 200; i++) {
        const v = pair.f((T * i) / 200);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      hi = Math.min(hi, 4);
      const pl = new Plot(ctx, w, topH, P, { xMin: 0, xMax: T, yMin: lo - 0.15, yMax: hi + 0.15, pad: { l: 34, r: 12, t: 12, b: 22 } });
      pl.grid({ xStep: 1, xLabel: 't' });
      pl.clip();
      const g = (t: number) => Math.exp(-s * t) * pair.f(t);
      pl.fillUnder(g, alpha(P.accent, 0.28), 0, T, 0);
      pl.fn(pair.f, alpha(P.ink3, 0.9), 1.5);
      pl.fn((t) => Math.exp(-s * t), P.ink3, 1.5, { dash: [5, 4] });
      pl.fn(g, P.accent, 2.5);
      pl.unclip();

      // F(s) as a function of s, with the current s marked
      ctx.save();
      ctx.translate(0, topH);
      const bh = h - topH;
      const sMin = Math.max(0.1, pair.abscissa + 0.1), sMax = 4;
      let fmax = 0;
      for (let i = 0; i <= 100; i++) fmax = Math.max(fmax, Math.abs(pair.F(sMin + ((sMax - sMin) * i) / 100)));
      fmax = Math.min(fmax, 3);
      const pb = new Plot(ctx, w, bh, P, { xMin: 0, xMax: sMax, yMin: Math.min(0, -0.1 * fmax), yMax: fmax * 1.1, pad: { l: 34, r: 12, t: 10, b: 22 } });
      pb.grid({ xStep: 1, xLabel: 's' });
      pb.clip();
      pb.fn(pair.F, P.ink, 2, { from: sMin, to: sMax });
      pb.unclip();
      pb.line(s, 0, s, Math.min(exact, fmax * 1.1), alpha(P.accent, 0.6), 1.5, [3, 3]);
      pb.dot(s, Math.min(exact, fmax * 1.1), 5, P.accent, P.surface, 2);
      pb.text('F(s)', sMax, fmax * 1.1, P.ink2, { align: 'right', dx: -4, dy: 8, font: `600 11px ${P.fontMono}`, bg: P.surface });
      ctx.restore();
    },
    [P, pair, s, exact],
    { height: 360, minHeight: 40 },
  );

  return (
    <Figure
      no={1}
      title="라플라스 변환은 넓이 하나입니다"
      hint="함수와 s를 바꿔 보세요"
      caption={
        <>
          위: 연한 선이 <M>{'f(t)'}</M>, 점선이 <M>{'e^{-st}'}</M>, 진한 파란 선이 둘의 곱입니다. 칠한 부분의 넓이(아래로 내려간 부분은 빼서)가 <M>{'F(s)'}</M>입니다. 넓이는 심프슨 공식으로 직접 계산했고, 표의 공식과 비교합니다. 아래: 같은 넓이를 s마다 계산해 이은 곡선 <M>{'F(s)'}</M>와 지금의 s.
        </>
      }
    >
      <div className="fig-split">
        <div className="de-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`f(t) = ${pair.ft}에 e^(−${s.toFixed(1)}t)를 곱한 곡선과 그 아래 넓이. 수치 적분 ${nf(num, 4)}, 표의 값 ${nf(exact, 4)}.`}>
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <div className="ctl">
            <span className="ctl-label">
              <span>함수 f(t)</span>
            </span>
            <div className="lp-pairs" role="group" aria-label="함수 고르기">
              {PAIRS.map((p) => (
                <button key={p.id} type="button" className="lp-pair" aria-pressed={p.id === id} onClick={() => setId(p.id)}>
                  <M>{p.ft}</M>
                </button>
              ))}
            </div>
          </div>
          <Slider id="lp-s" label="s" value={s} min={0.2} max={4} step={0.1} onChange={setS} format={(v) => v.toFixed(1)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="넓이 (수치 적분)" value={nf(num, 4)} color="var(--accent)" />
            <Readout label="표의 F(s)" value={nf(exact, 4)} />
          </div>
          <div className="lp-formula">
            <MB>{`\\mathcal{L}\\{${pair.ft}\\} = ${pair.Fs}`}</MB>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: solving y″ + 3y′ + 2y = 1 step by step ─────────────── */

const STEPS: { title: string; tex: string; note: string }[] = [
  {
    title: '문제',
    tex: "\\begin{gathered} y'' + 3y' + 2y = 1 \\\\ y(0) = 1,\\; y'(0) = 0 \\end{gathered}",
    note: '처음 위치 1에서 정지해 있던 추가, 크기 1인 힘을 계속 받습니다. 감쇠가 커서 진동하지 않는 계입니다.',
  },
  {
    title: '양변을 변환',
    tex: "\\begin{gathered} \\bigl(s^2 Y - s\\cdot 1 - 0\\bigr) + 3\\bigl(sY - 1\\bigr) \\\\ {} + 2Y = \\frac{1}{s} \\end{gathered}",
    note: '미분 규칙 L{y′} = sY − y(0), L{y″} = s²Y − s y(0) − y′(0)를 씁니다. 처음 조건이 이 단계에서 식 안으로 들어옵니다.',
  },
  {
    title: 'Y에 대해 풀기',
    tex: 'Y(s) = \\frac{1/s + s + 3}{s^2 + 3s + 2} = \\frac{s^2 + 3s + 1}{s\\,(s+1)(s+2)}',
    note: '미분방정식이 Y에 대한 일차방정식이 되었습니다. 분모의 s² + 3s + 2 = (s + 1)(s + 2)는 2계 방정식의 특성다항식 그대로입니다.',
  },
  {
    title: '부분분수로 쪼개기',
    tex: 'Y(s) = \\frac{1/2}{s} + \\frac{1}{s+1} - \\frac{1/2}{s+2}',
    note: '각 계수는 그 인수를 가리고 나머지에 근을 넣으면 나옵니다. s = 0을 넣으면 1/((1)(2)) = 1/2, s = −1이면 (1 − 3 + 1)/((−1)(1)) = 1, s = −2이면 (4 − 6 + 1)/((−2)(−1)) = −1/2입니다.',
  },
  {
    title: '표를 거꾸로 읽기',
    tex: 'y(t) = \\tfrac12 + e^{-t} - \\tfrac12 e^{-2t}',
    note: '1/s는 1로, 1/(s + a)는 e^(−at)로 돌아갑니다. t = 0에서 1/2 + 1 − 1/2 = 1, 기울기는 −1 + 1 = 0으로 처음 조건이 맞고, 시간이 지나면 1/2에 머뭅니다.',
  },
];

function PartialFractionsFigure() {
  const P = usePalette();
  const st = useStepper(STEPS.length, 0.6, 'pf', false);
  const k = st.i;
  const num = useMemo(() => secondOrderRK4(3, 2, () => 1, 1, 0, 6, 600), []);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: 6, yMin: -0.6, yMax: 1.2, pad: { l: 34, r: 12, t: 12, b: 24 } });
      pl.grid({ xStep: 1, yStep: 0.5, xLabel: 't' });
      pl.line(0, 0.5, 6, 0.5, alpha(P.ink3, 0.6), 1, [4, 4]);
      // the numerical solution, always drawn
      ctx.save();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      num.t.forEach((t, i) => (i ? ctx.lineTo(pl.X(t), pl.Y(num.y[i])) : ctx.moveTo(pl.X(t), pl.Y(num.y[i]))));
      ctx.stroke();
      ctx.restore();
      if (k >= 4) {
        // the three pieces from the partial fractions, and their sum
        pl.fn(() => 0.5, alpha(P.neg, 0.9), 1.5, { dash: [2, 3] });
        pl.fn((t) => Math.exp(-t), alpha(P.pos, 0.9), 1.5, { dash: [6, 4] });
        pl.fn((t) => -0.5 * Math.exp(-2 * t), alpha(P.good, 0.9), 1.5, { dash: [6, 4] });
        pl.fn(exampleExact, P.accent, 2.5);
      }
      pl.text(k >= 4 ? '두꺼운 회색: RK4 수치해 · 파란 선: 부분분수로 얻은 식' : '두꺼운 회색: RK4로 직접 푼 수치해', 0.15, 1.12, P.ink3, { font: `500 11px ${P.fontBody}`, bg: P.surface });
    },
    [P, k, num],
    { height: 250, minHeight: 40 },
  );

  return (
    <Figure
      no={2}
      title="미분방정식을 분수식으로 풀기"
      hint="▶ 재생 또는 한 단계씩"
      caption={
        <>
          다섯 단계로 <M>{"y'' + 3y' + 2y = 1"}</M>을 풉니다. 그래프의 두꺼운 회색 선은 같은 방정식을 RK4로 직접 적분한 결과이고, 마지막 단계에서 겹쳐지는 파란 선이 변환으로 얻은 식입니다. 0부터 6까지 두 곡선의 차이는 가장 큰 곳에서도 2.2×10⁻¹⁰입니다. 점선 세 개는 부분분수의 세 조각입니다.
        </>
      }
    >
      <ol className="lp-steps" aria-label="풀이 단계">
        {STEPS.map((sp, i) => (
          <li key={sp.title} data-s={i < k ? 'done' : i === k ? 'now' : 'later'}>
            <div className="lp-step-head">
              <span className="mono">{i + 1}</span> {sp.title}
            </div>
            {i <= k && (
              <>
                <MB>{sp.tex}</MB>
                {i === k && <p className="de-small">{sp.note}</p>}
              </>
            )}
          </li>
        ))}
      </ol>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`해 y(t)의 그래프. ${k >= 4 ? '부분분수로 얻은 식 1/2 + e^(−t) − e^(−2t)/2가 수치해와 겹칩니다.' : '아직 식을 얻기 전이라 수치해만 보입니다.'}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <StepControls s={st} id="lp-pf-speed" maxSpeed={3} />
          {k >= 4 && (
            <Legend
              items={[
                { color: 'var(--neg)', label: '1/2', shape: 'ln' },
                { color: 'var(--pos)', label: 'e^(−t)', shape: 'ln' },
                { color: 'var(--good)', label: '−e^(−2t)/2', shape: 'ln' },
              ]}
            />
          )}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: drag the poles, watch the step response ─────────────── */

const POLE_PRESETS: { label: string; p: Poles }[] = [
  { label: '출렁이며 가라앉음', p: { sigma: -0.5, omega: 2 } },
  { label: '거의 진동 없음', p: { sigma: -2, omega: 0.5 } },
  { label: '실수 극점', p: { sigma: -1, omega: 0 } },
  { label: '오른쪽 반평면', p: { sigma: 0.2, omega: 2 } },
];
const SIG_MIN = -3, SIG_MAX = 1, OM_MAX = 4;

function PolesFigure() {
  const P = usePalette();
  const [p, setP] = useState<Poles>(POLE_PRESETS[0].p);
  const [impulse, setImpulse] = useState(false);
  const T = 12;
  const resp = useMemo(() => stepResponse(p, T, 1200), [p]);
  const stats = useMemo(() => stepStats(p), [p]);
  const geo = useRef<{ X: (v: number) => number; Y: (v: number) => number; inv: (x: number, y: number) => [number, number]; split: number } | null>(null);

  const clampP = (sigma: number, omega: number): Poles => {
    let sg = Math.max(SIG_MIN, Math.min(SIG_MAX, sigma));
    const om = Math.max(0, Math.min(OM_MAX, omega));
    // keep the pole pair away from s = 0, where the gain formula breaks down
    if (Math.hypot(sg, om) < 0.2) sg = sg < 0 ? -0.2 : 0.2;
    return { sigma: Math.round(sg * 20) / 20, omega: Math.round(om * 20) / 20 };
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const narrow = w < 560;
      const planeW = narrow ? w : Math.round(w * 0.4);
      const planeH = narrow ? Math.round(h * 0.45) : h;
      // s-plane
      const sp = new Plot(ctx, planeW, planeH, P, { xMin: SIG_MIN - 0.2, xMax: SIG_MAX + 0.2, yMin: -OM_MAX - 0.2, yMax: OM_MAX + 0.2, pad: { l: 30, r: 10, t: 12, b: 24 }, equal: !narrow });
      ctx.fillStyle = alpha(P.good, 0.07);
      ctx.fillRect(sp.pad.l, sp.pad.t, sp.X(0) - sp.pad.l, sp.ph);
      ctx.fillStyle = alpha(P.bad, 0.07);
      ctx.fillRect(sp.X(0), sp.pad.t, sp.pad.l + sp.pw - sp.X(0), sp.ph);
      sp.grid({ xStep: 1, yStep: 1, xLabel: 'Re s', yLabel: 'Im s' });
      sp.text('안정', SIG_MIN - 0.05, -OM_MAX + 0.1, P.good, { font: `600 11px ${P.fontBody}`, base: 'bottom' });
      for (const sgn of [1, -1]) {
        const y = sgn * p.omega;
        ctx.strokeStyle = P.accent;
        ctx.lineWidth = 2.5;
        const cx = sp.X(p.sigma), cy = sp.Y(y), r = 7;
        ctx.beginPath();
        ctx.moveTo(cx - r, cy - r);
        ctx.lineTo(cx + r, cy + r);
        ctx.moveTo(cx + r, cy - r);
        ctx.lineTo(cx - r, cy + r);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(sp.X(p.sigma), sp.Y(p.omega), 13, 0, Math.PI * 2);
      ctx.strokeStyle = alpha(P.accent, 0.5);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      geo.current = { X: (v) => sp.X(v), Y: (v) => sp.Y(v), inv: (x, y) => [sp.invX(x), sp.invY(y)], split: 0 };

      // response
      ctx.save();
      if (narrow) ctx.translate(0, planeH);
      else ctx.translate(planeW, 0);
      const rw = narrow ? w : w - planeW, rh = narrow ? h - planeH : h;
      const ys = impulse ? resp.h : resp.y;
      const lo = impulse ? -2.5 : -0.6, hi = impulse ? 2.5 : 2.2;
      const rp = new Plot(ctx, rw, rh, P, { xMin: 0, xMax: T, yMin: lo, yMax: hi, pad: { l: 34, r: 12, t: 12, b: 24 } });
      rp.grid({ xStep: 2, yStep: impulse ? 1 : 0.5, xLabel: 't' });
      if (!impulse) {
        rp.line(0, 1, T, 1, alpha(P.ink3, 0.7), 1, [4, 4]);
        if (p.sigma < 0) {
          ctx.fillStyle = alpha(P.good, 0.08);
          ctx.fillRect(rp.pad.l, rp.Y(1.02), rp.pw, rp.Y(0.98) - rp.Y(1.02));
        }
      }
      rp.clip();
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      resp.t.forEach((t, i) => {
        const v = Math.max(lo - 1, Math.min(hi + 1, ys[i]));
        if (i) ctx.lineTo(rp.X(t), rp.Y(v));
        else ctx.moveTo(rp.X(t), rp.Y(v));
      });
      ctx.stroke();
      if (!impulse && stats.peakTime !== null) rp.dot(stats.peakTime, 1 + stats.overshoot, 4, P.pos, P.surface, 1.5);
      if (!impulse && stats.settle !== null) rp.line(stats.settle, lo, stats.settle, hi, alpha(P.good, 0.8), 1.5, [3, 3]);
      rp.unclip();
      rp.text(impulse ? '충격 응답 h(t)' : '계단 응답', T, hi, P.ink2, { align: 'right', dy: 10, dx: -4, font: `600 11px ${P.fontBody}`, bg: P.surface });
      ctx.restore();
    },
    [P, p, resp, impulse, stats],
    { height: 380, minHeight: 40 },
  );

  useDrag(wrapRef, {
    hit: (x, y) => {
      const g = geo.current;
      if (!g) return null;
      for (const sgn of [1, -1]) if (Math.hypot(x - g.X(p.sigma), y - g.Y(sgn * p.omega)) < 18) return sgn;
      return null;
    },
    onDrag: (id, x, y) => {
      const g = geo.current;
      if (!g) return;
      const [sg, om] = g.inv(x, y);
      setP(clampP(sg, Number(id) * om));
    },
  });

  const ratio = p.omega > 0 ? -p.sigma / Math.hypot(p.sigma, p.omega) : 1;
  return (
    <Figure
      no={3}
      title="극점을 옮기면 응답이 바뀝니다"
      hint="× 표시를 끌거나 슬라이더를 쓰세요"
      caption={
        <>
          전달 함수 <M>{'H(s) = \\dfrac{\\sigma^2+\\omega^2}{(s-p)(s-\\bar p)}'}</M>의 두 극점 <M>{'p = \\sigma \\pm i\\omega'}</M>를 왼쪽 s-평면에 ×로 그렸습니다. 위쪽 극점을 끌면 아래쪽 극점이 거울처럼 따라옵니다. 오른쪽은 이 계에 크기 1인 계단 입력을 넣었을 때의 출력(또는 충격 응답)을 RK4로 계산한 것입니다. 주황 점은 가장 높이 올라간 곳, 초록 점선은 출력이 1의 ±2% 띠(연한 초록) 안에 영영 머물기 시작하는 시각입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="de-col">
          <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`극점 ${nf(p.sigma, 2)} ± ${nf(p.omega, 2)}i. ${stats.stable ? `안정하고, 넘침 ${(stats.overshoot * 100).toFixed(1)}%, 2% 정착 시간 ${stats.settle === null ? '12초 이상' : stats.settle.toFixed(2) + '초'}.` : '불안정해서 출력이 점점 커집니다.'}`}>
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Slider id="lp-sig" label="실수부 σ (감쇠)" value={p.sigma} min={SIG_MIN} max={SIG_MAX} step={0.05} onChange={(v) => setP(clampP(v, p.omega))} format={(v) => nf(v, 2)} />
          <Slider id="lp-om" label="허수부 ω (진동수)" value={p.omega} min={0} max={OM_MAX} step={0.05} onChange={(v) => setP(clampP(p.sigma, v))} format={(v) => v.toFixed(2)} />
          <div className="btn-row">
            {POLE_PRESETS.map((pr) => (
              <Button key={pr.label} small onClick={() => setP(pr.p)}>
                {pr.label}
              </Button>
            ))}
          </div>
          <Seg value={impulse ? 'h' : 'step'} onChange={(v) => setImpulse(v === 'h')} options={[{ value: 'step', label: '계단 응답' }, { value: 'h', label: '충격 응답' }]} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="안정성" value={stats.stable ? '안정' : '불안정'} color={stats.stable ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="넘침" value={stats.stable ? `${(stats.overshoot * 100).toFixed(1)}%` : '–'} />
            <Readout label="첫 꼭대기" value={stats.peakTime === null ? '–' : `t = ${stats.peakTime.toFixed(2)}`} />
            <Readout label="2% 정착" value={!stats.stable ? '–' : stats.settle === null ? '> 20' : `t = ${stats.settle.toFixed(2)}`} />
          </div>
          <p className="de-small">감쇠비 ζ = −σ/|p| = {ratio.toFixed(2)}</p>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: convolution, sliding and multiplying ─────────────── */

const INPUTS: { value: InputKind; label: string }[] = [
  { value: 'pulse', label: '1초 펄스' },
  { value: 'step', label: '계단' },
  { value: 'twoPulses', label: '밀고 당기기' },
];

function ConvolutionFigure() {
  const P = usePalette();
  const [kind, setKind] = useState<InputKind>('pulse');
  const [t, setT] = useState(1.5);
  const TMAX = 8;
  const u = useMemo(() => inputFn(kind), [kind]);
  const curve = useMemo(() => Array.from({ length: 321 }, (_, i) => (TMAX * i) / 320).map((tt) => [tt, convolve(u, hDefault, tt, 800)] as [number, number]), [u]);
  const yt = useMemo(() => convolve(u, hDefault, t), [u, t]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const topH = Math.round(h * 0.52);
      const pt = new Plot(ctx, w, topH, P, { xMin: -0.5, xMax: TMAX, yMin: -1.6, yMax: 1.9, pad: { l: 34, r: 12, t: 12, b: 22 } });
      pt.grid({ xStep: 1, yStep: 1, xLabel: 'τ' });
      pt.clip();
      const flipped = (tau: number) => hDefault(t - tau);
      const prod = (tau: number) => (tau < 0 || tau > t ? 0 : u(tau) * flipped(tau));
      pt.fillUnder(prod, alpha(P.accent, 0.3), 0, t, 0);
      pt.fn(u, P.ink, 2, { samples: 800 });
      pt.fn(flipped, P.pos, 2, { samples: 400 });
      pt.unclip();
      pt.line(t, -1.6, t, 1.9, alpha(P.pos, 0.6), 1, [3, 3]);
      pt.text(`τ = t = ${t.toFixed(2)}`, t, 1.75, P.pos, { align: 'right', dx: -4, font: `600 11px ${P.fontMono}`, bg: P.surface });

      ctx.save();
      ctx.translate(0, topH);
      const pb = new Plot(ctx, w, h - topH, P, { xMin: -0.5, xMax: TMAX, yMin: -1, yMax: 1.6, pad: { l: 34, r: 12, t: 10, b: 22 } });
      pb.grid({ xStep: 1, yStep: 0.5, xLabel: 't' });
      ctx.strokeStyle = alpha(P.ink3, 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      curve.forEach(([tt, v], i) => (i ? ctx.lineTo(pb.X(tt), pb.Y(v)) : ctx.moveTo(pb.X(tt), pb.Y(v))));
      ctx.stroke();
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      curve.filter(([tt]) => tt <= t).forEach(([tt, v], i) => (i ? ctx.lineTo(pb.X(tt), pb.Y(v)) : ctx.moveTo(pb.X(tt), pb.Y(v))));
      ctx.stroke();
      pb.dot(t, yt, 5, P.accent, P.surface, 2);
      pb.text('출력 y(t) = (u * h)(t)', -0.4, 1.5, P.ink2, { font: `600 11px ${P.fontBody}` });
      ctx.restore();
    },
    [P, u, t, curve, yt],
    { height: 360, minHeight: 40 },
  );

  useDrag(wrapRef, {
    hit: () => 'slide',
    onDrag: (_id, x) => {
      const el = wrapRef.current;
      if (!el) return;
      const pl = 34, pr = 12;
      const tt = -0.5 + ((x - pl) / (el.clientWidth - pl - pr)) * (TMAX + 0.5);
      setT(Math.max(0, Math.min(TMAX, Math.round(tt * 20) / 20)));
    },
  });

  return (
    <Figure
      no={4}
      title="합성곱: 충격 응답을 뒤집어 밀면서 곱하기"
      hint="그림을 좌우로 끌거나 t 슬라이더를 움직이세요"
      caption={
        <>
          위: 검은(어두운 테마에서는 흰) 선이 입력 <M>{'u(\\tau)'}</M>, 주황 선이 극점 <M>{'-1 \\pm 2i'}</M>인 계의 충격 응답을 뒤집어 t만큼 민 <M>{'h(t-\\tau)'}</M>입니다. 둘을 곱해 0부터 t까지 더한 파란 넓이가 그 순간의 출력입니다. 아래: t를 바꿔 가며 얻은 출력 전체(회색)와 지금까지 그린 부분(파랑).
        </>
      }
    >
      <div className="fig-split">
        <div className="de-col">
          <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`입력 ${INPUTS.find((i) => i.value === kind)!.label}과 충격 응답의 합성곱. t = ${t.toFixed(2)}에서 출력 ${nf(yt)}.`}>
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Seg label="입력 u(t)" value={kind} onChange={setKind} options={INPUTS} />
          <Slider id="lp-conv-t" label="t" value={t} min={0} max={TMAX} step={0.05} onChange={setT} format={(v) => v.toFixed(2)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="y(t) = 파란 넓이" value={nf(yt)} color="var(--accent)" />
          </div>
          <Legend
            items={[
              { color: 'var(--ink)', label: '입력 u(τ)', shape: 'ln' },
              { color: 'var(--pos)', label: 'h(t − τ)', shape: 'ln' },
              { color: 'var(--accent)', label: '곱의 넓이', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Laplace() {
  return (
    <>
      <h2>미분을 곱셈으로 바꾸는 변환</h2>
      <p>
        <a href={lessonHref('math-differential-equations', 'oscillations')}>앞 장</a>에서는 2계 선형 방정식을 특성방정식으로 풀었습니다. 그런데 입력이 중간에 켜졌다 꺼지거나, 순간적으로 세게 치는 경우에는 그 방법이 번거로워집니다. 공학에서 이런 문제를 거의 기계적으로 푸는 도구가 <T en="Laplace transform">라플라스 변환</T>입니다. 시간의 함수 <M>{'f(t)'}</M>를 새 변수 s의 함수로 바꿉니다.
      </p>
      <MB note="s가 충분히 크면 e^(−st)가 f를 눌러 적분이 수렴합니다.">{'F(s) = \\mathcal{L}\\{f\\}(s) = \\int_0^{\\infty} e^{-st} f(t)\\, dt'}</MB>
      <p>
        식은 낯설어도 하는 일은 단순합니다. f에 빠르게 줄어드는 <M>{'e^{-st}'}</M>를 곱해 넓이를 재는 것입니다. s가 클수록 앞부분만 보고, 작을수록 멀리까지 봅니다. 그림 1에서 함수를 고르고 s를 움직여 보세요. 기본값 <M>{'\\sin 2t'}</M>, s = 1에서 넓이를 수치로 재면 0.4000이고, 표의 공식 <M>{'2/(s^2+4) = 2/5'}</M>와 같습니다.
      </p>
      <DefinitionFigure />
      <p>자주 쓰는 짝 몇 개를 표로 모아 둡니다. 모두 정의의 적분을 직접 계산하면 나오고, 그림 1이 그 계산을 수치로 확인한 것입니다.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>f(t)</th>
              <th>F(s)</th>
              <th>f(t)</th>
              <th>F(s)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <M>{'1'}</M>
              </td>
              <td>
                <M>{'1/s'}</M>
              </td>
              <td>
                <M>{'e^{-at}'}</M>
              </td>
              <td>
                <M>{'1/(s+a)'}</M>
              </td>
            </tr>
            <tr>
              <td>
                <M>{'t'}</M>
              </td>
              <td>
                <M>{'1/s^2'}</M>
              </td>
              <td>
                <M>{'t\\,e^{-at}'}</M>
              </td>
              <td>
                <M>{'1/(s+a)^2'}</M>
              </td>
            </tr>
            <tr>
              <td>
                <M>{'\\sin \\omega t'}</M>
              </td>
              <td>
                <M>{'\\omega/(s^2+\\omega^2)'}</M>
              </td>
              <td>
                <M>{'\\cos \\omega t'}</M>
              </td>
              <td>
                <M>{'s/(s^2+\\omega^2)'}</M>
              </td>
            </tr>
            <tr>
              <td>
                <M>{"f'(t)"}</M>
              </td>
              <td>
                <M>{'sF(s) - f(0)'}</M>
              </td>
              <td>
                <M>{"f''(t)"}</M>
              </td>
              <td>
                <M>{"s^2F(s) - s f(0) - f'(0)"}</M>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        마지막 줄이 이 변환을 쓰는 이유입니다. <T en="derivative rule">미분 규칙</T>은 부분적분 한 번으로 나옵니다.
      </p>
      <MB>{"\\mathcal{L}\\{f'\\} = \\int_0^\\infty e^{-st} f'(t)\\,dt = \\Bigl[e^{-st} f(t)\\Bigr]_0^\\infty + s\\int_0^\\infty e^{-st} f(t)\\,dt = sF(s) - f(0)"}</MB>
      <p>
        시간 쪽의 미분이 s 쪽에서는 s를 곱하는 일로 바뀌고, 처음 값 <M>{'f(0)'}</M>이 덤으로 따라 들어옵니다. 미분방정식이 대수 방정식이 된다는 뜻입니다.
      </p>

      <h2>미분방정식을 분수식으로</h2>
      <p>
        라플라스 변환으로 미분방정식을 푸는 순서는 언제나 같습니다. 양변을 변환하고, Y(s)에 대해 풀고, 표를 거꾸로 읽어 y(t)로 돌아옵니다. 돌아올 때 걸리는 곳은 Y(s)가 표에 없는 모양인 경우인데, 그럴 때 <T en="partial fractions">부분분수</T>로 표에 있는 조각들로 쪼갭니다. 그림 2에서 한 단계씩 따라가 보세요.
      </p>
      <PartialFractionsFigure />
      <p>
        답 <M>{'y = \\tfrac12 + e^{-t} - \\tfrac12 e^{-2t}'}</M>의 세 조각은 각각 뜻이 있습니다. 1/2은 힘 1을 받는 계가 결국 머무는 자리이고, <M>{'e^{-t}'}</M>와 <M>{'e^{-2t}'}</M>는 특성방정식의 두 근 −1과 −2에서 나온, 처음 상태가 잊혀 가는 모습입니다. 예를 들어 t = 1에서 y = 0.8002이고, 시간이 지날수록 0.5에 다가갑니다.
      </p>
      <Callout kind="note">
        특성방정식을 따로 세우지 않아도 분모 <M>{'s^2 + 3s + 2'}</M>가 저절로 나왔습니다. 처음 조건을 마지막에 맞추는 단계도 없습니다. 변환하는 순간 처음 조건이 식 안으로 들어가기 때문입니다. 대신 표에 없는 모양을 쪼개는 대수 계산이 일의 대부분이 됩니다.
      </Callout>

      <h2>전달 함수와 극점</h2>
      <p>
        처음 조건을 모두 0으로 두면, 입력 u와 출력 y 사이의 관계는 s 쪽에서 곱셈 하나가 됩니다. <M>{'Y(s) = H(s)\\,U(s)'}</M>. 이 <M>{'H(s)'}</M>를 계의 <T en="transfer function">전달 함수</T>라고 합니다. 앞의 예라면 <M>{'H(s) = 1/(s^2+3s+2)'}</M>입니다. 전달 함수의 분모가 0이 되는 s를 <T en="pole">극점</T>이라고 하는데, 부분분수의 조각 하나하나가 극점 하나에서 나오므로, 극점의 위치만 보면 응답이 어떤 모양일지 알 수 있습니다.
      </p>
      <ul>
        <li>극점 <M>{'p = \\sigma + i\\omega'}</M>는 응답에 <M>{'e^{\\sigma t}(\\cos\\omega t, \\sin\\omega t)'}</M> 같은 조각을 만듭니다.</li>
        <li>실수부 σ가 음수면 그 조각이 줄어들고, 양수면 자랍니다. 그래서 모든 극점이 왼쪽 반평면에 있어야 계가 안정합니다.</li>
        <li>허수부 ω가 0이 아니면 응답이 출렁이고, ω가 클수록 빨리 출렁입니다.</li>
      </ul>
      <PolesFigure />
      <p>
        기본값 <M>{'p = -0.5 \\pm 2i'}</M>에서 출력은 1을 45.6% 넘어 t = 1.57에서 꼭대기에 닿고, t = 6.87부터 ±2% 안에 머뭅니다. 넘침은 공식 <M>{'e^{\\sigma\\pi/\\omega}'}</M>, 꼭대기 시각은 <M>{'\\pi/\\omega'}</M>로도 나오는데, 그림의 수치와 같습니다. 극점을 왼쪽으로 끌어 <M>{'-1 \\pm 2i'}</M>로 만들면 넘침이 20.8%로, 정착 시간이 3.74로 줄어듭니다. "거의 진동 없음"(<M>{'-2 \\pm 0.5i'}</M>)에서는 넘침이 사실상 0이고 t = 2.67에 자리를 잡습니다. 극점을 오른쪽 반평면으로 넘기면 출력이 점점 크게 출렁이며 터집니다.
      </p>
      <Callout kind="intuition">
        제어 공학자가 하는 일의 큰 부분은 극점을 원하는 자리로 옮기는 것입니다. 엘리베이터가 층에 설 때 출렁이지 않게, 드론이 바람에 흔들려도 빨리 제자리로 오게, 되먹임으로 전달 함수를 바꿔 극점을 왼쪽으로, 실수축 가까이로 끌어옵니다. 너무 왼쪽으로 끌면 그만큼 큰 힘이 필요하다는 것이 맞바꿈입니다.
      </Callout>

      <h2>합성곱: 입력에 충격 응답을 겹쳐 쌓기</h2>
      <p>
        <M>{'Y = HU'}</M>를 시간 쪽으로 돌려 읽으면 무엇이 될까요? 곱의 역변환은 곱이 아니라 <T en="convolution">합성곱</T>입니다.
      </p>
      <MB note="합성곱 정리: L{u * h} = U(s) H(s)">{'y(t) = (u * h)(t) = \\int_0^t u(\\tau)\\, h(t-\\tau)\\, d\\tau'}</MB>
      <p>
        여기서 <M>{'h(t)'}</M>는 순간적인 충격 하나를 넣었을 때의 출력, 곧 <T en="impulse response">충격 응답</T>이고 <M>{'H(s)'}</M>의 역변환입니다. 식의 뜻은 이렇습니다. 입력을 아주 짧은 충격들로 잘게 나누면, 시각 τ에 들어온 충격은 지금 t까지 <M>{'t-\\tau'}</M>만큼 지난 충격 응답을 남깁니다. 그 응답들을 모두 더한 것이 지금의 출력입니다. 그림 4에서 충격 응답을 뒤집어 밀면서 곱의 넓이가 어떻게 출력이 되는지 보세요.
      </p>
      <ConvolutionFigure />
      <p>
        1초짜리 펄스를 넣으면 출력은 t = 1.15 근처에서 1.04까지 올라갔다가, 펄스가 끝난 뒤 출렁이며 0으로 돌아갑니다. t = 1.5에서는 0.788입니다. 계단 입력에서는 출력이 1을 넘었다가 1로 자리를 잡는데, 이것이 그림 3에서 극점을 <M>{'-1 \\pm 2i'}</M>로 두었을 때의 계단 응답과 같은 곡선입니다. 계단은 펄스를 끝없이 늘인 것이므로, 충격 응답을 0부터 t까지 적분한 값이 계단 응답이 됩니다.
      </p>

      <Callout kind="key">
        라플라스 변환 <M>{'F(s) = \\int_0^\\infty e^{-st} f(t)\\,dt'}</M>은 미분을 s를 곱하는 일로 바꾸고 처음 조건을 식 안으로 넣어, 선형 미분방정식을 Y(s)에 대한 대수 방정식으로 만듭니다. 풀고 나면 부분분수로 쪼개 표를 거꾸로 읽습니다. 입력과 출력의 관계는 전달 함수 <M>{'H(s)'}</M> 하나로 요약되고, 그 극점의 실수부는 안정성과 감쇠 속도를, 허수부는 진동수를 정합니다. 시간 쪽에서는 출력이 입력과 충격 응답의 합성곱입니다.
      </Callout>
      <Quiz
        q="어떤 계의 전달 함수가 H(s) = 4 / (s² − 0.4s + 4.04) 이다. 이 계에 계단 입력을 넣으면 출력은 어떻게 되는가?"
        options={['출렁이며 1에 자리 잡는다', '출렁이지 않고 1에 다가간다', '출렁이면서 점점 크게 벌어진다', '곧바로 1이 되어 그대로 머문다']}
        answer={2}
        explain={
          <>
            분모의 근을 구하면 <M>{'s = 0.2 \\pm 2i'}</M>입니다. 허수부 2가 있으니 출렁이고, 실수부 0.2가 양수라 <M>{'e^{0.2t}'}</M>로 자라는 조각이 생깁니다. 극점이 오른쪽 반평면에 있으므로 계는 불안정하고, 그림 3의 "오른쪽 반평면" 설정과 같은 모습이 됩니다.
          </>
        }
      />
    </>
  );
}
