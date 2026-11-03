/* 웹이 동작하는 길: DNS와 HTTP 그림이 쓰는 순수 계산 */
import { rng } from '../../../../lib/math';

/* ═══════════════════════════ DNS ═══════════════════════════ */

export type RecType = 'A' | 'AAAA' | 'CNAME' | 'NS' | 'MX' | 'TXT';
export interface Rec {
  name: string;
  type: RecType;
  value: string;
  ttl: number; // seconds
}

export interface Zone {
  /** The zone's apex, '.' for the root. */
  id: string;
  /** Short label for the server that answers for this zone. */
  server: string;
  /** Host name of one of its name servers. */
  host: string;
  records: Rec[];
  /** TTL of a "no such name" answer from this zone (negative caching). */
  negTtl?: number;
}

const DAY2 = 172800; // delegations in the root and com zones carry a two-day TTL

/** The tiny slice of the DNS the figures use. Names and addresses are the reserved example ones. */
export const ZONES: Record<string, Zone> = {
  '.': {
    id: '.',
    server: '루트 서버',
    host: 'a.root-servers.net',
    records: [
      { name: 'com', type: 'NS', value: 'a.gtld-servers.net', ttl: DAY2 },
      { name: 'net', type: 'NS', value: 'a.gtld-servers.net', ttl: DAY2 },
    ],
  },
  com: {
    id: 'com',
    server: 'com 서버',
    host: 'a.gtld-servers.net',
    records: [
      { name: 'example.com', type: 'NS', value: 'ns1.example.com', ttl: DAY2 },
      { name: 'example.com', type: 'NS', value: 'ns2.example.com', ttl: DAY2 },
    ],
  },
  net: {
    id: 'net',
    server: 'net 서버',
    host: 'a.gtld-servers.net',
    records: [{ name: 'example.net', type: 'NS', value: 'ns1.example.net', ttl: DAY2 }],
  },
  'example.com': {
    id: 'example.com',
    server: 'example.com 서버',
    host: 'ns1.example.com',
    negTtl: 900,
    records: [
      { name: 'example.com', type: 'NS', value: 'ns1.example.com', ttl: 86400 },
      { name: 'example.com', type: 'NS', value: 'ns2.example.com', ttl: 86400 },
      { name: 'example.com', type: 'MX', value: '10 mail.example.com', ttl: 3600 },
      { name: 'example.com', type: 'TXT', value: '"v=spf1 mx -all"', ttl: 3600 },
      { name: 'www.example.com', type: 'A', value: '192.0.2.10', ttl: 300 },
      { name: 'www.example.com', type: 'AAAA', value: '2001:db8::10', ttl: 300 },
      { name: 'api.example.com', type: 'A', value: '192.0.2.20', ttl: 60 },
      { name: 'mail.example.com', type: 'A', value: '192.0.2.25', ttl: 3600 },
      { name: 'shop.example.com', type: 'CNAME', value: 'shop.cdn.example.net', ttl: 3600 },
    ],
  },
  'example.net': {
    id: 'example.net',
    server: 'example.net 서버',
    host: 'ns1.example.net',
    negTtl: 900,
    records: [
      { name: 'example.net', type: 'NS', value: 'ns1.example.net', ttl: 86400 },
      { name: 'shop.cdn.example.net', type: 'A', value: '203.0.113.7', ttl: 60 },
    ],
  },
};

/** Zone that holds a name (the deepest zone apex that is a suffix of it). */
export function zoneOf(name: string): Zone {
  let best = ZONES['.'];
  for (const z of Object.values(ZONES)) {
    if (z.id === '.') continue;
    if ((name === z.id || name.endsWith('.' + z.id)) && z.id.length > (best.id === '.' ? 0 : best.id.length)) best = z;
  }
  return best;
}

/** The zones a resolver walks through, top-down: ['.', 'com', 'example.com']. */
export function zonePath(name: string): Zone[] {
  const out = [ZONES['.']];
  const labels = name.split('.');
  for (let i = labels.length - 1; i >= 0; i--) {
    const z = ZONES[labels.slice(i).join('.')];
    if (z) out.push(z);
  }
  return out;
}

export type DnsNode = 'stub' | 'resolver' | 'root' | 'tld' | 'auth';
/** Assumed round trip from the resolver (or, for 'stub', from the reader's computer to the resolver), in ms. */
export const DNS_RTT: Record<DnsNode, number> = { stub: 10, resolver: 0, root: 20, tld: 30, auth: 60 };

export interface CacheEntry {
  name: string;
  type: 'NS' | 'A' | 'CNAME' | 'NX';
  value: string;
  expires: number; // seconds on the figure's clock
}
export type Cache = Map<string, CacheEntry>;
const ck = (name: string, type: CacheEntry['type']) => `${name}|${type}`;

export interface DnsStep {
  from: DnsNode;
  to: DnsNode;
  kind: 'query' | 'referral' | 'answer' | 'nx' | 'cache';
  /** Short text on the arrow / chip. */
  label: string;
  /** One or two sentences under the figure. */
  note: string;
  /** Which zones the TLD and authoritative boxes stand for at this step. */
  tld: string;
  auth: string;
  /** Cache after this step. */
  cache: CacheEntry[];
  /** Milliseconds since the stub asked. */
  ms: number;
}

const nodeOfZone = (z: Zone): DnsNode => (z.id === '.' ? 'root' : z.id.includes('.') ? 'auth' : 'tld');

/**
 * Resolve `qname` (type A) through a recursive resolver whose cache is `cache` (mutated), at time `now` (s).
 * Returns every message the stub, the resolver and the servers exchange.
 */
export function resolve(qname: string, now: number, cache: Cache): { steps: DnsStep[]; answer: string; ms: number } {
  for (const [k, e] of cache) if (e.expires <= now) cache.delete(k);
  const steps: DnsStep[] = [];
  let ms = 0;
  let tld = zonePath(qname)[1]?.id ?? 'com';
  let auth = zoneOf(qname).id;
  const push = (s: Omit<DnsStep, 'cache' | 'ms' | 'tld' | 'auth'>) => steps.push({ ...s, tld, auth, ms, cache: [...cache.values()] });
  const put = (name: string, type: CacheEntry['type'], value: string, ttl: number) => cache.set(ck(name, type), { name, type, value, expires: now + ttl });

  push({ from: 'stub', to: 'resolver', kind: 'query', label: `${qname} A?`, note: `내 컴퓨터(스텁 리졸버)가 설정된 재귀 리졸버에게 "${qname}의 IPv4 주소(A 레코드)는?" 하고 묻습니다. 스텁은 답만 기다리고, 찾아다니는 일은 리졸버가 맡습니다.` });

  let name = qname;
  const chain: string[] = [];
  let answer = '';
  for (let hops = 0; hops < 8 && !answer; hops++) {
    tld = zonePath(name)[1]?.id ?? tld;
    auth = zoneOf(name).id;
    const nx = cache.get(ck(name, 'NX'));
    if (nx) {
      push({ from: 'resolver', to: 'resolver', kind: 'cache', label: `캐시: ${name} 없음`, note: `"${name}은 없다"는 답이 아직 캐시에 남아 있습니다(남은 시간 ${nx.expires - now}초). 없는 이름도 캐시하는 것을 부정 캐시라고 합니다.` });
      answer = 'NXDOMAIN';
      break;
    }
    const a = cache.get(ck(name, 'A'));
    if (a) {
      push({ from: 'resolver', to: 'resolver', kind: 'cache', label: `캐시: ${name} A`, note: `${name}의 A 레코드(${a.value})가 캐시에 있고 TTL이 ${a.expires - now}초 남았습니다. 어떤 서버에도 묻지 않고 바로 답합니다.` });
      answer = a.value;
      break;
    }
    const c = cache.get(ck(name, 'CNAME'));
    if (c) {
      push({ from: 'resolver', to: 'resolver', kind: 'cache', label: `캐시: CNAME`, note: `${name}은 ${c.value}의 별명(CNAME)이라는 사실이 캐시에 있습니다. 이제 ${c.value}의 주소를 찾습니다.` });
      chain.push(`${name} → ${c.value}`);
      name = c.value;
      continue;
    }

    // start from the deepest zone whose name servers are cached
    const path = zonePath(name);
    let k = 0;
    for (let i = path.length - 1; i > 0; i--) {
      if (cache.has(ck(path[i].id, 'NS'))) {
        k = i;
        break;
      }
    }
    if (k > 0) {
      const z = path[k];
      push({ from: 'resolver', to: 'resolver', kind: 'cache', label: `캐시: ${z.id} NS`, note: `${z.id} 영역을 맡은 서버(${cache.get(ck(z.id, 'NS'))!.value})를 이미 알고 있습니다. 루트${k > 1 ? '와 TLD 서버' : ''}를 건너뛰고 그 서버에게 바로 묻습니다.` });
    }
    for (; k < path.length; k++) {
      const z = path[k];
      const node = nodeOfZone(z);
      push({ from: 'resolver', to: node, kind: 'query', label: `${name} A?`, note: `리졸버가 ${z.server}(${z.host})에게 똑같이 "${name}의 A 레코드는?" 하고 묻습니다. 서버는 자기 영역에 대해서만 답합니다.` });
      ms += DNS_RTT[node];
      const child = path[k + 1];
      if (child) {
        const ns = z.records.find((r) => r.type === 'NS' && r.name === child.id)!;
        put(child.id, 'NS', ns.value, ns.ttl);
        push({ from: node, to: 'resolver', kind: 'referral', label: `${child.id}은 ${ns.value}에게`, note: `${z.server}는 답을 모르지만 누가 아는지는 압니다. "${child.id}은 ${ns.value}가 맡는다"는 위임(NS 레코드)과 그 서버의 IP 주소(글루)를 돌려줍니다. 리졸버는 이 위임을 ${ns.ttl.toLocaleString('ko-KR')}초 동안 캐시합니다.` });
        continue;
      }
      const recs = z.records.filter((r) => r.name === name);
      const ra = recs.find((r) => r.type === 'A');
      const rc = recs.find((r) => r.type === 'CNAME');
      if (ra) {
        put(name, 'A', ra.value, ra.ttl);
        push({ from: node, to: 'resolver', kind: 'answer', label: `A ${ra.value} (TTL ${ra.ttl})`, note: `권한 서버가 최종 답을 줍니다. ${name}의 주소는 ${ra.value}이고, 이 답을 ${ra.ttl}초 동안 캐시해도 된다(TTL)고 함께 알려 줍니다.` });
        answer = ra.value;
      } else if (rc) {
        put(name, 'CNAME', rc.value, rc.ttl);
        push({ from: node, to: 'resolver', kind: 'answer', label: `CNAME ${rc.value}`, note: `${name}은 주소 대신 "${rc.value}의 별명"이라는 CNAME 레코드를 갖고 있습니다. 다른 영역의 이름이므로 리졸버는 그 이름을 처음부터 다시 찾습니다. CDN을 쓰는 사이트에서 흔한 구성입니다.` });
        chain.push(`${name} → ${rc.value}`);
        name = rc.value;
      } else {
        const neg = z.negTtl ?? 900;
        put(name, 'NX', 'NXDOMAIN', neg);
        push({ from: node, to: 'resolver', kind: 'nx', label: 'NXDOMAIN', note: `권한 서버가 "그런 이름은 없다(NXDOMAIN)"고 답합니다. 이 부정 응답도 영역이 정한 시간(${neg}초) 동안 캐시되어, 오타 난 이름을 반복해서 물어도 서버를 괴롭히지 않습니다.` });
        answer = 'NXDOMAIN';
      }
      break;
    }
  }

  ms += DNS_RTT.stub;
  tld = zonePath(qname)[1]?.id ?? tld;
  auth = zoneOf(qname).id;
  const via = chain.length ? ` (${chain.join(', ')})` : '';
  push({
    from: 'resolver',
    to: 'stub',
    kind: answer === 'NXDOMAIN' ? 'nx' : 'answer',
    label: answer === 'NXDOMAIN' ? 'NXDOMAIN' : `${qname} = ${answer}`,
    note: answer === 'NXDOMAIN' ? `리졸버가 스텁에게 "${qname}은 없다"고 전합니다. 브라우저는 "사이트에 연결할 수 없음"을 띄웁니다.` : `리졸버가 스텁에게 최종 주소 ${answer}${via}를 전합니다. 이제 브라우저가 이 주소로 TCP 연결을 엽니다.`,
  });
  return { steps, answer, ms };
}

/** Replay a list of lookups on a fresh cache; return the steps of the last one. */
export function replayLookups(lookups: { name: string; at: number }[]): { steps: DnsStep[]; ms: number; before: CacheEntry[] } {
  const cache: Cache = new Map();
  let out = { steps: [] as DnsStep[], ms: 0, before: [] as CacheEntry[] };
  lookups.forEach((l, i) => {
    if (i === lookups.length - 1) {
      for (const [k, e] of cache) if (e.expires <= l.at) cache.delete(k);
      out.before = [...cache.values()];
    }
    const r = resolve(l.name, l.at, cache);
    out = { ...out, steps: r.steps, ms: r.ms };
  });
  return out;
}

/* ─────────── TTL trade-off: many resolvers caching one popular name ─────────── */

export const TTL_DURATION = 7200; // s
export const TTL_CHANGE = 3600; // the record's address changes here
export const TTL_BIN = 60;
export const TTL_RESOLVERS = 40;
const TTL_WARMUP = 4 * 3600;

export interface TtlResult {
  /** Per minute: queries from users, queries that reached the authoritative server, answers with the old address after the change. */
  bins: { total: number; auth: number; stale: number }[];
  total: number;
  auth: number;
  hitRate: number;
  stale: number;
  /** Seconds after the change at which the last old address was handed out (0 if none). */
  lastStale: number;
}

/** Each resolver gets Poisson queries at its own rate (0.001 to 1 per second, log-uniform), seeded. */
export function simulateTtl(ttl: number, seed = 11): TtlResult {
  const r = rng(seed);
  const nb = TTL_DURATION / TTL_BIN;
  const bins = Array.from({ length: nb }, () => ({ total: 0, auth: 0, stale: 0 }));
  let total = 0;
  let auth = 0;
  let stale = 0;
  let lastStale = 0;
  for (let i = 0; i < TTL_RESOLVERS; i++) {
    const rate = Math.pow(10, -3 + 3 * r());
    let expires = -1;
    let cachedNew = false;
    // start well before the window so every cache is already warm, at a random phase
    let t = -TTL_WARMUP * (1 + r());
    while (t < TTL_DURATION) {
      const miss = t >= expires;
      if (miss) {
        expires = t + ttl;
        cachedNew = t >= TTL_CHANGE;
      }
      if (t >= 0) {
        const b = bins[Math.floor(t / TTL_BIN)];
        b.total++;
        total++;
        if (miss) {
          b.auth++;
          auth++;
        } else if (t >= TTL_CHANGE && !cachedNew) {
          b.stale++;
          stale++;
          lastStale = Math.max(lastStale, t - TTL_CHANGE);
        }
      }
      t += -Math.log(1 - r()) / rate;
    }
  }
  return { bins, total, auth, hitRate: total ? 1 - auth / total : 0, stale, lastStale };
}

/* ─────────── The name tree ─────────── */

export interface TreeNode {
  name: string; // full name, '.' for the root
  label: string; // what the tree shows
  parent: string | null;
  note: string;
}

export const TREE: TreeNode[] = [
  { name: '.', label: '.', parent: null, note: '모든 이름의 뿌리입니다. 루트 영역에는 최상위 도메인(TLD)마다 그 영역을 맡은 서버가 누구인지만 적혀 있습니다. 루트 서버는 a부터 m까지 13개의 이름으로 운영되고, 각 이름 뒤에는 애니캐스트로 전 세계에 흩어진 많은 서버가 있습니다.' },
  { name: 'com', label: 'com', parent: '.', note: '일반 최상위 도메인(gTLD)입니다. com 영역에는 그 아래 수많은 이름의 위임(NS 레코드)이 들어 있습니다. com과 net은 같은 서버 무리(a~m.gtld-servers.net)가 맡습니다.' },
  { name: 'net', label: 'net', parent: '.', note: '일반 최상위 도메인입니다. 이 그림에서는 CDN 회사가 쓰는 example.net이 그 아래에 있습니다.' },
  { name: 'kr', label: 'kr', parent: '.', note: '국가 최상위 도메인(ccTLD)입니다. 한국의 kr 영역 아래에는 co.kr, go.kr 같은 2단계 구분이 있고, 이름을 바로 붙인 "이름.kr"도 쓸 수 있습니다. 이 그림에서는 레코드를 생략했습니다.' },
  { name: 'co.kr', label: 'co', parent: 'kr', note: '기업용 2단계 구분입니다. 그 아래에 회사 이름이 붙습니다. 영역을 어디서 나눌지는 각 영역의 관리자가 정합니다.' },
  { name: 'example.com', label: 'example', parent: 'com', note: 'example.com 영역의 꼭대기(apex)입니다. 이 영역의 관리자가 아래 이름들의 레코드를 직접 정하고, 권한 서버 ns1·ns2.example.com이 답합니다. 메일 서버(MX)와 각종 확인용 문자열(TXT)도 여기에 둡니다.' },
  { name: 'www.example.com', label: 'www', parent: 'example.com', note: '웹 서버의 이름입니다. IPv4 주소(A)와 IPv6 주소(AAAA)를 모두 갖고 있어서, 브라우저는 둘 중 하나로 연결합니다.' },
  { name: 'api.example.com', label: 'api', parent: 'example.com', note: '같은 영역 안의 다른 이름입니다. 서버를 자주 바꾸므로 TTL을 60초로 짧게 잡았습니다.' },
  { name: 'mail.example.com', label: 'mail', parent: 'example.com', note: 'example.com의 MX 레코드가 가리키는 메일 서버입니다. 누군가 @example.com으로 메일을 보내면 보내는 서버가 MX를 조회해 이 이름을 얻고, 다시 A 레코드로 주소를 찾습니다.' },
  { name: 'shop.example.com', label: 'shop', parent: 'example.com', note: '주소 대신 CNAME으로 다른 이름(shop.cdn.example.net)을 가리킵니다. 실제 서버를 CDN 회사가 운영하므로, 주소가 바뀌어도 example.com 쪽은 고칠 필요가 없습니다.' },
  { name: 'example.net', label: 'example', parent: 'net', note: 'CDN 회사의 영역이라고 가정했습니다. 이 영역의 레코드는 example.com과 상관없이 CDN 회사가 관리합니다.' },
  { name: 'cdn.example.net', label: 'cdn', parent: 'example.net', note: '레코드가 하나도 없지만 아래에 이름이 있어서 트리의 마디로만 존재하는 이름입니다. 영역을 따로 나누지 않았으므로 example.net 영역에 속합니다.' },
  { name: 'shop.cdn.example.net', label: 'shop', parent: 'cdn.example.net', note: 'CDN의 실제 서버 주소입니다. CDN은 사용자 위치나 서버 상태에 따라 다른 주소를 주려고 TTL을 짧게(60초) 잡는 경우가 많습니다.' },
];

/** Records stored for a name (in its zone), plus the delegation the parent zone holds for it. */
export function recordsOf(name: string): { own: Rec[]; delegation: Rec[] } {
  if (name === '.') return { own: ZONES['.'].records, delegation: [] };
  const own = zoneOf(name).records.filter((r) => r.name === name);
  // a zone apex is also listed in its parent zone as a delegation
  const path = zonePath(name);
  const parent = ZONES[name] ? path[path.length - 2] : undefined;
  const delegation = parent ? parent.records.filter((r) => r.name === name && r.type === 'NS') : [];
  return { own, delegation };
}

/* ═══════════════════════════ HTTP ═══════════════════════════ */

export type LineRole = 'start' | 'header' | 'blank' | 'body';
export interface HttpLine {
  text: string;
  role: LineRole;
}

const utf8Len = (s: string) => new TextEncoder().encode(s).length;

/** Build an HTTP/1.1 message; Content-Length is filled in from the body's UTF-8 length. */
function message(start: string, headers: [string, string][], body?: string, length = true): HttpLine[] {
  const hs = [...headers];
  if (body !== undefined && length) hs.push(['Content-Length', String(utf8Len(body))]);
  const lines: HttpLine[] = [{ text: start, role: 'start' }, ...hs.map(([k, v]) => ({ text: `${k}: ${v}`, role: 'header' as const })), { text: '', role: 'blank' }];
  if (body) for (const l of body.split('\n')) lines.push({ text: l, role: 'body' });
  return lines;
}

const DATE = 'Tue, 03 Nov 2026 09:00:00 GMT';
const PAGE = '<!doctype html>\n<html lang="ko">\n<title>예시 페이지</title>\n<h1>안녕하세요</h1>\n<img src="/logo.png">';
const NOT_FOUND = '<!doctype html>\n<h1>페이지를 찾을 수 없습니다</h1>';
const FORM = 'id=jiwoo&pw=correct-horse';

export interface HttpExample {
  id: string;
  label: string;
  note: string;
  request: HttpLine[];
  response: HttpLine[];
}

export const HTTP_EXAMPLES: HttpExample[] = [
  {
    id: 'get',
    label: 'GET',
    note: '가장 흔한 요청입니다. 서버는 상태 코드 200과 함께 HTML을 보내고, Content-Type으로 본문의 종류를, Content-Length로 길이(바이트)를 알려 줍니다. ETag는 이 버전의 꼬리표이고, Cache-Control은 600초 동안은 다시 묻지 말고 써도 된다는 뜻입니다. 브라우저는 HTML을 읽다가 <img>를 만나면 /logo.png를 요청하는 GET을 또 보냅니다.',
    request: message('GET / HTTP/1.1', [
      ['Host', 'www.example.com'],
      ['User-Agent', 'Mozilla/5.0 (…)'],
      ['Accept', 'text/html'],
      ['Accept-Language', 'ko-KR,ko;q=0.9'],
    ]),
    response: message(
      'HTTP/1.1 200 OK',
      [
        ['Date', DATE],
        ['Content-Type', 'text/html; charset=utf-8'],
        ['Cache-Control', 'max-age=600'],
        ['ETag', '"v42"'],
      ],
      PAGE,
    ),
  },
  {
    id: 'post',
    label: 'POST',
    note: '로그인 폼을 보내는 요청입니다. 입력값은 본문에 담기고, Content-Type이 그 형식을 알려 줍니다. 서버는 303으로 "결과는 /home에서 보라"고 하면서 Set-Cookie로 세션 번호를 줍니다. HTTP 자체는 요청끼리 아무것도 기억하지 않으므로, 브라우저가 이후 요청마다 Cookie: session=8f2c1a를 붙여서 "아까 로그인한 그 사람"임을 밝힙니다. 이 요청은 비밀번호를 그대로 담고 있으니 HTTPS가 아니면 길목의 누구나 읽을 수 있습니다.',
    request: message(
      'POST /login HTTP/1.1',
      [
        ['Host', 'www.example.com'],
        ['Content-Type', 'application/x-www-form-urlencoded'],
      ],
      FORM,
    ),
    response: message('HTTP/1.1 303 See Other', [
      ['Date', DATE],
      ['Location', '/home'],
      ['Set-Cookie', 'session=8f2c1a; Path=/; Secure; HttpOnly; SameSite=Lax'],
      ['Content-Length', '0'],
    ]),
  },
  {
    id: 'cond',
    label: '조건부 GET',
    note: '캐시한 페이지가 오래되어 다시 확인하는 요청입니다. If-None-Match에 지난번 ETag를 실어 보내면, 서버는 바뀐 것이 없을 때 본문 없이 304만 돌려줍니다. 왕복은 한 번 해야 하지만 내려받는 바이트가 거의 없습니다.',
    request: message('GET / HTTP/1.1', [
      ['Host', 'www.example.com'],
      ['If-None-Match', '"v42"'],
    ]),
    response: message('HTTP/1.1 304 Not Modified', [
      ['Date', DATE],
      ['Cache-Control', 'max-age=600'],
      ['ETag', '"v42"'],
    ]),
  },
  {
    id: '404',
    label: '없는 페이지',
    note: '없는 경로를 요청하면 404가 옵니다. 4로 시작하는 코드는 "요청 쪽 문제"라는 뜻입니다. 본문에 사람이 읽을 안내 페이지를 함께 보내는 경우가 많습니다.',
    request: message('GET /no-such-page HTTP/1.1', [
      ['Host', 'www.example.com'],
      ['Accept', 'text/html'],
    ]),
    response: message(
      'HTTP/1.1 404 Not Found',
      [
        ['Date', DATE],
        ['Content-Type', 'text/html; charset=utf-8'],
      ],
      NOT_FOUND,
    ),
  },
];

/* ─────────── Handshakes: how many half-round-trips before the first byte ─────────── */

export type Proto = 'http' | 'tls12' | 'tls13' | 'quic' | 'quic0';
export type Phase = 'tcp' | 'tls' | 'quic' | 'http';
export interface Flight {
  dir: 'c2s' | 's2c';
  label: string;
  phase: Phase;
}

export const PROTO_NAMES: Record<Proto, string> = {
  http: 'HTTP (암호화 없음)',
  tls12: 'HTTPS · TLS 1.2',
  tls13: 'HTTPS · TLS 1.3',
  quic: 'HTTP/3 · QUIC',
  quic0: 'HTTP/3 · 0-RTT 재접속',
};
export const PROTOS: Proto[] = ['http', 'tls12', 'tls13', 'quic', 'quic0'];

/** Each flight takes half a round trip; a flight is sent when the previous one arrives. */
export const FLIGHTS: Record<Proto, Flight[]> = {
  http: [
    { dir: 'c2s', label: 'SYN', phase: 'tcp' },
    { dir: 's2c', label: 'SYN-ACK', phase: 'tcp' },
    { dir: 'c2s', label: 'ACK + GET', phase: 'http' },
    { dir: 's2c', label: '200 OK …', phase: 'http' },
  ],
  tls12: [
    { dir: 'c2s', label: 'SYN', phase: 'tcp' },
    { dir: 's2c', label: 'SYN-ACK', phase: 'tcp' },
    { dir: 'c2s', label: 'ACK + ClientHello', phase: 'tls' },
    { dir: 's2c', label: 'ServerHello, 인증서, ServerHelloDone', phase: 'tls' },
    { dir: 'c2s', label: 'ClientKeyExchange, Finished', phase: 'tls' },
    { dir: 's2c', label: 'Finished', phase: 'tls' },
    { dir: 'c2s', label: 'GET (암호화)', phase: 'http' },
    { dir: 's2c', label: '200 OK … (암호화)', phase: 'http' },
  ],
  tls13: [
    { dir: 'c2s', label: 'SYN', phase: 'tcp' },
    { dir: 's2c', label: 'SYN-ACK', phase: 'tcp' },
    { dir: 'c2s', label: 'ACK + ClientHello(키 공유)', phase: 'tls' },
    { dir: 's2c', label: 'ServerHello(키 공유), 인증서, Finished', phase: 'tls' },
    { dir: 'c2s', label: 'Finished + GET', phase: 'http' },
    { dir: 's2c', label: '200 OK …', phase: 'http' },
  ],
  quic: [
    { dir: 'c2s', label: 'Initial: ClientHello(키 공유)', phase: 'quic' },
    { dir: 's2c', label: 'ServerHello, 인증서, Finished', phase: 'quic' },
    { dir: 'c2s', label: 'Finished + GET', phase: 'http' },
    { dir: 's2c', label: '200 OK …', phase: 'http' },
  ],
  quic0: [
    { dir: 'c2s', label: 'ClientHello + 0-RTT GET', phase: 'quic' },
    { dir: 's2c', label: 'ServerHello … + 200 OK', phase: 'http' },
  ],
};

/** Milliseconds from typing the URL to the first byte of the response. */
export const ttfb = (p: Proto, rtt: number, dns: number) => dns + (FLIGHTS[p].length * rtt) / 2;
export const roundTrips = (p: Proto) => FLIGHTS[p].length / 2;

/* ─────────── Diffie–Hellman with small numbers ─────────── */

export const DH_P = 2039; // a safe prime: 2039 = 2·1019 + 1
export const DH_G = 7; // a generator of the whole group mod 2039

export function modPow(base: number, exp: number, mod: number): number {
  let r = 1;
  let b = base % mod;
  let e = exp;
  while (e > 0) {
    if (e & 1) r = (r * b) % mod;
    b = (b * b) % mod;
    e >>= 1;
  }
  return r;
}

/** Brute-force discrete log: the smallest x ≥ 1 with g^x = y (mod p), and how many tries it took. */
export function discreteLog(y: number, g = DH_G, p = DH_P): { x: number; tries: number } {
  let v = 1;
  for (let x = 1; x < p; x++) {
    v = (v * g) % p;
    if (v === y) return { x, tries: x };
  }
  return { x: -1, tries: p - 1 };
}

/* ─────────── Head-of-line blocking: one page, many resources, some lost packets ─────────── */

export const HOL_RTT = 100; // ms
export const HOL_RES = 20; // resources on the page
/** Packets per resource (seeded, 2 to 12). */
export const HOL_SIZES: number[] = (() => {
  const r = rng(29);
  return Array.from({ length: HOL_RES }, () => 2 + Math.floor(r() * 11));
})();
export const HOL_PACKETS = HOL_SIZES.reduce((a, b) => a + b, 0);

export type HolProto = 'h1' | 'h2' | 'h3';
export interface HolResult {
  /** Per resource: when its first packet reached the browser, and when the browser could use all of it (ms). */
  first: number[];
  done: number[];
  /** Send times of lost packets. */
  losses: number[];
  page: number;
}

interface Pkt {
  res: number;
  seq: number; // position in its connection's byte stream
}

/**
 * The server sends one packet per ms in total. A lost packet is noticed one RTT after it was sent and is
 * resent before anything new. Connection setup and congestion control are left out.
 * h2 and h3 send the same packets at the same moments (one connection, streams interleaved); they differ
 * only in delivery: TCP hands bytes over in order, QUIC per stream. h1 uses six connections, one resource at a time each.
 */
export function simulateHol(proto: HolProto, loss: number, seed: number): HolResult {
  const r = rng(seed * 7919 + 1);
  const first = Array(HOL_RES).fill(Infinity);
  const arrivedMax = Array(HOL_RES).fill(0);
  const left = [...HOL_SIZES];
  const losses: number[] = [];
  const half = HOL_RTT / 2;

  if (proto !== 'h1') {
    // round-robin over streams: the connection's byte-stream order
    const order: Pkt[] = [];
    const sent = Array(HOL_RES).fill(0);
    for (let s = 0; order.length < HOL_PACKETS; ) {
      if (sent[s] < HOL_SIZES[s]) order.push({ res: s, seq: order.length }), sent[s]++;
      s = (s + 1) % HOL_RES;
    }
    const arrival = Array(order.length).fill(Infinity);
    const retx: { i: number; at: number }[] = [];
    let next = 0;
    for (let t = half, guard = 0; (next < order.length || retx.length) && guard < 200000; t++, guard++) {
      let i = -1;
      if (retx.length && retx[0].at <= t) i = retx.shift()!.i;
      else if (next < order.length) i = next++;
      if (i < 0) continue;
      if (r() < loss) {
        losses.push(t);
        retx.push({ i, at: t + HOL_RTT });
      } else arrival[i] = t + half;
    }
    // delivery to the browser
    let inOrder = 0;
    order.forEach((p, i) => {
      inOrder = Math.max(inOrder, arrival[i]);
      const usable = proto === 'h2' ? inOrder : arrival[i];
      first[p.res] = Math.min(first[p.res], usable);
      arrivedMax[p.res] = Math.max(arrivedMax[p.res], usable);
    });
    return { first, done: arrivedMax, losses, page: Math.max(...arrivedMax) };
  }

  // HTTP/1.1: six connections, each fetches one resource at a time
  const CONNS = 6;
  const conns = Array.from({ length: CONNS }, () => ({ res: -1, start: 0, next: 0, retx: [] as { at: number }[] }));
  let queue = 0;
  const assign = (c: (typeof conns)[number], start: number) => {
    if (queue >= HOL_RES) {
      c.res = -1;
      return;
    }
    c.res = queue++;
    c.start = start;
    c.next = 0;
    c.retx = [];
  };
  conns.forEach((c) => assign(c, half));
  let rr = 0;
  let finished = 0;
  for (let t = half, guard = 0; finished < HOL_RES && guard < 400000; t++, guard++) {
    for (let k = 0; k < CONNS; k++) {
      const c = conns[(rr + k) % CONNS];
      if (c.res < 0 || t < c.start) continue;
      const hasRetx = c.retx.length > 0 && c.retx[0].at <= t;
      if (!hasRetx && c.next >= HOL_SIZES[c.res]) continue;
      if (hasRetx) c.retx.shift();
      else c.next++;
      rr = (rr + k + 1) % CONNS;
      const res = c.res;
      if (r() < loss) {
        losses.push(t);
        c.retx.push({ at: t + HOL_RTT });
      } else {
        const at = t + half;
        first[res] = Math.min(first[res], at);
        arrivedMax[res] = Math.max(arrivedMax[res], at);
        if (--left[res] === 0) {
          finished++;
          // the browser has the whole response at arrivedMax; the next request reaches the server half an RTT later
          assign(c, arrivedMax[res] + half);
        }
      }
      break;
    }
  }
  return { first, done: arrivedMax, losses, page: Math.max(...arrivedMax) };
}
