import { useMemo, useState } from 'react';

/** Phones stack the two plots of a figure, so they need a taller canvas. */
const NARROW = typeof window !== 'undefined' && window.innerWidth < 600;
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { rng } from '../../../../lib/math';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { BUDGET, BUMP, DIMS, EXP, PEAK, SQRT, adaptiveSimpson, digits, errorTable, gauss, gaussLegendre, gridEstimate, gridK, monteCarlo, order, romberg, rombergEvals, simpson, simpsonParabolas, simpsonWithEvals, uniformSimpsonFor, type Integrand } from './quad';
import './numerical.css';
import './quadrature.css';

const ef = (v: number) => {
  if (!isFinite(v)) return '∞';
  if (v === 0) return '0';
  if (v >= 0.01 && v < 1000) return v < 1 ? v.toFixed(4) : v.toPrecision(4);
  const [m, e] = v.toExponential(2).split('e');
  return `${m}×10^${Number(e)}`.replace('^-', '^−');
};
const SUP: Record<string, string> = { '−': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const sup = (s: string) => s.replace(/\^(−?\d+)/g, (_, p: string) => p.split('').map((ch) => SUP[ch] ?? ch).join(''));
const sci = (v: number) => sup(ef(v));
const nf = (v: number, d = 4) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');

/** Grid with separate tick formats for x and y (Plot.grid uses one format for both). */
function gridXY(p: Plot, xStep: number, yStep: number, fx: (v: number) => string, fy: (v: number) => string) {
  p.grid({ xStep, yStep, labels: false });
  const c = p.ctx;
  c.save();
  c.fillStyle = p.p.ink3;
  c.font = `11px ${p.p.fontMono}`;
  c.textAlign = 'center';
  c.textBaseline = 'top';
  for (let x = Math.ceil(p.xMin / xStep - 1e-9) * xStep; x <= p.xMax + 1e-9; x += xStep) c.fillText(fx(x), p.X(x), p.pad.t + p.ph + 6);
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  for (let y = Math.ceil(p.yMin / yStep - 1e-9) * yStep; y <= p.yMax + 1e-9; y += yStep) c.fillText(fy(y), p.pad.l - 6, p.Y(y));
  c.restore();
}
const pow10 = (v: number) => sup(`10^${Math.round(v)}`.replace('-', '−'));
const pow2 = (v: number) => {
  const n = 2 ** Math.round(v);
  return n >= 1000 ? `${n / 1024}K` : String(n);
};

const FNS: Integrand[] = [EXP, SQRT, BUMP];

/* ─────────────── Figure 1: Simpson's parabolas and the error orders ─────────────── */

function SimpsonFigure() {
  const P = usePalette();
  const [fi, setFi] = useState(0);
  const [n, setN] = useState(4);
  const fn = FNS[fi];
  const arcs = useMemo(() => simpsonParabolas(fn.f, fn.a, fn.b, n), [fn, n]);
  const table = useMemo(() => errorTable(fn, 10), [fn]);
  const val = simpson(fn.f, fn.a, fn.b, n);
  // observed order over one doubling, n = 128 → 256 (later doublings start to feel rounding error)
  const i128 = table.findIndex((r) => r.n === 128);
  const ordT = order(table[i128].trap, table[i128 + 1].trap);
  const ordS = order(table[i128].simp, table[i128 + 1].simp);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const narrow = w < 560;
      const lw = narrow ? w : w * 0.5;
      const lh = narrow ? h * 0.5 : h;
      const span = fn.b - fn.a;
      const p = new Plot(ctx, lw, lh, P, { xMin: fn.a - span * 0.05, xMax: fn.b + span * 0.05, yMin: -fn.yMax * 0.06, yMax: fn.yMax, pad: { l: 32, r: 10, t: 12, b: 24 } });
      p.grid({ xStep: span / 4 });
      for (const a of arcs) {
        const q = (x: number) => a.c[0] + a.c[1] * (x - a.xm) + a.c[2] * (x - a.xm) ** 2;
        p.fillUnder(q, alpha(P.accent, 0.18), a.x0, a.x1);
        p.fn(q, P.accent, 1.8, { from: a.x0, to: a.x1, samples: 60 });
        p.line(a.x0, 0, a.x0, q(a.x0), alpha(P.accent, 0.5), 1);
        p.line(a.x1, 0, a.x1, q(a.x1), alpha(P.accent, 0.5), 1);
        for (const x of [a.x0, a.xm, a.x1]) p.dot(x, fn.f(x), 3.5, P.accent);
      }
      p.fn(fn.f, P.ink, 1.8, { dash: [5, 4], samples: 300 });

      ctx.save();
      ctx.translate(narrow ? 0 : lw, narrow ? lh : 0);
      const q = new Plot(ctx, narrow ? w : w - lw, narrow ? h - lh : h, P, { xMin: 0.6, xMax: 10.4, yMin: -16, yMax: 0, pad: { l: 44, r: 10, t: 12, b: 26 } });
      gridXY(q, 2, 4, pow2, pow10);
      const draw = (key: 'trap' | 'simp', col: string, dash: number[] = []) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.setLineDash(dash);
        ctx.beginPath();
        table.forEach((r, i) => {
          const y = Math.max(-16, Math.log10(Math.max(r[key], 1e-16)));
          if (i) ctx.lineTo(q.X(Math.log2(r.n)), q.Y(y));
          else ctx.moveTo(q.X(Math.log2(r.n)), q.Y(y));
        });
        ctx.stroke();
        ctx.setLineDash([]);
      };
      draw('trap', P.ink3, [5, 4]);
      draw('simp', P.accent);
      const cur = table.find((r) => r.n >= n) ?? table[0];
      q.dot(Math.log2(cur.n), Math.max(-16, Math.log10(Math.max(cur.simp, 1e-16))), 4.5, P.accent);
      q.text('|오차|', 0.7, 0, P.ink3, { dy: 8, font: `600 11px ${P.fontBody}` });
      q.text('조각 수 n', 10.3, -16, P.ink3, { dy: -10, align: 'right', font: `11px ${P.fontBody}` });
      ctx.restore();
    },
    [P, fn, arcs, table, n],
    { aspect: NARROW ? 0.85 : 2.1, maxHeight: 520, minHeight: 40 },
  );

  return (
    <Figure
      no={1}
      title="포물선으로 넓이 재기와 오차의 차수"
      hint="함수를 바꿔 기울기가 어떻게 달라지는지 보세요"
      caption={
        <>
          왼쪽(좁은 화면에서는 위)은 구간을 n개로 나누고 두 조각마다 세 점을 지나는 포물선을 그어 그 아래 넓이를 더하는 심프슨 공식입니다. 점선이 원래 함수입니다. 오른쪽은 n을 2부터 1,024까지 두 배씩 늘릴 때 오차를 로그-로그 눈금으로 그린 것으로, 회색 점선이 사다리꼴 공식, 파란 선이 심프슨 공식입니다. 기울기가 −k이면 n을 두 배로 할 때 오차가 <M>{'2^k'}</M>분의 1로 줄어듭니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="함수" value={fi} onChange={setFi} options={FNS.map((f, i) => ({ value: i, label: f.label }))} />
        <Slider label="조각 수 n (짝수)" value={n} min={2} max={16} step={2} onChange={setN} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${fn.label}의 적분을 심프슨 공식으로 ${n}조각에 계산하면 ${nf(val, 6)}, 오차 ${ef(Math.abs(val - fn.exact))}입니다. n이 128에서 256으로 늘 때 관측한 오차의 차수는 사다리꼴 ${ordT.toFixed(2)}, 심프슨 ${ordS.toFixed(2)}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts">
        <Readout label={`심프슨 (n = ${n})`} value={nf(val, 6)} />
        <Readout label="오차" value={sci(Math.abs(val - fn.exact))} color="var(--accent)" />
        <Readout label="차수: 사다리꼴 (n 128→256)" value={ordT.toFixed(2)} />
        <Readout label="차수: 심프슨 (n 128→256)" value={ordS.toFixed(2)} color="var(--accent)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: Romberg's table ─────────────── */

function RombergFigure() {
  const [fi, setFi] = useState(0);
  const [levels, setLevels] = useState(6);
  const fn = [EXP, SQRT][fi];
  const R = useMemo(() => romberg(fn.f, fn.a, fn.b, levels), [fn, levels]);
  const last = R[levels - 1];
  const best = digits(last[levels - 1], fn.exact);
  const trapOnly = digits(last[0], fn.exact);

  return (
    <Figure
      no={2}
      title="롬베르크: 사다리꼴 공식에서 오차를 지우기"
      hint="행을 늘리고 함수를 바꿔 보세요"
      caption={
        <>
          첫 열은 조각 1, 2, 4, …개의 사다리꼴 공식이고, 오른쪽 열로 갈수록 리처드슨 외삽으로 오차의 다음 항을 하나씩 지운 값입니다. 칸의 숫자는 그 값의 맞는 소수 자릿수(<M>{'-\\log_{10}|\\text{오차}|'}</M>)이고, 색이 진할수록 정확합니다. 행을 하나 늘릴 때마다 함수 계산이 거의 두 배가 됩니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="함수"
          value={fi}
          onChange={setFi}
          options={[
            { value: 0, label: 'eˣ' },
            { value: 1, label: '√x' },
          ]}
        />
        <Slider label="행 수" value={levels} min={2} max={6} step={1} onChange={setLevels} />
      </div>
      <div className="tbl-wrap">
        <table className="qd-romberg" aria-label="롬베르크 표, 각 칸은 맞는 소수 자릿수">
          <thead>
            <tr>
              <th>조각</th>
              <th>계산 횟수</th>
              {Array.from({ length: levels }, (_, j) => (
                <th key={j}>{j === 0 ? '사다리꼴' : `외삽 ${j}번`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {R.map((row, i) => (
              <tr key={i}>
                <td className="num">{2 ** i}</td>
                <td className="num">{rombergEvals(i + 1)}</td>
                {Array.from({ length: levels }, (_, j) => {
                  if (j >= row.length) return <td key={j} />;
                  const dg = digits(row[j], fn.exact);
                  return (
                    <td key={j} className="num" style={{ ['--d' as string]: `${Math.round(Math.min(1, dg / 16) * 50)}%` }} title={row[j].toPrecision(16)}>
                      {dg >= 15.9 ? '16+' : dg.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="readouts">
        <Readout label="함수 계산" value={`${rombergEvals(levels)}번`} />
        <Readout label="사다리꼴만: 맞는 자릿수" value={trapOnly.toFixed(1)} />
        <Readout label="롬베르크: 맞는 자릿수" value={best >= 15.9 ? '16+' : best.toFixed(1)} color="var(--good)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: Gauss–Legendre nodes ─────────────── */

function GaussFigure() {
  const P = usePalette();
  const [fi, setFi] = useState(0);
  const [n, setN] = useState(3);
  const fn = [EXP, SQRT][fi];
  const gl = useMemo(() => gaussLegendre(n), [n]);
  const gVal = gauss(fn.f, fn.a, fn.b, n);
  const sVal = simpsonWithEvals(fn.f, fn.a, fn.b, n);
  const exactDeg = Math.abs(gauss((x) => x ** (2 * n - 1), 0, 1, n) - 1 / (2 * n)) < 1e-12;
  const nextErr = Math.abs(gauss((x) => x ** (2 * n), 0, 1, n) - 1 / (2 * n + 1));
  const rows = [3, 5, 7, 9].map((m) => ({ m, g: Math.abs(gauss(fn.f, fn.a, fn.b, m) - fn.exact), s: Math.abs((simpsonWithEvals(fn.f, fn.a, fn.b, m)?.value ?? NaN) - fn.exact) }));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -0.04, xMax: 1.04, yMin: -fn.yMax * 0.08, yMax: fn.yMax, pad: { l: 32, r: 10, t: 12, b: 24 } });
      p.grid({ xStep: 0.25 });
      p.fillUnder(fn.f, alpha(P.ink3, 0.12), 0, 1);
      p.fn(fn.f, P.ink, 1.8, { samples: 300 });
      // each node with a bar whose width is its weight (on [0, 1] the weights are halved)
      gl.x.forEach((x, i) => {
        const xm = (x + 1) / 2;
        const wgt = gl.w[i] / 2;
        const y = fn.f(xm);
        ctx.fillStyle = alpha(P.pos, 0.28);
        ctx.fillRect(p.X(xm - wgt / 2), p.Y(y), p.X(xm + wgt / 2) - p.X(xm - wgt / 2), p.Y(0) - p.Y(y));
        ctx.strokeStyle = P.pos;
        ctx.lineWidth = 1;
        ctx.strokeRect(p.X(xm - wgt / 2), p.Y(y), p.X(xm + wgt / 2) - p.X(xm - wgt / 2), p.Y(0) - p.Y(y));
        p.dot(xm, y, 4.5, P.pos, P.surface, 1.5);
      });
    },
    [P, fn, gl],
    { aspect: 2.2, maxHeight: 300, minHeight: 40 },
  );

  return (
    <Figure
      no={3}
      title="가우스 구적법: 점을 어디에 찍을지도 고르기"
      hint="점의 수 n을 바꿔 보세요"
      caption={
        <>
          가우스-르장드르 구적법의 점(주황)과 가중치입니다. 막대의 너비가 그 점의 가중치이고, 막대 넓이를 모두 더한 것이 적분의 근삿값입니다. 점은 르장드르 다항식 <M>{'P_n'}</M>의 근이라서 양 끝 쪽에 더 촘촘합니다. 아래 표는 같은 횟수로 함수를 계산할 때 심프슨 공식과 오차를 비교합니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="함수"
          value={fi}
          onChange={setFi}
          options={[
            { value: 0, label: 'eˣ' },
            { value: 1, label: '√x' },
          ]}
        />
        <Slider label="점의 수 n" value={n} min={1} max={8} step={1} onChange={setN} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${fn.label}을 [0, 1]에서 가우스 점 ${n}개로 적분하면 오차 ${ef(Math.abs(gVal - fn.exact))}입니다. 점 위치는 ${gl.x.map((x) => ((x + 1) / 2).toFixed(3)).join(', ')}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts">
        <Readout label={`가우스 ${n}점: 오차`} value={sci(Math.abs(gVal - fn.exact))} color="var(--pos)" />
        <Readout label={sVal ? `심프슨 ${sVal.evals}점: 오차` : '심프슨: 점 3개 이상'} value={sVal ? sci(Math.abs(sVal.value - fn.exact)) : '–'} />
        <Readout label={<>정확한 차수 <M>{`x^{${2 * n - 1}}`}</M></>} value={exactDeg ? '정확' : '아님'} color={exactDeg ? 'var(--good)' : 'var(--bad)'} />
        <Readout label={<>그다음 <M>{`x^{${2 * n}}`}</M>의 오차</>} value={sci(nextErr)} />
      </div>
      <div className="tbl-wrap">
        <table className="tbl" aria-label="같은 계산 횟수에서 가우스와 심프슨의 오차">
          <thead>
            <tr>
              <th>함수 계산 횟수</th>
              <th>가우스</th>
              <th>심프슨</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.m}>
                <td className="num">{r.m}</td>
                <td className="num">{sci(r.g)}</td>
                <td className="num">{sci(r.s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: adaptive Simpson on a sharp peak ─────────────── */

function AdaptiveFigure() {
  const P = usePalette();
  const [tolExp, setTolExp] = useState(-5);
  const tol = 10 ** tolExp;
  const A = useMemo(() => adaptiveSimpson(PEAK.f, 0, 1, tol), [tol]);
  const err = Math.abs(A.value - PEAK.exact);
  const uni = useMemo(() => uniformSimpsonFor(PEAK, err), [err]);
  const widths = A.intervals.map(([a, b]) => b - a);
  const nearPeak = A.intervals.filter(([a, b]) => Math.abs((a + b) / 2 - 0.3) < 0.05).length;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -0.02, xMax: 1.02, yMin: -0.22, yMax: PEAK.yMax, pad: { l: 32, r: 10, t: 12, b: 24 } });
      p.grid({ xStep: 0.1, yStep: 0.5 });
      p.fn(PEAK.f, P.ink, 1.8, { samples: 2000 });
      // accepted intervals as alternating bands along the bottom
      A.intervals.forEach(([a, b], i) => {
        ctx.fillStyle = i % 2 ? alpha(P.accent, 0.55) : alpha(P.accent, 0.3);
        ctx.fillRect(p.X(a), p.Y(-0.08), Math.max(1, p.X(b) - p.X(a)), p.Y(-0.2) - p.Y(-0.08));
        const x = (a + b) / 2;
        p.dot(x, PEAK.f(x), 2.2, P.accent);
      });
    },
    [P, A],
    { aspect: 2.4, maxHeight: 280, minHeight: 40 },
  );

  const missed = A.evals <= 9;
  return (
    <Figure
      no={4}
      title="어려운 곳에만 점을 모으기: 적응적 심프슨"
      hint="허용 오차를 바꿔 보세요"
      caption={
        <>
          x = 0.3에 폭이 약 0.01인 뾰족한 봉우리가 있는 함수입니다. 적응적 심프슨은 구간 하나를 심프슨으로 한 번, 반으로 나눠 두 번 계산해 둘이 충분히 가까우면 받아들이고, 아니면 반으로 나눠 다시 시도합니다. 아래 띠의 칸이 받아들인 구간이고, 파란 점이 그 가운데입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider label="허용 오차" value={tolExp} min={-8} max={-3} step={1} onChange={setTolExp} format={(v) => sup(`10^${v}`.replace('-', '−'))} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`허용 오차 ${ef(tol)}에서 적응적 심프슨은 함수를 ${A.evals}번 계산해 구간 ${A.intervals.length}개를 받아들였고, 그중 ${nearPeak}개가 봉우리 근처에 있습니다. 오차는 ${ef(err)}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts">
        <Readout label="적응적: 함수 계산" value={`${A.evals}번`} color="var(--accent)" />
        <Readout label="적응적: 오차" value={sci(err)} />
        <Readout label="같은 오차, 균일한 심프슨" value={isFinite(uni.evals) ? `${uni.evals}번` : '–'} />
        <Readout label="구간 폭: 가장 좁은 것" value={nf(Math.min(...widths), 5)} />
      </div>
      <div className="na-note" data-bad={missed || undefined} aria-live="polite">
        {missed
          ? `계산 ${A.evals}번 만에 멈췄습니다. 처음 다섯 점 0, 0.25, 0.5, 0.75, 1이 모두 봉우리를 비켜 가서, 두 추정이 맞아떨어진 것처럼 보였기 때문입니다. 봉우리의 넓이를 통째로 놓쳐 오차가 ${ef(err)}입니다.`
          : `받아들인 구간 ${A.intervals.length}개 중 ${nearPeak}개가 봉우리 근처(0.25~0.35)에 몰려 있습니다. 가장 넓은 구간은 ${nf(Math.max(...widths), 3)}, 가장 좁은 구간은 ${nf(Math.min(...widths), 5)}입니다.`}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 5: grids vs Monte Carlo in many dimensions ─────────────── */

const RUNS = 30;

function DimensionFigure() {
  const P = usePalette();
  const [seed, setSeed] = useState(1);
  const rms = useMemo(
    () =>
      DIMS.map((d) => {
        let s = 0;
        for (let r = 0; r < RUNS; r++) s += (monteCarlo(d, BUDGET, rng(1000 + r)) - 1) ** 2;
        return Math.sqrt(s / RUNS);
      }),
    [],
  );
  const grid = useMemo(() => DIMS.map((d) => Math.abs(gridEstimate(d, gridK(d)) - 1)), []);
  const one = useMemo(() => DIMS.map((d) => Math.abs(monteCarlo(d, BUDGET, rng(seed)) - 1)), [seed]);
  const cross = DIMS.find((_, i) => rms[i] < grid[i]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: 0, xMax: 13, yMin: -9, yMax: 1, pad: { l: 44, r: 10, t: 12, b: 26 } });
      gridXY(p, 1, 1, (v) => (DIMS.includes(Math.round(v)) ? String(Math.round(v)) : ''), pow10);
      const lg = (v: number) => Math.max(-9, Math.min(1, Math.log10(Math.max(v, 1e-12))));
      const path = (vals: number[], col: string, dash: number[] = []) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.setLineDash(dash);
        ctx.beginPath();
        DIMS.forEach((d, i) => (i ? ctx.lineTo(p.X(d), p.Y(lg(vals[i]))) : ctx.moveTo(p.X(d), p.Y(lg(vals[i])))));
        ctx.stroke();
        ctx.setLineDash([]);
        DIMS.forEach((d, i) => p.dot(d, lg(vals[i]), 4, col));
      };
      path(grid, P.accent);
      path(rms, P.pos);
      DIMS.forEach((d, i) => p.dot(d, lg(one[i]), 3, alpha(P.pos, 0.5)));
      p.line(0, Math.log10(1 / Math.sqrt(BUDGET)), 13, Math.log10(1 / Math.sqrt(BUDGET)), alpha(P.ink3, 0.6), 1, [4, 4]);
      p.text('1/√N', 12.9, Math.log10(1 / Math.sqrt(BUDGET)), P.ink3, { dy: -9, align: 'right', font: `11px ${P.fontMono}`, bg: P.surface });
      p.text('|오차|', 0.1, 1, P.ink3, { dy: 8, font: `600 11px ${P.fontBody}` });
      p.text('차원 d', 12.9, -9, P.ink3, { dy: -10, align: 'right', font: `11px ${P.fontBody}` });
    },
    [P, grid, rms, one],
    { aspect: 2.2, maxHeight: 300, minHeight: 40 },
  );

  return (
    <Figure
      no={5}
      title="차원이 높으면 격자를 버리기"
      hint="몬테카를로를 다시 굴려 보세요"
      caption={
        <>
          d차원 단위 정육면체에서 <M>{'\\prod_i \\tfrac{\\pi}{2}\\sin(\\pi x_i)'}</M>를 적분합니다(정확한 값 1). 두 방법 모두 함수를 {BUDGET.toLocaleString('ko-KR')}번 계산합니다. 파랑은 축마다 k = {BUDGET}<sup>1/d</sup>개의 점을 찍은 중점 격자, 주황 선은 무작위 점 {BUDGET.toLocaleString('ko-KR')}개로 평균을 낸 몬테카를로를 {RUNS}번 반복한 오차의 제곱 평균의 제곱근, 흐린 주황 점은 한 번 굴린 결과입니다. 점선은 <M>{'1/\\sqrt{N}'}</M>입니다.
        </>
      }
    >
      <div className="controls row">
        <Button small onClick={() => setSeed((s) => s + 1)}>
          몬테카를로 다시 굴리기
        </Button>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`차원이 1, 2, 3, 4, 6, 12일 때 격자의 오차는 ${grid.map(ef).join(', ')}이고 몬테카를로의 평균적인 오차는 ${rms.map(ef).join(', ')}입니다. ${cross}차원부터 몬테카를로가 더 정확합니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="tbl-wrap">
        <table className="tbl" aria-label="차원별 격자와 몬테카를로 오차">
          <thead>
            <tr>
              <th>차원 d</th>
              <th>축마다 점</th>
              <th>격자 오차</th>
              <th>몬테카를로 ({RUNS}번 평균)</th>
            </tr>
          </thead>
          <tbody>
            {DIMS.map((d, i) => (
              <tr key={d}>
                <td className="num">{d}</td>
                <td className="num">{gridK(d)}</td>
                <td className="num" style={grid[i] > rms[i] ? { color: 'var(--bad)' } : undefined}>
                  {sci(grid[i])}
                </td>
                <td className="num" style={rms[i] < grid[i] ? { color: 'var(--good)' } : undefined}>
                  {sci(rms[i])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Legend
        items={[
          { color: 'var(--accent)', label: '중점 격자', shape: 'ln' },
          { color: 'var(--pos)', label: '몬테카를로', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Quadrature() {
  return (
    <>
      <h2>넓이를 계산으로 재기</h2>
      <p>
        <M>{'e^{-x^2}'}</M>처럼 원시함수를 식으로 적을 수 없는 함수가 많고, 측정 데이터처럼 식 자체가 없는 경우도 많습니다. 그래서 컴퓨터는 함수값 몇 개에 가중치를 곱해 더하는 방식으로 적분합니다. 이것을 <T en="numerical quadrature">수치 적분</T> 또는 구적법이라고 합니다.
      </p>
      <MB>{'\\int_a^b f(x)\\,dx \\approx \\sum_{i=1}^{n} w_i\\, f(x_i)'}</MB>
      <p>
        방법마다 다른 것은 점 <M>{'x_i'}</M>를 어디에 찍고 가중치 <M>{'w_i'}</M>를 얼마로 하느냐입니다. 미적분학의 <a href={lessonHref('math-calculus', 'integrals')}>적분과 미적분의 기본 정리</a> 장에서 본 사다리꼴 공식은 조각 수를 두 배로 늘리면 오차가 4분의 1로 줄었습니다. 이 장에서는 같은 계산 횟수로 훨씬 정확한 방법과, 그 방법이 통하지 않는 경우를 봅니다. 수치해석에서 비용은 대개 함수를 몇 번 계산했는지로 셉니다. 함수 한 번이 큰 시뮬레이션 한 번일 수도 있기 때문입니다.
      </p>

      <h2>심프슨 공식: 직선 대신 포물선</h2>
      <p>
        사다리꼴 공식은 두 점을 직선으로 잇습니다. <T en="Simpson's rule">심프슨 공식</T>은 조각 두 개마다 세 점을 지나는 포물선을 긋고 그 아래 넓이를 더합니다. 포물선 하나의 넓이를 계산하면 가중치가 1, 4, 1로 나옵니다.
      </p>
      <MB>{'\\int_{x_0}^{x_2} f(x)\\,dx \\approx \\frac{h}{3}\\bigl(f(x_0) + 4f(x_1) + f(x_2)\\bigr)'}</MB>
      <SimpsonFigure />
      <p>
        <M>{'e^x'}</M>를 [0, 1]에서 적분하면, 조각 2개의 심프슨 공식이 벌써 오차 <M>{'5.79\\times10^{-4}'}</M>입니다. n을 128에서 256으로 늘릴 때 관측한 차수는 사다리꼴이 2.00, 심프슨이 4.00입니다. 더 큰 n에서는 오차가 <M>{'10^{-13}'}</M> 아래로 내려가 반올림 오차가 섞이기 시작합니다. 심프슨은 n을 두 배로 할 때마다 오차가 16분의 1이 됩니다. 포물선으로 근사했는데 차수가 3이 아니라 4인 것은, 좌우 대칭인 덕분에 3차 항의 오차가 서로 지워져 3차 다항식까지 정확히 적분하기 때문입니다.
      </p>
      <p>
        그런데 함수를 <M>{'\\sqrt{x}'}</M>로 바꾸면 두 공식 모두 차수가 1.5 근처(사다리꼴 1.49, 심프슨 1.50)로 떨어집니다. <M>{'\\sqrt{x}'}</M>는 x = 0에서 기울기가 무한대라서, 오차 공식이 가정한 매끄러움이 깨지기 때문입니다. 심프슨의 오차 공식에는 4계 도함수가 들어가는데, <M>{'\\sqrt{x}'}</M>의 도함수는 0 근처에서 모두 무한히 커집니다. 차수는 공식이 아니라 공식과 함수가 함께 정합니다.
      </p>
      <MB>{'\\left|\\int_a^b f - S_n\\right| \\le \\frac{(b-a)\\,h^4}{180}\\max|f^{(4)}|, \\qquad h = \\frac{b-a}{n}'}</MB>

      <h2>리처드슨 외삽과 롬베르크 적분</h2>
      <p>
        사다리꼴 공식의 오차는 매끄러운 함수에서 <M>{'T(h) = I + c_1h^2 + c_2h^4 + \\cdots'}</M>처럼 h의 짝수 거듭제곱으로 전개됩니다. 그러면 조각 수가 n인 값과 2n인 값을 섞어 <M>{'h^2'}</M> 항을 지울 수 있습니다.
      </p>
      <MB>{'\\frac{4\\,T(h/2) - T(h)}{3} = I + O(h^4)'}</MB>
      <p>
        이처럼 오차의 꼴을 알 때 두 추정을 섞어 다음 차수로 넘어가는 것을 <T en="Richardson extrapolation">리처드슨 외삽</T>이라고 합니다. 위 식의 결과는 정확히 심프슨 공식입니다. 같은 일을 <M>{'h^4, h^6, \\ldots'}</M> 항에 차례로 되풀이해 표로 만든 것이 <T en="Romberg integration">롬베르크 적분</T>입니다.
      </p>
      <RombergFigure />
      <p>
        <M>{'e^x'}</M>에서 행 6개를 쓰면 함수를 33번 계산하는데, 사다리꼴 공식 하나만으로는 맞는 자릿수가 3.9이지만 롬베르크 표의 끝 칸은 15.2자리로 배정밀도의 한계에 닿습니다. 같은 33번의 계산을 버리지 않고 섞기만 한 결과입니다. 하지만 <M>{'\\sqrt{x}'}</M>로 바꾸면 표의 오른쪽으로 가도 3.4자리에서 멈춥니다. 외삽은 오차가 <M>{'h^2, h^4, \\ldots'}</M>로 전개된다는 가정 위에 서 있는데, <M>{'\\sqrt{x}'}</M>의 오차는 <M>{'h^{1.5}'}</M>로 시작해 그 가정이 틀리기 때문입니다.
      </p>

      <h2>가우스 구적법: 점의 위치까지 고르기</h2>
      <p>
        사다리꼴과 심프슨은 점을 같은 간격으로 찍고 가중치만 골랐습니다. 점 n개의 위치까지 고를 수 있다면 정할 수가 2n개이므로, 2n − 1차 다항식까지 정확히 적분하도록 맞출 수 있습니다. 이렇게 고른 점이 르장드르 다항식 <M>{'P_n'}</M>의 근이고, 이 방법이 <T en="Gauss–Legendre quadrature">가우스-르장드르 구적법</T>입니다. 예를 들어 [−1, 1]에서 점 2개는 <M>{'\\pm 1/\\sqrt{3} \\approx \\pm0.5774'}</M>, 가중치는 둘 다 1이고, 점 3개는 <M>{'0, \\pm\\sqrt{3/5}'}</M>에 가중치 <M>{'8/9, 5/9'}</M>입니다.
      </p>
      <GaussFigure />
      <p>
        함수를 3번 계산할 때 <M>{'e^x'}</M>의 오차는 심프슨이 <M>{'5.79\\times10^{-4}'}</M>, 가우스가 <M>{'8.24\\times10^{-7}'}</M>입니다. 5번이면 <M>{'3.70\\times10^{-5}'}</M>와 <M>{'6.54\\times10^{-13}'}</M>로 차이가 5천만 배가 넘습니다. 매끄러운 함수에서는 점을 하나 늘릴 때마다 맞는 자릿수가 몇 개씩 늘어납니다. 하지만 <M>{'\\sqrt{x}'}</M>에서는 5번 계산의 오차가 가우스 <M>{'6.30\\times10^{-4}'}</M>, 심프슨 <M>{'1.01\\times10^{-2}'}</M>로 가우스도 느리게 줄어듭니다. 끝점에서 매끄럽지 않은 함수에는 어떤 다항식 근사도 잘 맞지 않기 때문입니다. 이럴 때는 <M>{'x = t^2'}</M>로 치환해 특이점을 없애거나, 다음 절처럼 문제가 있는 곳만 잘게 나눕니다.
      </p>
      <Callout kind="note">
        과학 계산 라이브러리의 기본 적분 함수는 대개 가우스 계열의 공식을 적응적으로 씁니다. 예를 들어 SciPy의 quad가 쓰는 QUADPACK은 가우스 점 10개를 그대로 포함하는 21점 가우스-크론로드 공식으로, 같은 함수값에서 두 가지 추정을 얻고 그 차이로 오차를 가늠합니다.
      </Callout>

      <h2>어려운 곳에만 점을 모으기</h2>
      <p>
        함수가 거의 평평하다가 한 곳에서만 뾰족하면, 균일한 간격은 평평한 곳에 계산을 낭비합니다. <T en="adaptive quadrature">적응적 적분</T>은 구간마다 두 가지 추정을 비교해 차이가 작으면 받아들이고, 크면 그 구간만 반으로 나눕니다. 심프슨 공식으로 구간 하나 전체 S와 두 반쪽의 합 S′를 계산하면, 오차가 <M>{'h^4'}</M>를 따르는 한 <M>{'I - S\' \\approx (S\' - S)/15'}</M>이므로 이 차이를 오차의 추정으로 씁니다.
      </p>
      <AdaptiveFigure />
      <p>
        허용 오차 <M>{'10^{-5}'}</M>에서 적응적 심프슨은 함수를 85번 계산해 오차 <M>{'3.13\\times10^{-6}'}</M>을 얻습니다. 균일한 간격의 심프슨으로 같은 오차를 얻으려면 269번이 필요합니다. 받아들인 구간 42개 중 26개가 봉우리 근처에 있고, 가장 좁은 구간은 0.00195, 가장 넓은 구간은 0.25입니다.
      </p>
      <p>
        허용 오차를 <M>{'10^{-3}'}</M>으로 느슨하게 하면 이상한 일이 생깁니다. 계산 5번 만에 끝나고 봉우리를 통째로 놓칩니다. 처음 찍은 0, 0.25, 0.5, 0.75, 1이 모두 봉우리를 비켜 가서, 두 추정이 우연히 맞아떨어졌기 때문입니다. 적응적 방법은 자기가 본 점으로만 판단하므로, 아무 점도 닿지 않은 좁은 특징은 알아챌 수 없습니다. 함수의 모양을 대강 안다면 봉우리 위치에서 구간을 미리 나눠 주는 것이 안전합니다.
      </p>

      <h2>차원이 높으면: 몬테카를로</h2>
      <p>
        여러 변수의 적분은 <a href={lessonHref('math-multivariable', 'multiple-integrals')}>다중 적분</a> 장에서처럼 1차원 공식을 축마다 반복해 격자로 계산할 수 있습니다. 그런데 축마다 점 k개를 찍으면 d차원에서는 <M>{'k^d'}</M>개가 필요합니다. 계산 횟수 N을 정해 두면 축마다 쓸 수 있는 점은 <M>{'N^{1/d}'}</M>개뿐이고, 중점 공식의 오차는 <M>{'k^{-2} = N^{-2/d}'}</M>로 차원이 커질수록 거의 줄지 않습니다. 이것을 <T en="curse of dimensionality">차원의 저주</T>라고 합니다.
      </p>
      <p>
        <T en="Monte Carlo integration">몬테카를로 적분</T>은 무작위 점 N개에서 함수값의 평균을 냅니다. 큰 수의 법칙에 따라 평균은 참값으로 다가가고, 그 오차는 차원과 상관없이 대략 <M>{'1/\\sqrt{N}'}</M>에 비례합니다.
      </p>
      <DimensionFigure />
      <p>
        계산 횟수 4,096번으로 1차원에서는 격자의 오차가 <M>{'2.45\\times10^{-8}'}</M>, 몬테카를로가 <M>{'5.91\\times10^{-3}'}</M>로 격자가 압도적입니다. 3차원까지는 격자가 앞서지만(<M>{'4.83\\times10^{-3}'}</M> 대 <M>{'1.33\\times10^{-2}'}</M>), 4차원에서 뒤집혀 격자 <M>{'2.61\\times10^{-2}'}</M>, 몬테카를로 <M>{'1.79\\times10^{-2}'}</M>가 됩니다. 12차원에서는 축마다 점이 2개뿐인 격자의 오차가 2.53으로 답(1)보다도 크지만, 몬테카를로는 0.0575입니다. 금융의 파생상품 가격, 물리의 경로 적분, 그래픽스의 <a href={lessonHref('cs-graphics', 'ray-tracing')}>경로 추적</a>처럼 차원이 큰 적분은 거의 모두 몬테카를로 계열로 계산합니다. 확률적인 평균이 참값으로 다가가는 이유는 <a href={lessonHref('math-probability', 'limits')}>대수의 법칙</a> 장에서 다룹니다.
      </p>

      <Callout kind="key">
        수치 적분은 함수값의 가중합으로 넓이를 근사하고, 같은 계산 횟수에서의 정확도로 방법을 비교합니다. 심프슨 공식은 오차가 <M>{'h^4'}</M>에 비례하고, 리처드슨 외삽은 오차의 꼴을 이용해 두 추정을 섞어 차수를 올리며, 롬베르크 적분은 이를 되풀이합니다. 가우스 구적법은 점의 위치까지 골라 n개의 점으로 2n − 1차 다항식을 정확히 적분합니다. 이 모든 차수는 함수가 매끄럽다는 가정에 기대므로, 끝점에서 매끄럽지 않거나 뾰족한 곳이 있으면 치환이나 적응적 분할이 필요합니다. 차원이 높으면 격자는 쓸 수 없고 오차가 <M>{'1/\\sqrt{N}'}</M>인 몬테카를로를 씁니다.
      </Callout>
      <Quiz
        q="함수를 한 번 계산하는 데 1분이 걸리는 매끄러운 1차원 함수를 [0, 1]에서 소수 10자리까지 적분해야 한다. 가장 알맞은 방법은?"
        options={['조각 10,000개의 사다리꼴 공식', '점 1만 개의 몬테카를로 적분', '점 수를 조금씩 늘려 가는 가우스 구적법', '조각 수를 두 배씩 늘리는 중점 공식']}
        answer={2}
        explain={<>매끄러운 함수에서 가우스 구적법은 점을 하나 늘릴 때마다 맞는 자릿수가 몇 개씩 늘어, 그림 3에서 <M>{'e^x'}</M>는 점 5개로 오차가 <M>{'10^{-13}'}</M> 수준이었습니다. 사다리꼴 공식은 오차가 <M>{'h^2'}</M>를 따라 10자리를 얻으려면 수만 번의 계산(수십 일)이 필요하고, 몬테카를로는 오차가 <M>{'1/\\sqrt{N}'}</M>라 1차원에서는 가장 느립니다. 중점 공식도 차수가 2입니다.</>}
      />
    </>
  );
}
