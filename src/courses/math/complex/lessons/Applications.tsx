import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import {
  airfoilRadius,
  airfoilShape,
  airfoilStream,
  amplitudes,
  cabs,
  chord,
  contours,
  cylStream,
  cylVelocity,
  dft,
  fft,
  joukowski,
  kuttaGamma,
  partialSum,
  peak,
  phasors,
  relaxDisk,
  signal,
  stagnation,
  tempConformal,
  tempPoisson,
  wave,
  type Airfoil,
  type C,
  type Seg as Segment,
  type SignalKind,
  type Wave,
} from './apps';
import './complex.css';
import './apps.css';

/** A proof set apart from the prose, ending with ∎. */
function Proof({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ap2-proof">
      <div className="ap2-proof-head">{title}</div>
      {children}
    </div>
  );
}
const Qed = () => <span className="ap2-qed">∎</span>;

/** Parse a CSS colour as the palette gives it (#rgb, #rrggbb, rgb(…)) into 0..255 numbers. */
function rgbOf(css: string): [number, number, number] {
  const s = css.trim();
  if (s.startsWith('#')) {
    const h = s.length === 4 ? s.slice(1).split('').map((ch) => ch + ch).join('') : s.slice(1, 7);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = s.match(/[\d.]+/g);
  return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
}

function drawSegments(p: Plot, segs: Segment[], color: string, width = 1.2, map?: (z: C) => C) {
  const c = p.ctx;
  c.save();
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  for (const [a0, b0] of segs) {
    const a = map ? map(a0) : a0, b = map ? map(b0) : b0;
    c.moveTo(p.X(a[0]), p.Y(a[1]));
    c.lineTo(p.X(b[0]), p.Y(b[1]));
  }
  c.stroke();
  c.restore();
}

/* ─────────────── Figure 1: Fourier series as spinning arrows ─────────────── */

function FourierFigure() {
  const P = usePalette();
  const [kind, setKind] = useState<Wave>('square');
  const [N, setN] = useState(9);
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const [playing, setPlaying] = useState(!still);
  const theta = useRef(1.2);
  const [, setTick] = useState(0);
  useAnimationFrame((dt) => {
    theta.current += dt * 0.6;
    if (theta.current > Math.PI) theta.current -= 2 * Math.PI;
    setTick((x) => x + 1);
  }, inView && playing);
  const t = theta.current;
  const chain = phasors(kind, N, t);
  const tip = chain[chain.length - 1];
  const terms = chain.length - 1;
  const pk = useMemo(() => peak(kind, N), [kind, N]);
  const S = partialSum(kind, N, t);

  const left = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -1.7, xMax: 1.7, yMin: -1.7, yMax: 1.7, equal: true, pad: { l: 8, r: 8, t: 8, b: 8 } });
      const c = p.ctx;
      p.line(-1.7, 0, 1.7, 0, P.line, 1);
      p.line(0, -1.7, 0, 1.7, P.line, 1);
      for (let k = 0; k < chain.length - 1; k++) {
        const a = chain[k], b = chain[k + 1];
        const rr = Math.hypot(b[0] - a[0], b[1] - a[1]);
        c.strokeStyle = alpha(P.ink3, 0.35);
        c.lineWidth = 1;
        c.beginPath();
        c.arc(p.X(a[0]), p.Y(a[1]), rr * (p.X(1) - p.X(0)), 0, Math.PI * 2);
        c.stroke();
        p.line(a[0], a[1], b[0], b[1], k === 0 ? P.ink : P.ink2, k === 0 ? 2.2 : 1.6);
      }
      // the height of the tip is the partial sum
      p.line(tip[0], tip[1], 1.7, tip[1], P.accent, 1.2, [4, 4]);
      p.dot(tip[0], tip[1], 5, P.accent, P.surface);
    },
    [P, chain, tip],
    { aspect: 1, maxHeight: 320 },
  );

  const right = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -Math.PI, xMax: Math.PI, yMin: -1.7, yMax: 1.7, pad: { l: 34, r: 10, t: 8, b: 24 } });
      p.grid({ xStep: Math.PI / 2, yStep: 0.5, fmt: (v) => (Math.abs(v) < 1e-9 ? '0' : Math.abs(Math.abs(v) - Math.PI) < 1e-6 ? (v < 0 ? '−π' : 'π') : Math.abs(Math.abs(v) - Math.PI / 2) < 1e-6 ? (v < 0 ? '−π/2' : 'π/2') : v.toFixed(1)) });
      p.fn((x) => wave(kind, x), P.ink3, 1.6, { samples: 800 });
      p.fn((x) => partialSum(kind, N, x), P.accent, 2.2, { samples: 900 });
      p.line(t, -1.7, t, 1.7, alpha(P.ink, 0.4), 1, [3, 3]);
      p.dot(t, S, 5, P.accent, P.surface);
      if (kind === 'square') p.line(-Math.PI, pk.value, Math.PI, pk.value, alpha(P.bad, 0.7), 1, [2, 4]);
    },
    [P, kind, N, t, S, pk],
    { aspect: 1.5, maxHeight: 320 },
  );

  return (
    <Figure
      no={1}
      title="돌아가는 화살표들의 합"
      hint="항의 수를 늘리고 재생해 보세요"
      caption={
        <>
          왼쪽: 길이가 <M>{'b_n'}</M>이고 각속도가 n인 화살표 <M>{'b_n e^{in\\theta}'}</M>을 꼬리에 머리를 이어 붙였습니다. 끝점의 높이(허수부)가 부분합 <M>{'S_N(\\theta) = \\sum b_n \\sin n\\theta'}</M>이고, 오른쪽 그래프의 파란 곡선 위 점과 같습니다. 흐린 선은 원래 파형, 사각파일 때 빨간 점선은 부분합의 최댓값입니다.
        </>
      }
    >
      <div ref={outer} className="ap2-two">
        <div>
          <div className="ap2-title">복소 평면의 화살표 사슬</div>
          <div ref={left.wrapRef} className="canvas-box" role="img" aria-label={`${terms}개의 화살표를 이어 붙인 사슬. 끝점의 높이 ${S.toFixed(3)}가 지금 θ = ${t.toFixed(2)}에서의 부분합입니다.`}>
            <canvas ref={left.canvasRef} />
          </div>
        </div>
        <div>
          <div className="ap2-title">θ에 따른 부분합</div>
          <div ref={right.wrapRef} className="canvas-box" role="img" aria-label={`${kind === 'square' ? '사각파' : '톱니파'}와 항 ${terms}개까지의 부분합. 부분합의 최댓값은 ${pk.value.toFixed(5)}입니다.`}>
            <canvas ref={right.canvasRef} />
          </div>
        </div>
      </div>
      <div className="controls row" style={{ marginTop: 12 }}>
        <Seg value={kind} onChange={setKind} options={[{ value: 'square', label: '사각파' }, { value: 'saw', label: '톱니파' }]} />
        <Slider id="ap1-n" label="가장 높은 진동수 N" value={N} min={1} max={49} step={1} onChange={setN} />
        <Button small onClick={() => setPlaying((v) => !v)}>
          {playing ? '❚❚ 멈춤' : '▶ 재생'}
        </Button>
      </div>
      <div className="readouts" style={{ marginTop: 10 }}>
        <Readout label="0이 아닌 항의 수" value={terms} />
        <Readout label="θ" value={t.toFixed(2)} />
        <Readout label="S_N(θ)" value={S.toFixed(3)} color="var(--accent)" />
        <Readout label="부분합의 최댓값" value={pk.value.toFixed(5)} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a spectrum by FFT ─────────────── */

const NS = 64;

function SpectrumFigure() {
  const P = usePalette();
  const [kind, setKind] = useState<SignalKind>('two-tones');
  const [noise, setNoise] = useState(0.3);
  const [seed, setSeed] = useState(1);
  const x = useMemo(() => signal(kind, NS, noise, seed), [kind, noise, seed]);
  const { F, D, amp, diff } = useMemo(() => {
    const cx = x.map((v) => [v, 0] as C);
    const F = fft(cx), D = dft(cx);
    let diff = 0;
    F.out.forEach((z, k) => (diff = Math.max(diff, cabs([z[0] - D.out[k][0], z[1] - D.out[k][1]]))));
    return { F, D, amp: amplitudes(F.out), diff };
  }, [x]);
  const top = amp.map((a, m) => ({ a, m })).sort((u, v) => v.a - u.a).slice(0, 2);

  const sig = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -1, xMax: NS, yMin: -2.4, yMax: 2.4, pad: { l: 30, r: 8, t: 8, b: 20 } });
      p.grid({ xStep: 16, yStep: 1 });
      x.forEach((v, k) => {
        p.line(k, 0, k, v, alpha(P.ink2, 0.6), 1.2);
        p.dot(k, v, 2.4, P.ink, undefined, 0);
      });
    },
    [P, x],
    { aspect: 3.2, maxHeight: 170, minHeight: 110 },
  );

  const spec = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -0.8, xMax: NS / 2 + 0.8, yMin: 0, yMax: 1.4, pad: { l: 30, r: 8, t: 8, b: 22 } });
      p.grid({ xStep: 4, yStep: 0.5 });
      const c = p.ctx;
      amp.forEach((a, m) => {
        c.fillStyle = top.some((u) => u.m === m) ? P.accent : alpha(P.ink2, 0.55);
        const x0 = p.X(m - 0.35), x1 = p.X(m + 0.35);
        c.fillRect(x0, p.Y(Math.min(a, 1.4)), x1 - x0, p.Y(0) - p.Y(Math.min(a, 1.4)));
      });
      for (const u of top) p.text(`m=${u.m}`, u.m, Math.min(u.a, 1.3), P.ink, { dy: -10, font: `600 11px ${P.fontMono}`, bg: P.surface });
    },
    [P, amp, top],
    { aspect: 3.2, maxHeight: 190, minHeight: 120 },
  );

  return (
    <Figure
      no={2}
      title="64개 표본의 스펙트럼"
      hint="신호를 바꾸고 잡음을 더해 보세요"
      caption={
        <>
          위는 한 구간에서 고르게 뽑은 표본 64개, 아래는 FFT로 구한 진폭 <M>{'2|X_m|/64'}</M>입니다. 진폭 A인 사인파 하나는 막대 하나의 높이 A로 나타나고, 진동수 m은 구간 안에서 몇 번 진동하는지입니다. 같은 X를 정의대로 곱셈 <M>{'64^2 = 4096'}</M>번에 계산한 결과와의 차이도 함께 보여 줍니다.
        </>
      }
    >
      <div className="ap2-stack">
        <div ref={sig.wrapRef} className="canvas-box" role="img" aria-label={`표본 ${NS}개의 그래프.`}>
          <canvas ref={sig.canvasRef} />
        </div>
        <div ref={spec.wrapRef} className="canvas-box" role="img" aria-label={`진폭 스펙트럼. 가장 큰 두 막대는 m = ${top[0].m}(${top[0].a.toFixed(3)})과 m = ${top[1].m}(${top[1].a.toFixed(3)})입니다.`}>
          <canvas ref={spec.canvasRef} />
        </div>
      </div>
      <div className="controls row" style={{ marginTop: 12 }}>
        <Seg value={kind} onChange={setKind} options={[{ value: 'two-tones', label: '두 음 (5, 12)' }, { value: 'square', label: '사각파 (4)' }, { value: 'chirp', label: '올라가는 음' }]} />
        <Slider id="ap2-noise" label="잡음의 표준편차" value={noise} min={0} max={1} step={0.05} onChange={setNoise} format={(v) => v.toFixed(2)} />
        <Button small onClick={() => setSeed((s) => s + 1)}>
          다른 잡음
        </Button>
      </div>
      <div className="readouts" style={{ marginTop: 10 }}>
        <Readout label="가장 큰 막대" value={`m=${top[0].m}, ${top[0].a.toFixed(3)}`} color="var(--accent)" />
        <Readout label="둘째 막대" value={`m=${top[1].m}, ${top[1].a.toFixed(3)}`} />
        <Readout label="정의대로: 곱셈" value={D.mults.toLocaleString('ko-KR')} />
        <Readout label="FFT: 곱셈" value={F.mults.toLocaleString('ko-KR')} color="var(--good)" />
        <Readout label="두 결과의 최대 차이" value={diff.toExponential(1)} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: flow past a cylinder, then a wing ─────────────── */

type FlowView = 'cyl' | 'foil';
const LEVELS = Array.from({ length: 33 }, (_, k) => -3.2 + k * 0.2);

function FlowFigure() {
  const P = usePalette();
  const [view, setView] = useState<FlowView>('cyl');
  const [gamma, setGamma] = useState(4);
  const [thick, setThick] = useState(0.1);
  const [camber, setCamber] = useState(0.1);
  const [alphaDeg, setAlphaDeg] = useState(5);
  const af: Airfoil = { cx: -thick, cy: camber, alpha: (alphaDeg * Math.PI) / 180, U: 1 };
  const kg = kuttaGamma(af);
  const R = airfoilRadius(af);
  const ch = useMemo(() => chord(af), [thick, camber]); // eslint-disable-line react-hooks/exhaustive-deps
  const flow = { U: 1, a: 1, gamma };
  const st = stagnation(flow);

  const cylSegs = useMemo(() => contours((x, y) => cylStream({ U: 1, a: 1, gamma }, x, y), -4.6, 4.6, -2.6, 2.6, 230, 130, LEVELS, (x, y) => x * x + y * y < 1).flat(), [gamma]);
  const foilSegs = useMemo(() => {
    const a: Airfoil = { cx: -thick, cy: camber, alpha: (alphaDeg * Math.PI) / 180, U: 1 };
    const rr = airfoilRadius(a), g = kuttaGamma(a);
    return contours((x, y) => airfoilStream(a, g, x, y), -4.4, 4.4, -3, 3, 220, 150, LEVELS, (x, y) => (x - a.cx) ** 2 + (y - a.cy) ** 2 < rr * rr).flat();
  }, [thick, camber, alphaDeg]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -3, xMax: 3, yMin: -2, yMax: 2, equal: true, pad: { l: 8, r: 8, t: 8, b: 8 } });
      p.clip();
      if (view === 'cyl') {
        drawSegments(p, cylSegs, alpha(P.ink2, 0.75));
        const c = p.ctx;
        c.fillStyle = P.surface2;
        c.strokeStyle = P.ink;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(p.X(0), p.Y(0), p.X(1) - p.X(0), 0, Math.PI * 2);
        c.fill();
        c.stroke();
        for (const s of st) p.dot(s[0], s[1], 5.5, P.bad, P.surface);
      } else {
        drawSegments(p, foilSegs, alpha(P.ink2, 0.75), 1.2, joukowski);
        const shape = airfoilShape(af);
        const c = p.ctx;
        c.fillStyle = P.surface2;
        c.strokeStyle = P.ink;
        c.lineWidth = 2;
        c.beginPath();
        shape.forEach((z, k) => (k ? c.lineTo(p.X(z[0]), p.Y(z[1])) : c.moveTo(p.X(z[0]), p.Y(z[1]))));
        c.closePath();
        c.fill();
        c.stroke();
        // the trailing edge, where the Kutta condition puts the rear stagnation point
        p.dot(2, 0, 5.5, P.bad, P.surface);
      }
      p.unclip();
      p.text(view === 'cyl' ? `Γ = ${gamma.toFixed(2)}` : `Γ = ${kg.toFixed(3)} (쿠타 조건)`, -2.95, 1.9, P.ink3, { align: 'left', base: 'top', font: `11px ${P.fontMono}`, bg: P.surface });
    },
    [P, view, cylSegs, foilSegs, st, gamma, kg, thick, camber, alphaDeg],
    { aspect: 1.5, maxHeight: 400 },
  );

  const top = cabs(cylVelocity(flow, [0, 1])), bottom = cabs(cylVelocity(flow, [0, -1]));
  const stAngle = st.length === 2 ? (Math.atan2(st[0][1], st[0][0]) * 180) / Math.PI : null;
  return (
    <Figure
      no={3}
      title="원기둥 둘레의 흐름과 그것을 휘어 만든 날개"
      hint="순환 Γ를 바꾸고, 날개로 바꿔 보세요"
      caption={
        view === 'cyl' ? (
          <>
            왼쪽에서 오른쪽으로 속력 1로 흐르는 물이 반지름 1인 원기둥을 지납니다. 선은 흐름선, 곧 복소 퍼텐셜 <M>{'w = z + 1/z + \\tfrac{i\\Gamma}{2\\pi}\\log z'}</M>의 허수부가 일정한 곡선이고, 빨간 점은 물이 멈추는 정체점입니다. Γ &gt; 0은 시계 방향으로 도는 흐름을 더한 것이라 위쪽은 빨라지고 아래쪽은 느려집니다.
          </>
        ) : (
          <>
            ζ 평면에서 중심이 <M>{'(-t, c)'}</M>이고 ζ = 1을 지나는 원 둘레의 흐름을 구한 뒤, 흐름선까지 통째로 주코프스키 변환 <M>{'z = \\zeta + 1/\\zeta'}</M>로 옮겼습니다. 원은 날개 모양이 되고 ζ = 1은 뾰족한 뒷전 z = 2(빨간 점)가 됩니다. 순환 Γ는 뒷전에서 흐름이 매끄럽게 떠나도록(쿠타 조건) 정했습니다.
          </>
        )
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={view === 'cyl' ? `원기둥 둘레의 흐름선, 순환 Γ = ${gamma.toFixed(2)}. 위쪽 속력 ${top.toFixed(3)}, 아래쪽 속력 ${bottom.toFixed(3)}.` : `주코프스키 날개 둘레의 흐름선. 받음각 ${alphaDeg}°, 순환 Γ = ${kg.toFixed(3)}.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg value={view} onChange={setView} options={[{ value: 'cyl', label: '원기둥' }, { value: 'foil', label: '날개' }]} />
          {view === 'cyl' ? (
            <>
              <Slider id="ap3-g" label="순환 Γ" value={gamma} min={0} max={16} step={0.25} onChange={setGamma} format={(v) => v.toFixed(2)} />
              <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <Readout label="꼭대기 속력" value={top.toFixed(3)} />
                <Readout label="바닥 속력" value={bottom.toFixed(3)} />
                <Readout label="정체점의 각도" value={stAngle === null ? '원 밖' : `${stAngle.toFixed(1)}°`} />
                <Readout label="4πUa" value={(4 * Math.PI).toFixed(2)} />
              </div>
            </>
          ) : (
            <>
              <Slider id="ap3-t" label="두께 t" value={thick} min={0} max={0.25} step={0.01} onChange={setThick} format={(v) => v.toFixed(2)} />
              <Slider id="ap3-c" label="휨 c" value={camber} min={0} max={0.25} step={0.01} onChange={setCamber} format={(v) => v.toFixed(2)} />
              <Slider id="ap3-a" label="받음각 α" value={alphaDeg} min={-5} max={15} step={1} onChange={setAlphaDeg} format={(v) => `${v}°`} />
              <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <Readout label="원의 반지름 R" value={R.toFixed(4)} />
                <Readout label="순환 Γ" value={kg.toFixed(3)} color="var(--accent)" />
                <Readout label="시위 길이" value={ch.toFixed(3)} />
                <Readout label="양력 계수 2Γ/(U·시위)" value={(2 * kg / ch).toFixed(3)} />
              </div>
            </>
          )}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: temperature in a disk, three ways ─────────────── */

type Method = 'conformal' | 'poisson' | 'relax';
const ISO = contours(tempConformal, -1, 1, -1, 1, 140, 140, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], (x, y) => x * x + y * y > 0.999).flat();

function DiskFigure() {
  const P = usePalette();
  const [method, setMethod] = useState<Method>('conformal');
  const [N, setN] = useState(41);
  const [sweeps, setSweeps] = useState(1000);
  const [probe, setProbe] = useState<C>([0, 0.5]);
  const plotRef = useRef<Plot | null>(null);
  const relaxed = useMemo(() => (method === 'relax' ? relaxDisk(N, sweeps) : null), [method, N, sweeps]);
  // the largest gap to the exact solution over grid points with r ≤ 0.9, from the grid already computed
  const relaxErr = useMemo(() => {
    if (!relaxed) return null;
    let worst = 0;
    for (let j = 0; j < relaxed.N; j++)
      for (let i = 0; i < relaxed.N; i++) {
        const x = -1 + (2 * i) / (relaxed.N - 1), y = -1 + (2 * j) / (relaxed.N - 1);
        if (!relaxed.inside[j * relaxed.N + i] || x * x + y * y > 0.81) continue;
        worst = Math.max(worst, Math.abs(relaxed.u[j * relaxed.N + i] - tempConformal(x, y)));
      }
    return worst;
  }, [relaxed]);

  const valueAt = (x: number, y: number, fine = false): number => {
    if (method === 'conformal') return tempConformal(x, y);
    if (method === 'poisson') return tempPoisson(x, y, fine ? 720 : 240);
    const r = relaxed!;
    const i = Math.round(((x + 1) / 2) * (r.N - 1)), j = Math.round(((y + 1) / 2) * (r.N - 1));
    return r.u[Math.max(0, Math.min(r.N - 1, j)) * r.N + Math.max(0, Math.min(r.N - 1, i))];
  };
  const probeVal = valueAt(probe[0], probe[1], true);
  const exact = tempConformal(probe[0], probe[1]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -1.15, xMax: 1.15, yMin: -1.15, yMax: 1.15, equal: true, pad: { l: 8, r: 8, t: 8, b: 8 } });
      plotRef.current = p;
      const cold = rgbOf(P.neg), hot = rgbOf(P.pos), bg = rgbOf(P.surface);
      p.heatmap((x, y) => {
        if (x * x + y * y >= 1) return [bg[0], bg[1], bg[2], 255];
        const u = Math.max(0, Math.min(1, valueAt(x, y)));
        return [cold[0] + (hot[0] - cold[0]) * u, cold[1] + (hot[1] - cold[1]) * u, cold[2] + (hot[2] - cold[2]) * u, 255];
      }, method === 'poisson' ? 6 : 3);
      drawSegments(p, ISO, alpha(P.ink, 0.55), 1.1);
      const c = p.ctx;
      c.lineWidth = 6;
      c.strokeStyle = P.pos;
      c.beginPath();
      c.arc(p.X(0), p.Y(0), p.X(1) - p.X(0), Math.PI, 2 * Math.PI);
      c.stroke();
      c.strokeStyle = P.neg;
      c.beginPath();
      c.arc(p.X(0), p.Y(0), p.X(1) - p.X(0), 0, Math.PI);
      c.stroke();
      p.dot(probe[0], probe[1], 7, P.ink, P.surface, 2.5);
    },
    [P, method, relaxed, probe],
    { aspect: 1, maxHeight: 380 },
  );

  useDrag(wrapRef, {
    hit: (x, y) => {
      const p = plotRef.current;
      if (!p) return null;
      return Math.hypot(x - p.X(probe[0]), y - p.Y(probe[1])) < 20 ? 'p' : null;
    },
    onDrag: (_, x, y) => {
      const p = plotRef.current;
      if (!p) return;
      let px = p.invX(x), py = p.invY(y);
      const r = Math.hypot(px, py);
      if (r > 0.95) {
        px *= 0.95 / r;
        py *= 0.95 / r;
      }
      setProbe([Math.round(px * 100) / 100, Math.round(py * 100) / 100]);
    },
  });

  return (
    <Figure
      no={4}
      title="반은 뜨겁고 반은 차가운 원판의 온도"
      hint="방법을 바꾸고, 검은 점을 끌어 온도를 재 보세요"
      caption={
        <>
          원판의 위쪽 테두리는 온도 1(주황), 아래쪽 테두리는 0(파랑)으로 고정했을 때 안쪽의 정상 상태 온도입니다. 가는 선은 등각 사상으로 구한 등온선 0.1, 0.2, …, 0.9로, 모두 z = −1과 z = 1을 지나는 원호입니다. 격자 완화는 원판을 덮는 N×N 격자에서 안쪽 점마다 네 이웃의 평균으로 바꾸기를 정해진 횟수만큼 되풀이한 결과입니다. 측정점은 원판 안 반지름 0.95까지 움직입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`원판 온도 분포. 측정점 (${probe[0]}, ${probe[1]})의 온도는 ${probeVal.toFixed(4)}, 정확한 값은 ${exact.toFixed(4)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg value={method} onChange={setMethod} options={[{ value: 'conformal', label: '등각 사상' }, { value: 'poisson', label: '푸아송 적분' }, { value: 'relax', label: '격자 완화' }]} />
          {method === 'relax' && (
            <>
              <Seg value={N} onChange={setN} options={[{ value: 21, label: '21×21' }, { value: 41, label: '41×41' }, { value: 81, label: '81×81' }]} />
              <Slider id="ap4-s" label="되풀이 횟수" value={sweeps} min={0} max={6000} step={100} onChange={setSweeps} format={(v) => v.toLocaleString('ko-KR')} />
            </>
          )}
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="측정점의 온도 (이 방법)" value={probeVal.toFixed(4)} color="var(--accent)" />
            <Readout label="등각 사상으로 구한 값" value={exact.toFixed(4)} />
            {method === 'relax' && <Readout label="최대 오차 (r ≤ 0.9)" value={relaxErr!.toFixed(4)} color={relaxErr! > 0.06 ? 'var(--bad)' : undefined} />}
          </div>
          <Legend items={[{ color: 'var(--pos)', label: '온도 1', shape: 'sq' }, { color: 'var(--neg)', label: '온도 0', shape: 'sq' }]} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Applications() {
  const counts = [64, 256, 1024, 4096].map((n) => ({ n, f: (n / 2) * Math.log2(n) }));
  return (
    <>
      <h2>원 위의 함수, 푸리에 급수</h2>
      <p>
        주기가 2π인 함수 f(θ)는 단위원 위의 함수로 볼 수 있습니다. <M>{'z = e^{i\\theta}'}</M>로 두면 단위원 근처에서 정칙인 함수의 로랑 급수 <M>{'\\sum c_n z^n'}</M>은 원 위에서 <M>{'\\sum c_n e^{in\\theta}'}</M>, 곧 <T en="Fourier series">푸리에 급수</T>가 됩니다. 계수는 <a href={lessonHref('math-complex-analysis', 'residues')}>앞 장</a>의 유수 계산 그대로입니다.
      </p>
      <MB>{'c_n = \\frac{1}{2\\pi i}\\oint_{|z|=1} \\frac{f(z)}{z^{n+1}}\\,dz = \\frac{1}{2\\pi}\\int_{-\\pi}^{\\pi} f(\\theta)\\, e^{-in\\theta}\\, d\\theta'}</MB>
      <p>
        실수 함수에서는 <M>{'c_{-n} = \\overline{c_n}'}</M>이라 두 항이 합쳐져 사인과 코사인이 됩니다. 높이가 ±1인 사각파는 홀수 n에 대해서만 <M>{'b_n = \\frac{4}{\\pi n}'}</M>인 사인 항을 갖고, <M>{'\\theta/\\pi'}</M>로 올라가는 톱니파는 <M>{'b_n = \\frac{2(-1)^{n+1}}{\\pi n}'}</M>입니다. 그림 1은 각 항을 복소 평면에서 진동수 n으로 도는 화살표로 그립니다.
      </p>
      <FourierFigure />
      <p>
        N = 9이면 사각파의 0이 아닌 항은 다섯 개이고 부분합의 최댓값은 1.18233입니다. N을 49까지 올려도 최댓값은 1.17911로 거의 줄지 않고, 뛰는 곳 쪽으로 다가가기만 합니다. 불연속점 근처에서 9%쯤 넘쳐 오르는 이 현상이 <a href={lessonHref('math-analysis', 'uniform-convergence')}>균등 수렴</a> 장에서 본 깁스 현상이고, 부분합이 사각파로 균등 수렴하지 않는다는 표시입니다. 톱니파도 마찬가지로 θ = ±π의 뛰는 곳 근처에서 넘쳐 오릅니다.
      </p>

      <h2>이산 푸리에 변환과 FFT</h2>
      <p>
        컴퓨터는 함수를 표본으로만 압니다. 한 주기에서 고르게 뽑은 n개의 표본 <M>{'x_0, \\dots, x_{n-1}'}</M>에 대해 적분을 합으로 바꾸면, 계수는 단위원 위의 n개 점, 곧 1의 n제곱근 <M>{'\\omega^k'}</M>(<M>{'\\omega = e^{2\\pi i/n}'}</M>)에서의 값만으로 정해집니다.
      </p>
      <MB>{'X_m = \\sum_{k=0}^{n-1} x_k\\, \\omega^{-mk}, \\qquad x_k = \\frac{1}{n}\\sum_{m=0}^{n-1} X_m\\, \\omega^{mk}'}</MB>
      <p>
        이것이 <T en="discrete Fourier transform">이산 푸리에 변환</T>입니다. 정의대로 계산하면 m마다 곱셈 n번, 모두 <M>{'n^2'}</M>번이 듭니다. <T en="fast Fourier transform">고속 푸리에 변환</T>(FFT)은 n이 2의 거듭제곱일 때 짝수 번째와 홀수 번째 표본으로 나누어, 각각의 길이 n/2 변환 E와 O를 구한 뒤 이렇게 합칩니다.
      </p>
      <MB>{'X_m = E_m + \\omega^{-m} O_m, \\qquad X_{m + n/2} = E_m - \\omega^{-m} O_m'}</MB>
      <p>
        두 번째 식은 <M>{'\\omega^{n/2} = -1'}</M>이라는 데서 나옵니다. 한 번 나눌 때마다 곱셈이 n/2번 들고 나누기를 <M>{'\\log_2 n'}</M>번 되풀이하므로 모두 <M>{'\\tfrac{n}{2}\\log_2 n'}</M>번입니다.
      </p>
      <SpectrumFigure />
      <p>
        두 음 신호는 진폭 1인 5번 진동과 진폭 0.5인 12번 진동을 더한 것입니다. 잡음이 없으면 막대가 정확히 1.0000과 0.5000이고, 표준편차 0.3인 잡음을 섞어도 가장 큰 두 막대는 m = 5(1.028)와 m = 12(0.524)로 그대로 보입니다. 잡음은 모든 진동수에 고르게 퍼지지만 진짜 음은 한 막대에 모이기 때문입니다. FFT는 곱셈 192번으로 정의대로의 4,096번과 소수점 열두 자리 이상 같은 답을 냅니다. n이 커질수록 차이가 벌어집니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>표본 수 n</th>
              <th>정의대로 n²</th>
              <th>FFT (n/2)·log₂n</th>
              <th>몇 배</th>
            </tr>
          </thead>
          <tbody>
            {counts.map(({ n, f }) => (
              <tr key={n}>
                <td className="num">{n.toLocaleString('ko-KR')}</td>
                <td className="num">{(n * n).toLocaleString('ko-KR')}</td>
                <td className="num">{f.toLocaleString('ko-KR')}</td>
                <td className="num">{((n * n) / f).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        음성 인식, 이미지 압축, 휴대폰 통신은 모두 이 변환을 1초에 수없이 되풀이하고, 그것이 가능한 것은 곱셈이 n²에서 n log n으로 줄었기 때문입니다. 1965년 쿨리와 튜키가 발표한 이 알고리즘은 20세기에 가장 널리 쓰인 알고리즘 가운데 하나로 꼽힙니다.
      </p>

      <h2>흐름을 복소수로 그리기</h2>
      <p>
        정칙 함수 <M>{'w = \\phi + i\\psi'}</M>의 실수부와 허수부는 모두 라플라스 방정식 <M>{'\\Delta u = u_{xx} + u_{yy} = 0'}</M>을 만족합니다. 소용돌이도 없고 압축되지도 않는 이상적인 유체의 흐름, 전하가 없는 곳의 전기 퍼텐셜, 정상 상태의 온도가 모두 이 방정식을 따르므로, 정칙 함수 하나로 이 문제들을 풀 수 있습니다.
      </p>
      <Proof title="정리. 정칙 함수의 실수부와 허수부는 조화 함수입니다">
        <p>
          <M>{'w = \\phi + i\\psi'}</M>가 정칙이고 <M>{'\\phi, \\psi'}</M>가 두 번 연속 미분 가능하다고 합시다(정칙 함수는 사실 무한 번 미분 가능합니다). 코시-리만 방정식 <M>{'\\phi_x = \\psi_y'}</M>, <M>{'\\phi_y = -\\psi_x'}</M>를 한 번 더 미분하면 <M>{'\\phi_{xx} = \\psi_{yx}'}</M>, <M>{'\\phi_{yy} = -\\psi_{xy}'}</M>이고, 섞인 편도함수는 순서와 상관없이 같으므로 <M>{'\\phi_{xx} + \\phi_{yy} = \\psi_{yx} - \\psi_{xy} = 0'}</M>입니다. 같은 방법으로 <M>{'\\psi_{xx} + \\psi_{yy} = -\\phi_{yx} + \\phi_{xy} = 0'}</M>입니다. <Qed />
        </p>
      </Proof>
      <p>
        흐름에서 φ를 속도 퍼텐셜, ψ를 흐름 함수라고 하고, w를 <T en="complex potential">복소 퍼텐셜</T>이라고 합니다. 속도는 <M>{"u - iv = w'(z)"}</M>이고, ψ가 일정한 곡선이 물이 따라가는 흐름선입니다. 균일한 흐름 <M>{'Uz'}</M>에 원기둥을 피해 가는 항 <M>{'Ua^2/z'}</M>과 원기둥 둘레를 도는 순환 항을 더하면
      </p>
      <MB>{'w(z) = U\\left(z + \\frac{a^2}{z}\\right) + \\frac{i\\Gamma}{2\\pi}\\log z'}</MB>
      <p>
        입니다. |z| = a 위에서 ψ가 일정하므로 원기둥 표면이 흐름선이 되고, 물이 원기둥을 뚫지 않습니다.
      </p>
      <FlowFigure />
      <p>
        Γ = 0이면 흐름이 위아래 대칭이고 정체점은 원기둥의 앞과 뒤입니다. Γ = 4이면 정체점이 −18.6°로 내려가고, 꼭대기 속력 2.637이 바닥 속력 1.363보다 빨라집니다. 베르누이 원리에 따라 빠른 쪽의 압력이 낮으므로 원기둥은 위로 밀립니다. 이 힘이 길이당 <M>{'\\rho U \\Gamma'}</M>라는 것이 <T en="Kutta–Joukowski theorem">쿠타-주코프스키 정리</T>이고, 회전하며 날아가는 공이 휘는 것도 같은 이유입니다. Γ가 <M>{'4\\pi U a \\approx 12.57'}</M>에 이르면 두 정체점이 바닥에서 만나고, 그보다 크면 원기둥 밖으로 떨어져 나갑니다.
      </p>
      <p>
        날개 보기에서는 <T en="Joukowski transform">주코프스키 변환</T> <M>{'z = \\zeta + 1/\\zeta'}</M>를 씁니다. 이 함수는 0이 아닌 곳에서 정칙이고 도함수가 ±1을 빼면 0이 아니라 각도를 보존하므로, ζ 평면의 흐름선을 그대로 옮겨도 여전히 흐름선입니다. ζ = 1을 지나는 원은 그 점에서 뾰족한 뒷전을 가진 날개가 되고, 뒷전에서 흐름이 날개를 돌아 올라가지 않으려면 순환이 <M>{'\\Gamma = 4\\pi U R \\sin(\\alpha + \\beta)'}</M>여야 합니다(β는 원의 중심이 위로 치우친 각). 기본 설정(두께 0.1, 휨 0.1, 받음각 5°)에서 Γ = 2.457, 시위 길이 4.034입니다. 받음각을 올리면 Γ와 양력이 함께 커지고, 휨이 0이고 받음각도 0인 대칭 날개는 Γ = 0이라 양력이 없습니다.
      </p>

      <h2>등각 사상으로 푸는 경계값 문제</h2>
      <p>
        조화 함수 u와 정칙 함수 g를 합성한 <M>{'u \\circ g'}</M>도 조화 함수입니다. u를 어떤 정칙 함수의 실수부로 쓰면 <M>{'u \\circ g'}</M>는 정칙 함수의 합성의 실수부이기 때문입니다. 그래서 어려운 모양의 영역을 등각 사상으로 쉬운 영역에 옮겨 거기서 풀고 다시 가져오면 됩니다.
      </p>
      <p>
        원판의 위쪽 반원을 1, 아래쪽 반원을 0으로 유지하는 문제를 봅시다. 뫼비우스 변환 <M>{'w = i\\frac{1 + z}{1 - z}'}</M>는 원판을 위쪽 반평면으로, 위쪽 반원을 음의 실수축으로, 아래쪽 반원을 양의 실수축으로 보냅니다. 위쪽 반평면에서 편각 <M>{'\\arg w'}</M>는 조화 함수이고 음의 실수축에서 π, 양의 실수축에서 0이므로
      </p>
      <MB>{'u(z) = \\frac{1}{\\pi}\\arg\\left(i\\,\\frac{1+z}{1-z}\\right)'}</MB>
      <p>
        가 답입니다. 원판에서 경계값으로 안쪽을 구하는 일반 공식인 <T en="Poisson integral">푸아송 적분</T>과 컴퓨터로 푸는 격자 완화를 그림 4에서 나란히 비교합니다.
      </p>
      <DiskFigure />
      <p>
        중심의 온도는 정확히 0.5이고, 측정점 (0, 0.5)에서는 0.7952입니다. 푸아송 적분도 소수점 넷째 자리까지 같은 값을 냅니다. 41×41 격자를 1,000번 완화하면 같은 점에서 0.7943으로 가깝지만, 반지름 0.9 안의 최대 오차는 0.0893이고 그 자리는 경계의 온도가 뛰는 z = −1 바로 옆 (−0.9, 0)입니다. 되풀이를 늘려도 이 오차는 줄지 않습니다. 격자가 원을 계단 모양으로 흉내 내는 한계이기 때문입니다. 격자를 21×21로 거칠게 하면 0.1804, 81×81로 촘촘하게 하면 3,000번 이상 되풀이한 뒤 0.0407이 되어, 격자 간격에 비례해 줄어듭니다. 81×81에서 1,000번만 되풀이하면 아직 수렴하지 않아 측정점이 0.7437에 머뭅니다. 등각 사상은 이런 문제를 공식 하나로 끝내고, 그 공식이 수치 방법을 검사하는 기준이 됩니다.
      </p>
      <Callout kind="key">
        단위원 위에서 로랑 급수는 푸리에 급수이고, 그 계수는 유수 계산과 같은 적분입니다. 1의 n제곱근에서 표본을 뽑으면 이산 푸리에 변환이 되고, FFT는 짝수와 홀수 표본으로 나누는 일을 되풀이해 곱셈을 n²에서 <M>{'\\tfrac{n}{2}\\log_2 n'}</M>으로 줄입니다. 정칙 함수의 실수부와 허수부는 조화 함수라서 흐름, 전기, 열을 복소 퍼텐셜 하나로 그릴 수 있고, 등각 사상은 조화 함수를 조화 함수로 옮기므로 원기둥의 흐름을 날개로, 반평면의 해를 원판으로 가져올 수 있습니다.
      </Callout>
      <Quiz
        q="표본 1,024개의 이산 푸리에 변환을 정의대로 계산하는 대신 FFT로 계산하면 복소수 곱셈이 대략 몇 분의 1로 줄어드나요?"
        options={['약 10분의 1', '약 200분의 1', '약 1,000분의 1', '약 2분의 1']}
        answer={1}
        explain={
          <>
            정의대로는 <M>{'1024^2 = 1{,}048{,}576'}</M>번, FFT는 <M>{'\\tfrac{1024}{2} \\cdot \\log_2 1024 = 512 \\cdot 10 = 5{,}120'}</M>번이라 약 204.8분의 1입니다. 표본 수가 네 배가 될 때마다 이 비율은 세 배 남짓 더 벌어집니다.
          </>
        }
      />
    </>
  );
}
