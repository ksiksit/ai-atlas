import { useMemo, useState } from 'react';
import { Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { FUNCS, RULES, RULE_KO, accumulate, distance, errorCurve, errorOrder, exact, pieces, riemann, signedAreas, velocity, type Rule } from './riemann';
import './calculus.css';
import './integrals.css';

const nf = (v: number, d = 4) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');
const ruleColor = (P: Palette, r: Rule) => ({ left: P.neg, right: P.pos, mid: P.good, trap: P.dl })[r];
const RULE_CSS: Record<Rule, string> = { left: 'var(--neg)', right: 'var(--pos)', mid: 'var(--good)', trap: 'var(--c-dl)' };

/* ─────────────── Figure 1: Riemann sums ─────────────── */

function RiemannFigure() {
  const P = usePalette();
  const [fi, setFi] = useState(0);
  const [rule, setRule] = useState<Rule>('left');
  const [n, setN] = useState(8);
  const fn = FUNCS[fi];
  const ps = useMemo(() => pieces(fn.f, fn.a, fn.b, n, rule), [fn, n, rule]);
  const sum = useMemo(() => riemann(fn.f, fn.a, fn.b, n, rule), [fn, n, rule]);
  const ex = exact(fn);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const span = fn.b - fn.a;
      const pl = new Plot(ctx, w, h, P, { xMin: fn.a - span * 0.06, xMax: fn.b + span * 0.06, yMin: -fn.yMax * 0.06, yMax: fn.yMax, pad: { l: 34, r: 12, t: 12, b: 24 } });
      pl.grid({ xStep: fn.id === 'sin' ? Math.PI / 4 : undefined, fmt: fn.id === 'sin' ? (v) => ['0', 'π/4', 'π/2', '3π/4', 'π'][Math.round(v / (Math.PI / 4))] ?? '' : undefined });
      const col = ruleColor(P, rule);
      for (const p of ps) {
        ctx.beginPath();
        ctx.moveTo(pl.X(p.x0), pl.Y(0));
        ctx.lineTo(pl.X(p.x0), pl.Y(p.h0));
        ctx.lineTo(pl.X(p.x1), pl.Y(p.h1));
        ctx.lineTo(pl.X(p.x1), pl.Y(0));
        ctx.closePath();
        ctx.fillStyle = alpha(col, 0.22);
        ctx.fill();
        ctx.strokeStyle = alpha(col, 0.9);
        ctx.lineWidth = n > 40 ? 0.6 : 1.2;
        ctx.stroke();
        if (rule !== 'trap' && n <= 24) {
          const sx = rule === 'left' ? p.x0 : rule === 'right' ? p.x1 : (p.x0 + p.x1) / 2;
          pl.dot(sx, p.h0, 3, col);
        }
      }
      pl.fn(fn.f, P.accent, 2.5, { from: fn.a - span * 0.06, to: fn.b + span * 0.06 });
    },
    [P, fn, ps, rule, n],
    { aspect: 1.7, maxHeight: 340, minHeight: 40 },
  );

  return (
    <Figure
      no={1}
      title="직사각형으로 넓이 재기"
      hint="조각 수 n을 늘리고 높이를 정하는 방법을 바꿔 보세요"
      caption={<>구간을 n개로 똑같이 나누고, 조각마다 높이를 정해 직사각형 넓이를 더한 것이 <T en="Riemann sum">리만 합</T>입니다. 높이를 조각의 왼쪽 끝, 오른쪽 끝, 가운데에서 재거나, 위를 비스듬히 이어 사다리꼴로 만들 수 있습니다. 점은 높이를 잰 곳입니다.</>}
    >
      <div className="controls row">
        <Seg label="함수" value={fi} onChange={setFi} options={FUNCS.map((f, i) => ({ value: i, label: f.label }))} />
        <Seg label="높이" value={rule} onChange={setRule} options={RULES.map((r) => ({ value: r, label: RULE_KO[r] }))} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${fn.label}를 ${nf(fn.a, 2)}부터 ${fn.id === 'sin' ? 'π' : nf(fn.b, 2)}까지 ${n}개의 ${RULE_KO[rule]} ${rule === 'trap' ? '사다리꼴' : '직사각형'}으로 나눈 합은 ${nf(sum)}이고 정확한 넓이는 ${nf(ex)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider label="조각 수 n" value={n} min={1} max={64} step={1} onChange={setN} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label={`${RULE_KO[rule]} 합`} value={nf(sum)} color={RULE_CSS[rule]} />
            <Readout label={<>정확한 값 <M>{`\\int_{${fn.a}}^{${fn.id === 'sin' ? '\\pi' : fn.b}} ${fn.tex}\\,dx`}</M></>} value={nf(ex)} />
            <Readout label="오차" value={nf(sum - ex)} color={Math.abs(sum - ex) < 0.01 ? 'var(--good)' : undefined} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: how fast the error shrinks ─────────────── */

function ErrorFigure() {
  const P = usePalette();
  const [fi, setFi] = useState(0);
  const fn = FUNCS[fi];
  const curves = useMemo(() => RULES.map((r) => [r, errorCurve(fn, r)] as [Rule, [number, number][]]), [fn]);
  const orders = curves.map(([r, c]) => [r, errorOrder(c)] as [Rule, number]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const lo = -9, hi = 1; // log10 error range
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: Math.log10(1024), yMin: lo, yMax: hi, pad: { l: 52, r: 12, t: 12, b: 34 } });
      // grid by hand: powers of ten
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      for (let e = lo; e <= hi; e += 2) {
        const y = Math.round(pl.Y(e)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(pl.pad.l, y);
        ctx.lineTo(pl.pad.l + pl.pw, y);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('10' + String(e).split('').map((ch) => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(ch)]).join(''), pl.pad.l - 6, y);
      }
      for (const n of [1, 4, 16, 64, 256, 1024]) {
        const x = Math.round(pl.X(Math.log10(n))) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, pl.pad.t);
        ctx.lineTo(x, pl.pad.t + pl.ph);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(String(n), x, pl.pad.t + pl.ph + 5);
      }
      ctx.textAlign = 'right';
      ctx.fillText('조각 수 n', pl.pad.l + pl.pw, pl.pad.t + pl.ph + 19);
      pl.clip();
      for (const [r, c] of curves) {
        const col = ruleColor(P, r);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        c.forEach(([n, e], i) => {
          const X = pl.X(Math.log10(n)), Y = pl.Y(Math.log10(Math.max(e, 1e-16)));
          if (i) ctx.lineTo(X, Y);
          else ctx.moveTo(X, Y);
        });
        ctx.stroke();
        for (const [n, e] of c) pl.dot(Math.log10(n), Math.log10(Math.max(e, 1e-16)), 2.5, col);
      }
      pl.unclip();
    },
    [P, curves],
    { aspect: 1.6, maxHeight: 340, minHeight: 40 },
  );

  return (
    <Figure
      no={2}
      title="조각을 두 배로 늘리면 오차는 몇 분의 일로"
      hint="함수를 바꿔 보세요. 기울기는 그대로입니다"
      caption={<>가로축은 조각 수, 세로축은 오차의 크기이고 두 축 모두 로그 눈금입니다. 이런 그래프에서 <M>{'\\text{오차} \\approx C/n^p'}</M>는 기울기가 <M>{'-p'}</M>인 직선이 됩니다. 오른쪽 표의 차수는 n = 512와 1024 사이의 기울기입니다.</>}
    >
      <div className="controls row">
        <Seg label="함수" value={fi} onChange={setFi} options={FUNCS.map((f, i) => ({ value: i, label: f.label }))} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${fn.label}의 적분에서 조각 수에 따른 오차. ${orders.map(([r, o]) => `${RULE_KO[r]} 기울기 ${nf(o, 2)}`).join(', ')}.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="tbl-wrap" style={{ margin: 0 }}>
            <table className="tbl ig-err">
              <thead>
                <tr>
                  <th>방법</th>
                  <th>n = 8 오차</th>
                  <th>차수</th>
                </tr>
              </thead>
              <tbody>
                {curves.map(([r, c], i) => (
                  <tr key={r}>
                    <td style={{ color: RULE_CSS[r], fontWeight: 600 }}>{RULE_KO[r]}</td>
                    <td className="mono">{c[3][1].toExponential(2)}</td>
                    <td className="mono">{nf(-orders[i][1], 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ca-small" style={{ margin: 0 }}>
            차수 1은 n을 두 배로 하면 오차가 절반, 차수 2는 4분의 1이 된다는 뜻입니다.
          </p>
        </div>
      </div>
      <Legend items={RULES.map((r) => ({ color: RULE_CSS[r], label: RULE_KO[r], shape: 'ln' as const }))} />
    </Figure>
  );
}

/* ─────────────── Figure 3: the accumulation function ─────────────── */

const ACC_FUNCS = [
  { id: 'cos', label: 'cos t', tex: '\\cos t', f: (t: number) => Math.cos(t), yr: [-1.2, 1.2] as [number, number], ar: [-1.2, 1.2] as [number, number] },
  { id: 'lin', label: 't − 1', tex: 't - 1', f: (t: number) => t - 1, yr: [-1.2, 3.2] as [number, number], ar: [-0.8, 7.8] as [number, number] },
  { id: 'gauss', label: 'e^(−t²)', tex: 'e^{-t^2}', f: (t: number) => Math.exp(-t * t), yr: [-0.15, 1.15] as [number, number], ar: [-0.1, 1.05] as [number, number] },
];
const XA = 5;

function AccumulateFigure() {
  const P = usePalette();
  const [fi, setFi] = useState(0);
  const [x, setX] = useState(1.2);
  const [dx, setDx] = useState(0.3);
  const [showDx, setShowDx] = useState(true);
  const g = ACC_FUNCS[fi];
  const A = (t: number) => accumulate(g.f, 0, t);
  // sample A once per function so drawing stays cheap
  const table = useMemo(() => Array.from({ length: 301 }, (_, i) => accumulate(g.f, 0, (i / 300) * XA)), [g]);
  const Ax = A(x);
  const xr = Math.min(XA, x + dx);
  const dA = A(xr) - Ax;
  const parts = useMemo(() => signedAreas(g.f, 0, x), [g, x]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const half = h / 2;
      const pad = { l: 40, r: 12, t: 10, b: 22 };
      // f with the area up to x, split into positive and negative parts
      const top = new Plot(ctx, w, half, P, { xMin: 0, xMax: XA, yMin: g.yr[0], yMax: g.yr[1], pad });
      top.grid({ xStep: 1 });
      top.fillUnder((t) => Math.max(0, g.f(t)), alpha(P.good, 0.28), 0, x);
      top.fillUnder((t) => Math.min(0, g.f(t)), alpha(P.bad, 0.28), 0, x);
      if (showDx && xr > x) {
        ctx.fillStyle = alpha(P.hl, 0.55);
        ctx.fillRect(top.X(x), top.Y(Math.max(0, g.f(x))), top.X(xr) - top.X(x), Math.abs(top.Y(g.f(x)) - top.Y(0)));
      }
      top.fn(g.f, P.accent, 2.5);
      top.line(x, g.yr[0], x, g.yr[1], alpha(P.ink, 0.5), 1, [3, 3]);
      top.dot(x, g.f(x), 5, P.accent, P.surface, 2);
      top.text(`f(t) = ${g.label}`, 0, g.yr[1], P.accent, { dx: 6, dy: 10, font: `600 11px ${P.fontMono}`, bg: P.surface });
      // A(x) with its tangent: slope f(x)
      ctx.save();
      ctx.translate(0, half);
      const bot = new Plot(ctx, w, half, P, { xMin: 0, xMax: XA, yMin: g.ar[0], yMax: g.ar[1], pad });
      bot.grid({ xStep: 1 });
      ctx.strokeStyle = P.dl;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      table.forEach((v, i) => {
        const X = bot.X((i / 300) * XA), Y = bot.Y(v);
        if (i) ctx.lineTo(X, Y);
        else ctx.moveTo(X, Y);
      });
      ctx.stroke();
      bot.ctx.save();
      bot.line(x - 0.7, Ax - 0.7 * g.f(x), x + 0.7, Ax + 0.7 * g.f(x), P.accent, 2);
      bot.ctx.restore();
      if (showDx && xr > x) {
        bot.line(x, Ax, xr, Ax, alpha(P.ink3, 0.8), 1, [3, 3]);
        bot.line(xr, Ax, xr, Ax + dA, P.hl, 3);
      }
      bot.line(x, g.ar[0], x, g.ar[1], alpha(P.ink, 0.5), 1, [3, 3]);
      bot.dot(x, Ax, 5, P.dl, P.surface, 2);
      bot.text('A(x)', 0, g.ar[1], P.dl, { dx: 6, dy: 10, font: `600 11px ${P.fontMono}`, bg: P.surface });
      ctx.restore();
    },
    [P, g, x, xr, dA, Ax, table, showDx],
    { height: 420, minHeight: 40 },
  );

  return (
    <Figure
      no={3}
      title="넓이가 쌓이는 속도는 곡선의 높이"
      hint="x를 움직이며 아래 그래프의 기울기와 위 곡선의 높이를 비교해 보세요"
      caption={<>위는 <M>{`f(t) = ${g.tex}`}</M>이고, 0부터 x까지의 넓이를 칠했습니다. 초록은 더해지는 넓이, 붉은색은 빼지는 넓이입니다. 아래는 그 넓이 <M>{'A(x) = \\int_0^x f(t)\\,dt'}</M>를 x마다 찍은 그래프이고, 파란 선은 x에서의 접선입니다. 노란 띠는 x를 Δx만큼 옮길 때 새로 더해지는 넓이로, 아래 그래프에서 노란 막대만큼 A를 올립니다.</>}
    >
      <div className="controls row">
        <Seg label="f(t)" value={fi} onChange={setFi} options={ACC_FUNCS.map((a, i) => ({ value: i, label: a.label }))} />
        <Check label="Δx 띠 보기" checked={showDx} onChange={setShowDx} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`f(t) = ${g.label}. x = ${nf(x, 2)}에서 A(x) = ${nf(Ax)}, f(x) = ${nf(g.f(x))}. Δx = ${nf(dx, 2)}일 때 ΔA/Δx = ${nf(dA / Math.max(1e-9, xr - x))}.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider label="x" value={x} min={0} max={XA - 0.05} step={0.05} onChange={setX} format={(v) => nf(v, 2)} />
          <Slider label="Δx" value={dx} min={0.01} max={1} step={0.01} onChange={setDx} format={(v) => nf(v, 2)} color="var(--hl)" />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="A(x)" value={nf(Ax)} color="var(--c-dl)" />
            <Readout label="f(x)" value={nf(g.f(x))} color="var(--accent)" />
            <Readout label="ΔA / Δx" value={nf(dA / Math.max(1e-9, xr - x))} color="var(--hl)" />
            <Readout label="더한 넓이" value={nf(parts.pos, 3)} color="var(--good)" />
            <Readout label="뺀 넓이" value={nf(-parts.neg, 3)} color="var(--bad)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: distance from a velocity graph ─────────────── */

function TripFigure() {
  const P = usePalette();
  const [t, setT] = useState(25);
  const d = distance(t);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const roadH = 54;
      const pl = new Plot(ctx, w, h - roadH, P, { xMin: 0, xMax: 44, yMin: 0, yMax: 24, pad: { l: 40, r: 12, t: 12, b: 26 } });
      pl.grid({ xStep: 10, yStep: 5 });
      pl.fillUnder(velocity, alpha(P.accent, 0.22), 0, t);
      pl.fn(velocity, P.accent, 2.5, { samples: 440 });
      pl.line(t, 0, t, 24, alpha(P.ink, 0.5), 1, [3, 3]);
      pl.dot(t, velocity(t), 5, P.accent, P.surface, 2);
      pl.text('속도 (m/s)', 0, 24, P.ink3, { dx: 4, dy: 8, font: `500 11px ${P.fontBody}` });
      pl.text('시간 (초)', 44, 0, P.ink3, { dx: -4, dy: -10, align: 'right', font: `500 11px ${P.fontBody}` });
      // the road
      const y0 = h - roadH + 14;
      const rx0 = 40, rx1 = w - 12;
      const R = (m: number) => rx0 + (m / 600) * (rx1 - rx0);
      ctx.fillStyle = P.surface2;
      ctx.fillRect(rx0, y0, rx1 - rx0, 18);
      ctx.fillStyle = alpha(P.accent, 0.35);
      ctx.fillRect(rx0, y0, R(d) - rx0, 18);
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textBaseline = 'top';
      for (const m of [0, 100, 200, 300, 400, 500, 600]) {
        ctx.textAlign = m === 0 ? 'left' : m === 600 ? 'right' : 'center';
        ctx.fillText(`${m}m`, R(m), y0 + 22);
      }
      ctx.fillStyle = P.dl;
      ctx.beginPath();
      ctx.arc(R(d), y0 + 9, 7, 0, Math.PI * 2);
      ctx.fill();
    },
    [P, t, d],
    { aspect: 1.9, maxHeight: 330, minHeight: 40 },
  );

  return (
    <Figure
      no={4}
      title="속도 그래프 아래 넓이는 간 거리"
      hint="시간을 움직여 칠해진 넓이와 아래 길 위의 위치를 비교해 보세요"
      caption={<>자동차가 10초 동안 초속 20m까지 고르게 빨라진 뒤 20초 동안 그 속도로 달리고, 마지막 10초 동안 고르게 멈춥니다. 위 그래프의 칠해진 넓이(초속 × 초 = m)가 아래 길 위에서 간 거리입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`출발 후 ${nf(t, 1)}초, 속도는 초속 ${nf(velocity(t), 1)}m이고 지금까지 ${nf(d, 1)}m를 갔습니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider label="시간 t (초)" value={t} min={0} max={44} step={0.5} onChange={setT} format={(v) => nf(v, 1)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="속도 v(t)" value={`${nf(velocity(t), 1)} m/s`} color="var(--accent)" />
            <Readout label="간 거리 ∫v dt" value={`${nf(d, 1)} m`} color="var(--c-dl)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

const TABLE: [string, string][] = [
  ['x^n \\; (n \\ne -1)', '\\dfrac{x^{n+1}}{n+1}'],
  ['\\dfrac{1}{x}', '\\ln|x|'],
  ['e^x', 'e^x'],
  ['\\sin x', '-\\cos x'],
  ['\\cos x', '\\sin x'],
  ['\\dfrac{1}{1+x^2}', '\\arctan x'],
];

export default function Integrals() {
  return (
    <>
      <h2>잘게 쪼개 더하기</h2>
      <p>
        직사각형의 넓이는 가로 × 세로이고, 삼각형과 원의 넓이도 공식이 있습니다. 하지만 <M>{'y = x^2'}</M> 아래, 0부터 2까지의 넓이는 어떻게 잴까요? 고대 그리스의 아르키메데스가 포물선 아래 넓이를 구할 때 쓴 생각은 지금도 그대로입니다. 넓이를 모르는 모양을 넓이를 아는 조각으로 잘게 쪼개 더하고, 조각을 점점 가늘게 합니다.
      </p>
      <RiemannFigure />
      <p>
        처음 설정(<M>{'x^2'}</M>, 0부터 2, 8조각)에서 왼쪽 끝 합은 2.1875, 오른쪽 끝 합은 3.1875입니다. <M>{'x^2'}</M>은 오른쪽으로 갈수록 커지므로 왼쪽 끝 높이는 늘 모자라고 오른쪽 끝 높이는 늘 넘칩니다. 가운데 합은 2.65625, 사다리꼴 합은 2.6875로 진짜 넓이 <M>{'8/3 \\approx 2.6667'}</M>에 훨씬 가깝습니다. 어떤 방법이든 n을 키우면 같은 값으로 다가갑니다. 그 극한이 <T en="definite integral">정적분</T>입니다.
      </p>
      <MB note="조각의 폭 Δx = (b − a)/n, xᵢ*는 i번째 조각 안에서 높이를 잰 점.">{'\\int_a^b f(x)\\,dx = \\lim_{n\\to\\infty} \\sum_{i=1}^{n} f(x_i^*)\\,\\Delta x'}</MB>
      <p>
        적분 기호 ∫는 합(sum)의 첫 글자 S를 길게 늘인 것이고, <M>{'dx'}</M>는 한없이 가늘어진 조각의 폭입니다. 어느 방법이 더 빨리 다가갈까요?
      </p>
      <ErrorFigure />
      <p>
        왼쪽 끝과 오른쪽 끝 합은 기울기가 −1인 직선입니다. n을 두 배로 늘리면 오차가 절반이 됩니다(<M>{'x^2'}</M>에서 8조각일 때 0.479, 16조각일 때 0.245). 가운데 합과 사다리꼴 합은 기울기가 −2라서 n을 두 배로 하면 오차가 4분의 1이 됩니다. 8조각에서 이미 오차가 0.0104와 0.0208입니다. 높이를 조각 가운데에서 재면 왼쪽에서 모자란 만큼을 오른쪽에서 넘쳐 메우기 때문입니다.
      </p>
      <Callout kind="note">
        가운데 합은 진짜 값보다 0.0104 작고, 사다리꼴 합은 0.0208 큽니다. 오차의 비가 정확히 −1 : 2이므로 <M>{'(2 \\times \\text{가운데} + \\text{사다리꼴})/3'}</M>을 계산하면 오차가 사라져 8/3이 나옵니다. 이렇게 섞은 것이 <T en="Simpson's rule">심프슨 공식</T>이고, 이 장의 그림 3이 넓이를 계산할 때 쓰는 방법입니다. <strong>sin x</strong>를 고르면 왼쪽 끝 합도 기울기가 −2인데, 0과 π에서 함숫값이 0이라 왼쪽 끝 합과 오른쪽 끝 합과 사다리꼴 합이 모두 같아지기 때문입니다.
      </Callout>

      <h2>넓이에 부호가 있다</h2>
      <p>
        곡선이 x축 아래로 내려가면 그 부분의 <M>{'f(x)\\,\\Delta x'}</M>는 음수입니다. 그래서 정적분은 위쪽 넓이에서 아래쪽 넓이를 뺀 <T en="signed area">부호 있는 넓이</T>입니다. 예를 들어 <M>{'\\cos x'}</M>를 0부터 2.5까지 적분하면, 0부터 <M>{'\\pi/2'}</M>까지 위쪽 넓이 1에서 <M>{'\\pi/2'}</M>부터 2.5까지 아래쪽 넓이 0.402를 뺀 0.598입니다. 칠해진 면적을 모두 더하고 싶다면 <M>{'|f(x)|'}</M>를 적분해야 하고, 그 값은 1.402입니다. 그림 3에서 x를 2.5로 옮겨 확인할 수 있습니다.
      </p>

      <h2>미적분의 기본 정리</h2>
      <p>
        이제 아래 끝은 0으로 고정하고 위 끝 x를 움직여 봅시다. x마다 넓이가 하나씩 정해지므로 넓이는 x의 함수가 됩니다. 이것을 <T en="accumulation function">누적 함수</T> <M>{'A(x) = \\int_0^x f(t)\\,dt'}</M>라고 부릅시다. 그림 3의 위는 <M>{'f'}</M>와 칠해진 넓이, 아래는 그 넓이를 그래프로 그린 <M>{'A'}</M>입니다.
      </p>
      <AccumulateFigure />
      <p>
        x를 조금 오른쪽(Δx)으로 옮기면 넓이는 노란 띠만큼 늘어납니다. 띠가 가늘면 그 넓이는 높이 <M>{'f(x)'}</M> × 폭 Δx인 직사각형과 거의 같습니다. 그러니 넓이가 늘어나는 비율 <M>{'\\Delta A / \\Delta x'}</M>는 Δx를 줄일수록 <M>{'f(x)'}</M>에 다가갑니다. 처음 설정(<M>{'\\cos t'}</M>, <M>{'x = 1.2'}</M>)에서 <M>{'f(1.2) = 0.3624'}</M>이고, <M>{'\\Delta A / \\Delta x'}</M>는 Δx가 0.3일 때 0.2182, 0.1일 때 0.3152, 0.01일 때 0.3577로 다가갑니다. 그 극한이 바로 <M>{"A'(x)"}</M>입니다.
      </p>
      <MB note="f가 연속일 때. 넓이 함수를 미분하면 원래 함수로 돌아옵니다.">{"\\frac{d}{dx}\\int_a^x f(t)\\,dt = f(x)"}</MB>
      <p>
        이것이 <T en="fundamental theorem of calculus">미적분의 기본 정리</T>입니다. 그림 아래의 파란 접선 기울기가 위 곡선의 높이와 늘 같습니다. <M>{'f'}</M>가 양수인 곳에서 <M>{'A'}</M>는 올라가고, 음수인 곳에서 내려가며, <M>{'f'}</M>가 0을 지나는 곳에서 <M>{'A'}</M>는 꼭대기나 바닥을 찍습니다. <strong>t − 1</strong>을 고르면 <M>{'A'}</M>는 x = 1에서 가장 낮은 값 −0.5를 찍고, x = 2에서 다시 0으로 돌아옵니다. 빼진 넓이 0.5와 더해진 넓이 0.5가 같아진 것입니다.
      </p>
      <p>
        이 정리 덕분에 넓이를 계산하는 일이 미분을 거꾸로 하는 일로 바뀝니다. 미분해서 <M>{'f'}</M>가 되는 함수 <M>{'F'}</M>, 즉 <T en="antiderivative">원시함수</T>를 하나 찾으면
      </p>
      <MB note="미적분의 기본 정리의 두 번째 꼴. F′ = f인 아무 F나 쓸 수 있습니다.">{'\\int_a^b f(x)\\,dx = F(b) - F(a)'}</MB>
      <p>
        입니다. 예를 들어 <M>{'x^3/3'}</M>을 미분하면 <M>{'x^2'}</M>이므로 <M>{'\\int_0^2 x^2\\,dx = 8/3 - 0 = 8/3'}</M>이고, 이것이 그림 1의 정확한 값입니다. 원시함수에는 상수를 더해도 미분하면 사라지므로, 원시함수 전체는 <M>{'F(x) + C'}</M>로 쓰고 <T en="indefinite integral">부정적분</T>이라고 부릅니다. 자주 쓰는 것을 표로 정리하면 다음과 같습니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl ig-anti">
          <thead>
            <tr>
              <th>f(x)</th>
              <th>원시함수 F(x) (+ C)</th>
            </tr>
          </thead>
          <tbody>
            {TABLE.map(([f, F]) => (
              <tr key={f}>
                <td>
                  <M>{f}</M>
                </td>
                <td>
                  <M>{F}</M>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        표의 오른쪽 열을 미분하면 왼쪽 열이 되는지 확인해 보세요. 그런데 그림 3의 <strong>e^(−t²)</strong>처럼 원시함수를 우리가 아는 함수들로 적을 수 없는 경우도 있습니다. 그래도 넓이는 분명히 있고, <M>{'A(x)'}</M>는 잘 정의된 함수입니다. x를 끝까지 옮기면 넓이는 <M>{'\\sqrt{\\pi}/2 \\approx 0.8862'}</M>에 다가갑니다. 이 함수는 정규 분포의 종 모양 곡선과 같은 꼴이라, 확률 밀도 곡선 아래 넓이가 확률이 되는 <a href={lessonHref('ai-basics', 'probability')}>확률과 분포</a>에서 다시 만납니다. 원시함수를 찾는 기법은 <a href={lessonHref('math-calculus', 'integration-techniques')}>다음 장</a>에서 다룹니다.
      </p>

      <h2>속도를 적분하면 거리</h2>
      <p>
        미적분의 기본 정리를 물리로 읽으면 더 자연스럽습니다. 위치를 미분하면 속도이므로, 거꾸로 속도를 적분하면 위치의 변화, 즉 간 거리입니다. 자동차 속도계 기록만 있어도 얼마나 갔는지 알 수 있습니다.
      </p>
      <TripFigure />
      <p>
        처음 10초는 넓이가 삼각형이므로 <M>{'\\tfrac12 \\times 10 \\times 20 = 100'}</M>m, 다음 20초는 직사각형 <M>{'20 \\times 20 = 400'}</M>m, 마지막 10초는 다시 삼각형 100m라서 모두 600m를 갑니다. 출발 25초 뒤에는 100 + 15 × 20 = 400m 지점에 있습니다. 자동차가 후진해서 속도가 음수가 되면 그 부분의 넓이는 빠지고, 적분은 출발점에서 얼마나 떨어져 있는지(변위)를 줍니다.
      </p>

      <Callout kind="key">
        정적분은 구간을 n개로 쪼갠 리만 합의 극한이며, 곡선이 x축 아래에 있는 부분은 빼는 부호 있는 넓이입니다. 높이를 조각 가운데에서 재거나 사다리꼴을 쓰면 오차가 <M>{'1/n^2'}</M>로, 끝에서 재면 <M>{'1/n'}</M>로 줄어듭니다. 미적분의 기본 정리는 넓이 함수 <M>{'A(x) = \\int_a^x f'}</M>를 미분하면 <M>{'f'}</M>가 된다고 말하고, 그래서 정적분은 원시함수의 차 <M>{'F(b) - F(a)'}</M>로 계산할 수 있습니다.
      </Callout>
      <Quiz
        q="A(x) = ∫₀ˣ f(t) dt 이고, f는 x < 3에서 양수, x > 3에서 음수이다. 옳은 것은?"
        options={['A는 x = 3에서 가장 작다', 'A는 x = 3에서 가장 크다', 'A(3) = 0이다', 'A는 어디서나 증가한다']}
        answer={1}
        explain={<>미적분의 기본 정리에 따라 A′(x) = f(x)입니다. x &lt; 3에서는 A′ &gt; 0이라 A가 올라가고, x &gt; 3에서는 A′ &lt; 0이라 내려가므로 x = 3에서 A가 가장 큽니다. A(3)은 0부터 3까지의 넓이로 양수입니다. 그림 3에서 cos t를 고르고 x를 π/2 근처로 옮기면 같은 모양을 볼 수 있습니다.</>}
      />
    </>
  );
}
