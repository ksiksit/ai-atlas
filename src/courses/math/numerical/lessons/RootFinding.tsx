import { useMemo, useState } from 'react';
import { Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { localPoint, useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { COBWEBS, PRESETS, ROOTS3, STEPS, absErr, basin, cobweb, correct, iterate, orderEstimate, path3, rateEstimate, type MethodId, type RootPreset } from './roots';
import './numerical.css';
import './roots.css';

const sup = (n: number) => String(n).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);
const METHODS: { id: MethodId; label: string; css: string }[] = [
  { id: 'bisection', label: '이분법', css: 'var(--ink-3)' },
  { id: 'fixed', label: '고정점 반복', css: 'var(--good)' },
  { id: 'secant', label: '할선법', css: 'var(--pos)' },
  { id: 'newton', label: '뉴턴 방법', css: 'var(--accent)' },
];

function usePresetRuns(p: RootPreset) {
  return useMemo(() => {
    const out = {} as Record<MethodId, { xs: number[]; errs: number[]; digits: number[] }>;
    for (const m of METHODS) {
      const xs = iterate(p, m.id);
      const errs = xs.map((x) => absErr(x, p.root));
      out[m.id] = { xs, errs, digits: xs.map((x) => correct(x, p.root)) };
    }
    return out;
  }, [p]);
}

function PresetSeg({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Seg value={value} onChange={onChange} options={PRESETS.map((p) => ({ value: p.id, label: p.label }))} />;
}

/* ─────────────── Figure 1: four methods side by side ─────────────── */

function RaceFigure() {
  const [pid, setPid] = useState('cubic');
  const p = PRESETS.find((q) => q.id === pid)!;
  const runs = usePresetRuns(p);
  const s = useStepper(STEPS + 1, 3, pid, true);
  const k = s.i;

  const cell = (m: MethodId, j: number) => {
    const r = runs[m];
    if (!r.xs.length) return <td className="na">구간 없음</td>;
    if (j >= r.xs.length) return <td className="na">멈춤</td>;
    const d = r.digits[j];
    return (
      <td>
        <span className="x">{r.xs[j].toPrecision(12)}</span>
        <span className="dig">
          <span className="bar" style={{ width: Math.max(1, d * 3), ['--c' as string]: METHODS.find((q) => q.id === m)!.css }} />
          {d.toFixed(1)}
        </span>
      </td>
    );
  };

  const now = (m: MethodId) => {
    const r = runs[m];
    if (!r.xs.length) return '–';
    return `${r.digits[Math.min(k, r.xs.length - 1)].toFixed(1)}자리`;
  };

  return (
    <Figure
      no={1}
      title="네 가지 방법, 같은 방정식"
      hint="함수를 고르고 한 걸음씩 넘겨 보세요"
      caption={
        <>
          각 칸은 k번째 근삿값과 그 값의 맞는 유효숫자 개수(막대)입니다. 이분법은 처음 구간 [{p.bracket ? p.bracket.join(', ') : '–'}]의 가운데 점, 뉴턴 방법은 x₀ = {p.x0}, 할선법은 x₀ = {p.secant[0]}, x₁ = {p.secant[1]}, 고정점 반복은 <M>{`g(x) = ${p.gTex}`}</M>를 x₀ = {p.fixed0}에서 시작합니다. 참값은 {p.root.toPrecision(17)}입니다.
        </>
      }
    >
      <div className="controls row">
        <PresetSeg value={pid} onChange={setPid} />
      </div>
      <div className="tbl-wrap" style={{ margin: 0 }}>
        <table className="rt2-race" aria-label={`${p.label} = 0의 근을 네 방법으로 찾은 근삿값`}>
          <thead>
            <tr>
              <th>k</th>
              {METHODS.map((m) => (
                <th key={m.id}>{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: k + 1 }, (_, j) => (
              <tr key={j} data-now={j === k || undefined}>
                <td>{j}</td>
                {METHODS.map((m) => cell(m.id, j))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fig-split" style={{ marginTop: 10 }}>
        <div className="readouts" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {METHODS.map((m) => (
            <Readout key={m.id} label={m.label} value={now(m.id)} color={m.css} />
          ))}
        </div>
        <div className="controls">
          <StepControls s={s} id="rt2-race-speed" maxSpeed={10} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: errors on a log scale and the order ─────────────── */

function OrderFigure() {
  const P = usePalette();
  const [pid, setPid] = useState('cubic');
  const p = PRESETS.find((q) => q.id === pid)!;
  const runs = usePresetRuns(p);

  // bisection's honest error measure is the half-width of its bracket, which halves exactly
  const bisBound = p.bracket ? Array.from({ length: STEPS + 1 }, (_, k) => (p.bracket![1] - p.bracket![0]) / 2 ** (k + 1)) : [];

  const summary = (m: MethodId): string => {
    if (m === 'bisection') return p.bracket ? '비율 0.5' : '쓸 수 없음';
    const errs = runs[m].errs;
    const ord = orderEstimate(errs);
    const rate = rateEstimate(errs);
    if (ord !== null && ord > 1.2) return `차수 ≈ ${ord.toFixed(2)}`;
    return rate !== null ? `차수 1, 비율 ${rate.toFixed(3)}` : '–';
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const box = { x: 46, y: 22, w: w - 58, h: h - 60 };
      const yLo = -16, yHi = 1;
      const X = (k: number) => box.x + (k / STEPS) * box.w;
      const Y = (lg: number) => box.y + box.h - ((Math.max(yLo, Math.min(yHi, lg)) - yLo) / (yHi - yLo)) * box.h;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      for (let v = -16; v <= 0; v += 4) {
        ctx.beginPath();
        ctx.moveTo(box.x, Math.round(Y(v)) + 0.5);
        ctx.lineTo(box.x + box.w, Math.round(Y(v)) + 0.5);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`10${sup(v)}`, box.x - 5, Y(v));
      }
      for (let k = 0; k <= STEPS; k += 2) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(String(k), X(k), box.y + box.h + 5);
      }
      ctx.font = `500 11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('|xₖ − 근| (로그 눈금)', box.x, box.y - 4);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('반복 횟수 k', box.x + box.w, box.y + box.h + 20);
      const draw = (vals: number[], color: string, width: number, dash: number[] = []) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        let started = false;
        vals.forEach((e, k) => {
          const lg = e > 0 ? Math.log10(e) : yLo;
          if (!started) ctx.moveTo(X(k), Y(lg));
          else ctx.lineTo(X(k), Y(lg));
          started = true;
          if (e === 0 || lg <= yLo) return;
        });
        ctx.stroke();
        ctx.setLineDash([]);
        vals.forEach((e, k) => {
          const lg = e > 0 ? Math.log10(e) : yLo;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(X(k), Y(lg), 2.6, 0, Math.PI * 2);
          ctx.fill();
        });
      };
      if (bisBound.length) {
        draw(runs.bisection.errs, alpha(P.ink3, 0.6), 1.2);
        draw(bisBound, P.ink3, 1.5, [5, 4]);
      }
      draw(runs.fixed.errs, P.good, 2);
      draw(runs.secant.errs, P.pos, 2);
      draw(runs.newton.errs, P.accent, 2.5);
    },
    [P, runs, bisBound.length, pid],
    { aspect: 1.6, maxHeight: 380, minHeight: 240 },
  );

  return (
    <Figure
      no={2}
      title="오차를 로그 눈금으로 보면 차수가 보인다"
      hint="함수를 바꿔 보세요"
      caption={
        <>
          세로축은 오차의 로그입니다. 직선으로 내려가면 한 걸음마다 오차가 일정한 비율로 주는 1차 수렴이고, 점점 가팔라지며 떨어지면 그보다 빠른 수렴입니다. 이분법은 실제 오차(옅은 회색)가 들쭉날쭉하지만, 근이 들어 있는 구간의 반폭(회색 점선)은 정확히 절반씩 줄어듭니다. 차수는 마지막 세 오차로 <M>{'p \\approx \\log(e_{k+1}/e_k) / \\log(e_k/e_{k-1})'}</M>를 계산한 값입니다.
        </>
      }
    >
      <div className="controls row">
        <PresetSeg value={pid} onChange={setPid} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${p.label} = 0에서 네 방법의 오차를 로그 눈금으로 그린 그래프. ${METHODS.map((m) => `${m.label} ${summary(m.id)}`).join(', ')}.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            {METHODS.map((m) => (
              <Readout key={m.id} label={m.label} value={summary(m.id)} color={m.css} />
            ))}
          </div>
        </div>
      </div>
      <Legend items={METHODS.map((m) => ({ color: m.css, label: m.label, shape: 'ln' as const }))} />
    </Figure>
  );
}

/* ─────────────── Figure 3: fixed-point cobwebs ─────────────── */

function CobwebFigure() {
  const P = usePalette();
  const [cid, setCid] = useState('cos');
  const c = COBWEBS.find((q) => q.id === cid)!;
  const xs = useMemo(() => cobweb(c, 20), [c]);
  const s = useStepper(xs.length, 3, cid, true);
  const k = s.i;
  const slope = Math.abs(c.dg(c.fixed));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const S = Math.min(w, h) - 30;
      const ox = (w - S) / 2 + 10, oy = 8;
      const X = (v: number) => ox + ((v - c.lo) / (c.hi - c.lo)) * S;
      const Y = (v: number) => oy + S - ((v - c.lo) / (c.hi - c.lo)) * S;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + 0.5, oy + 0.5, S, S);
      // y = x
      ctx.strokeStyle = alpha(P.ink3, 0.9);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(X(c.lo), Y(c.lo));
      ctx.lineTo(X(c.hi), Y(c.hi));
      ctx.stroke();
      ctx.setLineDash([]);
      // y = g(x)
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const v = c.lo + ((c.hi - c.lo) * i) / 200;
        const y = Math.max(c.lo - 1, Math.min(c.hi + 1, c.g(v)));
        if (i) ctx.lineTo(X(v), Y(y));
        else ctx.moveTo(X(v), Y(y));
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, S, S);
      ctx.clip();
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const v = c.lo + ((c.hi - c.lo) * i) / 200;
        const y = c.g(v);
        if (i) ctx.lineTo(X(v), Y(y));
        else ctx.moveTo(X(v), Y(y));
      }
      ctx.stroke();
      // cobweb: (x, x) → (x, g(x)) → (g(x), g(x))
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(X(xs[0]), Y(c.lo));
      for (let j = 0; j < k; j++) {
        ctx.lineTo(X(xs[j]), Y(xs[j + 1]));
        ctx.lineTo(X(xs[j + 1]), Y(xs[j + 1]));
      }
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = P.accent;
      ctx.beginPath();
      ctx.arc(X(xs[k]), Y(xs[k]), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = P.good;
      ctx.beginPath();
      ctx.arc(X(c.fixed), Y(c.fixed), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(c.lo.toFixed(1), X(c.lo), oy + S + 4);
      ctx.fillText(c.hi.toFixed(1), X(c.hi), oy + S + 4);
    },
    [P, c, xs, k],
    { aspect: 1.15, maxHeight: 360, minHeight: 220 },
  );

  return (
    <Figure
      no={3}
      title="고정점 반복의 거미줄 그림"
      hint="g를 고르고 한 걸음씩 넘겨 보세요"
      caption={
        <>
          검은 곡선은 y = g(x), 점선은 y = x입니다. xₖ에서 위아래로 g(xₖ)까지 간 뒤 옆으로 y = x까지 가면 그 자리가 xₖ₊₁입니다. 초록 점이 고정점 x* = g(x*)입니다. 고정점에서 g의 기울기 크기가 1보다 작으면 거미줄이 안으로 감겨 들고, 0이면 몇 걸음 만에 닿고, 1이면 같은 두 점을 영원히 오갑니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={cid} onChange={setCid} options={COBWEBS.map((q) => ({ value: q.id, label: q.label }))} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${c.label}의 거미줄 그림, ${k}번째 반복값 ${xs[k].toFixed(6)}, 고정점 ${c.fixed.toFixed(6)}, 고정점에서 기울기의 크기 ${slope.toFixed(3)}.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <MB>{c.tex}</MB>
          <StepControls s={s} id="rt2-cob-speed" maxSpeed={10} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label={`x${k < 10 ? '' : ''}ₖ (k = ${k})`} value={xs[k].toFixed(8)} />
            <Readout label="|g′(x*)|" value={slope.toFixed(3)} color={slope < 1 ? 'var(--good)' : 'var(--bad)'} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: Newton basins for z³ − 1 ─────────────── */

const VIEWS = {
  full: { cx: 0, cy: 0, r: 1.6, label: '전체' },
  edge: { cx: -0.45, cy: 0, r: 0.22, label: '경계 확대' },
} as const;
const RES = 180;

function hexToRgb(css: string): [number, number, number] {
  const s = css.trim();
  if (s.startsWith('#')) {
    const h = s.length === 4 ? s.slice(1).split('').map((ch) => ch + ch).join('') : s.slice(1, 7);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = s.match(/[\d.]+/g);
  return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
}

function BasinFigure() {
  const P = usePalette();
  const [view, setView] = useState<keyof typeof VIEWS>('full');
  const [start, setStart] = useState<[number, number]>([0.3, 0.3]);
  const v = VIEWS[view];

  const image = useMemo(() => {
    const cols = [P.neg, P.good, P.pos].map(hexToRgb);
    const bg = hexToRgb(P.surface);
    const c = document.createElement('canvas');
    c.width = RES;
    c.height = RES;
    const g = c.getContext('2d')!;
    const img = g.createImageData(RES, RES);
    for (let j = 0; j < RES; j++)
      for (let i = 0; i < RES; i++) {
        const x = v.cx - v.r + (2 * v.r * (i + 0.5)) / RES;
        const y = v.cy + v.r - (2 * v.r * (j + 0.5)) / RES;
        const b = basin(x, y);
        const o = (j * RES + i) * 4;
        // fast convergence = full colour, slow = faded toward the background
        const t = b.root < 0 ? 0 : Math.max(0.25, 1 - b.iters / 22);
        const col = b.root < 0 ? bg : cols[b.root];
        for (let ch = 0; ch < 3; ch++) img.data[o + ch] = Math.round(bg[ch] + (col[ch] - bg[ch]) * t);
        img.data[o + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return c;
  }, [P, v]);

  const trail = useMemo(() => path3(start[0], start[1]), [start]);
  const end = basin(start[0], start[1]);
  const rootName = ['1', 'ω = (−1 + √3 i)/2', 'ω² = (−1 − √3 i)/2'];
  const rootCss = ['var(--neg)', 'var(--good)', 'var(--pos)'];

  const { wrapRef, canvasRef, size } = useCanvas2D(
    (ctx, { w, h }) => {
      const S = Math.min(w, h);
      const ox = (w - S) / 2, oy = (h - S) / 2;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, ox, oy, S, S);
      const X = (x: number) => ox + ((x - (v.cx - v.r)) / (2 * v.r)) * S;
      const Y = (y: number) => oy + ((v.cy + v.r - y) / (2 * v.r)) * S;
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, S, S);
      ctx.clip();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      trail.forEach(([x, y], k) => (k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.stroke();
      trail.forEach(([x, y], k) => {
        ctx.fillStyle = k === 0 ? P.ink : P.surface;
        ctx.strokeStyle = P.ink;
        ctx.beginPath();
        ctx.arc(X(x), Y(y), k === 0 ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      for (const [rx, ry] of ROOTS3) {
        ctx.strokeStyle = P.surface;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(X(rx), Y(ry), 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    },
    [P, image, trail, v],
    { aspect: 1, maxHeight: 400, minHeight: 220 },
  );

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el) return;
    const pt = localPoint(e, el);
    const S = Math.min(size.w, size.h);
    const ox = (size.w - S) / 2, oy = (size.h - S) / 2;
    const x = v.cx - v.r + ((pt.x - ox) / S) * 2 * v.r;
    const y = v.cy + v.r - ((pt.y - oy) / S) * 2 * v.r;
    if (Math.abs(x - v.cx) <= v.r && Math.abs(y - v.cy) <= v.r) setStart([x, y]);
  };

  return (
    <Figure
      no={4}
      title="뉴턴 방법은 어느 근으로 갈까"
      hint="그림을 눌러 출발점을 고르세요"
      caption={
        <>
          복소평면의 각 점에서 <M>{'z^3 - 1 = 0'}</M>에 뉴턴 방법을 시작해, 세 근 1, ω, ω² 중 어디에 닿는지로 색칠했습니다(파랑, 초록, 주황). 빨리 닿을수록 진하고 오래 걸릴수록 옅습니다. 흰 동그라미가 세 근이고, 검은 선은 고른 출발점에서 시작한 뉴턴 방법의 경로입니다. 경계 근처에서는 세 색이 끝없이 섞입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={view} onChange={setView} options={Object.entries(VIEWS).map(([k, q]) => ({ value: k as keyof typeof VIEWS, label: q.label }))} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" onClick={onClick} style={{ cursor: 'crosshair' }} role="img" aria-label={`z³ − 1의 뉴턴 방법 끌개 영역. 출발점 ${start[0].toFixed(3)} ${start[1] >= 0 ? '+' : '−'} ${Math.abs(start[1]).toFixed(3)}i에서 ${end.root >= 0 ? `${end.iters}번 만에 근 ${rootName[end.root]}에 닿습니다` : '근에 닿지 않습니다'}.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="출발점" value={`${start[0].toFixed(3)} ${start[1] >= 0 ? '+' : '−'} ${Math.abs(start[1]).toFixed(3)}i`} />
            <Readout label="도착한 근" value={end.root >= 0 ? rootName[end.root] : '닿지 않음'} color={end.root >= 0 ? rootCss[end.root] : undefined} />
            <Readout label="반복 횟수" value={`${end.iters}번`} />
          </div>
          <div className="na-small">그림을 누르기 어렵다면 아래 단추로 출발점을 고를 수 있습니다.</div>
          <div className="btn-row">
            {(
              [
                [0.3, 0.3],
                [1.5, 0],
                [-0.5, 0.1],
                [-0.45, 0.02],
              ] as [number, number][]
            ).map(([x, y]) => (
              <button key={`${x},${y}`} type="button" className="btn small" onClick={() => setStart([x, y])}>
                {x} {y >= 0 ? '+' : '−'} {Math.abs(y)}i
              </button>
            ))}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function RootFinding() {
  return (
    <>
      <h2>근을 찾는 네 가지 방법</h2>
      <p>
        <M>{'f(x) = 0'}</M>을 푸는 공식은 2차, 3차, 4차 다항식에만 있고, <M>{'\\cos x = x'}</M>처럼 함수가 섞이면 공식이 아예 없습니다. 그래서 근에 점점 가까워지는 수열 <M>{'x_0, x_1, x_2, \\ldots'}</M>를 만들어 원하는 만큼 정확해질 때까지 계산합니다. 수열이 수렴한다는 것이 정확히 무엇인지는 <a href={lessonHref('math-analysis', 'sequences')}>수열의 수렴</a>에서 다뤘습니다. 이 장의 질문은 <strong>얼마나 빨리</strong> 수렴하느냐입니다.
      </p>
      <ul>
        <li>
          <T en="bisection">이분법</T>: 양 끝에서 <M>f</M>의 부호가 다른 구간을 잡고, 가운데 점의 부호를 보고 근이 있는 쪽 절반을 남깁니다. 중간값 정리 덕분에 언제나 근을 놓치지 않습니다.
        </li>
        <li>
          <T en="Newton's method">뉴턴 방법</T>: 접선이 x축과 만나는 곳으로 갑니다. <M>{'x_{k+1} = x_k - f(x_k)/f^{\\prime}(x_k)'}</M>. 미분이 필요합니다. 처음 소개는 <a href={lessonHref('math-calculus', 'applications')}>미분의 응용</a>에 있습니다.
        </li>
        <li>
          <T en="secant method">할선법</T>: 접선 대신 최근 두 점을 잇는 할선을 씁니다. 미분이 필요 없습니다.
        </li>
        <li>
          <T en="fixed-point iteration">고정점 반복</T>: 방정식을 <M>{'x = g(x)'}</M> 꼴로 바꾸고 <M>{'x_{k+1} = g(x_k)'}</M>를 되풀이합니다.
        </li>
      </ul>
      <p>그림 1에서 네 방법을 같은 방정식에 나란히 돌려 보세요. 각 칸의 막대는 그 근삿값의 맞는 유효숫자 개수입니다.</p>
      <RaceFigure />
      <p>
        뉴턴이 직접 예로 들었다는 <M>{'x^3 - 2x - 5 = 0'}</M>에서 뉴턴 방법은 x₀ = 3에서 출발해 맞는 자릿수가 0.4, 0.9, 1.8, 3.6, 7.0, 14.0으로 한 걸음마다 두 배가 되고, 여섯 걸음 만에 배정밀도의 한계에 닿습니다. 할선법은 2.2, 3.9, 6.0, 9.8, 15.7자리로 한 걸음마다 1.6배쯤씩 늘어납니다. 고정점 반복은 한 걸음에 0.8자리씩 일정하게 늘고, 이분법은 한 걸음에 평균 0.3자리, 곧 log₁₀ 2자리씩 늘어 열네 걸음 뒤에도 5자리입니다.
      </p>

      <h2>수렴 차수</h2>
      <p>
        이 차이를 하나의 수로 나타낸 것이 <T en="order of convergence">수렴 차수</T>입니다. 오차 <M>{'e_k = |x_k - x^*|'}</M>에 대해 다음이 성립하면 수열은 차수 <M>p</M>로 수렴한다고 합니다.
      </p>
      <MB note="p = 1이면 C < 1이어야 하고, 이때 C를 수렴 비율이라고 합니다.">{'\\lim_{k\\to\\infty} \\frac{e_{k+1}}{e_k^{\\,p}} = C, \\qquad 0 < C < \\infty'}</MB>
      <p>
        <M>{'p = 1'}</M>이면 오차가 한 걸음마다 일정한 비율 <M>C</M>로 줄어, 맞는 자릿수가 한 걸음마다 <M>{'-\\log_{10} C'}</M>씩 늘어납니다. <M>{'p = 2'}</M>이면 <M>{'e_{k+1} \\approx C e_k^2'}</M>이라서 맞는 자릿수가 두 배가 됩니다. 로그 눈금 위에서 1차 수렴은 직선, 2차 수렴은 점점 가팔라지는 곡선입니다.
      </p>
      <OrderFigure />
      <p>
        그림 2의 추정값을 보면 처음 세 함수에서 뉴턴 방법은 1.99~2.00, 할선법은 1.80, 1.60, 1.61입니다. 할선법의 이론값은 황금비 <M>{'\\varphi = (1+\\sqrt5)/2 \\approx 1.618'}</M>인데, 반복 횟수가 적어 추정이 조금 흔들립니다. 할선법은 차수가 낮지만 한 걸음에 함수값을 한 번만 계산하고, 뉴턴 방법은 함수값과 미분값을 함께 계산해야 하므로, 계산량을 기준으로 하면 할선법이 더 빠른 경우가 많습니다.
      </p>
      <Callout kind="warn" label="중근에서는 느려진다">
        <M>{'(x-1)^2'}</M>을 고르세요. 근에서 접선이 수평이라 뉴턴 방법의 수렴 비율이 정확히 0.5인 1차 수렴으로 떨어지고, 할선법도 비율 0.618의 1차 수렴이 됩니다. 이분법은 근의 양쪽에서 부호가 바뀌지 않으므로 쓸 수조차 없습니다. 중근의 개수 m을 알면 <M>{'x_{k+1} = x_k - m\\,f(x_k)/f^{\\prime}(x_k)'}</M>로 2차 수렴을 되찾을 수 있습니다.
      </Callout>

      <h2>고정점 반복은 언제 수렴하나</h2>
      <p>
        <M>{'x_{k+1} = g(x_k)'}</M>에서 고정점 <M>{'x^* = g(x^*)'}</M>를 빼면 평균값 정리로 <M>{'e_{k+1} = |g^{\\prime}(\\xi_k)|\\, e_k'}</M>입니다. 그래서 고정점 근처에서 <M>{'|g^{\\prime}| < 1'}</M>이면 오차가 한 걸음마다 그 비율로 줄어듭니다. <M>{'g(x) = \\cos x'}</M>는 고정점에서 <M>{'|g^{\\prime}(x^*)| = \\sin x^* \\approx 0.674'}</M>라서 한 걸음에 0.17자리씩 느리게 늘어납니다.
      </p>
      <CobwebFigure />
      <p>
        <M>{'g(x) = (x + 2/x)/2'}</M>는 고정점이 √2이고 거기서 <M>{'g^{\\prime}(\\sqrt2) = 0'}</M>입니다. 기울기가 0이면 1차 항이 사라져 오차가 제곱으로 줄어드는 2차 수렴이 됩니다. 사실 이 식은 <M>{'x^2 - 2'}</M>에 뉴턴 방법을 쓴 것과 같습니다. 같은 고정점을 가진 <M>{'g(x) = 2/x'}</M>는 기울기가 −1이라서 1과 2를 끝없이 오갑니다. 방정식을 어떻게 <M>{'x = g(x)'}</M>로 바꾸느냐가 수렴 여부와 속도를 정합니다.
      </p>
      <Callout kind="note" label="왜 뉴턴 방법은 2차인가">
        뉴턴 방법도 고정점 반복입니다. <M>{'g(x) = x - f(x)/f^{\\prime}(x)'}</M>로 두고 미분하면 <M>{'g^{\\prime}(x) = f(x)f^{\\prime\\prime}(x)/f^{\\prime}(x)^2'}</M>이고, 근에서는 <M>{'f(x^*) = 0'}</M>이므로 <M>{'g^{\\prime}(x^*) = 0'}</M>입니다. 다만 <M>{'f^{\\prime}(x^*) \\neq 0'}</M>이어야 하므로, 중근에서는 이 논증이 깨지고 1차 수렴으로 떨어집니다.
      </Callout>

      <h2>빠른 방법의 대가</h2>
      <p>
        이분법은 느리지만 처음 구간 안에 근이 있으면 반드시 찾습니다. 뉴턴 방법은 빠르지만 출발점이 근에서 멀면 엉뚱한 곳으로 튀거나, 같은 점들을 오가거나, 발산할 수 있습니다. 복소수 방정식 <M>{'z^3 = 1'}</M>은 이 문제를 극적으로 보여 줍니다. 근이 세 개이고 출발점마다 뉴턴 방법이 그중 하나로 가는데, 어느 근으로 가는지를 색칠하면 세 영역의 경계가 끝없이 갈라지는 프랙털이 나옵니다.
      </p>
      <BasinFigure />
      <p>
        세 근 근처에서 출발하면 몇 걸음 만에 가장 가까운 근에 닿습니다. 그림의 180×180개 점을 평균하면 6.7번이 걸립니다. 하지만 경계 근처에서는 출발점을 아주 조금 옮겨도 전혀 다른 근으로 갑니다. 0.3 + 0.3i에서 출발하면 원점 근처라 z²이 작아서 첫걸음에 0.2 − 1.65i까지 멀리 튀었다가, 7번 만에 ω²에 닿습니다.
      </p>
      <p>
        실제 라이브러리는 두 장점을 섞습니다. <T en="Brent's method">브렌트 방법</T>은 근을 감싼 구간을 계속 유지하면서, 할선법이나 2차 보간으로 빠른 다음 점을 제안하고, 그 점이 구간 밖으로 나가거나 충분히 줄지 않으면 이분법 한 걸음으로 대신합니다. 이분법의 확실함과 할선법에 가까운 속도를 함께 얻는 이런 방법을 <T en="safeguarded method">보호된 방법</T>이라고 합니다.
      </p>

      <Callout kind="key">
        근 찾기 알고리즘은 수렴 차수로 비교합니다. 이분법은 오차 상한이 한 걸음마다 절반이 되는 1차 수렴(한 걸음에 0.3자리)이고 근을 놓치지 않습니다. 고정점 반복은 고정점에서 |g′| &lt; 1이면 그 비율로 1차 수렴합니다. 할선법은 차수 1.618, 뉴턴 방법은 2로 맞는 자릿수가 한 걸음마다 두 배가 되지만, 중근에서는 1차로 떨어지고 출발점이 나쁘면 엉뚱한 곳으로 갑니다. 실제로는 구간을 지키며 빠른 걸음을 시도하는 브렌트 방법 같은 보호된 방법을 씁니다.
      </Callout>
      <Quiz
        q="어떤 근 찾기 방법의 맞는 유효숫자가 3, 6, 12자리로 늘었다. 다음 한 걸음 뒤에 기대할 수 있는 것과 수렴 차수는?"
        options={['15자리, 1차 수렴', '24자리(배정밀도에서는 약 16자리에서 멈춤), 2차 수렴', '13자리, 1.618차 수렴', '12자리에서 더 늘지 않음, 수렴하지 않음']}
        answer={1}
        explain={<>맞는 자릿수가 한 걸음마다 두 배가 되면 오차는 e_(k+1) ≈ C·e_k²를 따르는 2차 수렴이고, 뉴턴 방법이 단근에서 보이는 모습입니다. 다음은 24자리가 기대되지만 배정밀도는 16자리 안팎까지만 담으므로 거기서 멈춥니다. 1차 수렴이라면 늘어나는 자릿수가 일정해야 하고(3, 6, 9, 12), 할선법이라면 1.6배쯤씩 늘어야 합니다.</>}
      />
    </>
  );
}
