import { useEffect, useMemo, useRef, useState } from 'react';
import { Callout, Code, Figure, Legend, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { ENV, ParseError, evaluate, layout, parse, render, type Evaluation, type Prim } from './expr';
import { run, type RunState } from './runner';
import { lit, trace, type Program } from './trace';
import { TraceBlock } from './TraceView';
import '../../algorithms/lessons/algorithms.css';
import './programming.css';

/* ─────────────── Figure 1: variables, one line at a time ─────────────── */

const CART_SRC = `
let price = 1200;          // 우유 한 팩 @@p
let qty = 3; @@q
let total = price * qty; @@t
total = total + 3000;      // 배송비 @@ship
const msg = '합계: ' + total + '원'; @@msg
console.log(msg); @@log
`;

const SWAP_BAD_SRC = `
let a = '사과'; @@a
let b = '배'; @@b
// a와 b의 내용을 맞바꾸고 싶다
a = b; @@x
b = a; @@y
`;

const SWAP_GOOD_SRC = `
let a = '사과'; @@a
let b = '배'; @@b
let tmp = a;   // a를 잠시 옮겨 둔다 @@t
a = b; @@x
b = tmp; @@y
`;

const CONST_SRC = `
const rate = 0.1;          // 적립률 10% @@r
let point = 5000 * rate; @@p
point = point + 100; @@q
rate = 0.2;                // 오류! @@bad
`;

type VarPreset = 'cart' | 'swap-bad' | 'swap-good' | 'const';

function buildVarProgram(k: VarPreset): Program {
  if (k === 'cart')
    return trace(CART_SRC, (t) => {
      const price = t.def('price', 1200) as number;
      t.step('p', 'price라는 이름의 변수를 새로 만들고 1200을 담았습니다. let은 "새 변수를 만든다"는 뜻입니다.');
      const qty = t.def('qty', 3) as number;
      t.step('q', 'qty에 3을 담았습니다. 이제 이름 두 개가 각자 값을 하나씩 들고 있습니다.');
      let total = t.def('total', price * qty) as number;
      t.step('t', `오른쪽 식 price * qty를 먼저 계산합니다. price는 1200, qty는 3이므로 ${total}이 total에 담깁니다.`, `= ${total}`);
      total = t.set('total', total + 3000) as number;
      t.step('ship', `오른쪽 total + 3000을 먼저 계산(3600 + 3000)한 뒤, 결과 ${total}을 다시 total에 담습니다. 예전 값 3600은 사라집니다.`, `= ${total}`);
      const msg = t.def('msg', '합계: ' + total + '원') as string;
      t.step('msg', `문자열 '합계: '에 숫자 ${total}을 +로 이으면 숫자가 글자로 바뀌어 붙습니다. msg는 문자열입니다.`);
      t.log(msg);
      t.step('log', 'console.log는 괄호 안의 값을 콘솔에 출력합니다. 변수는 그대로 남아 있습니다.');
    });
  if (k === 'swap-bad')
    return trace(SWAP_BAD_SRC, (t) => {
      let a = t.def('a', '사과') as string;
      t.step('a', "a에 '사과'를 담았습니다.");
      let b = t.def('b', '배') as string;
      t.step('b', "b에 '배'를 담았습니다.");
      a = t.set('a', b) as string;
      t.step('x', "b의 값 '배'를 a에 담았습니다. 이 순간 a에 있던 '사과'는 덮어써져 사라졌습니다.");
      b = t.set('b', a) as string;
      t.step('y', "a의 값을 b에 담았지만, a는 이미 '배'입니다. 둘 다 '배'가 되었고 '사과'는 어디에도 없습니다.", '✗ 실패');
    });
  if (k === 'swap-good')
    return trace(SWAP_GOOD_SRC, (t) => {
      const a0 = t.def('a', '사과');
      t.step('a', "a에 '사과'를 담았습니다.");
      const b0 = t.def('b', '배');
      t.step('b', "b에 '배'를 담았습니다.");
      t.def('tmp', a0);
      t.step('t', "임시 변수 tmp에 a의 값 '사과'를 복사해 둡니다. 이제 a를 덮어써도 '사과'를 잃지 않습니다.");
      t.set('a', b0);
      t.step('x', "a에 b의 값 '배'를 담았습니다.");
      t.set('b', a0);
      t.step('y', "b에 tmp에 보관해 둔 '사과'를 담았습니다. 맞바꾸기 성공.", '✓');
    });
  return trace(CONST_SRC, (t) => {
    const rate = t.def('rate', 0.1) as number;
    t.step('r', 'const로 만든 변수 rate에 0.1을 담았습니다. const는 "이 이름에는 다시 대입하지 않겠다"는 약속입니다.');
    let point = t.def('point', 5000 * rate) as number;
    t.step('p', `5000 * 0.1 = ${point}. let으로 만든 point는 나중에 바꿀 수 있습니다.`);
    point = t.set('point', point + 100) as number;
    t.step('q', `point를 ${point}로 바꿨습니다. let이므로 문제없습니다.`);
    t.step('bad', 'TypeError: Assignment to constant variable. const로 만든 rate에 다시 대입하려 해서 프로그램이 이 줄에서 멈춥니다.', '✗ 오류');
  });
}

function VariablesFigure() {
  const [k, setK] = useState<VarPreset>('cart');
  const program = useMemo(() => buildVarProgram(k), [k]);
  return (
    <Figure
      no={1}
      title="한 줄씩 실행하며 변수 보기"
      hint="▶ 한 단계 앞으로를 눌러 보세요"
      caption={<>왼쪽 노란 줄이 방금 실행한 줄이고, 오른쪽은 그 순간 변수들이 들고 있는 값입니다. 값이 바뀐 변수는 형광펜으로 칠해집니다. 숫자는 파랑, 문자열은 주황으로 적었습니다. 코드는 위에서 아래로 한 줄씩, 정확히 적힌 순서대로 실행됩니다.</>}
    >
      <Seg
        label="프로그램"
        value={k}
        onChange={setK}
        options={[
          { value: 'cart', label: '장바구니 합계' },
          { value: 'swap-bad', label: '맞바꾸기 (실수)' },
          { value: 'swap-good', label: '맞바꾸기 (임시 변수)' },
          { value: 'const', label: 'const와 let' },
        ]}
      />
      <TraceBlock program={program} id="val-trace-speed" />
    </Figure>
  );
}

/* ─────────────── Figure 2: what kind of value is this? ─────────────── */

const CHIPS: { group: string; items: string[] }[] = [
  { group: '숫자', items: ['7 / 2', '7 % 2', '2 ** 10', '0.1 + 0.2', '1 / 0'] },
  { group: '문자열', items: ["'안녕' + '하세요'", "'우유'.length", '`합계 ${1200 * 3}원`'] },
  { group: '섞으면', items: ["'2' + 2", "'2' * 2", "'5' - '2'", "'사과' * 2"] },
  { group: '참·거짓', items: ['3 > 2', "2 === '2'", "2 == '2'", '!true'] },
  { group: '바꾸기', items: ["Number('42')", "Number('42원')", "parseInt('42원')", 'String(42)'] },
  { group: '비어 있음', items: ['undefined', 'null', 'typeof undefined'] },
];

const EXPLAIN: Record<string, string> = {
  '7 / 2': '정수끼리 나눠도 결과는 3.5입니다. JavaScript에는 정수와 실수의 구분 없이 숫자(number) 하나뿐입니다.',
  '7 % 2': '%는 나눈 나머지입니다. 짝수·홀수 판별(n % 2 === 0)이나 "3개마다 한 번"처럼 주기를 셀 때 씁니다.',
  '2 ** 10': '**는 거듭제곱입니다. 2를 10번 곱하면 1024.',
  '0.1 + 0.2': '0.3이 아닙니다! 컴퓨터는 수를 2진수로 저장하는데, 0.1은 2진수로 딱 떨어지지 않아 아주 작은 오차가 생깁니다. 돈 계산은 원 단위 정수로 하는 것이 안전합니다.',
  '1 / 0': '0으로 나누면 오류 대신 특별한 숫자 Infinity가 나옵니다.',
  "'안녕' + '하세요'": '문자열끼리 +는 이어 붙이기입니다.',
  "'우유'.length": '.length는 문자열의 글자 수입니다.',
  '`합계 ${1200 * 3}원`': '백틱(`)으로 감싼 템플릿 문자열 안에서는 ${ } 안의 식이 계산되어 끼워 넣어집니다.',
  "'2' + 2": "한쪽이라도 문자열이면 +는 덧셈이 아니라 이어 붙이기가 됩니다. 숫자 2가 글자 '2'로 바뀌어 '22'.",
  "'2' * 2": '*에는 "이어 붙이기" 뜻이 없으므로 문자열 \'2\'를 숫자 2로 바꿔 곱합니다. 같은 값인데 +와 *의 결과 종류가 다릅니다.',
  "'5' - '2'": '-도 숫자 연산뿐이라 둘 다 숫자로 바꿔 계산합니다.',
  "'사과' * 2": "'사과'는 숫자로 바꿀 수 없어서 NaN(Not a Number, 숫자가 아님)이 됩니다. 자료형은 여전히 number입니다.",
  '3 > 2': '비교 연산의 결과는 참(true) 또는 거짓(false)인 불리언입니다.',
  "2 === '2'": '===는 값과 자료형이 모두 같아야 true입니다. 숫자 2와 문자열 \'2\'는 다릅니다.',
  "2 == '2'": '==는 자료형을 멋대로 맞춘 뒤 비교해서 true가 됩니다. 헷갈리므로 항상 ===를 쓰세요.',
  '!true': '!는 참·거짓을 뒤집습니다.',
  "Number('42')": '사용자가 입력한 값은 대부분 문자열로 들어옵니다. 계산하려면 Number()로 숫자로 바꿉니다.',
  "Number('42원')": '숫자가 아닌 글자가 섞이면 Number()는 NaN을 돌려줍니다.',
  "parseInt('42원')": 'parseInt는 앞에서부터 읽을 수 있는 데까지 정수로 읽습니다.',
  'String(42)': '숫자를 문자열로 바꿉니다. 42 + \'\'로도 같은 결과가 나옵니다.',
  undefined: '"아직 값이 없음". 값을 넣지 않은 변수나 없는 속성을 읽으면 이것이 나옵니다.',
  null: '"일부러 비워 둠"을 뜻하는 값입니다.',
  'typeof undefined': 'typeof는 값의 자료형 이름을 문자열로 알려 줍니다.',
};

const TYPE_KO: Record<string, string> = { number: '숫자', string: '문자열', boolean: '참·거짓', undefined: '값 없음', object: '객체', null: 'null', function: '함수', bigint: '큰 정수', symbol: '심볼' };
const TYPE_T: Record<string, string> = { number: 'num', string: 'str', boolean: 'bool', undefined: 'undef', null: 'null' };

interface Hist {
  expr: string;
  text: string;
  type: string;
  err?: string;
}

function TypeofFigure() {
  const [expr, setExpr] = useState("'2' + 2");
  const [hist, setHist] = useState<Hist[]>([]);
  const [st, setSt] = useState<RunState | null>(null);
  const [shown, setShown] = useState("'2' + 2");
  const cancel = useRef<() => void>(() => {});
  const go = (e: string) => {
    const code = e.trim();
    if (!code) return;
    cancel.current();
    setShown(code);
    cancel.current = run({ code, expr: true }, (s) => {
      setSt(s);
      if (s.status === 'done' && s.value) setHist((h) => [{ expr: code, text: s.value!.text, type: s.value!.type }, ...h.filter((x) => x.expr !== code)].slice(0, 6));
      if (s.status === 'error' || s.status === 'timeout') setHist((h) => [{ expr: code, text: '오류', type: '', err: s.error?.title }, ...h.filter((x) => x.expr !== code)].slice(0, 6));
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => (go("'2' + 2"), () => cancel.current()), []);

  const v = st?.value;
  return (
    <Figure
      no={2}
      title="값과 자료형 탐색기"
      hint="버튼을 누르거나 식을 직접 써 보세요"
      caption={<>식은 페이지와 분리된 작업자(Web Worker)에서 진짜 JavaScript로 계산됩니다. 결과 값과 typeof가 알려 주는 자료형을 함께 보여 줍니다. 문자열에는 따옴표를 붙여 숫자와 구별했습니다.</>}
    >
        <div className="chip-groups">
          {CHIPS.map((g) => (
            <div key={g.group} className="chip-group">
              <span className="chip-group-label">{g.group}</span>
              <div className="chip-row">
                {g.items.map((it) => (
                  <button
                    key={it}
                    type="button"
                    className="chip"
                    aria-pressed={shown === it}
                    onClick={() => {
                      setExpr(it);
                      go(it);
                    }}
                  >
                    {it}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              go(expr);
            }}
          >
            <label className="visually-hidden" htmlFor="val-expr">
              계산할 식
            </label>
            <input id="val-expr" className="text-input mono" value={expr} onChange={(e) => setExpr(e.target.value)} spellCheck={false} autoCapitalize="off" autoComplete="off" />
            <button type="submit" className="btn primary small">
              계산
            </button>
          </form>
          <div className="val-result" aria-live="polite">
            <div className="mono" style={{ gridColumn: '1 / -1', fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>
              {shown}
            </div>
            {st?.status === 'running' && <span className="tr-empty">계산 중…</span>}
            {v && (
              <>
                <span className="tr-val" data-t={TYPE_T[v.type] ?? 'fn'}>
                  {v.text}
                </span>
                <span className="val-type" style={{ color: v.type === 'number' ? 'var(--neg)' : v.type === 'string' ? 'var(--pos)' : v.type === 'boolean' ? 'var(--good)' : 'var(--ink-3)' }}>
                  {v.type} · {TYPE_KO[v.type] ?? v.type}
                </span>
              </>
            )}
            {(st?.status === 'error' || st?.status === 'timeout') && st.error && (
              <span className="run-err-cell" style={{ gridColumn: '1 / -1', fontSize: 'var(--fs-sm)' }}>
                {st.error.title}
              </span>
            )}
            {EXPLAIN[shown] && v && <div className="val-expl">{EXPLAIN[shown]}</div>}
          </div>
          {hist.length > 1 && (
            <div className="val-hist" aria-label="최근 계산">
              {hist.slice(1).map((h) => (
                <div key={h.expr}>
                  <span>{h.expr}</span>
                  <span className="tr-val" data-t={h.err ? 'undef' : TYPE_T[h.type] ?? 'fn'}>
                    {h.text}
                  </span>
                  <span style={{ color: 'var(--ink-3)' }}>{h.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: precedence as a tree ─────────────── */

const EXPRS = ['2 + 3 * 4', '(2 + 3) * 4', '10 - 4 - 3', 'price * qty + 3000', "'합계: ' + 2 + 3", "'합계: ' + (2 + 3)", 'qty > 5 || member', 'score >= 80 && score < 90'];

function typeColor(P: Palette, v: Prim): string {
  if (typeof v === 'number') return P.neg;
  if (typeof v === 'string') return P.pos;
  if (typeof v === 'boolean') return P.good;
  return P.ink3;
}

function TreeFigure() {
  const P = usePalette();
  const [src, setSrc] = useState('2 + 3 * 4');
  const [typed, setTyped] = useState('2 + 3 * 4');
  const parsed = useMemo((): { ev: Evaluation; err?: undefined } | { ev?: undefined; err: string } => {
    try {
      return { ev: evaluate(parse(src)) };
    } catch (e) {
      if (e instanceof ParseError) return { err: e.message };
      throw e;
    }
  }, [src]);
  const ev = parsed.ev;
  const lay = useMemo(() => (ev ? layout(ev.root) : null), [ev]);
  const s = useStepper(ev ? ev.steps.length + 1 : 1, 1, src);
  const i = s.i;
  const state = ev?.states[i];
  const next = ev?.steps[i]?.target ?? -1;
  const just = i > 0 ? ev?.steps[i - 1].target ?? -1 : -1;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      if (!ev || !lay || !state) return;
      const pad = 18;
      const top = 26;
      const dy = lay.depth ? Math.min(64, (h - top - 34) / lay.depth) : 0;
      const sp = (w - 2 * pad) / lay.width;
      const X = (x: number) => pad + (x + 0.5) * sp;
      const Y = (d: number) => top + d * dy;
      const byId = new Map(lay.nodes.map((n) => [n.id, n]));
      // a node is "absorbed" once its parent has been computed: it fades out
      const absorbed = (id: number) => {
        const n = byId.get(id);
        return !!n && n.parent >= 0 && state.vals.has(n.parent);
      };
      for (const n of lay.nodes) {
        if (n.parent < 0) continue;
        const p = byId.get(n.parent)!;
        ctx.strokeStyle = state.skipped.has(n.id) ? alpha(P.ink3, 0.35) : absorbed(n.id) ? alpha(P.ink3, 0.25) : P.lineStrong;
        ctx.lineWidth = 1.4;
        ctx.setLineDash(state.skipped.has(n.id) ? [3, 3] : []);
        ctx.beginPath();
        ctx.moveTo(X(p.x), Y(p.depth));
        ctx.lineTo(X(n.x), Y(n.depth));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const n of lay.nodes) {
        const x = X(n.x);
        const y = Y(n.depth);
        const has = state.vals.has(n.id);
        const skip = state.skipped.has(n.id);
        const fade = absorbed(n.id) || skip;
        ctx.globalAlpha = fade ? 0.32 : 1;
        if (has) {
          const v = state.vals.get(n.id);
          const text = lit(v);
          let fs = 13;
          ctx.font = `600 ${fs}px ${P.fontMono}`;
          let tw = ctx.measureText(text).width;
          if (tw > sp * 1.7 && fs > 10) {
            fs = 10.5;
            ctx.font = `600 ${fs}px ${P.fontMono}`;
            tw = ctx.measureText(text).width;
          }
          const bw = Math.max(28, tw + 12);
          const col = typeColor(P, v);
          ctx.fillStyle = n.id === just ? alpha(P.hl, 0.45) : alpha(col, 0.12);
          ctx.fillRect(x - bw / 2, y - 13, bw, 26);
          ctx.strokeStyle = col;
          ctx.lineWidth = n.id === just ? 2.2 : 1.3;
          ctx.strokeRect(x - bw / 2, y - 13, bw, 26);
          ctx.fillStyle = col;
          ctx.fillText(text, x, y + 1);
        } else if (n.kind === 'var') {
          ctx.font = `600 13px ${P.fontMono}`;
          const bw = ctx.measureText(n.label).width + 14;
          ctx.fillStyle = P.surface;
          ctx.fillRect(x - bw / 2, y - 13, bw, 26);
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = skip ? P.ink3 : P.ink;
          ctx.lineWidth = 1.3;
          ctx.strokeRect(x - bw / 2, y - 13, bw, 26);
          ctx.setLineDash([]);
          ctx.fillStyle = P.ink;
          ctx.fillText(n.label, x, y + 1);
        } else {
          ctx.beginPath();
          ctx.arc(x, y, 16, 0, Math.PI * 2);
          ctx.fillStyle = P.surface;
          ctx.fill();
          ctx.strokeStyle = skip ? P.ink3 : P.ink;
          ctx.lineWidth = 1.6;
          ctx.setLineDash(skip ? [3, 3] : []);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = P.ink;
          ctx.font = `700 ${n.label.length > 2 ? 11 : 14}px ${P.fontMono}`;
          ctx.fillText(n.label, x, y + 1);
        }
        if (n.id === next) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = P.hl;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, 21, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (skip && n.parent >= 0 && !state.skipped.has(n.parent)) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = P.ink3;
          ctx.font = `11px ${P.fontBody}`;
          ctx.fillText('건너뜀', x, y + 26);
        }
        ctx.globalAlpha = 1;
      }
    },
    [P, ev, lay, state, next, just],
    { height: lay ? 26 + lay.depth * 64 + 40 : 200, maxHeight: 360, minHeight: 150 },
  );

  const note = !ev ? '' : i === 0 ? '아직 아무것도 계산하지 않았습니다. 노란 고리가 가장 먼저 계산할 연산입니다.' : ev.steps[i - 1].note;

  return (
    <Figure
      no={3}
      title="식이 계산되는 순서"
      hint="식을 고르고 한 단계씩 계산해 보세요"
      caption={<>식을 트리로 그렸습니다. 아래쪽 연산일수록 먼저 계산되고, 계산이 끝난 연산은 결과 값 상자로 바뀝니다. 노란 고리는 다음에 계산할 곳, 노랗게 칠한 상자는 방금 계산한 곳입니다. 계산 사다리는 같은 과정을 식의 모양으로 보여 줍니다. 쓸 수 있는 변수: {Object.entries(ENV).map(([k, v]) => `${k} = ${lit(v)}`).join(', ')}.</>}
    >
      <div className="chip-row" role="group" aria-label="미리 준비한 식">
        {EXPRS.map((e) => (
          <button
            key={e}
            type="button"
            className="chip"
            aria-pressed={src === e}
            onClick={() => {
              setSrc(e);
              setTyped(e);
            }}
          >
            {e}
          </button>
        ))}
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSrc(typed.trim());
        }}
      >
        <label className="visually-hidden" htmlFor="val-tree-expr">
          트리로 볼 식
        </label>
        <input id="val-tree-expr" className="text-input mono" value={typed} onChange={(e) => setTyped(e.target.value)} spellCheck={false} autoCapitalize="off" autoComplete="off" maxLength={70} />
        <button type="submit" className="btn small">
          트리 그리기
        </button>
      </form>
      {parsed.err ? (
        <div className="run-error" role="alert">
          {parsed.err}
        </div>
      ) : (
        ev && (
          <>
            <div className="fig-split">
              <div ref={wrapRef} className="canvas-box" role="img" aria-label={`식 ${src}의 계산 트리. ${i}단계까지 계산함. 최종 값 ${lit(ev.value)}`}>
                <canvas ref={canvasRef} />
              </div>
              <div className="ladder" aria-label="계산 사다리">
                {ev.states.slice(0, i + 1).map((stt, k) => (
                  <div key={k} className="ladder-row" data-cur={k === i || undefined}>
                    <span className="k">{k === 0 ? '식' : `${k}`}</span>
                    <span>
                      {render(ev.root, stt, ev.steps[k]?.target ?? -1).map((g, j) =>
                        g.hl ? (
                          <span key={j} className="ladder-hl">
                            {g.s}
                          </span>
                        ) : (
                          <span key={j}>{g.s}</span>
                        ),
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="note-line" aria-live="polite">
              {note}
            </div>
            <div className="controls row">
              <div className="ctl" style={{ flex: '1 1 300px' }}>
                <StepControls s={s} id="val-tree-speed" maxSpeed={6} />
              </div>
              <div className="readouts" style={{ flex: '1 1 200px', gridTemplateColumns: '1fr 1fr' }}>
                <Readout label="계산 단계" value={`${ev.steps.length}번`} />
                <Readout label="최종 값" value={i === ev.steps.length ? lit(ev.value) : '…'} color={i === ev.steps.length ? (typeof ev.value === 'string' ? 'var(--pos)' : typeof ev.value === 'boolean' ? 'var(--good)' : 'var(--neg)') : undefined} />
              </div>
            </div>
            <Legend
              items={[
                { color: 'var(--neg)', label: '숫자', shape: 'sq' },
                { color: 'var(--pos)', label: '문자열', shape: 'sq' },
                { color: 'var(--good)', label: '참·거짓', shape: 'sq' },
                { color: 'var(--hl)', label: '다음 계산 / 방금 계산', shape: 'dot' },
              ]}
            />
          </>
        )
      )}
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Values() {
  return (
    <>
      <h2>프로그램은 값에서 시작합니다</h2>
      <p>
        <T en="program">프로그램</T>은 컴퓨터에게 시킬 일을 순서대로 적은 글입니다. 컴퓨터는 이 글을 위에서 아래로 한 줄씩, 적힌 그대로 실행합니다. 눈치껏 알아듣지도, 빠진 줄을 채워 넣지도 않습니다. 그래서 프로그래밍을 배운다는 것은 "컴퓨터가 이 줄을 읽으면 정확히 무슨 일이 일어나는가"를 머릿속에서 따라갈 수 있게 되는 것입니다.
      </p>
      <p>
        이 과목은 <T en="JavaScript">JavaScript</T>를 씁니다. 모든 웹 브라우저에 들어 있어서 따로 설치할 것이 없고, 이 사이트의 다른 과목들도 JavaScript로 예제를 보여 줍니다. 모든 계산의 재료는 <T en="value">값</T>입니다. 가장 기본적인 값은 세 종류입니다.
      </p>
      <Code label="기본 값 세 가지">{`
1200          // 숫자 (number): 가격, 개수, 점수
'우유'         // 문자열 (string): 따옴표로 감싼 글자들
true          // 불리언 (boolean): 참(true) 아니면 거짓(false)

console.log('안녕하세요');   // 괄호 안의 값을 화면(콘솔)에 출력한다`}</Code>
      <p>
        문자열은 작은따옴표(<code>'</code>)나 큰따옴표(<code>"</code>)로 감쌉니다. 따옴표가 있으면 <code>'1200'</code>도 숫자가 아니라 글자 네 개짜리 문자열이라는 점이 중요합니다. 이 차이가 이 장 뒷부분에서 흔한 실수를 만듭니다.
      </p>

      <h2>변수: 값에 이름 붙이기</h2>
      <p>
        계산한 값을 나중에 다시 쓰려면 이름을 붙여 두어야 합니다. 이름이 붙은 값의 자리를 <T en="variable">변수</T>라고 합니다. <code>let price = 1200;</code>은 "price라는 변수를 새로 만들고 1200을 담아라"라는 뜻입니다. 변수를 이름표가 붙은 상자라고 생각하면 편합니다. 상자에는 한 번에 값 하나만 들어가고, 새 값을 넣으면 예전 값은 사라집니다.
      </p>
      <VariablesFigure />
      <p>
        그림 1의 장바구니 프로그램에서 네 번째 줄 <code>total = total + 3000;</code>을 보세요. 수학 시간에 이런 식을 봤다면 말이 안 된다고 했을 겁니다. 하지만 프로그래밍에서 <code>=</code>은 "같다"가 아니라 <T en="assignment">대입</T>입니다. 오른쪽을 먼저 계산하고, 그 결과를 왼쪽 변수에 담습니다. 그래서 이 줄은 "total을 3000만큼 늘려라"가 됩니다.
      </p>
      <Callout kind="key">
        <code>=</code>은 오른쪽 식을 계산해 왼쪽 이름에 담는 명령입니다. 두 값이 같은지 물을 때는 <code>===</code>를 씁니다. 대입은 순서가 있는 동작이라, 같은 줄이라도 언제 실행되느냐에 따라 결과가 달라집니다.
      </Callout>
      <p>
        "맞바꾸기 (실수)"를 골라 보세요. <code>a = b;</code>가 실행되는 순간 a에 있던 '사과'는 덮어써져 사라집니다. 그다음 <code>b = a;</code>는 이미 '배'가 된 a를 복사할 뿐입니다. 해결책은 "임시 변수" 프리셋처럼 잃어버릴 값을 다른 상자에 먼저 옮겨 두는 것입니다. 이렇게 한 줄씩 상자의 내용을 따라가 보는 습관이 앞으로 모든 디버깅의 기초가 됩니다.
      </p>
      <Callout kind="note" label="let과 const">
        <code>let</code>으로 만든 변수는 나중에 새 값을 대입할 수 있고, <code>const</code>로 만든 변수는 처음 담은 값을 바꿀 수 없습니다. 실무에서는 일단 <code>const</code>로 쓰고, 정말 바뀌어야 하는 값만 <code>let</code>으로 씁니다. 바뀌지 않는다고 약속된 이름이 많을수록 코드를 읽기가 쉬워집니다. 그림 1의 "const와 let" 프리셋에서 약속을 어기면 어떻게 되는지 보세요.
      </Callout>
      <p>
        변수 이름은 담긴 값이 무엇인지 알려 주도록 짓습니다. <code>x</code>, <code>a1</code>보다 <code>price</code>, <code>qty</code>, <code>totalPrice</code>가 낫습니다. JavaScript에서는 여러 단어를 이을 때 두 번째 단어부터 첫 글자를 대문자로 쓰는 <T en="camelCase">카멜 표기</T>를 많이 씁니다.
      </p>

      <h2>자료형: 값의 종류가 계산을 바꾼다</h2>
      <p>
        값마다 <T en="type">자료형</T>이 있습니다. 같은 <code>+</code> 기호도 숫자끼리는 덧셈, 문자열끼리는 이어 붙이기입니다. 그럼 숫자와 문자열을 섞으면 어떻게 될까요? <code>typeof</code> 연산자는 값의 자료형 이름을 알려 줍니다. 그림 2에서 "섞으면" 줄의 버튼들을 눌러 보세요.
      </p>
      <TypeofFigure />
      <p>
        <code>'2' + 2</code>는 <code>'22'</code>이고 <code>'2' * 2</code>는 <code>4</code>입니다. JavaScript는 자료형이 맞지 않으면 오류를 내는 대신 한쪽을 다른 자료형으로 슬쩍 바꿔서 계산합니다. 이것을 <T en="type coercion">암묵적 형 변환</T>이라고 합니다. <code>+</code>는 한쪽이 문자열이면 이어 붙이기를 고르고, <code>*</code>, <code>-</code>, <code>/</code>는 숫자 연산밖에 없으니 문자열을 숫자로 바꿉니다.
      </p>
      <Callout kind="warn">
        웹 페이지의 입력 칸에 사용자가 쓴 값은 숫자처럼 보여도 문자열로 들어옵니다. 수량 칸에 3을 쓰고 <code>qty + 1</code>을 하면 4가 아니라 <code>'31'</code>이 됩니다. 입력을 받으면 먼저 <code>Number(qty)</code>로 바꾸고 시작하세요. 변환에 실패하면 <code>NaN</code>이 나오므로 그것도 확인해야 합니다.
      </Callout>
      <p>
        숫자에도 함정이 있습니다. <code>0.1 + 0.2</code>를 눌러 보면 <code>0.30000000000000004</code>가 나옵니다. JavaScript가 틀린 것이 아니라, 컴퓨터가 소수를 2진수로 저장하기 때문에 생기는 오차입니다. 10진수에서 1/3이 0.333…으로 끝나지 않듯, 0.1은 2진수로 끝나지 않습니다. 왜 그런지는 <a href={lessonHref('cs-architecture', 'binary')}>컴퓨터 구조의 2진수 장</a>에서 비트를 직접 켜 보며 확인할 수 있습니다. 실무에서는 돈을 원 단위 정수로 계산하고, 소수를 비교할 때는 "충분히 가까운가"를 봅니다.
      </p>

      <h2>식이 계산되는 순서</h2>
      <p>
        값과 변수를 연산자로 묶은 것을 <T en="expression">식</T>이라고 합니다. 식은 계산되면 값 하나가 됩니다. 식에 연산자가 여러 개 있으면 어느 것부터 계산할지가 중요한데, 학교에서 배운 대로 곱셈·나눗셈이 덧셈·뺄셈보다 먼저입니다. 이 규칙을 <T en="operator precedence">연산자 우선순위</T>라고 합니다.
      </p>
      <TreeFigure />
      <p>
        그림 3의 첫 두 식을 비교해 보세요. <code>2 + 3 * 4</code>는 트리에서 <code>*</code>가 아래에 있어 먼저 계산되고 14가 됩니다. 괄호를 친 <code>(2 + 3) * 4</code>는 트리 모양 자체가 바뀌어 20이 됩니다. 같은 우선순위끼리는 왼쪽부터 계산하므로 <code>10 - 4 - 3</code>은 <code>(10 - 4) - 3 = 3</code>입니다.
      </p>
      <p>
        <code>{"'합계: ' + 2 + 3"}</code>은 많은 사람이 실수하는 식입니다. 왼쪽부터 계산하므로 먼저 <code>{"'합계: ' + 2"}</code>가 문자열 <code>{"'합계: 2'"}</code>가 되고, 거기에 3을 이어 붙여 <code>{"'합계: 23'"}</code>이 됩니다. 합을 원했다면 <code>{"'합계: ' + (2 + 3)"}</code>처럼 괄호를 쳐야 합니다.
      </p>
      <Code label="비교와 논리 연산">{`
score >= 80                  // 비교: 결과는 true 또는 false
score >= 80 && score < 90    // && (그리고): 둘 다 참이어야 참
qty > 5 || member            // || (또는): 하나만 참이어도 참
!member                      // ! (아니다): 참과 거짓을 뒤집는다`}</Code>
      <p>
        <code>&&</code>와 <code>||</code>는 왼쪽만 보고 답이 정해지면 오른쪽을 아예 계산하지 않습니다. <code>qty &gt; 5 || member</code>를 그림 3에서 보면, 왼쪽이 false라서 오른쪽까지 봅니다. 반대로 <code>{'member || qty > 5'}</code>를 직접 입력해 보면 왼쪽이 이미 true라 오른쪽은 "건너뜀"이 됩니다. 이 성질을 <T en="short-circuit evaluation">단락 평가</T>라고 하며, 다음 장의 조건문에서 자주 씁니다.
      </p>
      <Callout kind="intuition">
        우선순위 표를 외울 필요는 없습니다. 헷갈리면 괄호를 치세요. 괄호는 계산 결과를 바꾸지 않을 때도 읽는 사람에게 의도를 알려 줍니다. <code>price * qty + shipping</code>보다 <code>(price * qty) + shipping</code>이 더 빨리 읽히는 사람도 많습니다.
      </Callout>

      <Callout kind="key">
        프로그램은 값을 만들고(<code>1200</code>, <code>'우유'</code>), 이름에 담고(<code>let</code>, <code>const</code>), 식으로 계산합니다. <code>=</code>은 대입이고, 같은 연산자라도 자료형에 따라 동작이 다르며, 식은 우선순위와 왼쪽부터의 규칙에 따라 한 단계씩 값 하나로 줄어듭니다.
      </Callout>
      <Quiz
        q={
          <>
            다음 코드를 실행한 뒤 <code>total</code>에 담긴 값은? <code>{"let total = '1000'; total = total + 500;"}</code>
          </>
        }
        options={[<code key="a">1500</code>, <code key="b">'1000500'</code>, <code key="c">'1500'</code>, <>오류가 나서 멈춘다</>]}
        answer={1}
        explain={
          <>
            처음 담은 <code>'1000'</code>은 따옴표가 있으므로 문자열입니다. 문자열에 <code>+</code>를 하면 500이 글자 '500'으로 바뀌어 이어 붙으므로 <code>'1000500'</code>이 됩니다. 숫자 덧셈을 원했다면 <code>Number(total) + 500</code>처럼 먼저 숫자로 바꿔야 합니다.
          </>
        }
      />
    </>
  );
}
