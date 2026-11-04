import { useMemo, useState } from 'react';
import { Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { lessonHref } from '../../../index';
import { Reroll, bars, label, pmfDots, polyline, useMathColors } from './parts';
import { geomPmf, harmonic, pct, shuffleInPlace } from './prob';
import './probability.css';

/* ─────────────── Figure 1: comparisons made by quicksort ─────────────── */

/** Quicksort (Lomuto partition) on a copy of `a`, returning the number of comparisons. */
function quicksortComparisons(a: number[], randomPivot: boolean, r: () => number): number {
  const x = a.slice();
  let comps = 0;
  const stack: [number, number][] = [[0, x.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    if (lo >= hi) continue;
    if (randomPivot) {
      const k = lo + Math.floor(r() * (hi - lo + 1));
      [x[k], x[hi]] = [x[hi], x[k]];
    } else {
      [x[lo], x[hi]] = [x[hi], x[lo]]; // "first element" pivot, moved to the end for Lomuto
    }
    const pv = x[hi];
    let i = lo;
    for (let j = lo; j < hi; j++) {
      comps++;
      if (x[j] < pv) {
        [x[i], x[j]] = [x[j], x[i]];
        i++;
      }
    }
    [x[i], x[hi]] = [x[hi], x[i]];
    stack.push([lo, i - 1], [i + 1, hi]);
  }
  return comps;
}
const expectedComparisons = (n: number) => 2 * (n + 1) * harmonic(n) - 4 * n;
const RUNS = 300;

function QuicksortFigure() {
  const P = usePalette();
  const [c1, c2, c3] = useMathColors(P);
  const [n, setN] = useState(200);
  const [order, setOrder] = useState<'random' | 'sorted'>('sorted');
  const [pivot, setPivot] = useState<'first' | 'random'>('random');
  const [seed, setSeed] = useState(1);

  const counts = useMemo(() => {
    const r = rng(seed * 5167 + n);
    const sorted = Array.from({ length: n }, (_, i) => i);
    if (order === 'sorted' && pivot === 'first') {
      const c = quicksortComparisons(sorted, false, r);
      return new Array(RUNS).fill(c); // the same input and the same choices: the same count every time
    }
    return Array.from({ length: RUNS }, () => quicksortComparisons(order === 'sorted' ? sorted : shuffleInPlace(sorted.slice(), r), pivot === 'random', r));
  }, [n, order, pivot, seed]);
  const E = expectedComparisons(n);
  const worst = (n * (n - 1)) / 2;
  const avg = counts.reduce((a, b) => a + b, 0) / RUNS;
  const mx = Math.max(...counts);
  const mn = Math.min(...counts);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const xMax = Math.max(mx, 1.6 * E) * 1.04;
      const BINS = 48;
      const bw = xMax / BINS;
      const hc = new Array(BINS + 1).fill(0);
      for (const c of counts) hc[Math.min(BINS, Math.floor(c / bw))]++;
      const freq = hc.map((c) => c / RUNS);
      const yMax = Math.max(...freq) * 1.2;
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax, yMin: 0, yMax, pad: { l: 44, r: 16, t: 14, b: 28 } });
      plot.grid({ axes: false, yLabel: `정렬 ${RUNS}번 중 비율`, fmt: (v) => (v > 0 && v < 1 ? `${Math.round(v * 100)}%` : v >= 1000 ? `${Number.isInteger(v / 1000) ? v / 1000 : (v / 1000).toFixed(1)}k` : String(Math.round(v))) });
      ctx.fillStyle = alpha(c1, 0.75);
      freq.forEach((f, i) => {
        if (!f) return;
        const l = plot.X(i * bw);
        const r2 = plot.X((i + 1) * bw);
        ctx.fillRect(l + 0.5, plot.Y(f), Math.max(2, r2 - l - 1), plot.Y(0) - plot.Y(f));
      });
      plot.line(E, 0, E, yMax, c3, 2);
      plot.text(`기댓값 ≈ 2n ln n: ${Math.round(E).toLocaleString('ko-KR')}`, E, yMax * 0.9, c3, { dx: 6, bg: alpha(P.surface, 0.85), font: `600 11px ${P.fontBody}` });
      if (worst <= xMax) {
        plot.line(worst, 0, worst, yMax, c2, 2, [5, 4]);
        plot.text(`최악 n(n−1)/2`, worst, yMax * 0.72, c2, { align: 'right', dx: -6, bg: alpha(P.surface, 0.85), font: `600 11px ${P.fontBody}` });
      }
    },
    [P, c1, c2, c3, counts, E, worst, mx],
    { aspect: 2.2, maxHeight: 300, minHeight: 220 },
  );

  return (
    <Figure
      no={1}
      title="퀵 정렬의 비교 횟수"
      hint="입력 순서와 피벗 고르는 법을 바꿔 보세요"
      caption={<>같은 크기의 배열을 {RUNS}번 정렬하며 원소끼리 비교한 횟수를 세어 히스토그램으로 그렸습니다. 첫 원소를 피벗으로 쓰면 이미 정렬된 입력에서 매번 최악인 n(n−1)/2번을 비교합니다. 피벗을 무작위로 고르면 입력이 무엇이든 비교 횟수가 기댓값 근처에 좁게 몰립니다.</>}
    >
      <div className="controls row">
        <Slider id="qs-n" label="배열 크기 n" value={n} min={20} max={400} step={10} onChange={setN} />
        <Seg label="입력" value={order} onChange={setOrder} options={[{ value: 'sorted', label: '이미 정렬됨' }, { value: 'random', label: '무작위 순서' }]} />
        <Seg label="피벗" value={pivot} onChange={setPivot} options={[{ value: 'first', label: '첫 원소' }, { value: 'random', label: '무작위' }]} />
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Reroll onClick={() => setSeed((s) => s + 1)} />
        </div>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`퀵 정렬 비교 횟수의 분포. 평균 ${Math.round(avg)}번, 이론 기댓값 ${Math.round(E)}번, 최악 ${worst}번.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        <Readout label={`평균 (${RUNS}번)`} value={Math.round(avg).toLocaleString('ko-KR')} color="var(--c-math-1)" />
        <Readout label="가장 적게 / 많이" value={`${mn.toLocaleString('ko-KR')} / ${mx.toLocaleString('ko-KR')}`} />
        <Readout label="이론 2(n+1)Hₙ − 4n" value={Math.round(E).toLocaleString('ko-KR')} color="var(--c-math-3)" />
        <Readout label="최악 n(n−1)/2" value={worst.toLocaleString('ko-KR')} color="var(--c-math-2)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: when are two elements compared? ─────────────── */

const ROW = 14;
const PAIR_RUNS = 2000;

function PairFigure() {
  const [i, setI] = useState(3);
  const [j, setJ] = useState(8);
  const [seed, setSeed] = useState(1);
  const lo = Math.min(i, j);
  const hi = Math.max(i, j);
  const firsts = useMemo(() => {
    // the first pivot that lands in [lo, hi] decides: it is uniform over the window
    const r = rng(seed * 811 + lo * 31 + hi);
    const c = new Array(ROW + 1).fill(0);
    for (let t = 0; t < PAIR_RUNS; t++) c[lo + Math.floor(r() * (hi - lo + 1))]++;
    return c;
  }, [lo, hi, seed]);
  const hit = firsts[lo] + (hi > lo ? firsts[hi] : 0);
  const maxC = Math.max(...firsts);
  const theory = hi > lo ? 2 / (hi - lo + 1) : 1;

  return (
    <Figure
      no={2}
      title="두 원소가 비교될 확률"
      hint="i와 j를 고르고, 다시 굴려 보세요"
      caption={<>정렬된 순서로 1부터 {ROW}까지 늘어놓았습니다. 두 값 i와 j가 비교되는지는 i부터 j까지의 구간(진한 칸)에서 <strong>처음으로</strong> 피벗이 된 값이 정합니다. 그것이 i나 j면 둘은 비교되고, 가운데 값이면 둘은 서로 다른 쪽으로 갈라져 영영 만나지 않습니다. 막대는 {PAIR_RUNS.toLocaleString('ko-KR')}번 정렬했을 때 구간에서 처음 피벗이 된 값의 횟수입니다.</>}
    >
      <div className="controls row">
        <Slider id="pr-i" label="i" value={i} min={1} max={ROW} step={1} onChange={setI} color="var(--c-math-1)" />
        <Slider id="pr-j" label="j" value={j} min={1} max={ROW} step={1} onChange={setJ} color="var(--c-math-1)" />
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Reroll onClick={() => setSeed((s) => s + 1)} />
        </div>
      </div>
      <div className="pr-pairrow" role="img" aria-label={`${lo}부터 ${hi}까지 구간에서 처음 피벗이 된 횟수. ${lo}나 ${hi}가 먼저 뽑혀 비교된 비율 ${pct(hit / PAIR_RUNS)}, 이론 ${pct(theory)}.`}>
        {Array.from({ length: ROW }, (_, k) => {
          const v = k + 1;
          const inWin = v >= lo && v <= hi;
          const end = v === lo || v === hi;
          return (
            <div key={v} className="pr-paircol" data-win={inWin || undefined} data-end={end || undefined}>
              <div className="pr-pairbar">{inWin && <span style={{ height: `${(firsts[v] / maxC) * 100}%` }} />}</div>
              <div className="pr-paircell mono">{v}</div>
            </div>
          );
        })}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <Readout label="구간 크기 j − i + 1" value={String(hi - lo + 1)} />
        <Readout label="실험: 비교된 비율" value={pct(hit / PAIR_RUNS)} color="var(--c-math-1)" />
        <Readout label="이론 2 / (j − i + 1)" value={pct(theory)} color="var(--c-math-3)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: balls into bins ─────────────── */

function BinsFigure() {
  const P = usePalette();
  const [c1, c2, c3] = useMathColors(P);
  const [n, setN] = useState(60);
  const [m, setM] = useState(40);
  const [mode, setMode] = useState<'one' | 'two'>('one');
  const [seed, setSeed] = useState(1);

  const loads = useMemo(() => {
    const r = rng(seed * 4241 + n * 13 + m);
    const L = new Array(m).fill(0);
    for (let k = 0; k < n; k++) {
      const a = Math.floor(r() * m);
      const b = Math.floor(r() * m); // drawn in both modes so the first choices match
      L[mode === 'two' && L[b] < L[a] ? b : a]++;
    }
    return L;
  }, [n, m, mode, seed]);
  const maxLoad = Math.max(...loads);
  const empty = loads.filter((x) => x === 0).length;
  const pairs = loads.reduce((s, x) => s + (x * (x - 1)) / 2, 0);
  let noColl = 1;
  for (let k = 0; k < n; k++) noColl *= Math.max(0, (m - k) / m);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yMax = Math.max(6, maxLoad + 1);
      const plot = new Plot(ctx, w, h, P, { xMin: -0.5, xMax: m - 0.5, yMin: 0, yMax, pad: { l: 30, r: 10, t: 12, b: 22 } });
      plot.grid({ axes: false, xStep: m > 50 ? 10 : 5, yStep: yMax > 12 ? 2 : 1, fmt: (v) => String(Math.round(v)) });
      const cw = plot.X(1) - plot.X(0);
      const ch = plot.Y(0) - plot.Y(1);
      loads.forEach((L, b) => {
        for (let k = 0; k < L; k++) {
          const x = plot.X(b) - cw * 0.4;
          const y = plot.Y(k + 1);
          ctx.fillStyle = L === maxLoad ? c1 : k > 0 ? alpha(c2, 0.85) : alpha(c2, 0.5);
          ctx.fillRect(x, y + 1, Math.max(1, cw * 0.8), Math.max(1, ch - 2));
        }
        if (L === 0 && cw > 5) {
          ctx.fillStyle = alpha(P.ink3, 0.35);
          ctx.fillRect(plot.X(b) - cw * 0.4, plot.Y(0) - 2, Math.max(1, cw * 0.8), 2);
        }
      });
      plot.line(-0.5, n / m, m - 0.5, n / m, c3, 1.6, [5, 4]);
      plot.text(`평균 n/m = ${(n / m).toFixed(2)}`, m - 0.5, n / m, c3, { align: 'right', dx: -2, dy: -11, bg: alpha(P.surface, 0.9), font: `600 11px ${P.fontBody}` });
    },
    [P, c1, c2, c3, loads, maxLoad, n, m],
    { aspect: 2.3, maxHeight: 280, minHeight: 200 },
  );

  return (
    <Figure
      no={3}
      title="공 던지기: 해시 테이블의 버킷"
      hint="키 수와 버킷 수를 바꾸고, '두 개 중 고르기'를 켜 보세요"
      caption={<>키 n개를 버킷 m개에 무작위로 해시합니다. 칸 하나가 키 하나이고, 가장 많이 찬 버킷은 진하게 칠했습니다. "두 개 중 고르기"는 키마다 해시 함수 두 개로 버킷 두 곳을 보고 덜 찬 쪽에 넣습니다. 선택지를 하나만 늘렸는데 가장 긴 버킷이 눈에 띄게 짧아집니다.</>}
    >
      <div className="controls row">
        <Slider id="bb-n" label="키 n" value={n} min={1} max={200} step={1} onChange={setN} />
        <Slider id="bb-m" label="버킷 m" value={m} min={10} max={100} step={1} onChange={setM} />
        <Seg label="넣는 법" value={mode} onChange={setMode} options={[{ value: 'one', label: '해시 하나' }, { value: 'two', label: '두 개 중 고르기' }]} />
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Reroll onClick={() => setSeed((s) => s + 1)} />
        </div>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`버킷 ${m}개에 키 ${n}개. 가장 긴 버킷 ${maxLoad}개, 빈 버킷 ${empty}개, 충돌 쌍 ${pairs}개.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <Readout label="가장 긴 버킷" value={`${maxLoad}개`} color="var(--c-math-1)" />
        <Readout label="빈 버킷 (기댓값)" value={`${empty}개 (${(m * Math.pow(1 - 1 / m, n)).toFixed(1)})`} />
        <Readout label="충돌 쌍 (기댓값)" value={`${pairs}개 (${((n * (n - 1)) / 2 / m).toFixed(1)})`} />
        <Readout label="충돌이 하나라도 있을 확률" value={pct(1 - noColl)} />
      </div>
      <Legend
        items={[
          { color: 'var(--c-math-2)', label: '키', shape: 'sq' },
          { color: 'var(--c-math-1)', label: '가장 긴 버킷', shape: 'sq' },
          { color: 'var(--c-math-3)', label: '버킷당 평균', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 4: Monte Carlo versus Las Vegas ─────────────── */

const PI_MAX = 20000;
const LV_RUNS = 1000;

function McLvFigure() {
  const P = usePalette();
  const [c1, c2, c3] = useMathColors(P);
  const [mode, setMode] = useState<'mc' | 'lv'>('mc');
  const [N, setN] = useState(2000);
  const [frac1, setFrac1] = useState(0.5);
  const [seed, setSeed] = useState(1);

  const pts = useMemo(() => {
    const r = rng(seed * 1499 + 7);
    return Array.from({ length: PI_MAX }, () => [r(), r()] as [number, number]);
  }, [seed]);
  const running = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    let inside = 0;
    for (let k = 0; k < N; k++) {
      const [x, y] = pts[k];
      if (x * x + y * y <= 1) inside++;
      if (k >= 9 && (k < 200 || k % Math.max(1, Math.floor(N / 400)) === 0 || k === N - 1)) {
        xs.push(k + 1);
        ys.push((4 * inside) / (k + 1));
      }
    }
    return { xs, ys, est: (4 * inside) / N };
  }, [pts, N]);
  const probes = useMemo(() => {
    const r = rng(seed * 2711 + Math.round(frac1 * 100));
    return Array.from({ length: LV_RUNS }, () => {
      let k = 1;
      while (r() >= frac1) k++;
      return k;
    });
  }, [frac1, seed]);
  const lvAvg = probes.reduce((a, b) => a + b, 0) / LV_RUNS;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      if (mode === 'mc') {
        const side = Math.min(h - 24, w * 0.45);
        const x0 = 10;
        const y0 = (h - side) / 2;
        ctx.strokeStyle = P.lineStrong;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, side, side);
        ctx.strokeStyle = c3;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x0, y0 + side, side, -Math.PI / 2, 0);
        ctx.stroke();
        const shown = Math.min(N, 6000);
        const rad = N > 3000 ? 1 : 1.6;
        for (let k = 0; k < shown; k++) {
          const [x, y] = pts[k];
          ctx.fillStyle = x * x + y * y <= 1 ? alpha(c1, 0.75) : alpha(c2, 0.75);
          ctx.fillRect(x0 + x * side - rad / 2, y0 + side - y * side - rad / 2, rad, rad);
        }
        const left = x0 + side + 16;
        const sub = ctx.getTransform();
        ctx.save();
        ctx.translate(left, 0);
        const plot = new Plot(ctx, w - left, h, P, { xMin: 1, xMax: Math.log10(PI_MAX), yMin: 2.6, yMax: 3.7, pad: { l: 36, r: 10, t: 12, b: 26 } });
        plot.grid({ xStep: 1, yStep: 0.2, labels: false });
        const ticksX: [number, string][] = [1, 2, 3, 4].map((e) => [e, String(10 ** e)]);
        for (const [v, s] of ticksX) label(ctx, P, s, plot.X(v), h - 18, P.ink3, 'center', 'top', 10, 400);
        for (let y = 2.6; y <= 3.7; y += 0.2) label(ctx, P, y.toFixed(1), plot.pad.l - 5, plot.Y(y), P.ink3, 'right', 'middle', 10, 400);
        // ±2 standard errors of the estimate around π
        const sd = 4 * Math.sqrt((Math.PI / 4) * (1 - Math.PI / 4));
        const bx = Array.from({ length: 60 }, (_, i) => 1 + (i / 59) * (Math.log10(PI_MAX) - 1));
        polyline(plot, bx, bx.map((x) => Math.PI + (2 * sd) / Math.sqrt(10 ** x)), alpha(c2, 0.6), 1, [4, 3]);
        polyline(plot, bx, bx.map((x) => Math.PI - (2 * sd) / Math.sqrt(10 ** x)), alpha(c2, 0.6), 1, [4, 3]);
        plot.line(1, Math.PI, Math.log10(PI_MAX), Math.PI, c3, 1.6);
        polyline(plot, running.xs.map((x) => Math.log10(x)), running.ys, c1, 1.8);
        plot.text('π', Math.log10(PI_MAX), Math.PI, c3, { align: 'right', dy: -10 });
        label(ctx, P, '점 개수 (로그)', plot.pad.l + plot.pw, plot.pad.t + plot.ph - 6, P.ink2, 'right', 'bottom', 11, 500);
        ctx.restore();
        ctx.setTransform(sub);
      } else {
        const kmax = Math.max(8, Math.ceil(Math.log(0.003) / Math.log(1 - frac1)));
        const hc = new Array(kmax + 1).fill(0);
        for (const k of probes) if (k <= kmax) hc[k]++;
        const freq = hc.map((c) => c / LV_RUNS);
        const exact = geomPmf(frac1, kmax);
        const yMax = Math.max(...freq, ...exact) * 1.18;
        const plot = new Plot(ctx, w, h, P, { xMin: 0.3, xMax: kmax + 0.7, yMin: 0, yMax, pad: { l: 44, r: 14, t: 14, b: 28 } });
        plot.grid({ axes: false, xStep: kmax > 20 ? 2 : 1, fmt: (v) => (v > 0 && v < 1 ? `${Math.round(v * 100)}%` : String(Math.round(v))) });
        bars(plot, freq, alpha(c1, 0.6), { width: 0.72 });
        pmfDots(plot, exact, c2, P.surface);
        plot.text('찾을 때까지 살펴본 칸 수 →', kmax + 0.7, yMax, P.ink2, { align: 'right', dx: -4, dy: 9, font: `500 12px ${P.fontBody}` });
      }
    },
    [P, c1, c2, c3, mode, pts, N, running, probes, frac1],
    { aspect: 2.1, maxHeight: 320, minHeight: 220 },
  );

  return (
    <Figure
      no={4}
      title="몬테카를로와 라스베이거스"
      hint="두 방식을 오가며 비교해 보세요"
      caption={
        mode === 'mc' ? (
          <>정사각형에 점을 무작위로 찍으면 사분원 안에 들어갈 확률이 π/4입니다. 안에 든 비율에 4를 곱하면 π의 추정값이 됩니다. 정해진 개수만 찍고 끝나므로 시간은 정해져 있지만 답은 근삿값이고, 오차는 1/√N로 천천히 줄어듭니다(점선은 ±2 표준오차).</>
        ) : (
          <>칸의 일부에 원하는 값(예: 빈 칸)이 있는 배열에서 무작위로 칸을 골라 찾을 때까지 살펴봅니다. 찾으면 그 답은 언제나 맞습니다. 대신 살펴보는 횟수가 무작위이고, 기하 분포(점)를 따라 평균 1/p번입니다.</>
        )
      }
    >
      <div className="controls row">
        <Seg label="방식" value={mode} onChange={setMode} options={[{ value: 'mc', label: '몬테카를로: π 추정' }, { value: 'lv', label: '라스베이거스: 칸 찾기' }]} />
        {mode === 'mc' ? (
          <Slider id="mc-n" label="찍은 점 N" value={N} min={10} max={PI_MAX} step={10} onChange={setN} format={(v) => v.toLocaleString('ko-KR')} />
        ) : (
          <Slider id="lv-p" label="원하는 칸의 비율 p" value={frac1} min={0.05} max={0.9} step={0.05} onChange={setFrac1} format={(v) => pct(v, 0)} />
        )}
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Reroll onClick={() => setSeed((s) => s + 1)} />
        </div>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={mode === 'mc' ? `점 ${N}개로 추정한 π = ${running.est.toFixed(4)}` : `칸 찾기 ${LV_RUNS}번의 탐색 횟수 분포. 평균 ${lvAvg.toFixed(2)}번, 이론 ${(1 / frac1).toFixed(2)}번.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {mode === 'mc' ? (
          <>
            <Readout label="추정한 π" value={running.est.toFixed(4)} color="var(--c-math-1)" />
            <Readout label="오차" value={Math.abs(running.est - Math.PI).toFixed(4)} />
            <Readout label="답이 맞는가" value="대략 (근삿값)" />
            <Readout label="걸리는 시간" value={`정확히 ${N.toLocaleString('ko-KR')}번`} />
          </>
        ) : (
          <>
            <Readout label={`평균 탐색 (${LV_RUNS}번)`} value={lvAvg.toFixed(2)} color="var(--c-math-1)" />
            <Readout label="이론 1/p" value={(1 / frac1).toFixed(2)} color="var(--c-math-2)" />
            <Readout label="답이 맞는가" value="언제나" />
            <Readout label="가장 오래 걸린 경우" value={`${Math.max(...probes)}번`} />
          </>
        )}
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Randomized() {
  return (
    <>
      <h2>알고리즘이 동전을 던질 때</h2>
      <p>
        지금까지 무작위는 바깥 세상에 있었습니다. 요청이 언제 올지, 사용자가 무엇을 클릭할지. 이 장에서는 알고리즘이 <strong>스스로</strong> 동전을 던집니다. 실행 중에 난수를 써서 다음 행동을 고르는 알고리즘을 <T en="randomized algorithm">무작위 알고리즘</T>이라고 합니다. 왜 일부러 운에 맡길까요? 결정적인 알고리즘에는 언제나 그것을 괴롭히는 나쁜 입력이 있기 때문입니다. 난수를 쓰면 나쁜 경우가 입력이 아니라 알고리즘의 동전에 달리게 되고, 어떤 입력이 오든 기대 성능을 보장할 수 있습니다.
      </p>
      <p>
        분석할 때 확률은 <strong>알고리즘이 던지는 동전</strong>에 대한 것입니다. 입력은 최악을 가정합니다. 그래서 "기대 실행 시간이 O(n log n)"이라는 말은 "어떤 입력에 대해서도, 동전에 대해 평균을 내면 O(n log n)"이라는 뜻입니다. 입력이 무작위라고 가정하는 평균적 분석과는 다른 약속입니다.
      </p>

      <h2>무작위 퀵 정렬</h2>
      <p>
        <a href={lessonHref('cs-algorithms', 'sorting')}>정렬</a>에서 본 퀵 정렬은 피벗 하나를 골라 그보다 작은 것과 큰 것으로 나누고, 양쪽을 다시 정렬합니다. 피벗이 늘 가운데쯤이면 <M>{'O(n \\log n)'}</M>번, 늘 가장 작은 값이면 <M>{'n(n-1)/2'}</M>번 비교합니다. 첫 원소를 피벗으로 쓰면 이미 정렬된 배열이 바로 그 최악의 입력입니다.
      </p>
      <QuicksortFigure />
      <p>
        그림 1의 기본값에서 피벗을 "첫 원소"로 바꾸면 막대가 오른쪽 끝, 19,900번으로 날아갑니다. 다시 "무작위"로 돌리면 입력이 정렬되어 있든 섞여 있든 같은 모양의 분포가 나오고, 평균은 이론값과 거의 일치합니다. 이제 그 이론값을 2장의 지시변수로 구해 봅시다.
      </p>
      <p>
        정렬된 순서에서 i번째와 j번째로 작은 원소(i &lt; j)를 생각합니다. 두 원소는 둘 중 하나가 피벗일 때만 비교되고, 한번 비교되면 다시는 비교되지 않습니다. 그런데 i와 j 사이 값이 먼저 피벗이 되면 둘은 다른 쪽으로 갈라집니다. 따라서 i부터 j까지 <M>{'j - i + 1'}</M>개의 값 중 <strong>처음 피벗이 된 것</strong>이 i나 j일 때만 비교됩니다. 피벗은 무작위이므로 그 확률은 <M>{'2/(j - i + 1)'}</M>입니다.
      </p>
      <PairFigure />
      <p>
        비교 횟수 C는 "i와 j가 비교됨"의 지시변수 <M>{'X_{ij}'}</M>를 모든 쌍에 대해 더한 것이므로, 선형성으로 기댓값이 나옵니다.
      </p>
      <MB note="거리 d = j − i인 쌍은 n − d개이고 각각 확률 2/(d+1)입니다. Hₙ ≈ ln n이므로 약 2n ln n ≈ 1.39 n log₂ n입니다.">{'E[C] = \\sum_{i<j} E[X_{ij}] = \\sum_{i<j} \\frac{2}{j-i+1} = \\sum_{d=1}^{n-1} (n-d)\\frac{2}{d+1} = 2(n+1)H_n - 4n'}</MB>
      <Code label="무작위 피벗 퀵 정렬과 비교 횟수">{`
let comparisons = 0;

function quicksort(a, lo = 0, hi = a.length - 1) {
  if (lo >= hi) return;
  const k = lo + Math.floor(Math.random() * (hi - lo + 1)); // 무작위 피벗
  [a[k], a[hi]] = [a[hi], a[k]];
  const pivot = a[hi];
  let i = lo;
  for (let j = lo; j < hi; j++) {
    comparisons++;                       // 피벗과 한 번 비교
    if (a[j] < pivot) { [a[i], a[j]] = [a[j], a[i]]; i++; }
  }
  [a[i], a[hi]] = [a[hi], a[i]];         // 피벗을 제자리에
  quicksort(a, lo, i - 1);
  quicksort(a, i + 1, hi);
}
// n = 1000이면 comparisons는 대개 1만 1천 근처: 2(n+1)Hₙ - 4n ≈ 10,986`}</Code>
      <Callout kind="note">
        그림 1에서 무작위 피벗의 분포는 기댓값 주위에 좁게 몰려 있습니다. 실제로 비교 횟수가 기댓값의 두 배를 넘을 확률은 n이 커질수록 빠르게 0으로 갑니다. 4장의 꼬리 경계로 이런 "높은 확률로" 보장을 증명할 수 있고, 그래서 표준 라이브러리들이 무작위(또는 그에 가까운) 피벗을 믿고 씁니다.
      </Callout>

      <h2>공 던지기와 해싱</h2>
      <p>
        해시 테이블에 키 n개를 버킷 m개로 나눠 넣는 일은, 확률로 보면 공 n개를 상자 m개에 무작위로 던지는 문제입니다. 해시 함수가 키를 버킷에 고르게, 독립적으로 보낸다고 가정하면 이 장의 도구로 거의 모든 것을 계산할 수 있습니다.
      </p>
      <ul>
        <li>
          버킷 하나에 든 키 수는 이항 분포 <M>{'B(n, 1/m)'}</M>이고 평균은 <M>{'n/m'}</M>입니다. 이 비율 <M>{'\\alpha = n/m'}</M>을 <T en="load factor">적재율</T>이라고 합니다. 체이닝 해시 테이블에서 탐색 한 번의 기대 비용이 <M>{'O(1 + \\alpha)'}</M>인 이유입니다.
        </li>
        <li>
          빈 버킷 수의 기댓값은 버킷마다 "비어 있음"의 지시변수를 더해 <M>{'m(1 - 1/m)^n \\approx m e^{-\\alpha}'}</M>입니다. 적재율이 1이어도 버킷의 약 37%가 비어 있습니다.
        </li>
        <li>
          충돌하는 쌍의 기댓값은 2장의 퀴즈에서 본 <M>{'\\binom{n}{2}/m'}</M>입니다. 충돌이 하나라도 생길 확률은 <a href={lessonHref('math-discrete', 'counting')}>생일 역설</a>과 같은 계산이라, n이 대략 <M>{'\\sqrt{m}'}</M>만 되어도 절반에 이릅니다.
        </li>
      </ul>
      <BinsFigure />
      <p>
        평균보다 중요한 것은 가장 운이 나쁜 버킷입니다. 그 버킷에 걸린 탐색은 느리기 때문입니다. n = m일 때 가장 긴 버킷의 길이는 높은 확률로 약 <M>{'\\ln n / \\ln \\ln n'}</M>임이 알려져 있습니다. 증명의 뼈대는 <T en="union bound">합집합 경계</T> <M>{'P(A_1 \\cup \\cdots \\cup A_m) \\le \\sum P(A_i)'}</M>입니다. 버킷 하나가 k개 넘게 찰 확률을 구해 m을 곱하고, 그것이 작아지는 k를 찾습니다.
      </p>
      <p>
        그림 3에서 "두 개 중 고르기"를 켜 보세요. 키마다 버킷 두 곳을 보고 덜 찬 쪽에 넣기만 해도 가장 긴 버킷이 <M>{'\\ln \\ln n / \\ln 2'}</M> 수준으로 줄어듭니다. 이 <T en="power of two choices">두 선택의 힘</T>은 로드 밸런서가 서버 두 대를 무작위로 골라 한가한 쪽에 일을 주는 방식, 쿠쿠 해싱 같은 자료구조의 바탕입니다. 해시 함수를 여러 개 쓰는 자료구조는 <a href={lessonHref('cs-system-algorithms', 'probabilistic')}>확률적 자료구조</a>에서, 해시 테이블 자체는 <a href={lessonHref('cs-algorithms', 'search-hash')}>탐색과 해시</a>에서 다룹니다.
      </p>

      <h2>몬테카를로와 라스베이거스</h2>
      <p>
        무작위 알고리즘은 무엇이 무작위인지에 따라 두 부류로 나눕니다. <T en="Monte Carlo algorithm">몬테카를로 알고리즘</T>은 실행 시간이 정해져 있고 답이 틀릴 수 있습니다. <T en="Las Vegas algorithm">라스베이거스 알고리즘</T>은 답이 언제나 맞고 실행 시간이 무작위입니다. 무작위 퀵 정렬은 언제나 제대로 정렬하므로 라스베이거스입니다.
      </p>
      <McLvFigure />
      <p>
        그림 4의 π 추정은 몬테카를로입니다. 점 N개의 추정값은 4장의 표본 평균이므로 오차가 <M>{'1/\\sqrt{N}'}</M>로 줄어듭니다. 한 자리 더 정확해지려면 점이 100배 필요합니다. 그래서 몬테카를로 방법은 정확한 값을 구하기 어려운 고차원 적분, 렌더링의 빛 계산, 게임 트리 탐색처럼 "대충이라도 빠르게"가 필요한 곳에 씁니다. 반대로 라스베이거스 칸 찾기는 답이 늘 맞지만, 운이 나쁘면 오래 걸립니다. 그래도 기하 분포의 꼬리는 지수적으로 얇아서, 평균의 열 배 넘게 걸릴 확률은 아주 작습니다.
      </p>
      <p>
        답이 한쪽으로만 틀리는 몬테카를로 알고리즘은 반복해서 오류를 줄일 수 있습니다. 소수 판정에 쓰는 밀러-라빈 검사는 "합성수"라고 하면 언제나 맞고, "아마 소수"라고 할 때 틀릴 확률이 1/4 이하입니다. 독립적으로 k번 돌려 모두 "아마 소수"면 틀릴 확률은 <M>{'(1/4)^k'}</M> 이하이고, k = 40이면 하드웨어가 우주선에 맞아 오류를 낼 확률보다도 작습니다. RSA 키를 만들 때 큰 소수를 이렇게 찾습니다(<a href={lessonHref('math-discrete', 'modular')}>모듈러 연산</a>).
      </p>
      <Callout kind="intuition">
        라스베이거스 알고리즘에 시간 제한을 걸면 몬테카를로가 됩니다. 기대 시간이 T인 알고리즘을 10T에서 끊으면 마르코프 부등식으로 실패 확률이 1/10 이하입니다. 거꾸로 답이 맞는지 빨리 검사할 수 있는 몬테카를로 알고리즘은, 맞을 때까지 다시 돌리면 라스베이거스가 됩니다.
      </Callout>

      <Callout kind="key">
        무작위 알고리즘의 확률은 입력이 아니라 알고리즘의 동전에 대한 것입니다. 무작위 퀵 정렬은 쌍마다 비교 확률 2/(j − i + 1)을 더해 어떤 입력에도 기대 비교 2n ln n번입니다. 해싱은 공 던지기로 분석하며, 적재율 α = n/m, 빈 버킷 약 me^(−α), 충돌 쌍 C(n, 2)/m입니다. 몬테카를로는 시간이 정해지고 답이 틀릴 수 있으며, 라스베이거스는 답이 맞고 시간이 무작위입니다.
      </Callout>
      <Quiz
        q={<>한쪽으로만 틀리는 몬테카를로 알고리즘이 한 번 실행에 1/3 확률로 틀린다. 독립적으로 몇 번 돌려야 틀릴 확률이 100만 분의 1 이하가 되는가?</>}
        options={['6번', '13번', '100번', '100만 번']}
        answer={1}
        explain={<>k번 모두 틀릴 확률은 (1/3)ᵏ입니다. (1/3)¹² ≈ 1.9 × 10⁻⁶이고 (1/3)¹³ ≈ 6.3 × 10⁻⁷이므로 13번이면 됩니다. 실패 확률은 반복 횟수에 대해 지수적으로 줄어들기 때문에, 몇 번만 더 돌리면 무시할 만큼 작아집니다.</>}
      />
    </>
  );
}
