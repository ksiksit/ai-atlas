import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'error', title: '오차', en: 'Error', color: 'var(--c-math-1)', blurb: '컴퓨터가 실수를 유한한 비트로 담을 때 생기는 오차와, 그 오차가 계산을 거치며 자라는 방식.' },
  { id: 'approx', title: '방정식과 근사', en: 'Equations & Approximation', color: 'var(--c-math-2)', blurb: '방정식의 근을 찾고, 점 몇 개로 함수를 흉내 내고, 넓이를 재는 알고리즘과 그 수렴 속도.' },
  { id: 'matrices', title: '행렬과 최적화', en: 'Matrices & Optimization', color: 'var(--c-math-3)', blurb: '큰 연립방정식을 빠르고 안정하게 풀고, 함수의 가장 낮은 곳을 찾아가는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'floating-point',
    part: 'error',
    title: '부동소수점과 오차',
    en: 'Floating Point & Error',
    lede: '0.1을 열 번 더해도 정확히 1이 되지 않습니다. 배정밀도 수가 실수를 어떻게 담는지 보고, 비슷한 두 수를 뺄 때 유효숫자가 사라지는 상쇄, 더하는 순서에 따라 달라지는 합, 그리고 오차를 줄이는 카한 합을 직접 계산해 봅니다.',
    learn: ['기계 엡실론과 반올림 오차', '상쇄와 수식 바꿔 쓰기', '조건수와 안정한 알고리즘'],
    Component: lazy(() => import('./lessons/FloatingPoint')),
  },
  {
    id: 'root-finding',
    part: 'approx',
    title: '방정식의 근',
    en: 'Root Finding',
    lede: 'f(x) = 0의 근을 찾는 이분법, 뉴턴 방법, 할선법을 같은 문제에 나란히 돌려, 맞는 자릿수가 한 걸음마다 얼마나 늘어나는지 잽니다. 수렴 차수가 1, 1.618, 2라는 것이 무슨 뜻인지, 그리고 빠른 방법이 실패하는 경우를 봅니다.',
    learn: ['이분법과 선형 수렴', '뉴턴 방법과 2차 수렴', '할선법과 고정점 반복'],
    Component: lazy(() => import('./lessons/RootFinding')),
  },
  {
    id: 'interpolation',
    part: 'approx',
    title: '보간과 근사',
    en: 'Interpolation & Approximation',
    lede: '점 n개를 지나는 다항식은 하나뿐이지만, 점을 늘린다고 늘 더 좋아지지는 않습니다. 균등한 점에서 다항식이 양 끝에서 요동치는 룽게 현상을 보고, 체비쇼프 점과 스플라인이 그 문제를 어떻게 피하는지 비교합니다.',
    learn: ['라그랑주 보간과 뉴턴 차분', '룽게 현상과 체비쇼프 점', '3차 스플라인과 최소제곱 근사'],
    Component: lazy(() => import('./lessons/Interpolation')),
  },
  {
    id: 'quadrature',
    part: 'approx',
    title: '수치 적분',
    en: 'Numerical Integration',
    lede: '사다리꼴, 심프슨, 가우스 구적법은 같은 수의 점으로 얼마나 정확하게 넓이를 잴 수 있는지에서 차이가 납니다. 점을 두 배로 늘릴 때마다 오차가 몇 분의 일로 주는지 재 보고, 어려운 곳에만 점을 모으는 적응적 적분을 돌려 봅니다.',
    learn: ['사다리꼴과 심프슨 공식의 오차', '가우스 구적법', '리처드슨 외삽과 적응적 적분'],
    Component: lazy(() => import('./lessons/Quadrature')),
  },
  {
    id: 'linear-systems',
    part: 'matrices',
    title: '연립방정식과 조건수',
    en: 'Linear Systems & Conditioning',
    lede: '가우스 소거는 LU 분해로 정리하면 같은 행렬로 여러 번 풀 때 빨라집니다. 피벗을 고르지 않으면 작은 수로 나누다 답이 망가지는 모습과, 입력을 조금만 바꿔도 답이 크게 흔들리는 나쁜 조건의 행렬, 그리고 반복법을 봅니다.',
    learn: ['LU 분해와 계산량', '부분 피벗과 안정성', '조건수와 반복법'],
    Component: lazy(() => import('./lessons/LinearSystems')),
  },
  {
    id: 'optimization',
    part: 'matrices',
    title: '최적화',
    en: 'Optimization',
    lede: '함수의 가장 낮은 곳을 찾는 방법은 기계 학습의 학습 그 자체입니다. 경사하강법이 좁은 골짜기에서 지그재그로 느려지는 이유, 운동량과 뉴턴 방법이 그것을 고치는 방식, 그리고 제약이 있을 때의 최적화를 비교합니다.',
    learn: ['경사하강법과 수렴 속도', '운동량, 뉴턴 방법, 준뉴턴 방법', '선 탐색과 제약 최적화'],
    Component: lazy(() => import('./lessons/Optimization')),
  },
];

const course: Course = {
  id: 'math-numerical-analysis',
  subject: 'math',
  title: '수치해석',
  subtitle: '부동소수점에서 최적화까지',
  level: 2,
  prerequisites: ['math-calculus', 'cs-programming'],
  blurb: '컴퓨터로 수학을 계산할 때의 알고리즘과 그 오차를 다룹니다. 부동소수점, 근 찾기, 보간, 수치 적분, 연립방정식, 최적화를 직접 돌려 보며 얼마나 빨리, 얼마나 정확하게 답에 다가가는지 잽니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
