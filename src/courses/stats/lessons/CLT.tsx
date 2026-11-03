import { useRef, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../components/ui';
import { useCanvas2D } from '../../../lib/canvas';
import { Plot, fmt } from '../../../lib/plot';
import { alpha, usePalette } from '../../../lib/theme';
import { gauss, mean, normalPdf, rng, variance } from '../../../lib/math';
import { lessonHref } from '../../index';
import { axisLine, stackLevels } from './shared';

/* ─────────────── Figure 1: drawing samples, collecting their means ─────────────── */

type Pop = 'dice' | 'wait' | 'two';

interface Population {
  name: string;
  label: string;
  lo: number;
  hi: number;
  step: number;
  mu: number;
  sigma: number;
  draw: (r: () => number) => number;
  /** Density for continuous populations; dice are drawn as six bars instead. */
  pdf?: (x: number) => number;
}

const POPS: Record<Pop, Population> = {
  dice: { name: '주사위', label: '주사위 눈', lo: 0.5, hi: 6.5, step: 1, mu: 3.5, sigma: Math.sqrt(35 / 12), draw: (r) => 1 + Math.floor(r() * 6) },
  wait: { name: '대기 시간', label: '버스 대기 시간 (분)', lo: 0, hi: 16, step: 2, mu: 4, sigma: 4, draw: (r) => -4 * Math.log(1 - r()), pdf: (x) => (x < 0 ? 0 : Math.exp(-x / 4) / 4) },
  two: { name: '두 봉우리', label: '값', lo: 0, hi: 10, step: 1, mu: 5, sigma: Math.sqrt(0.36 + 9), draw: (r) => (r() < 0.5 ? 2 : 8) + 0.6 * gauss(r), pdf: (x) => 0.5 * normalPdf(x, 2, 0.6) + 0.5 * normalPdf(x, 8, 0.6) },
};

/** Histogram bins for sample means. Dice means live on a 1/n lattice, so their bins hold whole lattice steps. */
function binsFor(pop: Pop, n: number) {
  const P = POPS[pop];
  if (pop === 'dice') {
    const k = Math.max(1, Math.ceil(0.1 * n));
    const bw = k / n;
    return {
      bw,
      index: (v: number) => Math.floor(Math.round((v - 1) * n) / k),
      center: (i: number) => 1 + (i * k + (k - 1) / 2) / n,
      count: Math.floor((5 * n) / k) + 1,
    };
  }
  const count = 64;
  const bw = (P.hi - P.lo) / count;
  return { bw, index: (v: number) => Math.floor((v - P.lo) / bw), center: (i: number) => P.lo + (i + 0.5) * bw, count };
}

function SamplingFigure() {
  const P = usePalette();
  const [pop, setPop] = useState<Pop>('wait');
  const [n, setN] = useState(5);
  const sim = useRef<{ means: number[]; last: number[]; r: () => number }>({ means: [], last: [], r: rng(7) });
  const [, setTick] = useState(0);
  const cfg = POPS[pop];

  const take = (times: number, popId = pop, size = n) => {
    const s = sim.current;
    const p = POPS[popId];
    for (let t = 0; t < times; t++) {
      const xs = Array.from({ length: size }, () => p.draw(s.r));
      s.means.push(mean(xs));
      if (t === times - 1) s.last = xs;
    }
    setTick((x) => x + 1);
  };
  const reset = (popId = pop, size = n) => {
    sim.current.means = [];
    sim.current.last = [];
    take(1, popId, size);
  };
  // first render: one sample so the figure is not empty
  if (!sim.current.last.length) {
    const xs = Array.from({ length: n }, () => cfg.draw(sim.current.r));
    sim.current.last = xs;
    sim.current.means = [mean(xs)];
  }

  const { means, last } = sim.current;
  const se = cfg.sigma / Math.sqrt(n);
  const meanOfMeans = mean(means);
  const sdOfMeans = means.length > 1 ? Math.sqrt(variance(means, true)) : NaN;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const padX = 18;
      const X = (v: number) => padX + ((v - cfg.lo) / (cfg.hi - cfg.lo)) * (w - 2 * padX);
      const label = (s: string, y: number) => {
        ctx.fillStyle = P.ink3;
        ctx.font = `600 11px ${P.fontBody}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(s, padX, y);
      };

      // ── population
      const popTop = 22;
      const popBot = 104;
      label('모집단', 4);
      if (cfg.pdf) {
        const plot = new Plot(ctx, w, h, P, { xMin: cfg.lo, xMax: cfg.hi, yMin: 0, yMax: 1, pad: { l: padX, r: padX, t: popTop, b: h - popBot } });
        let peak = 0;
        for (let i = 0; i <= 200; i++) peak = Math.max(peak, cfg.pdf(cfg.lo + ((cfg.hi - cfg.lo) * i) / 200));
        const f = (x: number) => cfg.pdf!(x) / (peak * 1.05);
        plot.fillUnder(f, alpha(P.ink3, 0.18));
        plot.fn(f, P.ink2, 1.5);
      } else {
        for (let k = 1; k <= 6; k++) {
          const bw = (X(2) - X(1)) * 0.6;
          ctx.fillStyle = alpha(P.ink3, 0.3);
          ctx.fillRect(X(k) - bw / 2, popTop + 20, bw, popBot - popTop - 20);
        }
      }
      ctx.strokeStyle = P.ink3;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(cfg.mu), popTop - 6);
      ctx.lineTo(X(cfg.mu), h - 34);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.ink2;
      ctx.font = `600 12px ${P.fontMono}`;
      ctx.textAlign = 'left';
      ctx.fillText(`μ = ${fmt(cfg.mu, 1)}`, X(cfg.mu) + 6, popTop - 6);

      // ── the latest sample
      const sTop = popBot + 16;
      const sBase = sTop + 64;
      label(`이번 표본 (n = ${n})`, sTop);
      const r = n > 30 ? 3 : 4.5;
      const px = last.map((v) => X(Math.min(cfg.hi, Math.max(cfg.lo, v))));
      const lv = stackLevels(px, 2 * r + 0.5);
      px.forEach((x, i) => {
        ctx.beginPath();
        ctx.arc(x, sBase - r - Math.min(lv[i], 9) * (2 * r + 1), r, 0, Math.PI * 2);
        ctx.fillStyle = alpha(P.ink, 0.65);
        ctx.fill();
      });
      ctx.strokeStyle = P.line;
      ctx.beginPath();
      ctx.moveTo(X(cfg.lo), sBase + 0.5);
      ctx.lineTo(X(cfg.hi), sBase + 0.5);
      ctx.stroke();
      const lastMean = mean(last);
      ctx.fillStyle = P.pos;
      ctx.beginPath();
      ctx.moveTo(X(lastMean), sBase + 2);
      ctx.lineTo(X(lastMean) - 7, sBase + 13);
      ctx.lineTo(X(lastMean) + 7, sBase + 13);
      ctx.closePath();
      ctx.fill();
      ctx.font = `600 11px ${P.fontMono}`;
      ctx.fillText(`x̄ = ${fmt(lastMean, 2)}`, X(lastMean) + 10, sBase + 8);

      // ── distribution of the sample means
      const mTop = sBase + 30;
      const mBot = h - 40;
      label(`표본평균 ${means.length.toLocaleString('ko-KR')}개의 분포`, mTop);
      const B = binsFor(pop, n);
      const counts = new Array(B.count).fill(0);
      for (const v of means) {
        const i = B.index(v);
        if (i >= 0 && i < B.count) counts[i]++;
      }
      const curvePeak = means.length * B.bw * normalPdf(cfg.mu, cfg.mu, se);
      const yMax = Math.max(1, ...counts, curvePeak) * 1.1;
      const Y = (c: number) => mBot - (c / yMax) * (mBot - mTop - 18);
      ctx.fillStyle = alpha(P.stats2, 0.65);
      for (let i = 0; i < B.count; i++) {
        if (!counts[i]) continue;
        const c = B.center(i);
        const x0 = X(c - B.bw / 2);
        const x1 = X(c + B.bw / 2);
        ctx.fillRect(x0 + 0.5, Y(counts[i]), Math.max(1.5, x1 - x0 - 1), mBot - Y(counts[i]));
      }
      if (means.length >= 20) {
        ctx.strokeStyle = P.pos;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 240; i++) {
          const x = cfg.lo + ((cfg.hi - cfg.lo) * i) / 240;
          const y = Y(means.length * B.bw * normalPdf(x, cfg.mu, se));
          if (i === 0) ctx.moveTo(X(x), y);
          else ctx.lineTo(X(x), y);
        }
        ctx.stroke();
      }
      axisLine(ctx, P, X, h - 34, cfg.lo + (pop === 'dice' ? 0.5 : 0), cfg.hi - (pop === 'dice' ? 0.5 : 0), cfg.step, cfg.label);
    },
    [P, pop, n, means.length, last],
    { aspect: 1.45, maxHeight: 470, minHeight: 400 },
  );

  return (
    <Figure
      no={1}
      title="표본을 뽑을 때마다 평균은 달라진다"
      hint="모집단과 n을 고르고 표본을 뽑아 보세요"
      caption={<>맨 위는 모집단(전체)의 모양, 가운데는 방금 뽑은 표본 n개와 그 평균(주황 삼각형)입니다. 맨 아래에는 지금까지 뽑은 모든 표본의 평균이 쌓입니다. 모집단이 한쪽으로 치우쳤든 봉우리가 둘이든, n을 키우면 표본평균의 분포는 주황 곡선(정규분포)에 가까워지고 폭이 좁아집니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg
            label="모집단"
            value={pop}
            onChange={(p) => {
              setPop(p);
              reset(p, n);
            }}
            options={(Object.keys(POPS) as Pop[]).map((p) => ({ value: p, label: POPS[p].name }))}
          />
          <Slider
            id="clt-n"
            label="표본 크기 n"
            value={n}
            min={1}
            max={50}
            step={1}
            onChange={(v) => {
              setN(v);
              reset(pop, v);
            }}
          />
          <div className="btn-row">
            <Button small onClick={() => take(1)}>
              표본 1개
            </Button>
            <Button small onClick={() => take(100)}>
              +100개
            </Button>
            <Button small primary onClick={() => take(1000)}>
              +1000개
            </Button>
            <Button small onClick={() => reset()}>
              초기화
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="표본평균들의 평균" value={fmt(meanOfMeans, 2)} />
            <Readout label="모평균 μ" value={fmt(cfg.mu, 2)} />
            <Readout label="표본평균들의 표준편차" value={isNaN(sdOfMeans) ? '—' : fmt(sdOfMeans, 3)} />
            <Readout label="이론값 σ/√n" value={fmt(se, 3)} color="var(--pos)" />
          </div>
          <Legend
            items={[
              { color: 'var(--c-stats-2)', label: '표본평균의 분포', shape: 'sq' },
              { color: 'var(--pos)', label: '정규분포 N(μ, σ²/n)', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the √n law ─────────────── */

const MU2 = 50;
const SIGMA2 = 10;
const REF_N = [1, 4, 16, 64];

function SqrtNFigure() {
  const P = usePalette();
  const [n, setN] = useState(16);
  const se = SIGMA2 / Math.sqrt(n);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 15, xMax: 85, yMin: 0, yMax: normalPdf(0, 0, SIGMA2 / Math.sqrt(100)) * 1.08, pad: { l: 14, r: 14, t: 14, b: 28 } });
      plot.grid({ xStep: 10, yStep: 1, axes: false, fmt: (v) => (v === 0 ? '' : String(v)) });
      for (const k of REF_N) {
        const s = SIGMA2 / Math.sqrt(k);
        plot.fn((x) => normalPdf(x, MU2, s), alpha(P.ink3, 0.55), 1.2, { dash: [4, 4] });
        const peak = normalPdf(MU2, MU2, s);
        if (k !== 1) plot.text(`n=${k}`, MU2 + s * 1.15, normalPdf(MU2 + s * 1.15, MU2, s), P.ink3, { dx: 8, font: `11px ${P.fontMono}` });
        else plot.text('n=1 (모집단)', MU2 + s * 1.6, peak * 0.35, P.ink3, { dx: 8, font: `11px ${P.fontMono}` });
      }
      plot.fillUnder((x) => normalPdf(x, MU2, se), alpha(P.stats2, 0.25), MU2 - 1.96 * se, MU2 + 1.96 * se);
      plot.fn((x) => normalPdf(x, MU2, se), P.stats2, 2.5);
      plot.line(MU2 - 1.96 * se, 0, MU2 - 1.96 * se, normalPdf(MU2 - 1.96 * se, MU2, se), P.stats2, 1.5);
      plot.line(MU2 + 1.96 * se, 0, MU2 + 1.96 * se, normalPdf(MU2 + 1.96 * se, MU2, se), P.stats2, 1.5);
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plot.pad.l, plot.Y(0) + 0.5);
      ctx.lineTo(w - plot.pad.r, plot.Y(0) + 0.5);
      ctx.stroke();
    },
    [P, n],
    { aspect: 2.2, maxHeight: 320, minHeight: 220 },
  );

  return (
    <Figure
      no={2}
      title="표본을 4배로 늘리면 흔들림은 절반"
      hint="n을 바꿔 보세요"
      caption={<>평균 50, 표준편차 10인 시험 점수에서 n명씩 뽑았을 때 표본평균의 분포입니다. 점선은 n = 1, 4, 16, 64일 때입니다. n이 4배가 될 때마다 곡선의 폭이 정확히 절반으로 줄어듭니다. 칠해진 부분은 표본평균의 95%가 떨어지는 범위입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="sq-n" label="표본 크기 n" value={n} min={1} max={100} step={1} onChange={setN} color="var(--c-stats-2)" />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="표준오차 σ/√n" value={fmt(se, 2)} color="var(--c-stats-2)" />
            <Readout label="√n" value={fmt(Math.sqrt(n), 2)} />
            <Readout label="표본평균의 95% 범위" value={`${fmt(MU2 - 1.96 * se, 1)} ~ ${fmt(MU2 + 1.96 * se, 1)}`} />
            <Readout label="절반으로 줄이려면" value={`n = ${(n * 4).toLocaleString('ko-KR')}`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function CLT() {
  return (
    <>
      <h2>전체를 볼 수 없을 때</h2>
      <p>
        대한민국 성인의 하루 평균 수면 시간을 알고 싶다고 합시다. 4천만 명을 모두 조사할 수는 없으니 1000명쯤을 무작위로 뽑아 물어봅니다. 알고 싶은 전체를 <T en="population">모집단</T>, 실제로 조사한 일부를 <T en="sample">표본</T>이라고 합니다. 모집단의 평균 <M>{'\\mu'}</M>(뮤)와 표준편차 <M>{'\\sigma'}</M>(시그마)는 우리가 끝내 정확히 모르는 값이고, 표본에서 계산한 평균 <M>{'\\bar{x}'}</M>는 그것을 추측하는 단서입니다.
      </p>
      <p>
        문제는 표본이 뽑을 때마다 다르다는 것입니다. 다른 1000명을 뽑았다면 평균도 조금 달랐을 겁니다. 그렇다면 내가 얻은 <M>{'\\bar{x}'}</M>는 <M>{'\\mu'}</M>에서 얼마나 벗어나 있을 수 있을까요? 이 질문에 답하려면 표본평균이 표본마다 어떻게 흔들리는지, 즉 <T en="sampling distribution">표본평균의 분포</T>를 알아야 합니다. 직접 수천 번 뽑아 보면 됩니다.
      </p>

      <h2>표본평균은 종 모양으로 모인다</h2>
      <SamplingFigure />
      <p>
        n = 1이면 표본평균은 그냥 값 하나이므로 아래 분포가 모집단과 똑같은 모양입니다. 대기 시간이라면 한쪽으로 쏠린 모양이죠. 그런데 n을 5, 10, 30으로 올리면 모집단이 어떤 모양이든 아래 분포는 점점 좌우 대칭인 종 모양이 됩니다. 이것이 통계학에서 가장 중요한 정리 가운데 하나인 <T en="central limit theorem">중심극한정리</T>입니다.
      </p>
      <MB note="n이 충분히 크면, 모집단의 모양과 상관없이 표본평균은 근사적으로 정규분포를 따릅니다.">{'\\bar{X} \\;\\approx\\; \\mathcal{N}\\!\\left(\\mu,\\; \\frac{\\sigma^2}{n}\\right)'}</MB>
      <p>이 식은 세 가지를 말합니다.</p>
      <ol>
        <li>
          <strong>중심:</strong> 표본평균들의 평균은 모평균 <M>{'\\mu'}</M>와 같습니다. 표본평균은 넘치게도 모자라게도 치우치지 않습니다.
        </li>
        <li>
          <strong>폭:</strong> 표본평균들의 표준편차는 <M>{'\\sigma/\\sqrt{n}'}</M>입니다. 그림 1의 두 읽음값을 비교해 보세요.
        </li>
        <li>
          <strong>모양:</strong> 모집단이 정규분포가 아니어도 표본평균의 분포는 정규분포에 가까워집니다.
        </li>
      </ol>
      <Callout kind="intuition">
        평균을 내면 큰 값과 작은 값이 서로 상쇄됩니다. n개를 모두 극단적인 값으로 뽑기는 어렵기 때문에 평균은 가운데로 모입니다. 표지의 갈톤 보드도 같은 원리입니다. 공의 최종 위치는 왼쪽(−1)과 오른쪽(+1)이라는 작은 우연 12개의 합이고, 그래서 종 모양이 쌓입니다.
      </Callout>

      <h2>표준오차와 √n 법칙</h2>
      <p>
        표본평균의 표준편차에는 따로 이름이 있습니다. <T en="standard error">표준오차</T>(SE)입니다. 개별 값이 평균에서 얼마나 흩어져 있는지가 표준편차라면, 표준오차는 <strong>표본평균이 진짜 평균에서 얼마나 벗어나기 쉬운지</strong>를 잽니다.
      </p>
      <MB note="실제로는 σ를 모르므로 표본의 표준편차 s로 바꿔 넣어 SE ≈ s/√n으로 추정합니다.">{'\\mathrm{SE}(\\bar{x}) = \\frac{\\sigma}{\\sqrt{n}}'}</MB>
      <SqrtNFigure />
      <p>
        분모가 n이 아니라 <M>{'\\sqrt{n}'}</M>이라는 점이 중요합니다. 정확도를 두 배로 높이려면 표본이 네 배 필요하고, 열 배 높이려면 백 배가 필요합니다. 여론조사가 대개 1000명 안팎에서 멈추는 이유입니다. 1000명이면 지지율의 표준오차가 약 1.6%p인데, 이를 절반으로 줄이려면 4000명을 조사해야 합니다. 놀랍게도 이 식에는 모집단의 크기가 들어 있지 않습니다. 모집단이 충분히 크면 인구가 5천만 명인 나라와 3억 명인 나라에서 필요한 표본 크기는 거의 같습니다.
      </p>
      <p>
        이 법칙은 인공지능에도 그대로 나옵니다. <a href={lessonHref('ai', 'gradient-descent')}>경사하강법</a>에서 데이터 전체 대신 일부(미니배치)로 기울기를 계산하면, 그 기울기는 전체 기울기의 표본평균입니다. 배치를 4배로 키우면 기울기의 잡음이 절반으로 줄어듭니다.
      </p>
      <Callout kind="warn">
        중심극한정리는 표본이 <strong>무작위로, 서로 독립적으로</strong> 뽑혔을 때 성립합니다. 표본을 아무리 늘려도 뽑는 방법 자체가 치우쳐 있으면 소용이 없습니다. 1936년 미국 대선에서 한 잡지는 약 240만 명의 응답을 받고도 결과를 크게 틀렸는데, 전화와 자동차 보유자 명단 등에서 응답자를 모아 상대적으로 부유한 사람들에게 치우쳤기 때문으로 알려져 있습니다. 표준오차는 우연에 의한 오차만 잴 뿐 이런 편향은 잡아내지 못합니다.
      </Callout>

      <Callout kind="key">
        표본평균은 뽑을 때마다 흔들리지만, 그 흔들림은 평균 <M>{'\\mu'}</M>, 표준오차 <M>{'\\sigma/\\sqrt{n}'}</M>인 정규분포를 따릅니다. 다음 장의 신뢰구간과 그다음 장의 가설검정은 모두 이 한 가지 사실 위에 세워집니다.
      </Callout>
      <Quiz
        q="표본 400명으로 구한 평균의 표준오차가 2였다. 표본을 1600명으로 늘리면 표준오차는 대략 얼마가 될까?"
        options={['0.5', '1', '2 (변하지 않는다)', '8']}
        answer={1}
        explain={<>표준오차는 σ/√n입니다. n이 4배가 되면 √n은 2배가 되므로 표준오차는 절반인 1이 됩니다. 0.5로 줄이려면 16배인 6400명이 필요합니다.</>}
      />
    </>
  );
}
