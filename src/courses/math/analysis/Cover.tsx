import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { alpha, usePalette } from '../../../lib/theme';
import { courseHref, lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './lessons/analysis.css';

/* ─────────────── Hero: the ε-N game, played by itself ─────────────── */

/** aₙ = 1 + sin(n)·1.6/n wanders around 1 and settles; the limit is L = 1. */
const L = 1;
const COUNT = 200;
const a = (n: number) => L + (1.6 * Math.sin(n)) / n;
const EPS_HI = 0.5, EPS_LO = 0.012;
const SECONDS = 8, HOLD = 1.5;

/** The smallest N such that every term from N on lies within ε of L (checked over all terms shown). */
function smallestN(terms: number[], eps: number): number {
  let last = 0;
  terms.forEach((v, i) => {
    if (Math.abs(v - L) >= eps) last = i + 1;
  });
  return last + 1;
}

function EpsHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const t = useRef(still ? SECONDS * 0.6 : 0);
  const [, setTick] = useState(0);
  useAnimationFrame((dt) => {
    t.current += dt;
    if (t.current > SECONDS + HOLD) t.current = 0;
    setTick((x) => x + 1);
  }, inView && !still);

  const terms = useMemo(() => Array.from({ length: COUNT }, (_, i) => a(i + 1)), []);
  const s = Math.min(1, t.current / SECONDS);
  const eps = EPS_HI * Math.pow(EPS_LO / EPS_HI, s);
  const N = smallestN(terms, eps);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 36, r: 10, t: 12, b: 30 };
      const lo = 0.1, hi = 1.9;
      // log scale in n so early wandering and late settling both fit
      const X = (n: number) => pad.l + (Math.log(n) / Math.log(COUNT)) * (w - pad.l - pad.r);
      const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
      // the ε band around L
      ctx.fillStyle = alpha(P.accent, 0.14);
      ctx.fillRect(pad.l, Y(L + eps), w - pad.l - pad.r, Y(L - eps) - Y(L + eps));
      ctx.strokeStyle = alpha(P.accent, 0.7);
      ctx.lineWidth = 1;
      for (const v of [L + eps, L - eps]) {
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(v) + 0.5);
        ctx.lineTo(w - pad.r, Y(v) + 0.5);
        ctx.stroke();
      }
      ctx.strokeStyle = P.ink3;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(L) + 0.5);
      ctx.lineTo(w - pad.r, Y(L) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      // N: everything right of it must be inside the band
      if (N <= COUNT) {
        const xn = X(N) - 3;
        ctx.fillStyle = alpha(P.good, 0.08);
        ctx.fillRect(xn, pad.t, w - pad.r - xn, h - pad.t - pad.b);
        ctx.strokeStyle = P.good;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xn, pad.t);
        ctx.lineTo(xn, h - pad.b);
        ctx.stroke();
        ctx.fillStyle = P.good;
        ctx.font = `700 12px ${P.fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`N = ${N}`, Math.min(xn + 5, w - 70), pad.t + 2);
      }
      // the terms
      terms.forEach((v, i) => {
        const n = i + 1;
        const inside = Math.abs(v - L) < eps;
        ctx.fillStyle = n >= N ? P.good : inside ? alpha(P.ink, 0.55) : P.bad;
        ctx.beginPath();
        ctx.arc(X(n), Y(Math.max(lo, Math.min(hi, v))), n >= N ? 2.4 : 3, 0, Math.PI * 2);
        ctx.fill();
      });
      // axes labels
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('L = 1', pad.l - 4, Y(L));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const n of [1, 10, 100]) ctx.fillText(String(n), X(n), h - pad.b + 6);
      // the axis title only where it fits beside the tick labels
      if (w > 480) {
        ctx.textAlign = 'right';
        ctx.fillText('n (로그 눈금)', w - pad.r, h - pad.b + 6);
      }
    },
    [P, terms, eps, N],
    { aspect: 1.35, maxHeight: 420, minHeight: 40 },
  );

  const shownN = N <= COUNT ? N : `${COUNT}보다 큼`;
  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`수열 aₙ = 1 + 1.6·sin(n)/n의 항 ${COUNT}개를 점으로 찍은 그림. 극한 1의 위아래로 폭 ε인 띠가 점점 좁아지고, 띠가 좁아질수록 그 뒤의 모든 항이 띠 안에 드는 번호 N이 오른쪽으로 물러납니다. 지금 ε = ${eps.toFixed(3)}, N = ${shownN}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="cover-key" aria-hidden="true">
          <span>
            <i style={{ background: 'var(--bad)', borderRadius: '50%' }} />
            띠 밖
          </span>
          <span>
            <i style={{ background: 'var(--good)', borderRadius: '50%' }} />
            N 이후
          </span>
        </span>
        ε = <span className="mono">{eps.toFixed(3)}</span> → N = <strong className="mono">{shownN}</strong>
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
            아무리 작은 ε을
            <br />
            골라도,
            <br />
            <em>N</em>이 있습니다.
          </h1>
          <p className="hero-lede">
            "수열이 1에 한없이 가까워진다"는 말은 이 게임으로 정확해집니다. 상대가 오차 ε을 정하면, 우리는 그 뒤로 모든 항이 1에서 ε보다 가까이 있는 번호 N을 찾아 보여야 합니다. 오른쪽 그림에서 띠가 좁아질수록 N은 멀어지지만, 언제나 하나는 있습니다. 해석학은 미적분학이 직관으로 넘어간 말들을 이런 정의로 다시 세우고 증명합니다. {course.lessons.length}개의 장에서 실수, 수열, 급수, 연속, 미분, 균등 수렴을 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'sequences')}>
              수열의 수렴 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <EpsHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>증명을 읽고, 그림으로 확인합니다</h3>
          <p>장마다 정의와 정리를 정확히 적고, 짧은 증명을 끝까지 씁니다. 그 옆에 같은 내용을 직접 움직여 보는 그림을 두어, 증명의 각 단계가 무엇을 하는지 볼 수 있게 합니다.</p>
        </div>
        <div>
          <h3>조건을 빼 봅니다</h3>
          <p>정리마다 붙은 조건을 하나씩 꺼 보면 결론이 무너지는 반례가 나타납니다. 조건이 왜 필요한지는 반례를 보면 가장 빨리 이해됩니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            극한, 미분, 급수의 계산은 <a href={courseHref('math-calculus')}>미적분학</a>에서, 증명하는 방법과 귀납법은 <a href={courseHref('math-discrete')}>이산수학</a>에서 다룹니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
