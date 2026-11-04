import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { TreeDiagram, fmtNum, layoutTree, type Mark } from './Diagram';
import { ParseError, allTrees, parseTraced, standardKey, tokenize, type ParseRun } from './parsing';
import './computation.css';

/* ─────────────── Figure 1: recursive descent, call by call ─────────────── */

const EXPR_PRESETS = ['1 + 2 * (3 - 4)', '2 * 3 + 4', '(1 + 2) * 3', '8 - 3 - 2'];

function ParserFigure() {
  const [src, setSrc] = useState(EXPR_PRESETS[0]);
  const [view, setView] = useState<'parse' | 'ast'>('parse');
  const [last, setLast] = useState<ParseRun>(() => parseTraced(EXPR_PRESETS[0]));
  const { run, err } = useMemo(() => {
    try {
      return { run: parseTraced(src), err: null as ParseError | null };
    } catch (e) {
      if (e instanceof ParseError) return { run: null, err: e };
      throw e;
    }
  }, [src]);
  if (run && run !== last) setLast(run);
  const r = run ?? last;
  const s = useStepper(r.frames.length, 3, r, true);
  const f = r.frames[s.i];
  const done = s.i === r.frames.length - 1;
  const finished = useMemo(() => new Set(r.finishOrder.slice(0, f.finished)), [r, f.finished]);
  const layout = useMemo(() => layoutTree(r.nodes, r.root, 52, 46), [r]);
  const astLayout = useMemo(() => layoutTree(r.ast.nodes, r.ast.root, 50, 54), [r]);
  const calls = [...r.nodes.values()].filter((n) => n.kind === 'nt' && n.id < f.created).length;
  const mark = (id: number): Mark => (id >= f.created ? 'hide' : id === f.active ? 'on' : undefined);

  return (
    <Figure
      no={1}
      title="재귀 하강 파서가 식을 읽는 과정"
      hint="재생하거나 식을 직접 입력해 보세요"
      caption={<>문법의 규칙 하나가 함수 하나입니다. 둥근 상자는 함수 호출(expr, term, factor), 네모 상자는 읽어 들인 토큰이고, 노란 상자가 지금 일하는 곳입니다. 함수가 끝나면 그 부분식의 값이 주황 숫자로 붙습니다. 괄호를 만나면 factor()가 expr()을 다시 부르기 때문에 호출 스택이 깊어집니다. "구문 트리"로 바꾸면 괄호와 중간 단계를 걷어 내고 연산자와 피연산자만 남긴 나무를 봅니다. 계산은 이 나무를 아래에서 위로 거슬러 올라가며 합니다.</>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        {view === 'parse' ? (
          <TreeDiagram nodes={r.nodes} root={r.root} layout={layout} mark={mark} showValues={(id) => finished.has(id)} label={`${src}의 파스 트리, ${s.i + 1}단계`} minWidth={Math.min(layout.width, 420)} />
        ) : (
          <TreeDiagram nodes={r.ast.nodes} root={r.ast.root} layout={astLayout} showValues={() => true} label={`${src}의 구문 트리. 값 ${fmtNum(r.value)}`} minWidth={Math.min(astLayout.width, 300)} />
        )}
      </div>
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="cmp-chips" aria-label="토큰">
            <span className="lbl">토큰 (회색: 읽음, 주황 테두리: 다음 토큰)</span>
            {r.tokens.map((t, i) => (
              <span key={i} className="cmp-chip" data-s={i < f.next ? 'done' : i === f.next ? 'pos' : undefined}>
                {t.text}
                <small>{t.type === 'num' ? '수' : t.type === 'op' ? '연산' : '괄호'}</small>
              </span>
            ))}
          </div>
          <div className="cmp-chips" aria-label="호출 스택">
            <span className="lbl">호출 스택 (왼쪽이 바닥)</span>
            {f.stack.length ? (
              f.stack.map((c, i) => (
                <span key={i} className="cmp-chip" data-s={i === f.stack.length - 1 ? 'on' : undefined}>
                  {c.fn}()
                </span>
              ))
            ) : (
              <span className="cmp-empty">비어 있음: 파싱 끝</span>
            )}
          </div>
          <div className="cmp-note" aria-live="polite">
            <strong>{s.i + 1}단계.</strong> {f.note}
            {done && <> 식 전체의 값은 <strong style={{ color: 'var(--pos)' }}>{fmtNum(r.value)}</strong>입니다.</>}
          </div>
        </div>
        <div className="controls">
          <Seg label="예시" value={EXPR_PRESETS.includes(src) ? src : ''} onChange={setSrc} options={EXPR_PRESETS.map((p) => ({ value: p, label: <span className="mono">{p}</span> }))} />
          <div className="ctl">
            <label className="ctl-label" htmlFor="gp-src">
              <span>식 (정수, + − * /, 괄호)</span>
            </label>
            <input id="gp-src" className="cmp-text" type="text" value={src} spellCheck={false} autoComplete="off" aria-invalid={!!err} aria-describedby="gp-err" onChange={(e) => setSrc(e.target.value.slice(0, 26))} />
            <div id="gp-err" className="cmp-err" aria-live="polite">
              {err ? `${err.pos + 1}번째 글자: ${err.message}` : ''}
            </div>
          </div>
          <Seg
            label="그림"
            value={view}
            onChange={setView}
            options={[
              { value: 'parse', label: '파스 트리' },
              { value: 'ast', label: '구문 트리' },
            ]}
          />
          <StepControls s={s} id="gp-speed" maxSpeed={12} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="함수 호출" value={`${calls} / ${r.calls}`} />
            <Readout label="스택 깊이" value={f.stack.length} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: one string, many trees ─────────────── */

const AMB_PRESETS = ['1 - 2 - 3', '1 + 2 * 3', '8 / 4 / 2', '1 - 2 - 3 - 4', '2 * 3 + 4 * 5'];

function AmbiguityFigure() {
  const [src, setSrc] = useState(AMB_PRESETS[0]);
  const [pick, setPick] = useState(0);
  const { trees, std } = useMemo(() => {
    const toks = tokenize(src);
    const nums = toks.filter((t) => t.type === 'num').map((t) => Number(t.text));
    const ops = toks.filter((t) => t.type === 'op').map((t) => t.text);
    return { trees: allTrees(nums, ops), std: standardKey(ops) };
  }, [src]);
  const k = Math.min(pick, trees.length - 1);
  const t = trees[k];
  const layout = useMemo(() => layoutTree(t.nodes, t.root, 56, 54), [t]);
  const isStd = t.key === std;
  const values = trees.map((x) => x.value);
  const distinct = [...new Set(values)];

  return (
    <Figure
      no={2}
      title="모호한 문법: 같은 식, 여러 개의 파스 트리"
      hint="식을 고르고 나무를 넘겨 보세요"
      caption={<>문법 E → E + E | E − E | E * E | E / E | 수 로 만들 수 있는 구문 트리를 모두 늘어놓았습니다. 같은 문자열인데 나무가 여러 개이고, 나무마다 계산한 값이 다를 수 있습니다. 피연산자가 4개면 나무는 5개, 5개면 14개로 늘어납니다(카탈랑 수). "우리 문법"은 그림 1의 expr / term / factor 문법이 고르는 단 하나의 나무입니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <TreeDiagram nodes={t.nodes} root={t.root} layout={layout} showValues={() => true} label={`${src}의 ${k + 1}번째 구문 트리, 값 ${fmtNum(t.value)}`} minWidth={Math.min(layout.width, 300)} />
          <div className="cmp-verdict" aria-live="polite">
            나무 {k + 1} / {trees.length}: 값 <strong style={{ color: 'var(--pos)' }}>{fmtNum(t.value)}</strong>
            {isStd ? <strong data-ok="yes">우리 문법이 고르는 나무</strong> : <span>우리 문법은 이 나무를 만들지 않습니다</span>}
          </div>
          <div className="cmp-chips" role="group" aria-label="나무별 값">
            <span className="lbl">나무별 값 (누르면 그 나무로)</span>
            {trees.map((x, i) => (
              <button key={i} type="button" className="cmp-chip" data-s={i === k ? 'on' : x.key === std ? 'good' : undefined} onClick={() => setPick(i)} aria-pressed={i === k} style={{ cursor: 'pointer' }}>
                <small>#{i + 1}</small>
                {fmtNum(x.value)}
              </button>
            ))}
          </div>
        </div>
        <div className="controls">
          <Seg
            label="식"
            value={src}
            onChange={(v) => {
              setSrc(v);
              setPick(0);
            }}
            options={AMB_PRESETS.map((p) => ({ value: p, label: <span className="mono">{p}</span> }))}
          />
          <div className="btn-row">
            <Button small onClick={() => setPick((k - 1 + trees.length) % trees.length)} label="이전 나무">
              ◀ 이전 나무
            </Button>
            <Button small onClick={() => setPick((k + 1) % trees.length)} label="다음 나무">
              다음 나무 ▶
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="파스 트리 수" value={trees.length} />
            <Readout label="서로 다른 값" value={distinct.length} color={distinct.length > 1 ? 'var(--bad)' : undefined} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: '연산자', shape: 'sq' },
          { color: 'var(--pos)', label: '그 부분식의 값', shape: 'sq' },
          { color: 'var(--good)', label: '우리 문법이 고르는 나무', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: a stack versus a finite counter ─────────────── */

const PAREN_PRESETS = ['(()())', '((()))(()', '())(()', '((((()))))'];

function ParenFigure() {
  const P = usePalette();
  const [src, setSrc] = useState(PAREN_PRESETS[0]);
  const [k, setK] = useState(4);
  const lim = k - 2; // deepest nesting a k-state counter can follow (one state is the trap)
  const trace = useMemo(() => {
    const out: { depth: number; stackOk: boolean; dfa: number }[] = [{ depth: 0, stackOk: true, dfa: 0 }];
    let d = 0;
    let ok = true;
    let q = 0; // -1 = trap
    for (const c of src) {
      if (c === '(') d++;
      else d--;
      if (d < 0) ok = false;
      if (q >= 0) q = c === '(' ? (q + 1 > lim ? -1 : q + 1) : q === 0 ? -1 : q - 1;
      out.push({ depth: Math.max(d, 0), stackOk: ok, dfa: q });
      if (!ok) d = 0;
    }
    return out;
  }, [src, lim]);
  const s = useStepper(trace.length, 3, `${src}|${k}`);
  const f = trace[s.i];
  const done = s.i === trace.length - 1;
  const last = trace[trace.length - 1];
  const truth = last.stackOk && last.depth === 0 && !trace.some((t) => !t.stackOk);
  const dfaSays = last.dfa === 0;
  const maxDepth = Math.max(...trace.map((t) => t.depth));
  const dfaName = (q: number) => (q < 0 ? '✕' : `d${q}`);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const n = Math.max(1, src.length);
      const yMax = Math.max(4, maxDepth + 1);
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: n, yMin: 0, yMax, pad: { l: 30, r: 12, t: 12, b: 26 } });
      // depths the counter cannot follow
      if (lim + 1 <= yMax) {
        ctx.fillStyle = alpha(P.bad, 0.1);
        ctx.fillRect(plot.X(0), plot.Y(yMax), plot.X(n) - plot.X(0), plot.Y(lim + 0.5) - plot.Y(yMax));
        plot.line(0, lim + 0.5, n, lim + 0.5, P.bad, 1.2, [5, 4]);
        ctx.fillStyle = P.bad;
        ctx.font = `11px ${P.fontBody}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`상태 ${k}개로는 못 따라가는 깊이`, plot.X(n) - 4, plot.Y(lim + 0.5) - 3);
      }
      plot.grid({ xStep: 1, yStep: 1, labels: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 0; y <= yMax; y++) ctx.fillText(String(y), plot.X(0) - 6, plot.Y(y));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      [...src].forEach((c, i) => {
        ctx.fillStyle = i < s.i ? P.ink : P.ink3;
        ctx.fillText(c, plot.X(i + 0.5), plot.Y(0) + 6);
      });
      ctx.strokeStyle = P.neg;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      trace.forEach((t, i) => {
        if (i > s.i) return;
        const X = plot.X(i);
        const Y = plot.Y(t.depth);
        if (i) ctx.lineTo(X, Y);
        else ctx.moveTo(X, Y);
      });
      ctx.stroke();
      plot.dot(s.i, f.depth, 5, P.hl, P.ink, 1.5);
    },
    [P, src, trace, s.i, lim, k, maxDepth],
    { aspect: 2.4, maxHeight: 240, minHeight: 170 },
  );

  return (
    <Figure
      no={3}
      title="괄호의 짝: 스택과 유한한 기계"
      hint="괄호를 입력하고 상태 수 k를 바꿔 보세요"
      caption={<>파란 선은 괄호를 하나씩 읽을 때의 깊이(아직 닫히지 않은 여는 괄호의 수)입니다. 스택은 여는 괄호를 쌓고 닫는 괄호마다 하나를 꺼내므로 깊이에 끝이 없습니다. 오른쪽의 유한한 기계는 상태 d0, d1, …로 깊이를 세다가 셀 수 있는 한도를 넘거나 짝 없는 )를 만나면 ✕ 상태에 빠집니다. 빨간 영역에 들어가는 입력에서는 짝이 맞아도 기계가 거부합니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`괄호 ${src}의 깊이 그래프. 최대 깊이 ${maxDepth}, 상태 ${k}개짜리 기계가 따라갈 수 있는 깊이 ${lim}`}>
            <canvas ref={canvasRef} />
          </div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)', marginBottom: 4 }}>스택</div>
              <div className="cmp-stack" aria-label={`스택에 여는 괄호 ${f.depth}개`}>
                {Array.from({ length: Math.min(f.depth, 8) }, (_, i) => (
                  <span key={i}>{i === 7 && f.depth > 8 ? `…${f.depth}` : '('}</span>
                ))}
                {f.depth === 0 && <i style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>비어 있음</i>}
              </div>
            </div>
            <div className="cmp-verdict" aria-live="polite" style={{ flex: 1, minWidth: 180 }}>
              {done ? (
                <>
                  스택: <strong data-ok={truth ? 'yes' : 'no'}>{truth ? '짝이 맞음' : '짝이 틀림'}</strong> · 상태 {k}개 기계: <strong data-ok={dfaSays === truth ? 'yes' : 'no'}>{dfaSays ? '수락' : '거부'}</strong>
                  {dfaSays !== truth && <span>(틀림)</span>}
                </>
              ) : (
                <>
                  {s.i === 0 ? '아직 아무것도 읽지 않았습니다.' : `${s.i}번째 글자 ${src[s.i - 1]}: 깊이 ${f.depth}.`} 기계의 상태 <strong>{dfaName(f.dfa)}</strong>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="controls">
          <Seg label="예시" value={PAREN_PRESETS.includes(src) ? src : ''} onChange={setSrc} options={PAREN_PRESETS.map((p) => ({ value: p, label: <span className="mono">{p}</span> }))} />
          <div className="ctl">
            <label className="ctl-label" htmlFor="gp-paren">
              <span>괄호 ( ) 만</span>
            </label>
            <input id="gp-paren" className="cmp-text" type="text" value={src} spellCheck={false} autoComplete="off" onChange={(e) => setSrc(e.target.value.replace(/[^()]/g, '').slice(0, 24))} />
          </div>
          <Slider id="gp-k" label="기계의 상태 수 k" value={k} min={2} max={8} step={1} onChange={setK} color="var(--c-cs-1)" />
          <StepControls s={s} id="gp-paren-speed" maxSpeed={12} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="최대 깊이" value={maxDepth} />
            <Readout label="기계가 셀 수 있는 깊이" value={lim} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function GrammarsParsing() {
  return (
    <>
      <h2>유한 오토마타로는 모자란 것</h2>
      <p>
        계산기 앱에 <code>1 + 2 * (3 - 4)</code>를 입력하면 −1이 나옵니다. 앱은 곱셈을 덧셈보다 먼저 하고, 괄호 안을 가장 먼저 계산해야 한다는 것을 압니다. 글자를 왼쪽부터 읽으며 상태만 바꾸는 유한 오토마타로는 이 일을 할 수 없습니다. 괄호는 얼마든지 겹칠 수 있고, <a href={lessonHref('cs-computation', 'finite-automata')}>유한 오토마타 장</a>에서 보았듯 끝없이 세어야 하는 일은 유한한 기계가 못 하기 때문입니다.
      </p>
      <p>
        게다가 식에는 <strong>구조</strong>가 있습니다. <code>1 + 2 * 3</code>은 "1과 (2 * 3)의 합"이지 "(1 + 2)와 3의 곱"이 아닙니다. 프로그래밍 언어의 소스 코드, JSON, SQL, HTML도 모두 이렇게 안에 같은 모양을 품은 구조입니다. 이 장에서는 그런 구조를 적는 방법인 문법과, 문자열에서 구조를 되찾는 과정인 <T en="parsing">파싱</T>을 봅니다.
      </p>

      <h2>문맥 자유 문법</h2>
      <p>
        <T en="context-free grammar, CFG">문맥 자유 문법</T>은 "무엇은 무엇으로 이루어진다"는 규칙의 모음입니다. 규칙 하나를 <T en="production">생성 규칙</T>이라고 하고, 화살표 왼쪽에는 이름 하나, 오른쪽에는 그것을 이루는 것들의 나열이 옵니다. 다른 규칙으로 더 풀어 쓸 수 있는 이름(expr, term)을 <T en="nonterminal">비단말 기호</T>, 더 풀 수 없는 실제 토큰(+, 숫자)을 <T en="terminal">단말 기호</T>라고 합니다. 사칙연산 식의 문법은 이렇습니다.
      </p>
      <Code label="사칙연산 식의 문법 (EBNF)">{`
expr   → term   (('+' | '-') term)*      // 식은 항을 +, -로 이은 것
term   → factor (('*' | '/') factor)*    // 항은 인수를 *, /로 이은 것
factor → NUMBER | '(' expr ')'           // 인수는 수, 또는 괄호로 감싼 식`}</Code>
      <p>
        시작 기호 expr에서 출발해 규칙으로 비단말 기호를 하나씩 바꿔 쓰면 문자열이 만들어집니다. 이 과정을 <T en="derivation">유도</T>라고 합니다. 예를 들어 expr ⇒ term + term ⇒ factor + term ⇒ 1 + term ⇒ 1 + factor * factor ⇒ … ⇒ 1 + 2 * 3입니다. 이 문법으로 유도할 수 있는 문자열을 모두 모은 것이 문법의 언어입니다. "문맥 자유"라는 이름은 왼쪽에 이름이 하나뿐이라 주변(문맥)에 상관없이 언제든 바꿔 쓸 수 있다는 뜻입니다.
      </p>
      <p>
        마지막 규칙을 보세요. factor 안에 다시 expr이 들어갑니다. 정의가 자기 자신을 품을 수 있다는 것, 이것이 정규 표현식에는 없는 힘입니다. 괄호를 몇 겹 겹치든 같은 규칙이 처리합니다.
      </p>

      <h2>재귀 하강 파서</h2>
      <p>
        문법은 거의 그대로 코드가 됩니다. 비단말 기호마다 함수를 하나 만들고, 규칙의 오른쪽을 왼쪽부터 차례로 따라가며 단말 기호는 토큰을 하나 먹고, 비단말 기호는 그 함수를 부르면 됩니다. <code>*</code> 반복은 <code>while</code> 문이 되고, 고르기는 다음 토큰을 보고 <code>if</code>로 정합니다. 함수들이 서로를, 그리고 괄호를 만나면 다시 자기 자신을 부르며 내려가기 때문에 <T en="recursive descent parser">재귀 하강 파서</T>라고 부릅니다.
      </p>
      <p>
        파싱 앞에는 보통 글자들을 <T en="token">토큰</T>으로 자르는 단계가 있습니다. <code>12+3</code>을 <code>12</code>, <code>+</code>, <code>3</code>으로 자르는 이 단계는 유한 오토마타의 일입니다. 그림 1은 토큰을 받은 파서가 함수를 부르고 돌아오며 나무를 키우는 과정입니다.
      </p>
      <ParserFigure />
      <Code label="재귀 하강 파서이자 계산기">{`
function evaluate(tokens) {          // tokens: ['1', '+', '2', '*', '(', '3', '-', '4', ')']
  let i = 0;
  const peek = () => tokens[i];
  const eat = () => tokens[i++];

  function expr() {                  // expr → term (('+' | '-') term)*
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = eat();
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function term() {                  // term → factor (('*' | '/') factor)*
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = eat();
      const r = factor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function factor() {                // factor → NUMBER | '(' expr ')'
    if (peek() === '(') {
      eat();
      const v = expr();              // 괄호 안은 처음부터 다시: 재귀
      if (eat() !== ')') throw new SyntaxError(') 가 필요합니다');
      return v;
    }
    const n = Number(eat());
    if (Number.isNaN(n)) throw new SyntaxError('수가 필요합니다');
    return n;
  }

  const v = expr();
  if (i < tokens.length) throw new SyntaxError('남은 토큰이 있습니다');
  return v;
}`}</Code>
      <p>
        곱셈이 덧셈보다 먼저 계산되는 이유가 코드에 그대로 보입니다. expr은 term이 다 끝나야 덧셈을 할 수 있고, term은 그 안에서 곱셈을 먼저 마칩니다. <strong>우선순위가 높은 연산일수록 문법의 아래층</strong>에 둔 것입니다. 실제로 JSON 파서, TypeScript와 Babel의 파서, V8의 JavaScript 파서가 모두 이렇게 손으로 쓴 재귀 하강 파서입니다. 재귀 함수의 호출이 쌓이는 모습은 <a href={lessonHref('cs-algorithm-design', 'recursion')}>재귀 장</a>의 호출 스택과 같습니다.
      </p>
      <p>
        파스 트리에는 expr, term, factor처럼 문법을 따라가느라 생긴 중간 단계가 많습니다. 컴파일러는 보통 이것을 걷어 내고 연산과 피연산자만 남긴 <T en="abstract syntax tree, AST">추상 구문 트리</T>를 만듭니다. 그림 1의 "구문 트리"가 그것이고, 코드 포매터, 린터, 번들러가 다루는 것도 이 나무입니다.
      </p>

      <h2>모호한 문법</h2>
      <p>
        식의 문법을 더 짧게 쓸 수도 있습니다. <code>E → E + E | E - E | E * E | E / E | NUMBER</code>. 이 문법도 정확히 같은 문자열들을 만들어 냅니다. 문제는 한 문자열에 파스 트리가 여러 개 생긴다는 것입니다. 이런 문법을 <T en="ambiguous grammar">모호한 문법</T>이라고 합니다.
      </p>
      <AmbiguityFigure />
      <p>
        <code>1 - 2 - 3</code>은 (1 − 2) − 3 = −4로 읽을 수도, 1 − (2 − 3) = 2로 읽을 수도 있습니다. 문법이 구조를 하나로 정해 주지 못하면 계산 결과도 정해지지 않습니다. 그림 1의 문법은 두 가지 방법으로 모호성을 없앴습니다.
      </p>
      <ul>
        <li>
          <strong>우선순위</strong>: 연산자를 층으로 나눕니다. *와 /는 term 층, +와 −는 expr 층이라 곱셈이 언제나 나무의 더 아래, 먼저 계산되는 자리에 옵니다.
        </li>
        <li>
          <strong>결합 방향</strong>: 같은 층의 연산자는 <code>while</code> 반복으로 왼쪽부터 차례로 묶습니다. 그래서 <code>8 / 4 / 2</code>는 (8 / 4) / 2 = 1입니다. 거듭제곱 <code>2 ** 3 ** 2</code>처럼 오른쪽부터 묶어야 하는 연산자는 재귀 호출로 오른쪽을 먼저 묶습니다.
        </li>
      </ul>
      <Callout kind="warn" label="왼쪽 재귀">
        "같은 층의 연산자는 왼쪽부터 묶는다"를 규칙으로 쓰면 <code>expr → expr '-' term | term</code>이 됩니다. 이것을 재귀 하강 파서로 그대로 옮기면 <code>expr()</code>이 아무 토큰도 먹지 않은 채 첫 줄에서 다시 <code>expr()</code>을 불러 끝없이 내려가다 스택이 넘칩니다. 그래서 재귀 하강 파서에서는 이런 <T en="left recursion">왼쪽 재귀</T>를 위의 코드처럼 반복문으로 바꿔 씁니다.
      </Callout>

      <h2>스택 하나를 더하면</h2>
      <p>
        파서가 유한 오토마타보다 강한 이유는 무엇일까요? 재귀 하강 파서는 상태 말고도 <strong>호출 스택</strong>을 씁니다. 괄호 안으로 들어갈 때마다 호출이 하나 쌓이고, 괄호가 닫힐 때 하나 빠집니다. 스택은 얼마든지 깊어질 수 있으니 끝없이 세는 일이 가능해집니다. 괄호 짝 맞추기만 떼어 보면 이 차이가 잘 보입니다.
      </p>
      <ParenFigure />
      <p>
        상태 k개짜리 기계는 깊이를 k − 2까지만 셀 수 있습니다. k를 늘리면 더 깊은 괄호를 다룰 수 있지만, 어떤 k를 고르든 그보다 깊은 입력이 있습니다. 스택은 그런 한도가 없습니다. 유한 오토마타에 스택 하나를 붙인 기계를 <T en="pushdown automaton, PDA">푸시다운 오토마타</T>라고 하고, 이 기계가 인식하는 언어가 정확히 문맥 자유 문법이 만드는 언어입니다. 스택으로 괄호를 검사하는 코드는 <a href={lessonHref('cs-algorithms', 'stack-queue-heap')}>스택·큐·힙 장</a>에 있습니다.
      </p>
      <Callout kind="note" label="정규 표현식으로 HTML을?">
        "정규 표현식으로 HTML을 파싱하지 마세요"는 개발자 사이의 오래된 격언입니다. HTML 태그는 <code>&lt;div&gt;&lt;div&gt;…&lt;/div&gt;&lt;/div&gt;</code>처럼 괄호처럼 겹치기 때문에, 짝을 맞추려면 스택이 필요합니다. 한 줄짜리 정규 표현식은 정해진 깊이까지만 흉내 낼 수 있고, 그보다 깊은 문서에서 조용히 틀립니다. 브라우저는 HTML 전용 파서를 씁니다.
      </Callout>
      <p>기계에 기억을 조금씩 더해 갈 때마다 인식할 수 있는 언어가 넓어집니다. 언어학자 촘스키가 정리한 이 계층은 다음과 같습니다.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>언어</th>
              <th>문법</th>
              <th>기계</th>
              <th>예</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>정규 언어</td>
              <td>정규 표현식</td>
              <td>유한 오토마타 (기억: 상태뿐)</td>
              <td>토큰, 우편번호</td>
            </tr>
            <tr>
              <td>문맥 자유 언어</td>
              <td>문맥 자유 문법</td>
              <td>푸시다운 오토마타 (+ 스택)</td>
              <td>괄호, 식, 대부분의 프로그래밍 언어 구문</td>
            </tr>
            <tr>
              <td>문맥 의존 언어</td>
              <td>문맥 의존 문법</td>
              <td>선형 한정 오토마타 (+ 입력 길이만큼의 테이프)</td>
              <td>
                <M>{'a^n b^n c^n'}</M>
              </td>
            </tr>
            <tr>
              <td>재귀 열거 가능 언어</td>
              <td>제약 없는 문법</td>
              <td>튜링 기계 (+ 끝없는 테이프)</td>
              <td>프로그램이 할 수 있는 모든 것</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        맨 아래 칸의 기계, 끝없는 테이프를 가진 <a href={lessonHref('cs-computation', 'turing-machines')}>튜링 기계</a>가 다음 장의 주제입니다.
      </p>

      <Callout kind="key">
        문맥 자유 문법은 규칙 안에 자기 자신을 품을 수 있어서 겹치는 구조를 적을 수 있습니다. 재귀 하강 파서는 규칙 하나를 함수 하나로 옮긴 것이고, 호출 스택이 유한 오토마타에 없던 기억을 줍니다. 한 문자열에 파스 트리가 여럿이면 문법이 모호한 것이며, 연산자를 층으로 나누고 반복문으로 묶는 방향을 정해 모호성을 없앱니다.
      </Callout>
      <Quiz
        q="그림 1의 문법(expr / term / factor)으로 8 - 3 - 2를 파싱하면, 구문 트리의 맨 위에 오는 연산과 식의 값은?"
        options={['두 번째 −, 값 3', '첫 번째 −, 값 7', '두 번째 −, 값 7', '첫 번째 −, 값 3']}
        answer={0}
        explain={<>expr의 while 반복은 왼쪽부터 묶습니다. 먼저 8 − 3 = 5를 만들고, 그 결과에서 2를 빼므로 나무는 (8 − 3) − 2이고 맨 위는 두 번째 −, 값은 3입니다. 첫 번째 −가 맨 위에 오는 나무 8 − (3 − 2) = 7은 모호한 문법에서만 나옵니다. 그림 2에서 1 − 2 − 3으로 확인해 보세요.</>}
      />
    </>
  );
}
