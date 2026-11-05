import { useMemo, useState } from 'react';
import { Button, Callout, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { SETS, boundSteps, fstr, fv, judge, rationalBetween, type SetId } from './reals';
import './analysis.css';
import './reals.css';

const nf = (v: number, d = 6) => String(+v.toFixed(d));

function Proof({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rn-proof" role="note" aria-label={title}>
      <div className="rn-proof-head">{title}</div>
      {children}
    </div>
  );
}
const Qed = () => <span className="rn-qed">∎</span>;

/* ─────────────── Figure 1: rational upper bounds that keep shrinking ─────────────── */

const STEPS = boundSteps(5);

function BoundsFigure() {
  const P = usePalette();
  const s = useStepper(STEPS.length, 1, 'bounds');
  const st = STEPS[s.i];
  const u = fv(st.upper), l = fv(st.lower);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const c = (u + l) / 2;
      const half = Math.max((u - l) * 0.9, 1e-13);
      const p = new Plot(ctx, w, h, P, { xMin: c - half, xMax: c + half, yMin: -1, yMax: 1, pad: { l: 16, r: 16, t: 12, b: 12 } });
      p.line(p.xMin, 0, p.xMax, 0, P.lineStrong, 1.5);
      // the interval [2/u, u] that must contain √2
      ctx.fillStyle = alpha(P.accent, 0.16);
      ctx.fillRect(p.X(l), p.Y(0.28), p.X(u) - p.X(l), p.Y(-0.28) - p.Y(0.28));
      p.line(l, -0.36, l, 0.36, P.accent, 2.5);
      p.line(u, -0.36, u, 0.36, P.pos, 2.5);
      p.line(Math.SQRT2, -0.7, Math.SQRT2, 0.55, P.ink3, 1.2, [4, 4]);
      p.text('√2', Math.SQRT2, 0.62, P.ink2, { align: 'center', base: 'bottom', font: `600 12px ${P.fontMono}` });
      p.text(`위 경계 ${fstr(st.upper)}`, u, -0.45, P.ink, { align: 'right', base: 'top', dx: 6, font: `600 11px ${P.fontMono}`, bg: P.surface });
      p.text(`아래 경계 ${fstr(st.lower)}`, l, -0.75, P.ink, { align: 'left', base: 'top', dx: -6, font: `600 11px ${P.fontMono}`, bg: P.surface });
    },
    [P, s.i, u, l],
    { height: 150, minHeight: 40 },
  );

  return (
    <Figure
      no={1}
      title="가장 작은 유리수 위 경계를 찾아서"
      hint="▶를 눌러 위 경계를 한 단계씩 줄여 보세요"
      caption={
        <>
          주황 세로선은 제곱이 2보다 큰 유리수 u(위 경계)이고, 파란 세로선은 2/u(아래 경계)입니다. 다음 위 경계는 (u + 2/u)/2입니다. 화면은 단계마다 두 경계에 맞춰 확대되므로, 점선으로 그린 √2와 두 경계 사이의 간격이 실제로는 빠르게 줄어듭니다. 표의 u² − 2는 정확한 분수로 계산한 값입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="an-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${s.i + 1}단계: 위 경계 ${fstr(st.upper)}, 아래 경계 ${fstr(st.lower)}. 두 경계의 차는 ${(u - l).toExponential(2)}입니다.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="tbl-wrap" style={{ margin: 0 }}>
            <table className="rn-table">
              <thead>
                <tr>
                  <th>단계</th>
                  <th>위 경계 u</th>
                  <th>u² − 2</th>
                  <th>아래 경계 2/u</th>
                </tr>
              </thead>
              <tbody>
                {STEPS.map((x, k) => (
                  <tr key={k} data-now={k === s.i || undefined}>
                    <td>{k + 1}</td>
                    <td className="rn-mono">{fstr(x.upper)}</td>
                    <td className="rn-mono">{fstr(x.excess)}</td>
                    <td className="rn-mono">{fstr(x.lower)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="rn-bounds-speed" maxSpeed={4} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="위 경계 (소수)" value={nf(u, 13)} color="var(--pos)" />
            <Readout label="두 경계의 차" value={(u - l).toExponential(2)} />
          </div>
          <p className="an-small">어느 단계에서 멈춰도 위 경계는 유리수이고 제곱이 2보다 큽니다. 그러니 그보다 작은 유리수 위 경계가 또 있습니다.</p>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: is b an upper bound, and the least one? ─────────────── */

const X_MIN = -0.4, X_MAX = 1.9;

function SupFigure() {
  const P = usePalette();
  const [id, setId] = useState<SetId>('sqrtQ');
  const [b, setB] = useState(1.5);
  const set = SETS.find((x) => x.id === id)!;
  const v = useMemo(() => judge(set, b), [set, b]);
  const between = !v.isUpper && set.rationalOnly ? rationalBetween(b, set.supValue) : null;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const p = new Plot(ctx, w, h, P, { xMin: X_MIN, xMax: X_MAX, yMin: -1, yMax: 1, pad: { l: 16, r: 16, t: 10, b: 30 } });
      p.line(X_MIN, 0, X_MAX, 0, P.lineStrong, 1.5);
      for (let t = 0; t <= 1.8 + 1e-9; t += 0.2) {
        p.line(t, -0.06, t, 0.06, P.ink3, 1);
        p.text(nf(t, 1), t, -0.12, P.ink3, { align: 'center', base: 'top', font: `10px ${P.fontMono}` });
      }
      // the set: points, or a bar for an interval (dotted when it is only the rationals)
      if (set.interval) {
        const [a0, a1] = set.interval;
        ctx.strokeStyle = P.accent;
        ctx.lineWidth = 6;
        ctx.setLineDash(set.rationalOnly ? [2, 3] : []);
        ctx.beginPath();
        ctx.moveTo(p.X(Math.max(a0, X_MIN)), p.Y(0));
        ctx.lineTo(p.X(a1), p.Y(0));
        ctx.stroke();
        ctx.setLineDash([]);
        if (a0 >= X_MIN) p.dot(a0, 0, 5, P.surface, P.accent, 2);
        p.dot(a1, 0, 5, P.surface, P.accent, 2);
      }
      for (const x of set.points) p.dot(x, 0, 3.5, P.accent);
      if (set.rationalOnly) p.text('√2 자리는 비어 있음 →', set.supValue, 0.3, P.ink2, { align: 'right', base: 'bottom', dx: -8, font: `600 11px ${P.fontBody}`, bg: P.surface });
      // the candidate b
      p.line(b, -0.75, b, 0.75, P.pos, 3);
      p.text(`b = ${nf(b, 4)}`, b, 0.8, P.ink, { align: 'center', base: 'bottom', font: `600 11px ${P.fontMono}`, bg: P.surface });
      if (v.witness !== null) {
        p.dot(v.witness, 0, 6, P.bad, P.surface, 2);
        p.text('b보다 큰 원소', v.witness, -0.4, P.bad, { align: 'center', base: 'top', font: `600 11px ${P.fontBody}`, bg: P.surface });
      }
      if (v.smaller !== null) {
        p.line(v.smaller, -0.6, v.smaller, 0.6, P.good, 2, [5, 4]);
        p.text('더 작은 상계', v.smaller, -0.65, P.good, { align: 'center', base: 'top', font: `600 11px ${P.fontBody}`, bg: P.surface });
      }
    },
    [P, set, b, v],
    { height: 170, minHeight: 40 },
  );

  useDrag(wrapRef, {
    hit: (x) => {
      const w = wrapRef.current?.clientWidth ?? 600;
      const bx = 16 + ((b - X_MIN) / (X_MAX - X_MIN)) * (w - 32);
      return Math.abs(x - bx) < 18 ? 'b' : null;
    },
    onDrag: (_, x) => {
      const w = wrapRef.current?.clientWidth ?? 600;
      const t = X_MIN + ((x - 16) / (w - 32)) * (X_MAX - X_MIN);
      setB(Math.round(Math.max(-0.3, Math.min(1.8, t)) * 1000) / 1000);
    },
  });

  const supOk = set.sup !== null;
  return (
    <Figure
      no={2}
      title="상계인가, 가장 작은 상계인가"
      hint="주황 세로선 b를 끌거나 슬라이더로 옮겨 보세요"
      caption={
        <>
          파란 점과 막대가 집합의 원소이고, 속이 빈 동그라미는 집합에 들지 않는 끝점입니다. 점선 막대는 유리수만 모은 집합이라는 뜻입니다. b가 상계가 아니면 b보다 큰 원소를 빨간 점으로, 상계이지만 가장 작지 않으면 더 작은 상계를 초록 점선으로 보여 줍니다. 유리수 집합에서는 그 더 작은 상계도 유리수입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={(x) => setId(x)} options={SETS.map((x) => ({ value: x.id, label: x.label }))} />
      </div>
      <div className="rn-settex">
        <M>{set.tex}</M>
      </div>
      <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`집합 ${set.label}과 후보 b = ${nf(b, 4)}. ${v.isUpper ? '상계입니다' : '상계가 아닙니다'}. ${v.isLeast ? '가장 작은 상계, 곧 상한입니다.' : ''}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <Slider id="rn-b" label="후보 b" value={b} min={-0.3} max={1.8} step={0.001} onChange={setB} format={(x) => nf(x, 3)} />
        <div className="btn-row">
          <Button small onClick={() => supOk && setB(set.sup!)} disabled={!supOk}>
            상한에 놓기
          </Button>
          <Button small onClick={() => v.smaller !== null && setB(v.smaller)} disabled={v.smaller === null}>
            더 작은 상계로
          </Button>
        </div>
      </div>
      <div className="rn-verdict" aria-live="polite">
        <span data-ok={v.isUpper || undefined} data-no={!v.isUpper || undefined}>
          <i>{v.isUpper ? '○' : '✕'}</i>상계인가: {v.isUpper ? '예' : `아니요, ${between ? `유리수 ${between.m}/${between.n} ≈ ${nf(between.r, 6)}` : nf(v.witness ?? 0, 6)}이 집합에 있고 b보다 큽니다`}
        </span>
        <span data-ok={v.isLeast || undefined} data-no={(v.isUpper && !v.isLeast) || undefined}>
          <i>{v.isLeast ? '○' : v.isUpper ? '✕' : '–'}</i>가장 작은 상계인가:{' '}
          {v.isLeast ? '예, 이것이 상한입니다' : v.isUpper ? `아니요, ${nf(v.smaller ?? 0, 6)}도 상계입니다` : '상계가 아니므로 따질 필요가 없습니다'}
        </span>
      </div>
      <p className="an-note">
        {set.sup === null
          ? '이 집합은 유리수 안에 상한이 없습니다. 어떤 유리수 상계를 골라도 "더 작은 상계로"를 누를 수 있습니다.'
          : `상한은 ${nf(set.sup, 6)}이고, 집합에 ${set.supIn ? '들어 있으므로 최댓값이기도 합니다' : '들어 있지 않으므로 최댓값은 없습니다'}.`}
      </p>
    </Figure>
  );
}

/* ─────────────── Figure 3: a rational between any two reals ─────────────── */

function DensityFigure() {
  const P = usePalette();
  const [a, setA] = useState(0.3);
  const [lg, setLg] = useState(Math.log10(0.05));
  const gap = Math.pow(10, lg);
  const b = a + gap;
  const rb = useMemo(() => rationalBetween(a, b), [a, b]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const lo = a - gap * 0.9, hi = b + gap * 0.9;
      const p = new Plot(ctx, w, h, P, { xMin: lo, xMax: hi, yMin: -1, yMax: 1, pad: { l: 16, r: 16, t: 10, b: 10 } });
      p.line(lo, 0, hi, 0, P.lineStrong, 1.5);
      ctx.fillStyle = alpha(P.accent, 0.14);
      ctx.fillRect(p.X(a), p.Y(0.3), p.X(b) - p.X(a), p.Y(-0.3) - p.Y(0.3));
      // the multiples k/n that fall in the window
      const k0 = Math.ceil(lo * rb.n), k1 = Math.floor(hi * rb.n);
      for (let k = k0; k <= k1 && k - k0 < 400; k++) p.line(k / rb.n, -0.18, k / rb.n, 0.18, k === rb.m ? P.pos : P.ink3, k === rb.m ? 3 : 1);
      p.text('a', a, 0.42, P.accent, { align: 'center', base: 'bottom', font: `700 12px ${P.fontMono}` });
      p.text('b', b, 0.42, P.accent, { align: 'center', base: 'bottom', font: `700 12px ${P.fontMono}` });
      p.text(`${rb.m}/${rb.n}`, rb.m / rb.n, -0.3, P.ink, { align: 'center', base: 'top', font: `600 12px ${P.fontMono}`, bg: P.surface });
    },
    [P, a, b, gap, rb],
    { height: 120, minHeight: 40 },
  );

  return (
    <Figure
      no={3}
      title="두 실수 사이에서 유리수 찾기"
      hint="a와 간격을 바꿔 보세요. 간격을 아주 좁혀도 찾아냅니다"
      caption={
        <>
          파란 띠가 a와 b 사이입니다. 회색 눈금은 1/n 간격의 유리수 k/n이고, 주황 눈금이 증명에서 고르는 m/n입니다. n은 1/n이 b − a보다 작아지는 가장 작은 자연수, m은 na보다 큰 가장 작은 정수입니다. 화면은 언제나 a와 b 둘레를 확대해 보여 줍니다.
        </>
      }
    >
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`a = ${nf(a, 4)}, b = ${nf(b, 6)} 사이에서 찾은 유리수 ${rb.m}/${rb.n} ≈ ${nf(rb.r, 6)}.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="controls row">
        <Slider id="rn-a" label="a" value={a} min={0} max={2} step={0.001} onChange={setA} format={(x) => nf(x, 3)} />
        <Slider id="rn-gap" label="간격 b − a" value={lg} min={-3.3} max={-0.3} step={0.01} onChange={setLg} format={() => nf(gap, 5)} />
      </div>
      <div className="readouts">
        <Readout label="n (1/n < b − a)" value={rb.n.toLocaleString('ko-KR')} />
        <Readout label="m = ⌊na⌋ + 1" value={rb.m.toLocaleString('ko-KR')} />
        <Readout label="m/n" value={nf(rb.r, 8)} color="var(--pos)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function RealNumbers() {
  return (
    <>
      <h2>미적분학이 말하지 않은 것</h2>
      <p>
        <a href={lessonHref('math-calculus', 'limits')}>미적분학</a>에서는 "수열이 어떤 값에 다가간다", "연속 함수는 중간값을 모두 지난다" 같은 말을 그림으로 납득하고 넘어갔습니다. 그런데 이 말들이 참이려면 수직선에 빈자리가 없어야 합니다. 수직선이 유리수로만 되어 있다면 곡선 <M>{'y = x^2 - 2'}</M>는 x축을 뚫고 지나가면서도 x축과 만나지 않습니다. 만나야 할 자리 <M>{'\\sqrt{2}'}</M>가 유리수가 아니기 때문입니다.
      </p>
      <p>
        해석학은 이 빈자리를 메우는 성질 하나를 공리로 정하고, 미적분학의 정리들을 모두 그 공리에서 증명합니다. 이 장에서는 그 공리, <T en="completeness axiom">완비성 공리</T>가 무엇을 말하는지 봅니다. 증명은 <a href={lessonHref('math-discrete', 'proofs')}>증명하는 방법</a> 장에서 본 귀류법과 직접 증명을 씁니다.
      </p>

      <h2>유리수에는 구멍이 있다</h2>
      <p>먼저 정말 구멍이 있다는 것부터 증명합니다. 이 증명은 2,000년도 더 된 것이지만 해석학의 출발점으로 손색이 없습니다.</p>
      <Proof title="정리. √2는 유리수가 아니다.">
        <p>
          유리수라고 가정하고 모순을 끌어냅니다. <M>{'\\sqrt{2} = p/q'}</M>이고 p, q는 공약수가 없는 자연수라고 합시다. 제곱하면 <M>{'p^2 = 2q^2'}</M>이므로 <M>{'p^2'}</M>은 짝수이고, 홀수의 제곱은 홀수이니 p도 짝수입니다. <M>{'p = 2r'}</M>로 쓰면 <M>{'4r^2 = 2q^2'}</M>, 곧 <M>{'q^2 = 2r^2'}</M>이므로 같은 이유로 q도 짝수입니다. p와 q가 모두 2로 나누어떨어지므로 공약수가 없다는 가정과 모순입니다.
          <Qed />
        </p>
      </Proof>
      <p>
        이제 유리수 집합 <M>{'A = \\{q \\in \\mathbb{Q} : q^2 < 2\\}'}</M>를 생각합니다. A의 원소는 모두 2보다 작으니 A는 위로 막혀 있습니다. 그러면 A를 위에서 막는 가장 작은 유리수가 있을까요? 그림 1에서 2부터 시작해 위 경계를 줄여 보세요.
      </p>
      <BoundsFigure />
      <p>
        위 경계는 2, 3/2, 17/12, 577/408, 665857/470832로 줄어들고, 다섯째 경계와 √2의 차이는 약 <M>{'1.6 \\times 10^{-12}'}</M>입니다. 그래도 표의 <M>{'u^2 - 2'}</M>는 언제나 0보다 큽니다(2, 1/4, 1/144, 1/166464, 1/221682772224). 아무리 줄여도 √2에 닿지 않고, 닿지 않는 한 더 줄일 수 있습니다. 이것을 증명으로 적으면 다음과 같습니다.
      </p>
      <Proof title="정리. A에는 유리수 중에서 가장 작은 위 경계가 없다.">
        <p>
          u가 A의 유리수 상계라고 합시다. <M>{'u^2 < 2'}</M>라면 u보다 조금 큰 유리수도 제곱이 2보다 작아서 A에 들어가므로 u는 상계일 수 없습니다. <M>{'u^2 = 2'}</M>는 앞의 정리로 불가능합니다. 따라서 <M>{'u^2 > 2'}</M>입니다.
        </p>
        <p>
          이제 <M>{"u' = \\tfrac{1}{2}(u + 2/u)"}</M>로 두면 u′은 유리수이고, <M>{"u - u' = \\tfrac{u^2 - 2}{2u} > 0"}</M>이므로 u보다 작습니다. 또 <M>{"(u')^2 - 2 = \\tfrac{(u - 2/u)^2}{4} > 0"}</M>이므로 u′의 제곱은 여전히 2보다 크고, A의 모든 원소 q는 <M>{"q^2 < 2 < (u')^2"}</M>에서 <M>{"q < u'"}</M>입니다. 곧 u′은 u보다 작은 유리수 상계입니다. 어떤 유리수 상계에도 더 작은 것이 있으므로 가장 작은 것은 없습니다.
          <Qed />
        </p>
      </Proof>

      <h2>상한과 완비성 공리</h2>
      <p>
        이 현상에 이름을 붙이기 위해 몇 가지를 정의합니다. 실수의 집합 S에 대해, 모든 원소 x가 <M>{'x \\le b'}</M>를 만족하는 b를 S의 <T en="upper bound">상계</T>라고 합니다. 상계가 있으면 S는 <T en="bounded above">위로 유계</T>입니다. 상계 중 가장 작은 것을 <T en="supremum, least upper bound">상한</T>이라 하고 <M>{'\\sup S'}</M>로 씁니다. 정확히 쓰면 s가 S의 상한이라는 것은 다음 두 조건입니다.
      </p>
      <MB>{'\\text{(1)}\\ \\ x \\le s \\ \\text{ for all } x \\in S, \\qquad \\text{(2)}\\ \\ \\text{for every } \\varepsilon > 0 \\text{ there is } x \\in S \\text{ with } x > s - \\varepsilon.'}</MB>
      <p>
        (1)은 s가 상계라는 뜻이고, (2)는 s보다 조금이라도 작은 수는 상계가 아니라는 뜻입니다. 아래 경계에 대해서도 똑같이 <T en="lower bound">하계</T>와 <T en="infimum">하한</T> <M>{'\\inf S'}</M>를 정의합니다. 그림 2에서 집합을 바꿔 가며 후보 b를 옮겨 보세요.
      </p>
      <SupFigure />
      <p>
        처음 설정은 유리수 집합 A와 b = 1.5입니다. 1.5는 상계이지만 "더 작은 상계로"를 누르면 17/12 ≈ 1.41667로, 다시 누르면 577/408 ≈ 1.414216으로 내려갑니다. 그림 1에서 본 그대로입니다. 반면 같은 모양의 실수 집합 <M>{'\\{x \\in \\mathbb{R} : x^2 < 2\\}'}</M>에서는 "상한에 놓기"가 √2에 b를 놓고, 그것이 가장 작은 상계라고 판정합니다. 유한집합에서는 상한이 가장 큰 원소 1.1이고, 열린구간 (0, 1)과 <M>{'\\{1 - 1/n\\}'}</M>에서는 상한 1이 집합에 들어 있지 않아 최댓값이 없습니다. 상한은 최댓값을 일반화한 것이고, 최댓값이 없는 집합에도 있을 수 있습니다.
      </p>
      <p>이제 실수를 유리수와 가르는 성질을 공리로 적습니다.</p>
      <MB note="완비성 공리">{'\\text{공집합이 아니고 위로 유계인 실수의 부분집합에는 언제나 실수인 상한이 있다.}'}</MB>
      <p>
        유리수는 이 공리를 만족하지 않고(A가 반례입니다), 실수는 이 공리를 만족하도록 만든 수 체계입니다. 실수를 유리수에서 실제로 만들어 내는 방법(데데킨트 절단, 코시 수열의 동치류)도 있지만, 이 과목에서는 공리로 받아들이고 그 결과를 끌어냅니다. 다음 장의 단조 수렴 정리, 그 뒤의 중간값 정리와 최대·최소 정리가 모두 이 한 줄에서 나옵니다.
      </p>
      <Callout kind="note">
        x² = 2인 양수가 실수 안에 있다는 것도 이 공리의 결과입니다. 실수 집합 <M>{'\\{x : x^2 < 2\\}'}</M>의 상한을 s라 하면, <M>{'s^2 < 2'}</M>일 때도 <M>{'s^2 > 2'}</M>일 때도 위의 증명처럼 s를 조금 옮겨 모순을 만들 수 있으므로 <M>{'s^2 = 2'}</M>입니다.
      </Callout>

      <h2>자연수는 끝이 없고, 유리수는 어디에나 있다</h2>
      <p>완비성에서 바로 나오는 성질 두 개가 앞으로 계속 쓰입니다.</p>
      <Proof title="정리 (아르키메데스 성질). 어떤 실수 x에 대해서도 x보다 큰 자연수가 있다. 따라서 어떤 ε > 0에 대해서도 1/n < ε인 자연수 n이 있다.">
        <p>
          그런 자연수가 없다면 x는 자연수 집합 ℕ의 상계이므로, 완비성 공리에 따라 상한 <M>{'s = \\sup \\mathbb{N}'}</M>가 있습니다. 상한의 조건 (2)를 ε = 1로 쓰면 <M>{'n > s - 1'}</M>인 자연수 n이 있고, 그러면 n + 1은 s보다 큰 자연수이므로 s가 상계라는 데 모순입니다. 둘째 문장은 x = 1/ε에 적용하면 됩니다.
          <Qed />
        </p>
      </Proof>
      <Proof title="정리 (유리수의 조밀성). a < b인 두 실수 사이에는 언제나 유리수가 있다.">
        <p>
          아르키메데스 성질로 <M>{'1/n < b - a'}</M>, 곧 <M>{'nb - na > 1'}</M>인 자연수 n을 고릅니다. <M>{'m = \\lfloor na \\rfloor + 1'}</M>로 두면 m은 na보다 큰 가장 작은 정수이므로 <M>{'na < m \\le na + 1 < nb'}</M>입니다. n으로 나누면 <M>{'a < m/n < b'}</M>입니다.
          <Qed />
        </p>
      </Proof>
      <DensityFigure />
      <p>
        처음 설정 a = 0.3, b = 0.35에서는 간격이 0.05이므로 n = 21이고, m = ⌊6.3⌋ + 1 = 7이어서 7/21, 곧 1/3을 찾습니다. 간격을 0.0005까지 좁혀도 증명은 똑같이 작동하고 n만 커집니다. 같은 논리를 한 번 더 쓰면 두 실수 사이에는 유리수가 무한히 많고, √2를 더해 옮기면 무리수도 무한히 많다는 것을 알 수 있습니다.
      </p>
      <Callout kind="intuition">
        0.999…는 1과 같을까요? 무한소수 0.999…는 유한소수 0.9, 0.99, 0.999, … 의 상한으로 정의합니다. 1은 이 수들의 상계입니다. 1보다 작은 수 1 − ε는 상계가 아닙니다. 아르키메데스 성질로 <M>{'10^{-k} < \\varepsilon'}</M>인 k를 고르면 <M>{'1 - 10^{-k}'}</M>가 1 − ε보다 크기 때문입니다. 따라서 상한은 정확히 1입니다. 이것은 관습이나 근삿값이 아니라 상한의 정의에서 나오는 등식입니다.
      </Callout>

      <Callout kind="key">
        유리수에는 √2 같은 구멍이 있어서, 위로 막힌 유리수 집합에 가장 작은 유리수 상계가 없을 수 있습니다. 실수는 공집합이 아니고 위로 유계인 모든 부분집합에 상한이 있다는 완비성 공리로 이 구멍을 메운 수 체계입니다. 상한 s는 "모든 원소가 s 이하"이고 "s보다 작은 수는 어느 것도 상계가 아니다"라는 두 조건으로 정의되며, 최댓값이 없는 집합에도 있을 수 있습니다. 완비성에서 아르키메데스 성질과 유리수의 조밀성이 나오고, 이후의 수렴 정리들도 모두 여기에 기댑니다.
      </Callout>
      <Quiz
        q="실수의 부분집합 S = {1 − 1/n : n = 1, 2, 3, …}에 대한 설명으로 옳은 것은?"
        options={['최댓값은 없지만 상한은 1이다', '최댓값과 상한이 모두 1이다', '위로 유계가 아니므로 상한이 없다', '상한은 0.999…이고 1과는 다르다']}
        answer={0}
        explain={<>모든 원소가 1보다 작으므로 1은 상계입니다. 1보다 작은 수 1 − ε에 대해서는 아르키메데스 성질로 1/n &lt; ε인 n을 골라 원소 1 − 1/n이 1 − ε보다 크게 할 수 있으니, 1 − ε는 상계가 아닙니다. 따라서 상한은 1입니다. 하지만 1 = 1 − 1/n인 n은 없으므로 1은 집합에 들지 않고, 최댓값도 없습니다. 0.999…는 1과 같은 수입니다.</>}
      />
    </>
  );
}
