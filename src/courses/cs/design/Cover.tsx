import { useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { alpha, usePalette } from '../../../lib/theme';
import { lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';

/* ─────────────── Hero: filling an LCS table, then tracing the answer back ─────────────── */

const PAIRS: [string, string][] = [
  ['ALGORITHM', 'LOGARITHM'],
  ['KITTEN', 'SITTING'],
  ['DYNAMIC', 'DRAMATIC'],
];
const CELLS_PER_SEC = 26;
const TRACE_PER_SEC = 9;
const HOLD = 2.2; // seconds to show the finished answer before the next pair

interface Run {
  a: string; // columns
  b: string; // rows
  t: number[][]; // (b.length+1) × (a.length+1)
  path: [number, number][]; // cells visited when tracing back, from the bottom-right corner
  lcs: string;
}

function lcsRun(a: string, b: string): Run {
  const t = Array.from({ length: b.length + 1 }, () => new Array<number>(a.length + 1).fill(0));
  for (let i = 1; i <= b.length; i++)
    for (let j = 1; j <= a.length; j++) t[i][j] = b[i - 1] === a[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]);
  const path: [number, number][] = [];
  let i = b.length;
  let j = a.length;
  let lcs = '';
  while (i > 0 && j > 0) {
    path.push([i, j]);
    if (b[i - 1] === a[j - 1]) {
      lcs = b[i - 1] + lcs;
      i--;
      j--;
    } else if (t[i - 1][j] >= t[i][j - 1]) i--;
    else j--;
  }
  path.push([i, j]);
  return { a, b, t, path, lcs };
}

function LcsHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const k = useRef(0);
  const [run, setRun] = useState(() => lcsRun(...PAIRS[0]));
  const t = useRef(still ? 1e9 : 0);
  const [, setTick] = useState(0);

  const cells = run.a.length * run.b.length;
  const fillTime = cells / CELLS_PER_SEC;
  const traceTime = run.path.length / TRACE_PER_SEC;

  useAnimationFrame((dt) => {
    t.current += dt;
    if (t.current > fillTime + traceTime + HOLD) {
      k.current = (k.current + 1) % PAIRS.length;
      setRun(lcsRun(...PAIRS[k.current]));
      t.current = 0;
    }
    setTick((x) => x + 1);
  }, inView && !still);

  const filled = Math.min(cells, Math.floor(t.current * CELLS_PER_SEC));
  const traced = Math.min(run.path.length, Math.max(0, Math.floor((t.current - fillTime) * TRACE_PER_SEC)));
  const done = traced >= run.path.length;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cols = run.a.length + 2; // header column + empty-prefix column
      const rows = run.b.length + 2;
      const cs = Math.min((w - 4) / cols, (h - 4) / rows);
      const ox = (w - cs * cols) / 2;
      const oy = (h - cs * rows) / 2;
      const X = (j: number) => ox + (j + 1) * cs; // table column j (0 = empty prefix)
      const Y = (i: number) => oy + (i + 1) * cs;
      const maxV = Math.max(1, run.t[run.b.length][run.a.length]);
      const onPath = new Set(run.path.slice(0, traced).map(([i, j]) => i * 100 + j));
      const font = (px: number, weight = 600) => `${weight} ${Math.round(px)}px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // headers
      ctx.fillStyle = P.ink2;
      ctx.font = font(cs * 0.46, 700);
      for (let j = 1; j <= run.a.length; j++) ctx.fillText(run.a[j - 1], X(j) + cs / 2, oy + cs / 2 + 1);
      for (let i = 1; i <= run.b.length; i++) ctx.fillText(run.b[i - 1], ox + cs / 2, Y(i) + cs / 2 + 1);

      for (let i = 0; i <= run.b.length; i++) {
        for (let j = 0; j <= run.a.length; j++) {
          const order = (i - 1) * run.a.length + (j - 1); // fill order, row by row
          const shown = i === 0 || j === 0 || order < filled;
          const x = X(j);
          const y = Y(i);
          const v = run.t[i][j];
          const isMatch = i > 0 && j > 0 && run.b[i - 1] === run.a[j - 1];
          const path = onPath.has(i * 100 + j);
          ctx.fillStyle = path ? (isMatch ? P.pos : alpha(P.pos, 0.35)) : shown ? alpha(P.neg, 0.06 + 0.5 * (v / maxV)) : P.surface;
          ctx.fillRect(x, y, cs, cs);
          if (!done && order === filled - 1) {
            ctx.strokeStyle = P.hl;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(x + 1.5, y + 1.5, cs - 3, cs - 3);
          }
          if (shown) {
            ctx.fillStyle = path && isMatch ? P.surface : v / maxV > 0.6 ? P.ink : P.ink2;
            ctx.font = font(cs * 0.4, isMatch ? 700 : 500);
            ctx.fillText(String(v), x + cs / 2, y + cs / 2 + 1);
          }
        }
      }
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let j = 0; j <= run.a.length + 1; j++) {
        ctx.moveTo(Math.round(X(j)) + 0.5, Y(0));
        ctx.lineTo(Math.round(X(j)) + 0.5, Y(run.b.length + 1));
      }
      for (let i = 0; i <= run.b.length + 1; i++) {
        ctx.moveTo(X(0), Math.round(Y(i)) + 0.5);
        ctx.lineTo(X(run.a.length + 1), Math.round(Y(i)) + 0.5);
      }
      ctx.stroke();
    },
    [P, run, filled, traced, done],
    { aspect: 1.15, maxHeight: 430, minHeight: 240 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`동적 계획법 표 애니메이션: 두 단어 ${run.a}, ${run.b}의 가장 긴 공통 부분 수열을 표를 채워 구한 뒤, 오른쪽 아래 칸에서 거꾸로 따라가 답을 찾습니다. 답: ${run.lcs}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="mono">
          {run.a} × {run.b}
        </span>{' '}
        · 가장 긴 공통 부분 수열{' '}
        <span className="mono" style={{ color: done ? 'var(--pos)' : 'var(--ink-3)' }}>
          {done ? run.lcs : '…'}
        </span>{' '}
        · 진한 칸일수록 값이 크고, 주황 칸이 답을 거꾸로 따라간 길입니다
      </div>
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-cs-2)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-cs-2)' }}>
            {course.title} · {course.subtitle}
          </div>
          <h1 className="hero-title">
            좋은 풀이는
            <br />
            같은 계산을
            <br />
            <em>한 번만</em> 합니다.
          </h1>
          <p className="hero-lede">
            표 그림은 두 단어에 공통으로 들어 있는 가장 긴 글자 순서를 동적 계획법으로 찾는 모습입니다. 각 칸은 이미 채운 이웃 칸만 보고 정해지고, 다 채운 뒤 끝에서부터 거꾸로 따라가면 답이 나옵니다. git diff가 바뀐 줄을 찾는 것도 같은 문제를 줄 단위로 푸는 일입니다. 이 과목에서는 재귀, 분할 정복, 동적 계획법, 탐욕 알고리즘, 그래프 응용까지 {course.lessons.length}가지 풀이 전략을 직접 설계해 봅니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'dynamic-programming')}>
              동적 계획법 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <LcsHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>전략을 배웁니다</h3>
          <p>알고리즘 하나하나를 외우기보다, 문제를 보고 "쪼갤까, 표에 적을까, 매번 최선을 고를까"를 판단하는 눈을 기릅니다.</p>
        </div>
        <div>
          <h3>반례를 찾아보세요</h3>
          <p>입력을 바꾸면 어떤 전략은 계속 맞고 어떤 전략은 틀립니다. 그림에서 직접 반례를 찾으면 왜 그 전략이 맞는지 오래 기억됩니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            복잡도, 정렬, 이진 탐색, 스택·큐·힙, 그래프 탐색을 알고 있다고 가정합니다. 처음이라면 <a href="#cs-algorithms">기초 알고리즘</a>부터 보세요.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
