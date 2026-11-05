import { useMemo, useRef, useState } from 'react';
import { Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { FIELDS, FIELD_IDS, bezier, lineIntegral, segment, tangentialProfile, type FieldId, type V2 } from './fields';
import { clampIn, drawArrows, drawFrame, drawHeat, drawParticles, drawPath, handle, hitHandle, makeParticles, makeView, nf, pathArrows, stepParticles, type View } from './fielddraw';
import './multivariable.css';
import './lineintegrals.css';

const R = 3;
const fieldOptions = (ids: FieldId[] = FIELD_IDS) => ids.map((id) => ({ value: id, label: FIELDS[id].name }));
const vs = (p: V2) => `(${nf(p[0], 2)}, ${nf(p[1], 2)})`;

/* ─────────────── Figure 1: a field, and what it carries ─────────────── */

function FieldFigure() {
  const P = usePalette();
  const [fid, setFid] = useState<FieldId>('wave');
  const [flow, setFlow] = useState(true);
  const [hover, setHover] = useState<V2 | null>(null);
  const f = FIELDS[fid];
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [still] = useState(prefersReducedMotion);
  const parts = useMemo(() => makeParticles(220, R, 11), []);
  const viewRef = useRef<View | null>(null);
  const [, setTick] = useState(0);

  useAnimationFrame((dt) => {
    stepParticles(parts, f, Math.min(dt, 0.05) * 1.2, R);
    setTick((t) => t + 1);
  }, inView && flow && !still);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const v = makeView(w, h, R);
      viewRef.current = v;
      drawFrame(ctx, v, P);
      drawArrows(ctx, v, f, P.ink2, 15);
      if (flow) drawParticles(ctx, v, parts, f, P.accent);
      if (hover) {
        const [p, q] = f.F(hover[0], hover[1]);
        const x = v.X(hover[0]), y = v.Y(hover[1]);
        ctx.strokeStyle = P.pos;
        ctx.fillStyle = P.pos;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(v.X(hover[0] + p * 0.8), v.Y(hover[1] + q * 0.8));
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [P, f, flow, hover, parts, parts.pts[0][0]],
    { aspect: 1, maxHeight: 460, minHeight: 200 },
  );

  useDrag(canvasRef, {
    hit: () => null,
    onDrag: () => {},
    onHover: (_, x, y) => {
      const v = viewRef.current;
      if (!v || x < 0) return setHover(null);
      const p: V2 = [v.ix(x), v.iy(y)];
      setHover(Math.abs(p[0]) <= R && Math.abs(p[1]) <= R ? p : null);
    },
  });

  const val = hover ? f.F(hover[0], hover[1]) : null;
  return (
    <Figure
      no={1}
      title="점마다 화살표가 붙은 평면"
      hint="벡터장을 바꾸고, 그림 위에 포인터를 올려 보세요"
      caption={<>회색 화살표는 가로세로 15칸의 격자점에서 F의 방향과 상대적인 크기입니다. 파란 짧은 선은 흐름에 실려 가는 입자 220개로, 각 점에서 F를 속도 삼아 움직입니다. 포인터를 올린 점의 화살표(주황)는 실제 크기의 0.8배로 그렸습니다.</>}
    >
      <div className="controls row">
        <Seg label="벡터장" value={fid} onChange={setFid} options={fieldOptions()} />
        <Check label="입자 흐르게" checked={flow} onChange={setFlow} />
      </div>
      <div className="fig-split" ref={outer}>
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} role="img" aria-label={`${f.name} 벡터장. ${fid === 'rotation' ? '원점 둘레를 시계 반대 방향으로 돕니다.' : fid === 'source' ? '원점에서 바깥으로 퍼져 나갑니다.' : fid === 'uniform' ? '모든 점에서 같은 화살표입니다.' : fid === 'hill' ? '언덕 꼭대기로 모이고 골짜기에서 흩어집니다.' : '물결처럼 굽이치며 조금씩 바깥으로 퍼집니다.'}${hover && val ? ` 포인터 위치 ${vs(hover)}에서 F = ${vs(val)}.` : ''}`} />
        </div>
        <div className="controls">
          <div className="li-tex">
            <M>{f.tex}</M>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="포인터 위치 (x, y)" value={hover ? vs(hover) : '그림 위에 올려 보세요'} />
            <Readout label="그 점의 F" value={val ? vs(val) : '–'} color="var(--pos)" />
            <Readout label="크기 |F|" value={val ? nf(Math.hypot(val[0], val[1])) : '–'} />
          </div>
          <p className="mv-small">입자의 길이 짧은 꼬리가 그 점의 속도입니다. 화살표가 빽빽하게 길수록 입자가 빨리 지나갑니다.</p>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: work along a path ─────────────── */

function WorkFigure() {
  const P = usePalette();
  const [fid, setFid] = useState<FieldId>('source');
  const [A, setA] = useState<V2>([-2, -1.5]);
  const [B, setB] = useState<V2>([2, -0.5]);
  const [C, setC] = useState<V2>([0, 2]);
  const [active, setActive] = useState<string | null>(null);
  const f = FIELDS[fid];
  const path = useMemo(() => bezier(A, C, B, 400), [A, B, C]);
  const W = lineIntegral(f, path);
  const prof = useMemo(() => tangentialProfile(f, path, 160), [f, path]);
  let plus = 0, minus = 0;
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1], [x1, y1] = path[i];
    const [p, q] = f.F((x0 + x1) / 2, (y0 + y1) / 2);
    const d = p * (x1 - x0) + q * (y1 - y0);
    if (d > 0) plus += d;
    else minus += d;
  }
  const viewRef = useRef<View | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const v = makeView(w, h, R);
      viewRef.current = v;
      drawFrame(ctx, v, P);
      drawArrows(ctx, v, f, P.ink3, 13);
      // the path, coloured by whether the field helps (F · T > 0) or holds back
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (let i = 1; i < path.length; i++) {
        const [x0, y0] = path[i - 1], [x1, y1] = path[i];
        const [p, q] = f.F((x0 + x1) / 2, (y0 + y1) / 2);
        const d = p * (x1 - x0) + q * (y1 - y0);
        ctx.strokeStyle = d >= 0 ? P.good : P.bad;
        ctx.beginPath();
        ctx.moveTo(v.X(x0), v.Y(y0));
        ctx.lineTo(v.X(x1), v.Y(y1));
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      pathArrows(ctx, v, path, P.ink, 3);
      // the control polygon
      drawPath(ctx, v, [A, C, B], alpha(P.ink3, 0.6), 1, [4, 4]);
      handle(ctx, v, P, A, P.ink, 'A', active === 'A');
      handle(ctx, v, P, B, P.ink, 'B', active === 'B');
      handle(ctx, v, P, C, P.accent, '', active === 'C');
    },
    [P, f, path, A, B, C, active],
    { aspect: 1, maxHeight: 440, minHeight: 200 },
  );

  // the integrand along the path: F · T against arc length, with the signed area shaded
  const plot = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 40, r: 10, t: 12, b: 26 };
      const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const top = Math.max(0.5, ...prof.ft.map(Math.abs)) * 1.1;
      const X = (s: number) => pad.l + (s / prof.total) * pw;
      const Y = (u: number) => pad.t + ph / 2 - (u / top) * (ph / 2);
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, pw, ph);
      ctx.strokeStyle = P.ink3;
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(0) + 0.5);
      ctx.lineTo(pad.l + pw, Y(0) + 0.5);
      ctx.stroke();
      for (let i = 1; i < prof.s.length; i++) {
        const s0 = prof.s[i - 1], s1 = prof.s[i], u0 = prof.ft[i - 1], u1 = prof.ft[i];
        ctx.fillStyle = alpha((u0 + u1) / 2 >= 0 ? P.good : P.bad, 0.28);
        ctx.beginPath();
        ctx.moveTo(X(s0), Y(0));
        ctx.lineTo(X(s0), Y(u0));
        ctx.lineTo(X(s1), Y(u1));
        ctx.lineTo(X(s1), Y(0));
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      prof.s.forEach((s, i) => (i ? ctx.lineTo(X(s), Y(prof.ft[i])) : ctx.moveTo(X(s), Y(prof.ft[i]))));
      ctx.stroke();
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(nf(top, 1), pad.l - 5, Y(top));
      ctx.fillText('0', pad.l - 5, Y(0));
      ctx.fillText(nf(-top, 1), pad.l - 5, Y(-top));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('A', pad.l, pad.t + ph + 6);
      ctx.textAlign = 'right';
      ctx.fillText(`B (길이 ${nf(prof.total)})`, pad.l + pw, pad.t + ph + 6);
      ctx.textAlign = 'center';
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.fillText('길을 따라 간 거리 s', pad.l + pw / 2, pad.t + ph + 6);
    },
    [P, prof],
    { height: 150, minHeight: 120 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => hitHandle(viewRef.current, x, y, [['A', A], ['B', B], ['C', C]]),
    onDrag: (id, x, y) => {
      const p = clampIn(viewRef.current!, x, y);
      setActive(String(id));
      (id === 'A' ? setA : id === 'B' ? setB : setC)(p);
    },
    onEnd: () => setActive(null),
  });

  return (
    <Figure
      no={2}
      title="길을 따라 벡터장이 하는 일"
      hint="A, B와 파란 조절점을 끌어 길을 바꿔 보세요"
      caption={<>길은 A에서 B로 가는 2차 베지어 곡선이고, 파란 점이 휘는 정도를 정합니다. 길의 색은 그 자리에서 F가 진행 방향으로 미는지(초록, F·T &gt; 0) 거꾸로 미는지(빨강)입니다. 아래 그래프는 길을 따라 간 거리 s마다 F·T의 값이고, 색칠한 넓이를 부호까지 세어 더한 것이 일 W입니다. 길을 작은 조각 400개로 나눠 계산했습니다.</>}
    >
      <div className="controls row">
        <Seg label="벡터장" value={fid} onChange={setFid} options={fieldOptions()} />
      </div>
      <div className="fig-split">
        <div className="mv-col">
          <div ref={wrapRef} className="canvas-box grab">
            <canvas ref={canvasRef} role="img" aria-label={`${f.name} 벡터장에서 A ${vs(A)}에서 B ${vs(B)}로 가는 곡선. 조절점 ${vs(C)}. 길을 따라 한 일은 ${nf(W)}이고, 미는 쪽으로 ${nf(plus)}, 거스르는 쪽으로 ${nf(minus)}.`} />
          </div>
          <div ref={plot.wrapRef} className="canvas-box">
            <canvas ref={plot.canvasRef} role="img" aria-label={`길을 따라 간 거리에 대한 F·T 그래프. 넓이의 합은 ${nf(W)}.`} />
          </div>
        </div>
        <div className="controls">
          <div className="li-tex">
            <M>{f.tex}</M>
          </div>
          <Slider id="li-cx" label="조절점 x" value={C[0]} min={-2.8} max={2.8} step={0.05} onChange={(x) => setC([x, C[1]])} format={(x) => nf(x)} color="var(--accent)" />
          <Slider id="li-cy" label="조절점 y" value={C[1]} min={-2.8} max={2.8} step={0.05} onChange={(y) => setC([C[0], y])} format={(x) => nf(x)} color="var(--accent)" />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="미는 쪽 (초록)" value={`+${nf(plus)}`} color="var(--good)" />
            <Readout label="거스르는 쪽 (빨강)" value={nf(minus)} color="var(--bad)" />
          </div>
          <div className="li-big">
            <span>일</span>
            <M>{`W = \\int_C \\mathbf F \\cdot d\\mathbf r = ${nf(W)}`}</M>
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--good)', label: 'F가 진행 방향으로 밂', shape: 'ln' },
          { color: 'var(--bad)', label: 'F가 거꾸로 밂', shape: 'ln' },
          { color: 'var(--accent)', label: '휘는 정도를 정하는 조절점', shape: 'dot' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: does the path matter? ─────────────── */

function IndependenceFigure() {
  const P = usePalette();
  const [fid, setFid] = useState<FieldId>('hill');
  const [A, setA] = useState<V2>([-2, -1.5]);
  const [B, setB] = useState<V2>([2, -0.5]);
  const [C, setC] = useState<V2>([0, 2]);
  const [active, setActive] = useState<string | null>(null);
  const f = FIELDS[fid];
  const straight = useMemo(() => segment(A, B, 400), [A, B]);
  const curve = useMemo(() => bezier(A, C, B, 400), [A, B, C]);
  const W1 = lineIntegral(f, straight);
  const W2 = lineIntegral(f, curve);
  const loop = W2 - W1;
  const dphi = f.potential ? f.potential(B[0], B[1]) - f.potential(A[0], A[1]) : null;
  const viewRef = useRef<View | null>(null);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const v = makeView(w, h, R);
      viewRef.current = v;
      drawFrame(ctx, v, P);
      if (f.potential) {
        const pot = f.potential;
        let m = 1e-9;
        for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) m = Math.max(m, Math.abs(pot(i / 2, j / 2) - pot(0, 0)));
        drawHeat(ctx, v, (x, y) => pot(x, y) - pot(0, 0), P, m, 48, 0.3);
      }
      drawArrows(ctx, v, f, P.ink3, 13);
      // the region between the two paths, when the loop does work
      if (Math.abs(loop) > 0.005) {
        ctx.fillStyle = alpha(P.hl, 0.22);
        ctx.beginPath();
        [...curve, ...straight.slice().reverse()].forEach(([x, y], i) => (i ? ctx.lineTo(v.X(x), v.Y(y)) : ctx.moveTo(v.X(x), v.Y(y))));
        ctx.fill();
      }
      drawPath(ctx, v, straight, P.neg, 3, [8, 5]);
      drawPath(ctx, v, curve, P.pos, 3);
      pathArrows(ctx, v, straight, P.neg, 1);
      pathArrows(ctx, v, curve, P.pos, 2);
      handle(ctx, v, P, A, P.ink, 'A', active === 'A');
      handle(ctx, v, P, B, P.ink, 'B', active === 'B');
      handle(ctx, v, P, C, P.pos, '', active === 'C');
    },
    [P, f, straight, curve, loop, A, B, C, active],
    { aspect: 1, maxHeight: 460, minHeight: 200 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => hitHandle(viewRef.current, x, y, [['A', A], ['B', B], ['C', C]]),
    onDrag: (id, x, y) => {
      const p = clampIn(viewRef.current!, x, y);
      setActive(String(id));
      (id === 'A' ? setA : id === 'B' ? setB : setC)(p);
    },
    onEnd: () => setActive(null),
  });

  const same = Math.abs(loop) < 0.005;
  return (
    <Figure
      no={3}
      title="두 길, 같은 일?"
      hint="벡터장을 바꾸고, 주황 길의 조절점을 끌어 보세요"
      caption={<>파란 점선은 A에서 B로 곧장 가는 길, 주황 실선은 휘어 가는 길입니다. 퍼텐셜이 있는 벡터장에서는 퍼텐셜 φ를 바탕색으로 칠했습니다(주황이 높고 파랑이 낮음). 노란 영역은 두 길이 감싸는 영역으로, 두 길의 일이 다를 때만 칠합니다. "닫힌 길"은 주황 길로 B까지 갔다가 파란 길을 거꾸로 따라 A로 돌아오는 한 바퀴입니다.</>}
    >
      <div className="controls row">
        <Seg label="벡터장" value={fid} onChange={setFid} options={fieldOptions()} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`${f.name} 벡터장. 곧은 길의 일 ${nf(W1)}, 휜 길의 일 ${nf(W2)}. ${same ? '두 길의 일이 같습니다.' : `두 길의 일이 ${nf(Math.abs(loop))}만큼 다릅니다.`}${dphi !== null ? ` 퍼텐셜 차이 φ(B) − φ(A) = ${nf(dphi)}.` : ' 이 벡터장에는 퍼텐셜이 없습니다.'}`} />
        </div>
        <div className="controls">
          <div className="li-tex">
            <M>{f.tex}</M>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="곧은 길의 일" value={nf(W1)} color="var(--neg)" />
            <Readout label="휜 길의 일" value={nf(W2)} color="var(--pos)" />
            <Readout label="닫힌 길 한 바퀴의 일" value={nf(loop)} color={same ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="퍼텐셜 차이 φ(B) − φ(A)" value={dphi !== null ? nf(dphi) : '퍼텐셜 없음'} />
          </div>
          {f.potTex && (
            <div className="li-tex">
              <M>{f.potTex}</M>
            </div>
          )}
          <Slider id="li3-cy" label="휜 길의 조절점 y" value={C[1]} min={-2.8} max={2.8} step={0.05} onChange={(y) => setC([C[0], y])} format={(x) => nf(x)} color="var(--pos)" />
          <div className="mv-note" data-good={same || undefined} data-bad={!same || undefined} aria-live="polite">
            {same
              ? `두 길의 일이 ${nf(W1)}로 같습니다.${dphi !== null ? ' 퍼텐셜이 B와 A에서 갖는 값의 차이와도 같습니다.' : ''}`
              : `길에 따라 일이 다릅니다. 닫힌 길을 한 바퀴 돌면 ${nf(loop)}만큼의 일이 생기고, 이런 벡터장에는 퍼텐셜이 있을 수 없습니다.`}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function LineIntegrals() {
  return (
    <>
      <h2>점마다 화살표가 붙은 평면</h2>
      <p>
        일기 예보의 바람 지도에는 지도 위 곳곳에 작은 화살표가 그려져 있습니다. 화살표의 방향이 그 자리의 바람 방향이고, 길이가 바람의 세기입니다. 이렇게 평면(또는 공간)의 모든 점에 벡터 하나씩을 붙인 것을 <T en="vector field">벡터장</T>이라고 합니다. 평면의 벡터장은 함수 두 개로 적습니다.
      </p>
      <MB>{'\\mathbf F(x, y) = \\big(P(x, y),\\; Q(x, y)\\big)'}</MB>
      <p>
        P는 그 점에서 화살표의 가로 성분, Q는 세로 성분입니다. 강물의 속도, 지구가 물체를 당기는 중력, 전하가 만드는 전기장, 앞 장에서 본 함수의 경사도 모두 벡터장입니다. 그림 1에서 다섯 가지 벡터장을 골라 보세요. 입자를 띄우면 각 점의 화살표를 속도 삼아 흘러가는 모습이 보입니다.
      </p>
      <FieldFigure />
      <p>
        <strong>소용돌이</strong>는 F = (−0.5y, 0.5x)입니다. 점 (x, y)에서 화살표가 원점을 향한 방향 (x, y)에 언제나 수직이라서 입자들이 원점 둘레를 돕니다. <strong>샘</strong>은 화살표가 원점에서 바깥을 향하고 멀수록 길어서, 입자가 퍼져 나가며 점점 빨라집니다. <strong>언덕의 경사</strong>는 함수 φ = sin x cos y의 경사 벡터 ∇φ입니다. <a href={lessonHref('math-multivariable', 'partial-derivatives')}>편미분과 경사</a> 장에서 본 것처럼 경사는 가장 가파르게 오르는 방향이므로, 입자들은 언덕 꼭대기로 모여듭니다.
      </p>

      <h2>길을 따라 더하기: 선적분</h2>
      <p>
        바람 속을 걸어갈 때 바람이 나를 얼마나 도와주었는지 재고 싶다고 합시다. 물리에서 힘 F가 물체를 변위 d만큼 옮길 때 한 <T en="work">일</T>은 내적 F · d입니다. 힘이 진행 방향과 같으면 양수, 반대면 음수, 수직이면 0입니다. 길이 곧지 않고 힘이 자리마다 다르면, 길을 아주 짧은 조각으로 나눠 조각마다 F · Δr을 구해 더합니다. 조각을 한없이 짧게 한 극한이 <T en="line integral">선적분</T>입니다.
      </p>
      <MB note="길 C를 r(t), a ≤ t ≤ b로 나타낼 때">{'W = \\int_C \\mathbf F \\cdot d\\mathbf r = \\int_a^b \\mathbf F\\big(\\mathbf r(t)\\big) \\cdot \\mathbf r\\,\'(t)\\, dt'}</MB>
      <p>
        길의 방향으로 길이 1인 벡터를 T라고 하면 dr = T ds이므로, 선적분은 진행 방향 성분 F · T를 길의 길이 s를 따라 적분한 것과 같습니다. 그림 2의 아래 그래프가 바로 그 F · T입니다.
      </p>
      <WorkFigure />
      <p>
        처음 설정에서 길은 샘 벡터장 위를 A (−2, −1.5)에서 시작해 원점 쪽으로 휘었다가 B (2, −0.5)로 나갑니다. 길이는 5.27이고, 처음 2.75까지는 원점을 향해 들어가며 바깥으로 미는 흐름을 거스릅니다(빨강, −1.51). 그 뒤로는 바깥으로 나가므로 흐름을 탑니다(초록, +1.01). 둘을 더한 일은 −0.50입니다. 조절점을 끌어 길을 바꾸면 빨강과 초록의 비율은 바뀌지만, 샘에서는 합이 언제나 −0.50으로 남습니다. 이것이 다음 절의 주제입니다.
      </p>
      <Callout kind="note">
        선적분에는 방향이 있습니다. 같은 길을 B에서 A로 거꾸로 가면 모든 조각의 Δr이 뒤집히므로 일의 부호가 바뀝니다. 길의 모양만으로는 정해지지 않고, 어느 쪽으로 가는지까지 정해야 값이 정해집니다.
      </Callout>

      <h2>길과 상관없는 일</h2>
      <p>
        같은 두 점 A와 B를 잇는 길은 무수히 많습니다. 길을 바꿔도 일이 같은 벡터장이 있고, 길마다 일이 다른 벡터장이 있습니다. 그림 3에서 곧은 길과 휜 길의 일을 비교해 보세요.
      </p>
      <IndependenceFigure />
      <p>
        <strong>언덕의 경사</strong>에서는 곧은 길도 휜 길도 일이 0.86입니다. 조절점을 아무리 끌어도, A와 B를 옮겨도 두 값은 늘 같고, 퍼텐셜 φ = sin x cos y가 B와 A에서 갖는 값의 차이 φ(B) − φ(A)와도 같습니다. <strong>소용돌이</strong>로 바꾸면 사정이 달라집니다. 곧은 길의 일은 2.00, 휜 길의 일은 −2.00이고, 휜 길로 갔다가 곧은 길로 돌아오는 닫힌 길의 일은 −4.00입니다. 소용돌이는 원점 둘레를 시계 반대 방향으로 미는데, 이 닫힌 길은 시계 방향으로 돌기 때문에 내내 흐름을 거스릅니다. 노란 영역의 넓이가 마침 4라는 것은 우연이 아닙니다. 다음 장의 그린 정리가 그 이유를 알려 줍니다.
      </p>
      <p>
        어떤 길로 가든 일이 같은 벡터장을 <T en="conservative field">보존장</T>이라고 합니다. 보존장에서는 닫힌 길을 한 바퀴 도는 일이 언제나 0이고, 반대로 모든 닫힌 길의 일이 0이면 보존장입니다. 두 길의 일의 차이가 곧 한 바퀴의 일이기 때문입니다.
      </p>

      <h2>퍼텐셜: 높이만 알면 되는 일</h2>
      <p>
        보존장에는 그 벡터장을 경사로 갖는 함수, <T en="potential">퍼텐셜</T> φ가 있습니다. F = ∇φ이면 선적분은 미적분의 기본 정리처럼 양 끝값의 차이로 줄어듭니다.
      </p>
      <MB note="선적분의 기본 정리">{'\\int_C \\nabla \\varphi \\cdot d\\mathbf r = \\varphi(B) - \\varphi(A)'}</MB>
      <p>
        이유는 연쇄 법칙입니다. 길 r(t) 위에서 φ(r(t))를 t로 미분하면 ∇φ · r′(t)이므로, 적분하면 φ(r(b)) − φ(r(a))만 남습니다. 길이 어떻게 굽었는지는 끝에서 끝까지 φ가 얼마나 변했는지에 모두 녹아 있습니다. 등산할 때 길이 어떻든 오른 높이는 출발점과 정상의 고도 차이인 것과 같습니다.
      </p>
      <p>
        퍼텐셜은 거꾸로 적분해서 찾습니다. 샘 F = (0.5x, 0.5y)라면 ∂φ/∂x = 0.5x를 x로 적분해 φ = x²/4 + g(y)를 얻고, ∂φ/∂y = g′(y) = 0.5y에서 g = y²/4입니다. 그래서 φ = (x² + y²)/4이고, 그림 2의 일 −0.50은 φ(B) − φ(A) = 4.25/4 − 6.25/4 = −0.50과 같습니다.
      </p>
      <p>
        퍼텐셜이 있는지는 미리 확인할 수 있습니다. F = ∇φ이면 P = ∂φ/∂x, Q = ∂φ/∂y이고, 혼합 편미분은 순서를 바꿔도 같으므로 다음 조건이 성립해야 합니다.
      </p>
      <MB>{'\\frac{\\partial P}{\\partial y} = \\frac{\\partial Q}{\\partial x}'}</MB>
      <p>
        소용돌이 F = (−0.5y, 0.5x)에서는 ∂P/∂y = −0.5, ∂Q/∂x = 0.5로 다르므로 퍼텐셜이 없습니다. 반대로 영역에 구멍이 없으면 이 조건만으로 퍼텐셜이 있음이 보장됩니다. 구멍이 있으면 조심해야 하는데, 원점을 뺀 평면의 벡터장 (−y, x)/(x² + y²)는 이 조건을 만족하지만 원점 둘레를 한 바퀴 돌면 일이 2π입니다.
      </p>
      <Callout kind="intuition">
        두 편미분의 차이 ∂Q/∂x − ∂P/∂y는 그 점에서 흐름이 얼마나 도는지를 잽니다. 이 값이 어디서나 0이면 흐름이 제자리에서 돌지 않고, 그래서 한 바퀴를 돌아도 쌓이는 일이 없습니다. 다음 장에서 이 양에 <strong>회전</strong>이라는 이름을 붙입니다.
      </Callout>

      <h2>물리에서: 중력과 전기</h2>
      <p>
        중력은 보존장입니다. 지표 근처에서 중력은 F = (0, −mg)이고 퍼텐셜은 −mgy, 물리에서 부르는 위치 에너지는 그 부호를 바꾼 mgy입니다. 공을 어떤 길로 들어 올리든 중력이 한 일은 높이 차이에만 달려 있고, 그래서 미끄럼틀의 모양이 어떻든 마찰이 없다면 바닥에서의 속력은 출발 높이로 정해집니다. 에너지 보존 법칙은 중력이 보존장이라는 사실을 다르게 말한 것입니다.
      </p>
      <p>
        정지한 전하가 만드는 전기장도 보존장이고, 그 퍼텐셜이 전위입니다. 전지의 1.5볼트는 두 극 사이의 퍼텐셜 차이로, 전하 하나를 어떤 경로로 옮기든 전기장이 하는 일이 같다는 뜻입니다. 반면 마찰력처럼 움직이는 방향에 따라 달라지는 힘은 위치만의 벡터장으로 적을 수 없고, 같은 두 점 사이라도 먼 길로 갈수록 더 많은 에너지를 빼앗습니다.
      </p>

      <Callout kind="key">
        벡터장은 점마다 벡터를 붙인 것이고, 선적분 ∫ F · dr은 길을 잘게 나눠 진행 방향 성분 F · T를 더한 것으로 힘이 한 일을 잽니다. 어떤 길로 가든 일이 같은 벡터장을 보존장이라고 하고, 보존장은 퍼텐셜 φ의 경사 F = ∇φ로 쓸 수 있으며, 그때 선적분은 φ(B) − φ(A)입니다. 구멍 없는 영역에서는 ∂P/∂y = ∂Q/∂x가 그 조건이고, 소용돌이처럼 이 조건이 깨지면 닫힌 길을 돌 때 일이 쌓입니다.
      </Callout>
      <Quiz
        q="어떤 벡터장 F에서 점 A에서 점 B로 가는 서로 다른 두 길을 따라 일을 계산했더니 3과 5가 나왔다. 옳은 것은?"
        options={['F에는 퍼텐셜 φ가 있고 φ(B) − φ(A)는 4이다', 'F는 보존장이 아니며, 두 길로 이루어진 닫힌 길을 한 바퀴 도는 일은 0이 아니다', '길이가 긴 쪽의 일이 5이다', '같은 길을 B에서 A로 거꾸로 가도 일은 3과 5 그대로이다']}
        answer={1}
        explain={<>보존장이라면 어느 길로 가든 일이 같아야 합니다. 두 값이 다르므로 보존장이 아니고 퍼텐셜도 없습니다. 한 길로 갔다가 다른 길로 거꾸로 돌아오면 일은 5 − 3 = 2 또는 3 − 5 = −2로 0이 아닙니다. 일은 길이와 관계없이 진행 방향 성분을 더한 값이라 긴 길이 더 크다는 보장이 없고, 길을 거꾸로 가면 부호가 바뀝니다.</>}
      />
    </>
  );
}
