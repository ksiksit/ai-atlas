import { useMemo, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { rng } from '../../../../lib/math';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { ARMIJO_C, itersQuad, lineData, mse, newton1d, penalty, quad, rosen, runQuad, runRosen, sgd, type Method, type P2, type RosenMethod, type Schedule } from './optim';
import './numerical.css';
import './optim.css';

const fmtInt = (v: number) => Math.round(v).toLocaleString('ko-KR');
const nf = (v: number, d = 3) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');

/** CSS colour (#rgb, #rrggbb or rgb()) → [r, g, b] in 0..255. */
function rgbOf(css: string): [number, number, number] {
  const s = css.trim();
  if (s.startsWith('#')) {
    const h = s.length === 4 ? s.slice(1).split('').map((c) => c + c).join('') : s.slice(1, 7);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = s.match(/[\d.]+/g);
  return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
}

/** Contour bands of f: the band index comes from `level(v)`; lower bands get a stronger tint of the maths colour. */
function contourBands(pl: Plot, P: Palette, f: (p: P2) => number, level: (v: number) => number, bands: number) {
  const bg = rgbOf(P.surface2);
  const fg = rgbOf(P.math);
  pl.heatmap((x, y) => {
    const b = Math.max(0, Math.min(bands - 1, Math.floor(level(f([x, y])))));
    // alternate a little so neighbouring bands read as separate steps
    const t = 0.06 + (0.62 * (bands - 1 - b)) / (bands - 1) + (b % 2 ? 0.04 : 0);
    return [bg[0] + (fg[0] - bg[0]) * t, bg[1] + (fg[1] - bg[1]) * t, bg[2] + (fg[2] - bg[2]) * t, 255];
  }, 2);
}

function drawPath(pl: Plot, path: P2[], color: string, upto = path.length - 1, width = 2) {
  const c = pl.ctx;
  c.save();
  pl.clip();
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  for (let k = 0; k <= upto && k < path.length; k++) {
    const [x, y] = path[k];
    if (k) c.lineTo(pl.X(x), pl.Y(y));
    else c.moveTo(pl.X(x), pl.Y(y));
  }
  c.stroke();
  pl.unclip();
  c.restore();
  const k = Math.min(upto, path.length - 1);
  pl.dot(path[k][0], path[k][1], 4.5, color, pl.p.surface);
}

const START: P2 = [-4, 1];
const METHOD_KO: Record<Method, string> = { gd: '경사하강법', momentum: '운동량(무거운 공)', nesterov: '네스테로프' };

/* ─────────────── Figure 1: gradient descent vs the condition number ─────────────── */

const KAPPAS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

function KappaFigure() {
  const P = usePalette();
  const [kappa, setKappa] = useState(20);
  const path = useMemo(() => runQuad(kappa, 'gd', START), [kappa]);
  const table = useMemo(() => (['gd', 'momentum', 'nesterov'] as Method[]).map((m) => ({ m, its: KAPPAS.map((k) => itersQuad(k, m, START)) })), []);
  const colors: Record<Method, string> = { gd: P.ink, momentum: P.accent, nesterov: P.good };
  const F = quad(kappa);
  const rate = (kappa - 1) / (kappa + 1);
  const its = path.length - 1;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: -4.5, xMax: 1, yMin: -1.4, yMax: 1.4, pad: { l: 26, r: 8, t: 8, b: 22 } });
      const top = F.f(START);
      contourBands(pl, P, F.f, (v) => 10 + 3 * Math.log10(Math.max(v, 1e-9) / top), 10);
      pl.grid({ xStep: 1, yStep: 1, labels: true });
      drawPath(pl, path, P.ink, path.length - 1, 1.6);
      pl.dot(0, 0, 4, P.good, P.surface);
    },
    [P, kappa, path],
    { aspect: 1.5, maxHeight: 280 },
  );

  const plotRef = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 44, r: 10, t: 10, b: 28 };
      const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const X = (k: number) => pad.l + (Math.log10(k) / 3) * pw;
      const Y = (n: number) => pad.t + (1 - Math.log10(Math.max(1, n)) / 4) * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const n of [1, 10, 100, 1000, 10000]) {
        const y = Math.round(Y(n)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(pad.l + pw, y);
        ctx.stroke();
        ctx.fillText(n >= 1000 ? `${n / 1000}천` : String(n), pad.l - 5, y);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const k of [1, 10, 100, 1000]) {
        const x = Math.round(X(k)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, pad.t + ph);
        ctx.stroke();
        ctx.fillText(k >= 1000 ? '1천' : String(k), x, pad.t + ph + 5);
      }
      for (const { m, its: arr } of table) {
        ctx.strokeStyle = colors[m];
        ctx.lineWidth = 2;
        ctx.beginPath();
        KAPPAS.forEach((k, i) => (i ? ctx.lineTo(X(k), Y(arr[i])) : ctx.moveTo(X(k), Y(arr[i]))));
        ctx.stroke();
      }
      const cx = X(kappa);
      ctx.strokeStyle = alpha(P.bad, 0.8);
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, pad.t);
      ctx.lineTo(cx, pad.t + ph);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.ink2;
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('조건수 κ', pad.l + pw, pad.t + ph - 3);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('반복 횟수', pad.l + 4, pad.t + 3);
    },
    [P, table, kappa],
    { aspect: 1.5, maxHeight: 280 },
  );

  return (
    <Figure
      no={1}
      title="골짜기가 좁을수록 느려진다"
      hint="조건수 κ를 키워 보세요"
      caption={
        <>
          왼쪽: <M>{'f = \\tfrac12(x^2 + \\kappa y^2)'}</M>의 등고선과 (−4, 1)에서 출발한 경사하강법의 길. 걸음 크기는 이 함수에 가장 좋은 고정값 <M>{'\\eta = 2/(1+\\kappa)'}</M>입니다. 오른쪽: 원점에서 <M>{'10^{-6}'}</M> 안으로 들어오기까지의 반복 횟수를 κ에 따라 로그-로그 눈금으로 그렸습니다. 세 방법 모두 그 방법에 가장 좋은 고정 계수를 썼습니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="opt-kappa" label="조건수 κ" value={kappa} min={1} max={100} step={1} onChange={setKappa} />
      </div>
      <div className="opt-two">
        <div>
          <div className="opt-panel-title">경사하강법의 길</div>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`조건수 ${kappa}인 골짜기에서 경사하강법이 ${its}번 만에 원점에 도착합니다. 한 걸음마다 오차가 ${rate.toFixed(3)}배로 줄어듭니다.`}>
            <canvas ref={canvasRef} />
          </div>
        </div>
        <div>
          <div className="opt-panel-title">κ에 따른 반복 횟수</div>
          <div ref={plotRef.wrapRef} className="canvas-box" role="img" aria-label={`조건수 1부터 1000까지 반복 횟수: 경사하강법은 κ에 비례해 늘고, 운동량과 네스테로프는 √κ에 비례해 늘어납니다.`}>
            <canvas ref={plotRef.canvasRef} />
          </div>
        </div>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Readout label="경사하강법 반복" value={`${fmtInt(its)}번`} />
        <Readout label="한 걸음의 수축률" value={rate.toFixed(3)} />
        <Readout label="운동량 · 네스테로프" value={`${itersQuad(kappa, 'momentum', START)} · ${itersQuad(kappa, 'nesterov', START)}번`} color="var(--accent)" />
      </div>
      <Legend items={(['gd', 'momentum', 'nesterov'] as Method[]).map((m) => ({ color: colors[m], label: METHOD_KO[m], shape: 'ln' as const }))} />
    </Figure>
  );
}

/* ─────────────── Figure 2: momentum paths ─────────────── */

function MomentumFigure() {
  const P = usePalette();
  const [kappa, setKappa] = useState(20);
  const [k, setK] = useState(30);
  const paths = useMemo(() => (['gd', 'momentum', 'nesterov'] as Method[]).map((m) => ({ m, path: runQuad(kappa, m, START) })), [kappa]);
  const colors: Record<Method, string> = { gd: P.ink, momentum: P.accent, nesterov: P.good };
  const F = quad(kappa);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      // tall enough for every path drawn so far
      let ymax = 1.5;
      for (const { path } of paths) for (let i = 0; i <= Math.min(k, path.length - 1); i++) ymax = Math.max(ymax, Math.abs(path[i][1]) * 1.1);
      ymax = Math.min(ymax, 6);
      const pl = new Plot(ctx, w, h, P, { xMin: -4.5, xMax: 1.5, yMin: -ymax, yMax: ymax, pad: { l: 26, r: 8, t: 8, b: 22 } });
      const top = F.f(START);
      contourBands(pl, P, F.f, (v) => 10 + 3 * Math.log10(Math.max(v, 1e-9) / top), 10);
      pl.grid({ xStep: 1 });
      for (const { m, path } of paths) drawPath(pl, path, colors[m], k, m === 'gd' ? 1.4 : 2);
      pl.dot(0, 0, 4, P.good, P.surface);
    },
    [P, paths, k],
    { aspect: 1.9, maxHeight: 300 },
  );

  const dist = paths.map(({ m, path }) => {
    const p = path[Math.min(k, path.length - 1)];
    return { m, d: Math.hypot(p[0], p[1]), done: path.length - 1 };
  });
  return (
    <Figure
      no={2}
      title="관성을 더하면"
      hint="걸음 수를 늘려 가며 세 공을 비교하세요"
      caption={
        <>
          같은 골짜기, 같은 출발점에서 세 방법이 k걸음 동안 간 길입니다(그림 1과 같은 계수). 운동량은 계수를 이 골짜기에 맞춰 가장 좋게 고르면 걸음이 커서 골짜기를 크게 가로지르지만, 그 흔들림이 매 걸음 일정한 비율로 줄고 골짜기를 따라가는 움직임은 관성으로 쌓여 가장 먼저 도착합니다. 네스테로프는 관성으로 갈 곳을 먼저 내다보고 그 자리의 기울기를 씁니다. 여기서는 걸음 크기 1/κ가 가파른 방향의 곡률과 딱 맞아 첫 걸음에 골짜기 바닥으로 내려간 뒤 바닥을 따라 미끄러집니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="opt-mk" label="조건수 κ" value={kappa} min={2} max={100} step={1} onChange={setKappa} />
        <Slider id="opt-steps" label="걸음 수 k" value={k} min={0} max={160} step={1} onChange={setK} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`조건수 ${kappa}인 골짜기에서 ${k}걸음 뒤 원점까지의 거리: ${dist.map((d) => `${METHOD_KO[d.m]} ${d.d.toExponential(1)}`).join(', ')}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {dist.map((d) => (
          <Readout key={d.m} label={`${METHOD_KO[d.m]} · 원점까지`} value={`${d.d < 1e-3 ? d.d.toExponential(1) : nf(d.d)} (끝: ${d.done}번)`} color={colors[d.m]} />
        ))}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: Newton, BFGS and gradient descent on Rosenbrock ─────────────── */

const STARTS: { id: string; p: P2 }[] = [
  { id: '(−1.2, 1)', p: [-1.2, 1] },
  { id: '(−1.5, 2)', p: [-1.5, 2] },
  { id: '(0, 0)', p: [0, 0] },
];
const ROSEN_KO: Record<RosenMethod, string> = { gd: '경사하강법 + 선 탐색', newton: '뉴턴 방법', bfgs: 'BFGS + 선 탐색' };

function RosenFigure() {
  const P = usePalette();
  const [method, setMethod] = useState<RosenMethod>('bfgs');
  const [si, setSi] = useState(0);
  const run = useMemo(() => runRosen(rosen, method, STARTS[si].p), [method, si]);
  const total = run.path.length - 1;
  const [kRaw, setK] = useState(0);
  const k = Math.min(kRaw, Math.max(0, total - 1));
  const here = run.path[k];
  const search = method === 'newton' ? null : run.searches[k];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: -2, xMax: 2, yMin: -3.5, yMax: 3, pad: { l: 26, r: 8, t: 8, b: 22 } });
      contourBands(pl, P, rosen.f, (v) => 7 + 2.2 * Math.log10(Math.max(v, 0) + 1e-3), 12);
      pl.grid({ xStep: 1, yStep: 1 });
      // the whole path faint, the part so far bold
      drawPath(pl, run.path, alpha(P.ink, 0.25), run.path.length - 1, 1);
      drawPath(pl, run.path, P.bad, k + 1, 2);
      pl.dot(1, 1, 5, P.good, P.surface);
    },
    [P, run, k],
    { aspect: 1.1, maxHeight: 380 },
  );

  const lsRef = useCanvas2D(
    (ctx, { w, h }) => {
      if (!search) {
        ctx.fillStyle = P.ink3;
        ctx.font = `13px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('뉴턴 방법은 선 탐색 없이 t = 1로 한 번에 갑니다', w / 2, h / 2);
        return;
      }
      const d: P2 = [(run.path[k + 1][0] - here[0]) / search.tried[search.tried.length - 1], (run.path[k + 1][1] - here[1]) / search.tried[search.tried.length - 1]];
      const phi = (t: number) => rosen.f([here[0] + t * d[0], here[1] + t * d[1]]);
      // show t from 0 to the largest step that matters, in a log-free linear view of the first trials
      const tMax = Math.min(1, search.tried[Math.max(0, search.tried.length - 3)] * 1.2);
      let hi = search.f0;
      for (let i = 0; i <= 60; i++) hi = Math.max(hi, Math.min(phi((tMax * i) / 60), search.f0 * 3 + 1));
      let lo = search.f0;
      for (let i = 0; i <= 60; i++) lo = Math.min(lo, phi((tMax * i) / 60));
      const span = hi - lo || 1;
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: tMax, yMin: lo - span * 0.1, yMax: hi + span * 0.05, pad: { l: 46, r: 10, t: 10, b: 24 } });
      pl.grid({ labels: true, fmt: (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toPrecision(2)) });
      pl.fn(phi, P.ink, 2);
      // sufficient-decrease line f0 + c t slope
      pl.fn((t) => search.f0 + ARMIJO_C * t * search.slope, P.accent, 1.5, { dash: [5, 4] });
      search.tried.forEach((t, i) => {
        if (t > tMax * 1.001) return;
        const ok = i === search.tried.length - 1;
        pl.dot(t, Math.min(search.values[i], pl.yMax), 4, ok ? P.good : P.bad, P.surface);
      });
      pl.text('t (걸음 크기)', tMax, lo - span * 0.1, P.ink2, { align: 'right', dy: -10, font: `500 11px ${P.fontBody}` });
    },
    [P, run, k, search],
    { aspect: 1.9, maxHeight: 220 },
  );

  return (
    <Figure
      no={3}
      title="바나나 골짜기: 뉴턴, BFGS, 경사하강법"
      hint="방법과 출발점을 바꾸고 걸음을 넘겨 보세요"
      caption={
        <>
          로젠브록 함수 <M>{'f = (1-x)^2 + 100(y - x^2)^2'}</M>는 최솟값 (1, 1)이 휘어진 좁은 골짜기 바닥에 있어 최적화 방법을 시험할 때 자주 씁니다. 위: 기울기 크기가 <M>{'10^{-6}'}</M>보다 작아질 때까지의 전체 길(흐린 선)과 k걸음째까지(빨간 선). 아래: k번째 걸음의 선 탐색. 검은 곡선은 탐색 방향을 따라 간 f, 파란 점선은 충분히 줄었다고 인정하는 아르미호 기준선이고, 빨간 점은 퇴짜 맞은 걸음, 초록 점은 받아들인 걸음입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="방법" value={method} onChange={(v) => { setMethod(v); setK(0); }} options={(['gd', 'newton', 'bfgs'] as RosenMethod[]).map((m) => ({ value: m, label: m === 'gd' ? '경사하강법' : m === 'newton' ? '뉴턴' : 'BFGS' }))} />
        <Seg label="출발점" value={si} onChange={(v) => { setSi(v); setK(0); }} options={STARTS.map((s, i) => ({ value: i, label: s.id }))} />
        <Slider id="opt-rk" label="걸음 k" value={k} min={0} max={Math.max(0, total - 1)} step={1} onChange={setK} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${ROSEN_KO[method]}이 출발점 ${STARTS[si].id}에서 ${total}걸음 만에 최솟값 (1, 1)에 도착합니다. 지금 ${k}걸음째 위치는 (${nf(here[0])}, ${nf(here[1])})입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div ref={lsRef.wrapRef} className="canvas-box" role="img" aria-label={search ? `${k}번째 걸음의 선 탐색: 걸음 크기를 ${search.tried.length}번 시도해 t = ${search.tried[search.tried.length - 1]}을 받아들였습니다.` : '뉴턴 방법은 선 탐색을 하지 않습니다.'}>
        <canvas ref={lsRef.canvasRef} />
      </div>
      {search && (
        <div className="opt-tries" aria-label="시도한 걸음 크기">
          {search.tried.map((t, i) => (
            <span key={i} data-ok={i === search.tried.length - 1 || undefined} data-no={i < search.tried.length - 1 || undefined}>
              t = {t >= 0.01 ? t : t.toExponential(1)}
            </span>
          ))}
        </div>
      )}
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Readout label="전체 걸음 수" value={`${fmtInt(total)}번`} />
        <Readout label="함수 계산 횟수" value={`${fmtInt(run.fEvals)}번`} />
        <Readout label={`${k}걸음째 f`} value={rosen.f(here).toExponential(2)} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: stochastic gradient descent ─────────────── */

const SETTINGS: { id: string; eta: number; sch: Schedule; label: string }[] = [
  { id: 'c1', eta: 0.1, sch: 'const', label: 'η = 0.1 고정' },
  { id: 'c2', eta: 0.02, sch: 'const', label: 'η = 0.02 고정' },
  { id: 'd', eta: 0.1, sch: 'decay', label: 'η = 0.1에서 줄이기' },
];
const STEPS = 2000;

function SgdFigure() {
  const P = usePalette();
  const [seed, setSeed] = useState(0);
  const data = useMemo(() => lineData(200, 0.3, rng(4 + seed * 17)), [seed]);
  const runs = useMemo(() => SETTINGS.map((s) => ({ ...s, path: sgd(data, STEPS, s.eta, s.sch, rng(9 + seed * 31)) })), [data, seed]);
  const best = mse(data, data.best);
  const colors = [P.bad, P.accent, P.good];
  const tail = runs.map((r) => r.path.slice(-200).reduce((s, p) => s + mse(data, p), 0) / 200);

  const scatter = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: 1, yMin: 0, yMax: 4, pad: { l: 28, r: 8, t: 8, b: 22 } });
      pl.grid({ xStep: 0.5, yStep: 1 });
      data.xs.forEach((x, i) => pl.dot(x, data.ys[i], 2, alpha(P.ink3, 0.7)));
      pl.fn((x) => data.best[0] * x + data.best[1], P.ink, 2, { dash: [5, 4] });
      runs.forEach((r, i) => {
        const [a, b] = r.path[r.path.length - 1];
        pl.fn((x) => a * x + b, colors[i], 2);
      });
    },
    [P, data, runs],
    { aspect: 1.3, maxHeight: 260 },
  );

  const curve = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 44, r: 10, t: 10, b: 26 };
      const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const lo = Math.log10(best * 0.9), hi = Math.log10(5);
      const X = (k: number) => pad.l + (k / STEPS) * pw;
      const Y = (v: number) => pad.t + (1 - (Math.log10(Math.max(v, best * 0.9)) - lo) / (hi - lo)) * ph;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of [0.1, 0.2, 0.5, 1, 2]) {
        const y = Math.round(Y(v)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(pad.l + pw, y);
        ctx.stroke();
        ctx.fillText(String(v), pad.l - 5, y);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const k of [0, 500, 1000, 1500, 2000]) ctx.fillText(String(k), X(k), pad.t + ph + 5);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = P.ink;
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(best));
      ctx.lineTo(pad.l + pw, Y(best));
      ctx.stroke();
      ctx.setLineDash([]);
      runs.forEach((r, i) => {
        ctx.strokeStyle = colors[i];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let k = 0; k <= STEPS; k += 4) {
          const v = mse(data, r.path[k]);
          if (k) ctx.lineTo(X(k), Y(v));
          else ctx.moveTo(X(k), Y(v));
        }
        ctx.stroke();
      });
      ctx.fillStyle = P.ink2;
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('평균 제곱 오차 (로그)', pad.l + 4, pad.t + 3);
    },
    [P, data, runs, best],
    { aspect: 1.3, maxHeight: 260 },
  );

  return (
    <Figure
      no={4}
      title="한 점씩 보고 고치는 확률적 경사하강법"
      hint="다른 데이터로도 돌려 보세요"
      caption={
        <>
          y = 2x + 1에 잡음(표준편차 0.3)을 더한 점 200개에 직선을 맞춥니다. 한 걸음마다 점 하나만 무작위로 골라 그 점의 오차로 기울기를 어림합니다. 줄이는 설정은 <M>{'\\eta_k = 0.1/(1 + k/100)'}</M>입니다. 검은 점선은 최소제곱으로 단번에 구한 가장 좋은 직선과 그 오차입니다. 씨앗이 정해진 난수라 같은 데이터에서는 늘 같은 결과가 나옵니다.
        </>
      }
    >
      <div className="opt-two">
        <div>
          <div className="opt-panel-title">데이터와 2,000걸음 뒤의 직선</div>
          <div ref={scatter.wrapRef} className="canvas-box" role="img" aria-label={`잡음 섞인 점 200개와 세 설정이 2000걸음 뒤에 얻은 직선, 그리고 최소제곱 직선.`}>
            <canvas ref={scatter.canvasRef} />
          </div>
        </div>
        <div>
          <div className="opt-panel-title">걸음에 따른 평균 제곱 오차</div>
          <div ref={curve.wrapRef} className="canvas-box" role="img" aria-label={`마지막 200걸음의 평균 오차: ${SETTINGS.map((s, i) => `${s.label} ${tail[i].toFixed(4)}`).join(', ')}, 최소제곱 ${best.toFixed(4)}.`}>
            <canvas ref={curve.canvasRef} />
          </div>
        </div>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {SETTINGS.map((s, i) => (
          <Readout key={s.id} label={`${s.label} · 마지막 200걸음`} value={tail[i].toFixed(4)} color={colors[i]} />
        ))}
        <Readout label="최소제곱 (가장 좋음)" value={best.toFixed(4)} />
      </div>
      <div className="btn-row">
        <Button small onClick={() => setSeed((s) => s + 1)}>
          다른 데이터로
        </Button>
        {seed > 0 && (
          <Button small onClick={() => setSeed(0)}>
            처음 데이터로
          </Button>
        )}
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Optimization() {
  const it20 = { gd: itersQuad(20, 'gd', START), mom: itersQuad(20, 'momentum', START), nes: itersQuad(20, 'nesterov', START) };
  const nw = newton1d(0.3, 4);
  const nw2 = newton1d(0.8, 4);
  const pen = [1, 10, 100, 1000].map((mu) => ({ mu, ...penalty(mu) }));
  return (
    <>
      <h2>가장 낮은 곳을 찾는 일</h2>
      <p>
        함수의 최솟값을 찾는 <T en="optimization">최적화</T>는 수치해석에서 가장 널리 쓰이는 계산입니다. 신경망을 학습시키는 일은 손실 함수의 최솟값을 찾는 일이고(<a href={lessonHref('ai-basics', 'gradient-descent')}>경사하강법</a>), 비행기 날개의 모양이나 배송 경로를 정하는 일도 그렇습니다. <a href={lessonHref('math-multivariable', 'optimization')}>다변수 미적분</a>에서 경사하강법이 좁은 골짜기에서 지그재그로 느려지는 것과 라그랑주 승수를 보았습니다. 이 장에서는 <strong>몇 걸음이 걸리는지</strong>를 재고, 그 수를 줄이는 방법들을 비교합니다.
      </p>
      <p>
        출발점은 가장 단순한 경우인 이차 함수입니다. 최솟값 근처에서 매끄러운 함수는 모두 이차 함수처럼 보이므로, 여기서의 결과가 일반적인 경우의 수렴 속도를 정합니다. 축을 돌려 두면 이차 함수는 <M>{'\\tfrac12(x^2 + \\kappa y^2)'}</M> 꼴이 되고, 헤세 행렬의 가장 큰 고윳값과 가장 작은 고윳값의 비인 κ가 <T en="condition number">조건수</T>입니다. κ가 크면 한 방향으로는 가파르고 다른 방향으로는 평평한 좁은 골짜기입니다.
      </p>
      <KappaFigure />
      <p>
        경사하강법은 한 걸음마다 오차를 <M>{'(\\kappa - 1)/(\\kappa + 1)'}</M>배로 줄입니다. κ = 20이면 0.905배라 원점에서 <M>{'10^{-6}'}</M> 안으로 들어오기까지 {it20.gd}걸음이 걸리고, 이것은 그 비율로 계산한 예측과 정확히 같습니다. κ가 클 때 이 비율은 <M>{'1 - 2/\\kappa'}</M>에 가까우므로, 반복 횟수는 κ에 비례합니다. 오른쪽 그림에서 κ가 10배 될 때 경사하강법의 반복 횟수도 10배(κ = 100에서 762번, 1000에서 7,617번)가 됩니다.
      </p>
      <MB note="κ가 클 때. ε은 목표 정확도.">{'\\text{경사하강법의 반복 횟수} \\approx \\frac{\\kappa}{2}\\ln\\frac{1}{\\varepsilon}'}</MB>

      <h2>관성: 운동량과 네스테로프</h2>
      <p>
        좁은 골짜기에서 경사하강법이 느린 것은 기울기가 거의 골짜기를 가로지르는 방향을 가리키고, 걸음 크기는 가파른 방향에 맞춰 작게 잡아야 해서 완만한 방향으로는 조금밖에 못 가기 때문입니다. 공이 골짜기를 굴러 내려가듯 지난 걸음의 방향을 일정 비율 이어 가면, 완만한 방향으로는 같은 방향의 걸음이 계속 쌓여 속도가 붙습니다. 이것이 <T en="momentum, heavy ball">운동량</T> 방법입니다.
      </p>
      <MB>{'x_{k+1} = x_k - \\eta \\nabla f(x_k) + \\beta\\,(x_k - x_{k-1})'}</MB>
      <MomentumFigure />
      <p>
        κ = 20에서 경사하강법이 {it20.gd}걸음 걸리는 일을 운동량은 {it20.mom}걸음, 네스테로프는 {it20.nes}걸음에 해냅니다. 그림 1의 오른쪽 그래프에서 두 방법의 선은 기울기가 절반입니다. 반복 횟수가 κ가 아니라 <M>{'\\sqrt{\\kappa}'}</M>에 비례하기 때문입니다. κ = 1000이면 경사하강법 7,617번, 운동량 321번, 네스테로프 565번입니다. 이 그림의 계수는 이차 함수에 맞춘 이론상 가장 좋은 값이라 운동량이 앞서지만, 일반 함수에서 수렴이 보장되는 쪽은 <T en="Nesterov accelerated gradient">네스테로프 가속</T>입니다. 신경망 학습에서 쓰는 SGD의 momentum 옵션과 Adam이 이 생각을 이어받았습니다.
      </p>

      <h2>곡률을 쓰는 방법: 뉴턴과 BFGS</h2>
      <p>
        경사하강법은 기울기만 보고, 골짜기가 얼마나 휘었는지는 모릅니다. <T en="Newton's method">뉴턴 방법</T>은 지금 자리에서 함수를 이차 함수로 근사하고 그 이차 함수의 최솟값으로 단번에 갑니다. 이차 근사에는 헤세 행렬 H가 들어가므로, 한 걸음은 연립방정식 하나를 푸는 일입니다.
      </p>
      <MB>{'H(x_k)\\, d_k = -\\nabla f(x_k), \\qquad x_{k+1} = x_k + d_k'}</MB>
      <p>
        함수가 정말 이차 함수라면 근사가 정확하므로 어떤 κ에서도 <strong>한 걸음</strong>에 끝납니다. 최솟값 근처에서는 오차가 매 걸음 제곱이 되는 <T en="quadratic convergence">2차 수렴</T>을 합니다. 그림 3에서 로젠브록 함수에 뉴턴 방법을 (−1.2, 1)에서 돌리면 처음에는 (0.76, −3.18)까지 크게 빗나갔다가, 그다음부터 최솟값까지의 거리가 0.48, 0.056, 9.6×10⁻⁶, 1.9×10⁻¹¹로 줄어 여섯 걸음 만에 끝납니다.
      </p>
      <RosenFigure />
      <p>
        같은 출발점에서 경사하강법은 13,756걸음이 걸립니다. 처음 100걸음 만에 (0.93, 0.87)까지 가지만, 거기서부터는 휘어진 골짜기 바닥을 따라 아주 조금씩 기어갑니다. 한 걸음마다 선 탐색으로 함수를 평균 9.9번 계산해 모두 136,799번을 계산했습니다.
      </p>
      <p>
        뉴턴 방법의 약점은 비용과 위험입니다. 변수가 n개면 헤세 행렬은 n×n이라, 한 걸음에 n²개의 이계 도함수를 구하고 약 <M>{'n^3/3'}</M>의 연산으로 연립방정식을 풀어야 합니다. 그리고 헤세 행렬이 양의 정부호가 아니면 이차 근사에 최솟값이 없어서, 뉴턴 방법은 내려가는 대신 극댓값이나 안장점으로 갑니다. 기울기가 0인 점을 찾는 방법이기 때문입니다. <M>{'f(x) = x^4/4 - x^2/2'}</M>는 x = ±1에서 최소, 0에서 최대인데, x = 0.8에서 출발하면 {nf(nw2[1], 4)}, {nf(nw2[2], 4)}, {nf(nw2[3], 6)}를 거쳐 최솟값 1에 가지만, x = 0.3(<M>{"f''"}</M>가 음수인 곳)에서 출발하면 {nf(nw[1], 4)}, {nf(nw[2], 6)}을 거쳐 <strong>최댓값 0</strong>으로 갑니다.
      </p>
      <p>
        <T en="quasi-Newton">준뉴턴</T> 방법은 이 둘의 중간입니다. 헤세 행렬을 직접 계산하지 않고, 걸음마다 기울기가 얼마나 바뀌었는지를 보고 헤세 행렬의 역행렬 근사를 고쳐 나갑니다. 가장 많이 쓰는 것이 <T en="BFGS">BFGS</T>로, 근사가 늘 양의 정부호로 유지되어 언제나 내려가는 방향을 줍니다. 로젠브록에서는 34걸음(함수 계산 53번)이 걸렸습니다. 뉴턴의 6걸음보다 많지만 이계 도함수가 전혀 필요 없고, 걸음 수로 경사하강법보다 400배 빠릅니다. 변수가 수천에서 수백만 개인 문제에는 최근 몇 걸음의 정보만 쓰는 L-BFGS를 씁니다.
      </p>
      <Callout kind="note" label="선 탐색">
        방향을 정한 뒤 얼마나 갈지는 <T en="backtracking line search">되돌아가는 선 탐색</T>으로 정했습니다. t = 1에서 시작해, 함수값이 기울기로 예측한 감소량의 일부(<M>{'c = 10^{-4}'}</M>) 이상 줄어들 때까지 t를 반씩 줄입니다. 이 조건을 <T en="Armijo condition">아르미호 조건</T>이라고 합니다. 첫 걸음에서는 기울기가 커서 t = 1부터 열한 번 줄여 t ≈ 0.00098을 받아들였습니다. BFGS는 헤세 근사가 좋아지면서 34걸음 중 27걸음에서 t = 1이 바로 받아들여졌는데, 이것이 걸음 크기를 알아서 맞추는 곡률 정보의 힘입니다.
      </Callout>

      <h2>데이터가 많을 때: 확률적 경사하강법</h2>
      <p>
        기계 학습의 손실 함수는 데이터 점마다의 오차를 평균한 것입니다. 데이터가 수백만 개면 기울기 한 번을 정확히 계산하는 데 모든 점을 훑어야 합니다. <T en="stochastic gradient descent">확률적 경사하강법</T>(SGD)은 점 하나(또는 작은 묶음)만 무작위로 골라 기울기를 어림하고 바로 한 걸음 갑니다. 어림은 평균적으로 맞지만 걸음마다 흔들립니다.
      </p>
      <SgdFigure />
      <p>
        처음 데이터에서 최소제곱의 오차는 0.0843입니다. 걸음 크기를 0.1로 고정하면 빨리 내려가지만(100걸음에 0.112) 끝까지 흔들려 마지막 200걸음의 평균 오차가 0.1013에 머뭅니다. 0.02로 고정하면 흔들림은 작지만 처음이 느려서 100걸음에 0.150입니다. 걸음 크기를 처음에는 크게, 점점 작게 줄이면 둘의 장점을 모두 얻어 0.0855까지 내려갑니다. 신경망을 학습시킬 때 <a href={lessonHref('ai-deep-learning', 'regularization')}>학습률 스케줄</a>을 쓰는 이유가 이것입니다.
      </p>

      <h2>제약이 있을 때: 벌점 방법</h2>
      <p>
        "x + y = 1을 지키면서 <M>{'(x-2)^2 + (y-1)^2'}</M>를 가장 작게" 같은 제약 최적화는 라그랑주 승수로 풀 수 있지만, 수치적으로는 제약을 어기는 만큼 벌점을 더해 제약 없는 문제로 바꾸는 <T en="penalty method">벌점 방법</T>이 간단합니다. <M>{'f + \\mu\\,(x + y - 1)^2'}</M>를 μ를 키워 가며 최소화하면, 해가 제약을 지키는 참답 (1, 0)으로 다가갑니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>벌점 계수 μ</th>
              <th>벌점 문제의 해</th>
              <th>제약 위반 x + y − 1</th>
            </tr>
          </thead>
          <tbody>
            {pen.map((r) => (
              <tr key={r.mu}>
                <td className="mono">{fmtInt(r.mu)}</td>
                <td className="mono">
                  ({r.p[0].toFixed(4)}, {r.p[1].toFixed(4)})
                </td>
                <td className="mono">{r.violation.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        μ를 10배 할 때마다 위반이 10분의 1로 줄지만, μ가 클수록 벌점 문제의 골짜기가 좁아져 조건수가 커집니다. 그래서 실제로는 라그랑주 승수를 함께 추정해 μ를 너무 키우지 않아도 되는 증강 라그랑주 방법이나, 제약을 직접 다루는 내점법을 씁니다.
      </p>

      <Callout kind="key">
        이차 함수에서 경사하강법의 반복 횟수는 조건수 κ에 비례하고, 운동량과 네스테로프 가속은 <M>{'\\sqrt{\\kappa}'}</M>에 비례합니다. 뉴턴 방법은 헤세 행렬로 곡률을 써서 최솟값 근처에서 2차 수렴하지만, 한 걸음이 비싸고 헤세 행렬이 양의 정부호가 아니면 극댓값이나 안장점으로 갈 수 있습니다. BFGS는 기울기의 변화로 곡률을 어림해 이계 도함수 없이 빠르게 수렴하고, 선 탐색이 걸음 크기를 정합니다. 데이터가 많으면 확률적 경사하강법을 쓰고, 걸음 크기를 줄여 가야 잡음 속에서도 최솟값에 다가갑니다.
      </Callout>
      <Quiz
        q="조건수가 400인 이차 함수에서 경사하강법이 4,000걸음 걸렸다. 같은 함수에서 잘 맞춘 운동량 방법은 대략 몇 걸음이 걸릴까?"
        options={['약 4,000걸음 (방향만 바뀔 뿐 빨라지지 않는다)', '약 200걸음', '약 10걸음', '1걸음']}
        answer={1}
        explain={<>경사하강법의 반복 횟수는 κ에, 운동량은 √κ에 비례합니다. κ = 400이면 √κ = 20이므로 대략 4,000 × 20 / 400 = 200걸음입니다(상수는 조금 다르지만 크기는 이 정도입니다). 그림 1에서 κ = 100일 때 경사하강법 762번, 운동량 95번이었던 것과 같은 비율입니다. 1걸음에 끝나는 것은 헤세 행렬을 쓰는 뉴턴 방법입니다.</>}
      />
    </>
  );
}
