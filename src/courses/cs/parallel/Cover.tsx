import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { alpha, usePalette } from '../../../lib/theme';
import { courseHref, lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './lessons/parallel.css';

/* ─────────────── Hero: the same job on 1, 2, 4 and 8 cores ─────────────── */

/** One job: a serial setup, CHUNKS equal parallel pieces, a serial merge. Times in units. */
const SETUP = 5;
const MERGE = 5;
const CHUNKS = 15;
const CHUNK = 6;
const SERIAL_ONE = SETUP + MERGE + CHUNKS * CHUNK; // 100 units on one core
const CORES = [1, 2, 4, 8];
const UNITS_PER_SEC = 34;
const HOLD = 1.4; // seconds to rest on a finished run

interface Piece {
  lane: number;
  start: number;
  len: number;
  kind: 'setup' | 'chunk' | 'merge';
}

/** Greedy schedule: each chunk goes to the core that frees up first. */
function schedule(p: number): { pieces: Piece[]; end: number } {
  const pieces: Piece[] = [{ lane: 0, start: 0, len: SETUP, kind: 'setup' }];
  const free = Array(p).fill(SETUP);
  for (let c = 0; c < CHUNKS; c++) {
    let k = 0;
    for (let j = 1; j < p; j++) if (free[j] < free[k]) k = j;
    pieces.push({ lane: k, start: free[k], len: CHUNK, kind: 'chunk' });
    free[k] += CHUNK;
  }
  const join = Math.max(...free);
  pieces.push({ lane: 0, start: join, len: MERGE, kind: 'merge' });
  return { pieces, end: join + MERGE };
}

/** Amdahl's prediction for the same job with no load imbalance. */
const amdahl = (p: number) => {
  const f = (CHUNKS * CHUNK) / SERIAL_ONE;
  return 1 / (1 - f + f / p);
};

function CoresHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const [run, setRun] = useState(still ? 3 : 0);
  const p = CORES[run % CORES.length];
  const plan = useMemo(() => schedule(p), [p]);
  const t = useRef(still ? plan.end : 0);
  const [, setTick] = useState(0);

  useAnimationFrame((dt) => {
    t.current += dt * UNITS_PER_SEC;
    if (t.current > plan.end + HOLD * UNITS_PER_SEC) {
      t.current = 0;
      setRun((r) => r + 1);
    }
    setTick((x) => x + 1);
  }, inView && !still);

  const now = Math.min(t.current, plan.end);
  const done = now >= plan.end;
  const speedup = SERIAL_ONE / plan.end;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const lw = 44;
      const right = 12;
      const top = 26;
      const axisH = 34;
      const laneGap = 5;
      const laneH = Math.min(30, (h - top - axisH - laneGap * 7) / 8);
      const X = (u: number) => lw + (u / SERIAL_ONE) * (w - lw - right);
      const font = (wt: number, px: number, mono = false) => `${wt} ${px}px ${mono ? P.fontMono : P.fontBody}`;

      ctx.textBaseline = 'middle';
      ctx.fillStyle = P.ink3;
      ctx.font = font(600, 11);
      ctx.textAlign = 'left';
      ctx.fillText(`코어 ${p}개`, 0, 10);

      for (let k = 0; k < 8; k++) {
        const y = top + k * (laneH + laneGap);
        const active = k < p;
        ctx.fillStyle = active ? P.surface2 : alpha(P.surface2, 0.35);
        ctx.fillRect(X(0), y, X(SERIAL_ONE) - X(0), laneH);
        ctx.fillStyle = active ? P.ink2 : alpha(P.ink3, 0.5);
        ctx.font = font(600, 10, true);
        ctx.textAlign = 'right';
        ctx.fillText(`#${k + 1}`, lw - 8, y + laneH / 2);
      }

      for (const pc of plan.pieces) {
        const y = top + pc.lane * (laneH + laneGap);
        const filled = Math.max(0, Math.min(pc.len, now - pc.start));
        const x0 = X(pc.start);
        const x1 = X(pc.start + pc.len);
        const serial = pc.kind !== 'chunk';
        const color = serial ? P.ink : P.accent;
        // the outline of work still to do, then the part already done
        ctx.strokeStyle = alpha(color, 0.35);
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 1.5, y + 1.5, x1 - x0 - 3, laneH - 3);
        if (filled > 0) {
          ctx.fillStyle = serial ? alpha(P.ink, 0.78) : alpha(P.accent, 0.85);
          ctx.fillRect(x0 + 1, y + 1, X(pc.start + filled) - x0 - 2, laneH - 2);
        }
      }

      // where the serial parts and the idle tail are
      const lastY = top + 7 * (laneH + laneGap) + laneH;
      if (p > 1) {
        ctx.fillStyle = P.ink3;
        ctx.font = font(500, 10);
        ctx.textAlign = 'left';
        const sx = X(SETUP / 2);
        ctx.fillText('직렬', sx - 9, top - 9);
      }

      // the cursor and the time axis
      const cx = X(now);
      ctx.strokeStyle = done ? P.good : P.hl;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, top - 4);
      ctx.lineTo(cx, lastY + 4);
      ctx.stroke();

      const ay = lastY + 14;
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(0), ay);
      ctx.lineTo(X(SERIAL_ONE), ay);
      ctx.stroke();
      ctx.fillStyle = P.ink3;
      ctx.font = font(400, 10, true);
      for (let u = 0; u <= SERIAL_ONE; u += 25) {
        ctx.textAlign = u === 0 ? 'left' : u === SERIAL_ONE ? 'right' : 'center';
        ctx.fillText(String(u), X(u), ay + 11);
        ctx.fillRect(X(u) - 0.5, ay - 3, 1, 6);
      }
      ctx.textAlign = 'right';
      ctx.font = font(500, 10);
      ctx.fillText('시간 (코어 하나일 때 100)', X(SERIAL_ONE), 10);
    },
    [P, p, plan, now, done],
    { height: 340, minHeight: 40 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`같은 작업을 코어 ${p}개로 나눠 하는 애니메이션. 맨 앞의 준비와 맨 뒤의 합치기는 코어 하나만 하고, 가운데 조각 ${CHUNKS}개를 코어들이 나눠 갖습니다. 코어 ${p}개일 때 ${plan.end}단위가 걸려 코어 하나보다 ${speedup.toFixed(1)}배 빠릅니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="cover-key" aria-hidden="true">
          <span>
            <i style={{ background: 'var(--ink)' }} />
            직렬
          </span>
          <span>
            <i style={{ background: 'var(--accent)' }} />
            병렬 조각
          </span>
        </span>
        코어 {p}개 · {done ? <strong>{speedup.toFixed(2)}배</strong> : '계산 중'} (암달의 법칙으로는 {amdahl(p).toFixed(2)}배)
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
            여덟이 나눠도
            <br />
            <em>여덟 배</em>는
            <br />
            아닙니다.
          </h1>
          <p className="hero-lede">
            오른쪽 그림은 같은 일을 코어 1, 2, 4, 8개로 나눠 합니다. 가운데 조각은 나눠 가질 수 있지만, 맨 앞의 준비와 맨 뒤의 합치기는 한 코어가 혼자 해야 하고, 조각이 고르게 나뉘지 않으면 일찍 끝난 코어는 기다립니다. 코어를 늘리는 병렬 컴퓨팅과 컴퓨터를 늘리는 분산 컴퓨팅은 모두 이 나눌 수 없는 부분, 그리고 서로 기다리고 맞춰야 하는 부분과 싸웁니다. {course.lessons.length}개의 장에서 속도 향상의 한계부터 GPU, 분산 시계, 합의, 일관성까지 직접 움직여 보며 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'consensus')}>
              복제와 합의 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <CoresHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>직접 재고, 직접 끊어 보기</h3>
          <p>첫 장에서는 이 브라우저의 작업자(Web Worker)를 실제로 늘려 가며 속도를 잽니다. 뒤의 장에서는 서버를 끄고, 네트워크를 둘로 가르고, 메시지를 늦춰 가며 분산 시스템이 어떻게 버티는지 봅니다.</p>
        </div>
        <div>
          <h3>모든 실행은 다시 볼 수 있습니다</h3>
          <p>분산 시뮬레이션은 씨앗이 정해진 난수를 써서 같은 설정이면 같은 결과가 나옵니다. 재생하거나 한 단계씩 넘기며, 메시지 하나하나가 무엇을 바꿨는지 따라갈 수 있습니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            스레드와 락은 <a href={courseHref('cs-operating-systems')}>운영체제</a>에서, 재귀와 분할 정복은 <a href={courseHref('cs-algorithm-design')}>알고리즘 설계</a>에서 다룹니다. 여러 서버에 데이터를 나누는 일관된 해싱은 <a href={lessonHref('cs-system-algorithms', 'consistent-hashing')}>시스템 속 알고리즘</a>에 있습니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림과 시뮬레이션은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
