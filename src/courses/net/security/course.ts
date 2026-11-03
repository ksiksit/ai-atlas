import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'crypto', title: '암호의 기초', en: 'Cryptography Basics', color: 'var(--c-net-1)', blurb: '비밀을 지키고, 바뀌지 않았음을 확인하고, 상대가 누구인지 증명하는 도구들.' },
  { id: 'channel', title: '안전한 통로', en: 'Secure Channels', color: 'var(--c-net-2)', blurb: '도구를 조립해 엿듣고 끼어드는 네트워크 위에 안전한 길을 내는 법. TLS와 VPN.' },
  { id: 'attacks', title: '공격과 방어', en: 'Attacks & Defenses', color: 'var(--c-net-3)', blurb: '서비스를 멈추게 하거나 사용자를 속이는 공격이 통하는 이유와 막는 법.' },
];

const lessons: Lesson[] = [
  {
    id: 'symmetric',
    part: 'crypto',
    title: '대칭 암호와 해시',
    en: 'Symmetric Ciphers & Hashes',
    lede: '같은 열쇠로 잠그고 여는 대칭 암호는 빠르지만, 쓰는 방법을 틀리면 암호문에 평문의 무늬가 그대로 드러납니다. 블록 암호의 운용 방식과, 입력이 한 비트만 바뀌어도 출력이 완전히 달라지는 해시 함수를 봅니다.',
    learn: ['일회용 패드와 XOR', '블록 암호와 운용 방식', '해시, MAC, 인증 암호'],
    Component: lazy(() => import('./lessons/Symmetric')),
  },
  {
    id: 'public-key',
    part: 'crypto',
    title: '공개 키와 인증서',
    en: 'Public Keys & Certificates',
    lede: '처음 만난 상대와 어떻게 비밀 열쇠를 나누고, 그 상대가 진짜인지 어떻게 알까요? 작은 수로 RSA를 직접 계산해 보고, 브라우저가 인증서 사슬을 따라 올라가며 서버를 믿게 되는 과정을 봅니다.',
    learn: ['공개 키 암호와 RSA', '전자 서명', '인증서 사슬과 인증 기관'],
    Component: lazy(() => import('./lessons/PublicKey')),
  },
  {
    id: 'tls',
    part: 'channel',
    title: 'TLS 깊이 보기',
    en: 'TLS in Depth',
    lede: 'HTTPS의 자물쇠는 키 교환, 서명, 인증 암호를 한 번의 핸드셰이크로 엮은 결과입니다. 중간자가 끼어들 때 각 단계가 무엇을 막는지, 인증서 검사를 하나 빼면 무엇이 무너지는지 직접 확인합니다.',
    learn: ['TLS 1.3 핸드셰이크의 각 단계', '중간자 공격과 인증', '전방 비밀성과 HSTS'],
    Component: lazy(() => import('./lessons/Tls')),
  },
  {
    id: 'firewall-vpn',
    part: 'channel',
    title: '방화벽, NAT, VPN',
    en: 'Firewalls, NAT & VPNs',
    lede: '회사와 집의 네트워크 경계에서는 들어오고 나가는 패킷을 규칙으로 거르고, 주소를 바꾸고, 터널로 감쌉니다. 방화벽 규칙을 직접 평가해 보고, VPN이 패킷을 한 번 더 포장하는 모습을 봅니다.',
    learn: ['상태 기반 방화벽과 규칙 순서', 'NAT가 주소를 바꾸는 법', 'VPN 터널과 제로 트러스트'],
    Component: lazy(() => import('./lessons/FirewallVpn')),
  },
  {
    id: 'ddos',
    part: 'attacks',
    title: 'DDoS와 가용성',
    en: 'DDoS & Availability',
    lede: '서비스를 멈추게 하는 데는 비밀을 훔칠 필요가 없습니다. 서버가 감당할 수 없을 만큼 요청을 보내면 됩니다. SYN 플러드와 증폭 공격이 통하는 이유와, SYN 쿠키, 속도 제한, 애니캐스트로 버티는 법을 시뮬레이션합니다.',
    learn: ['자원 고갈과 SYN 플러드', '반사와 증폭 공격', '속도 제한과 분산 흡수'],
    Component: lazy(() => import('./lessons/Ddos')),
  },
  {
    id: 'web-security',
    part: 'attacks',
    title: '웹 보안',
    en: 'Web Security',
    lede: '웹의 공격 대부분은 데이터가 코드로 해석되거나, 브라우저가 남의 요청에 쿠키를 실어 보내는 데서 시작합니다. 동일 출처 정책, XSS, CSRF, SQL 삽입을 직접 재현해 보고, 비밀번호를 안전하게 저장하는 법을 봅니다.',
    learn: ['동일 출처 정책과 쿠키', 'XSS, CSRF, SQL 삽입', '비밀번호 해싱과 솔트'],
    Component: lazy(() => import('./lessons/WebSecurity')),
  },
];

const course: Course = {
  id: 'net-security',
  subject: 'net',
  title: '네트워크 보안',
  subtitle: '해시에서 웹 공격까지',
  level: 2,
  prerequisites: ['net-basics'],
  blurb: '엿듣고, 바꾸고, 사칭하고, 넘치게 하는 공격을 막는 원리를 봅니다. 대칭 암호와 해시, 공개 키와 인증서, TLS, 방화벽과 VPN, DDoS, 웹 보안을 작은 수와 시뮬레이션으로 직접 계산해 보며 다룹니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
