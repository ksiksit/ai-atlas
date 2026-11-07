import { Planned } from '../../shared';

export default function Observability() {
  return (
    <Planned
      sections={['로그, 지표, 추적: 무엇을 언제 쓰나', '구조화된 로그', '평균이 숨기는 것: p50, p95, p99', '경보 설계: 너무 자주도 너무 늦게도 울리지 않게', '서비스 수준 목표(SLO)와 오류 예산']}
      figures={['응답 시간 분포를 바꾸며 평균과 백분위수가 어떻게 달라지는지 보기', '경보 임계값과 지속 시간을 바꾸며 놓친 장애와 헛경보 세기']}
    />
  );
}
