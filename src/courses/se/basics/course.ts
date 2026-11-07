import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'toolchain', title: '코드에서 프로그램까지', en: 'From Code to Program', color: 'var(--c-se-1)', blurb: '남이 만든 패키지를 가져다 쓰고, 소스 파일 여러 개를 실행할 수 있는 프로그램 하나로 묶는 법.' },
  { id: 'service', title: '서비스 만들기', en: 'Building a Service', color: 'var(--c-se-2)', blurb: '다른 프로그램이 부를 수 있는 HTTP API를 설계하고, 같은 코드가 여러 환경에서 돌게 하는 법.' },
  { id: 'ship', title: '내보내고 운영하기', en: 'Shipping & Running', color: 'var(--c-se-3)', blurb: '고친 코드를 자동으로 검사해 사용자에게 내보내고, 돌아가는 서비스를 지켜보는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'packages',
    part: 'toolchain',
    title: '패키지와 의존성 관리',
    en: 'Packages & Dependency Management',
    lede: '요즘 프로그램은 대부분 남이 만든 패키지 위에 서 있습니다. 버전 번호가 약속하는 것, ^1.2.0 같은 범위가 실제로 고르는 버전, 어제 되던 빌드가 오늘 깨지는 이유와 잠금 파일이 그것을 막는 방법을 봅니다.',
    learn: ['유의적 버전(SemVer)의 약속', '버전 범위: ^, ~, x', '잠금 파일과 재현 가능한 설치'],
    Component: lazy(() => import('./lessons/Packages')),
  },
  {
    id: 'build',
    part: 'toolchain',
    title: '빌드와 증분 빌드',
    en: 'Builds & Incremental Builds',
    lede: '파일 하나를 고쳤는데 전체를 다시 빌드할 필요는 없습니다. 빌드를 작업의 의존 관계 그래프로 보고, 바뀐 것만 다시 만드는 증분 빌드와 캐시가 언제 맞고 언제 틀리는지 봅니다.',
    learn: ['빌드 그래프와 작업 순서', '증분 빌드와 변경 감지', '빌드 캐시와 재현성'],
    Component: lazy(() => import('./lessons/Build')),
  },
  {
    id: 'http-api',
    part: 'service',
    title: 'HTTP API 설계',
    en: 'Designing HTTP APIs',
    lede: '서비스는 다른 프로그램이 부를 수 있는 API로 바깥과 이야기합니다. 자원과 메서드로 API를 설계하고, 상태 코드로 결과를 알리고, 같은 요청을 두 번 보내도 안전한지 따져 봅니다.',
    learn: ['자원, 메서드, 상태 코드', '멱등성과 재시도', 'API 버전 관리와 하위 호환'],
    Component: lazy(() => import('./lessons/HttpApi')),
  },
  {
    id: 'config',
    part: 'service',
    title: '설정과 환경',
    en: 'Configuration & Environments',
    lede: '같은 코드가 개발자 노트북, 테스트 서버, 실제 서비스에서 각각 다른 데이터베이스와 키를 써야 합니다. 설정을 코드에서 떼어 내고, 환경마다 값을 덮어쓰고, 비밀 값을 지키는 법을 봅니다.',
    learn: ['코드와 설정의 분리', '환경별 설정과 우선순위', '비밀 값 다루기'],
    Component: lazy(() => import('./lessons/Config')),
  },
  {
    id: 'ci',
    part: 'ship',
    title: '지속적 통합',
    en: 'Continuous Integration',
    lede: '커밋할 때마다 기계가 설치, 빌드, 테스트를 대신 돌려 줍니다. 파이프라인의 단계를 나누고, 느린 파이프라인을 빠르게 만들고, 가끔만 실패하는 테스트가 팀을 어떻게 지치게 하는지 봅니다.',
    learn: ['파이프라인과 단계', '병렬화와 캐시', '불안정한 테스트'],
    Component: lazy(() => import('./lessons/Ci')),
  },
  {
    id: 'deploy',
    part: 'ship',
    title: '배포와 롤백',
    en: 'Deployment & Rollback',
    lede: '새 버전을 한 번에 모든 사용자에게 내보내면 버그도 한 번에 모두에게 갑니다. 블루-그린 배포와 카나리 배포로 위험을 나누고, 문제가 생겼을 때 얼마나 빨리 되돌릴 수 있는지 시뮬레이션합니다.',
    learn: ['한꺼번에 배포와 점진적 배포', '블루-그린과 카나리', '롤백과 데이터베이스 변경'],
    Component: lazy(() => import('./lessons/Deploy')),
  },
  {
    id: 'observability',
    part: 'ship',
    title: '로그와 모니터링',
    en: 'Logs & Monitoring',
    lede: '서비스가 느려졌다는 연락은 보통 사용자에게서 먼저 옵니다. 로그와 지표로 서비스 안을 들여다보고, 평균 대신 백분위수를 보고, 너무 자주도 너무 늦게도 울리지 않는 경보를 만듭니다.',
    learn: ['로그, 지표, 추적', '평균과 백분위수(p50, p99)', '경보와 서비스 수준 목표(SLO)'],
    Component: lazy(() => import('./lessons/Observability')),
  },
];

const course: Course = {
  id: 'se-basics',
  subject: 'se',
  title: '기초 소프트웨어공학',
  subtitle: '패키지에서 배포까지',
  level: 1,
  prerequisites: ['cs-programming'],
  blurb: '짠 코드가 실제 서비스가 되기까지 거치는 길을 따라갑니다. 패키지와 의존성, 빌드, HTTP API, 설정과 환경, 지속적 통합, 배포와 롤백, 로그와 모니터링을 다룹니다. 특정 프레임워크에 묶이지 않는 원리를 배우고, 다음 과목들에서 Spring Boot 같은 프레임워크로 넓혀 갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
