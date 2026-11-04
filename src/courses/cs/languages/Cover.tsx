import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { alpha, usePalette } from '../../../lib/theme';
import { lessonHref } from '../../index';
import course from './course';
import { parseExpr, type Expr } from './lessons/lang';
import '../../../styles/cover.css';

/* ─────────────── Hero: an expression tree evaluating itself and emitting stack-machine code ─────────────── */

const EXAMPLES: { src: string; env: Record<string, number> }[] = [
  { src: '(x + 2) * (y - 1)', env: { x: 3, y: 5 } },
  { src: 'a * a + b * b', env: { a: 3, b: 4 } },
  { src: '(n - 1) * n / 2', env: { n: 10 } },
];
const STEP = 0.75; // seconds per node
const HOLD = 2.2; // seconds to show the finished tree

interface HNode {
  e: Expr;
  x: number;
  y: number;
  label: string;
  value: number;
  instr: string;
  kids: HNode[];
}
interface Run {
  src: string;
  env: Record<string, number>;
  root: HNode;
  order: HNode[]; // post-order: the order a stack machine computes in
  depth: number;
  leaves: number;
}

const OPS: Record<string, [string, (a: number, b: number) => number]> = {
  '+': ['ADD', (a, b) => a + b],
  '-': ['SUB', (a, b) => a - b],
  '*': ['MUL', (a, b) => a * b],
  '/': ['DIV', (a, b) => a / b],
};

function build(src: string, env: Record<string, number>): Run {
  const e = parseExpr(src);
  let leaf = 0;
  let depth = 0;
  const order: HNode[] = [];
  const go = (n: Expr, d: number): HNode => {
    depth = Math.max(depth, d);
    if (n.k === 'bin') {
      const l = go(n.l, d + 1);
      const r = go(n.r, d + 1);
      const [ins, f] = OPS[n.op];
      const h: HNode = { e: n, x: (l.x + r.x) / 2, y: d, label: n.op, value: f(l.value, r.value), instr: ins, kids: [l, r] };
      order.push(h);
      return h;
    }
    const isVar = n.k === 'var';
    const v = isVar ? env[(n as Expr & { k: 'var' }).name] : (n as Expr & { k: 'num' }).v;
    const h: HNode = { e: n, x: leaf++, y: d, label: isVar ? (n as Expr & { k: 'var' }).name : String(v), value: v, instr: isVar ? `LOAD ${(n as Expr & { k: 'var' }).name}` : `PUSH ${v}`, kids: [] };
    order.push(h);
    return h;
  };
  const root = go(e, 0);
  return { src, env, root, order, depth, leaves: leaf };
}

function TreeHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const runs = useMemo(() => EXAMPLES.map((x) => build(x.src, x.env)), []);
  const [which, setWhich] = useState(0);
  const t = useRef(still ? 1e6 : 0);
  const [, setTick] = useState(0);
  const run = runs[which];

  useAnimationFrame((dt) => {
    t.current += dt;
    if (t.current > run.order.length * STEP + HOLD) {
      t.current = 0;
      setWhich((w) => (w + 1) % runs.length);
    }
    setTick((k) => k + 1);
  }, inView && !still);

  const done = Math.min(run.order.length, Math.floor(t.current / STEP) + (still ? 0 : 1));
  const shownCount = still ? run.order.length : done;
  const visited = new Set(run.order.slice(0, shownCount));
  const cur = !still && shownCount > 0 && shownCount <= run.order.length && t.current < run.order.length * STEP ? run.order[shownCount - 1] : null;
  // the stack after the first `shownCount` instructions
  const stack: number[] = [];
  for (const n of run.order.slice(0, shownCount)) {
    if (n.kids.length) {
      stack.pop();
      stack.pop();
    }
    stack.push(n.value);
  }
  const fmt = (v: number) => String(Math.round(v * 100) / 100);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const narrow = w < 520;
      const treeW = narrow ? w : w * 0.62;
      const codeX = narrow ? 0 : treeW + 8;
      const treeH = narrow ? h * 0.58 : h;
      const pad = 26;
      const X = (lx: number) => pad + ((lx + 0.5) / run.leaves) * (treeW - 2 * pad);
      const levelH = Math.min(narrow ? 90 : 110, (treeH - 110) / Math.max(1, run.depth));
      const Y = (d: number) => (narrow ? 70 : 90) + d * levelH;
      const r = Math.max(15, Math.min(21, treeW / 22));

      ctx.font = `600 ${narrow ? 13 : 14}px ${P.fontMono}`;
      ctx.fillStyle = P.ink2;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(run.src, 12, 18);
      ctx.font = `12px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.fillText(Object.entries(run.env).map(([k, v]) => `${k} = ${v}`).join(', '), 12, 36);

      const walk = (n: HNode) => {
        for (const k of n.kids) {
          ctx.strokeStyle = visited.has(k) ? alpha(P.ink, 0.6) : P.lineStrong;
          ctx.lineWidth = visited.has(k) ? 2 : 1.4;
          ctx.beginPath();
          ctx.moveTo(X(n.x), Y(n.y) + r);
          ctx.lineTo(X(k.x), Y(k.y) - r);
          ctx.stroke();
          walk(k);
        }
      };
      walk(run.root);
      for (const n of run.order) {
        const x = X(n.x);
        const y = Y(n.y);
        const on = n === cur;
        const seen = visited.has(n);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = on ? P.hl : seen ? alpha(P.good, P.dark ? 0.3 : 0.18) : P.surface;
        ctx.fill();
        ctx.strokeStyle = on ? P.ink : seen ? P.good : P.ink3;
        ctx.lineWidth = on ? 2.4 : 1.6;
        ctx.stroke();
        ctx.fillStyle = on ? '#1a1a1a' : P.ink;
        ctx.font = `700 ${Math.round(r * 0.8)}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.label, x, y + 1);
        if (seen && n.kids.length) {
          const s = fmt(n.value);
          ctx.font = `700 12px ${P.fontMono}`;
          const tw = ctx.measureText(s).width + 10;
          const bx = x + r * 0.7;
          const by = y - r - 6;
          ctx.fillStyle = P.pos;
          ctx.fillRect(bx, by - 9, tw, 18);
          ctx.fillStyle = P.surface;
          ctx.textAlign = 'left';
          ctx.fillText(s, bx + 5, by + 1);
        }
      }

      // the emitted instructions and the stack
      const listX = narrow ? 12 : codeX;
      const listY = narrow ? treeH + 4 : 66;
      const lineH = narrow ? 17 : 21;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `12px ${P.fontBody}`;
      ctx.fillStyle = P.ink3;
      ctx.fillText('명령어', listX, listY);
      run.order.forEach((n, i) => {
        const y = listY + 16 + i * lineH;
        const seen = i < shownCount;
        ctx.font = `${n === cur ? 700 : 400} ${narrow ? 11.5 : 13}px ${P.fontMono}`;
        ctx.fillStyle = n === cur ? P.ink : seen ? P.ink2 : alpha(P.ink3, 0.45);
        if (n === cur) {
          ctx.fillStyle = alpha(P.hl, 0.45);
          ctx.fillRect(listX - 4, y - lineH / 2 + 1, (narrow ? w / 2 : w - codeX) - 14, lineH - 2);
          ctx.fillStyle = P.ink;
        }
        ctx.fillText(`${String(i).padStart(2, ' ')}  ${n.instr}`, listX, y);
      });
      const stX = narrow ? w / 2 + 16 : codeX;
      const stY = narrow ? listY : listY + 30 + run.order.length * lineH;
      const cellW = narrow ? Math.min(90, w / 2 - 34) : Math.min(110, w - codeX - 20);
      ctx.font = `12px ${P.fontBody}`;
      ctx.fillStyle = P.ink3;
      ctx.fillText('스택', stX, stY);
      stack.forEach((v, i) => {
        const y = stY + 14 + (stack.length - 1 - i) * 24;
        ctx.fillStyle = i === stack.length - 1 ? alpha(P.pos, 0.22) : P.surface2;
        ctx.fillRect(stX, y, cellW, 21);
        ctx.strokeStyle = i === stack.length - 1 ? P.pos : P.lineStrong;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(stX + 0.5, y + 0.5, cellW - 1, 20);
        ctx.fillStyle = P.ink;
        ctx.font = `600 12.5px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.fillText(fmt(v), stX + cellW / 2, y + 11);
        ctx.textAlign = 'left';
      });
    },
    [P, run, shownCount, cur, still],
    { aspect: 1.2, maxHeight: 410, minHeight: 380 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`식 ${run.src}의 구문 트리가 잎에서 뿌리 쪽으로 계산되며, 노드마다 스택 기계 명령어가 하나씩 만들어집니다. 결과는 ${fmt(run.root.value)}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        식이 구문 트리가 되고, 트리를 아래에서 위로 거슬러 올라가며 값이 계산됩니다. 같은 순서로 명령어를 내놓으면 그대로 스택 기계의 코드가 됩니다. 결과 <strong style={{ color: 'var(--pos)' }}>{fmt(run.root.value)}</strong>
      </div>
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-cs-3)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-cs-3)' }}>
            {course.title} · {course.subtitle}
          </div>
          <h1 className="hero-title">
            코드는
            <br />
            <em>트리가 되어</em>
            <br />
            실행됩니다.
          </h1>
          <p className="hero-lede">
            언어를 쓰는 데서 한 걸음 나아가, 언어가 어떻게 동작하는지 직접 만들어 봅니다. 값을 바꾸지 않고 함수를 조합하는 방식과 실행 전에 실수를 잡는 타입부터, 작은 언어의 인터프리터와 가비지 컬렉터, 컴파일러까지 {course.lessons.length}개의 장에서 하나의 작은 언어로 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'interpreter')}>
              인터프리터 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <TreeHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>작은 언어 하나로</h3>
          <p>JavaScript를 닮은 꼬마 언어 하나를 과목 내내 씁니다. 같은 코드에 타입을 매기고, 실행하고, 명령어로 옮기며 언어의 각 부분이 무슨 일을 하는지 봅니다.</p>
        </div>
        <div>
          <h3>한 단계씩 돌려 보세요</h3>
          <p>타입 추론, 환경을 들고 다니는 평가, 표시-쓸기, 스택 기계를 한 단계씩 넘길 수 있습니다. 코드를 직접 고치면 그 자리에서 다시 계산됩니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            함수, 배열, 재귀를 JavaScript로 써 본 적이 있다고 가정합니다. 필요하면 <a href="#cs-programming">프로그래밍 입문</a>을 먼저 보세요. 파싱은 <a href="#cs-computation">계산 이론</a>에서, 스택과 힙은 <a href="#cs-architecture">컴퓨터 구조</a>에서 더 자세히 다룹니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
