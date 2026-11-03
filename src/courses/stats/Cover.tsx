import { useEffect, useRef, useState } from 'react';
import { CourseMap } from '../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../lib/canvas';
import { binomialPmf, rng } from '../../lib/math';
import { alpha, usePalette } from '../../lib/theme';
import { lessonHref } from '../index';
import course from './course';
import '../../styles/cover.css';

/* ─────────────── Hero: a Galton board ─────────────── */

const ROWS = 12;
const EXPECTED = binomialPmf(ROWS, 0.5);
const SPEED = 9; // peg rows per second
const SPAWN = 0.06; // seconds between balls
const RESTART_AT = 1600; // empty the bins after this many balls

interface Ball {
  /** Rows passed so far (fractional while moving between pegs). */
  t: number;
  /** Left/right choices: +1 or −1 per row. */
  path: number[];
}

function GaltonBoard() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const sim = useRef<{ balls: Ball[]; counts: number[]; total: number; spawn: number; r: () => number }>({ balls: [], counts: new Array(ROWS + 1).fill(0), total: 0, spawn: 0, r: rng(11) });
  const [tick, setTick] = useState(0);

  const drop = (s = sim.current) => Array.from({ length: ROWS }, () => (s.r() < 0.5 ? -1 : 1));

  // With reduced motion, show a board that has already been filled.
  useEffect(() => {
    if (!still) return;
    const s = sim.current;
    for (let i = 0; i < 700; i++) {
      const k = drop().filter((d) => d > 0).length;
      s.counts[k]++;
      s.total++;
    }
    setTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);

  useAnimationFrame((dt) => {
    const s = sim.current;
    s.spawn += dt;
    while (s.spawn > SPAWN) {
      s.spawn -= SPAWN;
      s.balls.push({ t: -1, path: drop() });
    }
    for (const b of s.balls) b.t += dt * SPEED;
    const landed = s.balls.filter((b) => b.t >= ROWS + 1.2);
    for (const b of landed) {
      s.counts[b.path.filter((d) => d > 0).length]++;
      s.total++;
    }
    if (landed.length) s.balls = s.balls.filter((b) => b.t < ROWS + 1.2);
    if (s.total >= RESTART_AT) {
      s.counts.fill(0);
      s.total = 0;
    }
    setTick((t) => t + 1);
  }, inView && !still);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const s = sim.current;
      const top = 22;
      const binH = h * 0.36;
      const pegBottom = h - binH - 22;
      const dy = (pegBottom - top) / ROWS;
      const dx = Math.min((w - 24) / (ROWS + 1), dy * 1.5);
      const cx = w / 2;
      const yBase = h - 10;
      const pegY = (r: number) => top + r * dy;
      const slotX = (k: number) => cx + (k - ROWS / 2) * dx;

      // funnel
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - dx * 1.4, top - 18);
      ctx.lineTo(cx - dx * 0.35, top - 4);
      ctx.moveTo(cx + dx * 1.4, top - 18);
      ctx.lineTo(cx + dx * 0.35, top - 4);
      ctx.stroke();

      // pegs
      ctx.fillStyle = P.ink3;
      for (let r = 0; r < ROWS; r++) {
        for (let j = 0; j <= r; j++) {
          ctx.beginPath();
          ctx.arc(cx + (j - r / 2) * dx, pegY(r), Math.max(1.6, dx * 0.07), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // bin walls and floor
      ctx.strokeStyle = P.line;
      ctx.beginPath();
      for (let k = 0; k <= ROWS + 1; k++) {
        const x = Math.round(slotX(k - 0.5)) + 0.5;
        ctx.moveTo(x, yBase - binH + 6);
        ctx.lineTo(x, yBase);
      }
      ctx.stroke();
      ctx.strokeStyle = P.lineStrong;
      ctx.beginPath();
      ctx.moveTo(slotX(-0.5), yBase + 0.5);
      ctx.lineTo(slotX(ROWS + 0.5), yBase + 0.5);
      ctx.stroke();

      // bars: share of balls in each bin, scaled so the theoretical peak fills ~88% of the bin height
      const peak = Math.max(...EXPECTED);
      const scale = (binH - 10) / (peak * 1.14);
      const bw = dx * 0.78;
      ctx.fillStyle = alpha(P.stats1, 0.75);
      for (let k = 0; k <= ROWS; k++) {
        const share = s.total ? s.counts[k] / s.total : 0;
        const bh = Math.min(binH - 4, share * scale);
        ctx.fillRect(slotX(k) - bw / 2, yBase - bh, bw, bh);
      }
      // theoretical binomial curve
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let k = 0; k <= ROWS; k++) {
        const x = slotX(k);
        const y = yBase - EXPECTED[k] * scale;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // falling balls
      const br = Math.max(2.5, dx * 0.16);
      ctx.fillStyle = P.pos;
      for (const b of s.balls) {
        if (b.t < 0) {
          // entering through the funnel
          const y = top - 16 + (b.t + 1) * 12;
          ctx.beginPath();
          ctx.arc(cx, y, br, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        const row = Math.min(ROWS, Math.floor(b.t));
        const f = Math.min(1, b.t - row);
        let off = 0;
        for (let i = 0; i < row; i++) off += b.path[i] * 0.5;
        let x: number;
        let y: number;
        if (row < ROWS) {
          // bounce off peg `row`, then slide half a gap left or right with a small hop
          x = cx + (off + b.path[row] * 0.5 * f) * dx;
          y = pegY(row) - br - 1 + f * dy - Math.sin(f * Math.PI) * dy * 0.35;
        } else {
          x = cx + off * dx;
          const k = b.path.filter((d) => d > 0).length;
          const stack = Math.min(binH - 4, (s.total ? s.counts[k] / s.total : 0) * scale);
          y = Math.min(yBase - stack - br, pegY(ROWS) - br + f * (yBase - pegY(ROWS)));
        }
        ctx.beginPath();
        ctx.arc(x, y, br, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`공 ${s.total.toLocaleString('ko-KR')}개`, 10, 8);
    },
    [P, tick],
    { height: 430 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label="갈톤 보드: 위에서 떨어진 공들이 핀에 부딪혀 왼쪽이나 오른쪽으로 튕기고, 아래 칸에 종 모양으로 쌓이는 애니메이션">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-stats-1)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-stats-1)' }}>
            인터랙티브 통계학 입문서
          </div>
          <h1 className="hero-title">
            통계는
            <br />
            <em>흩어짐 속에서</em>
            <br />
            규칙을 찾습니다.
          </h1>
          <p className="hero-lede">
            공 하나가 핀에 부딪혀 왼쪽으로 갈지 오른쪽으로 갈지는 아무도 모릅니다. 그런데 수백 개를 떨어뜨리면 매번 같은 종 모양이 쌓입니다. 하나하나는 우연이어도 모이면 규칙이 된다는 것, 통계학은 이 사실 위에 서 있습니다. 평균과 표준편차에서 시작해 신뢰구간과 p값까지 {course.lessons.length}개의 장을 직접 만지며 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'clt')}>
              중심극한정리 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <GaltonBoard />
          <div className="hero-figure-cap">
            <span className="mono">핀 {ROWS}줄</span> · 공마다 왼쪽·오른쪽 반반 · 점선은 이론적인 이항분포
          </div>
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>숫자보다 그림 먼저</h3>
          <p>평균이 같아도 모양이 다르면 전혀 다른 데이터입니다. 모든 장에서 데이터를 먼저 그려 보고, 그다음에 숫자로 요약합니다.</p>
        </div>
        <div>
          <h3>직접 뽑아 보세요</h3>
          <p>표본을 수백 번 다시 뽑는 실험을 버튼 하나로 할 수 있습니다. 공식이 말하는 내용을 눈으로 먼저 확인하세요.</p>
        </div>
        <div>
          <h3>인공지능과 이어집니다</h3>
          <p>
            정규분포와 베이즈 정리는 인공지능 분야의 <a href={lessonHref('ai', 'probability')}>확률과 분포</a> 장에서 먼저 다룹니다. 두 분야를 오가며 읽어도 좋습니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
