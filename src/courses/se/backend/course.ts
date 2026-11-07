import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'container', title: '객체 엮기', en: 'Wiring Objects', color: 'var(--c-se-1)', blurb: '객체를 누가 만들고 누가 이어 주는지. 프레임워크가 내 코드를 부르는 구조의 바탕.' },
  { id: 'web', title: '요청 받기', en: 'Handling Requests', color: 'var(--c-se-2)', blurb: 'HTTP 요청 하나가 서버에 들어와 내 메서드에 닿고, 응답이 되어 나가기까지.' },
  { id: 'data', title: '데이터 다루기', en: 'Working with Data', color: 'var(--c-se-3)', blurb: '객체와 테이블 사이를 오가는 법, 그리고 여러 변경을 한 덩어리로 묶는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'di',
    part: 'container',
    title: '의존성 주입과 IoC 컨테이너',
    en: 'Dependency Injection & IoC Containers',
    lede: '서비스 객체가 필요한 저장소를 스스로 new로 만들면, 저장소를 바꿀 때마다 서비스 코드를 고쳐야 합니다. 필요한 것을 밖에서 넣어 주는 의존성 주입과, 그 일을 대신 해 주는 컨테이너를 브라우저 안의 작은 컨테이너로 직접 돌려 봅니다.',
    learn: ['의존성 주입과 제어의 역전', '컨테이너가 객체를 만드는 순서', '빈이 없거나 둘이거나 순환할 때'],
    Component: lazy(() => import('./lessons/Di')),
  },
  {
    id: 'aop',
    part: 'container',
    title: '프록시와 AOP',
    en: 'Proxies & AOP',
    lede: '로그, 시간 재기, 트랜잭션처럼 여러 메서드에 똑같이 붙는 코드를 메서드마다 쓰지 않는 법입니다. 진짜 객체 앞에 선 프록시가 호출을 가로채는 모습을 보고, 같은 클래스 안에서 부르면 왜 적용되지 않는지 확인합니다.',
    learn: ['횡단 관심사', '프록시가 호출을 가로채는 방식', '자기 호출 함정'],
    Component: lazy(() => import('./lessons/Aop')),
  },
  {
    id: 'auto-config',
    part: 'container',
    title: '자동 구성',
    en: 'Auto-configuration',
    lede: '라이브러리 하나를 추가했을 뿐인데 데이터베이스 연결이 저절로 생깁니다. 클래스가 있는지, 설정 값이 있는지, 내가 직접 만든 빈이 있는지에 따라 어떤 빈이 켜지는지 조건을 하나씩 따라갑니다.',
    learn: ['조건부 빈', '스타터와 기본값', '내가 만든 빈이 기본값을 이기는 규칙'],
    Component: lazy(() => import('./lessons/AutoConfig')),
  },
  {
    id: 'routing',
    part: 'web',
    title: '요청과 라우팅',
    en: 'Requests & Routing',
    lede: 'GET /todos/42는 어떻게 getTodo(42)가 될까요. 주소 패턴을 메서드에 연결하는 라우터를 만들고, 경로 변수와 쿼리, 요청 본문이 메서드의 인자로 바뀌는 과정을 봅니다.',
    learn: ['디스패처와 핸들러 매핑', '경로 변수, 쿼리, 본문의 바인딩', '패턴이 겹칠 때 고르는 규칙'],
    Component: lazy(() => import('./lessons/Routing')),
  },
  {
    id: 'filters',
    part: 'web',
    title: '필터와 미들웨어 체인',
    en: 'Filters & Middleware Chains',
    lede: '로그인 확인, 요청 기록, 오류 처리는 모든 요청이 지나는 길목에서 합니다. 요청이 필터 체인을 한 칸씩 지나가고 응답이 거꾸로 돌아오는 모습을 단계별로 보며, 순서를 바꾸면 무엇이 달라지는지 확인합니다.',
    learn: ['필터 체인과 실행 순서', '체인을 중간에 끊는 필터', '전역 예외 처리'],
    Component: lazy(() => import('./lessons/Filters')),
  },
  {
    id: 'orm',
    part: 'data',
    title: 'ORM과 N+1 문제',
    en: 'ORM & the N+1 Problem',
    lede: '객체를 다루듯 데이터베이스를 다루게 해 주는 ORM은 편하지만, 보이지 않는 곳에서 쿼리를 수백 번 보낼 수 있습니다. 실제로 나가는 쿼리를 세어 보며 지연 로딩과 페치 조인의 차이를 봅니다.',
    learn: ['엔티티와 테이블의 대응', '지연 로딩과 즉시 로딩', 'N+1 문제와 페치 조인'],
    Component: lazy(() => import('./lessons/Orm')),
  },
  {
    id: 'transactions',
    part: 'data',
    title: '트랜잭션 경계',
    en: 'Transaction Boundaries',
    lede: '주문은 저장됐는데 재고는 줄지 않았다면 큰일입니다. 여러 변경을 한 트랜잭션으로 묶는 경계를 어디에 둘지, 안쪽 메서드가 실패하면 바깥은 어떻게 되는지 전파 방식을 바꿔 가며 실험합니다.',
    learn: ['서비스 계층의 트랜잭션 경계', '전파 방식(REQUIRED, REQUIRES_NEW)', '롤백 규칙과 예외'],
    Component: lazy(() => import('./lessons/Transactions')),
  },
];

const course: Course = {
  id: 'se-backend',
  subject: 'se',
  title: '웹 백엔드 개발',
  subtitle: '의존성 주입에서 트랜잭션까지',
  level: 2,
  prerequisites: ['se-basics', 'cs-databases'],
  blurb: '요청을 받아 데이터를 읽고 쓰고 응답하는 서버를 만드는 원리를 배웁니다. 의존성 주입과 프록시, 라우팅과 필터 체인, ORM과 트랜잭션을 브라우저 안의 작은 모형으로 직접 돌려 보고, 같은 개념이 Spring Boot에서는 어떤 코드가 되는지 나란히 봅니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
