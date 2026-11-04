/* 컴퓨터 구조 · C와 메모리: small hand-written models of what a C program does to memory.
   Nothing here runs C. Each figure replays what a real x86-64 machine would do
   (little-endian bytes, 8-byte pointers, a stack that grows down, a first-fit heap),
   with short round addresses so they fit on screen. Real addresses are longer and
   real compilers may order variables differently. */

import { rng } from '../../../../lib/math';

/** One byte as two hex digits. */
export const hx = (b: number) => (b & 0xff).toString(16).toUpperCase().padStart(2, '0');
/** A short address like 0x100C. */
export const ad = (a: number) => '0x' + a.toString(16).toUpperCase().padStart(4, '0');

export type Kind = 'char' | 'int' | 'double' | 'ptr';
export const SIZE: Record<Kind, number> = { char: 1, int: 4, double: 8, ptr: 8 };

/** Bytes of a value in memory order (lowest address first, little-endian). */
export function encode(kind: Kind, v: number): number[] {
  const dv = new DataView(new ArrayBuffer(SIZE[kind]));
  if (kind === 'char') dv.setUint8(0, v & 0xff);
  else if (kind === 'int') dv.setInt32(0, v | 0, true);
  else if (kind === 'double') dv.setFloat64(0, v, true);
  else {
    dv.setUint32(0, v >>> 0, true);
    dv.setUint32(4, 0, true);
  }
  return Array.from(new Uint8Array(dv.buffer));
}

/** Read a value of this kind from bytes in memory order. */
export function decode(kind: Kind, bytes: number[]): number {
  const dv = new DataView(new Uint8Array(bytes).buffer);
  if (kind === 'char') return dv.getUint8(0);
  if (kind === 'int') return dv.getInt32(0, true);
  if (kind === 'double') return dv.getFloat64(0, true);
  return dv.getUint32(0, true);
}

/** Deterministic "leftover" bytes for memory nobody has written yet. */
export function garbage(n: number, seed: number): number[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => Math.floor(r() * 256));
}

export const printable = (b: number) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : null);

/** A char the way C source would write it. */
export function cChar(b: number) {
  if (b === 0) return "'\\0'";
  const p = printable(b);
  return p ? `'${p}'` : `\\x${hx(b)}`;
}

/** A double for a readout: plain when it is a normal size, scientific otherwise. */
export function fmtNum(v: number) {
  if (!isFinite(v)) return String(v);
  if (v !== 0 && (Math.abs(v) < 1e-4 || Math.abs(v) >= 1e9)) return v.toExponential(3);
  return String(+v.toPrecision(8));
}

/* ─────────────── Pointers, figure 1: x, y, c and a pointer p ─────────────── */

export interface PVar {
  name: string;
  kind: Kind;
  addr: number;
}
export const P1_BASE = 0x1000;
export const P1_LEN = 24;
export const P1_VARS: PVar[] = [
  { name: 'x', kind: 'int', addr: 0x1000 },
  { name: 'y', kind: 'int', addr: 0x1004 },
  { name: 'c', kind: 'char', addr: 0x1008 },
  { name: 'p', kind: 'ptr', addr: 0x1010 },
];
export const P1_LINES = ['int  x = 42;', 'int  y = 100;', "char c = 'A';", 'int *p = &x;', '*p = 7;', 'p = &y;', '*p = *p + 1;'];

export interface P1Frame {
  line: number; // index into P1_LINES, -1 before the first line
  mem: number[];
  declared: Set<string>;
  read: Set<number>;
  written: Set<number>;
  note: string;
}

export function pointerFrames(): P1Frame[] {
  const mem = garbage(P1_LEN, 7);
  const declared = new Set<string>();
  const out: P1Frame[] = [];
  const vr = (n: string) => P1_VARS.find((v) => v.name === n)!;
  const range = (v: PVar) => Array.from({ length: SIZE[v.kind] }, (_, k) => v.addr + k);
  const get = (n: string) => {
    const v = vr(n);
    return decode(v.kind, mem.slice(v.addr - P1_BASE, v.addr - P1_BASE + SIZE[v.kind]));
  };
  const put = (n: string, val: number) => {
    const v = vr(n);
    encode(v.kind, val).forEach((b, k) => (mem[v.addr - P1_BASE + k] = b));
  };
  const snap = (line: number, note: string, read: number[] = [], written: number[] = []) =>
    out.push({ line, mem: mem.slice(), declared: new Set(declared), read: new Set(read), written: new Set(written), note });

  snap(-1, '아직 아무 줄도 실행하지 않았습니다. 메모리에는 전에 쓰던 값이 그대로 남아 있습니다(흐린 바이트). C는 메모리를 0으로 지워 주지 않습니다.');
  declared.add('x');
  put('x', 42);
  snap(0, 'x는 0x1000부터 4바이트입니다. 42는 16진수로 0x2A이고, 작은 자리 바이트가 낮은 주소에 놓입니다(리틀 엔디언): 2A 00 00 00.', [], range(vr('x')));
  declared.add('y');
  put('y', 100);
  snap(1, 'y는 바로 다음 4바이트, 0x1004부터입니다. 100 = 0x64.', [], range(vr('y')));
  declared.add('c');
  put('c', 65);
  snap(2, "char는 1바이트입니다. 'A'는 아스키 코드 65 = 0x41. 그다음 7바이트는 비워 둡니다. 8바이트짜리 포인터는 8의 배수 주소에서 시작해야 빨리 읽히기 때문입니다(정렬).", [], range(vr('c')));
  declared.add('p');
  put('p', 0x1000);
  snap(3, '&x는 "x의 주소"입니다. p에는 0x1000이라는 수가 8바이트로 담깁니다: 00 10 00 00 00 00 00 00. 포인터는 주소를 담은 평범한 변수입니다.', [], range(vr('p')));
  put('x', 7);
  snap(4, '*p는 "p에 담긴 주소에 있는 것"입니다. CPU는 p를 읽어 0x1000을 얻고, 그 주소에 7을 씁니다. x라는 이름을 쓰지 않았는데 x가 바뀌었습니다.', range(vr('p')), range(vr('x')));
  put('p', 0x1004);
  snap(5, 'p에 새 주소를 넣으면 이제 y를 가리킵니다. x는 그대로이고 p의 바이트만 04 10 …으로 바뀌었습니다.', [], range(vr('p')));
  put('y', get('y') + 1);
  snap(6, '*p를 읽고(100) 1을 더해 다시 *p에 씁니다. 결국 y = 101. 오른쪽의 *p는 읽기, 왼쪽의 *p는 쓰기입니다.', [...range(vr('p')), ...range(vr('y'))], range(vr('y')));
  return out;
}

/* ─────────────── Pointers, figure 2: an array is base + i × sizeof ─────────────── */

export type ElemKind = 'char' | 'int' | 'double';
export const ARR_BASE = 0x2000;
export const ARR_N = 5;
export const ARR_VALS: Record<ElemKind, number[]> = {
  char: [72, 101, 108, 108, 111],
  int: [10, 20, 30, 40, 50],
  double: [1.5, -2.25, 3.14, 0.1, 100],
};
export const ARR_DECL: Record<ElemKind, string> = {
  char: "char a[5] = {'H', 'e', 'l', 'l', 'o'};",
  int: 'int a[5] = {10, 20, 30, 40, 50};',
  double: 'double a[5] = {1.5, -2.25, 3.14, 0.1, 100};',
};
export const BALANCE = 5000;

export interface ArrMem {
  bytes: number[];
  /** owner of each byte: element index, 'bal' for the neighbouring int, or null for leftovers */
  owner: (number | 'bal' | null)[];
  balAddr: number;
}

/** The array, then the next variable (int balance = 5000), then leftover bytes. */
export function arrayMemory(kind: ElemKind, maxI: number): ArrMem {
  const size = SIZE[kind];
  const arrEnd = ARR_N * size;
  const balOff = Math.ceil(arrEnd / 4) * 4;
  const len = Math.ceil(Math.max((maxI + 1) * size, balOff + 4) / 8) * 8;
  const bytes = garbage(len, 11 + size);
  const owner: (number | 'bal' | null)[] = Array(len).fill(null);
  ARR_VALS[kind].forEach((v, i) => {
    encode(kind, v).forEach((b, k) => {
      bytes[i * size + k] = b;
      owner[i * size + k] = i;
    });
  });
  encode('int', BALANCE).forEach((b, k) => {
    bytes[balOff + k] = b;
    owner[balOff + k] = 'bal';
  });
  return { bytes, owner, balAddr: ARR_BASE + balOff };
}

/* ─────────────── Stack & heap, figure 2: stack frames ─────────────── */

export const STACK_TOP = 0x8000;
export const STACK_BYTES = 96;
export const STACK_LIMIT = STACK_TOP - STACK_BYTES;

export interface Slot {
  name: string;
  addr: number;
  size: number;
  val: number | null; // null = never written (leftover bytes)
  ret?: string; // for the return-address slot: where it goes back to
}
export interface SFrame {
  fn: string;
  label: string;
  base: number; // one past the highest byte of the frame
  size: number;
  slots: Slot[];
  over?: boolean;
}
export interface StackSnap {
  line: number;
  frames: SFrame[];
  ghosts: SFrame[];
  note: string;
  sp: number;
  out: string[];
  changed: string | null; // "depth:name" of the slot just written
  overflow: boolean;
}

const cloneF = (f: SFrame): SFrame => ({ ...f, slots: f.slots.map((s) => ({ ...s })) });

class Tracer {
  frames: SFrame[] = [];
  ghosts: (SFrame | undefined)[] = [];
  snaps: StackSnap[] = [];
  out: string[] = [];
  sp = STACK_TOP;
  changed: string | null = null;

  /** Push a frame: return address, then arguments and locals (4-byte ints), rounded up to 16 bytes. */
  push(fn: string, label: string, args: [string, number][], locals: string[], retTo: string): boolean {
    const n = args.length + locals.length;
    const size = Math.ceil((8 + 4 * n) / 16) * 16;
    const base = this.sp;
    const slots: Slot[] = [{ name: '돌아갈 주소', addr: base - 8, size: 8, val: 0, ret: retTo }];
    args.forEach(([name, v], k) => slots.push({ name, addr: base - 12 - 4 * k, size: 4, val: v }));
    locals.forEach((name, k) => slots.push({ name, addr: base - 12 - 4 * (args.length + k), size: 4, val: null }));
    const f: SFrame = { fn, label, base, size, slots };
    const d = this.frames.length;
    this.ghosts[d] = undefined;
    if (base - size < STACK_LIMIT) {
      f.over = true;
      this.frames.push(f);
      return false;
    }
    this.frames.push(f);
    this.sp = base - size;
    this.changed = null;
    return true;
  }
  set(name: string, v: number) {
    const d = this.frames.length - 1;
    const s = this.frames[d].slots.find((x) => x.name === name)!;
    s.val = v;
    this.changed = `${d}:${name}`;
  }
  pop() {
    const f = this.frames.pop()!;
    this.ghosts[this.frames.length] = f;
    this.sp = f.base;
    this.changed = null;
  }
  snap(line: number, note: string, overflow = false) {
    const d = this.frames.length;
    this.snaps.push({
      line,
      frames: this.frames.map(cloneF),
      ghosts: this.ghosts.slice(d).filter((g): g is SFrame => !!g).map(cloneF),
      note,
      sp: this.sp,
      out: this.out.slice(),
      changed: this.changed,
      overflow,
    });
    this.changed = null;
  }
}

export type StackProg = 'sum' | 'fact' | 'inf';

export const STACK_SRC: Record<StackProg, string[]> = {
  sum: [
    'int square(int v) {',
    '  int r = v * v;',
    '  return r;',
    '}',
    '',
    'int sum_squares(int n) {',
    '  int total = 0;',
    '  for (int i = 1; i <= n; i++)',
    '    total += square(i);',
    '  return total;',
    '}',
    '',
    'int main(void) {',
    '  int s = sum_squares(N);',
    '  printf("%d\\n", s);',
    '  return 0;',
    '}',
  ],
  fact: [
    'int fact(int n) {',
    '  if (n <= 1) return 1;',
    '  int rest = fact(n - 1);',
    '  return n * rest;',
    '}',
    '',
    'int main(void) {',
    '  int x = fact(N);',
    '  printf("%d\\n", x);',
    '  return 0;',
    '}',
  ],
  inf: ['int f(int n) {', '  int r = f(n + 1);  // 멈추는 조건이 없다', '  return r + 1;', '}', '', 'int main(void) {', '  return f(1);', '}'],
};

export function stackTrace(prog: StackProg, n: number): StackSnap[] {
  const t = new Tracer();
  if (prog === 'sum') {
    t.push('main', 'main()', [], ['s'], 'C 런타임');
    t.snap(13, '운영체제가 프로그램을 띄우면 C 런타임이 main을 부릅니다. main의 프레임에는 돌아갈 주소와 지역 변수 s의 자리가 생깁니다. s에는 아직 값을 넣지 않아 쓰레기 값(?)이 들어 있습니다.');
    t.snap(14, `sum_squares(${n})을 부릅니다. CPU는 돌아올 곳(main 14행)을 스택에 적고 sum_squares의 첫 명령어로 점프합니다.`);
    t.push('sum_squares', `sum_squares(n = ${n})`, [['n', n]], ['total', 'i'], 'main 14행');
    t.snap(6, '새 프레임이 main 아래(낮은 주소)에 쌓이고, 스택 포인터(sp)가 그만큼 내려갑니다. 인자 n과 지역 변수 total, i의 자리가 이 프레임 안에 있습니다.');
    t.set('total', 0);
    t.snap(7, 'total = 0.');
    let total = 0;
    for (let i = 1; i <= n; i++) {
      t.set('i', i);
      t.snap(8, `i = ${i}. i <= n이 참이므로 본문으로 갑니다.`);
      t.push('square', `square(v = ${i})`, [['v', i]], ['r'], 'sum_squares 9행');
      t.snap(1, `square(${i})을 부릅니다. 프레임이 하나 더 쌓여 지금 스택에 세 함수가 있습니다.`);
      t.set('r', i * i);
      t.snap(2, `r = ${i} × ${i} = ${i * i}.`);
      t.snap(3, 'return r: 결과를 레지스터에 담고, 스택에 적어 둔 주소(sum_squares 9행)로 돌아갑니다.');
      t.pop();
      total += i * i;
      t.set('total', total);
      t.snap(9, `square의 프레임은 sp가 다시 올라가면서 사라졌습니다(점선). 바이트는 지워지지 않고 남아 있지만 이제 아무 의미가 없습니다. total += ${i * i} → ${total}.`);
    }
    t.set('i', n + 1);
    t.snap(8, `i = ${n + 1}. i <= n이 거짓이므로 반복을 끝냅니다.`);
    t.snap(10, `return total (${total}).`);
    t.pop();
    t.set('s', total);
    t.snap(14, `main 14행으로 돌아와 s = ${total}. sum_squares의 프레임도 사라졌습니다.`);
    t.out.push(String(total));
    t.snap(15, 'printf가 출력합니다. printf도 함수라서 부르는 동안에는 자기 프레임을 쌓았다가 치웁니다.');
    t.snap(16, 'main이 끝나면 C 런타임으로 돌아가고 프로세스가 끝납니다.');
  } else if (prog === 'fact') {
    t.push('main', 'main()', [], ['x'], 'C 런타임');
    t.snap(7, 'main의 프레임. x에는 아직 쓰레기 값이 있습니다.');
    const f = (k: number, retTo: string): number => {
      t.push('fact', `fact(n = ${k})`, [['n', k]], ['rest'], retTo);
      t.snap(1, `fact(${k})의 프레임이 쌓입니다. 같은 함수라도 호출마다 자기 n과 rest를 따로 갖습니다.`);
      if (k <= 1) {
        t.snap(2, 'n <= 1이므로 1을 돌려줍니다. 여기가 가장 깊은 곳입니다.');
        t.pop();
        return 1;
      }
      t.snap(3, `n > 1이므로 fact(${k - 1})을 부릅니다. 이 프레임은 rest를 채우지 못한 채 기다립니다.`);
      const r = f(k - 1, 'fact 3행');
      t.set('rest', r);
      t.snap(3, `fact(${k - 1})이 ${r}을 돌려줬습니다. 그 프레임은 사라지고 rest = ${r}.`);
      t.snap(4, `return n × rest = ${k} × ${r} = ${k * r}.`);
      t.pop();
      return k * r;
    };
    t.snap(8, `fact(${n})을 부릅니다.`);
    const x = f(n, 'main 8행');
    t.set('x', x);
    t.snap(8, `모든 fact 프레임이 쌓인 반대 순서로 사라졌고, x = ${x}.`);
    t.out.push(String(x));
    t.snap(9, 'printf로 출력합니다.');
    t.snap(10, 'main이 끝납니다.');
  } else {
    t.push('main', 'main()', [], [], 'C 런타임');
    t.snap(6, `main의 프레임. 이 그림의 스택은 ${STACK_BYTES}바이트뿐입니다(실제 리눅스의 기본값은 8MB).`);
    t.snap(7, 'f(1)을 부릅니다.');
    for (let k = 1; ; k++) {
      const ok = t.push('f', `f(n = ${k})`, [['n', k]], ['r'], k === 1 ? 'main 7행' : 'f 2행');
      if (!ok) {
        t.snap(1, `f(${k})의 프레임을 쌓으려는데 스택의 끝을 넘습니다. 운영체제는 스택 바로 아래에 접근 금지 페이지를 두므로, 여기를 건드리는 순간 프로그램이 "Segmentation fault"로 죽습니다. 이것이 스택 오버플로입니다.`, true);
        break;
      }
      t.snap(1, `f(${k})의 프레임이 쌓입니다. 스택을 ${STACK_TOP - t.sp}바이트 썼습니다.`);
      t.snap(2, `r을 채우려면 f(${k + 1})이 끝나야 하는데, f(${k + 1})도 똑같이 다음을 부릅니다. 아무도 돌아오지 못합니다.`);
    }
  }
  return t.snaps;
}

/* ─────────────── Stack & heap, figure 3: a first-fit heap ─────────────── */

export const HEAP_BASE = 0x1000;
export const UNIT = 8; // bytes per cell
export const HEAP_UNITS = 32; // 256 bytes
export type Fit = 'first' | 'best';

export interface HBlock {
  start: number; // in units
  units: number; // header included
  free: boolean;
  name?: string;
  req?: number; // bytes asked for
}
export interface Heap {
  blocks: HBlock[];
  next: number;
}

export const heapInit = (): Heap => ({ blocks: [{ start: 0, units: HEAP_UNITS, free: true }], next: 1 });
/** Units a request needs: one 8-byte header plus the payload rounded up to 8. */
export const unitsFor = (bytes: number) => 1 + Math.max(1, Math.ceil(bytes / UNIT));
/** Largest request a free block can satisfy. */
export const payload = (b: HBlock) => (b.units - 1) * UNIT;
export const blockAddr = (b: HBlock) => HEAP_BASE + b.start * UNIT + UNIT;

export function hmalloc(h: Heap, bytes: number, fit: Fit): { heap: Heap; block: HBlock | null } {
  const need = unitsFor(bytes);
  const cands = h.blocks.map((b, k) => ({ b, k })).filter(({ b }) => b.free && b.units >= need);
  if (!cands.length) return { heap: h, block: null };
  const pick = fit === 'first' ? cands[0] : cands.reduce((m, c) => (c.b.units < m.b.units ? c : m));
  const blocks = h.blocks.map((b) => ({ ...b }));
  const old = blocks[pick.k];
  const rest = old.units - need;
  const taken: HBlock = { start: old.start, units: rest >= 2 ? need : old.units, free: false, name: `p${h.next}`, req: bytes };
  const repl = rest >= 2 ? [taken, { start: old.start + need, units: rest, free: true }] : [taken];
  blocks.splice(pick.k, 1, ...repl);
  return { heap: { blocks, next: h.next + 1 }, block: taken };
}

export function coalesce(blocks: HBlock[]): HBlock[] {
  const out: HBlock[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && last.free && b.free) last.units += b.units;
    else out.push({ ...b });
  }
  return out;
}

export function hfree(h: Heap, name: string, merge: boolean): Heap {
  const blocks = h.blocks.map((b) => (b.name === name ? { start: b.start, units: b.units, free: true } : { ...b }));
  return { ...h, blocks: merge ? coalesce(blocks) : blocks };
}

/* ─────────────── Stack & heap, figure 4: classic bugs ─────────────── */

export interface BVar {
  id: string;
  name: string;
  val: string;
  to?: string; // id of what it points to (a heap block or another stack variable)
  bad?: boolean; // points somewhere it should not, even if that place is alive
}
export interface BFrame {
  fn: string;
  vars: BVar[];
  ghost?: boolean;
}
export interface BBlock {
  id: string;
  addr: string;
  text: string;
  state: 'live' | 'freed' | 'orphan';
}
export interface BugStep {
  line: number;
  stack: BFrame[];
  heap: BBlock[];
  note: string;
  tone?: 'bad' | 'good';
  freeList?: string;
  out?: string;
  usage?: number; // heap bytes in use, for the leak chart
  req?: number; // requests handled so far
}
export type BugId = 'dangling' | 'uaf' | 'double' | 'leak';

export const BUG_SRC: Record<Exclude<BugId, 'leak'>, string[]> = {
  dangling: [
    'int *make_counter(void) {',
    '  int count = 0;',
    '  return &count;   // 지역 변수의 주소!',
    '}',
    'void other(void) {',
    '  int junk = 999;',
    '}',
    'int main(void) {',
    '  int *c = make_counter();',
    '  other();',
    '  printf("%d\\n", *c);',
    '}',
  ],
  uaf: ['char *name = malloc(16);', 'strcpy(name, "kim");', 'free(name);', 'char *pw = malloc(16);', 'strcpy(pw, "s3cret");', 'printf("%s\\n", name);'],
  double: ['char *a = malloc(16);', 'char *b = a;      // 같은 블록, 이름 둘', 'free(a);', 'free(b);          // 또 해제', 'char *x = malloc(16);', 'char *y = malloc(16);'],
};
export const leakSrc = (fixed: boolean) => [
  'void handle(int id) {',
  '  char *buf = malloc(1024);',
  '  sprintf(buf, "request %d", id);',
  '  send(buf);',
  fixed ? '  free(buf);' : '  // free(buf);  ← 빠졌다',
  '}',
  'int main(void) {',
  '  for (int id = 0; ; id++)',
  '    handle(id);',
  '}',
];

const m = (vars: BVar[]): BFrame => ({ fn: 'main', vars });

export const BUG_STEPS: Record<Exclude<BugId, 'leak'>, BugStep[]> = {
  dangling: [
    { line: 8, stack: [m([{ id: 'c', name: 'c', val: '?' }])], heap: [], note: 'main이 시작됩니다. 포인터 c에는 아직 쓰레기 값이 있습니다.' },
    { line: 2, stack: [m([{ id: 'c', name: 'c', val: '?' }]), { fn: 'make_counter', vars: [{ id: 'count', name: 'count', val: '0' }] }], heap: [], note: 'make_counter의 프레임이 쌓이고 지역 변수 count = 0. count는 주소 0x7FD4에 있습니다.' },
    { line: 3, stack: [m([{ id: 'c', name: 'c', val: '?' }]), { fn: 'make_counter', vars: [{ id: 'count', name: 'count', val: '0' }] }], heap: [], note: '&count, 즉 0x7FD4를 돌려줍니다. 컴파일러는 "function returns address of local variable" 경고를 내지만 컴파일은 됩니다.' },
    {
      line: 9,
      stack: [m([{ id: 'c', name: 'c', val: '0x7FD4', to: 'count' }]), { fn: 'make_counter', vars: [{ id: 'count', name: 'count', val: '0' }], ghost: true }],
      heap: [],
      tone: 'bad',
      note: 'make_counter가 끝나 프레임이 사라졌습니다(점선). 0이라는 바이트는 아직 남아 있지만 이 자리는 이제 누구 것도 아닙니다. c는 사라진 변수를 가리키는 댕글링 포인터입니다.',
    },
    {
      line: 6,
      stack: [m([{ id: 'c', name: 'c', val: '0x7FD4', to: 'junk', bad: true }]), { fn: 'other', vars: [{ id: 'junk', name: 'junk', val: '999' }] }],
      heap: [],
      tone: 'bad',
      note: 'other()의 프레임이 정확히 같은 자리에 쌓이고, junk = 999가 count가 있던 바이트를 덮어씁니다. c는 이제 남의 변수를 가리킵니다.',
    },
    {
      line: 11,
      stack: [m([{ id: 'c', name: 'c', val: '0x7FD4', to: 'junk' }]), { fn: 'other', vars: [{ id: 'junk', name: 'junk', val: '999' }], ghost: true }],
      heap: [],
      tone: 'bad',
      out: '999',
      note: '*c를 읽으니 0이 아니라 999가 나옵니다. 최적화 옵션에 따라 0이 나올 수도, 프로그램이 죽을 수도 있습니다. C 표준은 이런 코드를 "정의되지 않은 동작"이라 부르고 결과를 아무것도 약속하지 않습니다.',
    },
  ],
  uaf: [
    { line: 1, stack: [m([{ id: 'name', name: 'name', val: '0x1010', to: 'A' }, { id: 'pw', name: 'pw', val: '?' }])], heap: [{ id: 'A', addr: '0x1010', text: '?? (16바이트)', state: 'live' }], note: 'malloc이 힙에서 16바이트 블록을 찾아 그 주소 0x1010을 돌려줍니다. 포인터 name은 스택에, 블록은 힙에 있습니다.' },
    { line: 2, stack: [m([{ id: 'name', name: 'name', val: '0x1010', to: 'A' }, { id: 'pw', name: 'pw', val: '?' }])], heap: [{ id: 'A', addr: '0x1010', text: '"kim"', state: 'live' }], note: '블록에 "kim"과 끝 표시 \\0을 씁니다.' },
    {
      line: 3,
      stack: [m([{ id: 'name', name: 'name', val: '0x1010', to: 'A' }, { id: 'pw', name: 'pw', val: '?' }])],
      heap: [{ id: 'A', addr: '0x1010', text: '"kim" (해제됨)', state: 'freed' }],
      tone: 'bad',
      note: 'free는 블록을 빈 목록에 돌려줄 뿐 name의 값은 건드리지 않습니다. name은 여전히 0x1010을 담고 있는 댕글링 포인터입니다.',
    },
    {
      line: 4,
      stack: [m([{ id: 'name', name: 'name', val: '0x1010', to: 'A', bad: true }, { id: 'pw', name: 'pw', val: '0x1010', to: 'A' }])],
      heap: [{ id: 'A', addr: '0x1010', text: '?? (16바이트)', state: 'live' }],
      tone: 'bad',
      note: '같은 크기를 다시 malloc하면 할당기는 방금 돌려받은 블록을 그대로 내줍니다. 이제 name과 pw가 같은 블록을 가리킵니다.',
    },
    { line: 5, stack: [m([{ id: 'name', name: 'name', val: '0x1010', to: 'A', bad: true }, { id: 'pw', name: 'pw', val: '0x1010', to: 'A' }])], heap: [{ id: 'A', addr: '0x1010', text: '"s3cret"', state: 'live' }], tone: 'bad', note: 'pw에 비밀번호를 씁니다.' },
    {
      line: 6,
      stack: [m([{ id: 'name', name: 'name', val: '0x1010', to: 'A', bad: true }, { id: 'pw', name: 'pw', val: '0x1010', to: 'A' }])],
      heap: [{ id: 'A', addr: '0x1010', text: '"s3cret"', state: 'live' }],
      tone: 'bad',
      out: 's3cret',
      note: '이름을 찍으려 했는데 비밀번호가 나옵니다. 반대로 name으로 쓰면 pw의 내용이 망가집니다. 해제한 메모리를 다시 쓰는 버그는 실제 보안 사고의 흔한 원인이라, 브라우저와 운영체제 개발팀이 가장 경계하는 종류입니다.',
    },
  ],
  double: [
    { line: 1, stack: [m([{ id: 'a', name: 'a', val: '0x1010', to: 'A' }, { id: 'b', name: 'b', val: '?' }, { id: 'x', name: 'x', val: '?' }, { id: 'y', name: 'y', val: '?' }])], heap: [{ id: 'A', addr: '0x1010', text: '16바이트', state: 'live' }], freeList: '비어 있음', note: '블록 하나를 받습니다.' },
    { line: 2, stack: [m([{ id: 'a', name: 'a', val: '0x1010', to: 'A' }, { id: 'b', name: 'b', val: '0x1010', to: 'A' }, { id: 'x', name: 'x', val: '?' }, { id: 'y', name: 'y', val: '?' }])], heap: [{ id: 'A', addr: '0x1010', text: '16바이트', state: 'live' }], freeList: '비어 있음', note: 'b = a는 주소만 복사합니다. 블록은 하나, 이름은 둘입니다. 이 블록을 누가 해제할 책임이 있는지가 흐려지는 순간입니다.' },
    { line: 3, stack: [m([{ id: 'a', name: 'a', val: '0x1010', to: 'A' }, { id: 'b', name: 'b', val: '0x1010', to: 'A' }, { id: 'x', name: 'x', val: '?' }, { id: 'y', name: 'y', val: '?' }])], heap: [{ id: 'A', addr: '0x1010', text: '(해제됨)', state: 'freed' }], freeList: '0x1010 → 끝', note: 'free(a). 블록이 빈 목록에 들어갑니다. 할당기는 빈 블록 안에 "다음 빈 블록의 주소"를 적어 목록을 잇습니다.' },
    {
      line: 4,
      stack: [m([{ id: 'a', name: 'a', val: '0x1010', to: 'A' }, { id: 'b', name: 'b', val: '0x1010', to: 'A' }, { id: 'x', name: 'x', val: '?' }, { id: 'y', name: 'y', val: '?' }])],
      heap: [{ id: 'A', addr: '0x1010', text: '(해제됨) 다음 → 0x1010', state: 'freed' }],
      freeList: '0x1010 → 0x1010 → 0x1010 → …',
      tone: 'bad',
      note: 'free(b)는 같은 블록을 또 넣습니다. 블록이 목록에 두 번 들어가 자기 자신을 가리키는 고리가 생겼습니다. 요즘 glibc는 이런 경우 대부분 "free(): double free detected"를 찍고 프로그램을 멈추지만, 모든 경우를 잡지는 못합니다.',
    },
    { line: 5, stack: [m([{ id: 'a', name: 'a', val: '0x1010', to: 'A' }, { id: 'b', name: 'b', val: '0x1010', to: 'A' }, { id: 'x', name: 'x', val: '0x1010', to: 'A' }, { id: 'y', name: 'y', val: '?' }])], heap: [{ id: 'A', addr: '0x1010', text: '16바이트', state: 'live' }], freeList: '0x1010 → …', tone: 'bad', note: 'x가 목록 맨 앞의 0x1010을 받습니다. 그런데 목록에는 아직 0x1010이 남아 있습니다.' },
    {
      line: 6,
      stack: [m([{ id: 'a', name: 'a', val: '0x1010', to: 'A' }, { id: 'b', name: 'b', val: '0x1010', to: 'A' }, { id: 'x', name: 'x', val: '0x1010', to: 'A', bad: true }, { id: 'y', name: 'y', val: '0x1010', to: 'A', bad: true }])],
      heap: [{ id: 'A', addr: '0x1010', text: '16바이트', state: 'live' }],
      freeList: '…',
      tone: 'bad',
      note: 'y도 0x1010을 받습니다. 서로 다른 데이터라고 믿는 x와 y가 같은 16바이트를 나눠 씁니다. 한쪽에 쓰면 다른 쪽이 조용히 망가집니다.',
    },
  ],
};

export const LEAK_REQS = 6;
export const LEAK_BLOCK = 1024;

export function leakSteps(fixed: boolean): BugStep[] {
  const out: BugStep[] = [];
  const blocks: BBlock[] = [];
  let usage = 0;
  out.push({ line: 7, stack: [m([{ id: 'id', name: 'id', val: '0' }])], heap: [], note: '서버가 요청을 하나씩 처리하는 반복문이라고 해 봅시다.', usage: 0, req: 0 });
  const addrOf = (i: number) => ad(0x1010 + (fixed ? 0 : i * 0x410));
  for (let i = 0; i < LEAK_REQS; i++) {
    const main = m([{ id: 'id', name: 'id', val: String(i) }]);
    const id = fixed ? 'B0' : `B${i}`;
    if (fixed) blocks.length = 0;
    blocks.push({ id, addr: addrOf(i), text: '1024바이트', state: 'live' });
    usage += LEAK_BLOCK;
    const fr = (): BFrame => ({ fn: 'handle', vars: [{ id: 'hid', name: 'id', val: String(i) }, { id: 'buf', name: 'buf', val: addrOf(i), to: id }] });
    const heap = () => blocks.map((b) => ({ ...b }));
    out.push({ line: 2, stack: [main, fr()], heap: heap(), note: `요청 ${i}: malloc(1024)로 버퍼를 받습니다${fixed && i > 0 ? '. 방금 돌려준 블록을 다시 받으므로 주소가 같습니다' : ''}.`, usage, req: i });
    blocks[blocks.length - 1].text = `"request ${i}"`;
    out.push({ line: 4, stack: [main, fr()], heap: heap(), note: '버퍼를 채워 보냅니다.', usage, req: i });
    if (fixed) {
      blocks[blocks.length - 1].state = 'freed';
      usage -= LEAK_BLOCK;
      out.push({ line: 5, stack: [main, fr()], heap: heap(), tone: 'good', note: 'free(buf)로 블록을 돌려줍니다. 힙 사용량이 다시 0이 됩니다.', usage, req: i + 1 });
    } else {
      blocks[blocks.length - 1].state = 'orphan';
      out.push({
        line: 6,
        stack: [main, { fn: 'handle', vars: [{ id: 'hid', name: 'id', val: String(i) }, { id: 'buf', name: 'buf', val: addrOf(i) }], ghost: true }],
        heap: heap(),
        tone: 'bad',
        note: `handle이 끝나 buf가 사라졌습니다. 블록은 힙에 그대로 남았는데, 그 주소를 아는 변수가 하나도 없습니다. 이제 아무도 이 1024바이트를 free할 수 없습니다.`,
        usage,
        req: i + 1,
      });
    }
  }
  out.push({
    line: 8,
    stack: [m([{ id: 'id', name: 'id', val: '…' }])],
    heap: blocks.map((b) => ({ ...b })),
    tone: fixed ? 'good' : 'bad',
    note: fixed
      ? '요청을 몇 개 처리하든 힙은 1024바이트 이상 쓰지 않습니다.'
      : '요청 하나에 1KB씩 샙니다. 1초에 요청 100개를 받는 서버라면 하루에 약 8GB입니다. 메모리가 바닥날 때까지 느려지다가, 운영체제가 프로세스를 강제로 끝냅니다.',
    usage,
    req: LEAK_REQS,
  });
  return out;
}
