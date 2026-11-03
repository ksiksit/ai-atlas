import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../components/ui';
import { useAnimationFrame, useCanvas2D, useDrag, useInView, prefersReducedMotion } from '../../../lib/canvas';
import { Plot, fmt } from '../../../lib/plot';
import { usePalette, alpha, lerpColor, rgbStr } from '../../../lib/theme';

type Mat = [number, number, number, number]; // [a, b, c, d] = [[a, b], [c, d]]
const I: Mat = [1, 0, 0, 1];
const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[1] * y, m[2] * x + m[3] * y];
const lerpMat = (A: Mat, B: Mat, t: number): Mat => A.map((v, i) => v + (B[i] - v) * t) as Mat;
const det = (m: Mat) => m[0] * m[3] - m[1] * m[2];
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function eigen(m: Mat): { l: number; v: [number, number] }[] {
  const [a, b, c, d] = m;
  const tr = a + d;
  const disc = tr * tr - 4 * det(m);
  if (disc < -1e-9) return [];
  const s = Math.sqrt(Math.max(0, disc));
  const ls = s < 1e-6 ? [tr / 2] : [(tr + s) / 2, (tr - s) / 2];
  const out: { l: number; v: [number, number] }[] = [];
  for (const l of ls) {
    let v: [number, number];
    if (Math.abs(b) > 1e-6) v = [b, l - a];
    else if (Math.abs(c) > 1e-6) v = [l - d, c];
    else {
      // diagonal matrix: axes are eigenvectors
      if (s < 1e-6) return [{ l, v: [1, 0] }, { l, v: [0, 1] }];
      v = Math.abs(l - a) < 1e-6 ? [1, 0] : [0, 1];
    }
    const n = Math.hypot(v[0], v[1]);
    if (n > 1e-9) out.push({ l, v: [v[0] / n, v[1] / n] });
  }
  return out;
}

const PRESETS: { name: string; m: Mat }[] = [
  { name: '회전 30°', m: [Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6), Math.sin(Math.PI / 6), Math.cos(Math.PI / 6)] },
  { name: '늘리기', m: [2, 0, 0, 0.5] },
  { name: '기울이기', m: [1, 1, 0, 1] },
  { name: '반사', m: [-1, 0, 0, 1] },
  { name: '납작하게', m: [0.5, 0.5, 0.5, 0.5] },
];

/** Draws a transformed square grid of lines x=k, y=k. */
function drawGrid(plot: Plot, m: Mat, color: string, width: number, extent = 8) {
  const c = plot.ctx;
  c.save();
  c.beginPath();
  c.rect(plot.pad.l, plot.pad.t, plot.pw, plot.ph);
  c.clip();
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  for (let k = -extent; k <= extent; k++) {
    let p = apply(m, k, -extent);
    let q = apply(m, k, extent);
    c.moveTo(plot.X(p[0]), plot.Y(p[1]));
    c.lineTo(plot.X(q[0]), plot.Y(q[1]));
    p = apply(m, -extent, k);
    q = apply(m, extent, k);
    c.moveTo(plot.X(p[0]), plot.Y(p[1]));
    c.lineTo(plot.X(q[0]), plot.Y(q[1]));
  }
  c.stroke();
  c.restore();
}

function poly(plot: Plot, pts: [number, number][], fill?: string, stroke?: string, width = 2) {
  const c = plot.ctx;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(plot.X(x), plot.Y(y)) : c.moveTo(plot.X(x), plot.Y(y))));
  c.closePath();
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.stroke();
  }
}

// An "F" made of rectangles, so reflections are visible.
const F_SHAPE: [number, number][][] = [
  [
    [-2.6, 0.4],
    [-2.3, 0.4],
    [-2.3, 2.2],
    [-2.6, 2.2],
  ],
  [
    [-2.3, 1.9],
    [-1.5, 1.9],
    [-1.5, 2.2],
    [-2.3, 2.2],
  ],
  [
    [-2.3, 1.2],
    [-1.8, 1.2],
    [-1.8, 1.5],
    [-2.3, 1.5],
  ],
];

/* ─────────────── Figure 1: linear transformation playground ─────────────── */

function TransformFigure() {
  const P = usePalette();
  const [A, setA] = useState<Mat>([1, 1, 0, 1]);
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [showEig, setShowEig] = useState(true);
  const [showV, setShowV] = useState(false);
  const plotRef = useRef<Plot | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inView = useInView(boxRef);

  const Mt = lerpMat(I, A, ease(t));
  const D = det(A);
  const eig = eigen(Mt);

  useAnimationFrame(
    (dt) => {
      setT((x) => {
        const n = Math.min(1, x + dt / 1.4);
        if (n >= 1) setPlaying(false);
        return n;
      });
    },
    playing && inView,
  );

  const play = () => {
    if (prefersReducedMotion()) {
      setT(1);
      return;
    }
    setT(0);
    setPlaying(true);
  };

  const setPreset = (m: Mat) => {
    setA(m.map((v) => Math.round(v * 100) / 100) as Mat);
    if (prefersReducedMotion()) setT(1);
    else {
      setT(0);
      setPlaying(true);
    }
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -4.2, xMax: 4.2, yMin: -3.2, yMax: 3.2, equal: true, pad: { l: 6, r: 6, t: 6, b: 6 } });
      plotRef.current = plot;
      // original grid (faint)
      drawGrid(plot, I, P.grid, 1);
      // transformed grid
      drawGrid(plot, Mt, alpha(P.accent, 0.28), 1.2);
      // transformed axes
      const axX1 = apply(Mt, -20, 0);
      const axX2 = apply(Mt, 20, 0);
      const axY1 = apply(Mt, 0, -20);
      const axY2 = apply(Mt, 0, 20);
      plot.ctx.save();
      plot.clip();
      plot.line(axX1[0], axX1[1], axX2[0], axX2[1], alpha(P.accent, 0.7), 1.5);
      plot.line(axY1[0], axY1[1], axY2[0], axY2[1], alpha(P.accent, 0.7), 1.5);
      plot.unclip();
      plot.ctx.restore();

      // unit square → parallelogram
      const dNow = det(Mt);
      const sq: [number, number][] = [apply(Mt, 0, 0), apply(Mt, 1, 0), apply(Mt, 1, 1), apply(Mt, 0, 1)];
      poly(plot, sq, alpha(dNow >= 0 ? P.hl : P.bad, 0.28), alpha(dNow >= 0 ? P.hl : P.bad, 0.9), 1.5);
      const cen = apply(Mt, 0.5, 0.5);
      plot.text(`넓이 ${fmt(Math.abs(dNow), 2)}`, cen[0], cen[1], P.ink, { align: 'center', font: `600 11px ${P.fontBody}`, bg: alpha(P.surface, 0.8) });

      // F shape
      for (const part of F_SHAPE) poly(plot, part.map(([x, y]) => apply(Mt, x, y)), alpha(P.dl, 0.75));

      // eigenvectors
      if (showEig) {
        plot.ctx.save();
        plot.clip();
        for (const e of eig) {
          plot.line(-e.v[0] * 20, -e.v[1] * 20, e.v[0] * 20, e.v[1] * 20, alpha(P.ink2, 0.55), 1.5, [7, 5]);
        }
        plot.unclip();
        plot.ctx.restore();
        for (const e of eig) {
          const s = Math.sign(e.v[0] || 1);
          const lx = e.v[0] * s * 2.9;
          const ly = e.v[1] * s * 2.9;
          if (lx > plot.xMin && lx < plot.xMax && ly > plot.yMin && ly < plot.yMax) plot.text(`λ = ${fmt(e.l, 2)}`, lx, ly, P.ink2, { dy: -12, align: 'center', font: `600 11px ${P.fontMono}`, bg: alpha(P.surface, 0.85) });
        }
      }

      // vector v = (2, 1) built from columns
      if (showV) {
        const iH = apply(Mt, 1, 0);
        const v = apply(Mt, 2, 1);
        const twoI: [number, number] = [iH[0] * 2, iH[1] * 2];
        plot.line(0, 0, twoI[0], twoI[1], alpha(P.good, 0.6), 4);
        plot.line(twoI[0], twoI[1], v[0], v[1], alpha(P.bad, 0.6), 4);
        plot.arrow(0, 0, v[0], v[1], P.ink, 2.5, 11);
        plot.text('v', v[0], v[1], P.ink, { dx: 8, dy: -8 });
      }

      // basis vectors
      const i1 = apply(Mt, 1, 0);
      const j1 = apply(Mt, 0, 1);
      plot.arrow(0, 0, i1[0], i1[1], P.good, 3.5, 13);
      plot.arrow(0, 0, j1[0], j1[1], P.bad, 3.5, 13);
      plot.dot(i1[0], i1[1], 6, P.surface, P.good, 2.5);
      plot.dot(j1[0], j1[1], 6, P.surface, P.bad, 2.5);
      plot.text('î', i1[0], i1[1], P.good, { dx: 10, dy: 10, font: `700 15px ${P.fontBody}` });
      plot.text('ĵ', j1[0], j1[1], P.bad, { dx: 10, dy: -10, font: `700 15px ${P.fontBody}` });
      plot.dot(0, 0, 3, P.ink);
    },
    [P, Mt[0], Mt[1], Mt[2], Mt[3], showEig, showV],
    { aspect: 1.35, maxHeight: 480 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      const p = plotRef.current;
      if (!p) return null;
      const i1 = apply(Mt, 1, 0);
      const j1 = apply(Mt, 0, 1);
      if (Math.hypot(p.X(i1[0]) - x, p.Y(i1[1]) - y) < 16) return 'i';
      if (Math.hypot(p.X(j1[0]) - x, p.Y(j1[1]) - y) < 16) return 'j';
      return null;
    },
    onDrag: (id, x, y) => {
      const p = plotRef.current!;
      const snap = (v: number) => Math.max(-3, Math.min(3, Math.round(v * 10) / 10));
      const vx = snap(p.invX(x));
      const vy = snap(p.invY(y));
      setPlaying(false);
      setT(1);
      setA((m) => (id === 'i' ? [vx, m[1], vy, m[3]] : [m[0], vx, m[2], vy]));
    },
  });

  const setEntry = (k: number, v: number) => {
    setPlaying(false);
    setT(1);
    setA((m) => m.map((x, i) => (i === k ? v : x)) as Mat);
  };

  const tex = `\\begin{pmatrix} \\textcolor{${P.good}}{${fmt(A[0], 2)}} & \\textcolor{${P.bad}}{${fmt(A[1], 2)}} \\\\ \\textcolor{${P.good}}{${fmt(A[2], 2)}} & \\textcolor{${P.bad}}{${fmt(A[3], 2)}} \\end{pmatrix}`.replace(/−/g, '-');

  return (
    <Figure
      no={1}
      title="행렬은 공간을 변형한다"
      hint="î, ĵ 화살표 끝을 끌거나 프리셋을 눌러 보세요"
      caption={<>파란 격자는 변환된 공간, 노란 칸은 원래 넓이 1이던 단위 정사각형, 보라색 F는 방향을 보여 주는 표식입니다. 행렬식이 음수가 되면 F가 뒤집히고 칸이 빨갛게 바뀝니다. 점선은 변환 뒤에도 방향이 바뀌지 않는 고유벡터의 직선입니다.</>}
    >
      <div className="fig-split">
        <div ref={boxRef}>
          <div ref={wrapRef} className="canvas-box">
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <div style={{ textAlign: 'center', fontSize: '1.05rem' }}>
            <M>{`A = ${tex}`}</M>
          </div>
          <div className="fig-cols" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Slider id="mat-a" label="a" value={A[0]} min={-2} max={2} step={0.1} onChange={(v) => setEntry(0, v)} format={(v) => fmt(v, 1)} color="var(--good)" />
            <Slider id="mat-b" label="b" value={A[1]} min={-2} max={2} step={0.1} onChange={(v) => setEntry(1, v)} format={(v) => fmt(v, 1)} color="var(--bad)" />
            <Slider id="mat-c" label="c" value={A[2]} min={-2} max={2} step={0.1} onChange={(v) => setEntry(2, v)} format={(v) => fmt(v, 1)} color="var(--good)" />
            <Slider id="mat-d" label="d" value={A[3]} min={-2} max={2} step={0.1} onChange={(v) => setEntry(3, v)} format={(v) => fmt(v, 1)} color="var(--bad)" />
          </div>
          <div className="btn-row">
            {PRESETS.map((p) => (
              <Button key={p.name} small onClick={() => setPreset(p.m)}>
                {p.name}
              </Button>
            ))}
          </div>
          <Slider id="mat-t" label="변환 진행" value={t} min={0} max={1} step={0.01} onChange={(v) => { setPlaying(false); setT(v); }} format={(v) => `${Math.round(v * 100)}%`} />
          <Button primary onClick={play}>
            ▶ 처음부터 변환 재생
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="행렬식 det A" value={fmt(D, 2)} color={D < 0 ? 'var(--bad)' : undefined} />
            <Readout label="고유값 λ" value={eigen(A).length ? eigen(A).map((e) => fmt(e.l, 2)).join(', ') : '실수 없음'} />
          </div>
          <Check label="고유벡터 직선 보기" checked={showEig} onChange={setShowEig} />
          <Check label="v = (2, 1) 따라가기" checked={showV} onChange={setShowV} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a neural-network layer bends space ─────────────── */

type Stage = 0 | 1 | 2 | 3;
const STAGES: { label: string; tex: string }[] = [
  { label: '입력 x', tex: '\\mathbf{x}' },
  { label: 'Wx', tex: 'W\\mathbf{x}' },
  { label: 'Wx + b', tex: 'W\\mathbf{x}+\\mathbf{b}' },
  { label: 'ReLU', tex: '\\mathrm{ReLU}(W\\mathbf{x}+\\mathbf{b})' },
];

const W_SETS: { W: Mat; b: [number, number] }[] = [
  { W: [1.2, -0.7, 0.6, 1.1], b: [0.3, -0.4] },
  { W: [0.4, 1.3, -1.1, 0.5], b: [-0.2, 0.5] },
  { W: [1.5, 0.3, 0.9, -1.0], b: [0.1, 0.2] },
];

function mapStage(x: number, y: number, W: Mat, b: [number, number], stage: number): [number, number] {
  // stage is continuous in [0,3]
  const lin = apply(W, x, y);
  const aff: [number, number] = [lin[0] + b[0], lin[1] + b[1]];
  const rel: [number, number] = [Math.max(0, aff[0]), Math.max(0, aff[1])];
  if (stage <= 1) return [x + (lin[0] - x) * stage, y + (lin[1] - y) * stage];
  if (stage <= 2) {
    const s = stage - 1;
    return [lin[0] + (aff[0] - lin[0]) * s, lin[1] + (aff[1] - lin[1]) * s];
  }
  const s = stage - 2;
  return [aff[0] + (rel[0] - aff[0]) * s, aff[1] + (rel[1] - aff[1]) * s];
}

function LayerFigure() {
  const P = usePalette();
  const [target, setTarget] = useState<Stage>(0);
  const [stage, setStage] = useState(0);
  const [set, setSet] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inView = useInView(boxRef);
  const { W, b } = W_SETS[set];
  const N = 13;
  const pts = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) out.push({ x: (-1 + (2 * i) / (N - 1)) * 1.4, y: (-1 + (2 * j) / (N - 1)) * 1.4 });
    return out;
  }, []);

  useAnimationFrame(
    (dt) => {
      setStage((s) => {
        const d = target - s;
        if (Math.abs(d) < 0.01) return target;
        return s + Math.sign(d) * Math.min(Math.abs(d), dt * 1.6);
      });
    },
    Math.abs(stage - target) > 1e-6 && inView,
  );

  const go = (s: Stage) => {
    setTarget(s);
    if (prefersReducedMotion()) setStage(s);
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -3.3, xMax: 3.3, yMin: -3.3, yMax: 3.3, equal: true, pad: { l: 8, r: 8, t: 8, b: 8 } });
      plot.grid({ xStep: 1, yStep: 1, labels: false });
      if (stage > 2) {
        // shade the region ReLU kills (anything negative)
        ctx.save();
        ctx.fillStyle = alpha(P.ink3, 0.08 * (stage - 2));
        ctx.fillRect(plot.pad.l, plot.Y(0), plot.pw, plot.pad.t + plot.ph - plot.Y(0));
        ctx.fillRect(plot.pad.l, plot.pad.t, plot.X(0) - plot.pad.l, plot.Y(0) - plot.pad.t);
        ctx.restore();
      }
      const mapped = pts.map((p) => mapStage(p.x, p.y, W, b, stage));
      const col = (p: { x: number; y: number }) => {
        const c1 = lerpColor(P.neg, P.pos, (p.x / 1.4 + 1) / 2);
        const c2 = lerpColor(P.dl, P.ml, (p.y / 1.4 + 1) / 2);
        return rgbStr([(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2, (c1[2] + c2[2]) / 2]);
      };
      // grid lines connecting points
      ctx.save();
      ctx.strokeStyle = alpha(P.ink3, 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          const k = j * N + i;
          const [x, y] = mapped[k];
          if (i < N - 1) {
            const [x2, y2] = mapped[k + 1];
            ctx.moveTo(plot.X(x), plot.Y(y));
            ctx.lineTo(plot.X(x2), plot.Y(y2));
          }
          if (j < N - 1) {
            const [x2, y2] = mapped[k + N];
            ctx.moveTo(plot.X(x), plot.Y(y));
            ctx.lineTo(plot.X(x2), plot.Y(y2));
          }
        }
      ctx.stroke();
      ctx.restore();
      pts.forEach((p, k) => {
        const [x, y] = mapped[k];
        plot.dot(x, y, 3.6, col(p));
      });
      plot.text(STAGES[Math.round(stage) as Stage].label, plot.xMin, plot.yMax, P.ink2, { dx: 8, dy: 12, font: `600 12px ${P.fontMono}`, bg: alpha(P.surface, 0.85) });
    },
    [P, stage, set],
    { aspect: 1.25, maxHeight: 440 },
  );

  return (
    <Figure
      no={2}
      title="신경망의 한 층이 하는 일"
      hint="단계를 차례로 눌러 보세요"
      caption={<>색깔 점들은 원래 정사각형 격자에 놓여 있던 입력입니다. 행렬 곱 Wx는 격자를 비스듬히 늘리고 돌리기만 할 뿐 직선은 직선으로 남습니다. 편향 b는 전체를 옮깁니다. 마지막 ReLU는 음수 좌표를 0으로 눌러 버려서, 회색 영역에 있던 점들이 축 위로 접힙니다. 이 "접기"가 있어야 층을 쌓았을 때 곡선 모양의 경계를 만들 수 있습니다.</>}
    >
      <div className="fig-split">
        <div ref={boxRef}>
          <div ref={wrapRef} className="canvas-box">
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Seg label="단계" value={target} onChange={go} options={STAGES.map((s, i) => ({ value: i as Stage, label: s.label }))} />
          <div style={{ textAlign: 'center' }}>
            <M>{`\\mathbf{h} = ${STAGES[target].tex}`}</M>
          </div>
          <div style={{ textAlign: 'center', fontSize: '0.95rem' }}>
            <M>{`W = \\begin{pmatrix} ${fmt(W[0], 1)} & ${fmt(W[1], 1)} \\\\ ${fmt(W[2], 1)} & ${fmt(W[3], 1)} \\end{pmatrix},\\ \\mathbf{b} = \\begin{pmatrix} ${fmt(b[0], 1)} \\\\ ${fmt(b[1], 1)} \\end{pmatrix}`.replace(/−/g, '-')}</M>
          </div>
          <Seg label="가중치 예시" value={set} onChange={(s) => setSet(s)} options={W_SETS.map((_, i) => ({ value: i, label: `예시 ${i + 1}` }))} />
          <Legend
            items={[
              { color: 'var(--neg)', label: '왼쪽 입력' },
              { color: 'var(--pos)', label: '오른쪽 입력' },
              { color: 'var(--ink-3)', label: 'ReLU가 지우는 영역', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Matrices() {
  const P = usePalette();
  return (
    <>
      <h2>행렬은 숫자를 직사각형으로 늘어놓은 것</h2>
      <p>
        <T en="matrix">행렬</T>은 숫자를 행과 열로 늘어놓은 표입니다. 엑셀 시트처럼 생각해도 됩니다. 집 100채의 특징 3가지를 모으면 100×3 행렬이 되고, 28×28 흑백 이미지는 그 자체로 28×28 행렬입니다. 행렬은 데이터를 담는 그릇이기도 하지만, 이 장에서는 더 중요한 다른 얼굴을 보려고 합니다. 행렬은 벡터를 받아 다른 벡터로 바꾸는 <strong>기계</strong>입니다.
      </p>
      <MB note="2×2 행렬과 벡터의 곱. 각 행과 벡터의 내적을 구한 것과 같습니다.">{'A\\mathbf{x} = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}\\begin{pmatrix} x \\\\ y \\end{pmatrix} = \\begin{pmatrix} ax + by \\\\ cx + dy \\end{pmatrix}'}</MB>
      <p>
        식으로만 보면 곱하고 더하는 규칙일 뿐입니다. 그런데 평면 위의 모든 점에 이 기계를 한꺼번에 적용하면, 공간 전체가 늘어나고 돌아가고 기울어지는 모습이 보입니다. 이것을 <T en="linear transformation">선형변환</T>이라고 합니다.
      </p>

      <h2>열은 기저 벡터가 도착하는 곳</h2>
      <p>
        행렬을 읽는 가장 좋은 방법이 있습니다. 첫 번째 열 <M>{'(a, c)'}</M>는 x축 방향의 단위 벡터 <M>{'\\hat{\\imath} = (1, 0)'}</M>이 도착하는 위치이고, 두 번째 열 <M>{'(b, d)'}</M>는 y축 방향의 <M>{'\\hat{\\jmath} = (0, 1)'}</M>이 도착하는 위치입니다. 두 화살표가 어디로 가는지만 알면 나머지 모든 점의 행방이 정해집니다.
      </p>
      <TransformFigure />
      <MB note="벡터 (x, y)는 î를 x번, ĵ를 y번 더한 것이므로, 변환 뒤에도 '옮겨진 î를 x번, 옮겨진 ĵ를 y번' 더한 곳에 갑니다.">{`A\\begin{pmatrix} x \\\\ y \\end{pmatrix} = x\\begin{pmatrix} \\textcolor{${P.good}}{a} \\\\ \\textcolor{${P.good}}{c} \\end{pmatrix} + y\\begin{pmatrix} \\textcolor{${P.bad}}{b} \\\\ \\textcolor{${P.bad}}{d} \\end{pmatrix}`}</MB>
      <p>
        그림의 "v = (2, 1) 따라가기"를 켜 보면 이 식이 그대로 보입니다. v는 초록 화살표 두 개와 빨간 화살표 하나를 이어 붙인 곳에 있고, 변환 중에도 그 관계가 유지됩니다. 격자선이 휘지 않고 평행하고 고르게 남는 것이 선형변환의 특징입니다.
      </p>

      <h2>행렬식: 넓이가 몇 배가 되는가</h2>
      <p>
        노란 단위 정사각형을 보세요. 변환 후 평행사변형이 되는데, 그 넓이가 <T en="determinant">행렬식</T>입니다. 행렬식이 2이면 모든 도형의 넓이가 2배가 되고, 0.5이면 절반이 됩니다. 음수이면 공간이 뒤집혀서 F 글자가 거울에 비친 모양이 됩니다.
      </p>
      <MB>{'\\det A = ad - bc'}</MB>
      <p>
        "납작하게" 프리셋을 눌러 보세요. 행렬식이 0이 되면 평면 전체가 직선 하나로 짓눌립니다. 서로 다른 점이 같은 곳으로 가 버리므로 원래 점이 어디였는지 되돌릴 방법이 없습니다. 행렬식이 0인 행렬에 역행렬이 없는 이유가 바로 이것입니다.
      </p>
      <h3>고유벡터: 방향이 바뀌지 않는 화살표</h3>
      <p>
        대부분의 벡터는 변환 뒤에 방향이 바뀝니다. 그런데 어떤 특별한 방향의 벡터는 길이만 늘거나 줄 뿐 같은 직선 위에 머뭅니다. 이런 벡터를 <T en="eigenvector">고유벡터</T>, 늘어나는 배율을 <T en="eigenvalue">고유값</T> <M>{'\\lambda'}</M>라고 합니다. 회전 프리셋에서는 모든 방향이 돌아가므로 실수 고유벡터가 없습니다. 고유벡터는 데이터의 주된 방향을 찾는 주성분 분석(PCA) 등에서 핵심 역할을 합니다.
      </p>
      <MB>{'A\\mathbf{v} = \\lambda\\mathbf{v}'}</MB>

      <h2>변환을 이어 붙이기와 신경망</h2>
      <p>
        변환 A를 한 다음 변환 B를 하면 어떻게 될까요? 결과는 또 하나의 선형변환이고, 그 행렬은 두 행렬의 곱 <M>{'BA'}</M>입니다. 순서가 중요합니다. 오른쪽에 있는 A가 먼저 적용됩니다. 그래서 일반적으로 <M>{'AB \\neq BA'}</M>입니다. 회전한 뒤 늘리는 것과 늘린 뒤 회전하는 것은 결과가 다릅니다.
      </p>
      <MB>{'B(A\\mathbf{x}) = (BA)\\mathbf{x}'}</MB>
      <p>
        이 사실은 딥러닝에서 아주 중요합니다. 신경망의 한 층은 입력 벡터에 가중치 행렬 <M>{'W'}</M>를 곱하고 편향 <M>{'\\mathbf{b}'}</M>를 더한 다음, 활성화 함수를 통과시킵니다. 만약 활성화 함수 없이 행렬 곱만 여러 번 한다면, 위 식처럼 전체가 행렬 하나로 합쳐져 버려서 층을 아무리 쌓아도 직선 경계밖에 못 그립니다.
      </p>
      <LayerFigure />
      <MB note="신경망 한 층의 계산. 행렬 곱(선형), 이동(편향), 접기(활성화 함수)의 세 단계입니다.">{'\\mathbf{h} = \\mathrm{ReLU}(W\\mathbf{x} + \\mathbf{b})'}</MB>
      <Callout kind="key">
        행렬은 공간을 늘리고 돌리고 기울이는 변환입니다. 열을 보면 기저 벡터가 어디로 가는지 알 수 있고, 행렬식은 넓이의 배율입니다. 신경망은 이런 선형변환과 활성화 함수의 "접기"를 번갈아 반복해서 복잡한 모양을 만들어 냅니다.
      </Callout>
      <Quiz
        q="행렬식이 0인 2×2 행렬로 평면을 변환하면 어떻게 될까요?"
        options={['모양은 그대로이고 회전만 한다', '모든 넓이가 2배가 된다', '평면이 직선이나 한 점으로 납작해진다', '좌우가 뒤집힌다']}
        answer={2}
        explain={<>행렬식은 넓이의 배율이므로 0이면 모든 넓이가 0이 됩니다. 평면이 선이나 점으로 짓눌리고, 정보가 사라져 되돌릴 수 없습니다. 좌우 뒤집힘은 행렬식이 음수일 때입니다.</>}
      />
    </>
  );
}

