import { Fragment, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { COURSES, LEVELS, LIBRARY_HREF, courseCode, courseHref, lessonHref, lessonIndex, lessonNo, lessonNumber, majorHref, majorsOf, parseRoute, partOf, type Course, type Lesson, type Major, type Route } from './courses';
import { ThemeToggle } from './components/ThemeToggle';
import Home from './pages/Home';
import MajorPage from './pages/MajorPage';
import { SITE } from './site';

// Earlier versions kept reading progress and a view choice in this browser; nothing reads them now.
try {
  localStorage.removeItem('atlas-progress');
  localStorage.removeItem('atlas-library-view');
} catch {
  /* storage unavailable */
}

function readRoute(): Route {
  let hash = window.location.hash.replace(/^#/, '');
  try {
    hash = decodeURIComponent(hash);
  } catch {
    /* keep the raw hash */
  }
  const r = parseRoute(hash);
  if (r.kind !== 'redirect') return r;
  // Rewrite old links (#vectors → #ai-basics/vectors) without adding a history entry.
  history.replaceState(null, '', r.to);
  return parseRoute(r.to.slice(1));
}

function useRoute(): Route {
  const [r, setR] = useState(readRoute);
  useEffect(() => {
    const on = () => setR(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

/** Where you are, as links back up: 아틀라스 › 과목 › 장 (or › 전공). The middle steps fold away on phones. */
function Crumbs({ course, lesson, major }: { course?: Course; lesson?: Lesson; major?: Major }) {
  const steps: { label: ReactNode; href?: string }[] = [];
  if (major) steps.push({ label: major.name });
  if (course) {
    const label = (
      <>
        <span className="crumb-code">{courseCode(course)}</span>
        {course.title}
      </>
    );
    steps.push(lesson ? { label, href: courseHref(course.id) } : { label });
  }
  if (course && lesson)
    steps.push({
      label: (
        <>
          <span className="no">{lessonNo(course, lesson)}</span>
          {lesson.title}
        </>
      ),
    });
  return (
    <nav className="crumbs" aria-label="현재 위치">
      <a className="brand" href={LIBRARY_HREF} aria-current={steps.length ? undefined : 'page'}>
        {SITE.name}
      </a>
      {!steps.length && <span className="tagline">{SITE.tagline}</span>}
      {steps.map((st, i) => {
        const last = i === steps.length - 1;
        return (
          <Fragment key={i}>
            <span className={'sep' + (last ? '' : ' mid')} aria-hidden="true">
              ›
            </span>
            {last ? (
              <span className="here" aria-current="page">
                {st.label}
              </span>
            ) : (
              <a className="mid" href={st.href}>
                {st.label}
              </a>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

/** The course's table of contents, dropped down from the top bar. */
function Toc({ course, current, open, setOpen }: { course: Course; current?: string; open: boolean; setOpen: (v: boolean) => void }) {
  const majors = majorsOf(course.id);
  const boxRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const at = current ? lessonIndex(course, current) : -1;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      btnRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, setOpen]);

  return (
    <>
      <button ref={btnRef} className="bar-btn" type="button" aria-expanded={open} aria-controls="toc" onClick={() => setOpen(!open)} aria-label={at >= 0 ? `목차, ${course.lessons.length}개 장 중 ${at + 1}번째` : '목차'}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        </svg>
        <span className="label">목차</span>
        {at >= 0 && (
          <span className="pos">
            {at + 1}/{course.lessons.length}
          </span>
        )}
      </button>
      {open && (
        <div ref={boxRef} className="toc" id="toc">
          <div className="toc-head">
            <a href={courseHref(course.id)}>{course.title}</a>
            <span>
              {courseCode(course)} · {LEVELS[course.level].name} · {course.subtitle}
            </span>
          </div>
          {course.parts.map((p) => (
            <div className="toc-part" key={p.id} style={{ ['--part-color' as string]: p.color } as CSSProperties}>
              <div className="toc-part-title">{p.title}</div>
              {course.lessons
                .filter((l) => l.part === p.id)
                .map((l) => (
                  <a key={l.id} href={lessonHref(course.id, l.id)} aria-current={current === l.id ? 'page' : undefined}>
                    <span className="num">{lessonNo(course, l)}</span>
                    <span>{l.title}</span>
                  </a>
                ))}
            </div>
          ))}
          {majors.length > 0 && (
            <p className="toc-foot">
              이 과목을 쓰는 전공 ·{' '}
              {majors.map((m, i) => (
                <Fragment key={m.id}>
                  {i > 0 && ', '}
                  <a href={majorHref(m.id)}>{m.name}</a>
                </Fragment>
              ))}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function LessonPage({ course, lesson }: { course: Course; lesson: Lesson }) {
  const part = partOf(course, lesson.part);
  const i = lessonIndex(course, lesson.id);
  const prev = course.lessons[i - 1];
  const next = course.lessons[i + 1];
  // after the last lesson, point to a course that lists this one as its prerequisite
  const nextCourse = next ? undefined : COURSES.find((c) => c.prerequisites?.includes(course.id));
  const C = lesson.Component;

  return (
    <article className="lesson" style={{ ['--part-color' as string]: part.color } as CSSProperties}>
      <header className="lesson-head">
        <div className="eyebrow">
          {part.title} · {lessonNumber(course, lesson)}장
        </div>
        <h1 className="lesson-title">{lesson.title}</h1>
        <p className="lesson-lede">{lesson.lede}</p>
        <section className="learn-box" aria-labelledby="learn-title">
          <h2 id="learn-title" className="learn-box-title">
            이 장에서 배우는 것
          </h2>
          <ol className="learn-list">
            {lesson.learn.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
        </section>
      </header>
      <Suspense fallback={<div className="loading">불러오는 중…</div>}>
        <C />
      </Suspense>
      <nav className="pager" aria-label="이전·다음 장">
        {prev ? (
          <a href={lessonHref(course.id, prev.id)}>
            <span className="dir">← 이전</span>
            <span className="ttl">{prev.title}</span>
          </a>
        ) : (
          <a href={courseHref(course.id)}>
            <span className="dir">← 처음으로</span>
            <span className="ttl">전체 지도</span>
          </a>
        )}
        {next ? (
          <a className="next" href={lessonHref(course.id, next.id)}>
            <span className="dir">다음 →</span>
            <span className="ttl">{next.title}</span>
          </a>
        ) : nextCourse ? (
          <a className="next" href={courseHref(nextCourse.id)}>
            <span className="dir">다음 과목 · {LEVELS[nextCourse.level].name} →</span>
            <span className="ttl">{nextCourse.title}</span>
          </a>
        ) : (
          <a className="next" href={LIBRARY_HREF}>
            <span className="dir">끝까지 왔습니다 →</span>
            <span className="ttl">다른 전공 둘러보기</span>
          </a>
        )}
      </nav>
    </article>
  );
}

function NotFound({ course }: { course?: Course }) {
  return (
    <article className="lesson">
      <header className="lesson-head">
        <h1 className="lesson-title">페이지를 찾을 수 없습니다</h1>
        <p className="lesson-lede">주소가 바뀌었거나 없는 장입니다.</p>
      </header>
      <nav className="pager" aria-label="돌아가기">
        <a href={course ? courseHref(course.id) : LIBRARY_HREF}>
          <span className="dir">← 처음으로</span>
          <span className="ttl">{course ? course.title : SITE.name}</span>
        </a>
      </nav>
    </article>
  );
}

export default function App() {
  const route = useRoute();
  const [tocOpen, setTocOpen] = useState(false);
  const course = route.kind === 'course' || route.kind === 'lesson' || route.kind === 'missing' ? route.course : undefined;
  const lesson = route.kind === 'lesson' ? route.lesson : undefined;
  const major = route.kind === 'major' ? route.major : undefined;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setTocOpen(false);
    document.title = lesson ? `${lesson.title} · ${course!.title}` : course ? `${course.title} · ${SITE.name}` : major ? `${major.name} · ${SITE.name}` : SITE.name;
  }, [route, course, lesson, major]);

  let page;
  if (route.kind === 'lesson') page = <LessonPage key={route.course.id + '/' + route.lesson.id} course={route.course} lesson={route.lesson} />;
  else if (route.kind === 'course') {
    const Cover = route.course.Cover;
    page = (
      <Suspense fallback={<div className="loading">불러오는 중…</div>}>
        <Cover key={route.course.id} />
      </Suspense>
    );
  } else if (route.kind === 'major') page = <MajorPage key={route.major.id} major={route.major} />;
  else if (route.kind === 'library') page = <Home />;
  else page = <NotFound course={course} />;

  return (
    <>
      <header className="bar">
        <div className="bar-in">
          <Crumbs course={course} lesson={lesson} major={major} />
          <div className="bar-tools">
            {course && <Toc course={course} current={lesson?.id} open={tocOpen} setOpen={setTocOpen} />}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="main">{page}</main>
    </>
  );
}
