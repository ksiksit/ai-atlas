import { useMemo, useState, type ReactNode } from 'react';
import { Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { FAMILIES, geomPartial, geomSupError, gibbsPeak, powN, powUniformN, squareSum, supNorm, type Family } from './uniform';
import './analysis.css';
import './uniform.css';

function Proof({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="uc-proof">
      <div className="uc-proof-head">{title}</div>
      {children}
    </div>
  );
}
const Qed = () => <span className="uc-qed">∎</span>;
const n4 = (v: number) => (isFinite(v) ? String(+v.toFixed(4)) : '∞');

/** Grid with separate label formats for the x and y axes (Plot.grid uses one format for both). */
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

/* ─────────────── Figure 1: three sequences of functions and their limits ─────────────── */

function FamiliesFigure() {
  const P = usePalette();
  const [id, setId] = useState<Family['id']>('pow');
  const [n, setN] = useState(10);
  const fam = FAMILIES.find((f) => f.id === id)!;
  const sup = supNorm(fam, n);
  const intN = fam.intN(n);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yMax = fam.yMax(n);
      const p = new Plot(ctx, w, h, P, { xMin: 0, xMax: 1, yMin: -yMax * 0.06, yMax, pad: { l: 40, r: 14, t: 12, b: 26 } });
      p.grid({ xStep: 0.25 });
      for (let k = 1; k < n; k++) p.fn((x) => fam.fn(k, x), alpha(P.ink3, 0.25), 1, { samples: 400 });
      p.fillUnder((x) => fam.fn(n, x), alpha(P.accent, 0.12), 0, 1);
      p.fn((x) => fam.fn(n, x), P.accent, 2.5, { samples: 800 });
      // the pointwise limit
      if (fam.id === 'pow') {
        p.line(0, 0, 1, 0, P.good, 3);
        p.dot(1, 0, 5, P.surface, P.good, 2);
        p.dot(1, 1, 5, P.good, P.surface, 2);
      } else p.line(0, 0, 1, 0, P.good, 3);
      p.text(`f_${n}`, 0.02, p.yMax, P.accent, { dy: 10, font: `700 12px ${P.fontMono}` });
    },
    [P, fam, n],
    { aspect: 1.6, maxHeight: 380 },
  );

  return (
    <Figure
      no={1}
      title="함수열의 점별 극한"
      hint="함수열을 고르고 n을 키워 보세요"
      caption={
        <>
          회색 곡선이 <M>{'f_1, \\dots, f_{n-1}'}</M>, 파란 곡선과 연한 파란 넓이가 <M>{'f_n'}</M>과 그 적분, 초록 선이 점별 극한 f입니다. xⁿ의 극한은 x &lt; 1에서 0, x = 1에서 1이라 x = 1에 채운 점과 빈 점을 찍었습니다. 적분은 정확한 공식으로 계산합니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={setId} options={FAMILIES.map((f) => ({ value: f.id, label: <M>{f.tex}</M> }))} />
        <Slider id="uc-n1" label="n" value={n} min={1} max={30} step={1} onChange={setN} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${fam.label} 함수열의 n = ${n}번째 함수와 점별 극한을 [0, 1]에서 그렸습니다. 극한과의 최대 차이는 ${n4(sup)}, f_n의 적분은 ${n4(intN)}, 극한의 적분은 ${fam.intLim}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label={<M>{`\\sup |f_{${n}} - f|`}</M>} value={<span className="mono">{n4(sup)}</span>} color="var(--bad)" />
        <Readout label={<M>{`\\int_0^1 f_{${n}}`}</M>} value={<span className="mono">{n4(intN)}</span>} color="var(--accent)" />
        <Readout label={<M>{'\\int_0^1 f'}</M>} value={<span className="mono">{fam.intLim}</span>} color="var(--good)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the ε band, and the N each point needs ─────────────── */

function BandFigure() {
  const P = usePalette();
  const [r, setR] = useState<1 | 0.9>(1);
  const [eps, setEps] = useState(0.1);
  const [n, setN] = useState(10);
  const sup = r === 1 ? 1 : Math.pow(r, n);
  const uniN = powUniformN(r, eps);
  const inside = sup < eps;
  const xOut = Math.pow(eps, 1 / n); // xⁿ ≥ ε from here on

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const top = h * 0.58;
      const p = new Plot(ctx, w, top, P, { xMin: 0, xMax: 1, yMin: -0.6, yMax: 1.1, pad: { l: 44, r: 14, t: 12, b: 24 } });
      p.grid({ xStep: 0.25, yStep: 0.5 });
      // the band around the limit 0 on [0, r)
      ctx.fillStyle = alpha(P.good, 0.14);
      ctx.fillRect(p.X(0), p.Y(eps), p.X(r) - p.X(0), p.Y(-eps) - p.Y(eps));
      p.line(0, eps, r, eps, P.good, 1.2, [5, 4]);
      p.line(0, -eps, r, -eps, P.good, 1.2, [5, 4]);
      if (r < 1) {
        ctx.fillStyle = alpha(P.ink3, 0.12);
        ctx.fillRect(p.X(r), p.pad.t, p.X(1) - p.X(r), p.ph);
      }
      // f_n, red where it leaves the band
      const N = 600;
      for (let i = 0; i < N; i++) {
        const x0 = (r * i) / N, x1 = (r * (i + 1)) / N;
        const out = Math.pow((x0 + x1) / 2, n) >= eps;
        p.line(x0, Math.pow(x0, n), x1, Math.pow(x1, n), out ? P.bad : P.accent, 3);
      }
      if (r < 1) p.fn((x) => Math.pow(x, n), alpha(P.ink3, 0.6), 1.5, { from: r, to: 1 });
      p.text(`xⁿ, n = ${n}`, 0.02, 1.0, P.accent, { dy: 4, font: `700 12px ${P.fontMono}` });
      // below: the N each x needs, on a log scale
      ctx.save();
      ctx.translate(0, top);
      const LMAX = 4;
      const q = new Plot(ctx, w, h - top, P, { xMin: 0, xMax: 1, yMin: 0, yMax: LMAX, pad: { l: 44, r: 14, t: 10, b: 24 } });
      gridXY(q, 0.25, 1, (v) => String(+v.toFixed(2)), (v) => String(Math.pow(10, Math.round(v))));
      q.fn((x) => (x <= r ? Math.log10(Math.min(powN(x, eps), 1e6)) : NaN), P.pos, 2, { samples: 800 });
      q.line(0, Math.log10(n), 1, Math.log10(n), P.accent, 1.5, [5, 4]);
      q.text(`지금 n = ${n}`, 1, Math.log10(n), P.accent, { align: 'right', dx: -4, dy: -9, font: `600 11px ${P.fontMono}`, bg: P.surface });
      q.text('점 x마다 필요한 N(x)', 0.01, LMAX, P.ink3, { dy: 8, font: `600 11px ${P.fontBody}` });
      ctx.restore();
    },
    [P, r, eps, n],
    { aspect: 1.25, maxHeight: 480 },
  );

  const verdict = inside
    ? `통과. [0, ${r}]의 모든 x에서 |xⁿ − 0| < ε입니다. 최대 차이는 ${n4(sup)}입니다.`
    : r === 1
      ? `실패. x > ${xOut.toFixed(4)}인 점에서 xⁿ ≥ ε라 띠를 벗어납니다. x를 1에 가깝게 잡으면 언제나 벗어나는 점이 있어, 어떤 n으로도 통과할 수 없습니다.`
      : `실패. x > ${xOut.toFixed(4)}인 점이 띠를 벗어납니다. n을 ${uniN} 이상으로 키우면 구간 전체가 띠 안에 들어옵니다.`;

  return (
    <Figure
      no={2}
      title="ε 띠 안에 한꺼번에 들어오는가"
      hint="ε를 정하고 n을 키워 보세요"
      caption={
        <>
          위: 초록 띠는 극한 0에서 ε 이내인 곳입니다. <M>{'f_n(x) = x^n'}</M>이 띠를 벗어난 부분은 빨갛게 칠했습니다. 아래: 각 점 x에서 "n ≥ N이면 <M>{'x^n < \\varepsilon'}</M>"이 되는 가장 작은 N, 곧 <M>{'N(x) = \\lceil \\ln\\varepsilon / \\ln x \\rceil'}</M>를 로그 눈금으로 그렸습니다. 파란 점선(지금의 n)보다 위에 있는 점들이 위 그림에서 띠를 벗어난 점입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={r} onChange={setR} options={[{ value: 1, label: '구간 [0, 1)' }, { value: 0.9, label: '구간 [0, 0.9]' }]} />
        <Slider id="uc-eps" label="ε" value={eps} min={0.02} max={0.5} step={0.01} onChange={setEps} format={(v) => v.toFixed(2)} color="var(--good)" />
        <Slider id="uc-n2" label="n" value={n} min={1} max={60} step={1} onChange={setN} color="var(--accent)" />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`xⁿ, n = ${n}, ε = ${eps.toFixed(2)}, 구간 [0, ${r}]. ${verdict}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label="구간에서 최대 차이" value={<span className="mono">{n4(sup)}</span>} color={inside ? 'var(--good)' : 'var(--bad)'} />
        <Readout label="N(0.99)" value={<span className="mono">{powN(0.99, eps)}</span>} />
        <Readout label="구간 전체에 통하는 N" value={<span className="mono">{isFinite(uniN) ? uniN : '없음 (∞)'}</span>} />
      </div>
      <div className="an-note uc-verdict" data-good={inside || undefined} data-bad={!inside || undefined} aria-live="polite">
        {verdict}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the M-test on the geometric series ─────────────── */

function MTestFigure() {
  const P = usePalette();
  const [r, setR] = useState(0.8);
  const [N, setN] = useState(10);
  const sup = geomSupError(r, N);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const top = h * 0.58;
      const p = new Plot(ctx, w, top, P, { xMin: -1, xMax: 1, yMin: 0, yMax: 6, pad: { l: 40, r: 14, t: 12, b: 24 } });
      p.grid({ xStep: 0.5, yStep: 2 });
      ctx.fillStyle = alpha(P.good, 0.1);
      ctx.fillRect(p.X(-r), p.pad.t, p.X(r) - p.X(-r), p.ph);
      p.fn((x) => 1 / (1 - x), P.ink, 2, { from: -1, to: 0.995 });
      p.fn((x) => geomPartial(x, N), P.accent, 2.5, { from: -1, to: 1 });
      p.text('1/(1−x)', 0.86, 5.6, P.ink, { align: 'right', font: `600 11px ${P.fontMono}`, bg: P.surface });
      p.text(`S_${N}`, -0.98, geomPartial(-0.98, N), P.accent, { dy: -12, font: `700 12px ${P.fontMono}`, bg: P.surface });
      ctx.save();
      ctx.translate(0, top);
      const yTop = Math.max(1e-6, sup * 1.25);
      const q = new Plot(ctx, w, h - top, P, { xMin: -1, xMax: 1, yMin: 0, yMax: yTop, pad: { l: 40, r: 14, t: 10, b: 24 } });
      q.grid({ xStep: 0.5, yStep: yTop / 2, fmt: (v) => String(+v.toPrecision(2)) });
      q.fn((x) => Math.abs(1 / (1 - x) - geomPartial(x, N)), P.bad, 2, { from: -r, to: r, samples: 500 });
      q.line(-1, sup, 1, sup, alpha(P.bad, 0.6), 1, [5, 4]);
      q.dot(r, sup, 4.5, P.bad, P.surface, 2);
      q.text('[−r, r]에서의 오차', -0.98, yTop, P.ink3, { dy: 8, font: `600 11px ${P.fontBody}` });
      ctx.restore();
    },
    [P, r, N, sup],
    { aspect: 1.3, maxHeight: 460 },
  );

  return (
    <Figure
      no={3}
      title="바이어슈트라스 M-판정: 등비급수"
      hint="r을 1에 가깝게 밀어 보세요"
      caption={
        <>
          위: 검은 곡선(어두운 테마에서는 흰 곡선)이 <M>{'1/(1-x)'}</M>, 파란 곡선이 부분합 <M>{'S_N(x) = 1 + x + \\dots + x^N'}</M>, 초록 띠가 구간 [−r, r]입니다. 아래: 그 구간에서의 오차 <M>{'|1/(1-x) - S_N(x)|'}</M>와, 그 최댓값(점선)입니다. 최댓값은 언제나 오른쪽 끝 x = r에서 나옵니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="uc-r" label="r" value={r} min={0.1} max={0.98} step={0.01} onChange={setR} format={(v) => v.toFixed(2)} color="var(--good)" />
        <Slider id="uc-N" label="N" value={N} min={0} max={40} step={1} onChange={setN} color="var(--accent)" />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`등비급수의 부분합 S_${N}을 구간 [−${r.toFixed(2)}, ${r.toFixed(2)}]에서 1/(1−x)와 비교합니다. 구간에서의 최대 오차는 ${sup.toPrecision(4)}이고 M-판정의 꼬리 합과 같습니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label="[−r, r]에서 최대 오차" value={<span className="mono">{sup.toPrecision(4)}</span>} color="var(--bad)" />
        <Readout label={<M>{'\\sum_{k>N} r^k'}</M>} value={<span className="mono">{sup.toPrecision(4)}</span>} />
        <Readout label="(−1, 1) 전체에서" value={<span className="mono">∞</span>} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: Gibbs overshoot ─────────────── */

function GibbsFigure() {
  const P = usePalette();
  const [N, setN] = useState(19);
  const [zoom, setZoom] = useState(false);
  const pk = useMemo(() => gibbsPeak(N), [N]);
  const overshoot = ((pk.y - 1) / 2) * 100;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const xr = zoom ? 0.8 : Math.PI;
      const p = new Plot(ctx, w, h, P, { xMin: -xr, xMax: xr, yMin: -1.45, yMax: 1.45, pad: { l: 40, r: 14, t: 12, b: 26 } });
      p.grid({ xStep: zoom ? 0.2 : 1, yStep: 0.5 });
      p.line(-xr, 1.17898, xr, 1.17898, alpha(P.bad, 0.55), 1, [5, 4]);
      p.line(-xr, -1, 0, -1, P.ink, 2);
      p.line(0, 1, xr, 1, P.ink, 2);
      p.fn((x) => squareSum(x, N), P.accent, 2, { samples: 2000 });
      p.dot(pk.x, pk.y, 5, P.bad, P.surface, 2);
      p.text(`${pk.y.toFixed(5)}`, pk.x, pk.y, P.bad, { dx: 8, dy: -10, font: `600 11px ${P.fontMono}`, bg: P.surface });
      p.text('1.17898…', xr, 1.17898, P.bad, { align: 'right', dx: -4, dy: 9, font: `500 10px ${P.fontMono}` });
    },
    [P, N, zoom, pk],
    { aspect: 1.8, maxHeight: 340 },
  );

  return (
    <Figure
      no={4}
      title="깁스 현상: 점프 근처의 솟구침"
      hint="N을 키워도 봉우리는 낮아지지 않습니다"
      caption={
        <>
          검은 선(어두운 테마에서는 흰 선)이 −π에서 π까지의 사각파(음수 쪽 −1, 양수 쪽 +1), 파란 곡선이 푸리에 부분합 <M>{'S_N(x) = \\frac{4}{\\pi}\\sum_{k \\text{ odd} \\le N} \\frac{\\sin kx}{k}'}</M>입니다. 빨간 점이 0 오른쪽의 첫 봉우리이고, 빨간 점선은 N → ∞일 때 봉우리 높이의 극한입니다. 봉우리는 (0, π/2) 구간을 6,000개 점으로 훑어서 찾습니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="uc-gN" label="N (홀수)" value={N} min={1} max={199} step={2} onChange={setN} />
        <Check label="점프 근처 확대" checked={zoom} onChange={setZoom} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`사각파의 푸리에 부분합 S_${N}. 0 오른쪽의 첫 봉우리는 x = ${pk.x.toFixed(4)}에서 높이 ${pk.y.toFixed(5)}로, 점프 크기 2의 ${overshoot.toFixed(2)}%만큼 위로 솟습니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <Readout label="봉우리 높이" value={<span className="mono">{pk.y.toFixed(5)}</span>} color="var(--bad)" />
        <Readout label="점프 대비 솟구침" value={<span className="mono">{overshoot.toFixed(2)}%</span>} />
        <Readout label="봉우리 위치" value={<span className="mono">{pk.x.toFixed(4)}</span>} />
        <Readout label="π / (N+1)" value={<span className="mono">{(Math.PI / (N + 1)).toFixed(4)}</span>} />
      </div>
      <Legend
        items={[
          { color: 'var(--ink)', label: '사각파', shape: 'ln' },
          { color: 'var(--accent)', label: '부분합', shape: 'ln' },
          { color: 'var(--bad)', label: '첫 봉우리', shape: 'dot' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function UniformConvergence() {
  return (
    <>
      <h2>함수들의 극한</h2>
      <p>
        <a href={lessonHref('math-analysis', 'sequences')}>수열의 수렴</a>에서는 수 하나하나의 열을 다뤘습니다. 이번에는 항마다 함수인 열 <M>{'f_1, f_2, f_3, \\dots'}</M>를 다룹니다. 테일러 급수의 부분합, 푸리에 급수의 부분합, 반복 계산으로 얻는 근사 해가 모두 이런 함수열입니다. 가장 자연스러운 수렴의 정의는 점마다 따로 수렴하는 것입니다.
      </p>
      <MB note="점별 수렴 (pointwise convergence): 각 x마다 수열 f_n(x)가 f(x)로 수렴한다.">{`\\forall x\\ \\forall \\varepsilon > 0\\ \\exists N\\ \\forall n \\ge N:\\ |f_n(x) - f(x)| < \\varepsilon`}</MB>
      <p>
        그런데 이 정의로는 극한이 원래 함수들의 좋은 성질을 물려받지 못합니다. 그림 1의 세 함수열을 보세요.
      </p>
      <FamiliesFigure />
      <p>
        <strong>xⁿ</strong>은 모두 연속이지만 극한은 x &lt; 1에서 0, x = 1에서 1이라 연속이 아닙니다. <strong>솟는 봉우리</strong> <M>{'2n^2 x e^{-n^2x^2}'}</M>는 각 x에서 0으로 가지만(x를 고정하면 지수 인자가 이깁니다), 적분은 <M>{'1 - e^{-n^2}'}</M>로 n = 10이면 사실상 1입니다. 극한의 적분은 0인데 적분의 극한은 1이라, 극한과 적분의 순서를 바꿀 수 없습니다. 봉우리는 폭이 좁아지는 대신 높아져, n = 10에서 그 높이가 <M>{'\\sqrt{2}\\,n\\,e^{-1/2} \\approx 8.58'}</M>입니다. 반면 <strong>x / n</strong>은 모든 점에서 한꺼번에 줄어들고, 위의 문제가 하나도 생기지 않습니다.
      </p>

      <h2>한꺼번에 수렴하기: 균등 수렴</h2>
      <p>
        점별 수렴의 정의에서 N은 ε뿐 아니라 x에도 따라 달라질 수 있습니다. 모든 x에 한 번에 통하는 N을 요구하면 <T en="uniform convergence">균등 수렴</T>이 됩니다. 양화사 <M>{'\\forall x'}</M>의 자리를 N 뒤로 옮긴 것뿐인데 뜻이 크게 달라집니다.
      </p>
      <MB note="균등 수렴: 모든 x에서 동시에 f_n이 f의 ε 띠 안에 들어온다. 최대 차이(상한 노름)가 0으로 가는 것과 같습니다.">{`\\forall \\varepsilon > 0\\ \\exists N\\ \\forall n \\ge N\\ \\forall x:\\ |f_n(x) - f(x)| < \\varepsilon \\iff \\sup_x |f_n(x) - f(x)| \\to 0`}</MB>
      <BandFigure />
      <p>
        ε = 0.1일 때 x = 0.5에서는 n ≥ 4, x = 0.9에서는 n ≥ 22, x = 0.99에서는 n ≥ 230이면 됩니다. x가 1에 가까워질수록 필요한 N이 끝없이 커지므로, 구간 [0, 1) 전체에 통하는 N은 없습니다. 실제로 <M>{'\\sup_{0 \\le x < 1} x^n = 1'}</M>이 n과 상관없이 1이라 0으로 가지 않습니다. 기본 설정 n = 10에서는 <M>{'x > 0.1^{1/10} = 0.7943'}</M>인 점이 모두 띠 밖에 있습니다. 구간을 [0, 0.9]로 줄이면 사정이 달라집니다. 가장 나쁜 점이 x = 0.9로 정해지므로 n ≥ 22면 구간 전체가 띠 안에 들어오고, 상한 노름 <M>{'0.9^n'}</M>은 0으로 갑니다. 같은 함수열도 구간에 따라 균등 수렴하기도, 하지 않기도 합니다.
      </p>

      <h2>균등 수렴이 지켜 주는 것</h2>
      <Proof title="정리. 연속 함수 fₙ이 f로 균등 수렴하면 f도 연속이다.">
        <p>
          점 a와 ε &gt; 0이 주어졌다고 합시다. 균등 수렴이므로 모든 x에서 <M>{'|f_N(x) - f(x)| < \\varepsilon/3'}</M>인 N을 하나 고를 수 있습니다. <M>{'f_N'}</M>은 a에서 연속이므로 <M>{'|x - a| < \\delta'}</M>이면 <M>{'|f_N(x) - f_N(a)| < \\varepsilon/3'}</M>인 δ가 있습니다. 그러면 <M>{'|x-a| < \\delta'}</M>일 때
        </p>
        <MB>{`|f(x) - f(a)| \\le |f(x) - f_N(x)| + |f_N(x) - f_N(a)| + |f_N(a) - f(a)| < \\tfrac{\\varepsilon}{3} + \\tfrac{\\varepsilon}{3} + \\tfrac{\\varepsilon}{3} = \\varepsilon`}</MB>
        <p>
          입니다. 첫 항과 셋째 항을 같은 N 하나로 누를 수 있는 것은 그 N이 x와 a 모두에 통하기 때문이고, 이것이 균등 수렴을 쓴 자리입니다. 점별 수렴이라면 x마다 다른 N이 필요해 이 논증이 막힙니다. <Qed />
        </p>
      </Proof>
      <p>
        그래서 xⁿ의 극한이 연속이 아니라는 사실만으로도 [0, 1]에서 균등 수렴이 아님을 알 수 있습니다. 적분도 마찬가지입니다. [a, b]에서 균등 수렴하면
      </p>
      <MB>{`\\left| \\int_a^b f_n - \\int_a^b f \\right| \\le \\int_a^b |f_n - f| \\le (b-a) \\sup_x |f_n(x) - f(x)| \\to 0`}</MB>
      <p>
        이므로 극한과 적분의 순서를 바꿀 수 있습니다. 솟는 봉우리는 상한 노름이 8.58, 25.7처럼 오히려 커지므로 이 정리의 가정을 만족하지 않고, 그래서 적분이 극한과 어긋났던 것입니다. 미분은 더 까다로워서, <M>{'f_n'}</M>뿐 아니라 <M>{"f_n'"}</M>이 균등 수렴해야 <M>{"(\\lim f_n)' = \\lim f_n'"}</M>을 쓸 수 있습니다.
      </p>
      <Callout kind="intuition">
        균등 수렴은 함수의 그래프를 감싸는 ε 띠를 그렸을 때, n이 충분히 크면 f_n의 그래프 <strong>전체가</strong> 띠 안에 들어온다는 뜻입니다. 점별 수렴은 그래프 위의 점 하나하나가 언젠가 띠 안에 들어온다는 것뿐이라, 늦게 들어오는 점이 언제나 남아 있을 수 있습니다.
      </Callout>

      <h2>바이어슈트라스 M-판정과 멱급수</h2>
      <p>함수의 급수 <M>{'\\sum u_k(x)'}</M>가 균등 수렴하는지 확인하는 가장 쓸모 있는 도구는 각 항을 수로 누르는 것입니다.</p>
      <Proof title="바이어슈트라스 M-판정. 모든 x에서 |uₖ(x)| ≤ Mₖ이고 ΣMₖ가 수렴하면, Σuₖ는 균등 수렴한다.">
        <p>
          n &gt; m이면 모든 x에서 <M>{'|S_n(x) - S_m(x)| \\le \\sum_{k=m+1}^{n} M_k'}</M>입니다. 오른쪽은 x와 상관없고, <M>{'\\sum M_k'}</M>가 수렴하므로 m, n이 커지면 0으로 갑니다. 따라서 부분합은 모든 x에서 한꺼번에 코시 수열이 되어 어떤 f로 수렴하고, n → ∞로 보내면 <M>{'|f(x) - S_m(x)| \\le \\sum_{k > m} M_k'}</M>가 모든 x에 대해 성립합니다. <Qed />
        </p>
      </Proof>
      <p>
        등비급수 <M>{'\\sum x^k = 1/(1-x)'}</M>는 (−1, 1)의 모든 점에서 수렴하지만, 1에 가까운 x에서 오차가 한없이 커지므로 (−1, 1) 전체에서 균등 수렴하지는 않습니다. 구간을 [−r, r]로 줄이면 <M>{'|x^k| \\le r^k'}</M>이고 <M>{'\\sum r^k'}</M>가 수렴하므로 M-판정에 의해 균등 수렴합니다.
      </p>
      <MTestFigure />
      <p>
        r = 0.8, N = 10에서 [−0.8, 0.8]의 최대 오차는 <M>{'0.8^{11}/0.2 = 0.4295'}</M>로, M-판정이 주는 꼬리 합과 정확히 같습니다. N을 20으로 올리면 0.0461로 줄어듭니다. r을 0.95로 밀면 같은 N = 10에서도 오차가 11.38로 커지고, N = 50까지 가야 1.46입니다. 모든 멱급수가 이렇습니다. 수렴 반지름이 R이면 R보다 작은 모든 닫힌 구간에서 균등 수렴하므로, 그 안에서는 극한이 연속이고, 항별로 적분하고 미분할 수 있습니다. <a href={lessonHref('math-calculus', 'series')}>미적분학</a>에서 테일러 급수를 항별로 미분하고 적분해도 됐던 이유가 여기에 있습니다.
      </p>

      <h2>균등하지 않은 수렴: 깁스 현상</h2>
      <p>
        연속 함수들의 균등 극한은 연속이므로, 불연속 함수를 연속 함수의 급수로 나타내면 그 수렴은 균등할 수 없습니다. 푸리에 급수가 대표적인 예입니다. 사각파는 0에서 −1에서 +1로 뛰는데, 그 푸리에 부분합은 모두 연속입니다.
      </p>
      <GibbsFigure />
      <p>
        N = 19일 때 첫 봉우리는 x = 0.1571에서 높이 1.17981로, 점프 크기 2의 8.99%만큼 위로 솟습니다. N을 199까지 올려도 봉우리는 x = 0.0157로 점프 쪽에 다가갈 뿐, 높이는 1.17899로 거의 그대로입니다. 봉우리 높이의 극한은 <M>{'\\frac{2}{\\pi}\\int_0^{\\pi} \\frac{\\sin t}{t}\\,dt \\approx 1.17898'}</M>, 곧 점프의 약 8.95%입니다. 0이 아닌 각 x에서 <M>{'S_N(x)'}</M>는 사각파의 값으로 수렴하지만, 봉우리가 사라지지 않고 점프 옆으로 몰려갈 뿐이라 상한 노름은 0으로 가지 않습니다. 디지털 이미지를 압축했을 때 선명한 가장자리 옆에 생기는 물결무늬가 이 현상입니다.
      </p>

      <Callout kind="key">
        점별 수렴은 x마다 따로 N을 고르고, 균등 수렴은 모든 x에 통하는 N 하나를 고릅니다. 균등 수렴은 상한 노름이 0으로 가는 것과 같고, 연속 함수의 균등 극한은 연속이며(ε/3 논법), 극한과 적분의 순서를 바꿀 수 있습니다. 바이어슈트라스 M-판정은 각 항을 수렴하는 수열로 눌러 균등 수렴을 보이고, 이로부터 멱급수는 수렴 반지름 안의 닫힌 구간에서 균등 수렴합니다. 불연속 함수로의 수렴인 xⁿ이나 푸리에 급수의 깁스 현상은 균등하지 않은 수렴의 예입니다.
      </Callout>
      <Quiz
        q="연속 함수 gₙ이 [0, 1]의 모든 점에서 g로 수렴하고, g는 x = 1/2에서 불연속이다. 무엇을 결론 내릴 수 있는가?"
        options={['gₙ은 [0, 1]에서 g로 균등 수렴한다', 'gₙ은 [0, 1]에서 g로 균등 수렴하지 않는다', '∫gₙ은 반드시 ∫g로 수렴하지 않는다', 'gₙ의 상한 노름은 무한대로 발산한다']}
        answer={1}
        explain={
          <>
            연속 함수의 균등 극한은 연속입니다. g가 불연속이므로 수렴이 균등할 수 없습니다(대우). 적분에 대해서는 아무것도 말할 수 없습니다. xⁿ처럼 균등하지 않아도 적분은 극한의 적분으로 수렴할 수 있습니다(1/(n+1) → 0). 상한 노름이 발산할 필요도 없어서, xⁿ의 경우 <M>{'\\sup|x^n - f|'}</M>은 1에 머뭅니다.
          </>
        }
      />
    </>
  );
}
