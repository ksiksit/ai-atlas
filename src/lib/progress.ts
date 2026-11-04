import { useEffect, useState } from 'react';

/**
 * Reading progress, kept in this browser only (localStorage).
 * `last` is the lesson opened most recently and `at` when (ms since epoch);
 * `done` holds lessons read to the end.
 * Every storage access is guarded: in private windows or with storage blocked the
 * site still works, it just forgets progress on reload.
 */
export interface CourseProgress {
  done: string[];
  last?: string;
  at?: number;
}
export type Progress = Record<string, CourseProgress>;

const KEY = 'atlas-progress';
const listeners = new Set<() => void>();
let state: Progress = load();

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Progress = {};
    for (const [k, p] of Object.entries(v as Record<string, unknown>)) {
      const cp = p as Partial<CourseProgress> | null;
      if (!cp || typeof cp !== 'object') continue;
      out[k] = {
        done: Array.isArray(cp.done) ? cp.done.filter((x): x is string => typeof x === 'string') : [],
        last: typeof cp.last === 'string' ? cp.last : undefined,
        at: typeof cp.at === 'number' ? cp.at : undefined,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function commit(next: Progress) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: keep progress for this visit only */
  }
  listeners.forEach((l) => l());
}

const entry = (courseId: string): CourseProgress => state[courseId] ?? { done: [] };

export function markVisited(courseId: string, lessonId: string) {
  const cur = entry(courseId);
  commit({ ...state, [courseId]: { ...cur, last: lessonId, at: Date.now() } });
}

export function markDone(courseId: string, lessonId: string) {
  const cur = entry(courseId);
  if (cur.done.includes(lessonId)) return;
  commit({ ...state, [courseId]: { ...cur, done: [...cur.done, lessonId] } });
}

/**
 * Move progress saved under old course ids to their new ids, merging with anything
 * already saved under the new id. Runs once at startup; a no-op when nothing matches.
 */
export function renameCourseProgress(renames: Record<string, string>) {
  let changed = false;
  const next: Progress = { ...state };
  for (const [from, to] of Object.entries(renames)) {
    const old = next[from];
    if (!old || from === to) continue;
    const cur = next[to] ?? { done: [] };
    next[to] = { done: [...new Set([...cur.done, ...old.done])], last: cur.last ?? old.last, at: cur.at ?? old.at };
    delete next[from];
    changed = true;
  }
  if (changed) commit(next);
}

/** React hook: current progress; re-renders whenever it changes. */
export function useProgress(): Progress {
  const [p, setP] = useState(state);
  useEffect(() => {
    const l = () => setP(state);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return p;
}
