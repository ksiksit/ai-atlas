import { useMemo, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Slider, T } from '../../../components/ui';
import { useCanvas2D } from '../../../lib/canvas';
import { Plot, fmt } from '../../../lib/plot';
import { alpha, usePalette } from '../../../lib/theme';
import { gauss, polyEval, polyFit, rng } from '../../../lib/math';

const truth = (x: number) => 0.9 * Math.sin(2.8 * x);
const NOISE = 0.28;

interface Sample {
  x: number;
  y: number;
  val: boolean;
}

function makeSamples(n: number, seed: number): Sample[] {
  const r = rng(seed * 7919 + 13);
  const out: Sample[] = [];
  for (let i = 0; i < n; i++) {
    // stratified x so validation points sit between training points
    const x = Math.max(-1, Math.min(1, -1 + ((i + 0.5) * 2) / n + (r() - 0.5) * (1.6 / n)));
    out.push({ x, y: truth(x) + gauss(r) * NOISE, val: i % 3 === 2 });
  }
  return out;
}

const mse = (c: number[], s: Sample[]) => (s.length ? s.reduce((a, p) => a + (polyEval(c, p.x) - p.y) ** 2, 0) / s.length : 0);

const lambdaOf = (l: number) => (l <= -7 ? 0 : Math.pow(10, l));

/* ─────────────── Figure 1: degree, λ, data size ─────────────── */

function FitFigure() {
  const P = usePalette();
  const [deg, setDeg] = useState(3);
  const [logL, setLogL] = useState(-7);
  const [n, setN] = useState(45);
  const [seed, setSeed] = useState(1);
  const [showTruth, setShowTruth] = useState(false);

  const data = useMemo(() => makeSamples(n, seed), [n, seed]);
  const train = useMemo(() => data.filter((d) => !d.val), [data]);
  const val = useMemo(() => data.filter((d) => d.val), [data]);
  const lam = lambdaOf(logL);
  const curve = useMemo(() => {
    const out: { tr: number; va: number }[] = [];
    for (let d = 1; d <= 15; d++) {
      const c = polyFit(
        train.map((p) => p.x),
        train.map((p) => p.y),
        d,
        lam,
      );
      out.push({ tr: mse(c, train), va: mse(c, val) });
    }
    return out;
  }, [train, val, lam]);
  const coef = useMemo(
    () =>
      polyFit(
        train.map((p) => p.x),
        train.map((p) => p.y),
        deg,
        lam,
      ),
    [train, deg, lam],
  );
  const trE = curve[deg - 1].tr;
  const vaE = curve[deg - 1].va;
  const bestDeg = curve.reduce((bi, c, i) => (c.va < curve[bi].va ? i : bi), 0) + 1;
  const minVa = curve[bestDeg - 1].va;
  const noise2 = NOISE * NOISE;
  const verdict =
    trE > 1.8 * noise2 && deg <= bestDeg
      ? { t: '과소적합', c: 'var(--neg)' }
      : deg > bestDeg && vaE > Math.max(1.5 * minVa, 1.3 * noise2)
        ? { t: '과적합', c: 'var(--bad)' }
        : { t: '적당함', c: 'var(--good)' };

  const fit = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -1.05, xMax: 1.05, yMin: -2, yMax: 2, pad: { l: 32, r: 10, t: 12, b: 26 } });
      plot.grid({ xStep: 0.5, yStep: 1 });
      if (showTruth) plot.fn(truth, P.ink3, 2, { dash: [6, 5] });
      plot.fn((x) => polyEval(coef, x), P.ml, 3);
      for (const d of train) plot.dot(d.x, d.y, 5, P.neg, P.surface, 1.2);
      for (const d of val) plot.dot(d.x, d.y, 4.5, P.surface, P.pos, 2.2);
      plot.frame();
    },
    [P, coef, data, showTruth],
    { aspect: 1.35, maxHeight: 380, minHeight: 240 },
  );

  const err = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 0.5, xMax: 15.5, yMin: -2.6, yMax: 1, pad: { l: 44, r: 10, t: 12, b: 30 } });
      plot.grid({ xStep: 1, yStep: 1, axes: false, labels: false });
      ctx.save();
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let d = 1; d <= 15; d += d < 3 ? 1 : 2) ctx.fillText(String(d), plot.X(d), plot.pad.t + plot.ph + 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let k = -2; k <= 0; k++) ctx.fillText(String(Math.pow(10, k)), plot.pad.l - 6, plot.Y(k));
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('다항식 차수 →', plot.pad.l + plot.pw - 4, plot.pad.t + plot.ph - 4);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('MSE (로그 눈금)', plot.pad.l + 6, plot.pad.t + 4);
      ctx.restore();
      const ly = (v: number) => Math.log10(Math.max(1e-3, Math.min(9.9, v)));
      plot.line(deg, plot.yMin, deg, plot.yMax, alpha(P.ink3, 0.7), 1.5, [4, 4]);
      plot.line(bestDeg, plot.yMin, bestDeg, plot.yMax, alpha(P.good, 0.35), 8);
      const c = ctx;
      const draw = (key: 'tr' | 'va', color: string) => {
        c.save();
        c.strokeStyle = color;
        c.lineWidth = 2.5;
        c.lineJoin = 'round';
        c.beginPath();
        curve.forEach((e, i) => {
          const X = plot.X(i + 1);
          const Y = plot.Y(ly(e[key]));
          if (i) c.lineTo(X, Y);
          else c.moveTo(X, Y);
        });
        c.stroke();
        c.restore();
        curve.forEach((e, i) => plot.dot(i + 1, ly(e[key]), i + 1 === deg ? 6 : 3, color, i + 1 === deg ? P.surface : undefined, 2));
      };
      plot.line(0.5, Math.log10(NOISE * NOISE), 15.5, Math.log10(NOISE * NOISE), alpha(P.ink3, 0.6), 1, [2, 4]);
      plot.text('잡음 수준', 15.3, Math.log10(NOISE * NOISE), P.ink3, { dy: 10, align: 'right', font: `11px ${P.fontBody}` });
      draw('tr', P.neg);
      draw('va', P.pos);
      plot.frame();
    },
    [P, curve, deg, bestDeg],
    { aspect: 1.35, maxHeight: 380, minHeight: 240 },
  );

  return (
    <Figure
      no={1}
      title="다항식 차수를 올리면 생기는 일"
      hint="차수와 λ를 바꿔 보세요"
      caption={<>파란 점(훈련 데이터)으로만 곡선을 맞추고, 주황 테두리 점(검증 데이터)으로 실력을 잽니다. 오른쪽 그래프에서 훈련 오차는 차수가 오를수록 계속 줄지만, 검증 오차는 어느 지점(초록 띠)부터 다시 올라갑니다. 그 지점이 이 데이터에 가장 알맞은 복잡도입니다.</>}
    >
      <div className="fig-cols">
        <div ref={fit.wrapRef} className="canvas-box">
          <canvas ref={fit.canvasRef} />
        </div>
        <div ref={err.wrapRef} className="canvas-box">
          <canvas ref={err.canvasRef} />
        </div>
      </div>
      <div className="controls row">
        <Slider id="of-deg" label="다항식 차수" value={deg} min={1} max={15} step={1} onChange={setDeg} />
        <Slider id="of-lam" label="정규화 강도 λ" value={logL} min={-7} max={1} step={0.25} onChange={setLogL} format={(v) => (v <= -7 ? '0 (끔)' : lambdaOf(v) < 0.01 ? lambdaOf(v).toExponential(0) : fmt(lambdaOf(v), 2))} />
        <Slider id="of-n" label="데이터 개수" value={n} min={12} max={150} step={3} onChange={setN} />
      </div>
      <div className="controls row" style={{ alignItems: 'center' }}>
        <div className="readouts" style={{ flex: '3 1 360px' }}>
          <Readout label="훈련 오차" value={fmt(trE, 3)} color="var(--neg)" />
          <Readout label="검증 오차" value={fmt(vaE, 3)} color="var(--pos)" />
          <Readout label="가장 좋은 차수" value={bestDeg} color="var(--good)" />
          <Readout label="판정" value={verdict.t} color={verdict.c} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 160px' }}>
          <Button small onClick={() => setSeed((s) => s + 1)}>
            새 데이터 뽑기
          </Button>
          <Check label="진짜 함수 보기" checked={showTruth} onChange={setShowTruth} />
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: '훈련 데이터 / 훈련 오차' },
          { color: 'var(--pos)', label: '검증 데이터 / 검증 오차' },
          { color: 'var(--c-ml)', label: '학습된 곡선', shape: 'ln' },
          { color: 'var(--ink-3)', label: '진짜 함수 (보통은 알 수 없음)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: bias–variance spaghetti ─────────────── */

const XS = Array.from({ length: 61 }, (_, i) => -1 + i / 30);

function BiasVarianceFigure() {
  const P = usePalette();
  const [deg, setDeg] = useState(1);
  const [seedBase, setSeedBase] = useState(100);
  const fits = useMemo(() => {
    const out: number[][] = [];
    for (let k = 0; k < 24; k++) {
      const s = makeSamples(15, seedBase + k);
      out.push(
        polyFit(
          s.map((p) => p.x),
          s.map((p) => p.y),
          deg,
          1e-7,
        ),
      );
    }
    return out;
  }, [deg, seedBase]);
  const { bias2, variance, mean } = useMemo(() => {
    let b2 = 0;
    let v = 0;
    const mean = XS.map((x) => {
      const ys = fits.map((c) => polyEval(c, x));
      const m = ys.reduce((a, y) => a + y, 0) / ys.length;
      b2 += (m - truth(x)) ** 2;
      v += ys.reduce((a, y) => a + (y - m) ** 2, 0) / ys.length;
      return m;
    });
    return { bias2: b2 / XS.length, variance: v / XS.length, mean };
  }, [fits]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -1.05, xMax: 1.05, yMin: -2.2, yMax: 2.2, pad: { l: 32, r: 10, t: 12, b: 26 } });
      plot.grid({ xStep: 0.5, yStep: 1 });
      for (const c of fits) plot.fn((x) => polyEval(c, x), alpha(P.ml, 0.28), 1.3, { from: -1, to: 1 });
      plot.fn(truth, P.ink, 2.2, { dash: [6, 5] });
      const c = ctx;
      c.save();
      c.strokeStyle = P.pos;
      c.lineWidth = 3.5;
      c.beginPath();
      XS.forEach((x, i) => (i ? c.lineTo(plot.X(x), plot.Y(mean[i])) : c.moveTo(plot.X(x), plot.Y(mean[i]))));
      c.stroke();
      c.restore();
      plot.frame();
    },
    [P, fits, mean],
    { aspect: 1.9, maxHeight: 400, minHeight: 240 },
  );

  return (
    <Figure no={2} title="편향과 분산: 데이터셋을 24번 바꿔 다시 학습하기" hint="차수를 바꿔 보세요" caption={<>각 초록 선은 서로 다른 15개짜리 데이터로 학습한 모델입니다. 주황 선은 그 24개 모델의 평균, 점선은 진짜 함수입니다. 단순한 모델은 서로 비슷하지만 다 같이 틀리고(편향), 복잡한 모델은 평균은 맞지만 데이터에 따라 크게 흔들립니다(분산).</>}>
      <div ref={wrapRef} className="canvas-box">
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row" style={{ alignItems: 'center' }}>
        <Slider id="bv-deg" label="다항식 차수" value={deg} min={1} max={12} step={1} onChange={setDeg} />
        <div className="readouts" style={{ flex: '2 1 300px' }}>
          <Readout label="편향² (평균이 틀린 정도)" value={fmt(bias2, 3)} color="var(--pos)" />
          <Readout label="분산 (흔들리는 정도)" value={fmt(Math.min(variance, 99), 3)} color="var(--c-ml)" />
        </div>
        <Button small onClick={() => setSeedBase((s) => s + 24)}>
          다른 데이터셋들로
        </Button>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Overfitting() {
  return (
    <>
      <h2>시험 문제만 외운 학생</h2>
      <p>
        기출문제 답을 통째로 외운 학생은 기출문제를 다시 풀면 만점을 받습니다. 하지만 숫자만 살짝 바뀐 새 문제를 받으면 손도 못 댑니다. 원리를 배운 것이 아니라 답을 외웠기 때문이죠.
      </p>
      <p>
        머신러닝 모델도 똑같은 실수를 합니다. 훈련 데이터의 우연한 잡음까지 그대로 따라 그리면 훈련 데이터에서는 오차가 0에 가까워지지만 처음 보는 데이터에서는 엉망이 됩니다. 이것을 <T en="overfitting">과적합</T>이라고 합니다. 반대로 모델이 너무 단순해서 훈련 데이터의 패턴조차 못 잡는 것은 <T en="underfitting">과소적합</T>입니다.
      </p>
      <p>
        우리가 정말 원하는 것은 처음 보는 데이터에서도 잘 맞히는 능력, 즉 <T en="generalization">일반화</T>입니다.
      </p>

      <h2>복잡도를 직접 조절해 보기</h2>
      <p>
        아래 데이터는 매끄러운 곡선에 잡음을 섞어 만든 것입니다. 모델은 다항식 <M>{'\\hat y = c_0 + c_1x + c_2x^2 + \\cdots + c_dx^d'}</M>이고, 차수 <M>{'d'}</M>가 클수록 더 구불구불한 곡선을 그릴 수 있습니다. 차수를 1부터 15까지 올려 보세요.
      </p>
      <FitFigure />
      <Callout kind="intuition">
        <ul style={{ margin: 0 }}>
          <li>차수 1~2: 직선이나 포물선으로는 물결을 못 따라갑니다. 훈련 오차와 검증 오차가 둘 다 큽니다.</li>
          <li>차수 4~7 근처: 두 오차가 모두 작고 비슷합니다. 데이터에 맞는 복잡도입니다.</li>
          <li>차수 12 이상: 곡선이 점 사이를 억지로 지나가느라 요동칩니다. 훈련 오차는 가장 작지만 검증 오차는 치솟습니다.</li>
        </ul>
      </Callout>

      <h2>데이터를 셋으로 나누는 이유</h2>
      <p>
        모델의 실력을 공정하게 재려면 학습에 쓰지 않은 데이터가 필요합니다. 그래서 보통 데이터를 세 덩어리로 나눕니다.
      </p>
      <ul>
        <li>
          <strong>훈련 세트</strong>: 가중치를 학습하는 데 씁니다. 교과서와 연습문제입니다.
        </li>
        <li>
          <strong>검증 세트</strong>: 차수나 λ 같은 설정(하이퍼파라미터)을 고르는 데 씁니다. 모의고사입니다.
        </li>
        <li>
          <strong>테스트 세트</strong>: 모든 결정을 마친 뒤 딱 한 번 최종 성능을 잽니다. 수능입니다. 테스트 점수를 보고 모델을 다시 고치면 테스트 세트도 결국 외워 버리게 됩니다.
        </li>
      </ul>

      <h2>편향과 분산</h2>
      <p>
        모델의 오차는 크게 두 가지 원인으로 나눌 수 있습니다. <T en="bias">편향</T>은 모델이 너무 단순해서 생기는 체계적인 빗나감이고, <T en="variance">분산</T>은 모델이 훈련 데이터의 사소한 차이에 너무 민감해서 생기는 흔들림입니다. 같은 실험을 데이터만 바꿔 24번 반복하면 둘의 차이가 눈에 보입니다.
      </p>
      <BiasVarianceFigure />
      <MB note="σ²는 데이터 자체의 잡음으로, 어떤 모델로도 줄일 수 없습니다.">{'\\mathbb{E}\\big[(y - \\hat{y})^2\\big] = \\text{편향}^2 + \\text{분산} + \\sigma^2'}</MB>
      <p>복잡도를 올리면 편향은 줄고 분산은 늘어납니다. 둘의 합이 가장 작아지는 지점을 찾는 것이 모델 선택의 핵심이고, 이를 <T en="bias-variance tradeoff">편향-분산 트레이드오프</T>라고 부릅니다.</p>

      <h2>과적합을 막는 방법</h2>
      <h3>1. 데이터를 더 모은다</h3>
      <p>그림 1에서 차수를 12에 두고 데이터 개수를 150까지 늘려 보세요. 점이 빽빽하면 곡선이 점 사이에서 요동칠 틈이 없어서 복잡한 모델도 얌전해집니다. 가장 확실하지만 가장 비싼 방법입니다.</p>
      <h3>2. 정규화로 가중치에 벌금을 매긴다</h3>
      <p>
        <T en="regularization">정규화</T>는 손실 함수에 "가중치가 크면 벌점"을 더하는 방법입니다. 구불구불한 곡선은 대개 아주 큰 계수들이 서로 상쇄하면서 만들어지므로, 계수를 작게 유지하면 곡선이 매끄러워집니다.
      </p>
      <MB note="L2 정규화(릿지). λ가 클수록 가중치를 더 강하게 0 쪽으로 끌어당깁니다.">{'L_{\\text{reg}} = \\frac{1}{N}\\sum_{i}(y_i - \\hat{y}_i)^2 + \\lambda \\sum_{j} c_j^2'}</MB>
      <p>그림 1에서 차수를 15로 올린 다음 λ를 서서히 키워 보세요. 요동치던 곡선이 차분해지고 검증 오차가 내려갑니다. λ를 너무 키우면 이번에는 곡선이 평평해져 과소적합으로 넘어갑니다.</p>
      <h3>3. 그 밖의 방법</h3>
      <p>검증 오차가 오르기 시작하면 학습을 멈추는 조기 종료, 학습 중 뉴런 일부를 무작위로 끄는 드롭아웃, 이미지를 뒤집고 잘라서 데이터를 불리는 데이터 증강도 딥러닝에서 널리 씁니다.</p>
      <Callout kind="key">훈련 오차가 낮다는 것만으로는 아무것도 증명되지 않습니다. 모델의 진짜 실력은 학습에 쓰지 않은 데이터로만 잴 수 있고, 좋은 모델은 데이터가 가진 패턴만큼만 복잡합니다.</Callout>
      <Quiz
        q="훈련 오차는 0.01로 매우 낮은데 검증 오차가 0.9로 높습니다. 가장 알맞은 조치는?"
        options={['모델을 더 복잡하게 만든다', '정규화를 강하게 하거나 데이터를 더 모은다', '학습을 더 오래 시킨다', '검증 세트를 훈련 세트에 합쳐서 검증 오차를 없앤다']}
        answer={1}
        explain={<>훈련 오차와 검증 오차의 차이가 크면 과적합입니다. 모델의 자유도를 줄이거나(정규화, 더 단순한 모델) 데이터를 늘려야 합니다. 검증 세트를 없애는 것은 체온계를 버려서 열을 내리는 것과 같습니다.</>}
      />
    </>
  );
}
