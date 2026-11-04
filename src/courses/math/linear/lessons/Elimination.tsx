import { useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { arrow, clipTo, label, plane, useLaColors } from './draw';
import { VARS, eliminate, frac } from './elim';
import { coords, nf, norm, roundSig, scale, type Vec2 } from './la';
import './linear.css';

/* ─────────────── Figure 1: equations as lines (row picture) and as columns (column picture) ─────────────── */

type Eq = [number, number, number]; // a x + b y = c
const EQ_PRESETS: { name: string; eqs: Eq[] }[] = [
  {
    name: '해 하나',
    eqs: [
      [1, 1, 3],
      [2, -1, 0],
    ],
  },
  {
    name: '해 없음',
    eqs: [
      [1, 2, 4],
      [2, 4, 2],
    ],
  },
  {
    name: '해 무수히',
    eqs: [
      [1, -1, 1],
      [-2, 2, -2],
    ],
  },
  {
    name: '식 세 개',
    eqs: [
      [1, 1, 3],
      [2, -1, 0],
      [1, -2, -1],
    ],
  },
];

function NumIn({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <input
      type="number"
      step={0.5}
      inputMode="decimal"
      aria-label={label}
      value={txt ?? String(value)}
      onChange={(e) => {
        setTxt(e.target.value);
        const v = parseFloat(e.target.value);
        if (isFinite(v)) onChange(Math.max(-9, Math.min(9, v)));
      }}
      onBlur={() => setTxt(null)}
    />
  );
}

/** Least-squares point for several lines: solve (AᵀA)p = Aᵀc. */
function lsq(eqs: Eq[]): Vec2 | null {
  let s11 = 0;
  let s12 = 0;
  let s22 = 0;
  let t1 = 0;
  let t2 = 0;
  for (const [a, b, c] of eqs) {
    s11 += a * a;
    s12 += a * b;
    s22 += b * b;
    t1 += a * c;
    t2 += b * c;
  }
  const d = s11 * s22 - s12 * s12;
  if (Math.abs(d) < 1e-9) return null;
  return [(t1 * s22 - t2 * s12) / d, (s11 * t2 - s12 * t1) / d];
}

function classify(eqs: Eq[]): { kind: 'one' | 'none' | 'many'; p: Vec2 | null } {
  const [e1, e2] = eqs;
  const p = coords([e1[0], e2[0]], [e1[1], e2[1]], [e1[2], e2[2]]);
  if (eqs.length === 2) {
    if (p) return { kind: 'one', p };
    // parallel rows: same line or never meet. Compare the augmented rows.
    const r1 = norm([e1[0], e1[1]]) > 1e-9 ? e1 : e2;
    const other = r1 === e1 ? e2 : e1;
    const k = Math.abs(r1[0]) > Math.abs(r1[1]) ? other[0] / r1[0] : other[1] / r1[1];
    const same = Math.abs(other[2] - k * r1[2]) < 1e-9 && !(norm([e1[0], e1[1]]) < 1e-9 && Math.abs(e1[2]) > 1e-9);
    return { kind: same ? 'many' : 'none', p: null };
  }
  const q = lsq(eqs);
  if (q && eqs.every(([a, b, c]) => Math.abs(a * q[0] + b * q[1] - c) < 1e-7)) return { kind: 'one', p: q };
  return { kind: 'none', p: q };
}

const sgn = (v: number, first = false) => (v < 0 ? '−' : first ? '' : '+');
function eqText([a, b, c]: Eq) {
  const t = (k: number, v: string, first: boolean) => (Math.abs(k) < 1e-9 ? '' : `${sgn(k, first)} ${Math.abs(k) === 1 ? '' : nf(Math.abs(k), 2)}${v} `);
  const s = (t(a, 'x', true) + t(b, 'y', Math.abs(a) < 1e-9)).trim() || '0';
  return `${s} = ${nf(c, 2)}`;
}

function SystemFigure() {
  const P = usePalette();
  const [C1, , C3] = useLaColors(P);
  const [eqs, setEqs] = useState<Eq[]>(EQ_PRESETS[0].eqs);
  const [view, setView] = useState<'row' | 'col'>('row');
  const lineCols = [P.neg, P.pos, C3];
  const { kind, p } = classify(eqs);
  const n = eqs.length;
  const v = n === 3 ? 'row' : view;

  const setCoef = (i: number, k: number, val: number) => setEqs((cur) => cur.map((e, j) => (j === i ? (e.map((x, m) => (m === k ? val : x)) as Eq) : e)));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      if (v === 'row') {
        const plot = plane(ctx, w, h, P, 4.6, { cx: 1, cy: 1.5 });
        const un = clipTo(plot);
        eqs.forEach(([a, b, c], i) => {
          if (Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9) return;
          const nn = a * a + b * b;
          const p0: Vec2 = [(a * c) / nn, (b * c) / nn];
          const dir: Vec2 = [-b, a];
          const L = 40;
          plot.line(p0[0] - dir[0] * L, p0[1] - dir[1] * L, p0[0] + dir[0] * L, p0[1] + dir[1] * L, lineCols[i], kind === 'many' ? 6 - 3 * i : 2.5, kind === 'many' && i === 1 ? [8, 6] : undefined);
        });
        un();
        if (p && kind === 'one') {
          plot.dot(p[0], p[1], 7, C1, P.surface, 2);
          label(plot, `(${frac(p[0])}, ${frac(p[1])})`, p, C1, P, 12, -14);
        } else if (p && n === 3) {
          plot.dot(p[0], p[1], 6, P.surface, C1, 2.5);
          label(plot, '최소제곱 해', p, C1, P, 12, -14);
        }
      } else {
        // column picture: x·(a₁, a₂) + y·(b₁, b₂) = (c₁, c₂)
        const plot = plane(ctx, w, h, P, 5);
        const c1: Vec2 = [eqs[0][0], eqs[1][0]];
        const c2: Vec2 = [eqs[0][1], eqs[1][1]];
        const rhs: Vec2 = [eqs[0][2], eqs[1][2]];
        if (p) {
          const a = scale(c1, p[0]);
          plot.line(0, 0, a[0], a[1], alpha(P.neg, 0.45), 6);
          plot.line(a[0], a[1], rhs[0], rhs[1], alpha(P.pos, 0.45), 6);
        }
        arrow(plot, [0, 0], c1, P.neg, 3, 11);
        arrow(plot, [0, 0], c2, P.pos, 3, 11);
        arrow(plot, [0, 0], rhs, C1, 3, 11);
        label(plot, '첫째 열 (x의 계수)', c1, P.neg, P, 8, 14);
        label(plot, '둘째 열 (y의 계수)', c2, P.pos, P, 8, -14);
        label(plot, '우변 b', rhs, C1, P, 8, -14);
      }
    },
    [P, eqs, v, kind, p],
    { aspect: 1.2, maxHeight: 460 },
  );

  const verdict =
    kind === 'one'
      ? n === 3
        ? '세 직선이 한 점에서 만납니다. 운이 좋은 경우입니다.'
        : `두 직선이 한 점 (${frac(p![0])}, ${frac(p![1])})에서 만납니다. 해가 하나입니다.`
      : kind === 'many'
        ? '두 식이 사실 같은 직선입니다(한 식이 다른 식의 상수배). 직선 위의 모든 점이 해입니다.'
        : n === 3
          ? '세 직선이 한 점에서 만나지 않습니다. 정확한 해는 없고, 세 식을 "가장 덜 어기는" 최소제곱 해(빈 원)를 대신 쓸 수 있습니다.'
          : '두 직선이 평행해서 만나지 않습니다. 해가 없습니다.';

  return (
    <Figure
      no={1}
      title="연립방정식 = 직선들이 만나는 곳"
      hint="계수를 고치거나 예시를 골라 보세요"
      caption={<>행 그림에서는 식 하나가 직선 하나이고, 해는 모든 직선이 지나는 점입니다. 열 그림에서는 같은 문제를 "첫째 열을 x배, 둘째 열을 y배 해서 우변 b를 만들기"로 봅니다. 1장의 선형결합 문제와 똑같습니다. 열 그림은 식이 두 개일 때만 평면에 그릴 수 있습니다.</>}
    >
      <div className="controls row">
        <Seg label="예시" value={EQ_PRESETS.findIndex((pr) => pr.eqs === eqs)} onChange={(i) => i >= 0 && setEqs(EQ_PRESETS[i].eqs)} options={EQ_PRESETS.map((pr, i) => ({ value: i, label: pr.name }))} />
        <Seg label="보는 방법" value={v} onChange={setView} options={[{ value: 'row', label: '행 그림' }, { value: 'col', label: n === 3 ? '열 그림 (식 2개만)' : '열 그림' }]} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} role="img" aria-label={`${v === 'row' ? '행 그림' : '열 그림'}: ${eqs.map(eqText).join(', ')}. ${verdict}`} />
        </div>
        <div className="controls">
          <div className="la-eqs">
            {eqs.map((e, i) => (
              <div key={i} className="la-eqrow" style={{ borderLeftColor: lineCols[i] }}>
                <NumIn value={e[0]} onChange={(x) => setCoef(i, 0, x)} label={`${i + 1}번 식의 x 계수`} />
                <span>x +</span>
                <NumIn value={e[1]} onChange={(x) => setCoef(i, 1, x)} label={`${i + 1}번 식의 y 계수`} />
                <span>y =</span>
                <NumIn value={e[2]} onChange={(x) => setCoef(i, 2, x)} label={`${i + 1}번 식의 우변`} />
              </div>
            ))}
          </div>
          <Check label="세 번째 식 넣기" checked={n === 3} onChange={(on) => setEqs((cur) => (on ? [...cur.slice(0, 2), [1, -2, -1]] : cur.slice(0, 2)))} />
          <div className="readouts la-readtext" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="해의 개수" value={kind === 'one' ? '하나' : kind === 'many' ? '무수히 많음' : '없음'} color={kind === 'one' ? 'var(--good)' : kind === 'many' ? 'var(--hl)' : 'var(--bad)'} />
          </div>
          <div className="la-note" aria-live="polite">
            {verdict}
          </div>
        </div>
      </div>
      <Legend items={[{ color: P.neg, label: '1번 식', shape: 'ln' }, { color: P.pos, label: '2번 식', shape: 'ln' }, ...(n === 3 ? [{ color: C3, label: '3번 식', shape: 'ln' as const }] : []), { color: C1, label: '해', shape: 'dot' as const }]} />
    </Figure>
  );
}

/* ─────────────── Figure 2: Gaussian elimination, one row operation at a time ─────────────── */

const ELIM_PRESETS: { name: string; A: number[][] }[] = [
  {
    name: '보통',
    A: [
      [2, 1, -1, 8],
      [-3, -1, 2, -11],
      [-2, 1, 2, -3],
    ],
  },
  {
    name: '첫 피벗이 0',
    A: [
      [0, 2, 1, 7],
      [1, 1, 1, 6],
      [2, 1, -1, 1],
    ],
  },
  {
    name: '해 없음',
    A: [
      [1, 2, 1, 4],
      [2, 4, 3, 9],
      [3, 6, 4, 15],
    ],
  },
  {
    name: '해 무수히',
    A: [
      [1, 2, 1, 4],
      [2, 4, 3, 9],
      [3, 6, 4, 13],
    ],
  },
];

function ElimFigure() {
  const [pi, setPi] = useState(0);
  const [pivoting, setPivoting] = useState(false);
  const frames = useMemo(() => eliminate(ELIM_PRESETS[pi].A, pivoting), [pi, pivoting]);
  const s = useStepper(frames.length, 1, `${pi}|${pivoting}`);
  const f = frames[s.i];
  const prev = frames[Math.max(0, s.i - 1)];
  const n = f.M.length;
  const role = (i: number) => (f.bad === i ? 'bad' : f.swap && f.swap.includes(i) ? 'swap' : f.target === i ? 'target' : f.pivotRow === i ? 'pivot' : undefined);

  return (
    <Figure
      no={2}
      title="가우스 소거를 한 단계씩"
      hint="▶ 단계를 넘기며 행 연산을 따라가 보세요"
      caption={<>테두리 친 칸이 피벗, 연한 색 행이 피벗 행, 노란 행이 지금 바뀌는 행입니다. 방금 값이 바뀐 칸은 굵게 표시됩니다. 앞 단계(전진 소거)에서 대각선 아래를 모두 0으로 만들면, 뒤 단계(후진 대입)에서 맨 아래 식부터 하나씩 풀립니다.</>}
    >
      <div className="controls row">
        <Seg label="연립방정식" value={pi} onChange={setPi} options={ELIM_PRESETS.map((p, i) => ({ value: i, label: p.name }))} />
        <Check label="부분 피벗팅 (가장 큰 수를 피벗으로)" checked={pivoting} onChange={setPivoting} />
      </div>
      <div className="fig-split">
        <div className="la-panel">
          <div className="la-op" aria-live="polite">
            {f.op || ' '}
          </div>
          <div className="la-aug-wrap">
            <table className="la-aug" aria-label={`확대행렬 ${s.i + 1}단계`}>
              <tbody>
                {f.M.map((row, i) => (
                  <tr key={i} data-role={role(i)}>
                    <th scope="row">R{['₁', '₂', '₃'][i]}</th>
                    {row.map((v, j) => (
                      <td key={j} className={j === n ? 'bar' : undefined} data-pivot={f.pivot && f.pivot[0] === i && f.pivot[1] === j ? true : undefined} data-zero={Math.abs(v) < 1e-9 && j < n ? true : undefined} data-changed={s.i > 0 && Math.abs(prev.M[i][j] - v) > 1e-9 && !f.swap ? true : undefined}>
                        {frac(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="la-note" aria-live="polite" style={{ minHeight: '5em' }}>
            {f.note}
          </div>
          {f.solved && (
            <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {f.solved.map((x, i) => (
                <Readout key={i} label={VARS[i]} value={x ?? '?'} color={x ? 'var(--good)' : 'var(--ink-3)'} />
              ))}
            </div>
          )}
        </div>
        <div className="controls">
          <StepControls s={s} id="el-speed" maxSpeed={4} />
          <ol className="la-steps" aria-label="연산 목록">
            {frames.map((fr, k) => (fr.op ? (
              <li key={k} data-now={k === s.i || undefined} data-past={k < s.i || undefined}>
                {fr.op}
              </li>
            ) : null))}
          </ol>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: why pivoting matters with few digits ─────────────── */

function solveTiny(eps: number, digits: number, pivot: boolean) {
  const r = (v: number) => roundSig(v, digits);
  if (!pivot) {
    // ε x + y = 1 is the pivot row
    const m = r(1 / eps);
    const a22 = r(1 - r(m * 1));
    const b2 = r(2 - r(m * 1));
    const y = r(b2 / a22);
    const x = r(r(1 - y) / eps);
    return { m, a22, b2, x, y };
  }
  // swap: x + y = 2 is the pivot row
  const m = r(eps);
  const a22 = r(1 - r(m * 1));
  const b2 = r(1 - r(m * 2));
  const y = r(b2 / a22);
  const x = r(2 - y);
  return { m, a22, b2, x, y };
}

function PivotFigure() {
  const P = usePalette();
  const [C1] = useLaColors(P);
  const [k, setK] = useState(5);
  const [digits, setDigits] = useState(4);
  const eps = Math.pow(10, -k);
  const exact: Vec2 = [1 / (1 - eps), (1 - 2 * eps) / (1 - eps)];
  const bad = solveTiny(eps, digits, false);
  const good = solveTiny(eps, digits, true);
  const errBad = Math.hypot(bad.x - exact[0], bad.y - exact[1]);
  const errGood = Math.hypot(good.x - exact[0], good.y - exact[1]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = plane(ctx, w, h, P, 1.6, { cx: 0.8, cy: 1, step: 0.5 });
      const un = clipTo(plot);
      plot.line(-5, 1 + 5 * eps, 5, 1 - 5 * eps, P.neg, 2.5);
      plot.line(-5, 7, 5, -3, P.pos, 2.5);
      un();
      plot.dot(exact[0], exact[1], 8, alpha(P.good, 0.25), P.good, 2);
      const show = (q: Vec2, col: string, txt: string, dy: number) => {
        const inside = q[0] > plot.xMin && q[0] < plot.xMax && q[1] > plot.yMin && q[1] < plot.yMax;
        const qq: Vec2 = inside ? q : [Math.max(plot.xMin + 0.1, Math.min(plot.xMax - 0.1, q[0])), Math.max(plot.yMin + 0.1, Math.min(plot.yMax - 0.1, q[1]))];
        plot.dot(qq[0], qq[1], 5, col);
        label(plot, inside ? txt : `${txt} (화면 밖)`, qq, col, P, 10, dy);
      };
      show([good.x, good.y], C1, '피벗팅', 18);
      show([bad.x, bad.y], P.bad, '피벗팅 없이', -16);
    },
    [P, k, digits],
    { aspect: 1.3, maxHeight: 400 },
  );

  return (
    <Figure
      no={3}
      title="작은 피벗은 위험하다"
      hint="ε를 작게, 자릿수를 적게 해 보세요"
      caption={<>연립방정식 εx + y = 1, x + y = 2를 유효숫자가 몇 자리뿐인 계산기로 풉니다. 참값은 거의 (1, 1)입니다(초록 원). 피벗팅 없이 아주 작은 ε로 나누면 1/ε이라는 거대한 배수가 생기고, 반올림 오차가 그만큼 부풀어 엉뚱한 답이 나옵니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} role="img" aria-label={`ε = 10의 −${k}제곱, 유효숫자 ${digits}자리. 피벗팅 없이 구한 해 (${nf(bad.x, 3)}, ${nf(bad.y, 3)}), 피벗팅으로 구한 해 (${nf(good.x, 3)}, ${nf(good.y, 3)}), 참값 약 (1, 1).`} />
        </div>
        <div className="controls">
          <Slider id="pv-k" label="ε = 10^−k" value={k} min={1} max={10} step={1} onChange={setK} format={(v) => `ε = 1e−${v}`} />
          <Slider id="pv-d" label="유효숫자 자릿수" value={digits} min={3} max={12} step={1} onChange={setDigits} format={(v) => `${v}자리`} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="피벗팅 없이: 배수" value={bad.m.toExponential(1).replace('-', '−')} />
            <Readout label="피벗팅: 배수" value={nf(good.m, Math.min(10, k + 1))} />
            <Readout label="피벗팅 없이 (x, y)" value={`(${nf(bad.x, 3)}, ${nf(bad.y, 3)})`} color="var(--bad)" />
            <Readout label="피벗팅 (x, y)" value={`(${nf(good.x, 3)}, ${nf(good.y, 3)})`} color="var(--c-math-1)" />
            <Readout label="오차" value={nf(errBad, 3)} color={errBad > 0.01 ? 'var(--bad)' : undefined} />
            <Readout label="오차" value={nf(errGood, 3)} />
          </div>
          <div className="la-note" aria-live="polite">
            {errBad > 0.05 ? (
              <>
                피벗팅 없이 풀면 <strong>y는 거의 맞는데 x가 크게 틀립니다.</strong> y의 작은 반올림 오차가 x = (1 − y)/ε에서 1/ε = 10<sup>{k}</sup>배로 부풀기 때문입니다.
              </>
            ) : (
              <>지금은 자릿수가 충분해서 두 방법 모두 괜찮습니다. ε를 더 작게 하거나 자릿수를 줄여 보세요.</>
            )}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Elimination() {
  return (
    <>
      <h2>방정식 여러 개를 한꺼번에</h2>
      <p>
        카페에서 아메리카노 1잔과 라테 1잔이 9,000원, 아메리카노 2잔과 라테 1잔이 13,000원이라면 각각 얼마일까요? 미지수가 여럿이고 식도 여럿인 이런 문제를 <T en="system of linear equations">연립일차방정식</T>이라고 합니다. "일차"는 미지수끼리 곱하거나 제곱하지 않는다는 뜻입니다. 회로의 전류, 구조물에 걸리는 힘, 회귀 모델의 계수, 3D 그래픽스의 조명 계산까지 공학의 많은 문제가 결국 이런 식 묶음을 푸는 일입니다.
      </p>
      <p>미지수가 둘이면 일차방정식 하나는 평면 위의 직선이고, 연립방정식의 해는 모든 직선이 함께 지나는 점입니다. 그림 1에서 직선들의 관계를 바꿔 보세요.</p>
      <SystemFigure />
      <p>
        두 직선의 관계는 세 가지뿐이고, 그래서 해의 개수도 세 가지뿐입니다. 한 점에서 만나면 해가 <strong>하나</strong>, 평행하면 <strong>없음</strong>, 겹치면 <strong>무수히 많음</strong>입니다. 해가 두 개나 세 개인 경우는 없습니다. 두 점을 지나는 직선은 하나뿐이니 두 직선이 두 점을 공유하면 같은 직선이기 때문입니다. 미지수가 셋이면 식 하나는 3차원 공간의 평면이 되고, 세 평면이 한 점에서 만나거나, 만나지 않거나, 한 직선(또는 평면)을 공유하는 같은 세 경우가 나옵니다.
      </p>
      <p>
        열 그림으로 바꿔 보면 같은 문제가 <a href={lessonHref('math-linear-algebra', 'vectors')}>1장</a>의 질문으로 변합니다. "두 열 벡터를 몇 배씩 더해야 우변 b가 되는가?" 열들이 평면을 생성하면 어떤 b든 만들 수 있고(해 하나), 열들이 나란하면 b가 그 직선 위에 있을 때만 만들 수 있습니다(해가 무수히 많거나 없음).
      </p>

      <h2>행렬로 적기</h2>
      <p>식이 많아지면 x, y, z와 등호를 매번 쓰는 것이 번거롭습니다. 계수만 모아 행렬로 적으면 연립방정식 전체가 식 하나가 됩니다.</p>
      <MB note="A는 계수 행렬, x는 미지수 벡터, b는 우변 벡터입니다. 행렬-벡터 곱의 각 행이 방정식 하나입니다.">{'\\begin{aligned} 2x + y - z &= 8 \\\\ -3x - y + 2z &= -11 \\\\ -2x + y + 2z &= -3 \\end{aligned} \\quad\\Longleftrightarrow\\quad \\underbrace{\\begin{pmatrix} 2 & 1 & -1 \\\\ -3 & -1 & 2 \\\\ -2 & 1 & 2 \\end{pmatrix}}_{A} \\underbrace{\\begin{pmatrix} x \\\\ y \\\\ z \\end{pmatrix}}_{\\mathbf x} = \\underbrace{\\begin{pmatrix} 8 \\\\ -11 \\\\ -3 \\end{pmatrix}}_{\\mathbf b}'}</MB>
      <p>
        계산할 때는 A 옆에 b를 한 열 더 붙인 <T en="augmented matrix">확대행렬</T> <M>{'[\\,A \\mid \\mathbf b\\,]'}</M>을 씁니다. 각 행이 방정식 하나이고, 행에 하는 일은 곧 방정식에 하는 일입니다.
      </p>

      <h2>가우스 소거</h2>
      <p>
        중학교에서 배운 소거법을 기계적인 절차로 다듬은 것이 <T en="Gaussian elimination">가우스 소거</T>입니다. 해를 바꾸지 않는 세 가지 <T en="elementary row operations">기본 행 연산</T>만 씁니다.
      </p>
      <ol>
        <li>두 행의 순서를 바꾼다. (방정식을 적는 순서를 바꿀 뿐입니다.)</li>
        <li>한 행에 0이 아닌 수를 곱한다. (등식 양변에 같은 수를 곱해도 등식입니다.)</li>
        <li>한 행에 다른 행의 상수배를 더한다. (참인 등식 둘을 더해도 참입니다.)</li>
      </ol>
      <p>
        목표는 대각선 아래를 모두 0으로 만들어 계단 모양, 즉 <T en="row echelon form">행 사다리꼴</T>로 바꾸는 것입니다. 각 열에서 아래 칸들을 지우는 데 쓰는 기준 칸을 <T en="pivot">피벗</T>이라고 합니다. 피벗 행의 적당한 배수를 아래 행에서 빼서 피벗 아래를 0으로 만들고, 다음 열로 넘어갑니다. 계단 모양이 되면 맨 아래 식에는 미지수가 하나만 남으니 바로 풀리고, 그 값을 위 식에 넣으면 다음 미지수가 풀립니다. 이것이 <T en="back substitution">후진 대입</T>입니다.
      </p>
      <ElimFigure />
      <p>
        그림 2의 네 예시는 앞에서 본 세 경우를 모두 보여 줍니다. "보통"은 피벗이 셋 다 서서 해가 하나입니다. "첫 피벗이 0"은 첫 행의 x 계수가 0이라 그대로는 나눌 수 없어서 행을 바꾸고 시작합니다. "해 없음"은 소거 끝에 <M>{'0 = 2'}</M>라는 거짓 식이 나옵니다. 세 식이 서로 모순이라는 증거입니다. "해 무수히"는 마지막 행이 통째로 <M>{'0 = 0'}</M>이 되어 사라집니다. 식이 사실상 두 개뿐이라 피벗이 없는 열의 변수 y를 <T en="free variable">자유 변수</T>로 두고, 나머지를 y로 나타냅니다.
      </p>
      <Callout kind="key">
        소거가 끝났을 때 서 있는 피벗의 개수를 행렬의 <T en="rank">계수</T>라고 합니다. 미지수가 n개일 때 계수가 n이면 해가 하나입니다. 계수가 n보다 작으면 해가 없거나(모순 행이 있을 때) 무수히 많습니다(자유 변수가 n − 계수 개). 계수의 기하학적 의미는 다음 장에서 봅니다.
      </Callout>

      <h2>부분 피벗팅: 컴퓨터를 위한 안전장치</h2>
      <p>
        수학적으로는 0만 아니면 무엇이든 피벗이 될 수 있습니다. 그런데 컴퓨터의 실수는 유효숫자가 정해진 <a href={lessonHref('cs-architecture', 'binary')}>부동소수점</a>이라 계산할 때마다 아주 조금씩 반올림됩니다. 0에 가까운 작은 피벗으로 나누면 거대한 배수가 생기고, 작은 반올림 오차가 그 배수만큼 부풀어 답을 망칩니다.
      </p>
      <PivotFigure />
      <p>
        해결책은 간단합니다. 각 열에서 피벗을 고를 때 아래 행들 중 <strong>절댓값이 가장 큰 수</strong>를 골라 그 행을 위로 올립니다. 이것을 <T en="partial pivoting">부분 피벗팅</T>이라고 합니다. 그러면 배수가 늘 1 이하라 오차가 부풀지 않습니다. 그림 2에서 "부분 피벗팅"을 켜면 행 교환이 더 자주 일어나는 것을 볼 수 있습니다. 실제 수치 계산 라이브러리(LAPACK, NumPy의 <code>numpy.linalg.solve</code>)는 모두 이 방식을 씁니다.
      </p>
      <Code label="부분 피벗팅을 쓰는 가우스 소거">{`
// A는 n×n, b는 길이 n. Ax = b의 해를 돌려준다
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]); // 확대행렬
  for (let c = 0; c < n; c++) {
    // 부분 피벗팅: c열에서 절댓값이 가장 큰 행을 찾는다
    let p = c;
    for (let r = c + 1; r < n; r++)
      if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null; // 피벗 없음
    [M[c], M[p]] = [M[p], M[c]];               // 행 교환
    for (let r = c + 1; r < n; r++) {          // 아래 행 소거
      const m = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= m * M[c][k];
    }
  }
  const x = new Array(n).fill(0);              // 후진 대입
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

solve([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3]);
// [2, 3, -1]`}</Code>
      <p>
        세 겹 반복문을 보면 비용을 어림할 수 있습니다. 열 n개마다 아래 행 최대 n개를, 각각 최대 n칸씩 고치니 약 <M>{'n^3/3'}</M>번의 곱셈입니다(<a href={lessonHref('cs-algorithms', 'complexity')}>시간 복잡도</a>로는 <M>{'O(n^3)'}</M>). 미지수 1,000개는 노트북에서 순식간이지만 100만 개라면 이 방법으로는 어림없어서, 0이 대부분인 큰 행렬에는 반복법 같은 다른 기법을 씁니다.
      </p>
      <Callout kind="note">
        같은 A에 대해 우변 b만 바꿔 가며 여러 번 풀어야 할 때가 많습니다. 그럴 때는 소거 과정에서 쓴 배수들을 저장해 두면, 두 번째부터는 소거 없이 <M>{'O(n^2)'}</M>에 풀 수 있습니다. 이렇게 A를 아래 삼각행렬 L(배수들)과 위 삼각행렬 U(계단 모양)의 곱으로 나눠 두는 것을 <T en="LU decomposition">LU 분해</T>라고 합니다. 가우스 소거를 "한 번 하고 재사용할 수 있는 형태"로 저장한 것입니다.
      </Callout>
      <p>
        그림 1의 "식 세 개"처럼 식이 미지수보다 많으면 보통 정확한 해가 없습니다. 실제 데이터는 늘 이렇습니다. 측정값 100개로 직선의 기울기와 절편 2개를 정할 때가 그렇습니다. 이때는 모든 식을 가장 덜 어기는 최소제곱 해를 찾는데, 그 해는 정규방정식 <M>{'A^{\\mathsf T}A\\,\\mathbf x = A^{\\mathsf T}\\mathbf b'}</M>을 가우스 소거로 풀어 얻습니다. 이것이 <a href={lessonHref('ai-basics', 'linear-regression')}>선형 회귀</a>의 계산 방법입니다.
      </p>

      <Callout kind="key">
        연립일차방정식은 <M>{'A\\mathbf x = \\mathbf b'}</M> 한 줄로 적히고, 기하학적으로는 직선이나 평면이 만나는 점을 찾는 일입니다. 해는 하나, 없음, 무수히 많음 셋 중 하나입니다. 가우스 소거는 해를 바꾸지 않는 행 연산으로 계단 모양을 만든 뒤 아래부터 푸는 절차이고, 컴퓨터에서는 가장 큰 수를 피벗으로 고르는 부분 피벗팅이 정확도를 지킵니다.
      </Callout>
      <Quiz
        q={<>미지수 3개짜리 연립방정식을 소거했더니 마지막 행이 <M>{'[\\,0 \\;\\; 0 \\;\\; 0 \\mid 5\\,]'}</M>가 되었다. 옳은 것은?</>}
        options={['z = 5이다', '해가 무수히 많다', '해가 없다', '행을 바꾸면 해가 하나가 된다']}
        answer={2}
        explain={<>그 행은 0x + 0y + 0z = 5, 즉 0 = 5라는 뜻입니다. 어떤 x, y, z도 이 식을 만족할 수 없으니 해가 없습니다. 행 연산은 해를 바꾸지 않으므로 원래 연립방정식에도 해가 없습니다. 마지막 행이 [0 0 0 | 0]이었다면 식 하나가 사라져 해가 무수히 많았을 것입니다.</>}
      />
    </>
  );
}
