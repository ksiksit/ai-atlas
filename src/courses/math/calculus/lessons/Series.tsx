import { useMemo, useState } from 'react';
import { Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot, fmt, fmtTick } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { SERIES, TAYLOR, compound, goodInterval, librarySin, partialSums, sinPoly, taylor, type SeriesCase, type TaylorCase } from './series';
import './calculus.css';
import './series.css';

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const pow10 = (e: number) => (e === 0 ? '1' : e === 1 ? '10' : `10${String(e).split('').map((d) => SUP[+d]).join('')}`);
const nfmt = (n: number) => n.toLocaleString('ko-KR');

/** A plot area with a log-scaled x axis (powers of ten) and a linear y axis. */
function logXAxes(ctx: CanvasRenderingContext2D, P: Palette, box: { l: number; r: number; t: number; b: number }, eMax: number, yMin: number, yMax: number, yTicks: number[]) {
  const X = (n: number) => box.l + (Math.log10(Math.max(1, n)) / eMax) * (box.r - box.l);
  const Y = (v: number) => box.b - ((v - yMin) / (yMax - yMin)) * (box.b - box.t);
  ctx.save();
  ctx.strokeStyle = P.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = P.ink3;
  ctx.font = `11px ${P.fontMono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let e = 0; e <= Math.floor(eMax); e++) {
    ctx.beginPath();
    ctx.moveTo(Math.round(X(10 ** e)) + 0.5, box.t);
    ctx.lineTo(Math.round(X(10 ** e)) + 0.5, box.b);
    ctx.stroke();
    ctx.fillText(pow10(e), X(10 ** e), box.b + 6);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of yTicks) {
    ctx.beginPath();
    ctx.moveTo(box.l, Math.round(Y(v)) + 0.5);
    ctx.lineTo(box.r, Math.round(Y(v)) + 0.5);
    ctx.stroke();
    ctx.fillText(fmtTick(v), box.l - 6, Y(v));
  }
  ctx.restore();
  return { X, Y };
}

/* ─────────────── Figure 1: compound interest and e ─────────────── */

function CompoundFigure() {
  const P = usePalette();
  const [le, setLe] = useState(Math.log10(12));
  const n = Math.max(1, Math.round(10 ** le));
  const v = compound(n);
  const named: [number, string][] = [
    [1, '1년에 한 번'],
    [12, '매달'],
    [365, '매일'],
    [8760, '매시간'],
  ];
  const label = named.find(([k]) => k === n)?.[1] ?? `1년에 ${nfmt(n)}번`;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const box = { l: 44, r: w - 14, t: 16, b: h - 28 };
      const { X, Y } = logXAxes(ctx, P, box, 6, 1.9, 2.8, [2, 2.2, 2.4, 2.6, 2.8]);
      ctx.strokeStyle = P.good;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(box.l, Y(Math.E));
      ctx.lineTo(box.r, Y(Math.E));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.good;
      ctx.font = `600 12px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('e = 2.718281…', box.r, Y(Math.E) - 4);
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i <= 240; i++) {
        const m = 10 ** ((6 * i) / 240);
        const yy = Y(compound(m));
        i ? ctx.lineTo(X(m), yy) : ctx.moveTo(X(m), yy);
      }
      ctx.stroke();
      for (const [k] of named) {
        ctx.beginPath();
        ctx.arc(X(k), Y(compound(k)), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = alpha(P.accent, 0.5);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(X(n), Y(v), 6, 0, Math.PI * 2);
      ctx.fillStyle = P.accent;
      ctx.fill();
      ctx.strokeStyle = P.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = P.ink2;
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('1년에 나누어 붙이는 횟수 n (로그 눈금)', box.l + 6, box.t + 4);
    },
    [P, n, v],
    { height: 280, minHeight: 220 },
  );

  return (
    <Figure
      no={1}
      title="이자를 자주 붙일수록 e에 다가갑니다"
      hint="횟수 n을 늘려 보세요"
      caption={<>1원을 연이율 100%로 1년 맡기되, 이자를 n번으로 나누어 붙이면 1년 뒤 <M>{'\\left(1 + \\tfrac1n\\right)^n'}</M>원이 됩니다. 연한 점은 1년에 한 번, 매달, 매일, 매시간 붙인 경우입니다. 가로축은 1, 10, 100, …이 같은 간격인 로그 눈금입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`n = ${nfmt(n)}일 때 (1 + 1/n)^n은 ${fmt(v, 6)}이고, e와의 차이는 ${(Math.E - v).toExponential(2)}입니다. n이 커질수록 점이 e의 점선에 다가갑니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="sr-cmp-n" label="횟수 n" value={le} min={0} max={6} step={0.01} onChange={setLe} format={() => nfmt(n)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label={label} value={`${fmt(v, 6)}원`} />
            <Readout label="e와의 차이" value={(Math.E - v).toExponential(2)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: partial sums ─────────────── */

const N_MAX = 20000;

function PartialSumFigure() {
  const P = usePalette();
  const [c, setC] = useState<SeriesCase>('geometric');
  const [r, setR] = useState(0.5);
  const [le, setLe] = useState(1.3);
  const N = Math.max(1, Math.round(10 ** le));
  const info = SERIES[c];
  const sums = useMemo(() => partialSums(c, N_MAX, r), [c, r]);
  const S = sums[N - 1];
  const lim = info.limit(r);
  // for the geometric series the ratio is |r| exactly (computing it from the terms overflows for r > 1)
  const ratio = c === 'geometric' ? Math.abs(r) : Math.abs(info.term(N + 1, r) / info.term(N, r));
  const diverges = !isFinite(lim);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const box = { l: 46, r: w - 14, t: 16, b: h - 28 };
      // y range: around the limit, or up to the largest partial sum shown
      const shown = sums.slice(0, N_MAX);
      let lo = Math.min(0, ...shown.slice(0, 2000)), hi = Math.max(...shown.slice(0, N_MAX));
      if (c === 'geometric' && r >= 1) hi = Math.min(hi, 60);
      if (isFinite(lim)) hi = Math.max(hi, lim);
      if (c === 'harmonic') hi = 11;
      if (c === 'alternating') {
        lo = 0.4;
        hi = 1.05;
      }
      if (c === 'geometric' && r < 0) lo = Math.min(lo, r);
      const pad = (hi - lo) * 0.08;
      const yMin = lo - pad, yMax = hi + pad;
      const step = niceTicks(yMin, yMax);
      const { X, Y } = logXAxes(ctx, P, box, Math.log10(N_MAX), yMin, yMax, step);
      if (isFinite(lim)) {
        ctx.strokeStyle = P.good;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(box.l, Y(lim));
        ctx.lineTo(box.r, Y(lim));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = P.good;
        ctx.font = `600 12px ${P.fontBody}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`합 ${fmt(lim, 4)}`, box.r, Y(lim) - 4);
      }
      if (c === 'harmonic') {
        ctx.strokeStyle = alpha(P.bad, 0.6);
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(box.l, Y(10));
        ctx.lineTo(box.r, Y(10));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // faint: the whole run; strong: up to N
      const draw = (upto: number, color: string, wdt: number) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.l, box.t, box.r - box.l, box.b - box.t);
        ctx.clip();
        ctx.strokeStyle = color;
        ctx.lineWidth = wdt;
        ctx.beginPath();
        for (let k = 1; k <= upto; k++) {
          // after the first few hundred terms, every point is closer than a pixel: skip some
          if (k > 400 && k % Math.ceil(k / 400) && k !== upto) continue;
          const yy = Y(sums[k - 1]);
          k === 1 ? ctx.moveTo(X(k), yy) : ctx.lineTo(X(k), yy);
        }
        ctx.stroke();
        ctx.restore();
      };
      draw(N_MAX, alpha(P.ink3, 0.35), 1.5);
      draw(N, P.accent, 2.2);
      ctx.beginPath();
      ctx.arc(X(N), Y(Math.max(yMin, Math.min(yMax, S))), 5.5, 0, Math.PI * 2);
      ctx.fillStyle = P.accent;
      ctx.fill();
      ctx.fillStyle = P.ink2;
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('부분합 Sₙ, 더한 항의 수 n (로그 눈금)', box.r - 4, box.b - 4);
    },
    [P, c, r, N, sums, S, lim],
    { height: 300, minHeight: 230 },
  );

  return (
    <Figure
      no={2}
      title="부분합을 따라가기"
      hint="급수를 고르고 더할 항의 수를 늘려 보세요"
      caption={<>파란 선은 처음 n개 항을 더한 부분합 <M>{'S_n'}</M>입니다. 연한 선은 20,000항까지의 모습입니다. 초록 점선은 급수의 합, 조화급수의 빨간 점선은 10입니다. <strong>비율</strong>은 이웃한 두 항의 크기 비 <M>{'|a_{n+1}/a_n|'}</M>로, 비율 판정에 쓰입니다.</>}
    >
      <div className="controls row">
        <Seg value={c} onChange={setC} options={[{ value: 'geometric', label: '기하급수' }, { value: 'harmonic', label: '조화급수' }, { value: 'alternating', label: '교대 조화급수' }]} />
        {c === 'geometric' && <Slider id="sr-ps-r" label="공비 r" value={r} min={-0.95} max={1.05} step={0.05} onChange={(x) => setR(Math.round(x * 100) / 100)} format={(x) => x.toFixed(2)} />}
        <Slider id="sr-ps-n" label="더한 항의 수 n" value={le} min={0} max={Math.log10(N_MAX)} step={0.01} onChange={setLe} format={() => nfmt(N)} />
      </div>
      <MB>{info.tex(r)}</MB>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${c === 'geometric' ? `공비 ${r}인 기하급수` : c === 'harmonic' ? '조화급수' : '교대 조화급수'}의 처음 ${nfmt(N)}항의 합은 ${fmt(S, 5)}입니다. ${diverges ? '이 급수는 발산합니다.' : `급수의 합은 ${fmt(lim, 5)}입니다.`}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        <Readout label={`S${nfmt(N)}`} value={fmt(S, 5)} />
        <Readout label="급수의 합" value={diverges ? (isNaN(lim) ? '없음 (진동)' : '∞ (발산)') : fmt(lim, 5)} color={diverges ? 'var(--bad)' : 'var(--good)'} />
        <Readout label="남은 차이" value={diverges ? '—' : Math.abs(lim - S).toExponential(2)} />
        <Readout label="비율 |aₙ₊₁/aₙ|" value={fmt(ratio, 4)} />
      </div>
    </Figure>
  );
}

function niceTicks(lo: number, hi: number): number[] {
  const raw = (hi - lo) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const m = raw / mag;
  const step = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/* ─────────────── Figure 3: Taylor polynomials ─────────────── */

const TOL = 0.01;

function TaylorFigure() {
  const P = usePalette();
  const [c, setC] = useState<TaylorCase>('sin');
  const [n, setN] = useState(5);
  const [x0s, setX0s] = useState<Record<TaylorCase, number>>({ exp: 1, sin: 1, log: 0.5, geom: 0.5 });
  const t = TAYLOR[c];
  const x0 = x0s[c];
  const good = useMemo(() => goodInterval(c, n, TOL), [c, n]);
  const fx = t.f(x0);
  const tx = taylor(c, n, x0);
  const err = Math.abs(fx - tx);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: t.xMin, xMax: t.xMax, yMin: t.yMin, yMax: t.yMax, pad: { l: 36, r: 12, t: 12, b: 26 } });
      // where Tₙ is within 0.01 of f
      ctx.fillStyle = alpha(P.good, 0.12);
      ctx.fillRect(pl.X(good[0]), pl.pad.t, pl.X(good[1]) - pl.X(good[0]), pl.ph);
      pl.grid({ xLabel: 'x' });
      if (isFinite(t.radius)) {
        for (const s of [-1, 1]) {
          const xr = s * t.radius;
          if (xr > t.xMin && xr < t.xMax) pl.line(xr, t.yMin, xr, t.yMax, alpha(P.bad, 0.7), 1.5, [5, 4]);
        }
        pl.text('수렴 반지름', t.radius, t.yMax, P.bad, { dx: -6, dy: 12, align: 'right', font: `600 11px ${P.fontBody}` });
      }
      pl.fn(t.f, P.ink, 3);
      pl.fn((x) => taylor(c, n, x), P.accent, 2.2);
      pl.line(x0, t.yMin, x0, t.yMax, alpha(P.ink3, 0.5), 1, [2, 3]);
      if (isFinite(fx)) pl.dot(x0, fx, 5, P.ink, P.surface);
      if (tx > t.yMin && tx < t.yMax) pl.dot(x0, tx, 5, P.accent, P.surface);
    },
    [P, c, n, x0, good],
    { height: 340, minHeight: 260 },
  );

  return (
    <Figure
      no={3}
      title="다항식이 함수를 따라가는 범위"
      hint="함수와 차수를 바꿔 보세요"
      caption={
        <>
          검은 선이 함수, 파란 선이 0에서 만든 n차 테일러 다항식입니다. 초록 띠는 두 곡선의 차이가 {TOL}보다 작은 구간입니다. 빨간 점선은 수렴 반지름으로, ln(1 + x)와 1/(1 − x)는 차수를 아무리 올려도 이 밖에서는 다항식이 함수를 따라가지 못합니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={c} onChange={setC} options={(Object.keys(TAYLOR) as TaylorCase[]).map((k) => ({ value: k, label: TAYLOR[k].name }))} />
        <Slider id="sr-ty-n" label="차수 n" value={n} min={0} max={15} step={1} onChange={setN} />
        <Slider id="sr-ty-x" label="확인할 x" value={x0} min={t.xMin} max={t.xMax} step={0.01} onChange={(v) => setX0s({ ...x0s, [c]: v })} format={(v) => v.toFixed(2)} />
      </div>
      <MB>{`${t.tex} = ${t.series}`}</MB>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${t.name}와 ${n}차 테일러 다항식. 차이가 ${TOL}보다 작은 구간은 ${fmt(good[0], 2)}부터 ${fmt(good[1], 2)}까지입니다. x = ${fmt(x0, 2)}에서 함수는 ${fmt(fx, 4)}, 다항식은 ${fmt(tx, 4)}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <Legend
        items={[
          { color: 'var(--ink)', label: t.name, shape: 'ln' },
          { color: 'var(--accent)', label: `${n}차 테일러 다항식`, shape: 'ln' },
          { color: 'color-mix(in srgb, var(--good) 25%, transparent)', label: `차이 < ${TOL}`, shape: 'sq' },
        ]}
      />
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        <Readout label={`f(${fmt(x0, 2)})`} value={isFinite(fx) ? fmt(fx, 6) : '정의 안 됨'} />
        <Readout label={`T${n}(${fmt(x0, 2)})`} value={fmt(tx, 6)} color="var(--accent)" />
        <Readout label="오차" value={isFinite(fx) ? (err < 1e-3 ? err.toExponential(2) : fmt(err, 4)) : '—'} />
        <Readout label={`차이 < ${TOL}인 구간`} value={`${fmt(good[0], 2)} ~ ${fmt(good[1], 2)}`} color="var(--good)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: how a library computes sin ─────────────── */

const QUAD = ['sin r', 'cos r', '−sin r', '−cos r'];
const X_RANGE = 12;

function SinFigure() {
  const P = usePalette();
  const [x, setX] = useState(10);
  const [d, setD] = useState(9);
  const tr = librarySin(x, d);
  const plain = sinPoly(x, d);
  const plainErr = Math.abs(plain - Math.sin(x));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const box = { l: 52, r: w - 14, t: 16, b: h - 28 };
      const eLo = -17, eHi = 4;
      const X = (v: number) => box.l + ((v + X_RANGE) / (2 * X_RANGE)) * (box.r - box.l);
      const Y = (e: number) => box.b - ((Math.log10(Math.max(1e-17, e)) - eLo) / (eHi - eLo)) * (box.b - box.t);
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let e = eLo + 1; e <= eHi; e += 3) {
        ctx.beginPath();
        ctx.moveTo(box.l, Math.round(Y(10 ** e)) + 0.5);
        ctx.lineTo(box.r, Math.round(Y(10 ** e)) + 0.5);
        ctx.stroke();
        ctx.fillText(`1e${e}`, box.l - 6, Y(10 ** e));
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let v = -X_RANGE; v <= X_RANGE; v += 4) {
        ctx.beginPath();
        ctx.moveTo(Math.round(X(v)) + 0.5, box.t);
        ctx.lineTo(Math.round(X(v)) + 0.5, box.b);
        ctx.stroke();
        ctx.fillText(String(v).replace('-', '−'), X(v), box.b + 6);
      }
      // the precision of a double, 2^-53
      ctx.strokeStyle = alpha(P.good, 0.8);
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(box.l, Y(2 ** -53));
      ctx.lineTo(box.r, Y(2 ** -53));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.good;
      ctx.font = `600 11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('double의 정밀도 2⁻⁵³', box.l + 4, Y(2 ** -53) - 2);
      const curve = (g: (v: number) => number, color: string, wdt: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = wdt;
        ctx.beginPath();
        const M = 600;
        for (let i = 0; i <= M; i++) {
          const v = -X_RANGE + (2 * X_RANGE * i) / M;
          const yy = Y(g(v));
          i ? ctx.lineTo(X(v), yy) : ctx.moveTo(X(v), yy);
        }
        ctx.stroke();
      };
      curve((v) => Math.abs(sinPoly(v, d) - Math.sin(v)), alpha(P.bad, 0.9), 1.8);
      curve((v) => librarySin(v, d).error, P.accent, 1.8);
      ctx.strokeStyle = alpha(P.ink3, 0.6);
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(X(x), box.t);
      ctx.lineTo(X(x), box.b);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.ink2;
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('오차 (로그 눈금)', box.r - 4, box.t + 4);
    },
    [P, x, d],
    { height: 300, minHeight: 230 },
  );

  return (
    <Figure
      no={4}
      title="sin x를 다항식 하나로 계산하기"
      hint="x와 다항식의 차수를 바꿔 보세요"
      caption={
        <>
          빨간 선은 0에서 만든 테일러 다항식을 그대로 쓴 오차, 파란 선은 먼저 x에서 π/2의 배수를 빼 |r| ≤ π/4로 줄인 뒤 같은 차수의 다항식(r에 따라 sin 또는 cos의 다항식)을 쓴 오차입니다. 세로축은 로그 눈금이고, 초록 점선은 JavaScript 숫자(double)가 구별할 수 있는 상대 정밀도입니다. 오차가 0이 되는 곳은 그림에서 맨 아래로 떨어집니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="sr-sin-x" label="x" value={x} min={-X_RANGE} max={X_RANGE} step={0.01} onChange={setX} format={(v) => v.toFixed(2)} />
        <Seg value={d} onChange={setD} label="다항식 차수" options={[5, 7, 9, 11, 13].map((k) => ({ value: k, label: String(k) }))} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`x = ${fmt(x, 2)}에서 ${d}차 테일러 다항식을 그대로 쓰면 오차가 ${plainErr.toExponential(1)}이고, π/2의 배수를 빼서 줄인 뒤 쓰면 오차가 ${tr.error.toExponential(1)}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <Legend
        items={[
          { color: 'var(--bad)', label: '테일러 다항식 그대로', shape: 'ln' },
          { color: 'var(--accent)', label: '범위를 줄인 뒤 다항식', shape: 'ln' },
        ]}
      />
      <div className="sr-trace" aria-live="polite">
        <span>
          x = {fmt(x, 4)} = <b>{tr.k}</b> × π/2 + r
        </span>
        <span>
          r = <b>{fmt(tr.r, 6)}</b>
        </span>
        <span>
          {tr.k} mod 4 = {tr.quadrant} → sin x = <b>{QUAD[tr.quadrant]}</b>
        </span>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <Readout label="줄인 뒤 다항식" value={tr.value.toFixed(12)} color="var(--accent)" />
        <Readout label="Math.sin(x)" value={tr.exact.toFixed(12)} />
        <Readout label="오차 (줄인 뒤)" value={tr.error.toExponential(2)} color="var(--accent)" />
        <Readout label="오차 (그대로)" value={plainErr.toExponential(2)} color="var(--bad)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Series() {
  return (
    <>
      <h2>끝없이 더하면</h2>
      <p>
        방 한가운데서 문까지 가려면 먼저 절반을 가야 하고, 남은 거리의 절반을 또 가야 하고, 그 절반을 또 가야 합니다. 이렇게 끝없이 많은 단계를 거치는데도 우리는 문에 도착합니다. 걸은 거리를 다 더하면 <M>{'\\tfrac12 + \\tfrac14 + \\tfrac18 + \\cdots = 1'}</M>이기 때문입니다. 반면 <M>{'1 + \\tfrac12 + \\tfrac13 + \\tfrac14 + \\cdots'}</M>은 더하는 항이 똑같이 0으로 줄어드는데도 합이 한없이 커집니다. 이 장은 끝없이 더한 값이 언제 유한한지 가리는 법과, 그것으로 함수를 다항식으로 흉내 내는 법을 다룹니다.
      </p>

      <h2>수열의 극한: 복리 이자와 e</h2>
      <p>
        <T en="sequence">수열</T>은 수를 차례로 늘어놓은 것이고, n이 커질수록 항이 어떤 값 L에 한없이 가까워지면 수열이 L로 <T en="converge">수렴</T>한다고 씁니다. <a href={lessonHref('math-calculus', 'limits')}>함수의 극한</a>과 같은 생각을 자연수 n에 대해 한 것입니다. 대표적인 예가 복리 이자에서 나오는 수열입니다.
      </p>
      <CompoundFigure />
      <p>
        1년에 한 번 붙이면 2원, 매달 붙이면 2.613035원, 매일 붙이면 2.714567원, 매시간 붙이면 2.718127원입니다. 횟수를 백만 번으로 늘려도 2.718280원으로, 끝없이 늘어나지 않고 2.718281…에 멈춥니다. 이 극한이 자연로그의 밑 <M>{'e'}</M>이고, <a href={lessonHref('math-calculus', 'derivatives')}>미분</a>에서 본 대로 <M>{'e^x'}</M>는 미분해도 자기 자신인 유일한 지수 함수입니다.
      </p>

      <h2>급수: 부분합의 극한</h2>
      <p>
        수열의 항을 차례로 더한 것을 <T en="series">급수</T>라고 합니다. 끝없이 더하는 일은 바로 할 수 없으므로, 처음 n개 항만 더한 <T en="partial sum">부분합</T> <M>{'S_n = a_1 + a_2 + \\cdots + a_n'}</M>이라는 수열을 만들고 그 극한을 급수의 합으로 정의합니다.
      </p>
      <PartialSumFigure />
      <p>
        <strong>기하급수</strong>는 공비가 r인 항들의 합으로, <M>{'|r| < 1'}</M>이면 <M>{'\\frac{r}{1-r}'}</M>로 수렴합니다. r = 0.5이면 10항까지 더한 값이 0.999023으로 1에 바짝 붙습니다. r = 0.9로 올리면 합은 9인데, 10항까지 5.8619, 40항까지 8.8670으로 훨씬 천천히 다가갑니다. r이 1 이상이면 항이 줄어들지 않으니 합이 끝없이 커지고, −1 이하면 부분합이 커지며 오르내립니다.
      </p>
      <p>
        <strong>조화급수</strong>는 항이 0으로 줄어드는데도 발산합니다. 10항까지 2.9290, 100항까지 5.1874, 1,000항까지 7.4855로 아주 느리게 자라서, 합이 10을 넘으려면 12,367항, 20을 넘으려면 272,400,600항이 필요합니다. 로그 눈금에서 직선으로 보이는 것은 <M>{'S_n'}</M>이 <M>{'\\ln n'}</M>만큼 자라기 때문입니다. 그래도 끝은 없습니다. 항을 1, 1, 2, 4, 8, …개씩 묶으면 묶음마다 합이 1/2 이상이고, 1/2을 끝없이 더하면 무한이 되기 때문입니다.
      </p>
      <p>
        <strong>교대 조화급수</strong>는 같은 항에 부호만 번갈아 붙였을 뿐인데 <M>{'\\ln 2 = 0.69315'}</M>로 수렴합니다. 10항까지 0.64563, 100항까지 0.68817, 1,000항까지 0.69265입니다. 부호가 번갈아 바뀌고 크기가 줄어드는 급수는 언제나 수렴하고, n항에서 멈춘 오차는 다음 항의 크기 <M>{'\\tfrac{1}{n+1}'}</M>보다 작습니다. 100항까지의 오차는 0.00498로 1/101보다 작습니다.
      </p>

      <h2>수렴을 판정하는 법</h2>
      <p>합을 정확히 구할 수 없을 때도 수렴하는지는 알 수 있습니다. 가장 많이 쓰는 두 가지 판정법입니다.</p>
      <ul>
        <li>
          <T en="comparison test">비교 판정</T>: 항이 모두 양수일 때, 수렴하는 급수보다 항마다 작으면 수렴하고, 발산하는 급수보다 항마다 크면 발산합니다. 예를 들어 <M>{'\\frac{1}{k^2} \\le \\frac{1}{k(k-1)} = \\frac{1}{k-1} - \\frac{1}{k}'}</M>이고 오른쪽의 합은 서로 지워져 유한하므로 <M>{'\\sum \\frac{1}{k^2}'}</M>은 수렴합니다. 그 값은 <M>{'\\frac{\\pi^2}{6} \\approx 1.6449'}</M>로 알려져 있습니다.
        </li>
        <li>
          <T en="ratio test">비율 판정</T>: 이웃한 항의 비 <M>{'|a_{n+1}/a_n|'}</M>이 1보다 작은 값 L로 가면 기하급수처럼 줄어드니 수렴하고, 1보다 크면 발산합니다. L = 1이면 아무것도 알 수 없습니다. 그림 2의 비율을 보면 기하급수는 언제나 r이지만, 조화급수와 교대 조화급수는 둘 다 1에 다가갑니다. 하나는 발산하고 하나는 수렴하므로, 비율 판정이 답하지 못하는 경우입니다.
        </li>
      </ul>
      <Callout kind="warn">
        항이 0으로 가는 것은 수렴의 필요조건일 뿐 충분조건이 아닙니다. 조화급수가 그 반례입니다. 반대로 항이 0으로 가지 않으면 확실히 발산합니다.
      </Callout>

      <h2>테일러 급수: 함수를 다항식으로</h2>
      <p>
        다항식은 더하기와 곱하기만으로 계산할 수 있어서 컴퓨터가 가장 다루기 쉬운 함수입니다. 어떤 함수를 0 근처에서 다항식으로 흉내 내려면, 0에서의 값, 기울기, 기울기의 변화율, … 이 모두 같도록 계수를 맞추면 됩니다. k차 계수는 k번 미분한 값을 k!로 나눈 것이고, 이것을 끝없이 이어 붙인 것이 <T en="Taylor series">테일러 급수</T>입니다.
      </p>
      <MB note="n차에서 멈추면 테일러 다항식 Tₙ이고, 멈춘 탓에 생기는 오차는 (n+1)번째 도함수의 크기로 어림합니다.">{'f(x) = \\sum_{k=0}^{\\infty} \\frac{f^{(k)}(0)}{k!}\\,x^k,\\qquad |f(x) - T_n(x)| \\le \\frac{\\max|f^{(n+1)}|}{(n+1)!}\\,|x|^{n+1}'}</MB>
      <TaylorFigure />
      <p>
        sin x의 5차 다항식 <M>{'x - \\frac{x^3}{6} + \\frac{x^5}{120}'}</M>은 x = 1에서 0.841667로, 참값 0.841471과 0.000196 차이입니다. 차이가 0.01보다 작은 구간은 5차일 때 ±1.761, 9차일 때 ±3.249, 15차일 때 ±5.501로, 차수를 올릴수록 끝없이 넓어집니다. eˣ와 sin x는 어느 x에서든 테일러 급수가 함수로 수렴합니다.
      </p>
      <p>
        ln(1 + x)와 1/(1 − x)는 다릅니다. 15차까지 올려도 좋은 구간이 −0.813부터 0.927까지에 머물고, 1을 넘어서면 차수를 올릴수록 오히려 멀어집니다. x = 1.5에서 ln(1 + x)는 0.916인데 9차 다항식은 3.363, 15차는 17.960입니다. 1/(1 − x)는 x = −1.5에서 0.4인데 9차 다항식은 −22.67입니다. 급수가 수렴하는 범위 <M>{'|x| < R'}</M>의 R을 <T en="radius of convergence">수렴 반지름</T>이라고 하고, 두 함수는 x = 1(ln은 x = −1)에서 함수가 터지기 때문에 R = 1입니다. 그 너머의 x에는 0에서의 정보만으로 닿을 수 없습니다.
      </p>

      <h2>계산기는 sin을 어떻게 구할까</h2>
      <p>
        <code>Math.sin(10)</code>을 부르면 컴퓨터는 어떤 계산을 할까요? 테일러 급수를 그대로 쓰면 x가 커질수록 필요한 차수가 끝없이 늘어납니다. 9차 다항식은 [−π/4, π/4]에서는 최대 오차가 1.75 × 10⁻⁹이지만 [−π, π]에서는 6.93 × 10⁻³으로 나빠집니다. 그래서 수학 라이브러리는 먼저 sin의 주기성을 써서 x를 작은 값으로 줄입니다.
      </p>
      <MB note="k는 x에 가장 가까운 π/2의 배수를 고르는 정수이고, k를 4로 나눈 나머지에 따라 sin r, cos r, −sin r, −cos r 중 하나가 답입니다.">{'x = k\\cdot\\tfrac{\\pi}{2} + r,\\qquad |r| \\le \\tfrac{\\pi}{4}'}</MB>
      <SinFigure />
      <p>
        x = 10이면 k = 6, r = 0.575222이고, 6을 4로 나눈 나머지가 2이므로 sin 10 = −sin r입니다. 그림에서 빨간 선은 x가 0에서 멀어질수록 가파르게 치솟지만, 파란 선은 어느 x에서나 [−π/4, π/4]의 오차 수준에 머뭅니다. −10부터 10까지에서 범위를 줄인 계산의 최대 오차는 9차일 때 2.45 × 10⁻⁸, 11차일 때 1.15 × 10⁻¹⁰, 13차일 때 3.89 × 10⁻¹³입니다.
      </p>
      <p>
        실제 라이브러리는 여기서 두 가지를 더 합니다. 테일러 계수는 0 근처에서 가장 정확하고 구간 끝에서 오차가 커지므로, 구간 전체의 최대 오차가 가장 작아지도록 계수를 조금씩 고친 다항식을 씁니다. 또 x가 아주 크면 <M>{'k\\cdot\\pi/2'}</M>를 뺄 때 π의 반올림 오차가 커지므로 π를 훨씬 많은 자릿수로 저장해 두고 뺍니다. 이렇게 해서 결과가 <a href={lessonHref('cs-architecture', 'binary')}>double</a>이 구별할 수 있는 정밀도 <M>{'2^{-53} \\approx 1.1\\times 10^{-16}'}</M> 근처까지 맞습니다. 테일러 급수의 생각, 곧 "작은 구간에서 다항식으로 흉내 낸다"는 그대로입니다.
      </p>

      <Callout kind="key">
        수열이 수렴한다는 것은 항이 한 값에 한없이 가까워진다는 것이고, 급수의 합은 부분합 수열의 극한입니다. 기하급수는 |r| &lt; 1일 때 수렴하고, 조화급수는 항이 0으로 가도 ln n만큼 자라 발산하며, 부호를 번갈아 붙인 교대 조화급수는 ln 2로 수렴합니다. 테일러 급수는 0에서의 도함수들로 함수를 다항식으로 흉내 내는 것으로, 수렴 반지름 안에서만 함수와 같습니다. 컴퓨터는 주기성으로 입력을 작은 구간으로 줄인 뒤 짧은 다항식으로 sin 같은 함수를 계산합니다.
      </Callout>
      <Quiz
        q="다음 중 수렴하는 급수는?"
        options={[<M key="a">{'\\sum_{k=1}^\\infty \\frac{1}{k}'}</M>, <M key="b">{'\\sum_{k=1}^\\infty \\frac{1}{\\sqrt{k}}'}</M>, <M key="c">{'\\sum_{k=1}^\\infty (0.99)^k'}</M>, <M key="d">{'\\sum_{k=1}^\\infty \\frac{k}{k+1}'}</M>]}
        answer={2}
        explain={<>공비 0.99인 기하급수이므로 합은 0.99/(1 − 0.99) = 99입니다. 조화급수는 발산하고, <M>{'1/\\sqrt{k}'}</M>은 항마다 1/k보다 크니 비교 판정으로 역시 발산합니다. <M>{'k/(k+1)'}</M>은 항이 1로 가므로 0으로 가지 않아 확실히 발산합니다.</>}
      />
    </>
  );
}
