import { useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { rng } from '../../../lib/math';
import { alpha, usePalette } from '../../../lib/theme';
import { lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';

/* ─────────────── Hero: an 8-bit adder, the carry rippling from right to left ─────────────── */

const NB = 8;
const COL_SEC = 0.32; // seconds per bit column
const HOLD = 1.8; // seconds to show the finished sum
const RUN = (NB + 1) * COL_SEC + HOLD;

interface Pair {
  a: number;
  b: number;
  carries: number[]; // carries[i] = carry into bit i, carries[NB] = carry out
}

function makePair(r: () => number): Pair {
  // bias toward pairs with a few carries so the ripple is visible
  const a = Math.floor(r() * 256);
  const b = Math.floor(r() * 256) | (a & Math.floor(r() * 256));
  const carries = [0];
  for (let i = 0; i < NB; i++) carries.push(((a >> i) & 1) + ((b >> i) & 1) + carries[i] > 1 ? 1 : 0);
  return { a, b, carries };
}

function AdderHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const r = useRef(rng(11));
  const pair = useRef<Pair>({ a: 77, b: 45, carries: [] });
  if (!pair.current.carries.length) {
    const { a, b } = pair.current;
    const c = [0];
    for (let i = 0; i < NB; i++) c.push(((a >> i) & 1) + ((b >> i) & 1) + c[i] > 1 ? 1 : 0);
    pair.current.carries = c;
  }
  const t = useRef(still ? RUN - HOLD / 2 : 0);
  const [tick, setTick] = useState(0);

  useAnimationFrame((dt) => {
    t.current += dt;
    if (t.current > RUN) {
      t.current = 0;
      pair.current = makePair(r.current);
    }
    setTick((k) => k + 1);
  }, inView && !still);

  const { a, b, carries } = pair.current;
  const sum = a + b;
  const done = Math.min(NB + 1, Math.floor(t.current / COL_SEC)); // columns finished (bit 0 first, then the carry-out)
  const finished = done > NB;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const labelW = Math.min(64, w * 0.15);
      const rightW = Math.min(72, w * 0.17);
      const c = Math.min((w - labelW - rightW - 8) / (NB + 1), (h - 40) / 5.2);
      const x0 = labelW + (w - labelW - rightW - c * (NB + 1)) / 2;
      const colX = (i: number) => x0 + (NB - i) * c; // bit i; i = NB is the carry-out column at the far left
      const yC = h / 2 - c * 2.1;
      const yA = h / 2 - c * 1.05;
      const yB = h / 2;
      const yS = h / 2 + c * 1.45;
      const gap = Math.max(2, c * 0.08);

      // the active column
      if (done <= NB) {
        ctx.fillStyle = alpha(P.hl, 0.22);
        ctx.fillRect(colX(done) + gap / 2, yC - c * 0.45, c - gap, yS + c - (yC - c * 0.45));
      }
      const cell = (i: number, y: number, v: number | null, kind: 'in' | 'out') => {
        const x = colX(i) + gap / 2;
        const s = c - gap;
        if (v === null) {
          ctx.strokeStyle = alpha(P.ink3, 0.5);
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
          ctx.setLineDash([]);
          return;
        }
        ctx.fillStyle = v ? (kind === 'out' ? P.pos : alpha(P.ink, 0.86)) : P.surface;
        ctx.fillRect(x, y, s, s);
        ctx.strokeStyle = kind === 'out' ? P.pos : P.lineStrong;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
        ctx.fillStyle = v ? P.surface : P.ink2;
        ctx.font = `600 ${Math.round(c * 0.46)}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(v), x + s / 2, y + s / 2 + 1);
      };
      for (let i = 0; i < NB; i++) {
        cell(i, yA, (a >> i) & 1, 'in');
        cell(i, yB, (b >> i) & 1, 'in');
        cell(i, yS, i < done ? (sum >> i) & 1 : null, 'out');
      }
      cell(NB, yS, done > NB ? carries[NB] : null, 'out');
      // carries: a dot above bit i once bit i − 1 has produced it
      for (let i = 1; i <= NB; i++) {
        if (i > done || !carries[i]) continue;
        const cx = colX(i) + c / 2;
        const fresh = i === done;
        ctx.beginPath();
        ctx.arc(cx, yC + c * 0.3, c * (fresh ? 0.26 : 0.2), 0, Math.PI * 2);
        ctx.fillStyle = P.pos;
        ctx.fill();
        ctx.fillStyle = P.surface;
        ctx.font = `700 ${Math.round(c * 0.28)}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('1', cx, yC + c * 0.3 + 1);
        // a little arrow from the column that made it
        ctx.strokeStyle = alpha(P.pos, 0.8);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(colX(i - 1) + c * 0.5, yA - c * 0.12);
        ctx.quadraticCurveTo(colX(i - 1) + c * 0.2, yC + c * 0.3, cx + c * 0.22, yC + c * 0.3);
        ctx.stroke();
      }
      // rule above the sum
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(colX(NB), yS - c * 0.22);
      ctx.lineTo(colX(0) + c, yS - c * 0.22);
      ctx.stroke();
      // labels
      ctx.font = `${Math.round(Math.max(11, c * 0.36))}px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = P.ink3;
      ctx.fillText('올림', x0 - 6, yC + c * 0.3);
      ctx.fillStyle = P.ink2;
      ctx.fillText('A', x0 + c - 8, yA + c / 2);
      ctx.fillText('+ B', x0 + c - 8, yB + c / 2);
      ctx.textAlign = 'left';
      ctx.font = `600 ${Math.round(Math.max(12, c * 0.42))}px ${P.fontMono}`;
      const xr = colX(0) + c + 10;
      ctx.fillStyle = P.ink2;
      ctx.fillText(String(a), xr, yA + c / 2);
      ctx.fillText(String(b), xr, yB + c / 2);
      ctx.fillStyle = finished ? P.pos : P.ink3;
      ctx.fillText(finished ? String(sum) : '…', xr, yS + c / 2);
    },
    [P, tick, a, b, done],
    { aspect: 1.45, maxHeight: 400, minHeight: 230 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`8비트 덧셈기 애니메이션: ${a} + ${b}를 2진수로 오른쪽 자리부터 더하며 자리올림이 왼쪽으로 번져 갑니다. 결과는 ${sum}입니다.`}>
        <canvas ref={canvasRef} />
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
            0과 1로
            <br />
            <em>계산하는 기계</em>를
            <br />
            직접 쌓아 봅니다.
          </h1>
          <p className="hero-lede">
            그림은 8비트 덧셈기가 두 수를 더하는 모습입니다. 오른쪽 자리부터 한 칸씩 더하며 자리올림이 왼쪽으로 번져 갑니다. 이 과목에서는 비트로 수를 나타내는 법에서 시작해 게이트와 덧셈기, 기억하는 회로, 명령어를 실행하는 CPU, 그리고 속도를 좌우하는 캐시까지 {course.lessons.length}개의 장에서 직접 만들고 돌려 봅니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'cpu')}>
              가상 CPU 돌려 보기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <AdderHero />
          <div className="hero-figure-cap">8비트 리플 캐리 덧셈 · 노란 칸이 지금 더하는 자리, 주황 동그라미가 자리올림</div>
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>아래에서 위로</h3>
          <p>비트, 게이트, 덧셈기, 메모리, CPU 순으로 쌓습니다. 앞 장에서 만든 부품이 다음 장의 재료가 되므로 순서대로 읽으면 좋습니다.</p>
        </div>
        <div>
          <h3>직접 눌러 보세요</h3>
          <p>비트를 켜고 끄고, 게이트의 입력을 바꾸고, 가상 CPU를 한 단계씩 돌려 보세요. 캐시 그림에서는 반복문 순서 하나로 미스가 여덟 배 늘어나는 것을 볼 수 있습니다.</p>
        </div>
        <div>
          <h3>개발자에게 쓸모 있는 이유</h3>
          <p>
            <code>0.1 + 0.2</code>가 0.3이 아닌 이유, 정수가 갑자기 음수가 되는 이유, 같은 코드가 몇 배 느려지는 이유를 하드웨어에서 설명합니다. JavaScript를 조금 알면 충분합니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림과 시간 측정은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
