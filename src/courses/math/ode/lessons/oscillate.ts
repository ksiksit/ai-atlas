/* 미분방정식 · 진동: the mass–spring–damper m x″ + c x′ + k x = F cos ωt, solved exactly where possible. */

export type Kind = 'undamped' | 'under' | 'critical' | 'over';
export const KIND_KO: Record<Kind, string> = { undamped: '감쇠 없음', under: '미흡감쇠 (진동)', critical: '임계 감쇠', over: '과감쇠' };

export interface Roots {
  kind: Kind;
  /** Real parts and imaginary parts of the two roots of mλ² + cλ + k = 0. */
  re: [number, number];
  im: [number, number];
}

/** Roots of the characteristic equation mλ² + cλ + k = 0. */
export function roots(m: number, c: number, k: number): Roots {
  const disc = c * c - 4 * m * k;
  const tol = 1e-9 * Math.max(1, c * c, 4 * m * k);
  if (c === 0) {
    const w = Math.sqrt(k / m);
    return { kind: 'undamped', re: [0, 0], im: [w, -w] };
  }
  if (Math.abs(disc) <= tol) return { kind: 'critical', re: [-c / (2 * m), -c / (2 * m)], im: [0, 0] };
  if (disc < 0) {
    const w = Math.sqrt(-disc) / (2 * m);
    return { kind: 'under', re: [-c / (2 * m), -c / (2 * m)], im: [w, -w] };
  }
  const s = Math.sqrt(disc);
  return { kind: 'over', re: [(-c + s) / (2 * m), (-c - s) / (2 * m)], im: [0, 0] };
}

/** Damping ratio ζ = c / (2√(mk)): below 1 oscillates, 1 is critical, above 1 creeps back. */
export const dampingRatio = (m: number, c: number, k: number) => c / (2 * Math.sqrt(m * k));

/** Exact free response x(t) of m x″ + c x′ + k x = 0 with x(0) = x0, x′(0) = v0. */
export function freeResponse(m: number, c: number, k: number, x0: number, v0: number) {
  const r = roots(m, c, k);
  if (r.kind === 'undamped' || r.kind === 'under') {
    const a = r.re[0], w = r.im[0];
    const A = x0, B = (v0 - a * x0) / w;
    return { x: (t: number) => Math.exp(a * t) * (A * Math.cos(w * t) + B * Math.sin(w * t)), envelope: (t: number) => Math.hypot(A, B) * Math.exp(a * t), r };
  }
  if (r.kind === 'critical') {
    const a = r.re[0];
    const A = x0, B = v0 - a * x0;
    return { x: (t: number) => (A + B * t) * Math.exp(a * t), envelope: null, r };
  }
  const [l1, l2] = r.re;
  const B = (v0 - l1 * x0) / (l2 - l1), A = x0 - B;
  return { x: (t: number) => A * Math.exp(l1 * t) + B * Math.exp(l2 * t), envelope: null, r };
}

/** Steady-state amplitude of the forced oscillator: F / √((k − mω²)² + (cω)²). */
export const amplitude = (m: number, c: number, k: number, F: number, w: number) => F / Math.hypot(k - m * w * w, c * w);

/** Driving frequency of the amplitude peak and the peak itself (no peak when ζ ≥ 1/√2). */
export function resonance(m: number, c: number, k: number, F: number): { w: number; A: number } | null {
  const w2 = k / m - (c * c) / (2 * m * m);
  if (w2 <= 0) return null;
  const w = Math.sqrt(w2);
  return { w, A: amplitude(m, c, k, F, w) };
}

/**
 * Forced response from rest, x(0) = x′(0) = 0, sampled every dt up to tMax with RK4
 * (works for every c, including c = 0 at resonance where the amplitude grows linearly).
 */
export function forcedFromRest(m: number, c: number, k: number, F: number, w: number, tMax: number, dt = 0.02): [number, number][] {
  const f = (t: number, x: number, v: number): [number, number] => [v, (F * Math.cos(w * t) - c * v - k * x) / m];
  const out: [number, number][] = [[0, 0]];
  let x = 0, v = 0, t = 0;
  const n = Math.round(tMax / dt);
  for (let i = 0; i < n; i++) {
    const [a1, b1] = f(t, x, v);
    const [a2, b2] = f(t + dt / 2, x + (dt / 2) * a1, v + (dt / 2) * b1);
    const [a3, b3] = f(t + dt / 2, x + (dt / 2) * a2, v + (dt / 2) * b2);
    const [a4, b4] = f(t + dt, x + dt * a3, v + dt * b3);
    x += (dt / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    v += (dt / 6) * (b1 + 2 * b2 + 2 * b3 + b4);
    t += dt;
    out.push([t, x]);
  }
  return out;
}
