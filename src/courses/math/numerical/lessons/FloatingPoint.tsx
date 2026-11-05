import { useMemo, useState } from 'react';
import { Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { cosCase, digits, halving, quadCase, relErr, sums, stallIndex, ulp, ulp32, type CancelCase } from './fp';
import './numerical.css';
import './floating.css';

const sup = (n: number) => String(n).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);
const sci = (v: number, d = 2) => {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / 10 ** e;
  return `${m.toFixed(d)}×10${sup(e)}`;
};

/** Log-scale axes: tick labels as powers of ten, grid on every `step` decades. */
function logAxes(ctx: CanvasRenderingContext2D, P: Palette, box: { x: number; y: number; w: number; h: number }, xr: [number, number], yr: [number, number], xStep: number, yStep: number, xTitle: string, yTitle: string, xIsLog = true) {
  const X = (v: number) => box.x + ((v - xr[0]) / (xr[1] - xr[0])) * box.w;
  const Y = (v: number) => box.y + box.h - ((v - yr[0]) / (yr[1] - yr[0])) * box.h;
  ctx.strokeStyle = P.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = P.ink3;
  ctx.font = `10px ${P.fontMono}`;
  for (let v = Math.ceil(yr[0] / yStep) * yStep; v <= yr[1] + 1e-9; v += yStep) {
    ctx.beginPath();
    ctx.moveTo(box.x, Math.round(Y(v)) + 0.5);
    ctx.lineTo(box.x + box.w, Math.round(Y(v)) + 0.5);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`10${sup(v)}`, box.x - 5, Y(v));
  }
  for (let v = Math.ceil(xr[0] / xStep) * xStep; v <= xr[1] + 1e-9; v += xStep) {
    ctx.beginPath();
    ctx.moveTo(Math.round(X(v)) + 0.5, box.y);
    ctx.lineTo(Math.round(X(v)) + 0.5, box.y + box.h);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(xIsLog ? `10${sup(v)}` : String(v), X(v), box.y + box.h + 5);
  }
  ctx.font = `500 11px ${P.fontBody}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(xTitle, box.x + box.w, box.y + box.h + 20);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(yTitle, box.x, box.y - 4);
  return { X, Y };
}

/* ─────────────── Figure 1: machine epsilon by halving ─────────────── */

function EpsilonFigure() {
  const [fmt, setFmt] = useState<'double' | 'single'>('double');
  const round = fmt === 'double' ? (v: number) => v : Math.fround;
  const steps = useMemo(() => halving(round), [fmt]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = useStepper(steps.length, 6, fmt, true);
  const cur = steps[s.i];
  const eps = steps[steps.length - 2];
  const lo = Math.max(0, Math.min(s.i - 4, steps.length - 8));
  const rows = steps.slice(lo, Math.min(steps.length, lo + 8));
  const show = (v: number) => (fmt === 'double' ? v.toPrecision(17) : Math.fround(v).toPrecision(9));

  return (
    <Figure
      no={1}
      title="1에 더해도 1인 가장 큰 수"
      hint="한 단계씩 넘기며 ε을 반으로 줄여 보세요"
      caption={
        <>
          ε을 1에서 시작해 반으로 줄이면서, 1 + ε을 그 형식의 수로 반올림한 값이 1과 다른지 이 브라우저에서 실제로 계산합니다. float32는 JavaScript의 <code>Math.fround</code>로 흉내 냅니다. 빨간 칸은 1 + ε이 1로 반올림된 단계입니다. 그 바로 전 단계의 ε이 기계 엡실론입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={fmt} onChange={setFmt} options={[{ value: 'double', label: '배정밀도 (64비트)' }, { value: 'single', label: '단정밀도 (32비트)' }]} />
      </div>
      <div className="fig-split">
        <div className="na-col" style={{ overflowX: 'auto' }}>
          <table className="fp-steps" aria-label="ε을 반으로 줄인 단계">
            <thead>
              <tr>
                <th>k</th>
                <th>ε = 2⁻ᵏ</th>
                <th>1 + ε (반올림 후)</th>
                <th>1과 다른가</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.k} data-now={r.k === cur.k || undefined} data-same={!r.differs || undefined}>
                  <td className="mono">{r.k}</td>
                  <td className="mono">{sci(r.eps, 3)}</td>
                  <td className="mono">{show(1 + r.eps)}</td>
                  <td>{r.differs ? '다름' : '같음 (1)'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="na-note">
            {cur.differs
              ? `k = ${cur.k}: 1 + 2${sup(-cur.k)}은 아직 1과 다른 수로 저장됩니다.`
              : `k = ${cur.k}: 1 + 2${sup(-cur.k)}은 가장 가까운 수인 1로 반올림됩니다. 그 전 단계의 2${sup(-(cur.k - 1))}이 기계 엡실론입니다.`}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="fp-eps-speed" maxSpeed={20} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="기계 엡실론" value={`2${sup(-eps.k)}`} />
            <Readout label="십진수로" value={sci(eps.eps, 3)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the gap to the next number ─────────────── */

const ULP_LO = -10, ULP_HI = 20;

function UlpFigure() {
  const P = usePalette();
  const [t, setT] = useState(16);
  const x = 10 ** t;
  const u = ulp(x);
  const u32 = ulp32(x);
  const swallow = x + 1 === x;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const box = { x: 54, y: 22, w: w - 66, h: h - 64 };
      const { X, Y } = logAxes(ctx, P, box, [ULP_LO, ULP_HI], [-28, 14], 5, 7, 'x (로그 눈금)', '다음 수까지의 간격');
      const stair = (fn: (v: number) => number, color: string, width: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        let first = true;
        for (let k = 0; k <= 600; k++) {
          const lx = ULP_LO + ((ULP_HI - ULP_LO) * k) / 600;
          const ly = Math.log10(fn(10 ** lx));
          const py = Math.max(box.y, Math.min(box.y + box.h, Y(ly)));
          if (first) ctx.moveTo(X(lx), py);
          else ctx.lineTo(X(lx), py);
          first = false;
        }
        ctx.stroke();
      };
      stair(ulp32, P.pos, 2);
      stair(ulp, P.accent, 2.5);
      // ulp = 1: from here on, x + 1 can be swallowed
      ctx.strokeStyle = alpha(P.ink3, 0.8);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(box.x, Y(0));
      ctx.lineTo(box.x + box.w, Y(0));
      ctx.stroke();
      const x53 = Math.log10(2 ** 53);
      ctx.beginPath();
      ctx.moveTo(X(x53), box.y);
      ctx.lineTo(X(x53), box.y + box.h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.ink3;
      ctx.font = `500 10px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('2⁵³', X(x53) - 4, box.y + 14);
      ctx.textAlign = 'left';
      ctx.fillText('간격 1', box.x + 4, Y(0) - 3);
      // the chosen x
      ctx.fillStyle = P.ink;
      ctx.beginPath();
      ctx.arc(X(t), Y(Math.log10(u)), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = P.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
    },
    [P, t, u],
    { aspect: 1.7, maxHeight: 360, minHeight: 240 },
  );

  return (
    <Figure
      no={2}
      title="큰 수일수록 이웃이 멀다"
      hint="x의 크기를 바꿔 보세요"
      caption={
        <>
          x 바로 다음에 오는 배정밀도 수(파란 계단)와 단정밀도 수(주황 계단)까지의 간격입니다. 두 축 모두 로그 눈금입니다. 간격은 x에 비례해 커지고, 간격을 x로 나눈 상대 간격은 언제나 기계 엡실론 근처입니다. 점선 아래로는 간격이 1보다 작고, 세로 점선 2⁵³부터는 간격이 2 이상이라 x + 1이 x로 반올림됩니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`로그-로그 그래프. x가 10의 ${t}제곱일 때 다음 배정밀도 수까지의 간격은 ${sci(u, 3)}, 단정밀도는 ${sci(u32, 3)}입니다.${swallow ? ' 이 크기에서는 x + 1이 x와 같아집니다.' : ''}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="fp-ulp-x" label="x = 10의 거듭제곱" value={t} min={ULP_LO} max={ULP_HI} step={0.5} onChange={setT} format={(v) => `10${sup(v)}`} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="배정밀도 간격" value={sci(u, 3)} color="var(--accent)" />
            <Readout label="단정밀도 간격" value={sci(u32, 3)} color="var(--pos)" />
            <Readout label="상대 간격 (배정밀도)" value={sci(u / x, 3)} />
            <Readout label="x + 1 === x" value={swallow ? '참' : '거짓'} color={swallow ? 'var(--bad)' : undefined} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--accent)', label: '배정밀도 (53비트 가수)', shape: 'ln' },
          { color: 'var(--pos)', label: '단정밀도 (24비트 가수)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: catastrophic cancellation ─────────────── */

const RANGE: Record<CancelCase, [number, number, number]> = { cos: [-9, -0.5, -4], quad: [1, 9, 5] };

function evalCase(kind: CancelCase, t: number) {
  if (kind === 'cos') return cosCase(10 ** t);
  return quadCase(10 ** t);
}

function CancelFigure() {
  const P = usePalette();
  const [kind, setKind] = useState<CancelCase>('cos');
  const [t, setT] = useState(RANGE.cos[2]);
  const pick = (k: CancelCase) => {
    setKind(k);
    setT(RANGE[k][2]);
  };
  const [lo, hi] = RANGE[kind];
  const r = evalCase(kind, t);
  const dn = digits(r.naive, r.exact);
  const ds = digits(r.stable, r.exact);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const box = { x: 40, y: 22, w: w - 52, h: h - 64 };
      const X = (v: number) => box.x + ((v - lo) / (hi - lo)) * box.w;
      const Y = (d: number) => box.y + box.h - (d / 16) * box.h;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      for (let d = 0; d <= 16; d += 4) {
        ctx.beginPath();
        ctx.moveTo(box.x, Math.round(Y(d)) + 0.5);
        ctx.lineTo(box.x + box.w, Math.round(Y(d)) + 0.5);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(d), box.x - 5, Y(d));
      }
      for (let v = Math.ceil(lo); v <= hi; v += kind === 'cos' ? 2 : 2) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`10${sup(v)}`, X(v), box.y + box.h + 5);
      }
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('맞는 유효숫자 (자리)', box.x, box.y - 4);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(kind === 'cos' ? 'x (로그 눈금)' : 'b (로그 눈금)', box.x + box.w, box.y + box.h + 20);
      const curve = (pick: 'naive' | 'stable', color: string, width: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let k = 0; k <= 240; k++) {
          const v = lo + ((hi - lo) * k) / 240;
          const c = evalCase(kind, v);
          const d = digits(c[pick], c.exact);
          if (k) ctx.lineTo(X(v), Y(d));
          else ctx.moveTo(X(v), Y(d));
        }
        ctx.stroke();
      };
      curve('stable', P.good, 2.5);
      curve('naive', P.bad, 2);
      ctx.strokeStyle = alpha(P.ink, 0.6);
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(t), box.y);
      ctx.lineTo(X(t), box.y + box.h);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [d, c] of [
        [dn, P.bad],
        [ds, P.good],
      ] as [number, string][]) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(X(t), Y(d), 5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [P, kind, t, dn, ds],
    { aspect: 1.7, maxHeight: 340, minHeight: 220 },
  );

  const param = kind === 'cos' ? `x = 10${sup(t)}` : `b = 10${sup(t)}`;
  return (
    <Figure
      no={3}
      title="비슷한 두 수를 빼면 자릿수가 사라진다"
      hint="식을 고르고 x나 b를 바꿔 보세요"
      caption={
        <>
          빨간 선은 식을 그대로 계산했을 때, 초록 선은 뺄셈이 생기지 않게 바꿔 쓴 식으로 계산했을 때 맞는 유효숫자의 개수입니다. 참값은 {kind === 'cos' ? <>테일러 급수 <M>{'\\tfrac12 - \\tfrac{x^2}{24} + \\tfrac{x^4}{720}'}</M>으로</> : <>바꿔 쓴 식으로</>} 계산했습니다. 두 식은 수학적으로 같지만, 컴퓨터에서는 전혀 다른 결과를 냅니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          value={kind}
          onChange={pick}
          options={[
            { value: 'cos', label: '(1 − cos x)/x²' },
            { value: 'quad', label: 'x² + bx + 1의 작은 근' },
          ]}
        />
        <Slider id="fp-cancel-t" label={kind === 'cos' ? 'x' : 'b'} value={t} min={lo} max={hi} step={0.25} onChange={setT} format={(v) => `10${sup(v)}`} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${param}에서 그대로 계산한 식은 유효숫자 ${dn.toFixed(1)}자리, 바꿔 쓴 식은 ${ds.toFixed(1)}자리가 맞습니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="na-col">
          {kind === 'cos' ? (
            <>
              <MB>{'\\frac{1-\\cos x}{x^2} \\;=\\; \\frac{2\\sin^2(x/2)}{x^2}'}</MB>
            </>
          ) : (
            <>
              <MB>{'\\frac{-b+\\sqrt{b^2-4}}{2} \\;=\\; \\frac{2}{-b-\\sqrt{b^2-4}}'}</MB>
            </>
          )}
          <div className="fp-cmp">
            <div>
              <span className="lbl">그대로 ({param})</span>
              <span className="val bad">{r.naive.toPrecision(17)}</span>
              <span className="lbl" style={{ marginTop: 4 }}>
                맞는 자리 {dn.toFixed(1)} · 상대 오차 {sci(relErr(r.naive, r.exact), 1)}
              </span>
            </div>
            <div>
              <span className="lbl">바꿔 쓴 식</span>
              <span className="val good">{r.stable.toPrecision(17)}</span>
              <span className="lbl" style={{ marginTop: 4 }}>맞는 자리 {ds.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--bad)', label: '그대로 계산', shape: 'ln' },
          { color: 'var(--good)', label: '바꿔 쓴 식', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 4: the order of a sum ─────────────── */

const SUM_TS = Array.from({ length: 17 }, (_, i) => 2 + i * 0.25);

function SumFigure() {
  const P = usePalette();
  const [t, setT] = useState(4);
  const n = Math.round(10 ** t);
  const r = useMemo(() => sums(n), [n]);
  const curves = useMemo(() => SUM_TS.map((v) => ({ t: v, ...sums(Math.round(10 ** v)) })), []);
  const stall = useMemo(() => stallIndex(1e6), []);
  const err = (v: number, ref: number) => Math.max(1e-10, Math.abs(v - ref));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const box = { x: 50, y: 22, w: w - 62, h: h - 64 };
      const { X, Y } = logAxes(ctx, P, box, [2, 6], [-10, -2], 1, 2, '더한 항의 수 n (로그 눈금)', '|오차|');
      const line = (key: 'forward' | 'backward' | 'kahan', color: string, width: number, dash: number[] = []) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        curves.forEach((c, i) => {
          const y = Y(Math.log10(err(c[key], c.ref)));
          if (i) ctx.lineTo(X(c.t), y);
          else ctx.moveTo(X(c.t), y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      };
      line('forward', P.bad, 2.5);
      line('backward', P.accent, 2);
      line('kahan', P.good, 2, [5, 4]);
      const xs = Math.log10(stall);
      ctx.strokeStyle = alpha(P.ink3, 0.8);
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(xs), box.y);
      ctx.lineTo(X(xs), box.y + box.h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.ink3;
      ctx.font = `500 10px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`k = ${stall}부터 더해지지 않음`, X(xs) + 4, box.y + 2);
      ctx.strokeStyle = alpha(P.ink, 0.5);
      ctx.beginPath();
      ctx.moveTo(X(t), box.y);
      ctx.lineTo(X(t), box.y + box.h);
      ctx.stroke();
    },
    [P, t, curves, stall],
    { aspect: 1.7, maxHeight: 340, minHeight: 220 },
  );

  const row = (label: string, v: number, color: string) => (
    <tr>
      <td>
        <span style={{ color }}>■</span> {label}
      </td>
      <td className="num">{v.toPrecision(9)}</td>
      <td className="num">{(v - r.ref >= 0 ? '+' : '−') + sci(Math.abs(v - r.ref), 2)}</td>
    </tr>
  );

  return (
    <Figure
      no={4}
      title="더하는 순서가 답을 바꾼다"
      hint="항의 수 n을 바꿔 보세요"
      caption={
        <>
          <M>{'\\sum_{k=1}^{n} 1/k^2'}</M>을 단정밀도(float32)로 세 가지 방법으로 더하고, 같은 항들을 배정밀도로 더한 값과의 차이를 그렸습니다. 큰 항부터 더하면 합이 1.64쯤에 이른 뒤로 작은 항이 반올림에 묻혀 사라집니다. 작은 항부터 더하거나, 잃어버린 아랫자리를 따로 챙겨 다음 항에 보태는 카한 합을 쓰면 오차가 단정밀도의 한계 근처에 머뭅니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="fp-sum-n" label="n" value={t} min={2} max={6} step={0.25} onChange={setT} format={(v) => Math.round(10 ** v).toLocaleString('ko-KR')} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`1/k²을 ${n}개 더한 합의 오차. 큰 항부터 더하면 ${sci(Math.abs(r.forward - r.ref), 2)}, 작은 항부터 더하면 ${sci(Math.abs(r.backward - r.ref), 2)}, 카한 합은 ${sci(Math.abs(r.kahan - r.ref), 2)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="na-col" style={{ overflowX: 'auto' }}>
          <table className="fp-table" aria-label={`n = ${n}일 때 세 가지 합`}>
            <thead>
              <tr>
                <th>방법 (n = {n.toLocaleString('ko-KR')})</th>
                <th>합 (float32)</th>
                <th>차이</th>
              </tr>
            </thead>
            <tbody>
              {row('큰 항부터', r.forward, 'var(--bad)')}
              {row('작은 항부터', r.backward, 'var(--accent)')}
              {row('카한 합', r.kahan, 'var(--good)')}
              <tr>
                <td>배정밀도 기준값</td>
                <td className="num">{r.ref.toPrecision(9)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--bad)', label: '큰 항부터', shape: 'ln' },
          { color: 'var(--accent)', label: '작은 항부터', shape: 'ln' },
          { color: 'var(--good)', label: '카한 합 (점선)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function FloatingPoint() {
  return (
    <>
      <h2>0.1을 열 번 더하면</h2>
      <p>
        JavaScript에서 <code>0.1</code>을 열 번 더하면 <code>0.9999999999999999</code>가 나옵니다. 0.1은 이진법으로 끝없이 이어지는 수라서 64비트 안에 정확히 담기지 않고, 가장 가까운 수로 반올림되어 저장되기 때문입니다. 수가 비트로 어떻게 저장되는지는 <a href={lessonHref('cs-architecture', 'binary')}>비트와 수 표현</a>에서 직접 비트를 바꿔 보며 다뤘습니다. 이 장에서는 그 반올림 오차가 <strong>얼마나 크고</strong>, 계산을 거치며 <strong>어떻게 자라는지</strong>, 그리고 어떻게 하면 자라지 않게 할 수 있는지 봅니다.
      </p>
      <p>
        배정밀도 수(IEEE 754 double)는 <M>{'\\pm 1.f \\times 2^e'}</M> 꼴로, 가수부 <M>f</M>에 52비트, 지수 <M>e</M>에 11비트를 씁니다. 그래서 어떤 크기에서든 유효숫자는 이진수로 53자리, 십진수로 15~16자리입니다. 이 정밀도를 하나의 수로 나타낸 것이 <T en="machine epsilon">기계 엡실론</T>, 곧 1에 더했을 때 1과 다른 수가 되는 가장 작은 2의 거듭제곱입니다.
      </p>
      <EpsilonFigure />
      <p>
        배정밀도에서는 52번 반으로 줄인 <M>{'2^{-52} \\approx 2.22 \\times 10^{-16}'}</M>까지 1에 더해지고, 53번째인 <M>{'2^{-53}'}</M>은 1로 반올림됩니다. 단정밀도에서는 <M>{'2^{-23} \\approx 1.19 \\times 10^{-7}'}</M>입니다. 반올림을 가장 가까운 수로 하므로, 아무 실수 <M>x</M>를 저장할 때 생기는 상대 오차는 기계 엡실론의 절반을 넘지 않습니다.
      </p>
      <MB note="u = ε/2를 단위 반올림이라고 합니다.">{'\\mathrm{fl}(x) = x(1+\\delta), \\qquad |\\delta| \\le u = \\tfrac{\\varepsilon}{2}'}</MB>
      <p>
        상대 오차가 일정하다는 말은 <strong>절대</strong> 간격은 수가 클수록 커진다는 뜻입니다. 그림 2에서 x를 바꿔 보세요. 1 근처에서 이웃한 수의 간격은 <M>{'2.22 \\times 10^{-16}'}</M>이지만, <M>{'10^{16}'}</M> 근처에서는 2입니다. 그래서 <code>1e16 + 1 === 1e16</code>이 참입니다. 정수를 빠짐없이 담을 수 있는 한계는 <M>{'2^{53} \\approx 9.0 \\times 10^{15}'}</M>이고, JavaScript의 <code>Number.MAX_SAFE_INTEGER</code>가 바로 <M>{'2^{53}-1'}</M>입니다.
      </p>
      <UlpFigure />

      <h2>상쇄: 뺄셈이 오차를 키운다</h2>
      <p>
        곱셈과 나눗셈은 상대 오차를 거의 그대로 전합니다. 위험한 것은 거의 같은 두 수의 뺄셈입니다. 두 수가 앞의 10자리까지 같다면, 빼고 나면 그 10자리가 사라지고 원래 반올림 오차가 들어 있던 뒷자리만 남습니다. 이것을 <T en="catastrophic cancellation">상쇄</T>라고 합니다. 뺄셈 자체는 정확하게 계산되지만, 뺄셈에 들어간 수에 이미 있던 오차가 결과에 비해 엄청나게 커집니다.
      </p>
      <p>
        <M>{'x = 10^{-4}'}</M>에서 <M>{'\\cos x = 0.999999995\\ldots'}</M>이므로 <M>{'1 - \\cos x'}</M>는 앞의 8자리를 잃습니다. 그림 3에서 그대로 계산한 값은 <code>0.4999999969612645</code>로 유효숫자가 8.3자리만 맞고, <M>{'x = 10^{-8}'}</M>에서는 <M>{'\\cos x'}</M>가 정확히 1로 반올림되어 0이 나옵니다. 반각 공식 <M>{'1-\\cos x = 2\\sin^2(x/2)'}</M>으로 바꿔 쓰면 뺄셈이 없어지고, 모든 x에서 거의 16자리가 맞습니다.
      </p>
      <CancelFigure />
      <p>
        이차방정식의 근의 공식도 같은 함정이 있습니다. <M>{'x^2 + bx + 1 = 0'}</M>에서 <M>b</M>가 크면 <M>{'\\sqrt{b^2-4} \\approx b'}</M>라서 작은 근 <M>{'(-b+\\sqrt{b^2-4})/2'}</M>는 거의 같은 두 수의 뺄셈입니다. <M>{'b = 10^5'}</M>이면 6.5자리만 맞고, <M>{'b = 10^9'}</M>이면 0이 나옵니다. 분자와 분모에 <M>{'-b-\\sqrt{b^2-4}'}</M>를 곱해 바꿔 쓴 <M>{'2/(-b-\\sqrt{b^2-4})'}</M>는 같은 부호의 두 수를 더하므로 상쇄가 없습니다.
      </p>
      <Callout kind="key" label="요령">
        거의 같은 두 수를 빼는 곳을 찾아, 식을 바꿔 뺄셈을 없애십시오. 켤레를 곱하거나(√a − √b = (a − b)/(√a + √b)), 삼각함수 항등식을 쓰거나, 작은 x에서는 테일러 급수를 씁니다. 수학 라이브러리의 <code>Math.expm1(x)</code>와 <code>Math.log1p(x)</code>는 eˣ − 1과 log(1 + x)를 작은 x에서 상쇄 없이 계산하려고 따로 있는 함수입니다.
      </Callout>

      <h2>더하는 순서</h2>
      <p>
        실수의 덧셈은 결합법칙이 성립하지만 부동소수점 덧셈은 그렇지 않습니다. 합이 커지면 다음 항을 더할 때 그 항의 아랫자리가 합의 간격보다 작아 반올림으로 사라집니다. 그림 4는 <M>{'\\sum 1/k^2'}</M>을 단정밀도로 더합니다. 큰 항부터 더하면 <M>{'k = 4097'}</M>에서 <M>{'1/k^2 \\approx 6 \\times 10^{-8}'}</M>이 합 1.64의 간격의 절반보다 작아져 더해도 합이 그대로이고, 그 뒤의 항들은 전부 버려집니다. n = 10,000일 때 오차는 <M>{'1.09 \\times 10^{-4}'}</M>로, 단정밀도가 낼 수 있는 정확도(합 1.64의 간격 약 1.2×10⁻⁷)보다 수백 배 큽니다.
      </p>
      <SumFigure />
      <p>
        작은 항부터 더하면 합이 작을 때 작은 항들끼리 먼저 모이므로 잃는 것이 거의 없고, 같은 n에서 오차는 <M>{'2.97 \\times 10^{-8}'}</M>입니다. 순서를 바꿀 수 없을 때는 <T en="Kahan summation">카한 합</T>을 씁니다. 매번 더하고 나서 <M>{'(t - s) - y'}</M>를 계산하면 이번 덧셈에서 반올림으로 잃어버린 양이 정확히 나오는데, 그것을 다음 항에서 빼 줍니다.
      </p>
      <Code label="카한 합">{`
function kahanSum(xs) {
  let s = 0, c = 0;          // c: 지금까지 잃어버린 아랫자리
  for (const x of xs) {
    const y = x - c;         // 잃은 만큼 보태서
    const t = s + y;         // 더하고
    c = (t - s) - y;         // 이번에 잃은 양을 다시 잰다
    s = t;
  }
  return s;
}`}</Code>
      <p>
        신경망 학습에서 수백만 개의 기울기를 더할 때, 그래픽 카드가 16비트나 8비트 수로 계산할 때 이 문제는 훨씬 심해집니다. 그래서 낮은 정밀도로 곱하더라도 합은 높은 정밀도로 모으는 것이 보통입니다.
      </p>

      <h2>조건수와 안정성</h2>
      <p>
        오차를 이야기할 때 두 가지를 구별해야 합니다. 하나는 <strong>문제</strong> 자체가 입력의 작은 변화에 얼마나 민감한가이고, 다른 하나는 <strong>알고리즘</strong>이 반올림 오차를 얼마나 키우는가입니다. 앞의 것을 재는 수가 <T en="condition number">조건수</T>입니다.
      </p>
      <MB note="입력의 상대 오차가 출력의 상대 오차로 몇 배가 되어 나오는지.">{'\\kappa(x) = \\left| \\frac{x\\, f^{\\prime}(x)}{f(x)} \\right|'}</MB>
      <div className="tbl-wrap">
        <table className="fp-table">
          <thead>
            <tr>
              <th>문제</th>
              <th>조건수</th>
              <th>직접 계산</th>
              <th>판정</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <M>{'\\sqrt{x+1}-\\sqrt{x}'}</M>, <M>{'x = 10^{12}'}</M>
              </td>
              <td className="num">0.5</td>
              <td>유효숫자 5.1자리</td>
              <td>문제는 쉬운데 알고리즘이 불안정합니다. <M>{'1/(\\sqrt{x+1}+\\sqrt{x})'}</M>로 바꾸면 16자리가 맞습니다.</td>
            </tr>
            <tr>
              <td>
                <M>{'1-x'}</M>, <M>{'x = 0.999999'}</M>
              </td>
              <td className="num">999,999</td>
              <td>입력 오차가 백만 배로</td>
              <td>문제 자체가 나쁜 조건입니다. x가 반올림되어 들어온 순간 이미 6자리를 잃었고, 어떤 알고리즘으로도 되찾을 수 없습니다.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        좋은 알고리즘은 <T en="stable">안정</T>합니다. 곧, 계산 결과가 입력을 아주 조금 바꾼 문제의 정확한 답과 같습니다. 안정한 알고리즘을 쓰면 남는 오차는 대략 조건수 곱하기 기계 엡실론입니다. 조건수가 <M>{'10^{k}'}</M>이면 16자리 중 <M>k</M>자리쯤을 잃을 각오를 해야 합니다. 이 생각은 <a href={lessonHref('math-numerical-analysis', 'linear-systems')}>연립방정식과 조건수</a>에서 행렬로 이어집니다.
      </p>
      <Callout kind="note" label="실제로 일어난 일">
        널리 인용되는 두 사례가 있습니다. 1991년 걸프전에서 패트리엇 미사일 시스템은 0.1초 단위의 시간을 24비트 고정소수점으로 셌는데, 0.1이 정확히 담기지 않아 생긴 아주 작은 오차가 100시간 넘게 쌓여 약 0.34초가 되었고, 요격에 실패했습니다. 1996년 아리안 5 로켓은 64비트 부동소수점 값을 16비트 정수로 바꾸다 넘침이 일어나 발사 40초 만에 폭발했습니다. 둘 다 계산 하나하나는 작은 오차였습니다.
      </Callout>

      <Callout kind="key">
        부동소수점 수는 상대 오차가 기계 엡실론(배정밀도 2⁻⁵² ≈ 2.2×10⁻¹⁶)의 절반 이하가 되도록 실수를 반올림해 담고, 그래서 이웃한 수의 간격은 크기에 비례해 커집니다. 거의 같은 두 수를 빼면 앞자리가 사라지는 상쇄가 일어나므로 식을 바꿔 뺄셈을 없애고, 많은 수를 더할 때는 작은 것부터 더하거나 카한 합을 씁니다. 문제가 입력에 민감한 정도는 조건수로 재고, 안정한 알고리즘이 남기는 오차는 대략 조건수 × 기계 엡실론입니다.
      </Callout>
      <Quiz
        q="x가 아주 작을 때 eˣ − 1을 계산하려 한다. 가장 정확한 방법은?"
        options={[
          'Math.exp(x) − 1을 배정밀도로 계산한다',
          'Math.exp(x) − 1을 단정밀도로 계산한다',
          'x + x²/2 + x³/6처럼 테일러 급수를 쓰거나 Math.expm1(x)을 쓴다',
          '(Math.exp(x) − 1)을 두 번 계산해 평균을 낸다',
        ]}
        answer={2}
        explain={<>x가 작으면 eˣ는 1에 아주 가까워서 eˣ − 1은 거의 같은 두 수의 뺄셈, 곧 상쇄입니다. x = 10⁻¹⁰이면 eˣ의 앞 10자리가 1과 같아 그만큼의 유효숫자가 사라집니다. 정밀도를 낮추면 더 나빠지고, 같은 계산을 두 번 하면 같은 오차가 두 번 나올 뿐입니다. 뺄셈이 없는 테일러 급수나 이를 위해 만든 Math.expm1을 쓰면 거의 모든 자리가 맞습니다.</>}
      />
    </>
  );
}
