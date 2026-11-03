import { type CSSProperties } from 'react';
import { BrandMark } from '../components/BrandMark';
import { COURSES, courseHref, lessonHref, lessonNo, type Course } from '../courses';
import { useProgress, type CourseProgress } from '../lib/progress';
import { SITE } from '../site';
import '../styles/cover.css';
import '../styles/library.css';

function ShelfCard({ course, progress }: { course: Course; progress?: CourseProgress }) {
  const total = course.lessons.length;
  const done = new Set(progress?.done ?? []);
  const doneCount = course.lessons.filter((l) => done.has(l.id)).length;
  const last = course.lessons.find((l) => l.id === progress?.last);
  const next = last ?? course.lessons[0];
  return (
    <article className="shelf-card" style={{ ['--course-color' as string]: course.color } as CSSProperties}>
      <div className="shelf-top">
        <span className="shelf-en">{course.en}</span>
        <span className="shelf-count">{total}장</span>
      </div>
      <h3 className="shelf-title">
        <a href={courseHref(course.id)}>
          <BrandMark course={course} inline />
        </a>
      </h3>
      <p className="shelf-subject">{course.subject}</p>
      <p className="shelf-blurb">{course.blurb}</p>
      <ul className="shelf-parts">
        {course.parts.map((p) => (
          <li key={p.id} style={{ ['--part-color' as string]: p.color } as CSSProperties}>
            {p.title}
            <span className="mono">{course.lessons.filter((l) => l.part === p.id).length}</span>
          </li>
        ))}
      </ul>
      <div className="shelf-strip" role="list" aria-label={`${course.subject} 진도: ${total}장 중 ${doneCount}장 완료`}>
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

export default function Library() {
  const progress = useProgress();
  const totalLessons = COURSES.reduce((s, c) => s + c.lessons.length, 0);
  return (
    <div className="library">
      <section className="lib-hero">
        <div className="eyebrow" style={{ color: 'var(--accent)' }}>
          {SITE.name}
        </div>
        <h1 className="hero-title">
          읽기만 하지 말고,
          <br />
          <em>만져 보며</em> 배우세요.
        </h1>
        <p className="hero-lede">
          분야마다 기초부터 한 장씩 쌓아 올린 인터랙티브 교과서입니다. 모든 장에는 슬라이더를 움직이고 점을 끌어 결과를 바로 확인하는 그림이 들어 있습니다. 지금은 {COURSES.length}개 분야, {totalLessons}개의 장이 있습니다.
        </p>
      </section>

      <section className="shelf" aria-labelledby="shelf-title">
        <h2 id="shelf-title" className="map-title">
          분야 고르기
        </h2>
        <div className="shelf-grid">
          {COURSES.map((c) => (
            <ShelfCard key={c.id} course={c} progress={progress[c.id]} />
          ))}
        </div>
      </section>

      <footer className="home-foot">
        모든 그림은 브라우저 안에서 직접 계산됩니다. 읽은 장 기록은 이 브라우저에만 저장되고 서버로 전송되지 않습니다.
      </footer>
    </div>
  );
}
