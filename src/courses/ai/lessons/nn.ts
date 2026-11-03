import { gauss, rng } from '../../../lib/math';

export type Act = 'relu' | 'tanh' | 'sigmoid';

export function actF(a: Act, z: number): number {
  if (a === 'relu') return z > 0 ? z : 0;
  if (a === 'tanh') return Math.tanh(z);
  return 1 / (1 + Math.exp(-z));
}
/** derivative expressed via pre-activation z and post-activation h */
export function actD(a: Act, z: number, h: number): number {
  if (a === 'relu') return z > 0 ? 1 : 0;
  if (a === 'tanh') return 1 - h * h;
  return h * (1 - h);
}

/**
 * Tiny fully-connected network for binary classification.
 * Hidden layers use `act`, the single output uses a sigmoid with binary cross-entropy.
 * Trained with Adam.
 */
export class MLP {
  sizes: number[];
  act: Act;
  W: Float64Array[] = [];
  b: Float64Array[] = [];
  z: Float64Array[] = [];
  a: Float64Array[] = [];
  private d: Float64Array[] = [];
  private gW: Float64Array[] = [];
  private gb: Float64Array[] = [];
  private mW: Float64Array[] = [];
  private vW: Float64Array[] = [];
  private mb: Float64Array[] = [];
  private vb: Float64Array[] = [];
  private t = 0;
  private r: () => number;

  constructor(sizes: number[], act: Act, seed = 1) {
    this.sizes = sizes;
    this.act = act;
    this.r = rng(seed);
    const L = sizes.length - 1;
    for (let l = 0; l < L; l++) {
      const nin = sizes[l];
      const nout = sizes[l + 1];
      const std = act === 'relu' && l < L - 1 ? Math.sqrt(2 / nin) : Math.sqrt(1 / nin);
      const W = new Float64Array(nin * nout);
      for (let i = 0; i < W.length; i++) W[i] = gauss(this.r) * std;
      const b = new Float64Array(nout);
      if (act === 'relu') b.fill(0.05);
      this.W.push(W);
      this.b.push(b);
      this.gW.push(new Float64Array(W.length));
      this.gb.push(new Float64Array(nout));
      this.mW.push(new Float64Array(W.length));
      this.vW.push(new Float64Array(W.length));
      this.mb.push(new Float64Array(nout));
      this.vb.push(new Float64Array(nout));
    }
    for (let l = 0; l <= L; l++) {
      this.z.push(new Float64Array(sizes[l]));
      this.a.push(new Float64Array(sizes[l]));
      this.d.push(new Float64Array(sizes[l]));
    }
  }

  get nLayers() {
    return this.sizes.length - 1;
  }

  /** Forward pass; fills this.a / this.z and returns the output probability. */
  forward(x: ArrayLike<number>): number {
    const a0 = this.a[0];
    for (let i = 0; i < a0.length; i++) a0[i] = x[i];
    const L = this.nLayers;
    for (let l = 0; l < L; l++) {
      const nin = this.sizes[l];
      const nout = this.sizes[l + 1];
      const W = this.W[l];
      const b = this.b[l];
      const ain = this.a[l];
      const z = this.z[l + 1];
      const aout = this.a[l + 1];
      const last = l === L - 1;
      for (let k = 0; k < nout; k++) {
        let s = b[k];
        const off = k * nin;
        for (let j = 0; j < nin; j++) s += W[off + j] * ain[j];
        z[k] = s;
        aout[k] = last ? 1 / (1 + Math.exp(-s)) : actF(this.act, s);
      }
    }
    return this.a[L][0];
  }

  /** Accumulate gradients for one example (call after forward). */
  backward(y: number) {
    const L = this.nLayers;
    this.d[L][0] = this.a[L][0] - y; // sigmoid + BCE
    for (let l = L - 1; l >= 0; l--) {
      const nin = this.sizes[l];
      const nout = this.sizes[l + 1];
      const W = this.W[l];
      const dout = this.d[l + 1];
      const ain = this.a[l];
      const gW = this.gW[l];
      const gb = this.gb[l];
      for (let k = 0; k < nout; k++) {
        const dk = dout[k];
        gb[k] += dk;
        const off = k * nin;
        for (let j = 0; j < nin; j++) gW[off + j] += dk * ain[j];
      }
      if (l > 0) {
        const din = this.d[l];
        const zin = this.z[l];
        for (let j = 0; j < nin; j++) {
          let s = 0;
          for (let k = 0; k < nout; k++) s += W[k * nin + j] * dout[k];
          din[j] = s * actD(this.act, zin[j], ain[j]);
        }
      }
    }
  }

  /** Adam update with averaged gradients, then zero the accumulators. */
  step(lr: number, batch: number) {
    this.t++;
    const b1 = 0.9;
    const b2 = 0.999;
    const c1 = 1 - Math.pow(b1, this.t);
    const c2 = 1 - Math.pow(b2, this.t);
    const upd = (p: Float64Array, g: Float64Array, m: Float64Array, v: Float64Array) => {
      for (let i = 0; i < p.length; i++) {
        const gi = g[i] / batch;
        m[i] = b1 * m[i] + (1 - b1) * gi;
        v[i] = b2 * v[i] + (1 - b2) * gi * gi;
        p[i] -= (lr * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + 1e-8);
        g[i] = 0;
      }
    };
    for (let l = 0; l < this.nLayers; l++) {
      upd(this.W[l], this.gW[l], this.mW[l], this.vW[l]);
      upd(this.b[l], this.gb[l], this.mb[l], this.vb[l]);
    }
  }

  /** One pass over the data in shuffled mini-batches. */
  trainEpoch(X: Float64Array[], Y: number[], lr: number, batch = 10) {
    const n = X.length;
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(this.r() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      this.forward(X[idx[i]]);
      this.backward(Y[idx[i]]);
      cnt++;
      if (cnt === batch || i === n - 1) {
        this.step(lr, cnt);
        cnt = 0;
      }
    }
  }

  /** Mean binary cross-entropy and accuracy. */
  evaluate(X: Float64Array[], Y: number[]): { loss: number; acc: number } {
    let loss = 0;
    let correct = 0;
    for (let i = 0; i < X.length; i++) {
      const p = Math.min(1 - 1e-7, Math.max(1e-7, this.forward(X[i])));
      loss += -(Y[i] * Math.log(p) + (1 - Y[i]) * Math.log(1 - p));
      if ((p > 0.5 ? 1 : 0) === Y[i]) correct++;
    }
    return { loss: loss / Math.max(1, X.length), acc: correct / Math.max(1, X.length) };
  }
}

/* ───────── input features ───────── */

export type FeatId = 'x' | 'y' | 'x2' | 'y2' | 'xy' | 'sinx' | 'siny';
export const FEATS: { id: FeatId; label: string; f: (x: number, y: number) => number }[] = [
  { id: 'x', label: 'x₁', f: (x) => x },
  { id: 'y', label: 'x₂', f: (_, y) => y },
  { id: 'x2', label: 'x₁²', f: (x) => x * x },
  { id: 'y2', label: 'x₂²', f: (_, y) => y * y },
  { id: 'xy', label: 'x₁x₂', f: (x, y) => x * y },
  { id: 'sinx', label: 'sin πx₁', f: (x) => Math.sin(Math.PI * x) },
  { id: 'siny', label: 'sin πx₂', f: (_, y) => Math.sin(Math.PI * y) },
];

export function featurize(x: number, y: number, active: FeatId[]): Float64Array {
  const out = new Float64Array(active.length);
  for (let i = 0; i < active.length; i++) out[i] = FEATS.find((f) => f.id === active[i])!.f(x, y);
  return out;
}

/** Marching squares: segments of the iso-line `level` over a grid of values (row-major, G×G, cell centres). */
export function isoSegments(vals: Float64Array, G: number, level: number): [number, number, number, number][] {
  const segs: [number, number, number, number][] = [];
  const v = (i: number, j: number) => vals[j * G + i] - level;
  const interp = (a: number, b: number) => a / (a - b);
  for (let j = 0; j < G - 1; j++) {
    for (let i = 0; i < G - 1; i++) {
      const a = v(i, j); // top-left (j is row index)
      const b = v(i + 1, j);
      const c = v(i + 1, j + 1);
      const d = v(i, j + 1);
      const pts: [number, number][] = [];
      if (a > 0 !== b > 0) pts.push([i + interp(a, b), j]);
      if (b > 0 !== c > 0) pts.push([i + 1, j + interp(b, c)]);
      if (c > 0 !== d > 0) pts.push([i + 1 - interp(c, d), j + 1]);
      if (d > 0 !== a > 0) pts.push([i, j + 1 - interp(d, a)]);
      if (pts.length === 2) segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
      else if (pts.length === 4) {
        segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
        segs.push([pts[2][0], pts[2][1], pts[3][0], pts[3][1]]);
      }
    }
  }
  return segs;
}
