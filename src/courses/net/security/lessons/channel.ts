/* 안전한 통로: pure models for the TLS and firewall/NAT/VPN lessons. */

/* ─────────────── TLS 1.3 handshake ─────────────── */

export type Prot = 'plain' | 'hs' | 'app';
export interface HsMsg {
  name: string;
  dir: 'c2s' | 's2c';
  /** flight number: messages in one flight leave together */
  flight: number;
  prot: Prot;
  fields: [string, string][];
  note: string;
}

export const HANDSHAKE: HsMsg[] = [
  {
    name: 'ClientHello',
    dir: 'c2s',
    flight: 0,
    prot: 'plain',
    fields: [
      ['supported_versions', 'TLS 1.3'],
      ['random', '클라이언트 무작위 수 32바이트'],
      ['cipher_suites', 'AES_128_GCM_SHA256, CHACHA20_POLY1305_SHA256, …'],
      ['key_share', 'X25519 공개 값 (이번 연결에만 쓰는 새 키)'],
      ['server_name (SNI)', 'www.example.com'],
      ['signature_algorithms', 'ecdsa_secp256r1_sha256, rsa_pss_rsae_sha256, …'],
    ],
    note: '클라이언트는 서버가 고를 만한 키 교환 그룹을 짐작해 공개 값을 미리 실어 보냅니다. 그래서 TLS 1.3은 1 왕복으로 끝납니다. 아직 아무 키도 없으므로 이 메시지는 평문이고, 접속하려는 이름(SNI)도 그대로 보입니다.',
  },
  {
    name: 'ServerHello',
    dir: 's2c',
    flight: 1,
    prot: 'plain',
    fields: [
      ['random', '서버 무작위 수 32바이트'],
      ['cipher_suite', 'TLS_AES_128_GCM_SHA256'],
      ['key_share', 'X25519 공개 값 (서버의 새 키)'],
    ],
    note: '서버가 암호 스위트를 고르고 자기 공개 값을 보냅니다. 이 순간 양쪽은 디피–헬만으로 같은 비밀을 계산하고, 거기서 핸드셰이크 키를 뽑습니다. 이 메시지 뒤로는 모두 암호화됩니다.',
  },
  {
    name: 'EncryptedExtensions',
    dir: 's2c',
    flight: 1,
    prot: 'hs',
    fields: [['ALPN', 'h2 (HTTP/2로 이야기하자)']],
    note: '나머지 협상 결과입니다. TLS 1.2까지는 이런 정보가 평문이었지만, 1.3은 키가 생기자마자 암호화해 보냅니다.',
  },
  {
    name: 'Certificate',
    dir: 's2c',
    flight: 1,
    prot: 'hs',
    fields: [
      ['인증서', 'www.example.com (서버 공개 키 포함)'],
      ['중간 인증서', 'Example Issuing CA'],
    ],
    note: '서버의 인증서 사슬입니다. TLS 1.2에서는 평문이라 길에서 누구나 어느 사이트의 인증서인지 볼 수 있었지만, 1.3에서는 암호화됩니다.',
  },
  {
    name: 'CertificateVerify',
    dir: 's2c',
    flight: 1,
    prot: 'hs',
    fields: [['signature', '지금까지 주고받은 메시지 전체(트랜스크립트)의 해시에 인증서 개인 키로 한 서명']],
    note: '인증서는 누구나 복사해 보낼 수 있습니다. 서버가 그 인증서의 개인 키를 정말 갖고 있음을 증명하는 것은 이 서명입니다. 서명 대상에 양쪽의 key_share가 들어 있으므로, 중간에서 공개 값을 바꿔치기하면 서명이 맞지 않습니다.',
  },
  {
    name: 'Finished (서버)',
    dir: 's2c',
    flight: 1,
    prot: 'hs',
    fields: [['verify_data', '트랜스크립트 해시에 핸드셰이크 키에서 뽑은 키로 계산한 HMAC']],
    note: '핸드셰이크 전체가 양쪽에서 똑같이 보였음을 확인하는 MAC입니다. 키를 모르는 누군가가 앞의 메시지를 고쳤다면 여기서 드러납니다.',
  },
  {
    name: 'Finished (클라이언트)',
    dir: 'c2s',
    flight: 2,
    prot: 'hs',
    fields: [['verify_data', '클라이언트 쪽 트랜스크립트에 대한 HMAC']],
    note: '클라이언트도 같은 확인을 보냅니다. 이제 양쪽은 핸드셰이크 비밀에 트랜스크립트를 더해 애플리케이션 키를 뽑습니다.',
  },
  {
    name: 'GET /',
    dir: 'c2s',
    flight: 2,
    prot: 'app',
    fields: [['HTTP 요청', 'GET / · Host: www.example.com · Cookie: …']],
    note: '첫 요청은 클라이언트의 Finished와 같은 비행으로 떠납니다. 쿠키와 경로는 애플리케이션 키로 암호화되어, 길에서는 크기와 시각만 보입니다.',
  },
  {
    name: '200 OK',
    dir: 's2c',
    flight: 3,
    prot: 'app',
    fields: [['HTTP 응답', '200 OK · 본문']],
    note: '응답도 애플리케이션 키로 암호화됩니다. 이후의 모든 레코드에는 순서 번호가 섞여 있어, 레코드를 빼거나 순서를 바꾸면 복호화가 실패합니다.',
  },
];

export const PROT_NAME: Record<Prot, string> = { plain: '평문', hs: '핸드셰이크 키로 암호화', app: '애플리케이션 키로 암호화' };

/* ─────────────── man in the middle ─────────────── */

export type Attack = 'own-cert' | 'self-signed' | 'swap-key' | 'tamper-hello' | 'strip';
export type CheckId = 'chain' | 'name' | 'certVerify' | 'finished' | 'hsts';
export const CHECKS: CheckId[] = ['chain', 'name', 'certVerify', 'finished', 'hsts'];

export interface MitmResult {
  /** what each check said; null = not reached or not applicable */
  checks: Record<CheckId, 'pass' | 'fail' | 'off' | null>;
  /** the first enabled check that failed (the connection stops there) */
  stoppedBy: CheckId | null;
  outcome: 'blocked' | 'readwrite' | 'tampered' | 'plain';
}

/**
 * Which of the client's checks each attack trips, and what happens when every check that would
 * have caught it is switched off.
 */
export function mitm(attack: Attack, on: Record<CheckId, boolean>): MitmResult {
  // would each check pass (true) or fail (false) against this attack? undefined = not applicable
  const verdict: Partial<Record<CheckId, boolean>> = {
    'own-cert': { chain: true, name: false, certVerify: true, finished: true },
    'self-signed': { chain: false, name: true, certVerify: true, finished: true },
    'swap-key': { chain: true, name: true, certVerify: false, finished: true },
    'tamper-hello': { chain: true, name: true, certVerify: false, finished: false },
    strip: { hsts: false },
  }[attack];
  const checks = {} as MitmResult['checks'];
  let stoppedBy: CheckId | null = null;
  for (const c of CHECKS) {
    const v = verdict[c];
    if (v === undefined || stoppedBy) {
      checks[c] = null;
      continue;
    }
    if (!on[c]) {
      checks[c] = 'off';
      continue;
    }
    checks[c] = v ? 'pass' : 'fail';
    if (!v) stoppedBy = c;
  }
  // HSTS only matters for stripping; for the TLS attacks the browser is already on https
  if (attack !== 'strip') checks.hsts = null;
  const outcome: MitmResult['outcome'] = stoppedBy ? 'blocked' : attack === 'strip' ? 'plain' : attack === 'tamper-hello' ? 'tampered' : 'readwrite';
  return { checks, stoppedBy, outcome };
}

/* ─────────────── forward secrecy ─────────────── */

export type KeyExchange = 'rsa' | 'ecdhe';
export type SessionFate = 'safe' | 'decrypt' | 'impersonate';
export const FS_DAYS = 14;

/**
 * One recorded session per day (days 1..FS_DAYS). The server's long-term private key leaks at the
 * start of day `leak` and is replaced (new key, old certificate revoked) at the start of day
 * `leak + delay`.
 */
export function sessionFates(kx: KeyExchange, leak: number, delay: number): SessionFate[] {
  const replaced = leak + delay;
  return Array.from({ length: FS_DAYS }, (_, i) => {
    const day = i + 1;
    if (day >= replaced) return 'safe';
    // with RSA key transport the long-term key decrypts the premaster secret of every session it was used for
    if (kx === 'rsa') return 'decrypt';
    // with ephemeral keys, past recordings stay sealed; until replacement an active attacker can pose as the server
    return day >= leak ? 'impersonate' : 'safe';
  });
}

/* ─────────────── firewall ─────────────── */

export type Proto = 'tcp' | 'udp';
export interface Pkt {
  dir: 'in' | 'out';
  proto: Proto;
  src: string;
  sport: number;
  dst: string;
  dport: number;
  what: string;
  /** what the network's owner wants */
  want: 'allow' | 'deny';
}
export interface Rule {
  id: string;
  action: 'allow' | 'deny';
  dir: 'in' | 'out';
  proto?: Proto;
  dst?: string;
  dport?: number;
  sport?: number;
  text: string;
}

export const WEB = '10.0.0.10';
export const PC = '10.0.0.23';

export const PACKETS: Pkt[] = [
  { dir: 'out', proto: 'tcp', src: PC, sport: 51000, dst: '192.0.2.80', dport: 443, what: 'PC가 외부 웹사이트에 접속', want: 'allow' },
  { dir: 'in', proto: 'tcp', src: '192.0.2.80', sport: 443, dst: PC, dport: 51000, what: '그 웹사이트의 응답', want: 'allow' },
  { dir: 'in', proto: 'tcp', src: '198.51.100.7', sport: 40000, dst: WEB, dport: 443, what: '손님이 우리 웹 서버에 접속', want: 'allow' },
  { dir: 'out', proto: 'tcp', src: WEB, sport: 443, dst: '198.51.100.7', dport: 40000, what: '웹 서버의 응답', want: 'allow' },
  { dir: 'in', proto: 'tcp', src: '203.0.113.50', sport: 40001, dst: WEB, dport: 22, what: '웹 서버의 SSH를 두드림', want: 'deny' },
  { dir: 'in', proto: 'tcp', src: '203.0.113.50', sport: 443, dst: PC, dport: 3389, what: '출발 포트를 443으로 속여 PC의 원격 데스크톱에 접속', want: 'deny' },
  { dir: 'out', proto: 'udp', src: PC, sport: 51515, dst: '192.0.2.53', dport: 53, what: 'PC의 DNS 질의', want: 'allow' },
  { dir: 'in', proto: 'udp', src: '192.0.2.53', sport: 53, dst: PC, dport: 51515, what: 'DNS 응답', want: 'allow' },
  { dir: 'in', proto: 'udp', src: '203.0.113.50', sport: 53, dst: PC, dport: 5353, what: '묻지도 않은 "DNS 응답"', want: 'deny' },
  { dir: 'in', proto: 'tcp', src: '203.0.113.50', sport: 40002, dst: WEB, dport: 3306, what: '웹 서버의 데이터베이스 포트를 두드림', want: 'deny' },
];

export const RULES: Rule[] = [
  { id: 'web', action: 'allow', dir: 'in', proto: 'tcp', dst: WEB, text: '허용 · 들어옴 · TCP · 목적지 웹 서버(모든 포트)' },
  { id: 'ssh', action: 'deny', dir: 'in', proto: 'tcp', dport: 22, text: '차단 · 들어옴 · TCP · 목적지 포트 22' },
  { id: 'out', action: 'allow', dir: 'out', text: '허용 · 나감 · 모두' },
  { id: 'https-reply', action: 'allow', dir: 'in', proto: 'tcp', sport: 443, text: '허용 · 들어옴 · TCP · 출발 포트 443 ("HTTPS 응답")' },
  { id: 'dns-reply', action: 'allow', dir: 'in', proto: 'udp', sport: 53, text: '허용 · 들어옴 · UDP · 출발 포트 53 ("DNS 응답")' },
  { id: 'web443', action: 'allow', dir: 'in', proto: 'tcp', dst: WEB, dport: 443, text: '허용 · 들어옴 · TCP · 목적지 웹 서버 443' },
];

export function ruleMatches(r: Rule, p: Pkt): boolean {
  return r.dir === p.dir && (!r.proto || r.proto === p.proto) && (!r.dst || r.dst === p.dst) && (r.dport === undefined || r.dport === p.dport) && (r.sport === undefined || r.sport === p.sport);
}

export interface FwVerdict {
  action: 'allow' | 'deny';
  /** index into the active rule list, -1 = default policy, -2 = connection table */
  by: number;
}

/** First match over the enabled rules; with `stateful`, replies to allowed connections pass first. */
export function evaluate(rules: Rule[], packets: Pkt[], dflt: 'allow' | 'deny', stateful: boolean): FwVerdict[] {
  const table = new Set<string>();
  const key = (proto: Proto, a: string, ap: number, b: string, bp: number) => `${proto}|${a}:${ap}|${b}:${bp}`;
  return packets.map((p) => {
    if (stateful && table.has(key(p.proto, p.src, p.sport, p.dst, p.dport))) return { action: 'allow', by: -2 };
    const i = rules.findIndex((r) => ruleMatches(r, p));
    const v: FwVerdict = i >= 0 ? { action: rules[i].action, by: i } : { action: dflt, by: -1 };
    // an allowed packet opens the connection both ways
    if (stateful && v.action === 'allow') {
      table.add(key(p.proto, p.src, p.sport, p.dst, p.dport));
      table.add(key(p.proto, p.dst, p.dport, p.src, p.sport));
    }
    return v;
  });
}

/* ─────────────── NAT (port translation) ─────────────── */

export const PUBLIC_IP = '203.0.113.7';
export const NAS = '192.168.0.20';
export type NatFilter = 'strict' | 'open';
export interface NatEvent {
  dir: 'out' | 'in';
  proto: Proto;
  src: string;
  sport: number;
  dst: string;
  dport: number;
  what: string;
}
export const NAT_EVENTS: NatEvent[] = [
  { dir: 'out', proto: 'tcp', src: '192.168.0.11', sport: 50001, dst: '198.51.100.80', dport: 443, what: '노트북이 웹사이트에 접속' },
  { dir: 'out', proto: 'tcp', src: '192.168.0.12', sport: 50001, dst: '198.51.100.80', dport: 443, what: '휴대폰도 같은 출발 포트로 같은 사이트에 접속' },
  { dir: 'in', proto: 'tcp', src: '198.51.100.80', sport: 443, dst: PUBLIC_IP, dport: 40002, what: '사이트가 두 번째 연결에 응답' },
  { dir: 'in', proto: 'tcp', src: '198.51.100.80', sport: 443, dst: PUBLIC_IP, dport: 40001, what: '사이트가 첫 번째 연결에 응답' },
  { dir: 'out', proto: 'udp', src: '192.168.0.12', sport: 6000, dst: '192.0.2.99', dport: 3478, what: '휴대폰이 영상 통화 서버에 UDP를 보냄' },
  { dir: 'in', proto: 'udp', src: '198.51.100.44', sport: 7000, dst: PUBLIC_IP, dport: 40003, what: '통화 상대가 그 매핑으로 직접 보냄 (다른 주소에서)' },
  { dir: 'in', proto: 'tcp', src: '198.51.100.44', sport: 52000, dst: PUBLIC_IP, dport: 443, what: '바깥 사람이 집의 NAS(443)에 접속하려 함' },
  { dir: 'in', proto: 'tcp', src: '203.0.113.50', sport: 61000, dst: PUBLIC_IP, dport: 3389, what: '누군가 원격 데스크톱 포트를 두드림' },
];

export interface NatRow {
  proto: Proto;
  inside: string;
  outside: string; // public ip:port
  peer: string; // remote ip:port the mapping was opened to
  forward?: boolean;
}
export interface NatFrame {
  rows: NatRow[];
  /** the event just handled, and how the router rewrote or dropped it */
  ev: NatEvent | null;
  after: { src: string; sport: number; dst: string; dport: number } | null;
  dropped: boolean;
  newRow: number;
  usedRow: number;
  note: string;
}

/** Replay the events through a port-translating NAT. */
export function natReplay(filter: NatFilter, forward443: boolean): NatFrame[] {
  const rows: NatRow[] = [];
  if (forward443) rows.push({ proto: 'tcp', inside: `${NAS}:443`, outside: `${PUBLIC_IP}:443`, peer: '아무나', forward: true });
  let nextPort = 40001;
  const frames: NatFrame[] = [{ rows: rows.map((r) => ({ ...r })), ev: null, after: null, dropped: false, newRow: -1, usedRow: -1, note: forward443 ? '공유기에 "443번으로 들어오는 TCP는 NAS로" 라는 포트 포워딩 규칙이 하나 있습니다.' : '변환 표가 비어 있습니다. 공유기의 공인 주소는 하나뿐입니다.' }];
  for (const ev of NAT_EVENTS) {
    let after: NatFrame['after'] = null;
    let dropped = false;
    let newRow = -1;
    let usedRow = -1;
    let note = '';
    if (ev.dir === 'out') {
      const inside = `${ev.src}:${ev.sport}`;
      let i = rows.findIndex((r) => !r.forward && r.proto === ev.proto && r.inside === inside && r.peer === `${ev.dst}:${ev.dport}`);
      if (i < 0) {
        rows.push({ proto: ev.proto, inside, outside: `${PUBLIC_IP}:${nextPort++}`, peer: `${ev.dst}:${ev.dport}` });
        i = rows.length - 1;
        newRow = i;
      } else usedRow = i;
      const [, port] = rows[i].outside.split(':');
      after = { src: PUBLIC_IP, sport: +port, dst: ev.dst, dport: ev.dport };
      note = `출발지 ${inside}를 ${rows[i].outside}로 바꿔 내보내고, 그 짝을 표에 적습니다.` + (ev.sport === 50001 && ev.src.endsWith('.12') ? ' 노트북과 출발 포트가 같아도 바깥 포트를 다르게 골라 응답을 구별할 수 있게 합니다.' : '');
    } else {
      const outside = `${ev.dst}:${ev.dport}`;
      const peer = `${ev.src}:${ev.sport}`;
      const i = rows.findIndex((r) => r.proto === ev.proto && r.outside === outside && (r.forward || filter === 'open' || r.peer === peer));
      if (i < 0) {
        dropped = true;
        const exists = rows.some((r) => r.proto === ev.proto && r.outside === outside);
        note = exists ? `${outside} 매핑은 있지만 ${rows.find((r) => r.outside === outside)!.peer}에게 연 것이라, 다른 주소(${peer})에서 온 패킷은 버립니다.` : `${outside}로 이어지는 줄이 표에 없습니다. 안쪽의 누구에게 줘야 할지 모르니 버립니다.`;
      } else {
        usedRow = i;
        const [ip, port] = rows[i].inside.split(':');
        after = { src: ev.src, sport: ev.sport, dst: ip, dport: +port };
        note = rows[i].forward ? `포트 포워딩 규칙에 따라 ${rows[i].inside}로 넘깁니다. 이제 이 NAS는 인터넷 전체에 열려 있습니다.` : rows[i].peer === peer ? `표에서 ${outside}의 짝을 찾아 목적지를 ${rows[i].inside}로 되돌립니다.` : `매핑을 아무 주소에게나 열어 두는 방식이라, 처음 보는 ${peer}의 패킷도 ${rows[i].inside}로 넘깁니다.`;
      }
    }
    frames.push({ rows: rows.map((r) => ({ ...r })), ev, after, dropped, newRow, usedRow, note });
  }
  return frames;
}

/* ─────────────── VPN encapsulation (WireGuard) ─────────────── */

export const LINK_MTU = 1500;
export const WG_HEADER = 16; // type(1) + reserved(3) + receiver index(4) + counter(8)
export const WG_TAG = 16; // Poly1305
export const UDP_HEADER = 8;
export const outerIpHeader = (v: 4 | 6) => (v === 4 ? 20 : 40);
/** Bytes a tunnel adds around each inner packet, before padding. */
export const wgOverhead = (v: 4 | 6) => outerIpHeader(v) + UDP_HEADER + WG_HEADER + WG_TAG;

export interface WgPacket {
  inner: number;
  padded: number;
  outer: number;
  overhead: number;
  fits: boolean;
}
/** WireGuard pads the plaintext to a multiple of 16 bytes, but never past the tunnel MTU. */
export function wgPacket(inner: number, v: 4 | 6, tunnelMtu: number): WgPacket {
  const padded = Math.min(Math.ceil(inner / 16) * 16, Math.max(inner, tunnelMtu));
  const outer = padded + wgOverhead(v);
  return { inner, padded, outer, overhead: outer - inner, fits: outer <= LINK_MTU };
}
/** The largest inner packet that still fits the link without fragmentation. */
export const maxInner = (v: 4 | 6) => LINK_MTU - wgOverhead(v);
