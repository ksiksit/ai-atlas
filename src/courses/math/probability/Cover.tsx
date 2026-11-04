import { useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { binomialPmf, rng } from '../../../lib/math';
import { alpha, usePalette } from '../../../lib/theme';
import { lessonHref } from '../../index';
import { useMathColors } from './lessons/parts';
import course from './course';
import '../../../styles/cover.css';
import './lessons/probability.css';

/* ─────────────── Hero: a Galton board filling its bins ─────────────── */

const ROWS = 14;
const BALLS = 360; // balls per round, then the board empties and starts over
const SPAWN = 0.045; // seconds between balls
const SPEED = 9; // peg rows per second
const PMF = binomialPmf(ROWS, 0.5);

interface Ball {
  bits: number[]; // 0 = left, 1 = right at each row
  t: number; // rows travelled
}

function makeBall(r: () => number): Ball {
  return { bits: Array.from({ length: ROWS }, () => (r() < 0.5 ? 0 : 1)), t: 0 };
}

function GaltonHero() {
  const P = usePalette();
  const [c1, c2, c3] = useMathColors(P);
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const sim = useRef<{ round: number; r: () => number; balls: Ball[]; counts: number[]; spawned: number; clock: number; hold: number }>(null as never);
  if (!sim.current) {
    const r = rng(11);
    const counts = new Array(ROWS + 1).fill(0);
    if (still) for (let k = 0; k < BALLS; k++) counts[makeBall(r).bits.reduce((a, b) => a + b, 0)]++;
    sim.current = { round: 0, r, balls: [], counts, spawned: still ? BALLS : 0, clock: 0, hold: 0 };
  }
  const [, setTick] = useState(0);

  useAnimationFrame((dt) => {
    const s = sim.current;
    if (s.spawned >= BALLS && s.balls.length === 0) {
      s.hold += dt;
      if (s.hold > 2.4) {
        s.round++;
        s.r = rng(11 + s.round * 7919);
        s.counts = new Array(ROWS + 1).fill(0);
        s.spawned = 0;
        s.hold = 0;
      }
    }
    s.clock += dt;
    while (s.clock > SPAWN && s.spawned < BALLS) {
      s.clock -= SPAWN;
      s.balls.push(makeBall(s.r));
      s.spawned++;
    }
    if (s.spawned >= BALLS) s.clock = 0;
    for (const b of s.balls) b.t += dt * SPEED;
    const landed = s.balls.filter((b) => b.t >= ROWS + 1);
    for (const b of landed) s.counts[b.bits.reduce((a, x) => a + x, 0)]++;
    s.balls = s.balls.filter((b) => b.t < ROWS + 1);
    setTick((x) => x + 1);
  }, inView && !still);

  const s = sim.current;
  const done = s.counts.reduce((a, b) => a + b, 0);
  const mid = s.counts[ROWS / 2];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const dx = w / (ROWS + 3);
      const cx = w / 2;
      const top = 22;
      const dy = Math.min(dx * 0.8, (h * 0.46 - 24) / ROWS);
      const binTop = top + ROWS * dy + 14;
      const base = h - 22;
      const xAt = (row: number, rights: number) => cx + (rights - row / 2) * dx;

      // funnel
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - dx * 1.2, 4);
      ctx.lineTo(cx - dx * 0.35, top - 8);
      ctx.moveTo(cx + dx * 1.2, 4);
      ctx.lineTo(cx + dx * 0.35, top - 8);
      ctx.stroke();
      // pegs
      ctx.fillStyle = alpha(P.ink, 0.45);
      for (let r = 0; r < ROWS; r++)
        for (let k = 0; k <= r; k++) {
          ctx.beginPath();
          ctx.arc(xAt(r, k), top + r * dy, Math.max(1.6, dx * 0.07), 0, Math.PI * 2);
          ctx.fill();
        }
      // bin walls
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      for (let j = 0; j <= ROWS + 1; j++) {
        const x = xAt(ROWS, j) - dx / 2;
        ctx.beginPath();
        ctx.moveTo(x, binTop);
        ctx.lineTo(x, base);
        ctx.stroke();
      }
      ctx.strokeStyle = P.lineStrong;
      ctx.beginPath();
      ctx.moveTo(xAt(ROWS, 0) - dx / 2, base + 0.5);
      ctx.lineTo(xAt(ROWS, ROWS) + dx / 2, base + 0.5);
      ctx.stroke();
      // histogram scaled to the expected count of the middle bin
      const scale = (base - binTop - 6) / (BALLS * PMF[ROWS / 2] * 1.25);
      s.counts.forEach((c, j) => {
        if (!c) return;
        const x = xAt(ROWS, j);
        const hh = c * scale;
        ctx.fillStyle = alpha(c2, 0.75);
        ctx.fillRect(x - dx * 0.42, base - hh, dx * 0.84, hh);
      });
      // expected shape
      ctx.strokeStyle = c3;
      ctx.lineWidth = 2;
      ctx.beginPath();
      PMF.forEach((p, j) => {
        const x = xAt(ROWS, j);
        const y = base - p * BALLS * scale;
        if (j) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
      PMF.forEach((p, j) => {
        ctx.beginPath();
        ctx.arc(xAt(ROWS, j), base - p * BALLS * scale, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = c3;
        ctx.fill();
      });
      // falling balls
      ctx.fillStyle = c1;
      for (const b of s.balls) {
        const row = Math.min(ROWS, Math.floor(b.t));
        const f = b.t - row;
        const rights = b.bits.slice(0, row).reduce((a, x) => a + x, 0);
        let x: number;
        let y: number;
        if (row < ROWS) {
          const x0 = xAt(row, rights);
          const x1 = xAt(row + 1, rights + b.bits[row]);
          x = x0 + (x1 - x0) * f;
          y = top + (row + f) * dy - Math.sin(f * Math.PI) * dy * 0.35 - dy * 0.3;
        } else {
          x = xAt(ROWS, rights);
          y = top + ROWS * dy + f * (base - top - ROWS * dy - 8);
        }
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2.4, Math.min(dx * 0.15, dy * 0.4)), 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [P, c1, c2, c3, s.balls, s.counts, done],
    { aspect: 1.25, maxHeight: 440, minHeight: 280 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="pr-hero" role="img" aria-label={`골턴 보드 애니메이션: 공이 못 ${ROWS}줄을 지나며 매번 왼쪽이나 오른쪽으로 튀어 아래 칸에 쌓입니다. 쌓인 모양이 이항 분포 곡선을 따라갑니다. 지금까지 ${done}개.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap" aria-live="off">
        공 {done}개 · 가운데 칸 {mid}개 ({done ? Math.round((mid / done) * 100) : 0}%) · 이론값 C({ROWS}, {ROWS / 2})/2<sup>{ROWS}</sup> ≈ {Math.round(PMF[ROWS / 2] * 100)}%
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
            하나는
            <br />
            예측할 수 없어도
            <br />
            <em>천 개는 계산합니다</em>.
          </h1>
          <p className="hero-lede">
            공 하나가 어느 칸에 떨어질지는 알 수 없지만, 천 개가 쌓인 모양은 미리 계산할 수 있습니다. 이 과목은 조건부 확률과 베이즈 정리에서 시작해 기댓값, 분포, 꼬리 부등식을 거쳐 무작위 알고리즘과 해싱, 마르코프 체인과 페이지랭크까지 {course.lessons.length}개의 장에서 컴퓨터과학이 쓰는 확률을 직접 굴려 보며 익힙니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'distributions')}>
              분포 시뮬레이터 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <GaltonHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>공식보다 실험 먼저</h3>
          <p>모든 그림은 난수로 직접 실험합니다. 결과가 공식과 얼마나 맞는지 보고, "다시 굴리기"로 운이 바뀌어도 무엇이 그대로인지 확인하세요. 같은 씨앗이면 언제나 같은 결과가 나옵니다.</p>
        </div>
        <div>
          <h3>기호는 풀어서</h3>
          <p>
            P(A | B), E[X], Var(X) 같은 기호는 처음 나올 때마다 말로 풀어 씁니다. <a href={lessonHref('math-discrete', 'counting')}>경우의 수</a>를 셀 수 있으면 충분히 따라올 수 있습니다.
          </p>
        </div>
        <div>
          <h3>어디에 쓰이나</h3>
          <p>
            컴퓨터과학과 인공지능 전공의 기초 과목입니다. 기댓값과 꼬리 경계는 <a href="#cs-algorithm-design">알고리즘 설계</a>와 <a href="#cs-system-algorithms">시스템 알고리즘</a>에서, 베이즈 정리와 분포는 <a href="#ai-basics">기초 인공지능</a>과 <a href="#stats-basics">기초 통계학</a>에서 다시 만납니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
