import { Planned } from '../../shared';

export default function Build() {
  return (
    <Planned
      sections={['소스 파일에서 실행 파일까지: 컴파일, 묶기, 압축', '빌드를 작업의 의존 관계 그래프로 보기 (위상 정렬)', '증분 빌드: 바뀐 파일과 그 영향을 받는 작업만 다시', '빌드 캐시가 틀리는 경우와 재현 가능한 빌드', '실제 도구: Gradle, Maven, Vite']}
      figures={['파일 하나를 고치면 다시 실행되는 작업이 그래프에 칠해지는 빌드 그래프', '수정 시각 비교와 내용 해시 비교로 변경을 감지해 보고 결과가 갈리는 경우 찾기']}
    />
  );
}
