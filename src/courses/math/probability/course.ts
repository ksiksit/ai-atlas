import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'basics', title: '확률의 기초', en: 'Foundations', color: 'var(--c-math-1)', blurb: '가능한 결과를 세고, 새 정보를 얻었을 때 확률을 고치는 법.' },
  { id: 'distributions', title: '분포와 수렴', en: 'Distributions & Limits', color: 'var(--c-math-2)', blurb: '무작위 값의 모양과, 많이 모으면 평균이 어디로 가는지.' },
  { id: 'computing', title: '무작위를 쓰는 계산', en: 'Randomness in Computing', color: 'var(--c-math-3)', blurb: '동전을 던지는 알고리즘이 왜 빠르고 믿을 만한지, 그리고 상태를 옮겨 다니는 무작위 과정.' },
];

const lessons: Lesson[] = [
  {
    id: 'probability',
    part: 'basics',
    title: '확률과 조건부 확률',
    en: 'Probability & Conditional Probability',
    lede: '침입 탐지 시스템이 공격의 95%를 잡아내도, 경보가 울렸을 때 실제로 공격일 확률은 25%가 안 될 수 있습니다. 표본 공간과 사건, 조건부 확률과 독립, 베이즈 정리를 몬티 홀 문제와 스팸 필터로 따라갑니다.',
    learn: ['표본 공간과 사건', '조건부 확률과 독립', '베이즈 정리'],
    Component: lazy(() => import('./lessons/Probability')),
  },
  {
    id: 'random-variables',
    part: 'basics',
    title: '확률변수와 기댓값',
    en: 'Random Variables & Expectation',
    lede: '주사위를 던져 나오는 수, 해시 충돌의 개수, 알고리즘의 실행 시간은 모두 확률변수입니다. 기댓값과 분산을 구하고, 복잡한 문제를 쉽게 만드는 기댓값의 선형성을 봅니다.',
    learn: ['확률변수와 분포', '기댓값과 기댓값의 선형성', '분산과 표준편차'],
    Component: lazy(() => import('./lessons/RandomVariables')),
  },
  {
    id: 'distributions',
    part: 'distributions',
    title: '자주 쓰는 분포',
    en: 'Common Distributions',
    lede: '동전을 n번 던질 때, 처음 앞면이 나올 때까지, 한 시간에 요청이 몇 번 오는가. 이항, 기하, 포아송, 균등, 지수, 정규 분포가 어떤 상황에서 나타나는지 시뮬레이션으로 확인합니다.',
    learn: ['베르누이와 이항 분포', '기하 분포와 포아송 분포', '연속 분포: 균등, 지수, 정규'],
    Component: lazy(() => import('./lessons/Distributions')),
  },
  {
    id: 'limits',
    part: 'distributions',
    title: '대수의 법칙과 꼬리 부등식',
    en: 'Laws of Large Numbers & Tail Bounds',
    lede: '동전을 많이 던질수록 앞면 비율은 1/2에 가까워집니다. 얼마나 가까워지는지, 평균에서 크게 벗어날 확률이 얼마나 작은지를 마르코프, 체비쇼프, 체르노프 부등식으로 잽니다.',
    learn: ['대수의 법칙', '마르코프와 체비쇼프 부등식', '체르노프 경계와 표본 크기'],
    Component: lazy(() => import('./lessons/Limits')),
  },
  {
    id: 'randomized',
    part: 'computing',
    title: '무작위 알고리즘과 해싱 분석',
    en: 'Randomized Algorithms & Hashing',
    lede: '무작위로 피벗을 고르는 퀵 정렬은 어떤 입력에도 평균 O(n log n)입니다. 무작위 알고리즘의 기대 실행 시간, 해시 테이블의 충돌 수, 몬테카를로와 라스베이거스 알고리즘을 분석합니다.',
    learn: ['무작위 퀵 정렬의 기대 비교 횟수', '해시 충돌과 공 던지기', '몬테카를로와 라스베이거스'],
    Component: lazy(() => import('./lessons/Randomized')),
  },
  {
    id: 'markov',
    part: 'computing',
    title: '마르코프 체인과 페이지랭크',
    en: 'Markov Chains & PageRank',
    lede: '다음 상태가 지금 상태에만 달려 있는 무작위 과정은 날씨, 텍스트 생성, 웹 검색을 설명합니다. 전이 행렬을 따라 걸어 보고, 오래 걸으면 머무는 비율이 정해지는 정상 분포와 페이지랭크를 봅니다.',
    learn: ['상태와 전이 확률', '랜덤 워크와 정상 분포', '페이지랭크'],
    Component: lazy(() => import('./lessons/Markov')),
  },
];

const course: Course = {
  id: 'math-probability',
  subject: 'math',
  title: '확률과 컴퓨팅',
  subtitle: '조건부 확률에서 마르코프 체인까지',
  level: 2,
  prerequisites: ['math-discrete'],
  blurb: '컴퓨터과학자를 위한 확률입니다. 조건부 확률과 베이즈 정리, 확률변수와 기댓값, 자주 쓰는 분포, 대수의 법칙과 꼬리 부등식을 다루고, 무작위를 쓰는 알고리즘과 해싱, 마르코프 체인과 페이지랭크를 직접 시뮬레이션하며 분석합니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
