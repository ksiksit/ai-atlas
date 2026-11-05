/*
 * 소프트웨어 보안 · 접근 제어: a fictional team app ("모래시계 팀 공간") with users, resources and
 * actions; the same policy as a matrix, ACLs, capability lists and roles; an attribute rule;
 * a mock order API with a missing ownership check; and a build service as a confused deputy.
 */

export const USERS = ['민지', '준호', '서연', '도윤', '하늘'] as const;
export type User = (typeof USERS)[number];
export const USER_NOTE: Record<User, string> = { 민지: '개발', 준호: '개발', 서연: '인사', 도윤: '대표', 하늘: '외부 감사' };

export const RESOURCES = ['소스 코드', '배포 서버', '급여표', '회의록'] as const;
export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = ['읽기', '쓰기'] as const;
export type Action = (typeof ACTIONS)[number];

/** matrix[user][resource] = set of actions, as bits: 1 읽기, 2 쓰기. */
export type Matrix = number[][];

export const READ = 1, WRITE = 2;

export const DEFAULT_MATRIX: Matrix = [
  // 소스 코드, 배포 서버, 급여표, 회의록
  [READ | WRITE, READ | WRITE, 0, READ | WRITE], // 민지
  [READ | WRITE, READ | WRITE, 0, READ | WRITE], // 준호
  [0, 0, READ | WRITE, READ | WRITE], // 서연
  [READ, READ, READ, READ | WRITE], // 도윤
  [0, 0, READ, READ], // 하늘
];

export const can = (m: Matrix, u: number, r: number, a: number) => (m[u][r] & a) !== 0;

export const bitsText = (b: number) => (b === (READ | WRITE) ? '읽기·쓰기' : b === READ ? '읽기' : b === WRITE ? '쓰기' : '');

/** Number of (user, resource, action) grants: the entries an ACL or capability list must store. */
export const grants = (m: Matrix) => m.reduce((s, row) => s + row.reduce((t, b) => t + ((b & READ) ? 1 : 0) + ((b & WRITE) ? 1 : 0), 0), 0);

/** Roles needed if every distinct row of permissions becomes one role (users with no rights need none). */
export function roles(m: Matrix): { key: string; perms: number[]; users: number[] }[] {
  const out: { key: string; perms: number[]; users: number[] }[] = [];
  m.forEach((row, u) => {
    if (row.every((b) => b === 0)) return;
    const key = row.join(',');
    const hit = out.find((x) => x.key === key);
    if (hit) hit.users.push(u);
    else out.push({ key, perms: row.slice(), users: [u] });
  });
  return out;
}

/* ───────── attribute-based rule ───────── */

export interface Attrs {
  user: number;
  hour: number;
  managedDevice: boolean;
}

/** "급여표 읽기: 인사팀 또는 대표, 업무 시간(9시~18시), 회사가 관리하는 기기에서만." */
export function abacPayroll(a: Attrs): { allow: boolean; checks: { label: string; ok: boolean }[] } {
  const dept = USER_NOTE[USERS[a.user]];
  const checks = [
    { label: `부서가 인사 또는 대표 (지금: ${dept})`, ok: dept === '인사' || dept === '대표' },
    { label: `업무 시간 9시~18시 (지금: ${a.hour}시)`, ok: a.hour >= 9 && a.hour < 18 },
    { label: `회사가 관리하는 기기 (지금: ${a.managedDevice ? '예' : '아니요'})`, ok: a.managedDevice },
  ];
  return { allow: checks.every((c) => c.ok), checks };
}

/* ───────── the order API ───────── */

export interface Order {
  id: number;
  owner: User;
  item: string;
  address: string;
  amount: number;
}

const ITEMS = ['머그컵', '노트', '키보드', '우산', '텀블러', '이어폰', '양말 세트', '연필 12자루'];
const STREETS = ['해오름로', '달빛길', '물방울로', '솔바람길', '모래톱로'];

/** Orders 1001 … 1040, spread over the users in a fixed pattern (no randomness, so prose can cite them). */
export const ORDERS: Order[] = Array.from({ length: 40 }, (_, k) => {
  const id = 1001 + k;
  const owner = USERS[(k * 3 + Math.floor(k / 5)) % USERS.length];
  return {
    id,
    owner,
    item: ITEMS[(k * 5) % ITEMS.length],
    address: `${STREETS[k % STREETS.length]} ${10 + ((k * 7) % 90)}`,
    amount: 4000 + ((k * 3700) % 41000),
  };
});

export const ME: User = '민지';

export interface ApiResponse {
  status: 200 | 403 | 404;
  body: string;
  /** The response showed someone else's order. */
  leak: boolean;
}

/** GET /api/orders/{id} as the logged-in user ME. `checkOwner` is the fix. */
export function getOrder(id: number, checkOwner: boolean): ApiResponse {
  const o = ORDERS.find((x) => x.id === id);
  if (!o) return { status: 404, body: '{ "error": "없는 주문" }', leak: false };
  if (checkOwner && o.owner !== ME) return { status: 403, body: '{ "error": "이 주문을 볼 권한이 없습니다" }', leak: false };
  const body = `{\n  "id": ${o.id},\n  "주문자": "${o.owner}",\n  "상품": "${o.item}",\n  "배송지": "${o.address}",\n  "금액": ${o.amount}\n}`;
  return { status: 200, body, leak: o.owner !== ME };
}

/** Scan every id in [from, to]: how many responses leaked someone else's order. */
export function scan(from: number, to: number, checkOwner: boolean) {
  let leaks = 0, mine = 0, denied = 0;
  for (let id = from; id <= to; id++) {
    const r = getOrder(id, checkOwner);
    if (r.leak) leaks++;
    else if (r.status === 200) mine++;
    else if (r.status === 403) denied++;
  }
  return { leaks, mine, denied };
}

/* ───────── confused deputy ───────── */

export type DeputyMode = 'ambient' | 'capability';

export const PATHS = ['/home/민지/app.bin', '/home/준호/app.bin', '/billing/usage.log'] as const;
export type Path = (typeof PATHS)[number];

/** Who may write each path (the build service itself may write the billing log to record usage). */
export const MAY_WRITE: Record<Path, string[]> = {
  '/home/민지/app.bin': ['민지', '빌드 도우미'],
  '/home/준호/app.bin': ['준호', '빌드 도우미'],
  '/billing/usage.log': ['빌드 도우미'],
};

export interface DeputyResult {
  wrote: boolean;
  harm: boolean;
  steps: string[];
}

/**
 * 민지 asks the build service to compile and write the output to `out`.
 * ambient: the service opens `out` with its own rights.
 * capability: 민지 must open `out` herself and pass the open handle; the service writes only through it.
 */
export function deputy(out: Path, mode: DeputyMode): DeputyResult {
  const mine = out === '/home/민지/app.bin';
  if (mode === 'ambient') {
    const ok = MAY_WRITE[out].includes('빌드 도우미');
    return {
      wrote: ok,
      harm: ok && !mine,
      steps: [
        `민지가 요청합니다: compile("app.c", "${out}")`,
        `빌드 도우미가 자기 권한으로 ${out}을 엽니다. 이 파일에 쓸 수 있는 것은 ${MAY_WRITE[out].join(', ')}이고, 빌드 도우미가 그 안에 있으니 열립니다.`,
        mine ? '민지의 파일에 결과를 씁니다. 원래 의도한 동작입니다.' : `결과를 ${out}에 덮어씁니다. 민지는 이 파일을 쓸 권한이 없는데, 빌드 도우미가 대신 써 주었습니다.`,
      ],
    };
  }
  const ok = MAY_WRITE[out].includes(ME);
  return {
    wrote: ok,
    harm: false,
    steps: [
      `민지가 먼저 ${out}을 자기 권한으로 열어 봅니다.`,
      ok ? '열립니다. 민지는 열린 파일 핸들을 빌드 도우미에게 건넵니다.' : `열리지 않습니다. 민지는 ${out}을 쓸 권한이 없으므로 건넬 핸들이 없습니다.`,
      ok ? '빌드 도우미는 받은 핸들로만 씁니다. 자기 권한은 쓰지 않습니다.' : '요청은 빌드 도우미에 닿기 전에 끝납니다. 사용 기록 파일은 그대로입니다.',
    ],
  };
}

/* ───────── least privilege ───────── */

export interface Grant {
  id: string;
  label: string;
  /** Resources an attacker who controls the service could reach through this grant. */
  reach: number;
  needed: boolean;
}

/** What a small "thumbnail service" was given. Only the first two are needed for its job. */
export const SERVICE_GRANTS: Grant[] = [
  { id: 'read-uploads', label: '업로드 폴더 읽기', reach: 1, needed: true },
  { id: 'write-thumbs', label: '썸네일 폴더 쓰기', reach: 1, needed: true },
  { id: 'db-admin', label: '데이터베이스 관리자 계정', reach: 12, needed: false },
  { id: 'home-rw', label: '모든 사용자 홈 폴더 읽기·쓰기', reach: 5, needed: false },
  { id: 'net-any', label: '어디로나 나가는 네트워크', reach: 1, needed: false },
  { id: 'root', label: '관리자(root)로 실행', reach: 20, needed: false },
];
