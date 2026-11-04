/* 타입으로 실수 막기: a tiny checker and interpreter for one program, union narrowing, and a state machine two ways */

/* ─────────────── Figure 1: check before running ─────────────── */

export type Atom = 'User' | 'string' | 'undefined';
export type Ty = Atom[]; // a union, as a sorted list of atoms

export type Guard = 'none' | 'guard';
export type NameSlot = 'dot' | 'opt' | 'bang';
export type ContactSlot = 'dot' | 'opt' | 'nullish';

export const GUARD_SRC: Record<Guard, string> = {
  none: '// (검사 없음)',
  guard: "if (!user) return '손님, 안녕하세요';",
};
export const NAME_SRC: Record<NameSlot, string> = { dot: 'user.name', opt: 'user?.name', bang: 'user!.name' };
export const CONTACT_SRC: Record<ContactSlot, string> = {
  dot: 'user.email.toLowerCase()',
  opt: 'user.email?.toLowerCase()',
  nullish: "user.email?.toLowerCase() ?? '이메일 없음'",
};

export interface TypeError1 {
  line: number; // 1-based line in the listing
  code: string; // TS error number
  msg: string; // the compiler's message
  ko: string; // plain Korean
  expr: string; // the part to underline
}

export interface CheckResult {
  errors: TypeError1[];
  types: Record<string, Ty>; // inferred type of each variable after its line
}

const show = (t: Ty) => t.join(' | ');
export const tyText = show;
const has = (t: Ty, a: Atom) => t.includes(a);
const without = (t: Ty, a: Atom): Ty => t.filter((x) => x !== a);
const union = (t: Ty, a: Atom): Ty => (t.includes(a) ? t : [...t, a]);

/** Lines of the listing (1-based) for each statement */
export const L = { user: 8, guard: 9, name: 10, contact: 11, ret: 12 };

export function check(g: Guard, n: NameSlot, c: ContactSlot): CheckResult {
  const errors: TypeError1[] = [];
  const possibly = (line: number, what: string, expr: string) =>
    errors.push({ line, code: 'TS18048', msg: `'${what}' is possibly 'undefined'.`, ko: `${what}은(는) undefined일 수 있습니다.`, expr });
  let user: Ty = ['User', 'undefined'];
  const types: Record<string, Ty> = { user };
  // if (!user) return …  narrows user to User on the path that continues
  if (g === 'guard') user = without(user, 'undefined');
  types.userAfter = user;

  // const name = …
  let name: Ty = ['string'];
  if (n === 'dot' && has(user, 'undefined')) possibly(L.name, 'user', 'user');
  if (n === 'opt' && has(user, 'undefined')) name = union(name, 'undefined');
  // n === 'bang': the ! tells the checker "trust me", so no error and no undefined
  types.name = name;

  // const contact = …   (user.email is string | undefined)
  if (has(user, 'undefined')) possibly(L.contact, 'user', 'user');
  let contact: Ty = ['string'];
  if (c === 'dot') possibly(L.contact, 'user.email', 'user.email');
  if (c === 'opt') contact = ['string', 'undefined'];
  types.contact = contact;

  // return `${name.toUpperCase()} · ${contact}`
  if (has(name, 'undefined')) possibly(L.ret, 'name', 'name');
  return { errors, types };
}

export const USERS: { id: number; name: string; email?: string }[] = [
  { id: 1, name: 'Kim', email: 'KIM@Example.com' },
  { id: 2, name: 'Lee' },
];
export const RUN_IDS = [1, 2, 9];

export interface RunOut {
  value?: string;
  crash?: string;
  crashLine?: number;
  odd?: boolean; // ran, but printed "undefined"
}

class Crash extends Error {
  constructor(
    public line: number,
    reading: string,
    public on = 'undefined',
  ) {
    super(`TypeError: Cannot read properties of ${on} (reading '${reading}')`);
  }
}

/** What the same code does when it actually runs. */
export function execute(id: number, g: Guard, n: NameSlot, c: ContactSlot): RunOut {
  try {
    const user = USERS.find((u) => u.id === id);
    if (g === 'guard' && !user) return { value: '손님, 안녕하세요' };
    let name: string | undefined;
    if (n === 'opt') name = user?.name;
    else {
      if (!user) throw new Crash(L.name, 'name');
      name = user.name;
    }
    if (!user) throw new Crash(L.contact, 'email');
    let contact: string | undefined;
    if (c === 'dot') {
      if (user.email === undefined) throw new Crash(L.contact, 'toLowerCase');
      contact = user.email.toLowerCase();
    } else {
      contact = user.email?.toLowerCase();
      if (c === 'nullish') contact = contact ?? '이메일 없음';
    }
    if (name === undefined) throw new Crash(L.ret, 'toUpperCase');
    return { value: `${name.toUpperCase()} · ${contact}`, odd: contact === undefined };
  } catch (e) {
    if (e instanceof Crash) return { crash: e.message, crashLine: e.line };
    throw e;
  }
}

/* ─────────────── Figure 2: narrowing a union ─────────────── */

export type XAtom = 'number' | 'string' | 'null' | 'boolean';

export interface FlowStep {
  id: 'null' | 'string' | 'end';
  src: string;
  before: XAtom[];
  taken: XAtom[]; // values that leave through this check's return
  after: XAtom[];
  error?: { code: string; msg: string; ko: string };
}

export function flow(withBool: boolean, nullCheck: boolean, strCheck: boolean): FlowStep[] {
  let cur: XAtom[] = withBool ? ['number', 'string', 'null', 'boolean'] : ['number', 'string', 'null'];
  const steps: FlowStep[] = [];
  if (nullCheck) {
    const taken = cur.filter((a) => a === 'null');
    const after = cur.filter((a) => a !== 'null');
    steps.push({ id: 'null', src: "if (x === null) return '없음';", before: cur, taken, after });
    cur = after;
  }
  if (strCheck) {
    const taken = cur.filter((a) => a === 'string');
    const after = cur.filter((a) => a !== 'string');
    steps.push({ id: 'string', src: "if (typeof x === 'string') return x.trim();", before: cur, taken, after });
    cur = after;
  }
  let error: FlowStep['error'];
  const others = cur.filter((a) => a !== 'number');
  if (cur.includes('null')) error = { code: 'TS18047', msg: "'x' is possibly 'null'.", ko: 'x가 null일 수 있습니다. null에는 toFixed가 없습니다.' };
  else if (others.length) {
    const t = cur.join(' | ');
    error = { code: 'TS2339', msg: `Property 'toFixed' does not exist on type '${t}'.`, ko: `${others.join(', ')}에는 toFixed가 없습니다.` };
  }
  steps.push({ id: 'end', src: 'return x.toFixed(2);', before: cur, taken: cur, after: [], error });
  return steps;
}

export const SAMPLES: { v: string; atom: XAtom }[] = [
  { v: 'null', atom: 'null' },
  { v: "'  밥  '", atom: 'string' },
  { v: '3.14159', atom: 'number' },
  { v: 'true', atom: 'boolean' },
];

/** Run label(x) on a sample, given which checks exist. */
export function runLabel(atom: XAtom, nullCheck: boolean, strCheck: boolean): { out: string; crash: boolean } {
  if (atom === 'null' && nullCheck) return { out: "'없음'", crash: false };
  if (atom === 'string' && strCheck) return { out: "'밥'", crash: false };
  if (atom === 'number') return { out: "'3.14'", crash: false };
  if (atom === 'null') return { out: "TypeError: Cannot read properties of null (reading 'toFixed')", crash: true };
  if (atom === 'string') return { out: 'TypeError: x.toFixed is not a function', crash: true };
  return { out: 'TypeError: x.toFixed is not a function', crash: true };
}

/* ─────────────── Figure 3: flags versus a tagged union ─────────────── */

export type Ev = 'fetch' | 'ok' | 'fail';
export const EV_LABEL: Record<Ev, string> = { fetch: '요청 보내기', ok: '응답 성공', fail: '응답 실패' };

export interface Flags {
  loading: boolean;
  error: string | null;
  data: string | null;
}
export type Union = { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: string } | { status: 'success'; data: string };

/** The way it is often written: each handler sets the flag it is thinking about and forgets the others. */
export function stepFlags(s: Flags, e: Ev, k: number): Flags {
  if (e === 'fetch') return { ...s, loading: true };
  if (e === 'ok') return { ...s, loading: false, data: `상품 ${k}개` };
  return { ...s, loading: false, error: '네트워크 오류' };
}

export function stepUnion(s: Union, e: Ev, k: number): Union {
  if (e === 'fetch') return { status: 'loading' };
  if (s.status !== 'loading') return s; // a response nobody is waiting for is ignored
  if (e === 'ok') return { status: 'success', data: `상품 ${k}개` };
  return { status: 'error', error: '네트워크 오류' };
}

/** index 0..7 of a flag combination: loading, error, data as bits */
export const flagIndex = (f: Flags) => (f.loading ? 4 : 0) + (f.error !== null ? 2 : 0) + (f.data !== null ? 1 : 0);
export const LEGAL = new Set([0, 4, 2, 1]); // idle, loading, error, success
export const FLAG_NAME: Record<number, string> = { 0: '처음', 4: '불러오는 중', 2: '오류', 1: '성공' };

export function replay(events: Ev[]) {
  let f: Flags = { loading: false, error: null, data: null };
  let u: Union = { status: 'idle' };
  const flags: Flags[] = [f];
  const unions: Union[] = [u];
  events.forEach((e, i) => {
    f = stepFlags(f, e, 12 + i);
    u = stepUnion(u, e, 12 + i);
    flags.push(f);
    unions.push(u);
  });
  return { flags, unions };
}
