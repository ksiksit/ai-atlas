import { useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Quiz, Readout, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { RunBox, type Task } from './RunBox';
import { fnv, trace, type Program } from './trace';
import { TraceBlock, type LineMark } from './TraceView';
import './programming.css';

/* ─────────────── Figure 1: a test suite against hidden bugs ─────────────── */

/** The specification: 5만 원 이상 10% 할인, 3만 원 미만 배송비 3000원. */
const spec = (t: number) => (t >= 50000 ? t * 0.9 : t < 30000 ? t + 3000 : t);

interface Mutant {
  id: string;
  name: string;
  line: string;
  f: (t: number) => number;
}

const MUTANTS: Mutant[] = [
  { id: 'm1', name: '할인 경계', line: 'if (total > 50000)', f: (t) => (t > 50000 ? t * 0.9 : t < 30000 ? t + 3000 : t) },
  { id: 'm2', name: '배송비 경계', line: 'if (total <= 30000)', f: (t) => (t >= 50000 ? t * 0.9 : t <= 30000 ? t + 3000 : t) },
  { id: 'm3', name: '할인율', line: 'return total * 0.99;', f: (t) => (t >= 50000 ? t * 0.99 : t < 30000 ? t + 3000 : t) },
  { id: 'm4', name: '배송비 계산', line: 'return 3000;', f: (t) => (t >= 50000 ? t * 0.9 : t < 30000 ? 3000 : t) },
];

interface TCase {
  input: number;
  expect: number;
}

const START: TCase[] = [
  { input: 10000, expect: 13000 },
  { input: 40000, expect: 40000 },
  { input: 80000, expect: 72000 },
];

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const won = (v: number) => (Number.isInteger(v) ? v.toLocaleString('ko-KR') : v.toLocaleString('ko-KR', { maximumFractionDigits: 2 }));

function MutantFigure() {
  const [suite, setSuite] = useState<TCase[]>(START);
  const [inp, setInp] = useState('');
  const [exp, setExp] = useState('');
  const [msg, setMsg] = useState('');

  const add = () => {
    const a = Number(inp);
    const b = Number(exp);
    if (inp.trim() === '' || exp.trim() === '' || !Number.isFinite(a) || !Number.isFinite(b)) {
      setMsg('입력 금액과 기대한 값을 모두 숫자로 적어 주세요.');
      return;
    }
    if (suite.length >= 10) {
      setMsg('테스트는 10개까지 넣을 수 있습니다. 필요 없는 것을 지워 보세요.');
      return;
    }
    setSuite([...suite, { input: a, expect: b }]);
    setInp('');
    setExp('');
    setMsg(near(spec(a), b) ? `finalPrice(${a})는 ${won(b)}여야 한다는 테스트를 추가했습니다.` : `추가했지만, 이 기대값은 명세와 다릅니다. 명세대로라면 ${won(spec(a))}입니다. 테스트가 틀리면 맞는 코드도 실패합니다.`);
  };

  const caught = MUTANTS.map((m) => suite.findIndex((c) => !near(m.f(c.input), c.expect)));
  const wrongTests = suite.filter((c) => !near(spec(c.input), c.expect)).length;
  const nCaught = caught.filter((k) => k >= 0).length;

  return (
    <Figure
      no={1}
      title="테스트로 버그 잡기"
      hint="입력과 기대값을 적어 테스트를 추가해 보세요"
      caption={<>오른쪽 네 함수는 명세를 조금씩 잘못 구현한 "버그 있는 버전"입니다. 내 테스트 중 하나라도 실패시키면 그 버그를 잡은 것입니다. 표의 "명세" 칸은 올바른 구현이 그 테스트를 통과하는지입니다. 여기서 ✗가 나오면 코드가 아니라 테스트가 틀린 것입니다.</>}
    >
      <div className="ts-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <Code label="명세와 올바른 구현">{`
// 명세: 5만 원 이상이면 10% 할인,
//       3만 원 미만이면 배송비 3000원을 더한다
function finalPrice(total) {
  if (total >= 50000) return total * 0.9;
  if (total < 30000) return total + 3000;
  return total;
}`}</Code>
          <div className="tbl-wrap run-tests">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>finalPrice(입력)</th>
                  <th>기대한 값</th>
                  <th>명세</th>
                  <th aria-label="지우기" />
                </tr>
              </thead>
              <tbody>
                {suite.map((c, k) => {
                  const ok = near(spec(c.input), c.expect);
                  return (
                    <tr key={k} data-pass={ok ? 'y' : 'n'}>
                      <td className="mono">{k + 1}</td>
                      <td className="mono">{won(c.input)}</td>
                      <td className="mono">{won(c.expect)}</td>
                      <td className="run-mark">{ok ? '✓' : '✗'}</td>
                      <td>
                        <button type="button" className="ts-del" onClick={() => setSuite(suite.filter((_, j) => j !== k))} aria-label={`${k + 1}번 테스트 지우기`}>
                          지우기
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <form
            className="ts-add"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <label>
              입력 금액 total
              <input className="num-input" inputMode="decimal" value={inp} onChange={(e) => setInp(e.target.value)} placeholder="예: 30000" />
            </label>
            <label>
              기대한 값
              <input className="num-input" inputMode="decimal" value={exp} onChange={(e) => setExp(e.target.value)} placeholder="명세대로 계산" />
            </label>
            <button type="submit" className="btn small primary">
              추가
            </button>
          </form>
          <div className="note-line" aria-live="polite">
            {msg}
          </div>
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="잡은 버그" value={`${nCaught} / ${MUTANTS.length}`} color={nCaught === MUTANTS.length ? 'var(--good)' : undefined} />
            <Readout label="틀린 테스트" value={wrongTests} color={wrongTests ? 'var(--bad)' : undefined} />
          </div>
          <div className="ts-mutants" aria-live="polite">
            {MUTANTS.map((m, k) => (
              <div key={m.id} className="ts-mutant" data-caught={caught[k] >= 0 || undefined}>
                <span>
                  버그 {k + 1}: {m.name}
                </span>
                <span className="badge">{caught[k] >= 0 ? `잡힘 (#${caught[k] + 1})` : '살아남음'}</span>
                <span className="code-bit">{m.line}</span>
              </div>
            ))}
          </div>
          <div className="note-line">
            {nCaught === MUTANTS.length
              ? wrongTests
                ? '버그를 모두 잡았지만, 틀린 테스트가 있습니다. 틀린 테스트는 올바른 코드도 실패시키므로 고치거나 지워야 합니다.'
                : '네 버그를 모두 잡았습니다. 경계값 테스트가 없으면 버그 1, 2는 절대 잡히지 않습니다.'
              : nCaught >= 2 && caught[0] < 0 && caught[1] < 0
                ? '평범한 금액만으로는 버그 1, 2가 잡히지 않습니다. 조건이 바뀌는 바로 그 금액을 넣어 보세요.'
                : '명세의 각 경우(할인, 배송비, 그 사이)마다 적어도 하나씩 테스트해 보세요.'}
          </div>
          <Button small onClick={() => (setSuite(START), setMsg(''))}>
            처음 테스트로
          </Button>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: find the off-by-one ─────────────── */

const AVG_SRC = (start: number) => `
function average(scores) { @@f0
  let sum = 0; @@s
  for (let i = ${start}; i < scores.length; i++) { @@for
    sum = sum + scores[i]; @@body
  }
  return sum / scores.length; @@ret
}
const avg = average([80, 90, 70]); @@call
console.log(avg);    // 80이 나와야 하는데? @@log
`;

const BUG_LINE = 2;

function avgProgram(fixed: boolean): Program {
  const start = fixed ? 0 : 1;
  return trace(AVG_SRC(start), (t) => {
    t.def('average', fnv('average'));
    t.step('f0', 'average 함수를 정의합니다.');
    const scores = [80, 90, 70];
    t.step('call', 'average([80, 90, 70])을 호출합니다. 손으로 계산하면 평균은 80이어야 합니다.', '호출 →');
    t.enter('average(scores)', { scores });
    t.step('f0', 'scores가 세 점수를 담은 배열을 가리킵니다.');
    let sum = t.def('sum', 0) as number;
    t.step('s', 'sum = 0.');
    for (let i = start; ; i++) {
      t.def('i', i);
      if (!(i < scores.length)) {
        t.step('for', `i = ${i}. 반복이 끝났습니다.`, `${i} < 3 → false`);
        break;
      }
      t.step('for', `i = ${i}.${i === start && start === 1 ? ' 첫 반복인데 i가 1입니다. 그럼 scores[0]은…?' : ''}`, `${i} < 3 → true`);
      sum = t.set('sum', sum + scores[i]) as number;
      t.step('body', `scores[${i}] = ${scores[i]}을 더해 sum = ${sum}.`, `+ ${scores[i]}`);
    }
    t.drop('i');
    const avg = t.ret(sum / scores.length);
    t.step('ret', `${sum} / 3 = ${Math.round(avg * 100) / 100}.${fixed ? '' : ' sum이 240이어야 하는데 160입니다. 80이 빠졌습니다.'}`, `↩ ${Math.round(avg * 100) / 100}`);
    t.leave();
    t.def('avg', avg);
    t.step('call', `avg = ${Math.round(avg * 100) / 100}.`);
    t.log(avg);
    t.step('log', fixed ? '80. 맞는 답이 나왔습니다.' : '53.333…이 나왔습니다. 기대한 80과 다릅니다. 어느 줄이 문제일까요? 줄 번호를 눌러 골라 보세요.', fixed ? '✓' : '✗');
  });
}

const HINTS: Record<number, string> = {
  0: '함수 이름과 매개변수는 문제없어 보입니다. scores에는 세 점수가 제대로 들어왔습니다.',
  1: 'sum을 0에서 시작하는 것은 맞습니다. 합계는 아무것도 더하지 않았을 때 0이어야 하니까요.',
  3: '이 줄은 scores[i]를 sum에 더할 뿐입니다. 더하는 것 자체는 맞는데, 어떤 i들이 이 줄을 지나가는지 보세요.',
  5: '3으로 나누는 것은 맞습니다. 점수가 3개니까요. 나누기 전의 sum이 이미 틀렸습니다.',
  7: '호출하는 쪽은 [80, 90, 70]을 제대로 넘겼습니다. 문제는 함수 안입니다.',
  8: '출력은 받은 값을 보여 줄 뿐입니다. 값은 이미 그 전에 틀렸습니다.',
};

function DebugFigure() {
  const [fixed, setFixed] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const program = useMemo(() => avgProgram(fixed), [fixed]);
  const marks: Record<number, LineMark> = {};
  if (pick !== null) marks[pick] = pick === BUG_LINE ? 'good' : 'bad';

  return (
    <Figure
      no={2}
      title="디버깅: 범인 줄 찾기"
      hint="따라가다가 수상한 줄의 번호를 누르세요"
      caption={<>평균을 구하는 함수가 80 대신 53.33을 돌려줍니다. 한 단계씩 넘기며 i와 sum이 어떻게 변하는지 보세요. 손으로 계산한 기대값과 처음 어긋나는 순간을 찾으면, 그 직전에 실행된 줄이 범인입니다. 왼쪽 줄 번호를 눌러 범인을 지목할 수 있습니다.</>}
    >
      <TraceBlock program={program} id="ts-debug-speed" speed={2} marks={marks} onPick={(l) => setPick(l)}>
        <div className="ctl" style={{ flex: '1 1 220px', gap: 10 }}>
          <Check
            label="고친 코드로 실행 (i = 0부터)"
            checked={fixed}
            onChange={(v) => {
              setFixed(v);
              setPick(null);
            }}
          />
        </div>
      </TraceBlock>
      <div className="note-line" aria-live="polite" style={{ color: pick === null ? 'var(--ink-3)' : pick === BUG_LINE ? 'var(--good)' : 'var(--ink-2)' }}>
        {pick === null
          ? '범인이라고 생각하는 줄의 번호를 누르세요.'
          : pick === BUG_LINE
            ? fixed
              ? '맞습니다. 지금은 i = 0으로 고친 코드입니다. 끝까지 넘겨 80이 나오는지 확인해 보세요.'
              : '정답입니다. 배열의 첫 칸은 scores[0]인데 i가 1부터 시작해서 80을 한 번도 더하지 않았습니다. "고친 코드로 실행"을 켜서 확인해 보세요.'
            : (HINTS[pick] ?? '빈 줄이나 닫는 괄호입니다. 다른 줄을 골라 보세요.')}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: fix it yourself ─────────────── */

const TASKS: Task[] = [
  {
    id: 'avg',
    label: '평균 고치기',
    prompt: (
      <p>
        그림 2의 버그가 있는 <code>average</code>입니다. 테스트를 실행해 실패하는 것을 확인하고, 모든 테스트를 통과하도록 고쳐 보세요. 버그는 하나가 아닙니다. 빈 배열을 넘기면 어떻게 될까요?
      </p>
    ),
    starter: `
function average(scores) {
  let sum = 0;
  for (let i = 1; i < scores.length; i++) {
    sum = sum + scores[i];
  }
  return sum / scores.length;
}
`,
    fnName: 'average',
    tests: [
      { args: [[80, 90, 70]], expect: 80 },
      { args: [[100]], expect: 100, note: '원소 하나' },
      { args: [[55, 65]], expect: 60 },
      { args: [[]], expect: 0, note: '빈 배열' },
    ],
    solution: `
function average(scores) {
  if (scores.length === 0) return 0;   // 빈 배열: 0으로 나누지 않는다
  let sum = 0;
  for (let i = 0; i < scores.length; i++) {   // 첫 칸은 0번
    sum = sum + scores[i];
  }
  return sum / scores.length;
}
`,
  },
  {
    id: 'leap',
    label: '윤년',
    prompt: (
      <p>
        윤년은 4로 나누어떨어지는 해입니다. 단, 100으로 나누어떨어지면 윤년이 아니고, 그중에서도 400으로 나누어떨어지면 다시 윤년입니다. 처음 코드는 첫 규칙만 구현했습니다. 대부분의 해에서는 맞지만 경계에 있는 해에서 틀립니다. 테스트를 모두 통과시켜 보세요.
      </p>
    ),
    starter: `
function isLeapYear(year) {
  return year % 4 === 0;
}
`,
    fnName: 'isLeapYear',
    tests: [
      { args: [2024], expect: true },
      { args: [2023], expect: false },
      { args: [1900], expect: false, note: '100의 배수' },
      { args: [2000], expect: true, note: '400의 배수' },
      { args: [2100], expect: false, note: '100의 배수' },
    ],
    solution: `
function isLeapYear(year) {
  if (year % 400 === 0) return true;   // 가장 좁은 규칙부터
  if (year % 100 === 0) return false;
  return year % 4 === 0;
}
`,
  },
  {
    id: 'log',
    label: 'console.log로 좁히기',
    prompt: (
      <p>
        장바구니 총액이 이상하게 나옵니다. 우유 2개(2500원)와 빵 1개(3200원)면 8200원이어야 합니다. 반복문 안에 <code>console.log</code>를 넣어 매 바퀴의 값을 찍어 보고, 어디서 어긋나는지 찾아 고쳐 보세요. (힌트: 두 번째 테스트의 가격은 어떤 자료형인가요?)
      </p>
    ),
    starter: `
function cartTotal(cart) {
  let total = 0;
  for (const item of cart) {
    // 수량만큼 가격을 더한다
    for (let k = 0; k < item.qty; k++) {
      total = total + item.price;
      // console.log(item.name, k, total);
    }
  }
  return total;
}
`,
    fnName: 'cartTotal',
    tests: [
      {
        args: [
          [
            { name: '우유', price: 2500, qty: 2 },
            { name: '빵', price: 3200, qty: 1 },
          ],
        ],
        expect: 8200,
      },
      {
        args: [
          [
            { name: '우유', price: 2500, qty: '2' },
            { name: '빵', price: '3200', qty: 1 },
          ],
        ],
        expect: 8200,
        note: '폼에서 온 데이터 (문자열 섞임)',
      },
      { args: [[{ name: '잼', price: '4900', qty: '1' }]], expect: 4900, note: '모두 문자열' },
    ],
    solution: `
function cartTotal(cart) {
  let total = 0;
  for (const item of cart) {
    // 폼에서 온 값은 문자열일 수 있으므로 숫자로 바꾼다
    const price = Number(item.price);
    for (let k = 0; k < Number(item.qty); k++) {
      total = total + price;
    }
  }
  return total;
}
`,
  },
];

/* ─────────────── Lesson ─────────────── */

export default function Testing() {
  return (
    <>
      <h2>"돌아간다"와 "맞다"는 다르다</h2>
      <p>
        코드를 실행해 오류 없이 무언가가 출력되면 일단 안심이 됩니다. 하지만 오류가 없다는 것은 문법이 맞다는 뜻일 뿐, 답이 맞다는 뜻은 아닙니다. 지금까지 본 버그 대부분이 그랬습니다. <code>'2' + 2</code>는 오류 없이 <code>'22'</code>를 내놓고, 90점을 B로 매기는 학점 함수도, 첫 점수를 빼먹는 평균 함수도 멀쩡히 실행됩니다. 이렇게 조용히 틀리는 코드를 잡는 도구가 <T en="test">테스트</T>입니다.
      </p>
      <p>
        테스트는 "이 입력을 넣으면 이 값이 나와야 한다"를 코드로 적어 둔 것입니다. 입력과 기대값 한 쌍이 <T en="test case">테스트 케이스</T>입니다. 사람이 매번 손으로 확인하는 대신, 테스트를 적어 두면 코드를 고칠 때마다 몇 초 만에 모든 경우를 다시 확인할 수 있습니다.
      </p>
      <Code label="가장 단순한 테스트">{`
function check(name, got, expected) {
  if (got === expected) {
    console.log('통과', name);
  } else {
    console.log('실패', name, '기대:', expected, '실제:', got);
  }
}

check('보통 금액', finalPrice(10000), 13000);
check('할인 경계', finalPrice(50000), 45000);   // 경계값!
check('배송비 경계', finalPrice(30000), 30000);  // 경계값!`}</Code>
      <p>
        실무에서는 Jest, Vitest 같은 테스트 도구가 이런 <code>check</code>를 더 편하게 만들어 주지만, 원리는 같습니다. 함수를 부르고, 결과를 기대값과 비교합니다.
      </p>

      <h2>좋은 테스트 케이스 고르기</h2>
      <p>
        입력은 무한히 많으니 모두 시험할 수는 없습니다. 테스트의 기술은 적은 수로 버그를 최대한 많이 잡는 입력을 고르는 것입니다. 그림 1에서 직접 해 보세요. 왼쪽 명세대로 동작해야 하는 함수에, 버그가 하나씩 숨은 버전 네 개가 있습니다. 처음 들어 있는 세 테스트는 "평범한" 금액만 시험합니다.
      </p>
      <MutantFigure />
      <p>
        평범한 금액 세 개로는 버그 3, 4만 잡힙니다. 버그 1(<code>&gt;=</code> 대신 <code>&gt;</code>)과 버그 2(<code>&lt;</code> 대신 <code>&lt;=</code>)는 5만 원이나 3만 원 <strong>정확히 그 금액</strong>에서만 다르게 동작하기 때문입니다. <code>finalPrice(50000)</code>은 45000, <code>finalPrice(30000)</code>은 30000이어야 한다는 테스트를 넣으면 비로소 잡힙니다. 조건이 바뀌는 지점의 입력을 <T en="boundary value">경계값</T>이라고 합니다.
      </p>
      <Callout kind="key" label="테스트할 입력 목록">
        <ul style={{ margin: 0 }}>
          <li>
            <strong>대표값</strong>: 명세의 경우마다 하나씩 (할인, 배송비, 그 사이)
          </li>
          <li>
            <strong>경계값</strong>: 조건이 바뀌는 바로 그 값과 그 양옆 (29999, 30000, 50000)
          </li>
          <li>
            <strong>비어 있는 값</strong>: 0, 빈 문자열 <code>''</code>, 빈 배열 <code>[]</code>, 원소가 하나뿐인 배열
          </li>
          <li>
            <strong>이상한 값</strong>: 음수, 아주 큰 수, 숫자 대신 들어온 문자열
          </li>
        </ul>
      </Callout>
      <p>
        테스트 자체가 틀릴 수도 있습니다. 그림 1에서 기대값을 일부러 틀리게 적어 보세요. "명세" 칸이 ✗가 되어, 올바른 함수조차 실패시키는 테스트가 됩니다. 테스트가 실패하면 "코드가 틀렸나, 테스트가 틀렸나"를 먼저 물어야 합니다. 기대값은 코드를 보고 베끼지 말고 명세에서 손으로 계산해야 하는 이유입니다. 코드에서 베끼면 코드의 버그까지 함께 베낍니다.
      </p>

      <h2>흔한 실수들</h2>
      <p>이 과목에서 만난 버그들을 모아 보면 대부분 몇 가지 유형에 속합니다. 테스트를 짤 때 이 목록이 어디를 찔러 봐야 할지 알려 줍니다.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>실수</th>
              <th>예</th>
              <th>잡는 테스트</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>하나 차이 (off-by-one)</td>
              <td>
                <code>i = 1</code>부터 시작, <code>i &lt;= length</code>
              </td>
              <td>원소 하나, 첫 원소·마지막 원소가 특별한 배열</td>
            </tr>
            <tr>
              <td>경계 조건</td>
              <td>
                <code>&gt;=</code>와 <code>&gt;</code>를 혼동
              </td>
              <td>경계값 바로 그 값</td>
            </tr>
            <tr>
              <td>자료형 섞임</td>
              <td>
                <code>'2' + 2 === '22'</code>
              </td>
              <td>문자열로 들어온 숫자</td>
            </tr>
            <tr>
              <td>빈 입력</td>
              <td>빈 배열의 평균 → 0으로 나눔 → NaN</td>
              <td>
                <code>[]</code>, <code>''</code>, 0
              </td>
            </tr>
            <tr>
              <td>참조 공유</td>
              <td>함수가 받은 배열을 몰래 수정</td>
              <td>호출 뒤 원본이 그대로인지 확인</td>
            </tr>
            <tr>
              <td>return 누락</td>
              <td>console.log만 하고 undefined를 돌려줌</td>
              <td>반환값을 직접 비교</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>디버깅: 가설을 세우고 좁히기</h2>
      <p>
        테스트가 실패했다면 이제 원인을 찾아야 합니다. 이것을 <T en="debugging">디버깅</T>이라고 합니다. 코드를 이리저리 바꿔 보며 운에 맡기는 대신, 탐정처럼 순서대로 합니다.
      </p>
      <ol>
        <li>
          <strong>재현하기</strong>: 버그가 매번 나타나는 가장 작은 입력을 찾습니다. <code>average([80, 90, 70])</code>처럼 손으로 답을 계산할 수 있을 만큼 작게.
        </li>
        <li>
          <strong>기대값 세우기</strong>: 각 단계에서 변수가 어떤 값이어야 하는지 미리 생각합니다. sum은 80, 170, 240이 되어야 합니다.
        </li>
        <li>
          <strong>관찰하기</strong>: 실제 값을 들여다봅니다. 디버거로 한 줄씩 넘기거나, <code>console.log</code>로 값을 찍습니다.
        </li>
        <li>
          <strong>좁히기</strong>: 기대와 실제가 처음 어긋나는 지점을 찾습니다. 그 직전에 실행된 줄이 범인 후보입니다.
        </li>
        <li>
          <strong>고치고 다시 테스트</strong>: 고친 뒤 모든 테스트를 다시 돌려, 다른 곳을 망가뜨리지 않았는지 확인합니다.
        </li>
      </ol>
      <p>그림 2에서 이 과정을 해 보세요. 이 장에서 줄곧 써 온 코드 추적기가 바로 디버거가 하는 일입니다.</p>
      <DebugFigure />
      <p>
        한 단계씩 넘기다 보면 첫 반복에서 i가 1이라는 것, 그래서 sum이 80이 아니라 90부터 시작한다는 것이 보입니다. 기대(80)와 실제(90)가 처음 어긋난 순간입니다. 범인은 반복의 시작값을 정하는 3번 줄입니다. 실제 브라우저에도 같은 도구가 있습니다. 개발자 도구(F12)의 Sources 탭에서 줄 번호를 눌러 <T en="breakpoint">중단점</T>을 걸면, 실행이 그 줄에서 멈추고 그림 2처럼 변수를 들여다볼 수 있습니다.
      </p>
      <Code label="console.log로 값 찍어 보기">{`
for (let i = 1; i < scores.length; i++) {
  console.log('i =', i, 'scores[i] =', scores[i], 'sum =', sum);
  sum = sum + scores[i];
}
// i = 1 scores[i] = 90 sum = 0     ← 첫 줄부터 80이 없다!
// i = 2 scores[i] = 70 sum = 90`}</Code>
      <Callout kind="intuition">
        디버깅이 막히면 코드를 소리 내어 설명해 보세요. "여기서 i는 0부터 시작하고…"라고 말하다 보면 "어, 1부터네?" 하는 순간이 옵니다. 책상 위 고무 오리에게 설명하다 버그를 찾는다고 해서 <T en="rubber duck debugging">고무 오리 디버깅</T>이라는 이름까지 있습니다.
      </Callout>

      <h2>직접 고쳐 보기</h2>
      <Figure no={3} title="직접 실행: 버그 고치기" hint="테스트를 실행하고, 실패를 보고, 고치세요" caption={<>세 과제 모두 처음 코드는 일부 테스트를 통과합니다. "대부분 맞는" 코드가 가장 위험합니다. 실패한 줄의 입력이 무엇인지 보면 어디를 고쳐야 할지가 보입니다. 주석(//)을 지워 console.log를 켜면 출력 칸에 값이 찍힙니다.</>}>
        <RunBox tasks={TASKS} id="ts-run-status" />
      </Figure>
      <p>
        "평균 고치기"에서 시작값만 고치면 테스트 셋은 통과하지만 빈 배열에서 여전히 실패합니다. <code>0 / 0</code>은 <code>NaN</code>이기 때문입니다. 하나를 고쳤다고 끝이 아니라, 모든 테스트를 다시 돌려 봐야 하는 이유입니다. 고친 버그마다 그 버그를 잡는 테스트를 하나씩 남겨 두면, 나중에 누군가 같은 실수를 다시 해도 바로 알 수 있습니다. 이런 테스트를 <T en="regression test">회귀 테스트</T>라고 합니다.
      </p>

      <h2>다음 단계</h2>
      <p>
        이것으로 프로그래밍의 기본기를 모두 다뤘습니다. 값과 변수, 조건과 반복, 함수와 호출 스택, 배열과 객체, 재귀, 그리고 코드가 맞는지 확인하는 법까지. 이제 "맞는 코드"를 넘어 "빠른 코드"를 생각할 차례입니다. 같은 문제를 푸는 두 함수가 모두 테스트를 통과해도, 데이터가 백만 개일 때 하나는 1초, 다른 하나는 하루가 걸릴 수 있습니다. 그 차이를 재는 법은 <a href={lessonHref('cs-algorithms', 'complexity')}>기초 알고리즘의 첫 장, 복잡도</a>에서 시작합니다. 코드 아래에서 컴퓨터가 실제로 무엇을 하는지 궁금하다면 <a href={lessonHref('cs-architecture', 'binary')}>컴퓨터 구조</a>로 가도 좋습니다.
      </p>

      <Callout kind="key">
        테스트는 입력과 기대값의 쌍을 적어 두고 자동으로 확인하는 것입니다. 대표값만이 아니라 경계값, 빈 입력, 이상한 입력을 골라야 버그가 잡힙니다. 테스트가 실패하면 재현하고, 기대값을 세우고, 관찰해서, 처음 어긋나는 지점까지 좁혀 갑니다.
      </Callout>
      <Quiz
        q={
          <>
            "나이가 19세 이상이면 성인"을 구현한 <code>isAdult(age)</code>를 테스트하려고 합니다. 버그를 잡을 가능성이 가장 높은 입력 묶음은?
          </>
        }
        options={['5, 30, 60', '18, 19, 20', '100, 200, 300', '19, 19, 19']}
        answer={1}
        explain={
          <>
            조건이 바뀌는 경계 19와 그 양옆을 시험해야 <code>&gt;=</code>를 <code>&gt;</code>로 잘못 쓴 버그나 18을 성인으로 보는 버그를 잡을 수 있습니다. 5, 30, 60은 경계에서 멀어서 그런 버그가 있어도 모두 통과합니다. 같은 입력을 여러 번 시험하는 것은 새 정보를 주지 않습니다.
          </>
        }
      />
    </>
  );
}
