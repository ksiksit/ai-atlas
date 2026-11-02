import { Suspense, useEffect, useState, type CSSProperties } from 'react';
import { LESSONS, PARTS, lessonIndex, lessonNo, partOf, type Lesson } from './curriculum';
import { loadThemeMode, setThemeMode, type ThemeMode } from './lib/theme';
import Home from './pages/Home';

function useRoute(): string {
  const get = () => decodeURIComponent(window.location.hash.replace(/^#/, ''));
  const [r, setR] = useState(get);
  useEffect(() => {
    const on = () => setR(get());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(loadThemeMode);
  useEffect(() => setThemeMode(mode), [mode]);
  const opts: [ThemeMode, string][] = [
    ['system', '자동'],
    ['light', '밝게'],
    ['dark', '어둡게'],
  ];
  return (
    <div className="theme-toggle" role="group" aria-label="화면 테마">
      {opts.map(([m, l]) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function BrandMark() {
  return (
    <span className="brand-mark">
      벡터에서<span className="arrow">→</span>
      <br />
      트랜스포머까지
    </span>
  );
}

function Rail({ route, open, onNavigate }: { route: string; open: boolean; onNavigate: () => void }) {
  return (
    <nav className="rail" data-open={open} aria-label="목차">
      <a className="brand" href="#" onClick={onNavigate}>
        <BrandMark />
        <span className="brand-sub">손으로 만지며 배우는 인공지능</span>
      </a>
      {PARTS.map((p) => (
        <div className="rail-part" key={p.id} style={{ ['--part-color' as string]: p.color } as CSSProperties}>
          <div className="rail-part-title">
            <span className="dot" />
            {p.title}
          </div>
          {LESSONS.filter((l) => l.part === p.id).map((l) => (
            <a key={l.id} className="rail-link" href={'#' + l.id} aria-current={route === l.id ? 'page' : undefined} onClick={onNavigate}>
              <span className="num">{lessonNo(l)}</span>
              <span>{l.title}</span>
            </a>
          ))}
        </div>
      ))}
      <div className="rail-foot">
        <ThemeToggle />
      </div>
    </nav>
  );
}

function LessonPage({ lesson }: { lesson: Lesson }) {
  const part = partOf(lesson.part);
  const i = lessonIndex(lesson.id);
  const prev = LESSONS[i - 1];
  const next = LESSONS[i + 1];
  const C = lesson.Component;
  return (
    <article className="lesson" style={{ ['--part-color' as string]: part.color } as CSSProperties}>
      <header className="lesson-head">
        <div className="eyebrow">
          <span className="bar" />
          {part.title} · {lessonNo(lesson)}
        </div>
        <h1 className="lesson-title">{lesson.title}</h1>
        <p className="lesson-lede">{lesson.lede}</p>
        <ul className="learn-list" aria-label="이 장에서 배우는 것">
          {lesson.learn.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </header>
      <Suspense fallback={<div className="loading">불러오는 중…</div>}>
        <C />
      </Suspense>
      <nav className="pager" aria-label="이전·다음 장">
        {prev ? (
          <a href={'#' + prev.id}>
            <span className="dir">← 이전</span>
            <span className="ttl">{prev.title}</span>
          </a>
        ) : (
          <a href="#">
            <span className="dir">← 처음으로</span>
            <span className="ttl">전체 지도</span>
          </a>
        )}
        {next ? (
          <a className="next" href={'#' + next.id}>
            <span className="dir">다음 →</span>
            <span className="ttl">{next.title}</span>
          </a>
        ) : (
          <a className="next" href="#">
            <span className="dir">끝까지 왔습니다 →</span>
            <span className="ttl">전체 지도로</span>
          </a>
        )}
      </nav>
    </article>
  );
}

export default function App() {
  const route = useRoute();
  const [open, setOpen] = useState(false);
  const lesson = LESSONS.find((l) => l.id === route);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setOpen(false);
    document.title = lesson ? `${lesson.title} · 벡터에서 트랜스포머까지` : '벡터에서 트랜스포머까지';
  }, [route, lesson]);

  return (
    <div className="shell">
      <Rail route={route} open={open} onNavigate={() => setOpen(false)} />
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <button className="menu-btn" type="button" aria-label="목차 열기" onClick={() => setOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            </svg>
          </button>
          <a className="brand" href="#" style={{ flexDirection: 'row' }}>
            <span className="brand-mark">
              벡터에서<span className="arrow">→</span>트랜스포머까지
            </span>
          </a>
        </header>
        <main className="main">{lesson ? <LessonPage key={lesson.id} lesson={lesson} /> : <Home />}</main>
      </div>
    </div>
  );
}
