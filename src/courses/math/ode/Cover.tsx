import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { alpha, usePalette } from '../../../lib/theme';
import { courseHref, lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './lessons/ode.css';

/* ─────────────── Hero: two Lorenz trajectories that start 1e-5 apart ─────────────── */

const SIGMA = 10, RHO = 28, BETA = 8 / 3;
const H = 0.005;
const STEPS = 6000; // 30 time units
const GAP = 1e-5;
type V3 = [number, number, number];

const lorenz = ([x, y, z]: V3): V3 => [SIGMA * (y - x), x * (RHO - z) - y, x * y - BETA * z];
function rk4(p: V3): V3 {
  const add = (a: V3, b: V3, s: number): V3 => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];
  const k1 = lorenz(p), k2 = lorenz(add(p, k1, H / 2)), k3 = lorenz(add(p, k2, H / 2)), k4 = lorenz(add(p, k3, H));
  return [0, 1, 2].map((i) => p[i] + (H / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as V3;
}
function run(start: V3): V3[] {
  const out: V3[] = [start];
  for (let i = 0; i < STEPS; i++) out.push(rk4(out[out.length - 1]));
  return out;
}

function LorenzHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const paths = useMemo(() => [run([1, 1, 1]), run([1 + GAP, 1, 1])], []);
  // when the two runs first differ by more than 1 in x, y or z
  const split = useMemo(() => paths[0].findIndex((p, i) => Math.hypot(p[0] - paths[1][i][0], p[1] - paths[1][i][1], p[2] - paths[1][i][2]) > 1), [paths]);
  const k = useRef(still ? STEPS : 0);
  const [, setTick] = useState(0);
  useAnimationFrame((dt) => {
    k.current += dt * 340; // steps per second
    if (k.current > STEPS + 600) k.current = 0;
    setTick((x) => x + 1);
  }, inView && !still);
  const n = Math.min(STEPS, Math.floor(k.current));
  const d = Math.hypot(...([0, 1, 2].map((i) => paths[0][n][i] - paths[1][n][i]) as [number, number, number]));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      // project onto the x–z plane: the classic butterfly view
      const X = (p: V3) => w / 2 + (p[0] / 25) * (w / 2 - 12);
      const Y = (p: V3) => h - 12 - (p[2] / 52) * (h - 24);
      const colors = [P.neg, P.pos]; // blue and orange
      paths.forEach((path, j) => {
        const from = Math.max(0, n - 2200);
        // older parts fade; draw in a few chunks with rising opacity
        for (let c = 0; c < 4; c++) {
          const a = from + Math.floor(((n - from) * c) / 4), b = from + Math.floor(((n - from) * (c + 1)) / 4);
          if (b <= a) continue;
          ctx.strokeStyle = alpha(colors[j], 0.2 + 0.2 * c);
          ctx.lineWidth = j === 0 ? 1.6 : 1.2;
          ctx.beginPath();
          for (let i = a; i <= b; i++) (i === a ? ctx.moveTo(X(path[i]), Y(path[i])) : ctx.lineTo(X(path[i]), Y(path[i]))) ;
          ctx.stroke();
        }
        ctx.fillStyle = colors[j];
        ctx.beginPath();
        ctx.arc(X(path[n]), Y(path[n]), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = P.surface;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`t = ${(n * H).toFixed(1)}`, 6, 6);
      ctx.textAlign = 'right';
      ctx.fillText('x–z 평면', w - 6, 6);
    },
    [P, paths, n],
    { aspect: 1.25, maxHeight: 440, minHeight: 40 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`로렌츠 방정식을 따라 움직이는 두 점의 궤적. 두 점은 처음에 x 좌표가 0.00001만 다르게 출발합니다. 한동안 같은 길을 가다가 t = ${(split * H).toFixed(1)}쯤부터 완전히 다른 날개로 갈라집니다. 지금 t = ${(n * H).toFixed(1)}, 두 점 사이 거리는 ${d < 0.01 ? d.toExponential(1) : d.toFixed(1)}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="cover-key" aria-hidden="true">
          <span>
            <i style={{ background: 'var(--neg)', borderRadius: '50%' }} />
            x₀ = 1
          </span>
          <span>
            <i style={{ background: 'var(--pos)', borderRadius: '50%' }} />
            x₀ = 1.00001
          </span>
        </span>
        두 점 사이 거리 <strong className="mono">{d < 0.01 ? d.toExponential(1) : d.toFixed(1)}</strong> · t ≈ {(split * H).toFixed(1)}부터 갈라짐
      </div>
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-math-2)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-math-2)' }}>
            {course.title} · {course.subtitle}
          </div>
          <h1 className="hero-title">
            규칙은 단순해도
            <br />
            미래는
            <br />
            <em>갈라집니다</em>.
          </h1>
          <p className="hero-lede">
            오른쪽의 두 점은 식 세 줄짜리 같은 규칙을 따르고, 출발점은 십만분의 일만 다릅니다. 한동안 나란히 가던 두 점은 어느 순간 서로 다른 날개로 갈라져 다시는 만나지 않습니다. 미분방정식은 이렇게 "지금 어떻게 변하는가"라는 규칙에서 미래를 계산하는 수학입니다. {course.lessons.length}개의 장에서 성장과 감쇠, 진동과 공명, 위상 평면과 혼돈, 그리고 공식이 없을 때 컴퓨터로 푸는 법까지 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'nonlinear-chaos')}>
              비선형계와 혼돈 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <LorenzHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>시뮬레이션을 돌립니다</h3>
          <p>모든 그림은 방정식을 브라우저에서 직접 풀어 움직입니다. 출발점을 찍으면 그 점에서 시작하는 해가 그려지고, 매개변수를 바꾸면 계 전체의 모습이 바뀝니다.</p>
        </div>
        <div>
          <h3>공식과 그림을 나란히</h3>
          <p>손으로 풀 수 있는 해는 공식으로 구하고, 같은 해를 수치로 계산한 결과와 겹쳐 그립니다. 둘이 어긋나는 곳에서 수치 방법의 오차도 함께 봅니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            미분과 적분은 <a href={courseHref('math-calculus')}>미적분학</a>에서, 고윳값과 고유벡터는 <a href={courseHref('math-linear-algebra')}>선형대수</a>에서 다룹니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림과 시뮬레이션은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
