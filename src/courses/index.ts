import aiSubject from './ai/subject';
import aiBasics from './ai/basics/course';
import aiDeepLearning from './ai/deep/course';
import aiLlm from './ai/llm/course';
import statsSubject from './stats/subject';
import statsBasics from './stats/basics/course';
import csSubject from './cs/subject';
import csAlgorithms from './cs/algorithms/course';
import csAlgorithmDesign from './cs/design/course';
import csSystemAlgorithms from './cs/systems/course';
import netSubject from './net/subject';
import netBasics from './net/basics/course';
import netSecurity from './net/security/course';
import { MAJORS } from './majors';
import type { Course, CourseRole, Lesson, Level, Major, Part, Subject } from './types';

export type { Course, CourseRole, Lesson, Level, Major, Part, Subject } from './types';
export { MAJORS } from './majors';

/** Fields of study, in library order. */
export const SUBJECTS: Subject[] = [aiSubject, statsSubject, csSubject, netSubject];

/** Every course. Within a subject the library sorts them by level, then by this order. */
export const COURSES: Course[] = [aiBasics, aiDeepLearning, aiLlm, statsBasics, csAlgorithms, csAlgorithmDesign, csSystemAlgorithms, netBasics, netSecurity];

export const LEVELS: Record<Level, { name: string; en: string }> = {
  1: { name: '기초', en: 'Basic' },
  2: { name: '중급', en: 'Intermediate' },
  3: { name: '심화', en: 'Advanced' },
};

/** Course that the oldest links (#vectors, from before courses existed) belong to. */
const LEGACY_COURSE = aiBasics;

export const findCourse = (id: string) => COURSES.find((c) => c.id === id);
export const subjectOf = (c: Course): Subject => SUBJECTS.find((s) => s.id === c.subject)!;
export const coursesOf = (s: Subject) => COURSES.filter((c) => c.subject === s.id).sort((a, b) => a.level - b.level);

export const LIBRARY_HREF = '#';
export const courseHref = (courseId: string) => '#' + courseId;
export const lessonHref = (courseId: string, lessonId: string) => `#${courseId}/${lessonId}`;

export const partOf = (c: Course, id: string): Part => c.parts.find((p) => p.id === id)!;
export const lessonIndex = (c: Course, id: string) => c.lessons.findIndex((l) => l.id === id);
/** Lesson number within its course (the AI course counts its intro as 0). */
export const lessonNumber = (c: Course, l: Lesson) => lessonIndex(c, l.id) + (c.firstNo ?? 1);
/** Lesson number as a two-digit label, like "02". */
export const lessonNo = (c: Course, l: Lesson) => String(lessonNumber(c, l)).padStart(2, '0');

const byAlias = new Map<string, Course>(COURSES.flatMap((c) => (c.aliases ?? []).map((a) => [a, c] as [string, Course])));

/** Course code: subject prefix, level as the hundreds digit, order within that level (AI 101, CS 201). */
const CODES = new Map<string, string>();
for (const s of SUBJECTS) {
  for (const level of [1, 2, 3] as Level[]) {
    COURSES.filter((c) => c.subject === s.id && c.level === level).forEach((c, i) => CODES.set(c.id, `${s.code} ${level}${String(i + 1).padStart(2, '0')}`));
  }
}
export const courseCode = (c: Course) => CODES.get(c.id)!;

export const ROLES: Record<CourseRole, { name: string; blurb: string }> = {
  base: { name: '전공기초', blurb: '다른 분야의 과목. 전공을 시작하기 전에 들으면 좋습니다.' },
  core: { name: '전공필수', blurb: '이 전공의 뼈대가 되는 과목입니다.' },
  elect: { name: '전공선택', blurb: '관심에 따라 골라 듣는 과목입니다.' },
};

export const majorHref = (majorId: string) => `#majors/${majorId}`;
export const findMajor = (id: string) => MAJORS.find((m) => m.id === id);
/** Majors that include a course, in home-page order. */
export const majorsOf = (courseId: string): Major[] => MAJORS.filter((m) => m.courses.some((x) => x.course === courseId));

export type Route =
  | { kind: 'library' }
  | { kind: 'major'; major: Major }
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
  // #majors/<id> is one major's curriculum chart; #majors alone is the home page.
  if (first === 'majors') {
    if (second === undefined) return { kind: 'redirect', to: LIBRARY_HREF };
    const major = rest.length === 0 ? findMajor(second) : undefined;
    return major ? { kind: 'major', major } : { kind: 'missing' };
  }
  const course = findCourse(first);
  if (course) {
    if (second === undefined) return { kind: 'course', course };
    const lesson = rest.length === 0 ? course.lessons.find((l) => l.id === second) : undefined;
    return lesson ? { kind: 'lesson', course, lesson } : { kind: 'missing', course };
  }
  // A course's earlier slug (#stats/clt → #stats-basics/clt).
  const renamed = byAlias.get(first);
  if (renamed) {
    const tail = [second, ...rest].filter((x) => x !== undefined).join('/');
    return { kind: 'redirect', to: courseHref(renamed.id) + (tail ? '/' + tail : '') };
  }
  // Links from before courses existed (#vectors) point at the first AI course.
  if (second === undefined && LEGACY_COURSE.lessons.some((l) => l.id === first)) {
    return { kind: 'redirect', to: lessonHref(LEGACY_COURSE.id, first) };
  }
  return { kind: 'missing' };
}
