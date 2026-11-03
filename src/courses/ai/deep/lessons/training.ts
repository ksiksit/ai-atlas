import { gauss, makeDataset, rng, type DatasetName } from '../../../../lib/math';
import type { Palette } from '../../../../lib/theme';

/* ═══════════════════ a small batched MLP ═══════════════════
 * Row-major batches: X is B×nin, W is nin×nout, Z = X·W + b.
 * Each hidden layer: Z → [norm] → act → [dropout] → [+ input if residual].
 * The last layer is linear and gives one logit per example (binary cross-entropy).
 */

export type Act = 'relu' | 'tanh';
export type Init = 'small' | 'large' | 'xavier' | 'he';
export type Norm = 'none' | 'batch' | 'layer';
export type Opt = 'sgd' | 'adam' | 'adam-l2' | 'adamw';

/** Standard deviation of the initial weights for a layer with nin inputs and nout outputs. */
export function initStd(init: Init, nin: number, nout: number): number {
  if (init === 'small') return 0.01;
  if (init === 'large') return 1;
  if (init === 'xavier') return Math.sqrt(2 / (nin + nout));
  return Math.sqrt(2 / nin); // He
}

export function actF(a: Act, z: number): number {
  return a === 'relu' ? (z > 0 ? z : 0) : Math.tanh(z);
}

export interface NetOpts {
  sizes: number[];
  act?: Act;
  init?: Init;
  norm?: Norm;
  residual?: boolean;
  dropout?: number;
  seed?: number;
}

export interface StepOpts {
  opt?: Opt;
  /** weight decay λ: L2 penalty for sgd / adam-l2, decoupled for adamw */
  wd?: number;
  momentum?: number;
}

const EPS = 1e-5;

interface Param {
  p: Float64Array;
  g: Float64Array;
  m: Float64Array;
  v: Float64Array;
  decay: boolean;
}

export class Net {
  sizes: number[];
  act: Act;
  norm: Norm;
  residual: boolean;
  dropout: number;
  W: Float64Array[] = [];
  b: Float64Array[] = [];
  gamma: Float64Array[] = [];
  beta: Float64Array[] = [];
  runMean: Float64Array[] = [];
  runVar: Float64Array[] = [];
  params: Param[] = [];
  /** RMS of ∂L/∂(layer output) for each hidden layer, filled by backward() */
  gradRms: number[] = [];
  /** RMS of each hidden layer's output, filled by forward() */
  outRms: number[] = [];
  t = 0;
  r: () => number;
  private gW: Float64Array[] = [];
  private gb: Float64Array[] = [];
  private gg: Float64Array[] = [];
  private gbe: Float64Array[] = [];
  // caches of the last forward pass
  private B = 0;
  private cX: Float64Array[] = [];
  private cXhat: Float64Array[] = [];
  private cIstd: Float64Array[] = [];
  private cA: Float64Array[] = []; // post-activation, before dropout
  private cMask: (Float64Array | null)[] = [];
  private cZ: Float64Array[] = [];

  constructor(o: NetOpts) {
    this.sizes = o.sizes;
    this.act = o.act ?? 'relu';
    this.norm = o.norm ?? 'none';
    this.residual = o.residual ?? false;
    this.dropout = o.dropout ?? 0;
    this.r = rng(o.seed ?? 1);
    const init = o.init ?? (this.act === 'relu' ? 'he' : 'xavier');
    const L = this.sizes.length - 1;
    for (let l = 0; l < L; l++) {
      const nin = this.sizes[l];
      const nout = this.sizes[l + 1];
      const last = l === L - 1;
      // the output layer always gets Xavier so only the hidden stack differs between settings
      const std = last && (init === 'small' || init === 'large') ? initStd('xavier', nin, nout) : initStd(init, nin, nout);
      const W = new Float64Array(nin * nout);
      for (let i = 0; i < W.length; i++) W[i] = gauss(this.r) * std;
      this.W.push(W);
      this.b.push(new Float64Array(nout));
      this.gW.push(new Float64Array(W.length));
      this.gb.push(new Float64Array(nout));
      this.params.push(this.mk(W, this.gW[l], true), this.mk(this.b[l], this.gb[l], false));
      if (!last) {
        const ga = new Float64Array(nout).fill(1);
        const be = new Float64Array(nout);
        this.gamma.push(ga);
        this.beta.push(be);
        this.gg.push(new Float64Array(nout));
        this.gbe.push(new Float64Array(nout));
        this.runMean.push(new Float64Array(nout));
        this.runVar.push(new Float64Array(nout).fill(1));
        if (this.norm !== 'none') this.params.push(this.mk(ga, this.gg[l], false), this.mk(be, this.gbe[l], false));
      }
    }
  }

  private mk(p: Float64Array, g: Float64Array, decay: boolean): Param {
    return { p, g, m: new Float64Array(p.length), v: new Float64Array(p.length), decay };
  }

  get nLayers() {
    return this.sizes.length - 1;
  }

  private resid(l: number) {
    return this.residual && l > 0 && this.sizes[l] === this.sizes[l + 1];
  }

  /** Forward a batch (B rows). `train` uses batch statistics and dropout. Returns B logits. */
  forward(X: Float64Array, B: number, train = false): Float64Array {
    this.B = B;
    const L = this.nLayers;
    let x = X;
    this.outRms = [];
    for (let l = 0; l < L; l++) {
      const nin = this.sizes[l];
      const nout = this.sizes[l + 1];
      const W = this.W[l];
      const bias = this.b[l];
      const Z = new Float64Array(B * nout);
      for (let r = 0; r < B; r++) {
        const zo = r * nout;
        for (let o = 0; o < nout; o++) Z[zo + o] = bias[o];
        const xo = r * nin;
        for (let i = 0; i < nin; i++) {
          const xi = x[xo + i];
          if (xi === 0) continue;
          const wo = i * nout;
          for (let o = 0; o < nout; o++) Z[zo + o] += xi * W[wo + o];
        }
      }
      this.cX[l] = x;
      if (l === L - 1) return Z;

      // normalisation
      let Y = Z;
      if (this.norm !== 'none') {
        const xhat = new Float64Array(B * nout);
        const ga = this.gamma[l];
        const be = this.beta[l];
        Y = new Float64Array(B * nout);
        if (this.norm === 'batch') {
          const istd = new Float64Array(nout);
          const rm = this.runMean[l];
          const rv = this.runVar[l];
          for (let o = 0; o < nout; o++) {
            let mu: number;
            let vr: number;
            if (train) {
              mu = 0;
              for (let r = 0; r < B; r++) mu += Z[r * nout + o];
              mu /= B;
              vr = 0;
              for (let r = 0; r < B; r++) vr += (Z[r * nout + o] - mu) ** 2;
              vr /= B;
              rm[o] = 0.9 * rm[o] + 0.1 * mu;
              rv[o] = 0.9 * rv[o] + 0.1 * vr;
            } else {
              mu = rm[o];
              vr = rv[o];
            }
            const is = 1 / Math.sqrt(vr + EPS);
            istd[o] = is;
            for (let r = 0; r < B; r++) {
              const k = r * nout + o;
              xhat[k] = (Z[k] - mu) * is;
              Y[k] = ga[o] * xhat[k] + be[o];
            }
          }
          this.cIstd[l] = istd;
        } else {
          const istd = new Float64Array(B);
          for (let r = 0; r < B; r++) {
            const zo = r * nout;
            let mu = 0;
            for (let o = 0; o < nout; o++) mu += Z[zo + o];
            mu /= nout;
            let vr = 0;
            for (let o = 0; o < nout; o++) vr += (Z[zo + o] - mu) ** 2;
            vr /= nout;
            const is = 1 / Math.sqrt(vr + EPS);
            istd[r] = is;
            for (let o = 0; o < nout; o++) {
              xhat[zo + o] = (Z[zo + o] - mu) * is;
              Y[zo + o] = ga[o] * xhat[zo + o] + be[o];
            }
          }
          this.cIstd[l] = istd;
        }
        this.cXhat[l] = xhat;
      }
      this.cZ[l] = Y;

      // activation, dropout, residual
      const A = new Float64Array(B * nout);
      for (let k = 0; k < A.length; k++) A[k] = actF(this.act, Y[k]);
      this.cA[l] = A;
      let out = A;
      if (train && this.dropout > 0) {
        const keep = 1 - this.dropout;
        const mask = new Float64Array(B * nout);
        out = new Float64Array(B * nout);
        for (let k = 0; k < A.length; k++) {
          mask[k] = this.r() < keep ? 1 / keep : 0; // inverted dropout
          out[k] = A[k] * mask[k];
        }
        this.cMask[l] = mask;
      } else this.cMask[l] = null;
      if (this.resid(l)) {
        if (out === A) out = new Float64Array(A);
        for (let k = 0; k < out.length; k++) out[k] += x[k];
      }
      let s = 0;
      for (let k = 0; k < out.length; k++) s += out[k] * out[k];
      this.outRms.push(Math.sqrt(s / out.length));
      x = out;
    }
    return x;
  }

  /** Back-propagate dLoss/dlogits (B×nout) through the last forward pass, accumulating gradients. */
  backward(dOut: Float64Array) {
    const B = this.B;
    const L = this.nLayers;
    let dX = dOut;
    this.gradRms = new Array(L - 1).fill(0);
    for (let l = L - 1; l >= 0; l--) {
      const nin = this.sizes[l];
      const nout = this.sizes[l + 1];
      let dZ: Float64Array;
      let dRes: Float64Array | null = null;
      if (l === L - 1) dZ = dX;
      else {
        let s = 0;
        for (let k = 0; k < dX.length; k++) s += dX[k] * dX[k];
        this.gradRms[l] = Math.sqrt(s / dX.length);
        if (this.resid(l)) dRes = dX;
        const mask = this.cMask[l];
        const A = this.cA[l];
        const Y = this.cZ[l];
        const dY = new Float64Array(B * nout);
        for (let k = 0; k < dY.length; k++) {
          const g = mask ? dX[k] * mask[k] : dX[k];
          dY[k] = this.act === 'relu' ? (Y[k] > 0 ? g : 0) : g * (1 - A[k] * A[k]);
        }
        if (this.norm === 'none') dZ = dY;
        else {
          dZ = new Float64Array(B * nout);
          const xhat = this.cXhat[l];
          const istd = this.cIstd[l];
          const ga = this.gamma[l];
          const gg = this.gg[l];
          const gbe = this.gbe[l];
          const dxh = new Float64Array(B * nout);
          for (let r = 0; r < B; r++)
            for (let o = 0; o < nout; o++) {
              const k = r * nout + o;
              gg[o] += dY[k] * xhat[k];
              gbe[o] += dY[k];
              dxh[k] = dY[k] * ga[o];
            }
          if (this.norm === 'batch') {
            for (let o = 0; o < nout; o++) {
              let s1 = 0;
              let s2 = 0;
              for (let r = 0; r < B; r++) {
                s1 += dxh[r * nout + o];
                s2 += dxh[r * nout + o] * xhat[r * nout + o];
              }
              for (let r = 0; r < B; r++) {
                const k = r * nout + o;
                dZ[k] = (istd[o] / B) * (B * dxh[k] - s1 - xhat[k] * s2);
              }
            }
          } else {
            for (let r = 0; r < B; r++) {
              const zo = r * nout;
              let s1 = 0;
              let s2 = 0;
              for (let o = 0; o < nout; o++) {
                s1 += dxh[zo + o];
                s2 += dxh[zo + o] * xhat[zo + o];
              }
              for (let o = 0; o < nout; o++) dZ[zo + o] = (istd[r] / nout) * (nout * dxh[zo + o] - s1 - xhat[zo + o] * s2);
            }
          }
        }
      }
      const x = this.cX[l];
      const W = this.W[l];
      const gW = this.gW[l];
      const gb = this.gb[l];
      const dIn = l > 0 ? new Float64Array(B * nin) : null;
      for (let r = 0; r < B; r++) {
        const zo = r * nout;
        const xo = r * nin;
        for (let o = 0; o < nout; o++) gb[o] += dZ[zo + o];
        for (let i = 0; i < nin; i++) {
          const xi = x[xo + i];
          const wo = i * nout;
          let s = 0;
          for (let o = 0; o < nout; o++) {
            const d = dZ[zo + o];
            gW[wo + o] += xi * d;
            s += W[wo + o] * d;
          }
          if (dIn) dIn[xo + i] = s;
        }
      }
      if (dIn && dRes) for (let k = 0; k < dIn.length; k++) dIn[k] += dRes[k];
      if (dIn) dX = dIn;
    }
  }

  /** Frobenius norm of each layer's accumulated weight gradient. */
  weightGradNorms(): number[] {
    return this.gW.map((g) => {
      let s = 0;
      for (let i = 0; i < g.length; i++) s += g[i] * g[i];
      return Math.sqrt(s);
    });
  }

  zeroGrad() {
    for (const q of this.params) q.g.fill(0);
  }

  /** One optimiser step with the accumulated gradients, then zero them. */
  step(lr: number, o: StepOpts = {}) {
    const opt = o.opt ?? 'adam';
    const wd = o.wd ?? 0;
    this.t++;
    const b1 = 0.9;
    const b2 = 0.999;
    const c1 = 1 - Math.pow(b1, this.t);
    const c2 = 1 - Math.pow(b2, this.t);
    const mom = o.momentum ?? 0.9;
    for (const q of this.params) {
      const { p, g, m, v } = q;
      const l2 = q.decay && (opt === 'sgd' || opt === 'adam-l2') ? wd : 0;
      const dec = q.decay && opt === 'adamw' ? wd : 0;
      for (let i = 0; i < p.length; i++) {
        const gi = g[i] + l2 * p[i]; // L2 penalty λ/2·w² adds λw to the gradient
        if (opt === 'sgd') {
          m[i] = mom * m[i] + gi;
          p[i] -= lr * m[i];
        } else {
          m[i] = b1 * m[i] + (1 - b1) * gi;
          v[i] = b2 * v[i] + (1 - b2) * gi * gi;
          p[i] -= (lr * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + 1e-8) + lr * dec * p[i];
        }
        g[i] = 0;
      }
    }
  }

  /** Mean binary cross-entropy of a batch (eval mode unless train=true) and its gradient into the net. */
  lossAndBackward(X: Float64Array, Y: ArrayLike<number>, B: number): number {
    const z = this.forward(X, B, true);
    const d = new Float64Array(B);
    let loss = 0;
    for (let r = 0; r < B; r++) {
      loss += bce(z[r], Y[r]);
      d[r] = (sigm(z[r]) - Y[r]) / B;
    }
    this.backward(d);
    return loss / B;
  }

  /** Mean loss and accuracy in eval mode. */
  evaluate(X: Float64Array, Y: ArrayLike<number>, B: number): { loss: number; acc: number } {
    const z = this.forward(X, B, false);
    let loss = 0;
    let ok = 0;
    for (let r = 0; r < B; r++) {
      loss += bce(z[r], Y[r]);
      if ((z[r] > 0 ? 1 : 0) === Y[r]) ok++;
    }
    return { loss: loss / B, acc: ok / B };
  }

  /** All hidden-and-output weights (not biases or norm parameters), for histograms. */
  allWeights(): number[] {
    const out: number[] = [];
    for (const W of this.W) for (let i = 0; i < W.length; i++) out.push(W[i]);
    return out;
  }
}

export const sigm = (z: number) => 1 / (1 + Math.exp(-z));
/** Numerically stable BCE with a logit: log(1+e^z) − y·z. */
export function bce(z: number, y: number): number {
  return Math.max(z, 0) - y * z + Math.log1p(Math.exp(-Math.abs(z)));
}

/* ═══════════════════ data ═══════════════════ */

export interface Data {
  X: Float64Array;
  Y: Float64Array;
  n: number;
  pts: { x: number; y: number; label: number }[];
}

export function toData(pts: { x: number; y: number; label: number }[]): Data {
  const X = new Float64Array(pts.length * 2);
  const Y = new Float64Array(pts.length);
  pts.forEach((p, i) => {
    X[2 * i] = p.x;
    X[2 * i + 1] = p.y;
    Y[i] = p.label;
  });
  return { X, Y, n: pts.length, pts };
}

/** A dataset randomly split into a training part of nTrain points and a validation part of nVal points. */
export function splitData(name: DatasetName, nTrain: number, nVal: number, noise: number, seed: number): { train: Data; val: Data } {
  const pts = makeDataset(name, nTrain + nVal, noise, seed);
  // shuffle first: some generators (the spiral) order their points along the curve
  const r = rng(seed + 1);
  for (let i = pts.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = pts[i];
    pts[i] = pts[j];
    pts[j] = t;
  }
  return { train: toData(pts.slice(0, nTrain)), val: toData(pts.slice(nTrain)) };
}

/** One epoch of shuffled mini-batches; returns the mean training loss seen (with dropout on). */
export function trainEpoch(net: Net, d: Data, batch: number, lr: number, o: StepOpts = {}): number {
  const idx = Array.from({ length: d.n }, (_, i) => i);
  for (let i = d.n - 1; i > 0; i--) {
    const j = Math.floor(net.r() * (i + 1));
    const t = idx[i];
    idx[i] = idx[j];
    idx[j] = t;
  }
  let tot = 0;
  for (let s = 0; s < d.n; s += batch) {
    const B = Math.min(batch, d.n - s);
    const X = new Float64Array(B * 2);
    const Y = new Float64Array(B);
    for (let k = 0; k < B; k++) {
      const i = idx[s + k];
      X[2 * k] = d.X[2 * i];
      X[2 * k + 1] = d.X[2 * i + 1];
      Y[k] = d.Y[i];
    }
    tot += net.lossAndBackward(X, Y, B) * B;
    net.step(lr, o);
  }
  return tot / d.n;
}

/**
 * Mini-batch training spread over many small calls (one animation frame each).
 * Each epoch reshuffles the training set with the net's own PRNG, so runs are deterministic.
 * After every epoch it records the full training loss (eval mode) and, if given, validation loss.
 */
export class Trainer {
  net: Net;
  train: Data;
  val: Data | null;
  batch: number;
  lr: number;
  opts: StepOpts;
  epoch = 0;
  trainLoss: number[] = [];
  valLoss: number[] = [];
  valAcc: number[] = [];
  private order: number[] = [];
  private pos = 0;

  constructor(net: Net, train: Data, val: Data | null, o: { batch: number; lr: number } & StepOpts) {
    this.net = net;
    this.train = train;
    this.val = val;
    this.batch = o.batch;
    this.lr = o.lr;
    this.opts = { opt: o.opt, wd: o.wd, momentum: o.momentum };
    this.record();
  }

  private record() {
    this.trainLoss.push(this.net.evaluate(this.train.X, this.train.Y, this.train.n).loss);
    if (this.val) {
      const v = this.net.evaluate(this.val.X, this.val.Y, this.val.n);
      this.valLoss.push(v.loss);
      this.valAcc.push(v.acc);
    }
  }

  private shuffle() {
    const n = this.train.n;
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(this.net.r() * (i + 1));
      const t = idx[i];
      idx[i] = idx[j];
      idx[j] = t;
    }
    this.order = idx;
    this.pos = 0;
  }

  /** Run k mini-batch steps (stopping early at maxEpoch). */
  steps(k: number, maxEpoch = Infinity) {
    const d = this.train;
    for (let s = 0; s < k && this.epoch < maxEpoch; s++) {
      if (this.pos === 0) this.shuffle();
      const B = Math.min(this.batch, d.n - this.pos);
      const X = new Float64Array(B * 2);
      const Y = new Float64Array(B);
      for (let j = 0; j < B; j++) {
        const i = this.order[this.pos + j];
        X[2 * j] = d.X[2 * i];
        X[2 * j + 1] = d.X[2 * i + 1];
        Y[j] = d.Y[i];
      }
      this.net.lossAndBackward(X, Y, B);
      this.net.step(this.lr, this.opts);
      this.pos += B;
      if (this.pos >= d.n) {
        this.pos = 0;
        this.epoch++;
        this.record();
      }
    }
  }

  /** Steps that make up one epoch. */
  get stepsPerEpoch() {
    return Math.ceil(this.train.n / this.batch);
  }
}

/** Number of hidden layers whose output is exactly zero for every example in d (dead ReLU layers). */
export function deadLayers(net: Net, d: Data): number {
  net.forward(d.X, d.n, false);
  return net.outRms.filter((v) => v === 0).length;
}

/** Probability grid G×G over [-dom, dom]² (row 0 = top), eval mode. */
export function probGrid(net: Net, G: number, dom: number): Float64Array {
  const X = new Float64Array(G * G * 2);
  for (let j = 0; j < G; j++)
    for (let i = 0; i < G; i++) {
      const k = j * G + i;
      X[2 * k] = -dom + ((i + 0.5) / G) * 2 * dom;
      X[2 * k + 1] = dom - ((j + 0.5) / G) * 2 * dom;
    }
  const z = net.forward(X, G * G, false);
  const out = new Float64Array(G * G);
  for (let k = 0; k < out.length; k++) out[k] = sigm(z[k]);
  return out;
}

/* ═══════════════════ Lesson 1, figure 1: the signal through the layers ═══════════════════ */

export const HIST_BINS = 32;

export interface SignalLayer {
  std: number;
  /** fraction of values in each bin over the display range */
  hist: Float64Array;
  /** fraction of values below / above the display range */
  under: number;
  over: number;
  /** fraction of exact zeros (ReLU) — left out of hist */
  zeros: number;
}

const normalCache = new Map<number, Float64Array>();
/** The first n standard-normal draws of rng(seed), cached. */
function normals(seed: number, n: number): Float64Array {
  const c = normalCache.get(seed);
  if (c && c.length >= n) return c;
  const r = rng(seed);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = gauss(r);
  normalCache.set(seed, out);
  return out;
}

/** Display range of the activation histogram. */
export function histRange(act: Act): [number, number] {
  return act === 'tanh' ? [-1, 1] : [0, 3];
}

/**
 * Feed `batch` standard-normal inputs of size `width` through `depth` fully connected
 * layers (no bias) and record each layer's activation statistics.
 */
export function signalPass(act: Act, init: Init, depth: number, width = 100, batch = 64, seed = 4): SignalLayer[] {
  // every setting scales the same standard-normal draws, so draw them once
  const z = normals(seed, batch * width + depth * width * width);
  let p = 0;
  let x = new Float64Array(batch * width);
  for (let i = 0; i < x.length; i++) x[i] = z[p++];
  const [lo, hi] = histRange(act);
  const out: SignalLayer[] = [];
  for (let l = 0; l < depth; l++) {
    const std = initStd(init, width, width);
    const W = new Float64Array(width * width);
    for (let i = 0; i < W.length; i++) W[i] = z[p++] * std;
    const y = new Float64Array(batch * width);
    for (let b = 0; b < batch; b++) {
      const bo = b * width;
      for (let i = 0; i < width; i++) {
        const xi = x[bo + i];
        if (xi === 0) continue;
        const wo = i * width;
        for (let o = 0; o < width; o++) y[bo + o] += xi * W[wo + o];
      }
    }
    for (let k = 0; k < y.length; k++) y[k] = actF(act, y[k]);
    out.push(layerStats(y, lo, hi, act === 'relu'));
    x = y;
  }
  return out;
}

export function layerStats(y: Float64Array, lo: number, hi: number, skipZeros: boolean): SignalLayer {
  let m = 0;
  for (let k = 0; k < y.length; k++) m += y[k];
  m /= y.length;
  let v = 0;
  for (let k = 0; k < y.length; k++) v += (y[k] - m) ** 2;
  const std = Math.sqrt(v / y.length);
  const hist = new Float64Array(HIST_BINS);
  let under = 0;
  let over = 0;
  let zeros = 0;
  for (let k = 0; k < y.length; k++) {
    const val = y[k];
    if (skipZeros && val === 0) {
      zeros++;
      continue;
    }
    if (val < lo) under++;
    else if (val > hi) over++;
    else hist[Math.min(HIST_BINS - 1, Math.floor(((val - lo) / (hi - lo)) * HIST_BINS))]++;
  }
  for (let i = 0; i < HIST_BINS; i++) hist[i] /= y.length;
  return { std, hist, under: under / y.length, over: over / y.length, zeros: zeros / y.length };
}

/* ═══════════════════ Lesson 1, figure 2: gradient sizes ═══════════════════ */

export interface GradProfile {
  /** RMS of each hidden layer's output (forward) */
  act: number[];
  /** RMS of ∂L/∂(hidden layer output) (backward) */
  grad: number[];
  /** ‖∂L/∂W‖ of each hidden layer */
  gw: number[];
  loss: number;
}

/** One forward + backward pass of a deep ReLU MLP on random inputs and random labels. */
export function gradProfile(init: Init, norm: Norm, residual: boolean, depth: number, width = 64, batch = 64, seed = 5): GradProfile {
  const net = new Net({ sizes: [width, ...new Array(depth).fill(width), 1], act: 'relu', init, norm, residual, seed });
  const r = rng(seed + 100);
  const X = new Float64Array(batch * width);
  for (let i = 0; i < X.length; i++) X[i] = gauss(r);
  const Y = new Float64Array(batch);
  for (let i = 0; i < batch; i++) Y[i] = r() < 0.5 ? 1 : 0;
  const loss = net.lossAndBackward(X, Y, batch);
  const gw = net.weightGradNorms().slice(0, depth);
  return { act: net.outRms.slice(), grad: net.gradRms.slice(), gw, loss };
}

/* ═══════════════════ Lesson 1, figure 3: training a deep narrow net ═══════════════════ */

export function makeDeepPair(depth: number, width: number, seed: number): { plain: Net; normed: Net } {
  const sizes = [2, ...new Array(depth).fill(width), 1];
  return {
    plain: new Net({ sizes, act: 'relu', init: 'he', seed }),
    normed: new Net({ sizes, act: 'relu', init: 'he', norm: 'layer', residual: true, seed }),
  };
}

/* ═══════════════════ Lesson 2: learning-rate schedules ═══════════════════ */

export type Sched = 'const' | 'step' | 'cosine' | 'warmcos';

/** Learning rate at step t (0-based) of T total steps for a peak rate `peak`. */
export function schedLR(s: Sched, t: number, T: number, peak: number, warmFrac = 0.1): number {
  if (s === 'const') return peak;
  if (s === 'step') return peak * (t < T * 0.5 ? 1 : t < T * 0.75 ? 0.1 : 0.01);
  if (s === 'cosine') return peak * 0.5 * (1 + Math.cos((Math.PI * t) / T));
  const W = Math.max(1, Math.round(T * warmFrac));
  if (t < W) return (peak * (t + 1)) / W;
  return peak * 0.5 * (1 + Math.cos((Math.PI * (t - W)) / Math.max(1, T - W)));
}

export const SCHEDS: Sched[] = ['const', 'step', 'cosine', 'warmcos'];

/**
 * One training run under a learning-rate schedule: SGD with momentum on random mini-batches.
 * Runs with the same seed start from the same weights and see the same mini-batches.
 */
export class SchedRun {
  net: Net;
  s: Sched;
  T: number;
  peak: number;
  t = 0;
  /** full-batch training loss every `every` steps (index 0 = before training) */
  loss: number[] = [];
  every: number;
  opt: Opt;
  private d: Data;
  private batch: number;

  constructor(s: Sched, d: Data, o: { sizes: number[]; seed: number; T: number; peak: number; batch?: number; every?: number; opt?: Opt }) {
    this.opt = o.opt ?? 'sgd';
    this.s = s;
    this.d = d;
    this.T = o.T;
    this.peak = o.peak;
    this.batch = o.batch ?? 20;
    this.every = o.every ?? 10;
    this.net = new Net({ sizes: o.sizes, seed: o.seed });
    this.loss.push(this.net.evaluate(d.X, d.Y, d.n).loss);
  }

  get done() {
    return this.t >= this.T;
  }

  /** Take up to k steps. */
  run(k: number) {
    const { d, net } = this;
    const B = this.batch;
    const X = new Float64Array(B * 2);
    const Y = new Float64Array(B);
    for (let n = 0; n < k && this.t < this.T; n++) {
      for (let j = 0; j < B; j++) {
        const i = Math.floor(net.r() * d.n);
        X[2 * j] = d.X[2 * i];
        X[2 * j + 1] = d.X[2 * i + 1];
        Y[j] = d.Y[i];
      }
      net.lossAndBackward(X, Y, B);
      net.step(schedLR(this.s, this.t, this.T, this.peak), { opt: this.opt });
      this.t++;
      if (this.t % this.every === 0) {
        const l = net.evaluate(d.X, d.Y, d.n).loss;
        this.loss.push(isFinite(l) ? l : 10);
      }
    }
  }
}

/** Histogram of values in [lo, hi] with `bins` bins; values outside are clamped into the end bins. */
export function histogram(vals: ArrayLike<number>, lo: number, hi: number, bins: number): number[] {
  const h = new Array(bins).fill(0);
  for (let i = 0; i < vals.length; i++) {
    const k = Math.floor(((vals[i] - lo) / (hi - lo)) * bins);
    h[Math.max(0, Math.min(bins - 1, k))]++;
  }
  return h;
}

/** Index of the smallest value (first one on ties). */
export function argmin(xs: ArrayLike<number>): number {
  let k = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] < xs[k]) k = i;
  return k;
}

/* ═══════════════════ canvas helpers shared by both lessons ═══════════════════ */

export type RGB = [number, number, number];

let scratch: HTMLCanvasElement | null = null;

/**
 * Decision-boundary panel: class-probability heatmap over [-dom, dom]², the p = 0.5 contour
 * and the data points (filled = training, hollow = validation).
 */
export function drawBoundary(
  ctx: CanvasRenderingContext2D,
  P: Palette,
  rgb: { base: RGB; pos: RGB; neg: RGB },
  box: { x: number; y: number; size: number },
  probs: Float64Array,
  G: number,
  dom: number,
  train: Data,
  val: Data | null = null,
) {
  const { x, y, size } = box;
  const img = new ImageData(G, G);
  for (let k = 0; k < G * G; k++) {
    const t = (probs[k] - 0.5) * 2;
    const m = Math.min(1, Math.abs(t)) * 0.55;
    const c = t >= 0 ? rgb.pos : rgb.neg;
    img.data[4 * k] = rgb.base[0] + (c[0] - rgb.base[0]) * m;
    img.data[4 * k + 1] = rgb.base[1] + (c[1] - rgb.base[1]) * m;
    img.data[4 * k + 2] = rgb.base[2] + (c[2] - rgb.base[2]) * m;
    img.data[4 * k + 3] = 255;
  }
  if (!scratch) scratch = document.createElement('canvas');
  scratch.width = G;
  scratch.height = G;
  scratch.getContext('2d')!.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(scratch, x, y, size, size);
  ctx.restore();
  // 0.5 contour by marching squares over cell centres
  const cs = size / G;
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  const v = (i: number, j: number) => probs[j * G + i] - 0.5;
  const f = (a: number, b: number) => a / (a - b);
  for (let j = 0; j < G - 1; j++)
    for (let i = 0; i < G - 1; i++) {
      const a = v(i, j);
      const b = v(i + 1, j);
      const c = v(i + 1, j + 1);
      const d = v(i, j + 1);
      const pts: [number, number][] = [];
      if (a > 0 !== b > 0) pts.push([i + f(a, b), j]);
      if (b > 0 !== c > 0) pts.push([i + 1, j + f(b, c)]);
      if (c > 0 !== d > 0) pts.push([i + 1 - f(c, d), j + 1]);
      if (d > 0 !== a > 0) pts.push([i, j + 1 - f(d, a)]);
      for (let q = 0; q + 1 < pts.length; q += 2) {
        ctx.moveTo(x + (pts[q][0] + 0.5) * cs, y + (pts[q][1] + 0.5) * cs);
        ctx.lineTo(x + (pts[q + 1][0] + 0.5) * cs, y + (pts[q + 1][1] + 0.5) * cs);
      }
    }
  ctx.stroke();
  const X = (u: number) => x + ((u + dom) / (2 * dom)) * size;
  const Y = (u: number) => y + ((dom - u) / (2 * dom)) * size;
  const r = size < 260 ? 2.6 : 3.4;
  if (val) {
    for (const p of val.pts) {
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), r * 0.8, 0, Math.PI * 2);
      ctx.strokeStyle = p.label ? P.pos : P.neg;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  for (const p of train.pts) {
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), r, 0, Math.PI * 2);
    ctx.fillStyle = p.label ? P.pos : P.neg;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = P.surface;
    ctx.stroke();
  }
}

export interface Series {
  vals: ArrayLike<number>;
  color: string;
  dash?: number[];
  width?: number;
  /** x of vals[i] is i * xStep (default 1) */
  xStep?: number;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const sup = (n: number) => String(n).replace('-', '⁻').replace(/[0-9]/g, (d) => SUP[+d]);

/**
 * Line chart for training curves. With `log`, the y axis is log10 between yMin and yMax.
 * `marker` draws a vertical dashed line with a label (e.g. the early-stopping epoch).
 */
export function drawCurves(
  ctx: CanvasRenderingContext2D,
  P: Palette,
  w: number,
  h: number,
  o: { series: Series[]; xMax: number; yMin: number; yMax: number; log?: boolean; xLabel?: string; yLabel?: string; xTicks?: number[]; yTicks?: number[]; marker?: { x: number; y?: number; label: string; color: string } },
) {
  const pad = { l: 40, r: 10, t: 12, b: 26 };
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;
  const tf = (v: number) => (o.log ? Math.log10(Math.max(v, 1e-12)) : v);
  const lo = tf(o.yMin);
  const hi = tf(o.yMax);
  const X = (x: number) => pad.l + (x / o.xMax) * pw;
  const Y = (v: number) => pad.t + (1 - (Math.min(Math.max(tf(v), lo), hi) - lo) / (hi - lo)) * ph;
  ctx.font = `10px ${P.fontMono}`;
  ctx.lineWidth = 1;
  // y grid
  const yt = o.yTicks ?? [];
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of yt) {
    const yy = Math.round(Y(v)) + 0.5;
    ctx.strokeStyle = P.grid;
    ctx.beginPath();
    ctx.moveTo(pad.l, yy);
    ctx.lineTo(pad.l + pw, yy);
    ctx.stroke();
    ctx.fillStyle = P.ink3;
    ctx.fillText(String(v), pad.l - 5, yy);
  }
  // x ticks
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const x of o.xTicks ?? []) {
    const xx = Math.round(X(x)) + 0.5;
    ctx.textAlign = x >= o.xMax ? 'right' : 'center';
    ctx.strokeStyle = P.grid;
    ctx.beginPath();
    ctx.moveTo(xx, pad.t);
    ctx.lineTo(xx, pad.t + ph);
    ctx.stroke();
    ctx.fillStyle = P.ink3;
    ctx.fillText(String(x), xx, pad.t + ph + 5);
  }
  ctx.strokeStyle = P.lineStrong;
  ctx.beginPath();
  ctx.moveTo(pad.l + 0.5, pad.t);
  ctx.lineTo(pad.l + 0.5, pad.t + ph + 0.5);
  ctx.lineTo(pad.l + pw, pad.t + ph + 0.5);
  ctx.stroke();
  // series
  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.l, pad.t - 2, pw + 2, ph + 4);
  ctx.clip();
  for (const s of o.series) {
    const n = s.vals.length;
    if (n < 2) continue;
    const st = s.xStep ?? 1;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width ?? 2;
    ctx.lineJoin = 'round';
    ctx.setLineDash(s.dash ?? []);
    ctx.beginPath();
    const every = Math.max(1, Math.floor(n / Math.max(60, pw)));
    for (let i = 0; i < n; i += every) {
      if (i === 0) ctx.moveTo(X(0), Y(s.vals[0]));
      else ctx.lineTo(X(i * st), Y(s.vals[i]));
    }
    ctx.lineTo(X((n - 1) * st), Y(s.vals[n - 1]));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  if (o.marker) {
    const m = o.marker;
    const xx = X(m.x);
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(xx, pad.t);
    ctx.lineTo(xx, pad.t + ph);
    ctx.stroke();
    ctx.setLineDash([]);
    if (m.y !== undefined) {
      ctx.beginPath();
      ctx.arc(xx, Y(m.y), 4, 0, Math.PI * 2);
      ctx.fillStyle = m.color;
      ctx.fill();
    }
    ctx.font = `600 11px ${P.fontBody}`;
    const tw = ctx.measureText(m.label).width + 8;
    const lx = Math.min(Math.max(xx - tw / 2, pad.l + 2), pad.l + pw - tw);
    ctx.fillStyle = P.surface;
    ctx.fillRect(lx, pad.t + 2, tw, 16);
    ctx.fillStyle = m.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.label, lx + 4, pad.t + 10);
  }
  ctx.font = `11px ${P.fontBody}`;
  ctx.fillStyle = P.ink2;
  if (o.xLabel) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const tw = ctx.measureText(o.xLabel).width;
    ctx.fillStyle = P.surface;
    ctx.fillRect(pad.l + pw - tw - 6, pad.t + ph - 18, tw + 6, 15);
    ctx.fillStyle = P.ink2;
    ctx.fillText(o.xLabel, pad.l + pw - 3, pad.t + ph - 4);
  }
  if (o.yLabel) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const tw = ctx.measureText(o.yLabel).width;
    ctx.fillStyle = P.surface;
    ctx.fillRect(pad.l + 3, pad.t + 1, tw + 6, 15);
    ctx.fillStyle = P.ink2;
    ctx.fillText(o.yLabel, pad.l + 6, pad.t + 3);
  }
}
