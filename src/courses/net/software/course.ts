import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'design', title: '설계에서 막기', en: 'Secure by Design', color: 'var(--c-net-1)', blurb: '코드를 쓰기 전에 무엇을 지킬지 정하고, 누가 누구인지 확인하고, 누가 무엇을 할 수 있는지 정하는 법.' },
  { id: 'find', title: '찾고 지키기', en: 'Finding & Guarding', color: 'var(--c-net-3)', blurb: '이미 쓴 코드에서 취약점을 기계적으로 찾고, 남이 쓴 코드를 가져올 때 생기는 위험을 줄이는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'threat-modeling',
    part: 'design',
    title: '위협 모델링',
    en: 'Threat Modeling',
    lede: '모든 것을 다 막을 수는 없으니, 무엇을 누구로부터 지킬지 먼저 정해야 합니다. 작은 서비스의 데이터 흐름도를 그리고, STRIDE로 위협을 찾고, 공격 트리와 위험 점수로 무엇부터 막을지 정합니다.',
    learn: ['자산, 공격자, 신뢰 경계', 'STRIDE로 위협 찾기', '공격 트리와 위험의 우선순위'],
    Component: lazy(() => import('./lessons/ThreatModeling')),
  },
  {
    id: 'authentication',
    part: 'design',
    title: '인증: 비밀번호 너머',
    en: 'Authentication Beyond Passwords',
    lede: '비밀번호는 유출되고, 재사용되고, 피싱으로 빼앗깁니다. 무차별 대입과 크리덴셜 스터핑의 비용을 계산하고, 일회용 코드(TOTP)를 직접 만들어 보고, 패스키가 피싱을 막는 원리를 봅니다.',
    learn: ['무차별 대입, 크리덴셜 스터핑, 속도 제한', 'TOTP와 다중 인증', '패스키와 피싱 저항'],
    Component: lazy(() => import('./lessons/Authentication')),
  },
  {
    id: 'access-control',
    part: 'design',
    title: '접근 제어',
    en: 'Access Control',
    lede: '로그인한 사용자라고 모든 것을 해도 되는 것은 아닙니다. 접근 제어 목록과 역할 기반 접근 제어를 설계해 보고, 주소의 번호만 바꿔 남의 데이터를 보는 권한 확인 누락과 혼동된 대리인 문제를 고칩니다.',
    learn: ['인증과 인가의 차이', 'ACL, RBAC, 속성 기반 접근 제어', '권한 확인 누락(IDOR)과 혼동된 대리인'],
    Component: lazy(() => import('./lessons/AccessControl')),
  },
  {
    id: 'fuzzing',
    part: 'find',
    title: '퍼징',
    en: 'Fuzzing',
    lede: '프로그램에 이상한 입력을 수백만 개 넣어 보면 사람이 생각하지 못한 버그가 나옵니다. 작은 파서에 무작위 퍼저, 변이 퍼저, 커버리지 기반 퍼저를 차례로 돌려, 같은 시간에 몇 개의 경로와 버그를 찾는지 비교합니다.',
    learn: ['무작위 입력과 변이', '코드 커버리지로 이끄는 퍼징', '새니타이저와 버그 최소화'],
    Component: lazy(() => import('./lessons/Fuzzing')),
  },
  {
    id: 'static-analysis',
    part: 'find',
    title: '정적 분석과 오염 추적',
    en: 'Static Analysis & Taint Tracking',
    lede: '코드를 실행하지 않고도, 사용자 입력이 검증 없이 위험한 함수에 닿는 길을 찾을 수 있습니다. 작은 프로그램에서 오염된 값이 흘러가는 경로를 추적하고, 경고가 너무 많거나 너무 적은 분석기의 맞바꿈을 봅니다.',
    learn: ['출발점, 도착점, 정화 함수', '데이터 흐름을 따라가는 오염 추적', '거짓 양성과 거짓 음성의 맞바꿈'],
    Component: lazy(() => import('./lessons/StaticAnalysis')),
  },
  {
    id: 'supply-chain',
    part: 'find',
    title: '의존성과 공급망 보안',
    en: 'Dependencies & Supply-Chain Security',
    lede: '오늘날 프로그램 코드의 대부분은 남이 쓴 라이브러리입니다. 의존성 트리를 펼쳐 알려진 취약점이 어디까지 번지는지 보고, 잠금 파일, 해시 고정, 서명, 소프트웨어 자재 명세서(SBOM)로 위험을 줄이는 법을 봅니다.',
    learn: ['직접 의존성과 간접 의존성', '취약점 공지와 버전 범위', '잠금 파일, 서명, SBOM'],
    Component: lazy(() => import('./lessons/SupplyChain')),
  },
];

const course: Course = {
  id: 'net-software-security',
  subject: 'net',
  title: '소프트웨어 보안',
  subtitle: '위협 모델링에서 공급망까지',
  level: 2,
  prerequisites: ['net-security'],
  blurb: '안전한 소프트웨어를 만들고 지키는 법을 다룹니다. 위협 모델링, 인증과 접근 제어를 설계하고, 퍼징과 정적 분석으로 취약점을 찾고, 남이 쓴 코드를 안전하게 가져오는 법을 시뮬레이션으로 따라갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
