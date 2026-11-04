import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'recursion', title: '쪼개서 풀기', en: 'Recursion', color: 'var(--c-cs-1)', blurb: '큰 문제를 같은 모양의 작은 문제로 나누어 푸는 법. 재귀, 백트래킹, 분할 정복.' },
  { id: 'optimize', title: '최선을 고르기', en: 'Optimization', color: 'var(--c-cs-2)', blurb: '가능한 답 중 가장 좋은 것을 빠르게 찾는 법. 동적 계획법과 탐욕 알고리즘.' },
  { id: 'graph', title: '그래프 응용', en: 'Graph Algorithms', color: 'var(--c-cs-3)', blurb: '연결과 순서가 있는 데이터에서 자주 만나는 문제. 최소 신장 트리와 위상 정렬.' },
];

const lessons: Lesson[] = [
  {
    id: 'recursion',
    part: 'recursion',
    title: '재귀와 백트래킹',
    en: 'Recursion & Backtracking',
    lede: '자기 자신을 부르는 함수는 처음엔 마술처럼 보이지만, 규칙은 두 가지뿐입니다. 더 작은 문제로 넘기고, 충분히 작아지면 멈추기. 여기에 "안 될 길은 일찍 포기하기"를 더하면 백트래킹이 됩니다.',
    learn: ['기저 사례와 재귀 호출', '호출 트리와 호출 스택', '백트래킹과 가지치기'],
    Component: lazy(() => import('./lessons/Recursion')),
  },
  {
    id: 'divide-conquer',
    part: 'recursion',
    title: '분할 정복',
    en: 'Divide & Conquer',
    lede: '문제를 반으로 나눠 각각 풀고 합치면, n번 걸릴 일이 log n번으로 줄어들기도 합니다. 병합 정렬과 빠른 거듭제곱, 그리고 "답을 이분 탐색하는" 기법을 봅니다.',
    learn: ['재귀 트리로 복잡도 읽기', '빠른 거듭제곱', '답을 이분 탐색하기'],
    Component: lazy(() => import('./lessons/DivideConquer')),
  },
  {
    id: 'dynamic-programming',
    part: 'optimize',
    title: '동적 계획법',
    en: 'Dynamic Programming',
    lede: '같은 계산을 두 번 하지 않도록 답을 표에 적어 두는 것만으로 지수 시간이 다항 시간이 됩니다. 편집 거리와 거스름돈 문제를 표를 채우며 풀고, 배낭 문제의 점화식도 세워 봅니다.',
    learn: ['겹치는 부분 문제와 메모이제이션', '상태와 점화식 세우기', '표를 채우고 거꾸로 답 찾기'],
    Component: lazy(() => import('./lessons/DynamicProgramming')),
  },
  {
    id: 'greedy',
    part: 'optimize',
    title: '탐욕 알고리즘',
    en: 'Greedy Algorithms',
    lede: '매 순간 당장 가장 좋아 보이는 것을 고르는 방법은 빠르고 단순합니다. 언제는 그것이 정답이고 언제는 틀리는지 직접 반례를 찾아봅니다.',
    learn: ['탐욕이 통하는 조건과 반례', '회의실 배정과 끝나는 시간', '허프만 부호화'],
    Component: lazy(() => import('./lessons/Greedy')),
  },
  {
    id: 'union-find-mst',
    part: 'graph',
    title: '유니온 파인드와 최소 신장 트리',
    en: 'Union-Find & Minimum Spanning Trees',
    lede: '"이 둘이 같은 그룹인가?"를 거의 상수 시간에 답하는 자료구조와, 그것으로 모든 점을 가장 싸게 잇는 크루스칼 알고리즘을 봅니다.',
    learn: ['유니온 파인드와 경로 압축', '크루스칼과 프림', '최소 신장 트리로 군집 나누기'],
    Component: lazy(() => import('./lessons/UnionFindMST')),
  },
  {
    id: 'topological-sort',
    part: 'graph',
    title: '위상 정렬',
    en: 'Topological Sort',
    lede: '패키지 설치, 빌드 파이프라인, 선수 과목처럼 "A를 하려면 B가 먼저"인 일들을 어떤 순서로 해야 할까요. 의존 관계 그래프에서 순서를 뽑고, 순환을 찾고, 전체 일정의 최소 기간을 계산합니다.',
    learn: ['방향 비순환 그래프(DAG)', '칸 알고리즘과 진입 차수', '순환 찾기와 임계 경로'],
    Component: lazy(() => import('./lessons/TopologicalSort')),
  },
];

const course: Course = {
  id: 'cs-algorithm-design',
  subject: 'cs',
  title: '알고리즘 설계',
  subtitle: '재귀에서 동적 계획법까지',
  level: 2,
  prerequisites: ['cs-algorithms', 'math-discrete'],
  blurb: '알고리즘을 읽는 데서 한 걸음 나아가 직접 설계하는 법을 배웁니다. 재귀와 분할 정복, 동적 계획법과 탐욕 알고리즘, 유니온 파인드와 위상 정렬까지 코딩 테스트와 실무에서 자주 만나는 풀이 전략을 다룹니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
