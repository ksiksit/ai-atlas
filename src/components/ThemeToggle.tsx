import { useEffect, useState } from 'react';
import { loadThemeMode, setThemeMode, type ThemeMode } from '../lib/theme';

const MODES: [ThemeMode, string][] = [
  ['system', '자동'],
  ['light', '밝게'],
  ['dark', '어둡게'],
];

/** 자동 · 밝게 · 어둡게, side by side, at the foot of the rail. */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(loadThemeMode);
  useEffect(() => setThemeMode(mode), [mode]);
  return (
    <div className="theme-toggle" role="group" aria-label="화면 테마">
      {MODES.map(([m, l]) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
          {l}
        </button>
      ))}
    </div>
  );
}
