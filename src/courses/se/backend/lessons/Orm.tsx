import { Planned } from '../../shared';

export default function Orm() {
  return (
    <Planned
      sections={['객체와 테이블의 차이: 참조와 외래 키', '엔티티 매핑과 영속성 컨텍스트', '지연 로딩과 즉시 로딩', 'N+1 문제: 목록 하나에 쿼리 101번', '페치 조인과 배치 로딩으로 고치기', 'Spring Data JPA: @Entity, @OneToMany, @EntityGraph']}
      figures={['데이터베이스 과목의 쿼리 엔진 위에서 ORM 코드가 실제로 보내는 SQL을 세어 보는 쿼리 기록기', '할 일 개수를 늘리며 지연 로딩, 페치 조인, 배치 로딩의 쿼리 수와 읽은 행 수 비교']}
      note={<>조인의 원리는 <a href="#cs-databases">데이터베이스</a> 과목에서 먼저 다룹니다.</>}
    />
  );
}
