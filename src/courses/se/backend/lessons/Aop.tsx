import { Planned } from '../../shared';

export default function Aop() {
  return (
    <Planned
      sections={['횡단 관심사: 로그, 시간 재기, 권한 검사, 트랜잭션', '프록시 패턴: 진짜 객체 앞에 선 대리인', '어드바이스와 포인트컷: 무엇을 어디에 끼울까', '자기 호출 함정: this.method()는 프록시를 거치지 않는다', 'Spring: @Aspect, @Around, @Transactional이 프록시인 이유']}
      figures={['메서드 호출이 프록시를 지나며 앞뒤로 어드바이스가 실행되는 순서를 한 단계씩 보기', '같은 클래스 안에서 부를 때와 다른 빈을 거쳐 부를 때 어드바이스가 붙는지 비교']}
    />
  );
}
