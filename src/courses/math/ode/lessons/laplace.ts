/*
 * 미분방정식 · 라플라스 변환: the numbers behind the figures.
 * No imports, so node can run it directly for checking the prose.
 */

/* ───────── the transform as an integral ───────── */

export interface Pair {
  id: string;
  /** f(t) as TeX and as a function. */
  ft: string;
  f: (t: number) => number;
  /** F(s) as TeX and as a function; defined for s > abscissa. */
  Fs: string;
  F: (s: number) => number;
  /** The integral converges for s greater than this. */
  abscissa: number;
}

export const PAIRS: Pair[] = [
  { id: 'one', ft: '1', f: () => 1, Fs: '\\dfrac{1}{s}', F: (s) => 1 / s, abscissa: 0 },
  { id: 't', ft: 't', f: (t) => t, Fs: '\\dfrac{1}{s^2}', F: (s) => 1 / (s * s), abscissa: 0 },
  { id: 'exp', ft: 'e^{-t}', f: (t) => Math.exp(-t), Fs: '\\dfrac{1}{s+1}', F: (s) => 1 / (s + 1), abscissa: -1 },
  { id: 'sin', ft: '\\sin 2t', f: (t) => Math.sin(2 * t), Fs: '\\dfrac{2}{s^2+4}', F: (s) => 2 / (s * s + 4), abscissa: 0 },
  { id: 'cos', ft: '\\cos 2t', f: (t) => Math.cos(2 * t), Fs: '\\dfrac{s}{s^2+4}', F: (s) => s / (s * s + 4), abscissa: 0 },
  { id: 'texp', ft: 't\\,e^{-t}', f: (t) => t * Math.exp(-t), Fs: '\\dfrac{1}{(s+1)^2}', F: (s) => 1 / ((s + 1) * (s + 1)), abscissa: -1 },
];

/** ∫₀^T g(t) dt by composite Simpson with n (even) panels. */
export function simpson(g: (t: number) => number, a: number, b: number, n = 2000): number {
  const m = n % 2 ? n + 1 : n;
  const h = (b - a) / m;
  let s = g(a) + g(b);
  for (let i = 1; i < m; i++) s += (i % 2 ? 4 : 2) * g(a + i * h);
  return (s * h) / 3;
}

/** The Laplace integral ∫₀^T e^{−st} f(t) dt, truncated at T where e^{−sT} is negligible. */
export function laplaceNumeric(f: (t: number) => number, s: number, T = 0): number {
  const end = T || Math.min(400, 40 / Math.max(s, 0.1));
  return simpson((t) => Math.exp(-s * t) * f(t), 0, end, 8000);
}

/* ───────── a worked example: y″ + 3y′ + 2y = 1, y(0) = 1, y′(0) = 0 ───────── */

/** The answer the partial fractions give: y = 1/2 + e^{−t} − (1/2) e^{−2t}. */
export const exampleExact = (t: number) => 0.5 + Math.exp(-t) - 0.5 * Math.exp(-2 * t);

/** Integrate y″ = u − a y′ − b y with RK4, to check the formula independently. */
export function secondOrderRK4(a: number, b: number, u: (t: number) => number, y0: number, v0: number, T: number, n: number): { t: number[]; y: number[]; v: number[] } {
  const h = T / n;
  const ts = [0], ys = [y0], vs = [v0];
  let y = y0, v = v0;
  const acc = (t: number, y: number, v: number) => u(t) - a * v - b * y;
  for (let i = 0; i < n; i++) {
    const t = i * h;
    const k1y = v, k1v = acc(t, y, v);
    const k2y = v + (h / 2) * k1v, k2v = acc(t + h / 2, y + (h / 2) * k1y, v + (h / 2) * k1v);
    const k3y = v + (h / 2) * k2v, k3v = acc(t + h / 2, y + (h / 2) * k2y, v + (h / 2) * k2v);
    const k4y = v + h * k3v, k4v = acc(t + h, y + h * k3y, v + h * k3v);
    y += (h / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    ts.push(t + h);
    ys.push(y);
    vs.push(v);
  }
  return { t: ts, y: ys, v: vs };
}

/* ───────── a second-order system with poles σ ± iω ───────── */

/**
 * H(s) = (σ² + ω²) / ((s − p)(s − p̄)), p = σ + iω: unit gain at s = 0, so a stable system's
 * step response settles at 1. The ODE is y″ − 2σ y′ + (σ² + ω²) y = (σ² + ω²) u.
 */
export interface Poles {
  sigma: number;
  omega: number;
}

export function stepResponse(p: Poles, T: number, n: number): { t: number[]; y: number[]; h: number[] } {
  const k = p.sigma * p.sigma + p.omega * p.omega;
  const r = secondOrderRK4(-2 * p.sigma, k, () => k, 0, 0, T, n);
  // impulse response = derivative of the step response
  return { t: r.t, y: r.y, h: r.v };
}

export interface StepStats {
  stable: boolean;
  /** Peak overshoot above the final value 1, as a fraction (0 if none). */
  overshoot: number;
  /** First time the response stays within 2% of 1, or null if it never does in the window. */
  settle: number | null;
  peakTime: number | null;
}

export function stepStats(p: Poles, T = 20, n = 4000): StepStats {
  const { t, y } = stepResponse(p, T, n);
  const stable = p.sigma < 0;
  let peak = -Infinity, peakTime: number | null = null;
  y.forEach((v, i) => {
    if (v > peak) {
      peak = v;
      peakTime = t[i];
    }
  });
  let settle: number | null = null;
  if (stable) {
    for (let i = y.length - 1; i >= 0; i--) {
      if (Math.abs(y[i] - 1) > 0.02) {
        settle = i === y.length - 1 ? null : t[i + 1];
        break;
      }
      if (i === 0) settle = 0;
    }
  }
  // an overshoot under 0.1% is numerical noise around a monotone approach, not a peak
  const real = stable && peak > 1.001;
  return { stable, overshoot: real ? peak - 1 : 0, settle, peakTime: real ? peakTime : null };
}

/* ───────── convolution ───────── */

/** Impulse response of the default system (poles −1 ± 2i, unit DC gain): h(t) = (5/2) e^{−t} sin 2t. */
export const hDefault = (t: number) => (t < 0 ? 0 : 2.5 * Math.exp(-t) * Math.sin(2 * t));

export type InputKind = 'pulse' | 'step' | 'twoPulses';
export const inputFn = (kind: InputKind) => (t: number): number => {
  if (t < 0) return 0;
  if (kind === 'pulse') return t < 1 ? 1 : 0;
  if (kind === 'step') return 1;
  return t < 0.5 ? 1 : t >= 2 && t < 2.5 ? -1 : 0;
};

/** (u * h)(t) = ∫₀ᵗ u(τ) h(t − τ) dτ, by Simpson. */
export function convolve(u: (t: number) => number, h: (t: number) => number, t: number, n = 1200): number {
  if (t <= 0) return 0;
  return simpson((tau) => u(tau) * h(t - tau), 0, t, n);
}
