import { lazy } from 'react';
import type { Course, Lesson, Part } from '../../types';

const parts: Part[] = [
  { id: 'packets', title: '패킷과 주소', en: 'Packets & Addresses', color: 'var(--c-net-1)', blurb: '데이터를 작은 패킷으로 나누고, 주소를 보고 한 칸씩 목적지까지 옮기는 법.' },
  { id: 'transport', title: '믿을 수 있는 전달', en: 'Reliable Delivery', color: 'var(--c-net-2)', blurb: '패킷이 사라지고 뒤섞이는 네트워크 위에서 빠짐없이, 그리고 서로 양보하며 보내는 법. TCP.' },
  { id: 'web', title: '웹이 동작하는 길', en: 'How the Web Works', color: 'var(--c-net-3)', blurb: '주소창에 이름을 입력하고 페이지가 뜨기까지. DNS와 HTTP, HTTPS.' },
];

const lessons: Lesson[] = [
  {
    id: 'layers',
    part: 'packets',
    title: '패킷과 계층',
    en: 'Packets & Layers',
    lede: '동영상도 메시지도 인터넷에서는 1,500바이트 안팎의 작은 패킷으로 쪼개져 오갑니다. 데이터를 패킷으로 나누고 계층마다 헤더를 붙여 보내는 과정을 따라가고, 전송 시간이 어디서 생기는지 잽니다.',
    learn: ['패킷 교환과 캡슐화', 'TCP/IP 계층이 맡는 일', '대역폭과 지연 시간은 다르다'],
    Component: lazy(() => import('./lessons/Layers')),
  },
  {
    id: 'ip-routing',
    part: 'packets',
    title: 'IP 주소와 라우팅',
    en: 'IP Addresses & Routing',
    lede: '패킷에는 목적지 IP 주소만 적혀 있습니다. 라우터는 세상의 모든 주소를 외우는 대신 주소의 앞부분(프리픽스)만 보고 다음에 보낼 곳을 고릅니다. 서브넷을 계산하고, 링크가 끊겼을 때 경로가 다시 계산되는 것을 봅니다.',
    learn: ['IPv4 주소와 CIDR 프리픽스', '가장 긴 프리픽스 일치', '링크 상태 라우팅과 다익스트라'],
    Component: lazy(() => import('./lessons/IpRouting')),
  },
  {
    id: 'tcp',
    part: 'transport',
    title: 'TCP와 신뢰성 있는 전송',
    en: 'TCP & Reliable Transfer',
    lede: 'IP는 패킷이 사라지거나 순서가 뒤바뀌어도 책임지지 않습니다. TCP는 번호와 확인 응답, 재전송으로 그 위에 빠짐없고 순서대로인 바이트 흐름을 만듭니다.',
    learn: ['3-way 핸드셰이크', '순서 번호, ACK, 재전송', '슬라이딩 윈도와 처리량'],
    Component: lazy(() => import('./lessons/Tcp')),
  },
  {
    id: 'congestion',
    part: 'transport',
    title: '혼잡 제어',
    en: 'Congestion Control',
    lede: '모두가 최대한 빨리 보내면 라우터의 버퍼가 넘쳐 모두가 느려집니다. TCP는 패킷 손실을 신호로 삼아 보내는 양을 스스로 조절합니다. 톱니 모양의 AIMD가 여러 연결 사이에 대역폭을 공평하게 나누는 과정을 봅니다.',
    learn: ['느린 시작과 혼잡 회피', 'AIMD가 공평해지는 이유', '버퍼와 지연: 버퍼블로트'],
    Component: lazy(() => import('./lessons/Congestion')),
  },
  {
    id: 'dns',
    part: 'web',
    title: 'DNS: 이름을 주소로',
    en: 'DNS',
    lede: '브라우저에 www.example.com을 입력하면 먼저 그 이름의 IP 주소를 알아내야 합니다. 루트에서 시작해 이름의 계층을 따라 내려가는 DNS 질의와, 그 질의 대부분을 없애 주는 캐시를 봅니다.',
    learn: ['도메인 이름의 계층 구조', '재귀 리졸버의 반복 질의', 'TTL과 캐시'],
    Component: lazy(() => import('./lessons/Dns')),
  },
  {
    id: 'http',
    part: 'web',
    title: 'HTTP와 HTTPS',
    en: 'HTTP & HTTPS',
    lede: '주소창에 URL을 입력하고 첫 바이트가 도착하기까지 네트워크를 몇 번 왕복할까요? DNS, TCP, TLS, HTTP 요청을 시간 순서대로 펼쳐 보고, HTTP/2와 HTTP/3가 왕복과 기다림을 줄이는 방법을 봅니다.',
    learn: ['요청과 응답의 구조', 'TLS 핸드셰이크와 키 교환', 'HTTP/1.1, HTTP/2, HTTP/3의 차이'],
    Component: lazy(() => import('./lessons/Http')),
  },
];

const course: Course = {
  id: 'net-basics',
  subject: 'net',
  title: '기초 네트워크',
  subtitle: '패킷에서 HTTPS까지',
  level: 1,
  prerequisites: ['cs-algorithms'],
  aliases: ['cs-networks'],
  blurb: '웹 페이지 하나가 화면에 뜨기까지 네트워크에서 일어나는 일을 아래 계층부터 따라갑니다. 패킷과 계층, IP 주소와 라우팅, TCP의 재전송과 혼잡 제어, DNS, HTTP와 HTTPS를 브라우저 안의 시뮬레이션으로 직접 돌려 봅니다.',
  parts,
  lessons,
  Cover: lazy(() => import('./Cover')),
};

export default course;
