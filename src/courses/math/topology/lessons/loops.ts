/*
 * 위상수학 · 기본군과 구멍: loops in a punctured plane, pulling them tight, winding numbers, lifts,
 * and fixed points of maps of the disk. No imports, so node can run it directly.
 */

export type Pt = [number, number];

/** Holes are disks the string cannot enter; their radius keeps the string from jumping over them. */
export const HOLE_R = 0.12;
/** Spacing of the string's beads. It must stay below √3·HOLE_R so no segment can slip across a hole's core. */
export const SPACING = 0.03;
export const BASE: Pt = [0, -0.82];

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Total turning of the loop around point c, in full turns (a whole number for a closed loop). */
export function windingNumber(loop: Pt[], c: Pt): number {
  let total = 0;
  for (let i = 0; i + 1 < loop.length; i++) {
    const a = Math.atan2(loop[i][1] - c[1], loop[i][0] - c[0]);
    const b = Math.atan2(loop[i + 1][1] - c[1], loop[i + 1][0] - c[0]);
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += d;
  }
  return total / (2 * Math.PI);
}

export const length = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0);

/** Re-space a polyline (both ends kept) so neighbouring beads are about `s` apart. */
export function resample(pts: Pt[], s = SPACING): Pt[] {
  const L = length(pts);
  if (L < 1e-9) return [pts[0], pts[pts.length - 1]];
  const n = Math.max(2, Math.ceil(L / s));
  const out: Pt[] = [pts[0]];
  let seg = 0, acc = 0;
  for (let k = 1; k < n; k++) {
    const target = (L * k) / n;
    while (seg < pts.length - 2 && acc + dist(pts[seg], pts[seg + 1]) < target) {
      acc += dist(pts[seg], pts[seg + 1]);
      seg++;
    }
    const d = dist(pts[seg], pts[seg + 1]) || 1;
    const t = (target - acc) / d;
    out.push([pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * t, pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * t]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Push a point out of every hole it sits in. */
function pushOut(p: Pt, holes: Pt[]): Pt {
  let [x, y] = p;
  for (const h of holes) {
    const dx = x - h[0], dy = y - h[1];
    const d = Math.hypot(dx, dy);
    if (d < HOLE_R) {
      const k = HOLE_R / (d || 1e-9);
      x = h[0] + dx * k;
      y = h[1] + dy * k;
    }
  }
  return [x, y];
}

/**
 * One relaxation sweep of the string: every bead except the base moves halfway toward the midpoint of
 * its neighbours, is pushed out of the holes, and the string is re-spaced. Repeating this is a homotopy:
 * the loop changes continuously and never passes through a hole.
 */
export function tighten(pts: Pt[], holes: Pt[], sweeps = 1): Pt[] {
  let cur = pts;
  for (let s = 0; s < sweeps; s++) {
    const next: Pt[] = cur.map((p) => [p[0], p[1]] as Pt);
    for (let i = 1; i + 1 < cur.length; i++) {
      const mx = (cur[i - 1][0] + cur[i + 1][0]) / 2, my = (cur[i - 1][1] + cur[i + 1][1]) / 2;
      next[i] = pushOut([cur[i][0] + 0.5 * (mx - cur[i][0]), cur[i][1] + 0.5 * (my - cur[i][1])], holes);
    }
    cur = resample(next);
  }
  return cur;
}

export interface Pull {
  frames: Pt[][];
  lengths: number[];
  /** true when the loop shrank to the base point */
  shrank: boolean;
}

/** Tighten until the length stops changing (or the loop has shrunk to the base point). */
export function pullTight(loop: Pt[], holes: Pt[], maxFrames = 400, sweepsPerFrame = 6): Pull {
  let cur = resample(loop);
  const frames: Pt[][] = [cur];
  const lengths = [length(cur)];
  for (let f = 0; f < maxFrames; f++) {
    cur = tighten(cur, holes, sweepsPerFrame);
    frames.push(cur);
    const L = length(cur);
    lengths.push(L);
    if (L < 2.5 * SPACING) return { frames, lengths, shrank: true };
    const prev = lengths[lengths.length - 2];
    if (f > 40 && Math.abs(prev - L) < 1e-5) break;
  }
  return { frames, lengths, shrank: false };
}

/* ───────── loop presets ───────── */

export type HoleSet = 'one' | 'two';
export const HOLES: Record<HoleSet, Pt[]> = {
  one: [[0, 0.12]],
  two: [
    [-0.42, 0.12],
    [0.42, 0.12],
  ],
};

/** Waypoints of a loop from the base that circles hole c `turns` times (negative = clockwise). */
function around(c: Pt, turns: number, r = 0.42): Pt[] {
  const a0 = Math.atan2(BASE[1] - c[1], BASE[0] - c[0]);
  const n = Math.max(24, Math.round(Math.abs(turns) * 48));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (2 * Math.PI * turns * i) / n;
    // each extra turn a little closer, so the picture shows the turns apart
    const rr = r - 0.07 * Math.abs((turns * i) / n);
    pts.push([c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)]);
  }
  return pts;
}

export type LoopId = 'free' | 'once' | 'twice' | 'back' | 'ab' | 'ba' | 'comm';

export const LOOPS: { id: LoopId; holes: HoleSet; name: string }[] = [
  { id: 'free', holes: 'one', name: '구멍을 감싸지 않는 고리' },
  { id: 'once', holes: 'one', name: '한 바퀴 감기' },
  { id: 'twice', holes: 'one', name: '두 바퀴 감기' },
  { id: 'back', holes: 'one', name: '감았다가 되감기' },
  { id: 'ab', holes: 'two', name: 'a 다음 b' },
  { id: 'ba', holes: 'two', name: 'b 다음 a' },
  { id: 'comm', holes: 'two', name: 'a·b·a⁻¹·b⁻¹' },
];

export function presetLoop(id: LoopId): Pt[] {
  const [h0] = HOLES.one;
  const [L, R] = HOLES.two;
  const out: Pt[] = [BASE];
  const add = (seg: Pt[]) => {
    out.push(...seg, BASE);
  };
  if (id === 'free') {
    add([
      [0.45, -0.7],
      [0.75, -0.35],
      [0.55, -0.12],
      [0.2, -0.4],
    ]);
  } else if (id === 'once') add(around(h0, 1));
  else if (id === 'twice') add(around(h0, 2, 0.5));
  else if (id === 'back') {
    add(around(h0, 1, 0.5));
    add(around(h0, -1, 0.36));
  } else {
    const a = (t: number, r = 0.3) => around(L, t, r);
    const b = (t: number, r = 0.3) => around(R, t, r);
    if (id === 'ab') {
      add(a(1));
      add(b(1));
    } else if (id === 'ba') {
      add(b(1));
      add(a(1));
    } else {
      add(a(1, 0.34));
      add(b(1, 0.34));
      add(a(-1, 0.27));
      add(b(-1, 0.27));
    }
  }
  return out;
}

/* ───────── winding numbers as a group: loops on the circle and their lifts ───────── */

/** A loop on the unit circle: angle θ(t) for t in [0, 1] winding n times, with an optional wobble. */
export const circleLoop = (n: number, wobble: number) => (t: number) => 2 * Math.PI * n * t + wobble * Math.sin(2 * Math.PI * 3 * t) * Math.sin(Math.PI * t);

/** Lift of a sampled circle loop to the real line: unwrap the angle, measured in turns. */
export function lift(points: Pt[]): number[] {
  const out = [0];
  let total = Math.atan2(points[0][1], points[0][0]);
  const start = total;
  for (let i = 1; i < points.length; i++) {
    const a = Math.atan2(points[i - 1][1], points[i - 1][0]);
    const b = Math.atan2(points[i][1], points[i][0]);
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += d;
    out.push((total - start) / (2 * Math.PI));
  }
  return out;
}

/* ───────── fixed points of maps of the disk ───────── */

export type MapId = 'shift' | 'rotate' | 'swirl' | 'fold';

export const MAPS: { id: MapId; name: string; f: (p: Pt) => Pt }[] = [
  { id: 'shift', name: '줄이고 밀기', f: ([x, y]) => [0.5 * x + 0.4, 0.5 * y - 0.2] },
  { id: 'rotate', name: '1 라디안 돌리기', f: ([x, y]) => [Math.cos(1) * x - Math.sin(1) * y, Math.sin(1) * x + Math.cos(1) * y] },
  {
    id: 'swirl',
    name: '소용돌이',
    // turn each point by an angle that grows toward the centre, shrink, and nudge: continuous everywhere
    f: ([x, y]) => {
      const t = 2.5 * (1 - Math.hypot(x, y)), c = Math.cos(t), s = Math.sin(t);
      return [0.8 * (c * x - s * y) + 0.15, 0.8 * (s * x + c * y) + 0.05];
    },
  },
  { id: 'fold', name: '접어 구기기', f: ([x, y]) => [0.6 * Math.sin(2 * y) + 0.2, 0.6 * Math.cos(2 * x)] },
];

/** A fixed point of f in the closed unit disk: coarse grid search for the smallest |f(p) − p|, then Newton. */
export function fixedPoint(f: (p: Pt) => Pt): { p: Pt; err: number } {
  const g = (p: Pt): Pt => {
    const q = f(p);
    return [q[0] - p[0], q[1] - p[1]];
  };
  let best: Pt = [0, 0], bestE = Infinity;
  const N = 160;
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const p: Pt = [-1 + (2 * i) / N, -1 + (2 * j) / N];
      if (Math.hypot(p[0], p[1]) > 1) continue;
      const v = g(p), e = Math.hypot(v[0], v[1]);
      if (e < bestE) {
        bestE = e;
        best = p;
      }
    }
  let p = best;
  for (let k = 0; k < 30; k++) {
    const v = g(p), h = 1e-7;
    const vx = g([p[0] + h, p[1]]), vy = g([p[0], p[1] + h]);
    const a = (vx[0] - v[0]) / h, b = (vy[0] - v[0]) / h, c = (vx[1] - v[1]) / h, d = (vy[1] - v[1]) / h;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-12) break;
    const sx = (d * v[0] - b * v[1]) / det, sy = (-c * v[0] + a * v[1]) / det;
    // halve the step until it stays in the disk
    let lam = 1, np: Pt = [p[0] - sx, p[1] - sy];
    while (Math.hypot(np[0], np[1]) > 1 && lam > 1e-6) {
      lam /= 2;
      np = [p[0] - lam * sx, p[1] - lam * sy];
    }
    p = np;
  }
  const v = g(p);
  return { p, err: Math.hypot(v[0], v[1]) };
}

/** Largest |f(p)| over the disk, to show the map stays inside it. */
export function maxRadius(f: (p: Pt) => Pt): number {
  let m = 0;
  for (let i = 0; i <= 120; i++)
    for (let j = 0; j <= 120; j++) {
      const p: Pt = [-1 + i / 60, -1 + j / 60];
      if (Math.hypot(p[0], p[1]) > 1) continue;
      const q = f(p);
      m = Math.max(m, Math.hypot(q[0], q[1]));
    }
  return m;
}

/**
 * The would-be retraction of the proof: from f(p) shoot a ray through p and return where it leaves the
 * unit circle. Defined whenever f(p) ≠ p.
 */
export function retract(p: Pt, fp: Pt): Pt | null {
  const dx = p[0] - fp[0], dy = p[1] - fp[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return null;
  const ux = dx / L, uy = dy / L;
  // solve |p + t u| = 1 for t ≥ 0
  const b = p[0] * ux + p[1] * uy, c = p[0] * p[0] + p[1] * p[1] - 1;
  const t = -b + Math.sqrt(Math.max(0, b * b - c));
  return [p[0] + t * ux, p[1] + t * uy];
}
