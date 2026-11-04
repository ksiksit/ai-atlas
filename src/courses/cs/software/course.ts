import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'correct', title: '맞게 만들기', en: 'Getting It Right', color: 'var(--c-cs-1)', blurb: '코드가 무엇을 해야 하는지 적고, 정말 그렇게 하는지 확인하고, 실수를 미리 막는 법.' },
  { id: 'change', title: '바꾸기 쉽게 만들기', en: 'Designing for Change', color: 'var(--c-cs-2)', blurb: '요구 사항이 바뀌어도 한 곳만 고치면 되도록 코드를 나누고 다듬는 법.' },
  { id: 'together', title: '함께 만들기', en: 'Building Together', color: 'var(--c-cs-4)', blurb: '여러 사람이 같은 코드를 고치는 법, 그리고 만든 소프트웨어에 책임지는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'specs',
    part: 'correct',
    title: '명세와 계약',
    en: 'Specifications & Contracts',
    lede: '함수 이름과 주석만으로는 무엇을 받고 무엇을 돌려줘야 하는지 분명하지 않습니다. 사전 조건과 사후 조건으로 함수의 약속을 적고, 약속을 어긴 쪽이 누구인지 가려내는 법을 봅니다.',
    learn: ['사전 조건과 사후 조건', '강한 명세와 약한 명세', '불변식과 방어적 프로그래밍'],
    Component: lazy(() => import('./lessons/Specs')),
  },
  {
    id: 'testing',
    part: 'correct',
    title: '테스트',
    en: 'Testing',
    lede: '테스트는 버그를 찾는 가장 싼 방법입니다. 입력 공간을 나눠 테스트 케이스를 고르고, 무작위 입력으로 성질을 확인하고, 커버리지가 말해 주는 것과 말해 주지 않는 것을 봅니다.',
    learn: ['입력 공간 나누기와 경계값', '단위 테스트와 테스트 피라미드', '성질 기반 테스트와 커버리지'],
    Component: lazy(() => import('./lessons/Testing')),
  },
  {
    id: 'types',
    part: 'correct',
    title: '타입으로 실수 막기',
    en: 'Catching Mistakes with Types',
    lede: 'undefined is not a function은 실행해 봐야 나옵니다. 타입은 이런 실수를 코드를 실행하기 전에 잡아 줍니다. TypeScript로 타입을 붙이고, null을 다루고, 불가능한 상태를 아예 표현할 수 없게 만듭니다.',
    learn: ['정적 타입과 동적 타입', 'null과 옵셔널, 유니언 타입', '불가능한 상태를 표현할 수 없게'],
    Component: lazy(() => import('./lessons/Types')),
  },
  {
    id: 'modules',
    part: 'change',
    title: '모듈과 추상화',
    en: 'Modules & Abstraction',
    lede: '장바구니 코드를 고쳤는데 결제 화면이 깨진다면 둘이 너무 얽혀 있는 것입니다. 내부를 숨기는 모듈, 바꿔 끼울 수 있는 인터페이스, 의존 관계 그래프로 결합도와 응집도를 봅니다.',
    learn: ['정보 은닉과 인터페이스', '결합도와 응집도', '의존 관계와 순환 의존'],
    Component: lazy(() => import('./lessons/Modules')),
  },
  {
    id: 'refactoring',
    part: 'change',
    title: '변경에 강한 설계와 리팩터링',
    en: 'Designing for Change & Refactoring',
    lede: '요구 사항은 늘 바뀝니다. 같은 코드가 여러 곳에 복사된 프로그램과 잘 나뉜 프로그램에 같은 변경을 해 보고, 동작은 그대로 두고 구조만 고치는 리팩터링을 테스트와 함께 한 단계씩 해 봅니다.',
    learn: ['중복과 변경 비용', '리팩터링 기법', '테스트가 지켜 주는 리팩터링'],
    Component: lazy(() => import('./lessons/Refactoring')),
  },
  {
    id: 'collaboration',
    part: 'together',
    title: '협업과 책임 있는 소프트웨어',
    en: 'Collaboration & Responsible Software',
    lede: '여러 사람이 같은 파일을 고치면 버전 관리가 필요합니다. 브랜치와 병합, 충돌과 코드 리뷰를 따라가고, 개인정보, 편향, 접근성처럼 소프트웨어가 사람에게 미치는 영향을 생각해 봅니다.',
    learn: ['커밋, 브랜치, 병합', '충돌 해결과 코드 리뷰', '개인정보, 편향, 접근성'],
    Component: lazy(() => import('./lessons/Collaboration')),
  },
];

const course: Course = {
  id: 'cs-software-design',
  subject: 'cs',
  title: '소프트웨어 설계',
  subtitle: '명세에서 협업까지',
  level: 2,
  prerequisites: ['cs-programming'],
  blurb: '혼자 한 번 쓰고 버리는 코드가 아니라, 여럿이 오래 고쳐 쓰는 코드를 만드는 법을 배웁니다. 명세와 계약, 테스트, 타입, 모듈과 추상화, 리팩터링, 버전 관리와 협업을 다루고, 소프트웨어가 사람과 사회에 미치는 책임까지 생각해 봅니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
