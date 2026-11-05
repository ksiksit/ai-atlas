import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { FAILS, HOLES, approachTable, bestDeltaSquare, bisect, checkEpsDelta, cubic } from './limits';
import './calculus.css';
import './limits.css';

const fmt = (v: number, d = 6) => (isFinite(v) ? v.toFixed(d) : v > 0 ? '+∞' : v < 0 ? '−∞' : '정의 안 됨');
const nf = (v: number) => String(+v.toFixed(9));
const hFmt = (h: number) => String(+h.toPrecision(3));

/** An open circle: the point the graph approaches but never takes. */
function hole(p: Plot, x: number, y: number, color: string, bg: string) {
  p.dot(x, y, 5, bg, color, 2);
}

/* ─────────────── Figure 1: zoom into the hole ─────────────── */

function HoleFigure() {
  const P = usePalette();
  const [id, setId] = useState('sinc');
  const [zoom, setZoom] = useState(0);
  const fn = HOLES.find((h) => h.id === id)!;
  const table = useMemo(() => approachTable(fn), [fn]);
  const s = Math.pow(10, -zoom);
  const L = fn.L!;
  const yMid = (fn.yLo + fn.yHi) / 2;
  const yHalf = (fn.yHi - fn.yLo) / 2;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      // zoom toward (a, L): the window shrinks by 10^-zoom around the hole
      const cy = L + (yMid - L) * s;
      const p = new Plot(ctx, w, h, P, { xMin: fn.a - fn.xr * s, xMax: fn.a + fn.xr * s, yMin: cy - yHalf * s, yMax: cy + yHalf * s, pad: { l: 64, r: 14, t: 14, b: 28 } });
      p.grid({ fmt: (v) => (Math.abs(v) < 1e-12 ? '0' : +v.toPrecision(6) + '') });
      p.fn(fn.f, P.accent, 2.5, { samples: 1200 });
      p.line(fn.a, p.yMin, fn.a, L, alpha(P.ink3, 0.6), 1, [4, 4]);
      p.line(p.xMin, L, fn.a, L, alpha(P.ink3, 0.6), 1, [4, 4]);
      hole(p, fn.a, L, P.accent, P.surface);
      p.text(`(${fn.a}, ${L})에는 값이 없음`, fn.a, L, P.ink2, { dx: 10, dy: -16, font: `600 12px ${P.fontBody}`, bg: P.surface });
    },
    [P, fn, s, L, yMid, yHalf],
    { aspect: 1.8, maxHeight: 360 },
  );

  return (
    <Figure
      no={1}
      title="구멍 쪽으로 확대하기"
      hint="확대 슬라이더를 오른쪽으로 끌어 보세요"
      caption={
        <>
          파란 곡선이 함수의 그래프이고, 속이 빈 동그라미는 함수값이 정의되지 않은 점입니다. 확대할 때마다 창의 가로와 세로를 같은 비율로 줄입니다. 아래 표는 그 점에 왼쪽과 오른쪽에서 다가갈 때의 함수값을 컴퓨터로 계산한 것입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={setId} options={HOLES.map((h) => ({ value: h.id, label: <M>{h.tex}</M> }))} />
        <Slider id="lm-zoom" label="확대" value={zoom} min={0} max={4} step={0.1} onChange={setZoom} format={(v) => `${Math.round(Math.pow(10, v)).toLocaleString('ko-KR')}배`} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`함수 ${fn.id === 'sinc' ? 'sin x / x' : '(x²−1)/(x−1)'}의 그래프를 x = ${fn.a} 근처에서 ${Math.round(Math.pow(10, zoom))}배 확대했습니다. 그래프는 높이 ${L}로 다가가지만 그 점에는 값이 없습니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="tbl-wrap">
        <table className="lm-table">
          <thead>
            <tr>
              <th>거리 h</th>
              <th>
                <M>{`f(${fn.a}-h)`}</M>
              </th>
              <th>
                <M>{`f(${fn.a}+h)`}</M>
              </th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.h}>
                <td className="mono">{hFmt(r.h)}</td>
                <td className="mono">{fmt(r.left)}</td>
                <td className="mono">{fmt(r.right)}</td>
              </tr>
            ))}
            <tr className="lm-at">
              <td className="mono">0</td>
              <td colSpan={2}>
                <M>{`f(${fn.a})`}</M> = 0 ÷ 0, 정의되지 않음
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the ε-δ game ─────────────── */

const SQ = (x: number) => x * x;
const A = 2;
const LIM = 4;

function EpsDeltaFigure() {
  const P = usePalette();
  const [eps, setEps] = useState(0.5);
  const [delta, setDelta] = useState(0.2);
  const res = useMemo(() => checkEpsDelta(SQ, A, LIM, eps, delta), [eps, delta]);
  const best = bestDeltaSquare(eps);
  const plotRef = useRef<Plot | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: 1.2, xMax: 2.8, yMin: 1.8, yMax: 6.6, pad: { l: 40, r: 14, t: 14, b: 28 } });
      plotRef.current = p;
      p.grid({ xStep: 0.2, yStep: 0.5 });
      const c = ctx;
      // ε band (horizontal) and δ band (vertical)
      c.fillStyle = alpha(P.good, 0.13);
      c.fillRect(p.pad.l, p.Y(LIM + eps), p.pw, p.Y(LIM - eps) - p.Y(LIM + eps));
      c.fillStyle = alpha(P.accent, 0.12);
      c.fillRect(p.X(A - delta), p.pad.t, p.X(A + delta) - p.X(A - delta), p.ph);
      for (const y of [LIM - eps, LIM + eps]) p.line(p.xMin, y, p.xMax, y, P.good, 1.5, [5, 4]);
      for (const x of [A - delta, A + delta]) p.line(x, p.yMin, x, p.yMax, P.accent, 1.5, [5, 4]);
      p.fn(SQ, alpha(P.ink3, 0.6), 1.5);
      // the part of the graph inside the δ band, green inside the ε band, red outside
      const n = 240;
      for (let k = 0; k < n; k++) {
        const x0 = A - delta + (2 * delta * k) / n;
        const x1 = A - delta + (2 * delta * (k + 1)) / n;
        const xm = (x0 + x1) / 2;
        const out = Math.abs(SQ(xm) - LIM) >= eps;
        p.line(x0, SQ(x0), x1, SQ(x1), out ? P.bad : P.good, 4);
      }
      hole(p, A, LIM, P.ink, P.surface);
      if (!res.ok) {
        p.dot(res.worstX, SQ(res.worstX), 6, P.bad, P.surface, 2);
        p.text(`x = ${res.worstX.toFixed(3)}`, res.worstX, SQ(res.worstX), P.bad, { dx: 10, dy: 0, font: `600 12px ${P.fontMono}`, bg: P.surface });
      }
      p.text('L + ε', p.xMin, LIM + eps, P.good, { dx: 6, dy: -9, font: `600 11px ${P.fontMono}` });
      p.text('L − ε', p.xMin, LIM - eps, P.good, { dx: 6, dy: 10, font: `600 11px ${P.fontMono}` });
      p.text('a − δ', A - delta, p.yMax, P.accent, { dx: -4, dy: 10, align: 'right', font: `600 11px ${P.fontMono}` });
      p.text('a + δ', A + delta, p.yMax, P.accent, { dx: 4, dy: 10, font: `600 11px ${P.fontMono}` });
    },
    [P, eps, delta, res],
    { aspect: 1.35, maxHeight: 420 },
  );

  // dragging the δ band's edge sets δ directly
  useDrag(wrapRef, {
    hit: (x) => {
      const p = plotRef.current;
      if (!p) return null;
      return Math.abs(x - p.X(A + delta)) < 14 || Math.abs(x - p.X(A - delta)) < 14 ? 'delta' : null;
    },
    onDrag: (_id, x) => {
      const p = plotRef.current;
      if (!p) return;
      setDelta(Math.max(0.001, Math.min(0.6, Math.round(Math.abs(p.invX(x) - A) * 1000) / 1000)));
    },
  });

  const verdict = res.ok
    ? `통과. x가 2에서 ${delta.toFixed(3)}보다 가까우면 x²은 4에서 많아야 ${res.maxDev.toFixed(4)}만큼 떨어져, ε = ${eps.toFixed(3)} 안에 있습니다.`
    : `실패. x = ${res.worstX.toFixed(3)}에서 x² = ${SQ(res.worstX).toFixed(3)}이라 4에서 ${res.maxDev.toFixed(3)}만큼 떨어져 ε = ${eps.toFixed(3)}을 넘습니다. δ를 줄여 보세요.`;

  return (
    <Figure
      no={2}
      title="ε-δ 게임: x²의 x → 2일 때 극한은 4"
      hint="상대가 ε를 정하면, 여러분이 δ를 고릅니다"
      caption={
        <>
          초록 띠는 극한값 4에서 ε 안쪽, 파란 띠는 2에서 δ 안쪽입니다. 파란 띠 안의 그래프 조각(x = 2 자체는 빼고)이 모두 초록 띠 안에 있으면 통과입니다. 조각에서 초록 띠를 벗어난 부분은 빨갛게 칠했습니다. 판정은 띠 안의 점 798개에서 계산합니다. δ 띠의 경계선을 직접 끌 수도 있습니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="ca-col">
          <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`ε = ${eps.toFixed(3)}, δ = ${delta.toFixed(3)}. ${verdict}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="ca-note" data-good={res.ok || undefined} data-bad={!res.ok || undefined} aria-live="polite">
            {verdict}
          </div>
        </div>
        <div className="controls">
          <Slider id="lm-eps" label="상대의 ε" value={eps} min={0.02} max={1} step={0.005} onChange={setEps} format={(v) => v.toFixed(3)} color="var(--good)" />
          <Slider id="lm-delta" label="나의 δ" value={delta} min={0.001} max={0.6} step={0.001} onChange={setDelta} format={(v) => v.toFixed(3)} color="var(--accent)" />
          <div className="btn-row">
            <Button small onClick={() => setEps((e) => Math.max(0.02, Math.round((e / 2) * 1000) / 1000))}>
              상대가 ε를 절반으로
            </Button>
            <Button small onClick={() => setDelta(Math.floor(best * 1000) / 1000)}>
              통과하는 가장 큰 δ
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="가장 큰 |x² − 4|" value={res.maxDev.toFixed(4)} color={res.ok ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="허용되는 δ의 끝" value={best.toFixed(4)} />
          </div>
          <p className="ca-small">
            x² = 4 + ε가 되는 x는 <M>{'\\sqrt{4+\\varepsilon}'}</M>이므로, δ가 <M>{'\\sqrt{4+\\varepsilon}-2'}</M> 이하이면 통과합니다. 지금은 {best.toFixed(4)}입니다.
          </p>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: when the limit fails ─────────────── */

function FailFigure() {
  const P = usePalette();
  const [id, setId] = useState('jump');
  const fc = FAILS.find((f) => f.id === id)!;
  const ks = [1, 2, 3, 4, 5];
  const rows = ks.map((k) => {
    const h = Math.pow(10, -k);
    return { h, l: fc.f(fc.a - h), r: fc.f(fc.a + h) };
  });

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: fc.a - fc.xr, xMax: fc.a + fc.xr, yMin: fc.yLo, yMax: fc.yHi, pad: { l: 40, r: 14, t: 14, b: 28 } });
      p.grid();
      // draw the two sides separately so jumps and blow-ups are not joined by a line
      p.fn(fc.f, P.neg, 2.5, { to: fc.a - 1e-9, samples: fc.id === 'osc' ? 4000 : 600 });
      p.fn(fc.f, P.pos, 2.5, { from: fc.a + 1e-9, samples: fc.id === 'osc' ? 4000 : 600 });
      p.line(fc.a, p.yMin, fc.a, p.yMax, alpha(P.ink3, 0.5), 1, [4, 4]);
      if (fc.left !== null && isFinite(fc.left)) hole(p, fc.a, fc.left, P.neg, P.surface);
      if (fc.right !== null && isFinite(fc.right) && fc.right !== fc.left) hole(p, fc.a, fc.right, P.pos, P.surface);
      if (fc.right !== null && isFinite(fc.right) && fc.right === fc.left) hole(p, fc.a, fc.right, P.ink, P.surface);
      if (fc.value !== null) p.dot(fc.a, fc.value, 5, P.ink, P.surface, 2);
    },
    [P, fc],
    { aspect: 1.7, maxHeight: 340 },
  );

  const lim = (v: number | null) => (v === null ? '없음 (진동)' : !isFinite(v) ? (v > 0 ? '+∞로 커짐' : '−∞로 작아짐') : String(v));
  const limitExists = fc.left !== null && fc.right !== null && isFinite(fc.left) && fc.left === fc.right;
  const continuous = limitExists && fc.value !== null && fc.value === fc.left;
  const checks = [
    { ok: fc.value !== null, text: <>f({fc.a})가 정의된다{fc.value !== null ? ` (= ${fc.value})` : ''}</> },
    { ok: limitExists, text: <>x → {fc.a}일 때 극한이 존재한다 (왼쪽 극한 = 오른쪽 극한)</> },
    { ok: continuous, text: <>극한값이 f({fc.a})와 같다</> },
  ];

  return (
    <Figure
      no={3}
      title="극한이 없을 때, 연속이 아닐 때"
      hint="네 가지 경우를 바꿔 보세요"
      caption={
        <>
          빨간 곡선은 왼쪽(x &lt; a), 초록 곡선은 오른쪽(x &gt; a)입니다. 속이 빈 동그라미는 그래프가 다가가는 점, 속이 찬 동그라미는 실제 함수값 f(a)입니다. 표는 a에서 10<sup>−1</sup>부터 10<sup>−5</sup>까지 떨어진 곳의 값입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={setId} options={FAILS.map((f) => ({ value: f.id, label: f.name }))} />
      </div>
      <MB>{fc.tex}</MB>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${fc.name}: x가 ${fc.a}로 다가갈 때 왼쪽 극한은 ${lim(fc.left)}, 오른쪽 극한은 ${lim(fc.right)}입니다. ${continuous ? '연속입니다.' : '연속이 아닙니다.'}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="ca-col">
          <div className="tbl-wrap">
            <table className="lm-table">
              <thead>
                <tr>
                  <th>h</th>
                  <th>f(a − h)</th>
                  <th>f(a + h)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.h}>
                    <td className="mono">{hFmt(r.h)}</td>
                    <td className="mono lm-l">{fmt(r.l, 4)}</td>
                    <td className="mono lm-r">{fmt(r.r, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="왼쪽 극한" value={lim(fc.left)} color="var(--neg)" />
            <Readout label="오른쪽 극한" value={lim(fc.right)} color="var(--pos)" />
          </div>
          <ul className="lm-checks" aria-label="연속의 세 조건">
            {checks.map((c, i) => (
              <li key={i} data-ok={c.ok || undefined}>
                <span aria-hidden="true">{c.ok ? '✓' : '✗'}</span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
          <div className="ca-note" data-good={continuous || undefined}>
            {continuous ? `x = ${fc.a}에서 연속입니다.` : `x = ${fc.a}에서 연속이 아닙니다.`}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: bisection and the intermediate value theorem ─────────────── */

const FRAMES = bisect(cubic, 1, 2, 20);

function BisectFigure() {
  const P = usePalette();
  const s = useStepper(FRAMES.length, 2);
  const [follow, setFollow] = useState(true);
  const f = FRAMES[s.i];
  const width = f.hi - f.lo;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = Math.max(width * 0.6, 1e-9);
      const xMin = follow ? f.lo - pad : 0.8;
      const xMax = follow ? f.hi + pad : 2.2;
      const ys = [cubic(xMin), cubic(xMax), 0];
      const yMin = follow ? Math.min(...ys) : -3;
      const yMax = follow ? Math.max(...ys) : 6;
      const yPad = (yMax - yMin) * 0.12 || 1e-6;
      const p = new Plot(ctx, w, h, P, { xMin, xMax, yMin: yMin - yPad, yMax: yMax + yPad, pad: { l: 56, r: 14, t: 14, b: 28 } });
      p.grid({ fmt: (v) => +v.toPrecision(7) + '' });
      ctx.fillStyle = alpha(P.hl, 0.25);
      ctx.fillRect(p.X(f.lo), p.pad.t, p.X(f.hi) - p.X(f.lo), p.ph);
      p.fn(cubic, P.accent, 2.5);
      p.dot(f.lo, f.fLo, 5, P.bad, P.surface, 2);
      p.dot(f.hi, f.fHi, 5, P.good, P.surface, 2);
      p.line(f.mid, 0, f.mid, f.fMid, P.ink, 1.5, [4, 3]);
      p.dot(f.mid, f.fMid, 6, P.ink, P.surface, 2);
    },
    [P, f, follow, width],
    { aspect: 1.9, maxHeight: 330 },
  );

  const keepText = f.keep === 'right' ? `f(중점) < 0이므로 부호가 바뀌는 곳은 오른쪽 절반 [${nf(f.mid)}, ${nf(f.hi)}]에 있습니다.` : f.keep === 'left' ? `f(중점) > 0이므로 부호가 바뀌는 곳은 왼쪽 절반 [${nf(f.lo)}, ${nf(f.mid)}]에 있습니다.` : '중점에서 정확히 0입니다.';

  return (
    <Figure
      no={4}
      title="중간값 정리로 근 찾기: 이분법"
      hint="한 단계씩 넘기며 구간이 반씩 줄어드는 것을 보세요"
      caption={
        <>
          <M>{'f(x)=x^3-x-2'}</M>는 x = 1에서 −2(빨강), x = 2에서 4(초록)입니다. 연속 함수이므로 그 사이 어딘가에서 0을 지납니다. 노란 구간의 중점에서 부호를 보고, 부호가 바뀌는 쪽 절반만 남깁니다. "구간 따라 확대"를 켜면 창이 남은 구간을 따라갑니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="ca-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${s.i + 1}번째 단계. 구간 [${nf(f.lo)}, ${nf(f.hi)}], 폭 ${width.toPrecision(3)}, 중점 ${nf(f.mid)}에서 f = ${f.fMid.toFixed(5)}.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="ca-note" aria-live="polite">
            {s.i + 1}단계 · 중점 {nf(f.mid)}에서 f = {f.fMid.toFixed(5)}. {keepText}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="lm-bis" maxSpeed={10} />
          <Check label="구간 따라 확대" checked={follow} onChange={setFollow} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="구간 폭" value={width < 1e-3 ? width.toExponential(2) : String(+width.toPrecision(6))} />
            <Readout label="중점" value={f.mid.toFixed(7)} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--bad)', label: 'f < 0인 끝', shape: 'dot' },
          { color: 'var(--good)', label: 'f > 0인 끝', shape: 'dot' },
          { color: 'var(--hl)', label: '근이 있는 구간', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Limits() {
  return (
    <>
      <h2>0으로 나누지 않고 0에 다가가기</h2>
      <p>
        <M>{'\\sin x / x'}</M>는 x = 0에서 계산할 수 없습니다. 분자도 0, 분모도 0이기 때문입니다. 그런데 x = 0.1을 넣으면 0.998334, x = 0.01을 넣으면 0.999983이 나옵니다. x를 0에 가까이 가져갈수록 값은 1에 가까워집니다. 이렇게 어떤 점 <em>에서의</em> 값이 아니라 어떤 점 <em>근처에서</em> 함수가 어디로 가는지를 묻는 것이 <T en="limit">극한</T>입니다.
      </p>
      <MB note="x가 a에 한없이 가까워질 때 f(x)가 L에 한없이 가까워진다">{'\\lim_{x\\to a} f(x) = L'}</MB>
      <p>
        그림 1에서 확대해 보면 두 함수 모두 구멍 근처에서 점점 곧은 선처럼 보이고, 구멍의 높이가 분명해집니다. <M>{'(x^2-1)/(x-1)'}</M>은 x ≠ 1에서 x + 1과 같으므로, 그래프는 직선 y = x + 1에서 점 하나를 뺀 것입니다. 표에서 h를 10배씩 줄이면 2와의 차이도 정확히 10배씩 줄어듭니다.
      </p>
      <HoleFigure />
      <Callout kind="note">
        극한은 f(a)가 무엇인지와 상관이 없습니다. f(a)가 정의되지 않아도 되고, 정의되어 있어도 극한과 다른 값일 수 있습니다. 극한이 보는 것은 a를 뺀 그 주변뿐입니다. 이 성질 덕분에 다음 장에서 0 ÷ 0 꼴인 기울기를 극한으로 정의할 수 있습니다.
      </Callout>

      <h2>"한없이 가까워진다"를 정확히 말하기</h2>
      <p>
        "한없이 가까워진다"는 말은 직관적이지만, 정말 그런지 따지려면 기준이 필요합니다. 19세기 수학자들은 이것을 두 사람이 겨루는 게임으로 바꿨습니다. 상대가 아무리 작은 오차 ε(입실론)를 정해도, 여러분이 거리 δ(델타)를 찾아서, a에서 δ보다 가까운 모든 x(a 자체는 빼고)에 대해 f(x)가 L에서 ε보다 가깝게 만들 수 있으면, 극한은 L입니다.
      </p>
      <MB>{'\\forall \\varepsilon>0\\ \\exists \\delta>0:\\quad 0<|x-a|<\\delta \\implies |f(x)-L|<\\varepsilon'}</MB>
      <p>
        그림 2는 <M>{'\\lim_{x\\to 2} x^2 = 4'}</M>를 이 게임으로 확인합니다. 처음 설정(ε = 0.5, δ = 0.2)에서는 실패합니다. x가 2.2 가까이 가면 x²이 4.84 가까이 되어 4에서 0.84나 떨어지기 때문입니다. 판정은 띠 안의 점들을 실제로 계산해 가장 많이 벗어난 x = 2.1995에서 차이 0.8378을 찾습니다. δ를 0.1로 줄이면 가장 큰 차이가 0.4090이 되어 통과합니다.
      </p>
      <EpsDeltaFigure />
      <p>
        "상대가 ε를 절반으로"를 몇 번 눌러도, "통과하는 가장 큰 δ"를 누르면 언제나 답이 있습니다. ε가 0.5이면 δ는 0.1213까지, 0.1이면 0.0248까지, 0.01이면 0.0025까지 됩니다. 상대가 어떤 ε를 내놓든 이길 수 있으므로 극한은 4입니다. 손으로 증명할 때는 δ를 ε로 나타내는 식을 하나 찾으면 됩니다. δ ≤ 1이면 x가 1과 3 사이라서 |x + 2| &lt; 5이고, <M>{'|x^2-4| = |x-2|\\,|x+2| < 5\\delta'}</M>이므로 <M>{'\\delta = \\min(1, \\varepsilon/5)'}</M>로 고르면 언제나 이깁니다.
      </p>
      <Callout kind="intuition">
        ε-δ 정의는 품질 보증서와 같습니다. 고객이 "오차 0.001 이내로 맞춰 주세요"라고 요구하면, 공장은 "그러면 재료를 0.0002 이내로 맞추면 됩니다"라고 답할 수 있어야 합니다. 고객이 어떤 요구를 하든 답할 수 있으면 공정이 믿을 만한 것입니다.
      </Callout>

      <h2>극한이 없을 때</h2>
      <p>
        극한이 언제나 있는 것은 아닙니다. 그림 3에서 네 가지 경우를 바꿔 보세요. <strong>점프</strong>에서는 왼쪽에서 다가가면 1, 오른쪽에서 다가가면 2입니다. 한쪽에서만 다가갈 때의 극한을 <T en="one-sided limit">한쪽 극한</T>이라고 하고, 극한이 존재하려면 두 한쪽 극한이 같아야 합니다.
      </p>
      <MB>{'\\lim_{x\\to 1^-} f(x) = 1 \\ne 2 = \\lim_{x\\to 1^+} f(x)'}</MB>
      <p>
        <strong>진동</strong>하는 <M>{'\\sin(1/x)'}</M>는 0에 다가갈수록 −1과 1 사이를 점점 더 빨리 오갑니다. 표에서 h를 10배씩 줄여도 값이 어디로도 모이지 않습니다. ε = 0.5를 주면 아무리 작은 δ를 골라도 그 안에 sin(1/x) = 1인 곳과 −1인 곳이 모두 있어서 게임에서 이길 수 없습니다. <strong>발산</strong>하는 1/x는 오른쪽에서 +∞, 왼쪽에서 −∞로 갑니다. ∞는 수가 아니므로 극한은 없다고 하고, "+∞로 발산한다"고 따로 말합니다.
      </p>
      <FailFigure />

      <h2>연속: 끊김 없이 이어진다</h2>
      <p>
        극한이 있으면 함수가 그 점에서 <T en="continuous">연속</T>인지 정의할 수 있습니다. 그림 3 오른쪽의 세 조건이 모두 맞을 때, 즉 f(a)가 정의되고, 극한이 존재하고, 둘이 같을 때 f는 a에서 연속입니다. 그래프로는 펜을 떼지 않고 그 점을 지나갈 수 있다는 뜻입니다.
      </p>
      <MB>{'\\lim_{x\\to a} f(x) = f(a)'}</MB>
      <p>
        <strong>구멍</strong> 경우는 극한이 2인데 f(1)을 3으로 정해 놓아서 세 번째 조건이 깨집니다. f(1)을 2로 고쳐 정의하면 연속이 되므로 이런 불연속을 <T en="removable discontinuity">제거 가능한 불연속</T>이라고 합니다. 다항식, 지수 함수, 사인과 코사인은 모든 점에서 연속이고, 연속 함수끼리 더하고 곱하고 합성해도 연속입니다(나눗셈은 분모가 0이 아닌 곳에서).
      </p>

      <h2>연속이면 중간을 지난다</h2>
      <p>
        연속 함수의 가장 쓸모 있는 성질은 <T en="intermediate value theorem">중간값 정리</T>입니다. [a, b]에서 연속인 f가 f(a) &lt; 0 &lt; f(b)이면 그 사이 어딘가에 f(c) = 0인 c가 있습니다. 펜을 떼지 않고 수평선 아래에서 위로 가려면 수평선을 한 번은 지나야 한다는 것입니다.
      </p>
      <p>
        이 정리는 근이 <em>있다</em>고만 말하지만, 그대로 근을 <em>찾는</em> 알고리즘이 됩니다. 구간의 중점에서 부호를 보고 부호가 바뀌는 쪽 절반만 남기면, 그 절반에도 다시 정리가 적용됩니다. <a href={lessonHref('cs-algorithms', 'search-hash')}>이진 탐색</a>과 같은 생각입니다. 그림 4에서 <M>{'x^3-x-2=0'}</M>의 근을 찾아보세요.
      </p>
      <BisectFigure />
      <p>
        단계를 하나 넘길 때마다 구간이 절반이 되므로, 11번째 단계에서는 폭이 2<sup>−10</sup> ≈ 0.001, 마지막 20번째 단계에서는 2<sup>−19</sup> ≈ 0.000002입니다. 그림의 마지막 단계에서 중점은 1.5213804이고, 참값은 1.5213797…입니다. 소수점 아래 여섯 자리까지 맞추는 데 20번의 계산이면 충분합니다. 다음 장의 뉴턴 방법은 접선을 써서 이보다 훨씬 빨리 수렴합니다.
      </p>
      <Callout kind="warn">
        연속이라는 조건을 빼면 정리가 깨집니다. 그림 3의 점프 함수에서 g(x) = f(x) − 1.5를 생각해 보면, g(0.5) = −1이고 g(1.5) = 1로 부호가 바뀝니다. 그런데 f는 1보다 왼쪽에서는 1보다 작고 1부터는 2 이상이라서 1.5가 되는 곳이 없고, g도 0이 되는 곳이 없습니다. 이분법을 돌리면 구간은 x = 1로 좁혀지지만 그곳은 근이 아니라 점프입니다.
      </Callout>

      <Callout kind="key">
        x가 a로 다가갈 때 f(x)가 L로 다가가면 극한은 L이고, 이것은 "어떤 오차 ε에도 그 안에 들게 하는 거리 δ를 찾을 수 있다"는 ε-δ 정의로 정확히 말할 수 있습니다. 극한은 f(a) 자체와 상관없고, 두 한쪽 극한이 같을 때만 존재합니다. 극한값과 함숫값이 같으면 연속이고, 연속 함수는 중간값 정리에 따라 두 값 사이의 모든 값을 지나므로 이분법으로 근을 찾을 수 있습니다.
      </Callout>
      <Quiz
        q={
          <>
            f(x) = 3x + 1에서 <M>{'\\lim_{x\\to 2} f(x) = 7'}</M>을 ε-δ 게임으로 보이려 한다. 상대가 ε = 0.3을 냈을 때 통과하는 δ 중 가장 큰 것은?
          </>
        }
        options={['0.3', '0.1', '0.9', '0.03']}
        answer={1}
        explain={
          <>
            |f(x) − 7| = |3x − 6| = 3|x − 2|입니다. 이것이 0.3보다 작으려면 |x − 2| &lt; 0.1이어야 하므로 δ = 0.1입니다. 일반적으로 δ = ε/3이면 언제나 이기고, 기울기가 3인 직선은 x의 오차를 3배로 키우기 때문에 δ가 ε의 3분의 1이 됩니다.
          </>
        }
      />
    </>
  );
}
