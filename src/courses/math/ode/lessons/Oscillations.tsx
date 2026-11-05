import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { KIND_KO, amplitude, dampingRatio, forcedFromRest, freeResponse, resonance, roots } from './oscillate';
import './ode.css';
import './oscillations.css';

const nf = (v: number, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');
const M_MASS = 1;

/** A horizontal spring from x = a to x = b at height y, with `turns` zigzags. */
function spring(ctx: CanvasRenderingContext2D, P: Palette, a: number, b: number, y: number, amp: number, turns = 10) {
  const lead = 10;
  ctx.strokeStyle = P.ink2;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(a, y);
  ctx.lineTo(a + lead, y);
  const seg = (b - a - 2 * lead) / (turns * 2);
  for (let i = 0; i < turns * 2; i++) ctx.lineTo(a + lead + seg * (i + 0.5), y + (i % 2 ? amp : -amp));
  ctx.lineTo(b - lead, y);
  ctx.lineTo(b, y);
  ctx.stroke();
}

/* ─────────────── Figure 1: the mass on a spring ─────────────── */

const T_SHOW = 20;

function SpringFigure() {
  const P = usePalette();
  const [c, setC] = useState(0.4);
  const [k, setK] = useState(4);
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const t = useRef(still ? 5 : 0);
  const [, setTick] = useState(0);
  useAnimationFrame((dt) => {
    t.current += dt;
    if (t.current > T_SHOW + 1) t.current = 0;
    setTick((x) => x + 1);
  }, inView && !still);

  const sol = useMemo(() => freeResponse(M_MASS, c, k, 1, 0), [c, k]);
  const zeta = dampingRatio(M_MASS, c, k);
  const now = Math.min(t.current, T_SHOW);
  const xNow = sol.x(now);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      // top: wall, spring, mass
      const topH = 70;
      const wallX = 16, rest = w * 0.5, scale = w * 0.18;
      const mx = rest + xNow * scale;
      ctx.fillStyle = alpha(P.ink3, 0.35);
      ctx.fillRect(wallX - 8, 10, 8, topH - 20);
      ctx.strokeStyle = P.lineStrong;
      ctx.beginPath();
      ctx.moveTo(wallX, topH - 10);
      ctx.lineTo(w - 10, topH - 10);
      ctx.stroke();
      spring(ctx, P, wallX, mx - 20, topH / 2, 9, 9);
      ctx.fillStyle = P.accent;
      ctx.fillRect(mx - 20, topH / 2 - 20, 40, 40);
      ctx.strokeStyle = alpha(P.ink3, 0.8);
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(rest, 4);
      ctx.lineTo(rest, topH - 10);
      ctx.stroke();
      ctx.setLineDash([]);
      // bottom: x(t)
      ctx.save();
      ctx.translate(0, topH);
      const pl = new Plot(ctx, w, h - topH, P, { xMin: 0, xMax: T_SHOW, yMin: -1.15, yMax: 1.15, pad: { l: 34, r: 12, t: 8, b: 24 } });
      pl.grid({ xStep: 5, yStep: 0.5, xLabel: 't', yLabel: 'x' });
      if (sol.envelope) {
        const env = sol.envelope;
        pl.fn((s) => env(s), alpha(P.ink3, 0.8), 1.2, { dash: [5, 4] });
        pl.fn((s) => -env(s), alpha(P.ink3, 0.8), 1.2, { dash: [5, 4] });
      }
      pl.fn(sol.x, alpha(P.accent, 0.35), 1.5, { samples: 500 });
      pl.fn(sol.x, P.accent, 2.4, { to: now, samples: 500 });
      pl.dot(now, xNow, 4.5, P.accent, P.surface);
      ctx.restore();
    },
    [P, sol, now, xNow],
    { aspect: 1.55, maxHeight: 380, minHeight: 260 },
  );

  const r = sol.r;
  return (
    <Figure
      no={1}
      title="용수철에 매달린 추"
      hint="감쇠 c를 0부터 5까지 움직여 보세요"
      caption={
        <>
          질량 m = 1인 추를 1만큼 당겼다가 놓았습니다(x(0) = 1, x′(0) = 0). 아래 그래프는 위치 x(t)이고, 점선은 진동하는 경우 진폭이 줄어드는 모양 e<sup>−ct/2</sup>입니다. 해는 다음 절의 특성방정식으로 정확히 계산했습니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={outer} className="os2-anim">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`k = ${k}, c = ${c}인 용수철. ${KIND_KO[r.kind]}. 지금 t = ${nf(now, 1)}, 위치 x = ${nf(xNow, 2)}.`}>
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <MB>{"x'' + c\\,x' + k\\,x = 0"}</MB>
          <Slider id="os-c" label="감쇠 c" value={c} min={0} max={5} step={0.05} onChange={setC} format={(v) => v.toFixed(2)} />
          <Slider id="os-k" label="용수철 상수 k" value={k} min={1} max={9} step={0.25} onChange={setK} format={(v) => v.toFixed(2)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="감쇠비 ζ" value={nf(zeta, 3)} />
            <Readout label="종류" value={KIND_KO[r.kind]} color={r.kind === 'over' ? 'var(--bad)' : r.kind === 'critical' ? 'var(--good)' : undefined} />
            <Readout label="고유 진동수 √k" value={nf(Math.sqrt(k), 3)} />
            <Readout label="실제 진동수" value={r.kind === 'under' || r.kind === 'undamped' ? nf(r.im[0], 3) : '진동 없음'} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the roots move as c grows ─────────────── */

const K2 = 4;

function RootsFigure() {
  const P = usePalette();
  const [c, setC] = useState(1);
  const r = roots(M_MASS, c, K2);
  const sol = useMemo(() => freeResponse(M_MASS, c, K2, 1, 0), [c]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const half = w > 520;
      const lw = half ? w * 0.48 : w;
      const lh = half ? h : h * 0.55;
      const pl = new Plot(ctx, lw, lh, P, { xMin: -5.2, xMax: 1, yMin: -2.6, yMax: 2.6, equal: true, pad: { l: 30, r: 10, t: 10, b: 24 } });
      pl.grid({ xStep: 1, yStep: 1, xLabel: '실수부', yLabel: '허수부' });
      // the whole path of the roots as c goes from 0 to 6: a half-circle of radius √k, then the real axis
      ctx.strokeStyle = alpha(P.ink3, 0.6);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(pl.X(0), pl.Y(0), pl.X(2) - pl.X(0), Math.PI / 2, (3 * Math.PI) / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      pl.line(-5.2, 0, 0, 0, alpha(P.ink3, 0.6), 1.2, [4, 4]);
      pl.text('c = 4에서 만남', -2, 0.35, P.ink3, { align: 'center' });
      const col = r.kind === 'over' ? P.bad : r.kind === 'critical' ? P.good : P.accent;
      for (let i = 0; i < 2; i++) pl.dot(r.re[i], r.im[i], 6.5, col, P.surface);
      // x(t)
      ctx.save();
      ctx.translate(half ? lw : 0, half ? 0 : lh);
      const tl = new Plot(ctx, half ? w - lw : w, half ? h : h - lh, P, { xMin: 0, xMax: 10, yMin: -1.1, yMax: 1.1, pad: { l: 30, r: 10, t: 10, b: 24 } });
      tl.grid({ xStep: 2, yStep: 0.5, xLabel: 't', yLabel: 'x' });
      tl.fn(sol.x, col, 2.4, { samples: 400 });
      ctx.restore();
    },
    [P, c, r, sol],
    { aspect: 1.9, maxHeight: 320, minHeight: 300 },
  );

  const rootText = r.im[0] !== 0 ? `${nf(r.re[0], 3)} ± ${nf(Math.abs(r.im[0]), 3)}i` : r.kind === 'critical' ? `${nf(r.re[0], 3)} (중근)` : `${nf(r.re[0], 3)}, ${nf(r.re[1], 3)}`;
  return (
    <Figure
      no={2}
      title="특성방정식의 근이 움직이는 길"
      hint="c를 천천히 올려 근이 실수축에서 만나는 순간을 찾아보세요"
      caption={
        <>
          첫 그래프는 특성방정식 λ² + cλ + 4 = 0의 두 근을 복소평면에 찍은 것입니다. c가 0에서 4까지 커지면 두 근은 반지름 2인 반원(점선)을 따라 내려와 c = 4에서 −2로 만나고, 그 뒤로는 실수축 위에서 서로 멀어집니다. 둘째 그래프는 그때의 x(t)입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="os-c2" label="감쇠 c" value={c} min={0} max={6} step={0.05} onChange={setC} format={(v) => v.toFixed(2)} />
        <Button small onClick={() => setC(4)}>
          c = 4 (임계)
        </Button>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`c = ${c.toFixed(2)}일 때 근은 ${rootText}, ${KIND_KO[r.kind]}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Readout label="두 근" value={rootText} />
        <Readout label="판별식 c² − 16" value={nf(c * c - 16, 2)} />
        <Readout label="종류" value={KIND_KO[r.kind]} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: pushing at the right rhythm ─────────────── */

const K3 = 4, F3 = 1, T3 = 80;

function ResonanceFigure() {
  const P = usePalette();
  const [c, setC] = useState(0.2);
  const [w, setW] = useState(1.5);
  const A = c === 0 && Math.abs(w * w - K3) < 1e-9 ? Infinity : amplitude(M_MASS, c, K3, F3, w);
  const res = resonance(M_MASS, c, K3, F3);
  const sim = useMemo(() => forcedFromRest(M_MASS, c, K3, F3, w, T3, 0.02), [c, w]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: W, h }) => {
      const half = W > 560;
      const lw = half ? W * 0.4 : W;
      const lh = half ? h : h * 0.45;
      const pl = new Plot(ctx, lw, lh, P, { xMin: 0, xMax: 4, yMin: 0, yMax: 4, pad: { l: 30, r: 10, t: 10, b: 24 } });
      pl.grid({ xStep: 1, yStep: 1, xLabel: 'ω', yLabel: 'A' });
      pl.line(2, 0, 2, 4, alpha(P.ink3, 0.6), 1.2, [4, 4]);
      pl.clip();
      pl.fn((x) => amplitude(M_MASS, c, K3, F3, x), P.accent, 2.4, { samples: 600 });
      pl.unclip();
      if (isFinite(A)) pl.dot(w, Math.min(A, 4), 6, P.bad, P.surface);
      // x(t) from rest
      ctx.save();
      ctx.translate(half ? lw : 0, half ? 0 : lh);
      const ymax = Math.max(1, Math.min(8, Math.max(...sim.map((p) => Math.abs(p[1]))) * 1.1));
      const tl = new Plot(ctx, half ? W - lw : W, half ? h : h - lh, P, { xMin: 0, xMax: T3, yMin: -ymax, yMax: ymax, pad: { l: 34, r: 10, t: 10, b: 24 } });
      tl.grid({ xStep: 20, xLabel: 't', yLabel: 'x' });
      if (isFinite(A) && A < ymax) {
        tl.line(0, A, T3, A, alpha(P.ink3, 0.8), 1.2, [5, 4]);
        tl.line(0, -A, T3, -A, alpha(P.ink3, 0.8), 1.2, [5, 4]);
      }
      tl.clip();
      ctx.strokeStyle = P.bad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      sim.forEach(([t, x], i) => (i ? ctx.lineTo(tl.X(t), tl.Y(x)) : ctx.moveTo(tl.X(t), tl.Y(x))));
      ctx.stroke();
      tl.unclip();
      ctx.restore();
    },
    [P, c, w, A, sim],
    { aspect: 1.9, maxHeight: 340, minHeight: 300 },
  );

  const preset = (cc: number, ww: number) => {
    setC(cc);
    setW(ww);
  };
  return (
    <Figure
      no={3}
      title="박자를 맞춰 밀면: 강제 진동과 공명"
      hint="ω를 2 가까이로 옮기거나 아래 버튼을 눌러 보세요"
      caption={
        <>
          x″ + cx′ + 4x = cos ωt를 정지 상태에서 시작했습니다. 첫 그래프는 오래 지난 뒤의 진폭 A를 미는 진동수 ω에 따라 그린 응답 곡선이고, 빨간 점이 지금의 ω입니다. 둘째 그래프는 실제로 움직인 x(t)(룽게-쿠타, 보폭 0.02)이고 점선은 첫 그래프에서 읽은 진폭 ±A입니다. 세로 점선은 고유 진동수 ω₀ = 2입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="os-w" label="미는 진동수 ω" value={w} min={0.5} max={3.5} step={0.01} onChange={setW} format={(v) => v.toFixed(2)} />
        <Slider id="os-c3" label="감쇠 c" value={c} min={0} max={1} step={0.02} onChange={setC} format={(v) => v.toFixed(2)} />
      </div>
      <div className="btn-row">
        <Button small onClick={() => preset(0.2, 1.5)}>
          처음 설정
        </Button>
        <Button small onClick={() => preset(0.2, 2)}>
          공명 (ω = 2)
        </Button>
        <Button small onClick={() => preset(0, 1.8)}>
          맥놀이 (c = 0, ω = 1.8)
        </Button>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`c = ${c.toFixed(2)}, ω = ${w.toFixed(2)}. 정상 상태 진폭 ${isFinite(A) ? nf(A, 3) : '무한대'}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Readout label="정상 상태 진폭 A" value={isFinite(A) ? nf(A, 3) : '∞ (계속 커짐)'} color="var(--bad)" />
        <Readout label="진폭이 가장 큰 ω" value={res ? nf(res.w, 3) : '정점 없음'} />
        <Readout label="그때의 진폭" value={res ? (isFinite(res.A) ? nf(res.A, 3) : '∞') : '—'} />
      </div>
      <Legend
        items={[
          { color: 'var(--accent)', label: '응답 곡선 A(ω)', shape: 'ln' },
          { color: 'var(--bad)', label: 'x(t)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Oscillations() {
  return (
    <>
      <h2>힘은 가속도를 정한다</h2>
      <p>
        용수철에 매달린 추를 당겼다 놓으면 앞뒤로 흔들립니다. 뉴턴의 제2법칙은 힘이 가속도, 곧 위치의 두 번째 도함수를 정한다고 말합니다. 용수철은 늘어난 만큼 반대로 당기고(−kx), 공기나 마찰은 속도에 비례해 움직임을 막습니다(−cx′). 그래서 추의 위치 x(t)는 다음 <T en="second-order linear ODE">2계 선형 미분방정식</T>을 따릅니다.
      </p>
      <MB>{"m\\,x'' + c\\,x' + k\\,x = 0"}</MB>
      <p>
        2계 방정식은 처음 위치와 처음 속도 두 가지를 정해야 해가 하나로 정해집니다. 그림 1에서는 추를 1만큼 당겼다가 가만히 놓았습니다.
      </p>
      <SpringFigure />

      <h2>특성방정식: 지수 함수를 넣어 보기</h2>
      <p>
        1계 방정식 y′ = ky의 해가 e<sup>kt</sup>였으니, 여기서도 x = e<sup>λt</sup>를 넣어 봅니다. x′ = λe<sup>λt</sup>, x″ = λ²e<sup>λt</sup>이므로 e<sup>λt</sup>를 나누면 λ에 대한 이차방정식이 남습니다.
      </p>
      <MB>{'m\\lambda^2 + c\\lambda + k = 0 \\qquad \\lambda = \\frac{-c \\pm \\sqrt{c^2 - 4mk}}{2m}'}</MB>
      <p>
        이 <T en="characteristic equation">특성방정식</T>의 판별식 c² − 4mk의 부호가 움직임의 모양을 정합니다. 판별식이 음수면 근이 복소수 −c/2m ± iω가 되고, 오일러 공식 e<sup>iωt</sup> = cos ωt + i sin ωt 때문에 해는 진동하면서 e<sup>−ct/2m</sup>로 줄어듭니다. 이것이 <T en="underdamped">미흡감쇠</T>입니다. 판별식이 0이면 중근이 되어 진동 없이 가장 빨리 제자리로 돌아오는 <T en="critically damped">임계 감쇠</T>, 양수면 서로 다른 두 음의 실근이 되어 천천히 기어 돌아오는 <T en="overdamped">과감쇠</T>입니다.
      </p>
      <p>
        그림 1의 기본값 k = 4, c = 0.4에서는 근이 −0.2 ± 1.990i이고, 감쇠비 ζ = c / 2√(mk) = 0.1입니다. 추는 주기 2π/1.990 ≈ 3.16마다 한 번씩 오가며 진폭이 e<sup>−0.2t</sup>로 줄어, t = 10에서는 0.136 안쪽으로 들어옵니다. c를 0으로 내리면 진폭이 줄지 않는 단순 조화 진동이 되고, c를 4로 올리면 진동이 사라집니다. 그림 2는 c가 바뀔 때 두 근이 움직이는 길을 보여 줍니다.
      </p>
      <RootsFigure />
      <p>
        근의 실수부는 얼마나 빨리 줄어드는지를, 허수부는 얼마나 빨리 진동하는지를 정합니다. 자동차 서스펜션이나 문이 닫히는 장치는 임계 감쇠 근처로 설계합니다. 감쇠가 너무 작으면 출렁거리고, 너무 크면 느리게 돌아오기 때문입니다. 연립 방정식으로 넘어가면 이 특성방정식이 행렬의 <a href={lessonHref('math-linear-algebra', 'eigen')}>고윳값</a>을 구하는 식으로 다시 나타납니다.
      </p>

      <h2>밖에서 밀어 줄 때: 공명</h2>
      <p>
        그네를 밀 때 아무 때나 밀면 잘 올라가지 않지만, 그네가 돌아오는 박자에 맞춰 밀면 조금씩만 밀어도 높이 올라갑니다. 외부에서 주기적인 힘 F cos ωt를 더하면 방정식은 다음과 같습니다.
      </p>
      <MB>{"m\\,x'' + c\\,x' + k\\,x = F\\cos\\omega t"}</MB>
      <p>
        해는 1장의 적분 인자 때처럼 두 부분으로 나뉩니다. 처음 상태에 따라 달라지다 감쇠로 사라지는 과도 응답과, 미는 힘과 같은 진동수 ω로 계속 흔들리는 정상 상태입니다. 정상 상태의 진폭은 다음과 같습니다.
      </p>
      <MB>{'A(\\omega) = \\frac{F}{\\sqrt{(k - m\\omega^2)^2 + (c\\,\\omega)^2}}'}</MB>
      <ResonanceFigure />
      <p>
        기본값 c = 0.2, ω = 1.5에서는 정상 상태 진폭이 0.563입니다. ω를 고유 진동수 √(k/m) = 2로 옮기면 분모의 첫 항이 0이 되어 진폭이 2.5로 커지고, 정확한 정점은 ω ≈ 1.995에서 약 2.503입니다. 이렇게 미는 박자가 계의 고유 진동수와 맞을 때 작은 힘으로 큰 진동이 생기는 현상이 <T en="resonance">공명</T>입니다. 공명 상태에서도 진폭이 한 번에 커지지는 않아서, 정지 상태에서 시작하면 과도 응답이 e<sup>−0.1t</sup>로 사라지는 동안 천천히 자라 t ≈ 31에야 최종 진폭의 95%에 닿습니다.
      </p>
      <p>
        감쇠를 0으로 두고 ω = 2로 밀면 진폭이 끝없이 자랍니다. 감쇠가 0이고 ω가 고유 진동수와 조금 다르면(맥놀이 버튼, ω = 1.8) 두 진동이 번갈아 보강하고 상쇄해 진폭이 커졌다 작아지기를 되풀이하는 <T en="beats">맥놀이</T>가 생깁니다. 크게 오르내리는 주기는 2π / |ω − ω₀| = 2π / 0.2 ≈ 31.4이고, 가장 클 때 진폭은 2F / (ω₀² − ω²) ≈ 2.63입니다. 악기를 조율할 때 두 음이 "웅웅" 하고 맥놀이하다 맞으면 사라지는 것이 이 현상입니다.
      </p>
      <Callout kind="note" label="공명은 좋기도 하고 무섭기도 합니다">
        <p style={{ margin: 0 }}>
          라디오는 회로의 고유 진동수를 원하는 방송국의 주파수에 맞춰 그 신호만 크게 키웁니다. 반대로 다리나 건물은 바람이나 사람의 발걸음 같은 주기적인 힘에 공명하지 않도록 고유 진동수를 피하거나 감쇠 장치를 답니다. 행진하는 군대가 다리를 건널 때 발을 맞추지 않게 하는 관습도 같은 이유로 전해집니다.
        </p>
      </Callout>

      <h2>같은 방정식, 다른 이름: 전기 회로</h2>
      <p>
        코일(L), 저항(R), 축전기(C)를 직렬로 이은 회로에 전압 V(t)를 걸면 축전기의 전하 q(t)가 L q″ + R q′ + q / C = V(t)를 따릅니다. 기호만 다를 뿐 용수철과 똑같은 방정식이라, 이 장에서 본 모든 결과가 회로에 그대로 옮겨집니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>용수철</th>
              <th>전기 회로</th>
              <th>하는 일</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>위치 x</td>
              <td>전하 q</td>
              <td>방정식의 미지수</td>
            </tr>
            <tr>
              <td>질량 m</td>
              <td>인덕턴스 L</td>
              <td>변화를 거스르는 관성</td>
            </tr>
            <tr>
              <td>감쇠 계수 c</td>
              <td>저항 R</td>
              <td>에너지를 열로 잃음</td>
            </tr>
            <tr>
              <td>용수철 상수 k</td>
              <td>1 / 정전 용량 C</td>
              <td>되돌리는 힘</td>
            </tr>
            <tr>
              <td>외부 힘 F cos ωt</td>
              <td>전압 V cos ωt</td>
              <td>밀어 주는 입력</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        고유 진동수는 1/√(LC)이고, 저항이 작을수록 공명 정점이 날카로워집니다. 그림 3의 c를 0.2에서 0.05로 줄여 정점이 좁고 높아지는 것을 확인해 보세요.
      </p>

      <Callout kind="key">
        m x″ + c x′ + k x = 0에 x = e<M>{'\\lambda t'}</M>를 넣으면 특성방정식 mλ² + cλ + k = 0이 나오고, 판별식 c² − 4mk의 부호에 따라 미흡감쇠(진동), 임계 감쇠, 과감쇠가 갈립니다. 근의 실수부는 줄어드는 속도, 허수부는 진동수입니다. 주기적인 힘으로 밀면 정상 상태 진폭이 F / √((k − mω²)² + (cω)²)이 되어, ω가 고유 진동수에 가까울수록 커지는 공명이 생깁니다. 같은 방정식이 전기 회로도 설명합니다.
      </Callout>
      <Quiz
        q="x″ + c x′ + 9x = 0인 장치를 진동 없이 가장 빨리 제자리로 돌아오게 하려면 c를 얼마로 해야 하나?"
        options={['c = 3', 'c = 6', 'c = 9', 'c = 18']}
        answer={1}
        explain={<>진동 없이 가장 빨리 돌아오는 것은 임계 감쇠, 곧 판별식 c² − 4mk = 0일 때입니다. m = 1, k = 9이므로 c² = 36, c = 6입니다. c가 6보다 작으면 출렁이고, 크면 과감쇠로 더 느리게 기어 돌아옵니다.</>}
      />
    </>
  );
}
