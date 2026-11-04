import { useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { drawArrow } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { RunBox, type Task } from './RunBox';
import { trace, type Program } from './trace';
import { CodeView, TraceBlock } from './TraceView';
import './programming.css';

/* ─────────────── Figure 1: which branch runs? ─────────────── */

interface Cond {
  th: number;
  g: string;
}
const RIGHT: Cond[] = [
  { th: 90, g: 'A' },
  { th: 80, g: 'B' },
  { th: 70, g: 'C' },
];
const ELSE = 'F';
const GRADE_CSS: Record<string, string> = { A: 'var(--good)', B: 'var(--neg)', C: 'var(--hl)', F: 'var(--bad)' };
const gradeColor = (P: Palette, g: string) => ({ A: P.good, B: P.neg, C: P.hl, F: P.bad })[g] ?? P.ink3;

function gradeOf(conds: Cond[], score: number): { g: string; checked: number } {
  for (let k = 0; k < conds.length; k++) if (score >= conds[k].th) return { g: conds[k].g, checked: k + 1 };
  return { g: ELSE, checked: conds.length };
}

/** if / else if / else source for a list of conditions; cond k sits on line 2 + 2k, its body on 3 + 2k. */
function branchSource(conds: Cond[], score: number): string[] {
  const lines = [`let score = ${score};`, 'let grade;'];
  conds.forEach((c, k) => {
    lines.push(`${k ? '} else if' : 'if'} (score >= ${c.th}) {`);
    lines.push(`  grade = '${c.g}';`);
  });
  lines.push('} else {', `  grade = '${ELSE}';`, '}', 'console.log(grade);');
  return lines;
}

function BranchFigure() {
  const P = usePalette();
  const [score, setScore] = useState(72);
  const [flip, setFlip] = useState(false);
  const conds = flip ? [...RIGHT].reverse() : RIGHT;
  const { g, checked } = gradeOf(conds, score);
  const taken = conds.findIndex((c) => score >= c.th); // -1: else
  const lines = branchSource(conds, score);
  const nC = conds.length;
  const elseLine = 2 + 2 * nC;

  const ran = new Set<number>([0, 1, lines.length - 1]);
  const anns: Record<number, string> = {};
  for (let k = 0; k < checked; k++) {
    ran.add(2 + 2 * k);
    anns[2 + 2 * k] = `${score} >= ${conds[k].th} → ${score >= conds[k].th}`;
  }
  if (taken >= 0) ran.add(3 + 2 * taken);
  else (ran.add(elseLine), ran.add(elseLine + 1));
  anns[lines.length - 1] = `출력: ${g}`;

  // grade bands over 0..100 for the current order of conditions
  const bands = useMemo(() => {
    const out: { from: number; to: number; g: string }[] = [];
    for (let s = 0; s <= 100; s++) {
      const gg = gradeOf(conds, s).g;
      const last = out[out.length - 1];
      if (last && last.g === gg) last.to = s;
      else out.push({ from: s, to: s, g: gg });
    }
    return out;
  }, [conds]);

  const rowH = 60;
  const height = rowH * (nC + 3) + 10;
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w }) => {
      const cx = Math.min(w * (w < 520 ? 0.3 : 0.36), 170);
      const rx = Math.min(w * 0.68, cx + 190);
      const rail = Math.min(w - 10, rx + 66);
      const y = (r: number) => 26 + r * rowH;
      const on = P.pos;
      const off = alpha(P.ink3, 0.55);
      const box = (x: number, yy: number, text: string, active: boolean, fill?: string) => {
        ctx.font = `600 12px ${P.fontMono}`;
        const bw = Math.max(70, ctx.measureText(text).width + 18);
        ctx.fillStyle = fill ?? P.surface;
        ctx.fillRect(x - bw / 2, yy - 14, bw, 28);
        ctx.strokeStyle = active ? on : P.lineStrong;
        ctx.lineWidth = active ? 2.4 : 1.2;
        ctx.strokeRect(x - bw / 2, yy - 14, bw, 28);
        ctx.fillStyle = active ? P.ink : P.ink3;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, yy + 1);
        return bw;
      };
      const label = (text: string, x: number, yy: number, active: boolean) => {
        ctx.font = `11px ${P.fontBody}`;
        ctx.fillStyle = active ? P.ink : P.ink3;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, yy);
      };
      // start
      box(cx, y(0), `score = ${score}`, true);
      drawArrow(ctx, cx, y(0) + 14, cx, y(1) - 20, on, 2.2, 8);
      conds.forEach((c, k) => {
        const yy = y(1 + k);
        const reached = k < checked;
        const yes = k === taken;
        // diamond
        const dw = Math.max(44, Math.min(84, cx - 8, rx - 55 - cx - 22));
        ctx.beginPath();
        ctx.moveTo(cx, yy - 20);
        ctx.lineTo(cx + dw, yy);
        ctx.lineTo(cx, yy + 20);
        ctx.lineTo(cx - dw, yy);
        ctx.closePath();
        ctx.fillStyle = reached ? alpha(P.pos, 0.1) : P.surface;
        ctx.fill();
        ctx.strokeStyle = reached ? on : P.lineStrong;
        ctx.lineWidth = reached ? 2.2 : 1.2;
        ctx.stroke();
        ctx.font = `600 12px ${P.fontMono}`;
        ctx.fillStyle = reached ? P.ink : P.ink3;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`>= ${c.th}?`, cx, yy + 1);
        // yes → grade box
        drawArrow(ctx, cx + dw, yy, rx - 40, yy, yes ? on : off, yes ? 2.2 : 1.2, 7);
        label('예', (cx + dw + rx - 40) / 2, yy - 9, yes);
        box(rx, yy, `grade = '${c.g}'`, yes, yes ? alpha(gradeColor(P, c.g), 0.22) : undefined);
        // no → next
        const down = reached && !yes;
        drawArrow(ctx, cx, yy + 20, cx, y(2 + k) - (k === nC - 1 ? 14 : 20), down ? on : off, down ? 2.2 : 1.2, 7);
        ctx.textAlign = 'left';
        ctx.font = `11px ${P.fontBody}`;
        ctx.fillStyle = down ? P.ink : P.ink3;
        ctx.fillText('아니오', cx + 7, yy + 31);
      });
      const ye = y(1 + nC);
      box(cx, ye, `grade = '${ELSE}'`, taken < 0, taken < 0 ? alpha(gradeColor(P, ELSE), 0.22) : undefined);
      // all paths meet at the output
      const yo = y(2 + nC);
      ctx.strokeStyle = off;
      ctx.lineWidth = 1.2;
      [...conds.keys()].sort((a, b) => (a === taken ? 1 : b === taken ? -1 : 0)).forEach((k) => {
        const yes = k === taken;
        ctx.strokeStyle = yes ? on : off;
        ctx.lineWidth = yes ? 2.2 : 1.2;
        ctx.beginPath();
        ctx.moveTo(rx + 52, y(1 + k));
        ctx.lineTo(rail, y(1 + k));
        ctx.lineTo(rail, yo);
        ctx.stroke();
      });
      drawArrow(ctx, rail, yo, cx + 64, yo, taken >= 0 ? on : off, taken >= 0 ? 2.2 : 1.2, 7);
      drawArrow(ctx, cx, ye + 14, cx, yo - 14, taken < 0 ? on : off, taken < 0 ? 2.2 : 1.2, 7);
      box(cx, yo, `출력 ${g}`, true, alpha(gradeColor(P, g), 0.22));
    },
    [P, score, flip, conds, checked, taken, g],
    { height, maxHeight: height, minHeight: height },
  );

  return (
    <Figure
      no={1}
      title="점수에 따라 갈라지는 길"
      hint="점수를 움직여 보세요"
      caption={<>왼쪽 코드에서 진하게 남은 줄이 실제로 실행된 줄이고, 흐린 줄은 건너뛴 줄입니다. 조건을 검사한 줄 끝에는 그 결과(true/false)를 붙였습니다. 오른쪽 순서도의 주황 경로가 같은 흐름입니다. 아래 띠는 0~100점이 각각 어떤 학점이 되는지 보여 줍니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <CodeView lines={lines} cur={-1} ran={ran} anns={anns} label="학점을 매기는 코드" />
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`순서도: 점수 ${score}점은 조건을 ${checked}번 검사한 뒤 학점 ${g}로 갑니다`}>
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Slider label="점수 score" value={score} min={0} max={100} step={1} onChange={setScore} color="var(--pos)" />
          <div>
            <div className="range-strip" aria-hidden="true">
              {bands.map((b) => (
                <span key={b.from} style={{ width: `${((b.to - b.from + 1) / 101) * 100}%`, background: `color-mix(in srgb, ${GRADE_CSS[b.g]} 30%, transparent)` }}>
                  {b.to - b.from >= 6 ? b.g : ''}
                </span>
              ))}
              <i className="range-pin" style={{ left: `${((score + 0.5) / 101) * 100}%` }} />
            </div>
            <div className="range-axis">
              <span>0</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>
          <Check label="조건 순서를 거꾸로 (흔한 실수)" checked={flip} onChange={setFlip} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="학점" value={g} color={GRADE_CSS[g]} />
            <Readout label="검사한 조건" value={`${checked}개`} />
          </div>
          <div className="note-line">
            {flip
              ? score >= 90
                ? `${score}점인데 첫 조건 score >= 70이 먼저 참이 되어 C에서 멈춥니다. 뒤의 조건은 보지도 않습니다.`
                : '거꾸로 된 순서에서는 70점 이상이 모두 첫 조건에 걸립니다. 띠에서 A와 B가 사라진 것을 보세요.'
              : score === 89 || score === 90
                ? '89점과 90점 사이가 경계입니다. >=를 >로 잘못 쓰면 90점이 B가 됩니다.'
                : '조건은 위에서부터 검사하고, 처음으로 참이 된 블록 하나만 실행합니다.'}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: loops, one pass at a time ─────────────── */

const SUM_SRC = (n: number) => `
const n = ${n}; @@n
let sum = 0; @@s
for (let i = 1; i <= n; i++) { @@for
  sum = sum + i; @@body
} @@end
console.log(sum); @@log
`;

const SAVE_SRC = (weekly: number) => `
const goal = 10000;        // 목표 금액 @@g
let saved = 0; @@s
let weeks = 0; @@w
while (saved < goal) { @@wh
  saved = saved + ${weekly}; @@add
  weeks = weeks + 1; @@wk
} @@end
console.log(weeks + '주 걸림'); @@log
`;

function sumProgram(n: number): Program {
  return trace(SUM_SRC(n), (t) => {
    t.def('n', n);
    t.step('n', `n에 ${n}을 담았습니다. 1부터 n까지 더할 것입니다.`);
    let sum = t.def('sum', 0) as number;
    t.step('s', '합계를 모을 변수 sum을 0으로 시작합니다.');
    let i = t.def('i', 1) as number;
    let round = 1;
    t.step('for', `반복 변수 i를 1로 만들고 조건 i <= n을 검사합니다. 1 <= ${n}이므로 참, 몸통으로 들어갑니다.`, `1 <= ${n} → true`);
    for (;;) {
      sum = t.set('sum', sum + i) as number;
      t.step('body', `${round}번째 반복: sum에 i(${i})를 더해 ${sum}이 되었습니다.`);
      i = t.set('i', i + 1) as number;
      round++;
      if (i <= n) t.step('for', `몸통이 끝나면 i++로 i를 ${i}로 늘리고 다시 조건을 검사합니다. ${i} <= ${n}이므로 한 번 더.`, `i=${i}, ${i} <= ${n} → true`);
      else {
        t.step('for', `i가 ${i}가 되자 ${i} <= ${n}이 거짓입니다. 반복을 끝내고 } 다음 줄로 갑니다.`, `i=${i}, ${i} <= ${n} → false`);
        break;
      }
    }
    t.drop('i');
    t.log(sum);
    t.step('log', `합계 ${sum}을 출력합니다. i는 for 블록 안에서만 살아 있어서 이제 사라졌습니다. 몸통은 모두 ${n}번 실행되었습니다.`);
  });
}

function saveProgram(weekly: number): Program {
  return trace(SAVE_SRC(weekly), (t) => {
    const goal = t.def('goal', 10000) as number;
    t.step('g', '목표 금액 10000원.');
    let saved = t.def('saved', 0) as number;
    t.step('s', '모은 돈 saved는 0원에서 시작합니다.');
    let weeks = t.def('weeks', 0) as number;
    t.step('w', '몇 주 걸렸는지 셀 weeks도 0.');
    for (;;) {
      const ok = saved < goal;
      if (!ok) {
        t.step('wh', `${saved} < ${goal}이 거짓이 되었습니다. while은 조건이 거짓이 되는 순간 멈춥니다.`, `${saved} < ${goal} → false`);
        break;
      }
      t.step('wh', `${saved} < ${goal}이 참이므로 몸통을 한 번 더 실행합니다. while은 몇 번 돌지 미리 정하지 않고, 조건만 봅니다.`, `${saved} < ${goal} → true`);
      saved = t.set('saved', saved + weekly) as number;
      t.step('add', `이번 주 ${weekly}원을 저금해 ${saved}원.`);
      weeks = t.set('weeks', weeks + 1) as number;
      t.step('wk', `${weeks}주째.`);
    }
    t.log(weeks + '주 걸림');
    t.step('log', `목표를 넘기기까지 ${weeks}주가 걸렸습니다. 매주 넣는 돈을 바꾸면 반복 횟수가 달라집니다.`);
  });
}

function LoopFigure() {
  const [k, setK] = useState<'for' | 'while'>('for');
  const [n, setN] = useState(4);
  const [weekly, setWeekly] = useState(3000);
  const program = useMemo(() => (k === 'for' ? sumProgram(n) : saveProgram(weekly)), [k, n, weekly]);
  return (
    <Figure
      no={2}
      title="반복문 따라가기"
      hint="재생하거나 한 단계씩 넘겨 보세요"
      caption={<>노란 줄이 방금 실행한 줄입니다. 반복문의 첫 줄로 몇 번이고 되돌아오는 것을 보세요. 조건을 검사할 때마다 그 줄 끝에 조건의 값을 적었습니다. 조건이 false가 되는 순간 반복이 끝납니다.</>}
    >
      <Seg
        label="프로그램"
        value={k}
        onChange={setK}
        options={[
          { value: 'for', label: 'for: 1부터 n까지 합' },
          { value: 'while', label: 'while: 저금통' },
        ]}
      />
      <TraceBlock program={program} id="cf-loop-speed" speed={3}>
        <div className="ctl" style={{ flex: '1 1 200px' }}>
          {k === 'for' ? (
            <Slider label="n" value={n} min={1} max={6} step={1} onChange={setN} />
          ) : (
            <Slider label="매주 저금 (원)" value={weekly} min={1000} max={6000} step={500} onChange={setWeekly} format={(v) => v.toLocaleString('ko-KR')} />
          )}
        </div>
      </TraceBlock>
    </Figure>
  );
}

/* ─────────────── Figure 3: run it yourself ─────────────── */

const FIZZ = Array.from({ length: 15 }, (_, k) => {
  const i = k + 1;
  return i % 15 === 0 ? 'FizzBuzz' : i % 3 === 0 ? 'Fizz' : i % 5 === 0 ? 'Buzz' : String(i);
});

const TASKS: Task[] = [
  {
    id: 'sum',
    label: '1부터 100까지 합',
    prompt: (
      <p>
        1부터 100까지 모두 더한 값을 출력하세요. 그림 2의 for 반복문을 떠올려 보세요. 정답은 한 줄, <code>5050</code>입니다.
      </p>
    ),
    starter: `
let sum = 0;
// 여기에 for 반복문을 써서 1부터 100까지 더해 보세요

console.log(sum);
`,
    expectOut: ['5050'],
    solution: `
let sum = 0;
for (let i = 1; i <= 100; i++) {
  sum = sum + i;
}
console.log(sum);
`,
  },
  {
    id: 'fizz',
    label: 'FizzBuzz',
    prompt: (
      <p>
        1부터 15까지 차례로 출력하되, 3의 배수에는 숫자 대신 <code>Fizz</code>, 5의 배수에는 <code>Buzz</code>, 3과 5의 공배수에는 <code>FizzBuzz</code>를 출력하세요. 개발자 면접에 자주 나오는 문제로, 조건의 순서가 핵심입니다. 나머지 연산 <code>i % 3 === 0</code>은 "i가 3의 배수인가"를 뜻합니다.
      </p>
    ),
    starter: `
for (let i = 1; i <= 15; i++) {
  if (i % 3 === 0) {
    console.log('Fizz');
  } else if (i % 5 === 0) {
    console.log('Buzz');
  } else {
    console.log(i);
  }
}
`,
    expectOut: FIZZ,
    solution: `
for (let i = 1; i <= 15; i++) {
  if (i % 15 === 0) {        // 가장 좁은 조건을 먼저
    console.log('FizzBuzz');
  } else if (i % 3 === 0) {
    console.log('Fizz');
  } else if (i % 5 === 0) {
    console.log('Buzz');
  } else {
    console.log(i);
  }
}
`,
  },
  {
    id: 'forever',
    label: '끝나지 않는 반복',
    prompt: (
      <p>
        0부터 4까지 출력하려던 코드입니다. 그대로 실행해 보세요. 반복할 때마다 i가 바뀌지 않으니 <code>i &lt; 5</code>는 영원히 참이고, 반복은 끝나지 않습니다. 이 상자는 1초가 지나면 실행을 강제로 멈춥니다. 빠진 줄의 주석(<code>//</code>)을 지우고 다시 실행해 보세요.
      </p>
    ),
    starter: `
let i = 0;
while (i < 5) {
  console.log(i);
  // i = i + 1;
}
`,
    expectOut: ['0', '1', '2', '3', '4'],
    solution: `
let i = 0;
while (i < 5) {
  console.log(i);
  i = i + 1;
}
`,
  },
];

/* ─────────────── Lesson ─────────────── */

export default function ControlFlow() {
  return (
    <>
      <h2>위에서 아래로, 하지만 늘 그렇지는 않게</h2>
      <p>
        지난 장의 프로그램은 위에서 아래로 한 줄씩, 모든 줄을 한 번씩 실행했습니다. 하지만 쓸모 있는 프로그램은 상황에 따라 다르게 움직여야 합니다. 장바구니가 3만 원 이상이면 배송비를 빼 주고, 비밀번호가 틀리면 다시 묻고, 목록에 있는 상품을 하나씩 모두 훑어야 합니다. 코드가 실행되는 순서를 <T en="control flow">제어 흐름</T>이라고 하고, 이것을 바꾸는 도구는 크게 두 가지입니다. 조건에 따라 길을 가르는 <T en="conditional">조건문</T>과, 같은 코드를 되풀이하는 <T en="loop">반복문</T>입니다.
      </p>

      <h2>if와 else: 조건에 따라 가르기</h2>
      <p>
        <code>if</code> 뒤의 괄호 안에는 참이나 거짓이 되는 식을 씁니다. 참이면 바로 뒤 중괄호 <code>{'{ }'}</code> 안의 코드를 실행하고, 거짓이면 건너뜁니다. <code>else</code>를 붙이면 거짓일 때 실행할 코드를 따로 줄 수 있습니다.
      </p>
      <Code label="if와 else">{`
const total = 27000;
let shipping;
if (total >= 30000) {
  shipping = 0;          // 3만 원 이상: 무료 배송
} else {
  shipping = 3000;       // 그 밖: 배송비 3000원
}
console.log(total + shipping);   // 30000`}</Code>
      <p>
        갈래가 셋 이상이면 <code>else if</code>를 이어 붙입니다. 그림 1은 점수로 학점을 매기는 코드입니다. 점수를 움직이며 어느 줄이 실행되고 어느 줄이 건너뛰어지는지 보세요.
      </p>
      <BranchFigure />
      <p>
        if–else if–else 사슬에서 중요한 규칙은 두 가지입니다. 조건은 <strong>위에서부터 차례로</strong> 검사하고, <strong>처음 참이 된 블록 하나만</strong> 실행한 뒤 사슬 전체를 빠져나갑니다. 85점이면 <code>score &gt;= 90</code>은 거짓, <code>score &gt;= 80</code>은 참이므로 B를 주고 끝입니다. <code>score &gt;= 70</code>도 참이지만 검사조차 하지 않습니다.
      </p>
      <p>
        그래서 순서가 결과를 바꿉니다. 그림 1에서 "조건 순서를 거꾸로"를 켜 보세요. <code>score &gt;= 70</code>이 맨 앞에 오면 95점도 첫 조건에 걸려 C가 됩니다. 아래 띠에서 A와 B 구간이 통째로 사라집니다. 범위가 겹치는 조건을 나열할 때는 좁은 조건(90 이상)부터 넓은 조건(70 이상) 순으로 써야 합니다.
      </p>
      <Callout kind="warn">
        경계값을 늘 의심하세요. "90점 이상"을 <code>score &gt; 90</code>으로 쓰면 정확히 90점인 학생만 B를 받습니다. 대부분의 점수에서는 맞게 동작하니 눈에 잘 띄지 않는 버그입니다. 그림 1에서 슬라이더를 89, 90, 91에 놓아 보는 것처럼, 조건문을 쓰면 경계 바로 양옆을 꼭 확인합니다. 이 습관은 <a href={lessonHref('cs-programming', 'testing')}>테스트 장</a>에서 다시 다룹니다.
      </Callout>
      <p>
        조건 여러 개를 묶을 때는 지난 장의 <code>&&</code>(그리고)와 <code>||</code>(또는)를 씁니다. "80점 이상 90점 미만"은 <code>score &gt;= 80 && score &lt; 90</code>입니다. 수학처럼 <code>80 &lt;= score &lt; 90</code>이라고 쓰면 안 됩니다. JavaScript는 이것을 <code>(80 &lt;= score) &lt; 90</code>, 즉 <code>true &lt; 90</code>으로 읽어 늘 참이 됩니다.
      </p>

      <h2>for와 while: 되풀이하기</h2>
      <p>
        1부터 100까지 더하려고 덧셈을 백 줄 쓰는 사람은 없습니다. 반복문은 "이 코드를 조건이 참인 동안 되풀이하라"는 명령입니다. 가장 흔한 <code>for</code> 반복문은 괄호 안에 세 부분을 세미콜론으로 나눠 씁니다.
      </p>
      <Code label="for 반복문의 세 부분">{`
for (let i = 1; i <= 5; i++) {
  //  ① 시작      ② 조건     ③ 한 바퀴 끝날 때마다
  console.log(i);            // 몸통: 1, 2, 3, 4, 5 출력
}
// ① i를 1로 만든다 → ② 조건이 참이면 몸통 실행 → ③ i++ (i를 1 늘림) → ② …
// ②가 거짓이 되는 순간 반복을 끝내고 } 다음으로 간다`}</Code>
      <p>
        그림 2에서 실행 위치가 반복문 첫 줄과 몸통 사이를 오가는 모습을 보세요. 몸통이 끝날 때마다 첫 줄로 돌아와 <code>i++</code>를 하고 조건을 다시 검사합니다. n을 바꾸면 몸통이 실행되는 횟수가 정확히 n번이라는 것을 확인할 수 있습니다. 조건 검사는 n + 1번 일어납니다. 마지막 한 번은 거짓이 되어 반복을 끝내는 검사입니다.
      </p>
      <LoopFigure />
      <p>
        <code>while</code>은 더 단순합니다. 괄호 안의 조건만 보고, 참인 동안 몸통을 되풀이합니다. "목표 금액을 넘을 때까지 저금"처럼 몇 번 돌지 미리 알 수 없을 때 자연스럽습니다. 그림 2의 "while: 저금통"에서 매주 저금액을 바꾸면 반복 횟수가 저절로 달라집니다. 반대로 횟수가 정해져 있으면 for가 읽기 좋습니다. 사실 둘은 서로 바꿔 쓸 수 있고, 어느 쪽이 의도를 잘 드러내느냐의 문제입니다.
      </p>
      <Callout kind="note" label="break와 continue">
        반복 도중에 빠져나오고 싶으면 <code>break</code>, 이번 바퀴의 나머지를 건너뛰고 다음 바퀴로 가려면 <code>continue</code>를 씁니다. 예를 들어 상품 목록에서 품절 상품을 처음 찾으면 <code>break</code>로 바로 멈추면 됩니다. 다만 너무 많이 쓰면 흐름을 따라가기 어려워집니다.
      </Callout>

      <h2>직접 실행해 보기, 그리고 끝나지 않는 반복</h2>
      <p>
        이제 직접 써 볼 차례입니다. 그림 3의 상자에 코드를 고쳐 쓰고 실행하면, 출력이 기대한 결과와 한 줄씩 비교됩니다. 코드는 이 페이지와 분리된 작업자(Web Worker)에서 돌아가므로 무엇을 잘못 써도 페이지가 망가지지 않습니다.
      </p>
      <Figure no={3} title="직접 실행: 반복문 연습" hint="코드를 고치고 ▶ 실행을 누르세요" caption={<>FizzBuzz의 처음 코드는 15에서 Fizz를 출력합니다. 3의 배수 검사가 먼저 걸리기 때문입니다. 그림 1의 "조건 순서" 문제와 똑같습니다. "끝나지 않는 반복"은 1초 뒤 강제로 멈추고, 그때까지 출력된 줄을 보여 줍니다.</>}>
        <RunBox tasks={TASKS} id="cf-run-status" />
      </Figure>
      <p>
        "끝나지 않는 반복"을 실행하면 0이 끝없이 찍히다가 멈춥니다. 몸통 안에서 i를 바꾸지 않으니 <code>i &lt; 5</code>가 영원히 참이기 때문입니다. 이것을 <T en="infinite loop">무한 반복</T>이라고 합니다. 실제 프로그램에서 무한 반복이 생기면 화면이 멈추고 팬이 돌기 시작합니다. 웹 페이지라면 브라우저가 "페이지가 응답하지 않습니다"라고 알려 줍니다.
      </p>
      <Callout kind="key">
        반복문을 쓸 때는 세 가지를 확인하세요. 처음에 조건이 참인가(한 번도 안 도는 반복은 아닌가), 반복할 때마다 조건에 쓰인 변수가 바뀌는가, 그 변화가 언젠가 조건을 거짓으로 만드는가. 세 번째가 빠지면 무한 반복이 됩니다.
      </Callout>
      <p>
        반복문이 몇 번 도는지는 프로그램의 속도를 결정합니다. 몸통이 n번 도는 반복 안에 또 n번 도는 반복이 있으면 몸통은 n × n번 실행됩니다. 데이터가 천 개면 백만 번입니다. 이렇게 입력 크기에 따라 일의 양이 어떻게 늘어나는지 재는 방법은 <a href={lessonHref('cs-algorithms', 'complexity')}>기초 알고리즘의 복잡도 장</a>에서 배웁니다.
      </p>

      <Callout kind="key">
        조건문은 실행할 길을 고르고(<code>if</code>, <code>else if</code>, <code>else</code>), 반복문은 같은 길을 되풀이합니다(<code>for</code>, <code>while</code>). 조건은 위에서부터 검사해 처음 참인 것 하나만 실행하고, 반복은 조건이 거짓이 될 때까지 계속됩니다.
      </Callout>
      <Quiz
        q={
          <>
            다음 코드는 몇 번 출력할까요? <code>{'for (let i = 0; i < 10; i += 3) { console.log(i); }'}</code>
          </>
        }
        options={['3번 (0, 3, 6)', '4번 (0, 3, 6, 9)', '10번', '끝나지 않는다']}
        answer={1}
        explain={
          <>
            i는 0에서 시작해 한 바퀴마다 3씩 늘어납니다. 0, 3, 6, 9에서는 <code>i &lt; 10</code>이 참이라 몸통을 실행하고, 12가 되면 거짓이 되어 끝납니다. 그래서 4번 출력합니다. 마지막 값 9가 포함되는지처럼 반복의 첫 바퀴와 마지막 바퀴를 직접 세어 보는 습관이 중요합니다.
          </>
        }
      />
    </>
  );
}
