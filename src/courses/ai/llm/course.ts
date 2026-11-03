import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'build', title: '만들기', en: 'Building', color: 'var(--c-math)', blurb: '글을 토큰으로 자르고, 모델과 데이터를 얼마나 키울지 정하는 일.' },
  { id: 'adapt', title: '다듬기', en: 'Adapting', color: 'var(--c-ml)', blurb: '사전 학습된 모델을 내 작업과 사람의 선호에 맞게 고치는 법.' },
  { id: 'serve', title: '쓰기', en: 'Serving', color: 'var(--c-dl)', blurb: '모델이 모르는 지식을 붙여 주고, 더 빠르고 싸게 답하게 하는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'tokenizer',
    part: 'build',
    title: '토크나이저와 BPE',
    en: 'Tokenizers & BPE',
    lede: '언어 모델은 글자가 아니라 토큰을 읽습니다. 자주 붙어 나오는 조각을 하나씩 합쳐 어휘를 만드는 BPE를 직접 학습시키고, 어휘 크기와 한국어가 토큰을 얼마나 쓰는지의 관계를 봅니다.',
    learn: ['BPE 병합을 한 단계씩', '바이트 단위 BPE와 한국어', '어휘 크기와 문장 길이의 맞바꿈'],
    Component: lazy(() => import('./lessons/Tokenizer')),
  },
  {
    id: 'scaling',
    part: 'build',
    title: '스케일링 법칙',
    en: 'Scaling Laws',
    lede: '모델을 키우고 데이터를 늘리면 손실은 놀랍도록 매끄러운 거듭제곱 곡선을 따라 줄어듭니다. 정해진 계산 예산에서 모델 크기와 데이터 양을 어떻게 나눠야 하는지 계산해 봅니다.',
    learn: ['손실의 거듭제곱 법칙', '계산량 C ≈ 6ND', '계산 최적 배분'],
    Component: lazy(() => import('./lessons/Scaling')),
  },
  {
    id: 'lora',
    part: 'adapt',
    title: '파인튜닝과 LoRA',
    en: 'Fine-Tuning & LoRA',
    lede: '처음부터 학습하는 대신 이미 학습된 모델을 조금만 고쳐 새 작업에 맞춥니다. 수십억 개의 가중치 대신 작은 행렬 두 개만 학습하는 LoRA가 왜 통하는지 행렬의 랭크로 확인합니다.',
    learn: ['전이 학습과 전체 파인튜닝', '저랭크 업데이트 BA', '학습 파라미터와 메모리 계산'],
    Component: lazy(() => import('./lessons/Lora')),
  },
  {
    id: 'alignment',
    part: 'adapt',
    title: '사람의 피드백으로 학습',
    en: 'Learning from Human Feedback',
    lede: '"더 나은 답"은 정답 레이블로 적기 어렵지만 두 답 중 하나를 고르는 것은 쉽습니다. 선호 데이터로 보상 모델을 세우고, 원래 모델에서 너무 멀어지지 않게 고치는 RLHF와 DPO를 작은 예로 따라갑니다.',
    learn: ['쌍대 비교와 보상 모델', 'KL로 묶어 둔 정책 최적화', 'DPO와 보상 해킹'],
    Component: lazy(() => import('./lessons/Alignment')),
  },
  {
    id: 'rag',
    part: 'serve',
    title: 'RAG와 벡터 검색',
    en: 'RAG & Vector Search',
    lede: '모델이 학습하지 않은 문서에 대해 답하게 하려면, 질문과 비슷한 문서를 찾아 함께 넣어 주면 됩니다. 문서를 조각내고 벡터로 바꿔 가장 가까운 것을 찾는 과정과, 수백만 개에서도 빠르게 찾는 근사 검색을 봅니다.',
    learn: ['청크와 임베딩으로 상위 k개 찾기', '검색 품질 재기', '근사 최근접 이웃 검색'],
    Component: lazy(() => import('./lessons/Rag')),
  },
  {
    id: 'inference',
    part: 'serve',
    title: '추론 최적화',
    en: 'Inference Optimization',
    lede: '같은 모델도 어떻게 돌리느냐에 따라 속도와 비용이 몇 배씩 달라집니다. 가중치를 적은 비트로 줄이는 양자화, 메모리 대역폭이 정하는 생성 속도, 작은 모델이 미리 써 보는 추측 디코딩을 계산합니다.',
    learn: ['양자화와 오차', '메모리 대역폭, 배치, KV 캐시', '추측 디코딩'],
    Component: lazy(() => import('./lessons/Inference')),
  },
];

const course: Course = {
  id: 'ai-llm',
  subject: 'ai',
  title: '대형 언어 모델',
  subtitle: '토크나이저에서 추론 최적화까지',
  level: 3,
  prerequisites: ['ai-deep-learning'],
  blurb: '대형 언어 모델이 실제로 만들어지고 쓰이는 과정을 따라갑니다. 토크나이저와 스케일링 법칙, LoRA 파인튜닝과 사람의 피드백으로 학습, RAG와 추론 최적화까지 개발자가 직접 부딪히는 선택들을 계산하며 다룹니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
