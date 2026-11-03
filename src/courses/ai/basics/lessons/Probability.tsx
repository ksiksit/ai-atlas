import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot, fmt } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { normalCdf, normalPdf, rng } from '../../../../lib/math';

/* ─────────────── Figure 1: law of large numbers with dice ─────────────── */

type DiceMode = 'one' | 'two';

function trueDist(mode: DiceMode): { k: number; p: number }[] {
  if (mode === 'one') return [1, 2, 3, 4, 5, 6].map((k) => ({ k, p: 1 / 6 }));
  const out: { k: number; p: number }[] = [];
  for (let s = 2; s <= 12; s++) out.push({ k: s, p: (6 - Math.abs(s - 7)) / 36 });
  return out;
}

function DiceFigure() {
  const P = usePalette();
  const [mode, setMode] = useState<DiceMode>('two');
  const r = useRef(rng(2024));
  const [counts, setCounts] = useState<Record<number, number>>(() => {
    // start with a small sample so the figure is not empty at rest
    const c: Record<number, number> = {};
    for (let i = 0; i < 20; i++) {
      const v = 2 + Math.floor(r.current() * 6) + Math.floor(r.current() * 6);
      c[v] = (c[v] ?? 0) + 1;
    }
    return c;
  });
  const [last, setLast] = useState<number[]>([]);
  const dist = useMemo(() => trueDist(mode), [mode]);
  const n = Object.values(counts).reduce((a, b) => a + b, 0);

  const roll = (times: number) => {
    const next = { ...counts };
    const recent: number[] = [];
    for (let i = 0; i < times; i++) {
      const d1 = 1 + Math.floor(r.current() * 6);
      const v = mode === 'one' ? d1 : d1 + 1 + Math.floor(r.current() * 6);
      next[v] = (next[v] ?? 0) + 1;
      if (i >= times - 8) recent.push(v);
    }
    setCounts(next);
    setLast(recent);
  };
  const reset = () => {
    setCounts({});
    setLast([]);
  };
  const switchMode = (m: DiceMode) => {
    setMode(m);
    setCounts({});
    setLast([]);
  };

  const freqs = dist.map((d) => ({ ...d, f: n ? (counts[d.k] ?? 0) / n : 0 }));
  const maxErr = n ? Math.max(...freqs.map((d) => Math.abs(d.f - d.p))) : NaN;
  const mean = n ? freqs.reduce((s, d) => s + d.k * d.f, 0) : NaN;
  const trueMean = mode === 'one' ? 3.5 : 7;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const kMin = dist[0].k;
      const kMax = dist[dist.length - 1].k;
      const yMax = Math.max(0.2, ...freqs.map((d) => d.f), ...dist.map((d) => d.p)) * 1.18;
      const plot = new Plot(ctx, w, h, P, { xMin: kMin - 0.6, xMax: kMax + 0.6, yMin: 0, yMax, pad: { l: 42, r: 10, t: 14, b: 28 } });
      plot.grid({ xStep: 1, fmt: (v) => (Number.isInteger(Math.round(v * 1000) / 1000) ? String(Math.round(v)) : ''), axes: false });
      const bw = Math.min(42, plot.sx * 0.7);
      for (const d of freqs) {
        const x = plot.X(d.k);
        const y0 = plot.Y(0);
        const y1 = plot.Y(d.f);
        ctx.fillStyle = alpha(P.accent, 0.75);
        ctx.beginPath();
        ctx.roundRect(x - bw / 2, y1, bw, y0 - y1, [4, 4, 0, 0]);
        ctx.fill();
        // true probability marker
        const yt = plot.Y(d.p);
        ctx.strokeStyle = P.pos;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - bw / 2 - 4, yt);
        ctx.lineTo(x + bw / 2 + 4, yt);
        ctx.stroke();
      }
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plot.pad.l, plot.Y(0) + 0.5);
      ctx.lineTo(w - plot.pad.r, plot.Y(0) + 0.5);
      ctx.stroke();
      if (!n) {
        ctx.fillStyle = P.ink3;
        ctx.font = `13px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.fillText('버튼을 눌러 주사위를 던져 보세요', w / 2, plot.pad.t + 30);
      }
    },
    [P, counts, mode],
    { aspect: 1.9, maxHeight: 340, minHeight: 220 },
  );

  return (
    <Figure
      no={1}
      title="주사위를 많이 던질수록"
      hint="버튼으로 던지기"
      caption={<>파란 막대는 지금까지 던진 결과의 비율(경험적 빈도), 주황 선은 이론적인 확률입니다. 몇 번 안 던지면 막대가 들쭉날쭉하지만 수천 번 던지면 주황 선에 붙습니다. 이것이 큰 수의 법칙이고, 데이터가 많을수록 모델이 세상을 더 정확히 배우는 이유이기도 합니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg
            label="실험"
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'one', label: '주사위 1개' },
              { value: 'two', label: '2개의 합' },
            ]}
          />
          <div className="btn-row">
            <Button small onClick={() => roll(1)}>
              +1번
            </Button>
            <Button small onClick={() => roll(10)}>
              +10번
            </Button>
            <Button small primary onClick={() => roll(1000)}>
              +1000번
            </Button>
            <Button small onClick={reset}>
              초기화
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="던진 횟수 n" value={n.toLocaleString('ko-KR')} />
            <Readout label="최대 오차" value={isNaN(maxErr) ? '—' : fmt(maxErr * 100, 1) + '%p'} />
            <Readout label="평균 (실험)" value={isNaN(mean) ? '—' : fmt(mean, 2)} />
            <Readout label="평균 (이론)" value={fmt(trueMean, 2)} color="var(--pos)" />
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', minHeight: '1.6em' }}>
            최근 결과: <span className="mono">{last.length ? last.join(', ') : '—'}</span>
          </div>
          <Legend
            items={[
              { color: 'var(--accent)', label: '실험 빈도', shape: 'sq' },
              { color: 'var(--pos)', label: '이론 확률', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: normal distribution ─────────────── */

function NormalFigure() {
  const P = usePalette();
  const [mu, setMu] = useState(172);
  const [sigma, setSigma] = useState(6);
  const [lo, setLo] = useState(166);
  const [hi, setHi] = useState(178);
  const plotRef = useRef<Plot | null>(null);
  const prob = normalCdf(hi, mu, sigma) - normalCdf(lo, mu, sigma);
  const X0 = 130;
  const X1 = 214;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yMax = Math.max(normalPdf(0, 0, sigma), normalPdf(0, 0, 5.5)) * 1.18;
      const plot = new Plot(ctx, w, h, P, { xMin: X0, xMax: X1, yMin: 0, yMax, pad: { l: 14, r: 14, t: 26, b: 28 } });
      plotRef.current = plot;
      plot.grid({ xStep: 10, yStep: 1, axes: false });
      // σ bands
      for (let k = 3; k >= 1; k--) {
        ctx.fillStyle = alpha(P.ink3, 0.05);
        const x1 = plot.X(mu - k * sigma);
        const x2 = plot.X(mu + k * sigma);
        ctx.fillRect(x1, plot.pad.t, x2 - x1, plot.ph);
      }
      plot.fillUnder((x) => normalPdf(x, mu, sigma), alpha(P.accent, 0.35), Math.max(X0, Math.min(lo, hi)), Math.min(X1, Math.max(lo, hi)));
      plot.fn((x) => normalPdf(x, mu, sigma), P.accent, 2.5);
      // μ line
      plot.line(mu, 0, mu, normalPdf(mu, mu, sigma), P.ink3, 1, [4, 4]);
      plot.text('μ', mu, normalPdf(mu, mu, sigma), P.ink2, { dy: -12, align: 'center', font: `600 13px ${P.fontMono}` });
      for (let k = -3; k <= 3; k++) {
        if (!k) continue;
        const x = mu + k * sigma;
        if (x < X0 || x > X1) continue;
        plot.text(`${k > 0 ? '+' : '−'}${Math.abs(k)}σ`, x, 0, P.ink3, { dy: -10, align: 'center', font: `10px ${P.fontMono}` });
      }
      // handles
      for (const [v, name] of [
        [lo, 'a'],
        [hi, 'b'],
      ] as const) {
        const x = plot.X(v);
        ctx.strokeStyle = P.pos;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, plot.pad.t - 4);
        ctx.lineTo(x, plot.Y(0));
        ctx.stroke();
        ctx.fillStyle = P.pos;
        ctx.beginPath();
        ctx.roundRect(x - 22, plot.pad.t - 22, 44, 18, 5);
        ctx.fill();
        ctx.fillStyle = P.surface;
        ctx.font = `600 11px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${name}=${fmt(v, 0)}`, x, plot.pad.t - 13);
      }
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('키 (cm)', w - plot.pad.r, plot.Y(0) - 4);
    },
    [P, mu, sigma, lo, hi],
    { aspect: 2.1, maxHeight: 340, minHeight: 220 },
  );

  useDrag(canvasRef, {
    hit: (x) => {
      const p = plotRef.current;
      if (!p) return null;
      const dl = Math.abs(p.X(lo) - x);
      const dh = Math.abs(p.X(hi) - x);
      if (Math.min(dl, dh) > 22) return null;
      return dl < dh ? 'lo' : 'hi';
    },
    onDrag: (id, x) => {
      const p = plotRef.current!;
      const v = Math.round(Math.max(X0, Math.min(X1, p.invX(x))));
      if (id === 'lo') setLo(v);
      else setHi(v);
    },
  });

  const preset = (k: number) => {
    setLo(Math.round((mu - k * sigma) * 10) / 10);
    setHi(Math.round((mu + k * sigma) * 10) / 10);
  };

  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  return (
    <Figure
      no={2}
      title="정규분포와 구간의 확률"
      hint="주황 손잡이 a, b를 좌우로 끌어 보세요"
      caption={<>성인 남성의 키를 평균 μ, 표준편차 σ인 정규분포로 근사한 그림입니다. 곡선 아래 칠해진 넓이가 키가 a와 b 사이일 확률입니다. 프리셋을 눌러 보면 σ를 바꿔도 ±1σ 안에는 항상 약 68%, ±2σ 안에는 약 95%가 들어갑니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="nm-mu" label="평균 μ" value={mu} min={150} max={190} step={0.5} onChange={setMu} format={(v) => fmt(v, 1) + 'cm'} />
          <Slider id="nm-sigma" label="표준편차 σ" value={sigma} min={3} max={15} step={0.5} onChange={setSigma} format={(v) => fmt(v, 1) + 'cm'} />
          <div className="btn-row">
            <Button small onClick={() => preset(1)}>
              μ ± 1σ
            </Button>
            <Button small onClick={() => preset(2)}>
              μ ± 2σ
            </Button>
            <Button small onClick={() => preset(3)}>
              μ ± 3σ
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label={`P(${fmt(a, 0)} ≤ 키 ≤ ${fmt(b, 0)})`} value={fmt(prob * 100, 1) + '%'} color="var(--accent)" />
            <Readout label="1000명 중" value={`약 ${Math.round(prob * 1000)}명`} />
            <Readout label="a의 z점수" value={fmt((a - mu) / sigma, 2)} />
            <Readout label="b의 z점수" value={fmt((b - mu) / sigma, 2)} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: Bayes with 1000 people ─────────────── */

function BayesFigure() {
  const P = usePalette();
  const [prev, setPrev] = useState(1); // %
  const [sens, setSens] = useState(90); // %
  const [spec, setSpec] = useState(95); // %
  const N = 1000;
  const sick = Math.round((N * prev) / 100);
  const healthy = N - sick;
  const tp = Math.round((sick * sens) / 100);
  const fn = sick - tp;
  const fp = Math.round((healthy * (100 - spec)) / 100);
  const tn = healthy - fp;
  const post = tp + fp ? tp / (tp + fp) : 0;
  const exact = (prev / 100) * (sens / 100) / ((prev / 100) * (sens / 100) + (1 - prev / 100) * (1 - spec / 100));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w }) => {
      const cols = 40;
      const cell = w / cols;
      const r = Math.max(2, cell * 0.36);
      const kinds: [number, string, boolean][] = [
        [tp, P.pos, true],
        [fn, P.pos, false],
        [fp, P.neg, true],
        [tn, P.ink3, false],
      ];
      let i = 0;
      for (const [count, color, filled] of kinds) {
        for (let c = 0; c < count; c++, i++) {
          const cx = (i % cols) * cell + cell / 2;
          const cy = Math.floor(i / cols) * cell + cell / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          if (filled) {
            ctx.fillStyle = color;
            ctx.fill();
          } else if (color === P.ink3) {
            ctx.fillStyle = alpha(P.ink3, 0.22);
            ctx.fill();
          } else {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }
    },
    [P, tp, fn, fp, tn],
    { aspect: 1.6, minHeight: 100, maxHeight: 900 },
  );

  return (
    <Figure
      no={3}
      title="검사에서 양성이 나왔다면, 정말 병에 걸렸을까?"
      hint="세 값을 바꿔 보세요"
      caption={<>점 하나가 한 사람입니다. 색이 칠해진 점이 양성 판정을 받은 사람들입니다. 병이 드물면 건강한 사람이 압도적으로 많아서, 정확도가 꽤 높은 검사라도 양성 판정 중 상당수는 건강한 사람(파란 점)에게서 나옵니다.</>}
    >
      <div className="fig-split left">
        <div className="controls">
          <Slider id="by-prev" label="유병률 (병에 걸린 비율)" value={prev} min={0.1} max={30} step={0.1} onChange={setPrev} format={(v) => fmt(v, 1) + '%'} color="var(--pos)" />
          <Slider id="by-sens" label="민감도 (병이 있으면 양성)" value={sens} min={50} max={100} step={0.5} onChange={setSens} format={(v) => fmt(v, 1) + '%'} />
          <Slider id="by-spec" label="특이도 (병이 없으면 음성)" value={spec} min={50} max={99.9} step={0.1} onChange={setSpec} format={(v) => fmt(v, 1) + '%'} />
          <Readout label="양성일 때 실제로 병일 확률" value={fmt(exact * 100, 1) + '%'} color="var(--pos)" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" style={{ background: 'transparent' }}>
            <canvas ref={canvasRef} />
          </div>
          <div className="legend">
            <span>
              <i style={{ background: 'var(--pos)' }} />
              병 있음 · 양성 {tp}명
            </span>
            <span>
              <i style={{ border: '1.5px solid var(--pos)' }} />
              병 있음 · 음성 {fn}명
            </span>
            <span>
              <i style={{ background: 'var(--neg)' }} />
              건강 · 양성 {fp}명
            </span>
            <span>
              <i style={{ background: 'color-mix(in srgb, var(--ink-3) 30%, transparent)' }} />
              건강 · 음성 {tn}명
            </span>
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>
            양성 {tp + fp}명 중 실제 환자 {tp}명 → {tp}/{tp + fp} = <strong style={{ color: 'var(--pos)' }}>{fmt(post * 100, 1)}%</strong>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Probability() {
  return (
    <>
      <h2>확률은 불확실함을 숫자로 적는 법</h2>
      <p>
        사진 한 장을 보여 주면 이미지 분류 모델은 "고양이"라고 딱 잘라 말하지 않습니다. 대신 <strong>고양이 92%, 여우 6%, 개 2%</strong>처럼 답합니다. 일기예보의 "내일 비 올 확률 70%"와 같은 형식이죠. 세상의 데이터에는 잡음이 섞여 있고 모델은 그 일부만 보았기 때문에, 확신 대신 확률로 답하는 편이 정직하고 쓸모도 많습니다.
      </p>
      <p>
        <T en="probability">확률</T>은 어떤 일이 일어날 가능성을 0과 1 사이의 수로 나타낸 것입니다. 0은 절대 일어나지 않음, 1은 반드시 일어남입니다. 가능한 모든 결과에 확률을 하나씩 붙여 놓은 표를 <T en="probability distribution">확률분포</T>라고 부르고, 모든 확률의 합은 항상 1입니다.
      </p>
      <MB note="공정한 주사위의 확률분포. 여섯 결과의 확률을 더하면 1입니다.">{'P(X=k) = \\tfrac{1}{6},\\quad k = 1,2,\\dots,6 \\qquad \\sum_k P(X=k) = 1'}</MB>
      <p>그런데 확률이 1/6이라는 말은 정확히 무슨 뜻일까요? 직접 던져 보면 알 수 있습니다.</p>
      <DiceFigure />
      <p>
        주사위 2개의 합으로 바꿔 보면 분포가 산 모양이 됩니다. 합이 7이 되는 조합은 (1,6), (2,5) 등 6가지인데 합이 2가 되는 조합은 (1,1) 하나뿐이기 때문입니다. 이렇게 결과마다 확률이 다를 때 분포의 모양이 중요해집니다.
      </p>

      <h2>정규분포: 자연이 좋아하는 종 모양</h2>
      <p>
        키, 시험 점수, 측정 오차처럼 작은 요인이 여럿 더해져 만들어지는 값은 대부분 가운데가 볼록한 종 모양으로 퍼집니다. 이것을 <T en="normal distribution">정규분포</T>라고 합니다. 위의 주사위 2개 합이 이미 그 모양을 닮기 시작한 것도 같은 이유입니다(이 현상은 통계학 분야의 <a href="#stats-basics/clt">중심극한정리</a> 장에서 자세히 다룹니다). 정규분포는 딱 두 개의 숫자, 중심 위치인 평균 <M>{'\\mu'}</M>와 퍼진 정도인 표준편차 <M>{'\\sigma'}</M>로 결정됩니다.
      </p>
      <MB note="연속적인 값에서는 한 점의 확률 대신 구간의 넓이가 확률이 됩니다.">{'p(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}} \\qquad P(a \\le X \\le b) = \\int_a^b p(x)\\,dx'}</MB>
      <NormalFigure />
      <Callout kind="intuition">
        키는 연속적인 값이라 "정확히 172.000…cm"일 확률은 0입니다. 그래서 연속분포에서는 곡선의 높이가 아니라 <strong>곡선 아래 넓이</strong>가 확률입니다. 신경망의 가중치를 처음에 정규분포에서 무작위로 뽑아 시작하는 것처럼, 정규분포는 딥러닝 곳곳에 등장합니다.
      </Callout>

      <h2>조건부 확률과 베이즈 정리</h2>
      <p>
        새 정보를 알게 되면 확률은 바뀝니다. "B가 일어났다는 걸 알 때 A의 확률"을 <T en="conditional probability">조건부 확률</T> <M>{'P(A\\mid B)'}</M>라고 씁니다. 조심할 점은 <M>{'P(A\\mid B)'}</M>와 <M>{'P(B\\mid A)'}</M>가 전혀 다를 수 있다는 것입니다. "병이 있을 때 검사가 양성일 확률"과 "검사가 양성일 때 병이 있을 확률"은 다른 질문입니다.
      </p>
      <p>
        두 확률을 이어 주는 공식이 <T en="Bayes' theorem">베이즈 정리</T>입니다. 원래 믿음(사전확률)에 증거가 얼마나 그럴듯한지(가능도)를 곱해 새 믿음(사후확률)을 얻습니다.
      </p>
      <MB note="사후확률 = 가능도 × 사전확률 ÷ 증거 전체의 확률">{'P(\\text{병}\\mid\\text{양성}) = \\frac{P(\\text{양성}\\mid\\text{병})\\,P(\\text{병})}{P(\\text{양성}\\mid\\text{병})\\,P(\\text{병}) + P(\\text{양성}\\mid\\text{건강})\\,P(\\text{건강})}'}</MB>
      <p>식보다 사람 1000명을 직접 세어 보는 편이 훨씬 쉽습니다.</p>
      <BayesFigure />
      <p>
        기본값(유병률 1%, 민감도 90%, 특이도 95%)에서 양성 판정을 받아도 실제로 병이 있을 확률은 15% 정도에 그칩니다. 대부분의 사람이 이 숫자를 90% 근처로 짐작합니다. 유병률을 20%로 올리면 같은 검사인데도 결과가 크게 달라지는 것을 확인해 보세요. 이 현상은 스팸 필터나 사기 거래 탐지처럼 찾으려는 대상이 드문 머신러닝 문제에서 그대로 나타납니다. 뒤의 <a href="#ai-basics/evaluation">모델 평가</a> 장에서 다시 만납니다.
      </p>
      <Callout kind="key">
        모델의 출력은 확률분포이고, 학습은 그 분포를 실제 데이터의 분포에 가깝게 만드는 일입니다. 확률을 해석할 때는 언제나 "무엇이 주어졌을 때의 확률인가"를 먼저 확인하세요.
      </Callout>
      <Quiz
        q="어떤 질병의 유병률이 매우 낮을 때, 정확한 검사에서 양성이 나와도 실제 환자일 확률이 낮은 주된 이유는?"
        options={['검사의 민감도가 낮아서', '건강한 사람이 워낙 많아 위양성의 수가 진짜 환자 수보다 많아서', '정규분포를 따르지 않아서', '표본이 너무 많아서']}
        answer={1}
        explain={<>1000명 중 환자가 10명뿐이면, 건강한 990명의 5%만 위양성이 나와도 약 50명입니다. 진짜 양성 9명보다 훨씬 많죠. 사전확률(유병률)을 무시하면 이 함정에 빠집니다.</>}
      />
    </>
  );
}
