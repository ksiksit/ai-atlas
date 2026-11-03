import type { Course } from '../courses';

/** A course title set as "A → B", on one line (`inline`) or two. */
export function BrandMark({ course, inline = false }: { course: Course; inline?: boolean }) {
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
