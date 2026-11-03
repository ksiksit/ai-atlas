/* 대형 언어 모델 · 다듬기 (파인튜닝과 LoRA, 사람의 피드백으로 학습): pure logic for the figures */
import { gauss, rng } from '../../../../lib/math';

/* ═══════════════════ 1. Transfer learning on a toy MLP ═══════════════════ */

/** Hidden width of the toy network 2 → H → H → H → head. */
export const TL_H = 24;
export const TL_SIZES = [2, TL_H, TL_H, TL_H];
/** The H×H hidden layers that get LoRA adapters (layer 0 is 2 → H, already tiny). */
export const TL_LORA_LAYERS = [1, 2];
/** The new task rotates the old task's boundaries by this many degrees. */
export const TL_ROT = 30;
export const TL_PRE_N = 600; // old-task training points
export const TL_NEW_N = 80; // new-task training points (fine-tuning data is small)
export const TL_TEST_N = 600; // test points per task
export const TL_PRE_STEPS = 2000; // pretraining: Adam, mini-batch 64
export const TL_PRE_BATCH = 64;
export const TL_FT_STEPS = 400; // fine-tuning: Adam, full batch of the 80 points
export const TL_LR = 0.01;
export const TL_SEED = 7;

/** Old task: XOR-style quadrants (label 1 where x and y have the same sign). */
export const taskOld = (x: number, y: number) => (x * y > 0 ? 1 : 0);
/** New task: the same quadrant pattern rotated by TL_ROT degrees. */
export function taskNew(x: number, y: number): number {
  const t = (TL_ROT * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return taskOld(c * x + s * y, -s * x + c * y);
}

export interface TlData {
  X: Float64Array; // n × 2
  Y: Float64Array;
  n: number;
}

export function tlData(task: (x: number, y: number) => number, n: number, seed: number): TlData {
  const r = rng(seed);
  const X = new Float64Array(2 * n);
  const Y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = r() * 2 - 1;
    const y = r() * 2 - 1;
    X[2 * i] = x;
    X[2 * i + 1] = y;
    Y[i] = task(x, y);
  }
  return { X, Y, n };
}

/** The four data sets of figure 1 (fixed seeds). */
export function tlSets() {
  return {
    preTrain: tlData(taskOld, TL_PRE_N, 1),
    preTest: tlData(taskOld, TL_TEST_N, 2),
    newTrain: tlData(taskNew, TL_NEW_N, 3),
    newTest: tlData(taskNew, TL_TEST_N, 4),
  };
}

/** A parameter array with its gradient and Adam moments. */
interface Param {
  v: Float64Array;
  g: Float64Array;
  m: Float64Array;
  s: Float64Array;
}
const param = (n: number): Param => ({ v: new Float64Array(n), g: new Float64Array(n), m: new Float64Array(n), s: new Float64Array(n) });
const copyParam = (p: Param): Param => ({ v: p.v.slice(), g: new Float64Array(p.v.length), m: new Float64Array(p.v.length), s: new Float64Array(p.v.length) });

/** pre: pretrain body + old head · head: new head only · full: body + new head · lora: adapters + new head */
export type TlMode = 'pre' | 'head' | 'full' | 'lora';

/**
 * 2 → 24 → 24 → 24 (tanh) with two logistic heads: head 0 for the old task, head 1 for the new one.
 * Optional LoRA adapters on the H×H layers: h = tanh(W a + b + (α/r)·B(A a)), B starts at 0.
 */
export class TlNet {
  W: Param[] = [];
  b: Param[] = [];
  A: (Param | null)[] = [null, null, null];
  B: (Param | null)[] = [null, null, null];
  hw: Param[] = []; // head weights [old, new]
  hb: Param[] = [];
  rank = 0;
  scale = 1;
  t = 0; // Adam step counter
  private acts: Float64Array[] = TL_SIZES.map((n) => new Float64Array(n));
  private delta: Float64Array[] = TL_SIZES.map((n) => new Float64Array(n));
  private ax: Float64Array[] = [new Float64Array(16), new Float64Array(16), new Float64Array(16)];

  constructor(seed: number) {
    const r = rng(seed);
    for (let l = 0; l < 3; l++) {
      const nin = TL_SIZES[l];
      const nout = TL_SIZES[l + 1];
      const W = param(nin * nout);
      for (let i = 0; i < W.v.length; i++) W.v[i] = gauss(r) * Math.sqrt(1 / nin);
      this.W.push(W);
      this.b.push(param(nout));
    }
    for (let k = 0; k < 2; k++) {
      const w = param(TL_H);
      for (let i = 0; i < TL_H; i++) w.v[i] = gauss(r) * Math.sqrt(1 / TL_H);
      this.hw.push(w);
      this.hb.push(param(1));
    }
  }

  /** Copy of the weights (no adapters, fresh optimizer state). */
  clone(): TlNet {
    const n = new TlNet(0);
    n.W = this.W.map(copyParam);
    n.b = this.b.map(copyParam);
    n.hw = this.hw.map(copyParam);
    n.hb = this.hb.map(copyParam);
    return n;
  }

  /** Fresh random new-task head (the same for every method). */
  resetNewHead(seed: number) {
    const r = rng(seed);
    for (let i = 0; i < TL_H; i++) this.hw[1].v[i] = gauss(r) * Math.sqrt(1 / TL_H);
    this.hb[1].v[0] = 0;
  }

  /** LoRA adapters: A ~ N(0, 1/n_in), B = 0, scale α/r with α = r unless given. */
  addLora(rank: number, seed: number, alphaScale = rank) {
    const r = rng(seed);
    this.rank = rank;
    this.scale = alphaScale / rank;
    for (const l of TL_LORA_LAYERS) {
      const nin = TL_SIZES[l];
      const nout = TL_SIZES[l + 1];
      const A = param(rank * nin);
      for (let i = 0; i < A.v.length; i++) A.v[i] = gauss(r) / Math.sqrt(nin);
      this.A[l] = A;
      this.B[l] = param(nout * rank);
    }
  }

  /** Forward one point; returns the head's logit. useLora = false runs the frozen base only. */
  forward(x: number, y: number, head: number, useLora = true): number {
    const acts = this.acts;
    acts[0][0] = x;
    acts[0][1] = y;
    for (let l = 0; l < 3; l++) {
      const nin = TL_SIZES[l];
      const nout = TL_SIZES[l + 1];
      const a = acts[l];
      const o = acts[l + 1];
      const W = this.W[l].v;
      const b = this.b[l].v;
      const Al = useLora ? this.A[l] : null;
      const Bl = useLora ? this.B[l] : null;
      const ax = this.ax[l];
      const R = this.rank;
      if (Al) {
        for (let k = 0; k < R; k++) {
          let s = 0;
          for (let i = 0; i < nin; i++) s += Al.v[k * nin + i] * a[i];
          ax[k] = s;
        }
      }
      for (let j = 0; j < nout; j++) {
        let s = b[j];
        const row = j * nin;
        for (let i = 0; i < nin; i++) s += W[row + i] * a[i];
        if (Bl) {
          let t = 0;
          for (let k = 0; k < R; k++) t += Bl.v[j * R + k] * ax[k];
          s += this.scale * t;
        }
        o[j] = Math.tanh(s);
      }
    }
    const h = acts[3];
    const w = this.hw[head].v;
    let z = this.hb[head].v[0];
    for (let i = 0; i < TL_H; i++) z += w[i] * h[i];
    return z;
  }

  /** Accumulate gradients of the last forward pass given dL/dz. */
  private backward(dz: number, head: number, body: boolean, lora: boolean) {
    const acts = this.acts;
    const h = acts[3];
    const gw = this.hw[head].g;
    for (let i = 0; i < TL_H; i++) gw[i] += dz * h[i];
    this.hb[head].g[0] += dz;
    if (!body && !lora) return;
    const w = this.hw[head].v;
    const top = this.delta[3];
    for (let i = 0; i < TL_H; i++) top[i] = dz * w[i];
    for (let l = 2; l >= 0; l--) {
      const nin = TL_SIZES[l];
      const nout = TL_SIZES[l + 1];
      const a = acts[l];
      const o = acts[l + 1];
      const dout = this.delta[l + 1];
      const din = this.delta[l];
      for (let j = 0; j < nout; j++) dout[j] *= 1 - o[j] * o[j];
      if (body) {
        const gW = this.W[l].g;
        const gb = this.b[l].g;
        for (let j = 0; j < nout; j++) {
          const dj = dout[j];
          gb[j] += dj;
          const row = j * nin;
          for (let i = 0; i < nin; i++) gW[row + i] += dj * a[i];
        }
      }
      if (l === 0) break;
      const W = this.W[l].v;
      for (let i = 0; i < nin; i++) din[i] = 0;
      for (let j = 0; j < nout; j++) {
        const dj = dout[j];
        const row = j * nin;
        for (let i = 0; i < nin; i++) din[i] += W[row + i] * dj;
      }
      const Al = this.A[l];
      const Bl = this.B[l];
      if (Al && Bl) {
        const R = this.rank;
        const ax = this.ax[l];
        for (let k = 0; k < R; k++) {
          let dax = 0;
          for (let j = 0; j < nout; j++) {
            dax += Bl.v[j * R + k] * dout[j];
            if (lora) Bl.g[j * R + k] += this.scale * dout[j] * ax[k];
          }
          dax *= this.scale;
          for (let i = 0; i < nin; i++) {
            if (lora) Al.g[k * nin + i] += dax * a[i];
            din[i] += Al.v[k * nin + i] * dax;
          }
        }
      }
    }
  }

  /** Parameters a method trains. */
  params(mode: TlMode): Param[] {
    if (mode === 'pre') return [...this.W, ...this.b, this.hw[0], this.hb[0]];
    if (mode === 'head') return [this.hw[1], this.hb[1]];
    if (mode === 'full') return [...this.W, ...this.b, this.hw[1], this.hb[1]];
    const ad: Param[] = [];
    for (const l of TL_LORA_LAYERS) {
      const a = this.A[l];
      const b = this.B[l];
      if (a && b) ad.push(a, b);
    }
    return [...ad, this.hw[1], this.hb[1]];
  }

  trainableCount(mode: TlMode): number {
    return this.params(mode).reduce((s, p) => s + p.v.length, 0);
  }

  /** Mean logistic loss over idx and its gradient into p.g (gradients are zeroed first). */
  lossAndGrad(mode: TlMode, d: TlData, idx: ArrayLike<number>): number {
    for (const p of this.params(mode)) p.g.fill(0);
    const head = mode === 'pre' ? 0 : 1;
    const body = mode === 'pre' || mode === 'full';
    const lora = mode === 'lora';
    let loss = 0;
    const n = idx.length;
    for (let k = 0; k < n; k++) {
      const i = idx[k];
      const z = this.forward(d.X[2 * i], d.X[2 * i + 1], head);
      const y = d.Y[i];
      loss += Math.max(z, 0) - z * y + Math.log1p(Math.exp(-Math.abs(z)));
      this.backward((1 / (1 + Math.exp(-z)) - y) / n, head, body, lora);
    }
    return loss / n;
  }

  adam(mode: TlMode, lr: number) {
    this.t++;
    const b1 = 0.9;
    const b2 = 0.999;
    const c1 = 1 - Math.pow(b1, this.t);
    const c2 = 1 - Math.pow(b2, this.t);
    for (const p of this.params(mode)) {
      for (let i = 0; i < p.v.length; i++) {
        p.m[i] = b1 * p.m[i] + (1 - b1) * p.g[i];
        p.s[i] = b2 * p.s[i] + (1 - b2) * p.g[i] * p.g[i];
        p.v[i] -= (lr * (p.m[i] / c1)) / (Math.sqrt(p.s[i] / c2) + 1e-8);
      }
    }
  }

  accuracy(d: TlData, head: number, useLora = true): number {
    let c = 0;
    for (let i = 0; i < d.n; i++) if ((this.forward(d.X[2 * i], d.X[2 * i + 1], head, useLora) > 0 ? 1 : 0) === d.Y[i]) c++;
    return c / d.n;
  }

  /** P(label 1) on a G×G grid over [−1, 1]², row 0 at the top (y = 1). */
  probGrid(G: number, head: number, useLora = true): Float64Array {
    const out = new Float64Array(G * G);
    for (let j = 0; j < G; j++) {
      const y = 1 - ((j + 0.5) / G) * 2;
      for (let i = 0; i < G; i++) {
        const x = ((i + 0.5) / G) * 2 - 1;
        out[j * G + i] = 1 / (1 + Math.exp(-this.forward(x, y, head, useLora)));
      }
    }
    return out;
  }

  /** Effective weight W + (α/r)·B·A of a layer (for merging; equals W without adapters). */
  mergedW(l: number): Float64Array {
    const nin = TL_SIZES[l];
    const nout = TL_SIZES[l + 1];
    const out = this.W[l].v.slice();
    const Al = this.A[l];
    const Bl = this.B[l];
    if (!Al || !Bl) return out;
    const R = this.rank;
    for (let j = 0; j < nout; j++) for (let i = 0; i < nin; i++) {
      let s = 0;
      for (let k = 0; k < R; k++) s += Bl.v[j * R + k] * Al.v[k * nin + i];
      out[j * nin + i] += this.scale * s;
    }
    return out;
  }
}

/** Pretraining on the old task: mini-batches drawn with a seeded PRNG. */
export class TlPretrain {
  net = new TlNet(TL_SEED);
  step = 0;
  loss = NaN;
  private r = rng(5);
  private idx = new Int32Array(TL_PRE_BATCH);
  private data: TlData;
  constructor(data: TlData) {
    this.data = data;
  }
  get done() {
    return this.step >= TL_PRE_STEPS;
  }
  run(k: number) {
    for (let s = 0; s < k && !this.done; s++) {
      for (let j = 0; j < TL_PRE_BATCH; j++) this.idx[j] = Math.floor(this.r() * this.data.n);
      this.loss = this.net.lossAndGrad('pre', this.data, this.idx);
      this.net.adam('pre', TL_LR);
      this.step++;
    }
  }
}

/** Fine-tuning a copy of the pretrained net with one method (full batch on the 80 new points). */
export class TlFinetune {
  net: TlNet;
  step = 0;
  loss = NaN;
  private idx: Int32Array;
  mode: Exclude<TlMode, 'pre'>;
  private data: TlData;
  constructor(base: TlNet, mode: Exclude<TlMode, 'pre'>, data: TlData, rank = 2) {
    this.mode = mode;
    this.data = data;
    this.net = base.clone();
    this.net.resetNewHead(11);
    if (mode === 'lora') this.net.addLora(rank, 13);
    this.idx = Int32Array.from({ length: data.n }, (_, i) => i);
  }
  get done() {
    return this.step >= TL_FT_STEPS;
  }
  run(k: number) {
    for (let s = 0; s < k && !this.done; s++) {
      this.loss = this.net.lossAndGrad(this.mode, this.data, this.idx);
      this.net.adam(this.mode, TL_LR);
      this.step++;
    }
  }
}

/** Run the whole figure-1 experiment synchronously (for the verification script). */
export function tlExperiment(rank = 2) {
  const sets = tlSets();
  const pre = new TlPretrain(sets.preTrain);
  pre.run(TL_PRE_STEPS);
  const base = pre.net;
  const out: Record<string, { newAcc: number; oldAcc: number; oldAccOff: number; params: number }> = {};
  for (const mode of ['head', 'full', 'lora'] as const) {
    const ft = new TlFinetune(base, mode, sets.newTrain, rank);
    ft.run(TL_FT_STEPS);
    out[mode] = { newAcc: ft.net.accuracy(sets.newTest, 1), oldAcc: ft.net.accuracy(sets.preTest, 0), oldAccOff: ft.net.accuracy(sets.preTest, 0, false), params: ft.net.trainableCount(mode) };
  }
  return { base, sets, preAcc: base.accuracy(sets.preTest, 0), oldHeadOnNew: base.accuracy(sets.newTest, 0), total: base.trainableCount('full'), out };
}

/* ═══════════════════ 2. Low-rank updates and the SVD ═══════════════════ */

export const LR_M = 32;
export const LR_N = 32;

/**
 * A 32×32 "weight update": Σ_k s_k u_k v_kᵀ over trueRank random directions with decaying
 * strengths, plus i.i.d. Gaussian noise of std `noise`. kind 'random' is pure noise with the same norm scale.
 */
export function makeDeltaW(kind: 'lowrank' | 'random', noise: number, seed = 21, trueRank = 4): Float64Array {
  const r = rng(seed);
  const m = LR_M;
  const n = LR_N;
  const D = new Float64Array(m * n);
  if (kind === 'random') {
    for (let i = 0; i < m * n; i++) D[i] = gauss(r) * 0.25;
    return D;
  }
  const strengths = [8, 5, 3, 2, 1.2, 0.8];
  for (let k = 0; k < trueRank; k++) {
    const u = Array.from({ length: m }, () => gauss(r));
    const v = Array.from({ length: n }, () => gauss(r));
    const nu = Math.hypot(...u);
    const nv = Math.hypot(...v);
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) D[i * n + j] += (strengths[k] * u[i] * v[j]) / (nu * nv);
  }
  for (let i = 0; i < m * n; i++) D[i] += gauss(r) * noise;
  return D;
}

export interface Svd {
  U: Float64Array; // m × n, orthonormal columns
  S: Float64Array; // n singular values, descending
  V: Float64Array; // n × n, orthonormal
  m: number;
  n: number;
  sweeps: number;
}

/**
 * One-sided Jacobi SVD (Hestenes) for m ≥ n: rotate column pairs of A until all are orthogonal.
 * Then σ_j = ‖column j‖, U = A·V / σ, and the accumulated rotations form V.
 */
export function svdJacobi(A: ArrayLike<number>, m: number, n: number, tol = 1e-13, maxSweeps = 60): Svd {
  const U = Float64Array.from(A as ArrayLike<number>);
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  let sweeps = 0;
  for (; sweeps < maxSweeps; sweeps++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        let alpha = 0;
        let beta = 0;
        let gamma = 0;
        for (let i = 0; i < m; i++) {
          const up = U[i * n + p];
          const uq = U[i * n + q];
          alpha += up * up;
          beta += uq * uq;
          gamma += up * uq;
        }
        if (Math.abs(gamma) <= tol * Math.sqrt(alpha * beta) || gamma === 0) continue;
        off = Math.max(off, Math.abs(gamma) / Math.sqrt(alpha * beta));
        const zeta = (beta - alpha) / (2 * gamma);
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (let i = 0; i < m; i++) {
          const up = U[i * n + p];
          const uq = U[i * n + q];
          U[i * n + p] = c * up - s * uq;
          U[i * n + q] = s * up + c * uq;
        }
        for (let i = 0; i < n; i++) {
          const vp = V[i * n + p];
          const vq = V[i * n + q];
          V[i * n + p] = c * vp - s * vq;
          V[i * n + q] = s * vp + c * vq;
        }
      }
    }
    if (off <= tol) break;
  }
  const S = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    let s = 0;
    for (let i = 0; i < m; i++) s += U[i * n + j] * U[i * n + j];
    S[j] = Math.sqrt(s);
    if (S[j] > 1e-300) for (let i = 0; i < m; i++) U[i * n + j] /= S[j];
  }
  // sort by descending singular value
  const order = Array.from({ length: n }, (_, j) => j).sort((a, b) => S[b] - S[a]);
  const U2 = new Float64Array(m * n);
  const V2 = new Float64Array(n * n);
  const S2 = new Float64Array(n);
  order.forEach((src, dst) => {
    S2[dst] = S[src];
    for (let i = 0; i < m; i++) U2[i * n + dst] = U[i * n + src];
    for (let i = 0; i < n; i++) V2[i * n + dst] = V[i * n + src];
  });
  return { U: U2, S: S2, V: V2, m, n, sweeps: sweeps + 1 };
}

/** Best rank-r approximation Σ_{k<r} σ_k u_k v_kᵀ (Eckart–Young). */
export function rankApprox(svd: Svd, r: number): Float64Array {
  const { U, S, V, m, n } = svd;
  const out = new Float64Array(m * n);
  for (let k = 0; k < Math.min(r, n); k++) {
    const s = S[k];
    for (let i = 0; i < m; i++) {
      const us = U[i * n + k] * s;
      for (let j = 0; j < n; j++) out[i * n + j] += us * V[j * n + k];
    }
  }
  return out;
}

export const frob = (A: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < A.length; i++) s += A[i] * A[i];
  return Math.sqrt(s);
};

/** ‖ΔW − ΔW_r‖_F / ‖ΔW‖_F from the singular values: √(Σ_{k≥r} σ_k²) / √(Σ σ_k²). */
export function relErrFromS(S: ArrayLike<number>, r: number): number {
  let tail = 0;
  let all = 0;
  for (let k = 0; k < S.length; k++) {
    all += S[k] * S[k];
    if (k >= r) tail += S[k] * S[k];
  }
  return Math.sqrt(tail / all);
}

/* ═══════════════════ 3. LoRA parameter and memory calculator ═══════════════════ */

export type LoraTarget = 'qv' | 'attn' | 'attnMlp';

/** Trainable LoRA parameters: r·(d_in + d_out) per adapted matrix, in every layer. */
export function loraParamCount(d: number, dff: number, layers: number, target: LoraTarget, r: number): number {
  const sq = r * (d + d); // one d×d matrix
  const perLayer = target === 'qv' ? 2 * sq : target === 'attn' ? 4 * sq : 4 * sq + 2 * r * (d + dff);
  return layers * perLayer;
}

/** Bytes per parameter (assumptions stated in the figure caption). */
export const BYTES = {
  weight16: 2, // bf16/fp16 weights
  grad16: 2, // gradients in 16 bits
  master32: 4, // fp32 master copy of trainable weights (mixed precision)
  adam32: 8, // Adam m and v in fp32
  nf4: 0.5, // 4-bit base weights (QLoRA's NF4), quantisation constants ignored
};

export interface MemPlan {
  weights: number; // bytes for model weights (frozen or trainable, at storage precision)
  grads: number;
  optim: number; // Adam states + fp32 master copy
  total: number;
}

export type FtMethod = 'full' | 'lora' | 'qlora';

/** Memory for weights + gradients + optimizer state (no activations, no framework overhead). */
export function memPlan(method: FtMethod, total: number, adapters: number): MemPlan {
  const trainable = method === 'full' ? total : adapters;
  const base = method === 'full' ? 0 : total * (method === 'qlora' ? BYTES.nf4 : BYTES.weight16);
  const weights = base + trainable * BYTES.weight16;
  const grads = trainable * BYTES.grad16;
  const optim = trainable * (BYTES.master32 + BYTES.adam32);
  return { weights, grads, optim, total: weights + grads + optim };
}

/* ═══════════════════ 4. Preferences: Bradley–Terry reward model ═══════════════════ */

export interface Response {
  id: string;
  tag: string; // short label
  text: string;
  quality: number; // hidden "true" quality (Bradley–Terry scale)
}

export const PROMPT = '파이썬에서 리스트를 거꾸로 뒤집으려면 어떻게 하나요?';

export const RESPONSES: Response[] = [
  { id: 'good', tag: '정확·친절', text: '`lst.reverse()`는 리스트 자체를 뒤집고, `lst[::-1]`은 뒤집힌 새 리스트를 만듭니다. 원본을 그대로 두려면 `lst[::-1]`을 쓰세요.', quality: 2 },
  { id: 'short', tag: '짧음', text: '`lst[::-1]`을 쓰면 됩니다.', quality: 1 },
  { id: 'long', tag: '장황', text: '좋은 질문입니다! 리스트는 파이썬에서 가장 많이 쓰는 자료구조 중 하나로, 순서가 있는 값의 모음입니다. 리스트를 뒤집는 방법은 여러 가지가 있는데, 그중 하나는 `lst[::-1]`처럼 슬라이싱을 쓰는 것입니다. 슬라이싱은 시작, 끝, 간격을 정해 리스트의 일부를 잘라 내는 문법이며, 간격을 -1로 주면 거꾸로 읽게 됩니다. 이 밖에도 여러 방법이 있으니 상황에 맞게 골라 쓰시면 됩니다. 도움이 되었기를 바랍니다!', quality: 0.5 },
  { id: 'wrong', tag: '틀림', text: '`lst.sort(reverse=True)`를 쓰면 됩니다.', quality: -1 },
  { id: 'refuse', tag: '거절', text: '죄송하지만 그 질문에는 답할 수 없습니다.', quality: -1.5 },
  { id: 'rude', tag: '무례', text: '그 정도는 직접 검색해 보세요.', quality: -2 },
];
export const K = RESPONSES.length;
export const TRUE_Q = RESPONSES.map((r) => r.quality);
/** Response length in units of 100 characters (the feature a biased rater over-rewards). */
export const LEN100 = RESPONSES.map((r) => Array.from(r.text).length / 100);
/** Reference (SFT) policy over the six responses. */
export const PI_REF = [0.2, 0.25, 0.2, 0.15, 0.1, 0.1];

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
/** log σ(z), stable for large |z|. */
export const logSigmoid = (z: number) => (z >= 0 ? -Math.log1p(Math.exp(-z)) : z - Math.log1p(Math.exp(z)));

export interface Pair {
  w: number; // preferred (winner)
  l: number; // rejected (loser)
}

/**
 * Simulated raters: pick two different responses uniformly, prefer a over b with probability
 * σ(score_a − score_b), where score = true quality + lengthBias × length/100 chars.
 */
export function samplePairs(n: number, seed: number, lengthBias = 0): Pair[] {
  const r = rng(seed);
  const score = TRUE_Q.map((q, i) => q + lengthBias * LEN100[i]);
  const out: Pair[] = [];
  for (let t = 0; t < n; t++) {
    const a = Math.floor(r() * K);
    let b = Math.floor(r() * (K - 1));
    if (b >= a) b++;
    const pa = sigmoid(score[a] - score[b]);
    out.push(r() < pa ? { w: a, l: b } : { w: b, l: a });
  }
  return out;
}

/** Bradley–Terry negative log-likelihood (mean over pairs) + (λ / 2N)·‖r‖². */
export function btLoss(r: ArrayLike<number>, pairs: Pair[], lambda = 0): number {
  let s = 0;
  for (const p of pairs) s -= logSigmoid(r[p.w] - r[p.l]);
  let reg = 0;
  for (let i = 0; i < r.length; i++) reg += r[i] * r[i];
  return s / pairs.length + (lambda * reg) / (2 * pairs.length);
}

export function btGrad(r: ArrayLike<number>, pairs: Pair[], lambda = 0): Float64Array {
  const g = new Float64Array(r.length);
  for (const p of pairs) {
    const e = 1 - sigmoid(r[p.w] - r[p.l]); // −d/dΔ log σ(Δ)
    g[p.w] -= e;
    g[p.l] += e;
  }
  for (let i = 0; i < r.length; i++) g[i] = g[i] / pairs.length + (lambda * r[i]) / pairs.length;
  return g;
}

/** Shift so the mean is 0 (rewards are only defined up to a constant). */
export function centered(v: ArrayLike<number>): number[] {
  let m = 0;
  for (let i = 0; i < v.length; i++) m += v[i];
  m /= v.length;
  return Array.from(v, (x) => x - m);
}

/** Live gradient descent on the Bradley–Terry loss. */
export class BtFit {
  r = new Float64Array(K);
  step = 0;
  pairs: Pair[];
  lambda: number;
  lr: number;
  constructor(pairs: Pair[], lambda: number, lr = 2) {
    this.pairs = pairs;
    this.lambda = lambda;
    this.lr = lr;
  }
  run(k: number) {
    for (let s = 0; s < k; s++) {
      const g = btGrad(this.r, this.pairs, this.lambda);
      for (let i = 0; i < K; i++) this.r[i] -= this.lr * g[i];
      this.step++;
    }
  }
  get loss() {
    return btLoss(this.r, this.pairs, this.lambda);
  }
}

/** Reference fit by Newton's method (Hessian is a weighted graph Laplacian; a tiny ridge keeps it invertible). */
export function btNewton(pairs: Pair[], lambda = 0, iters = 50): Float64Array {
  const r = new Float64Array(K);
  for (let it = 0; it < iters; it++) {
    const g = btGrad(r, pairs, lambda);
    const Hm = Array.from({ length: K }, () => new Float64Array(K));
    for (const p of pairs) {
      const s = sigmoid(r[p.w] - r[p.l]);
      const h = (s * (1 - s)) / pairs.length;
      Hm[p.w][p.w] += h;
      Hm[p.l][p.l] += h;
      Hm[p.w][p.l] -= h;
      Hm[p.l][p.w] -= h;
    }
    for (let i = 0; i < K; i++) Hm[i][i] += lambda / pairs.length + 1e-9 + 1 / K / K; // + (1/K²)·11ᵀ pins the mean
    for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) if (i !== j) Hm[i][j] += 1 / K / K;
    const step = solve(Hm, Array.from(g));
    let mx = 0;
    for (let i = 0; i < K; i++) {
      r[i] -= step[i];
      mx = Math.max(mx, Math.abs(step[i]));
    }
    if (mx < 1e-13) break;
  }
  return r;
}

/** Gaussian elimination with partial pivoting (small dense systems). */
export function solve(A: ArrayLike<number>[], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...Array.from(row), b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    [M[c], M[p]] = [M[p], M[c]];
    for (let i = c + 1; i < n; i++) {
      const f = M[i][c] / M[c][c];
      for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

export function rmse(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s / a.length);
}

/** Number of response pairs ordered the same way by both score vectors (out of K(K−1)/2). */
export function pairsInOrder(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let c = 0;
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if ((a[i] - a[j]) * (b[i] - b[j]) > 0) c++;
  return c;
}

/* ═══════════════════ 5. KL-regularised policy optimisation ═══════════════════ */

/** π*(y) ∝ π_ref(y)·exp(r(y)/β): the maximiser of E_π[r] − β·KL(π‖π_ref). */
export function klOptimum(piRef: ArrayLike<number>, r: ArrayLike<number>, beta: number): number[] {
  const z = Array.from(piRef, (p, i) => Math.log(p) + r[i] / beta);
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

export function expect(p: ArrayLike<number>, v: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += p[i] * v[i];
  return s;
}

/** KL(p ‖ q) in nats. */
export function kl(p: ArrayLike<number>, q: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) if (p[i] > 0) s += p[i] * Math.log(p[i] / q[i]);
  return s;
}

/** The RLHF objective J(π) = E_π[r] − β·KL(π‖π_ref). */
export const klObjective = (p: ArrayLike<number>, piRef: ArrayLike<number>, r: ArrayLike<number>, beta: number) => expect(p, r) - beta * kl(p, piRef);

export function softmaxArr(z: ArrayLike<number>): number[] {
  let m = -Infinity;
  for (let i = 0; i < z.length; i++) m = Math.max(m, z[i]);
  const e = Array.from(z, (v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

/**
 * Gradient ascent on J over softmax logits, starting from π_ref. dJ/dz_i = π_i (f_i − E_π f),
 * with f = r − β(log π − log π_ref − 1)… the "−1" cancels under the softmax, so f = r − β log(π/π_ref).
 */
export class KlAscent {
  z: Float64Array;
  step = 0;
  piRef: number[];
  r: number[];
  beta: number;
  lr: number;
  constructor(piRef: number[], r: number[], beta: number, lr = 0.5) {
    this.piRef = piRef;
    this.r = r;
    this.beta = beta;
    this.lr = lr;
    this.z = Float64Array.from(piRef, (p) => Math.log(p));
  }
  get pi() {
    return softmaxArr(this.z);
  }
  run(k: number) {
    for (let s = 0; s < k; s++) {
      const p = this.pi;
      const f = p.map((pi, i) => this.r[i] - this.beta * Math.log(pi / this.piRef[i]));
      const ef = expect(p, f);
      for (let i = 0; i < p.length; i++) this.z[i] += this.lr * p[i] * (f[i] - ef);
      this.step++;
    }
  }
}

/** The (KL, E[reward]) curve traced by π*(β) for β on a log grid, plus extra value columns. */
export function tradeoffCurve(piRef: number[], r: number[], extra: number[][] = [], bMin = 0.02, bMax = 50, n = 120) {
  const pts: { beta: number; kl: number; reward: number; extra: number[] }[] = [];
  for (let i = 0; i <= n; i++) {
    const beta = Math.exp(Math.log(bMax) + ((Math.log(bMin) - Math.log(bMax)) * i) / n);
    const p = klOptimum(piRef, r, beta);
    pts.push({ beta, kl: kl(p, piRef), reward: expect(p, r), extra: extra.map((v) => expect(p, v)) });
  }
  return pts;
}

/* ═══════════════════ 6. DPO ═══════════════════ */

/**
 * DPO loss for one pair: −log σ(β[(log π(y_w) − log π_ref(y_w)) − (log π(y_l) − log π_ref(y_l))]).
 * With a tabular policy π = softmax(z) the normaliser cancels inside the difference.
 */
export function dpoLoss(z: ArrayLike<number>, piRef: ArrayLike<number>, pairs: Pair[], beta: number): number {
  let s = 0;
  const lr = Array.from(piRef, Math.log);
  for (const p of pairs) s -= logSigmoid(beta * (z[p.w] - lr[p.w] - (z[p.l] - lr[p.l])));
  return s / pairs.length;
}

/** Train the policy logits on preference pairs with the DPO loss (Adam, full batch). */
export class DpoFit {
  z: Float64Array;
  step = 0;
  private m = new Float64Array(K);
  private v = new Float64Array(K);
  private logRef: number[];
  piRef: number[];
  pairs: Pair[];
  beta: number;
  lr: number;
  constructor(piRef: number[], pairs: Pair[], beta: number, lr = 0.05) {
    this.piRef = piRef;
    this.pairs = pairs;
    this.beta = beta;
    this.lr = lr;
    this.logRef = piRef.map(Math.log);
    this.z = Float64Array.from(this.logRef);
  }
  get pi() {
    return softmaxArr(this.z);
  }
  get loss() {
    return dpoLoss(this.z, this.piRef, this.pairs, this.beta);
  }
  grad(): Float64Array {
    const g = new Float64Array(K);
    const b = this.beta;
    for (const p of this.pairs) {
      const h = b * (this.z[p.w] - this.logRef[p.w] - (this.z[p.l] - this.logRef[p.l]));
      const e = b * (1 - sigmoid(h));
      g[p.w] -= e;
      g[p.l] += e;
    }
    for (let i = 0; i < K; i++) g[i] /= this.pairs.length;
    return g;
  }
  run(k: number) {
    for (let s = 0; s < k; s++) {
      const g = this.grad();
      this.step++;
      const c1 = 1 - Math.pow(0.9, this.step);
      const c2 = 1 - Math.pow(0.999, this.step);
      for (let i = 0; i < K; i++) {
        this.m[i] = 0.9 * this.m[i] + 0.1 * g[i];
        this.v[i] = 0.999 * this.v[i] + 0.001 * g[i] * g[i];
        this.z[i] -= (this.lr * (this.m[i] / c1)) / (Math.sqrt(this.v[i] / c2) + 1e-12);
      }
    }
  }
}

/** Figure-3 preference data: many pairs from raters who also like length. */
export const HACK_PAIRS = 3000;
export const HACK_SEED = 41;
