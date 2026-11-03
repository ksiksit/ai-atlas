/**
 * 만들기 (토크나이저와 BPE · 스케일링 법칙): pure logic, no React.
 *
 * Tokenizer half: pre-tokenization, a BPE trainer over integer symbols (characters for figure 1,
 * UTF-8 bytes for figures 2–3), rank-ordered encoding, and token-count curves.
 * Scaling half: power-law curves, a toy next-token task whose true entropy is known, a family of
 * low-rank models trained on it in small time slices, least-squares power-law fits, and the
 * compute-optimal split of a FLOP budget under L(N, D) = E + A/N^α + B/D^β.
 */
import { gauss, rng } from '../../../../lib/math';

/* ═══════════════════ Pre-tokenization ═══════════════════ */

/** Collapse runs of whitespace into one space and trim. */
export const normalizeSpaces = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * GPT-2-style pre-tokenizer, simplified: a run of letters, a run of digits or a run of other
 * symbols, each with the single space in front of it attached. Merges never cross these pieces.
 * A space is prepended so the first word looks like every other word.
 */
const PRETOK = / ?[\p{L}\p{M}]+| ?\p{N}+| ?[^\s\p{L}\p{M}\p{N}]+| +/gu;
export function pretokenize(text: string): string[] {
  const t = normalizeSpaces(text);
  if (!t) return [];
  return (' ' + t).match(PRETOK) ?? [];
}

/* ═══════════════════ BPE over integer symbols ═══════════════════ */

export interface Merge {
  a: number;
  b: number;
  /** id of the new symbol */
  id: number;
  /** how often the pair occurred when it was chosen */
  count: number;
}

export interface WordEntry {
  syms: number[];
  /** frequency of this pre-token in the corpus */
  n: number;
}

const KEY = 1 << 16;
const pairKey = (a: number, b: number) => a * KEY + b;

/** Replace every non-overlapping occurrence of (a, b), left to right, by id. */
export function mergeSyms(syms: number[], a: number, b: number, id: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < syms.length; i++) {
    if (i < syms.length - 1 && syms[i] === a && syms[i + 1] === b) {
      out.push(id);
      i++;
    } else out.push(syms[i]);
  }
  return out;
}

/** Pair counts over all words, weighted by word frequency. */
export function countPairs(words: WordEntry[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const w of words) {
    for (let i = 0; i < w.syms.length - 1; i++) {
      const k = pairKey(w.syms[i], w.syms[i + 1]);
      m.set(k, (m.get(k) ?? 0) + w.n);
    }
  }
  return m;
}

/** Most frequent pair; ties go to the smaller (a, b), so training is deterministic. */
export function bestPair(counts: Map<number, number>): { a: number; b: number; count: number } | null {
  let bk = -1;
  let bc = 0;
  counts.forEach((c, k) => {
    if (c > bc || (c === bc && c > 0 && k < bk)) {
      bc = c;
      bk = k;
    }
  });
  if (bk < 0) return null;
  return { a: Math.floor(bk / KEY), b: bk % KEY, count: bc };
}

/** The `k` most frequent pairs, same tie rule as bestPair. */
export function topPairs(counts: Map<number, number>, k: number): { a: number; b: number; count: number }[] {
  const all: [number, number][] = [];
  counts.forEach((c, key) => {
    if (c > 0) all.push([key, c]);
  });
  all.sort((x, y) => y[1] - x[1] || x[0] - y[0]);
  return all.slice(0, k).map(([key, count]) => ({ a: Math.floor(key / KEY), b: key % KEY, count }));
}

/**
 * Train BPE: repeatedly merge the most frequent adjacent pair. Pair counts are kept up to date
 * incrementally (only words that contain the merged pair are recounted). Stops after `maxMerges`
 * or when no pair occurs at least `minCount` times. `words` is modified in place.
 * `onStep` sees the counts before each merge (used to record figure frames).
 */
export function trainBPE(words: WordEntry[], firstId: number, maxMerges: number, minCount = 2, onStep?: (counts: Map<number, number>, k: number) => void): Merge[] {
  const counts = countPairs(words);
  const merges: Merge[] = [];
  const add = (w: WordEntry, sign: number) => {
    for (let i = 0; i < w.syms.length - 1; i++) {
      const k = pairKey(w.syms[i], w.syms[i + 1]);
      const v = (counts.get(k) ?? 0) + sign * w.n;
      if (v > 0) counts.set(k, v);
      else counts.delete(k);
    }
  };
  for (let k = 0; k < maxMerges; k++) {
    onStep?.(counts, k);
    const best = bestPair(counts);
    if (!best || best.count < minCount) break;
    const id = firstId + k;
    merges.push({ a: best.a, b: best.b, id, count: best.count });
    for (const w of words) {
      const s = w.syms;
      let has = false;
      for (let i = 0; i < s.length - 1; i++) {
        if (s[i] === best.a && s[i + 1] === best.b) {
          has = true;
          break;
        }
      }
      if (!has) continue;
      add(w, -1);
      w.syms = mergeSyms(s, best.a, best.b, id);
      add(w, 1);
    }
  }
  return merges;
}

/** Rank table: pair → merge index (lower = learned earlier). */
export function rankTable(merges: Merge[], limit = merges.length): Map<number, number> {
  const m = new Map<number, number>();
  for (let i = 0; i < Math.min(limit, merges.length); i++) m.set(pairKey(merges[i].a, merges[i].b), i);
  return m;
}

/**
 * Encode one pre-token with learned merges, the way GPT-2 does: keep merging the adjacent pair
 * with the lowest rank until no pair in the word is in the table.
 */
export function encodeSyms(syms: number[], ranks: Map<number, number>, merges: Merge[]): number[] {
  let s = syms.slice();
  for (;;) {
    let best = -1;
    for (let i = 0; i < s.length - 1; i++) {
      const r = ranks.get(pairKey(s[i], s[i + 1]));
      if (r !== undefined && (best < 0 || r < best)) best = r;
    }
    if (best < 0) return s;
    const m = merges[best];
    s = mergeSyms(s, m.a, m.b, m.id);
  }
}

/** Collect pre-tokens with their frequencies (in order of first appearance). */
export function wordCounts(pieces: string[]): { word: string; n: number }[] {
  const m = new Map<string, number>();
  for (const p of pieces) m.set(p, (m.get(p) ?? 0) + 1);
  return Array.from(m, ([word, n]) => ({ word, n }));
}

/* ═══════════════════ Figure 1: character-level BPE, step by step ═══════════════════ */

export interface CharFrame {
  /** merges learned so far */
  k: number;
  /** vocabulary size after k merges */
  vocab: number;
  /** total tokens in the corpus after k merges */
  tokens: number;
  /** the most frequent pairs right now (the first one is merged next) */
  pairs: { a: string; b: string; count: number }[];
  /** segmentation of every distinct pre-token, as strings */
  seg: string[][];
}

export interface CharBPE {
  /** symbol strings: base characters first, then merged tokens */
  sym: string[];
  baseSize: number;
  merges: Merge[];
  /** distinct pre-tokens in order of first appearance, with counts */
  words: { word: string; n: number }[];
  /** the corpus as a list of indices into `words` */
  order: number[];
  frames: CharFrame[];
}

/** Train character-level BPE on `text`, recording a frame before every merge and one at the end. */
export function charBPE(text: string, maxMerges: number, topK = 6): CharBPE {
  const pieces = pretokenize(text);
  const words = wordCounts(pieces);
  const index = new Map(words.map((w, i) => [w.word, i]));
  const order = pieces.map((p) => index.get(p)!);
  const sym: string[] = [];
  const symId = new Map<string, number>();
  const entries: WordEntry[] = words.map(({ word, n }) => ({
    n,
    syms: Array.from(word).map((ch) => {
      let id = symId.get(ch);
      if (id === undefined) {
        id = sym.length;
        symId.set(ch, id);
        sym.push(ch);
      }
      return id;
    }),
  }));
  const baseSize = sym.length;
  const frames: CharFrame[] = [];
  const snap = (counts: Map<number, number>, k: number) => {
    let tokens = 0;
    entries.forEach((e) => (tokens += e.syms.length * e.n));
    frames.push({
      k,
      vocab: baseSize + k,
      tokens,
      pairs: topPairs(counts, topK)
        .filter((p) => p.count >= 2)
        .map((p) => ({ a: sym[p.a], b: sym[p.b], count: p.count })),
      seg: entries.map((e) => e.syms.map((s) => sym[s])),
    });
  };
  const merges = trainBPE(entries, baseSize, maxMerges, 2, (counts, k) => {
    snap(counts, k);
    // the merge about to happen needs its string ready for the next frame
    const b = bestPair(counts);
    if (b && b.count >= 2) sym.push(sym[b.a] + sym[b.b]);
  });
  // the final state (after the last merge) unless training stopped before another merge was recorded
  if (frames.length === merges.length) snap(countPairs(entries), merges.length);
  return { sym, baseSize, merges, words, order, frames };
}

/* ═══════════════════ Bytes ═══════════════════ */

const enc = new TextEncoder();
export const utf8 = (s: string): number[] => Array.from(enc.encode(s));
export const hex = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');

/** Decode a byte sequence if it is complete UTF-8, else null. */
export function decodeUtf8(bytes: number[]): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

/* ═══════════════════ Byte-level BPE (figures 2 and 3) ═══════════════════ */

export interface ByteBPE {
  merges: Merge[];
  ranks: Map<number, number>;
  /** bytes of every token id (0–255 are the single bytes) */
  bytes: number[][];
}

export function trainByteBPE(text: string, maxMerges: number): ByteBPE {
  const words: WordEntry[] = wordCounts(pretokenize(text)).map(({ word, n }) => ({ syms: utf8(word), n }));
  const merges = trainBPE(words, 256, maxMerges);
  const bytes: number[][] = Array.from({ length: 256 }, (_, i) => [i]);
  for (const m of merges) bytes.push(bytes[m.a].concat(bytes[m.b]));
  return { merges, ranks: rankTable(merges), bytes };
}

/** Restrict a model to its first k merges (a smaller vocabulary of 256 + k). */
export function truncateModel(model: ByteBPE, k: number): ByteBPE {
  const kk = Math.max(0, Math.min(k, model.merges.length));
  return { merges: model.merges.slice(0, kk), ranks: rankTable(model.merges, kk), bytes: model.bytes.slice(0, 256 + kk) };
}

export interface Tok {
  id: number;
  bytes: number[];
  /** the token's text, or null when it is only part of a character */
  text: string | null;
}

export function encodeBytes(text: string, model: ByteBPE): Tok[] {
  const out: Tok[] = [];
  for (const piece of pretokenize(text)) {
    for (const id of encodeSyms(utf8(piece), model.ranks, model.merges)) {
      const bytes = model.bytes[id];
      out.push({ id, bytes, text: decodeUtf8(bytes) });
    }
  }
  return out;
}

/** Number of characters (code points) without the spaces between words. */
export const charCount = (s: string) => Array.from(normalizeSpaces(s).replace(/ /g, '')).length;

/**
 * Total tokens of `texts` with the first k merges, for every k = 0..merges.length.
 * Applying the merges one after another in training order gives exactly the rank-ordered encoding.
 */
export function tokenCurve(model: ByteBPE, texts: string[]): number[] {
  const words = texts.flatMap((t) => pretokenize(t).map(utf8));
  let total = words.reduce((s, w) => s + w.length, 0);
  const out = [total];
  for (const m of model.merges) {
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.length < 2) continue;
      const nw = mergeSyms(w, m.a, m.b, m.id);
      total -= w.length - nw.length;
      words[i] = nw;
    }
    out.push(total);
  }
  return out;
}

/* ═══════════════════ Corpora ═══════════════════ */

export const EN_TEXT = `The library opens at nine in the morning and closes at six in the evening. Most people come in the afternoon, when the reading room is warm and quiet. On the first floor there are new books, newspapers and a small cafe. On the second floor there are old books, maps and a room for students. A student can borrow up to five books for two weeks, and a book can be renewed once if nobody else is waiting for it.
Computers store everything as numbers. A letter is turned into a number, a number is stored as bytes, and a byte is a group of eight bits. When you type a word, the computer does not see the word; it sees a short list of numbers. A program that reads text first has to decide how to cut the text into pieces, and then it turns each piece into a number. The same idea is used by language models, which read text as a list of tokens.
A language model learns to predict the next token. It reads a large amount of text, guesses the next token at every position, and changes its weights a little after every guess. The more text it reads, the better its guesses become. A small model learns the most common patterns first, such as which words often follow each other. A larger model can also learn rarer patterns, such as facts about people, places and events.
In 2019 the city opened a new park next to the river. The park has a long path for walking and running, a small lake and many old trees. On weekends the park is full of families, and in the summer there are concerts in the evening. The path is about 3 kilometers long, and people often walk it twice. In 2021 the city added a bike path, and now many people ride their bikes to work along the river.
Cooking rice is simple once you learn the steps. First, wash the rice two or three times until the water is clear. Then put the rice in a pot with a little more water than rice, and let it rest for twenty minutes. Cook it on high heat until the water boils, then turn the heat down and cook it for another fifteen minutes. Finally, turn off the heat and let the rice rest for ten minutes before you open the pot.
The train to the coast leaves every hour. It is usually on time, but in the winter it is sometimes late because of snow. The trip takes about two hours, and the seats on the left side have a better view of the sea. Many people read or sleep on the train, and some people work on their computers. When the train arrives, it is a short walk from the station to the beach and the old market.
Learning a new language takes time. At first every sentence is hard, and you have to look up many words. After a few months you start to recognize common words and simple patterns, and reading becomes easier. Writing a short letter to a friend every week is a good way to practice, because you have to choose your own words. Listening to the radio or watching movies also helps, even when you do not understand every word.
Good software is tested often. Before a change is released, a team runs many small tests that check one thing at a time, and a few larger tests that check that the parts work together. When a test fails, the team looks at the error, finds the cause and writes a new test so that the same problem does not happen again. Over time the tests become a record of every mistake the team has learned from.`;

export const KO_TEXT = `도서관은 아침 아홉 시에 문을 열고 저녁 여섯 시에 닫습니다. 사람들은 대부분 오후에 오는데, 그때 열람실이 따뜻하고 조용하기 때문입니다. 일 층에는 새로 들어온 책과 신문, 작은 카페가 있습니다. 이 층에는 오래된 책과 지도, 학생들을 위한 공부방이 있습니다. 학생은 책을 다섯 권까지 두 주 동안 빌릴 수 있고, 기다리는 사람이 없으면 한 번 더 연장할 수 있습니다.
컴퓨터는 모든 것을 숫자로 저장합니다. 글자는 숫자로 바뀌고, 숫자는 바이트로 저장되며, 바이트는 비트 여덟 개를 묶은 것입니다. 우리가 단어를 입력해도 컴퓨터는 단어를 보지 않고 짧은 숫자 목록을 봅니다. 글을 읽는 프로그램은 먼저 글을 어떤 조각으로 자를지 정하고, 그다음에 조각마다 번호를 붙입니다. 언어 모델도 같은 생각으로 글을 토큰의 목록으로 읽습니다.
언어 모델은 다음 토큰을 예측하도록 학습합니다. 많은 글을 읽으면서 위치마다 다음 토큰을 맞혀 보고, 맞힐 때마다 가중치를 조금씩 고칩니다. 글을 많이 읽을수록 예측이 좋아집니다. 작은 모델은 어떤 단어 다음에 어떤 단어가 자주 오는지 같은 흔한 패턴부터 배웁니다. 큰 모델은 사람과 장소와 사건에 대한 사실처럼 드문 패턴까지 배울 수 있습니다.
2019년에 시는 강 옆에 새 공원을 열었습니다. 공원에는 걷거나 뛰기 좋은 긴 길과 작은 호수, 오래된 나무가 많습니다. 주말이면 공원은 가족들로 가득하고, 여름에는 저녁마다 음악회가 열립니다. 길은 3킬로미터쯤 되어서 사람들은 두 바퀴씩 걷곤 합니다. 2021년에는 자전거 길이 생겨서 이제 많은 사람이 강을 따라 자전거를 타고 출근합니다.
밥 짓기는 순서만 알면 쉽습니다. 먼저 물이 맑아질 때까지 쌀을 두세 번 씻습니다. 그다음 쌀보다 물을 조금 더 넣어 냄비에 담고 이십 분 동안 불립니다. 물이 끓을 때까지 센 불로 끓이다가 불을 줄여 십오 분 더 익힙니다. 마지막으로 불을 끄고 뚜껑을 열기 전에 십 분 동안 뜸을 들입니다.
바닷가로 가는 기차는 한 시간마다 떠납니다. 기차는 대개 제시간에 오지만 겨울에는 눈 때문에 가끔 늦습니다. 가는 데 두 시간쯤 걸리고, 왼쪽 자리에서 바다가 더 잘 보입니다. 많은 사람이 기차에서 책을 읽거나 잠을 자고, 컴퓨터로 일을 하는 사람도 있습니다. 기차가 도착하면 역에서 바닷가와 오래된 시장까지 조금만 걸으면 됩니다.
새 언어를 배우는 데는 시간이 걸립니다. 처음에는 모든 문장이 어렵고 단어를 많이 찾아봐야 합니다. 몇 달이 지나면 흔한 단어와 간단한 패턴이 눈에 들어오기 시작하고 읽기가 쉬워집니다. 매주 친구에게 짧은 편지를 쓰는 것은 좋은 연습인데, 쓸 단어를 스스로 골라야 하기 때문입니다. 라디오를 듣거나 영화를 보는 것도 모든 단어를 알아듣지 못할 때조차 도움이 됩니다.
좋은 소프트웨어는 자주 시험합니다. 바뀐 코드를 내보내기 전에 팀은 한 번에 한 가지만 확인하는 작은 시험을 많이 돌리고, 부분들이 함께 잘 돌아가는지 확인하는 큰 시험도 몇 개 돌립니다. 시험이 실패하면 팀은 오류를 보고 원인을 찾은 뒤 같은 문제가 다시 생기지 않도록 새 시험을 씁니다. 시간이 지나면 시험은 팀이 배운 모든 실수의 기록이 됩니다.`;

/** Held-out sentence pairs with the same meaning (none of them appears in the corpora). */
export const PAIRS: { ko: string; en: string }[] = [
  { ko: '오늘 아침에 도서관에서 새 책을 두 권 빌렸습니다.', en: 'This morning I borrowed two new books from the library.' },
  { ko: '비가 와서 우리는 집에서 영화를 보기로 했습니다.', en: 'It was raining, so we decided to watch a movie at home.' },
  { ko: '이 모델은 다음에 올 단어를 예측하도록 학습합니다.', en: 'This model learns to predict the next word.' },
  { ko: '커피를 마시면서 친구에게 긴 편지를 썼습니다.', en: 'I wrote a long letter to a friend while drinking coffee.' },
  { ko: '작은 데이터로 시작해서 조금씩 크게 키워 보세요.', en: 'Start with a small data set and make it larger step by step.' },
  { ko: '기차가 늦게 도착해서 회의에 조금 늦었습니다.', en: 'The train arrived late, so I was a little late for the meeting.' },
  { ko: '컴퓨터는 글자를 숫자로 바꾸어 저장합니다.', en: 'Computers store letters by turning them into numbers.' },
  { ko: '주말에는 공원에서 자전거를 타는 사람이 많습니다.', en: 'On weekends many people ride their bikes in the park.' },
];

export type Mix = 'en' | 'half' | 'ko';
/** Korean share of the training bytes for each mix. */
export const MIX_KO_SHARE: Record<Mix, number> = { en: 0.1, half: 0.5, ko: 0.9 };
/** Training budget in bytes, the same for every mix. */
export const TRAIN_BYTES = 3600;
export const MAX_MERGES = 500;

/** The longest prefix of `text` that ends at a word boundary and fits in `bytes` UTF-8 bytes. */
export function prefixBytes(text: string, bytes: number): string {
  const words = normalizeSpaces(text).split(' ');
  let out = '';
  let used = 0;
  for (const w of words) {
    const add = utf8((out ? ' ' : '') + w).length;
    if (used + add > bytes) break;
    out += (out ? ' ' : '') + w;
    used += add;
  }
  return out;
}

export function mixText(mix: Mix): string {
  const ko = MIX_KO_SHARE[mix];
  return prefixBytes(EN_TEXT, Math.round(TRAIN_BYTES * (1 - ko))) + ' ' + prefixBytes(KO_TEXT, Math.round(TRAIN_BYTES * ko));
}

const modelCache = new Map<Mix, ByteBPE>();
/** Byte-level BPE trained on a mix (memoized; a few tens of ms the first time). */
export function mixModel(mix: Mix): ByteBPE {
  let m = modelCache.get(mix);
  if (!m) {
    m = trainByteBPE(mixText(mix), MAX_MERGES);
    modelCache.set(mix, m);
  }
  return m;
}

/* ═══════════════════ Scaling: power laws ═══════════════════ */

/** L(N) = (Nc / N)^α + E */
export const powerLoss = (N: number, Nc: number, alpha: number, E: number) => Math.pow(Nc / N, alpha) + E;

/** Least-squares line through (log x, log y): y ≈ A·x^(−α). */
export function fitPowerLaw(xs: number[], ys: number[]): { A: number; alpha: number; r2: number } {
  const lx = xs.map(Math.log);
  const ly = ys.map(Math.log);
  const n = xs.length;
  const mx = lx.reduce((a, b) => a + b, 0) / n;
  const my = ly.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (lx[i] - mx) * (ly[i] - my);
    sxx += (lx[i] - mx) ** 2;
    syy += (ly[i] - my) ** 2;
  }
  const slope = sxy / sxx;
  return { A: Math.exp(my - slope * mx), alpha: -slope, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 1 };
}

/**
 * Fit y ≈ E + A·x^(−α) with E unknown: try E on a grid below min(y) and keep the one whose
 * log–log line fits best (least squares in log y).
 */
export function fitPowerLawFloor(xs: number[], ys: number[], steps = 400): { A: number; alpha: number; E: number } {
  const ymin = Math.min(...ys);
  let best = { A: 0, alpha: 0, E: 0, err: Infinity };
  for (let s = 0; s < steps; s++) {
    const E = (ymin * s) / steps;
    const f = fitPowerLaw(
      xs,
      ys.map((y) => y - E),
    );
    let err = 0;
    for (let i = 0; i < xs.length; i++) err += (Math.log(ys[i]) - Math.log(E + f.A * Math.pow(xs[i], -f.alpha))) ** 2;
    if (err < best.err) best = { A: f.A, alpha: f.alpha, E, err };
  }
  return { A: best.A, alpha: best.alpha, E: best.E };
}

/* ═══════════════════ Scaling: a toy language with known entropy ═══════════════════ */

/**
 * Toy next-token task. The previous token i (uniform over V) decides the next token j through
 * a fixed "teacher" distribution P(j | i) = softmax(Z[i]). Z is a sum of V rank-one patterns whose
 * strengths fall off as a power of their rank, so a model that can hold r patterns captures the
 * most important r of them. Because P is known, the true entropy H — the irreducible loss — is
 * known exactly, and a model's test loss is computed exactly instead of on a sample.
 */
export const TOY_V = 64;
export const TOY_RANKS = [1, 2, 3, 4, 6, 8, 12, 16];
export const TOY_DATA = [1 << 12, 1 << 14, 1 << 16, 1 << 18, 1 << 20];
export const TOY_STEPS = 400;
export const TOY_VAL = 1 << 14;
const TOY_GAMMA = 1.25;
const TOY_SCALE = 2; // standard deviation of the teacher's logits (roughly)
const TOY_LR = 0.04;

/** parameters of a rank-r model: A (V×r), B (r×V) and a bias (V) */
export const toyParams = (r: number, V = TOY_V) => 2 * V * r + V;

export interface Teacher {
  V: number;
  P: Float64Array[]; // P[i][j]
  cdf: Float64Array[];
  H: number; // mean entropy in nats
}

function orthonormal(n: number, r: () => number): Float64Array[] {
  const Q: Float64Array[] = [];
  for (let i = 0; i < n; i++) {
    const v = Float64Array.from({ length: n }, () => gauss(r));
    for (const q of Q) {
      let d = 0;
      for (let k = 0; k < n; k++) d += v[k] * q[k];
      for (let k = 0; k < n; k++) v[k] -= d * q[k];
    }
    let nn = 0;
    for (let k = 0; k < n; k++) nn += v[k] * v[k];
    nn = Math.sqrt(nn);
    for (let k = 0; k < n; k++) v[k] /= nn;
    Q.push(v);
  }
  return Q;
}

export function makeTeacher(V = TOY_V, seed = 7): Teacher {
  const r = rng(seed);
  const U = orthonormal(V, r);
  const W = orthonormal(V, r);
  const s = Array.from({ length: V }, (_, k) => Math.pow(k + 1, -TOY_GAMMA));
  const ss = Math.sqrt(s.reduce((a, b) => a + b * b, 0));
  const P: Float64Array[] = [];
  const cdf: Float64Array[] = [];
  let H = 0;
  for (let i = 0; i < V; i++) {
    const z = new Float64Array(V);
    for (let j = 0; j < V; j++) {
      let v = 0;
      for (let k = 0; k < V; k++) v += U[k][i] * (s[k] / ss) * W[k][j];
      z[j] = v * TOY_SCALE * V;
    }
    const mx = Math.max(...z);
    let t = 0;
    for (let j = 0; j < V; j++) t += (z[j] = Math.exp(z[j] - mx));
    const c = new Float64Array(V);
    let acc = 0;
    for (let j = 0; j < V; j++) {
      z[j] /= t;
      if (z[j] > 0) H -= z[j] * Math.log(z[j]);
      c[j] = acc += z[j];
    }
    P.push(z);
    cdf.push(c);
  }
  return { V, P, cdf, H: H / V };
}

/** Sample D (previous, next) pairs; returns the count matrix C[i][j]. */
export function sampleCounts(t: Teacher, D: number, seed: number): Float64Array[] {
  const r = rng(seed);
  const V = t.V;
  const C = Array.from({ length: V }, () => new Float64Array(V));
  for (let n = 0; n < D; n++) {
    const i = Math.floor(r() * V);
    const u = r();
    const c = t.cdf[i];
    let lo = 0;
    let hi = V - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (c[m] < u) lo = m + 1;
      else hi = m;
    }
    C[i][lo]++;
  }
  return C;
}

/**
 * One low-rank model being trained by full-batch Adam on the counts of D sampled tokens
 * (each step is one pass over the whole training set). Every 10 steps the loss on a separate
 * validation sample is checked and the exact test loss at the best validation point is kept
 * (early stopping).
 */
export class ToyRun {
  readonly V: number;
  readonly r: number;
  readonly D: number;
  step = 0;
  bestVal = Infinity;
  /** exact test loss (cross-entropy against the teacher) at the best validation point */
  testLoss = Infinity;
  private A: Float64Array;
  private B: Float64Array;
  private b: Float64Array;
  private m: Float64Array[];
  private v: Float64Array[];
  private g: Float64Array[];
  private Q: Float64Array[];
  private rowN: Float64Array;
  private t: Teacher;
  private C: Float64Array[];
  private Cval: Float64Array[];

  constructor(t: Teacher, C: Float64Array[], Cval: Float64Array[], r: number, D: number, seed: number) {
    this.t = t;
    this.C = C;
    this.Cval = Cval;
    this.V = t.V;
    this.r = r;
    this.D = D;
    const rr = rng(seed);
    this.A = Float64Array.from({ length: this.V * r }, () => gauss(rr) * 0.3);
    this.B = Float64Array.from({ length: r * this.V }, () => gauss(rr) * 0.3);
    this.b = new Float64Array(this.V);
    const ps = [this.A, this.B, this.b];
    this.m = ps.map((p) => new Float64Array(p.length));
    this.v = ps.map((p) => new Float64Array(p.length));
    this.g = ps.map((p) => new Float64Array(p.length));
    this.Q = Array.from({ length: this.V }, () => new Float64Array(this.V));
    this.rowN = Float64Array.from(C, (row) => row.reduce((a, x) => a + x, 0));
  }

  get done() {
    return this.step >= TOY_STEPS;
  }

  private forward() {
    const { V, r, A, B, b, Q } = this;
    for (let i = 0; i < V; i++) {
      const q = Q[i];
      let mx = -Infinity;
      for (let j = 0; j < V; j++) {
        let z = b[j];
        for (let k = 0; k < r; k++) z += A[i * r + k] * B[k * V + j];
        q[j] = z;
        if (z > mx) mx = z;
      }
      let s = 0;
      for (let j = 0; j < V; j++) s += (q[j] = Math.exp(q[j] - mx));
      for (let j = 0; j < V; j++) q[j] /= s;
    }
  }

  private exactLoss() {
    let L = 0;
    for (let i = 0; i < this.V; i++) for (let j = 0; j < this.V; j++) L -= this.t.P[i][j] * Math.log(this.Q[i][j]);
    return L / this.V;
  }

  private valLoss() {
    let L = 0;
    let n = 0;
    for (let i = 0; i < this.V; i++)
      for (let j = 0; j < this.V; j++) {
        const c = this.Cval[i][j];
        if (c) {
          L -= c * Math.log(this.Q[i][j]);
          n += c;
        }
      }
    return L / n;
  }

  /** Run up to `n` training steps. */
  run(n: number) {
    const { V, r, A, B, Q, C, rowN, D } = this;
    const [gA, gB, gb] = this.g;
    const dZ = new Float64Array(V);
    for (let it = 0; it < n && !this.done; it++) {
      this.forward();
      if (this.step % 10 === 0) this.check();
      gA.fill(0);
      gB.fill(0);
      gb.fill(0);
      for (let i = 0; i < V; i++) {
        for (let j = 0; j < V; j++) {
          dZ[j] = (Q[i][j] * rowN[i] - C[i][j]) / D;
          gb[j] += dZ[j];
        }
        for (let k = 0; k < r; k++) {
          let s = 0;
          const ak = A[i * r + k];
          for (let j = 0; j < V; j++) {
            s += dZ[j] * B[k * V + j];
            gB[k * V + j] += ak * dZ[j];
          }
          gA[i * r + k] = s;
        }
      }
      this.step++;
      const c1 = 1 - Math.pow(0.9, this.step);
      const c2 = 1 - Math.pow(0.999, this.step);
      [A, B, this.b].forEach((p, pi) => {
        const m = this.m[pi];
        const v = this.v[pi];
        const g = this.g[pi];
        for (let q = 0; q < p.length; q++) {
          m[q] = 0.9 * m[q] + 0.1 * g[q];
          v[q] = 0.999 * v[q] + 0.001 * g[q] * g[q];
          p[q] -= (TOY_LR * (m[q] / c1)) / (Math.sqrt(v[q] / c2) + 1e-8);
        }
      });
    }
    if (this.done) {
      this.forward();
      this.check();
    }
  }

  private check() {
    const vl = this.valLoss();
    if (vl < this.bestVal) {
      this.bestVal = vl;
      this.testLoss = this.exactLoss();
    }
  }
}

/** The whole experiment: every (data, rank) pair, trained one after another. */
export class ToyExperiment {
  readonly teacher: Teacher;
  readonly jobs: { D: number; r: number }[] = [];
  /** results[d][k]: test loss for data TOY_DATA[d] and rank TOY_RANKS[k] (NaN until trained) */
  readonly results: number[][];
  private counts = new Map<number, { C: Float64Array[]; Cval: Float64Array[] }>();
  private cur: ToyRun | null = null;
  next = 0;

  constructor(seed = 7) {
    this.teacher = makeTeacher(TOY_V, seed);
    for (const D of TOY_DATA) for (const r of TOY_RANKS) this.jobs.push({ D, r });
    this.results = TOY_DATA.map(() => TOY_RANKS.map(() => NaN));
  }

  get done() {
    return this.next >= this.jobs.length;
  }

  /** progress in [0, 1], counting finished runs plus the fraction of the current one */
  get progress() {
    const part = this.cur ? this.cur.step / TOY_STEPS : 0;
    return Math.min(1, (this.next + part) / this.jobs.length);
  }

  private data(D: number) {
    let d = this.counts.get(D);
    if (!d) {
      d = { C: sampleCounts(this.teacher, D, 100 + D), Cval: sampleCounts(this.teacher, TOY_VAL, 999 + D) };
      this.counts.set(D, d);
    }
    return d;
  }

  /** Train for about `ms` milliseconds (at least a few steps). Deterministic regardless of timing. */
  advance(ms: number, now: () => number = () => performance.now()) {
    const t0 = now();
    while (!this.done) {
      if (!this.cur) {
        const { D, r } = this.jobs[this.next];
        const { C, Cval } = this.data(D);
        this.cur = new ToyRun(this.teacher, C, Cval, r, D, r * 13 + 1);
      }
      this.cur.run(8);
      if (this.cur.done) {
        const { D, r } = this.jobs[this.next];
        this.results[TOY_DATA.indexOf(D)][TOY_RANKS.indexOf(r)] = this.cur.testLoss;
        this.cur = null;
        this.next++;
      }
      if (now() - t0 >= ms) break;
    }
  }

  /** Run everything at once (used by the verification script). */
  runAll() {
    while (!this.done) this.advance(1e9);
  }
}

/* ═══════════════════ Scaling: splitting a compute budget ═══════════════════ */

/** Training FLOPs ≈ 6 · parameters · tokens. */
export const trainFlops = (N: number, D: number) => 6 * N * D;

export interface LossND {
  E: number;
  A: number;
  B: number;
  alpha: number;
  beta: number;
}

/**
 * Illustrative constants for L(N, D) = E + A/N^α + B/D^β (made up for this lesson, not fitted to
 * any real model). They are chosen so the compute-optimal split lands near 20 tokens per
 * parameter around 10²³–10²⁴ FLOPs.
 */
export const LAW: LossND = { E: 1.7, A: 420, B: 520, alpha: 0.32, beta: 0.29 };

export const lossND = (N: number, D: number, p: LossND = LAW) => p.E + p.A * Math.pow(N, -p.alpha) + p.B * Math.pow(D, -p.beta);

/** Loss of a model of size N trained with the whole budget C (D = C / 6N). */
export const isoLoss = (C: number, N: number, p: LossND = LAW) => lossND(N, C / (6 * N), p);

/** Compute-optimal N for budget C by golden-section search over log N. */
export function optimalN(C: number, p: LossND = LAW): number {
  let lo = Math.log(1e3);
  let hi = Math.log(C / 6 / 1e3); // at least 1,000 tokens
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - g * (hi - lo);
  let x2 = lo + g * (hi - lo);
  let f1 = isoLoss(C, Math.exp(x1), p);
  let f2 = isoLoss(C, Math.exp(x2), p);
  for (let i = 0; i < 120; i++) {
    if (f1 < f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - g * (hi - lo);
      f1 = isoLoss(C, Math.exp(x1), p);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + g * (hi - lo);
      f2 = isoLoss(C, Math.exp(x2), p);
    }
  }
  return Math.exp((lo + hi) / 2);
}

/**
 * Closed form of the same optimum (for checking): setting d/dN of A·N^−α + B·(C/6N)^−β to zero gives
 * α·A·N^−α = β·B·D^−β, so N_opt = G·(C/6)^(β/(α+β)) with G = (αA / βB)^(1/(α+β)).
 */
export function optimalNClosed(C: number, p: LossND = LAW): number {
  const G = Math.pow((p.alpha * p.A) / (p.beta * p.B), 1 / (p.alpha + p.beta));
  return G * Math.pow(C / 6, p.beta / (p.alpha + p.beta));
}
