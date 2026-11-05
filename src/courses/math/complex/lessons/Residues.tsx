import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import {
  ARG_POLE,
  ARG_ZEROS,
  POLE_EXAMPLES,
  THREE_POLES,
  abs,
  add,
  argF,
  circleRes,
  cosIntegral,
  domainColour,
  fmtC,
  imageCurve,
  inside,
  nearestPoleGap,
  semicircle,
  sub,
  threePoleResidues,
  threePoles,
  upperResidues,
  winding,
  type C,
  type RealCase,
} from './residue';
import './complex.css';
import './residues.css';

/** A proof set apart from the prose, ending with ∎. */
function Proof({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rs-proof">
      <div className="rs-proof-head">{title}</div>
      {children}
    </div>
  );
}
const Qed = () => <span className="rs-qed">∎</span>;

/** Domain colouring of f over the plot's area. */
function paint(p: Plot, P: Palette, f: (z: C) => C, res = 3) {
  p.heatmap((x, y) => domainColour(f([x, y]), P.dark), res);
}

function circlePath(p: Plot, center: C, r: number, color: string, width = 2.5, dash?: number[]) {
  const c = p.ctx;
  c.save();
  c.strokeStyle = color;
  c.lineWidth = width;
  if (dash) c.setLineDash(dash);
  c.beginPath();
  for (let k = 0; k <= 180; k++) {
    const t = (2 * Math.PI * k) / 180;
    const x = p.X(center[0] + r * Math.cos(t)), y = p.Y(center[1] + r * Math.sin(t));
    if (k) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.stroke();
  // a small arrow head showing the counterclockwise direction, at the top of the circle
  const tx = p.X(center[0]), ty = p.Y(center[1] + r);
  c.setLineDash([]);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(tx - 7, ty);
  c.lineTo(tx + 3, ty - 5);
  c.lineTo(tx + 3, ty + 5);
  c.closePath();
  c.fill();
  c.restore();
}

/** A pole drawn as a ring with a cross, legible on top of any colour. */
function poleMark(p: Plot, P: Palette, z: C, active: boolean) {
  const c = p.ctx;
  const x = p.X(z[0]), y = p.Y(z[1]);
  c.save();
  c.fillStyle = P.surface;
  c.beginPath();
  c.arc(x, y, 7, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = active ? P.ink : P.ink3;
  c.lineWidth = 2;
  c.stroke();
  c.beginPath();
  c.moveTo(x - 3.5, y - 3.5);
  c.lineTo(x + 3.5, y + 3.5);
  c.moveTo(x + 3.5, y - 3.5);
  c.lineTo(x - 3.5, y + 3.5);
  c.stroke();
  c.restore();
}

function zeroMark(p: Plot, P: Palette, z: C, active: boolean) {
  const c = p.ctx;
  c.save();
  c.fillStyle = active ? P.ink : P.surface;
  c.strokeStyle = active ? P.surface : P.ink2;
  c.lineWidth = 2;
  c.beginPath();
  c.arc(p.X(z[0]), p.Y(z[1]), 6, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.restore();
}

const COLOUR_NOTE = '배경색은 f(z)의 편각입니다. 양의 실수는 빨강, 양의 허수는 연두, 음의 실수는 청록, 음의 허수는 보라이고, 밝기의 줄무늬는 |f(z)|가 두 배가 될 때마다 바뀝니다. 모든 색이 한 점에 모이는 곳이 영점이나 극입니다.';

/* ─────────────── Figure 1: the residue at one pole ─────────────── */

function OnePoleFigure() {
  const P = usePalette();
  const [id, setId] = useState('simple');
  const [r, setR] = useState(0.5);
  const ex = POLE_EXAMPLES.find((e) => e.id === id)!;
  const val = useMemo(() => circleRes(ex.f, ex.pole, r), [ex, r]);
  const enclosed = ex.others.filter((q) => inside(q, ex.pole, r));
  const gap = Math.min(...ex.others.map((q) => Math.abs(abs(sub(q, ex.pole)) - r)), Infinity);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -2.6, xMax: 3.4, yMin: -2.4, yMax: 2.6, equal: true, pad: { l: 30, r: 10, t: 10, b: 24 } });
      paint(p, P, ex.f);
      p.grid({ xStep: 1, yStep: 1 });
      circlePath(p, ex.pole, r, P.ink);
      poleMark(p, P, ex.pole, true);
      for (const q of ex.others) poleMark(p, P, q, inside(q, ex.pole, r));
    },
    [P, ex, r],
    { aspect: 1.25, maxHeight: 420 },
  );

  return (
    <Figure
      no={1}
      title="극 하나를 도는 작은 원"
      hint="반지름을 바꿔 보세요"
      caption={
        <>
          극(둥근 표시 안의 ×) 둘레의 원을 시계 반대 방향으로 한 바퀴 돌며 512개 점에서 f를 더해 <M>{'\\frac{1}{2\\pi i}\\oint f\\,dz'}</M>를 계산합니다. 원이 다른 극에 닿기 전까지는 반지름이 얼마든 같은 값, 곧 그 극의 유수가 나옵니다. {COLOUR_NOTE}
        </>
      }
    >
      <div className="fig-split">
        <div className="cx-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${ex.name}의 정의역 색칠 위에 극 ${fmtC(ex.pole, 0)} 둘레로 반지름 ${r.toFixed(2)}인 원. 수치 적분값은 ${fmtC(val)}이고 공식으로 구한 유수는 ${fmtC(ex.res)}입니다.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="cx-note" aria-live="polite">
            {gap < 0.04
              ? '원이 다른 극에 거의 닿아 있어서 이 근처에서는 수치 적분이 크게 흔들립니다.'
              : enclosed.length
                ? `원 안에 다른 극 ${enclosed.map((q) => fmtC(q, 0)).join(', ')}도 들어왔습니다. 이제 적분은 두 유수의 합이고, 두 유수가 서로 지워져 0이 됩니다.`
                : ex.others.length
                  ? `다른 극 ${ex.others.map((q) => fmtC(q, 0)).join(', ')}은 원 밖에 있습니다. 반지름을 바꿔도 적분값은 유수 그대로입니다.`
                  : '이 함수의 특이점은 z = 1 하나뿐이라, 반지름을 아무리 키워도 적분값이 그대로입니다.'}
          </div>
        </div>
        <div className="controls">
          <Seg value={id} onChange={(v) => setId(v)} options={POLE_EXAMPLES.map((e) => ({ value: e.id, label: e.name }))} />
          <Slider id="rs1-r" label="원의 반지름 r" value={r} min={0.1} max={3} step={0.05} onChange={setR} format={(v) => v.toFixed(2)} />
          <MB>{ex.how}</MB>
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="(1/2πi)∮ f dz, 수치" value={fmtC(val)} />
            <Readout label="공식으로 구한 유수" value={fmtC(ex.res)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: three poles, a circle you move ─────────────── */

const RES3 = threePoleResidues();
const POLE_NAMES = ['p₁', 'p₂', 'p₃'];

function ThreePolesFigure() {
  const P = usePalette();
  const [cx, setCx] = useState(0.6);
  const [cy, setCy] = useState(0.2);
  const [r, setR] = useState(0.7);
  const center: C = [cx, cy];
  const plotRef = useRef<Plot | null>(null);
  const val = useMemo(() => circleRes(threePoles, [cx, cy], r), [cx, cy, r]);
  const ins = THREE_POLES.map((q) => inside(q, center, r));
  const sum = RES3.reduce<C>((s, v, k) => (ins[k] ? add(s, v) : s), [0, 0]);
  const gap = nearestPoleGap(center, r);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -2.4, xMax: 2.4, yMin: -2, yMax: 2, equal: true, pad: { l: 30, r: 10, t: 10, b: 24 } });
      plotRef.current = p;
      paint(p, P, threePoles);
      p.grid({ xStep: 1, yStep: 1 });
      circlePath(p, center, r, P.ink);
      THREE_POLES.forEach((q, k) => {
        poleMark(p, P, q, ins[k]);
        p.text(POLE_NAMES[k], q[0], q[1], P.ink, { dx: 12, dy: -10, bg: P.surface, font: `600 11px ${P.fontMono}` });
      });
      p.dot(cx, cy, 6, P.accent, P.surface);
    },
    [P, cx, cy, r],
    { aspect: 1.2, maxHeight: 420 },
  );

  useDrag(wrapRef, {
    hit: (x, y) => {
      const p = plotRef.current;
      if (!p) return null;
      const d = Math.hypot(x - p.X(cx), y - p.Y(cy));
      return d < 18 ? 'c' : null;
    },
    onDrag: (_, x, y) => {
      const p = plotRef.current;
      if (!p) return;
      setCx(Math.max(-2, Math.min(2, Math.round(p.invX(x) * 20) / 20)));
      setCy(Math.max(-1.8, Math.min(1.8, Math.round(p.invY(y) * 20) / 20)));
    },
  });

  return (
    <Figure
      no={2}
      title="원을 움직이면 적분값이 계단처럼 바뀝니다"
      hint="원의 가운데 점을 끌어 보세요"
      caption={
        <>
          <M>{'f(z) = \\frac{1}{(z-p_1)(z-p_2)(z-p_3)}'}</M>, 극은 <M>{'p_1 = 1 + 0.4i'}</M>, <M>{'p_2 = -1 + i'}</M>, <M>{'p_3 = -0.4 - i'}</M>입니다. 원 안의 극이 바뀌지 않는 동안은 원을 어디로 옮겨도 적분값이 같고, 극 하나가 원을 넘나드는 순간에만 그 극의 유수만큼 바뀝니다. 세 유수의 합은 0이어서, 세 극을 모두 감싸는 큰 원의 적분도 0입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="cx-col">
          <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`세 극을 가진 함수의 정의역 색칠 위에 중심 (${cx.toFixed(2)}, ${cy.toFixed(2)}), 반지름 ${r.toFixed(2)}인 원. 원 안의 극은 ${ins.map((v, k) => (v ? POLE_NAMES[k] : '')).filter(Boolean).join(', ') || '없음'}이고, 수치 적분값은 ${fmtC(val)}입니다.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="cx-note" data-bad={gap < 0.05 || undefined} aria-live="polite">
            {gap < 0.05 ? '원이 극 바로 옆을 지나고 있어서 이 근처의 수치 적분은 믿기 어렵습니다. 원을 조금 옮겨 보세요.' : `원 안의 극 ${ins.filter(Boolean).length}개. 수치 적분과 유수의 합이 맞아떨어집니다.`}
          </div>
        </div>
        <div className="controls">
          <Slider id="rs2-x" label="중심의 실수부" value={cx} min={-2} max={2} step={0.05} onChange={setCx} format={(v) => v.toFixed(2)} />
          <Slider id="rs2-y" label="중심의 허수부" value={cy} min={-1.8} max={1.8} step={0.05} onChange={setCy} format={(v) => v.toFixed(2)} />
          <Slider id="rs2-r" label="반지름" value={r} min={0.1} max={2.5} step={0.05} onChange={setR} format={(v) => v.toFixed(2)} />
          <div className="rs-poles">
            {THREE_POLES.map((q, k) => (
              <div key={k} className="rs-pole" data-in={ins[k] || undefined}>
                <i>{ins[k] ? '●' : '○'}</i>
                <span>
                  {POLE_NAMES[k]}의 유수 <span className="mono">{fmtC(RES3[k])}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="(1/2πi)∮ f dz, 수치" value={fmtC(val)} />
            <Readout label="원 안의 유수의 합" value={fmtC(sum)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: real integrals by closing the contour ─────────────── */

type RealSel = RealCase | 'cos';

function RealIntegralFigure() {
  const P = usePalette();
  const [kind, setKind] = useState<RealSel>('x2');
  const [R, setR] = useState(2);
  const [a, setA] = useState(2);
  const parts = useMemo(() => (kind === 'cos' ? null : semicircle(kind, R)), [kind, R]);
  const cosv = useMemo(() => cosIntegral(a), [a]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      if (kind === 'cos') {
        const span = Math.max(2.2, -cosv.z1 + 0.6);
        const p = new Plot(ctx, w, h, P, { xMin: -span, xMax: 1.6, yMin: -1.6, yMax: 1.6, equal: true, pad: { l: 30, r: 10, t: 10, b: 24 } });
        p.grid({ xStep: 1, yStep: 1 });
        circlePath(p, [0, 0], 1, P.accent);
        poleMark(p, P, [cosv.z0, 0], true);
        poleMark(p, P, [cosv.z1, 0], false);
        p.text(`z₀ = ${cosv.z0.toFixed(3)}`, cosv.z0, 0, P.ink, { dy: -18, bg: P.surface, font: `600 11px ${P.fontMono}` });
        p.text(`z₁ = ${cosv.z1.toFixed(3)}`, cosv.z1, 0, P.ink3, { dy: 18, bg: P.surface, font: `11px ${P.fontMono}` });
        return;
      }
      const span = Math.max(2.4, R * 1.12);
      const p = new Plot(ctx, w, h, P, { xMin: -span, xMax: span, yMin: -0.25 * span, yMax: span, equal: true, pad: { l: 30, r: 10, t: 10, b: 24 } });
      p.grid({ xStep: span > 12 ? 5 : 1, yStep: span > 12 ? 5 : 1 });
      const c = p.ctx;
      // the segment along the real axis
      p.line(-R, 0, R, 0, P.neg, 3.5);
      // the arc
      c.save();
      c.strokeStyle = P.pos;
      c.lineWidth = 3.5;
      c.beginPath();
      for (let k = 0; k <= 120; k++) {
        const t = (Math.PI * k) / 120;
        const x = p.X(R * Math.cos(t)), y = p.Y(R * Math.sin(t));
        if (k) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.stroke();
      c.restore();
      const ups = upperResidues(kind);
      for (const u of ups) poleMark(p, P, u.pole, R > 1);
      for (const u of ups) poleMark(p, P, [u.pole[0], -u.pole[1]], false);
    },
    [P, kind, R, cosv],
    { aspect: 1.5, maxHeight: 380 },
  );

  const real = (z: C) => z[0].toFixed(6);
  return (
    <Figure
      no={3}
      title="실수 직선 위의 적분을 닫힌 경로로"
      hint="R을 키워 호의 몫이 사라지는 것을 보세요"
      caption={
        kind === 'cos' ? (
          <>
            <M>{'z = e^{i\\theta}'}</M>로 바꾸면 <M>{'\\cos\\theta = \\tfrac12 (z + z^{-1})'}</M>, <M>{'d\\theta = dz/(iz)'}</M>이고 적분이 단위원 둘레의 복소 적분이 됩니다. 피적분 함수의 극 둘 중 단위원 안에 든 <M>{'z_0'}</M> 하나의 유수만 쓰면 됩니다. 곧바로 심프슨 공식으로 2,000조각 적분한 값과 나란히 보여 줍니다.
          </>
        ) : (
          <>
            파란 선분 [−R, R]과 주황 반원으로 위쪽 반평면을 감쌉니다. R &gt; 1이면 위쪽 극이 경로 안에 들어오고, 둘을 합한 닫힌 경로의 적분은 R과 상관없이 <M>{'2\\pi i'}</M> × (위쪽 극의 유수의 합)입니다. R이 커질수록 반원의 몫은 0으로 가므로, 선분의 몫이 실적분으로 다가갑니다. 아래쪽 극(흐린 ×)은 경로 밖입니다.
          </>
        )
      }
    >
      <div className="fig-split">
        <div className="cx-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={kind === 'cos' ? `단위원과 극 z₀ = ${cosv.z0.toFixed(3)}(안), z₁ = ${cosv.z1.toFixed(3)}(밖). 유수로 구한 적분 ${cosv.viaRes.toFixed(6)}.` : `반지름 ${R}인 반원 경로. 선분의 적분 ${real(parts!.segment)}, 반원의 적분 ${real(parts!.arc)}, 합 ${real(parts!.total)}.`}>
            <canvas ref={canvasRef} />
          </div>
          {kind !== 'cos' && <Legend items={[{ color: 'var(--neg)', label: '선분 [−R, R]', shape: 'ln' }, { color: 'var(--pos)', label: '반원', shape: 'ln' }]} />}
        </div>
        <div className="controls">
          <Seg value={kind} onChange={(v) => setKind(v)} options={[{ value: 'x2', label: '1/(1+x²)' }, { value: 'x4', label: '1/(1+x⁴)' }, { value: 'cos', label: '1/(a+cos θ)' }]} />
          {kind === 'cos' ? (
            <>
              <Slider id="rs3-a" label="a (a > 1)" value={a} min={1.05} max={4} step={0.05} onChange={setA} format={(v) => v.toFixed(2)} />
              <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
                <Readout label="심프슨으로 바로 적분" value={cosv.direct.toFixed(6)} />
                <Readout label="2πi × Res(z₀)" value={cosv.viaRes.toFixed(6)} />
                <Readout label="2π/√(a²−1)" value={cosv.exact.toFixed(6)} />
              </div>
            </>
          ) : (
            <>
              <Slider id="rs3-R" label="반원의 반지름 R" value={R} min={0.5} max={30} step={0.5} onChange={setR} format={(v) => v.toFixed(1)} />
              <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <Readout label="선분" value={real(parts!.segment)} />
                <Readout label="반원" value={real(parts!.arc)} />
                <Readout label="닫힌 경로 전체" value={real(parts!.total)} />
                <Readout label="2πi × 유수의 합" value={real(parts!.residues)} />
                <Readout label="반원의 상한 πR·max|f|" value={isFinite(parts!.bound) ? parts!.bound.toFixed(4) : '–'} />
                <Readout label="실적분의 참값" value={parts!.exact.toFixed(6)} color="var(--good)" />
              </div>
            </>
          )}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: the argument principle ─────────────── */

function ArgumentFigure() {
  const P = usePalette();
  const [cx, setCx] = useState(0);
  const [cy, setCy] = useState(0);
  const [r, setR] = useState(0.5);
  const [withPole, setWithPole] = useState(false);
  const center: C = [cx, cy];
  const plotRef = useRef<Plot | null>(null);
  const curve = useMemo(() => imageCurve([cx, cy], r, withPole), [cx, cy, r, withPole]);
  const wind = Math.round(winding(curve) * 1000) / 1000;
  const N = ARG_ZEROS.filter((q) => inside(q, center, r)).length;
  const Pn = withPole && inside(ARG_POLE, center, r) ? 1 : 0;
  const f = (z: C) => argF(z, withPole);

  const left = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -2, xMax: 2, yMin: -2, yMax: 2, equal: true, pad: { l: 26, r: 8, t: 8, b: 22 } });
      plotRef.current = p;
      paint(p, P, f, 3);
      p.grid({ xStep: 1, yStep: 1 });
      circlePath(p, center, r, P.ink);
      ARG_ZEROS.forEach((q) => zeroMark(p, P, q, inside(q, center, r)));
      if (withPole) poleMark(p, P, ARG_POLE, inside(ARG_POLE, center, r));
      p.dot(cx, cy, 6, P.accent, P.surface);
    },
    [P, cx, cy, r, withPole],
    { aspect: 1, maxHeight: 340 },
  );

  const right = useCanvas2D(
    (ctx, { w, h }) => {
      let m = 0.5;
      for (const z of curve) m = Math.max(m, Math.abs(z[0]), Math.abs(z[1]));
      m = Math.min(m * 1.1, 60);
      const p = new Plot(ctx, w, h, P, { xMin: -m, xMax: m, yMin: -m, yMax: m, equal: true, pad: { l: 30, r: 8, t: 8, b: 22 } });
      p.grid({ labels: false });
      const c = p.ctx;
      c.save();
      p.clip();
      c.strokeStyle = P.accent;
      c.lineWidth = 2;
      c.beginPath();
      curve.forEach((z, k) => (k ? c.lineTo(p.X(z[0]), p.Y(z[1])) : c.moveTo(p.X(z[0]), p.Y(z[1]))));
      c.stroke();
      p.unclip();
      c.restore();
      p.dot(0, 0, 6, P.bad, P.surface);
      p.text('0', 0, 0, P.bad, { dx: 10, dy: -10, font: `700 12px ${P.fontMono}` });
    },
    [P, curve],
    { aspect: 1, maxHeight: 340 },
  );

  useDrag(left.wrapRef, {
    hit: (x, y) => {
      const p = plotRef.current;
      if (!p) return null;
      return Math.hypot(x - p.X(cx), y - p.Y(cy)) < 18 ? 'c' : null;
    },
    onDrag: (_, x, y) => {
      const p = plotRef.current;
      if (!p) return;
      setCx(Math.max(-1.8, Math.min(1.8, Math.round(p.invX(x) * 20) / 20)));
      setCy(Math.max(-1.8, Math.min(1.8, Math.round(p.invY(y) * 20) / 20)));
    },
  });

  return (
    <Figure
      no={4}
      title="경로의 상이 0을 몇 번 감는가"
      hint="원을 키우거나 끌어서 영점을 넣고 빼 보세요"
      caption={
        <>
          왼쪽은 <M>{'f(z) = (z-a_1)(z-a_2)(z-a_3)'}</M>의 정의역 색칠과 원 γ입니다. 영점 <M>{'a_1 = 0.8 + 0.5i'}</M>, <M>{'a_2 = -0.9 + 0.3i'}</M>, <M>{'a_3 = 0.1 - i'}</M>는 둥근 점, 원 안에 든 것은 채운 점입니다. 오른쪽은 z가 γ를 한 바퀴 도는 동안 w = f(z)가 그리는 곡선이고, 빨간 점이 0입니다. "극 넣기"를 켜면 f를 <M>{'z - p'}</M>, <M>{'p = -0.2 + 0.9i'}</M>로 나눈 함수가 됩니다. 감은 횟수는 곡선을 따라 편각이 바뀐 양을 모두 더해 2π로 나눈 값입니다.
        </>
      }
    >
      <div className="rs-planes">
        <div>
          <div className="rs-plane-title">z 평면</div>
          <div ref={left.wrapRef} className="canvas-box grab" role="img" aria-label={`원 γ의 중심 (${cx.toFixed(2)}, ${cy.toFixed(2)}), 반지름 ${r.toFixed(2)}. 원 안의 영점 ${N}개, 극 ${Pn}개.`}>
            <canvas ref={left.canvasRef} />
          </div>
        </div>
        <div>
          <div className="rs-plane-title">w = f(z) 평면</div>
          <div ref={right.wrapRef} className="canvas-box" role="img" aria-label={`원의 상 f(γ)가 원점을 ${wind}번 감습니다.`}>
            <canvas ref={right.canvasRef} />
          </div>
        </div>
      </div>
      <div className="controls row" style={{ marginTop: 12 }}>
        <Slider id="rs4-r" label="반지름" value={r} min={0.1} max={2} step={0.05} onChange={setR} format={(v) => v.toFixed(2)} />
        <Slider id="rs4-x" label="중심의 실수부" value={cx} min={-1.8} max={1.8} step={0.05} onChange={setCx} format={(v) => v.toFixed(2)} />
        <Slider id="rs4-y" label="중심의 허수부" value={cy} min={-1.8} max={1.8} step={0.05} onChange={setCy} format={(v) => v.toFixed(2)} />
        <Check label="극 넣기 (f를 z − p로 나누기)" checked={withPole} onChange={setWithPole} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 10 }}>
        <Readout label="원 안의 영점 N" value={N} />
        <Readout label="원 안의 극 P" value={Pn} />
        <Readout label="f(γ)가 0을 감은 횟수" value={Math.abs(wind - Math.round(wind)) < 0.01 ? String(Math.round(wind)) : wind.toFixed(2)} color="var(--good)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Residues() {
  return (
    <>
      <h2>닫힌 경로의 적분이 기억하는 단 하나의 수</h2>
      <p>
        <a href={lessonHref('math-complex-analysis', 'contour-integrals')}>앞 장</a>에서 정칙 함수를 닫힌 경로를 따라 적분하면 0이 되고, 경로를 끌어 모양을 바꿔도 값이 그대로라는 것을 보았습니다. 그렇다면 경로 안에 함수가 터지는 점, 곧 <T en="pole">극</T>이 있으면 어떻게 될까요? 경로를 극 쪽으로 오그려도 값은 그대로이므로, 결국 극 바로 둘레의 아주 작은 원에서의 적분만 남습니다. 그리고 그 작은 원 위에서는 함수의 로랑 급수 중 딱 한 항만 살아남습니다.
      </p>
      <Proof title="보조정리. 원 위의 거듭제곱 적분">
        <p>
          정수 n과 r &gt; 0에 대해, 시계 반대 방향의 원 <M>{'|z - a| = r'}</M> 위에서
        </p>
        <MB>{'\\oint (z-a)^n\\,dz = \\begin{cases} 2\\pi i & n = -1 \\\\ 0 & n \\ne -1 \\end{cases}'}</MB>
        <p>
          증명. <M>{'z = a + re^{it}'}</M>, <M>{'0 \\le t \\le 2\\pi'}</M>로 놓으면 <M>{'dz = ire^{it}\\,dt'}</M>이므로 적분은 <M>{'\\int_0^{2\\pi} r^n e^{int}\\, i r e^{it}\\, dt = i r^{n+1}\\int_0^{2\\pi} e^{i(n+1)t}\\, dt'}</M>입니다. n = −1이면 피적분 함수가 1이라 값이 <M>{'2\\pi i'}</M>입니다. n ≠ −1이면 <M>{'e^{i(n+1)t}'}</M>의 원시함수 <M>{'e^{i(n+1)t}/(i(n+1))'}</M>가 t = 0과 t = 2π에서 같은 값을 가지므로 적분이 0입니다. <Qed />
        </p>
      </Proof>
      <p>
        극 a 둘레에서 f를 로랑 급수 <M>{'f(z) = \\sum_{n} c_n (z-a)^n'}</M>으로 쓰고 항마다 적분하면, 보조정리에 따라 <M>{'n = -1'}</M>인 항 하나만 <M>{'2\\pi i\\, c_{-1}'}</M>을 남깁니다. 이 계수 <M>{'c_{-1}'}</M>을 a에서의 <T en="residue">유수</T>라고 하고 <M>{'\\operatorname{Res}_{z=a} f'}</M>로 씁니다. 급수 전체를 구하지 않아도 유수는 쉽게 계산할 수 있습니다.
      </p>
      <MB note="m은 극의 차수, 곧 (z − a)ᵐ f(z)가 a에서 0이 아닌 유한한 값을 갖게 하는 가장 작은 m입니다.">{'\\text{단순극: } \\operatorname{Res}_{z=a} \\frac{g(z)}{h(z)} = \\frac{g(a)}{h\'(a)} \\qquad \\text{m차 극: } \\operatorname{Res}_{z=a} f = \\frac{1}{(m-1)!}\\lim_{z\\to a} \\frac{d^{m-1}}{dz^{m-1}}\\big[(z-a)^m f(z)\\big]'}</MB>
      <OnePoleFigure />
      <p>
        <M>{'1/(z^2+1)'}</M>의 극 i에서 유수는 <M>{'1/(2i) = -i/2'}</M>이고, 그림의 수치 적분도 반지름 0.1에서 1.9까지 −0.500000i로 같습니다. 반지름이 2를 넘으면 다른 극 −i가 원 안에 들어오고, 그 유수 <M>{'+i/2'}</M>와 더해져 적분값이 0으로 떨어집니다. 2차 극을 가진 <M>{'e^z/(z-1)^2'}</M>는 다른 특이점이 없어서 반지름을 3까지 키워도 유수 e = 2.718282가 그대로입니다.
      </p>

      <h2>유수 정리</h2>
      <div className="rs-thm">
        <span className="rs-thm-head">유수 정리.</span> f가 단순 닫힌 경로 γ와 그 안쪽에서 유한 개의 극 <M>{'a_1, \\dots, a_k'}</M>를 빼고 정칙이고, γ가 시계 반대 방향이면
        <MB>{'\\oint_\\gamma f(z)\\,dz = 2\\pi i \\sum_{j=1}^{k} \\operatorname{Res}_{z=a_j} f'}</MB>
      </div>
      <p>
        증명의 줄기는 위와 같습니다. 코시 정리로 γ를 각 극 둘레의 작은 원들로 오그리고, 작은 원마다 보조정리를 쓰면 유수 하나씩이 남습니다. 그림 2에서 원을 끌고 다녀 보세요. 원 안의 극이 같은 동안은 수치 적분값이 소수점 여섯째 자리까지 바뀌지 않고, 극 하나가 경계를 넘는 순간에만 그 극의 유수만큼 뜁니다.
      </p>
      <ThreePolesFigure />
      <p>
        처음 원(중심 0.6 + 0.2i, 반지름 0.7)은 <M>{'p_1'}</M>만 감싸서 적분값이 <M>{'p_1'}</M>의 유수 0.2130 − 0.1147i입니다. 세 유수 0.2130 − 0.1147i, 0.2294i, −0.2130 − 0.1147i를 더하면 정확히 0이 되므로, 세 극을 모두 감싸는 원의 적분도 0입니다. 이것은 우연이 아닙니다. f가 멀리서 <M>{'1/z^3'}</M>처럼 줄어들어서, 아주 큰 원 위의 적분은 원 둘레 <M>{'2\\pi R'}</M>에 크기 <M>{'1/R^3'}</M>을 곱한 것보다 작고, R → ∞에서 0이기 때문입니다.
      </p>

      <h2>실수의 적분을 복소수로 풀기</h2>
      <p>
        유수 정리의 가장 놀라운 쓰임은 실수만 나오는 적분을 계산하는 것입니다. <M>{'\\int_{-\\infty}^{\\infty} \\frac{dx}{1+x^4}'}</M>은 부분분수로 풀면 손이 많이 가지만, 실수 직선에 위쪽 반원을 붙여 닫힌 경로를 만들면 위쪽 반평면의 극 두 개의 유수만 더하면 됩니다. 반원 위의 적분은 길이 <M>{'\\pi R'}</M>에 피적분 함수의 최댓값 <M>{'1/(R^4-1)'}</M>을 곱한 것보다 작으므로 R이 커지면 사라집니다.
      </p>
      <MB>{'\\int_{-\\infty}^{\\infty} \\frac{dx}{1+x^2} = 2\\pi i \\cdot \\frac{1}{2i} = \\pi, \\qquad \\int_{-\\infty}^{\\infty} \\frac{dx}{1+x^4} = 2\\pi i\\left(\\operatorname{Res}_{e^{i\\pi/4}} + \\operatorname{Res}_{e^{3i\\pi/4}}\\right) = \\frac{\\pi}{\\sqrt 2}'}</MB>
      <RealIntegralFigure />
      <p>
        <M>{'1/(1+x^2)'}</M>에서 R = 2이면 선분의 몫은 2.214297, 반원의 몫은 0.927295이고 합은 π = 3.141593입니다. R = 10이면 반원의 몫이 0.199337로 줄고, 선분의 몫 2.942255가 π에 다가갑니다. <M>{'1/(1+x^4)'}</M>은 반원의 몫이 훨씬 빨리 사라져서 R = 10에서 0.000667이고, 선분의 몫 2.220775가 벌써 <M>{'\\pi/\\sqrt2 = 2.221441'}</M>에 아주 가깝습니다. R &lt; 1이면 경로 안에 극이 없어서 선분과 반원이 서로를 지워 합이 0입니다.
      </p>
      <p>
        삼각함수의 적분은 단위원 위의 적분으로 바꿉니다. <M>{'\\int_0^{2\\pi} \\frac{d\\theta}{2 + \\cos\\theta}'}</M>에서 <M>{'z = e^{i\\theta}'}</M>로 놓으면 피적분 함수가 <M>{'\\frac{2}{i(z^2 + 4z + 1)}'}</M>이 되고, 두 극 <M>{'-2 \\pm \\sqrt 3'}</M> 중 단위원 안의 <M>{'z_0 = -2 + \\sqrt3 \\approx -0.268'}</M> 하나만 셉니다. 답은 <M>{'2\\pi/\\sqrt3 = 3.627599'}</M>이고, 그림의 심프슨 적분과 여섯 자리까지 같습니다.
      </p>

      <h2>편각 원리: 영점과 극을 세기</h2>
      <p>
        유수 정리를 <M>{"f'/f"}</M>에 쓰면 더 놀라운 결과가 나옵니다. f가 a에서 k차 영점을 가지면 <M>{"f'/f"}</M>는 a에서 유수가 k인 단순극을 갖고, k차 극이면 유수가 −k입니다. 그래서
      </p>
      <MB>{"\\frac{1}{2\\pi i}\\oint_\\gamma \\frac{f'(z)}{f(z)}\\,dz = N - P"}</MB>
      <p>
        입니다. N은 γ 안의 영점 수, P는 극 수(차수만큼 셈)입니다. 왼쪽 적분은 <M>{'\\log f'}</M>가 경로를 한 바퀴 돌며 바뀐 양을 2πi로 나눈 것이고, 실수부 <M>{'\\log|f|'}</M>는 제자리로 돌아오므로 남는 것은 편각의 변화, 곧 곡선 f(γ)가 0을 감은 횟수입니다. 이것을 <T en="argument principle">편각 원리</T>라고 합니다.
      </p>
      <ArgumentFigure />
      <p>
        처음 원(중심 0, 반지름 0.5)에는 영점이 없어서 오른쪽 곡선이 0을 감지 않습니다. 반지름을 1.2로 키우면 세 영점이 모두 들어오고 곡선이 0을 정확히 세 번 감습니다. 여기서 "극 넣기"를 켜면 극 하나가 함께 들어와 감은 횟수가 3 − 1 = 2로 줄고, 극만 감싸는 작은 원은 곡선이 거꾸로 한 번 감아 −1이 됩니다. 함수의 식을 몰라도 경계를 따라 값만 재면 안쪽의 영점 수를 알 수 있다는 뜻이고, 제어공학에서 계가 안정한지 판정하는 나이퀴스트 판정법이 바로 이 원리를 씁니다. 전달 함수의 극으로 계의 응답을 읽는 이야기는 <a href={lessonHref('math-differential-equations', 'laplace')}>라플라스 변환</a> 장에 있습니다.
      </p>
      <Callout kind="key">
        극 a 둘레의 작은 원 위의 적분은 로랑 급수의 <M>{'(z-a)^{-1}'}</M> 항만 남겨 <M>{'2\\pi i \\operatorname{Res}_a f'}</M>가 됩니다. 그래서 닫힌 경로의 적분은 안에 든 극들의 유수를 더해 2πi를 곱한 값이고, 경로를 어떻게 움직여도 극이 경계를 넘을 때만 바뀝니다. 실수 직선에 반원을 붙이거나 θ를 단위원 위의 z로 바꾸면 실수 적분을 유수 몇 개로 계산할 수 있고, <M>{"f'/f"}</M>의 적분은 경로 안의 영점 수에서 극 수를 뺀 값, 곧 f(γ)가 0을 감은 횟수입니다.
      </Callout>
      <Quiz
        q={<>시계 반대 방향의 원 |z| = 2 위에서 <M>{'\\oint \\frac{dz}{z(z-1)}'}</M>의 값은?</>}
        options={['0', '2πi', '−2πi', 'πi']}
        answer={0}
        explain={
          <>
            극 0과 1이 모두 원 안에 있습니다. 유수는 <M>{'\\operatorname{Res}_0 = \\frac{1}{0 - 1} = -1'}</M>, <M>{'\\operatorname{Res}_1 = \\frac{1}{1} = 1'}</M>이고 합이 0이므로 적분은 0입니다. 반지름이 1보다 작은 원이었다면 극 0만 들어와 −2πi가 됩니다.
          </>
        }
      />
    </>
  );
}
