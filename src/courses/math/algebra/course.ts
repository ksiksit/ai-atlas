import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'groups', title: '군', en: 'Groups', color: 'var(--c-math-1)', blurb: '대칭을 수처럼 곱하고 되돌리는 구조. 부분군, 잉여류, 준동형, 그리고 군이 물건을 움직이는 방식.' },
  { id: 'rings', title: '환과 체', en: 'Rings & Fields', color: 'var(--c-math-3)', blurb: '더하기와 곱하기가 둘 다 있는 구조. 다항식과 유한체, 그리고 그것으로 만드는 부호와 암호.' },
];

const lessons: Lesson[] = [
  {
    id: 'groups',
    part: 'groups',
    title: '대칭과 군',
    en: 'Symmetry & Groups',
    lede: '정삼각형을 돌리고 뒤집는 방법은 여섯 가지이고, 두 동작을 이어 하면 또 그중 하나가 됩니다. 이 대칭들의 곱셈표에서 결합법칙, 항등원, 역원이라는 군의 공리를 찾아내고, 정수의 덧셈과 시계 산술도 같은 구조임을 봅니다.',
    learn: ['군의 공리', '정다각형의 대칭군과 곱셈표', '순환군, 위수, 생성원'],
    Component: lazy(() => import('./lessons/Groups')),
  },
  {
    id: 'subgroups-lagrange',
    part: 'groups',
    title: '부분군과 라그랑주 정리',
    en: 'Subgroups & Lagrange’s Theorem',
    lede: '군 안의 작은 군을 부분군이라고 합니다. 부분군을 옮겨 만든 잉여류가 군을 같은 크기의 조각으로 빈틈없이 나눈다는 것을 보고, 그래서 부분군의 크기는 언제나 군의 크기의 약수라는 라그랑주 정리와 페르마의 소정리를 얻습니다.',
    learn: ['부분군과 생성된 부분군', '잉여류로 군 나누기', '라그랑주 정리와 페르마의 소정리'],
    Component: lazy(() => import('./lessons/Lagrange')),
  },
  {
    id: 'homomorphisms',
    part: 'groups',
    title: '준동형과 몫군',
    en: 'Homomorphisms & Quotient Groups',
    lede: '두 군 사이에서 곱셈을 보존하는 함수를 준동형이라고 합니다. 핵과 상을 계산해 보고, 정규부분군으로 군을 접어 만든 몫군이 준동형의 상과 같다는 제1 동형 정리를 곱셈표를 색칠하며 확인합니다.',
    learn: ['준동형, 동형, 핵과 상', '정규부분군과 몫군', '제1 동형 정리'],
    Component: lazy(() => import('./lessons/Homomorphisms')),
  },
  {
    id: 'group-actions',
    part: 'groups',
    title: '순열군과 군의 작용',
    en: 'Permutations & Group Actions',
    lede: '모든 유한군은 순열로 나타낼 수 있습니다. 순열을 순환으로 쪼개고 홀짝을 따지면 15 퍼즐의 절반이 왜 풀리지 않는지 알 수 있습니다. 군이 물건을 움직이는 작용, 궤도와 안정자, 그리고 번사이드 보조정리로 목걸이의 가짓수를 셉니다.',
    learn: ['순열, 순환 분해, 홀짝', '궤도-안정자 정리', '번사이드 보조정리로 세기'],
    Component: lazy(() => import('./lessons/GroupActions')),
  },
  {
    id: 'rings-fields',
    part: 'rings',
    title: '환과 체',
    en: 'Rings & Fields',
    lede: '정수와 다항식에는 더하기와 곱하기가 함께 있습니다. 나눗셈까지 되는 체는 언제 생기는지, 소수 p로 나눈 나머지가 왜 체가 되는지 보고, 기약 다항식으로 원소가 8개, 16개인 유한체를 직접 만들어 곱셈표를 확인합니다.',
    learn: ['환, 정역, 체', '다항식 환과 나눗셈 알고리즘', '기약 다항식으로 만드는 유한체'],
    Component: lazy(() => import('./lessons/RingsFields')),
  },
  {
    id: 'codes-crypto',
    part: 'rings',
    title: '응용: 부호와 암호',
    en: 'Applications: Codes & Cryptography',
    lede: 'QR 코드가 일부 가려져도 읽히는 것은 유한체 위의 다항식 덕분입니다. 리드-솔로몬 부호로 깨진 데이터를 복원하고, 군의 이산 로그가 왜 어려운지 보고, 디피-헬먼 키 교환과 타원곡선 위의 덧셈을 작은 수로 계산해 봅니다.',
    learn: ['리드-솔로몬 부호와 오류 정정', '이산 로그와 디피-헬먼', '타원곡선 군의 덧셈'],
    Component: lazy(() => import('./lessons/CodesCrypto')),
  },
];

const course: Course = {
  id: 'math-abstract-algebra',
  subject: 'math',
  title: '현대대수학',
  subtitle: '대칭에서 유한체까지',
  level: 3,
  prerequisites: ['math-discrete', 'math-linear-algebra'],
  blurb: '대칭을 수처럼 다루는 군에서 시작해, 부분군과 라그랑주 정리, 준동형과 몫군, 군의 작용, 환과 유한체까지 곱셈표를 직접 채워 보며 따라갑니다. 마지막 장에서는 오류 정정 부호와 암호에 씁니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
