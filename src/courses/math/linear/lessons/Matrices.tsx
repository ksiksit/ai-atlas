import { useRef, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import type { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { F_SHAPE, KEY_HINT, UNIT_SQUARE, arrow, clipTo, hitPoint, knob, label, plane, poly, snapIn, tGrid, useKeyHandles, useLaColors } from './draw';
import { I2, add, ap, col, det, ease, lerpMat, mul, nf, norm, rot, scale, sub, texM2, texV2, tn, type Mat2, type Vec2 } from './la';
import './linear.css';

const vs = (v: Vec2, d = 1) => `(${nf(v[0], d)}, ${nf(v[1], d)})`;
const lerpV = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/* ─────────────── Figure 1: which maps are linear? ─────────────── */

type MapId = 'rot' | 'shear' | 'shift' | 'bend' | 'swirl' | 'stretch';
const MAPS: Record<MapId, { name: string; f: (p: Vec2) => Vec2; linear: boolean; tex: string }> = {
  rot: { name: '회전', f: (p) => ap(rot(Math.PI / 6), p), linear: true, tex: 'T(x, y) = (0.87x - 0.5y,\\; 0.5x + 0.87y)' },
  stretch: { name: '늘이기', f: (p) => [1.5 * p[0], 0.6 * p[1]], linear: true, tex: 'T(x, y) = (1.5x,\\; 0.6y)' },
  shear: { name: '밀기', f: (p) => [p[0] + 0.8 * p[1], p[1]], linear: true, tex: 'T(x, y) = (x + 0.8y,\\; y)' },
  shift: { name: '평행이동', f: (p) => [p[0] + 1, p[1] + 0.6], linear: false, tex: 'T(x, y) = (x + 1,\\; y + 0.6)' },
  bend: { name: '휘기', f: (p) => [p[0], p[1] + 0.18 * p[0] * p[0]], linear: false, tex: 'T(x, y) = (x,\\; y + 0.18x^2)' },
  swirl: {
    name: '소용돌이',
    f: (p) => {
      const r = norm(p);
      return ap(rot(0.22 * r), p);
    },
    linear: false,
    tex: 'T(\\mathbf p) = \\text{회전}(0.22\\lVert\\mathbf p\\rVert)\\,\\mathbf p',
  },
};

function LinearTestFigure() {
  const P = usePalette();
  const [C1, C2] = useLaColors(P);
  const [id, setId] = useState<MapId>('shift');
  const [t, setT] = useState(1);
  const [u, setU] = useState<Vec2>([1.5, 0.5]);
  const [v, setV] = useState<Vec2>([0.5, 2]);
  const plotRef = useRef<Plot | null>(null);
  const F = MAPS[id];
  const g = (p: Vec2): Vec2 => lerpV(p, F.f(p), t);
  const Tu = g(u);
  const Tv = g(v);
  const Tuv = g(add(u, v));
  const sum = add(Tu, Tv);
  const gap = norm(sub(Tuv, sum));
  const o = g([0, 0]);
  const keys = useKeyHandles(['u', 'v'], (k, dx, dy) => {
    const cur = k === 'u' ? u : v;
    (k === 'u' ? setU : setV)([Math.round((cur[0] + dx) * 10) / 10, Math.round((cur[1] + dy) * 10) / 10]);
  });

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 4.6, { cx: 0.6, cy: 0.8, numbers: false });
      plotRef.current = plot;
      // the bent grid: sample every line x = k and y = k
      const un = clipTo(plot);
      for (let k = -6; k <= 7; k++) {
        for (const dir of [0, 1]) {
          ctx.strokeStyle = k === 0 ? alpha(P.ink, 0.55) : alpha(C2, 0.5);
          ctx.lineWidth = k === 0 ? 1.8 : 1;
          ctx.beginPath();
          for (let s = 0; s <= 60; s++) {
            const q = -6 + (13 * s) / 60;
            const p = g(dir === 0 ? [k, q] : [q, k]);
            if (s === 0) ctx.moveTo(plot.X(p[0]), plot.Y(p[1]));
            else ctx.lineTo(plot.X(p[0]), plot.Y(p[1]));
          }
          ctx.stroke();
        }
      }
      un();
      // origin before and after
      plot.dot(0, 0, 4, P.ink3);
      if (norm(o) > 0.05) {
        plot.line(0, 0, o[0], o[1], P.bad, 1.5, [3, 3]);
        plot.dot(o[0], o[1], 5, P.bad);
        label(plot, 'T(0)', o, P.bad, P, -10, -12, 'right');
      }
      // additivity test
      arrow(plot, o, Tu, P.neg, 2.5, 10);
      arrow(plot, o, Tv, P.pos, 2.5, 10);
      plot.line(Tu[0], Tu[1], sum[0], sum[1], alpha(P.pos, 0.6), 1.5, [5, 4]);
      plot.line(Tv[0], Tv[1], sum[0], sum[1], alpha(P.neg, 0.6), 1.5, [5, 4]);
      plot.dot(sum[0], sum[1], 6, P.surface, P.ink2, 2);
      arrow(plot, o, Tuv, C1, 3, 12);
      label(plot, 'T(u+v)', Tuv, C1, P, 10, -14);
      if (gap > 0.08) label(plot, 'T(u)+T(v)', sum, P.ink2, P, 10, 16);
      // handles sit at the inputs u, v (drawn faint)
      arrow(plot, [0, 0], u, alpha(P.neg, 0.35), 1.5, 8);
      arrow(plot, [0, 0], v, alpha(P.pos, 0.35), 1.5, 8);
      knob(plot, u, P.neg, P, keys.active === 'u');
      knob(plot, v, P.pos, P, keys.active === 'v');
      label(plot, 'u', u, P.neg, P, 8, 14);
      label(plot, 'v', v, P.pos, P, 8, 14);
    },
    [P, id, t, u, v, keys.active],
    { aspect: 1.2, maxHeight: 480 },
  );

  useDrag(canvasRef, {
    hit: (x, y) => hitPoint(plotRef.current, x, y, [['u', u], ['v', v]]),
    onDrag: (k, x, y) => (k === 'u' ? setU : setV)(snapIn(plotRef.current!, x, y)),
  });

  const ok = (b: boolean) => (b ? 'var(--good)' : 'var(--bad)');
  const fixed = norm(o) < 0.02;
  const additive = gap < 0.02;
  return (
    <Figure
      no={1}
      title="선형인 변환, 선형이 아닌 변환"
      hint="변환을 고르고, u와 v를 끌어 보세요"
      caption={<>푸른 격자는 원래 정사각형 격자가 변환된 모습입니다. 흐린 화살표가 입력 u, v이고, 진한 화살표가 변환된 T(u), T(v)와 T(u + v)입니다. 점선 평행사변형의 꼭짓점이 T(u) + T(v)인데, 선형변환이면 이 점이 분홍 화살표 끝과 정확히 겹칩니다.</>}
    >
      <div className="controls row">
        <Seg label="변환" value={id} onChange={setId} options={(Object.keys(MAPS) as MapId[]).map((k) => ({ value: k, label: MAPS[k].name }))} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`${F.name} 변환을 적용한 격자. ${F.linear ? '격자선이 곧고 평행하며 원점이 고정됨.' : '선형이 아님.'} T(u+v)와 T(u)+T(v)의 차이 ${nf(gap, 2)}. ${KEY_HINT}`} {...keys.props} />
        </div>
        <div className="controls">
          <div className="la-tex">
            <M>{F.tex}</M>
          </div>
          <Slider id="lt-t" label="변환 진행" value={t} min={0} max={1} step={0.01} onChange={setT} format={(x) => `${Math.round(x * 100)}%`} />
          <div className="readouts la-readtext" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="원점이 제자리에 있는가" value={fixed ? '예' : `아니오: T(0) = ${vs(o)}`} color={ok(fixed)} />
            <Readout label="격자선이 곧고 평행하고 고른가" value={F.linear || id === 'shift' || t === 0 ? '예' : '아니오'} color={ok(F.linear || id === 'shift' || t === 0)} />
            <Readout label="T(u + v) = T(u) + T(v)" value={additive ? '같음' : `다름 (차이 ${nf(gap, 2)})`} color={ok(additive)} />
          </div>
          <div className="la-status" data-tone={F.linear ? 'good' : 'bad'} aria-live="polite">
            {F.linear ? (
              <>
                <strong>{F.name}은 선형변환입니다.</strong> u와 v를 어디로 옮겨도 두 점이 겹칩니다.
              </>
            ) : id === 'shift' ? (
              <>
                <strong>평행이동은 선형이 아닙니다.</strong> 격자는 곧지만 원점이 움직였고, T(u) + T(v)에는 이동량이 두 번 들어갑니다.
              </>
            ) : (
              <>
                <strong>{F.name}는 선형이 아닙니다.</strong> 격자선이 휘고, u와 v를 원점에서 멀리 끌수록 두 점이 더 벌어집니다.
              </>
            )}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: columns are where î and ĵ land ─────────────── */

type Kind = 'rot' | 'scale' | 'shear' | 'reflect' | 'project' | 'custom';
const KINDS: { value: Kind; label: string }[] = [
  { value: 'rot', label: '회전' },
  { value: 'scale', label: '늘이기' },
  { value: 'shear', label: '밀기' },
  { value: 'reflect', label: '반사' },
  { value: 'project', label: '사영' },
];

function kindMatrix(k: Kind, p: number): Mat2 {
  const th = (p * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  switch (k) {
    case 'rot':
      return rot(th);
    case 'scale':
      return [p, 0, 0, 1 / Math.max(0.25, p)];
    case 'shear':
      return [1, p, 0, 1];
    case 'reflect':
      // mirror line through the origin at angle θ
      return [Math.cos(2 * th), Math.sin(2 * th), Math.sin(2 * th), -Math.cos(2 * th)];
    case 'project':
      // drop every point straight onto the line at angle θ
      return [c * c, c * s, c * s, s * s];
    default:
      return I2;
  }
}
const PARAM: Record<Exclude<Kind, 'custom'>, { label: string; min: number; max: number; step: number; init: number; fmt: (v: number) => string }> = {
  rot: { label: '회전각 θ', min: -180, max: 180, step: 5, init: 45, fmt: (v) => `${v}°` },
  scale: { label: '가로 배율 k (세로는 1/k)', min: 0.25, max: 3, step: 0.05, init: 2, fmt: (v) => nf(v, 2) },
  shear: { label: '밀기 정도 k', min: -2, max: 2, step: 0.1, init: 1, fmt: (v) => nf(v, 1) },
  reflect: { label: '거울 직선의 각도', min: 0, max: 180, step: 5, init: 0, fmt: (v) => `${v}°` },
  project: { label: '사영할 직선의 각도', min: 0, max: 180, step: 5, init: 30, fmt: (v) => `${v}°` },
};

function ColumnsFigure() {
  const P = usePalette();
  const [C1, C2] = useLaColors(P);
  const [kind, setKind] = useState<Kind>('shear');
  const [param, setParam] = useState(1);
  const [custom, setCustom] = useState<Mat2>([1, 1, 0, 1]);
  const [t, setT] = useState(1);
  const [x, setX] = useState<Vec2>([2, 1]);
  const plotRef = useRef<Plot | null>(null);
  const A = kind === 'custom' ? custom : kindMatrix(kind, param);
  const At: Mat2 = kind === 'rot' ? rot((param * t * Math.PI) / 180) : lerpMat(I2, A, ease(t));
  const ci = col(At, 0);
  const cj = col(At, 1);
  const Ax = ap(At, x);

  const dragCol = (k: string, p: Vec2) => {
    if (k === 'x') {
      setX(p);
      return;
    }
    const base = kind === 'custom' ? custom : A;
    setKind('custom');
    setT(1);
    setCustom(k === 'i' ? [p[0], base[1], p[1], base[3]] : [base[0], p[0], base[2], p[1]]);
  };
  const keys = useKeyHandles(['i', 'j', 'x'], (k, dx, dy) => {
    const cur = k === 'x' ? x : k === 'i' ? col(A, 0) : col(A, 1);
    dragCol(k, [Math.round((cur[0] + dx) * 10) / 10, Math.round((cur[1] + dy) * 10) / 10]);
  });

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 4.2, { numbers: false });
      plotRef.current = plot;
      tGrid(plot, At, alpha(C2, 0.45), 1, 12, alpha(C2, 0.9));
      poly(plot, UNIT_SQUARE, At, alpha(P.hl, 0.2), alpha(P.hl, 0.8), 1.2);
      poly(plot, F_SHAPE.map((p) => scale(p, 2) as Vec2), At, alpha(C1, 0.28), C1, 1.6);
      // x = x·î + y·ĵ, after the transformation
      const a = scale(ci, x[0]);
      plot.line(0, 0, a[0], a[1], alpha(P.neg, 0.55), 4);
      plot.line(a[0], a[1], Ax[0], Ax[1], alpha(P.pos, 0.55), 4);
      plot.dot(Ax[0], Ax[1], 6, P.ink, P.surface, 2);
      label(plot, `A·x = ${vs(Ax)}`, Ax, P.ink, P, 10, -14);
      if (keys.active === 'x' || t < 1) knob(plot, Ax, P.ink, P, keys.active === 'x');
      arrow(plot, [0, 0], ci, P.neg, 3.2, 12);
      arrow(plot, [0, 0], cj, P.pos, 3.2, 12);
      knob(plot, ci, P.neg, P, keys.active === 'i');
      knob(plot, cj, P.pos, P, keys.active === 'j');
      label(plot, 'Aî', ci, P.neg, P, 10, 14);
      label(plot, 'Aĵ', cj, P.pos, P, 10, 14);
    },
    [P, At, x, keys.active],
    { aspect: 1.15, maxHeight: 480 },
  );

  useDrag(canvasRef, {
    hit: (px, py) => hitPoint(plotRef.current, px, py, [['i', ci], ['j', cj], ['x', Ax]]),
    onDrag: (k, px, py) => {
      const p = snapIn(plotRef.current!, px, py);
      if (k === 'x') {
        // the handle sits at Ax; move x so that Ax follows the pointer when A is invertible
        const d = det(At);
        if (Math.abs(d) > 0.05) setX([Math.round(((At[3] * p[0] - At[1] * p[1]) / d) * 10) / 10, Math.round(((-At[2] * p[0] + At[0] * p[1]) / d) * 10) / 10]);
      } else dragCol(String(k), p);
    },
  });

  const pr = kind === 'custom' ? null : PARAM[kind];
  return (
    <Figure
      no={2}
      title="행렬의 열 = î와 ĵ가 도착하는 곳"
      hint="종류와 값을 바꾸거나 Aî, Aĵ, A·x를 끌어 보세요"
      caption={<>파란 화살표 Aî가 행렬의 첫째 열, 주황 화살표 Aĵ가 둘째 열입니다. 노란 칸은 원래 넓이 1인 단위 정사각형, 분홍 F는 방향을 보여 주는 표식입니다. 검은 점 A·x는 파란 막대 x번과 주황 막대 y번을 이어 붙인 곳에 있습니다. 변환 진행을 0%로 내리면 원래 평면으로 돌아갑니다.</>}
    >
      <div className="controls row">
        <Seg label="변환의 종류" value={kind === 'custom' ? ('custom' as Kind) : kind} onChange={(k) => { setKind(k); setT(1); if (k !== 'custom') setParam(PARAM[k as Exclude<Kind, 'custom'>].init); }} options={kind === 'custom' ? [...KINDS, { value: 'custom', label: '직접' }] : KINDS} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} role="img" aria-label={`행렬 A의 열: Aî = ${vs(col(A, 0), 2)}, Aĵ = ${vs(col(A, 1), 2)}. 격자와 글자 F가 변환된 모습. x = ${vs(x)}를 보내면 Ax = ${vs(Ax)}. ${KEY_HINT}`} {...keys.props} />
        </div>
        <div className="controls">
          <div className="la-tex">
            <M>{`A = ${texM2(A, 2, P.neg, P.pos)}`}</M>
          </div>
          {pr && <Slider id="cf-p" label={pr.label} value={param} min={pr.min} max={pr.max} step={pr.step} onChange={(v) => { setParam(v); setT(1); }} format={pr.fmt} />}
          <Slider id="cf-t" label="변환 진행" value={t} min={0} max={1} step={0.01} onChange={setT} format={(v) => `${Math.round(v * 100)}%`} />
          <div className="la-tex">
            <M>{`A${texV2(x, 1)} = ${tn(x[0], 1)}\\textcolor{${P.neg}}{${texV2(col(A, 0), 2)}} ${x[1] < 0 ? '-' : '+'} ${tn(Math.abs(x[1]), 1)}\\textcolor{${P.pos}}{${texV2(col(A, 1), 2)}}`}</M>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="x" value={vs(x)} />
            <Readout label="A·x" value={vs(ap(A, x), 2)} />
          </div>
          <Button small onClick={() => setX([2, 1])}>
            x = (2, 1)로
          </Button>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: composition AB vs BA ─────────────── */

const OPS: { name: string; m: Mat2; tex: string }[] = [
  { name: '90° 회전', m: [0, -1, 1, 0], tex: 'R' },
  { name: '밀기', m: [1, 1, 0, 1], tex: 'S' },
  { name: '가로 2배', m: [2, 0, 0, 1], tex: 'D' },
  { name: 'x축 반사', m: [1, 0, 0, -1], tex: 'F' },
  { name: 'x축 사영', m: [1, 0, 0, 0], tex: 'P' },
  { name: '1.5배 확대', m: [1.5, 0, 0, 1.5], tex: 'K' },
];

function stageMatrix(first: Mat2, second: Mat2, t: number): Mat2 {
  if (t <= 1) return lerpMat(I2, first, ease(t));
  return lerpMat(first, mul(second, first), ease(t - 1));
}

function CompPanel({ first, second, t, title }: { first: Mat2; second: Mat2; t: number; title: string }) {
  const P = usePalette();
  const [C1, C2] = useLaColors(P);
  const M2 = stageMatrix(first, second, t);
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 3.3, { numbers: false });
      tGrid(plot, M2, alpha(C2, 0.45), 1, 10, alpha(C2, 0.9));
      poly(plot, UNIT_SQUARE, M2, alpha(P.hl, 0.18), alpha(P.hl, 0.8), 1.2);
      poly(plot, F_SHAPE.map((p) => scale(p, 2) as Vec2), M2, alpha(C1, 0.3), C1, 1.6);
      arrow(plot, [0, 0], col(M2, 0), P.neg, 2.8, 10);
      arrow(plot, [0, 0], col(M2, 1), P.pos, 2.8, 10);
    },
    [P, M2],
    { aspect: 1, maxHeight: 340 },
  );
  return (
    <div className="la-panel">
      <div className="la-panel-title">{title}</div>
      <div ref={wrapRef} className="canvas-box">
        <canvas ref={canvasRef} role="img" aria-label={`${title}: 현재 행렬 (${nf(M2[0])}, ${nf(M2[1])}; ${nf(M2[2])}, ${nf(M2[3])})로 변환된 격자와 글자 F`} />
      </div>
    </div>
  );
}

function CompositionFigure() {
  const P = usePalette();
  const [ai, setAi] = useState(0);
  const [bi, setBi] = useState(1);
  const [t, setT] = useState(2);
  const [playing, setPlaying] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  const A = OPS[ai];
  const B = OPS[bi];
  const BA = mul(B.m, A.m);
  const AB = mul(A.m, B.m);
  const same = BA.every((v, i) => Math.abs(v - AB[i]) < 1e-9);

  useAnimationFrame(
    (dt) => {
      setT((x) => {
        const n = x + dt * 0.8;
        if (n >= 2) {
          setPlaying(false);
          return 2;
        }
        return n;
      });
    },
    playing && inView,
  );
  const play = () => {
    if (prefersReducedMotion()) {
      setT(2);
      return;
    }
    setT(0);
    setPlaying(true);
  };
  const stage = t < 0.02 ? '원래 평면' : t <= 1 ? '첫 번째 변환 중' : t < 1.98 ? '두 번째 변환 중' : '두 변환을 모두 마침';

  return (
    <Figure
      no={3}
      title="순서를 바꾸면 결과가 달라진다: BA와 AB"
      hint="두 변환을 고르고 재생해 보세요"
      caption={<>왼쪽은 A를 먼저 하고 B를 나중에 하는 합성 BA, 오른쪽은 B를 먼저 하는 AB입니다. 행렬 곱은 오른쪽에 있는 것이 먼저 적용된다는 점에 주의하세요. 진행 슬라이더의 0~1 구간이 첫 번째 변환, 1~2 구간이 두 번째 변환입니다.</>}
    >
      <div className="controls row">
        <Seg label="A" value={ai} onChange={(i) => { setAi(i); setT(2); setPlaying(false); }} options={OPS.map((o, i) => ({ value: i, label: o.name }))} />
        <Seg label="B" value={bi} onChange={(i) => { setBi(i); setT(2); setPlaying(false); }} options={OPS.map((o, i) => ({ value: i, label: o.name }))} />
      </div>
      <div ref={box} className="la-two">
        <CompPanel first={A.m} second={B.m} t={t} title={`A(${A.name}) 다음 B(${B.name}) = BA`} />
        <CompPanel first={B.m} second={A.m} t={t} title={`B(${B.name}) 다음 A(${A.name}) = AB`} />
      </div>
      <div className="controls row">
        <Slider id="cp-t" label={`진행: ${stage}`} value={t} min={0} max={2} step={0.01} onChange={(v) => { setPlaying(false); setT(v); }} format={(v) => nf(v, 2)} />
        <Button primary onClick={play}>
          ▶ 처음부터 재생
        </Button>
      </div>
      <div className="la-two">
        <div className="la-tex">
          <M>{`BA = ${texM2(B.m, 1)}${texM2(A.m, 1)} = ${texM2(BA, 1)}`}</M>
        </div>
        <div className="la-tex">
          <M>{`AB = ${texM2(A.m, 1)}${texM2(B.m, 1)} = ${texM2(AB, 1)}`}</M>
        </div>
      </div>
      <div className="la-status" data-tone={same ? 'good' : 'bad'} aria-live="polite">
        {same ? (
          <>
            <strong>이번에는 AB = BA입니다.</strong> {ai === bi ? '같은 변환을 두 번 하니 순서가 없습니다.' : A.tex === 'K' || B.tex === 'K' ? '모든 방향으로 똑같이 늘이는 확대는 어떤 변환과도 순서를 바꿀 수 있습니다.' : '이 두 변환은 순서를 바꿔도 결과가 같은 드문 짝입니다.'}
          </>
        ) : (
          <>
            <strong>AB ≠ BA.</strong> 두 그림의 마지막 F가 서로 다른 방향을 향합니다. 행렬 곱셈은 순서를 바꾸면 결과가 달라지는 것이 보통입니다.
          </>
        )}
      </div>
      <Legend items={[{ color: P.neg, label: '첫째 열(î의 행방)', shape: 'ln' }, { color: P.pos, label: '둘째 열(ĵ의 행방)', shape: 'ln' }, { color: 'var(--c-math-1)', label: '표식 F', shape: 'sq' }]} />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Matrices() {
  const P = usePalette();
  return (
    <>
      <h2>함수로서의 행렬</h2>
      <p>
        <a href={lessonHref('ai-basics', 'matrices')}>기초 인공지능의 행렬 장</a>에서 행렬이 평면을 늘이고 돌리는 모습을 보았습니다. 이 장에서는 그 그림을 조금 더 정확한 말로 바꿉니다. 왜 하필 "곱하고 더하는" 규칙이 공간을 곧게 변형하는지, 그리고 두 행렬을 곱한다는 것이 무슨 뜻인지가 이 장의 질문입니다.
      </p>
      <p>
        출발점은 함수입니다. 벡터를 받아 벡터를 돌려주는 함수 <M>{'T: \\mathbb R^2 \\to \\mathbb R^2'}</M>를 <T en="transformation">변환</T>이라고 부르겠습니다. 화살표 왼쪽은 입력이 사는 공간, 오른쪽은 출력이 사는 공간입니다. 변환 중에서 다음 두 성질을 지키는 것을 <T en="linear transformation">선형변환</T>이라고 합니다.
      </p>
      <MB note="u, v는 아무 벡터, c는 아무 스칼라입니다. 첫째 줄은 '더한 다음 변환해도, 변환한 다음 더해도 같다', 둘째 줄은 '늘인 다음 변환해도, 변환한 다음 늘여도 같다'는 뜻입니다.">{'\\begin{aligned} T(\\mathbf u + \\mathbf v) &= T(\\mathbf u) + T(\\mathbf v) \\\\ T(c\\,\\mathbf u) &= c\\,T(\\mathbf u) \\end{aligned}'}</MB>
      <p>
        한마디로 선형변환은 <a href={lessonHref('math-linear-algebra', 'vectors')}>1장</a>의 두 연산, 덧셈과 스칼라 곱을 망가뜨리지 않는 함수입니다. 두 번째 식에 c = 0을 넣으면 <M>{'T(\\mathbf 0) = \\mathbf 0'}</M>이 나오므로 원점은 반드시 제자리에 있어야 합니다. 그림 1에서 여섯 가지 변환을 시험해 보세요.
      </p>
      <LinearTestFigure />
      <p>
        평행이동은 의외로 선형이 아닙니다. 모든 점을 (1, 0.6)만큼 옮기면 <M>{'T(\\mathbf u) + T(\\mathbf v)'}</M>에는 이동량이 두 번 더해지지만 <M>{'T(\\mathbf u + \\mathbf v)'}</M>에는 한 번만 더해지기 때문입니다. 휘기와 소용돌이는 격자선 자체가 구부러집니다. 반대로 회전, 늘이기, 밀기는 격자선을 <strong>곧고, 평행하고, 고르게</strong> 남겨 둡니다. 그림으로 보는 선형변환의 정의가 바로 이것입니다.
      </p>

      <h2>열을 보면 변환이 보인다</h2>
      <p>
        선형변환이 좋은 이유는 아주 적은 정보로 전체가 정해진다는 데 있습니다. 평면의 모든 벡터는 <M>{'\\hat\\imath = (1, 0)'}</M>과 <M>{'\\hat\\jmath = (0, 1)'}</M>의 선형결합 <M>{'x\\hat\\imath + y\\hat\\jmath'}</M>이고, 선형변환은 선형결합을 그대로 보존하니까 다음이 성립합니다.
      </p>
      <MB note="î, ĵ(아이 햇, 제이 햇)은 표준 기저 벡터입니다. 두 화살표가 어디로 가는지만 알면 모든 점의 행방을 계산할 수 있습니다.">{'T\\begin{pmatrix} x \\\\ y \\end{pmatrix} = x\\,T(\\hat\\imath) + y\\,T(\\hat\\jmath)'}</MB>
      <p>
        그래서 <M>{'T(\\hat\\imath)'}</M>와 <M>{'T(\\hat\\jmath)'}</M>를 세로로 세워 나란히 붙인 표 하나면 변환 전체를 적을 수 있습니다. 이 표가 <T en="matrix">행렬</T>입니다. 행렬과 벡터의 곱은 "열들의 선형결합"으로 읽을 수도 있고, 익숙한 "행과 벡터의 내적"으로 계산할 수도 있습니다. 두 방법은 늘 같은 답을 냅니다.
      </p>
      <MB note="왼쪽: 열 관점(열을 x배, y배 해서 더하기). 오른쪽: 행 관점(각 행과 (x, y)의 내적).">{`\\begin{pmatrix} \\textcolor{${P.neg}}{a} & \\textcolor{${P.pos}}{b} \\\\ \\textcolor{${P.neg}}{c} & \\textcolor{${P.pos}}{d} \\end{pmatrix}\\begin{pmatrix} x \\\\ y \\end{pmatrix} = x\\begin{pmatrix} \\textcolor{${P.neg}}{a} \\\\ \\textcolor{${P.neg}}{c} \\end{pmatrix} + y\\begin{pmatrix} \\textcolor{${P.pos}}{b} \\\\ \\textcolor{${P.pos}}{d} \\end{pmatrix} = \\begin{pmatrix} ax + by \\\\ cx + dy \\end{pmatrix}`}</MB>
      <ColumnsFigure />
      <p>그림 2의 다섯 가지 변환을 행렬로 적으면 이렇습니다. 열을 하나씩 보며 î와 ĵ가 어디로 가는지 확인해 보세요.</p>
      <ul>
        <li>
          <T en="rotation">회전</T> <M>{'\\begin{pmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{pmatrix}'}</M>: î가 각도 θ의 단위 벡터 <M>{'(\\cos\\theta, \\sin\\theta)'}</M>로, ĵ는 그보다 90° 더 돈 곳으로 갑니다. 길이와 각도가 모두 보존됩니다.
        </li>
        <li>
          <T en="scaling">늘이기</T> <M>{'\\begin{pmatrix} k & 0 \\\\ 0 & 1/k \\end{pmatrix}'}</M>: 가로는 k배, 세로는 1/k배. 대각선 밖이 0인 <T en="diagonal matrix">대각행렬</T>은 축 방향으로만 늘입니다.
        </li>
        <li>
          <T en="shear">밀기</T> <M>{'\\begin{pmatrix} 1 & k \\\\ 0 & 1 \\end{pmatrix}'}</M>: î는 그대로, ĵ만 옆으로 k만큼 밀립니다. 카드 더미를 옆으로 미는 모양이고, 기울임꼴 글씨가 이렇게 만들어집니다.
        </li>
        <li>
          <T en="reflection">반사</T>: 거울 직선을 기준으로 뒤집습니다. F가 거울에 비친 글자가 되는 것으로 알아볼 수 있습니다.
        </li>
        <li>
          <T en="projection">사영</T>: 모든 점을 한 직선 위로 수직으로 떨어뜨립니다. 평면이 직선으로 납작해지므로 원래 점으로 되돌아갈 수 없습니다. 이 "되돌릴 수 없음"은 <a href={lessonHref('math-linear-algebra', 'determinants')}>4장</a>의 주제입니다.
        </li>
      </ul>
      <Callout kind="note">
        웹 브라우저의 CSS <code>transform: matrix(a, b, c, d, e, f)</code>는 바로 이 2×2 행렬 <M>{'\\begin{pmatrix} a & c \\\\ b & d \\end{pmatrix}'}</M>에 이동량 (e, f)를 붙인 것입니다. 이동은 선형이 아니라서 그래픽스에서는 좌표에 1을 하나 덧붙인 3차원 벡터 (x, y, 1)과 3×3 행렬을 씁니다. 그러면 평면의 이동이 3차원의 밀기가 되어 선형변환의 틀 안에 들어옵니다. 이를 <T en="homogeneous coordinates">동차 좌표</T>라고 합니다.
      </Callout>

      <h2>행렬 곱은 변환의 합성</h2>
      <p>
        변환 A를 한 다음 변환 B를 하면, 벡터 x는 먼저 <M>{'A\\mathbf x'}</M>로 갔다가 <M>{'B(A\\mathbf x)'}</M>로 갑니다. 선형변환을 이어 붙인 것도 선형변환이니 이것도 행렬 하나로 적을 수 있어야 합니다. 그 행렬을 <M>{'BA'}</M>라고 쓰고 두 행렬의 <T en="matrix product">곱</T>이라고 부릅니다.
      </p>
      <MB note="BA의 첫째 열은 'î를 A로 보낸 뒤 다시 B로 보낸 곳', 즉 B에 A의 첫째 열을 곱한 것입니다. 둘째 열도 마찬가지입니다.">{'(BA)\\,\\mathbf x = B(A\\mathbf x), \\qquad BA = \\big(\\, B\\mathbf a_1 \\;\\; B\\mathbf a_2 \\,\\big)'}</MB>
      <p>
        여기서 <M>{'\\mathbf a_1, \\mathbf a_2'}</M>는 A의 첫째, 둘째 열입니다. 이 정의를 성분으로 풀면 학교에서 배운 "행 곱하기 열" 규칙이 나옵니다. BA의 i행 j열 성분은 B의 i번째 행과 A의 j번째 열의 내적입니다. 규칙은 외울 대상이 아니라 "합성"이라는 뜻에서 저절로 나오는 결과입니다.
      </p>
      <CompositionFigure />
      <p>
        그림 3의 기본 설정(90° 회전과 밀기)에서 두 F는 전혀 다른 곳을 향합니다. 양말을 신고 신발을 신는 것과 신발을 신고 양말을 신는 것이 다른 것과 같습니다. 그래서 행렬 곱셈은 일반적으로 <M>{'AB \\ne BA'}</M>입니다. 반면 결합법칙 <M>{'C(BA) = (CB)A'}</M>는 언제나 성립합니다. 어떻게 괄호를 묶든 "A, B, C 순서로 한다"는 같은 일이기 때문입니다.
      </p>
      <Callout kind="warn">
        행렬 곱의 순서는 읽는 순서와 반대입니다. <M>{'CBA\\,\\mathbf x'}</M>는 A가 먼저, C가 마지막입니다. 함수 합성 <M>{'f(g(x))'}</M>에서 g가 먼저인 것과 같은 이유입니다. 3D 게임 엔진에서 물체를 "제자리에서 돌린 뒤 옮기기"와 "옮긴 뒤 원점을 중심으로 돌리기"가 다른 결과를 내는 버그는 대부분 이 순서를 헷갈려서 생깁니다.
      </Callout>
      <Code label="행렬 곱과 행렬-벡터 곱">{`
// A는 m×n, B는 n×p. 결과 C = A·B는 m×p
function matmul(A, B) {
  const m = A.length, n = B.length, p = B[0].length;
  const C = Array.from({ length: m }, () => new Array(p).fill(0));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < p; j++)
      for (let k = 0; k < n; k++)
        C[i][j] += A[i][k] * B[k][j]; // i행과 j열의 내적
  return C;
}

const R = [[0, -1], [1, 0]];  // 90° 회전
const S = [[1, 1], [0, 1]];   // 밀기
matmul(S, R); // [[1, -1], [1, 0]]: 회전 먼저, 밀기 나중
matmul(R, S); // [[0, -1], [1, 1]]: 밀기 먼저, 회전 나중`}</Code>
      <p>
        세 겹의 반복문이 보여 주듯 n×n 행렬 두 개를 곱하는 데는 곱셈이 <M>{'n^3'}</M>번 듭니다. 신경망의 한 층은 입력 벡터에 가중치 행렬을 곱하는 일이고, 층을 지날 때마다 이런 곱셈이 일어납니다. GPU가 딥러닝에 쓰이는 이유는 수천 개의 곱셈을 동시에 해서 이 반복문을 한꺼번에 돌릴 수 있기 때문입니다. 행렬 곱과 활성화 함수가 어떻게 번갈아 쌓이는지는 <a href={lessonHref('ai-basics', 'neural-network')}>신경망</a>에서 이어집니다.
      </p>
      <h3>3차원에서도 똑같이</h3>
      <p>
        3×3 행렬은 세 기저 벡터 <M>{'\\hat\\imath, \\hat\\jmath, \\hat k'}</M>의 행방을 세 열에 적은 것이고, m×n 행렬은 n차원 벡터를 받아 m차원 벡터를 돌려주는 선형변환입니다. 예를 들어 2×3 행렬은 3차원 공간을 평면에 비추는 일을 합니다. 화면에 3D 장면을 그리는 것이 바로 이런 변환입니다. 곱 BA가 정의되려면 A의 출력 차원과 B의 입력 차원이 같아야 하는데, 이것이 "앞 행렬의 열 개수 = 뒤 행렬의 행 개수"라는 규칙의 뜻입니다.
      </p>

      <Callout kind="key">
        선형변환은 덧셈과 스칼라 곱을 보존하는 함수이고, 그림으로는 격자선을 곧고 평행하고 고르게 남기며 원점을 고정하는 변환입니다. 행렬의 각 열은 기저 벡터가 도착하는 곳이고, 행렬-벡터 곱은 열들의 선형결합입니다. 행렬 곱 BA는 "A 다음 B"라는 합성이며, 순서를 바꾸면 보통 결과가 달라집니다.
      </Callout>
      <Quiz
        q={<>R은 90° 회전, F는 x축 반사 <M>{'\\begin{pmatrix} 1 & 0 \\\\ 0 & -1 \\end{pmatrix}'}</M>입니다. "먼저 반사하고 그다음 회전"을 나타내는 행렬은?</>}
        options={[<M key="a">{'FR = \\begin{pmatrix} 0 & -1 \\\\ -1 & 0 \\end{pmatrix}'}</M>, <M key="b">{'RF = \\begin{pmatrix} 0 & 1 \\\\ 1 & 0 \\end{pmatrix}'}</M>, <M key="c">{'R + F'}</M>, '순서와 상관없이 같다']}
        answer={1}
        explain={<>먼저 하는 변환이 오른쪽에 옵니다. 반사 F가 먼저이므로 RF입니다. 확인: î = (1, 0)은 반사해도 (1, 0)이고 회전하면 (0, 1)이 되므로 첫째 열이 (0, 1)입니다. FR은 첫째 열이 (0, −1)로 다르니 두 순서는 결과가 다릅니다. 그림 3에서 A = x축 반사, B = 90° 회전으로 놓고 확인해 보세요.</>}
      />
    </>
  );
}
