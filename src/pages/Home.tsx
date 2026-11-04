import type { CSSProperties } from 'react';
import { COURSES, MAJORS, ROLES, SUBJECTS, courseCode, courseHref, coursesOf, findCourse, lessonHref, majorHref, majorsOf, type CourseRole, type Major } from '../courses';
import { SITE } from '../site';
import LibrarySearch, { type SearchHit } from './LibrarySearch';
import '../styles/cover.css';
import '../styles/library.css';

const ROLE_ORDER: CourseRole[] = ['base', 'core', 'elect'];
const colorOf = (subjectId: string) => SUBJECTS.find((s) => s.id === subjectId)!.color;
const vars = (v: Record<string, string>) => v as CSSProperties;

/** One major: what it is about and which courses it asks for, by role. */
function MajorCard({ major }: { major: Major }) {
  const courses = major.courses.map((x) => findCourse(x.course)!);
  const lessons = courses.reduce((s, c) => s + c.lessons.length, 0);
  return (
    <a className="major-card" href={majorHref(major.id)} style={vars({ '--sc': colorOf(major.subject) })}>
      <span className="major-en">{major.en}</span>
      <h3>{major.name}</h3>
      <p>{major.blurb}</p>
      <dl className="major-path">
        {ROLE_ORDER.map((role) => {
          const list = major.courses.filter((x) => x.role === role).map((x) => findCourse(x.course)!);
          if (!list.length) return null;
          return (
            <div key={role}>
              <dt>{ROLES[role].name}</dt>
              <dd>
                {list.map((c) => (
                  <span key={c.id} className="course-code" style={vars({ '--sc': colorOf(c.subject) })}>
                    {courseCode(c)}
                  </span>
                ))}
              </dd>
            </div>
          );
        })}
      </dl>
      <span className="major-foot">
        <span>
          {courses.length}과목 · {lessons}장
        </span>
        <span className="go">이수체계도 보기 →</span>
      </span>
    </a>
  );
}

/** Site root: pick a major, or find any course or lesson directly. */
export default function Home() {
  const totalLessons = COURSES.reduce((s, c) => s + c.lessons.length, 0);
  const pick = (hit: SearchHit) => {
    window.location.hash = hit.kind === 'major' ? majorHref(hit.major.id) : hit.kind === 'course' ? courseHref(hit.course.id) : lessonHref(hit.course.id, hit.lesson.id);
  };

  return (
    <div className="home">
      <section className="home-intro">
        <span className="home-eyebrow">{SITE.name}</span>
        <h1>어떤 전공을 공부할까요?</h1>
        <p className="hero-lede">전공마다 들어야 할 과목과 순서가 정해져 있습니다. 전공을 고르면 이수체계도가 열리고, 과목 안의 장을 누르면 바로 공부를 시작합니다. 모든 장의 그림은 직접 움직여 보며 배울 수 있습니다.</p>
        <p className="home-count">
          <span className="mono">{MAJORS.length}</span>개 전공 · <span className="mono">{COURSES.length}</span>개 과목 · <span className="mono">{totalLessons}</span>개 장
        </p>
        <LibrarySearch onPick={pick} />
      </section>

      <section aria-labelledby="majors-title">
        <h2 className="home-h2" id="majors-title">
          전공
        </h2>
        <div className="majors">
          {MAJORS.map((m) => (
            <MajorCard key={m.id} major={m} />
          ))}
        </div>
      </section>

      <section aria-labelledby="catalog-title">
        <h2 className="home-h2" id="catalog-title">
          분야별 과목
        </h2>
        <div className="catalog">
          {SUBJECTS.map((s) => (
            <div key={s.id} className="catalog-row" style={vars({ '--sc': s.color })}>
              <b>{s.name}</b>
              <ul>
                {coursesOf(s).map((c) => {
                  const majors = majorsOf(c.id);
                  return (
                    <li key={c.id}>
                      <span className="course-code">{courseCode(c)}</span>
                      <a href={courseHref(c.id)}>{c.title}</a>
                      {majors.length > 0 && <span className="in">{majors.map((m) => m.name.replace(/ 전공$/, '')).join(', ')}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <p className="home-note">과목 옆 회색 글씨는 그 과목을 쓰는 전공입니다. 한 과목을 여러 전공이 함께 씁니다.</p>
      </section>

      <footer className="home-foot">모든 그림은 브라우저 안에서 직접 계산됩니다.</footer>
    </div>
  );
}
