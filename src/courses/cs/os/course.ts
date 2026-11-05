import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'processes', title: '프로세스와 스케줄링', en: 'Processes & Scheduling', color: 'var(--c-cs-1)', blurb: '실행 중인 프로그램을 나누고, 누구에게 CPU를 줄지 정하는 법.' },
  { id: 'concurrency', title: '동시성', en: 'Concurrency', color: 'var(--c-cs-3)', blurb: '여러 흐름이 같은 데이터를 건드릴 때 생기는 문제와 막는 법.' },
  { id: 'storage', title: '메모리와 저장', en: 'Memory & Storage', color: 'var(--c-cs-4)', blurb: '프로그램마다 자기만의 메모리가 있는 것처럼 보이게 하고, 디스크에 파일을 담는 법.' },
  { id: 'protection', title: '보호와 보안', en: 'Protection & Security', color: 'var(--c-cs-2)', blurb: '프로그램이 커널과 다른 프로그램을 건드리지 못하게 막는 장치, 그리고 그 벽을 넘으려는 공격.' },
];

const lessons: Lesson[] = [
  {
    id: 'processes',
    part: 'processes',
    title: '프로세스와 스레드',
    en: 'Processes & Threads',
    lede: '운영체제는 실행 중인 프로그램마다 프로세스라는 상자를 만들어 서로를 떼어 놓습니다. 프로세스가 태어나고, 기다리고, 끝나는 과정과 문맥 교환, 그리고 상자를 같이 쓰는 스레드를 봅니다.',
    learn: ['프로세스의 상태와 전이', '문맥 교환과 그 비용', 'fork, exec, 그리고 스레드'],
    Component: lazy(() => import('./lessons/Processes')),
  },
  {
    id: 'scheduling',
    part: 'processes',
    title: 'CPU 스케줄링',
    en: 'CPU Scheduling',
    lede: 'CPU는 하나인데 실행을 기다리는 작업은 여럿입니다. 먼저 온 순서, 짧은 작업 먼저, 돌아가며 조금씩 나누어 주는 방식을 같은 작업 묶음에 적용해 대기 시간과 응답 시간을 비교합니다.',
    learn: ['FCFS, SJF, 라운드 로빈', '대기 시간과 응답 시간', '다단계 피드백 큐'],
    Component: lazy(() => import('./lessons/Scheduling')),
  },
  {
    id: 'locks',
    part: 'concurrency',
    title: '경쟁 조건과 락',
    en: 'Race Conditions & Locks',
    lede: '두 스레드가 같은 변수에 1씩 더했는데 결과가 2가 아니라 1일 수 있습니다. 명령어가 끼어드는 순서를 직접 바꿔 경쟁 조건을 만들고, 락과 교착 상태까지 따라갑니다.',
    learn: ['경쟁 조건과 임계 구역', '뮤텍스와 원자적 연산', '교착 상태의 네 가지 조건'],
    Component: lazy(() => import('./lessons/Locks')),
  },
  {
    id: 'virtual-memory',
    part: 'storage',
    title: '가상 메모리와 페이징',
    en: 'Virtual Memory & Paging',
    lede: '모든 프로그램은 자기가 메모리를 혼자 쓴다고 믿습니다. 가상 주소를 실제 주소로 바꾸는 페이지 테이블과 TLB, 메모리가 모자랄 때 어떤 페이지를 내보낼지 정하는 교체 알고리즘을 봅니다.',
    learn: ['페이지와 주소 변환', 'TLB와 페이지 폴트', 'FIFO, LRU, 시계 교체 알고리즘'],
    Component: lazy(() => import('./lessons/VirtualMemory')),
  },
  {
    id: 'file-systems',
    part: 'storage',
    title: '파일 시스템',
    en: 'File Systems',
    lede: '디스크는 번호 붙은 블록의 긴 줄일 뿐입니다. 그 위에 이름, 폴더, 크기가 제각각인 파일을 얹는 아이노드와 디렉터리 구조, 그리고 전원이 갑자기 꺼져도 망가지지 않게 하는 저널링을 봅니다.',
    learn: ['블록과 아이노드', '디렉터리와 경로 찾기', '충돌 복구와 저널링'],
    Component: lazy(() => import('./lessons/FileSystems')),
  },
  {
    id: 'protection',
    part: 'protection',
    title: '보호와 보안',
    en: 'Protection & Security',
    lede: '버그 있는 프로그램 하나가 컴퓨터 전체를 망가뜨리지 못하는 것은 CPU와 운영체제가 세운 벽 덕분입니다. 사용자 모드와 커널 모드, 시스템 호출을 따라가고, 버퍼 오버플로로 그 벽을 넘으려는 공격과 막는 장치를 봅니다.',
    learn: ['사용자 모드, 커널 모드, 시스템 호출', '버퍼 오버플로와 반환 주소 덮어쓰기', '스택 카나리아, 실행 금지 비트, ASLR, 최소 권한'],
    Component: lazy(() => import('./lessons/Protection')),
  },
];

const course: Course = {
  id: 'cs-operating-systems',
  subject: 'cs',
  title: '운영체제',
  subtitle: '프로세스에서 보안까지',
  level: 2,
  prerequisites: ['cs-architecture'],
  blurb: 'CPU 하나와 메모리 한 덩어리로 수십 개의 프로그램을 동시에 돌리는 소프트웨어를 다룹니다. 프로세스와 스레드, CPU 스케줄링, 경쟁 조건과 락, 가상 메모리와 페이징, 파일 시스템, 보호와 보안을 시뮬레이션으로 따라갑니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
