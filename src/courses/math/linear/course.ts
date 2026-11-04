import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'vectors', title: '벡터와 행렬', en: 'Vectors & Matrices', color: 'var(--c-math-1)', blurb: '화살표이자 숫자 목록인 벡터, 그리고 공간 전체를 움직이는 행렬.' },
  { id: 'systems', title: '방정식과 역행렬', en: 'Systems & Inverses', color: 'var(--c-math-2)', blurb: '미지수가 여럿인 방정식을 푸는 법과, 변환을 되돌릴 수 있는지 판단하는 법.' },
  { id: 'spectral', title: '고윳값과 분해', en: 'Eigenvalues & Decompositions', color: 'var(--c-math-3)', blurb: '변환이 방향을 지키는 축을 찾고, 행렬을 가장 중요한 조각으로 나누는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'vectors',
    part: 'vectors',
    title: '벡터와 선형결합',
    en: 'Vectors & Linear Combinations',
    lede: '벡터는 화살표이면서 숫자 목록입니다. 벡터를 늘이고 더해서 만들 수 있는 모든 점, 즉 생성 공간과 선형 독립을 그림으로 확인하고, 추천 시스템이 사용자를 벡터로 다루는 이유를 봅니다.',
    learn: ['벡터의 덧셈과 스칼라 곱', '선형결합과 생성 공간', '선형 독립과 기저'],
    Component: lazy(() => import('./lessons/Vectors')),
  },
  {
    id: 'matrices',
    part: 'vectors',
    title: '행렬과 선형변환',
    en: 'Matrices & Linear Transformations',
    lede: '행렬은 숫자 표가 아니라 공간을 늘이고, 돌리고, 기울이는 변환입니다. 격자를 끌어 변환을 만들고, 행렬 곱이 변환을 차례로 하는 것과 같다는 것을 봅니다.',
    learn: ['행렬이 기저 벡터를 옮기는 법', '회전, 늘이기, 밀기', '행렬 곱은 변환의 합성'],
    Component: lazy(() => import('./lessons/Matrices')),
  },
  {
    id: 'elimination',
    part: 'systems',
    title: '연립방정식과 가우스 소거',
    en: 'Linear Systems & Gaussian Elimination',
    lede: '미지수가 여럿인 방정식은 직선이나 평면이 만나는 점을 찾는 문제입니다. 해가 하나, 없음, 무수히 많음이 되는 경우를 그림으로 보고, 가우스 소거를 한 단계씩 따라갑니다.',
    learn: ['연립방정식을 행렬로 적기', '가우스 소거와 피벗', '해가 하나, 없음, 무수히 많음'],
    Component: lazy(() => import('./lessons/Elimination')),
  },
  {
    id: 'determinants',
    part: 'systems',
    title: '행렬식과 역행렬',
    en: 'Determinants & Inverses',
    lede: '행렬식은 변환이 넓이를 몇 배로 바꾸는지 알려 줍니다. 0이 되면 공간이 납작해져 되돌릴 수 없습니다. 넓이로 행렬식을 보고, 역행렬을 구하고, 계수와 영공간을 봅니다.',
    learn: ['행렬식은 넓이의 배율', '역행렬과 되돌리기', '계수와 영공간'],
    Component: lazy(() => import('./lessons/Determinants')),
  },
  {
    id: 'eigen',
    part: 'spectral',
    title: '고윳값과 고유벡터',
    en: 'Eigenvalues & Eigenvectors',
    lede: '변환을 해도 방향이 바뀌지 않는 벡터가 있습니다. 그 방향과 배율인 고유벡터와 고윳값을 찾고, 같은 변환을 여러 번 하면 어디로 가는지, 웹 페이지 순위가 고유벡터라는 것을 봅니다.',
    learn: ['고유벡터는 방향을 지킨다', '특성방정식으로 고윳값 구하기', '거듭제곱법과 대각화'],
    Component: lazy(() => import('./lessons/Eigen')),
  },
  {
    id: 'svd',
    part: 'spectral',
    title: '특잇값 분해와 PCA',
    en: 'SVD & PCA',
    lede: '모든 행렬은 돌리기, 늘이기, 돌리기로 나눌 수 있습니다. 특잇값 분해로 이미지를 압축하고, 주성분 분석으로 데이터가 가장 넓게 퍼진 방향을 찾습니다.',
    learn: ['돌리기, 늘이기, 돌리기', '낮은 계수 근사와 이미지 압축', '주성분 분석'],
    Component: lazy(() => import('./lessons/Svd')),
  },
];

const course: Course = {
  id: 'math-linear-algebra',
  subject: 'math',
  title: '선형대수',
  subtitle: '벡터에서 특잇값 분해까지',
  level: 1,
  blurb: '벡터와 행렬을 계산 도구이자 공간을 움직이는 변환으로 봅니다. 선형결합과 선형변환, 연립방정식과 가우스 소거, 행렬식과 역행렬, 고윳값, 특잇값 분해와 PCA까지 격자를 직접 끌어 보며 따라갑니다. 기초 인공지능의 수학 장을 더 깊이 이어 가는 과목입니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
