import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'single', title: '한 변수의 변화', en: 'One Changing Quantity', color: 'var(--c-math-1)', blurb: '변화의 규칙에서 미래의 값을 계산하는 법. 기울기장, 지수적 성장과 감쇠, 진동과 공명.' },
  { id: 'systems', title: '연립계와 혼돈', en: 'Systems & Chaos', color: 'var(--c-math-2)', blurb: '여러 양이 서로를 바꾸는 계를 위상 평면에서 보고, 안정성과 혼돈을 읽는 법.' },
  { id: 'tools', title: '푸는 도구', en: 'Tools for Solving', color: 'var(--c-math-3)', blurb: '미분방정식을 대수 문제로 바꾸는 변환과, 공식이 없을 때 컴퓨터로 푸는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'first-order',
    part: 'single',
    title: '1계 미분방정식',
    en: 'First-Order Equations',
    lede: '"변화율이 지금 양에 비례한다"는 한 문장이 인구, 방사성 붕괴, 커피가 식는 속도를 모두 설명합니다. 기울기장 위에 해 곡선을 그려 보고, 변수 분리와 적분 인자로 풀고, 로지스틱 성장이 왜 S자를 그리는지 봅니다.',
    learn: ['기울기장과 해 곡선', '변수 분리와 선형 1계 방정식', '지수 성장, 로지스틱, 평형점'],
    Component: lazy(() => import('./lessons/FirstOrder')),
  },
  {
    id: 'oscillations',
    part: 'single',
    title: '선형 2계 방정식과 진동',
    en: 'Second-Order Equations & Oscillation',
    lede: '용수철에 매달린 추는 위치의 2계 미분방정식을 따릅니다. 특성방정식의 근이 실수인지 복소수인지에 따라 과감쇠, 임계 감쇠, 진동이 갈리는 것을 보고, 외부에서 밀어 주는 힘의 주기가 맞을 때 생기는 공명을 직접 일으켜 봅니다.',
    learn: ['특성방정식과 세 가지 감쇠', '강제 진동과 공명', '전기 회로와의 대응'],
    Component: lazy(() => import('./lessons/Oscillations')),
  },
  {
    id: 'linear-systems',
    part: 'systems',
    title: '연립 선형 방정식과 위상 평면',
    en: 'Linear Systems & the Phase Plane',
    lede: '두 양이 서로의 변화를 정하는 계 x′ = Ax의 해는 행렬 A의 고윳값과 고유벡터가 정합니다. 위상 평면에 궤적을 그리며 안장점, 마디, 나선, 중심을 구별하고, 대각합과 행렬식 두 수로 안정성을 판정합니다.',
    learn: ['x′ = Ax와 행렬 지수', '고윳값으로 읽는 평형점의 종류', '대각합-행렬식 평면'],
    Component: lazy(() => import('./lessons/LinearSystems')),
  },
  {
    id: 'nonlinear-chaos',
    part: 'systems',
    title: '비선형계와 혼돈',
    en: 'Nonlinear Systems & Chaos',
    lede: '여우와 토끼의 수는 서로를 따라 오르내립니다. 비선형계를 평형점 근처에서 선형으로 근사하는 법, 극한 순환, 그리고 처음 값이 아주 조금만 달라도 결과가 완전히 달라지는 로렌츠 계의 혼돈을 봅니다.',
    learn: ['로트카-볼테라 방정식과 보존량', '평형점 근처의 선형화와 극한 순환', '로렌츠 계와 초깃값 민감성'],
    Component: lazy(() => import('./lessons/NonlinearChaos')),
  },
  {
    id: 'lorenz-walk',
    part: 'systems',
    title: '로렌츠 끌개 안에 서기',
    en: 'Inside the Lorenz Attractor',
    lede: '두 평형점이 놓인 유리 바닥에 서서 발밑에 점 구름을 풀어 놓습니다. 구름이 실처럼 늘어나며 끌개에 감기는 것과, 출발 자리에 따라 갈라지는 빠르기가 몇십 배 다른 것을 보고, 궤적이 바닥을 뚫은 자리로 푸앵카레 단면을 만듭니다.',
    learn: ['점 구름으로 보는 초깃값 민감성', '발산과 부피 수축, 늘이기와 접기', '푸앵카레 단면과 평형점의 안정성'],
    Component: lazy(() => import('./lessons/LorenzWalk')),
  },
  {
    id: 'laplace',
    part: 'tools',
    title: '라플라스 변환',
    en: 'The Laplace Transform',
    lede: '라플라스 변환은 미분을 곱셈으로, 미분방정식을 분수식으로 바꿉니다. 계단 입력과 충격 입력에 대한 응답을 구하고, 전달 함수의 극점 위치만 보고 계가 진동할지, 안정할지 읽어 냅니다.',
    learn: ['변환의 정의와 표', '계단 함수, 충격, 합성곱', '전달 함수와 극점'],
    Component: lazy(() => import('./lessons/Laplace')),
  },
  {
    id: 'numerical-ode',
    part: 'tools',
    title: '수치적으로 풀기',
    en: 'Solving Numerically',
    lede: '대부분의 미분방정식은 공식으로 풀리지 않습니다. 기울기를 따라 한 걸음씩 가는 오일러 방법이 왜 궤도에서 벗어나는지 보고, 룽게-쿠타 방법과 보폭 조절, 그리고 걸음을 크게 하면 터지는 뻣뻣한 방정식을 봅니다.',
    learn: ['오일러 방법과 오차의 차수', '룽게-쿠타 방법', '안정성과 뻣뻣한 방정식'],
    Component: lazy(() => import('./lessons/NumericalOde')),
  },
];

const course: Course = {
  id: 'math-differential-equations',
  subject: 'math',
  title: '미분방정식',
  subtitle: '기울기장에서 혼돈까지',
  level: 2,
  prerequisites: ['math-calculus', 'math-linear-algebra'],
  blurb: '변화의 규칙에서 미래를 계산합니다. 1계 방정식과 기울기장, 진동과 공명, 위상 평면과 고윳값, 비선형계와 혼돈, 라플라스 변환, 수치 해법을 시뮬레이션을 돌려 보며 따라갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
