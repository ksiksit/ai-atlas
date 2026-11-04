import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { RunBox, type Task } from './RunBox';
import { fnv, trace, type Program } from './trace';
import { TraceBlock } from './TraceView';
import './programming.css';

/* ─────────────── Figure 1: an array you can push, pop, map and filter ─────────────── */

const START = [1200, 3500, 800, 5000];

interface ArrOp {
  code: string;
  result?: string;
  hot: number[]; // indices that changed in cart
  gone?: number; // value removed by pop
  derived?: { name: string; arr: number[] }; // a new array from map / filter
  read?: number; // index read
}

function ArrayFigure() {
  const [cart, setCart] = useState<number[]>(START);
  const [op, setOp] = useState<ArrOp>({ code: 'const cart = [1200, 3500, 800, 5000];', hot: [] });
  const [idx, setIdx] = useState(1);
  const [val, setVal] = useState(2000);
  const maxIdx = Math.max(cart.length, 1);
  const i = Math.min(idx, maxIdx);

  const doPush = () => {
    if (cart.length >= 8) return;
    const next = [...cart, val];
    setCart(next);
    setOp({ code: `cart.push(${val});`, result: `길이 ${next.length}`, hot: [next.length - 1] });
  };
  const doPop = () => {
    if (!cart.length) {
      setOp({ code: 'cart.pop();', result: 'undefined (빈 배열)', hot: [] });
      return;
    }
    const last = cart[cart.length - 1];
    setCart(cart.slice(0, -1));
    setOp({ code: 'cart.pop();', result: String(last), hot: [], gone: last });
  };
  const doRead = () => setOp({ code: `cart[${i}];`, result: i < cart.length ? String(cart[i]) : 'undefined (그 칸은 없음)', hot: [], read: i });
  const doWrite = () => {
    if (i > cart.length) return;
    const next = cart.slice();
    next[i] = val;
    setCart(next);
    setOp({ code: `cart[${i}] = ${val};`, hot: [i], result: i === cart.length ? '끝에 새 칸이 생김' : undefined });
  };
  const doMap = () => setOp({ code: 'const sale = cart.map((p) => p * 0.9);', result: '새 배열', hot: [], derived: { name: 'sale', arr: cart.map((p) => Math.round(p * 0.9 * 100) / 100) } });
  const doFilter = () => setOp({ code: 'const big = cart.filter((p) => p >= 3000);', result: '새 배열', hot: [], derived: { name: 'big', arr: cart.filter((p) => p >= 3000) } });
  const reset = () => {
    setCart(START);
    setOp({ code: 'const cart = [1200, 3500, 800, 5000];', hot: [] });
  };
  const sum = cart.reduce((a, b) => a + b, 0);

  return (
    <Figure
      no={1}
      title="배열 다루기"
      hint="버튼을 눌러 배열을 바꿔 보세요"
      caption={<>상자 아래 작은 숫자가 인덱스(칸 번호)입니다. 0부터 셉니다. 노란 칸은 방금 바뀐 칸, 점선 칸은 pop으로 빠져나간 값이나 없는 칸입니다. push·pop·대입은 cart 자체를 바꾸고, map·filter는 cart를 그대로 두고 새 배열을 만듭니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div className="arr-op" aria-live="polite">
            {op.code}
            {op.result && <span className="cm">{`  // → ${op.result}`}</span>}
          </div>
          <div>
            <div className="arr-label">
              <span className="mono">cart</span> · 길이 <span className="mono">{cart.length}</span>
            </div>
            <div className="arr-row" role="img" aria-label={`cart 배열: ${cart.join(', ') || '비어 있음'}`}>
              {cart.map((v, k) => (
                <div key={k} className="arr-box" data-hot={op.hot.includes(k) || undefined} data-sel={op.read === k || undefined}>
                  <span className="v">{v}</span>
                  <span className="i">{k}</span>
                </div>
              ))}
              {op.gone !== undefined && (
                <div className="arr-box" data-gone>
                  <span className="v">{op.gone}</span>
                  <span className="i">pop</span>
                </div>
              )}
              {op.read !== undefined && op.read >= cart.length && (
                <div className="arr-box" data-ghost data-sel>
                  <span className="v">없음</span>
                  <span className="i">{op.read}</span>
                </div>
              )}
              {!cart.length && op.gone === undefined && <span className="tr-empty">빈 배열 []</span>}
            </div>
          </div>
          {op.derived && (
            <div>
              <div className="arr-label">
                <span className="mono">{op.derived.name}</span> · 새 배열, 길이 <span className="mono">{op.derived.arr.length}</span>
              </div>
              <div className="arr-row" role="img" aria-label={`${op.derived.name} 배열: ${op.derived.arr.join(', ') || '비어 있음'}`}>
                {op.derived.arr.map((v, k) => (
                  <div key={k} className="arr-box" data-hot>
                    <span className="v">{v}</span>
                    <span className="i">{k}</span>
                  </div>
                ))}
                {!op.derived.arr.length && <span className="tr-empty">빈 배열 []</span>}
              </div>
            </div>
          )}
          <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <Readout label="cart.length" value={cart.length} />
            <Readout label="마지막 칸 인덱스" value={cart.length ? cart.length - 1 : '없음'} />
            <Readout label="합계" value={sum.toLocaleString('ko-KR')} />
          </div>
        </div>
        <div className="controls">
          <Slider label="인덱스 i" value={i} min={0} max={maxIdx} step={1} onChange={setIdx} />
          <Slider label="넣을 값" value={val} min={500} max={9000} step={100} onChange={setVal} format={(v) => v.toLocaleString('ko-KR')} />
          <div className="btn-row">
            <Button small onClick={doPush} disabled={cart.length >= 8}>
              push(값)
            </Button>
            <Button small onClick={doPop}>
              pop()
            </Button>
            <Button small onClick={doRead}>
              cart[i] 읽기
            </Button>
            <Button small onClick={doWrite} disabled={i > cart.length}>
              cart[i] = 값
            </Button>
          </div>
          <div className="btn-row">
            <Button small onClick={doMap}>
              map: 10% 할인
            </Button>
            <Button small onClick={doFilter}>
              filter: 3000 이상
            </Button>
            <Button small onClick={reset}>
              처음으로
            </Button>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: walking through an array ─────────────── */

const AVG_SRC = `
const scores = [90, 75, 84, 62]; @@a
let sum = 0; @@s
for (let i = 0; i < scores.length; i++) { @@for
  sum = sum + scores[i]; @@body
}
const avg = sum / scores.length; @@avg
console.log(avg); @@log
`;

const CART_SRC = `
const cart = [
  { name: '우유', price: 2500, qty: 2 },
  { name: '빵', price: 3200, qty: 1 },
]; @@c
let total = 0; @@t
for (const item of cart) { @@for
  total = total + item.price * item.qty; @@body
}
console.log(total); @@log
`;

function walkProgram(k: 'avg' | 'cart'): Program {
  if (k === 'avg')
    return trace(AVG_SRC, (t) => {
      const scores = [90, 75, 84, 62];
      t.def('scores', scores);
      t.step('a', '네 사람의 점수를 배열 하나에 담았습니다. 변수 scores에는 배열 자체가 아니라 배열이 있는 곳을 가리키는 화살표가 담깁니다.');
      let sum = t.def('sum', 0) as number;
      t.step('s', 'sum = 0.');
      for (let i = 0; ; i++) {
        t.def('i', i);
        if (!(i < scores.length)) {
          t.step('for', `i가 ${i}가 되자 ${i} < ${scores.length}(scores.length)이 거짓입니다. 마지막 인덱스는 길이보다 1 작은 ${scores.length - 1}입니다.`, `${i} < ${scores.length} → false`);
          break;
        }
        t.step('for', `i = ${i}. ${i} < ${scores.length}이므로 몸통으로.`, `${i} < ${scores.length} → true`);
        sum = t.set('sum', sum + scores[i]) as number;
        t.step('body', `scores[${i}]은 ${scores[i]}. sum이 ${sum}이 되었습니다.`, `scores[${i}] = ${scores[i]}`);
      }
      t.drop('i');
      const avg = t.def('avg', sum / scores.length) as number;
      t.step('avg', `합 ${sum}을 개수 ${scores.length}로 나눠 평균 ${avg}.`);
      t.log(avg);
      t.step('log', '배열의 길이가 바뀌어도 이 코드는 고칠 필요가 없습니다. scores.length가 알아서 맞춰 줍니다.');
    });
  return trace(CART_SRC, (t) => {
    const cart = [
      { name: '우유', price: 2500, qty: 2 },
      { name: '빵', price: 3200, qty: 1 },
    ];
    t.def('cart', cart);
    t.step('c', '배열 안에 객체가 둘 들어 있습니다. 배열의 칸에도 객체 자체가 아니라 객체를 가리키는 화살표가 담깁니다.');
    let total = t.def('total', 0) as number;
    t.step('t', 'total = 0.');
    for (const item of cart) {
      t.def('item', item);
      t.step('for', `for...of는 배열의 원소를 차례로 item에 담습니다. 이번 item은 ${item.name} 객체입니다.`, `item = ${item.name}`);
      total = t.set('total', total + item.price * item.qty) as number;
      t.step('body', `item.price × item.qty = ${item.price} × ${item.qty} = ${item.price * item.qty}. total은 ${total}.`);
    }
    t.drop('item');
    t.step('for', '더 꺼낼 원소가 없어서 반복이 끝났습니다.', '끝');
    t.log(total);
    t.step('log', `장바구니 합계 ${total}원.`);
  });
}

function WalkFigure() {
  const [k, setK] = useState<'avg' | 'cart'>('avg');
  const program = useMemo(() => walkProgram(k), [k]);
  return (
    <Figure
      no={2}
      title="반복문으로 배열 훑기"
      hint="한 단계씩 넘기며 i와 칸을 보세요"
      caption={<>오른쪽 아래 "힙"은 배열과 객체가 실제로 놓이는 곳입니다. 변수에서 나가는 화살표가 그 변수가 가리키는 배열이나 객체입니다. 값이 바뀐 칸은 형광펜으로, 방금 새로 만들어진 객체는 진한 테두리로 표시했습니다.</>}
    >
      <Seg
        label="프로그램"
        value={k}
        onChange={setK}
        options={[
          { value: 'avg', label: '성적 평균 (인덱스로)' },
          { value: 'cart', label: '장바구니 (for...of)' },
        ]}
      />
      <TraceBlock program={program} id="ao-walk-speed" speed={2} />
    </Figure>
  );
}

/* ─────────────── Figure 3: two names, one object ─────────────── */

const COPY_SRC = `
let a = 5; @@a
let b = a;              // 값이 복사된다 @@b
b = 10; @@b2
const cart1 = ['우유']; @@c1
const cart2 = cart1;    // 같은 배열을 가리킨다 @@c2
cart2.push('빵'); @@p
const cart3 = [...cart1]; // 새 배열로 복사 @@c3
cart3.push('잼'); @@p3
console.log(cart1); @@log
`;

const SHALLOW_SRC = `
const order = { id: 1, items: ['우유'] }; @@o
const copy = { ...order };            // 얕은 복사 @@c
copy.id = 2; @@id
copy.items.push('빵'); @@p
const deep = structuredClone(order);  // 깊은 복사 @@d
deep.items.push('잼'); @@p2
console.log(order.items); @@log
`;

const FN_SRC = `
function addFee(list) { @@f0
  list.push(3000);       // 배송비 추가 @@f1
}
const prices = [1200, 800]; @@p
addFee(prices); @@call
console.log(prices); @@log
`;

type RefPreset = 'copy' | 'shallow' | 'fn';

function refProgram(k: RefPreset): Program {
  if (k === 'copy')
    return trace(COPY_SRC, (t) => {
      t.def('a', 5);
      t.step('a', 'a = 5.');
      t.def('b', 5);
      t.step('b', 'b = a는 a에 든 값 5를 b에 복사합니다. 숫자·문자열 같은 기본 값은 이렇게 통째로 복사됩니다.');
      t.set('b', 10);
      t.step('b2', 'b를 10으로 바꿔도 a는 그대로 5입니다. 두 상자는 서로 관계가 없습니다.');
      const cart1 = ['우유'];
      t.def('cart1', cart1);
      t.step('c1', '배열을 만들면 배열은 힙에 놓이고, cart1에는 그 배열을 가리키는 화살표가 담깁니다.');
      t.def('cart2', cart1);
      t.step('c2', 'cart2 = cart1은 배열을 복사하지 않습니다. 화살표만 복사되어, 두 이름이 같은 배열 하나를 가리킵니다.');
      cart1.push('빵');
      t.step('p', "cart2로 '빵'을 넣었는데 cart1이 가리키는 배열도 바뀌었습니다. 애초에 배열이 하나뿐이기 때문입니다.");
      const cart3 = [...cart1];
      t.def('cart3', cart3);
      t.step('c3', '[...cart1]은 원소를 하나씩 꺼내 새 배열을 만듭니다(전개 문법). 이제 배열이 둘입니다.');
      cart3.push('잼');
      t.step('p3', 'cart3에 넣은 잼은 cart1에 영향을 주지 않습니다.');
      t.log(cart1);
      t.step('log', "cart1은 ['우유', '빵']. cart2를 통해 넣은 빵은 들어 있고, cart3의 잼은 없습니다.");
    });
  if (k === 'shallow')
    return trace(SHALLOW_SRC, (t) => {
      const order = { id: 1, items: ['우유'] };
      t.def('order', order);
      t.step('o', '객체 안에 배열이 들어 있습니다. order의 items 속성도 배열을 가리키는 화살표입니다.');
      const copy = { ...order };
      t.def('copy', copy);
      t.step('c', '{ ...order }는 새 객체를 만들고 속성을 하나씩 복사합니다. 그런데 items에 든 것은 화살표라서, 화살표만 복사됩니다. 두 객체가 같은 items 배열을 가리킵니다.');
      copy.id = 2;
      t.step('id', 'copy.id를 바꿔도 order.id는 1 그대로입니다. 객체 자체는 둘이기 때문입니다.');
      copy.items.push('빵');
      t.step('p', "copy.items에 빵을 넣었더니 order.items도 바뀌었습니다. 겉만 복사하는 이것을 얕은 복사라고 합니다.");
      const deep = structuredClone(order);
      t.def('deep', deep);
      t.step('d', 'structuredClone은 안쪽 배열까지 모두 새로 만듭니다(깊은 복사). deep.items는 독립된 배열입니다.');
      deep.items.push('잼');
      t.step('p2', 'deep에 넣은 잼은 order에 영향을 주지 않습니다.');
      t.log(order.items);
      t.step('log', "order.items는 ['우유', '빵'].");
    });
  return trace(FN_SRC, (t) => {
    t.def('addFee', fnv('addFee'));
    t.step('f0', 'addFee 함수를 정의합니다.');
    const prices = [1200, 800];
    t.def('prices', prices);
    t.step('p', 'prices 배열을 만들었습니다.');
    t.step('call', 'addFee(prices)를 호출합니다. 인자로 넘어가는 것은 배열이 아니라 화살표의 복사본입니다.', '호출 →');
    t.enter('addFee(list)', { list: prices });
    t.step('f0', '매개변수 list와 전역 prices가 같은 배열을 가리킵니다.');
    prices.push(3000);
    t.step('f1', 'list.push(3000)은 그 하나뿐인 배열을 바꿉니다.');
    t.ret(undefined);
    t.step('f1', '함수가 끝나 list는 사라지지만, 배열에 일어난 변화는 남습니다.', '↩ undefined');
    t.leave();
    t.step('call', '돌아왔습니다.');
    t.log(prices);
    t.step('log', '함수에 넘긴 배열이나 객체를 함수가 고치면, 부른 쪽의 데이터도 바뀝니다. 의도하지 않았다면 찾기 어려운 버그가 됩니다.');
  });
}

function RefFigure() {
  const [k, setK] = useState<RefPreset>('copy');
  const program = useMemo(() => refProgram(k), [k]);
  return (
    <Figure
      no={3}
      title="값 복사와 참조"
      hint="화살표가 어디를 가리키는지 따라가 보세요"
      caption={<>점에서 나가는 화살표가 참조입니다. 두 화살표가 같은 상자에 닿으면 두 이름이 같은 객체를 공유하는 것입니다. 굵은 색 화살표는 방금 바뀐 참조입니다. 화면이 좁으면 메모리 칸을 옆으로 밀어 볼 수 있습니다.</>}
    >
      <Seg
        label="프로그램"
        value={k}
        onChange={setK}
        options={[
          { value: 'copy', label: '값과 참조' },
          { value: 'shallow', label: '얕은·깊은 복사' },
          { value: 'fn', label: '함수에 넘기기' },
        ]}
      />
      <TraceBlock program={program} id="ao-ref-speed" speed={1} />
    </Figure>
  );
}

/* ─────────────── Figure 4: practice ─────────────── */

const TASKS: Task[] = [
  {
    id: 'avg',
    label: '평균',
    prompt: (
      <p>
        점수 배열의 평균을 돌려주세요. 빈 배열이면 0을 돌려줍니다. 0으로 나누면 <code>NaN</code>이 되므로 빈 배열은 따로 처리해야 합니다.
      </p>
    ),
    starter: `
function average(scores) {
  let sum = 0;
  // 반복문으로 sum을 채우세요

  return sum / scores.length;
}
`,
    fnName: 'average',
    tests: [
      { args: [[90, 80, 70]], expect: 80 },
      { args: [[100]], expect: 100 },
      { args: [[62, 75, 84, 90, 99]], expect: 82 },
      { args: [[]], expect: 0, note: '빈 배열' },
    ],
    solution: `
function average(scores) {
  if (scores.length === 0) return 0;
  let sum = 0;
  for (const s of scores) {
    sum = sum + s;
  }
  return sum / scores.length;
}
`,
  },
  {
    id: 'cart',
    label: '장바구니 합계',
    prompt: (
      <p>
        <code>{"{ name, price, qty }"}</code> 객체들의 배열을 받아 <code>price × qty</code>의 합을 돌려주세요. 그림 2의 장바구니 예제와 같습니다.
      </p>
    ),
    starter: `
function cartTotal(cart) {
  let total = 0;

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
      { args: [[{ name: '잼', price: 4900, qty: 3 }]], expect: 14700 },
      { args: [[]], expect: 0, note: '빈 장바구니' },
    ],
    solution: `
function cartTotal(cart) {
  let total = 0;
  for (const item of cart) {
    total = total + item.price * item.qty;
  }
  return total;
}
`,
  },
  {
    id: 'names',
    label: '이름만 모으기',
    prompt: (
      <p>
        상품 객체 배열에서 가격이 <code>limit</code> 이하인 상품의 <strong>이름</strong>만 모은 새 배열을 돌려주세요. <code>filter</code>와 <code>map</code>을 이어 쓰면 한 줄로도 됩니다.
      </p>
    ),
    starter: `
function cheapNames(items, limit) {
  const out = [];

  return out;
}
`,
    fnName: 'cheapNames',
    tests: [
      {
        args: [
          [
            { name: '우유', price: 2500 },
            { name: '치즈', price: 6800 },
            { name: '빵', price: 3200 },
          ],
          3200,
        ],
        expect: ['우유', '빵'],
        note: '3200은 포함',
      },
      { args: [[{ name: '치즈', price: 6800 }], 1000], expect: [] },
    ],
    solution: `
function cheapNames(items, limit) {
  return items
    .filter((it) => it.price <= limit)
    .map((it) => it.name);
}
`,
  },
];

/* ─────────────── Lesson ─────────────── */

export default function ArraysObjects() {
  return (
    <>
      <h2>값이 많아지면</h2>
      <p>
        학생 네 명의 점수라면 <code>score1</code>, <code>score2</code>, … 변수 네 개로 버틸 수 있습니다. 하지만 학생이 300명이면? 장바구니에 담긴 상품 수가 그때그때 다르면? 변수 이름을 미리 정해 둘 수가 없습니다. 이럴 때 여러 값을 한 이름 아래 묶는 그릇이 필요합니다. JavaScript의 기본 그릇은 두 가지입니다. 순서대로 늘어놓는 <T en="array">배열</T>과, 이름표를 붙여 담는 <T en="object">객체</T>입니다.
      </p>

      <h2>배열과 인덱스</h2>
      <p>
        배열은 대괄호 안에 값을 쉼표로 늘어놓아 만듭니다. 각 칸에는 0부터 시작하는 번호, <T en="index">인덱스</T>가 붙습니다. <code>cart[0]</code>이 첫 번째 칸이고, 칸이 4개면 마지막은 <code>cart[3]</code>입니다. 칸의 개수는 <code>cart.length</code>로 알 수 있습니다.
      </p>
      <Code label="배열 기본">{`
const cart = [1200, 3500, 800, 5000];
cart[0];            // 1200 (첫 칸은 0번)
cart[cart.length - 1];   // 5000 (마지막 칸)
cart[2] = 900;      // 2번 칸을 바꾼다
cart.push(2000);    // 끝에 추가 → 길이 5
cart.pop();         // 끝에서 꺼냄 → 2000을 돌려준다`}</Code>
      <ArrayFigure />
      <p>
        그림 1에서 인덱스를 4에 놓고 "cart[i] 읽기"를 눌러 보세요. 칸이 4개(0~3)인 배열의 4번 칸은 없으므로 <code>undefined</code>가 나옵니다. 다른 언어라면 오류로 멈출 일을 JavaScript는 조용히 넘어가므로, 범위를 벗어난 접근은 한참 뒤에 엉뚱한 곳에서 문제를 일으킵니다. "길이가 n이면 마지막 인덱스는 n − 1"은 반드시 몸에 익혀야 하는 규칙입니다.
      </p>
      <p>
        <code>map</code>과 <code>filter</code>는 배열의 모든 원소에 같은 일을 하는 메서드입니다. <code>map</code>은 원소마다 함수를 적용한 결과로 새 배열을 만들고, <code>filter</code>는 조건 함수가 참인 원소만 골라 새 배열을 만듭니다. 둘 다 원래 배열은 건드리지 않는다는 점이 push·pop과 다릅니다. 그림 1에서 map을 누른 뒤에도 cart가 그대로인 것을 확인해 보세요.
      </p>

      <h2>반복문으로 훑기</h2>
      <p>
        배열의 진짜 힘은 반복문과 만날 때 나옵니다. 인덱스 i를 0부터 <code>length − 1</code>까지 늘리며 <code>scores[i]</code>를 보면, 원소가 4개든 4만 개든 같은 코드로 모두 처리할 수 있습니다. 인덱스가 필요 없으면 <code>for (const s of scores)</code>처럼 원소를 직접 하나씩 꺼내는 <code>for...of</code>가 더 읽기 좋습니다.
      </p>
      <WalkFigure />
      <p>
        "성적 평균"에서 반복 조건이 <code>i &lt; scores.length</code>라는 점을 보세요. <code>i &lt;= scores.length</code>로 쓰면 마지막에 <code>scores[4]</code>, 즉 <code>undefined</code>를 더하게 되어 합이 <code>NaN</code>이 됩니다. 이처럼 경계를 하나 넘거나 하나 모자라게 세는 실수를 <T en="off-by-one error">하나 차이 오류</T>라고 하며, 프로그래머가 가장 자주 만드는 버그 중 하나입니다.
      </p>

      <h2>객체와 속성</h2>
      <p>
        배열이 "순서"로 값을 찾는다면 객체는 "이름"으로 찾습니다. 상품 하나에는 이름, 가격, 수량이 있는데, 이것을 <code>[ '우유', 2500, 2 ]</code>로 담으면 1번 칸이 가격이라는 것을 따로 기억해야 합니다. 객체는 각 값에 이름표를 붙여 담습니다. 이 이름-값 쌍을 <T en="property">속성</T>이라고 합니다.
      </p>
      <Code label="객체 기본">{`
const item = { name: '우유', price: 2500, qty: 2 };
item.price;               // 2500 (점으로 속성 읽기)
item.qty = 3;             // 속성 바꾸기
item.soldOut = false;     // 없던 속성 추가
item['name'];             // '우유' (이름을 문자열로 줄 수도 있다)

// 실제 데이터는 대개 "객체의 배열"이다
const cart = [item, { name: '빵', price: 3200, qty: 1 }];
cart[1].name;             // '빵'`}</Code>
      <p>
        서버에서 받아 오는 데이터, 설정 파일, 화면의 상태처럼 실무 데이터는 대부분 객체와 배열이 겹겹이 들어간 모양입니다. 그림 2의 "장바구니" 프리셋에서 cart 배열의 칸들이 다시 객체를 가리키는 모습을 볼 수 있습니다. 이런 모양을 글로 옮겨 적는 형식이 웹에서 가장 흔한 데이터 형식인 JSON입니다.
      </p>

      <h2>같은 것을 가리키는 두 이름</h2>
      <p>
        여기서 초보자가 가장 많이 놀라는 지점이 나옵니다. 숫자를 담은 변수를 다른 변수에 대입하면 값이 복사됩니다. 그런데 배열이나 객체를 대입하면 복사되지 않습니다. 배열과 객체는 메모리의 다른 곳(힙)에 놓이고, 변수에는 그곳을 가리키는 <T en="reference">참조</T>만 담기기 때문입니다. 대입하면 참조, 즉 화살표만 복사됩니다.
      </p>
      <RefFigure />
      <p>
        "값과 참조"를 끝까지 넘겨 보세요. <code>cart2 = cart1</code> 뒤에는 화살표 두 개가 같은 배열에 닿아 있고, cart2로 넣은 빵이 cart1에도 보입니다. 별명이 둘인 한 사람과 같습니다. 정말 따로 쓰고 싶다면 <code>[...cart1]</code>이나 <code>{'{ ...obj }'}</code>로 새 배열·객체를 만들어야 합니다.
      </p>
      <Callout kind="warn">
        <code>{'{ ...order }'}</code>는 겉의 객체만 새로 만드는 <T en="shallow copy">얕은 복사</T>입니다. 안에 든 배열이나 객체는 여전히 공유됩니다. "얕은·깊은 복사" 프리셋에서 copy.items에 넣은 빵이 order.items에도 나타나는 것을 보세요. 안쪽까지 모두 따로 만들려면 <code>structuredClone(order)</code> 같은 <T en="deep copy">깊은 복사</T>가 필요합니다.
      </Callout>
      <p>
        함수에 배열을 넘길 때도 같습니다("함수에 넘기기"). 매개변수에는 화살표의 복사본이 들어가므로, 함수 안에서 배열을 고치면 함수 밖의 배열이 바뀝니다. 장바구니 합계를 계산하는 함수가 몰래 배송비 항목을 push해 버리면, 화면에 표시된 장바구니에도 배송비 상품이 생깁니다. 그래서 많은 팀이 "받은 배열은 고치지 말고, 바꾼 결과는 새 배열로 돌려준다"는 규칙을 씁니다. map과 filter가 새 배열을 돌려주는 이유이기도 합니다.
      </p>
      <Callout kind="intuition">
        <code>===</code>로 배열이나 객체를 비교하면 내용이 아니라 "같은 상자인가"를 묻습니다. <code>[1, 2] === [1, 2]</code>는 false입니다. 내용이 같아도 상자가 둘이기 때문입니다. 반면 <code>cart2 === cart1</code>은 true입니다.
      </Callout>

      <h2>직접 해 보기</h2>
      <Figure no={4} title="직접 실행: 배열과 객체 다루기" hint="코드를 고치고 ▶ 실행을 누르세요" caption={<>테스트에 넘기는 배열은 매번 새로 복사해서 넘기므로, 함수가 배열을 고쳐도 다른 테스트에 영향을 주지 않습니다. 빈 배열처럼 "아무것도 없는 경우"를 꼭 확인하세요.</>}>
        <RunBox tasks={TASKS} id="ao-run-status" />
      </Figure>
      <p>
        배열에서 값을 찾을 때 처음부터 하나씩 보는 방법은 원소가 많아지면 느려집니다. 정렬된 배열에서 빠르게 찾는 이진 탐색, 이름으로 바로 찾는 해시 테이블은 <a href={lessonHref('cs-algorithms', 'search-hash')}>기초 알고리즘의 탐색과 해시 장</a>에서 이어집니다. 객체가 이름으로 값을 바로 찾는 것도 해시 테이블 덕분입니다.
      </p>

      <Callout kind="key">
        배열은 0부터 시작하는 인덱스로, 객체는 속성 이름으로 값을 꺼냅니다. 배열과 객체는 힙에 놓이고 변수에는 참조가 담기므로, 대입하거나 함수에 넘기면 같은 것을 공유합니다. 따로 쓰려면 새로 복사하고, 안쪽까지 따로 쓰려면 깊은 복사를 합니다.
      </Callout>
      <Quiz
        q={
          <>
            실행 뒤 <code>a</code>의 값은? <code>{"const a = { n: 1 }; const b = a; b.n = 2; const c = { ...a }; c.n = 3;"}</code>
          </>
        }
        options={[<code key="1">{'{ n: 1 }'}</code>, <code key="2">{'{ n: 2 }'}</code>, <code key="3">{'{ n: 3 }'}</code>, '오류: const 객체는 바꿀 수 없다']}
        answer={1}
        explain={
          <>
            b는 a와 같은 객체를 가리키므로 <code>b.n = 2</code>는 a의 객체를 바꿉니다. c는 전개 문법으로 만든 새 객체라서 <code>c.n = 3</code>은 a에 영향을 주지 않습니다. const는 "변수가 다른 것을 가리키게 하지 않겠다"는 약속일 뿐, 가리키는 객체의 속성을 바꾸는 것은 막지 않습니다.
          </>
        }
      />
    </>
  );
}
