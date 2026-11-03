import type { ComponentType, LazyExoticComponent } from 'react';

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

/** One field of study (AI, statistics, …): its own title, table of contents and cover page. */
export interface Course {
  /** URL segment: #<course> is its cover, #<course>/<lesson> a lesson. */
  id: string;
  /** Full title, used in the browser tab, e.g. "벡터에서 트랜스포머까지". */
  title: string;
  /** Title split in two for the brand mark ("벡터에서 → 트랜스포머까지"). Falls back to `title`. */
  mark?: [string, string];
  /** Short name of the field, e.g. "인공지능". */
  subject: string;
  /** One-line description under the brand mark. */
  tagline: string;
  parts: Part[];
  lessons: Lesson[];
  /** The course's landing page (hero + table of contents). */
  Cover: LazyExoticComponent<ComponentType>;
}
