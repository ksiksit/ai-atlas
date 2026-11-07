import { Planned } from '../../shared';

export default function HttpApi() {
  return (
    <Planned
      sections={['자원과 주소: /todos, /todos/42', '메서드(GET, POST, PUT, PATCH, DELETE)와 상태 코드', '멱등성: 같은 요청을 두 번 보내면 무슨 일이 생기나', '오류 응답과 입력 검증', 'API 버전 관리와 하위 호환']}
      figures={['브라우저 안에서 도는 작은 할 일 API에 요청을 직접 보내고 응답과 저장소 상태를 보기', '응답이 사라진 상황에서 재시도할 때 멱등 키가 있을 때와 없을 때 비교']}
    />
  );
}
