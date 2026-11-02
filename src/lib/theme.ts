import { useEffect, useState } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';

/** Resolved palette read from CSS custom properties, for use inside canvas / WebGL. */
export interface Palette {
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  lineStrong: string;
  grid: string;
  accent: string;
  accentSoft: string;
  math: string;
  ml: string;
  dl: string;
  pos: string;
  neg: string;
  posSoft: string;
  negSoft: string;
  hl: string;
  good: string;
  bad: string;
  fontBody: string;
  fontMono: string;
}

const VARS: Record<Exclude<keyof Palette, 'dark'>, string> = {
  bg: '--bg',
  surface: '--surface',
  surface2: '--surface-2',
  surface3: '--surface-3',
  ink: '--ink',
  ink2: '--ink-2',
  ink3: '--ink-3',
  line: '--line',
  lineStrong: '--line-strong',
  grid: '--grid',
  accent: '--accent',
  accentSoft: '--accent-soft',
  math: '--c-math',
  ml: '--c-ml',
  dl: '--c-dl',
  pos: '--pos',
  neg: '--neg',
  posSoft: '--pos-soft',
  negSoft: '--neg-soft',
  hl: '--hl',
  good: '--good',
  bad: '--bad',
  fontBody: '--font-body',
  fontMono: '--font-mono',
};

export function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const out: Partial<Palette> = {};
  for (const [k, v] of Object.entries(VARS)) {
    (out as Record<string, string>)[k] = cs.getPropertyValue(v).trim();
  }
  out.dark = isDark();
  return out as Palette;
}

export function isDark(): boolean {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let cached: Palette | null = null;
let installed = false;

function install() {
  if (installed) return;
  installed = true;
  const fire = () => {
    cached = readPalette();
    listeners.forEach((l) => l());
  };
  new MutationObserver(fire).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fire);
}

export function getPalette(): Palette {
  install();
  if (!cached) cached = readPalette();
  return cached;
}

/** React hook: current palette; re-renders when the theme changes. */
export function usePalette(): Palette {
  const [p, setP] = useState<Palette>(getPalette);
  useEffect(() => {
    install();
    const l = () => setP(getPalette());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return p;
}

export function setThemeMode(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  try {
    localStorage.setItem('atlas-theme', mode);
  } catch {
    /* storage unavailable */
  }
}

export function loadThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem('atlas-theme');
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

/** Mix a CSS color with alpha. Accepts #rgb/#rrggbb/rgb()/rgba(). */
export function alpha(color: string, a: number): string {
  const c = parseColor(color);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export function parseColor(color: string): [number, number, number, number] {
  color = color.trim();
  if (color.startsWith('#')) {
    let h = color.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  }
  return [128, 128, 128, 1];
}

/** Linear interpolation between two colors, t in [0,1]. Returns [r,g,b]. */
export function lerpColor(a: string, b: string, t: number): [number, number, number] {
  const ca = parseColor(a);
  const cb = parseColor(b);
  return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
}

export function rgbStr(c: [number, number, number], a = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}
