/* 사람과 컴퓨터의 상호작용 · 사용성 평가: the scripted session, discovery models, heuristic evaluation and SUS. */

import { rng } from '../../../../lib/math';

/* ───────── 1. a think-aloud session ───────── */

/** Severity scale for usability problems (Nielsen). */
export const SEVERITY = ['문제 아님', '겉모양', '사소함', '중대함', '치명적'] as const;
export const SEVERITY_SHORT = ['0', '1', '2', '3', '4'];

export interface SessionLine {
  t: string;
  /** 'say' = the participant thinking aloud, 'do' = what the observer saw, 'ask' = the facilitator. */
  kind: 'say' | 'do' | 'ask';
  text: string;
  /** If this moment shows a problem: a short name and the severity three observers agreed on afterwards. */
  problem?: { name: string; severity: number };
}

/** Task: "도서관 앱에서 빌린 책의 반납 기한을 연장하세요." A fictional app, a fictional participant. */
export const SESSION: SessionLine[] = [
  { t: '00:00', kind: 'ask', text: '빌린 책 "작은 아씨들"의 반납 기한을 연장해 주세요. 생각나는 것을 소리 내어 말씀해 주시면 됩니다.' },
  { t: '00:06', kind: 'say', text: '음, 첫 화면에 "추천 도서"랑 "행사 안내"만 있네요. 내 책은 어디 있지?' },
  { t: '00:19', kind: 'do', text: '아래쪽 탭 막대의 아이콘 다섯 개를 하나씩 길게 누른다. 이름표가 없다.', problem: { name: '탭 아이콘에 이름표가 없음', severity: 3 } },
  { t: '00:41', kind: 'say', text: '사람 모양이 "내 정보"인가 봐요. 아, 여기 "대출 중 1권"이 있네.' },
  { t: '00:48', kind: 'do', text: '"작은 아씨들"을 누른다. 책 소개 화면이 뜨고, "연장" 버튼은 화면 맨 아래에 회색 글씨로 있다.' },
  { t: '01:02', kind: 'say', text: '연장 버튼이 회색이라 안 눌리는 줄 알았어요. 눌러 보니까 되네요?', problem: { name: '눌리는 버튼이 비활성처럼 보임', severity: 2 } },
  { t: '01:05', kind: 'do', text: '"연장" 버튼을 누른다. 0.5초 동안 아무 변화가 없다가 화면이 그대로 돌아온다.' },
  { t: '01:09', kind: 'say', text: '된 건가요? 아무 말이 없는데요. 한 번 더 눌러 볼게요.', problem: { name: '연장 뒤에 확인 메시지가 없음', severity: 3 } },
  { t: '01:12', kind: 'do', text: '다시 누르자 "연장 횟수를 모두 사용했습니다"라는 오류가 뜬다. 첫 번째 누름이 이미 연장을 했다.', problem: { name: '두 번 누르면 연장 기회를 잃음', severity: 4 } },
  { t: '01:20', kind: 'say', text: '헉, 제가 뭘 잘못한 거예요? 이제 연장이 안 되는 거예요?' },
  { t: '01:31', kind: 'do', text: '"내 정보"로 돌아가 반납일을 확인한다. 날짜가 "2026.11.19"에서 "2026.11.26"으로 바뀌어 있다.' },
  { t: '01:38', kind: 'say', text: '아, 연장은 됐네요. 근데 날짜 글씨가 너무 작아서 바뀐 걸 못 봤어요.', problem: { name: '반납일 글씨가 너무 작음', severity: 1 } },
  { t: '01:45', kind: 'ask', text: '과제를 마치셨습니다. 1점(아주 어려움)에서 7점(아주 쉬움) 사이로 매기면요?' },
  { t: '01:50', kind: 'say', text: '3점이요. 결국 하긴 했는데 불안했어요.' },
];

/* ───────── 2. how many users find how many problems ───────── */

/** Expected share of problems found by n users when each user finds each problem with probability p. */
export const foundShare = (p: number, n: number) => 1 - (1 - p) ** n;

/**
 * A made-up product with 20 problems that differ in how often a participant runs into them.
 * The mean detection rate is 0.31, the average Nielsen and Landauer (1993) reported across studies.
 */
export const PROBLEM_P = [0.8, 0.72, 0.65, 0.58, 0.52, 0.47, 0.41, 0.36, 0.32, 0.28, 0.24, 0.2, 0.17, 0.14, 0.11, 0.08, 0.06, 0.04, 0.03, 0.02];

export const meanP = (ps: number[]) => ps.reduce((a, b) => a + b, 0) / ps.length;

/** Expected share found by n users when problem i is found with probability ps[i]. */
export const foundShareMixed = (ps: number[], n: number) => ps.reduce((a, p) => a + foundShare(p, n), 0) / ps.length;

/** One simulated study: hits[u][i] says whether user u ran into problem i. Problems keep their order. */
export function simulateStudy(ps: number[], users: number, seed: number): boolean[][] {
  const r = rng(seed);
  return Array.from({ length: users }, () => ps.map((p) => r() < p));
}

/** Number of distinct problems found by the first n users of a study. */
export function distinctFound(hits: boolean[][], n: number): number {
  const m = hits[0]?.length ?? 0;
  let c = 0;
  for (let i = 0; i < m; i++) if (hits.slice(0, n).some((h) => h[i])) c++;
  return c;
}

/** Smallest n with expected share ≥ target. */
export function usersFor(ps: number[], target: number, max = 200): number {
  for (let n = 1; n <= max; n++) if (foundShareMixed(ps, n) >= target) return n;
  return Infinity;
}

/* ───────── 3. heuristic evaluation ───────── */

/** Nielsen's ten usability heuristics (1994), as short Korean names. */
export const HEURISTICS = [
  '시스템 상태를 보여 주기',
  '현실 세계의 말과 순서',
  '사용자의 통제와 자유',
  '일관성과 표준',
  '오류 예방',
  '기억하기보다 알아보기',
  '유연성과 효율',
  '미적이고 간결한 설계',
  '오류를 알아보고 고치게 돕기',
  '도움말과 문서',
];

export interface HProblem {
  name: string;
  /** Index into HEURISTICS. */
  h: number;
  /** True severity, 1..4. */
  severity: number;
  /** Chance one evaluator spots it. Severe problems are not always easier to spot. */
  p: number;
}

/** Problems in the same fictional library app, sorted by severity. */
export const H_PROBLEMS: HProblem[] = [
  { name: '연장 버튼을 두 번 누르면 기회를 잃음', h: 4, severity: 4, p: 0.35 },
  { name: '결제 화면에서 뒤로 가기가 안 됨', h: 2, severity: 4, p: 0.55 },
  { name: '연장해도 확인 메시지가 없음', h: 0, severity: 3, p: 0.6 },
  { name: '탭 아이콘에 이름표가 없음', h: 5, severity: 3, p: 0.7 },
  { name: '오류 메시지가 "E-301"뿐', h: 8, severity: 3, p: 0.5 },
  { name: '로그인이 30분마다 풀림', h: 6, severity: 3, p: 0.2 },
  { name: '같은 기능이 "대출"과 "빌리기"로 따로 불림', h: 3, severity: 2, p: 0.45 },
  { name: '회색 버튼이 비활성처럼 보임', h: 3, severity: 2, p: 0.4 },
  { name: '검색어를 지우는 버튼이 없음', h: 2, severity: 2, p: 0.3 },
  { name: '"ISBN"을 설명 없이 씀', h: 1, severity: 2, p: 0.25 },
  { name: '첫 화면이 광고성 배너로 가득함', h: 7, severity: 1, p: 0.65 },
  { name: '반납일 글씨가 너무 작음', h: 7, severity: 1, p: 0.3 },
  { name: '도움말이 PDF 파일 하나뿐', h: 9, severity: 1, p: 0.2 },
  { name: '날짜 형식이 화면마다 다름', h: 3, severity: 1, p: 0.15 },
];

/** found[e][i]: did evaluator e report problem i? */
export function simulateEvaluators(problems: HProblem[], evaluators: number, seed: number): boolean[][] {
  const r = rng(seed);
  return Array.from({ length: evaluators }, () => problems.map((pr) => r() < pr.p));
}

/* ───────── 4. System Usability Scale ───────── */

/** The ten SUS items (Brooke, 1996), in Korean. Odd items are positive, even items negative. */
export const SUS_ITEMS = [
  '이 앱을 자주 쓰고 싶다.',
  '이 앱은 쓸데없이 복잡하다.',
  '이 앱은 쓰기 쉽다.',
  '이 앱을 쓰려면 기술에 밝은 사람의 도움이 필요할 것 같다.',
  '이 앱의 여러 기능이 잘 어우러져 있다.',
  '이 앱에는 앞뒤가 맞지 않는 부분이 너무 많다.',
  '대부분의 사람이 이 앱을 금방 익힐 것 같다.',
  '이 앱은 쓰기가 매우 번거롭다.',
  '이 앱을 쓰면서 자신감이 들었다.',
  '이 앱을 쓰기 전에 배워야 할 것이 많았다.',
];

/** Item contributions: odd (positive) items give answer − 1, even (negative) items give 5 − answer. */
export const susContrib = (answers: number[]) => answers.map((a, i) => (i % 2 === 0 ? a - 1 : 5 - a));
/** SUS score 0..100: the sum of contributions (0..40) times 2.5. */
export const susScore = (answers: number[]) => susContrib(answers).reduce((s, c) => s + c, 0) * 2.5;

/** The participant of the session above, answering after the task. */
export const SUS_SAMPLE = [3, 3, 3, 2, 3, 4, 3, 3, 2, 2];
