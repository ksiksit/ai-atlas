import { useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { lessonHref } from '../../../index';
import { Reroll, polyline, useMathColors } from './parts';
import { frac, pct } from './prob';
import './probability.css';

/* ─────────────── Figure 1: two dice, two events ─────────────── */

type EvKey = 'sum7' | 'even1' | 'double' | 'sum10' | 'six2' | 'low1' | 'custom';
const EVENTS: Record<Exclude<EvKey, 'custom'>, { label: string; f: (a: number, b: number) => boolean }> = {
  sum7: { label: '합이 7', f: (a, b) => a + b === 7 },
  even1: { label: '첫째가 짝수', f: (a) => a % 2 === 0 },
  double: { label: '두 눈이 같음', f: (a, b) => a === b },
  sum10: { label: '합이 10 이상', f: (a, b) => a + b >= 10 },
  six2: { label: '둘째가 6', f: (_, b) => b === 6 },
  low1: { label: '첫째가 2 이하', f: (a) => a <= 2 },
};
const PRESETS = Object.keys(EVENTS) as Exclude<EvKey, 'custom'>[];
const CELLS = Array.from({ length: 36 }, (_, i) => [Math.floor(i / 6) + 1, (i % 6) + 1] as const);
const setOf = (k: Exclude<EvKey, 'custom'>) => new Set(CELLS.flatMap(([a, b], i) => (EVENTS[k].f(a, b) ? [i] : [])));

function DiceFigure() {
  const [aKey, setAKey] = useState<EvKey>('sum7');
  const [custom, setCustom] = useState<Set<number>>(() => setOf('sum7'));
  const [bKey, setBKey] = useState<Exclude<EvKey, 'custom'>>('even1');
  const [given, setGiven] = useState(false);
  const A = aKey === 'custom' ? custom : setOf(aKey);
  const B = setOf(bKey);
  const nA = A.size;
  const nB = B.size;
  const nAB = [...A].filter((i) => B.has(i)).length;
  const nAuB = nA + nB - nAB;
  const indep = nAB * 36 === nA * nB;

  const toggle = (i: number) => {
    const s = new Set(A);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    setCustom(s);
    setAKey('custom');
  };

  return (
    <Figure
      no={1}
      title="주사위 두 개의 표본 공간"
      hint="사건을 고르거나 칸을 눌러 A를 직접 만들어 보세요"
      caption={<>칸 하나가 결과 하나이고, 36칸 모두 확률이 1/36로 같습니다. 사건은 칸들의 모음이고, 확률은 칸 수를 36으로 나눈 것입니다. "B가 일어났다고 알 때"를 켜면 B 바깥의 칸이 지워집니다. 조건부 확률은 남은 칸들만 새 표본 공간으로 보고 다시 센 비율입니다.</>}
    >
      <div className="fig-split">
        <div className="pr-dice-wrap">
          <div className="pr-dice-head" aria-hidden="true">
            <span>첫째 \ 둘째</span>
            {[1, 2, 3, 4, 5, 6].map((b) => (
              <span key={b}>{b}</span>
            ))}
          </div>
          <div className="pr-dice" role="group" aria-label="주사위 두 개의 결과 36칸. 누르면 사건 A에 넣거나 뺍니다.">
            {[1, 2, 3, 4, 5, 6].map((a) => (
              <div key={a} className="pr-dice-row">
                <span className="pr-dice-rowhead" aria-hidden="true">
                  {a}
                </span>
                {[1, 2, 3, 4, 5, 6].map((b) => {
                  const i = (a - 1) * 6 + (b - 1);
                  const inA = A.has(i);
                  const inB = B.has(i);
                  return (
                    <button
                      key={b}
                      type="button"
                      className="pr-cell"
                      data-a={inA || undefined}
                      data-b={inB || undefined}
                      data-out={given && !inB ? '' : undefined}
                      aria-pressed={inA}
                      aria-label={`첫째 ${a}, 둘째 ${b}${inA ? ', A에 속함' : ''}${inB ? ', B에 속함' : ''}`}
                      onClick={() => toggle(i)}
                    >
                      {a + b}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <Legend
            items={[
              { color: 'color-mix(in srgb, var(--c-math-1) 45%, transparent)', label: '사건 A', shape: 'sq' },
              { color: 'var(--c-math-2)', label: '사건 B (테두리)', shape: 'sq' },
            ]}
          />
          <div className="pr-note">칸 안의 숫자는 두 눈의 합입니다.</div>
        </div>
        <div className="controls">
          <div className="ctl">
            <span className="ctl-label">
              <span>사건 A</span>
              <span className="val">{aKey === 'custom' ? '직접 고름' : EVENTS[aKey].label}</span>
            </span>
            <select className="select" value={aKey} onChange={(e) => setAKey(e.target.value as EvKey)} aria-label="사건 A 고르기">
              {PRESETS.map((k) => (
                <option key={k} value={k}>
                  {EVENTS[k].label}
                </option>
              ))}
              <option value="custom">직접 고른 칸</option>
            </select>
          </div>
          <div className="ctl">
            <span className="ctl-label">
              <span>사건 B</span>
            </span>
            <select className="select" value={bKey} onChange={(e) => setBKey(e.target.value as Exclude<EvKey, 'custom'>)} aria-label="사건 B 고르기">
              {PRESETS.map((k) => (
                <option key={k} value={k}>
                  {EVENTS[k].label}
                </option>
              ))}
            </select>
          </div>
          <Check label="B가 일어났다고 알 때" checked={given} onChange={setGiven} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="P(A)" value={`${nA}/36`} color="var(--c-math-1)" />
            <Readout label="P(B)" value={`${nB}/36`} color="var(--c-math-2)" />
            <Readout label="P(A ∩ B)" value={`${nAB}/36`} />
            <Readout label="P(A ∪ B)" value={`${nAuB}/36`} />
            <Readout label="P(A | B) = |A∩B| / |B|" value={nB ? `${nAB}/${nB}` : '–'} color={given ? 'var(--c-math-3)' : undefined} />
            <Readout label="P(A)·P(B)" value={frac(nA * nB, 1296)} />
          </div>
          <div className="pr-note">
            {nAB === 0 && nA > 0 && nB > 0 ? (
              <>A와 B는 함께 일어날 수 없습니다(서로 배반). B를 알면 A의 확률이 0이 되므로 <strong>독립이 아닙니다</strong>.</>
            ) : indep ? (
              <>P(A ∩ B) = P(A)·P(B)이므로 A와 B는 <strong>독립</strong>입니다. B를 알아도 A의 확률은 {frac(nA, 36)} 그대로입니다.</>
            ) : (
              <>P(A ∩ B) ≠ P(A)·P(B)이므로 A와 B는 <strong>독립이 아닙니다</strong>. B를 알면 A의 확률이 {frac(nA, 36)}에서 {nB ? frac(nAB, nB) : '–'}로 바뀝니다.</>
            )}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: Monty Hall ─────────────── */

const GAMES = 1000;

function simulateMonty(n: number, seed: number) {
  const r = rng(seed * 7919 + n);
  const stay: number[] = [];
  const sw: number[] = [];
  let ws = 0;
  let wsw = 0;
  for (let g = 1; g <= GAMES; g++) {
    const car = Math.floor(r() * n);
    const pick = Math.floor(r() * n);
    // the host opens every other door except one, never the car: the closed one is the car unless you already hold it
    const other = pick === car ? (pick + 1 + Math.floor(r() * (n - 1))) % n : car;
    if (pick === car) ws++;
    if (other === car) wsw++;
    stay.push(ws / g);
    sw.push(wsw / g);
  }
  return { stay, sw };
}

type Phase = 'pick' | 'decide' | 'done';

function MontyFigure() {
  const P = usePalette();
  const [c1, c2] = useMathColors(P);
  const [n, setN] = useState(3);
  const [seed, setSeed] = useState(1);
  const [game, setGame] = useState(0);
  const [phase, setPhase] = useState<Phase>('pick');
  const [pick, setPick] = useState(-1);
  const [final, setFinal] = useState(-1);
  const [tally, setTally] = useState({ stayPlay: 0, stayWin: 0, swPlay: 0, swWin: 0 });

  const { car, closed } = useMemo(() => {
    const r = rng(seed * 104729 + game * 31 + n);
    const car = Math.floor(r() * n);
    const closed = pick < 0 ? -1 : pick === car ? (pick + 1 + Math.floor(r() * (n - 1))) % n : car;
    return { car, closed };
  }, [seed, game, n, pick]);
  const sim = useMemo(() => simulateMonty(n, seed), [n, seed]);

  const newGame = () => {
    setGame((g) => g + 1);
    setPhase('pick');
    setPick(-1);
    setFinal(-1);
  };
  const choose = (d: number) => {
    if (phase === 'pick') {
      setPick(d);
      setPhase('decide');
    } else if (phase === 'decide' && (d === pick || d === closed)) {
      const switched = d !== pick;
      const win = d === car;
      setFinal(d);
      setPhase('done');
      setTally((t) => (switched ? { ...t, swPlay: t.swPlay + 1, swWin: t.swWin + (win ? 1 : 0) } : { ...t, stayPlay: t.stayPlay + 1, stayWin: t.stayWin + (win ? 1 : 0) }));
    }
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 1, xMax: GAMES, yMin: 0, yMax: 1, pad: { l: 40, r: 14, t: 12, b: 28 } });
      plot.grid({ xStep: 200, yStep: 0.25, xLabel: '게임 수', fmt: (v) => (v <= 1 && v > 0 && v !== Math.round(v) ? `${Math.round(v * 100)}%` : v === 1 && v < 2 ? '100%' : String(v)) });
      plot.line(1, 1 / n, GAMES, 1 / n, alpha(c2, 0.6), 1.2, [5, 4]);
      plot.line(1, (n - 1) / n, GAMES, (n - 1) / n, alpha(c1, 0.6), 1.2, [5, 4]);
      const xs = sim.stay.map((_, i) => i + 1);
      polyline(plot, xs, sim.stay, c2, 2.2);
      polyline(plot, xs, sim.sw, c1, 2.2);
      plot.text(`바꾸기 ${pct(sim.sw[GAMES - 1], 1)}`, GAMES, sim.sw[GAMES - 1], c1, { align: 'right', dy: -12, bg: alpha(P.surface, 0.85) });
      plot.text(`그대로 ${pct(sim.stay[GAMES - 1], 1)}`, GAMES, sim.stay[GAMES - 1], c2, { align: 'right', dy: 13, bg: alpha(P.surface, 0.85) });
    },
    [P, c1, c2, sim, n],
    { aspect: 2.2, maxHeight: 300, minHeight: 210 },
  );

  const msg =
    phase === 'pick'
      ? '문 하나를 고르세요. 그 뒤에 자동차가 있으면 이깁니다.'
      : phase === 'decide'
        ? n === 3
          ? `진행자가 염소가 있는 문 하나를 열었습니다. 처음 고른 ${pick + 1}번을 지킬까요, ${closed + 1}번으로 바꿀까요?`
          : `진행자가 염소가 있는 문 ${n - 2}개를 열었습니다. ${pick + 1}번을 지킬까요, 남은 ${closed + 1}번으로 바꿀까요?`
        : final === car
          ? `자동차! ${final === pick ? '그대로 두어' : '바꿔서'} 이겼습니다.`
          : `염소입니다. 자동차는 ${car + 1}번에 있었습니다.`;

  return (
    <Figure
      no={2}
      title="몬티 홀: 바꿀까, 그대로 둘까"
      hint="직접 몇 판 해 보고, 아래 1000판 결과와 비교해 보세요"
      caption={<>위에서는 한 판씩 직접 합니다. 아래 그래프는 같은 게임을 {GAMES}판 돌렸을 때 두 전략의 누적 승률이고, 점선은 이론값 1/n과 (n−1)/n입니다. 처음 고른 문에 자동차가 있을 확률은 진행자가 무엇을 열든 1/n 그대로이고, 나머지 (n−1)/n은 진행자가 남겨 둔 문 하나로 모입니다.</>}
    >
      <div className="controls row">
        <Slider id="mh-n" label="문의 개수 n" value={n} min={3} max={10} step={1} onChange={(v) => { setN(v); newGame(); }} />
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <div className="btn-row">
            <Button small primary onClick={newGame}>
              새 게임
            </Button>
            <Reroll onClick={() => { setSeed((s) => s + 1); newGame(); }} />
          </div>
        </div>
      </div>
      <div className="pr-doors" role="group" aria-label="문 고르기">
        {Array.from({ length: n }, (_, d) => {
          const open = phase !== 'pick' && d !== pick && d !== closed;
          const reveal = phase === 'done' || open;
          const state = reveal ? (d === car ? 'car' : 'goat') : 'closed';
          const clickable = phase === 'pick' || (phase === 'decide' && (d === pick || d === closed));
          return (
            <button
              key={d}
              type="button"
              className="pr-door"
              data-state={state}
              data-pick={d === pick || undefined}
              data-final={d === final || undefined}
              disabled={!clickable}
              onClick={() => choose(d)}
              aria-label={`${d + 1}번 문${state === 'car' ? ', 자동차' : state === 'goat' ? ', 염소' : ''}${d === pick ? ', 처음 고른 문' : ''}`}
            >
              <span className="pr-door-no">{d + 1}</span>
              <span className="pr-door-face" aria-hidden="true">
                {state === 'car' ? '자동차' : state === 'goat' ? '염소' : '?'}
              </span>
            </button>
          );
        })}
      </div>
      <div className="pr-note" aria-live="polite">
        {msg}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <Readout label="내가 그대로 둔 판" value={tally.stayPlay ? `${tally.stayWin}승 / ${tally.stayPlay}판` : '–'} color="var(--c-math-2)" />
        <Readout label="내가 바꾼 판" value={tally.swPlay ? `${tally.swWin}승 / ${tally.swPlay}판` : '–'} color="var(--c-math-1)" />
        <Readout label="이론: 그대로" value={frac(1, n)} />
        <Readout label="이론: 바꾸기" value={frac(n - 1, n)} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`몬티 홀 ${GAMES}판 시뮬레이션: 문 ${n}개일 때 바꾸면 ${pct(sim.sw[GAMES - 1])}, 그대로 두면 ${pct(sim.stay[GAMES - 1])} 이겼습니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <Legend
        items={[
          { color: 'var(--c-math-1)', label: '항상 바꾸기', shape: 'ln' },
          { color: 'var(--c-math-2)', label: '항상 그대로', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: Bayes as a frequency tree (intrusion alarms) ─────────────── */

const TOTAL = 10000;
const nf = (v: number) => Math.round(v).toLocaleString('ko-KR');

function BayesFigure() {
  const [prior, setPrior] = useState(1); // % of connections that are attacks
  const [tpr, setTpr] = useState(95); // detection rate %
  const [fpr, setFpr] = useState(3); // false alarm rate %
  const [second, setSecond] = useState(false);

  const p = prior / 100;
  const s = tpr / 100;
  const f = fpr / 100;
  const atk = TOTAL * p;
  const ok = TOTAL - atk;
  const tp = atk * s;
  const fn = atk - tp;
  const fp = ok * f;
  const tn = ok - fp;
  const post1 = tp / (tp + fp);
  // a second, independent detector run only on the alarmed connections
  const tp2 = tp * s;
  const fp2 = fp * f;
  const post2 = tp2 / (tp2 + fp2);

  const W = 420;
  const H = 230;
  const box = (x: number, y: number, w: number, label: string, count: number, kind: string) => (
    <g className="pr-tree-node" data-kind={kind}>
      <rect x={x} y={y - 19} width={w} height={38} rx={4} />
      <text x={x + w / 2} y={y - 4} className="t1">
        {label}
      </text>
      <text x={x + w / 2} y={y + 12} className="t2">
        {nf(count)}건
      </text>
    </g>
  );
  const edge = (x1: number, y1: number, x2: number, y2: number, pr: string) => (
    <g className="pr-tree-edge">
      <path d={`M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`} />
      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5}>
        {pr}
      </text>
    </g>
  );

  return (
    <Figure
      no={3}
      title="경보가 울렸다면, 정말 공격일까"
      hint="세 비율을 바꿔 보세요"
      caption={<>하루 {TOTAL.toLocaleString('ko-KR')}건의 접속이 침입 탐지 시스템을 지난다고 하고 확률을 사람이 셀 수 있는 건수로 바꿨습니다. 경보가 울린 칸(진한 테두리)만 모아 그중 진짜 공격의 비율을 보면 그것이 P(공격 | 경보)입니다. 공격이 드물면 정상 접속에서 나오는 오경보가 진짜 경보보다 많아집니다.</>}
    >
      <div className="fig-split left">
        <div className="controls">
          <Slider id="by-prior" label="공격 비율 P(공격)" value={prior} min={0.1} max={20} step={0.1} onChange={setPrior} format={(v) => v.toFixed(1) + '%'} color="var(--c-math-1)" />
          <Slider id="by-tpr" label="탐지율 P(경보 | 공격)" value={tpr} min={50} max={100} step={0.5} onChange={setTpr} format={(v) => v.toFixed(1) + '%'} />
          <Slider id="by-fpr" label="오경보율 P(경보 | 정상)" value={fpr} min={0.1} max={20} step={0.1} onChange={setFpr} format={(v) => v.toFixed(1) + '%'} color="var(--c-math-2)" />
          <Check label="독립인 두 번째 탐지기도 경보" checked={second} onChange={setSecond} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="P(공격 | 경보)" value={pct(post1)} color="var(--c-math-1)" />
            {second && <Readout label="P(공격 | 경보 두 번)" value={pct(post2)} color="var(--c-math-3)" />}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="pr-tree" role="img" aria-label={`빈도 나무: 접속 ${TOTAL}건 중 공격 ${nf(atk)}건, 정상 ${nf(ok)}건. 경보는 공격에서 ${nf(tp)}건, 정상에서 ${nf(fp)}건 울립니다.`}>
            {edge(86, H / 2, 150, 60, pct(p, 1))}
            {edge(86, H / 2, 150, 170, pct(1 - p, 1))}
            {edge(244, 60, 304, 28, pct(s, 1))}
            {edge(244, 60, 304, 88, pct(1 - s, 1))}
            {edge(244, 170, 304, 142, pct(f, 1))}
            {edge(244, 170, 304, 202, pct(1 - f, 1))}
            {box(4, H / 2, 82, '전체 접속', TOTAL, 'root')}
            {box(150, 60, 94, '공격', atk, 'atk')}
            {box(150, 170, 94, '정상', ok, 'ok')}
            {box(304, 28, 112, '경보 (진짜)', tp, 'tp')}
            {box(304, 88, 112, '조용 (놓침)', fn, 'fn')}
            {box(304, 142, 112, '경보 (오경보)', fp, 'fp')}
            {box(304, 202, 112, '조용', tn, 'tn')}
          </svg>
          <div className="pr-stack" role="img" aria-label={`경보 ${nf(tp + fp)}건 가운데 진짜 공격 ${nf(tp)}건, 오경보 ${nf(fp)}건`}>
            <span style={{ flexGrow: Math.max(tp, 0.0001), background: 'var(--c-math-1)' }} />
            <span style={{ flexGrow: Math.max(fp, 0.0001), background: 'var(--c-math-2)' }} />
          </div>
          <div className="pr-note mono">
            경보 {nf(tp + fp)}건 중 진짜 공격 {nf(tp)}건 → {nf(tp)}/{nf(tp + fp)} = <strong style={{ color: 'var(--c-math-1)' }}>{pct(post1)}</strong>
            {second && (
              <>
                <br />두 번 다 울린 {nf(tp2 + fp2)}건 중 공격 {nf(tp2)}건 → <strong style={{ color: 'var(--c-math-3)' }}>{pct(post2)}</strong>
              </>
            )}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: a naive Bayes spam filter ─────────────── */

// toy training set: 400 spam and 600 normal messages; how many of each contain the word
const N_SPAM = 400;
const N_HAM = 600;
const WORDS = [
  { w: '무료', spam: 180, ham: 24 },
  { w: '당첨', spam: 96, ham: 3 },
  { w: '클릭', spam: 150, ham: 40 },
  { w: '할인', spam: 120, ham: 60 },
  { w: '계좌', spam: 60, ham: 30 },
  { w: '회의', spam: 6, ham: 150 },
  { w: '보고서', spam: 4, ham: 120 },
  { w: '내일', spam: 30, ham: 180 },
];
const EMAILS: { label: string; words: string[] }[] = [
  { label: '광고 메일', words: ['무료', '클릭', '할인'] },
  { label: '업무 메일', words: ['회의', '보고서', '내일'] },
  { label: '애매한 메일', words: ['할인', '내일', '계좌'] },
];
// Laplace smoothing: a word never seen in one class still gets a small probability
const likelihood = (count: number, n: number) => (count + 1) / (n + 2);

function SpamFigure() {
  const [on, setOn] = useState<Set<string>>(() => new Set(EMAILS[0].words));
  const [prior, setPrior] = useState(0.4);
  const terms = WORDS.filter((x) => on.has(x.w)).map((x) => {
    const ps = likelihood(x.spam, N_SPAM);
    const ph = likelihood(x.ham, N_HAM);
    return { ...x, ps, ph, llr: Math.log(ps / ph) };
  });
  const priorLo = Math.log(prior / (1 - prior));
  const logOdds = priorLo + terms.reduce((a, t) => a + t.llr, 0);
  const post = 1 / (1 + Math.exp(-logOdds));
  const maxAbs = Math.max(3, Math.abs(priorLo), ...terms.map((t) => Math.abs(t.llr)), Math.abs(logOdds));
  const bar = (v: number, color: string) => {
    const wpct = (Math.abs(v) / maxAbs) * 50;
    return <span className="pr-llr-bar" style={{ left: v >= 0 ? '50%' : `${50 - wpct}%`, width: `${wpct}%`, background: color }} />;
  };

  return (
    <Figure
      no={4}
      title="나이브 베이즈 스팸 필터"
      hint="메일에 들어 있는 단어를 켜고 꺼 보세요"
      caption={<>스팸 {N_SPAM}통과 정상 메일 {N_HAM}통으로 단어마다 P(단어 | 스팸)과 P(단어 | 정상)을 세어 두었습니다. 막대는 각 단어가 "스팸 쪽으로 기우는 정도" log(P(단어 | 스팸) / P(단어 | 정상))입니다. 오른쪽(빨강)은 스팸 쪽, 왼쪽(파랑)은 정상 쪽입니다. 단어들이 서로 독립이라고 가정하면 이 막대들을 그냥 더하면 됩니다.</>}
    >
      <div className="controls row">
        <div className="ctl">
          <span className="ctl-label">
            <span>예시 메일</span>
          </span>
          <div className="btn-row">
            {EMAILS.map((e) => (
              <Button key={e.label} small onClick={() => setOn(new Set(e.words))}>
                {e.label}
              </Button>
            ))}
          </div>
        </div>
        <Slider id="nb-prior" label="사전확률 P(스팸)" value={prior} min={0.05} max={0.95} step={0.05} onChange={setPrior} format={(v) => pct(v, 0)} />
      </div>
      <div className="pr-words" role="group" aria-label="메일에 든 단어">
        {WORDS.map((x) => (
          <button key={x.w} type="button" className="pr-word" aria-pressed={on.has(x.w)} onClick={() => setOn((s) => { const t = new Set(s); if (t.has(x.w)) t.delete(x.w); else t.add(x.w); return t; })}>
            {x.w}
          </button>
        ))}
      </div>
      <div className="pr-llr" role="img" aria-label={`단어별 기여와 합계. 스팸일 확률 ${pct(post)}`}>
        <div className="pr-llr-row">
          <span className="pr-llr-name">사전 확률</span>
          <span className="pr-llr-track">{bar(priorLo, 'var(--ink-3)')}</span>
          <span className="pr-llr-val mono">{priorLo >= 0 ? '+' : '−'}{Math.abs(priorLo).toFixed(2)}</span>
        </div>
        {terms.map((t) => (
          <div key={t.w} className="pr-llr-row">
            <span className="pr-llr-name">
              {t.w}
              <small className="mono">
                {' '}
                {pct(t.ps, 0)} : {pct(t.ph, 0)}
              </small>
            </span>
            <span className="pr-llr-track">{bar(t.llr, t.llr >= 0 ? 'var(--c-math-1)' : 'var(--c-math-2)')}</span>
            <span className="pr-llr-val mono">{t.llr >= 0 ? '+' : '−'}{Math.abs(t.llr).toFixed(2)}</span>
          </div>
        ))}
        <div className="pr-llr-row total">
          <span className="pr-llr-name">합계 (로그 오즈)</span>
          <span className="pr-llr-track">{bar(logOdds, 'var(--c-math-3)')}</span>
          <span className="pr-llr-val mono">{logOdds >= 0 ? '+' : '−'}{Math.abs(logOdds).toFixed(2)}</span>
        </div>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <Readout label="P(스팸 | 이 단어들)" value={pct(post)} color={post > 0.5 ? 'var(--c-math-1)' : 'var(--c-math-2)'} />
        <Readout label="판정 (기준 50%)" value={post > 0.5 ? '스팸함으로' : '받은편지함'} />
        <Readout label="켜진 단어" value={`${terms.length}개`} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Probability() {
  return (
    <>
      <h2>확률은 세는 데서 시작한다</h2>
      <p>
        주사위를 던지거나, 해시 함수에 키를 넣거나, 서버에 요청이 들어오는 일처럼 결과를 미리 알 수 없는 과정을 <T en="random experiment">무작위 실험</T>이라고 합니다. 일어날 수 있는 결과를 모두 모은 집합이 <T en="sample space">표본 공간</T> <M>{'\\Omega'}</M>(오메가)이고, 결과들의 모음, 즉 <M>{'\\Omega'}</M>의 부분집합이 <T en="event">사건</T>입니다. 주사위 두 개를 던지면 <M>{'\\Omega'}</M>는 (첫째 눈, 둘째 눈) 쌍 36개이고, "합이 7"은 그중 6개로 이루어진 사건입니다.
      </p>
      <p>
        <T en="probability">확률</T> <M>{'P'}</M>는 사건마다 0과 1 사이의 수를 붙이는 규칙입니다. 지켜야 할 약속은 세 가지뿐입니다. 어떤 사건이든 <M>{'P(A) \\ge 0'}</M>이고, 반드시 일어나는 사건은 <M>{'P(\\Omega) = 1'}</M>이며, 함께 일어날 수 없는 사건들의 확률은 더해집니다. 모든 결과가 똑같이 그럴듯하면 확률은 결국 세기입니다.
      </p>
      <MB note="|A|는 사건 A에 든 결과의 개수입니다. 결과마다 확률이 같을 때만 성립합니다.">{'P(A) = \\frac{|A|}{|\\Omega|}'}</MB>
      <p>
        그래서 확률의 많은 문제는 <a href={lessonHref('math-discrete', 'counting')}>경우의 수</a>에서 배운 세는 법으로 풀립니다. 세 약속에서 바로 따라 나오는 규칙도 있습니다. A가 일어나지 않는 사건 <M>{'A^c'}</M>(A의 여사건)은 <M>{'P(A^c) = 1 - P(A)'}</M>이고, 겹칠 수 있는 두 사건은 포함·배제로 <M>{'P(A \\cup B) = P(A) + P(B) - P(A \\cap B)'}</M>입니다.
      </p>
      <DiceFigure />
      <p>
        그림 1에서 A를 "합이 7", B를 "합이 10 이상"으로 두면 두 사건은 겹치지 않으므로 <M>{'P(A \\cup B)'}</M>는 6/36 + 6/36 = 12/36입니다. B를 "첫째가 짝수"로 바꾸면 겹치는 칸 3개를 한 번 빼야 합니다.
      </p>

      <h2>조건부 확률: 표본 공간을 줄이기</h2>
      <p>
        새 정보를 얻으면 확률이 바뀝니다. "B가 일어났다"는 것을 알 때 A의 확률을 <T en="conditional probability">조건부 확률</T> <M>{'P(A \\mid B)'}</M>라고 쓰고 "B가 주어졌을 때 A의 확률"이라고 읽습니다. B를 안다는 것은 B 바깥의 결과가 모두 지워진다는 뜻입니다. 남은 B를 새 표본 공간으로 보고, 그 안에서 A가 차지하는 비율을 다시 셉니다.
      </p>
      <MB note="P(B) > 0일 때만 정의합니다. 결과가 똑같이 그럴듯하면 |A ∩ B| / |B|와 같습니다.">{'P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}'}</MB>
      <p>
        그림 1에서 "B가 일어났다고 알 때"를 켜 보세요. A = "합이 10 이상", B = "둘째가 6"이면 원래 6/36 = 1/6이던 확률이, 둘째가 6이라는 것을 알면 남은 6칸 중 3칸이라 1/2이 됩니다. 이 식을 뒤집으면 두 사건이 함께 일어날 확률을 단계별로 구하는 <T en="multiplication rule">곱셈 규칙</T>이 됩니다.
      </p>
      <MB note="왼쪽: B가 일어나고, 그다음 B인 상황에서 A가 일어난다. 오른쪽: 표본 공간을 겹치지 않는 조각 B₁, …, Bₖ로 나누어 조각마다 계산해 더한다(전확률 법칙).">{'P(A \\cap B) = P(B)\\,P(A \\mid B) \\qquad P(A) = \\sum_{i} P(B_i)\\,P(A \\mid B_i)'}</MB>

      <h2>독립</h2>
      <p>
        B를 알아도 A의 확률이 그대로라면, 즉 <M>{'P(A \\mid B) = P(A)'}</M>이면 두 사건은 <T en="independent">독립</T>이라고 합니다. 곱셈 규칙에 넣으면 대칭적인 정의가 나옵니다.
      </p>
      <MB>{'A, B \\text{가 독립} \\iff P(A \\cap B) = P(A)\\,P(B)'}</MB>
      <p>
        그림 1의 기본값 "합이 7"과 "첫째가 짝수"는 의외로 독립입니다. 첫째 눈이 무엇이든 합을 7로 만드는 둘째 눈이 꼭 하나씩 있기 때문입니다. 반면 "합이 10 이상"과 "첫째가 짝수"는 독립이 아닙니다. 첫째가 크면 합도 커지기 쉽습니다.
      </p>
      <Callout kind="warn">
        독립과 배반을 헷갈리기 쉽습니다. <strong>배반</strong>(서로소)은 두 사건이 함께 일어날 수 없다는 뜻이고(<M>{'A \\cap B = \\varnothing'}</M>), 확률이 0보다 큰 배반 사건은 오히려 강하게 얽혀 있습니다. 하나가 일어났다는 것을 알면 다른 하나는 절대 일어나지 않기 때문입니다. 그림 1에서 "합이 7"과 "두 눈이 같음"을 골라 확인해 보세요.
      </Callout>
      <p>
        컴퓨터과학에서 독립은 계산을 쉽게 만드는 가정입니다. 디스크 두 개가 서로 독립으로 하루에 0.1%씩 고장 난다면 둘 다 고장 날 확률은 <M>{'0.001^2 = 10^{-6}'}</M>입니다. RAID 미러링이 믿을 만한 이유입니다. 하지만 같은 날 같은 공장에서 만든 디스크라면 고장이 함께 오기 쉽고, 그러면 이 곱셈은 위험할 만큼 낙관적인 답을 냅니다.
      </p>

      <h2>몬티 홀 문제</h2>
      <p>
        조건부 확률의 직관이 얼마나 잘 틀리는지 보여 주는 유명한 게임이 있습니다. 문 세 개 중 하나 뒤에 자동차가, 나머지 뒤에 염소가 있습니다. 문을 하나 고르면, 자동차 위치를 아는 진행자가 남은 두 문 중 염소가 있는 문을 하나 열어 보여 주고 "바꾸겠습니까?"라고 묻습니다. 남은 문이 두 개이니 반반이라고 생각하기 쉽습니다.
      </p>
      <MontyFigure />
      <p>
        그림 2에서 바꾸는 쪽이 약 2/3의 확률로 이깁니다. 처음 고른 문이 맞을 확률은 1/3이고, 진행자는 <strong>언제나</strong> 염소 문을 열 수 있으므로 문을 연다는 사실은 내 문에 대해 아무것도 알려 주지 않습니다. 그러면 남은 2/3는 닫혀 있는 다른 문 하나에 모입니다. 문을 10개로 늘리면 더 분명합니다. 처음 고른 문이 맞을 확률은 1/10인데, 진행자가 염소 문 8개를 열고 하나만 남겨 둡니다.
      </p>
      <Callout kind="intuition">
        핵심은 진행자가 무작위로 연 것이 아니라 <strong>정보를 가지고</strong> 골랐다는 점입니다. 진행자가 아무 문이나 열었는데 우연히 염소가 나왔다면 그때는 정말 반반입니다. 같은 관찰이라도 그 관찰이 어떻게 만들어졌는지에 따라 조건부 확률이 달라집니다.
      </Callout>

      <h2>베이즈 정리: 원인의 확률 뒤집기</h2>
      <p>
        우리가 아는 것은 보통 "원인이 있을 때 증상이 나타날 확률"인데, 알고 싶은 것은 "증상을 보았을 때 원인이 있을 확률"입니다. 곱셈 규칙을 두 방향으로 쓰면 <M>{'P(A)P(B \\mid A) = P(B)P(A \\mid B)'}</M>이고, 이것을 정리한 것이 <T en="Bayes' theorem">베이즈 정리</T>입니다.
      </p>
      <MB note="P(H)는 증거를 보기 전의 믿음(사전확률), P(E | H)는 H일 때 증거가 나올 확률(가능도), P(H | E)는 증거를 본 뒤의 믿음(사후확률)입니다. 분모는 전확률 법칙으로 구합니다.">{'P(H \\mid E) = \\frac{P(E \\mid H)\\,P(H)}{P(E \\mid H)\\,P(H) + P(E \\mid H^c)\\,P(H^c)}'}</MB>
      <p>
        침입 탐지 시스템을 예로 듭시다. 공격의 95%를 잡아내고 정상 접속에는 3%만 잘못 경보를 울리는 꽤 좋은 시스템입니다. 그런데 접속 100건 중 1건만 공격이라면, 경보가 울렸을 때 실제 공격일 확률은 얼마일까요?
      </p>
      <BayesFigure />
      <p>
        기본값에서 답은 약 24%입니다. 경보 넷 중 셋은 오경보입니다. 정상 접속이 99배 많으니 3%의 오경보율도 진짜 경보 수를 압도합니다. 이렇게 사전확률을 무시하고 탐지율만 보는 실수를 <T en="base rate fallacy">기저율 무시</T>라고 합니다. 의료 검사로 같은 현상을 본 <a href={lessonHref('ai-basics', 'probability')}>확률과 분포</a>의 그림과 비교해 보세요.
      </p>
      <p>
        "독립인 두 번째 탐지기"를 켜면 첫 경보 뒤의 사후확률이 두 번째 판단의 사전확률이 됩니다. 증거가 쌓일 때마다 베이즈 정리를 다시 적용하면 됩니다. 운영 현장에서 경보 하나로 바로 차단하지 않고 서로 다른 신호 여러 개가 겹칠 때 대응하는 이유입니다.
      </p>
      <Callout kind="warn">
        <M>{'P(E \\mid H)'}</M>와 <M>{'P(H \\mid E)'}</M>는 다른 질문입니다. "공격이면 경보가 울릴 확률 95%"를 "경보가 울리면 공격일 확률 95%"로 읽는 실수는 법정에서도 일어나서 <T en="prosecutor's fallacy">검사의 오류</T>라는 이름까지 붙었습니다.
      </Callout>

      <h2>나이브 베이즈 분류기</h2>
      <p>
        스팸 필터는 메일에 든 단어들 <M>{'w_1, \\dots, w_k'}</M>를 증거로 "스팸"이라는 가설의 사후확률을 구합니다. 단어 조합 전체의 확률을 세려면 데이터가 끝없이 필요하므로, 클래스가 정해지면 단어들이 서로 독립이라고 가정합니다. 이것을 <T en="conditional independence">조건부 독립</T>이라 하고, 이 대담한 가정 덕분에 이름에 "순진한(naive)"이 붙었습니다.
      </p>
      <MB note="S는 스팸, H는 정상 메일입니다. 곱을 그대로 계산하면 아주 작은 수가 되어 컴퓨터에서 0으로 떨어지므로, 로그를 씌워 덧셈으로 바꿉니다.">{'\\log\\frac{P(S \\mid w_1..w_k)}{P(H \\mid w_1..w_k)} = \\log\\frac{P(S)}{P(H)} + \\sum_{i=1}^{k} \\log\\frac{P(w_i \\mid S)}{P(w_i \\mid H)}'}</MB>
      <p>
        왼쪽은 <T en="log-odds">로그 오즈</T>입니다. 오즈는 "스팸일 확률 대 정상일 확률"의 비이고, 0이면 반반, 양수면 스팸 쪽입니다. 그림 4에서 "광고 메일"은 막대 셋이 모두 오른쪽을 가리켜 스팸이 거의 확실합니다. "애매한 메일"에서 사전확률을 바꾸면 판정이 뒤집히는 것도 확인해 보세요.
      </p>
      <SpamFigure />
      <Code label="나이브 베이즈 스팸 판정">{`
// 학습: 클래스마다 각 단어가 든 메일 수를 센다
// counts.spam["무료"] = 180, counts.nSpam = 400, ...
function likelihood(count, n) {
  return (count + 1) / (n + 2); // 라플라스 보정: 한 번도 못 본 단어도 확률 0이 되지 않게
}

function spamProbability(words, counts, prior) {
  let logOdds = Math.log(prior / (1 - prior)); // 사전 오즈
  for (const w of words) {
    if (!(w in counts.spam)) continue; // 모르는 단어는 증거로 쓰지 않는다
    const ps = likelihood(counts.spam[w], counts.nSpam);
    const ph = likelihood(counts.ham[w], counts.nHam);
    logOdds += Math.log(ps / ph); // 곱 대신 로그의 합
  }
  return 1 / (1 + Math.exp(-logOdds)); // 로그 오즈를 다시 확률로
}`}</Code>
      <p>
        단어들이 정말 독립일 리는 없습니다. "무료"와 "할인"은 같이 나오기 쉬워서, 나이브 베이즈는 같은 증거를 두 번 세며 지나치게 확신하곤 합니다. 그래도 어느 쪽이 더 그럴듯한지 <strong>순서</strong>는 대체로 맞혀서, 계산이 빠르고 데이터가 적어도 되는 분류기로 오래 쓰여 왔습니다. 확률 대신 학습으로 가중치를 정하는 방법은 <a href={lessonHref('ai-basics', 'logistic-regression')}>로지스틱 회귀</a>에서 이어집니다. 그 식도 같은 로그 오즈의 합 모양입니다.
      </p>

      <Callout kind="key">
        확률은 표본 공간 위의 세기에서 시작합니다. 조건부 확률 P(A | B)는 표본 공간을 B로 줄여 다시 센 비율이고, 독립은 P(A ∩ B) = P(A)P(B)입니다. 베이즈 정리는 P(E | H)에서 P(H | E)를 구하며, 결과는 사전확률에 크게 좌우됩니다. 증거가 여러 개면 로그 오즈를 더해 가며 갱신합니다.
      </Callout>
      <Quiz
        q={<>공정한 동전을 두 번 던진다. A = "첫 번째가 앞면", B = "두 번 모두 같은 면"일 때 A와 B의 관계는?</>}
        options={['배반이다', '독립이다', 'B가 일어나면 A의 확률이 1이 된다', 'A가 일어나면 B의 확률이 0이 된다']}
        answer={1}
        explain={<>표본 공간은 {'{앞앞, 앞뒤, 뒤앞, 뒤뒤}'}이고 P(A) = 1/2, P(B) = 1/2, A ∩ B = {'{앞앞}'}이라 P(A ∩ B) = 1/4 = P(A)P(B)입니다. 두 번이 같은 면이라는 것을 알아도 첫 번째가 앞면일 확률은 1/2 그대로입니다. 앞앞이 둘 다에 속하므로 배반도 아닙니다.</>}
      />
    </>
  );
}
