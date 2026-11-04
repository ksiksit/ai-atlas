import { useState, type CSSProperties } from 'react';
import { COURSES, MAJORS, SUBJECTS, courseHref, findCourse, lessonHref, majorHref, type Major } from '../courses';
import LibrarySearch, { type SearchHit } from './LibrarySearch';
import '../styles/cover.css';
import '../styles/library.css';

/** Past this many majors, the list gets a filter by field (계열). */
const FILTER_FROM = 7;
const colorOf = (subjectId: string) => SUBJECTS.find((s) => s.id === subjectId)!.color;
const vars = (v: Record<string, string>) => v as CSSProperties;

/** One major: its name, large, with a one-line tagline. The whole tile opens its chart. */
function MajorTile({ major }: { major: Major }) {
  const courses = major.courses.map((x) => findCourse(x.course)!);
  const lessons = courses.reduce((s, c) => s + c.lessons.length, 0);
  return (
    <li>
      <a className="major-tile" href={majorHref(major.id)} style={vars({ '--sc': colorOf(major.subject) })}>
        <span className="major-tile-top">
          <span className="en">{major.en}</span>
          <span className="n">
            {courses.length}과목 · {lessons}장
          </span>
        </span>
        <h2>
          {major.name}
          <span className="ar" aria-hidden="true">
            →
          </span>
        </h2>
        <p>{major.tagline}</p>
      </a>
    </li>
  );
}

/** Site root: pick a major, or find any course or lesson directly. */
export default function Home() {
  const [field, setField] = useState<string | null>(null);
  const totalLessons = COURSES.reduce((s, c) => s + c.lessons.length, 0);
  const fields = MAJORS.length >= FILTER_FROM ? [...new Set(MAJORS.map((m) => m.field).filter((f): f is string => !!f))] : [];
  const shown = field ? MAJORS.filter((m) => m.field === field) : MAJORS;
  const pick = (hit: SearchHit) => {
    window.location.hash = hit.kind === 'major' ? majorHref(hit.major.id) : hit.kind === 'course' ? courseHref(hit.course.id) : lessonHref(hit.course.id, hit.lesson.id);
  };

  return (
    <div className="home">
      <section className="home-intro">
        <h1>어떤 전공을 공부할까요?</h1>
        <p className="hero-lede">전공을 고르면 들어야 할 과목과 순서가 나옵니다. 과목 안의 장을 누르면 바로 공부를 시작합니다.</p>
        <LibrarySearch onPick={pick} />
      </section>

      <section aria-labelledby="majors-title">
        <div className="majors-head">
          <b id="majors-title">전공</b>
          <span>
            <span className="mono">{MAJORS.length}</span>개 전공 · <span className="mono">{COURSES.length}</span>개 과목 · <span className="mono">{totalLessons}</span>개 장
          </span>
        </div>
        {fields.length > 1 && (
          <div className="major-filters" role="group" aria-label="계열로 좁히기">
            <button type="button" aria-pressed={field === null} onClick={() => setField(null)}>
              전체
            </button>
            {fields.map((f) => (
              <button key={f} type="button" aria-pressed={field === f} onClick={() => setField(f)}>
                {f} {MAJORS.filter((m) => m.field === f).length}
              </button>
            ))}
          </div>
        )}
        <ul className="major-tiles">
          {shown.map((m) => (
            <MajorTile key={m.id} major={m} />
          ))}
        </ul>
      </section>
    </div>
  );
}
