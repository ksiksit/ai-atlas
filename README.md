# 벡터에서 트랜스포머까지

수학 기초부터 머신러닝, 딥러닝, 트랜스포머와 언어 모델까지 직접 만지며 배우는 인터랙티브 인공지능 입문 사이트입니다.
모든 시각화와 학습(신경망 훈련 포함)은 브라우저 안에서 계산됩니다.

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

## 구성

| 파트 | 장 |
| --- | --- |
| 시작하기 | 인공지능의 지도 |
| 수학 기초 | 벡터와 내적 · 행렬과 선형변환 · 미분과 기울기 · 편미분과 그래디언트 · 확률과 분포 · 정보량과 엔트로피 |
| 머신러닝 | 선형회귀 · 경사하강법 · 로지스틱 회귀와 분류 · 과적합과 일반화 · 모델 평가 · 비지도학습과 K-평균 |
| 딥러닝 | 인공 뉴런 · 신경망 놀이터 · 역전파 · 합성곱 신경망 · 임베딩 · 어텐션과 트랜스포머 · 언어 모델의 다음 단어 |

## 기술 스택

- Vite + React 18 + TypeScript
- 2D 그림: Canvas 2D (`src/lib/canvas.ts`, `src/lib/plot.ts`)
- 3D 그림: three.js (`src/lib/three.tsx`)
- 수식: KaTeX
- 라이트/다크 테마: CSS 변수 토큰 (`src/styles/global.css`), 캔버스는 `usePalette()`로 같은 토큰을 읽음

## 폴더

```
src/
  curriculum.ts      장 목록과 메타데이터 (새 장은 여기에 추가)
  App.tsx            레이아웃, 목차, 해시 라우팅 (#vectors 같은 주소)
  pages/Home.tsx     첫 화면 (3D 손실 지형)
  components/ui.tsx  그림 틀, 슬라이더, 수식, 퀴즈 등 공용 부품
  lib/               캔버스·플롯·3D·테마·수학 도우미
  lessons/           각 장의 본문과 인터랙티브 그림
```
