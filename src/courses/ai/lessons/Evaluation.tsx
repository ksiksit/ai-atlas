import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../components/ui';
import { useCanvas2D, useDrag } from '../../../lib/canvas';
import { Plot, fmt } from '../../../lib/plot';
import { alpha, usePalette } from '../../../lib/theme';
import { clamp, gauss, rng } from '../../../lib/math';

/* ─────────────── shared metric helpers ─────────────── */

interface CM {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}
const accuracy = (c: CM) => (c.tp + c.tn) / Math.max(1, c.tp + c.fp + c.fn + c.tn);
const precision = (c: CM) => (c.tp + c.fp ? c.tp / (c.tp + c.fp) : NaN);
const recall = (c: CM) => (c.tp + c.fn ? c.tp / (c.tp + c.fn) : NaN);
const f1 = (c: CM) => {
  const p = precision(c);
  const r = recall(c);
  return isFinite(p) && isFinite(r) && p + r > 0 ? (2 * p * r) / (p + r) : 0;
};
const pct = (v: number) => (isFinite(v) ? `${(v * 100).toFixed(1)}%` : '정의 안 됨');

function ConfusionMatrix({ c, posName, negName }: { c: CM; posName: string; negName: string }) {
  const cell = (label: string, sub: string, v: number, good: boolean) => (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        background: `color-mix(in srgb, ${good ? 'var(--good)' : 'var(--bad)'} ${good ? 14 : 12}%, var(--surface))`,
        border: `1px solid color-mix(in srgb, ${good ? 'var(--good)' : 'var(--bad)'} 35%, transparent)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: '0.72rem', color: good ? 'var(--good)' : 'var(--bad)', fontWeight: 700, letterSpacing: '0.04em' }}>{label}</span>
      <span className="mono" style={{ fontSize: '1.35rem', fontWeight: 600, lineHeight: 1.2 }}>
        {v}
      </span>
      <span style={{ fontSize: '0.72rem', color: 'var(--ink-3)', lineHeight: 1.35 }}>{sub}</span>
    </div>
  );
  const head: CSSProperties = { fontSize: '0.72rem', color: 'var(--ink-3)', textAlign: 'center', alignSelf: 'end', lineHeight: 1.3 };
  const side: CSSProperties = { fontSize: '0.72rem', color: 'var(--ink-3)', textAlign: 'center', alignSelf: 'center', lineHeight: 1.4, width: 34 };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) minmax(0,1fr)', gap: 6, alignItems: 'stretch' }}>
      <span />
      <span style={head}>
        예측: <strong style={{ color: 'var(--pos)' }}>{posName}</strong>
      </span>
      <span style={head}>
        예측: <strong style={{ color: 'var(--neg)' }}>{negName}</strong>
      </span>
      <span style={side}>
        실제
        <br />
        <strong style={{ color: 'var(--pos)' }}>{posName}</strong>
      </span>
      {cell('TP 참양성', `${posName}을 ${posName}으로`, c.tp, true)}
      {cell('FN 거짓음성', `${posName}을 놓침`, c.fn, false)}
      <span style={side}>
        실제
        <br />
        <strong style={{ color: 'var(--neg)' }}>{negName}</strong>
      </span>
      {cell('FP 거짓양성', `${negName}을 ${posName}으로 오해`, c.fp, false)}
      {cell('TN 참음성', `${negName}을 ${negName}으로`, c.tn, true)}
    </div>
  );
}

/* ─────────────── Figure 1: threshold, confusion matrix, ROC ─────────────── */

const N_NEG = 240;
const N_POS = 160;
const BASE = (() => {
  const r = rng(21);
  return {
    neg: Array.from({ length: N_NEG }, () => gauss(r)),
    pos: Array.from({ length: N_POS }, () => gauss(r)),
  };
})();
const SPREAD = 0.13;

function ThresholdFigure() {
  const P = usePalette();
  const [th, setTh] = useState(0.55);
  const [sep, setSep] = useState(0.28);
  const plotRef = useRef<Plot | null>(null);

  const scores = useMemo(
    () => ({
      neg: BASE.neg.map((z) => clamp(0.5 - sep / 2 + z * SPREAD, 0.001, 0.999)),
      pos: BASE.pos.map((z) => clamp(0.5 + sep / 2 + z * SPREAD, 0.001, 0.999)),
    }),
    [sep],
  );
  const cm: CM = useMemo(
    () => ({
      tp: scores.pos.filter((s) => s >= th).length,
      fn: scores.pos.filter((s) => s < th).length,
      fp: scores.neg.filter((s) => s >= th).length,
      tn: scores.neg.filter((s) => s < th).length,
    }),
    [scores, th],
  );
  const roc = useMemo(() => {
    const all = [...scores.pos.map((s) => ({ s, y: 1 })), ...scores.neg.map((s) => ({ s, y: 0 }))].sort((a, b) => b.s - a.s);
    const pts: [number, number][] = [[0, 0]];
    let tp = 0;
    let fp = 0;
    for (const d of all) {
      if (d.y) tp++;
      else fp++;
      pts.push([fp / N_NEG, tp / N_POS]);
    }
    let auc = 0;
    for (let i = 1; i < pts.length; i++) auc += (pts[i][0] - pts[i - 1][0]) * (pts[i][1] + pts[i - 1][1]) * 0.5;
    return { pts, auc };
  }, [scores]);

  const dist = useCanvas2D(
    (ctx, { w, h }) => {
      const BW = 0.025;
      const nb = Math.round(1 / BW);
      const hp = new Array(nb).fill(0);
      const hn = new Array(nb).fill(0);
      scores.pos.forEach((s) => hp[Math.min(nb - 1, Math.floor(s / BW))]++);
      scores.neg.forEach((s) => hn[Math.min(nb - 1, Math.floor(s / BW))]++);
      const top = Math.max(30, ...hp, ...hn) * 1.08;
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: 1, yMin: -top, yMax: top, pad: { l: 14, r: 14, t: 12, b: 26 } });
      plotRef.current = plot;
      // predicted-positive region
      ctx.fillStyle = alpha(P.pos, 0.07);
      ctx.fillRect(plot.X(th), plot.pad.t, plot.X(1) - plot.X(th), plot.ph);
      plot.grid({ xStep: 0.1, yStep: top * 2, labels: false, axes: true });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      for (let k = 0; k <= (w < 560 ? 10 : 8); k += 2) ctx.fillText((k / 10).toFixed(1), plot.X(k / 10), plot.pad.t + plot.ph + 16);
      for (let i = 0; i < nb; i++) {
        const x0 = i * BW;
        const right = x0 + BW / 2 >= th;
        const X0 = plot.X(x0) + 1;
        const Wd = plot.X(x0 + BW) - plot.X(x0) - 2;
        if (hp[i]) {
          ctx.fillStyle = right ? P.pos : alpha(P.pos, 0.3);
          ctx.fillRect(X0, plot.Y(hp[i]), Wd, plot.Y(0) - plot.Y(hp[i]));
        }
        if (hn[i]) {
          ctx.fillStyle = right ? alpha(P.neg, 0.3) : P.neg;
          ctx.fillRect(X0, plot.Y(0), Wd, plot.Y(-hn[i]) - plot.Y(0));
        }
      }
      // threshold
      const tx = plot.X(th);
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(tx, plot.pad.t);
      ctx.lineTo(tx, plot.pad.t + plot.ph);
      ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.beginPath();
      ctx.roundRect(tx - 7, plot.Y(0) - 14, 14, 28, 5);
      ctx.fill();
      ctx.strokeStyle = P.surface;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tx - 2, plot.Y(0) - 6);
      ctx.lineTo(tx - 2, plot.Y(0) + 6);
      ctx.moveTo(tx + 2, plot.Y(0) - 6);
      ctx.lineTo(tx + 2, plot.Y(0) + 6);
      ctx.stroke();
      const f = `600 12px ${P.fontBody}`;
      plot.text('스팸 메일 ↑', 0.01, top * 0.9, P.pos, { font: f });
      plot.text('정상 메일 ↓', 0.01, -top * 0.9, P.neg, { font: f });
      const narrow = w < 560;
      const label = narrow ? `기준 ${th.toFixed(2)}` : `기준 ${th.toFixed(2)} 이상이면 스팸함으로`;
      const leftSide = th > (narrow ? 0.7 : 0.6);
      plot.text(label, th, top * 0.9, P.ink, { dx: leftSide ? -12 : 12, align: leftSide ? 'right' : 'left', font: `12px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
      if (!narrow) {
        ctx.fillStyle = P.ink3;
        ctx.font = `11px ${P.fontBody}`;
        ctx.textAlign = 'right';
        ctx.fillText('모델이 매긴 스팸 점수 →', plot.pad.l + plot.pw, plot.pad.t + plot.ph + 16);
      }
    },
    [P, scores, th],
    { aspect: 2.5, maxHeight: 320, minHeight: 220 },
  );

  useDrag(dist.canvasRef, {
    hit: () => 'th',
    onDrag: (_id, x) => {
      const p = plotRef.current;
      if (p) setTh(Math.round(clamp(p.invX(x), 0.02, 0.98) * 100) / 100);
    },
  });

  const rocC = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: 1, yMin: 0, yMax: 1, pad: { l: 44, r: 12, t: 12, b: 34 } });
      plot.grid({ xStep: 0.25, yStep: 0.25, axes: false });
      const c = ctx;
      c.save();
      c.beginPath();
      c.moveTo(plot.X(0), plot.Y(0));
      roc.pts.forEach(([x, y]) => c.lineTo(plot.X(x), plot.Y(y)));
      c.lineTo(plot.X(1), plot.Y(0));
      c.closePath();
      c.fillStyle = alpha(P.ml, 0.14);
      c.fill();
      c.beginPath();
      roc.pts.forEach(([x, y], i) => (i ? c.lineTo(plot.X(x), plot.Y(y)) : c.moveTo(plot.X(x), plot.Y(y))));
      c.strokeStyle = P.ml;
      c.lineWidth = 2.5;
      c.stroke();
      c.restore();
      plot.line(0, 0, 1, 1, P.ink3, 1.2, [5, 5]);
      plot.text('무작위 추측', 0.62, 0.55, P.ink3, { font: `11px ${P.fontBody}` });
      const fpr = cm.fp / N_NEG;
      const tpr = cm.tp / N_POS;
      plot.dot(fpr, tpr, 7, P.ink, P.surface, 2);
      plot.text(`AUC ${roc.auc.toFixed(3)}`, 0.95, 0.08, P.ml, { align: 'right', font: `700 13px ${P.fontMono}` });
      c.fillStyle = P.ink2;
      c.font = `11px ${P.fontBody}`;
      c.textAlign = 'center';
      c.fillText('거짓양성률 (FPR)', plot.X(0.5), plot.pad.t + plot.ph + 26);
      c.save();
      c.translate(10, plot.Y(0.5));
      c.rotate(-Math.PI / 2);
      c.fillText('재현율 (TPR)', 0, 0);
      c.restore();
    },
    [P, roc, cm],
    { aspect: 1.15, maxHeight: 340, minHeight: 240 },
  );

  return (
    <Figure no={1} title="스팸 필터의 기준선 정하기" hint="세로 기준선을 좌우로 끌어 보세요" caption={<>위쪽 막대는 실제 스팸 메일, 아래쪽 막대는 실제 정상 메일이 받은 점수 분포입니다. 기준선 오른쪽(진한 주황, 옅은 파랑)은 스팸함으로 갑니다. 기준을 바꾸면 혼동행렬의 네 칸이 서로 맞바뀌고, ROC 곡선 위의 큰 점이 움직입니다.</>}>
      <div ref={dist.wrapRef} className="canvas-box grab">
        <canvas ref={dist.canvasRef} />
      </div>
      <div className="controls row">
        <Slider id="ev-th" label="판정 기준 (임계값)" value={th} min={0.02} max={0.98} step={0.01} onChange={setTh} format={(v) => v.toFixed(2)} />
        <Slider id="ev-sep" label="모델의 구분 능력" value={sep} min={0} max={0.7} step={0.01} onChange={setSep} format={(v) => (v < 0.1 ? '거의 없음' : v < 0.3 ? '보통' : v < 0.5 ? '좋음' : '아주 좋음')} color="var(--c-ml)" />
      </div>
      <div className="fig-cols" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <ConfusionMatrix c={cm} posName="스팸" negName="정상" />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="정확도" value={pct(accuracy(cm))} />
            <Readout label="정밀도" value={pct(precision(cm))} color="var(--pos)" />
            <Readout label="재현율" value={pct(recall(cm))} color="var(--c-ml)" />
            <Readout label="F1 점수" value={fmt(f1(cm), 3)} />
          </div>
        </div>
        <div ref={rocC.wrapRef} className="canvas-box">
          <canvas ref={rocC.canvasRef} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: imbalanced data trap ─────────────── */

const COLS = 40;
const ROWS = 25;
const TOTAL = COLS * ROWS;
const SICK = (() => {
  const r = rng(5);
  const s = new Set<number>();
  while (s.size < 10) s.add(Math.floor(r() * TOTAL));
  return [...s];
})();
const HEALTHY_ORDER = (() => {
  const r = rng(77);
  const arr = Array.from({ length: TOTAL }, (_, i) => i).filter((i) => !SICK.includes(i));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
})();

type ModelId = 'lazy' | 'sensitive' | 'balanced';
const MODELS: Record<ModelId, { name: string; miss: number; fp: number; note: string }> = {
  lazy: { name: '항상 "정상"', miss: 10, fp: 0, note: '아무것도 배우지 않고 모든 사람에게 "정상"이라고 답합니다.' },
  sensitive: { name: '예민한 모델', miss: 1, fp: 60, note: '조금만 의심스러워도 "환자"라고 답합니다. 환자는 거의 다 찾지만 오진이 많습니다.' },
  balanced: { name: '균형 모델', miss: 3, fp: 12, note: '기준을 중간쯤에 둔 모델입니다.' },
};

function ImbalanceFigure() {
  const P = usePalette();
  const [m, setM] = useState<ModelId>('lazy');
  const model = MODELS[m];
  const { predPos, cm } = useMemo(() => {
    const predPos = new Set<number>([...SICK.slice(model.miss), ...HEALTHY_ORDER.slice(0, model.fp)]);
    const tp = 10 - model.miss;
    const cm: CM = { tp, fn: model.miss, fp: model.fp, tn: TOTAL - 10 - model.fp };
    return { predPos, cm };
  }, [model]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cs = Math.min(w / COLS, h / ROWS);
      const ox = (w - cs * COLS) / 2;
      const sickSet = new Set(SICK);
      for (let i = 0; i < TOTAL; i++) {
        const x = ox + (i % COLS) * cs;
        const y = Math.floor(i / COLS) * cs;
        const sick = sickSet.has(i);
        const pred = predPos.has(i);
        let col = P.surface3;
        if (sick && pred) col = P.good;
        else if (sick && !pred) col = P.bad;
        else if (!sick && pred) col = P.hl;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.roundRect(x + 1, y + 1, cs - 2, cs - 2, Math.min(2, cs / 5));
        ctx.fill();
        if (sick) {
          ctx.strokeStyle = P.ink;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    },
    [P, predPos],
    { aspect: COLS / ROWS, maxHeight: 400, minHeight: 120 },
  );

  return (
    <Figure no={2} title="1,000명 중 환자 10명: 정확도의 함정" hint="모델을 바꿔 보세요" caption={<>칸 하나가 한 사람이고, 테두리가 진한 10칸이 실제 환자입니다. "항상 정상" 모델은 정확도가 99%나 되지만 환자를 한 명도 찾지 못합니다. 이런 불균형 데이터에서는 정확도 하나만 보면 안 됩니다.</>}>
      <Seg
        value={m}
        onChange={setM}
        options={(Object.keys(MODELS) as ModelId[]).map((k) => ({ value: k, label: MODELS[k].name }))}
      />
      <div ref={wrapRef} className="canvas-box" style={{ background: 'transparent' }}>
        <canvas ref={canvasRef} />
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>{model.note}</div>
      <div className="readouts">
        <Readout label="정확도" value={pct(accuracy(cm))} />
        <Readout label="재현율 (환자 중 찾은 비율)" value={pct(recall(cm))} color={recall(cm) < 0.5 ? 'var(--bad)' : 'var(--good)'} />
        <Readout label="정밀도 (환자 판정 중 진짜)" value={pct(precision(cm))} />
        <Readout label="F1 점수" value={fmt(f1(cm), 3)} />
      </div>
      <Legend
        items={[
          { color: 'var(--good)', label: `찾아낸 환자 TP ${cm.tp}`, shape: 'sq' },
          { color: 'var(--bad)', label: `놓친 환자 FN ${cm.fn}`, shape: 'sq' },
          { color: 'var(--hl)', label: `오진 FP ${cm.fp}`, shape: 'sq' },
          { color: 'var(--surface-3)', label: `정상 판정 TN ${cm.tn}`, shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Evaluation() {
  return (
    <>
      <h2>"정확도 99%"는 좋은 모델일까?</h2>
      <p>
        희귀병 진단 모델을 만들었는데 정확도가 99%라고 합니다. 훌륭해 보이지만, 그 병에 걸린 사람이 100명 중 1명뿐이라면 이야기가 달라집니다. 모든 사람에게 "건강합니다"라고만 답해도 정확도는 99%이기 때문입니다. 모델을 제대로 평가하려면 <strong>무엇을</strong> 틀렸는지 나눠서 봐야 합니다.
      </p>

      <h2>혼동행렬: 맞힘과 틀림을 네 칸으로</h2>
      <p>
        이진 분류의 결과는 네 가지뿐입니다. 실제 양성을 양성으로 맞힌 <T en="True Positive">참양성 TP</T>, 실제 음성을 음성으로 맞힌 <T en="True Negative">참음성 TN</T>, 음성을 양성으로 잘못 본 <T en="False Positive">거짓양성 FP</T>, 양성을 놓친 <T en="False Negative">거짓음성 FN</T>입니다. 이 네 칸을 표로 정리한 것이 <T en="confusion matrix">혼동행렬</T>입니다.
      </p>
      <p>
        분류 모델은 대개 바로 "스팸이다"라고 답하지 않고 0에서 1 사이의 점수(확률)를 냅니다. 점수가 몇 이상일 때 스팸으로 판정할지는 우리가 정하는 <T en="threshold">임계값</T>입니다. 같은 모델이라도 임계값에 따라 네 칸의 숫자가 완전히 달라집니다.
      </p>
      <ThresholdFigure />

      <h2>정밀도와 재현율</h2>
      <p>혼동행렬에서 두 가지 중요한 비율을 뽑을 수 있습니다.</p>
      <MB note="정밀도: 모델이 양성이라고 한 것 중 진짜 양성의 비율. 재현율: 진짜 양성 중 모델이 찾아낸 비율.">{'\\text{정밀도} = \\frac{TP}{TP + FP}, \\qquad \\text{재현율} = \\frac{TP}{TP + FN}'}</MB>
      <p>
        그림 1에서 기준선을 오른쪽으로 옮기면 모델이 신중해져서 정밀도가 오르고 재현율이 내려갑니다. 왼쪽으로 옮기면 반대가 됩니다. 둘을 동시에 올리는 유일한 방법은 기준선이 아니라 모델 자체를 개선하는 것입니다. "구분 능력"을 올려서 두 분포가 멀어지면 둘 다 좋아지는 것을 확인해 보세요.
      </p>
      <p>
        둘 중 무엇을 중시할지는 틀렸을 때의 대가가 정합니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>상황</th>
              <th>더 아픈 실수</th>
              <th>중시할 지표</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>스팸 필터</td>
              <td>중요한 업무 메일이 스팸함에 들어가는 것 (FP)</td>
              <td>
                <strong>정밀도</strong>
              </td>
            </tr>
            <tr>
              <td>암 검진</td>
              <td>암 환자를 정상으로 돌려보내는 것 (FN)</td>
              <td>
                <strong>재현율</strong>
              </td>
            </tr>
            <tr>
              <td>카드 부정 사용 탐지</td>
              <td>부정 사용을 놓치는 것 (FN), 다만 정상 결제를 너무 자주 막아도 곤란</td>
              <td>재현율 위주, F1로 균형</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        두 지표를 하나로 합치고 싶을 때는 조화평균인 <T en="F1 score">F1 점수</T>를 씁니다. 조화평균은 둘 중 하나라도 낮으면 같이 낮아지기 때문에 한쪽만 높은 모델을 걸러 줍니다.
      </p>
      <MB>{'F_1 = \\frac{2 \\cdot \\text{정밀도} \\cdot \\text{재현율}}{\\text{정밀도} + \\text{재현율}}'}</MB>

      <h2>불균형 데이터의 함정</h2>
      <ImbalanceFigure />
      <Callout kind="warn">
        양성이 드문 문제(사기 탐지, 희귀병, 불량품 검출)에서는 정확도가 거의 쓸모없습니다. 정밀도, 재현율, F1을 함께 보고, 가능하면 혼동행렬을 직접 들여다보세요.
      </Callout>

      <h2>ROC 곡선과 AUC</h2>
      <p>
        임계값을 0부터 1까지 전부 훑으면서 (거짓양성률, 재현율)을 점으로 찍으면 곡선 하나가 생깁니다. 이것이 <T en="Receiver Operating Characteristic">ROC 곡선</T>입니다. 거짓양성률 <M>{'FPR = FP/(FP+TN)'}</M>은 정상 메일 중 스팸으로 잘못 간 비율입니다.
      </p>
      <p>
        완벽한 모델의 곡선은 왼쪽 위 모서리 (0, 1)을 지나고, 동전 던지기 수준의 모델은 대각선을 따라갑니다. 곡선 아래 넓이 <T en="Area Under the Curve">AUC</T>는 임계값과 무관하게 모델의 구분 능력을 숫자 하나로 요약합니다. 1이면 완벽, 0.5면 무작위입니다. 그림 1의 "구분 능력" 슬라이더를 움직이며 AUC가 어떻게 변하는지 보세요.
      </p>
      <Callout kind="intuition">AUC는 "무작위로 뽑은 스팸 하나와 정상 메일 하나를 비교했을 때 모델이 스팸에 더 높은 점수를 줄 확률"과 같습니다.</Callout>
      <Callout kind="key">평가 지표는 문제의 목적에 맞게 골라야 합니다. 모델이 내는 점수와, 그 점수를 판정으로 바꾸는 임계값은 별개의 결정입니다. 임계값은 틀렸을 때의 비용을 보고 정합니다.</Callout>
      <Quiz
        q="암 검진 모델의 임계값을 낮춰서 더 많은 사람을 '의심 환자'로 분류하면 어떻게 될까요?"
        options={['재현율은 오르고 정밀도는 대체로 내려간다', '재현율과 정밀도가 모두 오른다', '정밀도는 오르고 재현율은 내려간다', 'AUC가 오른다']}
        answer={0}
        explain={<>기준을 낮추면 진짜 환자를 더 많이 찾아내지만(재현율↑) 건강한 사람도 더 많이 의심받습니다(FP↑, 정밀도↓). AUC는 모든 임계값을 아우르는 값이라 임계값을 바꿔도 변하지 않습니다.</>}
      />
    </>
  );
}
