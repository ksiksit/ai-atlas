import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { PLATONIC, SQUARES, analyse, meshFor, opposite, parseWord, standardTex, standardWord, startWalker, surfaceName, walk, wordTex, type Edge, type MeshId, type SquareId, type Walker } from './surfaces';
import './topology.css';
import './surfaces.css';

/* ───────── shared drawing ───────── */

const letterColors = (P: Palette) => [P.neg, P.pos, P.good, P.stats2, P.bad, P.stats1, P.accent, P.math];

/** Colour per letter of a word: glued letters get a colour, free letters the faint ink. */
function colorMap(P: Palette, es: Edge[]): Map<string, string> {
  const count = new Map<string, number>();
  es.forEach((e) => count.set(e.l, (count.get(e.l) ?? 0) + 1));
  const cols = letterColors(P);
  const out = new Map<string, string>();
  let k = 0;
  for (const e of es) {
    if (out.has(e.l)) continue;
    out.set(e.l, count.get(e.l) === 1 ? P.ink3 : cols[k++ % cols.length]);
  }
  return out;
}

function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(ang) * size, y + Math.sin(ang) * size);
  ctx.lineTo(x + Math.cos(ang + 2.5) * size, y + Math.sin(ang + 2.5) * size);
  ctx.lineTo(x + Math.cos(ang - 2.5) * size, y + Math.sin(ang - 2.5) * size);
  ctx.closePath();
  ctx.fill();
}

/** Draw a polygon gluing diagram: corners counterclockwise starting at the bottom left. */
function drawPolygon(ctx: CanvasRenderingContext2D, P: Palette, es: Edge[], corners: [number, number][], opts: { label?: boolean; cornerClass?: number[] } = {}) {
  const cols = colorMap(P, es);
  const n = es.length;
  ctx.fillStyle = alpha(P.math, 0.08);
  ctx.beginPath();
  corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  es.forEach((e, k) => {
    const [x0, y0] = corners[k], [x1, y1] = corners[(k + 1) % n];
    const c = cols.get(e.l)!;
    const free = c === P.ink3;
    ctx.strokeStyle = c;
    ctx.lineWidth = free ? 1.5 : 3;
    ctx.setLineDash(free ? [5, 4] : []);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!free) {
      const ang = Math.atan2(y1 - y0, x1 - x0) + (e.s === 1 ? 0 : Math.PI);
      arrowHead(ctx, (x0 + x1) / 2 + Math.cos(ang) * 6, (y0 + y1) / 2 + Math.sin(ang) * 6, ang, 8, c);
    }
    if (opts.label !== false) {
      // label outside the polygon: push away from the centroid
      const cx = corners.reduce((s, p) => s + p[0], 0) / n, cy = corners.reduce((s, p) => s + p[1], 0) / n;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const d = Math.hypot(mx - cx, my - cy) || 1;
      ctx.fillStyle = c;
      ctx.font = `700 13px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.l, mx + ((mx - cx) / d) * 16, my + ((my - cy) / d) * 16);
    }
  });
  if (opts.cornerClass) {
    const shapes = [P.ink, P.bad, P.good, P.pos];
    corners.forEach(([x, y], i) => {
      ctx.fillStyle = shapes[opts.cornerClass![i] % shapes.length];
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = P.surface;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }
}

/* 3-D wireframes: rotate about the vertical axis, tilt, project orthographically and fit to the box */
type V3 = [number, number, number];
function project(pts: V3[], yaw: number, tilt: number): { x: number; y: number; d: number }[] {
  const ca = Math.cos(yaw), sa = Math.sin(yaw), cb = Math.cos(tilt), sb = Math.sin(tilt);
  return pts.map(([x, y, z]) => {
    const X = x * ca + z * sa, Z = -x * sa + z * ca;
    return { x: X, y: y * cb - Z * sb, d: y * sb + Z * cb };
  });
}
function fit(ps: { x: number; y: number }[], w: number, h: number, pad = 14) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of ps) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const s = Math.min((w - 2 * pad) / Math.max(1e-6, x1 - x0), (h - 2 * pad) / Math.max(1e-6, y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return (p: { x: number; y: number }) => [w / 2 + (p.x - cx) * s, h / 2 - (p.y - cy) * s] as [number, number];
}

/* ───────── Figure 1: glue a square ───────── */

/** Position of the square's point (u, v) part way through folding it into the surface. */
function fold(id: SquareId, u: number, v: number, t: number): V3 {
  const L = 1.6; // half length of the strip or tube before bending
  if (id === 'torus') {
    const s1 = Math.min(1, 2 * t), s2 = Math.max(0, 2 * t - 1);
    // roll across u into a tube around the y axis
    let x: number, z: number;
    if (s1 < 1e-4) {
      x = 2 * u - 1;
      z = 0;
    } else {
      const th = (2 * u - 1) * Math.PI * s1, R = 1 / (Math.PI * s1);
      x = R * Math.sin(th);
      z = R * (1 - Math.cos(th));
    }
    const h = (2 * v - 1) * L;
    if (s2 < 1e-4) return [x, h, z];
    const zc = 1 / Math.PI, Rb = L / (Math.PI * s2), ph = (h / L) * Math.PI * s2;
    const dz = z - zc;
    return [x, (Rb - dz) * Math.sin(ph), zc + Rb - (Rb - dz) * Math.cos(ph)];
  }
  // cylinder and Möbius band: a strip rolled across u, with a half twist for the band
  const half = 0.45;
  const hgt = (2 * v - 1) * half;
  if (t < 1e-4) return [(2 * u - 1) * 1.6, hgt, 0];
  const th = (2 * u - 1) * Math.PI * t, R = 1.6 / (Math.PI * t);
  const C: V3 = [R * Math.sin(th), 0, R * (1 - Math.cos(th))];
  const N: V3 = [-Math.sin(th), 0, Math.cos(th)];
  const a = id === 'mobius' ? (2 * u - 1) * (Math.PI / 2) * t : 0;
  return [C[0] + hgt * Math.sin(a) * N[0], hgt * Math.cos(a), C[2] + hgt * Math.sin(a) * N[2]];
}

function GlueFigure() {
  const P = usePalette();
  const [id, setId] = useState<SquareId>('torus');
  const [t, setT] = useState(1);
  const [yaw, setYaw] = useState(0.6);
  const [spin, setSpin] = useState(true);
  const [still] = useState(prefersReducedMotion);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  useAnimationFrame((dt) => setYaw((y) => y + dt * 0.35), spin && inView && !still);
  const sq = SQUARES.find((s) => s.id === id)!;
  const es = useMemo(() => parseWord(sq.word), [sq]);
  const info = analyse(es);
  const foldable = id === 'cylinder' || id === 'mobius' || id === 'torus';
  const seamLetter = es[1].l;

  const flat = useCanvas2D(
    (ctx, { w, h }) => {
      const S = Math.min(w, h) - 70, x0 = (w - S) / 2, y0 = (h + S) / 2;
      drawPolygon(ctx, P, es, [
        [x0, y0],
        [x0 + S, y0],
        [x0 + S, y0 - S],
        [x0, y0 - S],
      ], { cornerClass: info.cornerClass });
    },
    [P, es, info],
    { aspect: 1, maxHeight: 300 },
  );

  const solid = useCanvas2D(
    (ctx, { w, h }) => {
      if (!foldable && id !== 'sphere') {
        ctx.fillStyle = P.ink3;
        ctx.font = `500 13px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = ['3차원 공간에서는', '자기 자신을 뚫지 않고', '이 곡면을 만들 수 없습니다.', '(4차원에서는 됩니다)'];
        lines.forEach((s, i) => ctx.fillText(s, w / 2, h / 2 + (i - 1.5) * 20));
        return;
      }
      const NU = 32, NV = id === 'torus' ? 20 : 8;
      const pt = (u: number, v: number): V3 => {
        if (id === 'sphere') {
          const th = u * 2 * Math.PI, ph = (v - 0.5) * Math.PI;
          return [Math.cos(ph) * Math.cos(th), Math.sin(ph), Math.cos(ph) * Math.sin(th)];
        }
        return fold(id, u, v, t);
      };
      const grid: V3[] = [];
      for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) grid.push(pt(i / NU, j / NV));
      const pr = project(grid, yaw, 0.45);
      const to = fit(pr, w, h);
      const at = (i: number, j: number) => pr[i * (NV + 1) + j];
      const seg = (a: { x: number; y: number; d: number }, b: { x: number; y: number; d: number }, color: string, wid: number) => {
        const depth = (a.d + b.d) / 2;
        ctx.strokeStyle = alpha(color, depth > 0 ? 0.3 : 0.85);
        ctx.lineWidth = wid;
        ctx.beginPath();
        ctx.moveTo(...to(a));
        ctx.lineTo(...to(b));
        ctx.stroke();
      };
      const seamColor = colorMap(P, es).get(seamLetter)!;
      for (let i = 0; i <= NU; i++)
        for (let j = 0; j < NV; j++) {
          const seam = id !== 'sphere' && (i === 0 || i === NU);
          seg(at(i, j), at(i, j + 1), seam ? seamColor : P.ink2, seam ? 2.6 : 1);
        }
      for (let j = 0; j <= NV; j++)
        for (let i = 0; i < NU; i++) {
          const edge = id !== 'sphere' && (j === 0 || j === NV);
          const c = id === 'torus' && edge ? colorMap(P, es).get(es[0].l)! : P.ink2;
          seg(at(i, j), at(i + 1, j), c, edge ? 2.2 : 1);
        }
    },
    [P, id, t, yaw, es, foldable, seamLetter],
    { aspect: 1, maxHeight: 300 },
  );

  return (
    <Figure
      no={1}
      title="정사각형의 변을 붙여 곡면 만들기"
      hint="붙이는 방법을 고르고 접기를 움직여 보세요"
      caption={
        <>
          왼쪽은 붙이는 규칙입니다. 같은 글자의 변끼리 화살표 방향을 맞춰 붙이고, 점선 변은 붙이지 않아 곡면의 가장자리로 남습니다. 꼭짓점의 색은 붙인 뒤 같은 점이 되는 꼭짓점끼리 같습니다. 오른쪽은 실제로 접어 본 모양이고, 굵은 선이 붙인 변입니다. 원기둥과 뫼비우스 띠는 모양이 잘 보이도록 가늘고 긴 띠로 그렸습니다. 늘이거나 줄여도 위상은 변하지 않습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={setId} options={SQUARES.map((s) => ({ value: s.id, label: s.name }))} />
      </div>
      <div className="fig-split" ref={box}>
        <div ref={flat.wrapRef} className="canvas-box" role="img" aria-label={`붙이는 규칙 ${sq.word.replace(/'/g, '⁻¹')}을 그린 정사각형. 꼭짓점 ${info.V}개, 변 ${info.E}개, 면 1개로 오일러 지표 ${info.chi}, ${info.orientable ? '방향을 줄 수 있는' : '방향을 줄 수 없는'} 곡면입니다.`}>
          <canvas ref={flat.canvasRef} />
        </div>
        <div ref={solid.wrapRef} className="canvas-box" role="img" aria-label={foldable ? `정사각형을 ${Math.round(t * 100)}%까지 접어 ${sq.name}을 만드는 3차원 그림` : id === 'sphere' ? '구' : `${sq.name}은 3차원에서 자기 자신과 엇갈리지 않고는 만들 수 없다는 안내`}>
          <canvas ref={solid.canvasRef} />
        </div>
      </div>
      <div className="controls">
        {foldable && <Slider id="sf-fold" label="접기" value={t} min={0} max={1} step={0.01} onChange={setT} format={(v) => `${Math.round(v * 100)}%`} />}
        <Check label="돌리기" checked={spin} onChange={setSpin} />
      </div>
      <p className="sf-word">
        경계를 따라 읽은 낱말: <M>{wordTex(es)}</M> · {sq.note}
      </p>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
        <Readout label="꼭짓점 V" value={info.V} />
        <Readout label="변 E" value={info.E} />
        <Readout label="면 F" value={info.F} />
        <Readout label="χ = V − E + F" value={info.chi} />
        <Readout label="방향" value={info.orientable ? '줄 수 있음' : '줄 수 없음'} color={info.orientable ? undefined : 'var(--bad)'} />
        <Readout label="가장자리" value={info.boundaryEdges ? `변 ${info.boundaryEdges}개` : '없음'} />
      </div>
    </Figure>
  );
}

/* ───────── Figure 2: walk across the glued edges ───────── */

const WALKABLE = SQUARES.filter((s) => s.id !== 'sphere');

function WalkFigure() {
  const P = usePalette();
  const [id, setId] = useState<SquareId>('klein');
  const glue = opposite(id)!;
  const [w, setW] = useState<Walker>(startWalker);
  const [trail, setTrail] = useState<[number, number][][]>([[[startWalker().x, startWalker().y]]]);
  const [playing, setPlaying] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  const es = useMemo(() => parseWord(SQUARES.find((s) => s.id === id)!.word), [id]);

  const reset = (nid = id) => {
    setW(startWalker());
    setTrail([[[startWalker().x, startWalker().y]]]);
    setPlaying(false);
    if (nid !== id) setId(nid);
  };
  const advance = (dist: number) => {
    let cur = w;
    const segs = trail.map((s) => s.slice());
    for (let k = 0; k < Math.ceil(dist / 0.004); k++) {
      const nx = walk(cur, 0.004, glue);
      if (nx.crossings !== cur.crossings) segs.push([[nx.x, nx.y]]);
      else segs[segs.length - 1].push([nx.x, nx.y]);
      cur = nx;
      if (cur.stopped) break;
    }
    setW(cur);
    setTrail(segs.slice(-40));
    if (cur.stopped) setPlaying(false);
  };
  useAnimationFrame((dt) => advance(dt * 0.35), playing && inView);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: cw, h }) => {
      const S = Math.min(cw, h) - 60, x0 = (cw - S) / 2, y0 = (h + S) / 2;
      drawPolygon(ctx, P, es, [
        [x0, y0],
        [x0 + S, y0],
        [x0 + S, y0 - S],
        [x0, y0 - S],
      ]);
      const X = (x: number) => x0 + x * S, Y = (y: number) => y0 - y * S;
      ctx.strokeStyle = alpha(P.accent, 0.7);
      ctx.lineWidth = 2;
      for (const s of trail) {
        ctx.beginPath();
        s.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        ctx.stroke();
      }
      // the walker: an arrow with a dot on its left side, so a mirror image is easy to spot
      const px = X(w.x), py = Y(w.y), a = -w.dir;
      ctx.fillStyle = P.ink;
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(a) * 14, py + Math.sin(a) * 14);
      ctx.lineTo(px + Math.cos(a + 2.4) * 10, py + Math.sin(a + 2.4) * 10);
      ctx.lineTo(px + Math.cos(a - 2.4) * 10, py + Math.sin(a - 2.4) * 10);
      ctx.closePath();
      ctx.fill();
      const side = a - (Math.PI / 2) * w.hand;
      ctx.fillStyle = w.hand === 1 ? P.good : P.bad;
      ctx.beginPath();
      ctx.arc(px + Math.cos(side) * 11, py + Math.sin(side) * 11, 4.5, 0, Math.PI * 2);
      ctx.fill();
    },
    [P, es, w, trail],
    { aspect: 1, maxHeight: 340 },
  );

  return (
    <Figure
      no={2}
      title="붙인 변을 넘어 걸어가기"
      hint="재생하거나 한 걸음씩 넘겨 보세요"
      caption={
        <>
          화살표는 곡면 위를 곧게 걸어가는 작은 생물이고, 점은 그 생물의 왼손입니다. 변을 넘으면 같은 글자의 변으로 다시 들어옵니다. 화살표 방향이 서로 반대로 붙은 변을 넘으면 거울에 비친 듯 위아래(또는 좌우)가 뒤집혀 들어오고, 왼손이 오른쪽으로 옮겨 갑니다. 점선 변에 닿으면 곡면의 가장자리라 멈춥니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={(v) => reset(v)} options={WALKABLE.map((s) => ({ value: s.id, label: s.name }))} />
      </div>
      <div className="fig-split" ref={box}>
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${SQUARES.find((s) => s.id === id)!.name}의 정사각형 위를 걷는 화살표. 지금까지 변을 ${w.crossings}번 넘었고, 왼손 점은 ${w.hand === 1 ? '처음처럼 왼쪽' : '오른쪽으로 뒤집혀'} 있습니다.${w.stopped ? ' 가장자리에 닿아 멈췄습니다.' : ''}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="btn-row">
            <Button small primary onClick={() => setPlaying((p) => !p)} disabled={w.stopped}>
              {playing ? '❚❚ 멈춤' : '▶ 걷기'}
            </Button>
            <Button small onClick={() => advance(0.1)} disabled={w.stopped}>
              조금 걷기
            </Button>
            <Button small onClick={() => reset()}>
              처음으로
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="변을 넘은 횟수" value={w.crossings} />
            <Readout label="왼손" value={w.hand === 1 ? '왼쪽 (처음처럼)' : '오른쪽 (뒤집힘)'} color={w.hand === 1 ? 'var(--good)' : 'var(--bad)'} />
          </div>
          <div className="tp-note" aria-live="polite">
            {w.stopped
              ? '점선 변은 붙이지 않았으므로 여기가 곡면의 끝입니다.'
              : glue.lr === 'flip' || glue.tb === 'flip'
                ? '뒤집어 붙인 변을 넘을 때마다 왼손이 반대쪽으로 갑니다. 한 바퀴 돌아오면 거울상이 된 채로 출발점을 지나갈 수 있습니다.'
                : '어느 변을 넘어도 왼손은 늘 왼쪽에 있습니다. 이 곡면에는 방향을 줄 수 있습니다.'}
          </div>
          <Legend
            items={[
              { color: 'var(--good)', label: '왼손이 왼쪽' },
              { color: 'var(--bad)', label: '왼손이 오른쪽' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ───────── Figure 3: V − E + F on finer and finer meshes ───────── */

function EulerFigure() {
  const P = usePalette();
  const [id, setId] = useState<MeshId>('torus');
  const [n, setN] = useState(1);
  const [tri, setTri] = useState(false);
  const [yaw, setYaw] = useState(0.5);
  const [spin, setSpin] = useState(true);
  const [still] = useState(prefersReducedMotion);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  useAnimationFrame((dt) => setYaw((y) => y + dt * 0.3), spin && inView && !still);
  const mesh = useMemo(() => meshFor(id, n, tri), [id, n, tri]);
  const chi = mesh.V - mesh.E + mesh.F;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pr = project(mesh.pts, yaw, id === 'cube' ? 0.5 : 0.75);
      const to = fit(pr, w, h);
      for (const [a, b] of mesh.edges) {
        const d = (pr[a].d + pr[b].d) / 2;
        ctx.strokeStyle = alpha(P.ink, d > 0 ? 0.18 : 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(...to(pr[a]));
        ctx.lineTo(...to(pr[b]));
        ctx.stroke();
      }
      for (const p of pr) {
        if (p.d > 0) continue;
        const [x, y] = to(p);
        ctx.fillStyle = P.accent;
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    },
    [P, mesh, yaw, id],
    { aspect: 1.5, maxHeight: 320 },
  );

  return (
    <Figure
      no={3}
      title="잘게 나눠도 변하지 않는 수 V − E + F"
      hint="곡면을 고르고 나눔을 늘려 보세요"
      caption={
        <>
          곡면을 사각형이나 삼각형 조각으로 덮고 꼭짓점, 모서리, 면을 실제로 세어 V − E + F를 계산합니다. 조각을 아무리 잘게 나누고 사각형을 삼각형으로 쪼개도 정육면체(구와 같은 모양)는 2, 토러스는 0, 구멍 두 개짜리 곡면은 −2에서 움직이지 않습니다. 구멍 두 개짜리 곡면은 토러스 두 개에서 사각형을 하나씩 떼어 내고 그 자리를 짧은 관으로 이은 것입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          value={id}
          onChange={setId}
          options={[
            { value: 'cube', label: '정육면체 (구)' },
            { value: 'torus', label: '토러스' },
            { value: 'double', label: '구멍 두 개' },
          ]}
        />
        <Slider id="sf-n" label="나눔" value={n} min={1} max={4} step={1} onChange={setN} />
        <Check label="삼각형으로 쪼개기" checked={tri} onChange={setTri} />
        <Check label="돌리기" checked={spin} onChange={setSpin} />
      </div>
      <div ref={box}>
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${id === 'cube' ? '정육면체' : id === 'torus' ? '토러스' : '구멍 두 개짜리 곡면'}의 그물. 꼭짓점 ${mesh.V}개, 모서리 ${mesh.E}개, 면 ${mesh.F}개로 V − E + F = ${chi}입니다.`}>
          <canvas ref={canvasRef} />
        </div>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Readout label="꼭짓점 V" value={mesh.V} />
        <Readout label="모서리 E" value={mesh.E} />
        <Readout label="면 F" value={mesh.F} />
        <Readout label="V − E + F" value={chi} color="var(--good)" />
      </div>
    </Figure>
  );
}

/* ───────── Figure 4: connected sums and the classification ───────── */

function ClassifyFigure() {
  const P = usePalette();
  const [g, setG] = useState(2);
  const [k, setK] = useState(0);
  const es = useMemo(() => standardWord(g, k), [g, k]);
  const info = analyse(es);
  const name = surfaceName(g, k);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const n = es.length;
      const R = Math.min(w, h) / 2 - 34, cx = w / 2, cy = h / 2;
      if (n === 2) {
        // the sphere's two edges drawn as a lens
        const cols = colorMap(P, es);
        ctx.fillStyle = alpha(P.math, 0.08);
        ctx.beginPath();
        ctx.ellipse(cx, cy, R, R * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = cols.get('a')!;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R, R * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        arrowHead(ctx, cx + 6, cy + R * 0.55, 0, 8, cols.get('a')!);
        arrowHead(ctx, cx + 6, cy - R * 0.55, 0, 8, cols.get('a')!);
        ctx.fillStyle = cols.get('a')!;
        ctx.font = `700 13px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.fillText('a', cx, cy + R * 0.55 + 18);
        ctx.fillText('a', cx, cy - R * 0.55 - 14);
        return;
      }
      const corners = Array.from({ length: n }, (_, i) => {
        const a = Math.PI / 2 + Math.PI / n + (2 * Math.PI * i) / n;
        return [cx + R * Math.cos(a), cy + R * Math.sin(a)] as [number, number];
      });
      drawPolygon(ctx, P, es, corners, { cornerClass: info.cornerClass });
    },
    [P, es, info],
    { aspect: 1.3, maxHeight: 340 },
  );

  return (
    <Figure
      no={4}
      title="토러스와 사영 평면을 이어 붙이기"
      hint="토러스와 사영 평면의 개수를 바꿔 보세요"
      caption={
        <>
          두 곡면에서 작은 원판을 하나씩 오려 내고 그 구멍끼리 이어 붙이는 것을 <b>연결합</b>이라고 합니다. 토러스 g개와 사영 평면 k개의 연결합은 변이 4g + 2k개인 다각형 하나로 그릴 수 있습니다. 그림은 그 다각형과 붙이는 규칙이고, 아래 수는 다각형의 꼭짓점을 실제로 같은 점끼리 묶어 센 것입니다. 구가 아니면 꼭짓점은 언제나 전부 한 점으로 모입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="sf-g" label="토러스 g" value={g} min={0} max={3} step={1} onChange={setG} />
        <Slider id="sf-k" label="사영 평면 k" value={k} min={0} max={3} step={1} onChange={setK} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`변 ${es.length}개짜리 다각형으로 그린 ${name}. 오일러 지표 ${info.chi}, ${info.orientable ? '방향을 줄 수 있음' : '방향을 줄 수 없음'}.`}>
        <canvas ref={canvasRef} />
      </div>
      <p className="sf-word">
        낱말: <M>{standardTex(g, k)}</M>
      </p>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        <Readout label="곡면" value={name} />
        <Readout label="V − E + F" value={`${info.V} − ${info.E} + 1 = ${info.chi}`} />
        <Readout label="2 − 2g − k" value={2 - 2 * g - k} color="var(--good)" />
        <Readout label="방향" value={info.orientable ? '줄 수 있음' : '줄 수 없음'} color={info.orientable ? undefined : 'var(--bad)'} />
      </div>
    </Figure>
  );
}

/* ───────── Lesson ───────── */

export default function Surfaces() {
  return (
    <>
      <h2>정사각형 하나로 만드는 곡면들</h2>
      <p>
        <a href={lessonHref('math-topology', 'topological-spaces')}>위상 공간과 연속 장</a>에서 늘이고 구부려서 서로 바꿀 수 있는 두 공간을 <T en="homeomorphic">위상 동형</T>이라고 했습니다. 이 장에서는 닫힌 <T en="surface">곡면</T>, 곧 어느 점 근처를 봐도 평면의 작은 원판처럼 생긴 공간을 위상 동형인 것끼리 남김없이 분류합니다.
      </p>
      <p>
        재료는 종이 한 장입니다. 정사각형의 마주 보는 변이나 이웃한 변에 글자와 화살표를 붙이고, 같은 글자의 변끼리 화살표 방향을 맞춰 붙입니다. 경계를 반시계 방향으로 따라 읽으며 화살표가 같은 방향이면 글자를, 반대 방향이면 그 역을 적은 것을 <T en="word">낱말</T>이라고 합니다. 예를 들어 <M>{'aba^{-1}b^{-1}'}</M>은 마주 보는 변을 두 쌍 모두 같은 방향으로 붙이라는 뜻이고, 결과는 도넛 표면인 <T en="torus">토러스</T>입니다.
      </p>
      <GlueFigure />
      <p>
        원기둥과 뫼비우스 띠의 차이는 한 쌍의 변을 붙일 때 뒤집느냐 아니냐뿐입니다. 토러스와 <T en="Klein bottle">클라인 병</T>, 그리고 <T en="projective plane">사영 평면</T>의 차이도 같습니다. 클라인 병과 사영 평면은 3차원 공간에서는 자기 자신을 뚫지 않고 만들 수 없지만, 낱말로는 정사각형 하나로 정확히 정의됩니다. 위상수학에서 곡면은 어딘가에 놓인 물체가 아니라 붙이는 규칙 그 자체입니다.
      </p>

      <h2>방향을 줄 수 있는 곡면과 없는 곡면</h2>
      <p>
        곡면 위를 걸어 다니는 아주 납작한 생물을 생각해 봅시다. 어느 길로 한 바퀴 돌아와도 왼손이 여전히 왼쪽에 있다면 그 곡면에는 <T en="orientable">방향을 줄 수 있다</T>고 합니다. 어떤 길을 돌아왔더니 거울상이 되어 있다면 방향을 줄 수 없습니다.
      </p>
      <WalkFigure />
      <p>
        토러스에서는 아무리 걸어도 왼손이 왼쪽에 있지만, 클라인 병에서는 위아래 변을 넘는 순간 거울상이 됩니다. 낱말로 판정하는 법도 간단합니다. 같은 글자가 같은 지수로 두 번 나오면(<M>{'\\cdots a \\cdots a \\cdots'}</M>) 그 변을 넘을 때 방향이 뒤집히므로 방향을 줄 수 없고, 모든 글자가 <M>{'a'}</M>와 <M>{'a^{-1}'}</M>로 짝지어 나오면 방향을 줄 수 있습니다. 컨베이어 벨트를 뫼비우스 띠로 만들면 벨트의 양면이 사실은 한 면이라 고르게 닳는다는 이야기가 이 성질에서 나옵니다. 한편 게임 화면에서 오른쪽 끝으로 나가면 왼쪽에서, 위로 나가면 아래에서 나오는 세계는 정확히 토러스입니다.
      </p>

      <h2>V − E + F: 모양을 세는 수</h2>
      <p>
        볼록 다면체의 꼭짓점 수 V, 모서리 수 E, 면 수 F에 대해 V − E + F = 2라는 오일러의 공식이 있습니다. 다섯 정다면체로 확인해 보면 다음과 같습니다.
      </p>
      <div className="tbl-wrap">
        <table className="sf-table">
          <thead>
            <tr>
              <th>다면체</th>
              <th>V</th>
              <th>E</th>
              <th>F</th>
              <th>V − E + F</th>
            </tr>
          </thead>
          <tbody>
            {PLATONIC.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td className="num">{p.V}</td>
                <td className="num">{p.E}</td>
                <td className="num">{p.F}</td>
                <td className="num">{p.V - p.E + p.F}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        이 수는 다면체의 성질이 아니라 다면체를 부풀린 곡면, 곧 구의 성질입니다. 곡면을 다각형 조각으로 빈틈없이 덮은 것을 <T en="cell decomposition">세포 분할</T>이라고 하고, 그때의 V − E + F를 <T en="Euler characteristic">오일러 지표</T> <M>{'\\chi'}</M>라고 합니다.
      </p>
      <EulerFigure />
      <div className="sf-thm">
        <b>정리.</b> 한 곡면의 두 세포 분할이 어느 쪽이든 V − E + F는 같습니다. 따라서 <M>{'\\chi'}</M>는 곡면의 위상 불변량입니다.
      </div>
      <div className="sf-proof">
        <p>
          <span className="sf-proof-head">증명의 핵심.</span> 세포 분할을 더 잘게 만드는 기본 동작은 두 가지뿐입니다. 모서리 하나의 가운데에 꼭짓점을 찍으면 그 모서리가 둘로 나뉘므로 V와 E가 1씩 늘고, V − E + F는 그대로입니다. 면 하나 안에서 그 면의 두 꼭짓점을 잇는 모서리를 그으면 면이 둘로 나뉘므로 E와 F가 1씩 늘고, 역시 V − E + F는 그대로입니다.
        </p>
        <p>
          그러므로 이 두 동작을 몇 번 하든 오일러 지표는 변하지 않습니다. 같은 곡면의 두 분할은 둘을 겹쳐 그린 공통의 더 잘게 나눈 분할로 둘 다 이 동작만으로 갈 수 있으므로(이 부분은 겹친 선들을 조금 움직여 일반적인 위치에 놓는 기술적인 단계가 필요합니다) 두 분할의 V − E + F는 같습니다. 그림 3에서 나눔을 늘리고 사각형을 삼각형으로 쪼개도 수가 그대로인 것이 이 두 동작입니다. <span className="sf-qed">∎</span>
        </p>
      </div>
      <p>
        정사각형 하나로 만든 곡면은 면이 1개, 변이 글자 수만큼, 꼭짓점이 붙인 뒤 남는 점의 수만큼인 세포 분할을 이미 갖고 있습니다. 그림 1의 수가 바로 그것이라서 토러스는 1 − 2 + 1 = 0, 사영 평면은 2 − 2 + 1 = 1, 구는 3 − 2 + 1 = 2입니다. 정육면체를 잘게 나눈 그림 3의 값과 같은 것을 확인해 보세요.
      </p>

      <h2>모든 닫힌 곡면의 목록</h2>
      <ClassifyFigure />
      <div className="sf-thm">
        <b>곡면 분류 정리.</b> 경계가 없고 연결된 콤팩트 곡면은 다음 중 정확히 하나와 위상 동형입니다.
        <MB>{'S^2,\\qquad T^2 \\# \\cdots \\# T^2\\ (g\\text{개}),\\qquad \\mathbb{RP}^2 \\# \\cdots \\# \\mathbb{RP}^2\\ (k\\text{개})'}</MB>
        앞의 두 종류는 방향을 줄 수 있고 <M>{'\\chi = 2 - 2g'}</M>이며, 마지막 종류는 방향을 줄 수 없고 <M>{'\\chi = 2 - k'}</M>입니다. 따라서 방향성과 오일러 지표 두 가지만 알면 곡면이 무엇인지 정해집니다.
      </div>
      <p>
        그림 4에서 토러스와 사영 평면을 함께 섞으면 이름이 "사영 평면 (2g + k)개의 연결합"으로 바뀝니다. 토러스 하나와 사영 평면 하나의 연결합은 사영 평면 셋의 연결합과 같기 때문입니다. 방향을 줄 수 없는 조각이 하나라도 섞이면 결과도 방향을 줄 수 없고, 그때부터 토러스는 사영 평면 두 개로 바꿔 셀 수 있습니다. 오일러 지표 <M>{'2 - 2g - k'}</M>는 어느 쪽으로 세어도 같습니다.
      </p>
      <Callout kind="note">
        정리의 증명은 어떤 곡면이든 삼각형으로 나눌 수 있다는 사실(라도의 정리)에서 출발해, 삼각형들을 펼쳐 다각형 하나로 만들고 낱말을 정해진 규칙으로 바꿔 가며 위의 표준 낱말 중 하나로 만드는 과정입니다. 그림 4의 낱말이 그 도착점입니다.
      </Callout>

      <Callout kind="key">
        닫힌 곡면은 다각형의 변을 붙이는 규칙인 낱말로 정의할 수 있습니다. 같은 글자가 같은 방향으로 두 번 나오면 그 곡면에는 방향을 줄 수 없습니다. 꼭짓점, 모서리, 면의 수로 만든 오일러 지표 V − E + F는 분할을 아무리 잘게 바꿔도 변하지 않는 위상 불변량입니다. 곡면 분류 정리에 따르면 방향성과 오일러 지표만으로 구, 구멍 g개짜리 곡면, 사영 평면 k개의 연결합 가운데 무엇인지 정해집니다.
      </Callout>
      <Quiz
        q={<>정사각형의 변을 낱말 <M>{'abab^{-1}'}</M>로 붙인 곡면의 오일러 지표와 방향성은?</>}
        options={['χ = 2, 방향을 줄 수 있음 (구)', 'χ = 0, 방향을 줄 수 있음 (토러스)', 'χ = 0, 방향을 줄 수 없음 (클라인 병)', 'χ = 1, 방향을 줄 수 없음 (사영 평면)']}
        answer={2}
        explain={
          <>
            네 꼭짓점이 붙인 뒤 모두 한 점이 되므로 V = 1, 글자가 a와 b 두 개라 E = 2, F = 1이고 χ = 1 − 2 + 1 = 0입니다. 글자 a가 지수 +1로 두 번 나오므로 그 변을 넘으면 방향이 뒤집힙니다. 방향을 줄 수 없고 χ = 0인 곡면은 클라인 병입니다.
          </>
        }
      />
    </>
  );
}
