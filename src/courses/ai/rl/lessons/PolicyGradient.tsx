import { useMemo, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { ARM_NAMES, ARM_P, CELLS, CORRIDOR, firstReach, gradSpread, meanCurve, optimalStartValue, policyValues, runBandit, smooth, trainCorridor, zeroTheta, type BanditFrame } from './pg';
import './rl.css';
import './pg.css';

const ARM_CSS = ['var(--neg)', 'var(--pos)', 'var(--good)'];
const armColor = (P: Palette, k: number) => [P.neg, P.pos, P.good][k];
const pct = (v: number) => `${Math.round(v * 100)}%`;

/* ─────────────── shared: probability history as stacked bands ─────────────── */

function drawHistory(ctx: CanvasRenderingContext2D, P: Palette, frames: BanditFrame[], upto: number, x0: number, y0: number, w: number, h: number) {
  const n = frames.length - 1;
  const X = (t: number) => x0 + (t / n) * w;
  ctx.fillStyle = P.surface2;
  ctx.fillRect(x0, y0, w, h);
  for (let k = 2; k >= 0; k--) {
    ctx.beginPath();
    ctx.moveTo(X(0), y0 + h);
    for (let t = 0; t <= upto; t++) {
      // stack from the bottom: arm 0, then 1, then 2 on top
      const top = frames[t].probs.slice(0, k + 1).reduce((a, b) => a + b, 0);
      ctx.lineTo(X(t), y0 + h - top * h);
    }
    ctx.lineTo(X(upto), y0 + h);
    ctx.closePath();
    ctx.fillStyle = alpha(armColor(P, k), 0.55);
    ctx.fill();
  }
  ctx.strokeStyle = P.grid;
  ctx.lineWidth = 1;
  for (const g of [0.25, 0.5, 0.75]) {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + h - g * h + 0.5);
    ctx.lineTo(x0 + w, y0 + h - g * h + 0.5);
    ctx.stroke();
  }
  ctx.fillStyle = P.ink3;
  ctx.font = `10px ${P.fontMono}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const g of [0, 0.5, 1]) ctx.fillText(`${g * 100}%`, x0 - 5, y0 + h - g * h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of [0, n / 2, n]) ctx.fillText(String(t), X(t), y0 + h + 5);
}

/* ─────────────── Figure 1: watch the probabilities move ─────────────── */

const STEPS = 300;
const BANDIT_ALPHA = 0.1;
const BANDIT_SEED = 7;

function BanditFigure() {
  const P = usePalette();
  const frames = useMemo(() => runBandit(STEPS, BANDIT_ALPHA, false, BANDIT_SEED), []);
  const s = useStepper(frames.length, 30, 'bandit', true);
  const f = frames[s.i];
  const pulls = [0, 0, 0];
  frames.slice(1, s.i + 1).forEach((x) => pulls[x.a]++);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const narrow = w < 560;
      const bw = narrow ? w : w * 0.34;
      const bh = narrow ? 150 : h;
      // bars of π(a) for the three arms
      const colW = (bw - 30) / 3;
      for (let k = 0; k < 3; k++) {
        const x = 20 + k * colW + colW * 0.18;
        const bwid = colW * 0.64;
        const full = bh - 64;
        ctx.fillStyle = P.surface2;
        ctx.fillRect(x, 22, bwid, full);
        ctx.fillStyle = armColor(P, k);
        ctx.fillRect(x, 22 + full * (1 - f.probs[k]), bwid, full * f.probs[k]);
        if (f.a === k) {
          ctx.strokeStyle = P.ink;
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 2, 20, bwid + 4, full + 4);
        }
        ctx.fillStyle = P.ink;
        ctx.font = `700 13px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${ARM_NAMES[k]} ${pct(f.probs[k])}`, x + bwid / 2, 22 + full + 6);
        ctx.fillStyle = P.ink3;
        ctx.font = `10px ${P.fontBody}`;
        ctx.fillText(`당첨 ${pct(ARM_P[k])}`, x + bwid / 2, 22 + full + 24);
      }
      ctx.fillStyle = P.ink3;
      ctx.font = `600 11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('지금 정책 π(팔)', 4, 2);
      // history
      const hx = narrow ? 34 : bw + 40;
      const hy = narrow ? bh + 28 : 22;
      const hw = w - hx - 8;
      const hh = (narrow ? h - bh - 28 : h) - 22 - 20;
      ctx.fillText('지금까지의 정책 (아래부터 A, B, C)', hx, hy - 20);
      drawHistory(ctx, P, frames, s.i, hx, hy, hw, hh);
    },
    [P, frames, s.i, f],
    { height: 300, minHeight: 40 },
  );

  const note =
    s.i === 0
      ? '처음에는 로짓이 모두 0이라 세 팔을 똑같이 1/3씩 고릅니다.'
      : `${f.t}번째: 팔 ${ARM_NAMES[f.a]}를 당겨 보상 ${f.r}. ${f.r > 0 ? `${ARM_NAMES[f.a]}의 로짓이 α·1·(1 − π)만큼 오르고 나머지는 내려갑니다.` : '보상이 0이라 이번에는 아무것도 바뀌지 않습니다.'}`;

  return (
    <Figure
      no={1}
      title="당겨 보고, 보상을 받은 만큼 그 팔의 확률을 올린다"
      hint="재생하거나 한 단계씩 넘겨 보세요"
      caption={
        <>
          세 팔의 당첨 확률은 30%, 50%, 80%이고 에이전트는 이것을 모릅니다. 정책은 로짓 세 개의 소프트맥스이고, 매번 정책대로 팔을 하나 뽑아 당긴 뒤 REINFORCE 규칙으로 로짓을 고칩니다. 학습률 α = {BANDIT_ALPHA}, 씨앗 {BANDIT_SEED}의 {STEPS}번입니다. 정책의 기록은 세 확률을 아래부터 쌓은 것이라, 맨 위 초록 띠의 두께가 C를 고를 확률입니다.
        </>
      }
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${f.t}번 당긴 뒤의 정책: A ${pct(f.probs[0])}, B ${pct(f.probs[1])}, C ${pct(f.probs[2])}. 지금까지 A ${pulls[0]}번, B ${pulls[1]}번, C ${pulls[2]}번 당겼습니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="rl-note" aria-live="polite">
        {note}
      </div>
      <div className="controls row">
        <StepControls s={s} id="pg-bandit-speed" maxSpeed={120} />
      </div>
      <div className="readouts">
        {[0, 1, 2].map((k) => (
          <Readout key={k} label={`${ARM_NAMES[k]}를 당긴 횟수`} value={`${pulls[k]}번`} color={ARM_CSS[k]} />
        ))}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: add a constant to every reward ─────────────── */

const RUNS = 50;

function OffsetFigure() {
  const P = usePalette();
  const [offset, setOffset] = useState(3);
  const [baseline, setBaseline] = useState(false);
  const frames = useMemo(() => runBandit(STEPS, BANDIT_ALPHA, baseline, BANDIT_SEED, offset), [baseline, offset]);
  const summary = useMemo(() => {
    let right = 0, wrong = 0, pc = 0;
    for (let k = 1; k <= RUNS; k++) {
      const p = runBandit(STEPS, BANDIT_ALPHA, baseline, k, offset)[STEPS].probs;
      pc += p[2] / RUNS;
      if (p[2] > 0.5) right++;
      else if (Math.max(p[0], p[1]) > 0.5) wrong++;
    }
    return { right, wrong, pc };
  }, [baseline, offset]);
  const last = frames[STEPS].probs;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      ctx.fillStyle = P.ink3;
      ctx.font = `600 11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`씨앗 ${BANDIT_SEED}의 정책 (아래부터 A, B, C)`, 34, 2);
      drawHistory(ctx, P, frames, STEPS, 34, 22, w - 42, h - 22 - 22);
    },
    [P, frames],
    { height: 200, minHeight: 40 },
  );

  return (
    <Figure
      no={2}
      title="모든 보상에 같은 수를 더하면"
      hint="더하는 수를 바꾸고 기준선을 켜 보세요"
      caption={
        <>
          그림 1과 같은 문제, 같은 학습률이고 보상에만 같은 수를 더했습니다. 어느 팔이 가장 좋은지는 바뀌지 않습니다. 기준선을 켜면 그때까지 받은 보상의 평균을 빼고 고칩니다. 아래 숫자는 씨앗 1~{RUNS}로 {RUNS}번 따로 학습시킨 뒤, {STEPS}번째에 한 팔의 확률이 50%를 넘은 실행을 센 것입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="pg-offset" label="모든 보상에 더하는 수" value={offset} min={0} max={5} step={1} onChange={setOffset} format={(v) => `+${v}`} />
        <Check label="기준선 빼기 (지금까지의 평균 보상)" checked={baseline} onChange={setBaseline} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`보상에 ${offset}을 더하고 기준선을 ${baseline ? '켠' : '끈'} 학습. 씨앗 ${BANDIT_SEED}은 ${STEPS}번 뒤 A ${pct(last[0])}, B ${pct(last[1])}, C ${pct(last[2])}입니다. ${RUNS}번 중 ${summary.right}번이 C로, ${summary.wrong}번이 다른 팔로 쏠렸습니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts">
        <Readout label={`${RUNS}번 중 C로 쏠림`} value={`${summary.right}번`} color="var(--good)" />
        <Readout label="엉뚱한 팔로 쏠림" value={`${summary.wrong}번`} color={summary.wrong ? 'var(--bad)' : undefined} />
        <Readout label="C를 고를 확률 평균" value={pct(summary.pc)} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: a corridor, trained episode by episode ─────────────── */

const EPISODES = 500;

function CorridorFigure() {
  const P = usePalette();
  const [alphaLr, setAlphaLr] = useState(0.3);
  const [baseline, setBaseline] = useState(true);
  const [seed, setSeed] = useState(1);
  const run = useMemo(() => trainCorridor(EPISODES, alphaLr, baseline, seed), [alphaLr, baseline, seed]);
  const s = useStepper(EPISODES, 40, `${alphaLr}-${baseline}-${seed}`, true);
  const e = s.i;
  const right = run.right[e];
  const ep = run.eps[e];
  const recent = smooth(run.rets, 25);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const n = CORRIDOR.n;
      const cw = Math.min(70, (w - 16) / n);
      const x0 = (w - cw * n) / 2;
      const y0 = 26;
      const ch = 44;
      for (let c = 0; c < n; c++) {
        const x = x0 + c * cw;
        const terminal = c === 0 || c === n - 1;
        ctx.fillStyle = terminal ? alpha(c === 0 ? P.pos : P.good, 0.22) : P.surface2;
        ctx.fillRect(x + 2, y0, cw - 4, ch);
        ctx.fillStyle = P.ink;
        ctx.font = `700 12px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (terminal) ctx.fillText(c === 0 ? '+0.5' : '+1', x + cw / 2, y0 + ch / 2);
        else if (c === CORRIDOR.start) {
          ctx.fillStyle = P.ink3;
          ctx.font = `10px ${P.fontBody}`;
          ctx.fillText('출발', x + cw / 2, y0 - 9);
        }
        // policy: a bar split into left and right probability
        if (!terminal) {
          const pr = right[CELLS.indexOf(c)];
          const by = y0 + ch + 8;
          const bw = cw - 8;
          ctx.fillStyle = alpha(P.pos, 0.75);
          ctx.fillRect(x + 4, by, bw * (1 - pr), 10);
          ctx.fillStyle = alpha(P.good, 0.85);
          ctx.fillRect(x + 4 + bw * (1 - pr), by, bw * pr, 10);
          ctx.fillStyle = P.ink2;
          ctx.font = `10px ${P.fontMono}`;
          ctx.fillText(`→${pct(pr)}`, x + cw / 2, by + 22);
        }
      }
      // the latest episode as a zig-zag path under the corridor
      const py0 = y0 + ch + 48;
      const stepH = Math.max(3, Math.min(10, (h - py0 - 70) / Math.max(1, ep.length + 1)));
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      // cells visited: the state before each move, then the end cell if the episode ended there
      const cells = ep.map((st) => st.s);
      const lastStep = ep[ep.length - 1];
      if (lastStep && lastStep.r > 0) cells.push(lastStep.r === CORRIDOR.rightR ? n - 1 : 0);
      cells.forEach((c, t) => {
        const x = x0 + c * cw + cw / 2;
        const y = py0 + t * stepH;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = P.ink;
      cells.forEach((c, t) => {
        ctx.beginPath();
        ctx.arc(x0 + c * cw + cw / 2, py0 + t * stepH, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${e + 1}번째 판의 경로 (아래로 갈수록 나중)`, 4, py0 - 8);
      // return of each episode so far
      const gy = h - 56;
      const gh = 46;
      const gx = 34;
      const gw = w - gx - 8;
      ctx.fillStyle = P.surface2;
      ctx.fillRect(gx, gy, gw, gh);
      const Y = (v: number) => gy + gh - v * gh;
      ctx.strokeStyle = alpha(P.ink3, 0.6);
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(gx, Y(optimal));
      ctx.lineTo(gx + gw, Y(optimal));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k <= e; k++) {
        const x = gx + (k / (EPISODES - 1)) * gw;
        if (k === 0) ctx.moveTo(x, Y(recent[k]));
        else ctx.lineTo(x, Y(recent[k]));
      }
      ctx.stroke();
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('1', gx - 5, Y(1));
      ctx.fillText('0', gx - 5, Y(0));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.font = `10px ${P.fontBody}`;
      ctx.fillText('최근 25판의 평균 보상 (점선: 가장 좋은 정책)', gx, gy - 2);
    },
    [P, right, ep, e, recent],
    { height: 300, minHeight: 40 },
  );

  return (
    <Figure
      no={3}
      title="복도 끝의 큰 상과 가까운 작은 상"
      hint="학습을 재생해 보고, 기준선과 학습률을 바꿔 보세요"
      caption={
        <>
          일곱 칸짜리 복도의 셋째 칸에서 출발합니다. 왼쪽 끝에 닿으면 0.5, 오른쪽 끝에 닿으면 1을 받고 끝납니다. 한 걸음마다 미래 보상을 0.9배로 깎고(할인율 γ = 0.9), 10%의 확률로 고른 방향과 반대로 미끄러집니다. 칸마다 왼쪽/오른쪽 로짓 두 개를 두는 소프트맥스 정책을 판이 끝날 때마다 REINFORCE로 고칩니다. 칸 아래 막대의 초록 부분이 오른쪽으로 갈 확률입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="pg-corr-alpha" label="학습률 α" value={alphaLr} min={0.1} max={0.5} step={0.1} onChange={setAlphaLr} format={(v) => v.toFixed(1)} />
        <Check label="기준선 빼기 (칸마다 배운 가치 V(s))" checked={baseline} onChange={setBaseline} />
        <Button small onClick={() => setSeed((x) => x + 1)}>
          다른 씨앗
        </Button>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${e + 1}번째 판까지 학습한 정책. 칸 1~5에서 오른쪽으로 갈 확률은 ${right.map(pct).join(', ')}입니다. 최근 25판의 평균 보상은 ${recent[e].toFixed(2)}이고 가장 좋은 정책은 ${optimal.toFixed(2)}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <StepControls s={s} id="pg-corr-speed" maxSpeed={120} />
      </div>
      <div className="readouts">
        <Readout label="판" value={`${e + 1} / ${EPISODES}`} />
        <Readout label="최근 25판 평균 보상" value={recent[e].toFixed(2)} />
        <Readout label="씨앗" value={String(seed)} />
      </div>
    </Figure>
  );
}

const optimal = optimalStartValue();
const randomStart = policyValues(zeroTheta())[CORRIDOR.start];

/* ─────────────── Figure 4: twenty runs each, with and without a baseline ─────────────── */

const SEEDS = 20;

function CurvesFigure() {
  const P = usePalette();
  const [alphaLr, setAlphaLr] = useState(0.3);
  const curves = useMemo(() => {
    const none = smooth(meanCurve(EPISODES, alphaLr, false, SEEDS), 25);
    const base = smooth(meanCurve(EPISODES, alphaLr, true, SEEDS), 25);
    return { none, base };
  }, [alphaLr]);
  const spread = useMemo(() => gradSpread(4000, 3), []);
  const reachN = firstReach(curves.none, 0.6);
  const reachB = firstReach(curves.base, 0.6);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 40, r: 12, t: 12, b: 30 };
      const pw = w - pad.l - pad.r;
      const ph = h - pad.t - pad.b;
      const lo = 0.3, hi = 0.7;
      const X = (i: number) => pad.l + (i / (EPISODES - 1)) * pw;
      const Y = (v: number) => pad.t + ph - ((v - lo) / (hi - lo)) * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      for (let v = lo; v <= hi + 1e-9; v += 0.1) {
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(v) + 0.5);
        ctx.lineTo(w - pad.r, Y(v) + 0.5);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(v.toFixed(1), pad.l - 5, Y(v));
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let i = 0; i <= EPISODES; i += 100) ctx.fillText(String(i), X(Math.min(i, EPISODES - 1)), pad.t + ph + 6);
      ctx.font = `10px ${P.fontBody}`;
      ctx.fillText('판', pad.l + pw / 2, pad.t + ph + 18);
      const ref = (v: number, label: string) => {
        ctx.strokeStyle = alpha(P.ink3, 0.7);
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(v));
        ctx.lineTo(w - pad.r, Y(v));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = P.ink3;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, w - pad.r - 2, Y(v) - 2);
      };
      ref(optimal, `가장 좋은 정책 ${optimal.toFixed(2)}`);
      ref(0.6, '0.6');
      const line = (ys: number[], color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ys.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(Math.max(lo, v))) : ctx.moveTo(X(i), Y(Math.max(lo, v)))));
        ctx.stroke();
      };
      line(curves.none, P.neg);
      line(curves.base, P.good);
    },
    [P, curves],
    { height: 260, minHeight: 40 },
  );

  return (
    <Figure
      no={4}
      title="기준선이 있을 때와 없을 때, 스무 번씩"
      hint="학습률을 바꿔 보세요"
      caption={
        <>
          그림 3의 복도를 씨앗 100~119로 스무 번씩 학습시켜 판마다 보상을 평균하고, 다시 25판씩 이동 평균한 곡선입니다. 아래 숫자는 처음 정책(모든 로짓 0)에서 판 4,000개를 뽑아, 판 하나로 계산한 기울기 10개 성분의 분산을 더한 것입니다. 상수 기준선은 출발점 보상의 평균, 칸별 기준선은 그 정책의 정확한 가치 V(s)입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={alphaLr} onChange={setAlphaLr} label="학습률 α" options={[0.1, 0.3, 0.5].map((v) => ({ value: v, label: v.toFixed(1) }))} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`학습률 ${alphaLr}에서 스무 번 평균한 학습 곡선. 기준선 없이는 ${reachN >= 0 ? `${reachN + 1}번째 판에` : '끝까지'} 평균 보상 0.6에 ${reachN >= 0 ? '닿고' : '닿지 못하고'}, 기준선이 있으면 ${reachB >= 0 ? `${reachB + 1}번째 판에` : '끝까지'} ${reachB >= 0 ? '닿습니다' : '닿지 못합니다'}.`}>
        <canvas ref={canvasRef} />
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: '기준선 없음', shape: 'ln' },
          { color: 'var(--good)', label: '칸별 기준선 V(s)', shape: 'ln' },
        ]}
      />
      <div className="readouts">
        <Readout label="0.6에 닿는 판 (없음 / 있음)" value={`${reachN >= 0 ? reachN + 1 : '—'} / ${reachB >= 0 ? reachB + 1 : '—'}`} />
        <Readout label="기울기 분산: 기준선 없음" value={spread.none.toFixed(2)} color="var(--neg)" />
        <Readout label="상수 기준선" value={spread.constant.toFixed(2)} />
        <Readout label="칸별 기준선" value={spread.state.toFixed(2)} color="var(--good)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function PolicyGradient() {
  return (
    <>
      <h2>가치를 거치지 않고 정책을 직접</h2>
      <p>
        앞의 두 장은 상태와 행동의 가치를 먼저 배우고, 가치가 가장 큰 행동을 고르는 방식이었습니다. <a href={lessonHref('ai-reinforcement-learning', 'q-learning')}>Q-러닝</a>의 표는 칸마다 행동마다 숫자를 하나씩 둡니다. 그런데 행동이 연속적이거나(로봇 팔의 각도), 상태가 너무 많거나, 일부러 무작위로 행동해야 유리한 문제(가위바위보)에서는 이 방식이 어색해집니다.
      </p>
      <p>
        다른 길은 행동하는 규칙, 즉 <T en="policy">정책</T> 자체를 매개변수 θ로 두고 기울기로 고치는 것입니다. 정책이 행동마다 점수(로짓)를 내고 소프트맥스로 확률을 만들면, 이것을 <T en="stochastic policy">확률적 정책</T>이라고 합니다. 목표는 기대 보상 <M>{'J(\\theta) = \\mathbb{E}_{\\pi_\\theta}[R]'}</M>을 키우는 것이고, 그러려면 <M>{'\\nabla_\\theta J'}</M>가 필요합니다. 문제는 보상이 환경에서 오기 때문에 미분할 식이 없다는 점입니다.
      </p>

      <h2>로그 확률의 기울기</h2>
      <p>
        길은 확률의 미분을 로그의 미분으로 바꾸는 한 줄짜리 요령에 있습니다. <M>{'\\nabla p = p\\,\\nabla \\log p'}</M>이므로, 기대값의 기울기도 기대값으로 쓸 수 있습니다.
      </p>
      <MB note="보상 R은 미분하지 않습니다. 미분하는 것은 정책이 그 행동을 고를 로그 확률뿐입니다.">{'\\nabla_\\theta J = \\sum_a \\nabla \\pi_\\theta(a)\\, R(a) = \\sum_a \\pi_\\theta(a)\\, \\nabla \\log \\pi_\\theta(a)\\, R(a) = \\mathbb{E}_{a \\sim \\pi_\\theta}\\big[\\nabla \\log \\pi_\\theta(a)\\, R\\big]'}</MB>
      <p>
        기대값은 직접 해 보고 평균을 내면 추정할 수 있습니다. 행동을 하나 뽑아 보상 r을 받을 때마다 <M>{'\\theta \\leftarrow \\theta + \\alpha\\, r\\, \\nabla \\log \\pi_\\theta(a)'}</M>로 고치면 됩니다. 1992년 윌리엄스(Ronald Williams)가 정리한 <T en="REINFORCE">REINFORCE</T> 알고리즘입니다. 소프트맥스 정책에서는 로그 확률의 기울기가 아주 간단해서, 고른 행동의 로짓은 <M>{'1 - \\pi(a)'}</M>만큼, 고르지 않은 행동 k의 로짓은 <M>{'\\pi(k)'}</M>만큼 내려가는 방향입니다. 보상이 클수록 그 방향으로 크게 갑니다.
      </p>
      <BanditFigure />
      <p>
        처음 50번 동안은 확률이 거의 움직이지 않는 것처럼 보입니다. 50번째에도 A, B, C가 27%, 32%, 42%입니다. 당첨된 팔만 조금씩 올라가는데, B도 절반은 당첨되므로 초반에는 B와 C가 엎치락뒤치락합니다. 100번째에 C가 56%가 되고, 300번째에는 92%가 됩니다. 300번 중 C를 197번 당겼으니, 학습하는 동안 손해를 본 것은 나머지 103번입니다. 이 탐험의 값은 <a href={lessonHref('ai-reinforcement-learning', 'bandits')}>멀티암드 밴딧</a> 장의 후회와 같은 이야기입니다.
      </p>

      <h2>기준선: 무엇보다 좋았는가</h2>
      <p>
        이 규칙에는 숨은 약점이 있습니다. 보상이 0이 아니기만 하면 고른 행동의 확률을 언제나 올린다는 점입니다. 위 문제는 꽝이 0이라 괜찮았지만, 꽝이 3점이고 당첨이 4점인 게임이라면 어떨까요? 어느 팔을 당기든 3점 이상을 받으니, 당긴 팔은 무조건 확률이 크게 오릅니다. 처음에 우연히 많이 당긴 팔이 그대로 굳어 버릴 수 있습니다.
      </p>
      <OffsetFigure />
      <p>
        보상에 3을 더하고 기준선 없이 학습하면, 씨앗 7의 실행은 B로 쏠려 B를 95% 확률로 고르는 정책이 됩니다. 50번 실행 중 C로 제대로 쏠린 것은 30번뿐이고 19번은 엉뚱한 팔로 쏠립니다. 5를 더하면 50번 중 33번이 틀립니다. 어느 팔이 좋은지는 전혀 바뀌지 않았는데도 그렇습니다.
      </p>
      <p>
        고치는 법은 보상 대신 <strong>보상에서 기준값을 뺀 것</strong>을 쓰는 것입니다. 이 기준값을 <T en="baseline">기준선</T> b라고 하고, <M>{'r - b'}</M>를 <T en="advantage">이점</T>이라고 부릅니다. 평균보다 좋았던 행동은 확률을 올리고, 평균보다 나빴던 행동은 내립니다. 기준선을 켜면 3을 더하든 5를 더하든 50번 모두 C로 쏠립니다. 행동과 상관없는 b는 기울기의 기대값을 바꾸지 않는다는 것도 보일 수 있습니다. <M>{'\\sum_a \\pi(a) \\nabla \\log \\pi(a)\\, b = b\\, \\nabla \\sum_a \\pi(a) = b\\, \\nabla 1 = 0'}</M>이기 때문입니다. 바뀌는 것은 추정값이 얼마나 흔들리는가, 즉 분산뿐입니다.
      </p>

      <h2>판이 길어지면: 복도</h2>
      <p>
        밴딧은 한 번 고르면 끝나지만, 보통의 문제는 행동을 여러 번 한 뒤에야 보상이 옵니다. 이때 REINFORCE는 한 판이 끝날 때까지 기다렸다가, 판에서 고른 행동 하나하나에 대해 <strong>그 시점부터 받은 할인된 보상의 합</strong> <M>{'G_t'}</M>를 보상 자리에 넣습니다.
      </p>
      <MB note="판이 끝난 뒤 t = 0, 1, …마다 한 번씩. b(s_t)는 그 칸의 기준선입니다.">{'\\theta \\leftarrow \\theta + \\alpha \\sum_t \\big(G_t - b(s_t)\\big)\\, \\nabla \\log \\pi_\\theta(a_t \\mid s_t)'}</MB>
      <CorridorFigure />
      <p>
        이 복도에서 가장 좋은 정책은 언제나 오른쪽으로 가는 것이고, 출발점의 가치는 {optimal.toFixed(3)}입니다. 아무렇게나 반반으로 움직이면 {randomStart.toFixed(3)}입니다. 왼쪽 끝은 두 걸음이면 닿는 작은 상이라 초반에는 자주 닿고, 거기서 받은 0.5도 양수이므로 기준선이 없으면 왼쪽으로 가는 확률도 함께 올라갑니다. 기준선 V(s)는 이 칸에서 보통 받는 보상을 배워 두었다가, 왼쪽 끝의 0.5가 평균보다 못하다는 것을 알려 줍니다.
      </p>
      <CurvesFigure />
      <p>
        학습률 0.3에서 스무 번 평균한 곡선이 0.6에 닿는 것은 기준선 없이 211번째 판, 기준선과 함께 139번째 판입니다. 100번째 판에서 평균 보상은 0.52와 0.58이고, 500번째 판에서도 0.62와 0.64로 기준선 쪽이 앞섭니다. 둘 다 {optimal.toFixed(2)}에 못 미치는 것은 정책이 아직 가끔 왼쪽을 고르기 때문입니다. 분산으로 보면 차이가 더 분명합니다. 처음 정책에서 판 하나로 계산한 기울기의 분산이 기준선 없이는 0.86, 출발점 평균을 빼면 0.24, 칸별 가치를 빼면 0.24로, 3.6배쯤 줄어듭니다. 같은 정확도로 기울기를 얻으려면 판을 3.6배 덜 해도 된다는 뜻입니다. 이 문제는 보상이 0.5와 1뿐이라 상수 기준선만으로도 거의 다 줄었지만, 칸마다 기대 보상이 크게 다른 문제에서는 칸별 기준선의 차이가 커집니다.
      </p>
      <Callout kind="intuition">
        기준선은 "이 정도면 보통"이라는 눈높이입니다. 시험에서 70점을 받았을 때, 평균이 50점인 시험이라면 공부법을 칭찬하고 평균이 90점인 시험이라면 공부법을 바꿔야 합니다. 점수 자체가 양수라는 사실만으로는 아무것도 알 수 없습니다.
      </Callout>

      <h2>액터-크리틱과 PPO</h2>
      <p>
        기준선 V(s)를 신경망으로 배우고, 판이 끝날 때까지 기다리는 대신 한 걸음 뒤의 추정 <M>{'r + \\gamma V(s\')'}</M>로 <M>{'G_t'}</M>를 대신하면 <T en="actor-critic">액터-크리틱</T>이 됩니다. 행동을 고르는 정책이 배우(액터), 그 행동이 평균보다 나았는지 판정하는 가치 함수가 비평가(크리틱)입니다. <a href={lessonHref('ai-reinforcement-learning', 'q-learning')}>시간차 학습</a>의 아이디어를 정책 경사에 붙인 것입니다.
      </p>
      <p>
        정책 경사의 또 다른 약점은 한 번에 너무 크게 고치면 정책이 무너진다는 것입니다. 지금 정책으로 모은 데이터는 지금 정책 근처에서만 믿을 만하기 때문입니다. 2017년 OpenAI가 발표한 <T en="Proximal Policy Optimization">PPO</T>는 새 정책과 옛 정책의 확률 비 <M>{'\\rho = \\pi_{\\text{new}}(a|s) / \\pi_{\\text{old}}(a|s)'}</M>가 <M>{'[1-\\varepsilon, 1+\\varepsilon]'}</M> 밖으로 나가면 더 이상 이득을 쳐 주지 않는 목표를 씁니다.
      </p>
      <MB note="보통 ε = 0.2. 이점 A가 양수면 ρ가 1.2를 넘어도 목표가 더 커지지 않으므로, 확률을 한 번에 20% 넘게 올릴 이유가 없어집니다.">{'L(\\theta) = \\mathbb{E}\\Big[\\min\\big(\\rho A,\\ \\operatorname{clip}(\\rho, 1-\\varepsilon, 1+\\varepsilon)\\, A\\big)\\Big]'}</MB>
      <p>
        PPO는 계산이 간단하고 튼튼해서 로봇 제어와 게임에서 널리 쓰였고, 대형 언어 모델을 사람의 선호에 맞추는 단계에서도 쓰입니다. 거기서는 문장의 토큰 하나하나가 행동이고, 보상은 사람의 선호를 흉내 내도록 학습한 보상 모델이 줍니다. 그 과정은 <a href={lessonHref('ai-llm', 'alignment')}>사람의 피드백으로 학습</a> 장에서 이어지고, 보상을 어떻게 정해야 하는지는 다음 장에서 다룹니다.
      </p>

      <Callout kind="key">
        정책 경사는 행동 규칙 π_θ를 직접 고칩니다. 기대 보상의 기울기는 ∇log π(a)에 보상을 곱한 것의 기대값이므로, 직접 행동해 보고 받은 보상으로 추정할 수 있습니다(REINFORCE). 보상에서 기준선을 빼면 기울기의 기대값은 그대로이고 분산만 줄어, 보상이 모두 양수인 문제에서도 좋은 행동과 나쁜 행동을 구별합니다. 기준선을 배우는 가치 함수를 붙이면 액터-크리틱이 되고, 한 번에 고치는 폭을 묶으면 PPO가 됩니다.
      </Callout>
      <Quiz
        q="어떤 게임에서 모든 판의 점수가 100점에서 110점 사이다. 기준선 없이 REINFORCE로 학습시켰더니 정책이 처음 몇 판에 자주 고른 행동으로 굳어 버렸다. 가장 알맞은 처방은?"
        options={['학습률을 더 크게 한다', '점수에서 그동안의 평균 점수(또는 배운 가치)를 빼고 고친다', '보상에 100을 더해 차이를 키운다', '로그 확률 대신 확률 자체의 기울기를 쓴다']}
        answer={1}
        explain={<>모든 보상이 크고 양수라, 고른 행동은 결과와 상관없이 확률이 크게 오릅니다. 평균을 기준선으로 빼면 105점보다 나은 판만 그 행동을 올리고 못한 판은 내리므로, 행동 사이의 차이만 남습니다. 학습률을 키우면 처음 고른 행동이 더 빨리 굳고, 보상에 수를 더하면 문제가 더 심해집니다. 그림 2에서 3을 더했을 때와 5를 더했을 때를 비교해 보세요.</>}
      />
    </>
  );
}
