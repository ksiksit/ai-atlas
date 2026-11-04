import type { Course, Level, Subject } from '../../courses';

/**
 * Geometry of the library map, in world units (1 unit = 1 CSS px at zoom 1).
 * Subjects are columns, levels are bands from 기초 (top) to 심화 (bottom), and each
 * course is a box tall enough to list its lessons, so zooming never moves anything.
 */

export const BOX_W = 280;
/** Course box: header (level, title, subtitle, progress), then one row per part and lesson. */
export const HEAD = 96;
export const PART_H = 24;
export const LES_H = 22;
const BOX_FOOT = 12;
/** Space between courses that share a subject and a level. */
const SUB_GAP = 40;
const COL_PAD = 34;
const COL_GAP = 36;
/** Left margin that holds the level labels. */
const GUTTER = 150;
/** Top margin that holds the subject names. */
const TOP = 148;
const ROW_PAD = 38;
const MIN_ROW = 160;

export const LEVEL_IDS: Level[] = [1, 2, 3];

export interface Box {
  x: number;
  y: number;
  h: number;
}

export interface MapLayout {
  subjects: Subject[];
  courses: Course[];
  /** Subject column: left edge and width. */
  cols: Record<string, { x: number; w: number }>;
  /** Top edge of each level band. */
  rowY: Record<Level, number>;
  width: number;
  height: number;
  pos: Record<string, Box>;
  colPad: number;
}

export const boxHeight = (c: Course) => HEAD + c.parts.length * PART_H + c.lessons.length * LES_H + BOX_FOOT;

export function layoutMap(subjects: Subject[], courses: Course[]): MapLayout {
  const used = subjects.filter((s) => courses.some((c) => c.subject === s.id));
  const cells = new Map<string, Course[]>();
  const key = (s: string, l: Level) => s + '|' + l;
  for (const c of courses) {
    const k = key(c.subject, c.level);
    cells.set(k, [...(cells.get(k) ?? []), c]);
  }

  const rowY = {} as Record<Level, number>;
  let y = TOP;
  for (const l of LEVEL_IDS) {
    let tallest = MIN_ROW;
    for (const s of used) for (const c of cells.get(key(s.id, l)) ?? []) tallest = Math.max(tallest, boxHeight(c));
    rowY[l] = y;
    y += tallest + ROW_PAD * 2;
  }
  const height = y + 24;

  const cols: MapLayout['cols'] = {};
  let x = GUTTER;
  for (const s of used) {
    const n = Math.max(1, ...LEVEL_IDS.map((l) => cells.get(key(s.id, l))?.length ?? 0));
    const w = n * BOX_W + (n - 1) * SUB_GAP + COL_PAD * 2;
    cols[s.id] = { x, w };
    x += w + COL_GAP;
  }
  const width = x - COL_GAP + 24;

  const pos: Record<string, Box> = {};
  for (const s of used) {
    for (const l of LEVEL_IDS) {
      const list = cells.get(key(s.id, l)) ?? [];
      const span = list.length * BOX_W + (list.length - 1) * SUB_GAP;
      list.forEach((c, i) => {
        pos[c.id] = { x: cols[s.id].x + (cols[s.id].w - span) / 2 + i * (BOX_W + SUB_GAP), y: rowY[l] + ROW_PAD, h: boxHeight(c) };
      });
    }
  }
  return { subjects: used, courses, cols, rowY, width, height, pos, colPad: COL_PAD };
}

/** Arrow from a prerequisite to the course that needs it: downward between levels, sideways within one. */
export function edgeShape(a: Box, b: Box, la: Level, lb: Level): { d: string; arrow: string } {
  if (lb > la) {
    const sx = a.x + BOX_W / 2, sy = a.y + a.h, ex = b.x + BOX_W / 2, ey = b.y - 11;
    const dy = ey - sy;
    return { d: `M${sx} ${sy} C${sx} ${sy + dy * 0.55} ${ex} ${ey - dy * 0.55} ${ex} ${ey}`, arrow: `${ex - 6},${ey} ${ex + 6},${ey} ${ex},${ey + 11}` };
  }
  const right = a.x < b.x;
  const sx = right ? a.x + BOX_W : a.x, sy = a.y + 46;
  const ex = right ? b.x - 11 : b.x + BOX_W + 11, ey = b.y + 46;
  const dx = ex - sx;
  const tip = right ? ex + 11 : ex - 11;
  return { d: `M${sx} ${sy} C${sx + dx * 0.5} ${sy} ${ex - dx * 0.5} ${ey} ${ex} ${ey}`, arrow: `${ex},${ey - 6} ${ex},${ey + 6} ${tip},${ey}` };
}

/** Vertical centre of a lesson's row, measured from the top of its course box. */
export function lessonOffset(c: Course, lessonId: string): number {
  let y = HEAD + 4;
  for (const p of c.parts) {
    y += PART_H;
    for (const l of c.lessons) {
      if (l.part !== p.id) continue;
      if (l.id === lessonId) return y + LES_H / 2;
      y += LES_H;
    }
  }
  return HEAD / 2;
}

/** Every course to take before `id`, earliest first. */
export function prerequisiteChain(courses: Course[], id: string): string[] {
  const out: string[] = [];
  const visit = (cid: string) => {
    for (const p of courses.find((c) => c.id === cid)?.prerequisites ?? []) {
      if (out.includes(p) || !courses.some((c) => c.id === p)) continue;
      visit(p);
      out.push(p);
    }
  };
  visit(id);
  return out;
}

/** Courses that list `id` as a prerequisite. */
export const nextCourses = (courses: Course[], id: string) => courses.filter((c) => c.prerequisites?.includes(id)).map((c) => c.id);

/** Course title broken into short lines for the zoomed-out view ("시스템 속 / 알고리즘"). */
export function shortLines(title: string, max = 5): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of title.split(' ')) {
    if (cur && (cur + ' ' + w).length > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** How much the map shows at a zoom: subject names, course boxes, or lesson titles. */
export type ZoomMode = 'far' | 'mid' | 'near';
export const zoomMode = (k: number): ZoomMode => (k < 0.42 ? 'far' : k < 0.95 ? 'mid' : 'near');
/** Zoom each step button jumps to. */
export const STEP_ZOOM: Record<ZoomMode, number> = { far: 0.32, mid: 0.62, near: 1.25 };
export const K_MIN = 0.15;
export const K_MAX = 2.6;
export const clampK = (k: number) => Math.min(K_MAX, Math.max(K_MIN, k));
