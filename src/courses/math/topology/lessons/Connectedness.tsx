import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { DOMAINS, GH, GW, SHAPES, antipodal, arcLength, components, cutAt, f2, images, pancakes, preimages, sandwich, shapeGrid, temperature, zerosFrom, type DomainId, type ShapeId } from './connect';
import './topology.css';
import './connect.css';

const pieceColors = (P: Palette) => [P.neg, P.pos, P.good, P.stats2, P.bad, P.stats1, P.ml, P.dl];

/* ─────────────── Figure 1: how many pieces? ─────────────── */

function PiecesFigure() {
  const P = usePalette();
  const [shape, setShape] = useState<ShapeId>('cut');
  const [gap, setGap] = useState(0.3);
  const [cuts, setCuts] = useState(2);
  const [edits, setEdits] = useState<Set<number>>(() => new Set());
  const paintTo = useRef<0 | 1>(1);

  const base = useMemo(() => shapeGrid(shape, gap, cuts), [shape, gap, cuts]);
  const grid = useMemo(() => {
    const g = base.slice();
    edits.forEach((c) => (g[c] = g[c] ? 0 : 1));
    return g;
  }, [base, edits]);
  const { label, sizes } = useMemo(() => components(grid), [grid]);
  const filled = sizes.reduce((a, b) => a + b, 0);

  const pick = (s: ShapeId) => {
    setShape(s);
    setEdits(new Set());
  };

  const layout = (w: number, h: number) => {
    const c = Math.min(w / GW, h / GH);
    return { c, ox: (w - c * GW) / 2, oy: (h - c * GH) / 2 };
  };

  const { wrapRef, canvasRef, size } = useCanvas2D(
    (ctx, { w, h }) => {
      const { c, ox, oy } = layout(w, h);
      const cols = pieceColors(P);
      ctx.fillStyle = P.surface2;
      ctx.fillRect(ox, oy, c * GW, c * GH);
      for (let j = 0; j < GH; j++)
        for (let i = 0; i < GW; i++) {
          const k = j * GW + i;
          if (!grid[k]) continue;
          ctx.fillStyle = sizes.length > 1 ? cols[label[k] % cols.length] : P.accent;
          ctx.fillRect(ox + i * c, oy + j * c, c + 0.4, c + 0.4);
        }
      // faint cell lines so the grid is visible where it matters
      if (c >= 6) {
        ctx.strokeStyle = alpha(P.surface, 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= GW; i++) {
          ctx.moveTo(Math.round(ox + i * c) + 0.5, oy);
          ctx.lineTo(Math.round(ox + i * c) + 0.5, oy + c * GH);
        }
        for (let j = 0; j <= GH; j++) {
          ctx.moveTo(ox, Math.round(oy + j * c) + 0.5);
          ctx.lineTo(ox + c * GW, Math.round(oy + j * c) + 0.5);
        }
        ctx.stroke();
      }
    },
    [P, grid, label, sizes],
    { aspect: GW / GH, maxHeight: 380 },
  );

  const cellAt = (x: number, y: number) => {
    const { c, ox, oy } = layout(size.w, size.h);
    const i = Math.floor((x - ox) / c), j = Math.floor((y - oy) / c);
    return i >= 0 && j >= 0 && i < GW && j < GH ? j * GW + i : -1;
  };
  const paint = (k: number) => {
    if (k < 0) return;
    const want = paintTo.current;
    if (grid[k] === want) return;
    setEdits((prev) => {
      const nx = new Set(prev);
      if (nx.has(k)) nx.delete(k);
      else nx.add(k);
      return nx;
    });
  };
  useDrag(wrapRef, {
    hit: (x, y) => {
      const k = cellAt(x, y);
      if (k < 0) return null;
      paintTo.current = grid[k] ? 0 : 1;
      return 'paint';
    },
    onDrag: (_id, x, y) => paint(cellAt(x, y)),
  });

  const note =
    sizes.length === 0
      ? '칠한 칸이 없습니다. 칸을 눌러 칠해 보세요.'
      : sizes.length === 1
        ? `한 조각입니다. 칠한 칸 ${filled}개 가운데 어느 두 칸이든 변을 맞댄 칸들의 사슬로 이어집니다.`
        : `${sizes.length}조각입니다 (칸 수 ${sizes.join(', ')}). 한 조각을 칸 반 개만큼 부풀린 열린 집합 U와 나머지를 부풀린 열린 집합 V는 겹치지 않으면서 전체를 나눠 담습니다. 그래서 이 집합은 연결되어 있지 않습니다.`;

  return (
    <Figure
      no={1}
      title="몇 조각일까"
      hint="모양을 고르고, 칸을 눌러 칠하거나 지워 보세요"
      caption={
        <>
          평면의 집합을 한 변이 0.1인 칸으로 나눠 그렸습니다. 칠한 칸에서 시작해 변을 맞댄 칠한 칸으로만 퍼져 나가는 채우기로 조각을 셉니다. 조각이 둘 이상이면 조각마다 다른 색으로 칠합니다. 실제 평면에서는 아무리 좁은 틈도 집합을 끊지만, 이 그림에서는 틈이 칸 한 개보다 좁으면 칸 중심이 틈에 걸리지 않아 이어진 것으로 보입니다. 끌면서 여러 칸을 한 번에 칠하거나 지울 수 있습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={shape} onChange={pick} options={SHAPES.map((s) => ({ value: s.id, label: s.name }))} />
        {shape === 'cut' && <Slider id="cc2-gap" label="다리의 틈" value={gap} min={0} max={1} step={0.05} onChange={(v) => { setGap(v); setEdits(new Set()); }} format={(v) => v.toFixed(2)} />}
        {shape === 'annulus' && <Slider id="cc2-cuts" label="잘라 낸 틈의 수" value={cuts} min={0} max={4} step={1} onChange={(v) => { setCuts(v); setEdits(new Set()); }} />}
        <Button small onClick={() => setEdits(new Set())} disabled={edits.size === 0}>
          칠한 것 되돌리기
        </Button>
      </div>
      <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`${SHAPES.find((s) => s.id === shape)!.name} 모양을 칸 ${GW}×${GH}개로 그린 그림. 칠한 칸 ${filled}개, 조각 ${sizes.length}개.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="cc2-readouts">
        <Readout label="칠한 칸" value={filled} />
        <Readout label="조각 수" value={sizes.length} color={sizes.length > 1 ? 'var(--bad)' : 'var(--good)'} />
      </div>
      <div className="tp-note" data-bad={sizes.length > 1 || undefined} aria-live="polite">
        {note}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the image of a connected set ─────────────── */

function ImageFigure() {
  const P = usePalette();
  const [dom, setDom] = useState<DomainId>('whole');
  const [c, setC] = useState(0.5);
  const D = DOMAINS[dom];
  const imgs = useMemo(() => images(D), [D]);
  const pre = useMemo(() => preimages(D, c), [D, c]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -0.12, xMax: 1.05, yMin: 0, yMax: 1, pad: { l: 40, r: 14, t: 12, b: 28 } });
      p.grid({ xStep: 0.2, yStep: 0.2 });
      p.fn(f2, alpha(P.ink3, 0.45), 1.5, { from: 0, to: 1, samples: 600 });
      for (const [a, b] of D) {
        p.fn(f2, P.accent, 3, { from: a, to: b, samples: 600 });
        p.line(a, 0.004, b, 0.004, P.accent, 6);
      }
      // the image, drawn on a strip left of the y-axis
      for (const [lo, hi] of imgs) p.line(-0.06, lo, -0.06, hi, P.good, 7);
      p.line(-0.12, c, 1.05, c, alpha(P.ink, 0.6), 1.2, [5, 4]);
      p.text(`y = ${c.toFixed(2)}`, 1.05, c, P.ink2, { align: 'right', dx: -2, dy: -10, font: `600 11px ${P.fontMono}`, bg: P.surface });
      for (const x of pre) p.dot(x, c, 5, P.pos, P.surface, 2);
      p.text('상', -0.06, 1, P.good, { dy: 8, font: `700 11px ${P.fontBody}` });
    },
    [P, D, imgs, c, pre],
    { aspect: 1.7, maxHeight: 340 },
  );

  const imgText = imgs.map(([lo, hi]) => `[${lo.toFixed(4)}, ${hi.toFixed(4)}]`).join(' ∪ ');
  const inImage = imgs.some(([lo, hi]) => c >= lo && c <= hi);
  return (
    <Figure
      no={2}
      title="연결된 정의역, 끊긴 정의역"
      hint="정의역을 바꾸고 높이 y를 움직여 보세요"
      caption={
        <>
          굵은 곡선은 정의역 위의 <M>{'f(x) = 0.15 + 0.7x + 0.07\\sin 13x'}</M>이고, 왼쪽의 초록 막대가 그 상입니다. 점선 높이를 지나는 주황 점이 <M>{'f(x) = y'}</M>의 해입니다. 정의역을 두 조각으로 끊으면 상도 두 조각이 되고, 그 사이 높이에는 해가 없습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={dom} onChange={setDom} options={[{ value: 'whole' as DomainId, label: '[0, 1]' }, { value: 'split' as DomainId, label: '[0, 0.35] ∪ [0.65, 1]' }]} />
        <Slider id="cc2-c" label="높이 y" value={c} min={0.1} max={0.9} step={0.01} onChange={setC} format={(v) => v.toFixed(2)} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`정의역 ${dom === 'whole' ? '[0, 1]' : '[0, 0.35] ∪ [0.65, 1]'} 위의 함수 그래프. 상은 ${imgText}. 높이 ${c.toFixed(2)}에서 해 ${pre.length}개.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="cc2-readouts">
        <Readout label="상" value={<span className="mono">{imgText}</span>} />
        <Readout label="f(x) = y의 해" value={pre.length ? pre.map((x) => x.toFixed(3)).join(', ') : '없음'} color={pre.length ? undefined : 'var(--bad)'} />
      </div>
      <div className="tp-note" data-bad={!inImage || undefined} aria-live="polite">
        {inImage ? `y = ${c.toFixed(2)}는 상 안에 있으므로 해가 ${pre.length}개 있습니다.` : `y = ${c.toFixed(2)}는 상의 두 조각 사이에 있어 해가 없습니다. 정의역이 연결되어 있지 않으면 중간값 정리가 성립하지 않습니다.`}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the topologist's sine curve ─────────────── */

function SineFigure() {
  const P = usePalette();
  const [lg, setLg] = useState(-2); // log10 of ε, how close the walker has come to the segment
  const eps = Math.pow(10, lg);
  const W = Math.min(1, 25 * eps);
  const zeros = zerosFrom(eps);
  const len = useMemo(() => arcLength(eps), [eps]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -0.06 * W, xMax: W, yMin: -1.35, yMax: 1.35, pad: { l: 36, r: 12, t: 12, b: 28 } });
      p.grid({ yStep: 0.5, fmt: (v) => (Math.abs(v) < 1e-12 ? '0' : Math.abs(v) < 0.01 ? v.toExponential(0) : String(+v.toFixed(4))) });
      // where the waves are thinner than about 3 pixels, draw them as a solid band
      const pxPerUnit = p.pw / (p.xMax - p.xMin);
      const xb = Math.sqrt(3 / (2 * Math.PI * pxPerUnit));
      p.clip();
      if (xb > 0) {
        ctx.fillStyle = alpha(P.ink3, 0.35);
        ctx.fillRect(p.X(0), p.Y(1), p.X(Math.min(xb, W)) - p.X(0), p.Y(-1) - p.Y(1));
      }
      const drawPart = (from: number, to: number, color: string, width: number) => {
        if (to <= from) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        // sample evenly in t = 1/x so every wave gets the same number of points
        const t0 = 1 / to, t1 = 1 / from;
        const n = Math.min(40000, Math.max(400, Math.ceil((t1 - t0) * 40)));
        for (let k = 0; k <= n; k++) {
          const t = t0 + ((t1 - t0) * k) / n;
          const x = 1 / t;
          if (k) ctx.lineTo(p.X(x), p.Y(Math.sin(t)));
          else ctx.moveTo(p.X(x), p.Y(Math.sin(t)));
        }
        ctx.stroke();
      };
      const lo = Math.max(xb, 1e-6);
      drawPart(lo, Math.min(W, eps), alpha(P.ink3, 0.7), 1.2);
      drawPart(Math.max(lo, eps), W, P.accent, 2);
      p.unclip();
      // the segment {0} × [−1, 1]
      p.line(0, -1, 0, 1, P.pos, 5);
      p.dot(eps, Math.sin(1 / eps), 6, P.accent, P.surface, 2);
      p.text('S의 선분', 0, 1, P.pos, { dx: 6, dy: -8, align: 'left', font: `600 11px ${P.fontBody}`, bg: P.surface });
    },
    [P, W, eps],
    { aspect: 1.8, maxHeight: 320 },
  );

  return (
    <Figure
      no={3}
      title="선분에 닿으려는 길"
      hint="ε을 줄여 선분 쪽으로 다가가 보세요"
      caption={
        <>
          파란 곡선은 <M>{'y = \\sin(1/x)'}</M>에서 길을 따라 x = 1부터 x = ε까지 온 부분이고, 주황 선분이 <M>{'\\{0\\} \\times [-1, 1]'}</M>입니다. 보이는 범위는 ε의 25배로 맞춰 확대됩니다. 물결이 화면의 3픽셀보다 촘촘해지는 곳은 회색 띠로 칠했습니다. ε를 아무리 줄여도 앞에는 물결이 남아 있고, 지나온 길이는 끝없이 늘어납니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="cc2-eps" label="ε (선분까지 남은 거리)" value={lg} min={-3} max={0} step={0.05} onChange={setLg} format={() => (eps >= 0.01 ? eps.toFixed(3) : eps.toExponential(2))} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`위상수학자의 사인 곡선. x = 1부터 x = ${eps.toPrecision(3)}까지 따라온 길이 ${len.toFixed(2)}, 지나온 물결의 0점 ${zeros}개.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="cc2-readouts">
        <Readout label="지나온 0점" value={`${zeros}개`} />
        <Readout label="지나온 길이" value={len.toFixed(2)} />
        <Readout label="선분까지 거리" value={eps >= 0.01 ? eps.toFixed(3) : eps.toExponential(2)} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: two theorems that come from connectedness ─────────────── */

function TemperaturePanel() {
  const P = usePalette();
  const [seed, setSeed] = useState(1);
  const T = useMemo(() => temperature(seed), [seed]);
  const found = useMemo(() => antipodal(T), [T]);
  const [th, setTh] = useState(0);
  const g = T(th) - T(th + Math.PI);
  const deg = (v: number) => `${((v * 180) / Math.PI).toFixed(1)}°`;

  const range = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 720; k++) {
      const v = T((2 * Math.PI * k) / 720);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    return { lo, hi };
  }, [T]);

  const circle = useCanvas2D(
    (ctx, { w, h }) => {
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 22;
      // colour the ring from blue (cold) to orange (warm)
      for (let k = 0; k < 360; k++) {
        const a0 = (2 * Math.PI * k) / 360, a1 = (2 * Math.PI * (k + 1.2)) / 360;
        const u = (T(a0) - range.lo) / (range.hi - range.lo);
        ctx.strokeStyle = u < 0.5 ? alpha(P.neg, 0.25 + 1.3 * (0.5 - u)) : alpha(P.pos, 0.25 + 1.3 * (u - 0.5));
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(cx, cy, R, -a0, -a1, true);
        ctx.stroke();
      }
      const pt = (a: number): [number, number] => [cx + R * Math.cos(a), cy - R * Math.sin(a)];
      const [x1, y1] = pt(th), [x2, y2] = pt(th + Math.PI);
      ctx.strokeStyle = Math.abs(g) < 0.05 ? P.good : P.ink2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        ctx.fillStyle = P.surface;
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = P.ink2;
      ctx.font = `600 11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${T(th).toFixed(1)}°C`, cx + (R - 34) * Math.cos(th), cy - (R - 34) * Math.sin(th));
      ctx.fillText(`${T(th + Math.PI).toFixed(1)}°C`, cx + (R - 34) * Math.cos(th + Math.PI), cy - (R - 34) * Math.sin(th + Math.PI));
    },
    [P, T, th, g, range],
    { aspect: 1, maxHeight: 280 },
  );

  const plot = useCanvas2D(
    (ctx, { w, h }) => {
      let m = 0;
      for (let k = 0; k <= 360; k++) m = Math.max(m, Math.abs(T((Math.PI * 2 * k) / 360) - T((Math.PI * 2 * k) / 360 + Math.PI)));
      const top = Math.ceil(m / 5) * 5;
      const p = new Plot(ctx, w, h, P, { xMin: 0, xMax: 2 * Math.PI, yMin: -top, yMax: top, pad: { l: 36, r: 10, t: 12, b: 28 } });
      p.grid({ xStep: Math.PI / 2, yStep: 5, fmt: (v) => (Math.abs(v) > 0.5 && Math.abs(v - Math.round(v)) > 1e-6 ? `${Math.round((v * 180) / Math.PI)}°` : String(Math.round(v))) });
      p.line(0, 0, 2 * Math.PI, 0, alpha(P.ink, 0.5), 1);
      p.fn((t) => T(t) - T(t + Math.PI), P.accent, 2.2, { samples: 500 });
      p.dot(found.theta, 0, 5, P.good, P.surface, 2);
      p.dot(found.theta + Math.PI, 0, 5, P.good, P.surface, 2);
      p.dot(th % (2 * Math.PI), g, 5, P.ink, P.surface, 2);
      p.text('T(θ) − T(θ + π)', 0, top, P.ink3, { dx: 4, dy: 10, align: 'left', font: `600 11px ${P.fontBody}`, bg: P.surface });
    },
    [P, T, th, g, found],
    { aspect: 1.5, maxHeight: 260 },
  );

  return (
    <>
      <div className="controls row">
        <Slider id="cc2-th" label="지름의 방향 θ" value={th} min={0} max={2 * Math.PI} step={0.005} onChange={setTh} format={deg} />
        <Button small primary onClick={() => setTh(found.theta)}>
          같은 온도인 지름 찾기
        </Button>
        <Button small onClick={() => { setSeed((s) => s + 1); setTh(0); }}>
          다른 온도 분포
        </Button>
      </div>
      <div className="fig-split">
        <div ref={circle.wrapRef} className="canvas-box" role="img" aria-label={`원 둘레의 온도. 방향 ${deg(th)}의 점은 ${T(th).toFixed(2)}°C, 반대편 점은 ${T(th + Math.PI).toFixed(2)}°C입니다.`}>
          <canvas ref={circle.canvasRef} />
        </div>
        <div ref={plot.wrapRef} className="canvas-box" role="img" aria-label={`지름 방향에 따른 온도 차 그래프. θ = ${deg(found.theta)}와 그 반대편에서 0이 됩니다.`}>
          <canvas ref={plot.canvasRef} />
        </div>
      </div>
      <div className="cc2-readouts">
        <Readout label="T(θ)" value={`${T(th).toFixed(2)}°C`} />
        <Readout label="T(θ + π)" value={`${T(th + Math.PI).toFixed(2)}°C`} />
        <Readout label="차이" value={g.toFixed(2)} color={Math.abs(g) < 0.05 ? 'var(--good)' : undefined} />
      </div>
    </>
  );
}

function PancakePanel() {
  const P = usePalette();
  const { A, B } = useMemo(() => pancakes(), []);
  const found = useMemo(() => sandwich(A, B), [A, B]);
  const [phi, setPhi] = useState(0);
  const cut = useMemo(() => cutAt(A, B, phi), [A, B, phi]);
  const curve = useMemo(() => Array.from({ length: 181 }, (_, k) => cutAt(A, B, (Math.PI * k) / 180).shareB), [A, B]);
  const deg = (v: number) => `${((v * 180) / Math.PI).toFixed(1)}°`;

  const scene = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -3, xMax: 3, yMin: -2, yMax: 2, pad: { l: 8, r: 8, t: 8, b: 8 }, equal: true });
      const nx = Math.cos(phi), ny = Math.sin(phi);
      const r = 0.035;
      for (const [x, y] of A) {
        ctx.fillStyle = x * nx + y * ny > cut.t ? alpha(P.neg, 0.9) : alpha(P.neg, 0.35);
        ctx.fillRect(p.X(x - r), p.Y(y + r), p.X(x + r) - p.X(x - r), p.Y(y - r) - p.Y(y + r));
      }
      for (const [x, y] of B) {
        ctx.fillStyle = x * nx + y * ny > cut.t ? alpha(P.pos, 0.9) : alpha(P.pos, 0.35);
        ctx.fillRect(p.X(x - r), p.Y(y + r), p.X(x + r) - p.X(x - r), p.Y(y - r) - p.Y(y + r));
      }
      // the cutting line {p · n = t}, drawn across the whole view
      const px = cut.t * nx, py = cut.t * ny;
      p.line(px - 6 * ny, py + 6 * nx, px + 6 * ny, py - 6 * nx, P.ink, 2);
      p.arrow(px, py, px + 0.6 * nx, py + 0.6 * ny, P.ink2, 1.5, 7);
    },
    [P, A, B, phi, cut],
    { aspect: 1.5, maxHeight: 280 },
  );

  const plot = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: 0, xMax: Math.PI, yMin: 0, yMax: 1, pad: { l: 36, r: 10, t: 12, b: 28 } });
      p.grid({ xStep: Math.PI / 4, yStep: 0.25, fmt: (v) => (v > 1.0001 || (v > 0 && v < 1 && Math.abs(v * 4 - Math.round(v * 4)) > 1e-6) ? `${Math.round((v * 180) / Math.PI)}°` : String(v)) });
      p.line(0, 0.5, Math.PI, 0.5, alpha(P.ink, 0.5), 1, [4, 4]);
      ctx.strokeStyle = P.pos;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      curve.forEach((v, k) => (k ? ctx.lineTo(p.X((Math.PI * k) / 180), p.Y(v)) : ctx.moveTo(p.X(0), p.Y(v))));
      ctx.stroke();
      p.dot(found.phi, found.shareB, 5, P.good, P.surface, 2);
      p.dot(phi, cut.shareB, 5, P.ink, P.surface, 2);
      p.text('화살표 쪽 B의 몫', 0, 1, P.ink3, { dx: 4, dy: 10, align: 'left', font: `600 11px ${P.fontBody}`, bg: P.surface });
    },
    [P, curve, found, phi, cut],
    { aspect: 1.5, maxHeight: 260 },
  );

  const plus = Math.round(cut.shareB * B.length);
  return (
    <>
      <div className="controls row">
        <Slider id="cc2-phi" label="자르는 방향 φ" value={phi} min={0} max={Math.PI} step={0.002} onChange={setPhi} format={deg} />
        <Button small primary onClick={() => setPhi(found.phi)}>
          둘 다 반으로 자르는 방향 찾기
        </Button>
      </div>
      <div className="fig-split">
        <div ref={scene.wrapRef} className="canvas-box" role="img" aria-label={`파란 타원과 주황 초승달. 방향 ${deg(phi)}의 직선이 파란 모양을 반으로 자르고, 화살표 쪽에 주황 모양의 ${(cut.shareB * 100).toFixed(1)}%가 있습니다.`}>
          <canvas ref={scene.canvasRef} />
        </div>
        <div ref={plot.wrapRef} className="canvas-box" role="img" aria-label={`방향 φ에 따라 화살표 쪽에 있는 주황 모양의 몫. φ = ${deg(found.phi)}에서 0.5를 지납니다.`}>
          <canvas ref={plot.canvasRef} />
        </div>
      </div>
      <div className="cc2-readouts">
        <Readout label="파란 모양 (화살표 쪽)" value="50%" />
        <Readout label="주황 모양 (화살표 쪽)" value={`${(cut.shareB * 100).toFixed(1)}% (${plus}/${B.length}점)`} color={Math.abs(cut.shareB - 0.5) < 0.005 ? 'var(--good)' : undefined} />
      </div>
    </>
  );
}

function ApplicationsFigure() {
  const [mode, setMode] = useState<'temp' | 'cake'>('temp');
  return (
    <Figure
      no={4}
      title="중간값 정리로 증명하는 두 가지"
      hint="방향을 돌리며 조건이 맞는 곳을 찾아보세요"
      caption={
        mode === 'temp' ? (
          <>원 둘레의 온도는 씨앗을 정한 난수로 만든 매끄러운 분포입니다(파랑은 차갑고 주황은 따뜻함). 지름의 방향 θ를 돌리면 양 끝의 온도 차 <M>{'g(\\theta) = T(\\theta) - T(\\theta + \\pi)'}</M>가 오른쪽 그래프를 따라 움직이고, 초록 점이 g = 0인 곳입니다.</>
        ) : (
          <>파란 타원과 주황 초승달은 한 변이 0.05인 격자점으로 그렸습니다. 방향 φ마다 파란 모양을 정확히 반으로 가르는 직선을 긋고, 화살표 쪽에 놓인 주황 모양의 몫을 오른쪽 그래프에 찍었습니다. 몫이 0.5를 지나는 초록 점의 방향에서는 직선 하나가 두 모양을 동시에 반으로 자릅니다.</>
        )
      }
    >
      <div className="controls row">
        <Seg value={mode} onChange={setMode} options={[{ value: 'temp' as const, label: '마주 보는 두 점의 온도' }, { value: 'cake' as const, label: '두 팬케이크 자르기' }]} />
      </div>
      {mode === 'temp' ? <TemperaturePanel /> : <PancakePanel />}
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Connectedness() {
  // numbers quoted in the prose, computed from the same functions as the figures
  const { a1, sw, at90, nB } = useMemo(() => {
    const { A, B } = pancakes();
    return { a1: antipodal(temperature(1)), sw: sandwich(A, B), at90: cutAt(A, B, Math.PI / 2).shareB, nB: B.length };
  }, []);
  return (
    <>
      <h2>한 덩어리라는 것</h2>
      <p>
        원판 두 개는 두 조각이고, 둘을 막대로 이은 아령은 한 조각입니다. 눈으로는 쉬운 이 구별을 열린 집합만으로 정확하게 말하는 것이 이 장의 일입니다. 생각은 간단합니다. 집합을 겹치지 않는 두 열린 집합에 나눠 담을 수 있으면 두 조각으로 떨어져 있다고 봅니다.
      </p>
      <div className="cc2-thm">
        <b>정의.</b> 위상 공간 X의 <T en="separation">분리</T>란 X = U ∪ V, U ∩ V = ∅이고 U, V가 비어 있지 않은 열린 집합인 쌍 (U, V)입니다. 분리가 없으면 X를 <T en="connected">연결</T>되어 있다고 합니다. 부분집합은 부분 공간 위상으로 연결성을 따집니다.
      </div>
      <p>
        U와 V는 서로의 여집합이니 둘 다 닫힌 집합이기도 합니다. 그래서 "X가 연결되어 있다"는 "열려 있으면서 닫혀 있는 부분집합은 ∅과 X뿐이다"와 같은 말입니다. 그림 1에서 모양을 바꿔 가며 조각을 세어 보세요.
      </p>
      <PiecesFigure />
      <p>
        <strong>다리 끊긴 아령</strong>은 틈이 0.3일 때 칸 340개씩 두 조각입니다. 틈을 0으로 줄이면 한 조각으로 돌아갑니다. <strong>고리</strong>는 틈을 하나 내도 여전히 한 조각이지만, 둘을 내면 두 조각, 넷을 내면 네 조각이 됩니다. 원판은 지름을 따라 한 번만 잘라도 두 조각이 되는 것과 대조됩니다. 이 차이가 고리와 원판을 위상적으로 구별하는 첫 단서입니다.
      </p>

      <h2>구간은 연결되어 있다</h2>
      <p>
        실수의 구간이 연결되어 있다는 것은 당연해 보이지만, 유리수만 있는 세계에서는 거짓입니다. <M>{'\\mathbb{Q}'}</M>는 <M>{'(-\\infty, \\sqrt2) \\cap \\mathbb{Q}'}</M>와 <M>{'(\\sqrt2, \\infty) \\cap \\mathbb{Q}'}</M>로 분리됩니다. 그러니 증명에는 실수의 <a href={lessonHref('math-analysis', 'real-numbers')}>완비성</a>이 들어가야 합니다.
      </p>
      <div className="cc2-thm">
        <b>정리.</b> 닫힌 구간 [0, 1]은 연결되어 있습니다.
      </div>
      <div className="cc2-proof">
        <p>
          <span className="cc2-head">증명.</span> [0, 1] = U ∪ V가 분리라고 가정하고, 0 ∈ U라고 합시다. <M>{'s = \\sup\\{ x \\in [0, 1] : [0, x] \\subseteq U \\}'}</M>로 둡니다. U가 열려 있으므로 0 근처의 작은 구간이 U에 들어 있어 s &gt; 0입니다.
        </p>
        <p>
          s ∈ U라면, U가 열려 있으니 어떤 r &gt; 0에 대해 <M>{'(s - r, s + r) \\cap [0, 1] \\subseteq U'}</M>입니다. 상한의 정의에서 [0, s − r/2] ⊆ U이므로 [0, min(s + r/2, 1)] ⊆ U가 됩니다. s &lt; 1이면 이는 s가 상한이라는 데 모순이고, s = 1이면 [0, 1] ⊆ U라서 V가 비게 됩니다.
        </p>
        <p>
          s ∈ V라면, V가 열려 있으니 <M>{'(s - r, s + r) \\cap [0, 1] \\subseteq V'}</M>인 r &gt; 0이 있습니다. 상한의 정의에서 s − r보다 크고 [0, x] ⊆ U인 x가 있으니 (s − r, s) 안의 점이 U에도 V에도 속해 U ∩ V = ∅에 모순입니다. 어느 쪽이든 모순이므로 분리는 없습니다. <span className="cc2-qed">∎</span>
        </p>
      </div>

      <h2>연속 함수는 연결을 지킨다</h2>
      <div className="cc2-thm">
        <b>정리.</b> X가 연결되어 있고 <M>{'f: X \\to Y'}</M>가 연속이면 상 f(X)도 연결되어 있습니다.
      </div>
      <div className="cc2-proof">
        <p>
          <span className="cc2-head">증명.</span> f(X)가 열린 집합 U, V로 분리된다고 합시다. 연속 함수에서 열린 집합의 역상은 열려 있으므로 <M>{'f^{-1}(U)'}</M>와 <M>{'f^{-1}(V)'}</M>는 X의 열린 집합입니다. 둘은 겹치지 않고(한 점이 U와 V에 동시에 가지 않으므로), 합하면 X이고, U와 V가 f(X)의 점을 담고 있으니 둘 다 비어 있지 않습니다. 이는 X의 분리이므로 X가 연결되어 있다는 데 모순입니다. <span className="cc2-qed">∎</span>
        </p>
      </div>
      <p>
        실수의 연결된 부분집합은 구간뿐입니다(a &lt; c &lt; b인데 a, b가 집합에 있고 c가 없다면 <M>{'(-\\infty, c)'}</M>와 <M>{'(c, \\infty)'}</M>가 분리를 만듭니다). 두 사실을 합치면 <a href={lessonHref('math-analysis', 'continuity')}>해석학의 연속 함수 장</a>에서 상한으로 증명한 중간값 정리가 따름정리로 나옵니다.
      </p>
      <MB>{'f: [a, b] \\to \\mathbb{R} \\text{ 연속} \\;\\Rightarrow\\; f([a, b]) \\text{는 구간} \\;\\Rightarrow\\; f(a)\\text{와 } f(b) \\text{ 사이의 모든 값을 지난다}'}</MB>
      <ImageFigure />
      <p>
        정의역이 [0, 1]이면 상은 [0.1500, 0.8794]라는 구간 하나이고, 그 안의 어떤 높이에도 해가 있습니다. y = 0.32에서는 함수가 오르내리는 탓에 해가 0.150, 0.238, 0.338 세 개입니다. 정의역을 [0, 0.35] ∪ [0.65, 1]로 끊으면 상도 [0.1500, 0.3266] ∪ [0.6501, 0.8794]로 끊어지고, 기본값 y = 0.50처럼 그 사이의 높이에는 해가 없습니다. 정리에서 연속성만큼이나 정의역의 연결성이 중요하다는 뜻입니다.
      </p>
      <Callout kind="intuition">
        이 정리는 두 공간이 위상 동형이 아님을 보이는 도구가 됩니다. [0, 1]에서 가운데 점 하나를 빼면 두 조각이 되지만, 원에서는 어떤 점 하나를 빼도 한 조각으로 남습니다. 위상 동형 사상은 점 하나를 뺀 공간끼리도 위상 동형으로 보내야 하므로, 구간과 원은 위상 동형일 수 없습니다.
      </Callout>

      <h2>이어져 있지만 걸어서 갈 수 없는 곳</h2>
      <p>
        더 직관적인 정의도 있습니다. 두 점마다 그 둘을 잇는 연속 곡선(<M>{'\\gamma: [0, 1] \\to X'}</M>)이 있으면 X를 <T en="path-connected">경로 연결</T>되어 있다고 합니다. 경로의 상은 [0, 1]의 연속 상이라 연결되어 있으므로, 경로 연결이면 연결입니다. 그 반대는 성립하지 않습니다. 대표적인 반례가 <T en="topologist's sine curve">위상수학자의 사인 곡선</T>입니다.
      </p>
      <MB>{'S = \\{ (x, \\sin(1/x)) : 0 < x \\le 1 \\} \\;\\cup\\; \\{0\\} \\times [-1, 1]'}</MB>
      <SineFigure />
      <p>
        ε = 0.01까지 오면 sin(1/x)의 0점을 31개 지나고 길이 63.01을 걸었습니다. ε = 0.001이면 0점 318개, 길이 636.35입니다. 길이는 대략 0.64/ε로 늘어나서 선분에 닿기 전에 끝없이 길어집니다. 이것을 정확히 하면 다음과 같습니다. 곡선 위의 점에서 선분 위의 점으로 가는 경로 γ가 있다고 하고, γ(t₀)가 처음으로 선분에 닿는 순간을 t₀라 합시다. t가 t₀로 다가갈 때 γ(t)의 x 좌표는 0으로 가는데, 그동안 y = sin(1/x)는 −1과 1 사이를 무한히 오가므로 γ(t)의 y 좌표가 수렴할 수 없습니다. 이는 γ의 연속성에 모순입니다.
      </p>
      <p>
        그런데도 S는 연결되어 있습니다. 곡선 부분은 (0, 1]의 연속 상이라 연결되어 있고, 선분의 모든 점은 곡선 부분에 한없이 가깝습니다(곡선 부분의 폐포가 S 전체). 연결 집합의 폐포는 연결되어 있으므로 S도 연결되어 있습니다. 직관이 말하는 "이어져 있음"에는 두 가지 뜻이 섞여 있었던 셈입니다.
      </p>

      <h2>연결성이 증명해 주는 것들</h2>
      <p>
        중간값 정리는 "어딘가에 반드시 있다"는 존재 증명을 만드는 데 자주 쓰입니다. 그림 4에 두 예가 있습니다. 첫째, 지구의 적도처럼 원 위에서 온도가 연속적으로 변하면 정확히 반대편에 있는 두 점의 온도가 같은 곳이 반드시 있습니다. <M>{'g(\\theta) = T(\\theta) - T(\\theta + \\pi)'}</M>는 연속이고 <M>{'g(\\theta + \\pi) = -g(\\theta)'}</M>이므로 [0, π]에서 부호가 바뀌거나 0이 되고, 중간값 정리가 g = 0인 θ를 줍니다.
      </p>
      <ApplicationsFigure />
      <p>
        처음 온도 분포에서는 θ = 0일 때 양 끝의 차이가 {a1.g0.toFixed(2)}°C이고, θ = {((a1.theta * 180) / Math.PI).toFixed(1)}°에서 두 점이 모두 {a1.temp.toFixed(2)}°C가 됩니다. 둘째는 <T en="pancake theorem">팬케이크 정리</T>입니다. 평면에 모양 두 개가 놓여 있으면 직선 하나로 둘을 동시에 넓이가 같은 두 쪽으로 자를 수 있습니다. 방향 φ마다 파란 모양을 반으로 자르는 직선은 (중간값 정리로) 있고, 그 직선의 화살표 쪽에 놓인 주황 모양의 몫을 h(φ)라 하면 방향을 반대로 돌렸을 때 <M>{'h(\\varphi + \\pi) = 1 - h(\\varphi)'}</M>입니다. 그림에서 φ = 0일 때 몫은 1이고 φ = 90°에서는 {at90.toFixed(3)}이므로, 그 사이 φ = {((sw.phi * 180) / Math.PI).toFixed(1)}°에서 0.5를 지납니다. 격자점으로 센 몫이라 정확히 0.5 대신 {nB}점 중 {Math.round(sw.shareB * nB)}점이 나옵니다.
      </p>
      <Callout kind="note">
        팬케이크 정리를 3차원으로 올리면 햄 샌드위치 정리가 됩니다. 빵 두 장과 햄 한 장이 아무렇게나 놓여 있어도 평면 하나로 셋을 동시에 반으로 자를 수 있습니다. 증명에는 구간의 연결성 대신 구면 위 연속 함수에 관한 보르수크-울람 정리가 쓰입니다.
      </Callout>

      <Callout kind="key">
        겹치지 않는 두 열린 집합으로 나눌 수 없는 공간이 연결 공간입니다. 구간 [0, 1]은 완비성 덕분에 연결되어 있고, 연속 함수는 연결 집합을 연결 집합으로 보내므로 중간값 정리가 따라 나옵니다. 경로로 이을 수 있으면 연결이지만 반대는 아니어서, 위상수학자의 사인 곡선은 연결되어 있으면서 곡선에서 선분까지 가는 경로가 없습니다. 연결성은 위상 동형으로 보존되므로 점 하나를 뺐을 때 몇 조각이 되는지로 공간을 구별할 수 있습니다.
      </Callout>
      <Quiz
        q="실수 직선 ℝ과 평면 ℝ²가 위상 동형이 아님을 보이는 가장 간단한 논증은?"
        options={['ℝ²는 ℝ보다 점이 더 많다', 'ℝ에서 한 점을 빼면 연결되지 않지만 ℝ²에서 한 점을 빼도 연결되어 있다', 'ℝ는 유계가 아니고 ℝ²는 유계이다', 'ℝ²의 열린 공은 원판이고 ℝ의 열린 공은 구간이다']}
        answer={1}
        explain={<>위상 동형 사상 f: ℝ → ℝ²가 있다면, 점 0을 뺀 ℝ \ {'{0}'}과 ℝ² \ {'{f(0)}'}도 위상 동형이어야 합니다. 앞의 것은 (−∞, 0)과 (0, ∞) 두 조각이고 뒤의 것은 한 조각이므로 모순입니다. ℝ과 ℝ²는 점의 개수(기수)가 같고, 둘 다 유계가 아니며, 열린 공의 모양은 거리에 따라 달라지는 성질이라 위상 동형을 가르는 근거가 되지 않습니다.</>}
      />
    </>
  );
}
