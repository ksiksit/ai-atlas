import { useMemo, useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useInView } from '../../../lib/canvas';
import { lessonHref } from '../../index';
import course from './course';
import { trace } from './lessons/trace';
import { CodeView, MemoryView, OutputView } from './lessons/TraceView';
import '../../../styles/cover.css';
import './lessons/programming.css';

/* ─────────────── Hero: a short program running line by line ─────────────── */

const HERO_SRC = `
const prices = [1200, 3500, 800]; @@a
let total = 0; @@t
for (const p of prices) { @@for
  total = total + p; @@body
}
console.log(total + '원'); @@log
`;

const STEP_SEC = 1.15;
const HOLD_SEC = 3;

function buildHero() {
  return trace(HERO_SRC, (t) => {
    const prices = [1200, 3500, 800];
    t.def('prices', prices);
    t.step('a', '배열을 만들어 prices에 담습니다.');
    let total = t.def('total', 0) as number;
    t.step('t', 'total을 0에서 시작합니다.');
    for (const p of prices) {
      t.def('p', p);
      t.step('for', `p에 다음 가격 ${p}을 꺼냅니다.`, `p = ${p}`);
      total = t.set('total', total + p) as number;
      t.step('body', `total = ${total - p} + ${p} = ${total}`);
    }
    t.drop('p');
    t.log(total + '원');
    t.step('log', `합계 ${total}원을 출력합니다.`);
  });
}

function TraceHero() {
  const program = useMemo(buildHero, []);
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const last = program.snaps.length - 1;
  const [i, setI] = useState(still ? last : 1);
  const acc = useRef(0);

  useAnimationFrame((dt) => {
    acc.current += dt;
    const wait = i >= last ? HOLD_SEC : STEP_SEC;
    if (acc.current < wait) return;
    acc.current = 0;
    setI((x) => (x >= last ? 1 : x + 1));
  }, inView && !still);

  const snap = program.snaps[i];
  return (
    <div ref={outer} className="cover-trace" role="group" aria-label="짧은 프로그램이 한 줄씩 실행되며 변수 total이 1200, 4700, 5500으로 바뀌는 애니메이션">
      <div className="tr-main" data-heap>
        <CodeView lines={program.lines} cur={snap.line} ann={snap.ann} label="장바구니 합계를 구하는 짧은 프로그램" />
        <MemoryView snap={snap} heapCol={program.hasHeap} />
      </div>
      <div className="note-line" aria-live="off">
        <span className="tr-note-ln">{snap.line + 1}번 줄</span>
        {snap.note}
      </div>
      <OutputView out={snap.out} />
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-cs-1)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-cs-1)' }}>
            {course.title} · {course.subtitle}
          </div>
          <h1 className="hero-title">
            코드는
            <br />
            <em>한 줄씩</em>
            <br />
            실행됩니다.
          </h1>
          <p className="hero-lede">
            프로그램은 컴퓨터에게 시킬 일을 순서대로 적은 글입니다. 컴퓨터는 그 글을 한 줄씩 읽으며 변수에 값을 담고, 바꾸고, 같은 줄을 되풀이합니다. 코드를 처음 쓰는 사람을 위해 값과 변수에서 함수, 배열, 재귀, 테스트까지 {course.lessons.length}개의 장에서 JavaScript 코드가 실행되는 모습을 눈으로 따라가고, 직접 고쳐 실행해 봅니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'recursion')}>
              재귀 호출 스택 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <TraceHero />
          <div className="hero-figure-cap">노란 줄이 방금 실행한 줄 · 아래는 그 순간의 변수와 배열</div>
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>실행을 눈으로 따라가기</h3>
          <p>장마다 짧은 프로그램을 한 줄씩 앞뒤로 넘기며 변수, 호출 스택, 배열과 객체가 어떻게 바뀌는지 봅니다. 그림 속 기록은 실제로 코드를 실행하며 남긴 것입니다.</p>
        </div>
        <div>
          <h3>직접 고쳐 실행하기</h3>
          <p>"직접 실행" 상자에서 코드를 고치고 테스트를 돌려 보세요. 코드는 페이지와 분리된 곳에서 돌아가므로, 끝나지 않는 반복을 만들어도 1초 뒤 안전하게 멈춥니다.</p>
        </div>
        <div>
          <h3>다음 과목으로</h3>
          <p>
            이 과목은 컴퓨터과학 전공의 첫 과목입니다. 마치면 같은 JavaScript로 <a href={lessonHref('cs-algorithms', 'complexity')}>기초 알고리즘</a>과 <a href={lessonHref('cs-architecture', 'binary')}>컴퓨터 구조</a>로 넘어갈 수 있습니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림과 코드 실행은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
