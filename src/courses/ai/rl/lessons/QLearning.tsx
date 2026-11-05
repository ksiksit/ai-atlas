import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useAnimationFrame, useCanvas2D, useInView } from '../../../../lib/canvas';
import { rng } from '../../../../lib/math';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { argmax, gridModel } from './dp';
import { ACTION_KO, drawGrid, gridLayout, presets, startState, xy, type Grid } from './gridworld';
import { agentStep, greedyPath, newAgent, runEpisodes, smooth, walkCompare, type Agent, type Method, type StepEvent } from './td';
import './rl.css';
import './qlearning.css';

const f3 = (v: number) => (Math.abs(v) < 0.0005 ? '0.000' : v.toFixed(3)).replace('-', '−');
const cellName = (g: Grid, s: number) => {
  const [x, y] = xy(g, s);
  return `(${x + 1}, ${g.h - y})`;
};

/** A simple line chart: several series over a shared x range, y clipped to [lo, hi]. */
function lineChart(ctx: CanvasRenderingContext2D, P: Palette, w: number, h: number, opts: { series: { ys: number[]; color: string; width?: number; dots?: boolean }[]; lo: number; hi: number; xMax: number; yTicks: number[]; xLabel: string; yLabel: string; xStep: number; ref?: { y: number; label: string } }) {
  const pad = { l: 46, r: 12, t: 18, b: 34 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const X = (x: number) => pad.l + (x / Math.max(1, opts.xMax)) * pw;
  const Y = (y: number) => pad.t + ((opts.hi - Math.max(opts.lo, Math.min(opts.hi, y))) / (opts.hi - opts.lo)) * ph;
  ctx.strokeStyle = P.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = P.ink3;
  ctx.font = `10px ${P.fontMono}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of opts.yTicks) {
    ctx.beginPath();
    ctx.moveTo(pad.l, Y(t) + 0.5);
    ctx.lineTo(w - pad.r, Y(t) + 0.5);
    ctx.stroke();
    ctx.fillText(String(t).replace('-', '−'), pad.l - 6, Y(t));
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let x = 0; x <= opts.xMax; x += opts.xStep) ctx.fillText(String(x), X(x), h - pad.b + 6);
  ctx.font = `500 11px ${P.fontBody}`;
  ctx.fillText(opts.xLabel, pad.l + pw / 2, h - 16);
  ctx.textAlign = 'left';
  ctx.fillText(opts.yLabel, pad.l, 2);
  if (opts.ref) {
    ctx.strokeStyle = alpha(P.good, 0.8);
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.l, Y(opts.ref.y) + 0.5);
    ctx.lineTo(w - pad.r, Y(opts.ref.y) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = P.good;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.font = `10px ${P.fontBody}`;
    ctx.fillText(opts.ref.label, w - pad.r, Y(opts.ref.y) - 2);
  }
  for (const s of opts.series) {
    if (s.dots) {
      ctx.fillStyle = s.color;
      s.ys.forEach((y, i) => {
        ctx.beginPath();
        ctx.arc(X(i + 1), Y(y), 1.6, 0, Math.PI * 2);
        ctx.fill();
      });
      continue;
    }
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width ?? 2;
    ctx.beginPath();
    s.ys.forEach((y, i) => (i ? ctx.lineTo(X(i), Y(y)) : ctx.moveTo(X(i), Y(y))));
    ctx.stroke();
  }
}

/* ─────────────── Figure 1: Monte Carlo vs TD on the random walk ─────────────── */

const WALK_EPISODES = 100;
const WALK_RUNS = 100;

function RandomWalkFigure() {
  const P = usePalette();
  const [aMC, setAMC] = useState(0.02);
  const [aTD, setATD] = useState(0.1);
  const res = useMemo(() => walkCompare(WALK_EPISODES, WALK_RUNS, aMC, aTD, 1, rng), [aMC, aTD]);

  const chain = useCanvas2D(
    (ctx, { w, h }) => {
      const n = 7;
      const r = Math.min(20, w / (n * 3));
      const gap = (w - 2 * r) / (n - 1);
      const y = h / 2 - 4;
      const names = ['끝', 'A', 'B', 'C', 'D', 'E', '끝'];
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(r, y);
      ctx.lineTo(w - r, y);
      ctx.stroke();
      for (let i = 0; i < n; i++) {
        const x = r + i * gap;
        const term = i === 0 || i === n - 1;
        ctx.beginPath();
        if (term) ctx.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
        else ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = term ? P.surface2 : i === 3 ? alpha(P.accent, 0.18) : P.surface;
        ctx.fill();
        ctx.strokeStyle = i === 3 ? P.accent : P.ink3;
        ctx.stroke();
        ctx.fillStyle = P.ink;
        ctx.font = `600 ${Math.round(r * 0.6)}px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(names[i], x, y);
        if (!term) {
          ctx.fillStyle = P.ink3;
          ctx.font = `10px ${P.fontMono}`;
          ctx.fillText(`${i}/6`, x, y + r + 11);
        }
      }
      ctx.fillStyle = P.good;
      ctx.font = `600 11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.fillText('보상 1', w - 2, y - r - 8);
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'left';
      ctx.fillText('보상 0', 2, y - r - 8);
    },
    [P],
    { height: 80, minHeight: 60 },
  );

  const plot = useCanvas2D(
    (ctx, { w, h }) =>
      lineChart(ctx, P, w, h, {
        series: [
          { ys: res.mc, color: P.neg },
          { ys: res.td, color: P.pos },
        ],
        lo: 0,
        hi: 0.25,
        xMax: WALK_EPISODES,
        yTicks: [0, 0.05, 0.1, 0.15, 0.2, 0.25],
        xStep: 25,
        xLabel: '에피소드',
        yLabel: '참값과의 오차 (RMS)',
      }),
    [P, res],
    { aspect: 2, maxHeight: 280, minHeight: 180 },
  );

  return (
    <Figure
      no={1}
      title="같은 경험, 두 가지 배우는 법"
      hint="학습률을 바꿔 보세요"
      caption={
        <>
          C에서 출발해 왼쪽이나 오른쪽으로 반반의 확률로 한 칸씩 움직이다가 양 끝에 닿으면 끝납니다. 오른쪽 끝으로 나가면 보상 1, 왼쪽은 0이라 A부터 E의 참 가치는 1/6부터 5/6입니다. 모든 가치를 0.5에서 시작해 두 방법이 똑같은 에피소드를 보고 배우게 했고, 이것을 {WALK_RUNS}번 되풀이해 평균한 오차를 그렸습니다.
        </>
      }
    >
      <div ref={chain.wrapRef} className="canvas-box" role="img" aria-label="다섯 상태 A부터 E가 한 줄로 놓인 무작위 걷기. 가운데 C에서 출발하고, 오른쪽 끝으로 나가면 보상 1, 왼쪽 끝은 0입니다.">
        <canvas ref={chain.canvasRef} />
      </div>
      <div className="controls row">
        <Slider id="walk-amc" label="몬테카를로 학습률" value={aMC} min={0.01} max={0.05} step={0.01} onChange={setAMC} format={(v) => v.toFixed(2)} color="var(--neg)" />
        <Slider id="walk-atd" label="시간차 학습률" value={aTD} min={0.05} max={0.2} step={0.05} onChange={setATD} format={(v) => v.toFixed(2)} color="var(--pos)" />
      </div>
      <div ref={plot.wrapRef} className="canvas-box" role="img" aria-label={`에피소드 ${WALK_EPISODES}개 뒤 평균 오차: 몬테카를로 ${res.mc[WALK_EPISODES].toFixed(3)}, 시간차 ${res.td[WALK_EPISODES].toFixed(3)}.`}>
        <canvas ref={plot.canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Readout label="처음 오차" value={res.mc[0].toFixed(3)} />
        <Readout label={`몬테카를로, ${WALK_EPISODES}번 뒤`} value={res.mc[WALK_EPISODES].toFixed(3)} color="var(--neg)" />
        <Readout label={`시간차, ${WALK_EPISODES}번 뒤`} value={res.td[WALK_EPISODES].toFixed(3)} color="var(--pos)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a Q-learning agent you can watch ─────────────── */

type LiveName = 'maze' | 'classic';
const GAMMA = 0.9;

function QAgentFigure() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [name, setName] = useState<LiveName>('maze');
  const [eps, setEps] = useState(0.1);
  const [alphaLR, setAlphaLR] = useState(0.5);
  const [seed, setSeed] = useState(1);
  const [speed, setSpeed] = useState(8);
  const [playing, setPlaying] = useState(false);
  const [arrows, setArrows] = useState(true);
  const [, setVer] = useState(0);
  const g = presets[name];
  const m = useMemo(() => gridModel(g), [g]);
  const s0 = startState(g);
  const run = useMemo(() => ({ ag: newAgent(m, 'q', s0, rng(seed), 0.1), lens: [] as number[], last: null as StepEvent | null }), [m, s0, seed]);
  const acc = useRef(0);
  const params = { alpha: alphaLR, gamma: GAMMA, eps, maxSteps: 200 };

  const stepOnce = () => {
    const len = run.ag.len + 1;
    const ev = agentStep(m, run.ag, params, s0);
    if (ev.ended) run.lens.push(len);
    run.last = ev;
  };
  const bump = () => setVer((v) => v + 1);
  const finishEpisodes = (k: number) => {
    setPlaying(false);
    const goal = run.ag.episodes + k;
    let guard = 0;
    while (run.ag.episodes < goal && guard++ < 200 * k + 10) stepOnce();
    bump();
  };

  useAnimationFrame((dt) => {
    acc.current += dt * speed;
    const n = Math.min(400, Math.floor(acc.current));
    if (!n) return;
    acc.current -= n;
    for (let i = 0; i < n; i++) stepOnce();
    bump();
  }, playing && inView);

  const ag = run.ag;
  const q = useMemo(() => Array.from({ length: m.n }, (_, s) => Array.from(ag.Q.subarray(s * 4, s * 4 + 4))), [m, ag, ag.totalSteps]);
  const pol = q.map((qs) => (qs.some((v) => v !== 0) ? argmax(qs) : null));
  const path = useMemo(() => greedyPath(m, ag.Q, s0), [m, ag, s0, ag.totalSteps]);
  const reached = g.cells[path[path.length - 1]] === 'goal';
  const recent = run.lens.slice(-10);
  const ev = run.last;

  const board = useCanvas2D(
    (ctx, { w, h }) => {
      const L = gridLayout(g, w, h, 6);
      drawGrid(ctx, P, g, L, { q, vScale: 1, policy: arrows ? pol : undefined, agent: ag.s, trail: ag.trail });
    },
    [P, g, q, pol.join(), arrows, ag.s, ag.trail.length, ag.totalSteps],
    { aspect: name === 'maze' ? 1 : 4 / 3, maxHeight: 340, minHeight: 200 },
  );

  const best = name === 'maze' ? 0.64 : undefined;
  const curve = useCanvas2D(
    (ctx, { w, h }) => {
      const rs = ag.returns;
      lineChart(ctx, P, w, h, {
        series: [
          { ys: rs, color: alpha(P.ink3, 0.6), dots: true },
          { ys: [rs[0] ?? 0, ...smooth(rs, 10)], color: P.accent },
        ],
        lo: -2,
        hi: 1,
        xMax: Math.max(20, Math.ceil(rs.length / 10) * 10),
        yTicks: [-2, -1, 0, 1],
        xStep: rs.length > 100 ? 50 : 10,
        xLabel: '에피소드',
        yLabel: '에피소드의 보상 합',
        ref: best !== undefined ? { y: best, label: `가장 짧은 길: ${best}` } : undefined,
      });
    },
    [P, ag.returns.length, best],
    { aspect: 2.6, maxHeight: 200, minHeight: 140 },
  );

  const note = !ev
    ? '아직 아무것도 모릅니다. 모든 Q가 0이라 칸이 흰색입니다. 재생하거나 "한 걸음"을 눌러 보세요.'
    : `${cellName(g, ev.s)}에서 ${ACTION_KO[ev.a]} → ${cellName(g, ev.s2)}, 보상 ${f3(ev.r)}. 목표값 = ${f3(ev.r)} + ${GAMMA} × ${g.cells[ev.s2] === 'goal' || g.cells[ev.s2] === 'pit' ? '0 (끝)' : `max Q(${cellName(g, ev.s2)})`} = ${f3(ev.target)}. Q: ${f3(ev.before)} → ${f3(ev.after)}${ev.ended ? '. 에피소드가 끝나 출발 칸으로 돌아갑니다.' : '.'}`;

  return (
    <Figure
      no={2}
      title="Q-러닝 에이전트가 미로를 배우는 과정"
      hint="재생하거나 한 걸음씩 넘겨 보세요"
      caption={
        <>
          칸마다 네 삼각형이 그 칸에서 위, 오른쪽, 아래, 왼쪽으로 갈 때의 Q 값입니다. 초록은 0보다 크고 빨강은 작습니다. 파란 점이 에이전트, 파란 선이 이번 에피소드에서 지나온 길입니다. 화살표는 지금 Q로 고른 가장 좋은 방향입니다. 할인율은 0.9이고, 한 에피소드가 200걸음을 넘으면 끊고 다시 출발합니다. 4×3 격자는 미끄러질 확률이 20%여서 같은 행동도 결과가 달라집니다.
        </>
      }
    >
      <div ref={outer} className="controls row">
        <Seg
          value={name}
          onChange={(v) => {
            setPlaying(false);
            setName(v);
          }}
          options={[
            { value: 'maze', label: '미로' },
            { value: 'classic', label: '4×3 격자' },
          ]}
        />
        <Slider id="ql-eps" label="탐험 확률 ε" value={eps} min={0} max={0.5} step={0.05} onChange={setEps} format={(v) => v.toFixed(2)} />
        <Slider id="ql-alpha" label="학습률 α" value={alphaLR} min={0.1} max={1} step={0.1} onChange={setAlphaLR} format={(v) => v.toFixed(1)} />
      </div>
      <div className="fig-split">
        <div className="rl-col">
          <div ref={board.wrapRef} className="canvas-box" role="img" aria-label={`Q-러닝 에이전트, 에피소드 ${ag.episodes}개와 ${ag.totalSteps}걸음 뒤. 지금 Q로 고른 길은 ${reached ? `${path.length - 1}걸음 만에 출구에 닿습니다` : '아직 출구에 닿지 않습니다'}.`}>
            <canvas ref={board.canvasRef} />
          </div>
          <div className="rl-note ql-note" aria-live="polite">
            {note}
          </div>
        </div>
        <div className="controls">
          <div className="btn-row" role="group" aria-label="학습 진행">
            <Button small primary onClick={() => setPlaying((p) => !p)}>
              {playing ? '❚❚ 멈춤' : '▶ 재생'}
            </Button>
            <Button
              small
              onClick={() => {
                setPlaying(false);
                stepOnce();
                bump();
              }}
            >
              한 걸음
            </Button>
            <Button small onClick={() => finishEpisodes(1)}>
              에피소드 끝까지
            </Button>
            <Button small onClick={() => finishEpisodes(50)}>
              에피소드 50개
            </Button>
          </div>
          <Slider id="ql-speed" label="속도 (걸음/초)" value={speed} min={1} max={200} step={1} onChange={setSpeed} />
          <div className="btn-row">
            <Button
              small
              onClick={() => {
                setPlaying(false);
                run.ag = newAgent(m, 'q', s0, rng(seed), eps);
                run.lens = [];
                run.last = null;
                bump();
              }}
            >
              처음부터
            </Button>
            <Button
              small
              onClick={() => {
                setPlaying(false);
                setSeed((x) => x + 1);
              }}
            >
              다른 씨앗
            </Button>
          </div>
          <Check label="가장 좋은 방향 화살표" checked={arrows} onChange={setArrows} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="에피소드" value={ag.episodes} />
            <Readout label="걸음" value={ag.totalSteps.toLocaleString('ko-KR')} />
            <Readout label="최근 10번 평균 길이" value={recent.length ? `${(recent.reduce((a, b) => a + b, 0) / recent.length).toFixed(1)}걸음` : '−'} />
            <Readout label="지금 고른 길" value={reached ? `${path.length - 1}걸음` : '출구 못 닿음'} color={reached ? 'var(--good)' : undefined} />
          </div>
          <div className="rl-small">씨앗 {seed}</div>
        </div>
      </div>
      <div ref={curve.wrapRef} className="canvas-box" role="img" aria-label={`에피소드마다 받은 보상의 합. 지금까지 ${ag.returns.length}개.`}>
        <canvas ref={curve.canvasRef} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the cliff, Q-learning vs SARSA ─────────────── */

const CLIFF_EPISODES = 500;
const CLIFF_RUNS = 50;
const CLIFF = presets.cliff;
const METHODS: Method[] = ['q', 'sarsa'];

function useCliffRuns(eps: number) {
  const [state, setState] = useState<{ eps: number; done: number; sums: Record<Method, number[]>; tail: Record<Method, number> }>({ eps, done: 0, sums: { q: [], sarsa: [] }, tail: { q: 0, sarsa: 0 } });
  useEffect(() => {
    const m = gridModel(CLIFF);
    const s0 = startState(CLIFF);
    const p = { alpha: 0.5, gamma: 1, eps, maxSteps: 1000 };
    const sums: Record<Method, number[]> = { q: new Array(CLIFF_EPISODES).fill(0), sarsa: new Array(CLIFF_EPISODES).fill(0) };
    const tail: Record<Method, number> = { q: 0, sarsa: 0 };
    let r = 0;
    let raf = 0;
    const work = () => {
      // a few runs per frame keeps the page responsive
      const until = Math.min(CLIFF_RUNS, r + 3);
      for (; r < until; r++)
        for (const meth of METHODS) {
          const ag = newAgent(m, meth, s0, rng(100 + r), eps);
          runEpisodes(m, ag, p, s0, CLIFF_EPISODES);
          ag.returns.forEach((x, i) => (sums[meth][i] += x));
          tail[meth] += ag.returns.slice(-100).reduce((a, b) => a + b, 0) / 100;
        }
      setState({ eps, done: r, sums: { q: sums.q.slice(), sarsa: sums.sarsa.slice() }, tail: { ...tail } });
      if (r < CLIFF_RUNS) raf = requestAnimationFrame(work);
    };
    raf = requestAnimationFrame(work);
    return () => cancelAnimationFrame(raf);
  }, [eps]);
  return state;
}

function CliffFigure() {
  const P = usePalette();
  const [eps, setEps] = useState(0.1);
  const runs = useCliffRuns(eps);
  const ready = runs.eps === eps && runs.done > 0;
  const avg = (meth: Method) => (ready ? runs.sums[meth].map((x) => x / runs.done) : []);
  const tail = (meth: Method) => (ready ? runs.tail[meth] / runs.done : NaN);
  // one run per method with seed 1, to show the path each settles on
  const paths = useMemo(() => {
    const m = gridModel(CLIFF);
    const s0 = startState(CLIFF);
    const out = {} as Record<Method, number[]>;
    for (const meth of METHODS) {
      const ag: Agent = newAgent(m, meth, s0, rng(1), eps);
      runEpisodes(m, ag, { alpha: 0.5, gamma: 1, eps, maxSteps: 1000 }, s0, CLIFF_EPISODES);
      out[meth] = greedyPath(m, ag.Q, s0);
    }
    return out;
  }, [eps]);

  const board = useCanvas2D(
    (ctx, { w, h }) => {
      const L = gridLayout(CLIFF, w, h, 6);
      drawGrid(ctx, P, CLIFF, L, {});
      const c = L.cell;
      METHODS.forEach((meth, k) => {
        const off = (k ? 1 : -1) * c * 0.12;
        ctx.strokeStyle = meth === 'q' ? P.neg : P.pos;
        ctx.lineWidth = Math.max(2.5, c * 0.1);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        paths[meth].forEach((s, i) => {
          const [x, y] = xy(CLIFF, s);
          const px = L.x + (x + 0.5) * c + off, py = L.y + (y + 0.5) * c + off;
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.stroke();
      });
      ctx.fillStyle = P.bad;
      ctx.font = `600 ${Math.max(10, Math.round(c * 0.3))}px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('낭떠러지 −100', L.x + c * 6, L.y + c * 3.5);
    },
    [P, paths],
    { aspect: 3, maxHeight: 220, minHeight: 110 },
  );

  const plot = useCanvas2D(
    (ctx, { w, h }) =>
      lineChart(ctx, P, w, h, {
        series: [
          { ys: smooth(avg('q'), 10), color: P.neg },
          { ys: smooth(avg('sarsa'), 10), color: P.pos },
        ],
        lo: -100,
        hi: 0,
        xMax: CLIFF_EPISODES,
        yTicks: [-100, -75, -50, -25, 0],
        xStep: 100,
        xLabel: '에피소드',
        yLabel: '에피소드의 보상 합 (평균, 10개씩 이동 평균)',
      }),
    [P, runs],
    { aspect: 2.2, maxHeight: 280, minHeight: 180 },
  );

  return (
    <Figure
      no={3}
      title="낭떠러지 옆에서: Q-러닝과 SARSA"
      hint="탐험 확률을 바꿔 보세요"
      caption={
        <>
          아래 줄 왼쪽이 출발, 오른쪽이 도착이고 그 사이가 낭떠러지입니다. 걸음마다 −1, 낭떠러지에 빠지면 −100을 받고 출발점으로 돌아갑니다. 학습률 0.5, 할인 없음(γ = 1)으로 두 방법을 각각 {CLIFF_EPISODES}에피소드씩 {CLIFF_RUNS}번 학습시켜 평균했습니다. 위 그림의 길은 씨앗 1로 학습을 마친 뒤 탐험 없이 고른 길입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          value={eps}
          onChange={setEps}
          options={[
            { value: 0.1, label: 'ε = 0.1' },
            { value: 0.05, label: 'ε = 0.05' },
            { value: 0.01, label: 'ε = 0.01' },
          ]}
        />
        <span className="rl-small" aria-live="polite">
          {runs.done < CLIFF_RUNS || !ready ? `계산 중… ${runs.eps === eps ? runs.done : 0}/${CLIFF_RUNS}` : `${CLIFF_RUNS}번 평균`}
        </span>
      </div>
      <div ref={board.wrapRef} className="canvas-box" role="img" aria-label={`낭떠러지 격자. Q-러닝이 고른 길은 ${paths.q.length - 1}걸음, SARSA가 고른 길은 ${paths.sarsa.length - 1}걸음입니다.`}>
        <canvas ref={board.canvasRef} />
      </div>
      <div ref={plot.wrapRef} className="canvas-box" role="img" aria-label={`에피소드마다 받은 보상 합의 평균. 마지막 100에피소드 평균은 Q-러닝 ${tail('q').toFixed(1)}, SARSA ${tail('sarsa').toFixed(1)}입니다.`}>
        <canvas ref={plot.canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <Readout label={`Q-러닝: 고른 길 ${paths.q.length - 1}걸음 · 마지막 100번 평균`} value={isNaN(tail('q')) ? '−' : tail('q').toFixed(1)} color="var(--neg)" />
        <Readout label={`SARSA: 고른 길 ${paths.sarsa.length - 1}걸음 · 마지막 100번 평균`} value={isNaN(tail('sarsa')) ? '−' : tail('sarsa').toFixed(1)} color="var(--pos)" />
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: 'Q-러닝', shape: 'ln' },
          { color: 'var(--pos)', label: 'SARSA', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function QLearning() {
  return (
    <>
      <h2>규칙을 모르면 겪어 보는 수밖에</h2>
      <p>
        <a href={lessonHref('ai-reinforcement-learning', 'dynamic-programming')}>앞 장</a>의 가치 반복은 "이 행동을 하면 어디로 갈 확률이 얼마인지"를 모두 알아야 했습니다. 실제 에이전트는 그런 표 없이 세상에 던져집니다. 할 수 있는 것은 행동해 보고, 받은 보상과 도착한 곳을 보는 것뿐입니다. 이 장에서는 그 경험만으로 가치를 배우는 두 가지 방법과, 그중 하나를 행동 선택까지 넓힌 Q-러닝을 봅니다.
      </p>

      <h2>몬테카를로와 시간차</h2>
      <p>
        상태 s의 가치는 "s에서 출발해 받게 될 보상 합의 평균"이므로, 가장 단순한 방법은 실제로 끝까지 가 보고 받은 합 G로 추정을 조금씩 옮기는 것입니다. 이것이 <T en="Monte Carlo">몬테카를로</T> 방법입니다. 다른 방법은 끝까지 기다리지 않고, 한 걸음 가서 받은 보상 r과 도착한 상태의 <strong>지금 추정값</strong> V(s′)을 합쳐 목표로 삼는 것입니다. 추정으로 추정을 고치는 이 방법을 <T en="temporal-difference learning, TD">시간차 학습</T>이라고 합니다.
      </p>
      <MB note="α는 학습률(한 번에 얼마나 옮길지), γ는 할인율입니다. 괄호 안이 목표와 지금 추정의 차이입니다.">{String.raw`\text{몬테카를로: } V(s) \leftarrow V(s) + \alpha\,\bigl[\,G - V(s)\,\bigr] \qquad \text{시간차: } V(s) \leftarrow V(s) + \alpha\,\bigl[\,r + \gamma V(s') - V(s)\,\bigr]`}</MB>
      <p>
        숫자로 보면 이렇습니다. V(C) = 0.5, V(D) = 0.5인 상태에서 C에서 D로 한 걸음 가고 보상 0을 받았다면, 시간차의 목표는 0 + 0.5 = 0.5라서 V(C)는 그대로입니다. 몬테카를로는 이 에피소드가 끝날 때까지 기다렸다가, 오른쪽 끝으로 나가 1을 받았다면 V(C)를 0.5 + 0.02 × (1 − 0.5) = 0.51로 옮깁니다. 그림 1은 두 방법에게 똑같은 경험을 주고 참값에 얼마나 빨리 다가가는지 비교한 것입니다.
      </p>
      <RandomWalkFigure />
      <p>
        기본 설정에서 100에피소드 뒤 오차는 몬테카를로가 0.084, 시간차가 0.057입니다. 10에피소드 뒤에도 0.195 대 0.128로 시간차가 앞섭니다. 몬테카를로의 목표 G는 에피소드 전체의 운이 모두 섞인 값이라 들쭉날쭉하지만, 시간차의 목표는 한 걸음의 운만 섞여서 덜 흔들리기 때문입니다. 대신 시간차의 목표에는 아직 틀린 추정 V(s′)이 들어 있어서 처음에는 치우쳐 있습니다. 학습률을 바꿔 보면 이 맞바꿈이 보입니다. 학습률이 크면 빨리 내려가지만 더 낮게 내려가지 못하고 흔들립니다. 시간차 학습률을 0.05로 낮추면 처음에는 느리지만 100에피소드 뒤 오차는 0.036까지 내려갑니다.
      </p>

      <h2>Q-러닝: 행동의 가치를 배우기</h2>
      <p>
        상태의 가치 V(s)만 알아서는 행동을 고를 수 없습니다. 어느 행동이 어느 칸으로 데려가는지 모르기 때문입니다. 그래서 상태와 행동의 짝마다 가치 Q(s, a)를 둡니다. "s에서 a를 하고 그 뒤로 가장 잘 행동하면 받을 보상 합"입니다. 1989년 왓킨스(Chris Watkins)가 제안한 <T en="Q-learning">Q-러닝</T>은 시간차 학습을 Q에 그대로 적용하되, 목표에 다음 칸에서 <strong>가장 좋은</strong> 행동의 Q를 씁니다.
      </p>
      <MB>{String.raw`Q(s, a) \leftarrow Q(s, a) + \alpha\,\bigl[\,r + \gamma \max_{a'} Q(s', a') - Q(s, a)\,\bigr]`}</MB>
      <p>
        행동은 <T en="ε-greedy">ε-탐욕</T>으로 고릅니다. 확률 ε로는 아무 방향이나, 나머지는 지금 Q가 가장 큰 방향으로 갑니다. 늘 가장 좋아 보이는 쪽으로만 가면 한 번도 안 가 본 더 좋은 길을 영영 모르기 때문입니다. 그림 2에서 에이전트가 미로를 배우는 모습을 보세요.
      </p>
      <QAgentFigure />
      <p>
        처음 한 걸음에서 에이전트는 위로 가려다 격자 끝에 막혀 제자리에 남고 −0.04를 받습니다. 목표값은 −0.04 + 0.9 × 0 = −0.04이고, 학습률 0.5로 Q는 0에서 −0.02가 됩니다. 이렇게 가 본 방향마다 조금씩 빨개져서, 에이전트는 자연스럽게 안 가 본 방향을 먼저 시도합니다. 첫 에피소드는 126걸음 헤맨 끝에 출구에 닿고, 출구 바로 앞 칸의 오른쪽 Q가 0.5로 처음 초록이 됩니다. 두 번째 에피소드는 200걸음 안에 출구를 찾지 못해 끊깁니다. 그 뒤로 초록이 출구에서 거꾸로 한 칸씩 번지고, 12번째 에피소드가 끝나면 화살표를 따라가는 길이 가장 짧은 10걸음이 됩니다. "에피소드 50개"를 누르면 최근 10번의 평균 길이가 11.3걸음입니다. 가장 짧은 길보다 조금 긴 것은 ε = 0.1의 탐험 때문입니다.
      </p>
      <Callout kind="note">
        Q-러닝은 가치 반복과 같은 벨만 최적 방정식을 풉니다. 다른 점은 Σ p(…)를 계산하는 대신 실제로 한 번 겪은 결과를 그 기댓값의 표본으로 쓴다는 것입니다. 모든 짝을 충분히 자주 시도하고 학습률을 적절히 줄여 가면 Q-러닝은 최적의 Q로 수렴한다는 것이 증명되어 있습니다.
      </Callout>

      <h2>낭떠러지 옆에서: Q-러닝과 SARSA</h2>
      <p>
        Q-러닝의 목표 max Q(s′, ·)는 "다음부터는 가장 좋게 행동한다"고 가정한 값입니다. 하지만 에이전트는 실제로는 ε만큼 무작위로 움직입니다. 이 차이를 없앤 것이 <T en="SARSA">SARSA</T>입니다. 이름은 한 번의 갱신에 쓰는 다섯 값 (s, a, r, s′, a′)에서 왔고, 목표에 실제로 다음에 고른 행동 a′의 Q를 씁니다.
      </p>
      <MB>{String.raw`\text{SARSA: } Q(s, a) \leftarrow Q(s, a) + \alpha\,\bigl[\,r + \gamma\, Q(s', a') - Q(s, a)\,\bigr]`}</MB>
      <p>
        자기가 실제로 따르는 정책(탐험 포함)의 가치를 배우는 SARSA를 <T en="on-policy">정책 내</T> 학습, 따르는 정책과 다른 정책(탐험 없는 최적 정책)의 가치를 배우는 Q-러닝을 <T en="off-policy">정책 외</T> 학습이라고 합니다. 둘의 차이는 서튼(Richard Sutton)과 바르토(Andrew Barto)의 교과서에 나오는 낭떠러지 걷기에서 잘 드러납니다.
      </p>
      <CliffFigure />
      <p>
        ε = 0.1에서 Q-러닝은 낭떠러지 바로 위 줄을 따라 가는 가장 짧은 13걸음 길을 고릅니다. 50번 학습시켜 50번 모두 그렇습니다. SARSA는 맨 윗줄로 돌아가는 17걸음 길을 고릅니다. 그런데 학습하는 동안 실제로 받은 보상은 반대입니다. 마지막 100에피소드의 평균이 Q-러닝은 −50.3, SARSA는 −28.9입니다. 낭떠러지 바로 옆을 걷는 Q-러닝은 열 걸음에 한 번꼴인 무작위 걸음 때문에 자꾸 떨어지고, SARSA는 그 무작위 걸음까지 셈에 넣어 떨어져도 덜 아픈 먼 길을 택했기 때문입니다.
      </p>
      <p>
        ε를 0.01로 낮추면 무작위 걸음이 드물어져서 마지막 100에피소드 평균이 Q-러닝 −15.8, SARSA −16.6으로 뒤집힙니다. 어느 쪽이 낫다기보다, 배운 정책을 탐험 없이 쓸 것이라면 Q-러닝이 더 좋은 정책을 찾고, 배우는 동안의 손해가 중요하다면(실제 로봇이 넘어지면 안 된다면) SARSA가 더 안전합니다.
      </p>

      <h2>표가 너무 클 때: 심층 Q-네트워크</h2>
      <p>
        여기까지는 칸마다 Q를 적어 둔 표를 썼습니다. 화면 픽셀처럼 상태가 사실상 무한하면 표를 만들 수 없으니, Q를 <a href={lessonHref('ai-basics', 'neural-network')}>신경망</a>으로 근사합니다. 상태를 넣으면 행동마다 Q를 내놓는 신경망을 Q-러닝의 목표 r + γ max Q(s′, ·)에 가깝게 학습시키는 것입니다. 2015년 딥마인드의 <T en="Deep Q-Network, DQN">심층 Q-네트워크</T>는 이 방법으로 아타리 게임 수십 개를 화면 픽셀과 점수만 보고 배워, 상당수에서 사람 수준에 이르렀습니다. 다만 신경망의 추정으로 신경망의 목표를 만들면 학습이 쉽게 불안정해져서, 지난 경험을 모아 섞어 쓰는 경험 재생과 목표를 천천히 바꾸는 목표 신경망 같은 장치가 함께 필요했습니다.
      </p>

      <Callout kind="key">
        규칙을 모르면 경험으로 가치를 배웁니다. 몬테카를로는 에피소드가 끝난 뒤 실제 보상 합으로, 시간차 학습은 한 걸음 뒤의 보상과 다음 상태의 추정값으로 지금 추정을 고칩니다. Q-러닝은 상태와 행동의 짝마다 Q(s, a)를 두고 r + γ max Q(s′, ·)를 목표로 배우며, 행동은 ε-탐욕으로 골라 탐험합니다. SARSA는 실제로 다음에 고른 행동의 Q를 써서 탐험까지 포함한 정책의 가치를 배우므로, 탐험이 위험한 곳에서는 더 조심스럽게 행동합니다.
      </Callout>
      <Quiz
        q="창고 로봇을 실제 창고에서 학습시킨다. 학습하는 동안에도 가끔 무작위로 움직이며(ε-탐욕), 선반에 부딪히면 큰 손해가 난다. 학습 중 손해를 줄이려면 어느 쪽이 알맞을까?"
        options={['Q-러닝. 최적 정책을 배우므로 학습 중에도 가장 안전하다', 'SARSA. 무작위 움직임까지 포함한 실제 정책의 가치를 배워 위험한 곳을 피한다', '몬테카를로. 에피소드가 끝나야 배우므로 부딪히지 않는다', '어느 것이든 같다. 학습이 끝나면 모두 같은 정책이 된다']}
        answer={1}
        explain={<>Q-러닝은 "다음부터는 최적으로 움직인다"고 가정한 가치를 배우므로, 탐험하는 동안 실수하면 위험한 길(낭떠러지 바로 옆)을 고릅니다. SARSA는 실제로 따르는 ε-탐욕 정책의 가치를 배우므로 무작위 걸음의 위험까지 셈에 넣어 여유 있는 길을 고릅니다. 그림 3에서 ε = 0.1일 때 학습 중 평균 보상이 SARSA −28.9, Q-러닝 −50.3이었던 것과 같습니다.</>}
      />
    </>
  );
}
