import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Figure, M, MB, Quiz, Readout, Slider, T } from '../../../../components/ui';
import { useAnimationFrame, useCanvas2D, useDrag, useInView } from '../../../../lib/canvas';
import { Plot, fmt } from '../../../../lib/plot';
import { alpha, lerpColor, usePalette } from '../../../../lib/theme';
import { gauss, rng } from '../../../../lib/math';
import { ThreeView, surfaceMesh, color3, THREE } from '../../../../lib/three';

/* ─────────────── Figure 1: 1D gradient descent and the learning rate ─────────────── */

const L1 = (t: number) => 0.5 * t * t;
const G1 = (t: number) => t;
const THETA0 = -4;

const PRESETS: { label: string; lr: number }[] = [
  { label: '너무 작게', lr: 0.08 },
  { label: '적당히', lr: 0.5 },
  { label: '진동', lr: 1.7 },
  { label: '발산', lr: 2.08 },
];

function regime(lr: number) {
  if (lr < 0.2) return { text: '너무 조심스럽습니다. 한참 걸려요.', color: 'var(--ink-2)' };
  if (lr < 1) return { text: '한쪽에서 차근차근 바닥으로 다가갑니다.', color: 'var(--good)' };
  if (Math.abs(lr - 1) < 0.005) return { text: '한 번에 바닥에 도착합니다. (이 함수에서만 가능한 행운)', color: 'var(--good)' };
  if (lr < 2) return { text: '바닥을 넘나들며 진동하지만 결국 수렴합니다.', color: 'var(--hl)' };
  return { text: '걸음이 너무 커서 점점 바깥으로 튕겨 나갑니다. 발산!', color: 'var(--bad)' };
}

function OneDFigure() {
  const P = usePalette();
  const [lr, setLr] = useState(0.5);
  // start with a few steps already taken so the figure shows the idea at rest
  const [path, setPath] = useState<number[]>(() => [THETA0, -2, -1, -0.5]);
  const [playing, setPlaying] = useState(false);
  const acc = useRef(0);
  const wrapOuter = useRef<HTMLDivElement>(null);
  const inView = useInView(wrapOuter);
  const theta = path[path.length - 1];
  const diverged = Math.abs(theta) > 60;
  const converged = Math.abs(theta) < 1e-3;

  const step = () => setPath((p) => (Math.abs(p[p.length - 1]) > 60 ? p : [...p, p[p.length - 1] - lr * G1(p[p.length - 1])]));
  const reset = () => {
    setPath([THETA0]);
    setPlaying(false);
  };
  useEffect(() => {
    if (playing && (diverged || converged || path.length > 120)) setPlaying(false);
  }, [playing, diverged, converged, path.length]);

  useAnimationFrame((dt) => {
    acc.current += dt;
    if (acc.current > 0.32) {
      acc.current = 0;
      step();
    }
  }, playing && inView);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -6, xMax: 6, yMin: -0.6, yMax: 14, pad: { l: 34, r: 12, t: 12, b: 28 } });
      plot.grid({ xStep: 1, yStep: 2, xLabel: 'θ', yLabel: 'L(θ) = ½θ²' });
      plot.fillUnder(L1, alpha(P.ml, 0.07), -6, 6, 0);
      plot.fn(L1, P.ml, 2.5);
      plot.clip();
      // step arrows
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        const ya = L1(a);
        const yb = L1(b);
        const sx1 = plot.X(a);
        const sy1 = plot.Y(ya);
        const sx2 = plot.X(b);
        const sy2 = plot.Y(yb);
        const t = i / path.length;
        ctx.strokeStyle = alpha(P.pos, 0.35 + 0.5 * t);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        // a little arc above the curve
        const mx = (sx1 + sx2) / 2;
        const my = Math.min(sy1, sy2) - 18 - Math.abs(sx2 - sx1) * 0.08;
        ctx.moveTo(sx1, sy1);
        ctx.quadraticCurveTo(mx, my, sx2, sy2);
        ctx.stroke();
        plot.dot(a, ya, 3.5, alpha(P.pos, 0.6));
      }
      plot.unclip();
      if (!diverged) {
        // tangent at current point
        plot.ctx.save();
        plot.slopeLine(theta, L1(theta), G1(theta), alpha(P.ink2, 0.6), 1.2, [5, 4]);
        plot.ctx.restore();
        plot.dot(theta, L1(theta), 9, P.pos, P.surface, 2.5);
      } else {
        ctx.fillStyle = P.bad;
        ctx.font = `700 15px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.fillText('공이 화면 밖으로 튕겨 나갔습니다', w / 2, plot.pad.t + 24);
      }
    },
    [P, path],
    { aspect: 1.7, maxHeight: 380, minHeight: 240 },
  );

  const hist = useCanvas2D(
    (ctx, { w, h }) => {
      const n = Math.max(10, path.length);
      const vals = path.map((t) => Math.log10(L1(t) + 1e-6));
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: n - 1, yMin: -6, yMax: 3, pad: { l: 38, r: 8, t: 8, b: 18 } });
      plot.grid({ xStep: Math.max(1, Math.ceil(n / 5)), yStep: 3, axes: false, labels: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const [v, t] of [[3, '1000'], [0, '1'], [-3, '0.001'], [-6, '1e-6']] as const) ctx.fillText(t, plot.pad.l - 4, plot.Y(v));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const xs = Math.max(1, Math.ceil(n / 5));
      for (let i = 0; i <= n - 1; i += xs) ctx.fillText(String(i), plot.X(i), plot.pad.t + plot.ph + 3);
      ctx.save();
      ctx.beginPath();
      ctx.rect(plot.pad.l, plot.pad.t, plot.pw, plot.ph);
      ctx.clip();
      ctx.strokeStyle = P.pos;
      ctx.lineWidth = 2;
      ctx.beginPath();
      vals.forEach((v, i) => (i ? ctx.lineTo(plot.X(i), plot.Y(v)) : ctx.moveTo(plot.X(i), plot.Y(v))));
      ctx.stroke();
      ctx.restore();
    },
    [P, path],
    { height: 120 },
  );

  const rg = regime(lr);
  return (
    <Figure
      no={1}
      title="학습률이 걸음의 크기를 정한다"
      hint="학습률을 고르고 재생해 보세요"
      caption={<>공은 θ = −4에서 출발해 매번 기울기에 학습률 η를 곱한 만큼 반대쪽으로 움직입니다. 오른쪽 아래 작은 그래프는 걸음마다의 손실을 로그 눈금으로 그린 것입니다. 실제 신경망 학습에서도 "손실 곡선"을 이렇게 지켜봅니다.</>}
    >
      <div className="fig-split" ref={wrapOuter}>
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="gd1-lr" label="학습률 η" value={lr} min={0.02} max={2.2} step={0.01} onChange={(v) => { setLr(v); reset(); }} format={(v) => fmt(v, 2)} color="var(--c-ml)" />
          <div className="btn-row">
            {PRESETS.map((p) => (
              <Button key={p.label} small onClick={() => { setLr(p.lr); setPath([THETA0]); setPlaying(true); }}>
                {p.label}
              </Button>
            ))}
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: rg.color, fontWeight: 600, minHeight: '3em' }}>{rg.text}</div>
          <div className="btn-row">
            <Button small primary onClick={() => setPlaying((p) => !p)} disabled={diverged || converged}>
              {playing ? '일시정지' : '재생'}
            </Button>
            <Button small onClick={step} disabled={diverged || playing}>
              한 걸음
            </Button>
            <Button small onClick={reset}>
              처음으로
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="걸음 수" value={path.length - 1} />
            <Readout label="θ" value={diverged ? '∞' : fmt(theta, 3)} />
            <Readout label="기울기 L′(θ)" value={diverged ? '∞' : fmt(G1(theta), 3)} />
            <Readout label="손실 L(θ)" value={diverged ? '∞' : fmt(L1(theta), 4)} color="var(--pos)" />
          </div>
          <div ref={hist.wrapRef} className="canvas-box">
            <canvas ref={hist.canvasRef} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: 3D optimizer race ─────────────── */

const R = 2.5;
const ZS = 1.0;
function f2(x: number, y: number) {
  return (
    0.075 * (x * x + y * y) -
    1.15 * Math.exp(-((x - 1.1) ** 2 + (y - 0.9) ** 2) / 0.7) -
    0.75 * Math.exp(-((x + 1.25) ** 2 + (y + 0.75) ** 2) / 0.45) -
    0.55 * Math.exp(-((x + 0.5) ** 2 + (y - 1.55) ** 2) / 0.22) +
    0.12 * Math.sin(2.1 * x) * Math.sin(1.9 * y)
  );
}
function g2(x: number, y: number): [number, number] {
  const h = 1e-4;
  return [(f2(x + h, y) - f2(x - h, y)) / (2 * h), (f2(x, y + h) - f2(x, y - h)) / (2 * h)];
}

type OptId = 'sgd' | 'mom' | 'adam';
const OPTS: { id: OptId; name: string; colorVar: 'pos' | 'neg' | 'dl'; css: string }[] = [
  { id: 'sgd', name: 'SGD', colorVar: 'pos', css: 'var(--pos)' },
  { id: 'mom', name: '모멘텀', colorVar: 'neg', css: 'var(--neg)' },
  { id: 'adam', name: 'Adam', colorVar: 'dl', css: 'var(--c-dl)' },
];
const MAX_STEPS = 400;

interface Runner {
  x: number;
  y: number;
  vx: number;
  vy: number;
  m: [number, number];
  v: [number, number];
  t: number;
  path: [number, number][];
}
const newRunner = (s: [number, number]): Runner => ({ x: s[0], y: s[1], vx: 0, vy: 0, m: [0, 0], v: [0, 0], t: 0, path: [[s[0], s[1]]] });

function stepRunner(r: Runner, kind: OptId, lr: number, noise: number, rand: () => number) {
  let [gx, gy] = g2(r.x, r.y);
  if (noise > 0) {
    gx += gauss(rand) * noise;
    gy += gauss(rand) * noise;
  }
  r.t++;
  if (kind === 'sgd') {
    r.x -= lr * gx;
    r.y -= lr * gy;
  } else if (kind === 'mom') {
    r.vx = 0.9 * r.vx + gx;
    r.vy = 0.9 * r.vy + gy;
    r.x -= lr * r.vx;
    r.y -= lr * r.vy;
  } else {
    const b1 = 0.9;
    const b2 = 0.999;
    r.m = [b1 * r.m[0] + (1 - b1) * gx, b1 * r.m[1] + (1 - b1) * gy];
    r.v = [b2 * r.v[0] + (1 - b2) * gx * gx, b2 * r.v[1] + (1 - b2) * gy * gy];
    const c1 = 1 - Math.pow(b1, r.t);
    const c2 = 1 - Math.pow(b2, r.t);
    r.x -= (lr * (r.m[0] / c1)) / (Math.sqrt(r.v[0] / c2) + 1e-8);
    r.y -= (lr * (r.m[1] / c1)) / (Math.sqrt(r.v[1] / c2) + 1e-8);
  }
  r.x = Math.max(-R, Math.min(R, r.x));
  r.y = Math.max(-R, Math.min(R, r.y));
  r.path.push([r.x, r.y]);
}

function RaceFigure() {
  const P = usePalette();
  const [start, setStart] = useState<[number, number]>([-2, 1.25]);
  const [lr, setLr] = useState(0.05);
  const [noise, setNoise] = useState(false);
  const [enabled, setEnabled] = useState<Record<OptId, boolean>>({ sgd: true, mom: true, adam: true });
  const [playing, setPlaying] = useState(false);
  const [, setTick] = useState(0);
  const sim = useRef<{ runners: Record<OptId, Runner>; rand: () => number }>({ runners: { sgd: newRunner(start), mom: newRunner(start), adam: newRunner(start) }, rand: rng(5) });
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const acc = useRef(0);
  const plotRef = useRef<Plot | null>(null);
  const heat = useRef<{ key: string; img: HTMLCanvasElement } | null>(null);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;

  const globalMin = useMemo(() => {
    let m = Infinity;
    for (let i = 0; i <= 200; i++) for (let j = 0; j <= 200; j++) m = Math.min(m, f2(-R + (2 * R * i) / 200, -R + (2 * R * j) / 200));
    return m;
  }, []);

  const resetSim = (s: [number, number]) => {
    sim.current = { runners: { sgd: newRunner(s), mom: newRunner(s), adam: newRunner(s) }, rand: rng(5) };
    acc.current = 0;
  };
  const runInstant = () => {
    for (let i = 0; i < MAX_STEPS; i++) for (const o of OPTS) stepRunner(sim.current.runners[o.id], o.id, lr, noise ? 0.7 : 0, sim.current.rand);
  };

  // at rest, show the finished race for the current settings
  useEffect(() => {
    resetSim(start);
    runInstant();
    setPlaying(false);
    setTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // changing the learning rate or noise shows the finished race for the new settings right away
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    resetSim(start);
    runInstant();
    setPlaying(false);
    setTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lr, noise]);

  const race = (s: [number, number] = start) => {
    resetSim(s);
    setPlaying(true);
    setTick((t) => t + 1);
  };

  useAnimationFrame((dt) => {
    acc.current += dt;
    const per = 1 / 50;
    let n = 0;
    while (acc.current > per && n < 6) {
      acc.current -= per;
      n++;
      for (const o of OPTS) stepRunner(sim.current.runners[o.id], o.id, lr, noise ? 0.7 : 0, sim.current.rand);
    }
    if (sim.current.runners.sgd.t >= MAX_STEPS) setPlaying(false);
    setTick((t) => t + 1);
  }, playing && inView);

  const runners = sim.current.runners;

  const mini = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 8, r: 8, t: 8, b: 8 };
      const plot = new Plot(ctx, w, h, P, { xMin: -R, xMax: R, yMin: -R, yMax: R, pad });
      plotRef.current = plot;
      const key = `${w}x${h}|${P.dark}`;
      if (!heat.current || heat.current.key !== key) {
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const op = new Plot(off.getContext('2d')!, w, h, P, { xMin: -R, xMax: R, yMin: -R, yMax: R, pad });
        const lo = globalMin;
        const hi = f2(R, R) + 0.2;
        const cLo = P.dark ? '#1f9277' : '#0c8467';
        const cHi = P.dark ? '#1b2437' : '#f3f5f8';
        op.heatmap((x, y) => {
          const t = Math.max(0, Math.min(1, (f2(x, y) - lo) / (hi - lo)));
          const band = Math.floor(t * 16) % 2 === 0 ? 1 : 0.92;
          const c = lerpColor(cLo, cHi, Math.pow(t, 0.75));
          return [c[0] * band, c[1] * band, c[2] * band, 255];
        }, 3);
        heat.current = { key, img: off };
      }
      ctx.drawImage(heat.current.img, 0, 0, w, h);
      for (const o of OPTS) {
        if (!enabled[o.id]) continue;
        const r = runners[o.id];
        ctx.strokeStyle = P[o.colorVar];
        ctx.lineWidth = 2;
        ctx.beginPath();
        r.path.forEach(([x, y], i) => (i ? ctx.lineTo(plot.X(x), plot.Y(y)) : ctx.moveTo(plot.X(x), plot.Y(y))));
        ctx.stroke();
        plot.dot(r.x, r.y, 5, P[o.colorVar], P.surface, 1.5);
      }
      // start marker
      const sx = plot.X(start[0]);
      const sy = plot.Y(start[1]);
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 6, sy - 6);
      ctx.lineTo(sx + 6, sy + 6);
      ctx.moveTo(sx + 6, sy - 6);
      ctx.lineTo(sx - 6, sy + 6);
      ctx.stroke();
    },
    [P, start, enabled, runners.sgd.t, runners.sgd.path, globalMin],
    { aspect: 1, maxHeight: 260, minHeight: 200 },
  );

  useDrag(mini.canvasRef, {
    hit: () => 's',
    onDrag: (_id, x, y) => {
      const p = plotRef.current!;
      const s: [number, number] = [Math.max(-R + 0.05, Math.min(R - 0.05, p.invX(x))), Math.max(-R + 0.05, Math.min(R - 0.05, p.invY(y)))];
      setStart(s);
      resetSim(s);
      setPlaying(false);
      setTick((t) => t + 1);
    },
    onEnd: () => setPlaying(true),
  });

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  return (
    <Figure
      no={2}
      title="세 옵티마이저의 경주"
      hint="작은 지도를 눌러 출발점을 고르세요"
      caption={<>같은 출발점(×)에서 세 방법이 동시에 출발합니다. 지형에는 골짜기가 여러 개 있어서, 어느 골짜기에 도착하는지는 출발점과 방법에 따라 달라집니다. 가장 깊은 골짜기가 전역 최솟값이고 나머지는 지역 최솟값입니다.</>}
    >
      <div ref={outer} className="fig-split">
        <ThreeView
          height={narrow ? 340 : 500}
          camera={narrow ? [1.6, 7.6, 8.6] : [1.2, 5.4, 6.0]}
          target={[0, -0.4, 0]}
          setup={({ scene, palette }) => {
            const { group } = surfaceMesh(f2, { range: R, n: 120, lo: palette.dark ? '#0f6b56' : '#0c8467', hi: palette.dark ? '#4a5770' : '#f1f4f8', zScale: ZS, wireColor: palette.dark ? '#ffffff' : '#0d1530' });
            scene.add(group);
            const items = OPTS.map((o) => {
              const col = color3(palette[o.colorVar]);
              const arr = new Float32Array((MAX_STEPS + 2) * 3);
              const geo = new THREE.BufferGeometry();
              geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
              const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col }));
              scene.add(line);
              const ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, emissive: col, emissiveIntensity: 0.25 }));
              scene.add(ball);
              return { o, line, arr, ball };
            });
            const marker = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 16), new THREE.MeshStandardMaterial({ color: color3(palette.ink) }));
            marker.rotation.x = Math.PI;
            scene.add(marker);
            return {
              update() {
                const rs = sim.current.runners;
                const en = enabledRef.current;
                for (const it of items) {
                  const r = rs[it.o.id];
                  const n = Math.min(r.path.length, MAX_STEPS + 2);
                  for (let i = 0; i < n; i++) {
                    const [x, y] = r.path[i];
                    it.arr[i * 3] = x;
                    it.arr[i * 3 + 1] = f2(x, y) * ZS + 0.025;
                    it.arr[i * 3 + 2] = -y;
                  }
                  it.line.geometry.attributes.position.needsUpdate = true;
                  it.line.geometry.setDrawRange(0, n);
                  it.line.visible = en[it.o.id];
                  it.ball.visible = en[it.o.id];
                  it.ball.position.set(r.x, f2(r.x, r.y) * ZS + 0.09, -r.y);
                }
                const s = rs.sgd.path[0];
                marker.position.set(s[0], f2(s[0], s[1]) * ZS + 0.25, -s[1]);
              },
            };
          }}
        />
        <div className="controls">
          <div ref={mini.wrapRef} className="canvas-box grab">
            <canvas ref={mini.canvasRef} />
          </div>
          <Slider id="gd2-lr" label="학습률 η" value={lr} min={0.005} max={0.3} step={0.005} onChange={setLr} format={(v) => fmt(v, 3)} color="var(--c-ml)" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
            {OPTS.map((o) => (
              <Check key={o.id} label={<span style={{ color: o.css, fontWeight: 600 }}>{o.name}</span>} checked={enabled[o.id]} onChange={(v) => setEnabled((e) => ({ ...e, [o.id]: v }))} />
            ))}
          </div>
          <Check label="미니배치 노이즈 (확률적 기울기)" checked={noise} onChange={setNoise} />
          <div className="btn-row">
            <Button primary small onClick={() => race()}>
              {playing ? '다시 출발' : '출발!'}
            </Button>
            <Button small onClick={() => setPlaying((p) => !p)} disabled={runners.sgd.t >= MAX_STEPS}>
              {playing ? '일시정지' : '계속'}
            </Button>
          </div>
          <div className="tbl-wrap" style={{ margin: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>방법</th>
                  <th style={{ textAlign: 'right' }}>걸음</th>
                  <th style={{ textAlign: 'right' }}>현재 손실</th>
                </tr>
              </thead>
              <tbody>
                {OPTS.map((o) => {
                  const r = runners[o.id];
                  const L = f2(r.x, r.y);
                  const isGlobal = L - globalMin < 0.05;
                  return (
                    <tr key={o.id} style={{ opacity: enabled[o.id] ? 1 : 0.4 }}>
                      <td style={{ color: o.css, fontWeight: 600 }}>{o.name}</td>
                      <td className="num">{r.t}</td>
                      <td className="num">
                        {fmt(L, 3)}
                        {isGlobal ? ' ★' : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>★ 가장 깊은 골짜기(손실 {fmt(globalMin, 3)})에 도착</div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function GradientDescent() {
  return (
    <>
      <h2>눈을 가리고 산을 내려가는 법</h2>
      <p>
        짙은 안개 속 산꼭대기에 서 있다고 상상해 보세요. 지도도 없고 몇 미터 앞도 보이지 않습니다. 그래도 내려갈 방법은 있습니다. 발밑의 경사를 느끼고, 가장 가파르게 내려가는 쪽으로 한 걸음 옮기고, 다시 경사를 느끼는 일을 반복하면 됩니다. 이것이 <T en="gradient descent">경사하강법</T>의 전부입니다.
      </p>
      <p>
        여기서 산은 <a href="#ai-basics/linear-regression">선형회귀</a>에서 본 손실 지형이고, 내 위치는 모델의 파라미터 <M>{'\\theta'}</M>, 발밑의 경사는 손실의 기울기(<a href="#ai-basics/gradients">그래디언트</a>)입니다. 그래디언트는 가장 가파르게 올라가는 방향이므로 그 반대로 움직입니다.
      </p>
      <MB note="η(에타)는 학습률. 한 걸음을 얼마나 크게 디딜지 정하는 값입니다.">{'\\theta \\leftarrow \\theta - \\eta\\, \\nabla_{\\theta} L(\\theta)'}</MB>

      <h2>학습률: 가장 중요한 손잡이</h2>
      <p>
        방향은 그래디언트가 알려 주지만 보폭은 우리가 정해야 합니다. 보폭이 너무 작으면 하루 종일 걸려도 바닥에 닿지 못하고, 너무 크면 골짜기를 건너뛰어 반대편 비탈로 올라가 버립니다. 가장 단순한 그릇 모양 함수 <M>{'L(\\theta) = \\tfrac{1}{2}\\theta^2'}</M>에서 직접 확인해 봅시다.
      </p>
      <OneDFigure />
      <p>
        이 함수의 기울기는 <M>{'\\theta'}</M> 자신이라 한 걸음 뒤의 위치는 <M>{'\\theta(1-\\eta)'}</M>입니다. <M>{'\\eta'}</M>가 1보다 작으면 같은 쪽에서 줄어들고, 1과 2 사이면 부호가 바뀌며 진동하고, 2를 넘으면 매번 더 커져 발산합니다. 실제 신경망에서도 손실이 갑자기 치솟거나 NaN이 나오면 가장 먼저 학습률을 의심합니다.
      </p>
      <Callout kind="warn">
        학습률이 너무 크면 손실이 줄지 않고 오히려 폭발합니다. 반대로 너무 작으면 학습이 끝나지 않은 것처럼 보입니다. 실무에서는 처음에 크게 시작해 점점 줄이는 학습률 스케줄을 흔히 씁니다.
      </Callout>

      <h2>울퉁불퉁한 지형과 똑똑한 옵티마이저</h2>
      <p>
        신경망의 손실 지형은 그릇처럼 매끈하지 않습니다. 골짜기가 여러 개 있고, 평평한 고원과 좁고 긴 협곡도 있습니다. 그래디언트는 바로 발밑의 정보만 주기 때문에 경사하강법은 출발한 곳에서 가까운 골짜기에 빠지기 쉽습니다. 이런 곳을 <T en="local minimum">지역 최솟값</T>이라고 합니다.
      </p>
      <p>그래서 기본 경사하강법(SGD)을 개선한 방법들이 나왔습니다.</p>
      <ul>
        <li>
          <strong>모멘텀</strong>: 공이 굴러가듯 이전 걸음의 속도를 기억합니다. 작은 웅덩이는 관성으로 넘어가고, 같은 방향이 계속되면 점점 빨라집니다.
        </li>
        <li>
          <strong>Adam</strong>: 방향별로 기울기의 크기를 따로 기록해, 기울기가 작은 방향은 보폭을 키우고 큰 방향은 줄입니다. 오늘날 딥러닝에서 가장 널리 쓰이는 기본값입니다.
        </li>
      </ul>
      <MB note="모멘텀은 속도 v를 누적하고(β ≈ 0.9), Adam은 기울기의 평균 m과 제곱 평균 s로 걸음을 정규화합니다.">{'\\begin{aligned} \\text{모멘텀:}\\quad & v \\leftarrow \\beta v + \\nabla L,\\quad \\theta \\leftarrow \\theta - \\eta v \\\\ \\text{Adam:}\\quad & m \\leftarrow \\beta_1 m + (1-\\beta_1)\\nabla L,\\quad s \\leftarrow \\beta_2 s + (1-\\beta_2)(\\nabla L)^2,\\quad \\theta \\leftarrow \\theta - \\eta\\,\\frac{\\hat m}{\\sqrt{\\hat s}+\\epsilon} \\end{aligned}'}</MB>
      <RaceFigure />
      <p>
        출발점을 여러 곳으로 바꿔 보세요. SGD는 가까운 골짜기에 얌전히 멈추고, 모멘텀은 관성 때문에 골짜기를 지나쳤다가 돌아오며 때로 더 깊은 곳을 찾아갑니다. 학습률을 크게 하면 세 방법 모두 거칠게 움직입니다.
      </p>

      <h2>확률적 경사하강법과 미니배치</h2>
      <p>
        손실의 정확한 기울기를 구하려면 데이터 전부를 한 번씩 봐야 합니다. 데이터가 수백만 개라면 한 걸음에 너무 오래 걸리죠. 그래서 실제로는 데이터에서 32개나 256개 정도를 무작위로 뽑은 <T en="mini-batch">미니배치</T>로 기울기를 어림합니다. 이것이 <T en="stochastic gradient descent">확률적 경사하강법</T>입니다. 어림한 기울기에는 잡음이 섞이지만 걸음을 훨씬 많이 걸을 수 있고, 이 잡음이 얕은 골짜기에서 빠져나오는 데 도움이 되기도 합니다. 그림 2에서 "미니배치 노이즈"를 켜 보세요.
      </p>
      <Callout kind="key">
        경사하강법은 "기울기의 반대 방향으로 학습률만큼"을 반복합니다. 학습률은 보폭, 모멘텀은 관성, Adam은 방향별 보폭 조절, 미니배치는 빠르지만 흔들리는 기울기입니다. 수십억 개 파라미터를 가진 언어 모델도 이 단순한 규칙으로 학습합니다.
      </Callout>
      <Quiz
        q="학습 중 손실이 줄어들다가 갑자기 급격히 커지며 발산했습니다. 가장 먼저 해 볼 조치는?"
        options={['학습률을 낮춘다', '학습률을 높인다', '데이터를 줄인다', '손실 함수를 지운다']}
        answer={0}
        explain={<>걸음이 너무 크면 골짜기를 건너뛰어 반대편으로 튕겨 나갑니다. 그림 1에서 η를 2보다 크게 하면 볼 수 있는 현상입니다. 학습률을 낮추면 대개 해결됩니다.</>}
      />
    </>
  );
}
