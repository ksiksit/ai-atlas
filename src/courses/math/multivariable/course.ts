import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'differential', title: '여러 변수의 미분', en: 'Differentiating in Many Variables', color: 'var(--c-math-1)', blurb: '곡면 위에서 가장 가파른 방향을 찾고, 좌표를 바꿀 때 무엇이 얼마나 늘어나는지 재는 법.' },
  { id: 'integral', title: '여러 변수의 적분', en: 'Integrating in Many Variables', color: 'var(--c-math-2)', blurb: '넓이와 부피를 겹겹이 쌓아 계산하고, 좌표계를 바꿔 적분을 쉽게 만드는 법.' },
  { id: 'fields', title: '벡터장', en: 'Vector Fields', color: 'var(--c-math-3)', blurb: '공간의 모든 점에 화살표가 붙은 흐름을 따라 일과 유량을 재고, 경계만 보고 안쪽을 아는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'partial-derivatives',
    part: 'differential',
    title: '편미분과 경사',
    en: 'Partial Derivatives & the Gradient',
    lede: '산의 지형처럼 두 변수의 함수는 곡면이 됩니다. 한 방향으로만 움직일 때의 기울기인 편미분, 모든 방향의 기울기를 담은 경사 벡터, 그리고 경사가 늘 등고선에 수직인 이유를 봅니다.',
    learn: ['곡면과 등고선', '편미분과 방향 도함수', '경사 벡터와 접평면'],
    Component: lazy(() => import('./lessons/Partials')),
  },
  {
    id: 'chain-rule-jacobian',
    part: 'differential',
    title: '연쇄 법칙과 야코비 행렬',
    en: 'The Chain Rule & the Jacobian',
    lede: '변수가 여럿이면 미분은 수 하나가 아니라 행렬이 됩니다. 좌표 변환이 작은 정사각형을 얼마나 늘이고 비트는지 야코비 행렬로 보고, 여러 단계를 거친 함수의 미분이 행렬 곱이 되는 연쇄 법칙을 확인합니다.',
    learn: ['다변수 연쇄 법칙', '야코비 행렬과 선형 근사', '야코비 행렬식: 넓이가 늘어나는 비율'],
    Component: lazy(() => import('./lessons/Jacobian')),
  },
  {
    id: 'optimization',
    part: 'differential',
    title: '극값과 라그랑주 승수',
    en: 'Extrema & Lagrange Multipliers',
    lede: '곡면의 꼭대기, 바닥, 그리고 말안장 모양의 점을 헤세 행렬로 구별합니다. 원 위에서처럼 제약이 있을 때의 최댓값은 등고선과 제약 곡선이 맞닿는 곳에 있다는 라그랑주 승수법을 그림으로 봅니다.',
    learn: ['임계점과 헤세 행렬', '안장점', '라그랑주 승수법'],
    Component: lazy(() => import('./lessons/Optimization')),
  },
  {
    id: 'multiple-integrals',
    part: 'integral',
    title: '다중 적분',
    en: 'Multiple Integrals',
    lede: '곡면 아래 부피를 작은 기둥으로 쪼개 더하면 이중적분이 됩니다. 적분 순서를 바꾸는 법과, 원이나 구처럼 둥근 영역에서는 극좌표와 구면 좌표가 왜 계산을 쉽게 만드는지 봅니다.',
    learn: ['이중적분과 반복적분', '적분 순서 바꾸기', '극좌표, 원기둥 좌표, 구면 좌표'],
    Component: lazy(() => import('./lessons/MultipleIntegrals')),
  },
  {
    id: 'line-integrals',
    part: 'fields',
    title: '벡터장과 선적분',
    en: 'Vector Fields & Line Integrals',
    lede: '바람이나 물의 흐름처럼 점마다 화살표가 붙은 것을 벡터장이라고 합니다. 길을 따라 벡터장이 하는 일을 선적분으로 재고, 어떤 길로 가도 일이 같은 보존장과 퍼텐셜 함수를 봅니다.',
    learn: ['벡터장과 흐름선', '선적분과 일', '보존장과 퍼텐셜'],
    Component: lazy(() => import('./lessons/LineIntegrals')),
  },
  {
    id: 'vector-theorems',
    part: 'fields',
    title: '그린, 스토크스, 발산 정리',
    en: 'Green, Stokes & Divergence Theorems',
    lede: '영역 안에서 소용돌이와 샘물을 모두 더하면, 경계를 따라 흐르는 양이나 경계를 빠져나가는 양과 같습니다. 회전과 발산을 작은 바람개비와 상자로 보고, 경계만 보고 안을 아는 세 정리를 확인합니다.',
    learn: ['회전과 발산', '그린 정리', '스토크스 정리와 발산 정리'],
    Component: lazy(() => import('./lessons/VectorTheorems')),
  },
];

const course: Course = {
  id: 'math-multivariable',
  subject: 'math',
  title: '다변수 미적분',
  subtitle: '편미분에서 발산 정리까지',
  level: 2,
  prerequisites: ['math-calculus', 'math-linear-algebra'],
  blurb: '여러 변수의 함수를 곡면과 벡터장으로 보고 미분하고 적분합니다. 편미분과 경사, 야코비 행렬, 극값과 라그랑주 승수, 다중 적분, 선적분, 그린·스토크스·발산 정리를 곡면을 돌려 보며 따라갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
