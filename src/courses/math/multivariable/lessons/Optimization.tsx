import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, lerpColor, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { KIND_KO, LAGRANGE, SURFACES, VALLEY, contour, criticalPoints, curvatureAlong, descend, det2, eig2, eigvec2, gradAngle, lambdaAt, levels, type Box, type Critical, type Kind, type V2 } from './extrema';
import './multivariable.css';
import './optimization.css';

/* ─────────────── shared drawing ─────────────── */

/** Number with fixed digits and no "−0". */
export function nf(v: number, d = 2): string {
  const s = v.toFixed(d);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s.replace('-', '−');
}

/** A plot over the box with equal axes and room for tick labels. */
export function boxPlot(ctx: CanvasRenderingContext2D, w: number, h: number, P: Palette, b: Box): Plot {
  return new Plot(ctx, w, h, P, { xMin: b.x0, xMax: b.x1, yMin: b.y0, yMax: b.y1, equal: true, pad: { l: 30, r: 10, t: 10, b: 24 } });
}

/**
 * Height shading plus contour lines: low values tinted blue (--neg), high values orange-red (--pos), over the surface
 * colour, so it reads in both themes.
 */
export function drawField(plot: Plot, P: Palette, f: (x: number, y: number) => number, lv: number[], opts: { res?: number; lines?: boolean } = {}) {
  const lo = lv[0], hi = lv[lv.length - 1];
  const mid = (lo + hi) / 2;
  const half = (hi - lo) / 2 || 1;
  plot.heatmap((x, y) => {
    const t = Math.max(-1, Math.min(1, (f(x, y) - mid) / half));
    const c = t < 0 ? lerpColor(P.surface, P.neg, -t * 0.55) : lerpColor(P.surface, P.pos, t * 0.55);
    return [c[0], c[1], c[2], 255];
  }, opts.res ?? 4);
  if (opts.lines === false) return;
  const ctx = plot.ctx;
  const b = { x0: plot.xMin, x1: plot.xMax, y0: plot.yMin, y1: plot.yMax };
  plot.clip();
  ctx.strokeStyle = alpha(P.ink, 0.22);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const L of lv)
    for (const [a, c] of contour(f, b, L, 56, 56)) {
      ctx.moveTo(plot.X(a[0]), plot.Y(a[1]));
      ctx.lineTo(plot.X(c[0]), plot.Y(c[1]));
    }
  ctx.stroke();
  plot.unclip();
}

/** Marker for a critical point: ▼ minimum, ▲ maximum, ✕ saddle, ○ undecided. */
function marker(plot: Plot, P: Palette, c: Critical, selected: boolean) {
  const ctx = plot.ctx;
  const x = plot.X(c.p[0]), y = plot.Y(c.p[1]);
  const col = kindColor(P, c.kind);
  ctx.save();
  if (selected) {
    ctx.strokeStyle = P.hl;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = col;
  ctx.strokeStyle = P.surface;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (c.kind === 'min') {
    ctx.moveTo(x - 7, y - 5);
    ctx.lineTo(x + 7, y - 5);
    ctx.lineTo(x, y + 7);
  } else if (c.kind === 'max') {
    ctx.moveTo(x - 7, y + 5);
    ctx.lineTo(x + 7, y + 5);
    ctx.lineTo(x, y - 7);
  } else if (c.kind === 'saddle') {
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = col;
    ctx.moveTo(x - 6, y - 6);
    ctx.lineTo(x + 6, y + 6);
    ctx.moveTo(x + 6, y - 6);
    ctx.lineTo(x - 6, y + 6);
    ctx.stroke();
    ctx.restore();
    return;
  } else {
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = P.surface;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const kindColor = (P: Palette, k: Kind) => (k === 'min' ? P.neg : k === 'max' ? P.pos : k === 'saddle' ? P.ink : P.ink3);
const KIND_CSS: Record<Kind, string> = { min: 'var(--neg)', max: 'var(--pos)', saddle: 'var(--ink)', unknown: 'var(--ink-3)' };
const KIND_MARK: Record<Kind, string> = { min: '▼', max: '▲', saddle: '✕', unknown: '○' };
const texSym = (h: [number, number, number]) => `\\begin{pmatrix} ${nf(h[0])} & ${nf(h[1])} \\\\ ${nf(h[1])} & ${nf(h[2])} \\end{pmatrix}`;

/* ─────────────── Figure 1: find and classify critical points ─────────────── */

type SurfId = 'cubic' | 'wave' | 'saddle' | 'flat';

function CriticalFigure() {
  const P = usePalette();
  const [sid, setSid] = useState<SurfId>('cubic');
  const [arrows, setArrows] = useState(false);
  const s = SURFACES[sid];
  const cps = useMemo(() => criticalPoints(s), [s]);
  const lv = useMemo(() => levels(s.f, s.box, 14), [s]);
  const [sel, setSel] = useState(0);
  const k = Math.min(sel, cps.length - 1);
  const c = cps[k];
  const plotRef = useRef<Plot | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = boxPlot(ctx, w, h, P, s.box);
      plotRef.current = plot;
      drawField(plot, P, s.f, lv);
      plot.grid({ labels: true, axes: true });
      if (arrows) {
        // the gradient points uphill and shrinks to nothing at critical points
        const n = 13;
        let gmax = 0;
        const pts: [number, number, V2][] = [];
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            const x = s.box.x0 + ((i + 0.5) / n) * (s.box.x1 - s.box.x0);
            const y = s.box.y0 + ((j + 0.5) / n) * (s.box.y1 - s.box.y0);
            const g = s.grad(x, y);
            gmax = Math.max(gmax, Math.hypot(g[0], g[1]));
            pts.push([x, y, g]);
          }
        const L = (0.42 * (s.box.x1 - s.box.x0)) / n;
        for (const [x, y, g] of pts) {
          const m = Math.hypot(g[0], g[1]) / gmax;
          if (m < 0.03) continue;
          plot.arrow(x, y, x + (g[0] / gmax) * L * 1.9, y + (g[1] / gmax) * L * 1.9, alpha(P.ink2, 0.75), 1.4, 6);
        }
      }
      cps.forEach((cp, i) => marker(plot, P, cp, i === k));
      plot.frame();
    },
    [P, s, lv, cps, k, arrows],
    { aspect: 1.35, maxHeight: 440 },
  );

  useDrag(wrapRef, {
    hit: () => null,
    onDrag: () => {},
    onEmpty: (x, y) => {
      const plot = plotRef.current;
      if (!plot) return;
      let best = -1, bd = 22;
      cps.forEach((cp, i) => {
        const d = Math.hypot(plot.X(cp.p[0]) - x, plot.Y(cp.p[1]) - y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best >= 0) setSel(best);
    },
  });

  const [e1, e2] = c ? eig2(c.h) : [0, 0];
  const D = c ? det2(c.h) : 0;
  const counts = (['max', 'min', 'saddle', 'unknown'] as Kind[]).map((kk) => [kk, cps.filter((x) => x.kind === kk).length] as const).filter(([, n]) => n > 0);
  const verdict = !c
    ? ''
    : c.kind === 'saddle'
      ? `행렬식이 ${nf(D)}로 음수입니다. 고윳값의 부호가 서로 달라서(${nf(e1)}, ${nf(e2)}) 한 방향으로는 위로, 다른 방향으로는 아래로 휩니다. 안장점입니다.`
      : c.kind === 'unknown'
        ? `행렬식이 0입니다. 고윳값 하나(${nf(e1)})가 0이라 그 방향의 휘어짐을 2차 미분만으로는 알 수 없습니다. 이 함수는 사실 극소이지만, 헤세 행렬로는 판정할 수 없습니다.`
        : `행렬식이 ${nf(D)}로 양수이고 f_xx가 ${nf(c.h[0])}로 ${c.kind === 'min' ? '양수' : '음수'}입니다. 두 고윳값(${nf(e1)}, ${nf(e2)})이 모두 ${c.kind === 'min' ? '양수라 모든 방향으로 위로' : '음수라 모든 방향으로 아래로'} 휩니다. ${KIND_KO[c.kind]}입니다.`;

  return (
    <Figure
      no={1}
      title="경사가 0인 점을 찾아 판정하기"
      hint="점을 눌러 그 점의 헤세 행렬을 보세요"
      caption={
        <>
          색은 함수의 높이입니다. 붉을수록 높고 푸를수록 낮으며, 가는 선은 등고선입니다. 표시는 뉴턴 방법으로 <M>{'\\nabla f = \\mathbf 0'}</M>을 푼 임계점이고, ▲ 극대, ▼ 극소, ✕ 안장점, ○ 판정 불가입니다. "경사 화살표"를 켜면 점마다 <M>{'\\nabla f'}</M>가 그려집니다. 화살표는 오르막을 가리키고, 임계점 가까이에서는 길이가 0으로 줄어듭니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={sid} onChange={(v) => { setSid(v); setSel(0); }} options={(Object.keys(SURFACES) as SurfId[]).map((id) => ({ value: id, label: SURFACES[id].name }))} />
        <Check label="경사 화살표" checked={arrows} onChange={setArrows} />
      </div>
      <div className="fig-split">
        <div className="mv-col">
          <div className="op-tex">
            <M>{s.tex}</M>
          </div>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${s.name} 함수의 등고선 지도. 임계점 ${cps.length}개: ${cps.map((cp) => `(${nf(cp.p[0])}, ${nf(cp.p[1])}) ${KIND_KO[cp.kind]}`).join(', ')}. 선택한 점은 ${c ? `(${nf(c.p[0])}, ${nf(c.p[1])})` : '없음'}입니다.`}>
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <div className="op-chips" role="group" aria-label="임계점 고르기">
            {cps.map((cp, i) => (
              <button key={i} type="button" className="op-chip" aria-pressed={i === k} style={{ ['--c' as string]: KIND_CSS[cp.kind] }} onClick={() => setSel(i)}>
                <span aria-hidden="true">{KIND_MARK[cp.kind]}</span> ({nf(cp.p[0])}, {nf(cp.p[1])})
              </button>
            ))}
          </div>
          {c && (
            <>
              <div className="op-hess">
                <MB>{`H = ${texSym(c.h)}`}</MB>
              </div>
              <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <Readout label="f 값" value={nf(c.value)} />
                <Readout label="det H" value={nf(D)} color={D < -1e-6 ? 'var(--ink)' : undefined} />
                <Readout label="고윳값" value={`${nf(e1)}, ${nf(e2)}`} />
                <Readout label="판정" value={KIND_KO[c.kind]} color={KIND_CSS[c.kind]} />
              </div>
              <div className="mv-note" aria-live="polite">
                {verdict}
              </div>
            </>
          )}
          <div className="mv-small">
            이 범위의 임계점 {cps.length}개: {counts.map(([kk, n]) => `${KIND_KO[kk]} ${n}`).join(', ')}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: slicing a saddle ─────────────── */

function SliceFigure() {
  const P = usePalette();
  const [deg, setDeg] = useState(30);
  const s = SURFACES.saddle;
  const h = s.hess(0, 0);
  const th = (deg * Math.PI) / 180;
  const u: V2 = [Math.cos(th), Math.sin(th)];
  const k = curvatureAlong(h, u);
  const lv = useMemo(() => levels(s.f, s.box, 12), [s]);
  const [l1, l2] = eig2(h);
  const v1 = eigvec2(h, l1), v2 = eigvec2(h, l2);

  const map = useCanvas2D(
    (ctx, { w, h: hh }) => {
      const plot = boxPlot(ctx, w, hh, P, s.box);
      drawField(plot, P, s.f, lv);
      plot.grid({ labels: true });
      for (const [v, col] of [[v1, P.neg], [v2, P.pos]] as const) plot.line(-3 * v[0], -3 * v[1], 3 * v[0], 3 * v[1], alpha(col, 0.8), 1.5, [5, 4]);
      plot.line(-2.4 * u[0], -2.4 * u[1], 2.4 * u[0], 2.4 * u[1], P.accent, 3);
      plot.arrow(0, 0, 1.3 * u[0], 1.3 * u[1], P.accent, 3, 10);
      plot.dot(0, 0, 4, P.ink);
      plot.frame();
    },
    [P, deg, lv],
    { aspect: 1, maxHeight: 340 },
  );

  const slice = useCanvas2D(
    (ctx, { w, h: hh }) => {
      const plot = new Plot(ctx, w, hh, P, { xMin: -2, xMax: 2, yMin: -4.4, yMax: 4.4, pad: { l: 30, r: 10, t: 10, b: 24 } });
      plot.grid({ labels: true, xStep: 1, yStep: 2 });
      plot.fn((t) => s.f(t * u[0], t * u[1]), P.accent, 3);
      plot.fn((t) => 0.5 * k * t * t, alpha(P.ink3, 0.8), 1.5, { dash: [4, 4] });
      plot.dot(0, 0, 4, P.ink);
      plot.text('g(t) = f(t·u)', -1.9, 4.1, P.ink3, { align: 'left', base: 'top', font: `600 11px ${P.fontBody}` });
      plot.frame();
    },
    [P, deg],
    { aspect: 1, maxHeight: 340 },
  );

  return (
    <Figure
      no={2}
      title="말안장을 여러 방향으로 잘라 보기"
      hint="각도를 바꿔 자르는 방향을 돌리세요"
      caption={
        <>
          <M>{'f(x, y) = x^2 - y^2'}</M>를 원점을 지나는 직선으로 자른 단면입니다. 왼쪽의 굵은 선이 자르는 방향 <M>{'\\mathbf u'}</M>이고, 오른쪽 그래프가 그 단면 <M>{'g(t) = f(t\\mathbf u)'}</M>입니다. 점선 두 개는 헤세 행렬의 고유벡터 방향으로, 푸른 쪽이 가장 아래로, 붉은 쪽이 가장 위로 휘는 방향입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="op-slice" label="자르는 방향 θ" value={deg} min={0} max={180} step={1} onChange={setDeg} format={(v) => `${v}°`} />
      </div>
      <div className="op-pair">
        <div ref={map.wrapRef} className="canvas-box" role="img" aria-label={`말안장 x² − y²의 등고선 지도에 각도 ${deg}도 방향의 직선을 그렸습니다.`}>
          <canvas ref={map.canvasRef} />
        </div>
        <div ref={slice.wrapRef} className="canvas-box" role="img" aria-label={`그 방향의 단면. 원점에서의 휘어짐(2차 도함수)은 ${nf(k)}로 ${k > 1e-9 ? '위로 휜 그릇' : k < -1e-9 ? '아래로 휜 언덕' : '평평한 직선'} 모양입니다.`}>
          <canvas ref={slice.canvasRef} />
        </div>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Readout label="방향 u" value={`(${nf(u[0])}, ${nf(u[1])})`} />
        <Readout label="휘어짐 uᵀHu" value={nf(k)} color={k > 1e-9 ? 'var(--neg)' : k < -1e-9 ? 'var(--pos)' : undefined} />
        <Readout label="단면 모양" value={k > 1e-9 ? '그릇 (극소)' : k < -1e-9 ? '언덕 (극대)' : '평평'} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: gradient descent in a narrow valley ─────────────── */

const START: V2 = [-3.5, 1.6];
const MAX_STEPS = 200;

function DescentFigure() {
  const P = usePalette();
  const [eta, setEta] = useState(0.08);
  const [start, setStart] = useState<V2>(START);
  const s = VALLEY;
  const run = useMemo(() => descend(s, start, eta, MAX_STEPS), [s, start, eta]);
  const lv = useMemo(() => [0.25, 1, 2.25, 4, 6.25, 9, 12.25, 16, 20.25, 25].map((v) => v), []);
  const plotRef = useRef<Plot | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = boxPlot(ctx, w, h, P, s.box);
      plotRef.current = plot;
      drawField(plot, P, s.f, lv);
      plot.grid({ labels: true });
      plot.clip();
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      run.path.forEach((p, i) => (i ? ctx.lineTo(plot.X(p[0]), plot.Y(p[1])) : ctx.moveTo(plot.X(p[0]), plot.Y(p[1]))));
      ctx.stroke();
      run.path.slice(0, 60).forEach((p) => plot.dot(p[0], p[1], 2.2, P.accent));
      plot.unclip();
      plot.dot(0, 0, 4, P.good);
      plot.dot(start[0], start[1], 7, P.hl, P.ink, 1.5);
      plot.frame();
    },
    [P, run, start, lv],
    { aspect: 1.6, maxHeight: 360 },
  );

  useDrag(wrapRef, {
    hit: (x, y) => {
      const plot = plotRef.current;
      if (!plot) return null;
      return Math.hypot(plot.X(start[0]) - x, plot.Y(start[1]) - y) < 22 ? 'start' : null;
    },
    onDrag: (_id, x, y) => {
      const plot = plotRef.current;
      if (!plot) return;
      const nx = Math.max(s.box.x0 + 0.2, Math.min(s.box.x1 - 0.2, plot.invX(x)));
      const ny = Math.max(s.box.y0 + 0.2, Math.min(s.box.y1 - 0.2, plot.invY(y)));
      setStart([Math.round(nx * 10) / 10, Math.round(ny * 10) / 10]);
    },
  });

  const curve = useCanvas2D(
    (ctx, { w, h }) => {
      const vals = run.values.map((v) => Math.max(v, 1e-12));
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: MAX_STEPS, yMin: -12, yMax: 4, pad: { l: 40, r: 10, t: 8, b: 22 } });
      plot.grid({ labels: false, xStep: 50, yStep: 4 });
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let e = -12; e <= 4; e += 4) ctx.fillText(e === 0 ? '1' : `1e${e}`, plot.pad.l - 5, plot.Y(e));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let k = 0; k <= MAX_STEPS; k += 50) ctx.fillText(k ? `${k}걸음` : '0', plot.X(k), plot.Y(-12) + 5);
      plot.clip();
      ctx.strokeStyle = run.diverged ? P.bad : P.accent;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      vals.forEach((v, i) => (i ? ctx.lineTo(plot.X(i), plot.Y(Math.log10(v))) : ctx.moveTo(plot.X(0), plot.Y(Math.log10(v)))));
      ctx.stroke();
      plot.unclip();
      plot.frame();
    },
    [P, run],
    { height: 130, minHeight: 40 },
  );

  const status = run.diverged ? `발산: ${run.path.length - 1}걸음 만에 값이 끝없이 커졌습니다` : run.converged !== null ? `${run.converged}걸음 만에 |∇f| < 0.001` : `${MAX_STEPS}걸음 안에 수렴하지 못함`;
  return (
    <Figure
      no={3}
      title="좁은 골짜기를 내려가는 경사하강법"
      hint="걸음 크기를 바꾸고, 노란 출발점을 끌어 보세요"
      caption={
        <>
          <M>{'f(x, y) = \\tfrac12(x^2 + 10y^2)'}</M>에서 <M>{'\\mathbf p_{k+1} = \\mathbf p_k - \\eta \\nabla f(\\mathbf p_k)'}</M>를 최대 {MAX_STEPS}번 되풀이합니다. 초록 점이 최솟값 (0, 0)입니다. 아래 그래프는 걸음마다의 f 값을 로그 눈금으로 그린 것입니다. 출발점은 끌거나 아래 단추로 처음 자리 (−3.5, 1.6)에 되돌릴 수 있습니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="op-eta" label="걸음 크기 η" value={eta} min={0.01} max={0.25} step={0.01} onChange={setEta} format={(v) => v.toFixed(2)} />
        <div className="btn-row">
          {[0.05, 0.15, 0.19, 0.21].map((v) => (
            <Button key={v} small onClick={() => setEta(v)}>
              η = {v}
            </Button>
          ))}
          <Button small onClick={() => setStart(START)} disabled={start[0] === START[0] && start[1] === START[1]}>
            출발점 되돌리기
          </Button>
        </div>
      </div>
      <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`좁은 골짜기 모양 함수의 등고선 위에 (${nf(start[0], 1)}, ${nf(start[1], 1)})에서 출발한 경사하강법 경로. 걸음 크기 ${eta.toFixed(2)}. ${status}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div ref={curve.wrapRef} className="canvas-box" role="img" aria-label="걸음마다 f 값의 변화를 로그 눈금으로 그린 그래프">
        <canvas ref={curve.canvasRef} />
      </div>
      <div className="mv-note" data-bad={run.diverged || undefined} data-good={(!run.diverged && run.converged !== null) || undefined} aria-live="polite">
        {status}. 마지막 f = {run.diverged ? '∞' : run.values[run.values.length - 1].toExponential(1)}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: Lagrange multipliers ─────────────── */

type LagId = 'circle' | 'fence';

function LagrangeFigure() {
  const P = usePalette();
  const [pid, setPid] = useState<LagId>('circle');
  const pr = LAGRANGE[pid];
  const [tt, setT] = useState<number>(pr.tStart);
  const t = Math.max(pr.t0, Math.min(pr.t1, tt));
  const p = pr.curve(t);
  const val = pr.f(p[0], p[1]);
  const ang = gradAngle(pr, p);
  const lam = lambdaAt(pr, p);
  const at = ang < 0.5;
  const plotRef = useRef<Plot | null>(null);
  const lv = useMemo(() => (pid === 'circle' ? [0.5, 1, 2, 3, 4, 5, 6.5, 8] : [4, 9, 16, 25, 36, 49, 64]), [pid]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = boxPlot(ctx, w, h, P, pr.box);
      plotRef.current = plot;
      drawField(plot, P, pr.f, lv);
      plot.grid({ labels: true });
      // the level curve through the current point
      plot.clip();
      ctx.strokeStyle = alpha(P.pos, 0.9);
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (const [a, c] of contour(pr.f, pr.box, val, 70, 70)) {
        ctx.moveTo(plot.X(a[0]), plot.Y(a[1]));
        ctx.lineTo(plot.X(c[0]), plot.Y(c[1]));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      // the constraint
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let k = 0; k <= 80; k++) {
        const q = pr.curve(pr.t0 + ((pr.t1 - pr.t0) * k) / 80);
        if (k) ctx.lineTo(plot.X(q[0]), plot.Y(q[1]));
        else ctx.moveTo(plot.X(q[0]), plot.Y(q[1]));
      }
      ctx.stroke();
      plot.unclip();
      // both gradients, scaled to the same length so only their directions compete
      const gf = pr.grad(p[0], p[1]), gg = pr.gradG(p[0], p[1]);
      const L = 0.16 * (pr.box.x1 - pr.box.x0);
      const nf_ = Math.hypot(gf[0], gf[1]) || 1, ng = Math.hypot(gg[0], gg[1]) || 1;
      plot.arrow(p[0], p[1], p[0] + (gg[0] / ng) * L, p[1] + (gg[1] / ng) * L, P.neg, 3, 11);
      plot.arrow(p[0], p[1], p[0] + (gf[0] / nf_) * L, p[1] + (gf[1] / nf_) * L, P.pos, 3, 11);
      plot.dot(p[0], p[1], 7, at ? P.good : P.hl, P.ink, 1.5);
      plot.frame();
    },
    [P, pr, t, lv],
    { aspect: 1, maxHeight: 400 },
  );

  // dragging snaps to the nearest point of the constraint curve
  useDrag(wrapRef, {
    hit: (x, y) => {
      const plot = plotRef.current;
      if (!plot) return null;
      return Math.hypot(plot.X(p[0]) - x, plot.Y(p[1]) - y) < 26 ? 'p' : null;
    },
    onDrag: (_id, x, y) => {
      const plot = plotRef.current;
      if (!plot) return;
      const wx = plot.invX(x), wy = plot.invY(y);
      let best = t, bd = Infinity;
      for (let k = 0; k <= 400; k++) {
        const tk = pr.t0 + ((pr.t1 - pr.t0) * k) / 400;
        const q = pr.curve(tk);
        const d = Math.hypot(q[0] - wx, q[1] - wy);
        if (d < bd) {
          bd = d;
          best = tk;
        }
      }
      setT(best);
    },
  });

  const isFence = pid === 'fence';
  const tLabel = isFence ? `가로 x = ${p[0].toFixed(2)}m` : `각도 ${((t * 180) / Math.PI).toFixed(1)}°`;
  return (
    <Figure
      no={4}
      title="제약 곡선 위의 최댓값: 두 경사가 나란해지는 곳"
      hint="검은 곡선 위의 점을 끌거나 슬라이더를 움직이세요"
      caption={
        <>
          검은 곡선이 제약 조건 <M>{pr.gTex}</M>이고, 점선은 지금 점을 지나는 <M>{pr.fTex}</M>의 등고선입니다. 붉은 화살표가 <M>{'\\nabla f'}</M>, 푸른 화살표가 제약 조건의 경사 <M>{'\\nabla g'}</M>입니다. 길이는 같게 맞추고 방향만 보여 줍니다. 두 화살표가 겹치면 점이 초록으로 바뀝니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={pid} onChange={(v) => { setPid(v); setT(LAGRANGE[v].tStart); }} options={[{ value: 'circle', label: LAGRANGE.circle.name }, { value: 'fence', label: LAGRANGE.fence.name }]} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`${pr.name}. 지금 점 (${nf(p[0])}, ${nf(p[1])})에서 f = ${nf(val)}, 두 경사 사이 각도 ${ang.toFixed(1)}도${at ? '로 나란합니다. 최댓값입니다.' : '.'}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="op-lag" label={isFence ? '가로 길이 x' : '원 위의 각도'} value={t} min={pr.t0} max={pr.t1} step={(pr.t1 - pr.t0) / 360} onChange={setT} format={() => tLabel} />
          <div className="btn-row">
            <Button small onClick={() => setT(pr.tBest)}>
              두 경사가 나란한 점으로
            </Button>
            <Button small onClick={() => setT(pr.tStart)}>
              처음 자리
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="점" value={`(${nf(p[0])}, ${nf(p[1])})`} />
            <Readout label={isFence ? '넓이 xy' : 'f = xy'} value={nf(val)} color={at ? 'var(--good)' : undefined} />
            <Readout label="두 경사 사이 각도" value={`${ang.toFixed(1)}°`} />
            <Readout label="λ = ∇f / ∇g" value={at ? nf(lam, 3) : '나란하지 않음'} />
          </div>
          {isFence && (
            <div className="op-fence" aria-hidden="true">
              <div style={{ width: `${(p[0] / 10) * 100}%`, height: `${(p[1] / 10) * 100}%` }}>
                <span>
                  {p[0].toFixed(1)} × {p[1].toFixed(1)}
                </span>
              </div>
            </div>
          )}
          <div className="mv-note" data-good={at || undefined} aria-live="polite">
            {at ? `∇f = ${nf(lam, 2)}·∇g. 곡선을 따라 어느 쪽으로 움직여도 f가 줄어듭니다.` : `∇f가 곡선을 따라가는 성분을 가지고 있어서, 화살표가 기운 쪽으로 곡선을 따라가면 f가 커집니다.`}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Optimization() {
  const cubic = useMemo(() => criticalPoints(SURFACES.cubic), []);
  const wave = useMemo(() => criticalPoints(SURFACES.wave), []);
  const nWave = (kk: Kind) => wave.filter((c) => c.kind === kk).length;
  const fence = LAGRANGE.fence;
  const fenceLam = lambdaAt(fence, fence.best);
  const circ = LAGRANGE.circle;
  const c0 = circ.curve(circ.tStart);
  const f0 = fence.curve(fence.tStart);
  const runs = useMemo(() => Object.fromEntries([0.05, 0.08, 0.15, 0.19, 0.21].map((e) => [e, descend(VALLEY, START, e, MAX_STEPS)])), []);
  return (
    <>
      <h2>꼭대기, 바닥, 그리고 말안장</h2>
      <p>
        한 변수 함수에서 극댓값과 극솟값은 기울기가 0인 곳에 있었습니다. 두 변수 함수도 같습니다. 곡면의 꼭대기나 바닥에서는 어느 방향으로 움직여도 처음에는 높이가 변하지 않으므로, 두 편미분이 모두 0이어야 합니다. 이런 점, 즉 <M>{'\\nabla f = \\mathbf 0'}</M>인 점을 <T en="critical point">임계점</T>이라고 합니다.
      </p>
      <p>
        그런데 2차원에는 1차원에 없던 세 번째 경우가 있습니다. 말 등에 얹는 안장처럼 앞뒤로는 오목하고 좌우로는 볼록한 점입니다. 경사는 0이지만 꼭대기도 바닥도 아닌 이 점을 <T en="saddle point">안장점</T>이라고 합니다. 그림 1에서 <M>{SURFACES.cubic.tex}</M>를 보면 임계점이 두 개입니다. (1, 0)은 사방이 오르막인 바닥이고, (−1, 0)은 x 방향으로는 언덕 꼭대기, y 방향으로는 골짜기 바닥인 안장점입니다.
      </p>
      <CriticalFigure />

      <h2>헤세 행렬로 판정하기</h2>
      <p>
        임계점이 무엇인지 가리려면 2차 도함수를 봅니다. 변수가 둘이면 2차 편도함수가 네 개이고, 이를 모은 행렬을 <T en="Hessian matrix">헤세 행렬</T>이라고 합니다. 섞인 편도함수 <M>{'f_{xy}'}</M>와 <M>{'f_{yx}'}</M>는 (함수가 매끄러우면) 같으므로 이 행렬은 대칭입니다.
      </p>
      <MB note="임계점에서의 판정. D = 0이면 이 방법으로는 알 수 없습니다.">{'H = \\begin{pmatrix} f_{xx} & f_{xy} \\\\ f_{xy} & f_{yy} \\end{pmatrix}, \\qquad D = \\det H = f_{xx}f_{yy} - f_{xy}^2 \\quad \\begin{cases} D > 0,\\ f_{xx} > 0 & \\text{극소} \\\\ D > 0,\\ f_{xx} < 0 & \\text{극대} \\\\ D < 0 & \\text{안장점} \\end{cases}'}</MB>
      <p>
        이 규칙은 선형대수의 <a href={lessonHref('math-linear-algebra', 'eigen')}>고윳값</a>으로 보면 자연스럽습니다. 대칭 행렬의 고유벡터는 서로 수직이고, 고윳값은 그 방향으로 곡면이 휘는 정도입니다. 행렬식은 두 고윳값의 곱이므로, D가 양수면 두 고윳값의 부호가 같고(모두 위로 또는 모두 아래로 휨), 음수면 부호가 다릅니다(한쪽은 위로, 다른 쪽은 아래로 휨). 그림 1의 (1, 0)에서 헤세 행렬은 대각 성분이 6과 2인 대각 행렬이라 고윳값이 6과 2로 모두 양수이고, (−1, 0)에서는 −6과 2로 부호가 갈립니다.
      </p>
      <p>
        <strong>물결</strong>을 고르면 <M>{SURFACES.wave.tex}</M>의 임계점 {wave.length}개가 보입니다. 극대 {nWave('max')}개, 극소 {nWave('min')}개, 안장점 {nWave('saddle')}개입니다. 봉우리와 골짜기 사이마다 고갯마루가 있어야 하므로, 산이 많은 지형일수록 안장점도 많습니다. <strong>판정 불가</strong>의 <M>{SURFACES.flat.tex}</M>는 원점이 분명히 바닥이지만, x 방향의 2차 도함수가 0이라 D = 0이 되어 이 판정법은 답을 주지 못합니다. 이럴 때는 함수를 직접 들여다봐야 합니다.
      </p>
      <Callout kind="note">
        그림 1의 임계점들은 뉴턴 방법으로 찾았습니다. <a href={lessonHref('math-calculus', 'applications')}>미적분학</a>에서 접선을 따라 근을 찾던 방법을 그대로 두 변수로 옮기면, 기울기 대신 헤세 행렬로 나누어 <M>{'\\mathbf p \\leftarrow \\mathbf p - H^{-1}\\nabla f'}</M>를 되풀이합니다. 범위 안에 13 × 13개의 출발점을 고르게 놓고 각각 돌린 뒤, 같은 점에 도착한 것을 하나로 합쳤습니다. {SURFACES.cubic.name} 함수에서는 그렇게 {cubic.length}개의 점이 남습니다.
      </Callout>

      <h2>말안장을 잘라 보면</h2>
      <p>
        어떤 방향으로 휘는지를 직접 보려면 곡면을 원점을 지나는 직선으로 자르면 됩니다. 방향 <M>{'\\mathbf u'}</M>를 따라 자른 단면 <M>{'g(t) = f(t\\mathbf u)'}</M>의 2차 도함수는 연쇄 법칙으로 <M>{'g\'\'(0) = \\mathbf u^{\\mathsf T} H \\mathbf u'}</M>가 됩니다. 그림 2에서 각도를 돌려 보세요.
      </p>
      <SliceFigure />
      <p>
        0°(x축 방향)로 자르면 휘어짐이 2인 그릇, 90°(y축 방향)로 자르면 −2인 언덕입니다. 처음 각도 30°에서는 1로 아직 그릇이고, 45°에서는 정확히 0이 되어 단면이 평평한 직선 <M>{'g(t) = 0'}</M>이 됩니다. 실제로 <M>{'x = y'}</M> 위에서는 <M>{'x^2 - y^2 = 0'}</M>입니다. 60°에서는 −1로 언덕이 됩니다. 휘어짐이 가장 큰 방향과 가장 작은 방향이 헤세 행렬의 두 고유벡터(점선)이고, 그때의 휘어짐이 고윳값 2와 −2입니다. 다른 방향의 휘어짐은 언제나 이 둘 사이에 있습니다.
      </p>

      <h2>경사를 따라 내려가기</h2>
      <p>
        식이 복잡해서 <M>{'\\nabla f = \\mathbf 0'}</M>을 손으로 풀 수 없을 때가 많습니다. 신경망의 손실 함수는 변수가 수십억 개입니다. 그럴 때는 경사의 반대 방향, 즉 가장 가파른 내리막으로 조금씩 걸어 내려갑니다. <a href={lessonHref('ai-basics', 'gradient-descent')}>기초 인공지능의 경사하강법</a>이 바로 이것입니다. 걸음 크기 <M>{'\\eta'}</M>를 얼마로 할지가 문제입니다.
      </p>
      <DescentFigure />
      <p>
        이 골짜기는 x 방향으로는 완만하고(휘어짐 1) y 방향으로는 가파릅니다(휘어짐 10). 처음 걸음 크기 0.08에서는 {runs[0.08].converged}걸음 만에 경사가 0.001보다 작아집니다. 0.05로 줄이면 {runs[0.05].converged}걸음이 걸리고, 0.15로 키우면 {runs[0.15].converged}걸음이면 됩니다. 그런데 0.19에서는 경로가 골짜기 양쪽 벽을 오가며 지그재그로 튀어 오히려 {runs[0.19].converged}걸음이 걸리고, 0.21에서는 {runs[0.21].path.length - 1}걸음 만에 값이 걷잡을 수 없이 커져 발산합니다.
      </p>
      <p>
        경계는 정확히 0.2입니다. y 방향만 떼어 보면 한 걸음이 <M>{'y \\leftarrow y - \\eta \\cdot 10y = (1 - 10\\eta)y'}</M>이므로, <M>{'|1 - 10\\eta| < 1'}</M>, 즉 <M>{'\\eta < 2/10'}</M>이어야 y가 줄어듭니다. 일반적으로 걸음 크기는 헤세 행렬의 가장 큰 고윳값 <M>{'\\lambda_{\\max}'}</M>에 대해 <M>{'\\eta < 2/\\lambda_{\\max}'}</M>여야 합니다. 그런데 걸음 크기를 가장 가파른 방향에 맞추면 완만한 방향(고윳값 1)에서는 한 걸음에 거리의 겨우 몇 분의 일씩만 갑니다. 두 고윳값의 비율이 클수록, 즉 골짜기가 좁고 길수록 경사하강법이 느린 이유입니다. 모멘텀이나 Adam 같은 방법은 이 지그재그를 줄이려고 만든 것입니다.
      </p>

      <h2>제약이 있을 때: 라그랑주 승수</h2>
      <p>
        현실의 최적화에는 제약이 붙습니다. 울타리 20m로 가장 넓은 땅을 두르거나, 정해진 예산으로 가장 큰 효과를 내야 합니다. 이때 최댓값은 경사가 0인 곳이 아니라 제약을 지키는 점들 가운데 있습니다. 그림 4에서 원 <M>{circ.gTex}</M> 위를 움직이며 <M>{circ.fTex}</M>가 가장 커지는 곳을 찾아보세요.
      </p>
      <LagrangeFigure />
      <p>
        처음 자리 ({nf(c0[0])}, {nf(c0[1])})에서는 f = {nf(circ.f(c0[0], c0[1]))}이고 두 화살표 사이가 {gradAngle(circ, c0).toFixed(1)}° 벌어져 있습니다. <M>{'\\nabla f'}</M>가 원을 따라가는 성분을 가지므로 그쪽으로 원을 따라가면 f가 커집니다. 점을 (2, 2)로 옮기면 두 화살표가 겹치고 f = 4가 됩니다. 이 점에서는 점선 등고선이 원에 딱 맞닿아 있어서, 원을 따라 어느 쪽으로 가도 등고선 바깥(더 낮은 쪽)으로 나갑니다.
      </p>
      <p>
        이것을 식으로 쓴 것이 <T en="Lagrange multiplier">라그랑주 승수법</T>입니다. 제약 <M>{'g(x, y) = c'}</M> 아래에서 f의 극값은 두 경사가 나란한 점, 즉 어떤 수 <M>{'\\lambda'}</M>에 대해
      </p>
      <MB note="미지수 x, y, λ 세 개에 방정식 세 개">{'\\nabla f = \\lambda \\nabla g, \\qquad g(x, y) = c'}</MB>
      <p>
        를 만족하는 점에 있습니다. 원의 예에서는 <M>{'(y, x) = \\lambda(2x, 2y)'}</M>와 <M>{'x^2 + y^2 = 8'}</M>을 풀면 <M>{'x = y = 2'}</M>, <M>{'\\lambda = 1/2'}</M>입니다.
      </p>
      <p>
        <strong>울타리</strong> 문제는 둘레가 <M>{'2x + 2y = 20'}</M>인 직사각형의 넓이 <M>{'A = xy'}</M>를 가장 크게 만드는 것입니다. 처음 자리 {nf(f0[0], 0)} × {nf(f0[1], 0)}에서는 넓이가 {fence.f(f0[0], f0[1])}m²이고 두 경사가 {gradAngle(fence, f0).toFixed(1)}° 벌어져 있습니다. <M>{'(y, x) = \\lambda(2, 2)'}</M>에서 <M>{'x = y'}</M>이고, 둘레 조건에서 <M>{'x = y = 5'}</M>, 넓이 25m²의 정사각형이 답입니다. 미분 하나로 푸는 방법(<M>{'y = 10 - x'}</M>를 넣어 <M>{'A(x) = 10x - x^2'}</M>의 꼭대기를 찾기)과 같은 답이지만, 라그랑주 승수법은 제약이 복잡해서 한 변수를 다른 변수로 풀어 쓸 수 없을 때도 통합니다.
      </p>
      <Callout kind="intuition">
        <M>{'\\lambda'}</M>에도 뜻이 있습니다. 제약의 값 c를 조금 늘렸을 때 최댓값이 얼마나 늘어나는지, 즉 <M>{'\\lambda = dA^*/dc'}</M>입니다. 울타리에서는 <M>{'\\lambda = '}</M>{nf(fenceLam, 1)}이므로, 울타리를 20m에서 22m로 2m 늘리면 가장 넓은 땅이 약 {nf(fenceLam * 2, 0)}m² 늘어 {25 + fenceLam * 2}m²쯤 된다고 예측할 수 있습니다. 실제로 5.5 × 5.5 = 30.25m²입니다. 경제학에서는 이것을 자원 한 단위의 <T en="shadow price">잠재 가격</T>이라고 부릅니다.
      </Callout>

      <Callout kind="key">
        두 변수 함수의 극값 후보는 <M>{'\\nabla f = \\mathbf 0'}</M>인 임계점이고, 헤세 행렬의 행렬식과 고윳값으로 극대, 극소, 안장점을 가립니다. 고윳값은 고유벡터 방향으로 곡면이 휘는 정도입니다. 식을 풀 수 없으면 경사의 반대쪽으로 걷는 경사하강법을 쓰는데, 걸음 크기는 가장 가파른 휘어짐에 맞춰 <M>{'\\eta < 2/\\lambda_{\\max}'}</M>여야 합니다. 제약 <M>{'g = c'}</M>가 있으면 최댓값은 두 경사가 나란한 곳, <M>{'\\nabla f = \\lambda\\nabla g'}</M>에 있고, λ는 제약을 조금 풀었을 때 최댓값이 늘어나는 비율입니다.
      </Callout>
      <Quiz
        q={<>어떤 함수의 임계점에서 <M>{'f_{xx} = 3'}</M>, <M>{'f_{yy} = 2'}</M>, <M>{'f_{xy} = 4'}</M>입니다. 이 점은 무엇일까요?</>}
        options={['극소, f_xx와 f_yy가 모두 양수이므로', '극대', '안장점', '판정할 수 없음']}
        answer={2}
        explain={<>행렬식이 <M>{'D = 3 \\cdot 2 - 4^2 = -10'}</M>으로 음수이므로 안장점입니다. x축과 y축 방향으로는 둘 다 위로 휘지만, 섞인 항이 커서 대각선에 가까운 어떤 방향으로는 아래로 휩니다. 예를 들어 <M>{'\\mathbf u = (1, -1)/\\sqrt 2'}</M> 방향의 휘어짐은 <M>{'(3 - 8 + 2)/2 = -1.5'}</M>입니다. 대각 성분만 보고 판단하면 안 되는 이유입니다.</>}
      />
    </>
  );
}

