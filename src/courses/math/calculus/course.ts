import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'derivative', title: '미분', en: 'Derivatives', color: 'var(--c-math-1)', blurb: '한없이 가까워지는 값으로 순간의 변화율을 정의하고, 그것으로 가장 좋은 값을 찾는 법.' },
  { id: 'integral', title: '적분', en: 'Integrals', color: 'var(--c-math-2)', blurb: '잘게 쪼개 더한 넓이와 미분이 서로를 되돌린다는 사실, 그리고 그 계산법.' },
  { id: 'series', title: '무한히 더하기', en: 'Infinite Sums', color: 'var(--c-math-3)', blurb: '끝없이 더해도 유한한 값이 되는 경우와, 함수를 다항식으로 흉내 내는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'limits',
    part: 'derivative',
    title: '극한과 연속',
    en: 'Limits & Continuity',
    lede: '0으로 나눌 수는 없지만 0에 한없이 가까운 수로는 나눌 수 있습니다. 함수값이 어떤 값에 다가간다는 말을 오차 ε와 거리 δ의 게임으로 정확히 정하고, 끊김 없이 이어진다는 것이 무슨 뜻인지 봅니다.',
    learn: ['극한의 직관과 ε-δ 정의', '한쪽 극한과 극한이 없는 경우', '연속과 중간값 정리'],
    Component: lazy(() => import('./lessons/Limits')),
  },
  {
    id: 'derivatives',
    part: 'derivative',
    title: '미분',
    en: 'Derivatives',
    lede: '두 점을 잇는 할선의 기울기는 두 점이 하나로 겹치는 순간 접선의 기울기가 됩니다. 그 극한으로 미분을 정의하고, 곱, 몫, 합성 함수의 미분 규칙이 어디서 나오는지 그림으로 확인합니다.',
    learn: ['할선에서 접선으로: 미분의 정의', '곱의 법칙, 몫의 법칙, 연쇄 법칙', '지수, 로그, 삼각 함수의 미분'],
    Component: lazy(() => import('./lessons/Derivatives')),
  },
  {
    id: 'applications',
    part: 'derivative',
    title: '미분의 응용',
    en: 'Applications of Derivatives',
    lede: '기울기가 0인 곳에 꼭대기와 바닥이 있습니다. 상자를 가장 크게 접는 최적화 문제를 풀고, 평균값 정리의 뜻을 보고, 접선을 따라 근을 찾아가는 뉴턴 방법을 한 단계씩 돌려 봅니다.',
    learn: ['극대, 극소, 최적화', '평균값 정리', '선형 근사와 뉴턴 방법'],
    Component: lazy(() => import('./lessons/Applications')),
  },
  {
    id: 'integrals',
    part: 'integral',
    title: '적분과 미적분의 기본 정리',
    en: 'Integrals & the Fundamental Theorem',
    lede: '곡선 아래 넓이를 직사각형으로 쪼개 더하고, 조각을 한없이 가늘게 하면 정적분이 됩니다. 넓이를 재는 일과 기울기를 재는 일이 서로를 되돌린다는 미적분의 기본 정리를 그림으로 확인합니다.',
    learn: ['리만 합과 정적분', '부정적분과 원시함수', '미적분의 기본 정리'],
    Component: lazy(() => import('./lessons/Integrals')),
  },
  {
    id: 'integration-techniques',
    part: 'integral',
    title: '적분의 기법과 응용',
    en: 'Techniques & Applications of Integration',
    lede: '모든 적분이 공식 한 줄로 풀리지는 않습니다. 치환적분과 부분적분이 어떤 미분 규칙을 거꾸로 쓴 것인지 보고, 회전체의 부피, 곡선의 길이, 확률 밀도처럼 적분으로 재는 것들을 계산합니다.',
    learn: ['치환적분과 부분적분', '넓이, 부피, 곡선의 길이', '이상적분'],
    Component: lazy(() => import('./lessons/Techniques')),
  },
  {
    id: 'series',
    part: 'series',
    title: '수열, 급수, 테일러 급수',
    en: 'Sequences, Series & Taylor Series',
    lede: '1/2 + 1/4 + 1/8 + …은 1이 되지만 1 + 1/2 + 1/3 + …은 한없이 커집니다. 급수가 수렴하는지 판정하는 법을 보고, 사인과 지수 함수를 다항식으로 흉내 내는 테일러 급수가 차수를 올릴수록 함수를 따라가는 모습을 봅니다.',
    learn: ['수열의 극한과 급수의 수렴', '비교, 비율 판정과 조화급수', '테일러 급수와 근사 오차'],
    Component: lazy(() => import('./lessons/Series')),
  },
];

const course: Course = {
  id: 'math-calculus',
  subject: 'math',
  title: '미적분학',
  subtitle: '극한에서 테일러 급수까지',
  level: 1,
  blurb: '변화와 누적을 다루는 수학입니다. 극한, 미분, 최적화, 적분과 미적분의 기본 정리, 적분의 기법, 급수와 테일러 급수를 할선을 끌고 직사각형을 쪼개 보며 따라갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
