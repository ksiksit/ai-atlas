import { useState, type CSSProperties } from 'react';
import { Seg } from '../components/ui';
import { COURSES, LEVELS, SUBJECTS, courseHref, coursesOf, findCourse, lessonHref, lessonNo, type Course, type Level } from '../courses';
import { useProgress, type CourseProgress } from '../lib/progress';
import { SITE } from '../site';
import '../styles/cover.css';
import '../styles/library.css';

/** "●○○ 기초": difficulty as filled dots plus its name. */
export function LevelBadge({ level }: { level: Level }) {
  return (
    <span className="level-badge" title={`난이도: ${LEVELS[level].name}`}>
      <span className="level-dots" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <i key={i} data-on={i <= level || undefined} />
        ))}
      </span>
      <span className="visually-hidden">난이도 </span>
      {LEVELS[level].name}
    </span>
  );
}

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

export default function Library() {
  const progress = useProgress();
  const [filter, setFilter] = useState<LevelFilter>('all');
  const levels = [...new Set(COURSES.map((c) => c.level))].sort() as Level[];
  const totalLessons = COURSES.reduce((s, c) => s + c.lessons.length, 0);
  const shown = (c: Course) => filter === 'all' || c.level === filter;

  return (
    <div className="library">
      <section className="lib-hero">
        <h1 className="lib-title">{SITE.name}</h1>
        <p className="hero-lede">분야와 난이도에 맞는 과목을 골라 시작하세요. 모든 장의 그림은 직접 움직여 보며 배울 수 있습니다.</p>
        <p className="lib-count">
          <span className="mono">{SUBJECTS.length}</span>개 분야 · <span className="mono">{COURSES.length}</span>개 과목 · <span className="mono">{totalLessons}</span>개 장
        </p>
      </section>

      {levels.length > 1 && (
        <div className="lib-filter">
          <Seg<LevelFilter>
            label="난이도"
            value={filter}
            onChange={setFilter}
            options={[{ value: 'all', label: '전체' }, ...levels.map((l) => ({ value: l, label: LEVELS[l].name }))]}
          />
        </div>
      )}

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
