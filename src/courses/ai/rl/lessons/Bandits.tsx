import { useMemo, useState } from 'react';
import { Button, Callout, Figure, Legend, MB, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { rng } from '../../../../lib/math';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { ALGO_KO, average, betaPdf, makeArms, play, type Algo, type Snapshot } from './bandit';
import './rl.css';
import './bandits.css';

const K = 5;
const SEED = 5;
const STEPS = 1000;
const RUNS = 200;
const ARM_CSS = ['var(--accent)', 'var(--good)', 'var(--bad)', 'var(--c-stats-2)', 'var(--c-dl)'];
const armColor = (P: Palette, i: number) => [P.accent, P.good, P.bad, P.stats2, P.dl][i % 5];
const ARM_NAME = ['A', 'B', 'C', 'D', 'E'];

/** Outcome of the k-th pull of arm i on machine set `seed`: the same every time, so replays agree. */
const pullOutcome = (seed: number, i: number, k: number, p: number) => (rng(seed * 1000003 + i * 10007 + k * 31 + 1)() < p ? 1 : 0);

/* ─────────────── Figure 1: pull the arms yourself ─────────────── */

function ManualFigure() {
  const [seed, setSeed] = useState(SEED);
  const p = useMemo(() => makeArms(K, seed), [seed]);
  const [n, setN] = useState<number[]>(() => new Array(K).fill(0));
  const [wins, setWins] = useState<number[]>(() => new Array(K).fill(0));
  const [last, setLast] = useState<{ arm: number; win: number } | null>(null);
  const [reveal, setReveal] = useState(false);
  const total = n.reduce((a, b) => a + b, 0);
  const got = wins.reduce((a, b) => a + b, 0);
  const best = Math.max(...p);
  const pull = (i: number) => {
    const w = pullOutcome(seed, i, n[i], p[i]);
    setN((x) => x.map((v, j) => (j === i ? v + 1 : v)));
    setWins((x) => x.map((v, j) => (j === i ? v + w : v)));
    setLast({ arm: i, win: w });
  };
  const reset = (newSeed = seed) => {
    setSeed(newSeed);
    setN(new Array(K).fill(0));
    setWins(new Array(K).fill(0));
    setLast(null);
    setReveal(false);
  };
  const expected = n.reduce((a, c, i) => a + c * p[i], 0);
  const note =
    total === 0
      ? '기계를 골라 당겨 보세요. 한 번 당길 때마다 1점(당첨) 아니면 0점입니다. 몇 번 당겨 봐야 어느 기계가 좋은지 알 수 있을까요?'
      : `${total}번 당겨 ${got}점을 얻었습니다. 방금 ${ARM_NAME[last!.arm]}에서 ${last!.win ? '당첨' : '꽝'}.` +
        (reveal ? ` 처음부터 가장 좋은 기계만 당겼다면 평균 ${(total * best).toFixed(1)}점을 기대할 수 있었으니, 고르는 데 쓴 비용(후회)은 약 ${(total * best - expected).toFixed(1)}점입니다.` : '');

  return (
    <Figure
      no={1}
      title="슬롯머신 다섯 대"
      hint="직접 당겨 보고, 어느 기계가 좋은지 맞혀 보세요"
      caption={<>기계마다 당첨 확률이 정해져 있지만 보이지 않습니다. 막대는 지금까지의 당첨 비율(추정값)이고, 막대 옆 숫자는 당긴 횟수입니다. 정답 보기를 누르면 실제 확률이 세로선으로 나타납니다. 같은 기계 묶음에서 같은 순서로 당기면 결과도 같습니다.</>}
    >
      <div className="bd-machines">
        {p.map((pi, i) => {
          const est = n[i] ? wins[i] / n[i] : null;
          return (
            <div key={i} className="bd-machine" style={{ ['--c' as string]: ARM_CSS[i] }} data-last={last?.arm === i || undefined}>
              <div className="bd-head">
                <strong>{ARM_NAME[i]}</strong>
                <span className="mono">{n[i]}번</span>
              </div>
              <div className="bd-bar" aria-hidden="true">
                {est !== null && <i style={{ width: `${est * 100}%` }} />}
                {reveal && <b style={{ left: `${pi * 100}%` }} />}
              </div>
              <div className="bd-est mono">
                {est === null ? '추정 없음' : `${wins[i]}/${n[i]} = ${est.toFixed(2)}`}
                {reveal && <span> · 실제 {pi.toFixed(2)}</span>}
              </div>
              <Button small primary onClick={() => pull(i)} label={`기계 ${ARM_NAME[i]} 당기기`}>
                당기기
              </Button>
            </div>
          );
        })}
      </div>
      <div className="controls row">
        <div className="btn-row">
          <Button small onClick={() => setReveal((v) => !v)}>
            {reveal ? '정답 가리기' : '정답 보기'}
          </Button>
          <Button small onClick={() => reset()} disabled={total === 0}>
            처음부터
          </Button>
          <Button small onClick={() => reset(seed + 1)}>
            다른 기계 묶음
          </Button>
        </div>
        <div className="readouts" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <Readout label="당긴 횟수" value={total} />
          <Readout label="얻은 점수" value={got} />
        </div>
      </div>
      <div className="rl-note" aria-live="polite">
        {note}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: four strategies, 200 runs each ─────────────── */

const ALGOS: Algo[] = ['greedy', 'egreedy', 'ucb', 'thompson'];
const ALGO_CSS: Record<Algo, string> = { greedy: 'var(--ink-3)', egreedy: 'var(--accent)', ucb: 'var(--c-stats-2)', thompson: 'var(--good)' };
const algoColor = (P: Palette, a: Algo) => ({ greedy: P.ink3, egreedy: P.accent, ucb: P.stats2, thompson: P.good })[a];

function CompareFigure() {
  const P = usePalette();
  const [eps, setEps] = useState(0.1);
  const [view, setView] = useState<'reward' | 'regret'>('regret');
  const p = useMemo(() => makeArms(K, SEED), []);
  const fixed = useMemo(() => ({ greedy: average('greedy', p, STEPS, RUNS, 1), ucb: average('ucb', p, STEPS, RUNS, 1), thompson: average('thompson', p, STEPS, RUNS, 1) }), [p]);
  const eg = useMemo(() => average('egreedy', p, STEPS, RUNS, 1, eps), [p, eps]);
  const res: Record<Algo, ReturnType<typeof average>> = { ...fixed, egreedy: eg };
  const best = Math.max(...p);

  // a 25-step moving average keeps the reward curves readable
  const smooth = (xs: number[], wnd = 25) => xs.map((_, t) => {
    const a = Math.max(0, t - wnd + 1);
    let s = 0;
    for (let k = a; k <= t; k++) s += xs[k];
    return s / (t - a + 1);
  });
  const series = useMemo(() => {
    const out = {} as Record<Algo, number[]>;
    for (const a of ALGOS) out[a] = view === 'reward' ? smooth(res[a].reward) : res[a].cumRegret;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, fixed, eg]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 46, r: 14, t: 14, b: 34 };
      const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const yMax = view === 'reward' ? 0.85 : Math.ceil(Math.max(...ALGOS.map((a) => series[a][STEPS - 1])) / 50) * 50;
      const yMin = view === 'reward' ? 0.25 : 0;
      const X = (t: number) => pad.l + (t / (STEPS - 1)) * pw;
      const Y = (v: number) => pad.t + ph - ((v - yMin) / (yMax - yMin)) * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const tick = view === 'reward' ? 0.15 : yMax <= 150 ? 25 : 50;
      for (let v = yMin; v <= yMax + 1e-9; v += tick) {
        const y = Y(v) + 0.5;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(w - pad.r, y);
        ctx.stroke();
        ctx.fillText(view === 'reward' ? v.toFixed(2) : String(Math.round(v)), pad.l - 6, y);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let t = 0; t <= STEPS; t += 250) ctx.fillText(String(t), X(Math.min(t, STEPS - 1)), pad.t + ph + 6);
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.fillText('당긴 횟수', pad.l + pw / 2, pad.t + ph + 19);
      if (view === 'reward') {
        // the best machine's rate: the ceiling of average reward
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = P.ink3;
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(best));
        ctx.lineTo(w - pad.r, Y(best));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = P.ink3;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.font = `10px ${P.fontBody}`;
        ctx.fillText(`가장 좋은 기계 ${best.toFixed(2)}`, w - pad.r, Y(best) - 3);
      }
      for (const a of ALGOS) {
        ctx.strokeStyle = algoColor(P, a);
        ctx.lineWidth = a === 'egreedy' ? 2.5 : 2;
        ctx.beginPath();
        series[a].forEach((v, t) => (t ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v))));
        ctx.stroke();
      }
    },
    [P, series, view, best],
    { aspect: 1.9, maxHeight: 360 },
  );

  const fmt = (a: Algo) => res[a].cumRegret[STEPS - 1].toFixed(1);
  return (
    <Figure
      no={2}
      title="네 가지 전략, 각각 200번씩"
      hint="ε를 바꿔 보고, 평균 보상과 누적 후회를 번갈아 보세요"
      caption={
        <>
          그림 1의 첫 기계 묶음(당첨 확률 {p.map((x) => x.toFixed(2)).join(', ')})을 전략마다 {RUNS}번씩 {STEPS}번 당긴 평균입니다. 평균 보상은 최근 25번의 이동 평균이고, 누적 후회는 매번 가장 좋은 기계 대신 고른 기계 때문에 잃은 기대 점수를 더한 값입니다. 탐욕 전략은 추정값이 같으면 무작위로 고르고, UCB1은 처음에 모든 기계를 한 번씩 당깁니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={view} onChange={setView} options={[{ value: 'regret', label: '누적 후회' }, { value: 'reward', label: '평균 보상' }]} />
        <Slider id="bd-eps" label="ε (무작위로 고를 확률)" value={eps} min={0.01} max={0.3} step={0.01} onChange={setEps} format={(v) => v.toFixed(2)} color="var(--accent)" />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${view === 'regret' ? '누적 후회' : '평균 보상'} 그래프. ${STEPS}번 뒤 누적 후회: ${ALGOS.map((a) => `${ALGO_KO[a]} ${fmt(a)}`).join(', ')}.`}>
        <canvas ref={canvasRef} />
      </div>
      <Legend items={ALGOS.map((a) => ({ color: ALGO_CSS[a], label: a === 'egreedy' ? `ε-탐욕 (ε = ${eps.toFixed(2)})` : ALGO_KO[a], shape: 'ln' as const }))} />
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {ALGOS.map((a) => (
          <Readout key={a} label={`${ALGO_KO[a]}: 후회 / 최고 기계 찾음`} value={`${fmt(a)} / ${Math.round(res[a].foundBest * 100)}%`} color={ALGO_CSS[a]} />
        ))}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: Thompson sampling's beliefs ─────────────── */

const TS_STEPS = 200;

function ThompsonFigure() {
  const P = usePalette();
  const p = useMemo(() => makeArms(K, SEED), []);
  const snaps = useMemo(() => {
    const rec: Snapshot[] = [];
    const run = play('thompson', p, TS_STEPS, 1, 0, rec);
    rec.push({ n: run.n, wins: run.wins, arm: -1, reward: 0 });
    return rec;
  }, [p]);
  const s = useStepper(snaps.length, 12, null);
  const f = snaps[s.i];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 14, r: 14, t: 12, b: 30 };
      const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const X = (x: number) => pad.l + x * pw;
      const curves = p.map((_, i) => {
        const pts: number[] = [];
        for (let k = 0; k <= 200; k++) pts.push(betaPdf(Math.min(0.999, Math.max(0.001, k / 200)), 1 + f.wins[i], 1 + f.n[i] - f.wins[i]));
        return pts;
      });
      const top = Math.max(2, ...curves.flat());
      const Y = (v: number) => pad.t + ph - (v / top) * ph;
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t + ph + 0.5);
      ctx.lineTo(w - pad.r, pad.t + ph + 0.5);
      ctx.stroke();
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 0; x <= 1.0001; x += 0.25) ctx.fillText(x.toFixed(2), X(x), pad.t + ph + 6);
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.fillText('당첨 확률', w - pad.r, pad.t + ph + 18);
      curves.forEach((pts, i) => {
        const c = armColor(P, i);
        const chosen = f.arm === i;
        ctx.beginPath();
        pts.forEach((v, k) => (k ? ctx.lineTo(X(k / 200), Y(v)) : ctx.moveTo(X(0), Y(v))));
        ctx.lineTo(X(1), Y(0));
        ctx.lineTo(X(0), Y(0));
        ctx.closePath();
        ctx.fillStyle = alpha(c, chosen ? 0.22 : 0.08);
        ctx.fill();
        ctx.strokeStyle = c;
        ctx.lineWidth = chosen ? 3 : 1.6;
        ctx.beginPath();
        pts.forEach((v, k) => (k ? ctx.lineTo(X(k / 200), Y(v)) : ctx.moveTo(X(0), Y(v))));
        ctx.stroke();
        // the true probability, as a short tick under the axis
        ctx.fillStyle = c;
        ctx.fillRect(X(p[i]) - 1, pad.t + ph - 6, 2, 6);
      });
    },
    [P, f, p],
    { aspect: 2, maxHeight: 320 },
  );

  const t = Math.min(s.i, TS_STEPS);
  const note =
    f.arm < 0
      ? `${TS_STEPS}번이 끝났습니다. 당긴 횟수는 ${f.n.map((x, i) => `${ARM_NAME[i]} ${x}`).join(', ')}번입니다. 가장 좋은 E에 대한 믿음은 좁고 높은 봉우리가 되었고, 나머지는 몇 번만 당겨 넓은 언덕으로 남았습니다.`
      : `${t + 1}번째: 다섯 곡선에서 하나씩 값을 뽑았더니 ${ARM_NAME[f.arm]}의 값이 가장 컸습니다. ${ARM_NAME[f.arm]}를 당겨 ${f.reward ? '당첨' : '꽝'}${f.reward ? '이므로 곡선이 오른쪽으로' : '이므로 곡선이 왼쪽으로'} 조금 옮겨 갑니다.`;

  return (
    <Figure
      no={3}
      title="톰슨 샘플링의 믿음"
      hint="재생하거나 한 번씩 넘겨 보세요"
      caption={<>곡선은 기계마다 "당첨 확률이 이 정도일 것"이라는 믿음(베타 분포)입니다. 처음에는 모두 평평하고, 당첨되면 오른쪽으로, 꽝이면 왼쪽으로 옮겨 가며 좁아집니다. 축 아래의 짧은 눈금은 실제 확률입니다. 굵게 칠한 곡선이 이번에 고른 기계입니다.</>}
    >
      <div className="fig-split">
        <div className="rl-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`베타 분포 다섯 개. 지금까지 당긴 횟수 ${f.n.map((x, i) => `${ARM_NAME[i]} ${x}번`).join(', ')}.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="rl-note" aria-live="polite">
            {s.i === 0 ? '처음에는 아무것도 모르니 곡선이 모두 평평합니다(모든 확률이 똑같이 그럴듯함). 재생을 눌러 보세요.' : note}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="bd-ts-speed" maxSpeed={60} />
          <div className="bd-counts">
            {f.n.map((x, i) => (
              <div key={i} style={{ ['--c' as string]: ARM_CSS[i] }}>
                <span>{ARM_NAME[i]}</span>
                <i style={{ width: `${(x / TS_STEPS) * 100}%` }} />
                <span className="mono">
                  {f.wins[i]}/{x}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Bandits() {
  const p = makeArms(K, SEED);
  return (
    <>
      <h2>정답 없이 배우기</h2>
      <p>
        <a href={lessonHref('ai-basics', 'logistic-regression')}>지도학습</a>에서는 사진마다 "고양이" 같은 정답이 붙어 있었습니다. 모델이 틀리면 무엇이 맞는지 알려 주니, 그쪽으로 고치면 됩니다. 그런데 바둑 한 수, 로봇의 한 걸음, 추천 목록 하나에는 정답표가 없습니다. 해 보고 나서 이겼는지, 넘어졌는지, 사용자가 눌렀는지 같은 결과만 돌아옵니다. 이렇게 행동하고 받은 <T en="reward">보상</T>만으로 더 나은 행동을 찾아 가는 방법을 <T en="reinforcement learning">강화학습</T>이라고 합니다.
      </p>
      <p>
        가장 단순한 경우부터 봅시다. 앞에 슬롯머신이 다섯 대 있고, 기계마다 당첨 확률이 다르지만 알려져 있지 않습니다. 한 번에 한 대를 당길 수 있고, 당첨이면 1점입니다. 당기는 행동이 다음 상황을 바꾸지 않으니, 매번 "어느 기계를 당길까"만 정하면 됩니다. 손잡이(arm)가 여러 개인 슬롯머신이라는 뜻에서 이 문제를 <T en="multi-armed bandit">멀티암드 밴딧</T>이라고 부릅니다. 그림 1에서 직접 당겨 보세요.
      </p>
      <ManualFigure />
      <p>
        몇 번 당겨 보면 고민이 생깁니다. 지금까지 가장 잘 나온 기계를 계속 당기면 당장은 점수를 얻지만, 두세 번만 당겨 본 다른 기계가 사실은 더 좋을 수도 있습니다. 반대로 확인하느라 여러 기계를 골고루 당기면 좋은 기계를 두고 나쁜 기계에 기회를 낭비합니다. 아는 것 중 최선을 고르는 <T en="exploitation">활용</T>과, 더 알기 위해 덜 확실한 것을 고르는 <T en="exploration">탐험</T> 사이의 이 맞바꿈이 강화학습 전체를 관통하는 문제입니다.
      </p>
      <Callout kind="intuition">
        단골 식당과 새 식당 사이의 고민과 같습니다. 단골만 가면 실망할 일은 없지만 더 맛있는 집을 영영 모르고, 매번 새 식당만 가면 실패가 잦습니다. 이 동네에 오래 살 사람일수록 초반에 여러 곳을 가 보는 것이 이득입니다. 앞으로 남은 기회가 많을수록 탐험의 가치가 커집니다.
      </Callout>

      <h2>네 가지 전략</h2>
      <p>
        기계 <M>i</M>를 <M>{'n_i'}</M>번 당겨 <M>{'w_i'}</M>번 당첨되었다면 당첨 확률의 추정값은 <M>{'\\hat p_i = w_i / n_i'}</M>입니다. 이것으로 만들 수 있는 전략은 여럿입니다.
      </p>
      <ul>
        <li>
          <strong>탐욕</strong>: 언제나 <M>{'\\hat p_i'}</M>가 가장 큰 기계를 당깁니다. 탐험을 전혀 하지 않습니다.
        </li>
        <li>
          <strong>ε-탐욕</strong>: 확률 ε로는 아무 기계나 무작위로 당기고, 나머지는 탐욕처럼 고릅니다.
        </li>
        <li>
          <strong>UCB1</strong>: 추정값에 "아직 잘 모르는 정도"를 더한 낙관적인 점수로 고릅니다. 덜 당겨 본 기계일수록 덤이 큽니다.
        </li>
        <li>
          <strong>톰슨 샘플링</strong>: 기계마다 당첨 확률에 대한 믿음을 확률 분포로 들고 있다가, 각 분포에서 값을 하나씩 뽑아 가장 큰 기계를 당깁니다.
        </li>
      </ul>
      <MB note={<>t는 지금까지 당긴 전체 횟수입니다. 둘째 항은 n<sub>i</sub>가 작을수록, 시간이 흐를수록 커집니다.</>}>{'\\text{UCB1:}\\quad a_t = \\arg\\max_i \\left( \\hat p_i + \\sqrt{\\frac{2\\ln t}{n_i}} \\right)'}</MB>
      <p>
        전략의 성적은 <T en="regret">후회</T>로 잽니다. 매번 가장 좋은 기계(확률 {Math.max(...p).toFixed(2)}) 대신 다른 기계를 골라 잃은 기대 점수를 모두 더한 것입니다. 후회가 작을수록 좋은 전략입니다. 그림 2는 네 전략을 같은 기계 묶음에서 200번씩 실행한 평균입니다.
      </p>
      <CompareFigure />
      <p>
        1,000번 당긴 뒤의 누적 후회는 탐욕이 226.7로 가장 크고, ε = 0.1인 ε-탐욕이 48.5, UCB1이 80.3, 톰슨 샘플링이 22.4입니다. 탐욕 전략은 운 나쁘게 처음 몇 번 꽝이 나온 기계를 다시 보지 않기 때문에 200번 중 33%만 가장 좋은 기계에 정착하고, 나머지는 덜 좋은 기계에 평생 머뭅니다. 누적 후회 그래프에서 탐욕의 선이 끝까지 곧게 올라가는 것이 그 때문입니다.
      </p>
      <p>
        ε-탐욕의 ε를 바꿔 보면 맞바꿈이 그대로 보입니다. ε = 0.01이면 탐험이 모자라 가장 좋은 기계를 찾은 실행이 64%에 그치고 후회는 101.7입니다. ε = 0.3이면 거의 언제나(99%) 찾지만, 찾은 뒤에도 30%는 계속 무작위로 당기니 후회가 96.4로 다시 늘어납니다. 이 기계 묶음에서는 ε = 0.07의 41.7이 가장 낮습니다. 문제가 바뀌면 좋은 ε도 바뀌는 것이 이 전략의 약점입니다.
      </p>
      <Callout kind="note">
        UCB1과 톰슨 샘플링의 누적 후회 곡선은 시간이 갈수록 눕습니다. 이론적으로 이 둘의 후회는 당긴 횟수 T에 대해 log T 정도로만 늘어나는데, 이것은 어떤 전략도 이보다 빠르게 줄일 수 없는 하한과 같은 속도입니다. 고정된 ε를 쓰는 ε-탐욕은 영원히 ε만큼 탐험하므로 후회가 T에 비례해 늘어납니다.
      </Callout>

      <h2>톰슨 샘플링: 믿음에서 뽑기</h2>
      <p>
        톰슨 샘플링은 1933년에 제안된 오래된 방법이지만, 그림 2에서 가장 성적이 좋았습니다. 기계마다 당첨 확률을 하나의 숫자로 추정하지 않고 "이 정도일 가능성이 이만큼"이라는 분포로 들고 다닙니다. 당첨/꽝 결과에는 <T en="beta distribution">베타 분포</T>가 잘 맞습니다. 당첨 w번, 꽝 l번을 본 뒤의 믿음은 Beta(1 + w, 1 + l)이고, 결과가 하나 들어올 때마다 숫자 하나만 늘리면 됩니다.
      </p>
      <ThompsonFigure />
      <p>
        재생해 보면 처음 몇십 번은 다섯 기계를 고루 당기다가, 점점 E에 몰립니다. 200번이 끝났을 때 E는 164번, 두 번째로 좋은 C는 20번, 나머지는 5~6번씩 당겼습니다. 덜 당긴 기계의 곡선은 넓게 퍼져 있으니 가끔 큰 값이 뽑혀 다시 기회를 얻고, 그러다 꽝이 나오면 곡선이 왼쪽으로 밀려 기회가 더 줄어듭니다. 따로 ε를 정하지 않아도, 불확실한 만큼만 탐험하게 됩니다.
      </p>

      <h2>어디에 쓰이나</h2>
      <p>
        밴딧은 실제로 많이 쓰입니다. 뉴스 사이트가 기사 제목 후보 여러 개 중 무엇을 보여 줄지, 쇼핑몰이 어느 추천을 맨 위에 둘지, 광고 시스템이 어느 광고를 낼지 정하는 문제가 모두 밴딧입니다. <a href={lessonHref('cs-hci', 'ab-testing')}>A/B 테스트</a>는 실험이 끝날 때까지 사용자를 반반 나누므로, 나쁜 쪽을 본 사용자 절반만큼 후회가 쌓입니다. 밴딧 알고리즘은 실험하는 동안에도 좋은 쪽으로 사용자를 점점 더 보내 그 비용을 줄입니다. 대신 A/B 테스트처럼 깔끔한 통계적 결론을 내기는 어려워서, 무엇을 배우려는지(어느 쪽이 나은지 확실히 알기)와 무엇을 얻으려는지(실험 중의 손해 줄이기)에 따라 고릅니다.
      </p>
      <p>
        밴딧에서는 행동이 다음 상황을 바꾸지 않았습니다. 다음 장에서는 한 번의 선택이 다음에 놓일 상황을 바꾸고, 보상이 여러 걸음 뒤에야 오는 문제로 넘어갑니다.
      </p>

      <Callout kind="key">
        강화학습은 정답 대신 보상만 보고 행동을 배웁니다. 가장 단순한 형태인 멀티암드 밴딧에서도 이미 아는 최선을 고르는 활용과 더 알기 위해 시도하는 탐험 사이의 맞바꿈이 생깁니다. 탐욕 전략은 탐험을 하지 않아 나쁜 선택에 갇히고, ε-탐욕은 정해진 비율로 탐험하며, UCB1은 불확실성에 덤을 주고, 톰슨 샘플링은 믿음의 분포에서 뽑아 불확실한 만큼만 탐험합니다. 성적은 가장 좋은 선택과 비교해 잃은 양인 후회로 잽니다.
      </Callout>
      <Quiz
        q="새 기사 제목 세 개 중 무엇을 보여 줄지 정하는 시스템이 첫날 제목 A를 10번 보여 줘 클릭 3번, B를 2번 보여 줘 클릭 0번을 얻었다. 탐욕 전략의 문제를 가장 잘 설명한 것은?"
        options={['A의 클릭률이 30%로 높으니 문제없다', 'B는 두 번만 보고 0%로 추정되어 다시 보여 주지 않으므로, B가 실제로 더 좋아도 영영 알 수 없다', '탐욕 전략은 C를 너무 자주 보여 준다', '클릭률은 보상이 될 수 없다']}
        answer={1}
        explain={<>두 번 중 0번은 실제 클릭률이 20%여도 쉽게 나오는 결과입니다(0.8² = 0.64). 탐욕 전략은 추정값이 낮은 쪽을 다시 시도하지 않으므로, 적게 본 선택지의 추정이 고쳐질 기회가 없습니다. ε-탐욕, UCB1, 톰슨 샘플링은 모두 이런 선택지에 다시 기회를 주는 방법입니다.</>}
      />
    </>
  );
}
