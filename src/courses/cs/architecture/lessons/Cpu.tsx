import { useMemo, useRef, useState } from 'react';
import { Callout, Code, Figure, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { courseHref, lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { FOR_SRC, MEM, NO_ARG, OPS, OP_INFO, PHASE_NAME, PROGRAMS, assemble, bin8, decode, encode, hex2, runTrace, type CpuFrame, type Program } from './cpu';
import '../../algorithms/lessons/algorithms.css';
import './arch.css';

/** Assembly text for a byte, using label names where the program has them. */
function disasm(byte: number, names: Record<number, string>) {
  const { op, addr } = decode(byte);
  return NO_ARG.has(op) ? op : `${op} ${names[addr] ?? addr}`;
}

/* ─────────────── Figure 1: one byte, one instruction ─────────────── */

function EncodeFigure() {
  const [byte, setByte] = useState(encode(2, 12));
  const { op, opIdx, addr } = decode(byte);
  const bits = bin8(byte).split('').map(Number);
  const flip = (i: number) => setByte(byte ^ (1 << (7 - i)));
  return (
    <Figure
      no={1}
      title="바이트 하나가 명령어 하나"
      hint="비트를 누르거나 명령어를 골라 보세요"
      caption={<>이 장의 가상 CPU는 명령어 하나가 정확히 1바이트입니다. 위 3비트(파랑)가 무엇을 할지 고르는 연산 코드(opcode)이고, 아래 5비트(주황)가 대상 메모리 주소(0~31)입니다. 해독기가 위 3비트를 보고 8개 중 한 줄만 켜는 것은 지난 장의 메모리 주소 해독기와 똑같은 회로입니다.</>}
    >
      <div className="enc">
        <div className="enc-bits" role="group" aria-label="명령어 바이트의 비트">
          {bits.map((b, i) => (
            <button key={i} type="button" className="fbit enc-bit" data-f={i < 3 ? 'e' : 'm'} aria-pressed={!!b} aria-label={`${i < 3 ? '연산 코드' : '주소'} 비트, 지금 ${b}`} onClick={() => flip(i)}>
              {b}
            </button>
          ))}
          <span className="enc-lbl" style={{ gridColumn: '1 / span 3', color: 'var(--neg)' }}>
            연산 코드 = {opIdx}
          </span>
          <span className="enc-lbl" style={{ gridColumn: '5 / span 5', color: 'var(--pos)' }}>
            주소 = {addr}
          </span>
        </div>
        <div className="enc-ops" role="group" aria-label="연산 코드 해독기 출력">
          {OPS.map((o, k) => (
            <button key={o} type="button" className="enc-op" aria-pressed={k === opIdx} onClick={() => setByte(encode(k, addr))}>
              <i aria-hidden="true" />
              <span className="mono">{k.toString(2).padStart(3, '0')}</span>
              <strong>{o}</strong>
            </button>
          ))}
        </div>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Readout label="16진수로" value={`0x${hex2(byte)}`} />
        <Readout label="어셈블리로" value={NO_ARG.has(op) ? op : `${op} ${addr}`} color="var(--neg)" />
        <Readout label="하는 일" value={<span style={{ fontSize: 'var(--fs-sm)' }}>{OP_INFO[op].rtl.replace(/\ba\b/, String(addr))}</span>} />
      </div>
      {NO_ARG.has(op) && <div className="arch-small">{op}는 주소가 필요 없으므로 아래 5비트를 무시합니다.</div>}
    </Figure>
  );
}

/* ─────────────── Figure 2: the CPU, phase by phase ─────────────── */

type PresetId = keyof typeof PROGRAMS;
const PRESET_IDS = Object.keys(PROGRAMS) as PresetId[];

function MemList({ prog, f, code }: { prog: Program; f: CpuFrame; code: Set<number> }) {
  const used = Math.max(prog.used, f.pc + 1, f.at + 1);
  return (
    <div className="mem-list" role="table" aria-label="메모리 내용">
      <div className="mem-row mem-head" role="row">
        <span role="columnheader" />
        <span role="columnheader">주소</span>
        <span role="columnheader">바이트</span>
        <span role="columnheader">뜻</span>
      </div>
      {f.mem.slice(0, Math.min(MEM, used)).map((v, a) => {
        const isCode = code.has(a);
        const bits = bin8(v);
        const name = prog.names[a];
        const cur = f.phase !== 'start' && f.phase !== 'limit' && a === f.at;
        return (
          <div key={a} className="mem-row" role="row" data-cur={cur || undefined} data-read={f.read === a || undefined} data-write={f.write === a || undefined}>
            <span className="mem-pc" role="cell" aria-label={a === f.pc ? '프로그램 카운터가 가리키는 곳' : undefined}>
              {a === f.pc ? '▶' : ''}
            </span>
            <span className="mono mem-a" role="cell">
              {a}
            </span>
            <span className="mono mem-b" role="cell">
              {isCode ? (
                <>
                  <b className="op">{bits.slice(0, 3)}</b>
                  <b className="ad">{bits.slice(3)}</b>
                </>
              ) : (
                bits
              )}
            </span>
            <span className="mono mem-asm" role="cell">
              {name && <span className="mem-lbl">{name}:</span>}
              {isCode ? disasm(v, prog.names) : <span className="mem-data">{v}</span>}
            </span>
          </div>
        );
      })}
      {used < MEM && (
        <div className="mem-rest">
          주소 {used}–{MEM - 1}: 모두 0
        </div>
      )}
    </div>
  );
}

function CpuFigure() {
  const [preset, setPreset] = useState<PresetId | 'custom'>('sum');
  const [src, setSrc] = useState(PROGRAMS.sum.src);
  const parsed = useMemo(() => assemble(src), [src]);
  const good = useRef<Program>(parsed);
  if (!parsed.errors.length) good.current = parsed;
  const prog = good.current;
  const frames = useMemo(() => runTrace(prog.mem, prog.names), [prog]);
  const s = useStepper(frames.length, 4, prog);
  const f = frames[s.i];
  const { op, addr } = decode(f.ir);

  const pick = (p: PresetId | 'custom') => {
    setPreset(p);
    if (p !== 'custom') setSrc(PROGRAMS[p].src);
  };

  return (
    <Figure
      no={2}
      title="가상 CPU를 한 단계씩"
      hint="재생하거나 한 단계씩 넘겨 보세요"
      caption={<>왼쪽은 메모리 32바이트 중 쓰는 부분입니다. 명령어 칸은 연산 코드(파랑)와 주소(주황)로 나눠 보였고, ▶는 프로그램 카운터(PC)가 가리키는 다음 명령어입니다. 노란 줄은 지금 처리 중인 명령어, 초록 칸은 방금 읽은 메모리, 주황 칸은 방금 쓴 메모리입니다. 한 단계는 인출, 해독, 실행 중 하나입니다.</>}
    >
      <div className="controls row">
        <Seg label="프로그램" value={preset} onChange={pick} options={PRESET_IDS.map((k) => ({ value: k, label: PROGRAMS[k].name }))} />
      </div>
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <MemList prog={prog} f={f} code={prog.code} />
          <details className="asm-edit">
            <summary>어셈블리 직접 고치기</summary>
            <textarea
              className="text-input asm-src"
              value={src}
              spellCheck={false}
              aria-label="어셈블리 소스"
              rows={Math.min(18, src.split('\n').length + 1)}
              onChange={(e) => {
                setSrc(e.target.value);
                setPreset('custom');
              }}
            />
            {parsed.errors.length ? (
              <ul className="asm-errs" aria-live="polite">
                {parsed.errors.slice(0, 4).map((e, i) => (
                  <li key={i}>
                    {e.no}번째 줄: {e.msg}
                  </li>
                ))}
                <li className="dim">오류를 고칠 때까지 마지막으로 올바르던 프로그램을 보여 줍니다.</li>
              </ul>
            ) : (
              <div className="arch-small">줄마다 "이름: 명령어 주소" 또는 "이름: 값"을 씁니다. 세미콜론(;) 뒤는 주석입니다. 명령어는 {OPS.join(', ')}입니다.</div>
            )}
          </details>
        </div>
        <div className="controls">
          <div className="phase-row" aria-label="단계">
            {(['fetch', 'decode', 'execute'] as const).map((p) => (
              <span key={p} className="phase" data-on={f.phase === p || undefined}>
                {PHASE_NAME[p]}
              </span>
            ))}
          </div>
          <div className="cpu-regs">
            <Readout label="PC (다음 명령어 주소)" value={f.pc} />
            <Readout label="IR (명령어 레지스터)" value={f.phase === 'start' ? '—' : `${hex2(f.ir)} = ${NO_ARG.has(op) ? op : `${op} ${addr}`}`} />
            <Readout label="ACC (누산기)" value={`${f.acc} = ${bin8(f.acc)}`} color="var(--pos)" />
            <Readout label="출력" value={f.out.length ? f.out.join(', ') : '—'} color="var(--good)" />
          </div>
          <div className="arch-note" aria-live="polite" style={{ minHeight: '3.4em' }}>
            {f.note}
          </div>
          <StepControls s={s} id="cpu-speed" maxSpeed={20} />
          <div className="arch-small">
            실행한 명령어 {f.n}개 · {preset !== 'custom' ? PROGRAMS[preset].about : '직접 고친 프로그램'}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: a for loop as jumps ─────────────── */

type Region = 'init' | 'cond' | 'body' | 'update' | 'back' | 'done' | 'none';
const JS_LINES: { text: string; region: Region }[] = [
  { text: 'let total = 0;', region: 'none' },
  { text: 'for (let i = 0;', region: 'init' },
  { text: '     i < n;', region: 'cond' },
  { text: '     i++) {', region: 'update' },
  { text: '  total += step;', region: 'body' },
  { text: '}', region: 'back' },
  { text: 'console.log(total);', region: 'done' },
];
const ADDR_REGION: Region[] = ['init', 'init', 'cond', 'cond', 'cond', 'body', 'body', 'body', 'update', 'update', 'update', 'back', 'done', 'done', 'done'];
const REGION_NAME: Record<Region, string> = { init: '초기화', cond: '조건 검사', body: '본문', update: '증가', back: '되돌아가기', done: '반복 뒤', none: '' };
const FOR_PROG = assemble(FOR_SRC);

function ForLoopFigure() {
  const [n, setN] = useState(3);
  const [step, setStep] = useState(4);
  const frames = useMemo(() => {
    const mem = FOR_PROG.mem.slice();
    mem[FOR_PROG.labels.n] = n;
    mem[FOR_PROG.labels.step] = step;
    // one frame per finished instruction
    return runTrace(mem, FOR_PROG.names).filter((f) => f.phase === 'start' || f.phase === 'execute' || f.phase === 'halt');
  }, [n, step]);
  const s = useStepper(frames.length, 3, `${n}|${step}`);
  const f = frames[s.i];
  const region: Region = s.i === 0 ? 'none' : ADDR_REGION[f.at] ?? 'none';
  const jumps = frames.slice(1, s.i + 1).filter((x) => x.jumped).length;
  const asmLines = FOR_PROG.lines.filter((l) => l.addr !== null && FOR_PROG.code.has(l.addr));
  const L = FOR_PROG.labels;

  return (
    <Figure
      no={3}
      title="for 반복문이 기계어가 되면"
      hint="n과 step을 바꾸고 재생해 보세요"
      caption={<>왼쪽 JavaScript와 오른쪽 기계어(어셈블리)는 같은 일을 합니다. 색이 같은 부분끼리 대응합니다. 기계어에는 반복문이 없습니다. 조건을 계산해 JZ로 빠져나가고, 본문과 증가가 끝나면 JMP로 조건 검사에 되돌아갈 뿐입니다. 한 단계는 명령어 하나입니다.</>}
    >
      <div className="loop-pair">
        <div className="loop-col">
          <span className="loop-h">JavaScript</span>
          <pre className="loop-code mono">
            {JS_LINES.map((l, i) => (
              <span key={i} className="loop-line" data-r={l.region} data-on={(region !== 'none' && l.region === region) || undefined}>
                {l.text}
                {'\n'}
              </span>
            ))}
          </pre>
          <div className="loop-vars">
            {(['n', 'step', 'i', 'total'] as const).map((v) => (
              <Readout key={v} label={`${v} (주소 ${L[v]})`} value={f.mem[L[v]]} color={v === 'i' ? 'var(--neg)' : v === 'total' ? 'var(--pos)' : undefined} />
            ))}
          </div>
        </div>
        <div className="loop-col">
          <span className="loop-h">우리 CPU의 어셈블리</span>
          <pre className="loop-code mono">
            {asmLines.map((l) => {
              const r = ADDR_REGION[l.addr!];
              const txt = l.src.replace(/;.*$/, '').trimEnd();
              return (
                <span key={l.no} className="loop-line" data-r={r} data-on={(s.i > 0 && f.at === l.addr) || undefined}>
                  <span className="loop-addr">{String(l.addr).padStart(2, ' ')}</span>
                  {txt}
                  {l.addr === f.at && s.i > 0 && f.jumped ? <span className="loop-jump"> ↩ 점프</span> : null}
                  {'\n'}
                </span>
              );
            })}
          </pre>
        </div>
      </div>
      <div className="fig-cols">
        <div className="controls">
          <Slider id="fl-n" label="n (반복 횟수)" value={n} min={0} max={6} step={1} onChange={setN} />
          <Slider id="fl-step" label="step (더할 값)" value={step} min={1} max={9} step={1} onChange={setStep} />
          <div className="arch-note" aria-live="polite">
            {s.i === 0 ? '재생을 누르면 명령어를 하나씩 실행합니다.' : `${REGION_NAME[region]}: ${f.note.replace(/^실행: /, '')}`}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="fl-speed" maxSpeed={20} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="실행한 명령어" value={`${f.n}개`} />
            <Readout label="점프한 횟수" value={`${jumps}번`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Cpu() {
  return (
    <>
      <h2>프로그램도 메모리 속 바이트다</h2>
      <p>
        지금까지 수를 비트로 나타내고(1장), 게이트로 계산하고(2장), 플립플롭과 메모리로 기억하는 법(3장)을 봤습니다. 남은 질문은 "무엇을 계산할지 누가 정하나"입니다. 답은 <strong>그것도 메모리에 적어 둔다</strong>입니다. 할 일을 순서대로 적은 <T en="instruction">명령어</T>를 데이터와 같은 메모리에 바이트로 넣어 두고, 회로가 그것을 하나씩 읽어 그대로 따릅니다. 1945년 폰 노이만이 정리한 이 <T en="stored-program computer">프로그램 내장 방식</T> 덕분에, 컴퓨터는 회로를 바꾸지 않고 메모리 내용만 바꿔 다른 일을 합니다.
      </p>
      <p>명령어를 읽고 따르는 회로가 <T en="central processing unit">CPU</T>입니다. 이 장의 가상 CPU에는 부품이 다섯 개 있습니다.</p>
      <ul>
        <li>
          <T en="program counter">PC (프로그램 카운터)</T>: 다음에 실행할 명령어의 주소를 담은 레지스터.
        </li>
        <li>
          <T en="instruction register">IR (명령어 레지스터)</T>: 메모리에서 방금 읽어 온 명령어 바이트.
        </li>
        <li>
          <T en="accumulator">ACC (누산기)</T>: 계산 결과를 담는 레지스터. 모든 덧셈과 뺄셈이 여기서 일어납니다.
        </li>
        <li>
          <T en="arithmetic logic unit">ALU</T>: 지난 장의 덧셈기를 품은 계산 회로.
        </li>
        <li>
          <T en="control unit">제어 장치</T>: 명령어를 해독해 어느 레지스터를 어디로 보낼지 정하는 회로.
        </li>
      </ul>

      <h2>명령어와 기계어</h2>
      <p>
        CPU가 알아듣는 명령어의 목록을 <T en="instruction set">명령어 집합</T>이라고 합니다. 이 장의 CPU는 명령어가 8개뿐이고, 모두 1바이트입니다. 3비트로 명령어 종류를 고르고, 나머지 5비트로 메모리 주소를 가리킵니다. 이렇게 비트로 적힌 명령어가 <T en="machine code">기계어</T>이고, 사람이 읽도록 <code>ADD 12</code>처럼 글자로 적은 것이 <T en="assembly">어셈블리</T>입니다. 어셈블리를 기계어로 바꾸는 프로그램을 어셈블러라고 하며, 둘은 거의 한 줄씩 대응합니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>코드</th>
              <th>명령어</th>
              <th>하는 일</th>
            </tr>
          </thead>
          <tbody>
            {OPS.map((o, k) => (
              <tr key={o}>
                <td className="mono">{k.toString(2).padStart(3, '0')}</td>
                <td className="mono">
                  <strong>{o}</strong>
                  {NO_ARG.has(o) ? '' : ' a'}
                </td>
                <td>
                  {OP_INFO[o].says} <span className="mono" style={{ color: 'var(--ink-3)' }}>({OP_INFO[o].rtl})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <EncodeFigure />
      <p>
        그림 1에서 <code>ADD 12</code>는 <code>010 01100</code>, 16진수로 <code>0x4C</code>입니다. 메모리에서 이 바이트만 보면 76이라는 수와 구별할 수 없습니다. 1장에서 본 대로 비트에는 뜻이 없고, PC가 가리켜 명령어로 읽힐 때만 명령어가 됩니다. 실제로 데이터를 명령어로 잘못 실행하게 만드는 것이 오래된 해킹 기법의 핵심이었고, 지금의 운영체제는 데이터 영역을 실행하지 못하게 막아 둡니다.
      </p>

      <h2>인출, 해독, 실행</h2>
      <p>CPU가 하는 일은 세 단계를 끝없이 되풀이하는 것뿐입니다.</p>
      <ol>
        <li>
          <T en="fetch">인출</T>: PC가 가리키는 주소의 바이트를 IR로 읽고, PC를 1 올립니다.
        </li>
        <li>
          <T en="decode">해독</T>: IR의 비트를 쪼개 어떤 명령어인지, 어느 주소를 쓰는지 알아냅니다.
        </li>
        <li>
          <T en="execute">실행</T>: ALU로 계산하거나, 메모리를 읽고 쓰거나, PC를 바꿉니다.
        </li>
      </ol>
      <p>
        그림 2는 1부터 n까지 더하는 프로그램입니다. 한 단계씩 넘기며 PC와 IR, ACC가 어떻게 바뀌는지 보세요. 대부분의 명령어는 PC를 1씩 올리기만 해서 다음 줄로 넘어가고, <code>JMP</code>와 <code>JZ</code>만 PC를 다른 값으로 덮어써서 흐름을 바꿉니다.
      </p>
      <CpuFigure />
      <p>
        재생해 보면 같은 여덟 줄이 n번 되풀이되고, n이 0이 되는 순간 <code>JZ end</code>가 반복을 끊습니다. 다른 프로그램도 골라 보세요. 곱셈 명령어가 없는 CPU에서 6 × 7을 하려면 덧셈을 일곱 번 하는 수밖에 없습니다. "어셈블리 직접 고치기"를 열어 숫자를 바꾸거나 새 프로그램을 써 볼 수도 있습니다. <code>n</code>을 300으로 바꾸면 어떻게 될까요? 한 바이트에 들어가지 않는다는 오류가 납니다. 1부터 30까지 더하면 465인데, ACC가 8비트라 465 − 256 = 209가 나옵니다. 1장의 오버플로가 여기서도 그대로 일어납니다.
      </p>
      <Callout kind="intuition">
        CPU는 요리법을 한 줄씩 읽는 요리사와 같습니다. 손가락(PC)으로 읽던 줄을 짚고, 줄을 읽고(인출), 무슨 뜻인지 생각하고(해독), 그대로 합니다(실행). "3번 줄로 돌아가시오"라는 줄을 만나면 손가락을 3번 줄로 옮깁니다. 요리사는 요리법 전체를 이해하지 못해도 됩니다.
      </Callout>

      <h2>분기와 반복문이 기계어가 되는 법</h2>
      <p>
        JavaScript에는 <code>if</code>, <code>for</code>, <code>while</code>, 함수 호출이 있지만 기계어에는 그런 것이 없습니다. 있는 것은 PC를 바꾸는 <T en="jump">점프</T>와, 조건이 맞을 때만 점프하는 <T en="conditional branch">조건 분기</T>뿐입니다. 컴파일러는 모든 제어 구조를 이 둘로 바꿉니다. <code>for (초기화; 조건; 증가) 본문</code>은 이렇게 됩니다.
      </p>
      <ol>
        <li>초기화를 한 번 실행합니다.</li>
        <li>조건을 계산해, 거짓이면 반복 뒤로 점프합니다.</li>
        <li>본문을 실행하고, 증가를 실행합니다.</li>
        <li>2번(조건 검사)으로 무조건 점프합니다.</li>
      </ol>
      <ForLoopFigure />
      <p>
        우리 CPU에는 "작다"를 비교하는 명령어가 없으므로, <code>i &lt; n</code>을 <code>n − i</code>를 계산해 0인지 보는 것으로 바꿨습니다. i가 0부터 1씩 커지므로 i가 n에 닿는 순간 반복을 끝내면 됩니다. 그림 3에서 n을 0으로 두면 본문을 한 번도 실행하지 않고 곧바로 반복 뒤로 점프합니다. <code>for</code>가 조건을 먼저 검사하기 때문입니다. 반복 한 번에 명령어가 10개씩 실행된다는 것도 세어 보세요. 반복문 안의 코드 한 줄을 줄이면 n배로 아껴지는 이유입니다.
      </p>
      <p>
        실제 CPU는 두 값을 비교해 결과를 <T en="flags">플래그</T>라는 비트들(0인가, 음수인가, 자리올림이 났나)에 남기고, 그 플래그를 보고 분기합니다. 2장의 덧셈기에서 나온 자리올림과 오버플로가 여기서 쓰입니다. 같은 반복문을 x86-64 CPU용으로 최적화 없이 컴파일하면 대략 이런 모양입니다.
      </p>
      <Code label="같은 for 반복문의 x86-64 어셈블리 (개념을 보여 주려 단순화)">{`
        mov  dword [i], 0        ; i = 0
.cond:  mov  eax, [i]
        cmp  eax, [n]            ; i - n을 계산해 플래그만 남긴다
        jge  .done               ; i >= n 이면 반복 끝으로
        mov  eax, [step]
        add  [total], eax        ; total += step
        add  dword [i], 1        ; i++
        jmp  .cond               ; 조건 검사로 되돌아가기
.done:
`}</Code>
      <p>
        <code>if/else</code>는 조건 분기 하나와 점프 하나, <code>while</code>은 <code>for</code>에서 초기화와 증가를 뺀 것입니다. 함수 호출은 돌아올 주소를 메모리(스택)에 적어 두고 함수의 첫 주소로 점프하는 일이고, <code>return</code>은 적어 둔 주소로 다시 점프하는 일입니다. 재귀 호출이 깊어지면 스택이 넘치는 이유가 여기에 있습니다. 재귀와 호출 스택은 <a href={lessonHref('cs-algorithm-design', 'recursion')}>재귀</a>에서 자세히 다룹니다.
      </p>

      <h2>실제 CPU는 무엇이 다른가</h2>
      <p>
        원리는 이 장의 CPU와 같지만, 실제 CPU는 속도를 위해 많은 것을 더했습니다.
      </p>
      <ul>
        <li>
          <strong>레지스터가 많고 넓습니다.</strong> x86-64는 64비트 범용 레지스터가 16개, ARM64는 31개입니다. 메모리보다 레지스터가 훨씬 빠르므로 컴파일러는 자주 쓰는 변수를 레지스터에 둡니다.
        </li>
        <li>
          <strong>명령어 길이와 종류가 다릅니다.</strong> 휴대폰과 애플 M 시리즈의 ARM은 명령어가 모두 4바이트이고, PC의 x86은 1바이트부터 15바이트까지 길이가 제각각입니다. 곱셈, 나눗셈, 부동소수점, 여러 값을 한꺼번에 계산하는 벡터 명령어도 있습니다.
        </li>
        <li>
          <strong>여러 명령어를 겹쳐서 실행합니다.</strong> 한 명령어를 실행하는 동안 다음 명령어를 해독하고, 그다음 명령어를 인출하는 <T en="pipelining">파이프라인</T>을 씁니다. 세탁기가 돌아가는 동안 건조기를 돌리는 것과 같습니다. 분기를 만나면 어느 쪽으로 갈지 미리 알 수 없어서, 과거 기록을 보고 결과를 짐작하는 <T en="branch prediction">분기 예측</T>을 합니다. 짐작이 틀리면 미리 해 둔 일을 버려야 합니다.
        </li>
        <li>
          <strong>코어가 여러 개입니다.</strong> 한 칩 안에 이 장의 CPU 같은 코어가 여러 개 들어 있어 여러 프로그램을 동시에 실행합니다.
        </li>
      </ul>
      <p>
        JavaScript는 어떻게 이 기계어가 될까요? 브라우저의 V8 같은 엔진은 처음에는 코드를 바이트코드라는 중간 명령어로 바꿔 한 줄씩 해석하다가, 자주 실행되는 함수를 발견하면 그 자리에서 기계어로 컴파일합니다(<T en="just-in-time compilation">JIT 컴파일</T>). 그러면 여러분의 <code>for</code> 반복문도 결국 그림 3과 같은 비교와 점프가 됩니다.
      </p>
      <Callout kind="note">
        CPU는 PC가 가리키는 명령어를 쉬지 않고 실행할 뿐, 지금 실행 중인 것이 어느 프로그램인지 모릅니다. 수십 개의 프로그램이 CPU 하나를 번갈아 쓰게 하고, 한 프로그램이 다른 프로그램의 메모리를 건드리지 못하게 막는 일은 운영체제가 합니다. 다음 과목 <a href={courseHref('cs-operating-systems')}>운영체제</a>에서 그 방법을 봅니다.
      </Callout>

      <Callout kind="key">
        프로그램은 메모리에 바이트로 저장된 명령어의 나열입니다. CPU는 PC가 가리키는 명령어를 인출하고, 해독하고, 실행하기를 되풀이합니다. 대부분의 명령어는 PC를 1 올리고, 점프와 조건 분기만 PC를 바꿉니다. <code>if</code>, <code>for</code>, 함수 호출 같은 모든 제어 구조는 컴파일되면 비교와 조건 분기, 점프가 됩니다.
      </Callout>
      <Quiz
        q="그림 3의 프로그램에서 n = 5일 때, 조건 검사(cond의 LOAD n, SUB i, JZ done)는 모두 몇 번 실행될까?"
        options={['4번', '5번', '6번', 'n과 상관없이 1번']}
        answer={2}
        explain={<>본문을 실행하기 전마다 한 번씩 5번, 그리고 i가 5가 되어 반복을 끝낼 때 한 번 더 검사하므로 모두 6번입니다. <code>for</code> 반복문은 n번 반복할 때 조건을 n + 1번 검사합니다. 그림 3에서 n을 바꿔 가며 세어 보세요.</>}
      />
    </>
  );
}
