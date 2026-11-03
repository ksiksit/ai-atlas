# 아틀라스

직접 움직여 보는 지식의 지도. 여러 분야의 과목을 그림을 직접 움직이며 배우는 인터랙티브 교과서입니다. 첫 화면(서재)에서 분야와 난이도에 맞는 과목을 골라 공부합니다.
모든 시각화와 학습(신경망 훈련 포함)은 브라우저 안에서 계산됩니다. 읽은 장 기록은 브라우저의 localStorage에만 저장됩니다.

**사이트:** https://ksiksit.github.io/ai-atlas/

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
```

## 빌드

```bash
npm run build           # dist/ — 일반 정적 사이트 (어느 정적 호스팅에나 업로드 가능)
npm run build:single    # dist-single/index.html — 파일 하나로 된 버전 (더블클릭으로 열 수 있음)
```

## 배포

`main` 브랜치에 푸시하면 GitHub Actions(`.github/workflows/deploy.yml`)가 빌드해서 GitHub Pages에 자동으로 배포합니다.

## 구성

콘텐츠는 **분야 → 과목 → 파트 → 장**으로 나뉩니다.

| 분야 | 과목 | 난이도 | 주소 |
| --- | --- | --- | --- |
| 인공지능 | 기초 인공지능 (벡터에서 트랜스포머까지) | 기초 | `#ai-basics` |
| 통계학 | 기초 통계학 (평균에서 p값까지) | 기초 | `#stats-basics` |
| 컴퓨터과학 | 기초 알고리즘 (Big-O에서 길 찾기까지) | 기초 | `#cs-algorithms` |

### 기초 인공지능

| 파트 | 장 |
| --- | --- |
| 시작하기 | 인공지능의 지도 |
| 수학 기초 | 벡터와 내적 · 행렬과 선형변환 · 미분과 기울기 · 편미분과 그래디언트 · 확률과 분포 · 정보량과 엔트로피 |
| 머신러닝 | 선형회귀 · 경사하강법 · 로지스틱 회귀와 분류 · 과적합과 일반화 · 모델 평가 · 비지도학습과 K-평균 |
| 딥러닝 | 인공 뉴런 · 신경망 놀이터 · 역전파 · 합성곱 신경망 · 임베딩 · 어텐션과 트랜스포머 · 언어 모델의 다음 단어 |

### 기초 통계학

| 파트 | 장 |
| --- | --- |
| 데이터 읽기 | 데이터 요약하기 |
| 추론 | 표본과 중심극한정리 · 신뢰구간 · 가설검정과 p값 |

### 기초 알고리즘

입문 개발자 대상. 장마다 JavaScript 코드와 한 단계씩 재생되는 그림이 함께 있습니다.

| 파트 | 장 |
| --- | --- |
| 효율 재기 | 복잡도와 Big-O (브라우저에서 실제 실행 시간 측정 포함) |
| 정렬과 탐색 | 정렬 · 탐색과 해시 테이블 |
| 그래프 | 그래프 탐색 (BFS, DFS, 다익스트라, A*) |

## 기술 스택

- Vite + React 18 + TypeScript
- 2D 그림: Canvas 2D (`src/lib/canvas.ts`, `src/lib/plot.ts`)
- 3D 그림: three.js (`src/lib/three.tsx`)
- 수식: KaTeX
- 라이트/다크 테마: CSS 변수 토큰 (`src/styles/global.css`), 캔버스는 `usePalette()`로 같은 토큰을 읽음

## 폴더

```
src/
  App.tsx                 레이아웃, 목차, 해시 라우팅, 진도 기록
  site.ts                 사이트 이름과 소개 문구
  pages/Library.tsx       서재: 분야별 과목 카드, 난이도 필터(난이도가 두 가지 이상일 때 표시)
  courses/
    index.ts              분야(SUBJECTS)·과목(COURSES) 등록, 난이도 이름, 주소 처리
    types.ts              Subject · Course · Part · Lesson 타입
    <분야>/
      subject.ts          분야 이름, 영어 이름, 색, 한 줄 소개
      shared.ts(x)        (있으면) 그 분야 과목들이 함께 쓰는 도우미 (예: cs의 단계 재생기)
      <과목>/
        course.ts         과목 제목, 부제, 난이도, 파트, 장 목록
        Cover.tsx         과목 표지
        lessons/          각 장의 본문과 인터랙티브 그림
  components/
    ui.tsx                그림 틀, 슬라이더, 수식, 퀴즈 등 공용 부품
    CourseMap.tsx         과목 표지의 "전체 지도" (모든 과목 공용)
  lib/                    캔버스·플롯·3D·테마·수학(통계 함수 포함) 도우미
    progress.ts           읽은 장 기록 (localStorage, 실패해도 사이트는 동작)
  styles/                 전역 스타일, 표지·서재 스타일
```

## 주소

- `#`: 서재
- `#<과목>`: 과목 표지 (예: `#stats-basics`)
- `#<과목>/<장>`: 한 장 (예: `#stats-basics/clt`)
- 예전 주소는 자동으로 새 주소로 바뀝니다: `#vectors`, `#ai/vectors` → `#ai-basics/vectors`, `#stats/clt` → `#stats-basics/clt`. 과목 주소를 바꿀 때는 이전 주소를 `aliases`에 남겨 두면 링크와 저장된 진도가 그대로 이어집니다.

## 이름 정하기

- **분야**: 학문 이름 그대로 (인공지능, 통계학, 물리학 …)
- **과목 제목**: 무엇을 배우는지 바로 알 수 있는 이름. 분야의 첫 과목은 "기초 ○○", 그다음 과목은 주제 이름(예: 회귀분석, 베이즈 통계, 딥러닝)
- **부제**: 과목이 다루는 범위를 "A에서 B까지"처럼 짧게
- **난이도**: `level` 필드(1 기초, 2 중급, 3 심화)로 표시하고, 먼저 들어야 할 과목은 `prerequisites`에 적습니다
- **과목 주소(id)**: `<분야>-<주제>` 형식의 영문 소문자 (예: `stats-basics`, `stats-regression`, `ai-deep-learning`). 한 번 공개한 주소는 바꾸지 않는 것이 좋고, 바꿔야 하면 `aliases`를 씁니다

## 과목 추가하기

1. 분야가 새로 필요하면 `src/courses/<분야>/subject.ts`를 만들고 `src/courses/index.ts`의 `SUBJECTS`에 넣습니다.
2. `src/courses/<분야>/<과목>/course.ts`에 `Course`를 만듭니다. 파트 색이 새로 필요하면 `global.css`의 밝은 테마와 어두운 테마(두 곳)에 모두 토큰을 추가합니다.
3. 장 본문은 `src/courses/<분야>/<과목>/lessons/`에 둡니다. 공용 부품은 `../../../../components/ui`와 `../../../../lib/`에서 가져옵니다.
4. `COURSES`에 등록하면 서재의 해당 분야 아래에 난이도 순으로 카드가 생깁니다.
5. 장 사이 링크는 `lessonHref('<과목>', '<장>')`나 `href="#<과목>/<장>"`으로 겁니다. 다른 과목의 장으로도 링크할 수 있습니다.
