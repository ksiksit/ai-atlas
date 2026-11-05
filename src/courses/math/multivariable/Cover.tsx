import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { rng } from '../../../lib/math';
import { alpha, usePalette } from '../../../lib/theme';
import { courseHref, lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './lessons/multivariable.css';

/* ─────────────── Hero: balls rolling down a contour map, crossing every contour at a right angle ─────────────── */

/** Two hills and a hollow on [-3, 3]². */
function f(x: number, y: number): number {
  return 1.6 * Math.exp(-((x - 1) ** 2 + (y - 0.6) ** 2) / 1.1) + 1.1 * Math.exp(-((x + 1.3) ** 2 + (y + 0.9) ** 2) / 0.8) - 0.9 * Math.exp(-((x + 0.6) ** 2 + (y - 1.6) ** 2) / 0.9) + 0.04 * (x * x + y * y);
}
function grad(x: number, y: number): [number, number] {
  const e = 1e-4;
  return [(f(x + e, y) - f(x - e, y)) / (2 * e), (f(x, y + e) - f(x, y - e)) / (2 * e)];
}
const BOX = 3;
const BANDS = 12;
const BALLS = 7;
const STEP = 0.9; // descent speed, in box units per second per unit of slope

interface Ball {
  x: number;
  y: number;
  trail: [number, number][];
}

function newBalls(seed: number): Ball[] {
  const r = rng(seed);
  return Array.from({ length: BALLS }, () => {
    const x = (r() * 2 - 1) * BOX * 0.9, y = (r() * 2 - 1) * BOX * 0.9;
    return { x, y, trail: [[x, y]] };
  });
}

function MapHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const [seed, setSeed] = useState(2);
  const balls = useMemo(() => newBalls(seed), [seed]);
  const age = useRef(0);
  const [, setTick] = useState(0);

  const roll = (dt: number) => {
    for (const b of balls) {
      const [gx, gy] = grad(b.x, b.y);
      const n = Math.hypot(gx, gy);
      if (n < 0.01) continue;
      // move against the gradient, at a speed that grows with the slope but stays visible on flats
      const sp = STEP * Math.min(1.2, 0.25 + n);
      b.x = Math.max(-BOX, Math.min(BOX, b.x - (gx / n) * sp * dt));
      b.y = Math.max(-BOX, Math.min(BOX, b.y - (gy / n) * sp * dt));
      const last = b.trail[b.trail.length - 1];
      if (Math.hypot(b.x - last[0], b.y - last[1]) > 0.04) b.trail.push([b.x, b.y]);
    }
  };
  if (still && age.current === 0) {
    for (let k = 0; k < 400; k++) roll(1 / 60);
    age.current = 1;
  }

  useAnimationFrame((dt) => {
    age.current += dt;
    if (age.current > 9) {
      age.current = 0;
      setSeed((s) => s + 1);
      return;
    }
    roll(Math.min(dt, 1 / 30));
    setTick((x) => x + 1);
  }, inView && !still);

  // the banded height map, drawn once per theme into an offscreen image
  const field = useMemo(() => {
    const N = 160;
    const vals = new Float64Array(N * N);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const v = f(-BOX + (2 * BOX * (i + 0.5)) / N, BOX - (2 * BOX * (j + 0.5)) / N);
        vals[j * N + i] = v;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    return { N, vals, lo, hi };
  }, []);

  // banded heights and contour lines, one pixel per sample, redrawn only when the theme changes
  const map = useMemo(() => {
    const { N, vals, lo, hi } = field;
    const c = document.createElement('canvas');
    c.width = N;
    c.height = N;
    const g = c.getContext('2d')!;
    const band = (v: number) => Math.min(BANDS - 1, Math.floor(((v - lo) / (hi - lo)) * BANDS));
    g.fillStyle = P.surface;
    g.fillRect(0, 0, N, N);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const b = band(vals[j * N + i]);
        const edge = i < N - 1 && j < N - 1 && (b !== band(vals[j * N + i + 1]) || b !== band(vals[(j + 1) * N + i]));
        g.fillStyle = edge ? alpha(P.ink, 0.5) : alpha(P.math, 0.05 + (0.5 * b) / (BANDS - 1));
        g.fillRect(i, j, 1, 1);
      }
    return c;
  }, [P, field]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const S = Math.min(w, h) - 4;
      const ox = (w - S) / 2, oy = (h - S) / 2;
      // the height map is drawn once per theme (see `map` below) and only copied here
      ctx.drawImage(map, ox, oy, S, S);
      const X = (x: number) => ox + ((x + BOX) / (2 * BOX)) * S;
      const Y = (y: number) => oy + ((BOX - y) / (2 * BOX)) * S;
      for (const b of balls) {
        ctx.strokeStyle = P.dl;
        ctx.lineWidth = 2;
        ctx.beginPath();
        b.trail.forEach(([x, y], k) => (k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        ctx.lineTo(X(b.x), Y(b.y));
        ctx.stroke();
        // the downhill arrow at the ball
        const [gx, gy] = grad(b.x, b.y);
        const n = Math.hypot(gx, gy);
        if (n > 0.02) {
          const L = 18;
          const ex = X(b.x) - (gx / n) * L, ey = Y(b.y) + (gy / n) * L;
          ctx.strokeStyle = P.ink;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(X(b.x), Y(b.y));
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
        ctx.fillStyle = P.dl;
        ctx.beginPath();
        ctx.arc(X(b.x), Y(b.y), 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = P.surface;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    },
    [P, map, balls, balls[0].x, balls[0].y, balls[BALLS - 1].x],
    { aspect: 1.1, maxHeight: 440, minHeight: 40 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`언덕 두 개와 웅덩이 하나가 있는 지형을 등고선 지도로 그린 그림. 공 ${BALLS}개가 각자 경사의 반대 방향, 곧 가장 가파른 내리막을 따라 굴러가며 자취를 남기고, 자취는 등고선을 늘 직각으로 가로지릅니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="cover-key" aria-hidden="true">
          <span>
            <i style={{ background: 'var(--c-math)' }} />
            높이
          </span>
          <span>
            <i style={{ background: 'var(--c-dl)', borderRadius: '50%' }} />
            공의 자취
          </span>
        </span>
        공은 −∇f 방향, 가장 가파른 내리막으로만 움직입니다
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
            가장 가파른 길은
            <br />
            <em>등고선</em>에
            <br />
            수직입니다.
          </h1>
          <p className="hero-lede">
            오른쪽 지도 위의 공들은 각자 서 있는 자리에서 가장 가파르게 내려가는 방향으로만 굴러갑니다. 그 방향은 여러 변수의 미분을 모은 경사 벡터가 정해 주고, 공의 자취는 언제나 등고선을 직각으로 가로지릅니다. 인공지능이 손실을 줄이는 방법도 이와 같습니다. {course.lessons.length}개의 장에서 곡면을 미분하고, 부피를 적분하고, 바람 같은 벡터장의 흐름을 재는 법을 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'vector-theorems')}>
              그린·스토크스·발산 정리 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <MapHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>곡면을 돌려 봅니다</h3>
          <p>두 변수의 함수는 3차원 곡면과 2차원 등고선 지도, 두 가지로 함께 그립니다. 한쪽에서 점을 옮기면 다른 쪽에서도 같은 점이 움직입니다.</p>
        </div>
        <div>
          <h3>작게 쪼개면 선형입니다</h3>
          <p>복잡한 변환도 아주 작은 조각에서는 행렬 하나처럼 움직입니다. 확대해 보는 그림으로 그 행렬이 어디서 나오는지 확인합니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            미분과 적분은 <a href={courseHref('math-calculus')}>미적분학</a>에서, 행렬과 행렬식은 <a href={courseHref('math-linear-algebra')}>선형대수</a>에서 다룹니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
