import { useMemo, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { METRICS, falsePositiveByLook, familywise, manyMetrics, peekingRuns, power, repeatExperiment, runExperiment, sampleSize } from './abtest';
import './hci.css';
import './abtest.css';

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const pp = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%p`;
const num = (v: number) => v.toLocaleString('ko-KR');

/* ─────────────── Figure 1: one experiment, and the same experiment 400 times ─────────────── */

const REPS = 400;
const N_OPTIONS = [200, 500, 1000, 2000, 5000, 10000];

function ExperimentFigure() {
  const P = usePalette();
  const [pA, setPA] = useState(0.1);
  const [pB, setPB] = useState(0.12);
  const [n, setN] = useState(1000);
  const [seed, setSeed] = useState(1);
  const e = useMemo(() => runExperiment(pA, pB, n, seed), [pA, pB, n, seed]);
  const rep = useMemo(() => repeatExperiment(pA, pB, n, REPS, 1), [pA, pB, n]);
  const sig = e.p < 0.05;
  const pw = power(pA, pB, n);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const se = Math.sqrt((pA * (1 - pA) + pB * (1 - pB)) / n);
      const pbar = (pA + pB) / 2;
      const se0 = Math.sqrt((2 * pbar * (1 - pbar)) / n);
      const lo = Math.min(0, pB - pA) - 4.2 * se;
      const hi = Math.max(0, pB - pA) + 4.2 * se;
      const NB = 40;
      const bw = (hi - lo) / NB;
      const bins = Array(NB).fill(0);
      for (const d of rep.diffs) {
        const k = Math.floor((d - lo) / bw);
        if (k >= 0 && k < NB) bins[k]++;
      }
      const top = Math.max(...bins, 1);
      const pl = new Plot(ctx, w, h, P, { xMin: lo, xMax: hi, yMin: 0, yMax: top * 1.32, pad: { l: 14, r: 14, t: 14, b: 32 } });
      pl.grid({ yStep: 1e9, fmt: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1)}`, axes: false });
      const crit = 1.96 * se0;
      for (let k = 0; k < NB; k++) {
        if (!bins[k]) continue;
        const x0 = lo + k * bw;
        const mid = x0 + bw / 2;
        ctx.fillStyle = mid > crit ? alpha(P.good, 0.75) : mid < -crit ? alpha(P.bad, 0.6) : alpha(P.ink3, 0.45);
        ctx.fillRect(pl.X(x0) + 0.5, pl.Y(bins[k]), Math.max(1, pl.X(x0 + bw) - pl.X(x0) - 1), pl.Y(0) - pl.Y(bins[k]));
      }
      pl.line(0, 0, 0, top * 1.32, P.ink, 1.5);
      pl.line(pB - pA, 0, pB - pA, top * 1.15, P.pos, 2, [5, 4]);
      pl.line(crit, 0, crit, top * 1.05, alpha(P.good, 0.9), 1, [2, 3]);
      // this experiment: its difference and 95% interval
      const yb = top * 1.24;
      pl.line(Math.max(lo, e.lo), yb, Math.min(hi, e.hi), yb, P.neg, 2.5);
      pl.line(Math.max(lo, e.lo), yb - top * 0.04, Math.max(lo, e.lo), yb + top * 0.04, P.neg, 2);
      pl.line(Math.min(hi, e.hi), yb - top * 0.04, Math.min(hi, e.hi), yb + top * 0.04, P.neg, 2);
      pl.dot(e.diff, yb, 5, P.neg, P.surface, 1.5);
      pl.text('B − A (%p)', w - 14, h - 6, P.ink3, { align: 'right', base: 'bottom', font: `11px ${P.fontBody}` });
      pl.text('진짜 차이', pl.X(pB - pA) + 4, pl.Y(top * 1.12), P.pos, { align: 'left', font: `600 10px ${P.fontBody}` });
    },
    [P, rep, e, pA, pB, n],
    { height: 250 },
  );

  return (
    <Figure
      no={1}
      title="실험 한 번과, 같은 실험 400번"
      hint="진짜 전환율과 인원을 바꾸고 실험을 다시 굴려 보세요"
      caption={
        <>
          사용자를 무작위로 반씩 나눠 A(지금 화면)와 B(새 화면)를 보여 준 가상의 실험입니다. 위쪽 막대는 이번 실험에서 실제로 구매한 사람의 비율입니다. 아래 그래프의 파란 점과 선분은 이번 실험의 차이와 95% 신뢰구간이고, 회색 막대는 같은 조건으로 실험을 {REPS}번 했을 때 나온 차이의 분포입니다. 초록 막대는 유의 수준 5%에서 "B가 낫다"고 결론 내릴 만큼 큰 차이, 주황 점선은 사용자가 모르는 진짜 차이입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="hc-col">
          <div className="ab-arms">
            {[
              { name: 'A', x: e.xA, r: e.pA, c: 'var(--ink-3)' },
              { name: 'B', x: e.xB, r: e.pB, c: 'var(--neg)' },
            ].map((a) => (
              <div key={a.name} className="ab-arm" style={{ ['--c' as string]: a.c }}>
                <span className="ab-arm-name">{a.name}</span>
                <span className="ab-arm-bar">
                  <i style={{ width: `${Math.min(100, (a.r / 0.35) * 100)}%` }} />
                </span>
                <span className="mono ab-arm-val">
                  {num(a.x)} / {num(n)} = {pct(a.r)}
                </span>
              </div>
            ))}
          </div>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`이번 실험의 차이는 ${pp(e.diff)}, 95% 신뢰구간은 ${pp(e.lo)}에서 ${pp(e.hi)}, p값 ${e.p.toFixed(3)}. 같은 실험 ${REPS}번 중 ${rep.sig}번이 B가 유의하게 낫다고 나왔습니다.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="hc-note" data-good={sig && e.diff > 0 ? '' : undefined} data-bad={sig && e.diff < 0 ? '' : undefined} aria-live="polite">
            {sig
              ? e.diff > 0
                ? `p = ${e.p.toFixed(3)} < 0.05. 진짜 차이가 0이라면 이만큼 큰 차이가 나올 확률이 5%도 안 되므로 "B가 낫다"고 결론 냅니다.`
                : `p = ${e.p.toFixed(3)} < 0.05인데 방향이 반대입니다. B가 오히려 나쁘다고 결론 내게 됩니다.`
              : `p = ${e.p.toFixed(3)}. 이 정도 차이는 진짜 차이가 0이어도 우연히 흔히 나오므로 "차이가 있다"고 말할 수 없습니다.${pB !== pA ? ' 진짜로는 차이가 있는데도 놓친 것입니다.' : ''}`}
          </div>
        </div>
        <div className="controls">
          <Slider id="ab-pa" label="A의 진짜 전환율" value={pA} min={0.02} max={0.3} step={0.005} onChange={setPA} format={(v) => pct(v)} />
          <Slider id="ab-pb" label="B의 진짜 전환율" value={pB} min={0.02} max={0.3} step={0.005} onChange={setPB} format={(v) => pct(v)} color="var(--neg)" />
          <Seg label="한쪽에 배정한 사용자 수" value={n} options={N_OPTIONS.map((v) => ({ value: v, label: v >= 1000 ? `${v / 1000}천` : String(v) }))} onChange={setN} />
          <Button small onClick={() => setSeed((x) => x + 1)}>
            실험 다시 굴리기
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="관찰한 차이" value={pp(e.diff)} color="var(--neg)" />
            <Readout label="z" value={e.z.toFixed(2)} />
            <Readout label="p값" value={e.p.toFixed(3)} color={sig ? 'var(--good)' : undefined} />
            <Readout label={`${REPS}번 중 B 승`} value={`${rep.sig}번`} />
          </div>
          <div className="hc-small">
            95% 신뢰구간 {pp(e.lo)} ~ {pp(e.hi)} · 이 인원의 검정력(공식) {pct(pw, 0)}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: how many users before you start ─────────────── */

function SampleSizeFigure() {
  const P = usePalette();
  const [base, setBase] = useState(0.1);
  const [mde, setMde] = useState(0.02);
  const [pow, setPow] = useState(0.8);
  const [a, setA] = useState(0.05);
  const [daily, setDaily] = useState(2000);
  const n = sampleSize(base, base + mde, a, pow);
  const days = Math.ceil((2 * n) / daily);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const xs = Array.from({ length: 91 }, (_, k) => 0.005 + k * 0.0005);
      const L = (v: number) => Math.log10(v);
      const pl = new Plot(ctx, w, h, P, { xMin: 0.005, xMax: 0.05, yMin: 2, yMax: 6, pad: { l: 52, r: 14, t: 14, b: 32 } });
      pl.grid({ xStep: 0.01, yStep: 1, fmt: (v) => (v >= 2 ? (10 ** v >= 1e6 ? '100만' : num(10 ** v)) : `${(v * 100).toFixed(0)}%p`) });
      ctx.strokeStyle = P.neg;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      xs.forEach((x, k) => {
        const y = L(Math.min(1e6, sampleSize(base, base + x, a, pow)));
        if (k) ctx.lineTo(pl.X(x), pl.Y(y));
        else ctx.moveTo(pl.X(x), pl.Y(y));
      });
      ctx.stroke();
      const yn = L(Math.min(1e6, n));
      pl.line(mde, 2, mde, yn, alpha(P.ink, 0.35), 1, [4, 3]);
      pl.line(0.005, yn, mde, yn, alpha(P.ink, 0.35), 1, [4, 3]);
      pl.dot(mde, yn, 5, P.neg, P.surface, 1.5);
      pl.text(`${num(n)}명`, mde, yn, P.ink, { dx: 8, dy: -10, align: 'left', font: `600 11px ${P.fontMono}`, bg: P.surface });
      pl.text('찾고 싶은 최소 차이', w - 14, h - 6, P.ink3, { align: 'right', base: 'bottom', font: `11px ${P.fontBody}` });
    },
    [P, base, mde, pow, a, n],
    { height: 250 },
  );

  return (
    <Figure
      no={2}
      title="실험 전에 정하는 표본 수"
      hint="찾고 싶은 차이를 반으로 줄여 보세요"
      caption={
        <>
          세로축은 한쪽에 필요한 사용자 수이고 로그 눈금입니다(한 칸에 10배). 지금 전환율, 놓치고 싶지 않은 가장 작은 차이, 유의 수준 α, 검정력을 정하면 필요한 인원이 정해집니다. 하루 방문자를 넣으면 두 집단을 다 채우는 데 걸리는 날수를 계산합니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="hc-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`최소 차이에 따른 필요 표본 수 곡선. 지금 설정에서 한쪽에 ${num(n)}명이 필요합니다.`}>
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Slider id="ab-base" label="지금 전환율" value={base} min={0.02} max={0.3} step={0.01} onChange={setBase} format={(v) => pct(v, 0)} />
          <Slider id="ab-mde" label="찾고 싶은 최소 차이" value={mde} min={0.005} max={0.05} step={0.0025} onChange={setMde} format={(v) => `${(v * 100).toFixed(2).replace(/0$/, '')}%p`} color="var(--neg)" />
          <Slider id="ab-pow" label="검정력 (진짜 차이를 찾아낼 확률)" value={pow} min={0.5} max={0.95} step={0.05} onChange={setPow} format={(v) => pct(v, 0)} />
          <Seg label="유의 수준 α" value={a} options={[0.01, 0.05, 0.1].map((v) => ({ value: v, label: String(v) }))} onChange={setA} />
          <Slider id="ab-daily" label="하루 방문자" value={daily} min={500} max={20000} step={500} onChange={setDaily} format={num} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="한쪽" value={`${num(n)}명`} color="var(--neg)" />
            <Readout label="걸리는 날" value={`${days}일`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: peeking ─────────────── */

const PEEK_TOTAL = 2000;
const PEEK_RUNS = 1000;
const SHOWN = 40;

function PeekingFigure() {
  const P = usePalette();
  const [every, setEvery] = useState(100);
  const [seed, setSeed] = useState(1);
  const runs = useMemo(() => peekingRuns(0.1, PEEK_TOTAL, every, PEEK_RUNS, seed), [every, seed]);
  const looks = runs[0].zs.length;
  const fp = useMemo(() => falsePositiveByLook(runs, looks), [runs, looks]);
  const once = runs.filter((r) => Math.abs(r.zs[looks - 1]) > 1.959964).length / PEEK_RUNS;
  const nAt = (k: number) => Math.min(PEEK_TOTAL, (k + 1) * every);

  const paths = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: PEEK_TOTAL, yMin: -4, yMax: 4, pad: { l: 34, r: 12, t: 12, b: 28 } });
      ctx.fillStyle = alpha(P.surface2, 0.9);
      ctx.fillRect(pl.X(0), pl.Y(1.96), pl.X(PEEK_TOTAL) - pl.X(0), pl.Y(-1.96) - pl.Y(1.96));
      pl.grid({ xStep: 500, yStep: 2 });
      pl.line(0, 1.96, PEEK_TOTAL, 1.96, alpha(P.bad, 0.7), 1, [4, 3]);
      pl.line(0, -1.96, PEEK_TOTAL, -1.96, alpha(P.bad, 0.7), 1, [4, 3]);
      for (const r of runs.slice(0, SHOWN)) {
        const bad = r.stop >= 0;
        ctx.strokeStyle = bad ? alpha(P.bad, 0.75) : alpha(P.ink3, 0.4);
        ctx.lineWidth = bad ? 1.6 : 1;
        ctx.beginPath();
        ctx.moveTo(pl.X(0), pl.Y(0));
        r.zs.forEach((z, k) => ctx.lineTo(pl.X(nAt(k)), pl.Y(Math.max(-4, Math.min(4, z)))));
        ctx.stroke();
        if (bad) pl.dot(nAt(r.stop), Math.max(-4, Math.min(4, r.zs[r.stop])), 3.5, P.bad, P.surface, 1);
      }
      pl.text('한쪽 사용자 수', w - 12, h - 4, P.ink3, { align: 'right', base: 'bottom', font: `11px ${P.fontBody}` });
      pl.text('z', 6, 10, P.ink3, { align: 'left', font: `600 11px ${P.fontMono}` });
    },
    [P, runs, every],
    { height: 250 },
  );

  const curve = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: PEEK_TOTAL, yMin: 0, yMax: 0.35, pad: { l: 34, r: 12, t: 10, b: 26 } });
      // x ticks are user counts (0, 500 …); y ticks are shares (0.1 …), shown in percent
      pl.grid({ xStep: 500, yStep: 0.1, fmt: (v) => (v > 1 ? String(v) : v === 0 ? '0' : `${Math.round(v * 100)}%`) });
      pl.line(0, 0.05, PEEK_TOTAL, 0.05, P.good, 1.5, [5, 4]);
      ctx.strokeStyle = P.bad;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(pl.X(0), pl.Y(0));
      fp.forEach((v, k) => {
        ctx.lineTo(pl.X(k === 0 ? 0 : nAt(k - 1)), pl.Y(v));
        ctx.lineTo(pl.X(nAt(k)), pl.Y(v));
      });
      ctx.stroke();
      pl.text('5%', PEEK_TOTAL, 0.05, P.good, { dx: -4, dy: -9, align: 'right', font: `600 10px ${P.fontMono}` });
    },
    [P, fp, every],
    { height: 150 },
  );

  return (
    <Figure
      no={3}
      title="A와 B가 똑같은데도 이기는 실험"
      hint="들여다보는 간격을 바꿔 보세요"
      caption={
        <>
          A와 B의 진짜 전환율이 둘 다 10%인 실험(A/A 테스트)을 {num(PEEK_RUNS)}번 했습니다. 한쪽에 {num(PEEK_TOTAL)}명이 찰 때까지, 정해진 인원마다 결과를 들여다보고 |z| &gt; 1.96(p &lt; 0.05)이면 그 자리에서 "B가 다르다"고 멈추는 실험자를 흉내 냈습니다. 위 그림은 그중 {SHOWN}번의 z가 걸어간 길이고, 빨간 길은 중간에 멈춘 실험입니다. 아래 그림은 인원이 찰수록 지금까지 멈춘 실험의 비율이 어떻게 쌓이는지 보여 줍니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="hc-col">
          <div ref={paths.wrapRef} className="canvas-box" role="img" aria-label={`A/A 테스트 ${SHOWN}번의 z 경로. 한쪽 ${every}명마다 들여다봅니다.`}>
            <canvas ref={paths.canvasRef} />
          </div>
          <div ref={curve.wrapRef} className="canvas-box" role="img" aria-label={`중간에 멈춘 비율이 ${looks}번 들여다본 뒤 ${pct(fp[looks - 1])}까지 쌓입니다.`}>
            <canvas ref={curve.canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Seg label="몇 명마다 들여다보나 (한쪽)" value={every} options={[100, 200, 500, 1000, 2000].map((v) => ({ value: v, label: num(v) }))} onChange={setEvery} />
          <Button small onClick={() => setSeed((x) => x + 1)}>
            다른 {num(PEEK_RUNS)}번 굴리기
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="들여다본 횟수" value={`${looks}번`} />
            <Readout label="중간에 멈춤" value={pct(fp[looks - 1])} color="var(--bad)" />
            <Readout label="끝에서 한 번만 봄" value={pct(once)} color="var(--good)" />
            <Readout label="약속한 오류율" value="5.0%" />
          </div>
          <Legend
            items={[
              { color: 'var(--bad)', label: '중간에 멈춘 실험', shape: 'ln' },
              { color: 'var(--ink-3)', label: '끝까지 간 실험', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: twenty metrics ─────────────── */

function MetricsFigure() {
  const [seed, setSeed] = useState(1);
  const [bonf, setBonf] = useState(false);
  const ps = useMemo(() => manyMetrics(METRICS.length, 2000, 0.1, seed), [seed]);
  const cut = bonf ? 0.05 / METRICS.length : 0.05;
  const hits = ps.filter((p) => p < cut).length;

  return (
    <Figure
      no={4}
      title="지표 스무 개 중 하나는 움직인다"
      hint="다시 굴리거나 기준을 엄격하게 바꿔 보세요"
      caption={
        <>
          또 A/A 테스트입니다. 이번에는 한쪽 {num(2000)}명으로 지표 {METRICS.length}개를 함께 비교했습니다. 모든 지표에서 A와 B의 진짜 비율은 같습니다(10%). 칸마다 그 지표의 p값이고, 기준보다 작으면 색이 칠해집니다. 본페로니 보정은 기준을 지표 수로 나눠 0.05 / {METRICS.length} = 0.0025로 낮춥니다.
        </>
      }
    >
      <div className="ab-metrics" aria-live="polite">
        {METRICS.map((m, i) => (
          <div key={m} className="ab-metric" data-sig={ps[i] < cut || undefined} data-near={(bonf && ps[i] < 0.05 && ps[i] >= cut) || undefined}>
            <span>{m}</span>
            <span className="mono">p = {ps[i] < 0.001 ? ps[i].toExponential(1) : ps[i].toFixed(3)}</span>
          </div>
        ))}
      </div>
      <div className="controls row" style={{ marginTop: 14 }}>
        <Check label="본페로니 보정 (기준 0.0025)" checked={bonf} onChange={setBonf} />
        <Button small onClick={() => setSeed((x) => x + 1)}>
          다시 굴리기
        </Button>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 12 }}>
        <Readout label="유의하게 나온 지표" value={`${hits}개`} color={hits ? 'var(--bad)' : 'var(--good)'} />
        <Readout label="기준" value={String(cut)} />
        <Readout label="하나라도 나올 확률" value={pct(familywise(METRICS.length, cut))} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function ABTesting() {
  const e0 = runExperiment(0.1, 0.12, 1000, 1);
  const rep0 = repeatExperiment(0.1, 0.12, 1000, REPS, 1);
  const n0 = sampleSize(0.1, 0.12);
  return (
    <>
      <h2>버튼 색을 바꿨더니 구매가 늘었다면</h2>
      <p>
        쇼핑 앱의 "구매하기" 버튼을 회색에서 파란색으로 바꾼 다음 주에 구매가 8% 늘었다고 해 봅시다. 버튼 색 덕분일까요? 그 주에 월급날이 있었을 수도 있고, 마케팅 팀이 할인 쿠폰을 뿌렸을 수도 있고, 날씨가 추워져 사람들이 집에서 쇼핑을 더 했을 수도 있습니다. 바꾸기 전과 후를 비교하면 그 사이에 달라진 모든 것이 섞여 버립니다.
      </p>
      <p>
        <T en="A/B test">A/B 테스트</T>는 이것을 피하려고 <strong>같은 기간에</strong> 사용자를 <T en="random assignment">무작위로</T> 두 집단으로 나눠 한쪽(A, 대조군)에는 지금 화면을, 다른 쪽(B, 실험군)에는 새 화면을 보여 줍니다. 보통 사용자 번호를 해시해서 짝수면 A, 홀수면 B처럼 나누므로 같은 사람은 계속 같은 화면을 봅니다. 월급날도 쿠폰도 날씨도 두 집단에 똑같이 영향을 주므로, 남는 차이는 화면의 차이와 우연뿐입니다. 비교하는 지표는 흔히 <T en="conversion rate">전환율</T>, 즉 방문한 사람 중 구매(또는 가입, 클릭)한 사람의 비율입니다.
      </p>

      <h2>그 차이가 우연이 아닐까</h2>
      <p>
        남은 문제는 우연입니다. 진짜 전환율이 둘 다 10%여도 1,000명씩 나누면 한쪽은 97명, 다른 쪽은 108명이 살 수 있습니다. 그래서 "진짜 차이가 0이라면 이만큼 큰 차이가 우연히 나올 확률"인 <a href={lessonHref('stats-basics', 'hypothesis-testing')}>p값</a>을 계산합니다. 두 비율을 비교할 때는 두 집단을 합친 전환율 p̂로 표준 오차를 구하는 z 검정을 많이 씁니다.
      </p>
      <MB note="x: 구매한 사람 수, n: 배정한 사람 수, p̂ = (x_A + x_B) / (n_A + n_B)">{String.raw`z = \frac{\hat p_B - \hat p_A}{\sqrt{\hat p(1-\hat p)\left(\frac{1}{n_A} + \frac{1}{n_B}\right)}}`}</MB>
      <p>
        |z|가 1.96보다 크면 p &lt; 0.05입니다. 그림 1에서 A의 진짜 전환율은 10%, B는 12%로, B가 정말로 2%p 낫게 해 두었습니다. 하지만 실험하는 사람은 이 값을 모르고 위의 막대만 봅니다.
      </p>
      <ExperimentFigure />
      <p>
        처음 실험에서는 A에서 {e0.xA}명, B에서 {e0.xB}명이 사서 차이가 {pp(e0.diff)}에 그쳤고 p = {e0.p.toFixed(3)}입니다. 95% <a href={lessonHref('stats-basics', 'confidence-interval')}>신뢰구간</a>({pp(e0.lo)} ~ {pp(e0.hi)})이 0을 넉넉히 품고 있으니 "차이가 있다"고 말할 수 없습니다. B가 진짜로 나은데도 놓친 것입니다. 회색 막대를 보면 이것이 운이 나빠서만이 아닙니다. 같은 실험을 {REPS}번 하면 B가 유의하게 낫다고 나오는 것은 {rep0.sig}번({pct(rep0.sig / REPS, 0)})뿐이고, {rep0.diffs.filter((d) => d <= 0).length}번은 오히려 B가 같거나 못하게 나옵니다. 한쪽 인원을 5천 명으로 늘려 보면 막대가 좁아지면서 대부분 초록 영역으로 넘어갑니다. 표본이 클수록 관찰한 비율이 진짜 비율 가까이 모인다는 <a href={lessonHref('math-probability', 'limits')}>대수의 법칙</a> 덕분입니다.
      </p>
      <Callout kind="note">
        "유의하지 않다"는 "차이가 없다"는 뜻이 아닙니다. 이 인원으로는 있는지 없는지 가려낼 수 없었다는 뜻일 뿐입니다. 반대로 "유의하다"도 차이가 크다는 뜻이 아닙니다. 사용자가 수백만 명이면 0.01%p 차이도 유의하게 나오지만, 그 차이가 바꾸는 비용을 감당할 만한지는 따로 따져야 합니다. 그래서 p값과 함께 신뢰구간으로 차이의 크기를 보고합니다.
      </Callout>

      <h2>몇 명이 필요한지는 미리 정합니다</h2>
      <p>
        진짜 차이가 있을 때 실험이 그것을 찾아낼 확률을 <T en="statistical power">검정력</T>이라고 합니다. 그림 1의 설정(10% 대 12%, 1,000명씩)은 검정력이 30%쯤이라, 열 번 중 일곱 번은 진짜 효과를 놓칩니다. 그래서 실험을 시작하기 전에 "적어도 이만큼의 차이라면 놓치고 싶지 않다"는 <T en="minimum detectable effect">최소 탐지 효과</T>와 원하는 검정력(흔히 80%)을 정하고, 거기에 맞는 인원을 계산합니다.
      </p>
      <MB note="z_{1−α/2} = 1.96 (α = 0.05), z_{1−β} = 0.84 (검정력 80%), p̄ = (p₁ + p₂) / 2">{String.raw`n = \frac{\left(z_{1-\alpha/2}\sqrt{2\bar p(1-\bar p)} + z_{1-\beta}\sqrt{p_1(1-p_1)+p_2(1-p_2)}\right)^2}{(p_2-p_1)^2}`}</MB>
      <SampleSizeFigure />
      <p>
        10%에서 12%로의 변화를 검정력 80%로 찾으려면 한쪽에 <strong>{num(n0)}명</strong>, 모두 {num(2 * n0)}명이 필요합니다. 하루 방문자가 2,000명이면 4일입니다. 분모에 차이의 제곱이 있으므로 찾고 싶은 차이를 1%p로 반 줄이면 필요한 인원은 {num(sampleSize(0.1, 0.11))}명으로 거의 네 배가 됩니다. 검정력을 90%로 올리면 {num(sampleSize(0.1, 0.12, 0.05, 0.9))}명, 유의 수준을 0.01로 엄격하게 하면 {num(sampleSize(0.1, 0.12, 0.01))}명입니다. 방문자가 적은 서비스가 작은 개선을 A/B 테스트로 확인하기 어려운 이유입니다. 그럴 때는 더 큰 변화를 시험하거나, 앞 장에서 다룬 <a href={lessonHref('cs-hci', 'usability-testing')}>사용성 평가</a>처럼 적은 인원으로 할 수 있는 방법을 씁니다.
      </p>

      <h2>결과를 미리 들여다보면</h2>
      <p>
        4일짜리 실험을 시작했는데 이틀째 대시보드를 보니 B가 이기고 있고 p = 0.03입니다. 여기서 멈추고 B를 출시하면 안 될까요? 그림 3은 이런 실험자를 흉내 냅니다. A와 B가 완전히 똑같은 A/A 테스트에서, 결과를 자주 들여다보다가 p &lt; 0.05가 처음 나오는 순간 멈추면 어떻게 되는지 봅니다.
      </p>
      <PeekingFigure />
      <p>
        한쪽 100명마다(모두 20번) 들여다보면 1,000번의 A/A 테스트 중 <strong>25.8%</strong>가 중간에 "유의한 차이"를 내고 멈춥니다. 끝에서 한 번만 보면 4.0%로, 약속한 5% 근처입니다. 차이가 없어도 z는 0 근처를 이리저리 걸어 다니는 무작위 걸음이라 오래 지켜보면 언젠가 경계를 한 번쯤 넘기 때문입니다. 들여다볼 때마다 새로 주사위를 던지는 셈이라, 들여다보는 횟수가 많을수록 거짓 양성이 쌓입니다. 500명마다 4번만 봐도 13.7%, 1,000명마다 2번이면 6.1%입니다.
      </p>
      <p>
        해결책은 둘 중 하나입니다. 실험 전에 정한 인원이 찰 때까지 결론을 내지 않거나, 처음부터 여러 번 들여다볼 것을 감안한 <T en="sequential testing">순차 검정</T>을 쓰는 것입니다. 순차 검정은 이른 시점의 경계를 훨씬 엄격하게 잡아(예를 들어 오브라이언-플레밍 경계) 전체 오류율을 5%로 묶습니다. 대형 실험 플랫폼들은 이런 방법을 기본으로 씁니다.
      </p>

      <h2>지표를 많이 볼수록</h2>
      <p>
        같은 함정이 다른 모양으로도 나타납니다. 실험 하나에서 구매율만 보는 것이 아니라 장바구니, 이탈률, 검색, 재방문까지 지표 스무 개를 함께 보면, 진짜 차이가 하나도 없어도 각 지표가 5% 확률로 유의하게 나옵니다.
      </p>
      <MB>{String.raw`P(\text{하나라도 유의}) = 1 - (1 - 0.05)^{20} \approx 64.2\%`}</MB>
      <MetricsFigure />
      <p>
        처음 결과에서는 "쿠폰 사용"이 p = 0.007로 유의하게 나왔습니다. 진짜로는 아무 차이도 없는데, 이것만 보고 "새 화면이 쿠폰 사용을 늘린다"는 보고서를 쓰기 쉽습니다. 막으려면 실험 전에 판단의 기준이 될 <strong>주 지표 하나</strong>를 정해 두고, 나머지는 참고로만 봅니다. 여러 지표를 꼭 함께 판단해야 하면 본페로니처럼 기준을 지표 수만큼 엄격하게 고칩니다. 보정하면 하나라도 잘못 나올 확률이 4.9%로 내려갑니다.
      </p>

      <h2>숫자 밖의 것들</h2>
      <p>
        A/B 테스트는 짧은 기간의 행동을 잽니다. 화면이 바뀌면 낯설어서 일단 눌러 보는 <T en="novelty effect">새로움 효과</T> 때문에 첫 며칠은 B가 좋아 보이다가 사라지기도 하고, 반대로 익숙한 것이 바뀐 데 대한 거부감 때문에 처음에만 나빠 보이기도 합니다. 그래서 적어도 한두 주(요일 효과가 한 바퀴 돌도록) 돌리고, 처음 방문한 사용자와 기존 사용자를 나눠 봅니다. 또 클릭 수처럼 재기 쉬운 지표만 올리다 보면, <a href={lessonHref('cs-hci', 'design-principles')}>다크 패턴</a>처럼 단기 지표는 올리지만 사용자의 신뢰를 깎는 설계를 고르게 됩니다. 탈퇴율, 환불, 불만 접수 같은 지표를 <T en="guardrail metric">가드레일 지표</T>로 함께 지켜봅니다.
      </p>
      <Callout kind="warn">
        A/B 테스트는 사람을 대상으로 한 실험입니다. 사용자 대부분은 자신이 실험에 들어 있다는 것을 모릅니다. 2014년 페이스북이 약 69만 명의 뉴스피드에서 긍정적이거나 부정적인 글을 줄여 감정이 옮는지 본 연구가 공개되자, 동의 없이 사람의 감정을 건드렸다는 비판이 크게 일었습니다. 버튼 색처럼 사소한 변화는 괜찮지만, 가격을 사람마다 다르게 하거나, 해로울 수 있는 변화(건강 정보, 금융 결정, 아이들)를 시험하려면 따로 검토하고, 필요하면 동의를 받아야 합니다. 이길 것 같아도 사용자를 속이는 변형은 처음부터 시험하지 않습니다.
      </Callout>

      <Callout kind="key">
        A/B 테스트는 같은 기간의 사용자를 무작위로 나눠 화면 말고는 모든 조건을 같게 만든 뒤, 두 전환율의 차이가 우연으로 설명되는지 z 검정과 신뢰구간으로 판단합니다. 놓치고 싶지 않은 최소 차이와 검정력으로 필요한 인원을 미리 정하는데, 차이를 반으로 줄이면 인원은 네 배가 됩니다. 정한 인원이 차기 전에 결과를 들여다보다 멈추거나, 지표를 여럿 보고 유의한 것만 고르면 거짓 양성이 5%를 훌쩍 넘으므로, 끝까지 기다리거나 순차 검정을 쓰고, 주 지표를 하나 정해 둡니다.
      </Callout>
      <Quiz
        q="표본 수를 계산해 2주짜리 A/B 테스트를 시작했다. 3일째에 B의 구매율이 높고 p = 0.03이 나왔다. 가장 알맞은 행동은?"
        options={['p < 0.05이므로 바로 B를 출시한다', '정한 인원이 찰 때까지 기다린 뒤 그때의 결과로 판단한다', 'p값이 더 내려갈 때까지 기다렸다가 가장 낮을 때 멈춘다', '지표를 더 추가해서 B가 이기는 지표를 찾는다']}
        answer={1}
        explain={<>중간에 들여다보고 p &lt; 0.05일 때 멈추면, 진짜 차이가 없어도 그림 3처럼 거짓 양성이 크게 늘어납니다. p값이 가장 낮을 때 멈추는 것도 같은 문제이고, 지표를 늘려 이기는 것을 찾으면 그림 4의 여러 번 비교 문제가 됩니다. 처음 정한 인원까지 기다리거나, 처음부터 순차 검정으로 설계해야 합니다.</>}
      />
    </>
  );
}
