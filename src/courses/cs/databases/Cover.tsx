import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { rng } from '../../../lib/math';
import { alpha, usePalette, type Palette } from '../../../lib/theme';
import { lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';

/* ─────────────── Hero: rows flowing up a query plan ─────────────── */

const CITIES = ['서울', '부산', '대구', '광주'];
const cityColor = (P: Palette, c: number) => [P.neg, P.pos, P.good, P.stats2][c];
const CUST = [0, 1, 0, 2, 3, 0, 1, 2]; // city of customer id = index + 1
const N_ORD = 24;
const BUCKETS = 4;

// timeline (seconds)
const C_GAP = 0.28;
const C_TRAVEL = 0.55;
const O_START = CUST.length * C_GAP + C_TRAVEL + 0.3;
const O_GAP = 0.22;
const O_UP = 0.7; // scan → join
const O_AGG = 0.55; // join → aggregate
const END = O_START + N_ORD * O_GAP + O_UP + O_AGG;
const HOLD = 2.6;
const CYCLE = END + HOLD;

interface Order {
  cust: number; // customer id (1-based); ids 9 and 10 do not exist
  amount: number;
}

function makeOrders(): Order[] {
  const r = rng(11);
  return Array.from({ length: N_ORD }, () => ({ cust: 1 + Math.floor(r() * 10), amount: (1 + Math.floor(r() * 9)) * 10_000 }));
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function PlanHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const orders = useMemo(makeOrders, []);
  const finals = useMemo(() => {
    const s = [0, 0, 0, 0];
    for (const o of orders) if (o.cust <= CUST.length) s[CUST[o.cust - 1]] += o.amount;
    return s;
  }, [orders]);
  const matched = orders.filter((o) => o.cust <= CUST.length).length;
  const t = useRef(still ? END + 0.1 : 0);
  const [tick, setTick] = useState(0);

  useAnimationFrame((dt) => {
    t.current = (t.current + dt) % CYCLE;
    setTick((k) => k + 1);
  }, inView && !still);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const now = t.current;
      const fade = now > END + HOLD - 0.6 ? Math.max(0, (END + HOLD - now) / 0.6) : 1;
      const nodeW = Math.min(168, w * 0.42);
      const nodeH = 32;
      const N = {
        agg: { x: w * 0.5, y: h * 0.4 },
        join: { x: w * 0.5, y: h * 0.58 },
        hash: { x: w * 0.25, y: h * 0.75 },
        cs: { x: w * 0.25, y: h * 0.92 },
        os: { x: w * 0.74, y: h * 0.92 },
      };
      const hashH = 46;

      // counts so far
      const cIn = Math.min(CUST.length, Math.max(0, Math.floor((now - C_TRAVEL) / C_GAP) + 1));
      const oOut = Math.min(N_ORD, Math.max(0, Math.floor((now - O_START) / O_GAP) + 1));
      let joined = 0;
      const sums = [0, 0, 0, 0];
      orders.forEach((o, i) => {
        const e = O_START + i * O_GAP;
        if (o.cust > CUST.length) return;
        if (now >= e + O_UP) joined++;
        if (now >= e + O_UP + O_AGG) sums[CUST[o.cust - 1]] += o.amount;
      });

      // edges
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1.5;
      const edge = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      };
      edge(N.cs, N.hash);
      edge(N.hash, N.join);
      edge(N.os, N.join);
      edge(N.join, N.agg);
      edge(N.agg, { x: N.agg.x, y: 108 });

      const box = (c: { x: number; y: number }, label: string, sub: string, hh = nodeH, hot = false) => {
        const x = c.x - nodeW / 2;
        const y = c.y - hh / 2;
        ctx.fillStyle = P.surface;
        ctx.fillRect(x, y, nodeW, hh);
        ctx.strokeStyle = hot ? P.ink : P.ink2;
        ctx.lineWidth = hot ? 2 : 1.2;
        ctx.strokeRect(x + 0.5, y + 0.5, nodeW - 1, hh - 1);
        ctx.fillStyle = P.ink;
        ctx.font = `600 ${w < 420 ? 11 : 12}px ${P.fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + 8, y + 16);
        ctx.fillStyle = P.ink3;
        ctx.font = `${w < 420 ? 10 : 11}px ${P.fontMono}`;
        ctx.textAlign = 'right';
        ctx.fillText(sub, x + nodeW - 7, y + 16);
      };
      box(N.cs, 'Seq Scan', `customers ${cIn}`, nodeH, now < O_START);
      box(N.os, 'Seq Scan', `orders ${oOut}`, nodeH, now >= O_START && now < END);
      box(N.hash, 'Hash', `${cIn}행`, hashH);
      box(N.join, 'Hash Join', `${joined}행`, nodeH, now >= O_START && now < END);
      box(N.agg, 'HashAggregate', 'city', nodeH, now >= O_START + O_UP + O_AGG && now < END);

      // the hash table's buckets inside the Hash node
      const bx0 = N.hash.x - nodeW / 2 + 8;
      const bw = (nodeW - 16) / BUCKETS;
      const by = N.hash.y + 4;
      for (let b = 0; b < BUCKETS; b++) {
        ctx.strokeStyle = P.line;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx0 + b * bw + 1.5, by + 0.5, bw - 3, 14);
      }
      const inBucket = [0, 0, 0, 0];
      CUST.forEach((city, i) => {
        if (now < i * C_GAP + C_TRAVEL) return;
        const b = (i + 1) % BUCKETS;
        const k = inBucket[b]++;
        ctx.fillStyle = cityColor(P, city);
        ctx.beginPath();
        ctx.arc(bx0 + b * bw + 7 + k * 8, by + 7.5, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = fade;
      // customers flying into the hash table
      CUST.forEach((city, i) => {
        const p = (now - i * C_GAP) / C_TRAVEL;
        if (p < 0 || p >= 1) return;
        const e = ease(p);
        const x = N.cs.x + (N.hash.x - N.cs.x) * e;
        const y = N.cs.y - nodeH / 2 + (N.hash.y + hashH / 2 - (N.cs.y - nodeH / 2)) * e;
        ctx.fillStyle = cityColor(P, city);
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
      });
      // orders: up to the join (grey), probe, then on to the aggregate in their customer's colour
      orders.forEach((o, i) => {
        const e0 = O_START + i * O_GAP;
        const a = now - e0;
        if (a < 0) return;
        const ok = o.cust <= CUST.length;
        const col = ok ? cityColor(P, CUST[o.cust - 1]) : P.ink3;
        if (a < O_UP) {
          const e = ease(a / O_UP);
          const x = N.os.x + (N.join.x + nodeW * 0.18 - N.os.x) * e;
          const y = N.os.y - nodeH / 2 + (N.join.y + nodeH / 2 - (N.os.y - nodeH / 2)) * e;
          ctx.fillStyle = alpha(P.ink2, 0.85);
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
          return;
        }
        const b = a - O_UP;
        if (b < 0.25) {
          // probe: a flash from the join to the bucket it hashes to
          const bucket = o.cust % BUCKETS;
          ctx.strokeStyle = alpha(ok ? col : P.bad, 0.8 * (1 - b / 0.25));
          ctx.lineWidth = 1.6;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(N.join.x - nodeW * 0.2, N.join.y + nodeH / 2);
          ctx.lineTo(bx0 + bucket * bw + bw / 2, by);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (!ok) {
          if (b < 0.4) {
            const x = N.join.x + nodeW * 0.18;
            const y = N.join.y + nodeH / 2 + 7;
            ctx.strokeStyle = alpha(P.bad, 1 - b / 0.4);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - 4, y - 4);
            ctx.lineTo(x + 4, y + 4);
            ctx.moveTo(x + 4, y - 4);
            ctx.lineTo(x - 4, y + 4);
            ctx.stroke();
          }
          return;
        }
        if (b < O_AGG) {
          const e = ease(b / O_AGG);
          const x = N.join.x;
          const y = N.join.y - nodeH / 2 + (N.agg.y + nodeH / 2 - (N.join.y - nodeH / 2)) * e;
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;

      // result: SUM(amount) per city as bars
      const max = Math.max(...finals);
      const lx = Math.max(10, w * 0.5 - nodeW * 0.9);
      const barX = lx + 36;
      const barW = Math.min(w - barX - 70, nodeW * 1.4);
      CITIES.forEach((c, k) => {
        const y = 14 + k * 23;
        const v = sums[k] * fade;
        ctx.fillStyle = P.ink2;
        ctx.font = `12px ${P.fontBody}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(c, lx, y + 7);
        ctx.fillStyle = alpha(P.ink, P.dark ? 0.08 : 0.05);
        ctx.fillRect(barX, y, barW, 14);
        ctx.fillStyle = cityColor(P, k);
        ctx.fillRect(barX, y, (barW * v) / max, 14);
        ctx.fillStyle = P.ink3;
        ctx.font = `11px ${P.fontMono}`;
        ctx.fillText(`${Math.round(v / 10_000)}만`, barX + barW + 6, y + 7);
      });
    },
    [P, tick, orders, finals],
    { aspect: 1.15, maxHeight: 440, minHeight: 330 },
  );

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`실행 계획 애니메이션: 고객 ${CUST.length}명을 해시 테이블에 넣고, 주문 ${N_ORD}건을 하나씩 흘려 보내 고객 번호로 짝을 찾은 뒤(${matched}건 일치), 도시별 주문 금액 합계 막대를 키웁니다.`}>
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
            표에 담고,
            <br />
            <em>질문으로 꺼내고,</em>
            <br />
            함께 고칩니다.
          </h1>
          <p className="hero-lede">
            그림은 "도시별 주문 금액 합계"를 묻는 SQL 한 줄의 실행 계획입니다. 데이터베이스는 고객 표로 해시 테이블을 만들고, 주문을 하나씩 흘려보내 짝을 찾은 뒤 도시별로 더합니다. 표를 어떻게 나누고, 어떤 순서로 잇고, 여러 사람이 동시에 고쳐도 어떻게 망가지지 않는지를 {course.lessons.length}개의 장에서 직접 쿼리를 돌려 보며 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'transactions')}>
              트랜잭션 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <PlanHero />
          <div className="hero-figure-cap">
            <span className="mono">SELECT c.city, SUM(o.amount) … JOIN … GROUP BY c.city</span> · 점 하나가 행 하나, 색은 고객의 도시입니다
          </div>
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>작은 표에 직접 실행</h3>
          <p>그림 속 쿼리는 브라우저 안의 작은 데이터베이스가 실제로 계산합니다. 절을 고치면 결과가 바뀌고, 실행 단계를 하나씩 넘겨 볼 수 있습니다.</p>
        </div>
        <div>
          <h3>순서를 바꿔 망가뜨려 보세요</h3>
          <p>조인 순서, 인덱스 열의 순서, 두 트랜잭션이 끼어드는 순서를 바꾸고, 아무 때나 전원을 꺼 보세요. 무엇이 틀어지고 무엇이 그것을 막는지 보입니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            해시 테이블과 정렬을 알고 있다고 가정합니다. 필요하면 <a href="#cs-algorithms">기초 알고리즘</a>을 먼저 보세요. 인덱스의 속을 보려면 <a href={lessonHref('cs-system-algorithms', 'b-tree')}>B-트리</a>가 도움이 됩니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림과 쿼리는 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
