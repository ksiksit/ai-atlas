import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { LEVELS, MAJORS, ROLES, SUBJECTS, courseCode, courseHref, findCourse, lessonHref, lessonNo, majorHref, type Course, type CourseRole, type Level, type Major } from '../courses';
import '../styles/library.css';

const ROLE_ORDER: CourseRole[] = ['base', 'core', 'elect'];
const STAGES: Level[] = [1, 2, 3];
/** A course longer than this lists its lessons in two columns inside its card. */
const LONG = 10;
const subjectOf = (id: string) => SUBJECTS.find((s) => s.id === id)!;
const vars = (v: Record<string, string>) => v as CSSProperties;

/** Prerequisite arrow between two cards, in the chart's own pixel space. */
interface Edge {
  from: string;
  to: string;
  d: string;
  head: string;
}

/** Courses before `id` inside this major, earliest first. */
function chainWithin(ids: string[], id: string, acc: string[] = []): string[] {
  for (const p of findCourse(id)?.prerequisites ?? []) {
    if (!ids.includes(p) || acc.includes(p)) continue;
    chainWithin(ids, p, acc);
    acc.push(p);
  }
  return acc;
}

function CourseCard({ course, major, refFor }: { course: Course; major: Major; refFor: (el: HTMLElement | null) => void }) {
  const subject = subjectOf(course.subject);
  const prereqs = (course.prerequisites ?? []).map((p) => findCourse(p)).filter((c): c is Course => !!c);
  return (
    <article ref={refFor} className={'mj-card' + (course.lessons.length > LONG ? ' long' : '')} data-id={course.id} style={vars({ '--sc': subject.color })}>
      <span className="mj-code">{courseCode(course)}</span>
      <a className="mj-title" href={courseHref(course.id)}>
        {course.title}
      </a>
      <span className="mj-meta">
        {course.parts.length}개 단원 · {course.lessons.length}장 · {prereqs.length ? `선수 ${prereqs.map(courseCode).join(', ')}` : '선수 없음'}
      </span>
      {course.subject !== major.subject && <span className="mj-from">{subject.name} 분야 과목</span>}
      <div className="mj-units">
        {course.parts.map((p) => (
          <section key={p.id} className="mj-unit">
            <h4>{p.title}</h4>
            <ol>
              {course.lessons
                .filter((l) => l.part === p.id)
                .map((l) => (
                  <li key={l.id}>
                    <a href={lessonHref(course.id, l.id)}>
                      <span className="no">{lessonNo(course, l)}</span>
                      <span className="t">{l.title}</span>
                    </a>
                  </li>
                ))}
            </ol>
          </section>
        ))}
      </div>
    </article>
  );
}

/** One major's curriculum chart (이수체계도): roles are rows, levels are columns, arrows are prerequisites. */
export default function MajorPage({ major }: { major: Major }) {
  const entries = major.courses.map((x) => ({ course: findCourse(x.course)!, role: x.role }));
  const ids = entries.map((e) => e.course.id);
  const lessons = entries.reduce((s, e) => s + e.course.lessons.length, 0);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [point, setPoint] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cards = useRef<Record<string, HTMLElement | null>>({});

  // Arrows are measured from the laid-out cards: right edge to left edge within a row,
  // bottom to top when the next course sits in the same column further down.
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const box = wrap.getBoundingClientRect();
    const rects = new Map(ids.map((id) => [id, cards.current[id]?.getBoundingClientRect()] as const));
    const pairs = ids.flatMap((id) => (findCourse(id)?.prerequisites ?? []).filter((p) => rects.get(p) && rects.get(id)).map((p) => ({ from: p, to: id, a: rects.get(p)!, b: rects.get(id)! })));
    // Several courses in one column can send arrows across the same gap. Each source gets its own
    // vertical lane in that gap, so two arrows never merge into one line.
    const lanes = new Map<number, string[]>();
    for (const { from, a, b } of pairs) {
      if (b.left <= a.right - 1) continue;
      const key = Math.round(a.right);
      const list = lanes.get(key) ?? [];
      if (!list.includes(from)) list.push(from);
      lanes.set(key, list);
    }
    for (const list of lanes.values()) list.sort((p, q) => rects.get(p)!.top - rects.get(q)!.top);
    const out: Edge[] = [];
    for (const { from, to, a, b } of pairs) {
      const y1 = a.top + 40 - box.top, y2 = b.top + 40 - box.top;
      if (b.left > a.right - 1) {
        const x1 = a.right - box.left, x2 = b.left - box.left - 8;
        const lane = lanes.get(Math.round(a.right))!;
        // upper sources take the lanes nearer the target, so their long drops do not cut across the others' starts
        const k = lane.length - lane.indexOf(from);
        const mx = x1 + ((x2 - x1) * k) / (lane.length + 1);
        out.push({ from, to, d: Math.abs(y1 - y2) < 2 ? `M${x1} ${y1} H${x2}` : `M${x1} ${y1} H${mx} V${y2} H${x2}`, head: `${x2},${y2 - 4.5} ${x2 + 8},${y2} ${x2},${y2 + 4.5}` });
      } else if (b.top > a.bottom - 1) {
        const between = [...rects.entries()].some(([id, r]) => id !== from && id !== to && r && r.left < a.right && r.right > a.left && r.top > a.bottom - 1 && r.bottom < b.top + 1);
        if (!between) {
          const x = a.left + 28 - box.left, ys = a.bottom - box.top, ye = b.top - box.top - 8;
          out.push({ from, to, d: `M${x} ${ys} V${ye}`, head: `${x - 4.5},${ye} ${x + 4.5},${ye} ${x},${ye + 8}` });
        } else {
          // another card sits in between: go around it through the gap on the left
          const x1 = a.left - box.left, x = x1 - 22, x2 = b.left - box.left - 8;
          out.push({ from, to, d: `M${x1} ${y1} H${x} V${y2} H${x2}`, head: `${x2},${y2 - 4.5} ${x2 + 8},${y2} ${x2},${y2 + 4.5}` });
        }
      }
    }
    setEdges(out);
    setSize({ w: box.width, h: box.height });
    // Depends only on the major: `ids` comes from it, and the page is keyed by major id.
  }, [major.id]);

  useLayoutEffect(() => {
    measure();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(wrap);
    document.fonts?.ready.then(measure);
    return () => ro?.disconnect();
  }, [measure]);

  const chain = point ? chainWithin(ids, point) : [];
  const next = point ? ids.filter((id) => findCourse(id)?.prerequisites?.includes(point)) : [];
  const path = new Set(point ? [...chain, point] : []);
  const lit = new Set([...path, ...next]);
  const edgeOn = (e: Edge) => (path.has(e.from) && path.has(e.to)) || (e.from === point && next.includes(e.to));
  const cardAt = (el: EventTarget | null) => (el as HTMLElement | null)?.closest?.<HTMLElement>('.mj-card')?.dataset.id ?? null;

  return (
    <div className="major-page" style={vars({ '--sc': subjectOf(major.subject).color })}>
      <nav className="crumbs" aria-label="현재 위치">
        <a href="#">전공 안내</a>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{major.name}</span>
      </nav>

      <header className="major-head">
        <span className="major-en">{major.en}</span>
        <h1>{major.name} 이수체계도</h1>
        <p className="hero-lede">{major.blurb}</p>
        <p className="home-count">
          <span className="mono">{entries.length}</span>개 과목 · <span className="mono">{lessons}</span>개 장 · 왼쪽 위에서 시작해 화살표를 따라가세요
        </p>
      </header>

      <div className="mj-wrap" ref={wrapRef}>
        <div
          className="mj-grid"
          data-point={point ?? undefined}
          onMouseOver={(e) => setPoint(cardAt(e.target))}
          onMouseLeave={() => setPoint(null)}
          onFocus={(e) => setPoint(cardAt(e.target))}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setPoint(null);
          }}
        >
          <div className="mj-hd" aria-hidden="true" />
          {STAGES.map((l) => (
            <div key={l} className="mj-hd">
              <b>
                {l}단계 · {LEVELS[l].name}
              </b>
              <span>{l}00번대</span>
            </div>
          ))}
          {ROLE_ORDER.map((role) => {
            const row = entries.filter((e) => e.role === role).map((e) => e.course);
            if (!row.length) return null;
            return [
              <div key={role} className="mj-role">
                <b>{ROLES[role].name}</b>
                <span>{ROLES[role].blurb}</span>
              </div>,
              ...STAGES.map((l) => {
                const here = row.filter((c) => c.level === l);
                return (
                  <div key={role + l} className={'mj-slot' + (here.length ? '' : ' empty')}>
                    {here.map((c) => (
                      <div key={c.id} className="mj-cell" data-lit={lit.has(c.id) || undefined}>
                        <CourseCard course={c} major={major} refFor={(el) => (cards.current[c.id] = el)} />
                      </div>
                    ))}
                  </div>
                );
              }),
            ];
          })}
        </div>
        <svg className="mj-links" width={size.w} height={size.h} viewBox={`0 0 ${size.w || 1} ${size.h || 1}`} aria-hidden="true" data-point={point ?? undefined}>
          {edges.map((e) => (
            <g key={e.from + '>' + e.to} className={edgeOn(e) ? 'on' : undefined}>
              <path d={e.d} />
              <polygon points={e.head} />
            </g>
          ))}
        </svg>
      </div>

      <p className="mj-legend">
        <svg viewBox="0 0 26 10" aria-hidden="true">
          <path d="M0 5H18" />
          <polygon points="18,1 25,5 18,9" />
        </svg>
        먼저 들을 과목 → 다음 과목. 과목에 마우스를 올리면 그 과목까지 가는 길이 진해집니다.
      </p>

      <nav className="mj-others" aria-label="다른 전공">
        <span>다른 전공</span>
        {MAJORS.filter((m) => m.id !== major.id).map((m) => (
          <a key={m.id} href={majorHref(m.id)}>
            {m.name}
          </a>
        ))}
        <a href="#">전공 안내</a>
      </nav>
    </div>
  );
}
