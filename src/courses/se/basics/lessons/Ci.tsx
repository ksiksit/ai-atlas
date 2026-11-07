import { Planned } from '../../shared';

export default function Ci() {
  return (
    <Planned
      sections={['지속적 통합: 커밋마다 기계가 검사하기', '파이프라인과 단계: 설치, 빌드, 테스트, 검사', '병렬화와 캐시로 파이프라인 빠르게 하기', '불안정한(flaky) 테스트와 그 비용', '실제 도구: GitHub Actions']}
      figures={['단계를 나누고 병렬로 돌리며 전체 시간을 재는 파이프라인 시뮬레이터', '씨앗이 정해진 난수로 가끔 실패하는 테스트가 섞일 때 팀이 빨간 불을 믿지 않게 되는 과정']}
    />
  );
}
