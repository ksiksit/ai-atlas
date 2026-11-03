import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../components/ui';
import { useCanvas2D } from '../../../lib/canvas';
import { Plot, fmt } from '../../../lib/plot';
import { alpha, usePalette } from '../../../lib/theme';
import { clamp, gauss, mean, normalInv, normalPdf, rng, tInv, variance } from '../../../lib/math';
import { lessonHref } from '../../index';
import { axisLine, tag } from './shared';

const LEVELS = [80, 90, 95, 99] as const;
type Level = (typeof LEVELS)[number];
const levelOptions = LEVELS.map((l) => ({ value: l, label: `${l}%` }));
/** Multiplier for a two-sided interval: t quantile with n−1 degrees of freedom. */
const tStar = (level: number, n: number) => tInv(0.5 + level / 200, n - 1);

/* ─────────────── Figure 1: building one interval ─────────────── */

const XBAR = 7.1;

function IntervalBuilder() {
  const P = usePalette();
  const [level, setLevel] = useState<Level>(95);
  const [n, setN] = useState(25);
  const [s, setS] = useState(1.2);
  const se = s / Math.sqrt(n);
  const t = tStar(level, n);
  const z = normalInv(0.5 + level / 200);
  const moe = t * se;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const lo = 5.5;
      const hi = 8.7;
      const barY = h - 74;
      // the curve is always drawn at the same height so that only its width changes
      const plot = new Plot(ctx, w, h, P, { xMin: lo, xMax: hi, yMin: 0, yMax: normalPdf(0, 0, se) * 1.12, pad: { l: 18, r: 18, t: 12, b: h - barY + 34 } });
      const f = (x: number) => normalPdf(x, XBAR, se);
      plot.fillUnder(f, alpha(P.stats2, 0.22), XBAR - moe, XBAR + moe);
      plot.fn(f, P.stats2, 2);
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plot.pad.l, plot.Y(0) + 0.5);
      ctx.lineTo(w - plot.pad.r, plot.Y(0) + 0.5);
      ctx.stroke();
      const peak = f(XBAR);
      const midY = plot.Y(Math.min(peak, plot.yMax) * 0.35);
      ctx.fillStyle = P.ink;
      ctx.font = `600 12px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${level}%`, plot.X(XBAR), midY);

      // the interval itself
      const x0 = plot.X(XBAR - moe);
      const x1 = plot.X(XBAR + moe);
      const cl0 = clamp(x0, 18, w - 18);
      const cl1 = clamp(x1, 18, w - 18);
      ctx.strokeStyle = P.stats2;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cl0, barY);
      ctx.lineTo(cl1, barY);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cl0, barY - 9);
      ctx.lineTo(cl0, barY + 9);
      ctx.moveTo(cl1, barY - 9);
      ctx.lineTo(cl1, barY + 9);
      ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.beginPath();
      ctx.arc(plot.X(XBAR), barY, 6, 0, Math.PI * 2);
      ctx.fill();
      tag(ctx, P, fmt(XBAR - moe, 2), clamp(x0, 40, w - 40), barY + 22, P.stats2);
      tag(ctx, P, fmt(XBAR + moe, 2), clamp(x1, 40, w - 40), barY + 22, P.stats2);
      if (x1 - x0 > 90) {
        ctx.fillStyle = P.ink2;
        ctx.font = `11px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.fillText(`x̄ = ${fmt(XBAR, 1)}`, plot.X(XBAR), barY - 16);
      }
      axisLine(ctx, P, plot.X.bind(plot), h - 26, 6, 8.5, 0.5, '하루 수면 시간 (시간)');
    },
    [P, level, n, s],
    { aspect: 2.1, maxHeight: 340, minHeight: 260 },
  );

  return (
    <Figure
      no={1}
      title="표본 하나로 구간 만들기"
      hint="신뢰수준, n, s를 바꿔 보세요"
      caption={<>n명에게 물어 평균 7.1시간, 표준편차 s를 얻었다고 해 봅시다. 보라 곡선은 표본평균이 흔들리는 폭(표준오차)을 나타내고, 칠한 가운데 영역이 신뢰수준만큼의 넓이입니다. 그 양 끝이 신뢰구간이 됩니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="신뢰수준" value={level} onChange={setLevel} options={levelOptions} />
          <Slider id="ib-n" label="표본 크기 n" value={n} min={5} max={200} step={1} onChange={setN} color="var(--c-stats-2)" />
          <Slider id="ib-s" label="표본 표준편차 s" value={s} min={0.4} max={2.4} step={0.1} onChange={setS} format={(v) => fmt(v, 1) + '시간'} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="표준오차 s/√n" value={fmt(se, 3)} />
            <Readout label="배수 t* (z*)" value={`${fmt(t, 2)} (${fmt(z, 2)})`} />
            <Readout label="오차 한계 t*·SE" value={'±' + fmt(moe, 2)} color="var(--c-stats-2)" />
            <Readout label="구간 폭" value={fmt(2 * moe, 2)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a hundred intervals ─────────────── */

const MU = 7;
const SIGMA = 1.2;
const ROWS = 100;

interface Draw {
  m: number;
  s: number;
}

function drawSamples(seed: number, n: number): Draw[] {
  const r = rng(seed);
  return Array.from({ length: ROWS }, () => {
    const xs = Array.from({ length: n }, () => MU + SIGMA * gauss(r));
    return { m: mean(xs), s: Math.sqrt(variance(xs, true)) };
  });
}

function HundredFigure() {
  const P = usePalette();
  const [level, setLevel] = useState<Level>(95);
  const [n, setN] = useState(20);
  const [seed, setSeed] = useState(1);
  const draws = useMemo(() => drawSamples(seed * 7919 + n, n), [seed, n]);
  const t = tStar(level, n);
  const ivs = draws.map((d) => ({ lo: d.m - (t * d.s) / Math.sqrt(n), hi: d.m + (t * d.s) / Math.sqrt(n), m: d.m }));
  const hits = ivs.filter((iv) => iv.lo <= MU && MU <= iv.hi).length;
  const avgWidth = mean(ivs.map((iv) => iv.hi - iv.lo));
  // running total across redraws at the current level and n
  const tally = useRef<{ key: string; seen: Set<number>; hit: number; total: number }>({ key: '', seen: new Set(), hit: 0, total: 0 });
  const key = `${level}|${n}`;
  if (tally.current.key !== key) tally.current = { key, seen: new Set(), hit: 0, total: 0 };
  if (!tally.current.seen.has(seed)) {
    tally.current.seen.add(seed);
    tally.current.hit += hits;
    tally.current.total += ROWS;
  }
  const { hit: tHit, total: tTotal } = tally.current;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const lo = 5.6;
      const hi = 8.4;
      const padX = 16;
      const X = (v: number) => padX + ((v - lo) / (hi - lo)) * (w - 2 * padX);
      const top = 12;
      const rowH = (h - top - 46) / ROWS;
      ivs.forEach((iv, i) => {
        const y = top + i * rowH + rowH / 2;
        const miss = iv.lo > MU || iv.hi < MU;
        ctx.strokeStyle = miss ? P.bad : alpha(P.stats2, 0.75);
        ctx.lineWidth = miss ? Math.max(2, rowH * 0.7) : Math.max(1.2, rowH * 0.55);
        ctx.beginPath();
        ctx.moveTo(clamp(X(iv.lo), padX, w - padX), y);
        ctx.lineTo(clamp(X(iv.hi), padX, w - padX), y);
        ctx.stroke();
        ctx.fillStyle = miss ? P.bad : P.ink2;
        ctx.fillRect(X(iv.m) - 1, y - rowH * 0.4, 2, rowH * 0.8);
      });
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(X(MU), top - 6);
      ctx.lineTo(X(MU), h - 40);
      ctx.stroke();
      tag(ctx, P, `μ = ${MU}`, X(MU), h - 46, P.ink);
      axisLine(ctx, P, X, h - 30, 6, 8, 0.5, '시간');
    },
    [P, ivs.map((iv) => iv.lo.toFixed(4)).join(), level],
    { height: 520 },
  );

  return (
    <Figure
      no={2}
      title="같은 방법으로 구간 100개를 만들면"
      hint="신뢰수준을 바꾸고 다시 뽑아 보세요"
      caption={<>실제 평균 수면 시간이 μ = 7시간인 세상에서 n명짜리 표본을 100번 뽑아, 각각 신뢰구간을 그렸습니다. 한 줄이 한 번의 조사입니다. 빨간 구간은 진짜 평균을 놓친 구간입니다. 신뢰수준을 바꾸면 같은 표본에서 구간 폭만 달라지고, 놓치는 구간 수도 달라집니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="신뢰수준" value={level} onChange={setLevel} options={levelOptions} />
          <Slider id="hf-n" label="표본 크기 n" value={n} min={5} max={100} step={1} onChange={setN} color="var(--c-stats-2)" />
          <div className="btn-row">
            <Button small primary onClick={() => setSeed((x) => x + 1)}>
              새로 100번 조사
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="μ를 포함한 구간" value={`${hits} / ${ROWS}`} color="var(--c-stats-2)" />
            <Readout label="놓친 구간" value={`${ROWS - hits}`} color="var(--bad)" />
            <Readout label="누적 포함률" value={`${fmt((tHit / tTotal) * 100, 1)}%`} />
            <Readout label="누적 구간 수" value={tTotal.toLocaleString('ko-KR')} />
            <Readout label="평균 구간 폭" value={fmt(avgWidth, 2)} />
            <Readout label="배수 t*" value={fmt(t, 3)} />
          </div>
          <Legend
            items={[
              { color: 'var(--c-stats-2)', label: 'μ를 포함', shape: 'ln' },
              { color: 'var(--bad)', label: 'μ를 놓침', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function ConfidenceInterval() {
  return (
    <>
      <h2>점 하나보다 구간</h2>
      <p>
        성인 100명에게 수면 시간을 물었더니 평균이 7.1시간이었습니다. "한국 성인의 평균 수면 시간은 7.1시간"이라고 말하면 될까요? 다른 100명을 뽑았다면 6.9시간이나 7.3시간이 나왔을 수도 있습니다. 숫자 하나로 답하는 <T en="point estimate">점추정</T>은 이 흔들림을 숨깁니다.
      </p>
      <p>
        그래서 통계학은 "6.9시간에서 7.3시간 사이"처럼 범위로 답합니다. 이것이 <T en="interval estimate">구간추정</T>이고, 일정한 규칙으로 만든 구간을 <T en="confidence interval">신뢰구간</T>이라고 부릅니다.
      </p>

      <h2>중심극한정리를 뒤집으면</h2>
      <p>
        <a href={lessonHref('stats', 'clt')}>앞 장</a>에서 표본평균 <M>{'\\bar{x}'}</M>는 진짜 평균 <M>{'\\mu'}</M>를 중심으로 표준오차 SE만큼 흔들리는 정규분포를 따른다는 것을 보았습니다. 정규분포에서는 값의 95%가 중심에서 ±1.96 표준편차 안에 들어가므로, 표본을 뽑을 때마다 95%의 확률로 <M>{'\\bar{x}'}</M>는 <M>{'\\mu \\pm 1.96\\,\\mathrm{SE}'}</M> 안에 떨어집니다.
      </p>
      <p>
        이 문장을 뒤집어 볼 수 있습니다. <M>{'\\bar{x}'}</M>가 <M>{'\\mu'}</M>에서 1.96 SE 이내에 있다는 말은 <M>{'\\mu'}</M>도 <M>{'\\bar{x}'}</M>에서 1.96 SE 이내에 있다는 말과 같습니다. 그러니 <M>{'\\bar{x}'}</M>를 중심으로 양쪽에 1.96 SE씩 펼친 구간을 만들면, 그 구간은 95%의 표본에서 <M>{'\\mu'}</M>를 품게 됩니다.
      </p>
      <MB note="σ를 모르므로 표본 표준편차 s를 쓰고, 그만큼 불확실성이 늘어나 배수 1.96 대신 조금 더 큰 t*를 씁니다.">{'\\bar{x} \\;\\pm\\; t^{*} \\cdot \\frac{s}{\\sqrt{n}} \\qquad (n\\text{이 크면 } t^{*} \\approx 1.96)'}</MB>
      <IntervalBuilder />
      <p>
        구간의 폭은 세 가지가 정합니다. <strong>신뢰수준</strong>을 높이면(95% → 99%) 더 확실히 잡으려고 그물이 넓어집니다. <strong>데이터가 흩어져</strong> 있을수록(s가 클수록) 넓어집니다. <strong>표본이 클수록</strong> 좁아지는데, √n에 비례하므로 폭을 절반으로 줄이려면 표본이 네 배 필요합니다.
      </p>
      <Callout kind="note">
        n이 작을 때 배수가 1.96보다 큰 이유: s 자체도 표본에서 구한 추정값이라 우연히 작게 나올 수 있습니다. 이 추가 불확실성을 반영한 분포가 <T en="Student's t-distribution">t분포</T>입니다. 자유도 n − 1이 커질수록 t분포는 정규분포와 같아집니다. 그림 1에서 n = 5일 때 t* = 2.78, n = 200일 때 t* ≈ 1.97인 것을 확인해 보세요.
      </Callout>

      <h2>"95%"는 무엇에 대한 확률인가</h2>
      <p>신뢰구간에서 가장 많이 틀리는 부분입니다. 한 번 조사한 결과로 만든 구간 하나만 보지 말고, 같은 조사를 100번 반복했다고 상상해 봅시다.</p>
      <HundredFigure />
      <p>
        95% 신뢰수준이면 100개 중 대략 5개가 진짜 평균을 놓칩니다. 다시 뽑기를 여러 번 누르면 누적 포함률이 95%에 가까워집니다. 즉, 95%는 <strong>구간을 만드는 방법</strong>의 성공률입니다. 이 방법을 반복해서 쓰면 그중 95%가 μ를 잡는다는 뜻입니다.
      </p>
      <Callout kind="warn">
        "μ가 6.9와 7.3 사이에 있을 확률이 95%"라고 말하면 틀린 해석입니다. μ는 정해진 하나의 값이고, 이미 만든 구간은 μ를 포함하거나 포함하지 않거나 둘 중 하나입니다. 그림 2의 각 줄이 그렇습니다. 확률은 아직 표본을 뽑기 전, 구간을 만드는 절차에 붙는 말입니다.
      </Callout>
      <p>
        신뢰수준을 99%로 올리면 놓치는 구간은 줄지만 모든 구간이 넓어집니다. 80%로 내리면 구간은 좁아지지만 다섯 번에 한 번꼴로 틀립니다. 확신과 정밀함 사이의 교환입니다. 둘 다 원한다면 방법은 하나, 표본을 늘리는 것입니다.
      </p>

      <Callout kind="key">
        신뢰구간은 <M>{'\\bar{x} \\pm t^{*}\\cdot s/\\sqrt{n}'}</M>입니다. 신뢰수준 95%는 이 방법으로 만든 구간의 95%가 진짜 값을 포함한다는 뜻이지, 이미 얻은 구간 하나가 맞을 확률이 아닙니다. 폭은 신뢰수준, 흩어짐, 표본 크기로 정해집니다.
      </Callout>
      <Quiz
        q="어느 연구에서 평균 수면 시간의 95% 신뢰구간이 6.8~7.4시간으로 나왔다. 올바른 해석은?"
        options={['응답자의 95%가 6.8~7.4시간 잔다', '같은 방법으로 조사를 반복하면 그렇게 만든 구간의 약 95%가 진짜 평균을 포함한다', '진짜 평균이 이 구간에 있을 확률이 정확히 95%다', '다시 조사하면 표본평균이 95% 확률로 이 구간에 들어온다']}
        answer={1}
        explain={<>①은 개인들의 흩어짐(표준편차)과 평균의 불확실성(표준오차)을 혼동한 것이고, ③은 이미 정해진 μ에 확률을 붙인 흔한 오해입니다. ④도 다릅니다. 새 표본평균은 이번 구간의 중심이 아니라 μ를 중심으로 흔들리기 때문입니다.</>}
      />
    </>
  );
}
