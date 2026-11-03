import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useAnimationFrame, useCanvas2D, useInView } from '../../../../lib/canvas';
import { Plot, fmt } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { korNum, sci } from '../../deep/lessons/sequence';
import { LAW, TOY_DATA, TOY_RANKS, TOY_STEPS, TOY_V, ToyExperiment, fitPowerLaw, fitPowerLawFloor, isoLoss, optimalN, powerLoss, toyParams } from './build';
import './build.css';

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const pow10 = (k: number) =>
  '10' +
  String(k)
    .split('')
    .map((c) => SUP[c])
    .join('');

/** Tick labels for a log10 axis: 10ⁿ at every `step` decades. */
function logTicks(ctx: CanvasRenderingContext2D, plot: Plot, P: ReturnType<typeof usePalette>, axis: 'x' | 'y', from: number, to: number, step: number, label?: (k: number) => string) {
  ctx.save();
  ctx.fillStyle = P.ink3;
  ctx.font = `11px ${P.fontMono}`;
  for (let k = Math.ceil(from); k <= to + 1e-9; k += step) {
    const s = label ? label(k) : pow10(k);
    if (axis === 'x') {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(s, plot.X(k), plot.pad.t + plot.ph + 6);
    } else {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(s, plot.pad.l - 6, plot.Y(k));
    }
  }
  ctx.restore();
}

/* ─────────────── Figure 1: a power law with a floor ─────────────── */

const NC = 1e10;

function PowerLawFigure() {
  const P = usePalette();
  const [a, setA] = useState(0.3);
  const [E, setE] = useState(1.7);
  const [logN, setLogN] = useState(8);
  const [axes, setAxes] = useState<'log' | 'lin'>('log');
  const N = Math.pow(10, logN);
  const L = powerLoss(N, NC, a, E);
  const red = L - E;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 46, r: 14, t: 14, b: 30 };
      if (axes === 'log') {
        const plot = new Plot(ctx, w, h, P, { xMin: 5, xMax: 13, yMin: -1, yMax: 2, pad });
        plot.grid({ xStep: 1, yStep: 1, labels: false, axes: false });
        logTicks(ctx, plot, P, 'x', 5, 13, w < 480 ? 2 : 1);
        logTicks(ctx, plot, P, 'y', -1, 2, 1, (k) => (k < 0 ? '0.1' : String(Math.pow(10, k))));
        if (E > 0) plot.line(5, Math.log10(E), 13, Math.log10(E), P.ink3, 1.5, [2, 4]);
        plot.fn((x) => Math.log10(Math.pow(NC / Math.pow(10, x), a)), P.pos, 2, { dash: [6, 5] });
        plot.fn((x) => Math.log10(powerLoss(Math.pow(10, x), NC, a, E)), P.accent, 2.6);
        plot.line(logN, -1, logN, 2, alpha(P.ink, 0.3), 1, [4, 4]);
        plot.dot(logN, Math.log10(L), 5, P.accent, P.surface, 2);
        if (E > 0) plot.text(`E = ${fmt(E, 2)}`, 13, Math.log10(E), P.ink2, { align: 'right', dx: -4, dy: -12, bg: P.surface, font: `12px ${P.fontBody}` });
        plot.text('손실 L', 5, 2, P.ink2, { dx: 6, dy: 10, font: `12px ${P.fontBody}` });
        plot.text('파라미터 수 N', 13, -1, P.ink2, { align: 'right', dx: -4, dy: -10, font: `12px ${P.fontBody}` });
      } else {
        const xMax = 1e10;
        const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax, yMin: 0, yMax: 40, pad });
        plot.grid({ xStep: 2e9, yStep: 10, fmt: (v) => (v === 0 ? '0' : v >= 1e9 ? `${v / 1e9}B` : String(v)), xLabel: '파라미터 수 N', yLabel: '손실 L' });
        if (E > 0) plot.line(0, E, xMax, E, P.ink3, 1.5, [2, 4]);
        plot.fn((x) => powerLoss(Math.max(x, 1e3), NC, a, E), P.accent, 2.6, { samples: 600 });
        if (N <= xMax) plot.dot(N, Math.min(L, 40), 5, P.accent, P.surface, 2);
      }
    },
    [P, a, E, logN, axes, L, N],
    { aspect: 1.6, maxHeight: 360, minHeight: 240 },
  );

  return (
    <Figure
      no={1}
      title="거듭제곱 법칙과 바닥"
      hint="지수와 바닥을 바꿔 보세요"
      caption={
        <>
          <M>{'L(N) = (N_c/N)^{\\alpha} + E'}</M>, <M>{'N_c = 10^{10}'}</M>로 둔 예시 곡선입니다. 진한 선이 손실, 주황 점선이 줄일 수 있는 부분 <M>{'(N_c/N)^{\\alpha}'}</M>, 회색 점선이 바닥 E입니다. 로그–로그 축에서 주황 점선은 기울기 −α인 직선이고, 손실은 그 직선을 따라 내려오다 E에 가까워지면 휘어서 수평이 됩니다. 보통 축으로 바꾸면 같은 곡선이 처음에 확 떨어지고 나머지는 평평한 꼴이 되어, 큰 모델 쪽의 차이가 보이지 않습니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`N = ${sci(N)}에서 손실 ${fmt(L, 2)}, 줄일 수 있는 부분 ${fmt(red, 3)}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg
            label="축"
            value={axes}
            onChange={setAxes}
            options={[
              { value: 'log', label: '로그–로그' },
              { value: 'lin', label: '보통 축' },
            ]}
          />
          <Slider id="sc-alpha" label="지수 α" value={a} min={0.05} max={0.6} step={0.01} onChange={setA} format={(v) => fmt(v, 2)} />
          <Slider id="sc-E" label="바닥 E" value={E} min={0} max={3} step={0.05} onChange={setE} format={(v) => fmt(v, 2)} />
          <Slider id="sc-N" label="모델 크기 N" value={logN} min={5} max={13} step={0.1} onChange={setLogN} format={(v) => sci(Math.pow(10, v))} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="손실 L" value={fmt(L, 3)} color="var(--accent)" />
            <Readout label="줄일 수 있는 부분" value={fmt(red, 3)} color="var(--pos)" />
            <Readout label="N을 10배로 키우면" value={`× ${fmt(Math.pow(10, -a), 2)}`} />
            <Readout label="바닥의 몫" value={`${Math.round((E / L) * 100)}%`} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--accent)', label: '손실 L(N)', shape: 'ln' },
          { color: 'var(--pos)', label: '(N_c/N)^α', shape: 'ln' },
          { color: 'var(--ink-3)', label: '바닥 E', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: measure it on a toy ─────────────── */

const FRAME_MS = 9;

function ToyScalingFigure() {
  const P = usePalette();
  const exp = useRef<ToyExperiment | null>(null);
  if (!exp.current) exp.current = new ToyExperiment();
  const [, setTick] = useState(0);
  const [running, setRunning] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const inView = useInView(boxRef);
  const ex = exp.current;

  useAnimationFrame(() => {
    ex.advance(FRAME_MS);
    setTick((t) => t + 1);
    if (ex.done) setRunning(false);
  }, running && inView && !ex.done);

  const reset = () => {
    exp.current = new ToyExperiment();
    setTick((t) => t + 1);
    setRunning(true);
  };

  const H = ex.teacher.H;
  const Ns = TOY_RANKS.map((r) => toyParams(r));
  const lastD = TOY_DATA.length - 1;
  const big = ex.results[lastD];
  const bigDone = big.every((v) => isFinite(v));
  const fitH = bigDone ? fitPowerLaw(Ns, big.map((L) => L - H)) : null;
  const fitE = bigDone ? fitPowerLawFloor(Ns, big) : null;
  const finished = ex.next;
  const colors = TOY_DATA.map((_, d) => alpha(P.accent, 0.25 + (0.75 * d) / (TOY_DATA.length - 1)));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const lx = (n: number) => Math.log10(n);
      const plot = new Plot(ctx, w, h, P, { xMin: 2.2, xMax: 3.4, yMin: -2.6, yMax: -0.2, pad: { l: 50, r: 14, t: 14, b: 30 } });
      plot.grid({ xStep: 0.2, yStep: 0.5, labels: false, axes: false });
      ctx.save();
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const xt = w < 480 ? [200, 500, 1000, 2000] : [200, 300, 500, 1000, 1500, 2000];
      for (const n of xt) ctx.fillText(n.toLocaleString('ko-KR'), plot.X(lx(n)), plot.pad.t + plot.ph + 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of [0.003, 0.01, 0.03, 0.1, 0.3]) ctx.fillText(String(v), plot.pad.l - 6, plot.Y(lx(v)));
      ctx.restore();
      plot.text('L − H', 2.2, -0.2, P.ink2, { dx: 6, dy: 10, font: `12px ${P.fontBody}` });
      plot.text('파라미터 수 N', 3.4, -2.6, P.ink2, { align: 'right', dx: -4, dy: -10, font: `12px ${P.fontBody}` });

      if (fitH) plot.fn((x) => Math.log10(fitH.A * Math.pow(10, -fitH.alpha * x)), P.pos, 2, { dash: [6, 5] });
      ex.results.forEach((row, d) => {
        ctx.strokeStyle = colors[d];
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        let pen = false;
        row.forEach((L, k) => {
          if (!isFinite(L)) return;
          const x = plot.X(lx(Ns[k]));
          const y = plot.Y(lx(L - H));
          if (pen) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
          pen = true;
        });
        ctx.stroke();
        row.forEach((L, k) => {
          if (isFinite(L)) plot.dot(lx(Ns[k]), lx(L - H), 4, colors[d], P.surface, 1.5);
        });
      });
      if (finished === 0) plot.text('학습 중…', 2.8, -1.4, P.ink3, { align: 'center', font: `13px ${P.fontBody}` });
    },
    [P, finished, fitH, colors],
    { aspect: 1.5, maxHeight: 380, minHeight: 260 },
  );

  const job = ex.done ? null : ex.jobs[ex.next];
  return (
    <Figure
      no={2}
      title="작은 모델 40개로 재 본 스케일링"
      hint="학습이 끝날 때까지 지켜보세요"
      caption={
        <>
          토큰 {TOY_V}개짜리 장난감 언어에서 바로 앞 토큰으로 다음 토큰을 맞히는 모델들입니다. 정답 분포는 세기가 순위의 거듭제곱으로 줄어드는 패턴 {TOY_V}개를 겹쳐 만들었고, 그래서 엔트로피 H(줄일 수 없는 손실)를 정확히 압니다. 모델은 패턴을 r개까지 담을 수 있는 저랭크 모델(r = {TOY_RANKS.join(', ')}, 파라미터 2·{TOY_V}·r + {TOY_V}개)이고, 학습 토큰 수 D마다 하나씩 모두 {TOY_DATA.length * TOY_RANKS.length}개를 이 브라우저에서 같은 조건(Adam, 전체 데이터로 {TOY_STEPS}번 갱신, 검증 손실이 가장 낮을 때 멈춤)으로 학습시킵니다. 세로축은 테스트 손실에서 H를 뺀 값이고, 진할수록 학습 데이터가 많습니다. 주황 점선은 가장 많은 데이터로 학습한 8개 점에 맞춘 직선입니다.
        </>
      }
    >
      <div className="fig-split" ref={boxRef}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={fitH ? `맞춘 지수 α = ${fmt(fitH.alpha, 2)}` : `학습한 모델 ${finished}개`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="tk-progress" aria-hidden="true">
            <div style={{ width: `${ex.progress * 100}%` }} />
          </div>
          <div className="tk-note" aria-live="polite">
            {job ? `학습 중: 데이터 ${job.D.toLocaleString('ko-KR')}토큰, r = ${job.r} (모델 ${finished + 1}/${ex.jobs.length})` : `모델 ${ex.jobs.length}개를 모두 학습했습니다.`}
          </div>
        </div>
        <div className="controls">
          <div className="btn-row">
            <Button small primary onClick={() => setRunning((r) => !r)} disabled={ex.done}>
              {running && !ex.done ? '❚❚ 멈춤' : '▶ 계속'}
            </Button>
            <Button small onClick={reset}>
              처음부터
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="참 엔트로피 H" value={fmt(H, 3)} />
            <Readout label="맞춘 지수 α (E = H)" value={fitH ? fmt(fitH.alpha, 2) : '—'} color="var(--pos)" />
            <Readout label="직선 적합도 R²" value={fitH ? fmt(fitH.r2, 3) : '—'} />
            <Readout label="E도 맞추면: E" value={fitE ? fmt(fitE.E, 3) : '—'} color="var(--accent)" />
            <Readout label="E도 맞추면: α" value={fitE ? fmt(fitE.alpha, 2) : '—'} />
          </div>
        </div>
      </div>
      <Legend items={TOY_DATA.map((D, d) => ({ color: colors[d], label: `D = ${D.toLocaleString('ko-KR')}`, shape: 'ln' as const })).concat([{ color: 'var(--pos)', label: '맞춘 직선', shape: 'ln' }])} />
    </Figure>
  );
}

/* ─────────────── Figure 3: splitting a compute budget ─────────────── */

const C_EXPS = [18, 19, 20, 21, 22, 23, 24, 25];

function ComputeFigure() {
  const P = usePalette();
  const [logC, setLogC] = useState(23.8);
  const [logMult, setLogMult] = useState(0);
  const C = Math.pow(10, logC);
  const Nopt = useMemo(() => optimalN(C), [C]);
  const Dopt = C / 6 / Nopt;
  const Lopt = isoLoss(C, Nopt);
  const mult = Math.pow(10, logMult);
  const Nm = Nopt * mult;
  const Dm = C / 6 / Nm;
  const Lm = isoLoss(C, Nm);
  const frontier = useMemo(() => C_EXPS.map((e) => ({ e, N: optimalN(Math.pow(10, e)) })), []);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 7, xMax: 13, yMin: 1.7, yMax: 4.5, pad: { l: 40, r: 14, t: 14, b: 30 } });
      plot.grid({ xStep: 1, yStep: 0.5, labels: false, axes: false });
      logTicks(ctx, plot, P, 'x', 7, 13, w < 480 ? 2 : 1);
      ctx.save();
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 2; y <= 4.5; y += 0.5) ctx.fillText(y.toFixed(1), plot.pad.l - 6, plot.Y(y));
      ctx.restore();
      plot.line(7, LAW.E, 13, LAW.E, P.ink3, 1.2, [2, 4]);
      for (const e of C_EXPS) plot.fn((x) => isoLoss(Math.pow(10, e), Math.pow(10, x), LAW), alpha(P.ink, 0.18), 1.2);
      // frontier through the minima
      ctx.save();
      ctx.strokeStyle = alpha(P.good, 0.8);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      frontier.forEach(({ e, N }, i) => {
        const x = plot.X(Math.log10(N));
        const y = plot.Y(isoLoss(Math.pow(10, e), N));
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
      for (const { e, N } of frontier) plot.dot(Math.log10(N), isoLoss(Math.pow(10, e), N), 2.5, P.good);
      plot.fn((x) => isoLoss(C, Math.pow(10, x)), P.accent, 2.6);
      plot.dot(Math.log10(Nopt), Lopt, 5.5, P.good, P.surface, 2);
      if (Math.abs(logMult) > 0.01) plot.dot(Math.log10(Nm), Lm, 5.5, P.pos, P.surface, 2);
      plot.text('손실', 7, 4.5, P.ink2, { dx: 6, dy: 10, font: `12px ${P.fontBody}` });
      plot.text('파라미터 수 N', 13, 1.7, P.ink2, { align: 'right', dx: -4, dy: -10, font: `12px ${P.fontBody}` });
    },
    [P, C, Nopt, Lopt, Nm, Lm, logMult, frontier],
    { aspect: 1.5, maxHeight: 380, minHeight: 260 },
  );

  return (
    <Figure
      no={3}
      title="계산 예산을 모델과 데이터에 나누기"
      hint="예산과 모델 크기를 바꿔 보세요"
      caption={
        <>
          <M>{'L(N, D) = E + A/N^{\\alpha} + B/D^{\\beta}'}</M>에 이 글에서 정한 예시 상수(E = {LAW.E}, A = {LAW.A}, B = {LAW.B}, α = {LAW.alpha}, β = {LAW.beta})를 넣고 <M>{'D = C/6N'}</M>으로 둔 곡선입니다. 실제 모델에 맞춘 값이 아닙니다. 진한 곡선이 지금 예산의 isoFLOP 곡선(예산이 같은 모델들의 손실), 옅은 곡선은 예산 <M>{'10^{18}'}</M>부터 <M>{'10^{25}'}</M>까지 10배 간격의 곡선입니다. 초록 점은 곡선의 최저점이고 초록 점선이 그것들을 이은 선, 주황 점은 모델 크기를 최적에서 바꾼 경우입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`예산 ${sci(C)} FLOPs에서 최적 N ${korNum(Nopt)}, D ${korNum(Dopt)}, 토큰/파라미터 ${fmt(Dopt / Nopt, 1)}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="sc-C" label="계산 예산 C (FLOPs)" value={logC} min={18} max={25} step={0.1} onChange={setLogC} format={(v) => sci(Math.pow(10, v))} />
          <Slider id="sc-mult" label="모델 크기 ÷ 최적" value={logMult} min={-1} max={1} step={0.05} onChange={setLogMult} format={(v) => `${fmt(Math.pow(10, v), 2)}배`} color="var(--pos)" />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="최적 N" value={korNum(Nopt)} color="var(--good)" />
            <Readout label="최적 D (토큰)" value={korNum(Dopt)} color="var(--good)" />
            <Readout label="토큰 / 파라미터" value={fmt(Dopt / Nopt, 1)} />
            <Readout label="최적 손실" value={fmt(Lopt, 3)} />
            <Readout label="고른 N에서 D" value={korNum(Dm)} color="var(--pos)" />
            <Readout label="손실 증가" value={`+${fmt(Lm - Lopt, 4)}`} color="var(--pos)" />
            <Readout label="토큰당 추론 비용" value={`${fmt(mult, 2)}배`} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--accent)', label: '지금 예산의 isoFLOP 곡선', shape: 'ln' },
          { color: 'var(--good)', label: '계산 최적점', shape: 'dot' },
          { color: 'var(--pos)', label: '고른 모델 크기', shape: 'dot' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Scaling() {
  return (
    <>
      <h2>얼마나 키우면 얼마나 좋아지나</h2>
      <p>
        <a href="#ai-basics/language-model">언어 모델 장</a>에서 사전 학습은 다음 토큰을 맞히는 크로스엔트로피 손실을 줄이는 일이라고 했습니다. 큰 모델을 학습시키는 팀은 학습을 시작하기 전에 답해야 할 질문이 있습니다. 쓸 수 있는 GPU 시간이 정해져 있을 때 모델을 얼마나 크게 만들고 토큰을 얼마나 많이 보여 줄 것인가. 한 번 학습에 몇 달과 큰돈이 드니 여러 번 해 보고 고를 수가 없습니다.
      </p>
      <p>
        다행히 손실은 놀랍도록 규칙적으로 줄어듭니다. Kaplan 등(2020)은 트랜스포머 언어 모델의 테스트 손실이 파라미터 수 N, 데이터 양 D, 계산량 C 각각에 대해 여러 자릿수에 걸쳐 <T en="power law">거듭제곱 법칙</T>을 따른다는 것을 보였습니다. 같은 범위 안에서는 층 수와 폭 같은 모양의 세부 사항보다 전체 크기가 훨씬 중요했습니다. 이 규칙성 덕분에 작은 모델 여러 개를 학습시켜 곡선을 맞추고, 큰 모델의 손실을 미리 내다볼 수 있습니다. 이것을 <T en="scaling law">스케일링 법칙</T>이라고 합니다.
      </p>

      <h2>거듭제곱 법칙과 줄일 수 없는 손실</h2>
      <p>데이터가 충분할 때 모델 크기 N에 따른 손실은 다음 꼴로 잘 맞습니다.</p>
      <MB note="α는 지수, N_c는 단위를 맞추는 상수, E는 아무리 키워도 남는 바닥입니다.">{'L(N) = \\left(\\frac{N_c}{N}\\right)^{\\alpha} + E'}</MB>
      <p>
        양변에서 E를 빼고 로그를 취하면 <M>{'\\log(L - E) = \\alpha\\log N_c - \\alpha\\log N'}</M>, 즉 로그–로그 그래프에서 기울기 −α인 직선입니다. 거듭제곱 법칙의 핵심은 <strong>곱하기에 대한 규칙</strong>이라는 점입니다. N을 10배로 키우면 줄일 수 있는 손실이 <M>{'10^{-\\alpha}'}</M>배가 되고, 이 비율은 N이 백만이든 천억이든 같습니다. α = 0.3이면 10배마다 약 절반(0.50배)이 됩니다.
      </p>
      <PowerLawFigure />
      <p>
        바닥 E는 <T en="irreducible loss">줄일 수 없는 손실</T>입니다. "오늘 점심은" 다음에 올 말은 정해져 있지 않습니다. 글 자체에 이런 불확실성이 있으므로, 진짜 분포를 완벽하게 아는 모델이라도 다음 토큰을 늘 맞힐 수는 없습니다. <a href="#ai-basics/entropy">엔트로피 장</a>에서 본 대로 크로스엔트로피는 <M>{'H(p, q) = H(p) + D_{KL}(p\\,\\|\\,q)'}</M>이고, 모델 q가 아무리 좋아져도 줄일 수 있는 것은 KL 부분뿐입니다. 바닥 E가 바로 글의 엔트로피 <M>{'H(p)'}</M>에 해당합니다. 그림 1에서 E를 키워 보면 큰 모델 쪽이 바닥에 가로막혀 직선이 휘는 지점이 왼쪽으로 옵니다. 바닥에 가까워질수록 같은 10배가 손실을 줄이는 양이 작아집니다.
      </p>

      <h2>직접 재 보기</h2>
      <p>
        이 법칙이 정말 측정에서 나오는지 작은 실험으로 확인해 봅시다. 실제 글은 엔트로피를 모르니, 엔트로피를 정확히 아는 장난감 언어를 만듭니다. 토큰은 {TOY_V}개이고, 앞 토큰이 i일 때 다음 토큰의 분포는 정해진 행렬로 정합니다. 이 행렬은 세기가 다른 "패턴" {TOY_V}개를 겹친 것인데, k번째 패턴의 세기는 <M>{'k^{-1.25}'}</M>에 비례합니다. 실제 글에도 아주 흔한 규칙(조사, 띄어쓰기)부터 드문 규칙(특정 사람에 대한 사실)까지 중요도가 긴 꼬리를 그리며 줄어드는 패턴이 있다는 것을 흉내 낸 것입니다.
      </p>
      <p>
        모델은 이 행렬을 랭크 r의 두 행렬 곱 <M>{'AB'}</M>(와 편향)으로 근사합니다. r이 클수록 담을 수 있는 패턴이 많고 파라미터도 많습니다. r을 1부터 16까지, 학습 토큰을 4,096개부터 약 105만 개까지 바꿔 가며 모델 40개를 학습시키고 손실을 잽니다. 정답 분포를 아니까 테스트 손실은 표본 없이 정확히 계산합니다.
      </p>
      <ToyScalingFigure />
      <p>
        가장 많은 데이터(1,048,576토큰)로 학습한 8개 점은 로그–로그 축에서 거의 직선 위에 놓입니다. 바닥을 참 엔트로피 H = 2.851로 두고 직선을 맞추면 지수는 α = 1.73, 적합도 R² = 0.997입니다. 실제 언어 모델에서 보고된 지수보다 훨씬 가파른데, 지수는 데이터에 따라 정해지는 값이고 이 장난감은 패턴의 세기가 빨리 줄어들게 만들었기 때문입니다. 실제 연구에서는 E를 모르므로 E까지 함께 맞춥니다. 그렇게 하면 E = 2.842로 참값과 0.01 안쪽으로 맞지만, 지수는 1.32로 꽤 달라집니다. 몇 자릿수 안 되는 범위에서 바닥과 지수를 함께 맞추면 지수가 불안정하다는 것도 실제 연구에서 늘 주의하는 점입니다.
      </p>
      <p>
        데이터가 적은 쪽도 보세요. 4,096토큰으로 학습한 옅은 선은 r = 3에서 가장 낮고, 그보다 큰 모델은 조기 종료를 했는데도 오히려 나빠집니다. 데이터가 모델을 받쳐 주지 못하면 키워 봐야 소용이 없습니다. 손실은 N과 D 중 <strong>모자란 쪽</strong>에 막힌다는 것, 이것이 다음 질문으로 이어집니다.
      </p>

      <h2>계산량 C ≈ 6ND</h2>
      <p>
        <a href="#ai-deep-learning/transformer">트랜스포머 장</a>에서 센 것처럼 토큰 하나가 순전파를 지날 때 가중치마다 곱셈-덧셈이 한 번씩, 즉 약 2N FLOPs가 들고, 역전파가 그 두 배쯤이라 학습은 토큰당 약 6N FLOPs입니다. 토큰 D개로 학습하면 전체 계산량은 다음과 같습니다(문맥이 아주 길지 않을 때의 어림입니다).
      </p>
      <MB note="N: 파라미터 수, D: 학습 토큰 수. 어텐션 점수 계산처럼 파라미터와 무관한 항은 뺀 근사입니다.">{'C \\approx 6\\,N\\,D'}</MB>
      <Code label="학습 계산량 어림하기">{`
const trainFlops = (N, D) => 6 * N * D;

// 7억 파라미터 모델을 140억 토큰으로 학습하면
trainFlops(7e8, 1.4e10);          // 5.88e19 FLOPs

// 실제로 걸리는 시간: 초당 FLOPs × 활용률로 나눈다
const seconds = (C, flopsPerSec, utilization) => C / (flopsPerSec * utilization);`}</Code>
      <p>
        예산 C가 정해지면 N과 D는 서로 반비례합니다. 모델을 두 배로 키우면 볼 수 있는 토큰이 절반이 됩니다. 그러면 어느 쪽에 쓰는 것이 손실을 더 줄일까요?
      </p>

      <h2>예산 나누기: 계산 최적</h2>
      <p>
        Hoffmann 등(2022)은 파라미터 7천만 개부터 160억 개 이상까지 400개가 넘는 모델을 학습시켜 이 질문에 답했습니다. 그 방법 중 하나는 손실을 N과 D 두 변수의 함수로 맞추는 것입니다.
      </p>
      <MB note="E: 바닥, 둘째 항: 모델이 작아서 생기는 손실, 셋째 항: 데이터가 적어서 생기는 손실.">{'L(N, D) = E + \\frac{A}{N^{\\alpha}} + \\frac{B}{D^{\\beta}}'}</MB>
      <p>
        <M>{'D = C/6N'}</M>을 넣으면 손실은 N 하나의 함수가 됩니다. 이렇게 예산이 같은 모델들을 늘어놓은 곡선을 <T en="isoFLOP curve">isoFLOP 곡선</T>이라고 합니다. 모델이 너무 작으면 둘째 항이, 너무 크면 데이터가 모자라 셋째 항이 커지므로 곡선은 U자 모양이고 그 바닥이 <T en="compute-optimal">계산 최적</T> 크기입니다. 최저점에서는 N을 조금 키워 얻는 이득과 D가 줄어 생기는 손해가 같으므로 <M>{'\\alpha A N^{-\\alpha} = \\beta B D^{-\\beta}'}</M>이고, 여기서 <M>{'N_{opt} \\propto C^{\\beta/(\\alpha+\\beta)}'}</M>를 얻습니다. α와 β가 비슷하면 지수가 0.5 가까이 되어, 예산이 늘 때 <strong>N과 D를 거의 같은 비율로</strong> 키워야 합니다.
      </p>
      <ComputeFigure />
      <Code label="예산 C에서 손실이 가장 낮은 N 찾기 (로그 N 위의 황금분할 탐색)">{`
const loss = (N, D) => E + A / N ** alpha + B / D ** beta;
const isoLoss = (C, N) => loss(N, C / (6 * N));      // 예산을 다 쓰는 D

function optimalN(C) {
  let lo = Math.log(1e3), hi = Math.log(C / 6 / 1e3);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 100; i++) {                    // isoFLOP 곡선은 log N에서 볼록
    const x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo);
    if (isoLoss(C, Math.exp(x1)) < isoLoss(C, Math.exp(x2))) hi = x2;
    else lo = x1;
  }
  return Math.exp((lo + hi) / 2);
}`}</Code>
      <p>
        그림 3의 상수는 설명을 위해 이 글에서 정한 값이고, 10²³~10²⁴ FLOPs 근처에서 최적점이 파라미터당 약 20토큰이 되도록 골랐습니다. 이 상수로는 예산을 10¹⁸에서 10²⁵ FLOPs로 키우는 동안 토큰/파라미터가 10.3에서 22.7로 천천히 늘어납니다. α가 β보다 조금 커서 데이터 쪽을 조금 더 빨리 키우는 것이 최적이기 때문입니다.
      </p>
      <p>
        Hoffmann 등의 결론은 그 전까지의 큰 모델들이 크기에 비해 데이터를 너무 적게 보았다는 것이었습니다. 이들은 파라미터 2,800억 개를 3,000억 토큰으로 학습한 Gopher와 거의 같은 예산으로, 파라미터 700억 개를 1조 4,000억 토큰으로 학습한 Chinchilla를 만들었고, Chinchilla가 여러 평가에서 Gopher보다 나았습니다. 6ND로 어림하면 두 예산은 각각 5.0×10²³, 5.9×10²³ FLOPs로 비슷합니다. Chinchilla는 파라미터 하나당 20토큰을 보았고, 여기서 "계산 최적은 파라미터당 약 20토큰"이라는 어림 규칙이 나왔습니다. Gopher는 파라미터당 약 1토큰이었습니다.
      </p>
      <Callout kind="note" label="추론 비용까지 따지면">
        계산 최적은 <strong>학습</strong> 비용만 따진 답입니다. 모델을 배포하면 토큰을 만들 때마다 약 2N FLOPs가 드니, 많이 쓰일 모델이라면 작은 모델을 계산 최적보다 오래 학습시키는 편이 전체로는 쌉니다. isoFLOP 곡선의 바닥이 평평하기 때문에 이 선택의 대가가 작습니다. 그림 3의 상수로 Chinchilla 규모의 예산(5.9×10²³ FLOPs)에서 모델을 최적의 절반으로 줄이면 손실은 0.0067 늘어날 뿐인데 토큰당 추론 비용은 절반이 됩니다. 그래서 실제로 공개되는 모델 중에는 파라미터당 20토큰보다 훨씬 많은 토큰으로 학습한 것이 흔합니다.
      </Callout>

      <h2>손실은 매끄러운데 능력은 갑자기?</h2>
      <p>
        손실 곡선은 매끄럽지만, 특정 과제의 정답률을 모델 크기에 따라 그리면 어떤 크기에서 갑자기 뛰어오르는 것처럼 보일 때가 있습니다. Wei 등(2022)은 이를 <T en="emergent abilities">창발 능력</T>이라 불렀습니다. 반면 Schaeffer 등(2023)은 이런 급변의 상당 부분이 평가 방식에서 온다고 주장했습니다. 예를 들어 10토큰짜리 답이 완전히 맞아야 점수를 주는 평가에서, 토큰 하나를 맞힐 확률 p가 매끄럽게 0.5 → 0.7 → 0.9로 오르면 답 전체를 맞힐 확률 <M>{'p^{10}'}</M>은 0.001 → 0.028 → 0.35로, 한동안 바닥에 붙어 있다가 갑자기 솟는 것처럼 보입니다. 어느 쪽이 맞는지는 아직 논쟁 중이고, 스케일링 법칙이 예측하는 것은 손실이지 특정 능력이 아니라는 점을 기억해 두면 됩니다.
      </p>

      <Callout kind="key">
        언어 모델의 손실은 모델 크기, 데이터 양, 계산량에 대해 거듭제곱 법칙을 따르며, 로그–로그 축에서 직선을 그리다가 글의 엔트로피라는 바닥에 가까워지면 휩니다. 학습 계산량은 C ≈ 6ND이고, 예산이 정해지면 isoFLOP 곡선의 최저점이 계산 최적 크기입니다. Chinchilla 이후의 어림 규칙은 N과 D를 같은 비율로 키우고 파라미터당 약 20토큰을 쓰는 것이지만, 추론까지 따지면 더 작은 모델을 더 오래 학습시키는 편이 나을 때가 많습니다.
      </Callout>
      <Quiz
        q="L(N, D) = E + A/N^α + B/D^β에서 α = β일 때, 계산 예산 C를 100배로 늘리면 계산 최적의 N과 D는 각각 몇 배가 되는가?"
        options={['N 100배, D 그대로', 'N 10배, D 10배', 'N 그대로, D 100배', 'N 50배, D 2배']}
        answer={1}
        explain={<>최적 조건 αA N^−α = βB D^−β에서 α = β이면 D/N이 예산과 상관없이 일정합니다. C ≈ 6ND이니 N과 D가 같은 비율 k로 늘어야 하고 k² = 100, 즉 둘 다 10배입니다. 예산의 제곱근만큼씩 나눠 키운다는 것이 Chinchilla 논문의 "모델 크기를 두 배로 하면 토큰도 두 배로"라는 결론과 같은 이야기입니다.</>}
      />
    </>
  );
}
