import { useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { rng } from '../../../lib/math';
import { alpha, usePalette } from '../../../lib/theme';
import { lessonHref } from '../../index';
import course from './course';
import { WALL, makeMaze, search, type Grid, type SearchResult } from './lessons/grid';
import '../../../styles/cover.css';

/* ─────────────── Hero: BFS spreading through a maze ─────────────── */

const W = 31;
const H = 21;
const CELLS_PER_SEC = 140;
const HOLD = 1.6; // seconds to show the finished path before the next maze

function newRun(r: () => number): { grid: Grid; res: SearchResult } {
  const start = (H - 2) * W + 1;
  const goal = W + (W - 2);
  const grid: Grid = { w: W, h: H, start, goal, cells: makeMaze(W, H, start, goal, r) };
  return { grid, res: search(grid, 'bfs') };
}

function MazeHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const r = useRef(rng(21));
  const run = useRef(newRun(r.current));
  const t = useRef(still ? 1e9 : 0);
  const [tick, setTick] = useState(0);

  useAnimationFrame((dt) => {
    t.current += dt;
    const { res } = run.current;
    if (t.current * CELLS_PER_SEC > res.order.length + HOLD * CELLS_PER_SEC) {
      run.current = newRun(r.current);
      t.current = 0;
    }
    setTick((k) => k + 1);
  }, inView && !still);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const { grid, res } = run.current;
      const cw = Math.min((w - 8) / W, (h - 8) / H);
      const ox = (w - cw * W) / 2;
      const oy = (h - cw * H) / 2;
      const shown = Math.min(res.order.length, Math.floor(t.current * CELLS_PER_SEC));
      const at = new Int32Array(W * H).fill(-1);
      for (let k = 0; k < shown; k++) at[res.order[k]] = k;
      for (let i = 0; i < W * H; i++) {
        const x = ox + (i % W) * cw;
        const y = oy + Math.floor(i / W) * cw;
        if (grid.cells[i] === WALL) {
          ctx.fillStyle = alpha(P.ink, 0.82);
          ctx.fillRect(x, y, cw + 0.5, cw + 0.5);
        } else if (at[i] >= 0) {
          // the wavefront is brightest; older cells fade toward the paper colour
          const age = (shown - at[i]) / 120;
          ctx.fillStyle = alpha(P.neg, Math.max(0.12, 0.55 - age * 0.4));
          ctx.fillRect(x, y, cw + 0.5, cw + 0.5);
        }
      }
      if (shown >= res.order.length && res.path.length) {
        ctx.strokeStyle = P.pos;
        ctx.lineWidth = Math.max(2.5, cw * 0.36);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        res.path.forEach((p, k) => {
          const px = ox + (p % W) * cw + cw / 2;
          const py = oy + Math.floor(p / W) * cw + cw / 2;
          if (k) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.stroke();
      }
      for (const [cell, col] of [
        [grid.start, P.good],
        [grid.goal, P.bad],
      ] as const) {
        ctx.fillStyle = col;
        ctx.fillRect(ox + (cell % W) * cw, oy + Math.floor(cell / W) * cw, cw, cw);
      }
    },
    [P, tick],
    { aspect: W / H, maxHeight: 430, minHeight: 220 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label="미로 애니메이션: 왼쪽 아래 초록 칸에서 너비 우선 탐색이 물결처럼 퍼져 나가 오른쪽 위 빨간 칸에 닿으면 찾은 길을 주황 선으로 그립니다">
        <canvas ref={canvasRef} />
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
            알고리즘은
            <br />
            <em>정확한 순서로</em>
            <br />
            문제를 풉니다.
          </h1>
          <p className="hero-lede">
            미로에서 출구를 찾는 방법은 여러 가지입니다. 미로 그림은 출발점에서 가까운 칸부터 한 겹씩 넓혀 가는 너비 우선 탐색입니다. 같은 문제라도 어떤 순서로 푸느냐에 따라 1초와 하루가 갈립니다. 입문 개발자가 꼭 알아야 할 복잡도, 정렬, 탐색, 자료구조, 그래프를 {course.lessons.length}개의 장에서 코드와 그림으로 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'graph-search')}>
              미로 길 찾기 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <MazeHero />
          <div className="hero-figure-cap">
            <span className="mono">
              {W}×{H}
            </span>{' '}
            무작위 미로 · 파란 물결이 BFS가 살펴본 칸, 주황 선이 찾은 최단 경로
          </div>
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>코드와 그림을 함께</h3>
          <p>장마다 핵심 알고리즘을 JavaScript 코드로 보여 주고, 같은 알고리즘이 한 단계씩 움직이는 모습을 그림으로 확인합니다.</p>
        </div>
        <div>
          <h3>직접 재 보세요</h3>
          <p>입력 크기를 늘리고, 데이터 모양을 바꾸고, 미로를 그려 보세요. 복잡도가 실제 속도로 어떻게 나타나는지 손으로 확인할 수 있습니다.</p>
        </div>
        <div>
          <h3>실무로 이어집니다</h3>
          <p>
            반복문 안의 <code>includes</code>를 <code>Set</code>으로 바꾸는 일처럼, 배운 내용을 바로 코드에 쓸 수 있는 팁을 함께 담았습니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림과 시간 측정은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
