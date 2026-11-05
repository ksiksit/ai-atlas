import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { abs, add, arg, drawPlane, fmtC, fromPolar, mapGrid, presets, type Box, type C, type Mapper, type View } from './cplx';
import { FNS, contourSegments, gradientAngle, imageAngle, laplacian, partials, quotient, quotientCurve } from './holo';
import './complex.css';
import './holomorphic.css';

const rad = (d: number) => (d * Math.PI) / 180;
const fx = (v: number, d = 4) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');

/** Two side-by-side panels, or stacked on narrow screens. */
function panels(w: number, h: number): [View, View] {
  if (w < 520) return [{ x: 4, y: 4, w: w - 8, h: h / 2 - 8 }, { x: 4, y: h / 2 + 4, w: w - 8, h: h / 2 - 8 }];
  return [{ x: 4, y: 4, w: w / 2 - 10, h: h - 8 }, { x: w / 2 + 6, y: 4, w: w / 2 - 10, h: h - 8 }];
}

/** A box of the given half-size around the bounding box of points, with a margin. */
function fitBox(pts: C[], minHalf = 0.4): Box {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (!isFinite(p[0]) || !isFinite(p[1])) continue;
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const half = Math.max(minHalf, (x1 - x0) / 2, (y1 - y0) / 2) * 1.2;
  return { x0: cx - half, x1: cx + half, y0: cy - half, y1: cy + half };
}

function dot(ctx: CanvasRenderingContext2D, P: Palette, x: number, y: number, color: string, r = 6) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = P.surface;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function panelTitle(ctx: CanvasRenderingContext2D, P: Palette, v: View, text: string) {
  ctx.fillStyle = P.ink2;
  ctx.font = `600 11px ${P.fontBody}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, v.x + 6, v.y + 4);
}

/* ─────────────── Figure 1: the difference quotient from every direction ─────────────── */

const Z0: C = [1, 0.5];
const DIR_FNS = ['z2', 'conj', 'abs2'] as const;
type DirFn = (typeof DIR_FNS)[number];

function DirectionFigure() {
  const P = usePalette();
  const [id, setId] = useState<DirFn>('z2');
  const [h, setH] = useState(0.3);
  const [phi, setPhi] = useState(0);
  const fn = FNS[id];
  const curve = useMemo(() => quotientCurve(fn.f, Z0, h), [fn, h]);
  const q = quotient(fn.f, Z0, h, rad(phi));
  const qBox = useMemo(() => fitBox(curve.pts, 0.5), [curve]);
  const zBox: Box = { x0: Z0[0] - 0.65, x1: Z0[0] + 0.65, y0: Z0[1] - 0.65, y1: Z0[1] + 0.65 };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: H }) => {
      const [va, vb] = panels(w, H);
      const a = drawPlane(ctx, P, zBox, va, { step: 0.5, labels: false });
      panelTitle(ctx, P, a.rect, '입력: z₀에서 h만큼 움직이기');
      ctx.strokeStyle = alpha(P.ink3, 0.7);
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(a.X(Z0[0]), a.Y(Z0[1]), h * a.k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const zp = add(Z0, fromPolar(h, rad(phi)));
      ctx.strokeStyle = P.pos;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.X(Z0[0]), a.Y(Z0[1]));
      ctx.lineTo(a.X(zp[0]), a.Y(zp[1]));
      ctx.stroke();
      dot(ctx, P, a.X(Z0[0]), a.Y(Z0[1]), P.ink, 5);
      dot(ctx, P, a.X(zp[0]), a.Y(zp[1]), P.pos, 6);

      const b = drawPlane(ctx, P, qBox, vb, { step: 0.5, labels: false });
      panelTitle(ctx, P, b.rect, '차분몫: 모든 방향의 값');
      ctx.strokeStyle = P.neg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      curve.pts.forEach((p, i) => (i ? ctx.lineTo(b.X(p[0]), b.Y(p[1])) : ctx.moveTo(b.X(p[0]), b.Y(p[1]))));
      ctx.closePath();
      ctx.stroke();
      dot(ctx, P, b.X(q[0]), b.Y(q[1]), P.pos, 6);
    },
    [P, id, h, phi, curve, qBox],
    { aspect: 1.8, maxHeight: 380, minHeight: 40 },
  );

  return (
    <Figure
      no={1}
      title="z₀로 다가가는 방향마다 차분몫"
      hint="함수와 방향을 바꾸고 h를 줄여 보세요"
      caption={<>왼쪽(좁은 화면에서는 위)은 z₀ = 1 + 0.5i에서 방향 φ로 h만큼 움직인 점입니다. 오른쪽(아래)은 그 방향의 차분몫 (f(z₀ + Δz) − f(z₀)) / Δz입니다. 파란 곡선은 φ를 한 바퀴 돌렸을 때 차분몫이 그리는 자취이고, 주황 점이 지금 방향의 값입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`f(z) = ${fn.name}, h = ${h.toFixed(2)}. 방향 ${phi}°의 차분몫은 ${fmtC(q, 3)}이고, 모든 방향의 차분몫이 서로 가장 멀리 떨어진 거리는 ${curve.spread.toFixed(3)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="함수" value={id} onChange={setId} options={DIR_FNS.map((k) => ({ value: k, label: FNS[k].name }))} />
          <Slider label="h" value={h} min={0.01} max={0.5} step={0.01} onChange={setH} format={(v) => v.toFixed(2)} />
          <Slider label="방향 φ" value={phi} min={0} max={360} step={1} onChange={setPhi} format={(v) => `${v}°`} color="var(--pos)" />
          <div className="ho-readouts">
            <Readout label="지금 방향의 차분몫" value={fmtC(q, 3)} color="var(--pos)" />
            <Readout label="방향마다 값이 퍼진 폭" value={curve.spread.toFixed(3)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: checking Cauchy–Riemann ─────────────── */

const CR_FNS = ['exp', 'z2', 'sin', 'inv', 'conj', 'abs2', 'xsq'] as const;
type CrFn = (typeof CR_FNS)[number];
const CR_BOX: Box = { x0: -2, x1: 2, y0: -2, y1: 2 };

function CauchyRiemannFigure() {
  const P = usePalette();
  const [id, setId] = useState<CrFn>('exp');
  const [x, setX] = useState(0.8);
  const [y, setY] = useState(0.6);
  const fn = FNS[id];
  const z: C = [x, y];
  const p = partials(fn.f, z);
  const r1 = p.ux - p.vy, r2 = p.uy + p.vx;
  const ok = Math.abs(r1) < 1e-4 && Math.abs(r2) < 1e-4;
  const mref = useRef<Mapper | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const m = drawPlane(ctx, P, CR_BOX, { x: 4, y: 4, w: w - 8, h: h - 8 });
      mref.current = m;
      if (id === 'xsq') {
        // the only line where the equations hold for x² + iy
        ctx.strokeStyle = alpha(P.good, 0.8);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(m.X(0.5), m.rect.y);
        ctx.lineTo(m.X(0.5), m.rect.y + m.rect.h);
        ctx.stroke();
      }
      dot(ctx, P, m.X(x), m.Y(y), ok ? P.good : P.bad, 7);
    },
    [P, id, x, y, ok],
    { aspect: 1, maxHeight: 260, minHeight: 40 },
  );
  useDrag(wrapRef, {
    hit: () => 'p',
    onDrag: (_, sx, sy) => {
      const m = mref.current;
      if (!m) return;
      setX(Math.round(Math.max(-1.9, Math.min(1.9, m.invX(sx))) * 20) / 20);
      setY(Math.round(Math.max(-1.9, Math.min(1.9, m.invY(sy))) * 20) / 20);
    },
  });

  return (
    <Figure
      no={2}
      title="코시-리만 방정식 확인하기"
      hint="함수를 고르고 점을 끌어 보세요"
      caption={<>편미분은 점의 좌우와 위아래로 0.00001씩 움직여 계산한 값입니다. 두 방정식의 양변이 소수 넷째 자리까지 같으면 초록, 아니면 빨강으로 표시합니다. x² + iy를 고르면 방정식이 성립하는 직선 x = 1/2를 초록으로 그립니다.</>}
    >
      <div className="fig-split">
        <div className="controls">
          <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`f(z) = ${fn.name}, 점 ${fmtC(z)}. u_x − v_y = ${fx(r1)}, u_y + v_x = ${fx(r2)}. ${ok ? '코시-리만 방정식이 성립합니다.' : '코시-리만 방정식이 성립하지 않습니다.'}`}>
            <canvas ref={canvasRef} />
          </div>
          <Slider label="x" value={x} min={-1.9} max={1.9} step={0.05} onChange={setX} format={(v) => v.toFixed(2)} />
          <Slider label="y" value={y} min={-1.9} max={1.9} step={0.05} onChange={setY} format={(v) => v.toFixed(2)} />
        </div>
        <div className="controls">
          <Seg label="함수" value={id} onChange={setId} options={CR_FNS.map((k) => ({ value: k, label: FNS[k].name }))} />
          <div className="tbl-wrap">
            <table className="ho-cr">
              <thead>
                <tr>
                  <th>방정식</th>
                  <th>왼쪽</th>
                  <th>오른쪽</th>
                  <th>차이</th>
                </tr>
              </thead>
              <tbody>
                <tr data-ok={Math.abs(r1) < 1e-4 || undefined} data-bad={Math.abs(r1) >= 1e-4 || undefined}>
                  <td>
                    <M>{'u_x = v_y'}</M>
                  </td>
                  <td className="mono">{fx(p.ux)}</td>
                  <td className="mono">{fx(p.vy)}</td>
                  <td className="mono">{fx(r1)}</td>
                </tr>
                <tr data-ok={Math.abs(r2) < 1e-4 || undefined} data-bad={Math.abs(r2) >= 1e-4 || undefined}>
                  <td>
                    <M>{'u_y = -v_x'}</M>
                  </td>
                  <td className="mono">{fx(p.uy)}</td>
                  <td className="mono">{fx(-p.vx)}</td>
                  <td className="mono">{fx(r2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="ho-readouts">
            <Readout label="판정" value={ok ? '성립' : '성립하지 않음'} color={ok ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="u_x + i v_x" value={fmtC([p.ux, p.vx], 3)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: small squares stay square ─────────────── */

const CF_FNS = ['z2', 'exp', 'inv', 'sin'] as const;
type CfFn = (typeof CF_FNS)[number];
const GRID_N = 6;

function ConformalFigure() {
  const P = usePalette();
  const [id, setId] = useState<CfFn>('z2');
  const [x, setX] = useState(1);
  const [y, setY] = useState(0.5);
  const [s, setS] = useState(0.5);
  const fn = FNS[id];
  const z0: C = [x, y];
  const src: Box = { x0: x - s / 2, x1: x + s / 2, y0: y - s / 2, y1: y + s / 2 };
  const lines = useMemo(() => mapGrid(fn.f, src, GRID_N, 60), [fn, x, y, s]); // eslint-disable-line react-hooks/exhaustive-deps
  const imgBox = useMemo(() => fitBox(lines.flatMap((l) => l.pts), 0.05), [lines]);
  const df = presets[id].df!(z0);
  const ang = imageAngle(fn.f, z0, abs(df) < 1e-9 ? 1e-4 : 1e-6);
  const viewSrc: Box = { x0: x - s * 0.7, x1: x + s * 0.7, y0: y - s * 0.7, y1: y + s * 0.7 };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const [va, vb] = panels(w, h);
      const a = drawPlane(ctx, P, viewSrc, va, { grid: false, labels: false });
      panelTitle(ctx, P, a.rect, 'z₀ 둘레의 작은 격자');
      const b = drawPlane(ctx, P, imgBox, vb, { grid: false, labels: false });
      panelTitle(ctx, P, b.rect, '그 격자의 상');
      const mid = GRID_N / 2;
      const drawLines = (m: Mapper, mapped: boolean) => {
        lines.forEach((ln, idx) => {
          const k = Math.floor(idx / 2);
          const center = k === mid;
          ctx.strokeStyle = center ? (ln.dir === 'h' ? P.neg : P.pos) : alpha(P.ink2, 0.55);
          ctx.lineWidth = center ? 2.5 : 1.2;
          ctx.beginPath();
          const pts = mapped ? ln.pts : ln.pts.map((_, i) => {
            const t = i / (ln.pts.length - 1);
            return (ln.dir === 'h' ? [src.x0 + (src.x1 - src.x0) * t, ln.value] : [ln.value, src.y0 + (src.y1 - src.y0) * t]) as C;
          });
          pts.forEach((p, i) => (i ? ctx.lineTo(m.X(p[0]), m.Y(p[1])) : ctx.moveTo(m.X(p[0]), m.Y(p[1]))));
          ctx.stroke();
        });
      };
      drawLines(a, false);
      drawLines(b, true);
      dot(ctx, P, a.X(x), a.Y(y), P.ink, 4);
      const fz = fn.f(z0);
      dot(ctx, P, b.X(fz[0]), b.Y(fz[1]), P.ink, 4);
    },
    [P, lines, imgBox, x, y, s],
    { aspect: 1.8, maxHeight: 360, minHeight: 40 },
  );

  return (
    <Figure
      no={3}
      title="작은 정사각형은 정사각형으로"
      hint="z₀와 격자 크기를 바꿔 보세요"
      caption={<>왼쪽(좁은 화면에서는 위)은 z₀를 가운데에 둔 한 변 s의 격자, 오른쪽(아래)은 f로 보낸 그 격자입니다. z₀를 지나는 가로선은 파랑, 세로선은 주황입니다. 오른쪽의 각은 두 선의 상이 f(z₀)에서 이루는 각입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`f(z) = ${fn.name}, z₀ = ${fmtC(z0)}, 격자 한 변 ${s.toFixed(2)}. 가로선과 세로선의 상이 이루는 각은 ${ang.toFixed(1)}°이고, 확대율 |f′(z₀)| = ${abs(df).toFixed(3)}, 회전각 ${(arg(df) * 180 / Math.PI).toFixed(1)}°입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="함수" value={id} onChange={setId} options={CF_FNS.map((k) => ({ value: k, label: FNS[k].name }))} />
          <Slider label="z₀의 실수부" value={x} min={-1.5} max={1.5} step={0.05} onChange={setX} format={(v) => v.toFixed(2)} />
          <Slider label="z₀의 허수부" value={y} min={-1.5} max={1.5} step={0.05} onChange={setY} format={(v) => v.toFixed(2)} />
          <Slider label="격자 한 변 s" value={s} min={0.05} max={1.5} step={0.05} onChange={setS} format={(v) => v.toFixed(2)} />
          <div className="btn-row">
            <Button small onClick={() => { setId('z2'); setX(0); setY(0); }}>z² 에서 z₀ = 0</Button>
          </div>
          <div className="ho-readouts">
            <Readout label="두 선의 상이 이루는 각" value={`${ang.toFixed(1)}°`} color={Math.abs(ang - 90) < 0.5 ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="확대율 |f′(z₀)|" value={abs(df).toFixed(3)} />
            <Readout label="회전각 arg f′(z₀)" value={`${((arg(df) * 180) / Math.PI).toFixed(1).replace('-', '−')}°`} />
            <Readout label="f′(z₀)" value={fmtC(df, 3)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: streamlines and equipotentials ─────────────── */

const FLOW_BOX: Box = { x0: -2.4, x1: 2.4, y0: -1.6, y1: 1.6 };
const FLOWS = {
  z2: { name: '모서리 흐름 z²', levelsU: range(-4, 4, 0.5), levelsV: range(-4, 4, 0.5), hole: false },
  cyl: { name: '원기둥 둘레 z + 1/z', levelsU: range(-3.2, 3.2, 0.4), levelsV: range(-2, 2, 0.2), hole: true },
} as const;
type FlowId = keyof typeof FLOWS;
function range(a: number, b: number, d: number): number[] {
  const out: number[] = [];
  for (let v = a; v <= b + 1e-9; v += d) out.push(Math.round(v * 1000) / 1000);
  return out;
}

function FlowFigure() {
  const P = usePalette();
  const [id, setId] = useState<FlowId>('cyl');
  const [x, setX] = useState(1);
  const [y, setY] = useState(0.5);
  const fl = FLOWS[id];
  const fn = FNS[id];
  const inside = (px: number, py: number) => fl.hole && px * px + py * py < 1;
  const segs = useMemo(() => {
    const g = (part: 0 | 1) => (px: number, py: number) => fn.f([px, py])[part];
    return {
      u: contourSegments(g(0), FLOW_BOX, 120, [...fl.levelsU], inside),
      v: contourSegments(g(1), FLOW_BOX, 120, [...fl.levelsV], inside),
    };
  }, [fn, fl]); // eslint-disable-line react-hooks/exhaustive-deps
  const z: C = [x, y];
  const lapU = laplacian(fn.f, z, 0), lapV = laplacian(fn.f, z, 1);
  const ga = gradientAngle(fn.f, z);
  const pz = partials(fn.f, z);
  const speed = Math.hypot(pz.ux, pz.vx);
  const mref = useRef<Mapper | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const m = drawPlane(ctx, P, FLOW_BOX, { x: 4, y: 4, w: w - 8, h: h - 8 }, { grid: false });
      mref.current = m;
      ctx.save();
      ctx.beginPath();
      ctx.rect(m.rect.x, m.rect.y, m.rect.w, m.rect.h);
      ctx.clip();
      const draw = (all: number[][][], color: string, width: number, dash: number[]) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        for (const segsL of all) for (const s of segsL) {
          ctx.moveTo(m.X(s[0]), m.Y(s[1]));
          ctx.lineTo(m.X(s[2]), m.Y(s[3]));
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };
      draw(segs.u, alpha(P.accent, 0.8), 1.2, [4, 3]);
      draw(segs.v, P.ink2, 1.6, []);
      if (fl.hole) {
        ctx.fillStyle = P.surface3;
        ctx.strokeStyle = P.ink2;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(m.X(0), m.Y(0), m.k, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      dot(ctx, P, m.X(x), m.Y(y), P.pos, 7);
    },
    [P, segs, fl, x, y],
    { aspect: 1.5, maxHeight: 420, minHeight: 40 },
  );
  useDrag(wrapRef, {
    hit: () => 'p',
    onDrag: (_, sx, sy) => {
      const m = mref.current;
      if (!m) return;
      let px = Math.max(-2.3, Math.min(2.3, m.invX(sx)));
      let py = Math.max(-1.5, Math.min(1.5, m.invY(sy)));
      if (fl.hole && px * px + py * py < 1.05) {
        const r = Math.hypot(px, py) || 1;
        px = (px / r) * 1.05;
        py = (py / r) * 1.05;
      }
      setX(Math.round(px * 20) / 20);
      setY(Math.round(py * 20) / 20);
    },
  });

  const sci = (v: number) => (Math.abs(v) < 1e-12 ? '0' : v.toExponential(1).replace('-', '−').replace('e', '×10^').replace('^−', '^−'));
  return (
    <Figure
      no={4}
      title="실수부와 허수부: 서로 직각인 두 무리의 곡선"
      hint="흐름을 고르고 주황 점을 끌어 보세요"
      caption={<>실선은 허수부 v = Im f가 일정한 곡선(유선), 점선은 실수부 u = Re f가 일정한 곡선(등퍼텐셜선)입니다. 원기둥 흐름에서 가운데 원은 물이 들어갈 수 없는 기둥입니다. 라플라시안은 주황 점에서 가로세로 0.001씩 떨어진 네 점으로 계산했습니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`f(z) = ${fn.name}의 실수부와 허수부 등고선. 점 ${fmtC(z)}에서 두 기울기 벡터가 이루는 각은 ${ga.toFixed(2)}°이고, 실수부의 라플라시안은 ${sci(lapU)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="흐름" value={id} onChange={(v) => { setId(v); setX(1); setY(0.5); }} options={(Object.keys(FLOWS) as FlowId[]).map((k) => ({ value: k, label: FLOWS[k].name }))} />
          <Legend
            items={[
              { color: 'var(--ink-2)', label: '유선 (Im f 일정)', shape: 'ln' },
              { color: 'var(--accent)', label: '등퍼텐셜선 (Re f 일정)', shape: 'ln' },
            ]}
          />
          <div className="ho-readouts">
            <Readout label="Δu (Re f)" value={sci(lapU)} />
            <Readout label="Δv (Im f)" value={sci(lapV)} />
            <Readout label="∇u와 ∇v 사이 각" value={`${ga.toFixed(2)}°`} color="var(--good)" />
            <Readout label="흐름 속도 |f′(z)|" value={speed.toFixed(3)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Holomorphic() {
  return (
    <>
      <h2>모든 방향에서 같은 극한</h2>
      <p>
        실수 함수의 미분은 <M>{'h \\to 0'}</M>일 때 차분몫 <M>{'(f(x+h) - f(x))/h'}</M>의 극한이었습니다. 복소 함수도 똑같이 정의합니다.
      </p>
      <MB>{"f'(z_0) = \\lim_{\\Delta z \\to 0} \\frac{f(z_0 + \\Delta z) - f(z_0)}{\\Delta z}"}</MB>
      <p>
        달라진 것은 <M>{'\\Delta z'}</M>가 복소수라는 점 하나입니다. 실수직선에서는 0에 왼쪽과 오른쪽 두 방향으로만 다가가지만, 평면에서는 모든 방향, 나선이나 지그재그 같은 어떤 길로도 다가갈 수 있습니다. 극한이 있으려면 그 모든 길에서 같은 값이 나와야 합니다. 이 조건이 얼마나 까다로운지 그림 1에서 봅니다.
      </p>
      <DirectionFigure />
      <p>
        <M>{'f(z) = z^2'}</M>에서는 차분몫이 <M>{'2z_0 + \\Delta z'}</M>이므로, 방향을 한 바퀴 돌리면 <M>{'2z_0 = 2 + i'}</M>를 중심으로 반지름 h인 작은 원을 그립니다. h = 0.3에서 값이 퍼진 폭은 0.6이고, h를 0.01로 줄이면 0.02로 줄어들어 모든 방향이 한 값 <M>{'2 + i'}</M>로 모입니다. <M>{'z^2'}</M>은 미분 가능하고 <M>{"f'(z_0) = 2z_0"}</M>입니다.
      </p>
      <p>
        켤레 <M>{'\\bar z'}</M>를 고르면 사정이 다릅니다. 차분몫은 <M>{'\\overline{\\Delta z}/\\Delta z = e^{-2i\\varphi}'}</M>여서 h와 상관없이 방향에만 달려 있습니다. 가로로 다가가면 1, 세로로 다가가면 −1이고, 폭은 h를 아무리 줄여도 2입니다. <M>{'\\bar z'}</M>는 평면을 거울에 비추는 아주 단순한 함수인데도 복소수의 뜻으로는 어디에서도 미분할 수 없습니다. <M>{'|z|^2'}</M>도 마찬가지로, h를 0.01까지 줄여도 폭이 약 2.25로 남습니다.
      </p>
      <p>
        한 점의 근방 전체에서 복소 미분이 가능한 함수를 <T en="holomorphic">정칙 함수</T>라고 합니다. 다항식, 지수 함수, 삼각 함수, 그리고 분모가 0이 아닌 곳의 유리 함수가 모두 정칙입니다.
      </p>

      <h2>코시-리만 방정식</h2>
      <p>
        <M>{'f = u + iv'}</M>로 실수부와 허수부를 나누면 복소 함수는 평면에서 평면으로 가는 실수 함수 한 쌍 <M>{'(u(x,y), v(x,y))'}</M>입니다. 모든 방향의 극한이 같아야 한다는 조건을 가로와 세로 두 방향에만 적용해도 강력한 결론이 나옵니다.
      </p>
      <div className="ho-proof">
        <div className="ho-proof-head">정리 (코시-리만 방정식)</div>
        <p>
          <M>{'f = u + iv'}</M>가 <M>{'z_0 = x_0 + iy_0'}</M>에서 복소 미분 가능하면, 그 점에서 <M>{'u_x = v_y'}</M>, <M>{'u_y = -v_x'}</M>이고 <M>{"f'(z_0) = u_x + iv_x"}</M>입니다.
        </p>
        <p>
          <b>증명.</b> 극한이 모든 방향에서 같으므로, 실수 <M>h</M>로 가로 방향 <M>{'\\Delta z = h'}</M>를 따라 다가가면 <M>{"f'(z_0) = \\lim_{h\\to 0} \\frac{u(x_0+h, y_0) - u(x_0, y_0)}{h} + i\\frac{v(x_0+h, y_0) - v(x_0, y_0)}{h} = u_x + iv_x"}</M>입니다. 세로 방향 <M>{'\\Delta z = ih'}</M>를 따라 다가가면 분모에 <M>i</M>가 붙어 <M>{"f'(z_0) = \\frac{1}{i}(u_y + iv_y) = v_y - iu_y"}</M>입니다. 두 값이 같아야 하므로 실수부끼리 <M>{'u_x = v_y'}</M>, 허수부끼리 <M>{'v_x = -u_y'}</M>입니다.
          <span className="ho-qed">∎</span>
        </p>
      </div>
      <p>
        거꾸로, <M>u</M>와 <M>v</M>의 편미분이 연속이고 이 두 방정식을 만족하면 <M>f</M>는 정칙입니다. 그림 2에서 편미분을 수치로 계산해 확인합니다.
      </p>
      <CauchyRiemannFigure />
      <p>
        <M>{'e^z = e^x\\cos y + ie^x\\sin y'}</M>의 점 <M>{'0.8 + 0.6i'}</M>에서는 <M>{'u_x = v_y = 1.8368'}</M>, <M>{'u_y = -v_x = -1.2566'}</M>으로 두 방정식이 모두 맞고, <M>{"f'(z) = u_x + iv_x = 1.837 + 1.257i"}</M>는 <M>{'e^z'}</M> 자신과 같습니다. 점을 어디로 옮겨도 초록입니다. <M>{'\\bar z'}</M>는 <M>{'u_x - v_y = 2'}</M>로 첫 방정식이 어디서나 깨집니다. <M>{'x^2 + iy'}</M>는 흥미로운 경우입니다. <M>{'u_x = 2x'}</M>와 <M>{'v_y = 1'}</M>이 같은 직선 <M>{'x = 1/2'}</M> 위에서만 방정식이 성립하므로, 그 직선 위의 점에서는 미분 가능하지만 둘레 어디에서도 정칙은 아닙니다.
      </p>

      <h2>각을 지키는 사상</h2>
      <p>
        <a href={lessonHref('math-multivariable', 'chain-rule-jacobian')}>야코비 행렬</a> 장에서 본 것처럼, 매끄러운 사상은 작은 조각에서 행렬 하나처럼 움직입니다. 코시-리만 방정식을 넣으면 정칙 함수의 야코비 행렬은 특별한 모양이 됩니다.
      </p>
      <MB>{"J = \\begin{pmatrix} u_x & u_y \\\\ v_x & v_y \\end{pmatrix} = \\begin{pmatrix} a & -b \\\\ b & a \\end{pmatrix} = |f'(z_0)|\\begin{pmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{pmatrix}"}</MB>
      <p>
        여기서 <M>{"f'(z_0) = a + ib = |f'(z_0)|e^{i\\theta}"}</M>입니다. 첫 장에서 본 대로 복소수를 곱하는 일, 곧 돌리고 같은 비율로 늘리는 일입니다. 돌리기와 고른 확대는 각을 바꾸지 않으므로, <M>{"f'(z_0) \\ne 0"}</M>인 곳에서 정칙 함수는 두 곡선이 만나는 각을 그대로 보존합니다. 이런 사상을 <T en="conformal map">등각 사상</T>이라고 합니다.
      </p>
      <ConformalFigure />
      <p>
        처음 설정 <M>{'f = z^2'}</M>, <M>{'z_0 = 1 + 0.5i'}</M>에서 확대율은 <M>{"|f'(z_0)| = |2z_0| = 2.236"}</M>, 회전각은 26.6°이고, 파란 선과 주황 선의 상은 정확히 90°로 만납니다. 격자를 크게 키우면 칸들이 휘지만, 칸 하나하나는 여전히 꼭짓점에서 직각을 이루는 곡선 사각형입니다. 크기를 줄일수록 상은 진짜 정사각형에 가까워집니다. 다른 함수와 점에서도 각은 90°입니다.
      </p>
      <p>
        예외는 <M>{"f'(z_0) = 0"}</M>인 <T en="critical point">임계점</T>입니다. <strong>z²에서 z₀ = 0</strong>을 누르면 각이 180°가 됩니다. <M>{'z^2'}</M>은 편각을 두 배로 만드니 원점에서 직각으로 만나던 두 선이 일직선으로 펴집니다. 임계점에서는 각이 보존되지 않고 차수만큼 곱해집니다.
      </p>

      <h2>조화 함수와 흐름</h2>
      <p>
        코시-리만 방정식을 한 번 더 미분하면 <M>{'u_{xx} = v_{yx}'}</M>, <M>{'u_{yy} = -v_{xy}'}</M>이므로 둘을 더해 <M>{'u_{xx} + u_{yy} = 0'}</M>을 얻습니다. <M>v</M>도 같습니다(정칙 함수가 두 번 미분 가능하다는 사실은 <a href={lessonHref('math-complex-analysis', 'contour-integrals')}>코시 적분 공식</a>에서 나옵니다). 라플라스 방정식 <M>{'\\Delta u = 0'}</M>을 만족하는 함수를 <T en="harmonic function">조화 함수</T>라고 합니다. 열이 고르게 퍼진 온도, 전하가 없는 곳의 전위, 소용돌이 없는 유체의 속도 퍼텐셜이 모두 조화 함수입니다.
      </p>
      <p>
        게다가 <M>{'\\nabla u = (u_x, u_y)'}</M>와 <M>{'\\nabla v = (v_x, v_y) = (-u_y, u_x)'}</M>는 내적이 0입니다. 그러니 <M>u</M>가 일정한 곡선과 <M>v</M>가 일정한 곡선은 언제나 직각으로 만납니다. 유체로 읽으면 <M>u</M>는 속도 퍼텐셜, <M>v</M>는 유선 함수이고, 물은 <M>v</M>가 일정한 곡선을 따라 흐릅니다.
      </p>
      <FlowFigure />
      <p>
        <M>{'z + 1/z'}</M>는 반지름 1인 원기둥 둘레를 왼쪽에서 오른쪽으로 지나는 흐름입니다. 원 <M>{'|z| = 1'}</M> 위에서 <M>{'z + 1/z = z + \\bar z'}</M>가 실수이므로 허수부가 0, 곧 원 자체가 유선 하나여서 물이 기둥을 뚫고 지나가지 않습니다. 처음 점 <M>{'1 + 0.5i'}</M>에서 두 기울기 벡터는 90.00°를 이루고, 실수부의 라플라시안은 반올림 오차 수준인 약 <M>{'-1.6\\times 10^{-6}'}</M>입니다. 비교로 <M>{'|z|^2 = x^2 + y^2'}</M>의 라플라시안을 같은 방법으로 재면 4가 나옵니다. 이런 흐름의 모양을 원에서 비행기 날개로 옮기는 방법은 <a href={lessonHref('math-complex-analysis', 'applications')}>응용</a> 장에서 봅니다.
      </p>
      <Callout kind="note">
        정칙성은 실수 미분 가능성보다 훨씬 강한 조건입니다. 한 번 복소 미분 가능하면 무한히 미분 가능하고, 테일러 급수로 전개되며, 작은 원판 하나에서의 값이 정의역 전체의 값을 정합니다. 실수 함수에서는 이 중 어느 것도 저절로 성립하지 않습니다. 다음 장들에서 그 이유를 하나씩 봅니다.
      </Callout>

      <Callout kind="key">
        복소 미분은 <M>{'\\Delta z'}</M>가 모든 방향에서 0으로 갈 때 같은 극한이 나와야 하므로, 실수부와 허수부는 코시-리만 방정식 <M>{'u_x = v_y'}</M>, <M>{'u_y = -v_x'}</M>를 만족해야 합니다. 그 결과 정칙 함수의 야코비 행렬은 회전과 고른 확대이고, <M>{"f' \\ne 0"}</M>인 곳에서 각을 보존하는 등각 사상이 됩니다. 실수부와 허수부는 둘 다 조화 함수이며, 그 등고선들은 서로 직각으로 만나 유선과 등퍼텐셜선을 이룹니다.
      </Callout>
      <Quiz
        q="f(z) = x² − y² + i·g(x, y)가 정칙이 되도록 실수 함수 g를 고르면 (g(0, 0) = 0일 때)?"
        options={['g = 2xy', 'g = x² + y²', 'g = −2xy', 'g = xy']}
        answer={0}
        explain={<>u = x² − y²이면 u_x = 2x, u_y = −2y입니다. 코시-리만 방정식에서 v_y = u_x = 2x이므로 v = 2xy + h(x)이고, v_x = −u_y = 2y에서 2y + h′(x) = 2y, 곧 h는 상수입니다. g(0, 0) = 0이면 v = 2xy이고 f(z) = (x + iy)² = z²입니다.</>}
      />
    </>
  );
}
