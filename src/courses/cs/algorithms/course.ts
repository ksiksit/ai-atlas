import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'analysis', title: '효율 재기', en: 'Analysis', color: 'var(--c-cs-1)', blurb: '알고리즘이 얼마나 빠른지를 입력 크기에 대한 함수로 재는 법. Big-O.' },
  { id: 'sort-search', title: '정렬과 탐색', en: 'Sorting & Searching', color: 'var(--c-cs-2)', blurb: '데이터를 줄 세우고, 그 안에서 원하는 것을 빨리 찾는 법.' },
  { id: 'graph', title: '그래프', en: 'Graphs', color: 'var(--c-cs-3)', blurb: '지도, 친구 관계, 웹 페이지처럼 연결된 데이터를 탐색하는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'complexity',
    part: 'analysis',
    title: '복잡도와 Big-O',
    en: 'Complexity & Big-O',
    lede: '같은 문제를 푸는 두 프로그램이 데이터 1000개에서는 비슷해도 100만 개에서는 1초와 하루로 갈릴 수 있습니다. 그 차이를 미리 읽는 언어가 Big-O입니다.',
    learn: ['연산 횟수로 속도 재기', 'O(1)부터 O(2ⁿ)까지', '입력을 2배로 늘리면 시간은?'],
    Component: lazy(() => import('./lessons/Complexity')),
  },
  {
    id: 'sorting',
    part: 'sort-search',
    title: '정렬',
    en: 'Sorting',
    lede: '정렬은 가장 많이 쓰이고 가장 많이 연구된 알고리즘입니다. 네 가지 방법을 한 단계씩 따라가고, 같은 데이터에서 경주시켜 봅니다.',
    learn: ['선택·삽입·병합·퀵 정렬', '입력 모양에 따른 최선과 최악', 'O(n²)와 O(n log n)의 차이'],
    Component: lazy(() => import('./lessons/Sorting')),
  },
  {
    id: 'search-hash',
    part: 'sort-search',
    title: '탐색과 해시 테이블',
    en: 'Searching & Hash Tables',
    lede: '100만 개 중 하나를 찾는 데 100만 번을 볼 수도, 20번만 볼 수도, 한 번에 찾을 수도 있습니다. 이진 탐색과 해시 테이블이 그 비결입니다.',
    learn: ['선형 탐색과 이진 탐색', '해시 함수와 충돌', '적재율과 성능'],
    Component: lazy(() => import('./lessons/SearchHash')),
  },
  {
    id: 'graph-search',
    part: 'graph',
    title: '그래프 탐색',
    en: 'Graph Search',
    lede: '길 찾기, 추천, 패키지 의존성 해결은 모두 그래프 탐색입니다. 큐와 스택 하나의 차이가 BFS와 DFS를 가르고, 가중치를 더하면 다익스트라가 됩니다.',
    learn: ['그래프와 인접 리스트', 'BFS와 DFS: 큐와 스택', '다익스트라와 A*'],
    Component: lazy(() => import('./lessons/GraphSearch')),
  },
];

const course: Course = {
  id: 'cs-algorithms',
  subject: 'cs',
  title: '기초 알고리즘',
  subtitle: 'Big-O에서 길 찾기까지',
  level: 1,
  blurb: '입문 개발자를 위한 알고리즘 첫걸음. 복잡도를 읽는 법에서 시작해 정렬, 이진 탐색과 해시 테이블, 그래프 탐색까지 코드와 그림으로 따라갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
