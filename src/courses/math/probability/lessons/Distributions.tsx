import { useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { binomialPmf, normalPdf, rng } from '../../../../lib/math';
import { lessonHref } from '../../../index';
import { Reroll, bars, label, pmfDots, useMathColors } from './parts';
import { geomPmf, poissonPmf, sampleBinom, sampleExp, sampleGeom, sampleNormal, samplePoisson } from './prob';
import './probability.css';

/* ─────────────── Figure 1: one simulator, seven distributions ─────────────── */

type DistId = 'bern' | 'binom' | 'geom' | 'pois' | 'unif' | 'exp' | 'norm';
interface Params {
  p: number;
  n: number;
  lam: number;
  b: number;
  mu: number;
  sigma: number;
}
interface Dist {
  label: string;
  discrete: boolean;
  story: string;
  params: (keyof Params)[];
  sample: (r: () => number, q: Params) => number;
  mean: (q: Params) => number;
  vari: (q: Params) => number;
  range: (q: Params) => [number, number];
  pmf?: (q: Params, kmax: number) => number[]; // index = value
  pdf?: (q: Params, x: number) => number;
  formula: string;
}

const DISTS: Record<DistId, Dist> = {
  bern: {
    label: '베르누이',
    discrete: true,
    story: '한 번의 시도가 성공(1)하거나 실패(0)합니다. 패킷 하나가 손실되는가, 캐시가 적중하는가.',
    params: ['p'],
    sample: (r, q) => (r() < q.p ? 1 : 0),
    mean: (q) => q.p,
    vari: (q) => q.p * (1 - q.p),
    range: () => [-0.7, 1.7],
    pmf: (q) => [1 - q.p, q.p],
    formula: 'P(X=1) = p,\\; P(X=0) = 1-p',
  },
  binom: {
    label: '이항',
    discrete: true,
    story: '성공 확률 p인 독립 시도를 n번 해서 성공한 횟수. 패킷 n개 중 손실된 개수, 서버 n대 중 오늘 고장 난 대수.',
    params: ['n', 'p'],
    sample: (r, q) => sampleBinom(r, q.n, q.p),
    mean: (q) => q.n * q.p,
    vari: (q) => q.n * q.p * (1 - q.p),
    range: (q) => [-0.7, q.n + 0.7],
    pmf: (q) => binomialPmf(q.n, q.p),
    formula: 'P(X=k) = \\binom{n}{k} p^k (1-p)^{n-k}',
  },
  geom: {
    label: '기하',
    discrete: true,
    story: '처음 성공할 때까지 시도한 횟수. 연결이 될 때까지 재시도한 횟수, 빈 해시 칸을 찾을 때까지 살펴본 칸 수.',
    params: ['p'],
    sample: (r, q) => sampleGeom(r, q.p),
    mean: (q) => 1 / q.p,
    vari: (q) => (1 - q.p) / (q.p * q.p),
    range: (q) => [0.3, Math.max(10, Math.ceil(Math.log(0.004) / Math.log(1 - q.p))) + 0.7],
    pmf: (q, kmax) => geomPmf(q.p, kmax),
    formula: 'P(X=k) = (1-p)^{k-1} p,\\; k = 1, 2, \\dots',
  },
  pois: {
    label: '포아송',
    discrete: true,
    story: '드물고 독립적인 일이 정해진 시간 동안 일어난 횟수. 1초 동안 들어온 요청 수, 1GB에서 나온 비트 오류 수.',
    params: ['lam'],
    sample: (r, q) => samplePoisson(r, q.lam),
    mean: (q) => q.lam,
    vari: (q) => q.lam,
    range: (q) => [-0.7, Math.ceil(q.lam + 4 * Math.sqrt(q.lam) + 3) + 0.7],
    pmf: (q, kmax) => poissonPmf(q.lam, kmax),
    formula: 'P(X=k) = e^{-\\lambda} \\frac{\\lambda^k}{k!}',
  },
  unif: {
    label: '균등',
    discrete: false,
    story: '구간 [0, b]의 모든 값이 똑같이 그럴듯합니다. Math.random()에 b를 곱한 값, 무작위 지연(지터).',
    params: ['b'],
    sample: (r, q) => r() * q.b,
    mean: (q) => q.b / 2,
    vari: (q) => (q.b * q.b) / 12,
    range: (q) => [-0.15 * q.b, 1.15 * q.b],
    pdf: (q, x) => (x >= 0 && x <= q.b ? 1 / q.b : 0),
    formula: 'f(x) = \\tfrac{1}{b},\\; 0 \\le x \\le b',
  },
  exp: {
    label: '지수',
    discrete: false,
    story: '사건이 평균 λ번/초로 무작위로 일어날 때 다음 사건까지 기다리는 시간. 요청 사이 간격, 부품이 고장 날 때까지의 시간.',
    params: ['lam'],
    sample: (r, q) => sampleExp(r, q.lam),
    mean: (q) => 1 / q.lam,
    vari: (q) => 1 / (q.lam * q.lam),
    range: (q) => [0, 5 / q.lam],
    pdf: (q, x) => (x < 0 ? 0 : q.lam * Math.exp(-q.lam * x)),
    formula: 'f(x) = \\lambda e^{-\\lambda x},\\; x \\ge 0',
  },
  norm: {
    label: '정규',
    discrete: false,
    story: '작은 독립 요인이 많이 더해진 값. 측정 오차, 여러 단계 처리 시간의 합.',
    params: ['mu', 'sigma'],
    sample: (r, q) => sampleNormal(r, q.mu, q.sigma),
    mean: (q) => q.mu,
    vari: (q) => q.sigma * q.sigma,
    range: () => [-9, 9],
    pdf: (q, x) => normalPdf(x, q.mu, q.sigma),
    formula: 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-(x-\\mu)^2 / 2\\sigma^2}',
  },
};
const IDS = Object.keys(DISTS) as DistId[];
const PARAM_UI: Record<keyof Params, { label: string; min: number; max: number; step: number; fmt?: (v: number) => string }> = {
  p: { label: '성공 확률 p', min: 0.05, max: 0.95, step: 0.05, fmt: (v) => v.toFixed(2) },
  n: { label: '시도 횟수 n', min: 1, max: 60, step: 1 },
  lam: { label: '비율 λ', min: 0.5, max: 15, step: 0.5, fmt: (v) => v.toFixed(1) },
  b: { label: '구간 끝 b', min: 1, max: 10, step: 0.5, fmt: (v) => v.toFixed(1) },
  mu: { label: '평균 μ', min: -4, max: 4, step: 0.5, fmt: (v) => v.toFixed(1) },
  sigma: { label: '표준편차 σ', min: 0.4, max: 3, step: 0.1, fmt: (v) => v.toFixed(1) },
};

function SimulatorFigure() {
  const P = usePalette();
  const [c1, c2] = useMathColors(P);
  const [id, setId] = useState<DistId>('binom');
  const [q, setQ] = useState<Params>({ p: 0.3, n: 20, lam: 4, b: 5, mu: 0, sigma: 1.5 });
  const [N, setN] = useState(1000);
  const [seed, setSeed] = useState(1);
  const d = DISTS[id];
  const q2: Params = id === 'exp' ? { ...q, lam: Math.min(q.lam, 4) } : q;

  const samples = useMemo(() => {
    const r = rng(seed * 6007 + IDS.indexOf(id) * 101);
    return Array.from({ length: N }, () => d.sample(r, q2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, q2.p, q2.n, q2.lam, q2.b, q2.mu, q2.sigma, N, seed]);
  const sMean = samples.reduce((a, b) => a + b, 0) / N;
  const sVar = samples.reduce((a, b) => a + (b - sMean) ** 2, 0) / (N - 1);
  const [lo, hi] = d.range(q2);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      let plot: Plot;
      if (d.discrete) {
        const kmax = Math.floor(hi);
        const counts = new Array(kmax + 1).fill(0);
        for (const s of samples) if (s <= kmax) counts[s]++;
        const freq = counts.map((c) => c / N);
        const exact = d.pmf!(q2, kmax);
        const yMax = Math.max(...freq, ...exact) * 1.18;
        plot = new Plot(ctx, w, h, P, { xMin: lo, xMax: hi, yMin: 0, yMax, pad: { l: 44, r: 14, t: 14, b: 28 } });
        plot.grid({ axes: false, xStep: kmax > 30 ? 5 : kmax > 14 ? 2 : 1, yLabel: '확률', fmt: (v) => (v > 0 && v < 1 ? v.toFixed(2) : String(Math.round(v))) });
        bars(plot, freq, alpha(c1, 0.55), { width: 0.74 });
        pmfDots(plot, exact, c2, P.surface);
      } else {
        const BINS = 36;
        const bw = (hi - lo) / BINS;
        const counts = new Array(BINS).fill(0);
        for (const s of samples) {
          const i = Math.floor((s - lo) / bw);
          if (i >= 0 && i < BINS) counts[i]++;
        }
        const dens = counts.map((c) => c / (N * bw));
        let pmax = 0;
        for (let i = 0; i <= 200; i++) pmax = Math.max(pmax, d.pdf!(q2, lo + ((hi - lo) * i) / 200));
        const yMax = Math.max(pmax, ...dens) * 1.15;
        plot = new Plot(ctx, w, h, P, { xMin: lo, xMax: hi, yMin: 0, yMax, pad: { l: 44, r: 14, t: 14, b: 28 } });
        plot.grid({ yLabel: '확률 밀도', fmt: (v) => (Math.abs(v) < 1e-9 ? '0' : Math.abs(v) < 1 ? v.toFixed(2) : String(Math.round(v * 10) / 10)) });
        ctx.fillStyle = alpha(c1, 0.55);
        dens.forEach((v, i) => {
          if (v <= 0) return;
          const l = plot.X(lo + i * bw);
          const r2 = plot.X(lo + (i + 1) * bw);
          ctx.fillRect(l + 0.5, plot.Y(v), r2 - l - 1, plot.Y(0) - plot.Y(v));
        });
        plot.fn((x) => d.pdf!(q2, x), c2, 2.4, { samples: 400 });
      }
      const m = d.mean(q2);
      if (m >= lo && m <= hi) {
        plot.line(m, plot.yMin, m, plot.yMax, P.ink2, 1.2, [3, 3]);
        plot.text(`E[X] = ${fmtNum(m)}`, m, plot.yMax, P.ink2, { dx: 5, dy: 9, font: `500 11px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
      }
    },
    [P, c1, c2, samples, id, q2, lo, hi, N],
    { aspect: 2, maxHeight: 340, minHeight: 240 },
  );

  return (
    <Figure
      no={1}
      title="분포 시뮬레이터"
      hint="분포를 고르고 모수를 바꾼 뒤, 다시 굴려 보세요"
      caption={<>막대는 난수 {N.toLocaleString('ko-KR')}개를 뽑아 센 결과이고, {d.discrete ? '점은 공식으로 계산한 확률질량함수입니다' : '곡선은 공식으로 계산한 확률밀도함수입니다. 연속 분포는 막대 넓이의 합이 1이 되도록 높이를 맞췄습니다'}. 표본을 늘릴수록 막대가 공식에 붙습니다. 점선은 이론 기댓값입니다.</>}
    >
      <div className="controls row">
        <Seg label="분포" value={id} onChange={setId} options={IDS.map((k) => ({ value: k, label: DISTS[k].label }))} />
      </div>
      <div className="pr-note">
        <strong>{d.label} 분포.</strong> {d.story}
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${d.label} 분포에서 ${N}개를 뽑은 히스토그램과 이론 ${d.discrete ? '확률질량함수' : '확률밀도함수'}. 표본 평균 ${fmtNum(sMean)}, 이론 평균 ${fmtNum(d.mean(q2))}.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          {d.params.map((k) => {
            const u = PARAM_UI[k];
            const max = id === 'exp' && k === 'lam' ? 4 : u.max;
            return <Slider key={k} id={`sim-${k}`} label={u.label} value={Math.min(q[k], max)} min={u.min} max={max} step={u.step} onChange={(v) => setQ({ ...q, [k]: v })} format={u.fmt} />;
          })}
          <Seg label="표본 수" value={N} onChange={setN} options={[100, 1000, 10000].map((v) => ({ value: v, label: v.toLocaleString('ko-KR') }))} />
          <Reroll onClick={() => setSeed((s) => s + 1)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="표본 평균" value={fmtNum(sMean)} color="var(--c-math-1)" />
            <Readout label="이론 E[X]" value={fmtNum(d.mean(q2))} color="var(--c-math-2)" />
            <Readout label="표본 분산" value={fmtNum(sVar)} color="var(--c-math-1)" />
            <Readout label="이론 Var(X)" value={fmtNum(d.vari(q2))} color="var(--c-math-2)" />
          </div>
        </div>
      </div>
      <MB>{d.formula}</MB>
      <Legend
        items={[
          { color: 'var(--c-math-1)', label: '뽑은 표본', shape: 'sq' },
          { color: 'var(--c-math-2)', label: d.discrete ? '이론 PMF' : '이론 PDF', shape: d.discrete ? 'dot' : 'ln' },
        ]}
      />
    </Figure>
  );
}
function fmtNum(v: number): string {
  if (!isFinite(v)) return '–';
  const a = Math.abs(v);
  const s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
  return s.startsWith('-') ? '−' + s.slice(1) : s;
}

/* ─────────────── Figure 2: Poisson as the limit of binomials ─────────────── */

function PoissonLimitFigure() {
  const P = usePalette();
  const [c1, c2] = useMathColors(P);
  const [lam, setLam] = useState(3);
  const [n, setN] = useState(6);
  const nn = Math.max(n, Math.ceil(lam));
  const kmax = Math.ceil(lam + 4 * Math.sqrt(lam) + 3);
  const bin = binomialPmf(nn, lam / nn);
  const poi = poissonPmf(lam, Math.max(kmax, nn));
  let tv = 0;
  for (let k = 0; k <= Math.max(nn, kmax); k++) tv += Math.abs((bin[k] ?? 0) - (poi[k] ?? 0));
  tv /= 2;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yMax = Math.max(...bin.slice(0, kmax + 1), ...poi.slice(0, kmax + 1)) * 1.2;
      const plot = new Plot(ctx, w, h, P, { xMin: -0.7, xMax: kmax + 0.7, yMin: 0, yMax, pad: { l: 44, r: 14, t: 14, b: 28 } });
      plot.grid({ axes: false, xStep: kmax > 20 ? 2 : 1, fmt: (v) => (v > 0 && v < 1 ? v.toFixed(2) : String(Math.round(v))) });
      plot.text('1시간 동안 온 요청 수 k →', kmax + 0.7, yMax, P.ink2, { align: 'right', dx: -4, dy: 9, font: `500 12px ${P.fontBody}` });
      bars(plot, bin.slice(0, kmax + 1), alpha(c1, 0.6), { width: 0.7 });
      pmfDots(plot, poi.slice(0, kmax + 1), c2, P.surface);
    },
    [P, c1, c2, bin, poi, kmax],
    { aspect: 2.2, maxHeight: 300, minHeight: 220 },
  );

  const slots = Math.min(nn, 60);
  return (
    <Figure
      no={2}
      title="포아송 분포는 아주 잘게 나눈 이항 분포"
      hint="칸 수 n을 늘려 보세요"
      caption={<>한 시간에 평균 λ개의 요청이 옵니다. 한 시간을 n칸으로 나누고 칸마다 요청이 하나 올 확률을 λ/n이라고 하면, 온 요청 수는 이항 분포 B(n, λ/n)입니다(막대). n을 키우면 한 칸에 요청이 둘 올 가능성이 사라지고, 막대가 포아송 분포(점)에 붙습니다.</>}
    >
      <div className="controls row">
        <Slider id="pl-lam" label="시간당 평균 λ" value={lam} min={0.5} max={10} step={0.5} onChange={setLam} format={(v) => v.toFixed(1)} color="var(--c-math-2)" />
        <Slider id="pl-n" label="칸 수 n" value={nn} min={1} max={200} step={1} onChange={setN} color="var(--c-math-1)" />
      </div>
      <div className="pr-slots" aria-hidden="true">
        {Array.from({ length: slots }, (_, i) => (
          <span key={i} />
        ))}
        {nn > slots && <em>… 모두 {nn}칸</em>}
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`이항 분포 B(${nn}, ${(lam / nn).toFixed(3)})와 포아송 분포(λ=${lam})의 비교. 두 분포의 차이(전변동 거리) ${tv.toFixed(3)}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <Readout label="칸마다 확률 λ/n" value={(lam / nn).toFixed(3)} color="var(--c-math-1)" />
        <Readout label="P(요청 0개): 이항" value={bin[0].toFixed(4)} />
        <Readout label="P(요청 0개): 포아송 e^−λ" value={poi[0].toFixed(4)} />
        <Readout label="두 분포의 차이" value={tv.toFixed(3)} color={tv < 0.02 ? 'var(--good)' : undefined} />
      </div>
      <Legend
        items={[
          { color: 'var(--c-math-1)', label: `이항 B(${nn}, λ/${nn})`, shape: 'sq' },
          { color: 'var(--c-math-2)', label: `포아송 (λ = ${lam})` },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: a Poisson process, gaps and counts ─────────────── */

const HORIZON = 600; // seconds simulated
const SHOW = 20; // seconds drawn on the timeline

function ArrivalsFigure() {
  const P = usePalette();
  const [c1, c2, c3] = useMathColors(P);
  const [lam, setLam] = useState(2);
  const [view, setView] = useState<'gap' | 'count'>('gap');
  const [waited, setWaited] = useState(false);
  const [s, setS] = useState(0.5);
  const [seed, setSeed] = useState(1);

  const arrivals = useMemo(() => {
    const r = rng(seed * 3301 + Math.round(lam * 10));
    const out: number[] = [];
    let t = sampleExp(r, lam);
    while (t < HORIZON) {
      out.push(t);
      t += sampleExp(r, lam);
    }
    return out;
  }, [lam, seed]);
  const gaps = useMemo(() => arrivals.map((t, i) => t - (i ? arrivals[i - 1] : 0)), [arrivals]);
  const counts = useMemo(() => {
    const c = new Array(HORIZON).fill(0);
    for (const t of arrivals) c[Math.floor(t)]++;
    return c;
  }, [arrivals]);
  const used = waited ? gaps.filter((g) => g > s).map((g) => g - s) : gaps;
  const meanUsed = used.reduce((a, b) => a + b, 0) / Math.max(1, used.length);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      // timeline strip
      const stripH = 56;
      const x0 = 44;
      const x1 = w - 14;
      const ty = 30;
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, ty);
      ctx.lineTo(x1, ty);
      ctx.stroke();
      for (let t = 0; t <= SHOW; t += 5) label(ctx, P, `${t}s`, x0 + ((x1 - x0) * t) / SHOW, ty + 16, P.ink3, 'center', 'middle', 10, 500);
      if (view === 'count')
        for (let t = 1; t < SHOW; t++) {
          const X = x0 + ((x1 - x0) * t) / SHOW;
          ctx.strokeStyle = alpha(P.ink, 0.12);
          ctx.beginPath();
          ctx.moveTo(X, ty - 12);
          ctx.lineTo(X, ty + 6);
          ctx.stroke();
        }
      for (const t of arrivals) {
        if (t > SHOW) break;
        const X = x0 + ((x1 - x0) * t) / SHOW;
        ctx.strokeStyle = c1;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(X, ty - 11);
        ctx.lineTo(X, ty + 1);
        ctx.stroke();
      }
      label(ctx, P, `처음 ${SHOW}초 동안 요청이 도착한 시각`, x0, 9, P.ink3, 'left', 'middle', 11, 500);

      ctx.save();
      ctx.translate(0, stripH);
      const hh = h - stripH;
      if (view === 'gap') {
        const xMax = 4 / lam;
        const BINS = 32;
        const bw = xMax / BINS;
        const hc = new Array(BINS).fill(0);
        for (const g of used) {
          const i = Math.floor(g / bw);
          if (i < BINS) hc[i]++;
        }
        const dens = hc.map((c) => c / (used.length * bw));
        const yMax = Math.max(lam, ...dens) * 1.12;
        const plot = new Plot(ctx, w, hh, P, { xMin: 0, xMax, yMin: 0, yMax, pad: { l: 44, r: 14, t: 10, b: 28 } });
        plot.grid({ fmt: (v) => (Math.abs(v) < 1e-9 ? '0' : v < 10 ? String(Math.round(v * 100) / 100) : String(Math.round(v))) });
        ctx.fillStyle = alpha(waited ? c3 : c1, 0.55);
        dens.forEach((v, i) => {
          const l = plot.X(i * bw);
          const r2 = plot.X((i + 1) * bw);
          ctx.fillRect(l + 0.5, plot.Y(v), r2 - l - 1, plot.Y(0) - plot.Y(v));
        });
        plot.fn((x) => lam * Math.exp(-lam * x), c2, 2.4);
        plot.text(waited ? `${s.toFixed(1)}초 기다린 뒤 남은 대기 (초) →` : '요청 사이 간격 (초) →', xMax, yMax, P.ink2, { align: 'right', dx: -4, dy: 9, font: `500 12px ${P.fontBody}` });
      } else {
        const kmax = Math.ceil(lam + 4 * Math.sqrt(lam) + 2);
        const hc = new Array(kmax + 1).fill(0);
        for (const c of counts) if (c <= kmax) hc[c]++;
        const freq = hc.map((c) => c / HORIZON);
        const exact = poissonPmf(lam, kmax);
        const yMax = Math.max(...freq, ...exact) * 1.18;
        const plot = new Plot(ctx, w, hh, P, { xMin: -0.7, xMax: kmax + 0.7, yMin: 0, yMax, pad: { l: 44, r: 14, t: 10, b: 28 } });
        plot.text('1초 동안 온 요청 수 →', kmax + 0.7, yMax, P.ink2, { align: 'right', dx: -4, dy: 9, font: `500 12px ${P.fontBody}` });
        plot.grid({ axes: false, xStep: kmax > 16 ? 2 : 1, fmt: (v) => (v > 0 && v < 1 ? v.toFixed(2) : String(Math.round(v))) });
        bars(plot, freq, alpha(c1, 0.55), { width: 0.72 });
        pmfDots(plot, exact, c2, P.surface);
      }
      ctx.restore();
    },
    [P, c1, c2, c3, arrivals, used, counts, view, lam, waited, s],
    { aspect: 1.9, maxHeight: 360, minHeight: 270 },
  );

  return (
    <Figure
      no={3}
      title="요청이 무작위로 도착할 때"
      hint="보기를 바꾸고, '이미 기다렸다면'을 켜 보세요"
      caption={<>요청이 초당 평균 λ개, 서로 독립으로 아무 때나 도착합니다(포아송 과정). 위 띠는 처음 {SHOW}초 동안의 도착 시각이고, 아래는 {HORIZON}초 동안의 기록으로 그린 분포입니다. 같은 과정을 "간격"으로 보면 지수 분포, "1초당 개수"로 보면 포아송 분포가 됩니다.</>}
    >
      <div className="controls row">
        <Slider id="ar-lam" label="초당 평균 요청 λ" value={lam} min={0.5} max={6} step={0.5} onChange={setLam} format={(v) => v.toFixed(1)} />
        <Seg label="보기" value={view} onChange={setView} options={[{ value: 'gap', label: '간격' }, { value: 'count', label: '1초당 개수' }]} />
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Reroll onClick={() => setSeed((x) => x + 1)} />
        </div>
      </div>
      {view === 'gap' && (
        <div className="controls row">
          <Check label="이미 s초 기다렸다면" checked={waited} onChange={setWaited} />
          <Slider id="ar-s" label="이미 기다린 시간 s" value={s} min={0.1} max={1.5} step={0.1} onChange={setS} format={(v) => v.toFixed(1) + '초'} color="var(--c-math-3)" />
        </div>
      )}
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={view === 'gap' ? `요청 사이 간격의 히스토그램과 지수 분포 곡선. 평균 간격 ${meanUsed.toFixed(2)}초, 이론값 ${(1 / lam).toFixed(2)}초.` : `1초당 요청 수의 히스토그램과 포아송 분포. λ = ${lam}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <Readout label={`${HORIZON}초 동안 온 요청`} value={`${arrivals.length}개`} />
        <Readout label={waited && view === 'gap' ? `${s.toFixed(1)}초 뒤 남은 대기 평균` : '평균 간격'} value={`${(view === 'gap' ? meanUsed : gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(3)}초`} color={waited && view === 'gap' ? 'var(--c-math-3)' : 'var(--c-math-1)'} />
        <Readout label="이론 1/λ" value={`${(1 / lam).toFixed(3)}초`} color="var(--c-math-2)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Distributions() {
  return (
    <>
      <h2>같은 모양이 자꾸 나온다</h2>
      <p>
        확률변수마다 분포를 처음부터 구할 필요는 없습니다. 서로 다른 상황인데도 같은 "이야기"를 가진 확률변수는 같은 모양의 분포를 따르기 때문입니다. 패킷 손실 수와 동전 앞면 수는 둘 다 "독립 시도에서 성공한 횟수"이고, 둘 다 이항 분포입니다. 이 장에서는 컴퓨터과학에서 가장 자주 만나는 분포 일곱 가지를 그 이야기와 함께 봅니다. 분포를 정하는 숫자(성공 확률 p, 시도 횟수 n, 비율 λ 같은 것)를 <T en="parameter">모수</T>라고 합니다.
      </p>

      <h2>이산 분포: 세는 이야기들</h2>
      <p>
        <T en="Bernoulli distribution">베르누이 분포</T>는 가장 작은 분포입니다. 확률 p로 1, 아니면 0. 2장의 지시변수가 바로 베르누이 확률변수입니다. 독립인 베르누이 시도 n개를 더하면 <T en="binomial distribution">이항 분포</T> <M>{'B(n, p)'}</M>가 됩니다. k번 성공하는 특정 순서 하나의 확률이 <M>{'p^k(1-p)^{n-k}'}</M>이고, 그런 순서가 <M>{'\\binom{n}{k}'}</M>가지입니다. 기댓값은 선형성으로 바로 <M>{'np'}</M>이고, 독립이므로 분산도 더해져 <M>{'np(1-p)'}</M>입니다.
      </p>
      <p>
        <T en="geometric distribution">기하 분포</T>는 처음 성공할 때까지의 시도 횟수입니다. 처음 k−1번 실패하고 k번째에 성공해야 하므로 <M>{'(1-p)^{k-1}p'}</M>이고, 기댓값은 <M>{'1/p'}</M>입니다. 성공 확률이 1%면 평균 100번 시도합니다. 2장의 쿠폰 모으기에서 단계마다 쓴 <M>{'n/(n-i)'}</M>가 이것입니다.
      </p>
      <SimulatorFigure />
      <p>
        그림 1에서 표본 수를 100으로 두고 몇 번 다시 굴려 보세요. 막대가 공식에서 꽤 벗어나고, 표본 평균도 매번 다릅니다. 10,000개로 늘리면 막대가 점에 거의 붙습니다. 시뮬레이션으로 얻은 숫자는 그 자체로 확률변수라는 것, 그리고 많이 뽑을수록 덜 흔들린다는 것을 기억해 두세요. 4장에서 "얼마나 덜 흔들리는가"를 정확히 잽니다.
      </p>
      <Callout kind="note">
        기하 분포를 "처음 성공하기 <strong>전의</strong> 실패 횟수"(0부터 시작)로 정의하는 책과 라이브러리도 있습니다. 그러면 기댓값은 <M>{'(1-p)/p'}</M>입니다. 분포 이름만 믿지 말고 어디서부터 세는지 확인하세요.
      </Callout>

      <h2>포아송 분포: 드문 일의 개수</h2>
      <p>
        서버에 한 시간 동안 들어온 요청 수를 생각해 봅시다. 사용자가 아주 많고 각자 요청을 보낼 확률은 아주 작으며 서로 독립이라면, 요청 수는 <M>{'n'}</M>이 크고 <M>{'p'}</M>가 작은 이항 분포입니다. 평균 <M>{'\\lambda = np'}</M>(람다)만 고정하고 n을 무한히 키운 극한이 <T en="Poisson distribution">포아송 분포</T>입니다.
      </p>
      <MB note="e ≈ 2.718은 자연로그의 밑입니다. 기댓값과 분산이 모두 λ입니다.">{'\\binom{n}{k}\\left(\\frac{\\lambda}{n}\\right)^k \\left(1 - \\frac{\\lambda}{n}\\right)^{n-k} \\;\\xrightarrow{\\;n \\to \\infty\\;}\\; e^{-\\lambda} \\frac{\\lambda^k}{k!}'}</MB>
      <PoissonLimitFigure />
      <p>
        그림 2에서 λ = 3일 때 n이 50쯤이면 두 분포의 차이가 0.02 아래로 떨어지고, 그 뒤로는 거의 구별되지 않습니다. 그래서 개별 확률이나 시도 횟수는 모르고 평균만 아는 상황, 예컨대 "이 링크에서 1GB당 비트 오류가 평균 2개"에서 포아송 분포를 씁니다. 요청 0개일 확률 <M>{'e^{-\\lambda}'}</M>는 "한 시간 동안 아무 요청도 없을 확률"이고, 서버를 잠시 꺼도 되는지 판단하는 데 쓸 수 있습니다.
      </p>

      <h2>연속 분포: 넓이가 확률이다</h2>
      <p>
        시간이나 길이처럼 값이 연속으로 이어지는 확률변수는 특정한 값 하나를 가질 확률이 0입니다. 대신 <T en="probability density function, PDF">확률밀도함수</T> <M>{'f(x)'}</M>를 두고, 구간에 들어갈 확률을 곡선 아래 넓이로 정의합니다. 이산 분포의 합 <M>{'\\sum'}</M>이 적분 <M>{'\\int'}</M>로 바뀔 뿐 기댓값과 분산의 정의는 같습니다.
      </p>
      <MB note="f(x) 자체는 확률이 아니어서 1보다 클 수도 있습니다. 넓이만 확률입니다.">{'P(a \\le X \\le b) = \\int_a^b f(x)\\,dx \\qquad E[X] = \\int x\\,f(x)\\,dx'}</MB>
      <p>
        <T en="uniform distribution">균등 분포</T>는 구간 안에서 밀도가 평평합니다. 프로그램의 <code>Math.random()</code>이 [0, 1)의 균등 분포를 흉내 내고, 다른 모든 분포는 여기서 만들어집니다. 그림 1의 그림들도 전부 균등 난수 하나에서 출발했습니다. <T en="normal distribution">정규 분포</T>는 독립인 작은 요인이 많이 더해질 때 나타나는 종 모양입니다. 왜 그런지는 <a href={lessonHref('stats-basics', 'clt')}>중심극한정리</a>에서, 구간 확률을 넓이로 읽는 연습은 <a href={lessonHref('ai-basics', 'probability')}>확률과 분포</a>에서 다룹니다.
      </p>

      <h2>지수 분포: 다음 요청까지 기다리는 시간</h2>
      <p>
        요청이 초당 평균 λ개, 서로 독립으로 아무 때나 도착하는 과정을 <T en="Poisson process">포아송 과정</T>이라고 합니다. 이 과정에서 t초 동안 아무 요청도 없을 확률은 포아송 분포의 0개 확률 <M>{'e^{-\\lambda t}'}</M>입니다. 따라서 다음 요청까지의 대기 시간 T는 <M>{'P(T > t) = e^{-\\lambda t}'}</M>인 <T en="exponential distribution">지수 분포</T>를 따르고, 평균 대기 시간은 <M>{'1/\\lambda'}</M>입니다.
      </p>
      <ArrivalsFigure />
      <p>
        그림 3에서 "이미 s초 기다렸다면"을 켜 보세요. s초 넘게 기다린 경우들만 모아 남은 대기 시간을 그리면, 처음부터 잰 간격과 똑같은 곡선이 나옵니다. 이것을 <T en="memorylessness">무기억성</T>이라고 합니다.
      </p>
      <MB note="이미 s초를 기다렸다는 사실이 앞으로 t초를 더 기다릴 확률을 바꾸지 않습니다. 연속 분포 중 이 성질을 가진 것은 지수 분포뿐입니다.">{'P(T > s + t \\mid T > s) = \\frac{e^{-\\lambda(s+t)}}{e^{-\\lambda s}} = e^{-\\lambda t} = P(T > t)'}</MB>
      <p>
        무기억성 덕분에 대기열을 분석하는 큐잉 이론이 계산 가능해지고, 운영체제는 다음 CPU 사용 시간을 예측할 때 과거를 지수적으로 잊는 평균을 씁니다(<a href={lessonHref('cs-operating-systems', 'scheduling')}>CPU 스케줄링</a>). 반대로 "오래 기다렸으니 곧 오겠지"가 맞는 과정, 예컨대 정해진 주기로 도는 배치 작업은 지수 분포가 아닙니다.
      </p>
      <Code label="균등 난수 하나로 여러 분포 만들기">{`
const U = () => Math.random();          // [0, 1) 균등

const bernoulli = (p) => (U() < p ? 1 : 0);

function binomial(n, p) {               // 베르누이 n개의 합
  let k = 0;
  for (let i = 0; i < n; i++) k += bernoulli(p);
  return k;
}

// 역변환: P(T > t) = e^(-λt)를 t에 대해 풀면 t = -ln(1-U)/λ
const exponential = (lam) => -Math.log(1 - U()) / lam;

function poisson(lam) {                 // 1초 안에 들어간 지수 간격의 개수
  let t = exponential(lam), k = 0;
  while (t < 1) { k++; t += exponential(lam); }
  return k;
}

const geometric = (p) => Math.ceil(Math.log(1 - U()) / Math.log(1 - p));`}</Code>

      <h2>한눈에 보기</h2>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>분포</th>
              <th>이야기</th>
              <th>E[X]</th>
              <th>Var(X)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>베르누이(p)</td>
              <td>한 번 시도해 성공하면 1</td>
              <td className="num">p</td>
              <td className="num">p(1−p)</td>
            </tr>
            <tr>
              <td>이항(n, p)</td>
              <td>n번 시도 중 성공 횟수</td>
              <td className="num">np</td>
              <td className="num">np(1−p)</td>
            </tr>
            <tr>
              <td>기하(p)</td>
              <td>첫 성공까지 시도 횟수</td>
              <td className="num">1/p</td>
              <td className="num">(1−p)/p²</td>
            </tr>
            <tr>
              <td>포아송(λ)</td>
              <td>정해진 시간 동안 드문 일의 횟수</td>
              <td className="num">λ</td>
              <td className="num">λ</td>
            </tr>
            <tr>
              <td>균등(a, b)</td>
              <td>구간 안 아무 값</td>
              <td className="num">(a+b)/2</td>
              <td className="num">(b−a)²/12</td>
            </tr>
            <tr>
              <td>지수(λ)</td>
              <td>다음 사건까지 대기 시간</td>
              <td className="num">1/λ</td>
              <td className="num">1/λ²</td>
            </tr>
            <tr>
              <td>정규(μ, σ²)</td>
              <td>작은 독립 요인의 합</td>
              <td className="num">μ</td>
              <td className="num">σ²</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Callout kind="warn">
        분포는 가정입니다. 실제 웹 트래픽은 출퇴근 시간에 몰리고, 한 사용자의 요청은 서로 독립이 아니며, 응답 시간에는 2장에서 본 것 같은 긴 꼬리가 있습니다. 포아송이나 정규 분포를 가정하기 전에 그림 1처럼 실제 데이터의 히스토그램을 공식에 겹쳐 보는 습관이 필요합니다.
      </Callout>

      <Callout kind="key">
        이항은 n번 중 성공 횟수, 기하는 첫 성공까지의 횟수, 포아송은 평균만 아는 드문 일의 횟수입니다. 포아송은 n → ∞, p = λ/n인 이항의 극한이고, 포아송 과정의 간격은 무기억성을 가진 지수 분포입니다. 연속 분포에서는 밀도 곡선 아래 넓이가 확률입니다.
      </Callout>
      <Quiz
        q={<>요청이 초당 평균 2개씩 포아송 과정으로 도착한다. 방금 요청이 하나 왔고, 그 뒤 1초 동안 아무것도 오지 않았다. 다음 요청까지 앞으로 기다릴 시간의 기댓값은?</>}
        options={['0초 (곧 올 때가 되었다)', '0.5초', '1초', '1.5초']}
        answer={1}
        explain={<>지수 분포는 무기억성을 가집니다. 이미 1초를 기다렸다는 사실은 남은 대기 시간의 분포를 바꾸지 않으므로, 남은 시간의 기댓값은 처음과 같은 1/λ = 0.5초입니다.</>}
      />
    </>
  );
}
