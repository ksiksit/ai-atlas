import { Suspense, useEffect, useState, type CSSProperties } from 'react';
import { DEFAULT_COURSE, courseHref, lessonHref, lessonIndex, lessonNo, parseRoute, partOf, type Course, type Lesson, type Route } from './courses';
import { loadThemeMode, setThemeMode, type ThemeMode } from './lib/theme';

function readRoute(): Route {
  let hash = window.location.hash.replace(/^#/, '');
  try {
    hash = decodeURIComponent(hash);
  } catch {
    /* keep the raw hash */
  }
  const r = parseRoute(hash);
  if (r.kind !== 'redirect') return r;
  // Rewrite old links (#vectors → #ai/vectors) without adding a history entry.
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

function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(loadThemeMode);
  useEffect(() => setThemeMode(mode), [mode]);
  const opts: [ThemeMode, string][] = [
    ['system', '자동'],
    ['light', '밝게'],
    ['dark', '어둡게'],
  ];
  return (
    <div className="theme-toggle" role="group" aria-label="화면 테마">
      {opts.map(([m, l]) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function BrandMark({ course, inline = false }: { course: Course; inline?: boolean }) {
  if (!course.mark) return <span className="brand-mark">{course.title}</span>;
  const [a, b] = course.mark;
  return (
    <span className="brand-mark">
      {a}
      <span className="arrow">→</span>
      {!inline && <br />}
      {b}
    </span>
  );
}

function Rail({ course, current, open, onNavigate }: { course: Course; current?: string; open: boolean; onNavigate: () => void }) {
  return (
    <nav className="rail" data-open={open} aria-label="목차">
      <a className="brand" href={courseHref(course.id)} onClick={onNavigate}>
        <BrandMark course={course} />
        <span className="brand-sub">{course.tagline}</span>
      </a>
      {course.parts.map((p) => (
        <div className="rail-part" key={p.id} style={{ ['--part-color' as string]: p.color } as CSSProperties}>
          <div className="rail-part-title">
            <span className="dot" />
            {p.title}
          </div>
          {course.lessons.filter((l) => l.part === p.id).map((l) => (
            <a key={l.id} className="rail-link" href={lessonHref(course.id, l.id)} aria-current={current === l.id ? 'page' : undefined} onClick={onNavigate}>
              <span className="num">{lessonNo(course, l)}</span>
              <span>{l.title}</span>
            </a>
          ))}
        </div>
      ))}
      <div className="rail-foot">
        <ThemeToggle />
      </div>
    </nav>
  );
}

function LessonPage({ course, lesson }: { course: Course; lesson: Lesson }) {
  const part = partOf(course, lesson.part);
  const i = lessonIndex(course, lesson.id);
  const prev = course.lessons[i - 1];
  const next = course.lessons[i + 1];
  const C = lesson.Component;
  return (
    <article className="lesson" style={{ ['--part-color' as string]: part.color } as CSSProperties}>
      <header className="lesson-head">
        <div className="eyebrow">
          {part.title} · {Number(lessonNo(course, lesson))}장
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
        ) : (
          <a className="next" href={courseHref(course.id)}>
            <span className="dir">끝까지 왔습니다 →</span>
            <span className="ttl">전체 지도로</span>
          </a>
        )}
      </nav>
    </article>
  );
}

function NotFound({ course }: { course: Course }) {
  return (
    <article className="lesson">
      <header className="lesson-head">
        <h1 className="lesson-title">페이지를 찾을 수 없습니다</h1>
        <p className="lesson-lede">주소가 바뀌었거나 없는 장입니다.</p>
      </header>
      <nav className="pager" aria-label="돌아가기">
        <a href={courseHref(course.id)}>
          <span className="dir">← 처음으로</span>
          <span className="ttl">{course.title}</span>
        </a>
      </nav>
    </article>
  );
}

export default function App() {
  const route = useRoute();
  const [open, setOpen] = useState(false);
  // Until there is a course picker, the site root shows the default course.
  const course = route.kind === 'course' || route.kind === 'lesson' ? route.course : DEFAULT_COURSE;
  const lesson = route.kind === 'lesson' ? route.lesson : undefined;
  const Cover = course.Cover;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setOpen(false);
    document.title = lesson ? `${lesson.title} · ${course.title}` : course.title;
  }, [route, course, lesson]);

  return (
    <div className="shell">
      <Rail course={course} current={lesson?.id} open={open} onNavigate={() => setOpen(false)} />
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <button className="menu-btn" type="button" aria-label="목차 열기" onClick={() => setOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            </svg>
          </button>
          <a className="brand" href={courseHref(course.id)} style={{ flexDirection: 'row' }}>
            <BrandMark course={course} inline />
          </a>
        </header>
        <main className="main">
          {lesson ? (
            <LessonPage key={course.id + '/' + lesson.id} course={course} lesson={lesson} />
          ) : route.kind === 'missing' ? (
            <NotFound course={course} />
          ) : (
            <Suspense fallback={<div className="loading">불러오는 중…</div>}>
              <Cover key={course.id} />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}
