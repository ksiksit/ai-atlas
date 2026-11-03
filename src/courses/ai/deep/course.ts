import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'training', title: '깊게 쌓아도 학습되게', en: 'Training Deep Networks', color: 'var(--c-math)', blurb: '층이 수십 개여도 신호와 기울기가 살아남고, 외우지 않고 일반화하도록 만드는 기술.' },
  { id: 'sequence', title: '순서가 있는 데이터', en: 'Sequences', color: 'var(--c-ml)', blurb: '문장과 시계열처럼 순서가 의미를 갖는 데이터. 순환 신경망에서 트랜스포머까지.' },
  { id: 'generative', title: '생성 모델', en: 'Generative Models', color: 'var(--c-dl)', blurb: '분류를 넘어 새 데이터를 만드는 모델. 오토인코더, VAE, 확산 모델.' },
];

const lessons: Lesson[] = [
  {
    id: 'init-norm',
    part: 'training',
    title: '초기화와 정규화',
    en: 'Initialization & Normalization',
    lede: '층을 깊게 쌓으면 신호가 층마다 조금씩 줄거나 커져서 금세 0이 되거나 폭발합니다. 가중치를 처음에 어떤 크기로 놓을지, 층 사이에서 값을 어떻게 다시 맞출지가 깊은 신경망 학습의 출발점입니다.',
    learn: ['층을 지날수록 사라지거나 폭발하는 신호', 'Xavier와 He 초기화', '배치 정규화, 층 정규화, 잔차 연결'],
    Component: lazy(() => import('./lessons/InitNorm')),
  },
  {
    id: 'regularization',
    part: 'training',
    title: '규제와 학습률 스케줄',
    en: 'Regularization & Learning-Rate Schedules',
    lede: '모델이 훈련 데이터를 외워 버리지 않게 하는 드롭아웃과 가중치 감쇠, 그리고 학습 내내 보폭을 바꿔 가는 학습률 스케줄을 직접 켜고 끄며 비교합니다.',
    learn: ['드롭아웃과 가중치 감쇠', '조기 종료와 데이터 증강', '워밍업과 코사인 스케줄'],
    Component: lazy(() => import('./lessons/Regularization')),
  },
  {
    id: 'rnn',
    part: 'sequence',
    title: '순환 신경망과 LSTM',
    en: 'RNNs & LSTMs',
    lede: '순환 신경망은 같은 가중치를 시간마다 되풀이해 쓰며 지난 정보를 은닉 상태에 담아 둡니다. 그런데 먼 과거의 정보는 왜 잊힐까요? LSTM의 게이트가 그 문제를 어떻게 풀었는지 봅니다.',
    learn: ['은닉 상태와 시간 펼치기', '시간을 거슬러 사라지는 기울기', 'LSTM의 게이트와 셀 상태'],
    Component: lazy(() => import('./lessons/Rnn')),
  },
  {
    id: 'transformer',
    part: 'sequence',
    title: '트랜스포머 깊이 보기',
    en: 'Inside the Transformer',
    lede: '기초 과목에서 본 어텐션 블록을 실제 모델 크기로 키워 봅니다. 순서를 알려 주는 위치 인코딩, 생성을 빠르게 하는 KV 캐시, 그리고 파라미터와 계산량이 어디서 나오는지 계산합니다.',
    learn: ['위치 인코딩과 RoPE', '인과 마스크와 KV 캐시', '파라미터 수와 계산량 세기'],
    Component: lazy(() => import('./lessons/Transformer')),
  },
  {
    id: 'autoencoder-vae',
    part: 'generative',
    title: '오토인코더와 VAE',
    en: 'Autoencoders & VAEs',
    lede: '입력을 좁은 통로로 압축했다가 되살리도록 학습하면, 통로 안에 데이터의 요점만 담긴 잠재 공간이 생깁니다. 그 공간을 매끄럽게 다듬으면 새로운 데이터를 뽑아낼 수 있는 VAE가 됩니다.',
    learn: ['압축과 복원으로 배우는 잠재 공간', '잠재 공간을 걸어 다니기', 'VAE와 KL 항의 역할'],
    Component: lazy(() => import('./lessons/Autoencoder')),
  },
  {
    id: 'diffusion',
    part: 'generative',
    title: '확산 모델',
    en: 'Diffusion Models',
    lede: '데이터에 노이즈를 조금씩 섞어 완전한 잡음으로 만드는 과정은 쉽습니다. 확산 모델은 그 반대, 잡음에서 노이즈를 조금씩 걷어 내는 법을 배웁니다. 이미지 생성 모델의 원리를 2차원 점으로 직접 따라갑니다.',
    learn: ['노이즈를 더하는 정방향 과정', '역방향 샘플링: 단계 수와 샘플러', '분류기 없는 가이던스'],
    Component: lazy(() => import('./lessons/Diffusion')),
  },
];

const course: Course = {
  id: 'ai-deep-learning',
  subject: 'ai',
  title: '딥러닝',
  subtitle: '학습 기법에서 확산 모델까지',
  level: 2,
  prerequisites: ['ai-basics'],
  blurb: '기초 인공지능의 신경망을 실제로 잘 학습되게 만드는 기술에서 시작해, 순환 신경망과 트랜스포머의 속, 그리고 오토인코더와 확산 모델 같은 생성 모델까지 갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
