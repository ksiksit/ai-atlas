import { useMemo, useRef, useState } from 'react';
import { Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { binomialPmf, rng } from '../../../../lib/math';
import { lessonHref } from '../../../index';
import { Reroll, bars, label, useMathColors } from './parts';
import { harmonic, pct, shuffleInPlace } from './prob';
import './probability.css';

/* ─────────────── Figure 1: an editable PMF and its balance point ─────────────── */

const XS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const YMAX = 20;
type Preset = 'flat' | 'skew' | 'two' | 'one';
const PRESETS: Record<Preset, { label: string; w: number[] }> = {
  skew: { label: '오른쪽 꼬리', w: [3, 12, 16, 11, 7, 4, 3, 2, 2] },
  flat: { label: '균등', w: [6, 6, 6, 6, 6, 6, 6, 6, 6] },
  two: { label: '두 봉우리', w: [2, 14, 9, 2, 0, 1, 3, 10, 6] },
  one: { label: '한 값', w: [0, 0, 0, 0, 14, 0, 0, 0, 0] },
};

function moments(p: number[], xs: number[]) {
  const mu = p.reduce((a, pi, i) => a + pi * xs[i], 0);
  const ex2 = p.reduce((a, pi, i) => a + pi * xs[i] * xs[i], 0);
  const v = Math.max(0, ex2 - mu * mu);
  return { mu, ex2, v, sd: Math.sqrt(v) };
}

function PmfFigure() {
  const P = usePalette();
  const [c1, c2, c3] = useMathColors(P);
  const [w, setW] = useState<number[]>(PRESETS.skew.w);
  const [showVar, setShowVar] = useState(false);
  const total = w.reduce((a, b) => a + b, 0);
  const p = w.map((x) => (total > 0 ? x / total : 0));
  const { mu, ex2, v, sd } = moments(p, XS);
  const layout = useRef<Plot | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: W, h }) => {
      const topH = showVar ? h * 0.62 : h - 26;
      const plot = new Plot(ctx, W, topH, P, { xMin: -0.6, xMax: 8.6, yMin: 0, yMax: YMAX, pad: { l: 40, r: 12, t: 14, b: 26 } });
      layout.current = plot;
      plot.grid({ xStep: 1, yStep: 5, yLabel: '관찰 횟수', axes: false });
      // sd band
      if (total > 0) {
        ctx.fillStyle = alpha(c2, 0.1);
        ctx.fillRect(plot.X(mu - sd), plot.pad.t, plot.X(mu + sd) - plot.X(mu - sd), plot.ph);
      }
      bars(plot, w, alpha(c1, 0.75), { stroke: c1, width: 0.72 });
      // drag handles and probability labels
      w.forEach((wi, i) => {
        const y = plot.Y(Math.min(wi, YMAX));
        ctx.fillStyle = P.surface;
        ctx.strokeStyle = c1;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(plot.X(i) - 9, y - 4, 18, 8, 3);
        ctx.fill();
        ctx.stroke();
        if (total > 0 && W > 420) label(ctx, P, p[i].toFixed(2), plot.X(i), y - 12, P.ink2, 'center', 'middle', 10, 500);
      });
      if (total > 0) {
        // fulcrum under the axis at the mean
        const fx = plot.X(mu);
        const fy = plot.pad.t + plot.ph;
        ctx.fillStyle = c3;
        ctx.beginPath();
        ctx.moveTo(fx, fy + 1);
        ctx.lineTo(fx - 9, fy + 15);
        ctx.lineTo(fx + 9, fy + 15);
        ctx.closePath();
        ctx.fill();
        plot.line(mu, 0, mu, YMAX, c3, 1.6, [4, 3]);
        plot.text(`E[X] = ${mu.toFixed(2)}`, mu, YMAX * 0.94, c3, { align: mu > 6 ? 'right' : 'left', dx: mu > 6 ? -6 : 6, bg: alpha(P.surface, 0.85) });
        plot.text(`±σ`, mu + sd, YMAX * 0.8, c2, { dx: 4, font: `600 11px ${P.fontBody}` });
      }
      if (showVar && total > 0) {
        const contrib = p.map((pi, i) => pi * (XS[i] - mu) ** 2);
        const cmax = Math.max(1, ...contrib) * 1.1;
        const low = new Plot(ctx, W, h - topH, P, { xMin: -0.6, xMax: 8.6, yMin: 0, yMax: cmax, pad: { l: 40, r: 12, t: 8, b: 24 } });
        ctx.save();
        ctx.translate(0, topH);
        low.grid({ axes: false, xStep: 1, yStep: cmax > 4 ? 2 : cmax > 2 ? 1 : 0.5, yLabel: 'p(x)·(x − μ)²' });
        bars(low, contrib, alpha(c2, 0.7), { stroke: c2, width: 0.72 });
        ctx.restore();
      }
    },
    [P, c1, c2, c3, w, showVar, mu, sd, total],
    { aspect: showVar ? 1.45 : 1.9, maxHeight: showVar ? 440 : 330, minHeight: 240 },
  );

  useDrag(wrapRef, {
    hit: (x, y) => {
      const plot = layout.current;
      if (!plot || y > plot.pad.t + plot.ph + 6) return null;
      const i = Math.round(plot.invX(x));
      return i >= 0 && i <= 8 && Math.abs(plot.X(i) - x) < Math.max(14, plot.sx * 0.45) ? i : null;
    },
    onDrag: (id, _x, y) => {
      const plot = layout.current;
      if (!plot) return;
      const val = Math.round(Math.max(0, Math.min(YMAX, plot.invY(y))));
      setW((ws) => ws.map((x, i) => (i === id ? val : x)));
    },
  });

  return (
    <Figure
      no={1}
      title="확률질량함수와 기댓값"
      hint="막대 끝을 위아래로 끌어 보세요"
      caption={<>X는 웹 페이지 하나를 그릴 때 보내는 DB 쿼리 수입니다. 막대 높이는 로그에서 센 횟수이고, 전체 횟수로 나눈 비율이 확률 p(x)입니다. 막대를 무게로 보면 삼각형 받침이 놓인 자리, 기댓값 E[X]에서 정확히 균형이 맞습니다. 옅은 띠는 평균에서 표준편차 σ만큼 양쪽입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`쿼리 수 0부터 8까지의 확률 막대그래프. 기댓값 ${mu.toFixed(2)}, 표준편차 ${sd.toFixed(2)}. 막대를 끌어 높이를 바꿀 수 있습니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="모양" value={(Object.keys(PRESETS) as Preset[]).find((k) => PRESETS[k].w.join() === w.join()) ?? ('' as Preset)} onChange={(k) => setW(PRESETS[k].w)} options={(Object.keys(PRESETS) as Preset[]).map((k) => ({ value: k, label: PRESETS[k].label }))} />
          <div className="ctl">
            <span className="ctl-label">
              <span>키보드로 고치기</span>
            </span>
            <div className="pr-words">
              {XS.map((x) => (
                <input
                  key={x}
                  type="number"
                  min={0}
                  max={YMAX}
                  value={w[x]}
                  aria-label={`쿼리 ${x}개인 횟수`}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(YMAX, Math.round(Number(e.target.value) || 0)));
                    setW((ws) => ws.map((y, i) => (i === x ? val : y)));
                  }}
                  className="pr-num"
                />
              ))}
            </div>
          </div>
          <Check label="분산에 기여하는 몫 보기" checked={showVar} onChange={setShowVar} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="E[X]" value={mu.toFixed(2)} color="var(--c-math-3)" />
            <Readout label="E[X²]" value={ex2.toFixed(2)} />
            <Readout label="Var(X)" value={v.toFixed(2)} color="var(--c-math-2)" />
            <Readout label="σ = √Var" value={sd.toFixed(2)} color="var(--c-math-2)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: linearity of expectation versus brute force ─────────────── */

type Puzzle = 'hat' | 'coupon';
const TRIALS = 2000;

function LinearityFigure() {
  const P = usePalette();
  const [c1, , c3] = useMathColors(P);
  const [puzzle, setPuzzle] = useState<Puzzle>('hat');
  const [n, setN] = useState(10);
  const [seed, setSeed] = useState(1);

  const sim = useMemo(() => {
    const r = rng(seed * 4099 + n * 7 + (puzzle === 'hat' ? 0 : 1));
    const out: number[] = [];
    if (puzzle === 'hat') {
      const a = Array.from({ length: n }, (_, i) => i);
      for (let t = 0; t < TRIALS; t++) {
        shuffleInPlace(a, r);
        let fixed = 0;
        for (let i = 0; i < n; i++) if (a[i] === i) fixed++;
        out.push(fixed);
      }
    } else {
      for (let t = 0; t < TRIALS; t++) {
        const seen = new Uint8Array(n);
        let got = 0;
        let draws = 0;
        while (got < n) {
          const k = Math.floor(r() * n);
          draws++;
          if (!seen[k]) {
            seen[k] = 1;
            got++;
          }
        }
        out.push(draws);
      }
    }
    return out;
  }, [puzzle, n, seed]);

  const expect = puzzle === 'hat' ? 1 : n * harmonic(n);
  const avg = sim.reduce((a, b) => a + b, 0) / sim.length;
  const maxV = Math.max(...sim);
  const binW = puzzle === 'hat' ? 1 : Math.max(1, Math.ceil((maxV + 1) / 40));
  const hist = useMemo(() => {
    const h = new Array(Math.ceil((maxV + 1) / binW) + 1).fill(0);
    for (const v of sim) h[Math.floor(v / binW)]++;
    return h.map((c) => c / sim.length);
  }, [sim, maxV, binW]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const xMax = puzzle === 'hat' ? Math.max(7, maxV + 1) : (maxV + 1) * 1.02;
      const yMax = Math.max(...hist) * 1.18;
      const plot = new Plot(ctx, w, h, P, { xMin: puzzle === 'hat' ? -0.7 : 0, xMax, yMin: 0, yMax, pad: { l: 44, r: 14, t: 14, b: 28 } });
      plot.grid({ axes: false, xStep: puzzle === 'hat' ? 1 : undefined, yLabel: '비율', xLabel: puzzle === 'hat' ? '제 모자를 받은 사람 수' : '모두 모을 때까지 뽑은 횟수', fmt: (v) => (v > 0 && v < 1 ? `${Math.round(v * 100)}%` : String(Math.round(v))) });
      if (puzzle === 'hat') bars(plot, hist, alpha(c1, 0.7), { width: 0.7 });
      else {
        ctx.fillStyle = alpha(c1, 0.7);
        hist.forEach((f, i) => {
          if (f <= 0) return;
          const l = plot.X(i * binW);
          const r2 = plot.X((i + 1) * binW);
          ctx.fillRect(l + 0.5, plot.Y(f), Math.max(1, r2 - l - 1), plot.Y(0) - plot.Y(f));
        });
      }
      plot.line(expect, 0, expect, yMax, c3, 2.2);
      plot.text(`선형성: ${expect.toFixed(puzzle === 'hat' ? 0 : 1)}`, expect, yMax * 0.93, c3, { dx: 6, bg: alpha(P.surface, 0.85) });
      plot.line(avg, 0, avg, yMax * 0.78, P.ink2, 1.4, [4, 3]);
      plot.text(`실험 평균 ${avg.toFixed(2)}`, avg, yMax * 0.8, P.ink2, { dx: 6, font: `500 11px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
    },
    [P, c1, c3, hist, expect, avg, puzzle, maxV, binW],
    { aspect: 2.1, maxHeight: 320, minHeight: 230 },
  );

  return (
    <Figure
      no={2}
      title="기댓값의 선형성으로 한 줄에 풀기"
      hint="문제를 바꾸고 n을 움직여 보세요"
      caption={
        puzzle === 'hat' ? (
          <>모자 {n}개를 섞어 아무렇게나 돌려줍니다. 막대는 {TRIALS.toLocaleString('ko-KR')}번 해 본 결과의 분포이고, 세로선은 지시변수와 선형성으로 구한 기댓값 1입니다. 사람이 몇 명이든 답은 1입니다.</>
        ) : (
          <>쿠폰 {n}종류 중 하나가 무작위로 든 과자를 계속 삽니다. 막대는 {TRIALS.toLocaleString('ko-KR')}번 해 본 결과의 분포이고, 세로선은 단계별 대기 시간의 기댓값을 더한 n·Hₙ입니다. 오른쪽으로 긴 꼬리가 있어서 운이 나쁘면 훨씬 오래 걸립니다.</>
        )
      }
    >
      <div className="controls row">
        <Seg label="문제" value={puzzle} onChange={setPuzzle} options={[{ value: 'hat', label: '모자 돌려주기' }, { value: 'coupon', label: '쿠폰 모으기' }]} />
        <Slider id="lin-n" label={puzzle === 'hat' ? '사람 수 n' : '쿠폰 종류 n'} value={n} min={2} max={50} step={1} onChange={setN} />
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Reroll onClick={() => setSeed((s) => s + 1)} />
        </div>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${puzzle === 'hat' ? '모자 돌려주기' : '쿠폰 모으기'} 시뮬레이션 ${TRIALS}번의 분포. 실험 평균 ${avg.toFixed(2)}, 선형성으로 구한 기댓값 ${expect.toFixed(2)}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <Readout label="선형성으로 구한 기댓값" value={puzzle === 'hat' ? '1' : `${n}·H${n} = ${expect.toFixed(1)}`} color="var(--c-math-3)" />
        <Readout label={`실험 평균 (${TRIALS}번)`} value={avg.toFixed(2)} />
        <Readout label={puzzle === 'hat' ? '분포를 직접 세려면' : '가장 오래 걸린 경우'} value={puzzle === 'hat' ? `순열 ${n}!개` : `${maxV}번`} />
        {puzzle === 'hat' && <Readout label="아무도 못 받은 비율" value={pct(hist[0])} />}
      </div>
      <Legend
        items={[
          { color: 'var(--c-math-1)', label: '시뮬레이션', shape: 'sq' },
          { color: 'var(--c-math-3)', label: '선형성으로 구한 값', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: same mean, different spread ─────────────── */

const BIN = 10; // ms per bin
const SLOW = 30; // bins: a slow request takes 300 ms
const MEAN = 10; // bins: both servers average 100 ms

function serverA(): number[] {
  const p = binomialPmf(20, 0.5); // mean 10 bins, σ ≈ 2.2 bins
  return [...p, ...new Array(SLOW + 1 - p.length).fill(0)];
}
function serverB(q: number): number[] {
  const a = (MEAN - SLOW * q) / (1 - q); // fast part's mean so that the overall mean stays 10 bins
  const fast = binomialPmf(20, Math.max(0.01, Math.min(0.99, a / 20)));
  const out = new Array(SLOW + 1).fill(0);
  fast.forEach((v, i) => (out[i] += (1 - q) * v));
  out[SLOW] += q;
  return out;
}
function convolve(a: number[], b: number[]): number[] {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) if (a[i] > 1e-12) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return out;
}
function power(a: number[], k: number): number[] {
  let out = a;
  for (let i = 1; i < k; i++) out = convolve(out, a);
  return out;
}

function SpreadFigure() {
  const P = usePalette();
  const [c1, c2] = useMathColors(P);
  const [q, setQ] = useState(0.1);
  const [k, setK] = useState(1);
  const A = useMemo(() => power(serverA(), k), [k]);
  const B = useMemo(() => power(serverB(q), k), [q, k]);
  const xs = A.map((_, i) => i * BIN);
  const mA = moments(A, xs);
  const mB = moments(B, xs);
  const limit = k * 150; // ms
  const tail = (p: number[]) => p.reduce((s, v, i) => s + (i * BIN > limit ? v : 0), 0);
  const tA = tail(A);
  const tB = tail(B);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const xMax = (A.length - 1) * BIN;
      const yMax = Math.max(...A, ...B.slice(0, B.length - 1)) * 1.15;
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax, yMin: 0, yMax, pad: { l: 44, r: 14, t: 14, b: 28 } });
      plot.grid({ xLabel: k > 1 ? `호출 ${k}번의 총 응답 시간 (ms)` : '응답 시간 (ms)', yLabel: '확률', fmt: (v) => (v > 0 && v < 1 ? v.toFixed(2) : String(Math.round(v))) });
      ctx.fillStyle = alpha(P.bad, 0.07);
      ctx.fillRect(plot.X(limit), plot.pad.t, plot.X(xMax) - plot.X(limit), plot.ph);
      plot.line(limit, 0, limit, yMax, alpha(P.bad, 0.7), 1.2, [4, 3]);
      plot.text(`${limit}ms 초과`, limit, yMax * 0.95, P.bad, { dx: 5, font: `600 11px ${P.fontBody}` });
      const bw = Math.max(1.2, (plot.X(BIN) - plot.X(0)) * 0.42);
      const draw = (p: number[], color: string, off: number) => {
        ctx.fillStyle = color;
        p.forEach((v, i) => {
          if (v < 1e-5) return;
          const x = plot.X(i * BIN) + off * bw;
          const top = plot.Y(Math.min(v, yMax));
          ctx.fillRect(x - bw / 2, top, bw, plot.Y(0) - top);
        });
      };
      draw(A, alpha(c2, 0.8), -0.5);
      draw(B, alpha(c1, 0.8), 0.5);
      plot.line(mA.mu, 0, mA.mu, yMax, P.ink2, 1.3, [3, 3]);
      plot.text(`평균 ${Math.round(mA.mu)}ms`, mA.mu, yMax * 0.86, P.ink2, { dx: 5, font: `500 11px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
    },
    [P, c1, c2, A, B, k, mA.mu, limit],
    { aspect: 2.1, maxHeight: 320, minHeight: 230 },
  );

  return (
    <Figure
      no={3}
      title="평균은 같고 흩어짐은 다른 두 서버"
      hint="느린 요청 비율과 호출 횟수를 바꿔 보세요"
      caption={<>두 서버 모두 평균 응답 시간은 100ms입니다. 서버 A는 늘 비슷하게 빠르고, 서버 B는 대개 더 빠르지만 일부 요청이 300ms씩 걸립니다. 한 요청이 같은 서버를 k번 차례로 부르면 총 시간의 평균은 k배가 되고, 서로 독립이므로 분산도 k배, 표준편차는 √k배가 됩니다. 빨간 영역은 요청당 150ms를 넘긴 경우입니다.</>}
    >
      <div className="controls row">
        <Slider id="sp-q" label="서버 B의 느린 요청 비율" value={q} min={0.01} max={0.25} step={0.01} onChange={setQ} format={(v) => pct(v, 0)} color="var(--c-math-1)" />
        <Slider id="sp-k" label="차례로 부르는 횟수 k" value={k} min={1} max={8} step={1} onChange={setK} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`두 서버의 응답 시간 분포. 평균은 둘 다 ${Math.round(mA.mu)}ms, 표준편차는 A ${Math.round(mA.sd)}ms, B ${Math.round(mB.sd)}ms.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        <Readout label="평균 (A, B 같음)" value={`${Math.round(mA.mu)}ms`} />
        <Readout label="표준편차 A" value={`${mA.sd.toFixed(0)}ms`} color="var(--c-math-2)" />
        <Readout label="표준편차 B" value={`${mB.sd.toFixed(0)}ms`} color="var(--c-math-1)" />
        <Readout label={`A가 ${limit}ms 초과`} value={pct(tA, 2)} color="var(--c-math-2)" />
        <Readout label={`B가 ${limit}ms 초과`} value={pct(tB, 1)} color="var(--c-math-1)" />
      </div>
      <Legend
        items={[
          { color: 'var(--c-math-2)', label: '서버 A', shape: 'sq' },
          { color: 'var(--c-math-1)', label: '서버 B', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function RandomVariables() {
  return (
    <>
      <h2>결과에 붙인 숫자</h2>
      <p>
        1장에서는 사건, 즉 결과들의 모음에 확률을 붙였습니다. 하지만 우리가 실제로 궁금한 것은 대개 숫자입니다. 주사위 두 개의 합, 해시 테이블에서 충돌한 키의 수, 정렬 알고리즘이 한 비교 횟수 같은 것들입니다. 결과마다 숫자 하나를 붙이는 함수를 <T en="random variable">확률변수</T>라고 하고, 보통 대문자 <M>{'X'}</M>로 씁니다. 이름과 달리 변수가 아니라 표본 공간 <M>{'\\Omega'}</M>에서 실수로 가는 함수입니다.
      </p>
      <p>
        확률변수가 값 x를 가질 확률을 모든 x에 대해 적어 놓은 것이 <T en="probability mass function, PMF">확률질량함수</T> <M>{'p(x) = P(X = x)'}</M>입니다. 값이 셀 수 있게 떨어져 있는 확률변수를 <T en="discrete">이산</T> 확률변수라 하고, 이 장에서는 이산인 경우만 다룹니다. 확률이므로 <M>{'p(x) \\ge 0'}</M>이고 모두 더하면 1입니다. "X가 x 이하일 확률" <M>{'F(x) = P(X \\le x)'}</M>는 <T en="cumulative distribution function, CDF">누적분포함수</T>라고 부릅니다.
      </p>

      <h2>기댓값: 확률로 가중한 평균</h2>
      <p>
        <T en="expectation">기댓값</T> <M>{'E[X]'}</M>는 값마다 그 확률을 곱해 더한 것입니다. 같은 실험을 아주 많이 반복했을 때 X의 평균이 다가가는 값이고(4장의 대수의 법칙), 막대를 무게로 보면 무게중심입니다.
      </p>
      <MB note="합은 X가 가질 수 있는 모든 값 x에 대해 합니다. 그리스 문자 μ(뮤)로도 씁니다.">{'E[X] = \\mu = \\sum_{x} x \\, p(x)'}</MB>
      <PmfFigure />
      <p>
        그림 1에서 오른쪽 끝 막대 하나를 높이면 받침이 크게 움직입니다. 기댓값은 드물지만 큰 값에 민감합니다. "두 봉우리"를 고르면 기댓값이 아무 막대도 없는 골짜기에 놓이는 것도 볼 수 있습니다. 기댓값은 "가장 흔한 값"도 "실제로 나올 수 있는 값"도 아닙니다. 데이터에서 계산하는 표본 평균과의 관계는 <a href={lessonHref('stats-basics', 'summary')}>데이터 요약</a>을 참고하세요.
      </p>
      <p>
        X의 함수 <M>{'g(X)'}</M>의 기댓값은 g(X)의 분포를 새로 구할 필요 없이 <M>{'E[g(X)] = \\sum_x g(x)\\,p(x)'}</M>로 계산합니다. 예를 들어 <M>{'E[X^2] = \\sum_x x^2 p(x)'}</M>입니다. 주의할 점은 일반적으로 <M>{'E[g(X)] \\ne g(E[X])'}</M>라는 것입니다. 평균 응답 시간의 제곱은 응답 시간 제곱의 평균이 아닙니다.
      </p>

      <h2>기댓값의 선형성</h2>
      <p>
        기댓값의 가장 쓸모 있는 성질은 더하기와 상수배를 그대로 통과한다는 것입니다. 이것을 <T en="linearity of expectation">기댓값의 선형성</T>이라고 합니다.
      </p>
      <MB note="a, b는 상수입니다. X와 Y가 독립이든 아니든, 서로 얼마나 얽혀 있든 언제나 성립합니다.">{'E[aX + bY] = a\\,E[X] + b\\,E[Y]'}</MB>
      <p>
        이 성질은 <T en="indicator variable">지시변수</T>와 함께 쓸 때 위력이 나옵니다. 사건 A의 지시변수 <M>{'I_A'}</M>는 A가 일어나면 1, 아니면 0인 확률변수이고, 기댓값은 <M>{'E[I_A] = 1 \\cdot P(A) + 0 \\cdot P(A^c) = P(A)'}</M>입니다. 무언가의 "개수"는 지시변수들의 합으로 쓸 수 있으므로, 개수의 기댓값은 확률들의 합입니다.
      </p>
      <p>
        <strong>모자 돌려주기.</strong> n명이 맡긴 모자를 섞어 아무렇게나 돌려줄 때, 자기 모자를 받는 사람 수 X의 기댓값은? X의 분포를 직접 구하려면 n!가지 순열을 따져야 합니다. 대신 <M>{'X = I_1 + \\cdots + I_n'}</M>으로 쓰고, <M>{'I_i'}</M>를 "i번 사람이 제 모자를 받음"의 지시변수로 둡니다. 모자는 n개 중 무작위이므로 <M>{'E[I_i] = 1/n'}</M>, 따라서 <M>{'E[X] = n \\cdot \\tfrac{1}{n} = 1'}</M>입니다. 지시변수들은 서로 독립이 아니지만(n−1명이 제 모자를 받으면 마지막 사람도 받습니다) 선형성에는 상관없습니다.
      </p>
      <p>
        <strong>쿠폰 모으기.</strong> n종류의 쿠폰을 하나씩 무작위로 받을 때 모두 모으려면 평균 몇 번 받아야 할까요? 이미 i종류를 모았다면 새 종류가 나올 확률은 <M>{'(n-i)/n'}</M>이고, 그때까지 기다리는 횟수의 기댓값은 <M>{'n/(n-i)'}</M>입니다(3장의 기하 분포). 단계별 대기 시간을 더하면 됩니다.
      </p>
      <MB note="Hₙ = 1 + 1/2 + … + 1/n은 조화수이고, 대략 ln n + 0.577입니다. 그래서 답은 약 n ln n입니다.">{'E[T] = \\sum_{i=0}^{n-1} \\frac{n}{n-i} = n\\left(1 + \\tfrac{1}{2} + \\cdots + \\tfrac{1}{n}\\right) = n H_n'}</MB>
      <LinearityFigure />
      <p>
        그림 2에서 n을 50까지 늘려도 모자 문제의 평균은 1 근처에 머뭅니다. 쿠폰 문제는 n = 50이면 약 225번입니다. 마지막 한 종류를 기다리는 데만 평균 50번이 듭니다. 분산 시스템에서 무작위로 노드를 고를 때 "모든 노드를 한 번씩 건드리려면" 몇 번 골라야 하는지, 무작위 테스트가 모든 분기를 덮으려면 얼마나 돌려야 하는지가 같은 계산입니다.
      </p>
      <Code label="지시변수로 센 기댓값과 시뮬레이션">{`
// 모자 n개를 섞어 돌려줄 때, 제 모자를 받은 사람 수
function fixedPoints(n) {
  const hats = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {       // 피셔-예이츠 섞기
    const j = Math.floor(Math.random() * (i + 1));
    [hats[i], hats[j]] = [hats[j], hats[i]];
  }
  return hats.filter((h, i) => h === i).length;
}

// 시뮬레이션: 많이 해 보고 평균을 낸다
let sum = 0;
for (let t = 0; t < 100000; t++) sum += fixedPoints(20);
console.log(sum / 100000);  // 약 1.0

// 선형성: E[X] = Σ P(i번이 제 모자) = n × (1/n) = 1. 계산 끝`}</Code>
      <Callout kind="warn">
        곱셈은 선형성처럼 공짜가 아닙니다. <M>{'E[XY] = E[X]\\,E[Y]'}</M>는 X와 Y가 독립일 때만 성립합니다. 예를 들어 X가 동전 앞면의 지시변수이고 Y = X라면 <M>{'E[XY] = E[X^2] = 1/2'}</M>인데 <M>{'E[X]E[Y] = 1/4'}</M>입니다.
      </Callout>

      <h2>분산과 표준편차</h2>
      <p>
        기댓값이 같아도 흩어진 정도는 전혀 다를 수 있습니다. <T en="variance">분산</T>은 평균에서 떨어진 거리의 제곱을 평균한 것이고, 제곱을 풀어 선형성을 쓰면 계산하기 쉬운 두 번째 꼴이 나옵니다.
      </p>
      <MB note="σ(시그마)는 표준편차입니다. 분산은 단위가 제곱(ms²)이라, 원래 단위로 돌아오도록 제곱근을 씌운 것입니다.">{'\\mathrm{Var}(X) = E\\big[(X - \\mu)^2\\big] = E[X^2] - \\mu^2 \\qquad \\sigma = \\sqrt{\\mathrm{Var}(X)}'}</MB>
      <p>
        그림 1에서 "분산에 기여하는 몫 보기"를 켜면 아래에 값마다 <M>{'p(x)(x-\\mu)^2'}</M>가 그려집니다. 이 막대들의 합이 분산입니다. 평균에서 먼 값은 거리가 제곱으로 들어가므로, 확률이 작아도 분산을 크게 키웁니다. "한 값"을 고르면 분산이 0입니다.
      </p>
      <p>
        상수배와 덧셈에 대해서는 <M>{'\\mathrm{Var}(aX + b) = a^2\\,\\mathrm{Var}(X)'}</M>입니다. 모든 값을 b만큼 옮겨도 흩어짐은 그대로이고, a배로 늘리면 거리가 a배라 분산은 a²배입니다. 두 확률변수의 합은 <strong>독립일 때만</strong> 분산이 더해집니다.
      </p>
      <MB note="독립이 아니면 공분산 항 2Cov(X, Y)가 더 붙습니다. 같은 분포를 따르는 독립 변수 k개를 더하면 분산은 k배, 표준편차는 √k배입니다.">{'X, Y \\text{ 독립} \\implies \\mathrm{Var}(X + Y) = \\mathrm{Var}(X) + \\mathrm{Var}(Y)'}</MB>
      <SpreadFigure />
      <p>
        그림 3의 두 서버는 평균만 보면 똑같습니다. 그런데 느린 요청 비율을 10%로 두면 서버 B의 표준편차는 A의 세 배가 넘고, 150ms를 넘는 요청이 A에서는 거의 없지만 B에서는 열에 하나입니다. 서비스를 평균 응답 시간이 아니라 상위 1% 응답 시간(p99) 같은 꼬리 지표로 관리하는 이유입니다. k를 늘리면 평균은 k배로 커지지만 표준편차는 √k배로만 커져서, 합은 평균에 비해 상대적으로 덜 흩어집니다. 이 사실이 4장의 대수의 법칙으로 이어집니다.
      </p>
      <Callout kind="intuition">
        기댓값은 "보통 얼마인가", 표준편차는 "그 보통에서 얼마나 벗어나곤 하는가"를 답합니다. 알고리즘의 기대 실행 시간이 좋다는 말만으로는 부족하고, 실행 시간이 기댓값 근처에 얼마나 몰려 있는지까지 알아야 믿고 쓸 수 있습니다. 4장과 5장에서 그 질문을 다룹니다.
      </Callout>

      <Callout kind="key">
        확률변수는 결과에 숫자를 붙이는 함수이고, PMF p(x)가 그 분포입니다. 기댓값 E[X] = Σ x p(x)는 무게중심이며, 독립이 아니어도 E[X + Y] = E[X] + E[Y]입니다. 개수를 지시변수의 합으로 쓰면 개수의 기댓값은 확률의 합입니다. 분산 Var(X) = E[X²] − μ²은 흩어짐을 재고, 독립인 변수의 분산은 더해집니다.
      </Callout>
      <Quiz
        q={<>키 n개를 버킷 m개에 독립적으로, 균등하게 해시한다. 같은 버킷에 들어간 키의 쌍(충돌 쌍)의 개수의 기댓값은?</>}
        options={[<M key="a">{'n/m'}</M>, <M key="b">{'\\binom{n}{2} / m'}</M>, <M key="c">{'n^2 / m^2'}</M>, '키들이 서로 독립이 아니라서 선형성으로는 구할 수 없다']}
        answer={1}
        explain={<>두 키 i, j마다 "같은 버킷에 들어감"의 지시변수를 둡니다. j가 i와 같은 버킷에 떨어질 확률은 1/m이므로 기댓값은 1/m이고, 쌍은 C(n, 2)개이므로 합은 C(n, 2)/m입니다. 쌍끼리는 독립이 아니지만 선형성은 상관없습니다. 해시 테이블의 평균 성능 분석이 이 계산에서 출발합니다(<a href={lessonHref('cs-algorithms', 'search-hash')}>탐색과 해시</a>, 5장).</>}
      />
    </>
  );
}
