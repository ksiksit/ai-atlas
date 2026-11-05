import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'reals', title: '실수와 수열', en: 'Reals & Sequences', color: 'var(--c-math-1)', blurb: '미적분학이 당연하게 쓰던 실수의 성질을 공리로 세우고, 수렴을 엄밀하게 정의하는 법.' },
  { id: 'functions', title: '함수', en: 'Functions', color: 'var(--c-math-2)', blurb: '연속, 미분, 함수의 극한을 정의대로 다루고, 조건을 하나 빼면 정리가 어떻게 무너지는지 보는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'real-numbers',
    part: 'reals',
    title: '실수와 완비성',
    en: 'The Real Numbers & Completeness',
    lede: '유리수만으로는 √2가 들어갈 자리가 비어 있습니다. 위로 유계인 집합에는 언제나 가장 작은 상계가 있다는 완비성 공리가 이 구멍을 메우는 방법이고, 해석학의 모든 정리가 여기에 기댑니다.',
    learn: ['유리수의 구멍', '상한, 하한과 완비성 공리', '아르키메데스 성질과 조밀성'],
    Component: lazy(() => import('./lessons/RealNumbers')),
  },
  {
    id: 'sequences',
    part: 'reals',
    title: '수열의 수렴',
    en: 'Convergence of Sequences',
    lede: '"한없이 가까워진다"를 오차 ε를 주면 그 뒤로는 모두 ε 안에 드는 번호 N이 있다는 게임으로 정의합니다. 단조 수렴 정리, 볼차노-바이어슈트라스 정리, 코시 수열이 완비성에서 어떻게 나오는지 따라갑니다.',
    learn: ['ε-N 정의와 극한의 성질', '단조 수렴 정리와 볼차노-바이어슈트라스 정리', '코시 수열'],
    Component: lazy(() => import('./lessons/Sequences')),
  },
  {
    id: 'series',
    part: 'reals',
    title: '급수',
    en: 'Series',
    lede: '무한히 더한 값은 부분합 수열의 극한입니다. 수렴 판정법을 증명하고, 절대 수렴과 조건 수렴의 차이를 보고, 조건 수렴하는 급수는 순서만 바꿔도 원하는 아무 값이나 될 수 있다는 리만 재배열 정리를 직접 해 봅니다.',
    learn: ['부분합과 코시 판정', '비교, 비율, 근 판정의 증명', '절대 수렴과 리만 재배열 정리'],
    Component: lazy(() => import('./lessons/Series')),
  },
  {
    id: 'continuity',
    part: 'functions',
    title: '연속 함수',
    en: 'Continuous Functions',
    lede: '연속을 ε-δ로, 그리고 수열로 정의하고 두 정의가 같음을 봅니다. 닫힌 구간에서 연속인 함수는 중간값을 모두 지나고 최댓값과 최솟값을 가진다는 정리, 그리고 균등 연속이 무엇인지 반례와 함께 따라갑니다.',
    learn: ['ε-δ 연속과 수열 연속', '중간값 정리와 최대·최소 정리의 증명', '균등 연속'],
    Component: lazy(() => import('./lessons/Continuity')),
  },
  {
    id: 'differentiability',
    part: 'functions',
    title: '미분과 평균값 정리',
    en: 'Differentiability & the Mean Value Theorem',
    lede: '미분 가능하면 연속이지만 그 반대는 아닙니다. 어디서도 미분할 수 없는 연속 함수를 그려 보고, 롤의 정리에서 평균값 정리와 테일러 정리의 나머지 항까지, 조건을 하나씩 빼며 정리가 어디서 깨지는지 봅니다.',
    learn: ['미분 가능성과 연속성', '롤의 정리와 평균값 정리', '테일러 정리와 나머지 항'],
    Component: lazy(() => import('./lessons/Differentiability')),
  },
  {
    id: 'uniform-convergence',
    part: 'functions',
    title: '함수열과 균등 수렴',
    en: 'Sequences of Functions & Uniform Convergence',
    lede: '연속 함수들의 극한이 연속이 아닐 수도 있습니다. 점마다 수렴하는 것과 한꺼번에 수렴하는 것의 차이를 ε 띠로 보고, 극한과 적분, 극한과 미분의 순서를 바꿔도 되는 조건과 멱급수가 왜 그 조건을 만족하는지 봅니다.',
    learn: ['점별 수렴과 균등 수렴', '균등 수렴과 연속성, 적분', '바이어슈트라스 M-판정과 멱급수'],
    Component: lazy(() => import('./lessons/UniformConvergence')),
  },
];

const course: Course = {
  id: 'math-analysis',
  subject: 'math',
  title: '해석학',
  subtitle: '실수에서 균등 수렴까지',
  level: 3,
  prerequisites: ['math-calculus', 'math-discrete'],
  blurb: '미적분학에서 당연히 쓰던 것을 증명합니다. 실수의 완비성에서 출발해 수열과 급수의 수렴, 연속, 미분, 함수열의 균등 수렴을 엄밀하게 세우고, 조건을 하나씩 빼 보며 정리가 왜 그 조건을 필요로 하는지 확인합니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
