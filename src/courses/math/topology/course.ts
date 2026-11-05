import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'open-sets', title: '열린 집합과 연속', en: 'Open Sets & Continuity', color: 'var(--c-math-1)', blurb: '거리를 잊고도 가깝다는 것을 말하는 법. 열린 집합으로 연속, 연결, 콤팩트를 다시 정의합니다.' },
  { id: 'shape', title: '모양을 세다', en: 'Counting Shape', color: 'var(--c-math-3)', blurb: '늘이고 구부려도 변하지 않는 수로 곡면을 분류하고, 구멍을 고리로 세는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'metric-spaces',
    part: 'open-sets',
    title: '거리 공간과 열린 집합',
    en: 'Metric Spaces & Open Sets',
    lede: '"가깝다"를 재는 방법은 하나가 아닙니다. 직선 거리, 맨해튼 거리, 최대 거리에서 공이 어떤 모양인지 보고, 거리가 달라도 같은 열린 집합을 주는 경우와, 열린 집합과 닫힌 집합, 경계와 폐포를 정의합니다.',
    learn: ['거리의 공리와 여러 가지 거리', '열린 공, 열린 집합, 닫힌 집합', '내부, 폐포, 경계'],
    Component: lazy(() => import('./lessons/MetricSpaces')),
  },
  {
    id: 'topological-spaces',
    part: 'open-sets',
    title: '위상 공간과 연속',
    en: 'Topological Spaces & Continuity',
    lede: '거리를 버리고 "어떤 집합들이 열려 있는가"만 남기면 위상 공간이 됩니다. 연속 함수를 "열린 집합의 역상이 열려 있다"로 정의하고, 커피잔과 도넛이 같은 모양이라는 위상 동형이 무엇인지 고무판처럼 변형하며 봅니다.',
    learn: ['위상의 공리와 유한 위상 공간', '역상으로 정의하는 연속', '위상 동형과 위상 불변량'],
    Component: lazy(() => import('./lessons/TopologicalSpaces')),
  },
  {
    id: 'connectedness',
    part: 'open-sets',
    title: '연결성',
    en: 'Connectedness',
    lede: '두 조각으로 나눌 수 없는 공간을 연결되어 있다고 합니다. 중간값 정리가 사실은 연결성에 관한 정리임을 보고, 연결되어 있지만 길로는 이을 수 없는 위상수학자의 사인 곡선을 확대해 봅니다.',
    learn: ['연결 공간과 연결 성분', '연속 함수와 연결성, 중간값 정리', '경로 연결과 위상수학자의 사인 곡선'],
    Component: lazy(() => import('./lessons/Connectedness')),
  },
  {
    id: 'compactness',
    part: 'open-sets',
    title: '콤팩트성',
    en: 'Compactness',
    lede: '어떤 열린 덮개에서도 유한 개를 골라 다 덮을 수 있는 공간을 콤팩트하다고 합니다. 열린 구간에서는 왜 그게 안 되는지 덮개를 직접 골라 보고, 하이네-보렐 정리와 최대·최소 정리가 콤팩트성에서 나오는 길을 따라갑니다.',
    learn: ['열린 덮개와 유한 부분 덮개', '하이네-보렐 정리', '콤팩트성과 연속 함수, 최대·최소 정리'],
    Component: lazy(() => import('./lessons/Compactness')),
  },
  {
    id: 'surfaces',
    part: 'shape',
    title: '곡면의 분류',
    en: 'Classification of Surfaces',
    lede: '정사각형의 변을 붙이는 방법만 바꿔도 원기둥, 토러스, 뫼비우스 띠, 클라인 병이 나옵니다. 꼭짓점, 모서리, 면을 세는 오일러 지표와 방향성만으로 모든 닫힌 곡면을 분류하는 정리를 봅니다.',
    learn: ['변을 붙여 만드는 곡면', '오일러 지표 V − E + F', '방향성과 곡면 분류 정리'],
    Component: lazy(() => import('./lessons/Surfaces')),
  },
  {
    id: 'fundamental-group',
    part: 'shape',
    title: '기본군과 구멍',
    en: 'The Fundamental Group',
    lede: '고리를 공간 안에서 줄여 한 점으로 만들 수 있는지는 구멍이 있는지에 달려 있습니다. 고리를 이어 붙이는 연산으로 군을 만들고, 원의 기본군이 정수이고 감김 수가 그 정수라는 것, 그리고 그것으로 브라우어 고정점 정리를 증명합니다.',
    learn: ['호모토피와 고리 줄이기', '기본군과 감김 수', '원의 기본군과 브라우어 고정점 정리'],
    Component: lazy(() => import('./lessons/FundamentalGroup')),
  },
];

const course: Course = {
  id: 'math-topology',
  subject: 'math',
  title: '위상수학',
  subtitle: '열린 집합에서 기본군까지',
  level: 3,
  prerequisites: ['math-analysis'],
  blurb: '거리와 각도를 잊고도 남는 모양의 성질을 다룹니다. 거리 공간과 열린 집합, 위상 공간과 연속, 연결성과 콤팩트성, 곡면의 분류와 오일러 지표, 기본군을 고무판처럼 늘이고 붙여 보며 따라갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
