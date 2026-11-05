import { useMemo, useState } from 'react';
import { Callout, Figure, Legend, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { localPoint, useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { backup, gridModel, greedyPolicy, isLive, policyIteration, valueIteration } from './dp';
import { ARROW, ACTION_KO, cellAt, drawGrid, gridLayout, presets, startState, variant, xy, type Grid } from './gridworld';
import './rl.css';
import './dp.css';

type PresetName = 'classic' | 'maze';
const PRESET_OPTS = [
  { value: 'classic' as const, label: '4×3 격자' },
  { value: 'maze' as const, label: '미로' },
];

const f2 = (v: number) => (Math.abs(v) < 0.0005 ? '0.000' : v.toFixed(3)).replace('-', '−');
const cellName = (g: Grid, s: number) => {
  const [x, y] = xy(g, s);
  return `(${x + 1}, ${g.h - y})`;
};

/** The world for a preset with the reader's slip (the maze is deterministic). */
function world(name: PresetName, slip: number): Grid {
  return name === 'classic' ? variant(presets.classic, { slip }) : presets.maze;
}

/* ─────────────── Figure 1: value iteration, sweep by sweep ─────────────── */

function ValueIterationFigure() {
  const P = usePalette();
  const [name, setName] = useState<PresetName>('classic');
  const [gamma, setGamma] = useState(0.9);
  const [slip, setSlip] = useState(0.2);
  const g = useMemo(() => world(name, slip), [name, slip]);
  const m = useMemo(() => gridModel(g), [g]);
  const frames = useMemo(() => valueIteration(m, gamma, 1e-4), [m, gamma]);
  const s = useStepper(frames.length, 3, `${name}-${gamma}-${slip}`, true);
  const fr = frames[s.i];
  const prev = frames[Math.max(0, s.i - 1)];
  const pol = useMemo(() => greedyPolicy(m, fr.V, gamma), [m, fr, gamma]);
  const liveCells = useMemo(() => Array.from({ length: m.n }, (_, k) => k).filter((k) => isLive(m, k)), [m]);
  const [picked, setPicked] = useState<number>(-1);
  const sel = liveCells.includes(picked) ? picked : startState(g);
  const terms = useMemo(() => backup(m, prev.V, gamma, sel), [m, prev, gamma, sel]);
  const best = terms.reduce((b, t) => (t.q > b.q ? t : b), terms[0]);

  const { wrapRef, canvasRef, size } = useCanvas2D(
    (ctx, { w, h }) => {
      const L = gridLayout(g, w, h, 6);
      drawGrid(ctx, P, g, L, { values: fr.V, vScale: 1, showNumbers: true, digits: 2, policy: s.i > 0 ? pol : undefined, highlight: sel });
    },
    [P, g, fr, pol, sel, s.i],
    { aspect: name === 'classic' ? 4 / 3 : 1, maxHeight: 380, minHeight: 200 },
  );

  const onClick = (e: React.MouseEvent) => {
    const c = canvasRef.current;
    if (!c) return;
    const p = localPoint(e, c);
    const k = cellAt(g, gridLayout(g, size.w, size.h, 6), p.x, p.y);
    if (k >= 0 && liveCells.includes(k)) setPicked(k);
  };

  const note =
    s.i === 0
      ? '처음에는 모든 칸의 가치가 0입니다. 재생하거나 ▶을 눌러 한 번씩 훑어 보세요.'
      : s.i === frames.length - 1
        ? `${s.i}번째 훑기에서 가장 큰 변화가 ${fr.delta.toExponential(1)}로 0.0001보다 작아져 멈췄습니다. 화살표가 최적 정책입니다.`
        : `${s.i}번째 훑기: 모든 칸을 한 번씩 고쳐 썼고, 가장 크게 바뀐 칸은 ${f2(fr.delta)}만큼 움직였습니다.`;

  return (
    <Figure
      no={1}
      title="가치 반복: 모든 칸을 한 번씩 고쳐 쓰기"
      hint="칸을 눌러 그 칸의 계산을 보세요"
      caption={
        <>
          칸의 숫자가 지금까지 계산한 가치 V(s)이고, 초록은 0보다 크고 빨강은 0보다 작습니다. 한 번 훑을 때마다 모든 칸이 오른쪽 식으로 동시에 고쳐집니다. 오른쪽 표는 노란 테두리 칸에서 네 방향 각각의 기댓값을 바로 앞 훑기의 가치로 계산한 것이고, 가장 큰 값이 그 칸의 새 가치가 됩니다. 4×3 격자는 걸음마다 −0.04를 받고, 원하는 방향 대신 옆으로 미끄러질 확률이 있습니다. 미로는 미끄러지지 않습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={name} onChange={(v) => setName(v)} options={PRESET_OPTS} />
        <Slider id="dp-gamma" label="할인율 γ" value={gamma} min={0.5} max={0.99} step={0.01} onChange={setGamma} format={(v) => v.toFixed(2)} />
        <Slider id="dp-slip" label="미끄러질 확률" value={slip} min={0} max={0.4} step={0.05} onChange={setSlip} format={(v) => `${Math.round(v * 100)}%`} />
      </div>
      <div className="fig-split">
        <div className="rl-col">
          <div ref={wrapRef} className="canvas-box" onClick={onClick} role="img" aria-label={`${name === 'classic' ? '4×3 격자' : '미로'}의 가치 반복 ${s.i}번째 훑기. 출발 칸의 가치는 ${f2(fr.V[startState(g)])}, 가장 큰 변화는 ${f2(fr.delta)}입니다.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="rl-note" aria-live="polite">
            {note}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="dp-speed" maxSpeed={10} />
          <label className="dpg-pick">
            <span>계산을 볼 칸</span>
            <select value={sel} onChange={(e) => setPicked(Number(e.target.value))}>
              {liveCells.map((k) => (
                <option key={k} value={k}>
                  {cellName(g, k)}
                  {k === startState(g) ? ' 출발' : ''}
                </option>
              ))}
            </select>
          </label>
          <table className="dpg-backup" aria-label={`칸 ${cellName(g, sel)}에서 방향별 기댓값`}>
            <thead>
              <tr>
                <th>방향</th>
                <th>Σ p·(r + γ·V(s′))</th>
                <th>값</th>
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => (
                <tr key={t.a} data-best={s.i > 0 && t === best ? '' : undefined}>
                  <td>
                    {ARROW[t.a]} {ACTION_KO[t.a]}
                  </td>
                  <td className="mono">
                    {t.outcomes.map((o, k) => (
                      <span key={k} className="dpg-term">
                        {k ? '+ ' : ''}
                        {o.p.toFixed(1)}·({o.r.toFixed(2).replace('-', '−')} + {gamma.toFixed(2)}·{o.v.toFixed(2).replace('-', '−')})
                      </span>
                    ))}
                  </td>
                  <td className="mono">{f2(t.q)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="훑기" value={`${s.i} / ${frames.length - 1}`} />
            <Readout label="가장 큰 변화" value={s.i === 0 ? '−' : fr.delta < 0.001 ? fr.delta.toExponential(1) : f2(fr.delta)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: values settle late, the policy early ─────────────── */

const GAMMAS = [0.5, 0.7, 0.9, 0.99];

function ConvergenceFigure() {
  const P = usePalette();
  const [slip, setSlip] = useState(0.2);
  const [gi, setGi] = useState(2);
  const runs = useMemo(() => {
    const m = gridModel(variant(presets.classic, { slip }));
    return GAMMAS.map((gamma) => {
      const fr = valueIteration(m, gamma, 1e-4, 2000);
      const fin = greedyPolicy(m, fr[fr.length - 1].V, gamma).join();
      const settle = fr.findIndex((x) => greedyPolicy(m, x.V, gamma).join() === fin);
      return { gamma, deltas: fr.slice(1).map((x) => x.delta), settle };
    });
  }, [slip]);
  const cur = runs[gi];
  const maxK = Math.max(...runs.map((r) => r.deltas.length));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 54, r: 14, t: 14, b: 36 };
      const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const lo = -5, hi = 0; // log10 of the change
      const X = (k: number) => pad.l + (k / maxK) * pw;
      const Y = (d: number) => pad.t + ((hi - Math.max(lo, Math.log10(Math.max(d, 1e-9)))) / (hi - lo)) * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let e = lo; e <= hi; e++) {
        const y = Y(10 ** e);
        ctx.beginPath();
        ctx.moveTo(pad.l, y + 0.5);
        ctx.lineTo(w - pad.r, y + 0.5);
        ctx.stroke();
        ctx.fillText(e === 0 ? '1' : `10${'⁻'}${'⁰¹²³⁴⁵'[-e]}`, pad.l - 6, y);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const stepK = maxK > 30 ? 10 : 5;
      for (let k = 0; k <= maxK; k += stepK) ctx.fillText(String(k), X(k), h - pad.b + 6);
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.fillText('훑기 횟수', pad.l + pw / 2, h - 16);
      // the stopping threshold
      ctx.strokeStyle = alpha(P.bad, 0.7);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(1e-4) + 0.5);
      ctx.lineTo(w - pad.r, Y(1e-4) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.bad;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.font = `10px ${P.fontBody}`;
      ctx.fillText('멈추는 기준 0.0001', w - pad.r, Y(1e-4) - 2);
      runs.forEach((r, i) => {
        const on = i === gi;
        ctx.strokeStyle = on ? P.accent : alpha(P.ink3, 0.45);
        ctx.lineWidth = on ? 2.5 : 1.2;
        ctx.beginPath();
        r.deltas.forEach((d, k) => (k ? ctx.lineTo(X(k + 1), Y(d)) : ctx.moveTo(X(k + 1), Y(d))));
        ctx.stroke();
        const last = r.deltas.length;
        ctx.fillStyle = on ? P.accent : P.ink3;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `${on ? 600 : 400} 10px ${P.fontMono}`;
        ctx.fillText(`γ=${r.gamma}`, X(last) + 4, Y(r.deltas[last - 1]));
      });
      // where the greedy policy stopped changing
      const x = X(cur.settle);
      ctx.strokeStyle = P.good;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, h - pad.b);
      ctx.stroke();
      ctx.fillStyle = P.good;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `600 10px ${P.fontBody}`;
      ctx.fillText('정책이 더 바뀌지 않음', x + 4, pad.t + 2);
    },
    [P, runs, gi, maxK, cur],
    { aspect: 2, maxHeight: 300, minHeight: 200 },
  );

  return (
    <Figure
      no={2}
      title="가치는 늦게, 정책은 일찍 정해집니다"
      hint="할인율을 골라 보세요"
      caption={<>4×3 격자에서 가치 반복을 돌리며 훑기마다 가장 크게 바뀐 칸의 변화량을 로그 눈금으로 그렸습니다. 초록 세로선은 그 뒤로 화살표(탐욕 정책)가 한 칸도 바뀌지 않은 훑기입니다.</>}
    >
      <div className="controls row">
        <Seg value={gi} onChange={setGi} options={GAMMAS.map((gm, i) => ({ value: i, label: `γ = ${gm}` }))} />
        <Slider id="dp-slip2" label="미끄러질 확률" value={slip} min={0} max={0.4} step={0.05} onChange={setSlip} format={(v) => `${Math.round(v * 100)}%`} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`할인율 ${cur.gamma}에서 가치 반복은 ${cur.deltas.length}번 훑고 멈췄고, 정책은 ${cur.settle}번째 훑기 뒤로 바뀌지 않았습니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Readout label="멈출 때까지 훑기" value={`${cur.deltas.length}번`} />
        <Readout label="정책이 정해진 훑기" value={`${cur.settle}번째`} color="var(--good)" />
        <Readout label="한 번 훑을 때 계산" value="9칸 × 4방향" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: policy iteration ─────────────── */

function PolicyIterationFigure() {
  const P = usePalette();
  const [name, setName] = useState<PresetName>('classic');
  const g = useMemo(() => world(name, 0.2), [name]);
  const m = useMemo(() => gridModel(g), [g]);
  const steps = useMemo(() => policyIteration(m, 0.9), [m]);
  const vi = useMemo(() => valueIteration(m, 0.9, 1e-4), [m]);
  // frames: for each iteration, "evaluated" then "improved"
  const frames = useMemo(() => steps.flatMap((st) => [{ st, phase: 'eval' as const }, { st, phase: 'improve' as const }]), [steps]);
  const s = useStepper(frames.length, 1, name);
  const { st, phase } = frames[s.i];
  const live = useMemo(() => Array.from({ length: m.n }, (_, k) => k).filter((k) => isLive(m, k)), [m]);
  const changedCells = phase === 'improve' ? live.filter((k) => st.improved[k] !== st.pi[k]) : [];
  const shownPolicy = phase === 'eval' ? st.pi : st.improved;
  const evalTotal = steps.reduce((t, x) => t + x.evalSweeps, 0);
  const work = { vi: (vi.length - 1) * live.length * 4, pi: evalTotal * live.length + steps.length * live.length * 4 };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const L = gridLayout(g, w, h, 6);
      drawGrid(ctx, P, g, L, { values: st.V, vScale: 1, showNumbers: true, digits: 2, policy: shownPolicy });
      ctx.strokeStyle = P.hl;
      ctx.lineWidth = 3;
      for (const k of changedCells) {
        const [x, y] = xy(g, k);
        ctx.strokeRect(L.x + x * L.cell + 1.5, L.y + y * L.cell + 1.5, L.cell - 3, L.cell - 3);
      }
    },
    [P, g, st, shownPolicy, changedCells.join()],
    { aspect: name === 'classic' ? 4 / 3 : 1, maxHeight: 360, minHeight: 200 },
  );

  const note =
    phase === 'eval'
      ? `${st.iter + 1}번째 평가: 화살표의 정책을 그대로 따른다고 하고 가치를 ${st.evalSweeps}번 훑어 계산했습니다.${st.iter === 0 ? ' 처음 정책은 "어디서나 위로"입니다.' : ''}`
      : st.changed
        ? `${st.iter + 1}번째 개선: 방금 구한 가치로 칸마다 가장 좋은 방향을 다시 골랐더니 ${st.changed}칸의 화살표가 바뀌었습니다(노란 테두리). 바뀐 정책을 다시 평가합니다.`
        : `${st.iter + 1}번째 개선: 어느 칸도 화살표가 바뀌지 않았습니다. 이 정책이 최적이고, 여기서 멈춥니다.`;

  return (
    <Figure
      no={3}
      title="정책 반복: 평가하고, 고치고, 다시 평가하기"
      hint="한 단계씩 넘겨 보세요"
      caption={<>할인율 0.9, 4×3 격자는 미끄러질 확률 20%입니다. 평가 단계에서는 화살표의 정책을 고정하고 그 정책의 가치를 끝까지 계산하고, 개선 단계에서는 그 가치로 칸마다 가장 좋은 방향을 다시 고릅니다. 아래 계산 횟수는 "한 칸에서 한 방향의 기댓값을 계산한 횟수"를 센 것입니다.</>}
    >
      <div className="controls row">
        <Seg value={name} onChange={(v) => setName(v)} options={PRESET_OPTS} />
      </div>
      <div className="fig-split">
        <div className="rl-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`정책 반복 ${st.iter + 1}번째 ${phase === 'eval' ? '평가' : '개선'}. ${phase === 'improve' ? `${st.changed}칸의 방향이 바뀌었습니다.` : ''}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="rl-note" data-good={phase === 'improve' && st.changed === 0 ? '' : undefined} aria-live="polite">
            {note}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="pi-speed" maxSpeed={4} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="개선 횟수" value={`${steps.length}번`} />
            <Readout label="평가에 쓴 훑기" value={`${evalTotal}번`} />
          </div>
          <table className="dpg-compare">
            <thead>
              <tr>
                <th></th>
                <th>가치 반복</th>
                <th>정책 반복</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>반복</td>
                <td className="mono">{vi.length - 1}번 훑기</td>
                <td className="mono">{steps.length}번 개선</td>
              </tr>
              <tr>
                <td>기댓값 계산</td>
                <td className="mono">{work.vi.toLocaleString('ko-KR')}</td>
                <td className="mono">{work.pi.toLocaleString('ko-KR')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--good)', label: '가치 > 0', shape: 'sq' },
          { color: 'var(--bad)', label: '가치 < 0', shape: 'sq' },
          { color: 'var(--hl)', label: '방금 방향이 바뀐 칸', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function DynamicProgramming() {
  return (
    <>
      <h2>규칙을 다 안다면</h2>
      <p>
        <a href={lessonHref('ai-reinforcement-learning', 'mdp')}>앞 장</a>에서 문제를 마르코프 결정 과정으로 적었습니다. 칸마다 할 수 있는 행동, 행동했을 때 어느 칸으로 갈 확률, 그때 받는 보상, 그리고 미래의 보상을 얼마나 깎아서 셀지 정하는 할인율 γ입니다. 이 장에서는 이 규칙을 <strong>모두 안다고</strong> 가정합니다. 게임 판처럼 규칙이 정해진 세계, 또는 시뮬레이터 안의 세계가 그렇습니다. 그러면 직접 움직여 볼 필요 없이 종이 위의 계산만으로 가장 좋은 행동을 찾을 수 있습니다.
      </p>
      <p>
        출발점은 <T en="Bellman optimality equation">벨만 최적 방정식</T>입니다. 칸 s의 최적 가치 V*(s)는, 가능한 행동 중에서 "이번 보상과 도착한 칸의 최적 가치를 할인해 더한 것의 기댓값"이 가장 큰 행동의 그 값입니다.
      </p>
      <MB note="p(s′, r | s, a): 칸 s에서 행동 a를 했을 때 칸 s′에 도착하며 보상 r을 받을 확률">{String.raw`V^*(s) = \max_a \sum_{s',\,r} p(s', r \mid s, a)\,\bigl[\,r + \gamma\, V^*(s')\,\bigr]`}</MB>
      <p>
        이 식은 V*를 V*로 정의하므로 바로 풀 수는 없습니다. 하지만 아무 값에서나 시작해 오른쪽을 계산해서 왼쪽에 넣기를 되풀이하면 참값에 다가갑니다. 이것이 <T en="value iteration">가치 반복</T>입니다.
      </p>

      <h2>가치 반복: 한 번에 한 걸음씩 더 멀리 보기</h2>
      <p>
        그림 1은 3줄 4칸짜리 격자 세계입니다. 오른쪽 위의 +1 칸에 들어가면 1을 받고 끝나고, 그 아래 −1 칸에 들어가면 −1을 받고 끝납니다. 그 밖의 걸음은 −0.04씩 받아서 빨리 끝내는 편이 좋고, 가려는 방향 대신 왼쪽이나 오른쪽으로 미끄러질 확률이 모두 합쳐 20%입니다. 처음에는 모든 가치를 0으로 두고, 재생을 눌러 한 번씩 <T en="sweep">훑어</T> 보세요.
      </p>
      <ValueIterationFigure />
      <p>
        첫 번째 훑기 뒤에는 +1 칸 바로 왼쪽 칸만 0.79가 되고 나머지는 모두 −0.04입니다. 한 걸음으로 닿는 보상만 보이기 때문입니다. 두 번째 훑기에서는 두 걸음 떨어진 칸까지, 세 번째에는 세 걸음 떨어진 칸까지 좋은 소식이 퍼집니다. k번 훑은 가치는 "앞으로 k걸음만 본다면"의 최적 가치인 셈입니다. 기본 설정에서는 16번째 훑기에서 가장 큰 변화가 0.0001 밑으로 내려가 멈추고, 출발 칸의 가치는 0.374입니다.
      </p>
      <p>
        출발 칸을 눌러 오른쪽 표를 보세요. 위로 가면 80% 확률로 위 칸, 10%씩 오른쪽과 제자리(왼쪽은 격자 끝이라 움직이지 못함)로 갑니다. 네 방향 중 위가 0.374로 가장 크므로 출발 칸의 화살표는 위입니다. 오른쪽으로 가면 바로 아래쪽 줄을 따라 가는 짧은 길이지만, −1 칸 옆을 지나야 해서 기댓값이 0.273으로 낮습니다. 미끄러질 확률을 0%로 내리면 어느 길이든 안전하므로 값들이 커지고, 40%로 올리면 −1 옆의 칸에서는 일부러 벽 쪽으로 걸어 미끄러짐을 피하는 화살표가 나타납니다.
      </p>
      <p>
        <strong>미로</strong>로 바꾸면 가치가 출구에서 한 칸씩 퍼져 나가는 모습이 더 잘 보입니다. 출발 칸의 가치는 10번째 훑기에서 처음 0보다 커지는데, 출발 칸에서 출구까지 가장 짧은 길이 정확히 10걸음이기 때문입니다.
      </p>

      <h2>가치는 늦게, 정책은 일찍</h2>
      <p>
        우리가 원하는 것은 가치 자체가 아니라 화살표, 즉 칸마다 무엇을 할지 정한 <T en="policy">정책</T>입니다. 그림 2는 훑기마다 가치가 얼마나 바뀌는지를 로그 눈금으로 그린 것입니다.
      </p>
      <ConvergenceFigure />
      <p>
        할인율 0.9에서 가치는 16번 훑어야 멈추지만, 화살표는 3번째 훑기 뒤로 하나도 바뀌지 않습니다. 가치가 아직 조금씩 움직여도 칸마다 어느 방향이 가장 좋은지의 순서는 일찍 정해지기 때문입니다. 할인율을 0.99로 올리면 먼 미래까지 셈에 넣으므로 정책이 정해지는 데 8번, 멈추는 데 20번이 걸립니다. 변화량의 선이 로그 눈금에서 거의 곧게 내려가는 것은 오차가 훑을 때마다 일정한 비율로 줄어든다는 뜻입니다. 이 비율은 할인율 γ보다 크지 않아서, γ가 1에 가까울수록 느려집니다.
      </p>

      <h2>정책 반복: 평가하고 고치기</h2>
      <p>
        정책이 일찍 정해진다면, 처음부터 정책을 중심에 놓을 수도 있습니다. <T en="policy iteration">정책 반복</T>은 두 단계를 번갈아 합니다. <strong>평가</strong>에서는 지금 정책을 고정하고 그 정책을 따를 때의 가치를 끝까지 계산합니다. 행동이 정해져 있으니 max 없이 한 방향의 기댓값만 계산하면 됩니다. <strong>개선</strong>에서는 그 가치를 보고 칸마다 가장 좋은 방향으로 화살표를 바꿉니다. 바뀐 화살표가 하나도 없으면 그 정책이 최적입니다.
      </p>
      <PolicyIterationFigure />
      <p>
        "어디서나 위로"에서 시작하면 첫 개선에서 6칸이 바뀌고, 두 번째 개선에서 1칸이 바뀌고, 세 번째 개선에서는 아무것도 바뀌지 않아 끝납니다. 개선은 3번뿐이지만 평가에 훑기를 모두 65번 썼습니다. 정책 하나하나를 끝까지 평가하기 때문입니다. 그래서 이 작은 격자에서는 기댓값 계산 횟수가 693번으로 가치 반복의 576번보다 오히려 많습니다. 정책 반복의 강점은 개선 횟수가 매우 적다는 데 있고, 평가를 연립방정식으로 한 번에 풀거나 앞 평가의 가치에서 이어 시작하면 큰 문제에서는 더 빨라집니다. 실제로는 평가를 몇 번만 훑고 개선으로 넘어가는 중간 방식도 많이 씁니다.
      </p>
      <Callout kind="intuition">
        가치 반복은 "한 걸음 더 멀리 보기"를 되풀이하고, 정책 반복은 "지금 계획대로 하면 어떻게 될지 끝까지 따져 보고, 더 나은 계획으로 바꾸기"를 되풀이합니다. 둘 다 같은 벨만 방정식에서 나왔고, 같은 최적 정책에 도착합니다.
      </Callout>

      <h2>왜 여기서 멈출 수 없는가</h2>
      <p>
        두 방법 모두 한 번 훑을 때마다 모든 상태와 모든 행동, 그리고 행동의 모든 결과를 계산합니다. 4×3 격자는 상태가 9개, 미로는 25개라 순식간이지만, 상태 수는 문제가 조금만 커져도 폭발합니다.
      </p>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>문제</th>
              <th>상태 수 (대략)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>그림 1의 4×3 격자</td>
              <td className="mono">9</td>
            </tr>
            <tr>
              <td>그림 1의 미로</td>
              <td className="mono">25</td>
            </tr>
            <tr>
              <td>틱택토의 가능한 판</td>
              <td className="mono">약 5천</td>
            </tr>
            <tr>
              <td>체스의 가능한 판</td>
              <td className="mono">약 10⁴⁴</td>
            </tr>
            <tr>
              <td>19×19 바둑의 가능한 판</td>
              <td className="mono">약 10¹⁷⁰</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        체스와 바둑의 상태 수는 알려진 추정값의 자릿수만 적었습니다. 관측 가능한 우주의 원자 수가 대략 10⁸⁰개로 추정되니, 이런 표를 한 번 훑는 것조차 불가능합니다. 게다가 대부분의 실제 문제에서는 전이 확률을 아예 모릅니다. 로봇의 바퀴가 미끄러질 확률이나 사용자가 다음에 무엇을 누를 확률은 적어 둔 표가 없습니다. 그래서 다음 장에서는 규칙 대신 직접 겪은 경험으로 가치를 배우는 방법으로 넘어갑니다. 아이디어는 그대로입니다. 벨만 방정식의 오른쪽을 계산하는 대신, 한 번 겪은 결과를 그 값의 표본으로 씁니다.
      </p>

      <Callout kind="key">
        전이 확률과 보상을 모두 알면 벨만 최적 방정식 V*(s) = maxₐ Σ p (r + γV*(s′))을 반복해서 최적 가치와 최적 정책을 계산할 수 있습니다. 가치 반복은 모든 칸에 이 식을 되풀이해 적용하고, k번 훑은 가치는 k걸음 앞까지 본 가치입니다. 정책 반복은 정책을 평가하고 탐욕적으로 고치기를 번갈아 하며, 보통 몇 번의 개선만에 끝납니다. 어느 쪽이든 한 번 훑는 데 상태 수 × 행동 수에 비례하는 계산이 들어서, 상태가 아주 많거나 규칙을 모르는 문제에는 경험에서 배우는 방법이 필요합니다.
      </Callout>
      <Quiz
        q="가치 반복을 0에서 시작해 정확히 3번 훑었다. 출구에서 5걸음 떨어진 칸의 가치는 어떤 상태일까? (걸음마다 작은 벌점이 있고, 출구에 들어가면 +1)"
        options={['이미 최적 가치와 같다', '출구의 +1이 아직 닿지 않아, 걸음 벌점만 반영된 음수다', '0이다. 세 번 훑어서는 아무 칸도 바뀌지 않는다', '출구의 +1이 할인되어 정확히 γ⁵이다']}
        answer={1}
        explain={<>k번 훑은 가치는 k걸음 안에 일어나는 일만 반영합니다. 3번 훑은 뒤에는 출구에서 3걸음 안쪽 칸까지만 +1이 퍼졌고, 5걸음 떨어진 칸은 그동안 받은 걸음 벌점만큼 음수입니다. 그림 1의 미로에서 출발 칸이 10번째 훑기에 처음 양수가 되는 것과 같은 이유입니다.</>}
      />
    </>
  );
}
