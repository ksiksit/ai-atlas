import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'measure', title: '사람을 재다', en: 'Measuring People', color: 'var(--c-cs-4)', blurb: '사람이 보고, 고르고, 손을 뻗는 데 걸리는 시간에도 법칙이 있습니다. 여러분의 손으로 직접 잽니다.' },
  { id: 'design', title: '설계하기', en: 'Designing', color: 'var(--c-cs-2)', blurb: '쓰는 사람이 헤매지 않고, 실수해도 되돌릴 수 있고, 누구나 쓸 수 있는 인터페이스를 만드는 원칙.' },
  { id: 'evaluate', title: '평가하기', en: 'Evaluating', color: 'var(--c-cs-3)', blurb: '설계가 정말 나아졌는지 사람을 관찰하고 실험해서 확인하는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'reaction-time',
    part: 'measure',
    title: '지각과 반응 시간',
    en: 'Perception & Reaction Time',
    lede: '버튼이 둘일 때와 여덟일 때, 무엇을 누를지 정하는 데 걸리는 시간은 얼마나 다를까요? 여러분의 반응 시간을 직접 재서 힉의 법칙을 확인하고, 사람의 주의와 기억이 인터페이스에 거는 한계를 봅니다.',
    learn: ['단순 반응 시간과 선택 반응 시간', '힉의 법칙과 정보량', '주의, 작업 기억, 인지 부하'],
    Component: lazy(() => import('./lessons/ReactionTime')),
  },
  {
    id: 'fitts',
    part: 'measure',
    title: '피츠의 법칙',
    en: 'Fitts’s Law',
    lede: '멀고 작은 버튼일수록 누르기 어렵습니다. 얼마나 어려운지를 수 하나로 나타내는 피츠의 법칙을, 여러분이 직접 누른 기록에 직선을 맞춰 확인하고, 화면 가장자리와 메뉴 설계에 적용합니다.',
    learn: ['난이도 지수 ID = log₂(D/W + 1)', '회귀로 a, b 구하기', '가장자리, 터치 크기, 원형 메뉴'],
    Component: lazy(() => import('./lessons/Fitts')),
  },
  {
    id: 'design-principles',
    part: 'design',
    title: '인터페이스 설계 원칙',
    en: 'Design Principles',
    lede: '문을 밀어야 하는지 당겨야 하는지 헷갈린다면 문이 잘못 만들어진 것입니다. 어포던스, 피드백, 대응 관계, 실수 막기와 되돌리기를 고장 난 인터페이스를 직접 고치며 배우고, 사용자를 속이는 다크 패턴을 알아봅니다.',
    learn: ['어포던스와 기표', '피드백과 대응 관계', '실수 막기, 되돌리기, 다크 패턴'],
    Component: lazy(() => import('./lessons/DesignPrinciples')),
  },
  {
    id: 'accessibility',
    part: 'design',
    title: '접근성',
    en: 'Accessibility',
    lede: '화면을 보지 못하거나, 마우스를 쓰지 못하거나, 색을 구별하지 못하는 사람도 같은 서비스를 씁니다. 색 대비를 계산하고, 키보드만으로 페이지를 다녀 보고, 스크린 리더가 읽는 트리를 들여다봅니다.',
    learn: ['명도 대비와 WCAG 기준', '키보드 초점과 탭 순서', '스크린 리더와 접근성 트리'],
    Component: lazy(() => import('./lessons/Accessibility')),
  },
  {
    id: 'usability-testing',
    part: 'evaluate',
    title: '사용성 평가',
    en: 'Usability Testing',
    lede: '설계자는 자기 인터페이스의 문제를 보지 못합니다. 사용자 몇 명을 관찰해야 문제 대부분을 찾는지 확률로 따져 보고, 과제 기반 관찰과 휴리스틱 평가를 시뮬레이션으로 해 봅니다.',
    learn: ['과제 기반 관찰과 소리 내어 생각하기', '사용자 수와 찾아낸 문제 수', '휴리스틱 평가와 심각도'],
    Component: lazy(() => import('./lessons/Usability')),
  },
  {
    id: 'ab-testing',
    part: 'evaluate',
    title: 'A/B 테스트',
    en: 'A/B Testing',
    lede: '버튼 색을 바꿨더니 클릭이 늘었다면, 정말 색 때문일까요? 사용자를 무작위로 나눠 비교하는 A/B 테스트에서 필요한 표본 수를 계산하고, 결과를 미리 들여다보면 생기는 착각을 시뮬레이션으로 확인합니다.',
    learn: ['무작위 배정과 전환율 비교', '검정력과 필요한 표본 수', '미리 들여다보기와 여러 번 비교하기의 함정'],
    Component: lazy(() => import('./lessons/ABTesting')),
  },
];

const course: Course = {
  id: 'cs-hci',
  subject: 'cs',
  title: '사람과 컴퓨터의 상호작용',
  subtitle: '반응 시간에서 A/B 테스트까지',
  level: 2,
  prerequisites: ['cs-programming'],
  blurb: '인터페이스를 쓰는 사람을 측정하고, 설계하고, 평가합니다. 여러분의 클릭과 반응 시간을 브라우저에서 직접 재서 법칙을 확인하고, 접근성과 사용성 평가, A/B 테스트까지 다룹니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
