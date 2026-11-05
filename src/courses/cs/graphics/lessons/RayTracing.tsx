import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import { drawArrow } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { Framebuffer, present } from './gfx';
import { BVH_H, BVH_W, CIRCLES, DEFAULT_LIGHT, EYE, PLANE_X, PLANE_Y, WALL_Y, WORLD, buildBvh, bvhDepth, bvhRay, randomDiscs, renderRows, solveHit, trace2, traceBrute, traceBvh, type P2, type RayCounts, type Segment2 } from './ray';
import './graphics.css';
import './raytracing.css';

const nf = (v: number, d = 2) => (Math.abs(v) < 5e-12 ? 0 : v).toFixed(d);
const num = (v: number) => v.toLocaleString('ko-KR');

/* ─────────────── Figure 1: the scene from above ─────────────── */

/** World → canvas mapping for the top-down room (y grows away from the eye, drawn upward). */
function roomMap(w: number, h: number) {
  const m = 14;
  const s = Math.min((w - 2 * m) / WORLD.w, (h - 2 * m) / WORLD.h);
  const ox = (w - WORLD.w * s) / 2;
  const oy = (h - WORLD.h * s) / 2;
  return { s, X: (x: number) => ox + x * s, Y: (y: number) => oy + (WORLD.h - y) * s, inv: (px: number, py: number): P2 => [(px - ox) / s, WORLD.h - (py - oy) / s] };
}

function segColor(P: Palette, k: Segment2['kind']) {
  return k === 'primary' ? P.ink2 : k === 'shadow-lit' ? P.hl : k === 'shadow-blocked' ? P.bad : k === 'reflect' ? P.accent : P.ink3;
}

function drawEye(ctx: CanvasRenderingContext2D, P: Palette, x: number, y: number) {
  ctx.fillStyle = P.ink;
  ctx.beginPath();
  ctx.ellipse(x, y, 9, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P.surface;
  ctx.beginPath();
  ctx.arc(x, y - 0.5, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawLight(ctx: CanvasRenderingContext2D, P: Palette, x: number, y: number) {
  ctx.strokeStyle = P.hl;
  ctx.lineWidth = 2;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11);
    ctx.lineTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16);
    ctx.stroke();
  }
  ctx.fillStyle = P.hl;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

const insideCircle = (p: P2) => CIRCLES.some((c) => Math.hypot(p[0] - c.c[0], p[1] - c.c[1]) < c.r + 0.25);

function TopDownFigure() {
  const P = usePalette();
  const [n, setN] = useState(9);
  const [light, setLight] = useState<P2>(DEFAULT_LIGHT);
  const [sel, setSel] = useState(4);
  const [showShadow, setShowShadow] = useState(true);
  const k = Math.min(sel, n - 1);
  const traces = useMemo(() => Array.from({ length: n }, (_, i) => trace2(i, n, light)), [n, light]);
  const cur = traces[k];
  const moveLight = (p: P2) => {
    const q: P2 = [Math.max(0.3, Math.min(WORLD.w - 0.3, p[0])), Math.max(1.8, Math.min(WALL_Y - 0.25, p[1]))];
    if (!insideCircle(q)) setLight(q);
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const { s, X, Y } = roomMap(w, h);
      // room
      ctx.fillStyle = alpha(P.surface2, 0.6);
      ctx.fillRect(X(0), Y(WALL_Y), WORLD.w * s, (WALL_Y - 0) * s);
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(0), Y(WALL_Y));
      ctx.lineTo(X(WORLD.w), Y(WALL_Y));
      ctx.lineTo(X(WORLD.w), Y(0));
      ctx.stroke();
      // rays (selected one drawn last and thicker)
      const order = traces.map((_, i) => i).filter((i) => i !== k).concat([k]);
      for (const i of order) {
        const tr = traces[i];
        const on = i === k;
        for (const sg of tr.segments) {
          if (!showShadow && sg.kind.startsWith('shadow')) continue;
          ctx.strokeStyle = alpha(segColor(P, sg.kind), on ? 1 : 0.45);
          ctx.lineWidth = on ? 2.4 : 1.2;
          ctx.setLineDash(sg.kind === 'miss' ? [5, 4] : sg.kind.startsWith('shadow') ? [2, 3] : []);
          ctx.beginPath();
          ctx.moveTo(X(sg.from[0]), Y(sg.from[1]));
          ctx.lineTo(X(sg.to[0]), Y(sg.to[1]));
          ctx.stroke();
          ctx.setLineDash([]);
          if (sg.kind === 'shadow-blocked') {
            ctx.fillStyle = alpha(P.bad, on ? 1 : 0.5);
            ctx.beginPath();
            ctx.arc(X(sg.to[0]), Y(sg.to[1]), on ? 4 : 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // hit points
        for (const sg of tr.segments)
          if (sg.kind === 'primary' || sg.kind === 'reflect') {
            ctx.fillStyle = on ? P.ink : alpha(P.ink, 0.5);
            ctx.beginPath();
            ctx.arc(X(sg.to[0]), Y(sg.to[1]), on ? 3.5 : 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
      }
      // objects
      for (const c of CIRCLES) {
        ctx.beginPath();
        ctx.arc(X(c.c[0]), Y(c.c[1]), c.r * s, 0, Math.PI * 2);
        ctx.fillStyle = c.mirror ? alpha(P.accent, 0.16) : P.surface;
        ctx.fill();
        ctx.strokeStyle = c.mirror ? P.accent : P.ink2;
        ctx.lineWidth = c.mirror ? 2.5 : 1.5;
        ctx.stroke();
        ctx.fillStyle = c.mirror ? P.accent : P.ink2;
        ctx.font = `700 12px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.name + (c.mirror ? ' 거울' : ''), X(c.c[0]), Y(c.c[1]));
      }
      // image plane with one cell per pixel, coloured by what the eye sees there
      const x0 = X(PLANE_X[0]), x1 = X(PLANE_X[1]), py = Y(PLANE_Y);
      const cw = (x1 - x0) / n;
      traces.forEach((tr, i) => {
        ctx.fillStyle = tr.sees === '아무것도 없음' || tr.sees.endsWith('바깥') ? P.surface3 : tr.lit ? P.hl : alpha(P.ink, 0.55);
        ctx.fillRect(x0 + i * cw + 0.5, py - 5, cw - 1, 10);
      });
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(x0 + k * cw, py - 6, cw, 12);
      ctx.fillStyle = P.ink3;
      ctx.font = `500 10px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.fillText('화면(픽셀)', x1 + 6, py);
      drawEye(ctx, P, X(EYE[0]), Y(EYE[1]));
      ctx.fillText('눈', X(EYE[0]) + 14, Y(EYE[1]));
      drawLight(ctx, P, X(light[0]), Y(light[1]));
    },
    [P, traces, k, n, light, showShadow],
    { aspect: WORLD.w / (WORLD.h + 0.3), maxHeight: 470, minHeight: 240 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      const el = canvasRef.current;
      if (!el) return null;
      const { X, Y } = roomMap(el.clientWidth, el.clientHeight);
      return Math.hypot(x - X(light[0]), y - Y(light[1])) < 20 ? 'light' : null;
    },
    onDrag: (_, x, y) => {
      const el = canvasRef.current;
      if (!el) return;
      moveLight(roomMap(el.clientWidth, el.clientHeight).inv(x, y));
    },
  });

  const lit = traces.filter((t) => t.lit).length;
  const blocked = traces.filter((t) => t.segments.some((s) => s.kind === 'shadow-blocked')).length;
  const note =
    cur.sees === '아무것도 없음'
      ? `${k + 1}번 광선은 아무 데도 맞지 않았습니다.`
      : cur.sees.endsWith('바깥')
        ? `${k + 1}번 광선은 거울 B에 맞고 튕겨 나갔지만, 방의 열린 쪽(아래)으로 나가 아무것도 비추지 않습니다. 이 픽셀에는 배경색이 들어갑니다.`
        : cur.segments.some((s) => s.kind === 'shadow-blocked')
          ? `${k + 1}번 광선은 ${cur.sees}에 맞았습니다. 맞은 점에서 빛 쪽으로 쏜 그림자 광선이 도중에 다른 물체에 막혔으니(빨간 점) 이 점은 그림자 속입니다.`
          : cur.lit
            ? `${k + 1}번 광선은 ${cur.sees}에 맞았고, 그 점에서 빛까지 가는 그림자 광선이 아무것에도 막히지 않았습니다. 빛을 받는 점이니 밝게 칠합니다.`
            : `${k + 1}번 광선은 ${cur.sees}에 맞았지만, 맞은 면이 빛을 등지고 있습니다(면의 법선과 빛 방향의 내적이 0 이하). 그림자 광선을 쏠 필요도 없이 어둡게 칠합니다.`;

  return (
    <Figure
      no={1}
      title="위에서 내려다본 레이 트레이싱"
      hint="전구를 끌어 옮기고, 광선 번호를 바꿔 보세요"
      caption={
        <>
          둥근 물체는 위에서 본 구입니다. 눈에서 화면의 픽셀 가운데를 지나는 <strong>1차 광선</strong>(회색)을 쏘고, 처음 맞은 점에서 전구로 <strong>그림자 광선</strong>(노란 점선, 막히면 빨강)을 쏩니다. 거울 B에 맞은 광선은 반사 방향으로 한 번 더 나갑니다(파랑). 화면 줄의 칸 색이 그 픽셀의 결과입니다. 노랑은 빛을 받는 점, 진한 회색은 그림자나 빛을 등진 점, 옅은 회색은 아무것도 비추지 않는 곳입니다. 방의 아래쪽은 열려 있습니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="gx-col">
          <div ref={wrapRef} className="canvas-box grab">
            <canvas ref={canvasRef} role="img" aria-label={`위에서 본 장면. 광선 ${n}개 중 ${lit}개가 빛을 받는 점에 닿았고, ${blocked}개는 그림자 광선이 막혔습니다. 전구 위치 (${nf(light[0], 1)}, ${nf(light[1], 1)}). ${note}`} />
          </div>
          <div className="gx-note" aria-live="polite">
            {note}
          </div>
        </div>
        <div className="controls">
          <Slider id="rt-n" label="픽셀(광선) 수" value={n} min={3} max={25} step={1} onChange={setN} />
          <Slider id="rt-sel" label="살펴볼 광선" value={k + 1} min={1} max={n} step={1} onChange={(v) => setSel(v - 1)} format={(v) => `${v}번`} />
          <Slider id="rt-lx" label="전구 가로 위치" value={light[0]} min={0.3} max={WORLD.w - 0.3} step={0.05} onChange={(v) => moveLight([v, light[1]])} format={(v) => nf(v, 1)} />
          <Slider id="rt-ly" label="전구 깊이" value={light[1]} min={1.8} max={WALL_Y - 0.25} step={0.05} onChange={(v) => moveLight([light[0], v])} format={(v) => nf(v, 1)} />
          <Check label="그림자 광선 보이기" checked={showShadow} onChange={setShowShadow} />
          <Button small onClick={() => setLight(DEFAULT_LIGHT)}>
            전구 처음 자리로
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="빛 받는 픽셀" value={`${lit} / ${n}`} color="var(--good)" />
            <Readout label="그림자에 막힘" value={blocked} color={blocked ? 'var(--bad)' : undefined} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--ink-2)', label: '1차 광선', shape: 'ln' },
          { color: 'var(--hl)', label: '그림자 광선 (빛까지 뚫림)', shape: 'ln' },
          { color: 'var(--bad)', label: '그림자 광선 (막힘)', shape: 'ln' },
          { color: 'var(--accent)', label: '반사 광선', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: one ray against one circle is a quadratic ─────────────── */

const Q_CIRCLE = CIRCLES[2];

function QuadraticFigure() {
  const P = usePalette();
  const [deg, setDeg] = useState(0);
  const a = (deg * Math.PI) / 180;
  const d: P2 = [Math.sin(a), Math.cos(a)];
  const q = solveHit(EYE, d, Q_CIRCLE.c, Q_CIRCLE.r);
  const roots = q.disc >= 0 ? [(-q.b - Math.sqrt(q.disc)) / (2 * q.a), (-q.b + Math.sqrt(q.disc)) / (2 * q.a)] : [];
  const T_MAX = 7;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const narrow = w < 520;
      const gw = narrow ? w : w * 0.42;
      const gh = narrow ? h * 0.5 : h;
      // left: geometry, from the eye up to past the circle
      const s = Math.min((gw - 24) / 4, (gh - 24) / 6.2);
      const X = (x: number) => gw / 2 + (x - 5) * s;
      const Y = (y: number) => gh - 12 - (y - 0.2) * s;
      ctx.beginPath();
      ctx.arc(X(Q_CIRCLE.c[0]), Y(Q_CIRCLE.c[1]), Q_CIRCLE.r * s, 0, Math.PI * 2);
      ctx.fillStyle = P.surface;
      ctx.fill();
      ctx.strokeStyle = P.ink2;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = P.ink3;
      ctx.font = `600 11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('C', X(Q_CIRCLE.c[0]), Y(Q_CIRCLE.c[1]));
      const far = 6.2;
      drawArrow(ctx, X(EYE[0]), Y(EYE[1]), X(EYE[0] + d[0] * far), Y(EYE[1] + d[1] * far), alpha(P.ink2, 0.8), 1.6, 8);
      roots.forEach((t, i) => {
        if (t <= 0) return;
        const p: P2 = [EYE[0] + d[0] * t, EYE[1] + d[1] * t];
        ctx.fillStyle = i === 0 ? P.good : alpha(P.good, 0.45);
        ctx.beginPath();
        ctx.arc(X(p[0]), Y(p[1]), i === 0 ? 5 : 4, 0, Math.PI * 2);
        ctx.fill();
      });
      drawEye(ctx, P, X(EYE[0]), Y(EYE[1]));

      // right: f(t) = a t² + b t + c
      const px0 = narrow ? 40 : gw + 46;
      const py0 = narrow ? gh + 14 : 14;
      const pw = (narrow ? w : w - gw) - (narrow ? 52 : 58);
      const ph = (narrow ? h - gh : h) - 46;
      const f = (t: number) => q.a * t * t + q.b * t + q.c;
      const lo = -2, hi = 24;
      const TX = (t: number) => px0 + (t / T_MAX) * pw;
      const FY = (v: number) => py0 + ph - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      for (let v = 0; v <= 20; v += 5) {
        ctx.beginPath();
        ctx.moveTo(px0, FY(v) + 0.5);
        ctx.lineTo(px0 + pw, FY(v) + 0.5);
        ctx.stroke();
        ctx.fillStyle = P.ink3;
        ctx.font = `10px ${P.fontMono}`;
        ctx.textAlign = 'right';
        ctx.fillText(String(v), px0 - 5, FY(v));
      }
      ctx.strokeStyle = P.ink;
      ctx.beginPath();
      ctx.moveTo(px0, FY(0) + 0.5);
      ctx.lineTo(px0 + pw, FY(0) + 0.5);
      ctx.stroke();
      ctx.textAlign = 'center';
      for (let t = 0; t <= T_MAX; t++) ctx.fillText(String(t), TX(t), py0 + ph + 12);
      ctx.fillText('t (눈에서 떨어진 거리)', px0 + pw / 2, py0 + ph + 26);
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const t = (i / 120) * T_MAX;
        const yy = FY(f(t));
        if (i) ctx.lineTo(TX(t), yy);
        else ctx.moveTo(TX(t), yy);
      }
      ctx.stroke();
      roots.forEach((t, i) => {
        if (t < 0 || t > T_MAX) return;
        ctx.fillStyle = i === 0 ? P.good : alpha(P.good, 0.45);
        ctx.beginPath();
        ctx.arc(TX(t), FY(0), i === 0 ? 5 : 4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'left';
      ctx.font = `600 11px ${P.fontBody}`;
      ctx.fillText('f(t) = at² + bt + c', px0 + 4, py0 + 6);
    },
    [P, deg, q.a, q.b, q.c],
    { aspect: 2.1, maxHeight: 320, minHeight: 300 },
  );

  return (
    <Figure
      no={2}
      title="광선과 원이 만나는 곳은 이차방정식의 근"
      hint="광선의 각도를 바꿔 보세요"
      caption={
        <>
          왼쪽은 그림 1의 눈과 원 C만 남긴 것이고, 오른쪽은 광선 위의 점 o + t·d가 원의 방정식을 얼마나 어기는지(f(t) = |o + t·d − c|² − r²)를 t에 따라 그린 것입니다. f(t)가 0이 되는 t가 광선이 원의 경계를 지나는 곳입니다. 초록 점 중 진한 것이 눈에 더 가까운 근, 즉 보이는 점입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} role="img" aria-label={`광선 각도 ${deg}도. a = ${nf(q.a)}, b = ${nf(q.b)}, c = ${nf(q.c)}, 판별식 ${nf(q.disc)}. ${q.disc < 0 ? '판별식이 음수라 광선이 원을 비껴갑니다.' : `근은 t = ${nf(roots[0], 3)}과 ${nf(roots[1], 3)}이고, 가까운 쪽이 보이는 점입니다.`}`} />
        </div>
        <div className="controls">
          <Slider id="rt-deg" label="광선 각도 (0 = 정면)" value={deg} min={-14} max={14} step={0.5} onChange={setDeg} format={(v) => `${v}°`} />
          <div className="rt-quad">
            <div>
              <span>a = d·d</span>
              <b className="mono">{nf(q.a)}</b>
            </div>
            <div>
              <span>b = 2 d·(o − c)</span>
              <b className="mono">{nf(q.b)}</b>
            </div>
            <div>
              <span>c = |o − c|² − r²</span>
              <b className="mono">{nf(q.c)}</b>
            </div>
            <div data-bad={q.disc < 0 || undefined}>
              <span>판별식 b² − 4ac</span>
              <b className="mono">{nf(q.disc)}</b>
            </div>
            <div data-good={q.t !== null || undefined}>
              <span>보이는 점 t</span>
              <b className="mono">{q.t === null ? '없음 (비껴감)' : nf(q.t, 3)}</b>
            </div>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: a real (small) render ─────────────── */

const RW = 160;
const RH = 100;
const ROWS_PER_FRAME = 8;

function RenderFigure() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [bounces, setBounces] = useState(2);
  const [shadows, setShadows] = useState(true);
  const [run, setRun] = useState(0);
  const [row, setRow] = useState(0);
  const [ms, setMs] = useState(0);
  const fb = useRef(new Framebuffer(RW, RH));
  const counts = useRef<RayCounts>({ primary: 0, shadow: 0, reflect: 0 });

  // render a few rows per animation frame so the page stays responsive
  useEffect(() => {
    if (!inView) return;
    fb.current.clear([0.5, 0.5, 0.5]);
    counts.current = { primary: 0, shadow: 0, reflect: 0 };
    setRow(0);
    setMs(0);
    let y = 0;
    let spent = 0;
    let raf = 0;
    const step = () => {
      const t0 = performance.now();
      const c = renderRows(fb.current, y, y + ROWS_PER_FRAME, bounces, shadows);
      spent += performance.now() - t0;
      counts.current.primary += c.primary;
      counts.current.shadow += c.shadow;
      counts.current.reflect += c.reflect;
      y += ROWS_PER_FRAME;
      setRow(Math.min(y, RH));
      setMs(spent);
      if (y < RH) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [bounces, shadows, run, inView]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const px = Math.min(w / RW, h / RH);
      const ox = (w - RW * px) / 2;
      const oy = (h - RH * px) / 2;
      present(ctx, fb.current, ox, oy, px);
      if (row < RH) {
        ctx.fillStyle = alpha(P.bg, 0.55);
        ctx.fillRect(ox, oy + row * px, RW * px, (RH - row) * px);
        ctx.strokeStyle = P.hl;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ox, oy + row * px);
        ctx.lineTo(ox + RW * px, oy + row * px);
        ctx.stroke();
      }
    },
    [P, row, run, bounces, shadows],
    { aspect: RW / RH, maxHeight: 420 },
  );

  const c = counts.current;
  const total = c.primary + c.shadow + c.reflect;
  const done = row >= RH;
  return (
    <Figure
      no={3}
      title="160×100 픽셀을 직접 그리기"
      hint="반사 횟수와 그림자를 바꿔 보세요"
      caption={
        <>
          이 브라우저가 지금 계산한 그림입니다. 픽셀마다 1차 광선을 하나 쏘고, 맞은 점마다 그림자 광선을, 반사하는 표면(큰 거울 구, 작은 거울 구, 조금 반사하는 바닥)에서는 반사 광선을 쏩니다. 반사 횟수가 바닥나면 거울은 자기 바탕색만 보여 줍니다. 한 번에 여덟 줄씩 그려서 위에서부터 채워집니다. 걸린 시간은 기기에 따라 다릅니다.
        </>
      }
    >
      <div className="fig-split" ref={outer}>
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} role="img" aria-label={`레이 트레이싱으로 그린 장면: 체크무늬 바닥 위에 빨간 구, 큰 거울 구, 파란 구, 작은 거울 구가 있습니다. 최대 반사 ${bounces}번, 그림자 ${shadows ? '켬' : '끔'}. ${done ? `광선 ${num(total)}개를 썼습니다.` : `${row}줄째 그리는 중.`}`} />
        </div>
        <div className="controls">
          <Slider id="rt-b" label="최대 반사 횟수" value={bounces} min={0} max={4} step={1} onChange={setBounces} format={(v) => `${v}번`} />
          <Check label="그림자 광선 쏘기" checked={shadows} onChange={setShadows} />
          <Button small onClick={() => setRun((r) => r + 1)}>
            다시 그리기
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="1차 광선" value={num(c.primary)} />
            <Readout label="그림자 광선" value={num(c.shadow)} />
            <Readout label="반사 광선" value={num(c.reflect)} color="var(--accent)" />
            <Readout label="합계" value={num(total)} />
            <Readout label="계산 시간" value={done ? `${Math.round(ms)}ms` : '…'} />
            <Readout label="픽셀당 광선" value={(total / Math.max(1, c.primary)).toFixed(2)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: bounding-volume hierarchy ─────────────── */

function BvhFigure() {
  const P = usePalette();
  const [n, setN] = useState(200);
  const [y0, setY0] = useState(5.2);
  const [deg, setDeg] = useState(8);
  const [allBoxes, setAllBoxes] = useState(false);
  const discs = useMemo(() => randomDiscs(n), [n]);
  const root = useMemo(() => buildBvh(discs), [discs]);
  const depth = useMemo(() => bvhDepth(root), [root]);
  const ray = bvhRay(y0, deg);
  const tr = traceBvh(ray.o, ray.d, discs, root);
  const brute = traceBrute(ray.o, ray.d, discs);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const s = Math.min((w - 8) / BVH_W, (h - 8) / BVH_H);
      const ox = (w - BVH_W * s) / 2, oy = (h - BVH_H * s) / 2;
      const X = (x: number) => ox + x * s, Y = (y: number) => oy + (BVH_H - y) * s;
      ctx.fillStyle = alpha(P.surface2, 0.5);
      ctx.fillRect(ox, oy, BVH_W * s, BVH_H * s);
      const boxPath = (b: { x0: number; y0: number; x1: number; y1: number }) => ctx.strokeRect(X(b.x0), Y(b.y1), (b.x1 - b.x0) * s, (b.y1 - b.y0) * s);
      if (allBoxes) {
        const walk = (nd: typeof root) => {
          ctx.strokeStyle = alpha(P.ink3, 0.25);
          ctx.lineWidth = 1;
          boxPath(nd.box);
          nd.kids.forEach(walk);
        };
        walk(root);
      }
      for (const v of tr.visited) {
        const on = v.status === 'entered';
        ctx.strokeStyle = on ? alpha(P.accent, 0.85) : v.status === 'missed' ? alpha(P.bad, 0.55) : alpha(P.ink3, 0.8);
        ctx.lineWidth = on ? 1.6 : 1;
        ctx.setLineDash(on ? [] : v.status === 'missed' ? [3, 3] : [1.5, 3]);
        boxPath(v.node.box);
        ctx.setLineDash([]);
      }
      const tested = new Set(tr.tested);
      discs.forEach((dsc, i) => {
        ctx.beginPath();
        ctx.arc(X(dsc.c[0]), Y(dsc.c[1]), Math.max(1.5, dsc.r * s), 0, Math.PI * 2);
        ctx.fillStyle = i === tr.hit ? P.good : tested.has(i) ? P.hl : alpha(P.ink3, 0.55);
        ctx.fill();
      });
      const end = tr.hit !== null ? tr.t : 40;
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(X(ray.o[0]), Y(ray.o[1]));
      ctx.lineTo(X(ray.o[0] + ray.d[0] * end), Y(ray.o[1] + ray.d[1] * end));
      ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.beginPath();
      ctx.arc(X(ray.o[0]), Y(ray.o[1]), 4, 0, Math.PI * 2);
      ctx.fill();
    },
    [P, discs, root, tr, allBoxes, ray.o[0], ray.o[1], ray.d[0], ray.d[1]],
    { aspect: BVH_W / BVH_H, maxHeight: 430 },
  );

  const bvhTotal = tr.boxTests + tr.discTests;
  return (
    <Figure
      no={4}
      title="경계 상자 계층으로 검사 줄이기"
      hint="원 개수를 늘리고, 광선을 움직여 보세요"
      caption={
        <>
          원 {num(n)}개를 가로로 긴 쪽을 반으로 가르기를 되풀이해 상자 계층(깊이 {depth})으로 묶었습니다. 광선은 먼저 상자와 부딪히는지만 봅니다. 파란 상자는 광선이 안을 들여다본 상자, 빨간 점선 상자는 광선이 비껴가서 안을 볼 필요가 없었던 상자, 회색 점선 상자는 광선이 닿기는 하지만 그보다 가까운 곳에서 이미 원에 맞아 건너뛴 상자입니다. 노란 원이 실제로 교차 검사를 한 원, 초록 원이 처음 맞은 원입니다. 광선은 가까운 상자부터 들여다봅니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} role="img" aria-label={`원 ${n}개, 광선 시작 높이 ${nf(y0, 1)}, 각도 ${deg}도. 모두 검사하면 ${n}번, 상자 계층을 쓰면 상자 검사 ${tr.boxTests}번과 원 검사 ${tr.discTests}번. ${tr.hit !== null ? '광선이 원 하나에 맞았습니다.' : '광선이 아무 원에도 맞지 않았습니다.'}`} />
        </div>
        <div className="controls">
          <Slider id="rt-bn" label="원 개수" value={n} min={20} max={2000} step={10} onChange={setN} />
          <Slider id="rt-by" label="광선 시작 높이" value={y0} min={0.3} max={BVH_H - 0.3} step={0.1} onChange={setY0} format={(v) => nf(v, 1)} />
          <Slider id="rt-bd" label="광선 각도" value={deg} min={-30} max={30} step={1} onChange={setDeg} format={(v) => `${v}°`} />
          <Check label="모든 상자 보이기" checked={allBoxes} onChange={setAllBoxes} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="모두 검사" value={`${num(brute.tests)}번`} color="var(--bad)" />
            <Readout label="계층 사용" value={`${bvhTotal}번`} color="var(--good)" />
            <Readout label="상자 검사" value={tr.boxTests} />
            <Readout label="원 검사" value={tr.discTests} />
          </div>
          <div className="gx-small">두 방법이 찾은 원은 언제나 같습니다{brute.hit === tr.hit ? ' (지금도 같음)' : ''}.</div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--accent)', label: '들어간 상자', shape: 'sq' },
          { color: 'var(--bad)', label: '비껴간 상자', shape: 'sq' },
          { color: 'var(--ink-3)', label: '건너뛴 상자', shape: 'sq' },
          { color: 'var(--hl)', label: '검사한 원', shape: 'dot' },
          { color: 'var(--good)', label: '처음 맞은 원', shape: 'dot' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function RayTracing() {
  return (
    <>
      <h2>빛을 거꾸로 따라가기</h2>
      <p>
        <a href={lessonHref('cs-graphics', 'rasterization')}>래스터화</a>는 삼각형마다 "이 삼각형이 어느 픽셀을 덮는가"를 묻습니다. 물체에서 출발해 화면으로 가는 방식입니다. 이번 장의 방법은 방향이 반대입니다. 픽셀마다 "이 픽셀로 들어오는 빛은 어디서 왔는가"를 묻습니다. 실제 빛은 전구에서 나와 물체에 부딪히고 눈으로 들어오지만, 전구에서 나간 빛 대부분은 눈에 닿지 않으니 그대로 따라가면 낭비가 큽니다. 그래서 눈에서 픽셀을 지나는 반직선, 즉 <T en="ray">광선</T>을 쏘아 빛의 길을 거꾸로 따라갑니다. 이것이 <T en="ray tracing">레이 트레이싱</T>입니다.
      </p>
      <p>
        한 픽셀에서 할 일은 셋입니다. 첫째, 눈에서 그 픽셀 가운데로 <T en="primary ray">1차 광선</T>을 쏘아 처음 맞는 물체를 찾습니다. 둘째, 맞은 점에서 전구 쪽으로 <T en="shadow ray">그림자 광선</T>을 쏩니다. 도중에 다른 물체에 막히면 그 점은 그림자 속입니다. 셋째, 맞은 표면이 거울이면 반사 방향으로 광선을 한 번 더 쏘아 거울에 비친 것을 찾습니다. 그림 1은 이 과정을 위에서 내려다본 것입니다.
      </p>
      <TopDownFigure />
      <p>
        처음 설정에서 광선 9개 중 빛을 받는 점에 닿은 것은 4개입니다. 1번 광선은 A에 맞았지만 그 점의 면이 전구를 등지고 있어서 어둡고, 5번 광선이 맞은 C의 앞면도 마찬가지입니다. 이런 점은 그림자 광선을 쏘지 않아도 어둡다는 것을 압니다. 7번 광선은 거울 B에 맞고 튕겨 왼쪽 벽에 닿는데, 그 벽 점에서 전구로 쏜 그림자 광선이 A에 막힙니다. 거울에 비친 벽이 A의 그림자 속에 있는 것입니다. 8번과 9번 광선은 B에 맞고 방의 열린 쪽으로 빠져나가 아무것도 비추지 않습니다. 전구를 A 뒤쪽으로 끌어 보면 벽에 A의 그림자가 생기고, 화면 줄의 칸이 어두워지는 것을 볼 수 있습니다.
      </p>
      <Callout kind="intuition">
        그림자를 따로 그리는 단계는 없습니다. "이 점에서 전구가 보이는가"를 광선 하나로 물어볼 뿐인데, 그 답이 아니오인 점들이 모여 그림자가 됩니다. 반사도 같습니다. 거울에 무엇이 비치는지 계산하는 특별한 규칙 없이, 광선을 반사 방향으로 다시 쏘면 됩니다.
      </Callout>

      <h2>광선이 구에 맞는 곳</h2>
      <p>
        레이 트레이서가 가장 많이 하는 계산은 "이 광선이 이 물체에 맞는가, 맞는다면 얼마나 먼 곳에서인가"입니다. 광선은 시작점 o에서 방향 d로 가는 점들 <M>{'\\mathbf{p}(t) = \\mathbf{o} + t\\,\\mathbf{d}'}</M>이고, t는 출발점에서 떨어진 정도입니다. 중심이 c이고 반지름이 r인 구는 c에서 거리가 r인 점들, <M>{'|\\mathbf{p} - \\mathbf{c}|^2 = r^2'}</M>입니다. 광선의 식을 구의 식에 넣고 전개하면 t에 대한 이차방정식이 나옵니다.
      </p>
      <MB note={<>판별식이 음수면 광선이 구를 비껴가고, 0이면 스치고, 양수면 두 점에서 뚫고 지나갑니다.</>}>{'(\\mathbf{d}\\cdot\\mathbf{d})\\,t^2 + 2\\,\\mathbf{d}\\cdot(\\mathbf{o}-\\mathbf{c})\\,t + |\\mathbf{o}-\\mathbf{c}|^2 - r^2 = 0'}</MB>
      <p>
        두 근 중 작은 양수 근이 보이는 점입니다. 큰 근은 광선이 구를 뚫고 나가는 뒷면이고, 음수 근은 눈 뒤쪽이라 보이지 않습니다. 위에서 본 그림에서는 구가 원이 되지만 식은 그대로입니다. 그림 2에서 정면으로 쏜 광선은 o = (5, 0.5), d = (0, 1)이고, 원 C는 중심 (5.1, 5.2), 반지름 0.6입니다. 계산하면 a = 1, b = −9.4, c = 21.74, 판별식은 1.40이고, 가까운 근은 t ≈ 4.108입니다. 눈에서 4.108만큼 간 곳에서 원에 닿습니다.
      </p>
      <QuadraticFigure />
      <p>
        각도를 9°나 −6.5°쯤으로 돌리면 판별식이 음수가 되어 포물선이 t축 위로 떠오르고, 광선은 C를 비껴갑니다. 평면이나 삼각형도 같은 방식으로 "광선의 식을 물체의 식에 넣고 t를 푼다"로 교차를 구합니다. 삼각형이라면 평면과의 교점을 구한 뒤 그 점이 세 변 안쪽에 있는지 확인하는데, 이것은 래스터화 장의 변 함수와 같은 판정입니다.
      </p>
      <Code label="한 픽셀의 색을 구하는 레이 트레이서의 뼈대">{`
function trace(origin, dir, depth) {
  const hit = nearestHit(origin, dir);         // 모든 물체와 교차를 구해 가장 가까운 것
  if (!hit) return skyColor(dir);
  let color = ambient(hit);
  const toLight = normalize(light - hit.point);
  if (dot(hit.normal, toLight) > 0 && !nearestHitBefore(hit.point, toLight, distanceToLight)) {
    color += diffuse(hit, toLight) + specular(hit, toLight, dir);   // 그림자 광선이 뚫렸을 때만
  }
  if (hit.mirror && depth < MAX_DEPTH) {
    const r = reflect(dir, hit.normal);
    color = mix(color, trace(hit.point, r, depth + 1), hit.mirror);  // 재귀: 반사 광선
  }
  return color;
}`}</Code>

      <h2>직접 그려 보기</h2>
      <p>
        위의 뼈대를 3차원으로 옮긴 레이 트레이서가 그림 3을 그립니다. 밝기 계산은 <a href={lessonHref('cs-graphics', 'shading')}>빛과 셰이딩</a> 장의 퐁 모델과 같고, 다른 것은 그림자 광선과 반사 광선뿐입니다. 160×100 그림이니 1차 광선은 16,000개입니다.
      </p>
      <RenderFigure />
      <p>
        처음 설정(반사 2번)에서는 1차 광선 16,000개, 그림자 광선 15,582개, 반사 광선 16,064개, 모두 47,646개를 씁니다. 반사를 0번으로 하면 거울 구가 검게 변하고 광선은 26,870개로 줄어듭니다. 1번으로 올리면 거울에 다른 구와 바닥이 비치고, 2번부터는 큰 거울 속에 비친 작은 거울 안에도 무언가 보입니다. 4번까지 올려도 그림은 거의 그대로인데 광선은 51,204개로 늘어납니다. 반사할 때마다 빛이 조금씩 줄어서 몇 번 넘게 튕긴 빛은 픽셀 색을 거의 바꾸지 못하기 때문입니다. 실제 렌더러도 그래서 반사 횟수에 상한을 둡니다.
      </p>
      <Callout kind="note">
        영화의 컴퓨터 그래픽은 여기서 더 나아간 <T en="path tracing">경로 추적</T>을 씁니다. 거울처럼 한 방향으로만 튕기는 대신 표면에서 무작위 방향으로 광선을 여러 개 튕겨, 벽에 반사된 빛이 방을 은은하게 밝히는 간접광까지 계산합니다. 픽셀 하나에 광선 수백에서 수천 개가 들고, 광선이 적으면 그림에 자글자글한 잡음이 남습니다. 그 잡음을 지우는 데 요즘은 신경망을 씁니다.
      </Callout>

      <h2>물체가 많을 때: 경계 상자 계층</h2>
      <p>
        지금까지는 광선마다 모든 물체와 교차를 검사했습니다. 물체가 넷이면 괜찮지만, 게임이나 영화의 장면은 삼각형이 수백만 개입니다. 광선 하나에 수백만 번, 픽셀 수백만 개에 광선 여럿을 곱하면 감당할 수 없습니다. 해결책은 <a href={lessonHref('cs-algorithms', 'search-hash')}>탐색</a>을 빠르게 하는 익숙한 생각입니다. 가까운 물체끼리 상자로 묶고, 상자끼리 다시 더 큰 상자로 묶어 나무를 만듭니다. 이것이 <T en="bounding volume hierarchy, BVH">경계 상자 계층</T>입니다. 광선이 큰 상자를 비껴가면 그 안의 물체 수천 개를 한 번에 건너뜁니다.
      </p>
      <BvhFigure />
      <p>
        처음 설정에서 원 200개를 모두 검사하면 200번이지만, 계층을 쓰면 상자 검사 29번과 원 검사 4번, 모두 33번이면 같은 원을 찾습니다. 원을 1,000개로 늘려도 상자 검사 35번과 원 검사 5번입니다. 나무의 깊이는 물체 수의 로그에 비례하므로, 물체가 다섯 배 늘어도 검사는 몇 번만 늘어납니다. 광선을 위아래로 움직여 보면 빈 공간을 지나는 광선은 상자 몇 개만 보고 끝나는 것도 볼 수 있습니다.
      </p>
      <Callout kind="note">
        레이 트레이싱은 오랫동안 영화처럼 한 장면을 몇 분, 몇 시간씩 계산해도 되는 곳에서만 썼습니다. 2018년 무렵부터 그래픽 카드에 BVH 탐색과 광선-삼각형 교차를 전담하는 회로가 들어가면서, 게임도 그림자나 반사, 간접광 같은 일부 효과에 레이 트레이싱을 씁니다. 화면의 대부분은 여전히 래스터화로 그리고, 래스터화로 흉내 내기 어려운 효과에만 광선을 쏘는 혼합 방식이 흔합니다.
      </Callout>

      <Callout kind="key">
        레이 트레이싱은 픽셀마다 눈에서 광선을 쏘아 처음 맞는 물체를 찾고, 그 점에서 전구로 그림자 광선을, 거울에서는 반사 광선을 쏘아 색을 정합니다. 광선과 구의 교차는 t에 대한 이차방정식이고, 작은 양수 근이 보이는 점입니다. 그림자와 반사가 별도 기법 없이 저절로 나오는 대신 광선 수가 많이 들고, 물체가 많을 때는 경계 상자 계층으로 광선 하나의 검사 횟수를 물체 수의 로그 정도로 줄입니다.
      </Callout>
      <Quiz
        q="삼각형 100만 개짜리 장면을 경계 상자 계층으로 묶었다. 같은 장면을 삼각형 1억 개로 더 정교하게 만들고 계층을 다시 지었다. 광선 하나가 하는 교차 검사 수는 대략 어떻게 될까?"
        options={['100배로 늘어난다', '10배로 늘어난다', '조금(몇십 퍼센트) 늘어난다', '줄어든다']}
        answer={2}
        explain={<>나무의 깊이는 물체 수의 로그에 비례합니다. log₂(10⁶) ≈ 20, log₂(10⁸) ≈ 27이니 광선이 내려가는 깊이는 20단계에서 27단계쯤으로 늘 뿐입니다. 모든 삼각형을 검사한다면 100배가 되었겠지만, 계층 덕분에 검사 수는 대략 깊이에 비례해 조금만 늘어납니다. 실제로는 광선이 여러 갈래를 들여다보기도 해서 정확히 로그는 아니지만, 늘어나는 정도는 물체 수보다 훨씬 작습니다.</>}
      />
    </>
  );
}
