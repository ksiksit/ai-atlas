import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { COURSES, LEVELS, LIBRARY_HREF, SUBJECTS, courseHref, coursesOf, lessonHref, lessonIndex, lessonNo, lessonNumber, parseRoute, partOf, subjectOf, type Course, type Lesson, type Route } from './courses';
import { markDone, markVisited, useProgress } from './lib/progress';
import { ThemeToggle } from './components/ThemeToggle';
import Library from './pages/Library';
import { SITE } from './site';

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
  const progress = useProgress();
  const done = new Set(progress[course.id]?.done ?? []);
  return (
    <>
      <a className="rail-back" href={LIBRARY_HREF} onClick={onNavigate}>
        ← 모든 과목
      </a>
      <a className="brand" href={courseHref(course.id)} onClick={onNavigate}>
        <span className="brand-mark">{course.title}</span>
        <span className="brand-sub">
          {subjectOf(course).name} · {LEVELS[course.level].name} · {course.subtitle}
        </span>
      </a>
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
                <span>
                  {l.title}
                  {done.has(l.id) && (
                    <span className="done-mark" role="img" aria-label="완료">
                      ✓
                    </span>
                  )}
                </span>
              </a>
            ))}
        </div>
      ))}
    </>
  );
}

/** Rail on the library page: the site name and every course, grouped by subject. */
function LibraryRail({ onNavigate }: { onNavigate: () => void }) {
  const progress = useProgress();
  return (
    <>
      <a className="brand" href={LIBRARY_HREF} onClick={onNavigate}>
        <span className="brand-mark">{SITE.name}</span>
        <span className="brand-sub">{SITE.tagline}</span>
      </a>
      {SUBJECTS.map((s) => (
        <div className="rail-part" key={s.id} style={{ ['--part-color' as string]: s.color } as CSSProperties}>
          <div className="rail-part-title">{s.name}</div>
          {coursesOf(s).map((c) => {
            const n = c.lessons.filter((l) => progress[c.id]?.done.includes(l.id)).length;
            return (
              <a key={c.id} className="rail-link" href={courseHref(c.id)} onClick={onNavigate}>
                <span className="num" title={`난이도: ${LEVELS[c.level].name}`}>
                  <span className="level-dots" aria-hidden="true">
                    {[1, 2, 3].map((i) => (
                      <i key={i} data-on={i <= c.level || undefined} />
                    ))}
                  </span>
                </span>
                <span>
                  {c.title}
                  <span className="visually-hidden"> (난이도 {LEVELS[c.level].name})</span>
                  <span className="en"> · {n ? `${n}/${c.lessons.length}장` : `${c.lessons.length}장`}</span>
                </span>
              </a>
            );
          })}
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
  const pagerRef = useRef<HTMLElement>(null);

  // Remember the lesson as "last opened", and as read once the reader reaches the pager.
  useEffect(() => {
    markVisited(course.id, lesson.id);
    const el = pagerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        markDone(course.id, lesson.id);
        io.disconnect();
      }
    });
    // Wait for the lazy lesson body to render so the pager starts below the fold.
    const t = window.setTimeout(() => io.observe(el), 800);
    return () => {
      window.clearTimeout(t);
      io.disconnect();
    };
  }, [course.id, lesson.id]);

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
      <nav className="pager" aria-label="이전·다음 장" ref={pagerRef}>
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
            <span className="ttl">다른 과목 둘러보기</span>
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
  const close = () => setOpen(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setOpen(false);
    document.title = lesson ? `${lesson.title} · ${course!.title}` : course ? `${course.title} · ${SITE.name}` : SITE.name;
  }, [route, course, lesson]);

  let page;
  if (route.kind === 'lesson') page = <LessonPage key={route.course.id + '/' + route.lesson.id} course={route.course} lesson={route.lesson} />;
  else if (route.kind === 'course') {
    const Cover = route.course.Cover;
    page = (
      <Suspense fallback={<div className="loading">불러오는 중…</div>}>
        <Cover key={route.course.id} />
      </Suspense>
    );
  } else if (route.kind === 'library') page = <Library />;
  else page = <NotFound course={course} />;

  return (
    <div className="shell">
      <nav className="rail" data-open={open} aria-label={course ? '목차' : '과목'}>
        {course ? <CourseRail course={course} current={lesson?.id} onNavigate={close} /> : <LibraryRail onNavigate={close} />}
        <div className="rail-foot">
          <ThemeToggle />
        </div>
      </nav>
      {open && <div className="scrim" onClick={close} />}
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <button className="menu-btn" type="button" aria-label={course ? '목차 열기' : '과목 목록 열기'} onClick={() => setOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            </svg>
          </button>
          <a className="brand" href={course ? courseHref(course.id) : LIBRARY_HREF} style={{ flexDirection: 'row' }}>
            <span className="brand-mark">{course ? course.title : SITE.name}</span>
          </a>
        </header>
        <main className="main">{page}</main>
      </div>
    </div>
  );
}
