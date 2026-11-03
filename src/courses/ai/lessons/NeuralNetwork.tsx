import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../components/ui';
import { localPoint, prefersReducedMotion, prepCanvas, useAnimationFrame, useElementSize, useInView } from '../../../lib/canvas';
import { Plot, fmt } from '../../../lib/plot';
import { alpha, parseColor, usePalette } from '../../../lib/theme';
import { clamp, gauss, makeDataset, rng, type DatasetName } from '../../../lib/math';
import { FEATS, MLP, featurize, isoSegments, type Act, type FeatId } from './nn';
import './NeuralNetwork.css';

/* ═══════════════════ shared drawing helpers ═══════════════════ */

type RGB = [number, number, number];
function rgbOf(c: string): RGB {
  const p = parseColor(c);
  return [p[0], p[1], p[2]];
}
/** Diverging colour: t in [-1, 1] → neg … base … pos. Writes into buf at k. */
function divColor(buf: Uint8ClampedArray, k: number, t: number, base: RGB, pos: RGB, neg: RGB, strength = 1) {
  const m = Math.min(1, Math.abs(t)) * strength;
  const tgt = t >= 0 ? pos : neg;
  buf[k] = base[0] + (tgt[0] - base[0]) * m;
  buf[k + 1] = base[1] + (tgt[1] - base[1]) * m;
  buf[k + 2] = base[2] + (tgt[2] - base[2]) * m;
  buf[k + 3] = 255;
}

let scratch: HTMLCanvasElement | null = null;
/** Draw a G×G ImageData scaled into a rectangle with smoothing. */
function blitGrid(ctx: CanvasRenderingContext2D, img: ImageData, x: number, y: number, w: number, h: number, smooth = true) {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== img.width || scratch.height !== img.height) {
    scratch.width = img.width;
    scratch.height = img.height;
  }
  scratch.getContext('2d')!.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = smooth;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(scratch, x, y, w, h);
  ctx.restore();
}

const DOM = 1.3; // input plane is [-DOM, DOM]^2

/* ═══════════════════ Figure 1: the playground ═══════════════════ */

const DATASETS: { value: DatasetName; label: string }[] = [
  { value: 'circle', label: '원' },
  { value: 'xor', label: 'XOR' },
  { value: 'blobs', label: '두 덩어리' },
  { value: 'moons', label: '달 모양' },
  { value: 'spiral', label: '나선' },
];
const LRS = [0.003, 0.01, 0.03, 0.1, 0.3];
const TG = 18; // thumbnail grid
const OG = 60; // output grid

interface Stats {
  epoch: number;
  train: number;
  test: number;
  acc: number;
}

function Playground() {
  const P = usePalette();
  const [dataset, setDataset] = useState<DatasetName>('circle');
  const [noise, setNoise] = useState(0.1);
  const [layers, setLayers] = useState<number[]>([4, 4]);
  const [act, setAct] = useState<Act>('tanh');
  const [lr, setLr] = useState(0.03);
  const [feats, setFeats] = useState<FeatId[]>(['x', 'y']);
  const [running, setRunning] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [seed, setSeed] = useState(1);
  const [stats, setStats] = useState<Stats>({ epoch: 0, train: NaN, test: NaN, acc: NaN });

  const figRef = useRef<HTMLDivElement>(null);
  const inView = useInView(figRef);
  const autoStarted = useRef(false);

  const diagWrap = useRef<HTMLDivElement>(null);
  const diagCanvas = useRef<HTMLCanvasElement>(null);
  const outWrap = useRef<HTMLDivElement>(null);
  const outCanvas = useRef<HTMLCanvasElement>(null);
  const sparkWrap = useRef<HTMLDivElement>(null);
  const sparkCanvas = useRef<HTMLCanvasElement>(null);

  const sizes = useMemo(() => [feats.length, ...layers, 1], [feats, layers]);
  const narrow = useElementSize(figRef, { height: 10 }).w < 520;
  const cell = narrow ? 26 : 34;
  const gap = narrow ? 8 : 10;
  const diagH = 34 + Math.max(...sizes) * (cell + gap) + 6;
  const diagSize = useElementSize(diagWrap, { height: diagH, maxHeight: 2000 });
  const outSize = useElementSize(outWrap, { aspect: 1, maxHeight: 460, minHeight: 240 });
  const sparkSize = useElementSize(sparkWrap, { height: 64, minHeight: 40 });

  const data = useMemo(() => {
    const pts = makeDataset(dataset, 400, noise, 7);
    const train = pts.filter((_, i) => i % 4 < 2);
    const test = pts.filter((_, i) => i % 4 >= 2);
    return { train, test };
  }, [dataset, noise]);
  const XY = useMemo(
    () => ({
      Xtr: data.train.map((p) => featurize(p.x, p.y, feats)),
      Ytr: data.train.map((p) => p.label),
      Xte: data.test.map((p) => featurize(p.x, p.y, feats)),
      Yte: data.test.map((p) => p.label),
    }),
    [data, feats],
  );

  const netRef = useRef<MLP | null>(null);
  const histRef = useRef<{ tr: number[]; te: number[] }>({ tr: [], te: [] });
  const epochRef = useRef(0);
  const rectsRef = useRef<{ l: number; n: number; x: number; y: number; s: number }[]>([]);

  /* ---------- rendering ---------- */
  const render = useCallback(() => {
    const net = netRef.current;
    if (!net) return;
    const base = rgbOf(P.surface);
    const pos = rgbOf(P.pos);
    const neg = rgbOf(P.neg);
    const L = net.nLayers;

    // 1) thumbnails: activations of every neuron over a coarse grid
    const thumbs: Float64Array[][] = net.sizes.map((n) => Array.from({ length: n }, () => new Float64Array(TG * TG)));
    for (let j = 0; j < TG; j++) {
      const y = DOM - ((j + 0.5) / TG) * 2 * DOM;
      for (let i = 0; i < TG; i++) {
        const x = -DOM + ((i + 0.5) / TG) * 2 * DOM;
        net.forward(featurize(x, y, feats));
        for (let l = 0; l <= L; l++) for (let n = 0; n < net.sizes[l]; n++) thumbs[l][n][j * TG + i] = net.a[l][n];
      }
    }
    const norm = (l: number, v: Float64Array): ((x: number) => number) => {
      if (l === L) return (x) => (x - 0.5) * 2;
      if (l === 0) {
        let m = 1e-6;
        for (const x of v) m = Math.max(m, Math.abs(x));
        return (x) => x / m;
      }
      if (act === 'tanh') return (x) => x;
      if (act === 'sigmoid') return (x) => (x - 0.5) * 2;
      let m = 1e-6;
      for (const x of v) m = Math.max(m, x);
      return (x) => x / m;
    };

    // 2) diagram
    const dc = diagCanvas.current;
    if (dc) {
      const ctx = prepCanvas(dc, diagSize);
      if (ctx) {
        const { w, h } = diagSize;
        const padL = narrow ? 44 : 54;
        const padR = 10;
        const top = 30;
        const cols = net.sizes.length;
        const colX = (c: number) => padL + cell / 2 + (c * (w - padL - padR - cell)) / Math.max(1, cols - 1);
        const colY = (c: number, n: number) => {
          const cnt = net.sizes[c];
          const tot = cnt * cell + (cnt - 1) * gap;
          return top + (h - top - 6 - tot) / 2 + n * (cell + gap) + cell / 2;
        };
        // headers
        ctx.fillStyle = P.ink3;
        ctx.font = `600 ${narrow ? 10 : 11}px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let c = 0; c < cols; c++) {
          const t = c === 0 ? '입력' : c === cols - 1 ? '출력' : narrow ? `${c}층` : `은닉 ${c}`;
          ctx.fillText(t, colX(c), 4);
          if (c > 0 && c < cols - 1) {
            ctx.font = `${narrow ? 9 : 10}px ${P.fontMono}`;
            ctx.fillText(`${net.sizes[c]}개`, colX(c), 17);
            ctx.font = `600 ${narrow ? 10 : 11}px ${P.fontBody}`;
          }
        }
        // edges
        let wmax = 1e-6;
        for (const W of net.W) for (const x of W) wmax = Math.max(wmax, Math.abs(x));
        const wscale = Math.max(1.5, wmax);
        for (let l = 0; l < L; l++) {
          const nin = net.sizes[l];
          const x1 = colX(l) + cell / 2;
          const x2 = colX(l + 1) - cell / 2;
          for (let k = 0; k < net.sizes[l + 1]; k++) {
            for (let j = 0; j < nin; j++) {
              const wv = net.W[l][k * nin + j];
              const m = Math.abs(wv) / wscale;
              ctx.strokeStyle = alpha(wv >= 0 ? P.pos : P.neg, 0.18 + 0.7 * Math.min(1, m));
              ctx.lineWidth = 0.6 + 4.2 * Math.min(1, m);
              const y1 = colY(l, j);
              const y2 = colY(l + 1, k);
              const mx = (x1 + x2) / 2;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
              ctx.stroke();
            }
          }
        }
        // neurons
        const rects: typeof rectsRef.current = [];
        const img = new ImageData(TG, TG);
        for (let l = 0; l <= L; l++) {
          for (let n = 0; n < net.sizes[l]; n++) {
            const v = thumbs[l][n];
            const f = norm(l, v);
            for (let q = 0; q < v.length; q++) divColor(img.data, q * 4, f(v[q]), base, pos, neg, 0.95);
            const cx = colX(l);
            const cy = colY(l, n);
            const x0 = cx - cell / 2;
            const y0 = cy - cell / 2;
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x0, y0, cell, cell, 4);
            ctx.clip();
            blitGrid(ctx, img, x0, y0, cell, cell);
            ctx.restore();
            const sel = selected && selected[0] === l && selected[1] === n;
            ctx.lineWidth = sel ? 2.5 : 1;
            ctx.strokeStyle = sel ? P.ink : P.lineStrong;
            ctx.beginPath();
            ctx.roundRect(x0 + 0.5, y0 + 0.5, cell - 1, cell - 1, 4);
            ctx.stroke();
            rects.push({ l, n, x: x0, y: y0, s: cell });
            if (l === 0) {
              ctx.fillStyle = P.ink2;
              ctx.font = `${narrow ? 10 : 11}px ${P.fontMono}`;
              ctx.textAlign = 'right';
              ctx.textBaseline = 'middle';
              ctx.fillText(FEATS.find((F) => F.id === feats[n])!.label, x0 - 6, cy);
            }
          }
        }
        rectsRef.current = rects;
      }
    }

    // 3) output plot
    const oc = outCanvas.current;
    if (oc) {
      const ctx = prepCanvas(oc, outSize);
      if (ctx) {
        const { w, h } = outSize;
        const plot = new Plot(ctx, w, h, P, { xMin: -DOM, xMax: DOM, yMin: -DOM, yMax: DOM, equal: true, pad: { l: 4, r: 4, t: 4, b: 4 } });
        const grid = new Float64Array(OG * OG);
        const sel = selected;
        for (let j = 0; j < OG; j++) {
          const y = DOM - ((j + 0.5) / OG) * 2 * DOM;
          for (let i = 0; i < OG; i++) {
            const x = -DOM + ((i + 0.5) / OG) * 2 * DOM;
            const p = net.forward(featurize(x, y, feats));
            grid[j * OG + i] = sel ? net.a[sel[0]][sel[1]] : p;
          }
        }
        const f = sel ? norm(sel[0], grid) : (x: number) => (x - 0.5) * 2;
        const img = new ImageData(OG, OG);
        for (let q = 0; q < grid.length; q++) divColor(img.data, q * 4, f(grid[q]), base, pos, neg, sel ? 0.8 : 0.55);
        // the square [-DOM,DOM]^2 in screen space
        const sx0 = plot.X(-DOM);
        const sy0 = plot.Y(DOM);
        const side = plot.X(DOM) - sx0;
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, w, h);
        blitGrid(ctx, img, sx0, sy0, side, plot.Y(-DOM) - sy0);
        // grid lines
        ctx.strokeStyle = P.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let v = -1; v <= 1; v += 0.5) {
          ctx.moveTo(plot.X(v), sy0);
          ctx.lineTo(plot.X(v), sy0 + side);
          ctx.moveTo(sx0, plot.Y(v));
          ctx.lineTo(sx0 + side, plot.Y(v));
        }
        ctx.stroke();
        // boundary contour
        let level = 0.5;
        if (sel && sel[0] !== L) level = sel[0] === 0 ? 0 : act === 'tanh' ? 0 : act === 'sigmoid' ? 0.5 : 1e-4;
        const segs = isoSegments(grid, OG, level);
        const cs = side / OG;
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const [a, b, c, d] of segs) {
          ctx.moveTo(sx0 + (a + 0.5) * cs, sy0 + (b + 0.5) * cs);
          ctx.lineTo(sx0 + (c + 0.5) * cs, sy0 + (d + 0.5) * cs);
        }
        ctx.stroke();
        // points
        const r = w < 360 ? 3 : 3.8;
        for (const p of data.train) {
          ctx.beginPath();
          ctx.arc(plot.X(p.x), plot.Y(p.y), r, 0, Math.PI * 2);
          ctx.fillStyle = p.label ? P.pos : P.neg;
          ctx.fill();
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = P.surface;
          ctx.stroke();
        }
        if (showTest) {
          for (const p of data.test) {
            ctx.beginPath();
            ctx.arc(plot.X(p.x), plot.Y(p.y), r, 0, Math.PI * 2);
            ctx.fillStyle = P.surface;
            ctx.fill();
            ctx.lineWidth = 1.8;
            ctx.strokeStyle = p.label ? P.pos : P.neg;
            ctx.stroke();
          }
        }
        // tick labels
        ctx.fillStyle = P.ink3;
        ctx.font = `10px ${P.fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('x₁ →', sx0 + side - 34, sy0 + side - 4);
        ctx.textBaseline = 'top';
        ctx.fillText('↑ x₂', sx0 + 6, sy0 + 6);
      }
    }

    // 4) loss sparkline
    const spc = sparkCanvas.current;
    if (spc) {
      const ctx = prepCanvas(spc, sparkSize);
      if (ctx) {
        const { w, h } = sparkSize;
        const { tr, te } = histRef.current;
        ctx.fillStyle = P.surface2;
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, 6);
        ctx.fill();
        ctx.fillStyle = P.ink3;
        ctx.font = `10px ${P.fontBody}`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText('손실 곡선', 8, 5);
        if (tr.length > 1) {
          const ymax = Math.max(0.1, Math.max(...tr.slice(0, 20), ...te.slice(0, 20)) * 1.05);
          const n = tr.length;
          const X = (i: number) => 6 + ((w - 12) * i) / Math.max(1, n - 1);
          const Y = (v: number) => h - 6 - (h - 22) * clamp(v / ymax, 0, 1);
          const line = (arr: number[], col: string, dash: number[]) => {
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.8;
            ctx.setLineDash(dash);
            ctx.beginPath();
            const step = Math.max(1, Math.floor(n / 300));
            for (let i = 0; i < n; i += step) {
              if (i === 0) ctx.moveTo(X(i), Y(arr[i]));
              else ctx.lineTo(X(i), Y(arr[i]));
            }
            ctx.lineTo(X(n - 1), Y(arr[n - 1]));
            ctx.stroke();
            ctx.setLineDash([]);
          };
          line(te, P.ink3, [4, 3]);
          line(tr, P.accent, []);
        }
      }
    }
  }, [P, feats, act, selected, showTest, data, diagSize, outSize, sparkSize, narrow, cell, gap]);

  const renderRef = useRef(render);
  renderRef.current = render;

  const pushStats = useCallback(() => {
    const net = netRef.current;
    if (!net) return;
    const tr = net.evaluate(XY.Xtr, XY.Ytr);
    const te = net.evaluate(XY.Xte, XY.Yte);
    histRef.current.tr.push(tr.loss);
    histRef.current.te.push(te.loss);
    return { epoch: epochRef.current, train: tr.loss, test: te.loss, acc: te.acc };
  }, [XY]);

  // (re)build the network when architecture / data change
  useEffect(() => {
    netRef.current = new MLP(sizes, act, seed * 97 + 13);
    epochRef.current = 0;
    histRef.current = { tr: [], te: [] };
    const s = pushStats();
    if (s) setStats(s);
    setSelected((sel) => (sel && sel[0] < sizes.length && sel[1] < sizes[sel[0]] ? sel : null));
    renderRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizes.join(','), act, seed, XY]);

  // redraw on visual changes
  useEffect(() => {
    render();
  }, [render]);

  // auto-start once when the figure is actually scrolled into view
  useEffect(() => {
    const el = figRef.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0]?.isIntersecting && !autoStarted.current) {
          autoStarted.current = true;
          setRunning(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const frame = useRef(0);
  const trainOnce = useCallback(
    (epochs: number) => {
      const net = netRef.current;
      if (!net) return;
      let s: Stats | undefined;
      for (let e = 0; e < epochs; e++) {
        net.trainEpoch(XY.Xtr, XY.Ytr, lr, 10);
        epochRef.current++;
        s = pushStats();
      }
      return s;
    },
    [XY, lr, pushStats],
  );

  useAnimationFrame(() => {
    if (epochRef.current >= 5000) {
      setRunning(false);
      return;
    }
    const s = trainOnce(1);
    renderRef.current();
    if (s && frame.current++ % 4 === 0) setStats(s);
  }, running && inView);

  const step = () => {
    setRunning(false);
    const s = trainOnce(1);
    if (s) setStats(s);
    renderRef.current();
  };
  const reset = () => {
    setRunning(false);
    setSeed((x) => x + 1);
  };

  const onDiagClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = localPoint(e, e.currentTarget);
    const hit = rectsRef.current.find((r) => p.x >= r.x - 3 && p.x <= r.x + r.s + 3 && p.y >= r.y - 3 && p.y <= r.y + r.s + 3);
    if (!hit) return;
    if (hit.l === sizes.length - 1) setSelected(null);
    else setSelected((s) => (s && s[0] === hit.l && s[1] === hit.n ? null : [hit.l, hit.n]));
  };

  const setLayerCount = (n: number) => setLayers((ls) => (n > ls.length ? [...ls, ls[ls.length - 1] ?? 4] : ls.slice(0, n)));
  const setNeurons = (i: number, d: number) => setLayers((ls) => ls.map((v, j) => (j === i ? clamp(v + d, 1, 8) : v)));
  const toggleFeat = (id: FeatId, on: boolean) =>
    setFeats((fs) => {
      const next = on ? FEATS.map((f) => f.id).filter((x) => x === id || fs.includes(x)) : fs.filter((x) => x !== id);
      return next.length ? next : fs;
    });

  const selLabel = selected ? (selected[0] === 0 ? `입력 ${FEATS.find((f) => f.id === feats[selected[1]])?.label}` : `은닉 ${selected[0]}층 · ${selected[1] + 1}번 뉴런`) : null;
  const done = epochRef.current >= 5000;

  return (
    <Figure
      no={1}
      title="신경망 놀이터"
      hint="뉴런을 클릭하면 그 뉴런이 보는 그림이 오른쪽에 크게 나옵니다"
      caption={
        <>
          왼쪽은 신경망, 오른쪽은 신경망의 최종 판단입니다. 작은 네모 하나하나는 뉴런이고, 네모 안의 그림은 입력 평면의 각 위치에서 그 뉴런이 내는 값입니다(주황 = 양수·1에 가까움, 파랑 = 음수·0에 가까움). 선의 굵기는 가중치의 크기, 색은 부호입니다. 검은 곡선은 확률이 0.5가 되는 결정 경계입니다. 최적화에는 Adam을 썼고, 400개의 점을 반씩 나눠 훈련과 테스트에 씁니다.
        </>
      }
    >
      <div ref={figRef} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="nnp-top">
          <div className="btn-row">
            <Button primary onClick={() => setRunning((r) => !r)} disabled={done}>
              {running ? '일시정지' : '학습 시작'}
            </Button>
            <Button onClick={step}>한 에폭</Button>
            <Button onClick={reset} title="가중치를 새로 무작위로 정합니다">
              초기화
            </Button>
          </div>
          <div className="readouts">
            <Readout label="에폭" value={stats.epoch.toLocaleString()} />
            <Readout label="훈련 손실" value={fmt(stats.train, 3)} color="var(--accent)" />
            <Readout label="테스트 손실" value={fmt(stats.test, 3)} />
            <Readout label="테스트 정확도" value={isFinite(stats.acc) ? fmt(stats.acc * 100, 1) + '%' : '—'} color={stats.acc > 0.95 ? 'var(--good)' : undefined} />
          </div>
        </div>

        <div className="nnp-main">
          <div className="nnp-col">
            <div className="nnp-layerbar">
              <span>은닉층</span>
              <button type="button" className="nnp-pm" aria-label="은닉층 빼기" onClick={() => setLayerCount(layers.length - 1)} disabled={layers.length === 0}>
                −
              </button>
              <strong className="mono">{layers.length}</strong>
              <button type="button" className="nnp-pm" aria-label="은닉층 더하기" onClick={() => setLayerCount(layers.length + 1)} disabled={layers.length >= 4}>
                +
              </button>
              {layers.map((n, i) => (
                <span className="nnp-layer" key={i}>
                  {i + 1}층
                  <button type="button" className="nnp-pm" aria-label={`${i + 1}층 뉴런 빼기`} onClick={() => setNeurons(i, -1)} disabled={n <= 1}>
                    −
                  </button>
                  <strong>{n}</strong>
                  <button type="button" className="nnp-pm" aria-label={`${i + 1}층 뉴런 더하기`} onClick={() => setNeurons(i, 1)} disabled={n >= 8}>
                    +
                  </button>
                </span>
              ))}
            </div>
            <div ref={diagWrap} className="canvas-box nnp-diagram" style={{ background: 'transparent' }}>
              <canvas ref={diagCanvas} onClick={onDiagClick} />
            </div>
            <Legend
              items={[
                { color: 'var(--pos)', label: '양의 가중치 · 출력 1 쪽', shape: 'ln' },
                { color: 'var(--neg)', label: '음의 가중치 · 출력 0 쪽', shape: 'ln' },
              ]}
            />
          </div>
          <div className="nnp-col">
            <div ref={outWrap} className="canvas-box">
              <canvas ref={outCanvas} />
              <span className="canvas-badge">{selLabel ? `${selLabel}의 출력` : '신경망의 최종 출력'}</span>
            </div>
            {selected && (
              <div className="nnp-note">
                {selected[0] === 1 ? '첫 번째 은닉층 뉴런은 입력 평면에 직선 하나를 긋는 것이 전부입니다. 검은 선이 그 직선입니다.' : selected[0] === 0 ? '입력 특성 그 자체입니다. 신경망은 이 값들에서 출발합니다.' : '뒤쪽 층의 뉴런은 앞 층이 그은 선들을 섞어 곡선을 만듭니다.'}{' '}
                <button type="button" className="btn small" onClick={() => setSelected(null)}>
                  최종 출력 보기
                </button>
              </div>
            )}
            <div ref={sparkWrap} className="nnp-spark">
              <canvas ref={sparkCanvas} style={{ display: 'block', width: '100%' }} />
            </div>
            <Legend
              items={[
                { color: 'var(--accent)', label: '훈련 손실', shape: 'ln' },
                { color: 'var(--ink-3)', label: '테스트 손실 (점선)', shape: 'ln' },
              ]}
            />
          </div>
        </div>

        <div className="nnp-settings">
          <Seg label="데이터" value={dataset} options={DATASETS} onChange={setDataset} />
          <Seg
            label="활성화 함수"
            value={act}
            options={[
              { value: 'relu', label: 'ReLU' },
              { value: 'tanh', label: 'tanh' },
              { value: 'sigmoid', label: '시그모이드' },
            ]}
            onChange={setAct}
          />
          <Seg label="학습률" value={lr} options={LRS.map((v) => ({ value: v, label: String(v) }))} onChange={setLr} />
          <Slider id="nn-noise" label="노이즈" value={noise} min={0} max={0.4} step={0.05} onChange={setNoise} format={(v) => fmt(v, 2)} />
          <div className="ctl">
            <span className="ctl-label">
              <span>입력 특성</span>
            </span>
            <div className="nnp-feats">
              {FEATS.map((f) => (
                <Check key={f.id} label={<span className="mono">{f.label}</span>} checked={feats.includes(f.id)} onChange={(v) => toggleFeat(f.id, v)} />
              ))}
            </div>
          </div>
          <div className="ctl" style={{ justifyContent: 'flex-end' }}>
            <Check label="테스트 데이터도 표시 (속이 빈 점)" checked={showTest} onChange={setShowTest} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ═══════════════════ Figure 2: how a hidden layer bends space ═══════════════════ */

/** XOR-style data: four clusters at the corners; opposite corners share a label. */
function xorCorners() {
  const r = rng(11);
  const pts: { x: number; y: number; label: number }[] = [];
  for (let i = 0; i < 200; i++) {
    const sx = i % 2 ? 1 : -1;
    const sy = i % 4 < 2 ? 1 : -1;
    pts.push({ x: sx * 0.7 + gauss(r) * 0.15, y: sy * 0.7 + gauss(r) * 0.15, label: sx * sy > 0 ? 1 : 0 });
  }
  return pts;
}

/** A 2-2-1 tanh network with hand-picked weights that solves XOR cleanly. */
function foldModel() {
  const net = new MLP([2, 2, 1], 'tanh', 1);
  net.W[0].set([1.5, 1.2, 1.2, 1.5]);
  net.b[0].set([0.95, -0.95]);
  net.W[1].set([-6, 6]);
  net.b[1].set([4.5]);
  const pts = xorCorners();
  const { acc } = net.evaluate(
    pts.map((p) => new Float64Array([p.x, p.y])),
    pts.map((p) => p.label),
  );
  return { pts, net, acc };
}

function FoldFigure() {
  const P = usePalette();
  const [s, setS] = useState(0);
  const [playing, setPlaying] = useState(false);
  const model = useMemo(foldModel, []);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(wrapRef, { aspect: 1.35, maxHeight: 480, minHeight: 260 });
  const inView = useInView(wrapRef);

  // boundary contour in input space (computed once per model)
  const contour = useMemo(() => {
    const G = 70;
    const R = 1.35;
    const g = new Float64Array(G * G);
    for (let j = 0; j < G; j++)
      for (let i = 0; i < G; i++) {
        const x = -R + ((i + 0.5) / G) * 2 * R;
        const y = R - ((j + 0.5) / G) * 2 * R;
        g[j * G + i] = model.net.forward([x, y]);
      }
    return isoSegments(g, G, 0.5).map(([a, b, c, d]) => [-R + ((a + 0.5) / G) * 2 * R, R - ((b + 0.5) / G) * 2 * R, -R + ((c + 0.5) / G) * 2 * R, R - ((d + 0.5) / G) * 2 * R]);
  }, [model]);

  useAnimationFrame(
    (dt) => {
      setS((v) => {
        const n = v + dt * 0.55;
        if (n >= 2) {
          setPlaying(false);
          return 2;
        }
        return n;
      });
    },
    playing && inView,
  );

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = prepCanvas(c, size);
    if (!ctx) return;
    const { w, h } = size;
    const W = model.net.W[0];
    const B = model.net.b[0];
    const map = (x: number, y: number): [number, number] => {
      const l0 = W[0] * x + W[1] * y + B[0];
      const l1 = W[2] * x + W[3] * y + B[1];
      if (s <= 1) return [(1 - s) * x + s * l0, (1 - s) * y + s * l1];
      const u = s - 1;
      return [(1 - u) * l0 + u * Math.tanh(l0), (1 - u) * l1 + u * Math.tanh(l1)];
    };
    // grid lines
    const R = 1.3;
    const lines: [number, number][][] = [];
    const K = 12;
    for (let a = 0; a <= K; a++) {
      const v = -R + (2 * R * a) / K;
      const l1: [number, number][] = [];
      const l2: [number, number][] = [];
      for (let t = 0; t <= 48; t++) {
        const u = -R + (2 * R * t) / 48;
        l1.push(map(v, u));
        l2.push(map(u, v));
      }
      lines.push(l1, l2);
    }
    const pts = model.pts.map((p) => ({ q: map(p.x, p.y), label: p.label }));
    // auto-fit view
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const ln of lines)
      for (const [x, y] of ln) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    const mx = (x1 - x0) * 0.06 + 0.05;
    const my = (y1 - y0) * 0.06 + 0.05;
    const plot = new Plot(ctx, w, h, P, { xMin: x0 - mx, xMax: x1 + mx, yMin: y0 - my, yMax: y1 + my, equal: true, pad: { l: 6, r: 6, t: 6, b: 6 } });
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);

    // output half-planes in final space (fade in near the end)
    const fade = clamp((s - 1.5) / 0.5, 0, 1);
    const W2 = model.net.W[1];
    const b2 = model.net.b[1][0];
    if (fade > 0) {
      plot.heatmap((x, y) => {
        const z = W2[0] * x + W2[1] * y + b2;
        const c = parseColor(z > 0 ? P.pos : P.neg);
        return [c[0], c[1], c[2], Math.round(40 * fade)];
      }, 6);
    }
    ctx.strokeStyle = alpha(P.ink3, 0.35);
    ctx.lineWidth = 1;
    for (const ln of lines) {
      ctx.beginPath();
      ln.forEach(([x, y], i) => (i ? ctx.lineTo(plot.X(x), plot.Y(y)) : ctx.moveTo(plot.X(x), plot.Y(y))));
      ctx.stroke();
    }
    // the output neuron's straight line in hidden space: W2·h + b2 = 0
    if (fade > 0 && Math.abs(W2[1]) > 1e-9) {
      plot.slopeLine(0, -b2 / W2[1], -W2[0] / W2[1], alpha(P.ink, 0.55 * fade), 1.5, [6, 5]);
    }
    // decision boundary mapped through the same transformation
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [a, b, c, d] of contour) {
      const p1 = map(a, b);
      const p2 = map(c, d);
      ctx.moveTo(plot.X(p1[0]), plot.Y(p1[1]));
      ctx.lineTo(plot.X(p2[0]), plot.Y(p2[1]));
    }
    ctx.stroke();
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(plot.X(p.q[0]), plot.Y(p.q[1]), 3.6, 0, Math.PI * 2);
      ctx.fillStyle = p.label ? P.pos : P.neg;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = P.surface;
      ctx.stroke();
    }
  }, [P, s, size, model, contour]);

  const stage = s < 0.5 ? '입력 공간 (x₁, x₂)' : s < 1.5 ? '선형 변환 Wx + b 적용 중' : s < 1.99 ? 'tanh로 접는 중' : '은닉층 공간 (h₁, h₂)';
  return (
    <Figure
      no={2}
      title="은닉층은 공간을 휘어 접는다"
      hint="슬라이더를 끝까지 밀어 보세요"
      caption={
        <>
          XOR 데이터(같은 대각선 모서리끼리 같은 색)를 은닉 뉴런 2개짜리 신경망으로 풉니다. 변환이 잘 보이도록 가중치는 학습 결과와 같은 구조의 깔끔한 값으로 직접 정해 두었습니다. 슬라이더를 움직이면 입력 평면 전체(회색 격자)가 은닉층의 계산을 따라 변형됩니다. 처음에는 구불구불하던 검은 결정 경계가 은닉층 공간에 도착하면 곧은 직선이 됩니다. 마지막 출력 뉴런은 이 직선 하나만 그으면 되는 것입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
          <span className="canvas-badge">{stage}</span>
        </div>
        <div className="controls">
          <Slider id="fold-s" label="변환 단계" value={s} min={0} max={2} step={0.01} onChange={(v) => { setPlaying(false); setS(v); }} format={(v) => (v < 1 ? `선형 ${Math.round(v * 100)}%` : `tanh ${Math.round((v - 1) * 100)}%`)} />
          <div className="btn-row">
            <Button
              primary
              onClick={() => {
                if (s >= 2) setS(0);
                setPlaying(true);
              }}
            >
              변환 재생
            </Button>
            <Button onClick={() => { setPlaying(false); setS(0); }}>처음으로</Button>
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', lineHeight: 1.7 }}>
            <strong>0 → 1</strong>: 행렬 <M>{'W'}</M>를 곱하고 <M>{'b'}</M>를 더합니다. 공간이 늘어나고 기울어질 뿐 격자는 여전히 곧습니다.
            <br />
            <strong>1 → 2</strong>: tanh가 큰 값을 ±1 근처로 눌러 담습니다. 이때 격자가 휘고 접힙니다.
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>
            이 신경망의 가중치
            <MB>{'W=\\begin{bmatrix}1.5 & 1.2\\\\ 1.2 & 1.5\\end{bmatrix},\\; \\mathbf{b}=\\begin{bmatrix}0.95\\\\ -0.95\\end{bmatrix}'}</MB>
            <MB>{'\\hat y = \\text{sigmoid}\\big(6(h_2 - h_1 + 0.75)\\big)'}</MB>
          </div>
          <Readout label="정확도" value={fmt(model.acc * 100, 1) + '%'} />
        </div>
      </div>
    </Figure>
  );
}

/* ═══════════════════ Lesson ═══════════════════ */

export default function NeuralNetwork() {
  return (
    <>
      <h2>뉴런 하나로는 직선밖에 못 긋는다</h2>
      <p>
        앞 장에서 본 인공 뉴런은 입력의 가중합 <M>{'\\mathbf{w}\\cdot\\mathbf{x}+b'}</M>를 계산해서 활성화 함수에 넣습니다. 가중합이 0이 되는 곳은 평면 위의 직선이므로, 뉴런 하나가 할 수 있는 일은 평면을 직선 하나로 둘로 가르는 것이 전부입니다. 그런데 현실의 데이터는 원 안쪽과 바깥쪽처럼 직선으로는 가를 수 없는 모양이 대부분입니다.
      </p>
      <p>
        해결책은 뉴런을 여러 개 나란히 놓아 <T en="layer">층</T>을 만들고, 그 층을 다시 쌓는 것입니다. 입력과 출력 사이에 끼어 있는 층을 <T en="hidden layer">은닉층</T>이라고 부릅니다. 이렇게 만든 것이 <T en="multilayer perceptron, MLP">다층 퍼셉트론</T>, 가장 기본적인 신경망입니다.
      </p>
      <MB note="한 층의 계산. W는 가중치 행렬, b는 편향 벡터, σ는 활성화 함수입니다.">{'\\mathbf{h} = \\sigma(W\\mathbf{x} + \\mathbf{b})'}</MB>
      <p>층을 쌓으면 이 계산을 여러 번 이어 붙인 함수가 됩니다. 신경망 전체는 결국 커다란 합성 함수입니다.</p>
      <MB note="2개의 은닉층을 가진 신경망. 마지막 시그모이드가 확률을 내놓습니다.">{'\\hat{y} = \\text{sigmoid}\\big(W_3\\,\\sigma(W_2\\,\\sigma(W_1\\mathbf{x} + \\mathbf{b}_1) + \\mathbf{b}_2) + \\mathbf{b}_3\\big)'}</MB>

      <h2>직접 학습시켜 보기</h2>
      <p>
        아래 놀이터의 신경망은 여러분의 브라우저 안에서 실제로 학습합니다. 주황 점은 정답이 1, 파란 점은 정답이 0인 데이터입니다. 학습이 진행되면서 오른쪽 배경색이 점들의 색에 맞춰 자리를 잡고, 왼쪽의 작은 그림들도 바뀌어 가는 것을 볼 수 있습니다. 한 <T en="epoch">에폭</T>은 훈련 데이터 전체를 한 번 훑으며 가중치를 고친 것을 말합니다.
      </p>
      <Playground />
      <Callout kind="intuition">
        뉴런을 하나씩 클릭해 보세요. 첫 번째 은닉층의 뉴런은 모두 직선 하나씩만 긋고 있습니다. 두 번째 층의 뉴런은 그 직선들을 더하고 빼서 꺾인 선이나 둥근 영역을 만듭니다. 층이 깊어질수록 앞에서 만든 모양을 재료로 더 복잡한 모양을 조립하는 셈입니다.
      </Callout>

      <h2>도전 과제</h2>
      <p>놀이터에서 직접 확인해 보세요. 각 과제 아래의 설명은 예상되는 결과입니다.</p>
      <ol className="challenge-list">
        <li>
          <span className="ch-no">01</span>
          <span>
            <strong>원 데이터에서 은닉층을 0개로 줄여 보세요.</strong>
            <span className="ch-ans">출력 뉴런 하나만 남으면 결정 경계는 직선이 되고, 정확도는 50~60% 근처에서 멈춥니다. 원은 직선으로 가를 수 없기 때문입니다.</span>
          </span>
        </li>
        <li>
          <span className="ch-no">02</span>
          <span>
            <strong>은닉층 0개 그대로, 입력 특성에서 x₁²와 x₂²를 켜 보세요.</strong>
            <span className="ch-ans">이번에는 금방 풀립니다. x₁² + x₂²는 원점에서의 거리 제곱이라 원 문제를 직선 문제로 바꿔 줍니다. 사람이 좋은 특성을 골라 주면 모델이 단순해도 됩니다. 신경망의 은닉층은 이런 특성을 스스로 찾아내는 장치입니다.</span>
          </span>
        </li>
        <li>
          <span className="ch-no">03</span>
          <span>
            <strong>원 데이터를 풀 수 있는 가장 작은 신경망을 찾아보세요.</strong>
            <span className="ch-ans">은닉층 1개에 뉴런 3개면 직선 세 개로 삼각형을 만들어 원을 감쌀 수 있습니다. 뉴런 2개로는 띠 모양까지만 만들 수 있어 어렵습니다.</span>
          </span>
        </li>
        <li>
          <span className="ch-no">04</span>
          <span>
            <strong>나선 데이터를 풀어 보세요.</strong>
            <span className="ch-ans">가장 어려운 데이터입니다. 은닉층 3~4개에 뉴런 6~8개, ReLU 또는 tanh, 학습률 0.01~0.03 정도면 수백 에폭 안에 나선 모양의 경계가 나타납니다. 깊이가 왜 필요한지 몸으로 느낄 수 있습니다.</span>
          </span>
        </li>
        <li>
          <span className="ch-no">05</span>
          <span>
            <strong>학습률을 0.3으로 올리고 다시 학습해 보세요.</strong>
            <span className="ch-ans">손실 곡선이 들쭉날쭉해지거나 학습이 망가집니다. 한 걸음이 너무 크면 골짜기 바닥을 지나쳐 버립니다.</span>
          </span>
        </li>
      </ol>

      <h2>은닉층이 하는 일: 공간을 접어서 펴기</h2>
      <p>
        은닉층이 무엇을 하는지 다른 각도에서 볼 수도 있습니다. 은닉층은 입력 공간 전체를 새로운 공간으로 옮기는 변환입니다. 행렬 곱 <M>{'W\\mathbf{x}+\\mathbf{b}'}</M>는 공간을 늘리고 돌리고, 활성화 함수는 그 공간을 휘고 접습니다. 잘 학습된 신경망에서는 이렇게 변형된 공간에서 두 종류의 점이 직선 하나로 깔끔하게 갈라집니다.
      </p>
      <FoldFigure />
      <Callout kind="key">
        활성화 함수가 없다면 층을 아무리 쌓아도 행렬 곱의 연속이고, 행렬 곱 여러 번은 행렬 곱 한 번과 같습니다. 즉 직선밖에 못 긋습니다. 공간을 휘게 만드는 비선형 활성화 함수가 있기 때문에 깊은 신경망이 의미를 갖습니다.
      </Callout>

      <h2>왜 깊게 쌓을까</h2>
      <p>
        이론적으로는 은닉층 하나에 뉴런을 충분히 많이 넣으면 어떤 연속 함수든 원하는 만큼 가깝게 흉내 낼 수 있다는 것이 알려져 있습니다(<T en="universal approximation theorem">보편 근사 정리</T>). 하지만 필요한 뉴런 수가 엄청나게 늘어날 수 있습니다. 층을 깊게 쌓으면 앞 층이 만든 부품을 뒤 층이 재사용하기 때문에 훨씬 적은 뉴런으로 복잡한 모양을 표현할 수 있습니다. 이미지 인식 신경망에서 앞쪽 층은 선과 모서리를, 중간 층은 눈이나 바퀴 같은 부분을, 뒤쪽 층은 얼굴이나 자동차 같은 전체를 알아보는 것도 같은 원리입니다.
      </p>
      <p>
        남은 질문은 하나입니다. 놀이터에서 수천 개의 가중치가 저절로 맞춰지는 것을 봤는데, 각 가중치를 어느 방향으로 얼마나 고쳐야 하는지는 어떻게 알아낼까요? 그 답이 다음 장의 역전파입니다.
      </p>
      <Quiz
        q="활성화 함수를 모두 없애고(항등 함수로 바꾸고) 은닉층을 10개 쌓은 신경망이 그릴 수 있는 결정 경계는?"
        options={['은닉층 1개짜리보다 훨씬 복잡한 곡선', '직선 하나', '원 모양까지만 가능', '층 수에 비례하는 개수의 꺾인 선']}
        answer={1}
        explain={<>선형 변환을 여러 번 합성해도 결국 하나의 선형 변환 <M>{'W_{10}\\cdots W_2W_1\\mathbf{x}+\\mathbf{c}'}</M>입니다. 따라서 결정 경계는 직선(고차원에서는 평면) 하나뿐입니다.</>}
      />
    </>
  );
}

