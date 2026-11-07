import { useRef, useState } from 'react';
import { CourseMap } from '../../../components/CourseMap';
import { prefersReducedMotion, useAnimationFrame, useInView } from '../../../lib/canvas';
import { lessonHref } from '../../index';
import course from './course';
import '../../../styles/cover.css';
import './lessons/backend.css';

/* ─────────────── Hero: requests travel down the layers of a server and back ─────────────── */

const LAYERS = [
  { name: '필터 체인', sub: 'Filter' },
  { name: '디스패처', sub: 'DispatcherServlet' },
  { name: '컨트롤러', sub: '@RestController' },
  { name: '서비스', sub: '@Service · @Transactional' },
  { name: '리포지토리', sub: '@Repository' },
  { name: '데이터베이스', sub: 'SQL' },
];

/** Each request goes down to `stop` (a layer index) and comes back up with `status`. */
const REQUESTS = [
  { line: 'GET /todos', stop: 5, status: 200, why: '' },
  { line: 'POST /todos  {title:""}', stop: 2, status: 400, why: '컨트롤러에서 입력 검증 실패' },
  { line: 'GET /todos/42', stop: 5, status: 404, why: '서비스가 없는 할 일을 알아챔' },
  { line: 'DELETE /todos/7', stop: 0, status: 401, why: '로그인하지 않아 필터가 막음' },
  { line: 'POST /todos  {title:"장보기"}', stop: 5, status: 201, why: '' },
];
const HOP = 0.32; // seconds per layer
const REST = 0.9; // pause after a response
const dur = (r: (typeof REQUESTS)[number]) => (2 * r.stop + 1) * HOP + REST;
const STARTS = REQUESTS.reduce<number[]>((acc, r, i) => [...acc, i ? acc[i - 1] + dur(REQUESTS[i - 1]) : 0], []);
const LOOP = STARTS[STARTS.length - 1] + dur(REQUESTS[REQUESTS.length - 1]);

function RequestHero() {
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const t = useRef(still ? STARTS[2] + 5 * HOP : 0);
  const [, setTick] = useState(0);
  useAnimationFrame((dt) => {
    t.current = (t.current + dt) % LOOP;
    setTick((x) => x + 1);
  }, inView && !still);

  let k = REQUESTS.length - 1;
  while (STARTS[k] > t.current) k--;
  const req = REQUESTS[k];
  const hop = Math.floor((t.current - STARTS[k]) / HOP); // 0 .. 2*stop, then resting
  const done = hop > 2 * req.stop;
  const at = done ? -1 : hop <= req.stop ? hop : 2 * req.stop - hop;
  const down = hop < req.stop;
  const ok = req.status < 400;

  return (
    <div ref={outer}>
      <div className="be-stack" role="img" aria-label="요청이 필터 체인, 디스패처, 컨트롤러, 서비스, 리포지토리, 데이터베이스 층을 차례로 내려갔다가 응답이 되어 다시 올라오는 애니메이션. 어떤 요청은 필터나 컨트롤러에서 막혀 일찍 돌아옵니다.">
        <div className="be-layers">
          {LAYERS.map((l, i) => (
            <div key={l.name} className="be-layer" data-on={i === at || undefined} data-stop={(i === req.stop && !ok && (at === i || done)) || undefined}>
              {l.name}
              <small>{l.sub}</small>
              {i === at && <span className="be-layer-dir">{down ? '↓' : '↑'}</span>}
            </div>
          ))}
        </div>
        <ol className="be-log">
          {REQUESTS.map((r, i) => {
            const shown = i < k || (i === k && done);
            return (
              <li key={i} data-now={i === k || undefined}>
                <span>{r.line}</span>
                <span className="st" data-ok={(shown && r.status < 400) || undefined} data-bad={(shown && r.status >= 400) || undefined}>
                  {i === k && !done ? '…' : shown ? r.status : ''}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="hero-figure-cap">
        <strong>{req.line.split('  ')[0]}</strong> · {done ? `${req.status} 응답${req.why ? ` (${req.why})` : ''}` : at >= 0 ? `${LAYERS[at].name}${down ? ' 지나는 중' : '에서 돌아오는 중'}` : ''}
      </div>
    </div>
  );
}

export default function Cover() {
  const start = course.lessons[0];
  return (
    <div className="home" style={{ ['--part-color' as string]: 'var(--c-se-2)' }}>
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow" style={{ color: 'var(--c-se-2)' }}>
            {course.title} · {course.subtitle}
          </div>
          <h1 className="hero-title">
            프레임워크는
            <br />
            <em>내 코드를 부르는</em>
            <br />
            코드입니다.
          </h1>
          <p className="hero-lede">
            그림은 요청 하나가 서버의 여러 층을 내려갔다가 응답이 되어 올라오는 모습입니다. 내가 쓰는 것은 컨트롤러와 서비스 몇 줄이고, 나머지 층은 프레임워크가 맡습니다. 이 과목에서는 그 층들이 무슨 일을 하는지 {course.lessons.length}개의 장에 걸쳐 직접 만들어 보며 배웁니다.
          </p>
          <div className="btn-row">
            <a className="btn primary" href={lessonHref(course.id, start.id)}>
              처음부터 시작하기
            </a>
            <a className="btn" href={lessonHref(course.id, 'orm')}>
              ORM과 N+1 문제 열기
            </a>
          </div>
        </div>
        <div className="hero-figure">
          <RequestHero />
        </div>
      </section>

      <section className="howto" aria-label="읽는 법">
        <div>
          <h3>마법을 풀어 보기</h3>
          <p>어노테이션 하나로 일어나는 일은 마법처럼 보입니다. 장마다 그 뒤에서 도는 컨테이너, 프록시, 라우터, 쿼리 기록기를 브라우저 안에서 작게 만들어 직접 돌려 봅니다.</p>
        </div>
        <div>
          <h3>Spring Boot와 나란히</h3>
          <p>원리는 프레임워크에 묶이지 않게 설명하고, 같은 개념이 Spring Boot에서는 어떤 코드가 되는지 Java 예제로 함께 보여 줍니다. NestJS나 Django를 써도 대부분 그대로 통합니다.</p>
        </div>
        <div>
          <h3>먼저 볼 과목</h3>
          <p>
            <a href="#se-basics">기초 소프트웨어공학</a>의 HTTP API 장과 <a href="#cs-databases">데이터베이스</a>의 SQL, 트랜잭션 장을 먼저 보면 좋습니다. Java 문법은 예제를 읽을 수 있을 정도면 충분합니다.
          </p>
        </div>
      </section>

      <CourseMap course={course} />
      <footer className="home-foot">모든 그림과 코드 실행은 브라우저 안에서 직접 계산됩니다. 서버로 전송되는 데이터는 없습니다.</footer>
    </div>
  );
}
