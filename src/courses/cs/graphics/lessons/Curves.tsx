import { useRef, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { EASINGS, bernstein, convexHull, deCasteljau, ease, kinkDegrees, mirrorHandle, sampleCurve, weights, type Pt } from './bezier';
import './graphics.css';
import './curves.css';

const nf = (v: number, d = 2) => (Math.abs(v) < 5e-12 ? 0 : v).toFixed(d);
const ps = (p: Pt) => `(${nf(p[0], 1)}, ${nf(p[1], 1)})`;

/* ─────────────── shared: a 10 × 6 drawing board ─────────────── */

const BW = 10;
const BH = 6;

function board(w: number, h: number) {
  const s = Math.min((w - 20) / BW, (h - 20) / BH);
  const ox = (w - BW * s) / 2;
  const oy = (h - BH * s) / 2;
  return { s, X: (x: number) => ox + x * s, Y: (y: number) => oy + (BH - y) * s, inv: (px: number, py: number): Pt => [Math.max(0.2, Math.min(BW - 0.2, (px - ox) / s)), Math.max(0.2, Math.min(BH - 0.2, BH - (py - oy) / s))] };
}

function drawGrid(ctx: CanvasRenderingContext2D, P: Palette, b: ReturnType<typeof board>) {
  ctx.strokeStyle = P.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= BW; x++) {
    ctx.beginPath();
    ctx.moveTo(Math.round(b.X(x)) + 0.5, b.Y(0));
    ctx.lineTo(Math.round(b.X(x)) + 0.5, b.Y(BH));
    ctx.stroke();
  }
  for (let y = 0; y <= BH; y++) {
    ctx.beginPath();
    ctx.moveTo(b.X(0), Math.round(b.Y(y)) + 0.5);
    ctx.lineTo(b.X(BW), Math.round(b.Y(y)) + 0.5);
    ctx.stroke();
  }
}

function polyline(ctx: CanvasRenderingContext2D, b: ReturnType<typeof board>, pts: Pt[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(b.X(p[0]), b.Y(p[1])) : ctx.moveTo(b.X(p[0]), b.Y(p[1]))));
}

function knob(ctx: CanvasRenderingContext2D, P: Palette, x: number, y: number, label: string, color: string, filled = true) {
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = filled ? color : P.surface;
  ctx.fill();
  ctx.strokeStyle = filled ? P.surface : color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = P.ink2;
  ctx.font = `600 11px ${P.fontMono}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 10, y - 10);
}

function nearest(pts: Pt[], b: ReturnType<typeof board>, x: number, y: number, r = 16): number | null {
  let best: number | null = null;
  let bd = r;
  pts.forEach((p, i) => {
    const d = Math.hypot(b.X(p[0]) - x, b.Y(p[1]) - y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/* ─────────────── Figure 1: de Casteljau ─────────────── */

const CUBIC: Pt[] = [
  [1, 1],
  [2.4, 5.2],
  [7, 5.3],
  [9, 1.2],
];
const QUAD: Pt[] = [
  [1, 1],
  [5, 5.4],
  [9, 1.2],
];

function CasteljauFigure() {
  const P = usePalette();
  const [deg, setDeg] = useState<2 | 3>(3);
  const [pts, setPts] = useState<Record<2 | 3, Pt[]>>({ 2: QUAD, 3: CUBIC });
  const [t, setT] = useState(0.35);
  const [hull, setHull] = useState(false);
  const [pick, setPick] = useState(1);
  const cp = pts[deg];
  const levels = deCasteljau(cp, t);
  const B = levels[levels.length - 1][0];
  const p = Math.min(pick, cp.length - 1);
  const setPoint = (i: number, q: Pt) => setPts((all) => ({ ...all, [deg]: all[deg].map((o, k) => (k === i ? q : o)) }));
  const levelColor = (P: Palette, i: number) => [P.ink3, P.accent, P.stats2, P.good][i] ?? P.ink;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const b = board(w, h);
      drawGrid(ctx, P, b);
      if (hull) {
        const hp = convexHull(cp);
        polyline(ctx, b, hp);
        ctx.closePath();
        ctx.fillStyle = alpha(P.hl, 0.22);
        ctx.fill();
      }
      // the finished curve, with the part already traced darker
      const curve = sampleCurve(cp, 96);
      ctx.strokeStyle = alpha(P.ink, 0.25);
      ctx.lineWidth = 3;
      polyline(ctx, b, curve);
      ctx.stroke();
      ctx.strokeStyle = P.ink;
      polyline(ctx, b, curve.slice(0, Math.round(t * 96) + 1).concat([B]));
      ctx.stroke();
      // each level of interpolation
      levels.slice(0, -1).forEach((lv, i) => {
        ctx.strokeStyle = levelColor(P, i);
        ctx.lineWidth = i === 0 ? 1.5 : 1.8;
        ctx.setLineDash(i === 0 ? [5, 4] : []);
        polyline(ctx, b, lv);
        ctx.stroke();
        ctx.setLineDash([]);
        if (i > 0)
          lv.forEach((q) => {
            ctx.fillStyle = levelColor(P, i);
            ctx.beginPath();
            ctx.arc(b.X(q[0]), b.Y(q[1]), 4, 0, Math.PI * 2);
            ctx.fill();
          });
      });
      cp.forEach((q, i) => knob(ctx, P, b.X(q[0]), b.Y(q[1]), `P${i}`, i === p ? P.accent : P.ink2, i === p));
      ctx.fillStyle = P.bad;
      ctx.beginPath();
      ctx.arc(b.X(B[0]), b.Y(B[1]), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = P.bad;
      ctx.font = `700 12px ${P.fontMono}`;
      ctx.textAlign = 'left';
      ctx.fillText(`B(${nf(t)})`, b.X(B[0]) + 9, b.Y(B[1]) + 14);
    },
    [P, cp, t, hull, p, levels, B],
    { aspect: BW / BH, maxHeight: 420 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      const el = canvasRef.current;
      return el ? nearest(cp, board(el.clientWidth, el.clientHeight), x, y) : null;
    },
    onDrag: (id, x, y) => {
      const el = canvasRef.current;
      if (!el) return;
      setPick(id as number);
      setPoint(id as number, board(el.clientWidth, el.clientHeight).inv(x, y));
    },
  });

  return (
    <Figure
      no={1}
      title="드카스텔조: 사이점의 사이점의 사이점"
      hint="조절점을 끌고, t를 움직여 보세요"
      caption={
        <>
          점선이 조절점을 잇는 <strong>조절 다각형</strong>입니다. 각 변에서 t만큼 간 점을 찍어 잇고(파랑), 그 선분들에서 다시 t만큼 간 점을 찍어 잇기를 점 하나가 남을 때까지 되풀이합니다. 마지막 점(빨강)이 곡선 위의 점 B(t)이고, t를 0에서 1까지 움직이면 그 점이 지나간 자리가 곡선입니다. 조절점은 끌어서 옮기거나, 아래에서 고른 뒤 슬라이더로 옮길 수 있습니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`${deg}차 베지어 곡선. 조절점 ${cp.map((q, i) => `P${i} ${ps(q)}`).join(', ')}. t = ${nf(t)}일 때 곡선 위의 점은 ${ps(B)}입니다.`} />
        </div>
        <div className="controls">
          <Seg
            label="곡선의 차수"
            value={deg}
            onChange={(v) => setDeg(v)}
            options={[
              { value: 2, label: '2차 (조절점 3개)' },
              { value: 3, label: '3차 (조절점 4개)' },
            ]}
          />
          <Slider id="cv-t" label="t" value={t} min={0} max={1} step={0.01} onChange={setT} format={(v) => nf(v)} />
          <Seg label="옮길 조절점" value={p} onChange={setPick} options={cp.map((_, i) => ({ value: i, label: `P${i}` }))} />
          <Slider id="cv-px" label={`P${p}의 x`} value={cp[p][0]} min={0.2} max={BW - 0.2} step={0.1} onChange={(v) => setPoint(p, [v, cp[p][1]])} format={(v) => nf(v, 1)} />
          <Slider id="cv-py" label={`P${p}의 y`} value={cp[p][1]} min={0.2} max={BH - 0.2} step={0.1} onChange={(v) => setPoint(p, [cp[p][0], v])} format={(v) => nf(v, 1)} />
          <Check label="볼록 껍질 보이기" checked={hull} onChange={setHull} />
          <Button small onClick={() => setPts({ 2: QUAD, 3: CUBIC })}>
            처음 모양으로
          </Button>
          <Readout label="B(t)" value={ps(B)} color="var(--bad)" />
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--ink-3)', label: '조절 다각형', shape: 'ln' },
          { color: 'var(--accent)', label: '1단계 사이점', shape: 'ln' },
          { color: 'var(--c-stats-2)', label: '2단계 사이점', shape: 'ln' },
          { color: 'var(--bad)', label: 'B(t)', shape: 'dot' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: Bernstein weights ─────────────── */

function BernsteinFigure() {
  const P = usePalette();
  const [t, setT] = useState(0.25);
  const ws = weights(3, t);
  const colors = (P: Palette) => [P.neg, P.pos, P.good, P.stats2];
  const CSS = ['var(--neg)', 'var(--pos)', 'var(--good)', 'var(--c-stats-2)'];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 36, r: 12, t: 12, b: 30 };
      const barW = Math.min(150, w * 0.28);
      const pw = w - pad.l - pad.r - barW - 24;
      const ph = h - pad.t - pad.b;
      const X = (u: number) => pad.l + u * pw;
      const Y = (v: number) => pad.t + ph - v * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      for (let v = 0; v <= 1.001; v += 0.25) {
        ctx.beginPath();
        ctx.moveTo(X(0), Y(v) + 0.5);
        ctx.lineTo(X(1), Y(v) + 0.5);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(v.toFixed(2), X(0) - 5, Y(v));
      }
      ctx.textAlign = 'center';
      for (let u = 0; u <= 1.001; u += 0.25) ctx.fillText(u.toFixed(2), X(u), Y(0) + 13);
      ctx.fillText('t', X(1) - 4, Y(0) + 25);
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = colors(P)[i];
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let k = 0; k <= 100; k++) {
          const u = k / 100;
          const yy = Y(bernstein(3, i, u));
          if (k) ctx.lineTo(X(u), yy);
          else ctx.moveTo(X(u), yy);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(X(t), Y(0));
      ctx.lineTo(X(t), Y(1));
      ctx.stroke();
      ctx.setLineDash([]);
      ws.forEach((v, i) => {
        ctx.fillStyle = colors(P)[i];
        ctx.beginPath();
        ctx.arc(X(t), Y(v), 4.5, 0, Math.PI * 2);
        ctx.fill();
      });
      // stacked bar: the four weights always fill exactly 1
      const bx = w - pad.r - barW;
      let acc = 0;
      ws.forEach((v, i) => {
        ctx.fillStyle = colors(P)[i];
        ctx.fillRect(bx, Y(acc + v), 34, v * ph);
        acc += v;
      });
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, Y(1) + 0.5, 33, ph);
      ws.forEach((v, i) => {
        ctx.fillStyle = colors(P)[i];
        ctx.font = `600 11px ${P.fontMono}`;
        ctx.textAlign = 'left';
        ctx.fillText(`P${i} ${v.toFixed(3)}`, bx + 42, pad.t + 12 + i * 18);
      });
      ctx.fillStyle = P.ink2;
      ctx.fillText(`합 ${ws.reduce((a, b) => a + b, 0).toFixed(3)}`, bx + 42, pad.t + 12 + 4 * 18 + 4);
    },
    [P, t],
    { aspect: 2.3, maxHeight: 300, minHeight: 230 },
  );

  return (
    <Figure
      no={2}
      title="조절점마다의 무게"
      hint="t를 움직여 보세요"
      caption={
        <>
          3차 베지어 곡선의 점 B(t)는 네 조절점의 가중 평균입니다. 왼쪽 곡선들은 t에 따라 각 조절점이 받는 무게이고, 오른쪽 막대는 지금 t에서의 무게를 쌓은 것입니다. 무게는 언제나 0 이상이고 합이 정확히 1입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} role="img" aria-label={`t = ${nf(t)}에서 네 조절점의 무게: ${ws.map((v, i) => `P${i} ${v.toFixed(3)}`).join(', ')}. 합은 1입니다.`} />
        </div>
        <div className="controls">
          <Slider id="cv-bt" label="t" value={t} min={0} max={1} step={0.01} onChange={setT} format={(v) => nf(v)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {ws.map((v, i) => (
              <Readout key={i} label={`P${i}의 무게`} value={v.toFixed(3)} color={CSS[i]} />
            ))}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: joining curves smoothly ─────────────── */

const PATH0: Pt[] = [
  [0.8, 1.2],
  [1.2, 5],
  [3.8, 5.1],
  [5, 3],
  [6.2, 0.9],
  [8.6, 1],
  [9.2, 4.8],
];

function ContinuityFigure() {
  const P = usePalette();
  const [pts, setPts] = useState<Pt[]>(PATH0);
  const [smooth, setSmooth] = useState(true);
  const kink = kinkDegrees(pts[2], pts[3], pts[4]);

  const move = (i: number, q: Pt) =>
    setPts((cur) => {
      const nx = cur.map((o) => [...o] as Pt);
      if (i === 3) {
        // moving the joint carries both handles with it
        const dx = q[0] - cur[3][0], dy = q[1] - cur[3][1];
        nx[2] = [cur[2][0] + dx, cur[2][1] + dy];
        nx[4] = [cur[4][0] + dx, cur[4][1] + dy];
      }
      nx[i] = q;
      if (smooth && i === 2) nx[4] = mirrorHandle(nx[3], q);
      if (smooth && i === 4) nx[2] = mirrorHandle(nx[3], q);
      return nx;
    });
  const toggle = (v: boolean) => {
    setSmooth(v);
    if (v) setPts((cur) => cur.map((o, k) => (k === 4 ? mirrorHandle(cur[3], cur[2]) : o)));
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const b = board(w, h);
      drawGrid(ctx, P, b);
      ctx.strokeStyle = alpha(P.ink3, 0.8);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      for (const [a, c] of [[0, 1], [2, 3], [3, 4], [5, 6]]) {
        polyline(ctx, b, [pts[a], pts[c]]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = P.accent;
      polyline(ctx, b, sampleCurve(pts.slice(0, 4), 64));
      ctx.stroke();
      ctx.strokeStyle = P.good;
      polyline(ctx, b, sampleCurve(pts.slice(3), 64));
      ctx.stroke();
      pts.forEach((q, i) => knob(ctx, P, b.X(q[0]), b.Y(q[1]), `P${i}`, i === 3 ? P.ink : i === 0 || i === 6 ? P.ink2 : P.ink3, i === 0 || i === 3 || i === 6));
      if (kink > 0.5) {
        ctx.fillStyle = P.bad;
        ctx.font = `700 12px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.fillText(`꺾임 ${kink.toFixed(0)}°`, b.X(pts[3][0]), b.Y(pts[3][1]) + 24);
      }
    },
    [P, pts, kink],
    { aspect: BW / BH, maxHeight: 400 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => {
      const el = canvasRef.current;
      return el ? nearest(pts, board(el.clientWidth, el.clientHeight), x, y) : null;
    },
    onDrag: (id, x, y) => {
      const el = canvasRef.current;
      if (el) move(id as number, board(el.clientWidth, el.clientHeight).inv(x, y));
    },
  });

  return (
    <Figure
      no={3}
      title="두 곡선을 매끄럽게 잇기"
      hint="이음점 양쪽의 손잡이 P2나 P4를 끌어 보세요"
      caption={
        <>
          파란 곡선(P0~P3)과 초록 곡선(P3~P6)이 P3에서 이어집니다. 곡선은 끝점에서 손잡이 쪽으로 출발하므로, 이음점의 두 손잡이 P2와 P4가 P3을 지나는 한 직선 위에 있어야 꺾이지 않습니다. "매끄럽게 잇기"를 켜면 한쪽 손잡이를 옮길 때 다른 쪽이 P3을 중심으로 대칭으로 따라옵니다. 펜 도구에서 손잡이 한쪽을 끌면 반대쪽이 따라 움직이는 이유입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`3차 베지어 곡선 두 개가 P3 ${ps(pts[3])}에서 이어집니다. 이음점에서 ${kink > 0.5 ? `${kink.toFixed(0)}도 꺾입니다` : '꺾이지 않고 매끄럽습니다'}.`} />
        </div>
        <div className="controls">
          <Check label="매끄럽게 잇기 (손잡이 대칭)" checked={smooth} onChange={toggle} />
          <Slider id="cv-h2x" label="P2의 x" value={pts[2][0]} min={0.2} max={BW - 0.2} step={0.1} onChange={(v) => move(2, [v, pts[2][1]])} format={(v) => nf(v, 1)} />
          <Slider id="cv-h2y" label="P2의 y" value={pts[2][1]} min={0.2} max={BH - 0.2} step={0.1} onChange={(v) => move(2, [pts[2][0], v])} format={(v) => nf(v, 1)} />
          <Button small onClick={() => setPts(PATH0)}>
            처음 모양으로
          </Button>
          <Readout label="이음점의 꺾임" value={`${kink.toFixed(1)}°`} color={kink > 0.5 ? 'var(--bad)' : 'var(--good)'} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: easing between keyframes ─────────────── */

const DURATION = 1.2;
const PAUSE = 0.6;

function EasingFigure() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const [id, setId] = useState('ease-in-out');
  const [custom, setCustom] = useState<[number, number, number, number]>([0.7, 0, 0.2, 1]);
  const [playing, setPlaying] = useState(!still);
  const [x, setX] = useState(0.5);
  const clock = useRef(0);
  const cb = id === 'custom' ? custom : EASINGS.find((e) => e.id === id)!.cb;

  useAnimationFrame((dt) => {
    clock.current = (clock.current + dt) % (DURATION + PAUSE);
    setX(Math.min(1, clock.current / DURATION));
  }, playing && inView);

  const y = ease(cb, x);
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const narrow = w < 560;
      const trackH = 70;
      // the track with keyframes and equal-time ghosts
      const tx0 = 30, tx1 = w - 30, ty = 34;
      const TX = (v: number) => tx0 + v * (tx1 - tx0);
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx0, ty);
      ctx.lineTo(tx1, ty);
      ctx.stroke();
      ctx.fillStyle = P.ink3;
      ctx.font = `600 10px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.fillText('키프레임 1', tx0, ty - 18);
      ctx.fillText('키프레임 2', tx1, ty - 18);
      for (let k = 0; k <= 10; k++) {
        const g = ease(cb, k / 10);
        ctx.fillStyle = alpha(P.accent, 0.28);
        ctx.beginPath();
        ctx.arc(TX(g), ty, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = P.accent;
      ctx.beginPath();
      ctx.arc(TX(y), ty, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = P.surface;
      ctx.lineWidth = 2;
      ctx.stroke();

      // progress vs time
      const pad = { l: 44, r: 16, t: trackH + 10, b: 30 };
      const side = Math.min(h - pad.t - pad.b, narrow ? w - pad.l - pad.r : 260);
      const px0 = narrow ? pad.l : (w - side) / 2;
      const X = (u: number) => px0 + u * side;
      const Y = (v: number) => pad.t + side - ((v + 0.2) / 1.4) * side;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(X(0) + 0.5, Y(1) + 0.5, side, Y(0) - Y(1));
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('0', X(0) - 5, Y(0));
      ctx.fillText('1', X(0) - 5, Y(1));
      ctx.textAlign = 'center';
      ctx.fillText('시간 →', X(0.5), Y(0) + 16);
      ctx.save();
      ctx.translate(X(0) - 26, Y(0.5));
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('진행 →', 0, 0);
      ctx.restore();
      ctx.strokeStyle = alpha(P.ink3, 0.6);
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(1), Y(1));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let k = 0; k <= 120; k++) {
        const u = k / 120;
        const yy = Y(ease(cb, u));
        if (k) ctx.lineTo(X(u), yy);
        else ctx.moveTo(X(u), yy);
      }
      ctx.stroke();
      if (cb) {
        // the curve's own control points: (0,0) → (x1,y1), (1,1) → (x2,y2)
        ctx.strokeStyle = alpha(P.ink2, 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(X(0), Y(0));
        ctx.lineTo(X(cb[0]), Y(cb[1]));
        ctx.moveTo(X(1), Y(1));
        ctx.lineTo(X(cb[2]), Y(cb[3]));
        ctx.stroke();
        for (const [a, c] of [[cb[0], cb[1]], [cb[2], cb[3]]]) {
          ctx.fillStyle = P.surface;
          ctx.strokeStyle = P.ink2;
          ctx.beginPath();
          ctx.arc(X(a), Y(c), 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.fillStyle = P.bad;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), 5, 0, Math.PI * 2);
      ctx.fill();
    },
    [P, x, y, cb],
    { height: 380, minHeight: 300 },
  );

  return (
    <Figure
      no={4}
      title="두 키프레임 사이를 어떻게 채울까"
      hint="움직임의 종류를 바꿔 보세요"
      caption={
        <>
          위는 공이 키프레임 1에서 2로 가는 모습이고, 옅은 점들은 같은 시간 간격(10분의 1마다)에 공이 있는 자리입니다. 점 사이가 넓은 곳에서 빠르고 좁은 곳에서 느립니다. 아래 그래프는 시간에 따른 진행이고, 점선이 선형입니다. CSS의 cubic-bezier(x1, y1, x2, y2)는 (0, 0)과 (1, 1)을 잇는 3차 베지어 곡선의 가운데 조절점 둘을 정합니다.
        </>
      }
    >
      <div className="fig-split" ref={outer}>
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} role="img" aria-label={`${id === 'custom' ? '직접 만든' : id} 움직임. 시간의 ${Math.round(x * 100)}% 지점에서 공은 거리의 ${Math.round(y * 100)}%만큼 갔습니다.`} />
        </div>
        <div className="controls">
          <Seg label="움직임" value={id} onChange={setId} options={[...EASINGS.map((e) => ({ value: e.id, label: e.name })), { value: 'custom', label: '직접' }]} />
          {id === 'custom' && (
            <>
              <Slider id="cv-x1" label="x1" value={custom[0]} min={0} max={1} step={0.01} onChange={(v) => setCustom([v, custom[1], custom[2], custom[3]])} format={(v) => nf(v)} />
              <Slider id="cv-y1" label="y1" value={custom[1]} min={-0.5} max={1.5} step={0.01} onChange={(v) => setCustom([custom[0], v, custom[2], custom[3]])} format={(v) => nf(v)} />
              <Slider id="cv-x2" label="x2" value={custom[2]} min={0} max={1} step={0.01} onChange={(v) => setCustom([custom[0], custom[1], v, custom[3]])} format={(v) => nf(v)} />
              <Slider id="cv-y2" label="y2" value={custom[3]} min={-0.5} max={1.5} step={0.01} onChange={(v) => setCustom([custom[0], custom[1], custom[2], v])} format={(v) => nf(v)} />
            </>
          )}
          <Slider
            id="cv-time"
            label="시간"
            value={x}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              setPlaying(false);
              setX(v);
            }}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Button small onClick={() => setPlaying((p) => !p)}>
            {playing ? '❚❚ 멈춤' : '▶ 재생'}
          </Button>
          <div className="cv-css mono">{cb ? `cubic-bezier(${cb.map((v) => nf(v)).join(', ')})` : 'linear'}</div>
          <Readout label="진행" value={`${Math.round(y * 100)}%`} color="var(--accent)" />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Curves() {
  return (
    <>
      <h2>점 몇 개로 곡선을 정하기</h2>
      <p>
        지금까지 이 과목은 모든 것을 삼각형으로 만들었습니다. 하지만 글자의 윤곽이나 로고, 자동차 차체처럼 매끄러운 곡선은 삼각형이나 짧은 선분으로 저장하면 확대할 때마다 각이 드러나고 고치기도 어렵습니다. 그래서 곡선은 몇 개의 <T en="control point">조절점</T>으로 정해 두고, 그릴 때 필요한 만큼 잘게 계산합니다. 그림 도구의 펜으로 점을 찍고 손잡이를 당겨 곡선을 만드는 것이 바로 이것입니다. 가장 널리 쓰는 것은 1960년대 자동차 회사에서 차체를 설계하려고 만든 <T en="Bézier curve">베지어 곡선</T>입니다.
      </p>
      <p>
        베지어 곡선을 그리는 가장 쉬운 방법은 <T en="de Casteljau's algorithm">드카스텔조 알고리즘</T>입니다. 할 일은 "두 점 사이에서 t만큼 간 점 찾기", 즉 선형 보간뿐입니다. 조절점들을 잇는 선분마다 t만큼 간 점을 찍고, 새로 찍은 점들을 이은 선분에서 또 t만큼 간 점을 찍고, 점이 하나 남을 때까지 되풀이합니다.
      </p>
      <CasteljauFigure />
      <p>
        곡선은 언제나 첫 조절점 P0에서 출발해 마지막 조절점에서 끝나지만, 가운데 조절점은 지나가지 않습니다. 가운데 점들은 곡선을 그쪽으로 끌어당길 뿐입니다. 곡선이 P0에서 출발하는 방향은 P0에서 P1 쪽이고, 끝에 도착하는 방향은 마지막 두 조절점이 이루는 방향입니다. 그래서 펜 도구의 손잡이는 "이 점에서 어느 방향으로, 얼마나 세게 나갈지"를 정하는 장치입니다. 볼록 껍질을 켜고 조절점을 끌어 보면, 곡선이 조절점들을 감싸는 가장 작은 볼록 다각형 밖으로 한 번도 나가지 않는 것도 볼 수 있습니다.
      </p>

      <h2>조절점의 가중 평균</h2>
      <p>
        드카스텔조 알고리즘을 식으로 풀어 쓰면, 곡선 위의 점은 조절점들의 가중 평균입니다. 3차 곡선이라면 다음과 같고, 각 조절점의 무게를 <T en="Bernstein polynomial">번스타인 다항식</T>이라고 합니다.
      </p>
      <MB note={<>무게는 (t + (1 − t))³ = 1을 전개한 네 항이므로 합이 언제나 1입니다.</>}>{'\\mathbf{B}(t) = (1-t)^3\\,\\mathbf{P}_0 + 3t(1-t)^2\\,\\mathbf{P}_1 + 3t^2(1-t)\\,\\mathbf{P}_2 + t^3\\,\\mathbf{P}_3'}</MB>
      <BernsteinFigure />
      <p>
        t = 0.25에서 무게는 P0과 P1이 0.422씩, P2가 0.141, P3이 0.016입니다. 곡선의 앞쪽 4분의 1 지점은 거의 P0과 P1만으로 정해집니다. t = 0.5에서는 0.125, 0.375, 0.375, 0.125로 대칭입니다. 무게가 모두 0 이상이고 합이 1이라는 사실에서 곡선이 볼록 껍질 안에 머문다는 성질이 나옵니다. 0 이상인 무게로 평균을 내면 결과는 언제나 원래 점들 사이 어딘가에 있기 때문입니다. 이 성질은 실용적입니다. 조절점들의 경계 상자만 보면 곡선이 화면에 보이는지, 다른 곡선과 겹칠 수 있는지를 곡선을 계산하지 않고 판단할 수 있습니다. <a href={lessonHref('cs-graphics', 'ray-tracing')}>레이 트레이싱</a> 장의 경계 상자와 같은 생각입니다.
      </p>
      <Callout kind="note">
        컴퓨터의 글꼴은 대부분 베지어 곡선으로 저장됩니다. 트루타입(TrueType) 글꼴은 2차 베지어 곡선을, 포스트스크립트 계열(CFF) 글꼴은 3차 베지어 곡선을 씁니다. 웹의 SVG 경로에서 <code>Q</code>는 2차, <code>C</code>는 3차 베지어 곡선입니다. 글자를 아무리 키워도 매끄러운 것은 화면에 그릴 때마다 그 크기에 맞춰 곡선을 다시 계산하기 때문입니다.
      </Callout>
      <Code label="SVG에서 3차 베지어 곡선 두 개를 잇는 경로">{`
<!-- M: 시작점으로 이동, C: 3차 베지어(조절점 둘, 끝점), S: 앞 손잡이를 대칭으로 이어받는 3차 베지어 -->
<path d="M 10 80  C 40 10, 65 10, 95 80  S 150 150, 180 80" />`}</Code>

      <h2>곡선을 이어 붙이기</h2>
      <p>
        복잡한 모양을 3차 곡선 하나로 그리기는 어렵습니다. 대신 짧은 3차 곡선 여러 개를 끝과 끝을 맞대어 잇습니다. 이때 이음점에서 꺾이지 않으려면 앞 곡선이 도착하는 방향과 뒤 곡선이 출발하는 방향이 같아야 합니다. 앞 곡선의 도착 방향은 P2에서 P3 쪽이고, 뒤 곡선의 출발 방향은 P3에서 P4 쪽이니, P2, P3, P4가 한 직선 위에 있으면 됩니다.
      </p>
      <ContinuityFigure />
      <p>
        "매끄럽게 잇기"를 끄고 P2를 끌어 보면 이음점에 각이 생기고, 꺾인 각도가 표시됩니다. 켜 두면 P4가 P3을 중심으로 P2와 대칭인 자리로 따라와 꺾임이 언제나 0°입니다. 위의 SVG 예에서 <code>S</code> 명령이 바로 이렇게 앞 곡선의 손잡이를 대칭으로 이어받는 명령입니다.
      </p>

      <h2>시간도 곡선으로: 키프레임과 이징</h2>
      <p>
        애니메이션도 같은 도구를 씁니다. 애니메이터는 모든 장면을 그리지 않고 중요한 순간의 자세, 즉 <T en="keyframe">키프레임</T>만 정합니다. 그 사이의 장면은 컴퓨터가 <T en="interpolation">보간</T>으로 채웁니다. 가장 단순한 보간은 시간에 비례해 움직이는 선형 보간이지만, 실제 물체는 갑자기 출발하거나 멈추지 않으므로 기계적으로 보입니다. 그래서 시간과 진행의 관계를 곡선으로 바꾸는 <T en="easing">이징</T>을 씁니다. 웹 페이지의 전환 효과에 쓰는 CSS의 <code>transition-timing-function</code>이 바로 3차 베지어 곡선입니다.
      </p>
      <EasingFigure />
      <p>
        ease-in-out은 cubic-bezier(0.42, 0, 0.58, 1)로, 시간의 4분의 1이 지났을 때 거리의 13%만 갔다가 가운데에서 빨라지고 끝에서 다시 느려집니다. 브라우저의 기본값인 ease(0.25, 0.1, 0.25, 1)는 시간의 절반에서 이미 거리의 80%를 갑니다. 처음에 빠르게 반응하고 천천히 자리를 잡아 사용자 조작에 잘 어울립니다. "되튀기"는 y1이 1을 넘어서 공이 도착점을 약 10% 지나쳤다가 돌아옵니다. 조절점의 x는 시간이라 0과 1 사이에 있어야 하지만 y는 진행이라 범위를 벗어나도 됩니다.
      </p>
      <Callout kind="note">
        CSS 엔진은 x(시간)가 주어지면 그에 맞는 곡선의 매개변수를 먼저 찾아야 합니다. x(s)가 3차식이라 바로 풀리지 않으므로 뉴턴 방법으로 몇 번 반복해 근을 찾고, 그 매개변수로 y를 계산합니다. 이 그림도 같은 방법으로 계산합니다.
      </Callout>

      <h2>합성 이미지와 책임</h2>
      <p>
        이 과목에서 다룬 기술, 즉 장면을 원하는 대로 만들고, 빛을 사실처럼 계산하고, 움직임을 자연스럽게 채우는 기술은 이제 생성형 인공지능과 합쳐져 실제로 찍은 것과 구별하기 어려운 사진과 영상을 만듭니다. 실존 인물이 하지 않은 말을 하는 영상, 즉 <T en="deepfake">딥페이크</T>는 사기, 선거 조작, 동의 없는 성적 이미지처럼 실제 피해를 낳고 있습니다. 진짜 증거를 "조작된 것"이라고 우기기 쉬워지는 것도 피해입니다.
      </p>
      <p>
        기술 쪽의 대응은 크게 둘입니다. 하나는 만든 쪽이 출처를 밝히는 것입니다. 카메라와 편집 프로그램, 생성 도구가 "언제, 무엇으로 만들고 고쳤는지"를 전자 서명한 기록으로 파일에 붙이는 <T en="content credentials">콘텐츠 자격 증명</T> 표준(C2PA)이 그 예이고, 생성한 이미지에 눈에 보이지 않는 워터마크를 넣는 방법도 있습니다. 다른 하나는 탐지 모델이지만, 생성 기술이 좋아질수록 탐지는 어려워지는 경쟁이라 출처 기록을 대신하지 못합니다. 그리고 기술만으로는 부족합니다. 합성한 이미지에는 합성이라고 밝히고, 실존 인물의 모습은 동의를 받아 쓰는 것이 만드는 사람의 몫입니다. 소프트웨어를 만드는 사람의 책임은 <a href={lessonHref('cs-software-design', 'collaboration')}>협업과 책임 있는 소프트웨어</a> 장에서 더 다룹니다.
      </p>

      <Callout kind="key">
        베지어 곡선은 몇 개의 조절점으로 정하는 곡선입니다. 드카스텔조 알고리즘은 선형 보간을 되풀이해 곡선 위의 점을 구하고, 식으로 쓰면 곡선 위의 점은 번스타인 다항식을 무게로 한 조절점들의 가중 평균입니다. 그래서 곡선은 첫 점과 끝 점을 지나고, 조절점들의 볼록 껍질 안에 머뭅니다. 곡선 여러 개를 이을 때는 이음점 양쪽 손잡이를 한 직선 위에 두어야 꺾이지 않습니다. 애니메이션의 이징도 시간과 진행을 잇는 3차 베지어 곡선입니다.
      </Callout>
      <Quiz
        q="3차 베지어 곡선의 조절점 P1을 아주 멀리 끌어 놓았다. 곡선에 대해 언제나 참인 것은?"
        options={['곡선이 P1을 지나간다', '곡선이 P0, P1, P2, P3의 볼록 껍질 안에 있다', '곡선의 길이는 그대로다', '곡선이 P0에서 P3 쪽을 향해 출발한다']}
        answer={1}
        explain={<>곡선 위의 점은 0 이상이고 합이 1인 무게로 낸 조절점들의 가중 평균이므로, 조절점이 어디에 있든 볼록 껍질 밖으로 나갈 수 없습니다. 가운데 조절점은 곡선을 끌어당길 뿐 지나가지 않고(무게가 1이 되는 t가 없음), 곡선은 P0에서 P1 쪽을 향해 출발합니다. P1을 멀리 끌면 곡선은 그쪽으로 길게 늘어납니다.</>}
      />
    </>
  );
}
