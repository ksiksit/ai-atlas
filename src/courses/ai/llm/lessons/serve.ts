/* 대형 언어 모델 · 쓰기: pure logic for the RAG and inference-optimisation lessons. */

import { gauss, rng } from '../../../../lib/math';

/* ═══════════════════ RAG: a small document collection ═══════════════════ */

export interface Doc {
  title: string;
  text: string;
}

/** A handbook of a made-up company, written for this lesson. Nothing here describes a real organisation. */
export const HANDBOOK: Doc[] = [
  {
    title: '휴가 제도',
    text: '연차 휴가는 입사 첫해에 매달 1일씩 생기며 최대 11일입니다. 입사 2년 차부터는 해마다 15일이 주어지고, 2년마다 1일씩 늘어 최대 25일까지 받을 수 있습니다. 반차는 오전 또는 오후 4시간 단위로 쓸 수 있고, 반차 두 번은 연차 하루로 계산합니다. 쓰지 못한 연차는 다음 해 3월 말까지만 이월됩니다. 병가는 진단서를 내면 연간 최대 30일까지 유급으로 처리됩니다. 본인이 결혼하면 경조 휴가 5일을, 가족의 장례에는 3일에서 5일을 받습니다. 휴가 신청은 사내 포털의 근태 메뉴에서 하며, 3일 이상 연속으로 쉴 때는 1주 전에 팀장 승인을 받아야 합니다. 휴가 중에는 메신저 상태를 부재중으로 바꾸고 급한 일을 맡아 줄 사람을 정해 둡니다.',
  },
  {
    title: '출장과 경비',
    text: '국내 출장의 숙박비는 1박에 12만 원까지 지원합니다. 해외 출장은 도시 등급에 따라 1박에 180달러에서 250달러까지 지원합니다. 출장 중 식비는 국내는 하루 5만 원, 해외는 하루 80달러 한도에서 실비로 정산합니다. 항공권은 출장 2주 전까지 총무팀을 통해 일반석으로 예약하며, 비행시간이 8시간을 넘으면 비즈니스석을 신청할 수 있습니다. 택시는 밤 10시 이후이거나 짐이 많을 때만 이용할 수 있습니다. 모든 경비는 영수증을 첨부해 출장에서 돌아온 날로부터 14일 안에 경비 시스템에 올려야 하며, 기한을 넘기면 정산이 거절될 수 있습니다. 법인카드를 쓴 경우에도 영수증 사진을 따로 올려야 합니다.',
  },
  {
    title: '재택근무',
    text: '재택근무는 수습 기간이 끝난 직원이면 누구나 주 2일까지 할 수 있습니다. 재택근무 일정은 전날 오후 6시까지 팀 캘린더에 등록하고, 팀 회의가 있는 화요일은 되도록 사무실로 나옵니다. 사무실 밖에서 회사 시스템에 접속할 때는 반드시 회사 VPN을 켜야 하고, 카페나 공항 같은 공용 와이파이에서는 고객 데이터를 열면 안 됩니다. 핵심 근무 시간인 오전 11시부터 오후 4시까지는 메신저에 응답할 수 있어야 합니다. 재택근무용 의자나 모니터는 1회에 한해 30만 원까지 구입비를 지원합니다. 해외에서 원격으로 일하려면 한 달 전에 인사팀과 보안팀의 승인을 모두 받아야 하며, 연간 최대 4주까지만 허용됩니다.',
  },
  {
    title: '장비 지급',
    text: '입사하면 업무용 노트북 한 대와 모니터 한 대, 키보드와 마우스를 받습니다. 개발 직군은 모니터를 한 대 더 신청할 수 있습니다. 노트북은 지급일로부터 4년이 지나면 새 모델로 교체를 신청할 수 있고, 고장이 나면 기간과 상관없이 IT 지원팀에 수리를 맡깁니다. 수리하는 동안에는 대여용 노트북을 빌려 줍니다. 개인 소프트웨어를 설치하려면 IT 지원팀의 승인이 필요합니다. 휴대폰은 지급하지 않으며, 업무용으로 쓰는 개인 휴대폰 요금은 매달 3만 원까지 지원합니다. 퇴사할 때는 마지막 근무일까지 모든 장비를 반납해야 합니다. 장비를 잃어버렸다면 24시간 안에 보안팀에 알려야 합니다.',
  },
  {
    title: '보안 수칙',
    text: '모든 사내 계정에는 2단계 인증을 켜야 합니다. 비밀번호는 12자 이상으로 만들고 다른 서비스와 같은 비밀번호를 쓰지 않습니다. 비밀번호를 정기적으로 바꿀 필요는 없지만, 유출이 의심되면 즉시 바꿉니다. 외부 USB 저장 장치는 회사 노트북에 연결할 수 없습니다. 의심스러운 메일을 받으면 링크를 누르지 말고 보안팀 메일 주소로 전달합니다. 고객 정보가 담긴 파일은 사내 드라이브에만 저장하고, 개인 클라우드나 메신저로 보내지 않습니다. 자리를 비울 때는 화면을 잠그고, 퇴근할 때는 책상 위에 서류를 남기지 않습니다. 방문객은 안내 데스크에서 출입증을 받아야 하며 직원과 함께 다녀야 합니다.',
  },
  {
    title: '교육 지원',
    text: '직원 한 명에게 해마다 100만 원의 교육비를 지원합니다. 업무와 관련된 온라인 강의, 도서, 콘퍼런스 참가비, 자격증 시험 응시료에 쓸 수 있습니다. 도서는 한 달에 5권까지 영수증만 내면 바로 정산됩니다. 대학원 등록금은 별도 심사를 거쳐 절반까지 지원하며, 지원을 받은 뒤 2년 안에 퇴사하면 지원금을 돌려줘야 합니다. 콘퍼런스에 다녀오면 2주 안에 팀에 발표하거나 요약 글을 사내 위키에 올려야 합니다. 쓰지 않은 교육비는 다음 해로 넘어가지 않습니다. 매달 마지막 금요일 오후는 공부하는 시간으로 비워 둡니다.',
  },
  {
    title: '복지',
    text: '점심 식대로 근무일마다 1만 2천 원이 식권 앱에 충전됩니다. 저녁 8시 이후까지 일하면 저녁 식대 1만 5천 원을 추가로 받습니다. 정기 건강검진은 해마다 1회 회사가 비용을 부담하며, 만 40세 이상은 위내시경을 포함한 종합검진을 받을 수 있습니다. 결혼하면 축하금 50만 원을, 자녀가 태어나면 출산 축하금 100만 원을 지급합니다. 사내 동호회는 5명 이상 모이면 만들 수 있고 한 사람당 매달 2만 원의 활동비를 지원합니다. 근속 5년마다 2주의 안식 휴가와 여행비 200만 원을 줍니다.',
  },
];

/** A question with the passage that answers it (an exact substring of one document). */
export interface QA {
  q: string;
  doc: number;
  answer: string;
  /** reworded so that it shares almost no words with the document */
  paraphrase?: boolean;
}

export const QUESTIONS: QA[] = [
  { q: '입사 첫해에는 연차가 며칠 생기나요?', doc: 0, answer: '입사 첫해에 매달 1일씩 생기며 최대 11일입니다' },
  { q: '남은 연차는 언제까지 쓸 수 있나요?', doc: 0, answer: '쓰지 못한 연차는 다음 해 3월 말까지만 이월됩니다' },
  { q: '해외 출장 숙박비는 얼마까지 지원돼요?', doc: 1, answer: '해외 출장은 도시 등급에 따라 1박에 180달러에서 250달러까지 지원합니다' },
  { q: '출장 영수증은 언제까지 올려야 하나요?', doc: 1, answer: '출장에서 돌아온 날로부터 14일 안에 경비 시스템에 올려야' },
  { q: '재택근무는 일주일에 며칠까지 할 수 있나요?', doc: 2, answer: '누구나 주 2일까지 할 수 있습니다' },
  { q: '노트북 교체는 몇 년마다 가능한가요?', doc: 3, answer: '노트북은 지급일로부터 4년이 지나면 새 모델로 교체를 신청할 수 있고' },
  { q: '장비를 잃어버리면 어떻게 해야 하나요?', doc: 3, answer: '장비를 잃어버렸다면 24시간 안에 보안팀에 알려야 합니다' },
  { q: '비밀번호는 몇 자 이상이어야 하나요?', doc: 4, answer: '비밀번호는 12자 이상으로 만들고' },
  { q: '교육비는 1년에 얼마나 지원되나요?', doc: 5, answer: '해마다 100만 원의 교육비를 지원합니다' },
  { q: '점심 식대는 하루에 얼마인가요?', doc: 6, answer: '점심 식대로 근무일마다 1만 2천 원이 식권 앱에 충전됩니다' },
  { q: '집에서 일하는 날은 일주일에 몇 번까지 돼요?', doc: 2, answer: '누구나 주 2일까지 할 수 있습니다', paraphrase: true },
];

export interface Span {
  doc: number;
  start: number;
  end: number;
}

export function answerSpan(qa: QA, docs: Doc[] = HANDBOOK): Span {
  const start = docs[qa.doc].text.indexOf(qa.answer);
  if (start < 0) throw new Error('answer not in document: ' + qa.answer);
  return { doc: qa.doc, start, end: start + qa.answer.length };
}

/* ─────────── chunking ─────────── */

export interface Chunk extends Span {
  text: string;
}

/**
 * Split text into chunks of at most `size` characters (a single longer word becomes its own chunk),
 * cutting only at spaces. Each chunk after the first starts at the earliest word that lies within
 * `overlap` characters of the previous chunk's end, so neighbouring chunks share about `overlap` characters.
 */
export function chunkText(text: string, size: number, overlap: number): [number, number][] {
  const words: [number, number][] = [];
  for (const m of text.matchAll(/\S+/g)) words.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  const out: [number, number][] = [];
  let i = 0;
  while (i < words.length) {
    let j = i;
    while (j + 1 < words.length && words[j + 1][1] - words[i][0] <= size) j++;
    out.push([words[i][0], words[j][1]]);
    if (j === words.length - 1) break;
    let k = j + 1;
    while (k - 1 > i && words[j][1] - words[k - 1][0] <= overlap) k--;
    i = k;
  }
  return out;
}

export function chunkDocs(docs: Doc[], size: number, overlap: number): Chunk[] {
  const out: Chunk[] = [];
  docs.forEach((d, doc) => {
    for (const [start, end] of chunkText(d.text, size, overlap)) out.push({ doc, start, end, text: d.text.slice(start, end) });
  });
  return out;
}

/* ─────────── a lexical embedding we can compute honestly in the browser ─────────── */

/** Character bigrams inside each word (a one-character word becomes a unigram). Punctuation is dropped. */
export function features(text: string): string[] {
  const out: string[] = [];
  for (const w of text.toLowerCase().replace(/[.,?!·:;()"'“”‘’]/g, ' ').split(/\s+/)) {
    if (!w) continue;
    const cs = Array.from(w);
    if (cs.length === 1) out.push(cs[0]);
    for (let i = 0; i + 1 < cs.length; i++) out.push(cs[i] + cs[i + 1]);
  }
  return out;
}

export const EMB_DIM = 512;

/** 32-bit FNV-1a. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * TF-IDF over character bigrams, hashed into a fixed number of dimensions (with a sign bit so
 * collisions cancel on average) and scaled to length 1, so cosine similarity is a dot product.
 */
export class HashedTfIdf {
  idf = new Map<string, number>();
  n: number;
  dim: number;
  constructor(texts: string[], dim = EMB_DIM) {
    this.n = texts.length;
    this.dim = dim;
    const df = new Map<string, number>();
    for (const t of texts) for (const f of new Set(features(t))) df.set(f, (df.get(f) ?? 0) + 1);
    for (const [f, c] of df) this.idf.set(f, Math.log((1 + this.n) / (1 + c)) + 1);
  }
  embed(text: string): Float64Array {
    const v = new Float64Array(this.dim);
    const tf = new Map<string, number>();
    for (const f of features(text)) tf.set(f, (tf.get(f) ?? 0) + 1);
    const unseen = Math.log(1 + this.n) + 1;
    for (const [f, c] of tf) {
      const h = fnv1a(f);
      const w = (1 + Math.log(c)) * (this.idf.get(f) ?? unseen);
      v[h % this.dim] += h & 0x80000000 ? -w : w;
    }
    return normalize(v);
  }
}

export function normalize(v: Float64Array): Float64Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

/** Indices of the k largest scores, best first (ties: lower index first). */
export function topK(scores: ArrayLike<number>, k: number): number[] {
  const idx = Array.from({ length: scores.length }, (_, i) => i);
  idx.sort((a, b) => scores[b] - scores[a] || a - b);
  return idx.slice(0, k);
}

export interface Retrieval {
  chunks: Chunk[];
  scores: number[];
  /** all chunk indices, best first */
  order: number[];
}

/** Chunk the handbook, embed every chunk with an index built on those chunks, and rank them for each question. */
export function buildIndex(size: number, overlap: number, docs: Doc[] = HANDBOOK) {
  const chunks = chunkDocs(docs, size, overlap);
  const emb = new HashedTfIdf(chunks.map((c) => c.text));
  const vecs = chunks.map((c) => emb.embed(c.text));
  const search = (q: string): Retrieval => {
    const qv = emb.embed(q);
    const scores = vecs.map((v) => cosine(qv, v));
    return { chunks, scores, order: topK(scores, scores.length) };
  };
  return { chunks, emb, vecs, search };
}

export const contains = (c: Span, s: Span) => c.doc === s.doc && c.start <= s.start && c.end >= s.end;
export const overlapLen = (c: Span, s: Span) => (c.doc === s.doc ? Math.max(0, Math.min(c.end, s.end) - Math.max(c.start, s.start)) : 0);

export interface QAResult {
  /** 0-based rank of the best chunk that holds the whole answer, or -1 if no chunk does */
  rank: number;
  /** whether any chunk holds the whole answer */
  fits: boolean;
}

export function rankOfAnswer(r: Retrieval, span: Span): QAResult {
  const fits = r.chunks.some((c) => contains(c, span));
  const rank = r.order.findIndex((i) => contains(r.chunks[i], span));
  return { rank, fits };
}

/** Characters of the answer covered by the given chunks (each position counted once). */
export function answerCovered(chunks: Chunk[], ids: number[], span: Span): number {
  let n = 0;
  for (let p = span.start; p < span.end; p++) if (ids.some((i) => chunks[i].doc === span.doc && chunks[i].start <= p && chunks[i].end > p)) n++;
  return n;
}

export interface EvalPoint {
  size: number;
  /** fraction of questions whose whole answer sits inside one of the top-k chunks */
  recall: number;
  /** answer characters / characters of retrieved text, averaged over questions */
  precision: number;
  /** average characters of retrieved text */
  contextChars: number;
  /** average number of chunks put into the prompt */
  taken: number;
  nChunks: number;
  ranks: number[];
  hits: boolean[];
}

export const EVAL_SIZES = Array.from({ length: 29 }, (_, i) => 20 + i * 20); // 20 … 580

/** How many retrieved chunks go into the prompt: a fixed count, or as many as fit in a character budget (at least one). */
export type Take = { k: number } | { budget: number };

export function takeTop(r: Retrieval, take: Take): number[] {
  if ('k' in take) return r.order.slice(0, take.k);
  const out: number[] = [];
  let chars = 0;
  for (const i of r.order) {
    const len = r.chunks[i].text.length;
    if (out.length && chars + len > take.budget) break;
    out.push(i);
    chars += len;
  }
  return out;
}

/** Retrieval quality over all questions for one chunk size, overlap given as a fraction of the size. */
export function evalAt(size: number, overlapFrac: number, take: Take, qas: QA[] = QUESTIONS): EvalPoint {
  const ix = buildIndex(size, Math.round(size * overlapFrac));
  let hit = 0;
  let prec = 0;
  let ctx = 0;
  let taken = 0;
  const ranks: number[] = [];
  const hits: boolean[] = [];
  for (const qa of qas) {
    const span = answerSpan(qa);
    const r = ix.search(qa.q);
    const top = takeTop(r, take);
    const res = rankOfAnswer(r, span);
    ranks.push(res.rank);
    const ok = res.rank >= 0 && res.rank < top.length;
    hits.push(ok);
    if (ok) hit++;
    const chars = top.reduce((s, i) => s + r.chunks[i].text.length, 0);
    ctx += chars;
    taken += top.length;
    prec += chars ? answerCovered(r.chunks, top, span) / chars : 0;
  }
  const n = qas.length;
  return { size, recall: hit / n, precision: prec / n, contextChars: ctx / n, taken: taken / n, nChunks: ix.chunks.length, ranks, hits };
}

/** The prompt a RAG system would send: instructions, numbered passages, then the question. */
export function buildPrompt(question: string, chunks: Chunk[], ids: number[], docs: Doc[] = HANDBOOK): string {
  const parts = ids.map((i, n) => `[${n + 1}] (${docs[chunks[i].doc].title}) ${chunks[i].text}`);
  return `아래 자료만 근거로 질문에 답하세요. 자료에 답이 없으면 모른다고 답하세요.\n\n${parts.join('\n')}\n\n질문: ${question}\n답:`;
}

/* ═══════════════════ RAG: approximate nearest neighbours ═══════════════════ */

export interface Vectors {
  n: number;
  d: number;
  x: Float32Array;
}

/**
 * Clustered points: `nc` Gaussian blobs whose centres are themselves Gaussian, with blob widths that
 * vary, so blobs overlap the way real embeddings do. Queries come from the same distribution.
 */
export function makeClustered(n: number, d: number, nq: number, seed: number, nc = 200, spread = 1, width = 1.2): { base: Vectors; queries: Vectors } {
  const r = rng(seed);
  const centres = new Float32Array(nc * d);
  const widths = new Float32Array(nc);
  for (let c = 0; c < nc; c++) {
    widths[c] = width * (0.6 + 0.8 * r());
    for (let j = 0; j < d; j++) centres[c * d + j] = gauss(r) * spread;
  }
  const draw = (m: number): Vectors => {
    const x = new Float32Array(m * d);
    for (let i = 0; i < m; i++) {
      const c = Math.floor(r() * nc);
      for (let j = 0; j < d; j++) x[i * d + j] = centres[c * d + j] + gauss(r) * widths[c];
    }
    return { n: m, d, x };
  };
  const base = draw(n);
  const queries = draw(nq);
  return { base, queries };
}

export function dist2(a: Float32Array, ai: number, b: Float32Array, bi: number, d: number): number {
  let s = 0;
  for (let j = 0; j < d; j++) {
    const t = a[ai * d + j] - b[bi * d + j];
    s += t * t;
  }
  return s;
}

/** The k nearest base points of query qi by brute force, nearest first. */
export function exactKnn(base: Vectors, q: Vectors, qi: number, k: number): number[] {
  const ds = new Float64Array(base.n);
  for (let i = 0; i < base.n; i++) ds[i] = dist2(q.x, qi, base.x, i, base.d);
  return smallestK(ds, k);
}

/** Indices of the k smallest values, smallest first. */
export function smallestK(ds: ArrayLike<number>, k: number): number[] {
  const best: number[] = [];
  for (let i = 0; i < ds.length; i++) {
    if (best.length === k && ds[i] >= ds[best[k - 1]]) continue;
    let p = best.length < k ? best.length : k - 1;
    if (best.length < k) best.push(i);
    while (p > 0 && ds[best[p - 1]] > ds[i]) {
      best[p] = best[p - 1];
      p--;
    }
    best[p] = i;
  }
  return best;
}

export interface Ivf {
  nlist: number;
  d: number;
  centroids: Float32Array;
  /** list id of every base point */
  assign: Int32Array;
  /** members of every list */
  lists: number[][];
}

export interface IvfCurve {
  /** recall@k after probing p lists, for p = 1 … nlist (index p − 1) */
  recall: number[];
  /** average distance computations per query after probing p lists (centroids included) */
  comps: number[];
}

export type JobProgress = { phase: 'kmeans' | 'assign' | 'eval'; done: number; total: number };

function nearestCentroid(x: Float32Array, i: number, cents: Float32Array, nlist: number, d: number): number {
  let best = 0;
  let bd = Infinity;
  for (let c = 0; c < nlist; c++) {
    const v = dist2(x, i, cents, c, d);
    if (v < bd) {
      bd = v;
      best = c;
    }
  }
  return best;
}

/**
 * Build an IVF index (k-means on a sample, then assign every point) and measure recall@k against
 * brute force for every nprobe. Written as a generator that yields after small pieces of work so a
 * page can spread it over animation frames; the return value is the finished index and curve.
 */
export function* ivfJob(base: Vectors, queries: Vectors, nlist: number, seed: number, iters = 10, k = 10): Generator<JobProgress, { ivf: Ivf; curve: IvfCurve; exact: number[][] }, void> {
  const { d, n } = base;
  const r = rng(seed);
  // k-means on a random sample (about 30 points per centroid, at least 4,000)
  const sN = Math.min(n, Math.max(4000, 30 * nlist));
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const sample = perm.slice(0, sN);
  const cents = new Float32Array(nlist * d);
  for (let c = 0; c < nlist; c++) for (let j = 0; j < d; j++) cents[c * d + j] = base.x[sample[c] * d + j];
  const lab = new Int32Array(sN);
  const STEP = 400;
  for (let it = 0; it < iters; it++) {
    for (let s = 0; s < sN; s += STEP) {
      for (let t = s; t < Math.min(sN, s + STEP); t++) lab[t] = nearestCentroid(base.x, sample[t], cents, nlist, d);
      yield { phase: 'kmeans', done: it * sN + s, total: iters * sN };
    }
    const sum = new Float64Array(nlist * d);
    const cnt = new Int32Array(nlist);
    for (let t = 0; t < sN; t++) {
      const c = lab[t];
      cnt[c]++;
      for (let j = 0; j < d; j++) sum[c * d + j] += base.x[sample[t] * d + j];
    }
    for (let c = 0; c < nlist; c++) {
      if (cnt[c] === 0) {
        // an empty cluster takes a random sample point
        const p = sample[Math.floor(r() * sN)];
        for (let j = 0; j < d; j++) cents[c * d + j] = base.x[p * d + j];
      } else for (let j = 0; j < d; j++) cents[c * d + j] = sum[c * d + j] / cnt[c];
    }
  }
  // assign every point
  const assign = new Int32Array(n);
  for (let s = 0; s < n; s += STEP) {
    for (let i = s; i < Math.min(n, s + STEP); i++) assign[i] = nearestCentroid(base.x, i, cents, nlist, d);
    yield { phase: 'assign', done: s, total: n };
  }
  const lists: number[][] = Array.from({ length: nlist }, () => []);
  for (let i = 0; i < n; i++) lists[assign[i]].push(i);
  const ivf: Ivf = { nlist, d, centroids: cents, assign, lists };
  // evaluate: an exact neighbour is found once its list has been probed, so recall after p probes is
  // the share of exact neighbours whose list is among the p nearest centroids
  const recall = new Float64Array(nlist);
  const comps = new Float64Array(nlist);
  const exact: number[][] = [];
  for (let qi = 0; qi < queries.n; qi++) {
    const nn = exactKnn(base, queries, qi, k);
    exact.push(nn);
    const order = probeOrder(ivf, queries.x, qi);
    const rankOf = new Int32Array(nlist);
    order.forEach((c, p) => (rankOf[c] = p));
    const found = new Float64Array(nlist);
    for (const i of nn) found[rankOf[assign[i]]]++;
    let acc = 0;
    let seen = nlist;
    for (let p = 0; p < nlist; p++) {
      acc += found[p];
      seen += lists[order[p]].length;
      recall[p] += acc / k;
      comps[p] += seen;
    }
    yield { phase: 'eval', done: qi, total: queries.n };
  }
  return { ivf, curve: { recall: Array.from(recall, (v) => v / queries.n), comps: Array.from(comps, (v) => v / queries.n) }, exact };
}

/** Run a generator job to completion synchronously (tests, small indexes). */
export function runJob<R>(g: Generator<unknown, R, void>): R {
  for (;;) {
    const s = g.next();
    if (s.done) return s.value;
  }
}

/** Lists in order of their centroid's distance to query qi. */
export function probeOrder(ivf: Ivf, qx: Float32Array, qi: number): number[] {
  const cd = new Float64Array(ivf.nlist);
  for (let c = 0; c < ivf.nlist; c++) cd[c] = dist2(qx, qi, ivf.centroids, c, ivf.d);
  return Array.from({ length: ivf.nlist }, (_, c) => c).sort((a, b) => cd[a] - cd[b]);
}

/** Plain IVF search: scan the nprobe nearest lists and keep the k closest points. */
export function ivfSearch(ivf: Ivf, base: Vectors, qx: Float32Array, qi: number, nprobe: number, k: number): { ids: number[]; comps: number } {
  const order = probeOrder(ivf, qx, qi).slice(0, nprobe);
  const cand: number[] = [];
  for (const c of order) for (const i of ivf.lists[c]) cand.push(i);
  const ds = cand.map((i) => dist2(qx, qi, base.x, i, base.d));
  return { ids: smallestK(ds, k).map((j) => cand[j]), comps: ivf.nlist + cand.length };
}

/** Small k-means for the 2-D picture (all points, fixed iterations). */
export function kmeans2d(pts: Float32Array, n: number, nlist: number, seed: number, iters = 20): { cents: Float32Array; assign: Int32Array } {
  const base: Vectors = { n, d: 2, x: pts };
  const g = ivfJob(base, { n: 0, d: 2, x: new Float32Array(0) }, nlist, seed, iters);
  const res = runJob(g);
  return { cents: res.ivf.centroids, assign: res.ivf.assign };
}

/* ═══════════════════ Inference: quantisation ═══════════════════ */

export const QW = 64; // the toy layer is QW × QW
export type OutlierKind = 'none' | 'rows' | 'cols';
export type Scheme = 'tensor' | 'channel' | 'group';
export const GROUP = 16;
export const OUTLIER_ROWS = [7, 30, 51];
export const OUTLIER_COLS = [5, 11];
export const OUTLIER_GAIN = 8;

/** A QW×QW weight matrix (rows = output channels) with N(0, 1) entries and optional outlier rows or columns. */
export function makeWeights(kind: OutlierKind, seed = 4): Float64Array {
  const r = rng(seed);
  const W = new Float64Array(QW * QW);
  for (let i = 0; i < W.length; i++) W[i] = gauss(r);
  if (kind === 'rows') for (const i of OUTLIER_ROWS) for (let j = 0; j < QW; j++) W[i * QW + j] *= OUTLIER_GAIN;
  if (kind === 'cols') for (const j of OUTLIER_COLS) for (let i = 0; i < QW; i++) W[i * QW + j] *= OUTLIER_GAIN;
  return W;
}

/** Symmetric absmax: scale = max|w| / (2^(b−1) − 1); q = round(w / scale), clamped. */
export function absmaxQuantize(w: ArrayLike<number>, bits: number): { q: Int8Array; scale: number } {
  const qmax = 2 ** (bits - 1) - 1;
  let m = 0;
  for (let i = 0; i < w.length; i++) m = Math.max(m, Math.abs(w[i]));
  const scale = m / qmax || 1;
  const q = new Int8Array(w.length);
  for (let i = 0; i < w.length; i++) q[i] = Math.max(-qmax, Math.min(qmax, Math.round(w[i] / scale)));
  return { q, scale };
}

export const dequantize = (q: Int8Array, scale: number) => Float64Array.from(q, (v) => v * scale);

/** Group of every weight under a scheme: one scale per tensor, per output row, or per GROUP consecutive weights in a row. */
export function groupOf(i: number, j: number, scheme: Scheme): number {
  return scheme === 'tensor' ? 0 : scheme === 'channel' ? i : i * (QW / GROUP) + Math.floor(j / GROUP);
}

export function nScales(scheme: Scheme): number {
  return scheme === 'tensor' ? 1 : scheme === 'channel' ? QW : (QW * QW) / GROUP;
}

/** Quantise and dequantise W under a scheme; returns Ŵ and the scale of every group. */
export function quantizeMatrix(W: Float64Array, bits: number, scheme: Scheme): { Wq: Float64Array; scales: Float64Array } {
  const G = nScales(scheme);
  const members: number[][] = Array.from({ length: G }, () => []);
  for (let i = 0; i < QW; i++) for (let j = 0; j < QW; j++) members[groupOf(i, j, scheme)].push(i * QW + j);
  const Wq = new Float64Array(W.length);
  const scales = new Float64Array(G);
  members.forEach((idx, g) => {
    const { q, scale } = absmaxQuantize(idx.map((k) => W[k]), bits);
    scales[g] = scale;
    idx.forEach((k, t) => (Wq[k] = q[t] * scale));
  });
  return { Wq, scales };
}

export interface QuantStats {
  /** ‖W − Ŵ‖ / ‖W‖ */
  relWeightErr: number;
  /** ‖Wx − Ŵx‖ / ‖Wx‖ over a fixed batch of random inputs */
  relOutErr: number;
  /** share of weights that became exactly 0 */
  zeroFrac: number;
  /** bits per weight including 16-bit scales */
  bitsPerWeight: number;
}

export function quantStats(W: Float64Array, Wq: Float64Array, bits: number, scheme: Scheme, nx = 64, seed = 9): QuantStats {
  let e = 0;
  let s = 0;
  let zeros = 0;
  for (let k = 0; k < W.length; k++) {
    e += (W[k] - Wq[k]) ** 2;
    s += W[k] ** 2;
    if (Wq[k] === 0 && W[k] !== 0) zeros++;
  }
  const r = rng(seed);
  let oe = 0;
  let os = 0;
  const x = new Float64Array(QW);
  for (let t = 0; t < nx; t++) {
    for (let j = 0; j < QW; j++) x[j] = gauss(r);
    for (let i = 0; i < QW; i++) {
      let y = 0;
      let yq = 0;
      for (let j = 0; j < QW; j++) {
        y += W[i * QW + j] * x[j];
        yq += Wq[i * QW + j] * x[j];
      }
      oe += (y - yq) ** 2;
      os += y * y;
    }
  }
  return { relWeightErr: Math.sqrt(e / s), relOutErr: Math.sqrt(oe / os), zeroFrac: zeros / W.length, bitsPerWeight: bits + (16 * nScales(scheme)) / (QW * QW) };
}

/* ═══════════════════ Inference: memory-bound decoding ═══════════════════ */

export interface ServeCfg {
  params: number;
  bitsPerWeight: number;
  /** memory bandwidth, bytes/s */
  bandwidth: number;
  /** usable compute, FLOP/s */
  flops: number;
  batch: number;
  /** tokens of context held per sequence */
  context: number;
  /** KV-cache bytes per token of context */
  kvPerToken: number;
}

export interface StepCost {
  weightBytes: number;
  kvBytes: number;
  bytes: number;
  flop: number;
  tMem: number;
  tCompute: number;
  /** roofline: the slower of moving the bytes and doing the arithmetic */
  tStep: number;
  /** tokens per second for one sequence */
  perSeq: number;
  /** tokens per second over the whole batch */
  throughput: number;
  /** FLOP per byte moved */
  intensity: number;
  /** FLOP per byte at which compute and memory take equally long */
  ridge: number;
  bound: 'memory' | 'compute';
}

/**
 * One decoding step for a batch: every weight is read once and used for 2 FLOP per sequence;
 * every sequence also reads its own KV cache. Attention arithmetic, activations and overheads are
 * ignored, and memory traffic and arithmetic are assumed to overlap perfectly.
 */
export function decodeStep(c: ServeCfg): StepCost {
  const weightBytes = (c.params * c.bitsPerWeight) / 8;
  const kvBytes = c.batch * c.context * c.kvPerToken;
  const bytes = weightBytes + kvBytes;
  const flop = 2 * c.params * c.batch;
  const tMem = bytes / c.bandwidth;
  const tCompute = flop / c.flops;
  const tStep = Math.max(tMem, tCompute);
  return { weightBytes, kvBytes, bytes, flop, tMem, tCompute, tStep, perSeq: 1 / tStep, throughput: c.batch / tStep, intensity: flop / bytes, ridge: c.flops / c.bandwidth, bound: tMem >= tCompute ? 'memory' : 'compute' };
}

/* ═══════════════════ Inference: speculative decoding ═══════════════════ */

export const SPEC_VOCAB = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
/** Target model's next-token distribution in the toy. */
export const SPEC_P = [0.3, 0.22, 0.16, 0.12, 0.08, 0.06, 0.04, 0.02];
/** What a poor draft model believes instead. */
export const SPEC_BAD = [0.04, 0.06, 0.1, 0.06, 0.3, 0.06, 0.28, 0.1];

/** Draft distribution q = quality·p + (1 − quality)·bad. */
export function draftDist(quality: number, p = SPEC_P, bad = SPEC_BAD): number[] {
  return p.map((v, i) => quality * v + (1 - quality) * bad[i]);
}

/** Probability that a draft token is accepted: Σ min(p, q) = 1 − total variation distance. */
export const acceptRate = (p: number[], q: number[]) => p.reduce((s, v, i) => s + Math.min(v, q[i]), 0);

/** max(0, p − q), normalised. */
export function residual(p: number[], q: number[]): number[] {
  const r = p.map((v, i) => Math.max(0, v - q[i]));
  const s = r.reduce((a, b) => a + b, 0);
  return s > 0 ? r.map((v) => v / s) : p.slice();
}

export function sampleFrom(dist: number[], u: number): number {
  let acc = 0;
  for (let i = 0; i < dist.length; i++) {
    acc += dist[i];
    if (u < acc) return i;
  }
  return dist.length - 1;
}

/** Expected tokens produced per target pass with k draft tokens and acceptance rate α. */
export const expectedTokens = (alpha: number, k: number) => (alpha >= 1 ? k + 1 : (1 - alpha ** (k + 1)) / (1 - alpha));

/** Expected wall-time speed-up when one draft token costs c target passes. */
export const specSpeedup = (alpha: number, k: number, c: number) => expectedTokens(alpha, k) / (k * c + 1);

export type SpecKind = 'acc' | 'rej' | 'fix' | 'bonus';
export interface SpecToken {
  tok: number;
  kind: SpecKind;
}

/**
 * One round: the draft proposes up to k tokens from q; the target checks them in one pass.
 * Draft token x is kept with probability min(1, p(x)/q(x)); the first rejection is replaced by a
 * sample from max(0, p − q) and ends the round. If all k pass, the target adds one more token from p.
 * The returned list includes the rejected draft token (kind 'rej'), which is not part of the output.
 */
export function specRound(p: number[], q: number[], k: number, r: () => number): SpecToken[] {
  const out: SpecToken[] = [];
  for (let i = 0; i < k; i++) {
    const x = sampleFrom(q, r());
    if (r() < Math.min(1, p[x] / q[x])) out.push({ tok: x, kind: 'acc' });
    else {
      out.push({ tok: x, kind: 'rej' });
      out.push({ tok: sampleFrom(residual(p, q), r()), kind: 'fix' });
      return out;
    }
  }
  out.push({ tok: sampleFrom(p, r()), kind: 'bonus' });
  return out;
}

/* ═══════════════════ Formatting ═══════════════════ */

/** Decimal bytes: 14 GB, 512 MB. */
export function gb(b: number): string {
  if (b >= 1e12) return `${(b / 1e12).toFixed(b >= 1e13 ? 0 : 1)} TB`;
  if (b >= 1e9) return `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(b >= 1e7 ? 0 : 1)} MB`;
  return `${Math.round(b / 1e3)} KB`;
}

/** 1.2억 / 70억 / 3,000 style parameter counts. */
export function korCount(v: number): string {
  if (v >= 1e12) return `${+(v / 1e12).toFixed(1)}조`;
  if (v >= 1e8) return `${v >= 1e10 ? Math.round(v / 1e8).toLocaleString('ko-KR') : +(v / 1e8).toFixed(1)}억`;
  if (v >= 1e4) return `${+(v / 1e4).toFixed(1)}만`;
  return Math.round(v).toLocaleString('ko-KR');
}

/** Rounded numbers with thousands separators, 3 significant digits below 100. */
export function num(v: number): string {
  if (!isFinite(v)) return '∞';
  if (Math.abs(v) >= 100) return Math.round(v).toLocaleString('ko-KR');
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
