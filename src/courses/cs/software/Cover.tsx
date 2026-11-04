import { useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { drawArrow } from '../../../lib/plot';
import { alpha, usePalette } from '../../../lib/theme';
import { lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';

/* ─────────────── Hero: a tangled module graph straightened out while the tests stay green ─────────────── */

interface HNode {
  id: string;
  tangled: [number, number]; // position in [0,1]², before
  clean: [number, number]; // after
  step: number; // the refactoring step (1..STEPS) that moves it into place
  fresh?: boolean; // only exists after the refactoring
}

const HNODES: HNode[] = [
  { id: 'ui', step: 1, tangled: [0.6, 0.8], clean: [0.5, 0.08] },
  { id: 'cart', step: 2, tangled: [0.18, 0.2], clean: [0.27, 0.34] },
  { id: 'checkout', step: 3, tangled: [0.84, 0.58], clean: [0.73, 0.34] },
  { id: 'pricing', step: 2, tangled: [0.54, 0.12], clean: [0.12, 0.6] },
  { id: 'inventory', step: 3, tangled: [0.14, 0.66], clean: [0.5, 0.6] },
  { id: 'payment', step: 4, tangled: [0.38, 0.44], clean: [0.88, 0.6] },
  { id: 'db', step: 1, tangled: [0.86, 0.18], clean: [0.17, 0.86] },
  { id: 'events', step: 3, tangled: [0.5, 0.5], clean: [0.5, 0.86], fresh: true },
  { id: 'http', step: 4, tangled: [0.36, 0.92], clean: [0.83, 0.86] },
];
type E = [string, string];
const COMMON: E[] = [
  ['ui', 'cart'],
  ['ui', 'checkout'],
  ['checkout', 'cart'],
  ['checkout', 'payment'],
  ['checkout', 'inventory'],
  ['cart', 'pricing'],
  ['cart', 'db'],
  ['inventory', 'db'],
  ['payment', 'http'],
];
/** edges removed by the refactoring, with the step that removes each */
const BEFORE: [string, string, number][] = [
  ['ui', 'db', 1], // skips a layer
  ['pricing', 'cart', 2], // cycle
  ['inventory', 'checkout', 3], // cycle
];
const AFTER: E[] = [
  ['inventory', 'events'],
  ['checkout', 'events'],
];
/** cycle edges and the step that breaks them */
const CYCLE: Record<string, number> = { 'pricing>cart': 2, 'cart>pricing': 2, 'inventory>checkout': 3, 'checkout>inventory': 3 };
const TESTS = 24;
const STEPS = 4;

// timeline (seconds)
const HOLD_A = 1.8;
const MOVE = 3.2;
const HOLD_B = 2.8;
const BACK = 1.2;
const LOOP = HOLD_A + MOVE + HOLD_B + BACK;

function GraphHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const t = useRef(still ? HOLD_A + MOVE + 0.5 : 0);
  const [, setTick] = useState(0);

  useAnimationFrame((dt) => {
    t.current = (t.current + dt) % LOOP;
    setTick((x) => x + 1);
  }, inView && !still);

  const c = t.current;
  const back = c >= HOLD_A + MOVE + HOLD_B;
  const raw = c < HOLD_A ? 0 : c < HOLD_A + MOVE ? (c - HOLD_A) / MOVE : !back ? 1 : 1 - (c - HOLD_A - MOVE - HOLD_B) / BACK;
  // forward: one refactoring step at a time, each easing a few modules into place; back: everything together
  const stepF = raw * STEPS;
  const k = Math.min(STEPS, Math.floor(stepF));
  const frac = stepF - k;
  const ease = (x: number) => x * x * (3 - 2 * x);
  const done = (st: number) => (back ? raw : ease(Math.max(0, Math.min(1, stepF - (st - 1)))));
  const step = k;
  // a test sweep runs across the bar after every step while moving forward
  const forward = c >= HOLD_A && c < HOLD_A + MOVE;
  const sweep = forward ? Math.floor(frac * TESTS * 1.4) : -1;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const barH = 40;
      const gh = h - barH - 8;
      const bw = Math.min(92, w * 0.18);
      const bh = 26;
      const pos = (n: HNode): [number, number] => {
        const m = done(n.step);
        const x = n.tangled[0] + (n.clean[0] - n.tangled[0]) * m;
        const y = n.tangled[1] + (n.clean[1] - n.tangled[1]) * m;
        return [bw / 2 + 6 + x * (w - bw - 12), bh / 2 + 6 + y * (gh - bh - 12)];
      };
      const at = new Map(HNODES.map((n) => [n.id, pos(n)]));
      const edge = (e: E, col: string, width: number, dash?: number[]) => {
        const [x1, y1] = at.get(e[0])!;
        const [x2, y2] = at.get(e[1])!;
        // clip both ends to the boxes
        const dx = x2 - x1;
        const dy = y2 - y1;
        const sx = Math.abs(dx) > 1e-6 ? bw / 2 / Math.abs(dx) : Infinity;
        const sy = Math.abs(dy) > 1e-6 ? bh / 2 / Math.abs(dy) : Infinity;
        const s = Math.min(sx, sy);
        if (s >= 0.5) return;
        ctx.setLineDash(dash ?? []);
        drawArrow(ctx, x1 + dx * s, y1 + dy * s, x2 - dx * (s + 0.02), y2 - dy * (s + 0.02), col, width, 8);
        ctx.setLineDash([]);
      };
      for (const e of COMMON) edge(e, alpha(P.ink2, 0.75), 1.4);
      for (const [a, b, st] of BEFORE) {
        ctx.globalAlpha = 1 - done(st);
        edge([a, b], CYCLE[`${a}>${b}`] ? P.bad : P.ink3, 1.8, [6, 4]);
      }
      for (const e of COMMON) {
        const st = CYCLE[`${e[0]}>${e[1]}`];
        if (!st) continue;
        ctx.globalAlpha = 1 - done(st);
        edge(e, P.bad, 1.8);
      }
      ctx.globalAlpha = done(3);
      for (const e of AFTER) edge(e, P.good, 1.8);
      ctx.globalAlpha = 1;

      for (const n of HNODES) {
        const [x, y] = at.get(n.id)!;
        ctx.globalAlpha = n.fresh ? done(n.step) : 1;
        ctx.fillStyle = P.surface;
        ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh);
        ctx.strokeStyle = n.fresh ? P.good : P.ink2;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(x - bw / 2 + 0.5, y - bh / 2 + 0.5, bw - 1, bh - 1);
        ctx.fillStyle = P.ink;
        ctx.font = `${bw < 80 ? 11 : 12}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.id, x, y + 1);
        ctx.globalAlpha = 1;
      }

      // the test bar: every square stays green; a sweep shows them being re-run after each step
      const y0 = h - barH + 6;
      const gap = 3;
      const sq = Math.min(16, (w - 12 - gap * (TESTS - 1)) / TESTS);
      const x0 = (w - (sq * TESTS + gap * (TESTS - 1))) / 2;
      for (let i = 0; i < TESTS; i++) {
        const ran = sweep < 0 || i <= sweep;
        ctx.fillStyle = ran ? P.good : alpha(P.good, 0.35);
        ctx.fillRect(x0 + i * (sq + gap), y0, sq, sq);
        if (i === sweep) {
          ctx.strokeStyle = P.ink;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x0 + i * (sq + gap) - 1, y0 - 1, sq + 2, sq + 2);
        }
      }
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`테스트 ${TESTS}개`, w / 2, y0 + sq + 4);
    },
    [P, c, sweep],
    { aspect: 1.25, maxHeight: 440, minHeight: 300 },
  );

  const cycles = (done(2) < 0.5 ? 1 : 0) + (done(3) < 0.5 ? 1 : 0);
  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label="모듈 아홉 개의 의존 관계 그래프 애니메이션. 처음에는 위치가 뒤엉켜 있고 빨간 순환 의존이 두 개 있습니다. 리팩터링 네 단계를 거치며 모듈이 층층이 정리되고 순환이 사라지는 동안, 아래의 테스트 24개는 계속 초록으로 통과합니다.">
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        리팩터링 <strong>{step}</strong>/{STEPS}단계 · 순환 의존 <strong style={{ color: cycles ? 'var(--bad)' : 'var(--good)' }}>{cycles}개</strong> · 테스트{' '}
        <strong style={{ color: 'var(--good)' }}>
          {TESTS}/{TESTS} 통과
        </strong>
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
            코드는 짜는 시간보다
            <br />
            <em>고치는 시간</em>이
            <br />
            훨씬 깁니다.
          </h1>
          <p className="hero-lede">
            그림은 뒤엉킨 모듈의 의존 관계를 작은 단계로 정리하는 동안 테스트가 줄곧 초록으로 남는 모습입니다. 이 과목에서는 명세와 테스트, 타입으로 코드를 맞게 만들고, 모듈과 리팩터링으로 바꾸기 쉽게 만들고, 버전 관리와 코드 리뷰로 여럿이 함께 만드는 법을 {course.lessons.length}개의 장에 걸쳐 배웁니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'modules')}>
              모듈과 추상화 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <GraphHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>고쳐 보며 배우기</h3>
          <p>그림 속 코드를 바꾸고, 테스트를 돌리고, 버그 있는 구현과 올바른 구현을 나란히 실행해 봅니다. 무엇이 깨지는지 직접 보는 것이 가장 빠릅니다.</p>
        </div>
        <div>
          <h3>작은 코드, 큰 원칙</h3>
          <p>예제는 수십 줄이지만, 명세와 정보 은닉, 3방향 병합은 수십만 줄짜리 프로젝트에서도 똑같이 쓰입니다. 실제 도구와 사례를 함께 소개합니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            함수, 배열과 객체, 간단한 테스트를 JavaScript로 짤 수 있으면 충분합니다. 필요하면 <a href="#cs-programming">프로그래밍 입문</a>을 먼저 보세요.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림과 코드 실행은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
