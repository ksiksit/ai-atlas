import { useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { RunBox, type Task } from './RunBox';
import { fnv, parseSource, trace, type Program } from './trace';
import { CodeView, TraceBlock } from './TraceView';
import './programming.css';

/* ─────────────── Figure 1: factorial, the stack grows and unwinds ─────────────── */

const FACT_SRC = (n: number) => `
function fact(n) { @@f0
  if (n <= 1) return 1;       // 기저 사례 @@base
  return n * fact(n - 1);     // 재귀 호출 @@rec
}
const r = fact(${n}); @@call
console.log(r); @@log
`;

const NOBASE_SRC = (n: number) => `
function fact(n) { @@f0
  // 멈추는 조건이 없다!
  return n * fact(n - 1); @@rec
}
const r = fact(${n}); @@call
console.log(r); @@log
`;

const NOBASE_DEPTH = 7;

function factProgram(n: number, base: boolean): Program {
  if (!base)
    return trace(NOBASE_SRC(n), (t) => {
      t.def('fact', fnv('fact'));
      t.step('f0', 'fact 함수를 정의합니다. 이번에는 기저 사례가 없습니다.');
      t.step('call', `fact(${n})을 호출합니다.`, '호출 →');
      for (let k = n; ; k--) {
        t.enter(`fact(${k})`, { n: k });
        t.step('f0', `fact(${k}) 프레임이 쌓였습니다.`);
        if (t.depth > NOBASE_DEPTH) {
          t.step('rec', `n이 ${k}까지 내려갔는데도 멈출 줄을 모릅니다. 0, -1, -2 … 끝없이 내려가며 프레임이 쌓입니다. 실제로는 프레임이 약 1만 개쯤 쌓이면 스택 메모리가 바닥나 RangeError: Maximum call stack size exceeded로 프로그램이 죽습니다.`, '✗ 스택 넘침');
          return;
        }
        t.step('rec', `n * fact(n - 1)을 계산하려면 fact(${k - 1})이 먼저 필요합니다. 또 호출합니다.`, `${k} * fact(${k - 1})`);
      }
    });
  return trace(FACT_SRC(n), (t) => {
    t.def('fact', fnv('fact'));
    t.step('f0', 'fact 함수를 정의합니다. n! = n × (n−1) × … × 1 을 계산하는 함수입니다.');
    t.step('call', `fact(${n})을 호출합니다.`, '호출 →');
    const go = (k: number): number => {
      t.enter(`fact(${k})`, { n: k });
      t.step('f0', `fact(${k})의 프레임이 쌓였습니다. 이 프레임의 n은 ${k}입니다.`);
      if (k <= 1) {
        t.ret(1);
        t.step('base', `n이 ${k}이므로 기저 사례입니다. 더 부르지 않고 바로 1을 돌려줍니다. 여기서 쌓이기를 멈추고 풀리기 시작합니다.`, `${k} <= 1 → true`);
        t.leave();
        return 1;
      }
      t.step('base', `${k} <= 1이 거짓이므로 기저 사례가 아닙니다.`, `${k} <= 1 → false`);
      t.step('rec', `${k} * fact(${k - 1})을 계산하려면 fact(${k - 1})의 답이 먼저 필요합니다. 곱셈은 미뤄 두고 호출합니다. 이 프레임은 여기서 기다립니다.`, `${k} * fact(${k - 1})`);
      const sub = go(k - 1);
      const v = t.ret(k * sub);
      t.step('rec', `fact(${k - 1})이 ${sub}을 돌려줬습니다. 미뤄 둔 곱셈 ${k} × ${sub} = ${v}를 마저 하고 돌려줍니다.`, `${k} * ${sub} = ${v}`);
      t.leave();
      return v;
    };
    const r = go(n);
    t.def('r', r);
    t.step('call', `모든 프레임이 풀리고 r = ${r}.`);
    t.log(r);
    t.step('log', `${n}! = ${r}. 프레임은 최대 ${n + 1}층(전역 포함)까지 쌓였습니다.`);
  });
}

function FactFigure() {
  const [n, setN] = useState(4);
  const [base, setBase] = useState(true);
  const program = useMemo(() => factProgram(n, base), [n, base]);
  return (
    <Figure
      no={1}
      title="fact(n): 스택이 쌓이고 풀리기"
      hint="재생을 누르고 오른쪽 스택을 보세요"
      caption={<>호출할 때마다 fact 프레임이 한 층씩 쌓입니다. 각 프레임의 n은 서로 다른 변수입니다. 기저 사례에 닿으면 맨 위 프레임부터 값을 돌려주며 한 층씩 사라지고, 기다리던 아래 프레임이 미뤄 둔 곱셈을 마칩니다.</>}
    >
      <TraceBlock program={program} id="rc-fact-speed" speed={2}>
        <div className="ctl" style={{ flex: '1 1 200px', gap: 10 }}>
          <Slider label="n" value={n} min={1} max={6} step={1} onChange={setN} />
          <Check label="기저 사례 빼기" checked={!base} onChange={(v) => setBase(!v)} />
        </div>
      </TraceBlock>
    </Figure>
  );
}

/* ─────────────── Figure 2: the size of a folder ─────────────── */

interface FsNode {
  id: number;
  name: string;
  size?: number; // files only, in MB
  children?: FsNode[];
  depth: number;
}

type Spec = [string, number | Spec[]];

const TREES: Record<'small' | 'deep', Spec> = {
  small: [
    '내 폴더',
    [
      ['사진', [['제주.jpg', 4], ['가족.jpg', 2]]],
      ['메모.txt', 1],
      ['문서', [['이력서.pdf', 1], ['계약서.pdf', 3]]],
    ],
  ],
  deep: [
    '프로젝트',
    [
      ['src', [['main.js', 2], ['lib', [['util.js', 1], ['math', [['vec.js', 1], ['mat.js', 2]]]]]]],
      ['README.md', 1],
      ['assets', [['logo.png', 3]]],
    ],
  ],
};

function buildTree(spec: Spec): FsNode[] {
  const flat: FsNode[] = [];
  const go = ([name, body]: Spec, depth: number): FsNode => {
    const node: FsNode = { id: flat.length, name, depth };
    flat.push(node);
    if (typeof body === 'number') node.size = body;
    else node.children = body.map((c) => go(c, depth + 1));
    return node;
  };
  go(spec, 0);
  return flat;
}

const SIZE_SRC = `
function size(node) { @@f0
  if (node.type === 'file') return node.size; @@base
  let total = 0; @@t
  for (const child of node.children) { @@for
    total = total + size(child); @@rec
  }
  return total; @@ret
}
`;

interface FsFrame {
  id: number;
  total: number | null; // null for a file frame
}
interface FsStep {
  line: number;
  active: number;
  stack: FsFrame[];
  done: Map<number, number>;
  note: string;
}

function sizeTrace(flat: FsNode[]): { steps: FsStep[]; lines: string[] } {
  const { lines, marks } = parseSource(SIZE_SRC);
  const L = (m: string) => marks.get(m)!;
  const steps: FsStep[] = [];
  const stack: FsFrame[] = [];
  const done = new Map<number, number>();
  const rec = (line: number, active: number, note: string) => steps.push({ line, active, stack: stack.map((f) => ({ ...f })), done: new Map(done), note });
  const label = (n: FsNode) => (n.children ? `${n.name}/` : n.name);
  const go = (n: FsNode): number => {
    stack.push({ id: n.id, total: null });
    rec(L('f0'), n.id, `size(${label(n)})를 호출합니다. 스택에 프레임이 하나 쌓입니다.`);
    if (!n.children) {
      done.set(n.id, n.size!);
      rec(L('base'), n.id, `${n.name}은 파일이므로 기저 사례입니다. 더 내려가지 않고 크기 ${n.size}MB를 바로 돌려줍니다.`);
      stack.pop();
      return n.size!;
    }
    const me = stack[stack.length - 1];
    me.total = 0;
    rec(L('t'), n.id, `${n.name}/은 폴더입니다. 안에 든 것들의 크기를 모을 total을 0으로 시작합니다.`);
    for (const c of n.children) {
      rec(L('for'), n.id, `${n.name}/의 다음 항목은 ${label(c)}. 그 크기를 알기 위해 같은 함수 size를 다시 부릅니다.`);
      const s = go(c);
      me.total += s;
      rec(L('rec'), n.id, `size(${label(c)})이 ${s}MB를 돌려줬습니다. ${n.name}/의 total은 ${me.total}MB.`);
    }
    done.set(n.id, me.total);
    rec(L('ret'), n.id, `${n.name}/의 항목을 모두 셌습니다. ${me.total}MB를 돌려줍니다.`);
    stack.pop();
    return me.total;
  };
  rec(-1, -1, '▶을 눌러 size(루트)를 호출해 보세요.');
  const total = go(flat[0]);
  rec(-1, -1, `끝. 전체 크기는 ${total}MB입니다. 폴더가 몇 겹이든 같은 함수 하나로 셌습니다.`);
  return { steps, lines };
}

function FolderFigure() {
  const [kind, setKind] = useState<'small' | 'deep'>('small');
  const flat = useMemo(() => buildTree(TREES[kind]), [kind]);
  const { steps, lines } = useMemo(() => sizeTrace(flat), [flat]);
  const s = useStepper(steps.length, 3, kind);
  const st = steps[s.i];
  const onStack = new Set(st.stack.map((f) => f.id));
  const maxDepth = Math.max(...steps.map((x) => x.stack.length));

  return (
    <Figure
      no={2}
      title="폴더 크기 세기"
      hint="재생하며 왼쪽 폴더와 오른쪽 스택을 함께 보세요"
      caption={<>왼쪽은 폴더 구조입니다. 색 막대가 붙은 줄은 지금 호출 스택에 프레임이 있는(아직 계산 중인) 항목이고, 노란 줄이 지금 실행 중인 호출입니다. 크기를 다 센 항목에는 결과가 파란색으로 적힙니다. 오른쪽 스택의 각 층은 size 호출 하나이고, 폴더 프레임에는 지금까지 모은 total이 보입니다.</>}
    >
      <Seg
        label="폴더"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'small', label: '내 폴더 (2겹)' },
          { value: 'deep', label: '프로젝트 (4겹)' },
        ]}
      />
      <div className="tr-main">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="fs-tree" role="img" aria-label={`폴더 구조. 지금 계산 중: ${st.active >= 0 ? flat[st.active].name : '없음'}`}>
            {flat.map((n) => (
              <div key={n.id} className="fs-row" style={{ paddingLeft: 8 + n.depth * 18 }} data-active={n.id === st.active || undefined} data-stack={onStack.has(n.id) || undefined}>
                <span className="fs-icon" aria-hidden="true">
                  {n.children ? '▸' : '·'}
                </span>
                <span className="fs-name">{n.children ? `${n.name}/` : n.name}</span>
                <span className="fs-size" data-done={st.done.has(n.id) || undefined}>
                  {st.done.has(n.id) ? `${st.done.get(n.id)}MB` : n.children ? '?' : `${n.size}MB`}
                </span>
              </div>
            ))}
          </div>
          <CodeView lines={lines} cur={st.line} label="폴더 크기를 세는 재귀 함수" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div className="tr-col-head">호출 스택 (위가 실행 중)</div>
          <div className="fs-stack">
            <div className="fs-frame">
              <span>전역</span>
            </div>
            {st.stack.map((f, k) => {
              const n = flat[f.id];
              return (
                <div key={k} className="fs-frame" data-active={k === st.stack.length - 1 || undefined}>
                  <span>size({n.children ? `${n.name}/` : n.name})</span>
                  {f.total !== null && <span className="acc">total={f.total}</span>}
                </div>
              );
            })}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="지금 스택 깊이" value={`${st.stack.length}층`} />
            <Readout label="가장 깊었을 때" value={`${maxDepth}층`} />
          </div>
        </div>
      </div>
      <div className="tr-note" aria-live="polite">
        {st.note}
      </div>
      <div className="controls row">
        <div className="ctl" style={{ flex: '1 1 300px' }}>
          <StepControls s={s} id="rc-fs-speed" maxSpeed={12} />
        </div>
        <div className="ctl" style={{ flex: '1 1 200px' }}>
          <Legend
            items={[
              { color: 'var(--hl)', label: '실행 중인 호출', shape: 'sq' },
              { color: 'var(--part-color)', label: '스택에 있는 호출', shape: 'sq' },
              { color: 'var(--neg)', label: '다 센 크기', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: practice ─────────────── */

const TASKS: Task[] = [
  {
    id: 'loop',
    label: '재귀를 반복문으로',
    prompt: (
      <p>
        1부터 n까지의 합을 재귀로 구하는 함수입니다. 실행해 보면 마지막 테스트 <code>sumTo(100000)</code>에서 호출 스택이 넘칩니다. 프레임이 10만 층 쌓여야 하기 때문입니다. 같은 일을 반복문으로 바꿔 모든 테스트를 통과시켜 보세요.
      </p>
    ),
    starter: `
function sumTo(n) {
  if (n === 0) return 0;          // 기저 사례
  return n + sumTo(n - 1);        // 재귀 호출
}
`,
    fnName: 'sumTo',
    tests: [
      { args: [1], expect: 1 },
      { args: [10], expect: 55 },
      { args: [1000], expect: 500500 },
      { args: [100000], expect: 5000050000, note: '아주 깊은 호출' },
    ],
    solution: `
function sumTo(n) {
  let sum = 0;
  for (let i = 1; i <= n; i++) {
    sum = sum + i;
  }
  return sum;
}
`,
  },
  {
    id: 'power',
    label: '거듭제곱',
    prompt: (
      <p>
        <code>power(base, exp)</code>는 base를 exp번 곱한 값입니다. 재귀로 써 보세요. 기저 사례는 <code>exp === 0</code>일 때 1이고, 그 밖에는 <code>base × power(base, exp − 1)</code>입니다.
      </p>
    ),
    starter: `
function power(base, exp) {
  // 기저 사례

  // 재귀 호출

}
`,
    fnName: 'power',
    tests: [
      { args: [2, 0], expect: 1, note: '기저 사례' },
      { args: [2, 10], expect: 1024 },
      { args: [3, 4], expect: 81 },
      { args: [10, 3], expect: 1000 },
    ],
    solution: `
function power(base, exp) {
  if (exp === 0) return 1;
  return base * power(base, exp - 1);
}
`,
  },
  {
    id: 'files',
    label: '파일 개수 세기',
    prompt: (
      <p>
        그림 2의 폴더처럼 <code>{"{ type: 'dir', children: [...] }"}</code>와 <code>{"{ type: 'file', size }"}</code>로 된 구조에서 <strong>파일의 개수</strong>를 세어 보세요. 그림 2의 size 함수와 모양이 똑같습니다. 파일이면 1, 폴더면 자식들의 개수를 더합니다.
      </p>
    ),
    starter: `
function countFiles(node) {
  if (node.type === 'file') return 1;
  let count = 0;
  // 자식마다 countFiles를 불러 더하세요

  return count;
}
`,
    fnName: 'countFiles',
    tests: [
      { args: [{ type: 'file', size: 3 }], expect: 1, note: '파일 하나' },
      { args: [{ type: 'dir', children: [] }], expect: 0, note: '빈 폴더' },
      {
        args: [
          {
            type: 'dir',
            children: [
              { type: 'file', size: 1 },
              { type: 'dir', children: [{ type: 'file', size: 2 }, { type: 'file', size: 4 }] },
              { type: 'dir', children: [{ type: 'dir', children: [{ type: 'file', size: 1 }] }] },
            ],
          },
        ],
        expect: 4,
      },
    ],
    solution: `
function countFiles(node) {
  if (node.type === 'file') return 1;
  let count = 0;
  for (const child of node.children) {
    count = count + countFiles(child);
  }
  return count;
}
`,
  },
];

/* ─────────────── Lesson ─────────────── */

export default function Recursion() {
  return (
    <>
      <h2>자기 자신을 부르는 함수</h2>
      <p>
        함수는 다른 함수를 부를 수 있고, 자기 자신도 부를 수 있습니다. 자기 자신을 부르는 함수를 <T en="recursive function">재귀 함수</T>라고 합니다. 처음 들으면 무한히 자기를 부르다 끝나지 않을 것 같지만, 핵심은 매번 <strong>조금 더 작은 문제</strong>로 부른다는 데 있습니다. 문제가 충분히 작아지면 바로 답할 수 있고, 거기서 멈춥니다.
      </p>
      <p>
        팩토리얼을 예로 들어 봅시다. <code>4! = 4 × 3 × 2 × 1</code>입니다. 그런데 <code>3 × 2 × 1</code>은 <code>3!</code>이므로, <code>4! = 4 × 3!</code>이라고 쓸 수 있습니다. 큰 문제(4!)를 같은 모양의 작은 문제(3!)로 바꾼 것입니다. 이것을 그대로 코드로 옮기면 재귀 함수가 됩니다.
      </p>
      <Code label="팩토리얼">{`
function fact(n) {
  if (n <= 1) return 1;       // 기저 사례: 바로 답할 수 있는 가장 작은 문제
  return n * fact(n - 1);     // 재귀 호출: 한 단계 작은 같은 문제에 맡긴다
}
fact(4);   // 4 * fact(3) = 4 * 3 * fact(2) = 4 * 3 * 2 * fact(1) = 24`}</Code>
      <p>
        재귀 함수에는 반드시 두 부분이 있습니다. 더 쪼개지 않고 바로 답을 돌려주는 <T en="base case">기저 사례</T>와, 문제를 줄여 자기 자신을 부르는 <T en="recursive case">재귀 호출</T>입니다. 그리고 재귀 호출은 언젠가 기저 사례에 닿도록 문제를 줄여야 합니다. <code>fact(n - 1)</code>은 n을 1씩 줄이므로 결국 1에 닿습니다.
      </p>

      <h2>호출 스택이 쌓이고 풀리기</h2>
      <p>
        지난 장에서 본 호출 스택이 재귀를 이해하는 열쇠입니다. <code>fact(4)</code>는 <code>fact(3)</code>을 부르고 답을 기다립니다. <code>fact(3)</code>은 <code>fact(2)</code>를 부르고 기다립니다. 같은 함수지만 호출마다 프레임이 따로 생기므로, 각 프레임의 n은 4, 3, 2, 1로 서로 다른 변수입니다. 그림 1에서 직접 보세요.
      </p>
      <FactFigure />
      <p>
        재귀는 두 단계로 움직입니다. 먼저 <strong>내려가는</strong> 단계에서 곱셈을 미뤄 둔 프레임들이 쌓입니다. 기저 사례 <code>fact(1)</code>이 1을 돌려주는 순간부터 <strong>올라오는</strong> 단계가 시작되어, 기다리던 프레임들이 미뤄 둔 곱셈 <code>2 × 1</code>, <code>3 × 2</code>, <code>4 × 6</code>을 차례로 끝내며 사라집니다. 실제 계산은 올라오는 길에 일어납니다.
      </p>
      <Callout kind="warn">
        "기저 사례 빼기"를 켜 보세요. 멈추는 조건이 없으면 n이 0, −1, −2 …로 끝없이 내려가며 프레임이 쌓입니다. 호출 스택은 크기가 정해진 메모리라서, 수천~수만 층이 쌓이면 바닥나고 <code>RangeError: Maximum call stack size exceeded</code>로 프로그램이 멈춥니다. 이것이 개발자 질문 사이트 이름으로도 유명한 <T en="stack overflow">스택 오버플로</T>입니다. 재귀 함수를 쓰면 가장 먼저 "기저 사례에 반드시 닿는가"를 확인하세요.
      </Callout>

      <h2>재귀가 빛나는 곳: 같은 모양이 겹겹이</h2>
      <p>
        팩토리얼은 반복문으로도 쉽게 씁니다. 재귀가 진짜 빛나는 곳은 데이터 자체가 재귀적인 모양일 때입니다. 컴퓨터의 폴더가 그렇습니다. 폴더 안에는 파일과 폴더가 있고, 그 폴더 안에 또 파일과 폴더가 있습니다. 몇 겹인지는 미리 알 수 없습니다. "폴더의 크기는 안에 든 것들의 크기의 합"이라는 정의를 그대로 코드로 옮기면 됩니다.
      </p>
      <FolderFigure />
      <p>
        그림 2에서 "프로젝트 (4겹)"을 골라 보세요. 폴더가 더 깊어져도 코드는 한 글자도 바뀌지 않았습니다. 스택이 깊어질 뿐입니다. 반복문으로 같은 일을 하려면 "아직 들어가 보지 않은 폴더 목록"을 직접 관리해야 합니다. 재귀에서는 그 목록 역할을 호출 스택이 대신해 줍니다. 스택에 쌓인 프레임들이 곧 "지금 어느 폴더의 몇 번째 항목을 보다가 내려왔는지"의 기록입니다.
      </p>
      <Callout kind="intuition">
        재귀 함수를 짤 때는 함수 안을 끝까지 따라가려고 하지 마세요. 대신 "size(child)는 자식의 크기를 정확히 돌려준다"고 <strong>믿고</strong>, 그 답들로 지금 폴더의 답을 어떻게 만들지만 생각합니다. 기저 사례가 맞고 문제가 매번 작아진다면, 그 믿음은 수학적 귀납법과 같은 이유로 옳습니다.
      </Callout>
      <p>
        웹 페이지의 HTML 요소들, 회사의 조직도, 댓글에 달린 답글, 수식의 괄호 구조처럼 "같은 모양이 안에 또 들어 있는" 데이터는 어디에나 있습니다. 이런 데이터를 다루는 코드는 재귀로 쓰면 데이터의 정의를 그대로 닮아 짧고 읽기 쉬워집니다.
      </p>

      <h2>반복문으로 바꾸기</h2>
      <p>
        재귀에는 비용도 있습니다. 호출마다 프레임이 쌓이므로 깊이가 n이면 메모리도 n만큼 씁니다. 1부터 n까지 더하는 정도의 일을 재귀로 하면, n이 10만일 때 프레임이 10만 개 필요해 스택이 넘칩니다. 반복문은 변수 몇 개를 고쳐 가며 같은 일을 하므로 프레임이 하나뿐입니다.
      </p>
      <Code label="같은 일, 두 가지 방법">{`
// 재귀: 정의를 그대로 옮긴다. 깊이 n만큼 프레임이 쌓인다
function factRec(n) {
  if (n <= 1) return 1;
  return n * factRec(n - 1);
}

// 반복: 결과를 변수 하나에 누적한다. 프레임은 하나
function factLoop(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result = result * i;
  }
  return result;
}`}</Code>
      <p>
        한 번에 한 갈래로만 내려가는 재귀(팩토리얼, 합계)는 대개 반복문으로 쉽게 바꿀 수 있고, 그편이 빠르고 안전합니다. 여러 갈래로 나뉘는 재귀(폴더, 트리)는 반복문으로 바꾸려면 스택을 직접 만들어야 해서 재귀가 더 자연스럽습니다. 그림 3에서 직접 바꿔 보세요.
      </p>
      <Figure no={3} title="직접 실행: 재귀 연습" hint="코드를 고치고 ▶ 실행을 누르세요" caption={<>"재귀를 반복문으로"의 처음 코드는 작은 n에서는 잘 동작하다가 10만에서 호출 스택이 넘칩니다. 오류는 작업자 안에서 일어나므로 페이지는 멀쩡합니다. "파일 개수 세기"는 그림 2의 함수와 같은 뼈대로 풀립니다.</>}>
        <RunBox tasks={TASKS} id="rc-run-status" />
      </Figure>
      <p>
        재귀는 알고리즘 설계의 기본 도구입니다. 같은 하위 문제를 여러 번 푸는 재귀(피보나치 수)가 왜 느린지, 모든 경우를 따져 보는 백트래킹은 어떻게 짜는지는 <a href={lessonHref('cs-algorithm-design', 'recursion')}>알고리즘 설계의 재귀와 백트래킹 장</a>에서, 문제를 반으로 나눠 푸는 병합 정렬은 <a href={lessonHref('cs-algorithms', 'sorting')}>정렬 장</a>에서 이어집니다.
      </p>

      <Callout kind="key">
        재귀 함수는 기저 사례에서 바로 답하고, 그 밖에는 더 작은 같은 문제로 자기 자신을 부릅니다. 호출마다 프레임이 쌓였다가 기저 사례부터 거꾸로 풀리며 답이 완성됩니다. 데이터가 겹겹이 같은 모양일 때 재귀가 자연스럽고, 깊이가 아주 깊다면 반복문으로 바꾸는 것이 안전합니다.
      </Callout>
      <Quiz
        q={
          <>
            <code>{'function f(n) { if (n === 0) return 0; return n + f(n - 2); }'}</code>에서 <code>f(5)</code>를 부르면?
          </>
        }
        options={['9를 돌려준다 (5 + 3 + 1)', '15를 돌려준다', '0을 돌려준다', '기저 사례에 닿지 못해 스택이 넘친다']}
        answer={3}
        explain={
          <>
            n이 5, 3, 1, −1, −3 …으로 2씩 줄어들어 0을 건너뜁니다. <code>n === 0</code>에 영원히 닿지 않으므로 스택이 넘칩니다. 기저 사례를 <code>n &lt;= 0</code>으로 쓰면 9를 돌려줍니다. 재귀 호출이 기저 사례에 "반드시" 닿는지는 경계값을 넣어 직접 따라가 봐야 압니다.
          </>
        }
      />
    </>
  );
}
