import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useInView } from '../../../lib/canvas';
import { rng } from '../../../lib/math';
import { lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './lessons/basics.css';

/* ─────────────── Hero: commits flowing through a pipeline, some caught on the way ─────────────── */

const STAGES = ['설치', '빌드', '테스트', '배포', '관찰'];
/** Chance that a commit fails at each stage, given it got that far. */
const FAIL_P = [0.04, 0.08, 0.2, 0.03, 0.1];
const COMMITS = ['fix: 날짜 형식', 'feat: 할 일 검색', 'chore: datefmt 1.3', 'refactor: 저장소 분리', 'feat: 마감일 알림', 'fix: 빈 제목 막기', 'test: API 경계값', 'feat: 태그 붙이기', 'fix: 시간대 버그', 'perf: 목록 캐시'];
const SHOWN = 5;
const STEP = 0.55; // seconds per stage
const PAUSE = 0.6; // seconds between commits
const RUN_T = STAGES.length * STEP + PAUSE;

interface Run {
  msg: string;
  /** Stage index where the run fails, or -1. */
  failAt: number;
}

function makeRuns(): Run[] {
  const r = rng(7);
  return COMMITS.map((msg) => {
    let failAt = -1;
    for (let s = 0; s < STAGES.length && failAt < 0; s++) if (r() < FAIL_P[s]) failAt = s;
    return { msg, failAt };
  });
}

type CellState = 'wait' | 'run' | 'ok' | 'fail' | 'skip';

function cell(run: Run, s: number, progress: number): CellState {
  // progress: how many stages have finished (fractional while one runs)
  const end = run.failAt < 0 ? STAGES.length : run.failAt + 1;
  if (s >= end) return progress >= end ? 'skip' : 'wait';
  if (progress >= s + 1) return s === run.failAt ? 'fail' : 'ok';
  if (progress > s) return 'run';
  return 'wait';
}

function label(s: number, st: CellState) {
  if (st === 'ok') return '✓';
  if (st === 'fail') return s === STAGES.length - 1 ? '롤백' : '✗';
  if (st === 'run') return '…';
  return '';
}

function PipelineHero() {
  const runs = useMemo(makeRuns, []);
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const loop = runs.length * RUN_T;
  const t = useRef(still ? SHOWN * RUN_T : SHOWN * RUN_T - RUN_T + 0.01);
  const [, setTick] = useState(0);

  useAnimationFrame((dt) => {
    t.current = (t.current + dt) % loop;
    setTick((x) => x + 1);
  }, inView && !still);

  const now = Math.floor(t.current / RUN_T);
  const within = Math.min(STAGES.length, (t.current - now * RUN_T) / STEP);
  const rows = Array.from({ length: SHOWN }, (_, i) => now - SHOWN + 1 + i).map((k) => {
    const idx = ((k % runs.length) + runs.length) % runs.length;
    return { k, run: runs[idx], progress: k === now ? within : STAGES.length };
  });
  const finished = rows.filter((x) => x.progress >= STAGES.length || (x.run.failAt >= 0 && x.progress >= x.run.failAt + 1));
  const caught = finished.filter((x) => x.run.failAt >= 0 && x.run.failAt < STAGES.length - 1).length;
  const shipped = finished.filter((x) => x.run.failAt < 0 || x.run.failAt === STAGES.length - 1).length;

  return (
    <div ref={outer}>
      <div className="se-pipe" role="img" aria-label="커밋이 설치, 빌드, 테스트, 배포, 관찰 다섯 단계를 차례로 지나는 파이프라인 애니메이션. 대부분은 끝까지 초록으로 통과하고, 일부는 테스트에서 걸리거나 배포 뒤 관찰 단계에서 문제가 보여 롤백됩니다.">
        <div className="se-pipe-head">커밋</div>
        {STAGES.map((s) => (
          <div key={s} className="se-pipe-head">
            {s}
          </div>
        ))}
        {rows.map(({ k, run, progress }) => (
          <div key={k} style={{ display: 'contents' }}>
            <div className="se-pipe-commit">{run.msg}</div>
            {STAGES.map((_, s) => {
              const st = cell(run, s, progress);
              return (
                <div key={s} className="se-pipe-cell" data-s={st}>
                  {label(s, st)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="hero-figure-cap">
        내보내기 전에 걸러진 커밋 <strong style={{ color: 'var(--bad)' }}>{caught}개</strong> · 사용자에게 간 커밋 <strong style={{ color: 'var(--good)' }}>{shipped}개</strong>
      </div>
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-se-1)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-se-1)' }}>
            {course.title} · {course.subtitle}
          </div>
          <h1 className="hero-title">
            내 컴퓨터에서 되는 코드와
            <br />
            <em>서비스</em> 사이에는
            <br />
            긴 길이 있습니다.
          </h1>
          <p className="hero-lede">
            그림은 커밋이 설치, 빌드, 테스트, 배포, 관찰을 차례로 지나는 모습입니다. 대부분은 그대로 사용자에게 가고, 몇 개는 중간에 걸러지거나 되돌려집니다. 이 과목에서는 이 길의 각 구간을 {course.lessons.length}개의 장에 걸쳐 하나씩 따라갑니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'http-api')}>
              HTTP API 설계 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <PipelineHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>도구보다 원리</h3>
          <p>npm, Gradle, GitHub Actions 같은 도구는 몇 년마다 바뀌지만, 범위로 버전을 고르고 그래프로 빌드하고 단계별로 걸러 내는 원리는 그대로입니다. 장마다 원리를 먼저 보고 실제 도구를 함께 소개합니다.</p>
        </div>
        <div>
          <h3>브라우저 안의 작은 모형</h3>
          <p>패키지 설치 도구, 빌드 도구, API 서버, 배포 과정을 브라우저 안의 작은 모형으로 직접 돌려 봅니다. 무작위가 들어가는 시뮬레이션은 씨앗이 정해진 난수를 써서 다시 해도 같은 결과가 나옵니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            함수와 객체를 JavaScript로 짤 수 있으면 충분합니다. 필요하면 <a href="#cs-programming">프로그래밍 입문</a>을 먼저 보세요. 이 과목 다음에는 Spring Boot 같은 프레임워크를 다루는 과목으로 이어집니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림과 코드 실행은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
