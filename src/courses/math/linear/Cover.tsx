import { useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { alpha, usePalette } from '../../../lib/theme';
import { lessonHref } from '../../index';
import course from './course';
import { F_SHAPE, arrow, lineThrough, plane, poly, tGrid, useLaColors } from './lessons/draw';
import { I2, ap, ease, eig2, lerpMat, nf, scale, type Mat2, type Vec2 } from './lessons/la';
import '../../../styles/cover.css';
import './lessons/linear.css';

/* ─────────────── Hero: a grid transformed by A, eigenvectors staying on their lines ─────────────── */

const MATS: Mat2[] = [
  [1.5, 0.5, 0.5, 1.5],
  [1.6, 0.6, 0, 0.7],
  [0.6, 1.1, 0.9, 0.2],
];
const GO = 1.8; // seconds to morph I → A
const HOLD = 2.2;
const BACK = 1.2;
const CYCLE = GO + HOLD + BACK;
const OTHERS: Vec2[] = [
  [0.2, 1],
  [-1, 0.35],
];

function GridHero() {
  const P = usePalette();
  const [C1, C2, C3] = useLaColors(P);
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const t = useRef(still ? GO + 0.5 : 0.3);
  const [, setTick] = useState(0);

  useAnimationFrame((dt) => {
    t.current = (t.current + dt) % (CYCLE * MATS.length);
    setTick((x) => x + 1);
  }, inView && !still);

  const mi = Math.floor(t.current / CYCLE) % MATS.length;
  const local = t.current - mi * CYCLE;
  const A = MATS[mi];
  const s = local < GO ? ease(local / GO) : local < GO + HOLD ? 1 : 1 - ease((local - GO - HOLD) / BACK);
  const Mt = lerpMat(I2, A, s);
  const eig = eig2(A);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 3, { numbers: false });
      tGrid(plot, Mt, alpha(C2, 0.45), 1, 10, alpha(C2, 0.9));
      poly(plot, F_SHAPE, Mt, alpha(C1, 0.22), alpha(C1, 0.8), 1.4);
      eig.forEach((e) => lineThrough(plot, e.v, alpha(C3, 0.95), 2, [7, 5]));
      OTHERS.forEach((v) => {
        const q = ap(Mt, v);
        arrow(plot, [0, 0], q, alpha(P.ink3, 0.9), 2.4, 10);
      });
      eig.forEach((e, k) => {
        const q = ap(Mt, scale(e.v, 1.2));
        arrow(plot, [0, 0], q, k === 0 ? P.neg : P.pos, 3.2, 12);
      });
    },
    [P, Mt, mi],
    { aspect: 1.35, maxHeight: 420 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box la-hero">
        <canvas ref={canvasRef} role="img" aria-label={`격자 전체가 행렬 (${A.map((v) => nf(v, 1)).join(', ')})로 변환되는 애니메이션. 노란 점선 위의 파랑, 주황 화살표(고유벡터)는 변환 중에도 같은 직선 위에 머물고, 회색 화살표는 방향이 바뀝니다.`} />
      </div>
      <div className="hero-figure-cap" aria-live="off">
        행렬로 평면을 변환하면 대부분의 화살표(회색)는 방향이 바뀌지만, 고유벡터(파랑, 주황)는 노란 점선 위에서 길이만 {eig.map((e) => `${nf(e.l, 2)}배`).join(', ')}가 됩니다.
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
            행렬은
            <br />
            <em>공간을 움직이는</em>
            <br />
            기계입니다.
          </h1>
          <p className="hero-lede">
            그림의 격자는 행렬 하나로 늘어나고 기울어집니다. 그래도 노란 점선 위의 화살표는 제 직선을 떠나지 않습니다. 이 과목은 벡터와 선형결합에서 출발해 선형변환, 연립방정식과 가우스 소거, 행렬식과 역행렬, 고윳값을 지나 특잇값 분해와 주성분 분석까지 {course.lessons.length}개의 장에서 격자를 직접 끌어 보며 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'eigen')}>
              고유벡터 찾아보기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <GridHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>계산보다 그림 먼저</h3>
          <p>행렬 곱, 행렬식, 고윳값을 공식으로 외우기 전에 격자가 어떻게 변하는지 봅니다. 화살표 끝을 끌면 숫자가 따라 바뀌고, 숫자를 바꾸면 그림이 따라 움직입니다.</p>
        </div>
        <div>
          <h3>기호는 처음 나올 때 풀어서</h3>
          <p>
            새 기호는 처음 쓸 때 뜻을 함께 적었습니다. 고등학교 수학과 <a href={lessonHref('ai-basics', 'vectors')}>기초 인공지능의 벡터와 행렬</a> 정도면 충분합니다. 앞 장의 결과를 쓸 때는 그 장으로 가는 링크를 달았습니다.
          </p>
        </div>
        <div>
          <h3>어디에 쓰이나</h3>
          <p>
            컴퓨터과학과 인공지능 전공의 기초 과목입니다. 가우스 소거는 <a href={lessonHref('ai-basics', 'linear-regression')}>선형 회귀</a>에서, 고유벡터는 <a href={lessonHref('math-probability', 'markov')}>마르코프 체인</a>과 페이지랭크에서, 낮은 계수 근사는 <a href={lessonHref('ai-llm', 'lora')}>LoRA</a>와 추천 시스템에서 다시 만납니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
