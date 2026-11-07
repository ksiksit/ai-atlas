/**
 * A small semantic-versioning engine: parse versions, parse npm-style ranges
 * (exact, ^, ~, x-ranges, comparators joined by spaces, alternatives joined by ||),
 * and pick the highest published version a range allows. Pre-release tags are not supported.
 */

export type Version = [number, number, number];

export function parseVersion(s: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(s.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export const fmt = (v: Version) => v.join('.');

export function compare(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export type Op = '>=' | '>' | '<' | '<=' | '=';
export interface Comparator {
  op: Op;
  v: Version;
}
/** A range is an OR of ANDs: [[c1, c2], [c3]] means (c1 and c2) or c3. */
export type Range = Comparator[][];

/** A partial version such as 1, 1.2, 1.x, 1.2.* — missing or wildcard parts are null. */
type Partial = [number | null, number | null, number | null];

function parsePartial(s: string): Partial | null {
  if (s === '*' || s === 'x' || s === 'X' || s === '') return [null, null, null];
  const parts = s.replace(/^v/, '').split('.');
  if (parts.length > 3) return null;
  const out: Partial = [null, null, null];
  let wild = false;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === 'x' || p === 'X' || p === '*') {
      wild = true;
      continue;
    }
    if (!/^\d+$/.test(p) || wild) return null; // 1.x.3 is not allowed
    out[i] = Number(p);
  }
  return out;
}

const full = (p: Partial): Version => [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];

/** Turn one space-separated term (^1.2.3, ~1.2, 1.x, >=1.0.0, 1.2.3) into comparators. */
function parseTerm(t: string): Comparator[] | null {
  const m = /^(\^|~|>=|<=|>|<|=)?(.*)$/.exec(t)!;
  const sym = m[1] ?? '';
  const p = parsePartial(m[2]);
  if (!p) return null;
  const [maj, min, pat] = p;
  const lo = full(p);

  if (sym === '^') {
    if (maj === null) return [];
    // the first non-zero part may not change
    if (maj > 0 || min === null) return [{ op: '>=', v: lo }, { op: '<', v: [maj + 1, 0, 0] }];
    if (min > 0 || pat === null) return [{ op: '>=', v: lo }, { op: '<', v: [0, min + 1, 0] }];
    return [{ op: '>=', v: lo }, { op: '<', v: [0, 0, pat + 1] }];
  }
  if (sym === '~') {
    if (maj === null) return [];
    if (min === null) return [{ op: '>=', v: lo }, { op: '<', v: [maj + 1, 0, 0] }];
    return [{ op: '>=', v: lo }, { op: '<', v: [maj, min + 1, 0] }];
  }
  if (sym === '' || sym === '=') {
    if (maj === null) return [];
    if (min === null) return [{ op: '>=', v: lo }, { op: '<', v: [maj + 1, 0, 0] }];
    if (pat === null) return [{ op: '>=', v: lo }, { op: '<', v: [maj, min + 1, 0] }];
    return [{ op: '=', v: lo }];
  }
  if (p.some((x) => x === null)) return null; // keep comparators simple: >=1.2.0, not >=1.x
  return [{ op: sym as Op, v: lo }];
}

export function parseRange(s: string): Range | null {
  const alts = s.split('||').map((a) => a.trim());
  const out: Range = [];
  for (const a of alts) {
    // allow "^ 1.2.0" and ">= 1.2.0"
    const terms = a.replace(/(\^|~|>=|<=|>|<|=)\s+/g, '$1').split(/\s+/).filter(Boolean);
    const set: Comparator[] = [];
    for (const t of terms.length ? terms : ['*']) {
      const cs = parseTerm(t);
      if (!cs) return null;
      set.push(...cs);
    }
    out.push(set);
  }
  return out;
}

function test(c: Comparator, v: Version): boolean {
  const d = compare(v, c.v);
  switch (c.op) {
    case '>=':
      return d >= 0;
    case '>':
      return d > 0;
    case '<':
      return d < 0;
    case '<=':
      return d <= 0;
    case '=':
      return d === 0;
  }
}

export const satisfies = (r: Range, v: Version) => r.some((set) => set.every((c) => test(c, v)));

/** The highest version in `published` that the range allows, or null. */
export function maxSatisfying(r: Range, published: Version[]): Version | null {
  let best: Version | null = null;
  for (const v of published) if (satisfies(r, v) && (!best || compare(v, best) > 0)) best = v;
  return best;
}

const OP_TEXT: Record<Op, string> = { '>=': '≥', '>': '>', '<': '<', '<=': '≤', '=': '=' };

/** The range in plain comparator form, e.g. "≥1.2.0 그리고 <2.0.0". */
export function describe(r: Range): string {
  return r.map((set) => (set.length ? set.map((c) => OP_TEXT[c.op] + fmt(c.v)).join(' 그리고 ') : '모든 버전')).join(' 또는 ');
}

/** A published version with the day it was released (day 0 = the day the project was started). */
export interface Release {
  v: Version;
  day: number;
  /** A release that breaks this project even though its number promises compatibility. */
  broken?: boolean;
}

/** What `npm install` picks on a given day: with a lock file, the locked version; otherwise the newest allowed. */
export function installOn(r: Range, releases: Release[], day: number, locked: Version | null): Release | null {
  if (locked) return releases.find((x) => compare(x.v, locked) === 0) ?? null;
  const out = releases.filter((x) => x.day <= day);
  const v = maxSatisfying(
    r,
    out.map((x) => x.v),
  );
  return v ? out.find((x) => compare(x.v, v) === 0)! : null;
}
