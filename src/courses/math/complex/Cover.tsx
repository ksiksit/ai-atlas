import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { usePalette } from '../../../lib/theme';
import { courseHref, lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './lessons/complex.css';

/* ─────────────── Hero: domain colouring of a function whose zeros and poles drift ─────────────── */

type C = [number, number];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];

const RES = 150;
const BOX = 2.2;

/** Two zeros and one double pole, each drifting on its own small circle. */
function roots(t: number): { zeros: C[]; poles: C[] } {
  return {
    zeros: [
      [0.9 + 0.35 * Math.cos(t), 0.7 + 0.35 * Math.sin(t)],
      [-1.0 + 0.3 * Math.cos(-0.7 * t + 1), -0.5 + 0.3 * Math.sin(-0.7 * t + 1)],
    ],
    poles: [[0.15 * Math.cos(0.5 * t + 2), -0.9 + 0.15 * Math.sin(0.5 * t + 2)]],
  };
}

/** HSL → RGB for the colour wheel, l in 0..1. */
function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function render(t: number, dark: boolean): ImageData {
  const { zeros, poles } = roots(t);
  const img = new ImageData(RES, RES);
  for (let j = 0; j < RES; j++)
    for (let i = 0; i < RES; i++) {
      const z: C = [-BOX + (2 * BOX * (i + 0.5)) / RES, BOX - (2 * BOX * (j + 0.5)) / RES];
      let num: C = [1, 0];
      for (const a of zeros) num = mul(num, sub(z, a));
      let den: C = [1, 0];
      for (const p of poles) den = mul(den, mul(sub(z, p), sub(z, p)));
      const w = div(num, den);
      const arg = Math.atan2(w[1], w[0]);
      const mod = Math.hypot(w[0], w[1]);
      // hue = argument; brightness steps each time |w| doubles
      const band = Math.log2(mod + 1e-12);
      const frac = band - Math.floor(band);
      const base = dark ? 0.42 : 0.5;
      const l = base + 0.14 * (frac - 0.5);
      const [r, g, b] = hsl((arg / (2 * Math.PI) + 1) % 1, 0.78, l);
      const k = (j * RES + i) * 4;
      img.data[k] = r;
      img.data[k + 1] = g;
      img.data[k + 2] = b;
      img.data[k + 3] = 255;
    }
  return img;
}

function ColourHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const t = useRef(0.8);
  const [, setTick] = useState(0);
  useAnimationFrame((dt) => {
    t.current += dt * 0.35;
    setTick((x) => x + 1);
  }, inView && !still);
  const time = t.current;
  const img = useMemo(() => render(time, P.dark), [time, P.dark]);
  const { zeros, poles } = roots(time);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const S = Math.min(w, h);
      const ox = (w - S) / 2, oy = (h - S) / 2;
      const tmp = document.createElement('canvas');
      tmp.width = RES;
      tmp.height = RES;
      tmp.getContext('2d')!.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tmp, ox, oy, S, S);
      const X = (x: number) => ox + ((x + BOX) / (2 * BOX)) * S;
      const Y = (y: number) => oy + ((BOX - y) / (2 * BOX)) * S;
      // axes
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox, Y(0) + 0.5);
      ctx.lineTo(ox + S, Y(0) + 0.5);
      ctx.moveTo(X(0) + 0.5, oy);
      ctx.lineTo(X(0) + 0.5, oy + S);
      ctx.stroke();
      // markers: zeros as rings, the double pole as a cross
      ctx.lineWidth = 2;
      for (const a of zeros) {
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(X(a[0]), Y(a[1]), 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const p of poles) {
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(X(p[0]) - 6, Y(p[1]) - 6);
        ctx.lineTo(X(p[0]) + 6, Y(p[1]) + 6);
        ctx.moveTo(X(p[0]) + 6, Y(p[1]) - 6);
        ctx.lineTo(X(p[0]) - 6, Y(p[1]) + 6);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `600 11px ${P.fontMono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Re', ox + S - 22, Y(0) + 4);
      ctx.fillText('Im', X(0) + 5, oy + 4);
    },
    [img, P],
    { aspect: 1, maxHeight: 440, minHeight: 40 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label="복소 함수 f(z) = (z − a)(z − b) / (z − p)²의 정의역 색칠. 색상은 f(z)의 편각, 밝기 띠는 |f(z)|가 두 배가 될 때마다 바뀝니다. 흰 동그라미로 표시한 영점 둘레에서는 색이 한 방향으로 한 바퀴, 흰 가위표로 표시한 이중 극 둘레에서는 반대 방향으로 두 바퀴 돕니다. 영점과 극은 천천히 움직입니다.">
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="cover-key" aria-hidden="true">
          <span>○ 영점 2개</span>
          <span>× 이중 극 1개</span>
        </span>
        색 = 편각, 밝기 띠 = |f|가 두 배씩 · 영점 둘레 한 바퀴, 이중 극 둘레 반대로 두 바퀴
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
            색이 한 바퀴 돌면
            <br />
            그 안에
            <br />
            <em>영점</em>이 있습니다.
          </h1>
          <p className="hero-lede">
            오른쪽 그림은 복소수 평면의 모든 점 z를 f(z)의 방향(편각)에 따라 색칠한 것입니다. 흰 동그라미 둘레를 한 바퀴 돌면 색도 빨강, 노랑, 초록, 파랑을 거쳐 한 바퀴 돌고, 가위표 둘레에서는 반대 방향으로 두 바퀴 돕니다. 경계에서 색이 몇 바퀴 도는지만 세면 안쪽의 영점과 극을 셀 수 있다는 것, 이것이 복소해석의 힘입니다. {course.lessons.length}개의 장에서 정칙 함수, 급수, 코시 정리, 유수 정리, 그리고 신호와 흐름에의 응용을 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'residues')}>
              유수 정리 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <ColourHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>함수를 색으로 봅니다</h3>
          <p>입력도 출력도 평면인 복소 함수는 그래프로 그릴 수 없습니다. 대신 출력의 방향을 색으로, 크기를 밝기로 칠한 정의역 색칠로 함수 전체를 한 장에 봅니다.</p>
        </div>
        <div>
          <h3>경로를 끌어 봅니다</h3>
          <p>적분 경로를 마우스로 끌어 모양을 바꾸면, 특이점을 넘지 않는 한 적분값이 그대로인 것을 직접 확인할 수 있습니다. 모든 적분은 수치로 계산해 정리와 비교합니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            편미분과 선적분, 그린 정리는 <a href={courseHref('math-multivariable')}>다변수 미적분</a>에서, 급수와 균등 수렴은 <a href={courseHref('math-analysis')}>해석학</a>에서 다룹니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
