import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../../lib/canvas';
import { fmt } from '../../../../lib/plot';
import { alpha, parseColor, usePalette } from '../../../../lib/theme';
import { HIST_BINS, Trainer, drawBoundary, drawCurves, gradProfile, histRange, makeDeepPair, probGrid, signalPass, splitData, sup, type Act, type Init, type Norm, type RGB } from './training';
import './training.css';

const rgbOf = (c: string): RGB => {
  const p = parseColor(c);
  return [p[0], p[1], p[2]];
};

/** 0.63, 0.0012 → "1.2×10⁻³", 2.3e16 → "2.3×10¹⁶" */
function sci(v: number): string {
  if (!isFinite(v)) return '∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 0.01 && a < 1000) return a >= 10 ? v.toFixed(0) : a >= 1 ? v.toFixed(1) : v.toFixed(2);
  const e = Math.floor(Math.log10(a));
  const m = v / Math.pow(10, e);
  return `${m.toFixed(1)}×10${sup(e)}`;
}

/* ─────────────── Figure 1: the signal through the layers ─────────────── */

const SIG_MAX = 20;
const INIT_OPTS: { value: Init; label: string }[] = [
  { value: 'small', label: '작게' },
  { value: 'large', label: '크게' },
  { value: 'xavier', label: 'Xavier' },
  { value: 'he', label: 'He' },
];
const INIT_NOTE: Record<Init, string> = {
  small: '모든 가중치를 표준편차 0.01로 뽑습니다.',
  large: '모든 가중치를 표준편차 1로 뽑습니다.',
  xavier: '표준편차 √(2/(n_in+n_out)) = √(1/100) = 0.1로 뽑습니다.',
  he: '표준편차 √(2/n_in) = √(2/100) ≈ 0.14로 뽑습니다.',
};

function SignalFigure() {
  const P = usePalette();
  const [act, setAct] = useState<Act>('tanh');
  const [init, setInit] = useState<Init>('small');
  const [depth, setDepth] = useState(10);
  // the first k layers are the same whatever the depth, so compute 20 once and slice
  const all = useMemo(() => signalPass(act, init, SIG_MAX), [act, init]);
  const layers = all.slice(0, depth);
  const first = layers[0];
  const last = layers[depth - 1];
  const sat = act === 'tanh' ? last.hist[0] + last.hist[HIST_BINS - 1] : 0;
  const status = act === 'tanh' && sat > 0.3 ? '포화' : last.std < 0.05 ? '사라짐' : last.std > 20 ? '폭발' : '유지';
  const statusColor = status === '유지' ? 'var(--good)' : 'var(--bad)';
  const [lo, hi] = histRange(act);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const top = 22;
      const bottom = 22;
      const labW = 26;
      const gap = 26;
      const rowH = (h - top - bottom) / depth;
      const histW = Math.round((w - labW - gap) * 0.56);
      const hx = labW;
      const sx = hx + histW + gap;
      const sw = w - sx - 6;
      const LOG = 8; // std axis spans 10^-8 … 10^8
      const SX = (v: number) => sx + ((Math.max(-LOG, Math.min(LOG, v)) + LOG) / (2 * LOG)) * sw;

      ctx.font = `600 11px ${P.fontBody}`;
      ctx.fillStyle = P.ink2;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('층', 0, 10);
      ctx.fillText(act === 'tanh' ? '활성값 분포' : '활성값 분포 (0 제외)', hx, 10);
      ctx.fillText('표준편차', sx, 10);

      // std axis guides: 10^-8, 1, 10^8
      for (const v of [-LOG, -4, 0, 4, LOG]) {
        const x = Math.round(SX(v)) + 0.5;
        ctx.strokeStyle = v === 0 ? P.lineStrong : P.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, top - 2);
        ctx.lineTo(x, h - bottom + 2);
        ctx.stroke();
      }
      // histogram axis guides
      const HX = (v: number) => hx + ((v - lo) / (hi - lo)) * histW;
      const ticks = act === 'tanh' ? [-1, 0, 1] : [0, 1, 2, 3];
      for (const v of ticks) {
        const x = Math.round(HX(v)) + 0.5;
        ctx.strokeStyle = v === 0 ? P.lineStrong : P.grid;
        ctx.beginPath();
        ctx.moveTo(x, top - 2);
        ctx.lineTo(x, h - bottom + 2);
        ctx.stroke();
      }
      ctx.font = `10px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ticks.forEach((v, i) => {
        ctx.textAlign = i === 0 ? 'left' : i === ticks.length - 1 ? 'right' : 'center';
        ctx.fillText(v < 0 ? '−' + -v : String(v), HX(v), h - bottom + 6);
      });
      ctx.textAlign = 'left';
      ctx.fillText('10⁻⁸', SX(-LOG), h - bottom + 6);
      ctx.textAlign = 'center';
      ctx.fillText('1', SX(0), h - bottom + 6);
      ctx.textAlign = 'right';
      ctx.fillText('10⁸', SX(LOG), h - bottom + 6);

      const bw = histW / HIST_BINS;
      for (let l = 0; l < depth; l++) {
        const L = layers[l];
        const y0 = top + l * rowH;
        const base = y0 + rowH - 1.5;
        const hh = rowH - 3;
        // layer number
        if (depth <= 12 || l % 2 === 0 || l === depth - 1) {
          ctx.font = `10px ${P.fontMono}`;
          ctx.fillStyle = P.ink3;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(l + 1), labW - 8, y0 + rowH / 2);
        }
        // histogram as a filled ridge, scaled to this row's tallest bin
        let mx = 1e-12;
        for (let i = 0; i < HIST_BINS; i++) mx = Math.max(mx, L.hist[i]);
        ctx.fillStyle = alpha(P.accent, 0.75);
        ctx.beginPath();
        ctx.moveTo(hx, base);
        for (let i = 0; i < HIST_BINS; i++) {
          const v = L.hist[i] > 0 ? Math.max(1, (L.hist[i] / mx) * hh) : 0;
          ctx.lineTo(hx + i * bw, base - v);
          ctx.lineTo(hx + (i + 1) * bw, base - v);
        }
        ctx.lineTo(hx + histW, base);
        ctx.closePath();
        ctx.fill();
        // mass outside the display range
        if (L.over > 0.1 || L.under > 0.1) {
          const f = Math.max(L.over, L.under);
          const atRight = L.over >= L.under;
          const ex = atRight ? hx + histW - 1 : hx + 1;
          ctx.fillStyle = P.bad;
          ctx.beginPath();
          ctx.moveTo(ex + (atRight ? 6 : -6), base - hh / 2);
          ctx.lineTo(ex, base - hh / 2 - Math.min(6, hh / 2));
          ctx.lineTo(ex, base - hh / 2 + Math.min(6, hh / 2));
          ctx.closePath();
          ctx.fill();
          // label only the first such row and the last row to keep the panel readable
          const firstOut = layers.findIndex((q) => q.over > 0.1 || q.under > 0.1);
          if (rowH >= 13 && (l === firstOut || l === depth - 1)) {
            ctx.font = `10px ${P.fontMono}`;
            const t = `범위 밖 ${Math.round(f * 100)}%`;
            const tw = ctx.measureText(t).width;
            const tx = atRight ? ex - tw - 6 : ex + 6;
            ctx.fillStyle = alpha(P.surface, 0.85);
            ctx.fillRect(tx - 2, y0 + rowH / 2 - 6, tw + 4, 12);
            ctx.fillStyle = P.bad;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(t, tx, y0 + rowH / 2);
          }
        }
        // std bar from 1 outwards on a log axis
        const lg = Math.log10(Math.max(L.std, 1e-300));
        const good = Math.abs(lg) < 0.7;
        const col = good ? P.good : lg < 0 ? P.neg : P.bad;
        const bx0 = SX(0);
        const bx1 = SX(lg);
        const bh = Math.max(3, Math.min(10, rowH - 5));
        ctx.fillStyle = alpha(col, 0.85);
        ctx.fillRect(Math.min(bx0, bx1), y0 + (rowH - bh) / 2, Math.max(2, Math.abs(bx1 - bx0)), bh);
        // a dot at the value keeps near-1 layers visible
        if (Math.abs(lg) <= LOG) {
          ctx.beginPath();
          ctx.arc(bx1, y0 + rowH / 2, Math.min(4, bh / 2 + 1), 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
        }
        if (Math.abs(lg) > LOG) {
          // clipped: draw an arrow head at the end
          const dir = lg > 0 ? 1 : -1;
          const ax = SX(lg);
          ctx.beginPath();
          ctx.moveTo(ax + dir * 5, y0 + rowH / 2);
          ctx.lineTo(ax - dir * 1, y0 + rowH / 2 - bh / 2 - 2);
          ctx.lineTo(ax - dir * 1, y0 + rowH / 2 + bh / 2 + 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    },
    [P, layers, depth, act, lo, hi],
    { height: 46 + depth * Math.max(14, Math.min(26, Math.round(320 / depth))), maxHeight: 600, minHeight: 140 },
  );

  return (
    <Figure
      no={1}
      title="층을 지나는 신호"
      hint="활성화 함수와 초기화를 바꿔 보세요"
      caption={
        <>
          폭 100인 완전 연결층을 최대 20개 쌓고 표준정규분포에서 뽑은 입력 64개를 통과시켰습니다(편향 없음). 행 하나가 층 하나이고, 주황 띠는 그 층 출력값의 분포를 행마다 가장 높은 칸에 맞춰 그린 것입니다. 표준편차 막대는 로그 눈금이라 눈금 한 칸이 10⁴배입니다. 초록이면 1 근처(약 0.2~5)에 머문 것이고, 파랑은 사라지는 쪽, 빨강은 커지는 쪽입니다. ReLU의 분포에서는 정확히 0인 값(대략 절반)을 빼고 그렸고, 값의 10% 넘게 그리는 범위를 벗어나면 빨간 삼각형으로 표시합니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`층별 활성값: ${act}, 초기화 ${init}, ${depth}층. 첫 층 표준편차 ${sci(first.std)}, 마지막 층 ${sci(last.std)}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="활성화 함수" value={act} onChange={setAct} options={[{ value: 'tanh', label: 'tanh' }, { value: 'relu', label: 'ReLU' }]} />
          <Seg label="가중치 초기화" value={init} onChange={setInit} options={INIT_OPTS} />
          <div className="tr-note" aria-live="polite">{INIT_NOTE[init]}</div>
          <Slider id="sig-depth" label="층 수" value={depth} min={2} max={SIG_MAX} step={1} onChange={setDepth} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="1층 표준편차" value={sci(first.std)} />
            <Readout label={`${depth}층 표준편차`} value={sci(last.std)} color={statusColor} />
            <Readout label="신호" value={status} color={statusColor} />
            {act === 'tanh' && <Readout label={`${depth}층에서 ±1 근처`} value={`${Math.round(sat * 100)}%`} />}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: gradient sizes ─────────────── */

const GRAD_DEPTH = 20;

function GradFigure() {
  const P = usePalette();
  const [init, setInit] = useState<Init>('small');
  const [norm, setNorm] = useState<Norm>('none');
  const [res, setRes] = useState(false);
  const g = useMemo(() => gradProfile(init, norm, res, GRAD_DEPTH), [init, norm, res]);
  const ratio = g.grad[0] / g.grad[GRAD_DEPTH - 1];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const padL = 44;
      const padR = 10;
      const padT = 12;
      const padB = 36;
      const logs = [...g.grad, ...g.act].map((v) => Math.log10(Math.max(1e-300, v)));
      let lo = Math.floor(Math.min(...logs));
      let hi = Math.ceil(Math.max(...logs));
      lo = Math.max(lo, -30);
      hi = Math.min(hi, 30);
      if (hi - lo < 6) {
        const mid = Math.round((hi + lo) / 2);
        lo = mid - 3;
        hi = mid + 3;
      }
      const Y = (v: number) => padT + ((hi - Math.max(lo, Math.min(hi, v))) / (hi - lo)) * (h - padT - padB);
      const pw = w - padL - padR;
      const bw = pw / GRAD_DEPTH;
      const stepD = Math.max(1, Math.ceil((hi - lo) / 6));
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let v = Math.floor(hi / stepD) * stepD; v >= lo; v -= stepD) {
        ctx.strokeStyle = v === 0 ? P.lineStrong : P.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, Math.round(Y(v)) + 0.5);
        ctx.lineTo(w - padR, Math.round(Y(v)) + 0.5);
        ctx.stroke();
        ctx.fillStyle = P.ink3;
        ctx.fillText(v === 0 ? '1' : `10${sup(v)}`, padL - 6, Y(v));
      }
      // gradient bars from the bottom
      for (let l = 0; l < GRAD_DEPTH; l++) {
        const v = Math.log10(Math.max(1e-300, g.grad[l]));
        const x = padL + l * bw + bw * 0.16;
        const y0 = Y(lo);
        const y1 = Y(v);
        ctx.fillStyle = alpha(P.neg, 0.8);
        ctx.beginPath();
        ctx.roundRect(x, Math.min(y0, y1), bw * 0.68, Math.max(1, Math.abs(y0 - y1)), [3, 3, 0, 0]);
        ctx.fill();
        if (l % 2 === 0 || bw > 22) {
          ctx.fillStyle = P.ink3;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(String(l + 1), x + bw * 0.34, h - padB + 5);
        }
      }
      // forward signal size as a line
      ctx.strokeStyle = P.pos;
      ctx.lineWidth = 2;
      ctx.beginPath();
      g.act.forEach((a, l) => {
        const x = padL + (l + 0.5) * bw;
        const y = Y(Math.log10(Math.max(1e-300, a)));
        if (l) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
      g.act.forEach((a, l) => {
        ctx.beginPath();
        ctx.arc(padL + (l + 0.5) * bw, Y(Math.log10(Math.max(1e-300, a))), 3, 0, Math.PI * 2);
        ctx.fillStyle = P.pos;
        ctx.fill();
        ctx.strokeStyle = P.surface;
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      ctx.fillStyle = P.ink2;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('층 번호 (1 = 입력 쪽, 20 = 출력 쪽)', padL + pw / 2, h - 2);
    },
    [P, g],
    { aspect: 1.7, maxHeight: 340, minHeight: 240 },
  );

  return (
    <Figure
      no={2}
      title="기울기의 크기"
      hint="정규화와 잔차 연결을 켜고 꺼 보세요"
      caption={
        <>
          폭 64인 ReLU 층 20개를 쌓은 신경망에 무작위 입력 64개와 무작위 정답(0 또는 1)을 주고 순전파와 역전파를 한 번씩 했습니다. 파란 막대는 역전파 때 각 층의 출력에 도착한 기울기 <M>{'\\partial L/\\partial h_l'}</M>의 크기(RMS)이고, 주황 선은 순전파 때 각 층 출력의 크기(RMS)입니다. 세로축은 로그 눈금입니다. 정규화는 활성화 함수 바로 앞에 넣었고, 잔차 연결은 둘째 층부터 층의 입력을 출력에 더합니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`층별 기울기: 입력 쪽 ÷ 출력 쪽 = ${sci(ratio)}, 마지막 층 출력 크기 ${sci(g.act[GRAD_DEPTH - 1])}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="가중치 초기화" value={init} onChange={setInit} options={[{ value: 'small', label: '작게' }, { value: 'he', label: 'He' }, { value: 'large', label: '크게' }]} />
          <Seg label="정규화" value={norm} onChange={setNorm} options={[{ value: 'none', label: '없음' }, { value: 'batch', label: '배치' }, { value: 'layer', label: '층' }]} />
          <Check label="잔차 연결" checked={res} onChange={setRes} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="1층 ÷ 20층 기울기" value={sci(ratio)} color={ratio < 0.01 || ratio > 100 ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="20층 출력 크기" value={sci(g.act[GRAD_DEPTH - 1])} color={g.act[GRAD_DEPTH - 1] > 100 || g.act[GRAD_DEPTH - 1] < 0.01 ? 'var(--bad)' : undefined} />
            <Readout label="손실" value={g.loss > 1e4 ? sci(g.loss) : fmt(g.loss, 3)} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: '층 출력에 도착한 기울기', shape: 'sq' },
          { color: 'var(--pos)', label: '층 출력의 크기 (순전파)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: training a deep narrow network ─────────────── */

const DEEP_W = 8;
const DEEP_EPOCHS = 250;
const DEEP_LR = 0.05;
const DOM = 1.2;
const GRID = 36;
const STEPS_PER_FRAME = 5;
const LOSS_LO = 0.003;

function BoundaryCanvas({ probs, data, label }: { probs: Float64Array; data: ReturnType<typeof splitData>['train']; label: string }) {
  const P = usePalette();
  const rgb = useMemo(() => ({ base: rgbOf(P.surface), pos: rgbOf(P.pos), neg: rgbOf(P.neg) }), [P]);
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const size = Math.min(w, h);
      drawBoundary(ctx, P, rgb, { x: (w - size) / 2, y: (h - size) / 2, size }, probs, GRID, DOM, data);
    },
    [P, rgb, probs, data],
    { aspect: 1, maxHeight: 280, minHeight: 140 },
  );
  return (
    <div ref={wrapRef} className="canvas-box" role="img" aria-label={label}>
      <canvas ref={canvasRef} />
    </div>
  );
}

function LossCanvas({ vals, color, tick }: { vals: number[]; color: string; tick: number }) {
  const P = usePalette();
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      drawCurves(ctx, P, w, h, {
        series: [
          { vals: [Math.LN2, Math.LN2], color: alpha(P.ink3, 0.8), dash: [3, 3], width: 1.2, xStep: DEEP_EPOCHS },
          { vals, color },
        ],
        xMax: DEEP_EPOCHS,
        yMin: LOSS_LO,
        yMax: 1,
        log: true,
        yTicks: [0.01, 0.1, 1],
        xTicks: [0, 100, 200],
        xLabel: '에폭',
      });
    },
    [P, vals, color, tick],
    { height: 130 },
  );
  return (
    <div ref={wrapRef} className="canvas-box">
      <canvas ref={canvasRef} />
    </div>
  );
}

function DeepTrainFigure() {
  const P = usePalette();
  const [depth, setDepth] = useState(12);
  const [seed, setSeed] = useState(1);
  const [run, setRun] = useState(0);
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(0);
  const data = useMemo(() => splitData('circle', 200, 0, 0.1, 7).train, []);
  const pair = useMemo(() => {
    const { plain, normed } = makeDeepPair(depth, DEEP_W, seed);
    const o = { batch: 20, lr: DEEP_LR, opt: 'sgd' as const };
    return { plain: new Trainer(plain, data, null, o), normed: new Trainer(normed, data, null, o), run };
  }, [depth, seed, data, run]);
  const figRef = useRef<HTMLDivElement>(null);
  const inView = useInView(figRef);
  const auto = useRef(false);
  const epoch = pair.plain.epoch;
  const done = epoch >= DEEP_EPOCHS;

  // start once when the figure is actually scrolled into view
  useEffect(() => {
    const el = figRef.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0]?.isIntersecting && !auto.current) {
          auto.current = true;
          setRunning(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useAnimationFrame(() => {
    pair.plain.steps(STEPS_PER_FRAME, DEEP_EPOCHS);
    pair.normed.steps(STEPS_PER_FRAME, DEEP_EPOCHS);
    if (pair.plain.epoch >= DEEP_EPOCHS) setRunning(false);
    setTick((t) => t + 1);
  }, running && inView && !done);

  // the boundary only changes when an epoch completes
  const probs = useMemo(() => ({ plain: probGrid(pair.plain.net, GRID, DOM), normed: probGrid(pair.normed.net, GRID, DOM) }), [pair, epoch]);
  const lp = pair.plain.trainLoss[pair.plain.trainLoss.length - 1];
  const ln = pair.normed.trainLoss[pair.normed.trainLoss.length - 1];
  const restart = (fn: () => void) => {
    setRunning(false);
    fn();
  };

  return (
    <Figure
      no={3}
      title="깊고 좁은 망 학습시키기"
      hint="층 수를 바꾸고 학습을 지켜보세요"
      caption={
        <>
          원 모양으로 나뉜 점 200개를 폭 {DEEP_W}인 ReLU 층으로 분류합니다. 두 망은 시드가 같아 가중치를 똑같이 He 방식으로 시작하고 같은 순서로 미니배치(20개)를 봅니다. 최적화는 모멘텀 SGD(학습률 {DEEP_LR})입니다. 다른 점은 층 정규화와 잔차 연결이 있느냐 하나뿐입니다. 손실 그래프의 세로축은 로그 눈금이고, 점선은 ln 2 ≈ 0.69로 모든 점에 50%라고 답할 때의 손실입니다. 배경색은 신경망이 각 위치를 주황 쪽으로 볼 확률이고 검은 곡선이 결정 경계입니다.
        </>
      }
    >
      <div ref={figRef} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="tr-bar">
          <div className="btn-row">
            <Button primary onClick={() => setRunning((r) => !r)} disabled={done}>
              {running ? '일시정지' : done ? '학습 끝' : '학습 시작'}
            </Button>
            <Button onClick={() => restart(() => setRun((k) => k + 1))} title="같은 시드로 처음부터 다시 학습합니다">
              처음부터
            </Button>
            <Button onClick={() => restart(() => setSeed((s) => (s % 10) + 1))} title="가중치를 다른 시드로 새로 뽑습니다">
              다른 시드
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <Readout label="에폭" value={`${epoch} / ${DEEP_EPOCHS}`} />
            <Readout label="단순한 망" value={fmt(lp, 3)} color="var(--bad)" />
            <Readout label="정규화 + 잔차" value={fmt(ln, 3)} color="var(--good)" />
          </div>
        </div>
        <div className="tr-ctl-row">
          <div className="tr-seg">
            <Seg label="은닉층 수" value={depth} onChange={(v) => restart(() => setDepth(v))} options={[4, 8, 12, 16].map((d) => ({ value: d, label: `${d}층` }))} />
          </div>
          <span className="tr-status">시드 {seed}</span>
        </div>
        <div className="tr-pair">
          <div className="tr-panel">
            <div className="tr-panel-head" data-kind="plain">
              <span>단순한 망</span>
              <span className="mono">He 초기화</span>
            </div>
            <BoundaryCanvas probs={probs.plain} data={data} label={`단순한 망의 결정 경계, 훈련 손실 ${fmt(lp, 3)}`} />
            <LossCanvas vals={pair.plain.trainLoss} color={P.bad} tick={tick} />
          </div>
          <div className="tr-panel">
            <div className="tr-panel-head" data-kind="good">
              <span>정규화 + 잔차</span>
              <span className="mono">He + LN + 잔차</span>
            </div>
            <BoundaryCanvas probs={probs.normed} data={data} label={`층 정규화와 잔차 연결을 쓴 망의 결정 경계, 훈련 손실 ${fmt(ln, 3)}`} />
            <LossCanvas vals={pair.normed.trainLoss} color={P.good} tick={tick} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function InitNorm() {
  return (
    <>
      <h2>층을 쌓을수록 생기는 일</h2>
      <p>
        <a href="#ai-basics/backprop">역전파 장</a>에서 기울기가 층을 거슬러 갈 때마다 국소 미분이 곱해지고, 곱하는 값이 1보다 작으면 입력 쪽 층의 기울기가 기하급수적으로 작아지는 <T en="vanishing gradient">기울기 소실</T>을 보았습니다. 그 장에서는 층마다 곱해지는 값을 숫자 하나로 단순화했습니다. 이번에는 진짜 행렬을 쌓아서, 신호가 앞으로 갈 때와 기울기가 뒤로 올 때 크기가 어떻게 변하는지 직접 재 봅니다.
      </p>
      <p>
        출발점은 분산 계산입니다. 입력 <M>{'x_1, \\dots, x_n'}</M>과 가중치 <M>{'w_1, \\dots, w_n'}</M>이 서로 독립이고 평균이 0이면, 뉴런 하나의 입력 합 <M>{'z = \\sum_i w_i x_i'}</M>의 분산은 항마다 분산을 더한 것입니다.
      </p>
      <MB note="n은 그 층으로 들어오는 입력의 개수(fan-in)입니다.">{'\\operatorname{Var}(z) = n \\cdot \\operatorname{Var}(w) \\cdot \\operatorname{Var}(x)'}</MB>
      <p>
        층을 하나 지날 때마다 분산에 <M>{'n \\operatorname{Var}(w)'}</M>가 곱해진다는 뜻입니다. 이 값이 1보다 조금만 작아도 20층을 지나면 신호가 사라지고, 조금만 커도 폭발합니다. 활성화 함수는 여기에 자기 몫의 배율을 더 곱합니다. 폭이 100이고 가중치의 표준편차가 0.01이면 <M>{'\\sqrt{n}\\,\\sigma_w = 10 \\times 0.01 = 0.1'}</M>이라, 표준편차가 층마다 10분의 1이 됩니다.
      </p>
      <SignalFigure />
      <p>
        tanh와 "작게"로 시작한 그림 1에서 1층의 표준편차는 0.1, 2층은 0.01, 10층은 약 <M>{'10^{-10}'}</M>입니다. 이 층들의 출력은 사실상 모두 0이고, 입력이 무엇이었는지에 대한 정보가 남아 있지 않습니다. "크게"(표준편차 1)로 바꾸면 반대 문제가 생깁니다. tanh는 출력이 ±1을 넘지 못하므로 폭발하는 대신 <T en="saturation">포화</T>합니다. 값의 86%가 ±1 근처에 몰리는데, 그 구간에서 tanh의 기울기는 0에 가까우므로 역전파 때 기울기가 지나가지 못합니다. ReLU는 위쪽 한계가 없어서 진짜로 폭발합니다. 층마다 표준편차가 <M>{'\\sqrt{100/2} \\approx 7.1'}</M>배씩 커져 20층에서 약 <M>{'7 \\times 10^{16}'}</M>이 됩니다.
      </p>

      <h2>Xavier와 He 초기화</h2>
      <p>
        해결책은 식에서 바로 나옵니다. <M>{'n \\operatorname{Var}(w) = 1'}</M>이 되도록, 즉 <M>{'\\operatorname{Var}(w) = 1/n'}</M>으로 가중치를 뽑으면 선형 구간에서는 분산이 그대로 유지됩니다. 역전파 때는 같은 논리가 출력 개수 <M>{'n_\\text{out}'}</M>에 대해 성립하므로, 2010년 Glorot과 Bengio는 두 조건을 절충해 <M>{'n_\\text{in}'}</M>과 <M>{'n_\\text{out}'}</M>의 평균으로 나누자고 제안했습니다. 이것이 <T en="Xavier / Glorot initialization">Xavier 초기화</T>입니다.
      </p>
      <p>
        ReLU는 입력의 절반가량을 0으로 만들어 분산을 절반으로 줄입니다. 그래서 2015년 He 등은 그만큼을 미리 2배로 키워 두는 <T en="He / Kaiming initialization">He 초기화</T>를 제안했습니다.
      </p>
      <MB note="Xavier는 tanh처럼 0 근처에서 기울기가 1인 활성화 함수를, He는 ReLU를 전제로 합니다.">{'\\begin{aligned} \\text{Xavier:}\\quad & \\operatorname{Var}(w) = \\frac{2}{n_\\text{in} + n_\\text{out}} \\\\[4pt] \\text{He:}\\quad & \\operatorname{Var}(w) = \\frac{2}{n_\\text{in}} \\end{aligned}'}</MB>
      <p>
        그림 1에서 ReLU와 He를 고르면 20층을 지나는 동안 표준편차가 0.67에서 1.05 사이에 머뭅니다. 층마다 조금씩 오르내리는 것은 폭이 유한해서 생기는 우연한 흔들림이고, 한쪽으로 쏠리는 경향은 없습니다. 같은 ReLU에 Xavier를 쓰면 층마다 분산이 절반이 되어 20층에서는 He의 정확히 <M>{'2^{-10} \\approx 1/1024'}</M>배가 됩니다(ReLU는 입력을 c배 하면 출력도 c배가 되는 함수라 이 비율이 정확히 맞아떨어집니다).
      </p>
      <p>
        tanh와 Xavier의 조합은 조금 더 미묘합니다. 표준편차가 1층 0.63에서 10층 0.22, 20층 0.16으로 천천히 줄어듭니다. tanh는 0에서 멀어질수록 기울기가 1보다 작아지는 함수라서, 선형 구간을 가정한 Xavier의 계산보다 신호가 조금씩 덜 전달되기 때문입니다. 그래도 "작게"처럼 층마다 10분의 1로 무너지지는 않습니다. PyTorch 같은 프레임워크는 tanh에 이득(gain) 5/3을 곱해 이 손실을 메우라고 권합니다.
      </p>
      <Code label="He 초기화">{`
// 표준정규분포 표본 (Box–Muller)
function randn() {
  const u = 1 - Math.random(), v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// nIn × nOut 가중치 행렬을 He 방식으로 초기화
function heInit(nIn, nOut) {
  const std = Math.sqrt(2 / nIn);         // Xavier라면 Math.sqrt(2 / (nIn + nOut))
  return Array.from({ length: nIn }, () =>
    Array.from({ length: nOut }, () => randn() * std));
}`}</Code>
      <Callout kind="note">
        초기화가 맞추는 것은 학습을 <strong>시작할 때</strong>의 크기뿐입니다. 학습이 진행되면 가중치가 바뀌면서 층마다 출력의 크기와 분포도 계속 바뀝니다. 그래서 학습 내내 크기를 다시 맞춰 주는 장치가 필요합니다.
      </Callout>

      <h2>배치 정규화와 층 정규화</h2>
      <p>
        <T en="normalization">정규화</T>는 층 중간에서 값들을 평균 0, 분산 1로 다시 맞추는 연산입니다. 앞 층의 가중치가 어떻게 바뀌든 다음 층은 늘 비슷한 크기의 입력을 받습니다. 다만 모든 값을 강제로 평균 0, 분산 1에 묶어 두면 신경망의 표현력이 줄어들므로, 학습 가능한 배율 <M>{'\\gamma'}</M>와 이동 <M>{'\\beta'}</M>를 곱하고 더해 신경망이 필요한 크기를 스스로 고르게 합니다.
      </p>
      <MB note="ε는 0으로 나누는 것을 막는 작은 수(보통 10⁻⁵)입니다.">{'\\hat x = \\frac{x - \\mu}{\\sqrt{\\sigma^2 + \\varepsilon}}, \\qquad y = \\gamma \\hat x + \\beta'}</MB>
      <p>두 정규화는 평균과 분산을 "무엇에 대해" 구하느냐만 다릅니다.</p>
      <ul>
        <li>
          <strong>
            <T en="batch normalization">배치 정규화</T>
          </strong>
          (Ioffe와 Szegedy, 2015)는 특성 하나마다 미니배치 안의 예제들에 걸쳐 평균과 분산을 구합니다. 그래서 한 예제의 출력이 같은 배치에 들어온 다른 예제들에 따라 달라지고, 배치가 작으면 통계가 흔들립니다. 추론할 때는 예제가 하나씩 올 수도 있으므로, 학습하는 동안 배치 통계의 이동 평균을 모아 두었다가 그 값을 대신 씁니다. 학습 모드와 추론 모드에서 계산이 달라지는 셈이라, 모드 전환을 잊으면 흔한 버그가 됩니다.
        </li>
        <li>
          <strong>
            <T en="layer normalization">층 정규화</T>
          </strong>
          (Ba 등, 2016)는 예제 하나 안에서 그 층의 모든 특성에 걸쳐 평균과 분산을 구합니다. 다른 예제와 무관하고 학습과 추론의 계산이 똑같아서, 배치 크기가 들쭉날쭉하고 길이가 제각각인 문장을 다루는 트랜스포머가 이쪽을 씁니다. 요즘의 큰 언어 모델은 평균을 빼는 단계를 생략한 변형인 RMSNorm도 많이 씁니다.
        </li>
      </ul>
      <Code label="층 정규화 순전파 (예제 하나)">{`
function layerNorm(x, gamma, beta, eps = 1e-5) {
  const n = x.length;
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const variance = x.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const inv = 1 / Math.sqrt(variance + eps);
  // 평균 0, 분산 1로 맞춘 뒤 학습되는 배율과 이동을 적용
  return x.map((v, i) => gamma[i] * (v - mean) * inv + beta[i]);
}
// 배치 정규화는 같은 계산을 "특성 하나 × 배치 전체"에 대해 한다.
// 추론 때는 학습 중 모아 둔 평균·분산의 이동 평균을 쓴다.`}</Code>
      <Callout kind="note" label="용어">
        <a href="#ai-basics/overfitting">과적합 장</a>에서는 가중치에 벌점을 주는 regularization을 "정규화"라고 불렀습니다. 이 과목에서는 둘을 구분해, 이 장의 normalization을 <strong>정규화</strong>, 다음 장의 regularization을 <strong>규제</strong>라고 부릅니다.
      </Callout>

      <h2>잔차 연결: 기울기의 지름길</h2>
      <p>
        <T en="residual connection">잔차 연결</T>은 층의 출력에 그 층의 입력을 그대로 더하는 것입니다. 층 <M>{'f'}</M>는 입력 전체를 새로 만들어 내는 대신, 입력에 얹을 "고칠 부분"만 배우면 됩니다. 2015년 He 등이 이 구조로 152층짜리 ResNet을 학습시켜 ImageNet 대회에서 우승했고, 지금은 트랜스포머를 포함한 거의 모든 깊은 신경망이 이 구조를 씁니다.
      </p>
      <MB note="I는 항등 행렬입니다. f의 미분이 아무리 작아져도 기울기에는 I가 남습니다.">{'h_{l+1} = h_l + f(h_l) \\quad\\Longrightarrow\\quad \\frac{\\partial h_{l+1}}{\\partial h_l} = I + \\frac{\\partial f}{\\partial h_l}'}</MB>
      <p>
        역전파 때 기울기는 <M>{'f'}</M>를 거치는 길과 덧셈을 그대로 건너뛰는 길로 나뉘어 흐릅니다. 건너뛰는 길에는 곱해지는 값이 없으므로 기울기가 층 수만큼 거듭 곱해져 사라질 일이 없습니다. 그림 2에서 정규화와 잔차 연결이 기울기를 어떻게 바꾸는지 비교해 보세요.
      </p>
      <GradFigure />
      <p>그림 2의 설정마다 1층과 20층에 도착한 기울기의 비율은 이렇습니다.</p>
      <ul>
        <li>
          <strong>작게, 아무것도 없음</strong>: 비율이 약 <M>{'10^{-24}'}</M>입니다. 출력 쪽에는 기울기가 오지만 입력 쪽 층들은 학습 신호를 사실상 받지 못합니다.
        </li>
        <li>
          <strong>작게 + 잔차 연결</strong>: 비율이 거의 정확히 1이 됩니다. 층들이 거의 0을 내놓아도 덧셈의 지름길로 신호와 기울기가 모두 지나갑니다.
        </li>
        <li>
          <strong>He + 잔차 연결</strong>(정규화 없음): 이번에는 문제가 됩니다. 층마다 입력에 비슷한 크기의 값이 더해져 20층 출력이 <M>{'10^4'}</M>을 넘고, 1층의 기울기는 20층의 약 600배가 됩니다. 잔차 연결만으로는 폭발을 막지 못합니다.
        </li>
        <li>
          <strong>층 정규화</strong>: 초기화를 "작게", "He", "크게" 중 무엇으로 바꿔도 파란 막대가 그대로입니다(비율 약 1.2). 정규화가 가중치의 크기를 지워 버리기 때문입니다.
        </li>
        <li>
          <strong>배치 정규화</strong>: 역시 초기화에 상관없이 같은 모양이지만, 입력 쪽으로 갈수록 기울기가 조금씩 커져 20층을 거슬러 오면 약 40배가 됩니다. 10의 수십 제곱씩 무너지는 것에 비하면 다룰 만한 범위입니다.
        </li>
      </ul>
      <p>
        정규화와 잔차 연결을 함께 켜면 신호와 기울기가 모두 일정한 범위에 머뭅니다. 주황 선이 깊이에 따라 천천히 올라가는 것은 층마다 더해지는 값이 쌓이기 때문인데, 층 수에 비례하는 정도라 지수적인 폭발과는 다릅니다. 트랜스포머 블록이 바로 이 조합입니다. 요즘 흔한 Pre-LN 방식에서는 층 정규화를 한 입력을 어텐션이나 피드포워드 층에 넣고, 그 결과를 원래 입력에 더합니다.
      </p>
      <Code label="잔차 블록 (트랜스포머식 Pre-LN)">{`
// x: 길이 d인 벡터 하나. f는 피드포워드나 어텐션 같은 부분 층.
function residualBlock(x, f, gamma, beta) {
  const y = f(layerNorm(x, gamma, beta));   // 정규화한 입력으로 "고칠 부분"을 계산
  return x.map((v, i) => v + y[i]);         // 원래 입력에 더한다: 기울기의 지름길
}`}</Code>

      <h2>깊은 망을 실제로 학습시켜 보면</h2>
      <p>
        초기 상태의 기울기가 괜찮아 보여도 학습이 잘 된다는 보장은 없습니다. 그림 3은 폭이 8밖에 안 되는 좁은 ReLU 망 두 개를 같은 시드, 같은 데이터, 같은 학습률로 나란히 학습시킵니다. 한쪽은 He 초기화만 한 단순한 망이고, 다른 쪽은 여기에 층 정규화와 잔차 연결을 더했습니다.
      </p>
      <DeepTrainFigure />
      <p>
        은닉층이 4개일 때는 둘 다 잘 배웁니다. 12개로 늘리면 단순한 망은 손실이 잠깐 내려가다가 0.69에 멈춰 버리는 일이 잦습니다. 이 글을 쓰며 시드 10개로 250에폭씩 돌려 보니 단순한 망은 12층에서 10번 중 5번, 16층에서는 10번 모두 손실 0.5 위에서 멈췄고, 정규화와 잔차 연결을 넣은 망은 모든 경우에 0.1 아래로 내려갔습니다. 멈춘 단순한 망을 들여다보면 대부분 어느 한 층의 ReLU가 모든 입력에 대해 0을 내놓고 있습니다. 그 층부터는 출력이 입력과 무관한 상수가 되고, ReLU의 기울기도 0이라 다시 살아날 길이 없습니다. 폭이 좁고 층이 깊을수록 학습 도중의 큰 걸음 한 번에 이런 일이 생기기 쉽습니다.
      </p>
      <Callout kind="intuition">
        정규화는 각 층이 받는 입력의 크기를 학습 내내 일정하게 붙잡아 두고, 잔차 연결은 어떤 층이 망가져도 신호와 기울기가 돌아갈 길을 남겨 둡니다. 실제 모델은 이 그림보다 수천 배 넓고 수십 배 깊지만, 수백 층짜리 망이 학습되는 이유는 같습니다.
      </Callout>

      <Callout kind="key">
        층을 하나 지날 때마다 신호의 분산에는 <M>{'n\\operatorname{Var}(w)'}</M>와 활성화 함수의 배율이 곱해지므로, 이 곱이 1에서 벗어나면 깊이에 따라 지수적으로 사라지거나 폭발합니다. Xavier(<M>{'2/(n_\\text{in}+n_\\text{out})'}</M>)와 He(<M>{'2/n_\\text{in}'}</M>) 초기화는 시작할 때 이 곱을 1로 맞춥니다. 학습 중에도 크기를 붙잡는 것이 정규화이고, 배치 정규화는 배치에 걸쳐(추론 때는 이동 평균), 층 정규화는 예제 하나 안에서 통계를 구합니다. 잔차 연결은 덧셈으로 기울기의 지름길을 만들고, 정규화와 함께 쓸 때 가장 깊은 망까지 안정적으로 학습됩니다.
      </Callout>
      <Quiz
        q="폭이 256인 ReLU 층으로 50층짜리 MLP를 만들었다. 정규화와 잔차 연결은 없다. 학습을 시작할 때 신호가 사라지지도 폭발하지도 않게 하려면 가중치의 표준편차를 얼마로 뽑아야 할까?"
        options={['0.01', '√(1/256) = 0.0625', '√(2/256) ≈ 0.088', '1']}
        answer={2}
        explain={
          <>
            ReLU는 입력의 절반가량을 0으로 만들어 분산을 반으로 줄이므로, <M>{'n \\operatorname{Var}(w) = 2'}</M>가 되어야 층을 지나도 분산이 유지됩니다. 그래서 He 초기화 <M>{'\\sqrt{2/256}'}</M>입니다. <M>{'\\sqrt{1/256}'}</M>을 쓰면 층마다 분산이 절반이 되어 50층 뒤에는 표준편차가 <M>{'2^{-25}'}</M>배, 약 3,400만분의 1로 줄어듭니다. 0.01은 그보다 훨씬 빨리 사라지고, 1은 층마다 약 11배씩 폭발합니다.
          </>
        }
      />
    </>
  );
}
