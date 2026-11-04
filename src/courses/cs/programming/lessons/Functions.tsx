import { Fragment, useMemo, useState, type ReactElement } from 'react';
import { Callout, Check, Code, Figure, Legend, Quiz, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { RunBox, type Task } from './RunBox';
import { fnv, trace, type Program } from './trace';
import { TraceBlock } from './TraceView';
import './programming.css';

/* ─────────────── Figure 1: the call stack ─────────────── */

const CART_SRC = `
function discount(price, rate) { @@d0
  const off = price * rate; @@d1
  return price - off; @@d2
}
function total(price, qty) { @@t0
  const sum = price * qty; @@t1
  return discount(sum, 0.1); @@t2
}
const pay = total(1200, 3); @@call
console.log(pay); @@log
`;

const SCOPE_SRC = `
let count = 10; @@g
function f() { @@f0
  let count = 1; @@f1
  count = count + 1; @@f2
  return count; @@f3
}
function g(count) { @@g0
  return count * 2; @@g1
}
const a = f(); @@ca
const b = g(count); @@cb
console.log(a, b, count); @@log
`;

const NORET_SRC = `
function withTax(price) { @@w0
  console.log(price * 1.1); @@w1
}
const p = withTax(1000); @@call
console.log(p + 500); @@log
`;

type StackPreset = 'cart' | 'scope' | 'noret';

function stackProgram(k: StackPreset): Program {
  if (k === 'cart')
    return trace(CART_SRC, (t) => {
      t.def('discount', fnv('discount'));
      t.step('d0', 'discount라는 함수를 정의합니다. 이름과 할 일만 기억해 둘 뿐, 몸통은 아직 실행하지 않습니다.');
      t.def('total', fnv('total'));
      t.step('t0', 'total 함수도 정의합니다. 이제 전역에 함수 두 개가 이름으로 등록되어 있습니다.');
      t.step('call', 'total(1200, 3)을 부릅니다(호출). 이 줄은 total이 값을 돌려줄 때까지 잠시 멈춥니다.', '호출 →');
      t.enter('total(price, qty)', { price: 1200, qty: 3 });
      t.step('t0', 'total을 위한 새 프레임이 스택 위에 쌓입니다. 인자 1200과 3이 매개변수 price와 qty에 담깁니다.');
      const sum = t.def('sum', 1200 * 3) as number;
      t.step('t1', `sum = ${sum}. sum은 total 프레임 안에만 있는 지역 변수입니다.`);
      t.step('t2', 'discount(sum, 0.1)을 부릅니다. total은 이 줄에서 멈춘 채로 기다립니다.', '호출 →');
      t.enter('discount(price, rate)', { price: sum, rate: 0.1 });
      t.step('d0', 'discount 프레임이 total 위에 쌓입니다. 여기의 price는 3600입니다. total 프레임의 price(1200)와 이름만 같은 다른 변수입니다.');
      const off = t.def('off', sum * 0.1) as number;
      t.step('d1', `off = 3600 × 0.1 = ${off}.`);
      const r = t.ret(sum - off);
      t.step('d2', `return으로 ${r}을 돌려줍니다. 이 값을 들고 discount 프레임은 사라집니다.`, `↩ ${r}`);
      t.leave();
      t.ret(r);
      t.step('t2', `멈춰 있던 total로 돌아왔습니다. discount가 돌려준 ${r}을 그대로 return합니다.`, `↩ ${r}`);
      t.leave();
      t.def('pay', r);
      t.step('call', `total 프레임도 사라지고 맨 처음 호출한 줄로 돌아왔습니다. pay에 ${r}이 담깁니다.`);
      t.log(r);
      t.step('log', '스택에는 다시 전역 프레임만 남았습니다.');
    });
  if (k === 'scope')
    return trace(SCOPE_SRC, (t) => {
      t.def('count', 10);
      t.step('g', '전역 변수 count에 10을 담았습니다.');
      t.def('f', fnv('f'));
      t.step('f0', '함수 f를 정의합니다.');
      t.def('g', fnv('g'));
      t.step('g0', '함수 g를 정의합니다. 매개변수 이름이 count입니다.');
      t.step('ca', 'f()를 호출합니다.', '호출 →');
      t.enter('f()');
      t.step('f0', 'f의 프레임이 생겼습니다. 아직 변수가 없습니다.');
      t.def('count', 1);
      t.step('f1', 'f 안에서 let count를 새로 만들었습니다. 전역 count(10)와는 별개의 변수입니다.');
      t.set('count', 2);
      t.step('f2', 'count = count + 1은 가장 가까운 count, 즉 f의 count를 2로 바꿉니다. 전역 count는 여전히 10.');
      t.ret(2);
      t.step('f3', 'f의 count(2)를 돌려줍니다.', '↩ 2');
      t.leave();
      t.def('a', 2);
      t.step('ca', 'f의 프레임과 함께 f의 count도 사라졌습니다. a = 2.');
      t.step('cb', 'g(count)를 호출합니다. 여기서 count는 전역 count이므로 인자는 10입니다.', '호출 →');
      t.enter('g(count)', { count: 10 });
      t.step('g0', 'g의 매개변수 count에 10이 복사되어 들어옵니다. 매개변수도 지역 변수입니다.');
      t.ret(20);
      t.step('g1', '10 × 2 = 20을 돌려줍니다.', '↩ 20');
      t.leave();
      t.def('b', 20);
      t.step('cb', 'b = 20.');
      t.log(2, 20, 10);
      t.step('log', '전역 count는 처음부터 끝까지 10입니다. 함수 안의 같은 이름은 함수 밖에 영향을 주지 않았습니다.');
    });
  return trace(NORET_SRC, (t) => {
    t.def('withTax', fnv('withTax'));
    t.step('w0', 'withTax 함수를 정의합니다. 부가세 10%를 붙인 값을 계산하려는 함수입니다.');
    t.step('call', 'withTax(1000)을 호출합니다.', '호출 →');
    t.enter('withTax(price)', { price: 1000 });
    t.step('w0', 'price = 1000.');
    t.log(1000 * 1.1);
    t.step('w1', '1100을 콘솔에 출력합니다. 출력은 사람 눈에 보여 줄 뿐, 값을 돌려주는 것이 아닙니다.');
    t.ret(undefined);
    t.step('w1', 'return 없이 함수 끝(})에 닿았습니다. 이때 함수는 undefined를 돌려줍니다.', '↩ undefined');
    t.leave();
    t.def('p', undefined);
    t.step('call', 'p에는 1100이 아니라 undefined가 담겼습니다.');
    t.log(NaN);
    t.step('log', 'undefined + 500은 NaN입니다. 계산에 쓸 값은 console.log가 아니라 return으로 돌려줘야 합니다.', '✗ NaN');
  });
}

function StackFigure() {
  const [k, setK] = useState<StackPreset>('cart');
  const program = useMemo(() => stackProgram(k), [k]);
  return (
    <Figure
      no={1}
      title="함수를 부르면 스택에 프레임이 쌓인다"
      hint="한 단계씩 넘기며 오른쪽 스택을 보세요"
      caption={<>오른쪽 칸의 상자 하나하나가 함수 호출 하나의 프레임입니다. 맨 아래가 전역, 맨 위(굵은 테두리)가 지금 실행 중인 함수입니다. 함수를 부르면 위에 새 프레임이 쌓이고, return하면 맨 위 프레임이 돌려줄 값을 들고 사라집니다. ƒ는 변수에 함수가 담겨 있다는 표시입니다.</>}
    >
      <Seg
        label="프로그램"
        value={k}
        onChange={setK}
        options={[
          { value: 'cart', label: '할인 계산 (중첩 호출)' },
          { value: 'scope', label: '같은 이름, 다른 변수' },
          { value: 'noret', label: 'return을 잊으면' },
        ]}
      />
      <TraceBlock program={program} id="fn-stack-speed" />
    </Figure>
  );
}

/* ─────────────── Figure 2: which declaration does a name refer to? ─────────────── */

type Tok = string | { id: string; decl?: boolean };
interface Scope {
  id: string;
  label: string;
  parent: string | null;
  color: string;
  from: number;
  to: number;
}

function scopeSnippet(shadow: boolean) {
  const L: { toks: Tok[]; declIn?: Record<string, string> }[] = [
    { toks: ['const ', { id: 'rate', decl: true }, ' = 0.1;          // 적립률'] },
    { toks: ['let ', { id: 'count', decl: true }, ' = 0;             // 적립한 횟수'] },
    { toks: ['function ', { id: 'addPoint', decl: true }, '(', { id: 'price', decl: true }, ') {'], declIn: { addPoint: 'global' } },
  ];
  if (shadow) L.push({ toks: ['  let ', { id: 'count', decl: true }, ' = 100;'] });
  L.push(
    { toks: ['  const ', { id: 'point', decl: true }, ' = ', { id: 'price' }, ' * ', { id: 'rate' }, ';'] },
    { toks: ['  ', { id: 'count' }, ' = ', { id: 'count' }, ' + 1;'] },
    { toks: ['  if (', { id: 'point' }, ' > 100) {'] },
    { toks: ['    const ', { id: 'bonus', decl: true }, ' = 50;'] },
    { toks: ['    return ', { id: 'point' }, ' + ', { id: 'bonus' }, ';'] },
    { toks: ['  }'] },
    { toks: ['  return ', { id: 'point' }, ' + ', { id: 'bonus' }, ';'] },
    { toks: ['}'] },
    { toks: ['console.log(', { id: 'addPoint' }, '(5000), ', { id: 'count' }, ');'] },
  );
  const s = shadow ? 1 : 0;
  const scopes: Scope[] = [
    { id: 'global', label: '전역 범위', parent: null, color: 'var(--ink-3)', from: 0, to: L.length - 1 },
    { id: 'fn', label: '함수 addPoint의 범위', parent: 'global', color: 'var(--c-cs-2)', from: 2, to: 10 + s },
    { id: 'blk', label: 'if 블록의 범위', parent: 'fn', color: 'var(--pos)', from: 5 + s, to: 8 + s },
  ];
  return { lines: L, scopes };
}

const innermost = (scopes: Scope[], line: number) => scopes.filter((s) => line >= s.from && line <= s.to).sort((a, b) => b.from - a.from || a.to - b.to)[0];

function ScopeFigure() {
  const [shadow, setShadow] = useState(false);
  const { lines, scopes } = useMemo(() => scopeSnippet(shadow), [shadow]);
  const [sel, setSel] = useState<{ line: number; k: number } | null>({ line: 4, k: 3 });
  const byId = new Map(scopes.map((s) => [s.id, s]));

  // where each declaration lives
  const decls = new Map<string, { line: number; k: number }>(); // `${scope}:${name}` → position
  lines.forEach((l, i) =>
    l.toks.forEach((tk, k) => {
      if (typeof tk === 'string' || !tk.decl) return;
      const sc = l.declIn?.[tk.id] ?? innermost(scopes, i).id;
      decls.set(`${sc}:${tk.id}`, { line: i, k });
    }),
  );

  let chain: { scope: Scope; hit: boolean }[] = [];
  let target: { line: number; k: number } | null = null;
  let name = '';
  if (sel) {
    const tk = lines[sel.line]?.toks[sel.k];
    if (tk && typeof tk !== 'string') {
      name = tk.id;
      let sc: Scope | undefined = tk.decl ? byId.get(lines[sel.line].declIn?.[tk.id] ?? innermost(scopes, sel.line).id) : innermost(scopes, sel.line);
      while (sc) {
        const d = decls.get(`${sc.id}:${name}`);
        chain.push({ scope: sc, hit: !!d });
        if (d) {
          target = d;
          break;
        }
        sc = sc.parent ? byId.get(sc.parent) : undefined;
      }
    } else chain = [];
  }
  const found = !!target;

  const renderLines = (scope: Scope): ReactElement[] => {
    const out: ReactElement[] = [];
    for (let i = scope.from; i <= scope.to; i++) {
      const child = scopes.find((c) => c.parent === scope.id && c.from === i);
      if (child) {
        out.push(
          <div key={`s${child.id}`} className="scope-box" style={{ ['--sc' as string]: child.color }} data-on={chain.some((c) => c.scope.id === child.id) || undefined}>
            <div className="scope-tag">{child.label}</div>
            {renderLines(child)}
          </div>,
        );
        i = child.to;
        continue;
      }
      out.push(
        <div key={i} className="scope-line">
          {lines[i].toks.map((tk, k) =>
            typeof tk === 'string' ? (
              <Fragment key={k}>{tk}</Fragment>
            ) : (
              <button
                key={k}
                type="button"
                className="scope-id"
                data-decl={tk.decl || undefined}
                data-sel={(sel?.line === i && sel.k === k) || undefined}
                data-target={(target?.line === i && target.k === k && !(sel?.line === i && sel.k === k)) || undefined}
                data-err={(sel?.line === i && sel.k === k && !found) || undefined}
                aria-label={`${i + 1}번 줄의 ${tk.id}${tk.decl ? ' (선언)' : ''}`}
                onClick={() => setSel({ line: i, k })}
              >
                {tk.id}
              </button>
            ),
          )}
        </div>,
      );
    }
    return out;
  };

  const g = scopes[0];
  return (
    <Figure
      no={2}
      title="이 이름은 어느 변수를 가리킬까"
      hint="점선 밑줄이 있는 이름을 눌러 보세요"
      caption={<>상자는 범위(스코프)입니다. 이름을 누르면 그 이름이 있는 가장 안쪽 범위에서 시작해 바깥쪽으로 한 겹씩 선언을 찾아 나갑니다. 노란색이 누른 이름, 초록색이 찾아낸 선언입니다. 어디에서도 찾지 못하면 빨간색이 되고 ReferenceError가 납니다.</>}
    >
      <div className="fig-split">
        <div className="scope-code" role="group" aria-label="범위가 표시된 코드">
          <div className="scope-box" style={{ ['--sc' as string]: g.color }} data-on={chain.some((c) => c.scope.id === 'global') || undefined}>
            <div className="scope-tag">{g.label}</div>
            {renderLines(g)}
          </div>
        </div>
        <div className="controls">
          <Check
            label="함수 안에서 count를 새로 선언하기"
            checked={shadow}
            onChange={(v) => {
              setShadow(v);
              setSel({ line: 4 + (v ? 1 : 0), k: 3 });
            }}
          />
          {sel && name && (
            <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="scope-path">
                <span className="mono">{name}</span> 찾기:
                {chain.map((c, i) => (
                  <Fragment key={c.scope.id}>
                    {i > 0 && <span aria-hidden="true">→</span>}
                    <span className="step" style={{ ['--sc' as string]: c.scope.color }} data-hit={c.hit || undefined}>
                      {c.scope.label.replace(' 범위', '').replace('의', '')}
                      {c.hit ? ' ✓' : ''}
                    </span>
                  </Fragment>
                ))}
              </div>
              <div className="note-line">
                {found ? (
                  <>
                    {target!.line + 1}번 줄에서 선언한 <code>{name}</code>를 가리킵니다.
                    {chain.length > 1 && ` 안쪽 ${chain.length - 1}겹에서는 찾지 못해 바깥으로 나갔습니다.`}
                  </>
                ) : (
                  <>
                    <strong style={{ color: 'var(--bad)' }}>ReferenceError: {name} is not defined.</strong> {name}는 안쪽 범위에서 선언되어, 이 위치에서 바깥쪽으로만 찾아서는 보이지 않습니다.
                  </>
                )}
              </div>
            </div>
          )}
          <Legend
            items={[
              { color: 'var(--ink-3)', label: '전역', shape: 'sq' },
              { color: 'var(--c-cs-2)', label: '함수', shape: 'sq' },
              { color: 'var(--pos)', label: 'if 블록', shape: 'sq' },
            ]}
          />
          <div className="note-line" style={{ color: 'var(--ink-3)', fontSize: 'var(--fs-xs)' }}>
            해 볼 것: if 블록 밖 <code>return</code> 줄의 <code>bonus</code>, 맨 아래 줄의 <code>count</code>를 눌러 보고, 체크 상자를 켠 뒤 함수 안의 <code>count</code>를 다시 눌러 보세요.
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: write a function ─────────────── */

const TASKS: Task[] = [
  {
    id: 'ship',
    label: '배송비',
    prompt: (
      <p>
        주문 금액 <code>total</code>을 받아 배송비를 돌려주는 함수를 완성하세요. 3만 원 이상이면 무료(0), 그보다 적으면 3000원입니다. <code>console.log</code>가 아니라 <code>return</code>으로 돌려줘야 테스트가 값을 받을 수 있습니다.
      </p>
    ),
    starter: `
function shipping(total) {
  // 여기를 채우세요

}
`,
    fnName: 'shipping',
    tests: [
      { args: [12000], expect: 3000 },
      { args: [29990], expect: 3000 },
      { args: [30000], expect: 0, note: '경계값' },
      { args: [85000], expect: 0 },
    ],
    solution: `
function shipping(total) {
  if (total >= 30000) {
    return 0;
  }
  return 3000;
}
`,
  },
  {
    id: 'max3',
    label: '세 수 중 최댓값',
    prompt: (
      <p>
        세 수 중 가장 큰 값을 돌려주는 함수입니다. 얼핏 맞아 보이지만 테스트 하나가 실패합니다. 실행해서 어떤 입력에서 틀리는지 찾고 고쳐 보세요. (힌트: 같은 값이 두 개 있으면?)
      </p>
    ),
    starter: `
function max3(a, b, c) {
  if (a > b && a > c) {
    return a;
  }
  if (b > a && b > c) {
    return b;
  }
  return c;
}
`,
    fnName: 'max3',
    tests: [
      { args: [1, 2, 3], expect: 3 },
      { args: [9, 4, 7], expect: 9 },
      { args: [2, 8, 5], expect: 8 },
      { args: [-5, -2, -9], expect: -2 },
      { args: [6, 6, 1], expect: 6, note: '같은 값' },
    ],
    solution: `
function max3(a, b, c) {
  let best = a;           // 일단 a가 가장 크다고 두고
  if (b > best) best = b; // 더 큰 것이 나오면 바꾼다
  if (c > best) best = c;
  return best;
}
`,
  },
  {
    id: 'grade',
    label: '학점 함수',
    prompt: (
      <p>
        지난 장의 학점 매기기를 함수로 만들어 보세요. 90점 이상 <code>'A'</code>, 80점 이상 <code>'B'</code>, 70점 이상 <code>'C'</code>, 그 밖은 <code>'F'</code>입니다. 함수 안에서 <code>return</code>을 만나면 그 자리에서 함수가 끝나므로 else 없이 써도 됩니다.
      </p>
    ),
    starter: `
function gradeOf(score) {
  if (score >= 90) return 'A';
  // 나머지를 채우세요

}
`,
    fnName: 'gradeOf',
    tests: [
      { args: [97], expect: 'A' },
      { args: [90], expect: 'A', note: '경계값' },
      { args: [89], expect: 'B', note: '경계값' },
      { args: [75], expect: 'C' },
      { args: [12], expect: 'F' },
    ],
    solution: `
function gradeOf(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  return 'F';
}
`,
  },
];

/* ─────────────── Lesson ─────────────── */

export default function Functions() {
  return (
    <>
      <h2>일에 이름 붙이기</h2>
      <p>
        쇼핑몰 코드에서 배송비를 계산하는 부분이 장바구니 화면, 주문서, 영수증 세 군데에 똑같이 들어 있다고 해 봅시다. 배송비 정책이 바뀌면 세 군데를 모두 고쳐야 하고, 하나라도 빠뜨리면 화면마다 다른 금액이 나옵니다. <T en="function">함수</T>는 이런 코드 덩어리에 이름을 붙여 한 곳에 두고, 필요한 곳에서 이름으로 불러 쓰게 해 줍니다.
      </p>
      <Code label="함수 정의와 호출">{`
// 정의: 이름(shipping), 받을 값(total), 할 일(몸통)
function shipping(total) {
  if (total >= 30000) {
    return 0;           // return: 값을 돌려주고 함수를 끝낸다
  }
  return 3000;
}

// 호출: 이름 뒤에 괄호, 괄호 안에 넘길 값
const fee = shipping(27000);       // fee = 3000
console.log(shipping(45000));      // 0`}</Code>
      <p>
        괄호 안에서 값을 받는 이름(<code>total</code>)을 <T en="parameter">매개변수</T>, 호출할 때 실제로 넘기는 값(<code>27000</code>)을 <T en="argument">인자</T>라고 합니다. 함수가 <code>return</code>으로 돌려준 값을 <T en="return value">반환값</T>이라고 하며, 호출한 자리가 그 값으로 바뀝니다. <code>shipping(27000)</code>이라는 식 전체가 3000이 되는 셈입니다. 그래서 함수 호출은 다른 식 안에 넣거나 다른 함수의 인자로 넘길 수 있습니다.
      </p>
      <Callout kind="intuition">
        함수는 자판기와 비슷합니다. 넣는 것(인자)과 나오는 것(반환값)만 알면 안에서 무슨 일이 일어나는지 몰라도 쓸 수 있습니다. 좋은 함수 이름은 안을 들여다보지 않아도 무엇이 나올지 알려 줍니다. <code>shipping</code>, <code>gradeOf</code>, <code>average</code>처럼요.
      </Callout>

      <h2>호출 스택: 어디까지 했는지 기억하기</h2>
      <p>
        함수가 다른 함수를 부를 수도 있습니다. 그러면 컴퓨터는 "total을 하다가 discount를 부르러 갔다"는 사실을 기억해야, discount가 끝난 뒤 total의 그 줄로 돌아올 수 있습니다. 이 기억을 담는 곳이 <T en="call stack">호출 스택</T>입니다. 함수를 부를 때마다 그 호출만의 공간인 <T en="stack frame">프레임</T>이 스택 맨 위에 쌓이고, 함수가 끝나면 맨 위 프레임이 치워집니다. 그림 1에서 직접 따라가 보세요.
      </p>
      <StackFigure />
      <p>
        "할인 계산"을 끝까지 넘겨 보면 스택이 전역 → total → discount로 세 층까지 쌓였다가, discount가 3240을 돌려주며 사라지고, total이 그 값을 받아 다시 돌려주며 사라지는 것을 볼 수 있습니다. 나중에 쌓인 것이 먼저 치워지는 이 순서를 <T en="LIFO">후입선출</T>이라고 하고, 이런 자료구조를 스택이라고 부릅니다. 스택 자체는 <a href={lessonHref('cs-algorithms', 'stack-queue-heap')}>기초 알고리즘의 스택·큐·힙 장</a>에서 자세히 다룹니다.
      </p>
      <p>
        두 프레임에 모두 <code>price</code>가 있다는 점도 눈여겨보세요. total의 price는 1200이고 discount의 price는 3600입니다. 이름이 같아도 프레임마다 따로 있는 다른 변수입니다. 그래서 함수를 쓰는 사람은 함수 안의 변수 이름을 신경 쓸 필요가 없습니다.
      </p>
      <Callout kind="warn" label="출력과 반환은 다릅니다">
        "return을 잊으면" 프리셋을 보세요. <code>console.log</code>는 사람에게 값을 보여 줄 뿐이고, 프로그램의 다른 부분은 그 값을 받을 수 없습니다. return 없이 끝난 함수는 <code>undefined</code>를 돌려주고, 그 값으로 계산하면 <code>NaN</code> 같은 엉뚱한 결과가 나옵니다. 계산 결과를 쓰려면 반드시 <code>return</code>하세요.
      </Callout>

      <h2>지역 변수와 범위</h2>
      <p>
        함수 안에서 <code>let</code>이나 <code>const</code>로 만든 변수, 그리고 매개변수는 그 함수 안에서만 보입니다. 이런 변수를 <T en="local variable">지역 변수</T>라고 하고, 이름이 보이는 영역을 <T en="scope">범위</T>(스코프)라고 합니다. 범위는 중괄호 <code>{'{ }'}</code>를 따라 겹겹이 생깁니다. 함수 몸통도, if 블록도, for 블록도 각각 범위입니다.
      </p>
      <p>
        이름을 쓰면 JavaScript는 그 위치에서 가장 안쪽 범위부터 선언을 찾고, 없으면 한 겹씩 바깥으로 나갑니다. 안에서는 바깥이 보이지만, 바깥에서는 안이 보이지 않습니다. 그림 2에서 이름을 하나씩 눌러 보세요.
      </p>
      <ScopeFigure />
      <p>
        <code>rate</code>는 함수 안에서 썼지만 함수 안에는 선언이 없어서 바깥 전역 범위까지 나가 찾습니다. 반대로 if 블록 밖 <code>return</code> 줄의 <code>bonus</code>는 찾을 수 없습니다. bonus는 if 블록 안에서 선언되었으므로 블록 밖에서는 보이지 않고, 이 줄이 실행되는 순간 오류가 납니다. 체크 상자를 켜서 함수 안에 <code>let count = 100;</code>을 넣으면, 함수 안의 <code>count</code>는 이제 바깥 전역 변수가 아니라 새로 만든 지역 변수를 가리킵니다. 안쪽 이름이 바깥 이름을 가리는 이 현상을 <T en="shadowing">가림</T>(섀도잉)이라고 합니다. 그림 1의 "같은 이름, 다른 변수"가 실행 중에 이것을 보여 줍니다.
      </p>
      <Callout kind="key">
        변수는 쓰는 곳에서 가장 가까운 범위에 두세요. 전역 변수는 어느 함수에서나 바꿀 수 있어서, 값이 이상해졌을 때 누가 바꿨는지 찾기 어렵습니다. 함수가 필요한 값은 매개변수로 받고 결과는 return으로 돌려주면, 함수 하나만 보고도 무슨 일을 하는지 알 수 있습니다.
      </Callout>

      <h2>직접 함수 만들기</h2>
      <p>
        그림 3의 상자에서 함수를 완성하고 실행하면 미리 준비한 입력으로 함수를 불러 반환값을 확인합니다. 이렇게 "이 입력이면 이 값이 나와야 한다"를 적어 둔 것을 <T en="test case">테스트 케이스</T>라고 합니다. 테스트는 이 과목의 마지막 장에서 직접 만들어 봅니다.
      </p>
      <Figure no={3} title="직접 실행: 함수 완성하기" hint="코드를 고치고 ▶ 실행을 누르세요" caption={<>표의 각 줄이 함수를 한 번 호출한 결과입니다. "경계값"이라고 적힌 입력은 조건이 바뀌는 바로 그 지점이라 버그가 잘 숨는 곳입니다. "세 수 중 최댓값"은 처음 코드에 일부러 버그를 넣었습니다.</>}>
        <RunBox tasks={TASKS} id="fn-run-status" />
      </Figure>
      <Code label="함수를 쓰는 다른 문법">{`
// 화살표 함수: 짧은 함수를 쓸 때 많이 쓴다
const double = (x) => x * 2;      // return이 저절로 붙는다
const shipping2 = (total) => (total >= 30000 ? 0 : 3000);

double(21);    // 42`}</Code>
      <p>
        화살표 함수는 다음 장에서 배열의 <code>map</code>, <code>filter</code>와 함께 자주 보게 됩니다. 문법은 달라도 하는 일은 같습니다. 값을 받아 일하고 값을 돌려줍니다.
      </p>

      <Callout kind="key">
        함수는 코드에 이름을 붙여 다시 쓰게 합니다. 매개변수로 값을 받고 return으로 돌려주며, 함수 안의 변수는 그 호출의 프레임에만 삽니다. 함수가 함수를 부르면 프레임이 호출 스택에 쌓이고, 끝나는 순서는 쌓인 순서의 반대입니다.
      </Callout>
      <Quiz
        q={
          <>
            <code>a()</code>가 <code>b()</code>를 부르고, <code>b()</code>가 <code>c()</code>를 부르는 중입니다. 지금 <code>c</code>가 실행 중일 때 호출 스택의 모습(아래→위)은?
          </>
        }
        options={['전역 → c', '전역 → a → b → c', '전역 → c → b → a', 'c 하나만 남아 있다']}
        answer={1}
        explain={
          <>
            함수를 부를 때마다 프레임이 위에 쌓이고, 부른 함수는 끝나지 않은 채 기다립니다. 그래서 a와 b의 프레임도 그대로 남아 있습니다. c가 return하면 c의 프레임이 치워지고 b가 멈췄던 줄부터 다시 실행됩니다.
          </>
        }
      />
    </>
  );
}
