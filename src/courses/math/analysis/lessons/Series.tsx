import { useMemo, useState } from 'react';
import { Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { RATIO_SUM, SERIES, cauchyN, harmonicBlock, partialSums, pattern, ratio, ratioBound, ratioTerm, rearrange, rearrangeToInfinity, type SeriesId } from './series';
import './analysis.css';
import './series.css';

const f4 = (v: number) => v.toFixed(4);

/* ─────────────── Figure 1: the Cauchy criterion, series by series ─────────────── */

const HORIZON = 2000;

function CauchyFigure() {
  const P = usePalette();
  const [id, setId] = useState<SeriesId>('alt');
  const [epsExp, setEpsExp] = useState(2);
  const eps = Math.pow(10, -epsExp);
  const s = SERIES.find((x) => x.id === id)!;
  const sums = useMemo(() => partialSums(s.term, HORIZON), [s]);
  const N = cauchyN(s, eps);
  const lo = Math.min(...sums), hi = Math.max(...sums);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yPad = (hi - lo) * 0.08 || 0.5;
      const p = new Plot(ctx, w, h, P, { xMin: 0, xMax: Math.log10(HORIZON), yMin: Math.min(0, lo - yPad), yMax: hi + yPad, pad: { l: 50, r: 14, t: 14, b: 32 } });
      p.grid({ xStep: 1, fmt: (v) => String(+v.toFixed(2)) });
      // relabel the log axis as n
      ctx.fillStyle = P.surface;
      ctx.fillRect(p.pad.l - 2, h - p.pad.b + 4, w - p.pad.l, p.pad.b - 4);
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const n of [1, 10, 100, 1000]) ctx.fillText(String(n), p.X(Math.log10(n)), h - p.pad.b + 6);
      ctx.textAlign = 'right';
      ctx.fillText('n (로그 눈금)', w - 14, h - p.pad.b + 18);
      if (s.sum !== null) {
        p.line(0, s.sum, p.xMax, s.sum, alpha(P.good, 0.8), 1.5, [6, 4]);
        p.text(`합 ${f4(s.sum)}`, p.xMax, s.sum, P.good, { align: 'right', dx: -4, dy: -12, font: `600 11px ${P.fontBody}`, bg: P.surface });
      }
      // the tail after N, boxed: every later partial sum stays inside a band narrower than ε
      if (N !== null && N <= HORIZON) {
        const tail = sums.slice(N - 1);
        const tlo = Math.min(...tail, s.sum ?? Infinity), thi = Math.max(...tail, s.sum ?? -Infinity);
        const x0 = p.X(Math.log10(N));
        ctx.fillStyle = alpha(P.hl, 0.22);
        ctx.fillRect(x0, p.Y(thi) - 3, p.X(p.xMax) - x0, Math.max(6, p.Y(tlo) - p.Y(thi) + 6));
        p.line(Math.log10(N), p.yMin, Math.log10(N), p.yMax, alpha(P.ink, 0.6), 1, [3, 3]);
        p.text(`N = ${N}`, Math.log10(N), p.yMax, P.ink, { dx: 4, dy: 12, align: 'left', font: `600 11px ${P.fontBody}`, bg: P.surface });
      }
      // partial sums as a polyline in log n
      ctx.save();
      p.clip();
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      sums.forEach((v, i) => {
        const x = p.X(Math.log10(i + 1)), y = p.Y(v);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
      for (let i = 0; i < Math.min(12, sums.length); i++) p.dot(Math.log10(i + 1), sums[i], 3, P.accent);
      p.unclip();
      ctx.restore();
    },
    [P, sums, s, N, lo, hi],
    { aspect: 1.9, maxHeight: 340 },
  );

  return (
    <Figure
      no={1}
      title="코시 판정: 꼬리가 얼마나 흔들리는가"
      hint="급수와 ε를 바꿔 보세요"
      caption={
        <>
          파란 선은 부분합 <M>{'S_n'}</M>을 n = 1부터 {HORIZON.toLocaleString('ko-KR')}까지 이은 것이고, 가로축은 로그 눈금입니다. 노란 띠는 N 이후의 모든 부분합이 들어가는 범위로, 그 높이가 ε보다 작아지는 첫 N을 표시합니다. 띠의 높이는 그래프에서 잰 것이 아니라 급수의 모양에서 정확히 계산했습니다. 조화급수에는 그런 N이 없습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="급수" value={id} onChange={setId} options={SERIES.map((x) => ({ value: x.id, label: x.name }))} />
        <Seg label="ε" value={epsExp} onChange={setEpsExp} options={[1, 2, 3].map((k) => ({ value: k, label: `10^−${k}` }))} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${s.name}의 부분합. ε = ${eps}일 때 ${N === null ? '조건을 만족하는 N이 없습니다' : `N = ${N}부터 뒤의 부분합이 모두 폭 ε 안에 듭니다`}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label="ε" value={String(eps)} />
        <Readout label="코시 조건의 N" value={N === null ? '없음' : String(N)} color={N === null ? 'var(--bad)' : 'var(--good)'} />
        <Readout label={id === 'harm' ? <>S₂₀₀₀ − S₁₀₀₀</> : '합'} value={id === 'harm' ? f4(harmonicBlock(1000)) : f4(s.sum!)} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the ratio test, proof by geometric comparison ─────────────── */

const RN = 18;

function RatioFigure() {
  const P = usePalette();
  const [q, setQ] = useState(0.75);
  const b = useMemo(() => ratioBound(q), [q]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: 0.3, xMax: RN + 0.7, yMin: 0, yMax: 1.7, pad: { l: 40, r: 14, t: 14, b: 30 } });
      p.grid({ xStep: 2, yStep: 0.5 });
      for (let n = 1; n <= RN; n++) {
        const a = ratioTerm(n);
        const x0 = p.X(n - 0.32), x1 = p.X(n + 0.32);
        ctx.fillStyle = n < b.N ? alpha(P.ink3, 0.45) : alpha(P.accent, 0.75);
        ctx.fillRect(x0, p.Y(a), x1 - x0, p.Y(0) - p.Y(a));
      }
      // the geometric bound from N on
      p.fn((x) => (x >= b.N ? ratioTerm(b.N) * Math.pow(q, x - b.N) : NaN), P.pos, 2, { from: b.N, to: RN + 0.5, samples: 300 });
      p.line(b.N - 0.5, 0, b.N - 0.5, 1.7, alpha(P.ink, 0.5), 1, [3, 3]);
      p.text(`N = ${b.N}`, b.N - 0.5, 1.7, P.ink, { dx: 4, dy: 12, align: 'left', font: `600 11px ${P.fontBody}`, bg: P.surface });
    },
    [P, q, b],
    { aspect: 2, maxHeight: 320 },
  );

  return (
    <Figure
      no={2}
      title="비율 판정: 결국 기하급수 아래로"
      hint="q를 1/2과 1 사이에서 움직여 보세요"
      caption={
        <>
          막대는 <M>{'a_n = n^2/2^n'}</M>입니다. 비율 <M>{'a_{n+1}/a_n'}</M>은 n이 커지면 1/2로 내려가므로, 1/2보다 큰 q를 정하면 어떤 N부터는 비율이 모두 q 이하가 됩니다. 그 뒤의 파란 막대는 주황 곡선 <M>{'a_N q^{\\,n-N}'}</M> 아래에 있고, 이 곡선의 합은 기하급수라 계산할 수 있습니다. 회색 막대는 처음 몇 항으로, 유한 개라 그대로 더합니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="se-q" label="q" value={q} min={0.55} max={0.95} step={0.05} onChange={setQ} format={(v) => v.toFixed(2)} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`n²/2ⁿ의 막대와 기하 상계. q = ${q}이면 N = ${b.N}이고, 합의 상계는 ${b.total.toFixed(4)}, 실제 합은 6입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <Readout label="N" value={String(b.N)} />
        <Readout label={<>앞부분 S<sub>N−1</sub></>} value={f4(b.head)} />
        <Readout label={<>꼬리 상계 a<sub>N</sub>/(1−q)</>} value={f4(b.tailBound)} color="var(--pos)" />
        <Readout label="상계 합 (실제 6)" value={f4(b.total)} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: Riemann's rearrangement ─────────────── */

function RearrangeFigure() {
  const P = usePalette();
  const [mode, setMode] = useState<'target' | 'inf'>('target');
  const [T, setT] = useState(1.5);
  const [count, setCount] = useState(2000);
  const r = useMemo(() => (mode === 'target' ? rearrange(() => T, count) : rearrangeToInfinity(count)), [mode, T, count]);
  const last = r.sums[r.sums.length - 1];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yMin = mode === 'target' ? Math.min(-2.2, ...r.sums.slice(0, 40)) : -0.2;
      const yMax = mode === 'target' ? Math.max(3.2, ...r.sums.slice(0, 40)) : Math.max(4.2, last + 0.3);
      // log axis in the number of terms, so the early zigzags are as visible as the long tail
      const L = (k: number) => Math.log10(k);
      const p = new Plot(ctx, w, h, P, { xMin: 0, xMax: L(count), yMin, yMax, pad: { l: 40, r: 14, t: 14, b: 32 } });
      p.grid({ xStep: 1, yStep: 1 });
      ctx.fillStyle = P.surface;
      ctx.fillRect(p.pad.l - 2, h - p.pad.b + 4, w - p.pad.l, p.pad.b - 4);
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const n of [1, 10, 100, 1000]) if (n <= count) ctx.fillText(String(n), p.X(L(n)), h - p.pad.b + 6);
      ctx.textAlign = 'right';
      ctx.fillText('쓴 항의 수 (로그 눈금)', w - 14, h - p.pad.b + 18);
      p.line(0, Math.LN2, p.xMax, Math.LN2, alpha(P.ink3, 0.7), 1, [4, 4]);
      p.text('원래 순서의 합 ln 2', 0, Math.LN2, P.ink3, { dx: 6, dy: 10, align: 'left', font: `11px ${P.fontBody}`, bg: P.surface });
      if (mode === 'target') {
        p.line(0, T, p.xMax, T, alpha(P.good, 0.9), 1.5, [6, 4]);
        p.text(`목표 T = ${T}`, p.xMax, T, P.good, { align: 'right', dx: -4, dy: -12, font: `600 11px ${P.fontBody}`, bg: P.surface });
      }
      // each step coloured by the sign of the term it added
      ctx.save();
      p.clip();
      ctx.lineWidth = 1.4;
      // step k (1-based) draws from the previous partial sum to S_k; the first step starts at S_0 = 0
      let prev = 0;
      r.sums.forEach((v, i) => {
        const k = i + 1;
        ctx.strokeStyle = r.terms[i] > 0 ? P.pos : P.neg;
        ctx.beginPath();
        ctx.moveTo(p.X(L(Math.max(1, k - 1))), p.Y(prev));
        ctx.lineTo(p.X(L(k)), p.Y(v));
        ctx.stroke();
        prev = v;
      });
      p.unclip();
      ctx.restore();
    },
    [P, r, mode, T, count, last],
    { aspect: 1.9, maxHeight: 340 },
  );

  return (
    <Figure
      no={3}
      title="순서만 바꿔 원하는 값 만들기"
      hint="목표 T를 정하고 항의 개수를 늘려 보세요"
      caption={
        <>
          교대 조화급수 <M>{'1 - \\tfrac12 + \\tfrac13 - \\tfrac14 + \\cdots'}</M>의 항을 하나도 빼거나 더하지 않고 순서만 바꿉니다. 합이 T 이하이면 아직 안 쓴 양수 항 <M>{'1, \\tfrac13, \\tfrac15, \\ldots'}</M> 중 다음 것을, T보다 크면 음수 항 <M>{'-\\tfrac12, -\\tfrac14, \\ldots'}</M> 중 다음 것을 더합니다. 주황은 양수 항을, 파랑은 음수 항을 더한 걸음이고, 가로축은 쓴 항의 수를 로그 눈금으로 나타냅니다. "+∞로"는 목표를 1, 2, 3, …으로 올리며 목표를 넘을 때마다 음수 항을 하나씩만 씁니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="방식" value={mode} onChange={setMode} options={[{ value: 'target', label: '목표 T로' }, { value: 'inf', label: '+∞로' }]} />
        {mode === 'target' && <Slider id="se-t" label="목표 T" value={T} min={-2} max={3} step={0.1} onChange={setT} format={(v) => v.toFixed(1)} />}
        <Slider id="se-n" label="항의 개수" value={count} min={20} max={2000} step={10} onChange={setCount} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`교대 조화급수를 다시 배열한 부분합 ${count}개. 마지막 부분합 ${f4(last)}, 양수 항 ${r.positives}개, 음수 항 ${r.negatives}개를 썼습니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label={`${count}번째 부분합`} value={f4(last)} />
        <Readout label="쓴 양수 항" value={`${r.positives}개`} color="var(--pos)" />
        <Readout label="쓴 음수 항" value={`${r.negatives}개`} color="var(--neg)" />
      </div>
      <Legend items={[{ color: 'var(--pos)', label: '양수 항을 더함', shape: 'ln' }, { color: 'var(--neg)', label: '음수 항을 더함', shape: 'ln' }]} />
    </Figure>
  );
}

/* ─────────────── Figure 4: the same pattern on a conditionally and an absolutely convergent series ─────────────── */

const PN = 3000;
const PATTERNS = [
  { value: '1-1', label: '양 1, 음 1 (원래 순서)', pos: 1, neg: 1, limit: Math.LN2, limitTex: '\\ln 2' },
  { value: '2-1', label: '양 2, 음 1', pos: 2, neg: 1, limit: 1.5 * Math.LN2, limitTex: '\\tfrac32\\ln 2' },
  { value: '1-2', label: '양 1, 음 2', pos: 1, neg: 2, limit: 0.5 * Math.LN2, limitTex: '\\tfrac12\\ln 2' },
] as const;

function PatternFigure() {
  const P = usePalette();
  const [pid, setPid] = useState<(typeof PATTERNS)[number]['value']>('2-1');
  const pat = PATTERNS.find((x) => x.value === pid)!;
  const harm = useMemo(() => pattern((n) => 1 / n, pat.pos, pat.neg, PN), [pat]);
  const sq = useMemo(() => pattern((n) => 1 / (n * n), pat.pos, pat.neg, PN), [pat]);
  const SQ = (Math.PI * Math.PI) / 12;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: 0, xMax: Math.log10(PN), yMin: 0, yMax: 1.6, pad: { l: 40, r: 14, t: 14, b: 32 } });
      p.grid({ xStep: 1, yStep: 0.5 });
      ctx.fillStyle = P.surface;
      ctx.fillRect(p.pad.l - 2, h - p.pad.b + 4, w - p.pad.l, p.pad.b - 4);
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const n of [1, 10, 100, 1000]) ctx.fillText(String(n), p.X(Math.log10(n)), h - p.pad.b + 6);
      p.line(0, pat.limit, p.xMax, pat.limit, alpha(P.pos, 0.7), 1, [5, 4]);
      p.line(0, SQ, p.xMax, SQ, alpha(P.neg, 0.7), 1, [5, 4]);
      const draw = (arr: number[], color: string) => {
        ctx.save();
        p.clip();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        arr.forEach((v, i) => (i ? ctx.lineTo(p.X(Math.log10(i + 1)), p.Y(v)) : ctx.moveTo(p.X(0), p.Y(v))));
        ctx.stroke();
        p.unclip();
        ctx.restore();
      };
      draw(harm, P.pos);
      draw(sq, P.neg);
    },
    [P, harm, sq, pat],
    { aspect: 2, maxHeight: 320 },
  );

  return (
    <Figure
      no={4}
      title="같은 재배열, 다른 결과"
      hint="재배열 방식을 바꿔 보세요"
      caption={
        <>
          두 교대급수에 같은 규칙을 씁니다. 양수 항 몇 개, 음수 항 몇 개를 번갈아 가져오되, 각 부호 안에서는 원래 순서를 지킵니다. 주황은 <M>{'\\sum (-1)^{n+1}/n'}</M>(조건 수렴), 파랑은 <M>{'\\sum (-1)^{n+1}/n^2'}</M>(절대 수렴)이고, 점선은 각각이 다가가는 값입니다. 가로축은 로그 눈금, 항은 {PN.toLocaleString('ko-KR')}개까지입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="재배열" value={pid} onChange={setPid} options={PATTERNS.map((x) => ({ value: x.value, label: x.label }))} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${pat.label} 규칙으로 재배열한 두 급수의 부분합. 조건 수렴하는 교대 조화급수는 ${f4(harm[PN - 1])}로, 절대 수렴하는 급수는 ${f4(sq[PN - 1])}로 갑니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <Readout label={<>교대 조화급수 ({PN}항)</>} value={<>{f4(harm[PN - 1])} <span style={{ color: 'var(--ink-3)' }}>→ <M>{pat.limitTex}</M> = {f4(pat.limit)}</span></>} color="var(--pos)" />
        <Readout label={<>교대 1/n² ({PN}항)</>} value={<>{f4(sq[PN - 1])} <span style={{ color: 'var(--ink-3)' }}>→ π²/12 = {f4(SQ)}</span></>} color="var(--neg)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Series() {
  return (
    <>
      <h2>무한히 더한다는 말의 뜻</h2>
      <p>
        <a href={lessonHref('math-calculus', 'series')}>미적분학의 급수 장</a>에서는 무한히 더한 값을 계산하고 판정법을 썼습니다. 이 장에서는 그 판정법들이 왜 맞는지 증명합니다. 출발점은 정의입니다. 무한히 많은 수를 실제로 더할 수는 없으니, 앞에서부터 n개를 더한 <T en="partial sum">부분합</T>의 수열을 보고, 그 수열의 극한을 급수의 합이라고 부릅니다.
      </p>
      <MB>{'\\sum_{n=1}^{\\infty} a_n = S \\quad\\Longleftrightarrow\\quad S_n = a_1 + a_2 + \\cdots + a_n \\ \\text{이고}\\ \\lim_{n\\to\\infty} S_n = S'}</MB>
      <p>
        그러니 급수에 대한 모든 질문은 <a href={lessonHref('math-analysis', 'sequences')}>수열의 수렴</a> 장의 도구로 답할 수 있습니다. 가장 쓸모 있는 것은 극한값을 몰라도 수렴을 판정하는 코시 판정입니다. 실수가 완비이므로, 수열은 코시 수열일 때 그리고 그때에만 수렴합니다. 이것을 부분합에 그대로 쓰면 다음을 얻습니다.
      </p>
      <div className="se-thm">
        <b>정리 (급수의 코시 판정).</b> <M>{'\\sum a_n'}</M>이 수렴할 필요충분조건은, 모든 <M>{'\\varepsilon > 0'}</M>에 대해 어떤 N이 있어 <M>{'m > n \\ge N'}</M>이면 <M>{'|a_{n+1} + \\cdots + a_m| < \\varepsilon'}</M>인 것입니다.
      </div>
      <p>
        식이 말하는 것은 "충분히 뒤로 가면, 어디서부터 어디까지 몇 항을 더하든 그 합이 ε보다 작다"입니다. 꼬리가 아무리 길어도 흔들림이 작아야 합니다. 그림 1에서 급수마다 그런 N을 찾아보세요.
      </p>
      <CauchyFigure />
      <p>
        ε = 0.01이면 기하급수 <M>{'\\sum 1/2^n'}</M>은 N = 7, <M>{'\\sum 1/n^2'}</M>과 교대 조화급수는 N = 100입니다. ε를 10배 줄이면 기하급수는 N이 3씩만 늘지만 나머지 둘은 N도 10배가 됩니다. 꼬리가 줄어드는 속도가 다르기 때문입니다. 조화급수에는 N이 없습니다. n이 무엇이든 <M>{'S_{2n} - S_n = \\tfrac{1}{n+1} + \\cdots + \\tfrac{1}{2n}'}</M>은 n개의 항이 모두 <M>{'\\tfrac{1}{2n}'}</M> 이상이므로 적어도 1/2이고, 실제로 n = 1000이면 {f4(harmonicBlock(1000))}입니다. 꼬리의 흔들림이 1/2 아래로 내려가지 않으니 코시 조건이 깨집니다.
      </p>
      <Callout kind="note">
        코시 판정에서 m = n + 1로 두면 <M>{'|a_{n+1}| < \\varepsilon'}</M>, 곧 <M>{'a_n \\to 0'}</M>이 나옵니다. 그래서 항이 0으로 가지 않는 급수는 발산합니다. 하지만 조화급수가 보여 주듯 그 반대는 성립하지 않습니다. 항이 0으로 가는 것은 필요조건일 뿐입니다.
      </Callout>

      <h2>비교 판정과 비율 판정의 증명</h2>
      <p>
        항이 모두 0 이상인 급수는 부분합이 줄어들지 않는 수열이므로, 위로 유계이기만 하면 단조 수렴 정리에 따라 수렴합니다. 비교 판정은 이 사실 하나에서 나옵니다.
      </p>
      <div className="se-thm">
        <b>정리 (비교 판정).</b> 모든 n에서 <M>{'0 \\le a_n \\le b_n'}</M>이고 <M>{'\\sum b_n'}</M>이 수렴하면 <M>{'\\sum a_n'}</M>도 수렴합니다.
      </div>
      <div className="se-proof">
        <p>
          <span className="se-proof-head">증명.</span> <M>{'\\sum a_n'}</M>의 부분합을 <M>{'A_n'}</M>, <M>{'\\sum b_n'}</M>의 부분합을 <M>{'B_n'}</M>, 그 합을 B라고 합시다. <M>{'a_{n+1} \\ge 0'}</M>이므로 <M>{'A_{n+1} = A_n + a_{n+1} \\ge A_n'}</M>, 곧 <M>{'(A_n)'}</M>은 단조증가합니다. 또 <M>{'b_n \\ge 0'}</M>이라 <M>{'(B_n)'}</M>도 단조증가하고 B로 수렴하므로 모든 n에서 <M>{'B_n \\le B'}</M>입니다. 따라서
        </p>
        <MB>{'A_n = a_1 + \\cdots + a_n \\le b_1 + \\cdots + b_n = B_n \\le B'}</MB>
        <p>
          이고 <M>{'(A_n)'}</M>은 위로 유계인 단조증가 수열입니다. 단조 수렴 정리(완비성 공리에서 나온 정리)에 따라 <M>{'(A_n)'}</M>은 수렴합니다. <span className="se-qed">∎</span>
        </p>
      </div>
      <p>
        비율 판정은 비교 판정에 기하급수를 대는 것입니다. 극한 비율이 1보다 작으면, 1보다 작은 q를 하나 골라 어느 순간부터 급수를 기하급수 아래에 가둡니다.
      </p>
      <div className="se-thm">
        <b>정리 (비율 판정).</b> <M>{'a_n > 0'}</M>이고 <M>{'\\lim a_{n+1}/a_n = L < 1'}</M>이면 <M>{'\\sum a_n'}</M>은 수렴합니다.
      </div>
      <div className="se-proof">
        <p>
          <span className="se-proof-head">증명.</span> L &lt; q &lt; 1인 q를 하나 고릅니다. 비율이 L로 수렴하므로, ε = q − L &gt; 0에 대해 어떤 N이 있어 n ≥ N이면 <M>{'a_{n+1}/a_n < L + \\varepsilon = q'}</M>입니다. 이 부등식을 k번 이어 쓰면 <M>{'a_{N+k} \\le a_N q^k'}</M>이고, <M>{'\\sum_k a_N q^k = a_N/(1-q)'}</M>은 수렴하는 기하급수입니다. 비교 판정에 따라 꼬리 <M>{'\\sum_{n \\ge N} a_n'}</M>이 수렴하고, 앞의 유한 개 항을 더해도 수렴은 바뀌지 않습니다. <span className="se-qed">∎</span>
        </p>
      </div>
      <RatioFigure />
      <p>
        <M>{'a_n = n^2/2^n'}</M>의 비율은 <M>{'(1 + 1/n)^2/2'}</M>이라 n = 1에서 {ratio(1).toFixed(1)}, n = 4에서 {ratio(4).toFixed(4)}, n = 5에서 {ratio(5).toFixed(4)}로 1/2을 향해 내려갑니다. q = 0.75로 잡으면 N = 5이고, 증명이 주는 상계는 앞 네 항의 합 3.625에 꼬리 상계 <M>{'a_5/(1-0.75) = 3.125'}</M>를 더한 6.75입니다. 실제 합은 {RATIO_SUM}입니다. q를 1/2 쪽으로 당기면 N은 늦어지지만 상계는 실제 합에 붙고(q = 0.6이면 N = 11, 상계 6.0051), 1 쪽으로 밀면 N은 빨라지지만 상계가 헐거워집니다(q = 0.9이면 N = 3, 상계 12.75). 증명에는 어떤 q든 하나면 충분합니다.
      </p>

      <h2>절대 수렴과 조건 수렴</h2>
      <p>
        <M>{'\\sum |a_n|'}</M>이 수렴하면 <M>{'\\sum a_n'}</M>을 <T en="absolutely convergent">절대 수렴</T>한다고 합니다. 절대 수렴하면 수렴합니다. 삼각부등식으로 <M>{'|a_{n+1} + \\cdots + a_m| \\le |a_{n+1}| + \\cdots + |a_m|'}</M>이고, 오른쪽이 코시 조건을 만족하니 왼쪽도 만족하기 때문입니다. 반대는 성립하지 않습니다. 교대 조화급수는 ln 2로 수렴하지만, 절댓값을 씌우면 조화급수가 되어 발산합니다. 이렇게 수렴하지만 절대 수렴하지는 않는 급수를 <T en="conditionally convergent">조건 수렴</T>한다고 합니다.
      </p>
      <p>
        둘의 차이는 순서를 바꿀 때 드러납니다. 유한 개의 수는 어떤 순서로 더해도 합이 같지만, 무한 급수는 그렇지 않을 수 있습니다. 1854년 리만(Bernhard Riemann)은 놀라운 사실을 보였습니다.
      </p>
      <div className="se-thm">
        <b>정리 (리만 재배열 정리).</b> <M>{'\\sum a_n'}</M>이 조건 수렴하면, 어떤 실수 T에 대해서도 항의 순서를 바꿔 합이 T가 되게 할 수 있고, +∞나 −∞로 발산하게도 할 수 있습니다.
      </div>
      <p>
        증명의 생각은 그림 3의 알고리즘 그대로입니다. 조건 수렴하면 양수 항들의 합과 음수 항들의 합이 각각 +∞와 −∞로 발산합니다(둘 중 하나라도 유한하면 급수가 절대 수렴하게 됩니다). 그러니 양수 항을 계속 가져오면 언제든 T를 넘을 수 있고, 음수 항을 계속 가져오면 언제든 T 아래로 내려갈 수 있습니다. 한 번 넘을 때마다 T와의 거리는 마지막으로 쓴 항의 크기 이하인데, 항들은 0으로 가므로 부분합이 T로 다가갑니다.
      </p>
      <RearrangeFigure />
      <p>
        T = 1.5로 두면 2,000개의 항을 쓴 뒤 부분합은 1.49952입니다. 양수 항을 1,668개, 음수 항을 332개 썼습니다. 원래 순서에서는 둘을 번갈아 1,000개씩 쓰니, 양수 항을 훨씬 많이 앞당겨 쓴 것입니다. T = −1이면 반대로 음수 항을 1,934개, 양수 항을 66개만 써서 −0.99582에 이릅니다. 그래도 어느 항도 버리지 않습니다. 계속 가면 결국 모든 양수 항과 모든 음수 항이 한 번씩 쓰입니다. "+∞로"를 고르면 2,000항 동안 음수 항은 3개만 쓰이고 부분합은 3.865에 이릅니다. 조화급수처럼 아주 천천히 커지지만, 넘어야 할 목표는 끝없이 있습니다.
      </p>
      <p>
        절대 수렴하는 급수에서는 이런 일이 일어나지 않습니다. 순서를 어떻게 바꾸든 합이 같습니다. 그림 4는 같은 재배열 규칙을 두 급수에 써 본 것입니다.
      </p>
      <PatternFigure />
      <p>
        "양 2, 음 1"로 바꾸면 교대 조화급수는 ln 2 = 0.6931이 아니라 <M>{'\\tfrac32 \\ln 2'}</M> = 1.0397로, "양 1, 음 2"로 바꾸면 <M>{'\\tfrac12\\ln 2'}</M> = 0.3466으로 갑니다. 3,000항에서 각각 1.0395와 0.3464입니다. 같은 항들을 더했는데 합이 세 가지입니다. 반면 교대 <M>{'1/n^2'}</M>은 세 규칙 모두 π²/12 = 0.8225 근처(0.8225, 0.8226, 0.8223)에 머뭅니다.
      </p>
      <p>
        이유를 간단히 적으면 이렇습니다. 절대 수렴하면 ε에 대해 <M>{'\\sum_{n > N}|a_n| < \\varepsilon'}</M>인 N이 있습니다. 재배열한 급수도 충분히 멀리 가면 처음 N개의 항을 모두 써 버리고, 그 뒤의 부분합은 원래 합과 많아야 "N 이후 항들의 절댓값 합"만큼, 곧 ε 미만만큼 다릅니다. 조건 수렴하는 급수에는 그런 N이 없으므로 이 논증이 막힙니다.
      </p>
      <Callout kind="intuition">
        조건 수렴하는 급수는 +∞만큼의 양수와 −∞만큼의 음수가 아슬아슬하게 상쇄되어 유한한 값이 된 것입니다. 상쇄하는 순서를 조금만 바꿔도 결과가 달라집니다. 수치 계산에서 큰 수끼리 빼서 작은 답을 얻는 계산이 반올림 오차에 약한 것도 같은 이유입니다.
      </Callout>

      <Callout kind="key">
        급수의 합은 부분합 수열의 극한이고, 실수가 완비이므로 급수는 꼬리의 흔들림이 0으로 가는 코시 조건을 만족할 때 그리고 그때에만 수렴합니다. 항이 0 이상이면 부분합이 단조증가하므로 위로 유계인지만 보면 되고, 비교 판정과 기하급수와 비교하는 비율 판정이 여기서 나옵니다. 절대 수렴하는 급수는 순서를 바꿔도 합이 같지만, 조건 수렴하는 급수는 리만 재배열 정리에 따라 순서만 바꿔 어떤 값이든, 심지어 무한대도 만들 수 있습니다.
      </Callout>
      <Quiz
        q="교대급수 Σ(−1)ⁿ⁺¹/√n은 수렴하지만 Σ1/√n은 발산한다. 다음 중 옳은 것은?"
        options={['항의 순서를 어떻게 바꿔도 합은 그대로다', '항의 순서를 바꿔 합이 10이 되게 할 수 있다', '항이 0으로 가므로 절대 수렴한다', '비율 판정으로 수렴을 보일 수 있다']}
        answer={1}
        explain={<>수렴하지만 절댓값의 급수가 발산하므로 조건 수렴입니다. 리만 재배열 정리에 따라 순서만 바꿔 어떤 실수 T로든 수렴하게 할 수 있습니다. 항이 0으로 가는 것은 수렴의 필요조건일 뿐 절대 수렴을 보장하지 않습니다. 비율 <M>{'\\sqrt{n}/\\sqrt{n+1}'}</M>은 1로 가므로 비율 판정은 아무것도 말해 주지 않습니다.</>}
      />
    </>
  );
}
