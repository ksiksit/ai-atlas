/* 패킷과 주소: pure logic for the layers and IP routing lessons */

/* ─────────────── Headers and encapsulation ─────────────── */

/** Minimum header sizes in bytes (no options). */
export const TCP_HEADER = 20;
export const IP_HEADER = 20;
export const ETH_HEADER = 14; // destination MAC 6 + source MAC 6 + EtherType 2
export const ETH_FCS = 4; // frame check sequence (CRC-32) at the end of the frame
/** Largest IP packet an Ethernet frame carries. */
export const MTU = 1500;
/** Largest TCP payload that fits: MTU − IP header − TCP header. */
export const MSS = MTU - IP_HEADER - TCP_HEADER;
/** Header bytes added to every packet by TCP, IP and Ethernet together. */
export const PER_PACKET = TCP_HEADER + IP_HEADER + ETH_HEADER + ETH_FCS;
/** Ethernet pads a frame's payload up to 46 bytes, so no frame is shorter than 64 bytes. */
export const ETH_MIN_PAYLOAD = 46;
/** Padding an Ethernet frame needs for a TCP segment carrying `payload` bytes. */
export const ethPadding = (payload: number) => Math.max(0, ETH_MIN_PAYLOAD - (payload + TCP_HEADER + IP_HEADER));

/** Payload sizes of the TCP segments an application message is cut into. */
export function segmentSizes(bytes: number, mss = MSS): number[] {
  const out: number[] = [];
  for (let left = bytes; left > 0; left -= mss) out.push(Math.min(mss, left));
  return out.length ? out : [0];
}

export interface Overhead {
  packets: number;
  header: number; // headers, trailers and padding: everything that is not application data
  wire: number; // bytes of all frames (without preamble and inter-frame gap)
  ratio: number; // header / wire
}

export function overhead(bytes: number, mss = MSS): Overhead {
  const sizes = segmentSizes(bytes, mss);
  const header = sizes.reduce((a, s) => a + PER_PACKET + ethPadding(s), 0);
  const wire = bytes + header;
  return { packets: sizes.length, header, wire, ratio: header / wire };
}

/* ─────────────── Store-and-forward pipelining ─────────────── */

export interface Pipeline {
  packets: number;
  /** finish[link][packet]: time (s) the packet has fully crossed that link. */
  start: number[][];
  finish: number[][];
  total: number;
}

/**
 * A message of `bytes` split into packets of at most `payload` bytes, each with `header` bytes
 * added, crossing `hops` identical store-and-forward links of `rate` bits per second.
 * A router forwards a packet only after receiving all of it. Propagation and processing are ignored.
 */
export function pipeline(bytes: number, payload: number, hops: number, header: number, rate: number): Pipeline {
  const sizes = segmentSizes(bytes, payload);
  const tx = sizes.map((s) => ((s + header) * 8) / rate);
  const start: number[][] = [];
  const finish: number[][] = [];
  for (let l = 0; l < hops; l++) {
    start.push([]);
    finish.push([]);
    for (let j = 0; j < sizes.length; j++) {
      const ready = l === 0 ? 0 : finish[l - 1][j]; // the whole packet has arrived at this router
      const free = j === 0 ? 0 : finish[l][j - 1]; // the link finished the previous packet
      const s = Math.max(ready, free);
      start[l].push(s);
      finish[l].push(s + tx[j]);
    }
  }
  return { packets: sizes.length, start, finish, total: finish[hops - 1][sizes.length - 1] };
}

/** Total time only, without keeping the schedule. */
export function pipelineTotal(bytes: number, payload: number, hops: number, header: number, rate: number): number {
  const sizes = segmentSizes(bytes, payload);
  const prev = new Float64Array(sizes.length);
  for (let l = 0; l < hops; l++) {
    let free = 0;
    for (let j = 0; j < sizes.length; j++) {
      const s = Math.max(prev[j], free);
      free = s + ((sizes[j] + header) * 8) / rate;
      prev[j] = free;
    }
  }
  return prev[sizes.length - 1];
}

/** Payload size (searched over a grid) that gets the message across fastest. */
export function bestPayload(bytes: number, hops: number, header: number, rate: number, lo = 20, hi = bytes, step = 4): { payload: number; total: number } {
  let best = { payload: hi, total: pipelineTotal(bytes, hi, hops, header, rate) };
  for (let p = lo; p <= hi; p += step) {
    const t = pipelineTotal(bytes, p, hops, header, rate);
    if (t < best.total - 1e-12) best = { payload: p, total: t };
  }
  return best;
}

/* ─────────────── Delay budget ─────────────── */

/** Signal speed in optical fibre: about two thirds of the speed of light in vacuum. */
export const FIBER_SPEED = 2e8; // m/s

export const transmissionDelay = (bytes: number, rate: number) => (bytes * 8) / rate;
export const propagationDelay = (meters: number) => meters / FIBER_SPEED;
/** Bits that fit "in the pipe" during one round trip. */
export const bdpBytes = (rate: number, rtt: number) => (rate * rtt) / 8;

/* ─────────────── IPv4 addresses ─────────────── */

/** Parse dotted decimal; null if invalid. The result is an unsigned 32-bit number. */
export function parseIPv4(s: string): number | null {
  const parts = s.trim().split('.');
  if (parts.length !== 4) return null;
  let v = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    v = v * 256 + n;
  }
  return v;
}

export const formatIPv4 = (v: number) => [24, 16, 8, 0].map((s) => Math.floor(v / 2 ** s) % 256).join('.');

/** Subnet mask for a prefix length, as an unsigned 32-bit number. */
export const maskOf = (len: number) => (len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0);
export const networkOf = (addr: number, len: number) => (addr & maskOf(len)) >>> 0;
export const broadcastOf = (addr: number, len: number) => (networkOf(addr, len) | (~maskOf(len) >>> 0)) >>> 0;

/** Addresses a host can use: /31 links use both (RFC 3021), /32 is one host. */
export function usableHosts(len: number): number {
  if (len === 32) return 1;
  if (len === 31) return 2;
  return 2 ** (32 - len) - 2;
}

export const bitsOf = (v: number) => v.toString(2).padStart(32, '0');

/** Well-known special ranges, most specific first. */
const SPECIAL: { net: string; len: number; name: string }[] = [
  { net: '127.0.0.0', len: 8, name: '루프백 (자기 자신)' },
  { net: '10.0.0.0', len: 8, name: '사설 주소 (RFC 1918)' },
  { net: '172.16.0.0', len: 12, name: '사설 주소 (RFC 1918)' },
  { net: '192.168.0.0', len: 16, name: '사설 주소 (RFC 1918)' },
  { net: '100.64.0.0', len: 10, name: '통신사 NAT용 공유 주소' },
  { net: '169.254.0.0', len: 16, name: '링크 로컬 (자동 설정)' },
  { net: '224.0.0.0', len: 4, name: '멀티캐스트' },
  { net: '0.0.0.0', len: 8, name: '"이 네트워크" (특수 용도)' },
  { net: '240.0.0.0', len: 4, name: '예약됨' },
];

export function addressKind(addr: number): string {
  for (const s of SPECIAL) {
    if (networkOf(addr, s.len) === parseIPv4(s.net)) return s.name;
  }
  return '공인 주소';
}

/* ─────────────── Longest prefix match ─────────────── */

export interface Route {
  prefix: string; // "10.20.0.0/16"
  hop: string; // next hop / interface label
}

export const parsePrefix = (p: string): { net: number; len: number } => {
  const [a, l] = p.split('/');
  return { net: parseIPv4(a)!, len: Number(l) };
};

export const matches = (addr: number, prefix: string) => {
  const { net, len } = parsePrefix(prefix);
  return networkOf(addr, len) === networkOf(net, len);
};

/** Index of the matching route with the longest prefix, or −1. */
export function longestMatch(table: Route[], addr: number): number {
  let best = -1;
  let bestLen = -1;
  table.forEach((r, i) => {
    const { len } = parsePrefix(r.prefix);
    if (matches(addr, r.prefix) && len > bestLen) {
      best = i;
      bestLen = len;
    }
  });
  return best;
}

/** Leading bits two addresses share. */
export function commonBits(a: number, b: number): number {
  const x = (a ^ b) >>> 0;
  return x === 0 ? 32 : Math.clz32(x);
}

/* ─────────────── Link-state routing ─────────────── */

export interface Link {
  a: number;
  b: number;
  cost: number;
}

export interface Spf {
  dist: number[];
  prev: number[];
  /** Routers in the order Dijkstra settled them. */
  order: number[];
  /** First router after the source on the shortest path to each router (−1: unreachable or self). */
  nextHop: number[];
}

/**
 * Dijkstra from `src` over the links that are up. Ties go to the lower-numbered router,
 * so every router computes the same tree from the same map.
 */
export function spf(n: number, links: Link[], down: Set<number>, src: number): Spf {
  const dist = Array(n).fill(Infinity);
  const prev = Array(n).fill(-1);
  const done = Array(n).fill(false);
  const order: number[] = [];
  dist[src] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    order.push(u);
    links.forEach((l, k) => {
      if (down.has(k)) return;
      const v = l.a === u ? l.b : l.b === u ? l.a : -1;
      if (v < 0 || done[v]) return;
      const d = dist[u] + l.cost;
      if (d < dist[v] || (d === dist[v] && u < prev[v])) {
        dist[v] = d;
        prev[v] = u;
      }
    });
  }
  const nextHop = dist.map((d, v) => {
    if (v === src || d === Infinity) return -1;
    let x = v;
    while (prev[x] !== src) x = prev[x];
    return x;
  });
  return { dist, prev, order, nextHop };
}

export function pathTo(s: Spf, v: number): number[] {
  if (s.dist[v] === Infinity) return [];
  const p = [v];
  while (s.prev[p[0]] !== -1) p.unshift(s.prev[p[0]]);
  return p;
}
