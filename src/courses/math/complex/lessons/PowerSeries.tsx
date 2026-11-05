import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Callout, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { colorOf } from './cplx';
import { SERIES, SING, cabs, circleRange, essentialHits, geomError, geomPartial, inv, laurentExact, laurentF, laurentNumeric, lorentz, lorentzC, lorentzTaylor, radiusEstimates, sub, type C, type SingId } from './series';
import './complex.css';
import './series.css';

const nf = (v: number, d = 4) => {
  const s = v.toFixed(d);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
};
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '' };
/** A number with four decimals, or as m×10ⁿ when it is very small or very large. */
const sci = (v: number) => {
  if (v === 0) return '0';
  if (!isFinite(v)) return '∞';
  if (Math.abs(v) >= 1e-3 && Math.abs(v) < 1e4) return nf(v, 4);
  const [m, e] = v.toExponential(2).split('e');
  return `${m}×10${e.split('').map((ch) => SUP[ch] ?? ch).join('')}`;
};
const fmtC = (z: C, d = 4) => `${nf(z[0], d)} ${z[1] < 0 ? '−' : '+'} ${nf(Math.abs(z[1]), d)}i`;

function Proof({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ps-proof" role="note" aria-label={title}>
      <span className="ps-proof-head">{title}</span>
      {children}
    </div>
  );
}
const Qed = () => <span className="ps-qed">∎</span>;

/** Paint the domain colouring of f over the whole plot area. */
function paintDomain(p: Plot, f: (z: C) => C, res = 3) {
  p.heatmap((x, y) => [...colorOf(f([x, y])), 255] as [number, number, number, number], res);
}

/** A circle |z − c| = r in plot coordinates. */
function ring(p: Plot, c: C, r: number, color: string, width = 2, dash?: number[]) {
  const ctx = p.ctx;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.ellipse(p.X(c[0]), p.Y(c[1]), r * p.sx, r * p.sy, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** A marker that reads on any domain colouring: a dark-ringed light dot. */
function mark(p: Plot, P: Palette, z: C, label?: string) {
  const ctx = p.ctx;
  ctx.beginPath();
  ctx.arc(p.X(z[0]), p.Y(z[1]), 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#111111';
  ctx.stroke();
  if (label) p.text(label, z[0], z[1], P.ink, { dx: 8, dy: -8, font: `600 11px ${P.fontMono}`, bg: P.surface });
}

/* ─────────────── Figure 1: the real Taylor series stops at |x| = 1 ─────────────── */

function LorentzFigure() {
  const P = usePalette();
  const [N, setN] = useState(6);
  const [x, setX] = useState(0.9);
  const s = lorentzTaylor(x, N);
  const truth = lorentz(x);

  const real = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -2, xMax: 2, yMin: -1, yMax: 2, pad: { l: 30, r: 10, t: 10, b: 26 } });
      ctx.fillStyle = alpha(P.good, 0.1);
      ctx.fillRect(p.X(-1), p.pad.t, p.X(1) - p.X(-1), p.ph);
      p.grid({ labels: true, xStep: 1, yStep: 1 });
      p.fn(lorentz, P.ink, 2.5);
      p.fn((t) => lorentzTaylor(t, N), P.pos, 2);
      p.line(x, p.yMin, x, p.yMax, alpha(P.ink3, 0.7), 1, [4, 4]);
      const sy = Math.max(p.yMin, Math.min(p.yMax, s));
      p.dot(x, sy, 4.5, P.pos, P.surface);
      p.dot(x, truth, 4.5, P.ink, P.surface);
      p.text('|x| < 1', 0, 1.85, P.good, { align: 'center', font: `600 11px ${P.fontBody}` });
    },
    [P, N, x, s, truth],
    { aspect: 1.25, maxHeight: 320 },
  );

  const plane = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -2, xMax: 2, yMin: -2, yMax: 2, equal: true, pad: { l: 8, r: 8, t: 8, b: 8 } });
      paintDomain(p, lorentzC);
      ring(p, [0, 0], 1, '#ffffff', 2.5, [6, 4]);
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.X(-2), p.Y(0));
      ctx.lineTo(p.X(2), p.Y(0));
      ctx.stroke();
      ctx.restore();
      mark(p, P, [0, 1], 'i');
      mark(p, P, [0, -1], '−i');
      mark(p, P, [x, 0]);
    },
    [P, x],
    { aspect: 1, maxHeight: 420 },
  );

  return (
    <Figure
      no={1}
      title="실수만 보면 이유가 없는 수렴 반지름"
      hint="항의 수 N과 x를 바꿔 보세요"
      caption={
        <>
          첫째 그림(넓은 화면에서는 왼쪽): 검은 곡선(어두운 테마에서는 흰 곡선)이 <M>{'1/(1+x^2)'}</M>, 주황 곡선이 테일러 다항식 <M>{'S_N(x)=\\sum_{k=0}^{N}(-1)^k x^{2k}'}</M>입니다. 초록 띠 밖에서는 N을 늘려도 맞지 않습니다. 둘째 그림: 같은 함수를 복소 평면 전체에서 색칠한 그림입니다. 색은 값의 방향(편각)이고, 양의 실수는 빨강, 120°는 초록, 240°는 파랑입니다. 밝기는 절댓값이 두 배가 될 때마다 한 번씩 어두운 쪽에서 밝은 쪽으로 바뀝니다. 흰 가로선이 실수축, 흰 점선이 단위원이고, 모든 색이 한 점에 모이는 ±i가 극입니다.
        </>
      }
    >
      <div className="ps-two">
        <div ref={real.wrapRef} className="canvas-box" role="img" aria-label={`실수축 위의 1/(1+x²)와 ${N}차까지의 테일러 다항식. x = ${nf(x, 2)}에서 다항식 값 ${nf(s)}, 참값 ${nf(truth)}.`}>
          <canvas ref={real.canvasRef} />
        </div>
        <div ref={plane.wrapRef} className="canvas-box ps-square" role="img" aria-label="1/(1+z²)의 정의역 색칠. 실수축 위에는 아무 문제가 없지만, 원점에서 거리 1인 i와 −i에 극이 있습니다.">
          <canvas ref={plane.canvasRef} />
        </div>
      </div>
      <div className="controls row">
        <Slider id="ps-n" label="N (마지막 거듭제곱 x^2N)" value={N} min={0} max={30} step={1} onChange={setN} />
        <Slider id="ps-x" label="x" value={x} min={-1.6} max={1.6} step={0.05} onChange={setX} format={(v) => nf(v, 2)} />
      </div>
      <div className="readouts">
        <Readout label="S_N(x)" value={sci(s)} color="var(--pos)" />
        <Readout label="1/(1+x²)" value={nf(truth)} />
        <Readout label="오차" value={sci(Math.abs(s - truth))} color={Math.abs(x) < 1 ? undefined : 'var(--bad)'} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: where the geometric series converges ─────────────── */

const RANGE = 1.6;

function rgbOf(css: string): [number, number, number] {
  const s = css.trim();
  if (s.startsWith('#')) {
    const h = s.length === 4 ? s.slice(1).split('').map((c) => c + c).join('') : s.slice(1, 7);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = s.match(/[\d.]+/g);
  return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
}
const lerp3 = (a: number[], b: number[], t: number) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));

function GeomFigure() {
  const P = usePalette();
  const [n, setN] = useState(10);
  const [z, setZ] = useState<C>([0.5, 0.5]);
  const plotRef = useRef<Plot | null>(null);
  const S = geomPartial(z, n);
  const target = inv(sub([1, 0], z));
  const err = geomError(z, n);

  const cols = useMemo(() => ({ good: rgbOf(P.good), mid: rgbOf(P.surface2), bad: rgbOf(P.bad) }), [P]);
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -RANGE, xMax: RANGE, yMin: -RANGE, yMax: RANGE, equal: true, pad: { l: 30, r: 10, t: 10, b: 26 } });
      plotRef.current = p;
      // log10 of the error: ≤ −4 green, around 0 neutral, ≥ 1 red
      p.heatmap((x, y) => {
        const e = geomError([x, y], n);
        const t = Math.max(-4, Math.min(1, Math.log10(e)));
        const c = t <= -1.5 ? lerp3(cols.good, cols.mid, (t + 4) / 2.5) : lerp3(cols.mid, cols.bad, (t + 1.5) / 2.5);
        return [c[0], c[1], c[2], 255];
      }, 3);
      p.grid({ labels: true, xStep: 1, yStep: 1 });
      ring(p, [0, 0], 1, P.ink, 2, [6, 4]);
      p.dot(1, 0, 4, P.ink, P.surface);
      p.text('1', 1, 0, P.ink, { dx: 6, dy: 12, font: `600 11px ${P.fontMono}` });
      p.dot(z[0], z[1], 7, P.accent, P.surface, 2.5);
    },
    [P, n, z, cols],
    { aspect: 1, maxHeight: 420 },
  );
  useDrag(wrapRef, {
    hit: () => 'z',
    onDrag: (_id, sx, sy) => {
      const p = plotRef.current;
      if (!p) return;
      const q: C = [Math.round(p.invX(sx) * 20) / 20, Math.round(p.invY(sy) * 20) / 20];
      if (Math.hypot(q[0] - 1, q[1]) < 0.05) return;
      setZ([Math.max(-RANGE, Math.min(RANGE, q[0])), Math.max(-RANGE, Math.min(RANGE, q[1]))]);
    },
  });

  return (
    <Figure
      no={2}
      title="등비급수가 맞는 곳"
      hint="점을 끌거나 슬라이더로 옮기고, 항의 수를 늘려 보세요"
      caption={
        <>
          각 점 z에서 부분합 <M>{'S_n(z)=1+z+\\cdots+z^n'}</M>과 극한 <M>{'1/(1-z)'}</M>의 차이를 색으로 칠했습니다. 차이가 <M>{'10^{-4}'}</M>보다 작으면 초록, 1 근처면 바탕색, 10보다 크면 빨강입니다. 점선이 단위원입니다. 차이는 정확히 <M>{'|z|^{n+1}/|1-z|'}</M>이므로 n을 늘리면 원 안의 초록은 넓어지고, 원 밖의 빨강은 더 붉어집니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab ps-square" role="img" aria-label={`등비급수 부분합의 오차 지도. n = ${n}, z = ${fmtC(z, 2)}, |z| = ${nf(cabs(z), 3)}, 오차 ${sci(err)}.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="ps-gn" label="n (마지막 거듭제곱)" value={n} min={1} max={40} step={1} onChange={setN} />
          <Slider id="ps-gx" label="Re z" value={z[0]} min={-RANGE} max={RANGE} step={0.05} onChange={(v) => setZ([v, z[1]])} format={(v) => nf(v, 2)} />
          <Slider id="ps-gy" label="Im z" value={z[1]} min={-RANGE} max={RANGE} step={0.05} onChange={(v) => setZ([z[0], v])} format={(v) => nf(v, 2)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="|z|" value={nf(cabs(z), 3)} color={cabs(z) < 1 ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="S_n(z)" value={cabs(S) > 1e5 ? '매우 큼' : fmtC(S, 3)} />
            <Readout label="1/(1−z)" value={fmtC(target, 3)} />
            <Readout label="차이" value={sci(err)} color={err < 1e-2 ? 'var(--good)' : err > 1 ? 'var(--bad)' : undefined} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: Laurent series in two annuli ─────────────── */

type Ring = 'inner' | 'outer';

function LaurentFigure() {
  const P = usePalette();
  const [ringId, setRing] = useState<Ring>('inner');
  const [r, setR] = useState(0.5);
  const pick = (v: Ring) => {
    setRing(v);
    setR(v === 'inner' ? 0.5 : 2);
  };
  const rows = useMemo(() => Array.from({ length: 7 }, (_, i) => i - 4).map((k) => ({ k, num: laurentNumeric(laurentF, k, r), exact: laurentExact(k, ringId) })), [r, ringId]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -2.2, xMax: 2.2, yMin: -2.2, yMax: 2.2, equal: true, pad: { l: 8, r: 8, t: 8, b: 8 } });
      paintDomain(p, laurentF);
      // dim everything outside the chosen annulus: outside the unit circle for the inner one, inside it for the outer one
      ctx.save();
      ctx.fillStyle = alpha(P.surface, 0.62);
      ctx.beginPath();
      if (ringId === 'inner') ctx.rect(p.pad.l, p.pad.t, p.pw, p.ph);
      ctx.ellipse(p.X(0), p.Y(0), p.sx, p.sy, 0, 0, Math.PI * 2);
      ctx.fill('evenodd');
      ctx.restore();
      ring(p, [0, 0], 1, P.ink, 1.5, [5, 4]);
      ring(p, [0, 0], r, '#ffffff', 3);
      ring(p, [0, 0], r, '#111111', 1.2);
      mark(p, P, [0, 0], '0');
      mark(p, P, [1, 0], '1');
    },
    [P, ringId, r],
    { aspect: 1, maxHeight: 420 },
  );

  return (
    <Figure
      no={3}
      title="같은 함수, 고리마다 다른 급수"
      hint="고리를 고르고 원의 반지름을 바꿔 보세요"
      caption={
        <>
          <M>{'f(z)=\\dfrac{1}{z(z-1)}'}</M>을 색칠하고, 고른 고리 밖은 흐리게 했습니다. 표의 수치는 고리 안의 원 <M>{'|z|=r'}</M> 위 256개 점에서 <M>{'c_n=\\frac{1}{2\\pi i}\\oint f(z)\\,z^{-n-1}\\,dz'}</M>를 계산한 값이고, 옆 칸은 등비급수로 전개해 얻은 정확한 값입니다. 고리 안에서는 반지름을 바꿔도 계수가 그대로이고, 고리가 바뀌면 계수가 완전히 달라집니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box ps-square" role="img" aria-label={`1/(z(z−1))의 정의역 색칠과 ${ringId === 'inner' ? '0 < |z| < 1' : '|z| > 1'} 고리, 반지름 ${nf(r, 2)}인 원.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="고리" value={ringId} onChange={pick} options={[{ value: 'inner', label: '0 < |z| < 1' }, { value: 'outer', label: '|z| > 1' }]} />
          <Slider id="ps-lr" label="원의 반지름 r" value={r} min={ringId === 'inner' ? 0.1 : 1.2} max={ringId === 'inner' ? 0.9 : 3} step={0.05} onChange={setR} format={(v) => nf(v, 2)} />
          <div className="tbl-wrap">
            <table className="ps-table">
              <thead>
                <tr>
                  <th>n</th>
                  <th>원 위에서 계산</th>
                  <th>정확한 값</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ k, num, exact }) => (
                  <tr key={k} data-on={exact !== 0 || undefined}>
                    <td className="mono">{k}</td>
                    <td className="mono">{nf(num[0], 4)}</td>
                    <td className="mono">{exact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: three kinds of isolated singularity ─────────────── */

const HIT_W = 2;

function SingFigure() {
  const P = usePalette();
  const [id, setId] = useState<SingId>('essential');
  const [logR, setLogR] = useState(0);
  const R = Math.pow(10, logR);
  const f = SING[id].f;
  const rng = useMemo(() => circleRange(f, R / 2), [f, R]);
  const hits = useMemo(() => (id === 'essential' ? essentialHits(HIT_W, 400).filter((z) => Math.abs(z[0]) < R && Math.abs(z[1]) < R) : []), [id, R]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -R, xMax: R, yMin: -R, yMax: R, equal: true, pad: { l: 8, r: 8, t: 8, b: 8 } });
      paintDomain(p, f, 2);
      ring(p, [0, 0], R / 2, '#ffffff', 2.5, [6, 4]);
      for (const z of hits) {
        ctx.beginPath();
        ctx.arc(p.X(z[0]), p.Y(z[1]), 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      mark(p, P, [0, 0]);
      p.text(`보이는 범위 |Re z|, |Im z| ≤ ${R < 0.1 ? R.toFixed(3) : nf(R, 2)}`, -R, R, P.ink, { dx: 6, dy: 14, font: `500 11px ${P.fontMono}`, bg: P.surface });
    },
    [P, f, R, hits],
    { aspect: 1, maxHeight: 420 },
  );

  return (
    <Figure
      no={4}
      title="0 근처를 확대하면"
      hint="종류를 고르고 확대해 보세요"
      caption={
        <>
          세 함수 모두 0에서 정의되지 않습니다. 점선 원은 <M>{'|z|=R/2'}</M>이고, 수치 칸은 그 원 위에서 <M>{'|f|'}</M>의 가장 작은 값과 가장 큰 값입니다. 제거 가능한 특이점은 확대할수록 한 가지 색으로 고르게 퍼지고, 극은 어떤 크기에서 보아도 색이 같은 순서로 두 바퀴 돕니다. 진성 특이점 <M>{'e^{1/z}'}</M>에서는 확대할수록 색이 더 촘촘하게 뒤섞입니다. 흰 동그라미는 <M>{'e^{1/z}=2'}</M>가 되는 점입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box ps-square" role="img" aria-label={`${SING[id].name} 특이점을 가진 함수의 0 근처 정의역 색칠, 보이는 범위 ${nf(R, 3)}. 반지름 R/2 원 위에서 |f|는 ${sci(rng.min)}부터 ${sci(rng.max)}까지입니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="함수" value={id} onChange={setId} options={(Object.keys(SING) as SingId[]).map((k) => ({ value: k, label: SING[k].name }))} />
          <div className="ps-tex">
            <M>{`f(z)=${SING[id].tex}`}</M>
          </div>
          <Slider id="ps-zoom" label="보이는 범위 R" value={logR} min={-1.3} max={0.3} step={0.05} onChange={setLogR} format={(v) => nf(Math.pow(10, v), 3)} />
          <div className="btn-row">
            <Button small onClick={() => setLogR(0)}>
              R = 1
            </Button>
            <Button small onClick={() => setLogR(Math.log10(0.2))}>
              R = 0.2
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="원 위 최소 |f|" value={sci(rng.min)} />
            <Readout label="원 위 최대 |f|" value={sci(rng.max)} />
          </div>
          {id === 'essential' && <div className="cx-small">보이는 범위 안에 <M>{'e^{1/z}=2'}</M>인 점이 {hits.length}개 그려져 있습니다. 0에 다가갈수록 끝없이 더 있습니다.</div>}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── radius table ─────────────── */

function RadiusTable() {
  return (
    <div className="tbl-wrap">
      <table className="ps-table wide">
        <thead>
          <tr>
            <th>급수</th>
            <th>비율 |a₅₀ / a₅₁|</th>
            <th>근 |a₅₀|^(−1/50)</th>
            <th>수렴 반지름 R</th>
          </tr>
        </thead>
        <tbody>
          {SERIES.map((s) => {
            const e = radiusEstimates(s, 50);
            return (
              <tr key={s.id}>
                <td>
                  <M>{s.tex}</M>
                </td>
                <td className="mono">{e.ratio.toPrecision(4)}</td>
                <td className="mono">{e.root.toPrecision(4)}</td>
                <td>
                  <M>{s.rTex}</M>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function PowerSeries() {
  return (
    <>
      <h2>실수축만 봐서는 알 수 없는 것</h2>
      <p>
        함수 <M>{'1/(1+x^2)'}</M>은 실수 전체에서 매끄럽고, 값도 0과 1 사이에 얌전히 머뭅니다. <a href={lessonHref('math-calculus', 'series')}>미적분학의 급수 장</a>에서처럼 등비급수로 전개하면 <M>{'1 - x^2 + x^4 - x^6 + \\cdots'}</M>입니다. 그런데 이 급수는 <M>{'|x|<1'}</M>에서만 수렴하고, <M>{'x=1.1'}</M>처럼 조금만 벗어나도 항을 늘릴수록 오히려 멀어집니다. 실수축 위에는 x = ±1에서 아무 일도 일어나지 않는데, 왜 하필 1일까요?
      </p>
      <LorentzFigure />
      <p>
        N = 6이면 <M>{'x=0.5'}</M>에서 다항식이 0.8000으로 참값과 넷째 자리까지 맞습니다. 같은 N으로 <M>{'x=0.9'}</M>에서는 0.6789로 참값 0.5525와 꽤 떨어져 있고, N = 20이 되어서야 0.5591까지 다가갑니다. <M>{'x=1.1'}</M>에서는 N = 6일 때 2.1708, N = 20일 때 25.2324로 참값 0.4525에서 점점 멀어집니다. 답은 둘째 그림의 복소 평면에 있습니다. <M>{'1+z^2=0'}</M>이 되는 <M>{'z=\\pm i'}</M>에서 함수가 무한히 커지고, 두 점은 원점에서 정확히 거리 1에 있습니다. 실수축에서 보이지 않던 장애물이 복소 평면에서는 바로 옆에 있었던 것입니다.
      </p>

      <h2>수렴 원판</h2>
      <p>
        <T en="power series">멱급수</T> <M>{'\\sum_{k\\ge0} a_k (z-z_0)^k'}</M>은 언제나 어떤 원판 안에서 수렴하고 원판 밖에서 발산합니다. 그 반지름을 <T en="radius of convergence">수렴 반지름</T> R이라고 합니다. 가장 단순한 예인 등비급수 <M>{'\\sum z^k = 1/(1-z)'}</M>는 단위원 안에서 수렴합니다.
      </p>
      <GeomFigure />
      <p>
        기본 설정 <M>{'z=0.5+0.5i'}</M>(<M>{'|z|\\approx0.707'}</M>)에서 n = 10이면 차이가 0.0313, n = 20이면 0.000977로 빠르게 줄어듭니다. 원 경계 가까운 <M>{'z=0.9'}</M>에서는 n = 20이어도 차이가 1.09이고, 원 밖의 <M>{'z=1.1'}</M>에서는 n = 10에서 28.5, n = 20에서 74.0으로 커집니다. 원 안이라도 경계에 가까울수록 수렴이 느리고, 원 밖에서는 아무리 더해도 소용이 없습니다. 원이라는 모양이 어디서 나오는지는 다음 정리가 말해 줍니다.
      </p>
      <div className="ps-thm">
        <b>정리 (아벨의 보조정리).</b> 멱급수 <M>{'\\sum a_k z^k'}</M>이 어떤 점 <M>{'z_1\\ne 0'}</M>에서 수렴하면, <M>{'|z|<|z_1|'}</M>인 모든 z에서 절대수렴합니다.
      </div>
      <Proof title="증명.">
        <p>
          <M>{'\\sum a_k z_1^k'}</M>이 수렴하므로 항 <M>{'a_k z_1^k'}</M>은 0으로 가고, 따라서 어떤 B가 있어 모든 k에서 <M>{'|a_k z_1^k|\\le B'}</M>입니다. <M>{'|z|<|z_1|'}</M>이면 <M>{'q=|z|/|z_1|<1'}</M>이고
        </p>
        <MB>{'|a_k z^k| = |a_k z_1^k|\\,\\Big|\\frac{z}{z_1}\\Big|^k \\le B\\,q^k.'}</MB>
        <p>
          오른쪽은 수렴하는 등비급수이므로 비교 판정으로 <M>{'\\sum |a_k z^k|'}</M>이 수렴합니다. <Qed />
        </p>
      </Proof>
      <p>
        그래서 수렴하는 점들은 원점에서 일정한 거리 안쪽을 빈틈없이 채우고, 그 경계가 원이 됩니다. 반지름은 계수에서 비율 판정 <M>{'R=\\lim|a_k/a_{k+1}|'}</M>나 근 판정 <M>{'R=1/\\limsup|a_k|^{1/k}'}</M>으로 구할 수 있습니다. 아래 표는 k = 50에서 두 값을 계산한 것입니다. 극한이 천천히 다가가는 급수도 있어서, <M>{'\\sum z^k/k!'}</M>은 k = 50에서 비율이 51.00, 근이 19.48이지만 k가 커질수록 둘 다 끝없이 커져 R = ∞가 됩니다.
      </p>
      <RadiusTable />
      <p>
        정칙 함수의 경우에는 계수를 보지 않고도 반지름을 알 수 있습니다. 함수 f가 <M>{'z_0'}</M>을 중심으로 하는 원판에서 정칙이면 그 원판 전체에서 테일러 급수가 f로 수렴하고, 따라서 <T en="radius of convergence">수렴 반지름</T>은 <M>{'z_0'}</M>에서 가장 가까운 특이점까지의 거리입니다. 증명은 다음 장의 코시 적분 공식에서 나옵니다. 그림 1의 반지름이 1인 것은 가장 가까운 특이점 ±i까지의 거리가 1이기 때문입니다. 이 급수가 원판 안의 닫힌 원판에서 고르게 수렴한다는 것은 <a href={lessonHref('math-analysis', 'uniform-convergence')}>해석학의 균등 수렴 장</a>에서 본 바이어슈트라스 M-판정으로 확인할 수 있습니다.
      </p>

      <h2>음의 거듭제곱까지: 로랑 급수</h2>
      <p>
        특이점을 둘러싼 고리 모양 영역 <M>{'r_1<|z-z_0|<r_2'}</M>에서 정칙인 함수는 음의 거듭제곱까지 쓰는 <T en="Laurent series">로랑 급수</T>로 나타낼 수 있습니다.
      </p>
      <MB>{'f(z)=\\sum_{n=-\\infty}^{\\infty} c_n (z-z_0)^n,\\qquad c_n=\\frac{1}{2\\pi i}\\oint_{|z-z_0|=r}\\frac{f(z)}{(z-z_0)^{n+1}}\\,dz'}</MB>
      <p>
        <M>{'f(z)=1/(z(z-1))'}</M>는 0과 1에 특이점이 있어서, 0을 중심으로 고리가 둘 생깁니다. <M>{'0<|z|<1'}</M>에서는 <M>{'f=-\\tfrac{1}{z}\\cdot\\tfrac{1}{1-z}=-\\tfrac1z-1-z-z^2-\\cdots'}</M>이고, <M>{'|z|>1'}</M>에서는 <M>{'f=\\tfrac{1}{z^2}\\cdot\\tfrac{1}{1-1/z}=\\tfrac{1}{z^2}+\\tfrac{1}{z^3}+\\cdots'}</M>입니다. 같은 함수인데 고리에 따라 계수가 다릅니다.
      </p>
      <LaurentFigure />
      <p>
        안쪽 고리에서는 r = 0.5에서 계산한 계수가 <M>{'c_{-1}=c_0=c_1=c_2=-1'}</M>, 바깥 고리에서는 r = 2에서 <M>{'c_{-4}=c_{-3}=c_{-2}=1'}</M>이고 나머지는 모두 0입니다. 넷째 자리까지 정확한 값과 같고, 고리 안에서 r을 바꿔도 변하지 않습니다. 원 위의 적분이 원의 크기와 상관없다는 이 사실이 다음 장의 코시 정리입니다.
      </p>

      <h2>특이점의 세 가지 얼굴</h2>
      <p>
        한 점 <M>{'z_0'}</M>의 둘레에서만 정칙인 함수를 생각합시다. <M>{'0<|z-z_0|<r'}</M>에서의 로랑 급수에 음의 거듭제곱이 몇 개 있느냐에 따라 특이점은 세 종류로 나뉩니다.
      </p>
      <ul>
        <li>
          음의 거듭제곱이 하나도 없으면 <T en="removable singularity">제거 가능한 특이점</T>입니다. <M>{'\\sin z/z=1-z^2/6+\\cdots'}</M>처럼 그 점에서 값을 정해 주기만 하면 정칙이 됩니다.
        </li>
        <li>
          유한 개 있으면 <T en="pole">극</T>입니다. 가장 낮은 거듭제곱이 <M>{'(z-z_0)^{-m}'}</M>이면 m차 극이고, 그 점에 다가가면 <M>{'|f|'}</M>가 <M>{'|z-z_0|^{-m}'}</M>처럼 무한대로 갑니다.
        </li>
        <li>
          무한히 많으면 <T en="essential singularity">진성 특이점</T>입니다. <M>{'e^{1/z}=1+\\tfrac1z+\\tfrac{1}{2z^2}+\\cdots'}</M>가 대표적입니다.
        </li>
      </ul>
      <SingFigure />
      <p>
        R = 1에서 반지름 0.5인 원 위의 <M>{'|f|'}</M>를 보면, 제거 가능한 경우는 0.9589부터 1.042 사이이고 R = 0.2로 확대하면 0.9983부터 1.002로 1에 모입니다. 2차 극 <M>{'1/z^2'}</M>은 R = 1에서 4, R = 0.2에서 100으로, 원 위 어디서나 같은 크기로 일정하게 커집니다. 진성 특이점은 전혀 다릅니다. R = 1에서는 0.1353부터 7.389까지, R = 0.2에서는 <M>{'4.54\\times10^{-5}'}</M>부터 <M>{'2.203\\times10^{4}'}</M>까지 퍼져서, 같은 원 위에서 아주 작은 값과 아주 큰 값을 모두 지납니다.
      </p>
      <p>
        <T en="Casorati–Weierstrass theorem">카소라티-바이어슈트라스 정리</T>는 진성 특이점 근처에서 함수가 복소수 거의 전부에 얼마든지 가까이 간다고 말합니다. <M>{'e^{1/z}'}</M>의 경우는 더 강해서, 0이 아닌 모든 값을 무한히 많이 정확하게 지납니다. 예를 들어 <M>{'e^{1/z}=2'}</M>의 해는 <M>{'z_k=1/(\\ln 2+2\\pi i k)'}</M>입니다. 이 점들은 모두 중심 <M>{'1/(2\\ln2)\\approx0.721'}</M>, 반지름 0.721인 원 위에 있고, 가장 바깥 것이 <M>{'|z_{\\pm1}|\\approx0.158'}</M>이며, k가 커질수록 0으로 몰려듭니다. 아무리 작은 원을 그려도 그 안에 해가 무한히 많습니다.
      </p>
      <Callout kind="intuition">
        정의역 색칠에서 극과 영점은 모든 색이 한 점에 모이는 곳입니다. 둘레를 시계 반대 방향으로 돌 때 색이 빨강, 초록, 파랑 순으로 돌면 영점, 반대 순으로 돌면 극이고, 몇 번 도는지가 차수입니다. 그림 4의 <M>{'1/z^2'}</M> 둘레에서 색이 거꾸로 두 바퀴 도는 것을 확인해 보세요.
      </Callout>

      <Callout kind="key">
        멱급수는 원판 안에서 절대수렴하고 밖에서 발산하며, 정칙 함수의 테일러 급수의 수렴 반지름은 가장 가까운 특이점까지의 거리입니다. 그래서 실수 함수의 급수가 왜 거기서 멈추는지는 복소 평면에 숨은 특이점을 봐야 알 수 있습니다. 특이점 둘레의 고리에서는 음의 거듭제곱까지 쓰는 로랑 급수를 쓰고, 계수는 원 위의 적분으로 구합니다. 음의 거듭제곱이 없으면 제거 가능, 유한 개면 극, 무한 개면 진성 특이점이고, 진성 특이점 근처에서 함수는 거의 모든 값을 지납니다.
      </Callout>
      <Quiz
        q={
          <>
            <M>{'f(z)=\\dfrac{1}{z^2-4z+5}'}</M>를 <M>{'z=0'}</M>을 중심으로 테일러 급수로 전개했습니다. 수렴 반지름은 얼마일까요?
          </>
        }
        options={['1', '2', '√5', '5']}
        answer={2}
        explain={
          <>
            분모 <M>{'z^2-4z+5'}</M>의 근은 <M>{'z=2\\pm i'}</M>이고, f는 이 두 점을 빼면 모든 곳에서 정칙입니다. 0에서 두 극까지의 거리는 모두 <M>{'\\sqrt{2^2+1^2}=\\sqrt5'}</M>이므로 수렴 반지름은 <M>{'\\sqrt5\\approx2.24'}</M>입니다. 실수축 위의 분모 <M>{'(x-2)^2+1'}</M>은 0이 되지 않으니, 실수만 보면 이 답을 짐작하기 어렵습니다.
          </>
        }
      />
    </>
  );
}
