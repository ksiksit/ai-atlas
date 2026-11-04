import { useRef, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import type { Plot } from '../../../../lib/plot';
import { alpha, lerpColor, rgbStr, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { F_SHAPE, KEY_HINT, UNIT_SQUARE, arrow, circlePts, hitPoint, knob, label, lineThrough, plane, poly, snapIn, tGrid, useKeyHandles, useLaColors } from './draw';
import { I2, add, ap, col, det, ease, eig2, inv, lerpMat, nf, norm, scale, texM2, tn, unit, type Mat2, type Vec2 } from './la';
import './linear.css';

const vs = (v: Vec2, d = 1) => `(${nf(v[0], d)}, ${nf(v[1], d)})`;

/* ─────────────── Figure 1: det = signed area of the image of the unit square ─────────────── */

const AREA_PRESETS: { name: string; m: Mat2 }[] = [
  { name: '늘이기', m: [2, 0, 0, 1.5] },
  { name: '밀기', m: [1, 1.2, 0, 1] },
  { name: '반사', m: [-1, 0, 0, 1] },
  { name: '납작', m: [1, 2, 0.5, 1] },
  { name: '회전', m: [0.71, -0.71, 0.71, 0.71] },
];
const BLOB: Vec2[] = circlePts(0.8).map((p) => [p[0] - 2.2, p[1] + 1.4] as Vec2);

function AreaFigure() {
  const P = usePalette();
  const [C1, C2] = useLaColors(P);
  const [A, setA] = useState<Mat2>([1.5, 0.5, 0.3, 1.2]);
  const [t, setT] = useState(1);
  const plotRef = useRef<Plot | null>(null);
  const At = lerpMat(I2, A, t);
  const D = det(At);
  const ci = col(At, 0);
  const cj = col(At, 1);
  const setCol = (k: string, p: Vec2) => {
    setT(1);
    setA((m) => (k === 'i' ? [p[0], m[1], p[1], m[3]] : [m[0], p[0], m[2], p[1]]));
  };
  const keys = useKeyHandles(['i', 'j'], (k, dx, dy) => {
    const c = col(A, k === 'i' ? 0 : 1);
    setCol(k, [Math.round((c[0] + dx) * 10) / 10, Math.round((c[1] + dy) * 10) / 10]);
  });
  const fillCol = D >= 0 ? C2 : P.bad;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 3.8, { cx: 0, cy: 0.6 });
      plotRef.current = plot;
      tGrid(plot, At, alpha(P.ink3, 0.25), 1, 10);
      poly(plot, UNIT_SQUARE, At, alpha(fillCol, 0.25), fillCol, 2);
      poly(plot, BLOB, At, alpha(P.hl, 0.25), P.hl, 1.5);
      poly(plot, F_SHAPE, At, alpha(C1, 0.5), C1, 1.2);
      // orientation: a small arc from Aî towards Aĵ
      const a0 = Math.atan2(ci[1], ci[0]);
      let a1 = Math.atan2(cj[1], cj[0]);
      let dA = a1 - a0;
      while (dA > Math.PI) dA -= 2 * Math.PI;
      while (dA < -Math.PI) dA += 2 * Math.PI;
      a1 = a0 + dA;
      if (Math.abs(D) > 0.02) {
        const r = 0.45;
        ctx.save();
        ctx.strokeStyle = fillCol;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let s = 0; s <= 24; s++) {
          const an = a0 + (dA * s) / 24;
          const x = plot.X(r * Math.cos(an));
          const y = plot.Y(r * Math.sin(an));
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
        arrow(plot, [r * Math.cos(a1 - 0.25 * Math.sign(dA)), r * Math.sin(a1 - 0.25 * Math.sign(dA))], [r * Math.cos(a1), r * Math.sin(a1)], fillCol, 2, 8);
      }
      arrow(plot, [0, 0], ci, P.neg, 3, 12);
      arrow(plot, [0, 0], cj, P.pos, 3, 12);
      knob(plot, ci, P.neg, P, keys.active === 'i');
      knob(plot, cj, P.pos, P, keys.active === 'j');
      label(plot, 'Aî', ci, P.neg, P, 10, 14);
      label(plot, 'Aĵ', cj, P.pos, P, 10, -14);
      const mid = ap(At, [0.5, 0.5]);
      plot.text(nf(D, 2), mid[0], mid[1], fillCol, { align: 'center', bg: alpha(P.surface, 0.85), font: `700 13px ${P.fontMono}` });
    },
    [P, At, keys.active],
    { aspect: 1.2, maxHeight: 470 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => hitPoint(plotRef.current, x, y, [['i', ci], ['j', cj]]),
    onDrag: (k, x, y) => setCol(String(k), snapIn(plotRef.current!, x, y)),
  });

  const blobArea = Math.PI * 0.64;
  return (
    <Figure
      no={1}
      title="행렬식 = 단위 정사각형이 변한 넓이 (부호 포함)"
      hint="Aî, Aĵ 끝을 끌거나 변환 진행을 움직여 보세요"
      caption={<>푸른 평행사변형이 넓이 1이던 단위 정사각형의 행방이고, 가운데 숫자가 행렬식입니다. 노란 원도 같은 비율로 넓이가 바뀝니다. 작은 화살표는 Aî에서 Aĵ로 도는 방향인데, 이 방향이 시계 방향으로 바뀌면 평면이 뒤집힌 것이고 행렬식이 음수(빨강)가 됩니다. 변환 진행을 천천히 움직이면, 뒤집히는 변환은 도중에 반드시 넓이 0을 지나는 것을 볼 수 있습니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`Aî = ${vs(ci, 2)}, Aĵ = ${vs(cj, 2)}. 행렬식 ${nf(D, 2)}: 넓이 ${nf(Math.abs(D), 2)}배, ${D < 0 ? '방향이 뒤집힘' : Math.abs(D) < 0.01 ? '평면이 납작해짐' : '방향 유지'}. ${KEY_HINT}`} {...keys.props} />
        </div>
        <div className="controls">
          <div className="la-tex">
            <M>{`\\det ${texM2(At, 2, P.neg, P.pos)}`}</M>
          </div>
          <div className="la-tex">
            <M>{`= ${tn(At[0], 2)}\\cdot${tn(At[3], 2)} - ${tn(At[1], 2)}\\cdot${tn(At[2], 2)} = ${tn(D, 2)}`.replace(/\\cdot(-[\d.]+)/g, '\\cdot($1)')}</M>
          </div>
          <Slider id="ar-t" label="변환 진행 (단위행렬 → A)" value={t} min={0} max={1} step={0.01} onChange={setT} format={(v) => `${Math.round(v * 100)}%`} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="det A" value={nf(D, 3)} color={D < -0.005 ? 'var(--bad)' : Math.abs(D) < 0.005 ? 'var(--hl)' : 'var(--c-math-2)'} />
            <Readout label="넓이 배율 |det A|" value={`${nf(Math.abs(D), 2)}배`} />
            <Readout label="원의 넓이" value={`${nf(blobArea, 2)} → ${nf(blobArea * Math.abs(D), 2)}`} color="var(--hl)" />
            <Readout label="방향" value={D < -0.005 ? '뒤집힘' : Math.abs(D) < 0.005 ? '납작함' : '유지'} />
          </div>
          <div className="btn-row">
            {AREA_PRESETS.map((p) => (
              <Button key={p.name} small onClick={() => { setA(p.m); setT(1); }}>
                {p.name}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: A, then A⁻¹ ─────────────── */

const DOTS: Vec2[] = (() => {
  const out: Vec2[] = [];
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) out.push([i * 0.5, j * 0.5]);
  return out;
})();

function InverseFigure() {
  const P = usePalette();
  const [C1] = useLaColors(P);
  const [k, setK] = useState(1.2);
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  const A: Mat2 = [2, 1, 1, k];
  const D = det(A);
  const Ai = inv(A);
  const singular = Math.abs(D) < 1e-6;
  const tMax = singular ? 1 : 2;
  const tt = Math.min(t, tMax);
  // stage 1: I → A. stage 2: apply A⁻¹ on top, i.e. A⁻¹·(A at full) = path from A back to I
  const Mt = tt <= 1 ? lerpMat(I2, A, ease(tt)) : lerpMat(A, I2, ease(tt - 1));
  const nullDir: Vec2 = unit([1, -2]); // null space of [[2,1],[1,0.5]]

  useAnimationFrame(
    (dt) => {
      setT((x) => {
        const n = x + dt * 0.7;
        if (n >= tMax) {
          setPlaying(false);
          return tMax;
        }
        return n;
      });
    },
    playing && inView,
  );
  const play = () => {
    if (prefersReducedMotion()) {
      setT(tMax);
      return;
    }
    setT(0);
    setPlaying(true);
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 3.2, { numbers: false });
      tGrid(plot, Mt, alpha(P.ink3, 0.3), 1, 10);
      if (singular && tt > 0.99) lineThrough(plot, [2, 1], alpha(P.bad, 0.5), 4);
      DOTS.forEach((p) => {
        // colour encodes the starting position: blue→orange left to right, more yellow towards the top
        const c = rgbStr(lerpColor(rgbStr(lerpColor(P.neg, P.pos, (p[0] + 1) / 2)), P.hl, ((p[1] + 1) / 2) * 0.6));
        const q = ap(Mt, p);
        plot.dot(q[0], q[1], 5, c, P.surface, 1);
      });
      if (singular) {
        // two different inputs that land on the same output
        const p1: Vec2 = [0.5, 0.5];
        const p2 = add(p1, scale(nullDir, 1.2));
        const q1 = ap(Mt, p1);
        const q2 = ap(Mt, p2);
        plot.dot(q1[0], q1[1], 8, alpha(C1, 0.25), C1, 2);
        plot.dot(q2[0], q2[1], 8, alpha(P.hl, 0.25), P.hl, 2);
        if (tt > 0.99) label(plot, '두 점이 한 곳에', q1, P.bad, P, 12, -16);
      }
    },
    [P, Mt, singular, tt],
    { aspect: 1.25, maxHeight: 420 },
  );

  const stage = tt < 0.01 ? '원래 평면' : tt < 1 ? 'A를 적용하는 중' : tt < 1.01 ? 'A를 적용함' : tt < 1.99 ? 'A⁻¹을 적용하는 중' : 'A⁻¹까지 적용: 제자리로 돌아옴';
  return (
    <Figure
      no={2}
      title="역행렬은 변환을 되돌린다"
      hint="재생하고, k를 0.5 쪽으로 옮겨 보세요"
      caption={<>색 점 25개가 A로 옮겨졌다가 A⁻¹로 원래 자리에 돌아옵니다. 각 점의 색은 원래 위치를 나타냅니다. k = 0.5에서 행렬식이 0이 되면 평면이 빨간 직선 하나로 짓눌리고, 분홍 점과 노란 점처럼 서로 다른 점이 한 곳에 겹쳐 버립니다. 겹친 점을 보고 원래 어느 점이었는지 알 수 없으니 되돌릴 방법이 없습니다.</>}
    >
      <div className="fig-split" ref={box}>
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} role="img" aria-label={`행렬 A = (2, 1; 1, ${nf(k, 2)}), 행렬식 ${nf(D, 2)}. 현재 단계: ${stage}. ${singular ? '행렬식이 0이라 역행렬이 없음.' : ''}`} />
        </div>
        <div className="controls">
          <Slider id="iv-k" label="A의 오른쪽 아래 성분 k" value={k} min={-0.5} max={1.5} step={0.05} onChange={(v) => { setK(Math.round(v * 100) / 100); setPlaying(false); setT(1); }} format={(v) => nf(v, 2)} />
          <div className="la-tex">
            <M>{`A = ${texM2(A, 2)},\\quad \\det A = ${tn(D, 2)}`}</M>
          </div>
          <div className="la-tex">
            <M>{Ai ? `A^{-1} = \\frac{1}{${tn(D, 2)}}${texM2([A[3], -A[1], -A[2], A[0]], 2)}` : 'A^{-1}\\ \\text{없음 } (\\det A = 0)'}</M>
          </div>
          {Ai && (
            <div className="la-tex">
              <M>{`= ${texM2(Ai, 2)}`}</M>
            </div>
          )}
          <Slider id="iv-t" label={`진행: ${stage}`} value={tt} min={0} max={tMax} step={0.01} onChange={(v) => { setPlaying(false); setT(v); }} format={(v) => nf(v, 2)} />
          <Button primary onClick={play}>
            ▶ A 다음 A⁻¹ 재생
          </Button>
          <div className="la-status" data-tone={singular ? 'bad' : Math.abs(D) < 0.3 ? 'hl' : 'good'} aria-live="polite">
            {singular ? (
              <>
                <strong>det A = 0.</strong> (1, −2) 방향의 벡터가 모두 0으로 가서 평면이 직선이 되었습니다. 역행렬이 없습니다.
              </>
            ) : Math.abs(D) < 0.3 ? (
              <>
                행렬식이 0에 가까워 역행렬의 성분이 커졌습니다({nf(Math.max(...Ai!.map(Math.abs)), 1)}). 거의 납작한 평면을 다시 펴려면 크게 늘여야 하기 때문입니다.
              </>
            ) : (
              <>A⁻¹A = I. 모든 점이 제자리로 돌아옵니다.</>
            )}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: rank, column space and null space ─────────────── */

const RANK_PRESETS: { name: string; m: Mat2 }[] = [
  { name: '계수 2', m: [1, 0.5, -0.4, 1] },
  { name: '계수 1', m: [1, 2, 0.5, 1] },
  { name: '계수 1 (사영)', m: [1, 0, 0, 0] },
  { name: '계수 0', m: [0, 0, 0, 0] },
];

function nullInfo(A: Mat2): { rank: 0 | 1 | 2; nullDir: Vec2 | null; colDir: Vec2 | null } {
  if (A.every((v) => Math.abs(v) < 1e-9)) return { rank: 0, nullDir: null, colDir: null };
  if (Math.abs(det(A)) > 1e-9) return { rank: 2, nullDir: null, colDir: null };
  // rank 1: one nonzero row gives the null direction, one nonzero column the image direction
  const r: Vec2 = norm([A[0], A[1]]) > 1e-9 ? [A[0], A[1]] : [A[2], A[3]];
  const c: Vec2 = norm([A[0], A[2]]) > 1e-9 ? [A[0], A[2]] : [A[1], A[3]];
  return { rank: 1, nullDir: unit([-r[1], r[0]]), colDir: unit(c) };
}

function RankFigure() {
  const P = usePalette();
  const [C1, C2] = useLaColors(P);
  const [pi, setPi] = useState(1);
  const [x, setX] = useState<Vec2>([1.2, 0.8]);
  const [slide, setSlide] = useState(0);
  const inRef = useRef<Plot | null>(null);
  const A = RANK_PRESETS[pi].m;
  const { rank, nullDir, colDir } = nullInfo(A);
  const xs: Vec2 = nullDir ? add(x, scale(nullDir, slide)) : x;
  const Ax = ap(A, xs);
  const keys = useKeyHandles(['x'], (_k, dx, dy) => setX([Math.round((x[0] + dx) * 10) / 10, Math.round((x[1] + dy) * 10) / 10]));

  const left = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 3.2, { numbers: false });
      inRef.current = plot;
      if (rank === 0) plot.shade(alpha(P.bad, 0.12));
      if (nullDir) {
        lineThrough(plot, nullDir, alpha(P.bad, 0.75), 4);
        lineThrough(plot, nullDir, alpha(P.ink2, 0.6), 1.5, [6, 5], x);
        for (let s = -3; s <= 3; s++) if (s) plot.dot(x[0] + nullDir[0] * s * 0.8, x[1] + nullDir[1] * s * 0.8, 4, alpha(C1, 0.55));
      }
      arrow(plot, [0, 0], xs, C1, 3, 11);
      knob(plot, xs, C1, P, keys.active === 'x');
      label(plot, `x = ${vs(xs)}`, xs, C1, P, 10, -14);
    },
    [P, A, x, xs, keys.active],
    { aspect: 1, maxHeight: 320 },
  );
  const right = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 3.2, { numbers: false });
      if (rank === 2) plot.shade(alpha(C2, 0.1));
      if (colDir) lineThrough(plot, colDir, alpha(C2, 0.85), 4);
      if (rank === 0) plot.dot(0, 0, 7, C2);
      arrow(plot, [0, 0], Ax, C1, 3, 11);
      plot.dot(Ax[0], Ax[1], 5, C1);
      label(plot, `Ax = ${vs(Ax)}`, Ax, C1, P, 10, -14);
    },
    [P, A, Ax],
    { aspect: 1, maxHeight: 320 },
  );

  useDrag(left.canvasRef, {
    hit: (px, py) => hitPoint(inRef.current, px, py, [['x', xs]]),
    onDrag: (_k, px, py) => {
      const p = snapIn(inRef.current!, px, py);
      setX(nullDir ? add(p, scale(nullDir, -slide)) : p);
    },
  });

  const nul = 2 - rank;
  return (
    <Figure
      no={3}
      title="계수와 영공간: 무엇이 0으로 사라지는가"
      hint="행렬을 고르고, x를 끌거나 영공간 방향으로 밀어 보세요"
      caption={<>왼쪽이 입력 평면, 오른쪽이 출력 평면입니다. 빨간 직선이 0으로 보내지는 벡터들, 즉 영공간이고, 오른쪽 푸른 영역이 A가 닿을 수 있는 출력 전체, 즉 열공간입니다. x를 영공간 방향(점선)으로 밀어도 Ax는 꼼짝하지 않습니다. 영공간이 클수록 열공간은 작아집니다.</>}
    >
      <div className="controls row">
        <Seg label="행렬" value={pi} onChange={(i) => { setPi(i); setSlide(0); }} options={RANK_PRESETS.map((p, i) => ({ value: i, label: p.name }))} />
      </div>
      <div className="la-two">
        <div className="la-panel">
          <div className="la-panel-title">
            <span>입력 x</span>
            <span style={{ color: 'var(--bad)' }}>영공간: {nul === 0 ? '원점뿐' : nul === 1 ? '직선' : '평면 전체'}</span>
          </div>
          <div ref={left.wrapRef} className="canvas-box grab">
            <canvas ref={left.canvasRef} role="img" aria-label={`입력 평면: x = ${vs(xs)}. 영공간의 차원 ${nul}. ${KEY_HINT}`} {...keys.props} />
          </div>
        </div>
        <div className="la-panel">
          <div className="la-panel-title">
            <span>출력 Ax</span>
            <span style={{ color: 'var(--c-math-2)' }}>열공간: {rank === 2 ? '평면 전체' : rank === 1 ? '직선' : '원점뿐'}</span>
          </div>
          <div ref={right.wrapRef} className="canvas-box">
            <canvas ref={right.canvasRef} role="img" aria-label={`출력 평면: Ax = ${vs(Ax)}. 열공간의 차원 ${rank}.`} />
          </div>
        </div>
      </div>
      <div className="fig-split">
        <div className="controls">
          <Slider id="rk-s" label="x를 영공간 방향으로 밀기" value={slide} min={-2} max={2} step={0.05} onChange={setSlide} format={(v) => (nullDir ? nf(v, 2) : '영공간이 원점뿐')} />
          <div className="la-note" aria-live="polite">
            {rank === 2 ? <>계수 2: 서로 다른 입력은 늘 서로 다른 출력으로 갑니다. 0으로 가는 것은 0벡터뿐이고 역행렬이 있습니다.</> : rank === 1 ? <>계수 1: 평면이 직선으로 접힙니다. 점선 위의 모든 입력이 같은 출력 하나로 모입니다. 그래서 Ax = b의 해는 없거나(b가 직선 밖), 점선 하나만큼 무수히 많습니다.</> : <>계수 0: 영행렬은 모든 것을 원점으로 보냅니다.</>}
          </div>
        </div>
        <div className="controls">
          <div className="la-tex">
            <M>{`A = ${texM2(A, 1)}`}</M>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <Readout label="계수 (rank)" value={rank} color="var(--c-math-2)" />
            <Readout label="영공간 차원" value={nul} color="var(--bad)" />
            <Readout label="둘의 합 (= n)" value={rank + nul} />
          </div>
        </div>
      </div>
      <Legend items={[{ color: 'var(--bad)', label: '영공간 (Ax = 0인 x)', shape: 'ln' }, { color: 'var(--c-math-2)', label: '열공간 (가능한 Ax)', shape: 'ln' }, { color: 'var(--c-math-1)', label: 'x와 Ax', shape: 'ln' }]} />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Determinants() {
  const ev = eig2([2, 1, 1, 2]);
  return (
    <>
      <h2>넓이가 몇 배가 되는가</h2>
      <p>
        <a href={lessonHref('math-linear-algebra', 'matrices')}>2장</a>에서 선형변환은 격자를 곧고 고르게 남긴다고 했습니다. 고르다는 것은 모든 칸이 똑같이 변한다는 뜻입니다. 그러니 넓이 1인 정사각형 칸 하나가 넓이 3인 평행사변형이 되었다면, 다른 모든 칸도, 그 칸들로 근사할 수 있는 어떤 도형도 넓이가 정확히 3배가 됩니다. 이 배율 하나가 변환의 중요한 성질을 많이 알려 줍니다. 이 수를 <T en="determinant">행렬식</T>이라고 하고 <M>{'\\det A'}</M>로 씁니다.
      </p>
      <MB note="a, b, c, d는 2×2 행렬의 네 성분입니다. 넓이에 방향을 나타내는 부호까지 붙인 값입니다.">{'\\det \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc'}</MB>
      <p>
        왜 <M>{'ad - bc'}</M>일까요? 밀기 행렬 <M>{'\\begin{pmatrix} 1 & k \\\\ 0 & 1 \\end{pmatrix}'}</M>을 떠올려 보세요. 카드 더미를 옆으로 밀어도 더미의 부피는 그대로이듯 넓이가 변하지 않고, 실제로 <M>{'1\\cdot 1 - k \\cdot 0 = 1'}</M>입니다. 대각행렬 <M>{'\\begin{pmatrix} a & 0 \\\\ 0 & d \\end{pmatrix}'}</M>는 가로 a배, 세로 d배이니 넓이가 <M>{'ad'}</M>배입니다. 일반적인 행렬은 밀기 몇 번과 대각행렬로 바꿀 수 있고, 그 계산을 따라가면 <M>{'ad - bc'}</M>가 나옵니다. 그림 1에서 직접 확인해 보세요.
      </p>
      <AreaFigure />
      <p>
        행렬식에는 부호가 있습니다. "반사"를 눌러 보면 넓이는 1배 그대로인데 행렬식은 −1입니다. F가 거울에 비친 모양이 되고, Aî에서 Aĵ로 가는 작은 화살표가 시계 방향으로 바뀝니다. 음수 행렬식은 평면이 <strong>뒤집혔다</strong>는 뜻입니다. 장갑을 뒤집으면 왼손 장갑이 오른손 장갑이 되는 것처럼, 뒤집힘은 평면 안에서 돌리고 늘이는 것만으로는 만들 수 없습니다. 그래서 변환 진행 슬라이더로 단위행렬에서 반사 쪽으로 천천히 가면 도중에 반드시 행렬식이 0이 되는 순간을 지납니다.
      </p>
      <Callout kind="intuition">
        행렬식의 가장 쓸모 있는 성질은 곱셈과 잘 맞는다는 것입니다. A가 넓이를 3배, B가 2배 하면 둘을 이어서 한 BA는 6배입니다: <M>{'\\det(BA) = \\det B \\cdot \\det A'}</M>. 두 번 뒤집으면(음수 × 음수) 다시 바로 서는 것도 이 식에 들어 있습니다.
      </Callout>
      <p>
        3×3 행렬에서는 단위 정육면체가 평행육면체가 되고, 행렬식은 그 <strong>부피</strong>의 배율입니다. 공식은 길어지지만 뜻은 같습니다. 직접 계산할 때는 공식을 외우기보다 <a href={lessonHref('math-linear-algebra', 'elimination')}>3장의 가우스 소거</a>를 쓰는 편이 빠릅니다. 행에 다른 행의 배수를 더하는 연산은 밀기와 같아서 행렬식을 바꾸지 않고, 행을 바꾸면 부호만 뒤집힙니다. 계단 모양이 되면 행렬식은 대각선 위 피벗들의 곱입니다.
      </p>
      <Code label="행렬식을 소거로 구하기">{`
// n×n 행렬의 행렬식: 소거 후 피벗의 곱 × (행 교환마다 −1)
function det(A) {
  const M = A.map((row) => row.slice());
  const n = M.length;
  let sign = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++)
      if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return 0; // 피벗 없음: 납작함
    if (p !== c) { [M[c], M[p]] = [M[p], M[c]]; sign = -sign; }
    for (let r = c + 1; r < n; r++) {
      const m = M[r][c] / M[c][c];
      for (let k = c; k < n; k++) M[r][k] -= m * M[c][k];
    }
  }
  let d = sign;
  for (let i = 0; i < n; i++) d *= M[i][i];
  return d;
}

det([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]]); // -1`}</Code>

      <h2>역행렬: 되돌리기</h2>
      <p>
        변환 A를 하고 나서 원래대로 되돌리는 변환이 있다면, 그것을 A의 <T en="inverse matrix">역행렬</T> <M>{'A^{-1}'}</M>이라고 합니다. "A 다음 <M>{'A^{-1}'}</M>"과 "<M>{'A^{-1}'}</M> 다음 A"가 모두 아무것도 하지 않는 변환, 즉 <T en="identity matrix">단위행렬</T> I가 되어야 합니다. 2×2 행렬의 역행렬에는 간단한 공식이 있습니다.
      </p>
      <MB note="대각선 두 성분 a, d는 자리를 바꾸고, 나머지 두 성분 b, c는 부호를 바꾼 다음 행렬식으로 나눕니다.">{'A^{-1}A = AA^{-1} = I, \\qquad \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}^{-1} = \\frac{1}{ad - bc}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}'}</MB>
      <p>공식에 행렬식으로 나누는 부분이 있으니, 행렬식이 0이면 역행렬이 없습니다. 그림으로 보면 그 이유가 분명합니다.</p>
      <InverseFigure />
      <p>
        행렬식이 0이라는 것은 평면이 선이나 점으로 짓눌렸다는 뜻입니다. 이때 서로 다른 두 점이 같은 곳에 떨어지므로, 결과만 보고 원래 점을 하나로 정할 수 없습니다. <a href={lessonHref('math-discrete', 'sets-functions')}>이산수학에서 본 말</a>로 하면 단사가 아니니 역함수가 없는 것입니다. 행렬식이 0이 아니지만 아주 작을 때도 조심해야 합니다. 거의 납작한 평면을 펴려면 크게 늘여야 해서 역행렬의 성분이 커지고, 입력의 작은 오차가 크게 부풉니다. 이런 행렬을 <T en="ill-conditioned">조건이 나쁘다</T>고 합니다.
      </p>
      <Callout kind="warn">
        <M>{'A\\mathbf x = \\mathbf b'}</M>를 풀 때 <M>{'A^{-1}'}</M>을 구해서 <M>{'\\mathbf x = A^{-1}\\mathbf b'}</M>로 계산하는 것은 식으로는 깔끔하지만 실제로는 피합니다. 역행렬을 구하는 데 소거보다 계산이 약 세 배 들고 반올림 오차도 더 큽니다. NumPy에서도 <code>inv(A) @ b</code> 대신 <code>solve(A, b)</code>를 쓰는 것이 원칙입니다. 역행렬은 계산 도구라기보다 "되돌릴 수 있는가"를 생각하는 개념입니다.
      </Callout>

      <h2>계수와 영공간</h2>
      <p>
        되돌릴 수 없는 변환은 정보를 얼마나 잃을까요? 2×2 행렬이 평면을 직선으로 접으면 한 방향의 정보를 통째로 잃고, 점으로 접으면 전부 잃습니다. 이것을 두 가지 공간으로 정리합니다.
      </p>
      <ul>
        <li>
          <T en="column space">열공간</T>: A가 만들 수 있는 출력 전체. 열들의 생성 공간입니다. 그 차원이 <T en="rank">계수</T>이고, 3장에서 센 피벗의 개수와 같습니다.
        </li>
        <li>
          <T en="null space">영공간</T>: A가 0으로 보내는 입력 전체 <M>{'\\{\\mathbf x \\mid A\\mathbf x = \\mathbf 0\\}'}</M>. 변환하면서 사라지는 방향들입니다.
        </li>
      </ul>
      <RankFigure />
      <p>
        그림 3에서 두 공간의 차원을 더하면 언제나 입력의 차원 2가 됩니다. 사라지는 방향이 하나 늘 때마다 남는 방향이 하나 줄어드는 셈이고, 이를 <T en="rank–nullity theorem">계수-영공간 정리</T>라고 합니다. 또 x를 영공간 방향으로 밀어도 Ax가 그대로라는 것은, <M>{'A\\mathbf x = \\mathbf b'}</M>의 해가 하나 있으면 거기에 영공간의 벡터를 아무거나 더해도 해라는 뜻입니다. 3장에서 "해가 무수히 많음"이 바로 이 상황이었고, 자유 변수의 개수가 영공간의 차원입니다.
      </p>
      <MB note="n은 입력 벡터의 차원(행렬의 열 개수)입니다.">{'\\operatorname{rank} A + \\dim \\operatorname{null} A = n'}</MB>
      <Callout kind="key">
        n×n 행렬 A에 대해 다음은 모두 같은 말입니다. 하나가 참이면 전부 참이고, 하나가 거짓이면 전부 거짓입니다.
        <ul style={{ margin: '0.4em 0 0' }}>
          <li>
            <M>{'\\det A \\ne 0'}</M> (공간이 납작해지지 않는다)
          </li>
          <li>
            역행렬 <M>{'A^{-1}'}</M>이 있다 (되돌릴 수 있다)
          </li>
          <li>계수가 n이다, 즉 소거하면 피벗이 n개 선다</li>
          <li>영공간이 원점뿐이다 (0으로 사라지는 방향이 없다)</li>
          <li>
            모든 b에 대해 <M>{'A\\mathbf x = \\mathbf b'}</M>의 해가 꼭 하나 있다
          </li>
          <li>A의 열들이 선형 독립이고 공간 전체를 생성한다 (기저이다)</li>
        </ul>
      </Callout>
      <p>
        이 목록은 앞의 네 장을 한 줄로 묶습니다. 다음 장의 고유벡터도 이 목록에서 출발합니다. 행렬 <M>{'A - \\lambda I'}</M>의 행렬식이 0이 되는 λ를 찾으면, 그 행렬의 영공간에 고유벡터가 있습니다. 예를 들어 <M>{'\\begin{pmatrix} 2 & 1 \\\\ 1 & 2 \\end{pmatrix}'}</M>에서는 <M>{`\\lambda = ${tn(ev[0].l, 0)}, ${tn(ev[1].l, 0)}`}</M>일 때 그렇습니다.
      </p>
      <Quiz
        q={<>2×2 행렬 A는 넓이를 3배로, B는 넓이를 2배로 하면서 평면을 뒤집는다(<M>{'\\det B = -2'}</M>). <M>{'\\det(A^{-1}B)'}</M>는?</>}
        options={['−6', '−2/3', '2/3', '−1/6']}
        answer={1}
        explain={<><M>{'\\det A^{-1} = 1/\\det A = 1/3'}</M>입니다. A가 넓이를 3배로 했으니 되돌리는 변환은 1/3배로 해야 하니까요. 따라서 <M>{'\\det(A^{-1}B) = (1/3)\\cdot(-2) = -2/3'}</M>. 음수이니 전체적으로 평면이 한 번 뒤집힙니다.</>}
      />
    </>
  );
}
