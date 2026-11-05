import { useMemo, useRef, useState } from 'react';
import { Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { KIND_KO, classify, det, eig, eigvec, expm, integrate, linField, portrait, tankPeak, tanks, trace, type M2 } from './phase';
import './ode.css';
import './linsys.css';

const nf = (v: number, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');
const sci = (v: number) => {
  if (v === 0) return '0';
  const [m, e] = v.toExponential(2).split('e');
  return `${m}×10^${Number(e)}`;
};

/** Eigenvalues as text: "−3, 2" or "−0.5 ± 2i". */
function eigText(A: M2): string {
  const e = eig(A);
  if (e.real) return Math.abs(e.l1 - e.l2) < 1e-9 ? `${nf(e.l1)} (중근)` : `${nf(e.l1)}, ${nf(e.l2)}`;
  return `${nf(e.l1)} ± ${nf(e.im)}i`;
}

/* ───────── shared drawing: a phase portrait of x′ = Ax ───────── */

function drawPortrait(pl: Plot, P: Palette, A: M2, R: number) {
  const ctx = pl.ctx;
  pl.grid({ xStep: 1, yStep: 1, labels: false });
  pl.clip();
  // the direction field: short strokes, darker where the flow is faster
  const n = 13;
  let vmax = 1e-9;
  const pts: [number, number, number, number][] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = -R + ((i + 0.5) * 2 * R) / n, y = -R + ((j + 0.5) * 2 * R) / n;
      const vx = A[0] * x + A[1] * y, vy = A[2] * x + A[3] * y;
      vmax = Math.max(vmax, Math.hypot(vx, vy));
      pts.push([x, y, vx, vy]);
    }
  const L = (R / n) * 0.75;
  for (const [x, y, vx, vy] of pts) {
    const s = Math.hypot(vx, vy);
    if (s < 1e-9) continue;
    const ux = (vx / s) * L, uy = (vy / s) * L;
    pl.arrow(x - ux / 2, y - uy / 2, x + ux / 2, y + uy / 2, alpha(P.ink3, 0.25 + 0.45 * (s / vmax)), 1.2, 5);
  }
  // straight-line solutions along real eigenvectors: green if they flow in, red if they flow out
  const e = eig(A);
  if (e.real) {
    for (const l of e.l1 === e.l2 ? [e.l1] : [e.l1, e.l2]) {
      const v = eigvec(A, l);
      if (!v) continue;
      const c = Math.abs(l) < 1e-9 ? P.ink3 : l < 0 ? P.good : P.bad;
      pl.line(-v[0] * R * 2, -v[1] * R * 2, v[0] * R * 2, v[1] * R * 2, alpha(c, 0.85), 2.5, [7, 5]);
    }
  }
  // trajectories, with an arrowhead halfway along each in the direction of time
  for (const line of portrait(A, R)) {
    if (line.length < 2) continue;
    ctx.strokeStyle = alpha(P.accent, 0.85);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    line.forEach(([x, y], k) => (k ? ctx.lineTo(pl.X(x), pl.Y(y)) : ctx.moveTo(pl.X(x), pl.Y(y))));
    ctx.stroke();
    // pick the visible point closest to the middle of the visible part
    const vis = line.filter(([x, y]) => Math.abs(x) < R && Math.abs(y) < R);
    if (vis.length > 4) {
      const k = Math.floor(vis.length / 2);
      const [x1, y1] = vis[k - 1], [x2, y2] = vis[k];
      if (Math.hypot(x2 - x1, y2 - y1) > 1e-6) pl.arrow(x1, y1, x2, y2, P.accent, 1.6, 7);
    }
  }
  pl.unclip();
  pl.dot(0, 0, 4, P.ink, P.surface, 1.5);
  pl.frame();
}

/** The complex plane with the two eigenvalues. */
function drawEigenPlane(pl: Plot, P: Palette, A: M2) {
  pl.grid({ xStep: 1, yStep: 1, labels: true, axes: true });
  pl.text('Re', pl.xMax, 0, P.ink3, { dx: -4, dy: -9, align: 'right', font: `500 10px ${P.fontMono}` });
  pl.text('Im', 0, pl.yMax, P.ink3, { dx: 6, dy: 8, align: 'left', font: `500 10px ${P.fontMono}` });
  const e = eig(A);
  const pts: [number, number][] = e.real ? [[e.l1, 0], [e.l2, 0]] : [[e.l1, e.im], [e.l1, -e.im]];
  for (const [re, im] of pts) {
    const c = Math.abs(re) < 1e-9 ? P.ink2 : re < 0 ? P.good : P.bad;
    pl.dot(Math.max(pl.xMin, Math.min(pl.xMax, re)), Math.max(pl.yMin, Math.min(pl.yMax, im)), 6, c, P.surface, 2);
  }
  pl.frame();
}

/* ───────── Figure 1: the matrix decides the flow ───────── */

const PRESETS: { id: string; label: string; A: M2 }[] = [
  { id: 'saddle', label: '안장점', A: [1, 1, 4, -2] },
  { id: 'node', label: '안정 마디', A: [-2, 1, 1, -2] },
  { id: 'spiral', label: '안정 나선', A: [-0.5, -2, 2, -0.5] },
  { id: 'center', label: '중심', A: [0, -1, 2, 0] },
];
const R = 3;

function MatrixFigure() {
  const P = usePalette();
  const [A, setA] = useState<M2>(PRESETS[0].A);
  const set = (k: number, v: number) => setA((old) => old.map((a, i) => (i === k ? v : a)) as M2);
  const preset = PRESETS.find((p) => p.A.every((a, i) => Math.abs(a - A[i]) < 1e-9))?.id ?? 'custom';
  const t = trace(A), d = det(A);
  const kind = classify(t, d, 1e-6);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const wide = w >= 600;
      const leftW = wide ? Math.min(h, w * 0.64) : w;
      const portH = wide ? h : Math.min(w, h - 150);
      const pl = new Plot(ctx, w, h, P, { xMin: -R, xMax: R, yMin: -R, yMax: R, equal: true, pad: wide ? { l: 8, r: w - leftW + 8, t: 8, b: 8 } : { l: 8, r: 8, t: 8, b: h - portH + 8 } });
      drawPortrait(pl, P, A, R);
      const ep = new Plot(ctx, w, h, P, { xMin: -4, xMax: 4, yMin: -3, yMax: 3, equal: true, pad: wide ? { l: leftW + 26, r: 10, t: h * 0.25, b: h * 0.25 } : { l: 34, r: 10, t: portH + 26, b: 10 } });
      drawEigenPlane(ep, P, A);
      ctx.fillStyle = P.ink3;
      ctx.font = `600 11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('고윳값 (복소평면)', ep.X(-4), ep.Y(3) - 4);
    },
    [P, A],
    { aspect: 1.55, maxHeight: 460, minHeight: 40 },
  );

  return (
    <Figure
      no={1}
      title="행렬을 바꾸면 흐름이 바뀝니다"
      hint="행렬의 네 수를 움직여 보세요"
      caption={
        <>
          왼쪽은 <M>{'\\mathbf{x}\' = A\\mathbf{x}'}</M>의 위상 평면입니다. 회색 짧은 화살표는 각 점에서 흐름의 방향(진할수록 빠름), 파란 곡선은 해 궤적, 점선은 고유벡터 방향의 직선 해입니다. 직선 해는 고윳값이 음수이면 초록(원점으로 빨려 듦), 양수이면 빨강(밀려 나감)입니다. 오른쪽은 두 고윳값을 복소평면에 찍은 것입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={preset} onChange={(id) => id !== 'custom' && setA(PRESETS.find((p) => p.id === id)!.A)} options={[...PRESETS.map((p) => ({ value: p.id, label: p.label })), ...(preset === 'custom' ? [{ value: 'custom', label: '직접 고친 행렬' }] : [])]} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`행렬 A = [[${nf(A[0], 1)}, ${nf(A[1], 1)}], [${nf(A[2], 1)}, ${nf(A[3], 1)}]]의 위상 평면. 고윳값은 ${eigText(A)}이고 원점은 ${KIND_KO[kind]}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls">
        <div className="ls-matrix">
          <Slider id="ls-a" label={<M>a</M>} value={A[0]} min={-3} max={3} step={0.1} onChange={(v) => set(0, v)} format={(v) => nf(v, 1)} />
          <Slider id="ls-b" label={<M>b</M>} value={A[1]} min={-3} max={3} step={0.1} onChange={(v) => set(1, v)} format={(v) => nf(v, 1)} />
          <Slider id="ls-c" label={<M>c</M>} value={A[2]} min={-4} max={4} step={0.1} onChange={(v) => set(2, v)} format={(v) => nf(v, 1)} />
          <Slider id="ls-d" label={<M>d</M>} value={A[3]} min={-3} max={3} step={0.1} onChange={(v) => set(3, v)} format={(v) => nf(v, 1)} />
        </div>
        <div className="readouts">
          <Readout label="대각합 τ" value={nf(t)} />
          <Readout label="행렬식 Δ" value={nf(d)} />
          <Readout label="고윳값" value={eigText(A)} />
          <Readout label="원점의 종류" value={<span className="ls-kind">{KIND_KO[kind]}</span>} />
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--accent)', label: '해 궤적', shape: 'ln' },
          { color: 'var(--good)', label: '고윳값 < 0인 직선 해', shape: 'ln' },
          { color: 'var(--bad)', label: '고윳값 > 0인 직선 해', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ───────── Figure 2: the trace–determinant plane ───────── */

const TMIN = -4, TMAX = 4, DMIN = -3, DMAX = 5;

function TraceDetFigure() {
  const P = usePalette();
  const [tau, setTau] = useState(-1);
  const [del, setDel] = useState(2);
  // a matrix with this trace and determinant: the companion matrix of x″ − τx′ + Δx = 0
  const A: M2 = [0, 1, -del, tau];
  const kind = classify(tau, del, 0.02);
  const plRef = useRef<Plot | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const wide = w >= 600;
      const leftW = wide ? w * 0.55 : w;
      const topH = wide ? h : h * 0.5;
      const pl = new Plot(ctx, w, h, P, { xMin: TMIN, xMax: TMAX, yMin: DMIN, yMax: DMAX, pad: wide ? { l: 34, r: w - leftW + 12, t: 12, b: 28 } : { l: 34, r: 12, t: 12, b: h - topH + 28 } });
      plRef.current = pl;
      // regions: Δ < 0 saddles; above the parabola spirals; between, nodes
      pl.clip();
      ctx.fillStyle = alpha(P.bad, 0.07);
      ctx.fillRect(pl.X(TMIN), pl.Y(0), pl.X(TMAX) - pl.X(TMIN), pl.Y(DMIN) - pl.Y(0));
      ctx.fillStyle = alpha(P.accent, 0.08);
      ctx.beginPath();
      ctx.moveTo(pl.X(TMIN), pl.Y(DMAX));
      for (let i = 0; i <= 80; i++) {
        const t = TMIN + ((TMAX - TMIN) * i) / 80;
        ctx.lineTo(pl.X(t), pl.Y(Math.min(DMAX, (t * t) / 4)));
      }
      ctx.lineTo(pl.X(TMAX), pl.Y(DMAX));
      ctx.closePath();
      ctx.fill();
      pl.unclip();
      pl.grid({ xStep: 1, yStep: 1, labels: true, axes: true, xLabel: 'τ = 대각합', yLabel: 'Δ = 행렬식' });
      pl.fn((t) => (t * t) / 4, P.ink2, 1.5, { dash: [5, 4] });
      pl.line(0, 0, 0, DMAX, P.ink2, 2);
      const lab = (s: string, x: number, y: number) => pl.text(s, x, y, P.ink2, { font: `600 11px ${P.fontBody}`, bg: P.surface });
      lab('안장점', 0, -1.8);
      lab('안정 나선', -1.2, 3.8);
      lab('불안정 나선', 1.2, 3.8);
      lab('안정 마디', -3.2, 1.3);
      lab('불안정 마디', 3.2, 1.3);
      pl.text('중심 (τ = 0)', 0, DMAX, P.ink2, { dy: 10, dx: 4, align: 'left', font: `600 10px ${P.fontBody}` });
      pl.text('τ² = 4Δ', 3.6, 3.24, P.ink3, { dx: -4, dy: -10, align: 'right', font: `10px ${P.fontMono}` });
      pl.dot(tau, del, 8, P.accent, P.surface, 2.5);
      pl.frame();
      // the portrait for this (τ, Δ)
      const rp = new Plot(ctx, w, h, P, { xMin: -R, xMax: R, yMin: -R, yMax: R, equal: true, pad: wide ? { l: leftW + 16, r: 8, t: 8, b: 8 } : { l: 8, r: 8, t: topH + 8, b: 8 } });
      drawPortrait(rp, P, A, R);
    },
    [P, tau, del],
    { aspect: 1.6, maxHeight: 440, minHeight: 40 },
  );

  useDrag(wrapRef, {
    hit: (x, y) => {
      const pl = plRef.current;
      if (!pl) return null;
      const t = pl.invX(x), d = pl.invY(y);
      return t >= TMIN && t <= TMAX && d >= DMIN && d <= DMAX ? 'p' : null;
    },
    onDrag: (_, x, y) => {
      const pl = plRef.current;
      if (!pl) return;
      const snap = (v: number) => Math.round(v * 20) / 20;
      setTau(snap(Math.max(TMIN, Math.min(TMAX, pl.invX(x)))));
      setDel(snap(Math.max(DMIN, Math.min(DMAX, pl.invY(y)))));
    },
  });

  return (
    <Figure
      no={2}
      title="대각합과 행렬식의 지도"
      hint="왼쪽 평면에서 점을 끌어 보세요"
      caption={
        <>
          왼쪽 평면의 점 하나가 행렬 하나의 (τ, Δ)입니다. 오른쪽은 그 대각합과 행렬식을 갖는 행렬 <M>{'\\begin{pmatrix}0&1\\\\-\\Delta&\\tau\\end{pmatrix}'}</M>의 위상 평면입니다. 점선 포물선 <M>{'\\tau^2 = 4\\Delta'}</M> 위쪽(옅은 파랑)은 고윳값이 복소수라 나선, 아래는 마디, 가로축 아래(옅은 빨강)는 안장점입니다. 경계 위의 판정은 반올림해서 0.02 안이면 경계로 봅니다.
        </>
      }
    >
      <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`대각합 τ = ${nf(tau)}, 행렬식 Δ = ${nf(del)}인 점과 그 행렬의 위상 평면. 원점은 ${KIND_KO[kind]}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <Slider id="ls-tau" label="대각합 τ" value={tau} min={TMIN} max={TMAX} step={0.05} onChange={setTau} format={(v) => nf(v)} />
        <Slider id="ls-del" label="행렬식 Δ" value={del} min={DMIN} max={DMAX} step={0.05} onChange={setDel} format={(v) => nf(v)} />
      </div>
      <div className="readouts">
        <Readout label="판별식 τ² − 4Δ" value={nf(tau * tau - 4 * del)} />
        <Readout label="고윳값" value={eigText(A)} />
        <Readout label="원점의 종류" value={<span className="ls-kind">{KIND_KO[kind]}</span>} />
      </div>
    </Figure>
  );
}

/* ───────── Figure 3: the exact solution e^{At}x₀ against step-by-step methods ───────── */

const SPIRAL: M2 = [-0.5, -2, 2, -0.5];
const X0: [number, number] = [2, 0];
const HS = [0.5, 0.1, 0.01];

function ExactFigure() {
  const P = usePalette();
  const [t, setT] = useState(3);
  const [h, setH] = useState(0.1);
  const E = expm(SPIRAL, t);
  const exact: [number, number] = [E[0] * X0[0] + E[1] * X0[1], E[2] * X0[0] + E[3] * X0[1]];
  const runs = useMemo(() => {
    const f = linField(SPIRAL);
    return HS.map((hh) => ({ h: hh, euler: integrate(f, X0, t, hh, 'euler'), rk4: integrate(f, X0, t, hh, 'rk4') }));
  }, [t]);
  const err = (path: number[][]) => {
    const p = path[path.length - 1];
    return Math.hypot(p[0] - exact[0], p[1] - exact[1]);
  };
  const cur = runs.find((r) => r.h === h)!;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: H }) => {
      const pl = new Plot(ctx, w, H, P, { xMin: -2.2, xMax: 2.6, yMin: -1.6, yMax: 1.9, equal: true, pad: { l: 30, r: 10, t: 10, b: 24 } });
      pl.grid({ xStep: 1, yStep: 1, labels: true, axes: true });
      // the exact curve, sampled from e^{As}x₀
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 300; i++) {
        const s = (t * i) / 300;
        const Es = expm(SPIRAL, s);
        const x = Es[0] * X0[0] + Es[1] * X0[1], y = Es[2] * X0[0] + Es[3] * X0[1];
        if (i) ctx.lineTo(pl.X(x), pl.Y(y));
        else ctx.moveTo(pl.X(x), pl.Y(y));
      }
      ctx.stroke();
      const path = (pts: number[][], c: string) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        pts.forEach((p, k) => (k ? ctx.lineTo(pl.X(p[0]), pl.Y(p[1])) : ctx.moveTo(pl.X(p[0]), pl.Y(p[1]))));
        ctx.stroke();
        if (pts.length <= 80) for (const p of pts) pl.dot(p[0], p[1], 2.5, c);
        const last = pts[pts.length - 1];
        pl.dot(last[0], last[1], 5, c, P.surface, 1.5);
      };
      pl.clip();
      path(cur.euler, P.pos);
      path(cur.rk4, P.neg);
      pl.unclip();
      pl.dot(exact[0], exact[1], 6, P.ink, P.surface, 2);
      pl.dot(X0[0], X0[1], 4, P.ink3);
      pl.text('x₀', X0[0], X0[1], P.ink3, { dx: 8, dy: -10, align: 'left', font: `11px ${P.fontMono}` });
      pl.frame();
    },
    [P, t, h, cur, exact[0], exact[1]],
    { aspect: 1.35, maxHeight: 420, minHeight: 40 },
  );

  return (
    <Figure
      no={3}
      title="정확한 해와 한 걸음씩 푼 해"
      hint="시간 t와 보폭 h를 바꿔 보세요"
      caption={
        <>
          행렬 <M>{'A = \\begin{pmatrix}-0.5&-2\\\\2&-0.5\\end{pmatrix}'}</M>, 처음 값 <M>{'\\mathbf{x}_0 = (2, 0)'}</M>입니다. 검은 곡선(어두운 화면에서는 흰 곡선)은 행렬 지수로 계산한 정확한 해 <M>{'e^{As}\\mathbf{x}_0'}</M>이고, 주황은 오일러 방법, 파랑은 4차 룽게-쿠타(RK4) 방법으로 보폭 h씩 걸어간 해입니다. 표는 시각 t에서 정확한 해와의 거리입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`t = ${nf(t)}까지 푼 해. 정확한 해의 위치는 (${nf(exact[0], 3)}, ${nf(exact[1], 3)})이고, 보폭 ${h}에서 오일러 방법의 오차는 ${sci(err(cur.euler))}, RK4의 오차는 ${sci(err(cur.rk4))}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="ls-t" label="시간 t" value={t} min={0.5} max={6} step={0.1} onChange={setT} format={(v) => nf(v, 1)} />
          <Seg label="보폭 h" value={h} onChange={setH} options={HS.map((v) => ({ value: v, label: String(v) }))} />
          <MB>{`e^{At} = \\begin{pmatrix}${nf(E[0], 3)} & ${nf(E[1], 3)}\\\\ ${nf(E[2], 3)} & ${nf(E[3], 3)}\\end{pmatrix}`}</MB>
          <table className="ls-err">
            <thead>
              <tr>
                <th>보폭 h</th>
                <th>오일러 오차</th>
                <th>RK4 오차</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.h} data-on={r.h === h || undefined}>
                  <td>{r.h}</td>
                  <td>{sci(err(r.euler))}</td>
                  <td>{sci(err(r.rk4))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--ink)', label: '정확한 해', shape: 'ln' },
          { color: 'var(--pos)', label: '오일러', shape: 'ln' },
          { color: 'var(--neg)', label: 'RK4', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ───────── Figure 4: two tanks in a row ───────── */

const SALT = 20;

function TanksFigure() {
  const P = usePalette();
  const [V1, setV1] = useState(100);
  const [V2, setV2] = useState(50);
  const [r, setR] = useState(10);
  const A = tanks(r, V1, V2);
  const peak = tankPeak(r, V1, V2, SALT);
  const Tend = Math.min(200, Math.max(30, 6 / Math.min(r / V1, r / V2)));
  const traj = useMemo(() => integrate(linField(A), [SALT, 0], Tend, Tend / 600), [A[0], A[2], A[3], Tend]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const wide = w >= 600;
      const leftW = wide ? w * 0.6 : w;
      const topH = wide ? h : h * 0.55;
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: Tend, yMin: 0, yMax: SALT * 1.05, pad: wide ? { l: 36, r: w - leftW + 12, t: 12, b: 28 } : { l: 36, r: 12, t: 12, b: h - topH + 28 } });
      pl.grid({ xStep: Tend > 100 ? 40 : Tend > 50 ? 20 : 10, yStep: 5, labels: true, axes: true, xLabel: '시간 (분)', yLabel: '소금 (kg)' });
      const curve = (k: number, c: string) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        traj.forEach((p, i) => {
          const x = pl.X((Tend * i) / (traj.length - 1)), y = pl.Y(p[k]);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.stroke();
      };
      curve(0, P.neg);
      curve(1, P.pos);
      if (peak.t <= Tend) {
        pl.line(peak.t, 0, peak.t, peak.x2, alpha(P.pos, 0.7), 1, [4, 4]);
        pl.dot(peak.t, peak.x2, 5, P.pos, P.surface, 2);
        pl.text(`${nf(peak.t, 1)}분, ${nf(peak.x2)} kg`, peak.t, peak.x2, P.ink2, { dx: 8, dy: -10, align: 'left', font: `11px ${P.fontMono}`, bg: P.surface });
      }
      pl.frame();
      // the same solution in the (x₁, x₂) plane with the two eigen-directions
      const pp = new Plot(ctx, w, h, P, { xMin: -1, xMax: SALT * 1.05, yMin: -1, yMax: SALT * 0.7, pad: wide ? { l: leftW + 34, r: 10, t: 12, b: 28 } : { l: 36, r: 12, t: topH + 12, b: 28 } });
      pp.grid({ xStep: 5, yStep: 5, labels: true, axes: true, xLabel: 'x₁', yLabel: 'x₂' });
      pp.clip();
      const e = eig(A);
      for (const l of [e.l1, e.l2]) {
        const v = eigvec(A, l);
        if (v) pp.line(-v[0] * 60, -v[1] * 60, v[0] * 60, v[1] * 60, alpha(P.good, 0.7), 1.5, [6, 4]);
      }
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      traj.forEach((p, i) => (i ? ctx.lineTo(pp.X(p[0]), pp.Y(p[1])) : ctx.moveTo(pp.X(p[0]), pp.Y(p[1]))));
      ctx.stroke();
      pp.unclip();
      pp.dot(SALT, 0, 4, P.accent);
      pp.frame();
    },
    [P, traj, peak.t, peak.x2, Tend, A[0], A[2], A[3]],
    { aspect: 1.75, maxHeight: 380, minHeight: 40 },
  );

  return (
    <Figure
      no={4}
      title="두 물탱크의 소금"
      hint="탱크 크기와 물의 양을 바꿔 보세요"
      caption={
        <>
          처음에 탱크 1에만 소금 {SALT} kg이 녹아 있습니다. 탱크 1에 맑은 물이 분당 r 리터씩 들어오고, 같은 양이 탱크 2로 넘어가고, 탱크 2에서 같은 양이 빠져나갑니다. 파랑은 탱크 1, 주황은 탱크 2의 소금입니다. 오른쪽은 같은 해를 (x₁, x₂) 평면에 그린 것이고, 초록 점선은 두 고유벡터 방향입니다.
        </>
      }
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`탱크 1 ${V1}리터, 탱크 2 ${V2}리터, 분당 ${r}리터. 고윳값은 ${eigText(A)}이고, 탱크 2의 소금은 ${nf(peak.t, 1)}분에 ${nf(peak.x2)} kg으로 가장 많습니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <Slider id="ls-v1" label="탱크 1 부피 V₁ (L)" value={V1} min={20} max={200} step={10} onChange={setV1} />
        <Slider id="ls-v2" label="탱크 2 부피 V₂ (L)" value={V2} min={20} max={200} step={10} onChange={setV2} />
        <Slider id="ls-r" label="흐르는 양 r (L/분)" value={r} min={2} max={20} step={1} onChange={setR} />
      </div>
      <div className="readouts">
        <Readout label="고윳값 −r/V₁, −r/V₂" value={eigText(A)} />
        <Readout label="탱크 2가 가장 짤 때" value={`${nf(peak.t, 2)}분`} color="var(--pos)" />
        <Readout label="그때 탱크 2의 소금" value={`${nf(peak.x2)} kg`} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function LinearSystems() {
  return (
    <>
      <h2>두 양이 서로를 바꿀 때</h2>
      <p>
        앞 장까지는 변하는 양이 하나였습니다. 하지만 탱크 두 개의 소금, 서로 연결된 두 용수철, 경쟁하는 두 회사의 점유율처럼 두 양이 서로의 변화를 정하는 경우가 많습니다. 가장 단순한 경우는 변화율이 두 양의 일차식인 경우입니다.
      </p>
      <MB>{`\\begin{aligned} x' &= ax + by \\\\ y' &= cx + dy \\end{aligned} \\qquad\\Longleftrightarrow\\qquad \\mathbf{x}' = A\\mathbf{x},\\quad A = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}`}</MB>
      <p>
        이것을 <T en="linear system">연립 선형 미분방정식</T>이라고 합니다. 해 <M>{'(x(t), y(t))'}</M>는 평면 위를 움직이는 점이고, 그 점이 그리는 곡선을 <T en="trajectory">궤적</T>, 궤적들을 모아 그린 평면을 <T en="phase plane">위상 평면</T>이라고 합니다. 원점에서는 <M>{'A\\mathbf{0} = \\mathbf{0}'}</M>이라 아무것도 변하지 않으므로 원점은 언제나 <T en="equilibrium">평형점</T>입니다. 질문은 원점 근처에서 출발한 해가 원점으로 돌아오는지, 멀어지는지, 돌아가는지입니다.
      </p>
      <p>
        답은 행렬 <M>A</M>의 <a href={lessonHref('math-linear-algebra', 'eigen')}>고윳값과 고유벡터</a>가 줍니다. 1계 방정식 <M>{"x' = \\lambda x"}</M>의 해가 <M>{'e^{\\lambda t}x_0'}</M>였던 것처럼, 연립계에서도 지수 함수 모양의 해를 찾아봅니다.
      </p>
      <div className="ls-proof">
        <div className="ls-proof-head">정리 (직선 해)</div>
        <p>
          <M>{'A\\mathbf{v} = \\lambda\\mathbf{v}'}</M>이면 <M>{'\\mathbf{x}(t) = e^{\\lambda t}\\mathbf{v}'}</M>는 <M>{"\\mathbf{x}' = A\\mathbf{x}"}</M>의 해입니다. 두 고윳값 <M>{'\\lambda_1 \\ne \\lambda_2'}</M>가 실수이면 모든 해는 <M>{'\\mathbf{x}(t) = c_1 e^{\\lambda_1 t}\\mathbf{v}_1 + c_2 e^{\\lambda_2 t}\\mathbf{v}_2'}</M>입니다.
        </p>
        <p>
          <b>증명.</b> 미분하면 <M>{"\\mathbf{x}'(t) = \\lambda e^{\\lambda t}\\mathbf{v} = e^{\\lambda t}(\\lambda\\mathbf{v}) = e^{\\lambda t}A\\mathbf{v} = A\\mathbf{x}(t)"}</M>입니다. 방정식이 선형이므로 해의 일차결합도 해이고, 서로 다른 고윳값의 고유벡터 <M>{'\\mathbf{v}_1, \\mathbf{v}_2'}</M>는 일차독립이라 어떤 처음 값 <M>{'\\mathbf{x}_0 = c_1\\mathbf{v}_1 + c_2\\mathbf{v}_2'}</M>도 맞출 수 있습니다. 해의 유일성에 따라 이것이 그 처음 값의 해 전부입니다.
          <span className="ls-qed">∎</span>
        </p>
      </div>
      <p>
        그러니 고유벡터 방향으로 출발한 점은 그 직선을 벗어나지 않고, 고윳값이 음수이면 원점으로 들어오고 양수이면 밀려 나갑니다. 다른 점들은 두 직선 해를 섞은 길을 갑니다. 그림 1에서 행렬을 바꿔 보세요.
      </p>
      <MatrixFigure />
      <p>
        처음 행렬 <M>{'\\begin{pmatrix}1&1\\\\4&-2\\end{pmatrix}'}</M>의 고윳값은 −3과 2입니다. 고유벡터 <M>{'(1, -4)'}</M> 방향(초록)으로는 빨려 들고 <M>{'(1, 1)'}</M> 방향(빨강)으로는 밀려 나가므로, 거의 모든 궤적은 들어오다가 휘어져 나갑니다. 말안장 위의 공처럼 한 방향으로는 안정하고 다른 방향으로는 불안정한 이런 평형점을 <T en="saddle">안장점</T>이라고 합니다. <b>안정 마디</b>를 고르면 고윳값이 −3과 −1로 둘 다 음수라 모든 궤적이 원점으로 들어오는데, 빨리 줄어드는 방향(−3)의 성분이 먼저 사라지므로 궤적들은 마지막에 느린 방향(−1)의 고유벡터를 따라 들어옵니다.
      </p>

      <h2>고윳값이 복소수이면 돌아갑니다</h2>
      <p>
        <b>안정 나선</b>의 행렬 <M>{'\\begin{pmatrix}-0.5&-2\\\\2&-0.5\\end{pmatrix}'}</M>에는 실수 고윳값이 없습니다. 특성방정식의 근이 <M>{'-0.5 \\pm 2i'}</M>로 복소수이고, 그림의 점선 직선 해도 사라집니다. 오일러 공식 <M>{'e^{(\\alpha + i\\beta)t} = e^{\\alpha t}(\\cos\\beta t + i\\sin\\beta t)'}</M>로 실수 해를 만들면 해는 각속도 β로 돌면서 크기가 <M>{'e^{\\alpha t}'}</M>처럼 변합니다. 실수부 α = −0.5가 음수이므로 나선을 그리며 원점으로 들어갑니다. 실수부가 0인 <b>중심</b>에서는 궤적이 닫힌 타원이 되어 영원히 같은 길을 돕니다.
      </p>

      <h2>대각합과 행렬식 두 수로</h2>
      <p>
        고윳값은 특성방정식 <M>{'\\det(A - \\lambda I) = 0'}</M>의 근입니다. 2×2 행렬에서 이 식은 대각합 <M>{'\\tau = a + d'}</M>와 행렬식 <M>{'\\Delta = ad - bc'}</M> 두 수만으로 정해집니다.
      </p>
      <MB note="두 근의 합은 τ, 곱은 Δ입니다.">{'\\lambda^2 - \\tau\\lambda + \\Delta = 0, \\qquad \\lambda = \\frac{\\tau \\pm \\sqrt{\\tau^2 - 4\\Delta}}{2}'}</MB>
      <p>
        그래서 원점의 종류는 평면 위의 점 (τ, Δ) 하나로 판정됩니다. <M>{'\\Delta < 0'}</M>이면 두 근의 곱이 음수이므로 실근의 부호가 반대라 안장점입니다. <M>{'\\Delta > 0'}</M>이면 두 근의 부호가 같거나(실근) 실수부가 같으므로(복소근), 안정성은 τ의 부호가 정하고, 판별식 <M>{'\\tau^2 - 4\\Delta'}</M>의 부호가 마디와 나선을 가릅니다. 그림 2의 지도에서 점을 끌고 다녀 보세요.
      </p>
      <TraceDetFigure />
      <p>
        처음 점 <M>{'(\\tau, \\Delta) = (-1, 2)'}</M>는 판별식이 <M>{'1 - 8 = -7'}</M>로 음수이고 τ가 음수이므로 안정 나선입니다. 점을 오른쪽으로 끌어 τ를 0에 맞추면 중심, 더 오른쪽으로 가면 불안정 나선이 됩니다. 점을 아래로 내려 포물선을 지나면 나선이 마디로 바뀌고, 가로축 아래로 가면 안장점이 됩니다.
      </p>
      <Callout kind="note">
        그림 2의 행렬 <M>{'\\begin{pmatrix}0&1\\\\-\\Delta&\\tau\\end{pmatrix}'}</M>는 2계 방정식 <M>{"x'' - \\tau x' + \\Delta x = 0"}</M>을 <M>{"y = x'"}</M>로 놓아 연립계로 바꾼 것입니다. 용수철로 읽으면 <M>{'-\\tau'}</M>가 감쇠, Δ가 용수철 상수입니다. <a href={lessonHref('math-differential-equations', 'oscillations')}>앞 장</a>의 과감쇠, 임계 감쇠, 진동이 바로 이 지도의 마디, 포물선 위의 점, 나선입니다.
      </Callout>

      <h2>행렬 지수</h2>
      <p>
        한 변수에서 <M>{"x' = ax"}</M>의 해가 <M>{'e^{at}x_0'}</M>였듯이, 연립계의 해도 지수 함수의 급수를 행렬에 그대로 써서 정의한 <T en="matrix exponential">행렬 지수</T>로 한 줄에 적을 수 있습니다.
      </p>
      <MB>{"e^{At} = I + At + \\frac{(At)^2}{2!} + \\frac{(At)^3}{3!} + \\cdots, \\qquad \\mathbf{x}(t) = e^{At}\\mathbf{x}_0"}</MB>
      <p>
        이 급수를 항마다 미분하면 <M>{'\\frac{d}{dt}e^{At} = Ae^{At}'}</M>이 되어 위의 <M>{'\\mathbf{x}(t)'}</M>가 해임을 확인할 수 있습니다. 2×2 행렬은 케일리-해밀턴 정리 <M>{'A^2 = \\tau A - \\Delta I'}</M> 덕분에 급수를 닫힌 식으로 줄일 수 있고, 그림 3은 그 식으로 계산한 정확한 해를, 기울기를 따라 한 걸음씩 가는 수치 해법과 비교합니다.
      </p>
      <ExactFigure />
      <p>
        처음 설정(t = 3)에서 정확한 해는 <M>{'(0.428, -0.125)'}</M>에 있습니다. 보폭 0.1의 오일러 방법은 0.40만큼 빗나가 궤적 밖으로 크게 벗어나지만, 같은 보폭의 RK4는 <M>{'4.33\\times10^{-5}'}</M>만큼만 틀립니다. 보폭을 0.01로 줄이면 오일러의 오차는 0.029로 약 14분의 1, RK4의 오차는 <M>{'4.17\\times10^{-9}'}</M>로 약 만 분의 1이 됩니다. 보폭을 열 배 줄일 때 오차가 오일러는 대략 10배, RK4는 <M>{'10^4'}</M>배 주는 것이 각각 1차, 4차 방법이라는 뜻입니다. 어떻게 이런 차이가 나는지는 <a href={lessonHref('math-differential-equations', 'numerical-ode')}>수치적으로 풀기</a>에서 봅니다.
      </p>

      <h2>응용: 두 개의 물탱크</h2>
      <p>
        탱크 1에 소금 20 kg이 녹아 있고 탱크 2에는 맑은 물만 있습니다. 탱크 1에 맑은 물을 분당 r 리터씩 붓고, 넘친 물이 탱크 2로, 다시 밖으로 나갑니다. 각 탱크는 잘 저어져 있다고 하면, 탱크 1의 소금은 농도 <M>{'x_1/V_1'}</M>로 분당 r 리터씩 빠져나가 탱크 2로 들어가고, 탱크 2의 소금도 같은 방식으로 빠져나갑니다.
      </p>
      <MB>{"x_1' = -\\frac{r}{V_1}x_1, \\qquad x_2' = \\frac{r}{V_1}x_1 - \\frac{r}{V_2}x_2"}</MB>
      <p>
        행렬이 삼각 행렬이라 고윳값은 대각 성분 <M>{'-r/V_1'}</M>, <M>{'-r/V_2'}</M>이고 둘 다 음수입니다. 원점은 안정 마디이고, 소금은 결국 다 씻겨 나갑니다.
      </p>
      <TanksFigure />
      <p>
        처음 설정(V₁ = 100 L, V₂ = 50 L, r = 10 L/분)에서 고윳값은 −0.1과 −0.2입니다. 탱크 2의 소금은 처음에 0이었다가 늘어나 <M>{'t = \\frac{\\ln 2}{0.1} \\approx 6.93'}</M>분에 5 kg으로 가장 많아지고, 그 뒤로는 줄어듭니다. 탱크 2의 소금이 가장 많을 때는 들어오는 양과 나가는 양이 같은 순간, 곧 <M>{"x_2' = 0"}</M>인 순간입니다. 오른쪽 평면에서 궤적은 처음에 위로 올라가다가 결국 느리게 줄어드는 고유벡터(−0.1) 방향을 따라 원점으로 들어갑니다.
      </p>

      <Callout kind="key">
        연립 선형 방정식 <M>{"\\mathbf{x}' = A\\mathbf{x}"}</M>의 해는 행렬 <M>A</M>의 고윳값과 고유벡터로 정해집니다. 실수 고윳값 λ의 고유벡터 방향에는 직선 해 <M>{'e^{\\lambda t}\\mathbf{v}'}</M>가 있고, 복소 고윳값 α ± iβ는 크기가 <M>{'e^{\\alpha t}'}</M>로 변하며 도는 해를 만듭니다. 원점의 종류는 대각합 τ와 행렬식 Δ로 판정합니다. Δ &lt; 0이면 안장점, Δ &gt; 0이면 τ의 부호가 안정성을, <M>{'\\tau^2 - 4\\Delta'}</M>의 부호가 마디와 나선을 정합니다. 해 전체는 행렬 지수 <M>{'e^{At}\\mathbf{x}_0'}</M>로 한 줄에 쓸 수 있습니다.
      </Callout>
      <Quiz
        q={
          <>
            행렬 <M>{'A = \\begin{pmatrix}1&2\\\\-2&1\\end{pmatrix}'}</M>일 때 <M>{"\\mathbf{x}' = A\\mathbf{x}"}</M>의 원점은?
          </>
        }
        options={['안정 나선', '불안정 나선', '안장점', '중심']}
        answer={1}
        explain={
          <>
            대각합 τ = 2, 행렬식 Δ = 1 + 4 = 5입니다. Δ &gt; 0이고 판별식 <M>{'\\tau^2 - 4\\Delta = 4 - 20 < 0'}</M>이므로 고윳값은 복소수 <M>{'1 \\pm 2i'}</M>이고, 실수부 1이 양수이므로 돌면서 멀어지는 불안정 나선입니다.
          </>
        }
      />
    </>
  );
}
