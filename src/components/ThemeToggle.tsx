import { useEffect, useState } from 'react';
import { loadThemeMode, setThemeMode, type ThemeMode } from '../lib/theme';

const MODES: { mode: ThemeMode; label: string; to: string; icon: JSX.Element }[] = [
  {
    mode: 'system',
    label: '자동',
    to: '자동으로',
    icon: (
      <>
        <circle cx="8" cy="8" r="5.6" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <path d="M8 2.4a5.6 5.6 0 0 0 0 11.2z" fill="currentColor" />
      </>
    ),
  },
  {
    mode: 'light',
    label: '밝게',
    to: '밝게로',
    icon: (
      <>
        <circle cx="8" cy="8" r="2.8" fill="currentColor" />
        <path d="M8 1.2v1.8M8 13v1.8M1.2 8h1.8M13 8h1.8M3.2 3.2l1.3 1.3M11.5 11.5l1.3 1.3M3.2 12.8l1.3-1.3M11.5 4.5l1.3-1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </>
    ),
  },
  {
    mode: 'dark',
    label: '어둡게',
    to: '어둡게로',
    icon: <path d="M12.8 10.4A5.6 5.6 0 0 1 5.6 3.2a5.6 5.6 0 1 0 7.2 7.2z" fill="currentColor" />,
  },
];

/** One button in the top bar that cycles 자동 → 밝게 → 어둡게. */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(loadThemeMode);
  useEffect(() => setThemeMode(mode), [mode]);
  const i = Math.max(0, MODES.findIndex((m) => m.mode === mode));
  const cur = MODES[i];
  const next = MODES[(i + 1) % MODES.length];
  return (
    <button className="bar-btn icon" type="button" onClick={() => setMode(next.mode)} aria-label={`화면 테마: ${cur.label}. 누르면 ${next.to} 바뀝니다`} title={`화면 테마: ${cur.label}`}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {cur.icon}
      </svg>
    </button>
  );
}
