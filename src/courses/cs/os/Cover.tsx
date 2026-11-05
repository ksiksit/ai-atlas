import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { rng } from '../../../lib/math';
import { alpha, usePalette } from '../../../lib/theme';
import { courseHref, lessonHref } from '../../index';
import course from './course';
import { label, rrect, text, token } from './lessons/draw';
import { PROC_CSS, procColor, runProcs, type PState, type ProcFrame, type ProcSpec } from './lessons/procs';
import '../../../styles/cover.css';
import './lessons/os.css';

/* ─────────────── Hero: processes taking turns on one CPU ─────────────── */

const N = 6;
const NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
const QUANTUM = 3;
const TICKS_PER_SEC = 4;
const WINDOW = 36; // ticks visible in the timeline

function workload(seed: number): ProcSpec[] {
  const r = rng(seed);
  return Array.from({ length: N }, (_, i) => {
    const cpuHeavy = i % 3 === 1;
    const n = 4 + Math.floor(r() * 3);
    const bursts: number[] = [];
    for (let k = 0; k < n; k++) {
      bursts.push(cpuHeavy ? 3 + Math.floor(r() * 5) : 1 + Math.floor(r() * 3));
      if (k < n - 1) bursts.push(cpuHeavy ? 2 + Math.floor(r() * 3) : 4 + Math.floor(r() * 7));
    }
    return { name: NAMES[i], arrive: i * 2 + Math.floor(r() * 2), bursts };
  });
}

type Spot = { x: number; y: number; a: number };

/** Where each process's token sits in a frame. */
function spots(f: ProcFrame, w: number, top: number, r: number): (Spot | null)[] {
  const qx = 8 + r;
  const step = 2 * r + 6;
  const cpuX = w * 0.5;
  const ioX0 = w * 0.66 + r + 2;
  const out: (Spot | null)[] = Array(N).fill(null);
  // the queue grows leftward from the CPU: the front of the queue is next to it
  f.ready.forEach((p, j) => (out[p] = { x: Math.max(qx, cpuX - r - 22 - r - j * step), y: top, a: 1 }));
  let wi = 0;
  f.states.forEach((st: PState | null, p) => {
    if (st === 'running') out[p] = { x: cpuX, y: top, a: 1 };
    else if (st === 'new') out[p] = { x: qx, y: top + 2 * r + 8, a: 0.5 };
    else if (st === 'waiting') {
      out[p] = { x: ioX0 + (wi % 3) * step, y: top - r - 3 + Math.floor(wi / 3) * (2 * r + 6), a: 1 };
      wi++;
    } else if (st === 'done') out[p] = { x: w + 2 * r, y: top, a: 0 };
  });
  return out;
}

function SchedulerHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const [seed, setSeed] = useState(7);
  const frames = useMemo(() => runProcs(workload(seed), QUANTUM, true), [seed]);
  const t = useRef(still ? 30 : 0);
  const [, setTick] = useState(0);

  useAnimationFrame((dt) => {
    t.current += dt * TICKS_PER_SEC;
    if (t.current > frames.length + 2) {
      t.current = 0;
      setSeed((s) => s + 1);
    }
    setTick((x) => x + 1);
  }, inView && !still);

  const now = Math.min(t.current, frames.length - 1);
  const k = Math.floor(now);
  const frac = now - k;
  const f = frames[k];
  const nx = frames[Math.min(k + 1, frames.length - 1)];
  const busy = f.busy / (f.t + 1);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const r = Math.max(10, Math.min(15, w / 34));
      const top = 34 + 2 * r;
      const cpuX = w * 0.5;
      // the three places a process can be
      text(ctx, '준비 큐', 8, 12, P.ink3, `600 11px ${P.fontBody}`);
      text(ctx, 'CPU', cpuX, 12, P.ink, `700 11px ${P.fontBody}`, 'center');
      text(ctx, '입출력 대기', w * 0.66, 12, P.ink3, `600 11px ${P.fontBody}`);
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8, top + r + 6);
      ctx.lineTo(cpuX - r - 14, top + r + 6);
      ctx.stroke();
      rrect(ctx, cpuX - r - 9, top - r - 9, 2 * r + 18, 2 * r + 18, 6);
      ctx.fillStyle = f.running >= 0 ? alpha(procColor(P, f.running), 0.14) : P.surface2;
      ctx.fill();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      rrect(ctx, w * 0.66 - 4, top - 2 * r - 10, w * 0.34 - 4, 4 * r + 22, 6);
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // tokens glide from where they were to where they are going
      const e = frac < 0.5 ? 2 * frac * frac : 1 - (-2 * frac + 2) ** 2 / 2;
      const a = spots(f, w, top, r);
      const b = spots(nx, w, top, r);
      for (let p = 0; p < N; p++) {
        const s0 = a[p] ?? b[p];
        const s1 = b[p] ?? a[p];
        if (!s0 || !s1) continue;
        const x = s0.x + (s1.x - s0.x) * e;
        const y = s0.y + (s1.y - s0.y) * e;
        const al = s0.a + (s1.a - s0.a) * e;
        if (al <= 0.02) continue;
        ctx.globalAlpha = al;
        token(ctx, P, x, y, r, procColor(P, p), NAMES[p]);
        ctx.globalAlpha = 1;
      }

      // timeline: one lane per process plus the CPU, scrolling left
      const gy = top + 2 * r + 30;
      const lh = Math.max(9, Math.min(24, (h - gy - 26) / (N + 1) - 4));
      const lw = 30;
      const cw = (w - lw - 6) / WINDOW;
      const t0 = now - WINDOW + 1;
      const X = (tt: number) => lw + (tt - t0) * cw;
      ctx.save();
      ctx.beginPath();
      ctx.rect(lw, gy - 2, w - lw - 6, (N + 1) * (lh + 4) + 4);
      ctx.clip();
      for (let row = 0; row <= N; row++) {
        const y = gy + row * (lh + 4);
        ctx.fillStyle = P.surface2;
        ctx.fillRect(lw, y, w - lw - 6, lh);
      }
      for (let tt = Math.max(0, Math.floor(t0)); tt <= k; tt++) {
        const fr = frames[tt];
        const wdt = tt === k ? cw * frac : cw;
        if (fr.running >= 0) {
          ctx.fillStyle = procColor(P, fr.running);
          ctx.fillRect(X(tt), gy, wdt + 0.5, lh);
        }
        fr.states.forEach((st, p) => {
          const y = gy + (p + 1) * (lh + 4);
          const c = procColor(P, p);
          if (st === 'running') {
            ctx.fillStyle = c;
            ctx.fillRect(X(tt), y, wdt + 0.5, lh);
          } else if (st === 'ready') {
            ctx.fillStyle = alpha(c, 0.25);
            ctx.fillRect(X(tt), y + 3, wdt + 0.5, lh - 6);
          } else if (st === 'waiting') {
            ctx.strokeStyle = alpha(c, 0.8);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(X(tt), y + lh / 2);
            ctx.lineTo(X(tt) + wdt, y + lh / 2);
            ctx.stroke();
          }
        });
      }
      ctx.restore();
      text(ctx, 'CPU', 4, gy + lh / 2, P.ink, `700 10px ${P.fontMono}`);
      for (let p = 0; p < N; p++) text(ctx, NAMES[p], 8, gy + (p + 1) * (lh + 4) + lh / 2, procColor(P, p), `700 10px ${P.fontMono}`);
      const yb = gy + (N + 1) * (lh + 4) + 8;
      label(ctx, P, `t = ${k}`, w - 24, yb, P.ink3, `10px ${P.fontMono}`);
      text(ctx, '← 지난 시간', lw, yb, P.ink3, `10px ${P.fontBody}`);
    },
    [P, f, nx, frac, now, k, frames],
    { height: 360, minHeight: 40 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label="CPU 스케줄러 애니메이션: 프로세스 A부터 F가 준비 큐에 줄을 서 있다가 한 번에 하나씩 CPU를 받아 최대 3틱씩 실행하고, 입출력을 요청하면 대기 상자로 갔다가 돌아옵니다. 아래 시간표는 지난 시간 동안 누가 CPU를 썼는지 보여 줍니다.">
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="cover-key" aria-hidden="true">
          {NAMES.map((nm, p) => (
            <span key={nm}>
              <i style={{ background: PROC_CSS[p] }} />
              {nm}
            </span>
          ))}
        </span>
        라운드 로빈, 타임 슬라이스 {QUANTUM}틱 · 지금까지 CPU 사용률 <strong>{Math.round(busy * 100)}%</strong>
      </div>
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-cs-1)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-cs-1)' }}>
            {course.title} · {course.subtitle}
          </div>
          <h1 className="hero-title">
            CPU 하나를
            <br />
            <em>수백 개가</em>
            <br />
            나눠 씁니다.
          </h1>
          <p className="hero-lede">
            오른쪽 그림에서 프로세스 여섯 개가 CPU 하나를 몇 틱씩 번갈아 씁니다. 디스크나 네트워크를 기다리는 동안에는 CPU를 내놓고, 그 틈을 다른 프로세스가 채웁니다. 이렇게 CPU와 메모리와 디스크를 나눠 주고, 서로를 지키고, 전원이 꺼져도 데이터를 지키는 소프트웨어가 운영체제입니다. {course.lessons.length}개의 장에서 프로세스, 스케줄링, 락, 가상 메모리, 파일 시스템, 보호와 보안을 직접 움직여 보며 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'scheduling')}>
              CPU 스케줄링 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <SchedulerHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>여러분이 스케줄러입니다</h3>
          <p>작업 표의 숫자를 고치고, 두 스레드의 명령어를 실행할 순서를 고르고, 전원이 꺼지는 순간을 정해 보세요. 운영체제가 내리는 결정을 직접 내려 봅니다.</p>
        </div>
        <div>
          <h3>한 틱씩 따라가기</h3>
          <p>모든 시뮬레이션은 재생하거나 한 단계씩 넘길 수 있습니다. 상태가 바뀌는 순간마다 무슨 일이 일어났는지 그림 아래에 문장으로 적어 둡니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            CPU가 명령어를 실행하고 메모리를 읽는 방식은 <a href={courseHref('cs-architecture')}>컴퓨터 구조</a>에서, 큐와 해시 테이블은 <a href={courseHref('cs-algorithms')}>기초 알고리즘</a>에서 다룹니다. 몰라도 읽을 수 있게 필요한 만큼은 다시 설명합니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림과 시뮬레이션은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
