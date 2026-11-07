# 기여 가이드

아틀라스에 과목이나 장을 더하거나 코드를 고치려는 사람을 위한 문서입니다. 실행과 빌드 방법은 [README](../README.md#실행)에 있습니다.

## 지켜야 할 원칙

새 장이나 과목도 [README의 원칙](../README.md#원칙)을 따릅니다. 특히:

- 그림은 미리 그린 애니메이션이 아니라 그 자리에서 계산한 결과여야 합니다.
- 무작위가 들어가는 실험은 씨앗이 정해진 난수를 써서 같은 설정이면 같은 결과가 나오게 합니다.
- 백엔드나 외부 요청을 더하지 않습니다. 독자의 브라우저에서 잰 값(반응 시간 등)은 그 페이지 안에서만 쓰고 저장하거나 보내지 않습니다.
- 독자가 직접 실행하는 코드는 프로그래밍 입문의 "직접 실행" 상자처럼 페이지와 분리된 Web Worker에서 돌리고 시간 제한을 둡니다.

## 기술 스택

- Vite + React 18 + TypeScript
- 2D 그림: Canvas 2D (`src/lib/canvas.ts`, `src/lib/plot.ts`)
- 3D 그림: three.js (`src/lib/three.tsx`)
- 수식: KaTeX
- 라이트/다크 테마: CSS 변수 토큰 (`src/styles/global.css`), 캔버스는 `usePalette()`로 같은 토큰을 읽음

## 폴더

```
src/
  App.tsx                 레이아웃(위쪽 막대: 현재 위치, 과목 목차, 화면 테마), 해시 라우팅
  site.ts                 사이트 이름과 소개 문구
  pages/
    Home.tsx              첫 화면(전공 안내): 검색, 전공 타일
    MajorPage.tsx         전공 하나의 이수체계도: 이수 구분(기초·필수·선택) × 단계(100·200·300번대),
                          과목 상자 안에 단원과 장을 모두 표시, 선수과목 화살표
    LibrarySearch.tsx     전공·과목(이름·코드)·장 검색 (한글·영어 이름, / 키로 바로 이동)
  courses/
    index.ts              분야(SUBJECTS)·과목(COURSES) 등록, 과목 코드, 이수 구분 이름, 주소 처리
    majors.ts             전공(MAJORS): 전공마다 과목과 이수 구분
    types.ts              Subject · Course · Part · Lesson · Major 타입
    <분야>/
      subject.ts          분야 이름, 영어 이름, 과목 코드 접두어, 색, 한 줄 소개
      shared.ts(x)        (있으면) 그 분야 과목들이 함께 쓰는 도우미 (예: cs의 단계 재생기)
      <과목>/
        course.ts         과목 제목, 부제, 난이도, 파트, 장 목록
        Cover.tsx         과목 표지
        lessons/          각 장의 본문과 인터랙티브 그림
  components/
    ThemeToggle.tsx       화면 테마(자동·밝게·어둡게) 버튼
    ui.tsx                그림 틀, 슬라이더, 수식, 퀴즈 등 공용 부품
    CourseMap.tsx         과목 표지의 "전체 지도" (모든 과목 공용)
  lib/                    캔버스·플롯·3D·테마·수학(통계 함수 포함) 도우미
  styles/                 전역 스타일, 표지 스타일, 전공 안내·이수체계도 스타일(library.css)
```

## 주소

- `#`: 전공 안내 (`#majors`도 여기로 옵니다)
- `#majors/<전공>`: 전공 하나의 이수체계도 (예: `#majors/ai`)
- `#<과목>`: 과목 표지 (예: `#stats-basics`)
- `#<과목>/<장>`: 한 장 (예: `#stats-basics/clt`)
- 예전 주소는 자동으로 새 주소로 바뀝니다: `#vectors`, `#ai/vectors` → `#ai-basics/vectors`, `#stats/clt` → `#stats-basics/clt`. 과목 주소를 바꿀 때는 이전 주소를 `aliases`에 남겨 두면 예전 링크가 그대로 이어집니다.

## 이름 정하기

- **분야**: 학문 이름 그대로 (인공지능, 통계학, 물리학 …). 과목 코드 접두어(`code`)는 영문 대문자 약어 (AI, STAT, CS, NET …)
- **전공**: "○○ 전공". 주소(id)는 짧은 영문 소문자 (예: `ai`, `net`)
- **과목 제목**: 무엇을 배우는지 바로 알 수 있는 이름. 분야의 첫 과목은 "기초 ○○", 그다음 과목은 주제 이름(예: 회귀분석, 베이즈 통계, 딥러닝)
- **부제**: 과목이 다루는 범위를 "A에서 B까지"처럼 짧게
- **난이도**: `level` 필드(1 기초, 2 중급, 3 심화)로 표시하고, 먼저 들어야 할 과목은 `prerequisites`에 적습니다
- **과목 주소(id)**: `<분야>-<주제>` 형식의 영문 소문자 (예: `stats-basics`, `stats-regression`, `ai-deep-learning`). 한 번 공개한 주소는 바꾸지 않는 것이 좋고, 바꿔야 하면 `aliases`를 씁니다

## 과목 추가하기

1. 분야가 새로 필요하면 `src/courses/<분야>/subject.ts`를 만들고 `src/courses/index.ts`의 `SUBJECTS`에 넣습니다.
2. `src/courses/<분야>/<과목>/course.ts`에 `Course`를 만듭니다. 파트 색이 새로 필요하면 `global.css`의 밝은 테마와 어두운 테마(두 곳)에 모두 토큰을 추가합니다.
3. 장 본문은 `src/courses/<분야>/<과목>/lessons/`에 둡니다. 공용 부품은 `../../../../components/ui`와 `../../../../lib/`에서 가져옵니다.
4. `COURSES`에 등록하면 과목 코드가 붙고 검색에 나타납니다. 첫 화면에서 찾아 들어오게 하려면 5번처럼 전공에 넣어야 합니다.
5. 과목을 전공에 넣으려면 `src/courses/majors.ts`에서 그 전공의 `courses`에 `{ course: '<과목>', role: 'base' | 'core' | 'elect' }`를 추가합니다. 이수체계도에서는 이수 구분 줄과 난이도 칸이 만나는 자리에 놓이고, 같은 전공 안에 있는 `prerequisites` 과목에서 화살표가 이어집니다. 새 전공은 `MAJORS`에 항목을 하나 더하면 첫 화면에 타일이 생깁니다. 타일에는 `tagline`(이름 아래 한 줄)이 보이고, `blurb`는 이수체계도 맨 위에 나옵니다. 전공이 7개 이상이 되면 첫 화면에 `field`(계열, 예: "공학")로 좁히는 필터가 생깁니다.
6. 장 사이 링크는 `lessonHref('<과목>', '<장>')`나 `href="#<과목>/<장>"`으로 겁니다. 다른 과목의 장으로도 링크할 수 있습니다.
7. [커리큘럼](curriculum.md)의 과목 표, 전공 표, 과목별 장 표를 함께 고칩니다. 새 전공이면 [README](../README.md#전공)의 전공 표에도 한 줄을 더합니다.

### 과목 코드

과목 코드는 직접 적지 않고 자동으로 붙습니다: 분야 접두어(`subject.ts`의 `code`) + 난이도(백의 자리) + 그 분야·난이도 안에서 `COURSES`에 등록된 순서.
