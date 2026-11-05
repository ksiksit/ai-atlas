import { useMemo, useState } from 'react';
import { Button, Callout, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot, fmt } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { CURVES, PARTS, SOLIDS, WORKED, diskSum, improperLimit, improperUpTo, partsAreas, polyLength, simpson, strips, subU, subX, type CurveCase, type PartsCase, type SolidCase } from './techniques';
import './calculus.css';
import './techniques.css';

const f4 = (v: number) => fmt(v, 4);

/* ─────────────── Figure 1: substitution stretches the axis ─────────────── */

function SubstitutionFigure() {
  const P = usePalette();
  const [a, setA] = useState(1.5);
  const [n, setN] = useState(6);
  const ss = useMemo(() => strips(a, n), [a, n]);
  const areaX = ss.reduce((s, t) => s + t.ax, 0);
  const areaU = ss.reduce((s, t) => s + t.au, 0);
  const cols = [P.accent, P.stats1];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const gap = 34;
      const hTop = (h - gap) / 2;
      const top = new Plot(ctx, w, hTop, P, { xMin: 0, xMax: 2.3, yMin: -3.6, yMax: 2.2, pad: { l: 40, r: 14, t: 18, b: 22 } });
      const bot = new Plot(ctx, w, h, P, { xMin: 0, xMax: 5.3, yMin: -1.25, yMax: 1.25, pad: { l: 40, r: 14, t: hTop + gap, b: 24 } });
      top.grid({ xStep: 0.5, yStep: 1, xLabel: 'x' });
      bot.grid({ xStep: 1, yStep: 0.5, xLabel: 'u = x²' });
      ss.forEach((s, i) => {
        const c = alpha(cols[i % 2], s.ax < 0 ? 0.22 : 0.42);
        top.fillUnder(subX, c, s.x0, s.x1);
        bot.fillUnder(subU, c, s.u0, s.u1);
      });
      top.fn(subX, P.ink, 2.2);
      bot.fn(subU, P.ink, 2.2);
      // where each x boundary lands on the u axis
      ctx.save();
      ctx.strokeStyle = alpha(P.ink3, 0.6);
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      for (const s of ss) {
        for (const [x, u] of [[s.x0, s.u0], [s.x1, s.u1]]) {
          ctx.beginPath();
          ctx.moveTo(top.X(x), top.pad.t + top.ph);
          ctx.lineTo(bot.X(u), bot.pad.t);
          ctx.stroke();
        }
      }
      ctx.restore();
      top.text('2x·cos(x²)', 0.08, 1.85, P.ink2, { font: `600 12px ${P.fontBody}` });
      bot.text('cos u', 0.1, 1.05, P.ink2, { font: `600 12px ${P.fontBody}` });
    },
    [P, ss],
    { height: 420, minHeight: 320 },
  );

  const neg = ss.findIndex((s) => s.ax < 0);
  return (
    <Figure
      no={1}
      title="치환은 축을 늘이고 줄입니다"
      hint="a와 조각 수를 바꿔 보세요"
      caption={
        <>
          위는 <M>{'\\int_0^a 2x\\cos(x^2)\\,dx'}</M>를 x축에서, 아래는 <M>{'u = x^2'}</M>으로 바꾼 <M>{'\\int_0^{a^2}\\cos u\\,du'}</M>를 u축에서 본 것입니다. [0, a]를 너비가 같은 조각으로 나누고, 같은 색끼리 짝입니다. 점선은 x의 경계가 u축 어디로 가는지 보여 줍니다. x가 클수록 조각이 u축에서 넓게 늘어나지만, 높이가 2x만큼 줄어든 셈이라 넓이는 그대로입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`위 그래프는 x에서 0부터 ${fmt(a, 2)}까지 2x cos(x²) 아래의 넓이를 ${n}개 조각으로, 아래 그래프는 u에서 0부터 ${fmt(a * a, 2)}까지 cos u 아래의 넓이를 대응하는 조각으로 칠했습니다. 두 넓이는 모두 ${f4(areaX)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="tq-sub-a" label="위 끝 a" value={a} min={0.3} max={2.2} step={0.05} onChange={setA} format={(v) => v.toFixed(2)} />
          <Slider id="tq-sub-n" label="조각 수" value={n} min={2} max={12} step={1} onChange={setN} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="x 그림의 넓이" value={f4(areaX)} />
            <Readout label="u 그림의 넓이" value={f4(areaU)} />
            <Readout label={<>sin(a²)</>} value={f4(Math.sin(a * a))} color="var(--good)" />
            <Readout label="u 구간" value={`0 ~ ${fmt(a * a, 2)}`} />
          </div>
          <div className="tq-strips" aria-label="조각별 넓이">
            {ss.map((s, i) => (
              <span key={i} style={{ ['--c' as string]: i % 2 ? 'var(--c-stats-1)' : 'var(--accent)' }} data-neg={s.ax < 0 || undefined}>
                {fmt(s.ax, 3)}
              </span>
            ))}
          </div>
          <p className="ca-small">
            {neg >= 0 ? `${neg + 1}번째 조각부터는 u가 π/2 ≈ 1.571을 넘어 cos u가 음수가 되므로 넓이도 음수로 셉니다.` : '조각마다 두 그림의 넓이가 같습니다.'}
          </p>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: integration by parts as areas ─────────────── */

function PartsFigure() {
  const P = usePalette();
  const [c, setC] = useState<PartsCase>('xex');
  const s = PARTS[c];
  const [bs, setBs] = useState<Record<PartsCase, number>>({ xex: PARTS.xex.tDefault, lnx: PARTS.lnx.tDefault });
  const b = bs[c];
  const A = useMemo(() => partsAreas(c, b), [c, b]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const uMax = s.u(s.tMax) * 1.08;
      const vMax = s.v(s.tMax) * 1.08;
      const pl = new Plot(ctx, w, h, P, { xMin: -0.05 * uMax, xMax: uMax, yMin: -0.05 * vMax, yMax: vMax, pad: { l: 40, r: 14, t: 14, b: 26 } });
      pl.grid({ xLabel: 'u', yLabel: 'v' });
      const N = 160;
      const pts: [number, number][] = [];
      for (let i = 0; i <= N; i++) {
        const t = s.t0 + ((b - s.t0) * i) / N;
        pts.push([s.u(t), s.v(t)]);
      }
      const poly = (path: [number, number][], fill: string) => {
        ctx.beginPath();
        path.forEach(([u, v], i) => (i ? ctx.lineTo(pl.X(u), pl.Y(v)) : ctx.moveTo(pl.X(u), pl.Y(v))));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      // ∫ v du: between the curve and the u-axis
      poly([...pts, [A.u1, 0], [A.u0, 0]], alpha(P.pos, 0.3));
      // ∫ u dv: between the curve and the v-axis
      poly([...pts, [0, A.v1], [0, A.v0]], alpha(P.neg, 0.3));
      // the rectangle u1 v1 (minus u0 v0, which is 0 here)
      ctx.save();
      ctx.strokeStyle = P.ink2;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pl.X(0), pl.Y(A.v1), pl.X(A.u1) - pl.X(0), pl.Y(0) - pl.Y(A.v1));
      ctx.restore();
      // full curve faint, the used part strong
      const all: [number, number][] = [];
      for (let i = 0; i <= N; i++) {
        const t = s.t0 + ((s.tMax - s.t0) * i) / N;
        all.push([s.u(t), s.v(t)]);
      }
      ctx.strokeStyle = alpha(P.ink3, 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      all.forEach(([u, v], i) => (i ? ctx.lineTo(pl.X(u), pl.Y(v)) : ctx.moveTo(pl.X(u), pl.Y(v))));
      ctx.stroke();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      pts.forEach(([u, v], i) => (i ? ctx.lineTo(pl.X(u), pl.Y(v)) : ctx.moveTo(pl.X(u), pl.Y(v))));
      ctx.stroke();
      pl.dot(A.u1, A.v1, 5, P.ink, P.surface);
      pl.text('∫u dv', A.u1 * 0.28, A.v0 + (A.v1 - A.v0) * 0.72, P.neg, { align: 'center', bg: alpha(P.surface, 0.85) });
      pl.text('∫v du', A.u1 * 0.62, Math.max(A.v0, A.v1 * 0.18), P.pos, { align: 'center', bg: alpha(P.surface, 0.85) });
      pl.text(`(u₁, v₁) = (${fmt(A.u1, 2)}, ${fmt(A.v1, 2)})`, A.u1, A.v1, P.ink2, { dx: -8, dy: -14, align: 'right', font: `500 11px ${P.fontMono}` });
    },
    [P, c, b, A],
    { height: 360, minHeight: 280 },
  );

  return (
    <Figure
      no={2}
      title="부분적분을 넓이로 보기"
      hint="b를 움직여 두 넓이의 합을 보세요"
      caption={
        <>
          가로축이 u, 세로축이 v인 평면에 곡선 (u, v)를 그렸습니다. 곡선과 u축 사이의 넓이가 <M>{'\\int v\\,du'}</M>, 곡선과 v축 사이의 넓이가 <M>{'\\int u\\,dv'}</M>입니다. 두 넓이를 합치면 점선 직사각형 <M>{'u_1v_1'}</M>(에서 원점 쪽 작은 직사각형 <M>{'u_0v_0'}</M>를 뺀 것)이 됩니다. 여기서는 두 예 모두 <M>{'u_0 = 0'}</M>이라 작은 직사각형이 없습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={c} onChange={setC} options={[{ value: 'xex', label: <M>{'\\int x e^x dx'}</M> }, { value: 'lnx', label: <M>{'\\int \\ln x\\, dx'}</M> }]} />
        <Slider id="tq-parts-b" label="위 끝 b" value={b} min={s.tMin} max={s.tMax} step={0.05} onChange={(v) => setBs({ ...bs, [c]: v })} format={(v) => v.toFixed(2)} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${s.uTex}, ${s.vTex}일 때 곡선 아래 넓이 ∫v du는 ${f4(A.vdu)}, 직사각형 u₁v₁은 ${f4(A.rect)}, 그 차이인 ∫u dv는 ${f4(A.udv)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <MB>{`${s.uTex},\\quad ${s.vTex}`}</MB>
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="직사각형 u₁v₁ − u₀v₀" value={f4(A.rect)} />
            <Readout label="쉬운 쪽 ∫v du" value={f4(A.vdu)} color="var(--pos)" />
            <Readout label={<>구하려는 {c === 'xex' ? '∫ x eˣ dx' : '∫ ln x dx'} = 차</>} value={f4(A.rect - A.vdu)} color="var(--neg)" />
          </div>
          <p className="ca-small">곡선과 v축 사이 넓이를 직접 잰 값: {f4(A.udv)}</p>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: three worked examples ─────────────── */

function WorkedFigure() {
  const [ei, setEi] = useState(0);
  const [step, setStep] = useState(0);
  const ex = WORKED[ei];
  const num = simpson(ex.integrand, 0, 1);
  const byAnti = ex.anti(1) - ex.anti(0);
  const pick = (i: number) => {
    setEi(i);
    setStep(0);
  };
  const last = ex.steps.length - 1;
  return (
    <Figure
      no={3}
      title="세 적분을 한 줄씩"
      hint="다음 줄을 눌러 풀이를 따라가세요"
      caption={<>마지막 줄까지 가면 구한 원시함수로 계산한 [0, 1]의 정적분과, 넓이를 잘게 쪼개 직접 더한 값(심프슨 공식, 400조각)을 나란히 보여 줍니다. 두 값이 같으면 풀이가 맞습니다.</>}
    >
      <div className="controls row">
        <Seg value={ei} onChange={pick} options={WORKED.map((w, i) => ({ value: i, label: w.title }))} />
        <div className="btn-row">
          <Button small onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
            이전 줄
          </Button>
          <Button small primary onClick={() => setStep(Math.min(last, step + 1))} disabled={step >= last}>
            다음 줄
          </Button>
          <Button small onClick={() => setStep(last)} disabled={step >= last}>
            끝까지
          </Button>
        </div>
      </div>
      <div className="tq-steps" aria-live="polite">
        <div className="tq-kind">{ex.kind}</div>
        <ol>
          {ex.steps.slice(0, step + 1).map((s, i) => (
            <li key={i} data-now={i === step || undefined}>
              <MB>{s.tex}</MB>
              <p>{s.note}</p>
            </li>
          ))}
        </ol>
      </div>
      {step === last && (
        <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          <Readout label="원시함수로 구한 ∫₀¹" value={fmt(byAnti, 6)} color="var(--good)" />
          <Readout label="잘게 쪼개 더한 ∫₀¹" value={fmt(num, 6)} />
          <Readout label="차이" value={Math.abs(byAnti - num).toExponential(1)} />
        </div>
      )}
    </Figure>
  );
}

/* ─────────────── Figure 4: measuring by slicing ─────────────── */

type SliceMode = 'volume' | 'length' | 'improper';

function VolumeView() {
  const P = usePalette();
  const [k, setK] = useState<SolidCase>('sphere');
  const [n, setN] = useState(8);
  const s = SOLIDS[k];
  const V = diskSum(s, n);
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const R = k === 'horn' ? 1.1 : 1.2;
      const pl = new Plot(ctx, w, h, P, { xMin: s.a - 0.3, xMax: s.b + 0.3, yMin: -R, yMax: R, equal: true, pad: { l: 30, r: 12, t: 12, b: 24 } });
      pl.grid({ xLabel: 'x' });
      const hh = (s.b - s.a) / n;
      for (let i = 0; i < n; i++) {
        const x0 = s.a + i * hh;
        const r = s.f(x0 + hh / 2);
        const X0 = pl.X(x0), X1 = pl.X(x0 + hh), Yt = pl.Y(r), Yb = pl.Y(-r);
        ctx.fillStyle = alpha(i % 2 ? P.stats1 : P.accent, 0.32);
        ctx.fillRect(X0, Yt, X1 - X0, Yb - Yt);
        ctx.strokeStyle = alpha(P.accent, 0.8);
        ctx.lineWidth = 1;
        ctx.strokeRect(X0 + 0.5, Yt + 0.5, X1 - X0 - 1, Yb - Yt - 1);
        // the round face of the disk, seen at an angle
        const ew = Math.max(2, Math.min((X1 - X0) * 0.45, 10));
        ctx.beginPath();
        ctx.ellipse(X1, (Yt + Yb) / 2, ew, (Yb - Yt) / 2, 0, 0, Math.PI * 2);
        ctx.strokeStyle = alpha(P.ink3, 0.55);
        ctx.stroke();
      }
      pl.fn(s.f, P.ink, 2.2, { from: s.a, to: s.b });
      pl.fn((x) => -s.f(x), P.ink, 2.2, { from: s.a, to: s.b });
    },
    [P, k, n],
    { height: 300, minHeight: 220 },
  );
  return (
    <>
      <div className="controls row">
        <Seg value={k} onChange={setK} options={(Object.keys(SOLIDS) as SolidCase[]).map((key) => ({ value: key, label: SOLIDS[key].name }))} />
        <Slider id="tq-vol-n" label="원판 수" value={n} min={1} max={64} step={1} onChange={setN} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${s.name}을 x축에 수직인 원판 ${n}개로 썰었습니다. 원판 부피의 합은 ${f4(V)}, 정확한 부피는 ${f4(s.exact)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <MB>{s.exactTex}</MB>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label={`원판 ${n}개의 합`} value={f4(V)} />
            <Readout label="정확한 부피" value={f4(s.exact)} color="var(--good)" />
            <Readout label="오차" value={fmt(V - s.exact, 4)} />
          </div>
        </div>
      </div>
    </>
  );
}

function LengthView() {
  const P = usePalette();
  const [k, setK] = useState<CurveCase>('quarter');
  const [n, setN] = useState(4);
  const c = CURVES[k];
  const L = polyLength(c, n);
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: c.a - 0.15, xMax: c.b + 0.15, yMin: -0.15, yMax: 1.2, equal: true, pad: { l: 30, r: 12, t: 12, b: 24 } });
      pl.grid({ xLabel: 'x' });
      pl.fn(c.f, alpha(P.ink3, 0.7), 5, { from: c.a, to: c.b });
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const x = c.a + ((c.b - c.a) * i) / n;
        const X = pl.X(x), Y = pl.Y(c.f(x));
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      }
      ctx.stroke();
      if (n <= 32) for (let i = 0; i <= n; i++) {
        const x = c.a + ((c.b - c.a) * i) / n;
        pl.dot(x, c.f(x), 3.5, P.accent, P.surface, 1.5);
      }
    },
    [P, k, n],
    { height: 300, minHeight: 220 },
  );
  return (
    <>
      <div className="controls row">
        <Seg value={k} onChange={setK} options={(Object.keys(CURVES) as CurveCase[]).map((key) => ({ value: key, label: CURVES[key].name }))} />
        <Slider id="tq-len-n" label="꺾은선 마디 수" value={n} min={1} max={64} step={1} onChange={setN} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${c.name}을 마디 ${n}개의 꺾은선으로 따라갔습니다. 꺾은선 길이는 ${fmt(L, 5)}, 곡선의 길이는 ${fmt(c.exact, 5)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <MB>{'L = \\int_a^b \\sqrt{1 + f\'(x)^2}\\,dx'}</MB>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label={`꺾은선 ${n}마디`} value={fmt(L, 5)} />
            <Readout label="곡선의 길이" value={fmt(c.exact, 5)} color="var(--good)" />
            <Readout label="오차" value={fmt(L - c.exact, 5)} />
            {k === 'quarter' && <Readout label="× 2 (반원 = π)" value={fmt(2 * L, 5)} />}
          </div>
        </div>
      </div>
    </>
  );
}

function ImproperView() {
  const P = usePalette();
  const [p, setP] = useState(1);
  const [lb, setLb] = useState(2);
  const b = Math.pow(10, lb);
  const area = improperUpTo(p, b);
  const lim = improperLimit(p);
  const g = (x: number) => Math.pow(x, -p);
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const narrow = w < 560;
      const lw = narrow ? w : w * 0.48;
      const lh = narrow ? h * 0.5 : h;
      const left = new Plot(ctx, lw, lh, P, { xMin: 0, xMax: 12, yMin: 0, yMax: 2.2, pad: { l: 34, r: 10, t: 14, b: 24 } });
      left.grid({ xStep: 2, yStep: 0.5, xLabel: 'x' });
      left.fillUnder(g, alpha(P.accent, 0.35), 1, Math.min(b, 12));
      left.fn(g, P.ink, 2.2, { from: 0.45 });
      left.text(`y = 1/x^${fmt(p, 1)}`, 3.4, 1.6, P.ink2, { font: `600 12px ${P.fontBody}` });
      if (b > 12) left.text('→ 오른쪽으로 계속', 11.8, 0.25, P.accent, { align: 'right', font: `600 11px ${P.fontBody}` });

      // area so far, against b on a log axis
      const ox = narrow ? 0 : lw + 10;
      const oy = narrow ? lh + 6 : 0;
      const W = narrow ? w : w - lw - 10;
      const H = narrow ? h - lh - 6 : h;
      const top = isFinite(lim) ? lim * 1.35 : improperUpTo(p, 1e4) * 1.08;
      const pl = { l: ox + 40, r: ox + W - 10, t: oy + 14, b: oy + H - 26 };
      const X = (bb: number) => pl.l + (Math.log10(bb) / 4) * (pl.r - pl.l);
      const Y = (v: number) => pl.b - (v / top) * (pl.b - pl.t);
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let e = 0; e <= 4; e++) {
        ctx.beginPath();
        ctx.moveTo(X(10 ** e) + 0.5, pl.t);
        ctx.lineTo(X(10 ** e) + 0.5, pl.b);
        ctx.stroke();
        ctx.fillText(e === 0 ? '1' : `10${'⁰¹²³⁴'[e]}`, X(10 ** e), pl.b + 6);
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) {
        const v = (top * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pl.l, Y(v) + 0.5);
        ctx.lineTo(pl.r, Y(v) + 0.5);
        ctx.stroke();
        ctx.fillText(v >= 10 ? v.toFixed(0) : v.toFixed(1), pl.l - 5, Y(v));
      }
      if (isFinite(lim)) {
        ctx.strokeStyle = P.good;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(pl.l, Y(lim));
        ctx.lineTo(pl.r, Y(lim));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = P.good;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.font = `600 11px ${P.fontBody}`;
        ctx.fillText(`극한 ${fmt(lim, 3)}`, pl.l + 4, Y(lim) - 3);
      }
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const bb = 10 ** ((4 * i) / 200);
        const yy = Y(Math.min(top, improperUpTo(p, bb)));
        i ? ctx.lineTo(X(bb), yy) : ctx.moveTo(X(bb), yy);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(X(b), Y(Math.min(top, area)), 5, 0, Math.PI * 2);
      ctx.fillStyle = P.accent;
      ctx.fill();
      ctx.fillStyle = P.ink2;
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('∫₁ᵇ 넓이 (b는 로그 눈금)', pl.r, pl.b - 4);
    },
    [P, p, b, area, lim],
    { height: 300, minHeight: 240 },
  );
  return (
    <>
      <div className="controls row">
        <Slider id="tq-imp-p" label="지수 p" value={p} min={0.5} max={3} step={0.1} onChange={setP} format={(v) => v.toFixed(1)} />
        <Slider id="tq-imp-b" label="위 끝 b" value={lb} min={0} max={4} step={0.05} onChange={setLb} format={(v) => fmt(10 ** v, v < 1 ? 2 : 0)} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`y = 1/x^${fmt(p, 1)}의 1부터 ${fmt(b, 0)}까지 넓이는 ${fmt(area, 3)}입니다. ${isFinite(lim) ? `b가 커지면 ${fmt(lim, 3)}에 다가갑니다.` : 'b가 커지면 넓이도 한없이 커집니다.'}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <Readout label={`1부터 ${fmt(b, b < 10 ? 2 : 0)}까지 넓이`} value={fmt(area, 3)} />
        <Readout label="b → ∞" value={isFinite(lim) ? `${fmt(lim, 3)} (수렴)` : '∞ (발산)'} color={isFinite(lim) ? 'var(--good)' : 'var(--bad)'} />
      </div>
    </>
  );
}

function SliceFigure() {
  const [mode, setMode] = useState<SliceMode>('volume');
  return (
    <Figure
      no={4}
      title="잘게 썰어 재기"
      hint="재는 대상을 고르고 조각 수를 바꿔 보세요"
      caption={
        <>
          <strong>회전체의 부피</strong>는 곡선을 x축 둘레로 돌린 입체를 얇은 원판으로 썬 것입니다. 원판 하나의 부피는 <M>{'\\pi r^2\\,\\Delta x'}</M>이고, 반지름은 그 조각 가운데의 함수값입니다. <strong>곡선의 길이</strong>는 곡선 위의 점들을 꺾은선으로 이어 잰 것입니다. <strong>끝없는 넓이</strong>는 <M>{'\\int_1^b x^{-p}\\,dx'}</M>를 b를 키워 가며 잰 것으로, 오른쪽 그래프의 가로축은 1, 10, 100, …이 같은 간격인 로그 눈금입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={mode} onChange={setMode} options={[{ value: 'volume', label: '회전체의 부피' }, { value: 'length', label: '곡선의 길이' }, { value: 'improper', label: '끝없는 넓이' }]} />
      </div>
      {mode === 'volume' ? <VolumeView /> : mode === 'length' ? <LengthView /> : <ImproperView />}
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Techniques() {
  return (
    <>
      <h2>적분은 거꾸로 찾는 일</h2>
      <p>
        <a href={lessonHref('math-calculus', 'derivatives')}>미분</a>은 규칙만 따라가면 어떤 식이든 끝까지 계산됩니다. 곱이면 곱의 법칙, 합성이면 연쇄 법칙을 쓰면 됩니다. 적분은 사정이 다릅니다. <a href={lessonHref('math-calculus', 'integrals')}>미적분의 기본 정리</a> 덕분에 정적분은 원시함수만 찾으면 계산되지만, 원시함수를 찾는 일은 "미분해서 이 식이 나오는 함수가 무엇인가"를 거꾸로 맞히는 일입니다. 정해진 순서가 없고, 맞힌 답이 맞는지는 미분해서 확인합니다.
      </p>
      <p>
        그래서 적분의 기법은 대부분 미분 규칙을 거꾸로 읽은 것입니다. 연쇄 법칙을 거꾸로 읽으면 <T en="substitution">치환적분</T>이 되고, 곱의 법칙을 거꾸로 읽으면 <T en="integration by parts">부분적분</T>이 됩니다. 이 장에서는 두 기법이 그림으로 무엇을 하는지 보고, 적분으로 부피, 길이, 끝없이 이어지는 넓이를 재 봅니다.
      </p>

      <h2>치환적분: 연쇄 법칙을 거꾸로</h2>
      <p>
        연쇄 법칙은 <M>{'\\frac{d}{dx}F(g(x)) = F\'(g(x))\\,g\'(x)'}</M>였습니다. 양변을 적분하면, 피적분 함수가 "바깥 함수의 도함수 × 안쪽 함수의 도함수" 꼴일 때 안쪽을 새 변수 u로 바꿔 적분할 수 있습니다.
      </p>
      <MB note="u = g(x)로 두면 du = g′(x) dx이고, 적분 구간도 u의 값으로 바뀝니다.">{'\\int_a^b f(g(x))\\,g\'(x)\\,dx = \\int_{g(a)}^{g(b)} f(u)\\,du'}</MB>
      <p>
        예를 들어 <M>{'\\int_0^a 2x\\cos(x^2)\\,dx'}</M>에서 안쪽 <M>{'x^2'}</M>을 u로 두면 바깥에 곱해진 2x가 정확히 <M>{'du/dx'}</M>입니다. 적분은 <M>{'\\int_0^{a^2}\\cos u\\,du = \\sin(a^2)'}</M>이 됩니다. 기호를 바꾼 것 같지만 그림으로 보면 x축을 늘이는 일입니다.
      </p>
      <SubstitutionFigure />
      <p>
        a = 1.5로 두면 두 그림의 넓이가 모두 0.7781로, <M>{'\\sin(2.25)'}</M>와 같습니다. x축에서 너비가 0.25로 같던 여섯 조각이 u축에서는 0.063, 0.188, 0.313, …으로 점점 넓어집니다. <M>{'du = 2x\\,dx'}</M>가 바로 이 늘어나는 비율이고, 그만큼 위 그림에서는 높이에 2x가 곱해져 있었습니다. 넓이는 조각마다 그대로 옮겨 갑니다. 마지막 조각은 u가 π/2를 지나 cos u가 음수가 되는 구간이라 넓이가 −0.2219로 음수입니다.
      </p>
      <Callout kind="intuition">
        치환은 눈금이 고르지 않은 자로 다시 재는 것과 같습니다. 눈금 사이가 넓어지는 곳에서는 높이를 그만큼 낮춰 적으면, 전체 넓이는 어느 자로 재도 같습니다. 이 "늘어나는 비율"을 여러 변수로 넓힌 것이 <a href={lessonHref('math-multivariable', 'chain-rule-jacobian')}>야코비 행렬식</a>입니다.
      </Callout>

      <h2>부분적분: 곱의 법칙을 거꾸로</h2>
      <p>
        곱의 법칙 <M>{'(uv)\' = u\'v + uv\''}</M>를 적분하면 <M>{'uv = \\int v\\,du + \\int u\\,dv'}</M>입니다. 한쪽을 넘기면 부분적분 공식이 됩니다.
      </p>
      <MB note="구하기 어려운 ∫u dv를, 구하기 쉬운 ∫v du와 바꿉니다.">{'\\int u\\,dv = uv - \\int v\\,du'}</MB>
      <p>
        이 식도 넓이로 볼 수 있습니다. 매개변수 x를 따라 점 (u, v)가 움직이며 곡선을 그리면, 곡선 아래쪽 넓이와 왼쪽 넓이를 합친 것이 직사각형 하나가 됩니다.
      </p>
      <PartsFigure />
      <p>
        <M>{'\\int_0^{1.5} x e^x\\,dx'}</M>에서는 미분하면 단순해지는 x를 u로, 적분하기 쉬운 <M>{'e^x\\,dx'}</M>를 dv로 둡니다. 직사각형은 <M>{'1.5\\,e^{1.5} = 6.7225'}</M>이고, 쉬운 쪽 넓이는 <M>{'\\int_0^{1.5} e^x\\,dx = e^{1.5} - 1 = 3.4817'}</M>이므로 구하려는 값은 그 차인 3.2408입니다. <M>{'\\int_1^3 \\ln x\\,dx'}</M>는 곱이 없어 보이지만 dv = dx로 두면 됩니다. 직사각형 <M>{'3\\ln 3 = 3.2958'}</M>에서 <M>{'\\int v\\,du = 3 - 1 = 2'}</M>를 빼면 1.2958입니다.
      </p>
      <p>
        무엇을 u로 고를지는 정답이 없지만, 흔히 쓰는 기준은 미분하면 단순해지는 쪽을 u로 두는 것입니다. 로그, 역삼각 함수, 다항식, 삼각 함수, 지수 함수 순으로 앞쪽에 있는 것을 u로 고르면 대개 맞습니다.
      </p>

      <h2>세 적분을 한 줄씩</h2>
      <p>그림 3은 치환 한 번, 부분적분 한 번, 그리고 부분적분을 두 번 한 뒤 방정식으로 푸는 예입니다. 줄마다 왜 그렇게 하는지 적어 두었습니다.</p>
      <WorkedFigure />
      <p>
        세 예의 [0, 1] 정적분은 0.609476, 0.381773, 0.909331입니다. 원시함수로 구한 값과 넓이를 직접 더한 값이 소수 여섯째 자리까지 같습니다. 세 번째 예는 적분을 끝까지 계산하지 않고, 같은 적분이 다시 나타나는 것을 이용해 방정식으로 풀었습니다. 원시함수를 찾았다고 생각하면 언제나 미분해서 확인하는 습관이 가장 확실한 검산입니다.
      </p>
      <Callout kind="warn">
        모든 함수에 공식으로 쓸 수 있는 원시함수가 있는 것은 아닙니다. <M>{'e^{-x^2}'}</M>이나 <M>{'\\frac{\\sin x}{x}'}</M>의 원시함수는 지수, 로그, 삼각 함수를 유한 번 조합해서는 쓸 수 없다는 것이 증명되어 있습니다. 이런 적분은 그림 3의 검산처럼 넓이를 잘게 쪼개 수치로 계산합니다. 통계에서 정규분포의 확률을 표나 프로그램으로 찾는 이유가 이것입니다.
      </Callout>

      <h2>잘게 썰어 재기</h2>
      <p>
        적분의 쓸모는 넓이에서 끝나지 않습니다. "잘게 썰고, 조각 하나를 근사하고, 다 더한 뒤, 조각을 한없이 얇게" 하는 같은 방법으로 부피와 길이도 잽니다. 곡선 <M>{'y = f(x)'}</M>를 x축 둘레로 돌린 입체는 두께 dx인 원판들로 썰 수 있고, 곡선의 짧은 조각은 피타고라스 정리로 길이를 잴 수 있습니다.
      </p>
      <MB note="원판 하나의 부피 πr²·dx와 짧은 조각의 길이 √(dx² + dy²)를 더한 것입니다.">{'V = \\pi\\int_a^b f(x)^2\\,dx,\\qquad L = \\int_a^b \\sqrt{1 + f\'(x)^2}\\,dx'}</MB>
      <SliceFigure />
      <p>
        반지름 1인 반원을 돌리면 구가 됩니다. 원판 8개로 썬 부피는 4.2215, 64개로는 4.1893이고, 적분으로 구한 정확한 값은 <M>{'\\tfrac43\\pi = 4.1888'}</M>입니다. 학교에서 외운 구의 부피 공식이 이 적분입니다. 원뿔을 고르면 <M>{'\\tfrac23\\pi'}</M>가 나오는데, 반지름 1, 높이 2인 원뿔이므로 <M>{'\\tfrac13\\pi r^2 h'}</M>와 같습니다.
      </p>
      <p>
        곡선의 길이에서 사분원을 고르면, 마디 4개인 꺾은선은 1.55225, 64개는 1.57051로 <M>{'\\pi/2 = 1.570796'}</M>에 다가갑니다. 두 배 하면 반원의 길이, 곧 π입니다. 기원전 3세기에 아르키메데스가 원에 정다각형을 넣어 π를 어림한 방법이 바로 이 꺾은선입니다. 사인 곡선 한 마루의 길이 3.820198은 반대로 초등 함수로 쓸 수 없는 적분이라 수치로만 구할 수 있습니다.
      </p>

      <h2>끝이 없는 넓이: 이상적분</h2>
      <p>
        구간이 무한히 길거나 함수값이 무한히 커지는 곳에서는 넓이를 바로 정의할 수 없습니다. 이럴 때는 유한한 구간에서 적분한 뒤 끝을 한없이 보내는 극한으로 정의하고, 이것을 <T en="improper integral">이상적분</T>이라고 합니다. 극한이 있으면 수렴한다고, 없으면 발산한다고 합니다.
      </p>
      <MB>{'\\int_1^{\\infty} \\frac{dx}{x^p} = \\lim_{b\\to\\infty}\\int_1^{b} \\frac{dx}{x^p} = \\begin{cases} \\dfrac{1}{p-1} & p > 1 \\\\[4pt] \\infty & p \\le 1 \\end{cases}'}</MB>
      <p>
        그림 4의 <strong>끝없는 넓이</strong>를 고르면 처음에는 p = 1, 곧 <M>{'1/x'}</M>입니다. 넓이는 <M>{'\\ln b'}</M>라서 b = 100까지 4.605, 10,000까지 9.210으로 느리지만 끝없이 커집니다. p를 2로 올리면 b = 100에서 이미 0.990이고 극한은 1입니다. 두 곡선은 눈으로는 거의 구별되지 않을 만큼 비슷하게 0으로 내려가는데, 얼마나 빨리 내려가느냐가 넓이가 유한한지를 가릅니다. p가 1보다 조금만 커도 수렴하고, 1이면 발산합니다.
      </p>
      <Callout kind="note">
        부피에서 고른 <strong>나팔</strong>은 <M>{'y = 1/x'}</M>를 돌린 것입니다. 끝을 6에서 무한히 보내면 부피는 <M>{'\\pi\\int_1^\\infty x^{-2}\\,dx = \\pi'}</M>로 유한하지만, 겉넓이는 <M>{'2\\pi\\int_1^\\infty \\frac{1}{x}\\sqrt{1 + x^{-4}}\\,dx \\ge 2\\pi\\int_1^\\infty \\frac{dx}{x} = \\infty'}</M>로 무한합니다. 유한한 양의 페인트로 안을 채울 수는 있어도 겉을 칠할 수는 없는 이 나팔을 가브리엘의 나팔이라고 부릅니다.
      </Callout>
      <p>
        이상적분이 가장 자주 쓰이는 곳은 확률입니다. 연속 확률변수의 확률은 <a href={lessonHref('math-probability', 'distributions')}>확률 밀도 함수</a> 아래의 넓이이고, 전체 넓이는 −∞부터 ∞까지의 이상적분으로 1이어야 합니다. 표준정규분포의 밀도 <M>{'\\frac{1}{\\sqrt{2\\pi}}e^{-x^2/2}'}</M>에서 <M>{'\\sqrt{2\\pi}'}</M>는 바로 <M>{'\\int_{-\\infty}^{\\infty} e^{-x^2/2}\\,dx = \\sqrt{2\\pi} \\approx 2.5066'}</M>이라서 붙은 것입니다. 원시함수가 없는 이 적분을 정확히 계산하는 방법은 <a href={lessonHref('math-multivariable', 'multiple-integrals')}>다중 적분</a>에서 극좌표로 바꿔 보여 줍니다. −1부터 1까지의 넓이는 수치로 0.6827, −2부터 2까지는 0.9545입니다.
      </p>

      <Callout kind="key">
        치환적분은 연쇄 법칙을, 부분적분은 곱의 법칙을 거꾸로 쓴 것입니다. 치환은 축을 늘이는 비율 du = g′(x) dx로 넓이를 옮기고, 부분적분은 ∫u dv와 ∫v du가 합쳐 직사각형 uv가 된다는 사실로 어려운 적분을 쉬운 적분과 바꿉니다. 부피와 길이도 잘게 썰어 더한 극한으로 적분이 되고, 끝이 없는 구간의 넓이는 유한 구간 적분의 극한인 이상적분으로 정의합니다. ∫₁^∞ x^(−p) dx는 p &gt; 1일 때만 수렴합니다.
      </Callout>
      <Quiz
        q="다음 이상적분 중 값이 유한한 것은?"
        options={[<M key="a">{'\\int_1^\\infty \\frac{dx}{\\sqrt{x}}'}</M>, <M key="b">{'\\int_1^\\infty \\frac{dx}{x}'}</M>, <M key="c">{'\\int_1^\\infty \\frac{dx}{x^{1.1}}'}</M>, <M key="d">{'\\int_1^\\infty \\frac{dx}{x^{0.9}}'}</M>]}
        answer={2}
        explain={<>p &gt; 1일 때만 수렴하고 값은 1/(p − 1)입니다. p = 1.1이면 1/0.1 = 10입니다. 1/x(p = 1)는 넓이가 ln b로 끝없이 커지고, p = 0.5나 0.9처럼 더 천천히 줄어드는 함수는 말할 것도 없습니다. 그림 4에서 p를 1.1로 두고 b를 끝까지 올려 보면, 10,000에서도 6.0으로 아직 10에 한참 못 미칠 만큼 천천히 다가갑니다.</>}
      />
    </>
  );
}
