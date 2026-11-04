import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, M, Quiz, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { RunBox, type Task } from '../../programming/lessons/RunBox';
import { fnv, trace, type Program } from '../../programming/lessons/trace';
import { TraceBlock } from '../../programming/lessons/TraceView';
import '../../programming/lessons/programming.css';
import './languages.css';

/* ─────────────── Figure 1: a shared array changed behind your back ─────────────── */

const MUT_SRC = `
const cart = [3000, 12000, 5000]; @@c
function addFee(items) { @@f0
  items.push(2500);         // 배송비 줄을 붙인다 @@f1
  return items; @@f2
}
const bill = addFee(cart);  // 영수증에 쓸 배열 @@call
console.log(bill); @@l1
console.log(cart);          // 장바구니 화면 @@l2
`;

const PURE_SRC = `
const cart = [3000, 12000, 5000]; @@c
function addFee(items) { @@f0
  return [...items, 2500];  // 새 배열을 만든다 @@f1
}
const bill = addFee(cart);  // 영수증에 쓸 배열 @@call
console.log(bill); @@l1
console.log(cart);          // 장바구니 화면 @@l2
`;

const SORT_SRC = `
const scores = [70, 95, 82]; @@c
function best(xs) { @@f0
  xs.sort((a, b) => b - a); // 큰 순서로 제자리 정렬 @@f1
  return xs[0]; @@f2
}
const top = best(scores); @@call
console.log(top, scores);   // 원래 순서는? @@l1
`;

type MutPreset = 'mut' | 'pure' | 'sort';

function mutProgram(k: MutPreset): Program {
  if (k === 'sort')
    return trace(SORT_SRC, (t) => {
      const scores = [70, 95, 82];
      t.def('scores', scores);
      t.step('c', '학생 세 명의 점수를 입력 순서대로 담았습니다. 화면의 명단도 이 순서를 씁니다.');
      t.def('best', fnv('best'));
      t.step('f0', '가장 높은 점수를 돌려주는 함수 best를 정의합니다.');
      t.step('call', 'best(scores)를 부릅니다. 배열을 넘기면 배열 자체가 아니라 그 배열을 가리키는 화살표가 복사됩니다.', '호출 →');
      t.enter('best(xs)', { xs: scores });
      t.step('f0', 'xs와 scores가 같은 배열 하나를 가리킵니다.');
      scores.sort((a, b) => b - a);
      t.step('f1', 'sort는 새 배열을 만들지 않고 받은 배열 자체를 다시 늘어놓습니다. 함수 밖의 scores도 같은 배열이므로 순서가 바뀌었습니다.');
      t.ret(95);
      t.step('f2', '맨 앞의 95를 돌려줍니다. 답은 맞지만 부작용이 남았습니다.', '↩ 95');
      t.leave();
      t.def('top', 95);
      t.step('call', 'top = 95.');
      t.log(95, scores);
      t.step('l1', '입력 순서가 사라졌습니다. 이 배열을 쓰던 명단 화면은 이제 점수 순으로 보입니다. scores.toSorted(…)나 [...xs].sort(…)를 쓰면 원본이 그대로 남습니다.', '✗ 원본이 바뀜');
    });
  const pure = k === 'pure';
  return trace(pure ? PURE_SRC : MUT_SRC, (t) => {
    const cart = [3000, 12000, 5000];
    t.def('cart', cart);
    t.step('c', '장바구니에 상품 세 개가 담겼습니다. 장바구니 화면은 이 배열을 그대로 보여 줍니다.');
    t.def('addFee', fnv('addFee'));
    t.step('f0', '영수증용으로 배송비 2500원 줄을 붙이는 함수 addFee를 정의합니다.');
    t.step('call', 'addFee(cart)를 부릅니다. 넘어가는 것은 배열을 가리키는 화살표입니다.', '호출 →');
    t.enter('addFee(items)', { items: cart });
    t.step('f0', 'items와 cart가 같은 배열 하나를 가리킵니다.');
    let bill: number[];
    if (pure) {
      bill = [...cart, 2500];
      t.ret(bill);
      t.step('f1', '[...items, 2500]은 items의 원소를 복사한 새 배열을 만들고 끝에 2500을 붙입니다. 원래 배열은 손대지 않습니다.', '↩ 새 배열');
    } else {
      cart.push(2500);
      t.step('f1', 'push는 받은 배열 자체에 원소를 붙입니다. items와 cart는 같은 배열이므로 장바구니에도 배송비 줄이 생겼습니다.');
      bill = cart;
      t.ret(bill);
      t.step('f2', '바뀐 그 배열을 그대로 돌려줍니다.', '↩ 같은 배열');
    }
    t.leave();
    t.def('bill', bill);
    t.step('call', pure ? 'bill은 새 배열을, cart는 원래 배열을 가리킵니다.' : 'bill과 cart가 같은 배열을 가리킵니다.');
    t.log(bill);
    t.step('l1', '영수증은 배송비까지 네 줄. 의도한 대로입니다.');
    t.log(cart);
    t.step('l2', pure ? '장바구니는 처음 그대로 세 줄입니다. addFee는 같은 입력에 늘 같은 결과를 주고 다른 것을 바꾸지 않는 순수 함수입니다.' : '장바구니 화면에도 배송비가 상품처럼 나타났습니다. 이 버그는 addFee가 아니라 전혀 다른 화면에서 발견됩니다.', pure ? '✓ 그대로' : '✗ 바뀜');
  });
}

function MutationFigure() {
  const [k, setK] = useState<MutPreset>('mut');
  const program = useMemo(() => mutProgram(k), [k]);
  return (
    <Figure
      no={1}
      title="같은 배열을 두 곳에서 쓸 때"
      hint="세 프로그램을 바꿔 가며 끝까지 넘겨 보세요"
      caption={<>왼쪽은 코드, 오른쪽은 변수와 힙입니다. 화살표는 변수가 어느 배열을 가리키는지 보여 줍니다. 노란 칸은 방금 바뀐 값입니다. 함수에 배열을 넘기면 화살표만 복사되므로, 함수 안에서 배열을 고치면 그 배열을 쓰는 모든 곳이 함께 바뀝니다.</>}
    >
      <Seg
        label="프로그램"
        value={k}
        onChange={setK}
        options={[
          { value: 'mut', label: 'push로 고치기' },
          { value: 'pure', label: '새 배열 만들기' },
          { value: 'sort', label: 'sort의 함정' },
        ]}
      />
      <TraceBlock program={program} id="fp-mut-speed" />
    </Figure>
  );
}

/* ─────────────── Figure 2: a map / filter / reduce pipeline ─────────────── */

interface Order {
  item: string;
  cat: string;
  price: number;
  qty: number;
}
const ORDERS: Order[] = [
  { item: '아메리카노', cat: '음료', price: 4500, qty: 2 },
  { item: '라떼', cat: '음료', price: 5000, qty: 1 },
  { item: '베이글', cat: '빵', price: 3500, qty: 3 },
  { item: '케이크', cat: '디저트', price: 6500, qty: 1 },
  { item: '스콘', cat: '빵', price: 3000, qty: 2 },
  { item: '스무디', cat: '음료', price: 6000, qty: 2 },
];

type Kind = 'order' | 'number' | 'string';
type Item = Order | number | string;
const KIND_NAME: Record<Kind, string> = { order: '주문 객체', number: '숫자', string: '문자열' };

interface StageDef {
  id: string;
  method: 'filter' | 'map' | 'reduce';
  code: string;
  label: string;
  input: Kind | 'any';
  out?: Kind;
  f?: (x: Item) => Item | boolean;
  init?: number;
  red?: (a: number, x: Item) => number;
}

const STAGES: StageDef[] = [
  { id: 'drink', method: 'filter', code: "(o) => o.cat === '음료'", label: '음료만', input: 'order', f: (o) => (o as Order).cat === '음료' },
  { id: 'multi', method: 'filter', code: '(o) => o.qty >= 2', label: '2개 이상', input: 'order', f: (o) => (o as Order).qty >= 2 },
  { id: 'sub', method: 'map', code: '(o) => o.price * o.qty', label: '금액 계산', input: 'order', out: 'number', f: (o) => (o as Order).price * (o as Order).qty },
  { id: 'name', method: 'map', code: '(o) => o.item', label: '이름만', input: 'order', out: 'string', f: (o) => (o as Order).item },
  { id: 'big', method: 'filter', code: '(n) => n >= 10000', label: '1만 원 이상', input: 'number', f: (n) => (n as number) >= 10000 },
  { id: 'sale', method: 'map', code: '(n) => n * 0.9', label: '10% 할인', input: 'number', out: 'number', f: (n) => Math.round((n as number) * 0.9) },
  { id: 'sum', method: 'reduce', code: '(acc, n) => acc + n, 0', label: '합계', input: 'number', init: 0, red: (a, n) => a + (n as number) },
  { id: 'max', method: 'reduce', code: '(acc, n) => Math.max(acc, n), 0', label: '최댓값', input: 'number', init: 0, red: (a, n) => Math.max(a, n as number) },
  { id: 'count', method: 'reduce', code: '(acc, x) => acc + 1, 0', label: '개수', input: 'any', init: 0, red: (a) => a + 1 },
];
const STAGE = new Map(STAGES.map((s) => [s.id, s]));

interface StageOut {
  def: StageDef;
  items?: Item[];
  kind?: Kind;
  value?: number;
  trail?: number[];
  error?: string;
}

function runPipeline(ids: string[]): StageOut[] {
  let cur: Item[] = ORDERS;
  let kind: Kind = 'order';
  let scalar = false;
  const out: StageOut[] = [];
  for (const id of ids) {
    const def = STAGE.get(id)!;
    if (scalar) {
      out.push({ def, error: 'reduce가 배열을 값 하나로 접은 뒤라서 더 이을 배열이 없습니다.' });
      break;
    }
    if (def.input !== 'any' && def.input !== kind) {
      out.push({ def, error: `이 함수는 ${KIND_NAME[def.input]}를 받아야 하는데 ${KIND_NAME[kind]} 배열이 들어왔습니다.${kind !== 'order' && def.input === 'order' ? ' 숫자에는 o.cat 같은 속성이 없습니다.' : ''}` });
      break;
    }
    if (def.method === 'filter') {
      cur = cur.filter((x) => def.f!(x));
      out.push({ def, items: cur, kind });
    } else if (def.method === 'map') {
      cur = cur.map((x) => def.f!(x) as Item);
      kind = def.out!;
      out.push({ def, items: cur, kind });
    } else {
      const trail = [def.init!];
      for (const x of cur) trail.push(def.red!(trail[trail.length - 1], x));
      scalar = true;
      out.push({ def, value: trail[trail.length - 1], trail });
    }
  }
  return out;
}

const won = (n: number) => n.toLocaleString('ko-KR');
function ItemChip({ x }: { x: Item }) {
  if (typeof x === 'number') return <span className="pl-chip">{won(x)}</span>;
  if (typeof x === 'string') return <span className="pl-chip">'{x}'</span>;
  return (
    <span className="pl-chip fp-order">
      {x.item}
      <small>
        {x.cat} · {won(x.price)}×{x.qty}
      </small>
    </span>
  );
}

const DEFAULT_PIPE = ['drink', 'sub', 'sum'];

function PipelineFigure() {
  const [pipe, setPipe] = useState<string[]>(DEFAULT_PIPE);
  const res = useMemo(() => runPipeline(pipe), [pipe]);
  const last = res[res.length - 1];
  const broken = res.some((r) => r.error);
  const endKind: Kind | 'scalar' = !last ? 'order' : last.value !== undefined ? 'scalar' : (last.kind ?? 'order');
  const fits = (d: StageDef) => !broken && endKind !== 'scalar' && (d.input === 'any' || d.input === endKind);
  const add = (id: string) => setPipe((p) => (p.length < 6 ? [...p, id] : p));
  const remove = (i: number) => setPipe((p) => p.filter((_, j) => j !== i));
  const up = (i: number) => setPipe((p) => (i > 0 ? [...p.slice(0, i - 1), p[i], p[i - 1], ...p.slice(i + 1)] : p));
  const code = ['orders', ...pipe.map((id) => `  .${STAGE.get(id)!.method}(${STAGE.get(id)!.code})`)].join('\n') + ';';
  const groups: { m: StageDef['method']; label: string }[] = [
    { m: 'filter', label: 'filter: 골라내기' },
    { m: 'map', label: 'map: 바꾸기' },
    { m: 'reduce', label: 'reduce: 하나로 접기' },
  ];

  return (
    <Figure
      no={2}
      title="map, filter, reduce를 이어 붙이기"
      hint="아래 단추로 단계를 더하고, ↑와 ×로 순서를 바꾸거나 빼 보세요"
      caption={<>카페 주문 여섯 건을 단계마다 새 배열로 바꿔 가며 흘려보냅니다. 각 줄 아래가 그 단계가 만든 중간 배열입니다. filter는 개수를, map은 원소의 모양을 바꾸고, reduce는 배열 전체를 값 하나로 접습니다. 어느 단계도 앞 단계의 배열을 고치지 않으므로 맨 위 orders는 언제나 여섯 건 그대로입니다. 들어오는 원소의 종류가 맞지 않는 단추는 눌리지 않습니다.</>}
    >
      <div className="fp-pipe" aria-live="polite">
        <div className="fp-stage">
          <div className="fp-stage-head">
            <code>orders</code>
            <span className="pl-label">원본 · {ORDERS.length}개</span>
          </div>
          <div className="pl-chips">
            {ORDERS.map((o, i) => (
              <ItemChip key={i} x={o} />
            ))}
          </div>
        </div>
        {res.map((r, i) => (
          <div key={i} className="fp-stage" data-err={r.error ? true : undefined} data-m={r.def.method}>
            <div className="fp-stage-head">
              <code>
                .{r.def.method}({r.def.code})
              </code>
              <span className="fp-tools">
                <Button small onClick={() => up(i)} disabled={i === 0} label={`${i + 1}번째 단계를 위로`} title="위로">
                  ↑
                </Button>
                <Button small onClick={() => remove(i)} label={`${i + 1}번째 단계 빼기`} title="빼기">
                  ×
                </Button>
              </span>
            </div>
            {r.error ? (
              <div className="pl-err">{r.error}</div>
            ) : r.value !== undefined ? (
              <div className="fp-reduce">
                <span className="pl-label">누적값 acc의 변화</span>
                <div className="pl-chips">
                  {r.trail!.map((v, j) => (
                    <span key={j} className="pl-chip" data-on={j === r.trail!.length - 1 || undefined}>
                      {won(v)}
                    </span>
                  ))}
                </div>
                <span className="fp-result">
                  결과: <strong>{won(r.value)}</strong>
                </span>
              </div>
            ) : (
              <>
                <span className="pl-label">
                  {KIND_NAME[r.kind!]} 배열 · {r.items!.length}개
                </span>
                <div className="pl-chips">
                  {r.items!.length ? r.items!.map((x, j) => <ItemChip key={j} x={x} />) : <span className="pl-label">(빈 배열)</span>}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="fp-palette">
        {groups.map((g) => (
          <div key={g.m} className="fp-group">
            <span className="pl-label">{g.label}</span>
            <div className="btn-row">
              {STAGES.filter((s) => s.method === g.m).map((s) => (
                <Button key={s.id} small onClick={() => add(s.id)} disabled={!fits(s) || pipe.length >= 6} title={fits(s) ? s.code : endKind === 'scalar' ? 'reduce 뒤에는 이을 수 없습니다' : `${s.input === 'any' ? '' : KIND_NAME[s.input as Kind] + ' 배열에만 쓸 수 있습니다'}`}>
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
        ))}
        <div className="btn-row">
          <Button small onClick={() => setPipe(DEFAULT_PIPE)}>
            처음으로
          </Button>
          <Button small onClick={() => setPipe([])}>
            모두 빼기
          </Button>
        </div>
      </div>
      <Code label="지금 파이프라인의 코드">{code}</Code>
    </Figure>
  );
}

/* ─────────────── Figure 3: closures remember their environment ─────────────── */

interface Clo {
  name: string;
  /** captured variables */
  env: [string, number][];
  envLabel: string;
  fnText: string;
}

const COUNTER_SRC = `function makeCounter(step) {
  let count = 0;            // 부를 때마다 새로 생기는 변수
  return () => {
    count = count + step;   // 바깥 함수의 변수를 계속 쓴다
    return count;
  };
}`;
const CURRY_SRC = `// 비율을 먼저 받고, 금액은 나중에 받는다
const withRate = (rate) => (amount) =>
  Math.round(amount * (1 + rate));`;
const RATES = [
  { name: 'vat', rate: 0.1, label: '부가세 10%' },
  { name: 'tip', rate: 0.05, label: '봉사료 5%' },
  { name: 'sale', rate: -0.2, label: '할인 20%' },
];

function ClosureFigure() {
  const [mode, setMode] = useState<'counter' | 'curry'>('counter');
  const [step, setStep] = useState(1);
  const [clos, setClos] = useState<Clo[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [hot, setHot] = useState<string | null>(null);
  const switchMode = (m: 'counter' | 'curry') => {
    setMode(m);
    setClos([]);
    setLog([]);
    setHot(null);
  };
  const names = ['a', 'b', 'c'];
  const make = () => {
    const name = names[clos.length];
    setClos([...clos, { name, env: [['step', step], ['count', 0]], envLabel: `makeCounter(${step}) 호출`, fnText: '() => { count = count + step; … }' }]);
    setLog([...log, `const ${name} = makeCounter(${step});`]);
    setHot(name);
  };
  const callCounter = (c: Clo) => {
    const st = c.env.find((e) => e[0] === 'step')![1];
    const n = c.env.find((e) => e[0] === 'count')![1] + st;
    setClos(clos.map((x) => (x === c ? { ...x, env: [['step', st], ['count', n]] } : x)));
    setLog([...log, `${c.name}()  → ${n}`]);
    setHot(c.name);
  };
  const makeRate = (r: (typeof RATES)[number]) => {
    if (clos.some((c) => c.name === r.name)) return;
    setClos([...clos, { name: r.name, env: [['rate', r.rate]], envLabel: `withRate(${r.rate}) 호출`, fnText: '(amount) => Math.round(amount * (1 + rate))' }]);
    setLog([...log, `const ${r.name} = withRate(${r.rate});`]);
    setHot(r.name);
  };
  const applyRate = (c: Clo, amount: number) => {
    const rate = c.env[0][1];
    setLog([...log, `${c.name}(${amount})  → ${Math.round(amount * (1 + rate))}`]);
    setHot(c.name);
  };

  return (
    <Figure
      no={3}
      title="클로저는 자기가 태어난 환경을 기억한다"
      hint="함수를 만들고 여러 번 불러 보세요"
      caption={<>한 줄이 함수 값 하나입니다. 변수(왼쪽)가 함수(가운데)를 가리키고, 함수는 자기가 만들어질 때의 환경(오른쪽)을 붙잡고 있습니다. makeCounter를 부를 때마다 새 환경이 생기므로 카운터마다 count가 따로 있습니다. 커링에서는 withRate에 비율만 먼저 넘겨 비율을 기억하는 함수를 얻고, 금액은 나중에 넘깁니다.</>}
    >
      <Seg
        label="예제"
        value={mode}
        onChange={switchMode}
        options={[
          { value: 'counter', label: '카운터 공장' },
          { value: 'curry', label: '커링과 부분 적용' },
        ]}
      />
      <div className="fig-split">
        <div className="pl-col">
          <Code label={mode === 'counter' ? 'makeCounter' : 'withRate'}>{mode === 'counter' ? COUNTER_SRC : CURRY_SRC}</Code>
          <div className="fp-clos" role="list" aria-label="만든 함수와 그 환경">
            {clos.length === 0 && <div className="pl-label">아직 만든 함수가 없습니다. 단추를 눌러 만들어 보세요.</div>}
            {clos.map((c) => (
              <div key={c.name} className="fp-clo" role="listitem" data-hot={hot === c.name || undefined}>
                <span className="fp-var mono">{c.name}</span>
                <span className="fp-arrow" aria-hidden="true" />
                <span className="fp-fn mono">ƒ {c.fnText}</span>
                <span className="fp-arrow" aria-hidden="true" />
                <span className="fp-env">
                  <span className="fp-env-head">{c.envLabel}의 환경</span>
                  {c.env.map(([k, v]) => (
                    <span key={k} className="mono">
                      {k} = {v}
                    </span>
                  ))}
                  <span className="fp-env-parent">부모 → 전역</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="controls">
          {mode === 'counter' ? (
            <>
              <Seg label="step" value={step} onChange={setStep} options={[1, 10].map((v) => ({ value: v, label: String(v) }))} />
              <Button small primary onClick={make} disabled={clos.length >= 3}>
                const {names[Math.min(clos.length, 2)]} = makeCounter({step})
              </Button>
              <div className="btn-row" role="group" aria-label="카운터 부르기">
                {clos.map((c) => (
                  <Button key={c.name} small onClick={() => callCounter(c)}>
                    {c.name}()
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="btn-row" role="group" aria-label="부분 적용으로 함수 만들기">
                {RATES.map((r) => (
                  <Button key={r.name} small onClick={() => makeRate(r)} disabled={clos.some((c) => c.name === r.name)}>
                    {r.name} = withRate({r.rate})
                  </Button>
                ))}
              </div>
              {clos.map((c) => (
                <div key={c.name} className="btn-row" role="group" aria-label={`${c.name} 부르기`}>
                  {[10000, 4500].map((a) => (
                    <Button key={a} small onClick={() => applyRate(c, a)}>
                      {c.name}({a})
                    </Button>
                  ))}
                </div>
              ))}
            </>
          )}
          <Button
            small
            onClick={() => {
              setClos([]);
              setLog([]);
            }}
          >
            지우고 다시
          </Button>
          <div className="tr-out" aria-label="실행한 코드와 결과" aria-live="polite">
            <div className="tr-out-head">실행 기록</div>
            {log.length === 0 ? <div className="tr-out-empty">아직 없음</div> : log.slice(-7).map((l, i) => <div key={i} className="tr-out-line">{l}</div>)}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: write it yourself ─────────────── */

const TASKS: Task[] = [
  {
    id: 'odd',
    label: '홀수 제곱의 합',
    prompt: (
      <p>
        숫자 배열에서 홀수만 골라 제곱한 뒤 모두 더한 값을 돌려주세요. <code>for</code>문 없이 <code>filter</code>, <code>map</code>, <code>reduce</code>를 이어서 쓰면 한 줄로 됩니다. 빈 배열이면 0입니다.
      </p>
    ),
    starter: `
function sumOddSquares(nums) {
  return nums
    // 여기에 .filter( ), .map( ), .reduce( )를 이어 쓰세요
    ;
}
`,
    fnName: 'sumOddSquares',
    tests: [
      { args: [[1, 2, 3, 4, 5]], expect: 35, note: '1 + 9 + 25' },
      { args: [[2, 4, 6]], expect: 0 },
      { args: [[]], expect: 0, note: '빈 배열' },
      { args: [[7, -3]], expect: 58 },
    ],
    solution: `
function sumOddSquares(nums) {
  return nums
    .filter((n) => n % 2 !== 0)       // 홀수만 (음수 홀수의 나머지는 -1)
    .map((n) => n * n)
    .reduce((acc, n) => acc + n, 0);  // 초깃값 0이 빈 배열을 지켜 준다
}
`,
  },
  {
    id: 'pure',
    label: '순수하게 고치기',
    prompt: (
      <p>
        <code>withTax</code>는 가격마다 10%를 붙인 배열을 돌려주는데, 받은 배열을 직접 고칩니다. 테스트는 원본과 결과를 함께 확인합니다. 원본을 건드리지 않도록 고쳐 보세요.
      </p>
    ),
    starter: `
function withTax(prices) {
  for (let i = 0; i < prices.length; i++) {
    prices[i] = Math.round(prices[i] * 1.1);
  }
  return prices;
}

// 테스트가 부르는 함수: 원본과 결과를 같이 돌려준다
function check(prices) {
  const result = withTax(prices);
  return { 원본: prices, 결과: result };
}
`,
    fnName: 'check',
    tests: [
      { args: [[1000, 2000]], expect: { 원본: [1000, 2000], 결과: [1100, 2200] } },
      { args: [[4500]], expect: { 원본: [4500], 결과: [4950] } },
    ],
    solution: `
function withTax(prices) {
  return prices.map((p) => Math.round(p * 1.1)); // 새 배열을 만든다
}

function check(prices) {
  const result = withTax(prices);
  return { 원본: prices, 결과: result };
}
`,
  },
  {
    id: 'curry',
    label: '커링',
    prompt: (
      <p>
        두 수를 한 번에 받는 대신 하나씩 받는 <code>add</code>를 완성하세요. <code>add(2)(3)</code>은 5이고, <code>add(10)</code>은 "10을 더하는 함수"입니다. 그 함수를 <code>map</code>에 그대로 넘길 수도 있습니다.
      </p>
    ),
    starter: `
const add = (a) => {
  // a를 기억하는 함수를 돌려주세요
};

function check(n) {
  return [add(2)(3), add(10)(n), [1, 2, 3].map(add(n))];
}
`,
    fnName: 'check',
    tests: [
      { args: [5], expect: [5, 15, [6, 7, 8]] },
      { args: [0], expect: [5, 10, [1, 2, 3]] },
    ],
    solution: `
const add = (a) => (b) => a + b;   // 안쪽 함수가 a를 기억한다(클로저)

function check(n) {
  return [add(2)(3), add(10)(n), [1, 2, 3].map(add(n))];
}
`,
  },
];

/* ─────────────── Lesson ─────────────── */

export default function Functional() {
  return (
    <>
      <h2>어떻게 하느냐에서 무엇이냐로</h2>
      <p>
        장바구니 합계를 구하는 코드를 두 가지로 써 봅시다. 첫째는 지금까지 해 온 방식입니다. 변수 <code>sum</code>을 0으로 두고, 반복문을 돌며 값을 하나씩 더해 <strong>바꿔 갑니다</strong>. 이렇게 상태를 단계마다 바꾸며 일을 시키는 방식을 <T en="imperative programming">명령형 프로그래밍</T>이라고 합니다. 둘째는 "음료만 고르고, 금액으로 바꾸고, 더한 것"이라고 결과가 <strong>무엇인지</strong>를 함수의 조합으로 적습니다. 변수는 한 번 정하면 바꾸지 않습니다. 이것이 <T en="functional programming">함수형 프로그래밍</T>입니다.
      </p>
      <Code label="같은 계산, 두 가지 방식">{`
// 명령형: 상태(sum, i)를 바꿔 가며 단계를 지시한다
let sum = 0;
for (let i = 0; i < orders.length; i++) {
  if (orders[i].cat === '음료') {
    sum += orders[i].price * orders[i].qty;
  }
}

// 함수형: 값을 바꾸지 않고 함수를 이어 붙인다
const total = orders
  .filter((o) => o.cat === '음료')
  .map((o) => o.price * o.qty)
  .reduce((acc, n) => acc + n, 0);`}</Code>
      <p>
        함수형 언어의 원조는 1958년의 Lisp이고, Haskell, OCaml, Scala, Elixir 같은 언어가 이 생각을 중심에 둡니다. 카네기멜런 대학의 15-150 같은 강의는 첫 학기부터 함수형 언어 SML로 가르칩니다. 하지만 이 생각은 이제 거의 모든 언어에 들어와 있습니다. JavaScript의 배열 메서드, Java의 Stream, Python의 리스트 내포, React가 상태를 바꾸지 않고 새로 만들라고 하는 규칙이 모두 같은 뿌리입니다. 이 장에서는 JavaScript로 그 핵심 세 가지, 순수 함수, 고차 함수, 클로저를 봅니다.
      </p>

      <h2>순수 함수: 같은 입력, 같은 출력, 부작용 없음</h2>
      <p>
        <T en="pure function">순수 함수</T>는 두 가지를 지킵니다. 같은 인자를 주면 언제나 같은 값을 돌려주고, 값을 돌려주는 것 말고는 바깥 세상에 아무 흔적도 남기지 않습니다. 전역 변수를 바꾸거나, 받은 배열을 고치거나, 화면에 출력하거나, 파일을 쓰는 일을 <T en="side effect">부작용</T>이라고 합니다. <code>Math.max</code>는 순수하고, <code>Math.random</code>과 <code>Date.now</code>는 부를 때마다 값이 달라 순수하지 않습니다.
      </p>
      <p>
        부작용 중 가장 찾기 어려운 버그를 만드는 것은 <strong>공유된 데이터를 고치는 일</strong>입니다. <a href={lessonHref('cs-programming', 'arrays-objects')}>프로그래밍 입문의 배열과 객체 장</a>에서 본 것처럼, 배열을 함수에 넘기면 배열이 복사되지 않고 같은 배열을 가리키는 화살표만 복사됩니다. 그림 1에서 직접 확인해 보세요.
      </p>
      <MutationFigure />
      <p>
        "push로 고치기"에서는 영수증을 만들던 함수가 장바구니 화면까지 망가뜨립니다. 버그가 드러나는 곳(장바구니 화면)과 원인(addFee)이 멀리 떨어져 있어서, 장바구니 코드를 아무리 읽어도 원인이 보이지 않습니다. "새 배열 만들기"는 받은 배열을 그대로 두고 새 배열을 돌려줍니다. 원래 배열은 <T en="immutable">불변</T>인 것처럼 다룬 셈입니다.
      </p>
      <Callout kind="warn">
        JavaScript 배열의 <code>push</code>, <code>pop</code>, <code>splice</code>, <code>sort</code>, <code>reverse</code>, <code>fill</code>은 배열 자체를 고칩니다. 원본을 지키려면 <code>[...xs, x]</code>, <code>xs.slice()</code>, 그리고 2023년에 표준이 된 <code>toSorted</code>, <code>toReversed</code>, <code>toSpliced</code>, <code>with</code>를 쓰세요. 객체도 마찬가지로 <code>{'{ ...obj, price: 0 }'}</code>처럼 새로 만듭니다.
      </Callout>
      <p>순수 함수가 주는 이득은 구체적입니다.</p>
      <ul>
        <li>
          <strong>테스트가 쉽다.</strong> 입력과 기대하는 출력만 적으면 됩니다. 테스트 전에 데이터베이스를 준비하거나, 끝난 뒤 전역 상태를 되돌릴 필요가 없습니다.
        </li>
        <li>
          <strong>결과를 저장해 다시 쓸 수 있다.</strong> 같은 입력이면 같은 출력이므로, 한 번 계산한 결과를 기억해 두는 <T en="memoization">메모이제이션</T>이 언제나 안전합니다. React의 <code>useMemo</code>가 이 가정에 기댑니다.
        </li>
        <li>
          <strong>동시에 돌려도 안전하다.</strong> 서로의 데이터를 고치지 않으니 순서를 바꾸거나 여러 코어에서 동시에 실행해도 결과가 같습니다. 여러 스레드가 같은 변수를 고칠 때 생기는 경쟁 상태(<a href={lessonHref('cs-operating-systems', 'locks')}>운영체제의 락 장</a>)가 애초에 생기지 않습니다.
        </li>
      </ul>

      <h2>함수도 값이다: 고차 함수</h2>
      <p>
        JavaScript에서 함수는 숫자나 문자열처럼 변수에 담고, 인자로 넘기고, 반환할 수 있는 값입니다. 이런 함수를 <T en="first-class function">일급 함수</T>라고 하고, 함수를 인자로 받거나 함수를 돌려주는 함수를 <T en="higher-order function">고차 함수</T>라고 합니다. 배열의 <code>map</code>, <code>filter</code>, <code>reduce</code>가 대표적인 고차 함수입니다. 반복하는 뼈대는 메서드가 맡고, 원소마다 무엇을 할지만 함수로 넘깁니다. 직접 만들어 보면 하는 일이 분명해집니다.
      </p>
      <Code label="map, filter, reduce를 직접 만들면">{`
function map(xs, f) {
  const out = [];
  for (const x of xs) out.push(f(x));       // 원소마다 f를 적용
  return out;                               // 길이는 그대로, 모양이 바뀐다
}
function filter(xs, keep) {
  const out = [];
  for (const x of xs) if (keep(x)) out.push(x);
  return out;                               // 모양은 그대로, 개수가 줄어든다
}
function reduce(xs, f, init) {
  let acc = init;                           // 누적값
  for (const x of xs) acc = f(acc, x);      // 하나씩 접어 넣는다
  return acc;                               // 배열이 값 하나가 된다
}`}</Code>
      <p>
        반복문은 메서드 안에 딱 한 번 있고, 바깥에서 쓰는 코드에는 반복문도, 바꾸는 변수도 없습니다. 그림 2에서 단계를 이어 붙이며 각 단계가 만든 중간 배열을 보세요.
      </p>
      <PipelineFigure />
      <p>
        "음료만 → 금액 계산 → 합계"를 실행하면 여섯 건이 세 건으로 줄고, 객체 배열이 숫자 배열이 되었다가, reduce가 0에서 시작해 9000, 14000, 26000으로 누적값을 키워 26,000을 만듭니다. "금액 계산"을 맨 앞으로 올려 보세요. 그다음의 "음료만"은 숫자 배열을 받게 되어 실패합니다. 숫자에는 <code>cat</code> 속성이 없기 때문입니다. 단계마다 원소의 <strong>종류</strong>가 바뀌고, 다음 단계는 그 종류에 맞아야 합니다. 이 "종류"를 실행하기 전에 따지는 것이 다음 장의 주제인 타입입니다.
      </p>
      <Callout kind="intuition">
        파이프라인은 공장의 컨베이어 벨트와 같습니다. 각 기계(filter, map)는 들어온 물건만 보고 다음 벨트로 넘기며, 앞 기계의 물건을 거꾸로 고치지 않습니다. 그래서 기계를 하나씩 따로 시험할 수 있고, 순서를 바꾸거나 기계를 더 넣기도 쉽습니다.
      </Callout>

      <h2>map은 나눠서 돌릴 수 있다</h2>
      <p>
        map에 넘긴 함수가 순수하면, 원소 하나의 결과는 다른 원소와 상관이 없습니다. 그러니 배열을 열 조각으로 나눠 열 대의 컴퓨터가 동시에 map을 해도 결과가 같습니다. reduce도 합치는 연산이 <M>{'(a+b)+c = a+(b+c)'}</M>처럼 묶는 순서와 상관없으면(<T en="associative">결합법칙</T>) 조각별로 따로 접은 뒤 그 결과를 다시 접을 수 있습니다. 2004년 구글이 발표한 <T en="MapReduce">맵리듀스</T>는 바로 이 두 단계로 수천 대의 서버에서 웹 전체를 색인했고, 오늘날의 Spark나 데이터베이스의 병렬 집계도 같은 원리를 씁니다.
      </p>
      <Callout kind="note">
        단계마다 새 배열을 만들면 메모리를 더 씁니다. 원소가 수백만 개면 차이가 납니다. 그래서 Java의 Stream이나 Rust의 이터레이터는 중간 배열을 만들지 않고 원소 하나를 모든 단계에 차례로 흘려보냅니다(<T en="lazy evaluation">지연 평가</T>). 코드는 함수형으로 쓰고, 실행은 반복문 하나처럼 하는 것입니다. 불변 데이터도 통째로 복사하지 않고 바뀐 부분만 새로 만들어 나머지를 공유하는 <T en="persistent data structure">영속 자료구조</T>로 비용을 줄입니다.
      </Callout>

      <h2>클로저: 함수는 태어난 곳을 기억한다</h2>
      <p>
        함수 안에서 함수를 만들어 돌려주면 재미있는 일이 생깁니다. 안쪽 함수는 바깥 함수의 변수를 쓰는데, 바깥 함수는 이미 return해서 끝났습니다. 그래도 안쪽 함수를 부르면 그 변수가 살아 있습니다. 함수가 자기가 만들어진 곳의 변수들, 즉 <T en="environment">환경</T>을 붙잡고 다니기 때문입니다. 함수와 그 환경을 묶은 것을 <T en="closure">클로저</T>라고 합니다.
      </p>
      <ClosureFigure />
      <p>
        카운터를 두 개 만들고 번갈아 불러 보세요. a를 세 번 불러도 b의 count는 0입니다. makeCounter를 부를 때마다 새 환경(count와 step이 사는 곳)이 생기고, 돌려준 함수가 각자 자기 환경을 붙잡기 때문입니다. 이 count는 바깥에서 직접 읽거나 바꿀 방법이 없고, 돌려준 함수를 통해서만 바뀝니다. 클로저는 이렇게 상태를 숨기는 도구로도 쓰입니다. 이벤트 처리 함수, React의 훅, 설정값을 미리 넣어 둔 함수가 모두 클로저입니다. 환경이 실제로 어떻게 생기고 이어지는지는 이 과목의 <a href={lessonHref('cs-programming-languages', 'interpreter')}>인터프리터 장</a>에서 직접 만들어 봅니다.
      </p>
      <h2>커링과 부분 적용</h2>
      <p>
        인자 여럿을 한 번에 받는 함수를 "인자 하나를 받아 다음 인자를 기다리는 함수"의 사슬로 바꾸는 것을 <T en="currying">커링</T>이라고 합니다. 수학자 해스켈 커리(Haskell Curry)의 이름에서 왔습니다. <code>{'withRate(0.1)(10000)'}</code>처럼 쓰는데, 앞의 인자만 먼저 넘겨 "부가세를 붙이는 함수"를 얻는 것을 <T en="partial application">부분 적용</T>이라고 합니다. 그림 3의 "커링과 부분 적용"에서 vat와 sale은 같은 코드에서 나왔지만 기억하는 rate가 다른 두 함수입니다.
      </p>
      <Code label="부분 적용과 함수 합성">{`
const withRate = (rate) => (amount) => Math.round(amount * (1 + rate));
const vat = withRate(0.1);              // rate = 0.1을 기억한 함수
[10000, 4500].map(vat);                 // [11000, 4950]

// 함수 합성: 오른쪽 함수의 결과를 왼쪽 함수에 넘긴다
const compose = (f, g) => (x) => f(g(x));
const priceTag = compose((n) => n.toLocaleString() + '원', vat);
priceTag(4500);                         // '4,950원'`}</Code>
      <p>
        <code>map(vat)</code>처럼 인자가 하나인 함수는 고차 함수에 그대로 끼워 넣을 수 있습니다. 작은 함수를 부분 적용과 합성으로 조립해 큰 함수를 만드는 것, 이것이 함수형 프로그래밍이 코드를 재사용하는 방식입니다.
      </p>

      <h2>직접 해 보기</h2>
      <Figure no={4} title="직접 실행: 함수형으로 쓰기" hint="코드를 고치고 ▶ 실행을 누르세요" caption={<>코드는 브라우저의 별도 작업자(Web Worker)에서 1초 제한으로 실행됩니다. "순수하게 고치기"의 처음 코드는 결과는 맞지만 원본을 바꿔서 테스트에 실패합니다.</>}>
        <RunBox tasks={TASKS} id="fp-run-status" />
      </Figure>

      <Callout kind="key">
        순수 함수는 같은 입력에 같은 출력을 주고 부작용이 없습니다. 데이터를 고치지 않고 새로 만들면, 그 데이터를 쓰는 다른 코드가 몰래 망가지지 않습니다. 함수는 값이므로 map, filter, reduce처럼 함수를 받는 고차 함수로 반복의 뼈대를 재사용하고, 클로저는 함수가 태어난 환경을 기억해 커링과 부분 적용을 가능하게 합니다.
      </Callout>
      <Quiz
        q={
          <>
            <code>const f = (xs) =&gt; xs.reverse()[0];</code>를 <code>const a = [1, 2, 3];</code>에 대해 <code>f(a)</code>로 두 번 부르면 결과는?
          </>
        }
        options={['3, 3', '3, 1', '1, 1', '오류가 난다']}
        answer={1}
        explain={
          <>
            <code>reverse</code>는 배열 자체를 뒤집습니다. 첫 호출에서 a가 [3, 2, 1]이 되며 3을 돌려주고, 두 번째 호출은 [3, 2, 1]을 다시 뒤집어 [1, 2, 3]을 만들고 1을 돌려줍니다. 같은 인자로 불렀는데 결과가 다르니 f는 순수 함수가 아닙니다. <code>xs.toReversed()[0]</code>이나 <code>xs[xs.length - 1]</code>로 쓰면 언제나 3입니다.
          </>
        }
      />
    </>
  );
}

