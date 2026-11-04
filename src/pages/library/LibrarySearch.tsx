import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { COURSES, SUBJECTS, type Course, type Lesson, type Subject } from '../../courses';

export type SearchHit = { kind: 'subject'; subject: Subject } | { kind: 'course'; course: Course } | { kind: 'lesson'; course: Course; lesson: Lesson };

interface Entry {
  hit: SearchHit;
  kind: string;
  title: string;
  where: string;
  hay: string;
}

const KIND = { subject: '분야', course: '과목', lesson: '장' } as const;
const MAX_RESULTS = 9;

function buildIndex(): Entry[] {
  const out: Entry[] = [];
  for (const s of SUBJECTS) out.push({ hit: { kind: 'subject', subject: s }, kind: KIND.subject, title: s.name, where: '', hay: `${s.name} ${s.en}`.toLowerCase() });
  for (const c of COURSES) {
    const subject = SUBJECTS.find((s) => s.id === c.subject)?.name ?? '';
    out.push({ hit: { kind: 'course', course: c }, kind: KIND.course, title: c.title, where: subject, hay: `${c.title} ${c.subtitle}`.toLowerCase() });
    for (const l of c.lessons) out.push({ hit: { kind: 'lesson', course: c, lesson: l }, kind: KIND.lesson, title: l.title, where: c.title, hay: `${l.title} ${l.en}`.toLowerCase() });
  }
  return out;
}

/** Search box for subjects, courses and lessons by Korean or English name. Press / to focus it. */
export default function LibrarySearch({ onPick }: { onPick: (hit: SearchHit) => void }) {
  const index = useMemo(buildIndex, []);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const term = q.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!term) return [];
    const starts = (e: Entry) => (e.hay.startsWith(term) ? 0 : 1);
    return index
      .filter((e) => e.hay.includes(term))
      .sort((a, b) => starts(a) - starts(b))
      .slice(0, MAX_RESULTS);
  }, [index, term]);
  const shown = open && !!term;

  useEffect(() => setActive(0), [term]);

  // "/" jumps to the search box from anywhere on the library page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, []);

  const choose = (i: number) => {
    const e = hits[i];
    if (!e) return;
    setOpen(false);
    inputRef.current?.blur();
    onPick(e.hit);
  };

  return (
    <div className="lib-search" ref={boxRef}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="과목이나 장 찾기"
        aria-expanded={shown}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={shown && hits.length ? `${id}-${active}` : undefined}
        autoComplete="off"
        placeholder="과목이나 장 찾기 (예: 어텐션, TLS, p값)"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (shown) setOpen(false);
            else setQ('');
            return;
          }
          if (!shown || !hits.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => (a + 1) % hits.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => (a - 1 + hits.length) % hits.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(active);
          }
        }}
      />
      <kbd aria-hidden="true">/</kbd>
      {shown && (
        <ul className="lib-search-results" id={`${id}-list`} role="listbox" aria-label="찾은 과목과 장">
          {hits.length ? (
            hits.map((e, i) => (
              <li
                key={i}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                onPointerDown={(ev) => {
                  ev.preventDefault();
                  choose(i);
                }}
                onPointerEnter={() => setActive(i)}
              >
                <span className="kind">{e.kind}</span>
                <span className="ttl">{e.title}</span>
                <span className="where">{e.where}</span>
              </li>
            ))
          ) : (
            <li className="empty" role="option" aria-selected={false} aria-disabled="true">
              '{q.trim()}'와 맞는 과목이나 장이 없습니다
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
