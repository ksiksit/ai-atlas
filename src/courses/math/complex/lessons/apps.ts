/*
 * 복소해석 · 응용: Fourier series as rotating phasors, the discrete Fourier transform and a radix-2 FFT
 * with operation counts, ideal flow past a cylinder with circulation, the Joukowski airfoil, and the
 * temperature in a disk found three ways. No imports, so node can run it directly.
 */

export type C = [number, number];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const polar = (r: number, t: number): C => [r * Math.cos(t), r * Math.sin(t)];
export const cabs = (a: C) => Math.hypot(a[0], a[1]);

/* ───────── 1. Fourier series ───────── */

export type Wave = 'square' | 'saw';

/** The wave itself on (−π, π]: square = sign(sin θ), saw = θ/π. */
export function wave(kind: Wave, t: number): number {
  const u = ((((t + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI; // to (−π, π]
  if (kind === 'square') return u === 0 || Math.abs(u) === Math.PI ? 0 : Math.sign(u);
  return u / Math.PI;
}

/**
 * Terms of the Fourier series written with e^{inθ}: the real wave is Σ cₙ e^{inθ} over n = ±1, ±2, …
 * For the square wave c_n = 2/(iπn) for odd n; for the saw c_n = i(−1)ⁿ/(πn). Returned for n = 1..N with the
 * matching negative term folded in, as the amplitude and phase of each real sine: bₙ sin(nθ).
 */
export function sineCoeffs(kind: Wave, N: number): { n: number; b: number }[] {
  const out: { n: number; b: number }[] = [];
  for (let n = 1; n <= N; n++) {
    if (kind === 'square') {
      if (n % 2) out.push({ n, b: 4 / (Math.PI * n) });
    } else out.push({ n, b: (2 * (n % 2 ? 1 : -1)) / (Math.PI * n) });
  }
  return out;
}

export function partialSum(kind: Wave, N: number, t: number): number {
  return sineCoeffs(kind, N).reduce((s, { n, b }) => s + b * Math.sin(n * t), 0);
}

/**
 * The phasor chain for the complex form: each sine bₙ sin(nθ) = Im(bₙ e^{inθ}), so drawing the arrows
 * bₙ e^{inθ} head to tail gives a point whose height is the partial sum.
 */
export function phasors(kind: Wave, N: number, t: number): C[] {
  const pts: C[] = [[0, 0]];
  for (const { n, b } of sineCoeffs(kind, N)) pts.push(add(pts[pts.length - 1], polar(b, n * t)));
  return pts;
}

/** Largest value of the partial sum on (0, π), found by a fine scan: the Gibbs peak for the square wave. */
export function peak(kind: Wave, N: number): { value: number; at: number } {
  let best = -Infinity, at = 0;
  for (let k = 1; k < 20000; k++) {
    const t = (Math.PI * k) / 20000;
    const v = partialSum(kind, N, t);
    if (v > best) {
      best = v;
      at = t;
    }
  }
  return { value: best, at };
}

/* ───────── 2. DFT and FFT ───────── */

/** Mulberry32, the same generator as lib/math's rng, repeated so this file needs no imports. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export type SignalKind = 'two-tones' | 'square' | 'chirp';

/** n samples over one window: two tones (5 and 12 cycles), a square wave of 4 cycles, or a rising chirp. */
export function signal(kind: SignalKind, n: number, noise: number, seed: number): number[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, k) => {
    const t = k / n;
    let v: number;
    if (kind === 'two-tones') v = Math.sin(2 * Math.PI * 5 * t) + 0.5 * Math.sin(2 * Math.PI * 12 * t);
    else if (kind === 'square') v = Math.sin(2 * Math.PI * 4 * t) >= 0 ? 1 : -1;
    else v = Math.sin(2 * Math.PI * (2 * t + 10 * t * t));
    return v + noise * gauss(r);
  });
}

export interface Counted {
  out: C[];
  /** Complex multiplications performed. */
  mults: number;
}

/** Direct DFT X_m = Σ x_k ω^{−mk}, ω = e^{2πi/n}: n² complex multiplications. */
export function dft(x: C[]): Counted {
  const n = x.length;
  let mults = 0;
  const out = Array.from({ length: n }, (_, m) => {
    let s: C = [0, 0];
    for (let k = 0; k < n; k++) {
      s = add(s, mul(x[k], polar(1, (-2 * Math.PI * m * k) / n)));
      mults++;
    }
    return s;
  });
  return { out, mults };
}

/** Recursive radix-2 FFT (n a power of 2): split even and odd samples, combine with n/2 twiddle factors. */
export function fft(x: C[]): Counted {
  const n = x.length;
  if (n === 1) return { out: [x[0]], mults: 0 };
  const even = fft(x.filter((_, k) => k % 2 === 0));
  const odd = fft(x.filter((_, k) => k % 2 === 1));
  const out: C[] = Array(n);
  let mults = even.mults + odd.mults;
  for (let m = 0; m < n / 2; m++) {
    const t = mul(polar(1, (-2 * Math.PI * m) / n), odd.out[m]);
    mults++;
    out[m] = add(even.out[m], t);
    out[m + n / 2] = sub(even.out[m], t);
  }
  return { out, mults };
}

/** Amplitude spectrum for m = 0..n/2: 2|X_m|/n (and |X₀|/n), so a pure sine of amplitude A shows as A. */
export function amplitudes(X: C[]): number[] {
  const n = X.length;
  return Array.from({ length: n / 2 + 1 }, (_, m) => ((m === 0 || m === n / 2 ? 1 : 2) * cabs(X[m])) / n);
}

/* ───────── 3. flow past a cylinder ───────── */

export interface CylinderFlow {
  U: number;
  a: number;
  /** Circulation; positive means clockwise, which gives upward lift for a flow to the right. */
  gamma: number;
}

/** Complex potential w = U(z + a²/z) + (iΓ/2π) log z. Its imaginary part is the stream function. */
export function cylPotential(f: CylinderFlow, z: C): C {
  const lin = mul([f.U, 0], add(z, div([f.a * f.a, 0], z)));
  const log: C = [Math.log(cabs(z)), Math.atan2(z[1], z[0])];
  return add(lin, mul([0, f.gamma / (2 * Math.PI)], log));
}

/** ψ = Im w, written with a continuous form: ψ = U y (1 − a²/r²) + (Γ/2π) ln r. */
export function cylStream(f: CylinderFlow, x: number, y: number): number {
  const r2 = x * x + y * y;
  return f.U * y * (1 - (f.a * f.a) / r2) + (f.gamma / (2 * Math.PI)) * 0.5 * Math.log(r2);
}

/** Velocity u − iv = dw/dz = U(1 − a²/z²) + iΓ/(2πz). */
export function cylVelocity(f: CylinderFlow, z: C): C {
  const dw = add(mul([f.U, 0], sub([1, 0], div([f.a * f.a, 0], mul(z, z)))), div([0, f.gamma / (2 * Math.PI)], z));
  return [dw[0], -dw[1]];
}

/** Stagnation points: on the cylinder at sin θ = −Γ/(4πUa) while |Γ| ≤ 4πUa, otherwise one point off the cylinder. */
export function stagnation(f: CylinderFlow): C[] {
  const s = -f.gamma / (4 * Math.PI * f.U * f.a);
  if (Math.abs(s) <= 1) {
    const t = Math.asin(s);
    return [polar(f.a, t), polar(f.a, Math.PI - t)];
  }
  // z = −i (Γ/4πU) ± i √((Γ/4πU)² − a²) on the imaginary axis; the one outside the cylinder
  const k = -f.gamma / (4 * Math.PI * f.U);
  const y1 = k + Math.sign(k) * Math.sqrt(k * k - f.a * f.a);
  return [[0, y1]];
}

/* ───────── 4. Joukowski airfoil ───────── */

export interface Airfoil {
  /** Centre of the circle in the ζ plane; the circle passes through ζ = 1. */
  cx: number;
  cy: number;
  /** Angle of attack, radians. */
  alpha: number;
  U: number;
}

export const airfoilRadius = (af: Airfoil) => Math.hypot(1 - af.cx, af.cy);

/** Circulation that puts the rear stagnation point at ζ = 1 (the Kutta condition), Γ = 4πUR sin(α + β). */
export function kuttaGamma(af: Airfoil): number {
  const R = airfoilRadius(af);
  const beta = Math.asin(af.cy / R);
  return 4 * Math.PI * af.U * R * Math.sin(af.alpha + beta);
}

/** Stream function in the ζ plane: flow at angle α past the circle |ζ − c| = R, with circulation Γ. */
export function airfoilStream(af: Airfoil, gamma: number, zx: number, zy: number): number {
  const R = airfoilRadius(af);
  // shift to the circle's centre and rotate by −α so the free stream points along +x
  const x = zx - af.cx, y = zy - af.cy;
  const ca = Math.cos(-af.alpha), sa = Math.sin(-af.alpha);
  const xr = x * ca - y * sa, yr = x * sa + y * ca;
  return cylStream({ U: af.U, a: R, gamma }, xr, yr);
}

/** Joukowski map z = ζ + 1/ζ. */
export const joukowski = (z: C): C => add(z, div([1, 0], z));

/** The airfoil: the image of the circle under the Joukowski map. */
export function airfoilShape(af: Airfoil, n = 360): C[] {
  const R = airfoilRadius(af);
  return Array.from({ length: n + 1 }, (_, k) => joukowski(add([af.cx, af.cy], polar(R, (2 * Math.PI * k) / n))));
}

/** Chord length: largest minus smallest x of the airfoil. */
export function chord(af: Airfoil): number {
  const xs = airfoilShape(af).map((p) => p[0]);
  return Math.max(...xs) - Math.min(...xs);
}

/* ───────── contour lines (marching squares) ───────── */

export type Seg = [C, C];

/**
 * Level curves of g on a grid over [x0,x1]×[y0,y1], as line segments. Cells where `skip` is true
 * (inside a body) are left out.
 */
export function contours(g: (x: number, y: number) => number, x0: number, x1: number, y0: number, y1: number, nx: number, ny: number, levels: number[], skip?: (x: number, y: number) => boolean): Seg[][] {
  const hx = (x1 - x0) / nx, hy = (y1 - y0) / ny;
  const v: number[][] = [];
  for (let j = 0; j <= ny; j++) {
    v.push([]);
    for (let i = 0; i <= nx; i++) v[j].push(g(x0 + i * hx, y0 + j * hy));
  }
  return levels.map((L) => {
    const segs: Seg[] = [];
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const xa = x0 + i * hx, ya = y0 + j * hy;
        if (skip && skip(xa + hx / 2, ya + hy / 2)) continue;
        const c = [v[j][i], v[j][i + 1], v[j + 1][i + 1], v[j + 1][i]];
        const corners: C[] = [[xa, ya], [xa + hx, ya], [xa + hx, ya + hy], [xa, ya + hy]];
        const pts: C[] = [];
        for (let e = 0; e < 4; e++) {
          const a = c[e] - L, b = c[(e + 1) % 4] - L;
          if (!isFinite(a) || !isFinite(b)) continue;
          if ((a < 0) !== (b < 0)) {
            const t = a / (a - b);
            const p = corners[e], q = corners[(e + 1) % 4];
            pts.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
          }
        }
        if (pts.length === 2) segs.push([pts[0], pts[1]]);
        else if (pts.length === 4) segs.push([pts[0], pts[1]], [pts[2], pts[3]]);
      }
    return segs;
  });
}

/* ───────── 5. temperature in a disk ───────── */

/** Boundary temperature: 1 on the upper half circle, 0 on the lower half. */
export const boundaryHalves = (phi: number) => (Math.sin(phi) > 0 ? 1 : Math.sin(phi) < 0 ? 0 : 0.5);

/**
 * By conformal mapping: w = i(1 + z)/(1 − z) sends the disk to the upper half plane, the upper arc to the
 * negative real axis and the lower arc to the positive real axis, so u = arg(w)/π is 1 on the upper arc,
 * 0 on the lower and harmonic inside.
 */
export function tempConformal(x: number, y: number): number {
  const w = mul([0, 1], div([1 + x, y], [1 - x, -y]));
  return Math.atan2(w[1], w[0]) / Math.PI;
}

/** Poisson's integral u(r,θ) = (1/2π) ∫ (1 − r²) / (1 − 2r cos(θ − φ) + r²) g(φ) dφ, by the midpoint rule. */
export function tempPoisson(x: number, y: number, n = 720): number {
  const r = Math.hypot(x, y), t = Math.atan2(y, x);
  let s = 0;
  for (let k = 0; k < n; k++) {
    const phi = ((k + 0.5) * 2 * Math.PI) / n;
    s += ((1 - r * r) / (1 - 2 * r * Math.cos(t - phi) + r * r)) * boundaryHalves(phi);
  }
  return s / n;
}

/**
 * Jacobi relaxation on an N×N grid over [−1,1]²: grid points outside the disk hold the boundary temperature
 * of their angle, points inside are repeatedly replaced by the average of their four neighbours.
 */
export function relaxDisk(N: number, sweeps: number): { u: Float64Array; inside: Uint8Array; N: number } {
  const u = new Float64Array(N * N), ins = new Uint8Array(N * N);
  const coord = (i: number) => -1 + (2 * i) / (N - 1);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = coord(i), y = coord(j);
      const k = j * N + i;
      if (x * x + y * y < 1) {
        ins[k] = 1;
        u[k] = 0.5;
      } else u[k] = boundaryHalves(Math.atan2(y, x));
    }
  let next = new Float64Array(u);
  let cur = u;
  for (let s = 0; s < sweeps; s++) {
    for (let j = 1; j < N - 1; j++)
      for (let i = 1; i < N - 1; i++) {
        const k = j * N + i;
        next[k] = ins[k] ? 0.25 * (cur[k - 1] + cur[k + 1] + cur[k - N] + cur[k + N]) : cur[k];
      }
    const tmp = cur;
    cur = next;
    next = tmp;
  }
  return { u: cur, inside: ins, N };
}

/** Largest gap between the relaxed grid and the exact solution over interior points with r ≤ 0.9. */
export function relaxError(N: number, sweeps: number): number {
  const { u, inside } = relaxDisk(N, sweeps);
  let worst = 0;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = -1 + (2 * i) / (N - 1), y = -1 + (2 * j) / (N - 1);
      if (!inside[j * N + i] || x * x + y * y > 0.81) continue;
      worst = Math.max(worst, Math.abs(u[j * N + i] - tempConformal(x, y)));
    }
  return worst;
}
