import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { colorOf } from './cplx';
import { CAUCHY_FNS, FNS, MOD_FNS, cauchyFormula, closedSpline, contourIntegral, diskMax, powerOnCircle, winding, type CauchyId, type FnId, type ModId } from './contour';
import { cabs, fromPolar, scale, sub, type C } from './series';
import './complex.css';
import './contour.css';

const nf = (v: number, d = 4) => {
  const s = v.toFixed(d);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
};
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '' };
const sci = (v: number) => {
  if (v === 0) return '0';
  if (Math.abs(v) >= 1e-3 && Math.abs(v) < 1e4) return nf(v, 4);
  const [m, e] = v.toExponential(1).split('e');
  return `${m}×10${e.split('').map((ch) => SUP[ch] ?? ch).join('')}`;
};
/** A complex value, with parts below 5e-5 shown as 0 so rounding noise doesn't read as a result. */
const fmtC = (z: C, d = 4) => {
  const re = Math.abs(z[0]) < 5e-5 ? 0 : z[0];
  const im = Math.abs(z[1]) < 5e-5 ? 0 : z[1];
  if (im === 0) return nf(re, d);
  if (re === 0) return `${nf(im, d)}i`;
  return `${nf(re, d)} ${im < 0 ? '−' : '+'} ${nf(Math.abs(im), d)}i`;
};

function Proof({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ci-proof" role="note" aria-label={title}>
      <span className="ci-proof-head">{title}</span>
      {children}
    </div>
  );
}
const Qed = () => <span className="ci-qed">∎</span>;

/** A closed path drawn with a few arrowheads showing its direction. */
function drawPath(p: Plot, path: C[], color: string, width = 2.5) {
  const ctx = p.ctx;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  path.forEach(([x, y], i) => (i ? ctx.lineTo(p.X(x), p.Y(y)) : ctx.moveTo(p.X(x), p.Y(y))));
  ctx.closePath();
  ctx.stroke();
  const n = path.length;
  for (let k = 0; k < 6; k++) {
    const i = Math.floor((k * n) / 6);
    const a = path[i], b = path[(i + 3) % n];
    const ang = Math.atan2(-(b[1] - a[1]) * p.sy, (b[0] - a[0]) * p.sx);
    const x = p.X(a[0]), y = p.Y(a[1]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 9 * Math.cos(ang), y + 9 * Math.sin(ang));
    ctx.lineTo(x + 9 * Math.cos(ang + 2.5), y + 9 * Math.sin(ang + 2.5));
    ctx.lineTo(x + 9 * Math.cos(ang - 2.5), y + 9 * Math.sin(ang - 2.5));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** A singularity marker: a small ✕. */
function cross(p: Plot, P: Palette, z: C, label?: string) {
  const ctx = p.ctx, x = p.X(z[0]), y = p.Y(z[1]);
  ctx.save();
  ctx.strokeStyle = P.bad;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 6);
  ctx.lineTo(x + 6, y + 6);
  ctx.moveTo(x + 6, y - 6);
  ctx.lineTo(x - 6, y + 6);
  ctx.stroke();
  ctx.restore();
  if (label) p.text(label, z[0], z[1], P.bad, { dx: 8, dy: 12, font: `600 11px ${P.fontMono}` });
}

/* ─────────────── Figure 1: ∮ zⁿ dz on a circle ─────────────── */

const POWERS = [-3, -2, -1, 0, 1, 2];

function PowerFigure() {
  const P = usePalette();
  const [n, setN] = useState(-1);
  const [r, setR] = useState(1);
  const res = useMemo(() => powerOnCircle(n, r), [n, r]);
  const table = useMemo(() => POWERS.map((k) => ({ k, v: powerOnCircle(k, r).value })), [r]);

  const left = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -2.7, xMax: 2.7, yMin: -2.7, yMax: 2.7, equal: true, pad: { l: 26, r: 8, t: 8, b: 22 } });
      p.grid({ labels: true, xStep: 1, yStep: 1 });
      drawPath(p, Array.from({ length: 200 }, (_, j) => fromPolar(r, (2 * Math.PI * j) / 200)), P.accent);
      if (n < 0) cross(p, P, [0, 0]);
    },
    [P, n, r],
    { aspect: 1, maxHeight: 300 },
  );

  const right = useCanvas2D(
    (ctx, { w, h }) => {
      // fit the running sum, always including 0 and 2πi so scales are comparable
      let x0 = -1, x1 = 1, y0 = -1, y1 = 7;
      for (const q of res.running) {
        x0 = Math.min(x0, q[0]);
        x1 = Math.max(x1, q[0]);
        y0 = Math.min(y0, q[1]);
        y1 = Math.max(y1, q[1]);
      }
      const p = new Plot(ctx, w, h, P, { xMin: x0 - 0.5, xMax: x1 + 0.5, yMin: y0 - 0.5, yMax: y1 + 0.5, equal: true, pad: { l: 26, r: 8, t: 8, b: 22 } });
      p.grid({ labels: true });
      p.line(0, 2 * Math.PI, 0.25, 2 * Math.PI, P.ink3, 1);
      p.text('2πi', 0.3, 2 * Math.PI, P.ink3, { base: 'middle', font: `10px ${P.fontMono}` });
      ctx.save();
      ctx.strokeStyle = P.pos;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      res.running.forEach(([x, y], i) => (i ? ctx.lineTo(p.X(x), p.Y(y)) : ctx.moveTo(p.X(x), p.Y(y))));
      ctx.stroke();
      ctx.restore();
      p.dot(0, 0, 4, P.ink, P.surface);
      p.dot(res.value[0], res.value[1], 6, P.pos, P.surface);
    },
    [P, res],
    { aspect: 1, maxHeight: 300 },
  );

  return (
    <Figure
      no={1}
      title="원을 한 바퀴 돌며 zⁿ dz를 더하기"
      hint="거듭제곱 n과 반지름을 바꿔 보세요"
      caption={
        <>
          첫째 그림(넓은 화면에서는 왼쪽)은 반지름 r인 원을 시계 반대 방향으로 한 바퀴 도는 경로입니다. 둘째 그림은 경로를 따라가며 작은 조각 <M>{'z^n\\,dz'}</M>를 하나씩 더해 갈 때 그 합이 복소 평면에서 그리는 자취로, 0에서 출발해 주황 점에서 끝납니다. 원을 400조각으로 나눠 각도에 대한 사다리꼴 규칙으로 계산했습니다.
        </>
      }
    >
      <div className="ci-two">
        <div ref={left.wrapRef} className="canvas-box" role="img" aria-label={`반지름 ${nf(r, 2)}인 원을 시계 반대 방향으로 도는 경로.`}>
          <canvas ref={left.canvasRef} />
        </div>
        <div ref={right.wrapRef} className="canvas-box" role="img" aria-label={`z의 ${n}제곱을 원을 따라 더한 합의 자취. 끝값은 ${fmtC(res.value)}입니다.`}>
          <canvas ref={right.canvasRef} />
        </div>
      </div>
      <div className="controls row">
        <Seg label="n" value={n} onChange={setN} options={POWERS.map((k) => ({ value: k, label: String(k) }))} />
        <Slider id="ci-r" label="반지름 r" value={r} min={0.3} max={2.5} step={0.05} onChange={setR} format={(v) => nf(v, 2)} />
      </div>
      <div className="tbl-wrap">
        <table className="ci-table ci-narrow">
          <thead>
            <tr>
              <th>n</th>
              <th>∮ zⁿ dz (반지름 {nf(r, 2)})</th>
            </tr>
          </thead>
          <tbody>
            {table.map(({ k, v }) => (
              <tr key={k}>
                <td className="mono" data-on={k === n || undefined}>
                  {k}
                </td>
                <td className="mono" data-on={k === n || undefined}>
                  {fmtC(v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: drag a closed path ─────────────── */

type Preset = 'once' | 'away' | 'twice';
const PENT = [0, 1, 2, 3, 4].map((k) => fromPolar(1.3, Math.PI / 2 + (2 * Math.PI * k) / 5));
const PRESETS: Record<Preset, { name: string; pts: C[] }> = {
  once: { name: '0을 한 번 감기', pts: [[0.75, 0.1], [0.15, 0.95], [-1, 0.55], [-0.85, -0.75], [0.35, -0.8]] },
  away: { name: '0을 비켜 가기', pts: [[2.0, 0.9], [1.2, 1.2], [0.4, 0.7], [0.6, -0.6], [1.8, -0.7]] },
  twice: { name: '0을 두 번 감기', pts: [0, 2, 4, 1, 3].map((k) => PENT[k]) },
};
const BOX = 2.4;

function PathFigure() {
  const P = usePalette();
  const [pts, setPts] = useState<C[]>(PRESETS.once.pts);
  const [fid, setFid] = useState<FnId>('inv');
  const [sel, setSel] = useState(0);
  const plotRef = useRef<Plot | null>(null);
  const path = useMemo(() => closedSpline(pts, 160), [pts]);
  const F = FNS[fid];
  const value = useMemo(() => contourIntegral(F.f, path).value, [F, path]);
  const w0 = winding(path, [0, 0]);
  const w1 = winding(path, [1, 0]);
  const predicted = 2 * Math.PI * F.poles.reduce((s, z) => s + winding(path, z), 0);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -BOX, xMax: BOX, yMin: -BOX, yMax: BOX, equal: true, pad: { l: 26, r: 8, t: 8, b: 22 } });
      plotRef.current = p;
      p.grid({ labels: true, xStep: 1, yStep: 1 });
      drawPath(p, path, P.accent);
      F.poles.forEach((z) => cross(p, P, z, z[0] === 0 ? '0' : '1'));
      if (!F.poles.length) {
        p.dot(0, 0, 3, P.ink3);
        p.dot(1, 0, 3, P.ink3);
      }
      pts.forEach(([x, y], i) => p.dot(x, y, i === sel ? 8 : 6.5, i === sel ? P.hl : P.surface, P.ink, 2));
    },
    [P, path, F, pts, sel],
    { aspect: 1, maxHeight: 400 },
  );
  useDrag(wrapRef, {
    hit: (sx, sy) => {
      const p = plotRef.current;
      if (!p) return null;
      let best = -1, bd = 18;
      pts.forEach(([x, y], i) => {
        const d = Math.hypot(p.X(x) - sx, p.Y(y) - sy);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best >= 0 ? best : null;
    },
    onDrag: (id, sx, sy) => {
      const p = plotRef.current;
      if (!p) return;
      const i = Number(id);
      setSel(i);
      const q: C = [Math.max(-BOX, Math.min(BOX, Math.round(p.invX(sx) * 20) / 20)), Math.max(-BOX, Math.min(BOX, Math.round(p.invY(sy) * 20) / 20))];
      setPts((old) => old.map((o, k) => (k === i ? q : o)));
    },
  });
  const move = (axis: 0 | 1, v: number) => setPts((old) => old.map((o, k) => (k === sel ? (axis === 0 ? [v, o[1]] : [o[0], v]) : o)));

  return (
    <Figure
      no={2}
      title="경로를 바꿔도 같은 적분"
      hint="동그라미 점을 끌어 경로를 바꾸고, 함수를 바꿔 보세요"
      caption={
        <>
          파란 곡선은 동그라미 점 다섯 개를 지나는 닫힌 곡선이고(노란 점이 지금 슬라이더로 움직이는 점), 화살표가 도는 방향입니다. 빨간 ✕는 고른 함수의 특이점입니다. 적분은 곡선을 800조각으로 나눠 각 조각의 가운데에서 계산했습니다. 예측값은 각 특이점을 몇 번 감는지(감김 수)에 <M>{'2\\pi i'}</M>를 곱해 더한 값입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`닫힌 경로와 함수 ${F.name}의 경로 적분. 적분값 ${fmtC(value, 3)}, 0을 ${w0}번, 1을 ${w1}번 감습니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="함수" value={fid} onChange={setFid} options={(Object.keys(FNS) as FnId[]).map((k) => ({ value: k, label: FNS[k].name }))} />
          <div className="btn-row">
            {(Object.keys(PRESETS) as Preset[]).map((k) => (
              <Button key={k} small onClick={() => setPts(PRESETS[k].pts)}>
                {PRESETS[k].name}
              </Button>
            ))}
          </div>
          <Seg label="움직일 점" value={sel} onChange={setSel} options={pts.map((_, i) => ({ value: i, label: String(i + 1) }))} />
          <Slider id="ci-px" label="Re" value={pts[sel][0]} min={-BOX} max={BOX} step={0.05} onChange={(v) => move(0, v)} format={(v) => nf(v, 2)} />
          <Slider id="ci-py" label="Im" value={pts[sel][1]} min={-BOX} max={BOX} step={0.05} onChange={(v) => move(1, v)} format={(v) => nf(v, 2)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="∮ f dz" value={fmtC(value, 3)} color="var(--accent)" />
            <Readout label="예측 2πi·Σ감김 수" value={fmtC([0, predicted], 3)} />
            <Readout label="0을 감는 수" value={w0} />
            <Readout label="1을 감는 수" value={w1} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: Cauchy's integral formula ─────────────── */

const MS = [8, 16, 32, 64, 400];

function CauchyFigure() {
  const P = usePalette();
  const [fid, setFid] = useState<CauchyId>('exp');
  const [r, setR] = useState(1.5);
  const [z0, setZ0] = useState<C>([0.4, 0.3]);
  const [Mi, setMi] = useState(1);
  const nPts = MS[Mi];
  const plotRef = useRef<Plot | null>(null);
  const F = CAUCHY_FNS[fid];
  const inside = cabs(z0) < r;
  const direct = F.f(z0), dDirect = F.df(z0);
  const num = useMemo(() => cauchyFormula(F.f, z0, r, 0, nPts), [F, z0, r, nPts]);
  const dNum = useMemo(() => cauchyFormula(F.f, z0, r, 1, nPts), [F, z0, r, nPts]);
  const err = cabs(sub(num, direct)), dErr = cabs(sub(dNum, dDirect));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -2.3, xMax: 2.3, yMin: -2.3, yMax: 2.3, equal: true, pad: { l: 26, r: 8, t: 8, b: 22 } });
      plotRef.current = p;
      p.grid({ labels: true, xStep: 1, yStep: 1 });
      // the boundary, coloured by the values the formula uses
      const K = 240;
      for (let j = 0; j < K; j++) {
        const a = fromPolar(r, (2 * Math.PI * j) / K), b = fromPolar(r, (2 * Math.PI * (j + 1)) / K);
        const [cr, cg, cb] = colorOf(F.f(a));
        ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(p.X(a[0]), p.Y(a[1]));
        ctx.lineTo(p.X(b[0]), p.Y(b[1]));
        ctx.stroke();
      }
      // the sample points the formula actually adds up
      for (let j = 0; j < Math.min(nPts, 64); j++) {
        const a = fromPolar(r, (2 * Math.PI * j) / nPts);
        p.dot(a[0], a[1], 2.5, P.ink);
      }
      p.dot(z0[0], z0[1], 7, inside ? P.pos : P.ink3, P.surface, 2.5);
      p.text('z₀', z0[0], z0[1], P.ink, { dx: 9, dy: -9, font: `600 12px ${P.fontMono}`, bg: P.surface });
    },
    [P, F, r, z0, nPts, inside],
    { aspect: 1, maxHeight: 380 },
  );
  useDrag(wrapRef, {
    hit: () => 'z',
    onDrag: (_id, sx, sy) => {
      const p = plotRef.current;
      if (!p) return;
      setZ0([Math.max(-2.2, Math.min(2.2, Math.round(p.invX(sx) * 20) / 20)), Math.max(-2.2, Math.min(2.2, Math.round(p.invY(sy) * 20) / 20))]);
    },
  });

  return (
    <Figure
      no={3}
      title="경계의 값만으로 안쪽의 값을 알기"
      hint="z₀을 끌어 보고, 경계에서 쓰는 점의 수를 바꿔 보세요"
      caption={
        <>
          굵은 원이 경로이고, 그 색은 경계에서 f가 갖는 값입니다(색은 편각, 밝기 띠는 절댓값). 원 위의 작은 점들이 공식이 실제로 더하는 점입니다(64개가 넘으면 64개까지만 그립니다). 공식은 이 경계값만 써서 <M>{'f(z_0)'}</M>와 <M>{"f'(z_0)"}</M>를 계산하고, 직접 계산한 값과 비교합니다. 공식의 값은 주황 점이 원 안에 있을 때만 의미가 있고, <M>{'z_0'}</M>을 원 밖으로 끌어내면 공식은 0을 줍니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`반지름 ${nf(r, 2)}인 원과 점 z₀ = ${fmtC(z0, 2)}. 경계 점 ${nPts}개로 계산한 f(z₀)는 ${fmtC(num)}, 직접 계산한 값은 ${fmtC(direct)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="f(z)" value={fid} onChange={setFid} options={(Object.keys(CAUCHY_FNS) as CauchyId[]).map((k) => ({ value: k, label: CAUCHY_FNS[k].name }))} />
          <Seg label="경계의 점 수 M" value={Mi} onChange={setMi} options={MS.map((m, i) => ({ value: i, label: String(m) }))} />
          <Slider id="ci-cr" label="원의 반지름" value={r} min={0.8} max={2} step={0.05} onChange={setR} format={(v) => nf(v, 2)} />
          <Slider id="ci-zx" label="Re z₀" value={z0[0]} min={-2.2} max={2.2} step={0.05} onChange={(v) => setZ0([v, z0[1]])} format={(v) => nf(v, 2)} />
          <Slider id="ci-zy" label="Im z₀" value={z0[1]} min={-2.2} max={2.2} step={0.05} onChange={(v) => setZ0([z0[0], v])} format={(v) => nf(v, 2)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="직접 계산한 f(z₀)" value={fmtC(direct)} />
            <Readout label="경계로 계산한 f(z₀)" value={fmtC(num)} color={inside ? 'var(--pos)' : 'var(--ink-3)'} />
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="차이" value={inside ? sci(err) : '원 밖'} color={inside ? (err < 1e-6 ? 'var(--good)' : undefined) : 'var(--bad)'} />
            <Readout label="f′(z₀) 차이" value={inside ? sci(dErr) : '원 밖'} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: the maximum modulus principle ─────────────── */

function rgbOf(css: string): [number, number, number] {
  const s = css.trim();
  if (s.startsWith('#')) {
    const h = s.length === 4 ? s.slice(1).split('').map((c) => c + c).join('') : s.slice(1, 7);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = s.match(/[\d.]+/g);
  return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
}

function MaxModFigure() {
  const P = usePalette();
  const [fid, setFid] = useState<ModId>('exp');
  const [probe, setProbe] = useState<C>([0, 0]);
  const plotRef = useRef<Plot | null>(null);
  const F = MOD_FNS[fid];
  const info = useMemo(() => diskMax(F.f), [F]);
  const lo = useMemo(() => rgbOf(P.surface2), [P]);
  const hi = useMemo(() => rgbOf(P.accent), [P]);
  const pv = cabs(F.f(probe));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -1.15, xMax: 1.15, yMin: -1.15, yMax: 1.15, equal: true, pad: { l: 36, r: 8, t: 8, b: 22 } });
      plotRef.current = p;
      const bg = rgbOf(P.surface);
      p.heatmap((x, y) => {
        if (Math.hypot(x, y) > 1) return [bg[0], bg[1], bg[2], 255];
        const t = Math.min(1, cabs(F.f([x, y])) / info.max);
        // banded every 10% of the maximum, so level curves show
        const band = Math.floor(t * 10) % 2 === 0 ? 0 : 0.06;
        const u = Math.min(1, t + band);
        return [Math.round(lo[0] + (hi[0] - lo[0]) * u), Math.round(lo[1] + (hi[1] - lo[1]) * u), Math.round(lo[2] + (hi[2] - lo[2]) * u), 255];
      }, 3);
      p.grid({ labels: true, xStep: 0.5, yStep: 0.5 });
      ctx.save();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.X(0), p.Y(0), p.sx, p.sy, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      p.dot(info.at[0], info.at[1], 7, P.pos, P.surface, 2.5);
      p.text('최대', info.at[0], info.at[1], P.ink, { dx: info.at[0] > 0 ? -10 : 10, dy: -12, align: info.at[0] > 0 ? 'right' : 'left', font: `600 11px ${P.fontBody}`, bg: P.surface });
      p.dot(probe[0], probe[1], 5.5, P.ink, P.surface, 2);
    },
    [P, F, info, lo, hi, probe],
    { aspect: 1, maxHeight: 360 },
  );
  useDrag(wrapRef, {
    hit: () => 'p',
    onDrag: (_id, sx, sy) => {
      const p = plotRef.current;
      if (!p) return;
      let q: C = [p.invX(sx), p.invY(sy)];
      const m = cabs(q);
      if (m > 1) q = scale(q, 1 / m);
      setProbe([Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]);
    },
  });

  return (
    <Figure
      no={4}
      title="가장 큰 값은 언제나 가장자리에"
      hint="함수를 바꾸고, 원판 안에서 점을 끌어 |f|를 읽어 보세요"
      caption={
        <>
          단위 원판 <M>{'|z|\\le 1'}</M>에서 <M>{'|f(z)|'}</M>를 진하기로 칠했습니다. 진할수록 크고, 줄무늬 하나가 최댓값의 10%입니다. 주황 점은 원판 위 격자 약 2만 개 가운데 <M>{'|f|'}</M>가 가장 큰 곳입니다. 어떤 함수를 골라도 그 점은 경계 위에 있습니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`단위 원판에서 |${F.name}|의 크기 지도. 최댓값 ${nf(info.max)}는 |z| = ${nf(cabs(info.at), 3)}인 경계 위에 있습니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="f(z)" value={fid} onChange={setFid} options={(Object.keys(MOD_FNS) as ModId[]).map((k) => ({ value: k, label: MOD_FNS[k].name }))} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="원판 위 최대 |f|" value={nf(info.max)} color="var(--pos)" />
            <Readout label="그 위치 |z|" value={nf(cabs(info.at), 3)} />
            <Readout label="중심에서 |f(0)|" value={nf(cabs(F.f([0, 0])))} />
            <Readout label={`점 z = ${fmtC(probe, 2)}에서 |f|`} value={nf(pv)} />
          </div>
          <Legend
            items={[
              { color: 'var(--surface-2)', label: '|f| 작음', shape: 'sq' },
              { color: 'var(--accent)', label: '|f| 큼', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function ContourIntegrals() {
  return (
    <>
      <h2>경로를 따라 적분하기</h2>
      <p>
        실수의 적분은 수직선 위의 구간에서 하지만, 복소 평면에서는 시작점과 끝점 사이를 잇는 길이 무수히 많습니다. 그래서 복소 적분은 언제나 <T en="contour">경로</T>를 정해 놓고 합니다. 경로 γ를 매개변수 <M>{'z(t),\\ a\\le t\\le b'}</M>로 나타내면
      </p>
      <MB>{"\\int_\\gamma f(z)\\,dz=\\int_a^b f(z(t))\\,z'(t)\\,dt"}</MB>
      <p>
        이고, 작은 조각 <M>{'f(z)\\,\\Delta z'}</M>를 경로를 따라 더한 것의 극한입니다. 곱셈이 복소수 곱셈이라, 조각 하나하나가 크기와 방향을 바꾸는 작은 화살표가 됩니다. 시작점과 끝점이 같은 경로를 닫힌 경로라고 하고 <M>{'\\oint'}</M>로 씁니다. 가장 기본적인 예는 원점 둘레의 원 위에서 <M>{'z^n'}</M>을 적분하는 것입니다.
      </p>
      <PowerFigure />
      <p>
        표의 값은 n = −1만 빼고 모두 0입니다. 실제 계산 결과는 <M>{'10^{-16}'}</M> 정도의 반올림 오차입니다. n = −1에서는 6.2832i, 곧 <M>{'2\\pi i'}</M>가 나오고, 반지름을 0.3에서 2.5까지 바꿔도 그대로입니다. 둘째 그림의 자취를 보면 이유가 보입니다. n = 0, 1, 2에서는 합이 한 바퀴 이상 돌다가 출발점 0으로 돌아오지만, n = −1에서는 조각마다 같은 방향 <M>{'i\\,d\\theta'}</M>를 더해 위로 곧게 올라갑니다.
      </p>
      <Proof title="증명.">
        <p>
          원 <M>{'z=re^{i\\theta}'}</M>, <M>{'0\\le\\theta\\le2\\pi'}</M>에서 <M>{'dz=ire^{i\\theta}d\\theta'}</M>이므로
        </p>
        <MB>{'\\oint_{|z|=r} z^n\\,dz=\\int_0^{2\\pi} r^n e^{in\\theta}\\cdot ire^{i\\theta}\\,d\\theta = i r^{n+1}\\int_0^{2\\pi} e^{i(n+1)\\theta}\\,d\\theta.'}</MB>
        <p>
          <M>{'n=-1'}</M>이면 피적분함수가 1이어서 값은 <M>{'2\\pi i'}</M>입니다. <M>{'n\\ne-1'}</M>이면 <M>{'e^{i(n+1)\\theta}'}</M>의 원시함수 <M>{'e^{i(n+1)\\theta}/(i(n+1))'}</M>가 <M>{'\\theta=0'}</M>과 <M>{'2\\pi'}</M>에서 같은 값을 가지므로 적분은 0입니다. 어느 쪽이든 r과 상관이 없습니다. <Qed />
        </p>
      </Proof>

      <h2>코시 정리</h2>
      <p>
        <M>{'z^n'}</M>은 <M>{'n\\ge0'}</M>이면 평면 전체에서 정칙이고, 적분이 0이었습니다. 이것은 우연이 아닙니다.
      </p>
      <div className="ci-thm">
        <b>정리 (코시).</b> f가 단순 연결 영역 D에서 정칙이면, D 안의 모든 닫힌 경로 γ에 대해 <M>{'\\oint_\\gamma f(z)\\,dz=0'}</M>입니다.
      </div>
      <Proof title="증명 (f′이 연속이라고 할 때).">
        <p>
          <M>{'f=u+iv'}</M>, <M>{'dz=dx+i\\,dy'}</M>로 쓰고 실수부와 허수부를 나누면
        </p>
        <MB>{'\\oint_\\gamma f\\,dz=\\oint_\\gamma (u\\,dx-v\\,dy)+i\\oint_\\gamma (v\\,dx+u\\,dy).'}</MB>
        <p>
          γ가 감싸는 영역을 R이라 하고 각각에 <a href={lessonHref('math-multivariable', 'vector-theorems')}>그린 정리</a>를 쓰면 두 적분은 <M>{'\\iint_R(-v_x-u_y)\\,dA'}</M>와 <M>{'\\iint_R(u_x-v_y)\\,dA'}</M>가 됩니다. <a href={lessonHref('math-complex-analysis', 'holomorphic')}>코시-리만 방정식</a> <M>{'u_x=v_y'}</M>, <M>{'u_y=-v_x'}</M> 때문에 두 피적분함수가 모두 0입니다. <Qed />
        </p>
      </Proof>
      <p>
        f′이 연속이라는 가정은 구르사(Édouard Goursat)가 없앴습니다. 정칙이기만 하면 충분합니다. 이 정리에서 바로 나오는 것이 경로의 변형입니다. 두 닫힌 경로 사이의 영역에 특이점이 없으면 두 경로의 적분은 같고, 그래서 경로를 끌어당겨 모양을 바꿔도 특이점을 넘지 않는 한 적분은 변하지 않습니다.
      </p>
      <PathFigure />
      <p>
        "0을 한 번 감기"에서 <M>{'z^2'}</M>과 <M>{'e^z'}</M>의 적분은 0.000이고, <M>{'1/z'}</M>은 6.283i입니다. 점을 어떻게 끌어도 곡선이 0을 한 번 감는 동안은 6.283i가 유지되다가, 곡선이 0을 넘어 비켜 가는 순간 0이 됩니다. "0을 두 번 감기"에서는 별 모양 곡선이 0을 두 번 돌아 12.567i, 곧 <M>{'4\\pi i'}</M>입니다. 특이점이 0과 1 두 곳인 <M>{'1/z+1/(z-1)'}</M>은 "0을 한 번 감기"에서도 6.283i인데, 이 곡선이 1은 감싸지 않기 때문입니다. "0을 비켜 가기"는 반대로 1만 감싸서 역시 6.283i입니다. 적분값은 경로의 모양이 아니라 어느 특이점을 몇 번 감는지만으로 정해집니다. 이 관찰을 정리한 것이 <a href={lessonHref('math-complex-analysis', 'residues')}>다음 장의 유수 정리</a>입니다.
      </p>
      <Callout kind="note">
        감김 수는 곡선이 한 점 둘레를 시계 반대 방향으로 몇 바퀴 도는지 센 정수입니다. 그림에서는 곡선 위의 점에서 그 점을 바라보는 각도의 변화를 모두 더해 <M>{'2\\pi'}</M>로 나눠 계산합니다. 이것이 정확히 <M>{'\\frac{1}{2\\pi i}\\oint \\frac{dz}{z-a}'}</M>이기도 합니다.
      </Callout>

      <h2>코시 적분 공식</h2>
      <p>
        코시 정리를 <M>{'f(z)/(z-z_0)'}</M>에 쓰면 더 놀라운 결과가 나옵니다. <M>{'z_0'}</M> 둘레의 작은 원으로 경로를 줄여도 적분이 변하지 않고, 작은 원 위에서는 f가 거의 <M>{'f(z_0)'}</M>이므로 적분은 <M>{'f(z_0)\\cdot 2\\pi i'}</M>로 다가갑니다. 정확히 쓰면 다음과 같습니다.
      </p>
      <MB>{'f(z_0)=\\frac{1}{2\\pi i}\\oint_\\gamma \\frac{f(z)}{z-z_0}\\,dz,\\qquad f^{(k)}(z_0)=\\frac{k!}{2\\pi i}\\oint_\\gamma \\frac{f(z)}{(z-z_0)^{k+1}}\\,dz'}</MB>
      <p>
        경계의 값만 알면 안쪽의 모든 값과 모든 차수의 도함수가 정해진다는 뜻입니다. 두 번째 식은 정칙 함수가 한 번 미분 가능하면 무한 번 미분 가능하다는 것도 말해 주고, 여기서 <a href={lessonHref('math-complex-analysis', 'power-series')}>앞 장</a>의 테일러 급수가 가장 가까운 특이점까지 수렴한다는 사실이 나옵니다.
      </p>
      <CauchyFigure />
      <p>
        기본 설정(<M>{'f=e^z'}</M>, 반지름 1.5, <M>{'z_0=0.4+0.3i'}</M>)에서 참값은 1.4252 + 0.4409i입니다. 경계의 점 8개만 쓰면 차이가 <M>{'8.3\\times10^{-4}'}</M>, 16개면 <M>{'3.5\\times10^{-8}'}</M>, 32개면 <M>{'1.2\\times10^{-15}'}</M>로 반올림 오차까지 내려갑니다. 원 위의 매끄러운 주기 함수는 사다리꼴 규칙으로 아주 빨리 수렴하기 때문입니다. <M>{'z_0'}</M>을 경계 가까이(예: 1.4) 옮기면 피적분함수가 경계 근처에서 가팔라져서, 점 64개로는 차이가 0.05나 되고 400개는 써야 <M>{'4.2\\times10^{-12}'}</M>이 됩니다. 원 밖으로 끌어내면 <M>{'f(z)/(z-z_0)'}</M>가 원 안에서 정칙이 되므로 코시 정리에 따라 공식의 값은 0입니다.
      </p>

      <h2>최대 절댓값 원리와 리우빌 정리</h2>
      <p>
        코시 적분 공식을 <M>{'z_0'}</M>을 중심으로 하는 원에 쓰면 <M>{'f(z_0)'}</M>는 원 위의 값들의 평균입니다. 평균은 가장 큰 값보다 클 수 없으므로, <M>{'|f|'}</M>가 안쪽 한 점에서 가장 크려면 그 둘레의 모든 원 위에서 <M>{'|f|'}</M>가 같아야 하고, 결국 f는 상수입니다. 이것이 <T en="maximum modulus principle">최대 절댓값 원리</T>입니다. 상수가 아닌 정칙 함수의 <M>{'|f|'}</M>는 닫힌 영역에서 경계에서만 최댓값을 가집니다.
      </p>
      <MaxModFigure />
      <p>
        <M>{'e^z'}</M>의 최댓값은 <M>{'z=1'}</M>에서 <M>{'e\\approx2.7183'}</M>이고 중심의 값은 1입니다. <M>{'z^2+z/2+0.3'}</M>은 <M>{'z=1'}</M>에서 1.8, <M>{'\\sin 2z'}</M>는 <M>{'z=\\pm i'}</M>에서 <M>{'\\sinh2\\approx3.6269'}</M>로, 모두 <M>{'|z|=1'}</M> 위에 있습니다. 점을 원판 안쪽으로 끌어 보면 어디서도 그보다 큰 값이 나오지 않습니다. 실수 함수였다면 <M>{'1-x^2'}</M>처럼 가운데가 가장 높은 언덕을 쉽게 만들 수 있지만, 정칙 함수의 <M>{'|f|'}</M>에는 언덕 꼭대기가 없습니다.
      </p>
      <p>
        같은 생각을 평면 전체로 넓히면 <T en="Liouville’s theorem">리우빌 정리</T>가 됩니다. 평면 전체에서 정칙이고 크기가 유계인 함수는 상수뿐입니다. 도함수 공식에서 <M>{"|f'(z_0)|\\le M/r"}</M>이고, 반지름 r을 한없이 키우면 <M>{"f'(z_0)=0"}</M>이기 때문입니다. 그래서 <M>{'\\sin z'}</M>는 실수축에서는 −1과 1 사이에 머물지만 복소 평면에서는 반드시 한없이 커집니다(<M>{'|\\sin(iy)|=\\sinh y'}</M>). 리우빌 정리로 대수학의 기본 정리도 증명할 수 있습니다. 근이 없는 다항식 p가 있다면 <M>{'1/p'}</M>가 평면 전체에서 정칙이고 유계여서 상수가 되기 때문입니다.
      </p>

      <Callout kind="key">
        복소 적분은 경로를 따라 <M>{'f(z)\\,dz'}</M>를 더한 것입니다. 원 위에서 <M>{'z^n'}</M>의 적분은 <M>{'n=-1'}</M>일 때만 <M>{'2\\pi i'}</M>이고 나머지는 0입니다. 코시 정리에 따라 정칙 함수의 닫힌 경로 적분은 0이고, 그래서 특이점을 넘지 않는 한 경로를 마음대로 바꿔도 적분은 같습니다. 코시 적분 공식은 경계의 값만으로 안쪽의 값과 모든 도함수를 정하고, 여기서 최대 절댓값 원리와 리우빌 정리가 나옵니다.
      </Callout>
      <Quiz
        q={
          <>
            <M>{'\\displaystyle\\oint_{|z|=2}\\frac{e^z}{z-1}\\,dz'}</M>의 값은 얼마일까요? (원은 시계 반대 방향으로 한 바퀴)
          </>
        }
        options={['0', '2πi', '2πi·e', '2πi / e']}
        answer={2}
        explain={
          <>
            <M>{'e^z'}</M>는 평면 전체에서 정칙이고, 점 1은 원 <M>{'|z|=2'}</M> 안에 있습니다. 코시 적분 공식에서 <M>{'f(z)=e^z'}</M>, <M>{'z_0=1'}</M>로 두면 적분은 <M>{'2\\pi i\\,f(1)=2\\pi i\\,e'}</M>입니다. 원의 반지름이 1보다 작았다면 피적분함수가 원 안에서 정칙이므로 답은 0이 됩니다.
          </>
        }
      />
    </>
  );
}

