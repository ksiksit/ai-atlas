import ai from './ai/course';
import stats from './stats/course';
import type { Course, Lesson, Part } from './types';

export type { Course, Lesson, Part } from './types';

/** Every course on the site, in library order. Add a new field of study by adding its folder and listing it here. */
export const COURSES: Course[] = [ai, stats];

/** Course that old, course-less links (#vectors) belong to. */
export const LEGACY_COURSE = ai;

export const findCourse = (id: string) => COURSES.find((c) => c.id === id);

export const LIBRARY_HREF = '#';
export const courseHref = (courseId: string) => '#' + courseId;
export const lessonHref = (courseId: string, lessonId: string) => `#${courseId}/${lessonId}`;

export const partOf = (c: Course, id: string): Part => c.parts.find((p) => p.id === id)!;
export const lessonIndex = (c: Course, id: string) => c.lessons.findIndex((l) => l.id === id);
/** Lesson number within its course (the AI course counts its intro as 0). */
export const lessonNumber = (c: Course, l: Lesson) => lessonIndex(c, l.id) + (c.firstNo ?? 1);
/** Lesson number as a two-digit label, like "02". */
export const lessonNo = (c: Course, l: Lesson) => String(lessonNumber(c, l)).padStart(2, '0');

export type Route =
  | { kind: 'library' }
  | { kind: 'course'; course: Course }
  | { kind: 'lesson'; course: Course; lesson: Lesson }
  | { kind: 'redirect'; to: string }
  /** Unknown address; `course` is set when the course part was valid. */
  | { kind: 'missing'; course?: Course };

/** Resolve a location hash (without the leading #) to a page. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^\/+|\/+$/g, '');
  if (!path) return { kind: 'library' };
  const [first, second, ...rest] = path.split('/');
  const course = findCourse(first);
  if (course) {
    if (second === undefined) return { kind: 'course', course };
    const lesson = rest.length === 0 ? course.lessons.find((l) => l.id === second) : undefined;
    return lesson ? { kind: 'lesson', course, lesson } : { kind: 'missing', course };
  }
  // Links from before courses existed (#vectors) point at the AI course.
  if (second === undefined && LEGACY_COURSE.lessons.some((l) => l.id === first)) {
    return { kind: 'redirect', to: lessonHref(LEGACY_COURSE.id, first) };
  }
  return { kind: 'missing' };
}
