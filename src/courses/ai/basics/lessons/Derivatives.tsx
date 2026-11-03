import { useRef, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useAnimationFrame, useCanvas2D, useDrag, useInView, prefersReducedMotion } from '../../../../lib/canvas';
import { Plot, fmt } from '../../../../lib/plot';
import { usePalette, alpha } from '../../../../lib/theme';

interface Fn {
  id: string;
  label: string;
  tex: string;
  dtex: string;
  f: (x: number) => number;
  df: (x: number) => number;
  x: [number, number];
  y: [number, number];
  dy: [number, number];
}

const FNS: Fn[] = [
  { id: 'sq', label: 'x²', tex: 'f(x) = x^2', dtex: "f'(x) = 2x", f: (x) => x * x, df: (x) => 2 * x, x: [-2.5, 2.5], y: [-1, 6], dy: [-5, 5] },
  { id: 'cubic', label: 'x³ − 3x', tex: 'f(x) = x^3 - 3x', dtex: "f'(x) = 3x^2 - 3", f: (x) => x * x * x - 3 * x, df: (x) => 3 * x * x - 3, x: [-2.4, 2.4], y: [-4, 4], dy: [-4, 8] },
  { id: 'sin', label: 'sin x', tex: 'f(x) = \\sin x', dtex: "f'(x) = \\cos x", f: Math.sin, df: Math.cos, x: [-Math.PI * 1.15, Math.PI * 1.15], y: [-1.6, 1.6], dy: [-1.6, 1.6] },
  { id: 'exp', label: 'eˣ', tex: 'f(x) = e^x', dtex: "f'(x) = e^x", f: Math.exp, df: Math.exp, x: [-2.5, 2], y: [-0.8, 7.5], dy: [-0.8, 7.5] },
];

/* ─────────────── Figure 1: secant → tangent ─────────────── */

function SecantFigure() {
  const P = usePalette();
  const [fid, setFid] = useState('sq');
  const fn = FNS.find((f) => f.id === fid)!;
  const [x0, setX0] = useState(1);
  const [h, setH] = useState(1.2);
  const [anim, setAnim] = useState(false);
  const plotRef = useRef<Plot | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inView = useInView(boxRef);

  const hh = Math.max(0.001, Math.min(h, fn.x[1] - x0 - 0.05));
  const y0 = fn.f(x0);
  const y1 = fn.f(x0 + hh);
  const secant = (y1 - y0) / hh;
  const tangent = fn.df(x0);

  useAnimationFrame(
    (dt) => {
      setH((v) => {
        const n = v * Math.pow(0.25, dt);
        if (n < 0.002) {
          setAnim(false);
          return 0.001;
        }
        return n;
      });
    },
    anim && inView,
  );

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: H }) => {
      const plot = new Plot(ctx, w, H, P, { xMin: fn.x[0], xMax: fn.x[1], yMin: fn.y[0], yMax: fn.y[1], pad: { l: 34, r: 12, t: 12, b: 26 } });
      plotRef.current = plot;
      plot.grid();
      plot.clip();
      plot.fn(fn.f, P.ink, 2.5);
      // tangent (true)
      plot.slopeLine(x0, y0, tangent, alpha(P.good, 0.9), 2, [7, 5]);
      // secant
      plot.slopeLine(x0, y0, secant, P.accent, 2.5);
      // rise / run triangle
      const x1 = x0 + hh;
      plot.line(x0, y0, x1, y0, P.ink3, 1.5);
      plot.line(x1, y0, x1, y1, P.pos, 2);
      if (hh > 0.15) {
        plot.text(`Δx = ${fmt(hh, 2)}`, (x0 + x1) / 2, y0, P.ink2, { dy: y1 >= y0 ? 12 : -12, align: 'center', font: `600 11px ${P.fontMono}`, bg: alpha(P.surface, 0.85) });
        plot.text(`Δy = ${fmt(y1 - y0, 2)}`, x1, (y0 + y1) / 2, P.pos, { dx: 8, font: `600 11px ${P.fontMono}`, bg: alpha(P.surface, 0.85) });
      }
      plot.dot(x1, y1, 5.5, P.accent, P.surface, 1.5);
      plot.dot(x0, y0, 8, P.surface, P.ink, 2.5);
      plot.text('P', x0, y0, P.ink, { dx: -16, dy: -12 });
      plot.unclip();
    },
    [P, fn, x0, hh],
    { aspect: 1.45, maxHeight: 440 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      const p = plotRef.current;
      if (!p) return null;
      return Math.hypot(p.X(x0) - x, p.Y(y0) - y) < 18 ? 'p' : null;
    },
    onDrag: (_id, x) => {
      const p = plotRef.current!;
      setX0(Math.round(Math.max(fn.x[0] + 0.1, Math.min(fn.x[1] - 0.6, p.invX(x))) * 100) / 100);
    },
  });

  const run = () => {
    if (prefersReducedMotion()) {
      setH(0.001);
      return;
    }
    setH(1.5);
    setAnim(true);
  };

  return (
    <Figure no={1} title="할선이 접선이 되는 순간" hint="점 P를 끌거나 Δx를 줄여 보세요" caption={<>파란 직선은 P와 조금 떨어진 점을 잇는 할선, 초록 점선은 P에서의 접선입니다. Δx를 0에 가깝게 줄이면 할선의 기울기가 접선의 기울기, 즉 미분값에 한없이 가까워집니다.</>}>
      <div className="fig-split">
        <div ref={boxRef}>
          <div ref={wrapRef} className="canvas-box">
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Seg
            label="함수"
            value={fid}
            onChange={(v) => {
              setFid(v);
              setX0(1);
            }}
            options={FNS.map((f) => ({ value: f.id, label: f.label }))}
          />
          <Slider id="der-x0" label="점 P의 위치 x" value={x0} min={fn.x[0] + 0.1} max={fn.x[1] - 0.6} step={0.01} onChange={setX0} format={(v) => fmt(v, 2)} />
          <Slider id="der-h" label="간격 Δx" value={h} min={0.001} max={2} step={0.001} onChange={(v) => { setAnim(false); setH(v); }} format={(v) => fmt(v, 3)} color="var(--pos)" />
          <Button primary onClick={run}>
            Δx → 0 으로 줄이기
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="할선 기울기 Δy/Δx" value={fmt(secant, 4)} color="var(--accent)" />
            <Readout label="미분값 f′(x)" value={fmt(tangent, 4)} color="var(--good)" />
          </div>
          <Readout label="둘의 차이" value={fmt(Math.abs(secant - tangent), 4)} />
          <Legend
            items={[
              { color: 'var(--accent)', label: '할선', shape: 'ln' },
              { color: 'var(--good)', label: '접선', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: f and f' together ─────────────── */

function FPrimeFigure() {
  const P = usePalette();
  const [fid, setFid] = useState('cubic');
  const fn = FNS.find((f) => f.id === fid)!;
  const [x, setX] = useState(-0.6);
  const top = useRef<Plot | null>(null);

  const slope = fn.df(x);
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const mid = Math.round(h * 0.56);
      const pTop = new Plot(ctx, w, h, P, { xMin: fn.x[0], xMax: fn.x[1], yMin: fn.y[0], yMax: fn.y[1], pad: { l: 34, r: 12, t: 12, b: h - mid + 22 } });
      const pBot = new Plot(ctx, w, h, P, { xMin: fn.x[0], xMax: fn.x[1], yMin: fn.dy[0], yMax: fn.dy[1], pad: { l: 34, r: 12, t: mid + 8, b: 24 } });
      top.current = pTop;

      // f' sign shading in bottom plot
      pBot.fillUnder((t) => Math.max(0, fn.df(t)), alpha(P.good, 0.18));
      pBot.fillUnder((t) => Math.min(0, fn.df(t)), alpha(P.bad, 0.16));
      pTop.grid({ labels: true });
      pBot.grid({ labels: true });
      pTop.fn(fn.f, P.ink, 2.5);
      pBot.fn(fn.df, P.accent, 2.5);

      // zeros of f' → peaks / valleys
      const N = 400;
      let prev = fn.df(fn.x[0]);
      for (let i = 1; i <= N; i++) {
        const t = fn.x[0] + ((fn.x[1] - fn.x[0]) * i) / N;
        const cur = fn.df(t);
        if (prev * cur < 0) {
          const xz = t - ((fn.x[1] - fn.x[0]) / N) * (cur / (cur - prev));
          pTop.dot(xz, fn.f(xz), 5, P.hl);
          pBot.dot(xz, 0, 5, P.hl);
          pTop.text(prev > 0 ? '꼭대기' : '바닥', xz, fn.f(xz), P.ink2, { dy: prev > 0 ? -14 : 14, align: 'center', font: `600 11px ${P.fontBody}`, bg: alpha(P.surface, 0.85) });
        }
        prev = cur;
      }

      // tangent at x in top plot
      const col = slope > 0.02 ? P.good : slope < -0.02 ? P.bad : P.hl;
      ctx.save();
      ctx.beginPath();
      ctx.rect(pTop.pad.l, pTop.pad.t, pTop.pw, pTop.ph);
      ctx.clip();
      pTop.line(x - 0.7, fn.f(x) - 0.7 * slope, x + 0.7, fn.f(x) + 0.7 * slope, col, 3);
      ctx.restore();

      // vertical cursor across both plots
      ctx.save();
      ctx.strokeStyle = alpha(P.ink3, 0.6);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pTop.X(x), pTop.pad.t);
      ctx.lineTo(pTop.X(x), pBot.pad.t + pBot.ph);
      ctx.stroke();
      ctx.restore();
      pTop.dot(x, fn.f(x), 6.5, P.surface, P.ink, 2.5);
      pBot.dot(x, fn.df(x), 6.5, P.surface, P.accent, 2.5);

      ctx.fillStyle = P.ink2;
      ctx.font = `600 12px ${P.fontMono}`;
      ctx.textAlign = 'left';
      ctx.fillText('f(x)', pTop.pad.l + 8, pTop.pad.t + 14);
      ctx.fillStyle = P.accent;
      ctx.fillText("f′(x) = 기울기", pBot.pad.l + 8, pBot.pad.t + 14);
    },
    [P, fn, x],
    { aspect: 1.25, maxHeight: 520, minHeight: 360 },
  );

  useDrag(canvasRef, {
    hit: () => 'x',
    onDrag: (_id, sx) => {
      const p = top.current;
      if (!p) return;
      setX(Math.round(Math.max(fn.x[0], Math.min(fn.x[1], p.invX(sx))) * 100) / 100);
    },
  });

  const state = Math.abs(slope) < 0.05 ? '평평함 (f′ ≈ 0)' : slope > 0 ? '오르막 (f′ > 0)' : '내리막 (f′ < 0)';
  return (
    <Figure no={2} title="함수와 도함수를 나란히" hint="그래프 위를 좌우로 끌어 보세요" caption={<>위는 원래 함수, 아래는 각 점의 기울기를 모아 그린 도함수입니다. 함수가 오르막인 곳에서 도함수는 0보다 크고(초록), 내리막인 곳에서는 0보다 작습니다(빨강). 꼭대기와 바닥에서는 기울기가 정확히 0이 됩니다.</>}>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="함수" value={fid} onChange={setFid} options={FNS.map((f) => ({ value: f.id, label: f.label }))} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
            <M>{fn.tex}</M>
            <M>{fn.dtex}</M>
          </div>
          <Slider id="fp-x" label="x" value={x} min={fn.x[0]} max={fn.x[1]} step={0.01} onChange={setX} format={(v) => fmt(v, 2)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="f(x)" value={fmt(fn.f(x), 3)} />
            <Readout label="f′(x)" value={fmt(slope, 3)} color="var(--accent)" />
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>
            지금 이곳은 <strong style={{ color: slope > 0.05 ? 'var(--good)' : slope < -0.05 ? 'var(--bad)' : 'var(--hl)' }}>{state}</strong>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: chain rule on three number lines ─────────────── */

const g = (x: number) => x * x; // u = g(x)
const gp = (x: number) => 2 * x;
const f = (u: number) => Math.sin(u); // y = f(u)
const fp = (u: number) => Math.cos(u);

function ChainFigure() {
  const P = usePalette();
  const [x, setX] = useState(1.2);
  const [dx, setDx] = useState(0.15);
  const u0 = g(x);
  const u1 = g(x + dx);
  const y0 = f(u0);
  const y1 = f(u1);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const lo = -1.4;
      const hi = 4.6;
      const L = 56;
      const R = 18;
      const X = (v: number) => L + ((v - lo) / (hi - lo)) * (w - L - R);
      const rows = [h * 0.17, h * 0.5, h * 0.83];
      const names = ['x', 'u', 'y'];
      // number lines
      rows.forEach((ry, i) => {
        ctx.strokeStyle = P.lineStrong;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(L, ry);
        ctx.lineTo(w - R, ry);
        ctx.stroke();
        ctx.fillStyle = P.ink3;
        ctx.font = `10px ${P.fontMono}`;
        ctx.textAlign = 'center';
        for (let k = Math.ceil(lo); k <= hi; k++) {
          ctx.fillRect(X(k) - 0.5, ry - 4, 1, 8);
          ctx.fillText(String(k), X(k), ry + 18);
        }
        ctx.fillStyle = P.ink;
        ctx.font = `700 15px ${P.fontMono}`;
        ctx.textAlign = 'left';
        ctx.fillText(names[i], 14, ry + 5);
      });
      const segs: [number, number, string][] = [
        [x, x + dx, P.neg],
        [u0, u1, P.dl],
        [y0, y1, P.pos],
      ];
      // connecting bands
      for (let i = 0; i < 2; i++) {
        const [a0, a1] = segs[i];
        const [b0, b1] = segs[i + 1];
        ctx.beginPath();
        ctx.moveTo(X(a0), rows[i] + 5);
        ctx.lineTo(X(a1), rows[i] + 5);
        ctx.lineTo(X(b1), rows[i + 1] - 5);
        ctx.lineTo(X(b0), rows[i + 1] - 5);
        ctx.closePath();
        ctx.fillStyle = alpha(P.ink3, 0.12);
        ctx.fill();
        ctx.strokeStyle = alpha(P.ink3, 0.4);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      segs.forEach(([s0, s1, col], i) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(X(s0), rows[i]);
        ctx.lineTo(X(s1), rows[i]);
        ctx.stroke();
        ctx.fillStyle = P.surface;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(X(s0), rows[i], 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const len = s1 - s0;
        ctx.fillStyle = col;
        ctx.font = `600 11px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.fillText(`Δ${names[i]} = ${fmt(len, 3)}`, X((s0 + s1) / 2), rows[i] - 12);
      });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.fillText('u = x²', w - R, (rows[0] + rows[1]) / 2 + 4);
      ctx.fillText('y = sin u', w - R, (rows[1] + rows[2]) / 2 + 4);
    },
    [P, x, dx],
    { aspect: 1.9, maxHeight: 340, minHeight: 260 },
  );

  return (
    <Figure no={3} title="변화는 사슬을 타고 곱해진다" hint="x와 Δx를 움직여 보세요" caption={<>x를 Δx만큼 움직이면 u = x²는 약 g′(x)배로 늘어난 Δu만큼 움직이고, 그 Δu가 다시 y = sin u를 f′(u)배만큼 움직입니다. 그래서 전체 배율은 두 배율의 곱입니다. Δx가 작을수록 이 근사는 정확해집니다.</>}>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="ch-x" label="x" value={x} min={0.1} max={1.9} step={0.01} onChange={setX} format={(v) => fmt(v, 2)} color="var(--neg)" />
          <Slider id="ch-dx" label="Δx" value={dx} min={0.01} max={0.4} step={0.01} onChange={setDx} format={(v) => fmt(v, 2)} color="var(--neg)" />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="Δu / Δx" value={fmt((u1 - u0) / dx, 3)} color="var(--c-dl)" />
            <Readout label="g′(x) = 2x" value={fmt(gp(x), 3)} />
            <Readout label="Δy / Δu" value={fmt((y1 - y0) / (u1 - u0), 3)} color="var(--pos)" />
            <Readout label="f′(u) = cos u" value={fmt(fp(u0), 3)} />
            <Readout label="Δy / Δx" value={fmt((y1 - y0) / dx, 3)} />
            <Readout label="곱 f′(u)·g′(x)" value={fmt(fp(u0) * gp(x), 3)} color="var(--good)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Derivatives() {
  return (
    <>
      <h2>"조금 바꾸면 얼마나 바뀌나"</h2>
      <p>
        자동차 계기판의 속도계는 지금 이 순간의 속도를 보여 줍니다. 그런데 "순간"에는 시간이 흐르지 않으니 이동 거리도 0입니다. 0을 0으로 나눌 수는 없는데, 속도계는 무엇을 보여 주는 걸까요? 이 질문에 대한 답이 <T en="derivative">미분</T>입니다.
      </p>
      <p>
        방법은 이렇습니다. 먼저 짧은 시간 <M>{'\\Delta x'}</M> 동안의 평균 변화율을 구합니다. 그래프에서는 두 점을 잇는 직선, 즉 <T en="secant">할선</T>의 기울기입니다. 그다음 <M>{'\\Delta x'}</M>를 점점 줄여 갑니다. 그러면 할선의 기울기는 어떤 값에 한없이 가까워지는데, 그 값이 순간 변화율이자 그 점에서의 <T en="tangent">접선</T>의 기울기입니다.
      </p>
      <SecantFigure />
      <MB note="Δx를 0으로 보내는 극한. 분모가 0이 되는 것이 아니라 0에 '가까워지는' 것입니다.">{"f'(x) = \\lim_{\\Delta x \\to 0} \\frac{f(x + \\Delta x) - f(x)}{\\Delta x}"}</MB>
      <p>
        <M>{'f(x) = x^2'}</M>로 직접 계산해 보면 <M>{'\\frac{(x+\\Delta x)^2 - x^2}{\\Delta x} = 2x + \\Delta x'}</M>이므로, <M>{'\\Delta x \\to 0'}</M>일 때 <M>{"f'(x) = 2x"}</M>가 됩니다. 그림에서 x = 1일 때 미분값이 2로 나오는 것을 확인해 보세요.
      </p>

      <h2>도함수: 기울기들의 지도</h2>
      <p>
        모든 점에서 기울기를 구해 그것을 다시 함수로 그리면 <T en="derivative function">도함수</T> <M>{"f'(x)"}</M>가 됩니다. 도함수를 보면 원래 함수가 어디서 오르고 어디서 내려가는지 한눈에 알 수 있습니다. 특히 기울기가 0인 곳은 꼭대기나 바닥입니다. 최솟값을 찾는 일이 "기울기가 0인 곳 찾기"로 바뀌는 셈입니다.
      </p>
      <FPrimeFigure />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>함수 f(x)</th>
              <th>도함수 f′(x)</th>
              <th>읽는 법</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><M>{'c'}</M> (상수)</td>
              <td><M>{'0'}</M></td>
              <td>변하지 않으면 기울기는 0</td>
            </tr>
            <tr>
              <td><M>{'x^n'}</M></td>
              <td><M>{'n x^{n-1}'}</M></td>
              <td>지수를 앞으로 내리고 하나 줄인다</td>
            </tr>
            <tr>
              <td><M>{'e^x'}</M></td>
              <td><M>{'e^x'}</M></td>
              <td>자기 자신이 기울기인 특별한 함수</td>
            </tr>
            <tr>
              <td><M>{'\\ln x'}</M></td>
              <td><M>{'1/x'}</M></td>
              <td>크로스엔트로피 손실에서 다시 만납니다</td>
            </tr>
            <tr>
              <td><M>{'\\sin x'}</M></td>
              <td><M>{'\\cos x'}</M></td>
              <td>그림 2에서 확인해 보세요</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>연쇄 법칙: 변화가 전달되는 방식</h2>
      <p>
        신경망은 함수 안에 함수가 들어 있는 거대한 합성 함수입니다. 입력이 첫 번째 층을 지나고, 그 결과가 두 번째 층을 지나고, 마지막에 손실이 계산됩니다. 이런 합성 함수의 미분은 <T en="chain rule">연쇄 법칙</T>으로 구합니다. 규칙은 간단합니다. 각 단계의 배율을 곱하면 됩니다.
      </p>
      <p>
        톱니바퀴를 떠올려 보세요. 첫 번째 바퀴가 한 바퀴 돌 때 두 번째 바퀴가 3바퀴 돌고, 두 번째가 한 바퀴 돌 때 세 번째가 2바퀴 돈다면, 첫 번째가 한 바퀴 돌 때 세 번째는 3 × 2 = 6바퀴 돕니다. 아래 그림에서는 수직선 세 개로 같은 일을 보여 줍니다.
      </p>
      <ChainFigure />
      <MB note="y가 u를 통해 x에 의존할 때. 분수처럼 u가 '약분'되는 모양이라 외우기 쉽습니다.">{'\\frac{dy}{dx} = \\frac{dy}{du}\\cdot\\frac{du}{dx} \\qquad \\text{예: } \\frac{d}{dx}\\sin(x^2) = \\cos(x^2)\\cdot 2x'}</MB>
      <p>
        층이 100개인 신경망이라도 원리는 같습니다. 손실에서 출발해 층을 하나씩 거꾸로 지나며 배율을 곱해 가면, 맨 앞쪽 가중치가 손실에 미치는 영향까지 구할 수 있습니다. 이것이 뒤에서 배울 <a href="#ai-basics/backprop">역전파</a>입니다.
      </p>

      <h2>미분이 학습에 쓰이는 방법</h2>
      <p>
        모델의 가중치 <M>{'w'}</M> 하나와 그에 따른 손실 <M>{'L(w)'}</M>가 있다고 해 봅시다. 미분값 <M>{"L'(w)"}</M>는 "w를 조금 늘리면 손실이 얼마나 늘어나는가"를 알려 줍니다. 미분값이 양수라면 w를 줄여야 손실이 줄고, 음수라면 w를 늘려야 합니다. 즉 언제나 <strong>미분값의 반대 방향</strong>으로 조금 움직이면 됩니다.
      </p>
      <MB note="η(에타)는 한 번에 움직이는 보폭, 학습률입니다. 이 한 줄이 경사하강법의 전부입니다.">{"w \\leftarrow w - \\eta \\, \\frac{dL}{dw}"}</MB>
      <Callout kind="key">
        미분은 입력을 아주 조금 바꿨을 때 출력이 바뀌는 비율입니다. 기울기가 0인 곳은 꼭대기나 바닥이고, 합성 함수의 미분은 각 단계의 기울기를 곱해서 구합니다. 학습은 손실의 미분을 보고 가중치를 반대 방향으로 조금씩 옮기는 일입니다.
      </Callout>
      <Quiz
        q={<>f(x) = x² 에서 x = 3일 때 미분값은 얼마일까요?</>}
        options={['3', '6', '9', '2']}
        answer={1}
        explain={<>f′(x) = 2x 이므로 f′(3) = 6입니다. x = 3 근처에서 x를 0.01 늘리면 f(x)는 약 0.06 늘어난다는 뜻입니다. 9는 미분값이 아니라 함숫값입니다.</>}
      />
    </>
  );
}
