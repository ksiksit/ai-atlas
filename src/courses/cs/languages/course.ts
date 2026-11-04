import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'paradigms', title: '언어의 생각법', en: 'How Languages Think', color: 'var(--c-cs-1)', blurb: '값을 바꾸지 않고 함수를 조합하는 방식, 그리고 타입이 프로그램에 대해 증명해 주는 것.' },
  { id: 'implement', title: '언어 만들기', en: 'Building a Language', color: 'var(--c-cs-3)', blurb: '코드를 읽고 실행하는 인터프리터, 메모리를 치우는 가비지 컬렉터, 기계어로 옮기는 컴파일러.' },
];

const lessons: Lesson[] = [
  {
    id: 'functional',
    part: 'paradigms',
    title: '함수형 프로그래밍',
    en: 'Functional Programming',
    lede: '변수를 바꾸지 않고, 함수를 값처럼 넘기고 조합해서 프로그램을 만드는 방식입니다. map, filter, reduce와 고차 함수, 불변 데이터, 순수 함수가 왜 테스트와 병렬 처리를 쉽게 하는지 봅니다.',
    learn: ['순수 함수와 불변 데이터', '고차 함수와 map, filter, reduce', '클로저와 커링'],
    Component: lazy(() => import('./lessons/Functional')),
  },
  {
    id: 'type-systems',
    part: 'paradigms',
    title: '타입과 타입 검사',
    en: 'Types & Type Checking',
    lede: '타입 검사기는 코드를 실행하지 않고도 어떤 실수가 일어날 수 없음을 보여 줍니다. 식마다 타입을 매기는 규칙을 따라가고, 타입을 적지 않아도 알아내는 타입 추론을 직접 돌려 봅니다.',
    learn: ['타입 규칙과 타입 검사', '제네릭과 다형성', '타입 추론'],
    Component: lazy(() => import('./lessons/TypeSystems')),
  },
  {
    id: 'interpreter',
    part: 'implement',
    title: '인터프리터 만들기',
    en: 'Building an Interpreter',
    lede: '작은 언어를 직접 만들어 봅니다. 코드를 토큰과 구문 트리로 바꾸고, 환경을 들고 다니며 트리를 평가하고, 함수가 만들어질 때의 환경을 붙잡는 클로저가 어떻게 동작하는지 봅니다.',
    learn: ['구문 트리와 평가', '환경과 변수 찾기', '클로저와 재귀 함수'],
    Component: lazy(() => import('./lessons/Interpreter')),
  },
  {
    id: 'garbage-collection',
    part: 'implement',
    title: '메모리 관리와 가비지 컬렉션',
    en: 'Memory Management & Garbage Collection',
    lede: 'JavaScript는 free를 부르지 않아도 메모리가 넘치지 않습니다. 더 이상 닿을 수 없는 객체를 찾아 치우는 표시-쓸기와 참조 세기, 세대별 수집이 어떻게 동작하고 언제 멈춤이 생기는지 봅니다.',
    learn: ['도달 가능성과 루트', '참조 세기와 순환', '표시-쓸기와 세대별 수집'],
    Component: lazy(() => import('./lessons/GarbageCollection')),
  },
  {
    id: 'compiler',
    part: 'implement',
    title: '컴파일러가 하는 일',
    en: 'What a Compiler Does',
    lede: '컴파일러는 사람이 읽는 코드를 기계가 실행하는 명령어로 옮깁니다. 식을 스택 기계의 명령어로 바꾸고, 상수 접기 같은 최적화를 하고, 인터프리터와 JIT 컴파일러의 차이를 봅니다.',
    learn: ['컴파일 단계 한눈에 보기', '식을 명령어로 옮기기', '최적화와 JIT'],
    Component: lazy(() => import('./lessons/Compiler')),
  },
];

const course: Course = {
  id: 'cs-programming-languages',
  subject: 'cs',
  title: '프로그래밍 언어',
  subtitle: '함수형에서 컴파일러까지',
  level: 2,
  prerequisites: ['cs-programming'],
  blurb: '언어를 쓰는 데서 한 걸음 나아가, 언어가 어떻게 동작하는지 직접 만들어 봅니다. 함수형 프로그래밍과 타입 시스템을 배우고, 작은 언어의 인터프리터를 만들고, 가비지 컬렉터와 컴파일러가 하는 일을 따라갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
