import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'query', title: '질문하기', en: 'Querying', color: 'var(--c-cs-1)', blurb: '표로 데이터를 담고 SQL로 원하는 것만 꺼내는 법.' },
  { id: 'design', title: '빠르고 바르게', en: 'Speed & Design', color: 'var(--c-cs-2)', blurb: '쿼리를 빠르게 하는 인덱스와, 데이터가 꼬이지 않게 표를 나누는 법.' },
  { id: 'transactions', title: '동시에 고치기', en: 'Transactions', color: 'var(--c-cs-3)', blurb: '여러 사용자가 동시에 쓰고 고쳐도 데이터를 지키는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'relational-sql',
    part: 'query',
    title: '관계형 모델과 SQL',
    en: 'The Relational Model & SQL',
    lede: '데이터베이스는 데이터를 행과 열로 된 표에 담습니다. SELECT, WHERE, GROUP BY를 작은 표에 직접 실행해 보고, SQL 한 줄이 어떤 단계를 거쳐 결과가 되는지 따라갑니다.',
    learn: ['테이블, 행, 열, 기본 키', 'SELECT, WHERE, ORDER BY', 'GROUP BY와 집계'],
    Component: lazy(() => import('./lessons/RelationalSql')),
  },
  {
    id: 'joins',
    part: 'query',
    title: '조인',
    en: 'Joins',
    lede: '주문 표에는 고객 번호만 있고 이름은 고객 표에 있습니다. 두 표를 키로 이어 붙이는 조인의 종류와, 데이터베이스가 실제로 조인을 계산하는 세 가지 방법을 비교합니다.',
    learn: ['내부 조인과 외부 조인', '중첩 루프, 해시, 병합 조인', '조인 순서와 비용'],
    Component: lazy(() => import('./lessons/Joins')),
  },
  {
    id: 'indexes',
    part: 'design',
    title: '인덱스와 쿼리 계획',
    en: 'Indexes & Query Plans',
    lede: '같은 쿼리가 인덱스 하나로 1만 배 빨라지기도 하고, 인덱스가 있어도 쓰이지 않기도 합니다. 전체 스캔과 인덱스 탐색의 비용을 비교하고, 데이터베이스가 계획을 고르는 기준을 봅니다.',
    learn: ['전체 스캔과 인덱스 탐색', '선택도와 쿼리 계획', '복합 인덱스와 열 순서'],
    Component: lazy(() => import('./lessons/Indexes')),
  },
  {
    id: 'normalization',
    part: 'design',
    title: '정규화',
    en: 'Normalization',
    lede: '한 표에 모든 것을 담으면 처음엔 편하지만, 주소 하나를 고치려고 수백 행을 고쳐야 하는 날이 옵니다. 이상 현상을 직접 일으켜 보고, 함수 종속성을 따라 표를 나눕니다.',
    learn: ['삽입·수정·삭제 이상', '함수 종속성', '1NF, 2NF, 3NF로 나누기'],
    Component: lazy(() => import('./lessons/Normalization')),
  },
  {
    id: 'transactions',
    part: 'transactions',
    title: '트랜잭션과 동시성 제어',
    en: 'Transactions & Concurrency Control',
    lede: '계좌 이체는 출금과 입금이 함께 일어나거나 둘 다 일어나지 않아야 합니다. 두 트랜잭션의 실행 순서를 바꿔 가며 갱신 손실과 더티 읽기를 만들고, 락과 MVCC가 이를 막는 방식을 봅니다.',
    learn: ['ACID', '격리 수준과 이상 현상', '2단계 락킹과 MVCC, 로그'],
    Component: lazy(() => import('./lessons/Transactions')),
  },
];

const course: Course = {
  id: 'cs-databases',
  subject: 'cs',
  title: '데이터베이스',
  subtitle: '테이블에서 트랜잭션까지',
  level: 2,
  prerequisites: ['cs-algorithms'],
  blurb: '데이터를 표로 담고, 질문하고, 여러 사람이 동시에 고쳐도 망가지지 않게 지키는 법을 배웁니다. 관계형 모델과 SQL, 조인, 인덱스와 쿼리 계획, 정규화, 트랜잭션과 동시성 제어를 직접 쿼리를 돌려 보며 따라갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
