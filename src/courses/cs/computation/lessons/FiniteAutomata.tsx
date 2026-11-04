import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { rng } from '../../../../lib/math';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { acceptsDfa, dfaEdges, runDfa, type Dfa } from './automata';
import { StateDiagram, type DNode, type Mark } from './Diagram';
import './computation.css';

const shown = (s: string) => (s === '' ? 'ε' : s);

/* ─────────────── Figure 1: four ready-made machines ─────────────── */

interface Preset {
  value: string;
  label: string;
  dfa: Dfa;
  pos: [number, number][];
  subs?: string[];
  input: string;
  width: number;
  height: number;
  about: string;
  note?: (read: string) => string;
}

const PRESETS: Preset[] = [
  {
    value: 'turnstile',
    label: '지하철 개찰구',
    dfa: { states: ['잠김', '열림'], alphabet: ['c', 'p'], start: 0, accept: [false, true], delta: [[1, 0], [1, 0]] },
    pos: [
      [120, 112],
      [300, 112],
    ],
    input: 'pcpccp',
    width: 420,
    height: 170,
    about: 'c는 동전 넣기, p는 밀고 지나가기. 마지막에 열려 있으면 수락합니다.',
    note: (r) => `동전 ${[...r].filter((c) => c === 'c').length}번, 밀기 ${[...r].filter((c) => c === 'p').length}번`,
  },
  {
    value: 'even',
    label: '1이 짝수 개',
    dfa: { states: ['짝', '홀'], alphabet: ['0', '1'], start: 0, accept: [true, false], delta: [[0, 1], [1, 0]] },
    pos: [
      [120, 112],
      [300, 112],
    ],
    input: '10110',
    width: 420,
    height: 170,
    about: '1을 읽을 때마다 짝과 홀을 오갑니다. 0은 아무것도 바꾸지 않습니다.',
    note: (r) => `지금까지 읽은 1: ${[...r].filter((c) => c === '1').length}개`,
  },
  {
    value: 'mod3',
    label: '3의 배수 (이진수)',
    dfa: { states: ['r0', 'r1', 'r2'], alphabet: ['0', '1'], start: 0, accept: [true, false, false], delta: [[0, 1], [2, 0], [1, 2]] },
    pos: [
      [80, 112],
      [210, 112],
      [340, 112],
    ],
    input: '1100',
    width: 420,
    height: 170,
    about: '상태 r0, r1, r2는 지금까지 읽은 이진수를 3으로 나눈 나머지입니다.',
    note: (r) => (r ? `읽은 수 ${r}₂ = ${parseInt(r, 2)}, 3으로 나눈 나머지 ${parseInt(r, 2) % 3}` : '아직 읽은 수가 없음 (0으로 봄)'),
  },
  {
    value: 'ab',
    label: 'ab가 들어 있음',
    dfa: { states: ['s0', 's1', 's2'], alphabet: ['a', 'b'], start: 0, accept: [false, false, true], delta: [[1, 0], [1, 2], [2, 2]] },
    pos: [
      [80, 112],
      [210, 112],
      [340, 112],
    ],
    subs: ['아직', 'a를 봄', 'ab를 봄'],
    input: 'bbaab',
    width: 420,
    height: 170,
    about: 's1은 "방금 a를 읽었다", s2는 "ab를 이미 보았다"를 기억합니다. s2에 들어가면 다시 나오지 않습니다.',
  },
];
const MAX_INPUT = 16;

function DfaFigure() {
  const [pid, setPid] = useState(PRESETS[0].value);
  const p = PRESETS.find((x) => x.value === pid)!;
  const [input, setInput] = useState(p.input);
  const d = p.dfa;
  const trace = useMemo(() => runDfa(d, input), [d, input]);
  const s = useStepper(trace.length, 2, `${pid}|${input}`);
  const f = trace[s.i];
  const done = s.i === trace.length - 1;
  const accepted = d.accept[f.state];
  const { edges, key } = useMemo(() => dfaEdges(d), [d]);
  const hot = f.edge ? key(f.edge[0], f.edge[1]) : -1;
  const nodes: DNode[] = d.states.map((label, q) => ({ id: q, x: p.pos[q][0], y: p.pos[q][1], label, accept: d.accept[q], sub: p.subs?.[q] }));

  const pick = (v: string) => {
    const np = PRESETS.find((x) => x.value === v)!;
    setPid(v);
    setInput(np.input);
  };
  const type = (v: string) => setInput([...v].filter((c) => d.alphabet.includes(c)).slice(0, MAX_INPUT).join(''));

  return (
    <Figure
      no={1}
      title="DFA에 문자열을 한 글자씩 넣기"
      hint="기계를 고르고 입력을 바꿔 재생해 보세요"
      caption={<>동그라미가 상태, 화살표가 전이입니다. 왼쪽의 짧은 화살표가 시작 상태를, 이중 동그라미가 수락 상태를 가리킵니다. 노란 상태가 지금 기계가 있는 곳이고 주황 화살표가 방금 따라간 전이입니다. 기계는 글자를 하나 읽을 때마다 화살표 하나를 따라갈 뿐, 지나온 글자를 따로 적어 두지 않습니다. 입력을 다 읽었을 때 수락 상태에 있으면 수락, 아니면 거부입니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <StateDiagram
            nodes={nodes}
            edges={edges}
            start={d.start}
            width={p.width}
            height={p.height}
            r={22}
            nodeMark={(q) => (q === f.state ? 'on' : undefined)}
            edgeMark={(i) => (i === hot ? 'hot' : undefined)}
            label={`${p.label} 상태 다이어그램. 상태 ${d.states.join(', ')}. 지금 상태 ${d.states[f.state]}`}
          />
          <div className="cmp-input" aria-label="입력 문자열">
            <span className="lbl">입력</span>
            {input.length ? (
              [...input].map((c, i) => (
                <span key={i} className="cmp-ch" data-st={i < f.pos - 1 ? 'done' : i === f.pos - 1 ? 'cur' : undefined}>
                  {c}
                </span>
              ))
            ) : (
              <span className="cmp-empty">빈 문자열 ε</span>
            )}
          </div>
          <div className="cmp-verdict" aria-live="polite">
            {done ? (
              <>
                입력을 다 읽었고 <strong>{d.states[f.state]}</strong>에 있으므로 <strong data-ok={accepted ? 'yes' : 'no'}>{accepted ? '수락' : '거부'}</strong>
              </>
            ) : (
              <>
                {f.pos === 0 ? '시작 상태에서 출발합니다.' : `${f.pos}번째 글자 ${input[f.pos - 1]}를 읽고 ${d.states[f.state]}로 왔습니다.`} 다음 글자: <span className="mono">{input[f.pos]}</span>
              </>
            )}
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>{p.about}</div>
        </div>
        <div className="controls">
          <Seg label="기계" value={pid} onChange={pick} options={PRESETS.map((x) => ({ value: x.value, label: x.label }))} />
          <div className="ctl">
            <label className="ctl-label" htmlFor="fa-input">
              <span>입력 ({d.alphabet.join(', ')}만)</span>
            </label>
            <input id="fa-input" className="cmp-text" type="text" value={input} spellCheck={false} autoComplete="off" onChange={(e) => type(e.target.value)} />
          </div>
          <StepControls s={s} id="fa-speed" maxSpeed={10} />
          <div className="cmp-tbl-wrap">
            <table className="cmp-tbl" aria-label="전이표">
              <thead>
                <tr>
                  <th>상태</th>
                  {d.alphabet.map((a, j) => (
                    <th key={a} data-s={f.edge && f.edge[1] === j ? 'on' : undefined}>
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.states.map((st, q) => (
                  <tr key={st}>
                    <th className="row" data-s={q === f.state ? 'on' : undefined}>
                      {q === d.start ? '→' : ''}
                      {d.accept[q] ? '*' : ''}
                      {st}
                    </th>
                    {d.delta[q].map((to, j) => (
                      <td key={j} data-s={f.edge && f.edge[0] === q && f.edge[1] === j ? 'on' : undefined}>
                        {d.states[to]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.note && <Readout label="기계 밖에서 세어 보면" value={<span style={{ fontSize: 'var(--fs-sm)' }}>{p.note(input.slice(0, f.pos))}</span>} />}
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--hl)', label: '지금 상태' },
          { color: 'var(--pos)', label: '방금 따라간 전이', shape: 'ln' },
          { color: 'var(--ink)', label: '이중 동그라미 = 수락 상태 · 표의 * 표시', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: build a DFA for a target language ─────────────── */

interface Target {
  value: string;
  label: string;
  test: (s: string) => boolean;
  k: number;
  delta: number[][];
  accept: boolean[];
}

const TARGETS: Target[] = [
  { value: 'endb', label: 'b로 끝남', test: (s) => s.endsWith('b'), k: 2, delta: [[0, 1], [0, 1], [0, 0], [0, 0]], accept: [false, true, false, false] },
  { value: 'evena', label: 'a가 짝수 개', test: (s) => [...s].filter((c) => c === 'a').length % 2 === 0, k: 2, delta: [[1, 0], [0, 1], [0, 0], [0, 0]], accept: [true, false, false, false] },
  { value: 'noaa', label: 'aa가 없음', test: (s) => !s.includes('aa'), k: 3, delta: [[1, 0], [2, 0], [2, 2], [0, 0]], accept: [true, true, false, false] },
  { value: 'ab', label: 'a로 시작, b로 끝', test: (s) => s.startsWith('a') && s.endsWith('b'), k: 4, delta: [[1, 3], [1, 2], [1, 2], [3, 3]], accept: [false, false, true, false] },
];
const TESTS = ['', 'a', 'b', 'aa', 'ab', 'ba', 'bb', 'aab', 'aba', 'abb', 'bab', 'bba', 'aaba', 'abab', 'babb', 'abba'];
const SIGMA = ['a', 'b'];
const LAYOUT: Record<number, { pos: [number, number][]; loop: ('up' | 'down')[]; w: number; h: number }> = {
  2: { pos: [[120, 100], [300, 100]], loop: ['up', 'up'], w: 420, h: 150 },
  3: { pos: [[95, 160], [325, 160], [210, 62]], loop: ['down', 'down', 'up'], w: 420, h: 230 },
  4: { pos: [[95, 62], [325, 62], [325, 178], [95, 178]], loop: ['up', 'up', 'down', 'down'], w: 420, h: 245 },
};
const blank = () => ({ delta: [[0, 0], [0, 0], [0, 0], [0, 0]], accept: [false, false, false, false] });

function BuildFigure() {
  const [tid, setTid] = useState(TARGETS[0].value);
  const target = TARGETS.find((t) => t.value === tid)!;
  const [k, setK] = useState(2);
  const [m, setM] = useState(blank);
  const [sel, setSel] = useState<string | null>(null);
  const dfa: Dfa = useMemo(
    () => ({ states: Array.from({ length: k }, (_, q) => `q${q}`), alphabet: SIGMA, start: 0, accept: m.accept.slice(0, k), delta: m.delta.slice(0, k).map((row) => row.map((t) => (t < k ? t : 0))) }),
    [k, m],
  );
  const results = TESTS.map((s) => ({ s, want: target.test(s), got: acceptsDfa(dfa, s) }));
  const right = results.filter((r) => r.want === r.got).length;
  const L = LAYOUT[k];
  const { edges, key } = useMemo(() => dfaEdges(dfa, (q) => L.loop[q]), [dfa, L]);
  const trace = sel !== null ? runDfa(dfa, sel) : null;
  const used = new Set(trace ? trace.filter((t) => t.edge).map((t) => key(t.edge![0], t.edge![1])) : []);
  const endState = trace ? trace[trace.length - 1].state : -1;
  const nodes: DNode[] = dfa.states.map((label, q) => ({ id: q, x: L.pos[q][0], y: L.pos[q][1], label, accept: dfa.accept[q] }));

  const cycle = (q: number, a: number) =>
    setM((old) => {
      const delta = old.delta.map((row) => [...row]);
      delta[q][a] = (Math.min(delta[q][a], k - 1) + 1) % k;
      return { ...old, delta };
    });
  const toggle = (q: number) => setM((old) => ({ ...old, accept: old.accept.map((v, i) => (i === q ? !v : v)) }));
  const pickTarget = (v: string) => {
    setTid(v);
    setSel(null);
  };
  const solve = () => {
    setK(target.k);
    setM({ delta: target.delta.map((r) => [...r]), accept: [...target.accept] });
  };

  return (
    <Figure
      no={2}
      title="목표 언어를 알아보는 DFA 만들기"
      hint="표의 칸을 눌러 화살표를 바꾸고, 수락 상태를 고르세요"
      caption={<>전이표의 칸을 누르면 그 전이가 가는 상태가 q0 → q1 → … 순서로 바뀌고, 오른쪽 상자로 수락 상태를 고릅니다. 아래의 시험 문자열 16개가 목표 언어에 속하는지(속함 / 아님)와 지금 기계의 판정이 다르면 빨갛게 표시됩니다. 시험 문자열을 누르면 그 문자열이 지나간 화살표와 끝난 상태가 다이어그램에 표시됩니다. 막히면 "정답 보기"로 한 가지 답을 볼 수 있습니다. 답은 여러 가지일 수 있습니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <StateDiagram
            nodes={nodes}
            edges={edges}
            start={0}
            width={L.w}
            height={L.h}
            r={21}
            nodeMark={(q) => (q === endState ? 'on' : undefined)}
            edgeMark={(i) => (!trace ? undefined : used.has(i) ? 'hot' : 'dim')}
            label={`직접 만든 DFA, 상태 ${k}개. 시험 문자열 ${TESTS.length}개 중 ${right}개를 맞게 판정함`}
          />
          <div className="fa-tests" role="group" aria-label="시험 문자열">
            {results.map((r) => (
              <button
                key={r.s}
                type="button"
                className="fa-test"
                data-ok={r.want === r.got ? 'yes' : 'no'}
                aria-pressed={sel === r.s}
                onClick={() => setSel(sel === r.s ? null : r.s)}
                style={{ cursor: 'pointer', background: sel === r.s ? 'var(--surface-2)' : undefined, color: 'var(--ink)', font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}
                aria-label={`${shown(r.s)}: 목표 ${r.want ? '속함' : '아님'}, 기계 ${r.got ? '수락' : '거부'}`}
              >
                <span>{shown(r.s)}</span>
                <span className="mk">{r.want === r.got ? (r.got ? '수락' : '거부') : r.got ? '수락 ✗' : '거부 ✗'}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="controls">
          <Seg label="목표 언어 (글자는 a, b)" value={tid} onChange={pickTarget} options={TARGETS.map((t) => ({ value: t.value, label: t.label }))} />
          <Seg label="상태 수" value={k} onChange={setK} options={[2, 3, 4].map((v) => ({ value: v, label: `${v}개` }))} />
          <div className="cmp-tbl-wrap">
            <table className="cmp-tbl" aria-label="편집할 수 있는 전이표">
              <thead>
                <tr>
                  <th>상태</th>
                  <th>a</th>
                  <th>b</th>
                  <th>수락</th>
                </tr>
              </thead>
              <tbody>
                {dfa.states.map((st, q) => (
                  <tr key={st}>
                    <th className="row" data-s={q === endState ? 'on' : undefined}>
                      {q === 0 ? '→' : ''}
                      {st}
                    </th>
                    {SIGMA.map((a, j) => (
                      <td key={a} style={{ padding: 3 }}>
                        <button type="button" className="cell-btn" onClick={() => cycle(q, j)} aria-label={`${st}에서 ${a}를 읽으면 ${dfa.states[dfa.delta[q][j]]}로 간다. 눌러서 바꾸기`}>
                          {dfa.states[dfa.delta[q][j]]}
                        </button>
                      </td>
                    ))}
                    <td>
                      <input type="checkbox" checked={dfa.accept[q]} onChange={() => toggle(q)} aria-label={`${st}를 수락 상태로`} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Readout label="맞게 판정한 시험 문자열" value={`${right} / ${TESTS.length}`} color={right === TESTS.length ? 'var(--good)' : undefined} />
          <div className="btn-row">
            <Button small onClick={solve}>
              정답 보기
            </Button>
            <Button small onClick={() => setM(blank())}>
              비우기
            </Button>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: why aⁿbⁿ needs infinitely many states ─────────────── */

/** The best a k-state machine can do: count up to m a's, then count the b's back down. */
function counterDfa(k: number): { dfa: Dfa; pos: [number, number][]; drawn: (from: number, to: number) => boolean } {
  const m = Math.max(0, Math.floor((k - 2) / 2));
  const extra = k - (2 * m + 2); // 0 or 1: one more a-counter that cannot check its b's
  const nA = m + 1 + extra;
  const A = (i: number) => i; // A0..A(nA-1)
  const R = (r: number) => nA + r; // R0..R(m-1): r more b's to go
  const dead = nA + m;
  const states = [...Array.from({ length: nA }, (_, i) => `A${i}`), ...Array.from({ length: m }, (_, r) => `B${r}`), '✕'];
  const delta: number[][] = states.map(() => [dead, dead]);
  const accept = states.map(() => false);
  accept[A(0)] = true;
  for (let i = 0; i < nA; i++) {
    delta[A(i)][0] = i + 1 < nA ? A(i + 1) : dead;
    if (i >= 1 && i - 1 < m) delta[A(i)][1] = R(i - 1);
  }
  for (let r = 0; r < m; r++) {
    if (r === 0) accept[R(0)] = true;
    else delta[R(r)][1] = R(r - 1);
  }
  const w = Math.max(nA, 2);
  const step = Math.min(78, 360 / w);
  const pos: [number, number][] = states.map((_, q) => {
    if (q < nA) return [50 + q * step, 60];
    if (q < dead) return [50 + (q - nA + 1) * step, 160];
    return [50 + w * step, 110];
  });
  return { dfa: { states, alphabet: ['a', 'b'], start: 0, accept, delta }, pos, drawn: (_f, to) => to !== dead };
}

function randomDfa(k: number, seed: number): Dfa {
  const r = rng(seed * 7919 + k);
  const states = Array.from({ length: k }, (_, q) => `q${q}`);
  return { states, alphabet: ['a', 'b'], start: 0, accept: states.map(() => r() < 0.45), delta: states.map(() => [0, 1].map(() => Math.floor(r() * k))) };
}

const pow = (c: string, n: number) => (n === 0 ? '' : `${c}${n === 1 ? '' : supNum(n)}`);
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const supNum = (n: number) => String(n).split('').map((d) => SUP[+d]).join('');
const word = (i: number, j: number) => (i + j === 0 ? 'ε' : pow('a', i) + pow('b', j));

function PigeonFigure() {
  const [kind, setKind] = useState<'counter' | 'random'>('counter');
  const [k, setK] = useState(4);
  const [seed, setSeed] = useState(1);
  const machine = useMemo(() => (kind === 'counter' ? counterDfa(k) : null), [kind, k]);
  const dfa = machine ? machine.dfa : randomDfa(k, seed);
  const pos: [number, number][] = machine ? machine.pos : dfa.states.map((_, q) => [210 + 120 * Math.cos((2 * Math.PI * q) / k - Math.PI / 2), 130 + 92 * Math.sin((2 * Math.PI * q) / k - Math.PI / 2)]);
  const W = machine ? Math.max(...pos.map((p) => p[0])) + 46 : 420;
  const H = machine ? 210 : 262;

  // states after reading a⁰, a¹, …, aᵏ: k + 1 prefixes but only k states
  const aTrace = runDfa(dfa, 'a'.repeat(k)).map((t) => t.state);
  let i = 0;
  let j = 1;
  outer: for (j = 1; j <= k; j++) for (i = 0; i < j; i++) if (aTrace[i] === aTrace[j]) break outer;
  const s1 = 'a'.repeat(i) + 'b'.repeat(i); // in the language
  const s2 = 'a'.repeat(j) + 'b'.repeat(i); // not in the language
  const last = (w: string) => {
    const t = runDfa(dfa, w);
    return t[t.length - 1].state;
  };
  const end1 = last(s1);
  const end2 = last(s2);
  const acc = dfa.accept[end1];
  const wrong = acc ? 2 : 1;

  const all = dfaEdges(dfa, (q) => (machine ? (pos[q][1] > 100 ? 'down' : 'up') : pos[q][1] > 130 ? 'down' : 'up'));
  // on the circle layout, bend every arrow a little so arrows that cross in the middle keep their labels apart
  if (!machine) for (const e of all.edges) if (e.from !== e.to) e.bend = e.bend ?? 12;
  const edgeShown = (e: { from: number; to: number }) => !machine || machine.drawn(e.from, e.to);
  const path = new Set(
    runDfa(dfa, 'a'.repeat(j))
      .filter((t) => t.edge)
      .map((t) => all.key(t.edge![0], t.edge![1])),
  );
  const nodeMark = (q: number): Mark => (q === aTrace[i] ? 'on' : undefined);

  return (
    <Figure
      no={3}
      title="상태가 k개인 기계는 a를 k개까지 셀 수 없다"
      hint="상태 수와 기계를 바꿔 보세요"
      caption={<>언어는 aⁿbⁿ(a를 n개 쓰고 b를 똑같이 n개 쓴 문자열)입니다. 위쪽 줄은 a⁰, a¹, …, aᵏ를 읽은 뒤의 상태입니다. 접두사는 k + 1개인데 상태는 k개뿐이라 어딘가에서 같은 상태가 두 번 나옵니다(비둘기집 원리). 노란 상태가 그 상태입니다. 그러면 뒤에 같은 b들을 붙인 두 문자열은 같은 상태에서 끝나므로 판정도 같습니다. 그런데 하나는 언어에 속하고 하나는 속하지 않으니, 기계는 둘 중 하나를 반드시 틀립니다. "세는 기계"에서는 그리지 않은 화살표가 모두 ✕(한번 들어가면 못 나오는 거부 상태)로 갑니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <StateDiagram
            nodes={dfa.states.map((label, q) => ({ id: q, x: pos[q][0], y: pos[q][1], label, accept: dfa.accept[q] }))}
            edges={all.edges}
            start={0}
            width={W}
            height={H}
            r={machine ? 19 : 18}
            nodeMark={nodeMark}
            edgeMark={(e) => (!edgeShown(all.edges[e]) ? 'hide' : path.has(e) ? 'hot' : 'dim')}
            label={`상태 ${k}개짜리 기계. a를 ${i}개 읽은 뒤와 ${j}개 읽은 뒤 모두 상태 ${dfa.states[aTrace[i]]}에 있음`}
          />
          <div className="cmp-chips" aria-label="a를 읽은 개수별 상태">
            <span className="lbl">a를 읽은 개수 → 상태</span>
            {aTrace.map((q, n) => (
              <span key={n} className="cmp-chip" data-s={n === i || n === j ? 'on' : n > j ? 'done' : undefined}>
                <small>{word(n, 0)}</small>
                {dfa.states[q]}
              </span>
            ))}
          </div>
          <div className="cmp-chips" aria-label="같은 상태에서 끝나는 두 문자열">
            <span className="lbl">{i === 0 ? '두 접두사를 그대로 넣으면' : `뒤에 b를 ${i}개 붙이면`}</span>
            <span className="cmp-chip" data-s={wrong === 1 ? 'bad' : 'good'}>
              {word(i, i)} <small>속함 · 기계 {acc ? '수락' : '거부'}</small>
            </span>
            <span className="cmp-chip" data-s={wrong === 2 ? 'bad' : 'good'}>
              {word(j, i)} <small>아님 · 기계 {dfa.accept[end2] ? '수락' : '거부'}</small>
            </span>
          </div>
          <div className="cmp-verdict">
            두 문자열 모두 상태 <strong>{dfa.states[end1]}</strong>에서 끝나므로 기계는 <strong data-ok="no">{wrong === 1 ? word(i, i) : word(j, i)}</strong>를 틀립니다.
          </div>
        </div>
        <div className="controls">
          <Seg
            label="기계"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'counter', label: '세는 기계' },
              { value: 'random', label: '무작위 기계' },
            ]}
          />
          <Slider id="pg-k" label="상태 수 k" value={k} min={2} max={7} step={1} onChange={setK} color="var(--c-cs-1)" />
          {kind === 'random' && (
            <div className="btn-row">
              <Button small onClick={() => setSeed((x) => x + 1)}>
                다른 기계 뽑기
              </Button>
            </div>
          )}
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="처음 겹친 두 접두사" value={`${word(i, 0)}, ${word(j, 0)}`} />
            <Readout label="같은 상태" value={dfa.states[aTrace[i]]} />
          </div>
          <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>
            {kind === 'counter' ? <>A 상태는 지금까지 읽은 a의 개수, B 상태는 앞으로 더 읽어야 할 b의 개수를 기억합니다. 상태가 k개면 a를 {Math.floor((k - 2) / 2)}개까지만 맞게 셉니다.</> : <>전이와 수락 상태를 무작위로 정한 기계입니다. 몇 번을 다시 뽑아도 반례가 나옵니다.</>}
          </p>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function FiniteAutomata() {
  return (
    <>
      <h2>기억이 거의 없는 기계</h2>
      <p>
        지하철 개찰구는 아주 단순한 기계입니다. 잠겨 있을 때 교통카드를 대면 열리고, 사람이 밀고 지나가면 다시 잠깁니다. 열려 있을 때 카드를 또 대도 그대로 열려 있고, 잠겨 있을 때 밀면 꿈쩍하지 않습니다. 개찰구는 지금까지 몇 명이 지나갔는지도, 누가 카드를 댔는지도 기억하지 않습니다. 기억하는 것은 "잠김"과 "열림" 중 어느 쪽인가, 딱 그것뿐입니다.
      </p>
      <p>
        이렇게 정해진 몇 가지 <T en="state">상태</T> 가운데 하나에 있다가, 입력이 들어올 때마다 규칙에 따라 다음 상태로 옮겨 가는 기계를 <T en="finite automaton">유한 오토마타</T>라고 합니다. 상태에서 상태로 옮겨 가는 규칙 하나하나가 <T en="transition">전이</T>입니다. 계산 이론에서는 입력을 글자의 나열, 즉 문자열로 봅니다. 쓸 수 있는 글자의 집합을 <T en="alphabet">알파벳</T> Σ라고 부르고, 개찰구의 알파벳은 {'{'}c(카드), p(밀기){'}'}입니다.
      </p>
      <p>
        기계는 처음에 정해진 <T en="start state">시작 상태</T>에서 출발해 입력을 왼쪽부터 한 글자씩 읽습니다. 다 읽은 뒤에 미리 정해 둔 <T en="accepting state">수락 상태</T> 중 하나에 있으면 그 문자열을 <strong>수락</strong>하고, 아니면 <strong>거부</strong>합니다. 상태와 글자마다 다음 상태가 정확히 하나로 정해져 있으면 <T en="deterministic finite automaton, DFA">결정적 유한 오토마타</T>, 줄여서 DFA라고 합니다. 수학적으로는 다섯 가지로 기계 하나가 완전히 정해집니다.
      </p>
      <MB note="Q: 상태의 유한 집합, Σ: 알파벳, δ: 전이 함수, q₀: 시작 상태, F: 수락 상태의 집합">{'M = (Q,\\ \\Sigma,\\ \\delta,\\ q_0,\\ F), \\qquad \\delta : Q \\times \\Sigma \\to Q'}</MB>
      <p>그림 1에서 네 기계에 문자열을 넣어 보세요. 다이어그램, 그리고 오른쪽의 전이표는 같은 δ를 두 가지로 그린 것입니다.</p>
      <DfaFigure />

      <h2>상태가 기억하는 것</h2>
      <p>
        "3의 배수 (이진수)" 기계는 조금 신기합니다. 상태가 세 개뿐인데, 아무리 긴 이진수를 넣어도 3의 배수인지 맞힙니다. 비결은 수 전체가 아니라 <strong>3으로 나눈 나머지</strong>만 기억하는 데 있습니다. 지금까지 읽은 수가 x이고 다음 비트 b를 읽으면 수는 2x + b가 됩니다. 이때 새 나머지는 x 전체가 아니라 x의 나머지 r만 알아도 계산됩니다.
      </p>
      <MB note="r0에서 1을 읽으면 1, r1에서 0을 읽으면 2, r2에서 0을 읽으면 4 mod 3 = 1. 그림 1의 화살표와 같습니다.">{'r_{\\text{new}} = (2r + b) \\bmod 3'}</MB>
      <p>
        유한 오토마타를 설계하는 요령이 여기 다 들어 있습니다. <strong>"남은 입력을 판정하는 데 지금까지의 입력에서 무엇을 알아야 하나?"</strong>를 묻고, 그 답이 될 수 있는 경우의 수만큼 상태를 만듭니다. 1이 짝수 개인지 알려면 개수 전체가 아니라 짝·홀만 알면 되고, ab가 들어 있는지 알려면 "방금 a를 읽었나"와 "이미 ab를 보았나"만 알면 됩니다. 코드로 옮기면 상태는 변수 하나, 전이는 표 한 장입니다.
      </p>
      <Code label="전이표로 쓴 DFA">{`
// 이진수가 3의 배수인지: 상태 = 지금까지 읽은 수를 3으로 나눈 나머지
const dfa = {
  start: 'r0',
  accept: new Set(['r0']),
  delta: {
    r0: { 0: 'r0', 1: 'r1' },
    r1: { 0: 'r2', 1: 'r0' },
    r2: { 0: 'r1', 1: 'r2' },
  },
};

function accepts(dfa, input) {
  let state = dfa.start;              // 기억하는 것은 이 변수 하나뿐
  for (const ch of input) {
    state = dfa.delta[state][ch];
    if (state === undefined) return false;   // 알파벳에 없는 글자
  }
  return dfa.accept.has(state);
}

accepts(dfa, '1100');  // true  (12)
accepts(dfa, '1101');  // false (13)`}</Code>
      <p>
        입력이 아무리 길어도 기계가 쓰는 메모리는 변수 하나로 일정하고, 글자 하나마다 표를 한 번 찾아보므로 시간은 입력 길이에 비례합니다. 이 점이 유한 오토마타가 실제 소프트웨어 곳곳에 쓰이는 이유입니다.
      </p>
      <p>
        DFA가 수락하는 문자열을 모두 모은 집합을 그 기계가 <T en="recognize">인식하는</T> <T en="language">언어</T>라고 합니다. 언어는 그냥 문자열의 집합입니다. "1이 짝수 개인 이진 문자열"이나 "ab가 들어 있는 문자열"처럼 대개 무한히 많은 문자열을 담고 있지만, 기계는 상태 몇 개로 그 무한한 집합을 정확히 가려냅니다. 어떤 DFA가 인식하는 언어를 <T en="regular language">정규 언어</T>라고 부릅니다.
      </p>

      <h2>직접 만들어 보기</h2>
      <p>
        그림 2에서 목표 언어를 고르고 기계를 직접 설계해 보세요. 처음에는 모든 화살표가 q0으로 가고 수락 상태가 없어서, 모든 문자열을 거부합니다. "b로 끝남"은 상태 두 개로 됩니다. 마지막으로 읽은 글자가 b였는지만 기억하면 되니까요. "aa가 없음"은 세 개, "a로 시작, b로 끝"은 네 개가 필요합니다.
      </p>
      <BuildFigure />
      <Callout kind="intuition" label="막다른 상태">
        "aa가 없음"을 만들다 보면 "이미 aa를 보았으니 뒤에 무엇이 오든 거부"인 상태가 필요해집니다. 들어가면 어떤 글자를 읽어도 자기 자신으로 돌아오는 거부 상태를 <T en="dead state, trap state">막다른 상태</T>라고 합니다. 다이어그램을 그릴 때는 흔히 생략하고 "그리지 않은 화살표는 모두 막다른 상태로 간다"고 약속합니다.
      </Callout>
      <p>
        시험 문자열 16개를 모두 맞혔다고 기계가 옳다는 보장은 없습니다. 길이 4까지의 문자열만 시험했으니까요. 기계가 옳다는 것을 보이려면 "각 상태가 무엇을 뜻하는지"를 문장으로 적고, 모든 전이가 그 뜻을 지키는지 하나씩 확인하는 편이 확실합니다. 예를 들어 "q1 = 지금까지 aa가 없었고, 마지막 글자가 a"라고 적어 두면, q1에서 a를 읽었을 때 막다른 상태로 가야 한다는 것이 바로 보입니다.
      </p>

      <h2>어디에 쓰이나</h2>
      <ul>
        <li>
          <strong>어휘 분석기</strong>: 컴파일러는 소스 코드를 읽어 <code>let</code>, <code>x</code>, <code>=</code>, <code>42</code> 같은 낱말(토큰)로 자르는 일부터 합니다. "숫자가 이어지는 동안은 숫자 토큰"처럼 토큰의 모양은 DFA로 기술되고, 도구가 그 DFA를 표로 만들어 코드에 넣습니다. <a href={lessonHref('cs-computation', 'grammars-parsing')}>문법과 파싱</a> 장에서 이 토큰을 받아 구조를 만듭니다.
        </li>
        <li>
          <strong>프로토콜</strong>: TCP 연결은 LISTEN, SYN-SENT, ESTABLISHED, FIN-WAIT 같은 상태와 그 사이의 전이로 정의됩니다. <a href={lessonHref('net-basics', 'tcp')}>TCP 장</a>의 3-way 핸드셰이크가 바로 상태 기계의 전이입니다.
        </li>
        <li>
          <strong>사용자 인터페이스</strong>: "불러오는 중 → 성공 / 실패 → 다시 시도" 같은 화면 흐름을 상태 기계로 적으면 "불러오는 중인데 또 버튼을 누르면?" 같은 경우를 빠뜨리지 않습니다. 이런 일만 하는 라이브러리(XState 등)도 있습니다.
        </li>
        <li>
          <strong>하드웨어</strong>: 신호등 제어기나 CPU의 제어 장치는 상태를 플립플롭에 담고 전이를 논리 회로로 만든 순차 회로입니다. <a href={lessonHref('cs-architecture', 'memory-circuits')}>기억 회로 장</a>에서 상태를 저장하는 회로를 봅니다.
        </li>
      </ul>

      <h2>유한 오토마타가 못 하는 일</h2>
      <p>
        이제 반대로, DFA로는 절대 알아볼 수 없는 언어를 찾아봅시다. a를 n개 쓰고 b를 똑같이 n개 쓴 문자열들, <M>{'\\{a^n b^n \\mid n \\ge 0\\}'}</M>을 생각합니다. ε, ab, aabb, aaabbb는 속하고 aab, abb, ba는 속하지 않습니다. 사람에게는 쉬운 일입니다. a를 세어 두었다가 b의 개수와 비교하면 됩니다. 그런데 DFA에게는 "세어 둔다"가 문제입니다. 기억이라고는 상태뿐인데, 상태는 유한하니까요.
      </p>
      <p>
        상태가 k개인 DFA가 있다고 해 봅시다. a를 0개, 1개, …, k개 읽은 직후의 상태를 적으면 k + 1개의 상태가 나옵니다. 상태는 k개뿐이므로 어떤 두 개, 예컨대 a를 i개 읽은 뒤와 j개 읽은 뒤(i &lt; j)가 같은 상태입니다. 이제 두 문자열 <M>{'a^i b^i'}</M>와 <M>{'a^j b^i'}</M>를 넣으면, a를 다 읽은 순간 두 기계는 같은 상태에 있고 이후에 읽는 b들도 똑같습니다. 따라서 끝나는 상태도, 판정도 같습니다. 그런데 앞의 것은 언어에 속하고 뒤의 것은 속하지 않습니다. 어떤 k를 고르든, 어떤 기계를 만들든 틀리는 문자열이 있다는 뜻입니다. 그림 3에서 확인해 보세요.
      </p>
      <PigeonFigure />
      <Callout kind="key">
        두 접두사 x, y 뒤에 어떤 같은 꼬리 z를 붙였을 때 한쪽만 언어에 속한다면, DFA는 x와 y를 읽은 뒤 서로 다른 상태에 있어야 합니다. aⁿbⁿ에서는 a⁰, a¹, a², …가 모두 서로 구별되어야 하므로 상태가 무한히 필요합니다. 유한 오토마타는 <strong>유한한 양</strong>만 기억할 수 있고, 끝없이 세어야 하는 언어는 인식하지 못합니다.
      </Callout>
      <p>
        같은 논리로 "괄호 짝이 맞는 문자열", "회문", "0과 1의 개수가 같은 문자열"도 정규 언어가 아닙니다. 교과서에서는 이 논증을 일반화해 <T en="pumping lemma">펌핑 보조정리</T>라는 이름으로 정리합니다. 상태 수보다 긴 문자열을 읽는 동안 기계는 반드시 어떤 상태를 다시 지나므로, 그 사이의 고리를 몇 번 더 돌거나 빼 버려도(펌핑) 기계의 판정이 변하지 않는다는 것입니다.
      </p>
      <p>
        한계가 있다는 것은 나쁜 소식만은 아닙니다. 기억이 유한하기 때문에 DFA는 아주 빠르고 예측 가능하며, 두 DFA가 같은 언어를 인식하는지, 어떤 문자열이든 수락하는지 같은 질문에도 항상 답할 수 있습니다. 뒤의 장에서 기억을 늘려 갈수록 할 수 있는 일은 많아지지만, 그만큼 답할 수 없는 질문도 생깁니다. 다음 장에서는 DFA와 같은 힘을 가진, 훨씬 편한 표기법인 <a href={lessonHref('cs-computation', 'regex')}>정규 표현식</a>을 봅니다.
      </p>

      <Quiz
        q="알파벳이 {a, b}일 때, DFA로 인식할 수 있는 언어는?"
        options={['a의 개수와 b의 개수가 같은 문자열', 'a의 개수가 3의 배수인 문자열', '앞에서 읽으나 뒤에서 읽으나 같은 문자열(회문)', 'a를 n개 쓴 뒤 b를 2n개 쓴 문자열']}
        answer={1}
        explain={<>a의 개수를 3으로 나눈 나머지(0, 1, 2)만 기억하면 되므로 상태 세 개짜리 DFA로 됩니다. b를 읽을 때는 상태가 바뀌지 않습니다. 나머지 셋은 모두 끝없이 세거나(개수 비교, aⁿb²ⁿ) 앞부분을 통째로 기억해야(회문) 해서, 그림 3과 같은 비둘기집 논증으로 어떤 유한한 기계도 틀리는 입력이 있음을 보일 수 있습니다.</>}
      />
    </>
  );
}
