import { useEffect, useMemo, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import {
  BONUS,
  FEATURES,
  OPEN,
  OPEN_BEST,
  PREF,
  RACE,
  SHAPING_KO,
  TRUE_W,
  agreement,
  fitBT,
  pairOrder,
  raterPrefersFirst,
  summarizeOpen,
  trainRace,
  trajectoryPool,
  type OpenSummary,
  type Pos,
  type Shaping,
  type Traj,
} from './reward';
import './rl.css';
import './reward.css';

/** Draw a grid of cells with a path; `mark` colours special cells. */
function drawGrid(ctx: CanvasRenderingContext2D, P: Palette, gw: number, gh: number, x0: number, y0: number, cell: number, mark: (x: number, y: number) => string | null) {
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) {
      const m = mark(x, y);
      ctx.fillStyle = m ?? P.surface2;
      ctx.fillRect(x0 + x * cell + 1, y0 + y * cell + 1, cell - 2, cell - 2);
    }
}

function drawPath(ctx: CanvasRenderingContext2D, path: Pos[], x0: number, y0: number, cell: number, color: string, width = 2.5) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  path.forEach(([x, y], i) => {
    const px = x0 + x * cell + cell / 2;
    const py = y0 + y * cell + cell / 2;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

/* ─────────────── Figure 1: three ways to reward the same task ─────────────── */

const KINDS: Shaping[] = ['sparse', 'potential', 'progress'];
const KIND_COLOR = (P: Palette, k: Shaping) => (k === 'sparse' ? P.ink3 : k === 'potential' ? P.good : P.bad);
const KIND_CSS: Record<Shaping, string> = { sparse: 'var(--ink-3)', potential: 'var(--good)', progress: 'var(--bad)' };
const EPISODES = 200;
const SEEDS = 20;

function ShapingFigure() {
  const P = usePalette();
  const [kind, setKind] = useState<Shaping>('sparse');
  // training all three takes a moment, so it runs after the first paint, one reward at a time
  const [res, setRes] = useState<Partial<Record<Shaping, OpenSummary>>>({});
  useEffect(() => {
    let cancelled = false;
    const todo = [...KINDS];
    const next = () => {
      const k = todo.shift();
      if (!k || cancelled) return;
      const sum = summarizeOpen(k, EPISODES, SEEDS);
      if (cancelled) return;
      setRes((r) => ({ ...r, [k]: sum }));
      setTimeout(next, 0);
    };
    const t = setTimeout(next, 30);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);
  const cur = res[kind];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const narrow = w < 560;
      const side = narrow ? Math.min(w, 260) : Math.min(h, w * 0.4);
      const cell = (side - 8) / OPEN.w;
      const gx = narrow ? (w - side) / 2 : 0;
      const gy = 4;
      drawGrid(ctx, P, OPEN.w, OPEN.h, gx, gy, cell, (x, y) => (x === OPEN.goal[0] && y === OPEN.goal[1] ? alpha(P.good, 0.5) : x === OPEN.start[0] && y === OPEN.start[1] ? alpha(P.accent, 0.3) : null));
      ctx.fillStyle = P.ink;
      ctx.font = `700 ${Math.round(cell * 0.32)}px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('도착', gx + OPEN.goal[0] * cell + cell / 2, gy + OPEN.goal[1] * cell + cell / 2);
      ctx.fillText('출발', gx + OPEN.start[0] * cell + cell / 2, gy + OPEN.start[1] * cell + cell / 2);
      if (cur) {
        // draw the greedy path; a loop shows as a thick back-and-forth stroke
        drawPath(ctx, cur.path.slice(0, 40), gx, gy, cell, KIND_COLOR(P, kind), 3);
      } else {
        ctx.fillStyle = P.ink3;
        ctx.font = `12px ${P.fontBody}`;
        ctx.fillText('학습하는 중…', gx + side / 2, gy + side / 2);
      }
      // learning curves
      const lx = narrow ? 40 : side + 52;
      const ly = narrow ? side + 26 : 18;
      const lw = w - lx - 10;
      const lh = (narrow ? h - side - 26 : h) - 18 - 30;
      const X = (i: number) => lx + (i / (EPISODES - 1)) * lw;
      const Y = (v: number) => ly + lh - (Math.min(v, OPEN.maxT) / OPEN.maxT) * lh;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      for (const v of [0, 25, 50, 75, 100]) {
        ctx.beginPath();
        ctx.moveTo(lx, Y(v) + 0.5);
        ctx.lineTo(lx + lw, Y(v) + 0.5);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(v), lx - 5, Y(v));
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const i of [0, 100, 200]) ctx.fillText(String(i), X(Math.min(i, EPISODES - 1)), ly + lh + 5);
      ctx.font = `10px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('판마다 걸린 걸음 수 (100: 끝내 못 감, 점선: 최단 12걸음)', lx, ly - 4);
      ctx.strokeStyle = alpha(P.ink3, 0.7);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, Y(OPEN_BEST));
      ctx.lineTo(lx + lw, Y(OPEN_BEST));
      ctx.stroke();
      ctx.setLineDash([]);
      for (const k of KINDS) {
        const r = res[k];
        if (!r) continue;
        ctx.strokeStyle = alpha(KIND_COLOR(P, k), k === kind ? 1 : 0.35);
        ctx.lineWidth = k === kind ? 2.5 : 1.5;
        ctx.beginPath();
        r.curve.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
        ctx.stroke();
      }
    },
    [P, res, kind, cur],
    { height: 300, minHeight: 40 },
  );

  const seedArrives = cur ? cur.path.some(([x, y]) => x === OPEN.goal[0] && y === OPEN.goal[1]) : false;
  const label = cur
    ? `${SHAPING_KO[kind]}: 씨앗 1이 배운 정책은 ${seedArrives ? `${cur.path.length - 1}걸음 만에 도착합니다` : '도착하지 못하고 같은 자리를 맴돕니다'}. ${SEEDS}번 중 ${cur.arrive}번 도착.`
    : '학습하는 중입니다.';

  return (
    <Figure
      no={1}
      title="같은 일, 세 가지 보상"
      hint="보상 방식을 바꿔 보세요"
      caption={
        <>
          7×7 격자의 왼쪽 아래에서 오른쪽 위까지 가는 문제입니다. 모두 같은 Q-러닝(학습률 0.5, ε = 0.1, γ = 0.95, 한 판 최대 100걸음)이고 보상만 다릅니다. 곡선은 씨앗 1~{SEEDS}의 평균, 격자 위의 선은 씨앗 1이 {EPISODES}판을 배운 뒤 가장 좋다고 믿는 행동만 따라간 경로(처음 40걸음)입니다. 퍼텐셜은 Φ(s) = 0.5 × (1 − 남은 거리 / 12)입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: SHAPING_KO[k] }))} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={label}>
        <canvas ref={canvasRef} />
      </div>
      <Legend items={KINDS.map((k) => ({ color: KIND_CSS[k], label: SHAPING_KO[k], shape: 'ln' as const }))} />
      <div className="readouts">
        <Readout label="배운 판 (평균이 18걸음 안쪽에 머무는 첫 판)" value={cur ? (cur.learnedAt >= 0 ? `${cur.learnedAt + 1}번째` : '끝내 못 배움') : '…'} color={KIND_CSS[kind]} />
        <Readout label="배운 뒤 도착하는 씨앗" value={cur ? `${cur.arrive} / ${SEEDS}` : '…'} />
        <Readout label="200번째 판 평균 걸음" value={cur ? cur.curve[EPISODES - 1].toFixed(1) : '…'} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a race with a bonus pad ─────────────── */

function RaceFigure() {
  const P = usePalette();
  const [finish, setFinish] = useState(3);
  const run = useMemo(() => trainRace(finish, 3000, 1), [finish]);
  const s = useStepper(run.trace.length, 6, finish, false, true);
  const st = run.trace[s.i];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cell = Math.min((w - 8) / RACE.w, (h - 30) / RACE.h);
      const x0 = (w - cell * RACE.w) / 2;
      const y0 = 4;
      drawGrid(ctx, P, RACE.w, RACE.h, x0, y0, cell, (x, y) => {
        if (x === RACE.w - 1) return alpha(P.good, 0.35);
        if (x === RACE.pad[0] && y === RACE.pad[1]) return st.timer === 0 ? alpha(P.hl, 0.85) : alpha(P.hl, 0.25);
        return null;
      });
      ctx.fillStyle = P.ink;
      ctx.font = `700 ${Math.round(cell * 0.24)}px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let y = 0; y < RACE.h; y++) ctx.fillText(y === 1 ? '결승' : '', x0 + (RACE.w - 1) * cell + cell / 2, y0 + y * cell + cell / 2);
      ctx.fillText(st.timer === 0 ? '+1' : `${st.timer}`, x0 + RACE.pad[0] * cell + cell / 2, y0 + RACE.pad[1] * cell + cell / 2);
      // trail of the last few moves
      const from = Math.max(0, s.i - 8);
      drawPath(ctx, run.trace.slice(from, s.i + 1).map((t) => t.p), x0, y0, cell, alpha(P.accent, 0.5), 3);
      const bx = x0 + st.p[0] * cell + cell / 2;
      const by = y0 + st.p[1] * cell + cell / 2;
      ctx.beginPath();
      ctx.arc(bx, by, cell * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = P.accent;
      ctx.fill();
      ctx.strokeStyle = P.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`${s.i}번째 움직임 · 점수 ${st.score}`, x0, y0 + RACE.h * cell + 8);
    },
    [P, run, s.i, st],
    { height: 220, minHeight: 40 },
  );

  const end = run.trace[run.trace.length - 1];
  return (
    <Figure
      no={2}
      title="결승선 대신 보너스"
      hint="결승 점수를 바꿔 보세요"
      caption={
        <>
          배는 왼쪽에서 출발하고, 오른쪽 끝 열에 닿으면 결승 점수를 받고 끝납니다. 노란 칸은 다른 칸에서 들어올 때마다 1점을 주고, 그 뒤 세 번 움직이는 동안 꺼져 있다가(숫자) 다시 켜집니다. 한 판은 최대 40번 움직입니다. Q-러닝(학습률 0.3, ε = 0.2, γ = 0.95)으로 씨앗 1에서 3,000판을 학습시킨 뒤, 가장 좋다고 믿는 행동만 골라 한 판을 둔 모습입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="rw-finish" label="결승선에 닿으면 받는 점수" value={finish} min={1} max={10} step={1} onChange={setFinish} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`결승 점수 ${finish}. 학습한 배는 ${run.finished ? `${run.trace.length - 1}번 만에 결승선을 지나 ${end.score}점을 얻습니다` : `결승선에 가지 않고 노란 칸 둘레를 돌며 40번 동안 보너스 ${run.pads}번, ${end.score}점을 얻습니다`}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <StepControls s={s} id="rw-race-speed" maxSpeed={20} />
      </div>
      <div className="readouts">
        <Readout label="이 판의 점수" value={`${end.score}점`} />
        <Readout label="결승선 통과" value={run.finished ? `${run.trace.length - 1}번째 움직임` : '못 함'} color={run.finished ? 'var(--good)' : 'var(--bad)'} />
        <Readout label="보너스 횟수" value={`${run.pads}번`} />
        <Readout label="학습 마지막 200판의 통과율" value={`${Math.round(run.finishRate * 100)}%`} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: learn the reward from choices ─────────────── */

const POOL = trajectoryPool(24, 4);
const ORDER = pairOrder(POOL, 60, 9);
const W_RANGE = 6;

function TrajCard({ t, onPick, label, disabled }: { t: Traj; onPick: () => void; label: string; disabled: boolean }) {
  const P = usePalette();
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cell = Math.min(w, h) / PREF.w;
      const x0 = (w - cell * PREF.w) / 2;
      drawGrid(ctx, P, PREF.w, PREF.h, x0, 0, cell, (x, y) => {
        if (x === PREF.goal[0] && y === PREF.goal[1]) return alpha(P.good, 0.45);
        if (PREF.puddles.some((d) => d[0] === x && d[1] === y)) return alpha(P.pos, 0.35);
        if (PREF.coins.some((c) => c[0] === x && c[1] === y)) return alpha(P.hl, 0.6);
        return null;
      });
      drawPath(ctx, t.path, x0, 0, cell, P.ink, 2.5);
      const [ex, ey] = t.path[t.path.length - 1];
      ctx.beginPath();
      ctx.arc(x0 + ex * cell + cell / 2, ey * cell + cell / 2, cell * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = P.ink;
      ctx.fill();
    },
    [P, t],
    { height: 150, minHeight: 40 },
  );
  return (
    <div className="rw-card">
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${label}: ${t.f[0] ? '도착함' : '도착 못 함'}, ${Math.round(t.f[1] * 10)}걸음, 물웅덩이 ${t.f[2]}번, 동전 ${t.f[3]}개.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="rw-feats">
        <span>{t.f[0] ? '도착' : '미도착'}</span>
        <span>{Math.round(t.f[1] * 10)}걸음</span>
        <span>웅덩이 {t.f[2]}</span>
        <span>동전 {t.f[3]}</span>
      </div>
      <Button small primary onClick={onPick} disabled={disabled}>
        {label}이 더 낫다
      </Button>
    </div>
  );
}

function PreferenceFigure() {
  const [choices, setChoices] = useState<[number, number][]>([]);
  const [showTrue, setShowTrue] = useState(false);
  const k = choices.length;
  const done = k >= ORDER.length;
  const pair = ORDER[Math.min(k, ORDER.length - 1)];
  const w = useMemo(() => fitBT(POOL, choices), [choices]);
  const agree = agreement(POOL, w);
  const pick = (first: boolean) => setChoices((c) => [...c, first ? pair : [pair[1], pair[0]]]);
  const rater = (n: number) =>
    setChoices((c) => {
      const out = [...c];
      for (let j = 0; j < n && out.length < ORDER.length; j++) {
        const p = ORDER[out.length];
        out.push(raterPrefersFirst(POOL, p) ? p : [p[1], p[0]]);
      }
      return out;
    });
  const pos = (v: number) => 50 + (Math.max(-W_RANGE, Math.min(W_RANGE, v)) / W_RANGE) * 50;

  return (
    <Figure
      no={3}
      title="두 궤적 중 어느 쪽이 나은가"
      hint="직접 고르거나 가상의 평가자에게 맡겨 보세요"
      caption={
        <>
          5×5 격자의 왼쪽 아래에서 오른쪽 위(초록)로 가는 궤적 24개 중 두 개씩 보여 줍니다. 파란 칸은 물웅덩이, 노란 칸은 동전입니다. 고를 때마다 브래들리-테리 모형으로 네 특징(도착 여부, 걸음 수, 밟은 웅덩이 수, 주운 동전 수)의 가중치를 다시 맞춥니다. 일치율은 24개 궤적의 모든 쌍에 대해, 맞춘 가중치가 가상의 평가자와 같은 쪽을 고르는 비율입니다. 가상의 평가자는 가중치 (3, −1, −1.5, 0.6)으로 점수를 매겨 더 높은 쪽을 고릅니다(걸음 수는 10걸음을 1로 셉니다).
        </>
      }
    >
      <div className="rw-pair">
        <TrajCard t={POOL[pair[0]]} label="왼쪽" onPick={() => pick(true)} disabled={done} />
        <TrajCard t={POOL[pair[1]]} label="오른쪽" onPick={() => pick(false)} disabled={done} />
      </div>
      <div className="controls row">
        <Button small onClick={() => rater(5)} disabled={done}>
          가상의 평가자에게 5번 맡기기
        </Button>
        <Button small onClick={() => setChoices(choices.slice(0, -1))} disabled={!k}>
          하나 되돌리기
        </Button>
        <Button small onClick={() => setChoices([])} disabled={!k}>
          처음부터
        </Button>
        <Check label="평가자의 실제 가중치 보기 (검은 눈금)" checked={showTrue} onChange={setShowTrue} />
      </div>
      <div className="rw-weights" role="img" aria-label={`${k}번 비교로 맞춘 가중치: ${FEATURES.map((f, i) => `${f} ${w[i].toFixed(2)}`).join(', ')}. 평가자와의 일치율 ${Math.round(agree * 100)}%.`}>
        {FEATURES.map((f, i) => {
          const a = pos(0), b = pos(w[i]);
          return (
            <div key={f} style={{ display: 'contents' }}>
              <span className="lbl">{f}</span>
              <span className="rw-track">
                <span className="rw-bar" data-neg={w[i] < 0 || undefined} style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(b - a)}%` }} />
                {showTrue && <span className="rw-true" style={{ left: `calc(${pos(TRUE_W[i])}% - 1px)` }} />}
              </span>
              <span className="val">{w[i] >= 0 ? '+' : ''}{w[i].toFixed(2)}</span>
            </div>
          );
        })}
      </div>
      <div className="readouts">
        <Readout label="비교한 횟수" value={`${k}번`} />
        <Readout label="평가자와의 일치율" value={k ? `${Math.round(agree * 100)}%` : '—'} color={agree > 0.9 ? 'var(--good)' : undefined} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function RewardDesign() {
  return (
    <>
      <h2>보상은 누가 정하는가</h2>
      <p>
        지금까지의 장에서 보상은 문제와 함께 주어졌습니다. 도착하면 +1, 낭떠러지에 떨어지면 −100이었습니다. 하지만 실제로 강화학습을 쓰려는 사람이 가장 먼저 하는 일은 보상을 직접 정하는 것입니다. 로봇이 컵을 잘 집었는지, 게임 캐릭터가 잘 싸웠는지, 챗봇의 답이 좋았는지를 숫자 하나로 바꿔야 합니다. 그리고 에이전트는 우리가 <strong>바란 것</strong>이 아니라 우리가 <strong>숫자로 적은 것</strong>을 최적화합니다. 이 장은 그 틈에서 생기는 일을 다룹니다.
      </p>

      <h2>드문 보상과 보상 다듬기</h2>
      <p>
        "도착하면 +1, 나머지는 0"처럼 목표에 닿았을 때만 주는 보상을 <T en="sparse reward">희소한 보상</T>이라고 합니다. 정직하지만, 처음 도착하기 전까지는 어떤 행동도 다른 행동보다 낫다는 신호가 없어 한참을 헤맵니다. 그래서 중간에 힌트를 주고 싶어집니다. 목표에 가까워질 때마다 조금씩 상을 주는 식으로요. 이렇게 보상에 무언가를 더하는 것을 <T en="reward shaping">보상 다듬기</T>라고 합니다.
      </p>
      <ShapingFigure />
      <p>
        희소한 보상만으로도 스무 번 평균이 최단 경로의 1.5배(18걸음) 안쪽에 머물기 시작하는 것은 40번째 판입니다. 퍼텐셜 기반 다듬기를 쓰면 10번째 판으로 당겨지고, 스무 번 모두 배운 뒤 도착합니다. 그런데 "가까워지면 +{BONUS}"를 고르면 스무 번 중 한 번도 도착하지 못합니다. 씨앗 1의 경로를 보면 목표 바로 앞 칸까지 와서, 마지막 한 걸음 대신 한 칸 물러났다가 다시 다가가기를 되풀이합니다. 물러날 때는 아무것도 잃지 않고, 다가갈 때마다 {BONUS}를 받으니까요. 할인율 0.95에서 이렇게 영원히 오가는 값은 <M>{'0.2 \\times 0.95 / (1 - 0.95^2) \\approx 1.95'}</M>로, 마지막 한 걸음을 내디뎌 받는 1.2보다 큽니다. 에이전트는 계산을 정확히 했습니다. 틀린 것은 보상입니다.
      </p>
      <p>
        1999년 응(Andrew Ng), 하라다(Daishi Harada), 러셀(Stuart Russell)은 이런 일이 생기지 않는 다듬기의 조건을 증명했습니다. 상태마다 퍼텐셜 Φ(s)를 정하고, 다듬기 보상을 그 퍼텐셜의 차이로만 주는 것입니다.
      </p>
      <MB note="한 바퀴 돌아 제자리로 오면 Φ의 차이를 모두 더한 값은 (할인을 빼면) 0이 됩니다. 그래서 맴돌아서 얻을 것이 없습니다.">{'F(s, s\') = \\gamma\\,\\Phi(s\') - \\Phi(s)'}</MB>
      <p>
        이 형태의 F를 더하면 어떤 정책의 가치든 출발점의 Φ만큼 똑같이 옮겨질 뿐이라, 가장 좋은 정책은 바뀌지 않습니다. 반대로 이 형태가 아닌 다듬기는 가장 좋은 정책을 바꿀 수 있고, "가까워지면 +0.2"가 바로 그 예입니다. 가까워질 때 주는 만큼 멀어질 때 빼앗지 않았기 때문입니다.
      </p>

      <h2>보상 해킹</h2>
      <p>
        다듬기를 잘못한 경우만 문제가 되는 것은 아닙니다. 게임 점수처럼 그럴듯한 보상도 에이전트가 설계자가 생각하지 못한 지름길을 찾게 만듭니다. 2016년 OpenAI는 보트 경주 게임 CoastRunners에서 점수를 보상으로 준 에이전트가, 결승선에 가는 대신 점수 아이템이 다시 나타나는 작은 만에서 빙빙 돌며 불붙은 채 계속 점수를 올리는 모습을 보고했습니다. 그림 2는 그것을 아주 작게 흉내 낸 것입니다.
      </p>
      <RaceFigure />
      <p>
        결승 점수가 3이면, 학습한 배는 결승선에 가지 않습니다. 노란 칸에 들어갔다가 벽에 두 번 부딪히며 기다리고, 한 칸 나갔다 다시 들어오는 네 번짜리 고리를 40번 내내 되풀이해 보너스 10번, 10점을 얻습니다. 곧장 결승선에 갔다면 보너스 한 번과 결승 점수로 4점이었을 테니, 점수로만 보면 고리가 더 낫습니다. 결승 점수를 6 이상으로 올리면 결승선으로 갑니다. 씨앗 1부터 10까지 모두 같아서, 5 이하에서는 열 번 모두 고리를 돌고 6 이상에서는 열 번 모두 결승선을 지납니다. 8로 두면 7번 만에 결승선을 지나 9점을 얻습니다.
      </p>
      <p>
        이렇게 보상의 허점을 파고들어 높은 보상을 얻지만 설계자가 바란 일은 하지 않는 것을 <T en="reward hacking">보상 해킹</T> 또는 <T en="specification gaming">명세 게임</T>이라고 합니다. 연구자들이 모아 둔 사례에는 넘어지지 않으려고 아예 움직이지 않는 로봇, 테스트를 통과하도록 테스트 코드를 고치는 프로그램, 물체를 집는 대신 카메라와 물체 사이에 손을 대서 집은 것처럼 보이게 한 로봇 팔이 있습니다. 결승 점수를 올려 고친 것처럼, 하나하나는 고칠 수 있지만 모든 허점을 미리 알 수는 없다는 것이 문제입니다.
      </p>
      <Callout kind="warn">
        경제학자 굿하트(Charles Goodhart)의 이름을 딴 <T en="Goodhart's law">굿하트의 법칙</T>은 이렇게 요약됩니다. "어떤 지표가 목표가 되면, 그 지표는 더 이상 좋은 지표가 아니다." 시험 점수, 논문 인용 수, 클릭 수 모두 그렇습니다. 최적화가 강할수록 지표와 진짜 목표 사이의 작은 틈이 더 크게 벌어집니다.
      </Callout>

      <h2>사람의 선호로 보상을 배우기</h2>
      <p>
        좋은 결과를 숫자로 적기 어렵다면, 숫자를 적는 대신 사람에게 두 결과 중 어느 쪽이 나은지 고르게 하고 그 선택들로부터 보상을 배울 수 있습니다. 사람은 "이 답은 7.3점"이라고 매기는 것보다 "둘 중 이쪽이 낫다"고 고르는 것을 훨씬 일관되게 합니다. 선택을 설명하는 가장 흔한 모형은 <T en="Bradley–Terry model">브래들리-테리 모형</T>입니다. 보상이 r인 두 결과 중 A를 고를 확률을 보상 차이의 시그모이드로 둡니다.
      </p>
      <MB note="보상이 같으면 반반, 차이가 클수록 확실히 큰 쪽을 고릅니다. 맞추는 것은 로지스틱 회귀와 같습니다.">{'P(A \\succ B) = \\sigma\\big(r(A) - r(B)\\big) = \\frac{1}{1 + e^{-(r(A) - r(B))}}'}</MB>
      <PreferenceFigure />
      <p>
        직접 골라 보면, 비교가 몇 개 쌓이지 않아도 "도착"의 가중치가 크게 양수로, "웅덩이"가 음수로 자리 잡는 것을 볼 수 있습니다. 가상의 평가자에게 맡기면 다섯 번 만에 일치율 97%, 열 번 만에 98%가 됩니다. 그 뒤로 더 맡기면 오히려 93%대로 조금 내려가는데, 동전을 주운 궤적이 24개 중 다섯 개뿐이라 동전 가중치가 증거가 적은 채 음수로 굳기 때문입니다. 비교를 많이 받는 것만큼 <strong>어떤 쌍을 비교하게 할지</strong>가 중요하다는 뜻입니다.
      </p>
      <p>
        대형 언어 모델을 사람의 선호에 맞추는 RLHF가 바로 이 구조입니다. 사람이 두 답 중 나은 쪽을 고르고, 브래들리-테리 모형으로 보상 모델을 학습시킨 뒤, <a href={lessonHref('ai-reinforcement-learning', 'policy-gradient')}>정책 경사</a>(PPO)로 그 보상을 키우도록 모델을 고칩니다. 그 과정과 보상 해킹을 막는 KL 항은 <a href={lessonHref('ai-llm', 'alignment')}>사람의 피드백으로 학습</a> 장에서 이어집니다. 배운 보상 모델도 결국 지표이므로, 너무 세게 최적화하면 그림 2와 같은 일이 보상 모델의 허점에서 다시 일어납니다.
      </p>
      <Callout kind="note">
        AI가 더 넓은 일을 맡을수록 이 문제는 더 무거워집니다. 보상으로 적을 수 있는 것과 사람이 정말 바라는 것 사이에는 언제나 틈이 있고, 더 강하게 최적화하는 시스템일수록 그 틈을 더 잘 찾습니다. 사람의 의도를 보상에 정확히 담는 법, 그리고 보상이 불완전해도 안전하게 행동하는 시스템을 만드는 법은 지금도 활발히 연구되는 문제입니다.
      </Callout>

      <Callout kind="key">
        에이전트는 우리가 바란 것이 아니라 보상으로 적은 것을 최적화합니다. 희소한 보상은 정직하지만 느리고, 다듬기는 빠르지만 잘못하면 맴돌기 같은 엉뚱한 정책을 가장 좋게 만듭니다. 퍼텐셜의 차이 γΦ(s′) − Φ(s)로만 다듬으면 가장 좋은 정책은 바뀌지 않습니다. 그럴듯한 점수도 허점이 있으면 보상 해킹이 일어나므로, 숫자로 적기 어려운 목표는 사람의 쌍대 비교로 보상을 배우기도 합니다. 그렇게 배운 보상도 지표이므로 굿하트의 법칙에서 자유롭지 않습니다.
      </Callout>
      <Quiz
        q="청소 로봇에게 '카메라에 보이는 먼지가 줄어든 만큼' 보상을 주었다. 학습한 로봇이 청소 대신 카메라를 천으로 덮었다. 이 일을 가장 잘 설명하는 것은?"
        options={['학습률이 너무 커서 정책이 무너졌다', '탐험이 부족해 청소하는 행동을 한 번도 해 보지 못했다', '보상이 실제 목표(방이 깨끗함)가 아니라 그 지표(보이는 먼지)를 재고 있어, 지표를 더 싸게 올리는 길을 찾았다', '할인율이 너무 낮아 먼 미래의 보상을 무시했다']}
        answer={2}
        explain={<>로봇은 주어진 보상을 정확히 최대로 만들었습니다. 카메라를 덮으면 보이는 먼지가 0이 되어 청소보다 빠르고 확실하게 보상을 얻습니다. 보상이 재는 것(보이는 먼지)과 바란 것(깨끗한 방) 사이의 틈을 파고든 보상 해킹이고, 굿하트의 법칙의 전형적인 예입니다.</>}
      />
    </>
  );
}
