/*
 * 인증: 비밀번호 너머. Guessing cost, a credential-stuffing simulation, TOTP (RFC 6238)
 * computed with WebCrypto, and an origin-bound passkey challenge-response.
 * No imports, so node can run it directly (Node 18+ has globalThis.crypto.subtle).
 */

/* ───────── guessing ───────── */

export interface Secret {
  id: string;
  label: string;
  /** Number of equally likely choices an attacker must search. */
  space: number;
  note: string;
}

export const SECRETS: Secret[] = [
  { id: 'common', label: '흔한 비밀번호', space: 1e4, note: '유출 사고에서 모은 상위 1만 개 목록 안에 있는 비밀번호' },
  { id: 'rand8', label: '무작위 8자', space: 36 ** 8, note: '소문자와 숫자 36가지에서 무작위로 고른 8자' },
  { id: 'words4', label: '단어 4개', space: 7776 ** 4, note: '단어 7,776개 목록에서 주사위로 고른 단어 4개' },
  { id: 'rand12', label: '무작위 12자', space: 62 ** 12, note: '대소문자와 숫자 62가지에서 무작위로 고른 12자' },
  { id: 'words6', label: '단어 6개', space: 7776 ** 6, note: '단어 7,776개 목록에서 주사위로 고른 단어 6개' },
];

export interface Setting {
  id: string;
  label: string;
  /** Guesses per second. */
  rate: number;
  note: string;
}

/** Offline rates match the 네트워크 보안 lesson (order-of-magnitude assumptions, not benchmarks). */
export const SETTINGS: Setting[] = [
  { id: 'online', label: '온라인 (계정마다 분당 10번)', rate: 10 / 60, note: '로그인 화면에 하나씩 넣어 보기' },
  { id: 'slow', label: '오프라인, 느린 해시', rate: 1e4, note: '유출된 Argon2·bcrypt 해시를 그래픽 카드로' },
  { id: 'fast', label: '오프라인, 빠른 해시', rate: 1e10, note: '유출된 SHA-256 해시를 그래픽 카드로' },
];

export const bits = (space: number) => Math.log2(space);
/** Expected time to find a uniformly chosen secret: half the space. */
export const avgSeconds = (space: number, rate: number) => space / 2 / rate;

/* ───────── credential stuffing ───────── */

/** Small seeded PRNG (mulberry32), the same family the site's lib/math uses. */
export function rng(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type StuffOutcome = 'none' | 'differ' | 'mfa' | 'in';

export interface StuffResult {
  outcomes: StuffOutcome[];
  tried: number;
  inCount: number;
  mfaCount: number;
  differCount: number;
  noneCount: number;
  /** Attempts per IP address and whether a per-IP limit would have stopped any of them. */
  perIp: number;
  blockedByIpLimit: number;
}

/**
 * A forum's leaked (email, password) list of `n` users is tried once each against the library.
 * Each leaked user has a library account with probability `hasAccount`, reuses the same password
 * with probability `reuse`, and has turned on MFA with probability `mfa`. The attacker spreads the
 * attempts over `ips` addresses, so a per-IP limit of `ipLimit` attempts rarely triggers.
 */
export function stuffing(n: number, hasAccount: number, reuse: number, mfa: number, ips: number, ipLimit: number, seed: number): StuffResult {
  const r = rng(seed);
  const outcomes: StuffOutcome[] = [];
  for (let i = 0; i < n; i++) {
    const acct = r() < hasAccount;
    const same = r() < reuse;
    const two = r() < mfa;
    outcomes.push(!acct ? 'none' : !same ? 'differ' : two ? 'mfa' : 'in');
  }
  const perIp = Math.ceil(n / ips);
  const blockedByIpLimit = Math.max(0, perIp - ipLimit) * ips;
  const count = (k: StuffOutcome) => outcomes.filter((o) => o === k).length;
  return { outcomes, tried: n, inCount: count('in'), mfaCount: count('mfa'), differCount: count('differ'), noneCount: count('none'), perIp, blockedByIpLimit };
}

/* ───────── TOTP (RFC 6238 over RFC 4226 HOTP) ───────── */

export const utf8 = (s: string) => new TextEncoder().encode(s);
/** WebCrypto takes BufferSource; TypeScript's Uint8Array<ArrayBufferLike> needs this nudge. */
const buf = (b: Uint8Array) => b as unknown as BufferSource;
export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** The 8-byte big-endian counter for time step T = floor(t / 30). */
export function counterBytes(step: number): Uint8Array {
  const b = new Uint8Array(8);
  let v = step;
  for (let i = 7; i >= 0; i--) {
    b[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return b;
}

export interface TotpSteps {
  step: number;
  counter: Uint8Array;
  mac: Uint8Array;
  offset: number;
  /** The four bytes picked by dynamic truncation, before masking. */
  picked: Uint8Array;
  value: number;
  code: string;
}

export async function hmacSha1(key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', buf(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, buf(msg)));
}

export async function totp(secret: Uint8Array, unixSeconds: number, digits = 6, period = 30): Promise<TotpSteps> {
  const step = Math.floor(unixSeconds / period);
  const counter = counterBytes(step);
  const mac = await hmacSha1(secret, counter);
  const offset = mac[mac.length - 1] & 0x0f;
  const picked = mac.slice(offset, offset + 4);
  const value = ((picked[0] & 0x7f) << 24) | (picked[1] << 16) | (picked[2] << 8) | picked[3];
  const code = String(value % 10 ** digits).padStart(digits, '0');
  return { step, counter, mac, offset, picked, value, code };
}

/** RFC 6238 Appendix B test vector for SHA-1. */
export const RFC_SECRET = '12345678901234567890';
export const RFC_T = 59;
export const RFC_CODE8 = '94287082';

/* ───────── passkeys: an origin-bound challenge–response ───────── */

export interface ClientData {
  type: 'webauthn.get';
  challenge: string;
  origin: string;
}

export interface Assertion {
  clientData: ClientData;
  clientDataJSON: string;
  signature: Uint8Array;
}

export interface Verdict {
  signatureOk: boolean;
  challengeOk: boolean;
  originOk: boolean;
  accepted: boolean;
}

export async function makeKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
}

/** What the browser signs: the challenge together with the origin the page really came from. */
export async function sign(priv: CryptoKey, challenge: string, origin: string): Promise<Assertion> {
  const clientData: ClientData = { type: 'webauthn.get', challenge, origin };
  const clientDataJSON = JSON.stringify(clientData);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, buf(utf8(clientDataJSON))));
  return { clientData, clientDataJSON, signature: sig };
}

/** The real site checks the signature, that the challenge is the one it issued, and that the origin is its own. */
export async function verify(pub: CryptoKey, a: Assertion, expectedChallenge: string, expectedOrigin: string): Promise<Verdict> {
  const signatureOk = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, buf(a.signature), buf(utf8(a.clientDataJSON)));
  const challengeOk = a.clientData.challenge === expectedChallenge;
  const originOk = a.clientData.origin === expectedOrigin;
  return { signatureOk, challengeOk, originOk, accepted: signatureOk && challengeOk && originOk };
}

export const REAL_ORIGIN = 'https://library.example';
export const FAKE_ORIGIN = 'https://library-login.example';
