import { useMemo, useState } from 'react';
import { Callout, Code, Figure, M, MB, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { LangError, lineCol, parseExpr, type Expr, type Node } from './lang';
import { TreeView, astTree, type TNode } from './TreeView';
import { ARGS, BOOL, GENERICS, NUM, STR, apply, checkExpr, fnT, generalNames, infer, instantiate, showGeneric, showTy, type Ty } from './types';
import './languages.css';

/** Parse an expression, keeping the last good one while the reader is typing. */
function useParsed(src: string) {
  const [last, setLast] = useState<Expr | null>(null);
  const r = useMemo(() => {
    try {
      return { e: parseExpr(src), err: null as { msg: string; pos: number } | null };
    } catch (x) {
      if (x instanceof LangError) return { e: null, err: { msg: x.message, pos: x.pos } };
      throw x;
    }
  }, [src]);
  if (r.e && r.e !== last) setLast(r.e);
  return { e: r.e ?? last, err: r.err };
}

function ExprInput({ id, value, onChange, presets, label }: { id: string; value: string; onChange: (s: string) => void; presets: { src: string; tag: string }[]; label: string }) {
  return (
    <div className="pl-col">
      <div className="ctl">
        <label className="ctl-label" htmlFor={id}>
          <span>{label}</span>
        </label>
        <input id={id} className="pl-input" type="text" value={value} spellCheck={false} autoComplete="off" autoCapitalize="off" onChange={(e) => onChange(e.target.value)} />
      </div>
      <div className="ty-presets" role="group" aria-label="예제 식">
        {presets.map((p) => (
          <button key={p.src} type="button" className="ty-preset" aria-pressed={p.src === value} onClick={() => onChange(p.src)}>
            <code>{p.src}</code>
            <small>{p.tag}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function ParseErr({ src, err }: { src: string; err: { msg: string; pos: number } | null }) {
  if (!err) return null;
  const { col } = lineCol(src, err.pos);
  return (
    <div className="pl-err" role="alert">
      {col}번째 글자 근처: {err.msg} (아래 그림은 마지막으로 읽을 수 있었던 식입니다)
    </div>
  );
}

/* ─────────────── Figure 1: checking a tree bottom-up ─────────────── */

const GAMMA: [string, Ty][] = [
  ['add', fnT([NUM, NUM], NUM)],
  ['isEven', fnT([NUM], BOOL)],
  ['len', fnT([STR], NUM)],
  ['price', NUM],
  ['name', STR],
];
const GAMMA_MAP = new Map(GAMMA);

const CHECK_PRESETS = [
  { src: 'add(2, 3) * 4 > 10 ? "큰 수" : "작은 수"', tag: '통과' },
  { src: 'isEven(len(name)) ? 1 : "하나"', tag: '갈래 불일치' },
  { src: 'add(price, true)', tag: '인자 타입' },
  { src: 'price * "2"', tag: 'JS는 9000' },
  { src: '((x: number) => x * 2)(add(1, 2))', tag: '함수 값' },
  { src: 'len(price) + 1', tag: '인자 타입' },
];

function CheckFigure() {
  const [src, setSrc] = useState(CHECK_PRESETS[0].src);
  const { e, err } = useParsed(src);
  const run = useMemo(() => (e ? checkExpr(e, GAMMA_MAP) : null), [e]);
  const total = run ? run.steps.length + 1 : 1;
  const s = useStepper(total, 3, run, true);
  if (!e || !run) {
    return (
      <Figure no={1} title="식마다 타입 매기기">
        <ExprInput id="ty-check-src" value={src} onChange={setSrc} presets={CHECK_PRESETS} label="식" />
        <ParseErr src={src} err={err} />
      </Figure>
    );
  }
  const shown = run.steps.slice(0, s.i);
  const cur = s.i > 0 ? run.steps[s.i - 1] : null;
  const typed = new Map<number, Ty>();
  let bad: number | null = null;
  for (const st of shown) {
    if (st.error) bad = st.node;
    else if (st.ty) typed.set(st.node, st.ty);
  }
  const deco = (n: Node): Partial<TNode> => {
    const t = typed.get(n.id);
    if (bad === n.id) return { mark: 'bad', sub: '✗ 오류', subTone: 'bad' };
    if (t) return { mark: cur?.node === n.id ? 'on' : 'done', sub: showTy(t), subTone: 'ok' };
    return { mark: undefined };
  };
  const tree = astTree(e, deco);
  const finished = s.i === total - 1;
  const rootTy = run.ok ? run.types.get(e.id) : undefined;

  return (
    <Figure
      no={1}
      title="식마다 타입 매기기"
      hint="재생하거나 식을 고쳐 보세요"
      caption={<>검사기는 구문 트리를 잎(숫자, 이름)에서 뿌리 쪽으로 올라가며 노드마다 타입을 정합니다. 노란 상자가 지금 타입을 정하는 노드, 초록 글자가 정해진 타입입니다. 이름의 타입은 아래 환경 Γ에서 찾습니다. 규칙에 맞지 않는 노드를 만나면 빨갛게 표시하고 멈춥니다. 프로그램을 한 번도 실행하지 않았다는 점에 주목하세요.</>}
    >
      <ExprInput id="ty-check-src" value={src} onChange={setSrc} presets={CHECK_PRESETS} label="식 (이름은 아래 Γ에 있는 것만 쓸 수 있습니다)" />
      <ParseErr src={src} err={err} />
      <TreeView root={tree} label={`${src}의 구문 트리와 타입. ${finished ? (run.ok ? `식 전체의 타입은 ${showTy(rootTy!)}` : '타입 오류') : `${s.i}단계`}`} />
      <div className="fig-split">
        <div className="pl-col">
          <div className="pl-note" aria-live="polite">
            {s.i === 0 ? (
              '아직 아무 노드에도 타입이 없습니다. ▶을 눌러 잎부터 타입을 매겨 보세요.'
            ) : cur?.error ? (
              <>
                <strong className="bad">타입 오류.</strong> {cur.error}
              </>
            ) : finished ? (
              <>
                모든 노드에 타입이 붙었습니다. 식 전체의 타입은 <strong className="pl-good mono">{showTy(rootTy!)}</strong>입니다. 이 식은 실행해도 타입 때문에 실패하지 않습니다.
              </>
            ) : (
              cur?.rule
            )}
          </div>
          <div className="ty-gamma" aria-label="환경 감마">
            <span className="pl-label">환경 Γ (미리 알려 준 이름의 타입)</span>
            <div className="pl-chips">
              {GAMMA.map(([k, t]) => (
                <span key={k} className="pl-chip">
                  {k}: {showTy(t)}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="ty-check-speed" maxSpeed={10} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="타입을 정한 노드" value={`${typed.size}개`} />
            <Readout label="결과" value={!finished ? '검사 중' : run.ok ? showTy(rootTy!) : '오류'} color={!finished ? undefined : run.ok ? 'var(--good)' : 'var(--bad)'} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: inference by constraints and unification ─────────────── */

const INFER_PRESETS = [
  { src: '(x) => x + 1', tag: '숫자 함수' },
  { src: '(x, y) => x > y ? x : y', tag: '최댓값' },
  { src: '(x) => x', tag: '항등 함수' },
  { src: '(f) => (x) => f(f(x))', tag: '두 번 적용' },
  { src: '(f, g) => (x) => f(g(x))', tag: '합성' },
  { src: '(f) => f(1) + f(true)', tag: '오류' },
  { src: '(x) => x(x)', tag: '무한 타입' },
];

function InferFigure() {
  const [src, setSrc] = useState(INFER_PRESETS[3].src);
  const { e, err } = useParsed(src);
  const run = useMemo(() => (e ? infer(e) : null), [e]);
  const s = useStepper(run ? run.steps.length : 1, 2, run, false);
  if (!e || !run) {
    return (
      <Figure no={2} title="타입 추론: 제약을 모아 풀기">
        <ExprInput id="ty-inf-src" value={src} onChange={setSrc} presets={INFER_PRESETS} label="식" />
        <ParseErr src={src} err={err} />
      </Figure>
    );
  }
  const st = run.steps[s.i];
  const sub = run.substAt[s.i];
  const curC = st.cur >= 0 ? run.constraints[st.cur] : null;
  const gnames = st.phase === 'done' ? generalNames(apply(sub, { k: 'var', id: run.nodeVar.get(e.id)! })) : undefined;
  const showT = (id: number): { text: string; tone: TNode['subTone'] } => {
    const t = apply(sub, { k: 'var', id });
    const text = showTy(t, gnames);
    return { text: st.phase === 'vars' || st.phase === 'gen' ? `t${id}` : text, tone: /t\d/.test(text) || st.phase === 'vars' || st.phase === 'gen' ? 'var' : 'ok' };
  };
  const deco = (n: Node): Partial<TNode> => {
    const id = run.nodeVar.get(n.id)!;
    const { text, tone } = showT(id);
    const on = curC?.node === n.id;
    return { sub: text, subTone: st.error && on ? 'bad' : tone, mark: on ? (st.error ? 'bad' : 'on') : undefined };
  };
  const tree = astTree(e, deco);
  const newIds = new Set(st.newIds ?? []);

  return (
    <Figure
      no={2}
      title="타입 추론: 제약을 모아 풀기"
      hint="한 단계씩 넘기며 제약 목록과 대입표를 보세요"
      caption={<>타입을 하나도 적지 않은 식입니다. 먼저 모든 노드에 모르는 타입 t1, t2, …를 붙이고, 노드마다 규칙이 요구하는 등식(제약)을 적습니다. 그다음 제약을 하나씩 풀며 "t3은 number"처럼 알게 된 것을 대입표에 쌓습니다. 트리 아래 글자는 지금까지의 대입표를 적용한 각 노드의 타입이고, 보라색은 아직 모르는 부분이 남은 타입입니다. 끝까지 정해지지 않은 변수는 제네릭 타입 A, B, C가 됩니다.</>}
    >
      <ExprInput id="ty-inf-src" value={src} onChange={setSrc} presets={INFER_PRESETS} label="식 (타입을 적지 않습니다)" />
      <ParseErr src={src} err={err} />
      <TreeView root={tree} label={`${src}의 구문 트리. 노드마다 추론 중인 타입이 붙어 있습니다.`} />
      <div className="pl-note" aria-live="polite">
        <strong>{s.i + 1}단계.</strong> {st.error ? <strong className="bad">{st.note}</strong> : st.note}
        {st.phase === 'done' && run.result && (
          <>
            {' '}
            결과: <strong className="pl-good mono">{run.result}</strong>
          </>
        )}
      </div>
      <div className="fig-split">
        <div className="pl-col">
          <div className="ty-cons" aria-label="제약 목록">
            <span className="pl-label">제약 {run.constraints.length}개 {run.paramVars.length > 0 && `· 매개변수 ${run.paramVars.map((p) => `${p.name}: t${p.id}`).join(', ')}`}</span>
            {st.phase === 'vars' ? (
              <div className="pl-label">다음 단계에서 노드마다 제약을 적습니다.</div>
            ) : (
              <ol>
                {run.constraints.map((c, i) => {
                  const state = st.phase === 'gen' ? 'todo' : i < st.cur || st.phase === 'done' ? 'done' : i === st.cur ? (st.error ? 'bad' : 'cur') : 'todo';
                  return (
                    <li key={i} data-s={state}>
                      <span className="mono">
                        {showTy(c.a)} = {showTy(c.b)}
                      </span>
                      <small>{c.why}</small>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="ty-inf-speed" maxSpeed={10} />
          <div className="ty-subst" aria-label="대입표">
            <span className="pl-label">대입표 (알게 된 것)</span>
            <div className="pl-chips">
              {st.subst.length === 0 && <span className="pl-label">(비어 있음)</span>}
              {st.subst.map(([id, t]) => (
                <span key={id} className="pl-chip" data-on={newIds.has(id) || undefined}>
                  t{id} := {showTy(t)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: instantiating a generic function ─────────────── */

function GenericFigure() {
  const [gid, setGid] = useState('map');
  const g = GENERICS.find((x) => x.id === gid)!;
  const [picks, setPicks] = useState<Record<string, string[]>>({ identity: ['n'], first: ['strs'], map: ['nums', 'big'], filter: ['strs', 'big'] });
  const chosen = picks[gid].map((id) => ARGS.find((a) => a.id === id)!);
  const run = useMemo(() => instantiate(g, chosen), [g, chosen]);
  const last = run.steps[run.steps.length - 1];
  const setPick = (i: number, id: string) => setPicks((p) => ({ ...p, [gid]: p[gid].map((x, j) => (j === i ? id : x)) }));
  const callText = `${g.name}(${chosen.map((a) => a.code).join(', ')})`;

  return (
    <Figure
      no={3}
      title="제네릭 함수에 인자 넣어 보기"
      hint="함수를 고르고 인자를 바꿔 보세요"
      caption={<>A와 B는 타입 매개변수입니다. 함수를 부를 때마다 인자의 타입과 매개변수의 타입을 맞춰 보며 A, B가 무엇인지 정하고, 그 결과로 반환 타입이 정해집니다. 한 번 정해진 A는 같은 호출 안에서 바뀔 수 없습니다. 그래서 문자열 배열에 숫자를 받는 함수를 넘기면 오류가 납니다.</>}
    >
      <Seg label="함수" value={gid} onChange={setGid} options={GENERICS.map((x) => ({ value: x.id, label: x.name }))} />
      <div className="ty-sig mono" aria-label="함수의 타입">
        {showGeneric(g)}
      </div>
      <div className="pl-label">{g.note}</div>
      <div className="ty-slots">
        {g.params.map((p, i) => (
          <div key={p.name} className="ctl">
            <label className="ctl-label" htmlFor={`ty-gen-${gid}-${i}`}>
              <span>
                인자 {p.name} <span className="mono">({showTy(p.ty, new Map([[901, 'A'], [902, 'B']]))})</span>
              </span>
            </label>
            <select id={`ty-gen-${gid}-${i}`} className="select mono" value={picks[gid][i]} onChange={(e) => setPick(i, e.target.value)}>
              {ARGS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} : {showTy(a.ty)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <ol className="ty-inst" aria-live="polite">
        {run.steps.map((st, i) => (
          <li key={i} data-ok={st.ok || undefined}>
            {st.why}
            <span className="ty-bound">
              {st.bound.map(([k, v]) => (
                <span key={k} className="pl-chip" data-on={v !== '?' || undefined}>
                  {k} = {v}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
      <div className="readouts" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
        <Readout label="호출" value={callText} />
        <Readout label="결과 타입" value={run.ok ? run.ret : '타입 오류'} color={run.ok ? 'var(--good)' : 'var(--bad)'} />
      </div>
      {run.ok && (
        <div className="pl-label">
          TypeScript로 타입 인자를 직접 적으면 <code>{`${g.name}<${last.bound.map(([, v]) => v).join(', ')}>(…)`}</code>와 같습니다. 보통은 적지 않아도 컴파일러가 이렇게 알아냅니다.
        </div>
      )}
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function TypeSystems() {
  return (
    <>
      <h2>실행하기 전에 잡는 실수</h2>
      <p>
        JavaScript에서 <code>4500 * "2"</code>는 9000이고, <code>4500 + "2"</code>는 "45002"입니다. 문자열 "2"가 어디서 왔는지(입력 칸, 서버 응답, 설정 파일) 생각하면 둘 다 버그일 가능성이 크지만, JavaScript는 실행해 보기 전까지 아무 말도 하지 않고, 실행해도 오류 없이 엉뚱한 값을 냅니다. 값마다 "숫자", "문자열", "함수" 같은 종류가 있고, 이 종류를 <T en="type">타입</T>이라고 합니다(<a href={lessonHref('cs-programming', 'values')}>값과 타입 장</a>에서 <code>typeof</code>로 본 그것입니다).
      </p>
      <p>
        언어는 타입을 언제 따지느냐로 나뉩니다. JavaScript와 Python은 실행 중에 값을 보고 따집니다(<T en="dynamic typing">동적 타입</T>). Java, C, Rust, Go, 그리고 JavaScript에 타입을 얹은 TypeScript는 실행하기 전에 코드만 보고 따집니다(<T en="static typing">정적 타입</T>). 실행 전에 코드를 읽고 타입이 맞는지 확인하는 프로그램이 <T en="type checker">타입 검사기</T>입니다. 2017년에 공개된 한 연구는 GitHub의 JavaScript 프로젝트에서 실제로 고쳐진 버그를 모아 TypeScript와 Flow를 적용해 봤는데, 약 15%를 타입 검사기가 미리 잡을 수 있었다고 보고했습니다.
      </p>

      <h2>타입 규칙</h2>
      <p>
        타입 검사기는 식의 모양마다 정해진 규칙을 적용합니다. 규칙은 보통 "가로선 위의 것들이 성립하면 아래가 성립한다"는 꼴로 씁니다. 여기서 <M>{'\\Gamma'}</M>(감마)는 지금 보이는 이름들의 타입을 적은 표, 즉 <T en="type environment">타입 환경</T>이고, <M>{'\\Gamma \\vdash e : T'}</M>는 "환경 Γ에서 식 e의 타입은 T"라고 읽습니다.
      </p>
      <MB note="왼쪽: 양쪽이 number이면 더한 것도 number. 오른쪽: 조건이 boolean이고 두 갈래가 같은 타입 T이면 전체도 T.">{'\\frac{\\Gamma \\vdash e_1 : \\texttt{number} \\quad \\Gamma \\vdash e_2 : \\texttt{number}}{\\Gamma \\vdash e_1 + e_2 : \\texttt{number}} \\qquad \\frac{\\Gamma \\vdash c : \\texttt{boolean} \\quad \\Gamma \\vdash a : T \\quad \\Gamma \\vdash b : T}{\\Gamma \\vdash c\\ ?\\ a : b \\;:\\; T}'}</MB>
      <p>
        함수 호출의 규칙은 이렇습니다. f의 타입이 <code>(A) =&gt; R</code>이고 인자의 타입이 A이면 호출 결과는 R입니다. 이 몇 개의 규칙을 구문 트리의 잎부터 뿌리까지 적용하면 식 전체의 타입이 나옵니다. 그림 1의 식은 이 과목 전체에서 쓰는 작은 JavaScript 비슷한 언어로 적었습니다. 함수의 매개변수에는 <code>(x: number) =&gt; …</code>처럼 타입을 적습니다.
      </p>
      <CheckFigure />
      <p>
        첫 예제는 <code>add(2, 3)</code>이 number, 거기에 4를 곱해도 number, 10과 비교하면 boolean, 그래서 조건식 전체는 두 갈래의 타입인 string이 됩니다. 두 번째 예제는 조건식의 두 갈래가 number와 string이라 실패합니다. 조건에 따라 결과의 타입이 달라지면 이 값을 받아 쓰는 쪽이 무엇을 기대해야 할지 알 수 없기 때문입니다. 네 번째 <code>price * "2"</code>는 JavaScript에서는 조용히 9000이 되지만, 이 검사기와 TypeScript는 거부합니다.
      </p>
      <Code label="타입 검사기의 핵심 (일부)">{`
function check(e, env) {               // env: 이름 → 타입
  switch (e.kind) {
    case 'num':  return 'number';
    case 'var':  return env.get(e.name);  // 없으면 오류
    case '*': {
      const l = check(e.left, env), r = check(e.right, env);
      if (l !== 'number' || r !== 'number')
        throw new TypeError(\`*의 양쪽은 number여야 함: \${l} * \${r}\`);
      return 'number';
    }
    case 'cond': {
      if (check(e.test, env) !== 'boolean') throw new TypeError('조건은 boolean');
      const a = check(e.then, env), b = check(e.else, env);
      if (!same(a, b)) throw new TypeError(\`두 갈래가 다름: \${a}, \${b}\`);
      return a;
    }
    // … 함수, 호출 등
  }
}`}</Code>
      <p>
        검사기는 실행기와 모양이 거의 같습니다. 다음 장에서 만들 인터프리터는 같은 트리를 돌며 <strong>값</strong>을 계산하고, 검사기는 <strong>타입</strong>을 계산합니다. 그래서 타입 검사를 "값 대신 타입으로 하는 추상적인 실행"이라고도 부릅니다. 검사기는 반복문을 여러 번 돌거나 함수를 실제로 부르지 않으므로, 끝나지 않는 프로그램도 유한한 시간에 검사할 수 있습니다.
      </p>
      <Callout kind="key" label="건전성">
        로빈 밀너(Robin Milner)는 1978년 "타입이 맞는 프로그램은 잘못될 수 없다"는 말로 타입 시스템이 약속하는 바를 정리했습니다. 검사를 통과한 프로그램은 실행 중에 "숫자에 함수 호출" 같은 타입 오류를 결코 일으키지 않는다는 성질을 <T en="soundness">건전성</T>이라고 합니다. 0으로 나누기나 배열 범위 밖 접근처럼 타입이 다루지 않는 오류는 여전히 일어날 수 있습니다.
      </Callout>
      <Callout kind="warn">
        TypeScript는 쓰기 편하도록 일부러 건전하지 않게 만들어졌습니다. <code>any</code> 타입은 검사를 끄고, <code>as</code>로 타입을 우길 수 있으며, 배열의 원소 타입처럼 알려진 구멍도 몇 가지 있습니다. 그래서 TypeScript가 통과시킨 코드도 실행 중에 타입 때문에 실패할 수 있습니다. 서버에서 받은 JSON처럼 바깥에서 온 값은 실행 중에 한 번 더 확인하는 것이 안전합니다.
      </Callout>

      <h2>적지 않아도 알아내는 타입 추론</h2>
      <p>
        그림 1에서는 매개변수마다 타입을 적어야 했습니다. 그런데 <code>(x) =&gt; x + 1</code>을 보면 x가 number일 수밖에 없다는 것을 사람은 바로 압니다. 컴파일러도 그렇게 할 수 있습니다. 이것이 <T en="type inference">타입 추론</T>이고, 그 대표가 1969년 힌들리(Roger Hindley)와 1978년 밀너가 따로 찾은 <T en="Hindley-Milner">힌들리-밀너</T> 방식입니다. ML, OCaml, Haskell은 이 방식으로 프로그램 전체에 타입을 하나도 적지 않아도 모든 타입을 알아냅니다.
      </p>
      <p>방법은 두 단계입니다.</p>
      <ol>
        <li>
          <strong>제약 모으기.</strong> 모르는 타입마다 변수 t1, t2, …를 붙이고, 규칙이 요구하는 것을 등식으로 적습니다. <code>x + 1</code>의 노드에서는 "x의 타입 = number", "1의 타입 = number", "결과의 타입 = number"를 적습니다. 호출 <code>f(x)</code>에서는 "f의 타입 = (x의 타입) =&gt; 호출 결과의 타입"을 적습니다.
        </li>
        <li>
          <strong>제약 풀기.</strong> 등식을 하나씩 풀어 각 변수에 무엇을 넣어야 하는지 알아냅니다. 양쪽이 함수 타입이면 매개변수끼리, 반환 타입끼리 맞추고, 한쪽이 변수면 그 변수에 다른 쪽을 대입합니다. 두 타입을 같게 만드는 이 과정을 <T en="unification">단일화</T>라고 합니다.
        </li>
      </ol>
      <InferFigure />
      <p>
        "두 번 적용" <code>(f) =&gt; (x) =&gt; f(f(x))</code>를 끝까지 넘겨 보세요. 안쪽 호출 <code>f(x)</code>는 f가 "x의 타입을 받는 함수"라고 말하고, 바깥 호출 <code>f(f(x))</code>는 f가 "f(x)의 결과를 받는 함수"라고 말합니다. 두 제약을 단일화하면 f의 매개변수 타입과 반환 타입이 같아야 한다는 결론이 나옵니다. 아무도 x가 무엇인지 정하지 않았으므로 결과는 <code>{'<A>((A) => A) => (A) => A'}</code>, "어떤 타입 A에 대해서든"이라는 제네릭 타입이 됩니다.
      </p>
      <p>
        "오류" 예제 <code>f(1) + f(true)</code>에서는 f의 매개변수가 number라는 제약과 boolean이라는 제약이 부딪힙니다. "무한 타입" <code>x(x)</code>는 x의 타입 t가 <code>(t) =&gt; …</code>와 같아야 하는데, t 안에 t가 다시 들어가므로 끝없이 길어지는 타입이 됩니다. 단일화는 대입하기 전에 이런 경우를 확인(<T en="occurs check">출현 검사</T>)해 거부합니다.
      </p>
      <Callout kind="note">
        TypeScript, Kotlin, Swift, Rust, C++의 <code>auto</code>도 타입을 추론하지만, 대개 <code>const n = 3</code>처럼 값에서 변수로 흘러가는 <strong>지역적인</strong> 추론입니다. 함수의 매개변수 타입은 적어야 합니다. 힌들리-밀너는 쓰임새에서 거꾸로 매개변수 타입까지 알아내는 대신, 오버로딩이나 하위 타입처럼 실용 언어에 흔한 기능과 함께 쓰기 어렵다는 맞바꿈이 있습니다.
      </Callout>

      <h2>제네릭: 어떤 타입에도 쓸 수 있는 함수</h2>
      <p>
        <code>(x) =&gt; x</code>는 숫자를 넣으면 숫자를, 문자열을 넣으면 문자열을 돌려줍니다. 이런 함수의 타입을 <code>{'<A>(x: A) => A'}</code>처럼 타입 매개변수 A로 적고, 이렇게 한 정의가 여러 타입에서 똑같이 동작하는 성질을 <T en="parametric polymorphism">매개변수 다형성</T>, 흔히 <T en="generics">제네릭</T>이라고 합니다. 앞 장의 map을 떠올려 보세요. 숫자 배열이든 주문 객체 배열이든 같은 코드로 바꿉니다. 그 타입은 <code>{'<A, B>(xs: A[], f: (A) => B) => B[]'}</code>입니다.
      </p>
      <GenericFigure />
      <p>
        map에 <code>[3, 1, 4]</code>와 <code>(n: number) =&gt; n &gt; 2</code>를 넘기면, 첫 인자에서 A = number, 둘째 인자에서 B = boolean이 정해져 결과는 <code>boolean[]</code>입니다. 첫 인자를 문자열 배열로 바꾸면 A = string이 먼저 정해지는데, 둘째 인자는 number를 받는 함수라 맞지 않습니다. 함수의 시그니처 하나가 "배열의 원소와 함수의 입력은 같은 타입이어야 한다"는 약속을 담고 있고, 검사기가 그 약속을 호출마다 확인합니다.
      </p>
      <Code label="TypeScript의 제네릭">{`
function map<A, B>(xs: A[], f: (x: A) => B): B[] {
  const out: B[] = [];
  for (const x of xs) out.push(f(x));
  return out;
}

const big = map([3, 1, 4], (n) => n > 2);        // boolean[]으로 추론
const names = map(orders, (o) => o.item);        // string[]
map(['밥', '국'], (n: number) => n * 2);           // 오류: string은 number가 아님`}</Code>
      <Callout kind="intuition">
        제네릭 함수의 타입 매개변수는 함수의 값 매개변수와 똑같이 생각하면 됩니다. 값 매개변수는 호출할 때 값이 들어가고, 타입 매개변수는 호출할 때 타입이 들어갑니다. 다만 타입 인자는 대부분 직접 쓰지 않아도 그림 3처럼 인자에서 추론됩니다.
      </Callout>
      <p>
        제네릭을 실행 파일로 옮기는 방법은 언어마다 다릅니다. Java와 TypeScript는 검사가 끝나면 타입 정보를 지우고 하나의 코드만 남깁니다(<T en="type erasure">타입 소거</T>). C++의 템플릿과 Rust는 쓰인 타입마다 코드를 따로 찍어 냅니다(<T en="monomorphization">단형화</T>). 실행은 빠르지만 실행 파일이 커지고 컴파일이 느려지는 맞바꿈입니다.
      </p>

      <Callout kind="key">
        타입 검사기는 실행하지 않고 구문 트리에 규칙을 적용해 노드마다 타입을 매기고, 규칙에 맞지 않는 식을 실행 전에 거부합니다. 타입 추론은 모르는 타입을 변수로 두고 제약을 모아 단일화로 풀어서, 적지 않은 타입까지 알아냅니다. 끝까지 정해지지 않은 타입 변수는 제네릭이 되어, 하나의 함수를 여러 타입에 안전하게 쓰게 해 줍니다.
      </Callout>
      <Quiz
        q={
          <>
            타입 추론기가 <code>(f, x) =&gt; f(x) + 1</code>에서 알아내는 타입은?
          </>
        }
        options={[<code key="a">{'(f: (number) => number, x: number) => number'}</code>, <code key="b">{'<A>(f: (A) => number, x: A) => number'}</code>, <code key="c">{'<A, B>(f: (A) => B, x: A) => B'}</code>, '알 수 없어서 오류']}
        answer={1}
        explain={
          <>
            <code>f(x)</code>는 f가 x의 타입 A를 받는 함수라는 제약을, <code>+ 1</code>은 f(x)의 결과가 number라는 제약을 줍니다. x의 타입에 대해서는 아무 제약이 없으므로 A는 끝까지 정해지지 않아 제네릭으로 남습니다. 반환 타입은 <code>… + 1</code>이므로 number입니다.
          </>
        }
      />
    </>
  );
}
