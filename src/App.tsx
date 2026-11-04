import { Suspense, useEffect, useState, type CSSProperties } from 'react';
import { COURSES, LEVELS, LIBRARY_HREF, MAJORS, SUBJECTS, courseCode, courseHref, coursesOf, lessonHref, lessonIndex, lessonNo, lessonNumber, majorHref, majorsOf, parseRoute, partOf, type Course, type Lesson, type Major, type Route } from './courses';
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

/** Table of contents for one course. */
function CourseRail({ course, current, onNavigate }: { course: Course; current?: string; onNavigate: () => void }) {
  const majors = majorsOf(course.id);
  return (
    <>
      <a className="rail-back" href={LIBRARY_HREF} onClick={onNavigate}>
        ← 전공 안내
      </a>
      <a className="brand" href={courseHref(course.id)} onClick={onNavigate}>
        <span className="brand-mark">{course.title}</span>
        <span className="brand-sub">
          {courseCode(course)} · {LEVELS[course.level].name} · {course.subtitle}
        </span>
      </a>
      {majors.length > 0 && (
        <p className="rail-majors">
          {majors.map((m, i) => (
            <span key={m.id}>
              {i > 0 && ' · '}
              <a href={majorHref(m.id)} onClick={onNavigate}>
                {m.name}
              </a>
            </span>
          ))}
        </p>
      )}
      {course.parts.map((p) => (
        <div className="rail-part" key={p.id} style={{ ['--part-color' as string]: p.color } as CSSProperties}>
          <div className="rail-part-title">
            <span className="dot" />
            {p.title}
          </div>
          {course.lessons
            .filter((l) => l.part === p.id)
            .map((l) => (
              <a key={l.id} className="rail-link" href={lessonHref(course.id, l.id)} aria-current={current === l.id ? 'page' : undefined} onClick={onNavigate}>
                <span className="num">{lessonNo(course, l)}</span>
                <span>{l.title}</span>
              </a>
            ))}
        </div>
      ))}
    </>
  );
}

/** Rail on the home and major pages: the majors, then every course by subject. */
function LibraryRail({ major, onNavigate }: { major?: Major; onNavigate: () => void }) {
  return (
    <>
      <a className="brand" href={LIBRARY_HREF} onClick={onNavigate}>
        <span className="brand-mark">{SITE.name}</span>
        <span className="brand-sub">{SITE.tagline}</span>
      </a>
      <div className="rail-part">
        <div className="rail-part-title">전공</div>
        {MAJORS.map((m) => (
          <a key={m.id} className="rail-link rail-major" href={majorHref(m.id)} aria-current={major?.id === m.id ? 'page' : undefined} onClick={onNavigate}>
            {m.name}
          </a>
        ))}
      </div>
      {SUBJECTS.map((s) => (
        <div className="rail-part" key={s.id} style={{ ['--part-color' as string]: s.color } as CSSProperties}>
          <div className="rail-part-title">{s.name}</div>
          {coursesOf(s).map((c) => (
            <a key={c.id} className="rail-link" href={courseHref(c.id)} onClick={onNavigate}>
              <span className="num">{courseCode(c).split(' ')[1]}</span>
              <span>{c.title}</span>
            </a>
          ))}
        </div>
      ))}
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
  const [open, setOpen] = useState(false);
  const course = route.kind === 'course' || route.kind === 'lesson' || route.kind === 'missing' ? route.course : undefined;
  const lesson = route.kind === 'lesson' ? route.lesson : undefined;
  const major = route.kind === 'major' ? route.major : undefined;
  const close = () => setOpen(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setOpen(false);
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
    <div className="shell">
      <nav className="rail" data-open={open} aria-label={course ? '목차' : '전공과 과목'}>
        {course ? <CourseRail course={course} current={lesson?.id} onNavigate={close} /> : <LibraryRail major={major} onNavigate={close} />}
        <div className="rail-foot">
          <ThemeToggle />
        </div>
      </nav>
      {open && <div className="scrim" onClick={close} />}
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <button className="menu-btn" type="button" aria-label={course ? '목차 열기' : '전공과 과목 목록 열기'} onClick={() => setOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            </svg>
          </button>
          <a className="brand" href={course ? courseHref(course.id) : major ? majorHref(major.id) : LIBRARY_HREF} style={{ flexDirection: 'row' }}>
            <span className="brand-mark">{course ? course.title : major ? major.name : SITE.name}</span>
          </a>
        </header>
        <main className="main">{page}</main>
      </div>
    </div>
  );
}
