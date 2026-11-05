import { useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { alpha, usePalette } from '../../../lib/theme';
import { courseHref, lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './lessons/algebra.css';

/* ─────────────── Hero: the six symmetries of a triangle filling in their multiplication table ─────────────── */

/**
 * A symmetry is a permutation of the three corner positions: the label at position i moves to σ[i].
 * Positions sit at the top (0), bottom right (1) and bottom left (2).
 */
const SYM: { name: string; p: number[] }[] = [
  { name: 'e', p: [0, 1, 2] },
  { name: 'r', p: [1, 2, 0] },
  { name: 'r²', p: [2, 0, 1] },
  { name: 's₀', p: [0, 2, 1] },
  { name: 's₁', p: [2, 1, 0] },
  { name: 's₂', p: [1, 0, 2] },
];
/** "x 다음 y": first x, then y, as one symmetry. */
const then = (x: number, y: number) => {
  const q = SYM[x].p.map((i) => SYM[y].p[i]);
  return SYM.findIndex((s) => s.p.every((v, i) => v === q[i]));
};
const TABLE = SYM.map((_, x) => SYM.map((__, y) => then(x, y)));
const STEP = 0.9; // seconds per product
const ORDER = Array.from({ length: 36 }, (_, k) => k); // fill row by row

function apply(labels: number[], s: number): number[] {
  const out = [0, 0, 0];
  labels.forEach((lab, i) => (out[SYM[s].p[i]] = lab));
  return out;
}

function TriangleHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const t = useRef(still ? 36 * STEP : 0);
  const [, setTick] = useState(0);
  useAnimationFrame((dt) => {
    t.current += dt;
    if (t.current > 36 * STEP + 2.5) t.current = 0;
    setTick((x) => x + 1);
  }, inView && !still);

  const k = Math.min(35, Math.floor(t.current / STEP));
  const filled = Math.min(36, Math.floor(t.current / STEP) + 1);
  const cell = ORDER[k];
  const x = Math.floor(cell / 6), y = cell % 6;
  const z = TABLE[x][y];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const corner = [P.neg, P.good, P.pos]; // blue, green, orange corners
      const top = 8;
      const triH = Math.min(118, h * 0.32);
      const slotW = w / 5;
      const tri = (cx: number, cy: number, R: number, labels: number[], title: string) => {
        const pos = [0, 1, 2].map((i) => {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
          return [cx + R * Math.cos(ang), cy + R * Math.sin(ang)];
        });
        ctx.fillStyle = alpha(P.math, 0.12);
        ctx.strokeStyle = P.ink2;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        pos.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        labels.forEach((lab, i) => {
          ctx.fillStyle = corner[lab];
          ctx.beginPath();
          ctx.arc(pos[i][0], pos[i][1], 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = P.surface;
          ctx.font = `700 10px ${P.fontMono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(lab + 1), pos[i][0], pos[i][1] + 0.5);
        });
        ctx.fillStyle = P.ink2;
        ctx.font = `600 12px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(title, cx, cy + R * 0.5 + 14);
      };
      const R = Math.min(triH * 0.55, slotW * 0.42);
      const cy = top + R + 4;
      const start = [0, 1, 2];
      const mid = apply(start, x);
      const end = apply(mid, y);
      tri(slotW * 0.6, cy, R, start, '처음');
      tri(slotW * 2.5, cy, R, mid, `${SYM[x].name} 한 뒤`);
      tri(slotW * 4.4, cy, R, end, `${SYM[y].name}까지 = ${SYM[z].name}`);
      ctx.fillStyle = P.ink3;
      ctx.font = `600 16px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('→', slotW * 1.55, cy);
      ctx.fillText('→', slotW * 3.45, cy);

      // the multiplication table: row = first move, column = second move
      const ty = cy + R * 0.5 + 40;
      const cs = Math.min((w - 40) / 7, (h - ty - 6) / 7);
      const tx = (w - cs * 7) / 2;
      ctx.font = `600 ${Math.round(cs * 0.34)}px ${P.fontMono}`;
      for (let j = 0; j < 6; j++) {
        ctx.fillStyle = j === y ? P.ink : P.ink3;
        ctx.fillText(SYM[j].name, tx + (j + 1.5) * cs, ty + cs * 0.5);
        ctx.fillStyle = j === x ? P.ink : P.ink3;
        ctx.fillText(SYM[j].name, tx + cs * 0.5, ty + (j + 1.5) * cs);
      }
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 6; c++) {
          const idx = r * 6 + c;
          const px = tx + (c + 1) * cs, py = ty + (r + 1) * cs;
          const isNow = r === x && c === y && !still;
          ctx.fillStyle = isNow ? alpha(P.accent, 0.35) : idx < filled ? alpha(TABLE[r][c] < 3 ? P.math : P.ink3, 0.14) : P.surface2;
          ctx.fillRect(px + 1, py + 1, cs - 2, cs - 2);
          if (idx < filled) {
            ctx.fillStyle = isNow ? P.ink : P.ink2;
            ctx.fillText(SYM[TABLE[r][c]].name, px + cs / 2, py + cs / 2 + 0.5);
          }
        }
    },
    [P, x, y, z, filled, still],
    { aspect: 0.95, maxHeight: 500, minHeight: 40 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`정삼각형의 대칭 여섯 가지(항등 e, 회전 r과 r², 뒤집기 s₀, s₁, s₂)를 둘씩 이어 해 보며 곱셈표를 채우는 그림. 지금은 ${SYM[x].name} 다음 ${SYM[y].name}을 하면 ${SYM[z].name}과 같다는 것을 보여 주고, 표의 ${filled}칸이 채워졌습니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="cover-key" aria-hidden="true">
          <span>
            <i style={{ background: 'var(--c-math)' }} />
            회전
          </span>
          <span>
            <i style={{ background: 'var(--ink-3)' }} />
            뒤집기
          </span>
        </span>
        행은 먼저 한 대칭, 열은 그다음 대칭 · {SYM[x].name} 다음 {SYM[y].name} = <strong>{SYM[z].name}</strong>
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
            대칭도
            <br />
            <em>곱할 수</em>
            <br />
            있습니다.
          </h1>
          <p className="hero-lede">
            정삼각형을 제자리에 다시 놓는 방법은 돌리기 세 가지와 뒤집기 세 가지, 모두 여섯입니다. 둘을 이어 하면 언제나 또 그 여섯 중 하나가 되므로, 수를 곱하듯 대칭을 곱하는 표를 만들 수 있습니다. 오른쪽 표의 행과 열마다 여섯 대칭이 한 번씩만 나오는 데에는 이유가 있고, 그 이유를 모은 것이 군입니다. {course.lessons.length}개의 장에서 군과 환과 체를 직접 계산하며, 마지막에는 깨진 데이터를 되살리는 부호와 암호에 씁니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'codes-crypto')}>
              부호와 암호 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <TriangleHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>표를 직접 채웁니다</h3>
          <p>군의 곱셈표, 유한체의 곱셈표를 손으로 채우듯 하나씩 만들어 봅니다. 공리와 정리는 그 표에서 눈으로 찾을 수 있는 무늬로 먼저 나타납니다.</p>
        </div>
        <div>
          <h3>작은 예에서 증명으로</h3>
          <p>장마다 작은 군에서 규칙을 확인한 뒤, 그 규칙이 모든 군에서 성립하는 이유를 짧은 증명으로 적습니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            모듈러 연산과 증명은 <a href={courseHref('math-discrete')}>이산수학</a>에서, 행렬과 행렬식은 <a href={courseHref('math-linear-algebra')}>선형대수</a>에서 다룹니다. 공개 키 암호는 <a href={lessonHref('net-security', 'public-key')}>네트워크 보안</a>에서 처음 나왔습니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
