import { useMemo, useRef, useState } from 'react';

/** Phones stack the two plots of a figure, so they need a taller canvas. */
const NARROW = typeof window !== 'undefined' && window.innerWidth < 600;
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { rng } from '../../../../lib/math';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { basis, chebyshev, dividedDifferences, equispaced, fitErrors, interpolant, lagrange, lsqPoly, maxError, naturalSpline, noisyData, polyAt, powerCoefficients, runge, truth, type Pt } from './interp';
import './numerical.css';
import './interpolation.css';

const nf = (v: number, d = 4) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');
const ef = (v: number) => {
  if (!isFinite(v)) return '∞';
  if (v === 0) return '0';
  if (v >= 0.01 && v < 1000) return v < 1 ? v.toFixed(4) : v.toPrecision(4);
  const [m, e] = v.toExponential(2).split('e');
  return `${m}×10^${Number(e)}`.replace('^-', '^−');
};
const sup = (s: string) => s.replace(/\^(−?\d+)/g, (_, p: string) => p.split('').map((ch) => ({ '−': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' })[ch] ?? ch).join(''));
const sci = (v: number) => sup(ef(v));

/** Grid with separate tick formats for x and y (Plot.grid uses one format for both). */
function gridXY(p: Plot, xStep: number, yStep: number, fx: (v: number) => string, fy: (v: number) => string) {
  p.grid({ xStep, yStep, labels: false });
  const c = p.ctx;
  c.save();
  c.fillStyle = p.p.ink3;
  c.font = `11px ${p.p.fontMono}`;
  c.textAlign = 'center';
  c.textBaseline = 'top';
  for (let x = Math.ceil(p.xMin / xStep - 1e-9) * xStep; x <= p.xMax + 1e-9; x += xStep) c.fillText(fx(x), p.X(x), p.pad.t + p.ph + 6);
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  for (let y = Math.ceil(p.yMin / yStep - 1e-9) * yStep; y <= p.yMax + 1e-9; y += yStep) c.fillText(fy(y), p.pad.l - 6, p.Y(y));
  c.restore();
}

/* ─────────────── Figure 1: Lagrange through draggable points, with the Newton table ─────────────── */

const START: Pt[] = [
  { x: -2, y: 1 },
  { x: -1, y: -0.5 },
  { x: 0, y: 1.2 },
  { x: 1.2, y: 0.4 },
  { x: 2.4, y: 1.6 },
];
const EXTRA: Pt[] = [
  { x: -2.7, y: 2 },
  { x: 2.9, y: -0.8 },
];
const X0 = -3.2, X1 = 3.2, Y0 = -3, Y1 = 4;

function LagrangeFigure() {
  const P = usePalette();
  const [pts, setPts] = useState<Pt[]>(START);
  const [sel, setSel] = useState(2);
  const [showBasis, setShowBasis] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const plotRef = useRef<Plot | null>(null);
  const basisColors = [P.neg, P.pos, P.good, P.bad, P.dl, P.ml, P.hl];

  const xs = pts.map((p) => p.x);
  const table = useMemo(() => dividedDifferences(pts), [pts]);
  const coef = useMemo(() => powerCoefficients(pts), [pts]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: X0, xMax: X1, yMin: Y0, yMax: Y1, pad: { l: 30, r: 10, t: 10, b: 24 } });
      plotRef.current = p;
      p.grid({ xStep: 1, yStep: 1 });
      p.clip();
      if (showBasis)
        pts.forEach((q, j) => {
          // scaled basis yⱼ·ℓⱼ(x): the polynomial is their sum
          p.fn((x) => q.y * basis(xs, j, x), alpha(basisColors[j % basisColors.length], 0.75), 1.5, { dash: [5, 4], samples: 400 });
        });
      p.fn((x) => lagrange(pts, x), P.accent, 2.8, { samples: 500 });
      p.unclip();
      pts.forEach((q, j) => p.dot(q.x, q.y, j === sel ? 8 : 6.5, showBasis ? basisColors[j % basisColors.length] : P.ink, P.surface, 2));
      if (added !== null && pts[added]) p.text('새 점', pts[added].x, pts[added].y, P.ink2, { dy: -16, align: 'center', font: `600 11px ${P.fontBody}`, bg: P.surface });
    },
    [P, pts, sel, showBasis, added],
    { aspect: 1.45, maxHeight: 400, minHeight: 40 },
  );

  const move = (i: number, x: number, y: number) => {
    setPts((old) => {
      const nx = Math.max(X0 + 0.1, Math.min(X1 - 0.1, x));
      // keep x values distinct: no two points closer than 0.15 in x
      if (old.some((q, k) => k !== i && Math.abs(q.x - nx) < 0.15)) return old.map((q, k) => (k === i ? { ...q, y: Math.max(Y0, Math.min(Y1, y)) } : q));
      return old.map((q, k) => (k === i ? { x: nx, y: Math.max(Y0, Math.min(Y1, y)) } : q));
    });
  };
  useDrag(wrapRef, {
    hit: (sx, sy) => {
      const p = plotRef.current;
      if (!p) return null;
      let best = -1, bd = 18;
      pts.forEach((q, j) => {
        const d = Math.hypot(p.X(q.x) - sx, p.Y(q.y) - sy);
        if (d < bd) {
          bd = d;
          best = j;
        }
      });
      return best >= 0 ? best : null;
    },
    onDrag: (id, sx, sy) => {
      const p = plotRef.current;
      if (!p) return;
      setSel(Number(id));
      setAdded(null);
      move(Number(id), Math.round(p.invX(sx) * 10) / 10, Math.round(p.invY(sy) * 10) / 10);
    },
  });

  const addPoint = () => {
    const next = EXTRA.find((e) => !pts.some((q) => Math.abs(q.x - e.x) < 0.15));
    if (!next || pts.length >= 7) return;
    setPts([...pts, next]);
    setAdded(pts.length);
    setSel(pts.length);
  };
  const removePoint = () => {
    if (pts.length <= 2) return;
    setPts(pts.slice(0, -1));
    setAdded(null);
    setSel(Math.min(sel, pts.length - 2));
  };
  const n = pts.length;
  const polyTex = coef
    .map((c, k) => ({ c, k }))
    .filter(({ c }) => Math.abs(c) > 5e-5)
    .map(({ c, k }, i) => {
      const s = Math.abs(c).toFixed(4);
      const sign = c < 0 ? '-' : i === 0 ? '' : '+';
      return `${sign}${s}${k === 0 ? '' : k === 1 ? 'x' : `x^{${k}}`}`;
    })
    .join(' ');

  return (
    <Figure
      no={1}
      title="점을 지나는 단 하나의 다항식"
      hint="점을 끌어 보세요. 점을 더하면 표에 새 대각선 하나만 생깁니다"
      caption={
        <>
          파란 곡선이 모든 점을 지나는 차수 {n - 1} 이하의 다항식입니다. "기저 다항식 보기"를 켜면 점선마다 <M>{'y_j\\,\\ell_j(x)'}</M>가 그려집니다. 점선 하나는 자기 점에서만 그 점의 높이를 갖고 다른 점에서는 모두 0이며, 점선들을 더한 것이 파란 곡선입니다. 아래 표는 같은 다항식의 뉴턴 형태를 만드는 분할 차분표이고, 맨 위 줄이 계수입니다.
        </>
      }
    >
      <div className="controls row">
        <Check label="기저 다항식 보기" checked={showBasis} onChange={setShowBasis} />
        <div className="btn-row">
          <Button small onClick={addPoint} disabled={pts.length >= 7 || !EXTRA.some((e) => !pts.some((q) => Math.abs(q.x - e.x) < 0.15))}>
            점 하나 더하기
          </Button>
          <Button small onClick={removePoint} disabled={pts.length <= 2}>
            마지막 점 빼기
          </Button>
          <Button
            small
            onClick={() => {
              setPts(START);
              setAdded(null);
              setSel(2);
            }}
          >
            처음으로
          </Button>
        </div>
      </div>
      <div className="fig-split">
        <div className="na-col">
          <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`점 ${n}개 (${pts.map((q) => `(${nf(q.x, 1)}, ${nf(q.y, 1)})`).join(', ')})를 모두 지나는 ${n - 1}차 이하 다항식의 그래프입니다.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="ip-poly">
            <M>{`p(x) = ${polyTex || '0'}`}</M>
          </div>
        </div>
        <div className="controls">
          <Seg label="고를 점" value={sel} onChange={setSel} options={pts.map((_, j) => ({ value: j, label: `${j + 1}` }))} />
          <Slider label={`점 ${sel + 1}의 x`} value={pts[sel]?.x ?? 0} min={X0 + 0.1} max={X1 - 0.1} step={0.1} onChange={(v) => move(sel, v, pts[sel].y)} format={(v) => nf(v, 1)} />
          <Slider label={`점 ${sel + 1}의 y`} value={pts[sel]?.y ?? 0} min={Y0} max={Y1} step={0.1} onChange={(v) => move(sel, pts[sel].x, v)} format={(v) => nf(v, 1)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="점의 수" value={n} />
            <Readout label="차수 (이하)" value={n - 1} />
          </div>
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="ip-dd" aria-label="분할 차분표">
          <thead>
            <tr>
              <th>
                <M>{'x_i'}</M>
              </th>
              <th>
                <M>{'f[x_i]'}</M>
              </th>
              {Array.from({ length: n - 1 }, (_, k) => (
                <th key={k}>{k + 1}차 차분</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((row, i) => (
              <tr key={i} data-new={added !== null && i + row.length - 1 === added ? '' : undefined}>
                <td className="num">{nf(xs[i], 1)}</td>
                {Array.from({ length: n }, (_, k) => (
                  <td key={k} className="num" data-top={i === 0 ? '' : undefined} data-fresh={added !== null && k < row.length && i + k === added ? '' : undefined}>
                    {k < row.length ? nf(row[k]) : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="na-small">
        {added !== null
          ? `점 ${added + 1}을 더하자 표에는 색칠된 칸 ${added + 1}개만 새로 생겼습니다. 앞의 계수는 그대로이고, 다항식에는 항 하나가 붙습니다.`
          : '굵은 맨 위 줄이 뉴턴 형태의 계수 c₀, c₁, …입니다. 점을 더하면 새로 계산할 칸이 어디인지 색으로 보여 줍니다.'}
      </p>
    </Figure>
  );
}

/* ─────────────── Figure 2: Runge's function, equispaced vs Chebyshev nodes ─────────────── */

type NodeKind = 'equi' | 'cheb';

function RungeFigure() {
  const P = usePalette();
  const [n, setN] = useState(11);
  const [kind, setKind] = useState<NodeKind>('equi');
  const nodes = kind === 'equi' ? equispaced(n) : chebyshev(n);
  const pn = useMemo(() => interpolant(runge, nodes), [kind, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const curve = useMemo(() => {
    const out: { n: number; equi: number; cheb: number }[] = [];
    for (let m = 3; m <= 25; m++) out.push({ n: m, equi: maxError(runge, interpolant(runge, equispaced(m)), 1201), cheb: maxError(runge, interpolant(runge, chebyshev(m)), 1201) });
    return out;
  }, []);
  const eNow = maxError(runge, interpolant(runge, equispaced(n)));
  const cNow = maxError(runge, interpolant(runge, chebyshev(n)));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const narrow = w < 560;
      const lw = narrow ? w : w * 0.56;
      const lh = narrow ? h * 0.56 : h;
      ctx.save();
      const p = new Plot(ctx, lw, lh, P, { xMin: -1.05, xMax: 1.05, yMin: -0.6, yMax: 1.4, pad: { l: 34, r: 10, t: 12, b: 24 } });
      p.grid({ xStep: 0.5, yStep: 0.5 });
      p.clip();
      p.fn(runge, P.ink3, 2, { dash: [6, 4], samples: 400 });
      p.fn(pn, kind === 'equi' ? P.accent : P.pos, 2.5, { samples: 800 });
      p.unclip();
      nodes.forEach((x) => p.dot(x, runge(x), 4.5, kind === 'equi' ? P.accent : P.pos, P.surface, 1.5));
      ctx.restore();

      // right: max error vs n on a log scale
      ctx.save();
      const ox = narrow ? 0 : lw;
      const oy = narrow ? lh : 0;
      ctx.translate(ox, oy);
      const q = new Plot(ctx, narrow ? w : w - lw, narrow ? h - lh : h, P, { xMin: 2, xMax: 26, yMin: -3, yMax: 3, pad: { l: 44, r: 10, t: 12, b: 26 } });
      gridXY(q, 4, 1, (v) => String(Math.round(v)), (v) => sup(`10^${Math.round(v)}`.replace('-', '−')));
      const path = (key: 'equi' | 'cheb', col: string) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        curve.forEach((r, i) => {
          const y = Math.max(-3, Math.min(3, Math.log10(r[key])));
          if (i) ctx.lineTo(q.X(r.n), q.Y(y));
          else ctx.moveTo(q.X(r.n), q.Y(y));
        });
        ctx.stroke();
      };
      path('equi', P.accent);
      path('cheb', P.pos);
      q.line(n, -3, n, 3, alpha(P.ink3, 0.6), 1, [4, 4]);
      q.dot(n, Math.min(3, Math.log10(eNow)), 4.5, P.accent);
      q.dot(n, Math.log10(cNow), 4.5, P.pos);
      q.text('가장 큰 오차', 2.3, 3, P.ink3, { dy: 8, font: `600 11px ${P.fontBody}` });
      q.text('점의 수 n', 25.6, -3, P.ink3, { dy: -10, align: 'right', font: `11px ${P.fontBody}` });
      ctx.restore();
    },
    [P, pn, nodes, kind, curve, n, eNow, cNow],
    { aspect: NARROW ? 0.85 : 2.0, maxHeight: 520, minHeight: 40 },
  );

  return (
    <Figure
      no={2}
      title="점을 늘렸는데 더 나빠지는 다항식"
      hint="n을 늘려 보고, 점을 고르는 방법을 바꿔 보세요"
      caption={
        <>
          회색 점선이 룽게 함수 <M>{'f(x) = 1/(1+25x^2)'}</M>이고, 색 곡선이 점 n개에서 f와 같은 값을 갖는 다항식입니다. 오른쪽(좁은 화면에서는 아래) 그래프는 [−1, 1]에서 둘의 가장 큰 차이를 n = 3부터 25까지 로그 눈금으로 그린 것입니다. 파랑은 똑같은 간격의 점, 주황은 체비쇼프 점입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="점을 고르는 법"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'equi', label: '같은 간격' },
            { value: 'cheb', label: '체비쇼프 점' },
          ]}
        />
        <Slider label="점의 수 n" value={n} min={3} max={25} step={1} onChange={setN} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`룽게 함수를 ${kind === 'equi' ? '같은 간격의' : '체비쇼프'} 점 ${n}개로 보간한 다항식. 가장 큰 오차는 같은 간격일 때 ${ef(eNow)}, 체비쇼프 점일 때 ${ef(cNow)}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts">
        <Readout label="같은 간격: 최대 오차" value={sci(eNow)} color={eNow > 1 ? 'var(--bad)' : 'var(--neg)'} />
        <Readout label="체비쇼프: 최대 오차" value={sci(cNow)} color="var(--pos)" />
      </div>
      <Legend
        items={[
          { color: 'var(--ink-3)', label: '룽게 함수', shape: 'ln' },
          { color: 'var(--accent)', label: '같은 간격의 점', shape: 'ln' },
          { color: 'var(--pos)', label: '체비쇼프 점', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: natural cubic spline on the same points ─────────────── */

function SplineFigure() {
  const P = usePalette();
  const [n, setN] = useState(11);
  const [showPoly, setShowPoly] = useState(true);
  const nodes = equispaced(n);
  const pts = nodes.map((x) => ({ x, y: runge(x) }));
  const s = useMemo(() => naturalSpline(pts), [n]); // eslint-disable-line react-hooks/exhaustive-deps
  const poly = useMemo(() => interpolant(runge, nodes), [n]); // eslint-disable-line react-hooks/exhaustive-deps
  const sErr = maxError(runge, s);
  const pErr = maxError(runge, poly);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -1.05, xMax: 1.05, yMin: -0.6, yMax: 1.4, pad: { l: 34, r: 10, t: 12, b: 24 } });
      p.grid({ xStep: 0.25, yStep: 0.5 });
      p.clip();
      p.fn(runge, P.ink3, 2, { dash: [6, 4], samples: 400 });
      if (showPoly) p.fn(poly, alpha(P.accent, 0.55), 1.8, { samples: 800 });
      p.fn(s, P.good, 2.8, { samples: 800 });
      p.unclip();
      pts.forEach((q) => p.dot(q.x, q.y, 4.5, P.good, P.surface, 1.5));
    },
    [P, s, poly, showPoly, n],
    { aspect: NARROW ? 1.4 : 2.0, maxHeight: 320, minHeight: 40 },
  );

  return (
    <Figure
      no={3}
      title="휘는 자처럼: 3차 스플라인"
      hint="n을 바꿔 다항식과 스플라인의 오차를 비교해 보세요"
      caption={
        <>
          같은 간격의 점 n개를 지나는 자연 3차 스플라인(초록)과 같은 점을 지나는 다항식(흐린 파랑)입니다. 스플라인은 점 사이마다 다른 3차식을 쓰되, 이웃한 조각이 만나는 점에서 값과 기울기와 휘어짐(2계 도함수)까지 맞춥니다. 양 끝에서는 휘어짐을 0으로 둡니다.
        </>
      }
    >
      <div className="controls row">
        <Slider label="점의 수 n" value={n} min={3} max={25} step={1} onChange={setN} />
        <Check label="같은 점을 지나는 다항식도 보기" checked={showPoly} onChange={setShowPoly} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`룽게 함수를 같은 간격의 점 ${n}개로 보간한 3차 스플라인. 최대 오차는 스플라인 ${ef(sErr)}, 다항식 ${ef(pErr)}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts">
        <Readout label="스플라인: 최대 오차" value={sci(sErr)} color="var(--good)" />
        <Readout label="다항식: 최대 오차" value={sci(pErr)} color={pErr > 1 ? 'var(--bad)' : undefined} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: least squares with a degree slider ─────────────── */

const N_DATA = 15;
const SIGMA = 0.15;

function LeastSquaresFigure() {
  const P = usePalette();
  const [deg, setDeg] = useState(3);
  const [seed, setSeed] = useState(4);
  const data = useMemo(() => noisyData(N_DATA, SIGMA, rng(seed)), [seed]);
  const c = useMemo(() => lsqPoly(data, deg), [data, deg]);
  const errs = useMemo(() => Array.from({ length: N_DATA }, (_, d) => fitErrors(data, lsqPoly(data, d))), [data]);
  const best = errs.reduce((b, e, d) => (e.truth < errs[b].truth ? d : b), 0);
  const now = errs[deg];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const narrow = w < 560;
      const lw = narrow ? w : w * 0.58;
      const lh = narrow ? h * 0.58 : h;
      const p = new Plot(ctx, lw, lh, P, { xMin: -1.08, xMax: 1.08, yMin: -1.8, yMax: 1.8, pad: { l: 34, r: 10, t: 12, b: 24 } });
      p.grid({ xStep: 0.5, yStep: 1 });
      p.clip();
      p.fn(truth, P.ink3, 2, { dash: [6, 4], samples: 300 });
      p.fn((x) => polyAt(c, x), P.accent, 2.6, { samples: 600 });
      p.unclip();
      data.forEach((q) => p.dot(q.x, q.y, 4.5, P.pos, P.surface, 1.5));

      ctx.save();
      ctx.translate(narrow ? 0 : lw, narrow ? lh : 0);
      const q = new Plot(ctx, narrow ? w : w - lw, narrow ? h - lh : h, P, { xMin: -0.5, xMax: 14.5, yMin: -3, yMax: 1, pad: { l: 44, r: 10, t: 14, b: 26 } });
      gridXY(q, 2, 1, (v) => String(Math.round(v)), (v) => sup(`10^${Math.round(v)}`.replace('-', '−')));
      const lg = (v: number) => Math.max(-3, Math.min(1, Math.log10(Math.max(v, 1e-6))));
      const line = (key: 'train' | 'truth', col: string, dash: number[] = []) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.setLineDash(dash);
        ctx.beginPath();
        errs.forEach((e, d) => (d ? ctx.lineTo(q.X(d), q.Y(lg(e[key]))) : ctx.moveTo(q.X(d), q.Y(lg(e[key])))));
        ctx.stroke();
        ctx.setLineDash([]);
      };
      line('train', P.pos, [5, 4]);
      line('truth', P.accent);
      q.line(deg, -3, deg, 1, alpha(P.ink3, 0.6), 1, [4, 4]);
      q.dot(deg, lg(now.truth), 4.5, P.accent);
      q.dot(deg, lg(now.train), 4.5, P.pos);
      q.text('차수', 14.4, -3, P.ink3, { dy: -10, align: 'right', font: `11px ${P.fontBody}` });
      ctx.restore();
    },
    [P, data, c, errs, deg, now],
    { aspect: NARROW ? 0.85 : 2.0, maxHeight: 520, minHeight: 40 },
  );

  return (
    <Figure
      no={4}
      title="모든 점을 지나지 않는 편이 나을 때"
      hint="차수를 0부터 14까지 올려 보세요"
      caption={
        <>
          회색 점선 <M>{'\\sin(2.2x) + 0.4x'}</M>에 잡음(표준편차 {SIGMA})을 섞은 점 {N_DATA}개(주황)에, 오차 제곱의 합이 가장 작은 다항식(파랑)을 맞춥니다. 오른쪽(좁은 화면에서는 아래)은 차수마다 두 오차를 로그 눈금으로 그린 것입니다. 주황 점선은 데이터 점과의 차이, 파란 실선은 원래 곡선과의 차이(둘 다 제곱 평균의 제곱근)입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider label="다항식의 차수" value={deg} min={0} max={14} step={1} onChange={setDeg} />
        <Button small onClick={() => setSeed((s) => s + 1)}>
          잡음 다시 뽑기
        </Button>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`잡음 섞인 점 ${N_DATA}개에 ${deg}차 다항식을 최소제곱으로 맞춘 그림. 데이터와의 오차 ${nf(now.train, 3)}, 원래 곡선과의 오차 ${nf(now.truth, 3)}이고, 원래 곡선에 가장 가까운 차수는 ${best}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts">
        <Readout label="데이터와의 오차" value={nf(now.train, 3)} color="var(--pos)" />
        <Readout label="원래 곡선과의 오차" value={nf(now.truth, 3)} color={deg === best ? 'var(--good)' : 'var(--accent)'} />
        <Readout label="가장 나은 차수" value={best} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Interpolation() {
  return (
    <>
      <h2>점 몇 개로 함수를 흉내 내기</h2>
      <p>
        실험 장비가 1초마다 온도를 재면 0.5초일 때의 온도는 모릅니다. 사인 함수를 계산하는 라이브러리도 모든 x에서 값을 저장해 둘 수는 없습니다. 이렇게 알려진 점 몇 개로 그 사이의 값을 짐작하는 것을 <T en="interpolation">보간</T>이라고 하고, 가장 오래된 도구가 다항식입니다. 다항식은 더하고 곱하기만으로 계산되므로 컴퓨터가 가장 빨리 계산할 수 있는 함수이기도 합니다.
      </p>
      <p>
        x좌표가 모두 다른 점 n개가 있으면 그 점을 모두 지나는 n − 1차 이하의 다항식은 정확히 하나 있습니다. 두 점을 지나는 직선이 하나뿐인 것과 같은 이야기입니다. 그 다항식을 직접 적는 방법이 <T en="Lagrange interpolation">라그랑주 보간</T>입니다.
      </p>
      <MB>{'p(x) = \\sum_{j=0}^{n-1} y_j\\,\\ell_j(x), \\qquad \\ell_j(x) = \\prod_{k \\ne j} \\frac{x - x_k}{x_j - x_k}'}</MB>
      <p>
        <M>{'\\ell_j'}</M>는 j번째 점에서 1, 나머지 점에서 모두 0이 되도록 만든 기저 다항식입니다. 분자의 <M>{'(x - x_k)'}</M>가 다른 점에서 값을 0으로 만들고, 분모가 자기 점에서 값을 1로 맞춥니다. 그래서 <M>{'y_j\\ell_j'}</M>를 모두 더하면 각 점에서 정확히 <M>{'y_j'}</M>가 됩니다.
      </p>
      <LagrangeFigure />
      <p>
        처음 다섯 점의 분할 차분표 맨 위 줄은 1, −1.5, 1.6, −0.8362, 0.3084입니다. 이것이 <T en="Newton form">뉴턴 형태</T>의 계수이고, 다항식은 다음과 같이 적힙니다.
      </p>
      <MB>{'p(x) = 1 - 1.5(x+2) + 1.6(x+2)(x+1) - 0.8362(x+2)(x+1)x + 0.3084(x+2)(x+1)x(x-1.2)'}</MB>
      <p>
        전개하면 그림 아래의 식 <M>{'1.2 + 0.8876x - 1.4019x^2 - 0.2811x^3 + 0.3084x^4'}</M>와 같습니다. 같은 다항식을 다르게 적었을 뿐입니다. 뉴턴 형태의 장점은 점을 하나 더할 때 드러납니다. 라그랑주 형태는 모든 <M>{'\\ell_j'}</M>의 분모가 바뀌어 처음부터 다시 계산해야 하지만, 분할 차분표는 새 점이 만드는 대각선 한 줄만 계산하면 되고 앞의 계수는 그대로입니다. "점 하나 더하기"를 눌러 보면 다섯 점에 여섯째 점을 더할 때 새로 생기는 칸이 6개뿐인 것을 볼 수 있습니다. 차분 하나는 뺄셈 두 번과 나눗셈 한 번이므로, n번째 점을 더하는 데는 n에 비례하는 계산이면 됩니다.
      </p>
      <Callout kind="note">
        실제 계산에서는 라그랑주 공식을 그대로 쓰지 않고, 같은 내용을 나눗셈이 덜 위험하게 정리한 <T en="barycentric formula">무게중심 공식</T>을 씁니다. 이 장의 그림 2와 3도 그 공식으로 계산합니다. 어느 형태든 수학적으로는 같은 다항식이고, 다른 것은 반올림 오차가 쌓이는 방식입니다. 이 차이는 <a href={lessonHref('math-numerical-analysis', 'floating-point')}>부동소수점과 오차</a> 장에서 본 안정성 이야기입니다.
      </Callout>

      <h2>점을 늘렸는데 더 나빠진다: 룽게 현상</h2>
      <p>
        점을 많이 찍으면 다항식이 함수에 더 가까워질 것 같습니다. 1901년 룽게(Carl Runge)는 그렇지 않은 예를 보였습니다. 종 모양의 매끄러운 함수 <M>{'1/(1+25x^2)'}</M>를 [−1, 1]에서 똑같은 간격의 점으로 보간하면, 점을 늘릴수록 가운데는 좋아지지만 양 끝에서 다항식이 점점 크게 요동칩니다.
      </p>
      <RungeFigure />
      <p>
        같은 간격의 점 11개로 보간하면 가장 큰 오차가 1.916으로, 함수값 자체(최대 1)보다 큽니다. 21개면 59.82입니다. 그런데 같은 개수의 점을 양 끝 쪽에 더 촘촘하게 모은 <T en="Chebyshev nodes">체비쇼프 점</T>
        <M>{'x_k = \\cos\\frac{(2k+1)\\pi}{2n}'}</M>을 쓰면 오차가 0.1092, 0.01533으로 꾸준히 줄어듭니다. 체비쇼프 점은 반원 위에 같은 간격으로 놓은 점을 아래로 내린 위치입니다.
      </p>
      <p>
        이유는 보간 오차의 공식에 있습니다. 함수가 충분히 매끄러우면 어떤 ξ에 대해
      </p>
      <MB>{'f(x) - p(x) = \\frac{f^{(n)}(\\xi)}{n!}\\,(x - x_0)(x - x_1)\\cdots(x - x_{n-1})'}</MB>
      <p>
        입니다. 뒤의 곱은 점을 어디에 두느냐에만 달려 있는데, 같은 간격의 점이면 양 끝 근처에서 이 곱이 가운데보다 훨씬 커집니다. 체비쇼프 점은 이 곱의 최댓값을 가장 작게 만드는 배치입니다. 룽게 함수는 도함수 <M>{'f^{(n)}'}</M>이 n이 커질수록 빠르게 커지는 함수라서, 곱이 큰 양 끝에서 오차가 터집니다.
      </p>
      <Callout kind="warn">
        같은 간격으로 잰 데이터에 높은 차수의 다항식 하나를 맞추는 것은 거의 언제나 나쁜 생각입니다. 데이터 간격을 고를 수 있다면 체비쇼프 점을 쓰고, 고를 수 없다면 다음 절의 스플라인처럼 낮은 차수의 조각을 이어 붙입니다.
      </Callout>

      <h2>조각으로 이어 붙이기: 스플라인</h2>
      <p>
        배를 설계하던 사람들은 얇고 잘 휘는 나무 자(spline)를 못 몇 개에 걸쳐 매끄러운 곡선을 그렸습니다. 자는 휘는 에너지가 가장 작은 모양으로 놓이는데, 이것을 수식으로 옮긴 것이 <T en="cubic spline">3차 스플라인</T>입니다. 이웃한 두 점 사이마다 다른 3차식을 쓰고, 만나는 점에서 값, 기울기, 휘어짐이 모두 같도록 계수를 정합니다. 양 끝에서 휘어짐을 0으로 두면 <T en="natural spline">자연 스플라인</T>이 됩니다.
      </p>
      <p>
        안쪽 점 i마다 휘어짐 <M>{'M_i = s\'\'(x_i)'}</M>에 대한 식이 하나씩 나오는데, 각 식에는 이웃한 세 개의 <M>{'M'}</M>만 들어갑니다. 그래서 연립방정식의 행렬이 대각선과 그 양옆에만 수가 있는 삼중대각 행렬이 되고, n개의 점이면 n에 비례하는 계산으로 풀립니다.
      </p>
      <SplineFigure />
      <p>
        같은 간격의 점 11개에서 스플라인의 최대 오차는 0.02197로, 같은 점을 지나는 다항식(1.916)의 90분의 1 정도입니다. 점을 15개로 늘리면 0.00248까지 줄어듭니다. 다항식 하나는 모든 점의 영향을 한꺼번에 받지만, 스플라인의 한 조각은 근처의 점에 주로 좌우되기 때문에 한쪽 끝의 사정이 반대쪽까지 번지지 않습니다. 글꼴의 윤곽, 애니메이션의 경로, 로봇 팔의 궤적에 스플라인을 쓰는 이유입니다. 비슷한 곡선은 <a href={lessonHref('cs-graphics', 'curves-animation')}>곡선과 애니메이션</a> 장의 베지어 곡선에서도 볼 수 있습니다.
      </p>

      <h2>꼭 지나지 않아도 될 때: 최소제곱 근사</h2>
      <p>
        측정값에 잡음이 섞여 있으면 모든 점을 지나는 곡선은 잡음까지 따라 그립니다. 이럴 때는 점을 지나는 대신, 점들과의 차이를 제곱해 더한 값 <M>{'\\sum_i (p(x_i) - y_i)^2'}</M>이 가장 작은 낮은 차수의 다항식을 찾습니다. 이것이 <T en="least squares">최소제곱 근사</T>이고, 기초 인공지능의 <a href={lessonHref('ai-basics', 'linear-regression')}>선형회귀</a>와 같은 문제입니다.
      </p>
      <LeastSquaresFigure />
      <p>
        처음 데이터에서 차수를 0부터 올리면 데이터와의 오차는 꾸준히 줄어 14차에서 0이 됩니다. 점이 15개이므로 14차 다항식은 모든 점을 지납니다. 그런데 원래 곡선과의 오차는 1차에서 0.213, 3차에서 0.042, 5차에서 0.040으로 가장 작아졌다가, 그다음부터 다시 커져 12차에서 0.615, 14차에서 3.037이 됩니다. 높은 차수의 다항식이 잡음을 따라가느라 점 사이에서 크게 출렁이기 때문입니다. 데이터에 너무 잘 맞추느라 원래 규칙에서 멀어지는 이 현상이 기계 학습에서 말하는 <a href={lessonHref('ai-basics', 'overfitting')}>과적합</a>입니다.
      </p>
      <Callout kind="note">
        최소제곱 문제를 정규방정식 <M>{'A^{\\mathsf T}A\\,c = A^{\\mathsf T}y'}</M>로 풀면 행렬의 조건수가 제곱으로 나빠져 높은 차수에서 답이 망가집니다. 그림 4는 하우스홀더 QR 분해로 풉니다. 조건수가 무엇인지는 <a href={lessonHref('math-numerical-analysis', 'linear-systems')}>연립방정식과 조건수</a> 장에서 다룹니다.
      </Callout>

      <Callout kind="key">
        x좌표가 다른 n개의 점을 지나는 n − 1차 이하 다항식은 하나뿐이고, 라그랑주 형태나 뉴턴 형태로 적을 수 있습니다. 뉴턴 형태는 분할 차분표의 대각선 한 줄만 더 계산하면 점을 추가할 수 있습니다. 같은 간격의 점에서 차수를 높이면 양 끝이 요동치는 룽게 현상이 생기므로, 체비쇼프 점을 쓰거나 낮은 차수의 조각을 매끄럽게 이은 스플라인을 씁니다. 잡음이 있는 데이터에는 점을 지나는 대신 오차 제곱합을 최소로 하는 근사를 쓰고, 차수가 너무 높으면 과적합이 됩니다.
      </Callout>
      <Quiz
        q="[−1, 1]에서 매끄러운 함수의 값을 같은 간격으로 31곳에서 측정했다. 이 사이의 값을 가장 믿을 만하게 짐작하는 방법은?"
        options={['31개 점을 모두 지나는 30차 다항식을 쓴다', '31개 점을 지나는 3차 스플라인을 쓴다', '양 끝 점 두 개를 잇는 직선을 쓴다', '30차 다항식을 쓰되 계수를 정규방정식으로 구한다']}
        answer={1}
        explain={<>같은 간격의 점에 높은 차수의 다항식 하나를 맞추면 룽게 현상으로 양 끝에서 크게 요동칠 수 있습니다. 스플라인은 점 사이마다 3차식을 쓰고 만나는 점에서 매끄럽게 이어, 점이 많아질수록 안정적으로 함수에 가까워집니다. 직선 하나로는 함수의 모양을 담을 수 없고, 계수를 구하는 방법을 바꿔도 30차 다항식이라는 사실은 그대로입니다.</>}
      />
    </>
  );
}
