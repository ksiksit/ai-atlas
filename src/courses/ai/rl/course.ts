import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'trial', title: '시행착오로 배우기', en: 'Learning by Trial', color: 'var(--c-math)', blurb: '정답을 알려 주는 사람 없이, 해 보고 받은 보상만으로 더 나은 선택을 찾는 법.' },
  { id: 'value', title: '가치를 배우기', en: 'Learning Values', color: 'var(--c-ml)', blurb: '각 상태와 행동이 앞으로 얼마나 좋은 결과로 이어지는지 계산하고, 경험으로 추정하는 법.' },
  { id: 'policy', title: '정책을 배우기', en: 'Learning Policies', color: 'var(--c-dl)', blurb: '행동하는 규칙 자체를 기울기로 고치는 법, 그리고 무엇을 보상할지 정하는 일의 어려움.' },
];

const lessons: Lesson[] = [
  {
    id: 'bandits',
    part: 'trial',
    title: '멀티암드 밴딧',
    en: 'Multi-Armed Bandits',
    lede: '당첨 확률을 모르는 슬롯머신 여러 대 앞에서, 지금까지 제일 좋았던 기계만 당길지 다른 기계도 더 시험해 볼지 정해야 합니다. 탐험과 활용의 맞바꿈을 ε-탐욕, UCB, 톰슨 샘플링으로 직접 겨뤄 봅니다.',
    learn: ['탐험과 활용의 맞바꿈', 'ε-탐욕과 UCB', '후회(regret)와 톰슨 샘플링'],
    Component: lazy(() => import('./lessons/Bandits')),
  },
  {
    id: 'mdp',
    part: 'trial',
    title: '마르코프 결정 과정',
    en: 'Markov Decision Processes',
    lede: '행동이 보상뿐 아니라 다음 상황까지 바꾸면 문제가 길어집니다. 상태, 행동, 전이 확률, 보상, 할인율로 문제를 적는 법과, 미래 보상을 더한 가치가 무엇인지 격자 세계에서 봅니다.',
    learn: ['상태, 행동, 전이, 보상', '할인된 보상의 합과 할인율', '정책과 가치 함수, 벨만 방정식'],
    Component: lazy(() => import('./lessons/Mdp')),
  },
  {
    id: 'dynamic-programming',
    part: 'value',
    title: '가치 반복과 정책 반복',
    en: 'Value & Policy Iteration',
    lede: '세상의 규칙(전이 확률과 보상)을 다 안다면, 벨만 방정식을 반복해서 풀어 최적의 행동을 계산할 수 있습니다. 가치가 격자 위로 퍼져 나가는 모습을 한 번씩 따라가고, 두 방법이 얼마나 빨리 수렴하는지 비교합니다.',
    learn: ['벨만 최적 방정식', '가치 반복과 수렴', '정책 평가와 정책 개선'],
    Component: lazy(() => import('./lessons/DynamicProgramming')),
  },
  {
    id: 'q-learning',
    part: 'value',
    title: 'Q-러닝과 시간차 학습',
    en: 'Q-Learning & TD Learning',
    lede: '규칙을 모르면 직접 움직여 보며 배워야 합니다. 한 걸음 뒤의 추정으로 지금 추정을 고치는 시간차 학습과 Q-러닝으로 에이전트가 격자 세계를 배우는 과정을 보고, 낭떠러지 옆에서 SARSA와 다르게 행동하는 이유를 봅니다.',
    learn: ['몬테카를로와 시간차 학습', 'Q-러닝과 학습률', 'SARSA와 비정책 학습'],
    Component: lazy(() => import('./lessons/QLearning')),
  },
  {
    id: 'policy-gradient',
    part: 'policy',
    title: '정책 경사',
    en: 'Policy Gradients',
    lede: '가치를 거치지 않고, 좋은 결과를 낸 행동의 확률을 직접 올릴 수도 있습니다. REINFORCE 알고리즘의 기울기가 어디서 나오는지 보고, 기준선이 분산을 얼마나 줄이는지 같은 문제를 여러 번 학습시켜 확인합니다.',
    learn: ['확률적 정책과 소프트맥스', 'REINFORCE와 로그 확률의 기울기', '기준선, 분산, 액터-크리틱'],
    Component: lazy(() => import('./lessons/PolicyGradient')),
  },
  {
    id: 'reward-design',
    part: 'policy',
    title: '보상 설계와 보상 해킹',
    en: 'Reward Design & Reward Hacking',
    lede: '에이전트는 우리가 바란 것이 아니라 우리가 보상한 것을 최적화합니다. 보상을 조금 잘못 정하면 엉뚱한 지름길을 찾는 모습을 직접 만들어 보고, 보상 다듬기와 사람의 피드백으로 배우는 방법, 그 한계를 봅니다.',
    learn: ['희소한 보상과 보상 다듬기', '보상 해킹과 명세 게임', '사람의 선호로 배우는 보상'],
    Component: lazy(() => import('./lessons/RewardDesign')),
  },
];

const course: Course = {
  id: 'ai-reinforcement-learning',
  subject: 'ai',
  title: '강화학습',
  subtitle: '슬롯머신에서 보상 해킹까지',
  level: 2,
  prerequisites: ['ai-basics', 'math-probability'],
  blurb: '정답 없이 보상만 보고 행동을 배우는 방법을 다룹니다. 밴딧, 마르코프 결정 과정, 가치 반복, Q-러닝, 정책 경사, 보상 설계를 브라우저 안에서 에이전트를 직접 학습시키며 따라갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
