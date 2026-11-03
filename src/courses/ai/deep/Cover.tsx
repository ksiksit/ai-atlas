import { useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { gauss, rng } from '../../../lib/math';
import { alpha, lerpColor, rgbStr, usePalette } from '../../../lib/theme';
import { lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';

/* ─────────────── Hero: diffusion sampling, noise → spiral ─────────────── */

// Data distribution: K small Gaussians along a spiral. For such a mixture the denoiser E[x0 | xt]
// has a closed form, so the reverse process below is exact rather than a trained network's guess.
const K = 56;
const S = 0.07; // std of each mixture component
const MU: [number, number][] = Array.from({ length: K }, (_, k) => {
  const u = k / (K - 1);
  const th = 0.6 + u * 3.6 * Math.PI;
  const r = 0.3 + 1.45 * u; // about as wide as the unit-variance noise it starts from
  return [r * Math.cos(th), r * Math.sin(th)];
});
const N = 420; // particles
const STEPS = 80;
const ab = (t: number) => [Math.cos((Math.PI / 2) * t), Math.sin((Math.PI / 2) * t)] as const; // cosine schedule: α, σ

/** E[x0 | xt] for the mixture, plus the expected component index (it sharpens from the middle to one end of the spiral as noise is removed). */
function denoise(x: number, y: number, a: number, s: number): [number, number, number] {
  const v = a * a * S * S + s * s;
  let wsum = 0;
  let mx = 0;
  let my = 0;
  let kbar = 0;
  // log-weights are shifted by their max for stability
  let lmax = -Infinity;
  const lw = new Float64Array(K);
  for (let k = 0; k < K; k++) {
    const dx = x - a * MU[k][0];
    const dy = y - a * MU[k][1];
    lw[k] = -(dx * dx + dy * dy) / (2 * v);
    if (lw[k] > lmax) lmax = lw[k];
  }
  const g = (a * S * S) / v;
  for (let k = 0; k < K; k++) {
    const w = Math.exp(lw[k] - lmax);
    wsum += w;
    mx += w * (MU[k][0] + g * (x - a * MU[k][0]));
    my += w * (MU[k][1] + g * (y - a * MU[k][1]));
    kbar += w * k;
  }
  return [mx / wsum, my / wsum, kbar / wsum];
}

interface Run {
  path: Float32Array[]; // frames computed so far, each [x0, y0, x1, y1, ...]; path[i] is after i steps
  comp: Float32Array; // expected component of each particle at the last computed step, for colour
  noise: Float32Array; // fresh noise the particles are blown back into afterwards
}

function newRun(start: Float32Array, r: () => number): Run {
  const noise = new Float32Array(2 * N);
  for (let i = 0; i < 2 * N; i++) noise[i] = gauss(r);
  return { path: [start], comp: new Float32Array(N).fill((K - 1) / 2), noise };
}

/** Deterministic DDIM, computed lazily: extend the run until frame `step` exists (about 1 ms per step). */
function ensure(run: Run, step: number) {
  while (run.path.length <= step) {
    const i = run.path.length - 1;
    const x = run.path[i];
    const [a, s] = ab(Math.min(1 - i / STEPS, 0.9995));
    const [a2, s2] = ab(1 - (i + 1) / STEPS);
    const nx = new Float32Array(2 * N);
    for (let p = 0; p < N; p++) {
      const [hx, hy, k] = denoise(x[2 * p], x[2 * p + 1], a, s);
      nx[2 * p] = a2 * hx + s2 * ((x[2 * p] - a * hx) / s);
      nx[2 * p + 1] = a2 * hy + s2 * ((x[2 * p + 1] - a * hy) / s);
      run.comp[p] = k;
    }
    run.path.push(nx);
  }
}

// timeline (seconds)
const HOLD_NOISE = 0.7;
const DENOISE = 3.4;
const HOLD_DATA = 1.8;
const RENOISE = 1.3;
const CYCLE = HOLD_NOISE + DENOISE + HOLD_DATA + RENOISE;

function DiffusionHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const r = useRef(rng(11));
  const run = useRef<Run | null>(null);
  if (!run.current) {
    const start = new Float32Array(2 * N);
    for (let i = 0; i < 2 * N; i++) start[i] = gauss(r.current);
    run.current = newRun(start, r.current);
  }
  const t = useRef(still ? HOLD_NOISE + DENOISE + 0.1 : 0);
  const [, setTick] = useState(0);

  useAnimationFrame((dt) => {
    t.current += dt;
    if (t.current >= CYCLE) {
      t.current -= CYCLE;
      run.current = newRun(run.current!.noise, r.current); // the next run starts from the noise we just blew into
    }
    setTick((x) => x + 1);
  }, inView && !still);

  const c = t.current;
  const R = run.current;
  let step: number; // 0..STEPS: position in the reverse process
  let renoise = 0; // 0..1 while blowing the spiral back into noise
  if (c < HOLD_NOISE) step = 0;
  else if (c < HOLD_NOISE + DENOISE) {
    const u = (c - HOLD_NOISE) / DENOISE;
    step = Math.min(STEPS, Math.floor(u * u * (3 - 2 * u) * STEPS + 0.5));
  } else if (c < HOLD_NOISE + DENOISE + HOLD_DATA) step = STEPS;
  else {
    step = STEPS;
    renoise = (c - HOLD_NOISE - DENOISE - HOLD_DATA) / RENOISE;
  }
  ensure(R, step);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const scale = Math.min(w, h) / 2 / 2.4; // ±2.4 covers both the spiral and most of the starting noise
      const cx = w / 2;
      const cy = h / 2;
      // faint target spiral
      ctx.strokeStyle = alpha(P.ink3, 0.25);
      ctx.lineWidth = 1;
      ctx.beginPath();
      MU.forEach(([x, y], k) => (k ? ctx.lineTo(cx + x * scale, cy - y * scale) : ctx.moveTo(cx + x * scale, cy - y * scale)));
      ctx.stroke();

      const frame = R.path[step];
      const [ra, rs] = ab(renoise);
      for (let p = 0; p < N; p++) {
        let x = frame[2 * p];
        let y = frame[2 * p + 1];
        if (renoise > 0) {
          x = ra * x + rs * R.noise[2 * p];
          y = ra * y + rs * R.noise[2 * p + 1];
        }
        ctx.fillStyle = rgbStr(lerpColor(P.neg, P.dl, R.comp[p] / (K - 1)), 0.85);
        ctx.beginPath();
        ctx.arc(cx + x * scale, cy - y * scale, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [P, step, renoise, R],
    { aspect: 1.1, maxHeight: 420, minHeight: 260 },
  );

  const phase = renoise > 0 ? '노이즈 섞기' : step === 0 ? '순수한 잡음' : step === STEPS ? '완성' : '노이즈 걷어 내는 중';

  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`확산 모델 애니메이션: 점 ${N}개가 무작위 잡음에서 출발해 ${STEPS}단계에 걸쳐 노이즈를 걷어 내며 나선 모양으로 모입니다. 그 뒤 다시 노이즈를 섞어 잡음으로 돌아가고 처음부터 반복합니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="mono">
          단계 {step} / {STEPS}
        </span>{' '}
        · {phase} · 점 {N}개를 잡음에서 나선으로 되돌립니다. 학습된 신경망 대신, 이 분포에 대해 정확하게 계산한 잡음 제거 식을 씁니다.
      </div>
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-dl)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-dl)' }}>
            {course.title} · {course.subtitle}
          </div>
          <h1 className="hero-title">
            잡음 속에서
            <br />
            <em>그림을</em>
            <br />
            꺼냅니다.
          </h1>
          <p className="hero-lede">
            점 그림은 무작위 잡음에서 노이즈를 조금씩 걷어 내 나선 모양을 되살리는 확산 모델입니다. 이미지 생성 모델도 같은 일을 수십만 차원에서 합니다. 이 과목에서는 깊은 신경망이 제대로 학습되게 만드는 기술에서 시작해, 순환 신경망과 트랜스포머의 속, 그리고 오토인코더와 확산 모델까지 {course.lessons.length}개의 장을 직접 만지며 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'diffusion')}>
              확산 모델 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <DiffusionHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>브라우저에서 학습합니다</h3>
          <p>그림 속 신경망은 작지만 진짜로 학습합니다. 설정을 바꾸고 다시 학습시키면 손실 곡선과 결과가 어떻게 달라지는지 바로 볼 수 있습니다.</p>
        </div>
        <div>
          <h3>왜 되는지를 봅니다</h3>
          <p>정규화, 게이트, 위치 인코딩, 노이즈 스케줄. 실제 모델에 들어가는 부품마다 없으면 무엇이 무너지는지 직접 꺼 보며 확인합니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            신경망, 손실 함수, 역전파, 어텐션을 알고 있다고 가정합니다. 처음이라면 <a href="#ai-basics">기초 인공지능</a>부터 보세요.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림과 학습은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
