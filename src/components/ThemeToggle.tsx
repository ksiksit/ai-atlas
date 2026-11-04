import { useEffect, useState } from 'react';
import { loadThemeMode, setThemeMode, type ThemeMode } from '../lib/theme';

/** One theme setting shared by every toggle on the page. */
let current: ThemeMode = loadThemeMode();
const listeners = new Set<(m: ThemeMode) => void>();
function choose(m: ThemeMode) {
  current = m;
  setThemeMode(m);
  listeners.forEach((l) => l(m));
}
function useThemeMode(): ThemeMode {
  const [m, setM] = useState(current);
  useEffect(() => {
    listeners.add(setM);
    setM(current);
    return () => {
      listeners.delete(setM);
    };
  }, []);
  return m;
}

const MODES: [ThemeMode, string][] = [
  ['system', '자동'],
  ['light', '밝게'],
  ['dark', '어둡게'],
];

/** 자동 · 밝게 · 어둡게, side by side (the course rail). */
export function ThemeToggle() {
  const mode = useThemeMode();
  useEffect(() => setThemeMode(mode), [mode]);
  return (
    <div className="theme-toggle" role="group" aria-label="화면 테마">
      {MODES.map(([m, l]) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => choose(m)}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** One icon button that steps through 자동 → 밝게 → 어둡게 (the library map). */
export function ThemeCycleButton({ className }: { className?: string }) {
  const mode = useThemeMode();
  const i = MODES.findIndex(([m]) => m === mode);
  const [nextMode, nextLabel] = MODES[(i + 1) % MODES.length];
  const label = `화면 테마: ${MODES[i][1]} (누르면 ${nextLabel})`;
  return (
    <button type="button" className={className} aria-label={label} title={label} onClick={() => choose(nextMode)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {mode === 'light' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : mode === 'dark' ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
          </>
        )}
      </svg>
    </button>
  );
}
