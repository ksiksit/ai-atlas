/*
 * 미적분학 · 적분의 기법과 응용: pure functions behind the figures.
 * Everything here runs under node (no imports), so the numbers quoted in the prose can be
 * checked with a plain script.
 */

export type Fn = (x: number) => number;

/** Composite Simpson's rule with n (even) panels. Accurate enough for every readout here. */
export function simpson(f: Fn, a: number, b: number, n = 400): number {
  if (a === b) return 0;
  const m = n % 2 ? n + 1 : n;
  const h = (b - a) / m;
  let s = f(a) + f(b);
  for (let i = 1; i < m; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}

/* ───────── Figure 1: substitution ───────── */

/** ∫₀ᵃ 2x·cos(x²) dx becomes ∫₀^{a²} cos u du with u = x². */
export const subInner: Fn = (x) => x * x;
export const subX: Fn = (x) => 2 * x * Math.cos(x * x);
export const subU: Fn = (u) => Math.cos(u);

export interface Strip {
  x0: number;
  x1: number;
  u0: number;
  u1: number;
  /** Area of the strip under 2x·cos(x²) in the x picture. */
  ax: number;
  /** Area of the matching strip under cos u in the u picture. */
  au: number;
}

/** Cut [0, a] into n equal x-strips and follow each to its (unequal) u-strip. */
export function strips(a: number, n: number): Strip[] {
  const out: Strip[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = (a * i) / n;
    const x1 = (a * (i + 1)) / n;
    const u0 = subInner(x0);
    const u1 = subInner(x1);
    out.push({ x0, x1, u0, u1, ax: simpson(subX, x0, x1, 60), au: simpson(subU, u0, u1, 60) });
  }
  return out;
}

/* ───────── Figure 2: integration by parts ───────── */

export type PartsCase = 'xex' | 'lnx';

export interface PartsSetup {
  /** The integral being computed, as TeX. */
  tex: string;
  /** u and v along the parameter t (t is the original x). */
  u: Fn;
  v: Fn;
  t0: number;
  tMin: number;
  tMax: number;
  tDefault: number;
  uTex: string;
  vTex: string;
}

export const PARTS: Record<PartsCase, PartsSetup> = {
  // ∫₀ᵇ x eˣ dx: u = x, dv = eˣ dx, so v = eˣ
  xex: { tex: '\\int_0^{b} x\\,e^{x}\\,dx', u: (t) => t, v: (t) => Math.exp(t), t0: 0, tMin: 0.3, tMax: 2, tDefault: 1.5, uTex: 'u = x', vTex: 'v = e^{x}' },
  // ∫₁ᵇ ln x dx: u = ln x, dv = dx, so v = x
  lnx: { tex: '\\int_1^{b} \\ln x\\,dx', u: (t) => Math.log(t), v: (t) => t, t0: 1, tMin: 1.5, tMax: 6, tDefault: 3, uTex: 'u = \\ln x', vTex: 'v = x' },
};

export interface PartsAreas {
  /** ∫ u dv: the region between the curve and the v-axis (the integral we want). */
  udv: number;
  /** ∫ v du: the region between the curve and the u-axis (the easy one). */
  vdu: number;
  /** u₁v₁ − u₀v₀: the big rectangle minus the small one. */
  rect: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export function partsAreas(c: PartsCase, b: number): PartsAreas {
  const s = PARTS[c];
  const u0 = s.u(s.t0), v0 = s.v(s.t0), u1 = s.u(b), v1 = s.v(b);
  // along the curve: ∫ u dv = ∫ u(t) v'(t) dt and ∫ v du = ∫ v(t) u'(t) dt, by central differences
  const d = (g: Fn) => (t: number) => (g(t + 1e-5) - g(t - 1e-5)) / 2e-5;
  const udv = simpson((t) => s.u(t) * d(s.v)(t), s.t0, b, 600);
  const vdu = simpson((t) => s.v(t) * d(s.u)(t), s.t0, b, 600);
  return { udv, vdu, rect: u1 * v1 - u0 * v0, u0, v0, u1, v1 };
}

/* ───────── Figure 3: worked examples ───────── */

export interface Worked {
  title: string;
  /** Which technique, shown as a tag. */
  kind: string;
  integrand: Fn;
  /** An antiderivative found by the steps, used to check against a numerical integral on [0, 1]. */
  anti: Fn;
  steps: { tex: string; note: string }[];
}

export const WORKED: Worked[] = [
  {
    title: '∫ x√(x²+1) dx',
    kind: '치환',
    integrand: (x) => x * Math.sqrt(x * x + 1),
    anti: (x) => Math.pow(x * x + 1, 1.5) / 3,
    steps: [
      { tex: '\\int x\\sqrt{x^2+1}\\,dx', note: '근호 안의 x² + 1을 미분하면 2x이고, 바깥에 x가 곱해져 있습니다. 안쪽 함수의 도함수가 보이면 치환을 떠올립니다.' },
      { tex: 'u = x^2+1,\\quad du = 2x\\,dx \\;\\Rightarrow\\; x\\,dx = \\tfrac12\\,du', note: '안쪽을 u로 두고, dx를 du로 바꿉니다.' },
      { tex: '\\int \\sqrt{u}\\cdot\\tfrac12\\,du = \\tfrac12\\cdot\\tfrac{2}{3}u^{3/2} + C', note: 'x가 모두 사라지고 u만 남았습니다. 거듭제곱 규칙으로 적분합니다.' },
      { tex: '= \\tfrac13\\,(x^2+1)^{3/2} + C', note: 'u를 다시 x로 되돌립니다. 미분해 보면 연쇄 법칙으로 x√(x²+1)이 나옵니다.' },
    ],
  },
  {
    title: '∫ x cos x dx',
    kind: '부분적분',
    integrand: (x) => x * Math.cos(x),
    anti: (x) => x * Math.sin(x) + Math.cos(x),
    steps: [
      { tex: '\\int x\\cos x\\,dx', note: '서로 다른 종류의 함수(다항식과 삼각 함수)가 곱해져 있습니다. 미분하면 단순해지는 쪽을 u로 고릅니다.' },
      { tex: 'u = x,\\; dv = \\cos x\\,dx \\;\\Rightarrow\\; du = dx,\\; v = \\sin x', note: 'x는 미분하면 1이 되고, cos x는 적분해도 어렵지 않습니다.' },
      { tex: '\\int u\\,dv = uv - \\int v\\,du = x\\sin x - \\int \\sin x\\,dx', note: '부분적분 공식에 넣습니다. 남은 적분은 처음보다 쉽습니다.' },
      { tex: '= x\\sin x + \\cos x + C', note: '미분하면 sin x + x cos x − sin x = x cos x로 돌아옵니다.' },
    ],
  },
  {
    title: '∫ eˣ sin x dx',
    kind: '부분적분 두 번',
    integrand: (x) => Math.exp(x) * Math.sin(x),
    anti: (x) => (Math.exp(x) * (Math.sin(x) - Math.cos(x))) / 2,
    steps: [
      { tex: 'I = \\int e^{x}\\sin x\\,dx', note: '어느 쪽을 미분해도 단순해지지 않습니다. 구하려는 적분에 이름 I를 붙여 둡니다.' },
      { tex: 'I = e^{x}\\sin x - \\int e^{x}\\cos x\\,dx', note: 'u = sin x, dv = eˣ dx로 한 번 부분적분합니다.' },
      { tex: 'I = e^{x}\\sin x - \\Big(e^{x}\\cos x + \\int e^{x}\\sin x\\,dx\\Big) = e^{x}(\\sin x - \\cos x) - I', note: 'u = cos x로 한 번 더 하면 처음의 I가 다시 나타납니다.' },
      { tex: '2I = e^{x}(\\sin x - \\cos x) \\;\\Rightarrow\\; I = \\tfrac12 e^{x}(\\sin x - \\cos x) + C', note: 'I를 미지수로 보고 방정식을 풉니다. 적분을 끝까지 계산하지 않고도 답이 나왔습니다.' },
    ],
  },
];

/* ───────── Figure 4: measuring by slicing ───────── */

export type SolidCase = 'sphere' | 'cone' | 'horn';

export interface Solid {
  name: string;
  f: Fn;
  a: number;
  b: number;
  /** Exact volume of the solid of revolution about the x-axis. */
  exact: number;
  exactTex: string;
}

export const SOLIDS: Record<SolidCase, Solid> = {
  sphere: { name: '구', f: (x) => Math.sqrt(Math.max(0, 1 - x * x)), a: -1, b: 1, exact: (4 * Math.PI) / 3, exactTex: '\\pi\\int_{-1}^{1}(1-x^2)\\,dx = \\tfrac43\\pi' },
  cone: { name: '원뿔', f: (x) => x / 2, a: 0, b: 2, exact: (Math.PI * 2) / 3, exactTex: '\\pi\\int_{0}^{2}\\tfrac{x^2}{4}\\,dx = \\tfrac23\\pi' },
  horn: { name: '나팔', f: (x) => 1 / x, a: 1, b: 6, exact: Math.PI * (1 - 1 / 6), exactTex: '\\pi\\int_{1}^{6}\\tfrac{1}{x^2}\\,dx = \\tfrac56\\pi' },
};

/** Sum of n disks, each as thick as one slice and as wide as f at the slice's midpoint. */
export function diskSum(s: Solid, n: number): number {
  const h = (s.b - s.a) / n;
  let v = 0;
  for (let i = 0; i < n; i++) {
    const r = s.f(s.a + (i + 0.5) * h);
    v += Math.PI * r * r * h;
  }
  return v;
}

export type CurveCase = 'quarter' | 'sine';

export interface Curve {
  name: string;
  f: Fn;
  df: Fn;
  a: number;
  b: number;
  /** Exact length (π/2 for the quarter circle; numerical for the sine arch). */
  exact: number;
}

export const CURVES: Record<CurveCase, Curve> = {
  quarter: { name: '사분원', f: (x) => Math.sqrt(Math.max(0, 1 - x * x)), df: (x) => -x / Math.sqrt(Math.max(1e-12, 1 - x * x)), a: 0, b: 1, exact: Math.PI / 2 },
  sine: { name: '사인 곡선 한 마루', f: Math.sin, df: Math.cos, a: 0, b: Math.PI, exact: simpson((x) => Math.sqrt(1 + Math.cos(x) ** 2), 0, Math.PI, 2000) },
};

/** Length of the polyline through n + 1 equally spaced points of the curve. */
export function polyLength(c: Curve, n: number): number {
  let L = 0;
  let px = c.a, py = c.f(c.a);
  for (let i = 1; i <= n; i++) {
    const x = c.a + ((c.b - c.a) * i) / n;
    const y = c.f(x);
    L += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return L;
}

/** ∫₁ᵇ x^(−p) dx in closed form. */
export function improperUpTo(p: number, b: number): number {
  if (Math.abs(p - 1) < 1e-9) return Math.log(b);
  return (Math.pow(b, 1 - p) - 1) / (1 - p);
}

/** The limit as b → ∞, or Infinity when the area grows without bound. */
export function improperLimit(p: number): number {
  return p > 1 + 1e-9 ? 1 / (p - 1) : Infinity;
}
