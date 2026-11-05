import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { BASE, HOLES, HOLE_R, LOOPS, MAPS, circleLoop, fixedPoint, length, lift, presetLoop, pullTight, retract, windingNumber, type HoleSet, type LoopId, type MapId, type Pt, type Pull } from './loops';
import './topology.css';
import './loops.css';

/** World [-1, 1]² → canvas square, y up. */
function view(w: number, h: number, pad = 14) {
  const S = Math.min(w, h) - 2 * pad;
  const ox = (w - S) / 2, oy = (h - S) / 2;
  const to = ([x, y]: Pt): [number, number] => [ox + ((x + 1) / 2) * S, oy + ((1 - y) / 2) * S];
  const from = (px: number, py: number): Pt => [((px - ox) / S) * 2 - 1, 1 - ((py - oy) / S) * 2];
  return { S, to, from };
}

function drawPath(ctx: CanvasRenderingContext2D, pts: Pt[], to: (p: Pt) => [number, number], color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(...to(p)) : ctx.moveTo(...to(p))));
  ctx.stroke();
}

/** Small arrowheads along a path every `gap` points, showing its direction. */
function pathArrows(ctx: CanvasRenderingContext2D, pts: Pt[], to: (p: Pt) => [number, number], color: string, gap: number) {
  ctx.fillStyle = color;
  for (let i = gap; i + 1 < pts.length; i += gap) {
    const [x0, y0] = to(pts[i - 1]), [x1, y1] = to(pts[i + 1]);
    const a = Math.atan2(y1 - y0, x1 - x0);
    const [x, y] = to(pts[i]);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
    ctx.lineTo(x + Math.cos(a + 2.5) * 6, y + Math.sin(a + 2.5) * 6);
    ctx.lineTo(x + Math.cos(a - 2.5) * 6, y + Math.sin(a - 2.5) * 6);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHoles(ctx: CanvasRenderingContext2D, P: Palette, holes: Pt[], to: (p: Pt) => [number, number], S: number, names = true) {
  holes.forEach((h, i) => {
    const [x, y] = to(h);
    ctx.fillStyle = P.ink2;
    ctx.beginPath();
    ctx.arc(x, y, (HOLE_R / 2) * S, 0, Math.PI * 2);
    ctx.fill();
    if (names && holes.length > 1) {
      ctx.fillStyle = P.ink3;
      ctx.font = `600 12px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(i === 0 ? 'p' : 'q', x, y - (HOLE_R / 2) * S - 4);
    }
  });
}

function drawBase(ctx: CanvasRenderingContext2D, P: Palette, to: (p: Pt) => [number, number]) {
  const [x, y] = to(BASE);
  ctx.fillStyle = P.ink;
  ctx.beginPath();
  ctx.arc(x, y, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = P.surface;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = P.ink3;
  ctx.font = `600 11px ${P.fontBody}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('기준점', x + 9, y);
}

/* ───────── Figure 1: pull the loop tight ───────── */

type Mode = LoopId | 'draw';

function PullFigure() {
  const P = usePalette();
  const [mode, setMode] = useState<Mode>('once');
  const [drawHolesSet, setDrawHolesSet] = useState<HoleSet>('one');
  const [wps, setWps] = useState<Pt[]>([]);
  const [pull, setPull] = useState<Pull | null>(null);
  const [k, setK] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  const [still] = useState(prefersReducedMotion);

  const holes = mode === 'draw' ? HOLES[drawHolesSet] : HOLES[LOOPS.find((l) => l.id === mode)!.holes];
  const loop: Pt[] = useMemo(() => (mode === 'draw' ? [BASE, ...wps, BASE] : presetLoop(mode)), [mode, wps]);
  const winds = holes.map((h) => Math.round(windingNumber(loop, h)));
  const shown = pull ? pull.frames[Math.min(k, pull.frames.length - 1)] : loop;
  const done = pull !== null && k >= pull.frames.length - 1;
  const playing = pull !== null && !done;

  useAnimationFrame((dt) => setK((x) => x + Math.max(1, Math.round(dt * 45))), playing && inView);

  const start = (m: Mode) => {
    setMode(m);
    setPull(null);
    setK(0);
  };
  const doPull = () => {
    if (loop.length < 3) return;
    const r = pullTight(loop, holes);
    setPull(r);
    setK(still ? r.frames.length - 1 : 0);
  };

  const { wrapRef, canvasRef, size } = useCanvas2D(
    (ctx, { w, h }) => {
      const { S, to } = view(w, h);
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      const [ax, ay] = to([-1, 1]);
      ctx.strokeRect(ax + 0.5, ay + 0.5, S - 1, S - 1);
      if (pull) drawPath(ctx, loop, to, alpha(P.ink3, 0.35), 1.5);
      drawHoles(ctx, P, holes, to, S);
      const c = done && pull?.shrank ? P.good : P.accent;
      drawPath(ctx, shown, to, c, 2.6);
      if (shown.length > 6) pathArrows(ctx, shown, to, c, Math.max(6, Math.floor(shown.length / 10)));
      if (mode === 'draw')
        wps.forEach((p) => {
          const [x, y] = to(p);
          ctx.fillStyle = P.accent;
          ctx.fillRect(x - 3, y - 3, 6, 6);
        });
      drawBase(ctx, P, to);
    },
    [P, shown, loop, holes, mode, wps, pull, done],
    { aspect: 1, maxHeight: 400 },
  );

  useDrag(wrapRef, {
    hit: () => null,
    onDrag: () => {},
    onEmpty: (x, y) => {
      if (mode !== 'draw' || pull) return;
      const { from } = view(size.w, size.h);
      const p = from(x, y);
      if (Math.abs(p[0]) > 1 || Math.abs(p[1]) > 1) return;
      if (holes.some((h) => Math.hypot(p[0] - h[0], p[1] - h[1]) < HOLE_R * 1.2)) return;
      setWps((ws) => [...ws, p]);
    },
  });

  const L = length(shown);
  const note = !pull
    ? mode === 'draw'
      ? wps.length
        ? `점 ${wps.length}개를 찍었습니다. 기준점에서 출발해 찍은 순서대로 지나 기준점으로 돌아오는 고리입니다.`
        : '그림을 눌러 고리가 지나갈 점을 차례로 찍으세요. 구멍 안은 찍을 수 없습니다.'
      : '"당겨 보기"를 누르면 고리를 고무줄처럼 당겨 줄입니다. 고리는 구멍을 통과할 수 없습니다.'
    : !done
      ? '당기는 중입니다.'
      : pull.shrank
        ? '고리가 기준점 하나로 줄어들었습니다. 이 고리는 상수 고리와 호모토픽합니다.'
        : `고리가 구멍에 걸려 더 줄어들지 않습니다. 남은 길이 ${L.toFixed(2)}.`;

  return (
    <Figure
      no={1}
      title="고리를 당겨 한 점으로 줄일 수 있을까"
      hint="고리를 고르고 당겨 보세요"
      caption={
        <>
          회색 원판은 평면에 뚫린 구멍입니다. 고리는 기준점에서 출발해 기준점으로 돌아오는 길이고, 작은 화살표가 도는 방향입니다. "당겨 보기"는 고리의 각 점을 이웃 점들의 가운데로 조금씩 옮기는 일을 되풀이하면서 구멍 안으로는 들어가지 못하게 막습니다. 이 과정은 고리를 끊거나 구멍을 지나지 않고 연속적으로 바꾸는 호모토피입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={mode} onChange={start} options={[...LOOPS.map((l) => ({ value: l.id as Mode, label: l.name })), { value: 'draw' as Mode, label: '직접 그리기' }]} />
      </div>
      {mode === 'draw' && (
        <div className="controls row">
          <Seg
            value={drawHolesSet}
            onChange={(v) => {
              setDrawHolesSet(v);
              setWps([]);
              setPull(null);
            }}
            options={[
              { value: 'one', label: '구멍 하나' },
              { value: 'two', label: '구멍 둘' },
            ]}
          />
          <Button small onClick={() => setWps((ws) => ws.slice(0, -1))} disabled={!wps.length || pull !== null}>
            점 하나 지우기
          </Button>
        </div>
      )}
      <div className="fig-split" ref={box}>
        <div ref={wrapRef} className="canvas-box" style={{ cursor: mode === 'draw' && !pull ? 'crosshair' : undefined }} role="img" aria-label={`구멍 ${holes.length}개가 뚫린 평면의 고리. 감김 수는 ${winds.map((v, i) => (holes.length > 1 ? `${i === 0 ? 'p' : 'q'} 둘레 ${v}` : `${v}`)).join(', ')}입니다. ${note}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="btn-row">
            <Button small primary onClick={doPull} disabled={pull !== null || loop.length < 3}>
              당겨 보기
            </Button>
            <Button small onClick={() => start(mode)}>
              처음으로
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {holes.map((h, i) => (
              <Readout key={i} label={holes.length > 1 ? `${i === 0 ? 'p' : 'q'} 둘레 감김 수` : '감김 수'} value={winds[i]} />
            ))}
            <Readout label="고리 길이" value={L.toFixed(2)} />
            <Readout label="결과" value={!done ? '–' : pull!.shrank ? '한 점으로' : '걸림'} color={!done ? undefined : pull!.shrank ? 'var(--good)' : 'var(--bad)'} />
          </div>
          <div className="tp-note" aria-live="polite">
            {note}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ───────── Figure 2: concatenation adds winding numbers ───────── */

/** A loop from the base around the origin m times, as a gently shrinking spiral. */
function spiralLoop(m: number, r0: number): Pt[] {
  if (m === 0) {
    // a small loop beside the hole: densified so the arrows have points to sit on
    const corners: Pt[] = [BASE, [0.45, -0.6], [0.55, -0.3], [0.25, -0.35], BASE];
    const out: Pt[] = [BASE];
    for (let i = 1; i < corners.length; i++)
      for (let j = 1; j <= 10; j++) out.push([corners[i - 1][0] + ((corners[i][0] - corners[i - 1][0]) * j) / 10, corners[i - 1][1] + ((corners[i][1] - corners[i - 1][1]) * j) / 10]);
    return out;
  }
  const a0 = -Math.PI / 2;
  const n = Math.abs(m) * 60;
  const pts: Pt[] = [BASE];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (2 * Math.PI * m * i) / n;
    const r = r0 - 0.12 * (Math.abs(m) * i) / n / Math.max(1, Math.abs(m));
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  pts.push(BASE);
  return pts;
}

function LoopPanel({ pts, label, color }: { pts: Pt[]; label: string; color: string }) {
  const P = usePalette();
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const { S, to } = view(w, h, 8);
      drawHoles(ctx, P, [[0, 0]], to, S, false);
      drawPath(ctx, pts, to, color, 2.2);
      pathArrows(ctx, pts, to, color, 14);
      drawBase(ctx, P, to);
    },
    [P, pts, color],
    { aspect: 1, maxHeight: 220 },
  );
  return (
    <div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={label}>
        <canvas ref={canvasRef} />
      </div>
      <div className="lp2-cap">{label}</div>
    </div>
  );
}

function GroupFigure() {
  const P = usePalette();
  const [m, setM] = useState(2);
  const [n, setN] = useState(-1);
  const alphaLoop = useMemo(() => spiralLoop(m, 0.62), [m]);
  const betaLoop = useMemo(() => spiralLoop(n, 0.42), [n]);
  const both = useMemo(() => [...alphaLoop, ...betaLoop.slice(1)], [alphaLoop, betaLoop]);
  const w = (pts: Pt[]) => Math.round(windingNumber(pts, [0, 0]));
  return (
    <Figure
      no={2}
      title="고리를 이어 붙이면 감김 수가 더해집니다"
      hint="두 고리의 감김 수를 바꿔 보세요"
      caption={<>α·β는 α를 먼저 한 바퀴 다 돈 뒤 기준점에서 곧바로 β를 도는 고리입니다. 감김 수는 고리를 따라 구멍을 보는 방향이 돈 각도를 모두 더해 2π로 나눈 값이고, 세 그림 아래의 수는 그 각도를 실제로 더해 얻은 것입니다. 음수는 시계 방향으로 도는 고리입니다.</>}
    >
      <div className="controls row">
        <Slider id="lp2-m" label="α의 감김 수" value={m} min={-3} max={3} step={1} onChange={setM} />
        <Slider id="lp2-n" label="β의 감김 수" value={n} min={-3} max={3} step={1} onChange={setN} />
      </div>
      <div className="lp2-panels">
        <LoopPanel pts={alphaLoop} label={`α: 감김 수 ${w(alphaLoop)}`} color={P.neg} />
        <LoopPanel pts={betaLoop} label={`β: 감김 수 ${w(betaLoop)}`} color={P.pos} />
        <LoopPanel pts={both} label={`α·β: 감김 수 ${w(both)}`} color={P.accent} />
      </div>
      <div className="tp-note" aria-live="polite">
        w(α·β) = {w(alphaLoop)} + ({w(betaLoop)}) = {w(both)}. β를 거꾸로 돈 β⁻¹의 감김 수는 {-w(betaLoop)}이고, α·α⁻¹의 감김 수는 0이라 한 점으로 줄일 수 있습니다.
      </div>
    </Figure>
  );
}

/* ───────── Figure 3: lifting a loop on the circle to the line ───────── */

function LiftFigure() {
  const P = usePalette();
  const [n, setN] = useState(2);
  const [wob, setWob] = useState(1.2);
  const [t, setT] = useState(1);
  const theta = useMemo(() => circleLoop(n, wob), [n, wob]);
  const N = 400;
  const pts: Pt[] = useMemo(() => Array.from({ length: N + 1 }, (_, i) => [Math.cos(theta(i / N)), Math.sin(theta(i / N))] as Pt), [theta]);
  const L = useMemo(() => lift(pts), [pts]);
  const ti = Math.round(t * N);
  const lo = Math.floor(Math.min(...L, 0)) - 0.3, hi = Math.ceil(Math.max(...L, 0)) + 0.3;

  const circle = useCanvas2D(
    (ctx, { w, h }) => {
      const R = Math.min(w, h) / 2 - 18, cx = w / 2, cy = h / 2;
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      // the path drawn slightly inside the circle as time goes on, so its turns do not overlap
      ctx.strokeStyle = P.neg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= ti; i++) {
        const r = R * (1 - 0.35 * (i / N));
        const x = cx + r * pts[i][0], y = cy - r * pts[i][1];
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      const x = cx + R * pts[ti][0], y = cy - R * pts[ti][1];
      ctx.fillStyle = P.neg;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = P.ink;
      ctx.beginPath();
      ctx.arc(cx + R, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    },
    [P, pts, ti],
    { aspect: 1, maxHeight: 260 },
  );

  const line = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 34, r: 10, t: 10, b: 24 };
      const X = (s: number) => pad.l + s * (w - pad.l - pad.r);
      const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
      ctx.font = `10px ${P.fontMono}`;
      for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) {
        ctx.strokeStyle = k === 0 ? P.lineStrong : P.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(k) + 0.5);
        ctx.lineTo(w - pad.r, Y(k) + 0.5);
        ctx.stroke();
        ctx.fillStyle = P.ink3;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(k), pad.l - 6, Y(k));
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('0', X(0), h - pad.b + 6);
      ctx.fillText('1', X(1), h - pad.b + 6);
      ctx.fillText('t', X(0.5), h - pad.b + 6);
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i <= ti; i++) (i ? ctx.lineTo(X(i / N), Y(L[i])) : ctx.moveTo(X(0), Y(L[0])));
      ctx.stroke();
      ctx.fillStyle = P.accent;
      ctx.beginPath();
      ctx.arc(X(ti / N), Y(L[ti]), 5, 0, Math.PI * 2);
      ctx.fill();
    },
    [P, L, ti, lo, hi],
    { aspect: 1.3, maxHeight: 260 },
  );

  return (
    <Figure
      no={3}
      title="원 위의 고리를 실수 직선으로 펼치기"
      hint="감김 수와 흔들림, 시간 t를 바꿔 보세요"
      caption={
        <>
          왼쪽은 원 위를 도는 고리입니다(겹치지 않도록 시간이 지날수록 조금씩 안쪽에 그렸습니다). 오른쪽은 같은 움직임을 "지금까지 돈 바퀴 수"로 펼친 것으로, 원의 각 점 위에 정수만큼씩 떨어진 실수들이 겹쳐 있다고 보고 출발점 0에서 연속으로 따라간 값입니다. 고리가 아무리 흔들려도 끝점은 언제나 정수이고, 그 정수가 감김 수입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="lp2-ln" label="감김 수 n" value={n} min={-3} max={3} step={1} onChange={setN} />
        <Slider id="lp2-lw" label="흔들림" value={wob} min={0} max={3} step={0.1} onChange={setWob} />
        <Slider id="lp2-lt" label="시간 t" value={t} min={0} max={1} step={0.01} onChange={setT} />
      </div>
      <div className="fig-split">
        <div ref={circle.wrapRef} className="canvas-box" role="img" aria-label={`원 위를 도는 고리, 시간 t = ${t.toFixed(2)}까지`}>
          <canvas ref={circle.canvasRef} />
        </div>
        <div ref={line.wrapRef} className="canvas-box" role="img" aria-label={`고리를 펼친 값. 지금 ${L[ti].toFixed(2)}바퀴이고 끝에서는 ${L[N].toFixed(0)}입니다.`}>
          <canvas ref={line.canvasRef} />
        </div>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Readout label="지금까지 돈 바퀴 수" value={L[ti].toFixed(3)} />
        <Readout label="끝점 (t = 1)" value={L[N].toFixed(3)} color="var(--good)" />
      </div>
    </Figure>
  );
}

/* ───────── Figure 4: a fixed point every time ───────── */

function BrouwerFigure() {
  const P = usePalette();
  const [id, setId] = useState<MapId>('swirl');
  const [probe, setProbe] = useState<Pt>([-0.5, 0.35]);
  const [ray, setRay] = useState(true);
  const map = MAPS.find((m) => m.id === id)!;
  const fp = useMemo(() => fixedPoint(map.f), [map]);
  const fq = map.f(probe);
  const r = retract(probe, fq);

  const { wrapRef, canvasRef, size } = useCanvas2D(
    (ctx, { w, h }) => {
      const { S, to } = view(w, h, 16);
      const [cx, cy] = to([0, 0]);
      ctx.fillStyle = alpha(P.math, 0.06);
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, S / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // where each point goes: short arrows from p toward f(p)
      for (let i = -6; i <= 6; i++)
        for (let j = -6; j <= 6; j++) {
          const p: Pt = [i / 6.6, j / 6.6];
          if (Math.hypot(p[0], p[1]) > 0.97) continue;
          const q = map.f(p);
          const [x0, y0] = to(p), [x1, y1] = to([p[0] + (q[0] - p[0]) * 0.28, p[1] + (q[1] - p[1]) * 0.28]);
          ctx.strokeStyle = alpha(P.ink, 0.45);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
          ctx.fillStyle = alpha(P.ink, 0.45);
          ctx.fillRect(x0 - 1, y0 - 1, 2, 2);
        }
      // the probe, its image, and the ray of the would-be retraction
      const [px, py] = to(probe), [qx, qy] = to(fq);
      if (ray && r) {
        const [rx, ry] = to(r);
        ctx.strokeStyle = P.bad;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(qx, qy);
        ctx.lineTo(rx, ry);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = P.bad;
        ctx.beginPath();
        ctx.arc(rx, ry, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `600 11px ${P.fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('r(x)', rx + 6, ry - 2);
      }
      ctx.fillStyle = P.pos;
      ctx.beginPath();
      ctx.arc(qx, qy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = P.neg;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = P.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = `600 11px ${P.fontMono}`;
      ctx.fillStyle = P.ink2;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('x', px + 8, py + 2);
      ctx.fillText('f(x)', qx + 7, qy + 2);
      // the fixed point
      const [fx, fy] = to(fp.p);
      ctx.strokeStyle = P.good;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(fx, fy, 9, 0, Math.PI * 2);
      ctx.stroke();
    },
    [P, map, probe, fq, r, ray, fp],
    { aspect: 1, maxHeight: 380 },
  );

  useDrag(wrapRef, {
    hit: () => 'p',
    onDrag: (_id, x, y) => {
      const { from } = view(size.w, size.h, 16);
      let p = from(x, y);
      const d = Math.hypot(p[0], p[1]);
      if (d > 0.98) p = [(p[0] / d) * 0.98, (p[1] / d) * 0.98];
      setProbe(p);
    },
  });

  const gap = Math.hypot(fq[0] - probe[0], fq[1] - probe[1]);
  return (
    <Figure
      no={4}
      title="원판을 원판 안으로 보내면 움직이지 않는 점이 있습니다"
      hint="지도를 고르고 파란 점을 끌어 보세요"
      caption={
        <>
          짧은 선은 각 점 x가 f(x) 쪽으로 움직이는 방향입니다. 초록 고리가 수치로 찾은 고정점 f(x) = x입니다. 빨간 점선은 증명에서 쓰는 가상의 함수 r로, f(x)에서 x를 지나는 반직선이 원에 닿는 점입니다. 파란 점을 고정점 쪽으로 끌어 가면 f(x)와 x가 가까워지면서 반직선의 방향이 불안정해지고, 정확히 고정점에서는 반직선을 정할 수 없습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={setId} options={MAPS.map((m) => ({ value: m.id, label: m.name }))} />
        <Check label="r(x) 보이기" checked={ray} onChange={setRay} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`단위 원판을 자기 안으로 보내는 함수 ${map.name}. 고정점은 (${fp.p[0].toFixed(3)}, ${fp.p[1].toFixed(3)})이고, 지금 점 x에서 f(x)까지 거리는 ${gap.toFixed(3)}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="lp2-px" label="x의 가로 좌표" value={probe[0]} min={-0.95} max={0.95} step={0.01} onChange={(v) => setProbe(([, y]) => [v, Math.max(-Math.sqrt(Math.max(0, 0.96 - v * v)), Math.min(Math.sqrt(Math.max(0, 0.96 - v * v)), y))])} />
          <Slider id="lp2-py" label="x의 세로 좌표" value={probe[1]} min={-0.95} max={0.95} step={0.01} onChange={(v) => setProbe(([x]) => [Math.max(-Math.sqrt(Math.max(0, 0.96 - v * v)), Math.min(Math.sqrt(Math.max(0, 0.96 - v * v)), x)), v])} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="고정점" value={`(${fp.p[0].toFixed(4)}, ${fp.p[1].toFixed(4)})`} color="var(--good)" />
            <Readout label="|f(x*) − x*|" value={fp.err < 1e-12 ? '< 10⁻¹²' : fp.err.toExponential(1)} />
            <Readout label="|f(x) − x|" value={gap.toFixed(3)} />
          </div>
          <Legend
            items={[
              { color: 'var(--neg)', label: 'x', shape: 'dot' },
              { color: 'var(--pos)', label: 'f(x)', shape: 'dot' },
              { color: 'var(--good)', label: '고정점', shape: 'dot' },
              { color: 'var(--bad)', label: 'r(x)', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ───────── Lesson ───────── */

export default function FundamentalGroup() {
  return (
    <>
      <h2>구멍을 고리로 찾기</h2>
      <p>
        앞 장에서는 곡면을 오일러 지표라는 수 하나로 셌습니다. 이 장에서는 구멍을 다른 방식으로 찾습니다. 공간 안의 한 점에 고무줄의 양 끝을 묶고 고무줄을 한 바퀴 둘렀다고 합시다. 고무줄을 공간 밖으로 빼내지 않고 당겨서 그 점 하나로 오므릴 수 있다면 고무줄이 두른 곳에는 구멍이 없습니다. 오므릴 수 없다면 고무줄이 무언가를 감싸고 있는 것입니다.
      </p>
      <p>
        정확히 말하면, 기준점 <M>{'x_0'}</M>에서 출발해 <M>{'x_0'}</M>로 돌아오는 연속 함수 <M>{'\\gamma: [0,1] \\to X'}</M>, <M>{'\\gamma(0) = \\gamma(1) = x_0'}</M>을 <T en="loop">고리</T>라고 합니다. 두 고리 <M>{'\\gamma_0, \\gamma_1'}</M>이 <T en="homotopic">호모토픽</T>하다는 것은 기준점을 고정한 채 하나를 다른 하나로 연속적으로 바꾸는 함수가 있다는 뜻입니다.
      </p>
      <MB>{'H: [0,1] \\times [0,1] \\to X,\\quad H(t, 0) = \\gamma_0(t),\\ H(t, 1) = \\gamma_1(t),\\ H(0, s) = H(1, s) = x_0'}</MB>
      <PullFigure />
      <p>
        구멍을 감싸지 않는 고리와, 한 바퀴 감았다가 같은 길로 되감는 고리는 한 점으로 줄어듭니다. 한 번이나 두 번 감은 고리는 구멍에 걸립니다. 걸린 고리가 몇 번 감았는지 세는 수가 <T en="winding number">감김 수</T>입니다. 고리를 따라가며 구멍 쪽을 바라보는 방향이 돈 각도를 모두 더하면 2π의 정수배가 되고, 그 정수입니다.
      </p>
      <MB>{'w(\\gamma, p) = \\frac{1}{2\\pi} \\oint_\\gamma d\\theta \\in \\mathbb{Z}'}</MB>
      <p>
        호모토피는 고리를 조금씩 바꾸므로 각도의 합도 조금씩만 변하는데, 그 값이 늘 정수여야 하니 아예 변할 수 없습니다. 그래서 호모토픽한 고리는 감김 수가 같고, 감김 수가 다른 고리는 서로 호모토픽하지 않습니다.
      </p>

      <h2>고리들이 이루는 군</h2>
      <p>
        두 고리 <M>{'\\alpha, \\beta'}</M>를 이어 붙인 <M>{'\\alpha \\cdot \\beta'}</M>(α를 다 돈 뒤 β를 도는 고리)는 다시 고리입니다. 호모토픽한 고리를 같은 것으로 보면 이 이어 붙이기는 결합법칙을 만족하고, 제자리에 머무는 상수 고리가 항등원, 같은 길을 거꾸로 도는 <M>{'\\alpha^{-1}'}</M>이 역원입니다. 이렇게 만든 군을 <M>{'X'}</M>의 <T en="fundamental group">기본군</T> <M>{'\\pi_1(X, x_0)'}</M>라고 합니다. 군의 공리는 <a href={lessonHref('math-abstract-algebra', 'groups')}>현대대수학의 대칭과 군 장</a>에서 다뤘습니다.
      </p>
      <GroupFigure />
      <div className="lp2-thm">
        <b>정리.</b> 원 <M>{'S^1'}</M>의 기본군은 정수의 덧셈군입니다. 고리를 감김 수로 보내는 함수 <M>{'w: \\pi_1(S^1) \\to \\mathbb{Z}'}</M>가 동형 사상입니다.
      </div>
      <LiftFigure />
      <div className="lp2-proof">
        <p>
          <span className="lp2-proof-head">증명의 줄기.</span> 함수 <M>{'p: \\mathbb{R} \\to S^1,\\ p(s) = (\\cos 2\\pi s, \\sin 2\\pi s)'}</M>는 실수 직선을 원에 감습니다. 원 위의 고리 γ는 출발점을 0으로 정하면 <M>{'p \\circ \\tilde\\gamma = \\gamma'}</M>인 실수 위의 연속 경로 <M>{'\\tilde\\gamma'}</M>로 단 하나의 방법으로 펼쳐집니다(그림 3의 오른쪽 그래프). 끝점 <M>{'\\tilde\\gamma(1)'}</M>은 <M>{'p'}</M>로 보내면 기준점이 되므로 정수이고, 이것을 감김 수로 정의합니다.
        </p>
        <p>
          호모토피도 같은 방식으로 펼쳐지므로 호모토픽한 고리는 같은 끝점을 갖습니다. 이어 붙인 고리의 펼침은 첫 고리의 펼침 뒤에 두 번째 펼침을 첫 끝점만큼 옮겨 이은 것이므로 끝점이 더해지고, w는 준동형입니다. 끝점이 n인 고리 <M>{'t \\mapsto p(nt)'}</M>가 있으므로 w는 전사이고, 끝점이 0인 고리는 펼침을 직선 위에서 0으로 줄인 뒤 <M>{'p'}</M>로 보내면 상수 고리로 줄어드므로 w는 단사입니다. <span className="lp2-qed">∎</span>
        </p>
      </div>
      <p>
        구멍이 둘이면 이야기가 달라집니다. 그림 1에서 "a 다음 b"와 "b 다음 a"는 두 구멍 둘레의 감김 수가 둘 다 (1, 1)로 같지만, 한 고리를 다른 고리로 바꾸는 호모토피는 없습니다. 그 증거가 <M>{'a \\cdot b \\cdot a^{-1} \\cdot b^{-1}'}</M>입니다. 감김 수는 두 구멍 모두 0인데도 그림 1에서 당기면 두 구멍 사이에 걸려 줄어들지 않습니다. 만약 ab와 ba가 호모토픽하다면 이 고리는 상수 고리와 호모토픽해야 하므로, 구멍 두 개 뚫린 평면의 기본군은 교환법칙이 성립하지 않는 군입니다. 감김 수만으로는 이 차이를 볼 수 없고, 기본군은 감김 수보다 많은 것을 기억합니다.
      </p>
      <Callout kind="note">
        감김 수는 <a href={lessonHref('math-complex-analysis', 'residues')}>복소해석의 유수 정리</a>에서 다시 나옵니다. 닫힌 경로를 따라 <M>{'\\frac{1}{2\\pi i}\\oint \\frac{dz}{z - a}'}</M>를 계산한 값이 정확히 경로가 a를 감은 횟수입니다.
      </Callout>

      <h2>응용: 언제나 움직이지 않는 점이 있다</h2>
      <p>
        컵에 든 커피를 저으면, 젓기를 멈춘 뒤 처음 자리에 그대로 있는 커피 알갱이가 적어도 하나는 있습니다. 평면 버전은 다음과 같습니다.
      </p>
      <div className="lp2-thm">
        <b>브라우어 고정점 정리 (2차원).</b> 닫힌 원판 <M>{'D = \\{x \\in \\mathbb{R}^2 : |x| \\le 1\\}'}</M>에서 자기 자신으로 가는 연속 함수 <M>{'f: D \\to D'}</M>에는 <M>{'f(x) = x'}</M>인 점 x가 적어도 하나 있습니다.
      </div>
      <BrouwerFigure />
      <div className="lp2-proof">
        <p>
          <span className="lp2-proof-head">증명.</span> 고정점이 없다고 가정합시다. 그러면 모든 x에서 <M>{'f(x) \\ne x'}</M>이므로, f(x)에서 출발해 x를 지나는 반직선이 원 <M>{'S^1 = \\partial D'}</M>에 닿는 점 <M>{'r(x)'}</M>가 하나로 정해집니다(그림 4의 빨간 점선). f가 연속이고 반직선이 원과 만나는 점은 두 점의 위치에 연속적으로 의존하므로 <M>{'r: D \\to S^1'}</M>은 연속입니다. x가 이미 원 위에 있으면 반직선이 x에서 원을 떠나므로 <M>{'r(x) = x'}</M>입니다.
        </p>
        <p>
          이제 원을 한 바퀴 도는 고리 <M>{'\\gamma(t) = (\\cos 2\\pi t, \\sin 2\\pi t)'}</M>를 생각합니다. 원판 안에서는 <M>{'H(t, s) = (1 - s)\\gamma(t) + s\\,\\gamma(0)'}</M>이 γ를 상수 고리로 줄이는 호모토피입니다. 여기에 r을 씌운 <M>{'r \\circ H'}</M>는 원 위의 호모토피이고, s = 0에서 <M>{'r \\circ \\gamma = \\gamma'}</M>(감김 수 1), s = 1에서 상수 고리(감김 수 0)입니다. 호모토픽한 고리는 감김 수가 같아야 하므로 1 = 0이 되어 모순입니다. 따라서 고정점이 있습니다. <span className="lp2-qed">∎</span>
        </p>
      </div>
      <p>
        증명은 고정점이 어디 있는지 알려 주지 않습니다. 그림 4의 고정점은 컴퓨터가 원판을 촘촘히 훑어 |f(x) − x|가 가장 작은 곳을 찾은 뒤 뉴턴 방법으로 다듬은 것입니다. 줄이고 미는 지도는 (0.8, −0.4), 돌리기는 원점, 소용돌이는 (0.0735, 0.0634), 접어 구기기는 (0.5310, 0.2922)에 고정점이 있습니다. 같은 정리는 차원에 상관없이 성립하고, 게임 이론의 내시 균형이 존재한다는 증명이 이 정리를 씁니다.
      </p>
      <Callout kind="intuition">
        털이 난 공의 털을 모두 빗어 눕히려고 하면 어딘가에는 반드시 가마가 생깁니다. 구 위의 연속인 접선 벡터장에는 0이 되는 점이 있다는 <T en="hairy ball theorem">털 난 공 정리</T>입니다. 지구 표면에서 바람이 부는 방향을 생각하면, 어느 순간에나 바람이 불지 않는 곳이 적어도 한 곳 있다는 뜻이 됩니다. 토러스에서는 털을 가마 없이 빗을 수 있는데, 이 차이도 오일러 지표 2와 0의 차이에서 나옵니다.
      </Callout>

      <Callout kind="key">
        기준점에서 출발해 돌아오는 고리를 연속적으로 바꿀 수 있는 것끼리 묶으면, 이어 붙이기를 연산으로 하는 기본군이 생깁니다. 고리가 한 점으로 줄어들지 않는다는 것은 공간에 구멍이 있다는 뜻입니다. 원의 기본군은 정수이고 그 정수가 감김 수이며, 구멍이 둘이면 기본군은 교환법칙이 성립하지 않습니다. 원판에서 원으로 원을 고정한 채 접어 넣는 연속 함수가 없다는 사실에서 브라우어 고정점 정리가 나옵니다.
      </Callout>
      <Quiz
        q="구멍 p와 q가 뚫린 평면에서 고리 γ는 p 둘레를 시계 반대 방향으로 한 바퀴, q 둘레를 한 바퀴 돈 뒤, p 둘레를 거꾸로 한 바퀴, q 둘레를 거꾸로 한 바퀴 돕니다. 옳은 것은?"
        options={['감김 수가 모두 0이므로 γ는 한 점으로 줄일 수 있다', '감김 수는 모두 0이지만 γ는 한 점으로 줄일 수 없다', 'p 둘레 감김 수가 2이다', '평면의 기본군은 언제나 교환법칙을 만족하므로 γ = 상수 고리이다']}
        answer={1}
        explain={
          <>
            γ는 <M>{'aba^{-1}b^{-1}'}</M>이라 p와 q 둘레의 감김 수가 둘 다 1 − 1 = 0입니다. 그래도 그림 1에서 당겨 보면 두 구멍 사이에 걸립니다. 구멍이 둘인 평면의 기본군에서는 ab ≠ ba이므로 이 교환자는 항등원이 아니고, 감김 수만으로는 그 차이가 보이지 않습니다.
          </>
        }
      />
    </>
  );
}
