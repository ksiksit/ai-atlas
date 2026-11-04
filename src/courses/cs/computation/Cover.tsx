import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../lib/theme';
import { lessonHref } from '../../index';
import course from './course';
import { TM_PRESETS, runTm } from './lessons/machines';
import '../../../styles/cover.css';

/* ─────────────── Hero: the 4-state busy beaver, drawn as a space-time diagram ─────────────── */

const STEPS_PER_SEC = 15;
const HOLD = 2.6; // seconds on the finished picture before starting over
const STATES = ['A', 'B', 'C', 'D'];
const STATE_CSS = ['var(--neg)', 'var(--pos)', 'var(--good)', 'var(--c-stats-2)'];
const stateColor = (P: Palette, q: string) => [P.neg, P.pos, P.good, P.stats2][STATES.indexOf(q)] ?? P.ink;

function BeaverHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const run = useMemo(() => runTm(TM_PRESETS[3].tm, ''), []);
  const total = run.frames.length - 1; // 107 moves
  const t = useRef(still ? 1e9 : 0);
  const [, setTick] = useState(0);

  useAnimationFrame((dt) => {
    t.current += dt;
    if (t.current > total / STEPS_PER_SEC + HOLD) t.current = 0;
    setTick((x) => x + 1);
  }, inView && !still);

  const step = Math.min(total, Math.floor(t.current * STEPS_PER_SEC));
  const f = run.frames[step];
  const ones = [...f.tape.values()].filter((c) => c === '1').length;
  const lo = run.lo - 1;
  const hi = run.hi + 1;
  const cols = hi - lo + 1;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cw = Math.min(30, Math.floor((w - 8) / cols));
      const ox = Math.round((w - cw * cols) / 2);
      const stripY = 30;
      // the live tape
      for (let c = 0; c < cols; c++) {
        const i = lo + c;
        const x = ox + c * cw;
        const on = f.tape.get(i) === '1';
        const head = i === f.head;
        ctx.fillStyle = head ? alpha(P.hl, 0.45) : P.surface;
        ctx.fillRect(x, stripY, cw, cw);
        ctx.strokeStyle = head ? P.ink : P.lineStrong;
        ctx.lineWidth = head ? 2 : 1;
        ctx.strokeRect(x + 0.5, stripY + 0.5, cw - 1, cw - 1);
        ctx.fillStyle = on ? P.ink : P.ink3;
        ctx.font = `${on ? 700 : 400} ${Math.round(cw * 0.5)}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(on ? '1' : '0', x + cw / 2, stripY + cw / 2 + 1);
      }
      // the head, coloured by its state
      const hx = ox + (f.head - lo) * cw + cw / 2;
      const col = stateColor(P, f.state);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(hx - 7, stripY - 16);
      ctx.lineTo(hx + 7, stripY - 16);
      ctx.lineTo(hx, stripY - 4);
      ctx.closePath();
      ctx.fill();
      ctx.font = `700 13px ${P.fontMono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.state === 'H' ? '정지' : f.state, hx + 10, stripY - 11);

      // history: one row per step, time flowing down
      const top = stripY + cw + 16;
      const rowH = (h - top - 6) / (total + 1);
      const bottom = h - 6;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c <= cols; c++) {
        ctx.moveTo(ox + c * cw + 0.5, top);
        ctx.lineTo(ox + c * cw + 0.5, bottom);
      }
      ctx.stroke();
      // cells holding a 1: one bar per unbroken stretch of time
      ctx.fillStyle = alpha(P.ink, 0.14);
      for (let c = 0; c < cols; c++) {
        let from = -1;
        for (let s = 0; s <= step + 1; s++) {
          const one = s <= step && run.frames[s].tape.get(lo + c) === '1';
          if (one && from < 0) from = s;
          if (!one && from >= 0) {
            ctx.fillRect(ox + c * cw + 2, top + from * rowH, cw - 4, (s - from) * rowH);
            from = -1;
          }
        }
      }
      // the head's path, each move coloured by the state it was in
      const hxAt = (s: number) => ox + (run.frames[s].head - lo) * cw + cw / 2;
      const hyAt = (s: number) => top + s * rowH + rowH / 2;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (let s = 0; s < step; s++) {
        ctx.strokeStyle = stateColor(P, run.frames[s].state);
        ctx.beginPath();
        ctx.moveTo(hxAt(s), hyAt(s));
        ctx.lineTo(hxAt(s + 1), hyAt(s + 1));
        ctx.stroke();
      }
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(hxAt(step), hyAt(step), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + 0.5, top - 4.5, cw * cols - 1, bottom - top + 4);
    },
    [P, f, step],
    { aspect: 1.05, maxHeight: 460, minHeight: 300 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`상태 4개짜리 바쁜 비버 튜링 기계 애니메이션. 위쪽은 지금의 테이프와 머리, 아래쪽은 단계마다의 테이프를 한 줄씩 쌓은 그림입니다. 빈 테이프에서 출발해 107번 움직이고 1을 13개 남긴 채 멈춥니다. 지금 ${step}단계, 1이 ${ones}개.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span aria-hidden="true" style={{ display: 'inline-flex', gap: 8, marginRight: 6 }}>
          {STATES.map((q, i) => (
            <span key={q} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <i style={{ width: 9, height: 9, background: STATE_CSS[i], display: 'inline-block' }} />
              <span className="mono">{q}</span>
            </span>
          ))}
        </span>
        상태 4개짜리 바쁜 비버 · 단계 <span className="mono">{step}</span> / {total} · 1의 개수 <strong className="mono">{ones}</strong>
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
            컴퓨터에게도
            <br />
            <em>풀 수 없는 문제</em>가
            <br />
            있습니다.
          </h1>
          <p className="hero-lede">
            그림은 상태 네 개와 규칙 여덟 줄로 된 튜링 기계가 빈 테이프 위를 오가는 모습입니다. 아래로 내려갈수록 시간이 흐르고, 기계는 107번 움직인 뒤 스스로 멈춥니다. 이렇게 단순한 기계가 지금의 어떤 컴퓨터가 하는 계산이든 할 수 있지만, 기계가 멈출지 미리 알아맞히는 일만은 어떤 컴퓨터도 할 수 없습니다. 이 과목에서는 유한 오토마타에서 출발해 {course.lessons.length}개의 장에 걸쳐 기계에 기억을 조금씩 더해 가며, 계산이 할 수 있는 일과 그 경계를 직접 확인합니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'turing-machines')}>
              튜링 기계 돌려 보기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <BeaverHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>기계를 직접 돌립니다</h3>
          <p>상태 다이어그램에 문자열을 넣고, 정규 표현식을 NFA로 바꾸고, 튜링 기계의 테이프를 한 칸씩 움직이며 기계가 무엇을 기억하는지 봅니다.</p>
        </div>
        <div>
          <h3>한계를 증명합니다</h3>
          <p>"이 기계로는 안 된다"를 반례 하나로 보이는 비둘기집 원리와 대각선 논법을 따라가 보고, 확인은 쉬운데 찾기는 어려운 문제를 직접 풀어 봅니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            재귀, 스택, 복잡도를 알고 있다고 가정합니다. 필요하면 <a href="#cs-algorithms">기초 알고리즘</a>과 <a href="#cs-algorithm-design">알고리즘 설계</a>를 먼저 보세요.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
