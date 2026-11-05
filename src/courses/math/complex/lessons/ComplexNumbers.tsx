import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { abs, arg, blit, cpow, domainColor, drawPlane, fmtC, fromPolar, mul, presets, windingAround, type Box, type C, type Mapper } from './cplx';
import './complex.css';
import './numbers.css';

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;
const fmtDeg = (r: number) => `${deg(r).toFixed(1).replace('-', '−')}°`;

/** An arrow from a to b in screen coordinates. */
function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width = 2.5) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const L = Math.hypot(x1 - x0, y1 - y0);
  const hd = Math.min(10, L * 0.35);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - Math.cos(a) * hd * 0.6, y1 - Math.sin(a) * hd * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - hd * Math.cos(a - 0.4), y1 - hd * Math.sin(a - 0.4));
  ctx.lineTo(x1 - hd * Math.cos(a + 0.4), y1 - hd * Math.sin(a + 0.4));
  ctx.closePath();
  ctx.fill();
}

function handle(ctx: CanvasRenderingContext2D, P: Palette, x: number, y: number, color: string, label: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = P.surface;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `700 13px ${P.fontMono}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, x + 9, y - 6);
}

/** An arc for an angle from 0 to t around the origin, radius r in pixels. */
function angleArc(ctx: CanvasRenderingContext2D, m: Mapper, from: number, to: number, r: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  // canvas y points down, so angles are negated
  ctx.arc(m.X(0), m.Y(0), r, -from, -to, to > from);
  ctx.stroke();
}

/* ─────────────── Figure 1: multiplying rotates and scales ─────────────── */

const MUL_BOX: Box = { x0: -2.2, x1: 2.2, y0: -1.3, y1: 2.3 };

function MultiplyFigure() {
  const P = usePalette();
  const [rz, setRz] = useState(1.5);
  const [tz, setTz] = useState(30);
  const [rw, setRw] = useState(1.2);
  const [tw, setTw] = useState(45);
  const z = fromPolar(rz, rad(tz));
  const w = fromPolar(rw, rad(tw));
  const zw = mul(z, w);
  const mref = useRef<Mapper | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: W, h: H }) => {
      const m = drawPlane(ctx, P, MUL_BOX, { x: 6, y: 6, w: W - 12, h: H - 12 });
      mref.current = m;
      // unit circle for scale
      ctx.strokeStyle = alpha(P.ink3, 0.5);
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(m.X(0), m.Y(0), m.k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      angleArc(ctx, m, 0, arg(z), 26, P.neg);
      angleArc(ctx, m, arg(z), arg(z) + arg(w), 40, P.good);
      const pts: [C, string, string][] = [
        [z, P.neg, 'z'],
        [w, P.good, 'w'],
        [zw, P.pos, 'zw'],
      ];
      for (const [p, c] of pts) arrow(ctx, m.X(0), m.Y(0), m.X(p[0]), m.Y(p[1]), c, p === zw ? 3 : 2.2);
      for (const [p, c, l] of pts) handle(ctx, P, m.X(p[0]), m.Y(p[1]), c, l);
    },
    [P, rz, tz, rw, tw],
    { aspect: 1.2, maxHeight: 440, minHeight: 40 },
  );

  useDrag(wrapRef, {
    hit: (x, y) => {
      const m = mref.current;
      if (!m) return null;
      const d = (p: C) => Math.hypot(m.X(p[0]) - x, m.Y(p[1]) - y);
      if (d(z) < 16) return 'z';
      if (d(w) < 16) return 'w';
      return null;
    },
    onDrag: (id, x, y) => {
      const m = mref.current;
      if (!m) return;
      const p: C = [m.invX(x), m.invY(y)];
      const r = Math.min(2, Math.max(0.2, abs(p)));
      const t = Math.round(deg(arg(p)));
      if (id === 'z') {
        setRz(Math.round(r * 20) / 20);
        setTz(t);
      } else {
        setRw(Math.round(r * 20) / 20);
        setTw(t);
      }
    },
  });

  return (
    <Figure
      no={1}
      title="곱하기는 돌리고 늘리기"
      hint="z와 w를 끌어 보세요"
      caption={<>파란 화살표가 z, 초록 화살표가 w, 주황 화살표가 곱 zw입니다. 점선은 반지름 1인 원입니다. 곱의 편각은 두 편각의 합(두 호를 이어 붙인 각)이고, 곱의 길이는 두 길이의 곱입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`복소평면. z = ${fmtC(z)} (길이 ${rz.toFixed(2)}, 편각 ${tz}°), w = ${fmtC(w)} (길이 ${rw.toFixed(2)}, 편각 ${tw}°), zw = ${fmtC(zw)} (길이 ${abs(zw).toFixed(2)}, 편각 ${fmtDeg(arg(zw))}).`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider label="|z|" value={rz} min={0.2} max={2} step={0.05} onChange={setRz} format={(v) => v.toFixed(2)} color="var(--neg)" />
          <Slider label="z의 편각" value={tz} min={-180} max={180} step={1} onChange={setTz} format={(v) => `${v}°`} color="var(--neg)" />
          <Slider label="|w|" value={rw} min={0.2} max={2} step={0.05} onChange={setRw} format={(v) => v.toFixed(2)} color="var(--good)" />
          <Slider label="w의 편각" value={tw} min={-180} max={180} step={1} onChange={setTw} format={(v) => `${v}°`} color="var(--good)" />
          <div className="btn-row">
            <Button small onClick={() => { setRw(1); setTw(90); }}>w = i</Button>
            <Button small onClick={() => { setRw(1); setTw(180); }}>w = −1</Button>
          </div>
          <div className="cn-readouts">
            <Readout label="zw" value={fmtC(zw)} color="var(--pos)" />
            <Readout label="|zw|" value={abs(zw).toFixed(2)} />
            <Readout label="zw의 편각" value={fmtDeg(arg(zw))} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: Euler's formula ─────────────── */

const EULER_BOX: Box = { x0: -1.35, x1: 1.35, y0: -1.35, y1: 1.35 };

function EulerFigure() {
  const P = usePalette();
  const [theta, setTheta] = useState(1);
  const p = fromPolar(1, theta);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const m = drawPlane(ctx, P, EULER_BOX, { x: 6, y: 6, w: w - 12, h: h - 12 }, { step: 0.5 });
      ctx.strokeStyle = P.ink2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(m.X(0), m.Y(0), m.k, 0, Math.PI * 2);
      ctx.stroke();
      // the arc of length θ that e^{iθ} has travelled
      ctx.strokeStyle = P.pos;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(m.X(0), m.Y(0), m.k, 0, -theta, theta > 0);
      ctx.stroke();
      // projections: cos on the real axis, sin on the imaginary axis
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = P.neg;
      ctx.beginPath();
      ctx.moveTo(m.X(p[0]), m.Y(p[1]));
      ctx.lineTo(m.X(p[0]), m.Y(0));
      ctx.stroke();
      ctx.strokeStyle = P.good;
      ctx.beginPath();
      ctx.moveTo(m.X(p[0]), m.Y(p[1]));
      ctx.lineTo(m.X(0), m.Y(p[1]));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 5;
      ctx.strokeStyle = P.neg;
      ctx.beginPath();
      ctx.moveTo(m.X(0), m.Y(0));
      ctx.lineTo(m.X(p[0]), m.Y(0));
      ctx.stroke();
      ctx.strokeStyle = P.good;
      ctx.beginPath();
      ctx.moveTo(m.X(0), m.Y(0));
      ctx.lineTo(m.X(0), m.Y(p[1]));
      ctx.stroke();
      arrow(ctx, m.X(0), m.Y(0), m.X(p[0]), m.Y(p[1]), P.ink, 2);
      handle(ctx, P, m.X(p[0]), m.Y(p[1]), P.pos, 'eⁱᶿ');
    },
    [P, theta],
    { aspect: 1, maxHeight: 380, minHeight: 40 },
  );

  return (
    <Figure
      no={2}
      title="오일러 공식: 단위원 위를 걷는 지수 함수"
      hint="θ를 움직이세요"
      caption={<>주황 호의 길이가 θ입니다. 점 e^(iθ)의 실수부(파란 막대)는 cos θ, 허수부(초록 막대)는 sin θ입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`단위원 위의 점 e^(iθ), θ = ${theta.toFixed(2)}. 실수부 cos θ = ${Math.cos(theta).toFixed(3)}, 허수부 sin θ = ${Math.sin(theta).toFixed(3)}.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider label="θ (라디안)" value={theta} min={-Math.PI} max={2 * Math.PI} step={0.01} onChange={setTheta} format={(v) => v.toFixed(2)} color="var(--pos)" />
          <div className="btn-row">
            <Button small onClick={() => setTheta(Math.PI / 2)}>θ = π/2</Button>
            <Button small onClick={() => setTheta(Math.PI)}>θ = π</Button>
            <Button small onClick={() => setTheta(2 * Math.PI)}>θ = 2π</Button>
          </div>
          <div className="cn-readouts">
            <Readout label="cos θ" value={Math.cos(theta).toFixed(3)} color="var(--neg)" />
            <Readout label="sin θ" value={Math.sin(theta).toFixed(3)} color="var(--good)" />
            <Readout label="e^(iθ)" value={fmtC(p, 3)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: powers and roots of unity ─────────────── */

function PowersFigure() {
  const P = usePalette();
  const [mode, setMode] = useState<'powers' | 'roots'>('powers');
  const [r, setR] = useState(1.1);
  const [t, setT] = useState(25);
  const [n, setN] = useState(6);
  const [k, setK] = useState(1);
  const N = 12;
  const z = fromPolar(r, rad(t));
  const pw = Array.from({ length: N + 1 }, (_, i) => cpow(z, i));
  const roots = Array.from({ length: n }, (_, i) => fromPolar(1, (2 * Math.PI * i) / n));
  const gen = roots[k % n];
  // order of ω^k in the group of n-th roots: n / gcd(n, k)
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const order = n / gcd(n, k % n || n);
  const box: Box = mode === 'powers' ? { x0: -3.6, x1: 3.6, y0: -3.6, y1: 3.6 } : { x0: -1.35, x1: 1.35, y0: -1.35, y1: 1.35 };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const m = drawPlane(ctx, P, box, { x: 6, y: 6, w: w - 12, h: h - 12 }, { step: mode === 'powers' ? 1 : 0.5 });
      ctx.strokeStyle = alpha(P.ink3, 0.6);
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(m.X(0), m.Y(0), m.k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (mode === 'powers') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(m.rect.x, m.rect.y, m.rect.w, m.rect.h);
        ctx.clip();
        ctx.strokeStyle = alpha(P.pos, 0.7);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        pw.forEach((p, i) => (i ? ctx.lineTo(m.X(p[0]), m.Y(p[1])) : ctx.moveTo(m.X(p[0]), m.Y(p[1]))));
        ctx.stroke();
        pw.forEach((p, i) => {
          ctx.fillStyle = i === 1 ? P.neg : P.pos;
          ctx.beginPath();
          ctx.arc(m.X(p[0]), m.Y(p[1]), i === 1 ? 6 : 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = P.ink2;
          ctx.font = `10px ${P.fontMono}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(String(i), m.X(p[0]) + 5, m.Y(p[1]) - 3);
        });
        ctx.restore();
      } else {
        // the polygon of roots, and the cycle that ω^k generates
        ctx.strokeStyle = P.ink3;
        ctx.lineWidth = 1;
        ctx.beginPath();
        roots.forEach((p, i) => (i ? ctx.lineTo(m.X(p[0]), m.Y(p[1])) : ctx.moveTo(m.X(p[0]), m.Y(p[1]))));
        ctx.closePath();
        ctx.stroke();
        ctx.strokeStyle = P.pos;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let j = 0; j <= order; j++) {
          const p = cpow(gen, j);
          if (j) ctx.lineTo(m.X(p[0]), m.Y(p[1]));
          else ctx.moveTo(m.X(p[0]), m.Y(p[1]));
        }
        ctx.stroke();
        roots.forEach((p, i) => {
          const hitByGen = Array.from({ length: order }, (_, j) => (j * (k % n)) % n).includes(i);
          ctx.fillStyle = hitByGen ? P.pos : P.surface2;
          ctx.strokeStyle = P.ink2;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(m.X(p[0]), m.Y(p[1]), 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = P.ink2;
          ctx.font = `11px ${P.fontMono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const lp = fromPolar(1.2, (2 * Math.PI * i) / n);
          ctx.fillText(`ω${i ? (i === 1 ? '' : i.toString().replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d])) : '⁰'}`, m.X(lp[0]), m.Y(lp[1]));
        });
      }
    },
    [P, mode, r, t, n, k],
    { aspect: 1, maxHeight: 400, minHeight: 40 },
  );

  const last = pw[N];
  return (
    <Figure
      no={3}
      title="거듭제곱의 나선과 단위근의 다각형"
      hint="모드를 바꾸고 슬라이더를 움직이세요"
      caption={
        mode === 'powers' ? (
          <>z, z², z³, …, z¹²를 차례로 이은 선입니다(파란 점이 z). 한 번 곱할 때마다 같은 각만큼 돌고 같은 비율로 늘어나므로 점들은 나선을 그립니다. |z| = 1이면 원 위를 돌기만 합니다.</>
        ) : (
          <>zⁿ = 1의 해 n개는 단위원을 n등분한 꼭짓점입니다. 주황 꼭짓점은 ω^k의 거듭제곱이 닿는 곳이고, 주황 선은 그 순서대로 이은 것입니다.</>
        )
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={mode === 'powers' ? `z = ${fmtC(z)}의 0제곱부터 12제곱까지 이은 나선. z¹² = ${fmtC(last)}, 길이 ${abs(last).toFixed(2)}.` : `${n}제곱근 ${n}개가 정${n}각형을 이룹니다. ω^${k}의 거듭제곱은 ${order}개의 꼭짓점을 돕니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg value={mode} onChange={setMode} options={[{ value: 'powers', label: '거듭제곱' }, { value: 'roots', label: '단위근' }]} />
          {mode === 'powers' ? (
            <>
              <Slider label="|z|" value={r} min={0.8} max={1.2} step={0.01} onChange={setR} format={(v) => v.toFixed(2)} />
              <Slider label="z의 편각" value={t} min={-90} max={90} step={1} onChange={setT} format={(v) => `${v}°`} />
              <div className="cn-readouts">
                <Readout label="z¹²의 길이" value={abs(last).toFixed(2)} />
                <Readout label="z¹²의 편각" value={`${((t * 12) % 360 + 360) % 360}°`} />
                <Readout label="z¹²" value={fmtC(last)} />
              </div>
            </>
          ) : (
            <>
              <Slider label="n" value={n} min={2} max={12} step={1} onChange={(v) => { setN(v); setK(1); }} />
              <Slider label="생성원 ω^k의 k" value={k} min={1} max={n - 1} step={1} onChange={setK} />
              <div className="cn-readouts">
                <Readout label="ω" value={fmtC(roots[1 % n], 3)} />
                <Readout label={`ω^${k}의 위수`} value={order} />
                <Readout label="다 닿는가" value={order === n ? '예' : '아니오'} color={order === n ? 'var(--good)' : 'var(--bad)'} />
              </div>
            </>
          )}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: domain colouring ─────────────── */

const DC_BOX: Box = { x0: -2, x1: 2, y0: -2, y1: 2 };
const DC_RES = 180;
const DC_KEYS = ['z', 'z2', 'z3m1', 'inv', 'mobius', 'exp', 'sin', 'sqrt', 'essential'] as const;
type DcKey = (typeof DC_KEYS)[number];

function DomainFigure() {
  const P = usePalette();
  const [key, setKey] = useState<DcKey>('z');
  const [layer, setLayer] = useState<'hue' | 'bands' | 'both'>('both');
  const [cx, setCx] = useState(0);
  const [cy, setCy] = useState(0);
  const [cr, setCr] = useState(0.5);
  const fn = presets[key];
  const img = useMemo(() => domainColor(fn.f, DC_BOX, DC_RES, DC_RES, { hue: layer !== 'bands', bands: layer !== 'hue' }), [fn, layer]);
  const wind = useMemo(() => windingAround(fn.f, [cx, cy], cr), [fn, cx, cy, cr]);
  const mref = useRef<Mapper | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const m = drawPlane(ctx, P, DC_BOX, { x: 4, y: 4, w: w - 8, h: h - 8 }, { grid: false, labels: false });
      mref.current = m;
      blit(ctx, img, DC_RES, DC_RES, m.rect.x, m.rect.y, m.rect.w, m.rect.h);
      // axes over the image
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(m.rect.x, Math.round(m.Y(0)) + 0.5);
      ctx.lineTo(m.rect.x + m.rect.w, Math.round(m.Y(0)) + 0.5);
      ctx.moveTo(Math.round(m.X(0)) + 0.5, m.rect.y);
      ctx.lineTo(Math.round(m.X(0)) + 0.5, m.rect.y + m.rect.h);
      ctx.stroke();
      // the probe circle
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(m.X(cx), m.Y(cy), cr * m.k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#111';
      ctx.beginPath();
      ctx.arc(m.X(cx), m.Y(cy), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    },
    [P, img, cx, cy, cr],
    { aspect: 1, maxHeight: 420, minHeight: 40 },
  );

  useDrag(wrapRef, {
    hit: () => 'c',
    onDrag: (_, x, y) => {
      const m = mref.current;
      if (!m) return;
      const px = Math.max(-1.9, Math.min(1.9, m.invX(x)));
      const py = Math.max(-1.9, Math.min(1.9, m.invY(y)));
      setCx(Math.round(px * 20) / 20);
      setCy(Math.round(py * 20) / 20);
    },
  });

  const windText = wind > 0 ? `영점이 ${wind}개 더 많음` : wind < 0 ? `극이 ${-wind}개 더 많음` : '같음 (또는 둘 다 없음)';
  return (
    <Figure
      no={4}
      title="정의역 색칠: 평면에서 평면으로 가는 함수 보기"
      hint="함수를 고르고, 그림을 눌러 원을 옮기세요"
      caption={
        <>
          점 z를 f(z)의 편각에 따라 색칠했습니다. 편각 0은 빨강, 120°는 초록, 240°는 파랑입니다. 밝기는 |f(z)|가 두 배가 될 때마다 어두운 색에서 밝은 색으로 한 번씩 올라갑니다. 흰 점선 원을 시계 반대 방향으로 한 바퀴 돌 때 f(z)가 0 둘레를 감는 횟수를 오른쪽에 셉니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`f(z) = ${fn.name}의 정의역 색칠, 실수부와 허수부 모두 −2부터 2까지. 중심 ${fmtC([cx, cy])}, 반지름 ${cr.toFixed(2)}인 원을 한 바퀴 돌면 f(z)가 0 둘레를 ${wind}번 감습니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg
            label="함수 f(z)"
            value={key}
            onChange={setKey}
            options={DC_KEYS.map((k) => ({ value: k, label: presets[k].name }))}
          />
          <Seg label="무엇을 칠할까" value={layer} onChange={setLayer} options={[{ value: 'hue', label: '편각만' }, { value: 'bands', label: '크기만' }, { value: 'both', label: '둘 다' }]} />
          <div className="cn-wheel" aria-hidden="true">
            <span>
              편각 0<i />
              360°
            </span>
            <span className="cn-band">
              |f| 1<i />4
            </span>
          </div>
          <Slider label="원의 중심 Re" value={cx} min={-1.9} max={1.9} step={0.05} onChange={setCx} format={(v) => v.toFixed(2)} />
          <Slider label="원의 중심 Im" value={cy} min={-1.9} max={1.9} step={0.05} onChange={setCy} format={(v) => v.toFixed(2)} />
          <Slider label="원의 반지름" value={cr} min={0.1} max={1.9} step={0.05} onChange={setCr} format={(v) => v.toFixed(2)} />
          <div className="cn-readouts">
            <Readout label="감는 횟수" value={wind} color={wind > 0 ? 'var(--good)' : wind < 0 ? 'var(--bad)' : undefined} />
            <Readout label="원 안의 영점과 극" value={windText} />
            <Readout label="f(중심)" value={fmtC(fn.f([cx, cy]))} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function ComplexNumbers() {
  return (
    <>
      <h2>평면 위의 수</h2>
      <p>
        <M>{'x^2 = -1'}</M>을 만족하는 실수는 없습니다. 이 방정식에 답을 주려고 들여온 수 <M>i</M>와 실수를 섞은 <M>{'z = x + iy'}</M>를 <T en="complex number">복소수</T>라고 합니다. <M>x</M>는 실수부, <M>y</M>는 허수부이고, 복소수 하나는 평면 위의 점 <M>{'(x, y)'}</M> 하나와 같습니다. 덧셈은 벡터처럼 성분끼리 더하면 되니 새로울 것이 없습니다. 복소수가 특별해지는 것은 곱셈입니다.
      </p>
      <MB>{'(a + ib)(c + id) = (ac - bd) + i(ad + bc)'}</MB>
      <p>
        식만 보면 무슨 일이 일어나는지 알기 어렵습니다. 점을 원점까지의 거리 <M>{'r = |z|'}</M>와 실수축에서 잰 각 <M>{'\\theta = \\arg z'}</M>로 적으면, 즉 <T en="polar form">극형식</T> <M>{'z = r(\\cos\\theta + i\\sin\\theta)'}</M>로 적으면 곱셈의 뜻이 드러납니다. 삼각함수의 덧셈정리를 쓰면 다음과 같습니다.
      </p>
      <MB>{'z_1 z_2 = r_1 r_2\\big(\\cos(\\theta_1 + \\theta_2) + i\\sin(\\theta_1 + \\theta_2)\\big)'}</MB>
      <p>길이는 곱해지고 각은 더해집니다. 복소수를 곱하는 것은 평면을 돌리고 늘리는 일입니다.</p>
      <MultiplyFigure />
      <p>
        처음 값은 <M>{'z = 1.5\\angle 30^\\circ'}</M>, <M>{'w = 1.2\\angle 45^\\circ'}</M>입니다. 곱 <M>{'zw'}</M>의 길이는 <M>{'1.5 \\times 1.2 = 1.8'}</M>, 편각은 <M>{'30^\\circ + 45^\\circ = 75^\\circ'}</M>이고, 성분으로 쓰면 <M>{'0.47 + 1.74i'}</M>입니다. <strong>w = i</strong>를 누르면 <M>z</M>가 길이는 그대로 90° 돌아갑니다. <M>i</M>를 곱하는 것이 90° 회전이니 두 번 곱하면 180° 회전, 곧 <M>{'-1'}</M>을 곱한 것과 같습니다. <M>{'i^2 = -1'}</M>이 그림으로는 이렇게 당연한 일이 됩니다.
      </p>
      <p>
        <M>{'z\\bar z = |z|^2'}</M>이 되게 하는 <T en="complex conjugate">켤레</T> <M>{'\\bar z = x - iy'}</M>는 실수축에 대한 대칭이고, 나눗셈은 길이를 나누고 각을 빼는 것입니다. 0이 아닌 복소수는 모두 역수를 가지므로 복소수는 실수처럼 사칙연산이 다 되는 체를 이룹니다.
      </p>

      <h2>오일러 공식</h2>
      <p>
        각 <M>{'\\theta'}</M>만큼 돌린 단위 길이의 점 <M>{'\\cos\\theta + i\\sin\\theta'}</M>는 곱하면 각이 더해지니, 지수 함수처럼 행동합니다(<M>{'e^a e^b = e^{a+b}'}</M>). 실제로 <M>{'e^x'}</M>, <M>{'\\cos x'}</M>, <M>{'\\sin x'}</M>의 <a href={lessonHref('math-calculus', 'series')}>테일러 급수</a>에 <M>{'x = i\\theta'}</M>를 넣고 실수 항과 허수 항을 모으면 다음 등식이 나옵니다.
      </p>
      <MB note="오일러 공식">{'e^{i\\theta} = \\cos\\theta + i\\sin\\theta'}</MB>
      <EulerFigure />
      <p>
        θ는 단위원 위에서 걸어간 호의 길이입니다. 처음 값 θ = 1에서 점은 <M>{'0.540 + 0.841i'}</M>에 있습니다. <strong>θ = π</strong>를 누르면 반 바퀴를 돌아 <M>{'e^{i\\pi} = -1'}</M>에 닿습니다. 이제 모든 복소수를 <M>{'z = re^{i\\theta}'}</M>로 쓸 수 있고, 곱셈 규칙은 지수 법칙 <M>{'r_1e^{i\\theta_1}\\cdot r_2e^{i\\theta_2} = r_1r_2e^{i(\\theta_1+\\theta_2)}'}</M> 한 줄이 됩니다.
      </p>

      <h2>거듭제곱과 단위근</h2>
      <p>
        같은 수를 거듭 곱하면 같은 각만큼 계속 돌고 같은 비율로 계속 늘어납니다. 그래서 <M>{'z^n = r^n e^{in\\theta}'}</M>의 점들은 나선을 그립니다(<T en="de Moivre's formula">드무아브르 공식</T>). 반대로 <M>{'z^n = 1'}</M>을 풀면, 길이는 1이고 각은 <M>{'2\\pi k/n'}</M>인 점 n개가 나옵니다. 이것을 n제곱근 <T en="roots of unity">단위근</T>이라고 합니다.
      </p>
      <PowersFigure />
      <p>
        거듭제곱 모드의 처음 값 <M>{'z = 1.1\\angle 25^\\circ'}</M>에서 <M>{'z^{12}'}</M>의 길이는 <M>{'1.1^{12} \\approx 3.14'}</M>이고 각은 <M>{'12 \\times 25^\\circ = 300^\\circ'}</M>입니다. 단위근 모드에서는 <M>{'\\omega = e^{2\\pi i/n}'}</M>의 거듭제곱이 정n각형의 꼭짓점을 차례로 밟습니다. n = 6에서 k = 2로 바꾸면 <M>{'\\omega^2'}</M>의 거듭제곱은 꼭짓점 3개만 돕니다. 단위근들은 곱셈에 대해 <a href={lessonHref('math-abstract-algebra', 'groups')}>순환군</a>을 이루고, <M>{'\\omega^k'}</M>가 군 전체를 만드는 생성원인 것은 k와 n이 서로소일 때뿐입니다.
      </p>

      <h2>평면에서 평면으로 가는 함수</h2>
      <p>
        이제 복소수를 넣고 복소수를 받는 함수 <M>{'f(z)'}</M>를 생각합니다. 입력이 2차원, 출력이 2차원이니 그래프를 그리려면 4차원이 필요합니다. 그래서 다른 방법을 씁니다. 입력 평면의 점 z마다 출력 <M>{'f(z)'}</M>의 정보를 <b>색으로</b> 칠하는 <T en="domain coloring">정의역 색칠</T>입니다.
      </p>
      <ol>
        <li>
          <b>색상</b>은 <M>{'f(z)'}</M>의 편각입니다. 양의 실수는 빨강, 편각 120°는 초록, 240°는 파랑이고, 그 사이는 무지개처럼 이어집니다.
        </li>
        <li>
          <b>밝기</b>는 <M>{'|f(z)|'}</M>입니다. 크기가 두 배가 될 때마다 어둡다가 밝아지는 띠가 하나씩 반복되므로, 띠의 경계는 크기가 같은 곳(등고선)입니다.
        </li>
      </ol>
      <DomainFigure />
      <p>
        <M>{'f(z) = z'}</M>는 이 색칠의 기준표입니다. 원점에서 모든 색이 만나고, 원점을 시계 반대 방향으로 돌면 빨강, 노랑, 초록, 청록, 파랑, 자홍 순서로 한 바퀴 돕니다. 원점에서 멀어질수록 크기가 커지니 띠가 바깥으로 퍼져 나갑니다. 다른 함수에서 같은 모습을 찾으면 됩니다.
      </p>
      <ul>
        <li>
          <b>영점</b>: 모든 색이 한 점에 모이고, 시계 반대 방향으로 돌 때 색이 <M>z</M>와 같은 순서로 돕니다. <M>{'z^2'}</M>을 고르면 원점 둘레에서 색이 두 바퀴 돕니다. 이중 영점입니다. <M>{'z^3 - 1'}</M>에서는 세 단위근 <M>{'1, e^{\\pm 2\\pi i/3}'}</M>에 영점이 하나씩 있습니다.
        </li>
        <li>
          <b>극</b>: 함숫값이 무한히 커지는 곳입니다. 색이 거꾸로 돕니다. <M>{'1/z'}</M>의 원점, <M>{'(z^2-1)/(z^2+1)'}</M>의 <M>{'\\pm i'}</M>가 그렇고, 이 함수의 영점은 <M>{'\\pm 1'}</M>입니다.
        </li>
        <li>
          <b>더 이상한 점</b>: <M>{'e^{1/z}'}</M>의 원점 근처에서는 모든 색과 모든 밝기가 무한히 뒤섞입니다. 이런 점을 <T en="essential singularity">진성 특이점</T>이라고 하며 <a href={lessonHref('math-complex-analysis', 'power-series')}>멱급수와 로랑 급수</a> 장에서 다시 봅니다. <M>{'\\sqrt z'}</M>는 음의 실수축에서 색이 갑자기 바뀝니다. 제곱근의 두 값 중 하나를 고르는 규칙이 거기서 끊기기 때문입니다.
        </li>
      </ul>
      <p>
        원을 옮겨 가며 감는 횟수를 세어 보세요. <M>{'z^3 - 1'}</M>에서 원점을 중심으로 반지름을 1.9로 키우면 세 영점이 모두 들어와 3이 됩니다. <M>{'(z^2-1)/(z^2+1)'}</M>에서 중심을 <M>i</M>(실수부 0, 허수부 1)로, 반지름을 0.3으로 두면 극 하나가 들어와 −1입니다. 반지름 1.9인 원은 영점 둘과 극 둘을 다 품어 0이 됩니다. 원 둘레의 값만 보고 안쪽의 영점과 극의 개수 차이를 알아내는 이 사실을 <T en="argument principle">편각 원리</T>라고 하며, <a href={lessonHref('math-complex-analysis', 'residues')}>유수 정리</a> 장에서 증명합니다.
      </p>
      <Callout kind="note">
        <a href={lessonHref('math-numerical-analysis', 'root-finding')}>방정식의 근</a> 장에서 본 뉴턴 방법의 분지 그림도 <M>{'z^3 - 1'}</M>의 세 영점을 다룹니다. 거기서는 각 점에서 출발한 반복이 어느 영점에 닿는지로 칠했고, 여기서는 그 점의 함숫값 자체로 칠했습니다. 같은 평면을 보는 서로 다른 두 지도입니다.
      </Callout>

      <Callout kind="key">
        복소수 <M>{'z = re^{i\\theta}'}</M>는 평면의 점이고, 곱셈은 길이를 곱하고 각을 더하는 회전과 확대입니다. 오일러 공식 <M>{'e^{i\\theta} = \\cos\\theta + i\\sin\\theta'}</M>가 이 사실을 지수 법칙으로 바꾸고, <M>{'z^n = 1'}</M>의 해는 정n각형의 꼭짓점입니다. 복소 함수는 정의역 색칠로 봅니다. 색상은 편각, 밝기는 크기를 나타내며, 모든 색이 정방향으로 모이는 곳이 영점, 거꾸로 모이는 곳이 극이고, 한 바퀴에 색이 도는 횟수가 그 차수입니다.
      </Callout>
      <Quiz
        q="정의역 색칠에서 어떤 점 a를 시계 반대 방향으로 한 바퀴 돌았더니 색이 빨강, 자홍, 파랑, 청록, 초록, 노랑, 빨강 순서로 두 번 돌았다. a는 무엇인가?"
        options={['이중 영점', '이중 극', '단순 영점', '진성 특이점']}
        answer={1}
        explain={<>z 자체를 칠한 기준표에서는 빨강, 노랑, 초록, 청록, 파랑, 자홍 순서로 돕니다. 이 순서가 거꾸로이면 편각이 줄어드는 것이니 극이고, 두 번 돌았으니 함숫값이 0 둘레를 −2번 감습니다. 1/(z − a)²처럼 차수가 2인 극입니다.</>}
      />
    </>
  );
}
