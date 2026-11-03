import ai from './ai/course';
import type { Course, Lesson, Part } from './types';

export type { Course, Lesson, Part } from './types';

/** Every course on the site. Add a new field of study by adding its folder and listing it here. */
export const COURSES: Course[] = [ai];

/** Course shown at the site root until a course picker exists. */
export const DEFAULT_COURSE = ai;

export const findCourse = (id: string) => COURSES.find((c) => c.id === id);

export const courseHref = (courseId: string) => '#' + courseId;
export const lessonHref = (courseId: string, lessonId: string) => `#${courseId}/${lessonId}`;

export const partOf = (c: Course, id: string): Part => c.parts.find((p) => p.id === id)!;
export const lessonIndex = (c: Course, id: string) => c.lessons.findIndex((l) => l.id === id);
/** Global lesson label within its course, like "02". */
export const lessonNo = (c: Course, l: Lesson) => String(lessonIndex(c, l.id)).padStart(2, '0');

export type Route =
  | { kind: 'home' }
  | { kind: 'course'; course: Course }
  | { kind: 'lesson'; course: Course; lesson: Lesson }
  | { kind: 'redirect'; to: string }
  | { kind: 'missing' };

/** Resolve a location hash (without the leading #) to a page. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^\/+|\/+$/g, '');
  if (!path) return { kind: 'home' };
  const [first, second, ...rest] = path.split('/');
  const course = findCourse(first);
  if (course) {
    if (second === undefined) return { kind: 'course', course };
    const lesson = rest.length === 0 ? course.lessons.find((l) => l.id === second) : undefined;
    return lesson ? { kind: 'lesson', course, lesson } : { kind: 'missing' };
  }
  // Links from before courses existed (#vectors) point at the AI course.
  if (second === undefined && DEFAULT_COURSE.lessons.some((l) => l.id === first)) {
    return { kind: 'redirect', to: lessonHref(DEFAULT_COURSE.id, first) };
  }
  return { kind: 'missing' };
}
