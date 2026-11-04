import type { Major } from './types';

/**
 * Majors (전공), in the order the home page lists them. A course can belong to several majors.
 * 전공기초 (base) are courses from another subject worth taking first; 전공필수 (core) are the
 * major itself; 전공선택 (elect) are optional. Within each role the chart orders courses by level.
 */
export const MAJORS: Major[] = [
  {
    id: 'ai',
    name: '인공지능 전공',
    en: 'Artificial Intelligence',
    subject: 'ai',
    blurb: '벡터와 확률에서 출발해 신경망과 딥러닝을 거쳐, 대형 언어 모델을 만들고 쓰는 법까지 갑니다.',
    tagline: '컴퓨터가 스스로 배우는 원리에서 대형 언어 모델까지',
    field: '공학',
    courses: [
      { course: 'stats-basics', role: 'base' },
      { course: 'cs-algorithms', role: 'base' },
      { course: 'ai-basics', role: 'core' },
      { course: 'ai-deep-learning', role: 'core' },
      { course: 'ai-llm', role: 'core' },
    ],
  },
  {
    id: 'cs',
    name: '컴퓨터과학 전공',
    en: 'Computer Science',
    subject: 'cs',
    blurb: '알고리즘을 읽고, 직접 설계하고, 데이터베이스와 캐시와 Git 같은 실제 시스템 안에서 다시 만나는 과정입니다.',
    tagline: '알고리즘을 설계하고, 실제 시스템 안에서 다시 만납니다',
    field: '공학',
    courses: [
      { course: 'cs-algorithms', role: 'core' },
      { course: 'cs-algorithm-design', role: 'core' },
      { course: 'cs-system-algorithms', role: 'core' },
      { course: 'net-basics', role: 'elect' },
    ],
  },
  {
    id: 'net',
    name: '네트워크·보안 전공',
    en: 'Networking & Security',
    subject: 'net',
    blurb: '패킷이 오가는 원리에서 시작해, 암호와 TLS로 안전한 통로를 만들고 공격을 막는 법까지 다룹니다.',
    tagline: '데이터가 오가는 길과 그 길을 지키는 법',
    field: '공학',
    courses: [
      { course: 'cs-algorithms', role: 'base' },
      { course: 'net-basics', role: 'core' },
      { course: 'net-security', role: 'core' },
    ],
  },
];
