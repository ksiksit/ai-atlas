import { useEffect, useRef, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useAnimationFrame, useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import { Plot, drawArrow, fmt } from '../../../../lib/plot';
import { usePalette, alpha, lerpColor, type Palette } from '../../../../lib/theme';
import { ThreeView, surfaceMesh, axes3, color3, THREE } from '../../../../lib/three';

interface Fn2 {
  id: string;
  label: string;
  tex: string;
  f: (x: number, y: number) => number;
}

const FNS: Fn2[] = [
  { id: 'bowl', label: '그릇', tex: 'f(x,y) = 0.3\\,(x^2 + y^2)', f: (x, y) => 0.3 * (x * x + y * y) },
  { id: 'saddle', label: '말안장', tex: 'f(x,y) = 0.3\\,(x^2 - y^2)', f: (x, y) => 0.3 * (x * x - y * y) },
  {
    id: 'hills',
    label: '언덕과 골짜기',
    tex: 'f(x,y) = 1.1\\,e^{-\\lVert \\mathbf{p}-\\mathbf{a} \\rVert^2/0.5} - 1.2\\,e^{-\\lVert \\mathbf{p}-\\mathbf{b} \\rVert^2/0.6} + 0.08\\lVert\\mathbf{p}\\rVert^2',
    f: (x, y) => 1.1 * Math.exp(-((x - 0.8) ** 2 + (y - 0.6) ** 2) / 0.5) - 1.2 * Math.exp(-((x + 0.7) ** 2 + (y + 0.5) ** 2) / 0.6) + 0.08 * (x * x + y * y),
  },
];

const H = 1e-4;
const grad = (fn: Fn2, x: number, y: number): [number, number] => [(fn.f(x + H, y) - fn.f(x - H, y)) / (2 * H), (fn.f(x, y + H) - fn.f(x, y - H)) / (2 * H)];

const R = 2; // domain [-R, R]^2
const ZS = 1; // vertical scale in 3D

/* ─────────────── Figure 1: 3D surface with slices and gradient ─────────────── */

function tubeObj(pts: THREE.Vector3[], color: string, radius = 0.018) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, Math.max(16, pts.length * 2), radius, 8, false);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: color3(color), roughness: 0.5, emissive: color3(color), emissiveIntensity: 0.25 }));
}

function lineObj(pts: THREE.Vector3[], color: string, opacity = 1) {
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: color3(color), transparent: opacity < 1, opacity }));
}

function SurfaceFigure() {
  const [fid, setFid] = useState('hills');
  const fn = FNS.find((f) => f.id === fid)!;
  const [x, setX] = useState(0.2);
  const [y, setY] = useState(-0.6);
  const [slices, setSlices] = useState(true);
  const pt = useRef({ x, y, slices });
  pt.current = { x, y, slices };
  const [gx, gy] = grad(fn, x, y);
  const gl = Math.hypot(gx, gy);

  return (
    <Figure
      no={1}
      title="곡면 위의 한 점에서 본 기울기"
      hint="슬라이더로 점을 옮기고, 화면을 끌어 돌려 보세요"
      caption={<>초록 곡선은 y를 고정하고 x만 바꿨을 때의 단면, 빨간 곡선은 x를 고정하고 y만 바꿨을 때의 단면입니다. 각 단면의 기울기가 편미분입니다. 주황 화살표는 그래디언트 방향, 즉 그 점에서 가장 가파르게 올라가는 방향이고, 바닥의 화살표는 그것을 입력 평면에 그린 것입니다.</>}
    >
      <div className="fig-split">
        <ThreeView
          height={430}
          camera={typeof window !== 'undefined' && window.innerWidth < 640 ? [5.8, 4.8, 6.4] : [4.2, 3.4, 4.6]}
          target={[0, 0, 0]}
          deps={[fid]}
          setup={({ scene, palette }) => {
            const { group, zMin } = surfaceMesh(fn.f, { range: R, n: 90, lo: palette.dark ? '#1f3aa6' : '#2443b8', hi: palette.dark ? '#b9c8ff' : '#dfe6ff', zScale: ZS, wireColor: palette.dark ? '#ffffff' : '#0d1530', opacity: 0.88 });
            scene.add(group);
            const floorY = Math.min(-1.3, zMin * ZS - 0.35);
            const grid = new THREE.GridHelper(R * 2, 8, color3(palette.ink3), color3(palette.ink3));
            grid.position.y = floorY;
            (grid.material as THREE.Material).transparent = true;
            (grid.material as THREE.Material).opacity = 0.25;
            scene.add(grid);
            axes3(scene, palette, R + 0.2, ['x', 'f', 'y']);

            const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshStandardMaterial({ color: color3(palette.ink), roughness: 0.4 }));
            scene.add(ball);
            let dyn = new THREE.Group();
            scene.add(dyn);
            let last = '';

            const build = () => {
              const { x: px, y: py, slices: sl } = pt.current;
              const key = `${px}|${py}|${sl}`;
              if (key === last) return;
              last = key;
              scene.remove(dyn);
              dyn.traverse((o) => {
                const m = o as THREE.Mesh;
                m.geometry?.dispose?.();
                const mat = m.material as THREE.Material | undefined;
                mat?.dispose?.();
              });
              dyn = new THREE.Group();
              const W = (a: number, b: number, lift = 0.012) => new THREE.Vector3(a, fn.f(a, b) * ZS + lift, -b);
              const pz = fn.f(px, py) * ZS;
              ball.position.set(px, pz + 0.03, -py);
              const [g1, g2] = grad(fn, px, py);
              if (sl) {
                const xs: THREE.Vector3[] = [];
                const ys: THREE.Vector3[] = [];
                for (let i = 0; i <= 120; i++) {
                  const t = -R + (2 * R * i) / 120;
                  xs.push(W(t, py, 0.02));
                  ys.push(W(px, t, 0.02));
                }
                dyn.add(tubeObj(xs, palette.good));
                dyn.add(tubeObj(ys, palette.bad));
                // tangent segments along each slice
                const L = 0.55;
                const tx = new THREE.Vector3(1, g1 * ZS, 0).normalize().multiplyScalar(L);
                const ty = new THREE.Vector3(0, g2 * ZS, -1).normalize().multiplyScalar(L);
                const P0 = new THREE.Vector3(px, pz + 0.02, -py);
                dyn.add(tubeObj([P0.clone().sub(tx), P0.clone().add(tx)], palette.good, 0.028));
                dyn.add(tubeObj([P0.clone().sub(ty), P0.clone().add(ty)], palette.bad, 0.028));
              }
              const gl2 = Math.hypot(g1, g2);
              if (gl2 > 1e-3) {
                const dir = new THREE.Vector3(g1 / gl2, gl2 * ZS, -g2 / gl2).normalize();
                const len = 0.5 + Math.min(0.6, gl2 * 0.5);
                dyn.add(new THREE.ArrowHelper(dir, new THREE.Vector3(px, pz + 0.04, -py), len, color3(palette.pos).getHex(), 0.2, 0.12));
                // floor projection of the gradient vector
                const fdir = new THREE.Vector3(g1, 0, -g2).normalize();
                const flen = Math.min(1.4, 0.25 + gl2 * 0.9);
                dyn.add(new THREE.ArrowHelper(fdir, new THREE.Vector3(px, floorY + 0.01, -py), flen, color3(palette.pos).getHex(), 0.16, 0.1));
              }
              // drop line from point to floor
              const dl = lineObj([new THREE.Vector3(px, pz, -py), new THREE.Vector3(px, floorY, -py)], palette.ink3, 0.6);
              dyn.add(dl);
              const fdot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), new THREE.MeshBasicMaterial({ color: color3(palette.ink) }));
              fdot.rotation.x = -Math.PI / 2;
              fdot.position.set(px, floorY + 0.005, -py);
              dyn.add(fdot);
              scene.add(dyn);
            };
            build();
            return { update: build };
          }}
        />
        <div className="controls">
          <Seg label="함수" value={fid} onChange={setFid} options={FNS.map((f) => ({ value: f.id, label: f.label }))} />
          <Slider id="gr-x" label="x" value={x} min={-1.9} max={1.9} step={0.01} onChange={setX} format={(v) => fmt(v, 2)} color="var(--good)" />
          <Slider id="gr-y" label="y" value={y} min={-1.9} max={1.9} step={0.01} onChange={setY} format={(v) => fmt(v, 2)} color="var(--bad)" />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="f(x, y)" value={fmt(fn.f(x, y), 3)} />
            <Readout label="|∇f| (가파름)" value={fmt(gl, 3)} color="var(--pos)" />
            <Readout label="∂f/∂x" value={fmt(gx, 3)} color="var(--good)" />
            <Readout label="∂f/∂y" value={fmt(gy, 3)} color="var(--bad)" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <M>{`\\nabla f = (${fmt(gx, 2)},\\ ${fmt(gy, 2)})`.replace(/−/g, '-')}</M>
          </div>
          <Check label="단면과 접선 보기" checked={slices} onChange={setSlices} />
          <Legend
            items={[
              { color: 'var(--good)', label: 'x 방향 단면', shape: 'ln' },
              { color: 'var(--bad)', label: 'y 방향 단면', shape: 'ln' },
              { color: 'var(--pos)', label: '그래디언트', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: contour map + gradient field + descending balls ─────────────── */

/** Marching squares: returns line segments for the iso-level. */
function contourSegments(vals: Float32Array, nx: number, ny: number, level: number): number[] {
  const segs: number[] = [];
  const v = (i: number, j: number) => vals[j * (nx + 1) + i];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = v(i, j);
      const b = v(i + 1, j);
      const c = v(i + 1, j + 1);
      const d = v(i, j + 1);
      const pts: number[] = [];
      const edge = (p: number, q: number, x1: number, y1: number, x2: number, y2: number) => {
        if ((p < level) !== (q < level)) {
          const t = (level - p) / (q - p);
          pts.push(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
        }
      };
      edge(a, b, i, j, i + 1, j);
      edge(b, c, i + 1, j, i + 1, j + 1);
      edge(c, d, i + 1, j + 1, i, j + 1);
      edge(d, a, i, j + 1, i, j);
      if (pts.length === 4) segs.push(...pts);
      else if (pts.length === 8) segs.push(...pts);
    }
  return segs;
}

interface Ball {
  x: number;
  y: number;
  trail: [number, number][];
  done: boolean;
}

function buildBackground(P: Palette, fn: Fn2, plot: Plot, w: number, h: number, dpr: number, showField: boolean): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = Math.round(w * dpr);
  off.height = Math.round(h * dpr);
  const ctx = off.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const p = new Plot(ctx, w, h, P, { xMin: plot.xMin, xMax: plot.xMax, yMin: plot.yMin, yMax: plot.yMax, pad: plot.pad });
  // sample range
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= 40; i++)
    for (let j = 0; j <= 40; j++) {
      const z = fn.f(p.xMin + ((p.xMax - p.xMin) * i) / 40, p.yMin + ((p.yMax - p.yMin) * j) / 40);
      lo = Math.min(lo, z);
      hi = Math.max(hi, z);
    }
  const c0 = P.surface;
  p.heatmap((x, y) => {
    const t = (fn.f(x, y) - lo) / (hi - lo || 1);
    const c = lerpColor(c0, P.accent, 0.08 + 0.62 * t);
    return [c[0], c[1], c[2], 255];
  }, 3);
  // contours
  const nx = 80;
  const ny = Math.round((nx * (p.yMax - p.yMin)) / (p.xMax - p.xMin));
  const vals = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) vals[j * (nx + 1) + i] = fn.f(p.xMin + ((p.xMax - p.xMin) * i) / nx, p.yMin + ((p.yMax - p.yMin) * j) / ny);
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.pad.l, p.pad.t, p.pw, p.ph);
  ctx.clip();
  ctx.strokeStyle = alpha(P.ink, 0.28);
  ctx.lineWidth = 1;
  const L = 14;
  for (let k = 1; k < L; k++) {
    const level = lo + ((hi - lo) * k) / L;
    const segs = contourSegments(vals, nx, ny, level);
    ctx.beginPath();
    for (let s = 0; s < segs.length; s += 4) {
      const X1 = p.X(p.xMin + (segs[s] / nx) * (p.xMax - p.xMin));
      const Y1 = p.Y(p.yMin + (segs[s + 1] / ny) * (p.yMax - p.yMin));
      const X2 = p.X(p.xMin + (segs[s + 2] / nx) * (p.xMax - p.xMin));
      const Y2 = p.Y(p.yMin + (segs[s + 3] / ny) * (p.yMax - p.yMin));
      ctx.moveTo(X1, Y1);
      ctx.lineTo(X2, Y2);
    }
    ctx.stroke();
  }
  ctx.restore();
  // gradient field
  if (showField) {
    const step = 0.4;
    let gmax = 0;
    const field: [number, number, number, number][] = [];
    for (let gx = Math.ceil(p.xMin / step) * step; gx <= p.xMax; gx += step)
      for (let gy = Math.ceil(p.yMin / step) * step; gy <= p.yMax; gy += step) {
        const [a, b] = grad(fn, gx, gy);
        gmax = Math.max(gmax, Math.hypot(a, b));
        field.push([gx, gy, a, b]);
      }
    const pxStep = step * p.sx;
    for (const [fx, fy, a, b] of field) {
      const m = Math.hypot(a, b);
      if (m < 1e-4) continue;
      const len = (0.25 + 0.6 * (m / gmax)) * pxStep * 0.9;
      const sx = p.X(fx);
      const sy = p.Y(fy);
      const ux = a / m;
      const uy = -b / m;
      drawArrow(ctx, sx - (ux * len) / 2, sy - (uy * len) / 2, sx + (ux * len) / 2, sy + (uy * len) / 2, alpha(P.ink2, 0.75), 1.3, 5);
    }
  }
  return off;
}

function ContourFigure() {
  const P = usePalette();
  const [fid, setFid] = useState('hills');
  const fn = FNS.find((f) => f.id === fid)!;
  const [showField, setShowField] = useState(true);
  const [lr, setLr] = useState(0.08);
  const balls = useRef<Ball[]>([]);
  const [, setTick] = useState(0);
  const plotRef = useRef<Plot | null>(null);
  const bgRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inView = useInView(boxRef);
  const running = balls.current.some((b) => !b.done);

  useEffect(() => {
    balls.current = [
      { x: 1.5, y: 1.5, trail: [[1.5, 1.5]], done: false },
      { x: -1.6, y: 1.2, trail: [[-1.6, 1.2]], done: false },
    ];
    setTick((t) => t + 1);
  }, [fid]);

  const accRef = useRef(0);
  useAnimationFrame(
    (dt) => {
      accRef.current += dt;
      const p = plotRef.current;
      if (!p) return;
      while (accRef.current > 1 / 30) {
        accRef.current -= 1 / 30;
        for (const b of balls.current) {
          if (b.done) continue;
          const [a, c] = grad(fn, b.x, b.y);
          b.x -= lr * a * 2.5;
          b.y -= lr * c * 2.5;
          b.trail.push([b.x, b.y]);
          if (Math.hypot(a, c) < 0.004 || b.trail.length > 400 || b.x < p.xMin || b.x > p.xMax || b.y < p.yMin || b.y > p.yMax) b.done = true;
        }
      }
      setTick((t) => t + 1);
    },
    running && inView,
  );

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h, dpr }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -R, xMax: R, yMin: -R, yMax: R, equal: true, pad: { l: 30, r: 8, t: 8, b: 24 } });
      plotRef.current = plot;
      const key = `${fid}|${w}|${h}|${dpr}|${showField}|${P.dark}|${P.accent}`;
      if (!bgRef.current || bgRef.current.key !== key) bgRef.current = { key, canvas: buildBackground(P, fn, plot, w, h, dpr, showField) };
      ctx.drawImage(bgRef.current.canvas, 0, 0, w, h);
      plot.grid({ labels: true, axes: false, xStep: 1, yStep: 1 });
      plot.frame();
      plot.clip();
      for (const b of balls.current) {
        ctx.strokeStyle = P.pos;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        b.trail.forEach(([x, y], i) => (i ? ctx.lineTo(plot.X(x), plot.Y(y)) : ctx.moveTo(plot.X(x), plot.Y(y))));
        ctx.stroke();
        plot.dot(b.trail[0][0], b.trail[0][1], 4, P.surface, P.pos, 2);
        plot.dot(b.x, b.y, 6.5, P.pos, P.surface, 2);
      }
      plot.unclip();
    },
    [P, fn, showField, balls.current.map((b) => b.trail.length).join(',')],
    { aspect: 1.2, maxHeight: 480 },
  );

  useDrag(canvasRef, {
    hit: () => null,
    onDrag: () => {},
    onEmpty: (sx, sy) => {
      const p = plotRef.current;
      if (!p) return;
      const x = p.invX(sx);
      const y = p.invY(sy);
      if (x < p.xMin || x > p.xMax || y < p.yMin || y > p.yMax) return;
      balls.current = [...balls.current.slice(-7), { x, y, trail: [[x, y]], done: false }];
      setTick((t) => t + 1);
    },
  });

  return (
    <Figure
      no={2}
      title="등고선 지도와 그래디언트 장"
      hint="지도 위를 눌러 공을 놓아 보세요"
      caption={<>위에서 내려다본 지도입니다. 진한 색일수록 높고, 가는 선은 같은 높이를 이은 등고선입니다. 작은 화살표는 각 지점의 그래디언트로, 언제나 등고선에 수직이고 오르막을 가리킵니다. 주황색 공은 그 반대 방향(−∇f)으로 한 걸음씩 움직이며 골짜기를 찾아갑니다. 다음 장에서 배울 경사하강법이 바로 이것입니다.</>}
    >
      <div className="fig-split">
        <div ref={boxRef}>
          <div ref={wrapRef} className="canvas-box">
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Seg label="함수" value={fid} onChange={setFid} options={FNS.map((f) => ({ value: f.id, label: f.label }))} />
          <Slider id="ct-lr" label="한 걸음의 크기" value={lr} min={0.01} max={0.3} step={0.01} onChange={setLr} format={(v) => fmt(v, 2)} color="var(--pos)" />
          <Check label="그래디언트 화살표 보기" checked={showField} onChange={setShowField} />
          <div className="btn-row">
            <Button
              small
              onClick={() => {
                balls.current = [];
                setTick((t) => t + 1);
              }}
            >
              공 모두 지우기
            </Button>
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', lineHeight: 1.65 }}>
            말안장에서 공을 가운데 근처에 놓아 보세요. 기울기가 거의 0이라 한참 머무르다가 한쪽으로 미끄러집니다. 이런 곳을 <strong>안장점</strong>이라고 합니다.
          </div>
          <Legend
            items={[
              { color: 'var(--ink-2)', label: '∇f (오르막 방향)', shape: 'ln' },
              { color: 'var(--pos)', label: '−∇f를 따라간 경로', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Gradients() {
  return (
    <>
      <h2>변수가 둘이면 기울기도 둘</h2>
      <p>
        앞 장의 함수는 입력이 하나였습니다. 하지만 실제 모델의 손실은 수많은 가중치에 동시에 의존합니다. 가장 간단한 경우로 입력이 두 개인 함수 <M>{'f(x, y)'}</M>를 생각해 봅시다. 입력 평면의 각 점 위에 높이 <M>{'f(x, y)'}</M>를 세우면 산과 골짜기가 있는 <strong>곡면</strong>이 됩니다.
      </p>
      <p>
        이런 지형 위에 서 있을 때 "기울기가 얼마인가"라는 질문에는 답이 하나가 아닙니다. 동쪽으로 걸을 때와 북쪽으로 걸을 때 경사가 다르기 때문입니다. 그래서 먼저 방향을 하나씩 따로 재 봅니다. y를 고정한 채 x만 바꿀 때의 기울기를 x에 대한 <T en="partial derivative">편미분</T>이라고 하고 <M>{'\\partial f / \\partial x'}</M>로 씁니다.
      </p>
      <SurfaceFigure />
      <MB note="∂(라운드 디)는 '다른 변수는 상수로 두고 미분한다'는 표시입니다.">{'\\frac{\\partial f}{\\partial x} = \\lim_{h\\to 0}\\frac{f(x+h,\\,y) - f(x,\\,y)}{h}, \\qquad \\frac{\\partial f}{\\partial y} = \\lim_{h\\to 0}\\frac{f(x,\\,y+h) - f(x,\\,y)}{h}'}</MB>
      <p>
        계산은 생각보다 쉽습니다. <M>{'f(x, y) = x^2 + 3y^2'}</M>이라면, x로 편미분할 때는 <M>{'3y^2'}</M>을 상수로 보고 <M>{'\\partial f/\\partial x = 2x'}</M>, y로 편미분할 때는 <M>{'x^2'}</M>을 상수로 보고 <M>{'\\partial f/\\partial y = 6y'}</M>입니다.
      </p>

      <h2>그래디언트: 가장 가파른 오르막</h2>
      <p>
        편미분들을 모아 벡터로 만든 것이 <T en="gradient">그래디언트</T>입니다. 기호로는 <M>{'\\nabla f'}</M>(나블라 f)라고 씁니다. 위의 예에서 점 (1, 1)의 그래디언트는 <M>{'(2, 6)'}</M>입니다.
      </p>
      <MB>{'\\nabla f(x, y) = \\left(\\frac{\\partial f}{\\partial x},\\ \\frac{\\partial f}{\\partial y}\\right)'}</MB>
      <p>
        그래디언트는 단순히 숫자 두 개를 묶은 것 이상의 의미가 있습니다. 단위 벡터 <M>{'\\mathbf{u}'}</M> 방향으로 걸을 때의 기울기는 그래디언트와 <M>{'\\mathbf{u}'}</M>의 내적으로 계산됩니다. 벡터 장에서 배운 대로 내적은 두 벡터가 같은 방향일 때 가장 큽니다. 그러므로 그래디언트 방향이 가장 가파르게 올라가는 방향이고, 그 길이 <M>{'\\lVert\\nabla f\\rVert'}</M>가 그때의 경사입니다.
      </p>
      <MB note="θ는 걷는 방향과 그래디언트 사이의 각. cos θ = 1일 때, 즉 그래디언트 방향으로 걸을 때 가장 가파릅니다.">{'D_{\\mathbf{u}} f = \\nabla f \\cdot \\mathbf{u} = \\lVert \\nabla f \\rVert \\cos\\theta'}</MB>
      <Callout kind="intuition">
        안개 낀 산에서 발밑의 경사만 느낄 수 있다고 해 봅시다. 발을 동서로 한 번, 남북으로 한 번 디뎌 보면(편미분 두 개) 어느 쪽이 가장 가파른 오르막인지 알 수 있습니다. 그 방향이 그래디언트이고, 정반대 방향이 가장 빠른 내리막입니다.
      </Callout>

      <h2>지도로 내려다보기</h2>
      <p>
        3D 곡면을 위에서 내려다보면 등산 지도처럼 <T en="contour line">등고선</T>이 그려집니다. 등고선을 따라 걸으면 높이가 변하지 않으므로 그 방향의 기울기는 0입니다. 내적이 0이라는 것은 직각이라는 뜻이니, 그래디언트는 항상 등고선과 수직입니다. 등고선이 촘촘한 곳일수록 경사가 급하고 화살표도 길어집니다.
      </p>
      <ContourFigure />
      <p>
        신경망의 손실 함수는 변수가 두 개가 아니라 수백만, 수십억 개입니다. 그런 공간은 그릴 수 없지만 계산은 똑같습니다. 가중치마다 편미분을 구해 거대한 그래디언트 벡터를 만들고, 그 반대 방향으로 조금 움직입니다. 그 편미분을 효율적으로 구하는 방법이 역전파이고, 반대 방향으로 움직이는 방법이 경사하강법입니다.
      </p>
      <MB note="모든 가중치를 하나의 벡터 θ로 묶어 쓴 경사하강법. 다음 장들에서 계속 나옵니다.">{'\\boldsymbol{\\theta} \\leftarrow \\boldsymbol{\\theta} - \\eta\\, \\nabla_{\\boldsymbol{\\theta}} L(\\boldsymbol{\\theta})'}</MB>
      <Callout kind="key">
        편미분은 한 방향으로만 잰 기울기이고, 편미분을 모은 벡터가 그래디언트입니다. 그래디언트는 가장 가파른 오르막을 가리키며 등고선과 수직입니다. 손실을 줄이려면 그래디언트의 반대 방향으로 움직이면 됩니다.
      </Callout>
      <Quiz
        q={<>f(x, y) = x² + y² 의 점 (1, 2)에서의 그래디언트는?</>}
        options={['(1, 2)', '(2, 4)', '(2, 2)', '(4, 2)']}
        answer={1}
        explain={<>∂f/∂x = 2x = 2, ∂f/∂y = 2y = 4 이므로 ∇f = (2, 4)입니다. 원점에서 바깥쪽을 가리키는데, 그릇 모양 곡면에서 바깥쪽이 오르막이기 때문입니다.</>}
      />
    </>
  );
}
