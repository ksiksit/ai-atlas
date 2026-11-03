import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { prefersReducedMotion, useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { StepControls, useStepper } from '../../shared';
import { PQ_NAMES, bracketSteps, heapPop, heapPush, parent, pqWork, type HeapFrame, type PQKind } from './structures';
import './algorithms.css';

/* ─────────────── Figure 1: same pushes, different pops ─────────────── */

const SQ_MAX = 6;

function StackQueueFigure() {
  const init = () => ({ next: 4, stack: [1, 2, 3], queue: [1, 2, 3], outS: [] as number[], outQ: [] as number[], shifted: 0 });
  const [st, setSt] = useState(init);

  const push = () => setSt((s) => ({ ...s, next: s.next + 1, stack: [...s.stack, s.next], queue: [...s.queue, s.next] }));
  const pop = () =>
    setSt((s) => ({
      ...s,
      stack: s.stack.slice(0, -1),
      queue: s.queue.slice(1),
      outS: [...s.outS, s.stack[s.stack.length - 1]],
      outQ: [...s.outQ, s.queue[0]],
      // shift() pulls every remaining element one slot forward
      shifted: s.shifted + s.queue.length - 1,
    }));

  return (
    <Figure
      no={1}
      title="같은 순서로 넣어도 꺼내는 순서가 다르다"
      hint="넣기와 꺼내기를 번갈아 눌러 보세요"
      caption={<>두 자료구조에 같은 숫자를 같은 순서로 넣고, 꺼내기를 누르면 둘 다에서 하나씩 꺼냅니다. 색칠된 칸이 다음에 나올 원소입니다. 스택은 가장 최근에 넣은 것이, 큐는 가장 오래 기다린 것이 먼저 나옵니다.</>}
    >
      <div className="sq-panels">
        <div className="sq-panel">
          <div className="sq-head">
            <strong>스택</strong> <span>맨 위에 넣고 맨 위에서 꺼냄 · LIFO</span>
          </div>
          <div className="sq-stack" aria-label={`스택: 아래부터 ${st.stack.join(', ') || '비어 있음'}`}>
            {st.stack.length ? (
              st.stack.map((v, i) => (
                <span key={i} className="ds-cell" data-next={i === st.stack.length - 1 || undefined}>
                  {v}
                </span>
              ))
            ) : (
              <span className="ds-empty">비어 있음</span>
            )}
          </div>
          <div className="sq-end">↑ 맨 위 (push / pop)</div>
          <div className="sq-out">
            꺼낸 순서 <span className="mono">{st.outS.join(', ') || '—'}</span>
          </div>
        </div>
        <div className="sq-panel">
          <div className="sq-head">
            <strong>큐</strong> <span>뒤에 넣고 앞에서 꺼냄 · FIFO</span>
          </div>
          <div className="sq-queue-wrap">
            <span className="sq-end">앞 ←</span>
            <div className="sq-queue" aria-label={`큐: 앞부터 ${st.queue.join(', ') || '비어 있음'}`}>
              {st.queue.length ? (
                st.queue.map((v, i) => (
                  <span key={i} className="ds-cell" data-next={i === 0 || undefined}>
                    {v}
                  </span>
                ))
              ) : (
                <span className="ds-empty">비어 있음</span>
              )}
            </div>
            <span className="sq-end">← 뒤</span>
          </div>
          <div className="sq-out">
            꺼낸 순서 <span className="mono">{st.outQ.join(', ') || '—'}</span>
          </div>
        </div>
      </div>
      <div className="fig-cols">
        <div className="controls">
          <div className="btn-row">
            <Button small primary onClick={push} disabled={st.stack.length >= SQ_MAX}>
              넣기 ({st.next})
            </Button>
            <Button small onClick={pop} disabled={!st.stack.length}>
              꺼내기
            </Button>
            <Button small onClick={() => setSt(init())}>
              처음부터
            </Button>
          </div>
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr', alignSelf: 'start' }}>
          <Readout label="스택 pop()이 옮긴 원소" value="0개" />
          <Readout label="큐를 shift()로 꺼냈다면 옮긴 원소" value={`${st.shifted}개`} color="var(--neg)" />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: bracket matching ─────────────── */

const BRACKET_PRESETS: { value: string; label: string; text: string }[] = [
  { value: 'ok', label: '올바름', text: '{ [ ( ) ] ( ) }' },
  { value: 'cross', label: '엇갈림', text: '( [ ) ]' },
  { value: 'open', label: '덜 닫힘', text: '( ( ) [ ]' },
  { value: 'code', label: '코드 한 줄', text: 'if (a[i] > (b + c)) { f(x); }' },
];

function BracketFigure() {
  const [text, setText] = useState(BRACKET_PRESETS[0].text);
  const steps = useMemo(() => bracketSteps(text), [text]);
  const s = useStepper(steps.length, 2, text);
  const st = steps[s.i];
  const preset = BRACKET_PRESETS.find((p) => p.text === text)?.value ?? 'custom';
  const done = s.i === steps.length - 1;

  return (
    <Figure
      no={2}
      title="괄호 짝 맞추기"
      hint="재생하거나 직접 입력해 보세요"
      caption={<>여는 괄호는 스택에 쌓고, 닫는 괄호를 만나면 맨 위를 꺼내 짝이 맞는지 봅니다. 가장 최근에 열린 괄호가 가장 먼저 닫혀야 하므로, "마지막에 넣은 것을 먼저 꺼내는" 스택이 이 규칙과 정확히 맞아떨어집니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div className="br-chars" aria-hidden="true">
            {[...text].map((ch, i) => (
              <span key={i} className="br-char" data-space={ch === ' ' || undefined} data-cur={i === st.pos || undefined} data-read={i < st.pos || undefined} data-fail={(i === st.pos && st.status === 'fail') || undefined}>
                {ch}
              </span>
            ))}
          </div>
          <div className="ds-row" aria-live="polite">
            <span className="ds-label">스택 (오른쪽이 맨 위)</span>
            {st.stack.length ? (
              st.stack.map((k, i) => (
                <span key={i} className="ds-cell" data-next={i === st.stack.length - 1 || undefined}>
                  {k}
                </span>
              ))
            ) : (
              <span className="ds-empty">비어 있음</span>
            )}
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', minHeight: '3.4em' }}>{st.note}</div>
        </div>
        <div className="controls">
          <Seg
            label="예시"
            value={preset}
            onChange={(v) => {
              const p = BRACKET_PRESETS.find((x) => x.value === v);
              if (p) setText(p.text);
            }}
            options={BRACKET_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
          />
          <div className="ctl">
            <label className="ctl-label" htmlFor="br-input">
              <span>직접 입력 (40자까지)</span>
            </label>
            <input id="br-input" className="text-input mono" type="text" value={text} maxLength={40} spellCheck={false} autoComplete="off" onChange={(e) => setText(e.target.value)} />
          </div>
          <StepControls s={s} id="br-speed" maxSpeed={8} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="결과" value={done ? (st.status === 'ok' ? '올바름 ✓' : '틀림 ✗') : st.status === 'fail' ? '틀림 ✗' : '읽는 중…'} color={st.status === 'ok' ? 'var(--good)' : st.status === 'fail' ? 'var(--bad)' : undefined} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: a binary min-heap, tree and array ─────────────── */

const HEAP_MAX = 15;
const HEAP_START = [5, 9, 7, 14, 12, 10, 8, 20];

function HeapFigure() {
  const P = usePalette();
  const [still] = useState(prefersReducedMotion);
  const r = useRef(rng(8));
  const [state, setState] = useState(() => ({
    heap: HEAP_START,
    frames: [{ a: HEAP_START, note: '넣기나 꺼내기를 눌러 보세요.' }] as HeapFrame[],
    run: 0,
    cmps: null as number | null,
    popped: [] as number[],
  }));
  const s = useStepper(state.frames.length, 2, state.run, still, !still);
  const f = state.frames[s.i];

  const insert = () =>
    setState((x) => {
      const v = 1 + Math.floor(r.current() * 99);
      const res = heapPush(x.heap, v);
      return { ...x, heap: res.heap, frames: res.frames, run: x.run + 1, cmps: res.cmps };
    });
  const extract = () =>
    setState((x) => {
      const res = heapPop(x.heap);
      return { ...x, heap: res.heap, frames: res.frames, run: x.run + 1, cmps: res.cmps, popped: res.min === null ? x.popped : [...x.popped, res.min] };
    });
  const restart = () => setState((x) => ({ heap: HEAP_START, frames: [{ a: HEAP_START, note: '처음 힙으로 되돌렸습니다.' }], run: x.run + 1, cmps: null, popped: [] }));

  const role = (i: number): 'cmp' | 'swap' | 'mark' | 'out' | undefined => (f.out === i ? 'out' : f.swap?.includes(i) ? 'swap' : f.cmp?.includes(i) ? 'cmp' : f.mark === i ? 'mark' : undefined);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const levels = 4;
      const top = 24;
      const dy = (h - top - 22) / (levels - 1);
      const pos = (i: number): [number, number] => {
        const lv = Math.floor(Math.log2(i + 1));
        const k = i - (2 ** lv - 1);
        return [((k + 0.5) / 2 ** lv) * w, top + lv * dy];
      };
      const rad = Math.max(11, Math.min(19, w / 16 / 2 - 3));
      ctx.lineWidth = 1.4;
      for (let i = 1; i < f.a.length; i++) {
        const [x1, y1] = pos(parent(i));
        const [x2, y2] = pos(i);
        const hot = (f.cmp && f.cmp.includes(i) && f.cmp.includes(parent(i))) || (f.swap && f.swap.includes(i) && f.swap.includes(parent(i)));
        ctx.strokeStyle = hot ? P.ink : P.lineStrong;
        ctx.lineWidth = hot ? 2.6 : 1.4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      for (let i = 0; i < f.a.length; i++) {
        const [x, y] = pos(i);
        const rl = role(i);
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fillStyle = rl === 'cmp' ? P.hl : rl === 'swap' ? P.pos : rl === 'out' ? P.bad : rl === 'mark' ? alpha(P.neg, 0.3) : P.surface;
        ctx.fill();
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = rl === 'swap' || rl === 'out' ? P.surface : rl === 'cmp' ? '#1a1a1a' : P.ink;
        ctx.font = `700 ${Math.round(rad * 0.82)}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(f.a[i]), x, y + 1);
        ctx.fillStyle = P.ink3;
        ctx.font = `10px ${P.fontMono}`;
        ctx.fillText(String(i), x + rad + 7, y - rad + 3);
      }
      if (!f.a.length) {
        ctx.fillStyle = P.ink3;
        ctx.font = `14px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.fillText('비어 있음', w / 2, h / 2);
      }
    },
    [P, f],
    { aspect: 2.1, maxHeight: 290, minHeight: 210 },
  );

  const height = state.heap.length ? Math.floor(Math.log2(state.heap.length)) : 0;

  return (
    <Figure
      no={3}
      title="최소 힙: 트리로 보고 배열로 저장한다"
      hint="넣기와 꺼내기를 눌러 보세요"
      caption={<>위는 트리로 그린 힙, 아래는 실제로 메모리에 저장되는 배열입니다. 노드 옆의 작은 숫자가 배열 인덱스입니다. 노란색은 비교하는 두 값, 주황색은 방금 자리를 바꾼 두 값입니다. 넣을 때는 맨 끝에 두고 위로, 꺼낼 때는 맨 끝 값을 루트로 옮기고 아래로 내려가며 "부모 ≤ 자식" 규칙을 되살립니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`최소 힙 트리: 배열 ${f.a.join(', ') || '비어 있음'}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="heap-arr" aria-hidden="true">
            {f.a.map((v, i) => (
              <span key={i} className="heap-slot" data-role={role(i)}>
                <span className="ds-cell">{v}</span>
                <span className="heap-idx">{i}</span>
              </span>
            ))}
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', minHeight: '1.7em' }} aria-live="polite">
            {f.note}
          </div>
        </div>
        <div className="controls">
          <div className="btn-row">
            <Button small primary onClick={insert} disabled={state.heap.length >= HEAP_MAX}>
              넣기 (무작위 값)
            </Button>
            <Button small primary onClick={extract} disabled={!state.heap.length}>
              최솟값 꺼내기
            </Button>
            <Button small onClick={restart}>
              처음 힙
            </Button>
          </div>
          <StepControls s={s} id="hp-speed" maxSpeed={8} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="원소 수 · 높이" value={`${state.heap.length}개 · ${height}층`} />
            <Readout label="이번 작업의 비교" value={state.cmps === null ? '—' : `${state.cmps}번`} color="var(--neg)" />
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="꺼낸 순서" value={state.popped.join(', ') || '—'} color="var(--pos)" />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--hl)', label: '비교 중', shape: 'dot' },
          { color: 'var(--pos)', label: '자리 바꿈', shape: 'dot' },
          { color: 'var(--bad)', label: '꺼내는 최솟값', shape: 'dot' },
          { color: 'color-mix(in srgb, var(--neg) 30%, transparent)', label: '새로 들어온 값', shape: 'dot' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 4: three priority queues, counted ─────────────── */

const PQ_KINDS: PQKind[] = ['unsorted', 'sorted', 'heap'];
const PQ_COLOR: Record<PQKind, string> = { unsorted: 'var(--c-cs-1)', sorted: 'var(--c-cs-2)', heap: 'var(--pos)' };

function PQFigure() {
  const [n, setN] = useState(1000);
  const ops = useMemo(() => Object.fromEntries(PQ_KINDS.map((k) => [k, pqWork(k, n, rng(42)).ops])) as Record<PQKind, number>, [n]);
  const max = Math.max(...PQ_KINDS.map((k) => ops[k]));

  return (
    <Figure
      no={4}
      title="우선순위 큐를 만드는 세 가지 방법"
      hint="작업 수를 바꿔 보세요"
      caption={<>작업 대기열을 흉내 냈습니다. 한 번에 새 작업 2개가 들어오고 가장 급한 작업(가장 작은 값) 1개를 처리하는 일을 n번 반복하므로, 대기열은 점점 n개까지 불어납니다. 막대는 세 구현이 실제로 한 비교와 원소 이동 횟수를 더한 값이고, 가장 큰 값을 기준으로 그렸습니다. 세 구현이 꺼낸 값의 순서는 모두 같습니다.</>}
    >
      <div className="controls row">
        <Seg
          label="반복 횟수 n"
          value={n}
          onChange={setN}
          options={[
            { value: 100, label: '100' },
            { value: 1000, label: '1,000' },
            { value: 10000, label: '10,000' },
          ]}
        />
      </div>
      <div className="growth-rows pq-rows">
        {PQ_KINDS.map((k) => (
          <div key={k} className="growth-row">
            <span className="growth-name">{PQ_NAMES[k]}</span>
            <span className="growth-track">
              <span className="growth-bar" style={{ width: `${Math.max(0.6, (ops[k] / max) * 100)}%`, background: PQ_COLOR[k] }} />
            </span>
            <span className="growth-time mono">{ops[k].toLocaleString('ko-KR')}</span>
          </div>
        ))}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Readout label="정렬 안 된 배열 ÷ 힙" value={`${(ops.unsorted / ops.heap).toFixed(1)}배`} color={PQ_COLOR.unsorted} />
        <Readout label="정렬된 배열 ÷ 힙" value={`${(ops.sorted / ops.heap).toFixed(1)}배`} color={PQ_COLOR.sorted} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function StackQueueHeap() {
  return (
    <>
      <h2>넣고 꺼내는 순서가 전부다</h2>
      <p>
        <T en="data structure">자료구조</T>는 데이터를 담아 두는 방식과, 그 데이터에 할 수 있는 연산을 함께 정한 것입니다. 이 장에서 볼 스택, 큐, 힙은 그중 가장 단순한 축에 듭니다. 할 수 있는 일은 사실상 "넣기"와 "꺼내기" 두 가지뿐이고, 셋은 <strong>무엇을 먼저 꺼내느냐</strong>만 다릅니다.
      </p>
      <ul>
        <li>
          <T en="stack">스택</T>: 가장 <strong>최근에</strong> 넣은 것을 먼저 꺼냅니다. 접시를 쌓아 두고 맨 위부터 집는 것과 같습니다.
        </li>
        <li>
          <T en="queue">큐</T>: 가장 <strong>먼저</strong> 넣은 것을 먼저 꺼냅니다. 줄을 서서 차례를 기다리는 것과 같습니다.
        </li>
        <li>
          <T en="heap">힙</T>: 가장 <strong>작은</strong>(또는 가장 큰) 것을 먼저 꺼냅니다. 응급실에서 도착 순서가 아니라 위급한 순서로 진료하는 것과 같습니다.
        </li>
      </ul>
      <p>단순해 보이지만, 이 차이가 다음 장의 그래프 탐색을 BFS, DFS, 다익스트라로 갈라 놓습니다.</p>

      <h2>스택과 큐</h2>
      <StackQueueFigure />
      <p>
        스택에서 나오는 순서는 넣은 순서의 정반대이고, 큐에서 나오는 순서는 넣은 순서 그대로입니다. 그래서 스택을 <T en="last in, first out">LIFO</T>(마지막에 들어온 것이 먼저 나감), 큐를 <T en="first in, first out">FIFO</T>(먼저 들어온 것이 먼저 나감)라고 부릅니다.
      </p>
      <p>JavaScript에는 스택이나 큐라는 이름의 타입이 따로 없고, 보통 배열로 만듭니다. 스택은 배열 끝에서만 넣고 빼면 되므로 아주 간단합니다.</p>
      <Code label="스택: 배열 끝에서 push / pop">{`
const stack = [];
stack.push(1);         // [1]
stack.push(2);         // [1, 2]
stack.push(3);         // [1, 2, 3]
stack.pop();           // 3 → [1, 2]
stack[stack.length - 1]; // 2: 꺼내지 않고 맨 위만 보기`}</Code>
      <p>
        큐도 <code>push</code>로 넣고 <code>shift</code>로 앞에서 꺼내면 될 것 같습니다. 하지만 그림 1의 오른쪽 숫자를 보세요. 배열의 맨 앞 원소를 빼면 나머지 원소가 모두 한 칸씩 앞으로 당겨져야 하므로 <code>shift()</code>는 원리상 <M>{'O(n)'}</M>입니다. 원소 n개를 모두 이렇게 꺼내면 <M>{'O(n^2)'}</M>이 됩니다.
      </p>
      <Callout kind="warn">
        이 글을 쓰며 Node.js(Chrome과 같은 V8 엔진)에서 재 보니, 원소 10만 개를 <code>shift()</code>로 모두 꺼내는 데 <strong>10초 넘게</strong> 걸렸습니다. 아래처럼 앞 위치만 기억하는 방법은 같은 일을 몇 밀리초 만에 끝냈습니다. 엔진이 작은 배열에서는 <code>shift()</code>를 최적화하기도 하지만, 큰 배열에서는 기대할 수 없습니다.
      </Callout>
      <Code label="큐: 앞 위치(head)를 기억해서 O(1)에 꺼내기">{`
class Queue {
  items = [];
  head = 0; // 다음에 꺼낼 원소의 위치

  enqueue(x) { this.items.push(x); }
  dequeue() {
    if (this.head === this.items.length) return undefined;
    const x = this.items[this.head++];
    // 앞쪽에 버려진 칸이 절반을 넘으면 한 번에 정리한다
    if (this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return x;
  }
  get size() { return this.items.length - this.head; }
}`}</Code>
      <p>
        버려진 칸을 정리하는 <code>slice</code>는 O(n)이지만, 꺼낸 원소가 남은 원소보다 많아졌을 때만 일어나므로 꺼내기 한 번에 드는 비용을 평균 내면 O(1)입니다. 다음 장의 BFS 코드가 <code>shift()</code> 대신 인덱스로 큐의 앞을 가리키는 것도 같은 이유입니다.
      </p>

      <h2>스택이 쓰이는 곳</h2>
      <p>
        "가장 최근 것부터 되돌아간다"는 성질은 생각보다 자주 등장합니다. 편집기의 실행 취소(Ctrl+Z)는 했던 작업을 스택에 쌓아 두고 맨 위부터 꺼냅니다. 브라우저의 뒤로 가기도 방문한 페이지의 스택입니다. 무엇보다 프로그램이 함수를 부를 때마다 돌아올 위치와 지역 변수를 쌓아 두는 <T en="call stack">호출 스택</T>이 있습니다. 재귀 함수가 끝없이 자기 자신을 부르면 이 스택이 넘쳐서 <code>RangeError: Maximum call stack size exceeded</code>, 이른바 <T en="stack overflow">스택 오버플로</T>가 납니다.
      </p>
      <p>
        코드 편집기가 괄호 짝이 틀렸다고 빨간 줄을 긋는 것도 스택으로 할 수 있습니다. 괄호는 가장 최근에 열린 것이 가장 먼저 닫혀야 하기 때문입니다.
      </p>
      <BracketFigure />
      <Code label="괄호 짝 검사">{`
function isBalanced(text) {
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  for (const ch of text) {
    if (ch === '(' || ch === '[' || ch === '{') stack.push(ch);
    else if (ch in pairs) {
      // 비어 있으면 pop()은 undefined라서 짝이 맞지 않는다
      if (stack.pop() !== pairs[ch]) return false;
    }
  }
  return stack.length === 0; // 남은 괄호가 있으면 덜 닫힌 것
}`}</Code>
      <p>
        큐는 "온 순서대로 공평하게" 처리해야 하는 곳에 쓰입니다. 프린터 인쇄 대기열, 서버로 몰려드는 요청을 차례로 처리하는 작업 대기열, 서비스 사이에 메시지를 전달하는 메시지 큐가 그렇습니다. JavaScript의 이벤트 루프도 실행할 콜백을 큐에 넣어 두고 앞에서부터 하나씩 꺼내 실행합니다.
      </p>

      <h2>우선순위 큐와 힙</h2>
      <p>
        응급실이나 운영체제의 작업 스케줄러, 다익스트라 알고리즘은 들어온 순서가 아니라 <strong>가장 급한 것</strong>부터 꺼내야 합니다. 이런 자료구조를 <T en="priority queue">우선순위 큐</T>라고 합니다. 가장 쉽게 떠오르는 방법은 두 가지입니다.
      </p>
      <ul>
        <li>배열에 그냥 넣고, 꺼낼 때마다 전체를 훑어 최솟값을 찾는다. 넣기는 O(1)이지만 꺼내기가 O(n)입니다.</li>
        <li>배열을 항상 정렬된 상태로 유지한다. 꺼내기는 O(1)이지만, 넣을 때마다 자리를 찾아 뒤의 원소를 밀어야 하므로 넣기가 O(n)입니다.</li>
      </ul>
      <p>
        <T en="binary heap">이진 힙</T>은 둘 사이의 절충입니다. 모든 원소를 정렬하지는 않고, 딱 하나의 규칙만 지킵니다. <strong>모든 부모는 자기 자식보다 작거나 같다</strong>. 이 규칙만 지키면 가장 작은 값은 언제나 맨 위(루트)에 있습니다. 이렇게 작은 값이 위로 오는 힙을 최소 힙, 반대를 최대 힙이라고 합니다.
      </p>
      <p>
        힙은 트리 모양이지만 실제로는 배열 하나에 위에서 아래로, 왼쪽에서 오른쪽으로 빈틈없이 채워 저장합니다. 그래서 포인터 없이 인덱스 계산만으로 부모와 자식을 찾을 수 있습니다. 인덱스 i의 부모는 <M>{'\\lfloor (i-1)/2 \\rfloor'}</M>, 두 자식은 <M>{'2i+1'}</M>과 <M>{'2i+2'}</M>입니다.
      </p>
      <HeapFigure />
      <p>
        넣을 때는 새 값을 배열 맨 끝에 두고, 부모보다 작으면 자리를 바꾸며 위로 올라갑니다. 꺼낼 때는 루트를 꺼내고 맨 끝 값을 루트 자리로 옮긴 뒤, 두 자식 중 더 작은 쪽과 자리를 바꾸며 아래로 내려갑니다. 어느 쪽이든 한 층에 한 번씩만 움직이므로, 비교 횟수는 트리의 높이에 비례합니다. 빈틈없이 채운 트리의 높이는 <M>{'\\lfloor \\log_2 n \\rfloor'}</M>이므로 넣기와 꺼내기가 모두 <M>{'O(\\log n)'}</M>입니다. 원소가 100만 개여도 한 번에 약 20층만 오르내리면 됩니다.
      </p>
      <p>
        "최솟값 꺼내기"를 여러 번 눌러 "꺼낸 순서"를 보세요. 오름차순으로 정렬되어 나옵니다. 모두 넣었다가 모두 꺼내면 그 자체로 <M>{'O(n \\log n)'}</M> 정렬이 되는데, 이것이 <T en="heap sort">힙 정렬</T>입니다.
      </p>
      <Code label="최소 힙">{`
class MinHeap {
  a = [];

  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;   // 부모 인덱스
      if (a[p] <= a[i]) break;  // 규칙을 지키면 멈춤
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  pop() {
    const a = this.a;
    if (a.length === 0) return undefined;
    const min = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      while (true) {
        const l = 2 * i + 1, r = l + 1;
        let c = l;                          // 더 작은 자식
        if (r < a.length && a[r] < a[l]) c = r;
        if (l >= a.length || a[i] <= a[c]) break;
        [a[i], a[c]] = [a[c], a[i]];
        i = c;
      }
    }
    return min;
  }

  get size() { return this.a.length; }
}`}</Code>
      <p>세 가지 방법을 표로 정리하면 이렇습니다.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>구현</th>
              <th>넣기</th>
              <th>최솟값 꺼내기</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>정렬 안 된 배열</td>
              <td>O(1)</td>
              <td>O(n)</td>
            </tr>
            <tr>
              <td>정렬된 배열</td>
              <td>O(n)</td>
              <td>O(1)</td>
            </tr>
            <tr>
              <td>이진 힙</td>
              <td>O(log n)</td>
              <td>O(log n)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>표만 보면 각자 한쪽은 O(1)이니 비슷해 보입니다. 넣기와 꺼내기를 섞어서 계속 해야 하는 실제 상황에서 세 구현이 하는 일의 양을 세어 보겠습니다.</p>
      <PQFigure />
      <p>
        n이 100일 때는 세 구현이 비슷합니다. 데이터가 적으면 어떤 방법이든 상관없다는 뜻입니다. n이 10배 늘 때마다 두 배열 구현은 일이 70~100배씩 늘어나는 반면(<M>{'O(n^2)'}</M>), 힙은 15배 안팎으로 늘어납니다(<M>{'O(n \\log n)'}</M>). 10,000번에서는 차이가 30배에서 60배까지 벌어집니다.
      </p>
      <Callout kind="note">
        JavaScript에는 우선순위 큐가 기본으로 들어 있지 않아서 위의 <code>MinHeap</code>처럼 직접 만들거나 라이브러리를 씁니다. 다른 언어는 표준 라이브러리에 있습니다. Python의 <code>heapq</code>, Java의 <code>PriorityQueue</code>, C++의 <code>std::priority_queue</code>가 모두 이진 힙입니다. 숫자가 아닌 객체를 넣을 때는 <code>{'a[i] < a[p]'}</code> 대신 비교 함수를 받도록 고치면 됩니다.
      </Callout>

      <Callout kind="key">
        스택은 가장 최근 것(LIFO), 큐는 가장 오래된 것(FIFO), 힙은 가장 작은 것을 먼저 꺼냅니다. 스택과 큐는 넣기와 꺼내기가 O(1)이고, 힙은 O(log n)입니다. JavaScript 배열로 큐를 만들 때는 <code>shift()</code>가 O(n)이라는 점을 기억하세요.
      </Callout>
      <Quiz
        q="실시간으로 쏟아지는 수백만 개의 게임 점수 중 지금까지의 상위 10개를 계속 보여 주고 싶다. 가장 효율적인 방법은?"
        options={['점수가 들어올 때마다 전체를 정렬해 앞의 10개를 본다', '크기 10짜리 최소 힙을 두고, 새 점수가 힙의 최솟값보다 크면 최솟값을 꺼내고 새 점수를 넣는다', '모든 점수를 큐에 넣고 앞에서 10개를 본다', '모든 점수를 스택에 넣고 위에서 10개를 본다']}
        answer={1}
        explain={<>최소 힙의 루트는 지금까지의 상위 10개 중 가장 낮은 점수, 곧 "10등 커트라인"입니다. 새 점수가 커트라인보다 낮으면 비교 한 번으로 버리고, 높으면 커트라인을 꺼내고 새 점수를 넣습니다. 힙의 크기가 10으로 고정이므로 점수 하나에 드는 일은 많아야 <M>{'O(\\log 10)'}</M>, 사실상 상수입니다. 매번 정렬하면 점수 하나마다 <M>{'O(n \\log n)'}</M>이 들고, 큐와 스택은 도착 순서만 기억할 뿐 점수 크기를 보지 않습니다.</>}
      />
    </>
  );
}
