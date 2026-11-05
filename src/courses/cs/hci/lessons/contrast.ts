/*
 * 접근성: colour arithmetic for the contrast checker and the colour-vision figure.
 * No imports, so node can run it directly for checking the numbers in the prose.
 */

export type RGB8 = [number, number, number];

export function hexToRgb(hex: string): RGB8 {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(c: RGB8): string {
  return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** sRGB channel 0..255 → linear light 0..1 (the WCAG 2 formula). */
export function toLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear light 0..1 → sRGB channel 0..255. */
export function fromLinear(l: number): number {
  const c = Math.max(0, Math.min(1, l));
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
}

/** WCAG relative luminance, 0 (black) .. 1 (white). */
export function luminance(c: RGB8): number {
  return 0.2126 * toLinear(c[0]) + 0.7152 * toLinear(c[1]) + 0.0722 * toLinear(c[2]);
}

/** WCAG contrast ratio between two colours, 1 .. 21. Order does not matter. */
export function contrast(a: RGB8, b: RGB8): number {
  const la = luminance(a), lb = luminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 2 thresholds for text: AA and AAA, normal and large text. */
export const THRESHOLDS = [
  { id: 'aa-normal', level: 'AA', size: '보통 글자', min: 4.5 },
  { id: 'aa-large', level: 'AA', size: '큰 글자', min: 3 },
  { id: 'aaa-normal', level: 'AAA', size: '보통 글자', min: 7 },
  { id: 'aaa-large', level: 'AAA', size: '큰 글자', min: 4.5 },
] as const;

/** Ratio rounded down to two decimals, as checkers report it (4.499 must not show as a pass). */
export const fmtRatio = (r: number) => (Math.floor(r * 100) / 100).toFixed(2);

/* ───────── colour-vision deficiency ───────── */

export type Cvd = 'normal' | 'protan' | 'deutan' | 'tritan';

/**
 * Simulation matrices for complete dichromacy (severity 1.0) from Machado, Oliveira and
 * Fernandes (2009), applied to linear RGB. They are approximations of an average viewer.
 */
const CVD: Record<Exclude<Cvd, 'normal'>, number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export const CVD_KO: Record<Cvd, string> = {
  normal: '보통 색각',
  protan: '적색맹 (protanopia)',
  deutan: '녹색맹 (deuteranopia)',
  tritan: '청색맹 (tritanopia)',
};

export function simulate(c: RGB8, kind: Cvd): RGB8 {
  if (kind === 'normal') return c;
  const m = CVD[kind];
  const lin = c.map(toLinear);
  return m.map((row) => fromLinear(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])) as RGB8;
}

/** Straight-line distance between two colours in linear RGB, 0 (same) .. √3. A rough "how different". */
export function linDistance(a: RGB8, b: RGB8): number {
  const la = a.map(toLinear), lb = b.map(toLinear);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}
