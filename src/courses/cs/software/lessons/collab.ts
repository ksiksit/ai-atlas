/* 협업과 책임 있는 소프트웨어: a tiny git (commits, branches, three-way merge), a review exercise, and three responsibility checks */

import { gauss, rng } from '../../../../lib/math';

/* ─────────────── Figure 1: a commit graph ─────────────── */

export type Branch = 'main' | 'feature';
export const BRANCHES: Branch[] = ['main', 'feature'];
export const other = (b: Branch): Branch => (b === 'main' ? 'feature' : 'main');

export interface Commit {
  id: number;
  parents: number[];
  lane: Branch; // the branch it was made on (for drawing)
  lines: string[];
  msg: string;
}

export interface Repo {
  commits: Commit[];
  heads: Record<Branch, number>;
  cur: Branch;
}

export const FIRST_FILE = ["const TITLE = '아틀라스 상점';", 'const PRICE = 12000;', 'const SHIPPING = 3000;', "const COLOR = 'blue';", 'const SALE = false;'];

export function initRepo(): Repo {
  return { commits: [{ id: 0, parents: [], lane: 'main', lines: FIRST_FILE, msg: '처음 커밋' }], heads: { main: 0, feature: 0 }, cur: 'main' };
}

export function ancestors(repo: Repo, id: number): Set<number> {
  const out = new Set<number>();
  const st = [id];
  while (st.length) {
    const c = st.pop()!;
    if (out.has(c)) continue;
    out.add(c);
    st.push(...repo.commits[c].parents);
  }
  return out;
}

/** The merge base: the newest commit that both heads descend from. */
export function mergeBase(repo: Repo, a: number, b: number): number {
  const aa = ancestors(repo, a);
  const common = [...ancestors(repo, b)].filter((x) => aa.has(x));
  return Math.max(...common);
}

export function describe(prev: string[], next: string[]): string {
  const changed = next.map((l, i) => (l !== prev[i] ? i : -1)).filter((i) => i >= 0);
  if (!changed.length) return '변경 없음';
  const names = changed.map((i) => next[i].match(/const (\w+)/)?.[1] ?? `${i + 1}번 줄`);
  return `${names.join(', ')} 수정`;
}

export function commit(repo: Repo, lines: string[]): Repo {
  const parent = repo.commits[repo.heads[repo.cur]];
  const c: Commit = { id: repo.commits.length, parents: [parent.id], lane: repo.cur, lines: lines.slice(), msg: describe(parent.lines, lines) };
  return { ...repo, commits: [...repo.commits, c], heads: { ...repo.heads, [repo.cur]: c.id } };
}

export type LineState = 'same' | 'ours' | 'theirs' | 'both' | 'conflict';

export interface MergeRow {
  base: string;
  ours: string;
  theirs: string;
  state: LineState;
  result: string | null; // null while a conflict is unresolved
}

export type MergePlan = { kind: 'uptodate' } | { kind: 'ff'; to: number } | { kind: 'three'; base: number; rows: MergeRow[] };

/** Line-by-line three-way merge. The file keeps five lines, so line i of each version lines up. */
export function planMerge(repo: Repo): MergePlan {
  const ours = repo.heads[repo.cur];
  const theirs = repo.heads[other(repo.cur)];
  if (ancestors(repo, ours).has(theirs)) return { kind: 'uptodate' };
  if (ancestors(repo, theirs).has(ours)) return { kind: 'ff', to: theirs };
  const base = mergeBase(repo, ours, theirs);
  const B = repo.commits[base].lines;
  const O = repo.commits[ours].lines;
  const T = repo.commits[theirs].lines;
  const rows = B.map((b, i): MergeRow => {
    const o = O[i];
    const t = T[i];
    if (o === t) return { base: b, ours: o, theirs: t, state: o === b ? 'same' : 'both', result: o };
    if (o === b) return { base: b, ours: o, theirs: t, state: 'theirs', result: t };
    if (t === b) return { base: b, ours: o, theirs: t, state: 'ours', result: o };
    return { base: b, ours: o, theirs: t, state: 'conflict', result: null };
  });
  return { kind: 'three', base, rows };
}

export function mergeCommit(repo: Repo, lines: string[]): Repo {
  const ours = repo.heads[repo.cur];
  const theirs = repo.heads[other(repo.cur)];
  const c: Commit = { id: repo.commits.length, parents: [ours, theirs], lane: repo.cur, lines: lines.slice(), msg: `${other(repo.cur)}를 ${repo.cur}에 병합` };
  return { ...repo, commits: [...repo.commits, c], heads: { ...repo.heads, [repo.cur]: c.id } };
}

/** Set up the classic conflict: both branches change PRICE, only feature changes COLOR. */
export function conflictRepo(): Repo {
  let r = initRepo();
  r = { ...r, cur: 'feature' };
  r = commit(r, FIRST_FILE.map((l, i) => (i === 1 ? 'const PRICE = 13000;' : i === 3 ? "const COLOR = 'green';" : l)));
  r = { ...r, cur: 'main' };
  r = commit(r, FIRST_FILE.map((l, i) => (i === 1 ? 'const PRICE = 15000;' : l)));
  return r;
}

/** Both branches change different lines: the merge needs no help. */
export function cleanRepo(): Repo {
  let r = initRepo();
  r = { ...r, cur: 'feature' };
  r = commit(r, FIRST_FILE.map((l, i) => (i === 4 ? 'const SALE = true;' : l)));
  r = { ...r, cur: 'main' };
  r = commit(r, FIRST_FILE.map((l, i) => (i === 0 ? "const TITLE = '아틀라스 마켓';" : l)));
  return r;
}

/* ─────────────── Figure 2: a code review ─────────────── */

export type Cat = 'spec' | 'test' | 'name' | 'error' | 'security';
export const CATS: { id: Cat; label: string; ask: string }[] = [
  { id: 'spec', label: '명세', ask: '설명에 적힌 대로 동작하는가?' },
  { id: 'error', label: '오류 처리', ask: '없거나 잘못된 값이 오면 어떻게 되는가?' },
  { id: 'name', label: '이름·가독성', ask: '처음 보는 사람이 읽을 수 있는가?' },
  { id: 'security', label: '보안·개인정보', ask: '비밀이나 개인정보가 새지 않는가?' },
  { id: 'test', label: '테스트', ask: '바뀐 동작을 확인하는 테스트가 있는가?' },
];

export interface DiffLine {
  kind: ' ' | '+' | '-' | 'file' | 'note';
  text: string;
  issue?: { cat: Cat; why: string };
}

export const PR_DIFF: DiffLine[] = [
  { kind: 'file', text: 'checkout.js' },
  { kind: ' ', text: "import { findCoupon } from './coupon.js';" },
  { kind: '+', text: "const API_KEY = 'sk_live_9f2c81d07ab4';", issue: { cat: 'security', why: '실제 결제 키가 코드에 그대로 들어 있습니다. 저장소를 볼 수 있는 모든 사람에게, 그리고 Git 기록에 영원히 남습니다. 환경 변수나 비밀 저장소로 옮겨야 합니다.' } },
  { kind: ' ', text: '' },
  { kind: '-', text: 'function orderTotal(order) {' },
  { kind: '+', text: 'function proc(o) {', issue: { cat: 'name', why: 'proc과 o로는 무엇을 하는 함수인지 알 수 없습니다. 원래의 orderTotal(order)가 더 나았습니다.' } },
  { kind: '+', text: '  const sum = o.items.reduce((s, it) => s + it.price * it.qty, 0);' },
  { kind: '+', text: '  const coupon = findCoupon(o.couponCode, API_KEY);' },
  { kind: '+', text: '  if (coupon.expired) return sum;', issue: { cat: 'error', why: 'findCoupon은 없는 코드면 null을 돌려줍니다. 잘못된 쿠폰 코드 하나에 결제 전체가 TypeError로 멈춥니다.' } },
  { kind: '+', text: '  const off = Math.round(sum * 0.1);', issue: { cat: 'spec', why: 'PR 설명에는 "할인은 최대 5,000원"이라고 되어 있는데 상한이 없습니다. 10만 원 주문이면 1만 원이 할인됩니다.' } },
  { kind: '+', text: "  console.log('쿠폰 사용', o.user.email, o.user.phone);", issue: { cat: 'security', why: '이메일과 전화번호가 서버 로그에 남습니다. 로그는 많은 사람이 보고 오래 보관되므로 개인정보를 적지 않아야 합니다.' } },
  { kind: '+', text: '  return sum - off;' },
  { kind: '+', text: '}' },
  { kind: 'file', text: 'checkout.test.js' },
  { kind: 'note', text: '(이 PR에서 바뀐 내용 없음)', issue: { cat: 'test', why: '할인 계산이라는 새 동작이 생겼는데 테스트가 하나도 없습니다. 쿠폰 없음, 만료된 쿠폰, 상한 5,000원 경계를 확인하는 테스트가 필요합니다.' } },
];

export const ISSUE_COUNT = PR_DIFF.filter((d) => d.issue).length;

/* ─────────────── Figure 3: responsible software ─────────────── */

export interface Field {
  id: string;
  label: string;
  risk: number; // harm if it leaks, 1..5
  need: boolean; // needed for "send a birthday coupon by email"
}

export const FIELDS: Field[] = [
  { id: 'email', label: '이메일', risk: 2, need: true },
  { id: 'bday', label: '생일 (월·일)', risk: 1, need: true },
  { id: 'name', label: '이름', risk: 2, need: false },
  { id: 'byear', label: '태어난 해', risk: 2, need: false },
  { id: 'phone', label: '전화번호', risk: 3, need: false },
  { id: 'addr', label: '집 주소', risk: 4, need: false },
  { id: 'gender', label: '성별', risk: 2, need: false },
  { id: 'loc', label: '실시간 위치', risk: 5, need: false },
  { id: 'contacts', label: '연락처 목록', risk: 5, need: false },
];
export const FIELDS_START = ['email', 'bday', 'name', 'byear', 'phone', 'addr', 'gender', 'loc'];
export const KEEP = [
  { value: 'sent', label: '보낸 뒤 삭제', factor: 0.25 },
  { value: 'year', label: '1년', factor: 1 },
  { value: 'ever', label: '영구 보관', factor: 3 },
];

export interface Person {
  group: 'A' | 'B';
  good: boolean; // would actually repay
  score: number; // 0..100
}

/** Same base rate in both groups; the score is a noisier measurement for group B (e.g. a thin credit history). */
export function applicants(): Person[] {
  const r = rng(2024);
  const out: Person[] = [];
  for (const group of ['A', 'B'] as const) {
    const sd = group === 'A' ? 9 : 17;
    for (let i = 0; i < 150; i++) {
      const good = r() < 0.6;
      const s = (good ? 64 : 40) + sd * gauss(r);
      out.push({ group, good, score: Math.max(1, Math.min(99, s)) });
    }
  }
  return out;
}

export function rates(ps: Person[], t: number) {
  const good = ps.filter((p) => p.good);
  const bad = ps.filter((p) => !p.good);
  const approved = ps.filter((p) => p.score >= t).length;
  return {
    approve: approved / ps.length,
    fnr: good.filter((p) => p.score < t).length / good.length, // would repay, but rejected
    fpr: bad.filter((p) => p.score >= t).length / bad.length, // would not repay, but approved
  };
}

/* contrast (WCAG 2.x) */
function lin(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
export function contrast(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export const CONTRAST_PRESETS = [
  { id: 'gray', label: '연회색 안내문', fg: '#a0a0a0', bg: '#ffffff' },
  { id: 'yellow', label: '노란 버튼', fg: '#ffffff', bg: '#f5c518' },
  { id: 'body', label: '이 사이트 본문', fg: '#1c1b19', bg: '#fbfaf7' },
  { id: 'dark', label: '어두운 화면', fg: '#8f8a80', bg: '#161513' },
];
