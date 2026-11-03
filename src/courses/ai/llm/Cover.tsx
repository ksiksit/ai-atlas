import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useInView } from '../../../lib/canvas';
import { lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './cover-bpe.css';

/* ─────────────── Hero: BPE merges turning characters into tokens ─────────────── */

// A tiny training corpus. Words are split on spaces first; BPE then merges inside words.
const CORPUS = [
  '언어 모델은 다음 토큰을 예측합니다',
  '모델은 토큰을 읽고 다음 토큰을 씁니다',
  '토큰은 자주 나오는 글자 조각입니다',
  '자주 나오는 조각을 합치면 토큰이 됩니다',
  '학습 데이터가 많을수록 언어 모델이 좋아집니다',
  '모델은 학습 데이터에서 다음 글자를 배웁니다',
  '사람의 피드백으로 모델을 다듬습니다',
  '질문과 비슷한 문서를 찾아 모델에 넣어 줍니다',
  '작은 모델이 다음 토큰을 미리 써 봅니다',
  '언어 모델은 토큰을 하나씩 이어 씁니다',
];
const SHOW = [0, 4, 3]; // sentences animated on the cover, in turn
const MERGES = 60;

type Word = string[];

function trainBpe(lines: string[], n: number): [string, string][] {
  const counts = new Map<string, number>();
  for (const line of lines) for (const w of line.split(' ')) counts.set(w, (counts.get(w) ?? 0) + 1);
  let words: { syms: Word; f: number }[] = [...counts].map(([w, f]) => ({ syms: [...w], f }));
  const merges: [string, string][] = [];
  for (let m = 0; m < n; m++) {
    const pairs = new Map<string, number>();
    for (const { syms, f } of words) for (let i = 0; i + 1 < syms.length; i++) pairs.set(syms[i] + '\u0000' + syms[i + 1], (pairs.get(syms[i] + '\u0000' + syms[i + 1]) ?? 0) + f);
    let best = '';
    let bestN = 1; // a pair must occur at least twice to be worth a vocabulary entry
    for (const [p, c] of pairs) if (c > bestN) [best, bestN] = [p, c]; // first-seen wins ties: deterministic
    if (!best) break;
    const [a, b] = best.split('\u0000');
    merges.push([a, b]);
    words = words.map(({ syms, f }) => ({ syms: applyMerge(syms, a, b), f }));
  }
  return merges;
}

function applyMerge(syms: Word, a: string, b: string): Word {
  const out: Word = [];
  for (let i = 0; i < syms.length; i++) {
    if (i + 1 < syms.length && syms[i] === a && syms[i + 1] === b) {
      out.push(a + b);
      i++;
    } else out.push(syms[i]);
  }
  return out;
}

interface Frame {
  words: Word[];
  hl: Set<string>; // "word:index" of the left half of each pair about to merge
  rule?: string;
}

/** Frames for one sentence: start from characters, then for each learned merge that occurs, highlight it, then apply it. */
function framesFor(sentence: string, merges: [string, string][]): Frame[] {
  let words: Word[] = sentence.split(' ').map((w) => [...w]);
  const frames: Frame[] = [{ words, hl: new Set() }];
  for (const [a, b] of merges) {
    const hl = new Set<string>();
    words.forEach((syms, wi) => {
      for (let i = 0; i + 1 < syms.length; i++)
        if (syms[i] === a && syms[i + 1] === b) {
          hl.add(`${wi}:${i}`);
          i++;
        }
    });
    if (!hl.size) continue;
    frames.push({ words, hl, rule: `${a} + ${b}` });
    words = words.map((syms) => applyMerge(syms, a, b));
    frames.push({ words, hl: new Set(), rule: `${a} + ${b} → ${a + b}` });
  }
  return frames;
}

const STEP = 0.42; // seconds per frame
const HOLD = 2.4; // seconds on the finished sentence

function BpeHero() {
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const merges = useMemo(() => trainBpe(CORPUS, MERGES), []);
  const runs = useMemo(() => SHOW.map((i) => framesFor(CORPUS[i], merges)), [merges]);
  const [k, setK] = useState(0);
  const t = useRef(still ? 1e9 : 0);
  const [, setTick] = useState(0);

  const frames = runs[k];
  useAnimationFrame((dt) => {
    t.current += dt;
    if (t.current > frames.length * STEP + HOLD) {
      t.current = 0;
      setK((x) => (x + 1) % runs.length);
    }
    setTick((x) => x + 1);
  }, inView && !still);

  const fi = Math.min(frames.length - 1, Math.floor(t.current / STEP));
  const f = frames[fi];
  const chars = frames[0].words.reduce((s, w) => s + w.length, 0);
  const tokens = f.words.reduce((s, w) => s + w.length, 0);
  const used = (frames.length - 1) / 2;

  return (
    <div ref={outer}>
      <div className="bpe-hero canvas-box" role="img" aria-label={`BPE 애니메이션: 문장 "${CORPUS[SHOW[k]]}"를 글자 ${chars}개로 나눈 뒤, 학습한 병합 규칙을 차례로 적용해 토큰 ${frames[frames.length - 1].words.reduce((s, w) => s + w.length, 0)}개로 줄입니다.`}>
        <div className="bpe-rule mono" aria-hidden="true">
          {f.rule ? <>병합 {f.rule}</> : fi === 0 ? '글자 단위에서 시작' : ' '}
        </div>
        <div className="bpe-sentence" aria-hidden="true">
          {f.words.map((syms, wi) => (
            <span key={wi} className="bpe-word">
              {syms.map((s, i) => (
                <span key={i} className="bpe-tok" data-hl={f.hl.has(`${wi}:${i}`) || f.hl.has(`${wi}:${i - 1}`) || undefined} style={{ ['--len' as string]: Math.min(4, [...s].length) }}>
                  {s}
                </span>
              ))}
            </span>
          ))}
        </div>
        <div className="bpe-count" aria-hidden="true">
          <span>
            글자 <strong className="mono">{chars}</strong>
          </span>
          <span>→</span>
          <span>
            토큰 <strong className="mono">{tokens}</strong>
          </span>
        </div>
      </div>
      <div className="hero-figure-cap">
        예문 {CORPUS.length}개에서 배운 병합 규칙 {merges.length}개 중 이 문장에 쓰이는 {used}개를, 배운 순서대로 적용합니다. 자주 붙어 나오는 조각일수록 먼저 하나의 토큰이 됩니다.
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
            모델은
            <br />
            <em>토큰</em>으로
            <br />
            읽고 씁니다.
          </h1>
          <p className="hero-lede">
            토큰 그림은 글자들이 자주 붙어 나오는 순서대로 합쳐져 토큰이 되는 BPE 토크나이저의 모습입니다. 대형 언어 모델이 보는 세상은 이런 토큰의 줄입니다. 이 과목에서는 토크나이저와 스케일링 법칙에서 시작해, 파인튜닝과 사람의 피드백으로 모델을 다듬고, 검색과 추론 최적화로 실제 서비스에 쓰기까지 {course.lessons.length}개의 장을 계산하며 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'rag')}>
              RAG 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <BpeHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>개발자의 선택을 다룹니다</h3>
          <p>어휘를 얼마나 크게 할지, LoRA 랭크를 몇으로 할지, 몇 비트로 양자화할지. 실제로 부딪히는 결정을 숫자로 따져 봅니다.</p>
        </div>
        <div>
          <h3>작게, 하지만 진짜로</h3>
          <p>그림 속 모델은 아주 작지만 같은 원리로 동작합니다. 수식은 브라우저에서 직접 계산하고, 실제 모델 이야기는 확실한 논문과 공개 자료에 근거한 것만 씁니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            트랜스포머, KV 캐시, 임베딩, 크로스엔트로피를 알고 있다고 가정합니다. 필요하면 <a href="#ai-basics">기초 인공지능</a>과 <a href="#ai-deep-learning">딥러닝</a>을 먼저 보세요.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림과 계산은 브라우저 안에서 이루어집니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
