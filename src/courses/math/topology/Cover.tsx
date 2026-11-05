import { useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { alpha, usePalette } from '../../../lib/theme';
import { courseHref, lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './lessons/topology.css';

/* ─────────────── Hero: two rubber bands shrinking; one around a hole catches on it ─────────────── */

/** The plane has one hole (a peg) at HOLE with radius HOLE_R. Units: the box is [0, 10] × [0, 6]. */
const HOLE = { x: 6.9, y: 3, r: 0.55 };
const SECONDS = 5, HOLD = 2;

/** A wobbly closed loop around (cx, cy) with mean radius R. */
function loop(cx: number, cy: number, R: number, phase: number, n = 120): [number, number][] {
  return Array.from({ length: n + 1 }, (_, k) => {
    const th = (k / n) * Math.PI * 2;
    const r = R * (1 + 0.16 * Math.sin(3 * th + phase) + 0.08 * Math.cos(5 * th - phase));
    return [cx + r * Math.cos(th), cy + r * Math.sin(th)];
  });
}

/** Winding number of a closed polyline around (px, py), by summing angle changes. */
function winding(pts: [number, number][], px: number, py: number): number {
  let total = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = Math.atan2(pts[k - 1][1] - py, pts[k - 1][0] - px);
    const b = Math.atan2(pts[k][1] - py, pts[k][0] - px);
    let d = b - a;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    total += d;
  }
  return Math.round(total / (2 * Math.PI));
}

function BandsHero() {
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
  const s = Math.min(1, t.current / SECONDS);
  const ease = 1 - (1 - s) * (1 - s);

  // band A, around empty ground, shrinks all the way; band B, around the peg, stops at the peg
  const A = loop(3, 3, 2.2 * (1 - ease) + 0.02, 0.5 + s * 2);
  const rB = 2.3 - (2.3 - HOLE.r * 1.25) * ease;
  const B = loop(HOLE.x, HOLE.y, rB, 2 + s * 2).map(([x, y]) => {
    // where the wobble would cut into the peg, the band rests on the peg instead
    const dx = x - HOLE.x, dy = y - HOLE.y, d = Math.hypot(dx, dy);
    const min = HOLE.r + 0.08;
    return d < min ? ([HOLE.x + (dx / d) * min, HOLE.y + (dy / d) * min] as [number, number]) : ([x, y] as [number, number]);
  });
  const wA = winding(A, HOLE.x, HOLE.y);
  const wB = winding(B, HOLE.x, HOLE.y);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const S = Math.min(w / 10, h / 6);
      const ox = (w - 10 * S) / 2, oy = (h - 6 * S) / 2;
      const X = (x: number) => ox + x * S, Y = (y: number) => oy + (6 - y) * S;
      // the sheet
      ctx.fillStyle = P.surface2;
      ctx.fillRect(ox, oy, 10 * S, 6 * S);
      // the peg (a hole in the plane)
      ctx.fillStyle = P.bg;
      ctx.strokeStyle = P.ink3;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(X(HOLE.x), Y(HOLE.y), HOLE.r * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const band = (pts: [number, number][], color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        pts.forEach(([x, y], k) => (k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        ctx.stroke();
      };
      band(A, P.good);
      band(B, P.neg);
      if (s >= 1) {
        ctx.fillStyle = P.good;
        ctx.beginPath();
        ctx.arc(X(3), Y(3), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = alpha(P.ink, 0.75);
      ctx.font = `600 12px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(s >= 1 ? '한 점으로 줄어듦' : '줄어드는 중', X(3), Y(0.75));
      ctx.fillText(s >= 1 ? '구멍에 걸림' : '줄어드는 중', X(HOLE.x), Y(0.75));
    },
    [P, s],
    { aspect: 10 / 6, maxHeight: 360, minHeight: 40 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`구멍이 하나 뚫린 평면 위에 고무줄 두 개가 있습니다. 왼쪽 초록 고무줄은 구멍을 감싸지 않아 끝까지 줄어들어 한 점이 되고, 오른쪽 파랑 고무줄은 구멍을 한 바퀴 감싸고 있어 구멍에 걸려 멈춥니다. 구멍에 대한 감김 수는 왼쪽 ${wA}, 오른쪽 ${wB}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="cover-key" aria-hidden="true">
          <span>
            <i style={{ background: 'var(--good)' }} />
            감김 수 {wA}
          </span>
          <span>
            <i style={{ background: 'var(--neg)' }} />
            감김 수 {wB}
          </span>
        </span>
        구멍을 몇 번 감았는지는 고무줄을 아무리 움직여도 변하지 않습니다
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
            고무줄을 줄여 보면
            <br />
            <em>구멍</em>이
            <br />
            보입니다.
          </h1>
          <p className="hero-lede">
            오른쪽 평면에는 말뚝 하나가 박혀 구멍이 나 있습니다. 구멍을 감싸지 않은 고무줄은 한 점까지 줄어들지만, 구멍을 감싼 고무줄은 아무리 당겨도 걸립니다. 길이도 넓이도 모양도 다 바뀌는데 끝까지 남는 것, 곧 "구멍을 몇 번 감았는가"가 위상수학이 세는 수입니다. {course.lessons.length}개의 장에서 열린 집합으로 연속과 연결과 콤팩트를 다시 정의하고, 곡면을 붙이고, 고리로 구멍을 셉니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'fundamental-group')}>
              기본군과 구멍 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <BandsHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>고무판처럼 다룹니다</h3>
          <p>위상수학에서는 찢거나 붙이지 않는 한 얼마든지 늘이고 구부려도 같은 것으로 봅니다. 그림마다 직접 변형해 보며 무엇이 변하고 무엇이 남는지 확인합니다.</p>
        </div>
        <div>
          <h3>정의에서 정리까지</h3>
          <p>해석학처럼 장마다 정의와 정리를 정확히 적고 짧은 증명을 끝까지 씁니다. 반례 그림이 함께 있어 정의가 왜 그렇게 생겼는지 볼 수 있습니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            수열, 연속, 엡실론-델타는 <a href={courseHref('math-analysis')}>해석학</a>에서 다룹니다. 기본군에는 <a href={courseHref('math-abstract-algebra')}>현대대수학</a>의 군이 나옵니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
