import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'describe', title: '데이터 읽기', en: 'Descriptive Statistics', color: 'var(--c-stats-1)', blurb: '숫자 더미를 몇 개의 숫자와 그림으로 요약합니다. 가운데는 어디이고, 얼마나 흩어져 있는가.' },
  { id: 'infer', title: '추론', en: 'Inference', color: 'var(--c-stats-2)', blurb: '일부만 보고 전체에 대해 말하는 법. 표본에서 출발해 신뢰구간과 가설검정까지 갑니다.' },
];

const lessons: Lesson[] = [
  {
    id: 'summary',
    part: 'describe',
    title: '데이터 요약하기',
    en: 'Summarizing Data',
    lede: '숫자 수백 개를 한눈에 읽을 수는 없습니다. 평균과 중앙값으로 가운데를, 분산과 표준편차로 퍼짐을 재고, 히스토그램으로 모양을 봅니다.',
    learn: ['평균과 중앙값의 차이', '분산과 표준편차', '히스토그램과 상자그림'],
    Component: lazy(() => import('./lessons/Summary')),
  },
  {
    id: 'clt',
    part: 'infer',
    title: '표본과 중심극한정리',
    en: 'Sampling & the CLT',
    lede: '전체를 다 조사할 수 없으니 일부를 뽑아 봅니다. 표본평균은 뽑을 때마다 달라지지만, 그 흔들림에는 놀랍도록 정확한 규칙이 있습니다.',
    learn: ['모집단과 표본', '표본평균의 분포', '표준오차 σ/√n'],
    Component: lazy(() => import('./lessons/CLT')),
  },
  {
    id: 'confidence-interval',
    part: 'infer',
    title: '신뢰구간',
    en: 'Confidence Intervals',
    lede: '"평균은 7.1시간"보다 "6.8에서 7.4시간 사이"가 더 정직한 답입니다. 구간 100개를 직접 뽑아 보며 95%라는 숫자의 진짜 뜻을 확인합니다.',
    learn: ['점추정과 구간추정', '신뢰수준 95%의 뜻', '구간의 폭을 정하는 것'],
    Component: lazy(() => import('./lessons/ConfidenceInterval')),
  },
  {
    id: 'hypothesis-testing',
    part: 'infer',
    title: '가설검정과 p값',
    en: 'Hypothesis Testing',
    lede: '동전을 100번 던져 앞면이 60번 나왔다면 이 동전은 조작된 걸까요? 우연이라고 가정했을 때 이런 결과가 얼마나 드문지를 재는 것이 p값입니다.',
    learn: ['귀무가설과 p값', '유의수준과 거짓 양성', '1종·2종 오류와 검정력'],
    Component: lazy(() => import('./lessons/HypothesisTesting')),
  },
];

const course: Course = {
  id: 'stats-basics',
  subject: 'stats',
  title: '기초 통계학',
  subtitle: '평균에서 p값까지',
  level: 1,
  aliases: ['stats'],
  blurb: '평균과 표준편차로 데이터를 요약하는 법에서 시작해, 표본 하나로 전체를 추정하는 신뢰구간과 우연과 차이를 가려내는 가설검정까지 갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
