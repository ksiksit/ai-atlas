/**
 * 순환 신경망과 LSTM · 트랜스포머 깊이 보기: pure logic for the two sequence lessons.
 *
 * - a tiny RNN / LSTM with hand-written BPTT and Adam (one-hot inputs, softmax outputs)
 * - the toy tasks: next-character prediction on six words, and "remember the first symbol"
 * - Jacobian products through time for the vanishing/exploding-gradient plot
 * - sinusoidal positional encoding, RoPE, KV-cache and parameter/FLOP counting
 *
 * Everything is deterministic (seeded) so the numbers quoted in the lessons can be re-checked.
 */
import { gauss, rng } from '../../../../lib/math';

const sig = (z: number) => 1 / (1 + Math.exp(-z));

/* ═══════════════════ Recurrent models ═══════════════════ */

export type CellKind = 'rnn' | 'lstm';

/** Parameters of a one-layer recurrent net with one-hot inputs and a softmax read-out. */
export interface SeqNet {
  kind: CellKind;
  nIn: number; // input vocabulary
  H: number; // hidden size
  nOut: number; // output classes
  /** gate rows G·H (G = 1 for RNN, 4 for LSTM in the order i, f, g, o) */
  Wx: Float64Array; // [G·H × nIn]
  Wh: Float64Array; // [G·H × H]
  b: Float64Array; // [G·H]
  Wy: Float64Array; // [nOut × H]
  by: Float64Array; // [nOut]
}

const gates = (k: CellKind) => (k === 'lstm' ? 4 : 1);

export function paramCount(net: Pick<SeqNet, 'kind' | 'nIn' | 'H' | 'nOut'>): number {
  const G = gates(net.kind) * net.H;
  return G * net.nIn + G * net.H + G + net.nOut * net.H + net.nOut;
}

/** Gaussian init with std 1/√fan-in; an LSTM's forget-gate bias starts at `forgetBias`. */
export function initNet(kind: CellKind, nIn: number, H: number, nOut: number, seed: number, forgetBias = 1): SeqNet {
  const r = rng(seed);
  const G = gates(kind) * H;
  const fill = (n: number, s: number) => Float64Array.from({ length: n }, () => gauss(r) * s);
  const net: SeqNet = {
    kind,
    nIn,
    H,
    nOut,
    Wx: fill(G * nIn, 1),
    Wh: fill(G * H, 1 / Math.sqrt(H)),
    b: new Float64Array(G),
    Wy: fill(nOut * H, 1 / Math.sqrt(H)),
    by: new Float64Array(nOut),
  };
  if (kind === 'lstm') for (let j = 0; j < H; j++) net.b[H + j] = forgetBias;
  return net;
}

/** Everything the forward pass leaves behind for one sequence. */
export interface Trace {
  h: Float64Array[]; // h[t] after reading x[t]; h[-1] = 0 is implicit
  c: Float64Array[]; // LSTM cell state (empty for RNN)
  /** LSTM gate activations per step, rows i, f, g, o (empty for RNN) */
  gate: Float64Array[];
  p: (Float64Array | null)[]; // softmax output where one was asked for
}

/**
 * Run the net over input indices `xs`. `readAt(t)` says whether to compute the output at step t.
 * `resetMemory` replaces h[t-1] (and c[t-1]) by zeros at every step: a net that cannot see its past.
 */
export function forward(net: SeqNet, xs: number[], readAt: (t: number) => boolean = () => true, resetMemory = false): Trace {
  const { H, nIn, nOut, kind } = net;
  const G = gates(kind) * H;
  const tr: Trace = { h: [], c: [], gate: [], p: [] };
  let hPrev = new Float64Array(H);
  let cPrev = new Float64Array(H);
  for (let t = 0; t < xs.length; t++) {
    if (resetMemory) {
      hPrev = new Float64Array(H);
      cPrev = new Float64Array(H);
    }
    const z = new Float64Array(G);
    for (let r = 0; r < G; r++) {
      let s = net.b[r] + net.Wx[r * nIn + xs[t]];
      const row = r * H;
      for (let k = 0; k < H; k++) s += net.Wh[row + k] * hPrev[k];
      z[r] = s;
    }
    const h = new Float64Array(H);
    if (kind === 'rnn') {
      for (let j = 0; j < H; j++) h[j] = Math.tanh(z[j]);
    } else {
      const a = new Float64Array(G);
      const c = new Float64Array(H);
      for (let j = 0; j < H; j++) {
        const i = (a[j] = sig(z[j]));
        const f = (a[H + j] = sig(z[H + j]));
        const g = (a[2 * H + j] = Math.tanh(z[2 * H + j]));
        const o = (a[3 * H + j] = sig(z[3 * H + j]));
        c[j] = f * cPrev[j] + i * g;
        h[j] = o * Math.tanh(c[j]);
      }
      tr.c.push(c);
      tr.gate.push(a);
      cPrev = c;
    }
    tr.h.push(h);
    hPrev = h;
    if (readAt(t)) {
      const y = new Float64Array(nOut);
      let m = -Infinity;
      for (let o = 0; o < nOut; o++) {
        let s = net.by[o];
        for (let k = 0; k < H; k++) s += net.Wy[o * H + k] * h[k];
        y[o] = s;
        if (s > m) m = s;
      }
      let sum = 0;
      for (let o = 0; o < nOut; o++) sum += y[o] = Math.exp(y[o] - m);
      for (let o = 0; o < nOut; o++) y[o] /= sum;
      tr.p.push(y);
    } else tr.p.push(null);
  }
  return tr;
}

export interface Grads {
  Wx: Float64Array;
  Wh: Float64Array;
  b: Float64Array;
  Wy: Float64Array;
  by: Float64Array;
}

export const zeroGrads = (net: SeqNet): Grads => ({
  Wx: new Float64Array(net.Wx.length),
  Wh: new Float64Array(net.Wh.length),
  b: new Float64Array(net.b.length),
  Wy: new Float64Array(net.Wy.length),
  by: new Float64Array(net.by.length),
});

/**
 * Cross-entropy summed over the steps that have a target (targets[t] ≥ 0), and its gradient
 * accumulated into `g` by backpropagation through time. Returns the loss.
 */
export function lossAndGrad(net: SeqNet, xs: number[], targets: number[], g: Grads): number {
  const { H, nIn, nOut, kind } = net;
  const G = gates(kind) * H;
  const tr = forward(net, xs, (t) => targets[t] >= 0);
  let loss = 0;
  const T = xs.length;
  let dhNext = new Float64Array(H); // gradient arriving at h[t] from step t+1
  let dcNext = new Float64Array(H); // LSTM: gradient arriving at c[t] from step t+1
  const zero = new Float64Array(H);
  for (let t = T - 1; t >= 0; t--) {
    const h = tr.h[t];
    const hPrev = t > 0 ? tr.h[t - 1] : zero;
    const dh = dhNext.slice();
    const p = tr.p[t];
    if (p) {
      const y = targets[t];
      loss -= Math.log(Math.max(1e-12, p[y]));
      for (let o = 0; o < nOut; o++) {
        const dy = p[o] - (o === y ? 1 : 0);
        g.by[o] += dy;
        for (let k = 0; k < H; k++) {
          g.Wy[o * H + k] += dy * h[k];
          dh[k] += dy * net.Wy[o * H + k];
        }
      }
    }
    const dz = new Float64Array(G);
    if (kind === 'rnn') {
      for (let j = 0; j < H; j++) dz[j] = dh[j] * (1 - h[j] * h[j]);
    } else {
      const a = tr.gate[t];
      const c = tr.c[t];
      const cPrev = t > 0 ? tr.c[t - 1] : zero;
      const dcPrev = new Float64Array(H);
      for (let j = 0; j < H; j++) {
        const i = a[j];
        const f = a[H + j];
        const gg = a[2 * H + j];
        const o = a[3 * H + j];
        const tc = Math.tanh(c[j]);
        const dc = dcNext[j] + dh[j] * o * (1 - tc * tc);
        dz[j] = dc * gg * i * (1 - i);
        dz[H + j] = dc * cPrev[j] * f * (1 - f);
        dz[2 * H + j] = dc * i * (1 - gg * gg);
        dz[3 * H + j] = dh[j] * tc * o * (1 - o);
        dcPrev[j] = dc * f;
      }
      dcNext = dcPrev;
    }
    const dhPrev = new Float64Array(H);
    for (let r = 0; r < G; r++) {
      const d = dz[r];
      if (d === 0) continue;
      g.b[r] += d;
      g.Wx[r * nIn + xs[t]] += d;
      const row = r * H;
      for (let k = 0; k < H; k++) {
        g.Wh[row + k] += d * hPrev[k];
        dhPrev[k] += d * net.Wh[row + k];
      }
    }
    dhNext = dhPrev;
  }
  return loss;
}

const KEYS = ['Wx', 'Wh', 'b', 'Wy', 'by'] as const;

/** Adam with global-norm gradient clipping. */
export class Adam {
  m: Grads;
  v: Grads;
  t = 0;
  lr: number;
  clip: number;
  b1 = 0.9;
  b2 = 0.999;
  constructor(net: SeqNet, lr = 0.01, clip = 5) {
    this.lr = lr;
    this.clip = clip;
    this.m = zeroGrads(net);
    this.v = zeroGrads(net);
  }
  step(net: SeqNet, g: Grads, scale = 1) {
    let sq = 0;
    for (const k of KEYS) for (const x of g[k]) sq += x * x * scale * scale;
    const norm = Math.sqrt(sq);
    const s = scale * (norm > this.clip ? this.clip / norm : 1);
    this.t++;
    const c1 = 1 - Math.pow(this.b1, this.t);
    const c2 = 1 - Math.pow(this.b2, this.t);
    for (const k of KEYS) {
      const w = net[k];
      const gk = g[k];
      const m = this.m[k];
      const v = this.v[k];
      for (let i = 0; i < w.length; i++) {
        const gi = gk[i] * s;
        m[i] = this.b1 * m[i] + (1 - this.b1) * gi;
        v[i] = this.b2 * v[i] + (1 - this.b2) * gi * gi;
        w[i] -= (this.lr * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + 1e-8);
      }
    }
    return norm;
  }
}

/* ═══════════════════ Figure 1 (RNN): next character on six words ═══════════════════ */

export const WORDS = ['hello', 'help', 'held', 'jelly', 'yellow', 'yelp'];
export const END = '$';
/** Characters the toy model knows; END marks "the word ends here". */
export const CHARS = ['h', 'e', 'l', 'o', 'p', 'd', 'j', 'y', 'w', END];
export const charIndex = (ch: string) => CHARS.indexOf(ch);
export const CHAR_H = 12;

/** Inputs are the word's characters, targets the next character (END after the last one). */
export function wordPairs(word: string): { xs: number[]; ys: number[] } {
  const cs = word.split('');
  return { xs: cs.map(charIndex), ys: cs.map((_, t) => charIndex(t + 1 < cs.length ? cs[t + 1] : END)) };
}

/** Full-batch training of the toy character RNN (this is what produced CHAR_RNN_WEIGHTS). */
export function trainCharRnn(iters = 3000, seed = 3): { net: SeqNet; loss: number } {
  const V = CHARS.length;
  const net = initNet('rnn', V, CHAR_H, V, seed);
  const opt = new Adam(net, 0.02, 5);
  let loss = 0;
  for (let it = 0; it < iters; it++) {
    const g = zeroGrads(net);
    loss = 0;
    let n = 0;
    for (const w of WORDS) {
      const { xs, ys } = wordPairs(w);
      loss += lossAndGrad(net, xs, ys, g);
      n += xs.length;
    }
    opt.step(net, g, 1 / n);
    loss /= n;
  }
  return { net, loss };
}

/** Pack a net's weights (rounded to 4 decimals) for embedding in the page. */
export function packNet(net: SeqNet): number[] {
  const out: number[] = [];
  for (const k of KEYS) for (const x of net[k]) out.push(Math.round(x * 1e4) / 1e4);
  return out;
}
export function unpackNet(kind: CellKind, nIn: number, H: number, nOut: number, w: number[]): SeqNet {
  const net = initNet(kind, nIn, H, nOut, 1);
  let o = 0;
  for (const k of KEYS) {
    const a = net[k];
    for (let i = 0; i < a.length; i++) a[i] = w[o++];
  }
  return net;
}

/** Generated by trainCharRnn(3000, 3) and packNet (see the lesson's verification script). */
// prettier-ignore
export const CHAR_RNN_WEIGHTS: number[] = [1.4981,0.5297,-1.0036,-0.1051,-1.808,0.4321,0.4597,1.3399,-1.2894,-0.7428,0.3547,1.6741,1.1261,-0.3211,-1.5632,-1.9207,0.8812,-2.2123,-1.2702,0.1979,-1.0102,-2.0269,0.1868,-1.4448,-0.5276,0.7661,-1.3858,-0.8136,1.7849,-0.1173,1.3582,1.1153,-2.4237,0.3032,-0.8798,-1.5317,0.4802,1.1066,-1.0546,0.0948,-2.8458,-0.3022,-0.0806,-0.4645,-0.0839,-0.0102,-1.3782,-0.5022,-0.6036,-1.346,0.7105,-0.7048,-0.2024,1.2648,-1.7284,-0.9779,0.7752,2.6052,-2.1068,0.4509,0.4813,1.3341,-1.1465,-1.3731,-1.1164,-0.5067,0.9917,0.0752,-3.1644,-0.7614,-1.2951,-0.0026,-1.7313,0.8237,2.2191,2.3016,1.327,1.959,0.4442,1.3978,0.8932,-3.2626,-2.256,0.7575,1.36,1.1774,0.9316,0.5086,2.1049,-1.4016,-1.8678,0.3458,-0.0803,2.7054,0.0627,-0.4174,-0.4844,-0.3043,0.0749,-1.4516,-1.1432,2.0031,0.6203,1.4429,1.4561,0.5256,-0.1868,-1.334,0.2863,-0.5978,1.0861,-0.5655,-0.2534,-0.9293,0.8749,0.1507,2.5462,0.3464,1.2616,-0.3272,-0.9171,-0.7196,0.2558,1.0031,0.538,-0.6445,0.4346,1.7103,0.0554,-0.2504,0.4682,-0.4244,0.5877,-0.3646,-0.2033,-0.5996,-0.0263,0.2532,0.4059,-0.5971,0.6622,-0.2795,-0.3723,-0.0548,-0.4847,-0.9968,0.1405,-1.0336,1.0748,-0.6702,-0.8177,-0.8463,-0.2711,0.4691,-0.1201,0.2683,0.4491,0.0778,-0.1498,-0.0206,-1.2231,-0.227,1.0606,0.5501,0.6258,-0.7985,-0.8065,0.5522,0.1052,0.3624,-0.5723,0.4844,-0.1814,1.0841,1.3018,0.2722,-0.2687,-1.5275,0.1605,0.5064,-1.062,0.4591,0.9058,-0.6118,-0.1654,-0.2752,1.2148,-0.8068,0.6143,-0.0054,-0.2141,1.0321,1.1495,0.3639,-0.5631,0.6095,-0.7534,-0.6038,0.5489,-0.0201,0.6302,1.5396,0.1387,-1.1195,0.411,-0.7635,0.5113,0.3222,-0.1433,0.2551,-1.178,-0.1736,0.0726,1.0825,-1.1452,-0.3043,-0.6247,0.0595,0.0473,-0.2321,-0.3275,0.0117,-0.5691,-0.5537,0.1911,0.7153,0.0854,-0.0177,0.4704,0.0667,0.0977,-1.0725,0.0763,-1.5102,-0.2146,1,0.0365,-0.8696,1.0851,0.7321,0.8012,1.0673,-1.0594,1.0155,0.6556,0.8344,-1.4911,-0.1721,-0.7312,1.1497,-0.1526,0.1316,0.0086,-0.7834,0.2409,-0.1832,0.6204,0.2381,-0.9975,-0.8255,-0.0981,1.156,-0.1387,-0.2156,0.2786,-0.5718,-0.6136,0.6443,0.0739,0.6838,0.5878,0.6339,0.6959,-0.7031,-0.1221,0.6395,-0.2724,0.4143,0.835,0.331,-0.2777,-0.1403,0.1087,0.3901,-0.0911,0.0752,-1.2306,-0.5106,1.6313,-0.6484,-0.9614,1.1499,-1.0786,1.4664,1.5929,0.6985,0.9634,-1.1813,-1.3678,1.6233,0.3722,1.6212,-1.8354,0.2979,1.9565,-0.9127,1.3507,-0.8171,-0.9323,-1.7949,1.1087,-1.076,-1.0483,2.7045,1.215,-0.1121,-1.9829,-0.8697,-0.6481,-1.5053,-2.575,0.4525,0.3923,2.0081,2.0093,-0.6493,-0.3297,-1.5238,0.8557,-0.3903,-1.0289,-0.8804,-0.5211,0.8824,0.4097,-1.3206,0.8068,-0.5794,-0.1898,-0.3146,0.649,0.2793,-3.1763,-0.7226,-0.5083,-2.2545,-0.0371,-0.4912,0.3135,0.6006,0.9355,0.4214,-0.2554,-0.3099,-0.3255,0.306,0.2894,0.0644,-0.8954,-0.291,-0.9758,1.9824,1.4729,-1.1774,2.0178,2.3853,-1.4153,-0.6933,-1.3511,1.4686,-2.2011,-0.0759,-1.9206,-0.4841,-1.6059,0.8211,-0.0485,0.9073,-1.4192,-0.7386,1.3664,1.3768,-2.1177,-1.487,-1.012,-1.9918,1.0267,-1.4562,-1.3953,-0.3328,-1.1426,1.4498,1.1924,0.0695,0.9052,1.347,-0.7153,0.7441,0.7195,-0.5527,-0.4032,-0.6941,-0.7536,-0.788,-0.7108,0.5307];

let charNet: SeqNet | null = null;
export function charRnn(): SeqNet {
  if (!charNet) charNet = CHAR_RNN_WEIGHTS.length ? unpackNet('rnn', CHARS.length, CHAR_H, CHARS.length, CHAR_RNN_WEIGHTS) : trainCharRnn().net;
  return charNet;
}

/** P(next | current char) counted from WORDS: what a model that only sees the last character can know. */
export function bigram(): number[][] {
  const V = CHARS.length;
  const cnt = Array.from({ length: V }, () => new Array(V).fill(0));
  for (const w of WORDS) {
    const { xs, ys } = wordPairs(w);
    xs.forEach((x, t) => cnt[x][ys[t]]++);
  }
  return cnt.map((row) => {
    const s = row.reduce((a, b) => a + b, 0);
    return row.map((v) => (s ? v / s : 0));
  });
}

/** True next-character distribution given the whole prefix (from WORDS, all equally likely). */
export function truePrefixDist(prefix: string): number[] {
  const V = CHARS.length;
  const out = new Array(V).fill(0);
  let n = 0;
  for (const w of WORDS) {
    if (!w.startsWith(prefix)) continue;
    out[charIndex(prefix.length < w.length ? w[prefix.length] : END)]++;
    n++;
  }
  return n ? out.map((v) => v / n) : out;
}

/* ═══════════════════ Figure 2 (RNN): gradients through time ═══════════════════ */

/** Random n×n orthogonal matrix (Gram–Schmidt on Gaussian rows), row-major. */
export function orthogonal(n: number, seed: number): Float64Array {
  const r = rng(seed);
  const Q = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const v = Array.from({ length: n }, () => gauss(r));
    for (let j = 0; j < i; j++) {
      let d = 0;
      for (let k = 0; k < n; k++) d += v[k] * Q[j * n + k];
      for (let k = 0; k < n; k++) v[k] -= d * Q[j * n + k];
    }
    const len = Math.hypot(...v);
    for (let k = 0; k < n; k++) Q[i * n + k] = v[k] / len;
  }
  return Q;
}

/**
 * Spectral norm (largest singular value) of an n×n row-major matrix by power iteration on MᵀM.
 * `start` (updated in place) warm-starts the iteration when a sequence of related matrices is measured.
 */
export function spectralNorm(M: Float64Array, n: number, iters = 40, start?: Float64Array): number {
  const v = start ?? new Float64Array(n).fill(1 / Math.sqrt(n));
  const u = new Float64Array(n);
  let s = 0;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      let a = 0;
      for (let k = 0; k < n; k++) a += M[i * n + k] * v[k];
      u[i] = a;
    }
    let len = 0;
    for (let k = 0; k < n; k++) {
      let a = 0;
      for (let i = 0; i < n; i++) a += M[i * n + k] * u[i];
      v[k] = a;
      len += a * a;
    }
    len = Math.sqrt(len);
    if (len === 0) {
      v.fill(1 / Math.sqrt(n));
      return 0;
    }
    s = Math.sqrt(len);
    for (let k = 0; k < n; k++) v[k] /= len;
  }
  return s;
}

/** C = A·B for n×n row-major matrices. */
function matmul(A: Float64Array, B: Float64Array, n: number): Float64Array {
  const C = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      const a = A[i * n + k];
      if (a === 0) continue;
      for (let j = 0; j < n; j++) C[i * n + j] += a * B[k * n + j];
    }
  return C;
}

export const GT_N = 16; // hidden size in figure 2
export const GT_D = 60; // longest distance T − t
export const GT_SEQS = 4; // input sequences averaged (in log space) for the tanh and LSTM curves
const GT_WARM = 20; // steps run first so the state is typical before measuring

/** Gaussian input vectors x_t (std `scale`) for figure 2, one list per sequence. */
function gtInputs(seed: number, scale: number): Float64Array[][] {
  const r = rng(seed);
  return Array.from({ length: GT_SEQS }, () => Array.from({ length: GT_D + GT_WARM }, () => Float64Array.from({ length: GT_N }, () => gauss(r) * scale)));
}

export interface RnnGradCurves {
  linear: number[]; // ‖∂h_T/∂h_{T−d}‖ for a linear RNN, d = 0..D
  tanh: number[]; // the same for a tanh RNN, geometric mean over GT_SEQS input sequences
  sat: number; // average tanh slope 1 − h² seen along the way
}

/**
 * Norm (largest singular value) of the backward Jacobian product as the distance grows.
 * Recurrent weights are ρ·Q with Q orthogonal, so every eigenvalue has |λ| = ρ and ‖W^d‖ = ρ^d.
 */
export function rnnGradCurves(rho: number, inputScale = 1, D = GT_D, n = GT_N, seed = 11): RnnGradCurves {
  const W = orthogonal(n, seed).map((x) => x * rho);
  const r = rng(seed + 1);
  const U = Float64Array.from({ length: n * n }, () => gauss(r) / Math.sqrt(n));
  const T = D + GT_WARM;

  // linear: J = W at every step
  const linear: number[] = [1];
  let P: Float64Array = W.slice();
  const v0 = new Float64Array(n).fill(1 / Math.sqrt(n));
  for (let d = 1; d <= D; d++) {
    linear.push(spectralNorm(P, n, d === 1 ? 40 : 6, v0));
    P = matmul(P, W, n);
  }

  // tanh: J_t = diag(1 − h_t²)·W, multiplied from the newest step backwards
  const logT = new Array(D + 1).fill(0);
  let satSum = 0;
  for (const x of gtInputs(seed + 2, inputScale)) {
    const hs: Float64Array[] = [];
    let h = new Float64Array(n);
    for (let t = 0; t < T; t++) {
      const nh = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let a = 0;
        for (let k = 0; k < n; k++) a += W[i * n + k] * h[k] + U[i * n + k] * x[t][k];
        nh[i] = Math.tanh(a);
      }
      hs.push(nh);
      h = nh;
    }
    let M: Float64Array = new Float64Array(n * n);
    for (let i = 0; i < n; i++) M[i * n + i] = 1;
    const v = new Float64Array(n).fill(1 / Math.sqrt(n));
    for (let d = 1; d <= D; d++) {
      const ht = hs[T - d];
      const J = new Float64Array(n * n);
      for (let i = 0; i < n; i++) {
        const sl = 1 - ht[i] * ht[i];
        satSum += sl;
        for (let k = 0; k < n; k++) J[i * n + k] = sl * W[i * n + k];
      }
      M = matmul(M, J, n);
      logT[d] += Math.log(Math.max(1e-300, spectralNorm(M, n, d === 1 ? 40 : 6, v))) / GT_SEQS;
    }
  }
  const tanh = logT.map((l, d) => (d === 0 ? 1 : Math.exp(l)));
  return { linear, tanh, sat: satSum / (GT_SEQS * D * n) };
}

export interface LstmGradCurve {
  cell: number[]; // ‖∂c_T/∂c_{T−d}‖ along the cell-state path = max over units of Π f
  meanF: number; // average forget-gate value seen
}

/**
 * An LSTM with random weights: z = W·h + U·x + b for the gates (i, f, g, o), with b_f = forgetBias.
 * Along the cell-state path ∂c_T/∂c_t = diag(f_T ⊙ … ⊙ f_{t+1}).
 */
export function lstmGradCurve(forgetBias: number, inputScale = 1, D = GT_D, n = GT_N, seed = 11): LstmGradCurve {
  const r = rng(seed + 3);
  const Wg = Float64Array.from({ length: 4 * n * n }, () => gauss(r) / Math.sqrt(n));
  const Ug = Float64Array.from({ length: 4 * n * n }, () => gauss(r) / Math.sqrt(n));
  const T = D + GT_WARM;
  const logL = new Array(D + 1).fill(0);
  let fSum = 0;
  for (const x of gtInputs(seed + 2, inputScale)) {
    const fs: Float64Array[] = [];
    let h = new Float64Array(n);
    const c = new Float64Array(n);
    for (let t = 0; t < T; t++) {
      const z = new Float64Array(4 * n);
      for (let row = 0; row < 4 * n; row++) {
        let a = row >= n && row < 2 * n ? forgetBias : 0;
        for (let k = 0; k < n; k++) a += Wg[row * n + k] * h[k] + Ug[row * n + k] * x[t][k];
        z[row] = a;
      }
      const f = new Float64Array(n);
      const nh = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        f[i] = sig(z[n + i]);
        c[i] = f[i] * c[i] + sig(z[i]) * Math.tanh(z[2 * n + i]);
        nh[i] = sig(z[3 * n + i]) * Math.tanh(c[i]);
        fSum += f[i];
      }
      fs.push(f);
      h = nh;
    }
    const prod = new Float64Array(n).fill(1);
    for (let d = 1; d <= D; d++) {
      const f = fs[T - d];
      let mx = 0;
      for (let i = 0; i < n; i++) {
        prod[i] *= f[i];
        if (prod[i] > mx) mx = prod[i];
      }
      logL[d] += Math.log(Math.max(1e-300, mx)) / GT_SEQS;
    }
  }
  return { cell: logL.map((l, d) => (d === 0 ? 1 : Math.exp(l))), meanF: fSum / (GT_SEQS * T * n) };
}

/* ═══════════════════ Figure 3 (RNN): remember the first symbol ═══════════════════ */

export const MEM_SIGNALS = ['A', 'B', 'C', 'D'];
export const MEM_NOISE = ['w', 'x', 'y', 'z'];
export const MEM_QUERY = '?';
export const MEM_IN = MEM_SIGNALS.length + MEM_NOISE.length + 1;
export const MEM_KS = [1, 2, 4, 8, 16, 32, 64];
export const MEM_H = 16;
export const MEM_ITERS = 1500;
export const MEM_BATCH = 16;
export const MEM_SEEDS = [1, 2, 3];
/** LSTM forget-gate bias at initialisation (f ≈ σ(b_f) before training) */
export const MEM_FORGET_BIAS = 3;

/** One task instance: a signal, k noise symbols, the query mark. Answer = the signal. */
export function memorySample(k: number, r: () => number): { xs: number[]; y: number } {
  const y = Math.floor(r() * MEM_SIGNALS.length);
  const xs = [y];
  for (let i = 0; i < k; i++) xs.push(MEM_SIGNALS.length + Math.floor(r() * MEM_NOISE.length));
  xs.push(MEM_IN - 1);
  return { xs, y };
}
export const memoryText = (xs: number[]) => xs.map((x) => (x < 4 ? MEM_SIGNALS[x] : x < 8 ? MEM_NOISE[x - 4] : MEM_QUERY)).join(' ');

/** Train one model on delay k with a fixed budget; return accuracy on fresh test sequences. */
export function trainMemory(kind: CellKind, k: number, seed: number, iters = MEM_ITERS, testN = 400, forgetBias = MEM_FORGET_BIAS): { acc: number; loss: number } {
  const net = initNet(kind, MEM_IN, MEM_H, MEM_SIGNALS.length, seed * 101 + (kind === 'lstm' ? 7 : 0), forgetBias);
  const opt = new Adam(net, 0.01, 5);
  const r = rng(seed * 7919 + k);
  let loss = 0;
  for (let it = 0; it < iters; it++) {
    const g = zeroGrads(net);
    loss = 0;
    for (let b = 0; b < MEM_BATCH; b++) {
      const { xs, y } = memorySample(k, r);
      const ys = xs.map((_, t) => (t === xs.length - 1 ? y : -1));
      loss += lossAndGrad(net, xs, ys, g);
    }
    opt.step(net, g, 1 / MEM_BATCH);
    loss /= MEM_BATCH;
  }
  const rt = rng(424242 + k);
  let ok = 0;
  for (let i = 0; i < testN; i++) {
    const { xs, y } = memorySample(k, rt);
    const p = forward(net, xs, (t) => t === xs.length - 1).p[xs.length - 1]!;
    let best = 0;
    for (let o = 1; o < p.length; o++) if (p[o] > p[best]) best = o;
    if (best === y) ok++;
  }
  return { acc: ok / testN, loss };
}

/**
 * Test accuracy (%) per delay k in MEM_KS, one entry per seed in MEM_SEEDS.
 * Pretrained: produced by trainMemory in the verification script, not in the browser.
 */
// prettier-ignore
export const MEMORY_RESULTS: Record<CellKind, number[][]> = {
  rnn: [[100,100,100],[100,100,100],[100,100,100],[100,100,100],[49.8,26.3,100],[22.5,26.5,21],[24.8,23.5,26]],
  lstm: [[100,100,100],[100,100,100],[100,100,100],[100,100,100],[100,100,100],[100,100,100],[46.8,25,49.8]],
};

/* ═══════════════════ Transformer: positional encodings ═══════════════════ */

/** Sinusoidal positional encoding of «Attention Is All You Need»: (sin, cos) pairs with falling frequency. */
export function sinusoidalPE(pos: number, d: number, base = 10000): Float64Array {
  const pe = new Float64Array(d);
  for (let i = 0; i < d / 2; i++) {
    const w = Math.pow(base, (-2 * i) / d);
    pe[2 * i] = Math.sin(pos * w);
    pe[2 * i + 1] = Math.cos(pos * w);
  }
  return pe;
}

export const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** PE(p)·PE(p+Δ) in closed form: Σ cos(Δ·ω_i), which does not depend on p. */
export function peSimilarity(delta: number, d: number, base = 10000): number {
  let s = 0;
  for (let i = 0; i < d / 2; i++) s += Math.cos(delta * Math.pow(base, (-2 * i) / d));
  return s;
}

/** RoPE: rotate each pair (x_{2i}, x_{2i+1}) by the angle pos·θ_i, θ_i = base^(−2i/d). */
export function rope(x: ArrayLike<number>, pos: number, base = 10000): Float64Array {
  const d = x.length;
  const out = new Float64Array(d);
  for (let i = 0; i < d / 2; i++) {
    const a = pos * Math.pow(base, (-2 * i) / d);
    const c = Math.cos(a);
    const s = Math.sin(a);
    out[2 * i] = x[2 * i] * c - x[2 * i + 1] * s;
    out[2 * i + 1] = x[2 * i] * s + x[2 * i + 1] * c;
  }
  return out;
}

/** Score of query q at position m against key k at position n, with RoPE. */
export const ropeScore = (q: ArrayLike<number>, k: ArrayLike<number>, m: number, n: number, base = 10000) => dot(rope(q, m, base), rope(k, n, base));

/** Same score when the sinusoidal code is instead added to the vectors. */
export function additiveScore(q: ArrayLike<number>, k: ArrayLike<number>, m: number, n: number, base = 10000): number {
  const d = q.length;
  const pm = sinusoidalPE(m, d, base);
  const pn = sinusoidalPE(n, d, base);
  let s = 0;
  for (let i = 0; i < d; i++) s += (q[i] + pm[i]) * (k[i] + pn[i]);
  return s;
}

/* ═══════════════════ Transformer: causal attention and the KV cache ═══════════════════ */

/** Causal attention weights for t tokens given per-token q and k rows; row i only sees 0..i. */
export function causalWeights(q: Float64Array[], k: Float64Array[]): number[][] {
  const d = q[0]?.length ?? 1;
  return q.map((qi, i) => {
    const s = k.slice(0, i + 1).map((kj) => dot(qi, kj) / Math.sqrt(d));
    const m = Math.max(...s);
    const e = s.map((v) => Math.exp(v - m));
    const z = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / z);
  });
}

/**
 * Multiply-adds of one transformer layer (d_ff = 4d) while generating n tokens one by one.
 * Per position: Q,K,V,O projections 4d² and MLP 8d² → 12d²; attention over a context of t: 2·t·d.
 * Without a cache every step recomputes the whole prefix; with one, only the new token.
 */
export function decodeMacs(n: number, d: number, cache: boolean): number {
  if (cache) return 12 * d * d * n + d * n * (n + 1);
  // Σ_{t=1..n} [12d²·t + Σ_{i=1..t} 2·i·d] = 6d²·n(n+1) + d·n(n+1)(n+2)/3
  return 6 * d * d * n * (n + 1) + (d * n * (n + 1) * (n + 2)) / 3;
}
/** Same, for step t alone (context length t). */
export function stepMacs(t: number, d: number, cache: boolean): number {
  return cache ? 12 * d * d + 2 * t * d : 12 * d * d * t + d * t * (t + 1);
}

/** KV cache size in bytes: K and V, for every layer, KV head, head dimension and token. */
export const kvCacheBytes = (layers: number, kvHeads: number, headDim: number, tokens: number, bytes: number, batch = 1) => 2 * layers * kvHeads * headDim * tokens * bytes * batch;

/* ═══════════════════ Transformer: parameters and FLOPs ═══════════════════ */

export interface TfConfig {
  d: number; // d_model
  layers: number;
  heads: number;
  dff: number;
  vocab: number;
  ctx: number;
  /** learned position embeddings (GPT-2 style); false for RoPE/sinusoidal */
  learnedPos: boolean;
  /** output matrix shared with the token embedding */
  tied: boolean;
}

export interface ParamBreakdown {
  tokenEmb: number;
  posEmb: number;
  attn: number; // all layers: Q,K,V,O weights 4d² + biases 4d
  mlp: number; // all layers: 2·d·d_ff + biases d_ff + d
  norm: number; // two LayerNorms per layer (2d each) + final LayerNorm
  head: number; // separate output matrix if not tied
  total: number;
  nonEmb: number; // attn + mlp + norm
}

/** GPT-2-style decoder: biases everywhere, pre-norm with a final LayerNorm. */
export function countParams(c: TfConfig): ParamBreakdown {
  const { d, layers: L, dff, vocab: V, ctx } = c;
  const tokenEmb = V * d;
  const posEmb = c.learnedPos ? ctx * d : 0;
  const attn = L * (4 * d * d + 4 * d);
  const mlp = L * (2 * d * dff + dff + d);
  const norm = L * 4 * d + 2 * d;
  const head = c.tied ? 0 : V * d;
  const nonEmb = attn + mlp + norm;
  return { tokenEmb, posEmb, attn, mlp, norm, head, nonEmb, total: tokenEmb + posEmb + nonEmb + head };
}

export interface FlopBreakdown {
  matmul: number; // 2 × (weights a token is multiplied by, without embeddings)
  logits: number; // 2·V·d for the output layer
  attention: number; // QKᵀ and A·V against a full context: 4·L·ctx·d
  total: number;
}

/** Forward FLOPs for one token at a full context (1 multiply-add = 2 FLOPs). */
export function flopsPerToken(c: TfConfig): FlopBreakdown {
  const matmul = 2 * (c.layers * (4 * c.d * c.d + 2 * c.d * c.dff));
  const logits = 2 * c.vocab * c.d;
  const attention = 4 * c.layers * c.ctx * c.d;
  return { matmul, logits, attention, total: matmul + logits + attention };
}

/* ═══════════════════ Formatting ═══════════════════ */

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** 3.5×10⁻⁷ style; plain decimals between 0.01 and 1000. */
export function sci(v: number, digits = 2): string {
  if (!isFinite(v)) return '∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 0.01 && a < 1000) return v.toPrecision(digits).replace(/\.?0+$/, (m) => (m.includes('.') ? '' : m));
  const e = Math.floor(Math.log10(a));
  const m = v / Math.pow(10, e);
  return `${m.toFixed(digits - 1)}×10${String(e)
    .split('')
    .map((c) => SUP[c])
    .join('')}`;
}

/** Korean large-number units: 1.2억, 3,400만, 1.5조. */
export function korNum(v: number): string {
  const a = Math.abs(v);
  const f = (x: number) => (x >= 100 ? Math.round(x).toLocaleString('ko-KR') : x >= 10 ? x.toFixed(1).replace(/\.0$/, '') : x.toFixed(2).replace(/\.?0+$/, ''));
  if (a >= 1e16) return `${f(v / 1e16)}경`;
  if (a >= 1e12) return `${f(v / 1e12)}조`;
  if (a >= 1e8) return `${f(v / 1e8)}억`;
  if (a >= 1e4) return `${f(v / 1e4)}만`;
  return Math.round(v).toLocaleString('ko-KR');
}

/** Bytes in binary units. */
export function bytesStr(b: number): string {
  const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')} ${u[i]}`;
}
