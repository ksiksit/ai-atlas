import type { ComponentType, LazyExoticComponent } from 'react';

/**
 * Content hierarchy: Subject (분야) → Course (과목) → Part (파트) → Lesson (장).
 * A subject such as 통계학 can hold several courses at different levels.
 * Majors (전공) sit on top: each one picks courses from any subject, in the order to take them.
 */

/** A field of study. Groups courses on the library page and gives them a color. */
export interface Subject {
  /** Short slug; also the folder name under src/courses/. */
  id: string;
  /** Prefix of its course codes, e.g. "STAT" for STAT 101. */
  code: string;
  /** Name of the field, e.g. "통계학". */
  name: string;
  /** English name, shown as a small label. */
  en: string;
  /** Accent color of the field (CSS color or var()). */
  color: string;
  /** One sentence about the field for the library. */
  blurb: string;
}

/** 1 = 기초, 2 = 중급, 3 = 심화. */
export type Level = 1 | 2 | 3;

/** A group of lessons inside a course, shown as one section of the table of contents. */
export interface Part {
  id: string;
  title: string;
  en: string;
  /** CSS color, usually a var() reference defined in global.css. */
  color: string;
  blurb: string;
}

export interface Lesson {
  /** URL segment, unique within its course: #<course>/<lesson>. */
  id: string;
  /** Id of the Part this lesson belongs to. */
  part: string;
  title: string;
  en: string;
  /** One-line summary for cards and the lesson lede. */
  lede: string;
  /** What the reader will be able to do / know. */
  learn: string[];
  Component: LazyExoticComponent<ComponentType>;
}

/** One course: its own title, table of contents and cover page. */
export interface Course {
  /** Globally unique URL slug, "<subject>-<topic>": #<id> is the cover, #<id>/<lesson> a lesson. */
  id: string;
  /** Id of the Subject this course belongs to. */
  subject: string;
  /** Plain name that says what is taught, e.g. "기초 통계학". Shown everywhere the course is named. */
  title: string;
  /** The course's span, e.g. "평균에서 p값까지". Shown under the title. */
  subtitle: string;
  level: Level;
  /** Ids of courses to take first. */
  prerequisites?: string[];
  /** Earlier URL slugs of this course; links using them are redirected here. */
  aliases?: string[];
  /** Two or three sentences for the course's card in the library. */
  blurb: string;
  /** Number of the first lesson (the AI course starts at 0 with its intro). Defaults to 1. */
  firstNo?: number;
  parts: Part[];
  lessons: Lesson[];
  /** The course's landing page (hero + table of contents). */
  Cover: LazyExoticComponent<ComponentType>;
}

/** How a course counts toward a major: 전공기초 (from another field, taken first), 전공필수, 전공선택. */
export type CourseRole = 'base' | 'core' | 'elect';

/** A major: a curated path through courses, shown as a curriculum chart (이수체계도). */
export interface Major {
  /** URL segment: #majors/<id>. */
  id: string;
  /** e.g. "인공지능 전공". */
  name: string;
  /** English name, shown as a small label. */
  en: string;
  /** Subject that runs the major; courses from other subjects are marked as such. */
  subject: string;
  /** One or two sentences at the top of the major's chart. */
  blurb: string;
  /** One short line under the major's name on the home page. */
  tagline: string;
  /** Field (계열) for the home page's filter, e.g. "공학". The filter appears once there are 7 or more majors. */
  field?: string;
  courses: { course: string; role: CourseRole }[];
}
