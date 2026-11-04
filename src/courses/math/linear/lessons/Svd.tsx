import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import { gauss, rng } from '../../../../lib/math';
import type { Plot } from '../../../../lib/plot';
import { alpha, parseColor, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { F_SHAPE, KEY_HINT, arrow, circlePts, clipTo, hitPoint, knob, label, lineThrough, plane, poly, snapIn, tGrid, useKeyHandles, useLaColors } from './draw';
import { ap, col, diag, ease, eig2, lowRank, mul, nf, rot, scale, svd2, svdN, texM2, tn, type Mat2, type Vec2 } from './la';
import './linear.css';


/* ─────────────── Figure 1: rotate, stretch, rotate ─────────────── */

const SVD_PRESETS: { name: string; m: Mat2 }[] = [
  { name: '보통', m: [1.6, 0.9, -0.3, 1.1] },
  { name: '밀기', m: [1, 1.2, 0, 1] },
  { name: '뒤집기 포함', m: [0.4, 1.5, 1.2, 0.2] },
  { name: '납작', m: [1, 2, 0.5, 1] },
];

function stageMatrix(A: Mat2, t: number): Mat2 {
  const d = svd2(A);
  const Vt = rot(-d.phi);
  if (t <= 1) return rot(-d.phi * ease(t));
  const S = diag(1 + (d.s[0] - 1) * ease(Math.min(1, t - 1)), 1 + (d.s[1] - 1) * ease(Math.min(1, t - 1)));
  if (t <= 2) return mul(S, Vt);
  const e = ease(t - 2);
  const U = mul(rot(d.alpha * e), diag(1, 1 + (d.flip - 1) * e));
  return mul(U, mul(S, Vt));
}

function SvdStepsFigure() {
  const P = usePalette();
  const [C1, C2, C3] = useLaColors(P);
  const [A, setA] = useState<Mat2>(SVD_PRESETS[0].m);
  const [t, setT] = useState(3);
  const [playing, setPlaying] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  const plotRef = useRef<Plot | null>(null);
  const d = svd2(A);
  const Mt = stageMatrix(A, t);
  const v1 = col(d.V, 0);
  const v2 = col(d.V, 1);
  const ci = col(A, 0);
  const cj = col(A, 1);
  const setCol = (k: string, p: Vec2) => {
    setPlaying(false);
    setT(3);
    setA((m) => (k === 'i' ? [p[0], m[1], p[1], m[3]] : [m[0], p[0], m[2], p[1]]));
  };
  const keys = useKeyHandles(['i', 'j'], (k, dx, dy) => {
    const c = k === 'i' ? ci : cj;
    setCol(k, [Math.round((c[0] + dx) * 10) / 10, Math.round((c[1] + dy) * 10) / 10]);
  });

  useAnimationFrame(
    (dt) =>
      setT((x) => {
        const n = x + dt * 0.8;
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
      const plot = plane(ctx, w, h, P, 2.9, { numbers: false });
      plotRef.current = plot;
      tGrid(plot, Mt, alpha(P.ink3, 0.22), 1, 8);
      poly(plot, circlePts(1), Mt, alpha(C2, 0.12), C2, 2);
      poly(plot, F_SHAPE.map((p) => scale(p, 0.9) as Vec2), Mt, alpha(C1, 0.35), C1, 1.2);
      const a = ap(Mt, v1);
      const b = ap(Mt, v2);
      arrow(plot, [0, 0], a, P.neg, 3, 11);
      arrow(plot, [0, 0], b, P.pos, 3, 11);
      label(plot, t < 0.02 ? 'v₁' : t > 2.98 ? `σ₁u₁` : '', a, P.neg, P, 8, -12);
      label(plot, t < 0.02 ? 'v₂' : t > 2.98 ? `σ₂u₂` : '', b, P.pos, P, 8, -12);
      if (t > 2.98) {
        knob(plot, ci, C3, P, keys.active === 'i');
        knob(plot, cj, C3, P, keys.active === 'j');
        label(plot, 'Aî', ci, C3, P, 10, 14);
        label(plot, 'Aĵ', cj, C3, P, 10, 14);
      }
    },
    [P, Mt, A, t, keys.active],
    { aspect: 1.2, maxHeight: 460 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => hitPoint(plotRef.current, x, y, [['i', ci], ['j', cj]]),
    onDrag: (k, x, y) => setCol(String(k), snapIn(plotRef.current!, x, y)),
  });

  const stage = t < 0.02 ? '시작: 단위원' : t <= 1 ? '① Vᵀ: 돌리기' : t <= 2 ? '② Σ: 축 방향으로 늘이기' : t < 2.98 ? `③ U: 돌리기${d.flip < 0 ? '와 뒤집기' : ''}` : '끝: A를 적용한 것과 같음';
  return (
    <Figure
      no={1}
      title="모든 행렬은 돌리기, 늘이기, 돌리기"
      hint="재생하거나 진행 슬라이더를 끌고, 끝에서 Aî, Aĵ를 옮겨 보세요"
      caption={<>단위원 위의 두 직각 화살표 v₁, v₂(오른쪽 특잇값 벡터)가 ① 좌표축으로 돌아가고, ② 가로 σ₁배, 세로 σ₂배로 늘어난 뒤, ③ 새 방향 u₁, u₂로 돌아갑니다. 원은 타원이 되고, 두 화살표는 타원의 긴 축과 짧은 축이 됩니다. 어떤 행렬을 넣어도 이 세 단계로 설명됩니다.</>}
    >
      <div className="fig-split" ref={box}>
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`특잇값 분해 애니메이션, 현재 ${stage}. σ₁ = ${nf(d.s[0])}, σ₂ = ${nf(d.s[1])}. ${KEY_HINT}`} {...keys.props} />
        </div>
        <div className="controls">
          <Slider id="sv-t" label={`진행: ${stage}`} value={t} min={0} max={3} step={0.01} onChange={(v) => { setPlaying(false); setT(v); }} format={(v) => nf(v, 2)} />
          <Button primary onClick={() => (prefersReducedMotion() ? setT(3) : (setT(0), setPlaying(true)))}>
            ▶ 세 단계 재생
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="σ₁ (최대 배율)" value={nf(d.s[0], 3)} color="var(--neg)" />
            <Readout label="σ₂" value={nf(d.s[1], 3)} color="var(--pos)" />
            <Readout label="σ₁·σ₂ = |det A|" value={nf(d.s[0] * d.s[1], 3)} />
            <Readout label="U가 뒤집는가" value={d.flip < 0 ? '예 (det < 0)' : '아니오'} />
          </div>
          <div className="btn-row">
            {SVD_PRESETS.map((p) => (
              <Button key={p.name} small onClick={() => { setA(p.m); setPlaying(false); setT(3); }}>
                {p.name}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div className="la-tex">
        <M>{`A = ${texM2(A, 2)} = \\underbrace{${texM2(d.U, 2)}}_{U}\\underbrace{${texM2(diag(d.s[0], d.s[1]), 2)}}_{\\Sigma}\\underbrace{${texM2([d.V[0], d.V[2], d.V[1], d.V[3]], 2)}}_{V^{\\mathsf T}}`}</M>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: low-rank image compression ─────────────── */

const N = 48;
type Pic = 'face' | 'checker' | 'diag' | 'mix';
const PICS: { value: Pic; label: string }[] = [
  { value: 'face', label: '얼굴' },
  { value: 'checker', label: '체크무늬' },
  { value: 'diag', label: '대각선' },
  { value: 'mix', label: '얼굴 + 잡음' },
];

function makePic(kind: Pic): Float64Array {
  const A = new Float64Array(N * N);
  const r = rng(11);
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const y = (i + 0.5) / N;
      const x = (j + 0.5) / N;
      let v: number;
      if (kind === 'checker') v = (Math.floor(i / 8) + Math.floor(j / 8)) % 2 ? 0.9 : 0.15;
      else if (kind === 'diag') v = Math.abs(x - y) < 0.06 || Math.abs(x + y - 1.3) < 0.04 ? 0.92 : 0.12;
      else {
        // a smiling face on a soft gradient
        v = 0.25 + 0.25 * x;
        const d = Math.hypot(x - 0.5, y - 0.5);
        if (d < 0.38) v = 0.82;
        if (Math.abs(d - 0.38) < 0.025) v = 0.1;
        if (Math.hypot(x - 0.36, y - 0.4) < 0.055 || Math.hypot(x - 0.64, y - 0.4) < 0.055) v = 0.1;
        const m = Math.hypot(x - 0.5, y - 0.52);
        if (Math.abs(m - 0.2) < 0.025 && y > 0.6) v = 0.1;
        if (kind === 'mix') v = Math.max(0, Math.min(1, v + 0.12 * gauss(r)));
      }
      A[i * N + j] = v;
    }
  return A;
}

function PixelCanvas({ data, label: lab, map }: { data: Float64Array; label: string; map: (v: number) => [number, number, number] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(N, N);
    for (let k = 0; k < N * N; k++) {
      const [r, g, b] = map(data[k]);
      img.data[k * 4] = r;
      img.data[k * 4 + 1] = g;
      img.data[k * 4 + 2] = b;
      img.data[k * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [data, map]);
  return <canvas ref={ref} width={N} height={N} role="img" aria-label={lab} />;
}

const gray = (v: number): [number, number, number] => {
  const g = Math.round(255 * Math.max(0, Math.min(1, v)));
  return [g, g, g];
};

function CompressFigure() {
  const P = usePalette();
  const [C1] = useLaColors(P);
  const [pic, setPic] = useState<Pic>('face');
  const [k, setK] = useState(4);
  const A = useMemo(() => makePic(pic), [pic]);
  const svd = useMemo(() => svdN(A, N, N), [A]);
  const Ak = useMemo(() => lowRank(svd, k), [svd, k]);
  const layer = useMemo(() => {
    const out = new Float64Array(N * N);
    const s = svd.s[k - 1];
    const u = svd.U[k - 1];
    const v = svd.V[k - 1];
    let mx = 1e-9;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) mx = Math.max(mx, Math.abs((out[i * N + j] = s * u[i] * v[j])));
    for (let q = 0; q < N * N; q++) out[q] /= mx;
    return out;
  }, [svd, k]);
  const total = svd.s.reduce((a, s) => a + s * s, 0);
  const kept = svd.s.slice(0, k).reduce((a, s) => a + s * s, 0);
  const relErr = Math.sqrt(Math.max(0, total - kept) / total);
  const store = k * (2 * N + 1);
  const rank = svd.s.filter((s) => s > 1e-6 * svd.s[0]).length;
  const neg = useMemo(() => parseColor(P.neg), [P]);
  const pos = useMemo(() => parseColor(P.pos), [P]);
  const bg = useMemo(() => parseColor(P.surface), [P]);
  const diverge = useMemo(
    () =>
      (v: number): [number, number, number] => {
        const c = v < 0 ? neg : pos;
        const a = Math.min(1, Math.abs(v));
        return [bg[0] + (c[0] - bg[0]) * a, bg[1] + (c[1] - bg[1]) * a, bg[2] + (c[2] - bg[2]) * a];
      },
    [neg, pos, bg],
  );

  const chart = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 34, r: 8, t: 10, b: 20 };
      const bw = (w - pad.l - pad.r) / N;
      const top = Math.log10(svd.s[0]);
      const bot = -3;
      const Y = (s: number) => pad.t + ((top - Math.log10(Math.max(s, 1e-3))) / (top - bot)) * (h - pad.t - pad.b);
      ctx.font = `10px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of [10, 1, 0.1, 0.01]) {
        if (Math.log10(v) > top + 0.01) continue;
        ctx.fillText(String(v), pad.l - 4, Y(v));
        ctx.strokeStyle = P.grid;
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(v));
        ctx.lineTo(w - pad.r, Y(v));
        ctx.stroke();
      }
      svd.s.forEach((s, i) => {
        ctx.fillStyle = i < k ? C1 : alpha(P.ink3, 0.3);
        const y = Y(s);
        ctx.fillRect(pad.l + i * bw + 0.5, y, Math.max(1, bw - 1), h - pad.b - y);
      });
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const i of [1, 12, 24, 36, 48]) ctx.fillText(String(i), pad.l + (i - 0.5) * bw, h - pad.b + 4);
    },
    [P, svd, k],
    { height: 130, minHeight: 110 },
  );

  return (
    <Figure
      no={2}
      title="낮은 계수 근사로 이미지 압축하기"
      hint="그림을 고르고 k를 바꿔 보세요"
      caption={<>48×48 흑백 이미지는 밝기 2,304개짜리 행렬입니다. 특잇값 분해로 이 행렬을 "세로 벡터 × 가로 벡터" 모양의 층 48개로 쪼개고, 큰 특잇값부터 k개 층만 더한 것이 가운데 그림입니다. 오른쪽은 k번째 층 하나(파랑은 빼고 주황은 더하는 부분)이고, 아래 막대는 특잇값의 크기(로그 눈금)입니다.</>}
    >
      <div className="controls row">
        <Seg label="이미지" value={pic} onChange={(p) => setPic(p)} options={PICS} />
        <Slider id="cp-k" label="사용할 층 수 k (계수)" value={k} min={1} max={N} step={1} onChange={setK} format={(v) => `k = ${v}`} />
      </div>
      <div className="la-imgs" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="la-img">
          <PixelCanvas data={A} map={gray} label={`원본 이미지 (${PICS.find((p) => p.value === pic)!.label})`} />
          <span>원본 (계수 {rank})</span>
        </div>
        <div className="la-img">
          <PixelCanvas data={Ak} map={gray} label={`계수 ${k} 근사 이미지, 상대 오차 ${nf(relErr * 100, 1)}%`} />
          <span>계수 {k} 근사</span>
        </div>
        <div className="la-img">
          <PixelCanvas data={layer} map={diverge} label={`${k}번째 층 σ${k}u${k}v${k}ᵀ`} />
          <span>{k}번째 층 σ<sub>{k}</sub>u<sub>{k}</sub>v<sub>{k}</sub>ᵀ</span>
        </div>
      </div>
      <div ref={chart.wrapRef} className="canvas-box">
        <canvas ref={chart.canvasRef} role="img" aria-label={`특잇값 막대그래프: 가장 큰 값 ${nf(svd.s[0], 1)}, ${k}번째 ${nf(svd.s[k - 1], 2)}`} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <Readout label="저장할 숫자" value={`${store.toLocaleString('ko-KR')} / ${(N * N).toLocaleString('ko-KR')}`} color={store < N * N ? 'var(--good)' : 'var(--bad)'} />
        <Readout label="원본 대비" value={`${nf((store / (N * N)) * 100, 0)}%`} />
        <Readout label="상대 오차" value={`${nf(relErr * 100, 1)}%`} color={relErr < 0.05 ? 'var(--good)' : undefined} />
        <Readout label={`σ${k <= 9 ? '₁₂₃₄₅₆₇₈₉'[k - 1] : '_' + k}`} value={nf(svd.s[k - 1], 3)} color="var(--c-math-1)" />
      </div>
      <div className="la-note" aria-live="polite">
        {pic === 'checker' ? (
          <>체크무늬는 특잇값이 단 두 개뿐입니다(계수 2). k = 2면 완벽하게 복원되고, 나머지 층은 모두 0입니다. 가로세로로 반복되는 무늬는 "행 패턴 × 열 패턴" 몇 개로 정확히 적을 수 있기 때문입니다.</>
        ) : pic === 'diag' ? (
          <>대각선은 행마다 밝은 칸의 위치가 다 달라서, 특잇값이 천천히 줄어듭니다. 낮은 계수로는 가로세로 얼룩만 생기고, 같은 오차를 내려면 층이 훨씬 많이 필요합니다.</>
        ) : pic === 'mix' ? (
          <>잡음은 모든 특잇값을 조금씩 올립니다. 작은 k에서는 잡음이 거의 사라지는데, 낮은 계수 근사가 잡음 제거 효과도 낸다는 뜻입니다.</>
        ) : (
          <>k가 작을 때는 큰 윤곽만, k를 올리면 눈과 입이 또렷해집니다. 특잇값이 빨리 줄어드는 이미지일수록 적은 층으로 잘 압축됩니다.</>
        )}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: principal component analysis ─────────────── */

const BASE = (() => {
  const r = rng(7);
  return Array.from({ length: 140 }, () => [gauss(r), gauss(r)] as Vec2);
})();

function PcaFigure() {
  const P = usePalette();
  const [C1, C2, C3] = useLaColors(P);
  const [tilt, setTilt] = useState(30);
  const [spread, setSpread] = useState(0.35);
  const [phi, setPhi] = useState(100);
  const [proj, setProj] = useState(true);
  const pts = useMemo(() => {
    const R = rot((tilt * Math.PI) / 180);
    return BASE.map((p) => ap(R, [p[0] * 1.3, p[1] * 1.3 * spread]) as Vec2).map((p) => [p[0] + 0.4, p[1] + 0.2] as Vec2);
  }, [tilt, spread]);
  const n = pts.length;
  const mean: Vec2 = [pts.reduce((a, p) => a + p[0], 0) / n, pts.reduce((a, p) => a + p[1], 0) / n];
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of pts) {
    const dx = p[0] - mean[0];
    const dy = p[1] - mean[1];
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const Cov: Mat2 = [sxx / (n - 1), sxy / (n - 1), sxy / (n - 1), syy / (n - 1)];
  const ev = eig2(Cov).sort((a, b) => b.l - a.l);
  const pc1 = ev[0].v;
  const pc2 = ev[1]?.v ?? [-pc1[1], pc1[0]];
  const u: Vec2 = [Math.cos((phi * Math.PI) / 180), Math.sin((phi * Math.PI) / 180)];
  const scores = pts.map((p) => (p[0] - mean[0]) * u[0] + (p[1] - mean[1]) * u[1]);
  const varAlong = scores.reduce((a, s) => a + s * s, 0) / (n - 1);
  const totalVar = Cov[0] + Cov[3];
  const resid = totalVar - varAlong;
  const pcAngle = (((Math.atan2(pc1[1], pc1[0]) * 180) / Math.PI) % 180 + 180) % 180;
  const aligned = Math.abs(((phi - pcAngle + 90 + 180) % 180) - 90) < 1.5;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 3.2, { numbers: false, cx: 0.4, cy: 0.2 });
      const un = clipTo(plot);
      if (proj)
        pts.forEach((p, i) => {
          const q = [mean[0] + u[0] * scores[i], mean[1] + u[1] * scores[i]];
          plot.line(p[0], p[1], q[0], q[1], alpha(P.bad, 0.35), 1);
        });
      un();
      lineThrough(plot, u, aligned ? P.good : C3, 2.5, undefined, mean);
      pts.forEach((p) => plot.dot(p[0], p[1], 3, alpha(P.neg, 0.75)));
      if (proj) pts.forEach((_, i) => plot.dot(mean[0] + u[0] * scores[i], mean[1] + u[1] * scores[i], 2.2, aligned ? P.good : C3));
      const s1 = Math.sqrt(ev[0].l) * 2;
      const s2 = Math.sqrt(Math.max(0, ev[1]?.l ?? 0)) * 2;
      arrow(plot, mean, [mean[0] + pc1[0] * s1, mean[1] + pc1[1] * s1], C1, 3, 11);
      arrow(plot, mean, [mean[0] + pc2[0] * s2, mean[1] + pc2[1] * s2], C2, 3, 11);
      label(plot, 'PC1', [mean[0] + pc1[0] * s1, mean[1] + pc1[1] * s1], C1, P, 8, -12);
      label(plot, 'PC2', [mean[0] + pc2[0] * s2, mean[1] + pc2[1] * s2], C2, P, 8, -12);
      plot.dot(mean[0], mean[1], 5, P.ink, P.surface, 1.5);
    },
    [P, pts, phi, proj, aligned],
    { aspect: 1.25, maxHeight: 430 },
  );

  const strip = useCanvas2D(
    (ctx, { w, h }) => {
      const L = 3.6;
      const X = (s: number) => 14 + ((s + L) / (2 * L)) * (w - 28);
      ctx.strokeStyle = P.lineStrong;
      ctx.beginPath();
      ctx.moveTo(10, h / 2);
      ctx.lineTo(w - 10, h / 2);
      ctx.stroke();
      ctx.fillStyle = alpha(aligned ? P.good : C3, 0.6);
      scores.forEach((s, i) => {
        ctx.beginPath();
        ctx.arc(X(s), h / 2 + (((i * 37) % 11) - 5) * 1.6, 2.6, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('축 위로 옮긴 1차원 데이터', 10, 4);
    },
    [P, scores, aligned],
    { height: 64, minHeight: 56 },
  );

  return (
    <Figure
      no={3}
      title="주성분 분석: 가장 넓게 퍼진 방향"
      hint="후보 축을 돌려 분산이 가장 커지는 곳을 찾아 보세요"
      caption={<>파란 점이 2차원 데이터, 노란 직선이 데이터를 비출 후보 축입니다. 빨간 선분은 각 점에서 축까지의 수직 거리이고, 아래 띠는 축 위로 옮긴 점들(1차원으로 줄인 데이터)입니다. 축을 PC1에 맞추면 축 위의 분산은 가장 커지고, 빨간 선분의 제곱합은 가장 작아집니다. 두 값의 합은 언제나 전체 분산으로 같습니다.</>}
    >
      <div className="fig-split">
        <div className="la-panel">
          <div ref={wrapRef} className="canvas-box">
            <canvas ref={canvasRef} role="img" aria-label={`점 ${n}개의 2차원 데이터와 각도 ${phi}도의 후보 축. 축 위 분산 ${nf(varAlong, 2)}, 전체 분산 ${nf(totalVar, 2)}. 첫째 주성분 방향 ${Math.round(pcAngle)}도.`} />
          </div>
          <div ref={strip.wrapRef} className="canvas-box">
            <canvas ref={strip.canvasRef} role="img" aria-label={`후보 축 위로 사영한 1차원 값들, 분산 ${nf(varAlong, 2)}`} />
          </div>
        </div>
        <div className="controls">
          <Slider id="pc-phi" label="후보 축의 각도" value={phi} min={0} max={179} step={1} onChange={setPhi} format={(v) => `${v}°`} color={aligned ? 'var(--good)' : undefined} />
          <Button small primary onClick={() => setPhi(Math.round(pcAngle))}>
            PC1에 맞추기
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="축 위 분산" value={nf(varAlong, 3)} color={aligned ? 'var(--good)' : 'var(--c-math-3)'} />
            <Readout label="수직 거리² 평균" value={nf(resid, 3)} color="var(--bad)" />
            <Readout label="합 = 전체 분산" value={nf(totalVar, 3)} />
            <Readout label="PC1이 설명하는 비율" value={`${nf((ev[0].l / totalVar) * 100, 1)}%`} color="var(--c-math-1)" />
          </div>
          <Slider id="pc-tilt" label="데이터의 기울기" value={tilt} min={-80} max={80} step={1} onChange={setTilt} format={(v) => `${v}°`} />
          <Slider id="pc-sp" label="옆 방향 퍼짐 (가늘다 ↔ 둥글다)" value={spread} min={0.05} max={1} step={0.01} onChange={setSpread} format={(v) => nf(v, 2)} />
          <Check label="사영 선분 보기" checked={proj} onChange={setProj} />
        </div>
      </div>
      <div className="la-tex">
        <M>{`\\text{공분산 행렬 } C = ${texM2(Cov, 2)},\\quad \\lambda_1 = ${tn(ev[0].l, 2)},\\ \\lambda_2 = ${tn(ev[1]?.l ?? 0, 2)}`}</M>
      </div>
      <Legend items={[{ color: P.neg, label: '데이터' }, { color: C3, label: '후보 축과 사영', shape: 'ln' }, { color: C1, label: 'PC1 (λ₁ 방향)', shape: 'ln' }, { color: C2, label: 'PC2', shape: 'ln' }]} />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Svd() {
  return (
    <>
      <h2>고유벡터의 한계, 그리고 특잇값</h2>
      <p>
        <a href={lessonHref('math-linear-algebra', 'eigen')}>5장</a>의 대각화는 강력하지만 조건이 붙습니다. 정사각 행렬이어야 하고, 고유벡터가 충분해야 하며, 고유벡터들이 서로 직각이라는 보장도 없습니다. 밀기 행렬은 고유벡터가 하나뿐이고, 사용자 1,000명 × 영화 300편 같은 직사각 행렬에는 고유벡터라는 말 자체가 없습니다.
      </p>
      <p>
        <T en="singular value decomposition, SVD">특잇값 분해</T>는 이 모든 조건을 없앤 버전입니다. 질문을 조금 바꿉니다. "방향이 그대로인 벡터"가 아니라 "<strong>직각인 입력 방향 중, 변환 뒤에도 직각으로 남는 것</strong>"을 찾습니다. 그런 방향은 어떤 행렬에나 언제나 있습니다.
      </p>
      <MB note="V의 열 v₁, v₂, …는 서로 직각인 입력 방향, U의 열 u₁, u₂, …는 서로 직각인 출력 방향, Σ(시그마)는 대각선에 특잇값 σ₁ ≥ σ₂ ≥ … ≥ 0을 놓은 행렬입니다. ᵀ는 전치(행과 열 바꾸기)입니다.">{'A = U\\,\\Sigma\\,V^{\\mathsf T}, \\qquad A\\mathbf v_i = \\sigma_i \\mathbf u_i'}</MB>
      <p>
        U와 V는 길이와 각도를 보존하는 <T en="orthogonal matrix">직교 행렬</T>, 즉 돌리기(때로는 뒤집기)입니다. 그러니 식을 오른쪽부터 읽으면 어떤 행렬이든 <strong>돌리고, 축 방향으로 늘이고, 다시 돌리는</strong> 세 동작으로 쪼개진다는 뜻입니다. 단위원으로 확인해 봅시다.
      </p>
      <SvdStepsFigure />
      <p>
        그림 1에서 단위원은 언제나 타원이 됩니다. 타원의 긴 반지름이 <M>{'\\sigma_1'}</M>, 짧은 반지름이 <M>{'\\sigma_2'}</M>입니다. 즉 <M>{'\\sigma_1'}</M>은 행렬이 어떤 벡터를 늘일 수 있는 가장 큰 배율이고, 두 특잇값의 곱은 넓이 배율 <M>{'|\\det A|'}</M>입니다. "납작"에서는 <M>{'\\sigma_2 = 0'}</M>이 되어 타원이 선분이 됩니다. 0이 아닌 특잇값의 개수가 <a href={lessonHref('math-linear-algebra', 'determinants')}>4장</a>의 계수입니다.
      </p>
      <Callout kind="note">
        특잇값은 고윳값과 무관하지 않습니다. <M>{'A^{\\mathsf T}A = V\\Sigma^2V^{\\mathsf T}'}</M>이므로 v들은 대칭 행렬 <M>{'A^{\\mathsf T}A'}</M>의 고유벡터이고, 특잇값의 제곱이 그 고윳값입니다. 대칭 행렬의 고유벡터는 늘 직각이라는 5장의 사실이 여기서 쓰입니다. 실제 계산도 이 관계에서 출발하지만, 수치 라이브러리는 정확도를 위해 <M>{'A^{\\mathsf T}A'}</M>를 직접 만들지 않는 더 정교한 방법을 씁니다.
      </Callout>

      <h2>행렬을 중요한 조각으로 나누기</h2>
      <p>U Σ Vᵀ를 열과 행으로 펼쳐 쓰면 특잇값 분해의 또 다른 얼굴이 보입니다. 행렬은 "세로 벡터 × 가로 벡터" 모양의 계수 1짜리 층들의 합입니다.</p>
      <MB note="r은 계수입니다. 각 층 uᵢvᵢᵀ는 모든 행이 같은 모양(vᵢ)이고 크기만 다른(uᵢ의 성분) 단순한 행렬입니다.">{'A = \\sigma_1 \\mathbf u_1 \\mathbf v_1^{\\mathsf T} + \\sigma_2 \\mathbf u_2 \\mathbf v_2^{\\mathsf T} + \\cdots + \\sigma_r \\mathbf u_r \\mathbf v_r^{\\mathsf T}'}</MB>
      <p>
        층은 특잇값 크기순으로 정렬되어 있습니다. 앞의 k개만 남기고 나머지를 버린 <M>{'A_k'}</M>를 <T en="low-rank approximation">낮은 계수 근사</T>라고 합니다. 놀라운 사실은 이것이 계수 k인 행렬 중에서 A에 <strong>가장 가까운</strong> 행렬이라는 것입니다(에카르트-영 정리). 버린 특잇값들의 제곱합이 곧 오차입니다.
      </p>
      <CompressFigure />
      <p>
        그림 2의 얼굴은 k = 8 정도면 알아볼 수 있습니다. 이때 저장할 숫자는 층마다 u 48개, v 48개, σ 1개로 8 × 97 = 776개, 원본 2,304개의 3분의 1입니다. 실제 이미지 압축(JPEG)은 다른 기저(코사인 파형)를 쓰지만, "중요한 성분만 남긴다"는 생각은 같습니다. 체크무늬와 대각선을 비교하면 압축이 잘 되는 데이터가 무엇인지도 보입니다. 행과 열에 반복되는 구조가 있으면 특잇값이 빨리 줄어듭니다.
      </p>
      <p>
        이 생각은 인공지능 곳곳에 있습니다. <a href={lessonHref('math-linear-algebra', 'vectors')}>1장</a>의 추천 예제에서 사용자를 "원형 취향 몇 개의 선형결합"으로 설명했는데, 사용자 × 영화 평점 행렬의 낮은 계수 근사가 바로 그 원형들을 자동으로 찾아 줍니다. 넷플릭스 프라이즈에서 활약한 행렬 분해 추천이 이것입니다. 거대 언어 모델을 적은 비용으로 미세조정하는 <a href={lessonHref('ai-llm', 'lora')}>LoRA</a>도 "가중치의 변화량은 낮은 계수 행렬로 충분하다"는 가정 위에 서 있습니다.
      </p>
      <Code label="계수 k 근사 만들기">{`
// U: m×r, s: 특잇값 r개(큰 순서), V: n×r. 앞의 k개 층만 더한다
function lowRank(U, s, V, k) {
  const m = U.length, n = V.length;
  const A = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let r = 0; r < k; r++)
    for (let i = 0; i < m; i++)
      for (let j = 0; j < n; j++)
        A[i][j] += s[r] * U[i][r] * V[j][r]; // σ·u·vᵀ 한 층
  return A;
}

// 저장 비용: 원본 m*n 개 → 근사 k*(m + n + 1) 개
// 1000×1000 사진을 k = 50으로: 1,000,000 → 100,050 (약 10%)`}</Code>

      <h2>주성분 분석: 데이터가 퍼진 방향</h2>
      <p>
        이번에는 행렬이 변환이 아니라 데이터입니다. 키와 몸무게처럼 두 값을 가진 점 수백 개가 있다면 대개 비스듬한 타원 모양으로 퍼져 있습니다. 데이터를 가장 잘 요약하는 방향, 즉 점들이 가장 넓게 퍼진 방향은 어디일까요? 이것을 찾는 것이 <T en="principal component analysis, PCA">주성분 분석</T>입니다.
      </p>
      <p>
        먼저 각 특성에서 평균을 빼서 데이터의 중심을 원점으로 옮깁니다. 그다음 단위 벡터 u 방향으로 각 점을 비춘 값(내적)의 분산을 잽니다. 이 분산은 <T en="covariance matrix">공분산 행렬</T> C로 간단히 적힙니다.
      </p>
      <MB note="X는 평균을 뺀 데이터 행렬(행 하나가 점 하나, n개), C의 대각선은 각 특성의 분산, 대각선 밖은 두 특성이 함께 변하는 정도(공분산)입니다.">{'C = \\frac{1}{n-1}X^{\\mathsf T}X, \\qquad \\operatorname{Var}(X\\mathbf u) = \\mathbf u^{\\mathsf T} C\\,\\mathbf u'}</MB>
      <p>
        C는 대칭 행렬이고, <M>{'\\mathbf u^{\\mathsf T}C\\mathbf u'}</M>를 가장 크게 하는 단위 벡터는 C의 가장 큰 고윳값의 고유벡터입니다. 그 방향이 <T en="first principal component">첫째 주성분</T> PC1이고, 그 고윳값이 PC1 방향의 분산입니다. 둘째 주성분은 PC1에 직각인 방향 중 가장 넓게 퍼진 방향입니다. 그리고 <M>{'C = \\frac{1}{n-1}X^{\\mathsf T}X'}</M>이니 주성분은 데이터 행렬 X의 오른쪽 특잇값 벡터와 같습니다. 그래서 실제로는 X의 특잇값 분해로 주성분을 구합니다.
      </p>
      <PcaFigure />
      <p>
        그림 3에서 축을 돌리면 "축 위 분산"과 "수직 거리² 평균"이 시소처럼 움직이고, 둘의 합은 변하지 않습니다. 피타고라스 정리 때문입니다. 그래서 <strong>분산을 가장 많이 남기는 축</strong>과 <strong>버리는 정보(수직 거리)가 가장 적은 축</strong>은 같은 축, PC1입니다. 데이터가 가늘수록 PC1이 설명하는 비율이 100%에 가까워져, 2차원 데이터를 1차원 숫자 하나로 줄여도 거의 잃는 것이 없습니다.
      </p>
      <Callout kind="intuition">
        PCA는 수백, 수천 차원 데이터를 사람이 볼 수 있는 2~3차원으로 줄이는 가장 기본적인 방법입니다. 단어 임베딩이나 이미지 특성 벡터를 평면에 찍어 볼 때(<a href={lessonHref('ai-basics', 'embeddings')}>임베딩</a>), 잡음이 섞인 측정값에서 큰 흐름만 남길 때 씁니다. 신경망으로 같은 일을 비선형으로 하면 <a href={lessonHref('ai-deep-learning', 'autoencoder-vae')}>오토인코더</a>가 됩니다. 선형 오토인코더가 배우는 공간이 정확히 PCA의 공간입니다.
      </Callout>
      <Callout kind="warn">
        PCA는 단위에 민감합니다. 키를 cm로, 몸무게를 kg으로 재면 숫자가 큰 쪽(키)의 분산이 커서 PC1이 거의 키 방향이 됩니다. 단위가 다른 특성은 보통 먼저 표준화(평균 0, 표준편차 1)해서 넣습니다.
      </Callout>

      <Callout kind="key">
        특잇값 분해 <M>{'A = U\\Sigma V^{\\mathsf T}'}</M>는 어떤 행렬이든 돌리기, 늘이기, 돌리기로 나눕니다. 특잇값은 각 방향의 배율이고, 큰 것부터 k개 층만 남긴 낮은 계수 근사는 계수 k인 행렬 중 원래 행렬에 가장 가깝습니다. 주성분 분석은 평균을 뺀 데이터의 특잇값 분해로, 데이터가 가장 넓게 퍼진 직각 방향들을 찾아 차원을 줄입니다. 벡터에서 시작한 이 과목이 결국 "가장 좋은 기저 찾기"로 끝나는 셈입니다.
      </Callout>
      <Quiz
        q={<>200×100 흑백 이미지를 계수 10으로 근사해 저장하면 숫자가 대략 몇 개 필요한가? (층마다 u, v, σ를 저장)</>}
        options={['약 1,000개', '약 3,010개', '약 20,000개', '약 2,000,000개']}
        answer={1}
        explain={<>층 하나에 u 200개, v 100개, σ 1개로 301개가 필요하고, 10층이면 3,010개입니다. 원본 20,000개의 약 15%입니다. 특잇값이 빨리 줄어드는 이미지라면 이 정도로도 꽤 알아볼 수 있습니다.</>}
      />
    </>
  );
}
