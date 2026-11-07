import { Planned } from '../../shared';

export default function Filters() {
  return (
    <Planned
      sections={['모든 요청이 지나는 길목: 필터와 미들웨어', '체인: 다음으로 넘기기, 중간에 끊기, 돌아오며 응답 고치기', '순서가 중요한 이유: 인증 전에 로그를 남길까 뒤에 남길까', '예외를 한곳에서 응답으로 바꾸기', 'Spring: Filter, HandlerInterceptor, @ControllerAdvice, Spring Security 필터 체인']}
      figures={['필터 순서를 끌어 바꾸고 요청을 보내 각 필터의 전과 후가 실행되는 순서를 보는 체인 시뮬레이터', '인증 필터가 체인을 끊을 때 뒤의 필터와 컨트롤러가 실행되지 않는 모습']}
    />
  );
}
