import { useMemo, useRef, useState, type RefObject } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useAnimationFrame, useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import { Plot, fmt } from '../../../../lib/plot';
import { alpha, parseColor, usePalette } from '../../../../lib/theme';
import { clamp, makeDataset, rng, sigmoid, type Pt } from '../../../../lib/math';

/* ─────────────── Figure 1: the sigmoid ─────────────── */

function SigmoidFigure() {
  const P = usePalette();
  const [z, setZ] = useState(1.5);
  const p = sigmoid(z);
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -8, xMax: 8, yMin: -0.08, yMax: 1.08, pad: { l: 40, r: 14, t: 14, b: 28 } });
      plot.grid({ xStep: 2, yStep: 0.25, xLabel: 'z', yLabel: 'σ(z)' });
      plot.line(-8, 1, 8, 1, alpha(P.ink3, 0.6), 1, [4, 4]);
      plot.line(-8, 0.5, 8, 0.5, alpha(P.ink3, 0.6), 1, [2, 4]);
      plot.fillUnder(sigmoid, alpha(P.accent, 0.08), -8, 8, 0);
      plot.fn(sigmoid, P.accent, 3);
      // guides
      plot.line(z, 0, z, p, P.hl, 1.5, [4, 3]);
      plot.line(-8, p, z, p, P.hl, 1.5, [4, 3]);
      plot.dot(z, p, 7, P.surface, P.hl, 3);
      plot.text(`σ(${fmt(z, 1)}) = ${fmt(p, 3)}`, z, p, P.ink, { dx: z > 3 ? -12 : 12, dy: -16, align: z > 3 ? 'right' : 'left', bg: alpha(P.surface, 0.9) });
      plot.text('아무리 커도 1을 넘지 않음', 7.6, 1, P.ink3, { dy: -10, align: 'right', font: `12px ${P.fontBody}` });
      plot.text('아무리 작아도 0 아래로 안 내려감', -7.6, 0, P.ink3, { dy: -10, align: 'left', font: `12px ${P.fontBody}` });
    },
    [P, z],
    { aspect: 2.1, maxHeight: 340, minHeight: 220 },
  );
  return (
    <Figure no={1} title="시그모이드: 어떤 수든 0과 1 사이로" hint="z를 움직여 보세요" caption={<>z가 0이면 정확히 0.5, z가 커질수록 1에, 작아질수록 0에 다가갑니다. 가운데 부분은 거의 직선이고 양 끝은 납작하게 눌려 있어서 확률처럼 해석하기 좋습니다.</>}>
      <div ref={wrapRef} className="canvas-box">
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <Slider id="lr-z" label="입력 z" value={z} min={-8} max={8} step={0.1} onChange={setZ} format={(v) => fmt(v, 1)} />
        <div className="readouts" style={{ flex: '1 1 240px' }}>
          <Readout label="출력 σ(z)" value={fmt(p, 3)} />
          <Readout label="판정 (기준 0.5)" value={p >= 0.5 ? '예 (1)' : '아니오 (0)'} color={p >= 0.5 ? 'var(--pos)' : 'var(--neg)'} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: hours studied → pass probability ─────────────── */

const STUDY: { h: number; y: number }[] = (() => {
  const r = rng(11);
  const out: { h: number; y: number }[] = [];
  for (let i = 0; i < 22; i++) {
    const h = Math.round((0.5 + r() * 9) * 10) / 10;
    const y = r() < sigmoid(1.3 * (h - 5)) ? 1 : 0;
    out.push({ h, y });
  }
  return out;
})();

function studyLoss(w: number, b: number) {
  let L = 0;
  for (const d of STUDY) {
    const p = clamp(sigmoid(w * d.h + b), 1e-9, 1 - 1e-9);
    L -= d.y * Math.log(p) + (1 - d.y) * Math.log(1 - p);
  }
  return L / STUDY.length;
}

function fitStudy(): [number, number] {
  let w = 0;
  let b = 0;
  for (let it = 0; it < 6000; it++) {
    let gw = 0;
    let gb = 0;
    for (const d of STUDY) {
      const e = sigmoid(w * d.h + b) - d.y;
      gw += e * d.h;
      gb += e;
    }
    w -= (0.05 * gw) / STUDY.length;
    b -= (0.3 * gb) / STUDY.length;
  }
  return [w, b];
}

function StudyFigure() {
  const P = usePalette();
  const [w, setW] = useState(0.6);
  const [b, setB] = useState(-2);
  const best = useMemo(fitStudy, []);
  const L = studyLoss(w, b);
  const boundary = Math.abs(w) > 1e-6 ? -b / w : NaN;
  const acc = STUDY.filter((d) => (sigmoid(w * d.h + b) >= 0.5 ? 1 : 0) === d.y).length;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: W, h: H }) => {
      const plot = new Plot(ctx, W, H, P, { xMin: 0, xMax: 10, yMin: -0.12, yMax: 1.12, pad: { l: 40, r: 14, t: 14, b: 30 } });
      plot.grid({ xStep: 1, yStep: 0.25, xLabel: '공부 시간 (h)' });
      const f = (x: number) => sigmoid(w * x + b);
      if (isFinite(boundary) && boundary > 0 && boundary < 10) {
        plot.line(boundary, -0.12, boundary, 1.12, alpha(P.ink3, 0.8), 1.5, [5, 4]);
        plot.text(`50% 지점 ${fmt(boundary, 1)}h`, boundary, 0.5, P.ink2, { dx: 6, align: 'left', font: `12px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
      }
      // error segments
      for (const d of STUDY) {
        const p = f(d.h);
        const miss = d.y === 1 ? 1 - p : p;
        plot.line(d.h, d.y, d.h, p, alpha(P.bad, 0.25 + 0.6 * miss), 2);
      }
      plot.fn(f, P.ml, 3);
      for (const d of STUDY) plot.dot(d.h, d.y, 6, d.y ? P.pos : P.neg, P.surface, 1.5);
      plot.text('합격 (1)', 0.15, 1, P.pos, { dy: -12, font: `600 12px ${P.fontBody}` });
      plot.text('불합격 (0)', 0.15, 0, P.neg, { dy: 14, font: `600 12px ${P.fontBody}` });
    },
    [P, w, b],
    { aspect: 2, maxHeight: 380, minHeight: 240 },
  );

  return (
    <Figure no={2} title="공부 시간으로 합격 확률 예측하기" hint="w와 b를 조절해 손실을 줄여 보세요" caption={<>점은 학생 22명의 실제 결과(합격 1, 불합격 0)이고 초록 곡선이 모델의 예측 확률입니다. 빨간 세로선은 각 학생에 대해 모델이 틀린 정도입니다. 합격한 학생에게 낮은 확률을 줄수록 손실이 크게 늘어납니다.</>}>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="lr-w1d" label={<>기울기 w</>} value={w} min={-1} max={4} step={0.05} onChange={setW} format={(v) => fmt(v, 2)} />
          <Slider id="lr-b1d" label={<>편향 b</>} value={b} min={-16} max={4} step={0.1} onChange={setB} format={(v) => fmt(v, 1)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="로그 손실" value={fmt(L, 3)} />
            <Readout label="맞힌 학생" value={`${acc} / ${STUDY.length}`} />
          </div>
          <div className="btn-row">
            <Button
              small
              primary
              onClick={() => {
                setW(Math.round(best[0] * 100) / 100);
                setB(Math.round(best[1] * 10) / 10);
              }}
            >
              손실이 가장 작은 값으로
            </Button>
            <Button
              small
              onClick={() => {
                setW(0.6);
                setB(-2);
              }}
            >
              처음으로
            </Button>
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>
            최적값: w ≈ {fmt(best[0], 2)}, b ≈ {fmt(best[1], 1)}, 손실 {fmt(studyLoss(best[0], best[1]), 3)}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: 2D classifier trained live ─────────────── */

function bce(pts: Pt[], w1: number, w2: number, b: number) {
  if (!pts.length) return 0;
  let L = 0;
  for (const q of pts) {
    const p = clamp(sigmoid(w1 * q.x + w2 * q.y + b), 1e-9, 1 - 1e-9);
    L -= q.label * Math.log(p) + (1 - q.label) * Math.log(1 - p);
  }
  return L / pts.length;
}

function ClassifierFigure() {
  const P = usePalette();
  const [pts, setPts] = useState<Pt[]>(() => makeDataset('blobs', 70, 0.05, 4));
  const [wv, setWv] = useState<[number, number, number]>([-1.5, 2, 0.5]);
  const [running, setRunning] = useState(false);
  const [cls, setCls] = useState<0 | 1>(1);
  const [step, setStep] = useState(0);
  const plotRef = useRef<Plot | null>(null);
  const [w1, w2, b] = wv;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -1.4, xMax: 1.4, yMin: -1.4, yMax: 1.4, equal: true, pad: { l: 30, r: 10, t: 10, b: 24 } });
      plotRef.current = plot;
      const pc = parseColor(P.pos);
      const nc = parseColor(P.neg);
      plot.heatmap((x, y) => {
        const p = sigmoid(w1 * x + w2 * y + b);
        const c = p >= 0.5 ? pc : nc;
        const a = Math.abs(p - 0.5) * 2;
        return [c[0], c[1], c[2], Math.round(25 + 120 * a)];
      }, 5);
      plot.grid({ xStep: 0.5, yStep: 0.5, labels: true, axes: true, xLabel: 'x₁', yLabel: 'x₂' });
      // decision boundary w1 x + w2 y + b = 0
      if (Math.abs(w2) > 1e-6) plot.slopeLine(0, -b / w2, -w1 / w2, P.ink, 2.5);
      else if (Math.abs(w1) > 1e-6) plot.line(-b / w1, plot.yMin, -b / w1, plot.yMax, P.ink, 2.5);
      // weight vector arrow from boundary point
      const n = Math.hypot(w1, w2);
      if (n > 1e-6) {
        const t = -b / (n * n);
        const x0 = w1 * t;
        const y0 = w2 * t;
        if (Math.abs(x0) < 1.3 && Math.abs(y0) < 1.3) {
          plot.arrow(x0, y0, x0 + (w1 / n) * 0.35, y0 + (w2 / n) * 0.35, P.ink, 2, 8);
          plot.text('w', x0 + (w1 / n) * 0.42, y0 + (w2 / n) * 0.42, P.ink, { align: 'center', font: `italic 600 13px ${P.fontBody}` });
        }
      }
      for (const q of pts) {
        const p = sigmoid(w1 * q.x + w2 * q.y + b);
        const wrong = (p >= 0.5 ? 1 : 0) !== q.label;
        plot.dot(q.x, q.y, wrong ? 5.5 : 5, q.label ? P.pos : P.neg, wrong ? P.bad : P.surface, wrong ? 2.8 : 1.2);
      }
      plot.frame();
    },
    [P, pts, w1, w2, b],
    { aspect: 1.25, maxHeight: 480, minHeight: 300 },
  );

  // reuse the canvas wrapper for in-view detection
  const visible = useInView(wrapRef as unknown as RefObject<HTMLElement>);

  useAnimationFrame(() => {
    if (!pts.length) return;
    let [a1, a2, c] = wv;
    const lr = 1.2;
    for (let k = 0; k < 4; k++) {
      let g1 = 0;
      let g2 = 0;
      let gb = 0;
      for (const q of pts) {
        const e = sigmoid(a1 * q.x + a2 * q.y + c) - q.label;
        g1 += e * q.x;
        g2 += e * q.y;
        gb += e;
      }
      const n = pts.length;
      a1 -= lr * (g1 / n + 0.002 * a1);
      a2 -= lr * (g2 / n + 0.002 * a2);
      c -= lr * (gb / n);
      a1 = clamp(a1, -12, 12);
      a2 = clamp(a2, -12, 12);
      c = clamp(c, -8, 8);
      if (Math.hypot(g1, g2, gb) / n < 4e-4) {
        setRunning(false);
        break;
      }
    }
    setWv([a1, a2, c]);
    setStep((s) => s + 4);
  }, running && visible);

  useDrag(canvasRef, {
    hit: () => null,
    onDrag: () => {},
    onEmpty: (x, y) => {
      const p = plotRef.current;
      if (!p) return;
      const wx = p.invX(x);
      const wy = p.invY(y);
      if (Math.abs(wx) > 1.4 || Math.abs(wy) > 1.4) return;
      setPts((s) => [...s, { x: wx, y: wy, label: cls }]);
    },
  });

  const L = bce(pts, w1, w2, b);
  const correct = pts.filter((q) => (sigmoid(w1 * q.x + w2 * q.y + b) >= 0.5 ? 1 : 0) === q.label).length;

  return (
    <Figure no={3} title="결정 경계 학습시키기" hint="빈 곳을 누르면 점이 추가됩니다" caption={<>배경 색이 진할수록 모델이 확신하는 영역이고, 굵은 선은 확률이 정확히 0.5가 되는 결정 경계입니다. 빨간 테두리를 두른 점은 현재 잘못 분류된 점입니다. 학습을 누르면 경사하강법이 손실을 줄이는 방향으로 w₁, w₂, b를 계속 고칩니다.</>}>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="btn-row">
            <Button primary onClick={() => setRunning((r) => !r)}>
              {running ? '❚❚ 멈춤' : '▶ 학습'}
            </Button>
            <Button
              onClick={() => {
                setRunning(false);
                setWv([-1.5, 2, 0.5]);
                setStep(0);
              }}
            >
              가중치 초기화
            </Button>
          </div>
          <Slider id="lr-w1" label="w₁" value={w1} min={-12} max={12} step={0.1} onChange={(v) => setWv([v, w2, b])} format={(v) => fmt(v, 2)} />
          <Slider id="lr-w2" label="w₂" value={w2} min={-12} max={12} step={0.1} onChange={(v) => setWv([w1, v, b])} format={(v) => fmt(v, 2)} />
          <Slider id="lr-b" label="b" value={b} min={-8} max={8} step={0.1} onChange={(v) => setWv([w1, w2, v])} format={(v) => fmt(v, 2)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="평균 로그 손실" value={fmt(L, 3)} />
            <Readout label="정확도" value={pts.length ? `${Math.round((correct / pts.length) * 100)}%` : '—'} />
            <Readout label="학습 반복" value={step} />
            <Readout label="점 개수" value={pts.length} />
          </div>
          <Seg
            label="추가할 점의 클래스"
            value={cls}
            onChange={(v) => setCls(v)}
            options={[
              { value: 1, label: <span style={{ color: 'var(--pos)' }}>● 클래스 1</span> },
              { value: 0, label: <span style={{ color: 'var(--neg)' }}>● 클래스 0</span> },
            ]}
          />
          <div className="btn-row">
            <Button small onClick={() => setPts(makeDataset('blobs', 70, 0.05, 4))}>
              기본 데이터
            </Button>
            <Button small onClick={() => setPts(makeDataset('blobs', 70, 0.35, 9))}>
              겹친 데이터
            </Button>
            <Button small onClick={() => setPts(makeDataset('circle', 80, 0.05, 2))}>
              원형 데이터
            </Button>
            <Button small onClick={() => setPts([])}>
              모두 지우기
            </Button>
          </div>
          <Legend
            items={[
              { color: 'var(--pos)', label: '클래스 1 영역' },
              { color: 'var(--neg)', label: '클래스 0 영역' },
              { color: 'var(--ink)', label: '결정 경계 (p = 0.5)', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function LogisticRegression() {
  return (
    <>
      <h2>숫자 대신 "예/아니오"를 맞히는 문제</h2>
      <p>
        선형회귀는 집값처럼 연속된 숫자를 예측했습니다. 그런데 현실의 많은 질문은 둘 중 하나를 고르는 문제입니다. 이 메일은 스팸인가? 이 사진에 고양이가 있는가? 이 학생은 시험에 붙을까? 이런 문제를 <T en="classification">분류</T>라고 하고, 그중 답이 두 개뿐인 경우를 <T en="binary classification">이진 분류</T>라고 합니다.
      </p>
      <p>
        직선 <M>{'z = wx + b'}</M>를 그대로 쓰면 곤란합니다. 직선의 값은 −∞부터 +∞까지 무엇이든 될 수 있으니까요. "합격 확률이 1.7"이나 "−0.3"은 말이 되지 않습니다. 그래서 직선의 출력을 0과 1 사이로 눌러 주는 함수를 하나 덧씌웁니다.
      </p>

      <h2>시그모이드 함수</h2>
      <p>
        <T en="sigmoid">시그모이드</T>는 S자 모양의 함수입니다. 어떤 실수를 넣어도 0과 1 사이의 값을 돌려주기 때문에 출력을 확률로 읽을 수 있습니다.
      </p>
      <MB note="e는 자연상수(약 2.718)입니다. z가 커지면 e^(−z)가 0에 가까워져 σ(z)는 1에 가까워집니다.">{'\\sigma(z) = \\frac{1}{1 + e^{-z}}'}</MB>
      <SigmoidFigure />
      <p>
        로지스틱 회귀 모델은 이 둘을 이어 붙인 것입니다. 먼저 입력의 가중합 <M>{'z'}</M>를 계산하고, 시그모이드에 통과시켜 "클래스 1일 확률"을 얻습니다. 확률이 0.5 이상이면 1, 아니면 0으로 판정합니다.
      </p>
      <MB note="이름에 '회귀'가 들어가지만 실제로는 분류 모델입니다. 확률이라는 연속값을 회귀한다는 뜻에서 붙은 이름입니다.">{'\\hat{p} = \\sigma(\\mathbf{w}\\cdot\\mathbf{x} + b)'}</MB>

      <h2>좋은 확률이란 무엇인가: 로그 손실</h2>
      <p>
        선형회귀에서는 오차의 제곱을 손실로 썼습니다. 분류에서는 다른 손실을 씁니다. 정답이 1인데 모델이 0.9라고 했다면 잘한 것이고, 0.01이라고 했다면 크게 틀린 것입니다. 이 "크게 틀림"을 강하게 벌주기 위해 정답 클래스에 준 확률의 로그를 씁니다.
      </p>
      <MB note="정답이 1이면 −log p̂, 정답이 0이면 −log(1−p̂)만 남습니다. 정답에 준 확률이 0에 가까워지면 손실은 무한히 커집니다.">{'L = -\\frac{1}{N}\\sum_{i=1}^{N} \\Big[ y_i \\log \\hat{p}_i + (1 - y_i)\\log(1 - \\hat{p}_i) \\Big]'}</MB>
      <p>
        이 식을 <T en="binary cross-entropy">이진 크로스엔트로피</T> 또는 로그 손실이라고 부릅니다. 왜 하필 로그인지는 <a href="#ai-basics/entropy">정보량과 엔트로피</a> 장에서 "놀라움의 양"으로 자세히 설명했습니다. 아래 그림에서 w와 b를 바꿔 가며 손실이 가장 작아지는 곡선을 찾아보세요.
      </p>
      <StudyFigure />
      <Callout kind="intuition">
        w는 곡선이 얼마나 가파르게 올라가는지, b는 곡선이 좌우로 어디에 놓이는지를 정합니다. 확률이 정확히 0.5가 되는 지점 <M>{'x = -b/w'}</M>가 합격과 불합격을 가르는 기준 시간입니다.
      </Callout>

      <h2>입력이 두 개면 경계는 직선이 된다</h2>
      <p>
        특징이 두 개(<M>{'x_1, x_2'}</M>)라면 확률이 0.5가 되는 곳, 즉 <M>{'w_1x_1 + w_2x_2 + b = 0'}</M>은 평면 위의 직선입니다. 이 직선을 <T en="decision boundary">결정 경계</T>라고 합니다. 가중치 벡터 <M>{'\\mathbf{w}'}</M>는 이 경계에 수직이고 클래스 1 쪽을 가리킵니다. 벡터 장에서 본 내적이 여기서 그대로 쓰입니다.
      </p>
      <ClassifierFigure />
      <p>
        학습은 경사하강법으로 합니다. 신기하게도 로그 손실을 미분하면 아주 깔끔한 식이 나옵니다. 각 점에서 "예측 확률 − 정답"을 오차로 보고, 그 오차에 입력을 곱해서 평균 내면 기울기가 됩니다.
      </p>
      <MB>{'\\frac{\\partial L}{\\partial w_j} = \\frac{1}{N}\\sum_{i=1}^N (\\hat{p}_i - y_i)\\,x_{ij}, \\qquad \\frac{\\partial L}{\\partial b} = \\frac{1}{N}\\sum_{i=1}^N (\\hat{p}_i - y_i)'}</MB>
      <Callout kind="warn" label="한계">
        그림 3에서 원형 데이터를 불러와 학습시켜 보세요. 결정 경계가 직선이라서 안쪽 원과 바깥 고리를 나눌 수 없습니다. 이 한계를 넘으려면 특징을 새로 만들어 주거나(<M>{'x_1^2 + x_2^2'}</M> 같은), 경계를 스스로 구부릴 수 있는 <a href="#ai-basics/neural-network">신경망</a>이 필요합니다.
      </Callout>
      <Callout kind="key">
        로지스틱 회귀 = 선형 모델 + 시그모이드 + 로그 손실. 이 조합은 사실 뉴런 하나와 똑같습니다. 딥러닝 분류 모델의 마지막 층도 거의 항상 이 구조(여러 클래스라면 소프트맥스)로 끝납니다.
      </Callout>
      <Quiz
        q="로지스틱 회귀 모델이 어떤 메일에 대해 z = w·x + b = 0을 계산했습니다. 이 메일이 스팸일 확률은?"
        options={['0', '0.5', '1', '알 수 없다']}
        answer={1}
        explain={<>σ(0) = 1 / (1 + e⁰) = 1/2 입니다. z = 0인 점들이 모인 곳이 바로 결정 경계이고, 모델이 가장 헷갈려하는 곳입니다.</>}
      />
    </>
  );
}
