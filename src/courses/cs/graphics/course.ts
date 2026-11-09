import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'draw', title: '화면에 그리기', en: 'Drawing on Screen', color: 'var(--c-cs-1)', blurb: '삼각형을 픽셀로 바꾸고, 3차원 장면을 카메라로 찍어 2차원 화면에 옮기는 법.' },
  { id: 'surface', title: '빛과 표면', en: 'Light & Surfaces', color: 'var(--c-cs-2)', blurb: '빛이 표면에 닿아 눈으로 들어오는 양을 계산하고, 표면에 그림을 입히는 법.' },
  { id: 'real', title: '사실적으로', en: 'Toward Realism', color: 'var(--c-cs-3)', blurb: '빛줄기를 거꾸로 따라가 반사와 그림자를 만들고, 곡선과 시간으로 움직임을 만드는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'rasterization',
    part: 'draw',
    title: '래스터화와 깊이 버퍼',
    en: 'Rasterization & the Depth Buffer',
    lede: '화면은 작은 칸(픽셀)의 격자입니다. 꼭짓점 세 개로 정한 삼각형이 어떤 픽셀을 덮는지 판정하고, 무게중심 좌표로 색을 섞고, 깊이 버퍼로 앞에 있는 면만 남기는 과정을 한 픽셀씩 따라갑니다.',
    learn: ['픽셀 격자와 삼각형 덮기 판정', '무게중심 좌표와 보간', '깊이 버퍼로 가리기'],
    Component: lazy(() => import('./lessons/Rasterization')),
  },
  {
    id: 'transforms',
    part: 'draw',
    title: '변환과 카메라',
    en: 'Transforms & Cameras',
    lede: '물체를 옮기고, 돌리고, 카메라 앞에 세워 원근을 주는 일은 모두 4×4 행렬 곱셈입니다. 동차 좌표가 왜 필요한지 보고, 모델·뷰·투영 행렬을 하나씩 바꿔 가며 화면이 어떻게 달라지는지 봅니다.',
    learn: ['동차 좌표와 이동', '모델, 뷰, 투영 행렬', '원근 나눗셈과 시야각'],
    Component: lazy(() => import('./lessons/Transforms')),
  },
  {
    id: 'inside-camera',
    part: 'draw',
    title: '카메라 안으로 들어가기',
    en: 'Stepping Inside the Camera',
    lede: '장면 속을 걸어 다니며 카메라를 직접 세우고, 시야 사각뿔과 그 카메라가 찍은 사진을 함께 봅니다. 세상 전체가 카메라 앞으로 옮겨지는 뷰 변환과, 사각뿔이 정육면체로 눌리는 투영을 장면 안에서 지켜봅니다.',
    learn: ['시야 사각뿔과 near, far', '뷰 변환은 세상을 옮긴다', '투영 뒤의 NDC 상자와 깊이 분포'],
    Component: lazy(() => import('./lessons/CameraWalk')),
  },
  {
    id: 'shading',
    part: 'surface',
    title: '빛과 셰이딩',
    en: 'Light & Shading',
    lede: '같은 공도 빛을 받는 방향에 따라 밝기가 달라 둥글게 보입니다. 법선 벡터와 내적으로 밝기를 계산하는 퐁 반사 모델의 세 항을 하나씩 켜고 끄며, 면 단위와 픽셀 단위 셰이딩의 차이를 봅니다.',
    learn: ['법선 벡터와 램버트 반사', '퐁 모델: 주변광, 난반사, 정반사', '플랫, 구로, 퐁 셰이딩'],
    Component: lazy(() => import('./lessons/Shading')),
  },
  {
    id: 'textures',
    part: 'surface',
    title: '텍스처와 샘플링',
    en: 'Textures & Sampling',
    lede: '벽돌 벽을 삼각형으로 일일이 만드는 대신 벽돌 사진을 입힙니다. 텍스처 좌표로 그림을 읽는 법과, 멀리 있는 무늬가 지글거리는 앨리어싱, 그것을 막는 이중선형 보간과 밉맵을 봅니다.',
    learn: ['텍스처 좌표와 원근 보정', '앨리어싱과 나이퀴스트 한계', '이중선형 보간과 밉맵'],
    Component: lazy(() => import('./lessons/Textures')),
  },
  {
    id: 'ray-tracing',
    part: 'real',
    title: '레이 트레이싱',
    en: 'Ray Tracing',
    lede: '눈에서 픽셀마다 빛줄기를 쏘아 무엇에 맞는지 거꾸로 따라가면 그림자와 반사가 저절로 생깁니다. 광선과 구의 교차를 계산하고, 반사 횟수를 늘려 보고, 경계 상자 계층으로 교차 검사를 줄입니다.',
    learn: ['광선과 물체의 교차', '그림자 광선과 반사', '경계 상자 계층(BVH)'],
    Component: lazy(() => import('./lessons/RayTracing')),
  },
  {
    id: 'curves-animation',
    part: 'real',
    title: '곡선과 애니메이션',
    en: 'Curves & Animation',
    lede: '글꼴의 윤곽, 펜 도구, 화면 전환의 움직임은 모두 몇 개의 조절점으로 정한 곡선입니다. 베지어 곡선을 드카스텔조 알고리즘으로 그려 보고, 키프레임 사이를 보간하는 이징과, 합성 이미지에 따르는 책임을 봅니다.',
    learn: ['베지어 곡선과 드카스텔조 알고리즘', '키프레임 보간과 이징', '합성 이미지와 책임'],
    Component: lazy(() => import('./lessons/Curves')),
  },
];

const course: Course = {
  id: 'cs-graphics',
  subject: 'cs',
  title: '컴퓨터 그래픽스',
  subtitle: '삼각형에서 레이 트레이싱까지',
  level: 2,
  prerequisites: ['cs-programming', 'math-linear-algebra'],
  blurb: '라이브러리 없이 픽셀을 하나씩 칠하는 작은 렌더러를 과목 내내 키워 갑니다. 래스터화, 변환과 카메라, 셰이딩, 텍스처, 레이 트레이싱, 곡선과 애니메이션을 다룹니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
