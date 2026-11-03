import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'storage', title: '저장 구조', en: 'Storage', color: 'var(--c-cs-1)', blurb: '메모리와 디스크에 데이터를 담는 방식이 속도를 정한다. 동적 배열과 B-트리.' },
  { id: 'saving', title: '아끼는 기술', en: 'Saving Time & Space', color: 'var(--c-cs-2)', blurb: '조금 덜 정확하거나 조금 덜 담는 대신 훨씬 빠르게. 캐시와 확률적 자료구조.' },
  { id: 'distributed', title: '분산과 협업', en: 'Distribution & Collaboration', color: 'var(--c-cs-3)', blurb: '여러 서버에 데이터를 나누고, 여러 사람이 고친 파일을 비교하는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'amortized',
    part: 'storage',
    title: '동적 배열과 분할 상환 분석',
    en: 'Dynamic Arrays & Amortized Analysis',
    lede: '배열 끝에 계속 push하다 보면 가끔 전체를 새 공간으로 복사해야 합니다. 그런데도 push 한 번은 평균 O(1)입니다. 가끔 비싼 연산을 공정하게 세는 법을 배웁니다.',
    learn: ['용량을 두 배씩 늘리는 이유', '분할 상환 분석', '늘리는 비율과 메모리의 맞바꿈'],
    Component: lazy(() => import('./lessons/Amortized')),
  },
  {
    id: 'b-tree',
    part: 'storage',
    title: 'B-트리와 데이터베이스 인덱스',
    en: 'B-Trees & Database Indexes',
    lede: '디스크에서 한 번 읽는 데는 메모리보다 수백 배에서 수십만 배 오래 걸립니다. 그래서 데이터베이스는 한 노드에 키를 수백 개씩 담아 트리를 3~4층으로 낮춘 B-트리를 씁니다.',
    learn: ['디스크 읽기 횟수가 곧 비용', 'B-트리의 삽입과 분할', '인덱스가 쿼리를 빠르게 하는 원리'],
    Component: lazy(() => import('./lessons/BTree')),
  },
  {
    id: 'lru-cache',
    part: 'saving',
    title: 'LRU 캐시',
    en: 'LRU Cache',
    lede: '자주 쓰는 데이터를 가까이 두면 빨라지지만 캐시는 늘 작습니다. 무엇을 버릴지 정하는 규칙들을 비교하고, 해시 맵과 이중 연결 리스트로 모든 연산이 O(1)인 LRU 캐시를 만듭니다.',
    learn: ['적중률과 지역성', '해시 맵 + 이중 연결 리스트', 'LRU, FIFO, LFU 비교'],
    Component: lazy(() => import('./lessons/LruCache')),
  },
  {
    id: 'probabilistic',
    part: 'saving',
    title: '블룸 필터와 HyperLogLog',
    en: 'Bloom Filters & HyperLogLog',
    lede: '조금 틀려도 괜찮다면 메모리를 수천 배 아낄 수 있습니다. "없다"는 확실하게 말해 주는 블룸 필터와, 수십억 개의 서로 다른 값을 몇 KB로 세는 HyperLogLog를 봅니다.',
    learn: ['거짓 양성은 있어도 거짓 음성은 없다', '비트 수와 해시 개수 고르기', '고유한 값의 개수 어림하기'],
    Component: lazy(() => import('./lessons/Probabilistic')),
  },
  {
    id: 'consistent-hashing',
    part: 'distributed',
    title: '일관된 해싱',
    en: 'Consistent Hashing',
    lede: '캐시 서버를 한 대 늘렸을 뿐인데 거의 모든 키가 자리를 옮긴다면 데이터베이스로 요청이 쏟아집니다. 키와 서버를 같은 원 위에 놓는 일관된 해싱은 꼭 옮겨야 할 키만 옮깁니다.',
    learn: ['나머지 해싱의 문제', '해시 링과 가상 노드', '부하 분산과 이동량'],
    Component: lazy(() => import('./lessons/ConsistentHashing')),
  },
  {
    id: 'diff',
    part: 'distributed',
    title: 'diff: 바뀐 줄 찾기',
    en: 'Diff',
    lede: 'git diff는 두 파일에서 바뀐 줄을 어떻게 찾을까요? 가장 긴 공통 부분 수열과 편집 그래프의 최단 경로로 diff를 계산하고, 마이어스 알고리즘이 빠른 이유를 봅니다.',
    learn: ['diff와 가장 긴 공통 부분 수열', 'unified 형식 읽기', '편집 그래프와 마이어스 알고리즘'],
    Component: lazy(() => import('./lessons/Diff')),
  },
];

const course: Course = {
  id: 'cs-system-algorithms',
  subject: 'cs',
  title: '시스템 속 알고리즘',
  subtitle: '동적 배열에서 git diff까지',
  level: 3,
  prerequisites: ['cs-algorithm-design'],
  blurb: '매일 쓰는 언어, 데이터베이스, 캐시, Git 안에서 알고리즘이 어떻게 쓰이는지 봅니다. 분할 상환 분석, B-트리, LRU 캐시, 블룸 필터와 HyperLogLog, 일관된 해싱, diff를 실제 시스템의 맞바꿈과 함께 다룹니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
