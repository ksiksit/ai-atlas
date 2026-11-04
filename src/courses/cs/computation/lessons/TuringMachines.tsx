import { useEffect, useMemo, useRef, useState } from 'react';
import { Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { TM_PRESETS, census2, decode2, palindromeSteps, ruleKey, runTm, type Tm } from './machines';
import '../../algorithms/lessons/algorithms.css';
import './computation.css';

const sym = (tm: Tm, c: string) => (c === '_' ? '␣' : c);
const MOVE_KO = { L: '왼쪽', R: '오른쪽', S: '제자리' };

/* ─────────────── Figure 1: a Turing machine, one step at a time ─────────────── */

function TapeFigure() {
  const [pid, setPid] = useState(TM_PRESETS[0].value);
  const p = TM_PRESETS.find((x) => x.value === pid)!;
  const [input, setInput] = useState(p.input);
  const tm = p.tm;
  const run = useMemo(() => runTm(tm, input), [tm, input]);
  const s = useStepper(run.frames.length, 4, `${pid}|${input}`);
  const f = run.frames[s.i];
  const done = s.i === run.frames.length - 1;
  const haltKind = tm.halts[f.state];
  const lo = run.lo - 1;
  const hi = run.hi + 1;
  const cells = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
  const rule = f.rule ? tm.rules[f.rule] : null;
  const curSym = f.tape.get(f.head) ?? tm.blank;
  const ones = [...f.tape.values()].filter((c) => c === '1').length;
  const wrap = useRef<HTMLDivElement>(null);

  // keep the head in view when the tape is wider than the box
  useEffect(() => {
    const el = wrap.current;
    const cell = el?.querySelector<HTMLElement>('[data-head]');
    if (!el || !cell) return;
    const target = cell.offsetLeft - el.clientWidth / 2 + cell.offsetWidth / 2;
    if (cell.offsetLeft < el.scrollLeft + 30 || cell.offsetLeft > el.scrollLeft + el.clientWidth - 60) el.scrollLeft = target;
  }, [f.head, pid, input]);

  const pick = (v: string) => {
    const np = TM_PRESETS.find((x) => x.value === v)!;
    setPid(v);
    setInput(np.input);
  };
  const resultText = haltKind === 'acc' ? '수락' : haltKind === 'rej' ? '거부' : '멈춤';
  // what the tape means to a person, once the machine has stopped
  const out = Array.from({ length: hi - lo + 1 }, (_, k) => f.tape.get(lo + k) ?? '')
    .join('')
    .replace(/_/g, '');
  const meaning = (() => {
    if (!done || !haltKind) return '멈추면 여기에 결과를 풀어 씁니다';
    if (pid === 'inc') return input ? `${input}₂ = ${parseInt(input, 2)} → ${out}₂ = ${parseInt(out, 2)}` : `빈 입력 → ${out}`;
    if (pid === 'add') {
      const [a, b = ''] = input.split('+');
      return input.includes('+') ? `${a.length} + ${b.length} = ${out.length} (1이 ${out.length}개)` : `+가 없는 입력: 1이 ${out.length}개`;
    }
    if (pid === 'pal') return `${input || 'ε'}는 회문${haltKind === 'acc' ? '입니다' : '이 아닙니다'}`;
    return `1을 ${ones}개 쓰고 멈춤`;
  })();

  return (
    <Figure
      no={1}
      title="튜링 기계 시뮬레이터"
      hint="기계를 고르고 재생해 보세요. 속도를 올릴 수 있습니다"
      caption={<>삼각형이 머리의 위치, 노란 칸이 머리가 읽고 있는 칸입니다. 매 단계 기계는 (지금 상태, 읽은 기호)로 규칙표에서 한 칸(노란 칸)을 찾아, 그 칸에 적힌 대로 기호를 쓰고 머리를 한 칸 옮긴 뒤 다음 상태로 갑니다. 주황 밑줄은 방금 기호를 쓴 칸입니다. ␣는 빈칸이고, 테이프는 양쪽으로 필요한 만큼 늘어납니다. 규칙표에서 "1 R B"는 "1을 쓰고 오른쪽으로 한 칸 간 뒤 상태 B로"라는 뜻입니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div ref={wrap} className="tm-tape-wrap" role="img" aria-label={`테이프: 머리는 ${f.head - lo + 1}번째 칸, 읽은 기호 ${sym(tm, curSym)}, 상태 ${f.state}`}>
            <div className="tm-tape">
              {cells.map((i) => {
                const c = f.tape.get(i) ?? tm.blank;
                return (
                  <span key={i} className="tm-cell" data-head={i === f.head || undefined} data-blank={c === tm.blank || undefined} data-written={i === f.wrote || undefined}>
                    {sym(tm, c)}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="tm-status" aria-live="polite">
            <span>
              상태 <span className="state" data-halt={haltKind}>{f.state}</span>
            </span>
            <span>
              단계 <span className="mono">{f.step}</span>
            </span>
            {done && haltKind && (
              <strong style={{ color: haltKind === 'rej' ? 'var(--bad)' : 'var(--good)' }}>
                {resultText}: {f.step}번 움직이고 멈췄습니다
              </strong>
            )}
          </div>
          <div className="cmp-note">
            {rule ? (
              <>
                상태 <strong>{f.state}</strong>에서 <strong className="mono">{sym(tm, curSym)}</strong>를 읽었으니 <strong className="mono">{sym(tm, rule[0])}</strong>를 쓰고, {MOVE_KO[rule[1]]}{rule[1] === 'S' ? '에 머문 뒤' : '으로 한 칸 간 뒤'} 상태 <strong>{rule[2]}</strong>로 갑니다.
              </>
            ) : haltKind ? (
              <>정지 상태 {f.state}에 왔습니다. 테이프에 남은 것이 기계의 출력입니다.</>
            ) : (
              <>규칙이 없는 칸에 왔습니다.</>
            )}
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>{p.about}</div>
        </div>
        <div className="controls">
          <Seg label="기계" value={pid} onChange={pick} options={TM_PRESETS.map((x) => ({ value: x.value, label: x.label }))} />
          {p.inputAlphabet && (
            <div className="ctl">
              <label className="ctl-label" htmlFor="tm-input">
                <span>입력 ({p.inputAlphabet.split('').join(', ')})</span>
              </label>
              <input id="tm-input" className="cmp-text" type="text" value={input} spellCheck={false} autoComplete="off" onChange={(e) => setInput([...e.target.value].filter((c) => p.inputAlphabet.includes(c)).slice(0, 12).join(''))} />
            </div>
          )}
          <StepControls s={s} id="tm-speed" maxSpeed={40} />
          <div className="cmp-tbl-wrap">
            <table className="cmp-tbl tight" aria-label="규칙표">
              <thead>
                <tr>
                  <th>상태</th>
                  {tm.symbols.map((c) => (
                    <th key={c}>{sym(tm, c)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tm.states.map((q) => (
                  <tr key={q}>
                    <th className="row" data-s={q === f.state ? 'on' : undefined}>
                      {q === tm.start ? '→' : ''}
                      {q}
                    </th>
                    {tm.symbols.map((c) => {
                      const r = tm.rules[ruleKey(q, c)];
                      return (
                        <td key={c} data-s={f.rule === ruleKey(q, c) ? 'on' : r ? undefined : 'dim'}>
                          {r ? `${sym(tm, r[0])} ${r[1]} ${r[2]}` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Readout label="결과 풀어 읽기" value={<span style={{ fontSize: 'var(--fs-sm)' }}>{meaning}</span>} />
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--hl)', label: '머리가 읽는 칸 · 지금 쓰는 규칙', shape: 'sq' },
          { color: 'var(--pos)', label: '방금 쓴 칸', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: every 2-state machine ─────────────── */

const LIMIT_MAX = 40;

function CensusFigure() {
  const c = useMemo(() => census2(LIMIT_MAX), []);
  const [limit, setLimit] = useState(3);
  const byStep = useMemo(() => {
    const m = new Map<number, number>();
    for (const h of c.haltAt) if (h > 0) m.set(h, (m.get(h) ?? 0) + 1);
    return m;
  }, [c]);
  const maxStep = Math.max(...byStep.keys());
  const halted = [...byStep.entries()].filter(([t]) => t <= limit).reduce((a, [, v]) => a + v, 0);
  const running = c.total - halted;
  const champ = decode2(c.champSteps);
  const rows = [...Array.from({ length: maxStep }, (_, k) => ({ t: k + 1, v: byStep.get(k + 1) ?? 0 }))];
  const STATE = ['A', 'B', 'H'];
  const fmt = (v: number) => v.toLocaleString('ko-KR');

  return (
    <Figure
      no={3}
      title="상태 2개짜리 튜링 기계를 모두 돌려 보기"
      hint="단계 제한을 늘려 보세요"
      caption={<>상태 A, B와 기호 0, 1로 된 기계는 규칙표의 네 칸마다 (쓸 기호 2가지) × (방향 2가지) × (다음 상태 A, B, 정지 3가지) = 12가지를 고를 수 있어 모두 12⁴ = 20,736개입니다. 모두 빈 테이프(0만 있는 테이프)에서 출발시켜 정해진 단계 안에 멈추는지 봅니다. 막대는 몇 번째 단계에 멈췄는지에 따라 센 기계 수이고, 아직 제한에 닿지 않은 단계는 흐리게 표시됩니다.</>}
    >
      <div className="fig-split">
        <div className="growth-rows" style={{ ['--gn' as string]: '96px', ['--gt' as string]: '64px' }} role="img" aria-label={`단계 제한 ${limit}: 멈춘 기계 ${halted}개, 아직 멈추지 않은 기계 ${running}개`}>
          {rows.map((r) => {
            const on = r.t <= limit;
            return (
              <div key={r.t} className="growth-row" style={{ opacity: on ? 1 : 0.35 }}>
                <span className="growth-name">{r.t}단계에 멈춤</span>
                <span className="growth-track">
                  <span className="growth-bar" style={{ width: `${Math.max(0.6, (100 * r.v) / c.total)}%`, background: on ? 'var(--good)' : 'var(--line-strong)' }} />
                </span>
                <span className="growth-time mono">{on ? fmt(r.v) : '?'}</span>
              </div>
            );
          })}
          <div className="growth-row">
            <span className="growth-name">
              <strong>{limit}단계까지 안 멈춤</strong>
            </span>
            <span className="growth-track">
              <span className="growth-bar" style={{ width: `${(100 * running) / c.total}%`, background: 'var(--bad)' }} />
            </span>
            <span className="growth-time mono">{fmt(running)}</span>
          </div>
        </div>
        <div className="controls">
          <Slider id="tm-limit" label="단계 제한" value={limit} min={1} max={LIMIT_MAX} step={1} onChange={setLimit} color="var(--c-cs-3)" />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="멈춘 기계" value={fmt(halted)} color="var(--good)" />
            <Readout label="아직 안 멈춘 기계" value={fmt(running)} color="var(--bad)" />
          </div>
          <div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)', marginBottom: 6 }}>가장 오래 달린 기계 ({c.haltAt[c.champSteps]}단계, 1을 {c.ones[c.champSteps]}개 남김)</div>
            <table className="cmp-tbl" aria-label="가장 오래 달린 상태 2개짜리 기계의 규칙표">
              <thead>
                <tr>
                  <th>상태</th>
                  <th>0</th>
                  <th>1</th>
                </tr>
              </thead>
              <tbody>
                {['A', 'B'].map((q, qi) => (
                  <tr key={q}>
                    <th className="row">{q}</th>
                    {[0, 1].map((b) => {
                      const e = champ[qi * 2 + b];
                      return <td key={b}>{`${e.write} ${e.move > 0 ? 'R' : 'L'} ${STATE[e.next]}`}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the price of one tape ─────────────── */

const PAL_MAX = 40;

function CostFigure() {
  const P = usePalette();
  const [n, setN] = useState(16);
  const steps = useMemo(() => Array.from({ length: PAL_MAX }, (_, i) => palindromeSteps(i + 1)), []);
  const tmSteps = steps[n - 1];
  const loop = Math.floor(n / 2);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yMax = 900;
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: PAL_MAX, yMin: 0, yMax, pad: { l: 42, r: 12, t: 12, b: 28 } });
      plot.grid({ xStep: 5, yStep: 100, labels: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 0; x <= PAL_MAX; x += 10) ctx.fillText(String(x), plot.X(x), plot.Y(0) + 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 0; y <= yMax; y += 300) ctx.fillText(String(y), plot.X(0) - 6, plot.Y(y));
      ctx.fillStyle = P.ink2;
      ctx.textBaseline = 'bottom';
      ctx.font = `12px ${P.fontBody}`;
      ctx.fillText('n (입력 길이)', plot.X(PAL_MAX), plot.Y(0) - 14);
      plot.fn((x) => (x * x) / 2, P.lineStrong, 1.4, { dash: [5, 4], from: 0, to: PAL_MAX });
      plot.line(n, 0, n, yMax, P.lineStrong, 1, [3, 4]);
      const series = (ys: number[], col: string) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ys.forEach((v, i) => (i ? ctx.lineTo(plot.X(i + 1), plot.Y(v)) : ctx.moveTo(plot.X(i + 1), plot.Y(v))));
        ctx.stroke();
        plot.dot(n, ys[n - 1], 5, col, P.surface, 2);
      };
      series(steps, P.bad);
      series(
        steps.map((_, i) => Math.floor((i + 1) / 2)),
        P.good,
      );
    },
    [P, n, steps],
    { aspect: 1.9, maxHeight: 300, minHeight: 210 },
  );

  return (
    <Figure
      no={2}
      title="회문 검사: 테이프 한 줄의 대가"
      hint="입력 길이를 바꿔 보세요"
      caption={<>그림 1의 회문 검사 기계가 길이 n인 회문에서 움직이는 횟수(빨강)와, 배열의 양 끝에서 가운데로 오며 글자를 비교하는 JavaScript 반복문의 비교 횟수(초록)입니다. 점선은 n²/2입니다. 테이프 기계는 글자 한 쌍을 비교할 때마다 테이프 끝까지 걸어갔다 돌아와야 해서 n²에 비례하는 시간이 들고, 원하는 칸으로 바로 갈 수 있는 컴퓨터는 n에 비례하는 시간이면 됩니다. 계산할 수 있는 것은 같고, 걸리는 시간만 다릅니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`길이 ${n}인 회문: 튜링 기계 ${tmSteps}단계, 반복문 비교 ${loop}번`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="tm-pal-n" label="n (입력 길이)" value={n} min={1} max={PAL_MAX} step={1} onChange={setN} color="var(--c-cs-3)" />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="튜링 기계: 움직인 횟수" value={tmSteps.toLocaleString('ko-KR')} color="var(--bad)" />
            <Readout label="반복문: 글자 비교" value={loop} color="var(--good)" />
            <Readout label="n² / 2" value={(n * n) / 2} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--bad)', label: '튜링 기계 (테이프 한 줄)', shape: 'ln' },
          { color: 'var(--good)', label: '배열을 쓰는 반복문', shape: 'ln' },
          { color: 'var(--line-strong)', label: 'n² / 2', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function TuringMachines() {
  return (
    <>
      <h2>기계에게 공책을 주면</h2>
      <p>
        1936년, 젊은 수학자 앨런 튜링은 "계산한다는 것은 정확히 무엇인가"를 묻는 논문을 썼습니다. 그가 떠올린 것은 종이와 연필로 계산하는 사람이었습니다. 사람은 한 번에 종이의 한 곳만 보고, 거기에 기호를 쓰거나 지우고, 시선을 조금 옮기고, 머릿속으로 "지금 어느 단계인지"만 기억합니다. 튜링은 이것을 가장 단순한 형태로 줄였습니다.
      </p>
      <ul>
        <li>
          <strong>테이프</strong>: 칸으로 나뉜 끝없는 띠. 칸마다 기호 하나가 들어가고, 처음에는 입력을 뺀 나머지가 모두 빈칸입니다.
        </li>
        <li>
          <strong>머리</strong>: 한 번에 한 칸을 읽고 쓰며, 한 번에 한 칸씩 왼쪽이나 오른쪽으로 움직입니다.
        </li>
        <li>
          <strong>상태</strong>와 <strong>규칙표</strong>: 유한한 상태 중 하나에 있고, (지금 상태, 읽은 기호)마다 "무엇을 쓰고, 어디로 움직이고, 어느 상태로 갈지"가 정해져 있습니다.
        </li>
      </ul>
      <p>
        이 기계를 <T en="Turing machine">튜링 기계</T>라고 부릅니다. 유한 오토마타와 비교하면 다른 점은 하나입니다. 입력을 왼쪽에서 오른쪽으로 한 번 읽고 끝나는 대신, 테이프에 <strong>쓰고, 되돌아가서, 다시 읽을</strong> 수 있습니다. 테이프는 끝이 없으니 기억에 한도가 없습니다. 기계는 정지 상태에 들어가면 멈추고, 그때 테이프에 남은 것이 출력입니다. 수락·거부 상태를 두어 문자열을 판정하게 할 수도 있습니다.
      </p>
      <MB note="Γ: 테이프 기호, L/R: 머리를 왼쪽/오른쪽으로 한 칸">{'\\delta : Q \\times \\Gamma \\to \\Gamma \\times \\{L, R\\} \\times Q'}</MB>
      <TapeFigure />
      <p>
        규칙표는 어셈블리 프로그램을 닮았습니다. 표의 한 칸은 "상태가 q이고 읽은 기호가 s이면, 이것을 쓰고, 이쪽으로 움직이고, 저 상태로 가라"는 조건문 하나입니다. 상태가 프로그램 카운터, 테이프가 메모리인 셈입니다. "이진수 +1" 기계를 읽어 보면 상태 right는 "오른쪽 끝을 찾는 중", carry는 "받아올림을 들고 왼쪽으로 가는 중"이라는 뜻입니다. 회문 검사 기계는 지운 글자를 상태 이름(ra, rb)에 담아 들고 다닙니다. 기호 하나쯤은 상태로 기억할 수 있지만, 문자열 전체를 기억하려면 테이프가 필요합니다.
      </p>
      <Code label="튜링 기계 시뮬레이터">{`
// rules['A 0'] = ['1', 'R', 'B']  : 상태 A에서 0을 읽으면 1을 쓰고 오른쪽, 상태 B로
function runTuring(rules, input, start, halting, blank = '_') {
  const tape = new Map([...input].map((c, i) => [i, c]));  // 끝없는 테이프: 쓴 칸만 저장
  let head = 0, state = start, steps = 0;
  while (!halting.has(state)) {
    const read = tape.get(head) ?? blank;
    const rule = rules[state + ' ' + read];
    if (!rule) break;                         // 규칙이 없으면 멈춘다
    const [write, move, next] = rule;
    tape.set(head, write);
    head += move === 'R' ? 1 : move === 'L' ? -1 : 0;
    state = next;
    steps++;
  }
  return { state, steps, tape };
}`}</Code>

      <h2>테이프 한 줄로 무엇이든</h2>
      <p>
        이렇게 단순한 기계로 정말 아무 계산이나 할 수 있을까요? 덧셈과 곱셈은 물론, 정렬도, 소수 판정도, 체스 두는 프로그램도 원리상 튜링 기계로 짤 수 있습니다. 테이프를 여러 줄 주거나, 원하는 칸으로 바로 뛰어가는 메모리를 주거나, 기호를 더 늘려도 <strong>계산할 수 있는 것</strong>은 늘지 않습니다. 단순한 기계가 더 복잡한 기계를 한 단계씩 흉내 낼 수 있기 때문입니다. 달라지는 것은 시간뿐입니다. 그림 2에서 테이프 한 줄짜리 기계와 배열을 쓰는 프로그램을 비교해 보세요.
      </p>
      <CostFigure />
      <p>
        회문 검사에서 테이프 기계는 <M>{'O(n^2)'}</M>, 배열을 쓰는 프로그램은 <M>{'O(n)'}</M>입니다. 이런 차이는 언제나 다항식 정도에 머뭅니다. 지금의 컴퓨터가 <M>{'t'}</M>단계에 하는 일을 튜링 기계는 t의 다항식, 대략 <M>{'t^3'}</M> 정도의 단계로 흉내 낼 수 있습니다. 그래서 "다항 시간에 풀 수 있는가"라는 질문은 어떤 기계 모형을 고르든 답이 같고, <a href={lessonHref('cs-computation', 'undecidability')}>다음 장</a>의 P와 NP는 이 사실 위에 서 있습니다. 실행 시간을 세는 방법은 <a href={lessonHref('cs-algorithms', 'complexity')}>복잡도 장</a>을 보세요.
      </p>

      <h2>처치-튜링 논제</h2>
      <p>
        같은 해, 수학자 알론조 처치는 함수만으로 계산을 표현하는 람다 대수로 같은 질문에 답했습니다. 겉모습은 전혀 다르지만, 람다 대수로 계산할 수 있는 함수와 튜링 기계로 계산할 수 있는 함수는 정확히 같다는 것이 곧 밝혀졌습니다. 그 뒤로 제안된 계산 모형들, 레지스터 기계, 셀룰러 오토마타, 그리고 모든 범용 프로그래밍 언어도 같은 경계에 멈췄습니다.
      </p>
      <Callout kind="key" label="처치-튜링 논제">
        사람이 기계적인 절차로, 즉 정해진 규칙을 따라 유한한 단계 안에 계산할 수 있는 것은 모두 튜링 기계로 계산할 수 있다. 이것은 증명된 정리가 아니라 "계산"이라는 직관적인 말을 수학으로 정의하자는 주장입니다. 거의 100년 동안 반례가 나오지 않았습니다.
      </Callout>
      <p>
        어떤 시스템이 튜링 기계를 흉내 낼 수 있으면 <T en="Turing complete">튜링 완전</T>하다고 합니다. JavaScript, Python, C는 물론이고, 사용자 정의 함수(LAMBDA)가 들어간 뒤의 Excel 수식, 콘웨이의 생명 게임, 마인크래프트의 레드스톤 회로도 튜링 완전합니다. 엄밀히 말하면 실제 컴퓨터는 메모리가 유한해서 아주 큰 유한 오토마타입니다. 하지만 상태가 <M>{'2^{\\text{메모리 비트 수}}'}</M>개나 되는 기계는 끝없는 테이프를 가진 기계로 생각하는 편이 훨씬 잘 맞습니다.
      </p>
      <p>
        튜링의 논문에서 가장 중요한 발견은 따로 있습니다. 규칙표도 결국 기호의 나열이니 테이프에 적을 수 있습니다. 그러면 "테이프에 적힌 기계의 규칙표와 입력을 읽고, 그 기계가 하는 일을 한 단계씩 흉내 내는" 튜링 기계를 하나 만들 수 있습니다. 이것이 <T en="universal Turing machine">범용 튜링 기계</T>입니다. 프로그램을 데이터처럼 메모리에 넣고 실행하는 오늘날의 컴퓨터, 인터프리터, 에뮬레이터가 모두 이 아이디어입니다. <a href={lessonHref('cs-architecture', 'cpu')}>CPU 장</a>에서 메모리에서 명령어를 꺼내 실행하는 기계를 봅니다.
      </p>

      <h2>바쁜 비버</h2>
      <p>
        상태가 n개인 튜링 기계 중, 빈 테이프에서 출발해 <strong>결국 멈추는</strong> 것들 가운데 가장 오래 달리는 기계를 <T en="busy beaver">바쁜 비버</T>라고 합니다. 그림 1의 마지막 기계가 상태 4개짜리 바쁜 비버로, 107단계를 달리고 멈춥니다. 상태 2개짜리는 그림 3처럼 직접 모두 돌려 볼 수 있을 만큼 적습니다.
      </p>
      <CensusFigure />
      <p>
        단계 제한을 6까지 올리면 멈추는 기계가 더 늘지 않습니다. 남은 10,952개는 영원히 도는 것처럼 보이고, 상태 2개짜리 기계는 하나하나 손으로 따져서 정말 영원히 돈다는 것을 확인할 수 있습니다. 그래서 상태 2개의 최댓값은 6단계입니다. 상태 3개는 21단계, 4개는 107단계입니다. 상태 5개의 값 47,176,870단계는 수십 년 동안 풀리지 않다가 2024년에야 전 세계 참가자들이 함께한 프로젝트가 증명 보조기로 확정했습니다. 상태 6개짜리 기계 중에는 지금도 멈추는지 아무도 모르는 것들이 있습니다.
      </p>
      <Callout kind="intuition">
        어려움은 "아직 안 멈춘 기계"에 있습니다. 1,000만 단계를 돌려도 안 멈춘 기계가 1,000만 1단계째에 멈출 수도 있습니다. 돌려 보는 것만으로는 "영원히 안 멈춘다"를 알 수 없고, 기계마다 따로 증명을 찾아야 합니다. 이 일을 모든 기계에 대해 해 주는 프로그램이 있을까요? 다음 장에서 답은 "없다"임을 증명합니다.
      </Callout>

      <Quiz
        q="튜링 기계가 유한 오토마타보다 더 많은 언어를 인식할 수 있는 가장 중요한 이유는?"
        options={['상태를 더 많이 가질 수 있어서', '테이프에 쓰고 되돌아가 다시 읽을 수 있어서, 기억에 한도가 없어서', '여러 갈래를 동시에 따라가는 비결정적 기계라서', '한 단계에 여러 칸을 처리할 수 있어서']}
        answer={1}
        explain={<>튜링 기계의 상태도 유한합니다. 차이는 테이프입니다. 유한 오토마타는 입력을 한 번 지나가며 상태만 바꾸지만, 튜링 기계는 원하는 만큼 써 두고 다시 돌아와 읽을 수 있습니다. 그래서 aⁿbⁿ처럼 끝없이 세어야 하는 언어도, 회문도 다룹니다. 비결정적 튜링 기계를 만들어도 인식하는 언어는 늘지 않습니다.</>}
      />
    </>
  );
}
