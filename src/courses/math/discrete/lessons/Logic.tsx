import { useMemo, useRef, useState, type RefObject } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { TV } from './parts';
import { evaluate, parse, rows, show, subformulas, varsOf, VARS, type Env, type Node, type Var } from './logic';
import './discrete.css';

/* ─────────────── Figure 1: "비가 오면 우산을 쓴다", four cases ─────────────── */

type Form = 'orig' | 'conv' | 'inv' | 'contra';
const FORMS: Record<Form, { name: string; tex: string; text: string; f: (p: boolean, q: boolean) => [boolean, boolean] }> = {
  orig: { name: '원래 명제', tex: 'p \\to q', text: '비가 오면 우산을 쓴다', f: (p, q) => [p, q] },
  conv: { name: '역', tex: 'q \\to p', text: '우산을 쓰면 비가 온 것이다', f: (p, q) => [q, p] },
  inv: { name: '이', tex: '\\neg p \\to \\neg q', text: '비가 오지 않으면 우산을 쓰지 않는다', f: (p, q) => [!p, !q] },
  contra: { name: '대우', tex: '\\neg q \\to \\neg p', text: '우산을 쓰지 않았다면 비가 오지 않은 것이다', f: (p, q) => [!q, !p] },
};
const CASES: [boolean, boolean][] = [
  [true, true],
  [true, false],
  [false, true],
  [false, false],
];

function Rain({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 40 32" width="34" height="27" aria-hidden="true" className="dm-icon" data-on={on || undefined}>
      <path d="M10 18 a7 7 0 0 1 2-13 a9 9 0 0 1 16 2 a6 6 0 0 1 2 11 z" />
      {on && (
        <g className="drops">
          <line x1="13" y1="22" x2="11" y2="29" />
          <line x1="21" y1="22" x2="19" y2="29" />
          <line x1="29" y1="22" x2="27" y2="29" />
        </g>
      )}
      {!on && <line className="cross" x1="6" y1="28" x2="34" y2="3" />}
    </svg>
  );
}

function Umbrella({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 40 32" width="34" height="27" aria-hidden="true" className="dm-icon" data-on={on || undefined}>
      <path d="M4 15 a16 12 0 0 1 32 0 z" />
      <path className="stick" d="M20 15 v11 a3 3 0 0 1 -6 0" />
      {!on && <line className="cross" x1="6" y1="29" x2="34" y2="3" />}
    </svg>
  );
}

function FourCasesFigure() {
  const [form, setForm] = useState<Form>('orig');
  const [pick, setPick] = useState(1);
  const F = FORMS[form];
  const [p, q] = CASES[pick];
  const [ante, cons] = F.f(p, q);
  const val = !ante || cons;
  const why = !ante ? '앞부분(가정)이 거짓이므로 이 문장은 아무것도 약속하지 않았습니다. 어길 수 없으니 참입니다.' : cons ? '가정이 참이고 결론도 참입니다. 약속을 지켰으니 참입니다.' : '가정은 참인데 결론이 거짓입니다. 약속을 어긴 유일한 경우라 거짓입니다.';
  const falseCases = CASES.map(([a, b], k) => ({ k, v: (() => { const [x, y] = F.f(a, b); return !x || y; })() })).filter((c) => !c.v);

  return (
    <Figure
      no={1}
      title="약속이 깨지는 경우는 하나뿐"
      hint="문장 형태를 바꾸고 카드를 눌러 보세요"
      caption={<>p는 "비가 온다", q는 "우산을 쓴다"입니다. 네 카드는 가능한 네 상황이고, 테두리가 점선인 카드가 그 문장이 거짓이 되는 상황입니다. 원래 명제와 대우는 같은 카드에서 거짓이 되고, 역과 이는 다른 카드에서 거짓이 됩니다.</>}
    >
      <div className="controls row">
        <Seg label="문장 형태" value={form} onChange={setForm} options={(Object.keys(FORMS) as Form[]).map((k) => ({ value: k, label: FORMS[k].name }))} />
      </div>
      <div className="dm-sentence">
        <M>{F.tex}</M>
        <span>“{F.text}”</span>
      </div>
      <div className="dm-cases" role="group" aria-label="네 가지 상황">
        {CASES.map(([a, b], k) => {
          const [x, y] = F.f(a, b);
          const v = !x || y;
          return (
            <button key={k} type="button" className="dm-case" data-v={v ? 't' : 'f'} aria-pressed={k === pick} onClick={() => setPick(k)} aria-label={`비 ${a ? '옴' : '안 옴'}, 우산 ${b ? '씀' : '안 씀'}: ${v ? '참' : '거짓'}`}>
              <span className="dm-case-icons">
                <Rain on={a} />
                <Umbrella on={b} />
              </span>
              <span className="dm-case-text">
                비 {a ? '옴' : '안 옴'} · 우산 {b ? '씀' : '안 씀'}
              </span>
              <span className="dm-case-tv mono">
                p={a ? 'T' : 'F'} q={b ? 'T' : 'F'} → <TV v={v} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="dm-note" aria-live="polite">
        <strong>
          비 {p ? '옴' : '안 옴'}, 우산 {q ? '씀' : '안 씀'}:
        </strong>{' '}
        {why}
      </div>
      <div className="readouts dm-readouts-text" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Readout label="이 카드에서" value={<TV v={val} />} />
        <Readout label="거짓이 되는 카드" value={falseCases.map((c) => `비 ${CASES[c.k][0] ? '옴' : '안 옴'} · 우산 ${CASES[c.k][1] ? '씀' : '안 씀'}`).join(', ')} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: truth-table builder and equivalence checker ─────────────── */

const PRESETS: { name: string; a: string; b: string }[] = [
  { name: '드모르간 ①', a: '¬(p ∧ q)', b: '¬p ∨ ¬q' },
  { name: '드모르간 ②', a: '¬(p ∨ q)', b: '¬p ∧ ¬q' },
  { name: '대우', a: 'p → q', b: '¬q → ¬p' },
  { name: '역', a: 'p → q', b: 'q → p' },
  { name: '함의 풀기', a: 'p → q', b: '¬p ∨ q' },
  { name: '분배 법칙', a: 'p ∧ (q ∨ r)', b: '(p ∧ q) ∨ (p ∧ r)' },
  { name: '흔한 실수', a: '¬(p ∧ q)', b: '¬p ∧ ¬q' },
];
const KEYS = ['¬', '∧', '∨', '→', '↔', '(', ')', 'p', 'q', 'r'];

function FormulaInput({ id, label, value, onChange, onFocus, inputRef, parsed }: { id: string; label: string; value: string; onChange: (s: string) => void; onFocus: () => void; inputRef: RefObject<HTMLInputElement>; parsed: ReturnType<typeof parse> }) {
  return (
    <div className="ctl">
      <label className="ctl-label" htmlFor={id}>
        <span>{label}</span>
        <span className="val">{parsed.ok ? show(parsed.node) : ''}</span>
      </label>
      <input ref={inputRef} id={id} className="dm-input mono" type="text" value={value} spellCheck={false} autoComplete="off" onFocus={onFocus} onChange={(e) => onChange(e.target.value)} aria-invalid={!parsed.ok || undefined} aria-describedby={`${id}-err`} />
      <span id={`${id}-err`} className="dm-err" aria-live="polite">
        {parsed.ok ? '' : `${parsed.error} (${parsed.at + 1}번째 글자)`}
      </span>
    </div>
  );
}

function TruthTableFigure() {
  const [a, setA] = useState(PRESETS[0].a);
  const [b, setB] = useState(PRESETS[0].b);
  const [steps, setSteps] = useState(true);
  const [focus, setFocus] = useState<'a' | 'b'>('a');
  const refA = useRef<HTMLInputElement>(null);
  const refB = useRef<HTMLInputElement>(null);
  const pa = useMemo(() => parse(a), [a]);
  const pb = useMemo(() => parse(b), [b]);

  const insert = (sym: string) => {
    const ref = focus === 'a' ? refA : refB;
    const cur = focus === 'a' ? a : b;
    const set = focus === 'a' ? setA : setB;
    const el = ref.current;
    const s = el?.selectionStart ?? cur.length;
    const e = el?.selectionEnd ?? cur.length;
    const pad = /[∧∨→↔]/.test(sym) ? ` ${sym} ` : sym;
    const next = cur.slice(0, s) + pad + cur.slice(e);
    set(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(s + pad.length, s + pad.length);
    });
  };

  const table = useMemo(() => {
    if (!pa.ok) return null;
    const used = new Set<Var>([...varsOf(pa.node), ...(pb.ok ? varsOf(pb.node) : [])]);
    const vars = VARS.filter((v) => used.has(v));
    if (!vars.length) vars.push('p');
    const subs = steps ? subformulas(pa.node).filter((n) => show(n) !== show(pa.node)) : [];
    const envs = rows(vars);
    const body = envs.map((env: Env) => ({
      env,
      subs: subs.map((n) => evaluate(n, env)),
      A: evaluate(pa.node, env),
      B: pb.ok ? evaluate(pb.node, env) : null,
    }));
    return { vars, subs, body };
  }, [pa, pb, steps]);

  const diff = table && pb.ok ? table.body.filter((r) => r.A !== r.B).length : 0;
  const allA = table ? table.body.every((r) => r.A) : false;
  const noneA = table ? table.body.every((r) => !r.A) : false;
  const kind = allA ? '항진명제 (모든 행이 참)' : noneA ? '모순 (모든 행이 거짓)' : '경우에 따라 참';

  return (
    <Figure
      no={2}
      title="진리표 만들기와 동치 확인"
      hint="식을 고치거나 예시를 골라 보세요"
      caption={<>식 A와 식 B에 쓰인 p, q, r의 참·거짓을 모든 조합으로 넣어 계산합니다. 변수가 k개면 행은 2<sup>k</sup>개입니다. 두 식의 열이 모든 행에서 같으면 두 식은 <strong>동치</strong>이고, 한 행이라도 다르면 그 행이 반례입니다. ! & | -&gt; &lt;-&gt; 같은 키보드 기호로 입력해도 됩니다.</>}
    >
      <div className="dm-presets btn-row" role="group" aria-label="예시 식">
        {PRESETS.map((pr) => (
          <Button
            key={pr.name}
            small
            onClick={() => {
              setA(pr.a);
              setB(pr.b);
            }}
          >
            {pr.name}
          </Button>
        ))}
      </div>
      <div className="dm-two">
        <FormulaInput id="tt-a" label="식 A" value={a} onChange={setA} onFocus={() => setFocus('a')} inputRef={refA} parsed={pa} />
        <FormulaInput id="tt-b" label="식 B" value={b} onChange={setB} onFocus={() => setFocus('b')} inputRef={refB} parsed={pb} />
      </div>
      <div className="dm-keys" role="group" aria-label={`기호 넣기 (식 ${focus === 'a' ? 'A' : 'B'}에)`}>
        {KEYS.map((k) => (
          <button key={k} type="button" className="dm-key mono" onClick={() => insert(k)} aria-label={`${k} 넣기`}>
            {k}
          </button>
        ))}
        <span className="dm-keys-to">→ 식 {focus === 'a' ? 'A' : 'B'}</span>
      </div>
      {table && (
        <div className="dm-scroll">
          <table className="dm-tt" aria-label="진리표">
            <thead>
              <tr>
                {table.vars.map((v) => (
                  <th key={v} className="var">
                    {v}
                  </th>
                ))}
                {table.subs.map((n, k) => (
                  <th key={k} className="sub">
                    {show(n)}
                  </th>
                ))}
                <th className="fa">A: {show((pa as { node: Node }).node)}</th>
                {pb.ok && <th className="fb">B: {show(pb.node)}</th>}
                {pb.ok && <th>A = B?</th>}
              </tr>
            </thead>
            <tbody>
              {table.body.map((r, k) => (
                <tr key={k} data-diff={pb.ok && r.A !== r.B ? '' : undefined}>
                  {table.vars.map((v) => (
                    <td key={v} className="var">
                      <TV v={r.env[v]} short />
                    </td>
                  ))}
                  {r.subs.map((x, j) => (
                    <td key={j} className="sub">
                      <TV v={x} short />
                    </td>
                  ))}
                  <td className="fa">
                    <TV v={r.A} short />
                  </td>
                  {pb.ok && (
                    <td className="fb">
                      <TV v={r.B as boolean} short />
                    </td>
                  )}
                  {pb.ok && <td className="eq">{r.A === r.B ? '같음' : '다름'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="controls row">
        <Check label="중간 단계 열 보기" checked={steps} onChange={setSteps} />
      </div>
      <div className="readouts dm-readouts-text" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <Readout label="행 수" value={table ? `${table.body.length}행` : '–'} />
        <Readout label="식 A의 종류" value={table ? kind : '–'} />
        <Readout label="A와 B" value={!table || !pb.ok ? '–' : diff === 0 ? '동치 (A ≡ B)' : `동치 아님 (${diff}행 다름)`} color={!table || !pb.ok ? undefined : diff === 0 ? 'var(--good)' : 'var(--bad)'} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: ∀ and ∃ over a box of shapes ─────────────── */

type Item = { red: boolean; circle: boolean };
const START: Item[] = [
  { red: true, circle: true },
  { red: false, circle: false },
  { red: true, circle: true },
  { red: false, circle: true },
  { red: true, circle: false },
  { red: false, circle: false },
  { red: true, circle: true },
  { red: false, circle: true },
  { red: false, circle: false },
  { red: true, circle: true },
  { red: false, circle: true },
  { red: false, circle: false },
];
type Pred = 'red' | 'circle' | 'imp' | 'and';
const PREDS: Record<Pred, { label: string; tex: string; code: string; f: (x: Item) => boolean }> = {
  red: { label: '빨강', tex: 'R(x)', code: 'x.red', f: (x) => x.red },
  circle: { label: '원', tex: 'C(x)', code: 'x.circle', f: (x) => x.circle },
  imp: { label: '빨강 → 원', tex: 'R(x) \\to C(x)', code: '!x.red || x.circle', f: (x) => !x.red || x.circle },
  and: { label: '빨강 ∧ 원', tex: 'R(x) \\land C(x)', code: 'x.red && x.circle', f: (x) => x.red && x.circle },
};
const next = (x: Item): Item => (x.red && x.circle ? { red: true, circle: false } : x.red ? { red: false, circle: true } : x.circle ? { red: false, circle: false } : { red: true, circle: true });

function QuantFigure() {
  const [items, setItems] = useState<Item[]>(START);
  const [pred, setPred] = useState<Pred>('imp');
  const [empty, setEmpty] = useState(false);
  const P = PREDS[pred];
  const box = empty ? [] : items;
  const vals = box.map(P.f);
  const all = vals.every(Boolean);
  const some = vals.some(Boolean);
  const counter = vals.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  const witness = vals.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const name = (i: number) => `x${i + 1}`;

  return (
    <Figure
      no={3}
      title="모든 x에 대해, 어떤 x가 존재해서"
      hint="도형을 눌러 모양과 색을 바꿔 보세요"
      caption={<>상자 안의 도형 12개가 정의역입니다. 술어 P(x)가 참인 도형은 실선 테두리, 거짓인 도형은 점선 테두리와 ✕ 표시입니다. ∀x P(x)를 거짓으로 만드는 데는 점선 도형 하나(반례)면 충분하고, ∃x P(x)를 참으로 만드는 데는 실선 도형 하나(증거)면 충분합니다. 도형을 누를 때마다 빨간 원 → 빨간 네모 → 파란 원 → 파란 네모 순서로 바뀝니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="dm-sentence">
            <span>P(x) =</span>
            <M>{P.tex}</M>
          </div>
          <div className="dm-shapes" role="group" aria-label="상자 안의 도형">
            {items.map((x, i) => {
              const v = P.f(x);
              return (
                <button key={i} type="button" className="dm-shape" data-v={v ? 't' : 'f'} data-off={empty || undefined} disabled={empty} onClick={() => setItems(items.map((y, j) => (j === i ? next(y) : y)))} aria-label={`${name(i)}: ${x.red ? '빨간' : '파란'} ${x.circle ? '원' : '네모'}, P(x)는 ${v ? '참' : '거짓'}`}>
                  <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
                    {x.circle ? <circle cx="20" cy="20" r="14" style={{ fill: x.red ? 'var(--c-math-1)' : 'var(--c-math-2)' }} /> : <rect x="7" y="7" width="26" height="26" style={{ fill: x.red ? 'var(--c-math-1)' : 'var(--c-math-2)' }} />}
                  </svg>
                  <span className="dm-shape-name mono">{name(i)}</span>
                  {!v && !empty && (
                    <span className="dm-shape-x" aria-hidden="true">
                      ✕
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <Legend
            items={[
              { color: 'var(--c-math-1)', label: '빨강 R', shape: 'sq' },
              { color: 'var(--c-math-2)', label: '파랑', shape: 'sq' },
            ]}
          />
        </div>
        <div className="controls">
          <Seg label="술어 P(x)" value={pred} onChange={setPred} options={(Object.keys(PREDS) as Pred[]).map((k) => ({ value: k, label: PREDS[k].label }))} />
          <Check label="상자를 비운다 (원소 0개)" checked={empty} onChange={setEmpty} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="∀x P(x)" value={<TV v={all} />} />
            <Readout label="∃x P(x)" value={<TV v={some} />} />
          </div>
          <div className="dm-note" aria-live="polite">
            {empty ? (
              <>원소가 없으면 반례도 없으므로 ∀x P(x)는 참, 증거도 없으므로 ∃x P(x)는 거짓입니다.</>
            ) : all ? (
              <>반례가 없습니다. 모든 도형이 P를 만족하므로 ∀x P(x)는 참입니다.</>
            ) : (
              <>
                반례 {counter.length}개: <span className="mono">{counter.map(name).join(', ')}</span>. 하나만 있어도 ∀x P(x)는 거짓입니다.
              </>
            )}{' '}
            {!empty && (some ? <>증거 {witness.length}개가 있어 ∃x P(x)는 참입니다.</> : <>증거가 하나도 없어 ∃x P(x)는 거짓입니다.</>)}
          </div>
          <div className="dm-codeline mono">
            items.every(x =&gt; {P.code}) // {String(all)}
            <br />
            items.some(x =&gt; {P.code}) // {String(some)}
          </div>
          <div className="btn-row">
            <Button small onClick={() => setItems(START)}>
              처음 배치로
            </Button>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Logic() {
  return (
    <>
      <h2>참인지 거짓인지 분명한 문장</h2>
      <p>
        <T en="proposition">명제</T>는 참인지 거짓인지가 분명하게 정해지는 문장입니다. "7은 소수다"는 참인 명제이고, "서울은 부산보다 남쪽에 있다"는 거짓인 명제입니다. "이 노래 좋다"는 사람마다 답이 달라서 명제가 아니고, "x는 3보다 크다"도 x가 무엇인지 정하기 전에는 참·거짓을 말할 수 없어서 아직 명제가 아닙니다.
      </p>
      <p>
        프로그래머는 매일 명제를 다룹니다. <code>user.age &gt;= 19</code>, <code>cart.length === 0</code>, <code>isAdmin</code>은 실행되는 순간 모두 참이나 거짓 하나로 정해지는 식입니다. 이 장에서 배우는 규칙은 그대로 <code>if</code> 문, 검색 필터, SQL의 <code>WHERE</code> 절, 회로의 논리 게이트에 쓰입니다.
      </p>

      <h2>논리 연산자 다섯 개</h2>
      <p>
        명제를 p, q 같은 글자로 쓰고, 이것들을 <T en="logical connective">논리 연산자</T>로 이어 더 큰 명제를 만듭니다. 각 연산자의 뜻은 입력이 참(T)·거짓(F)일 때 결과가 무엇인지 적은 표, 즉 <T en="truth table">진리표</T>로 완전히 정해집니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl dm-ops">
          <thead>
            <tr>
              <th>기호</th>
              <th>읽는 법</th>
              <th>참이 되는 때</th>
              <th>코드에서</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <M>{'\\neg p'}</M>
              </td>
              <td>p가 아니다 (부정)</td>
              <td>p가 거짓일 때</td>
              <td className="mono">!p</td>
            </tr>
            <tr>
              <td>
                <M>{'p \\land q'}</M>
              </td>
              <td>p 그리고 q (논리곱)</td>
              <td>둘 다 참일 때만</td>
              <td className="mono">p &amp;&amp; q</td>
            </tr>
            <tr>
              <td>
                <M>{'p \\lor q'}</M>
              </td>
              <td>p 또는 q (논리합)</td>
              <td>적어도 하나가 참일 때</td>
              <td className="mono">p || q</td>
            </tr>
            <tr>
              <td>
                <M>{'p \\to q'}</M>
              </td>
              <td>p이면 q (함의)</td>
              <td>p가 참인데 q가 거짓인 경우만 빼고 모두</td>
              <td className="mono">!p || q</td>
            </tr>
            <tr>
              <td>
                <M>{'p \\leftrightarrow q'}</M>
              </td>
              <td>p일 때 그리고 그때만 q (동치)</td>
              <td>둘의 참·거짓이 같을 때</td>
              <td className="mono">p === q</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        일상어의 "또는"은 둘 중 하나만이라는 뜻일 때가 많습니다("커피 또는 차를 드립니다"). 논리의 <M>{'\\lor'}</M>는 둘 다 참이어도 참입니다. 하나만 참일 때 참인 연산은 따로 <T en="exclusive or">배타적 논리합</T> XOR이라고 부르고 <M>{'p \\oplus q'}</M>로 씁니다.
      </p>

      <h2>"이면"이 거짓이 되는 단 하나의 경우</h2>
      <p>
        다섯 연산자 중 처음 보는 사람을 가장 당황하게 하는 것은 <T en="implication">함의</T> <M>{'p \\to q'}</M>입니다. p를 <T en="hypothesis">가정</T>, q를 <T en="conclusion">결론</T>이라고 부릅니다. "비가 오면 우산을 쓴다"를 하나의 약속으로 생각해 보세요. 이 약속을 어긴 것은 비가 왔는데 우산을 쓰지 않은 경우뿐입니다. 비가 오지 않은 날에는 우산을 쓰든 말든 약속을 어긴 것이 아닙니다.
      </p>
      <FourCasesFigure />
      <p>
        그림 1에서 "대우"를 고르면 거짓이 되는 카드가 원래 명제와 똑같습니다. <M>{'p \\to q'}</M>와 그 <T en="contrapositive">대우</T> <M>{'\\neg q \\to \\neg p'}</M>는 네 상황 모두에서 참·거짓이 같으므로 같은 말입니다. 반면 <T en="converse">역</T> <M>{'q \\to p'}</M>는 "우산을 썼는데 비가 오지 않은" 카드에서 거짓이 되어, 원래 명제와 다른 말입니다.
      </p>
      <Callout kind="warn">
        "p이면 q"가 참이라고 해서 역 "q이면 p"가 참인 것은 아닙니다. "로그인한 사용자라면 쿠키가 있다"가 참이어도 "쿠키가 있으면 로그인한 사용자다"는 거짓일 수 있습니다. 광고 추적 쿠키도 있으니까요. 역을 원래 명제처럼 쓰는 것은 일상에서도 코드 리뷰에서도 가장 흔한 논리 실수입니다.
      </Callout>
      <p>
        가정이 거짓일 때 함의가 참이 되는 것을 <T en="vacuous truth">공허한 참</T>이라고 부릅니다. 이상해 보이지만 덕분에 "모든 x에 대해, x가 짝수이면 x²도 짝수다" 같은 문장을 홀수 x에서도 문제없이 참으로 다룰 수 있습니다. 홀수는 가정을 만족하지 않으니 이 약속의 대상이 아닐 뿐입니다.
      </p>

      <h2>진리표와 동치</h2>
      <p>
        두 식이 모든 경우에 같은 값을 내면 <T en="logically equivalent">논리적으로 동치</T>라고 하고 <M>{'A \\equiv B'}</M>로 씁니다. 동치는 계산으로 확인할 수 있습니다. 변수가 k개면 경우는 <M>{'2^k'}</M>개뿐이니, 진리표를 만들어 모든 행을 비교하면 됩니다. 컴퓨터는 이 일을 쉽게 합니다. 변수 20개짜리 식이라도 백만 행 정도입니다.
      </p>
      <TruthTableFigure />
      <p>그림 2의 예시들 가운데 가장 자주 쓰는 동치 세 가지는 이름을 외워 둘 만합니다.</p>
      <MB note="드모르간 법칙: 부정을 괄호 안으로 넣으면 ∧와 ∨가 서로 바뀝니다.">{'\\neg(p \\land q) \\equiv \\neg p \\lor \\neg q \\qquad \\neg(p \\lor q) \\equiv \\neg p \\land \\neg q'}</MB>
      <MB note="함의는 '아니다'와 '또는'으로 풀 수 있고, 대우와 같습니다.">{'p \\to q \\;\\equiv\\; \\neg p \\lor q \\;\\equiv\\; \\neg q \\to \\neg p'}</MB>
      <p>
        "흔한 실수"를 눌러 보세요. <M>{'\\neg(p \\land q)'}</M>를 <M>{'\\neg p \\land \\neg q'}</M>로 바꾸는 것은 틀렸고, 진리표는 정확히 어느 행에서 틀리는지(p와 q 중 하나만 참일 때) 보여 줍니다. 모든 행이 참인 식은 <T en="tautology">항진명제</T>, 모든 행이 거짓인 식은 <T en="contradiction">모순</T>이라고 합니다. 식 A에 <code>p ∨ ¬p</code>나 <code>p ∧ ¬p</code>를 넣어 확인해 보세요.
      </p>
      <Callout kind="intuition">
        진리표 대조는 증명이 아니라 확인처럼 보이지만, 경우가 유한하면 모든 경우를 확인하는 것이 곧 증명입니다. 다음 장에서 볼 증명 기법들은 경우가 무한히 많아서 하나하나 확인할 수 없을 때 쓰는 도구입니다.
      </Callout>

      <h2>코드 속의 논리</h2>
      <p>
        드모르간 법칙은 조건문을 읽기 쉽게 고칠 때 바로 씁니다. 그리고 JavaScript를 포함한 대부분의 언어는 <code>&amp;&amp;</code>와 <code>||</code>를 <T en="short-circuit evaluation">단락 평가</T>합니다. 왼쪽만 보고 결과가 정해지면 오른쪽은 계산하지 않습니다. <M>{'F \\land q'}</M>는 q와 상관없이 거짓이고 <M>{'T \\lor q'}</M>는 q와 상관없이 참이기 때문입니다.
      </p>
      <Code label="조건문에 쓰이는 논리 법칙">{`
// 드모르간: 두 조건은 같은 뜻이다
if (!(isMember && hasCoupon)) showFullPrice();
if (!isMember || !hasCoupon) showFullPrice();

// 단락 평가: user가 null이면 오른쪽은 실행되지 않아 오류가 나지 않는다
if (user && user.isAdmin) openDashboard();

// 함의 p → q는 !p || q
// "유료 플랜이면 결제 수단이 있어야 한다"를 검사
const valid = !account.paid || account.card != null;

// 대우로 바꿔 쓴 같은 검사: 결제 수단이 없으면 유료가 아니어야 한다
const same = account.card != null || !account.paid;`}</Code>
      <p>
        조건문과 반복문을 처음 배운다면 <a href={lessonHref('cs-programming', 'control-flow')}>조건과 반복</a>을, 이 연산자들이 트랜지스터로 어떻게 만들어지는지는 <a href={lessonHref('cs-architecture', 'logic-gates')}>논리 게이트와 덧셈기</a>를 보세요. 진리표의 각 행은 회로 입력선에 전압을 거는 한 가지 방법과 같습니다.
      </p>

      <h2>모든, 그리고 어떤: 한정자</h2>
      <p>
        "x는 3보다 크다"처럼 변수가 들어 있어 아직 참·거짓이 정해지지 않은 문장을 <T en="predicate">술어</T>라고 하고 P(x)처럼 씁니다. 술어를 명제로 만드는 방법은 두 가지입니다. x에 값을 넣거나, x가 어느 범위를 도는지 말하는 <T en="quantifier">한정자</T>를 붙이는 것입니다.
      </p>
      <ul>
        <li>
          <M>{'\\forall x\\, P(x)'}</M>: 모든 x에 대해 P(x)가 참이다. <M>{'\\forall'}</M>는 <T en="universal quantifier">전칭 한정자</T>이고 "for All"의 A를 뒤집은 모양입니다.
        </li>
        <li>
          <M>{'\\exists x\\, P(x)'}</M>: P(x)가 참인 x가 적어도 하나 있다. <M>{'\\exists'}</M>는 <T en="existential quantifier">존재 한정자</T>이고 "there Exists"의 E를 뒤집은 모양입니다.
        </li>
      </ul>
      <p>x가 도는 범위를 <T en="domain">정의역</T>이라고 합니다. 그림 3에서는 상자 안의 도형 12개가 정의역입니다.</p>
      <QuantFigure />
      <p>
        그림 3의 술어 "빨강 → 원"은 "빨간 도형은 모두 원이다"라는 뜻입니다. 빨간 네모가 하나라도 있으면 그것이 반례가 되어 ∀가 거짓이 됩니다. 반례를 원으로 바꿔 ∀를 참으로 만들어 보고, 파란 도형은 무엇이든 상관없다는 것도 확인해 보세요. 함의의 가정이 거짓이라 공허하게 참이기 때문입니다.
      </p>
      <p>한정자를 부정하면 종류가 바뀝니다. "모두가 그렇다"의 부정은 "그렇지 않은 것이 하나는 있다"입니다. 드모르간 법칙을 무한히 많은 ∧, ∨로 늘린 것이라고 볼 수 있습니다.</p>
      <MB note="반례 하나가 '모든'을 무너뜨리고, 증거 하나가 '어떤'을 세웁니다.">{'\\neg\\,\\forall x\\, P(x) \\equiv \\exists x\\, \\neg P(x) \\qquad \\neg\\,\\exists x\\, P(x) \\equiv \\forall x\\, \\neg P(x)'}</MB>
      <Callout kind="note">
        JavaScript의 <code>every</code>는 ∀, <code>some</code>은 ∃입니다. 그림 3에서 "상자를 비운다"를 켜면 보듯이 <code>[].every(f)</code>는 언제나 <code>true</code>, <code>[].some(f)</code>는 언제나 <code>false</code>입니다. 빈 배열에는 반례가 없기 때문입니다. "모든 항목이 검증을 통과했나?"를 <code>every</code>로 검사할 때 배열이 비어 있으면 통과로 처리된다는 점을 기억하세요.
      </Callout>
      <p>
        한정자가 둘 이상이면 순서가 중요합니다. 정의역이 사람일 때 <M>{'\\forall x\\, \\exists y\\; \\text{Loves}(x, y)'}</M>는 "누구에게나 사랑하는 사람이 있다"이고, <M>{'\\exists y\\, \\forall x\\; \\text{Loves}(x, y)'}</M>는 "모두에게 사랑받는 한 사람이 있다"입니다. 앞의 것은 사람마다 다른 y를 골라도 되지만, 뒤의 것은 y 하나를 먼저 정해야 합니다. 코드로 쓰면 바깥 반복문과 안쪽 반복문의 차이입니다.
      </p>
      <p>
        데이터베이스의 <code>WHERE</code> 절도 술어입니다. <code>WHERE age &gt;= 19 AND NOT banned</code>는 각 행에 대해 참·거짓을 계산해 참인 행만 남깁니다. <a href={lessonHref('cs-databases', 'relational-sql')}>관계형 모델과 SQL</a>에서 이 생각을 이어 갑니다.
      </p>

      <Callout kind="key">
        명제는 참·거짓이 정해진 문장이고, ¬, ∧, ∨, →, ↔로 묶어 더 큰 명제를 만듭니다. 함의 p → q는 p가 참이고 q가 거짓일 때만 거짓이며, 대우 ¬q → ¬p와 동치이지만 역 q → p와는 다릅니다. 두 식의 동치는 진리표의 모든 행을 비교해 확인합니다. ∀의 부정은 ∃¬이고, ∃의 부정은 ∀¬입니다.
      </Callout>
      <Quiz
        q={<>"테스트를 모두 통과하면 배포한다"가 참이라고 하자. 다음 중 반드시 참인 것은?</>}
        options={['배포했다면 테스트를 모두 통과한 것이다', '테스트를 하나라도 통과하지 못했다면 배포하지 않는다', '배포하지 않았다면 통과하지 못한 테스트가 있다', '배포하지 않았다면 테스트를 모두 통과하지 못한 것이다']}
        answer={2}
        explain={<>p = "테스트를 모두 통과", q = "배포"라 하면 원래 명제는 p → q이고, 반드시 참인 것은 대우 ¬q → ¬p입니다. ¬q는 "배포하지 않았다", ¬p는 "모두 통과한 것은 아니다", 즉 "통과하지 못한 테스트가 있다"입니다. ①은 역, ②는 이라서 원래 명제가 참이어도 거짓일 수 있습니다. ④는 ¬p를 "하나도 통과 못 함"으로 잘못 부정했습니다. "모두 통과"의 부정은 "하나라도 실패"입니다.</>}
      />
    </>
  );
}
