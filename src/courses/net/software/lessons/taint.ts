/*
 * 소프트웨어 보안 · 정적 분석과 오염 추적: a tiny taint analysis over a toy program.
 *
 * A value's taint is the set of sink kinds it is still dangerous for. A source (user input)
 * is dangerous for every kind; a sanitizer removes the kinds it really protects against;
 * joining values takes the union. A sink of kind k reports a finding when an argument is
 * still tainted for k.
 */

export type SinkKind = 'sql' | 'shell' | 'html';
export const SINK_KINDS: SinkKind[] = ['sql', 'shell', 'html'];
export const SINK_KO: Record<SinkKind, string> = { sql: 'SQL 쿼리', shell: '셸 명령', html: 'HTML 출력' };

export type Taint = SinkKind[];

/** One statement of the toy program, as code text plus what it means for the analysis. */
export type Op =
  | { op: 'src'; dst: string; from: string }
  | { op: 'const'; dst: string }
  | { op: 'assign'; dst: string; uses: string[] }
  /** `cleans` lists the sink kinds this sanitizer really protects against. */
  | { op: 'clean'; dst: string; uses: string[]; fn: string; cleans: SinkKind[] }
  | { op: 'sink'; kind: SinkKind; uses: string[]; fn: string }
  | { op: 'if'; cond: string; feasible: boolean }
  | { op: 'end' }
  | { op: 'plain' };

export interface Stmt {
  code: string;
  ir: Op;
}

export interface Finding {
  line: number;
  kind: SinkKind;
  /** Variables that carried the taint into the sink. */
  via: string[];
  /** Ground truth for the figure: does this report point at a real vulnerability? */
  real?: boolean;
}

export interface TaintFrame {
  /** Index of the statement just analysed (−1 before the first). */
  line: number;
  taint: Record<string, Taint>;
  findings: Finding[];
  note: string;
}

const union = (ts: Taint[]): Taint => SINK_KINDS.filter((k) => ts.some((t) => t.includes(k)));

/* ───────── Figure 1: the order handler ───────── */

export type IdHandling = 'raw' | 'escape' | 'parse';

/** The handler of figure 1. The reader chooses how `name` and `id` are handled. */
export function handlerProgram(escapeName: boolean, id: IdHandling, paramQuery: boolean): Stmt[] {
  const idLine: Stmt =
    id === 'parse'
      ? { code: 'const id = parseInt(req.query.id, 10);', ir: { op: 'clean', dst: 'id', uses: ['req.query.id'], fn: 'parseInt', cleans: ['sql', 'shell', 'html'] } }
      : id === 'escape'
        ? { code: 'const id = escapeHtml(req.query.id);', ir: { op: 'clean', dst: 'id', uses: ['req.query.id'], fn: 'escapeHtml', cleans: ['html'] } }
        : { code: 'const id = req.query.id;', ir: { op: 'src', dst: 'id', from: 'req.query.id' } };
  const body: Stmt[] = [
    { code: 'const name = req.query.name;', ir: { op: 'src', dst: 'name', from: 'req.query.name' } },
    idLine,
    escapeName
      ? { code: 'const hello = "안녕하세요, " + escapeHtml(name);', ir: { op: 'clean', dst: 'hello', uses: ['name'], fn: 'escapeHtml', cleans: ['html'] } }
      : { code: 'const hello = "안녕하세요, " + name;', ir: { op: 'assign', dst: 'hello', uses: ['name'] } },
    paramQuery
      ? { code: 'db.query("SELECT * FROM orders WHERE user = ?", [id]);', ir: { op: 'plain' } }
      : { code: 'db.query("SELECT * FROM orders WHERE user = " + id);', ir: { op: 'sink', kind: 'sql', uses: ['id'], fn: 'db.query' } },
    { code: 'const file = "/reports/" + id + ".pdf";', ir: { op: 'assign', dst: 'file', uses: ['id'] } },
    { code: 'exec("print-pdf " + file);', ir: { op: 'sink', kind: 'shell', uses: ['file'], fn: 'exec' } },
    { code: 'res.send("<h1>" + hello + "</h1>");', ir: { op: 'sink', kind: 'html', uses: ['hello'], fn: 'res.send' } },
  ];
  return [{ code: 'function showOrders(req, res) {', ir: { op: 'plain' } }, ...body.map((st) => ({ ...st, code: '  ' + st.code })), { code: '}', ir: { op: 'plain' } }];
}

/** Flow-sensitive, path-insensitive taint analysis, one frame per statement. */
export function analyze(prog: Stmt[]): TaintFrame[] {
  const taint: Record<string, Taint> = {};
  const findings: Finding[] = [];
  const frames: TaintFrame[] = [{ line: -1, taint: {}, findings: [], note: '분석을 시작합니다. 아직 아무 변수도 오염되지 않았습니다.' }];
  const get = (v: string): Taint => (v.startsWith('req.') ? [...SINK_KINDS] : taint[v] ?? []);
  prog.forEach((s, i) => {
    const ir = s.ir;
    let note = '';
    if (ir.op === 'src') {
      taint[ir.dst] = [...SINK_KINDS];
      note = `${ir.from}는 사용자가 보낸 값이므로 출발점입니다. ${ir.dst}는 모든 도착점에 위험합니다.`;
    } else if (ir.op === 'const') {
      taint[ir.dst] = [];
      note = `${ir.dst}에 상수를 넣었습니다. ${ir.dst}는 깨끗합니다.`;
    } else if (ir.op === 'assign') {
      const t = union(ir.uses.map(get));
      taint[ir.dst] = t;
      note = t.length ? `${ir.uses.join(', ')}의 오염이 ${ir.dst}로 옮겨 갑니다. 문자열을 이어 붙여도 오염은 사라지지 않습니다.` : `${ir.dst}는 깨끗한 값만으로 만들어졌습니다.`;
    } else if (ir.op === 'clean') {
      const before = union(ir.uses.map(get));
      const t = before.filter((k) => !ir.cleans.includes(k));
      taint[ir.dst] = t;
      const removed = before.filter((k) => ir.cleans.includes(k));
      note = removed.length
        ? `${ir.fn}는 ${removed.map((k) => SINK_KO[k]).join(', ')}에 대해 정화합니다.${t.length ? ` 그러나 ${t.map((k) => SINK_KO[k]).join(', ')}에는 여전히 위험합니다.` : ' 이제 어디에 넣어도 안전합니다.'}`
        : `${ir.fn}를 거쳤지만 이 값에서 줄어든 위험은 없습니다.`;
    } else if (ir.op === 'sink') {
      const via = ir.uses.filter((v) => get(v).includes(ir.kind));
      if (via.length) {
        findings.push({ line: i, kind: ir.kind, via });
        note = `${ir.fn}는 ${SINK_KO[ir.kind]} 도착점입니다. ${via.join(', ')}가 ${SINK_KO[ir.kind]}에 위험한 채로 들어오므로 경고를 냅니다.`;
      } else note = `${ir.fn}는 ${SINK_KO[ir.kind]} 도착점이지만, 들어오는 값이 이 종류에는 깨끗하므로 경고하지 않습니다.`;
    } else if (s.code.includes('?')) {
      note = '매개변수화된 쿼리는 값을 SQL 문장과 따로 보냅니다. 값이 문장의 일부로 해석되지 않으므로 도착점이 아닙니다.';
    } else note = i === 0 ? '함수가 시작됩니다.' : '함수가 끝납니다.';
    frames.push({ line: i, taint: Object.fromEntries(Object.entries(taint).map(([k, v]) => [k, [...v]])), findings: [...findings], note });
  });
  return frames;
}

/* ───────── Figure 2: how precise should the analysis be? ───────── */

export type Precision = 'insensitive' | 'flow' | 'path';
export const PRECISION_KO: Record<Precision, string> = { insensitive: '흐름 무시', flow: '흐름 고려', path: '흐름과 경로 고려' };

/** The program of figure 2. `real` marks the findings that are true vulnerabilities. */
export const PRECISION_PROGRAM: Stmt[] = [
  { code: 'let q = req.query.q;', ir: { op: 'src', dst: 'q', from: 'req.query.q' } },
  { code: 'q = "latest";', ir: { op: 'const', dst: 'q' } },
  { code: 'db.query("SELECT * FROM news WHERE tag = \'" + q + "\'");', ir: { op: 'sink', kind: 'sql', uses: ['q'], fn: 'db.query' } },
  { code: 'const name = req.query.name;', ir: { op: 'src', dst: 'name', from: 'req.query.name' } },
  { code: 'const debug = false;', ir: { op: 'const', dst: 'debug' } },
  { code: 'if (debug) {', ir: { op: 'if', cond: 'debug', feasible: false } },
  { code: '  exec("trace " + name);', ir: { op: 'sink', kind: 'shell', uses: ['name'], fn: 'exec' } },
  { code: '}', ir: { op: 'end' } },
  { code: 'if (name.length < 40) {', ir: { op: 'if', cond: 'name.length < 40', feasible: true } },
  { code: '  res.send("<p>" + name + "</p>");', ir: { op: 'sink', kind: 'html', uses: ['name'], fn: 'res.send' } },
  { code: '}', ir: { op: 'end' } },
];

/** Lines whose findings are real vulnerabilities in PRECISION_PROGRAM. */
const REAL_LINES = new Set([9]);

/**
 * Run the analysis at a given precision.
 * - insensitive: one taint per variable for the whole function (union of every assignment).
 * - flow: statement order matters (a later constant assignment clears the variable).
 * - path: also skips branches whose condition is a known constant false.
 */
export function analyzePrecision(prog: Stmt[], p: Precision): { findings: Finding[]; facts: number } {
  const vars = new Set<string>();
  prog.forEach((s) => {
    const ir = s.ir;
    if ('dst' in ir) vars.add(ir.dst);
  });
  const findings: Finding[] = [];
  if (p === 'insensitive') {
    // a variable is tainted if any statement anywhere taints it
    const t: Record<string, Taint> = {};
    let changed = true;
    while (changed) {
      changed = false;
      for (const s of prog) {
        const ir = s.ir;
        let nt: Taint | null = null;
        if (ir.op === 'src') nt = [...SINK_KINDS];
        else if (ir.op === 'assign') nt = union(ir.uses.map((v) => t[v] ?? []));
        else if (ir.op === 'clean') nt = union(ir.uses.map((v) => t[v] ?? [])).filter((k) => !ir.cleans.includes(k));
        if (nt && 'dst' in ir) {
          const merged = union([t[ir.dst] ?? [], nt]);
          if (merged.length !== (t[ir.dst] ?? []).length) {
            t[ir.dst] = merged;
            changed = true;
          }
        }
      }
    }
    prog.forEach((s, i) => {
      const ir = s.ir;
      if (ir.op === 'sink') {
        const via = ir.uses.filter((v) => (t[v] ?? []).includes(ir.kind));
        if (via.length) findings.push({ line: i, kind: ir.kind, via, real: REAL_LINES.has(i) });
      }
    });
    return { findings, facts: vars.size };
  }
  // flow (and path) sensitive: walk in order, skipping infeasible blocks in path mode
  const t: Record<string, Taint> = {};
  let skip = 0;
  prog.forEach((s, i) => {
    const ir = s.ir;
    if (ir.op === 'if') {
      if (skip || (p === 'path' && !ir.feasible)) skip++;
      return;
    }
    if (ir.op === 'end') {
      if (skip) skip--;
      return;
    }
    if (skip) return;
    if (ir.op === 'src') t[ir.dst] = [...SINK_KINDS];
    else if (ir.op === 'const') t[ir.dst] = [];
    else if (ir.op === 'assign') t[ir.dst] = union(ir.uses.map((v) => t[v] ?? []));
    else if (ir.op === 'clean') t[ir.dst] = union(ir.uses.map((v) => t[v] ?? [])).filter((k) => !ir.cleans.includes(k));
    else if (ir.op === 'sink') {
      const via = ir.uses.filter((v) => (t[v] ?? []).includes(ir.kind));
      if (via.length) findings.push({ line: i, kind: ir.kind, via, real: REAL_LINES.has(i) });
    }
  });
  const points = prog.length;
  const branches = prog.filter((s) => s.ir.op === 'if').length;
  // facts tracked: one taint per variable (insensitive), per variable per program point (flow),
  // and per path as well (path): 2^branches paths through the function
  return { findings, facts: p === 'flow' ? vars.size * points : vars.size * points * 2 ** branches };
}

/* ───────── Figure 3: the precision–recall trade-off on a benchmark ───────── */

export interface Candidate {
  flow: string;
  /** True if this flow is a real vulnerability. */
  vuln: boolean;
  /** The analyzer's confidence score, 0..100. */
  score: number;
  why: string;
}

/** Sixteen candidate flows an analyzer might report, with their ground truth. */
export const BENCHMARK: Candidate[] = [
  { flow: '요청 값 → 문자열 연결 → db.query', vuln: true, score: 95, why: '전형적인 SQL 삽입입니다.' },
  { flow: '쿠키 값 → 응답 HTML에 그대로', vuln: true, score: 85, why: '반사형 XSS입니다.' },
  { flow: '요청 JSON의 필드 → res.send', vuln: true, score: 70, why: '객체 필드를 거쳐도 오염은 그대로입니다.' },
  { flow: '요청 값 → 길이만 검사 → exec', vuln: true, score: 65, why: '길이 검사는 특수 문자를 막지 못합니다.' },
  { flow: '요청 값 → escapeHtml → db.query', vuln: true, score: 60, why: 'HTML용 정화는 SQL을 막지 못합니다.' },
  { flow: '요청 값 → 모르는 라이브러리 함수 → exec', vuln: true, score: 55, why: '라이브러리가 값을 그대로 돌려줍니다.' },
  { flow: '요청 값 → 실행되지 않는 분기 안의 exec', vuln: false, score: 50, why: '조건이 언제나 거짓이라 실행되지 않습니다.' },
  { flow: '요청 값 → 허용 목록 검사 → exec', vuln: false, score: 45, why: '정해 둔 값만 통과합니다.' },
  { flow: '요청 헤더 → 로그 파일 → 관리자 화면 HTML', vuln: true, score: 40, why: '저장했다가 나중에 보여 주는 2차 XSS입니다.' },
  { flow: '요청 값 → 정규식 ^[a-z]+$ 검사 → db.query', vuln: false, score: 35, why: '처음부터 끝까지 소문자만 허용합니다.' },
  { flow: '요청 값 → 정규식 [a-z]+ 검사 → db.query', vuln: true, score: 35, why: '앵커가 없어 소문자가 하나만 있어도 통과합니다.' },
  { flow: '설정 파일 값 → exec', vuln: false, score: 30, why: '공격자가 설정 파일을 바꿀 수 없습니다.' },
  { flow: 'DB에서 읽은 글 → res.send', vuln: true, score: 25, why: '다른 사용자가 저장해 둔 저장형 XSS입니다.' },
  { flow: '요청 값 → parseInt → db.query', vuln: false, score: 20, why: '숫자로 바뀌어 SQL 문법이 될 수 없습니다.' },
  { flow: '요청 값 → 매개변수화된 쿼리', vuln: false, score: 10, why: '값이 문장과 따로 전달됩니다.' },
  { flow: '상수 문자열 → db.query', vuln: false, score: 5, why: '사용자 입력이 없습니다.' },
];

export interface Confusion {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
}

/** Report every candidate whose score is at least `threshold`, and score the result. */
export function confusion(cands: Candidate[], threshold: number): Confusion {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const c of cands) {
    const rep = c.score >= threshold;
    if (rep && c.vuln) tp++;
    else if (rep) fp++;
    else if (c.vuln) fn++;
    else tn++;
  }
  return { tp, fp, fn, tn, precision: tp + fp ? tp / (tp + fp) : 1, recall: tp + fn ? tp / (tp + fn) : 1 };
}
