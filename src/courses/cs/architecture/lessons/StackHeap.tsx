import { useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import {
  BUG_SRC,
  BUG_STEPS,
  HEAP_BASE,
  HEAP_UNITS,
  LEAK_BLOCK,
  LEAK_REQS,
  STACK_BYTES,
  STACK_SRC,
  STACK_TOP,
  UNIT,
  ad,
  blockAddr,
  heapInit,
  hfree,
  hmalloc,
  leakSrc,
  leakSteps,
  payload,
  type BugId,
  type Fit,
  type HBlock,
  type Heap,
  stackTrace,
  type SFrame,
  type StackProg,
} from './cmem';
import '../../algorithms/lessons/algorithms.css';
import './arch.css';
import './cmem.css';

/* ─────────────── Figure 1: the process memory map ─────────────── */

interface MapRegion {
  k: string;
  label: string;
  what: string;
  lo: number;
  hi: number; // fraction of the address space (0 = low, 1 = high)
}
const MAP: MapRegion[] = [
  { k: 'null', label: '접근 금지', what: '주소 0 근처. 널 포인터(NULL)를 건드리면 여기서 막혀 프로그램이 죽습니다.', lo: 0, hi: 0.08 },
  { k: 'code', label: '코드 (text)', what: '기계어 명령어. 읽기 전용이라 실수로도 덮어쓸 수 없습니다.', lo: 0.08, hi: 0.22 },
  { k: 'rodata', label: '읽기 전용 데이터', what: '"hello" 같은 문자열 상수와 const 값.', lo: 0.22, hi: 0.3 },
  { k: 'data', label: '전역·정적 데이터', what: '전역 변수. 프로그램이 끝날 때까지 한자리에 삽니다.', lo: 0.3, hi: 0.42 },
  { k: 'heap', label: '힙', what: 'malloc으로 빌리는 곳. 위(높은 주소)로 자랍니다. 크기를 미리 모르거나 함수보다 오래 살아야 하는 데이터.', lo: 0.42, hi: 0.58 },
  { k: 'gap', label: '빈 공간', what: '힙과 스택이 서로를 향해 자라며 나눠 쓰는 넓은 빈 땅. 대부분은 아직 어느 쪽도 쓰지 않습니다.', lo: 0.58, hi: 0.82 },
  { k: 'stack', label: '스택', what: '함수 호출마다 프레임이 쌓이는 곳. 아래(낮은 주소)로 자랍니다. 지역 변수와 돌아갈 주소.', lo: 0.82, hi: 0.96 },
  { k: 'kernel', label: '커널', what: '운영체제의 몫. 프로그램은 들여다볼 수 없습니다.', lo: 0.96, hi: 1 },
];

const MAP_H = 440;
const MAP_W = 210;
const MAP_X = 150;
const yOf = (frac: number) => 14 + (1 - frac) * (MAP_H - 28);

function MemoryMapFigure() {
  const [sel, setSel] = useState('heap');
  const cur = MAP.find((m) => m.k === sel)!;
  return (
    <Figure
      no={1}
      title="프로세스의 메모리 지도"
      hint="구역을 눌러 설명을 보세요"
      caption={<>한 프로그램(프로세스)이 쓰는 주소 공간을 위가 높은 주소가 되도록 그렸습니다. 주소는 0부터 꼭대기까지이고, 실제 64비트에서 꼭대기는 엄청나게 큰 수입니다. 가운데 넓은 빈 공간을 힙은 위로, 스택은 아래로 자라며 나눠 씁니다. 이 지도는 프로그램마다 따로 주어지는 가상 주소 공간입니다.</>}
    >
      <div className="fig-split left">
        <div className="cm-svg" style={{ maxWidth: 260 }}>
          <svg viewBox={`0 0 ${MAP_X + MAP_W + 40} ${MAP_H}`} role="img" aria-label={`메모리 지도. 낮은 주소부터 코드, 데이터, 힙, 빈 공간, 스택, 커널. 지금 ${cur.label} 선택됨`}>
            <text x={MAP_X - 8} y={yOf(1) + 4} textAnchor="end" fontSize={10.5} className="t-dim">
              높은 주소
            </text>
            <text x={MAP_X - 8} y={yOf(0)} textAnchor="end" fontSize={10.5} className="t-dim">
              0
            </text>
            {MAP.map((m) => {
              const y = yOf(m.hi);
              const h = yOf(m.lo) - yOf(m.hi);
              const on = m.k === sel;
              return (
                <g key={m.k} onClick={() => setSel(m.k)} style={{ cursor: 'pointer' }}>
                  <rect x={MAP_X} y={y} width={MAP_W} height={h} className="cm-region" data-k={m.k} data-on={on || undefined} />
                  <text x={MAP_X + MAP_W / 2} y={y + h / 2 + 4.5} textAnchor="middle" fontSize={12.5} fontWeight={on ? 700 : 500}>
                    {m.label}
                  </text>
                </g>
              );
            })}
            {/* grow arrows */}
            <g className="cm-mapline">
              <line x1={MAP_X + MAP_W + 10} y1={yOf(0.44)} x2={MAP_X + MAP_W + 10} y2={yOf(0.56)} />
              <path d={`M${MAP_X + MAP_W + 10},${yOf(0.56)} l-3,6 l6,0 z`} className="cm-arrow-head" />
              <text x={MAP_X + MAP_W + 16} y={yOf(0.5) + 4} fontSize={10} className="t-dim t-body">
                힙 ↑
              </text>
              <line x1={MAP_X + MAP_W + 10} y1={yOf(0.84)} x2={MAP_X + MAP_W + 10} y2={yOf(0.72)} />
              <path d={`M${MAP_X + MAP_W + 10},${yOf(0.72)} l-3,-6 l6,0 z`} className="cm-arrow-head" />
              <text x={MAP_X + MAP_W + 16} y={yOf(0.78) + 4} fontSize={10} className="t-dim t-body">
                스택 ↓
              </text>
            </g>
          </svg>
        </div>
        <div className="controls">
          <div className="cm-chips" role="group" aria-label="메모리 구역">
            {MAP.slice().reverse().map((m) => (
              <button key={m.k} type="button" className="cm-chip" aria-pressed={m.k === sel} onClick={() => setSel(m.k)}>
                {m.label}
              </button>
            ))}
          </div>
          <Readout label="선택한 구역" value={cur.label} />
          <div className="arch-note" aria-live="polite" style={{ minHeight: '5em' }}>
            {cur.what}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: stack frames ─────────────── */

const PROG_NAME: Record<StackProg, string> = { sum: '제곱의 합', fact: '팩토리얼 (재귀)', inf: '끝없는 재귀' };
const PROG_N: Record<StackProg, number> = { sum: 3, fact: 4, inf: 0 };

function StackFrameBox({ frame, changed, depth, ghost }: { frame: SFrame; changed: string | null; depth: number; ghost?: boolean }) {
  return (
    <div className="cm-frame" data-top={!ghost && depth === 0 ? true : undefined} data-ghost={ghost || undefined} data-over={frame.over || undefined}>
      <div className="cm-frame-h">
        <span>{frame.label}</span>
        <span className="sz">{frame.size}바이트</span>
      </div>
      {frame.slots.map((s) => {
        const isChanged = !ghost && changed === `${depth}:${s.name}`;
        return (
          <div key={s.name} className="cm-slot" data-ret={s.ret ? true : undefined} data-changed={isChanged || undefined}>
            <span className="a">{ad(s.addr)}</span>
            <span className="n">{s.name}</span>
            <span className={'v' + (s.val === null ? ' dim' : '')}>{s.ret ? `→ ${s.ret}` : s.val === null ? '?' : s.val}</span>
          </div>
        );
      })}
    </div>
  );
}

function StackFigure() {
  const [prog, setProg] = useState<StackProg>('sum');
  const snaps = useMemo(() => stackTraceMemo(prog), [prog]);
  const s = useStepper(snaps.length, 3, prog);
  const f = snaps[s.i];
  const src = STACK_SRC[prog];
  const depth = f.frames.length;
  const used = STACK_TOP - f.sp;

  return (
    <Figure
      no={2}
      title="함수 호출과 스택 프레임"
      hint="프로그램을 고르고 한 단계씩"
      caption={<>오른쪽이 스택입니다. 위가 가장 최근에 쌓인 프레임(스택 꼭대기), 아래가 main입니다. 프레임마다 돌아갈 주소와 인자·지역 변수 칸이 있고, 노란 칸은 방금 바뀐 값, <code>?</code>는 아직 쓰지 않은 쓰레기 값입니다. 점선 프레임은 방금 끝나 사라진 프레임으로, 바이트는 남아 있지만 더 이상 누구 것도 아닙니다. 주소는 보기 좋게 줄인 값입니다.</>}
    >
      <div className="controls row">
        <Seg label="프로그램" value={prog} onChange={setProg} options={(['sum', 'fact', 'inf'] as const).map((k) => ({ value: k, label: PROG_NAME[k] }))} />
        {prog !== 'inf' && <div className="ctl arch-small" style={{ flex: '0 0 auto' }}>N = {PROG_N[prog]}</div>}
      </div>
      <div className="fig-split">
        <div className="cm-side">
          <pre className="loop-code mono cm-code" aria-label="C 코드">
            {src.map((l, k) => (
              <span key={k} className="loop-line" data-on={k === f.line || undefined}>
                <span className="ln">{l === '' ? '' : k + 1}</span>
                {l}
                {'\n'}
              </span>
            ))}
          </pre>
          <StepControls s={s} id="stk-speed" maxSpeed={8} />
        </div>
        <div className="controls">
          <div className="cm-stack-top">
            <span>스택 꼭대기 (sp = {ad(f.sp)})</span>
            <span>{used}/{STACK_BYTES}바이트</span>
          </div>
          <div className="cm-stack" role="img" aria-label={`스택에 프레임 ${depth}개. ${f.frames.map((fr) => fr.label).join(', ') || '없음'}`}>
            {f.frames.map((fr, k) => (
              <StackFrameBox key={`${k}-${fr.label}`} frame={fr} changed={f.changed} depth={depth - 1 - k} />
            ))}
            {f.overflow ? <div className="cm-limit">↑ 스택 한계 {ad(STACK_TOP - STACK_BYTES)}를 넘음 — Segmentation fault</div> : <div className="cm-free-space">↓ 남은 스택 {f.sp - (STACK_TOP - STACK_BYTES)}바이트</div>}
            {f.ghosts.map((g, k) => (
              <StackFrameBox key={`g${k}`} frame={g} changed={null} depth={-1} ghost />
            ))}
          </div>
          <div>
            <div className="cm-out-h">표준 출력</div>
            <div className="cm-out">{f.out.join('\n') || ' '}</div>
          </div>
        </div>
      </div>
      <div className="arch-note" aria-live="polite" style={{ minHeight: '3.4em' }}>
        <span className={f.overflow ? 'cm-note-bad' : undefined}>{f.note}</span>
      </div>
    </Figure>
  );
}

// memoize across renders without recomputing the trace each time
const stackCache = new Map<StackProg, ReturnType<typeof stackTrace>>();
function stackTraceMemo(prog: StackProg) {
  if (!stackCache.has(prog)) stackCache.set(prog, stackTrace(prog, PROG_N[prog]));
  return stackCache.get(prog)!;
}

/* ─────────────── Figure 3: a first-fit heap allocator ─────────────── */

function HeapFigure() {
  const [fit, setFit] = useState<Fit>('first');
  const [merge, setMerge] = useState(true);
  const [heap, setHeap] = useState<Heap>(heapInit);
  const [log, setLog] = useState<{ text: string; bad?: boolean }[]>([{ text: '// 힙 256바이트. malloc으로 빌리고 free로 돌려줍니다.' }]);
  const [lastNew, setLastNew] = useState<string | null>(null);

  const alloc = (bytes: number) => {
    const { heap: h2, block } = hmalloc(heap, bytes, fit);
    if (!block) {
      setLog((l) => [...l, { text: `malloc(${bytes}) → NULL  // 들어갈 빈 블록이 없음`, bad: true }]);
      setLastNew(null);
      return;
    }
    setHeap(h2);
    setLastNew(block.name!);
    setLog((l) => [...l, { text: `${block.name} = malloc(${bytes})  → ${ad(blockAddr(block))}  // ${(block.units - 1) * UNIT}바이트 확보` }]);
  };
  const free = (name: string) => {
    setHeap(hfree(heap, name, merge));
    setLastNew(null);
    setLog((l) => [...l, { text: `free(${name})` }]);
  };
  const reset = () => {
    setHeap(heapInit());
    setLog([{ text: '// 힙을 비웠습니다.' }]);
    setLastNew(null);
  };

  const live = heap.blocks.filter((b) => !b.free);
  const freeUnits = heap.blocks.filter((b) => b.free).reduce((a, b) => a + b.units, 0);
  const biggest = Math.max(0, ...heap.blocks.filter((b) => b.free).map((b) => payload(b)));
  const usedUnits = HEAP_UNITS - freeUnits;

  return (
    <Figure
      no={3}
      title="malloc과 free: 힙 할당기"
      hint="블록을 빌리고(malloc), 블록을 눌러 돌려주세요(free)"
      caption={<>힙 256바이트를 8바이트 칸 32개로 그렸습니다. 색 블록이 쓰이는 중, 빗금 블록이 빈 블록입니다. 블록마다 앞의 진한 칸은 할당기가 크기를 적어 두는 8바이트 머리말(header)입니다. 파란 블록을 누르면 free합니다. 할당기 모델은 교육용으로 단순화한 것이고, 실제 malloc은 훨씬 정교합니다.</>}
    >
      <div className="controls row">
        <div className="ctl" style={{ flex: '1 1 260px' }}>
          <span className="ctl-label">
            <span>malloc(바이트)</span>
          </span>
          <div className="btn-row">
            {[8, 24, 40, 64].map((b) => (
              <button key={b} type="button" className="btn small" onClick={() => alloc(b)}>
                {b}
              </button>
            ))}
            <button type="button" className="btn small" onClick={reset}>
              비우기
            </button>
          </div>
        </div>
        <Seg label="빈 블록 고르는 법" value={fit} onChange={setFit} options={[{ value: 'first', label: '처음 맞는 것 (first-fit)' }, { value: 'best', label: '가장 알맞은 것 (best-fit)' }]} />
      </div>
      <div className="cm-heap" role="img" aria-label={`힙. 블록 ${heap.blocks.length}개, 사용 ${usedUnits * UNIT}바이트, 가장 큰 빈 공간 ${biggest}바이트`}>
        {heap.blocks.map((b, k) => (
          <HeapBlock key={`${b.start}-${b.name ?? 'f'}-${k}`} b={b} isNew={b.name === lastNew} onFree={free} />
        ))}
      </div>
      <div className="cm-ticks" aria-hidden="true">
        <span style={{ left: '0%' }}>{ad(HEAP_BASE)}</span>
        <span style={{ left: '50%' }}>+128</span>
        <span style={{ left: '100%' }}>+256</span>
      </div>
      <div className="fig-cols">
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="쓰는 중" value={`${live.length}블록`} />
            <Readout label="빈 공간 합계" value={`${freeUnits * UNIT}바이트`} />
            <Readout label="가장 큰 빈 블록" value={`${biggest}바이트`} color={biggest < freeUnits * UNIT ? 'var(--bad)' : undefined} />
            <Readout label="조각난 정도" value={freeUnits ? `${Math.round((1 - biggest / (freeUnits * UNIT)) * 100)}%` : '0%'} />
          </div>
          <Check label="free할 때 이웃한 빈 블록과 합치기 (coalescing)" checked={merge} onChange={setMerge} />
        </div>
        <div>
          <div className="cm-out-h">호출 기록</div>
          <ul className="cm-log" aria-live="polite">
            {log.slice(-7).map((e, k) => (
              <li key={k} className={e.bad ? 'bad' : e.text.startsWith('//') ? 'cm' : undefined}>
                {e.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Legend
        items={[
          { color: 'color-mix(in srgb, var(--neg) 24%, var(--surface))', label: '쓰는 블록', shape: 'sq' },
          { color: 'var(--surface-2)', label: '빈 블록', shape: 'sq' },
          { color: 'color-mix(in srgb, var(--ink) 55%, var(--surface))', label: '머리말', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

function HeapBlock({ b, isNew, onFree }: { b: HBlock; isNew: boolean; onFree: (n: string) => void }) {
  const pct = (b.units / HEAP_UNITS) * 100;
  const style = { flex: `0 0 ${pct}%` };
  const inner = (
    <>
      <span className="hdr" style={{ flexBasis: `${100 / b.units}%` }} aria-hidden="true" />
      <span className="body">
        <span className="nm">{b.free ? '빈 블록' : b.name}</span>
        <span className="sz">{b.free ? `${b.units * UNIT}B` : `${b.req}B 요청`}</span>
      </span>
    </>
  );
  if (b.free) {
    return (
      <div className="cm-blk" data-free style={style} title={`빈 블록 ${b.units * UNIT}바이트`}>
        {inner}
      </div>
    );
  }
  return (
    <button type="button" className="cm-blk" data-new={isNew || undefined} style={style} onClick={() => onFree(b.name!)} title={`${b.name} (${(b.units - 1) * UNIT}바이트) — 눌러서 free`}>
      {inner}
    </button>
  );
}

/* ─────────────── Figure 4: the classic memory bugs ─────────────── */

const BUG_NAME: Record<BugId, string> = { dangling: '지역 변수 주소 돌려주기', uaf: '해제 후 사용 (use-after-free)', double: '두 번 해제 (double free)', leak: '메모리 누수 (leak)' };

function BugStackFrame({ frame }: { frame: { fn: string; vars: { id: string; name: string; val: string; to?: string; bad?: boolean }[]; ghost?: boolean } }) {
  return (
    <div className="cm-frame" data-ghost={frame.ghost || undefined}>
      <div className="cm-frame-h">
        <span>{frame.fn}()</span>
      </div>
      {frame.vars.map((v) => (
        <div key={v.id} className="cm-slot">
          <span className="a" aria-hidden="true" />
          <span className="n">{v.name}</span>
          <span className="v" style={v.to ? { color: v.bad ? 'var(--bad)' : 'var(--pos)' } : v.val === '?' ? { color: 'var(--ink-3)', fontWeight: 400 } : undefined}>
            {v.val}
          </span>
        </div>
      ))}
    </div>
  );
}

function LeakChart({ steps, i, fixed }: { steps: ReturnType<typeof leakSteps>; i: number; fixed: boolean }) {
  const W = 300;
  const H = 110;
  const maxUsage = (fixed ? 1 : LEAK_REQS) * LEAK_BLOCK;
  const pts = steps.slice(0, i + 1).map((st, k) => {
    const x = steps.length > 1 ? (k / (steps.length - 1)) * (W - 20) + 14 : 14;
    const y = H - 18 - ((st.usage ?? 0) / maxUsage) * (H - 30);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`힙 사용량 그래프. 지금 ${(steps[i].usage ?? 0) / 1024}KB`} className="cm-chart">
      <line x1={14} y1={H - 18} x2={W - 6} y2={H - 18} className="cm-axis" />
      <line x1={14} y1={10} x2={14} y2={H - 18} className="cm-axis" />
      <text x={10} y={16} textAnchor="end" fontSize={9} className="t-dim" fontFamily="var(--font-mono)">
        {(maxUsage / 1024).toFixed(0)}KB
      </text>
      <text x={10} y={H - 20} textAnchor="end" fontSize={9} className="t-dim" fontFamily="var(--font-mono)">
        0
      </text>
      <text x={(W + 8) / 2} y={H - 4} textAnchor="middle" fontSize={9.5} className="t-dim" fontFamily="var(--font-body)">
        처리한 요청 →
      </text>
      <polyline points={pts.join(' ')} className="cm-chart-line" stroke={fixed ? 'var(--good)' : 'var(--bad)'} />
    </svg>
  );
}

function BugFigure() {
  const [bug, setBug] = useState<BugId>('dangling');
  const [fixed, setFixed] = useState(false);
  const steps = useMemo(() => (bug === 'leak' ? leakSteps(fixed) : BUG_STEPS[bug]), [bug, fixed]);
  const src = bug === 'leak' ? leakSrc(fixed) : BUG_SRC[bug];
  const s = useStepper(steps.length, 2, `${bug}|${fixed}`);
  const st = steps[s.i];

  return (
    <Figure
      no={4}
      title="흔한 메모리 버그 네 가지"
      hint="버그를 고르고 한 단계씩 따라가세요"
      caption={<>스택의 포인터(주황 = 살아 있는 곳, 빨강 = 가리키면 안 되는 곳)와 힙의 블록을 함께 그렸습니다. 점선 프레임은 사라진 프레임, 빨간 테두리 블록은 해제됐거나 주인을 잃은 블록입니다. 모두 컴파일은 되지만 "정의되지 않은 동작"을 일으키는 코드입니다.</>}
    >
      <div className="controls row">
        <Seg label="버그" value={bug} onChange={setBug} options={(['dangling', 'uaf', 'double', 'leak'] as const).map((k) => ({ value: k, label: BUG_NAME[k] }))} />
        {bug === 'leak' && <Check label="free를 넣어 고치기" checked={fixed} onChange={setFixed} />}
      </div>
      <div className="fig-split">
        <div className="cm-side">
          <pre className="loop-code mono cm-code" aria-label="C 코드">
            {src.map((l, k) => (
              <span key={k} className="loop-line" data-on={k === st.line || undefined}>
                <span className="ln">{k + 1}</span>
                {l}
                {'\n'}
              </span>
            ))}
          </pre>
          <StepControls s={s} id="bug-speed" maxSpeed={6} />
        </div>
        <div className="controls">
          {bug === 'leak' ? (
            <>
              <LeakChart steps={steps} i={s.i} fixed={fixed} />
              <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <Readout label="처리한 요청" value={st.req ?? 0} />
                <Readout label="힙 사용량" value={`${((st.usage ?? 0) / 1024).toFixed(0)}KB`} color={fixed ? 'var(--good)' : 'var(--bad)'} />
              </div>
            </>
          ) : (
            <>
              <div className="cm-out-h">스택</div>
              <div className="cm-stack">
                {st.stack.slice().reverse().map((fr, k) => (
                  <BugStackFrame key={k} frame={fr} />
                ))}
              </div>
              {(st.heap.length > 0 || st.freeList) && (
                <>
                  <div className="cm-out-h">힙</div>
                  <div className="cm-stack">
                    {st.heap.map((b) => (
                      <div key={b.id} className="cm-frame" style={{ borderColor: b.state === 'live' ? 'var(--neg)' : b.state === 'orphan' ? 'var(--bad)' : 'var(--line-strong)', borderStyle: b.state === 'freed' ? 'dashed' : 'solid' }}>
                        <div className="cm-slot">
                          <span className="a">{b.addr}</span>
                          <span className="n">{b.text}</span>
                          <span className="v" style={{ color: b.state === 'orphan' ? 'var(--bad)' : b.state === 'freed' ? 'var(--ink-3)' : 'var(--neg)' }}>
                            {b.state === 'live' ? '쓰는 중' : b.state === 'freed' ? '해제됨' : '주인 없음'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {st.freeList && <div className="cm-freelist cm-out-h">빈 목록: {st.freeList}</div>}
                </>
              )}
            </>
          )}
          {st.out !== undefined && (
            <div>
              <div className="cm-out-h">출력</div>
              <div className="cm-out">{st.out}</div>
            </div>
          )}
        </div>
      </div>
      <div className="arch-note" aria-live="polite" style={{ minHeight: '3.8em' }}>
        <span className={st.tone === 'bad' ? 'cm-note-bad' : st.tone === 'good' ? 'cm-note-good' : undefined}>{st.note}</span>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function StackHeap() {
  return (
    <>
      <h2>데이터는 얼마나 오래 사는가</h2>
      <p>
        <a href={lessonHref('cs-architecture', 'pointers')}>포인터와 배열</a>에서 변수가 메모리의 몇 바이트라는 것을 봤습니다. 이제 질문은 "그 몇 바이트를 누가 언제 잡고 언제 놓느냐"입니다. 답은 데이터가 얼마나 오래 살아야 하는지에 따라 다릅니다. 함수가 도는 동안만 필요한 지역 변수는 <T en="stack">스택</T>에, 함수가 끝난 뒤에도 남아야 하는 데이터는 <T en="heap">힙</T>에 둡니다. 둘은 한 프로그램의 주소 공간 안에서 서로 반대편에 있습니다.
      </p>
      <MemoryMapFigure />
      <p>
        그림 1은 한 프로그램이 보는 메모리 전체입니다. 아래쪽에는 바뀌지 않는 것들(기계어 코드, 문자열 상수, 전역 변수)이 자리를 잡고, 위쪽의 넓은 빈 땅을 힙과 스택이 나눠 씁니다. 힙은 malloc을 부를 때마다 위로 조금씩 자라고, 스택은 함수를 부를 때마다 아래로 자랍니다. 둘이 가운데서 만나면 메모리가 바닥난 것입니다. 이 지도가 프로그램마다 똑같이 "주소 0부터 시작"하는 것처럼 보이는 까닭은 <a href={lessonHref('cs-operating-systems', 'virtual-memory')}>가상 메모리</a> 덕분이며, 거기서 자세히 다룹니다.
      </p>

      <h2>스택: 함수 호출의 기록</h2>
      <p>
        <a href={lessonHref('cs-programming', 'functions')}>함수</a>에서 호출 스택을 값의 흐름으로 봤다면, 여기서는 그것이 메모리에서 어떻게 생겼는지 봅니다. 함수를 부르면 그 호출만의 공간인 <T en="stack frame">스택 프레임</T>이 스택 꼭대기에 쌓입니다. 프레임에는 세 가지가 들어갑니다. 함수가 끝나면 돌아갈 주소(<a href={lessonHref('cs-architecture', 'cpu')}>CPU</a>에서 본 그 주소입니다), 인자, 그리고 지역 변수입니다. 함수가 <code>return</code>하면 프레임이 통째로 치워지고 스택 꼭대기는 부른 쪽 프레임으로 돌아갑니다.
      </p>
      <StackFigure />
      <p>
        그림 2에서 "제곱의 합"을 한 단계씩 넘겨 보세요. <code>sum_squares</code>가 <code>square</code>를 부를 때마다 프레임이 하나 쌓였다가, <code>square</code>가 끝나면 점선으로 바뀌어 사라집니다. 사라진 프레임의 바이트는 지워지지 않고 남아 있지만, 다음 호출이 그 자리를 그대로 덮어씁니다. "팩토리얼"은 재귀 함수라 자기 자신을 부르는데, 호출마다 자기 n과 rest를 따로 가진 프레임이 쌓이는 것을 보세요. 가장 깊은 <code>fact(1)</code>이 먼저 끝나고, 쌓인 반대 순서로 하나씩 풀립니다.
      </p>
      <p>
        스택이 빠른 이유가 여기 있습니다. 프레임을 쌓고 치우는 일은 스택 포인터라는 레지스터를 프레임 크기만큼 빼고 더하는 것이 전부입니다. 지역 변수를 위한 메모리를 따로 찾을 필요가 없습니다. 대신 스택에는 한계가 있습니다. "끝없는 재귀"를 골라 보세요. 멈추는 조건이 없는 재귀는 프레임을 끝없이 쌓다가 스택의 끝을 넘습니다. 이것이 <T en="stack overflow">스택 오버플로</T>이고, 그 유명한 질문·답변 사이트의 이름이기도 합니다.
      </p>
      <Callout kind="note">
        지역 변수 배열을 크게 잡는 것도 위험합니다. <code>int big[1000000];</code>을 함수 안에 두면 한 프레임이 4MB를 요구해 리눅스의 기본 스택(8MB)을 금세 넘길 수 있습니다. 큰 데이터는 스택이 아니라 힙에 두어야 하는 이유입니다.
      </Callout>

      <h2>힙: 직접 빌리고 직접 돌려주기</h2>
      <p>
        함수가 끝난 뒤에도 남아야 하거나, 크기를 실행 중에야 아는 데이터는 스택에 둘 수 없습니다. 이럴 때 <code>malloc(바이트 수)</code>로 힙에서 한 덩어리를 빌립니다. malloc은 그 덩어리의 시작 주소를 돌려주고, 다 쓰면 <code>free(주소)</code>로 돌려줘야 합니다. 스택과 달리 힙은 자동으로 치워지지 않습니다.
      </p>
      <Code label="실행 중에 크기가 정해지는 배열">{`
int *make_squares(int n) {
  // n은 실행 중에야 안다 → 스택 배열로는 못 잡는다
  int *a = malloc(n * sizeof(int));   // int n개만큼 힙에서 빌린다
  if (a == NULL) return NULL;         // 힙이 가득 차면 NULL을 돌려준다
  for (int i = 0; i < n; i++)
    a[i] = i * i;
  return a;        // 함수가 끝나도 힙의 배열은 살아 있다
}
// ... 쓰고 나서, 부른 쪽이 반드시:
free(a);           // 돌려주지 않으면 누수
`}</Code>
      <p>
        할당기는 힙을 블록들로 관리합니다. 빈 블록들을 목록으로 이어 두고(<T en="free list">빈 목록</T>), malloc이 오면 요청을 담을 만큼 큰 빈 블록을 골라 떼어 줍니다. 어느 빈 블록을 고를지가 정책입니다. 처음 만나는 충분한 블록을 쓰는 <T en="first-fit">first-fit</T>, 가장 딱 맞는 블록을 찾는 <T en="best-fit">best-fit</T> 등이 있습니다.
      </p>
      <HeapFigure />
      <p>
        그림 3에서 블록을 몇 개 빌린 뒤 가운데 것을 돌려줘 보세요. 그러면 빈 공간이 생기는데, 그 빈 공간보다 큰 요청은 전체 빈 공간을 합하면 자리가 있는데도 들어가지 못합니다. 빈자리가 작은 조각들로 흩어지는 이 현상을 <T en="fragmentation">단편화</T>라고 합니다. "조각난 정도"가 100%에 가까울수록 쓸 수 있는 가장 큰 블록이 작다는 뜻입니다. free할 때 이웃한 빈 블록끼리 합치는 것(coalescing)을 끄고 켜 보면, 합치지 않을 때 조각이 훨씬 빨리 쌓이는 것이 보입니다. first-fit과 best-fit도 바꿔 가며 어느 쪽이 덜 조각나는지 실험해 보세요.
      </p>

      <h2>힙을 손으로 다룰 때 생기는 버그</h2>
      <p>
        스택은 언어가 알아서 쌓고 치우지만, 힙은 사람이 malloc과 free를 짝 맞춰야 합니다. 이 짝이 어긋나면 C에서 가장 악명 높은 버그들이 생깁니다. 네 가지를 그림 4에서 한 단계씩 따라가 봅니다.
      </p>
      <BugFigure />
      <ul>
        <li>
          <strong>지역 변수 주소 돌려주기 (댕글링 포인터)</strong>: 함수가 자기 지역 변수의 주소를 <code>return</code>하면, 그 변수는 함수가 끝나는 순간 사라집니다. 돌려받은 주소는 사라진 프레임을 가리키는 <T en="dangling pointer">댕글링 포인터</T>이고, 다음 함수 호출이 그 자리를 덮어쓰면 엉뚱한 값이 읽힙니다.
        </li>
        <li>
          <strong>해제 후 사용</strong>: free한 메모리를 가리키는 포인터는 그대로 남습니다. 그 포인터로 읽거나 쓰는 것이 <T en="use-after-free">해제 후 사용</T>입니다. 할당기가 같은 블록을 다른 용도로 내준 뒤라면, 서로 다른 두 변수가 같은 메모리를 밟아 데이터가 섞입니다.
        </li>
        <li>
          <strong>두 번 해제</strong>: 같은 블록을 <code>free</code>로 두 번 돌려주면 빈 목록이 망가집니다. 블록이 목록에 두 번 들어가, 나중에 malloc이 같은 블록을 서로 다른 두 요청에 내주게 됩니다.
        </li>
        <li>
          <strong>메모리 누수</strong>: malloc만 하고 free를 잊으면, 그 블록을 가리키던 포인터가 사라진 뒤에는 아무도 돌려줄 수 없습니다. 오래 도는 서버라면 사용량이 끝없이 늘다가 메모리가 바닥납니다. "메모리 누수"를 고르고 "free를 넣어 고치기"를 켜고 끄면서 사용량 그래프가 어떻게 달라지는지 보세요.
        </li>
      </ul>
      <Callout kind="warn">
        이 버그들의 공통점은 <strong>컴파일도 되고 대개는 그냥 도는 것처럼 보인다</strong>는 것입니다. 증상이 한참 뒤에, 전혀 다른 곳에서, 입력이나 타이밍에 따라 들쭉날쭉 나타납니다. 그래서 C/C++ 프로그래머는 <code>valgrind</code>, AddressSanitizer 같은 도구로 메모리 오류를 잡고, 할당한 쪽이 해제할 책임을 지도록 규칙을 세웁니다.
      </Callout>

      <h2>그래서 많은 언어가 이 일을 대신한다</h2>
      <p>
        이 버그들이 너무 흔하고 위험해서, 대부분의 현대 언어는 메모리 관리를 사람 손에서 거둬 갔습니다. JavaScript, Python, Java, Go는 <T en="garbage collection">가비지 컬렉션</T>으로, 아무도 가리키지 않게 된 힙 데이터를 런타임이 자동으로 찾아 치웁니다. 누수와 해제 후 사용, 두 번 해제가 구조적으로 사라집니다. 대신 언제 멈춰서 치울지, 그 비용을 어떻게 줄일지가 새로운 문제가 됩니다. Rust는 또 다른 길을 택해, 컴파일 시점에 소유권 규칙으로 해제 시점을 정해 둡니다.
      </p>
      <p>
        어느 쪽이든 그 바탕에는 이 장에서 본 스택과 힙, 그리고 포인터가 그대로 있습니다. 가비지 컬렉터가 "아무도 가리키지 않는다"를 판단하는 것은 결국 포인터를 따라가는 일이고, 그 출발점은 스택에 있는 포인터들입니다. 자동 메모리 관리가 실제로 어떻게 동작하는지는 <a href={lessonHref('cs-programming-languages', 'garbage-collection')}>메모리 관리와 가비지 컬렉션</a>에서, 운영체제가 프로세스마다 이 주소 공간을 어떻게 만들어 주는지는 <a href={lessonHref('cs-operating-systems', 'virtual-memory')}>가상 메모리</a>와 <a href={lessonHref('cs-operating-systems', 'processes')}>프로세스</a>에서 이어집니다.
      </p>

      <Callout kind="key">
        한 프로그램의 메모리는 코드·전역 데이터 위에 힙(위로 자람)과 스택(아래로 자람)이 넓은 빈 공간을 나눠 쓰는 모양입니다. 스택은 함수 호출마다 프레임을 쌓고 끝나면 치우며, 지역 변수와 돌아갈 주소를 담습니다. 힙은 malloc으로 빌리고 free로 돌려주는, 함수보다 오래 사는 데이터의 자리입니다. 힙을 손으로 다루면 댕글링 포인터, 해제 후 사용, 두 번 해제, 누수 같은 버그가 생기고, 많은 언어가 이 일을 가비지 컬렉션으로 대신합니다.
      </Callout>
      <Quiz
        q="C 함수가 지역 배열을 만들어 그 주소를 return했다. 부른 쪽에서 이 주소를 쓰면?"
        options={[
          '안전하다. 배열을 돌려줬으니 그대로 쓸 수 있다',
          '배열이 스택 프레임과 함께 사라져, 다음 함수 호출이 그 자리를 덮어쓸 수 있다',
          '컴파일 오류가 나서 실행되지 않는다',
          '가비지 컬렉터가 배열을 살려 두므로 괜찮다',
        ]}
        answer={1}
        explain={<>지역 변수는 그 함수의 스택 프레임 안에 있고, 함수가 끝나면 프레임이 치워집니다. 돌려받은 주소는 사라진 프레임을 가리키는 댕글링 포인터라, 다음 호출이 그 바이트를 덮어쓰면 값이 바뀝니다. 컴파일러는 경고만 내고 멈추지는 않으며(②), C에는 가비지 컬렉터가 없습니다(④). 함수보다 오래 살아야 하는 데이터는 malloc으로 힙에 두어야 합니다. 그림 4의 "지역 변수 주소 돌려주기"에서 확인하세요.</>}
      />
    </>
  );
}
