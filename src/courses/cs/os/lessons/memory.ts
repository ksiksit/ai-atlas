/* 운영체제: address translation with a TLB, and page replacement policies. */

/* ───────── a tiny machine: 12-bit virtual addresses, 256-byte pages, 8 physical frames ───────── */

export const OFF_BITS = 8;
export const PAGE_BITS = 4;
export const PAGES = 1 << PAGE_BITS; // 16
export const FRAMES = 8;
export const FRAME_BITS = 3;
export const TLB_SIZE = 4;

export type Region = 'code' | 'data' | 'heap' | 'none' | 'stack';
export const REGION_KO: Record<Region, string> = { code: '코드', data: '데이터', heap: '힙', none: '빈 곳', stack: '스택' };
/** what each virtual page holds: pages 10–13 were never allocated */
export const PAGE_REGION: Region[] = ['code', 'code', 'data', 'data', 'heap', 'heap', 'heap', 'heap', 'heap', 'heap', 'none', 'none', 'none', 'none', 'stack', 'stack'];

export interface Pte {
  valid: boolean; // in physical memory
  frame: number;
}
export interface VmState {
  pt: Pte[];
  tlb: { page: number; frame: number; used: number }[];
  frames: (number | null)[]; // page held by each frame
  lastUse: number[]; // per frame, for LRU eviction
  clock: number;
  acc: number;
  tlbHits: number;
  faults: number;
}
export type VmKind = 'tlb-hit' | 'tlb-miss' | 'fault' | 'segv';
export interface VmEvent {
  va: number;
  page: number;
  offset: number;
  kind: VmKind;
  frame: number;
  pa: number;
  evicted: number | null; // page thrown out of memory
  tlbEvicted: number | null;
}

export function vmInit(): VmState {
  const pt: Pte[] = Array.from({ length: PAGES }, () => ({ valid: false, frame: -1 }));
  const frames: (number | null)[] = Array(FRAMES).fill(null);
  // some pages are already in memory, scattered across frames
  const start: [number, number][] = [
    [0, 5],
    [1, 2],
    [2, 7],
    [14, 0],
    [15, 3],
  ];
  start.forEach(([p, f]) => {
    pt[p] = { valid: true, frame: f };
    frames[f] = p;
  });
  const lastUse = Array(FRAMES).fill(0);
  start.forEach(([, f], k) => (lastUse[f] = k + 1));
  return { pt, tlb: [], frames, lastUse, clock: start.length + 1, acc: 0, tlbHits: 0, faults: 0 };
}

export function vmAccess(s0: VmState, va: number): { s: VmState; ev: VmEvent } {
  const s: VmState = { ...s0, pt: s0.pt.map((e) => ({ ...e })), tlb: s0.tlb.map((e) => ({ ...e })), frames: [...s0.frames], lastUse: [...s0.lastUse] };
  const page = (va >> OFF_BITS) & (PAGES - 1);
  const offset = va & ((1 << OFF_BITS) - 1);
  const now = ++s.clock;
  s.acc++;
  const ev: VmEvent = { va, page, offset, kind: 'tlb-hit', frame: -1, pa: -1, evicted: null, tlbEvicted: null };
  if (PAGE_REGION[page] === 'none') {
    ev.kind = 'segv';
    return { s, ev };
  }
  const hit = s.tlb.find((e) => e.page === page);
  if (hit) {
    hit.used = now;
    s.tlbHits++;
    ev.frame = hit.frame;
  } else {
    ev.kind = 'tlb-miss';
    if (!s.pt[page].valid) {
      ev.kind = 'fault';
      s.faults++;
      // a free frame, or the least recently used one
      let f = s.frames.indexOf(null);
      if (f < 0) {
        f = s.lastUse.indexOf(Math.min(...s.lastUse));
        const old = s.frames[f]!;
        ev.evicted = old;
        s.pt[old] = { valid: false, frame: -1 };
        s.tlb = s.tlb.filter((e) => e.page !== old);
      }
      s.frames[f] = page;
      s.pt[page] = { valid: true, frame: f };
    }
    ev.frame = s.pt[page].frame;
    if (s.tlb.length >= TLB_SIZE) {
      const lru = s.tlb.reduce((a, b) => (b.used < a.used ? b : a));
      ev.tlbEvicted = lru.page;
      s.tlb = s.tlb.filter((e) => e !== lru);
    }
    s.tlb.push({ page, frame: ev.frame, used: now });
  }
  s.lastUse[ev.frame] = now;
  ev.pa = (ev.frame << OFF_BITS) | offset;
  return { s, ev };
}

export const hex = (v: number, digits: number) => '0x' + v.toString(16).toUpperCase().padStart(digits, '0');
export const bits = (v: number, n: number) => v.toString(2).padStart(n, '0');

/* ───────── page replacement on a reference string ───────── */

export type Repl = 'fifo' | 'lru' | 'clock' | 'opt';
export const REPL_NAMES: Record<Repl, string> = { fifo: 'FIFO', lru: 'LRU', clock: '시계', opt: '최적 (OPT)' };
export interface ReplStep {
  page: number;
  fault: boolean;
  frames: (number | null)[];
  slot: number; // the frame touched by this reference
  evicted: number | null;
  refBits: number[]; // clock only
  hand: number; // clock only: where the hand points after this reference
}

export function replace(refs: number[], n: number, algo: Repl): ReplStep[] {
  const frames: (number | null)[] = Array(n).fill(null);
  const stamp = Array(n).fill(-1); // FIFO: load time · LRU: last use
  const refBits = Array(n).fill(0);
  let hand = 0;
  const out: ReplStep[] = [];
  refs.forEach((page, i) => {
    let slot = frames.indexOf(page);
    let evicted: number | null = null;
    const fault = slot < 0;
    if (!fault) {
      if (algo === 'lru') stamp[slot] = i;
      refBits[slot] = 1;
    } else {
      slot = frames.indexOf(null);
      if (slot < 0) {
        if (algo === 'fifo' || algo === 'lru') slot = stamp.indexOf(Math.min(...stamp));
        else if (algo === 'opt') {
          // the page needed farthest in the future (or never again)
          let best = -1;
          frames.forEach((p, k) => {
            const nx = refs.indexOf(p as number, i + 1);
            const d = nx < 0 ? Infinity : nx;
            if (best < 0 || d > best) {
              best = d;
              slot = k;
            }
          });
        } else {
          // clock: clear reference bits until one is already 0
          while (refBits[hand] === 1) {
            refBits[hand] = 0;
            hand = (hand + 1) % n;
          }
          slot = hand;
        }
        evicted = frames[slot];
      }
      frames[slot] = page;
      stamp[slot] = i;
      refBits[slot] = 1;
      if (algo === 'clock') hand = (slot + 1) % n;
    }
    out.push({ page, fault, frames: [...frames], slot, evicted, refBits: [...refBits], hand });
  });
  return out;
}

export const faultCount = (refs: number[], n: number, algo: Repl) => replace(refs, n, algo).filter((s) => s.fault).length;

export function parseRefs(text: string): number[] {
  return (text.match(/\d/g) ?? []).map(Number).slice(0, 24);
}
