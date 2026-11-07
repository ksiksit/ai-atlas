import { Planned } from '../../shared';

export default function Transactions() {
  return (
    <Planned
      sections={['한 덩어리로 성공하거나 실패해야 하는 변경', '트랜잭션 경계를 서비스 메서드에 두는 이유', '전파 방식: REQUIRED와 REQUIRES_NEW', '롤백 규칙: 어떤 예외에서 되돌리나', '트랜잭션 안에서 외부 API를 부르면 생기는 일', 'Spring: @Transactional의 프록시와 그 한계']}
      figures={['주문과 재고 감소를 여러 메서드로 나누고 전파 방식과 실패 지점을 바꿔 최종 데이터 상태를 확인하는 실험', '프록시를 거치지 않는 자기 호출에서 @Transactional이 무시되는 경우']}
      note={<>격리 수준과 로그를 이용한 복구는 <a href="#cs-databases/transactions">데이터베이스의 트랜잭션 장</a>에서 다룹니다.</>}
    />
  );
}
