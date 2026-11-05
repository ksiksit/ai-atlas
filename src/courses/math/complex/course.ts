import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'functions', title: '복소 평면의 함수', en: 'Functions on the Complex Plane', color: 'var(--c-math-1)', blurb: '평면 전체를 움직이는 복소 함수를 색으로 보고, 미분할 수 있다는 조건이 얼마나 강한지 보는 법.' },
  { id: 'integrals', title: '복소 적분', en: 'Complex Integration', color: 'var(--c-math-2)', blurb: '경로를 따라 적분하면 경로의 모양은 사라지고 안에 든 특이점만 남는다는 사실과, 그것으로 실적분과 신호를 다루는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'complex-numbers',
    part: 'functions',
    title: '복소수와 복소 함수',
    en: 'Complex Numbers & Functions',
    lede: '복소수를 곱하는 것은 평면을 돌리고 늘리는 일입니다. 극형식과 오일러 공식을 보고, 입력도 출력도 평면인 복소 함수를 정의역 색칠로 한눈에 그려 영점과 극을 찾습니다.',
    learn: ['복소수의 곱과 극형식', '오일러 공식과 단위근', '정의역 색칠로 보는 복소 함수'],
    Component: lazy(() => import('./lessons/ComplexNumbers')),
  },
  {
    id: 'holomorphic',
    part: 'functions',
    title: '정칙 함수와 코시-리만 방정식',
    en: 'Holomorphic Functions & Cauchy–Riemann',
    lede: '복소수로 미분할 수 있으려면 어느 방향에서 다가가도 같은 극한이 나와야 합니다. 이 조건이 코시-리만 방정식이 되고, 그런 함수는 작은 곳에서 각도를 보존하는 등각 사상이 된다는 것을 격자를 휘어 보며 확인합니다.',
    learn: ['복소 미분과 코시-리만 방정식', '등각 사상', '조화 함수와 흐름'],
    Component: lazy(() => import('./lessons/Holomorphic')),
  },
  {
    id: 'power-series',
    part: 'functions',
    title: '멱급수와 로랑 급수',
    en: 'Power & Laurent Series',
    lede: '실수 함수 1/(1+x²)의 테일러 급수가 왜 |x| < 1에서만 수렴하는지는 복소 평면을 봐야 알 수 있습니다. 수렴 원판과 가장 가까운 특이점, 음의 거듭제곱까지 쓰는 로랑 급수, 그리고 특이점의 세 가지 종류를 봅니다.',
    learn: ['수렴 반지름과 가장 가까운 특이점', '로랑 급수와 고리 영역', '제거 가능, 극, 진성 특이점'],
    Component: lazy(() => import('./lessons/PowerSeries')),
  },
  {
    id: 'contour-integrals',
    part: 'integrals',
    title: '복소 적분과 코시 정리',
    en: 'Contour Integrals & Cauchy’s Theorem',
    lede: '복소 평면에서 경로를 따라 적분하면, 정칙 함수의 닫힌 경로 적분은 언제나 0입니다. 경로를 끌어 모양을 바꿔도 값이 그대로인 것을 보고, 코시 적분 공식이 경계의 값만으로 안쪽의 값을 모두 정한다는 것을 확인합니다.',
    learn: ['경로 적분과 1/z의 적분', '코시 정리와 경로의 변형', '코시 적분 공식과 최대 절댓값 원리'],
    Component: lazy(() => import('./lessons/ContourIntegrals')),
  },
  {
    id: 'residues',
    part: 'integrals',
    title: '유수 정리',
    en: 'The Residue Theorem',
    lede: '닫힌 경로의 적분은 안에 든 특이점들의 유수를 더한 값의 2πi배입니다. 경로를 움직여 특이점이 들어오고 나갈 때 적분값이 계단처럼 바뀌는 것을 보고, 실수만으로는 풀기 어려운 실적분을 유수로 계산합니다.',
    learn: ['유수와 그 계산', '유수 정리와 감김 수', '실적분 계산과 편각 원리'],
    Component: lazy(() => import('./lessons/Residues')),
  },
  {
    id: 'applications',
    part: 'integrals',
    title: '응용: 신호와 흐름',
    en: 'Applications: Signals & Flows',
    lede: '소리와 이미지를 주파수로 나누는 푸리에 변환, 물체 둘레를 도는 유체의 흐름, 전기장과 열의 분포는 모두 복소해석으로 계산합니다. 원을 날개 모양으로 바꾸는 주코프스키 변환과 이산 푸리에 변환을 직접 돌려 봅니다.',
    learn: ['푸리에 급수와 이산 푸리에 변환', '등각 사상으로 푸는 흐름과 주코프스키 날개', '라플라스 방정식과 경계값 문제'],
    Component: lazy(() => import('./lessons/Applications')),
  },
];

const course: Course = {
  id: 'math-complex-analysis',
  subject: 'math',
  title: '복소해석',
  subtitle: '정의역 색칠에서 유수 정리까지',
  level: 3,
  prerequisites: ['math-multivariable', 'math-analysis'],
  blurb: '복소수 평면에서 미분 가능한 함수가 얼마나 단단한 성질을 갖는지 봅니다. 정의역 색칠, 코시-리만 방정식과 등각 사상, 멱급수와 로랑 급수, 코시 정리, 유수 정리, 그리고 신호와 흐름에의 응용을 그림을 움직이며 따라갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
