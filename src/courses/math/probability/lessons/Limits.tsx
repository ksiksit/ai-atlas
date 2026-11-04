import { useMemo, useState } from 'react';
import { Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { binomialPmf, normalInv, rng } from '../../../../lib/math';
import { lessonHref } from '../../../index';
import { Reroll, polyline, ticks, useMathColors } from './parts';
import { logFactorials, pct, prob, sup } from './prob';
import './probability.css';

/* ─────────────── Figure 1: running averages ─────────────── */

type Src = 'coin' | 'die' | 'lottery';
const SOURCES: Record<Src, { label: string; mu: number; sigma: number; draw: (r: () => number) => number; y: [number, number]; note: string }> = {
  coin: { label: '동전 (앞면=1)', mu: 0.5, sigma: 0.5, draw: (r) => (r() < 0.5 ? 1 : 0), y: [0, 1], note: '앞면이면 1, 뒷면이면 0. 평균은 앞면 비율입니다.' },
  die: { label: '주사위', mu: 3.5, sigma: Math.sqrt(35 / 12), draw: (r) => 1 + Math.floor(r() * 6), y: [1, 6], note: '눈의 평균 3.5로 모입니다.' },
  lottery: { label: '복권', mu: 1, sigma: Math.sqrt(1000 * 1000 * 0.001 - 1), draw: (r) => (r() < 0.001 ? 1000 : 0), y: [0, 6], note: '1000분의 1 확률로 1000을 받고 나머지는 0. 기댓값은 1이지만 분산이 커서 아주 천천히 모입니다.' },
};
const NMAX = 5000;
const CHECKPOINTS = (() => {
  const out: number[] = [];
  for (let i = 0; i <= 260; i++) {
    const n = Math.round(Math.exp((Math.log(NMAX) * i) / 260));
    if (!out.length || n > out[out.length - 1]) out.push(n);
  }
  return out;
})();

function LlnFigure() {
  const P = usePalette();
  const [c1, c2, c3] = useMathColors(P);
  const [src, setSrc] = useState<Src>('coin');
  const [k, setK] = useState(12);
  const [seed, setSeed] = useState(1);
  const S = SOURCES[src];

  const paths = useMemo(() => {
    const r = rng(seed * 9157 + (src === 'coin' ? 1 : src === 'die' ? 2 : 3));
    return Array.from({ length: k }, () => {
      const ys: number[] = [];
      let sum = 0;
      let j = 0;
      for (let n = 1; n <= NMAX; n++) {
        sum += S.draw(r);
        if (CHECKPOINTS[j] === n) {
          ys.push(sum / n);
          j++;
        }
      }
      return ys;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, k, seed]);
  const ends = paths.map((p) => p[p.length - 1]);
  const lo = Math.min(...ends);
  const hi = Math.max(...ends);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const L = Math.log10;
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: L(NMAX), yMin: S.y[0], yMax: S.y[1], pad: { l: 40, r: 14, t: 12, b: 28 } });
      const yStep = src === 'coin' ? 0.25 : 1;
      plot.grid({ xStep: 1, yStep, labels: false, xLabel: '던진 횟수 n (로그 눈금)' });
      const yt: [number, string][] = [];
      for (let y = S.y[0]; y <= S.y[1] + 1e-9; y += yStep) yt.push([y, String(y)]);
      ticks(plot, P, [0, 1, 2, 3].map((e) => [e, String(10 ** e)] as [number, string]), yt);
      // envelope μ ± 2σ/√n
      const xs = CHECKPOINTS.map((n) => L(n));
      const up = CHECKPOINTS.map((n) => S.mu + (2 * S.sigma) / Math.sqrt(n));
      const dn = CHECKPOINTS.map((n) => S.mu - (2 * S.sigma) / Math.sqrt(n));
      ctx.save();
      ctx.beginPath();
      ctx.rect(plot.pad.l, plot.pad.t, plot.pw, plot.ph);
      ctx.clip();
      ctx.fillStyle = alpha(c2, 0.12);
      ctx.beginPath();
      xs.forEach((x, i) => (i ? ctx.lineTo(plot.X(x), plot.Y(up[i])) : ctx.moveTo(plot.X(x), plot.Y(up[i]))));
      for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(plot.X(xs[i]), plot.Y(dn[i]));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      polyline(plot, xs, up, alpha(c2, 0.6), 1, [4, 3]);
      polyline(plot, xs, dn, alpha(c2, 0.6), 1, [4, 3]);
      paths.forEach((p, i) => polyline(plot, xs, p, alpha(c1, i === 0 ? 0.95 : 0.4), i === 0 ? 2 : 1.2));
      plot.line(0, S.mu, L(NMAX), S.mu, c3, 1.8);
      plot.text(`μ = ${S.mu}`, L(NMAX), S.mu, c3, { align: 'right', dy: -11, bg: alpha(P.surface, 0.85) });
    },
    [P, c1, c2, c3, paths, src],
    { aspect: 2.1, maxHeight: 340, minHeight: 240 },
  );

  return (
    <Figure
      no={1}
      title="평균은 기댓값으로 모인다"
      hint="경로 수와 무작위 원천을 바꿔 보세요"
      caption={<>선 하나가 실험 하나입니다. n번째까지 나온 값의 평균을 n에 따라 그렸고, 가로축은 로그 눈금이라 1, 10, 100, 1000이 같은 간격입니다. 띠는 μ ± 2σ/√n입니다. 띠가 √n에 반비례해 좁아지고, 대부분의 경로가 그 안에 머뭅니다.</>}
    >
      <div className="controls row">
        <Seg label="무작위 원천" value={src} onChange={setSrc} options={(Object.keys(SOURCES) as Src[]).map((s) => ({ value: s, label: SOURCES[s].label }))} />
        <Slider id="lln-k" label="실험(경로) 수" value={k} min={1} max={30} step={1} onChange={setK} />
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Reroll onClick={() => setSeed((s) => s + 1)} />
        </div>
      </div>
      <div className="pr-note">{S.note}</div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${S.label}의 누적 평균 경로 ${k}개. ${NMAX}번 뒤 평균은 ${lo.toFixed(3)}에서 ${hi.toFixed(3)} 사이이고, 기댓값은 ${S.mu}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <Readout label="기댓값 μ" value={String(S.mu)} color="var(--c-math-3)" />
        <Readout label="표준편차 σ" value={S.sigma.toFixed(2)} />
        <Readout label={`n = ${NMAX}에서 평균의 범위`} value={`${lo.toFixed(3)} ~ ${hi.toFixed(3)}`} color="var(--c-math-1)" />
        <Readout label={`2σ/√n (n = ${NMAX})`} value={((2 * S.sigma) / Math.sqrt(NMAX)).toFixed(3)} color="var(--c-math-2)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: three bounds against the true tail ─────────────── */

/** log10 P(X ≥ k) for X ~ Bin(n, 1/2), for every k = 0..n. */
function log10Tails(n: number): number[] {
  const lf = logFactorials(n);
  const lp = Array.from({ length: n + 1 }, (_, k) => lf[n] - lf[k] - lf[n - k] - n * Math.LN2);
  const out = new Array(n + 1).fill(0);
  let acc = -Infinity; // natural-log running sum from the top
  for (let k = n; k >= 0; k--) {
    const m = Math.max(acc, lp[k]);
    acc = m + Math.log(Math.exp(acc - m) + Math.exp(lp[k] - m));
    out[k] = Math.min(0, acc / Math.LN10);
  }
  return out;
}
const markov = (a: number) => Math.min(1, 0.5 / a);
const cheb = (n: number, a: number) => (a <= 0.5 ? 1 : Math.min(1, 1 / (4 * n * (a - 0.5) ** 2)));
const chern = (n: number, a: number) => (a <= 0.5 ? 1 : Math.exp(-2 * n * (a - 0.5) ** 2));

function BoundsFigure() {
  const P = usePalette();
  const [c1, c2, c3] = useMathColors(P);
  const [n, setN] = useState(100);
  const [a, setA] = useState(0.6);
  const tails = useMemo(() => log10Tails(n), [n]);
  const exactAt = (x: number) => tails[Math.min(n, Math.ceil(x * n - 1e-9))];
  const yMin = -Math.min(50, Math.max(8, Math.ceil(0.15 * n) + 2));
  const L = Math.log10;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 0.5, xMax: 1, yMin, yMax: 0.3, pad: { l: 48, r: 14, t: 12, b: 28 } });
      const ystep = yMin < -30 ? 10 : yMin < -14 ? 4 : 2;
      plot.grid({ xStep: 0.1, yStep: ystep, axes: false, fmt: (v) => (v > 0.4 && v <= 1.0001 ? `${Math.round(v * 100)}%` : v === 0 ? '1' : `10${sup(Math.round(v))}`) });
      const xs = Array.from({ length: 241 }, (_, i) => 0.5 + (0.5 * i) / 240);
      polyline(plot, xs, xs.map((x) => L(markov(x))), c3, 2.2);
      polyline(plot, xs, xs.map((x) => L(cheb(n, x))), c2, 2.2);
      polyline(plot, xs, xs.map((x) => L(chern(n, x))), c1, 2.2);
      // exact: a step function
      const ex: number[] = [];
      const ey: number[] = [];
      for (let k = Math.ceil(n / 2); k <= n; k++) {
        ex.push((k - 1) / n, k / n);
        ey.push(tails[k], tails[k]);
      }
      polyline(plot, ex, ey, P.ink, 2.4);
      plot.line(a, yMin, a, 0.3, alpha(P.ink, 0.35), 1, [4, 3]);
      plot.dot(a, Math.max(yMin, exactAt(a)), 5, P.ink, P.surface, 2);
      plot.text(`앞면 비율 ≥ ${Math.round(a * 100)}%`, a, yMin, P.ink2, { align: a > 0.8 ? 'right' : 'left', dx: a > 0.8 ? -6 : 6, dy: -10, font: `500 11px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
    },
    [P, c1, c2, c3, n, a, tails, yMin],
    { aspect: 1.9, maxHeight: 360, minHeight: 260 },
  );

  const ea = Math.pow(10, exactAt(a));
  return (
    <Figure
      no={2}
      title="꼬리 확률과 세 가지 경계"
      hint="던진 횟수 n과 기준 비율을 바꿔 보세요"
      caption={<>공정한 동전을 n번 던져 앞면 비율이 가로축 값 이상일 확률을 세로축에 로그 눈금으로 그렸습니다(검은 계단이 정확한 값). 세 곡선은 모두 그 확률보다 위에 있는 상한입니다. 마르코프는 n이 늘어도 꿈쩍하지 않고, 체비쇼프는 1/n로, 체르노프는 n에 대해 지수적으로 떨어집니다.</>}
    >
      <div className="controls row">
        <Slider id="bd-n" label="던진 횟수 n" value={n} min={10} max={1000} step={10} onChange={setN} />
        <Slider id="bd-a" label="앞면 비율 기준" value={a} min={0.51} max={0.95} step={0.01} onChange={setA} format={(v) => `${Math.round(v * 100)}% 이상`} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`동전 ${n}번에서 앞면 비율이 ${Math.round(a * 100)}% 이상일 정확한 확률 ${prob(ea)}, 마르코프 경계 ${prob(markov(a))}, 체비쇼프 경계 ${prob(cheb(n, a))}, 체르노프 경계 ${prob(chern(n, a))}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        <Readout label="정확한 값" value={prob(ea)} />
        <Readout label="마르코프" value={prob(markov(a))} color="var(--c-math-3)" />
        <Readout label="체비쇼프" value={prob(cheb(n, a))} color="var(--c-math-2)" />
        <Readout label="체르노프(호에프딩)" value={prob(chern(n, a))} color="var(--c-math-1)" />
      </div>
      <Legend
        items={[
          { color: 'var(--ink)', label: '정확한 확률', shape: 'ln' },
          { color: 'var(--c-math-3)', label: '마르코프', shape: 'ln' },
          { color: 'var(--c-math-2)', label: '체비쇼프', shape: 'ln' },
          { color: 'var(--c-math-1)', label: '체르노프', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: how many samples? ─────────────── */

type Method = 'cheb' | 'hoeff' | 'clt';
const EXPERIMENTS = 1000;

function sampleSizes(eps: number, delta: number): Record<Method, number> {
  return {
    cheb: Math.ceil(1 / (4 * eps * eps * delta)),
    hoeff: Math.ceil(Math.log(2 / delta) / (2 * eps * eps)),
    clt: Math.ceil(normalInv(1 - delta / 2) ** 2 / (4 * eps * eps)),
  };
}
const METHOD_LABEL: Record<Method, string> = { cheb: '체비쇼프', hoeff: '호에프딩', clt: '정규 근사' };

function SampleSizeFigure() {
  const P = usePalette();
  const [c1, c2] = useMathColors(P);
  const [eps, setEps] = useState(0.02);
  const [delta, setDelta] = useState(0.05);
  const [p, setP] = useState(0.3);
  const [method, setMethod] = useState<Method>('hoeff');
  const [seed, setSeed] = useState(1);
  const sizes = sampleSizes(eps, delta);
  const n = sizes[method];

  const est = useMemo(() => {
    // draw Binomial(n, p) by inverting its CDF: one uniform per experiment
    const pmf = binomialPmf(n, p);
    const cdf: number[] = [];
    let s = 0;
    for (const v of pmf) cdf.push((s += v));
    const r = rng(seed * 2027 + n);
    return Array.from({ length: EXPERIMENTS }, () => {
      const u = r() * s;
      let lo = 0;
      let hi = n;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < u) lo = mid + 1;
        else hi = mid;
      }
      return lo / n;
    });
  }, [n, p, seed]);
  const miss = est.filter((x) => Math.abs(x - p) > eps).length / EXPERIMENTS;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const span = Math.max(eps * 2.2, 4 * Math.sqrt((p * (1 - p)) / n));
      const BINS = 40;
      const lo = p - span;
      const bw = (2 * span) / BINS;
      const hc = new Array(BINS).fill(0);
      for (const x of est) {
        const i = Math.floor((x - lo) / bw);
        if (i >= 0 && i < BINS) hc[i]++;
      }
      const yMax = Math.max(...hc) * 1.2 || 1;
      const plot = new Plot(ctx, w, h, P, { xMin: p - span, xMax: p + span, yMin: 0, yMax, pad: { l: 40, r: 14, t: 12, b: 28 } });
      ctx.fillStyle = alpha(c2, 0.1);
      ctx.fillRect(plot.X(p - eps), plot.pad.t, plot.X(p + eps) - plot.X(p - eps), plot.ph);
      plot.grid({ axes: false, fmt: (v) => (v >= 0 && v <= 1 && plot.yMax > 2 && v < 1.0001 && Math.abs(v - Math.round(v)) > 1e-9 ? `${(v * 100).toFixed(1)}%` : String(Math.round(v))) });
      hc.forEach((c, i) => {
        if (!c) return;
        const x = lo + (i + 0.5) * bw;
        const out = Math.abs(x - p) > eps;
        ctx.fillStyle = out ? alpha(c1, 0.85) : alpha(P.ink3, 0.55);
        const l = plot.X(lo + i * bw);
        const r2 = plot.X(lo + (i + 1) * bw);
        ctx.fillRect(l + 0.5, plot.Y(c), r2 - l - 1, plot.Y(0) - plot.Y(c));
      });
      plot.line(p, 0, p, yMax, P.ink, 1.6);
      plot.text(`참값 ${pct(p, 0)}`, p, yMax, P.ink, { dx: 5, dy: 9, font: `600 11px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
      plot.text(`±${pct(eps, 1)}`, p + eps, yMax * 0.75, c2, { dx: 4, font: `600 11px ${P.fontBody}` });
    },
    [P, c1, c2, est, p, eps, n],
    { aspect: 2.2, maxHeight: 300, minHeight: 210 },
  );

  const maxN = Math.max(...Object.values(sizes));
  return (
    <Figure
      no={3}
      title="표본은 몇 개 필요한가"
      hint="허용 오차와 실패 확률을 정하고, 실제로 확인해 보세요"
      caption={<>클릭률 p를 사용자 n명의 클릭 비율 p̂로 추정합니다. 위 막대는 "|p̂ − p| ≤ ε일 확률이 적어도 1 − δ"를 보장하는 데 필요한 n을 세 방법으로 계산한 것입니다. 아래 히스토그램은 고른 n으로 실험을 {EXPERIMENTS.toLocaleString('ko-KR')}번 해서 얻은 p̂들이고, 빨간 막대가 오차 ε를 넘긴 실패입니다.</>}
    >
      <div className="controls row">
        <Slider id="ss-eps" label="허용 오차 ε" value={eps} min={0.01} max={0.1} step={0.005} onChange={setEps} format={(v) => '±' + pct(v, 1)} color="var(--c-math-2)" />
        <Slider id="ss-delta" label="실패 확률 δ" value={delta} min={0.01} max={0.2} step={0.01} onChange={setDelta} format={(v) => pct(v, 0)} color="var(--c-math-1)" />
        <Slider id="ss-p" label="실제 클릭률 p (모르는 값)" value={p} min={0.05} max={0.5} step={0.05} onChange={setP} format={(v) => pct(v, 0)} />
      </div>
      <div className="pr-sizes" role="group" aria-label="필요한 표본 수 비교. 눌러서 실험에 쓸 방법을 고릅니다.">
        {(Object.keys(sizes) as Method[]).map((m) => (
          <button key={m} type="button" className="pr-size" aria-pressed={m === method} onClick={() => setMethod(m)}>
            <span className="pr-size-name">{METHOD_LABEL[m]}</span>
            <span className="pr-size-track">
              <span style={{ width: `${(sizes[m] / maxN) * 100}%` }} />
            </span>
            <span className="pr-size-val mono">{sizes[m].toLocaleString('ko-KR')}명</span>
          </button>
        ))}
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${METHOD_LABEL[method]}으로 정한 n = ${n}명으로 ${EXPERIMENTS}번 실험한 추정값의 히스토그램. 오차 ε를 넘긴 비율 ${pct(miss)}, 허용한 실패 확률 ${pct(delta, 0)}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', flex: '1 1 380px' }}>
          <Readout label="실험에 쓴 n" value={`${n.toLocaleString('ko-KR')}명`} />
          <Readout label="오차가 ε를 넘긴 비율" value={pct(miss)} color={miss <= delta ? 'var(--good)' : 'var(--bad)'} />
          <Readout label="허용한 실패 확률 δ" value={pct(delta, 0)} color="var(--c-math-1)" />
        </div>
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Reroll onClick={() => setSeed((s) => s + 1)} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Limits() {
  return (
    <>
      <h2>많이 모으면 무엇이 확실해지나</h2>
      <p>
        한 번 던진 동전은 예측할 수 없지만, 만 번 던진 동전의 앞면 비율은 거의 확실하게 50% 근처입니다. 무작위를 쓰는 프로그램이 믿을 만한 이유도 같습니다. 무작위 표본으로 데이터베이스의 행 수를 추정하거나, 로드 밸런서가 서버를 무작위로 골라도 결국 고르게 나뉘는 것은 개별 결과가 아니라 <strong>평균</strong>이 예측 가능해지기 때문입니다. 이 장에서는 그 "거의 확실하게"를 숫자로 바꿉니다.
      </p>
      <p>
        같은 분포를 따르는 독립인 확률변수 <M>{'X_1, X_2, \\dots, X_n'}</M>(i.i.d.라고 줄여 씁니다)의 평균을 <T en="sample mean">표본 평균</T> <M>{'\\bar X_n'}</M>이라고 합니다. 2장의 선형성과 분산의 덧셈으로 기댓값과 분산을 바로 구할 수 있습니다.
      </p>
      <MB note="μ와 σ²는 Xᵢ 하나의 기댓값과 분산입니다. 평균의 분산은 n분의 1로 줄고, 표준편차는 √n분의 1로 줄어듭니다.">{'\\bar X_n = \\frac{X_1 + \\cdots + X_n}{n} \\qquad E[\\bar X_n] = \\mu \\qquad \\mathrm{Var}(\\bar X_n) = \\frac{\\sigma^2}{n}'}</MB>

      <h2>대수의 법칙</h2>
      <p>
        분산이 0으로 줄어드니, 표본 평균은 μ 주위에 점점 좁게 몰립니다. 아무리 작은 오차 ε(엡실론)를 정해도 n이 커지면 <M>{'\\bar X_n'}</M>이 μ에서 ε 넘게 벗어날 확률이 0으로 갑니다. 이것이 <T en="law of large numbers">대수의 법칙</T>입니다.
      </p>
      <MB note="ε는 우리가 정하는 아주 작은 양수입니다. 이 꼴을 약한 대수의 법칙이라고 합니다.">{'\\lim_{n \\to \\infty} P\\big(|\\bar X_n - \\mu| > \\varepsilon\\big) = 0'}</MB>
      <LlnFigure />
      <p>
        그림 1에서 동전과 주사위의 경로들은 처음 수십 번 동안 크게 흔들리다가 띠를 따라 좁아집니다. "복권"으로 바꾸면 이야기가 다릅니다. 기댓값은 1인데 대부분의 경로가 오랫동안 0에 머물다가, 당첨이 한 번 나오면 크게 튀어 오릅니다. 분산이 크면 법칙이 작동하기까지 훨씬 많은 표본이 필요합니다. 응답 시간처럼 꼬리가 긴 데이터의 평균을 믿기 어려운 이유입니다.
      </p>
      <Callout kind="warn">
        대수의 법칙은 "앞면이 많이 나왔으니 이제 뒷면이 나올 차례"라는 뜻이 아닙니다. 동전은 기억이 없습니다. 평균이 1/2로 가는 것은 앞선 치우침이 <strong>보상되어서</strong>가 아니라, 앞으로 올 수많은 던지기에 <strong>묻히기</strong> 때문입니다. 이 착각을 도박사의 오류라고 합니다.
      </Callout>

      <h2>마르코프 부등식과 체비쇼프 부등식</h2>
      <p>
        분포를 모를 때도 꼬리 확률, 즉 평균에서 멀리 떨어진 값이 나올 확률의 상한을 구할 수 있습니다. 가장 단순한 것은 음이 아닌 확률변수에 대한 <T en="Markov's inequality">마르코프 부등식</T>입니다.
      </p>
      <MB note="X ≥ 0이고 a > 0. 증명: E[X] ≥ E[X · I(X ≥ a)] ≥ a · P(X ≥ a). 기댓값만 알면 씁니다.">{'P(X \\ge a) \\le \\frac{E[X]}{a}'}</MB>
      <p>
        평균 응답 시간이 100ms인 서버에서 1초 이상 걸리는 요청은 많아야 10%입니다. 분포에 대해 아무것도 몰라도 이 정도는 말할 수 있습니다. 분산까지 알면 마르코프 부등식을 <M>{'(X - \\mu)^2'}</M>에 적용해 더 강한 <T en="Chebyshev's inequality">체비쇼프 부등식</T>을 얻습니다.
      </p>
      <MB note="평균에서 표준편차의 k배 넘게 벗어날 확률은 많아야 1/k²입니다. k = 2이면 25%, k = 10이면 1%.">{'P(|X - \\mu| \\ge k\\sigma) \\le \\frac{1}{k^2} \\qquad\\text{표본 평균에 쓰면}\\qquad P(|\\bar X_n - \\mu| \\ge \\varepsilon) \\le \\frac{\\sigma^2}{n\\varepsilon^2}'}</MB>
      <p>
        오른쪽 식의 우변은 n이 커지면 0으로 가므로, 이것이 곧 대수의 법칙의 증명입니다.
      </p>

      <h2>체르노프 경계: 지수적으로 작은 꼬리</h2>
      <p>
        체비쇼프는 분산만 쓰기 때문에 보수적입니다. 독립인 0~1 값 확률변수들의 합이라는 것까지 알면 훨씬 강한 경계가 나옵니다. 이런 꼴의 경계를 통틀어 <T en="Chernoff bound">체르노프 경계</T>라고 하고, 여기서는 가장 쓰기 편한 <T en="Hoeffding's inequality">호에프딩 부등식</T>을 씁니다.
      </p>
      <MB note="X₁, …, Xₙ이 독립이고 각각 0과 1 사이의 값일 때. 오차 ε가 같다면 n이 늘어날수록 꼬리 확률이 지수적으로 줄어듭니다.">{'P(\\bar X_n - \\mu \\ge \\varepsilon) \\le e^{-2n\\varepsilon^2} \\qquad P(|\\bar X_n - \\mu| \\ge \\varepsilon) \\le 2e^{-2n\\varepsilon^2}'}</MB>
      <BoundsFigure />
      <p>
        그림 2에서 n = 100, 기준 60%로 두면 정확한 값은 약 0.028이고 마르코프는 0.83, 체비쇼프는 0.25, 체르노프는 0.135입니다. n을 1000으로 늘리면 차이가 극적입니다. 정확한 값은 10⁻¹⁰쯤으로 떨어지는데, 마르코프는 그대로이고 체비쇼프는 0.025, 체르노프는 10⁻⁹ 근처입니다. 무작위 알고리즘이 "실패할 확률이 무시할 만큼 작다"고 말할 때 쓰는 도구가 이 지수 꼴의 경계입니다(5장).
      </p>
      <Callout kind="intuition">
        경계는 정확한 값보다 언제나 크거나 같은 <strong>보증</strong>입니다. 경계가 느슨하면 표본을 필요 이상으로 모으게 되지만, 틀린 결론을 내지는 않습니다. 쓰는 가정이 적을수록(마르코프는 기댓값만) 어디에나 쓸 수 있고, 가정이 많을수록(체르노프는 독립과 범위) 날카롭습니다.
      </Callout>

      <h2>표본 크기 정하기</h2>
      <p>
        경계를 뒤집으면 "몇 개를 모아야 하는가"에 답할 수 있습니다. 버튼의 클릭률을 ±2%포인트 안으로, 95% 이상의 확률로 맞히고 싶다고 합시다. ε = 0.02, 실패 확률 δ = 0.05로 두고 호에프딩 경계 <M>{'2e^{-2n\\varepsilon^2} \\le \\delta'}</M>를 n에 대해 풀면 됩니다.
      </p>
      <MB note="0~1 값의 분산은 많아야 1/4이므로 체비쇼프 쪽은 σ² ≤ 1/4을 넣었습니다. δ가 로그 안에 들어가 있어서, 호에프딩은 실패 확률을 10배 줄여도 표본이 조금만 늘어납니다.">{'n_{\\text{체비쇼프}} \\ge \\frac{1}{4\\varepsilon^2\\delta} \\qquad n_{\\text{호에프딩}} \\ge \\frac{\\ln(2/\\delta)}{2\\varepsilon^2}'}</MB>
      <SampleSizeFigure />
      <p>
        그림 3의 기본값에서 체비쇼프는 12,500명, 호에프딩은 4,612명, 정규 근사는 2,401명을 요구합니다. 정규 근사는 <a href={lessonHref('stats-basics', 'clt')}>중심극한정리</a>로 표본 평균의 분포를 정규 분포로 보는 방법이고, n이 클 때 가장 정확하지만 근사라서 보증은 아닙니다. 호에프딩으로 정한 n으로 실험하면 실패 비율이 δ보다 훨씬 작게 나옵니다. 경계가 안전한 쪽으로 느슨하기 때문입니다. δ를 1%로 낮추면 체비쇼프는 다섯 배로 늘지만 호에프딩은 40%쯤만 늘어나는 것도 확인해 보세요. 같은 질문을 구간으로 답하는 방법은 <a href={lessonHref('stats-basics', 'confidence-interval')}>신뢰구간</a>에서 이어집니다.
      </p>
      <Code label="허용 오차와 실패 확률로 표본 수 정하기">{`
// |추정값 - 참값| <= eps 일 확률이 적어도 1 - delta가 되려면
// 0~1 사이 값(클릭했나, 캐시가 맞았나)을 몇 개 모아야 하나

function samplesChebyshev(eps, delta) {
  return Math.ceil(1 / (4 * eps * eps * delta));   // 분산 <= 1/4만 씀
}

function samplesHoeffding(eps, delta) {
  return Math.ceil(Math.log(2 / delta) / (2 * eps * eps)); // 독립 + 범위 [0, 1]
}

samplesChebyshev(0.02, 0.05);  // 12500
samplesHoeffding(0.02, 0.05);  // 4612
samplesHoeffding(0.02, 0.001); // 9502: 실패 확률을 50배 줄여도 두 배쯤`}</Code>

      <Callout kind="key">
        표본 평균의 분산은 σ²/n이라 n이 늘면 평균이 μ로 모입니다(대수의 법칙). 마르코프는 기댓값만으로, 체비쇼프는 분산으로, 체르노프·호에프딩은 독립과 범위로 꼬리 확률을 묶으며, 뒤로 갈수록 날카롭습니다. 호에프딩을 뒤집으면 필요한 표본 수 n ≥ ln(2/δ)/(2ε²)를 얻습니다.
      </Callout>
      <Quiz
        q={<>어떤 해시 테이블의 버킷 길이는 평균 2, 표준편차 1이다(분포는 모름). 길이가 7 이상인 버킷의 비율에 대해 확실히 말할 수 있는 가장 좋은 상한은?</>}
        options={['마르코프로 2/7 ≈ 29%', '체비쇼프로 1/25 = 4%', '체르노프로 e⁻⁵⁰', '분포를 모르면 아무것도 말할 수 없다']}
        answer={1}
        explain={<>길이 7 이상은 평균 2에서 5 이상, 즉 표준편차의 5배 이상 떨어진 것이므로 체비쇼프로 1/5² = 4% 이하입니다. 마르코프의 2/7도 맞는 상한이지만 더 느슨합니다. 체르노프는 독립인 변수들의 합이라는 구조가 있어야 쓸 수 있습니다.</>}
      />
    </>
  );
}
