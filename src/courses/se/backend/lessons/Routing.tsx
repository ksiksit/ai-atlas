import { Planned } from '../../shared';

export default function Routing() {
  return (
    <Planned
      sections={['디스패처: 모든 요청이 들어오는 하나의 입구', '핸들러 매핑: 메서드와 주소 패턴으로 핸들러 고르기', '경로 변수, 쿼리, 요청 본문을 메서드 인자로 바꾸기', '패턴이 겹칠 때 더 구체적인 것을 고르는 규칙', 'Spring: @RestController, @GetMapping, @PathVariable, @RequestBody']}
      figures={['요청 줄을 적으면 라우터가 어느 핸들러를 고르고 인자에 무엇을 넣는지 보여 주는 작은 라우터', '/todos/{id}와 /todos/today처럼 겹치는 패턴의 우선순위 비교']}
    />
  );
}
