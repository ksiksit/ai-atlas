/* 생성 모델 (오토인코더·VAE·확산 모델): pure logic shared by the two lessons. */
import { gauss, rng } from '../../../../lib/math';

/* ═══════════════════ A tiny dense network with Adam ═══════════════════ */

export type Act = 'linear' | 'tanh' | 'sigmoid';

/**
 * Fully-connected network, one sample at a time. `forward` caches activations,
 * `backward` accumulates parameter gradients and returns the gradient w.r.t. the input.
 */
export class Net {
  sizes: number[];
  acts: Act[];
  W: Float64Array[] = [];
  b: Float64Array[] = [];
  a: Float64Array[] = [];
  private gW: Float64Array[] = [];
  private gb: Float64Array[] = [];
  private mW: Float64Array[] = [];
  private vW: Float64Array[] = [];
  private mb: Float64Array[] = [];
  private vb: Float64Array[] = [];
  private d: Float64Array[] = [];
  private t = 0;

  constructor(sizes: number[], acts: Act[], r: () => number, gain = 1) {
    this.sizes = sizes;
    this.acts = acts;
    for (let l = 0; l < sizes.length - 1; l++) {
      const nin = sizes[l];
      const nout = sizes[l + 1];
      const W = new Float64Array(nin * nout);
      const std = gain * Math.sqrt(1 / nin);
      for (let i = 0; i < W.length; i++) W[i] = gauss(r) * std;
      this.W.push(W);
      this.b.push(new Float64Array(nout));
      this.gW.push(new Float64Array(W.length));
      this.gb.push(new Float64Array(nout));
      this.mW.push(new Float64Array(W.length));
      this.vW.push(new Float64Array(W.length));
      this.mb.push(new Float64Array(nout));
      this.vb.push(new Float64Array(nout));
    }
    for (const n of sizes) {
      this.a.push(new Float64Array(n));
      this.d.push(new Float64Array(n));
    }
  }

  get L() {
    return this.sizes.length - 1;
  }

  /** Forward pass; the returned array is the network's own buffer (copy it if you keep it). */
  forward(x: ArrayLike<number>): Float64Array {
    const a0 = this.a[0];
    for (let i = 0; i < a0.length; i++) a0[i] = x[i];
    for (let l = 0; l < this.L; l++) {
      const nin = this.sizes[l];
      const nout = this.sizes[l + 1];
      const W = this.W[l];
      const b = this.b[l];
      const ain = this.a[l];
      const aout = this.a[l + 1];
      const act = this.acts[l];
      for (let k = 0; k < nout; k++) {
        let s = b[k];
        const off = k * nin;
        for (let j = 0; j < nin; j++) s += W[off + j] * ain[j];
        aout[k] = act === 'tanh' ? Math.tanh(s) : act === 'sigmoid' ? 1 / (1 + Math.exp(-s)) : s;
      }
    }
    return this.a[this.L];
  }

  /**
   * Back-propagate `dOut` (gradient w.r.t. the output). With `pre`, `dOut` is already the gradient
   * w.r.t. the last layer's pre-activation (e.g. sigmoid + cross-entropy gives p − y).
   */
  backward(dOut: ArrayLike<number>, pre = false): Float64Array {
    const L = this.L;
    const dl = this.d[L];
    for (let k = 0; k < dl.length; k++) {
      const h = this.a[L][k];
      const act = this.acts[L - 1];
      dl[k] = pre ? dOut[k] : dOut[k] * (act === 'tanh' ? 1 - h * h : act === 'sigmoid' ? h * (1 - h) : 1);
    }
    for (let l = L - 1; l >= 0; l--) {
      const nin = this.sizes[l];
      const nout = this.sizes[l + 1];
      const W = this.W[l];
      const dout = this.d[l + 1];
      const ain = this.a[l];
      const gW = this.gW[l];
      const gb = this.gb[l];
      const din = this.d[l];
      din.fill(0);
      for (let k = 0; k < nout; k++) {
        const dk = dout[k];
        if (dk === 0) continue;
        gb[k] += dk;
        const off = k * nin;
        for (let j = 0; j < nin; j++) {
          gW[off + j] += dk * ain[j];
          din[j] += W[off + j] * dk;
        }
      }
      if (l > 0) {
        const act = this.acts[l - 1];
        if (act !== 'linear') for (let j = 0; j < nin; j++) din[j] *= act === 'tanh' ? 1 - ain[j] * ain[j] : ain[j] * (1 - ain[j]);
      }
    }
    return this.d[0];
  }

  /** Adam update with gradients averaged over `batch` samples; clears the accumulators. */
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
    for (let l = 0; l < this.L; l++) {
      upd(this.W[l], this.gW[l], this.mW[l], this.vW[l]);
      upd(this.b[l], this.gb[l], this.mb[l], this.vb[l]);
    }
  }
}

function shuffle(n: number, r: () => number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/* ═══════════════════ Figure 1 (AE): 2D → 1D → 2D ═══════════════════ */

export type Cloud = 'ellipse' | 'arc';
export type P2 = [number, number];

/** 2D points: a tilted elongated Gaussian cloud, or points along a curved arc. */
export function makeCloud(kind: Cloud, n = 120, seed = 3): P2[] {
  const r = rng(seed);
  const pts: P2[] = [];
  for (let i = 0; i < n; i++) {
    if (kind === 'ellipse') {
      const u = gauss(r) * 0.62;
      const v = gauss(r) * 0.16;
      const c = Math.cos(0.5);
      const s = Math.sin(0.5);
      pts.push([0.1 + c * u - s * v, -0.05 + s * u + c * v]);
    } else {
      const th = Math.PI * (0.12 + 0.76 * r());
      const rad = 0.9 + gauss(r) * 0.05;
      pts.push([Math.cos(th) * rad * 1.1, Math.sin(th) * rad - 0.55]);
    }
  }
  return pts;
}

/** Principal components of 2D points: mean, unit direction of the first axis, and both eigenvalues (1/n covariance). */
export function pca2(pts: P2[]) {
  const n = pts.length;
  let mx = 0;
  let my = 0;
  for (const [x, y] of pts) {
    mx += x / n;
    my += y / n;
  }
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of pts) {
    sxx += ((x - mx) * (x - mx)) / n;
    sxy += ((x - mx) * (y - my)) / n;
    syy += ((y - my) * (y - my)) / n;
  }
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = tr / 2 - disc;
  let dx = sxy;
  let dy = l1 - sxx;
  if (Math.hypot(dx, dy) < 1e-12) [dx, dy] = sxx >= syy ? [1, 0] : [0, 1];
  const len = Math.hypot(dx, dy);
  return { mean: [mx, my] as P2, dir: [dx / len, dy / len] as P2, l1, l2 };
}

/** Angle in degrees between two lines through the origin (0..90). */
export function lineAngle(a: P2, b: P2): number {
  const c = Math.abs(a[0] * b[0] + a[1] * b[1]) / (Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]));
  return (Math.acos(Math.min(1, c)) * 180) / Math.PI;
}

/** An autoencoder with a one-number bottleneck for 2D points, trained on mean squared error. */
export class PointAE {
  enc: Net;
  dec: Net;
  linear: boolean;
  steps = 0;
  private r: () => number;

  constructor(linear: boolean, seed = 1) {
    this.linear = linear;
    this.r = rng(seed);
    if (linear) {
      this.enc = new Net([2, 1], ['linear'], this.r);
      this.dec = new Net([1, 2], ['linear'], this.r);
    } else {
      this.enc = new Net([2, 16, 1], ['tanh', 'linear'], this.r);
      this.dec = new Net([1, 16, 2], ['tanh', 'linear'], this.r);
    }
  }

  encode(p: P2): number {
    return this.enc.forward(p)[0];
  }
  decode(z: number): P2 {
    const o = this.dec.forward([z]);
    return [o[0], o[1]];
  }
  recon(p: P2): P2 {
    return this.decode(this.encode(p));
  }

  /** Mean over points of the squared reconstruction distance |x − x̂|². */
  mse(pts: P2[]): number {
    let s = 0;
    for (const p of pts) {
      const q = this.recon(p);
      s += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
    }
    return s / pts.length;
  }

  /** One pass over the data in shuffled mini-batches. */
  epoch(pts: P2[], lr = 0.02, batch = 20) {
    const idx = shuffle(pts.length, this.r);
    let cnt = 0;
    const g = [0, 0];
    for (let i = 0; i < idx.length; i++) {
      const p = pts[idx[i]];
      const z = this.enc.forward(p)[0];
      const o = this.dec.forward([z]);
      g[0] = 2 * (o[0] - p[0]);
      g[1] = 2 * (o[1] - p[1]);
      const dz = this.dec.backward(g);
      this.enc.backward([dz[0]]);
      if (++cnt === batch || i === idx.length - 1) {
        this.enc.step(lr, cnt);
        this.dec.step(lr, cnt);
        cnt = 0;
      }
    }
    this.steps++;
  }
}

/* ═══════════════════ Figures 2–3 (AE): small images and their latent space ═══════════════════ */

export const IMG = 12;
export type Shape = 0 | 1 | 2; // 원, 고리, 막대
export const SHAPE_NAMES = ['원', '고리', '막대'];

/** Render one IMG×IMG grayscale image (values 0..1, row-major) with 4×4 supersampling. */
export function renderShape(shape: Shape, u: number): Float64Array {
  const out = new Float64Array(IMG * IMG);
  const c = IMG / 2;
  const S = 4;
  // u in [0,1] is the one free parameter of each shape
  const rad = shape === 0 ? 1.4 + 3.4 * u : 2.4 + 3.0 * u;
  const ang = Math.PI * u;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  for (let py = 0; py < IMG; py++) {
    for (let px = 0; px < IMG; px++) {
      let hit = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = px + (sx + 0.5) / S - c;
          const y = py + (sy + 0.5) / S - c;
          let inside = false;
          if (shape === 0) inside = x * x + y * y <= rad * rad;
          else if (shape === 1) inside = Math.abs(Math.hypot(x, y) - rad) <= 0.7;
          else {
            const along = x * ca + y * sa;
            const across = -x * sa + y * ca;
            inside = Math.abs(along) <= 4.6 && Math.abs(across) <= 0.85;
          }
          if (inside) hit++;
        }
      }
      out[py * IMG + px] = hit / (S * S);
    }
  }
  return out;
}

export interface ImgItem {
  x: Float64Array;
  shape: Shape;
  u: number;
}

/** `per` images of each shape with evenly spread parameters (plus a little jitter). */
export function makeImages(per = 80, seed = 5): ImgItem[] {
  const r = rng(seed);
  const items: ImgItem[] = [];
  for (let s = 0; s < 3; s++) {
    for (let i = 0; i < per; i++) {
      const u = Math.min(1, Math.max(0, (i + r()) / per));
      items.push({ x: renderShape(s as Shape, u), shape: s as Shape, u });
    }
  }
  return items;
}

/**
 * Image autoencoder with a 2D latent. With `beta` > 0 it is a VAE: the encoder outputs
 * a mean and a log-variance, z is sampled by the reparameterization trick, and the loss
 * adds beta × KL(q(z|x) ‖ N(0, I)). Reconstruction loss is binary cross-entropy summed over pixels.
 */
export class ImageAE {
  enc: Net;
  dec: Net;
  beta: number;
  vae: boolean;
  epochs = 0;
  private r: () => number;

  constructor(vae: boolean, beta: number, seed = 1, hidden = 32) {
    this.vae = vae;
    this.beta = beta;
    this.r = rng(seed);
    const P = IMG * IMG;
    this.enc = new Net([P, hidden, vae ? 4 : 2], ['tanh', 'linear'], this.r);
    this.dec = new Net([2, hidden, P], ['tanh', 'sigmoid'], this.r);
  }

  /** Latent code (the mean, for a VAE). */
  encode(x: Float64Array): P2 {
    const o = this.enc.forward(x);
    return [o[0], o[1]];
  }
  /** Standard deviations of q(z|x) (VAE only). */
  encodeStd(x: Float64Array): P2 {
    const o = this.enc.forward(x);
    return this.vae ? [Math.exp(0.5 * o[2]), Math.exp(0.5 * o[3])] : [0, 0];
  }
  decode(z: P2): Float64Array {
    return Float64Array.from(this.dec.forward(z));
  }

  private order: number[] = [];
  private pos = 0;
  private cnt = 0;
  private g = new Float64Array(IMG * IMG);
  private dEnc = new Float64Array(4);

  /** Training progress in epochs, including the part of the current pass already done. */
  get progress() {
    return this.epochs + (this.order.length ? this.pos / this.order.length : 0);
  }

  /**
   * Train on up to `n` more images (Adam, mini-batches of `batch`), resuming where the last call
   * stopped. Splitting the work into chunks gives exactly the same result as whole epochs.
   */
  train(items: ImgItem[], n: number, lr = 0.01, batch = 8) {
    const P = IMG * IMG;
    const g = this.g;
    const dEnc = this.dEnc;
    for (let done = 0; done < n; done++) {
      if (this.pos === 0) this.order = shuffle(items.length, this.r);
      const x = items[this.order[this.pos]].x;
      const h = this.enc.forward(x);
      const mu0 = h[0];
      const mu1 = h[1];
      let z: P2 = [mu0, mu1];
      let e0 = 0;
      let e1 = 0;
      let s0 = 0;
      let s1 = 0;
      const lv0 = h[2];
      const lv1 = h[3];
      if (this.vae) {
        // reparameterization: z = μ + σ ⊙ ε, ε ~ N(0, I)
        e0 = gauss(this.r);
        e1 = gauss(this.r);
        s0 = Math.exp(0.5 * lv0);
        s1 = Math.exp(0.5 * lv1);
        z = [mu0 + s0 * e0, mu1 + s1 * e1];
      }
      const o = this.dec.forward(z);
      for (let k = 0; k < P; k++) g[k] = o[k] - x[k]; // sigmoid + cross-entropy
      const dz = this.dec.backward(g, true);
      if (this.vae) {
        const b = this.beta;
        dEnc[0] = dz[0] + b * mu0;
        dEnc[1] = dz[1] + b * mu1;
        dEnc[2] = dz[0] * e0 * 0.5 * s0 + b * 0.5 * (Math.exp(lv0) - 1);
        dEnc[3] = dz[1] * e1 * 0.5 * s1 + b * 0.5 * (Math.exp(lv1) - 1);
        this.enc.backward(dEnc);
      } else this.enc.backward([dz[0], dz[1]]);
      this.pos++;
      const last = this.pos === items.length;
      if (++this.cnt === batch || last) {
        this.enc.step(lr, this.cnt);
        this.dec.step(lr, this.cnt);
        this.cnt = 0;
      }
      if (last) {
        this.pos = 0;
        this.epochs++;
      }
    }
  }

  /** One full pass over the images. */
  epoch(items: ImgItem[], lr = 0.01, batch = 8) {
    this.train(items, items.length - this.pos, lr, batch);
  }

  /** Mean per-image reconstruction cross-entropy (decoding the mean) and KL term. */
  evaluate(items: ImgItem[]): { rec: number; kl: number; mse: number } {
    let rec = 0;
    let kl = 0;
    let mse = 0;
    const P = IMG * IMG;
    for (const it of items) {
      const h = this.enc.forward(it.x);
      if (this.vae) {
        for (let d = 0; d < 2; d++) kl += 0.5 * (h[d] * h[d] + Math.exp(h[2 + d]) - h[2 + d] - 1);
      }
      const o = this.dec.forward([h[0], h[1]]);
      for (let k = 0; k < P; k++) {
        const p = Math.min(1 - 1e-7, Math.max(1e-7, o[k]));
        rec -= it.x[k] * Math.log(p) + (1 - it.x[k]) * Math.log(1 - p);
        mse += (o[k] - it.x[k]) ** 2;
      }
    }
    return { rec: rec / items.length, kl: kl / items.length, mse: mse / (items.length * P) };
  }
}

/** Mean squared pixel distance from an image to its nearest training image. */
export function nearestMSE(img: Float64Array, items: ImgItem[]): { mse: number; idx: number } {
  let best = Infinity;
  let bi = -1;
  for (let i = 0; i < items.length; i++) {
    const x = items[i].x;
    let s = 0;
    for (let k = 0; k < x.length; k++) s += (x[k] - img[k]) ** 2;
    if (s < best) {
      best = s;
      bi = i;
    }
  }
  return { mse: best / img.length, idx: bi };
}

/**
 * How sensible are random samples? Draw `n` latent points from N(m, diag(s²)) — N(0, I) for a VAE,
 * a Gaussian fitted to the codes for a plain AE — decode them, and average the distance to the nearest
 * training image. Also counts how many decodes are "clean" (nearest-image MSE below `tol`).
 */
export function sampleQuality(ae: ImageAE, items: ImgItem[], n = 200, seed = 9, tol = 0.01) {
  const r = rng(seed);
  let m: P2 = [0, 0];
  let s: P2 = [1, 1];
  if (!ae.vae) {
    const codes = items.map((it) => ae.encode(it.x));
    const N = codes.length;
    m = [codes.reduce((a, c) => a + c[0], 0) / N, codes.reduce((a, c) => a + c[1], 0) / N];
    s = [Math.sqrt(codes.reduce((a, c) => a + (c[0] - m[0]) ** 2, 0) / N), Math.sqrt(codes.reduce((a, c) => a + (c[1] - m[1]) ** 2, 0) / N)];
  }
  let tot = 0;
  let clean = 0;
  for (let i = 0; i < n; i++) {
    const z: P2 = [m[0] + s[0] * gauss(r), m[1] + s[1] * gauss(r)];
    const d = nearestMSE(ae.decode(z), items).mse;
    tot += d;
    if (d < tol) clean++;
  }
  return { mean: tot / n, clean: clean / n };
}

/* ═══════════════════ Diffusion ═══════════════════ */

export type Sched = 'linear' | 'cosine';

/** ᾱ(t) for continuous t in [0,1]: DDPM's linear β (0.0001 → 0.02 over 1000 steps) or the cosine schedule. */
export function alphaBar(s: Sched, t: number): number {
  if (s === 'linear') {
    const b0 = 0.1;
    const b1 = 20;
    return Math.exp(-(b0 * t + 0.5 * (b1 - b0) * t * t));
  }
  const f = (u: number) => Math.cos(((u + 0.008) / 1.008) * (Math.PI / 2)) ** 2;
  return Math.max(0, Math.min(1, f(t) / f(0)));
}

/** α_t and σ_t of x_t = α_t x₀ + σ_t ε (variance preserving: α² + σ² = 1). */
export function alphaSigma(s: Sched, t: number): [number, number] {
  const ab = alphaBar(s, t);
  return [Math.sqrt(ab), Math.sqrt(Math.max(0, 1 - ab))];
}

/** Discrete DDPM: ᾱ after `k` of 1000 steps with β linearly from 1e-4 to 0.02 (to check the continuous form). */
export function ddpmAlphaBarDiscrete(k: number, T = 1000): number {
  let ab = 1;
  for (let i = 1; i <= k; i++) ab *= 1 - (1e-4 + ((0.02 - 1e-4) * (i - 1)) / (T - 1));
  return ab;
}

/** An isotropic Gaussian mixture in 2D, equal weights; `cls` labels each component. */
export interface GMM {
  mu: P2[];
  cls: number[];
  s: number; // per-component standard deviation
}

export type Shape2D = 'spiral' | 'rings';

export function makeGMM(kind: Shape2D): GMM {
  const mu: P2[] = [];
  const cls: number[] = [];
  if (kind === 'spiral') {
    const K = 28;
    for (let i = 0; i < K; i++) {
      const u = i / (K - 1);
      const th = 0.5 + u * 3.1 * Math.PI;
      const rad = 0.18 + 0.8 * u;
      mu.push([rad * Math.cos(th), rad * Math.sin(th)]);
      cls.push(0);
    }
    return { mu, cls, s: 0.045 };
  }
  // two overlapping rings (class 0 on the left, class 1 on the right) that cross at x = 0
  const K = 16;
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < K; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / K;
      mu.push([(c ? 0.3 : -0.3) + 0.52 * Math.cos(a), 0.52 * Math.sin(a)]);
      cls.push(c);
    }
  }
  return { mu, cls, s: 0.045 };
}

/** P(class c | x) for a clean point x under the mixture (the "perfect classifier"). */
export function classProb(g: GMM, x: P2, c: number): number {
  let num = 0;
  let den = 0;
  for (let k = 0; k < g.mu.length; k++) {
    const dx = x[0] - g.mu[k][0];
    const dy = x[1] - g.mu[k][1];
    const w = Math.exp(-(dx * dx + dy * dy) / (2 * g.s * g.s));
    den += w;
    if (g.cls[k] === c) num += w;
  }
  return den > 0 ? num / den : 0.5;
}

/** Exact samples from the mixture (optionally only components of class `c`). */
export function sampleGMM(g: GMM, n: number, seed: number, c = -1): P2[] {
  const r = rng(seed);
  const ids = g.mu.map((_, k) => k).filter((k) => c < 0 || g.cls[k] === c);
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const k = ids[Math.floor(r() * ids.length)];
    out.push([g.mu[k][0] + g.s * gauss(r), g.mu[k][1] + g.s * gauss(r)]);
  }
  return out;
}

let logwBuf = new Float64Array(32);

/**
 * The exact denoiser E[x₀ | x_t] for the mixture: x_t is itself a mixture with means α μ_k and
 * variance α² s² + σ², so the posterior picks components by their likelihood and then shrinks
 * x_t toward each mean. `c` ≥ 0 conditions on a class (only that class's components count).
 */
export function denoise(g: GMM, x: P2, a: number, sig: number, c = -1): P2 {
  const v = a * a * g.s * g.s + sig * sig;
  const shrink = (a * g.s * g.s) / v;
  let maxL = -Infinity;
  const K = g.mu.length;
  if (logwBuf.length < K) logwBuf = new Float64Array(K);
  const logw = logwBuf;
  for (let k = 0; k < K; k++) {
    if (c >= 0 && g.cls[k] !== c) {
      logw[k] = -Infinity;
      continue;
    }
    const dx = x[0] - a * g.mu[k][0];
    const dy = x[1] - a * g.mu[k][1];
    logw[k] = -(dx * dx + dy * dy) / (2 * v);
    if (logw[k] > maxL) maxL = logw[k];
  }
  let ws = 0;
  let ex = 0;
  let ey = 0;
  for (let k = 0; k < K; k++) {
    if (logw[k] === -Infinity) continue;
    const w = Math.exp(logw[k] - maxL);
    ws += w;
    ex += w * (g.mu[k][0] + shrink * (x[0] - a * g.mu[k][0]));
    ey += w * (g.mu[k][1] + shrink * (x[1] - a * g.mu[k][1]));
  }
  return [ex / ws, ey / ws];
}

/** Classifier-free guidance on the x₀ prediction: uncond + w (cond − uncond). */
export function guided(g: GMM, x: P2, a: number, sig: number, c: number, w: number): P2 {
  const u = denoise(g, x, a, sig);
  if (c < 0 || w === 0) return u;
  const k = denoise(g, x, a, sig, c);
  return [u[0] + w * (k[0] - u[0]), u[1] + w * (k[1] - u[1])];
}

export type Sampler = 'ddpm' | 'ddim';

export interface SampleRun {
  /** paths[i][j] = position of sample i after j steps (j = 0 is pure noise). */
  paths: P2[][];
  /** preds[i][j] = the denoiser's guess x̂₀ made from paths[i][j] (j < steps). */
  preds: P2[][];
  times: number[];
}

/**
 * Run the reverse process from x₁ ~ N(0, I) down to t = 0 in `steps` equal steps.
 * DDIM (η = 0) is deterministic: x_s = α_s x̂₀ + σ_s ε̂. DDPM samples the Gaussian
 * posterior q(x_s | x_t, x̂₀). Guidance class `c` (−1 for none) with scale `w`.
 */
export function sampleReverse(g: GMM, opt: { n: number; steps: number; sampler: Sampler; sched: Sched; seed: number; c?: number; w?: number }): SampleRun {
  const { n, steps, sampler, sched, seed } = opt;
  const c = opt.c ?? -1;
  const w = opt.w ?? 1;
  const r = rng(seed);
  const rn = rng(seed * 7919 + 1);
  const times = Array.from({ length: steps + 1 }, (_, j) => 1 - j / steps);
  const paths: P2[][] = [];
  const preds: P2[][] = [];
  for (let i = 0; i < n; i++) {
    let x: P2 = [gauss(r), gauss(r)];
    const path: P2[] = [x];
    const pred: P2[] = [];
    for (let j = 0; j < steps; j++) {
      const [a, sig] = alphaSigma(sched, times[j]);
      const [a2, sig2] = alphaSigma(sched, times[j + 1]);
      const x0 = guided(g, x, a, sig, c, w);
      pred.push(x0);
      if (sampler === 'ddim' || sig2 === 0) {
        const eps: P2 = sig > 0 ? [(x[0] - a * x0[0]) / sig, (x[1] - a * x0[1]) / sig] : [0, 0];
        x = [a2 * x0[0] + sig2 * eps[0], a2 * x0[1] + sig2 * eps[1]];
      } else {
        const at = a / a2; // α_{t|s}
        const vts = sig * sig - at * at * sig2 * sig2; // σ²_{t|s}
        const cx = (at * sig2 * sig2) / (sig * sig);
        const c0 = (a2 * vts) / (sig * sig);
        const sd = Math.sqrt(Math.max(0, (vts * sig2 * sig2) / (sig * sig)));
        x = [cx * x[0] + c0 * x0[0] + sd * gauss(rn), cx * x[1] + c0 * x0[1] + sd * gauss(rn)];
      }
      path.push(x);
    }
    paths.push(path);
    preds.push(pred);
  }
  return { paths, preds, times };
}

/** Distance from a point to the nearest component mean, and that component's index. */
export function nearestComp(g: GMM, p: P2): { d: number; k: number } {
  let best = Infinity;
  let bk = 0;
  g.mu.forEach((m, k) => {
    const d = Math.hypot(p[0] - m[0], p[1] - m[1]);
    if (d < best) {
      best = d;
      bk = k;
    }
  });
  return { d: best, k: bk };
}

/**
 * Quality of a set of samples against the mixture: mean distance to the nearest component
 * (true samples average about 1.25·s), the share of components that received at least one sample,
 * and for a target class the share of samples the perfect classifier assigns to that class.
 */
export function sampleStats(g: GMM, pts: P2[], c = -1) {
  let dsum = 0;
  let hit = 0;
  const seen = new Set<number>();
  for (const p of pts) {
    const { d, k } = nearestComp(g, p);
    dsum += d;
    seen.add(k);
    if (c >= 0 && classProb(g, p, c) > 0.5) hit++;
  }
  const pool = g.mu.map((_, k) => k).filter((k) => c < 0 || g.cls[k] === c);
  const covered = pool.filter((k) => seen.has(k)).length;
  return { dist: dsum / pts.length, coverage: covered / pool.length, acc: c >= 0 ? hit / pts.length : NaN, spread: spread(pts) };
}

/** Root-mean-square distance of points from their centroid (a simple diversity measure). */
export function spread(pts: P2[]): number {
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n;
  const my = pts.reduce((a, p) => a + p[1], 0) / n;
  return Math.sqrt(pts.reduce((a, p) => a + (p[0] - mx) ** 2 + (p[1] - my) ** 2, 0) / n);
}

/* ─────── a 16×16 glyph for the forward-process figure ─────── */

export const GLYPH_N = 16;
const GLYPH_ROWS = [
  '................',
  '.....######.....',
  '...##......##...',
  '..#..........#..',
  '.#............#.',
  '.#...##..##...#.',
  '#....##..##....#',
  '#..............#',
  '#..............#',
  '#..#........#..#',
  '.#..#......#..#.',
  '.#...######...#.',
  '..#..........#..',
  '...##......##...',
  '.....######.....',
  '................',
];

/** The glyph as values in [−1, 1] (−1 = background, 1 = ink), the range diffusion models work in. */
export function glyph(): Float64Array {
  const out = new Float64Array(GLYPH_N * GLYPH_N);
  GLYPH_ROWS.forEach((row, y) => {
    for (let x = 0; x < GLYPH_N; x++) out[y * GLYPH_N + x] = row[x] === '#' ? 1 : -1;
  });
  return out;
}

/** Fixed standard-normal noise for `n` values (so the slider moves one consistent noising path). */
export function noiseVec(n: number, seed: number): Float64Array {
  const r = rng(seed);
  return Float64Array.from({ length: n }, () => gauss(r));
}
