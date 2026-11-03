import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { fmt } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { clamp, gauss, mean, quantileSorted, rng, variance } from '../../../../lib/math';
import { lessonHref } from '../../../index';
import { axisLine, fiveNumber, stackLevels, tag } from '../../shared';

/* ─────────────── Figure 1: mean as balance point, median as middle ─────────────── */

const SALARIES = [210, 230, 240, 250, 260, 270, 290, 310, 340];
const BOSS = 760;
const S_MIN = 150;
const S_MAX = 800;

function MeanMedianFigure() {
  const P = usePalette();
  const [xs, setXs] = useState<number[]>(SALARIES);
  const boss = xs.length > SALARIES.length;
  const geom = useRef<{ X: (v: number) => number; inv: (px: number) => number; pts: { x: number; y: number }[]; r: number } | null>(null);
  const [active, setActive] = useState<number | null>(null);

  const m = mean(xs);
  const med = quantileSorted([...xs].sort((a, b) => a - b), 0.5);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const padX = 22;
      const X = (v: number) => padX + ((v - S_MIN) / (S_MAX - S_MIN)) * (w - 2 * padX);
      const inv = (px: number) => S_MIN + ((px - padX) / (w - 2 * padX)) * (S_MAX - S_MIN);
      const beam = h - 82;
      const r = w < 520 ? 7 : 9;
      const px = xs.map(X);
      const lv = stackLevels(px, 2 * r + 1);
      const pts = px.map((x, i) => ({ x, y: beam - r - 2 - lv[i] * (2 * r + 2) }));
      geom.current = { X, inv, pts, r };

      // median: a dashed line through the middle of the data
      const xMed = X(med);
      ctx.strokeStyle = P.pos;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(xMed, 34);
      ctx.lineTo(xMed, beam);
      ctx.stroke();
      ctx.setLineDash([]);
      tag(ctx, P, `중앙값 ${fmt(med, 0)}`, clamp(xMed, 50, w - 50), 22, P.pos);

      // the beam the dots sit on, and the mean as the fulcrum that balances it
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(S_MIN), beam + 0.5);
      ctx.lineTo(X(S_MAX), beam + 0.5);
      ctx.stroke();
      const xm = X(m);
      ctx.fillStyle = P.accent;
      ctx.beginPath();
      ctx.moveTo(xm, beam + 2);
      ctx.lineTo(xm - 10, beam + 18);
      ctx.lineTo(xm + 10, beam + 18);
      ctx.closePath();
      ctx.fill();
      tag(ctx, P, `평균 ${fmt(m, 0)}`, clamp(xm, 46, w - 46), beam + 30, P.accent);

      // dots
      xs.forEach((v, i) => {
        const { x, y } = pts[i];
        const isBoss = boss && i === xs.length - 1;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = isBoss ? P.pos : active === i ? P.ink : alpha(P.ink, 0.72);
        ctx.fill();
        if (isBoss) {
          ctx.fillStyle = P.ink2;
          ctx.font = `11px ${P.fontBody}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('사장님', x, y - r - 4);
        }
      });

      axisLine(ctx, P, X, h - 34, S_MIN, S_MAX, 100, '월급 (만원)');
    },
    [P, xs, active, m, med, boss],
    { aspect: 2.5, maxHeight: 300, minHeight: 240 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      const g = geom.current;
      if (!g) return null;
      let best = -1;
      let bd = g.r + 8;
      g.pts.forEach((p, i) => {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best >= 0 ? best : null;
    },
    onDrag: (id, x) => {
      const g = geom.current!;
      const v = clamp(Math.round(g.inv(x) / 5) * 5, S_MIN, S_MAX);
      setActive(id as number);
      setXs((cur) => cur.map((c, i) => (i === id ? v : c)));
    },
    onEnd: () => setActive(null),
  });

  return (
    <Figure
      no={1}
      title="평균은 균형점, 중앙값은 한가운데"
      hint="점을 좌우로 끌어 보세요"
      caption={<>점 하나가 직원 한 명의 월급입니다. 파란 삼각형(평균)은 막대가 기울지 않는 받침점 자리이고, 주황 점선(중앙값)은 크기순으로 줄 세웠을 때 한가운데 사람입니다. 사장님을 추가하면 평균은 크게 끌려가지만 중앙값은 거의 움직이지 않습니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="btn-row">
            <Button small primary onClick={() => setXs(boss ? xs.slice(0, -1) : [...xs, BOSS])}>
              {boss ? '사장님 빼기' : `사장님 추가 (${BOSS}만원)`}
            </Button>
            <Button small onClick={() => setXs(SALARIES)}>
              원래대로
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="인원 n" value={`${xs.length}명`} />
            <Readout label="평균" value={fmt(m, 1)} color="var(--accent)" />
            <Readout label="중앙값" value={fmt(med, 1)} color="var(--pos)" />
            <Readout label="평균 − 중앙값" value={fmt(m - med, 1)} />
          </div>
          <Legend
            items={[
              { color: 'var(--accent)', label: '평균 (받침점)', shape: 'sq' },
              { color: 'var(--pos)', label: '중앙값', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: deviations, variance and standard deviation ─────────────── */

const CLASSES: Record<'A' | 'B', number[]> = {
  A: [62, 65, 68, 70, 70, 72, 75, 78],
  B: [45, 55, 62, 70, 72, 80, 86, 90],
};
const C_MEAN = 70;

function SpreadFigure() {
  const P = usePalette();
  const [cls, setCls] = useState<'A' | 'B'>('B');
  const [k, setK] = useState(1);
  const xs = CLASSES[cls].map((v) => C_MEAN + (v - C_MEAN) * k);
  const m = mean(xs);
  const devs = xs.map((x) => x - m);
  const v = variance(xs);
  const sd = Math.sqrt(v);
  const mad = mean(devs.map(Math.abs));

  const ROW = 30;
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w }) => {
      const textW = w < 520 ? 92 : 120;
      const padL = 18;
      const plotR = w - textW - 12;
      const lo = 30;
      const hi = 110;
      const X = (val: number) => padL + ((val - lo) / (hi - lo)) * (plotR - padL);
      const top = 30;
      const bottom = top + xs.length * ROW;

      // ±1σ band
      ctx.fillStyle = alpha(P.accent, 0.1);
      ctx.fillRect(X(m - sd), top - 8, X(m + sd) - X(m - sd), bottom - top + 8);
      tag(ctx, P, '−1σ', X(m - sd), top - 16, alpha(P.accent, 0.85));
      tag(ctx, P, '+1σ', X(m + sd), top - 16, alpha(P.accent, 0.85));

      // mean line
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(X(m), top - 8);
      ctx.lineTo(X(m), bottom);
      ctx.stroke();

      // column header
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('편차 d', plotR + textW * 0.48, top - 16);
      ctx.fillText('d²', w - 8, top - 16);

      xs.forEach((x, i) => {
        const y = top + i * ROW + ROW / 2;
        const d = devs[i];
        const col = d >= 0 ? P.pos : P.neg;
        ctx.strokeStyle = col;
        ctx.lineWidth = 4;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(X(m), y);
        ctx.lineTo(X(x), y);
        ctx.stroke();
        ctx.fillStyle = P.ink;
        ctx.beginPath();
        ctx.arc(X(x), y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `12px ${P.fontMono}`;
        ctx.fillStyle = col;
        ctx.fillText(fmt(d, 1), plotR + textW * 0.48, y);
        ctx.fillStyle = P.ink2;
        ctx.fillText(fmt(d * d, 0), w - 8, y);
      });

      axisLine(ctx, P, X, bottom + 10, lo, hi, 10, '점수');
    },
    [P, xs.join(','), m, sd],
    { height: 30 + 8 * ROW + 46 },
  );

  return (
    <Figure
      no={2}
      title="평균에서 얼마나 떨어져 있나"
      hint="반을 바꾸고 흩어짐을 조절해 보세요"
      caption={<>한 줄이 학생 한 명입니다. 막대는 평균에서의 거리, 즉 편차입니다. 오른쪽(주황)은 양수, 왼쪽(파랑)은 음수라서 그냥 더하면 항상 0이 됩니다. 그래서 제곱해서 부호를 없앤 뒤 평균을 냅니다. 파란 띠는 평균 ± 1 표준편차 범위입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg
            label="데이터"
            value={cls}
            onChange={setCls}
            options={[
              { value: 'A', label: '1반 (고른 편)' },
              { value: 'B', label: '2반 (들쭉날쭉)' },
            ]}
          />
          <Slider id="sp-k" label="흩어짐 배율" value={k} min={0} max={1.2} step={0.05} onChange={setK} format={(x) => '×' + fmt(x, 2)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="평균" value={fmt(m, 1)} />
            <Readout label="편차의 합" value={fmt(Math.abs(devs.reduce((a, b) => a + b, 0)) < 1e-9 ? 0 : devs.reduce((a, b) => a + b, 0), 1)} />
            <Readout label="분산 σ²" value={fmt(v, 1)} />
            <Readout label="표준편차 σ" value={fmt(sd, 2)} color="var(--accent)" />
            <Readout label="평균 절대편차" value={fmt(mad, 2)} />
            <Readout label="범위" value={fmt(Math.max(...xs) - Math.min(...xs), 1)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: histogram and box plot ─────────────── */

type Shape = 'sym' | 'right' | 'bimodal';

const SHAPES: Record<Shape, { name: string; label: string; lo: number; hi: number; step: number; digits: number; draw: (r: () => number) => number }> = {
  sym: { name: '대칭', label: '키 (cm)', lo: 145, hi: 195, step: 10, digits: 1, draw: (r) => 170 + 7 * gauss(r) },
  right: { name: '한쪽 꼬리', label: '월소득 (만원)', lo: 0, hi: 1400, step: 200, digits: 0, draw: (r) => Math.exp(Math.log(280) + 0.55 * gauss(r)) },
  bimodal: { name: '두 봉우리', label: '카페 주문 시각 (시)', lo: 6, hi: 18, step: 2, digits: 2, draw: (r) => (r() < 0.55 ? 8.6 + 0.9 * gauss(r) : 13.2 + 1.2 * gauss(r)) },
};

function sample(shape: Shape, seed: number, n = 300): number[] {
  const s = SHAPES[shape];
  const r = rng(seed);
  const out: number[] = [];
  while (out.length < n) {
    const v = s.draw(r);
    if (v > s.lo && v < s.hi) out.push(v);
  }
  return out;
}

function ShapeFigure() {
  const P = usePalette();
  const [shape, setShape] = useState<Shape>('right');
  const [seed, setSeed] = useState(3);
  const [bins, setBins] = useState(20);
  const cfg = SHAPES[shape];
  const data = useMemo(() => sample(shape, seed), [shape, seed]);
  const five = useMemo(() => fiveNumber(data), [data]);
  const m = mean(data);
  const sd = Math.sqrt(variance(data, true));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const padX = 18;
      const X = (v: number) => padX + ((v - cfg.lo) / (cfg.hi - cfg.lo)) * (w - 2 * padX);
      const axisY = h - 34;
      const boxY = axisY - 34;
      const histTop = 46;
      const histBottom = boxY - 30;

      // histogram
      const bw = (cfg.hi - cfg.lo) / bins;
      const counts = new Array(bins).fill(0);
      for (const v of data) counts[Math.min(bins - 1, Math.floor((v - cfg.lo) / bw))]++;
      const cMax = Math.max(...counts) * 1.08;
      ctx.fillStyle = alpha(P.stats1, 0.7);
      for (let i = 0; i < bins; i++) {
        const x0 = X(cfg.lo + i * bw);
        const x1 = X(cfg.lo + (i + 1) * bw);
        const bh = (counts[i] / cMax) * (histBottom - histTop);
        ctx.fillRect(x0 + 0.5, histBottom - bh, Math.max(1, x1 - x0 - 1), bh);
      }
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(cfg.lo), histBottom + 0.5);
      ctx.lineTo(X(cfg.hi), histBottom + 0.5);
      ctx.stroke();

      // mean and median lines through the histogram
      const lines: [number, string, string, number][] = [
        [m, P.accent, '평균', 14],
        [five.median, P.pos, '중앙값', 34],
      ];
      for (const [v, col, name, ty] of lines) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.setLineDash(name === '평균' ? [] : [5, 4]);
        ctx.beginPath();
        ctx.moveTo(X(v), ty + 9);
        ctx.lineTo(X(v), boxY + 12);
        ctx.stroke();
        ctx.setLineDash([]);
        tag(ctx, P, `${name} ${fmt(v, cfg.digits === 0 ? 0 : 1)}`, clamp(X(v), 54, w - 54), ty, col);
      }

      // box plot
      const bh = 22;
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(X(five.lo), boxY);
      ctx.lineTo(X(five.q1), boxY);
      ctx.moveTo(X(five.q3), boxY);
      ctx.lineTo(X(five.hi), boxY);
      ctx.moveTo(X(five.lo), boxY - 7);
      ctx.lineTo(X(five.lo), boxY + 7);
      ctx.moveTo(X(five.hi), boxY - 7);
      ctx.lineTo(X(five.hi), boxY + 7);
      ctx.stroke();
      ctx.fillStyle = P.surface;
      ctx.fillRect(X(five.q1), boxY - bh / 2, X(five.q3) - X(five.q1), bh);
      ctx.strokeRect(X(five.q1), boxY - bh / 2, X(five.q3) - X(five.q1), bh);
      ctx.strokeStyle = P.pos;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(X(five.median), boxY - bh / 2);
      ctx.lineTo(X(five.median), boxY + bh / 2);
      ctx.stroke();
      ctx.strokeStyle = P.ink2;
      ctx.lineWidth = 1.2;
      for (const o of five.outliers) {
        ctx.beginPath();
        ctx.arc(X(o), boxY, 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      axisLine(ctx, P, X, axisY, cfg.lo, cfg.hi, cfg.step, cfg.label);
    },
    [P, data, bins, shape],
    { aspect: 2.0, maxHeight: 380, minHeight: 280 },
  );

  return (
    <Figure
      no={3}
      title="히스토그램과 상자그림"
      hint="분포 모양과 칸 수를 바꿔 보세요"
      caption={<>같은 데이터 300개를 두 가지로 그렸습니다. 위의 히스토그램은 구간마다 몇 개가 들어갔는지 세어 모양을 보여 주고, 아래 상자그림은 다섯 개의 숫자(최솟값 쪽 끝, Q1, 중앙값, Q3, 최댓값 쪽 끝)로 요약합니다. 상자 밖으로 멀리 떨어진 동그라미는 이상치 후보입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg
            label="데이터 모양"
            value={shape}
            onChange={setShape}
            options={(Object.keys(SHAPES) as Shape[]).map((s) => ({ value: s, label: SHAPES[s].name }))}
          />
          <Slider id="sh-bins" label="히스토그램 칸 수" value={bins} min={5} max={50} step={1} onChange={setBins} />
          <div className="btn-row">
            <Button small onClick={() => setSeed((s) => s + 1)}>
              새로 300개 뽑기
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="평균" value={fmt(m, 1)} color="var(--accent)" />
            <Readout label="중앙값" value={fmt(five.median, 1)} color="var(--pos)" />
            <Readout label="표준편차" value={fmt(sd, 1)} />
            <Readout label="IQR (Q3 − Q1)" value={fmt(five.q3 - five.q1, 1)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Summary() {
  return (
    <>
      <h2>숫자 더미를 몇 개의 숫자로</h2>
      <p>
        어느 반 학생 30명의 시험 점수가 엑셀에 한 줄로 적혀 있다고 해 봅시다. 숫자를 하나하나 읽어서는 "이 반은 잘 봤나?"라는 질문에 답하기 어렵습니다. 그래서 통계학은 먼저 데이터를 <strong>요약</strong>합니다. 요약에는 크게 두 가지 질문이 있습니다. 값들이 <strong>어디쯤에 모여 있는가</strong>(가운데), 그리고 <strong>얼마나 흩어져 있는가</strong>(퍼짐)입니다.
      </p>
      <p>이 장에서 다루는 것을 <T en="descriptive statistics">기술통계</T>라고 부릅니다. 가진 데이터를 있는 그대로 정리하는 단계이고, 다음 장부터는 이 요약값을 가지고 보지 못한 전체를 추측하는 추론으로 넘어갑니다.</p>

      <h2>가운데를 나타내는 두 숫자</h2>
      <p>
        가장 익숙한 것은 <T en="mean">평균</T>입니다. 모든 값을 더해 개수로 나눈 값이죠. 또 하나는 <T en="median">중앙값</T>으로, 값들을 크기순으로 줄 세웠을 때 정확히 한가운데 있는 값입니다. 개수가 짝수면 가운데 두 값의 평균을 씁니다.
      </p>
      <MB note="x̄(엑스 바)는 평균을 뜻하는 기호입니다.">{'\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i = \\frac{x_1 + x_2 + \\cdots + x_n}{n}'}</MB>
      <p>두 숫자는 보통 비슷하지만, 값 하나가 유난히 클 때 극적으로 갈라집니다. 작은 회사 직원 9명의 월급으로 확인해 보세요.</p>
      <MeanMedianFigure />
      <Callout kind="intuition">
        평균은 막대 위에 놓인 추들이 수평을 이루는 받침점입니다. 멀리 있는 추 하나가 막대를 크게 기울이듯, 멀리 떨어진 값 하나가 평균을 많이 끌어당깁니다. 중앙값은 "몇 번째인가"만 보기 때문에 맨 끝 값이 얼마나 큰지에는 관심이 없습니다. 그래서 소득이나 집값처럼 일부가 아주 큰 데이터에서는 중앙값이 "보통 사람"을 더 잘 나타냅니다.
      </Callout>

      <h2>얼마나 흩어져 있는가</h2>
      <p>
        평균이 똑같이 70점인 두 반이 있어도, 한 반은 모두 60~80점이고 다른 반은 40점부터 90점까지 퍼져 있다면 전혀 다른 반입니다. 퍼짐을 재는 가장 자연스러운 방법은 각 값이 평균에서 얼마나 떨어져 있는지, 즉 <T en="deviation">편차</T> <M>{'x_i - \\bar{x}'}</M>를 보는 것입니다.
      </p>
      <p>그런데 편차를 그냥 더하면 양수와 음수가 정확히 상쇄되어 언제나 0이 됩니다. 평균이 바로 그런 자리이기 때문입니다. 그래서 편차를 제곱해서 모두 양수로 만든 다음 평균을 냅니다.</p>
      <MB note="분산은 단위가 제곱(점²)이라서, 다시 제곱근을 씌워 원래 단위로 돌린 것이 표준편차입니다.">{'\\sigma^2 = \\frac{1}{n}\\sum_{i=1}^{n}(x_i - \\bar{x})^2 \\qquad \\sigma = \\sqrt{\\sigma^2}'}</MB>
      <SpreadFigure />
      <p>
        흩어짐 배율을 0으로 내리면 모든 학생이 평균에 모이고 표준편차도 0이 됩니다. 배율을 두 배로 늘리면 표준편차도 정확히 두 배가 되지만 분산은 네 배가 됩니다. 표준편차가 "평균에서 보통 이 정도 떨어져 있다"는 거리 감각과 맞는 이유입니다.
      </p>
      <p>
        분산은 다른 곳에서도 만납니다. 모든 학생의 점수를 평균 하나로 예측했을 때의 오차 제곱의 평균이 바로 분산입니다. 인공지능 분야의 <a href={lessonHref('ai-basics', 'linear-regression')}>선형회귀</a>에서 쓰는 평균제곱오차(MSE)와 같은 계산이죠.
      </p>
      <Callout kind="note">
        가진 데이터가 전체가 아니라 전체에서 뽑은 일부(표본)일 때는 n 대신 <M>{'n-1'}</M>로 나눈 <M>{'s^2 = \\frac{1}{n-1}\\sum (x_i - \\bar{x})^2'}</M>를 씁니다. 표본평균이 표본 자신에게 맞춰져 있어서 편차가 실제보다 조금 작게 나오는 것을 보정하는 것입니다. n이 크면 둘의 차이는 거의 없습니다.
      </Callout>

      <h2>모양을 보는 그림</h2>
      <p>
        숫자 두세 개로는 놓치는 것이 있습니다. 봉우리가 하나인지 둘인지, 한쪽으로 꼬리가 길게 늘어졌는지 같은 <strong>모양</strong>입니다. 모양을 보려면 그림을 그려야 합니다. <T en="histogram">히스토그램</T>은 값의 범위를 같은 너비의 칸으로 나누고 칸마다 몇 개가 들어갔는지 막대로 세웁니다. <T en="box plot">상자그림</T>은 데이터를 네 등분하는 경계인 <T en="quartile">사분위수</T> Q1(25%), 중앙값(50%), Q3(75%)를 상자로 그립니다. 상자의 길이 Q3 − Q1을 사분위범위(IQR)라고 부르며, 가운데 절반의 데이터가 이 안에 들어 있습니다.
      </p>
      <ShapeFigure />
      <p>
        "한쪽 꼬리"(소득)를 보면 평균이 중앙값보다 오른쪽에 있습니다. 소수의 고소득자가 평균을 끌어당겼기 때문입니다. "대칭"(키)에서는 두 선이 거의 겹치고, 이 경우 히스토그램은 인공지능 분야의 <a href={lessonHref('ai-basics', 'probability')}>확률과 분포</a> 장에서 본 정규분포 모양과 닮았습니다. "두 봉우리"(카페 주문 시각)에서는 평균이 아무도 주문하지 않는 시간대에 놓입니다. 아침 손님과 점심 손님이라는 두 집단이 섞여 있으니 숫자 하나로 요약하면 안 되는 데이터입니다.
      </p>
      <p>칸 수도 바꿔 보세요. 너무 적으면 모양이 뭉개지고, 너무 많으면 잡음 때문에 들쭉날쭉합니다. 히스토그램은 같은 데이터라도 그리는 방법에 따라 인상이 달라질 수 있습니다.</p>

      <Callout kind="key">
        데이터를 요약할 때는 가운데(평균, 중앙값), 퍼짐(표준편차, IQR), 모양(히스토그램)을 함께 봅니다. 한쪽으로 치우쳤거나 이상치가 있으면 중앙값과 IQR이 더 믿을 만하고, 봉우리가 여럿이면 숫자 하나로 요약하기 전에 집단을 나눠 봐야 합니다.
      </Callout>
      <Quiz
        q="어느 나라의 가구 소득 평균이 중앙값보다 훨씬 크다. 가장 그럴듯한 설명은?"
        options={['대부분의 가구가 평균보다 많이 번다', '소득이 아주 높은 소수의 가구가 평균을 끌어올렸다', '소득 분포의 표준편차가 0이다', '조사한 가구 수가 너무 적다']}
        answer={1}
        explain={<>평균은 멀리 떨어진 값에 끌려가지만 중앙값은 순서만 봅니다. 오른쪽으로 꼬리가 긴 분포에서는 평균이 중앙값보다 커지고, 실제로는 절반 이상의 가구가 평균보다 적게 법니다.</>}
      />
    </>
  );
}
