import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useInView } from '../../../lib/canvas';
import { lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './lessons/discrete.css';

/* ─────────────── Hero: Euclid's algorithm tiling a rectangle with squares ─────────────── */

const PAIRS: [number, number][] = [
  [89, 55],
  [91, 56],
  [78, 48],
];
const STEP_COLORS = ['var(--c-math-1)', 'var(--c-math-2)', 'var(--c-math-3)'];
const PER_SQUARE = 0.5; // seconds between squares
const HOLD = 2.6; // seconds the finished tiling stays up
const FADE = 0.5;

interface Sq {
  x: number;
  y: number;
  s: number;
  step: number;
}

function tile(a: number, b: number): Sq[] {
  const out: Sq[] = [];
  let [x, y, w, h] = [0, 0, a, b];
  let step = -1;
  let last = -1;
  while (w > 0 && h > 0) {
    const s = Math.min(w, h);
    if (s !== last) step++;
    last = s;
    out.push({ x, y, s, step });
    if (w >= h) {
      x += s;
      w -= s;
    } else {
      y += s;
      h -= s;
    }
  }
  return out;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

function EuclidHero() {
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const runs = useMemo(() => PAIRS.map(([a, b]) => ({ a, b, sq: tile(a, b), g: gcd(a, b) })), []);
  const durs = runs.map((r) => r.sq.length * PER_SQUARE + HOLD + FADE);
  const cycle = durs.reduce((x, y) => x + y, 0);
  const t = useRef(still ? durs[0] + durs[1] - HOLD / 2 - FADE : 0);
  const [, setTick] = useState(0);

  useAnimationFrame((dt) => {
    t.current = (t.current + dt) % cycle;
    setTick((x) => x + 1);
  }, inView && !still);

  let local = t.current;
  let ri = 0;
  while (local >= durs[ri]) local -= durs[ri++];
  const run = runs[ri];
  const shown = Math.min(run.sq.length, Math.floor(local / PER_SQUARE) + 1);
  const finished = local >= run.sq.length * PER_SQUARE;
  const fade = local > durs[ri] - FADE ? Math.max(0, (durs[ri] - local) / FADE) : 1;
  const cur = run.sq[shown - 1];

  const W = 400;
  const H = 260;
  const k = Math.min((W - 8) / run.a, (H - 8) / run.b);
  const ox = (W - run.a * k) / 2;
  const oy = (H - run.b * k) / 2;

  return (
    <div ref={outer}>
      <svg viewBox={`0 0 ${W} ${H}`} className="dm-hero" role="img" aria-label={`유클리드 호제법 애니메이션: ${run.a} × ${run.b} 직사각형을 가장 큰 정사각형부터 차례로 채우고, 마지막 정사각형의 한 변 ${run.g}가 최대공약수가 됩니다.`}>
        <g style={{ opacity: fade }}>
          <rect x={ox} y={oy} width={run.a * k} height={run.b * k} className="frame" />
          {run.sq.slice(0, shown).map((q, i) => {
            const age = (local - i * PER_SQUARE) / PER_SQUARE;
            const grow = still ? 1 : Math.min(1, Math.max(0, age * 2.2));
            const e = 1 - (1 - grow) ** 3;
            const col = STEP_COLORS[q.step % 3];
            const cx = ox + (q.x + q.s / 2) * k;
            const cy = oy + (q.y + q.s / 2) * k;
            const side = q.s * k * (0.6 + 0.4 * e);
            return (
              <g key={i} style={{ opacity: e }}>
                <rect x={cx - side / 2} y={cy - side / 2} width={side} height={side} style={{ fill: `color-mix(in srgb, ${col} ${i === shown - 1 && !finished ? 62 : 30}%, transparent)`, stroke: col }} className="sq" />
                {q.s * k >= 22 && (
                  <text x={cx} y={cy} dy="0.35em" className="lbl" style={{ fontSize: Math.min(22, q.s * k * 0.28) }}>
                    {q.s}
                  </text>
                )}
              </g>
            );
          })}
          {finished && run.g * k >= 6 && (
            <g className="grid">
              {Array.from({ length: run.a / run.g - 1 }, (_, i) => (
                <line key={`v${i}`} x1={ox + (i + 1) * run.g * k} y1={oy} x2={ox + (i + 1) * run.g * k} y2={oy + run.b * k} />
              ))}
              {Array.from({ length: run.b / run.g - 1 }, (_, i) => (
                <line key={`h${i}`} x1={ox} y1={oy + (i + 1) * run.g * k} x2={ox + run.a * k} y2={oy + (i + 1) * run.g * k} />
              ))}
            </g>
          )}
        </g>
      </svg>
      <div className="hero-figure-cap" aria-live="off">
        {finished ? (
          <>
            {run.a} × {run.b} 직사각형을 덮는 가장 큰 정사각형은 한 변이 <strong style={{ color: 'var(--c-math-3)' }}>{run.g}</strong>입니다. 그래서 gcd({run.a}, {run.b}) = {run.g}.
          </>
        ) : (
          <>
            gcd({run.a}, {run.b})를 구하는 중: 한 변 <strong>{cur.s}</strong>인 정사각형을 놓습니다.
          </>
        )}
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
            컴퓨터는
            <br />
            <em>셀 수 있는 것</em>으로
            <br />
            생각합니다.
          </h1>
          <p className="hero-lede">
            그림은 2천 년도 넘은 알고리즘입니다. 직사각형을 가장 큰 정사각형부터 채워 나가면, 마지막 정사각형의 한 변이 두 변의 최대공약수가 됩니다. 이 과목은 명제와 증명, 집합과 함수, 귀납법, 경우의 수, 모듈러 연산까지 {course.lessons.length}개의 장에서 컴퓨터과학이 기대는 수학을 직접 만지며 익힙니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'modular')}>
              유클리드 호제법 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <EuclidHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>증명이 처음이라도</h3>
          <p>기호는 처음 나올 때마다 뜻을 풀어 적고, 증명은 한 줄씩 넘기며 읽습니다. 각 줄이 왜 앞 줄에서 나오는지 옆에 이유를 달았습니다.</p>
        </div>
        <div>
          <h3>먼저 손으로 확인하기</h3>
          <p>진리표를 직접 만들고, 반례를 찾고, 도미노를 넘어뜨리고, 소수 두 개로 암호를 만들어 봅니다. 증명은 그렇게 본 것이 왜 언제나 참인지 설명합니다.</p>
        </div>
        <div>
          <h3>어디에 쓰이나</h3>
          <p>
            컴퓨터과학 전공의 첫 기초 과목입니다. 여기서 배운 귀납법과 세는 법은 <a href="#cs-algorithm-design">알고리즘 설계</a>에서, 비둘기집 원리는 <a href="#cs-computation">계산 이론</a>에서, 모듈러 연산은 <a href="#net-security">네트워크 보안</a>에서 다시 만납니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
