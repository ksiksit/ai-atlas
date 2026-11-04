import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import type { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { F_SHAPE, arrow, circlePts, label, lineThrough, plane, poly, tGrid, useLaColors } from './draw';
import { I2, ap, cross, det, diag, dot, ease, eig2, fromCols, inv, lerpMat, mul, nf, norm, scale, texM2, tn, tr, unit, type Mat2, type Vec2 } from './la';
import './linear.css';

const deg = (r: number) => (r * 180) / Math.PI;
/** Angle between the lines through a and b, in degrees (0..90). */
const lineAngle = (a: Vec2, b: Vec2) => {
  const na = norm(a);
  const nb = norm(b);
  if (na < 1e-9 || nb < 1e-9) return 0;
  return deg(Math.asin(Math.min(1, Math.abs(cross(a, b)) / (na * nb))));
};

/* ─────────────── Figure 1: find the directions where Av ∥ v ─────────────── */

const HUNT: { name: string; m: Mat2 }[] = [
  { name: '대칭', m: [2, 1, 1, 2] },
  { name: '위삼각', m: [1.5, 1, 0, 0.5] },
  { name: '부호가 다름', m: [1, 1.2, 1.2, -0.6] },
  { name: '밀기', m: [1, 1, 0, 1] },
  { name: '회전', m: [0.6, -0.8, 0.8, 0.6] },
];

function HuntFigure() {
  const P = usePalette();
  const [, C2, C3] = useLaColors(P);
  const [mi, setMi] = useState(0);
  const [th, setTh] = useState(20);
  const [sweeping, setSweeping] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  const plotRef = useRef<Plot | null>(null);
  const A = HUNT[mi].m;
  const v: Vec2 = [Math.cos((th * Math.PI) / 180), Math.sin((th * Math.PI) / 180)];
  const Av = ap(A, v);
  const ang = lineAngle(v, Av);
  const eig = eig2(A);
  const hit = ang < 1.5 && norm(Av) > 1e-6;
  const lam = dot(Av, v);
  const T = tr(A);
  const D = det(A);
  const disc = T * T - 4 * D;

  useAnimationFrame(
    (dt) => {
      setTh((x) => {
        const n = x + dt * 40;
        if (n >= 380) {
          setSweeping(false);
          return 20;
        }
        return n;
      });
    },
    sweeping && inView,
  );

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 3.4, { numbers: false });
      plotRef.current = plot;
      // the unit circle and its image (an ellipse)
      poly(plot, circlePts(1), I2, null, alpha(P.ink3, 0.7), 1);
      poly(plot, circlePts(1), A, alpha(C2, 0.08), alpha(C2, 0.6), 1.2);
      eig.forEach((e) => lineThrough(plot, e.v, alpha(C3, 0.85), 2, [7, 5]));
      // faint spokes: v → Av for 24 directions show how most vectors turn
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const p: Vec2 = [Math.cos(a), Math.sin(a)];
        const q = ap(A, p);
        plot.line(p[0], p[1], q[0], q[1], alpha(P.ink3, 0.35), 1);
      }
      arrow(plot, [0, 0], Av, hit ? P.good : P.pos, 3.2, 12);
      arrow(plot, [0, 0], v, P.neg, 3.2, 12);
      plot.dot(v[0], v[1], 7, P.surface, P.neg, 2.5);
      label(plot, 'v', v, P.neg, P, 10, 14);
      label(plot, hit ? `Av = ${tn(lam, 2)}v` : 'Av', Av, hit ? P.good : P.pos, P, 10, -14);
      if (hit) {
        ctx.save();
        ctx.strokeStyle = P.good;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(plot.X(v[0]), plot.Y(v[1]), 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },
    [P, A, th, hit],
    { aspect: 1.15, maxHeight: 460 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      const p = plotRef.current;
      if (!p) return null;
      const r = Math.hypot(x - p.X(0), y - p.Y(0)) / p.sx;
      return r > 0.5 && r < 1.6 ? 'v' : null;
    },
    onDrag: (_k, x, y) => {
      const p = plotRef.current!;
      setSweeping(false);
      let a = deg(Math.atan2(p.invY(y), p.invX(x)));
      if (a < 0) a += 360;
      // snap onto an eigen direction when close, so it can be found by hand
      for (const e of eig) {
        for (const s of [0, 180]) {
          let ea = deg(Math.atan2(e.v[1], e.v[0])) + s;
          ea = ((ea % 360) + 360) % 360;
          if (Math.abs(ea - a) < 2.5) a = ea;
        }
      }
      setTh(Math.round(a * 10) / 10);
    },
  });

  return (
    <Figure
      no={1}
      title="Av가 v와 나란해지는 방향 찾기"
      hint="원 위의 v를 끌어 돌리거나 한 바퀴 돌려 보세요"
      caption={<>파란 화살표 v는 길이 1인 단위 벡터이고, 주황 화살표가 Av입니다. 회색 선분은 원 위의 여러 점이 A로 어디로 가는지 보여 줍니다. 대부분은 옆으로 비껴가지만, 노란 점선 방향의 벡터는 같은 직선 위에 머뭅니다. 그 방향이 고유벡터이고, v와 Av가 겹치면 초록으로 바뀝니다.</>}
    >
      <div className="controls row">
        <Seg label="행렬" value={mi} onChange={(i) => { setMi(i); setSweeping(false); }} options={HUNT.map((h, i) => ({ value: i, label: h.name }))} />
      </div>
      <div className="fig-split" ref={box}>
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`행렬 ${HUNT[mi].name}. v의 각도 ${Math.round(th % 360)}도, v와 Av 사이 각 ${nf(ang, 1)}도. ${eig.length ? `고유벡터 방향 ${eig.map((e) => `${Math.round(((deg(Math.atan2(e.v[1], e.v[0])) % 180) + 180) % 180)}도(λ = ${nf(e.l, 2)})`).join(', ')}` : '실수 고유벡터 없음'}.`} />
        </div>
        <div className="controls">
          <div className="la-tex">
            <M>{`A = ${texM2(A, 2)}`}</M>
          </div>
          <Slider id="hu-th" label="v의 방향" value={Math.round(th % 360)} min={0} max={359} step={1} onChange={(x) => { setSweeping(false); setTh(x); }} format={(x) => `${x}°`} />
          <Button small primary onClick={() => (prefersReducedMotion() ? setTh(20) : (setTh(20), setSweeping(true)))}>
            ▶ v를 한 바퀴 돌리기
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="v와 Av 사이 각" value={`${nf(ang, 1)}°`} color={hit ? 'var(--good)' : undefined} />
            <Readout label="|Av| / |v|" value={nf(norm(Av), 2)} />
          </div>
          <div className="la-status" data-tone={hit ? 'good' : eig.length ? '' : 'bad'} aria-live="polite">
            {hit ? (
              <>
                <strong>고유벡터입니다.</strong> Av = {nf(lam, 2)}·v{lam < 0 ? ' (방향이 반대로 뒤집힘)' : ''}.
              </>
            ) : eig.length === 0 ? (
              <>이 행렬은 모든 방향을 돌려 버려서 실수 고유벡터가 없습니다.</>
            ) : (
              <>노란 점선 위로 v를 가져가 보세요.</>
            )}
          </div>
          <div className="la-tex">
            <M>{`\\lambda^2 - ${tn(T, 2)}\\lambda + ${tn(D, 2)} = 0`.replace('+ -', '- ').replace('- -', '+ ')}</M>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="판별식 tr² − 4det" value={nf(disc, 2)} color={disc < -1e-9 ? 'var(--bad)' : undefined} />
            <Readout label="고윳값 λ" value={eig.length ? (eig.length === 2 ? eig.map((e) => nf(e.l, 2)).join(', ') : `${nf(eig[0].l, 2)} (중근)`) : '실수 없음'} color="var(--c-math-3)" />
          </div>
        </div>
      </div>
      <Legend items={[{ color: P.neg, label: 'v', shape: 'ln' }, { color: P.pos, label: 'Av', shape: 'ln' }, { color: C3, label: '고유벡터 방향', shape: 'ln' }, { color: C2, label: '단위원의 상(타원)', shape: 'ln' }]} />
    </Figure>
  );
}

/* ─────────────── Figure 2: the power method ─────────────── */

const E1: Vec2 = unit([Math.cos(0.5), Math.sin(0.5)]);
const E2: Vec2 = unit([Math.cos(1.95), Math.sin(1.95)]);

function PowerFigure() {
  const P = usePalette();
  const [C1, , C3] = useLaColors(P);
  const [ratio, setRatio] = useState(0.6);
  const [start, setStart] = useState(150);
  const K = 16;
  const Pm = fromCols(E1, E2);
  const A = mul(mul(Pm, diag(1.5, 1.5 * ratio)), inv(Pm)!);
  const xs = useMemo(() => {
    const out: Vec2[] = [];
    let x: Vec2 = [Math.cos((start * Math.PI) / 180), Math.sin((start * Math.PI) / 180)];
    for (let k = 0; k <= K; k++) {
      out.push(x);
      x = unit(ap(A, x));
    }
    return out;
  }, [A, start]);
  const s = useStepper(K + 1, 2, `${ratio}|${start}`);
  const errs = xs.map((x) => lineAngle(x, E1));
  const cur = xs[s.i];
  const rq = dot(ap(A, cur), cur); // Rayleigh quotient: estimate of λ₁

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 1.5, { numbers: false, step: 0.5 });
      poly(plot, circlePts(1), I2, null, alpha(P.ink3, 0.6), 1);
      lineThrough(plot, E1, alpha(C3, 0.9), 2, [7, 5]);
      lineThrough(plot, E2, alpha(P.ink3, 0.6), 1.5, [3, 4]);
      for (let k = 0; k <= s.i; k++) {
        const a = k === s.i ? 1 : 0.15 + (0.5 * k) / Math.max(1, s.i);
        arrow(plot, [0, 0], xs[k], alpha(k === s.i ? C1 : P.neg, a), k === s.i ? 3 : 1.6, k === s.i ? 12 : 8);
      }
      label(plot, `x${String(s.i).split('').map((ch) => '₀₁₂₃₄₅₆₇₈₉'[+ch]).join('')}`, cur, C1, P, 10, -14);
      label(plot, `λ₁ = 1.5`, scale(E1, 1.35), C3, P, 6, 12);
      label(plot, `λ₂ = ${tn(1.5 * ratio, 2)}`, scale(E2, -1.3), P.ink3, P, 6, 12);
    },
    [P, xs, s.i, ratio],
    { aspect: 1.15, maxHeight: 420 },
  );

  const chart = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 34, r: 8, t: 10, b: 20 };
      const bw = (w - pad.l - pad.r) / (K + 1);
      const Y = (deg: number) => pad.t + (1 - Math.log10(Math.max(1e-3, deg) * 1000) / Math.log10(90 * 1000)) * (h - pad.t - pad.b);
      ctx.font = `10px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of [90, 1, 0.01]) {
        ctx.fillText(`${v}°`, pad.l - 4, Y(v));
        ctx.strokeStyle = P.grid;
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(v));
        ctx.lineTo(w - pad.r, Y(v));
        ctx.stroke();
      }
      errs.forEach((e, k) => {
        ctx.fillStyle = k === s.i ? C1 : k < s.i ? alpha(P.neg, 0.55) : alpha(P.ink3, 0.18);
        const y = Y(e);
        ctx.fillRect(pad.l + k * bw + 1, y, bw - 2, h - pad.b - y);
      });
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let k = 0; k <= K; k += 4) ctx.fillText(String(k), pad.l + (k + 0.5) * bw, h - pad.b + 4);
    },
    [P, errs, s.i],
    { height: 120, minHeight: 100 },
  );

  return (
    <Figure
      no={2}
      title="같은 변환을 거듭하면: 거듭제곱법"
      hint="▶로 한 번씩 A를 곱해 보세요"
      caption={<>매 단계 x에 A를 곱하고 길이를 1로 맞춥니다. 노란 점선이 가장 큰 고윳값 λ₁의 고유벡터, 회색 점선이 λ₂의 고유벡터입니다. 곱할 때마다 λ₁ 방향 성분은 λ₁배, λ₂ 방향 성분은 λ₂배가 되니 비율 |λ₂/λ₁|이 작을수록 x가 빨리 노란 직선으로 끌려갑니다. 아래 막대는 단계마다 노란 직선과의 각도(로그 눈금)입니다.</>}
    >
      <div className="fig-split">
        <div className="la-panel">
          <div ref={wrapRef} className="canvas-box">
            <canvas ref={canvasRef} role="img" aria-label={`거듭제곱법 ${s.i}단계: x와 지배적 고유벡터 사이 각 ${nf(errs[s.i], 2)}도. 고윳값 비 ${nf(ratio, 2)}.`} />
          </div>
          <div ref={chart.wrapRef} className="canvas-box">
            <canvas ref={chart.canvasRef} role="img" aria-label={`단계별 오차 막대그래프: ${errs.map((e) => nf(e, 2)).join(', ')}도`} />
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="pw-speed" maxSpeed={8} />
          <Slider id="pw-r" label="고윳값 비 λ₂ / λ₁" value={ratio} min={-0.9} max={0.95} step={0.05} onChange={setRatio} format={(v) => nf(v, 2)} />
          <Slider id="pw-s" label="시작 방향 x₀" value={start} min={0} max={359} step={1} onChange={setStart} format={(v) => `${v}°`} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="고유벡터와의 각" value={`${nf(errs[s.i], errs[s.i] < 0.1 ? 4 : 2)}°`} color={errs[s.i] < 0.5 ? 'var(--good)' : undefined} />
            <Readout label="λ₁ 추정 xᵀAx" value={nf(rq, 4)} />
          </div>
          <div className="la-note" aria-live="polite">
            {ratio < 0 ? <>λ₂가 음수라 x가 노란 직선의 양쪽을 번갈아 오가며 다가갑니다.</> : Math.abs(ratio) > 0.85 ? <>두 고윳값이 비슷하면 수렴이 아주 느립니다. 단계마다 오차가 겨우 {nf(Math.abs(ratio), 2)}배로 줄어듭니다.</> : <>단계마다 각도 오차가 약 {nf(Math.abs(ratio), 2)}배로 줄어듭니다.</>}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: A = P D P⁻¹ as three moves ─────────────── */

const DP: Mat2 = fromCols([2, 1], [-1, 1]);
const DPi = inv(DP)!;
const L1 = 1.5;
const L2 = 0.6;

function DiagFigure() {
  const P = usePalette();
  const [C1, , C3] = useLaColors(P);
  const [t, setT] = useState(3);
  const [k, setK] = useState(1);
  const [playing, setPlaying] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  const Dk = diag(Math.pow(L1, k), Math.pow(L2, k));
  const s1 = DPi;
  const s2 = mul(Dk, DPi);
  const s3 = mul(DP, s2);
  const Mt = t <= 1 ? lerpMat(I2, s1, ease(t)) : t <= 2 ? lerpMat(s1, s2, ease(t - 1)) : lerpMat(s2, s3, ease(t - 2));
  const Ak = s3;

  useAnimationFrame(
    (dt) =>
      setT((x) => {
        const n = x + dt * 0.75;
        if (n >= 3) {
          setPlaying(false);
          return 3;
        }
        return n;
      }),
    playing && inView,
  );

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 3.6, { numbers: false });
      // the eigen-grid: lines along the eigenvectors, carried by the current map
      tGrid(plot, mul(Mt, DP), alpha(C3, 0.4), 1, 10);
      poly(plot, F_SHAPE.map((p) => scale(p, 1.6) as Vec2), Mt, alpha(C1, 0.35), C1, 1.6);
      arrow(plot, [0, 0], ap(Mt, [2, 1]), P.neg, 3, 11);
      arrow(plot, [0, 0], ap(Mt, [-1, 1]), P.pos, 3, 11);
    },
    [P, Mt],
    { aspect: 1.2, maxHeight: 420 },
  );

  const stage = t < 0.01 ? '시작' : t <= 1 ? '① P⁻¹: 고유벡터를 좌표축으로' : t <= 2 ? `② D${k > 1 ? `^${k}` : ''}: 축 방향으로 늘이기` : '③ P: 원래 방향으로 되돌리기';
  return (
    <Figure
      no={3}
      title="대각화: 고유벡터의 눈으로 보면 늘이기뿐"
      hint="재생하거나 진행 슬라이더를 끌어 보세요"
      caption={<>노란 격자는 두 고유벡터(파랑, 주황) 방향으로 그린 격자입니다. ① P⁻¹이 이 격자를 보통의 가로세로 격자로 펴고, ② 대각행렬 D가 가로를 λ₁ = 1.5배, 세로를 λ₂ = 0.6배로 늘이고 줄인 뒤, ③ P가 원래의 비스듬한 방향으로 되돌립니다. 셋을 이은 결과가 A입니다. k를 올리면 가운데 단계만 D<sup>k</sup>로 바뀌어 Aᵏ이 됩니다.</>}
    >
      <div className="fig-split" ref={box}>
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} role="img" aria-label={`대각화 애니메이션. 현재 단계: ${stage}. A의 ${k}제곱 = (${nf(Ak[0])}, ${nf(Ak[1])}; ${nf(Ak[2])}, ${nf(Ak[3])}).`} />
        </div>
        <div className="controls">
          <Slider id="dg-t" label={`진행: ${stage}`} value={t} min={0} max={3} step={0.01} onChange={(v) => { setPlaying(false); setT(v); }} format={(v) => nf(v, 2)} />
          <Button primary onClick={() => (prefersReducedMotion() ? setT(3) : (setT(0), setPlaying(true)))}>
            ▶ 세 단계 재생
          </Button>
          <Slider id="dg-k" label="거듭제곱 k (Aᵏ)" value={k} min={1} max={6} step={1} onChange={(v) => { setK(v); setT(3); }} format={(v) => `k = ${v}`} />
          <div className="la-tex">
            <M>{`A${k > 1 ? `^{${k}}` : ''} = P\\,${texM2(Dk, 2)}\\,P^{-1}`}</M>
          </div>
          <div className="la-tex">
            <M>{`= ${texM2(Ak, 2)}`}</M>
          </div>
          <div className="la-note">
            D<sup>k</sup>는 대각 성분만 k제곱하면 되니 행렬 곱을 k번 할 필요가 없습니다. k가 커지면 0.6<sup>k</sup>는 사라지고 1.5<sup>k</sup>만 남아, Aᵏ은 거의 λ₁ 방향으로만 늘이는 행렬이 됩니다.
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: PageRank on five pages ─────────────── */

const PAGES = ['A', 'B', 'C', 'D', 'E'];
const POS: Vec2[] = [
  [80, 60],
  [250, 50],
  [320, 170],
  [180, 230],
  [50, 180],
];
const LINKS0: boolean[][] = [
  [false, true, true, false, false],
  [false, false, true, false, false],
  [true, false, false, false, false],
  [false, false, true, false, true],
  [true, false, false, true, false],
];

function pagerank(L: boolean[][], d: number, iters: number): number[][] {
  const n = L.length;
  let r = new Array(n).fill(1 / n);
  const out = [r];
  for (let it = 0; it < iters; it++) {
    const next = new Array(n).fill((1 - d) / n);
    for (let i = 0; i < n; i++) {
      const outs = L[i].map((x, j) => (x ? j : -1)).filter((j) => j >= 0);
      // a page with no links spreads its vote over every page
      if (!outs.length) for (let j = 0; j < n; j++) next[j] += (d * r[i]) / n;
      else for (const j of outs) next[j] += (d * r[i]) / outs.length;
    }
    r = next;
    out.push(r);
  }
  return out;
}

function PageRankFigure() {
  const [L, setL] = useState<boolean[][]>(LINKS0);
  const [d, setD] = useState(0.85);
  const ITERS = 30;
  const hist = useMemo(() => pagerank(L, d, ITERS), [L, d]);
  const s = useStepper(ITERS + 1, 3, `${JSON.stringify(L)}|${d}`, true);
  const r = hist[s.i];
  const change = s.i > 0 ? hist[s.i].reduce((acc, v, i) => acc + Math.abs(v - hist[s.i - 1][i]), 0) : NaN;
  const order = r.map((v, i) => [v, i] as [number, number]).sort((a, b) => b[0] - a[0]);
  const toggle = (i: number, j: number) => setL((m) => m.map((row, a) => row.map((v, b) => (a === i && b === j ? !v : v))));
  const raw = 'pr';

  return (
    <Figure
      no={4}
      title="페이지 순위는 고유벡터다"
      hint="링크 표의 칸을 눌러 링크를 바꾸고, ▶로 반복해 보세요"
      caption={<>원의 크기가 페이지의 순위(점수)입니다. 처음에는 모두 1/5에서 시작해, 단계마다 각 페이지가 자기 점수의 d만큼을 나가는 링크들에 똑같이 나눠 주고, 나머지 1 − d는 모든 페이지에 고르게 돌아갑니다. 몇 번 반복하면 점수가 더 이상 변하지 않는데, 그 점수 벡터가 링크 행렬의 고윳값 1에 대한 고유벡터입니다.</>}
    >
      <div className="fig-split">
        <svg viewBox="0 0 370 280" className="la-graph" role="img" aria-label={`다섯 페이지의 링크 그래프와 ${s.i}번 반복 후의 순위: ${order.map(([v, i]) => `${PAGES[i]} ${nf(v, 3)}`).join(', ')}`}>
          <defs>
            <marker id={`${raw}-ah`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="ah" />
            </marker>
          </defs>
          {L.map((row, i) =>
            row.map((on, j) => {
              if (!on) return null;
              const [x1, y1] = POS[i];
              const [x2, y2] = POS[j];
              const dx = x2 - x1;
              const dy = y2 - y1;
              const len = Math.hypot(dx, dy);
              const ux = dx / len;
              const uy = dy / len;
              const r1 = 12 + 60 * r[i];
              const r2 = 12 + 60 * r[j] + 3;
              const bend = L[j][i] ? 12 : 0;
              const mx = (x1 + x2) / 2 - uy * bend;
              const my = (y1 + y2) / 2 + ux * bend;
              return <path key={`${i}-${j}`} d={`M${x1 + ux * r1} ${y1 + uy * r1} Q${mx} ${my} ${x2 - ux * r2} ${y2 - uy * r2}`} className="edge" markerEnd={`url(#${raw}-ah)`} />;
            }),
          )}
          {POS.map(([x, y], i) => (
            <g key={i} className="node" transform={`translate(${x} ${y})`}>
              <circle r={12 + 60 * r[i]} style={{ fill: `color-mix(in srgb, var(--c-math-3) ${Math.round(15 + 120 * r[i])}%, var(--surface))` }} />
              <text dy={12 + 60 * r[i] < 24 ? '0.35em' : '-0.1em'}>{PAGES[i]}</text>
              <text className="rk" dy={12 + 60 * r[i] < 24 ? 12 + 60 * r[i] + 12 : '1.2em'}>
                {nf(r[i], 3)}
              </text>
            </g>
          ))}
        </svg>
        <div className="controls">
          <StepControls s={s} id="pr-speed" maxSpeed={10} />
          <Slider id="pr-d" label="감쇠 계수 d" value={d} min={0.5} max={0.99} step={0.01} onChange={setD} format={(v) => nf(v, 2)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="1위" value={`${PAGES[order[0][1]]} (${nf(order[0][0], 3)})`} color="var(--c-math-3)" />
            <Readout label="직전 단계와의 차이" value={isNaN(change) ? '—' : change < 1e-4 ? '< 0.0001' : nf(change, 4)} color={change < 1e-4 ? 'var(--good)' : undefined} />
          </div>
        </div>
      </div>
      <div className="la-scroll">
        <table className="la-linkgrid" aria-label="링크 표: 행이 출발 페이지, 열이 도착 페이지">
          <thead>
            <tr>
              <th>출발 → 도착</th>
              {PAGES.map((p) => (
                <th key={p}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {L.map((row, i) => (
              <tr key={i}>
                <th>{PAGES[i]}</th>
                {row.map((on, j) => (
                  <td key={j}>
                    <button type="button" aria-pressed={on} disabled={i === j} aria-label={`${PAGES[i]}에서 ${PAGES[j]}로 가는 링크`} onClick={() => toggle(i, j)}>
                      {i === j ? '' : on ? '●' : ''}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="btn-row">
        <Button small onClick={() => setL(LINKS0)}>
          처음 링크로
        </Button>
        <Button small onClick={() => setL((m) => m.map((row, i) => row.map((_, j) => i !== j && j === 3)))}>
          모두 D로 링크
        </Button>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Eigen() {
  const [showFib, setShowFib] = useState(false);
  return (
    <>
      <h2>방향을 지키는 벡터</h2>
      <p>
        행렬로 평면을 변환하면 대부분의 벡터는 방향이 바뀝니다. 그런데 어떤 특별한 방향의 벡터는 변환 뒤에도 원래 직선 위에 그대로 있고, 길이만 몇 배가 됩니다. 그런 벡터를 <T en="eigenvector">고유벡터</T>, 그 배율을 <T en="eigenvalue">고윳값</T>이라고 합니다. "eigen"은 독일어로 "자기 자신의"라는 뜻입니다.
      </p>
      <MB note="v는 0이 아닌 벡터, λ(람다)는 스칼라입니다. 행렬을 곱한 결과가 v의 상수배라는 뜻입니다.">{'A\\mathbf v = \\lambda \\mathbf v, \\qquad \\mathbf v \\ne \\mathbf 0'}</MB>
      <p>
        <a href={lessonHref('ai-basics', 'matrices')}>기초 인공지능</a>에서 고유벡터를 점선으로 잠깐 보았습니다. 이 장에서는 그 방향을 직접 찾고, 계산하고, 왜 그렇게 중요한지 봅니다. 먼저 손으로 찾아봅시다.
      </p>
      <HuntFigure />
      <p>
        그림 1의 "대칭" 행렬에서는 45°와 135° 방향에서 v와 Av가 겹칩니다. 45° 방향에서는 3배로 늘어나고, 135° 방향에서는 그대로(1배)입니다. "부호가 다름"에서는 한쪽 고유벡터가 반대 방향을 가리키게 되는데, 고윳값이 음수라는 뜻입니다. 같은 직선 위에 있기만 하면 되므로 뒤집혀도 고유벡터입니다. "밀기"는 고유 방향이 가로 하나뿐이고, "회전"은 모든 방향을 돌려 버려서 실수 고유벡터가 아예 없습니다.
      </p>

      <h2>특성방정식으로 계산하기</h2>
      <p>
        손으로 돌려 찾는 대신 계산할 수 있습니다. <M>{'A\\mathbf v = \\lambda\\mathbf v'}</M>를 옮기면 <M>{'(A - \\lambda I)\\mathbf v = \\mathbf 0'}</M>입니다. 0이 아닌 v가 0으로 보내진다는 것은 <a href={lessonHref('math-linear-algebra', 'determinants')}>4장</a>의 말로 행렬 <M>{'A - \\lambda I'}</M>의 영공간이 원점뿐이 아니라는 뜻이고, 그러면 행렬식이 0이어야 합니다.
      </p>
      <MB note="I는 단위행렬입니다. 2×2 행렬이면 λ에 대한 이차방정식이 되고, 이것을 특성방정식이라고 합니다.">{'\\det(A - \\lambda I) = \\det\\begin{pmatrix} a - \\lambda & b \\\\ c & d - \\lambda \\end{pmatrix} = \\lambda^2 - (a + d)\\lambda + (ad - bc) = 0'}</MB>
      <p>
        <M>{'a + d'}</M>는 대각선 성분의 합인 <T en="trace">대각합</T> <M>{'\\operatorname{tr} A'}</M>이고, <M>{'ad - bc'}</M>는 행렬식입니다. 그래서 두 고윳값의 합은 대각합, 곱은 행렬식입니다. 대칭 행렬 <M>{'\\begin{pmatrix} 2 & 1 \\\\ 1 & 2 \\end{pmatrix}'}</M>이라면 <M>{'\\lambda^2 - 4\\lambda + 3 = (\\lambda - 3)(\\lambda - 1) = 0'}</M>이라 λ = 3, 1입니다. 각 λ를 다시 <M>{'(A - \\lambda I)\\mathbf v = \\mathbf 0'}</M>에 넣고 3장의 소거로 풀면 고유벡터 (1, 1)과 (1, −1)이 나옵니다. 그림 1의 45°, 135°입니다.
      </p>
      <Callout kind="note">
        이차방정식의 판별식 <M>{'(\\operatorname{tr}A)^2 - 4\\det A'}</M>가 음수이면 고윳값이 복소수가 되고, 실수 고유벡터가 없습니다. 회전 행렬이 그렇습니다. 복소수 고윳값의 크기는 늘이는 배율, 각도는 회전각을 나타냅니다. 반대로 <T en="symmetric matrix">대칭 행렬</T>(<M>{'A = A^{\\mathsf T}'}</M>)의 고윳값은 언제나 실수이고 고유벡터들은 서로 직각입니다. 이 사실은 다음 장의 주성분 분석에서 핵심이 됩니다.
      </Callout>

      <h2>거듭 곱하면 어디로 가는가</h2>
      <p>
        고유벡터가 정말 빛나는 것은 같은 변환을 여러 번 할 때입니다. 아무 벡터 x를 두 고유벡터의 선형결합 <M>{'\\mathbf x = c_1\\mathbf v_1 + c_2\\mathbf v_2'}</M>로 쓰면, A를 k번 곱한 결과는 계산할 필요도 없이 적을 수 있습니다.
      </p>
      <MB note="λ₁이 가장 큰 고윳값이면 k가 커질수록 (λ₂/λ₁)ᵏ → 0이라 둘째 항이 사라집니다.">{'A^k\\mathbf x = c_1\\lambda_1^k\\mathbf v_1 + c_2\\lambda_2^k\\mathbf v_2 = \\lambda_1^k\\left(c_1\\mathbf v_1 + c_2\\left(\\tfrac{\\lambda_2}{\\lambda_1}\\right)^{k}\\mathbf v_2\\right)'}</MB>
      <p>
        그래서 아무 벡터에서 시작해 A를 계속 곱하고 길이만 맞춰 주면, 결국 가장 큰 고윳값의 고유벡터 방향으로 끌려갑니다. 이 단순한 알고리즘이 <T en="power method">거듭제곱법</T>입니다.
      </p>
      <PowerFigure />
      <Code label="거듭제곱법">{`
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

// 가장 큰 고윳값과 그 고유벡터를 찾는다 (A는 n×n 배열)
function powerMethod(A, iters = 100) {
  const n = A.length;
  let x = new Array(n).fill(1);              // 아무 시작 벡터
  let lambda = 0;
  for (let k = 0; k < iters; k++) {
    // y = A x
    const y = A.map((row) => dot(row, x));
    lambda = dot(y, x) / dot(x, x);          // xᵀAx / xᵀx
    const len = Math.sqrt(dot(y, y));
    x = y.map((v) => v / len);               // 길이를 1로
  }
  return { lambda, x };
}

powerMethod([[2, 1], [1, 2]]); // λ ≈ 3, x ≈ [0.707, 0.707]`}</Code>

      <h2>대각화: 가장 좋은 기저</h2>
      <p>
        고유벡터가 기저를 이룰 만큼 충분하면(2×2에서는 독립인 고유벡터 두 개), 그 기저에서 A는 축 방향으로 늘이기만 하는 대각행렬이 됩니다. 고유벡터를 열로 모은 행렬을 P, 고윳값을 대각선에 놓은 행렬을 D라고 하면 다음이 성립합니다.
      </p>
      <MB note="P⁻¹: 고유벡터 좌표로 바꾸기, D: 각 축을 고윳값만큼 늘이기, P: 원래 좌표로 돌아오기. 오른쪽부터 차례로 적용합니다.">{'A = P D P^{-1}, \\qquad A^k = P D^k P^{-1}'}</MB>
      <DiagFigure />
      <p>
        이것이 <T en="diagonalization">대각화</T>입니다. <a href={lessonHref('math-linear-algebra', 'vectors')}>1장</a>에서 "문제에 맞는 기저를 고르면 계산이 쉬워진다"고 했는데, 선형변환에 가장 잘 맞는 기저가 바로 고유벡터입니다. 그 기저에서는 복잡해 보이던 변환이 축마다 따로 늘이는 일로 쪼개집니다. "밀기"처럼 고유벡터가 모자라 대각화할 수 없는 행렬도 있지만, 대칭 행렬은 언제나 직각인 고유벡터로 대각화됩니다.
      </p>
      <Callout kind="intuition">
        피보나치 수열 <M>{'F_{k+1} = F_k + F_{k-1}'}</M>도 행렬을 거듭 곱하는 일입니다: <M>{'\\begin{pmatrix} F_{k+1} \\\\ F_k \\end{pmatrix} = \\begin{pmatrix} 1 & 1 \\\\ 1 & 0 \\end{pmatrix}\\begin{pmatrix} F_k \\\\ F_{k-1} \\end{pmatrix}'}</M>.{' '}
        {showFib ? (
          <>
            이 행렬의 고윳값은 <M>{'\\frac{1 \\pm \\sqrt 5}{2}'}</M>, 즉 1.618…(황금비 φ)과 −0.618…입니다. 두 번째 고윳값은 크기가 1보다 작아 거듭할수록 사라지므로, 이웃한 피보나치 수의 비 <M>{'F_{k+1}/F_k'}</M>는 φ로 수렴하고 <M>{'F_k'}</M>는 대략 <M>{'\\varphi^k/\\sqrt 5'}</M>입니다.
          </>
        ) : (
          <>
            그렇다면 <M>{'F_{k+1}/F_k'}</M>는 어디로 갈까요?{' '}
            <button type="button" className="btn small" onClick={() => setShowFib(true)}>
              답 보기
            </button>
          </>
        )}
      </Callout>

      <h2>웹 페이지 순위는 고유벡터</h2>
      <p>
        구글 초창기의 <T en="PageRank">페이지랭크</T>는 "중요한 페이지가 많이 가리키는 페이지가 중요하다"는 순환적인 정의에서 출발합니다. 페이지마다 점수를 매기고, 각 페이지가 자기 점수를 나가는 링크들에 똑같이 나눠 준다고 합시다. 받은 점수의 합이 다시 그 페이지의 점수가 되어야 하니, 점수 벡터 r은 링크 행렬 M에 대해 <M>{'M\\mathbf r = \\mathbf r'}</M>, 즉 <strong>고윳값 1의 고유벡터</strong>입니다.
      </p>
      <p>
        실제로는 링크가 없는 페이지나 빠져나올 수 없는 고리 때문에 계산이 막히지 않도록, 사용자가 확률 d로 링크를 따라가고 1 − d로 아무 페이지로나 순간이동한다고 봅니다. 그러면 행렬의 모든 성분이 양수가 되어 고유벡터가 하나로 정해지고, 거듭제곱법으로 구할 수 있습니다. 수십억 개 페이지에서도 곱셈 수십 번이면 충분합니다.
      </p>
      <PageRankFigure />
      <p>
        그림 4에서 C는 A, B, D 세 페이지의 링크를 받아 1위가 되고, C가 유일하게 링크하는 A도 덩달아 점수가 높습니다. 링크를 바꿔 보면 반복 몇 번 만에 새 순위로 자리 잡습니다. 사용자가 페이지 사이를 무작위로 옮겨 다닌다고 보면 순위는 "오래 돌아다닌 뒤 각 페이지에 있을 확률"이기도 합니다. 이렇게 확률이 다음 상태로 옮겨 가는 과정을 <a href={lessonHref('math-probability', 'markov')}>마르코프 체인</a>이라고 하고, 그 정상 분포가 바로 고윳값 1의 고유벡터입니다.
      </p>
      <Callout kind="key">
        고유벡터는 변환 뒤에도 같은 직선 위에 남는 방향이고, 고윳값은 그 방향의 배율입니다. 고윳값은 특성방정식 <M>{'\\det(A - \\lambda I) = 0'}</M>의 해이고, 합은 대각합, 곱은 행렬식입니다. 고유벡터를 기저로 쓰면 A는 대각행렬이 되어 거듭제곱이 쉬워지고, 같은 변환을 거듭하면 가장 큰 고윳값의 고유벡터가 이깁니다. 거듭제곱법과 페이지랭크가 그 응용입니다.
      </Callout>
      <Quiz
        q={<>2×2 행렬 A의 대각합이 7, 행렬식이 10이다. A의 고윳값은?</>}
        options={['7과 10', '5와 2', '3.5와 3.5', '10과 −3']}
        answer={1}
        explain={<>특성방정식은 <M>{'\\lambda^2 - 7\\lambda + 10 = (\\lambda - 5)(\\lambda - 2) = 0'}</M>입니다. 확인: 합 5 + 2 = 7이 대각합, 곱 5 × 2 = 10이 행렬식입니다. 예를 들어 <M>{'\\begin{pmatrix} 4 & 1 \\\\ 2 & 3 \\end{pmatrix}'}</M>이 이런 행렬입니다.</>}
      />
    </>
  );
}
