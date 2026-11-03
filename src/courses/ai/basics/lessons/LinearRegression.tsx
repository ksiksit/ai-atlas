import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot, fmt } from '../../../../lib/plot';
import { alpha, lerpColor, usePalette } from '../../../../lib/theme';
import { gauss, rng } from '../../../../lib/math';

type P2 = { x: number; y: number };

const X0 = 0;
const X1 = 10;
const Y0 = 0;
const Y1 = 110;
const W_RANGE: [number, number] = [-5, 20];
const B_RANGE: [number, number] = [-20, 100];

function sampleData(): P2[] {
  const r = rng(11);
  const pts: P2[] = [];
  for (let i = 0; i < 14; i++) {
    const x = 0.6 + (i / 13) * 8.8 + (r() - 0.5) * 0.6;
    const y = 28 + 6.4 * x + gauss(r) * 7;
    pts.push({ x: Math.round(x * 10) / 10, y: Math.round(Math.max(2, Math.min(105, y))) });
  }
  return pts;
}

function mse(pts: P2[], w: number, b: number) {
  if (!pts.length) return 0;
  let s = 0;
  for (const p of pts) {
    const e = p.y - (w * p.x + b);
    s += e * e;
  }
  return s / pts.length;
}

/** Closed-form least squares. */
function bestFit(pts: P2[]): { w: number; b: number } {
  const n = pts.length;
  if (n < 2) return { w: 0, b: n ? pts[0].y : 50 };
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
  }
  const w = sxx > 1e-9 ? sxy / sxx : 0;
  return { w, b: my - w * mx };
}

/** Least absolute deviation via iteratively reweighted least squares. */
function l1Fit(pts: P2[]): { w: number; b: number } {
  let { w, b } = bestFit(pts);
  for (let it = 0; it < 40; it++) {
    let sw = 0;
    let swx = 0;
    let swy = 0;
    let swxx = 0;
    let swxy = 0;
    for (const p of pts) {
      const r = Math.abs(p.y - (w * p.x + b));
      const k = 1 / Math.max(r, 0.5);
      sw += k;
      swx += k * p.x;
      swy += k * p.y;
      swxx += k * p.x * p.x;
      swxy += k * p.x * p.y;
    }
    const det = sw * swxx - swx * swx;
    if (Math.abs(det) < 1e-9) break;
    w = (sw * swxy - swx * swy) / det;
    b = (swy - w * swx) / sw;
  }
  return { w, b };
}

/* ─────────────── Figure 1: fit a line by hand ─────────────── */

function FitFigure({ pts, setPts, w, b, setW, setB, animateTo }: { pts: P2[]; setPts: (f: (p: P2[]) => P2[]) => void; w: number; b: number; setW: (v: number) => void; setB: (v: number) => void; animateTo: (w: number, b: number) => void }) {
  const P = usePalette();
  const [squares, setSquares] = useState(true);
  const plotRef = useRef<Plot | null>(null);
  const loss = mse(pts, w, b);
  const best = bestFit(pts);
  const bestLoss = mse(pts, best.w, best.b);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: cw, h }) => {
      const plot = new Plot(ctx, cw, h, P, { xMin: X0, xMax: X1, yMin: Y0, yMax: Y1, pad: { l: 40, r: 12, t: 12, b: 32 } });
      plotRef.current = plot;
      plot.grid({ xStep: 1, yStep: 10, xLabel: '공부 시간 (시간)', yLabel: '시험 점수 (점)' });
      plot.clip();
      if (squares) {
        for (const p of pts) {
          const yh = w * p.x + b;
          const side = Math.abs(plot.Y(p.y) - plot.Y(yh));
          const left = plot.X(p.x) + 1;
          const top = Math.min(plot.Y(p.y), plot.Y(yh));
          ctx.fillStyle = alpha(P.bad, 0.12);
          ctx.strokeStyle = alpha(P.bad, 0.45);
          ctx.lineWidth = 1;
          ctx.fillRect(left, top, side, side);
          ctx.strokeRect(left + 0.5, top + 0.5, side - 1, side - 1);
        }
      }
      // residual lines
      for (const p of pts) plot.line(p.x, p.y, p.x, w * p.x + b, P.bad, 1.5);
      plot.unclip();
      plot.slopeLine(0, b, w, P.ml, 3);
      for (const p of pts) plot.dot(p.x, p.y, 6, P.neg, P.surface, 2);
      // equation label
      ctx.font = `600 13px ${P.fontMono}`;
      ctx.fillStyle = P.ml;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`ŷ = ${fmt(w, 2)}x ${b < 0 ? '−' : '+'} ${fmt(Math.abs(b), 1)}`, cw - 18, 20);
    },
    [P, pts, w, b, squares],
    { aspect: 1.45, maxHeight: 440, minHeight: 260 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      const p = plotRef.current;
      if (!p) return null;
      let bestI = -1;
      let bestD = 16;
      pts.forEach((q, i) => {
        const d = Math.hypot(p.X(q.x) - x, p.Y(q.y) - y);
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      });
      return bestI >= 0 ? bestI : null;
    },
    onDrag: (id, x, y) => {
      const p = plotRef.current!;
      const nx = Math.round(Math.max(X0, Math.min(X1, p.invX(x))) * 10) / 10;
      const ny = Math.round(Math.max(Y0, Math.min(Y1, p.invY(y))));
      setPts((old) => old.map((q, i) => (i === id ? { x: nx, y: ny } : q)));
    },
    onEmpty: (x, y) => {
      const p = plotRef.current;
      if (!p || pts.length >= 40) return;
      if (x < p.pad.l || x > p.w - p.pad.r || y < p.pad.t || y > p.h - p.pad.b) return;
      setPts((old) => [...old, { x: Math.round(p.invX(x) * 10) / 10, y: Math.round(p.invY(y)) }]);
    },
  });

  const ratio = bestLoss > 0 ? loss / bestLoss : 1;
  return (
    <Figure
      no={1}
      title="직선을 손으로 맞춰 보기"
      hint="점은 끌어서 옮기고, 빈 곳을 누르면 추가됩니다"
      caption={<>빨간 정사각형 하나의 넓이가 그 점의 오차의 제곱입니다. 평균제곱오차(MSE)는 이 정사각형들의 평균 넓이입니다. 기울기와 절편을 바꿔 정사각형들이 가장 작아지는 직선을 찾아보세요.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="lr-w" label={<>기울기 w (시간당 점수)</>} value={w} min={W_RANGE[0]} max={W_RANGE[1]} step={0.1} onChange={setW} format={(v) => fmt(v, 1)} color="var(--c-ml)" />
          <Slider id="lr-b" label={<>절편 b (기본 점수)</>} value={b} min={B_RANGE[0]} max={B_RANGE[1]} step={0.5} onChange={setB} format={(v) => fmt(v, 1)} color="var(--c-ml)" />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="현재 MSE" value={fmt(loss, 1)} color="var(--bad)" />
            <Readout label="최소 MSE" value={fmt(bestLoss, 1)} color="var(--good)" />
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>{ratio < 1.01 ? '최적의 직선입니다.' : `최적보다 오차가 ${fmt(ratio, 1)}배 큽니다.`}</div>
          <Button primary onClick={() => animateTo(best.w, best.b)}>
            최적 직선 찾기
          </Button>
          <div className="btn-row">
            <Button small onClick={() => setPts(() => sampleData())}>
              예시 데이터
            </Button>
            <Button small onClick={() => setPts(() => [])}>
              점 모두 지우기
            </Button>
          </div>
          <Check label="오차의 제곱(정사각형) 보기" checked={squares} onChange={setSquares} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: loss landscape over (w, b) ─────────────── */

function LandscapeFigure({ pts, w, b, setW, setB }: { pts: P2[]; w: number; b: number; setW: (v: number) => void; setB: (v: number) => void }) {
  const P = usePalette();
  const plotRef = useRef<Plot | null>(null);
  const best = useMemo(() => bestFit(pts), [pts]);
  const heat = useRef<{ key: string; img: HTMLCanvasElement } | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: cw, h }) => {
      const plot = new Plot(ctx, cw, h, P, { xMin: W_RANGE[0], xMax: W_RANGE[1], yMin: B_RANGE[0], yMax: B_RANGE[1], pad: { l: 40, r: 12, t: 12, b: 32 } });
      plotRef.current = plot;
      const key = `${cw}x${h}|${P.dark}|${pts.map((p) => p.x + ',' + p.y).join(';')}`;
      if (!heat.current || heat.current.key !== key) {
        // render the heatmap into an offscreen canvas once per data/size/theme
        const off = document.createElement('canvas');
        off.width = cw;
        off.height = h;
        const octx = off.getContext('2d')!;
        const op = new Plot(octx, cw, h, P, { xMin: W_RANGE[0], xMax: W_RANGE[1], yMin: B_RANGE[0], yMax: B_RANGE[1], pad: plot.pad });
        const lo = Math.log(mse(pts, best.w, best.b) + 1);
        const hiV = Math.log(mse(pts, W_RANGE[1], B_RANGE[1]) + 1);
        const cLo = P.dark ? '#24a483' : '#0c8467';
        const cHi = P.dark ? '#1b2437' : '#f3f5f8';
        op.heatmap((ww, bb) => {
          const v = pts.length ? (Math.log(mse(pts, ww, bb) + 1) - lo) / (hiV - lo || 1) : 1;
          const t = Math.max(0, Math.min(1, v));
          const band = Math.floor(t * 14) % 2 === 0 ? 1 : 0.93;
          const c = lerpColor(cLo, cHi, Math.pow(t, 0.7));
          return [c[0] * band, c[1] * band, c[2] * band, 255];
        }, 3);
        heat.current = { key, img: off };
      }
      ctx.drawImage(heat.current.img, 0, 0, cw, h);
      plot.grid({ xStep: 5, yStep: 20, axes: false, xLabel: '기울기 w', yLabel: '절편 b' });
      plot.frame();
      if (pts.length >= 2) {
        // optimum star
        const sx = plot.X(best.w);
        const sy = plot.Y(best.b);
        ctx.fillStyle = P.hl;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 ? 4 : 10;
          ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      plot.dot(w, b, 8, P.surface, P.pos, 3);
      plot.text(`MSE ${fmt(mse(pts, w, b), 1)}`, w, b, P.ink, { dx: 14, dy: -14, bg: alpha(P.surface, 0.9), font: `600 12px ${P.fontMono}` });
    },
    [P, pts, w, b, best],
    { aspect: 1.45, maxHeight: 440, minHeight: 260 },
  );

  useDrag(canvasRef, {
    hit: () => 'm',
    onDrag: (_id, x, y) => {
      const p = plotRef.current!;
      setW(Math.round(Math.max(W_RANGE[0], Math.min(W_RANGE[1], p.invX(x))) * 10) / 10);
      setB(Math.round(Math.max(B_RANGE[0], Math.min(B_RANGE[1], p.invY(y))) * 2) / 2);
    },
  });

  return (
    <Figure
      no={2}
      title="손실 지형: 모든 (w, b)의 MSE를 한눈에"
      hint="지도 위를 누르거나 끌어 보세요"
      caption={<>가로축은 기울기, 세로축은 절편입니다. 한 점은 직선 하나에 해당하고, 색이 진할수록 그 직선의 MSE가 작습니다. 그림 1에서 슬라이더를 움직이면 이 지도의 주황 점도 함께 움직입니다. 노란 별이 가장 낮은 골짜기, 즉 최적의 직선입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="현재 (w, b)" value={`${fmt(w, 1)}, ${fmt(b, 1)}`} color="var(--pos)" />
            <Readout label="최적 (w*, b*)" value={`${fmt(best.w, 1)}, ${fmt(best.b, 1)}`} />
          </div>
          <Legend
            items={[
              { color: 'var(--pos)', label: '지금 고른 직선' },
              { color: 'var(--hl)', label: '최적의 직선' },
              { color: 'var(--c-ml)', label: '손실이 낮은 곳', shape: 'sq' },
            ]}
          />
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', margin: 0 }}>
            골짜기가 비스듬하고 길쭉한 모양인 것에 주목하세요. 기울기를 키우면 절편을 줄여야 비슷한 직선이 되기 때문에, 두 값은 서로 맞물려 움직입니다.
          </p>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: outlier — MSE vs MAE ─────────────── */

function OutlierFigure() {
  const P = usePalette();
  const base = useMemo(() => sampleData().slice(0, 10), []);
  const [out, setOut] = useState<P2>({ x: 8.5, y: 12 });
  const plotRef = useRef<Plot | null>(null);
  const all = [...base, out];
  const l2 = bestFit(all);
  const l1 = l1Fit(all);
  const clean = bestFit(base);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: cw, h }) => {
      const plot = new Plot(ctx, cw, h, P, { xMin: X0, xMax: X1, yMin: Y0, yMax: Y1, pad: { l: 40, r: 12, t: 12, b: 32 } });
      plotRef.current = plot;
      plot.grid({ xStep: 1, yStep: 10, xLabel: '공부 시간', yLabel: '점수' });
      plot.slopeLine(0, clean.b, clean.w, P.ink3, 1.5, [5, 5]);
      plot.slopeLine(0, l1.b, l1.w, P.neg, 3);
      plot.slopeLine(0, l2.b, l2.w, P.bad, 3);
      for (const p of base) plot.dot(p.x, p.y, 5, P.ink2, P.surface, 1.5);
      plot.dot(out.x, out.y, 9, P.surface, P.pos, 3);
      plot.text('이상치', out.x, out.y, P.pos, { dx: out.x > 7 ? -14 : 14, dy: out.y > 80 ? 16 : -16, align: out.x > 7 ? 'right' : 'left', bg: alpha(P.surface, 0.9) });
    },
    [P, out, base],
    { aspect: 1.5, maxHeight: 400, minHeight: 240 },
  );
  useDrag(canvasRef, {
    hit: (x, y) => {
      const p = plotRef.current;
      if (!p) return null;
      return Math.hypot(p.X(out.x) - x, p.Y(out.y) - y) < 20 ? 'o' : null;
    },
    onDrag: (_id, x, y) => {
      const p = plotRef.current!;
      setOut({ x: Math.max(X0, Math.min(X1, p.invX(x))), y: Math.max(Y0, Math.min(Y1, p.invY(y))) });
    },
  });

  return (
    <Figure
      no={3}
      title="이상치 하나가 직선을 끌어당길 때"
      hint="주황 점을 끌어 보세요"
      caption={<>제곱 오차(MSE)는 큰 오차를 제곱으로 키우기 때문에 이상치 하나에 직선이 크게 끌려갑니다. 절댓값 오차(MAE)로 맞춘 파란 직선은 훨씬 덜 흔들립니다. 어떤 손실을 고르느냐가 곧 모델이 무엇을 중요하게 여길지 정하는 일입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Legend
            items={[
              { color: 'var(--bad)', label: 'MSE로 맞춘 직선', shape: 'ln' },
              { color: 'var(--neg)', label: 'MAE로 맞춘 직선', shape: 'ln' },
              { color: 'var(--ink-3)', label: '이상치가 없을 때', shape: 'ln' },
            ]}
          />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="MSE 직선의 기울기" value={fmt(l2.w, 2)} color="var(--bad)" />
            <Readout label="MAE 직선의 기울기" value={fmt(l1.w, 2)} color="var(--neg)" />
            <Readout label="이상치 없을 때 기울기" value={fmt(clean.w, 2)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function LinearRegression() {
  const [pts, setPtsRaw] = useState<P2[]>(sampleData);
  const [w, setWRaw] = useState(2);
  const [b, setBRaw] = useState(62);
  const anim = useRef(0);

  const stopAnim = () => cancelAnimationFrame(anim.current);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  const setW = (v: number) => {
    stopAnim();
    setWRaw(v);
  };
  const setB = (v: number) => {
    stopAnim();
    setBRaw(v);
  };
  const setPts = (f: (p: P2[]) => P2[]) => setPtsRaw(f);

  const animateTo = (tw: number, tb: number) => {
    stopAnim();
    const w0 = w;
    const b0 = b;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 1 : 900;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      setWRaw(w0 + (tw - w0) * e);
      setBRaw(b0 + (tb - b0) * e);
      if (t < 1) anim.current = requestAnimationFrame(tick);
    };
    anim.current = requestAnimationFrame(tick);
  };

  return (
    <>
      <h2>머신러닝의 세 가지 재료</h2>
      <p>
        학생 14명의 공부 시간과 시험 점수가 있다고 해 봅시다. 새 학생이 6시간 공부했다면 몇 점쯤 받을까요? 점들을 보면 공부를 많이 할수록 점수가 오르는 경향이 보입니다. 이 경향을 직선 하나로 요약하는 것이 <T en="linear regression">선형회귀</T>입니다.
      </p>
      <p>단순한 문제지만 머신러닝의 모든 재료가 들어 있습니다.</p>
      <ul>
        <li>
          <strong>모델</strong>: 입력으로 출력을 계산하는 식. 여기서는 직선 <M>{'\\hat{y} = wx + b'}</M>입니다. <M>w</M>와 <M>b</M>를 <T en="parameter">파라미터</T>라고 부르고, 학습이란 이 값을 정하는 일입니다.
        </li>
        <li>
          <strong>손실 함수</strong>: 모델이 얼마나 틀렸는지 재는 자. 여기서는 평균제곱오차입니다.
        </li>
        <li>
          <strong>최적화</strong>: 손실이 가장 작아지는 파라미터를 찾는 방법.
        </li>
      </ul>

      <h2>오차를 정사각형으로 재기</h2>
      <p>
        직선이 예측한 값 <M>{'\\hat{y}'}</M>과 실제 값 <M>y</M>의 차이를 <T en="residual">잔차</T>라고 합니다. 잔차는 양수일 수도 음수일 수도 있어서 그냥 더하면 서로 상쇄됩니다. 그래서 제곱해서 더합니다. 제곱은 말 그대로 정사각형의 넓이이니, 그림으로 그려 보면 아주 직관적입니다.
      </p>
      <FitFigure pts={pts} setPts={setPts} w={w} b={b} setW={setW} setB={setB} animateTo={animateTo} />
      <MB note="n개 데이터의 잔차 제곱을 평균 낸 값. 작을수록 직선이 데이터를 잘 설명합니다.">{'\\text{MSE}(w, b) = \\frac{1}{n}\\sum_{i=1}^{n}\\bigl(y_i - \\hat{y}_i\\bigr)^2 = \\frac{1}{n}\\sum_{i=1}^{n}\\bigl(y_i - (w x_i + b)\\bigr)^2'}</MB>

      <h2>손실 지형</h2>
      <p>
        MSE는 <M>w</M>와 <M>b</M>를 넣으면 숫자 하나가 나오는 함수입니다. 그렇다면 가능한 모든 <M>{'(w, b)'}</M> 조합에 대해 MSE를 계산해 지도처럼 칠해 볼 수 있습니다. 이 지도를 <T en="loss landscape">손실 지형</T>이라고 부릅니다. 직선을 찾는 문제가 지형에서 가장 낮은 곳을 찾는 문제로 바뀝니다.
      </p>
      <LandscapeFigure pts={pts} w={w} b={b} setW={setW} setB={setB} />
      <p>
        선형회귀의 손실 지형은 그릇 모양이라 바닥이 딱 하나뿐입니다. 그래서 미분해서 기울기가 0이 되는 곳을 풀면 답이 공식으로 바로 나옵니다. "최적 직선 찾기" 버튼이 쓰는 공식이 이것입니다.
      </p>
      <MB note="x̄, ȳ는 평균. 기울기는 x와 y가 함께 변하는 정도(공분산)를 x의 퍼짐(분산)으로 나눈 값입니다.">{'w^* = \\frac{\\sum_i (x_i - \\bar{x})(y_i - \\bar{y})}{\\sum_i (x_i - \\bar{x})^2}, \\qquad b^* = \\bar{y} - w^*\\bar{x}'}</MB>
      <Callout kind="intuition">
        공식으로 바로 풀 수 있는 것은 모델이 직선이고 손실이 제곱이라 지형이 매끈한 그릇이기 때문입니다. 신경망처럼 파라미터가 수백만 개이고 지형이 울퉁불퉁하면 이런 공식이 없습니다. 그때는 지형의 기울기를 따라 조금씩 내려가야 하는데, 이것이 다음 장의 <a href="#ai-basics/gradient-descent">경사하강법</a>입니다.
      </Callout>

      <h2>손실 함수의 선택은 가치 판단이다</h2>
      <p>
        왜 굳이 제곱일까요? 제곱은 미분하기 쉽고, 큰 오차를 특히 심하게 벌줍니다. 그런데 이 성질이 단점이 되기도 합니다. 데이터에 입력 실수 같은 이상치가 하나 섞이면 그 점의 거대한 정사각형을 줄이려고 직선 전체가 끌려갑니다.
      </p>
      <OutlierFigure />
      <p>
        오차의 절댓값을 평균 내는 <T en="mean absolute error">MAE</T>는 이상치에 덜 민감하지만 최적점을 공식으로 구하기 어렵습니다. 실전에서는 데이터의 성격에 맞춰 손실을 고릅니다. 집값 예측처럼 큰 실수가 치명적이면 MSE, 이상치가 많으면 MAE나 둘을 섞은 후버 손실을 씁니다.
      </p>
      <Callout kind="key">
        머신러닝은 <strong>모델</strong>(어떤 모양의 함수를 쓸까), <strong>손실</strong>(무엇을 틀렸다고 볼까), <strong>최적화</strong>(어떻게 손실을 줄일까)의 조합입니다. 선형회귀는 이 셋이 가장 단순한 형태로 모인 예이고, 딥러닝은 모델을 훨씬 크고 유연하게 바꾼 것일 뿐 구조는 같습니다.
      </Callout>
      <Quiz
        q="데이터 (1, 2), (2, 4), (3, 6)에 직선 ŷ = x + 1을 맞췄을 때 MSE는?"
        options={['0', '2/3', '5/3', '3']}
        answer={2}
        explain={<>예측값은 2, 3, 4이고 잔차는 0, 1, 2입니다. 제곱하면 0, 1, 4이고, 합 5를 데이터 수 3으로 나누면 5/3입니다. 참고로 이 데이터의 최적 직선은 ŷ = 2x이고 그때 MSE는 0입니다.</>}
      />
    </>
  );
}
