import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { NEWTON, boxOptimum, boxVolume, correctDigits, mvtPoints, newton, pDeriv, pEval, specialPoints, type Poly, type Special } from './optimize';
import './calculus.css';
import './applications.css';

const nf = (v: number, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');
const KIND_KO: Record<Special['kind'], string> = { max: '극대', min: '극소', flat: '극값 아님', inflection: '변곡점' };

/* ─────────────── Figure 1: where f′ = 0 ─────────────── */

const PRESETS: { id: string; label: string; c: Poly }[] = [
  { id: 'cubic', label: 'x³ − 3x', c: [0, -3, 0, 1, 0] },
  { id: 'quartic', label: 'x⁴ − 2x²', c: [0, 0, -2, 0, 1] },
  { id: 'flat', label: 'x³', c: [0, 0, 0, 1, 0] },
];
const X0 = -2.6, X1 = 2.6;

function polyTex(c: Poly): string {
  const terms: string[] = [];
  for (let k = c.length - 1; k >= 1; k--) {
    const a = Math.round(c[k] * 10) / 10;
    if (a === 0) continue;
    const mag = Math.abs(a) === 1 ? '' : String(Math.abs(a));
    const xp = k === 1 ? 'x' : `x^${k}`;
    terms.push(`${a < 0 ? '-' : terms.length ? '+' : ''} ${mag}${xp}`);
  }
  return terms.length ? terms.join(' ') : '0';
}

function CriticalFigure() {
  const P = usePalette();
  const [c, setC] = useState<Poly>(PRESETS[0].c);
  const set = (k: number, v: number) => setC((old) => old.map((a, i) => (i === k ? v : a)));
  const pts = useMemo(() => specialPoints(c, X0, X1), [c]);
  const d1 = useMemo(() => pDeriv(c), [c]);
  const f = (x: number) => pEval(c, x);
  const fp = (x: number) => pEval(d1, x);
  const preset = PRESETS.find((p) => p.c.every((a, i) => Math.abs(a - c[i]) < 1e-9))?.id ?? 'custom';

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      // y-range from the curve itself, so any coefficients stay in view
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i <= 120; i++) {
        const y = f(X0 + ((X1 - X0) * i) / 120);
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
      const span = Math.max(1, hi - lo);
      const topH = h * 0.66;
      const pl = new Plot(ctx, w, topH, P, { xMin: X0, xMax: X1, yMin: lo - span * 0.12, yMax: hi + span * 0.12, pad: { l: 36, r: 12, t: 12, b: 22 } });
      pl.grid({ xStep: 1 });
      pl.fn(f, P.accent, 2.5);
      for (const p of pts) {
        const col = p.kind === 'max' ? P.neg : p.kind === 'min' ? P.pos : p.kind === 'inflection' ? P.hl : P.ink3;
        if (p.kind === 'max' || p.kind === 'min' || p.kind === 'flat') pl.line(p.x - 0.45, p.y, p.x + 0.45, p.y, alpha(col, 0.8), 1.5, [4, 3]);
        pl.dot(p.x, p.y, p.kind === 'inflection' ? 5 : 6, p.kind === 'inflection' ? P.surface : col, col, 2);
        pl.text(KIND_KO[p.kind], p.x, p.y, col, { dy: p.kind === 'min' ? 16 : -16, align: 'center', font: `600 11px ${P.fontBody}`, bg: P.surface });
      }
      // f′ strip with its sign
      ctx.save();
      ctx.translate(0, topH);
      const bh = h - topH;
      let m = 0;
      for (let i = 0; i <= 120; i++) m = Math.max(m, Math.abs(fp(X0 + ((X1 - X0) * i) / 120)));
      const pd = new Plot(ctx, w, bh, P, { xMin: X0, xMax: X1, yMin: -Math.max(1, m) * 1.1, yMax: Math.max(1, m) * 1.1, pad: { l: 36, r: 12, t: 8, b: 20 } });
      // shade where f′ > 0 and < 0
      const n = 160;
      for (let i = 0; i < n; i++) {
        const xa = X0 + ((X1 - X0) * i) / n, xb = X0 + ((X1 - X0) * (i + 1)) / n;
        const v = fp((xa + xb) / 2);
        ctx.fillStyle = alpha(v > 0 ? P.good : P.bad, 0.1);
        ctx.fillRect(Math.floor(pd.X(xa)), pd.pad.t, Math.ceil(pd.X(xb)) - Math.floor(pd.X(xa)), pd.ph);
      }
      pd.grid({ xStep: 1, yStep: 1e9 });
      pd.fn(fp, P.dl, 2);
      for (const p of pts) if (p.kind !== 'inflection') pd.dot(p.x, 0, 4, P.dl);
      pd.text("f′(x)", X0, 0, P.dl, { dx: 6, dy: -pd.ph / 2 + 10, font: `600 11px ${P.fontMono}`, bg: P.surface });
      ctx.restore();
    },
    [P, c, pts],
    { height: 380, minHeight: 40 },
  );

  const summary = pts.length ? pts.map((p) => `${KIND_KO[p.kind]} x = ${nf(p.x)}`).join(', ') : '특별한 점이 없습니다';
  return (
    <Figure
      no={1}
      title="기울기가 0인 곳 찾기"
      hint="계수를 바꿔 곡선의 꼭대기와 바닥이 어떻게 움직이는지 보세요"
      caption={<>위는 <M>{`f(x) = ${polyTex(c)}`}</M>, 아래는 그 도함수 <M>{"f'(x)"}</M>입니다. 아래 띠의 초록 바탕은 <M>{"f'>0"}</M>(올라가는 구간), 붉은 바탕은 <M>{"f'<0"}</M>(내려가는 구간)입니다. 점선은 기울기가 0인 수평 접선입니다. 극대와 극소는 <M>{"f'"}</M>의 부호가 바뀌는 곳에서 정하고, 변곡점은 <M>{"f''"}</M>의 부호가 바뀌는 곳입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`다항식 f(x) = ${polyTex(c).replace(/\^/g, '')}의 그래프와 도함수. ${summary}.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="예시" value={preset} onChange={(id) => id !== 'custom' && setC(PRESETS.find((p) => p.id === id)!.c)} options={[...PRESETS.map((p) => ({ value: p.id, label: p.label })), ...(preset === 'custom' ? [{ value: 'custom', label: '직접' }] : [])]} />
          <Slider label={<M>{'x^4'}</M>} value={c[4]} min={-1} max={1} step={0.1} onChange={(v) => set(4, v)} format={(v) => nf(v, 1)} />
          <Slider label={<M>{'x^3'}</M>} value={c[3]} min={-2} max={2} step={0.1} onChange={(v) => set(3, v)} format={(v) => nf(v, 1)} />
          <Slider label={<M>{'x^2'}</M>} value={c[2]} min={-3} max={3} step={0.1} onChange={(v) => set(2, v)} format={(v) => nf(v, 1)} />
          <Slider label={<M>{'x'}</M>} value={c[1]} min={-4} max={4} step={0.1} onChange={(v) => set(1, v)} format={(v) => nf(v, 1)} />
          <div className="tbl-wrap" style={{ margin: 0 }}>
            <table className="tbl ap-pts">
              <thead>
                <tr>
                  <th>점</th>
                  <th>x</th>
                  <th>f(x)</th>
                  <th>f″(x)</th>
                </tr>
              </thead>
              <tbody>
                {pts.length ? (
                  pts.map((p, i) => (
                    <tr key={i} data-kind={p.kind}>
                      <td>{KIND_KO[p.kind]}</td>
                      <td className="mono">{nf(p.x)}</td>
                      <td className="mono">{nf(p.y)}</td>
                      <td className="mono">{p.kind === 'inflection' ? '0' : nf(p.f2)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>이 구간에는 기울기가 0인 점도, 변곡점도 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: '극대' },
          { color: 'var(--pos)', label: '극소' },
          { color: 'var(--hl)', label: '변곡점' },
          { color: 'var(--c-dl)', label: "도함수 f′", shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: the open box ─────────────── */

function BoxFigure() {
  const P = usePalette();
  const [W, setW] = useState(30);
  const [H, setH] = useState(20);
  const [x, setX] = useState(2);
  const xMax = Math.min(W, H) / 2;
  const xc = Math.min(x, xMax - 0.1);
  const best = boxOptimum(W, H);
  const V = boxVolume(W, H, xc);
  const Vbest = boxVolume(W, H, best);
  const dV = 12 * xc * xc - 4 * (W + H) * xc + W * H;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const narrow = w < 560;
      const sheetW = narrow ? w : w * 0.44;
      const sheetH = narrow ? h * 0.42 : h;
      // the sheet, scaled to fit, with the corner squares cut out
      const s = Math.min((sheetW - 24) / W, (sheetH - 40) / H);
      const ox = (sheetW - W * s) / 2, oy = 22;
      ctx.fillStyle = alpha(P.accent, 0.12);
      ctx.fillRect(ox, oy, W * s, H * s);
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox, oy, W * s, H * s);
      const cs = xc * s;
      ctx.fillStyle = P.surface;
      for (const [cx, cy] of [[ox, oy], [ox + W * s - cs, oy], [ox, oy + H * s - cs], [ox + W * s - cs, oy + H * s - cs]]) {
        ctx.fillRect(cx, cy, cs, cs);
        ctx.strokeStyle = P.neg;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(cx + 0.5, cy + 0.5, cs - 1, cs - 1);
        ctx.setLineDash([]);
      }
      // fold lines
      ctx.strokeStyle = alpha(P.ink3, 0.8);
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(ox + cs, oy + cs);
      ctx.lineTo(ox + W * s - cs, oy + cs);
      ctx.lineTo(ox + W * s - cs, oy + H * s - cs);
      ctx.lineTo(ox + cs, oy + H * s - cs);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.ink2;
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${W}cm`, ox + (W * s) / 2, oy - 4);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = P.neg;
      ctx.fillText(`x = ${nf(xc, 1)}`, ox + cs + 4, oy + cs / 2);
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`바닥 ${nf(W - 2 * xc, 1)} × ${nf(H - 2 * xc, 1)}, 높이 ${nf(xc, 1)}`, ox + (W * s) / 2, oy + H * s + 6);

      // V(x)
      ctx.save();
      if (narrow) ctx.translate(0, sheetH);
      else ctx.translate(sheetW, 0);
      const pw = narrow ? w : w - sheetW;
      const ph = narrow ? h - sheetH : h;
      const pl = new Plot(ctx, pw, ph, P, { xMin: 0, xMax: xMax, yMin: 0, yMax: Vbest * 1.18, pad: { l: 50, r: 12, t: 14, b: 26 } });
      pl.grid({ fmt: (v) => String(Math.round(v)) });
      pl.fillUnder((t) => boxVolume(W, H, t), alpha(P.accent, 0.08), 0, xMax);
      pl.fn((t) => boxVolume(W, H, t), P.accent, 2.5);
      pl.line(best, 0, best, Vbest, alpha(P.good, 0.8), 1.5, [4, 3]);
      pl.dot(best, Vbest, 5, P.surface, P.good, 2);
      pl.text(`최대 ${nf(Vbest, 0)}`, best, Vbest, P.good, { dy: -14, align: 'center', font: `600 11px ${P.fontBody}`, bg: P.surface });
      // tangent at the current x
      pl.ctx.save();
      pl.line(xc - xMax * 0.12, V - dV * xMax * 0.12, xc + xMax * 0.12, V + dV * xMax * 0.12, P.dl, 2);
      pl.ctx.restore();
      pl.dot(xc, V, 6, P.neg, P.surface, 2);
      pl.text('V (cm³)', 0, Vbest * 1.18, P.ink3, { dx: 4, dy: 8, font: `500 11px ${P.fontBody}` });
      pl.text('x (cm)', xMax, 0, P.ink3, { dx: -4, dy: -10, align: 'right', font: `500 11px ${P.fontBody}` });
      ctx.restore();
    },
    [P, W, H, xc, best, V, Vbest, dV, xMax],
    { aspect: 1.9, maxHeight: 340, minHeight: 280 },
  );

  return (
    <Figure
      no={2}
      title="종이 한 장으로 가장 큰 상자"
      hint="잘라 낼 정사각형의 크기 x를 바꿔 보세요"
      caption={<>종이 네 귀퉁이에서 한 변이 x인 정사각형을 잘라 내고 점선을 따라 접으면 뚜껑 없는 상자가 됩니다. 오른쪽 곡선은 부피 <M>{'V(x) = x(W-2x)(H-2x)'}</M>이고, 갈색 선은 지금 x에서의 접선입니다. 접선이 수평이 되는 곳(초록 점)이 가장 큰 부피입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`가로 ${W}cm, 세로 ${H}cm 종이에서 귀퉁이를 ${nf(xc, 1)}cm씩 잘라 접은 상자의 부피는 ${nf(V, 0)}세제곱센티미터입니다. 가장 큰 부피는 x가 ${nf(best)}cm일 때 ${nf(Vbest, 0)}세제곱센티미터입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider label="잘라 낼 크기 x (cm)" value={xc} min={0} max={Math.round((xMax - 0.1) * 10) / 10} step={0.1} onChange={setX} format={(v) => nf(v, 1)} />
          <Slider label="종이 가로 W (cm)" value={W} min={10} max={40} step={1} onChange={setW} />
          <Slider label="종이 세로 H (cm)" value={H} min={10} max={40} step={1} onChange={setH} />
          <Button small primary onClick={() => setX(Math.round(best * 100) / 100)}>
            V′(x) = 0인 곳으로
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="부피 V" value={`${nf(V, 0)} cm³`} />
            <Readout label="기울기 V′" value={nf(dV, 1)} color={Math.abs(dV) < 2 ? 'var(--good)' : dV > 0 ? 'var(--pos)' : 'var(--neg)'} />
            <Readout label="최적 x" value={`${nf(best)} cm`} color="var(--good)" />
            <Readout label="최대 부피" value={`${nf(Vbest, 0)} cm³`} color="var(--good)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the mean value theorem ─────────────── */

const MVT_POLY: Poly = [0, -3, 0, 1];
const MV0 = -2.4, MV1 = 2.8;

function MvtFigure() {
  const P = usePalette();
  const [a, setA] = useState(-2);
  const [b, setB] = useState(2.5);
  const plotRef = useRef<Plot | null>(null);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const ok = hi - lo > 0.05;
  const { slope, cs } = useMemo(() => (ok ? mvtPoints(MVT_POLY, lo, hi) : { slope: 0, cs: [] }), [lo, hi, ok]);
  const f = (x: number) => pEval(MVT_POLY, x);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: MV0, xMax: MV1, yMin: -6, yMax: 14, pad: { l: 34, r: 12, t: 12, b: 24 } });
      plotRef.current = pl;
      pl.grid({ xStep: 1, yStep: 2 });
      pl.fn(f, P.accent, 2.5);
      if (ok) {
        pl.slopeLine(lo, f(lo), slope, alpha(P.ink2, 0.7), 1.5, [6, 4]);
        for (const c of cs) {
          pl.ctx.save();
          pl.line(c - 1.1, f(c) - slope * 1.1, c + 1.1, f(c) + slope * 1.1, P.good, 2.5);
          pl.ctx.restore();
          pl.dot(c, f(c), 5, P.good, P.surface, 2);
          pl.text(`c = ${nf(c)}`, c, f(c), P.good, { dy: 16, align: 'center', font: `600 11px ${P.fontMono}`, bg: P.surface });
        }
      }
      for (const [id, x] of [['a', a], ['b', b]] as [string, number][]) {
        pl.dot(x, f(x), 7, P.dl, P.surface, 2);
        pl.text(id, x, f(x), P.dl, { dy: -16, align: 'center', font: `700 12px ${P.fontMono}`, bg: P.surface });
      }
    },
    [P, a, b, slope, cs, ok],
    { aspect: 1.7, maxHeight: 360, minHeight: 40 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      const pl = plotRef.current;
      if (!pl) return null;
      for (const [id, v] of [['a', a], ['b', b]] as [string, number][]) if (Math.hypot(pl.X(v) - x, pl.Y(f(v)) - y) < 16) return id;
      return null;
    },
    onDrag: (id, x) => {
      const pl = plotRef.current;
      if (!pl) return;
      const v = Math.round(Math.max(MV0, Math.min(MV1, pl.invX(x))) * 10) / 10;
      if (id === 'a') setA(v);
      else setB(v);
    },
  });

  return (
    <Figure
      no={3}
      title="평균 기울기와 같은 순간 기울기"
      hint="점 a와 b를 끌거나 슬라이더로 옮겨 보세요"
      caption={<>곡선은 <M>{'f(x) = x^3 - 3x'}</M>입니다. 회색 점선은 a와 b를 잇는 할선이고, 그 기울기가 구간의 평균 변화율입니다. 초록 선은 할선과 기울기가 같은 접선입니다. 평균값 정리는 매끄러운 곡선이라면 이런 접점 c가 a와 b 사이에 적어도 하나 있다고 말합니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`a = ${nf(a, 1)}, b = ${nf(b, 1)}. 할선의 기울기는 ${nf(slope)}이고, 같은 기울기의 접선은 ${cs.length ? cs.map((c) => `x = ${nf(c)}`).join(', ') + '에서 닿습니다' : '없습니다'}.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider label="a" value={a} min={MV0} max={MV1} step={0.1} onChange={setA} format={(v) => nf(v, 1)} color="var(--c-dl)" />
          <Slider label="b" value={b} min={MV0} max={MV1} step={0.1} onChange={setB} format={(v) => nf(v, 1)} color="var(--c-dl)" />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="할선의 기울기 (평균 변화율)" value={ok ? nf(slope) : '–'} />
            <Readout label="같은 기울기의 접점 c" value={ok ? (cs.length ? cs.map((c) => nf(c)).join(', ') : '없음') : '–'} color="var(--good)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: Newton's method ─────────────── */

function NewtonFigure() {
  const P = usePalette();
  const [fi, setFi] = useState(0);
  const fn = NEWTON[fi];
  const [x0, setX0] = useState(fn.x0);
  const xs = useMemo(() => newton(fn, x0, 8), [fn, x0]);
  const s = useStepper(xs.length, 1.5, `${fi}:${x0}`, true);
  const k = s.i; // x_k is the newest point shown
  const choose = (i: number) => {
    setFi(i);
    setX0(NEWTON[i].x0);
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const v = fn.view;
      // keep the newest point in view when it runs away
      const xk = xs[k];
      const xMin = Math.min(v.xMin, xk - 0.5), xMax = Math.max(v.xMax, xk + 0.5);
      const pl = new Plot(ctx, w, h, P, { xMin, xMax, yMin: v.yMin, yMax: v.yMax, pad: { l: 34, r: 12, t: 12, b: 24 } });
      pl.grid();
      pl.fn(fn.f, P.accent, 2.5);
      if (fn.root !== undefined) pl.dot(fn.root, 0, 4, P.good);
      for (let i = 0; i < k; i++) {
        const x = xs[i];
        const last = i === k - 1;
        const col = last ? P.dl : alpha(P.dl, 0.35);
        pl.line(x, 0, x, fn.f(x), alpha(P.ink3, 0.6), 1, [3, 3]);
        pl.slopeLine(x, fn.f(x), fn.df(x), col, last ? 2 : 1.2);
        pl.dot(x, fn.f(x), 4, col);
      }
      xs.slice(0, k + 1).forEach((x, i) => {
        const last = i === k;
        pl.dot(x, 0, last ? 6 : 4, last ? P.neg : alpha(P.neg, 0.45), last ? P.surface : undefined, 2);
        if (i >= k - 1) pl.text(`x${'₀₁₂₃₄₅₆₇₈'[i] ?? i}`, x, 0, last ? P.neg : P.ink3, { dy: 16, align: 'center', font: `600 12px ${P.fontMono}`, bg: P.surface });
      });
    },
    [P, fn, xs, k],
    { aspect: 1.7, maxHeight: 360, minHeight: 40 },
  );

  const digits = fn.root !== undefined ? xs.map((x) => correctDigits(x, fn.root!)) : [];
  return (
    <Figure
      no={4}
      title="접선을 타고 근으로: 뉴턴 방법"
      hint="한 단계씩 넘기며 접선이 축과 만나는 곳을 따라가세요"
      caption={<>지금 점 <M>{'x_k'}</M>에서 접선을 긋고, 그 접선이 x축과 만나는 곳을 다음 점 <M>{'x_{k+1}'}</M>로 삼습니다. 초록 점이 진짜 근입니다. 표의 "맞는 자리"는 근과 소수점 아래 몇 자리까지 같은지입니다.</>}
    >
      <div className="controls row">
        <Seg label="함수" value={fi} onChange={choose} options={NEWTON.map((n, i) => ({ value: i, label: n.label }))} />
        <Slider label={<>시작점 <M>{'x_0'}</M></>} value={x0} min={fn.id === 'atan' ? -2 : fn.view.xMin + 0.1} max={fn.id === 'atan' ? 2 : fn.view.xMax - 0.1} step={0.05} onChange={setX0} format={(v) => nf(v)} />
      </div>
      <div className="fig-split">
        <div className="ca-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${fn.label}: ${fn.tex.replace(/\\/g, '')}. x0 = ${nf(x0)}에서 시작해 지금 x${k} = ${xs[k].toPrecision(8)}입니다.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="ap-formula">
            <M>{fn.tex}</M>
            <MB>{'x_{k+1} = x_k - \\frac{f(x_k)}{f\'(x_k)}'}</MB>
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="nw-speed" maxSpeed={6} />
          <div className="tbl-wrap" style={{ margin: 0 }}>
            <table className="tbl ap-iter">
              <thead>
                <tr>
                  <th>k</th>
                  <th>
                    x<sub>k</sub>
                  </th>
                  {fn.root !== undefined && fn.id === 'sqrt2' && <th>맞는 자리</th>}
                </tr>
              </thead>
              <tbody>
                {xs.map((x, i) => (
                  <tr key={i} data-on={i === k || undefined} data-dim={i > k || undefined}>
                    <td className="mono">{i}</td>
                    <td className="mono">{i <= k ? (Math.abs(x) > 1e6 ? x.toExponential(3) : x.toPrecision(15)) : '·'}</td>
                    {fn.id === 'sqrt2' && <td className="mono">{i <= k ? digits[i] : ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Applications() {
  return (
    <>
      <h2>기울기가 0인 곳</h2>
      <p>
        <a href={lessonHref('math-calculus', 'derivatives')}>앞 장</a>에서 도함수 <M>{"f'(x)"}</M>가 그래프의 순간 기울기라는 것을 보았습니다. 이 사실 하나로 곡선의 모양을 거의 다 읽을 수 있습니다. <M>{"f'(x) > 0"}</M>인 구간에서 그래프는 올라가고, <M>{"f'(x) < 0"}</M>인 구간에서는 내려갑니다. 그렇다면 산꼭대기와 골짜기 바닥에서는 올라가다 내려가거나 내려가다 올라가므로, 그 순간의 기울기는 0입니다. 기울기가 0인 점을 <T en="critical point">임계점</T>이라고 합니다.
      </p>
      <p>
        그림 1의 처음 곡선은 <M>{'f(x) = x^3 - 3x'}</M>입니다. 도함수 <M>{"f'(x) = 3x^2 - 3"}</M>을 0으로 놓으면 <M>{'x = \\pm 1'}</M>이 나옵니다. <M>{'x = -1'}</M> 근처에서 <M>{"f'"}</M>은 양수에서 음수로 바뀌므로 그래프가 올라가다 내려가는 <T en="local maximum">극대</T>(값 2)이고, <M>{'x = 1'}</M>에서는 음수에서 양수로 바뀌므로 <T en="local minimum">극소</T>(값 −2)입니다. 이것이 <T en="first derivative test">1계 도함수 판정법</T>입니다.
      </p>
      <CriticalFigure />
      <p>
        기울기가 0이라고 모두 꼭대기나 바닥은 아닙니다. 예시를 <strong>x³</strong>으로 바꾸면 <M>{'x = 0'}</M>에서 기울기가 0이지만, 도함수 띠가 양쪽 모두 초록이라 그래프는 잠깐 평평해질 뿐 계속 올라갑니다. 그래서 임계점을 찾은 다음에는 부호가 정말 바뀌는지 확인해야 합니다.
      </p>
      <p>
        또 하나의 방법은 이계도함수 <M>{"f''"}</M>를 보는 것입니다. <M>{"f''"}</M>는 기울기가 변하는 빠르기, 즉 그래프가 휘는 방향입니다. <M>{"f''>0"}</M>이면 그릇처럼 위로 오목하므로 기울기 0인 점은 바닥이고, <M>{"f''<0"}</M>이면 뒤집힌 그릇이므로 꼭대기입니다. 표의 마지막 열에서 <M>{'x^3 - 3x'}</M>의 극대는 <M>{"f''(-1) = -6"}</M>, 극소는 <M>{"f''(1) = 6"}</M>입니다. 휘는 방향이 바뀌는 점은 <T en="inflection point">변곡점</T>이라고 합니다. <strong>x⁴ − 2x²</strong>에서는 극소 두 개(<M>{'x = \\pm 1'}</M>, 값 −1), 그 사이의 극대(<M>{'x = 0'}</M>, 값 0), 그리고 변곡점 두 개(<M>{'x \\approx \\pm 0.58'}</M>)가 보입니다. <M>{'x^3'}</M>처럼 <M>{"f''"}</M>도 0인 점에서는 이 판정법이 답을 주지 못하므로 1계 도함수 판정법으로 돌아갑니다.
      </p>

      <h2>가장 좋은 값 찾기</h2>
      <p>
        이 생각을 실제 문제에 쓰는 것이 <T en="optimization">최적화</T>입니다. 가로 30cm, 세로 20cm인 종이의 네 귀퉁이에서 같은 크기의 정사각형을 잘라 내고 접어 뚜껑 없는 상자를 만든다고 해 봅시다. 너무 조금 잘라 내면 상자가 납작하고, 너무 많이 잘라 내면 바닥이 좁습니다. 그 사이 어딘가에 부피가 가장 큰 x가 있습니다.
      </p>
      <BoxFigure />
      <p>
        부피는 높이 × 가로 × 세로이므로 <M>{'V(x) = x(30-2x)(20-2x)'}</M>입니다. 전개해서 미분하면
      </p>
      <MB note="이차방정식의 근의 공식으로 풀고, 종이 크기 안에 드는 작은 근을 고릅니다.">{"V'(x) = 12x^2 - 200x + 600 = 0 \\quad\\Rightarrow\\quad x = \\frac{50 - \\sqrt{700}}{6} \\approx 3.92"}</MB>
      <p>
        이때 부피는 약 1,056.31cm³입니다. 3cm를 잘라 내면 1,008cm³, 5cm를 잘라 내면 1,000cm³이니 두 경우 모두 조금 못 미칩니다. 슬라이더를 움직이며 갈색 접선을 보세요. 최적점의 왼쪽에서는 접선이 오르막이고 오른쪽에서는 내리막이며, 최적점에서만 수평입니다. 종이를 정사각형(30 × 30)으로 바꾸면 답은 정확히 한 변의 6분의 1인 5cm가 됩니다.
      </p>
      <Callout kind="note">
        구간이 정해진 문제에서는 기울기가 0인 점만이 아니라 구간의 양 끝도 후보입니다. 상자에서는 양 끝(x = 0과 x = 10)의 부피가 0이라 빠지지만, 끝에서 최대가 되는 문제도 많습니다. 변수가 수백만 개인 최적화는 방정식을 풀 수 없으므로 기울기를 따라 조금씩 내려가는 <a href={lessonHref('ai-basics', 'gradient-descent')}>경사하강법</a>을 씁니다. 신경망 학습이 바로 그것입니다.
      </Callout>

      <h2>평균값 정리</h2>
      <p>
        고속도로에서 100km를 1시간에 달렸다면 평균 속력은 시속 100km입니다. 속도계를 계속 보고 있었다면, 적어도 한 순간은 정확히 시속 100km를 가리켰을 것입니다. 시속 100km보다 늘 느렸다면 1시간에 100km를 갈 수 없고, 늘 빨랐다면 더 멀리 갔을 테니까요. 이 상식을 수학으로 적은 것이 <T en="mean value theorem">평균값 정리</T>입니다.
      </p>
      <MB note="f가 [a, b]에서 연속이고 (a, b)에서 미분 가능할 때.">{"\\text{어떤 } c \\in (a, b) \\text{ 에서 } \\quad f'(c) = \\frac{f(b) - f(a)}{b - a}"}</MB>
      <MvtFigure />
      <p>
        처음 설정(<M>{'a = -2'}</M>, <M>{'b = 2.5'}</M>)에서 할선의 기울기는 2.25이고, <M>{"f'(c) = 3c^2 - 3 = 2.25"}</M>를 풀면 <M>{'c = \\pm\\sqrt{1.75} \\approx \\pm 1.32'}</M>입니다. 두 점 모두 구간 안에 있으므로 이 경우 c는 두 개입니다. 정리는 c가 <strong>적어도 하나</strong> 있다고만 말할 뿐, 어디인지는 알려 주지 않습니다. 그래도 쓸모가 큽니다. 예를 들어 도함수가 어디서나 0이면 어느 두 점 사이의 평균 기울기도 0이므로 함수는 상수라는 사실, 도함수가 양수이면 함수가 증가한다는 사실이 이 정리에서 나옵니다. 미분으로 함수의 모양을 읽는 앞의 모든 논리가 결국 이 정리 위에 서 있습니다.
      </p>

      <h2>접선으로 근사하고, 접선으로 근 찾기</h2>
      <p>
        한 점 근처를 확대하면 매끄러운 곡선은 거의 직선으로 보입니다. 그 직선이 접선이므로, <M>{'a'}</M> 근처의 <M>{'x'}</M>에서
      </p>
      <MB>{"f(x) \\approx f(a) + f'(a)(x - a)"}</MB>
      <p>
        입니다. 이것을 <T en="linear approximation">선형 근사</T>라고 합니다. 예를 들어 <M>{'\\sqrt{x}'}</M>의 도함수는 <M>{'1/(2\\sqrt{x})'}</M>이므로 <M>{'\\sqrt{4.1} \\approx 2 + 0.1/4 = 2.025'}</M>입니다. 실제 값 2.024846…과 소수점 셋째 자리까지 같습니다.
      </p>
      <p>
        이 생각을 거꾸로 쓰면 방정식의 근을 찾을 수 있습니다. <M>{'f(x) = 0'}</M>인 x를 모를 때, 지금 위치에서 접선을 긋고 그 접선이 0이 되는 곳으로 옮겨 갑니다. 곡선 대신 접선의 근을 푸는 셈입니다. 이것을 되풀이하는 것이 <T en="Newton's method">뉴턴 방법</T>입니다.
      </p>
      <NewtonFigure />
      <p>
        <strong>√2 찾기</strong>에서 <M>{'x_0 = 1'}</M>로 시작하면 1.5, 1.41667, 1.4142157, 1.41421356237469로 다가갑니다. 표의 맞는 자리가 1, 2, 5, 11로, 근에 가까워진 뒤에는 단계마다 대략 두 배로 늘어납니다. 접선 근사의 오차가 거리의 제곱에 비례하기 때문입니다. 계산기와 컴퓨터가 제곱근이나 나눗셈을 계산할 때도 이와 같은 반복을 씁니다.
      </p>
      <p>
        하지만 뉴턴 방법은 언제나 통하지는 않습니다. <strong>제자리를 도는 경우</strong>의 <M>{'x^3 - 2x + 2'}</M>를 0에서 시작하면 다음 점이 1이고, 1에서 그은 접선은 다시 0으로 돌아와 영원히 0과 1을 오갑니다. 진짜 근은 −1.77 근처에 있는데도 그렇습니다. <strong>멀어지는 경우</strong>의 <M>{'\\arctan x'}</M>는 근이 0인데, 1.5에서 시작하면 −1.69, 2.32, −5.11, 32.3으로 점점 멀리 튀어 나갑니다. 시작점을 1.3 정도로 줄이면 다시 0으로 다가갑니다. 뉴턴 방법은 근 근처에서 시작하면 아주 빠르지만, 멀리서 시작하면 어디로 갈지 보장하지 않습니다. 그래서 실제 프로그램은 근이 있는 구간을 먼저 좁혀 두는 안전한 방법과 함께 씁니다.
      </p>

      <Callout kind="key">
        도함수의 부호는 함수가 올라가는지 내려가는지를 알려 주므로, 극대와 극소는 <M>{"f'"}</M>이 0이면서 부호가 바뀌는 곳에 있습니다. <M>{"f''"}</M>의 부호는 휘는 방향이고, 휘는 방향이 바뀌는 곳이 변곡점입니다. 최적화 문제는 목표를 식으로 쓰고 도함수가 0인 점과 구간의 끝을 비교해서 풉니다. 평균값 정리는 평균 변화율과 같은 순간 변화율이 어딘가에 있다고 보장하고, 접선은 함수를 근사하는 데도, 뉴턴 방법으로 근을 찾는 데도 씁니다.
      </Callout>
      <Quiz
        q="함수 g의 도함수가 g′(x) = (x − 2)²(x + 1)이다. g에 대해 옳은 것은?"
        options={['x = −1에서 극대, x = 2에서 극소', 'x = −1에서 극소, x = 2에서는 극값이 없다', 'x = −1과 x = 2 모두 극소', 'x = −1에서 극대, x = 2에서는 극값이 없다']}
        answer={1}
        explain={<>g′은 x = −1과 x = 2에서 0입니다. (x − 2)²은 늘 0 이상이므로 g′의 부호는 (x + 1)이 정합니다. x = −1을 지날 때 음수에서 양수로 바뀌므로 극소입니다. x = 2 양쪽에서는 g′이 모두 양수라 부호가 바뀌지 않으므로, 그림 1의 x³처럼 잠깐 평평할 뿐 극값이 아닙니다.</>}
      />
    </>
  );
}
