import { Planned } from '../../shared';

export default function Config() {
  return (
    <Planned
      sections={['코드에 박힌 값이 문제가 되는 순간', '설정 파일, 환경 변수, 명령줄 인자', '환경별 설정(dev, test, prod)과 덮어쓰기 우선순위', '비밀 값: 저장소에 넣지 않기, 비밀 저장소', '기능 플래그']}
      figures={['여러 설정 출처를 켜고 끄며 최종 값이 어디서 왔는지 따라가는 우선순위 계산기', '커밋 기록에 남은 비밀 값을 찾아보는 스캐너']}
      note="Spring Boot의 application.yml과 프로필(profile)이 이 장의 개념을 그대로 씁니다."
    />
  );
}
