import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../../lib/canvas';
import { fmt } from '../../../../lib/plot';
import { alpha, parseColor, usePalette } from '../../../../lib/theme';
import { Net, SCHEDS, SchedRun, Trainer, argmin, drawBoundary, drawCurves, histogram, probGrid, schedLR, splitData, type Data, type RGB, type Sched } from './training';
import './training.css';

const rgbOf = (c: string): RGB => {
  const p = parseColor(c);
  return [p[0], p[1], p[2]];
};

/* shared setup for figures 1 and 2: a small noisy data set and a net that can memorise it */
const N_TRAIN = 60;
const N_VAL = 400;
const NOISE = 0.2;
const SIZES = [2, 64, 64, 1];
const EPOCHS = 300;
const LR = 0.003;
const BATCH = 10;
const DOM = 1.2;
const GRID = 40;

function useData() {
  return useMemo(() => splitData('circle', N_TRAIN, N_VAL, NOISE, 7), []);
}

/** Start `setRunning(true)` once when the element is first scrolled into view. */
function useAutoStart(ref: RefObject<HTMLElement>, start: () => void) {
  const done = useRef(false);
  const cb = useRef(start);
  cb.current = start;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0]?.isIntersecting && !done.current) {
          done.current = true;
          cb.current();
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
}

function lossTicks(maxLoss: number): number[] {
  return maxLoss > 1.2 ? [0.5, 1, 1.5, 2] : [0.25, 0.5, 0.75, 1];
}

/* ─────────────── Figure 1: dropout ─────────────── */

function DropoutFigure() {
  const P = usePalette();
  const { train, val } = useData();
  const [p, setP] = useState(0.4);
  const [run, setRun] = useState(0);
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(0);
  const figRef = useRef<HTMLDivElement>(null);
  const inView = useInView(figRef);
  useAutoStart(figRef, () => setRunning(true));

  const t = useMemo(() => {
    const o = { batch: BATCH, lr: LR, opt: 'adam' as const };
    return {
      cur: new Trainer(new Net({ sizes: SIZES, dropout: p, seed: 1 }), train, val, o),
      ref: p > 0 ? new Trainer(new Net({ sizes: SIZES, seed: 1 }), train, val, o) : null,
      run,
    };
  }, [p, train, val, run]);
  const epoch = t.cur.epoch;
  const done = epoch >= EPOCHS;

  useAnimationFrame(() => {
    t.cur.steps(t.cur.stepsPerEpoch, EPOCHS);
    t.ref?.steps(t.ref.stepsPerEpoch, EPOCHS);
    if (t.cur.epoch >= EPOCHS) setRunning(false);
    setTick((k) => k + 1);
  }, running && inView && !done);

  const rgb = useMemo(() => ({ base: rgbOf(P.surface), pos: rgbOf(P.pos), neg: rgbOf(P.neg) }), [P]);
  // the boundary is redrawn every few epochs (and at the end) to keep frames cheap
  const bKey = done ? epoch : Math.floor(epoch / 3);
  const probs = useMemo(() => probGrid(t.cur.net, GRID, DOM), [t, bKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const vl = t.cur.valLoss;
  const tl = t.cur.trainLoss;
  const maxLoss = Math.max(1, ...vl, ...(t.ref ? t.ref.valLoss : []));
  const yMax = maxLoss > 1.2 ? 2 : 1;

  const bnd = useCanvas2D(
    (ctx, { w, h }) => {
      const size = Math.min(w, h);
      drawBoundary(ctx, P, rgb, { x: (w - size) / 2, y: (h - size) / 2, size }, probs, GRID, DOM, train);
    },
    [P, rgb, probs, train],
    { aspect: 1, maxHeight: 300, minHeight: 200 },
  );
  const crv = useCanvas2D(
    (ctx, { w, h }) => {
      drawCurves(ctx, P, w, h, {
        series: [
          ...(t.ref ? [{ vals: t.ref.valLoss, color: alpha(P.ink3, 0.9), dash: [4, 3], width: 1.6 }] : []),
          { vals: tl, color: P.accent },
          { vals: vl, color: P.bad },
        ],
        xMax: EPOCHS,
        yMin: 0,
        yMax,
        yTicks: lossTicks(yMax),
        xTicks: [0, 100, 200, 300],
        xLabel: '에폭',
      });
    },
    [P, t, tick, yMax],
    { aspect: 1.25, maxHeight: 300, minHeight: 200 },
  );

  return (
    <Figure
      no={1}
      title="드롭아웃"
      hint="드롭아웃 비율을 바꿔 보세요"
      caption={
        <>
          원 모양 데이터에 잡음을 섞어 훈련용 점 {N_TRAIN}개(그림의 점)와 검증용 점 {N_VAL}개를 뽑고, 폭 64인 은닉층 두 개짜리 신경망을 Adam(학습률 {LR}, 미니배치 {BATCH})으로 {EPOCHS}에폭 학습시킵니다. 드롭아웃은 두 은닉층의 출력에 걸고, 손실은 드롭아웃을 끈 상태로 잽니다. 회색 점선은 같은 시드에서 드롭아웃 없이 학습한 망의 검증 손실입니다. 비율을 바꾸면 처음부터 다시 학습합니다.
        </>
      }
    >
      <div ref={figRef} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="tr-bar">
          <div className="btn-row">
            <Button primary onClick={() => setRunning((r) => !r)} disabled={done}>
              {running ? '일시정지' : done ? '학습 끝' : '학습 시작'}
            </Button>
            <Button
              onClick={() => {
                setRunning(false);
                setRun((k) => k + 1);
              }}
            >
              처음부터
            </Button>
          </div>
          <div className="readouts tr-4">
            <Readout label="에폭" value={`${epoch}`} />
            <Readout label="훈련 손실" value={fmt(tl[tl.length - 1], 3)} color="var(--accent)" />
            <Readout label="검증 손실" value={fmt(vl[vl.length - 1], 3)} color="var(--bad)" />
            <Readout label="검증 정확도" value={`${fmt(t.cur.valAcc[t.cur.valAcc.length - 1] * 100, 1)}%`} />
          </div>
        </div>
        <Slider id="do-p" label="드롭아웃 비율 p (끄는 뉴런의 비율)" value={p} min={0} max={0.6} step={0.1} onChange={(v) => setP(Math.round(v * 10) / 10)} format={(v) => v.toFixed(1)} />
        <div className="fig-cols">
          <div ref={bnd.wrapRef} className="canvas-box" role="img" aria-label={`드롭아웃 ${p.toFixed(1)}로 학습한 결정 경계, 에폭 ${epoch}`}>
            <canvas ref={bnd.canvasRef} />
          </div>
          <div ref={crv.wrapRef} className="canvas-box" role="img" aria-label={`손실 곡선: 훈련 ${fmt(tl[tl.length - 1], 3)}, 검증 ${fmt(vl[vl.length - 1], 3)}`}>
            <canvas ref={crv.canvasRef} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--accent)', label: '훈련 손실', shape: 'ln' },
          { color: 'var(--bad)', label: '검증 손실', shape: 'ln' },
          ...(p > 0 ? [{ color: 'var(--ink-3)', label: '검증 손실, 드롭아웃 없음 (점선)', shape: 'ln' as const }] : []),
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: weight decay and early stopping ─────────────── */

const WDS = [0, 0.1, 0.3, 1, 3, 10];
const W_LIM = 2;
const W_BINS = 40;

function DecayFigure() {
  const P = usePalette();
  const { train, val } = useData();
  const [wi, setWi] = useState(0);
  const wd = WDS[wi];
  const [run, setRun] = useState(0);
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(0);
  const figRef = useRef<HTMLDivElement>(null);
  const inView = useInView(figRef);
  useAutoStart(figRef, () => setRunning(true));

  const t = useMemo(() => {
    const mk = (d: number) => new Trainer(new Net({ sizes: SIZES, seed: 1 }), train, val, { batch: BATCH, lr: LR, opt: 'adamw', wd: d });
    return { cur: mk(wd), ref: wd > 0 ? mk(0) : null, run };
  }, [wd, train, val, run]);
  const epoch = t.cur.epoch;
  const done = epoch >= EPOCHS;

  useAnimationFrame(() => {
    t.cur.steps(t.cur.stepsPerEpoch, EPOCHS);
    t.ref?.steps(t.ref.stepsPerEpoch, EPOCHS);
    if (t.cur.epoch >= EPOCHS) setRunning(false);
    setTick((k) => k + 1);
  }, running && inView && !done);

  const vl = t.cur.valLoss;
  const best = argmin(vl);
  const yMax = Math.max(1, ...vl, ...(t.ref ? t.ref.valLoss : [])) > 1.2 ? 2 : 1;
  const weights = useMemo(() => t.cur.net.allWeights(), [t, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  const refWeights = useMemo(() => (t.ref ? t.ref.net.allWeights() : null), [t, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  const rms = Math.sqrt(weights.reduce((s, x) => s + x * x, 0) / weights.length);

  const crv = useCanvas2D(
    (ctx, { w, h }) => {
      drawCurves(ctx, P, w, h, {
        series: [...(t.ref ? [{ vals: t.ref.valLoss, color: alpha(P.ink3, 0.9), dash: [4, 3], width: 1.6 }] : []), { vals: t.cur.trainLoss, color: P.accent }, { vals: vl, color: P.bad }],
        xMax: EPOCHS,
        yMin: 0,
        yMax,
        yTicks: lossTicks(yMax),
        xTicks: [0, 100, 200, 300],
        xLabel: '에폭',
        marker: epoch > 0 ? { x: best, y: vl[best], label: `최저 검증 손실 · ${best}에폭`, color: P.good } : undefined,
      });
    },
    [P, t, tick, yMax, best],
    { aspect: 1.25, maxHeight: 300, minHeight: 200 },
  );

  const hst = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 10, r: 10, t: 12, b: 26 };
      const pw = w - pad.l - pad.r;
      const ph = h - pad.t - pad.b;
      const hc = histogram(weights, -W_LIM, W_LIM, W_BINS);
      const hr = refWeights ? histogram(refWeights, -W_LIM, W_LIM, W_BINS) : null;
      // square-root counts so the tails stay visible next to the tall centre
      const mx = Math.sqrt(Math.max(...hc, ...(hr ?? [0]), 1));
      const bw = pw / W_BINS;
      const Y = (c: number) => pad.t + ph - (Math.sqrt(c) / mx) * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.font = `10px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const v of [-2, -1, 0, 1, 2]) {
        const x = Math.round(pad.l + ((v + W_LIM) / (2 * W_LIM)) * pw) + 0.5;
        ctx.strokeStyle = v === 0 ? P.lineStrong : P.grid;
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, pad.t + ph);
        ctx.stroke();
        ctx.fillText(v < 0 ? '−' + -v : String(v), x, pad.t + ph + 6);
      }
      ctx.fillStyle = alpha(P.neg, 0.75);
      for (let i = 0; i < W_BINS; i++) {
        if (!hc[i]) continue;
        ctx.fillRect(pad.l + i * bw + 0.5, Y(hc[i]), bw - 1, pad.t + ph - Y(hc[i]));
      }
      if (hr) {
        ctx.strokeStyle = P.ink2;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(pad.l, pad.t + ph);
        for (let i = 0; i < W_BINS; i++) {
          ctx.lineTo(pad.l + i * bw, Y(hr[i]));
          ctx.lineTo(pad.l + (i + 1) * bw, Y(hr[i]));
        }
        ctx.lineTo(pad.l + pw, pad.t + ph);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const lab = '가중치 값의 분포';
      const tw = ctx.measureText(lab).width;
      ctx.fillStyle = P.surface;
      ctx.fillRect(pad.l + 2, pad.t, tw + 8, 16);
      ctx.fillStyle = P.ink2;
      ctx.fillText(lab, pad.l + 6, pad.t + 2);
    },
    [P, weights, refWeights],
    { aspect: 1.25, maxHeight: 300, minHeight: 200 },
  );

  return (
    <Figure
      no={2}
      title="가중치 감쇠와 조기 종료"
      hint="감쇠 계수를 바꿔 보세요"
      caption={
        <>
          그림 1과 같은 데이터와 신경망을 드롭아웃 없이 AdamW(학습률 {LR})로 학습시킵니다. 초록 점선은 지금까지 검증 손실이 가장 낮았던 에폭, 곧 조기 종료로 골랐을 지점입니다. 가중치 분포는 세 층의 가중치 {(2 * 64 + 64 * 64 + 64).toLocaleString('ko-KR')}개를 모두 모은 것으로, 막대 높이는 개수의 제곱근에 비례하게 그려 드문 큰 값도 보이게 했습니다. 점선은 감쇠 없이 학습한 망의 곡선과 분포입니다.
        </>
      }
    >
      <div ref={figRef} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="tr-bar">
          <div className="btn-row">
            <Button primary onClick={() => setRunning((r) => !r)} disabled={done}>
              {running ? '일시정지' : done ? '학습 끝' : '학습 시작'}
            </Button>
            <Button
              onClick={() => {
                setRunning(false);
                setRun((k) => k + 1);
              }}
            >
              처음부터
            </Button>
          </div>
          <div className="readouts tr-4">
            <Readout label="에폭" value={`${epoch}`} />
            <Readout label="최저 검증 손실" value={`${fmt(vl[best], 3)}`} color="var(--good)" />
            <Readout label="지금 검증 손실" value={fmt(vl[vl.length - 1], 3)} color="var(--bad)" />
            <Readout label="가중치 RMS" value={fmt(rms, 3)} color="var(--neg)" />
          </div>
        </div>
        <Slider id="wd-l" label="감쇠 계수 λ" value={wi} min={0} max={WDS.length - 1} step={1} onChange={(v) => setWi(Math.round(v))} format={(i) => String(WDS[Math.round(i)])} />
        <div className="fig-cols">
          <div ref={crv.wrapRef} className="canvas-box" role="img" aria-label={`λ = ${wd}: 최저 검증 손실 ${fmt(vl[best], 3)} (${best}에폭), 지금 ${fmt(vl[vl.length - 1], 3)}`}>
            <canvas ref={crv.canvasRef} />
          </div>
          <div ref={hst.wrapRef} className="canvas-box" role="img" aria-label={`가중치 분포, RMS ${fmt(rms, 3)}`}>
            <canvas ref={hst.canvasRef} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--accent)', label: '훈련 손실', shape: 'ln' },
          { color: 'var(--bad)', label: '검증 손실', shape: 'ln' },
          { color: 'var(--good)', label: '조기 종료 지점', shape: 'ln' },
          { color: 'var(--neg)', label: '가중치 분포', shape: 'sq' },
          ...(wd > 0 ? [{ color: 'var(--ink-3)', label: 'λ = 0 (점선)', shape: 'ln' as const }] : []),
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: learning-rate schedules ─────────────── */

const SCHED_T = 1000;
const SCHED_STEPS = 10;
const SCHED_LABEL: Record<Sched, string> = { const: '고정', step: '계단 감소', cosine: '코사인', warmcos: '워밍업+코사인' };
const SCHED_VAR: Record<Sched, string> = { const: 'var(--ink-3)', step: 'var(--neg)', cosine: 'var(--pos)', warmcos: 'var(--good)' };

function schedColor(P: ReturnType<typeof usePalette>, s: Sched): string {
  return s === 'const' ? P.ink3 : s === 'step' ? P.neg : s === 'cosine' ? P.pos : P.good;
}

function ScheduleFigure() {
  const P = usePalette();
  const [peak, setPeak] = useState(0.1);
  const [seed, setSeed] = useState(1);
  const [run, setRun] = useState(0);
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(0);
  const figRef = useRef<HTMLDivElement>(null);
  const inView = useInView(figRef);
  useAutoStart(figRef, () => setRunning(true));
  const data: Data = useMemo(() => splitData('moons', 200, 0, 0.15, 7).train, []);
  const runs = useMemo(() => ({ list: SCHEDS.map((s) => new SchedRun(s, data, { sizes: [2, 24, 24, 1], seed, T: SCHED_T, peak })), run }), [data, seed, peak, run]);
  const step = runs.list[0].t;
  const done = step >= SCHED_T;

  useAnimationFrame(() => {
    for (const r of runs.list) r.run(SCHED_STEPS);
    if (runs.list[0].done) setRunning(false);
    setTick((k) => k + 1);
  }, running && inView && !done);

  const lrCanvas = useCanvas2D(
    (ctx, { w, h }) => {
      const lrs = (s: Sched) => Array.from({ length: SCHED_T / 10 + 1 }, (_, i) => schedLR(s, Math.min(SCHED_T - 1, i * 10), SCHED_T, peak));
      drawCurves(ctx, P, w, h, {
        series: SCHEDS.map((s) => ({ vals: lrs(s), color: alpha(schedColor(P, s), 0.9), xStep: 10, width: s === 'const' ? 2.4 : 2 })),
        xMax: SCHED_T,
        yMin: 0,
        yMax: peak * 1.08,
        yTicks: [0, peak / 2, peak],
        xTicks: [0, 500, 1000],
        xLabel: '스텝',
        yLabel: '학습률',
        marker: step > 0 && step < SCHED_T ? { x: step, label: `${step}`, color: P.ink2 } : undefined,
      });
    },
    [P, peak, step],
    { aspect: 1.5, maxHeight: 260, minHeight: 190 },
  );
  const lossCanvas = useCanvas2D(
    (ctx, { w, h }) => {
      drawCurves(ctx, P, w, h, {
        series: SCHEDS.map((s, i) => ({ vals: runs.list[i].loss, color: schedColor(P, s), xStep: runs.list[i].every, width: 1.8 })),
        xMax: SCHED_T,
        yMin: 0.03,
        yMax: 1,
        log: true,
        yTicks: [0.03, 0.1, 0.3, 1],
        xTicks: [0, 500, 1000],
        xLabel: '스텝',
        yLabel: '훈련 손실',
      });
    },
    [P, runs, tick],
    { aspect: 1.5, maxHeight: 260, minHeight: 190 },
  );
  const last = (i: number) => runs.list[i].loss[runs.list[i].loss.length - 1];

  return (
    <Figure
      no={3}
      title="학습률 스케줄"
      hint="최대 학습률을 바꾸고 다른 시드로도 돌려 보세요"
      caption={
        <>
          달 모양 데이터 200개를 폭 24인 은닉층 두 개짜리 신경망으로 분류합니다. 네 실행은 시드가 같아 같은 가중치에서 출발해 같은 미니배치(20개)를 같은 순서로 보고, 학습률 스케줄만 다릅니다. 최적화는 모멘텀 SGD, 학습은 {SCHED_T.toLocaleString('ko-KR')}스텝입니다. 계단 감소는 50%와 75% 지점에서 학습률을 10분의 1로 줄이고, 워밍업은 처음 10% 동안 0에서 최대 학습률까지 직선으로 올립니다. 훈련 손실은 10스텝마다 훈련 데이터 전체로 잰 값이고 세로축은 로그 눈금입니다.
        </>
      }
    >
      <div ref={figRef} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="tr-bar">
          <div className="btn-row">
            <Button primary onClick={() => setRunning((r) => !r)} disabled={done}>
              {running ? '일시정지' : done ? '학습 끝' : '학습 시작'}
            </Button>
            <Button
              onClick={() => {
                setRunning(false);
                setRun((k) => k + 1);
              }}
            >
              처음부터
            </Button>
            <Button
              onClick={() => {
                setRunning(false);
                setSeed((s) => (s % 8) + 1);
              }}
              title="가중치와 미니배치 순서를 다른 시드로 새로 뽑습니다"
            >
              다른 시드
            </Button>
          </div>
          <div className="tr-ctl-row">
            <div className="tr-seg">
              <Seg
                label="최대 학습률"
                value={peak}
                onChange={(v) => {
                  setRunning(false);
                  setPeak(v);
                }}
                options={[
                  { value: 0.1, label: '0.1' },
                  { value: 0.7, label: '0.7' },
                ]}
              />
            </div>
            <span className="tr-status">
              시드 {seed} · 스텝 {step}
            </span>
          </div>
        </div>
        <div className="fig-cols">
          <div ref={lrCanvas.wrapRef} className="canvas-box" role="img" aria-label={`네 가지 학습률 스케줄, 최대 학습률 ${peak}`}>
            <canvas ref={lrCanvas.canvasRef} />
          </div>
          <div ref={lossCanvas.wrapRef} className="canvas-box" role="img" aria-label={`훈련 손실: ${SCHEDS.map((s, i) => `${SCHED_LABEL[s]} ${fmt(last(i), 3)}`).join(', ')}`}>
            <canvas ref={lossCanvas.canvasRef} />
          </div>
        </div>
        <div className="readouts tr-4">
          {SCHEDS.map((s, i) => (
            <Readout key={s} label={`${SCHED_LABEL[s]} 손실`} value={fmt(last(i), 3)} color={SCHED_VAR[s]} />
          ))}
        </div>
      </div>
      <Legend items={SCHEDS.map((s) => ({ color: SCHED_VAR[s], label: SCHED_LABEL[s], shape: 'ln' as const }))} />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Regularization() {
  return (
    <>
      <h2>외우지 않고 배우게 하기</h2>
      <p>
        <a href="#ai-basics/overfitting">과적합 장</a>에서 모델이 훈련 데이터의 잡음까지 따라 그리면 처음 보는 데이터에서 성능이 떨어진다는 것, 그리고 그것을 확인하려면 학습에 쓰지 않은 검증 데이터가 필요하다는 것을 보았습니다. 신경망은 파라미터가 많아서 이 문제에 특히 취약합니다. 이 장에서는 딥러닝에서 실제로 쓰는 <T en="regularization">규제</T> 기법 세 가지(드롭아웃, 가중치 감쇠, 조기 종료)를 직접 켜고 끄며 비교하고, 학습 내내 보폭을 바꾸는 <T en="learning-rate schedule">학습률 스케줄</T>을 봅니다.
      </p>
      <p>
        그림 1과 2는 일부러 과적합하기 쉬운 상황을 만듭니다. 잡음이 섞인 원 모양 데이터에서 훈련용 점은 {N_TRAIN}개뿐인데, 신경망의 가중치는 4천 개가 넘습니다. 실제 모델은 이보다 수백만 배 크지만, "데이터에 비해 모델이 크다"는 상황은 같습니다.
      </p>
      <Callout kind="note" label="용어">
        기초 과목에서는 regularization을 "정규화"라고도 불렀지만, <a href="#ai-deep-learning/init-norm">앞 장</a>의 normalization(배치 정규화, 층 정규화)과 헷갈리지 않도록 이 과목에서는 <strong>규제</strong>라고 부릅니다.
      </Callout>

      <h2>드롭아웃: 뉴런을 무작위로 끄기</h2>
      <p>
        <T en="dropout">드롭아웃</T>은 학습하는 동안 매 스텝마다 은닉 뉴런 각각을 확률 p로 꺼서(출력을 0으로) 내보내는 방법입니다(Srivastava 등, 2014). 어느 뉴런이 꺼질지 모르니 신경망은 특정 뉴런 몇 개의 우연한 조합에 기대어 훈련 데이터를 외울 수 없고, 여러 뉴런에 정보를 나눠 담게 됩니다. 매 스텝 다른 뉴런이 꺼지므로, 가중치를 공유하는 수많은 작은 신경망을 한꺼번에 학습시켜 평균 내는 것으로 볼 수도 있습니다.
      </p>
      <p>
        뉴런을 끄면 다음 층이 받는 값의 합이 평균적으로 <M>{'1-p'}</M>배로 줄어듭니다. 그래서 학습 때 살아남은 뉴런의 출력을 <M>{'1-p'}</M>로 나눠 기댓값을 원래대로 맞춥니다. 이것을 <T en="inverted dropout">역 드롭아웃</T>이라고 하며, 오늘날 프레임워크는 모두 이 방식을 씁니다. 덕분에 추론할 때는 드롭아웃을 끄기만 하면 되고 따로 보정할 것이 없습니다.
      </p>
      <MB note="m은 뉴런마다 새로 뽑는 0 또는 1이고, 1일 확률이 1−p입니다. 추론 때는 y = a입니다.">{'\\begin{aligned} y &= \\frac{m \\cdot a}{1-p}, \\quad m \\sim \\text{Bernoulli}(1-p) \\\\[4pt] \\mathbb{E}[y] &= \\frac{(1-p)\\,a}{1-p} = a \\end{aligned}'}</MB>
      <DropoutFigure />
      <p>
        p = 0에서 시작해 보세요. 훈련 손실은 300에폭 동안 0.07까지 내려가지만 검증 손실은 31에폭에 0.336으로 가장 낮았다가 다시 올라 0.835로 끝납니다. 결정 경계는 경계 근처의 잡음 섞인 점들을 하나하나 감싸며 구불구불해집니다. p = 0.4에서는 훈련 손실이 0.226에서 멈추는 대신 검증 손실이 0.447로 끝나, 둘 사이의 간격이 0.765에서 0.222로 줄어듭니다. 경계도 매끄러운 원에 가깝게 남습니다.
      </p>
      <p>
        다만 이 그림에서 드롭아웃이 <em>가장 낮은</em> 검증 손실 자체를 낮추지는 못했습니다(p = 0.4에서 96에폭에 0.347). 드롭아웃이 한 일은 과적합이 시작되는 시점을 뒤로 미루고 그 속도를 늦춘 것입니다. 데이터가 2차원 점 60개뿐인 문제에서는 이 정도가 한계이고, 효과는 신경망이 크고 데이터가 많을수록 더 분명해집니다. 원래의 트랜스포머는 p = 0.1을 썼습니다.
      </p>
      <Code label="드롭아웃 순전파 (학습 / 추론)">{`
function dropout(a, p, training) {
  if (!training || p === 0) return a;          // 추론 때는 그대로 통과
  const keep = 1 - p;
  return a.map((v) => (Math.random() < keep ? v / keep : 0));
}
// 역전파 때는 같은 마스크를 그대로 쓴다: 꺼진 뉴런의 기울기는 0,
// 살아남은 뉴런의 기울기는 1/keep 배.`}</Code>
      <Callout kind="warn">
        드롭아웃과 배치 정규화처럼 학습과 추론에서 다르게 동작하는 층이 있으면, 평가하기 전에 모델을 추론 모드로 바꾸는 것(PyTorch라면 <code>model.eval()</code>)을 잊지 마세요. 잊으면 같은 입력에도 예측이 매번 달라집니다.
      </Callout>

      <h2>가중치 감쇠: 가중치를 조금씩 0 쪽으로</h2>
      <p>
        기초 과목에서 본 L2 규제는 손실에 가중치 제곱의 합을 더합니다. 계수를 <M>{'\\lambda/2'}</M>로 두어 <M>{'\\tfrac{\\lambda}{2}\\lVert w\\rVert^2'}</M>를 더하면 이 항의 기울기는 <M>{'\\lambda w'}</M>이므로, 경사하강법 한 걸음은 다음과 같습니다.
      </p>
      <MB note="매 걸음 가중치가 1 − ηλ배로 줄어든 뒤에 기울기 방향으로 움직입니다.">{'w \\leftarrow w - \\eta(\\nabla L + \\lambda w) = (1 - \\eta\\lambda)\\,w - \\eta \\nabla L'}</MB>
      <p>
        매 걸음 가중치를 일정 비율로 줄인다는 뜻이라 <T en="weight decay">가중치 감쇠</T>라고 부릅니다. 기울기가 꾸준히 밀어 주지 않는 가중치는 서서히 0으로 돌아가므로, 꼭 필요한 가중치만 커집니다.
      </p>
      <p>
        SGD에서는 L2 규제와 가중치 감쇠가 똑같지만, <a href="#ai-basics/gradient-descent">Adam</a>에서는 다릅니다. L2 항의 기울기 <M>{'\\lambda w'}</M>도 다른 기울기와 섞여 Adam의 분모 <M>{'\\sqrt{\\hat s}'}</M>로 나뉘기 때문에, 기울기가 컸던 가중치일수록 감쇠가 약해집니다. Loshchilov와 Hutter(2019)는 감쇠를 Adam의 적응형 걸음과 분리해 따로 적용하자고 제안했고, 이것이 <T en="AdamW">AdamW</T>입니다. 지금 트랜스포머 학습의 표준 옵티마이저이고, 보통 편향과 정규화 층의 <M>{'\\gamma, \\beta'}</M>에는 감쇠를 걸지 않습니다.
      </p>
      <MB note="AdamW. m̂, ŝ는 Adam과 같은 편향 보정된 이동 평균입니다. 감쇠 항 λw가 분모 밖에 있습니다.">{'w \\leftarrow w - \\eta\\left(\\frac{\\hat m}{\\sqrt{\\hat s} + \\epsilon} + \\lambda w\\right)'}</MB>
      <DecayFigure />
      <p>
        λ = 0에서 가중치들의 RMS(제곱 평균의 제곱근)는 초기값 0.248에서 300에폭 뒤 0.396으로 커지고, 분포의 꼬리가 ±2 너머까지 퍼집니다. 큰 가중치 몇 개가 훈련 점 하나하나를 맞추느라 커진 것입니다. λ = 1로 올리면 RMS가 0.137로 줄고 가장 큰 가중치도 0.67에 그칩니다. 검증 손실은 거의 오르지 않고 0.337로 끝납니다. λ = 3에서는 규제가 너무 강해 훈련 손실조차 0.42에서 멈추는 과소적합이 되고, λ = 10에서는 모든 가중치가 거의 0으로 끌려가(RMS 약 0.0002) 어느 점에나 50%라고 답합니다.
      </p>
      <Code label="AdamW 한 걸음 (파라미터 배열 하나)">{`
// state = { m: 0으로 채운 배열, s: 0으로 채운 배열, t: 0 }
function adamwStep(w, grad, state, lr, wd, b1 = 0.9, b2 = 0.999, eps = 1e-8) {
  state.t += 1;
  for (let i = 0; i < w.length; i++) {
    state.m[i] = b1 * state.m[i] + (1 - b1) * grad[i];
    state.s[i] = b2 * state.s[i] + (1 - b2) * grad[i] ** 2;
    const mHat = state.m[i] / (1 - b1 ** state.t);
    const sHat = state.s[i] / (1 - b2 ** state.t);
    // 감쇠는 적응형 걸음과 따로: L2였다면 grad[i]에 wd * w[i]를 더했을 것
    w[i] -= lr * (mHat / (Math.sqrt(sHat) + eps) + wd * w[i]);
  }
}`}</Code>

      <h2>조기 종료</h2>
      <p>
        가장 간단한 규제는 검증 손실이 가장 낮을 때 멈추는 것입니다. 이를 <T en="early stopping">조기 종료</T>라고 합니다. 실제로는 에폭마다 검증 손실을 재다가 최저 기록을 깨면 그때의 가중치를 저장해 두고, 정해 둔 횟수(patience) 동안 기록이 나아지지 않으면 학습을 끝낸 뒤 저장해 둔 가중치를 씁니다.
      </p>
      <p>
        그림 2에서 λ = 0일 때 초록 점선이 가리키는 31에폭의 검증 손실은 0.336입니다. λ = 1로 300에폭을 끝까지 학습한 값(0.337)과 거의 같습니다. 조기 종료와 가중치 감쇠는 둘 다 "가중치가 너무 멀리 가기 전에 붙잡는다"는 점에서 닮았습니다. 다만 조기 종료는 검증 데이터를 보고 멈출 시점을 고르므로, 최종 성능은 학습에도 멈출 시점을 고르는 데에도 쓰지 않은 테스트 데이터로 따로 재야 합니다.
      </p>

      <h2>데이터 증강</h2>
      <p>
        과적합을 막는 가장 확실한 방법은 데이터를 늘리는 것이고, 새로 모으기 어렵다면 있는 데이터를 변형해 늘릴 수 있습니다. 이것이 <T en="data augmentation">데이터 증강</T>입니다. 이미지라면 좌우로 뒤집기, 무작위로 잘라 내 크기 맞추기, 밝기와 색 조금 바꾸기 같은 변환을 매 에폭 무작위로 적용합니다. 고양이 사진은 뒤집어도 고양이이므로 정답은 그대로 두고 입력만 바꾸는 것입니다. 모델은 같은 사진을 매번 조금씩 다르게 보게 되어 픽셀 하나하나를 외울 수 없습니다.
      </p>
      <p>
        중요한 조건은 변환이 정답을 바꾸지 않아야 한다는 것입니다. 숫자 인식에서 6을 180도 돌리면 9가 되고, 글자를 좌우로 뒤집으면 다른 글자가 됩니다. 어떤 변환이 안전한지는 데이터에 대한 지식으로 정해야 합니다.
      </p>

      <h2>학습률 스케줄</h2>
      <p>
        <a href="#ai-basics/gradient-descent">경사하강법 장</a>에서 학습률이 너무 크면 발산하고 너무 작으면 느리다는 것을 보았습니다. 실제 학습에서는 학습률을 하나로 고정하지 않고 스텝에 따라 바꿉니다. 초반에는 크게 움직여 빨리 내려가고, 후반에는 줄여서 바닥에 차분히 내려앉게 하는 것입니다.
      </p>
      <p>
        왜 줄여야 할까요? 미니배치로 구한 기울기에는 잡음이 섞여 있어서, 학습률이 일정하면 최솟값 근처에서도 잡음만큼 계속 흔들립니다. 흔들림의 폭은 대략 학습률에 비례하므로, 학습률을 줄이면 더 깊은 곳에 머물 수 있습니다. 많이 쓰는 스케줄은 다음과 같습니다(<M>{'\\eta_\\text{max}'}</M>는 최대 학습률, T는 전체 스텝 수).
      </p>
      <ul>
        <li>
          <strong>계단 감소</strong>: 정해 둔 지점마다 학습률을 10분의 1 같은 비율로 뚝 떨어뜨립니다. ResNet 같은 이미지 모델에서 오래 써 온 방식입니다.
        </li>
        <li>
          <strong>코사인</strong>: 코사인 곡선의 반쪽을 따라 <M>{'\\eta_\\text{max}'}</M>에서 0까지 매끄럽게 줄입니다(Loshchilov와 Hutter, 2017). 언제 떨어뜨릴지 고를 필요가 없습니다.
        </li>
        <li>
          <strong>워밍업 + 코사인</strong>: 처음 얼마 동안은 0 근처에서 <M>{'\\eta_\\text{max}'}</M>까지 직선으로 올린 뒤 코사인으로 줄입니다. 트랜스포머와 큰 언어 모델에서 흔히 쓰는 조합입니다.
        </li>
      </ul>
      <MB note="워밍업 W 스텝 뒤의 코사인 구간. 워밍업 동안에는 η_t = η_max · (t+1)/W.">{'\\eta_t = \\frac{\\eta_\\text{max}}{2}\\left(1 + \\cos\\frac{\\pi (t - W)}{T - W}\\right)'}</MB>
      <ScheduleFigure />
      <p>
        최대 학습률 0.1, 시드 1에서 끝의 훈련 손실은 고정 0.087, 계단 감소 0.075, 코사인 0.069, 워밍업 + 코사인 0.068입니다. 학습률을 줄인 세 스케줄은 후반에 손실 곡선의 흔들림이 잦아들며 고정보다 낮은 곳에 머뭅니다. 시드 8개의 평균도 같은 순서(0.081, 0.073, 0.067, 0.067)지만 차이는 크지 않고, 시드에 따라 순서가 바뀌기도 합니다.
      </p>
      <p>
        최대 학습률을 0.7로 올리면 차이가 극적으로 커집니다. 고정 학습률은 대개 학습 도중 크게 튀다가 손실 0.69(모든 점에 50%)에 갇혀 버립니다. 이 글을 쓰며 시드 8개로 돌려 보니 손실이 0.5 아래로 끝난 횟수는 고정 1번, 계단 감소 4번, 코사인 7번, 워밍업 + 코사인 8번이었습니다. 너무 큰 학습률도 일찍 줄여 주면 살아남고, 처음부터 크게 시작하지 않으면 더 안전합니다.
      </p>
      <p>
        워밍업이 왜 도움이 되는지에 대해서는 몇 가지 설명이 있습니다. 학습 초기에는 가중치가 무작위라 기울기가 크고 방향도 들쭉날쭉합니다. Adam은 처음 몇 스텝 동안 기울기 제곱의 평균 <M>{'\\hat s'}</M>를 몇 개 안 되는 표본으로 추정하므로 그 값을 믿기 어렵고, 큰 학습률로 이런 걸음을 내디디면 손실이 튀거나 학습이 망가지기 쉽습니다. 처음에 작게 걷는 동안 통계가 자리를 잡고 가중치도 덜 가파른 곳으로 옮겨 가면, 그 뒤로는 큰 학습률을 견딥니다. 원래의 트랜스포머 논문도 처음 4,000스텝 동안 학습률을 올리는 워밍업을 썼고, 큰 모델을 큰 학습률로 학습시킬 때 워밍업이 학습을 안정시킨다는 것은 널리 관찰된 경험입니다. 이 작은 문제에서는 워밍업 자체의 효과가 크지 않다는 것도 그림 3에서 보입니다.
      </p>
      <Code label="워밍업 + 코사인 학습률">{`
function lrAt(step, totalSteps, maxLr, warmupSteps) {
  if (step < warmupSteps) {
    return maxLr * (step + 1) / warmupSteps;          // 0 근처에서 maxLr까지 직선으로
  }
  const progress = (step - warmupSteps) / (totalSteps - warmupSteps);  // 0 → 1
  return maxLr * 0.5 * (1 + Math.cos(Math.PI * progress));             // maxLr → 0
}`}</Code>

      <Callout kind="key">
        드롭아웃은 학습 때 뉴런을 확률 p로 끄고 살아남은 출력을 1 − p로 나누며, 추론 때는 아무것도 하지 않습니다. 가중치 감쇠는 매 걸음 가중치를 조금씩 0 쪽으로 당기고, Adam에서는 감쇠를 적응형 걸음과 분리한 AdamW가 표준입니다. 조기 종료는 검증 손실이 가장 낮았던 시점의 가중치를 고르고, 데이터 증강은 정답을 바꾸지 않는 변환으로 데이터를 불립니다. 학습률은 고정하지 않고 줄여 가는 것이 좋으며, 큰 모델은 보통 워밍업으로 시작해 코사인으로 줄입니다.
      </Callout>
      <Quiz
        q="드롭아웃 비율 p = 0.2인 층이 있다. 역 드롭아웃을 쓸 때, 학습 중 살아남은 뉴런의 출력과 추론 때의 출력은 각각 원래 값 a의 몇 배인가?"
        options={['학습 1.25배, 추론 1배', '학습 1배, 추론 0.8배', '학습 0.8배, 추론 1.25배', '학습 1.25배, 추론 0.8배']}
        answer={0}
        explain={
          <>
            학습 때는 뉴런의 20%가 꺼지므로 살아남은 80%의 출력을 <M>{'1/(1-0.2) = 1.25'}</M>배 해서 기댓값을 a로 맞춥니다. 그 덕분에 추론 때는 드롭아웃을 끄고 a를 그대로 쓰면 됩니다. 추론 때 0.8을 곱하는 것은 학습 때 나누지 않는 원래 방식의 보정이고, 두 방식을 섞으면 출력이 0.8배로 작아집니다.
          </>
        }
      />
    </>
  );
}
