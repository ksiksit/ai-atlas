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
    blurb: '비트와 논리 게이트로 CPU를 쌓아 올리고, 그 위에서 도는 운영체제와 데이터베이스를 들여다본 뒤, 알고리즘을 설계하고 계산의 한계까지 묻는 과정입니다.',
    tagline: '비트와 CPU에서 운영체제, 데이터베이스, 계산의 한계까지',
    field: '공학',
    courses: [
      { course: 'stats-basics', role: 'base' },
      { course: 'cs-algorithms', role: 'core' },
      { course: 'cs-architecture', role: 'core' },
      { course: 'cs-algorithm-design', role: 'core' },
      { course: 'cs-operating-systems', role: 'core' },
      { course: 'cs-databases', role: 'core' },
      { course: 'cs-system-algorithms', role: 'core' },
      { course: 'cs-computation', role: 'core' },
      { course: 'net-basics', role: 'elect' },
      { course: 'net-security', role: 'elect' },
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
