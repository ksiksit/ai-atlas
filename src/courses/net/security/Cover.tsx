import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../lib/canvas';
import { alpha, usePalette } from '../../../lib/theme';
import { lessonHref } from '../../index';
import { bitAt, hex, sha256, utf8 } from '../shared';
import course from './course';
import '../../../styles/cover.css';
import './cover-avalanche.css';

/* ─────────────── Hero: one input bit flips, half of SHA-256's output flips ─────────────── */

// each message differs from the one before it (cyclically) in exactly one bit
const MESSAGES = ['hello', 'Hello', 'Hellm', 'hellm'];
const HOLD = 2.6; // seconds per message
const FADE = 0.45;

function diffBits(a: Uint8Array, b: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length * 8; i++) if (bitAt(a, i) !== bitAt(b, i)) out.push(i);
  return out;
}

function AvalancheHero() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const steps = useMemo(
    () =>
      MESSAGES.map((m, i) => {
        const prev = MESSAGES[(i + MESSAGES.length - 1) % MESSAGES.length];
        const pIn = utf8(prev);
        const cIn = utf8(m);
        const hp = sha256(pIn);
        const hc = sha256(cIn);
        return { msg: m, hash: hc, prevHash: hp, changed: new Set(diffBits(hp, hc)), charAt: [...m].findIndex((ch, k) => ch !== prev[k]), inBits: diffBits(pIn, cIn).length };
      }),
    [],
  );
  const t = useRef(still ? HOLD * 1 + FADE : 0);
  const [, setTick] = useState(0);
  useAnimationFrame((dt) => {
    t.current = (t.current + dt) % (HOLD * MESSAGES.length);
    setTick((x) => x + 1);
  }, inView && !still);

  const k = Math.floor(t.current / HOLD);
  const local = t.current - k * HOLD;
  const fade = Math.min(1, local / FADE);
  const s = steps[k];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const n = 16;
      const gap = 3;
      const size = Math.min((w - 20 - gap * (n - 1)) / n, (h - 20 - gap * (n - 1)) / n);
      const gw = n * size + (n - 1) * gap;
      const x0 = (w - gw) / 2;
      const y0 = (h - gw) / 2;
      const on = P.ink;
      const off = P.dark ? alpha(P.ink, 0.1) : alpha(P.ink, 0.07);
      for (let i = 0; i < 256; i++) {
        const x = x0 + (i % n) * (size + gap);
        const y = y0 + Math.floor(i / n) * (size + gap);
        const now = bitAt(s.hash, i);
        const was = bitAt(s.prevHash, i);
        const flipped = s.changed.has(i);
        // flipped bits fade from their old value to the new one
        const v = flipped ? was + (now - was) * fade : now;
        ctx.fillStyle = off;
        ctx.fillRect(x, y, size, size);
        if (v > 0) {
          ctx.fillStyle = alpha(on, 0.85 * v);
          ctx.fillRect(x, y, size, size);
        }
        if (flipped) {
          ctx.strokeStyle = alpha(P.pos, 0.35 + 0.65 * (1 - fade * 0.4));
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
        }
      }
    },
    [P, s, fade],
    { aspect: 1.15, maxHeight: 380, minHeight: 240 },
  );

  const chars = [...s.msg];
  return (
    <div ref={outer}>
      <div className="sec-hero-input" aria-hidden="true">
        <span className="sec-hero-label">입력</span>
        <span className="mono sec-hero-msg">
          {chars.map((ch, i) => (
            <span key={i} data-flip={i === s.charAt || undefined}>
              {ch}
            </span>
          ))}
        </span>
        <span className="sec-hero-label">SHA-256 출력 256비트</span>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`해시 함수의 눈사태 효과: 입력 "${s.msg}"는 바로 앞 입력과 ${s.inBits}비트만 다르지만, SHA-256 출력 256비트 중 ${s.changed.size}비트가 바뀝니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="hero-figure-cap">
        입력에서 <strong>{s.inBits}비트</strong>를 바꿨더니 출력 256비트 중 <strong style={{ color: 'var(--pos)' }}>{s.changed.size}비트({Math.round((s.changed.size / 256) * 100)}%)</strong>가 바뀌었습니다(주황 테두리). 출력 앞부분: <span className="mono">{hex(s.hash).slice(0, 16)}…</span>
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
            한 비트만 바꿔도
            <br />
            <em>전부 달라집니다.</em>
          </h1>
          <p className="hero-lede">
            그림의 격자는 짧은 단어의 SHA-256 해시입니다. 입력의 글자 하나에서 비트 하나만 바꿔도 출력은 절반 가까이 뒤집혀, 원래 입력을 짐작할 단서가 남지 않습니다. 이 과목에서는 이런 암호 도구들로 엿듣기, 바꿔치기, 사칭, 넘치게 하기 같은 공격을 막는 원리를 {course.lessons.length}개 장에 걸쳐 직접 계산해 봅니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'tls')}>
              TLS 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <AvalancheHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>작은 수로 직접 계산</h3>
          <p>실제 암호는 수백 자리 수를 쓰지만 원리는 같습니다. 손으로 따라갈 수 있는 작은 수로 RSA와 키 교환을 계산하고, 왜 큰 수가 필요한지 봅니다.</p>
        </div>
        <div>
          <h3>공격자 자리에 서 보기</h3>
          <p>그림에서 중간자가 되어 메시지를 바꿔 보고, 방어를 하나씩 꺼 보며 어느 장치가 무엇을 막는지 확인합니다. 모든 공격은 브라우저 안의 시뮬레이션입니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            패킷, TCP, DNS, HTTPS의 흐름을 안다고 가정합니다. 필요하면 <a href="#net-basics">기초 네트워크</a>를 먼저 보세요. 특히 <a href="#net-basics/http">HTTP와 HTTPS</a> 장의 키 교환에서 이어집니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
