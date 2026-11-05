import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { rng } from '../../../lib/math';
import { alpha, usePalette } from '../../../lib/theme';
import { courseHref, lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './lessons/hci.css';

/* ─────────────── Hero: a simulated pointer obeying Fitts's law ─────────────── */

/** Example constants for the simulated hand, in seconds: MT = A + B · ID. */
const A = 0.12;
const B = 0.16;
const TRIALS = 24;
const PAUSE = 0.35; // seconds resting on a target before the next one appears

interface Trial {
  /** Target centre and width in arena units (the arena is 1 wide, 0.62 high). */
  x: number;
  y: number;
  w: number;
  /** Distance from the previous target, and the resulting index of difficulty. */
  d: number;
  id: number;
  mt: number;
}

function makeTrials(seed: number): Trial[] {
  const r = rng(seed);
  const out: Trial[] = [];
  let px = 0.5, py = 0.31;
  for (let i = 0; i < TRIALS; i++) {
    const w = [0.025, 0.045, 0.08, 0.14][Math.floor(r() * 4)];
    let x = 0, y = 0, d = 0;
    // keep drawing positions until the new target is far enough away to be a real reach
    for (let k = 0; k < 20; k++) {
      x = 0.06 + r() * 0.88;
      y = 0.07 + r() * 0.48;
      d = Math.hypot(x - px, y - py);
      if (d > 0.18) break;
    }
    const id = Math.log2(d / w + 1);
    // a little human noise around the law, so the points scatter about the line
    const mt = A + B * id + (r() - 0.5) * 0.09;
    out.push({ x, y, w, d, id, mt });
    px = x;
    py = y;
  }
  return out;
}

/** Minimum-jerk position profile: slow start, fast middle, slow finish (how hands move). */
const minJerk = (s: number) => s * s * s * (10 - 15 * s + 6 * s * s);

function FittsHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const [seed, setSeed] = useState(5);
  const trials = useMemo(() => makeTrials(seed), [seed]);
  // the clock walks through the trials: each takes mt seconds of movement, then a pause
  const starts = useMemo(() => {
    const s: number[] = [];
    let acc = 0;
    for (const t of trials) {
      s.push(acc);
      acc += t.mt + PAUSE;
    }
    s.push(acc);
    return s;
  }, [trials]);
  const clock = useRef(still ? starts[TRIALS] : 0);
  const [, setTick] = useState(0);

  useAnimationFrame((dt) => {
    clock.current += dt;
    if (clock.current > starts[TRIALS] + 1.5) {
      clock.current = 0;
      setSeed((s) => s + 1);
    }
    setTick((x) => x + 1);
  }, inView && !still);

  const now = Math.min(clock.current, starts[TRIALS] - 1e-6);
  let k = 0;
  while (k < TRIALS - 1 && starts[k + 1] <= now) k++;
  const local = now - starts[k];
  const moving = local < trials[k].mt;
  const doneCount = still ? TRIALS : k + (moving ? 0 : 1);
  const cur = trials[k];
  const prev = k > 0 ? trials[k - 1] : { x: 0.5, y: 0.31 };
  const s = moving ? minJerk(local / cur.mt) : 1;
  const hand = { x: prev.x + (cur.x - prev.x) * s, y: prev.y + (cur.y - prev.y) * s };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const narrow = w < 520;
      // arena on the left (or top), the MT–ID plot on the right (or bottom)
      const aw = narrow ? w : w * 0.58;
      const ah = narrow ? h * 0.55 : h;
      const U = Math.min(aw, ah / 0.62);
      const ax = (aw - U) / 2;
      const ay = (ah - U * 0.62) / 2;
      const X = (u: number) => ax + u * U;
      const Y = (v: number) => ay + v * U;

      ctx.fillStyle = P.surface2;
      ctx.fillRect(X(0), Y(0), U, U * 0.62);

      // the previous target fades, the current one is solid
      if (k > 0) {
        ctx.fillStyle = alpha(P.ink3, 0.25);
        ctx.beginPath();
        ctx.arc(X(prev.x), Y(prev.y), (trials[k - 1].w / 2) * U, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = moving ? P.accent : P.good;
      ctx.beginPath();
      ctx.arc(X(cur.x), Y(cur.y), (cur.w / 2) * U, 0, Math.PI * 2);
      ctx.fill();
      // distance line
      ctx.strokeStyle = alpha(P.ink3, 0.6);
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(prev.x), Y(prev.y));
      ctx.lineTo(X(cur.x), Y(cur.y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.ink2;
      ctx.font = `500 11px ${P.fontMono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`D/W = ${(cur.d / cur.w).toFixed(1)}  ID = ${cur.id.toFixed(2)}비트`, X(0) + 8, Y(0) + 8);

      // the pointer: a small arrow
      const hx = X(hand.x), hy = Y(hand.y);
      ctx.fillStyle = P.ink;
      ctx.strokeStyle = P.surface;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx, hy + 17);
      ctx.lineTo(hx + 4.5, hy + 13);
      ctx.lineTo(hx + 8, hy + 20);
      ctx.lineTo(hx + 10.5, hy + 19);
      ctx.lineTo(hx + 7, hy + 12);
      ctx.lineTo(hx + 12.5, hy + 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // MT vs ID
      const px0 = narrow ? 44 : aw + 46;
      const py0 = narrow ? ah + 18 : 18;
      const pw = (narrow ? w : w - aw) - 46 - 12;
      const ph = (narrow ? h - ah : h) - 18 - 40;
      const idMax = 6, mtMax = 1.2;
      const PX = (id: number) => px0 + (id / idMax) * pw;
      const PY = (mt: number) => py0 + ph - (mt / mtMax) * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      for (let g = 0; g <= 4; g++) {
        const y = py0 + (g / 4) * ph + 0.5;
        ctx.beginPath();
        ctx.moveTo(px0, y);
        ctx.lineTo(px0 + pw, y);
        ctx.stroke();
      }
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      for (let g = 0; g <= 4; g++) ctx.fillText(`${((mtMax * (4 - g)) / 4).toFixed(1)}s`, px0 - 6, py0 + (g / 4) * ph);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let id = 0; id <= idMax; id += 2) ctx.fillText(String(id), PX(id), py0 + ph + 6);
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.fillText('난이도 ID (비트)', px0 + pw / 2, py0 + ph + 20);
      // the law
      ctx.strokeStyle = alpha(P.accent, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PX(0), PY(A));
      ctx.lineTo(PX(idMax), PY(A + B * idMax));
      ctx.stroke();
      for (let i = 0; i < doneCount; i++) {
        const t = trials[i];
        ctx.fillStyle = i === doneCount - 1 && !still ? P.good : P.ink;
        ctx.beginPath();
        ctx.arc(PX(t.id), PY(t.mt), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = P.ink3;
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.fillText('걸린 시간', px0, py0 - 16);
    },
    [P, trials, k, hand.x, hand.y, moving, doneCount, still],
    { height: 340, minHeight: 40 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`가상의 포인터가 크기와 거리가 다른 원형 목표 ${TRIALS}개를 차례로 누릅니다. 오른쪽 그래프에는 목표마다 난이도(ID)와 걸린 시간이 점으로 찍히고, 점들은 직선 MT = ${A} + ${B} × ID 둘레에 모입니다. 지금까지 ${doneCount}개를 눌렀습니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="cover-key" aria-hidden="true">
          <span>
            <i style={{ background: 'var(--accent)', borderRadius: '50%' }} />
            목표
          </span>
          <span>
            <i style={{ background: 'var(--ink)', borderRadius: '50%' }} />
            누른 기록
          </span>
        </span>
        가상의 손 · MT = {A} + {B} × ID 초 (예시 값) · {doneCount}/{TRIALS}
      </div>
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-cs-4)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-cs-4)' }}>
            {course.title} · {course.subtitle}
          </div>
          <h1 className="hero-title">
            버튼 하나에도
            <br />
            <em>법칙</em>이
            <br />
            있습니다.
          </h1>
          <p className="hero-lede">
            오른쪽 그림의 포인터는 작고 먼 목표일수록 오래 걸립니다. 얼마나 오래 걸릴지는 거리와 크기의 비율 하나로 거의 정해지고, 그래서 점들이 한 직선 둘레에 모입니다. 인터페이스를 쓰는 사람에게도 이렇게 잴 수 있는 한계와 습관이 있습니다. {course.lessons.length}개의 장에서 사람을 재고, 그 결과로 설계하고, 설계가 정말 나아졌는지 실험으로 확인합니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'fitts')}>
              피츠의 법칙 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <FittsHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>여러분이 실험 참가자입니다</h3>
          <p>앞의 두 장에서는 여러분의 반응 시간과 클릭을 직접 잽니다. 측정값은 이 페이지 안에서만 쓰고, 저장하거나 어디로 보내지 않습니다. 기기와 화면에 따라 수십 밀리초쯤 차이가 날 수 있습니다.</p>
        </div>
        <div>
          <h3>고장 난 것을 고쳐 봅니다</h3>
          <p>헷갈리는 버튼, 되돌릴 수 없는 삭제, 키보드로는 닿지 않는 메뉴를 직접 써 보고 고친 버전과 비교합니다. 무엇이 왜 불편했는지 숫자로 남깁니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            웹 페이지의 구조와 이벤트는 <a href={courseHref('cs-programming')}>프로그래밍 입문</a>에서, 가설검정과 p값은 <a href={courseHref('stats-basics')}>기초 통계학</a>에서 다룹니다. 마지막 두 장은 통계학을 먼저 보면 더 쉽습니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림과 측정은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
