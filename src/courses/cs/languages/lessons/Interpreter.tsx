import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Callout, Code, Figure, Legend, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { Interp, showValue, traceProgram, type EnvSnap, type Step } from './interp';
import { LangError, TOKEN_KIND, lineCol, parseProgram, tokenize, tryParse, type Token } from './lang';
import { SpanCode, TreeView, astTree } from './TreeView';
import '../../programming/lessons/programming.css';
import './languages.css';

/* ─────────────── Figure 1: code → tokens → tree ─────────────── */

const TREE_PRESETS = [
  { src: 'let y = x * (3 + 4);', tag: '우선순위와 괄호' },
  { src: 'let add = (a, b) => a + b;\nprint(add(1, 2));', tag: '함수와 호출' },
  { src: 'if (n > 0) {\n  print("양수");\n} else {\n  print("아님");\n}', tag: 'if 문' },
];

function TreeFigure() {
  const [src, setSrc] = useState(TREE_PRESETS[0].src);
  const id = useId();
  const toks = useMemo((): { toks: Token[] | null; err: string | null } => {
    try {
      return { toks: tokenize(src), err: null };
    } catch (e) {
      if (e instanceof LangError) return { toks: null, err: e.message };
      throw e;
    }
  }, [src]);
  const parsed = useMemo(() => tryParse(src), [src]);
  const [last, setLast] = useState(parsed.prog);
  if (parsed.prog && parsed.prog !== last) setLast(parsed.prog);
  const prog = parsed.prog ?? last;
  const errAt = parsed.err ? lineCol(src, parsed.err.pos) : null;

  return (
    <Figure
      no={1}
      title="코드가 토큰이 되고, 토큰이 트리가 된다"
      hint="코드를 고쳐 보세요"
      caption={<>렉서는 글자를 토큰으로 자르고, 파서는 토큰의 순서를 문법에 맞춰 구문 트리로 엮습니다. 괄호와 세미콜론은 트리를 만드는 데 쓰이고 나면 트리에 남지 않습니다. 곱셈이 덧셈보다 먼저라는 우선순위도 트리의 모양(누가 더 깊이 있는가)으로 바뀝니다. 인터프리터는 이 트리만 보고 일합니다.</>}
    >
      <div className="ty-presets" role="group" aria-label="예제 코드">
        {TREE_PRESETS.map((p) => (
          <button key={p.tag} type="button" className="ty-preset" aria-pressed={p.src === src} onClick={() => setSrc(p.src)}>
            <small>{p.tag}</small>
          </button>
        ))}
      </div>
      <label className="visually-hidden" htmlFor={id}>
        코드
      </label>
      <textarea id={id} className="pl-editor" rows={Math.max(2, src.split('\n').length)} value={src} spellCheck={false} autoCapitalize="off" autoComplete="off" onChange={(e) => setSrc(e.target.value)} />
      {toks.toks && (
        <div className="pl-col">
          <span className="pl-label">① 토큰 {toks.toks.length - 1}개</span>
          <div className="pl-chips" aria-label="토큰">
            {toks.toks.slice(0, -1).map((t, i) => (
              <span key={i} className="pl-chip" data-t={t.type}>
                {t.text}
                <small>{TOKEN_KIND[t.type]}</small>
              </span>
            ))}
          </div>
        </div>
      )}
      {(toks.err || parsed.err) && (
        <div className="pl-err" role="alert">
          {errAt ? `${errAt.line}번 줄 ${errAt.col}번째 글자 근처: ` : ''}
          {toks.err ?? parsed.err?.msg} {prog && '(아래는 마지막으로 읽을 수 있었던 트리입니다)'}
        </div>
      )}
      {prog && (
        <div className="pl-col">
          <span className="pl-label">② 구문 트리</span>
          <TreeView root={astTree(prog)} label="입력한 코드의 구문 트리" />
        </div>
      )}
    </Figure>
  );
}

/* ─────────────── Figure 2: stepping the evaluator with its environments ─────────────── */

const RUN_PRESETS: { id: string; label: string; src: string }[] = [
  { id: 'vars', label: '변수와 계산', src: 'let x = 2;\nlet y = x * (3 + 4);\nprint(y - x);' },
  { id: 'call', label: '함수 호출', src: 'let square = (n) => n * n;\nlet a = 3;\nprint(square(a + 1));' },
  { id: 'scope', label: '정적 범위', src: 'let x = "전역";\nlet show = () => x;\nlet test = () => {\n  let x = "안쪽";\n  return show();\n};\nprint(test());' },
  { id: 'counter', label: '클로저 카운터', src: 'let makeCounter = () => {\n  let count = 0;\n  return () => {\n    count = count + 1;\n    return count;\n  };\n};\nlet c1 = makeCounter();\nlet c2 = makeCounter();\nc1();\nprint(c1());\nprint(c2());' },
  { id: 'fact', label: '재귀', src: 'let fact = (n) => n == 0 ? 1 : n * fact(n - 1);\nprint(fact(4));' },
];

const STATE_NOTE: Record<EnvSnap['state'], string> = { current: '실행 중', stack: '호출 대기', kept: '끝났지만 붙잡힘', dead: '아무도 안 씀' };

interface Arrow {
  d: string;
  hot: boolean;
}

function EnvDiagram({ step }: { step: Step }) {
  const inner = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const mid = 'ip-ah-' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const byId = new Map(step.envs.map((e) => [e.id, e]));
  const depth = (e: EnvSnap): number => (e.parent === null ? 0 : 1 + depth(byId.get(e.parent)!));
  const cols: EnvSnap[][] = [];
  for (const e of step.envs) (cols[depth(e)] ??= []).push(e);
  const path = new Set(step.lookup?.path ?? []);
  const found = step.lookup?.found ?? null;
  const key = step.envs.map((e) => `${e.id}:${e.vars.length}:${e.state}`).join('|') + (step.lookup ? `L${step.lookup.path.join(',')}` : '');

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const out: Arrow[] = [];
      el.querySelectorAll<HTMLElement>('[data-parent]').forEach((src) => {
        const dst = el.querySelector<HTMLElement>(`[data-env="${src.dataset.parent}"]`);
        if (!dst) return;
        const a = src.getBoundingClientRect();
        const b = dst.getBoundingClientRect();
        const sx = a.left - base.left;
        const sy = a.top - base.top + 12;
        const tx = b.right - base.left;
        const ty = b.top - base.top + 12;
        const dx = Math.max(10, (sx - tx) * 0.5);
        out.push({ d: `M${sx},${sy} C${sx - dx},${sy} ${tx + dx},${ty} ${tx + 1},${ty}`, hot: src.dataset.hot === '1' });
      });
      setArrows((prev) => (prev.length === out.length && prev.every((p, i) => p.d === out[i].d && p.hot === out[i].hot) ? prev : out));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);

  return (
    <div className="ip-envs-wrap">
      <div className="ip-envs" ref={inner}>
        {cols.map((col, d) => (
          <div key={d} className="ip-col">
            <div className="pl-label">{d === 0 ? '전역' : `${d}단계 안쪽`}</div>
            {col.map((e) => {
              const look = path.has(e.id) ? (found === e.id ? 'found' : 'miss') : undefined;
              const hot = e.parent !== null && path.has(e.id) && path.has(e.parent) ? '1' : '0';
              return (
                <div key={e.id} className="ip-env" data-env={e.id} data-state={e.state} data-look={look} data-parent={e.parent ?? undefined} data-hot={hot}>
                  <div className="ip-env-head">
                    <span className="mono">{e.id === 0 ? '전역' : `E${e.id}`}</span>
                    {e.id !== 0 && <span className="ip-env-call mono">{e.label}</span>}
                  </div>
                  {e.vars.length === 0 && <div className="pl-label">(비어 있음)</div>}
                  {e.vars.map((v) => (
                    <div key={v.name} className="ip-var" data-changed={v.changed || undefined} data-look={step.lookup?.name === v.name && found === e.id ? 'found' : undefined}>
                      <span className="mono">{v.name}</span>
                      <span className="mono ip-val" data-fn={v.fnEnv !== undefined || undefined}>
                        {v.text}
                        {v.fnEnv !== undefined && <span className="ip-fnenv">{v.fnEnv === 0 ? '전역' : `E${v.fnEnv}`} 기억</span>}
                      </span>
                    </div>
                  ))}
                  {e.id !== 0 && <div className="ip-state">{STATE_NOTE[e.state]}</div>}
                </div>
              );
            })}
          </div>
        ))}
        {arrows.length > 0 && (
          <svg className="ip-arrows" aria-hidden="true">
            <defs>
              <marker id={mid} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--ink-3)' }} />
              </marker>
              <marker id={mid + 'h'} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--part-color, var(--accent))' }} />
              </marker>
            </defs>
            {arrows.map((a, i) => (
              <path key={i} d={a.d} className="ip-arrow" data-hot={a.hot || undefined} markerEnd={`url(#${a.hot ? mid + 'h' : mid})`} />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

function EvalFigure() {
  const [pid, setPid] = useState('counter');
  const [src, setSrc] = useState(RUN_PRESETS.find((p) => p.id === 'counter')!.src);
  const [edited, setEdited] = useState(src);
  const run = useMemo(() => traceProgram(src), [src]);
  const s = useStepper(Math.max(1, run.steps.length), 2, run);
  const step = run.steps[s.i];
  const edId = useId();
  const pick = (id: string) => {
    const p = RUN_PRESETS.find((x) => x.id === id)!;
    setPid(id);
    setSrc(p.src);
    setEdited(p.src);
  };
  const live = step ? step.envs.filter((e) => e.state !== 'dead').length : 0;

  return (
    <Figure
      no={2}
      title="환경을 들고 트리를 평가하기"
      hint="예제를 고르고 한 단계씩 넘겨 보세요"
      caption={<>왼쪽 노란 부분이 지금 평가하는 노드입니다. 오른쪽 상자 하나가 환경 하나이고, 화살표는 부모 환경을 가리킵니다. 함수를 부를 때마다 새 환경이 생기는데, 그 부모는 함수를 <strong>부른 곳</strong>이 아니라 함수가 <strong>만들어진 곳</strong>의 환경입니다. 이름을 찾을 때 거친 환경은 점선, 찾은 환경은 초록 테두리입니다. 흐린 상자는 끝난 호출 중 아무도 가리키지 않는 환경으로, 다음 장의 가비지 컬렉터가 치울 대상입니다. 이 언어에서는 함수 호출만 새 환경을 만듭니다(JavaScript는 블록마다 만듭니다).</>}
    >
      <Seg label="예제" value={pid} onChange={pick} options={RUN_PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
      {run.parseError ? (
        <div className="pl-err" role="alert">
          {lineCol(src, run.parseError.pos).line}번 줄: {run.parseError.msg}
        </div>
      ) : (
        step && (
          <>
            <div className="ip-main">
              <div className="pl-col">
                <SpanCode src={src} span={step.span} tone={step.error ? 'bad' : 'on'} label="실행 중인 코드" />
                <div className="pl-note" aria-live="polite">
                  <strong>{s.i + 1}단계.</strong> {step.error ? <strong className="bad">{step.note}</strong> : step.note}
                </div>
                <div className="tr-out" aria-label="출력">
                  <div className="tr-out-head">출력</div>
                  {step.out.length === 0 ? <div className="tr-out-empty">아직 없음</div> : step.out.map((o, i) => <div key={i} className="tr-out-line">{o}</div>)}
                </div>
              </div>
              <EnvDiagram step={step} />
            </div>
            <div className="controls row">
              <div className="ctl" style={{ flex: '1 1 300px' }}>
                <StepControls s={s} id="ip-eval-speed" maxSpeed={12} />
              </div>
              <div className="readouts" style={{ flex: '1 1 240px', gridTemplateColumns: '1fr 1fr' }}>
                <Readout label="호출 깊이" value={step.depth} />
                <Readout label="살아 있는 환경" value={`${live} / ${step.envs.length}`} />
              </div>
            </div>
            <Legend
              items={[
                { color: 'var(--part-color)', label: '실행 중인 환경', shape: 'sq' },
                { color: 'var(--good)', label: '이름을 찾은 환경', shape: 'sq' },
                { color: 'var(--ink-3)', label: '부모 화살표', shape: 'ln' },
              ]}
            />
          </>
        )
      )}
      <details className="ip-edit">
        <summary>코드 직접 고치기</summary>
        <label className="visually-hidden" htmlFor={edId}>
          실행할 코드
        </label>
        <textarea id={edId} className="pl-editor" rows={Math.min(14, Math.max(4, edited.split('\n').length + 1))} value={edited} spellCheck={false} autoCapitalize="off" autoComplete="off" onChange={(e) => setEdited(e.target.value)} />
        <div className="btn-row">
          <Button small primary onClick={() => setSrc(edited)}>
            이 코드로 실행
          </Button>
        </div>
      </details>
    </Figure>
  );
}

/* ─────────────── Figure 3: a REPL ─────────────── */

interface Entry {
  input: string;
  out: string[];
  value?: string;
  error?: string;
}

const REPL_EXAMPLES = ['let twice = (f) => (x) => f(f(x));', 'twice((n) => n * 3)(5)', 'let fib = (n) => n < 2 ? n : fib(n - 1) + fib(n - 2);', 'fib(15)', 'print("안녕, " + "인터프리터")', 'nope + 1', 'let loop = () => loop();', 'loop()'];

function ReplFigure() {
  const it = useRef<Interp | null>(null);
  if (!it.current) it.current = new Interp({ fuel: 200000 });
  const [hist, setHist] = useState<Entry[]>([{ input: 'let x = 10;', out: [] }]);
  const [line, setLine] = useState('x * 2 + 1');
  const [, setTick] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const inId = useId();

  useEffect(() => {
    // the first entry, run once
    it.current!.run(parseProgram('let x = 10;'));
    setTick((t) => t + 1);
  }, []);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [hist]);

  const submit = (text: string) => {
    const src = text.trim();
    if (!src) return;
    const I = it.current!;
    I.out = [];
    I.setFuel(200000);
    const entry: Entry = { input: src, out: [] };
    try {
      const v = I.run(parseProgram(src.endsWith(';') || src.endsWith('}') ? src : src + ';'));
      entry.out = I.out;
      if (v !== undefined) entry.value = showValue(v);
    } catch (e) {
      if (!(e instanceof LangError)) throw e;
      entry.out = I.out;
      entry.error = e.message;
    }
    setHist((h) => [...h.slice(-30), entry]);
    setLine('');
  };
  const reset = () => {
    it.current = new Interp({ fuel: 200000 });
    setHist([]);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(line);
    }
  };
  const globals = [...it.current.global.vars.entries()].filter(([k]) => k !== 'print');

  return (
    <Figure
      no={3}
      title="REPL: 읽고, 평가하고, 출력하고, 반복"
      hint="한 줄씩 입력하고 Enter를 누르세요"
      caption={<>그림 2와 똑같은 인터프리터입니다. 입력할 때마다 코드를 읽어(read) 트리로 만들고, 평가하고(eval), 결과를 보여 주고(print), 다음 입력을 기다립니다(loop). 전역 환경은 입력 사이에 그대로 남아서, 앞에서 만든 변수와 함수를 뒤에서 쓸 수 있습니다. 끝나지 않는 재귀는 일정한 깊이에서 멈춥니다.</>}
    >
      <div className="fig-split">
        <div className="pl-col">
          <div className="ip-repl" ref={logRef} aria-live="polite" aria-label="REPL 기록">
            {hist.length === 0 && <div className="pl-label">새 전역 환경입니다. 아무거나 입력해 보세요.</div>}
            {hist.map((h, i) => (
              <div key={i} className="ip-entry">
                <div className="ip-in mono">
                  <span aria-hidden="true">› </span>
                  {h.input}
                </div>
                {h.out.map((o, j) => (
                  <div key={j} className="ip-printed mono">
                    {o}
                  </div>
                ))}
                {h.value !== undefined && <div className="ip-value mono">{h.value}</div>}
                {h.error && <div className="ip-error">{h.error}</div>}
              </div>
            ))}
          </div>
          <label className="visually-hidden" htmlFor={inId}>
            REPL 입력 (Enter로 실행, Shift+Enter로 줄바꿈)
          </label>
          <div className="ip-prompt">
            <span aria-hidden="true" className="mono">
              ›
            </span>
            <textarea id={inId} className="pl-editor" rows={Math.min(5, Math.max(1, line.split('\n').length))} value={line} spellCheck={false} autoCapitalize="off" autoComplete="off" onChange={(e) => setLine(e.target.value)} onKeyDown={onKey} />
            <Button small primary onClick={() => submit(line)}>
              실행
            </Button>
          </div>
        </div>
        <div className="controls">
          <div className="pl-col">
            <span className="pl-label">입력해 볼 것 (누르면 입력 칸에 들어갑니다)</span>
            <div className="ip-examples">
              {REPL_EXAMPLES.map((x) => (
                <button key={x} type="button" className="ty-preset" onClick={() => setLine(x)}>
                  <code>{x}</code>
                </button>
              ))}
            </div>
          </div>
          <div className="pl-col">
            <span className="pl-label">전역 환경</span>
            <div className="ip-env" data-state="stack">
              {globals.length === 0 && <div className="pl-label">(비어 있음)</div>}
              {globals.map(([k, v]) => (
                <div key={k} className="ip-var">
                  <span className="mono">{k}</span>
                  <span className="mono ip-val">{showValue(v)}</span>
                </div>
              ))}
            </div>
          </div>
          <Button small onClick={reset}>
            환경 비우기
          </Button>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Interpreter() {
  return (
    <>
      <h2>언어를 직접 만든다는 것</h2>
      <p>
        지금까지는 언어를 쓰는 쪽에 있었습니다. 이 장에서는 언어를 <strong>실행하는</strong> 프로그램을 만듭니다. 소스 코드를 받아 그 뜻대로 바로 실행해 주는 프로그램을 <T en="interpreter">인터프리터</T>라고 합니다. Python, Ruby, 초창기 JavaScript 엔진이 모두 인터프리터로 시작했습니다. 버클리의 CS 61A는 학기 말에 학생들이 Scheme 인터프리터를 직접 만들게 하는데, 몇백 줄이면 클로저와 재귀까지 되는 언어가 완성됩니다. 여기서는 이 과목 내내 쓰는 작은 JavaScript 비슷한 언어로 같은 일을 해 봅니다.
      </p>
      <p>인터프리터는 세 단계로 일합니다.</p>
      <ol>
        <li>
          <strong>토큰으로 자르기</strong>(<T en="lexing">렉싱</T>): 글자의 줄을 <code>let</code>, <code>y</code>, <code>=</code>, <code>3</code> 같은 낱말로 자릅니다.
        </li>
        <li>
          <strong>트리로 엮기</strong>(<T en="parsing">파싱</T>): 토큰의 순서를 문법에 맞춰 <T en="abstract syntax tree">구문 트리</T>(AST)로 만듭니다.
        </li>
        <li>
          <strong>평가하기</strong>(<T en="evaluation">평가</T>): 트리를 돌며 값을 계산합니다.
        </li>
      </ol>

      <h2>토큰과 구문 트리</h2>
      <TreeFigure />
      <p>
        파서가 어떻게 문법 규칙을 함수로 옮겨 트리를 만드는지는 계산 이론의 <a href={lessonHref('cs-computation', 'grammars-parsing')}>문법과 파싱 장</a>에서 재귀 하강 파서로 자세히 다룹니다. 여기서 중요한 것은 결과물입니다. <code>x * (3 + 4)</code>는 트리가 되는 순간 괄호가 사라지고, 대신 <code>+</code>가 <code>*</code>보다 깊은 곳에 매달립니다. 계산 순서가 트리의 모양에 담긴 것입니다. 이제부터 인터프리터는 글자를 다시 보지 않고 트리만 봅니다.
      </p>

      <h2>트리를 평가하기</h2>
      <p>
        평가기는 노드의 종류마다 할 일을 정한 재귀 함수 하나입니다. 숫자 노드는 그 숫자가 값이고, <code>+</code> 노드는 왼쪽과 오른쪽 자식을 먼저 평가한 뒤 더합니다. 자식을 평가하는 것도 같은 함수이므로, 트리가 아무리 깊어도 코드는 짧습니다.
      </p>
      <Code label="평가기의 뼈대">{`
function evaluate(node, env) {
  switch (node.kind) {
    case 'num':  return node.value;
    case 'var':  return env.lookup(node.name);       // 환경에서 이름 찾기
    case 'bin': {
      const l = evaluate(node.left, env);            // 자식부터 평가
      const r = evaluate(node.right, env);
      return apply(node.op, l, r);
    }
    case 'cond':
      return evaluate(node.test, env)                // 조건만 먼저,
        ? evaluate(node.then, env)                   // 고른 쪽만 평가
        : evaluate(node.else, env);
    case 'fn':                                       // 함수 = 코드 + 지금 환경
      return { params: node.params, body: node.body, env };
    case 'call': {
      const f = evaluate(node.callee, env);
      const args = node.args.map((a) => evaluate(a, env));
      const local = new Env(f.env);                  // 부모는 f가 기억한 환경!
      f.params.forEach((p, i) => local.define(p, args[i]));
      return evaluate(f.body, local);
    }
  }
}

class Env {
  constructor(parent) { this.vars = new Map(); this.parent = parent; }
  define(name, v) { this.vars.set(name, v); }
  lookup(name) {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.lookup(name); // 없으면 부모에게
    throw new ReferenceError(name + ' is not defined');
  }
}`}</Code>
      <p>
        조건식(<code>cond</code>)은 다른 노드와 다릅니다. 자식 셋을 모두 평가하지 않고, 조건을 먼저 본 뒤 고른 쪽만 평가합니다. 그래서 <code>n == 0 ? 1 : n * fact(n - 1)</code>에서 n이 0이면 재귀 호출 쪽은 아예 실행되지 않고, 재귀가 멈출 수 있습니다.
      </p>

      <h2>환경: 이름에서 값으로</h2>
      <p>
        <code>x</code>라는 이름을 만나면 그 값을 어디서 찾을까요? 인터프리터는 이름과 값을 짝지은 표인 <T en="environment">환경</T>을 들고 다닙니다. 환경마다 <T en="parent">부모</T> 환경을 가리키는 포인터가 있어서, 지금 환경에 없는 이름은 부모, 그 부모로 거슬러 올라가며 찾습니다. 전역 환경까지 가도 없으면 <code>ReferenceError</code>입니다. <a href={lessonHref('cs-programming', 'functions')}>프로그래밍 입문의 함수 장</a>에서 본 "안쪽부터 바깥으로 찾는 범위 규칙"이 바로 이 부모 사슬입니다.
      </p>
      <EvalFigure />
      <p>
        "변수와 계산"은 환경이 전역 하나뿐이라 간단합니다. "함수 호출"에서는 <code>square(a + 1)</code>을 부르는 순간 새 환경 E1이 생겨 n = 4가 담기고, 몸통의 <code>n * n</code>은 E1에서 n을 찾습니다. square가 값을 돌려주면 E1은 더 이상 아무도 쓰지 않아 흐려집니다.
      </p>

      <h2>클로저와 정적 범위</h2>
      <p>
        함수 값은 매개변수와 몸통만이 아니라 <strong>만들어질 때의 환경</strong>을 함께 담습니다(위 코드의 <code>case 'fn'</code>). 그리고 함수를 부를 때 새 환경의 부모를 그 기억해 둔 환경으로 잇습니다. "정적 범위" 예제를 끝까지 넘겨 보세요. <code>show</code>는 전역에서 만들어졌으므로, <code>test</code> 안에서 불려도 부모가 전역입니다. 그래서 test 안의 x("안쪽")가 아니라 전역의 x("전역")를 찾습니다. 코드를 읽기만 해도 어떤 x인지 정해지는 이 규칙을 <T en="lexical scope">정적 범위</T>(어휘적 범위)라고 합니다.
      </p>
      <p>
        "클로저 카운터"에서는 이 규칙이 상태를 만듭니다. <code>makeCounter()</code>를 부를 때마다 count가 담긴 환경이 새로 생기고, 안쪽 함수가 그 환경을 기억한 채로 돌려집니다. makeCounter의 호출은 끝났지만 그 환경은 흐려지지 않고 "끝났지만 붙잡힘"으로 남습니다. c1을 부르면 새 환경의 부모가 c1이 기억한 환경이므로, <code>count = count + 1</code>이 부모 사슬을 따라 올라가 그 count를 바꿉니다. c1과 c2는 서로 다른 환경을 붙잡고 있으므로 c1을 두 번 부른 뒤에도 c2는 1부터 셉니다.
      </p>
      <Callout kind="note">
        새 환경의 부모를 함수를 <strong>부른 쪽</strong>의 환경으로 잇는 언어도 있었습니다(<T en="dynamic scope">동적 범위</T>). 초기 Lisp와 지금의 Emacs Lisp, 셸 스크립트의 일부 동작이 그렇습니다. 그러면 "정적 범위" 예제는 "안쪽"을 출력합니다. 같은 함수가 어디서 불리느냐에 따라 다른 변수를 보게 되어 코드를 읽기 어려워지므로, 오늘날 대부분의 언어는 정적 범위를 씁니다. 1975년의 Scheme이 정적 범위와 클로저를 Lisp에 들여온 대표적인 언어입니다.
      </Callout>

      <h2>재귀는 환경이 쌓이는 것</h2>
      <p>
        "재귀"를 넘겨 보면 <code>fact(4)</code>, <code>fact(3)</code>, …, <code>fact(0)</code>을 부를 때마다 n이 담긴 환경이 하나씩 생겨 호출 깊이가 5까지 늘어납니다. 환경마다 n이 따로 있으므로 안쪽 호출의 n이 바깥 호출의 n을 덮어쓰지 않습니다. 모든 호출 환경의 부모는 fact가 만들어진 전역입니다. fact라는 이름을 전역에서 찾을 수 있기 때문에 함수가 자기 자신을 부를 수 있습니다. 가장 안쪽 호출이 1을 돌려주면 하나씩 곱해지며 돌아 나오고, 끝난 환경은 차례로 흐려집니다.
      </p>
      <Callout kind="intuition">
        이 인터프리터는 JavaScript 함수의 재귀로 구현했으므로, 꼬마 언어의 호출이 깊어지면 그 아래에서 JavaScript의 호출 스택도 깊어집니다. 그래서 끝나지 않는 재귀는 일정한 깊이에서 멈추게 했습니다. 실제 언어 구현은 호출마다 무엇을 스택에 올리는지 직접 관리하는데, 그 모습은 컴퓨터 구조의 <a href={lessonHref('cs-architecture', 'stack-heap')}>스택과 힙 장</a>에서 볼 수 있습니다.
      </Callout>

      <h2>REPL</h2>
      <p>
        Python이나 Node.js를 인자 없이 실행하면 나오는 프롬프트, 브라우저 개발자 도구의 콘솔이 <T en="REPL">REPL</T>입니다. Read-Eval-Print Loop, 즉 읽고 평가하고 출력하기를 반복하는 고리입니다. 우리 인터프리터에 입력 칸만 붙이면 그대로 REPL이 됩니다.
      </p>
      <ReplFigure />
      <p>
        <code>twice</code>는 함수를 받아 두 번 적용하는 함수를 돌려줍니다. 앞 장들에서 본 고차 함수, 클로저, 재귀가 이 몇백 줄짜리 인터프리터에서 모두 동작합니다. <code>fib(15)</code>는 함수를 약 2천 번 부르는데, 우리 인터프리터는 노드마다 switch를 거치고 환경을 Map으로 찾느라 같은 계산을 JavaScript로 직접 할 때보다 수백 배 느립니다. 이 차이를 줄이는 방법이 이 과목의 마지막 장, 컴파일러입니다.
      </p>

      <Callout kind="key">
        인터프리터는 코드를 토큰으로 자르고, 구문 트리로 엮고, 트리를 재귀적으로 평가합니다. 이름의 값은 환경에서 찾고, 없으면 부모 환경으로 거슬러 올라갑니다. 함수 값은 자기가 만들어진 환경을 기억하고, 호출할 때 새 환경의 부모를 그 환경으로 잇습니다. 이 한 가지 규칙에서 정적 범위, 클로저, 재귀가 모두 나옵니다.
      </Callout>
      <Quiz
        q={
          <>
            다음 코드를 이 장의 인터프리터로 실행하면 무엇이 출력될까요?
            <br />
            <code>{'let a = 1; let f = () => a; let g = (a) => f(); print(g(5));'}</code>
          </>
        }
        options={['1', '5', 'undefined', "ReferenceError: 'a'를 찾을 수 없음"]}
        answer={0}
        explain={
          <>
            f는 전역에서 만들어졌으므로 f를 부를 때 생기는 환경의 부모는 전역입니다. g의 매개변수 a(= 5)는 g의 환경에만 있고, f의 환경 사슬(f의 환경 → 전역)에는 들어 있지 않습니다. 그래서 f는 전역의 a = 1을 찾습니다. 동적 범위였다면 5가 나왔을 것입니다.
          </>
        }
      />
    </>
  );
}
