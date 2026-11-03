import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, parseColor, usePalette, type Palette } from '../../../../lib/theme';
import { gauss, rng } from '../../../../lib/math';
import { IMG, ImageAE, PointAE, SHAPE_NAMES, lineAngle, makeCloud, makeImages, nearestMSE, pca2, sampleQuality, type Cloud, type ImgItem, type P2 } from './generative';
import './generative.css';

const shapeColors = (P: Palette) => [P.pos, P.neg, P.good];
const SHAPE_VARS = ['var(--pos)', 'var(--neg)', 'var(--good)'];
const fmt = (v: number, d = 3) => (isFinite(v) ? v.toFixed(d) : '—');

/** Draw an n×n grayscale image (0 = background, 1 = ink) into a square. */
function drawGray(ctx: CanvasRenderingContext2D, P: Palette, img: ArrayLike<number>, n: number, x: number, y: number, size: number) {
  const a = parseColor(P.surface);
  const b = parseColor(P.ink);
  const c = size / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const t = Math.max(0, Math.min(1, img[j * n + i]));
      ctx.fillStyle = `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
      ctx.fillRect(Math.floor(x + i * c), Math.floor(y + j * c), Math.ceil(c) + 1, Math.ceil(c) + 1);
    }
  }
}

/** Start something once, the first time the element is mostly on screen (not with reduced motion). */
function useFirstView(ref: RefObject<HTMLElement>, start: () => void) {
  const cb = useRef(start);
  cb.current = start;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0]?.isIntersecting) {
          cb.current();
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
}

let ITEMS: ImgItem[] | null = null;
const images = () => (ITEMS ??= makeImages(80, 5));
const EPOCHS = 150;

/** Run `fn` repeatedly for about `ms` milliseconds. */
function budget(ms: number, fn: () => boolean) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) if (!fn()) break;
}

/* ─────────────── Figure 1: squeezing 2D points through one number ─────────────── */

const PT_STEPS = 3000;

function BottleneckFigure() {
  const P = usePalette();
  const figRef = useRef<HTMLDivElement>(null);
  const inView = useInView(figRef);
  const [cloud, setCloud] = useState<Cloud>('ellipse');
  const [kind, setKind] = useState<'lin' | 'mlp'>('lin');
  const [seed, setSeed] = useState(3);
  const [running, setRunning] = useState(false);
  const [showPca, setShowPca] = useState(true);
  const [, setTick] = useState(0);
  const pts = useMemo(() => makeCloud(cloud), [cloud]);
  const pc = useMemo(() => pca2(pts), [pts]);
  const ae = useMemo(() => new PointAE(kind === 'lin', seed), [kind, seed, cloud]); // eslint-disable-line react-hooks/exhaustive-deps
  const started = useRef(false);

  useFirstView(figRef, () => {
    started.current = true;
    setRunning(true);
  });
  // a new model starts training by itself once the reader has seen the figure
  useEffect(() => {
    if (started.current && !prefersReducedMotion()) setRunning(true);
  }, [ae]);

  useAnimationFrame(() => {
    for (let k = 0; k < 10 && ae.steps < PT_STEPS; k++) ae.epoch(pts, 0.01, pts.length);
    if (ae.steps >= PT_STEPS) setRunning(false);
    setTick((t) => t + 1);
  }, running && inView && ae.steps < PT_STEPS);

  const mse = ae.mse(pts);
  const dir: P2 = kind === 'lin' ? [ae.dec.W[0][0], ae.dec.W[0][1]] : [1, 0];
  const ang = kind === 'lin' ? lineAngle(dir, pc.dir) : NaN;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -1.3, xMax: 1.3, yMin: -0.95, yMax: 0.95, equal: true, pad: { l: 8, r: 8, t: 8, b: 8 } });
      p.grid({ xStep: 0.5, yStep: 0.5, labels: false });
      p.clip();
      if (showPca) {
        const L = 3;
        p.line(pc.mean[0] - L * pc.dir[0], pc.mean[1] - L * pc.dir[1], pc.mean[0] + L * pc.dir[0], pc.mean[1] + L * pc.dir[1], P.neg, 1.6, [6, 5]);
      }
      // the decoder's output for every possible code: a line (linear) or a curve (nonlinear)
      const codes = pts.map((q) => ae.encode(q));
      const lo = Math.min(...codes);
      const hi = Math.max(...codes);
      const span = hi - lo || 1;
      ctx.strokeStyle = P.pos;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const z = lo - 0.15 * span + (1.3 * span * i) / 120;
        const q = ae.decode(z);
        if (i === 0) ctx.moveTo(p.X(q[0]), p.Y(q[1]));
        else ctx.lineTo(p.X(q[0]), p.Y(q[1]));
      }
      ctx.stroke();
      // error segments x → x̂
      ctx.strokeStyle = alpha(P.ink2, 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath();
      const rec = pts.map((q, i) => ae.decode(codes[i]));
      pts.forEach((q, i) => {
        ctx.moveTo(p.X(q[0]), p.Y(q[1]));
        ctx.lineTo(p.X(rec[i][0]), p.Y(rec[i][1]));
      });
      ctx.stroke();
      pts.forEach((q) => p.dot(q[0], q[1], 3, P.ink3));
      rec.forEach((q) => p.dot(q[0], q[1], 2.6, P.surface, P.pos, 1.6));
      p.unclip();
    },
    [P, pts, ae, ae.steps, showPca, pc],
    { aspect: 1.45, maxHeight: 380, minHeight: 220 },
  );

  return (
    <Figure
      no={1}
      title="좁은 통로: 점 두 좌표를 숫자 하나로"
      hint="데이터와 모델을 바꿔 가며 학습시켜 보세요"
      caption={
        <>
          회색 점이 데이터, 테두리만 있는 주황 점이 복원한 점, 둘을 잇는 가는 선이 복원 오차입니다. 주황 곡선은 디코더가 숫자 하나 <M>{'z'}</M>로 그릴 수 있는 점 전부입니다. 복원은 반드시 이 곡선 위에 놓이므로, 학습은 데이터 가까이 지나가는 곡선을 찾는 일입니다. 파란 점선은 PCA의 첫 번째 주축입니다. 한 단계는 점 {pts.length}개 전체로 기울기를 한 번 계산해 Adam으로 고치는 것입니다.
        </>
      }
    >
      <div className="fig-split" ref={figRef}>
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`점 ${pts.length}개를 숫자 하나로 압축했다 복원하는 오토인코더. 현재 평균 복원 오차 ${fmt(mse, 4)}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg
            label="데이터"
            value={cloud}
            onChange={setCloud}
            options={[
              { value: 'ellipse', label: '길쭉한 구름' },
              { value: 'arc', label: '휘어진 띠' },
            ]}
          />
          <Seg
            label="인코더와 디코더"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'lin', label: '선형' },
              { value: 'mlp', label: '은닉층 16개' },
            ]}
          />
          <div className="btn-row">
            <Button small primary onClick={() => setRunning((r) => !r)} disabled={ae.steps >= PT_STEPS}>
              {running ? '일시정지' : '학습'}
            </Button>
            <Button small onClick={() => setSeed((s) => s + 1)} title="가중치를 새로 무작위로 정합니다">
              초기화
            </Button>
          </div>
          <Check label="PCA 주축 보기" checked={showPca} onChange={setShowPca} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="단계" value={`${ae.steps} / ${PT_STEPS}`} />
            <Readout label="평균 복원 오차" value={fmt(mse, 4)} color="var(--pos)" />
            <Readout label="PCA 1개 축의 오차" value={fmt(pc.l2, 4)} color="var(--neg)" />
            {kind === 'lin' ? <Readout label="주축과 이루는 각" value={`${fmt(ang, 2)}°`} /> : <Readout label="PCA 대비" value={`${fmt((mse / pc.l2) * 100, 0)}%`} />}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: walking the latent plane of a plain autoencoder ─────────────── */

interface View {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function fitView(codes: P2[], pad = 0.12): View {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of codes) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const dx = Math.max(1e-3, x1 - x0);
  const dy = Math.max(1e-3, y1 - y0);
  return { x0: x0 - pad * dx, x1: x1 + pad * dx, y0: y0 - pad * dy, y1: y1 + pad * dy };
}

/** The point of the view (in [0,1]² view coordinates) farthest from every code. */
function emptiestSpot(codes: P2[], v: View): P2 {
  let best: P2 = [0.5, 0.5];
  let bd = -1;
  for (let i = 0; i <= 40; i++) {
    for (let j = 0; j <= 40; j++) {
      const u = 0.12 + (0.76 * i) / 40;
      const t = 0.12 + (0.76 * j) / 40;
      let d = Infinity;
      for (const c of codes) {
        const du = (c[0] - v.x0) / (v.x1 - v.x0) - u;
        const dt = (c[1] - v.y0) / (v.y1 - v.y0) - t;
        d = Math.min(d, du * du + dt * dt);
      }
      if (d > bd) {
        bd = d;
        best = [u, t];
      }
    }
  }
  return best;
}

function LatentWalkFigure() {
  const P = usePalette();
  const items = images();
  const figRef = useRef<HTMLDivElement>(null);
  const inView = useInView(figRef);
  const [seed, setSeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [, setTick] = useState(0);
  const [cur, setCur] = useState<P2>([0.5, 0.5]); // cursor in view coordinates (0..1, y up)
  const ae = useMemo(() => new ImageAE(false, 0, seed), [seed]);
  const started = useRef(false);

  useFirstView(figRef, () => {
    started.current = true;
    setRunning(true);
  });
  useEffect(() => {
    if (started.current && !prefersReducedMotion()) setRunning(true);
  }, [ae]);

  useAnimationFrame(() => {
    // the loop may run once more before it is torn down: never train past the last epoch
    budget(7, () => {
      if (ae.epochs >= EPOCHS) return false;
      ae.train(items, 8);
      return ae.epochs < EPOCHS;
    });
    if (ae.epochs >= EPOCHS) setRunning(false);
    setTick((t) => t + 1);
  }, running && inView && ae.epochs < EPOCHS);

  const codes = items.map((it) => ae.encode(it.x));
  const view = fitView(codes);
  const z: P2 = [view.x0 + cur[0] * (view.x1 - view.x0), view.y0 + cur[1] * (view.y1 - view.y0)];
  const out = ae.decode(z);
  const near = nearestMSE(out, items);
  const geom = useRef({ l: 0, t: 0, w: 1, h: 1 });

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = 10;
      geom.current = { l: pad, t: pad, w: w - 2 * pad, h: h - 2 * pad };
      const X = (x: number) => pad + ((x - view.x0) / (view.x1 - view.x0)) * (w - 2 * pad);
      const Y = (y: number) => h - pad - ((y - view.y0) / (view.y1 - view.y0)) * (h - 2 * pad);
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(pad + 0.5, pad + 0.5, w - 2 * pad - 1, h - 2 * pad - 1);
      const cols = shapeColors(P);
      codes.forEach(([x, y], i) => {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), 3.2, 0, Math.PI * 2);
        ctx.fillStyle = cols[items[i].shape];
        ctx.fill();
      });
      const cx = X(z[0]);
      const cy = Y(z[1]);
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.moveTo(cx - 15, cy);
      ctx.lineTo(cx - 5, cy);
      ctx.moveTo(cx + 5, cy);
      ctx.lineTo(cx + 15, cy);
      ctx.moveTo(cx, cy - 15);
      ctx.lineTo(cx, cy - 5);
      ctx.moveTo(cx, cy + 5);
      ctx.lineTo(cx, cy + 15);
      ctx.stroke();
    },
    [P, ae.progress, seed, cur],
    { aspect: 1.25, maxHeight: 400, minHeight: 240 },
  );

  const toView = (x: number, y: number): P2 => {
    const g = geom.current;
    return [Math.max(0, Math.min(1, (x - g.l) / g.w)), Math.max(0, Math.min(1, 1 - (y - g.t) / g.h))];
  };
  useDrag(canvasRef, {
    hit: (x, y) => {
      const g = geom.current;
      const cx = g.l + cur[0] * g.w;
      const cy = g.t + (1 - cur[1]) * g.h;
      return Math.hypot(x - cx, y - cy) < 26 ? 'c' : null;
    },
    onDrag: (_, x, y) => setCur(toView(x, y)),
    onEmpty: (x, y) => setCur(toView(x, y)),
  });

  const imgRef = useCanvas2D((ctx, { w }) => drawGray(ctx, P, out, IMG, 0, 0, w), [P, out], { aspect: 1, maxHeight: 220, minHeight: 80 });
  const nearRef = useCanvas2D((ctx, { w }) => drawGray(ctx, P, items[near.idx].x, IMG, 0, 0, w), [P, near.idx], { aspect: 1, maxHeight: 220, minHeight: 80 });
  const hole = near.mse > 0.02;

  return (
    <Figure
      no={2}
      title="잠재 공간 걷기"
      hint="잠재 평면을 누르거나 십자선을 끌어 보세요"
      caption={
        <>
          12×12 이미지 {items.length}장(원, 고리, 막대 각 80장)을 숫자 두 개로 압축하는 오토인코더를 지금 브라우저에서 학습합니다. 점 하나가 이미지 한 장의 코드이고, 색은 모양입니다. 십자선 위치의 코드를 디코더에 넣은 결과가 "디코더 출력"이고, 그 옆은 훈련 이미지 가운데 그 출력과 가장 비슷한 것입니다. 평면의 범위는 코드들이 퍼진 범위에 맞춰 계속 바뀝니다.
        </>
      }
    >
      <div className="fig-split" ref={figRef}>
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`오토인코더의 2차원 잠재 평면. 십자선 위치 z = (${fmt(z[0], 2)}, ${fmt(z[1], 2)})`}>
          <canvas ref={canvasRef} style={{ cursor: 'crosshair' }} />
        </div>
        <div className="controls">
          <div className="gen-pair">
            <div>
              <div ref={imgRef.wrapRef} className="canvas-box">
                <canvas ref={imgRef.canvasRef} role="img" aria-label="십자선 위치를 디코딩한 이미지" />
              </div>
              <span className="gen-cap">디코더 출력</span>
            </div>
            <div>
              <div ref={nearRef.wrapRef} className="canvas-box">
                <canvas ref={nearRef.canvasRef} role="img" aria-label="가장 비슷한 훈련 이미지" />
              </div>
              <span className="gen-cap">가장 비슷한 훈련 이미지</span>
            </div>
          </div>
          <div className="step-note gen-note" aria-live="polite" data-bad={hole || undefined}>
            {hole ? `어느 훈련 이미지와도 닮지 않은 출력입니다 (차이 ${fmt(near.mse, 3)}).` : `훈련 이미지 하나와 거의 같은 출력입니다 (차이 ${fmt(near.mse, 3)}).`}
          </div>
          <div className="btn-row">
            <Button small onClick={() => setCur(emptiestSpot(codes, view))}>
              빈 곳으로
            </Button>
            <Button small primary onClick={() => setRunning((r) => !r)} disabled={ae.epochs >= EPOCHS}>
              {running ? '일시정지' : '학습'}
            </Button>
            <Button small onClick={() => setSeed((s) => s + 1)} title="가중치를 새로 무작위로 정하고 다시 학습합니다">
              초기화
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="에폭" value={`${Math.floor(ae.progress)} / ${EPOCHS}`} />
            <Readout label="z" value={`${fmt(z[0], 1)}, ${fmt(z[1], 1)}`} />
          </div>
        </div>
      </div>
      <Legend items={SHAPE_NAMES.map((n, i) => ({ color: SHAPE_VARS[i], label: n, shape: 'dot' as const }))} />
    </Figure>
  );
}

/* ─────────────── Figure 3: plain AE vs VAE latent space ─────────────── */

type Mode = 'ae' | 'b1' | 'b4' | 'b16';
const MODE_BETA: Record<Mode, number> = { ae: 0, b1: 1, b4: 4, b16: 16 };
const MODELS = new Map<Mode, ImageAE>();
const model = (m: Mode) => {
  let ae = MODELS.get(m);
  if (!ae) {
    ae = new ImageAE(m !== 'ae', MODE_BETA[m], 1);
    MODELS.set(m, ae);
  }
  return ae;
};
const GRID = 9;
const N_SAMPLES = 8;

function VaeFigure() {
  const P = usePalette();
  const items = images();
  const figRef = useRef<HTMLDivElement>(null);
  const inView = useInView(figRef);
  const [mode, setMode] = useState<Mode>('ae');
  const [running, setRunning] = useState(false);
  const [showDots, setShowDots] = useState(true);
  const [sampleSeed, setSampleSeed] = useState(1);
  const [tick, setTick] = useState(0);
  const ae = model(mode);
  const started = useRef(false);

  useFirstView(figRef, () => {
    started.current = true;
    setRunning(true);
  });
  useEffect(() => {
    if (started.current && !prefersReducedMotion()) setRunning(true);
  }, [mode]);

  useAnimationFrame(() => {
    // the loop may run once more before it is torn down: never train past the last epoch
    budget(7, () => {
      if (ae.epochs >= EPOCHS) return false;
      ae.train(items, 8);
      return ae.epochs < EPOCHS;
    });
    if (ae.epochs >= EPOCHS) setRunning(false);
    setTick((t) => t + 1);
  }, running && inView && ae.epochs < EPOCHS);

  const codes = items.map((it) => ae.encode(it.x));
  const view: View = ae.vae ? { x0: -3, x1: 3, y0: -3, y1: 3 } : fitView(codes, 0.08);
  // the "prior" random samples come from: N(0, I) for a VAE, a Gaussian fitted to the codes for a plain AE
  const prior = useMemo(() => {
    if (ae.vae) return { m: [0, 0], s: [1, 1] };
    const n = codes.length;
    const m = [codes.reduce((a, c) => a + c[0], 0) / n, codes.reduce((a, c) => a + c[1], 0) / n];
    const s = [0, 1].map((d) => Math.sqrt(codes.reduce((a, c) => a + (c[d] - m[d]) ** 2, 0) / n));
    return { m, s };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, Math.floor(tick / 15), ae.epochs]);
  const samples = useMemo(() => {
    const r = rng(sampleSeed * 31 + 7);
    return Array.from({ length: N_SAMPLES }, () => ae.decode([prior.m[0] + prior.s[0] * gauss(r), prior.m[1] + prior.s[1] * gauss(r)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prior, sampleSeed, mode]);
  // metrics are relatively costly: refresh them every few frames while training
  const metrics = useMemo(() => ({ ev: ae.evaluate(items), q: sampleQuality(ae, items, 200, 9, 0.02) }), [mode, Math.floor(tick / 20), ae.epochs >= EPOCHS]); // eslint-disable-line react-hooks/exhaustive-deps

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const side = Math.min(w, h);
      const ox = (w - side) / 2;
      const oy = (h - side) / 2;
      const cell = side / GRID;
      // decode a regular grid of latent points: the decoder's map of the whole plane
      for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
          const zx = view.x0 + ((i + 0.5) / GRID) * (view.x1 - view.x0);
          const zy = view.y1 - ((j + 0.5) / GRID) * (view.y1 - view.y0);
          drawGray(ctx, P, ae.decode([zx, zy]), IMG, ox + i * cell + 1, oy + j * cell + 1, cell - 2);
        }
      }
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      for (let k = 0; k <= GRID; k++) {
        ctx.beginPath();
        ctx.moveTo(ox + k * cell, oy);
        ctx.lineTo(ox + k * cell, oy + side);
        ctx.moveTo(ox, oy + k * cell);
        ctx.lineTo(ox + side, oy + k * cell);
        ctx.stroke();
      }
      const X = (x: number) => ox + ((x - view.x0) / (view.x1 - view.x0)) * side;
      const Y = (y: number) => oy + side - ((y - view.y0) / (view.y1 - view.y0)) * side;
      if (ae.vae) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = P.accent;
        ctx.lineWidth = 1.6;
        for (const rad of [1, 2]) {
          ctx.beginPath();
          ctx.arc(X(0), Y(0), (rad / 6) * side, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      if (showDots) {
        const cols = shapeColors(P);
        codes.forEach(([x, y], i) => {
          ctx.beginPath();
          ctx.arc(X(x), Y(y), 3, 0, Math.PI * 2);
          ctx.fillStyle = cols[items[i].shape];
          ctx.fill();
          ctx.strokeStyle = P.surface;
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }
    },
    [P, mode, ae.progress, showDots],
    { aspect: 1, maxHeight: 440, minHeight: 260 },
  );

  const strip = useCanvas2D(
    (ctx, { w, h }) => {
      const gap = 6;
      const s = Math.min((w - gap * (N_SAMPLES - 1)) / N_SAMPLES, h);
      const x0 = (w - (s * N_SAMPLES + gap * (N_SAMPLES - 1))) / 2;
      samples.forEach((img, i) => drawGray(ctx, P, img, IMG, x0 + i * (s + gap), 0, s));
    },
    [P, samples],
    { aspect: 7.6, maxHeight: 96, minHeight: 36 },
  );

  return (
    <Figure
      no={3}
      title="오토인코더와 VAE의 잠재 공간"
      hint="모델을 바꿔 잠재 공간의 지도를 비교해 보세요"
      caption={
        <>
          배경의 격자는 잠재 평면의 규칙적인 위치 81곳을 디코더에 넣은 결과로, 디코더가 그리는 평면 전체의 지도입니다. 점은 훈련 이미지의 코드(VAE는 평균 <M>{'\\mu'}</M>), 점선 원은 표준 정규분포의 반지름 1과 2입니다. VAE는 평면을 −3부터 3까지, 오토인코더는 코드가 퍼진 범위를 보여 줍니다. 아래 줄은 무작위 코드를 디코딩한 새 이미지입니다. 오토인코더에는 정해진 분포가 없으므로 코드들에 맞춘 정규분포에서 뽑았습니다. 모든 모델은 같은 초기값에서 {EPOCHS}에폭 학습하며, 고른 모델만 학습합니다.
        </>
      }
    >
      <div className="fig-split" ref={figRef}>
        <div ref={wrapRef} className="canvas-box gen-square" role="img" aria-label={`${mode === 'ae' ? '오토인코더' : `β = ${MODE_BETA[mode]}인 VAE`}의 잠재 평면을 디코딩한 격자`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg
            label="모델"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'ae', label: 'AE' },
              { value: 'b1', label: 'β=1' },
              { value: 'b4', label: 'β=4' },
              { value: 'b16', label: 'β=16' },
            ]}
          />
          <div className="btn-row">
            <Button small primary onClick={() => setRunning((r) => !r)} disabled={ae.epochs >= EPOCHS}>
              {running ? '일시정지' : '학습'}
            </Button>
            <Button small onClick={() => setSampleSeed((s) => s + 1)}>
              새로 뽑기
            </Button>
          </div>
          <Check label="코드 점 보기" checked={showDots} onChange={setShowDots} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="에폭" value={`${Math.floor(ae.progress)} / ${EPOCHS}`} />
            <Readout label="복원 오차 (픽셀 MSE)" value={fmt(metrics.ev.mse, 4)} />
            <Readout label="KL 항" value={ae.vae ? fmt(metrics.ev.kl, 2) : '—'} color="var(--accent)" />
            <Readout label="샘플 → 가장 가까운 훈련 이미지" value={fmt(metrics.q.mean, 4)} color="var(--pos)" />
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>
            무작위 샘플 200개 중 훈련 이미지와 차이가 0.02보다 작은 것: <span className="mono">{fmt(metrics.q.clean * 100, 0)}%</span>
          </div>
        </div>
      </div>
      <div>
        <div ref={strip.wrapRef} className="gen-strip">
          <canvas ref={strip.canvasRef} role="img" aria-label={`무작위 코드 ${N_SAMPLES}개를 디코딩한 이미지`} />
        </div>
        <span className="gen-cap">무작위로 뽑은 코드 {N_SAMPLES}개를 디코딩한 결과</span>
      </div>
      <Legend
        items={[
          ...SHAPE_NAMES.map((n, i) => ({ color: SHAPE_VARS[i], label: n, shape: 'dot' as const })),
          ...(ae.vae ? [{ color: 'var(--accent)', label: '표준 정규분포의 1σ, 2σ', shape: 'ln' as const }] : []),
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Autoencoder() {
  return (
    <>
      <h2>정답 없이 배우기</h2>
      <p>
        지금까지 본 신경망은 입력을 받아 정해진 정답을 맞혔습니다. 사진을 받아 "고양이"를 내놓고, 문장을 받아 다음 토큰을 내놓았죠. <T en="generative model">생성 모델</T>은 방향이 반대입니다. 그럴듯한 새 사진, 새 문장, 새 소리를 만들어 냅니다. 그러려면 먼저 데이터가 어떻게 생겼는지, 무엇이 "그럴듯함"인지를 알아야 합니다.
      </p>
      <p>
        <T en="autoencoder">오토인코더</T>는 그 첫걸음입니다. 아이디어는 단순합니다. 입력을 받아 <strong>그 입력 자체를 다시 내놓도록</strong> 학습시키되, 중간에 좁은 통로를 둡니다. 앞쪽 절반인 <T en="encoder">인코더</T>는 입력 <M>{'x'}</M>를 몇 개 안 되는 숫자 <M>{'z'}</M>로 줄이고, 뒤쪽 절반인 <T en="decoder">디코더</T>는 <M>{'z'}</M>만 보고 <M>{'x'}</M>를 되살립니다.
      </p>
      <MB note="손실은 복원한 값과 원래 입력의 차이입니다. 정답 레이블이 필요 없습니다.">{'z = f_\\theta(x), \\qquad \\hat{x} = g_\\phi(z), \\qquad L = \\lVert x - \\hat{x} \\rVert^2'}</MB>
      <p>
        통로가 넓으면 그냥 입력을 그대로 베껴 넘기면 되니 배우는 것이 없습니다. 통로가 좁으면 사정이 다릅니다. 입력의 모든 것을 담을 수 없으니, 복원에 가장 중요한 요점만 골라 담아야 합니다. 이 좁은 통로의 공간을 <T en="latent space">잠재 공간</T>, 그 안의 값 <M>{'z'}</M>를 <T en="code">코드</T> 또는 잠재 벡터라고 합니다. 데이터만 있으면 학습할 수 있으니 레이블을 붙이는 비용이 들지 않습니다.
      </p>

      <h2>가장 좁은 통로: 숫자 하나</h2>
      <p>
        가장 작은 예부터 봅시다. 2차원 점 <M>{'(x_1, x_2)'}</M>를 숫자 하나로 줄였다가 다시 두 좌표로 되살립니다. 디코더는 숫자 하나를 받아 점 하나를 내놓으므로, <M>{'z'}</M>를 이리저리 바꿔 가며 나온 점을 이으면 평면 위의 곡선 하나가 됩니다. 복원한 점은 언제나 이 곡선 위에 있습니다. 결국 학습이란 데이터 사이를 가장 가깝게 지나가는 곡선을 찾고, 각 점을 곡선 위의 어디에 대응시킬지 정하는 일입니다.
      </p>
      <BottleneckFigure />
      <p>
        "길쭉한 구름"에서 선형 모델을 학습시키면 주황 직선이 회전하다가 파란 점선에 겹칩니다. 인코더와 디코더가 모두 선형이고 손실이 제곱 오차이면, 오토인코더는 <T en="principal component analysis">주성분 분석</T>(PCA)과 같은 직선을 찾는다는 것이 알려져 있습니다(Baldi와 Hornik, 1989). 그림의 처음 가중치에서는 1000단계쯤 지나면 두 직선이 이루는 각이 0.00°가 되고, 평균 복원 오차가 PCA로 첫 번째 주축 하나만 남겼을 때의 오차 0.0266과 같아집니다. 이 값은 데이터 공분산 행렬의 작은 고윳값, 곧 주축에 수직인 방향의 분산입니다. 학습 초반에는 복원 오차 선이 직선에 비스듬히 닿다가, 끝나면 모두 직선에 수직으로 떨어지는 것도 볼 수 있습니다. 가장 가까운 점으로 보내는 것이 오차를 가장 줄이기 때문입니다.
      </p>
      <p>
        "초기화"를 몇 번 눌러 보면 직선이 처음에 엉뚱한 쪽으로 돌거나, 주축과 거의 수직인 방향을 한동안 지나며 느리게 움직일 때도 있습니다. 그래도 결국은 주축에 도착합니다. 선형 오토인코더의 손실에는 PCA 해 말고는 지역 최솟값이 없고 나머지 임계점은 모두 안장점이라는 것도 같은 논문의 결과입니다. 다만 인코더와 디코더의 가중치가 PCA의 주축 벡터와 똑같아지지는 않습니다. 인코더가 2배 키운 값을 디코더가 절반으로 줄여도 결과가 같기 때문입니다. 같아지는 것은 복원이 놓이는 직선, 곧 부분공간입니다.
      </p>
      <p>
        데이터를 "휘어진 띠"로 바꾸면 선형 모델의 한계가 드러납니다. 직선은 휘어진 띠를 따라갈 수 없어 오차가 PCA와 같은 0.0343에서 멈춥니다. 인코더와 디코더에 은닉층(뉴런 16개, tanh)을 하나씩 넣으면 주황 선이 휘어지며 띠를 따라가고, 오차가 PCA의 10분의 1 아래로 내려갑니다. 비선형 오토인코더는 PCA를 곡선으로 일반화한 것이라고 볼 수 있습니다.
      </p>

      <h2>이미지의 잠재 공간</h2>
      <p>
        이번에는 12×12 픽셀 흑백 이미지로 해 봅시다. 원, 고리, 막대 세 가지 모양을 80장씩 그렸고, 원과 고리는 크기가, 막대는 기울기가 조금씩 다릅니다. 픽셀 144개를 숫자 2개로 줄이니 72분의 1로 압축하는 셈입니다. 인코더는 144 → 32 → 2, 디코더는 2 → 32 → 144이고, 마지막 층에 시그모이드를 써서 픽셀 값을 0과 1 사이로 냅니다. 픽셀 하나하나를 "칠해질 확률"로 보고 <a href="#ai-basics/entropy">이진 크로스엔트로피</a>를 픽셀마다 더한 것을 손실로 씁니다.
      </p>
      <Code label="인코더와 디코더의 순전파">{`
// 한 층: 가중치 행렬 W(행마다 출력 하나)와 편향 b, 활성화 함수 act
const layer = (W, b, x, act) =>
  W.map((row, k) => act(row.reduce((s, w, j) => s + w * x[j], b[k])));
const tanh = Math.tanh, id = (v) => v, sigmoid = (v) => 1 / (1 + Math.exp(-v));

function encode(x) {                     // x: 픽셀 144개
  const h = layer(We1, be1, x, tanh);    // 은닉 32개
  return layer(We2, be2, h, id);         // z: 숫자 2개
}

function decode(z) {
  const h = layer(Wd1, bd1, z, tanh);    // 은닉 32개
  return layer(Wd2, bd2, h, sigmoid);    // 픽셀 144개, 0~1
}

// 픽셀마다 이진 크로스엔트로피를 더한 복원 손실
const bce = (x, p) => -x.reduce((s, xi, i) => s + xi * Math.log(p[i]) + (1 - xi) * Math.log(1 - p[i]), 0);
const loss = bce(x, decode(encode(x)));  // 역전파로 네 가중치 행렬을 함께 고친다`}</Code>
      <p>
        그림 2는 이 오토인코더를 브라우저에서 학습시키면서 잠재 평면을 보여 줍니다. 학습이 진행될수록 처음에 한데 뭉쳐 있던 코드가 모양별로 갈라지고, 같은 모양 안에서는 크기나 기울기 순서대로 늘어섭니다. 아무도 "크기"나 "기울기"를 알려 주지 않았는데, 복원을 잘하려다 보니 그런 축이 저절로 생긴 것입니다. 십자선을 점들 위로 끌고 다니면 디코더 출력이 매끄럽게 커지거나 돌아갑니다.
      </p>
      <LatentWalkFigure />
      <p>
        이번에는 "빈 곳으로"를 눌러 보세요. 코드에서 가장 먼 빈자리로 십자선이 옮겨 가는데, 거기서 나오는 이미지는 대개 어느 모양과도 닮지 않은 얼룩입니다. 오토인코더의 손실은 훈련 이미지의 코드가 잘 복원되는지만 따지고, 코드 사이의 빈 땅에서 디코더가 무엇을 내놓든 상관하지 않기 때문입니다. 코드들이 어디에 얼마나 넓게 퍼질지도 정해져 있지 않아서, 학습할 때마다 다른 범위, 다른 배치가 나옵니다. "초기화"를 눌러 다시 학습시키면 확인할 수 있습니다.
      </p>
      <p>
        이것이 오토인코더로 새 이미지를 만들기 어려운 이유입니다. 디코더는 있지만, 어디에서 <M>{'z'}</M>를 뽑아야 그럴듯한 이미지가 나오는지 알 수 없습니다.
      </p>

      <h2>VAE: 점 대신 구름으로</h2>
      <p>
        <T en="variational autoencoder, VAE">변분 오토인코더</T>(VAE, Kingma와 Welling, 2013)는 두 가지를 바꿔 이 문제를 풉니다.
      </p>
      <ul>
        <li>
          인코더가 코드 하나 대신 <strong>정규분포 하나</strong>를 내놓습니다. 차원마다 평균 <M>{'\\mu'}</M>와 표준편차 <M>{'\\sigma'}</M>를 출력하고, 디코더에는 그 분포 <M>{'\\mathcal{N}(\\mu, \\sigma^2)'}</M>에서 뽑은 <M>{'z'}</M>를 넣습니다. 같은 이미지라도 매번 조금씩 다른 <M>{'z'}</M>가 들어가므로, 디코더는 점 하나가 아니라 그 주변의 작은 구름 전체를 같은 이미지로 복원해야 합니다.
        </li>
        <li>
          손실에 항을 하나 더합니다. 인코더가 내놓은 분포가 <a href="#ai-basics/probability">표준 정규분포</a> <M>{'\\mathcal{N}(0, I)'}</M>에서 멀어질수록 벌점을 줍니다. 거리로는 <a href="#ai-basics/entropy">KL 발산</a>을 씁니다.
        </li>
      </ul>
      <MB note="첫 항은 복원 오차, 둘째 항은 각 이미지의 구름을 원점 근처의 표준 정규분포 쪽으로 끌어당기는 힘입니다. β = 1이 원래의 VAE입니다.">
        {'L = \\underbrace{\\mathbb{E}_{z \\sim q(z|x)}\\big[-\\log p(x \\mid z)\\big]}_{\\text{복원}} \\;+\\; \\beta\\,\\underbrace{D_{\\mathrm{KL}}\\big(\\mathcal{N}(\\mu, \\sigma^2)\\,\\|\\,\\mathcal{N}(0, I)\\big)}_{\\text{정규화}}'}
      </MB>
      <p>
        두 정규분포 사이의 KL은 닫힌 식으로 계산됩니다. 차원마다 <M>{'\\tfrac12(\\mu^2 + \\sigma^2 - \\log\\sigma^2 - 1)'}</M>이고, <M>{'\\mu = 0'}</M>, <M>{'\\sigma = 1'}</M>일 때만 0입니다. 두 항은 서로 반대쪽으로 당깁니다. 복원 항은 이미지마다 코드를 또렷하게(<M>{'\\sigma'}</M>를 작게) 하고 서로 멀리 떨어뜨리고 싶어 하고, KL 항은 모든 코드를 원점 근처에 크기 1짜리 구름으로 모으고 싶어 합니다. 그 타협의 결과로 구름들이 빈틈없이 맞붙어 원점 주위를 채웁니다. 빈 땅이 없으니 표준 정규분포에서 아무 <M>{'z'}</M>나 뽑아도 디코더가 그럴듯한 이미지를 내놓습니다. 이것이 VAE로 새 데이터를 만드는 방법입니다.
      </p>
      <p>
        β = 1일 때 이 손실은 데이터의 로그 가능도에 대한 하한, <T en="evidence lower bound, ELBO">ELBO</T>에 마이너스를 붙인 것과 같습니다. 그래서 VAE를 학습하는 것은 데이터의 확률을 높이는 일로도 해석됩니다. β를 1보다 크게 두는 변형은 β-VAE라고 부릅니다.
      </p>

      <h2>재매개변수화 요령</h2>
      <p>
        한 가지 걸림돌이 있습니다. 역전파는 미분할 수 있는 계산을 거꾸로 따라가는데, "분포에서 무작위로 뽑기"는 미분할 수 없어 보입니다. 뽑힌 값이 <M>{'\\mu'}</M>와 <M>{'\\sigma'}</M>에 어떻게 의존하는지가 식으로 드러나 있지 않기 때문입니다. 해결책은 무작위성을 바깥으로 빼내는 것입니다. 표준 정규분포에서 <M>{'\\varepsilon'}</M>을 따로 뽑고, <M>{'z'}</M>를 그것의 함수로 씁니다.
      </p>
      <MB note="ε는 학습할 대상이 아닌 입력 취급입니다. z는 μ와 σ에 대해 평범한 덧셈과 곱셈이라 기울기가 그대로 흐릅니다.">{'z = \\mu + \\sigma \\odot \\varepsilon, \\qquad \\varepsilon \\sim \\mathcal{N}(0, I)'}</MB>
      <p>
        이것을 <T en="reparameterization trick">재매개변수화 요령</T>이라고 합니다. <M>{'z'}</M>의 분포는 그대로 <M>{'\\mathcal{N}(\\mu, \\sigma^2)'}</M>이면서, <M>{'\\partial z / \\partial \\mu = 1'}</M>, <M>{'\\partial z / \\partial \\sigma = \\varepsilon'}</M>으로 미분이 됩니다. 실제로는 <M>{'\\sigma'}</M>가 늘 양수가 되도록 인코더가 <M>{'\\log \\sigma^2'}</M>을 출력하게 합니다.
      </p>
      <Code label="VAE 손실: 재매개변수화와 두 항">{`
function vaeLoss(x, beta) {
  const [mu1, mu2, logVar1, logVar2] = encodeVAE(x);  // 인코더 출력이 4개
  const mu = [mu1, mu2], logVar = [logVar1, logVar2];

  // 재매개변수화: 무작위성은 eps에만 있고, mu와 sigma로는 기울기가 흐른다
  const z = mu.map((m, i) => m + Math.exp(0.5 * logVar[i]) * randn());
  const rec = bce(x, decode(z));

  // KL(N(mu, sigma²) ‖ N(0, 1)): 차원마다 닫힌 식
  const kl = mu.reduce((s, m, i) => s + 0.5 * (m * m + Math.exp(logVar[i]) - logVar[i] - 1), 0);
  return rec + beta * kl;
}

// 생성: 표준 정규분포에서 z를 뽑아 디코더만 쓴다
const newImage = decode([randn(), randn()]);`}</Code>

      <h2>두 잠재 공간 비교하기</h2>
      <p>
        그림 3은 같은 이미지, 같은 초기 가중치로 오토인코더와 VAE를 학습시켜 잠재 평면 전체를 디코딩해 봅니다. 격자 칸 하나하나가 그 위치의 <M>{'z'}</M>를 디코더에 넣은 결과입니다.
      </p>
      <VaeFigure />
      <p>
        오토인코더(AE)의 지도에는 코드 점이 없는 칸이 많고, 그중 상당수에서는 어느 모양도 아닌 얼룩이 나옵니다. 코드들에 맞춘 정규분포에서 뽑아도 일부는 빈 땅에 떨어져 망가진 이미지가 됩니다. 150에폭 뒤 무작위 샘플과 가장 가까운 훈련 이미지 사이의 평균 차이(픽셀 MSE)를 재 보면 AE는 0.04대, β = 1인 VAE는 0.01 아래로 다섯 배쯤 차이 납니다. VAE의 지도에서는 원이 점점 커지다 고리가 되고, 고리가 막대로 바뀌는 식으로 칸과 칸이 매끄럽게 이어집니다.
      </p>
      <p>
        β를 키우면 KL 항이 이깁니다. 코드가 원점으로 더 몰리고 구름이 커져서 서로 겹치고, 디코더는 겹친 이미지들의 평균을 낼 수밖에 없어 출력이 흐려집니다. β = 16에서는 복원 오차가 β = 1일 때의 8배가 넘고, 한 축은 거의 정보를 담지 않게 됩니다. 그 축으로는 이미지마다 <M>{'\\sigma'}</M>가 1에 가까워 사전 분포와 거의 같고, 디코더는 그 축의 값을 사실상 무시합니다. 이처럼 β는 또렷한 복원과 매끄럽게 채워진 잠재 공간 사이의 손잡이입니다.
      </p>
      <Callout kind="note">
        실제 사진에 VAE를 쓰면 결과가 흐릿한 경우가 많습니다. 모르는 부분을 평균으로 메우는 성질 때문입니다. 그래서 오늘날 이미지 생성에서는 VAE가 직접 그림을 그리기보다, 큰 이미지를 작은 잠재 표현으로 압축하는 역할을 맡는 경우가 많습니다. 다음 장의 <a href="#ai-deep-learning/diffusion">확산 모델</a>이 이 잠재 공간 안에서 그림을 그리고, 마지막에 VAE의 디코더가 그것을 픽셀로 되돌립니다.
      </Callout>

      <h2>오토인코더는 어디에 쓰이나</h2>
      <ul>
        <li>
          <strong>차원 축소와 시각화.</strong> 고차원 데이터를 2~3차원 코드로 줄여 그려 보면 데이터의 구조가 보입니다.
        </li>
        <li>
          <strong>이상 탐지.</strong> 정상 데이터로만 학습한 오토인코더는 처음 보는 유형의 입력을 잘 복원하지 못합니다. 복원 오차가 큰 입력을 이상 신호로 봅니다.
        </li>
        <li>
          <strong>노이즈 제거.</strong> 입력에 일부러 노이즈를 섞고 깨끗한 원본을 복원하게 학습시킨 것을 <T en="denoising autoencoder">디노이징 오토인코더</T>라고 합니다. 노이즈를 걷어 내는 법을 배운다는 이 발상이 확산 모델의 핵심이기도 합니다.
        </li>
        <li>
          <strong>잠재 공간에서의 생성.</strong> 이미지 생성 모델 Stable Diffusion은 512×512×3 이미지를 오토인코더로 64×64×4 크기의 잠재 표현으로 줄인 다음, 그 작은 공간에서 확산 모델을 돌립니다. 계산량이 크게 줄어듭니다.
        </li>
      </ul>
      <p>여기서 쓴 모델은 가중치가 1만 개도 채 안 되지만, 실제 모델은 합성곱층을 여러 겹 쌓아 수백만~수억 개의 가중치를 쓰고 훨씬 큰 잠재 공간을 둡니다. 인코더, 디코더, 복원 손실, KL 항이라는 뼈대는 같습니다.</p>

      <Callout kind="key">
        오토인코더는 입력을 좁은 잠재 공간으로 압축했다가 복원하도록 학습해 데이터의 요점을 담은 코드를 얻습니다. 선형 오토인코더는 PCA와 같은 부분공간을 찾고, 비선형이면 곡선과 곡면도 따라갑니다. 하지만 코드 사이의 빈 땅은 아무것도 보장하지 않아서 새 데이터를 뽑을 수 없습니다. VAE는 인코더가 정규분포를 내놓게 하고 KL 항으로 그 분포들을 표준 정규분포 쪽으로 끌어당겨 잠재 공간을 빈틈없이 채우며, 재매개변수화 요령 덕분에 무작위 샘플링을 지나서도 역전파가 됩니다. β는 복원의 선명함과 잠재 공간의 매끄러움 사이의 균형을 정합니다.
      </Callout>
      <Quiz
        q="VAE에서 KL 항의 가중치 β를 아주 크게 하면 어떻게 되는가?"
        options={['복원이 더 또렷해진다', '모든 코드가 표준 정규분포와 거의 같아져 디코더가 흐릿한 평균 이미지를 내놓는다', '잠재 공간에 빈 땅이 더 많이 생긴다', '재매개변수화를 쓸 수 없게 된다']}
        answer={1}
        explain={<>β가 크면 손실에서 KL 항이 압도합니다. 가장 쉬운 해법은 입력과 상관없이 모든 이미지에 대해 μ ≈ 0, σ ≈ 1을 내놓는 것인데, 그러면 코드가 입력에 대한 정보를 거의 담지 못합니다. 디코더는 어떤 이미지가 들어왔는지 모르는 채로 복원 오차를 줄여야 하니 여러 이미지의 평균 같은 흐릿한 결과를 냅니다. 그림 3의 β = 16이 그 모습입니다.</>}
      />
    </>
  );
}
