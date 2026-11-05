/* 미적분학 · 미분: pure helpers for the figures (no imports, so node can run them). */

/** Forward difference quotient (f(a + h) − f(a)) / h. */
export const diffQuot = (f: (x: number) => number, a: number, h: number) => (f(a + h) - f(a)) / h;

/** The difference quotient of e^x at x = 1 for h = 10^-1 … 10^-kMax, with its error against e. */
export function floatTable(kMax = 16) {
  const rows: { k: number; h: number; q: number; err: number }[] = [];
  for (let k = 1; k <= kMax; k++) {
    const h = Math.pow(10, -k);
    const q = diffQuot(Math.exp, 1, h);
    rows.push({ k, h, q, err: Math.abs(q - Math.E) });
  }
  return rows;
}

export interface Preset {
  id: string;
  name: string;
  tex: string;
  dtex: string;
  f: (x: number) => number;
  df: (x: number) => number;
  x0: number;
  xLo: number;
  xHi: number;
  yLo: number;
  yHi: number;
}

export const PRESETS: Preset[] = [
  { id: 'sq', name: 'x²', tex: 'x^2', dtex: '2x', f: (x) => x * x, df: (x) => 2 * x, x0: 1, xLo: -3, xHi: 3, yLo: -4, yHi: 6 },
  { id: 'cubic', name: 'x³ − 3x', tex: 'x^3-3x', dtex: '3x^2-3', f: (x) => x * x * x - 3 * x, df: (x) => 3 * x * x - 3, x0: 0.5, xLo: -2.6, xHi: 2.6, yLo: -5, yHi: 5 },
  { id: 'sin', name: 'sin x', tex: '\\sin x', dtex: '\\cos x', f: Math.sin, df: Math.cos, x0: 1, xLo: -6.5, xHi: 6.5, yLo: -1.8, yHi: 1.8 },
  { id: 'exp', name: 'eˣ', tex: 'e^x', dtex: 'e^x', f: Math.exp, df: Math.exp, x0: 0.5, xLo: -3, xHi: 2.2, yLo: -1, yHi: 7 },
  { id: 'ln', name: 'ln x', tex: '\\ln x', dtex: '\\dfrac{1}{x}', f: (x) => (x > 0 ? Math.log(x) : NaN), df: (x) => (x > 0 ? 1 / x : NaN), x0: 1, xLo: -0.5, xHi: 5, yLo: -3, yHi: 3 },
  { id: 'abs', name: '|x|', tex: '|x|', dtex: '\\begin{cases}-1 & x<0\\\\ 1 & x>0\\end{cases}', f: Math.abs, df: (x) => (x === 0 ? NaN : Math.sign(x)), x0: 1, xLo: -3, xHi: 3, yLo: -2, yHi: 3 },
];

/** Product rule pieces: area u·v grows to (u + du)(v + dv). */
export function productPieces(u: number, v: number, du: number, dv: number) {
  const before = u * v;
  const after = (u + du) * (v + dv);
  return { before, after, change: after - before, uDv: u * dv, vDu: v * du, duDv: du * dv };
}

/** Chain rule demo: x → u = x² → y = sin u. Nudging x by dx. */
export function chainNudge(x: number, dx: number) {
  const u = x * x, y = Math.sin(u);
  const u2 = (x + dx) * (x + dx), y2 = Math.sin(u2);
  const dudx = 2 * x, dydu = Math.cos(u);
  return { u, y, du: u2 - u, dy: y2 - y, dudx, dydu, dydx: dydu * dudx };
}
