import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'basics', title: '기본기', en: 'Basics', color: 'var(--c-cs-1)', blurb: '값을 만들고 이름을 붙이고, 조건에 따라 가르고, 되풀이하는 법.' },
  { id: 'functions', title: '함수와 데이터', en: 'Functions & Data', color: 'var(--c-cs-2)', blurb: '일을 함수로 나누고, 여러 값을 배열과 객체로 묶는 법.' },
  { id: 'solving', title: '문제를 푸는 코드', en: 'Solving Problems', color: 'var(--c-cs-4)', blurb: '자기 자신을 부르는 함수로 문제를 쪼개고, 코드가 맞는지 확인하는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'values',
    part: 'basics',
    title: '값, 변수, 식',
    en: 'Values, Variables & Expressions',
    lede: '프로그램은 값을 만들고, 이름을 붙이고, 계산하는 일로 시작합니다. 숫자와 문자열과 참·거짓, 그리고 변수에 값을 담고 바꾸는 법을 한 줄씩 실행하며 봅니다.',
    learn: ['값과 자료형', '변수에 담고 바꾸기', '식이 계산되는 순서'],
    Component: lazy(() => import('./lessons/Values')),
  },
  {
    id: 'control-flow',
    part: 'basics',
    title: '조건과 반복',
    en: 'Conditions & Loops',
    lede: '같은 코드라도 입력에 따라 다른 길로 가고, 같은 일을 백 번 되풀이할 수 있습니다. if와 for, while이 실행 흐름을 어떻게 바꾸는지 따라갑니다.',
    learn: ['if와 else로 가르기', 'for와 while로 되풀이하기', '무한 반복과 반복의 끝'],
    Component: lazy(() => import('./lessons/ControlFlow')),
  },
  {
    id: 'functions',
    part: 'functions',
    title: '함수와 호출 스택',
    en: 'Functions & the Call Stack',
    lede: '함수는 일에 이름을 붙여 다시 쓰게 해 줍니다. 값을 넘기고 돌려받는 법, 그리고 함수가 함수를 부를 때 컴퓨터가 어디까지 했는지 기억하는 호출 스택을 봅니다.',
    learn: ['매개변수와 반환값', '지역 변수와 범위', '호출 스택'],
    Component: lazy(() => import('./lessons/Functions')),
  },
  {
    id: 'arrays-objects',
    part: 'functions',
    title: '배열과 객체',
    en: 'Arrays & Objects',
    lede: '값이 수백 개가 되면 변수 하나씩으로는 감당할 수 없습니다. 순서가 있는 배열과 이름이 붙은 객체로 데이터를 묶고, 반복문으로 훑고, 같은 것을 가리키는 두 이름의 함정을 봅니다.',
    learn: ['배열과 인덱스', '객체와 속성', '값 복사와 참조'],
    Component: lazy(() => import('./lessons/ArraysObjects')),
  },
  {
    id: 'recursion',
    part: 'solving',
    title: '재귀',
    en: 'Recursion',
    lede: '자기 자신을 부르는 함수는 큰 문제를 같은 모양의 작은 문제로 줄여 풉니다. 팩토리얼과 폴더 크기 세기를 따라가며 기저 사례와 호출 스택이 쌓이고 풀리는 모습을 봅니다.',
    learn: ['기저 사례와 재귀 호출', '호출 스택이 쌓이고 풀리기', '반복문으로 바꾸기'],
    Component: lazy(() => import('./lessons/Recursion')),
  },
  {
    id: 'testing',
    part: 'solving',
    title: '테스트와 디버깅',
    en: 'Testing & Debugging',
    lede: '코드는 처음부터 맞게 쓰기 어렵습니다. 테스트로 틀린 곳을 찾아내고, 값을 찍어 보고 한 줄씩 따라가며 원인을 좁히는 디버깅을 직접 해 봅니다.',
    learn: ['테스트 케이스 만들기', '경계값과 흔한 실수', '디버깅: 가설 세우고 좁히기'],
    Component: lazy(() => import('./lessons/Testing')),
  },
];

const course: Course = {
  id: 'cs-programming',
  subject: 'cs',
  title: '프로그래밍 입문',
  subtitle: '변수에서 재귀까지',
  level: 1,
  blurb: '코드를 처음 쓰는 사람을 위한 첫 과목입니다. 이 사이트의 다른 과목들이 쓰는 JavaScript로 값과 변수, 조건과 반복, 함수, 배열과 객체, 재귀, 테스트를 배우고, 코드가 한 줄씩 실행되는 모습을 눈으로 따라갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
