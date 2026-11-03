/** Pure logic for the 암호의 기초 lessons: XOR, a toy block cipher, HMAC, birthday search, toy RSA, certificate chains. */
import { rng } from '../../../../lib/math';
import { sha256, utf8 } from '../../shared';

/* ───────── bytes ───────── */

export const xorBytes = (a: Uint8Array, b: Uint8Array) => Uint8Array.from({ length: Math.min(a.length, b.length) }, (_, i) => a[i] ^ b[i]);

/** Deterministic "random" bytes for figures (not a secure source). */
export function seededBytes(n: number, seed: number): Uint8Array {
  const r = rng(seed);
  return Uint8Array.from({ length: n }, () => Math.floor(r() * 256));
}

export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0'));

/** ASCII only, so one character is one byte (figures restrict input to it). */
export const asciiBytes = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0x7f);
export const printable = (b: number) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·');
export const isLetter = (b: number) => (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a);

/* ───────── a toy 16-bit block cipher ───────── */

/**
 * A 4-round Feistel network on 16-bit blocks whose round functions are byte tables drawn from SHA-256 of the key.
 * It is a keyed permutation like AES, but with 65,536 possible blocks it is a TOY: anyone could tabulate it.
 */
export interface ToyCipher {
  enc: (x: number) => number;
  dec: (y: number) => number;
}

export function toyCipher(key: string): ToyCipher {
  const tables = Array.from({ length: 4 }, (_, r) => {
    const t = new Uint8Array(256);
    for (let j = 0; j < 8; j++) t.set(sha256(utf8(`${key}/round${r}/${j}`)), j * 32);
    return t;
  });
  const enc = (x: number) => {
    let L = (x >> 8) & 255;
    let R = x & 255;
    for (const t of tables) [L, R] = [R, L ^ t[R]];
    return (L << 8) | R;
  };
  const dec = (y: number) => {
    let L = (y >> 8) & 255;
    let R = y & 255;
    for (let r = tables.length - 1; r >= 0; r--) [L, R] = [R ^ tables[r][L], L];
    return (L << 8) | R;
  };
  return { enc, dec };
}

export type Mode = 'ecb' | 'cbc' | 'ctr';
export const IMG_W = 48;
export const IMG_H = 32;
/** Four 4-bit pixels make one 16-bit block. */
export const PX_PER_BLOCK = 4;

const toBlocks = (px: number[]) => {
  const out: number[] = [];
  for (let i = 0; i < px.length; i += PX_PER_BLOCK) out.push(((px[i] & 15) << 12) | ((px[i + 1] & 15) << 8) | ((px[i + 2] & 15) << 4) | (px[i + 3] & 15));
  return out;
};
const fromBlocks = (bl: number[]) => bl.flatMap((b) => [(b >> 12) & 15, (b >> 8) & 15, (b >> 4) & 15, b & 15]);

/** Encrypt an image of 4-bit pixels, left to right, top to bottom. `iv` is the CBC IV or the CTR starting counter. */
export function encryptPixels(px: number[], mode: Mode, c: ToyCipher, iv: number): number[] {
  const p = toBlocks(px);
  let prev = iv & 0xffff;
  const out = p.map((b, i) => {
    if (mode === 'ecb') return c.enc(b);
    if (mode === 'cbc') return (prev = c.enc(b ^ prev));
    return b ^ c.enc((iv + i) & 0xffff); // CTR: the cipher only ever encrypts the counter
  });
  return fromBlocks(out);
}

export const blocksOf = toBlocks;

/* pixel-art pictures (0 = darkest, 15 = lightest) */
export type Picture = 'lock' | 'face' | 'blank';

export function picture(kind: Picture): number[] {
  const px: number[] = [];
  for (let y = 0; y < IMG_H; y++)
    for (let x = 0; x < IMG_W; x++) {
      let v = 14;
      if (kind === 'lock') {
        const inBody = x >= 12 && x < 36 && y >= 14 && y < 30;
        const dx = x - 23.5;
        const dy = y - 14;
        const r = Math.hypot(dx, dy);
        const inShackle = y < 15 && r >= 6.5 && r <= 10.5;
        const keyhole = (Math.hypot(x - 23.5, y - 20) < 2.6 || (Math.abs(x - 23.5) < 1.2 && y >= 20 && y < 26)) && inBody;
        if (inShackle) v = 5;
        if (inBody) v = 3;
        if (keyhole) v = 14;
      } else if (kind === 'face') {
        const r = Math.hypot(x - 23.5, y - 15.5);
        if (r < 14) v = 9;
        if (r >= 13 && r < 14.5) v = 2;
        if (Math.hypot(x - 18, y - 11) < 2.3 || Math.hypot(x - 29, y - 11) < 2.3) v = 1;
        const my = y - 16;
        if (my > 2 && my < 6 && Math.abs(Math.hypot(x - 23.5, y - 13) - 8) < 1.1) v = 1;
      }
      px.push(v);
    }
  return px;
}

/* ───────── HMAC and truncated-hash collisions ───────── */

export function hmacSha256(key: Uint8Array, msg: Uint8Array): Uint8Array {
  let k = key.length > 64 ? sha256(key) : key;
  const kk = new Uint8Array(64);
  kk.set(k);
  k = kk;
  const ipad = k.map((b) => b ^ 0x36);
  const opad = k.map((b) => b ^ 0x5c);
  const inner = new Uint8Array(64 + msg.length);
  inner.set(ipad);
  inner.set(msg, 64);
  const ih = sha256(inner);
  const outer = new Uint8Array(64 + 32);
  outer.set(opad);
  outer.set(ih, 64);
  return sha256(outer);
}

/** The first k bits (k ≤ 32) of SHA-256 as a number. */
export function truncHash(s: string, k: number): number {
  const h = sha256(utf8(s));
  const top = ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0;
  return k >= 32 ? top : top >>> (32 - k);
}

/** Hash "trial-<t>:<i>" for i = 0, 1, … until two inputs share their first k bits. */
export function birthdaySearch(k: number, trial: number): { attempts: number; a: string; b: string; value: number } {
  const seen = new Map<number, string>();
  for (let i = 0; ; i++) {
    const s = `trial-${trial}:${i}`;
    const v = truncHash(s, k);
    const prev = seen.get(v);
    if (prev !== undefined) return { attempts: i + 1, a: prev, b: s, value: v };
    seen.set(v, s);
  }
}

/** Expected number of random k-bit values drawn before the first repeat: about √(π/2 · 2ᵏ). */
export const birthdayExpected = (k: number) => Math.sqrt((Math.PI / 2) * 2 ** k);

/* ───────── RSA with small numbers ───────── */

export function modPow(b: bigint, e: bigint, m: bigint): bigint {
  let r = 1n;
  b %= m;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}

export function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

export function modInv(a: bigint, m: bigint): bigint | null {
  let [r0, r1] = [a % m, m];
  let [s0, s1] = [1n, 0n];
  while (r1) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  if (r0 !== 1n) return null;
  return ((s0 % m) + m) % m;
}

export const SMALL_PRIMES = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
export const E_CHOICES = [3, 5, 7, 11, 13, 17, 65537];

export interface RsaKey {
  p: bigint;
  q: bigint;
  n: bigint;
  phi: bigint;
  e: bigint;
  d: bigint;
}

export function rsaKey(p: number | bigint, q: number | bigint, e: number | bigint): RsaKey | null {
  const P = BigInt(p);
  const Q = BigInt(q);
  const E = BigInt(e);
  if (P === Q) return null;
  const phi = (P - 1n) * (Q - 1n);
  const d = modInv(E % phi, phi);
  if (d === null || gcd(E, phi) !== 1n) return null;
  return { p: P, q: Q, n: P * Q, phi, e: E, d };
}

/** Trial division by 2, 3, 5, 7, 9, … until a factor shows up: the number of divisions tried. */
export function trialDivide(n: bigint): { factor: bigint; tries: number } {
  if (n % 2n === 0n) return { factor: 2n, tries: 1 };
  let tries = 1;
  for (let f = 3n; f * f <= n; f += 2n) {
    tries++;
    if (n % f === 0n) return { factor: f, tries };
  }
  return { factor: n, tries };
}

/* toy signing keys: two ~31-bit primes, so n is about 62 bits (real RSA uses 2048 bits or more) */
const KEY_PRIMES: Record<string, [bigint, bigint]> = {
  alice: [2147480009n, 2147470007n],
  mallory: [2147460013n, 2147450027n],
  root: [2147440027n, 2147430001n],
  issuing: [2147420017n, 2147410007n],
  server: [2147400001n, 2147390107n],
  rogueRoot: [2147380033n, 2147370013n],
};
export type KeyName = keyof typeof KEY_PRIMES;
export const toyKey = (name: KeyName): RsaKey => rsaKey(KEY_PRIMES[name][0], KEY_PRIMES[name][1], 65537)!;

/** The number a toy signature signs: the first 8 bytes of SHA-256, reduced mod n. */
export function digestNum(msg: string, n: bigint): bigint {
  const h = sha256(utf8(msg));
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(h[i]);
  return v % n;
}
export const sign = (msg: string, k: RsaKey) => modPow(digestNum(msg, k.n), k.d, k.n);
export const verify = (msg: string, sig: bigint, pub: { n: bigint; e: bigint }) => modPow(sig, pub.e, pub.n) === digestNum(msg, pub.n);

/* ───────── certificate chains ───────── */

export interface Cert {
  subject: string;
  issuer: string;
  san: string[];
  notBefore: string;
  notAfter: string;
  ca: boolean;
  pub: { n: bigint; e: bigint };
  sig: bigint;
}

/** The fields a certificate's signature covers ("to be signed"). */
export const tbs = (c: Omit<Cert, 'sig'>) => JSON.stringify([c.subject, c.issuer, c.san, c.notBefore, c.notAfter, c.ca, c.pub.n.toString(), c.pub.e.toString()]);

function issue(fields: Omit<Cert, 'sig' | 'pub'>, subjectKey: RsaKey, issuerKey: RsaKey): Cert {
  const c = { ...fields, pub: { n: subjectKey.n, e: subjectKey.e } };
  return { ...c, sig: sign(tbs(c), issuerKey) };
}

export const TODAY = '2026-11-03';
export const HOST = 'www.example.com';
export const ROOT_NAME = 'Example Root CA';
export const ISSUING_NAME = 'Example Issuing CA';

export type Scenario = 'ok' | 'expired' | 'wrongName' | 'unknownRoot' | 'selfSigned' | 'tampered' | 'missingIntermediate';
export const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: 'ok', label: '정상' },
  { value: 'expired', label: '기간 만료' },
  { value: 'wrongName', label: '이름 불일치' },
  { value: 'tampered', label: '내용 변조' },
  { value: 'selfSigned', label: '자체 서명' },
  { value: 'unknownRoot', label: '모르는 루트' },
  { value: 'missingIntermediate', label: '중간 인증서 빠짐' },
];

export interface ChainSetup {
  /** What the server sends: leaf first, then intermediates. */
  sent: Cert[];
  /** Roots the browser already trusts. */
  store: Cert[];
  /** A field the attacker changed after signing, to highlight. */
  tamperedField?: keyof Cert;
}

export function chainFor(s: Scenario): ChainSetup {
  const root = toyKey('root');
  const issuing = toyKey('issuing');
  const server = toyKey('server');
  const rootCert = issue({ subject: ROOT_NAME, issuer: ROOT_NAME, san: [], notBefore: '2015-01-01', notAfter: '2040-01-01', ca: true }, root, root);
  const issuingCert = issue({ subject: ISSUING_NAME, issuer: ROOT_NAME, san: [], notBefore: '2024-03-01', notAfter: '2029-03-01', ca: true }, issuing, root);
  const leafFields = { subject: HOST, issuer: ISSUING_NAME, san: [HOST, 'example.com'], notBefore: '2026-09-15', notAfter: '2026-12-14', ca: false };
  const leaf = issue(leafFields, server, issuing);
  const store = [rootCert];
  switch (s) {
    case 'expired':
      return { sent: [issue({ ...leafFields, notBefore: '2026-06-01', notAfter: '2026-08-30' }, server, issuing), issuingCert], store };
    case 'wrongName':
      return { sent: [issue({ ...leafFields, subject: 'shop.example.net', san: ['shop.example.net'] }, server, issuing), issuingCert], store };
    case 'tampered':
      // signed for one name, then the name was edited afterwards
      return { sent: [{ ...issue({ ...leafFields, subject: 'www.example.org', san: ['www.example.org'] }, toyKey('mallory'), issuing), subject: HOST, san: [HOST] }, issuingCert], store, tamperedField: 'san' };
    case 'selfSigned': {
      const m = toyKey('mallory');
      return { sent: [issue({ ...leafFields, issuer: HOST }, m, m)], store };
    }
    case 'unknownRoot': {
      // a root of the attacker's own making: its chain is internally consistent but ends outside the store
      const rr = toyKey('rogueRoot');
      const rogue = issue({ subject: 'Unknown Root CA', issuer: 'Unknown Root CA', san: [], notBefore: '2026-01-01', notAfter: '2036-01-01', ca: true }, rr, rr);
      return { sent: [issue({ ...leafFields, issuer: 'Unknown Root CA' }, toyKey('mallory'), rr), rogue], store };
    }
    case 'missingIntermediate':
      return { sent: [leaf], store };
    default:
      return { sent: [leaf, issuingCert], store };
  }
}

export type CheckKind = 'name' | 'date' | 'sig' | 'ca' | 'anchor';
export interface Check {
  kind: CheckKind;
  /** Which certificate: index in the built chain (0 = leaf). */
  at: number;
  ok: boolean;
  title: string;
  detail: string;
}

/** Walk from the leaf up to a trusted root, the way a browser does, stopping at the first failure. */
export function verifyChain(setup: ChainSetup, host = HOST, today = TODAY): { chain: Cert[]; checks: Check[]; ok: boolean } {
  const checks: Check[] = [];
  const chain: Cert[] = [setup.sent[0]];
  const push = (c: Check) => {
    checks.push(c);
    return c.ok;
  };
  const leaf = setup.sent[0];
  if (!push({ kind: 'name', at: 0, ok: leaf.san.includes(host), title: '이름 확인', detail: leaf.san.includes(host) ? `주소창의 ${host}가 인증서의 이름 목록(SAN)에 있습니다.` : `주소창은 ${host}인데 인증서의 이름 목록(SAN)에는 ${leaf.san.join(', ')}만 있습니다.` })) return { chain, checks, ok: false };
  for (let i = 0; ; i++) {
    const c = chain[i];
    const inDate = c.notBefore <= today && today <= c.notAfter;
    if (!push({ kind: 'date', at: i, ok: inDate, title: '유효 기간', detail: inDate ? `오늘(${today})이 ${c.notBefore} ~ ${c.notAfter} 안에 있습니다.` : `유효 기간 ${c.notBefore} ~ ${c.notAfter}이 오늘(${today})을 벗어났습니다.` })) return { chain, checks, ok: false };
    if (i > 0 && !push({ kind: 'ca', at: i, ok: c.ca, title: 'CA 권한', detail: c.ca ? `${c.subject}는 다른 인증서에 서명해도 되는 CA 인증서입니다.` : `${c.subject}는 CA가 아니어서 다른 인증서에 서명할 수 없습니다.` })) return { chain, checks, ok: false };
    // the trust anchor: the store holds this certificate itself
    const anchor = setup.store.find((r) => r.subject === c.subject && r.pub.n === c.pub.n);
    if (anchor) {
      push({ kind: 'anchor', at: i, ok: true, title: '신뢰 저장소', detail: `${c.subject}는 브라우저와 운영체제에 미리 들어 있는 루트 인증서입니다. 여기서 확인을 마칩니다.` });
      return { chain, checks, ok: true };
    }
    if (c.issuer === c.subject) {
      push({ kind: 'anchor', at: i, ok: false, title: '신뢰 저장소', detail: `${c.subject}는 스스로 서명했지만 신뢰 저장소에 없는 인증서입니다. 누구나 이런 인증서를 만들 수 있습니다.` });
      return { chain, checks, ok: false };
    }
    const issuer = [...setup.sent, ...setup.store].find((x) => x.subject === c.issuer);
    if (!issuer) {
      const known = setup.store.length ? setup.store.map((r) => r.subject).join(', ') : '없음';
      push({ kind: 'anchor', at: i, ok: false, title: '발급자 찾기', detail: `${c.subject}에 서명한 "${c.issuer}"의 인증서를 받지 못했고, 신뢰 저장소(${known})에도 없습니다.` });
      return { chain, checks, ok: false };
    }
    const sigOk = verify(tbs(c), c.sig, issuer.pub);
    if (!push({ kind: 'sig', at: i, ok: sigOk, title: '서명 확인', detail: sigOk ? `${c.issuer}의 공개 키로 ${c.subject} 인증서의 서명을 풀면, 인증서 내용의 해시와 같습니다.` : `${c.issuer}의 공개 키로 서명을 풀었더니 인증서 내용의 해시와 다릅니다. 서명한 뒤 내용이 바뀌었거나 다른 열쇠로 서명했습니다.` })) return { chain, checks, ok: false };
    chain.push(issuer);
  }
}

/** Chrome's error code for a failed check, where one is well known. */
export function browserError(failed: Check | undefined): string | null {
  if (!failed) return null;
  if (failed.kind === 'date') return 'NET::ERR_CERT_DATE_INVALID';
  if (failed.kind === 'name') return 'NET::ERR_CERT_COMMON_NAME_INVALID';
  if (failed.kind === 'anchor') return 'NET::ERR_CERT_AUTHORITY_INVALID';
  return null;
}
