/*
 * 소프트웨어 보안 · 의존성과 공급망 보안: a fictional package registry, semver ranges,
 * npm-style resolution into a tree, a vulnerability advisory, SBOM output and name similarity.
 * Every package here is made up.
 */

export type Version = [number, number, number];

export const parseV = (s: string): Version => s.split('.').map(Number) as Version;
export const fmtV = (v: Version) => v.join('.');
export const cmpV = (a: Version, b: Version) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Does version `v` satisfy `range`? Supports ^x.y.z, ~x.y.z, >=x.y.z and an exact x.y.z. */
export function satisfies(range: string, v: Version): boolean {
  const r = range.trim();
  if (r.startsWith('>=')) return cmpV(v, parseV(r.slice(2))) >= 0;
  if (r.startsWith('^')) {
    const b = parseV(r.slice(1));
    if (cmpV(v, b) < 0) return false;
    if (b[0] > 0) return v[0] === b[0];
    if (b[1] > 0) return v[0] === 0 && v[1] === b[1];
    return v[0] === 0 && v[1] === 0 && v[2] === b[2];
  }
  if (r.startsWith('~')) {
    const b = parseV(r.slice(1));
    return cmpV(v, b) >= 0 && v[0] === b[0] && v[1] === b[1];
  }
  return cmpV(v, parseV(r)) === 0;
}

/** The versions a range allows, written as an interval for the reader. */
export function rangeText(range: string): string {
  const r = range.trim();
  if (r.startsWith('>=')) return `${r.slice(2)} 이상 전부`;
  if (r.startsWith('^')) {
    const b = parseV(r.slice(1));
    const hi: Version = b[0] > 0 ? [b[0] + 1, 0, 0] : b[1] > 0 ? [0, b[1] + 1, 0] : [0, 0, b[2] + 1];
    return `${fmtV(b)} 이상 ${fmtV(hi)} 미만`;
  }
  if (r.startsWith('~')) {
    const b = parseV(r.slice(1));
    return `${fmtV(b)} 이상 ${b[0]}.${b[1] + 1}.0 미만`;
  }
  return `${r}만`;
}

export interface Release {
  version: string;
  deps: Record<string, string>;
  /** 0 = already published when the lockfile was made (last month), 1 = published since. */
  month: 0 | 1;
}

export const REGISTRY: Record<string, Release[]> = {
  'web-kit': [
    { version: '2.0.0', deps: { 'router-lite': '^1.0.0' }, month: 0 },
    { version: '2.1.0', deps: { 'router-lite': '^1.2.0', 'body-parse': '^4.0.0' }, month: 0 },
    { version: '2.3.1', deps: { 'router-lite': '^1.2.0', 'body-parse': '^4.1.0' }, month: 0 },
    { version: '3.0.0', deps: { 'router-lite': '^2.0.0', 'body-parse': '^5.0.0' }, month: 0 },
  ],
  'router-lite': [
    { version: '1.0.0', deps: {}, month: 0 },
    { version: '1.2.0', deps: { 'path-match': '^0.6.0' }, month: 0 },
    { version: '1.4.2', deps: { 'path-match': '^0.6.0' }, month: 0 },
    { version: '2.0.0', deps: { 'path-match': '^0.7.0' }, month: 0 },
  ],
  'path-match': [
    { version: '0.6.0', deps: {}, month: 0 },
    { version: '0.6.3', deps: {}, month: 0 },
    { version: '0.7.1', deps: {}, month: 0 },
  ],
  'body-parse': [
    { version: '4.0.0', deps: { 'bytes-fmt': '^1.0.0' }, month: 0 },
    { version: '4.1.3', deps: { 'bytes-fmt': '^1.0.0', 'qs-parse': '^6.5.0' }, month: 0 },
    { version: '5.0.0', deps: { 'bytes-fmt': '^1.1.0', 'qs-parse': '^6.9.0' }, month: 1 },
  ],
  'bytes-fmt': [
    { version: '1.0.0', deps: {}, month: 0 },
    { version: '1.1.0', deps: {}, month: 0 },
  ],
  'qs-parse': [
    { version: '6.5.0', deps: {}, month: 0 },
    { version: '6.5.2', deps: {}, month: 0 },
    { version: '6.9.1', deps: {}, month: 1 },
  ],
  'date-pal': [
    { version: '1.4.0', deps: {}, month: 0 },
    { version: '1.4.7', deps: {}, month: 0 },
    { version: '1.5.0', deps: {}, month: 0 },
  ],
  'log-tiny': [
    { version: '3.0.0', deps: { 'color-ink': '^2.0.0' }, month: 0 },
    { version: '3.2.0', deps: { 'color-ink': '^2.0.0', 'qs-parse': '~6.5.0' }, month: 0 },
  ],
  'color-ink': [
    { version: '2.0.0', deps: {}, month: 0 },
    { version: '2.4.1', deps: {}, month: 0 },
  ],
};

/** The app's package.json dependencies (web-kit's range is chosen by the reader in figure 1). */
export const appDeps = (webKitRange = '^2.1.0'): Record<string, string> => ({ 'web-kit': webKitRange, 'date-pal': '~1.4.0', 'log-tiny': '^3.0.0' });

/** The advisory of figure 2: qs-parse before 6.9.0 lets a crafted query string change object prototypes. */
export const ADVISORY = { pkg: 'qs-parse', below: '6.9.0', id: 'ADV-2026-0117' };
export const isVulnerable = (name: string, version: string) => name === ADVISORY.pkg && cmpV(parseV(version), parseV(ADVISORY.below)) < 0;

export interface TreeNode {
  name: string;
  range: string;
  version: string | null;
  depth: number;
  /** Names from the app down to this node, inclusive. */
  path: string[];
  children: TreeNode[];
}

/** Highest version of `name` that satisfies `range` among releases published by `month`. */
export function pick(name: string, range: string, month: 0 | 1): string | null {
  const ok = (REGISTRY[name] ?? []).filter((r) => r.month <= month && satisfies(range, parseV(r.version)));
  ok.sort((a, b) => cmpV(parseV(b.version), parseV(a.version)));
  return ok[0]?.version ?? null;
}

/**
 * Resolve the app's dependencies into a tree (no deduplication, so a package needed on two
 * paths appears twice). `month` is when resolution happens; `overrides` force a version.
 */
export function resolve(deps: Record<string, string>, month: 0 | 1, overrides: Record<string, string> = {}): TreeNode[] {
  const walk = (name: string, range: string, path: string[], depth: number): TreeNode => {
    const version = overrides[name] ?? pick(name, range, month);
    const rel = REGISTRY[name]?.find((r) => r.version === version);
    const p = [...path, name];
    return { name, range, version, depth, path: p, children: rel ? Object.entries(rel.deps).map(([n, r]) => walk(n, r, p, depth + 1)) : [] };
  };
  return Object.entries(deps).map(([n, r]) => walk(n, r, ['주문앱'], 1));
}

export const flatten = (t: TreeNode[]): TreeNode[] => t.flatMap((n) => [n, ...flatten(n.children)]);

export interface TreeStats {
  direct: number;
  nodes: number;
  /** Distinct name@version pairs, i.e. what is actually downloaded. */
  unique: number;
  maxDepth: number;
  vulnPaths: number;
  vulnVersions: string[];
}

export function stats(t: TreeNode[]): TreeStats {
  const all = flatten(t);
  const uniq = new Set(all.map((n) => `${n.name}@${n.version}`));
  const vuln = all.filter((n) => n.version && isVulnerable(n.name, n.version));
  return {
    direct: t.length,
    nodes: all.length,
    unique: uniq.size,
    maxDepth: Math.max(...all.map((n) => n.depth)),
    vulnPaths: vuln.length,
    vulnVersions: [...new Set(vuln.map((n) => n.version!))],
  };
}

/** A small CycloneDX-style SBOM listing each distinct component once. */
export function sbom(t: TreeNode[]): string {
  const seen = new Map<string, TreeNode>();
  for (const n of flatten(t)) if (n.version) seen.set(`${n.name}@${n.version}`, n);
  const components = [...seen.values()]
    .sort((a, b) => a.name.localeCompare(b.name) || cmpV(parseV(a.version!), parseV(b.version!)))
    .map((n) => ({ type: 'library', name: n.name, version: n.version, purl: `pkg:npm/${n.name}@${n.version}` }));
  return JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.5', metadata: { component: { type: 'application', name: '주문앱', version: '1.0.0' } }, components }, null, 2);
}

/* ───────── name similarity ───────── */

/** Levenshtein edit distance: insertions, deletions and substitutions, each costing 1. */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Popular names the registry checks new names against (all fictional). */
export const POPULAR = ['web-kit', 'date-pal', 'log-tiny', 'qs-parse', 'body-parse', 'color-ink', 'router-lite', 'path-match', 'bytes-fmt'];

export function nearest(name: string): { name: string; d: number }[] {
  return POPULAR.map((p) => ({ name: p, d: editDistance(name.trim().toLowerCase(), p) })).sort((a, b) => a.d - b.d || a.name.localeCompare(b.name));
}

/* ───────── integrity ───────── */

/** The file whose hash the lockfile records in figure 3 (a made-up package's entry point). */
export const SAMPLE_FILE = `// color-ink 2.4.1 · index.js
const CODES = { red: 31, green: 32, yellow: 33, blue: 34 };

export function paint(text, color) {
  const code = CODES[color];
  if (code === undefined) return text;
  return "\\u001b[" + code + "m" + text + "\\u001b[0m";
}
`;
