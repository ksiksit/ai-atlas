import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { LevelBadge } from '../../components/LevelBadge';
import { COURSES, LEVELS, SUBJECTS, courseHref, lessonHref, lessonNo, type Course, type Subject } from '../../courses';
import { useProgress, type Progress } from '../../lib/progress';
import { ThemeCycleButton } from '../../components/ThemeToggle';
import LibrarySearch, { type SearchHit } from './LibrarySearch';
import {
  BOX_W,
  HEAD,
  LES_H,
  LEVEL_IDS,
  PART_H,
  clampK,
  edgeShape,
  layoutMap,
  lessonOffset,
  nextCourses,
  prerequisiteChain,
  shortLines,
  zoomMode,
  type ZoomMode,
} from './mapLayout';
import '../../styles/library-map.css';

const NARROW = '(max-width: 760px)';
const FLY_MS = 520;

const isNarrow = () => typeof window !== 'undefined' && window.matchMedia(NARROW).matches;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const doneOf = (p: Progress, c: Course) => new Set(p[c.id]?.done ?? []);
const doneCount = (p: Progress, c: Course) => {
  const d = doneOf(p, c);
  return c.lessons.filter((l) => d.has(l.id)).length;
};
const vars = (v: Record<string, string>) => v as CSSProperties;

/* ───────────── drawing ───────────── */

function CourseBox({ course, progress, x, y, h, classes, focusLesson, onKey }: { course: Course; progress: Progress; x: number; y: number; h: number; classes: string; focusLesson: string | null; onKey: (e: ReactKeyboardEvent, id: string) => void }) {
  const subject = SUBJECTS.find((s) => s.id === course.subject)!;
  const done = doneOf(progress, course);
  const last = progress[course.id]?.last;
  const total = course.lessons.length;
  const n = doneCount(progress, course);
  const lines = shortLines(course.title);
  const farY = Math.min(h / 2, 150) - (lines.length - 1) * 27;
  const farEnd = farY + (lines.length - 1) * 54;

  let rows = HEAD + 4;
  const body = course.parts.map((p) => {
    const py = rows;
    rows += PART_H;
    const items = course.lessons
      .filter((l) => l.part === p.id)
      .map((l) => {
        const ly = rows;
        rows += LES_H;
        const isDone = done.has(l.id);
        const cls = ['lm-lesson', isDone && 'done', l.id === last && 'last', focusLesson === `${course.id}/${l.id}` && 'focus'].filter(Boolean).join(' ');
        return (
          <g key={l.id} className={cls} data-lesson={`${course.id}/${l.id}`} transform={`translate(0 ${ly})`}>
            <rect className="lm-hit" x={8} y={1} width={BOX_W - 16} height={LES_H - 2} rx={3} />
            <circle className="lm-dot" cx={21} cy={LES_H / 2} r={3.6} fill={isDone ? p.color : 'var(--surface)'} stroke={p.color} />
            <rect className="lm-bar" x={16} y={LES_H / 2 - 3} width={Math.min(BOX_W - 56, 40 + l.title.length * 11)} height={6} rx={3} fill={p.color} />
            <text className="lm-no" x={33} y={LES_H / 2 + 4}>
              {lessonNo(course, l)}
            </text>
            <text className="lm-ltitle" x={57} y={LES_H / 2 + 4.5}>
              {l.title}
            </text>
          </g>
        );
      });
    return (
      <g key={p.id}>
        <text className="lm-part" x={16} y={py + 15} fill={p.color}>
          {p.title}
        </text>
        {items}
      </g>
    );
  });

  return (
    <g
      className={'lm-course ' + classes}
      data-course={course.id}
      transform={`translate(${x} ${y})`}
      tabIndex={0}
      role="button"
      aria-label={`${course.title}, ${LEVELS[course.level].name}, ${total}장 중 ${n}장 완료`}
      onKeyDown={(e) => onKey(e, course.id)}
    >
      <rect className="lm-box" width={BOX_W} height={h} rx={6} />
      <text className="lm-meta" x={16} y={26}>
        {[1, 2, 3].map((i) => (i <= course.level ? '●' : '○')).join('')} {LEVELS[course.level].name} · {total}장
      </text>
      {n > 0 && (
        <text className="lm-meta" x={BOX_W - 16} y={26} textAnchor="end">
          {n}/{total}
        </text>
      )}
      <text className="lm-title" x={16} y={55}>
        {course.title}
      </text>
      <text className="lm-sub" x={16} y={76}>
        {course.subtitle}
      </text>
      <rect className="lm-track" x={16} y={HEAD - 10} width={BOX_W - 32} height={3} rx={1.5} />
      {n > 0 && <rect className="lm-track" x={16} y={HEAD - 10} width={((BOX_W - 32) * n) / total} height={3} rx={1.5} fill={subject.color} />}
      <g className="lm-body">{body}</g>
      <g className="lm-far">
        <text className="lm-far-title" textAnchor="middle" x={BOX_W / 2} y={farY}>
          {lines.map((t, i) => (
            <tspan key={i} x={BOX_W / 2} dy={i ? 54 : 0}>
              {t}
            </tspan>
          ))}
        </text>
        <text className="lm-far-count" textAnchor="middle" x={BOX_W / 2} y={farEnd + 46}>
          {n}/{total}
        </text>
        {n > 0 && (
          <>
            <rect x={40} y={farEnd + 66} width={BOX_W - 80} height={8} rx={4} fill="var(--surface-3)" />
            <rect x={40} y={farEnd + 66} width={((BOX_W - 80) * n) / total} height={8} rx={4} fill={subject.color} />
          </>
        )}
      </g>
    </g>
  );
}

/* ───────────── side panel ───────────── */

/** The course read most recently, as one link: "이어서 · 편미분과 그래디언트". */
function ResumeLink({ progress }: { progress: Progress }) {
  const reading = COURSES.filter((c) => {
    const n = doneCount(progress, c);
    return (n > 0 || progress[c.id]?.last) && n < c.lessons.length;
  }).sort((a, b) => (progress[b.id]?.at ?? 0) - (progress[a.id]?.at ?? 0));
  const c = reading[0];
  if (!c) return null;
  const last = c.lessons.find((l) => l.id === progress[c.id]?.last) ?? c.lessons[0];
  return (
    <a className="lm-ctl lm-resume" href={lessonHref(c.id, last.id)} style={vars({ '--c': SUBJECTS.find((s) => s.id === c.subject)!.color })}>
      <span className="k">이어서</span>
      <span className="l">{last.title}</span>
      <span className="c">{c.title}</span>
    </a>
  );
}

function PanelCourse({ course, progress, focusLesson, onSelect }: { course: Course; progress: Progress; focusLesson: string | null; onSelect: (id: string, lesson?: string) => void }) {
  const done = doneOf(progress, course);
  const last = progress[course.id]?.last;
  const lastLesson = course.lessons.find((l) => l.id === last);
  const resume = lastLesson ?? course.lessons[0];
  const n = doneCount(progress, course);
  const chain = prerequisiteChain(COURSES, course.id);
  const next = nextCourses(COURSES, course.id);
  const title = (id: string) => COURSES.find((c) => c.id === id)!.title;
  const focused = focusLesson?.startsWith(course.id + '/') ? course.lessons.find((l) => `${course.id}/${l.id}` === focusLesson) : undefined;

  return (
    <>
      <div>
        <h2>{course.title}</h2>
        <div className="lm-subtitle">{course.subtitle}</div>
        <div className="lm-meta-row">
          <LevelBadge level={course.level} />
          <span>{course.lessons.length}장</span>
          <span>
            {n ? (
              <>
                완료 <span className="mono">{n}</span>/<span className="mono">{course.lessons.length}</span>
              </>
            ) : (
              '아직 시작하지 않음'
            )}
          </span>
        </div>
      </div>
      {focused && (
        <div className="btn-row">
          <a className="btn small primary" href={lessonHref(course.id, focused.id)}>
            이 장 열기: {focused.title}
          </a>
        </div>
      )}
      <p>{course.blurb}</p>
      <div className="btn-row">
        <a className={'btn small' + (focused ? '' : ' primary')} href={lessonHref(course.id, resume.id)}>
          {lastLesson ? `이어서: ${lastLesson.title}` : '1장부터 시작'}
        </a>
        <a className="btn small" href={courseHref(course.id)}>
          목차
        </a>
      </div>
      {(chain.length > 0 || next.length > 0) && (
        <section>
          <h3>순서</h3>
          <div className="lm-chips">
            {[...chain, course.id, ...next].map((id, i) => (
              <span key={id} className="lm-step">
                {i > 0 && <span className="sep">→</span>}
                <button type="button" aria-current={id === course.id ? 'step' : undefined} data-next={next.includes(id) || undefined} onClick={() => id !== course.id && onSelect(id)}>
                  {title(id)}
                </button>
              </span>
            ))}
          </div>
        </section>
      )}
      <section>
        <h3>장</h3>
        <ul className="lm-lessons">
          {course.parts.map((p) => (
            <li key={p.id} style={vars({ '--pc': p.color })}>
              <div className="part">{p.title}</div>
              <ul>
                {course.lessons
                  .filter((l) => l.part === p.id)
                  .map((l) => (
                    <li key={l.id}>
                      <a href={lessonHref(course.id, l.id)} data-done={done.has(l.id) || undefined} data-last={l.id === last || undefined}>
                        <span className="mk" aria-hidden="true" />
                        <span className="no">{lessonNo(course, l)}</span>
                        <span>
                          {l.title}
                          {done.has(l.id) && <span className="visually-hidden">, 완료</span>}
                        </span>
                      </a>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/* ───────────── the map ───────────── */

export default function LibraryMap({ onList }: { onList: () => void }) {
  const progress = useProgress();
  const L = useMemo(() => layoutMap(SUBJECTS, COURSES), []);
  const [sel, setSel] = useState<string | null>(null);
  const [focusLesson, setFocusLesson] = useState<string | null>(null);
  const [mode, setMode] = useState<ZoomMode>('mid');

  const frameRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const view = useRef({ x: 0, y: 0, k: 0.5 });
  const modeRef = useRef<ZoomMode>('mid');
  const anim = useRef(0);
  const touched = useRef(false);
  /** Where to fly once the selection (and the panel's size) has rendered. */
  const pendingFly = useRef<(() => void) | null>(null);

  /* view transform, applied straight to the DOM so panning does not re-render */
  const setView = useCallback((x: number, y: number, k: number) => {
    view.current = { x, y, k };
    worldRef.current?.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(4)})`);
    const svg = svgRef.current;
    if (svg) {
      svg.style.setProperty('--lm-rfs', `${Math.min(54, Math.max(30, 15 / k))}px`);
      svg.style.setProperty('--lm-lfs', `${Math.min(46, Math.max(22, 12 / k))}px`);
    }
    const m = zoomMode(k);
    if (m !== modeRef.current) {
      modeRef.current = m;
      setMode(m);
    }
  }, []);

  /** The part of the screen that the top bar and the panel leave free for the map. */
  const freeRect = useCallback(() => {
    const fr = frameRef.current!.getBoundingClientRect();
    const hr = headRef.current?.getBoundingClientRect();
    const pr = panelRef.current?.getBoundingClientRect();
    const top = hr ? hr.bottom - fr.top + 4 : 0;
    let w = fr.width,
      bottom = fr.height;
    if (pr && isNarrow()) bottom = pr.top - fr.top - 8;
    else if (pr) w = Math.max(240, pr.left - fr.left - 8);
    return { top, w, h: Math.max(160, bottom - top) };
  }, []);

  const flyTo = useCallback(
    (tx: number, ty: number, tk: number) => {
      cancelAnimationFrame(anim.current);
      if (reducedMotion()) return setView(tx, ty, tk);
      const s = { ...view.current };
      const t0 = performance.now();
      const step = (t: number) => {
        const u = Math.min(1, (t - t0) / FLY_MS);
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        const k = Math.exp(Math.log(s.k) + (Math.log(tk) - Math.log(s.k)) * e);
        setView(s.x + (tx - s.x) * e, s.y + (ty - s.y) * e, k);
        if (u < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [setView],
  );

  const fitBox = useCallback(
    (b: { x: number; y: number; w: number; h: number }, { pad = 36, kmax = 2.6, animate = true } = {}) => {
      const fr = freeRect();
      const k = clampK(Math.min((fr.w - pad * 2) / b.w, (fr.h - pad * 2) / b.h, kmax));
      const x = (fr.w - b.w * k) / 2 - b.x * k;
      const y = fr.top + (fr.h - b.h * k) / 2 - b.y * k;
      if (animate) flyTo(x, y, k);
      else setView(x, y, k);
    },
    [flyTo, freeRect, setView],
  );
  const fitAll = useCallback((animate = true) => fitBox({ x: 0, y: 10, w: L.width, h: L.height - 10 }, { pad: 20, animate }), [L, fitBox]);
  const centerOn = useCallback(
    (wx: number, wy: number, k: number) => {
      const fr = freeRect();
      flyTo(fr.w / 2 - wx * k, fr.top + fr.h / 2 - wy * k, k);
    },
    [flyTo, freeRect],
  );
  const zoomAt = useCallback(
    (px: number, py: number, k2: number) => {
      const v = view.current;
      const k = clampK(k2);
      const f = k / v.k;
      setView(px - (px - v.x) * f, py - (py - v.y) * f, k);
    },
    [setView],
  );

  /** Zoom about the centre of the uncovered area. */
  const zoomBy = (f: number) => {
    const fr = freeRect();
    touched.current = true;
    zoomAt(fr.w / 2, fr.top + fr.h / 2, view.current.k * f);
  };

  const select = useCallback(
    (id: string | null, opts: { lesson?: string; fly?: boolean } = {}) => {
      setSel(id);
      setFocusLesson(id && opts.lesson ? `${id}/${opts.lesson}` : null);
      if (!id || opts.fly === false) return;
      pendingFly.current = () => {
        const p = L.pos[id];
        const c = COURSES.find((x) => x.id === id)!;
        if (opts.lesson) centerOn(p.x + BOX_W / 2, p.y + lessonOffset(c, opts.lesson), Math.max(1.3, view.current.k));
        else fitBox({ x: p.x - 20, y: p.y - 20, w: BOX_W + 40, h: Math.min(p.h, 640) + 40 }, { kmax: 1.15 });
      };
    },
    [L, centerOn, fitBox],
  );
  const selectRef = useRef(select);
  selectRef.current = select;

  const showSubject = useCallback(
    (sid: string) => {
      const c = L.cols[sid];
      if (!c) return;
      select(null);
      pendingFly.current = () => fitBox({ x: c.x, y: 24, w: c.w, h: L.height - 36 }, { pad: 24 });
    },
    [L, fitBox, select],
  );

  // Fly after the selection has rendered, so the panel already has its final size.
  useEffect(() => {
    const go = pendingFly.current;
    if (!go) return;
    pendingFly.current = null;
    const r = requestAnimationFrame(go);
    return () => cancelAnimationFrame(r);
  });

  // First paint: the whole map. Until the reader moves it, keep it fitted when the frame resizes.
  useLayoutEffect(() => {
    fitAll(false);
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (!touched.current) fitAll(false);
    });
    ro.observe(frame);
    return () => ro.disconnect();
  }, [fitAll]);

  // A search result: fly to the subject, course or lesson.
  const pick = (hit: SearchHit) => {
    touched.current = true;
    if (hit.kind === 'subject') showSubject(hit.subject.id);
    else select(hit.course.id, { lesson: hit.kind === 'lesson' ? hit.lesson.id : undefined });
  };

  // Pointer, wheel and pinch handling. Taps are told apart from drags by distance moved.
  useEffect(() => {
    const svg = svgRef.current!;
    const pts = new Map<number, { x: number; y: number }>();
    let drag: { sx: number; sy: number; vx: number; vy: number } | null = null;
    let pinch: { d: number; k: number; mx: number; my: number; vx: number; vy: number } | null = null;
    let moved = false;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      touched.current = true;
      cancelAnimationFrame(anim.current);
      const r = svg.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : 1;
      zoomAt(e.clientX - r.left, e.clientY - r.top, view.current.k * Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0018)));
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      touched.current = true;
      cancelAnimationFrame(anim.current);
      svg.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const v = view.current;
      if (pts.size === 1) {
        drag = { sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y };
        moved = false;
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: v.k, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, vx: v.x, vy: v.y };
        moved = true;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = svg.getBoundingClientRect();
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const k = clampK((pinch.k * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d);
        const f = k / pinch.k;
        const mx = (a.x + b.x) / 2 - r.left,
          my = (a.y + b.y) / 2 - r.top;
        setView(mx - (pinch.mx - r.left - pinch.vx) * f, my - (pinch.my - r.top - pinch.vy) * f, k);
      } else if (drag) {
        const dx = e.clientX - drag.sx,
          dy = e.clientY - drag.sy;
        if (!moved && Math.hypot(dx, dy) > 5) {
          moved = true;
          svg.classList.add('dragging');
        }
        if (moved) setView(drag.vx + dx, drag.vy + dy, view.current.k);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 1) {
        const [p] = [...pts.values()];
        drag = { sx: p.x, sy: p.y, vx: view.current.x, vy: view.current.y };
      }
      if (pts.size > 0) return;
      svg.classList.remove('dragging');
      drag = null;
      if (moved || e.type !== 'pointerup') return;
      // A tap: lesson rows count only when their titles are readable.
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const lesson = el?.closest<SVGElement>('[data-lesson]');
      const course = el?.closest<SVGElement>('[data-course]');
      if (lesson && modeRef.current === 'near') {
        const [cid, lid] = lesson.dataset.lesson!.split('/');
        selectRef.current(cid, { lesson: lid, fly: false });
      } else if (course) {
        selectRef.current(course.dataset.course!);
      } else {
        selectRef.current(null);
      }
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    return () => {
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('pointercancel', onUp);
      cancelAnimationFrame(anim.current);
    };
  }, [setView, zoomAt]);

  // Keyboard: arrows pan, +/- zoom, Enter opens the focused course, Escape clears.
  const onMapKey = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    const v = view.current;
    const pan: Record<string, [number, number]> = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] };
    if (pan[e.key]) {
      e.preventDefault();
      touched.current = true;
      setView(v.x + pan[e.key][0], v.y + pan[e.key][1], v.k);
    } else if (e.key === '+' || e.key === '=') zoomBy(1.25);
    else if (e.key === '-') zoomBy(1 / 1.25);
    else if (e.key === 'Escape' && sel) select(null);
  };
  const onCourseKey = (e: ReactKeyboardEvent, id: string) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    select(id);
  };
  // Bring a course into view when it receives keyboard focus.
  const onFocusIn = (e: ReactFocusEvent<SVGSVGElement>) => {
    const id = (e.target as Element).closest<SVGElement>('[data-course]')?.dataset.course;
    if (!id) return;
    const p = L.pos[id];
    const v = view.current;
    const fr = freeRect();
    const sx = p.x * v.k + v.x,
      sy = p.y * v.k + v.y;
    if (sx < 0 || sy < fr.top || sx + BOX_W * v.k > fr.w || sy + 60 * v.k > fr.top + fr.h) centerOn(p.x + BOX_W / 2, p.y + Math.min(p.h, 300) / 2, Math.max(v.k, 0.5));
  };

  /* highlight: the chosen course, the courses before it, and the ones that follow */
  const chain = useMemo(() => (sel ? prerequisiteChain(COURSES, sel) : []), [sel]);
  const next = useMemo(() => (sel ? nextCourses(COURSES, sel) : []), [sel]);
  const onPath = new Set(sel ? [...chain, sel] : []);
  const courseClass = (id: string) => (id === sel ? 'sel' : chain.includes(id) ? 'anc' : next.includes(id) ? 'desc' : '');
  const edgeClass = (from: string, to: string) => (sel && onPath.has(from) && onPath.has(to) ? 'on' : sel && from === sel && next.includes(to) ? 'next' : '');

  const selected = sel ? COURSES.find((c) => c.id === sel) : undefined;
  const subjectOfSel: Subject | undefined = selected && SUBJECTS.find((s) => s.id === selected.subject);
  const levelOf = Object.fromEntries(COURSES.map((c) => [c.id, c.level]));

  return (
    <div className="lmap" ref={frameRef}>
        <svg
          ref={svgRef}
          className={'lm-svg' + (sel ? ' has-sel' : '')}
          data-zoom={mode}
          role="application"
          aria-label="과목 지도. 끌어서 옮기고, 휠이나 두 손가락으로 확대합니다. 화살표 키로 옮기고 +, - 키로 확대할 수 있습니다. 과목을 고르면 그 과목까지 가는 길이 표시됩니다."
          tabIndex={0}
          onKeyDown={onMapKey}
          onFocus={onFocusIn}
        >
          <g ref={worldRef}>
            {LEVEL_IDS.map((l) => (
              <g key={l}>
                <line className="lm-band" x1={16} x2={L.width} y1={L.rowY[l]} y2={L.rowY[l]} />
                <text className="lm-band-name" x={28} y={L.rowY[l] + 52}>
                  {LEVELS[l].name}
                </text>
              </g>
            ))}
            {L.subjects.map((s) => {
              const c = L.cols[s.id];
              return (
                <g key={s.id}>
                  <rect className="lm-region" x={c.x} y={24} width={c.w} height={L.height - 36} rx={14} style={{ fill: `color-mix(in srgb, ${s.color} 5%, transparent)` }} />
                  <text className="lm-region-name" x={c.x + L.colPad} y={100} fill={s.color}>
                    {s.name}
                  </text>
                </g>
              );
            })}
            <g>
              {COURSES.flatMap((c) =>
                (c.prerequisites ?? [])
                  .filter((p) => L.pos[p])
                  .map((p) => {
                    const g = edgeShape(L.pos[p], L.pos[c.id], levelOf[p], c.level);
                    const cls = edgeClass(p, c.id);
                    return (
                      <g key={p + '>' + c.id}>
                        <path className={'lm-edge ' + cls} d={g.d} />
                        <polygon className={'lm-arrow ' + cls} points={g.arrow} />
                      </g>
                    );
                  }),
              )}
            </g>
            {COURSES.map((c) => (
              <CourseBox key={c.id} course={c} progress={progress} {...L.pos[c.id]} classes={courseClass(c.id)} focusLesson={focusLesson} onKey={onCourseKey} />
            ))}
          </g>
        </svg>

        <div className="lm-head" ref={headRef}>
          <div className="lm-top">
            <a className="lm-brand" href="#">
              아틀라스
            </a>
            <LibrarySearch onPick={pick} />
            <button type="button" className="lm-ctl lm-btn" onClick={onList}>
              목록
            </button>
            <ThemeCycleButton className="lm-ctl lm-iconbtn" />
          </div>
          <ResumeLink progress={progress} />
        </div>

        <div className="lm-ctl lm-zoom">
          <button type="button" aria-label="확대" onClick={() => zoomBy(1.4)}>
            +
          </button>
          <button type="button" aria-label="축소" onClick={() => zoomBy(1 / 1.4)}>
            −
          </button>
          <button type="button" aria-label="전체 보기" title="전체 보기" onClick={() => fitAll()}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>
        </div>

        {selected && (
          <aside className="lm-ctl lm-panel" ref={panelRef} aria-label={`${selected.title} 자세히`}>
            <div className="lm-panel-head">
              <span className="eyebrow">
                {subjectOfSel!.name} · {LEVELS[selected.level].name}
              </span>
              <button type="button" className="lm-icon" aria-label="닫기" onClick={() => select(null)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="lm-panel-body">
              <PanelCourse course={selected} progress={progress} focusLesson={focusLesson} onSelect={(id, lesson) => select(id, { lesson })} />
            </div>
          </aside>
        )}
    </div>
  );
}
