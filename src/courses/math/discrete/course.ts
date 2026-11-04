import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'logic', title: '논리와 증명', en: 'Logic & Proof', color: 'var(--c-math-1)', blurb: '참과 거짓을 따지는 규칙과, 어떤 주장이 언제나 참임을 보이는 방법.' },
  { id: 'structures', title: '집합과 귀납', en: 'Sets & Induction', color: 'var(--c-math-2)', blurb: '대상을 모으고 잇는 언어, 그리고 무한히 많은 경우를 한 번에 증명하는 귀납법.' },
  { id: 'counting', title: '세기와 정수', en: 'Counting & Integers', color: 'var(--c-math-3)', blurb: '빠짐없이 겹치지 않게 세는 법과, 나머지로 계산하는 정수의 세계.' },
];

const lessons: Lesson[] = [
  {
    id: 'logic',
    part: 'logic',
    title: '명제와 논리',
    en: 'Propositions & Logic',
    lede: '"비가 오면 우산을 쓴다"가 거짓이 되는 경우는 하나뿐입니다. 그리고, 또는, 아니다, 이면을 진리표로 따지고, 코드의 조건문과 검색 필터가 모두 같은 논리 위에 서 있음을 봅니다.',
    learn: ['명제와 논리 연산자', '진리표와 동치', '함의와 대우, 한정자'],
    Component: lazy(() => import('./lessons/Logic')),
  },
  {
    id: 'proofs',
    part: 'logic',
    title: '증명하는 방법',
    en: 'Methods of Proof',
    lede: '예를 백 개 들어도 증명은 되지 않지만 반례 하나면 반박은 됩니다. 직접 증명, 대우 증명, 귀류법을 따라가고, √2가 분수가 아니라는 것과 소수가 끝없이 많다는 것을 증명합니다.',
    learn: ['직접 증명과 대우 증명', '귀류법', '반례 찾기'],
    Component: lazy(() => import('./lessons/Proofs')),
  },
  {
    id: 'sets-functions',
    part: 'structures',
    title: '집합, 함수, 관계',
    en: 'Sets, Functions & Relations',
    lede: '데이터베이스의 표, 해시 함수, 친구 관계는 모두 집합과 함수와 관계로 적을 수 있습니다. 벤 다이어그램으로 집합 연산을 하고, 함수가 일대일인지 따지고, 관계의 성질을 봅니다.',
    learn: ['집합과 집합 연산', '함수: 단사, 전사, 전단사', '관계와 동치 관계'],
    Component: lazy(() => import('./lessons/SetsFunctions')),
  },
  {
    id: 'induction',
    part: 'structures',
    title: '수학적 귀납법과 재귀',
    en: 'Induction & Recursion',
    lede: '첫 도미노가 넘어지고, 하나가 넘어지면 다음 것도 넘어진다면 모두 넘어집니다. 귀납법으로 무한히 많은 경우를 증명하고, 재귀 함수가 맞게 동작한다는 증명이 같은 모양이라는 것을 봅니다.',
    learn: ['귀납법의 두 단계', '강한 귀납법', '재귀 함수의 정확성 증명'],
    Component: lazy(() => import('./lessons/Induction')),
  },
  {
    id: 'counting',
    part: 'counting',
    title: '경우의 수와 비둘기집 원리',
    en: 'Counting & the Pigeonhole Principle',
    lede: '비밀번호는 몇 개나 만들 수 있고, 23명이 모이면 생일이 같은 두 사람이 있을 확률은 왜 절반이 넘을까요. 곱의 법칙, 순열과 조합, 포함·배제, 비둘기집 원리로 빠짐없이 셉니다.',
    learn: ['곱의 법칙과 합의 법칙', '순열과 조합', '비둘기집 원리'],
    Component: lazy(() => import('./lessons/Counting')),
  },
  {
    id: 'modular',
    part: 'counting',
    title: '정수와 모듈러 연산',
    en: 'Integers & Modular Arithmetic',
    lede: '시계는 12가 지나면 다시 1입니다. 나머지만 남기는 모듈러 연산으로 해시 함수와 체크섬과 암호가 만들어집니다. 최대공약수를 구하는 유클리드 호제법부터 RSA의 핵심 아이디어까지 갑니다.',
    learn: ['나눗셈과 나머지', '최대공약수와 유클리드 호제법', '모듈러 역원과 RSA의 아이디어'],
    Component: lazy(() => import('./lessons/Modular')),
  },
];

const course: Course = {
  id: 'math-discrete',
  subject: 'math',
  title: '이산수학',
  subtitle: '논리에서 모듈러 연산까지',
  level: 1,
  blurb: '컴퓨터과학이 기대는 수학의 첫 과목입니다. 명제와 논리, 증명하는 방법, 집합과 함수, 수학적 귀납법, 경우의 수, 모듈러 연산을 다룹니다. 증명을 읽고 쓰는 법을 익히고, 알고리즘과 계산 이론, 암호에서 이 도구들이 어떻게 쓰이는지 봅니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
