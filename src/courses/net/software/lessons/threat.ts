/*
 * 위협 모델링: a fictional neighbourhood library loan service, its data-flow diagram,
 * STRIDE per element, an attack tree with mitigations, and a risk matrix.
 * Pure data and functions, no imports, so node can run it directly.
 */

/* ───────── data-flow diagram ───────── */

export type ElemKind = 'entity' | 'process' | 'store' | 'flow';
export type Stride = 'S' | 'T' | 'R' | 'I' | 'D' | 'E';

export const STRIDE_KO: Record<Stride, { name: string; en: string; breaks: string }> = {
  S: { name: '위장', en: 'Spoofing', breaks: '인증' },
  T: { name: '변조', en: 'Tampering', breaks: '무결성' },
  R: { name: '부인', en: 'Repudiation', breaks: '부인 방지' },
  I: { name: '정보 노출', en: 'Information disclosure', breaks: '기밀성' },
  D: { name: '서비스 거부', en: 'Denial of service', breaks: '가용성' },
  E: { name: '권한 상승', en: 'Elevation of privilege', breaks: '인가' },
};

/** Which STRIDE categories apply to which kind of element (the "STRIDE per element" chart). */
export const STRIDE_BY_KIND: Record<ElemKind, Stride[]> = {
  entity: ['S', 'R'],
  process: ['S', 'T', 'R', 'I', 'D', 'E'],
  store: ['T', 'R', 'I', 'D'],
  flow: ['T', 'I', 'D'],
};

export interface Threat {
  cat: Stride;
  text: string;
  fix: string;
}

export interface DfdElem {
  id: string;
  kind: ElemKind;
  name: string;
  /** Centre for entities/processes/stores, in a 120 × 64 diagram space. */
  x?: number;
  y?: number;
  /** For flows: from and to element ids, and a label. */
  from?: string;
  to?: string;
  /** Whether a flow crosses a trust boundary. */
  crosses?: boolean;
  threats: Threat[];
}

/** The server zone: everything inside runs on the library's own servers. */
export const ZONE = { x: 30, y: 3, w: 68, h: 58 };

export const DFD: DfdElem[] = [
  {
    id: 'member', kind: 'entity', name: '회원', x: 12, y: 16,
    threats: [
      { cat: 'S', text: '남의 비밀번호를 알아낸 사람이 그 회원인 척 로그인합니다.', fix: '다중 인증, 패스키' },
      { cat: 'R', text: '회원이 "그 책은 내가 빌린 적 없다"고 우깁니다.', fix: '대출마다 시각과 계정을 남기는 기록' },
    ],
  },
  {
    id: 'librarian', kind: 'entity', name: '사서', x: 12, y: 48,
    threats: [
      { cat: 'S', text: '공격자가 사서 계정으로 로그인해 관리 화면을 씁니다.', fix: '관리자 계정은 보안 키로만 로그인' },
      { cat: 'R', text: '연체료를 지운 사서가 누가 지웠는지 밝혀지지 않습니다.', fix: '관리 작업마다 사서 이름이 남는 감사 로그' },
    ],
  },
  {
    id: 'web', kind: 'process', name: '웹 서버', x: 46, y: 32,
    threats: [
      { cat: 'S', text: '세션 쿠키를 훔친 사람이 그 회원으로 요청을 보냅니다.', fix: 'HttpOnly·Secure 쿠키, 짧은 세션' },
      { cat: 'T', text: '요청의 회원 번호를 고쳐 남의 대출을 연장합니다.', fix: '서버가 로그인한 회원 기준으로만 처리' },
      { cat: 'R', text: '실패한 로그인 시도를 기록하지 않아 공격을 알아채지 못합니다.', fix: '인증 이벤트 기록과 경보' },
      { cat: 'I', text: '오류 화면에 데이터베이스 질의와 서버 경로가 그대로 보입니다.', fix: '사용자에게는 일반 오류만, 자세한 내용은 로그로' },
      { cat: 'D', text: '검색 요청을 초당 수천 번 보내 서버를 멈춥니다.', fix: '속도 제한, 비싼 질의에 한도' },
      { cat: 'E', text: '주소만 /admin으로 바꾸면 회원도 관리 화면이 열립니다.', fix: '모든 관리 요청에서 역할 확인' },
    ],
  },
  {
    id: 'notify', kind: 'process', name: '알림 발송', x: 72, y: 48,
    threats: [
      { cat: 'S', text: '아무나 알림 발송 기능을 불러 도서관 이름으로 메일을 보냅니다.', fix: '내부 서비스 사이에도 인증' },
      { cat: 'T', text: '반납 알림 메일의 링크를 피싱 주소로 바꿉니다.', fix: '메일 본문은 서버의 고정 틀로만 만들기' },
      { cat: 'R', text: '어떤 알림을 언제 보냈는지 남지 않습니다.', fix: '발송 기록' },
      { cat: 'I', text: '알림 메일에 회원의 전체 대출 목록이 담겨 나갑니다.', fix: '메일에는 꼭 필요한 정보만' },
      { cat: 'D', text: '메일 서비스가 느려지면 웹 서버까지 기다리다 멈춥니다.', fix: '큐에 넣고 따로 보내기, 시간 제한' },
      { cat: 'E', text: '알림 발송 프로그램이 데이터베이스 전체를 쓸 수 있는 계정으로 돕니다.', fix: '읽기 전용, 필요한 열만 보는 계정' },
    ],
  },
  {
    id: 'db', kind: 'store', name: '회원·대출 DB', x: 86, y: 14,
    threats: [
      { cat: 'T', text: 'SQL 삽입으로 연체 기록을 지웁니다.', fix: '매개변수 바인딩' },
      { cat: 'R', text: '데이터를 고친 흔적이 남지 않습니다.', fix: '변경 이력 테이블' },
      { cat: 'I', text: '백업 파일이 공개 저장소에 올라가 회원 정보가 새어 나갑니다.', fix: '백업 암호화, 저장소 접근 제한' },
      { cat: 'D', text: '디스크가 가득 차 새 대출을 기록하지 못합니다.', fix: '용량 감시, 오래된 로그 정리' },
    ],
  },
  {
    id: 'mail', kind: 'entity', name: '메일 서비스', x: 108, y: 48,
    threats: [
      { cat: 'S', text: '공격자가 도서관 도메인을 흉내 낸 메일을 보냅니다.', fix: 'SPF, DKIM, DMARC 설정' },
      { cat: 'R', text: '메일이 갔는지 안 갔는지 확인할 수 없습니다.', fix: '발송 결과 기록 보관' },
    ],
  },
  {
    id: 'f-login', kind: 'flow', name: '로그인·대출 요청', from: 'member', to: 'web', crosses: true,
    threats: [
      { cat: 'T', text: '공용 와이파이에서 요청을 가로채 고칩니다.', fix: 'HTTPS와 HSTS' },
      { cat: 'I', text: '비밀번호가 평문으로 네트워크를 지나갑니다.', fix: 'HTTPS' },
      { cat: 'D', text: '로그인 요청이 몰려 진짜 회원이 들어오지 못합니다.', fix: '속도 제한, 봇 판별' },
    ],
  },
  {
    id: 'f-admin', kind: 'flow', name: '관리 화면', from: 'librarian', to: 'web', crosses: true,
    threats: [
      { cat: 'T', text: '사서의 요청을 위조해 연체료를 지웁니다(CSRF).', fix: 'SameSite 쿠키, CSRF 토큰' },
      { cat: 'I', text: '관리 화면이 인터넷 어디서나 열립니다.', fix: '도서관 내부망이나 VPN에서만 열기' },
      { cat: 'D', text: '관리 화면이 회원 트래픽에 밀려 열리지 않습니다.', fix: '관리 경로를 따로 두기' },
    ],
  },
  {
    id: 'f-sql', kind: 'flow', name: '질의', from: 'web', to: 'db', crosses: false,
    threats: [
      { cat: 'T', text: '이어 붙인 문자열 질의가 공격자의 SQL로 바뀝니다.', fix: '매개변수 바인딩' },
      { cat: 'I', text: '데이터베이스 연결이 암호화되지 않아 같은 망의 다른 서버가 엿봅니다.', fix: '내부 연결도 TLS' },
      { cat: 'D', text: '인덱스 없는 질의 하나가 데이터베이스를 붙잡습니다.', fix: '질의 시간 제한, 인덱스' },
    ],
  },
  {
    id: 'f-notify', kind: 'flow', name: '알림 요청', from: 'web', to: 'notify', crosses: false,
    threats: [
      { cat: 'T', text: '알림 요청의 받는 사람 주소를 바꿉니다.', fix: '받는 사람은 회원 번호로 서버가 찾기' },
      { cat: 'I', text: '알림 요청 로그에 회원 전화번호가 남습니다.', fix: '로그에 개인 정보 가리기' },
      { cat: 'D', text: '알림이 수만 건 쌓여 처리가 밀립니다.', fix: '큐 길이 한도' },
    ],
  },
  {
    id: 'f-mail', kind: 'flow', name: '메일 발송', from: 'notify', to: 'mail', crosses: true,
    threats: [
      { cat: 'T', text: '메일 서비스로 가는 요청이 중간에서 바뀝니다.', fix: 'HTTPS, API 키 서명' },
      { cat: 'I', text: '메일 서비스의 API 키가 코드 저장소에 올라가 있습니다.', fix: '비밀 값은 비밀 저장소에' },
      { cat: 'D', text: '메일 서비스의 발송 한도를 다 써서 알림이 끊깁니다.', fix: '한도 감시, 중요한 알림 우선' },
    ],
  },
];

export const findElem = (id: string) => DFD.find((e) => e.id === id)!;
export const totalThreats = () => DFD.reduce((n, e) => n + e.threats.length, 0);
/** Threats on the flows that cross a trust boundary. */
export const boundaryThreats = () => DFD.filter((e) => e.kind === 'flow' && e.crosses).reduce((n, e) => n + e.threats.length, 0);

/* ───────── attack tree ───────── */

export type MitId = 'owner' | 'mfa' | 'passkey' | 'ratelimit' | 'backup' | 'training';

export const MITIGATIONS: { id: MitId; name: string; blurb: string }[] = [
  { id: 'owner', name: '서버에서 소유자 확인', blurb: '대출 목록을 줄 때 요청한 회원 번호가 로그인한 회원인지 확인' },
  { id: 'ratelimit', name: '로그인 속도 제한', blurb: '계정마다 분당 10번까지만 시도' },
  { id: 'mfa', name: '다중 인증 (TOTP)', blurb: '비밀번호에 더해 휴대폰의 6자리 코드' },
  { id: 'backup', name: '백업 암호화', blurb: '백업 파일을 열려면 따로 보관한 키가 필요' },
  { id: 'passkey', name: '패스키', blurb: '비밀번호 대신 기기에 저장된 키로 로그인' },
  { id: 'training', name: '사서 본인 확인 절차', blurb: '전화로는 대출 기록을 알려 주지 않고, 신분증 확인' },
];

export interface TreeNode {
  id: string;
  label: string;
  /** 'or': the cheapest child; 'and': all children; leaf: its own cost. */
  op?: 'or' | 'and';
  children?: TreeNode[];
  /** Leaf cost: attacker's effort in hours. */
  cost?: number;
}

export const TREE: TreeNode = {
  id: 'goal',
  label: '다른 회원의 대출 기록 보기',
  op: 'or',
  children: [
    {
      id: 'login', label: '그 회원 계정으로 로그인', op: 'or',
      children: [
        { id: 'guess', label: '비밀번호 추측', cost: 80 },
        { id: 'stuff', label: '다른 사이트에서 유출된 비밀번호 재사용', cost: 20 },
        { id: 'phish', label: '가짜 로그인 페이지로 받아 내기', cost: 60 },
      ],
    },
    {
      id: 'idor', label: '주소의 회원 번호 바꾸기', op: 'and',
      children: [
        { id: 'signup', label: '아무 계정이나 하나 만들기', cost: 1 },
        { id: 'swap', label: '/loans?member=1042의 번호를 바꿔 요청', cost: 2 },
      ],
    },
    {
      id: 'backupleak', label: '데이터베이스 백업 손에 넣기', op: 'and',
      children: [
        { id: 'find', label: '공개된 백업 파일 찾기', cost: 40 },
        { id: 'open', label: '백업 파일 열기', cost: 0 },
      ],
    },
    { id: 'social', label: '사서에게 전화해 회원인 척하기', cost: 150 },
  ],
};

export const INF = Number.POSITIVE_INFINITY;

/** Leaf cost after mitigations. Infinity means the step no longer works at all. */
export function leafCost(id: string, base: number, on: Set<MitId>): number {
  switch (id) {
    case 'guess':
      return on.has('passkey') || on.has('mfa') || on.has('ratelimit') ? INF : base;
    case 'stuff':
      return on.has('passkey') || on.has('mfa') ? INF : base;
    case 'phish':
      // a phishing page can relay a TOTP code in real time, at extra cost; passkeys are bound to the real site
      return on.has('passkey') ? INF : on.has('mfa') ? base * 2 : base;
    case 'swap':
      return on.has('owner') ? INF : base;
    case 'open':
      return on.has('backup') ? INF : base;
    case 'social':
      return on.has('training') ? base * 4 : base;
    default:
      return base;
  }
}

export interface Evaluated {
  node: TreeNode;
  cost: number;
  /** Whether this node lies on the cheapest path to the goal. */
  onPath: boolean;
  children: Evaluated[];
}

export function evaluate(node: TreeNode, costs: Record<string, number>, on: Set<MitId>): Evaluated {
  if (!node.children) {
    const c = leafCost(node.id, costs[node.id] ?? node.cost ?? 0, on);
    return { node, cost: c, onPath: false, children: [] };
  }
  const ch = node.children.map((c) => evaluate(c, costs, on));
  const cost = node.op === 'and' ? ch.reduce((s, c) => s + c.cost, 0) : Math.min(...ch.map((c) => c.cost));
  return { node, cost, onPath: false, children: ch };
}

/** Mark the cheapest path from the root: every child of an AND, the cheapest child of an OR. */
export function markPath(e: Evaluated): Evaluated {
  const walk = (n: Evaluated) => {
    n.onPath = true;
    if (!n.children.length || !isFinite(n.cost)) return;
    if (n.node.op === 'and') n.children.forEach(walk);
    else walk(n.children.reduce((a, b) => (b.cost < a.cost ? b : a)));
  };
  if (isFinite(e.cost)) walk(e);
  return e;
}

export const defaultCosts = (): Record<string, number> => {
  const out: Record<string, number> = {};
  const walk = (n: TreeNode) => {
    if (n.cost !== undefined) out[n.id] = n.cost;
    n.children?.forEach(walk);
  };
  walk(TREE);
  return out;
};

export const leaves = (): TreeNode[] => {
  const out: TreeNode[] = [];
  const walk = (n: TreeNode) => (n.children ? n.children.forEach(walk) : out.push(n));
  walk(TREE);
  return out;
};

/** The cheapest leaf-level route as a list of leaf labels, for prose. */
export function pathLeaves(e: Evaluated): string[] {
  const out: string[] = [];
  const walk = (n: Evaluated) => {
    if (!n.onPath) return;
    if (!n.children.length) out.push(n.node.label);
    n.children.forEach(walk);
  };
  walk(e);
  return out;
}

/* ───────── risk matrix ───────── */

export interface Risk {
  id: string;
  name: string;
  /** 1 (rare) .. 5 (almost certain). */
  likelihood: number;
  /** 1 (negligible) .. 5 (severe). */
  impact: number;
}

export const RISKS: Risk[] = [
  { id: 'idor', name: '회원 번호를 바꿔 남의 대출 보기', likelihood: 5, impact: 4 },
  { id: 'stuff', name: '유출된 비밀번호로 로그인', likelihood: 4, impact: 3 },
  { id: 'admin', name: '회원이 관리 화면 열기', likelihood: 2, impact: 5 },
  { id: 'backup', name: '공개된 백업 유출', likelihood: 2, impact: 5 },
  { id: 'dos', name: '검색 요청 폭주로 서비스 중단', likelihood: 3, impact: 2 },
  { id: 'error', name: '오류 화면에 서버 정보 노출', likelihood: 4, impact: 1 },
  { id: 'mailkey', name: '저장소에 올라간 메일 API 키', likelihood: 2, impact: 3 },
];

export const riskScore = (r: Risk) => r.likelihood * r.impact;
export const riskLevel = (s: number): 'high' | 'mid' | 'low' => (s >= 12 ? 'high' : s >= 6 ? 'mid' : 'low');
export const RISK_LEVEL_KO = { high: '높음', mid: '중간', low: '낮음' } as const;
export const LIKELIHOOD_KO = ['', '드묾', '가끔', '있을 법함', '자주', '거의 확실'];
export const IMPACT_KO = ['', '거의 없음', '작음', '보통', '큼', '심각'];
