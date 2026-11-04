import { useState, type CSSProperties } from 'react';
import { LevelBadge } from '../components/LevelBadge';
import { Seg } from '../components/ui';
import { COURSES, LEVELS, SUBJECTS, courseHref, coursesOf, findCourse, lessonHref, lessonNo, type Course, type Level } from '../courses';
import { useProgress, type CourseProgress } from '../lib/progress';
import { SITE } from '../site';
import LibraryMap from './library/LibraryMap';
import LibrarySearch, { type SearchHit } from './library/LibrarySearch';
import '../styles/cover.css';
import '../styles/library.css';

function CourseCard({ course, progress }: { course: Course; progress?: CourseProgress }) {
  const total = course.lessons.length;
  const done = new Set(progress?.done ?? []);
  const doneCount = course.lessons.filter((l) => done.has(l.id)).length;
  const last = course.lessons.find((l) => l.id === progress?.last);
  const next = last ?? course.lessons[0];
  const prereqs = (course.prerequisites ?? []).map(findCourse).filter((c): c is Course => !!c);
  return (
    <article className="shelf-card">
      <div className="shelf-top">
        <LevelBadge level={course.level} />
        <span className="shelf-count">{total}장</span>
      </div>
      <h3 className="shelf-title">
        <a href={courseHref(course.id)}>{course.title}</a>
      </h3>
      <p className="shelf-subtitle">{course.subtitle}</p>
      <p className="shelf-blurb">{course.blurb}</p>
      {prereqs.length > 0 && (
        <p className="shelf-prereq">
          먼저 볼 과목:{' '}
          {prereqs.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ', '}
              <a href={courseHref(p.id)}>{p.title}</a>
            </span>
          ))}
        </p>
      )}
      <ul className="shelf-parts">
        {course.parts.map((p) => (
          <li key={p.id} style={{ ['--part-color' as string]: p.color } as CSSProperties}>
            {p.title}
            <span className="mono">{course.lessons.filter((l) => l.part === p.id).length}</span>
          </li>
        ))}
      </ul>
      <div className="shelf-strip" role="list" aria-label={`${course.title} 진도: ${total}장 중 ${doneCount}장 완료`}>
        {course.lessons.map((l) => (
          <a
            key={l.id}
            role="listitem"
            href={lessonHref(course.id, l.id)}
            title={`${lessonNo(course, l)} ${l.title}${done.has(l.id) ? ' (완료)' : ''}`}
            aria-label={`${lessonNo(course, l)} ${l.title}${done.has(l.id) ? ', 완료' : ''}`}
            data-done={done.has(l.id) || undefined}
            data-last={l.id === last?.id || undefined}
          />
        ))}
      </div>
      <div className="shelf-foot">
        <span className="shelf-progress">
          {doneCount ? (
            <>
              완료 <span className="mono">{doneCount}</span> / <span className="mono">{total}</span>
            </>
          ) : (
            '아직 시작하지 않았습니다'
          )}
        </span>
        <div className="btn-row">
          <a className="btn small" href={courseHref(course.id)}>
            목차
          </a>
          <a className="btn small primary" href={lessonHref(course.id, next.id)}>
            {last ? `이어서: ${last.title}` : '1장부터 시작'}
          </a>
        </div>
      </div>
    </article>
  );
}

type LevelFilter = 'all' | Level;
type View = 'list' | 'map';

/** The reader's last choice of view; the map on wide screens, the list on phones until they choose. */
const VIEW_KEY = 'atlas-library-view';
function loadView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'list' || v === 'map') return v;
  } catch {
    /* storage unavailable */
  }
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 761px)').matches ? 'map' : 'list';
}
function saveView(v: View) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* storage unavailable: remember for this visit only */
  }
}

export default function Library() {
  const progress = useProgress();
  const [view, setView] = useState<View>(loadView);
  const [filter, setFilter] = useState<LevelFilter>('all');
  const levels = [...new Set(COURSES.map((c) => c.level))].sort() as Level[];
  const totalLessons = COURSES.reduce((s, c) => s + c.lessons.length, 0);
  const shown = (c: Course) => filter === 'all' || c.level === filter;

  const changeView = (v: View) => {
    setView(v);
    saveView(v);
  };

  // In the list a search result opens its page (the map shows results in place).
  const pick = (hit: SearchHit) => {
    if (hit.kind === 'lesson') window.location.hash = lessonHref(hit.course.id, hit.lesson.id);
    else if (hit.kind === 'course') window.location.hash = courseHref(hit.course.id);
    else {
      setFilter('all');
      requestAnimationFrame(() => document.getElementById(`subject-${hit.subject.id}`)?.scrollIntoView({ block: 'start' }));
    }
  };

  // The map is the whole page: no rail, no header, only its own controls.
  if (view === 'map') {
    return (
      <div className="library" data-view="map">
        <h1 className="visually-hidden">{SITE.name}</h1>
        <LibraryMap onList={() => changeView('list')} />
      </div>
    );
  }

  return (
    <div className="library" data-view="list">
      <section className="lib-hero">
        <h1 className="lib-title">{SITE.name}</h1>
        <p className="hero-lede">분야와 난이도에 맞는 과목을 골라 시작하세요. 모든 장의 그림은 직접 움직여 보며 배울 수 있습니다.</p>
        <p className="lib-count">
          <span className="mono">{SUBJECTS.length}</span>개 분야 · <span className="mono">{COURSES.length}</span>개 과목 · <span className="mono">{totalLessons}</span>개 장
        </p>
      </section>

      <div className="lib-tools">
        <Seg<View>
          value={view}
          onChange={changeView}
          options={[
            { value: 'list', label: '목록' },
            { value: 'map', label: '지도' },
          ]}
        />
        <LibrarySearch onPick={pick} />
        {levels.length > 1 && (
          <Seg<LevelFilter>
            value={filter}
            onChange={setFilter}
            options={[{ value: 'all', label: '난이도 전체' }, ...levels.map((l) => ({ value: l, label: LEVELS[l].name }))]}
          />
        )}
      </div>

      {SUBJECTS.map((s) => {
        const list = coursesOf(s).filter(shown);
        if (!list.length) return null;
        return (
          <section key={s.id} className="subject" aria-labelledby={`subject-${s.id}`} style={{ ['--subject-color' as string]: s.color } as CSSProperties}>
            <header className="subject-head">
              <span className="subject-en">{s.en}</span>
              <h2 id={`subject-${s.id}`}>{s.name}</h2>
              <p>{s.blurb}</p>
            </header>
            <div className="shelf-grid">
              {list.map((c) => (
                <CourseCard key={c.id} course={c} progress={progress[c.id]} />
              ))}
            </div>
          </section>
        );
      })}

      <footer className="home-foot">
        모든 그림은 브라우저 안에서 직접 계산됩니다. 읽은 장 기록은 이 브라우저에만 저장되고 서버로 전송되지 않습니다.
      </footer>
    </div>
  );
}
