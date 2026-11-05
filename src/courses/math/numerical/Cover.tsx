import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { alpha, usePalette } from '../../../lib/theme';
import { courseHref, lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './lessons/numerical.css';

/* ─────────────── Hero: three methods racing to the digits of √2 ─────────────── */

const ROOT = Math.SQRT2;
const f = (x: number) => x * x - 2;
const MAX_DIGITS = 16;
const MAX_STEPS = 52;

/** Correct decimal digits of x against √2, capped at what a double can hold. */
const digits = (x: number) => {
  const e = Math.abs(x - ROOT);
  return e === 0 ? MAX_DIGITS : Math.max(0, Math.min(MAX_DIGITS, -Math.log10(e / ROOT)));
};

function bisection(): number[] {
  let a = 1, b = 2;
  const out: number[] = [];
  for (let i = 0; i < MAX_STEPS; i++) {
    const m = (a + b) / 2;
    out.push(digits(m));
    if (f(a) * f(m) <= 0) b = m;
    else a = m;
  }
  return out;
}
function secant(): number[] {
  let x0 = 1, x1 = 2;
  const out: number[] = [];
  for (let i = 0; i < MAX_STEPS; i++) {
    const d = f(x1) - f(x0);
    const x2 = d === 0 ? x1 : x1 - (f(x1) * (x1 - x0)) / d;
    out.push(digits(x2));
    x0 = x1;
    x1 = x2;
  }
  return out;
}
function newton(): number[] {
  let x = 2;
  const out: number[] = [];
  for (let i = 0; i < MAX_STEPS; i++) {
    x = x - f(x) / (2 * x);
    out.push(digits(x));
  }
  return out;
}
const reach = (ds: number[]) => ds.findIndex((d) => d >= 15) + 1;

function RaceHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const runs = useMemo(() => [
    { name: '이분법', ds: bisection(), color: P.ink3 },
    { name: '할선법', ds: secant(), color: P.pos },
    { name: '뉴턴 방법', ds: newton(), color: P.neg },
  ], [P]);
  const t = useRef(still ? MAX_STEPS : 0);
  const [, setTick] = useState(0);
  useAnimationFrame((dt) => {
    t.current += dt * 5; // steps per second
    if (t.current > MAX_STEPS + 6) t.current = 0;
    setTick((x) => x + 1);
  }, inView && !still);
  const step = Math.min(MAX_STEPS, Math.floor(t.current));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 34, r: 10, t: 14, b: 30 };
      const X = (i: number) => pad.l + (i / MAX_STEPS) * (w - pad.l - pad.r);
      const Y = (d: number) => pad.t + (1 - d / MAX_DIGITS) * (h - pad.t - pad.b);
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const d of [0, 4, 8, 12, 16]) {
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(d) + 0.5);
        ctx.lineTo(w - pad.r, Y(d) + 0.5);
        ctx.stroke();
        ctx.fillText(String(d), pad.l - 6, Y(d));
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const i of [0, 10, 20, 30, 40, 50]) ctx.fillText(String(i), X(i), h - pad.b + 6);
      ctx.textAlign = 'left';
      ctx.fillText('반복 횟수', pad.l, h - pad.b + 18);
      ctx.textBaseline = 'bottom';
      ctx.fillText('맞는 자릿수', pad.l + 4, pad.t + 10);
      // the ceiling a double can reach
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = alpha(P.ink3, 0.8);
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(15.65) + 0.5);
      ctx.lineTo(w - pad.r, Y(15.65) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const r of runs) {
        ctx.strokeStyle = r.color;
        ctx.fillStyle = r.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(X(0), Y(0));
        for (let i = 0; i < step; i++) ctx.lineTo(X(i + 1), Y(r.ds[i]));
        ctx.stroke();
        if (step > 0) {
          ctx.beginPath();
          ctx.arc(X(step), Y(r.ds[step - 1]), 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    [P, runs, step],
    { aspect: 1.35, maxHeight: 400, minHeight: 40 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`x² − 2 = 0의 근 √2를 세 방법으로 찾을 때, 반복할수록 맞는 자릿수가 늘어나는 그래프. 15자리에 닿는 데 뉴턴 방법은 ${reach(runs[2].ds)}번, 할선법은 ${reach(runs[1].ds)}번, 이분법은 ${reach(runs[0].ds)}번 걸립니다. 지금 ${step}번째 반복입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="cover-key" aria-hidden="true">
          {runs.map((r) => (
            <span key={r.name}>
              <i style={{ background: r.name === '이분법' ? 'var(--ink-3)' : r.name === '할선법' ? 'var(--pos)' : 'var(--neg)' }} />
              {r.name}
            </span>
          ))}
        </span>
        15자리까지 뉴턴 <strong>{reach(runs[2].ds)}</strong>번 · 할선법 <strong>{reach(runs[1].ds)}</strong>번 · 이분법 <strong>{reach(runs[0].ds)}</strong>번
      </div>
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-math-3)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-math-3)' }}>
            {course.title} · {course.subtitle}
          </div>
          <h1 className="hero-title">
            몇 걸음이면
            <br />
            <em>열다섯 자리</em>가
            <br />
            맞을까요?
          </h1>
          <p className="hero-lede">
            오른쪽 그림은 √2를 세 가지 방법으로 찾습니다. 구간을 반씩 줄이는 이분법은 한 걸음에 자릿수가 조금씩 늘지만, 뉴턴 방법은 맞는 자릿수가 걸음마다 두 배가 됩니다. 점선은 컴퓨터의 배정밀도 수가 담을 수 있는 한계입니다. 수치해석은 이렇게 알고리즘이 답에 얼마나 빨리, 얼마나 정확하게 다가가는지를 재는 학문입니다. {course.lessons.length}개의 장에서 부동소수점, 근 찾기, 보간, 적분, 연립방정식, 최적화를 직접 돌려 봅니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'root-finding')}>
              방정식의 근 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <RaceHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>오차를 눈으로 잽니다</h3>
          <p>알고리즘을 실제로 돌리고, 정답과의 차이를 로그 눈금에 찍습니다. 직선의 기울기가 수렴 속도이고, 바닥에 깔리는 곳이 컴퓨터가 낼 수 있는 정확도의 한계입니다.</p>
        </div>
        <div>
          <h3>빠른 방법이 실패하는 곳</h3>
          <p>가장 빠른 방법은 늘 조건이 붙습니다. 그림마다 그 조건이 깨지는 예를 함께 두어, 실무에서 느리지만 안전한 방법을 섞어 쓰는 이유를 봅니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            미분과 테일러 급수는 <a href={courseHref('math-calculus')}>미적분학</a>에서, 반복문과 함수는 <a href={courseHref('cs-programming')}>프로그래밍 입문</a>에서 다룹니다. 수가 비트로 담기는 방식은 <a href={lessonHref('cs-architecture', 'binary')}>컴퓨터 구조</a>에 있습니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
