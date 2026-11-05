import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { Button, Callout, Figure, Legend, MB, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { localPoint, useCanvas2D } from '../../../../lib/canvas';
import { drawArrow } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { ACTION_KO, ARROW, cellAt, drawGrid, evaluatePolicy, gridLayout, isTerminal, isWall, liveStates, presets, solveOptimal, transitions, variant, xy, type Grid } from './gridworld';
import './rl.css';
import './mdp.css';

const BASE = presets.classic;
const START = 8;
/** Cell names in the reader's terms: column 1–4 from the left, row 1–3 from the top. */
const cellName = (g: Grid, s: number) => {
  const [x, y] = xy(g, s);
  return `(${x + 1}, ${y + 1})`;
};
const fmt = (v: number, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? (0).toFixed(d) : v.toFixed(d)).replace('-', '−');

/** A canvas showing one grid; clicking a cell calls onCell. */
function useGridCanvas(g: Grid, draw: (ctx: CanvasRenderingContext2D, L: ReturnType<typeof gridLayout>, w: number, h: number) => void, deps: unknown[], onCell?: (s: number) => void) {
  const layout = useRef<ReturnType<typeof gridLayout> | null>(null);
  const c = useCanvas2D(
    (ctx, { w, h }) => {
      const L = gridLayout(g, w, h, 10);
      layout.current = L;
      draw(ctx, L, w, h);
    },
    deps,
    { aspect: 1.45, maxHeight: 380 },
  );
  const onClick = (e: MouseEvent) => {
    if (!onCell || !layout.current || !c.canvasRef.current) return;
    const p = localPoint(e, c.canvasRef.current);
    const s = cellAt(g, layout.current, p.x, p.y);
    if (s >= 0 && !isWall(g, s)) onCell(s);
  };
  return { ...c, onClick };
}

/* ─────────────── Figure 1: one move, several outcomes ─────────────── */

function TransitionFigure() {
  const P = usePalette();
  const [slip, setSlip] = useState(0.2);
  const [cell, setCell] = useState(START);
  const [act, setAct] = useState(0);
  const g = useMemo(() => variant(BASE, { slip }), [slip]);
  const live = liveStates(g);
  const outs = isTerminal(g, cell) ? [] : transitions(g, cell, act);

  const { wrapRef, canvasRef, onClick } = useGridCanvas(
    g,
    (ctx, L) => {
      drawGrid(ctx, P, g, L, { highlight: cell });
      const center = (s: number): [number, number] => {
        const [x, y] = xy(g, s);
        return [L.x + (x + 0.5) * L.cell, L.y + (y + 0.5) * L.cell];
      };
      const [cx, cy] = center(cell);
      const label = (txt: string, x: number, y: number) => {
        ctx.font = `700 ${Math.max(11, Math.round(L.cell * 0.17))}px ${P.fontMono}`;
        const tw = ctx.measureText(txt).width;
        ctx.fillStyle = P.surface;
        ctx.fillRect(x - tw / 2 - 4, y - 10, tw + 8, 20);
        ctx.fillStyle = P.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, x, y + 0.5);
      };
      for (const o of outs) {
        const pct = `${Math.round(o.p * 100)}%`;
        if (o.s2 === cell) {
          // bumped into a wall or the edge: a small loop in the cell itself
          ctx.strokeStyle = P.accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy - L.cell * 0.08, L.cell * 0.13, 0.3, Math.PI * 1.85);
          ctx.stroke();
          label(`${pct} 제자리`, cx, cy + L.cell * 0.24);
          continue;
        }
        const [tx, ty] = center(o.s2);
        drawArrow(ctx, cx + (tx - cx) * 0.22, cy + (ty - cy) * 0.22, tx - (tx - cx) * 0.3, ty - (ty - cy) * 0.3, alpha(P.accent, 0.45 + 0.55 * o.p), 1.5 + 4 * o.p, 9);
        // the probability sits in the cell it leads to
        label(pct, tx, ty);
      }
    },
    [P, g, cell, act, outs],
    (s) => setCell(s),
  );

  const step = (d: number) => setCell(live[(live.indexOf(cell) + d + live.length) % live.length]);
  const desc = outs.map((o) => `${Math.round(o.p * 100)}%: ${o.s2 === cell ? '제자리(벽이나 가장자리에 부딪힘)' : cellName(g, o.s2)}${g.cells[o.s2] === 'goal' ? ' 목표' : g.cells[o.s2] === 'pit' ? ' 구덩이' : ''}, 보상 ${fmt(o.r)}`).join(' · ');

  return (
    <Figure
      no={1}
      title="같은 행동, 여러 결과"
      hint="칸을 누르고 행동을 골라 보세요"
      caption={<>4×3 격자 세계입니다. 검은 칸은 벽, 초록 칸(+1)은 목표, 빨간 칸(−1)은 구덩이이고, 둘 중 하나에 들어가면 끝납니다. 그 밖의 칸에 들어갈 때마다 −0.04를 받습니다. 땅이 미끄러워서 고른 방향으로 가지 않고 양옆 방향으로 미끄러질 수 있습니다. 벽이나 가장자리 쪽으로 움직이면 제자리에 머뭅니다.</>}
    >
      <div className="fig-split">
        <div className="rl-col">
          <div ref={wrapRef} className="canvas-box md-click" role="img" aria-label={`${cellName(g, cell)} 칸에서 ${ACTION_KO[act]}으로 움직이면: ${desc || '끝난 칸이라 움직이지 않습니다'}.`} onClick={onClick}>
            <canvas ref={canvasRef} />
          </div>
          <div className="rl-note" aria-live="polite">
            {outs.length ? `${cellName(g, cell)}에서 ${ACTION_KO[act]}: ${desc}` : '목표나 구덩이에 들어가면 에피소드가 끝납니다. 다른 칸을 골라 보세요.'}
          </div>
        </div>
        <div className="controls">
          <Seg value={act} onChange={setAct} label="행동" options={ARROW.map((a, i) => ({ value: i, label: `${a} ${ACTION_KO[i]}` }))} />
          <div className="btn-row">
            <Button small onClick={() => step(-1)} label="이전 칸">
              ◀ 칸
            </Button>
            <Button small onClick={() => step(1)} label="다음 칸">
              칸 ▶
            </Button>
          </div>
          <Slider id="md-slip" label="미끄러질 확률" value={slip} min={0} max={0.6} step={0.05} onChange={setSlip} format={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: discounting a stream of rewards ─────────────── */

const PATH_REWARDS = [-0.04, -0.04, -0.04, -0.04, 1];

function ReturnFigure() {
  const P = usePalette();
  const [gamma, setGamma] = useState(0.9);
  const terms = PATH_REWARDS.map((r, t) => r * Math.pow(gamma, t));
  const G = terms.reduce((a, b) => a + b, 0);
  const forever = gamma < 1 ? 1 / (1 - gamma) : Infinity;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 42, r: 12, t: 16, b: 40 };
      const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const n = PATH_REWARDS.length;
      const bw = pw / n;
      const yMax = 1, yMin = -0.2;
      const Y = (v: number) => pad.t + ((yMax - v) / (yMax - yMin)) * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of [1, 0.5, 0, -0.2]) {
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(v) + 0.5);
        ctx.lineTo(w - pad.r, Y(v) + 0.5);
        ctx.stroke();
        ctx.fillText(fmt(v, 1), pad.l - 6, Y(v));
      }
      for (let t = 0; t < n; t++) {
        const x = pad.l + t * bw + bw * 0.18, bwi = bw * 0.64;
        const raw = PATH_REWARDS[t], disc = terms[t];
        // the undiscounted reward as an outline, the discounted one filled
        ctx.strokeStyle = P.ink3;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(x + 0.5, Math.min(Y(raw), Y(0)) + 0.5, bwi - 1, Math.abs(Y(raw) - Y(0)));
        ctx.setLineDash([]);
        ctx.fillStyle = disc >= 0 ? P.good : P.bad;
        ctx.fillRect(x + bwi * 0.15, Math.min(Y(disc), Y(0)), bwi * 0.7, Math.max(1, Math.abs(Y(disc) - Y(0))));
        ctx.fillStyle = P.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font = `600 11px ${P.fontMono}`;
        ctx.fillText(fmt(disc, 3), x + bwi / 2, Math.min(Y(disc), Y(raw), Y(0)) - 3);
        ctx.fillStyle = P.ink3;
        ctx.textBaseline = 'top';
        ctx.font = `10px ${P.fontMono}`;
        ctx.fillText(`t = ${t}`, x + bwi / 2, pad.t + ph + 6);
        ctx.fillText(`×${Math.pow(gamma, t).toFixed(2)}`, x + bwi / 2, pad.t + ph + 20);
      }
    },
    [P, gamma, terms],
    { aspect: 2.2, maxHeight: 280 },
  );

  return (
    <Figure
      no={2}
      title="할인된 보상의 합"
      hint="할인율 γ를 바꿔 보세요"
      caption={<>출발 칸에서 위, 위, 오른쪽, 오른쪽, 오른쪽으로 미끄러지지 않고 가서 목표에 닿는 경로입니다. 점선 상자는 받은 보상 그대로, 칠한 막대는 γ<sup>t</sup>를 곱해 할인한 값이고, 아래의 ×숫자가 곱한 γ<sup>t</sup>입니다. 막대 위 숫자를 모두 더한 것이 이 경로의 할인된 보상 합(리턴)입니다.</>}
    >
      <div className="controls row">
        <Slider id="md-gamma" label="할인율 γ" value={gamma} min={0} max={1} step={0.01} onChange={setGamma} format={(v) => v.toFixed(2)} color="var(--c-ml)" />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`보상 다섯 개를 γ = ${gamma.toFixed(2)}로 할인한 값: ${terms.map((x) => fmt(x, 3)).join(', ')}. 합은 ${fmt(G, 4)}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <Readout label="이 경로의 리턴 G" value={fmt(G, 4)} color={G >= 0 ? 'var(--good)' : 'var(--bad)'} />
        <Readout label="매번 1씩 끝없이 받으면" value={isFinite(forever) ? fmt(forever, 1) : '무한대'} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: edit a policy, see its values ─────────────── */

function PolicyFigure() {
  const P = usePalette();
  const [gamma, setGamma] = useState(0.9);
  const [slip, setSlip] = useState(0.2);
  const g = useMemo(() => variant(BASE, { slip }), [slip]);
  const [policy, setPolicy] = useState<number[]>(() => BASE.cells.map(() => 1));
  const [sel, setSel] = useState(START);
  const { V, iters } = useMemo(() => evaluatePolicy(g, policy, gamma, 1e-9, 20000), [g, policy, gamma]);
  const live = liveStates(g);

  const setAction = (s: number, a: number) => setPolicy((p) => p.map((x, i) => (i === s ? a : x)));
  const onCell = (s: number) => {
    if (isTerminal(g, s)) return;
    if (s === sel) setAction(s, (policy[s] + 1) % 4);
    setSel(s);
  };
  const preset = (kind: 'right' | 'up' | 'best') => {
    if (kind === 'best') setPolicy(solveOptimal(g, gamma).policy.map((a) => a ?? 0));
    else setPolicy(BASE.cells.map(() => (kind === 'right' ? 1 : 0)));
  };

  const { wrapRef, canvasRef, onClick } = useGridCanvas(g, (ctx, L) => drawGrid(ctx, P, g, L, { values: V, vScale: 1, showNumbers: true, policy, highlight: sel }), [P, g, V, policy, sel], onCell);

  const outs = isTerminal(g, sel) ? [] : transitions(g, sel, policy[sel]);
  const paren = (v: number) => (v < 0 ? `(${fmt(v)})` : fmt(v));
  const term = (o: (typeof outs)[number]) => `${fmt(o.p, 1)}\\,\\bigl(${fmt(o.r)} + ${gamma.toFixed(2)} \\times ${o.done ? '0' : paren(V[o.s2])}\\bigr)`;
  const eq = outs.length ? `\\begin{aligned} V(${cellName(g, sel).replace(/[()]/g, '')}) &= ${outs.map(term).join(' \\\\ &\\quad + ')} \\\\ &= ${fmt(V[sel])} \\end{aligned}` : '';

  return (
    <Figure
      no={3}
      title="정책을 고치면 가치가 바뀝니다"
      hint="칸을 누르면 고르고, 한 번 더 누르면 화살표가 돌아갑니다"
      caption={<>화살표가 정책(각 칸에서 할 행동)이고, 칸의 색과 숫자가 그 정책을 따를 때의 가치 V(s)입니다. 초록일수록 높고 빨갈수록 낮습니다. 노란 테두리 칸의 가치를 벨만 방정식으로 풀어 아래에 적었습니다. 가치는 모든 칸의 식을 동시에 만족할 때까지 반복해서 계산했습니다.</>}
    >
      <div className="fig-split">
        <div className="rl-col">
          <div ref={wrapRef} className="canvas-box md-click" role="img" aria-label={`정책과 가치. 출발 칸의 가치 ${fmt(V[START])}. 선택한 칸 ${cellName(g, sel)}의 행동은 ${ACTION_KO[policy[sel]]}, 가치 ${fmt(V[sel])}.`} onClick={onClick}>
            <canvas ref={canvasRef} />
          </div>
          {eq ? <MB>{eq}</MB> : <div className="rl-note">끝나는 칸의 가치는 0으로 둡니다.</div>}
        </div>
        <div className="controls">
          <Seg value={policy[sel]} onChange={(a) => setAction(sel, a)} label={`${cellName(g, sel)} 칸의 행동`} options={ARROW.map((a, i) => ({ value: i, label: a }))} />
          <div className="btn-row">
            <Button small onClick={() => setSel(live[(live.indexOf(sel) - 1 + live.length) % live.length])} label="이전 칸">
              ◀ 칸
            </Button>
            <Button small onClick={() => setSel(live[(live.indexOf(sel) + 1) % live.length])} label="다음 칸">
              칸 ▶
            </Button>
          </div>
          <div className="btn-row">
            <Button small onClick={() => preset('right')}>
              모두 오른쪽
            </Button>
            <Button small onClick={() => preset('up')}>
              모두 위
            </Button>
            <Button small onClick={() => preset('best')}>
              최적 정책
            </Button>
          </div>
          <Slider id="md-gamma3" label="할인율 γ" value={gamma} min={0.5} max={0.99} step={0.01} onChange={setGamma} format={(v) => v.toFixed(2)} color="var(--c-ml)" />
          <Slider id="md-slip3" label="미끄러질 확률" value={slip} min={0} max={0.6} step={0.05} onChange={setSlip} format={(v) => `${Math.round(v * 100)}%`} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="출발 칸의 가치" value={fmt(V[START])} color={V[START] >= 0 ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="반복 횟수" value={iters} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: what the step reward does to the best policy ─────────────── */

function StepRewardFigure() {
  const P = usePalette();
  const [r, setR] = useState(-0.04);
  const g = useMemo(() => variant(BASE, { stepReward: r }), [r]);
  const { V, policy } = useMemo(() => solveOptimal(g, 1), [g]);
  const { wrapRef, canvasRef } = useCanvas2D((ctx, { w, h }) => drawGrid(ctx, P, g, gridLayout(g, w, h, 10), { values: V, vScale: 1, showNumbers: true, policy }), [P, g, V, policy], { aspect: 1.45, maxHeight: 340 });

  // (3, 2) is the cell left of the pit, (4, 3) the cell below it
  const besidePit = policy[6], belowPit = policy[11];
  const mood =
    besidePit === 1
      ? '살아 있는 것 자체가 너무 비쌉니다. 구덩이 옆 칸에서는 구덩이(−1)로 뛰어들어 빨리 끝내는 쪽을 고르고, 오른쪽 아래 칸도 위의 구덩이로 갑니다.'
      : besidePit === 3
        ? '걸음 비용이 아주 작아 시간을 써도 손해가 거의 없습니다. 구덩이 옆 칸은 일부러 벽 쪽(왼쪽)으로 부딪혀 제자리에 머뭅니다. 미끄러져도 위나 아래로 갈 뿐 구덩이로는 가지 않기 때문입니다.' + (belowPit === 2 ? ' 오른쪽 아래 칸도 아래쪽 가장자리로 부딪혀 구덩이를 피합니다.' : '')
        : '구덩이를 피해 돌아가되, 너무 오래 헤매지는 않는 중간의 행동입니다.';

  return (
    <Figure
      no={4}
      title="걸음 비용이 성격을 바꿉니다"
      hint="목표와 구덩이가 아닌 칸의 보상을 바꿔 보세요"
      caption={<>그림 1과 같은 세계(미끄러질 확률 20%)에서, 할인 없이(γ = 1) 기대 리턴이 가장 큰 정책을 계산해 화살표로 그렸습니다. 숫자는 그 정책을 따를 때의 가치입니다. 어떻게 계산하는지는 다음 장에서 다룹니다.</>}
    >
      <div className="controls row">
        <Slider id="md-step" label="한 걸음의 보상" value={r} min={-2} max={0} step={0.01} onChange={setR} format={(v) => fmt(v)} color="var(--bad)" />
        <div className="btn-row">
          {[-2, -0.4, -0.04, -0.01].map((v) => (
            <Button key={v} small onClick={() => setR(v)}>
              {fmt(v)}
            </Button>
          ))}
        </div>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`걸음마다 보상 ${fmt(r)}일 때의 최적 정책: ${liveStates(g).map((s) => `${cellName(g, s)} ${ACTION_KO[policy[s] ?? 0]}`).join(', ')}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="rl-note" aria-live="polite">
        {mood}
      </div>
      <Legend items={[{ color: 'var(--good)', label: '가치가 높음', shape: 'sq' }, { color: 'var(--bad)', label: '가치가 낮음', shape: 'sq' }]} />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Mdp() {
  return (
    <>
      <h2>행동이 다음 상황을 바꿀 때</h2>
      <p>
        <a href={lessonHref('ai-reinforcement-learning', 'bandits')}>앞 장</a>의 슬롯머신은 몇 번을 당겨도 그대로였습니다. 대부분의 문제는 그렇지 않습니다. 로봇이 한 걸음 내디디면 서 있는 자리가 바뀌고, 바둑에서 한 수를 두면 판이 바뀝니다. 지금의 행동이 다음에 놓일 <T en="state">상태</T>를 정하고, 보상은 여러 걸음 뒤에야 오기도 합니다. 이런 문제를 적는 표준 형식이 <T en="Markov decision process, MDP">마르코프 결정 과정</T>입니다.
      </p>
      <ul>
        <li>
          <strong>상태</strong> s: 에이전트가 처한 상황. 여기서는 격자의 칸입니다.
        </li>
        <li>
          <strong>행동</strong> a: 상태마다 고를 수 있는 것. 위, 오른쪽, 아래, 왼쪽.
        </li>
        <li>
          <strong>전이 확률</strong> P(s′ | s, a): s에서 a를 했을 때 s′로 갈 확률.
        </li>
        <li>
          <strong>보상</strong> r: 한 번 옮길 때마다 받는 수. 여기서는 들어간 칸이 정합니다.
        </li>
      </ul>
      <p>
        "마르코프"라는 이름은 다음 상태가 <strong>지금</strong> 상태와 행동에만 달려 있고, 어떻게 여기까지 왔는지에는 달려 있지 않다는 가정에서 왔습니다. <a href={lessonHref('math-probability', 'markov')}>마르코프 체인</a>에 행동과 보상을 더한 것입니다. 그림 1은 러셀(Stuart Russell)과 노빅(Peter Norvig)의 교과서에 나오는 작은 격자 세계입니다.
      </p>
      <TransitionFigure />
      <p>
        출발 칸 (1, 3)에서 위로 가려고 하면 80%는 위 칸 (1, 2)로 가지만, 10%는 오른쪽 (2, 3)으로 미끄러지고, 10%는 왼쪽으로 미끄러지다 가장자리에 부딪혀 제자리에 남습니다. 같은 행동이 확률적으로 여러 결과를 낳기 때문에, 에이전트는 "이 순서대로 움직인다"는 계획 대신 "어느 칸에 서면 무엇을 한다"는 규칙이 필요합니다. 이 규칙을 <T en="policy">정책</T> π(s)라고 합니다.
      </p>

      <h2>미래의 보상을 얼마나 쳐줄까</h2>
      <p>
        좋은 정책은 앞으로 받을 보상을 많이 모으는 정책입니다. 그런데 지금 받는 1점과 열 걸음 뒤에 받는 1점은 같은 가치일까요? 강화학습에서는 보통 t걸음 뒤의 보상에 <M>{'\\gamma^t'}</M>를 곱해 줄여서 더합니다. γ(감마)를 <T en="discount factor">할인율</T>이라고 하고, 이렇게 더한 값을 <T en="return">리턴</T>이라고 합니다.
      </p>
      <MB note="r_{t+1}은 t번째 행동 뒤에 받는 보상입니다.">{'G = r_1 + \\gamma r_2 + \\gamma^2 r_3 + \\cdots = \\sum_{t=0}^{\\infty} \\gamma^t r_{t+1}'}</MB>
      <ReturnFigure />
      <p>
        γ = 1이면 할인이 없어 리턴은 −0.04 × 4 + 1 = 0.84입니다. γ = 0.9이면 마지막 +1이 0.9⁴ ≈ 0.66으로 줄어 리턴은 0.5185이고, γ = 0.5이면 +1이 0.0625까지 줄어 걸음 비용을 이기지 못하고 리턴이 −0.0125로 음수가 됩니다. 할인율이 작은 에이전트는 먼 미래의 목표보다 당장의 비용을 더 무겁게 보는 근시안이 됩니다.
      </p>
      <p>
        γ를 1보다 작게 두는 이유는 셋입니다. 첫째, 끝나지 않는 과제에서도 리턴이 유한해집니다. 매번 1점씩 끝없이 받아도 합은 <M>{'1/(1-\\gamma)'}</M>이고, γ = 0.9면 10입니다. 둘째, 먼 미래일수록 예측이 불확실하니 덜 믿는 것이 합리적입니다. 셋째, 같은 보상이면 빨리 받는 쪽을 고르게 만듭니다. 사람의 돈에 이자가 붙는 것과 같은 이치입니다.
      </p>

      <h2>정책의 가치와 벨만 방정식</h2>
      <p>
        정책 π를 따를 때 상태 s에서 출발해 얻을 리턴의 기댓값을 그 상태의 <T en="value">가치</T> <M>{'V^\\pi(s)'}</M>라고 합니다. 가치는 서로 얽혀 있습니다. 지금 칸의 가치는 한 걸음 옮긴 뒤 받는 보상에, 도착한 칸의 가치를 γ만큼 할인해 더한 것의 평균이기 때문입니다. 이 관계를 <T en="Bellman equation">벨만 방정식</T>이라고 합니다.
      </p>
      <MB note="끝나는 칸에 들어가면 그 뒤의 가치는 0입니다.">{"V^\\pi(s) = \\sum_{s'} P(s' \\mid s, \\pi(s))\\,\\bigl[\\, r + \\gamma\\, V^\\pi(s') \\,\\bigr]"}</MB>
      <p>
        칸마다 식이 하나씩 있고, 모르는 값도 칸마다 하나씩이니 연립방정식입니다. 모든 가치를 0으로 두고 식의 오른쪽으로 왼쪽을 계속 고쳐 쓰면 답으로 수렴합니다. 이것을 <T en="policy evaluation">정책 평가</T>라고 합니다. 그림 3에서 정책을 고쳐 보세요.
      </p>
      <PolicyFigure />
      <p>
        처음 정책은 "모두 오른쪽"입니다. γ = 0.9일 때 출발 칸의 가치는 −0.58입니다. 아래 줄을 따라 오른쪽 끝 (4, 3)에 가면 오른쪽은 가장자리라 제자리에 머무르고, 10%씩 위로 미끄러질 때마다 구덩이에 빠지기 때문입니다. "최적 정책"을 누르면 출발 칸의 가치가 0.37로 오릅니다. 출발 칸에서 위로 올라가 맨 윗줄을 따라 목표로 가는 길입니다. 미끄러질 확률을 0으로 내리면 모든 가치가 오르고, 0.6까지 올리면 어떤 정책도 구덩이를 피하기 어려워집니다.
      </p>
      <Callout kind="note">
        벨만 방정식의 숫자를 직접 확인해 보세요. "모두 오른쪽" 정책에서 출발 칸은 80% 확률로 오른쪽 칸(가치 −0.65)으로, 10%는 위 칸(−0.18)으로 가고, 10%는 아래 가장자리에 부딪혀 제자리(−0.58)에 남습니다. 각각 −0.04를 받고 도착한 칸의 가치에 0.9를 곱해 평균을 내면 다시 −0.58이 됩니다. 모든 칸에서 이렇게 맞아떨어질 때까지 반복한 결과가 그림의 숫자입니다.
      </Callout>

      <h2>걸음 비용 하나로 바뀌는 성격</h2>
      <p>
        보상을 어떻게 정하느냐는 최적 행동을 크게 바꿉니다. 그림 4는 목표(+1)와 구덩이(−1)는 그대로 두고, 나머지 칸에 들어갈 때의 보상만 바꿨을 때 가장 좋은 정책이 어떻게 바뀌는지 보여 줍니다.
      </p>
      <StepRewardFigure />
      <p>
        기본값 −0.04에서는 출발 칸이 위로 올라가 맨 윗줄로 돌아가고, 오른쪽 아래 칸들은 구덩이 옆을 지나지 않으려고 왼쪽으로 돌아갑니다. −2까지 내리면 한 걸음이 구덩이보다 비싸서, 구덩이 옆 칸 (3, 2)는 구덩이로 뛰어듭니다. 반대로 −0.01까지 올리면 (3, 2)는 왼쪽 벽에 일부러 부딪힙니다. 제자리에 머물 확률이 80%나 되지만, 미끄러져도 구덩이로는 가지 않으니 시간이 걸려도 안전하게 돌아갑니다. 숫자 하나가 에이전트를 무모하게도, 지나치게 조심스럽게도 만듭니다. 보상을 정하는 일이 생각보다 어렵다는 이야기는 <a href={lessonHref('ai-reinforcement-learning', 'reward-design')}>보상 설계</a> 장에서 이어집니다.
      </p>
      <p>
        이 장에서는 최적 정책을 미리 계산된 결과로만 보았습니다. 세상의 규칙(전이 확률과 보상)을 다 알 때 벨만 방정식으로 최적 정책을 직접 구하는 법은 다음 장 <a href={lessonHref('ai-reinforcement-learning', 'dynamic-programming')}>가치 반복과 정책 반복</a>에서 다룹니다.
      </p>

      <Callout kind="key">
        마르코프 결정 과정은 상태, 행동, 전이 확률, 보상으로 문제를 적고, 다음 상태가 지금 상태와 행동에만 달려 있다고 가정합니다. 행동의 결과가 확률적이므로 에이전트는 상태마다 할 행동을 정한 정책을 찾습니다. 미래 보상은 할인율 γ로 줄여 더한 리턴으로 평가하고, 정책을 따를 때 기대 리턴인 가치는 벨만 방정식으로 서로 이어져 반복 계산으로 구할 수 있습니다. 보상을 조금만 바꿔도 최적 행동이 크게 달라집니다.
      </Callout>
      <Quiz
        q="할인율 γ를 0.99에서 0.5로 낮추면, 목표가 멀리 있고 걸음마다 작은 비용이 드는 격자 세계의 에이전트는 어떻게 바뀌기 쉬운가?"
        options={['목표를 더 강하게 원하게 된다', '먼 목표의 보상이 크게 줄어 보여서, 목표를 향해 가는 것보다 비용을 피하는 쪽을 고르기 쉽다', '전이 확률이 바뀐다', '아무 변화가 없다. γ는 계산을 빠르게 할 뿐이다']}
        answer={1}
        explain={<>γ = 0.5이면 다섯 걸음 뒤의 보상은 0.5⁴ = 0.0625배로 줄어듭니다. 그림 2에서 본 것처럼 목표의 +1이 걸음 비용 네 번을 이기지 못할 수 있습니다. 할인율은 에이전트가 얼마나 먼 미래까지 내다보는지를 정하는 값입니다.</>}
      />
    </>
  );
}
