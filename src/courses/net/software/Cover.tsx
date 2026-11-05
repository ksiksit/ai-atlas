import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { rng } from '../../../lib/math';
import { alpha, usePalette } from '../../../lib/theme';
import { courseHref, lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './lessons/software.css';

/* ─────────────── Hero: a random fuzzer and a coverage-guided fuzzer on the same toy program ─────────────── */

/**
 * The toy program reads 8 bytes. Bytes 4..7 each pass three easy checks (12 shallow branches).
 * Bytes 0..3 guard a nested chain: only "FUZZ" reaches the planted bug at the bottom.
 */
const MAGIC = [70, 85, 90, 90]; // "FUZZ"
const SHALLOW = 12;
const DEEP = MAGIC.length;
const BRANCHES = SHALLOW + DEEP; // the bug itself is the last deep branch
const BUDGET = 40000;

function run(input: Uint8Array, hit: Uint8Array) {
  for (let k = 0; k < 4; k++) {
    const b = input[4 + k];
    if (b < 64) hit[k * 3] = 1;
    else if (b < 192) hit[k * 3 + 1] = 1;
    else hit[k * 3 + 2] = 1;
  }
  for (let d = 0; d < DEEP; d++) {
    if (input[d] !== MAGIC[d]) return;
    hit[SHALLOW + d] = 1;
  }
}

interface Fuzzer {
  guided: boolean;
  covered: Uint8Array;
  corpus: Uint8Array[];
  execs: number;
  crashAt: number | null;
  curve: [number, number][];
  rand: () => number;
}

function newFuzzer(guided: boolean, seed: number): Fuzzer {
  const r = rng(seed);
  const seedInput = new Uint8Array(8).map(() => Math.floor(r() * 256));
  return { guided, covered: new Uint8Array(BRANCHES), corpus: [seedInput], execs: 0, crashAt: null, curve: [[0, 0]], rand: r };
}

const count = (u: Uint8Array) => u.reduce((a, b) => a + b, 0);

function exec(f: Fuzzer) {
  let input: Uint8Array;
  if (f.guided) {
    // mutate one byte of an input that once found something new, favouring the newest one
    // (real fuzzers give more energy to inputs that recently opened new paths)
    const pick = f.rand() < 0.5 ? f.corpus.length - 1 : Math.floor(f.rand() * f.corpus.length);
    input = f.corpus[pick].slice();
    input[Math.floor(f.rand() * 8)] = Math.floor(f.rand() * 256);
  } else {
    input = new Uint8Array(8).map(() => Math.floor(f.rand() * 256));
  }
  const hit = new Uint8Array(BRANCHES);
  run(input, hit);
  f.execs++;
  let fresh = false;
  for (let i = 0; i < BRANCHES; i++)
    if (hit[i] && !f.covered[i]) {
      f.covered[i] = 1;
      fresh = true;
    }
  if (fresh) {
    if (f.guided) f.corpus.push(input);
    f.curve.push([f.execs, count(f.covered)]);
  }
  if (hit[BRANCHES - 1] && f.crashAt === null) f.crashAt = f.execs;
}

function FuzzHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const [seed, setSeed] = useState(3);
  const pair = useMemo(() => {
    const fs = [newFuzzer(false, seed * 2 + 1), newFuzzer(true, seed * 2 + 2)];
    if (still) for (const f of fs) while (f.execs < BUDGET) exec(f);
    return fs;
  }, [seed, still]);
  const acc = useRef(0);
  const hold = useRef(0);
  const [, setFrame] = useState(0);

  useAnimationFrame((dt) => {
    const [a] = pair;
    if (a.execs >= BUDGET) {
      hold.current += dt;
      if (hold.current > 2.5) {
        hold.current = 0;
        setSeed((s) => s + 1);
      }
    } else {
      // speed up as the run goes on: the interesting part is the start and the deep finds
      acc.current += dt * (400 + a.execs * 0.35);
      let n = Math.min(BUDGET - a.execs, Math.floor(acc.current));
      acc.current -= n;
      while (n-- > 0) for (const f of pair) exec(f);
    }
    setFrame((x) => x + 1);
  }, inView && !still);

  const [rnd, cov] = pair;
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const colW = w / 2;
      const labels = ['무작위 입력', '커버리지 기반'];
      pair.forEach((f, i) => {
        const x0 = i * colW + 8;
        const cw = colW - 16;
        ctx.fillStyle = P.ink;
        ctx.font = `600 12px ${P.fontBody}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(labels[i], x0, 2);
        ctx.fillStyle = P.ink3;
        ctx.font = `11px ${P.fontMono}`;
        ctx.fillText(`실행 ${f.execs.toLocaleString('ko-KR')}`, x0, 20);
        // shallow branches: a 4×3 grid
        const cell = Math.min(22, (cw - 8) / 6);
        const gy = 42;
        for (let k = 0; k < SHALLOW; k++) {
          const cx = x0 + (k % 6) * (cell + 3);
          const cy = gy + Math.floor(k / 6) * (cell + 3);
          ctx.fillStyle = f.covered[k] ? alpha(P.accent, 0.8) : P.surface2;
          ctx.fillRect(cx, cy, cell, cell);
        }
        // the deep chain: F → U → Z → Z → bug
        const dy = gy + 2 * (cell + 3) + 12;
        const chainW = (cw - 4) / DEEP;
        for (let d = 0; d < DEEP; d++) {
          const cx = x0 + d * chainW;
          const on = f.covered[SHALLOW + d] === 1;
          const bug = d === DEEP - 1;
          ctx.fillStyle = on ? (bug ? P.bad : alpha(P.accent, 0.8)) : P.surface2;
          ctx.fillRect(cx, dy, chainW - 6, cell + 6);
          ctx.fillStyle = on ? P.surface : P.ink3;
          ctx.font = `700 12px ${P.fontMono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(bug ? (on ? '버그!' : '?') : `'${String.fromCharCode(MAGIC[d])}'`, cx + (chainW - 6) / 2, dy + (cell + 6) / 2);
          if (d < DEEP - 1) {
            ctx.fillStyle = P.ink3;
            ctx.fillText('→', cx + chainW - 3, dy + (cell + 6) / 2);
          }
        }
      });

      // coverage over executions, both fuzzers, log x
      const py0 = 42 + 2 * 25 + 12 + 34 + 26;
      const px0 = 40, pw = w - px0 - 10, ph = Math.max(60, h - py0 - 30);
      const X = (e: number) => px0 + (Math.log10(Math.max(1, e)) / Math.log10(BUDGET)) * pw;
      const Y = (c: number) => py0 + ph - (c / BRANCHES) * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      for (const c of [0, 8, 16]) {
        ctx.beginPath();
        ctx.moveTo(px0, Y(c) + 0.5);
        ctx.lineTo(px0 + pw, Y(c) + 0.5);
        ctx.stroke();
      }
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const c of [0, 8, 16]) ctx.fillText(String(c), px0 - 6, Y(c));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const e of [1, 10, 100, 1000, 10000]) ctx.fillText(e >= 1000 ? `${e / 1000}천` : String(e), X(e), py0 + ph + 4);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('찾은 분기 (16개 중)', px0, py0 - 4);
      ctx.textAlign = 'right';
      ctx.fillText('실행 횟수 (로그)', px0 + pw, py0 - 4);
      pair.forEach((f, i) => {
        ctx.strokeStyle = i === 0 ? P.ink3 : P.accent;
        ctx.lineWidth = i === 0 ? 1.5 : 2.5;
        ctx.beginPath();
        let last = 0;
        f.curve.forEach(([e, c], k) => {
          if (k === 0) ctx.moveTo(X(1), Y(c));
          else {
            ctx.lineTo(X(e), Y(last));
            ctx.lineTo(X(e), Y(c));
          }
          last = c;
        });
        ctx.lineTo(X(f.execs), Y(last));
        ctx.stroke();
      });
    },
    [P, pair, rnd.execs, cov.execs],
    { aspect: 1.25, maxHeight: 420, minHeight: 40 },
  );

  const done = rnd.execs >= BUDGET;
  return (
    <div ref={outer}>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`같은 작은 프로그램에 무작위 퍼저와 커버리지 기반 퍼저가 입력을 ${BUDGET.toLocaleString('ko-KR')}번씩 넣습니다. 프로그램에는 쉬운 분기 12개와, 첫 네 바이트가 FUZZ일 때만 닿는 깊은 분기 4개가 있고 맨 끝에 버그가 있습니다. 지금 무작위 퍼저는 ${count(rnd.covered)}개, 커버리지 기반 퍼저는 ${count(cov.covered)}개의 분기를 찾았습니다.${cov.crashAt ? ` 커버리지 기반 퍼저는 ${cov.crashAt.toLocaleString('ko-KR')}번째 실행에서 버그에 닿았습니다.` : ''}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        <span className="cover-key" aria-hidden="true">
          <span>
            <i style={{ background: 'var(--ink-3)' }} />
            무작위
          </span>
          <span>
            <i style={{ background: 'var(--accent)' }} />
            커버리지 기반
          </span>
        </span>
        {cov.crashAt ? `커버리지 기반 퍼저가 ${cov.crashAt.toLocaleString('ko-KR')}번째 실행에서 버그 발견` : '버그를 찾는 중'}
        {done && !rnd.crashAt ? ' · 무작위 퍼저는 끝내 못 찾음' : ''}
      </div>
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-net-1)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-net-1)' }}>
            {course.title} · {course.subtitle}
          </div>
          <h1 className="hero-title">
            공격자는
            <br />
            <em>한 곳</em>만
            <br />
            찾으면 됩니다.
          </h1>
          <p className="hero-lede">
            지키는 쪽은 모든 입구를 막아야 하지만, 공격하는 쪽은 열린 곳 하나면 충분합니다. 그래서 지키는 쪽도 공격자처럼 찾아야 합니다. 오른쪽 그림에서 아무 바이트나 넣는 퍼저는 깊숙이 숨은 버그에 거의 닿지 못하지만, 새 분기를 연 입력을 기억해 조금씩 고치는 퍼저는 한 단계씩 내려가 버그를 찾아냅니다. {course.lessons.length}개의 장에서 위협을 정리하고, 인증과 권한을 설계하고, 이런 도구로 취약점을 먼저 찾는 법을 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'fuzzing')}>
              퍼징 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <FuzzHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>공격은 페이지 안에서만</h3>
          <p>이 과목의 공격은 모두 페이지 안에 만든 작은 가상 서비스와 가상 프로그램을 상대로 합니다. 실제 서비스를 겨냥하는 방법은 다루지 않고, 왜 통하는지와 어떻게 막는지에 집중합니다.</p>
        </div>
        <div>
          <h3>고치면 바로 확인합니다</h3>
          <p>권한 검사를 하나 더하거나, 입력을 정화하거나, 버전을 고정하면 그림이 다시 계산되어 무엇이 막혔고 무엇이 아직 열려 있는지 보여 줍니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            해시, 공개 키, 웹 공격은 <a href={courseHref('net-security')}>네트워크 보안</a>에서 다룹니다. 버퍼 오버플로와 커널의 벽은 <a href={lessonHref('cs-operating-systems', 'protection')}>운영체제의 보호와 보안</a> 장에 있습니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림과 시뮬레이션은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
