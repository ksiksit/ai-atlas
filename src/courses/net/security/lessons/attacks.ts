/* Pure models for 공격과 방어: SYN flood, amplification, token bucket, same-origin/cookies, injection, password storage. */

import { rng } from '../../../../lib/math';

/* ─────────────── SYN flood against a fixed backlog ─────────────── */

export const SYN_DT = 0.1; // seconds per tick
export const SYN_SECONDS = 60;
export const SYN_ATTACK_FROM = 10;
export const SYN_ATTACK_TO = 45;
export const SYN_HOLD = 30; // seconds a half-open entry waits for the final ACK (an assumption for the figure)
export const SYN_LEGIT_RATE = 20; // legitimate connection attempts per second
export const SYN_BYTES = 60; // a SYN on the wire, roughly (IP + TCP headers with options)

export interface SynSecond {
  t: number;
  halfOpen: number; // backlog entries at the end of this second
  legitTried: number;
  legitOk: number;
}

/** Poisson-ish count for one tick: mean m, deterministic given the generator. */
function count(m: number, r: () => number): number {
  const whole = Math.floor(m);
  return whole + (r() < m - whole ? 1 : 0);
}

/**
 * Seconds of a server under SYN flood. Spoofed SYNs never complete and hold a backlog
 * slot for SYN_HOLD seconds; a legitimate handshake holds one for a single tick. With
 * SYN cookies the server keeps no state once the backlog is full, so legitimate clients
 * still get through.
 */
export function synFlood(attackRate: number, backlog: number, cookies: boolean, seed = 3): SynSecond[] {
  const r = rng(seed);
  const expiry: number[] = []; // tick at which each spoofed entry leaves the backlog (sorted, FIFO)
  let head = 0;
  const out: SynSecond[] = [];
  const ticksPerSec = Math.round(1 / SYN_DT);
  const holdTicks = Math.round(SYN_HOLD / SYN_DT);
  let tried = 0;
  let ok = 0;
  for (let k = 0; k < SYN_SECONDS * ticksPerSec; k++) {
    const t = k * SYN_DT;
    while (head < expiry.length && expiry[head] <= k) head++;
    const attacking = t >= SYN_ATTACK_FROM && t < SYN_ATTACK_TO;
    const nAtk = attacking ? count(attackRate * SYN_DT, r) : 0;
    const nLeg = count(SYN_LEGIT_RATE * SYN_DT, r);
    // interleave the tick's arrivals in random order
    const arrivals: boolean[] = [...Array(nAtk).fill(true), ...Array(nLeg).fill(false)];
    for (let i = arrivals.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arrivals[i], arrivals[j]] = [arrivals[j], arrivals[i]];
    }
    let legitThisTick = 0; // legit entries live for this tick only
    for (const spoofed of arrivals) {
      const used = expiry.length - head + legitThisTick;
      const full = used >= backlog;
      if (spoofed) {
        if (!full) expiry.push(k + holdTicks);
        // when full: dropped, or answered with a cookie and forgotten; either way no state
      } else {
        tried++;
        if (!full) {
          legitThisTick++;
          ok++;
        } else if (cookies) ok++; // the cookie comes back in the ACK and the server rebuilds the connection
      }
    }
    if ((k + 1) % ticksPerSec === 0) {
      out.push({ t: Math.round(t + SYN_DT), halfOpen: expiry.length - head, legitTried: tried, legitOk: ok });
      tried = 0;
      ok = 0;
    }
  }
  return out;
}

/** Share of legitimate attempts that succeeded while the attack ran. */
export function synSuccessDuringAttack(series: SynSecond[]): number {
  let tried = 0;
  let ok = 0;
  for (const s of series) {
    if (s.t > SYN_ATTACK_FROM + 5 && s.t <= SYN_ATTACK_TO) {
      tried += s.legitTried;
      ok += s.legitOk;
    }
  }
  return tried ? ok / tried : 1;
}

/* ─────────────── Reflection and amplification ─────────────── */

export interface Amplifier {
  id: string;
  name: string;
  port: string;
  /** Reported bandwidth amplification factor range (US-CERT TA14-017A); `hi` is used in the figure. */
  lo: number;
  hi: number;
  what: string;
}

export const AMPLIFIERS: Amplifier[] = [
  { id: 'dns', name: 'DNS', port: 'UDP 53', lo: 28, hi: 54, what: '열린 리졸버에 큰 응답을 돌려주는 질의' },
  { id: 'ssdp', name: 'SSDP', port: 'UDP 1900', lo: 30.8, hi: 30.8, what: '공유기·가전의 장치 찾기 응답' },
  { id: 'chargen', name: 'CharGEN', port: 'UDP 19', lo: 358.8, hi: 358.8, what: '옛 시험용 문자 생성 서비스' },
  { id: 'ntp', name: 'NTP', port: 'UDP 123', lo: 556.9, hi: 556.9, what: '시간 서버의 monlist 명령(최근 접속 목록)' },
  { id: 'memcached', name: 'Memcached', port: 'UDP 11211', lo: 10000, hi: 51000, what: '인터넷에 열려 있던 캐시 서버' },
];

/** Bits per second arriving at the victim when the attacker spends `uplinkBps` on spoofed requests. */
export const reflected = (uplinkBps: number, factor: number) => uplinkBps * factor;

/* ─────────────── Token bucket ─────────────── */

export const TB_SECONDS = 60;
export const TB_DT = 0.05;
export const TB_ABUSE_FROM = 30;
export const TB_ABUSE_TO = 45;
export const TB_ABUSE_RATE = 40; // requests per second from a misbehaving script

export interface TbSecond {
  t: number;
  ok: number;
  dropped: number;
  abuse: boolean;
  level: number; // tokens left at the end of the second
}

/**
 * One client's requests through a token bucket of `capacity` tokens refilled at `rate` per
 * second. The client is a person browsing (a page load = a burst of 4–12 requests every few
 * seconds) and, between TB_ABUSE_FROM and TB_ABUSE_TO, also a script hammering at TB_ABUSE_RATE.
 */
export function tokenBucket(capacity: number, rate: number, seed = 11): TbSecond[] {
  const r = rng(seed);
  // build the arrival times first so they do not depend on the limiter
  const times: { t: number; abuse: boolean }[] = [];
  for (let t = 0.5; t < TB_SECONDS; t += 2 + r() * 5) {
    const burst = 4 + Math.floor(r() * 9);
    for (let i = 0; i < burst; i++) times.push({ t: t + i * 0.03 + r() * 0.02, abuse: false });
  }
  for (let t = TB_ABUSE_FROM; t < TB_ABUSE_TO; t += 1 / TB_ABUSE_RATE) times.push({ t, abuse: true });
  times.sort((a, b) => a.t - b.t);

  const out: TbSecond[] = Array.from({ length: TB_SECONDS }, (_, i) => ({ t: i, ok: 0, dropped: 0, abuse: i >= TB_ABUSE_FROM && i < TB_ABUSE_TO, level: 0 }));
  let tokens = capacity;
  let last = 0;
  let j = 0;
  for (let s = 0; s < TB_SECONDS; s++) {
    while (j < times.length && times[j].t < s + 1) {
      const a = times[j++];
      tokens = Math.min(capacity, tokens + (a.t - last) * rate);
      last = a.t;
      if (tokens >= 1) {
        tokens -= 1;
        out[s].ok++;
      } else out[s].dropped++;
    }
    tokens = Math.min(capacity, tokens + (s + 1 - last) * rate);
    last = s + 1;
    out[s].level = tokens;
  }
  return out;
}

export function tbSummary(series: TbSecond[]) {
  const sum = (f: (s: TbSecond) => boolean, k: 'ok' | 'dropped') => series.filter(f).reduce((a, s) => a + s[k], 0);
  const calm = (s: TbSecond) => !s.abuse;
  const abuse = (s: TbSecond) => s.abuse;
  const calmOk = sum(calm, 'ok');
  const calmDrop = sum(calm, 'dropped');
  const abOk = sum(abuse, 'ok');
  const abDrop = sum(abuse, 'dropped');
  return { calmOk, calmDrop, abOk, abDrop, calmDropRate: calmDrop / Math.max(1, calmOk + calmDrop), abDropRate: abDrop / Math.max(1, abOk + abDrop) };
}

/* ─────────────── Origins and SameSite ─────────────── */

export interface Origin {
  ok: boolean;
  scheme: string;
  host: string;
  port: string;
  portShown: boolean; // false when the port is the scheme's default
}

const DEFAULT_PORT: Record<string, string> = { 'http:': '80', 'https:': '443' };

export function originOf(text: string): Origin {
  try {
    const u = new URL(text.trim());
    const scheme = u.protocol;
    const port = u.port || DEFAULT_PORT[scheme] || '';
    return { ok: scheme === 'http:' || scheme === 'https:', scheme: scheme.replace(':', ''), host: u.hostname.toLowerCase(), port, portShown: !!u.port };
  } catch {
    return { ok: false, scheme: '', host: '', port: '', portShown: false };
  }
}

/** The registrable domain ("site") for hosts in this figure: the last two labels (every TLD here is a public suffix). */
export const siteOf = (host: string) => host.split('.').slice(-2).join('.');

export type SameSite = 'None' | 'Lax' | 'Strict';
export type ReqKind = 'link' | 'form-post' | 'img' | 'fetch-post';

export const REQ_KINDS: { value: ReqKind; label: string; method: string; topLevel: boolean }[] = [
  { value: 'link', label: '링크 이동 (GET)', method: 'GET', topLevel: true },
  { value: 'form-post', label: '폼 자동 제출 (POST)', method: 'POST', topLevel: true },
  { value: 'img', label: '<img> (GET)', method: 'GET', topLevel: false },
  { value: 'fetch-post', label: 'fetch (POST)', method: 'POST', topLevel: false },
];

/**
 * Whether the browser attaches the bank's cookie to a request started by a page on `fromHost`.
 * Same-site requests always carry it; cross-site ones depend on SameSite: Strict never,
 * Lax only for top-level navigations with a safe method (GET), None always.
 */
export function cookieSent(fromHost: string, toHost: string, kind: ReqKind, sameSite: SameSite): { sent: boolean; why: string } {
  const req = REQ_KINDS.find((k) => k.value === kind)!;
  if (siteOf(fromHost) === siteOf(toHost)) return { sent: true, why: `요청을 시작한 페이지(${fromHost})와 목적지가 같은 사이트(${siteOf(toHost)})이므로 SameSite 값과 상관없이 쿠키가 붙습니다.` };
  if (sameSite === 'None') return { sent: true, why: 'SameSite=None 쿠키는 다른 사이트에서 시작한 모든 요청에 붙습니다(Secure 속성이 함께 있어야 합니다).' };
  if (sameSite === 'Strict') return { sent: false, why: 'SameSite=Strict 쿠키는 다른 사이트에서 시작한 요청에는 링크 이동이라도 붙지 않습니다.' };
  if (req.topLevel && req.method === 'GET') return { sent: true, why: 'SameSite=Lax 쿠키는 다른 사이트에서 왔더라도 주소창이 바뀌는 최상위 이동이면서 GET일 때는 붙습니다.' };
  return { sent: false, why: `SameSite=Lax 쿠키는 다른 사이트에서 시작한 ${req.topLevel ? 'POST 이동' : '하위 요청(이미지, fetch 등)'}에는 붙지 않습니다.` };
}

/* ─────────────── HTML injection (described, never rendered) ─────────────── */

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export interface HtmlPiece {
  kind: 'text' | 'tag';
  text: string;
  /** For tags: the element name and whether it would run script. */
  name?: string;
  danger?: string;
}

const RUNS_SCRIPT = ['script'];

/** A rough reading of an HTML fragment, enough to say which elements and script hooks a browser would create. */
export function readHtml(src: string): HtmlPiece[] {
  const out: HtmlPiece[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ kind: 'text', text: src.slice(last, m.index) });
    const name = m[1].toLowerCase();
    const closing = m[0].startsWith('</');
    const attrs = [...m[2].matchAll(/([^\s=>/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)].map((a) => ({ name: a[1].toLowerCase(), value: (a[2] ?? '').replace(/^["']|["']$/g, '') }));
    let danger: string | undefined;
    if (!closing) {
      const handler = attrs.find((a) => a.name.startsWith('on'));
      const jsUrl = attrs.find((a) => (a.name === 'href' || a.name === 'src') && /^\s*javascript:/i.test(a.value));
      if (RUNS_SCRIPT.includes(name)) danger = '<script> 요소: 안의 코드가 실행됨';
      else if (handler) danger = `${handler.name} 속성: 이벤트가 일어나면 "${handler.value}" 실행`;
      else if (jsUrl) danger = `${jsUrl.name}="javascript:…": 누르면 코드 실행`;
    }
    out.push({ kind: 'tag', text: m[0], name: (closing ? '/' : '') + name, danger });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) });
  return out;
}

/* ─────────────── A toy SQL WHERE evaluator ─────────────── */

export interface UserRow {
  id: number;
  name: string;
  password: string;
  role: string;
}

/** Plaintext passwords on purpose: this is the bad example the lesson warns about. */
export const USERS: UserRow[] = [
  { id: 1, name: 'admin', password: 'Tr0ub4dor&3', role: '관리자' },
  { id: 2, name: 'alice', password: 'sunflower', role: '일반' },
  { id: 3, name: 'bob', password: 'hunter2', role: '일반' },
];

type Tok = { t: 'str'; v: string } | { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function lexSql(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) i++;
    else if (s.startsWith('--', i)) break; // comment to end of line: the rest of the query is ignored
    else if (c === "'") {
      let v = '';
      i++;
      for (;;) {
        if (i >= s.length) throw new Error('닫히지 않은 따옴표');
        if (s[i] === "'" && s[i + 1] === "'") {
          v += "'";
          i += 2;
        } else if (s[i] === "'") {
          i++;
          break;
        } else v += s[i++];
      }
      out.push({ t: 'str', v });
    } else if (/[0-9]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9]/.test(s[j])) j++;
      out.push({ t: 'num', v: Number(s.slice(i, j)) });
      i = j;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      out.push({ t: 'id', v: s.slice(i, j) });
      i = j;
    } else if ('=()'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
    } else if (c === ';') break; // a second statement would be refused by most drivers; stop here
    else throw new Error(`알 수 없는 문자 ${c}`);
  }
  return out;
}

type Val = string | number;
type Node = (row: UserRow) => boolean;

/** Parse `name = '…' AND password = '…'`-style conditions: =, AND, OR, NOT, parentheses, columns, literals. */
export function compileWhere(where: string): { ok: true; test: Node } | { ok: false; error: string } {
  let toks: Tok[];
  try {
    toks = lexSql(where);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  let p = 0;
  const kw = (w: string) => toks[p]?.t === 'id' && (toks[p] as { v: string }).v.toUpperCase() === w;
  const atom = (): ((row: UserRow) => Val) => {
    const tk = toks[p++];
    if (!tk) throw new Error('식이 끝나 버림');
    if (tk.t === 'str' || tk.t === 'num') return () => tk.v;
    if (tk.t === 'id') {
      const col = tk.v.toLowerCase() as keyof UserRow;
      if (!(col in USERS[0])) throw new Error(`없는 열 ${tk.v}`);
      return (row) => row[col];
    }
    throw new Error(`예상하지 못한 ${tk.v}`);
  };
  const cmp = (): Node => {
    if (kw('NOT')) {
      p++;
      const inner = cmp();
      return (row) => !inner(row);
    }
    if (toks[p]?.t === 'op' && (toks[p] as { v: string }).v === '(') {
      p++;
      const e = expr();
      if (!(toks[p]?.t === 'op' && (toks[p] as { v: string }).v === ')')) throw new Error('닫는 괄호가 없음');
      p++;
      return e;
    }
    const a = atom();
    if (!(toks[p]?.t === 'op' && (toks[p] as { v: string }).v === '=')) throw new Error('= 가 와야 함');
    p++;
    const b = atom();
    return (row) => String(a(row)) === String(b(row));
  };
  const and = (): Node => {
    let n = cmp();
    while (kw('AND')) {
      p++;
      const l = n;
      const r = cmp();
      n = (row) => l(row) && r(row);
    }
    return n;
  };
  const expr = (): Node => {
    let n = and();
    while (kw('OR')) {
      p++;
      const l = n;
      const r = and();
      n = (row) => l(row) || r(row);
    }
    return n;
  };
  try {
    const test = expr();
    if (p < toks.length) throw new Error('식 뒤에 남은 글자가 있음');
    return { ok: true, test };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** The vulnerable query: user input pasted between quotes. Returns the SQL text and the WHERE part. */
export function concatQuery(user: string, pass: string) {
  const where = `name = '${user}' AND password = '${pass}'`;
  return { sql: `SELECT * FROM users WHERE ${where}`, where };
}

/* ─────────────── Password storage ─────────────── */

export const CHARSETS = [
  { value: 10, label: '숫자만' },
  { value: 26, label: '소문자' },
  { value: 62, label: '대소문자+숫자' },
  { value: 95, label: '키보드 문자 전부' },
];

/** Guesses per second for one attacker with a few high-end GPUs: order-of-magnitude assumptions, not benchmarks. */
export const GUESS_RATE = { fast: 1e10, slow: 1e4 };

export function fmtBps(bps: number): string {
  const u = [
    [1e12, 'Tbps'],
    [1e9, 'Gbps'],
    [1e6, 'Mbps'],
    [1e3, 'kbps'],
  ] as const;
  for (const [v, n] of u) if (bps >= v) return `${(bps / v).toLocaleString('ko-KR', { maximumFractionDigits: bps / v < 10 ? 1 : 0 })}${n}`;
  return `${Math.round(bps)}bps`;
}

/** Seconds to try every password of `len` characters from a set of `size` characters. */
export const exhaustSeconds = (size: number, len: number, rate: number) => Math.pow(size, len) / rate;
