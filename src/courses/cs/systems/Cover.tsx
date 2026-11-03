import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { alpha, lerpColor, rgbStr, usePalette, type Palette } from '../../../lib/theme';
import { lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './cover-ring.css';

/* ─────────────── Hero: a hash ring gaining and losing a cache server ─────────────── */

const KEYS = 96;
const VNODES = 3; // ring positions per server
const BASE = 4; // servers before the new one joins
const SERVER_CSS = ['var(--neg)', 'var(--pos)', 'var(--good)', 'var(--c-stats-2)', 'var(--bad)'];
const serverColor = (P: Palette, s: number) => [P.neg, P.pos, P.good, P.stats2, P.bad][s];

// timeline (seconds): hold with 4 servers, fade keys over to the 5th, hold, fade back
const HOLD_A = 2.2;
const MOVE = 1.1;
const HOLD_B = 2.8;
const CYCLE = HOLD_A + MOVE + HOLD_B + MOVE;

/** FNV-1a followed by MurmurHash3's finaliser, mapped to [0, 1). */
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

interface Ring {
  keys: number[]; // positions on the ring
  vnodes: { pos: number; server: number }[];
  ownerA: number[]; // owner with BASE servers
  ownerB: number[]; // owner with BASE + 1 servers
  movedRing: number;
  movedMod: number;
}

function buildRing(): Ring {
  const keys = Array.from({ length: KEYS }, (_, i) => hash01(`user:${i}`));
  const vnodes = Array.from({ length: BASE + 1 }, (_, s) => Array.from({ length: VNODES }, (_, v) => ({ pos: hash01(`cache-${s + 1}#${v}`), server: s }))).flat();
  const owner = (pos: number, n: number) => {
    const live = vnodes.filter((v) => v.server < n).sort((a, b) => a.pos - b.pos);
    return (live.find((v) => v.pos >= pos) ?? live[0]).server; // first server clockwise, wrapping around
  };
  const ownerA = keys.map((p) => owner(p, BASE));
  const ownerB = keys.map((p) => owner(p, BASE + 1));
  const movedRing = ownerA.filter((o, i) => o !== ownerB[i]).length;
  // the same keys spread with hash % n instead
  const movedMod = keys.filter((_, i) => {
    const h = Math.floor(hash01(`mod:user:${i}`) * 4294967296);
    return h % BASE !== h % (BASE + 1);
  }).length;
  return { keys, vnodes, ownerA, ownerB, movedRing, movedMod };
}

function RingHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const ring = useMemo(buildRing, []);
  const t = useRef(still ? HOLD_A + MOVE + 0.1 : 0);
  const [, setTick] = useState(0);

  useAnimationFrame((dt) => {
    t.current = (t.current + dt) % CYCLE;
    setTick((x) => x + 1);
  }, inView && !still);

  // 0 = four servers, 1 = five servers
  const c = t.current;
  const mix = c < HOLD_A ? 0 : c < HOLD_A + MOVE ? (c - HOLD_A) / MOVE : c < HOLD_A + MOVE + HOLD_B ? 1 : 1 - (c - HOLD_A - MOVE - HOLD_B) / MOVE;
  const joined = mix > 0;
  const ease = mix * mix * (3 - 2 * mix);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) / 2 - 30;
      const at = (pos: number, r: number): [number, number] => [cx + r * Math.sin(pos * 2 * Math.PI), cy - r * Math.cos(pos * 2 * Math.PI)];

      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      // the arcs the new server takes over
      if (joined) {
        const sorted = [...ring.vnodes].sort((a, b) => a.pos - b.pos);
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i].server !== BASE) continue;
          // walk back to the previous live position: the new server owns (prev, pos]
          let j = (i - 1 + sorted.length) % sorted.length;
          while (sorted[j].server === BASE) j = (j - 1 + sorted.length) % sorted.length;
          const a0 = sorted[j].pos * 2 * Math.PI - Math.PI / 2;
          let a1 = sorted[i].pos * 2 * Math.PI - Math.PI / 2;
          if (a1 < a0) a1 += Math.PI * 2;
          ctx.strokeStyle = alpha(serverColor(P, BASE), 0.55 * ease);
          ctx.lineWidth = 9;
          ctx.beginPath();
          ctx.arc(cx, cy, R, a0, a1);
          ctx.stroke();
        }
      }

      // keys, just inside the ring
      ring.keys.forEach((pos, i) => {
        const a = ring.ownerA[i];
        const b = ring.ownerB[i];
        const moved = a !== b;
        const [x, y] = at(pos, R - 16);
        const col = moved ? rgbStr(lerpColor(serverColor(P, a), serverColor(P, b), ease)) : serverColor(P, a);
        ctx.beginPath();
        ctx.arc(x, y, moved ? 4.6 : 3.4, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        if (moved && joined) {
          ctx.strokeStyle = alpha(P.ink, 0.75 * ease);
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      });

      // servers' ring positions, just outside
      for (const v of ring.vnodes) {
        const isNew = v.server === BASE;
        if (isNew && !joined) continue;
        const [x, y] = at(v.pos, R + 11);
        const s = 7;
        ctx.globalAlpha = isNew ? ease : 1;
        ctx.fillStyle = serverColor(P, v.server);
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
        ctx.strokeStyle = P.surface;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - s / 2, y - s / 2, s, s);
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = P.ink2;
      ctx.font = `600 ${Math.round(Math.max(12, R * 0.09))}px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`서버 ${joined ? BASE + 1 : BASE}대`, cx, cy - 10);
      ctx.fillStyle = P.ink3;
      ctx.font = `${Math.round(Math.max(11, R * 0.07))}px ${P.fontMono}`;
      ctx.fillText(`키 ${KEYS}개`, cx, cy + 12);
    },
    [P, ring, ease, joined],
    { aspect: 1.1, maxHeight: 420, minHeight: 260 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`해시 링 애니메이션: 원 위에 키 ${KEYS}개와 캐시 서버 ${BASE}대가 놓여 있고, 키는 시계 방향으로 처음 만나는 서버에 저장됩니다. 서버 한 대가 추가되면 키 ${ring.movedRing}개만 새 서버로 옮겨 갑니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="ring-legend" aria-hidden="true">
          {SERVER_CSS.map((col, s) => (
            <span key={s} style={{ opacity: s < BASE || joined ? 1 : 0.3 }}>
              <i style={{ background: col }} />
              {s + 1}
            </span>
          ))}
        </span>{' '}
        서버 {BASE}대 → {BASE + 1}대: 키 {KEYS}개 중 <strong style={{ color: 'var(--pos)' }}>{ring.movedRing}개</strong>만 이동합니다. 서버 수로 나눈 나머지로 나눴다면 <strong>{ring.movedMod}개</strong>가 옮겨 갔을 것입니다.
      </div>
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-cs-3)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-cs-3)' }}>
            {course.title} · {course.subtitle}
          </div>
          <h1 className="hero-title">
            알고리즘은
            <br />
            <em>시스템 곳곳에</em>
            <br />
            숨어 있습니다.
          </h1>
          <p className="hero-lede">
            원 그림은 캐시 서버를 한 대 늘릴 때 데이터가 어떻게 옮겨 가는지 보여 줍니다. 키와 서버를 같은 원 위에 놓으면 새 서버 바로 앞 구간의 키만 옮기면 됩니다. 이 과목에서는 프로그래밍 언어의 배열, 데이터베이스 인덱스, 캐시, 분산 저장소, Git 안에서 실제로 쓰이는 알고리즘 {course.lessons.length}가지를 그 맞바꿈과 함께 봅니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'consistent-hashing')}>
              일관된 해싱 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <RingHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>실제 시스템의 선택</h3>
          <p>교과서의 알고리즘이 데이터베이스, 캐시 서버, Git 안에서 어떤 모습으로 쓰이고, 왜 그 방법을 골랐는지 봅니다.</p>
        </div>
        <div>
          <h3>맞바꿈을 조절해 보세요</h3>
          <p>메모리를 더 쓰면 빨라지고, 조금 틀려도 되면 훨씬 작아집니다. 그림의 손잡이를 돌리며 그 경계를 직접 확인합니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            해시 테이블, 힙, 동적 계획법, 유니온 파인드를 알고 있다고 가정합니다. 필요하면 <a href="#cs-algorithms">기초 알고리즘</a>과 <a href="#cs-algorithm-design">알고리즘 설계</a>를 먼저 보세요.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
