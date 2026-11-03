import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { alpha, usePalette } from '../../../lib/theme';
import { lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';

/* ─────────────── Hero: packets crossing a small network while one link fails ─────────────── */

// node 0 is host A, node 8 is host B; the rest are routers R1..R7 (x, y in [0, 1])
const NODES: [number, number][] = [
  [0.05, 0.5],
  [0.25, 0.22],
  [0.23, 0.8],
  [0.47, 0.1],
  [0.48, 0.47],
  [0.46, 0.9],
  [0.71, 0.27],
  [0.72, 0.74],
  [0.95, 0.5],
];
const EDGES: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [1, 4], [2, 4], [2, 5], [3, 6], [4, 6], [4, 7], [5, 7], [6, 8], [7, 8], [3, 4],
];
const SRC = 0;
const DST = 8;
const nodeName = (i: number) => (i === SRC ? 'A' : i === DST ? 'B' : `R${i}`);

// timeline within one cycle (seconds)
const FAIL = 3.2; // a link on the route goes down
const CONVERGE = 0.9; // routers take this long to notice and pick a detour
const RESTORE = 7.4; // the link comes back
const CYCLE = 10;
const SPAWN = 0.32; // a packet leaves A this often
const SPEED = 0.34; // world units per second
const FADE = 0.9; // a dropped packet fades over this long

const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const len = (a: number, b: number) => Math.hypot(NODES[a][0] - NODES[b][0], (NODES[a][1] - NODES[b][1]) * 0.6);

/** Dijkstra from SRC to DST over the edges that are up. */
function route(down: string | null): number[] {
  const n = NODES.length;
  const dist = Array(n).fill(Infinity);
  const prev = Array(n).fill(-1);
  const done = Array(n).fill(false);
  dist[SRC] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    for (const [a, b] of EDGES) {
      if (edgeKey(a, b) === down) continue;
      const v = a === u ? b : b === u ? a : -1;
      if (v < 0) continue;
      const d = dist[u] + len(a, b);
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  const path = [DST];
  while (path[0] !== SRC) path.unshift(prev[path[0]]);
  return path;
}

interface Packet {
  path: number[];
  born: number;
  lost: { at: number; x: number; y: number } | null;
}

/** Where a packet is: the edge it is on (index into its path) and the point, or null once delivered. */
function locate(p: Packet, t: number): { seg: number; x: number; y: number } | null {
  let d = (t - p.born) * SPEED;
  for (let i = 0; i < p.path.length - 1; i++) {
    const a = p.path[i];
    const b = p.path[i + 1];
    const l = len(a, b);
    if (d <= l) {
      const f = d / l;
      return { seg: i, x: NODES[a][0] + (NODES[b][0] - NODES[a][0]) * f, y: NODES[a][1] + (NODES[b][1] - NODES[a][1]) * f };
    }
    d -= l;
  }
  return null;
}

function NetHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const best = useMemo(() => route(null), []);
  // each cycle breaks a different link of the usual route (never the hosts' own links)
  const victims = useMemo(() => best.slice(1, -2).map((a, i) => edgeKey(a, best[i + 2])), [best]);
  const sim = useRef({ t: 0, last: -SPAWN, packets: [] as Packet[], delivered: 0, lost: 0 });
  const [, setTick] = useState(0);

  const phaseAt = (t: number) => {
    const cyc = Math.floor(t / CYCLE);
    const ph = t - cyc * CYCLE;
    const victim = victims[cyc % victims.length];
    const down = ph >= FAIL && ph < RESTORE ? victim : null;
    const routed = ph >= FAIL + CONVERGE && ph < RESTORE ? victim : null; // what the routers believe
    return { down, routed, ph };
  };

  useAnimationFrame((dt) => {
    const s = sim.current;
    s.t += dt;
    const { down, routed } = phaseAt(s.t);
    const path = routed ? route(routed) : best;
    while (s.t - s.last >= SPAWN) {
      s.last += SPAWN;
      s.packets.push({ path, born: s.last, lost: null });
    }
    s.packets = s.packets.filter((p) => {
      if (p.lost) return s.t - p.lost.at < FADE;
      const at = locate(p, s.t);
      if (!at) {
        s.delivered++;
        return false;
      }
      if (down && edgeKey(p.path[at.seg], p.path[at.seg + 1]) === down) {
        p.lost = { at: s.t, x: at.x, y: at.y };
        s.lost++;
      }
      return true;
    });
    setTick((x) => x + 1);
  }, inView && !still);

  const s = sim.current;
  const { down, routed } = still ? { down: null, routed: null } : phaseAt(s.t);
  const path = routed ? route(routed) : best;
  const onPath = new Set(path.slice(0, -1).map((a, i) => edgeKey(a, path[i + 1])));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const padX = 26;
      const padY = 26;
      const X = (x: number) => padX + x * (w - 2 * padX);
      const Y = (y: number) => padY + y * (h - 2 * padY);

      // links
      for (const [a, b] of EDGES) {
        const k = edgeKey(a, b);
        const isDown = k === down;
        ctx.strokeStyle = isDown ? P.bad : onPath.has(k) ? alpha(P.neg, 0.85) : P.lineStrong;
        ctx.lineWidth = onPath.has(k) && !isDown ? 3 : 1.5;
        ctx.setLineDash(isDown ? [6, 5] : []);
        ctx.beginPath();
        ctx.moveTo(X(NODES[a][0]), Y(NODES[a][1]));
        ctx.lineTo(X(NODES[b][0]), Y(NODES[b][1]));
        ctx.stroke();
        ctx.setLineDash([]);
        if (isDown) {
          const mx = X((NODES[a][0] + NODES[b][0]) / 2);
          const my = Y((NODES[a][1] + NODES[b][1]) / 2);
          ctx.strokeStyle = P.bad;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(mx - 6, my - 6);
          ctx.lineTo(mx + 6, my + 6);
          ctx.moveTo(mx + 6, my - 6);
          ctx.lineTo(mx - 6, my + 6);
          ctx.stroke();
        }
      }

      // packets
      const list = still ? best.slice(0, -1).flatMap((_, i) => [0.2, 0.6].map((f) => ({ path: best, born: -(sumLen(best, i) + len(best[i], best[i + 1]) * f) / SPEED, lost: null }))) : s.packets;
      const now = still ? 0 : s.t;
      for (const p of list) {
        if (p.lost) {
          const k = (now - p.lost.at) / FADE;
          ctx.globalAlpha = Math.max(0, 1 - k);
          ctx.strokeStyle = P.bad;
          ctx.lineWidth = 2;
          const x = X(p.lost.x);
          const y = Y(p.lost.y);
          const r = 4 + k * 5;
          ctx.beginPath();
          ctx.moveTo(x - r, y - r);
          ctx.lineTo(x + r, y + r);
          ctx.moveTo(x + r, y - r);
          ctx.lineTo(x - r, y + r);
          ctx.stroke();
          ctx.globalAlpha = 1;
          continue;
        }
        const at = locate(p, now);
        if (!at) continue;
        ctx.fillStyle = P.hl;
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1.2;
        ctx.fillRect(X(at.x) - 5, Y(at.y) - 3.5, 10, 7);
        ctx.strokeRect(X(at.x) - 5, Y(at.y) - 3.5, 10, 7);
      }

      // nodes
      NODES.forEach(([nx, ny], i) => {
        const x = X(nx);
        const y = Y(ny);
        const host = i === SRC || i === DST;
        ctx.fillStyle = host ? P.ink : P.surface;
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        if (host) ctx.roundRect(x - 15, y - 12, 30, 24, 4);
        else ctx.arc(x, y, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = host ? P.surface : P.ink2;
        ctx.font = `${host ? 700 : 600} ${host ? 13 : 11}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(nodeName(i), x, y + 1);
      });
    },
    [P, s.t, down, routed, still],
    { aspect: 1.35, maxHeight: 400, minHeight: 250 },
  );

  const status = down ? (routed ? '우회 경로로 보내는 중' : '링크 끊김: 아직 옛 경로로 보내는 중') : '최단 경로로 보내는 중';
  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`네트워크 애니메이션: 호스트 A에서 B로 라우터 7대를 거쳐 패킷이 흐릅니다. 가끔 경로 위의 링크 하나가 끊기면 그 위의 패킷이 사라지고, 라우터들이 우회 경로를 계산하면 다시 전달됩니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <strong style={{ color: down && !routed ? 'var(--bad)' : 'var(--neg)' }}>{status}</strong>: <span className="mono">{path.map(nodeName).join(' → ')}</span>
        {!still && (
          <>
            {' '}
            · 도착 {s.delivered.toLocaleString('ko-KR')}개, 손실 {s.lost.toLocaleString('ko-KR')}개
          </>
        )}
      </div>
    </div>
  );
}

const sumLen = (path: number[], upto: number) => path.slice(0, upto).reduce((acc, a, i) => acc + len(a, path[i + 1]), 0);

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
            패킷은
            <br />
            <em>길을 잃어도</em>
            <br />
            도착합니다.
          </h1>
          <p className="hero-lede">
            그림의 노란 상자는 A에서 B로 가는 패킷입니다. 가끔 링크 하나가 끊기면 그 위의 패킷은 사라지고, 라우터들이 우회 경로를 찾을 때까지 손실이 이어집니다. 그래도 웹 페이지는 빠짐없이 도착합니다. 이 과목에서는 패킷과 주소에서 시작해 TCP, DNS, HTTPS까지, 페이지 하나가 화면에 뜨기까지의 {course.lessons.length}단계를 직접 돌려 봅니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'tcp')}>
              TCP 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <NetHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>아래 계층부터 위로</h3>
          <p>전선 위의 패킷에서 시작해 주소, 신뢰성 있는 전송, 이름 풀이, 웹 요청 순서로 한 층씩 올라갑니다. 각 층은 바로 아래 층이 해 주는 일만 믿고 동작합니다.</p>
        </div>
        <div>
          <h3>잃어버리고 늦게 만들어 보세요</h3>
          <p>그림의 손실률, 왕복 시간, 대역폭을 바꾸면 네트워크가 나빠질 때 각 프로토콜이 어떻게 버티는지, 어디서 시간이 새는지 직접 보입니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            라우팅에서 다익스트라 알고리즘을, DNS에서 캐시를 씁니다. 필요하면 <a href="#cs-algorithms/graph-search">기초 알고리즘의 그래프 탐색</a>을 먼저 보세요. 캐시는 <a href="#cs-system-algorithms/lru-cache">LRU 캐시</a> 장에서 더 깊이 다룹니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
