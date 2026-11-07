import { Planned } from '../../shared';

export default function AutoConfig() {
  return (
    <Planned
      sections={['스타터: 라이브러리 묶음과 기본 설정', '조건부 빈: 클래스가 있을 때, 설정이 있을 때, 빈이 없을 때', '내가 만든 빈이 자동 구성을 이기는 규칙', '자동 구성 보고서로 무엇이 왜 켜졌는지 확인하기', 'Spring Boot: @ConditionalOnClass, @ConditionalOnMissingBean, application.yml']}
      figures={['의존성과 설정 값을 켜고 끄며 어떤 자동 구성 빈이 켜지는지 계산하는 조건 평가기', '직접 만든 DataSource를 등록하면 기본 DataSource가 물러나는 모습']}
      note={<>설정 값의 우선순위는 기초 소프트웨어공학의 <a href="#se-basics/config">설정과 환경</a>에서 먼저 다룹니다.</>}
    />
  );
}
