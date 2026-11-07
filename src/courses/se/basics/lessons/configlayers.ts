/**
 * Two small models for the 설정과 환경 lesson.
 *
 * 1. Layered configuration, the way Spring Boot resolves it: defaults in code < application.yml <
 *    application-{profile}.yml < environment variables < command-line arguments. Each source is
 *    parsed from its real text (a YAML subset, KEY=value lines, --key=value arguments) into flat
 *    property names, and every key takes its value from the highest source that sets it.
 *
 * 2. A regex secret scanner over a tiny commit history, to show that deleting a committed key in a
 *    later commit leaves it in history, and what rewriting history and rotating the key each do.
 */

/* ─────────────── 1. layered configuration ─────────────── */

export type SourceId = 'default' | 'app' | 'profile' | 'env' | 'args';
export type Profile = 'dev' | 'test' | 'prod';
export const PROFILES: Profile[] = ['dev', 'test', 'prod'];

/** Lowest precedence first. */
export const SOURCE_ORDER: SourceId[] = ['default', 'app', 'profile', 'env', 'args'];

export type Props = Record<string, string>;

export interface Parsed {
  values: Props;
  /** Lines the parser skipped, with why. */
  skipped: string[];
}

const unquote = (v: string) => (/^(['"]).*\1$/.test(v) ? v.slice(1, -1) : v);

/** A YAML subset: nested maps by indentation, scalar values, # comments. Flattens to dotted keys. */
export function parseYaml(text: string): Parsed {
  const values: Props = {};
  const skipped: string[] = [];
  const stack: { indent: number; key: string }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/(^|\s)#.*$/, '').replace(/\s+$/, '');
    if (!line.trim() || line.trim() === '---') continue;
    const indent = line.length - line.trimStart().length;
    const m = /^([A-Za-z0-9_.-]+)\s*:(?:\s+(.*))?$/.exec(line.trim());
    if (!m) {
      skipped.push(raw.trim());
      continue;
    }
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const key = [...stack.map((s) => s.key), m[1]].join('.');
    if (m[2] === undefined || m[2] === '') stack.push({ indent, key: m[1] });
    else values[key] = unquote(m[2].trim());
  }
  return { values, skipped };
}

/** Spring Boot's rule for the environment variable that binds to a property: dots to _, drop -, upper case. */
export const toEnvName = (key: string) => key.replace(/-/g, '').replace(/\./g, '_').toUpperCase();

/** Which property an environment variable sets. Known keys are matched by their env-var form first. */
export function envToKey(name: string, known: string[]): string {
  const hit = known.find((k) => toEnvName(k) === name.toUpperCase());
  return hit ?? name.toLowerCase().replace(/_/g, '.');
}

export function parseEnv(text: string, known: string[]): Parsed & { names: Record<string, string> } {
  const values: Props = {};
  const names: Record<string, string> = {};
  const skipped: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!m) {
      skipped.push(line);
      continue;
    }
    const key = envToKey(m[1], known);
    values[key] = unquote(m[2].trim());
    names[key] = m[1];
  }
  return { values, names, skipped };
}

export function parseArgs(text: string): Parsed {
  const values: Props = {};
  const skipped: string[] = [];
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    const m = /^--([A-Za-z0-9_.-]+)=(.*)$/.exec(tok);
    if (m) values[m[1]] = unquote(m[2]);
    else skipped.push(tok);
  }
  return { values, skipped };
}

export interface Layer {
  id: SourceId;
  values: Props;
}

export interface Row {
  key: string;
  /** What each source says about this key (absent when it says nothing). */
  cells: Partial<Record<SourceId, string>>;
  /** The source whose value is used, or null when no source sets it. */
  from: SourceId | null;
  value: string | undefined;
}

/** Keys shown first, in this order; anything else follows alphabetically. */
export const KEY_ORDER = ['server.port', 'spring.datasource.url', 'spring.datasource.username', 'spring.datasource.password', 'logging.level.root', 'todo.page-size', 'todo.reminder.enabled'];

export function resolve(layers: Layer[]): Row[] {
  const byId = new Map(layers.map((l) => [l.id, l.values]));
  const keys = new Set<string>(KEY_ORDER);
  for (const l of layers) for (const k of Object.keys(l.values)) keys.add(k);
  const rank = (k: string) => (KEY_ORDER.includes(k) ? KEY_ORDER.indexOf(k) : KEY_ORDER.length);
  return [...keys]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((key) => {
      const cells: Partial<Record<SourceId, string>> = {};
      let from: SourceId | null = null;
      for (const id of SOURCE_ORDER) {
        const v = byId.get(id)?.[key];
        if (v !== undefined) {
          cells[id] = v;
          from = id;
        }
      }
      return { key, cells, from, value: from ? cells[from] : undefined };
    });
}

export const isSecretKey = (key: string) => /(password|secret|token|api-?key|private-key)$/i.test(key);
export const mask = (v: string) => (v.length <= 2 ? '••••' : v.slice(0, 2) + '•'.repeat(Math.min(8, v.length - 2)));

const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'OFF'];

export interface Startup {
  ok: boolean;
  problems: string[];
  lines: string[];
}

/** Check the final values the way the application would at startup, and fail fast if they are wrong. */
export function startup(rows: Row[]): Startup {
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const problems: string[] = [];
  const port = get('server.port');
  if (port === undefined || !/^\d+$/.test(port) || Number(port) > 65535) problems.push(`server.port 값 "${port ?? ''}"는 0~65535의 정수가 아닙니다.`);
  const url = get('spring.datasource.url');
  if (!url) problems.push('spring.datasource.url이 없어 데이터베이스에 연결할 수 없습니다.');
  else if (url.startsWith('jdbc:postgresql') && !get('spring.datasource.password')) problems.push('운영 데이터베이스에 연결하려는데 spring.datasource.password가 없습니다.');
  const size = get('todo.page-size');
  if (size !== undefined && !/^[1-9]\d*$/.test(size)) problems.push(`todo.page-size 값 "${size}"는 양의 정수가 아닙니다.`);
  const level = get('logging.level.root');
  if (level !== undefined && !LEVELS.includes(level.toUpperCase())) problems.push(`logging.level.root 값 "${level}"를 모릅니다.`);
  if (problems.length) return { ok: false, problems, lines: [] };
  const lines = [
    `Tomcat started on port ${port === '0' ? '(빈 포트 아무거나, 테스트용)' : port}`,
    `DataSource: ${url}${get('spring.datasource.username') ? ` (사용자 ${get('spring.datasource.username')})` : ''}`,
    `로그 수준 ${level ?? 'INFO'}, 한 쪽에 할 일 ${size ?? '?'}개, 마감 알림 ${get('todo.reminder.enabled') === 'true' ? '켜짐' : '꺼짐'}`,
  ];
  return { ok: true, problems, lines };
}

/* the to-do service's configuration sources */

export const CODE_DEFAULTS: Props = {
  'server.port': '8080',
  'logging.level.root': 'INFO',
  'todo.page-size': '20',
  'todo.reminder.enabled': 'false',
};

export const APP_YML = `# src/main/resources/application.yml
spring:
  datasource:
    url: jdbc:h2:mem:todo     # 메모리 DB
    username: sa
todo:
  page-size: 50`;

export const PROFILE_YML: Record<Profile, string> = {
  dev: `# application-dev.yml
logging:
  level:
    root: DEBUG
todo:
  reminder:
    enabled: true             # 개발에서만 켜 보는 기능`,
  test: `# application-test.yml
server:
  port: 0                     # 빈 포트를 아무거나
spring:
  datasource:
    url: jdbc:h2:mem:test`,
  prod: `# application-prod.yml
spring:
  datasource:
    url: jdbc:postgresql://db.internal:5432/todo
    username: todo_app
logging:
  level:
    root: WARN`,
};

export const ENV_DEFAULT = 'SPRING_DATASOURCE_PASSWORD=s3cr3t-from-vault\nTODO_PAGESIZE=100';
export const ARGS_DEFAULT = '--server.port=9090';

export interface Present {
  app: boolean;
  profile: boolean;
  env: boolean;
  args: boolean;
}

/** Build the layers for the to-do service from the reader's choices. */
export function todoLayers(profile: Profile, present: Present, envText: string, argsText: string): { layers: Layer[]; envNames: Record<string, string>; skipped: string[] } {
  const app = parseYaml(APP_YML);
  const prof = parseYaml(PROFILE_YML[profile]);
  const known = [...new Set([...KEY_ORDER, ...Object.keys(app.values), ...Object.keys(prof.values)])];
  const env = parseEnv(envText, known);
  const args = parseArgs(argsText);
  const layers: Layer[] = [{ id: 'default', values: CODE_DEFAULTS }];
  if (present.app) layers.push({ id: 'app', values: app.values });
  if (present.profile) layers.push({ id: 'profile', values: prof.values });
  if (present.env) layers.push({ id: 'env', values: env.values });
  if (present.args) layers.push({ id: 'args', values: args.values });
  const skipped = [...(present.env ? env.skipped.map((s) => `환경 변수: ${s}`) : []), ...(present.args ? args.skipped.map((s) => `명령줄: ${s}`) : [])];
  return { layers, envNames: env.names, skipped };
}

/* ─────────────── 2. secrets in history ─────────────── */

export interface Commit {
  msg: string;
  /** Files this commit writes, with their whole new content; null deletes the file. */
  files: Record<string, string | null>;
}

export interface Rule {
  id: string;
  label: string;
  re: RegExp;
  /** Index of the capture group holding the secret value (0 for the whole match). */
  group: number;
}

export const RULES: Rule[] = [
  {
    id: 'aws-key',
    label: 'AWS 액세스 키 ID',
    re: /\b(AKIA[0-9A-Z]{16})\b/,
    group: 1,
  },
  {
    id: 'aws-secret',
    label: 'AWS 비밀 키',
    re: /secret[-_]?key\s*[:=]\s*["']?([A-Za-z0-9/+]{40})/i,
    group: 1,
  },
  {
    id: 'password',
    label: '설정 파일의 비밀번호',
    re: /password\s*[:=]\s*["']?([^\s"'#]{4,})/i,
    group: 1,
  },
];

/** Values that look like a secret but are not: placeholders, references, redactions. */
export const isPlaceholder = (v: string) => /^\$\{.*\}$|^<.*>$|REMOVED|^x+$|^\*+$/i.test(v);

/* The demo history. The fake keys are AWS's documentation examples, built by joining two pieces so
   that this source file itself does not trip a real secret scanner. */
const AK = 'AKIA' + 'IOSFODNN7EXAMPLE';
const SK = 'wJalrXUtnFEMI/K7MDENG/' + 'bPxRfiCYEXAMPLEKEY';

const STORAGE_V1 = `@Configuration
public class StorageConfig {
    private static final String ACCESS_KEY = "${AK}";
    private static final String SECRET_KEY = "${SK}";

    @Bean
    S3Client s3() {
        return S3Client.builder()
            .credentialsProvider(StaticCredentialsProvider.create(
                AwsBasicCredentials.create(ACCESS_KEY, SECRET_KEY)))
            .build();
    }
}`;

const STORAGE_V2 = `@Configuration
public class StorageConfig {
    @Bean
    S3Client s3() {
        // 키는 실행 환경(AWS_ACCESS_KEY_ID 등)에서 읽는다
        return S3Client.builder()
            .credentialsProvider(DefaultCredentialsProvider.create())
            .build();
    }
}`;

export const HISTORY: Commit[] = [
  {
    msg: 'init: 할 일 서비스 뼈대',
    files: {
      'application.yml': 'spring:\n  datasource:\n    url: jdbc:h2:mem:todo\n    username: sa',
      'README.md': '# todo-service\n\n./gradlew bootRun 으로 실행합니다.',
    },
  },
  {
    msg: 'feat: 운영 DB 연결',
    files: {
      'application-prod.yml': 'spring:\n  datasource:\n    url: jdbc:postgresql://db.internal:5432/todo\n    username: todo_app\n    password: Tod0-prod-2026',
    },
  },
  {
    msg: 'feat: 첨부 파일을 S3에 저장',
    files: { 'StorageConfig.java': STORAGE_V1 },
  },
  {
    msg: 'fix: 비밀번호를 환경 변수로',
    files: {
      'application-prod.yml': 'spring:\n  datasource:\n    url: jdbc:postgresql://db.internal:5432/todo\n    username: todo_app\n    password: ${DB_PASSWORD}',
    },
  },
  {
    msg: 'chore: S3 키 지우기',
    files: { 'StorageConfig.java': STORAGE_V2 },
  },
  {
    msg: 'docs: 운영 실행 방법',
    files: {
      'README.md': '# todo-service\n\n./gradlew bootRun 으로 실행합니다.\n\n운영에서는 DB_PASSWORD=<비밀번호> 를 환경 변수로 넣습니다.',
    },
  },
];

/** FNV-1a, 32-bit, as 7 hex digits: a stand-in for git's SHA-1 that also chains through the parent. */
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0').slice(0, 7);
}

export function hashes(history: Commit[]): string[] {
  const out: string[] = [];
  let parent = '';
  for (const c of history) {
    const files = Object.keys(c.files)
      .sort()
      .map((f) => f + '\0' + c.files[f])
      .join('\0');
    parent = shortHash(parent + '\n' + c.msg + '\n' + files);
    out.push(parent);
  }
  return out;
}

/** The files as they stand after commit `upto` (inclusive). */
export function snapshot(history: Commit[], upto: number): Record<string, string> {
  const snap: Record<string, string> = {};
  for (let i = 0; i <= upto && i < history.length; i++)
    for (const [f, c] of Object.entries(history[i].files)) {
      if (c === null) delete snap[f];
      else snap[f] = c;
    }
  return snap;
}

export interface DiffLine {
  kind: 'add' | 'del' | 'same';
  text: string;
  /** Line number in the new file (for add/same). */
  no?: number;
}

/** A line diff by longest common subsequence (the files here are a dozen lines, so O(n·m) is fine). */
export function diffFile(before: string | undefined, after: string | null): DiffLine[] {
  const a = before ? before.split('\n') : [];
  const b = after ? after.split('\n') : [];
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: 'same', text: b[j], no: ++j });
      i++;
    } else if (i < a.length && (j >= b.length || L[i + 1][j] >= L[i][j + 1])) out.push({ kind: 'del', text: a[i++] });
    else out.push({ kind: 'add', text: b[j], no: ++j });
  }
  return out;
}

export interface Finding {
  commit: number;
  file: string;
  line: number;
  rule: Rule;
  value: string;
}

export function scanLine(text: string): { rule: Rule; value: string } | null {
  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (m && !isPlaceholder(m[rule.group])) return { rule, value: m[rule.group] };
  }
  return null;
}

/** Scan what each commit added (like `gitleaks detect`), or only the files at HEAD (like a check on the working tree). */
export function scan(history: Commit[], scope: 'head' | 'history'): Finding[] {
  const out: Finding[] = [];
  if (scope === 'head') {
    const last = history.length - 1;
    for (const [file, content] of Object.entries(snapshot(history, last)))
      content.split('\n').forEach((text, i) => {
        const hit = scanLine(text);
        if (hit) out.push({ commit: last, file, line: i + 1, ...hit });
      });
    return out;
  }
  history.forEach((c, ci) => {
    const before = ci > 0 ? snapshot(history, ci - 1) : {};
    for (const [file, content] of Object.entries(c.files))
      for (const d of diffFile(before[file], content)) {
        if (d.kind !== 'add') continue;
        const hit = scanLine(d.text);
        if (hit) out.push({ commit: ci, file, line: d.no!, ...hit });
      }
  });
  return out;
}

/** What `git filter-repo --replace-text` (or BFG) does: replace every found value with ***REMOVED*** in every commit. */
export function rewrite(history: Commit[], values: string[]): Commit[] {
  return history.map((c) => ({
    msg: c.msg,
    files: Object.fromEntries(Object.entries(c.files).map(([f, content]) => [f, content === null ? null : values.reduce((s, v) => s.split(v).join('***REMOVED***'), content)])),
  }));
}
