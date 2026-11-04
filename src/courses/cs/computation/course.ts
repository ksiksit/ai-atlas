import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'automata', title: '오토마타와 언어', en: 'Automata & Languages', color: 'var(--c-cs-1)', blurb: '기억이 거의 없는 기계로 문자열을 알아보는 법. 정규 표현식과 문법.' },
  { id: 'limits', title: '계산의 한계', en: 'Limits of Computation', color: 'var(--c-cs-3)', blurb: '모든 컴퓨터를 대표하는 튜링 기계, 그리고 그것으로도 풀 수 없거나 풀기 어려운 문제.' },
];

const lessons: Lesson[] = [
  {
    id: 'finite-automata',
    part: 'automata',
    title: '유한 오토마타',
    en: 'Finite Automata',
    lede: '상태 몇 개와 화살표만으로 된 기계가 자판기, 신호등, 문자열 검사기를 모두 설명합니다. 결정적 유한 오토마타를 만들어 문자열을 넣어 보고, 이 기계로는 알아볼 수 없는 언어도 찾습니다.',
    learn: ['상태, 전이, 수락 상태', 'DFA로 문자열 알아보기', '유한 오토마타의 한계'],
    Component: lazy(() => import('./lessons/FiniteAutomata')),
  },
  {
    id: 'regex',
    part: 'automata',
    title: '정규 표현식과 NFA',
    en: 'Regular Expressions & NFAs',
    lede: '정규 표현식은 유한 오토마타를 적는 다른 방법입니다. 정규 표현식을 NFA로 바꾸고, 여러 상태를 동시에 따라가며 문자열을 검사하는 과정과, 역추적 엔진이 느려지는 패턴을 봅니다.',
    learn: ['정규 표현식의 세 연산', '톰슨 구성법과 NFA', '역추적과 상태 집합 시뮬레이션'],
    Component: lazy(() => import('./lessons/Regex')),
  },
  {
    id: 'grammars-parsing',
    part: 'automata',
    title: '문법과 파싱',
    en: 'Grammars & Parsing',
    lede: '괄호의 짝이나 1 + 2 * 3의 계산 순서는 유한 오토마타로는 다룰 수 없습니다. 문맥 자유 문법으로 식의 구조를 적고, 재귀 하강 파서로 파스 트리를 만들어 계산합니다.',
    learn: ['문맥 자유 문법과 유도', '파스 트리와 모호성', '재귀 하강 파싱'],
    Component: lazy(() => import('./lessons/GrammarsParsing')),
  },
  {
    id: 'turing-machines',
    part: 'limits',
    title: '튜링 기계',
    en: 'Turing Machines',
    lede: '테이프 한 줄과 읽기·쓰기 머리 하나, 그리고 규칙표. 이렇게 단순한 기계가 지금의 어떤 컴퓨터가 할 수 있는 계산이든 모두 할 수 있습니다. 튜링 기계를 한 칸씩 돌려 봅니다.',
    learn: ['테이프, 머리, 상태', '튜링 기계 프로그램 읽기', '처치-튜링 논제'],
    Component: lazy(() => import('./lessons/TuringMachines')),
  },
  {
    id: 'undecidability',
    part: 'limits',
    title: '정지 문제와 P 대 NP',
    en: 'The Halting Problem & P vs NP',
    lede: '어떤 프로그램이 언젠가 멈출지 항상 맞히는 프로그램은 만들 수 없습니다. 대각선 논법으로 이를 증명하고, 풀 수는 있지만 현실적인 시간 안에는 풀기 어려운 문제들, P와 NP로 넘어갑니다.',
    learn: ['대각선 논법과 정지 문제', '환원', 'P, NP, NP-완전'],
    Component: lazy(() => import('./lessons/Undecidability')),
  },
];

const course: Course = {
  id: 'cs-computation',
  subject: 'cs',
  title: '계산 이론',
  subtitle: '오토마타에서 정지 문제까지',
  level: 3,
  prerequisites: ['cs-algorithm-design'],
  blurb: '컴퓨터가 무엇을 계산할 수 있고 무엇은 영원히 계산할 수 없는지 묻습니다. 유한 오토마타와 정규 표현식, 문법과 파싱, 튜링 기계를 직접 돌려 보고, 정지 문제와 P 대 NP까지 따라갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
