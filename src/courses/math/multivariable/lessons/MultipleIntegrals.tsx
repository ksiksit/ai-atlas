import { useMemo, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, lerpColor, rgbStr, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { BALL, TRI_EXACT, TRI_F, VOL_EXACT, VOL_F, VOL_TEX, columnHeight, gauss1, gaussDisk, gaussSquare, monteCarloBall, polarCell, riemann2, runningEstimate, simpson, sphericalSum, stripsHorizontal, stripsVertical, type Rule } from './integrate2';
import './multivariable.css';
import './integrals2.css';

/* ─────────────── Figure 1: columns under a surface ─────────────── */

const RULE_KO: Record<Rule, string> = { corner: '왼쪽 아래 모서리', mid: '가운데', max: '가장 높은 모서리' };

function ColumnsFigure() {
  const P = usePalette();
  const [n, setN] = useState(4);
  const [rule, setRule] = useState<Rule>('corner');
  const [mesh, setMesh] = useState(true);
  const sum = useMemo(() => riemann2(VOL_F, n, rule), [n, rule]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      // an oblique view: x to the right, y back and to the right, z up (squashed so 0..6 fits)
      const KX = 0.55, KY = 0.45, KZ = 0.32, ZMAX = 6;
      const s = Math.min((w - 64) / (2 + KX), (h - 40) / (KY + KZ * ZMAX));
      const ox = Math.max(30, (w - s * (2 + KX)) / 2), oy = h - 24;
      const X = (x: number, y: number) => ox + s * (x + KX * y);
      const Y = (y: number, z: number) => oy - s * (KY * y + KZ * z);
      const quad = (pts: [number, number, number][], fill: string, stroke: string) => {
        ctx.beginPath();
        pts.forEach(([x, y, z], i) => (i ? ctx.lineTo(X(x, y), Y(y, z)) : ctx.moveTo(X(x, y), Y(y, z))));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      };
      // floor and axes
      quad([[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]], P.surface2, P.lineStrong);
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(0, 0), Y(0, 0));
      ctx.lineTo(X(0, 0), Y(0, ZMAX));
      ctx.stroke();
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let z = 0; z <= ZMAX; z += 2) ctx.fillText(String(z), X(0, 0) - 5, Y(0, z));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('x', X(2, 0) + 8, Y(0, 0) - 4);
      ctx.fillText('0', X(0, 0), Y(0, 0) + 4);
      ctx.fillText('2', X(2, 0), Y(0, 0) + 4);
      ctx.textAlign = 'left';
      ctx.fillText('y = 1', X(2, 1) + 4, Y(1, 0) - 6);

      const dx = 2 / n, dy = 1 / n;
      const top = lerpColor(P.surface, P.accent, 0.55);
      const front = lerpColor(P.surface, P.accent, 0.85);
      const side = lerpColor(P.surface, P.accent, 0.7);
      const edge = alpha(P.surface, 0.9);
      // back rows first, and within a row left to right, so nearer columns paint over farther ones
      for (let j = n - 1; j >= 0; j--)
        for (let i = 0; i < n; i++) {
          const x0 = i * dx, y0 = j * dy, x1 = x0 + dx, y1 = y0 + dy;
          const z = columnHeight(VOL_F, x0, y0, dx, dy, rule);
          quad([[x1, y0, 0], [x1, y1, 0], [x1, y1, z], [x1, y0, z]], rgbStr(side), edge);
          quad([[x0, y0, 0], [x1, y0, 0], [x1, y0, z], [x0, y0, z]], rgbStr(front), edge);
          quad([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], rgbStr(top), edge);
        }
      if (mesh) {
        // the true surface as a wire mesh on top
        ctx.strokeStyle = alpha(P.ink, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let a = 0; a <= 8; a++) {
          const x = (2 * a) / 8;
          for (let b = 0; b <= 20; b++) {
            const y = b / 20;
            if (b) ctx.lineTo(X(x, y), Y(y, VOL_F(x, y)));
            else ctx.moveTo(X(x, y), Y(y, VOL_F(x, y)));
          }
        }
        for (let b = 0; b <= 4; b++) {
          const y = b / 4;
          for (let a = 0; a <= 40; a++) {
            const x = (2 * a) / 40;
            if (a) ctx.lineTo(X(x, y), Y(y, VOL_F(x, y)));
            else ctx.moveTo(X(x, y), Y(y, VOL_F(x, y)));
          }
        }
        ctx.stroke();
      }
    },
    [P, n, rule, mesh],
    { aspect: 1.1, maxHeight: 420 },
  );

  const err = sum - VOL_EXACT;
  return (
    <Figure
      no={1}
      title="곡면 아래 부피를 기둥으로 쪼개기"
      hint="기둥 수와 높이를 재는 자리를 바꿔 보세요"
      caption={
        <>
          밑면 <M>{'R = [0, 2] \\times [0, 1]'}</M>을 가로세로 n칸씩 나누고, 칸마다 <M>{VOL_TEX}</M>의 값 하나를 높이로 하는 기둥을 세웠습니다. 기둥 부피의 합이 이중 리만 합이고, 검은 그물이 실제 곡면입니다. 이 함수는 x와 y가 커질수록 커지므로 왼쪽 아래 모서리는 늘 모자라고 가장 높은 모서리는 늘 넘칩니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="mi-n" label="한 변의 칸 수 n" value={n} min={1} max={20} step={1} onChange={setN} />
        <Seg value={rule} onChange={setRule} options={(Object.keys(RULE_KO) as Rule[]).map((r) => ({ value: r, label: RULE_KO[r] }))} />
        <Check label="실제 곡면" checked={mesh} onChange={setMesh} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`밑면을 ${n}×${n}칸으로 나눠 ${RULE_KO[rule]}의 높이로 세운 기둥 ${n * n}개. 부피의 합은 ${sum.toFixed(4)}이고 실제 부피 ${VOL_EXACT.toFixed(4)}와 ${Math.abs(err).toFixed(4)} 차이 납니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Readout label="기둥 수" value={`${n * n}개`} />
          <Readout label="기둥 부피의 합" value={sum.toFixed(4)} color="var(--accent)" />
          <Readout label="실제 부피 17/3" value={VOL_EXACT.toFixed(4)} />
          <Readout label="오차" value={`${err >= 0 ? '+' : '−'}${Math.abs(err).toFixed(4)}`} color={Math.abs(err) < 0.01 ? 'var(--good)' : undefined} />
        </div>
      </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: switching the order over a triangle ─────────────── */

type Order = 'v' | 'h';

function OrderFigure() {
  const P = usePalette();
  const [order, setOrder] = useState<Order>('h');
  const [n, setN] = useState(8);
  const [pos, setPos] = useState(0.6);
  const k = Math.min(n - 1, Math.floor(pos * n));
  const c = (k + 0.5) / n; // the centre of the highlighted strip
  const total = useMemo(() => (order === 'v' ? stripsVertical(n) : stripsHorizontal(n)), [order, n]);
  const inner = order === 'v' ? c * TRI_F(c) : simpson(TRI_F, c, 1, 400);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -0.08, xMax: 1.12, yMin: -0.08, yMax: 1.12, equal: true, pad: { l: 30, r: 10, t: 10, b: 24 } });
      const lo = TRI_F(0), hi = TRI_F(1);
      plot.heatmap((x, y) => {
        if (x < 0 || x > 1 || y < 0 || y > x) {
          const c0 = lerpColor(P.surface, P.surface2, 0.5);
          return [c0[0], c0[1], c0[2], 255];
        }
        const t = (TRI_F(x) - lo) / (hi - lo);
        const cc = lerpColor(P.surface, P.pos, 0.12 + 0.5 * t);
        return [cc[0], cc[1], cc[2], 255];
      }, 3);
      plot.grid({ labels: true, xStep: 0.5, yStep: 0.5 });
      const ink = P.ink;
      // every strip, faint, and the chosen one strong
      for (let i = 0; i < n; i++) {
        const a = i / n, b = (i + 1) / n;
        const on = i === k;
        ctx.strokeStyle = on ? P.accent : alpha(P.ink3, 0.45);
        ctx.fillStyle = on ? alpha(P.accent, 0.35) : 'transparent';
        ctx.lineWidth = on ? 2 : 1;
        ctx.beginPath();
        if (order === 'v') {
          // a vertical strip at x ∈ [a, b] from y = 0 up to y = x (drawn to its midpoint height)
          const m = (a + b) / 2;
          ctx.rect(plot.X(a), plot.Y(m), plot.X(b) - plot.X(a), plot.Y(0) - plot.Y(m));
        } else {
          const m = (a + b) / 2;
          ctx.rect(plot.X(m), plot.Y(b), plot.X(1) - plot.X(m), plot.Y(a) - plot.Y(b));
        }
        if (on) ctx.fill();
        ctx.stroke();
      }
      // the triangle
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(plot.X(0), plot.Y(0));
      ctx.lineTo(plot.X(1), plot.Y(0));
      ctx.lineTo(plot.X(1), plot.Y(1));
      ctx.closePath();
      ctx.stroke();
      // the limits of the chosen strip
      const font = `600 11px ${P.fontMono}`;
      if (order === 'v') {
        plot.text(`y = 0`, c, 0, P.accent, { dy: 12, align: 'center', font, bg: P.surface });
        plot.text(`y = x`, c, c, P.accent, { dy: -12, align: 'center', font, bg: P.surface });
      } else {
        plot.text(`x = y`, c, c, P.accent, { dx: -8, align: 'right', font, bg: P.surface });
        plot.text(`x = 1`, 1, c, P.accent, { dx: 8, align: 'left', font, bg: P.surface });
      }
      plot.text('y = x', 0.62, 0.7, P.ink2, { align: 'right', font: `500 11px ${P.fontBody}` });
      plot.frame();
    },
    [P, order, n, k, c],
    { aspect: 1, maxHeight: 360 },
  );

  return (
    <Figure
      no={2}
      title="같은 삼각형, 두 가지 순서"
      hint="띠의 방향을 바꾸고 띠를 옮겨 보세요"
      caption={
        <>
          영역은 <M>{'T = \\{0 \\le y \\le x \\le 1\\}'}</M>, 적분할 함수는 <M>{'e^{x^2}'}</M>입니다(색이 진할수록 값이 큽니다). 가로 띠는 바깥 적분이 y, 안쪽 적분이 x인 순서이고, 세로 띠는 그 반대입니다. 띠 하나의 값은 그 띠 가운데에서 계산한 안쪽 적분에 띠 폭을 곱한 것입니다. 가로 띠의 안쪽 적분은 손으로 풀 수 없어 수치 적분(심프슨 공식)으로 구했습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={order} onChange={setOrder} options={[{ value: 'h', label: '가로 띠: dx dy' }, { value: 'v', label: '세로 띠: dy dx' }]} />
        <Slider id="mi-strips" label="띠 수" value={n} min={2} max={40} step={1} onChange={setN} />
        <Slider id="mi-pos" label={order === 'v' ? '고른 띠의 x' : '고른 띠의 y'} value={pos} min={0} max={0.999} step={0.001} onChange={setPos} format={() => c.toFixed(3)} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`삼각형 영역을 ${order === 'v' ? '세로' : '가로'} 띠 ${n}개로 나눴습니다. 고른 띠는 ${order === 'v' ? `x = ${c.toFixed(3)}에서 y가 0부터 ${c.toFixed(3)}까지` : `y = ${c.toFixed(3)}에서 x가 ${c.toFixed(3)}부터 1까지`}이고, 띠 값의 합은 ${total.toFixed(4)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="mi-tex">
            {order === 'v' ? <MB>{'\\int_0^1 \\left( \\int_0^{x} e^{x^2}\\,dy \\right) dx = \\int_0^1 x e^{x^2}\\,dx'}</MB> : <MB>{'\\int_0^1 \\left( \\int_y^{1} e^{x^2}\\,dx \\right) dy'}</MB>}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="고른 띠의 안쪽 적분" value={inner.toFixed(4)} />
            <Readout label={`띠 ${n}개의 합`} value={total.toFixed(4)} color="var(--accent)" />
            <Readout label="정확한 값 (e − 1)/2" value={TRI_EXACT.toFixed(4)} />
            <Readout label="오차" value={`${total - TRI_EXACT >= 0 ? '+' : '−'}${Math.abs(total - TRI_EXACT).toFixed(4)}`} />
          </div>
          <div className="mv-note" aria-live="polite">
            {order === 'v'
              ? `세로 띠의 안쪽 적분은 y에 대한 적분이라 e^{x²}가 상수입니다. 그래서 ${c.toFixed(3)} × e^(${c.toFixed(3)}²) = ${inner.toFixed(4)}처럼 바로 계산됩니다.`
              : `가로 띠의 안쪽 적분 ∫ e^{x²} dx에는 초등함수로 쓰는 원시함수가 없습니다. 이 값 ${inner.toFixed(4)}는 띠마다 수치 적분을 따로 돌려서 얻었습니다.`}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the polar area element ─────────────── */

const DTH = Math.PI / 12;

function PolarCellFigure() {
  const P = usePalette();
  const [r, setR] = useState(1);
  const [dr, setDr] = useState(0.25);
  const cell = polarCell(r, dr, DTH);
  const th0 = 2 * DTH;
  const errPct = (cell.approx / cell.exact - 1) * 100;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -0.15, xMax: 2.7, yMin: -0.15, yMax: 2.7, equal: true, pad: { l: 30, r: 10, t: 10, b: 24 } });
      plot.grid({ labels: true, xStep: 1, yStep: 1 });
      plot.clip();
      ctx.strokeStyle = alpha(P.ink3, 0.5);
      ctx.lineWidth = 1;
      for (let rr = dr; rr < 3; rr += dr) {
        ctx.beginPath();
        ctx.arc(plot.X(0), plot.Y(0), rr * plot.sx, -Math.PI / 2, 0);
        ctx.stroke();
      }
      for (let t = 0; t <= Math.PI / 2 + 1e-9; t += DTH) plot.line(0, 0, 3 * Math.cos(t), 3 * Math.sin(t), alpha(P.ink3, 0.5), 1);
      // the exact cell
      const cx = plot.X(0), cy = plot.Y(0);
      ctx.beginPath();
      ctx.arc(cx, cy, (r + dr) * plot.sx, -th0, -(th0 + DTH), true);
      ctx.arc(cx, cy, r * plot.sx, -(th0 + DTH), -th0, false);
      ctx.closePath();
      ctx.fillStyle = alpha(P.accent, 0.35);
      ctx.fill();
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      // the rectangle it is approximated by: r dθ wide (inner arc) by dr deep
      const a = th0 + DTH / 2;
      const ux = Math.cos(a), uy = Math.sin(a), tx = -Math.sin(a), ty = Math.cos(a);
      const half = (r * DTH) / 2;
      const pts: [number, number][] = [
        [r * ux - half * tx, r * uy - half * ty],
        [r * ux + half * tx, r * uy + half * ty],
        [(r + dr) * ux + half * tx, (r + dr) * uy + half * ty],
        [(r + dr) * ux - half * tx, (r + dr) * uy - half * ty],
      ];
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(plot.X(x), plot.Y(y)) : ctx.moveTo(plot.X(x), plot.Y(y))));
      ctx.closePath();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = P.pos;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      plot.unclip();
      plot.text(`r = ${r.toFixed(2)}`, r * Math.cos(th0 - 0.12), r * Math.sin(th0 - 0.12), P.ink2, { align: 'center', font: `600 11px ${P.fontMono}`, bg: P.surface });
      plot.frame();
    },
    [P, r, dr],
    { aspect: 1, maxHeight: 340 },
  );

  return (
    <Figure
      no={3}
      title="극좌표의 넓이 조각 r dr dθ"
      hint="반지름과 두께를 바꿔 보세요"
      caption={
        <>
          반지름이 <M>{'r'}</M>에서 <M>{'r + \\Delta r'}</M>까지, 각도가 <M>{'\\Delta\\theta = 15°'}</M>인 조각(파랑)과, 그것을 가로 <M>{'r\\Delta\\theta'}</M>(안쪽 호의 길이), 세로 <M>{'\\Delta r'}</M>인 직사각형으로 본 근사(붉은 점선)입니다. 원점에서 멀수록 같은 <M>{'\\Delta r'}</M>, <M>{'\\Delta\\theta'}</M>라도 조각이 넓어집니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="mi-r" label="안쪽 반지름 r" value={r} min={0.25} max={2.25} step={0.05} onChange={setR} format={(v) => v.toFixed(2)} />
        <Slider id="mi-dr" label="두께 Δr" value={dr} min={0.05} max={0.5} step={0.05} onChange={setDr} format={(v) => v.toFixed(2)} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`반지름 ${r.toFixed(2)}에서 두께 ${dr.toFixed(2)}, 각도 15도인 극좌표 조각. 실제 넓이 ${cell.exact.toFixed(4)}, r Δr Δθ 근사 ${cell.approx.toFixed(4)}.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <MB>{'\\text{넓이} = \\tfrac12\\left((r+\\Delta r)^2 - r^2\\right)\\Delta\\theta = \\left(r + \\tfrac{\\Delta r}{2}\\right)\\Delta r\\,\\Delta\\theta'}</MB>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="실제 넓이" value={cell.exact.toFixed(4)} color="var(--accent)" />
            <Readout label="r Δr Δθ" value={cell.approx.toFixed(4)} color="var(--pos)" />
            <Readout label="상대 오차" value={`${errPct.toFixed(1)}%`} />
            <Readout label="Δr / (2r + Δr)" value={`${((dr / (2 * r + dr)) * 100).toFixed(1)}%`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: the Gaussian integral ─────────────── */

function GaussFigure() {
  const P = usePalette();
  const [R, setR] = useState(1.5);
  const disk = gaussDisk(R), sq = gaussSquare(R), outer = gaussDisk(R * Math.SQRT2);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -3.3, xMax: 3.3, yMin: -3.3, yMax: 3.3, equal: true, pad: { l: 30, r: 10, t: 10, b: 24 } });
      plot.heatmap((x, y) => {
        const v = Math.exp(-(x * x + y * y));
        const c = lerpColor(P.surface, P.accent, 0.85 * v);
        return [c[0], c[1], c[2], 255];
      }, 3);
      plot.grid({ labels: true, xStep: 1, yStep: 1 });
      const cx = plot.X(0), cy = plot.Y(0);
      ctx.lineWidth = 2;
      ctx.strokeStyle = P.good;
      ctx.beginPath();
      ctx.arc(cx, cy, R * plot.sx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = P.pos;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(plot.X(-R), plot.Y(R), plot.X(R) - plot.X(-R), plot.Y(-R) - plot.Y(R));
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = P.ink2;
      ctx.beginPath();
      ctx.arc(cx, cy, R * Math.SQRT2 * plot.sx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      plot.frame();
    },
    [P, R],
    { aspect: 1, maxHeight: 360 },
  );

  return (
    <Figure
      no={4}
      title="종 모양 곡면 아래 부피는 π"
      hint="R을 키워 세 부피가 한 값으로 모이는 것을 보세요"
      caption={
        <>
          색은 <M>{'e^{-(x^2+y^2)}'}</M>의 높이입니다. 반지름 R인 원(초록) 위의 부피는 극좌표로 정확히 계산되고, 한 변이 2R인 정사각형(붉은 점선) 위의 부피는 1차원 적분의 제곱입니다. 정사각형은 반지름 R인 원과 반지름 <M>{'\\sqrt2 R'}</M>인 원(검은 점선) 사이에 끼어 있습니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="mi-R" label="R" value={R} min={0.2} max={3} step={0.05} onChange={setR} format={(v) => v.toFixed(2)} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`가우스 함수의 높이 지도와 반지름 ${R.toFixed(2)}인 원, 한 변 ${(2 * R).toFixed(2)}인 정사각형, 반지름 ${(R * Math.SQRT2).toFixed(2)}인 원. 부피는 차례로 ${disk.toFixed(4)}, ${sq.toFixed(4)}, ${outer.toFixed(4)}이고 π에 다가갑니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="mi-sandwich" aria-hidden="true">
            {[
              ['원 R', disk, 'var(--good)'],
              ['정사각형', sq, 'var(--pos)'],
              ['원 √2R', outer, 'var(--ink-2)'],
            ].map(([lab, v, col]) => (
              <div key={lab as string}>
                <span>{lab as string}</span>
                <i style={{ width: `${((v as number) / Math.PI) * 100}%`, background: col as string }} />
                <b className="mono">{(v as number).toFixed(4)}</b>
              </div>
            ))}
            <div className="mi-pi">
              <span>π</span>
              <i />
              <b className="mono">{Math.PI.toFixed(4)}</b>
            </div>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="∫ e^(−x²) dx, −R부터 R" value={gauss1(R).toFixed(4)} color="var(--pos)" />
            <Readout label="√π" value={Math.sqrt(Math.PI).toFixed(4)} />
          </div>
          <Legend
            items={[
              { color: 'var(--good)', label: '원 R: π(1 − e^(−R²))', shape: 'ln' },
              { color: 'var(--pos)', label: '정사각형: (∫ e^(−x²) dx)²', shape: 'ln' },
              { color: 'var(--ink-2)', label: '원 √2R', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 5: Monte Carlo volume of a ball ─────────────── */

const NS = [100, 1000, 5000, 20000];

function MonteCarloFigure() {
  const P = usePalette();
  const [N, setN] = useState(5000);
  const [seed, setSeed] = useState(1);
  const mc = useMemo(() => monteCarloBall(seed, N), [seed, N]);
  const run = useMemo(() => runningEstimate(mc.points), [mc]);

  const dots = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -1.1, xMax: 1.1, yMin: -1.1, yMax: 1.1, equal: true, pad: { l: 26, r: 8, t: 8, b: 22 } });
      plot.grid({ labels: true, xStep: 1, yStep: 1 });
      const r = N > 5000 ? 1 : N > 1000 ? 1.4 : 2.2;
      const inC = alpha(P.accent, N > 5000 ? 0.5 : 0.75), outC = alpha(P.ink3, N > 5000 ? 0.35 : 0.55);
      for (const p of mc.points) {
        ctx.fillStyle = p.inside ? inC : outC;
        ctx.fillRect(plot.X(p.x) - r / 2, plot.Y(p.y) - r / 2, r, r);
      }
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(plot.X(0), plot.Y(0), plot.sx, 0, Math.PI * 2);
      ctx.stroke();
      plot.frame();
    },
    [P, mc],
    { aspect: 1, maxHeight: 300 },
  );

  const curve = useCanvas2D(
    (ctx, { w, h }) => {
      const lo = 3.2, hi = 5.2;
      const L = (n: number) => Math.log10(n);
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: L(N), yMin: lo, yMax: hi, pad: { l: 38, r: 10, t: 10, b: 24 } });
      plot.grid({ labels: false, xStep: 1, yStep: 0.5 });
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let v = lo; v <= hi + 1e-9; v += 0.5) ctx.fillText(v.toFixed(1), plot.pad.l - 5, plot.Y(v));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let e = 0; e <= L(N) + 1e-9; e++) ctx.fillText((10 ** e).toLocaleString('ko-KR'), plot.X(e), plot.Y(lo) + 5);
      plot.line(0, BALL, L(N), BALL, P.good, 1.5, [5, 4]);
      plot.clip();
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      run.forEach((v, i) => (i ? ctx.lineTo(plot.X(L(i + 1)), plot.Y(v)) : ctx.moveTo(plot.X(0), plot.Y(v))));
      ctx.stroke();
      plot.unclip();
      plot.text('4π/3', L(N), BALL, P.good, { dy: -9, align: 'right', font: `600 11px ${P.fontMono}`, bg: P.surface });
      plot.frame();
    },
    [P, run, N],
    { aspect: 1.3, maxHeight: 300 },
  );

  const err = mc.estimate - BALL;
  return (
    <Figure
      no={5}
      title="점을 뿌려 공의 부피 재기"
      hint="점 수를 바꾸고, 다른 씨앗으로 다시 뿌려 보세요"
      caption={
        <>
          정육면체 <M>{'[-1, 1]^3'}</M>(부피 8) 안에 점을 고르게 뿌리고, 단위 공 <M>{'x^2 + y^2 + z^2 \\le 1'}</M> 안에 떨어진 비율에 8을 곱했습니다. 왼쪽은 점들을 위에서 내려다본 것으로, 원 안에 공 밖의 점(회색)이 섞여 보이는 것은 높이 z를 버렸기 때문입니다. 위나 아래로 공을 벗어난 점도 내려다보면 원 안에 찍힙니다. 오른쪽은 점을 하나씩 더할 때마다의 추정값(가로축은 로그 눈금)입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={N} onChange={setN} options={NS.map((v) => ({ value: v, label: `${v.toLocaleString('ko-KR')}개` }))} />
        <Button small onClick={() => setSeed((x) => x + 1)}>
          다른 씨앗으로 다시 뿌리기
        </Button>
        {seed !== 1 && (
          <Button small onClick={() => setSeed(1)}>
            처음 씨앗
          </Button>
        )}
      </div>
      <div className="op-pair">
        <div ref={dots.wrapRef} className="canvas-box" role="img" aria-label={`정육면체에 뿌린 점 ${N}개를 위에서 본 모습. ${mc.inside}개가 공 안에 떨어졌습니다.`}>
          <canvas ref={dots.canvasRef} />
        </div>
        <div ref={curve.wrapRef} className="canvas-box" role="img" aria-label={`점을 더할수록 추정값이 4π/3 ≈ ${BALL.toFixed(4)} 둘레로 모이는 그래프. 마지막 추정값 ${mc.estimate.toFixed(4)}.`}>
          <canvas ref={curve.canvasRef} />
        </div>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Readout label="공 안의 점" value={`${mc.inside.toLocaleString('ko-KR')} / ${N.toLocaleString('ko-KR')}`} />
        <Readout label="추정 부피 8 × 비율" value={mc.estimate.toFixed(4)} color="var(--accent)" />
        <Readout label="4π/3" value={BALL.toFixed(4)} />
        <Readout label="오차" value={`${err >= 0 ? '+' : '−'}${Math.abs(err).toFixed(4)}`} />
      </div>
      <div className="mv-small">씨앗 {seed}</div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function MultipleIntegrals() {
  const r = (n: number, rule: Rule) => riemann2(VOL_F, n, rule).toFixed(3);
  const c1 = polarCell(1, 0.25, DTH);
  const c1s = polarCell(1, 0.05, DTH);
  const sph = [2, 4, 8, 16].map((n) => [n, sphericalSum(n)] as const);
  const mcs = NS.map((n) => [n, monteCarloBall(1, n).estimate] as const);
  return (
    <>
      <h2>부피를 기둥으로 쪼개기</h2>
      <p>
        <a href={lessonHref('math-calculus', 'integrals')}>미적분학</a>에서 곡선 아래 넓이를 가는 직사각형으로 쪼개 더했습니다. 곡면 아래 부피도 똑같이 합니다. 밑면을 작은 칸으로 나누고, 칸마다 함수값 하나를 높이로 하는 기둥을 세워 부피를 더하면 됩니다. 칸을 한없이 잘게 할 때 이 합이 가까워지는 값을 <T en="double integral">이중적분</T>이라고 씁니다.
      </p>
      <MB>{'\\iint_R f(x, y)\\,dA = \\lim_{n\\to\\infty} \\sum_{i=1}^{n}\\sum_{j=1}^{n} f(x_{ij}^*, y_{ij}^*)\\,\\Delta x\\,\\Delta y'}</MB>
      <ColumnsFigure />
      <p>
        한 변을 4칸씩, 기둥 16개로 나누면 왼쪽 아래 모서리로 잰 합은 {r(4, 'corner')}, 가운데로 잰 합은 {r(4, 'mid')}, 가장 높은 모서리로 잰 합은 {r(4, 'max')}입니다. 16칸씩(기둥 256개)으로 늘리면 각각 {r(16, 'corner')}, {r(16, 'mid')}, {r(16, 'max')}로 실제 부피 <M>{'17/3 \\approx 5.667'}</M>을 양쪽에서 조여 갑니다. 가운데에서 잰 합은 기둥 16개만으로도 오차가 0.05가 안 됩니다. 1차원에서 중점 규칙이 정확했던 것과 같은 이유입니다.
      </p>

      <h2>한 번에 한 변수씩: 반복적분</h2>
      <p>
        부피를 실제로 계산할 때는 기둥을 줄 단위로 묶습니다. x를 하나 고정하면 그 위의 단면은 y에 대한 함수이고, 그 넓이 <M>{'A(x) = \\int f(x, y)\\,dy'}</M>는 1차원 적분입니다. 단면의 넓이를 다시 x로 적분하면 부피가 됩니다. 식빵을 얇게 썰어 조각의 넓이를 더하는 것과 같습니다. 이것을 <T en="iterated integral">반복적분</T>이라 하고, 함수가 연속이면 어느 순서로 썰어도 결과가 같다는 것이 <T en="Fubini's theorem">푸비니 정리</T>입니다.
      </p>
      <MB note="그림 1의 함수. 안쪽 적분에서 x는 상수처럼 다룹니다.">{'\\int_0^2 \\int_0^1 (x^2 + y + 1)\\,dy\\,dx = \\int_0^2 \\left(x^2 + \\tfrac12 + 1\\right) dx = \\tfrac83 + 3 = \\tfrac{17}{3}'}</MB>
      <p>
        밑면이 직사각형이 아니면 안쪽 적분의 범위가 바깥 변수에 따라 달라집니다. 그리고 순서를 잘못 고르면 같은 적분이 손으로는 풀 수 없게 되기도 합니다. 그림 2는 그런 예입니다.
      </p>
      <OrderFigure />
      <p>
        가로 띠로 썰면 안쪽 적분이 <M>{'\\int_y^1 e^{x^2}\\,dx'}</M>인데, <M>{'e^{x^2}'}</M>의 원시함수는 초등함수로 쓸 수 없습니다. 수치 적분으로 띠 8개를 더하면 {stripsHorizontal(8).toFixed(4)}가 나오지만, 정확한 값은 알 수 없습니다. 세로 띠로 바꾸면 안쪽 적분은 y에 대한 적분이라 <M>{'e^{x^2}'}</M>가 상수가 되고, <M>{'\\int_0^x e^{x^2}\\,dy = x e^{x^2}'}</M>입니다. 이것은 치환 <M>{'u = x^2'}</M>으로 바로 풀려서 정확히 <M>{'(e - 1)/2 \\approx '}</M>{TRI_EXACT.toFixed(4)}입니다. 순서를 바꿀 때 범위를 바꾸는 법은 그림을 보는 것입니다. 같은 삼각형을 가로로 보면 "y가 0부터 1까지, 각 y에서 x는 y부터 1까지"이고, 세로로 보면 "x가 0부터 1까지, 각 x에서 y는 0부터 x까지"입니다.
      </p>

      <h2>둥근 영역에는 극좌표</h2>
      <p>
        원이나 고리 모양 영역을 x와 y의 직사각형 칸으로 쪼개면 가장자리가 들쭉날쭉해지고 범위에 제곱근이 들어갑니다. 대신 반지름 r과 각도 θ로 쪼개면 원은 <M>{'0 \\le r \\le R'}</M>, <M>{'0 \\le \\theta \\le 2\\pi'}</M>라는 깔끔한 직사각형이 됩니다. 대가는 칸의 넓이가 일정하지 않다는 것입니다.
      </p>
      <PolarCellFigure />
      <p>
        반지름 1에서 두께 0.25, 각도 15°인 조각의 실제 넓이는 {c1.exact.toFixed(4)}이고, 안쪽 반지름으로 계산한 <M>{'r\\,\\Delta r\\,\\Delta\\theta'}</M>는 {c1.approx.toFixed(4)}로 {((c1.approx / c1.exact - 1) * 100).toFixed(1)}% 작습니다. 두께를 0.05로 줄이면 오차가 {((c1s.approx / c1s.exact - 1) * 100).toFixed(1)}%로 줄고, 조각이 한없이 얇아지면 오차는 사라집니다. 그래서 극좌표의 넓이 요소는
      </p>
      <MB note="이 r이 극좌표 변환의 야코비 행렬식입니다.">{'dA = dx\\,dy = r\\,dr\\,d\\theta'}</MB>
      <p>
        입니다. 바깥쪽 조각일수록 넓다는 사실이 r 하나에 담겨 있습니다. 이 r은 <a href={lessonHref('math-multivariable', 'chain-rule-jacobian')}>야코비 행렬</a> 장에서 본, 좌표 변환이 작은 정사각형을 늘리는 비율과 같습니다.
      </p>

      <h2>가우스 적분: π가 나오는 곳</h2>
      <p>
        통계에서 가장 중요한 곡선인 종 모양 <M>{'e^{-x^2}'}</M> 아래의 넓이는 원시함수 없이 구해야 합니다. 1차원으로는 막히는 이 문제를 2차원으로 올리면 풀립니다. 그림 4의 종 모양 곡면 <M>{'e^{-(x^2+y^2)} = e^{-r^2}'}</M> 아래의 부피를 극좌표로 계산하면, r이 원시함수를 만들어 줍니다.
      </p>
      <MB>{'\\iint_{r \\le R} e^{-r^2}\\, r\\,dr\\,d\\theta = 2\\pi \\left[-\\tfrac12 e^{-r^2}\\right]_0^R = \\pi\\left(1 - e^{-R^2}\\right) \\xrightarrow{R\\to\\infty} \\pi'}</MB>
      <GaussFigure />
      <p>
        한편 정사각형 위의 부피는 <M>{'e^{-(x^2+y^2)} = e^{-x^2}e^{-y^2}'}</M>이므로 두 1차원 적분의 곱 <M>{'\\left(\\int_{-R}^{R} e^{-x^2}dx\\right)^2'}</M>입니다. 정사각형은 반지름 R인 원보다 크고 반지름 <M>{'\\sqrt2 R'}</M>인 원보다 작으므로 부피도 그 사이에 끼어 있습니다. R = 1.5에서는 {gaussDisk(1.5).toFixed(4)} &lt; {gaussSquare(1.5).toFixed(4)} &lt; {gaussDisk(1.5 * Math.SQRT2).toFixed(4)}이고, R = 3에서는 세 값이 모두 3.141로 모입니다. 양쪽 원이 π로 가므로 가운데 정사각형도 π로 가고, 따라서
      </p>
      <MB>{'\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi} \\approx 1.7725'}</MB>
      <p>
        입니다. 정규분포의 밀도 함수 앞에 붙는 <M>{'1/\\sqrt{2\\pi}'}</M>가 바로 이 값에서 나옵니다(<a href={lessonHref('math-probability', 'distributions')}>자주 쓰는 분포</a>). 넓이를 1로 맞추려면 이 수로 나눠야 하기 때문입니다.
      </p>

      <h2>3차원: 원기둥 좌표와 구면 좌표</h2>
      <p>
        삼중적분도 같은 방식입니다. 원기둥 모양이면 극좌표에 높이 z를 더한 <T en="cylindrical coordinates">원기둥 좌표</T>를 쓰고 부피 요소는 <M>{'dV = r\\,dr\\,d\\theta\\,dz'}</M>입니다. 공 모양이면 원점에서의 거리 ρ, z축에서 내려온 각 φ, 바닥에서 돈 각 θ로 위치를 나타내는 <T en="spherical coordinates">구면 좌표</T>를 쓰고, 부피 요소는 <M>{'dV = \\rho^2 \\sin\\varphi\\,d\\rho\\,d\\varphi\\,d\\theta'}</M>입니다. 원점에서 멀수록(ρ²), 적도에 가까울수록(sin φ) 조각이 커집니다. 반지름 1인 공의 부피는
      </p>
      <MB>{'\\int_0^{2\\pi}\\!\\int_0^{\\pi}\\!\\int_0^1 \\rho^2 \\sin\\varphi\\,d\\rho\\,d\\varphi\\,d\\theta = 2\\pi \\cdot 2 \\cdot \\tfrac13 = \\tfrac43\\pi \\approx 4.1888'}</MB>
      <p>구면 좌표의 조각을 축마다 n개씩 나눠 가운데 값으로 더하면 다음처럼 이 값에 다가갑니다.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>축마다 칸 수 n</th>
              {sph.map(([n]) => (
                <th key={n}>{n}</th>
              ))}
              <th>정확한 값</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Σ ρ² sin φ Δρ Δφ Δθ</td>
              {sph.map(([n, v]) => (
                <td key={n} className="mono">
                  {v.toFixed(4)}
                </td>
              ))}
              <td className="mono">{BALL.toFixed(4)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>점을 뿌려서 적분하기</h2>
      <p>
        영역이 복잡하거나 차원이 높으면 칸으로 쪼개는 방법은 금방 감당할 수 없게 됩니다. 축마다 10칸씩 나누면 3차원에서는 칸이 1,000개, 10차원에서는 100억 개입니다. 이럴 때는 영역을 감싸는 상자 안에 점을 무작위로 뿌리고 영역 안에 떨어진 비율을 세는 <T en="Monte Carlo integration">몬테카를로 적분</T>을 씁니다.
      </p>
      <MonteCarloFigure />
      <p>
        처음 씨앗으로 점 100개를 뿌리면 추정값이 {mcs[0][1].toFixed(2)}로 실제 값 4.19와 꽤 다릅니다. 1,000개면 {mcs[1][1].toFixed(3)}, 5,000개면 {mcs[2][1].toFixed(4)}, 20,000개면 {mcs[3][1].toFixed(4)}입니다. 5,000개일 때 오차가 20,000개일 때보다 작은 것은 운입니다. 씨앗을 바꿔 다시 뿌려 보면 추정값이 매번 달라지지만, 점이 많을수록 흔들리는 폭이 좁아집니다. <a href={lessonHref('math-probability', 'limits')}>대수의 법칙</a>이 보장하는 것이 이것이고, 오차는 대략 <M>{'1/\\sqrt N'}</M>에 비례해 줄어듭니다. 점을 100배로 늘려야 오차가 10분의 1이 되므로 느리지만, 이 속도는 차원과 상관이 없습니다. 그래서 수십, 수백 차원의 적분이 필요한 물리 시뮬레이션과 베이즈 통계, 컴퓨터 그래픽스의 빛 계산에서 이 방법을 씁니다.
      </p>

      <Callout kind="key">
        이중적분은 밑면을 칸으로 나눈 기둥 부피 합의 극한이고, 실제로는 한 변수씩 적분하는 반복적분으로 계산합니다. 연속 함수라면 순서를 바꿔도 값이 같으므로(푸비니 정리), 한 순서로 풀리지 않으면 영역을 다시 그려 범위를 바꿉니다. 둥근 영역에서는 극좌표로 바꾸고 넓이 요소 <M>{'dA = r\\,dr\\,d\\theta'}</M>를 잊지 말아야 하며, 이 r 덕분에 <M>{'\\int e^{-x^2}dx = \\sqrt\\pi'}</M> 같은 적분이 풀립니다. 3차원에서는 원기둥 좌표와 구면 좌표(<M>{'dV = \\rho^2\\sin\\varphi\\,d\\rho\\,d\\varphi\\,d\\theta'}</M>)를 쓰고, 차원이 높으면 점을 뿌리는 몬테카를로 적분이 남습니다.
      </Callout>
      <Quiz
        q={<>반지름 2인 원판 위에서 <M>{'\\iint (x^2 + y^2)\\,dA'}</M>를 극좌표로 계산하면 얼마일까요?</>}
        options={['4π', '8π', '16π', '2π']}
        answer={1}
        explain={<>극좌표에서 <M>{'x^2 + y^2 = r^2'}</M>이고 넓이 요소가 <M>{'r\\,dr\\,d\\theta'}</M>이므로 <M>{'\\int_0^{2\\pi}\\!\\int_0^2 r^2 \\cdot r\\,dr\\,d\\theta = 2\\pi \\cdot \\tfrac{2^4}{4} = 8\\pi'}</M>입니다. r을 빠뜨리면 <M>{'2\\pi \\cdot \\tfrac{2^3}{3} = \\tfrac{16\\pi}{3}'}</M>라는 틀린 답이 나옵니다.</>}
      />
    </>
  );
}
