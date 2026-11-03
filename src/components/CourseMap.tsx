import { type CSSProperties } from 'react';
import { lessonHref, lessonNo, type Course } from '../courses';
import '../styles/cover.css';

/** The "전체 지도" grid on a course cover: every part with a card per lesson. */
export function CourseMap({ course }: { course: Course }) {
  return (
    <section className="map" aria-labelledby="map-title">
      <h2 id="map-title" className="map-title">
        전체 지도
      </h2>
      {course.parts.map((p) => (
        <div className="map-part" key={p.id} style={{ ['--part-color' as string]: p.color } as CSSProperties}>
          <div className="map-part-head">
            <span className="map-part-en">{p.en}</span>
            <h3>{p.title}</h3>
            <p>{p.blurb}</p>
          </div>
          <div className="map-cards">
            {course.lessons
              .filter((l) => l.part === p.id)
              .map((l) => (
                <a className="map-card" key={l.id} href={lessonHref(course.id, l.id)}>
                  <span className="map-card-no">{lessonNo(course, l)}</span>
                  <span className="map-card-title">{l.title}</span>
                  <span className="map-card-en">{l.en}</span>
                  <span className="map-card-learn">{l.learn.join(' · ')}</span>
                </a>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}
