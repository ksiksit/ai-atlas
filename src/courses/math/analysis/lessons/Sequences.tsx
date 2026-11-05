import { useMemo, useState } from 'react';
import { Button, Callout, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { CAUCHY, DEFAULT_HALVES, FAR, SEQS, bolzano, cauchyN, epsN, newtonSqrt2, type CauchyId, type Half, type SeqId } from './seq';
import './analysis.css';
import './sequences.css';

const nf = (v: number, d = 6) => String(+v.toFixed(d));
const lg10 = Math.log10;

function Proof({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sq-proof" role="note" aria-label={title}>
      <div className="sq-proof-head">{title}</div>
      {children}
    </div>
  );
}
const Qed = () => <span className="sq-qed">∎</span>;

/** Grid lines and labels for a log-scaled n axis drawn in a Plot whose x is log10(n). */
function logNAxis(p: Plot, maxPow: number) {
  const P = p.p;
  for (let k = 0; k <= maxPow; k++) {
    p.line(k, p.yMin, k, p.yMax, P.grid, 1);
    p.text(k === 0 ? '1' : `10${k === 1 ? '' : ['', '', '²', '³', '⁴', '⁵'][k]}`, k, p.yMin, P.ink3, { align: 'center', base: 'top', dy: 4, font: `10px ${P.fontMono}` });
  }
}

/** n values to draw: every n up to 400, then about 300 points spread evenly on a log scale. */
function nSamples(nMax: number): number[] {
  const out: number[] = [];
  for (let n = 1; n <= Math.min(400, nMax); n++) out.push(n);
  if (nMax > 400) {
    const a = lg10(400), b = lg10(nMax);
    for (let i = 1; i <= 300; i++) out.push(Math.round(10 ** (a + ((b - a) * i) / 300)));
  }
  return out;
}

/* ─────────────── Figure 1: the ε-N game ─────────────── */

function EpsNFigure() {
  const P = usePalette();
  const [id, setId] = useState<SeqId>('inv');
  const [le, setLe] = useState(-1);
  const [Lsign, setLsign] = useState(0);
  const s = SEQS.find((x) => x.id === id)!;
  const eps = 10 ** le;
  const L = s.L ?? Lsign;
  const r = useMemo(() => epsN(s, L, eps), [s, L, eps]);
  const nMax = r.N === null ? 60 : Math.min(10000, Math.max(30, r.N * 4));
  const maxPow = Math.ceil(lg10(nMax));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yLo = Math.min(s.yMin, L - eps * 1.1), yHi = Math.max(s.yMax, L + eps * 1.1);
      const p = new Plot(ctx, w, h, P, { xMin: -0.05, xMax: maxPow + 0.05, yMin: yLo, yMax: yHi, pad: { l: 48, r: 12, t: 12, b: 26 } });
      logNAxis(p, maxPow);
      for (let k = 0; k <= 4; k++) {
        const y = yLo + ((yHi - yLo) * k) / 4;
        p.text(nf(y, 3), -0.05, y, P.ink3, { align: 'right', dx: -6, font: `10px ${P.fontMono}` });
      }
      // the ε band around L
      ctx.fillStyle = alpha(P.accent, 0.13);
      ctx.fillRect(p.X(-0.05), p.Y(L + eps), p.X(maxPow + 0.05) - p.X(-0.05), p.Y(L - eps) - p.Y(L + eps));
      p.line(-0.05, L, maxPow + 0.05, L, alpha(P.accent, 0.8), 1.5, [5, 4]);
      if (r.N !== null) p.line(lg10(r.N), yLo, lg10(r.N), yHi, P.pos, 2);
      for (const n of nSamples(nMax)) {
        const v = s.a(n);
        const inside = Math.abs(v - L) < eps - 1e-12;
        const col = !inside ? P.bad : r.N !== null && n >= r.N ? P.good : P.ink3;
        p.dot(lg10(n), v, n <= 400 ? 2.6 : 2, col);
      }
      if (r.N !== null) p.text(`N = ${r.N.toLocaleString('ko-KR')}`, lg10(r.N), yHi, P.ink, { align: 'left', base: 'top', dx: 6, dy: 2, font: `600 11px ${P.fontMono}`, bg: P.surface });
    },
    [P, s, L, eps, r, nMax, maxPow],
    { aspect: 2, maxHeight: 340, minHeight: 40 },
  );

  const verdict =
    r.N === null
      ? `L = ${nf(L, 3)}, ε = ${nf(eps, 4)}로는 어떤 N도 통하지 않습니다. 홀수 번째와 짝수 번째 항이 ±1을 오가므로, 길이 2ε의 띠가 두 값을 함께 담으려면 ε가 1보다 커야 합니다.`
      : r.lastBad === null
        ? `처음부터 모든 항이 띠 안에 있으므로 N = 1입니다.`
        : `${r.lastBad.toLocaleString('ko-KR')}번째 항까지는 띠를 벗어나는 항이 있고, ${r.N.toLocaleString('ko-KR')}번째 항부터는 모두 띠 안에 있습니다. 그러니 N = ${r.N.toLocaleString('ko-KR')}입니다.`;

  return (
    <Figure
      no={1}
      title="ε를 주면 N을 찾는 게임"
      hint="수열과 ε를 바꿔 보세요. (−1)ⁿ에서는 L도 옮겨 보세요"
      caption={
        <>
          가로축은 항의 번호 n이고 로그 눈금입니다. 파란 띠가 L − ε부터 L + ε까지이고, 띠를 벗어난 항은 빨간 점, N 이후 띠 안의 항은 초록 점입니다. 주황 세로선이 N입니다. N은 20만 번째 항까지 직접 확인해서 찾고, 여기 있는 수열들은 |aₙ − L|이 홀짝 각각에서 줄어들기만 하므로 그 뒤도 띠를 벗어나지 않습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={setId} options={SEQS.map((x) => ({ value: x.id, label: x.label }))} />
      </div>
      <div className="sq-settex">
        <M>{`${s.tex}, \\qquad L = ${s.L === null ? '?' : s.id === 'euler' ? 'e' : nf(s.L, 3)}`}</M>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`수열 ${s.label}, L = ${nf(L, 4)}, ε = ${nf(eps, 4)}. ${r.N === null ? '맞는 N이 없습니다.' : `N = ${r.N}입니다.`}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <Slider id="sq-eps" label="ε" value={le} min={-3} max={0.2} step={0.01} onChange={setLe} format={() => nf(eps, 4)} />
        {s.L === null && <Slider id="sq-L" label="후보 극한 L" value={Lsign} min={-1.5} max={1.5} step={0.01} onChange={setLsign} format={(x) => nf(x, 2)} />}
      </div>
      <div className="readouts">
        <Readout label="N" value={r.N === null ? '없음' : r.N.toLocaleString('ko-KR')} color={r.N === null ? 'var(--bad)' : 'var(--pos)'} />
        <Readout label="띠를 벗어난 항의 수" value={r.badCount.toLocaleString('ko-KR')} />
        <Readout label={r.N === null ? '|a₁ − L|' : '|a_N − L|'} value={nf(Math.abs(s.a(r.N ?? 1) - L), 5)} />
      </div>
      <p className="an-note" aria-live="polite">
        {verdict}
      </p>
    </Figure>
  );
}

/* ─────────────── Figure 2: decreasing and bounded below ─────────────── */

const NEWTON = newtonSqrt2(5);

function MonotoneFigure() {
  const P = usePalette();
  const [x1, setX1] = useState(2);
  const xs = useMemo(() => {
    const out = [x1];
    for (let k = 1; k < 7; k++) out.push((out[k - 1] + 2 / out[k - 1]) / 2);
    return out;
  }, [x1]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yHi = Math.max(...xs) + 0.1, yLo = Math.min(1.3, Math.min(...xs) - 0.05);
      const p = new Plot(ctx, w, h, P, { xMin: 0.6, xMax: 7.4, yMin: yLo, yMax: yHi, pad: { l: 44, r: 12, t: 12, b: 26 } });
      p.grid({ xStep: 1, fmt: (v) => nf(v, 2) });
      p.line(0.6, Math.SQRT2, 7.4, Math.SQRT2, P.good, 1.5, [5, 4]);
      p.text('√2', 7.4, Math.SQRT2, P.good, { align: 'right', base: 'bottom', dy: -3, font: `600 11px ${P.fontMono}` });
      for (let k = 1; k < xs.length; k++) p.line(k, xs[k - 1], k + 1, xs[k], alpha(P.accent, 0.6), 1.5);
      xs.forEach((x, k) => p.dot(k + 1, x, 4.5, k === 0 ? P.ink3 : P.accent));
    },
    [P, xs],
    { aspect: 2.1, maxHeight: 280, minHeight: 40 },
  );

  return (
    <Figure
      no={2}
      title="줄어들기만 하고 아래가 막힌 수열"
      hint="처음 값 x₁을 바꿔 보세요"
      caption={
        <>
          xₙ₊₁ = (xₙ + 2/xₙ)/2로 만든 수열입니다. 가로축은 n, 세로축은 xₙ이고 초록 점선이 √2입니다. 처음 값이 √2보다 작아도 둘째 항부터는 √2 이상이 되고, 그다음부터는 줄어들기만 합니다. 표는 x₁ = 2일 때의 항을 정확한 분수로 적은 것입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="an-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`x₁ = ${nf(x1, 2)}에서 시작한 수열: ${xs.map((x) => nf(x, 6)).join(', ')}. 둘째 항부터 √2로 줄어듭니다.`}>
            <canvas ref={canvasRef} />
          </div>
          <Slider id="sq-x1" label="처음 값 x₁" value={x1} min={0.5} max={4} step={0.01} onChange={setX1} format={(x) => nf(x, 2)} />
        </div>
        <div className="tbl-wrap" style={{ margin: 0 }}>
          <table className="sq-table">
            <thead>
              <tr>
                <th>n</th>
                <th>xₙ (x₁ = 2)</th>
                <th>xₙ − √2</th>
              </tr>
            </thead>
            <tbody>
              {NEWTON.map((r) => (
                <tr key={r.n}>
                  <td>{r.n}</td>
                  <td className="sq-mono">{r.frac}</td>
                  <td className="sq-mono">{r.gap === 0 ? '0' : r.gap.toExponential(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: Bolzano–Weierstrass by halving ─────────────── */

const SAMPLE = 200000;
function halfCounts(lo: number, hi: number): [number, number] {
  const mid = (lo + hi) / 2;
  let l = 0, u = 0;
  for (let n = 1; n <= SAMPLE; n++) {
    const v = Math.sin(n);
    if (v >= lo && v < mid) l++;
    else if (v >= mid && v <= hi) u++;
  }
  return [l, u];
}

function BolzanoFigure() {
  const P = usePalette();
  const [choices, setChoices] = useState<Half[]>(DEFAULT_HALVES);
  const steps = useMemo(() => bolzano(choices), [choices]);
  const cur = steps[steps.length - 1];
  const [lc, uc] = useMemo(() => halfCounts(cur.lo, cur.hi), [cur.lo, cur.hi]);
  const pick = (h: Half) => setChoices((c) => (c.length < 14 ? [...c, h] : c));
  const maxPow = 5;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: -0.05, xMax: maxPow, yMin: -1.08, yMax: 1.08, pad: { l: 40, r: 12, t: 10, b: 26 } });
      logNAxis(p, maxPow);
      for (const y of [-1, -0.5, 0, 0.5, 1]) p.text(nf(y, 1), -0.05, y, P.ink3, { align: 'right', dx: -6, font: `10px ${P.fontMono}` });
      // every term up to 3000, faint
      for (let n = 1; n <= 3000; n++) p.dot(lg10(n), Math.sin(n), 1.2, alpha(P.ink3, 0.45));
      // the nested intervals, each drawn from its own n_k onward
      steps.forEach((st, k) => {
        const x0 = lg10(st.nk);
        ctx.fillStyle = alpha(P.accent, 0.08 + 0.02 * Math.min(k, 8));
        ctx.fillRect(p.X(x0), p.Y(st.hi), p.X(maxPow) - p.X(x0), Math.max(1.5, p.Y(st.lo) - p.Y(st.hi)));
      });
      // the chosen subsequence
      for (let k = 1; k < steps.length; k++) p.line(lg10(steps[k - 1].nk), steps[k - 1].term, lg10(steps[k].nk), steps[k].term, alpha(P.pos, 0.7), 1.5);
      steps.forEach((st) => p.dot(lg10(st.nk), st.term, 4, P.pos, P.surface, 1.5));
    },
    [P, steps],
    { aspect: 2, maxHeight: 340, minHeight: 40 },
  );

  return (
    <Figure
      no={3}
      title="반씩 잘라 수렴하는 부분수열 고르기"
      hint="위 절반이나 아래 절반을 골라 보세요. 두 쪽 모두 항이 끝없이 들어옵니다"
      caption={
        <>
          회색 점은 sin n의 처음 3,000개 항입니다(가로축 n은 로그 눈금). 파란 띠가 지금까지 고른 구간들이고, 주황 점이 각 구간에서 고른 항 n₁ &lt; n₂ &lt; … 입니다. "무한히 많다"는 것은 화면에서 볼 수 없으므로, 처음 20만 개 항 중 각 절반에 든 개수를 함께 보여 줍니다. sin n은 [−1, 1]의 어느 작은 구간에도 끝없이 들어오므로 어느 쪽을 골라도 됩니다.
        </>
      }
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${steps.length - 1}번 반으로 잘라 지금 구간은 [${nf(cur.lo, 6)}, ${nf(cur.hi, 6)}], 마지막으로 고른 항은 n = ${cur.nk}, sin n = ${nf(cur.term, 6)}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="sq-halves">
        <div className="sq-half">
          <span>아래 절반 [{nf(cur.lo, 6)}, {nf((cur.lo + cur.hi) / 2, 6)})</span>
          <span>
            처음 20만 항 중 <strong>{lc.toLocaleString('ko-KR')}</strong>개
          </span>
          <Button small onClick={() => pick('lower')} disabled={choices.length >= 14}>
            아래 절반 고르기
          </Button>
        </div>
        <div className="sq-half">
          <span>위 절반 [{nf((cur.lo + cur.hi) / 2, 6)}, {nf(cur.hi, 6)}]</span>
          <span>
            처음 20만 항 중 <strong>{uc.toLocaleString('ko-KR')}</strong>개
          </span>
          <Button small onClick={() => pick('upper')} disabled={choices.length >= 14}>
            위 절반 고르기
          </Button>
        </div>
      </div>
      <div className="controls row">
        <div className="btn-row">
          <Button small onClick={() => setChoices((c) => c.slice(0, -1))} disabled={!choices.length}>
            한 단계 되돌리기
          </Button>
          <Button small onClick={() => setChoices([])}>
            처음 구간 [−1, 1]로
          </Button>
          <Button small onClick={() => setChoices(DEFAULT_HALVES)}>
            위·아래 번갈아 12번
          </Button>
        </div>
      </div>
      <div className="readouts">
        <Readout label="자른 횟수" value={`${steps.length - 1}번`} />
        <Readout label="구간 길이" value={(cur.hi - cur.lo).toExponential(2)} />
        <Readout label="고른 항" value={`n = ${cur.nk.toLocaleString('ko-KR')}`} color="var(--pos)" />
        <Readout label="sin n" value={nf(cur.term, 6)} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: Cauchy tails ─────────────── */

function CauchyFigure() {
  const P = usePalette();
  const [id, setId] = useState<CauchyId>('basel');
  const [le, setLe] = useState(-2);
  const c = CAUCHY.find((x) => x.id === id)!;
  const eps = 10 ** le;
  const N = useMemo(() => cauchyN(c, eps, FAR, 20000), [c, eps]);
  const spread = N === null ? null : c.spread(N, FAR);
  const maxPow = 5;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yLo = id === 'harmonic' ? 0.8 : id === 'basel' ? 0.95 : 0.95, yHi = id === 'harmonic' ? 12.6 : id === 'basel' ? 1.7 : 1.46;
      const p = new Plot(ctx, w, h, P, { xMin: -0.05, xMax: maxPow, yMin: yLo, yMax: yHi, pad: { l: 44, r: 12, t: 10, b: 26 } });
      logNAxis(p, maxPow);
      for (let k = 0; k <= 4; k++) {
        const y = yLo + ((yHi - yLo) * k) / 4;
        p.text(nf(y, 2), -0.05, y, P.ink3, { align: 'right', dx: -6, font: `10px ${P.fontMono}` });
      }
      const ns = id === 'decimals' ? Array.from({ length: 17 }, (_, k) => k + 1) : nSamples(FAR);
      if (N !== null) {
        const top = c.a(id === 'decimals' ? 17 : FAR), bot = c.a(N);
        ctx.fillStyle = alpha(P.good, 0.16);
        ctx.fillRect(p.X(lg10(N)), p.Y(Math.max(top, bot)), p.X(maxPow) - p.X(lg10(N)), Math.max(2, Math.abs(p.Y(top) - p.Y(bot))));
        p.line(lg10(N), yLo, lg10(N), yHi, P.pos, 2);
      }
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ns.forEach((n, k) => (k ? ctx.lineTo(p.X(lg10(n)), p.Y(c.a(n))) : ctx.moveTo(p.X(lg10(n)), p.Y(c.a(n)))));
      ctx.stroke();
      if (id === 'decimals') ns.forEach((n) => p.dot(lg10(n), c.a(n), 3, P.accent));
    },
    [P, c, id, N],
    { aspect: 2, maxHeight: 320, minHeight: 40 },
  );

  return (
    <Figure
      no={4}
      title="꼬리가 얼마나 퍼져 있나"
      hint="수열과 ε를 바꿔 보세요"
      caption={
        <>
          {c.limitNote}. 가로축 n은 로그 눈금입니다. 주황 세로선이 N이고, 초록 띠는 N번째 이후 항들이 퍼져 있는 폭, 곧 m, n ≥ N일 때 |aₘ − aₙ|의 최댓값입니다(m은 10만까지 확인). 극한을 몰라도 이 폭이 ε보다 작아지는 N을 찾을 수 있는지가 코시 수열의 조건입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={setId} options={CAUCHY.map((x) => ({ value: x.id, label: x.label }))} />
      </div>
      <div className="sq-settex">
        <M>{c.tex}</M>
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${c.label}, ε = ${nf(eps, 4)}. ${N === null ? '꼬리의 폭을 ε보다 작게 하는 N이 없습니다.' : `N = ${N}부터 꼬리의 폭이 ${nf(spread ?? 0, 6)}입니다.`}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <Slider id="sq-ceps" label="ε" value={le} min={-3.5} max={-0.5} step={0.01} onChange={setLe} format={() => nf(eps, 5)} />
      </div>
      <div className="readouts">
        <Readout label="N" value={N === null ? '없음' : N.toLocaleString('ko-KR')} color={N === null ? 'var(--bad)' : 'var(--pos)'} />
        <Readout label="N 이후 꼬리의 폭" value={spread === null ? '–' : nf(spread, 6)} />
        <Readout label="극한" value={id === 'basel' ? 'π²/6 ≈ 1.6449' : id === 'harmonic' ? '없음 (발산)' : '√2 (유리수 아님)'} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Sequences() {
  return (
    <>
      <h2>"한없이 가까워진다"를 게임으로</h2>
      <p>
        <a href={lessonHref('math-calculus', 'series')}>미적분학</a>에서는 1/n이 0에 "한없이 가까워진다"고 말했습니다. 하지만 "한없이"는 측정할 수 있는 말이 아닙니다. 1/n은 −1에도 계속 가까워지고 있으니까요(거리가 점점 줄어듭니다). 0과 −1을 가르는 것은 얼마나 가까이 가는가입니다. 0에는 아무리 작은 거리를 정해도 결국 그보다 더 가까워지고, −1에는 거리 1 밑으로 내려가지 못합니다.
      </p>
      <p>이 차이를 두 사람의 게임으로 정의합니다. 상대가 아무리 작은 오차 ε를 내놓아도, 나는 "이 번호 N부터는 모든 항이 L에서 ε 안에 있다"고 답할 수 있어야 합니다.</p>
      <MB note="수열 aₙ이 L로 수렴한다">{'\\forall \\varepsilon > 0\\ \\ \\exists N \\in \\mathbb{N}\\ \\ \\forall n \\ge N : \\quad |a_n - L| < \\varepsilon'}</MB>
      <p>
        이때 <M>{'\\lim_{n\\to\\infty} a_n = L'}</M> 또는 <M>{'a_n \\to L'}</M>로 쓰고, 어떤 L로도 수렴하지 않는 수열은 <T en="diverge">발산</T>한다고 합니다. 기호의 순서가 중요합니다. N은 ε를 본 다음에 고르므로 ε에 따라 달라져도 되지만, N을 고른 뒤에는 그 뒤의 모든 n이 조건을 만족해야 합니다. 그림 1에서 상대가 되어 ε를 줄여 보세요.
      </p>
      <EpsNFigure />
      <p>
        1/n에서 ε = 0.1이면 N = 11입니다. 10번째 항 1/10은 정확히 0.1이어서 "0.1보다 작다"를 만족하지 못하기 때문입니다. ε를 0.01, 0.001로 줄이면 N은 101, 1001이 됩니다. 일반적으로 <M>{'N > 1/\\varepsilon'}</M>인 자연수를 고르면 되고, 이런 N이 언제나 있다는 것이 앞 장의 <a href={lessonHref('math-analysis', 'real-numbers')}>아르키메데스 성질</a>입니다. 그것이 1/n → 0의 증명 전부입니다. n/(n+1) → 1에서는 <M>{'|a_n - 1| = 1/(n+1)'}</M>이므로 ε = 0.1일 때 N = 10이고, (1 + 1/n)ⁿ → e는 수렴이 느려서 ε = 0.1에 N = 13, ε = 0.01에 N = 135가 필요합니다.
      </p>
      <p>
        (−1)ⁿ은 −1, 1, −1, 1, … 을 오갑니다. L을 어디에 놓아도 ε가 1 이하이면 −1과 1 중 적어도 하나는 띠 밖에 있고, 그런 항이 끝없이 나오므로 N을 고를 수 없습니다. L = 0이고 ε가 1보다 크면 띠가 두 값을 모두 담지만, 정의는 <strong>모든</strong> ε에 대해 N이 있어야 하므로 ε 하나에서 통하는 것으로는 부족합니다. 그래서 (−1)ⁿ은 발산합니다.
      </p>

      <h2>정의에서 바로 나오는 것들</h2>
      <p>정의를 정확히 적어 두면 직관으로 당연한 성질도 증명할 수 있고, 증명 과정에서 왜 그런지가 드러납니다. 가장 자주 쓰는 두 가지입니다.</p>
      <Proof title="정리. 수열의 극한은 많아야 하나다.">
        <p>
          <M>{'a_n \\to L'}</M>이고 <M>{"a_n \\to L'"}</M>이며 <M>{"L \\ne L'"}</M>이라고 합시다. <M>{"\\varepsilon = |L - L'|/2"}</M>로 두면, 첫째 수렴에서 n ≥ N₁이면 <M>{'|a_n - L| < \\varepsilon'}</M>, 둘째에서 n ≥ N₂이면 <M>{"|a_n - L'| < \\varepsilon"}</M>입니다. n을 N₁과 N₂보다 크게 잡으면 삼각부등식으로 <M>{"|L - L'| \\le |L - a_n| + |a_n - L'| < 2\\varepsilon = |L - L'|"}</M>이 되어 모순입니다.
          <Qed />
        </p>
      </Proof>
      <Proof title="정리. 수렴하는 수열은 유계다.">
        <p>
          <M>{'a_n \\to L'}</M>이면 ε = 1에 대한 N이 있어서 n ≥ N일 때 <M>{'|a_n| \\le |L| + 1'}</M>입니다. N보다 앞의 항은 유한 개뿐이므로 <M>{'M = \\max(|a_1|, \\dots, |a_{N-1}|, |L| + 1)'}</M>로 두면 모든 n에서 <M>{'|a_n| \\le M'}</M>입니다.
          <Qed />
        </p>
      </Proof>
      <p>둘째 정리의 대우에 따라 유계가 아닌 수열(예를 들어 n이나 조화급수의 부분합)은 수렴하지 않습니다. 하지만 유계라고 수렴하지는 않습니다. (−1)ⁿ이 그 예입니다.</p>

      <h2>단조 수렴 정리</h2>
      <p>
        극한을 미리 알아야만 수렴을 보일 수 있다면 쓸모가 적습니다. 극한이 √2처럼 아직 이름이 없는 수일 수도 있으니까요. 다음 정리는 극한 값을 몰라도 수렴을 보장하고, 그 근거가 바로 완비성 공리입니다.
      </p>
      <Proof title="정리 (단조 수렴 정리). 증가하고 위로 유계인 수열은 수렴한다. 그 극한은 항들의 상한이다. (감소하고 아래로 유계인 수열은 하한으로 수렴한다.)">
        <p>
          증가하고 위로 유계인 수열 aₙ의 항들의 집합은 공집합이 아니고 위로 유계이므로 완비성 공리에 따라 상한 s가 있습니다. ε &gt; 0이 주어지면 s − ε는 상계가 아니므로 <M>{'a_N > s - \\varepsilon'}</M>인 N이 있습니다. 수열이 증가하므로 n ≥ N이면 <M>{'s - \\varepsilon < a_N \\le a_n \\le s'}</M>, 곧 <M>{'|a_n - s| < \\varepsilon'}</M>입니다.
          <Qed />
        </p>
      </Proof>
      <MonotoneFigure />
      <p>
        x₁ = 2에서 시작하면 2, 3/2, 17/12, 577/408, 665857/470832로 줄어듭니다. 이 수열이 수렴한다는 것은 단조 수렴 정리로 증명됩니다. 산술-기하 평균 부등식 <M>{'\\tfrac{1}{2}(x + 2/x) \\ge \\sqrt{x \\cdot 2/x} = \\sqrt{2}'}</M>에서 둘째 항부터는 모두 √2 이상이고(아래로 유계), 그러면 <M>{'x_{n+1} - x_n = (2 - x_n^2)/(2x_n) \\le 0'}</M>이므로 감소합니다. 극한 s는 <M>{'s = (s + 2/s)/2'}</M>를 만족하므로 <M>{'s^2 = 2'}</M>입니다. 표에서 √2와의 차이는 1단계에 0.59, 4단계에 2.1 × 10⁻⁶, 5단계에 1.6 × 10⁻¹²로 줄어듭니다. 이 값들은 모두 유리수이고, 앞 장 그림 1의 위 경계와 같은 수열입니다. 유리수 안에서는 이 수열이 수렴할 곳이 없었지만, 실수 안에서는 완비성 덕분에 √2라는 극한이 생깁니다.
      </p>

      <h2>볼차노-바이어슈트라스 정리</h2>
      <p>
        (−1)ⁿ은 수렴하지 않지만 짝수 번째 항만 모으면 1로 수렴합니다. 수열에서 순서를 지키며 무한히 많은 항을 골라 만든 수열 <M>{'a_{n_1}, a_{n_2}, \\dots'}</M>(<M>{'n_1 < n_2 < \\cdots'}</M>)를 <T en="subsequence">부분수열</T>이라고 합니다. 유계이기만 하면 언제나 수렴하는 부분수열을 골라낼 수 있다는 것이 다음 정리입니다.
      </p>
      <Proof title="정리 (볼차노-바이어슈트라스). 유계인 실수열에는 수렴하는 부분수열이 있다.">
        <p>
          모든 항이 구간 I₀ = [a, b]에 있다고 합시다. I₀을 반으로 자르면 두 절반 중 적어도 하나에는 무한히 많은 n의 항이 들어 있습니다. 그런 절반을 I₁이라 하고 I₁ 안의 항 하나를 골라 n₁로 둡니다. 다시 I₁을 반으로 잘라 무한히 많은 항이 든 절반 I₂를 고르고, I₂ 안에서 n₁보다 큰 번호 n₂를 고릅니다(무한히 많으니 언제나 고를 수 있습니다). 이렇게 하면 구간들은 한 번에 반씩 줄며 겹쳐 들어가고, 고른 항들은 모두 Iₖ 안에 있습니다.
        </p>
        <p>
          구간 Iₖ의 왼쪽 끝은 증가하고 위로 유계이므로 단조 수렴 정리로 어떤 c로 수렴하고, 구간의 길이 <M>{'(b - a)/2^k'}</M>는 0으로 가므로 오른쪽 끝도 같은 c로 수렴합니다. 고른 항 <M>{'a_{n_k}'}</M>는 두 끝 사이에 끼어 있으므로 c로 수렴합니다.
          <Qed />
        </p>
      </Proof>
      <BolzanoFigure />
      <p>
        sin n은 [−1, 1] 사이를 불규칙하게 오가고 수렴하지 않습니다. 처음 설정은 위, 아래, 위, 아래 … 를 번갈아 12번 고른 것으로, 구간이 [0.333008, 0.333496]까지 줄고 고른 항은 n = 2, 3, 9, 28, 82, … 를 거쳐 열두 번째에 n = 39176, sin 39176 ≈ 0.333119입니다. 이렇게 번갈아 고르면 구간의 끝은 1/3로 수렴합니다. 구간 길이가 약 0.0005까지 좁아졌지만, 그림 아래 칸을 보면 처음 20만 항 중에서도 이 구간의 아래 절반에 17개, 위 절반에 16개가 들어 있어 어느 쪽을 골라도 계속 이어 갈 수 있습니다. 위만 열두 번 고르면 1로 수렴하는 다른 부분수열이 나옵니다. 부분수열의 극한은 하나가 아닐 수 있고, 정리는 적어도 하나가 있다는 것만 말합니다.
      </p>

      <h2>코시 수열: 극한을 몰라도 수렴을 판정한다</h2>
      <p>
        단조 수렴 정리는 단조 수열에만 쓸 수 있습니다. 일반적인 수열이 수렴하는지 극한을 모르고도 판정하려면, 항들이 L에 가까워지는지 대신 <strong>서로</strong> 가까워지는지를 봅니다. 이런 수열을 <T en="Cauchy sequence">코시 수열</T>이라고 합니다.
      </p>
      <MB note="aₙ이 코시 수열이다">{'\\forall \\varepsilon > 0\\ \\ \\exists N\\ \\ \\forall m, n \\ge N : \\quad |a_m - a_n| < \\varepsilon'}</MB>
      <Proof title="정리. 실수열은 수렴하는 것과 코시 수열인 것이 같다.">
        <p>
          수렴하면 코시: <M>{'a_n \\to L'}</M>이면 ε/2에 대한 N이 있어, m, n ≥ N일 때 <M>{'|a_m - a_n| \\le |a_m - L| + |L - a_n| < \\varepsilon/2 + \\varepsilon/2 = \\varepsilon'}</M>입니다.
        </p>
        <p>
          코시면 수렴: 코시 수열은 유계입니다(ε = 1로 위의 "수렴하면 유계"와 같은 논리). 볼차노-바이어슈트라스 정리로 어떤 c로 수렴하는 부분수열 <M>{'a_{n_k}'}</M>가 있습니다. ε/2에 대한 코시 조건의 N을 잡고, <M>{'n_k \\ge N'}</M>이면서 <M>{'|a_{n_k} - c| < \\varepsilon/2'}</M>인 k를 고르면, n ≥ N일 때 <M>{'|a_n - c| \\le |a_n - a_{n_k}| + |a_{n_k} - c| < \\varepsilon'}</M>입니다.
          <Qed />
        </p>
      </Proof>
      <CauchyFigure />
      <p>
        <M>{'\\sum 1/k^2'}</M>의 부분합은 ε = 0.01일 때 N = 100부터 꼬리의 폭이 0.00994로 ε보다 작습니다. 극한이 π²/6이라는 것(오일러가 처음 보였습니다)을 몰라도 수렴한다는 것은 이렇게 알 수 있습니다. 조화급수의 부분합은 반대입니다. 항끼리의 차이 1/n은 0으로 가지만 꼬리의 폭은 줄지 않습니다. <M>{'h_{10N} - h_N'}</M>을 계산하면 N = 10, 100, 1000일 때 2.26, 2.30, 2.30으로 ln 10 ≈ 2.30에 가까워집니다. 그래서 어떤 ε &lt; 2에도 N이 없고, 조화급수는 발산합니다.
      </p>
      <p>
        세 번째 수열 1, 1.4, 1.41, 1.414, … 는 모두 유리수이고, n번째 이후 항끼리의 차이는 <M>{'10^{-(n-1)}'}</M>보다 작으므로 유리수 안에서도 코시 수열입니다. 하지만 유리수 중에는 극한이 없습니다. 극한이 되어야 할 √2가 유리수가 아니기 때문입니다. 위 정리의 "코시면 수렴"은 볼차노-바이어슈트라스를 거쳐 완비성 공리에 기대고 있고, 유리수에서는 바로 그 단계가 무너집니다. 그래서 "모든 코시 수열이 수렴한다"를 완비성의 다른 표현으로 쓰기도 합니다.
      </p>

      <Callout kind="key">
        수열 aₙ이 L로 수렴한다는 것은 모든 ε &gt; 0에 대해 그 뒤의 모든 항이 L에서 ε 안에 드는 번호 N이 있다는 뜻입니다. 이 정의에서 극한이 하나뿐이라는 것과 수렴하면 유계라는 것이 나옵니다. 완비성 공리 덕분에 증가하고 위로 유계인 수열은 극한을 몰라도 수렴하고(단조 수렴 정리), 유계인 수열에는 수렴하는 부분수열이 있으며(볼차노-바이어슈트라스), 실수열은 항들이 서로 가까워지는 코시 수열일 때와 정확히 그때만 수렴합니다. 유리수에서는 √2의 소수 근삿값처럼 코시이면서 수렴하지 않는 수열이 있습니다.
      </Callout>
      <Quiz
        q="수열 aₙ에 대해 다음 중 aₙ이 수렴한다는 것을 보장하는 조건은?"
        options={['모든 n에서 |aₙ₊₁ − aₙ| < 1/n이다', 'aₙ은 유계이다', 'aₙ은 감소하고 모든 항이 0 이상이다', '어떤 ε > 0에 대해 n ≥ N이면 |aₙ − 0| < ε인 N이 있다']}
        answer={2}
        explain={<>감소하고 아래로 유계(0 이상)이므로 단조 수렴 정리에 따라 하한으로 수렴합니다. 이웃한 항의 차이가 줄어드는 것만으로는 부족합니다. 조화급수의 부분합은 이웃한 항의 차이가 1/(n+1)로 줄지만 발산합니다. 유계인 수열은 (−1)ⁿ처럼 발산할 수 있고, 마지막 조건은 ε 하나에 대해서만 성립하면 되므로 정의를 만족하지 않습니다.</>}
      />
    </>
  );
}
