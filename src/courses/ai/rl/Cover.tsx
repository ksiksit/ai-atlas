import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { rng } from '../../../lib/math';
import { alpha, usePalette } from '../../../lib/theme';
import { courseHref, lessonHref } from '../../index';
import course from './course';
import { wallHatch } from './lessons/gridworld';
import '../../../styles/cover.css';
import './lessons/rl.css';

/* ─────────────── Hero: a Q-learning agent learning a small maze from reward alone ─────────────── */

const MAP = ['S..#....', '.#.#.##.', '.#...#..', '.####.#.', '......#G'];
const W = MAP[0].length;
const H = MAP.length;
const N = W * H;
const START = MAP.join('').indexOf('S');
const GOAL = MAP.join('').indexOf('G');
const WALL = MAP.join('').split('').map((c) => c === '#');
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const ALPHA = 0.5;
const GAMMA = 0.95;
const EPS = 0.1;
const STEP_R = -0.01;
const GOAL_R = 1;
const MAX_EPISODES = 160;
const MAX_STEPS = 200;

interface Agent {
  q: Float64Array;
  s: number;
  steps: number;
  episode: number;
  history: number[];
  rand: () => number;
}

function newAgent(seed: number): Agent {
  return { q: new Float64Array(N * 4), s: START, steps: 0, episode: 0, history: [], rand: rng(seed) };
}

function move(s: number, a: number): number {
  const x = (s % W) + DX[a];
  const y = Math.floor(s / W) + DY[a];
  if (x < 0 || y < 0 || x >= W || y >= H) return s;
  const s2 = y * W + x;
  return WALL[s2] ? s : s2;
}

const maxQ = (q: Float64Array, s: number) => Math.max(q[s * 4], q[s * 4 + 1], q[s * 4 + 2], q[s * 4 + 3]);
function greedy(q: Float64Array, s: number, r: () => number): number {
  const m = maxQ(q, s);
  const best = [0, 1, 2, 3].filter((a) => q[s * 4 + a] === m);
  return best[Math.floor(r() * best.length)];
}

/** One Q-learning step: ε-greedy action, then Q(s,a) ← Q(s,a) + α (r + γ max Q(s′,·) − Q(s,a)). */
function tick(ag: Agent) {
  const a = ag.rand() < EPS ? Math.floor(ag.rand() * 4) : greedy(ag.q, ag.s, ag.rand);
  const s2 = move(ag.s, a);
  const done = s2 === GOAL;
  const r = done ? GOAL_R : STEP_R;
  const target = r + (done ? 0 : GAMMA * maxQ(ag.q, s2));
  ag.q[ag.s * 4 + a] += ALPHA * (target - ag.q[ag.s * 4 + a]);
  ag.s = s2;
  ag.steps++;
  if (done || ag.steps >= MAX_STEPS) {
    ag.history.push(ag.steps);
    ag.episode++;
    ag.s = START;
    ag.steps = 0;
  }
}

/** Length of the shortest path, for the dashed line on the learning curve. */
function shortest(): number {
  const dist = Array(N).fill(-1);
  dist[START] = 0;
  const qu = [START];
  while (qu.length) {
    const s = qu.shift()!;
    for (let a = 0; a < 4; a++) {
      const s2 = move(s, a);
      if (dist[s2] < 0) {
        dist[s2] = dist[s] + 1;
        qu.push(s2);
      }
    }
  }
  return dist[GOAL];
}
const BEST = shortest();

function MazeHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const [seed, setSeed] = useState(1);
  const agent = useMemo(() => {
    const ag = newAgent(seed);
    // with reduced motion, show an agent that has already learned
    if (still) while (ag.episode < MAX_EPISODES) tick(ag);
    return ag;
  }, [seed, still]);
  const acc = useRef(0);
  const [, setFrame] = useState(0);

  useAnimationFrame((dt) => {
    // early episodes run fast so the reader sees learning, later ones slow down to show the route
    const rate = agent.episode < 20 ? 220 : agent.episode < 60 ? 90 : 14;
    acc.current += dt * rate;
    let n = Math.floor(acc.current);
    acc.current -= n;
    while (n-- > 0) tick(agent);
    if (agent.episode >= MAX_EPISODES) setSeed((s) => s + 1);
    setFrame((f) => f + 1);
  }, inView && !still);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plotH = Math.max(70, h * 0.3);
      const cs = Math.min((w - 2) / W, (h - plotH - 18) / H);
      const ox = (w - cs * W) / 2;
      const oy = 2;
      let vmax = 1e-9;
      for (let s = 0; s < N; s++) vmax = Math.max(vmax, maxQ(agent.q, s));
      for (let s = 0; s < N; s++) {
        const x = ox + (s % W) * cs;
        const y = oy + Math.floor(s / W) * cs;
        if (WALL[s]) {
          ctx.fillStyle = P.lineStrong;
          ctx.fillRect(x, y, cs, cs);
          wallHatch(ctx, P, x, y, cs);
          continue;
        }
        ctx.fillStyle = P.surface2;
        ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
        const v = Math.max(0, maxQ(agent.q, s)) / vmax;
        if (v > 0) {
          ctx.fillStyle = alpha(P.ml, 0.12 + 0.6 * v);
          ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
        }
        // the greedy action as a small arrow, once this cell has learned something
        if (s !== GOAL && maxQ(agent.q, s) > 0) {
          const a = greedy(agent.q, s, () => 0);
          const cx = x + cs / 2, cy = y + cs / 2, L = cs * 0.22;
          ctx.strokeStyle = alpha(P.ink, 0.55);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(cx - DX[a] * L, cy - DY[a] * L);
          ctx.lineTo(cx + DX[a] * L, cy + DY[a] * L);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx + DX[a] * L, cy + DY[a] * L, 2, 0, Math.PI * 2);
          ctx.fillStyle = alpha(P.ink, 0.55);
          ctx.fill();
        }
      }
      const label = (s: number, t: string, c: string) => {
        ctx.fillStyle = c;
        ctx.font = `700 ${Math.round(cs * 0.36)}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t, ox + (s % W) * cs + cs / 2, oy + Math.floor(s / W) * cs + cs / 2);
      };
      label(START, 'S', P.ink3);
      label(GOAL, 'G', P.good);
      // the agent
      ctx.fillStyle = P.dl;
      ctx.beginPath();
      ctx.arc(ox + (agent.s % W) * cs + cs / 2, oy + Math.floor(agent.s / W) * cs + cs / 2, cs * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = P.surface;
      ctx.lineWidth = 2;
      ctx.stroke();

      // learning curve: steps per episode, log scale
      const px0 = ox + 34, py0 = oy + cs * H + 18, pw = cs * W - 34, ph = plotH - 34;
      const lo = Math.log(BEST * 0.8), hi = Math.log(MAX_STEPS);
      const Y = (v: number) => py0 + ph - ((Math.log(v) - lo) / (hi - lo)) * ph;
      const X = (e: number) => px0 + (e / MAX_EPISODES) * pw;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(px0 + 0.5, py0 + 0.5, pw, ph);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = P.good;
      ctx.beginPath();
      ctx.moveTo(px0, Y(BEST));
      ctx.lineTo(px0 + pw, Y(BEST));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = P.dl;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      agent.history.forEach((v, e) => (e ? ctx.lineTo(X(e + 1), Y(v)) : ctx.moveTo(X(1), Y(v))));
      ctx.stroke();
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(MAX_STEPS), px0 - 5, Y(MAX_STEPS));
      ctx.fillText(String(BEST), px0 - 5, Y(BEST));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`에피소드 ${agent.episode}`, px0 + 4, py0 + ph + 4);
      ctx.textAlign = 'right';
      ctx.fillText('한 번 도착하는 데 걸린 걸음', px0 + pw, py0 + ph + 4);
    },
    [P, agent, agent.episode, agent.s, agent.steps],
    { aspect: 1.15, maxHeight: 440, minHeight: 40 },
  );

  const last = agent.history.slice(-10);
  const recent = last.length ? Math.round(last.reduce((a, b) => a + b, 0) / last.length) : null;
  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`Q-러닝 에이전트가 ${W}×${H} 미로에서 S에서 G까지 가는 길을 보상만 보고 배웁니다. 칸의 색이 진할수록 그 칸에서 기대하는 미래 보상이 크고, 작은 화살표는 지금 가장 좋다고 믿는 방향입니다. 지금까지 에피소드 ${agent.episode}번${recent ? `, 최근 평균 ${recent}걸음` : ''}이고 가장 짧은 길은 ${BEST}걸음입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="cover-key" aria-hidden="true">
          <span>
            <i style={{ background: 'var(--c-dl)', borderRadius: '50%' }} />
            에이전트
          </span>
          <span>
            <i style={{ background: 'var(--c-ml)' }} />
            배운 가치
          </span>
        </span>
        에피소드 {agent.episode} · 최근 10번 평균 {recent ?? '–'}걸음 (가장 짧은 길 {BEST}걸음)
      </div>
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-ml)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-ml)' }}>
            {course.title} · {course.subtitle}
          </div>
          <h1 className="hero-title">
            아무도
            <br />
            <em>정답</em>을
            <br />
            알려 주지 않습니다.
          </h1>
          <p className="hero-lede">
            오른쪽 미로의 에이전트는 지도를 모릅니다. 한 걸음마다 아주 작은 벌점을, G에 닿으면 상을 받을 뿐입니다. 처음에는 백 걸음 넘게 헤매지만, 상이 어디서 왔는지 한 칸씩 거꾸로 전해지면서 칸마다 색이 차오르고 길이 짧아집니다. {course.lessons.length}개의 장에서 이렇게 보상만으로 배우는 방법을 슬롯머신부터 정책 경사, 그리고 보상을 잘못 줬을 때 생기는 일까지 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'q-learning')}>
              Q-러닝 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <MazeHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>에이전트를 직접 학습시킵니다</h3>
          <p>모든 학습은 이 브라우저 안에서 돌아갑니다. 탐험 비율, 학습률, 할인율을 바꾸면 같은 문제를 얼마나 빨리, 어떤 길로 배우는지가 달라지는 것을 바로 볼 수 있습니다.</p>
        </div>
        <div>
          <h3>운이 아니라 평균으로 봅니다</h3>
          <p>강화학습은 한 번 돌릴 때마다 결과가 크게 다릅니다. 그래서 그림마다 씨앗이 정해진 난수로 여러 번 돌려 평균을 보여 주고, 다시 굴려 보는 버튼을 둡니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            경사하강법과 신경망은 <a href={courseHref('ai-basics')}>기초 인공지능</a>에서, 기댓값과 마르코프 체인은 <a href={courseHref('math-probability')}>확률과 컴퓨팅</a>에서 다룹니다. 마지막 장은 <a href={lessonHref('ai-llm', 'alignment')}>사람의 피드백으로 학습</a>과 이어집니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림과 학습은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
