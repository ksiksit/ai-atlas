import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'parallel', title: '병렬로 빠르게', en: 'Going Parallel', color: 'var(--c-cs-2)', blurb: '코어 여러 개에 일을 나눠 주면 얼마나 빨라지는지, 그 한계를 정하는 것은 무엇인지.' },
  { id: 'distributed', title: '여러 컴퓨터가 함께', en: 'Many Machines', color: 'var(--c-cs-3)', blurb: '시계도 메모리도 공유하지 않고, 메시지는 늦거나 사라지는 기계들이 하나의 답에 합의하는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'amdahl',
    part: 'parallel',
    title: '병렬성과 암달의 법칙',
    en: 'Parallelism & Amdahl’s Law',
    lede: '코어를 두 배로 늘리면 프로그램이 두 배 빨라질까요? 나눌 수 없는 직렬 부분이 속도 향상의 천장을 정한다는 암달의 법칙을, 브라우저의 작업자를 실제로 늘려 가며 재 봅니다.',
    learn: ['동시성과 병렬성의 차이', '속도 향상과 암달의 법칙', '구스타프슨의 법칙과 약한 확장'],
    Component: lazy(() => import('./lessons/Amdahl')),
  },
  {
    id: 'work-span',
    part: 'parallel',
    title: '일과 경로: 병렬 알고리즘',
    en: 'Work & Span',
    lede: '병렬 알고리즘은 할 일의 총량(일)과 가장 긴 의존 사슬(경로) 두 수로 잽니다. 합, 접두사 합, 병합 정렬을 계산 그래프로 그려 보고, 프로세서가 몇 개일 때 얼마나 걸리는지 따져 봅니다.',
    learn: ['계산 그래프, 일, 경로', '브렌트의 정리와 병렬도', '병렬 접두사 합과 병렬 병합 정렬'],
    Component: lazy(() => import('./lessons/WorkSpan')),
  },
  {
    id: 'data-parallel',
    part: 'parallel',
    title: '데이터 병렬과 GPU',
    en: 'Data Parallelism & GPUs',
    lede: '같은 연산을 수천 개의 데이터에 한꺼번에 적용하는 것이 GPU가 빠른 이유입니다. SIMD 레인과 워프, 갈라지는 분기의 비용, 행렬 곱을 타일로 나눠 메모리를 아끼는 법을 봅니다.',
    learn: ['SIMD와 데이터 병렬', '워프와 분기 발산', '메모리 대역폭과 타일링'],
    Component: lazy(() => import('./lessons/DataParallel')),
  },
  {
    id: 'clocks',
    part: 'distributed',
    title: '시간과 순서',
    en: 'Time & Order',
    lede: '서버마다 시계가 조금씩 다르면 "무엇이 먼저 일어났는가"를 어떻게 정할까요? 메시지 도표 위에서 먼저 일어남 관계를 따라가고, 램포트 시계와 벡터 시계를 직접 매겨 봅니다.',
    learn: ['물리 시계의 어긋남', '먼저 일어남 관계와 동시성', '램포트 시계와 벡터 시계'],
    Component: lazy(() => import('./lessons/Clocks')),
  },
  {
    id: 'consensus',
    part: 'distributed',
    title: '복제와 합의',
    en: 'Replication & Consensus',
    lede: '서버 한 대가 꺼져도 서비스가 멈추지 않으려면 데이터를 여러 대에 복제하고, 그 복제본들이 같은 순서에 합의해야 합니다. Raft의 리더 선출과 로그 복제를 서버를 끄고 네트워크를 끊어 가며 따라갑니다.',
    learn: ['상태 기계 복제', 'Raft의 리더 선출과 임기', '로그 복제와 과반수 커밋'],
    Component: lazy(() => import('./lessons/Consensus')),
  },
  {
    id: 'consistency',
    part: 'distributed',
    title: '일관성과 CAP',
    en: 'Consistency & CAP',
    lede: '복제본 사이의 네트워크가 끊기면, 답을 거부하거나 낡은 답을 주거나 둘 중 하나를 골라야 합니다. 쿼럼 읽기와 쓰기, 최종 일관성, 그리고 CAP 정리가 말하는 선택을 직접 해 봅니다.',
    learn: ['강한 일관성과 최종 일관성', '쿼럼: R + W > N', 'CAP 정리와 PACELC'],
    Component: lazy(() => import('./lessons/Consistency')),
  },
];

const course: Course = {
  id: 'cs-parallel-distributed',
  subject: 'cs',
  title: '병렬·분산 컴퓨팅',
  subtitle: '암달의 법칙에서 합의까지',
  level: 3,
  prerequisites: ['cs-operating-systems', 'cs-algorithm-design'],
  blurb: '코어 여러 개와 컴퓨터 여러 대가 일을 나눠 할 때의 원리를 다룹니다. 속도 향상의 한계, 병렬 알고리즘, GPU, 분산 시계, Raft 합의, 일관성과 CAP을 시뮬레이션으로 따라갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
