import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { StepControls, useStepper } from '../../shared';
import { attacker, fibTrace, queensBacktrack, queensBrutePerms, queensBruteRows, queensTrace } from './recursion';
import '../../algorithms/lessons/algorithms.css';
import './recursion.css';

/* ─────────────── Figure 1: the call tree of fib(n) ─────────────── */

// one colour per argument, so calls with the same argument look alike
const ARG_KEYS: (keyof Palette)[] = ['ink3', 'neg', 'pos', 'good', 'stats2', 'bad', 'stats1'];
const ARG_CSS = ['var(--ink-3)', 'var(--neg)', 'var(--pos)', 'var(--good)', 'var(--c-stats-2)', 'var(--bad)', 'var(--c-stats-1)'];

function FibTreeFigure() {
  const P = usePalette();
  const [n, setN] = useState(5);
  const tr = useMemo(() => fibTrace(n), [n]);
  const s = useStepper(tr.frames.length, 2, n);
  const f = tr.frames[s.i];
  const activeArg = f.active >= 0 ? tr.nodes[f.active].arg : -1;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const padX = 14;
      const top = 22;
      const bottom = 30;
      const levels = tr.maxDepth + 1;
      const dy = (h - top - bottom) / Math.max(1, levels - 1);
      const spacing = (w - 2 * padX) / tr.leaves;
      const r = Math.max(9, Math.min(17, spacing * 0.4, dy * 0.3));
      const X = (x: number) => padX + (x + 0.5) * spacing;
      const Y = (d: number) => top + d * dy;
      const called = (id: number) => tr.nodes[id].callAt <= s.i;
      const returned = (id: number) => tr.nodes[id].returnAt <= s.i;

      for (const m of tr.nodes) {
        if (m.parent < 0) continue;
        const p = tr.nodes[m.parent];
        const on = called(m.id);
        ctx.strokeStyle = on ? P.lineStrong : P.line;
        ctx.lineWidth = on ? 1.6 : 1;
        ctx.setLineDash(on ? [] : [3, 3]);
        ctx.beginPath();
        ctx.moveTo(X(p.x), Y(p.depth));
        ctx.lineTo(X(m.x), Y(m.depth));
        ctx.stroke();
      }
      ctx.setLineDash([]);

      for (const m of tr.nodes) {
        const x = X(m.x);
        const y = Y(m.depth);
        const col = P[ARG_KEYS[m.arg]] as string;
        const on = called(m.id);
        const done = returned(m.id);
        // the same sub-problem as the running call: a yellow halo
        if (on && m.arg === activeArg && m.id !== f.active) {
          ctx.beginPath();
          ctx.arc(x, y, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = P.hl;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        if (m.id === f.active) {
          ctx.beginPath();
          ctx.arc(x, y, r + 5, 0, Math.PI * 2);
          ctx.fillStyle = alpha(P.ink, 0.14);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = on ? alpha(col, done ? 0.4 : 0.16) : P.surface;
        ctx.fill();
        ctx.setLineDash(on ? [] : [3, 3]);
        ctx.strokeStyle = !on ? P.line : done ? col : P.ink;
        ctx.lineWidth = on && !done ? 2.4 : 1.6;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = on ? P.ink : P.ink3;
        ctx.font = `700 ${Math.round(r * 0.95)}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(m.arg), x, y + 1);
        if (done) {
          ctx.fillStyle = P.ink2;
          ctx.font = `600 11px ${P.fontMono}`;
          if (m.arg < 2) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(`=${m.value}`, x, y + r + 3);
          } else {
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`=${m.value}`, x + r * 0.7, y - r * 0.7);
          }
        }
      }
    },
    [P, tr, s.i, f, activeArg],
    { aspect: 1.9, maxHeight: 340, minHeight: 220 },
  );

  return (
    <Figure
      no={1}
      title="fib(n)의 호출 트리"
      hint="n을 고르고 한 단계씩 진행해 보세요"
      caption={<>원 안의 숫자는 함수에 넘긴 인자입니다. 같은 인자로 부른 호출은 같은 색이고, 지금 실행 중인 호출과 인자가 같은 호출에는 노란 테두리가 생깁니다. 진한 테두리는 아직 끝나지 않고 호출 스택에 쌓여 있는 호출, 점선은 앞으로 할 호출입니다. 호출이 끝나면 돌려준 값이 옆에 적힙니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`fib(${n})의 호출 트리. 호출 ${tr.nodes.length}번`}>
            <canvas ref={canvasRef} />
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', minHeight: '1.7em' }} aria-live="polite">
            {f.note}
          </div>
          <Legend items={tr.nodes.filter((m, i, a) => a.findIndex((x) => x.arg === m.arg) === i).sort((a, b) => a.arg - b.arg).map((m) => ({ color: ARG_CSS[m.arg], label: `fib(${m.arg})` }))} />
        </div>
        <div className="controls">
          <Seg label="n" value={n} onChange={setN} options={[2, 3, 4, 5, 6].map((k) => ({ value: k, label: String(k) }))} />
          <div className="rc-stack" aria-label={`호출 스택: ${f.stack.map((id) => `fib(${tr.nodes[id].arg})`).join(', ') || '비어 있음'}`}>
            <span className="ds-label">호출 스택 (맨 위가 실행 중)</span>
            <div className="rc-stack-cells" style={{ minHeight: `calc(${n} * 31px)` }}>
              {f.stack.length ? (
                f.stack.map((id, k) => (
                  <span key={id} className="ds-cell" data-next={k === f.stack.length - 1 || undefined}>
                    fib({tr.nodes[id].arg})
                  </span>
                ))
              ) : (
                <span className="ds-empty">비어 있음</span>
              )}
            </div>
          </div>
          <StepControls s={s} id="fib-speed" maxSpeed={10} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="호출 수" value={`${f.calls} / ${tr.nodes.length}`} />
            <Readout label="이미 본 인자로 호출" value={`${f.repeats}번`} color="var(--bad)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: N-Queens, step by step ─────────────── */

function drawQueen(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, fill: string, stroke: string) {
  const pts: [number, number][] = [
    [-0.32, 0.24],
    [-0.38, -0.16],
    [-0.17, 0.03],
    [0, -0.3],
    [0.17, 0.03],
    [0.38, -0.16],
    [0.32, 0.24],
  ];
  ctx.beginPath();
  pts.forEach(([x, y], k) => (k ? ctx.lineTo(cx + x * s, cy + y * s) : ctx.moveTo(cx + x * s, cy + y * s)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  for (const [x, y] of [
    [-0.38, -0.16],
    [0, -0.3],
    [0.38, -0.16],
  ]) {
    ctx.beginPath();
    ctx.arc(cx + x * s, cy + y * s - s * 0.05, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
}

function QueensFigure() {
  const P = usePalette();
  const [n, setN] = useState(6);
  const tr = useMemo(() => queensTrace(n), [n]);
  const s = useStepper(tr.frames.length, 4, n);
  const f = tr.frames[s.i];
  const nextSol = tr.solutionAt.find((k) => k > s.i);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const lab = 18;
      const size = Math.min(w - lab - 4, h - lab - 4);
      const cell = size / n;
      const ox = lab + (w - lab - size) / 2;
      const oy = lab;
      const cx = (c: number) => ox + (c + 0.5) * cell;
      const cy = (r: number) => oy + (r + 0.5) * cell;
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++) {
          ctx.fillStyle = (r + c) % 2 ? P.surface2 : P.surface;
          ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
          // squares in the rows still to fill that a placed queen already attacks
          if (r >= f.queens.length && f.kind !== 'solution' && f.kind !== 'done' && attacker(f.queens, r, c) >= 0) {
            ctx.fillStyle = alpha(P.bad, 0.12);
            ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
            ctx.fillStyle = alpha(P.bad, 0.55);
            ctx.beginPath();
            ctx.arc(cx(c), cy(r), Math.max(1.5, cell * 0.05), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      if (f.kind === 'back' && f.row < n) {
        ctx.strokeStyle = P.bad;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(ox + 1, oy + f.row * cell + 1, size - 2, cell - 2);
        ctx.setLineDash([]);
      }
      if (f.col >= 0) {
        const ok = f.kind === 'place';
        ctx.fillStyle = alpha(ok ? P.good : P.bad, 0.5);
        ctx.fillRect(ox + f.col * cell, oy + f.row * cell, cell, cell);
        if (!ok && f.hit >= 0) {
          ctx.strokeStyle = P.bad;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(cx(f.queens[f.hit]), cy(f.hit));
          ctx.lineTo(cx(f.col), cy(f.row));
          ctx.stroke();
        }
        drawQueen(ctx, cx(f.col), cy(f.row), cell, ok ? P.ink : alpha(P.ink, 0.25), P.surface);
      }
      const win = f.kind === 'solution';
      f.queens.forEach((c, r) => drawQueen(ctx, cx(c), cy(r), cell, win ? P.good : P.ink, P.surface));
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + 0.5, oy + 0.5, size - 1, size - 1);
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let k = 0; k < n; k++) {
        ctx.fillText(String(k + 1), cx(k), oy - lab / 2);
        ctx.fillText(String(k + 1), ox - lab / 2, cy(k));
      }
    },
    [P, f, n],
    { aspect: 1.15, maxHeight: 380, minHeight: 240 },
  );

  return (
    <Figure
      no={2}
      title="N-퀸: 놓고, 막히면 되돌아가기"
      hint="재생하거나 다음 해 찾기를 눌러 보세요"
      caption={<>위에서부터 한 행에 퀸 하나씩 왼쪽 칸부터 놓아 봅니다. 점이 찍힌 옅은 붉은 칸은 이미 놓인 퀸이 공격하는 칸입니다. 초록 칸은 안전해서 퀸을 놓은 칸, 빨간 칸은 공격받아 건너뛴 칸이고 빨간 선이 공격하는 퀸을 가리킵니다. 어떤 행에 놓을 칸이 하나도 없으면 점선 테두리가 나타나고, 바로 윗행으로 돌아가 그 퀸을 다음 칸으로 옮깁니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${n}×${n} 체스판. 놓인 퀸 ${f.queens.length}개`}>
            <canvas ref={canvasRef} />
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', minHeight: '3.4em' }} aria-live="polite">
            {f.note}
          </div>
        </div>
        <div className="controls">
          <Seg label="판 크기 N" value={n} onChange={setN} options={[4, 5, 6, 7, 8].map((k) => ({ value: k, label: String(k) }))} />
          <StepControls s={s} id="nq-speed" maxSpeed={200} />
          <div className="btn-row">
            <Button small onClick={() => nextSol !== undefined && s.go(nextSol)} disabled={nextSol === undefined}>
              다음 해 찾기
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="시도한 칸" value={`${f.tried.toLocaleString('ko-KR')}번`} color="var(--neg)" />
            <Readout label="찾은 해" value={`${f.solutions} / ${tr.solutionAt.length}개`} color="var(--good)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: how much pruning saves ─────────────── */

const PRUNE_NS = [4, 5, 6, 7, 8, 9, 10];
const PRUNE_SCALE = 11; // axis up to 10^11

/** 11111111110 → "111.1억"; smaller counts are written out in full */
function fmtKo(v: number): string {
  return v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : v.toLocaleString('ko-KR');
}

function PruneFigure() {
  const [n, setN] = useState(8);
  const bt = useMemo(() => queensBacktrack(n), [n]);
  const rows = [
    { name: 'nⁿ 전부', v: queensBruteRows(n), color: 'var(--ink-3)' },
    { name: '순열', v: queensBrutePerms(n), color: 'var(--neg)' },
    { name: '백트래킹', v: bt.tried, color: 'var(--pos)' },
  ];

  return (
    <Figure
      no={3}
      title="가지치기가 줄이는 일"
      hint="판 크기를 바꿔 보세요"
      caption={<>세 방법이 칸에 퀸을 놓아 보는 횟수(재귀 트리의 노드 수)를 셌습니다. 막대 길이는 로그 눈금이라 한 칸이 100배입니다. "nⁿ 전부"는 행마다 아무 열에나 놓아 nⁿ가지 배치를 모두 만든 뒤 마지막에 검사하고, "순열"은 이미 쓴 열만 피합니다. 백트래킹은 칸마다 열과 두 대각선을 모두 검사해 공격받는 칸 아래로는 내려가지 않습니다. 백트래킹 값은 이 페이지에서 실제로 탐색해 센 값입니다.</>}
    >
      <div className="controls row">
        <Seg label="판 크기 N" value={n} onChange={setN} options={PRUNE_NS.map((k) => ({ value: k, label: String(k) }))} />
      </div>
      <div className="growth-rows rc-prune" role="table" aria-label={`N = ${n}일 때 방법별 시도 횟수`}>
        {rows.map((r) => (
          <div key={r.name} className="growth-row" role="row">
            <span className="growth-name" role="cell">
              {r.name}
            </span>
            <span className="growth-track" aria-hidden="true">
              <span className="growth-bar" style={{ width: `${Math.max(1.5, (Math.log10(r.v) / PRUNE_SCALE) * 100)}%`, background: r.color }} />
            </span>
            <span className="growth-time mono" role="cell" title={r.v.toLocaleString('ko-KR')}>
              {fmtKo(r.v)}
            </span>
          </div>
        ))}
        <div className="growth-axis" aria-hidden="true">
          {[0, 2, 4, 6, 8, 10].map((k) => (
            <span key={k} style={{ left: `${(k / PRUNE_SCALE) * 100}%` }}>
              10<sup>{k}</sup>
            </span>
          ))}
        </div>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        <Readout label="해의 개수" value={`${bt.solutions}개`} color="var(--good)" />
        <Readout label="nⁿ 전부 ÷ 백트래킹" value={`${Math.round(rows[0].v / bt.tried).toLocaleString('ko-KR')}배`} />
        <Readout label="순열 ÷ 백트래킹" value={`${(rows[1].v / bt.tried).toFixed(1)}배`} color="var(--neg)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Recursion() {
  return (
    <>
      <h2>자기 자신을 부르는 함수</h2>
      <p>
        <T en="recursion">재귀</T>는 함수가 자기 자신을 다시 부르는 것입니다. 처음 보면 끝없이 맴돌 것 같지만, 제대로 만든 재귀 함수는 두 가지를 반드시 갖추고 있습니다.
      </p>
      <ul>
        <li>
          <T en="base case">기저 사례</T>: 너무 작아서 바로 답할 수 있는 경우. 여기서는 더 부르지 않고 값을 돌려줍니다.
        </li>
        <li>
          <T en="recursive case">재귀 호출</T>: 그 밖의 경우. 문제를 <strong>조금 더 작은 같은 모양의 문제</strong>로 바꿔 자기 자신에게 맡기고, 돌아온 답으로 원래 문제의 답을 만듭니다.
        </li>
      </ul>
      <p>
        팩토리얼 <M>{'n! = n \\times (n-1)!'}</M>이나 배열의 합 "첫 원소 + 나머지의 합"처럼, 정의 자체가 자기 자신을 포함하는 문제는 그대로 재귀 함수가 됩니다.
      </p>
      <Code label="팩토리얼과 배열의 합">{`
function factorial(n) {
  if (n <= 1) return 1;          // 기저 사례
  return n * factorial(n - 1);   // 더 작은 문제를 맡긴다
}

function sum(a, i = 0) {
  if (i === a.length) return 0;  // 빈 구간의 합은 0
  return a[i] + sum(a, i + 1);   // 첫 원소 + 나머지의 합
}

factorial(5);       // 120
sum([3, 1, 4, 1]);  // 9`}</Code>
      <p>
        재귀 함수를 짤 때는 호출이 어떻게 이어지는지 끝까지 따라가려 하지 않는 편이 낫습니다. "<code>factorial(n - 1)</code>은 올바른 답을 돌려준다"고 믿고, 그 답으로 <code>factorial(n)</code>을 어떻게 만들지만 생각합니다. 기저 사례가 맞고, 매 호출이 기저 사례 쪽으로 한 걸음씩 다가가기만 하면 수학적 귀납법과 같은 이유로 전체가 맞습니다.
      </p>

      <h2>호출 스택</h2>
      <p>
        컴퓨터는 이 "믿고 맡기기"를 <a href="#cs-algorithms/stack-queue-heap">스택</a>으로 처리합니다. 함수를 부를 때마다 매개변수, 지역 변수, 돌아갈 위치를 담은 칸(<T en="stack frame">스택 프레임</T>)을 <T en="call stack">호출 스택</T>에 쌓고, 함수가 끝나면 그 칸을 꺼내 부른 곳으로 돌아갑니다. <code>factorial(4)</code>는 이렇게 쌓였다가 풀립니다.
      </p>
      <Code label="factorial(4)가 쌓이고 풀리는 모습">{`
factorial(4)
= 4 * factorial(3)                // 스택: 4
= 4 * (3 * factorial(2))          // 스택: 4, 3
= 4 * (3 * (2 * factorial(1)))    // 스택: 4, 3, 2, 1  ← 가장 깊음
= 4 * (3 * (2 * 1))               // 기저 사례에서 되돌아오며 계산
= 24`}</Code>
      <p>
        재귀가 n단계 깊어지면 스택에도 n칸이 쌓이므로, 재귀 함수는 따로 배열을 만들지 않아도 깊이에 비례하는 메모리를 씁니다. 그리고 이 스택은 크기가 정해져 있습니다.
      </p>
      <Callout kind="warn">
        이 글을 쓰며 재 보니, 아무 일도 하지 않는 재귀 함수는 Node.js 22에서 약 12,500번, Chromium 브라우저에서 약 17,600번 깊어지자 <code>RangeError: Maximum call stack size exceeded</code>, 곧 <T en="stack overflow">스택 오버플로</T>가 났습니다. 지역 변수가 몇 개 있는 함수는 각각 약 6,000번과 12,000번에서 멈췄습니다. 한도는 엔진, 버전, 설정, 프레임 크기에 따라 달라지므로 "대략 1만 단계 안팎"으로만 기억하세요. 깊이가 입력 크기에 비례하는 재귀(위의 <code>sum</code>처럼 원소마다 한 단계)는 원소가 수만 개만 되어도 터질 수 있다고 생각하세요.
      </Callout>
      <Callout kind="note" label="팁">
        기저 사례 쪽으로 <strong>반드시</strong> 다가가는지 확인하세요. <code>{'if (n === 1)'}</code>로 멈추는 팩토리얼에 0이나 2.5를 넣으면 n이 1을 건너뛰어 영원히 내려갑니다. 위 코드가 <code>{'n <= 1'}</code>로 쓴 이유입니다.
      </Callout>

      <h2>호출 트리: 재귀가 갈라질 때</h2>
      <p>
        팩토리얼은 한 번에 자기 자신을 한 번만 부르므로 호출이 일렬로 이어집니다. 한 번에 두 번 이상 부르면 호출이 나무처럼 갈라집니다. 피보나치 수 <M>{'F(n) = F(n-1) + F(n-2)'}</M>를 정의 그대로 옮긴 함수가 대표적입니다.
      </p>
      <Code label="정의를 그대로 옮긴 피보나치">{`
function fib(n) {
  if (n < 2) return n;              // fib(0) = 0, fib(1) = 1
  return fib(n - 1) + fib(n - 2);   // 두 번 부른다
}`}</Code>
      <FibTreeFigure />
      <p>
        재생해 보면 두 가지가 보입니다. 첫째, 호출 스택은 트리에서 지금 호출까지 이어진 <strong>한 줄기</strong>뿐입니다. 트리 전체가 아무리 커도 스택의 깊이는 트리의 높이, 곧 n을 넘지 않습니다. 둘째, 같은 색 원이 여러 번 나옵니다. <code>fib(6)</code> 하나를 구하려고 함수를 25번 부르는데, 인자는 0부터 6까지 7가지뿐이므로 18번은 이미 한 계산을 다시 한 것입니다. <code>fib(2)</code>만 해도 5번 계산합니다.
      </p>
      <p>
        호출 횟수는 n이 1 늘 때마다 약 1.6배씩 늘어납니다. <code>fib(30)</code>은 약 269만 번, <code>fib(40)</code>은 약 3억 3천만 번 함수를 부릅니다. 이 낭비는 한 번 구한 답을 적어 두기만 하면 사라지는데, 그것이 <a href="#cs-algorithm-design/dynamic-programming">동적 계획법</a>입니다.
      </p>

      <h2>재귀가 자연스러운 곳</h2>
      <p>
        폴더 안의 폴더, 중첩된 JSON, 웹 페이지의 DOM 트리처럼 <strong>자기와 같은 모양을 안에 품은 데이터</strong>는 재귀로 다루는 것이 가장 자연스럽습니다. 중첩된 배열의 모든 수를 더하는 함수를 보세요. "원소가 배열이면 그 배열의 합을 재귀로 구한다"는 한 줄이 깊이와 상관없이 동작합니다.
      </p>
      <Code label="중첩 배열의 합: 재귀와 명시적 스택">{`
function deepSum(a) {
  let s = 0;
  for (const x of a) s += Array.isArray(x) ? deepSum(x) : x;
  return s;
}
deepSum([1, [2, [3, 4]], 5]);  // 15

// 같은 일을 직접 만든 스택으로. 깊이가 아무리 깊어도 호출 스택이 넘치지 않는다
function deepSumIter(a) {
  const stack = [a];
  let s = 0;
  while (stack.length) {
    const x = stack.pop();
    if (Array.isArray(x)) stack.push(...x);
    else s += x;
  }
  return s;
}`}</Code>
      <Callout kind="note" label="팁">
        재귀가 너무 깊어질 수 있다면 두 번째 함수처럼 <strong>명시적 스택</strong>으로 바꾸세요. 엔진이 대신 쌓아 주던 호출 스택을 배열로 직접 쌓는 것뿐이라 어떤 재귀든 이렇게 바꿀 수 있고, 배열은 힙 메모리에 있어서 수백만 칸도 문제없습니다. <a href="#cs-algorithms/graph-search">그래프 탐색</a> 장의 DFS가 스택을 직접 쓴 것도 같은 이유입니다. 한 번만 자기를 부르는 단순한 재귀는 그냥 반복문으로 바꾸면 됩니다.
      </Callout>

      <h2>백트래킹: 고르고, 들어가 보고, 되돌리기</h2>
      <p>
        재귀는 "가능한 경우를 모두 만들어 보기"에도 잘 맞습니다. 배열의 모든 순열을 만든다고 해 봅시다. 첫 자리에 올 원소를 하나 고르고, 남은 원소로 나머지 자리를 채우는 일을 재귀에 맡기고, 돌아오면 고른 것을 되돌려 다음 후보를 고릅니다.
      </p>
      <Code label="순열 만들기: 고르기 → 탐색 → 되돌리기">{`
function permutations(items) {
  const out = [];
  const path = [];
  const used = new Array(items.length).fill(false);
  function explore() {
    if (path.length === items.length) {   // 다 골랐으면 하나 완성
      out.push([...path]);
      return;
    }
    for (let i = 0; i < items.length; i++) {
      if (used[i]) continue;
      used[i] = true; path.push(items[i]);    // 고르기
      explore();                              // 탐색
      path.pop(); used[i] = false;            // 되돌리기
    }
  }
  explore();
  return out;
}
permutations(['a', 'b', 'c']).length;  // 6`}</Code>
      <p>
        이 "고르기 → 탐색 → 되돌리기" 틀에 한 가지를 더하면 <T en="backtracking">백트래킹</T>이 됩니다. 고르는 순간 <strong>규칙을 이미 어겼는지 검사해서, 어겼으면 그 아래로는 아예 들어가지 않는 것</strong>입니다. 어차피 답이 나올 수 없는 가지를 잘라 낸다고 해서 이것을 <T en="pruning">가지치기</T>라고 부릅니다.
      </p>
      <p>
        고전적인 예가 <T en="N-Queens">N-퀸</T> 문제입니다. N×N 체스판에 퀸 N개를 서로 공격하지 못하게 놓아야 합니다. 퀸은 가로, 세로, 대각선으로 몇 칸이든 움직이므로 같은 행, 같은 열, 같은 대각선에 두 퀸이 있으면 안 됩니다. 행마다 퀸이 정확히 하나씩 있어야 하므로, 1행부터 한 행씩 퀸의 열을 고르면 됩니다.
      </p>
      <QueensFigure />
      <p>
        N = 6으로 재생해 보면, 1행의 퀸을 1열에 둔 채로 한참을 헤매다가 결국 1행부터 옮기는 모습이 나옵니다. 놓을 칸이 없는 행을 만나면 바로 윗행으로 돌아가 그 퀸을 옮기고, 그래도 안 되면 한 행 더 올라갑니다. N = 8에서 첫 해는 칸 876개를 시도한 뒤 나오고, 92개의 해를 모두 찾는 데는 15,720번을 시도합니다.
      </p>
      <Code label="N-퀸: 백트래킹">{`
function solveNQueens(n) {
  const queens = [];                 // queens[r] = r행 퀸의 열
  const cols = new Set();
  const diag1 = new Set();           // r + c가 같으면 같은 ↙ 대각선
  const diag2 = new Set();           // r - c가 같으면 같은 ↘ 대각선
  const solutions = [];

  function place(r) {
    if (r === n) { solutions.push([...queens]); return; }
    for (let c = 0; c < n; c++) {
      if (cols.has(c) || diag1.has(r + c) || diag2.has(r - c)) continue;  // 가지치기
      queens.push(c); cols.add(c); diag1.add(r + c); diag2.add(r - c);    // 고르기
      place(r + 1);                                                       // 탐색
      queens.pop(); cols.delete(c); diag1.delete(r + c); diag2.delete(r - c);  // 되돌리기
    }
  }
  place(0);
  return solutions;
}
solveNQueens(8).length;  // 92`}</Code>
      <p>
        두 퀸이 같은 대각선에 있는지는 좌표의 합과 차로 판단합니다. ↙ 방향 대각선 위의 칸은 행 + 열이 모두 같고, ↘ 방향은 행 − 열이 모두 같습니다. 그래서 집합 세 개만 있으면 칸 하나를 O(1)에 검사할 수 있습니다.
      </p>

      <h2>가지치기의 효과</h2>
      <p>가지치기를 하지 않으면 얼마나 더 일해야 할까요? 같은 문제를 세 가지 방법으로 풀 때 시도하는 횟수를 세어 비교해 봅니다.</p>
      <PruneFigure />
      <p>
        N = 8에서 모든 배치를 만든 뒤 검사하는 방법은 약 1,917만 번, 열이 겹치지 않는 순열만 만드는 방법은 109,600번, 백트래킹은 15,720번 시도합니다. N = 10이 되면 차이는 더 벌어져서, 각각 약 111억 번, 986만 번, 35만 번입니다. 백트래킹이 모든 배치를 만드는 방법보다 약 3만 2천 배 적게 일합니다.
      </p>
      <p>
        다만 가지치기가 지수 시간을 다항 시간으로 바꿔 주지는 않습니다. N = 6부터는 N을 하나 늘릴 때마다 백트래킹의 시도 횟수도 4~5배씩 늘어납니다. 가지치기는 거대한 탐색 공간에서 쓸모없는 부분을 일찍 버려, 손댈 수 없던 크기를 손댈 수 있는 크기로 만들어 줍니다. 스도쿠 풀이, 조합 찾기, 제약 조건을 만족하는 일정 짜기처럼 정해진 공식이 없는 문제에서 백트래킹은 여전히 기본 도구입니다.
      </p>

      <Callout kind="key">
        재귀 함수는 기저 사례와, 기저 사례 쪽으로 다가가는 재귀 호출로 이루어집니다. 호출마다 호출 스택에 한 칸이 쌓이므로 재귀의 깊이가 메모리이고, 너무 깊으면 스택 오버플로가 납니다. 백트래킹은 "고르기 → 탐색 → 되돌리기"로 모든 경우를 훑되, 규칙을 어긴 가지는 일찍 잘라 냅니다.
      </Callout>
      <Quiz
        q={
          <>
            다음 함수에 <code>count(5)</code>를 넣으면 어떻게 될까?{' '}
            <code>{'function count(n) { if (n === 0) return 0; return 1 + count(n - 2); }'}</code>
          </>
        }
        options={['2를 돌려준다', '3을 돌려준다', '0을 돌려준다', '끝나지 않고 내려가다 스택 오버플로가 난다']}
        answer={3}
        explain={<>n은 5 → 3 → 1 → −1 → −3 …으로 줄어들어 0을 건너뜁니다. 기저 사례 <code>{'n === 0'}</code>에 영원히 닿지 않으므로 스택이 한도까지 쌓이다가 <code>RangeError</code>가 납니다. 기저 사례를 <code>{'n <= 0'}</code>처럼 쓰거나, 매 호출이 기저 사례에 반드시 닿는지 확인해야 합니다.</>}
      />
    </>
  );
}
