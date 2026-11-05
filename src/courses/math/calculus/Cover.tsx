import { useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { alpha, usePalette } from '../../../lib/theme';
import { courseHref, lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './lessons/calculus.css';

/* ─────────────── Hero: a secant line turning into the tangent as h shrinks ─────────────── */

const f = (x: number) => 0.18 * x * x * x - 0.9 * x * x + 0.6 * x + 2.2;
const df = (x: number) => 0.54 * x * x - 1.8 * x + 0.6;
const A = 0.8; // the point where we take the derivative
const X0 = -1.2, X1 = 5.4, Y0 = -0.4, Y1 = 4.2;
const H_START = 3.2;
const SECONDS = 7; // one shrink from H_START to almost 0, on a log scale
const HOLD = 1.6;

function SecantHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const t = useRef(still ? SECONDS : 0);
  const [, setTick] = useState(0);
  useAnimationFrame((dt) => {
    t.current += dt;
    if (t.current > SECONDS + HOLD) t.current = 0;
    setTick((x) => x + 1);
  }, inView && !still);

  // h halves at a steady pace: from 3.2 down to 3.2 / 2^10 ≈ 0.003
  const s = Math.min(1, t.current / SECONDS);
  const h = H_START / Math.pow(2, 10 * s);
  const slope = (f(A + h) - f(A)) / h;
  const exact = df(A);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: H }) => {
      const pad = { l: 12, r: 12, t: 14, b: 26 };
      const X = (x: number) => pad.l + ((x - X0) / (X1 - X0)) * (w - pad.l - pad.r);
      const Y = (y: number) => pad.t + (1 - (y - Y0) / (Y1 - Y0)) * (H - pad.t - pad.b);
      // axis
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(X0), Y(0) + 0.5);
      ctx.lineTo(X(X1), Y(0) + 0.5);
      ctx.stroke();
      // the curve
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i <= 240; i++) {
        const x = X0 + ((X1 - X0) * i) / 240;
        if (i) ctx.lineTo(X(x), Y(f(x)));
        else ctx.moveTo(X(x), Y(f(x)));
      }
      ctx.stroke();
      const line = (m: number, color: string, width: number, dash: number[] = []) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(X(X0), Y(f(A) + m * (X0 - A)));
        ctx.lineTo(X(X1), Y(f(A) + m * (X1 - A)));
        ctx.stroke();
        ctx.setLineDash([]);
      };
      // the tangent it is heading for, faint and dashed; the secant, bold
      line(exact, alpha(P.good, 0.6), 1.5, [6, 5]);
      line(slope, P.accent, 2.5);
      // rise and run of the secant
      ctx.strokeStyle = alpha(P.ink3, 0.8);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(X(A), Y(f(A)));
      ctx.lineTo(X(A + h), Y(f(A)));
      ctx.lineTo(X(A + h), Y(f(A + h)));
      ctx.stroke();
      ctx.setLineDash([]);
      const dot = (x: number, c: string, r: number) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(X(x), Y(f(x)), r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = P.surface;
        ctx.lineWidth = 2;
        ctx.stroke();
      };
      dot(A + h, P.accent, 6);
      dot(A, P.ink, 6);
      ctx.fillStyle = P.ink3;
      ctx.font = `500 11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('a', X(A), Y(0) + 6);
      if (h > 0.25) ctx.fillText('a + h', X(A + h), Y(0) + 6);
    },
    [P, h, slope],
    { aspect: 1.35, maxHeight: 420, minHeight: 40 },
  );

  const fmtH = h >= 0.1 ? h.toFixed(2) : h.toFixed(4);
  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`곡선 위의 두 점 a와 a+h를 잇는 할선이 h가 줄어들수록 점 a의 접선에 가까워지는 애니메이션. 지금 h = ${fmtH}, 할선의 기울기 ${slope.toFixed(4)}, 접선의 기울기 ${exact.toFixed(4)}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="cover-key" aria-hidden="true">
          <span>
            <i style={{ background: 'var(--accent)' }} />
            할선
          </span>
          <span>
            <i style={{ background: 'var(--good)' }} />
            접선
          </span>
        </span>
        h = <span className="mono">{fmtH}</span> · 할선의 기울기 <strong className="mono">{slope.toFixed(4)}</strong> → 접선의 기울기 <span className="mono">{exact.toFixed(4)}</span>
      </div>
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-math-1)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-math-1)' }}>
            {course.title} · {course.subtitle}
          </div>
          <h1 className="hero-title">
            두 점이
            <br />
            <em>하나</em>가 되는
            <br />
            순간.
          </h1>
          <p className="hero-lede">
            오른쪽 그림에서 곡선 위의 두 점을 잇는 직선은, 두 번째 점이 다가올수록 한 점에서 곡선을 스치는 접선으로 바뀝니다. 두 점이 실제로 겹치면 기울기를 계산할 수 없지만, 겹치기 직전까지의 기울기가 다가가는 값은 정확히 하나로 정해집니다. 이 생각 하나에서 미분과 적분이 나옵니다. {course.lessons.length}개의 장에서 극한, 미분, 최적화, 적분, 급수를 직접 끌어 보며 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'integrals')}>
              미적분의 기본 정리 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <SecantHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>식보다 그림을 먼저</h3>
          <p>정의와 정리마다 그것을 움직이는 그림을 먼저 둡니다. 점을 끌고 조각 수를 늘려 보면, 식이 말하는 것이 화면에서 그대로 일어납니다.</p>
        </div>
        <div>
          <h3>컴퓨터로 확인합니다</h3>
          <p>극한은 점점 작은 수를 넣어, 적분은 점점 잘게 쪼개 직접 계산해 봅니다. 그러다 컴퓨터의 소수가 어디서 틀리기 시작하는지도 함께 봅니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            함수와 그래프만 알면 시작할 수 있습니다. 증명하는 법은 <a href={courseHref('math-discrete')}>이산수학</a>에서 다루고, 미분을 인공지능에 쓰는 모습은 <a href={lessonHref('ai-basics', 'derivatives')}>기초 인공지능</a>에서 볼 수 있습니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
