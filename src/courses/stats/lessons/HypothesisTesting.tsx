import { useMemo, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../components/ui';
import { useCanvas2D } from '../../../lib/canvas';
import { Plot, fmt } from '../../../lib/plot';
import { alpha, usePalette } from '../../../lib/theme';
import { binomialPmf, binomialTwoSidedP, clamp, normalCdf, normalInv, normalPdf, rng } from '../../../lib/math';
import { lessonHref } from '../../index';
import { axisLine, stackLevels, tag } from './shared';

/** Number of heads in n flips of a coin with P(heads) = p. */
function flip(r: () => number, n: number, p: number) {
  let k = 0;
  for (let i = 0; i < n; i++) if (r() < p) k++;
  return k;
}

const fmtP = (p: number) => (p < 0.0001 ? '< 0.0001' : fmt(p, 4));

/* ─────────────── Figure 1: is this coin fair? ─────────────── */

function CoinTestFigure() {
  const P = usePalette();
  const [n, setN] = useState(100);
  const [k, setK] = useState(60);
  const [r] = useState(() => rng(42));
  const pmf = useMemo(() => binomialPmf(n, 0.5), [n]);
  const pval = useMemo(() => binomialTwoSidedP(n, k), [n, k]);
  const d = Math.abs(k - n / 2);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const sd = Math.sqrt(n) / 2;
      let lo = Math.max(0, Math.floor(n / 2 - 4.5 * sd));
      let hi = Math.min(n, Math.ceil(n / 2 + 4.5 * sd));
      lo = Math.min(lo, k - 2);
      hi = Math.max(hi, k + 2);
      lo = Math.max(0, lo);
      hi = Math.min(n, hi);
      const yMax = Math.max(...pmf) * 1.25;
      const plot = new Plot(ctx, w, h, P, { xMin: lo - 0.6, xMax: hi + 0.6, yMin: 0, yMax, pad: { l: 14, r: 14, t: 30, b: 44 } });
      const bw = Math.max(1, plot.sx * 0.78);
      for (let i = lo; i <= hi; i++) {
        const extreme = Math.abs(i - n / 2) >= d - 1e-9;
        ctx.fillStyle = extreme ? alpha(P.bad, 0.8) : alpha(P.ink3, 0.35);
        const y = plot.Y(pmf[i]);
        ctx.fillRect(plot.X(i) - bw / 2, y, bw, plot.Y(0) - y);
      }
      // observed count
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(plot.X(k), plot.pad.t - 4);
      ctx.lineTo(plot.X(k), plot.Y(0));
      ctx.stroke();
      tag(ctx, P, `관측 ${k}번`, clamp(plot.X(k), 44, w - 44), 16, P.ink);
      // mirror point on the other side
      if (d > 0) {
        const mirror = n - k;
        if (mirror >= lo && mirror <= hi) {
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = P.ink3;
          ctx.beginPath();
          ctx.moveTo(plot.X(mirror), plot.pad.t + 6);
          ctx.lineTo(plot.X(mirror), plot.Y(0));
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      const step = Math.max(1, Math.round((hi - lo) / 8 / 5) * 5) || 1;
      axisLine(ctx, P, plot.X.bind(plot), plot.Y(0), lo, hi, step, '앞면 횟수');
    },
    [P, n, k, pmf],
    { aspect: 2.1, maxHeight: 330, minHeight: 240 },
  );

  return (
    <Figure
      no={1}
      title="공정한 동전이라면, 이 결과는 얼마나 드물까?"
      hint="던진 횟수와 앞면 수를 바꿔 보세요"
      caption={<>막대는 공정한 동전을 n번 던졌을 때 앞면이 나오는 횟수의 확률(귀무가설에서의 분포)입니다. 빨간 막대는 관측값만큼 또는 그보다 더 50%에서 멀리 떨어진 결과들이고, 그 확률을 모두 더한 것이 p값입니다. 양쪽을 다 세는 이유는 "앞면이 너무 많다"와 "너무 적다" 모두 공정하지 않다는 증거이기 때문입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider
            id="ct-n"
            label="던진 횟수 n"
            value={n}
            min={10}
            max={400}
            step={2}
            onChange={(v) => {
              setK(Math.round((k / n) * v));
              setN(v);
            }}
            color="var(--c-stats-2)"
          />
          <Slider id="ct-k" label="앞면 횟수 k" value={k} min={0} max={n} step={1} onChange={setK} format={(v) => `${v}번 (${fmt((v / n) * 100, 0)}%)`} />
          <div className="btn-row">
            <Button small onClick={() => setK(flip(r, n, 0.5))}>
              공정한 동전 던지기
            </Button>
            <Button small onClick={() => setK(flip(r, n, 0.6))}>
              앞면 60% 동전 던지기
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="p값" value={fmtP(pval)} color={pval < 0.05 ? 'var(--bad)' : undefined} />
            <Readout label="기대값 n/2" value={fmt(n / 2, 0)} />
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', minHeight: '3.4em' }}>
            {pval < 0.05 ? (
              <>
                <strong style={{ color: 'var(--bad)' }}>p &lt; 0.05:</strong> 공정한 동전에서 이 정도 결과는 드뭅니다. 귀무가설을 기각합니다.
              </>
            ) : (
              <>
                <strong>p ≥ 0.05:</strong> 공정한 동전에서도 충분히 나올 만한 결과입니다. 귀무가설을 기각하지 못합니다.
              </>
            )}
          </div>
          <Legend
            items={[
              { color: 'var(--bad)', label: '관측값 이상으로 극단적', shape: 'sq' },
              { color: 'var(--ink-3)', label: '그보다 덜 극단적', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: many fair coins, some look "significant" ─────────────── */

const FLIPS = 50;

function ManyCoinsFigure() {
  const P = usePalette();
  const [m, setM] = useState(40);
  const [a, setA] = useState<0.05 | 0.01>(0.05);
  const [seed, setSeed] = useState(5);
  const coins = useMemo(() => {
    const r = rng(seed * 104729 + 3);
    return Array.from({ length: m }, () => {
      const k = flip(r, FLIPS, 0.5);
      return { k, p: binomialTwoSidedP(FLIPS, k) };
    });
  }, [m, seed]);
  // the real chance that one fair coin crosses the line (p-values of a discrete test are lumpy)
  const size = useMemo(() => {
    const pmf = binomialPmf(FLIPS, 0.5);
    return pmf.reduce((s, q, i) => s + (binomialTwoSidedP(FLIPS, i) < a ? q : 0), 0);
  }, [a]);
  const sig = coins.filter((c) => c.p < a);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const padX = 18;
      const padR = 40; // room for the axis name after the 1.0 tick
      const X = (p: number) => padX + p * (w - padX - padR);
      const base = h - 40;
      const r = m > 60 ? 4 : 5;
      // region p < α
      ctx.fillStyle = alpha(P.bad, 0.1);
      ctx.fillRect(X(0), 10, X(a) - X(0), base - 10);
      ctx.strokeStyle = P.bad;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(X(a), 10);
      ctx.lineTo(X(a), base);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.bad;
      ctx.font = `600 11px ${P.fontMono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`α = ${a}`, X(a) + 6, 12);

      const px = coins.map((c) => X(c.p));
      const lv = stackLevels(px, 2 * r + 1);
      coins.forEach((c, i) => {
        const y = base - r - 2 - lv[i] * (2 * r + 1.5);
        ctx.beginPath();
        ctx.arc(px[i], Math.max(r + 4, y), r, 0, Math.PI * 2);
        ctx.fillStyle = c.p < a ? P.bad : alpha(P.ink, 0.55);
        ctx.fill();
      });
      axisLine(ctx, P, X, base, 0, 1, w < 500 ? 0.2 : 0.1, undefined, (v) => fmt(v, 1));
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('p값', X(1) + 14, base + 8);
    },
    [P, coins, a],
    { aspect: 2.3, maxHeight: 300, minHeight: 220 },
  );

  return (
    <Figure
      no={2}
      title="공정한 동전만 검사해도 '유의한' 동전이 나온다"
      hint="동전 수를 늘리고 다시 던져 보세요"
      caption={<>모두 완벽하게 공정한 동전 m개를 각각 {FLIPS}번씩 던져 검정한 p값입니다. 점 하나가 동전 하나입니다. 귀무가설이 모두 참인데도 일부는 빨간 영역(p &lt; α)에 들어갑니다. 검사를 많이 할수록 우연히 "발견"되는 것이 늘어납니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="mc-m" label="공정한 동전 수 m" value={m} min={10} max={100} step={10} onChange={setM} color="var(--c-stats-2)" />
          <Seg
            label="유의수준 α"
            value={a}
            onChange={setA}
            options={[
              { value: 0.05, label: '0.05' },
              { value: 0.01, label: '0.01' },
            ]}
          />
          <div className="btn-row">
            <Button small primary onClick={() => setSeed((s) => s + 1)}>
              모두 다시 던지기
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="'유의한' 동전" value={`${sig.length}개`} color="var(--bad)" />
            <Readout label="기대 개수" value={`약 ${fmt(m * size, 1)}개`} />
            <Readout label="하나라도 걸릴 확률" value={`${fmt((1 - (1 - size) ** m) * 100, 0)}%`} />
            <Readout label="동전 하나가 걸릴 확률" value={`${fmt(size * 100, 1)}%`} />
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', minHeight: '1.6em' }}>
            {sig.length ? (
              <>
                예: <span className="mono">앞면 {sig[0].k}/{FLIPS}번</span>, p = {fmt(sig[0].p, 3)}
              </>
            ) : (
              '이번에는 걸린 동전이 없습니다'
            )}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: two kinds of error, and power ─────────────── */

function PowerFigure() {
  const P = usePalette();
  const [n, setN] = useState(100);
  const [p1, setP1] = useState(0.6);
  const z = normalInv(0.975);
  const se0 = Math.sqrt(0.25 / n);
  const se1 = Math.sqrt((p1 * (1 - p1)) / n);
  const cLo = 0.5 - z * se0;
  const cHi = 0.5 + z * se0;
  const power = 1 - (normalCdf(cHi, p1, se1) - normalCdf(cLo, p1, se1));
  const need = p1 > 0.5 ? Math.ceil(((z * 0.5 + normalInv(0.8) * Math.sqrt(p1 * (1 - p1))) / (p1 - 0.5)) ** 2) : Infinity;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const peak = Math.max(normalPdf(0, 0, se0), normalPdf(0, 0, se1));
      const plot = new Plot(ctx, w, h, P, { xMin: 0.3, xMax: 0.9, yMin: 0, yMax: peak * 1.2, pad: { l: 14, r: 14, t: 28, b: 44 } });
      const f0 = (x: number) => normalPdf(x, 0.5, se0);
      const f1 = (x: number) => normalPdf(x, p1, se1);
      // rejection region under H0: type I error
      plot.fillUnder(f0, alpha(P.bad, 0.45), plot.xMin, cLo);
      plot.fillUnder(f0, alpha(P.bad, 0.45), cHi, plot.xMax);
      // under H1: power (rejected) vs type II error (kept)
      plot.fillUnder(f1, alpha(P.good, 0.35), cHi, plot.xMax);
      plot.fillUnder(f1, alpha(P.good, 0.35), plot.xMin, cLo);
      plot.fillUnder(f1, alpha(P.ink3, 0.18), cLo, cHi);
      plot.fn(f0, P.ink2, 2);
      plot.fn(f1, P.stats2, 2.5);
      for (const c of [cLo, cHi]) plot.line(c, 0, c, plot.yMax * 0.92, P.bad, 1.5, [5, 4]);
      tag(ctx, P, 'H₀: 공정 (50%)', clamp(plot.X(0.5), 60, w - 60), 14, P.ink2);
      if (Math.abs(p1 - 0.5) > 0.03) tag(ctx, P, `H₁: ${fmt(p1 * 100, 0)}%`, clamp(plot.X(p1), 50, w - 50), 14, P.stats2);
      axisLine(ctx, P, plot.X.bind(plot), plot.Y(0), 0.3, 0.9, 0.1, '앞면 비율', (v) => fmt(v * 100, 0) + '%');
    },
    [P, n, p1],
    { aspect: 2.1, maxHeight: 330, minHeight: 240 },
  );

  return (
    <Figure
      no={3}
      title="두 가지 오류와 검정력"
      hint="진짜 앞면 확률과 n을 바꿔 보세요"
      caption={<>회색 곡선은 동전이 공정할 때(H₀), 보라 곡선은 실제로 앞면이 더 잘 나올 때(H₁) 관측되는 앞면 비율의 분포입니다. 빨간 점선 밖으로 나오면 "공정하지 않다"고 판정합니다. 빨간 넓이는 공정한 동전을 잘못 고발할 확률(1종 오류, 5%), 초록 넓이는 기운 동전을 제대로 잡아낼 확률(검정력)입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="pw-p" label="진짜 앞면 확률" value={p1} min={0.5} max={0.75} step={0.01} onChange={setP1} format={(v) => fmt(v * 100, 0) + '%'} color="var(--c-stats-2)" />
          <Slider id="pw-n" label="던진 횟수 n" value={n} min={10} max={600} step={10} onChange={setN} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="1종 오류 α" value="5.0%" color="var(--bad)" />
            <Readout label="검정력 1 − β" value={fmt(power * 100, 1) + '%'} color="var(--good)" />
            <Readout label="2종 오류 β" value={fmt((1 - power) * 100, 1) + '%'} />
            <div style={{ gridColumn: '1 / -1' }}>
              <Readout label="검정력 80%를 얻으려면 필요한 n" value={isFinite(need) ? `약 ${need.toLocaleString('ko-KR')}번` : '—'} />
            </div>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function HypothesisTesting() {
  return (
    <>
      <h2>우연인가, 차이인가</h2>
      <p>
        친구가 동전을 100번 던졌더니 앞면이 60번 나왔습니다. 동전이 조작된 걸까요, 아니면 그냥 운이 좋았을까요? 공정한 동전이라도 정확히 50번이 나오는 일은 드뭅니다. 문제는 50에서 10만큼 벗어난 것이 "그럴 수 있는 정도"인지 "그러기 어려운 정도"인지입니다.
      </p>
      <p>
        <T en="hypothesis testing">가설검정</T>은 이 질문에 답하는 절차입니다. 출발점은 의외로 "아무 일도 없다"는 가정입니다. 이것을 <T en="null hypothesis">귀무가설</T> H₀라고 부릅니다. 여기서는 "동전은 공정하다(앞면 확률 50%)"입니다. 그 반대인 "공정하지 않다"가 <T en="alternative hypothesis">대립가설</T> H₁입니다. 그리고 묻습니다. 귀무가설이 맞다면, 지금 본 결과는 얼마나 드문가?
      </p>
      <MB note="귀무가설이 참일 때, 관측한 결과만큼 또는 그보다 더 극단적인 결과가 나올 확률">{'p\\text{값} = P\\big(\\,|X - \\tfrac{n}{2}| \\ge |k - \\tfrac{n}{2}| \\;\\big|\\; H_0\\,\\big)'}</MB>
      <CoinTestFigure />
      <p>
        100번 중 60번이면 p값은 약 0.057입니다. 공정한 동전으로 100번 던지는 실험을 반복하면 대략 18번에 한 번은 이만큼 치우친 결과가 나온다는 뜻입니다. 같은 60%라도 n을 200으로 늘리면(120번) p값은 0.006 근처로 떨어집니다. 표본이 클수록 같은 비율의 차이도 우연으로 설명하기 어려워집니다. <a href={lessonHref('stats', 'clt')}>중심극한정리</a> 장의 √n 법칙이 여기서도 작동합니다.
      </p>
      <Callout kind="intuition">
        가설검정은 법정과 비슷합니다. 피고는 유죄가 입증될 때까지 무죄로 추정됩니다(귀무가설). 증거가 "합리적 의심의 여지가 없을 만큼" 강하면 무죄 추정을 버립니다(귀무가설 기각). 증거가 부족해서 무죄 판결이 나도, 그것이 결백의 증명은 아닙니다. 마찬가지로 p값이 크다고 해서 동전이 공정하다는 것이 증명되지는 않습니다.
      </Callout>

      <h2>유의수준 α와 거짓 양성</h2>
      <p>
        얼마나 드물어야 "우연이 아니다"라고 할까요? 미리 정해 두는 기준선을 <T en="significance level">유의수준</T> α라고 하며, 관례적으로 0.05를 많이 씁니다. p &lt; α이면 귀무가설을 기각하고 결과가 "통계적으로 유의하다"고 말합니다.
      </p>
      <p>
        이 기준에는 대가가 있습니다. 귀무가설이 참이어도 α의 확률로 우연히 기각하게 됩니다. 아무 효과가 없는데 "효과가 있다"고 말하는 <strong>거짓 양성</strong>입니다. 검사를 한 번만 하면 이 위험은 α 이하지만, 여러 번 하면 이야기가 달라집니다.
      </p>
      <ManyCoinsFigure />
      <p>
        공정한 동전 40개를 검사하면 적어도 하나가 "유의하게" 나올 확률이 70%가 넘습니다. 실제 연구에서도 수십 가지 변수를 시험해 보고 p &lt; 0.05가 나온 것만 보고하면 이런 우연의 발견이 쌓입니다. 이를 다중 비교 문제라고 부르며, 여러 번 검정할 때는 α를 검정 수로 나누는 등(본페로니 보정) 기준을 더 엄격하게 잡습니다. 인공지능 분야의 <a href={lessonHref('ai', 'evaluation')}>모델 평가</a> 장에서 본 위양성과 같은 개념입니다.
      </p>
      <Callout kind="warn">
        p값은 "귀무가설이 참일 확률"이 아닙니다. p = 0.03은 "동전이 공정할 확률이 3%"라는 뜻이 아니라, "공정하다면 이런 결과가 나올 확률이 3%"라는 뜻입니다. 또 p값이 작다고 차이가 큰 것도 아닙니다. 표본이 아주 크면 51% 대 50% 같은 사소한 차이도 p값이 작게 나옵니다. 차이의 크기는 <a href={lessonHref('stats', 'confidence-interval')}>신뢰구간</a>으로 함께 보고하는 것이 좋습니다.
      </Callout>

      <h2>두 가지 오류와 검정력</h2>
      <p>판정에는 두 방향의 실수가 있습니다.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th></th>
              <th>실제로 H₀가 참 (동전 공정)</th>
              <th>실제로 H₁이 참 (동전 기울어짐)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>H₀ 기각 ("공정하지 않다")</th>
              <td>
                <strong>1종 오류</strong> (거짓 양성), 확률 α
              </td>
              <td>올바른 발견, 확률 1 − β (검정력)</td>
            </tr>
            <tr>
              <th>H₀ 유지 ("판단 보류")</th>
              <td>올바른 판단</td>
              <td>
                <strong>2종 오류</strong> (거짓 음성), 확률 β
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        α는 우리가 직접 정하지만 β는 상황에 달려 있습니다. 실제 차이가 작을수록, 표본이 작을수록 기운 동전을 놓치기 쉽습니다. 실제로 있는 차이를 잡아낼 확률 <M>{'1-\\beta'}</M>를 <T en="statistical power">검정력</T>이라고 부릅니다.
      </p>
      <PowerFigure />
      <p>
        앞면 확률이 60%인 동전을 100번 던지면 검정력은 50% 남짓입니다. 동전이 정말 기울어져 있어도 두 번에 한 번은 놓친다는 뜻입니다. 그래서 실험을 설계할 때는 "찾고 싶은 차이를 80% 이상의 확률로 잡으려면 표본이 얼마나 필요한가"를 먼저 계산합니다. α를 0.01로 엄격하게 잡으면 거짓 양성은 줄지만 같은 n에서 검정력도 떨어집니다. 두 오류를 동시에 줄이는 방법은 역시 표본을 늘리는 것입니다.
      </p>
      <Callout kind="note">
        신뢰구간과 가설검정은 같은 동전의 양면입니다. 95% 신뢰구간이 50%를 포함하지 않는다는 것은 대체로 유의수준 0.05의 양측 검정에서 "공정하다"를 기각한다는 것과 같습니다. 신뢰구간은 여기에 더해 차이가 얼마나 큰지까지 알려 줍니다.
      </Callout>

      <Callout kind="key">
        p값은 귀무가설이 참이라고 가정할 때 지금 같은 결과가 얼마나 드문지를 잽니다. p &lt; α이면 귀무가설을 기각하지만, 귀무가설이 참이어도 α의 확률로 틀립니다(1종 오류). 실제 차이를 놓치는 2종 오류를 줄이려면 검정력을 높여야 하고, 그 열쇠는 충분한 표본 크기입니다.
      </Callout>
      <Quiz
        q="새 약의 효과를 검정해 p = 0.02가 나왔다. 올바른 해석은?"
        options={['약이 효과가 없을 확률이 2%다', '약이 효과가 있을 확률이 98%다', '약에 효과가 없다면, 이만큼 또는 이보다 큰 차이가 우연히 나올 확률이 2%다', '약의 효과가 2%만큼 크다']}
        answer={2}
        explain={<>p값은 귀무가설(효과 없음)이 참이라고 가정하고 계산한 확률이므로, 귀무가설 자체가 참일 확률을 말해 주지 않습니다. 효과의 크기도 알려 주지 않습니다. 효과가 얼마나 큰지는 신뢰구간으로 따로 확인해야 합니다.</>}
      />
    </>
  );
}
