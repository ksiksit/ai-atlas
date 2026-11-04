import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'bits', title: '비트와 회로', en: 'Bits & Circuits', color: 'var(--c-cs-1)', blurb: '모든 데이터는 0과 1입니다. 수를 비트로 나타내고, 게이트로 계산하고, 회로로 기억하는 법.' },
  { id: 'machine', title: '기계의 동작', en: 'How the Machine Runs', color: 'var(--c-cs-2)', blurb: '명령어를 읽고 실행하는 CPU, 그리고 CPU를 기다리게 하지 않으려는 메모리 계층.' },
];

const lessons: Lesson[] = [
  {
    id: 'binary',
    part: 'bits',
    title: '비트와 수 표현',
    en: 'Bits & Number Representation',
    lede: '컴퓨터 안의 모든 것은 0과 1입니다. 같은 32비트가 양수가 되기도, 음수가 되기도, 소수가 되기도 합니다. 0.1 + 0.2가 0.3이 아닌 이유까지 비트로 따라갑니다.',
    learn: ['2진수와 16진수', '2의 보수로 음수 나타내기', '부동소수점과 반올림 오차'],
    Component: lazy(() => import('./lessons/Binary')),
  },
  {
    id: 'logic-gates',
    part: 'bits',
    title: '논리 게이트와 덧셈기',
    en: 'Logic Gates & Adders',
    lede: 'AND, OR, NOT 세 가지 게이트만 있으면 덧셈을 할 수 있습니다. 반가산기와 전가산기를 직접 이어 붙여 8비트 덧셈기를 만들고, 자리올림이 퍼지는 모습을 봅니다.',
    learn: ['진리표와 기본 게이트', '반가산기와 전가산기', '자리올림 전파와 회로 지연'],
    Component: lazy(() => import('./lessons/LogicGates')),
  },
  {
    id: 'memory-circuits',
    part: 'bits',
    title: '기억하는 회로',
    en: 'Latches, Registers & Memory',
    lede: '계산만 하는 회로는 아무것도 기억하지 못합니다. 출력을 다시 입력으로 되돌리면 1비트를 기억하는 래치가 되고, 이것을 모아 레지스터와 메모리를 만듭니다.',
    learn: ['피드백과 SR 래치', '클록과 D 플립플롭', '주소로 메모리 칸 고르기'],
    Component: lazy(() => import('./lessons/MemoryCircuits')),
  },
  {
    id: 'cpu',
    part: 'machine',
    title: 'CPU: 인출, 해독, 실행',
    en: 'The CPU',
    lede: 'CPU가 하는 일은 단순합니다. 메모리에서 명령어를 하나 읽고, 무슨 뜻인지 풀고, 실행한 다음 다음 명령어로 넘어갑니다. 작은 가상 CPU에서 프로그램을 한 단계씩 돌려 봅니다.',
    learn: ['명령어와 기계어', '레지스터, 프로그램 카운터, ALU', '분기와 반복문이 기계어가 되는 법'],
    Component: lazy(() => import('./lessons/Cpu')),
  },
  {
    id: 'memory-hierarchy',
    part: 'machine',
    title: '메모리 계층과 캐시',
    en: 'Memory Hierarchy & Caches',
    lede: 'CPU는 1나노초에 여러 일을 하지만 메인 메모리에서 값 하나를 가져오는 데는 100나노초가 걸립니다. 그 차이를 메우는 캐시가 어떻게 동작하고, 같은 코드가 반복 순서만 바꿔도 몇 배 빨라지는 이유를 봅니다.',
    learn: ['지연 시간의 계층', '캐시 라인과 지역성', '캐시 적중과 실패 흉내 내기'],
    Component: lazy(() => import('./lessons/MemoryHierarchy')),
  },
];

const course: Course = {
  id: 'cs-architecture',
  subject: 'cs',
  title: '컴퓨터 구조',
  subtitle: '비트에서 CPU까지',
  level: 1,
  prerequisites: ['cs-programming'],
  blurb: '프로그램이 실제로 돌아가는 기계를 아래에서부터 쌓아 올립니다. 0과 1로 수를 나타내는 법, 논리 게이트로 덧셈기와 메모리를 만드는 법, 명령어를 한 줄씩 실행하는 CPU, 그리고 속도를 좌우하는 메모리 계층과 캐시까지 다룹니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
