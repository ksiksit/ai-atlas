import { useMemo, useState } from 'react';
import { Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { EVT, FNS, IVT, deltaProfile, largestDelta, negativeIntervals, supNegative, thomaeDelta, thomaePoints, type EvtId, type FnId, type IvtId } from './cont';
import './analysis.css';
import './continuity.css';

const fd = (v: number) => (!isFinite(v) ? '어떤 δ든' : v >= 1e-3 ? v.toFixed(4) : v.toExponential(2));

/* ─────────────── Figure 1: the largest δ, point by point ─────────────── */

function DeltaFigure() {
  const P = usePalette();
  const [id, setId] = useState<FnId>('inv');
  const fn = FNS.find((x) => x.id === id)!;
  const [aRaw, setA] = useState(fn.a);
  const [eps, setEps] = useState(0.2);
  const lo = fn.openLo ? fn.lo + 0.02 : fn.lo;
  const a = Math.max(lo, Math.min(fn.hi, aRaw));
  const pick = (v: FnId) => {
    setId(v);
    setA(FNS.find((x) => x.id === v)!.a);
  };
  const d = largestDelta(fn, a, eps);
  const prof = useMemo(() => deltaProfile(fn, eps), [fn, eps]);
  const dMin = Math.min(...prof.map((p) => p.d));
  const fa = fn.f(a);

  const main = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: fn.lo - 0.05 * (fn.hi - fn.lo), xMax: fn.hi + 0.05 * (fn.hi - fn.lo), yMin: fn.yLo, yMax: fn.yHi, pad: { l: 40, r: 14, t: 14, b: 26 } });
      p.grid({});
      // the ε band around f(a) and the δ band around a
      ctx.fillStyle = alpha(P.hl, 0.18);
      ctx.fillRect(p.X(p.xMin), p.Y(fa + eps), p.X(p.xMax) - p.X(p.xMin), p.Y(fa - eps) - p.Y(fa + eps));
      const dl = Math.max(fn.lo, a - d), dr = Math.min(fn.hi, a + d);
      ctx.fillStyle = alpha(P.accent, 0.12);
      ctx.fillRect(p.X(dl), p.Y(p.yMax), p.X(dr) - p.X(dl), p.Y(p.yMin) - p.Y(p.yMax));
      const from = fn.openLo ? fn.lo + 1e-4 : fn.lo;
      p.fn(fn.f, alpha(P.ink, 0.55), 2, { from, to: fn.hi, samples: 2400 });
      // the part of the graph above the δ window, which must stay inside the ε band
      p.fn(fn.f, P.accent, 3, { from: Math.max(from, dl), to: dr, samples: 800 });
      p.dot(a, fa, 5, P.accent, P.surface, 2);
      p.text(`ε = ${eps}`, p.xMax, fa + eps, P.ink2, { align: 'right', dx: -4, dy: -10, font: `600 11px ${P.fontBody}`, bg: P.surface });
    },
    [P, fn, a, eps, d, fa],
    { aspect: 1.9, maxHeight: 300 },
  );

  const profile = useCanvas2D(
    (ctx, { w, h }) => {
      const top = Math.max(...prof.map((p) => p.d)) * 1.15;
      const p = new Plot(ctx, w, h, P, { xMin: fn.lo - 0.05 * (fn.hi - fn.lo), xMax: fn.hi + 0.05 * (fn.hi - fn.lo), yMin: 0, yMax: top, pad: { l: 40, r: 14, t: 10, b: 24 } });
      p.grid({ yStep: top > 0.3 ? 0.1 : top > 0.06 ? 0.02 : 0.01 });
      ctx.fillStyle = alpha(P.good, 0.25);
      ctx.beginPath();
      ctx.moveTo(p.X(prof[0].a), p.Y(0));
      prof.forEach((q) => ctx.lineTo(p.X(q.a), p.Y(q.d)));
      ctx.lineTo(p.X(prof[prof.length - 1].a), p.Y(0));
      ctx.closePath();
      ctx.fill();
      p.line(p.xMin, dMin, p.xMax, dMin, alpha(P.good, 0.9), 1.2, [4, 3]);
      p.dot(a, d, 4.5, P.accent, P.surface, 2);
      p.text('δ(a)', p.xMin, top, P.ink3, { dx: 4, dy: 10, align: 'left', font: `600 11px ${P.fontBody}`, bg: P.surface });
    },
    [P, prof, a, d, dMin, fn],
    { height: 130 },
  );

  return (
    <Figure
      no={1}
      title="점마다 가장 큰 δ"
      hint="함수, 점 a, ε를 바꿔 보세요"
      caption={
        <>
          노란 띠는 <M>{'f(a) \\pm \\varepsilon'}</M>, 파란 띠는 <M>{'a \\pm \\delta'}</M>입니다. δ는 파란 띠 위의 그래프(진한 부분)가 노란 띠를 벗어나지 않는 가장 큰 값으로, 단조 함수는 역함수로 정확히, <M>{'x\\sin(1/x)'}</M>은 0.00001 간격으로 찾았습니다. 아래 그래프는 같은 ε에서 a를 정의역 전체로 옮기며 그린 δ(a)이고, 점선이 그 가장 작은 값입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="함수" value={id} onChange={pick} options={FNS.map((x) => ({ value: x.id, label: x.name }))} />
      </div>
      <div className="controls row">
        <Slider id="ct-a" label="점 a" value={a} min={lo} max={fn.hi} step={0.01} onChange={setA} format={(v) => v.toFixed(2)} />
        <Slider id="ct-eps" label="ε" value={eps} min={0.05} max={0.5} step={0.05} onChange={setEps} format={(v) => v.toFixed(2)} />
      </div>
      <div ref={main.wrapRef} className="canvas-box" role="img" aria-label={`${fn.name}의 그래프. a = ${a.toFixed(2)}, ε = ${eps}일 때 가장 큰 δ는 ${fd(d)}입니다.`}>
        <canvas ref={main.canvasRef} />
      </div>
      <div ref={profile.wrapRef} className="canvas-box" role="img" aria-label={`ε = ${eps}에서 점마다의 가장 큰 δ. 정의역 전체에서 가장 작은 값은 ${fd(dMin)}입니다.`}>
        <canvas ref={profile.canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label="이 점의 δ" value={fd(d)} color="var(--accent)" />
        <Readout label="정의역 전체에서 가장 작은 δ" value={fn.uniform ? fd(dMin) : '0으로 감'} color={fn.uniform ? 'var(--good)' : 'var(--bad)'} />
        <Readout label="균등 연속" value={fn.uniform ? '예' : '아니요'} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the intermediate value theorem from completeness ─────────────── */

const IVT_STEPS = [
  { title: '출발', text: 'f(0) < 0 < f(3)입니다. 0이 되는 점이 있다는 것을 보이려 합니다.' },
  { title: '집합 A', text: 'A = { x ∈ [0, 3] : f(x) < 0 }을 진한 줄로 표시합니다. 0이 A에 들어 있으니 비어 있지 않고, 3이 상계입니다.' },
  { title: 'c = sup A', text: '완비성 공리에 따라 A의 상한 c가 있습니다. 첫 번째 근이 아니라 A가 마지막으로 끝나는 곳입니다.' },
  { title: '왼쪽에서', text: 'c는 A의 상한이므로 A의 점 xₙ이 c로 다가갈 수 있습니다. f(xₙ) < 0이고 f가 연속이니 f(c) = lim f(xₙ) ≤ 0입니다.' },
  { title: '오른쪽에서', text: 'c보다 큰 점은 A에 없으므로 f(x) ≥ 0입니다. c로 다가가는 그런 점들의 극한을 보면 f(c) ≥ 0입니다.' },
  { title: '결론', text: '' },
];

function IvtFigure() {
  const P = usePalette();
  const [id, setId] = useState<IvtId>('wavy');
  const f = IVT[id];
  const c = useMemo(() => supNegative(f, IVT.lo, IVT.hi), [f]);
  const neg = useMemo(() => negativeIntervals(f, IVT.lo, IVT.hi), [f]);
  const s = useStepper(IVT_STEPS.length, 1, id);
  const k = s.i;
  const fc = f(c);
  const ok = Math.abs(fc) < 1e-6;
  const lastText = ok ? `그래서 f(c) = 0입니다. 실제로 c ≈ ${c.toFixed(4)}에서 f(c) ≈ 0입니다.` : `f가 x = 1.6에서 끊겨 있어 왼쪽 극한과 f(c)가 다릅니다. c = ${c.toFixed(4)}이지만 f(c) = ${fc.toFixed(4)}로 0이 아니고, 0이 되는 점은 없습니다. 연속이라는 조건이 넷째 걸음에서 쓰였습니다.`;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -0.15, xMax: 3.15, yMin: -1.6, yMax: 2, pad: { l: 36, r: 14, t: 14, b: 26 } });
      p.grid({ xStep: 0.5, yStep: 0.5 });
      if (id === 'jump') {
        p.fn(f, P.ink, 2.5, { from: 0, to: 1.6 - 1e-6 });
        p.fn(f, P.ink, 2.5, { from: 1.6, to: 3 });
        p.dot(1.6, IVT.jump(1.6 - 1e-9), 4.5, P.surface, P.ink, 2);
        p.dot(1.6, IVT.jump(1.6), 4.5, P.ink);
      } else p.fn(f, P.ink, 2.5, { from: 0, to: 3 });
      p.dot(0, f(0), 5, P.neg, P.surface, 2);
      p.dot(3, f(3), 5, P.pos, P.surface, 2);
      if (k >= 1) for (const [x0, x1] of neg) p.line(x0, 0, x1, 0, P.neg, 6);
      if (k >= 2) {
        p.line(c, -1.6, c, 2, alpha(P.ink, 0.7), 1.2, [5, 4]);
        p.text('c = sup A', c, 2, P.ink, { dx: 6, dy: 12, align: 'left', font: `600 12px ${P.fontBody}`, bg: P.surface });
      }
      if (k >= 3) for (let j = 1; j <= 5; j++) p.dot(c - 0.5 / 2 ** j, 0, 3.5, P.neg, P.surface, 1.5);
      if (k >= 4) for (let j = 1; j <= 5; j++) p.dot(Math.min(3, c + 0.5 / 2 ** j), 0, 3.5, P.pos, P.surface, 1.5);
      if (k >= 5) p.dot(c, fc, 6, ok ? P.good : P.bad, P.surface, 2);
    },
    [P, f, id, c, neg, k, fc, ok],
    { aspect: 1.9, maxHeight: 320 },
  );

  return (
    <Figure
      no={2}
      title="중간값 정리를 상한으로 증명하기"
      hint="한 단계씩 넘기며 증명을 따라가세요"
      caption={
        <>
          파란 점은 f(0) &lt; 0, 주황 점은 f(3) &gt; 0입니다. 둘째 걸음의 진한 파란 줄이 f가 음수인 집합 A이고, 넷째와 다섯째 걸음의 작은 점들이 c로 다가가는 수열입니다. "불연속"을 고르면 같은 증명이 어느 걸음에서 무너지는지 볼 수 있습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="함수" value={id} onChange={setId} options={[{ value: 'wavy', label: '연속 (근이 셋)' }, { value: 'jump', label: '불연속 (0을 건너뜀)' }]} />
      </div>
      <div className="fig-split">
        <div className="an-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`중간값 정리 증명 ${k + 1}단계: ${IVT_STEPS[k].title}. c = ${c.toFixed(4)}, f(c) = ${fc.toFixed(4)}.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="ct-steps" aria-live="polite">
            <b>{k + 1}. {IVT_STEPS[k].title}</b> {k === IVT_STEPS.length - 1 ? lastText : IVT_STEPS[k].text}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="ct-ivt" maxSpeed={4} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="c = sup A" value={c.toFixed(4)} />
            <Readout label="f(c)" value={fc.toFixed(4)} color={ok ? 'var(--good)' : 'var(--bad)'} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the extreme value theorem and its hypotheses ─────────────── */

function EvtFigure() {
  const P = usePalette();
  const [id, setId] = useState<EvtId>('ok');
  const e = EVT.find((x) => x.id === id)!;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -0.2, xMax: 2.2, yMin: -0.2, yMax: e.yMax + 0.4, pad: { l: 36, r: 14, t: 14, b: 26 } });
      p.grid({ xStep: 0.5, yStep: 0.5 });
      if (isFinite(e.sup)) {
        p.line(-0.2, e.sup, 2.2, e.sup, alpha(e.attained ? P.good : P.bad, 0.85), 1.4, [6, 4]);
        p.text(`sup = ${e.sup}`, 2.2, e.sup, e.attained ? P.good : P.bad, { align: 'right', dx: -4, dy: -10, font: `600 11px ${P.fontBody}`, bg: P.surface });
      }
      const from = e.openLo ? e.lo + 1e-3 : e.lo;
      const to = id === 'jump' ? e.hi - 1e-6 : e.openHi ? e.hi - 1e-3 : e.hi;
      p.fn(e.f, P.accent, 2.6, { from, to, samples: 800 });
      const end = (x: number, y: number, open: boolean) => p.dot(x, y, 5, open ? P.surface : P.accent, P.accent, 2);
      if (id !== 'unbounded') end(e.lo, e.f(e.lo + 1e-9), e.openLo);
      if (id === 'jump') {
        end(e.hi, 2, true);
        end(e.hi, 0, false);
      } else end(e.hi, e.openHi ? e.f(e.hi - 1e-9) : e.f(e.hi), e.openHi);
      if (e.attained) p.dot(1, e.sup, 6, P.good, P.surface, 2);
    },
    [P, e, id],
    { aspect: 2, maxHeight: 300 },
  );

  return (
    <Figure
      no={3}
      title="최대·최소 정리의 조건 하나씩 빼기"
      hint="네 경우를 바꿔 보세요"
      caption={
        <>
          속이 찬 동그라미는 정의역에 들어 있는 끝점, 빈 동그라미는 들어 있지 않은 끝점입니다. 점선은 함숫값들의 상한이고, 초록이면 그 값을 실제로 가지는 점이 있고 빨강이면 없습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="경우" value={id} onChange={setId} options={EVT.map((x) => ({ value: x.id, label: x.label }))} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${e.label}: ${e.why}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label="함수와 정의역" value={<M>{e.tex}</M>} />
        <Readout label="상한" value={isFinite(e.sup) ? String(e.sup) : '없음 (위로 유계 아님)'} />
        <Readout label="최댓값" value={e.attained ? '있음' : '없음'} color={e.attained ? 'var(--good)' : 'var(--bad)'} />
      </div>
      <div className="an-note">{e.why}</div>
    </Figure>
  );
}

/* ─────────────── Figure 4: Thomae's function ─────────────── */

const QDRAW = 40;
const X_IRR = Math.SQRT2 - 1;

function ThomaeFigure() {
  const P = usePalette();
  const [at, setAt] = useState<'irr' | 'half'>('irr');
  const [eps, setEps] = useState(0.1);
  const x0 = at === 'irr' ? X_IRR : 0.5;
  const q0 = at === 'irr' ? null : 2;
  const f0 = q0 === null ? 0 : 1 / q0;
  const pts = useMemo(() => thomaePoints(QDRAW), []);
  const r = thomaeDelta(x0, q0, eps);
  const fails = r.delta === 0;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -0.02, xMax: 1.02, yMin: -0.04, yMax: 1.06, pad: { l: 36, r: 14, t: 14, b: 26 } });
      p.grid({ xStep: 0.25, yStep: 0.25 });
      // the irrationals all sit at height 0
      p.line(0, 0, 1, 0, alpha(P.ink3, 0.8), 2);
      ctx.fillStyle = alpha(P.hl, 0.2);
      ctx.fillRect(p.X(p.xMin), p.Y(Math.min(1.06, f0 + eps)), p.X(p.xMax) - p.X(p.xMin), p.Y(Math.max(-0.04, f0 - eps)) - p.Y(Math.min(1.06, f0 + eps)));
      if (!fails && isFinite(r.delta)) {
        ctx.fillStyle = alpha(P.accent, 0.14);
        const l = Math.max(0, x0 - r.delta), rr = Math.min(1, x0 + r.delta);
        ctx.fillRect(p.X(l), p.Y(p.yMax), p.X(rr) - p.X(l), p.Y(p.yMin) - p.Y(p.yMax));
      }
      for (const q of pts) {
        const block = q.y >= f0 + eps - 1e-12 && Math.abs(q.x - x0) > 1e-12;
        p.dot(q.x, q.y, block ? 3.4 : 2.2, block ? P.pos : alpha(P.ink, 0.55));
      }
      p.line(x0, -0.04, x0, 1.06, alpha(P.accent, 0.8), 1.2, [4, 3]);
      p.dot(x0, f0, 5.5, P.accent, P.surface, 2);
      if (r.nearest) p.text(`${r.nearest.p}/${r.nearest.q}`, r.nearest.p / r.nearest.q, 1 / r.nearest.q, P.pos, { dy: -12, font: `600 11px ${P.fontMono}`, bg: P.surface });
    },
    [P, pts, x0, f0, eps, r, fails],
    { aspect: 1.9, maxHeight: 320 },
  );

  return (
    <Figure
      no={4}
      title="유리수에서만 끊기는 함수"
      hint="점과 ε를 바꿔 보세요"
      caption={
        <>
          토메 함수는 기약분수 p/q에서 1/q, 무리수에서 0입니다. 회색 점은 분모가 {QDRAW} 이하인 유리수의 값이고, 무리수는 모두 아래쪽 선 위에 있습니다. 노란 띠는 <M>{'f(x_0) \\pm \\varepsilon'}</M>, 주황 점은 그 띠를 벗어나는 유리수입니다. 주황 점은 언제나 유한 개이므로, 무리수 <M>{'x_0'}</M>에서는 가장 가까운 주황 점까지의 거리를 δ로 잡으면 됩니다(파란 띠).
        </>
      }
    >
      <div className="controls row">
        <Seg label="점" value={at} onChange={setAt} options={[{ value: 'irr', label: 'x₀ = √2 − 1 (무리수)' }, { value: 'half', label: 'x₀ = 1/2 (유리수)' }]} />
        <Slider id="ct-teps" label="ε" value={eps} min={0.02} max={0.6} step={0.01} onChange={setEps} format={(v) => v.toFixed(2)} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`토메 함수. x₀ = ${at === 'irr' ? '√2 − 1' : '1/2'}, ε = ${eps}. ${fails ? '이 점 바로 옆의 무리수에서 값이 0이라 어떤 δ도 통하지 않습니다.' : `δ = ${fd(r.delta)}면 충분합니다.`}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label="띠를 벗어나는 유리수" value={fails ? '무리수가 벗어남' : `${r.blockers}개`} color="var(--pos)" />
        <Readout label="가장 가까운 것" value={r.nearest ? `${r.nearest.p}/${r.nearest.q}` : '–'} />
        <Readout label="δ" value={fails ? '없음' : fd(r.delta)} color={fails ? 'var(--bad)' : 'var(--good)'} />
      </div>
      <Legend items={[{ color: 'var(--pos)', label: '띠를 벗어나는 점', shape: 'dot' }, { color: 'var(--accent)', label: 'x₀', shape: 'dot' }]} />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Continuity() {
  return (
    <>
      <h2>연속의 두 가지 정의</h2>
      <p>
        <a href={lessonHref('math-calculus', 'limits')}>미적분학의 극한과 연속 장</a>에서 연속을 "끊김 없이 그릴 수 있다"는 그림과 ε-δ 게임으로 만났습니다. 이 장에서는 그 정의를 기준으로 삼아 정리를 증명합니다. 함수 <M>{'f: D \\to \\mathbb{R}'}</M>가 점 <M>{'a \\in D'}</M>에서 연속이라는 것은 다음을 뜻합니다.
      </p>
      <MB>{'\\forall \\varepsilon > 0\\ \\ \\exists \\delta > 0\\ \\ \\forall x \\in D:\\quad |x - a| < \\delta \\ \\Rightarrow\\ |f(x) - f(a)| < \\varepsilon'}</MB>
      <p>
        같은 것을 수열로도 말할 수 있습니다. a로 수렴하는 D 안의 수열 <M>{'(x_n)'}</M>이 무엇이든 <M>{'f(x_n) \\to f(a)'}</M>이면, f를 a에서 <T en="sequentially continuous">수열 연속</T>이라고 합니다. 앞의 정의는 "가까운 입력은 가까운 출력을 준다"를, 뒤의 정의는 "극한과 f의 순서를 바꿔도 된다"를 말합니다. 둘은 같은 뜻입니다.
      </p>
      <div className="ct-thm">
        <b>정리.</b> f가 a에서 ε-δ 연속일 필요충분조건은 f가 a에서 수열 연속인 것입니다.
      </div>
      <div className="ct-proof">
        <p>
          <span className="ct-proof-head">증명 (⇒).</span> f가 a에서 ε-δ 연속이고 <M>{'x_n \\to a'}</M>라고 합시다. <M>{'\\varepsilon > 0'}</M>을 주면, 연속성에서 δ &gt; 0이 있어 <M>{'|x - a| < \\delta'}</M>이면 <M>{'|f(x) - f(a)| < \\varepsilon'}</M>입니다. 그 δ를 수열의 수렴 정의에 ε 자리로 넣으면 어떤 N이 있어 n ≥ N이면 <M>{'|x_n - a| < \\delta'}</M>이고, 따라서 <M>{'|f(x_n) - f(a)| < \\varepsilon'}</M>입니다. 이것이 <M>{'f(x_n) \\to f(a)'}</M>의 정의입니다. <span className="ct-qed">∎</span>
        </p>
        <p>
          (⇐)는 대우로 보입니다. ε-δ 연속이 아니면 어떤 ε가 있어 δ = 1/n마다 <M>{'|x_n - a| < 1/n'}</M>인데 <M>{'|f(x_n) - f(a)| \\ge \\varepsilon'}</M>인 <M>{'x_n'}</M>을 고를 수 있습니다. 이 수열은 a로 가지만 <M>{'f(x_n)'}</M>은 f(a)로 가지 않으니 수열 연속도 아닙니다.
        </p>
      </div>

      <h2>δ는 점마다 다르다</h2>
      <p>
        정의에서 δ는 ε와 a 둘 다에 따라 정해집니다. 같은 ε라도 그래프가 가파른 곳에서는 δ를 작게 잡아야 합니다. 그림 1에서 a를 움직이며 가장 큰 δ가 어떻게 바뀌는지 보세요.
      </p>
      <DeltaFigure />
      <p>
        <M>{'1/x'}</M>를 (0, 2]에서 보면, ε = 0.2일 때 a = 1에서는 δ = 0.1667이지만 a = 0.1에서는 0.00196, a = 0.01에서는 0.00002로 줄어듭니다. 0에 가까울수록 그래프가 가팔라져서, 모든 점에 한꺼번에 통하는 양수 δ는 없습니다. 반면 <M>{'x^2'}</M>을 [0, 2]에서 보면 δ가 가장 작은 곳은 가장 가파른 x = 2이고 그 값은 0.0494입니다. 이 δ 하나를 정의역의 모든 점에 쓸 수 있습니다. <M>{'\\sqrt{x}'}</M>는 0에서 기울기가 무한대인데도 δ(a)의 가장 작은 값이 a = 0에서 0.04로 양수입니다.
      </p>
      <p>
        이렇게 a와 상관없이 ε만으로 δ를 고를 수 있으면 f를 <T en="uniformly continuous">균등 연속</T>이라고 합니다. 양화사의 순서만 바뀝니다.
      </p>
      <MB>{'\\forall \\varepsilon > 0\\ \\ \\exists \\delta > 0\\ \\ \\forall x, y \\in D:\\quad |x - y| < \\delta \\ \\Rightarrow\\ |f(x) - f(y)| < \\varepsilon'}</MB>
      <p>
        닫힌 유계 구간 [a, b] 위의 연속 함수는 언제나 균등 연속입니다(하이네-칸토어 정리). 그림 1의 x², √x, <M>{'x\\sin(1/x)'}</M>이 모두 닫힌 구간에 있어 δ(a)가 0까지 내려가지 않는 것이 그 예이고, 1/x는 0을 빼서 구간이 닫혀 있지 않기 때문에 이 정리의 조건을 만족하지 않습니다. <M>{'x\\sin(1/x)'}</M>은 0 근처에서 한없이 출렁이지만, 출렁임의 폭이 |x| 이하로 줄어들어 연속입니다.
      </p>

      <h2>중간값 정리: 완비성이 하는 일</h2>
      <p>
        중간값 정리는 너무 당연해 보여서 증명이 필요한가 싶습니다. 하지만 유리수만 있는 세계에서는 거짓입니다. <M>{'f(x) = x^2 - 2'}</M>는 유리수 위에서 연속이고 f(1) &lt; 0 &lt; f(2)인데, 0이 되는 유리수는 없습니다. 그러니 증명 어딘가에서 <a href={lessonHref('math-analysis', 'real-numbers')}>실수의 완비성</a>을 써야 합니다.
      </p>
      <div className="ct-thm">
        <b>정리 (중간값 정리).</b> f가 [a, b]에서 연속이고 f(a) &lt; 0 &lt; f(b)이면, f(c) = 0인 c ∈ (a, b)가 있습니다.
      </div>
      <div className="ct-proof">
        <p>
          <span className="ct-proof-head">증명.</span> <M>{'A = \\{x \\in [a, b] : f(x) < 0\\}'}</M>로 둡니다. a ∈ A라서 A는 비어 있지 않고 b가 상계이므로, 완비성 공리에 따라 <M>{'c = \\sup A'}</M>가 있고 a ≤ c ≤ b입니다.
        </p>
        <p>
          상한의 정의에 따라 A의 점들로 이루어진 수열 <M>{'x_n \\to c'}</M>를 고를 수 있습니다(각 n에 대해 <M>{'c - 1/n'}</M>은 상계가 아니므로 그보다 큰 A의 점이 있습니다). <M>{'f(x_n) < 0'}</M>이고 f가 c에서 연속이니 <M>{'f(c) = \\lim f(x_n) \\le 0'}</M>입니다. 특히 c ≠ b입니다.
        </p>
        <p>
          한편 c &lt; x ≤ b인 x는 A에 들어 있지 않으므로 <M>{'f(x) \\ge 0'}</M>입니다. <M>{'y_n = c + (b - c)/n \\to c'}</M>에 연속성을 쓰면 <M>{'f(c) = \\lim f(y_n) \\ge 0'}</M>입니다. 두 부등식을 합치면 f(c) = 0이고, f(a) &lt; 0이므로 c ≠ a입니다. <span className="ct-qed">∎</span>
        </p>
      </div>
      <IvtFigure />
      <p>
        연속인 함수는 [0, 0.231]과 [1.385, 2.280]에서 음수라서, A의 상한은 첫 번째 근이 아니라 세 번째 근 c ≈ 2.2793입니다. 증명은 근이 여러 개일 때 그중 하나, 곧 가장 오른쪽 근을 정확히 집어냅니다. 불연속인 함수를 고르면 같은 c = 1.6을 얻지만 f(1.6) = 0.3504입니다. 넷째 걸음의 "f(c) = lim f(xₙ)"이 연속성을 쓰는 곳이고, 함수가 끊긴 곳에서는 이 등식이 성립하지 않습니다.
      </p>

      <h2>최대·최소 정리와 조건들</h2>
      <div className="ct-thm">
        <b>정리 (최대·최소 정리).</b> 닫힌 유계 구간 [a, b]에서 연속인 함수는 최댓값과 최솟값을 가집니다.
      </div>
      <p>
        증명은 두 단계입니다. 먼저 f가 유계임을 보입니다. 유계가 아니면 <M>{'|f(x_n)| > n'}</M>인 점들이 있고, 볼차노-바이어슈트라스 정리로 이 수열에서 [a, b] 안의 점으로 수렴하는 부분수열을 뽑을 수 있는데, 그 점에서의 연속성과 모순입니다. 다음으로 상한 <M>{'M = \\sup f'}</M>에 대해 <M>{'f(x_n) > M - 1/n'}</M>인 점들을 고르고 다시 수렴하는 부분수열을 뽑으면, 그 극한점에서 f의 값이 M입니다. 두 단계 모두 "구간이 닫혀 있어 극한점이 구간 안에 남는다"와 "f가 연속이라 극한과 f를 바꿀 수 있다"를 씁니다. 그림 3에서 조건을 하나씩 빼 보세요.
      </p>
      <EvtFigure />
      <p>
        열린 구간 (0, 2)의 f(x) = x는 2에 한없이 가까운 값을 가지지만 2를 주는 x가 구간에 없습니다. (0, 2]의 1/x는 아예 위로 유계가 아닙니다. 닫힌 구간이라도 x = 2에서 값이 0으로 떨어지는 함수는 상한 2를 가지지 못합니다. 세 반례가 각각 "닫혀 있다", "유계다", "연속이다" 중 하나씩을 뺀 것입니다.
      </p>

      <h2>유리수에서만 끊기는 함수</h2>
      <p>
        연속성은 점마다의 성질이라, 이상한 모양의 함수가 가능합니다. 디리클레 함수는 유리수에서 1, 무리수에서 0인 함수입니다. 어떤 구간에도 유리수와 무리수가 모두 들어 있으니, 어느 점에서든 바로 옆에 값이 1만큼 다른 점이 있어 모든 점에서 불연속입니다. 이것을 조금 바꾼 <T en="Thomae's function">토메 함수</T>는 기약분수 p/q에서 1/q, 무리수에서 0입니다. 놀랍게도 이 함수는 모든 무리수에서 연속이고 모든 유리수에서 불연속입니다.
      </p>
      <ThomaeFigure />
      <p>
        무리수 <M>{'x_0 = \\sqrt2 - 1'}</M>에서 ε = 0.1이면, 값이 0.1 이상인 점은 분모가 10 이하인 유리수 33개뿐이고 그중 가장 가까운 것은 2/5입니다. 2/5까지의 거리 0.0142를 δ로 잡으면 그 안의 점은 모두 값이 0.1보다 작습니다. ε = 0.05로 줄이면 벗어나는 점이 129개로 늘고 가장 가까운 것은 7/17, δ는 0.00245가 됩니다. 늘어나도 언제나 유한 개이므로 양수 δ가 남습니다. 유리수 1/2에서는 f(1/2) = 1/2인데 바로 옆에 값이 0인 무리수가 있으니, ε가 1/2 이하이면 어떤 δ도 통하지 않습니다.
      </p>
      <Callout kind="note">
        반대로 "유리수에서만 연속이고 무리수에서는 모두 불연속인 함수"는 존재하지 않는다는 것이 알려져 있습니다. 불연속점의 집합이 가질 수 있는 모양에 제한이 있기 때문으로, 증명에는 베르 범주 정리라는 더 깊은 도구가 필요합니다.
      </Callout>

      <Callout kind="key">
        연속은 ε-δ로도 수열로도 정의할 수 있고 둘은 같습니다. δ는 일반적으로 ε와 점에 함께 따라 정해지며, 점과 상관없이 고를 수 있으면 균등 연속이라 하는데 닫힌 유계 구간의 연속 함수는 언제나 균등 연속입니다. 중간값 정리는 <M>{'\\sup\\{x : f(x) < 0\\}'}</M>에서 연속성을 양쪽으로 써서 증명하고, 그래서 완비성 없이는 성립하지 않습니다. 최대·최소 정리는 구간이 닫혀 있고, 유계이고, 함수가 연속이어야 하며, 셋 중 하나만 빠져도 반례가 있습니다.
      </Callout>
      <Quiz
        q="f(x) = 1/x를 [1, ∞)에서 생각한다. 다음 중 옳은 것은?"
        options={['구간이 유계가 아니므로 균등 연속이 아니다', '균등 연속이다. 기울기의 크기가 1 이하라 δ = ε를 모든 점에 쓸 수 있다', '최댓값과 최솟값을 모두 가진다', '중간값 정리를 쓸 수 없으므로 1/2과 1 사이의 값을 모두 가지지는 않는다']}
        answer={1}
        explain={<>[1, ∞)에서 <M>{'|1/x - 1/y| = |x - y|/(xy) \\le |x - y|'}</M>이므로 δ = ε가 모든 점에 통합니다. 하이네-칸토어 정리는 닫힌 유계 구간이면 균등 연속이라는 충분조건일 뿐, 유계가 아니라고 균등 연속이 아닌 것은 아닙니다. 최댓값은 x = 1에서 1이지만, 값이 0에 한없이 가까워질 뿐 0이 되지 않아 최솟값은 없습니다. [1, 2]에서 중간값 정리를 쓰면 1/2과 1 사이의 값은 모두 가집니다.</>}
      />
    </>
  );
}
